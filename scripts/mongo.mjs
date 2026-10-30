import { randomBytes } from 'node:crypto';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MongoClient } from 'mongodb';
import { delay, fileExists, isOwned, local, prepareLocal, readJson, requireFreePort, spawnLogged, stopOwned, withLock, writeJson } from './runtime.mjs';

const statePath = join(local, 'mongo-process.json');
const credentialsPath = join(local, 'mongo-credentials.json');
const directUri = 'mongodb://127.0.0.1:27018/?directConnection=true';
const password = () => randomBytes(36).toString('base64url');

function userUri(user, secret, database, direct = false) {
  return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(secret)}@127.0.0.1:27018/${database}?authSource=${database}&${direct ? 'directConnection=true' : 'replicaSet=rs0'}`;
}

async function credentials() {
  let value = await readJson(credentialsPath);
  if (!value) {
    if (await fileExists(join(local, 'mongo', 'WiredTiger'))) {
      throw new Error('Mongo data exists but .local/mongo-credentials.json is missing. Restore its credentials backup; setup will not reset existing data.');
    }
    value = { adminUser: 'flock_local_admin', adminPassword: password(), appUser: 'flock_app', appPassword: password(), testUser: 'flock_test', testPassword: password(), sessionSecret: password(), testSessionSecret: password() };
    await writeJson(credentialsPath, value);
  }
  await writeJson(join(local, 'runtime.json'), {
    mongoUri: userUri(value.appUser, value.appPassword, 'flock_dev'),
    databaseName: 'flock_dev', sessionSecret: value.sessionSecret, origin: 'http://127.0.0.1:4173',
  });
  await writeJson(join(local, 'runtime.test.json'), {
    mongoUri: userUri(value.testUser, value.testPassword, 'flock_test'),
    databaseName: 'flock_test', sessionSecret: value.testSessionSecret, origin: 'http://127.0.0.1:4173',
  });
  return value;
}

async function initialize(value) {
  const anonymous = new MongoClient(directUri, { serverSelectionTimeoutMS: 1_000 });
  const deadline = Date.now() + 40_000;
  let connected = false;
  while (Date.now() < deadline) {
    try { await anonymous.connect(); await anonymous.db('admin').command({ hello: 1 }); connected = true; break; }
    catch { await delay(250); }
  }
  if (!connected) { await anonymous.close(); throw new Error('MongoDB did not start within 40 seconds; inspect .local/mongo.log.'); }
  const adminUri = userUri(value.adminUser, value.adminPassword, 'admin', true);
  let admin = new MongoClient(adminUri, { serverSelectionTimeoutMS: 2_000 });
  try {
    try { await admin.connect(); }
    catch (error) {
      await admin.close();
      if (error.code !== 18) throw error;
      // Mongo's localhost exception permits replica-set setup and the first user
      // only. Authentication is enabled from the first mongod process start.
      const hello = await anonymous.db('admin').command({ hello: 1 });
      if (!hello.setName) {
        await anonymous.db('admin').command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27018' }] } });
      }
      const primaryDeadline = Date.now() + 30_000;
      while (!(await anonymous.db('admin').command({ hello: 1 })).isWritablePrimary) {
        if (Date.now() > primaryDeadline) throw new Error('MongoDB did not become replica-set primary.');
        await delay(250);
      }
      await anonymous.db('admin').command({ createUser: value.adminUser, pwd: value.adminPassword, roles: [{ role: 'root', db: 'admin' }] });
      admin = new MongoClient(adminUri, { serverSelectionTimeoutMS: 5_000 });
      await admin.connect();
    }
    for (const [database, user, secret] of [['flock_dev', value.appUser, value.appPassword], ['flock_test', value.testUser, value.testPassword]]) {
      const { users } = await admin.db(database).command({ usersInfo: user });
      if (!users.length) await admin.db(database).command({ createUser: user, pwd: secret, roles: [{ role: 'readWrite', db: database }] });
    }
    for (const name of ['runtime.json', 'runtime.test.json']) {
      const config = await readJson(join(local, name));
      const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5_000 });
      try { await client.connect(); await client.db(config.databaseName).command({ ping: 1 }); }
      finally { await client.close(); }
    }
  } finally { await anonymous.close(); await admin.close(); }
}

export async function startMongo() {
  return withLock('mongo', async () => {
    await prepareLocal();
    const state = await readJson(statePath);
    const alreadyRunning = await isOwned(state?.identity);
    if (!alreadyRunning) await requireFreePort(27018);
    const value = await credentials();
    if (!alreadyRunning) {
      const candidates = [process.env.FLOCK_MONGOD, '/opt/homebrew/bin/mongod', '/usr/local/bin/mongod', '/usr/bin/mongod'].filter(Boolean);
      let binary;
      for (const path of candidates) if (await fileExists(path)) { binary = path; break; }
      if (!binary) throw new Error('Native mongod was not found. Install MongoDB 7+ or set FLOCK_MONGOD to its absolute executable path.');
      const data = join(local, 'mongo');
      const keyfile = join(local, 'mongo.key');
      await mkdir(data, { recursive: true, mode: 0o700 });
      if (!await fileExists(keyfile)) await writeFile(keyfile, randomBytes(96).toString('base64'), { mode: 0o400 });
      await chmod(keyfile, 0o400);
      const launched = await spawnLogged(binary, [
        '--bind_ip', '127.0.0.1', '--port', '27018', '--replSet', 'rs0', '--auth', '--keyFile', keyfile,
        '--dbpath', data, '--logpath', join(local, 'mongo.log'), '--logappend',
      ], 'mongo-launcher.log', { detached: true });
      launched.child.unref();
      await writeJson(statePath, { identity: launched.identity, port: 27018, data });
    }
    await initialize(value);
    console.log(`MongoDB ready at 127.0.0.1:27018 (authenticated rs0; ${alreadyRunning ? 'reused' : 'started'} owned instance).`);
  });
}

export async function stopMongo() {
  return withLock('mongo', async () => {
    const state = await readJson(statePath);
    const stopped = await stopOwned(state?.identity, 30_000);
    await rm(statePath, { force: true });
    console.log(stopped ? 'Stopped the MongoDB instance owned by this checkout. Data is preserved.' : 'No owned MongoDB process is running.');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const action = process.argv[2] ?? 'start';
  if (!['start', 'stop'].includes(action)) { console.error('Usage: node scripts/mongo.mjs start|stop'); process.exitCode = 1; }
  else await (action === 'start' ? startMongo : stopMongo)().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
