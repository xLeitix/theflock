import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {PUBLIC_CONTRIBUTION_CONTRACT} from '../packages/contracts/src/index.ts';
import {assertNoLegacyApiListener} from '../apps/api/src/cutover.ts';
import request from 'supertest';
import {ObjectId,type Db,type MongoClient} from 'mongodb';
import type session from 'express-session';
import {createApp} from '../apps/api/src/app.ts';
import {connectDatabase} from '../apps/api/src/database.ts';
import {seedDatabase} from '../apps/api/src/seed.ts';
import {migrateCommunityCare,COMMUNITY_SCHEMA} from '../apps/api/src/migrations.ts';
import {DEMO_IDS,DEMO_DESCRIPTION,type CaseDoc,type FeedingDoc,type PlaceDoc,type UserDoc,type CareEventDoc} from '../apps/api/src/models.ts';
import {GuardedMongoStore} from '../apps/api/src/session-store.ts';
import {calendarDate,recency,stockholmToday} from '../apps/api/src/projections.ts';

let db:Db;let client:MongoClient;let app:ReturnType<typeof createApp>;let secret:string;
const origin='http://127.0.0.1:4173';
const previewOrigin='https://theflock.icet-lab.eu';
const previewConfig={mode:'preview' as const,gatewaySecret:'a'.repeat(48),revision:'1'.repeat(40)};
const collections=['users','places','feedings','careCases','careEvents','idempotency','sessions','migrations'];
before(async()=>{const connection=await connectDatabase('flock_test');({db,client}=connection);secret=connection.config.sessionSecret;assert.equal(db.databaseName,'flock_test');});
after(async()=>{await client?.close();});
beforeEach(async()=>{for(const name of collections)await db.collection(name).deleteMany({});await seedDatabase(db);app=createApp({db,client,sessionSecret:secret,origin});});
async function login(persona:'member'|'member2'|'moderator',target=app){
 const agent=request.agent(target);const bootstrap=await agent.get('/api/v1/session').expect(200);
 const response=await agent.post('/api/v1/dev/login').set('Origin',origin).set('X-CSRF-Token',bootstrap.body.csrfToken).send({persona}).expect(200);
 const cookie=String(response.headers['set-cookie'][0]).split(';')[0]!;const sid=decodeURIComponent(cookie.split('=').slice(1).join('=')).slice(2).split('.')[0]!;
 return {agent,csrf:response.body.csrfToken as string,cookie,sid};
}
type Login=Awaited<ReturnType<typeof login>>;
test('protected preview rejects missing/forged gateway, plaintext and bad hosts before creating sessions',async()=>{
 const target=createApp({db,client,sessionSecret:secret,origin:previewOrigin,preview:previewConfig});
 await request(target).get('/api/v1/session').expect(403);
 await request(target).get('/health/ready').set('X-Flock-Gateway','forged').expect(403);
 await request(target).get('/api/v1/session').set('X-Flock-Gateway',previewConfig.gatewaySecret).expect(400);
 await request(target).get('/api/v1/session').set('X-Flock-Gateway',previewConfig.gatewaySecret).set('X-Forwarded-Proto','https').set('Host','foreign.invalid').expect(421);
 assert.equal(await db.collection('sessions').countDocuments({}),0);
});
test('protected preview uses secure host-only cookies, public revision, strict origin and logout clearing',async()=>{
 const target=createApp({db,client,sessionSecret:secret,origin:previewOrigin,preview:previewConfig});
 const headers={'X-Flock-Gateway':previewConfig.gatewaySecret,'X-Forwarded-Proto':'https',Host:'theflock.icet-lab.eu'};
 const bootstrap=await request(target).get('/api/v1/session').set(headers).expect(200);
 assert.equal(bootstrap.body.mode,'preview');
 const cookieHeader=String(bootstrap.headers['set-cookie'][0]);
 assert.match(cookieHeader,/^__Host-flock.sid=/);assert.match(cookieHeader,/; Secure/);assert.match(cookieHeader,/; HttpOnly/);assert.match(cookieHeader,/SameSite=Lax/);assert.doesNotMatch(cookieHeader,/Domain=/);
 assert.match(bootstrap.headers['content-security-policy'],/frame-ancestors 'none'/);
 const cookie=cookieHeader.split(';')[0]!;
 await request(target).post('/api/v1/dev/login').set(headers).set('Cookie',cookie).set('Origin',origin).set('X-CSRF-Token',bootstrap.body.csrfToken).send({persona:'member'}).expect(403);
 const logged=await request(target).post('/api/v1/dev/login').set(headers).set('Cookie',cookie).set('Origin',previewOrigin).set('X-CSRF-Token',bootstrap.body.csrfToken).send({persona:'member'}).expect(200);
 assert.equal(logged.body.user.displayName,'Alex · demo member');
 const health=await request(target).get('/health/ready').set(headers).expect(200);assert.equal(health.body.revision,previewConfig.revision);
 const logout=await request(target).post('/auth/logout').set(headers).set('Cookie',String(logged.headers['set-cookie'][0]).split(';')[0]!).set('Origin',previewOrigin).set('X-CSRF-Token',logged.body.csrfToken).send({}).expect(200);
 assert.match(String(logout.headers['set-cookie'][0]),/^__Host-flock.sid=;/);assert.match(String(logout.headers['set-cookie'][0]),/; Secure/);
});
test('preview configuration rejects weak gateway secrets and unexpected public origins',()=>{
 assert.throws(()=>createApp({db,client,sessionSecret:secret,origin:previewOrigin,preview:{...previewConfig,gatewaySecret:'weak'}}));
 assert.throws(()=>createApp({db,client,sessionSecret:secret,origin:'https://other.invalid',preview:previewConfig}));
});
function post(auth:Login,path:string,body:object={},key=randomUUID(),version?:number){let req=auth.agent.post(path).set('Origin',origin).set('X-CSRF-Token',auth.csrf).set('Idempotency-Key',key).set('X-Flock-Contract',PUBLIC_CONTRIBUTION_CONTRACT);if(version!==undefined)req=req.set('If-Match',String(version));return req.send(body);}
const placeInput={name:'Test fictional place',longitude:11.9746,latitude:57.7089,publicLocationConfirmed:true};
const careInput={placeId:DEMO_IDS.places[0],issueTypes:['limping'],urgency:'today',birdCount:1,description:'Public fictional observation at this place.'};
const feedingInput={flockBand:'medium',foodTypes:['grain_mix'],comment:'Public fictional feeding comment'};
const claimInput=()=>({plannedDate:stockholmToday(),comment:'I will check on this bird.'});
function barrier(){let release!:()=>void;let entered!:()=>void;const waiting=new Promise<void>(resolve=>{release=resolve;});const reached=new Promise<void>(resolve=>{entered=resolve;});let first=true;return {reached,release,hook:async()=>{if(first){first=false;entered();await waiting;}}};}
async function activity(placeId=DEMO_IDS.places[0] as string){return (await request(app).get(`/api/v1/places/${placeId}/activity`).expect(200)).body;}

