#!/usr/bin/python3
"""Root-owned entrypoint. CI may supply only a commit and approved registry digest."""
import base64, fcntl, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

IMAGE = 'europe-north2-docker.pkg.dev/theflock-icet/flock/app'
BUCKET = 'theflock-icet-releases'
STATE = Path('/var/lib/flock')
RUNTIME = Path('/etc/flock/private/runtime.json')

def run(args, **kw):
    return subprocess.run(args, check=True, text=True, **kw)

def get_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.load(response)

def latest():
    return get_json('https://api.github.com/repos/xLeitix/theflock/git/ref/heads/main', {'User-Agent': 'flock-deploy'})['object']['sha']

def health(revision, attempts=30):
    config = json.loads(RUNTIME.read_text())
    headers = {'X-Flock-Gateway': config['preview']['gatewaySecret'], 'X-Forwarded-Proto': 'https', 'Host': 'theflock.icet-lab.eu'}
    for _ in range(attempts):
        try:
            result = get_json('http://127.0.0.1:4300/health/ready', headers)
            if result.get('ok') and result.get('revision') == revision:
                return True
        except Exception:
            pass
        time.sleep(2)
    return False

def start(image):
    run(['docker', 'run', '-d', '--name', 'flock-app', '--restart', 'unless-stopped',
         '--network', 'host', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
         '--user', '1000:1000', '--memory', '256m', '--memory-swap', '256m', '--pids-limit', '64',
         '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--log-opt', 'max-size=5m', '--log-opt', 'max-file=3',
         '--mount', 'type=bind,src=/etc/flock/private/runtime.json,dst=/run/flock/runtime.json,readonly', image], stdout=subprocess.DEVNULL)

def remove():
    subprocess.run(['docker', 'rm', '-f', 'flock-app'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def atomic_json(path, value):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, sort_keys=True) + '\n')
    os.chmod(temp, 0o600)
    os.replace(temp, path)

