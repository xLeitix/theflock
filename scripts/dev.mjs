import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { startMongo, stopMongo } from './mongo.mjs';
import { delay, fileExists, isOwned, local, prepareLocal, processIdentity, readJson, requireFreePort, root, spawnLogged, stopOwned, withLock, writeJson } from './runtime.mjs';

const statePath = join(local, 'app-processes.json');
const tsx = join(root, 'node_modules/tsx/dist/cli.mjs');
const vite = join(root, 'node_modules/vite/bin/vite.js');

async function ready() {
  try {
    const responses = await Promise.all([
      fetch('http://127.0.0.1:4300/health/ready', { signal: AbortSignal.timeout(1_500) }),
      fetch('http://127.0.0.1:4173', { signal: AbortSignal.timeout(1_500) }),
    ]);
    return responses.every((response) => response.ok);
  } catch { return false; }
}

async function waitReady(identity) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (!await isOwned(identity)) throw new Error('Application launcher exited. Inspect .local/dev.log and .local/api.log.');
    if (await ready()) return;
    await delay(300);
  }
  throw new Error('Application did not become ready within 45 seconds. Inspect .local/api.log and .local/web.log.');
}

async function seed() {
  const { child } = await spawnLogged(process.execPath, [tsx, 'apps/api/src/seed-cli.ts'], 'seed.log');
  const status = await new Promise((resolve) => {
    if (child.exitCode !== null) resolve(child.exitCode);
    else child.once('exit', (code) => resolve(code));
  });
  if (status !== 0) throw new Error('Database seed failed. Inspect .local/seed.log.');
}

async function clearOwnedState(token) {
  if ((await readJson(statePath))?.token === token) await rm(statePath, { force: true });
}

async function stopApp() {
  const state = await readJson(statePath);
  if (!state) return;
  await stopOwned(state.supervisor, 25_000);
  // Recover child processes if the supervisor was interrupted previously.
  for (const identity of Object.values(state.children ?? {})) await stopOwned(identity);
  await clearOwnedState(state.token);
}

async function start() {
  await withLock('app', async () => {
    if (!await fileExists(tsx) || !await fileExists(vite)) throw new Error('Dependencies are missing. Run npm install first.');
    const existing = await readJson(statePath);
    if (await isOwned(existing?.supervisor)) {
      await waitReady(existing.supervisor);
      console.log('Flock is already running at http://127.0.0.1:4173');
      return;
    }
    if (existing) await stopApp();
    await requireFreePort(4300);
    await requireFreePort(4173);
    await startMongo();
    await seed();
    const token = randomUUID();
    const { child, identity } = await spawnLogged(process.execPath, [join(root, 'scripts/dev.mjs'), 'supervise', token], 'dev.log', { detached: true });
    child.unref();
    try { await waitReady(identity); }
    catch (error) { await stopOwned(identity, 25_000); throw error; }
    console.log('Flock is ready at http://127.0.0.1:4173');
    console.log('Demo sign-in: two ordinary members or a moderator; no password or Facebook connection.');
    console.log('Services run in the background. Stop with npm run dev:stop. Logs: .local/{api,web,mongo,dev}.log');
  });
}

async function supervise(token) {
  if (!/^[0-9a-f-]{36}$/.test(token ?? '')) throw new Error('Internal launcher requires a unique instance token.');
  await prepareLocal();
  const state = { token, supervisor: await processIdentity(process.pid), children: {} };
  await writeJson(statePath, state);
  let stopping = false;
  let failed = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      for (const identity of Object.values(state.children)) await stopOwned(identity);
      await clearOwnedState(token);
      process.exitCode = failed ? 1 : 0;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  };
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => { void stop(); });
  try {
    for (const [name, args] of [
      ['api', [tsx, 'apps/api/src/index.ts']],
      ['web', [vite, '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', '4173', '--strictPort']],
    ]) {
      if (stopping) break;
      const launched = await spawnLogged(process.execPath, args, `${name}.log`);
      // A stop signal may arrive while spawn/ownership discovery is pending.
      if (stopping) { await stopOwned(launched.identity); break; }
      state.children[name] = launched.identity;
      await writeJson(statePath, state);
      const exited = (code, signal) => {
        if (!stopping) {
          failed = true;
          console.error(`${name} exited unexpectedly (${code ?? signal}). Stopping application services.`);
          void stop();
        }
      };
      launched.child.once('exit', exited);
      if (launched.child.exitCode !== null || launched.child.signalCode !== null) exited(launched.child.exitCode, launched.child.signalCode);
    }
  } catch (error) {
    console.error(error.message);
    failed = true;
    await stop();
  }
}

const action = process.argv[2] ?? 'start';
try {
  if (['start', '--detach'].includes(action)) await start();
  else if (action === 'stop') await withLock('app', async () => { await stopApp(); await stopMongo(); console.log('Flock stopped. Persistent data remains in .local/mongo.'); });
  else if (action === 'supervise') await supervise(process.argv[3]);
  else throw new Error('Usage: node scripts/dev.mjs [start|--detach|stop]');
} catch (error) { console.error(error.message); process.exitCode = 1; }
