import session from 'express-session';
import type {Db,MongoClient} from 'mongodb';
import type {UserDoc} from './models.ts';
declare module 'express-session' {
 interface SessionData {csrfToken:string;userId?:string;authGeneration?:number;absoluteExpiresAt:number}
}
interface SessionDoc {_id:string;session:session.SessionData;expires:Date;revoked?:boolean}
/** Mongo-backed session store with active-user fencing. Generic store set/touch would
 * recreate sessions after account suspension/erasure races (design review F1). */
export class GuardedMongoStore extends session.Store {
 constructor(private db:Db,private client:MongoClient){super();}
 get(id:string,callback:(err:unknown,value?:session.SessionData|null)=>void){
  this.db.collection<SessionDoc>('sessions').findOne({_id:id,expires:{$gt:new Date()},revoked:{$ne:true}}).then(doc=>{
   if(!doc||doc.session.absoluteExpiresAt<=Date.now()) return callback(null,null);
   callback(null,doc.session);
  }).catch(callback);
 }
 set(id:string,value:session.SessionData,callback:((err?:unknown)=>void)=()=>{}){
  const transaction=this.client.startSession();
  transaction.withTransaction(async()=>{
   if(value.absoluteExpiresAt<=Date.now()) throw new Error('SESSION_EXPIRED');
   if(value.userId){
    const result=await this.db.collection<UserDoc>('users').updateOne({_id:value.userId,state:'active',authGeneration:value.authGeneration},{$inc:{writeFence:1}},{session:transaction});
    if(!result.matchedCount) throw new Error('SESSION_REVOKED');
   }
   const expires=new Date(Math.min(Date.now()+86400000,value.absoluteExpiresAt));
   await this.db.collection<SessionDoc>('sessions').updateOne({_id:id,revoked:{$ne:true}},{$set:{session:value,expires}},{upsert:true,session:transaction});
  }).then(()=>callback()).catch(callback).finally(()=>transaction.endSession());
 }
 touch(id:string,value:session.SessionData,callback:((err?:unknown)=>void)=()=>{}){this.set(id,value,callback);}
 destroy(id:string,callback:((err?:unknown)=>void)=()=>{}){this.db.collection<SessionDoc>('sessions').updateOne({_id:id},{$set:{revoked:true,expires:new Date(Date.now()+7*86400000)},$unset:{session:''}},{upsert:true}).then(()=>callback()).catch(callback);}
}