def recover():
    if os.geteuid() != 0:
        raise RuntimeError('Recovery requires root.')
    with open('/run/lock/flock-deploy.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        journal = STATE / 'pending.json'
        if not journal.exists():
            return
        previous = json.loads(journal.read_text())['previous']
        remove()
        if previous:
            start(IMAGE + '@' + previous['digest'])
            if not health(previous['revision']):
                raise RuntimeError('Interrupted release recovery failed; proxy must remain stopped.')
        journal.unlink()
        print('Interrupted release recovered before enabling the proxy.')

def deploy(revision, digest):
    if os.geteuid() != 0 or not re.fullmatch('[a-f0-9]{40}', revision) or not re.fullmatch('sha256:[a-f0-9]{64}', digest):
        raise RuntimeError('Expected a valid commit SHA and SHA-256 image digest.')
    with open('/run/lock/flock-deploy.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if latest() != revision:
            print('Superseded commit: skipped; no deployment.')
            return
        if not os.path.ismount('/srv/flock-data') or not Path('/srv/flock-data/.flock-disk').is_file():
            raise RuntimeError('Persistent database disk is unavailable.')
        if shutil.disk_usage('/').free < 1_500_000_000 or shutil.disk_usage('/srv/flock-data').free < 1_000_000_000:
            raise RuntimeError('Insufficient free disk space for a recoverable deployment.')
        if (STATE / 'pending.json').exists():
            raise RuntimeError('Interrupted deployment requires operator recovery; refusing to overwrite its journal.')
        with tempfile.TemporaryDirectory(prefix='flock-release-', dir='/run') as temporary:
            temp = Path(temporary)
            token = get_json('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {'Metadata-Flavor': 'Google'})['access_token']
            record = get_json(f'https://storage.googleapis.com/storage/v1/b/{BUCKET}/o/{revision}%2Feligibility.json?alt=media', {'Authorization': 'Bearer ' + token})
            payload = base64.b64decode(record['payload'], validate=True)
            (temp / 'payload.json').write_bytes(payload)
            (temp / 'signature').write_bytes(base64.b64decode(record['signature'], validate=True))
            run(['openssl', 'dgst', '-sha256', '-verify', '/etc/flock/release-public.pem', '-signature', str(temp / 'signature'), str(temp / 'payload.json')], stdout=subprocess.DEVNULL)
            eligible = json.loads(payload)
            if any(eligible.get(k) != v for k, v in {'revision': revision, 'digest': digest, 'image': IMAGE, 'repositoryId': '1440286900', 'schema': 'community-care-v2', 'mode': 'preview'}.items()):
                raise RuntimeError('Signed eligibility does not match this release.')
            image = IMAGE + '@' + digest
            env = dict(os.environ, DOCKER_CONFIG=str(temp / 'docker'))
            run(['docker', 'login', '-u', 'oauth2accesstoken', '--password-stdin', 'europe-north2-docker.pkg.dev'], input=token, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
            run(['docker', 'pull', image], env=env, stdout=subprocess.DEVNULL)
            inspection = json.loads(run(['docker', 'image', 'inspect', image], capture_output=True).stdout)[0]
            manifest = json.loads(run(['docker', 'manifest', 'inspect', image], env=env, capture_output=True).stdout)
            platform_digest = digest
            if 'manifests' in manifest:
                platforms = [m for m in manifest['manifests'] if m.get('platform', {}).get('os') == 'linux' and m.get('platform', {}).get('architecture') == 'amd64']
                if len(platforms) != 1:
                    raise RuntimeError('Release must contain exactly one Linux amd64 image.')
                platform_digest = platforms[0]['digest']
                manifest = json.loads(run(['docker', 'manifest', 'inspect', IMAGE + '@' + platform_digest], env=env, capture_output=True).stdout)
            config_digest = manifest.get('config', {}).get('digest')
            # Docker's classic store exposes the config digest as Id; its newer
            # containerd store exposes the manifest digest. Verify both identities
            # explicitly instead of treating the store-specific Id as universal.
            if config_digest != eligible['configDigest'] or inspection['Id'] not in {config_digest, platform_digest, digest} or image not in inspection.get('RepoDigests', []) or inspection.get('Architecture') != 'amd64' or inspection.get('Os') != 'linux' or inspection['Config']['Labels'].get('org.opencontainers.image.revision') != revision:
                raise RuntimeError('Pulled image differs from the verified image.')
            if latest() != revision:
                print('Superseded during preflight: skipped; no deployment.')
                return
            previous_path = STATE / 'current.json'
            previous = json.loads(previous_path.read_text()) if previous_path.exists() else None
            if previous and previous.get('revision') == revision and previous.get('digest') == digest and health(revision, 1):
                print('This exact release is already healthy; no change.')
                return
            run(['/usr/local/sbin/flock-backup'], stdout=subprocess.DEVNULL)
            if latest() != revision:
                print('Superseded during backup: skipped; no deployment.')
                return
            atomic_json(STATE / 'pending.json', {'previous': previous, 'candidate': eligible})
            try:
                # Stop gracefully so Mongo transactions drain before removing the container.
                subprocess.run(['docker', 'stop', '--time', '20', 'flock-app'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                remove()
                start(image)
                if not health(revision):
                    raise RuntimeError('Candidate did not become ready.')
                for _ in range(12):
                    time.sleep(5)
                    if not health(revision, 1):
                        raise RuntimeError('Candidate failed the 60-second health window.')
                atomic_json(previous_path, eligible)
                atomic_json(STATE / 'releases' / (revision + '.json'), eligible)
                (STATE / 'pending.json').unlink()
                print('Deployed and healthy: ' + revision)
            except BaseException:
                remove()
                if previous:
                    start(IMAGE + '@' + previous['digest'])
                    if not health(previous['revision']):
                        raise RuntimeError('ROLLBACK FAILED: operator recovery required; journal preserved.')
                    print('Previous release restored and verified.', file=sys.stderr)
                (STATE / 'pending.json').unlink()
                raise

if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--recover']:
            recover()
        elif len(sys.argv) != 3:
            raise RuntimeError('Usage: flock-deploy COMMIT_SHA IMAGE_DIGEST')
        else:
            deploy(sys.argv[1], sys.argv[2])
    except Exception as error:
        print('Deployment failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
