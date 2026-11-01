#!/usr/bin/python3
"""Private consistent Mongo dump, uploaded with create-only object permission."""
import datetime, fcntl, json, os, subprocess, tempfile, urllib.request
from pathlib import Path

with open('/run/lock/flock-backup.lock', 'w') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    with tempfile.TemporaryDirectory(prefix='flock-backup-', dir='/srv/flock-data') as directory:
        os.chmod(directory, 0o700)
        temp = Path(directory)
        secrets = json.loads(Path('/etc/flock/private/bootstrap.json').read_text())
        # Config file keeps the password out of argv and process listings.
        (temp / 'config.yml').write_text('password: ' + json.dumps(secrets['mongoBackupPassword']) + '\n')
        os.chmod(temp / 'config.yml', 0o600)
        archive = temp / 'mongo.archive.gz'
        subprocess.run(['mongodump', '--host', 'rs0/127.0.0.1:27017', '--username', 'flock_backup', '--authenticationDatabase', 'admin', '--config', str(temp / 'config.yml'), '--oplog', '--gzip', '--archive=' + str(archive)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        req = urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', headers={'Metadata-Flavor': 'Google'})
        with urllib.request.urlopen(req, timeout=10) as response:
            token = json.load(response)['access_token']
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
        # The initial preview is deliberately small; refuse unbounded in-memory uploads.
        if archive.stat().st_size > 64 * 1024 * 1024:
            raise RuntimeError('Backup exceeded preview upload budget; add streaming uploads before growth.')
        upload = urllib.request.Request('https://storage.googleapis.com/upload/storage/v1/b/theflock-icet-backups/o?uploadType=media&ifGenerationMatch=0&name=' + stamp + '.archive.gz', data=archive.read_bytes(), headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/octet-stream'}, method='POST')
        with urllib.request.urlopen(upload, timeout=120) as response:
            result = json.load(response)
        Path('/var/lib/flock/last-backup.json').write_text(json.dumps({'name': result['name'], 'size': result['size'], 'generation': result['generation'], 'time': stamp})+'\n')
        print('Backup uploaded: ' + result['name'])