test('public feeding and care DTOs expose display names/comments but no account IDs or separate bird coordinates',async()=>{
 const response=await request(app).get('/api/v1/places').expect(200);assert.equal(response.body.places.length,4);assert.equal(response.headers['cache-control'],'no-store');
 const feedings=await request(app).get(`/api/v1/places/${DEMO_IDS.places[0]}/feedings`).expect(200);assert.equal(feedings.body.feedings.length,4);const feeding=feedings.body.feedings[0];assert.equal(feeding.authorDisplayName,'Alex · demo member');assert.equal(feeding.comment,'Fictional demo feeding.');
 assert.deepEqual(Object.keys(feeding).sort(),['authorDisplayName','comment','date','flockBand','foodTypes','id','placeId']);
 const care=(await request(app).get(`/api/v1/care-cases/${DEMO_IDS.cases[0]}`).expect(200)).body.case;assert.equal(care.description,DEMO_DESCRIPTION);assert.equal(care.reporterDisplayName,'Alex · demo member');assert.equal(care.canClaim,false);
 for(const key of ['reporterId','assignedUserId','exactLocation','createdAt','claimExpiresAt'])assert.equal(care[key],undefined);
 await request(app).get(`/api/v1/care-cases/${DEMO_IDS.cases[0]}/private`).expect(404);
});
test('CSRF, strict Origin, unknown personas/roles and unconfirmed public pins reject forged writes',async()=>{
 const auth=await login('member');await auth.agent.post('/api/v1/places').set('Origin',origin).send(placeInput).expect(403);
 await auth.agent.post('/api/v1/places').set('Origin','https://foreign.invalid').set('X-CSRF-Token',auth.csrf).send(placeInput).expect(403);
 await post(auth,'/api/v1/dev/login',{persona:'member',roles:['moderator']}).expect(422);await post(auth,'/api/v1/dev/login',{persona:'helper'}).expect(422);
 await post(auth,'/api/v1/places',{...placeInput,publicLocationConfirmed:false}).expect(422);
 await post(auth,'/api/v1/places',{...placeInput,note:'Old private field'}).expect(422);
 await post(auth,'/api/v1/care-cases',{...careInput,latitude:57.7,longitude:11.9}).expect(422);
 assert.equal(await db.collection('places').countDocuments({}),4);
});
test('place + initial feeding commit once with public comments, replay safely and retain lifetime request uniqueness',async()=>{
 const auth=await login('member');const key=randomUUID();const body={...placeInput,comment:'A public place comment',initialFeeding:feedingInput};
 const first=await post(auth,'/api/v1/places',body,key).expect(201);const again=await post(auth,'/api/v1/places',body,key).expect(201);assert.equal(first.body.place.id,again.body.place.id);assert.equal(first.body.place.comment,body.comment);
 await db.collection('idempotency').deleteMany({});const replay=await post(auth,'/api/v1/places',body,key).expect(201);assert.equal(replay.body.place.id,first.body.place.id);
 await post(auth,'/api/v1/places',{...body,name:'Different payload'},key).expect(409);
 assert.equal(await db.collection('feedings').countDocuments({placeId:first.body.place.id}),1);assert.equal(first.body.place.recency,'recent');
 const log=await activity(first.body.place.id);assert.equal(log.activity[0].comment,feedingInput.comment);
});
test('transaction rolls back place when its initial feeding cannot be inserted',async()=>{
 const auth=await login('member');const key=randomUUID();const collision:FeedingDoc={_id:randomUUID(),placeId:DEMO_IDS.places[0],authorId:DEMO_IDS.member,flockBand:'small',foodTypes:[],comment:'',publicAttribution:true,occurredAt:new Date(),createdAt:new Date(),visibility:'visible',clientRequestId:'/api/v1/places:'+key};await db.collection<FeedingDoc>('feedings').insertOne(collision);
 await post(auth,'/api/v1/places',{...placeInput,initialFeeding:feedingInput},key).expect(503);assert.equal(await db.collection('places').countDocuments({name:placeInput.name}),0);assert.equal(await db.collection('idempotency').countDocuments({key}),0);
});
test('backdated feeding does not replace latest feeding; care activity never changes feeding recency',async()=>{
 const auth=await login('member');const created=await post(auth,'/api/v1/places',placeInput).expect(201);const id=created.body.place.id;
 await post(auth,`/api/v1/places/${id}/feedings`,{...feedingInput,flockBand:'large'}).expect(201);
 await post(auth,`/api/v1/places/${id}/feedings`,{...feedingInput,flockBand:'small',occurredAt:new Date(Date.now()-6*86400000).toISOString()}).expect(201);
 await post(auth,'/api/v1/care-cases',{...careInput,placeId:id}).expect(201);
 const place=(await request(app).get(`/api/v1/places/${id}`).expect(200)).body.place;assert.equal(place.recency,'recent');assert.equal(place.flockBand,'large');
 await post(auth,`/api/v1/places/${id}/feedings`,{...feedingInput,occurredAt:new Date(Date.now()+3600000).toISOString()}).expect(422);
 await post(auth,`/api/v1/places/${id}/feedings`,{...feedingInput,occurredAt:new Date(Date.now()-8*86400000).toISOString()}).expect(422);
 const empty=await post(auth,'/api/v1/places',{...placeInput,name:'Care only place'}).expect(201);
 await post(auth,'/api/v1/care-cases',{...careInput,placeId:empty.body.place.id}).expect(201);assert.equal((await request(app).get(`/api/v1/places/${empty.body.place.id}`)).body.place.recency,'unknown');
});
test('ordinary members make dated commitments; only assignee/reporter/moderator may act on another commitment',async()=>{
 const reporter=await login('member');const carer=await login('member2');const moderator=await login('moderator');const created=await post(reporter,'/api/v1/care-cases',careInput).expect(201);const path=`/api/v1/care-cases/${created.body.case.id}`;
 await post(carer,path+'/claim',{},randomUUID(),1).expect(422);await post(carer,path+'/claim',{plannedDate:'2026-02-30'},randomUUID(),1).expect(422);await post(carer,path+'/claim',{plannedDate:'2000-01-01'},randomUUID(),1).expect(422);
 const claimed=await post(carer,path+'/claim',claimInput(),randomUUID(),1).expect(200);assert.equal(claimed.body.case.assignedDisplayName,'Sam · demo member');assert.equal(claimed.body.case.plannedDate,stockholmToday());assert.equal(claimed.body.case.canResolve,true);
 await post(reporter,path+'/release',{},randomUUID(),2).expect(403);await post(carer,path+'/release',{comment:'I can no longer attend.'},randomUUID(),2).expect(200);
 await post(carer,path+'/claim',claimInput(),randomUUID(),3).expect(200);await post(moderator,path+'/release',{},randomUUID(),4).expect(200);
 await post(carer,path+'/resolve',{comment:'Unassigned user cannot resolve'},randomUUID(),5).expect(403);await post(reporter,path+'/resolve',{comment:'Handled by reporter.'},randomUUID(),5).expect(200);
 await post(carer,path+'/reopen',{comment:'Another observation'},randomUUID(),6).expect(403);
});
test('two normal members race for a claim; exactly one wins',async()=>{
 const one=await login('member');const two=await login('member2');const path=`/api/v1/care-cases/${DEMO_IDS.cases[0]}/claim`;
 const results=await Promise.all([post(one,path,claimInput(),randomUUID(),1),post(two,path,claimInput(),randomUUID(),1)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(await db.collection('careEvents').countDocuments({caseId:DEMO_IDS.cases[0],action:'claim'}),1);
});
test('overdue dated commitments stay assigned until explicit release or resolution',async()=>{
 const auth=await login('member2');const path=`/api/v1/care-cases/${DEMO_IDS.cases[0]}`;await post(auth,path+'/claim',claimInput(),randomUUID(),1).expect(200);
 await db.collection<CaseDoc>('careCases').updateOne({_id:DEMO_IDS.cases[0]},{$set:{plannedDate:'2000-01-01'}});
 const care=(await auth.agent.get(path).expect(200)).body.case;assert.equal(care.state,'claimed');assert.equal(care.overdue,true);assert.equal(care.canResolve,true);
 await post(auth,path+'/resolve',{comment:'Help completed after the planned date.'},randomUUID(),2).expect(200);
});
test('public comments append activity without changing assignment/state and names follow current account data',async()=>{
 const auth=await login('member2');const path=`/api/v1/care-cases/${DEMO_IDS.cases[0]}`;const key=randomUUID();
 await post(auth,path+'/comments',{comment:'A public update from Sam.'},key,1).expect(200);await post(auth,path+'/comments',{comment:'A public update from Sam.'},key,1).expect(200);
 const care=await db.collection<CaseDoc>('careCases').findOne({_id:DEMO_IDS.cases[0]});assert.equal(care?.state,'open');assert.equal(care?.assignedUserId,null);assert.equal(care?.version,2);
 let log=await activity();const entry=log.activity.find((e:any)=>e.comment==='A public update from Sam.');assert.equal(entry.authorDisplayName,'Sam · demo member');assert.equal(entry.care.action,'comment');assert.match(entry.id,/^[0-9a-f-]{36}$/);assert.equal(await db.collection('careEvents').countDocuments({caseId:DEMO_IDS.cases[0],action:'comment'}),1);
 await db.collection<UserDoc>('users').updateOne({_id:DEMO_IDS.member2},{$set:{displayName:'Renamed public member'}});log=await activity();assert.equal(log.activity.find((e:any)=>e.id===entry.id).authorDisplayName,'Renamed public member');
 await db.collection<UserDoc>('users').updateOne({_id:DEMO_IDS.member2},{$set:{state:'deleting'}});log=await activity();assert.equal(log.activity.find((e:any)=>e.id===entry.id).authorDisplayName,'Deleted member');
});
test('immediate resolution creates one resolved report/event atomically and replays without duplicates',async()=>{
 const auth=await login('member');const key=randomUUID();const body={...careInput,resolveImmediately:true,resolutionComment:'Removed the entanglement; bird flew away.'};
 const before=(await request(app).get(`/api/v1/places/${careInput.placeId}`)).body.place.careCount;
 const first=await post(auth,'/api/v1/care-cases',body,key).expect(201);assert.equal(first.body.case.state,'resolved');assert.equal(first.body.case.canClaim,false);
 const replay=await post(auth,'/api/v1/care-cases',body,key).expect(201);assert.equal(replay.body.case.id,first.body.case.id);
 const events=await db.collection<CareEventDoc>('careEvents').find({caseId:first.body.case.id}).toArray();assert.equal(events.length,1);assert.equal(events[0]?.action,'reported_resolved');assert.equal(events[0]?.comment,body.resolutionComment);
 assert.equal((await request(app).get(`/api/v1/places/${careInput.placeId}`)).body.place.careCount,before);
});
test('immediate resolution rolls back the report if its event fails',async()=>{
 const auth=await login('member');await db.collection('careEvents').createIndex({actorId:1},{name:'test_atomic_care_event',unique:true,partialFilterExpression:{action:'reported_resolved'}});
 try {const count=await db.collection('careCases').countDocuments({});await post(auth,'/api/v1/care-cases',{...careInput,resolveImmediately:true}).expect(503);assert.equal(await db.collection('careCases').countDocuments({}),count);}
 finally {await db.collection('careEvents').dropIndex('test_atomic_care_event');}
});
test('resolve/reopen requires versions and a fresh observation; retired legacy cases cannot reopen',async()=>{
 const auth=await login('member');const path=`/api/v1/care-cases/${DEMO_IDS.cases[0]}`;
 await post(auth,path+'/resolve').expect(428);await post(auth,path+'/resolve',{},randomUUID(),9).expect(412);await post(auth,path+'/resolve',{},randomUUID(),1).expect(200);
 await post(auth,path+'/reopen',{},randomUUID(),2).expect(422);await post(auth,path+'/reopen',{comment:'Still observed here today'},randomUUID(),2).expect(200);
 await post(auth,path+'/resolve',{},randomUUID(),3).expect(200);await db.collection<CaseDoc>('careCases').updateOne({_id:DEMO_IDS.cases[0]},{$set:{detailsState:'purged'}});
 await post(auth,path+'/reopen',{comment:'Observed again'},randomUUID(),4).expect(410);assert.equal((await auth.agent.get(path)).body.case.canReopen,false);
});
test('hidden parent or hidden case removes children/activity, new writes and replays',async()=>{
 const auth=await login('member');const key=randomUUID();await post(auth,`/api/v1/places/${DEMO_IDS.places[0]}/feedings`,feedingInput,key).expect(201);
 await db.collection<CaseDoc>('careCases').updateOne({_id:DEMO_IDS.cases[0]},{$set:{visibility:'hidden'}});assert.equal((await activity()).activity.some((e:any)=>e.care?.caseId===DEMO_IDS.cases[0]),false);await request(app).get(`/api/v1/care-cases/${DEMO_IDS.cases[0]}`).expect(404);
 await db.collection<PlaceDoc>('places').updateOne({_id:DEMO_IDS.places[0]},{$set:{visibility:'hidden'},$inc:{visibilityVersion:1}});
 for(const suffix of ['','/feedings','/care-cases','/activity'])await request(app).get(`/api/v1/places/${DEMO_IDS.places[0]}${suffix}`).expect(404);
 await post(auth,`/api/v1/places/${DEMO_IDS.places[0]}/feedings`,feedingInput,key).expect(404);await post(auth,`/api/v1/places/${DEMO_IDS.places[0]}/feedings`,feedingInput).expect(404);
});
test('activity filters hidden cases before limiting and reports truthful hasMore',async()=>{
 const seed=await db.collection<CareEventDoc>('careEvents').findOne({caseId:DEMO_IDS.cases[0]});assert.ok(seed);
 await db.collection<CaseDoc>('careCases').updateOne({_id:DEMO_IDS.cases[0]},{$set:{visibility:'hidden'}});
 const events=Array.from({length:60},()=>{const id=randomUUID();return {...seed!,_id:id,publicId:id,createdAt:new Date(Date.now()+1000)}});await db.collection<CareEventDoc>('careEvents').insertMany(events);
 let log=await activity();assert.equal(log.activity.length,4);assert.equal(log.hasMore,false);
 const feeding=await db.collection<FeedingDoc>('feedings').findOne({placeId:DEMO_IDS.places[0]});assert.ok(feeding);
 await db.collection<FeedingDoc>('feedings').insertMany(Array.from({length:52},(_,i)=>({...feeding!,_id:randomUUID(),occurredAt:new Date(Date.now()-i*1000)})));
 log=await activity();assert.equal(log.activity.length,50);assert.equal(log.hasMore,true);assert.ok(log.activity.every((e:any)=>e.kind==='feeding'));
});
test('account revocation committed after request authorization prevents a new contribution',async()=>{
 const gate=barrier();const guarded=createApp({db,client,sessionSecret:secret,origin,hooks:{beforeActorFence:gate.hook}});const auth=await login('member',guarded);
 const pending=post(auth,'/api/v1/places',placeInput).then(response=>response);await gate.reached;await db.collection<UserDoc>('users').updateOne({_id:DEMO_IDS.member},{$set:{state:'suspended'},$inc:{authGeneration:1,writeFence:1}});gate.release();assert.equal((await pending).status,401);assert.equal(await db.collection('places').countDocuments({name:placeInput.name}),0);
});
test('parent hide committed after transaction reads causes retry and rejects publication',async()=>{
 const gate=barrier();const guarded=createApp({db,client,sessionSecret:secret,origin,hooks:{beforeParentFence:gate.hook}});const auth=await login('member',guarded);
 const pending=post(auth,`/api/v1/places/${DEMO_IDS.places[0]}/feedings`,feedingInput).then(response=>response);await gate.reached;await db.collection<PlaceDoc>('places').updateOne({_id:DEMO_IDS.places[0]},{$set:{visibility:'hidden'},$inc:{visibilityVersion:1,writeFence:1}});gate.release();assert.equal((await pending).status,404);assert.equal(await db.collection('feedings').countDocuments({comment:feedingInput.comment}),0);
});
test('Mongo sessions survive app recreation; logout tombstones prevent stale touch resurrection',async()=>{
 const auth=await login('member');const saved=await db.collection<{_id:string;session:session.SessionData}>('sessions').findOne({_id:auth.sid});assert.ok(saved);
 const restarted=createApp({db,client,sessionSecret:secret,origin});assert.equal((await request(restarted).get('/api/v1/session').set('Cookie',auth.cookie).expect(200)).body.user.id,DEMO_IDS.member);
 await post(auth,'/auth/logout').expect(200);const store=app.locals.sessionStore as GuardedMongoStore;await assert.rejects(new Promise<void>((resolve,reject)=>store.touch(auth.sid,saved!.session,error=>error?reject(error):resolve())));assert.equal((await request(restarted).get('/api/v1/session').set('Cookie',auth.cookie)).body.user,null);
});
test('session absolute expiry is enforced before TTL cleanup',async()=>{
 const auth=await login('member');await db.collection<{_id:string}>('sessions').updateOne({_id:auth.sid},{$set:{'session.absoluteExpiresAt':Date.now()-1}});assert.equal((await auth.agent.get('/api/v1/session').expect(200)).body.user,null);
});
test('Stockholm dates and feeding recency boundaries remain explicit',()=>{
 const now=Date.UTC(2026,9,30);assert.equal(recency(null,now),'unknown');assert.equal(recency(new Date(now-48*3600000),now),'recent');assert.equal(recency(new Date(now-48*3600000-1),now),'due');assert.equal(recency(new Date(now-96*3600000),now),'due');assert.equal(recency(new Date(now-96*3600000-1),now),'overdue');assert.equal(calendarDate(new Date('2026-10-29T23:30:00Z')),'2026-10-30');
});
test('prototype refuses production, non-loopback hosts and an unmigrated database',async()=>{
 await request(app).get('/api/v1/places').set('Host','attacker.invalid').expect(421);const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';try{assert.throws(()=>createApp({db,client,sessionSecret:secret,origin}),/cannot run in production/);}finally{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
 await db.collection('migrations').deleteMany({});await request(app).get('/api/v1/places').expect(503);await request(app).get('/health/ready').expect(503);
});
test('bounded geospatial query returns truthful hasMore',async()=>{
 const result=await request(app).get('/api/v1/places?bbox=11.88,57.69,11.96,57.74&limit=2').expect(200);assert.equal(result.body.places.length,2);assert.equal(result.body.hasMore,true);await request(app).get('/api/v1/places?bbox=10,50,14,60').expect(422);
});
test('committed feeding replay survives moving observation cutoff',async()=>{
 const realNow=Date.now;let now=realNow();Date.now=()=>now;try{const auth=await login('member');const occurredAt=new Date(now-7*86400000+1000).toISOString();const body={...placeInput,initialFeeding:{...feedingInput,occurredAt}};const key=randomUUID();const first=await post(auth,'/api/v1/places',body,key).expect(201);const path=`/api/v1/places/${first.body.place.id}/feedings`;const fKey=randomUUID();const fBody={...feedingInput,occurredAt};const feeding=await post(auth,path,fBody,fKey).expect(201);now+=2000;assert.equal((await post(auth,'/api/v1/places',body,key).expect(201)).body.place.id,first.body.place.id);assert.equal((await post(auth,path,fBody,fKey).expect(201)).body.feeding.id,feeding.body.feeding.id);await post(auth,'/api/v1/places',body).expect(422);await post(auth,path,fBody).expect(422);}finally{Date.now=realNow;}
});
function imminentMidnight(){const day=calendarDate(new Date());let t=Math.floor(Date.now()/60000)*60000;while(calendarDate(new Date(t))===day)t+=60000;return t-1000;}
test('planned date is rechecked after a fence wait crossing Stockholm midnight',async()=>{
 const realNow=Date.now;let now=imminentMidnight();Date.now=()=>now;const gate=barrier();try{const guarded=createApp({db,client,sessionSecret:secret,origin,hooks:{beforeParentFence:gate.hook}});const auth=await login('member',guarded);const pending=post(auth,`/api/v1/care-cases/${DEMO_IDS.cases[0]}/claim`,claimInput(),randomUUID(),1).then(r=>r);await gate.reached;now+=2000;gate.release();assert.equal((await pending).status,422);const care=await db.collection<CaseDoc>('careCases').findOne({_id:DEMO_IDS.cases[0]});assert.equal(care?.state,'open');assert.equal(care?.version,1);}finally{gate.release();Date.now=realNow;}
});
test('dated claim replay remains valid after its planned date passes',async()=>{
 const realNow=Date.now;let now=imminentMidnight();Date.now=()=>now;try{const auth=await login('member');const body=claimInput();const key=randomUUID();const path=`/api/v1/care-cases/${DEMO_IDS.cases[0]}/claim`;await post(auth,path,body,key,1).expect(200);now+=2000;const replay=await post(auth,path,body,key,1).expect(200);assert.equal(replay.body.case.overdue,true);assert.equal(await db.collection('careEvents').countDocuments({caseId:DEMO_IDS.cases[0],action:'claim'}),1);}finally{Date.now=realNow;}
});
test('legacy migration requires explicit cutover, withholds old text/attribution, preserves terminal cases and is repeat-safe',async()=>{
 const oldSession=await login('member2');await db.collection('migrations').deleteMany({});
 await db.collection<any>('users').updateOne({_id:DEMO_IDS.member2},{$set:{roles:['member','approved_helper'],displayName:'Sam · demo helper'}});
 const legacyFeedingId=randomUUID();await db.collection<FeedingDoc>('feedings').insertOne({_id:legacyFeedingId,placeId:DEMO_IDS.places[0],authorId:DEMO_IDS.member,flockBand:'small',foodTypes:[],note:'SECRET OLD FEEDING',visibility:'visible',createdAt:new Date(),occurredAt:new Date()});
 const legacyIds:string[]=[];
 for(const [i,status] of ['purged','purge_pending','expired','future'].entries()){
  const id=randomUUID();legacyIds.push(id);await db.collection<any>('careCases').insertOne({_id:id,placeId:DEMO_IDS.places[0],reporterId:DEMO_IDS.member,issueTypes:['limping'],urgency:'today',state:status==='future'?'claimed':'resolved',version:1,visibility:'visible',description:'SECRET OLD CASE',exactLocation:{type:'Point',coordinates:[11.9,57.7]},birdCount:1,assignedHelperId:DEMO_IDS.member2,claimExpiresAt:new Date(Date.now()+7200000),claimParentVersion:1,privateDataState:status==='purged'||status==='purge_pending'?status:'retained',purgeDueAt:new Date(Date.now()+(status==='future'?86400000:-1000)),createdAt:new Date(),updatedAt:new Date()});
  await db.collection<any>('careEvents').insertOne({_id:new ObjectId(),caseId:id,actorId:DEMO_IDS.member,action:'resolve',reason:'SECRET OLD REASON',createdAt:new Date()});
 }
 await assert.rejects(migrateCommunityCare(db),/quiesced cutover/);await migrateCommunityCare(db,{allowLegacyCutover:true});
 const converted=await db.collection<CaseDoc>('careCases').find({_id:{$in:legacyIds}}).sort({_id:1}).toArray();for(const id of legacyIds.slice(0,3)){const care=converted.find(c=>c._id===id)!;assert.equal(care.detailsState,'purged');}
 const active=converted.find(c=>c._id===legacyIds[3])!;assert.equal(active.detailsState,'retained');assert.equal(active.state,'open');assert.equal(active.plannedDate,null);
 assert.ok(converted.every(c=>!('exactLocation' in c)&&c.publicDescription===''));
 const log=await activity();assert.equal(JSON.stringify(log).includes('SECRET'),false);assert.equal(log.activity.find((e:any)=>e.id===legacyFeedingId).authorDisplayName,'Community member');
 assert.equal((await oldSession.agent.get('/api/v1/session')).body.user,null);
 const auth=await login('member');for(const id of legacyIds.slice(0,3))await post(auth,`/api/v1/care-cases/${id}/reopen`,{comment:'Fresh observation'},randomUUID(),2).expect(410);
 await post(auth,`/api/v1/care-cases/${legacyIds[3]}/claim`,claimInput(),randomUUID(),2).expect(200);
 const snapshot=JSON.stringify(await db.collection<CaseDoc>('careCases').find({_id:{$in:legacyIds}}).sort({_id:1}).toArray());await migrateCommunityCare(db,{allowLegacyCutover:true});assert.equal(JSON.stringify(await db.collection<CaseDoc>('careCases').find({_id:{$in:legacyIds}}).sort({_id:1}).toArray()),snapshot);
 assert.equal(await db.collection('careEvents').countDocuments({publicId:{$type:'string'}}),await db.collection('careEvents').countDocuments({}));
 assert.equal(await db.collection<{_id:string;status:string}>('migrations').countDocuments({_id:COMMUNITY_SCHEMA,status:'complete'}),1);
});
test('seed reruns preserve all16 feeding timestamps and do not duplicate care events',async()=>{
 const before=JSON.stringify(await db.collection('feedings').find({}).sort({_id:1}).toArray());const events=await db.collection('careEvents').countDocuments({});await seedDatabase(db);assert.equal(await db.collection('feedings').countDocuments({}),16);assert.equal(JSON.stringify(await db.collection('feedings').find({}).sort({_id:1}).toArray()),before);assert.equal(await db.collection('careEvents').countDocuments({}),events);
});

test('old-browser contribution with valid unchanged session/CSRF must acknowledge the public contract',async()=>{
 const auth=await login('member');const path=`/api/v1/places/${DEMO_IDS.places[0]}/feedings`;const body={flockBand:'small',foodTypes:[]};const count=await db.collection('feedings').countDocuments({});
 for(const version of [undefined,'anonymous-v1']){
  let req=auth.agent.post(path).set('Origin',origin).set('X-CSRF-Token',auth.csrf).set('Idempotency-Key',randomUUID());if(version)req=req.set('X-Flock-Contract',version);
  const response=await req.send(body).expect(409);assert.equal(response.body.error.code,'CLIENT_UPDATE_REQUIRED');
 }
 assert.equal(await db.collection('feedings').countDocuments({}),count);await post(auth,path,body).expect(201);assert.equal(await db.collection('feedings').countDocuments({}),count+1);
});
test('cutover listener guard refuses an active API port and accepts a stopped listener',async()=>{
 const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');
 try {await assert.rejects(assertNoLegacyApiListener(address.port),/Refusing schema cutover/);}finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
 await assertNoLegacyApiListener(address.port);
});
