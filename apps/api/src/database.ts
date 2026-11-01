import { readFile } from 'node:fs/promises';
import { MongoClient, type Db } from 'mongodb';
import {validatePreview,type PreviewConfig} from './preview.ts';
import type { PlaceDoc, FeedingDoc, CaseDoc, UserDoc, IdempotencyDoc } from './models.ts';
export interface RuntimeConfig { mongoUri:string; databaseName:string; sessionSecret:string; origin:string;preview?:PreviewConfig }
export function assertLocalConfig(config:RuntimeConfig) {
 if (process.env.NODE_ENV === 'production') throw new Error('The simulated-login prototype cannot run in production.');
 const uri = new URL(config.mongoUri);
 if(uri.protocol !== 'mongodb:' || !['127.0.0.1','localhost'].includes(uri.hostname) || uri.port !== '27018') throw new Error('Prototype MongoDB must use loopback port 27018.');
 if(!['flock_dev','flock_test'].includes(config.databaseName)) throw new Error('Only disposable flock_dev or flock_test databases are allowed.');
 if(config.origin !== 'http://127.0.0.1:4173' || config.sessionSecret.length < 32) throw new Error('Invalid local origin or session secret.');
}
export async function connectDatabase(databaseName?:'flock_dev'|'flock_test') {
 const config:RuntimeConfig = JSON.parse(await readFile(process.env.FLOCK_RUNTIME_FILE??new URL(databaseName === 'flock_test' ? '../../../.local/runtime.test.json' : '../../../.local/runtime.json', import.meta.url),'utf8'));
 if(databaseName) config.databaseName=databaseName;
 if(config.preview&&process.env.FLOCK_REVISION)config.preview.revision=process.env.FLOCK_REVISION;
 if(config.preview){
  validatePreview(config.preview,config.origin);
  const uri=new URL(config.mongoUri);
  if(databaseName||config.databaseName!=='flock_preview'||uri.protocol!=='mongodb:'||uri.hostname!=='127.0.0.1'||!['27017','27018'].includes(uri.port)||!uri.username||!uri.password||config.sessionSecret.length<43)throw new Error('Invalid preview database boundary.');
 }else assertLocalConfig(config);
 const client=new MongoClient(config.mongoUri,{serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,maxPoolSize:config.preview?5:15});
 await client.connect();
 const db=client.db(config.databaseName);
 const hello=await db.command({hello:1});
 if(hello.setName !== 'rs0' || !hello.isWritablePrimary) {await client.close();throw new Error('A writable local rs0 replica set is required.');}
 return {client,db,config};
}
export async function ensureIndexes(db:Db) {
 await db.collection<UserDoc>('users').createIndex({state:1});
 await db.collection<PlaceDoc>('places').createIndexes([{key:{location:'2dsphere'}},{key:{searchName:1}},{key:{creatorId:1,clientRequestId:1},unique:true,partialFilterExpression:{clientRequestId:{$type:'string'}}}]);
 await db.collection<FeedingDoc>('feedings').createIndexes([{key:{placeId:1,occurredAt:-1,_id:-1}},{key:{authorId:1,clientRequestId:1},unique:true,partialFilterExpression:{clientRequestId:{$type:'string'}}}]);
 await db.collection<CaseDoc>('careCases').createIndexes([{key:{placeId:1,state:1,createdAt:-1}},{key:{reporterId:1,clientRequestId:1},unique:true,partialFilterExpression:{clientRequestId:{$type:'string'}}}]);
 await db.collection('careEvents').createIndexes([{key:{caseId:1,createdAt:1}},{key:{placeId:1,createdAt:-1,publicId:-1}},{key:{publicId:1},unique:true,partialFilterExpression:{publicId:{$type:'string'}}}]);
 await db.collection<IdempotencyDoc>('idempotency').createIndexes([{key:{actorId:1,route:1,key:1},unique:true},{key:{expiresAt:1},expireAfterSeconds:0}]);
 await db.collection('sessions').createIndex({expires:1},{expireAfterSeconds:0});
}
