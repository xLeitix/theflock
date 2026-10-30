import {createApp} from './app.ts';
import {connectDatabase,ensureIndexes} from './database.ts';
import {requireSchema} from './migrations.ts';
const {client,db,config}=await connectDatabase();
await ensureIndexes(db);
await requireSchema(db);
const server=createApp({db,client,sessionSecret:config.sessionSecret,origin:config.origin}).listen(4300,'127.0.0.1',()=>console.log('Flock local prototype API ready at http://127.0.0.1:4300 (simulated accounts).'));
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>server.close(()=>client.close().finally(()=>process.exit(0))));
