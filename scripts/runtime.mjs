import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { access, chmod, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const local = join(root, '.local');
export const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function prepareLocal() {
  await mkdir(local, { recursive: true, mode: 0o700 });
  await chmod(local, 0o700);
}

export async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

export async function writeJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
  await chmod(path, 0o600);
}

// Never trust a PID alone: a stale state file can point at an unrelated process.
// The start time and full command must still match immediately before signalling.
export async function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 2) return undefined;
  try {
    const { stdout } = await execFileAsync('/bin/ps', ['-ww', '-p', String(pid), '-o', 'lstart=', '-o', 'args=']);
    const fingerprint = stdout.trim();
    return fingerprint ? { pid, fingerprint } : undefined;
  } catch (error) {
    if (error.code === 1) return undefined;
    throw new Error(`Cannot verify process ownership with ps: ${error.message}`);
  }
}

export async function isOwned(identity) {
  if (!identity) return false;
  return (await processIdentity(identity.pid))?.fingerprint === identity.fingerprint;
}

export async function stopOwned(identity, timeout = 15_000) {
  if (!await isOwned(identity)) return false;
  try { process.kill(identity.pid, 'SIGTERM'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; return false; }
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (!await isOwned(identity)) return true;
    await delay(150);
  }
  // Refuse a forced kill: preserve the process/data and surface the failure.
  throw new Error(`Owned process ${identity.pid} did not stop; inspect .local logs before retrying.`);
}

export async function requireFreePort(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`127.0.0.1:${port} is unavailable. No existing service was stopped.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

export async function spawnLogged(command, args, logName, options = {}) {
  const log = await open(join(local, logName), 'a', 0o600);
  const child = spawn(command, args, {
    cwd: root, env: process.env, stdio: ['ignore', log.fd, log.fd], ...options,
  });
  try {
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
  } finally { await log.close(); }
  const identity = await processIdentity(child.pid);
  if (!identity) throw new Error(`${command} exited immediately; inspect .local/${logName}.`);
  return { child, identity };
}

export async function withLock(name, callback) {
  await prepareLocal();
  const path = join(local, `${name}.lock`);
  const token = randomUUID();
  try { await mkdir(path, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    // Never reclaim from a stale observation: another caller might have replaced
    // the old lock before we remove it. Existing locks always fail closed.
    throw new Error(`The ${name} lock already exists (${path}). Check owner.json and process identity; only remove a stale lock manually after confirming no startup/shutdown operation is running.`);
  }
  await writeJson(join(path, 'owner.json'), { token, identity: await processIdentity(process.pid) });
  try { return await callback(); }
  finally {
    if ((await readJson(join(path, 'owner.json')))?.token === token) await rm(path, { recursive: true });
  }
}

export async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}
