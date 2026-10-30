import express, {type Request,type Response,type NextFunction} from 'express';
import session from 'express-session';
import helmet from 'helmet';
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {type Db,type MongoClient,type ClientSession,type Filter,MongoServerError} from 'mongodb';
import {z,ZodError} from 'zod';
import type {CaseDoc,CareEventDoc,FeedingDoc,IdempotencyDoc,PlaceDoc,UserDoc} from './models.ts';
import {DEMO_IDS} from './models.ts';
import {GuardedMongoStore} from './session-store.ts';
import {actionSchema,claimSchema,commentSchema,careSchema,feedingSchema,placeSchema} from './validation.ts';
import {requireSchema} from './migrations.ts';
import {PUBLIC_CONTRIBUTION_CONTRACT,type CareAction} from '../../../packages/contracts/src/index.ts';
import {detailsRetained,effectiveState,isModerator,publicActivity,publicCase,publicFeeding,publicPlace,publicUser,stockholmToday} from './projections.ts';

declare global {namespace Express {interface Request {viewer:UserDoc|null;requestId:string}}}
export class ApiError extends Error {constructor(public status:number,public code:string,message:string,public fields?:Record<string,string>){super(message);}}
const fail=(status:number,code:string,message:string):never=>{throw new ApiError(status,code,message);};
const notFound=():never=>fail(404,'NOT_FOUND','This record is unavailable.');
const day=86400000;
function canonical(value:unknown):string {if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';return JSON.stringify(value);}
const digest=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const equalToken=(a:string,b:string)=>Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function versionHeader(req:Request){const value=req.get('If-Match');if(!value)fail(428,'VERSION_REQUIRED','Refresh this case before making changes.');const clean=value!.replace(/^"|"$/g,'');if(!/^[1-9]\d*$/.test(clean))fail(400,'INVALID_VERSION','If-Match must contain a case version.');return Number(clean);}
function observedTime(value:string|undefined){const now=Date.now();const date=value?new Date(value):new Date(now);if(date.getTime()<now-7*day||date.getTime()>now+300000)fail(422,'INVALID_OBSERVATION_TIME','Feeding time must be within seven days and not in the future.');return new Date(Math.min(date.getTime(),now));}
interface AppOptions {db:Db;client:MongoClient;sessionSecret:string;origin:string;hooks?:{beforeActorFence?:()=>Promise<void>;beforeParentFence?:(placeId:string)=>Promise<void>}}
interface MutationResult {resourceId:string;kind:'place'|'feeding'|'case';status:number}
export function createApp({db,client,sessionSecret,origin,hooks}:AppOptions){
 if(process.env.NODE_ENV==='production')throw new Error('The simulated-login prototype cannot run in production.');
 if(origin!=='http://127.0.0.1:4173'||sessionSecret.length<32)throw new Error('Prototype requires its loopback origin and a strong session secret.');
 const app=express();app.disable('x-powered-by');
 app.use((req,res,next)=>{if(!['127.0.0.1','localhost'].includes(req.hostname))return res.status(421).json({error:{code:'HOST_REJECTED',message:'Use the local prototype address.'}});next();});
 app.use(helmet({contentSecurityPolicy:false,strictTransportSecurity:false}));
 app.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.set('Permissions-Policy','camera=(), microphone=(), geolocation=(self)');next();});
 app.get('/health/live',(_req,res)=>res.json({ok:true,prototype:true}));
 app.get('/health/ready',async(_req,res)=>{try {await requireSchema(db);const hello=await db.command({hello:1},{timeoutMS:2000});res.status(hello.isWritablePrimary&&hello.setName==='rs0'?200:503).json({ok:!!hello.isWritablePrimary&&hello.setName==='rs0',database:'mongodb',prototype:true});}catch{res.status(503).json({ok:false,database:'unavailable',prototype:true});}});
 app.use((req,_res,next)=>{req.requestId=randomUUID();next();});
 app.use(async(_req,_res,next)=>{try{await requireSchema(db);next();}catch{next(new ApiError(503,'SCHEMA_NOT_READY','The local database requires its reviewed schema migration.'));}});
 app.use(express.json({limit:'32kb'}));
 const store=new GuardedMongoStore(db,client);app.locals.sessionStore=store;
 app.use(session({name:'flock.dev.sid',secret:sessionSecret,store,resave:false,saveUninitialized:false,rolling:true,cookie:{httpOnly:true,sameSite:'lax',secure:false,path:'/',maxAge:600000}}));
 app.use(async(req,_res,next)=>{
  req.viewer=null;
  if(!req.session.absoluteExpiresAt)req.session.absoluteExpiresAt=Date.now()+600000;
  if(!req.session.csrfToken)req.session.csrfToken=randomBytes(32).toString('hex');
  if(req.session.userId){
   req.viewer=await db.collection<UserDoc>('users').findOne({_id:req.session.userId,state:'active',authGeneration:req.session.authGeneration});
   if(!req.viewer){await new Promise<void>((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));req.session.absoluteExpiresAt=Date.now()+600000;req.session.csrfToken=randomBytes(32).toString('hex');}
  }
  next();
 });
 app.use((req,_res,next)=>{
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  if(req.get('Origin')!==origin||req.get('Sec-Fetch-Site')==='cross-site')return next(new ApiError(403,'ORIGIN_REJECTED','This request must come from the local prototype.'));
  const token=req.get('X-CSRF-Token');
  if(!token||!equalToken(token,req.session.csrfToken??''))return next(new ApiError(403,'CSRF_REJECTED','Refresh the page before trying again.'));
  if(!req.is('application/json'))return next(new ApiError(415,'JSON_REQUIRED','Send this request as JSON.'));
  if(!['/api/v1/dev/login','/auth/logout'].includes(req.path)&&req.get('X-Flock-Contract')!==PUBLIC_CONTRIBUTION_CONTRACT)return next(new ApiError(409,'CLIENT_UPDATE_REQUIRED','Reload Flock before contributing: display names and comments are now public.'));
  next();
 });
 const sessionResponse=(req:Request)=>({user:req.viewer?publicUser(req.viewer):null,csrfToken:req.session.csrfToken,prototype:true});
 app.get('/api/v1/session',(req,res)=>res.json(sessionResponse(req)));
 app.post('/api/v1/dev/login',async(req,res)=>{
  const {persona}=z.object({persona:z.enum(['member','member2','moderator'])}).strict().parse(req.body);
  const user=await db.collection<UserDoc>('users').findOne({_id:DEMO_IDS[persona],state:'active'});if(!user)fail(403,'ACCOUNT_UNAVAILABLE','This demo account is unavailable.');
  await new Promise<void>((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));
  req.session.userId=user!._id;req.session.authGeneration=user!.authGeneration;req.session.cookie.maxAge=day;req.session.absoluteExpiresAt=Date.now()+7*day;req.session.csrfToken=randomBytes(32).toString('hex');req.viewer=user;
  await new Promise<void>((resolve,reject)=>req.session.save(err=>err?reject(err):resolve()));
  res.json(sessionResponse(req));
 });
 app.post('/auth/logout',async(req,res)=>{await new Promise<void>((resolve,reject)=>req.session.destroy(err=>err?reject(err):resolve()));res.clearCookie('flock.dev.sid',{path:'/'}).json({ok:true});});
 app.get('/api/v1/emergency-contacts',(_req,res)=>res.json({contacts:[],region:'Gothenburg'}));

 async function placeById(id:string,transaction?:ClientSession,allowHidden=false){
  const place=await db.collection<PlaceDoc>('places').findOne({_id:id,...(allowHidden?{visibility:{$ne:'deleted' as const}}:{visibility:'visible' as const})},{session:transaction});if(!place)notFound();return place!;
 }
 async function caseById(id:string,transaction?:ClientSession){const care=await db.collection<CaseDoc>('careCases').findOne({_id:id,visibility:{$ne:'deleted'}},{session:transaction});if(!care)notFound();return care!;}
 async function actorFence(req:Request,transaction:ClientSession){
  await hooks?.beforeActorFence?.();
  if(!req.viewer)fail(401,'LOGIN_REQUIRED','Choose a demo account to continue.');
  const actor=await db.collection<UserDoc>('users').findOneAndUpdate({_id:req.viewer!._id,state:'active',authGeneration:req.session.authGeneration},{$inc:{writeFence:1}},{session:transaction,returnDocument:'after'});
  if(!actor)fail(401,'ACCOUNT_UNAVAILABLE','Your account session is no longer active.');return actor!;
 }
 async function reporterFence(care:CaseDoc,transaction:ClientSession){const result=await db.collection<UserDoc>('users').updateOne({_id:care.reporterId,state:'active'},{$inc:{writeFence:1}},{session:transaction});if(!result.matchedCount)fail(409,'REPORTER_UNAVAILABLE','This report can no longer be changed.');}
 async function parentFence(place:PlaceDoc,transaction:ClientSession,allowHidden=false){await hooks?.beforeParentFence?.(place._id);const result=await db.collection<PlaceDoc>('places').updateOne({_id:place._id,visibility:allowHidden?{$ne:'deleted'}:'visible',visibilityVersion:place.visibilityVersion},{$inc:{writeFence:1}},{session:transaction});if(!result.matchedCount)notFound();}
 async function transact(req:Request,operation:(transaction:ClientSession,actor:UserDoc,key:string)=>Promise<MutationResult>):Promise<MutationResult>{
  const key=req.get('Idempotency-Key');if(!key||!/^[\w-]{8,128}$/.test(key))fail(400,'IDEMPOTENCY_KEY_REQUIRED','A request identifier is required.');
  const route=req.path;const payloadHash=digest(req.body);const transaction=client.startSession();
  try {
   return (await transaction.withTransaction(async()=>{
    const actor=await actorFence(req,transaction);
    const previous=await db.collection<IdempotencyDoc>('idempotency').findOne({actorId:actor._id,route,key:key!},{session:transaction});
    if(previous){if(previous.payloadHash!==payloadHash)fail(409,'IDEMPOTENCY_CONFLICT','This request identifier has already been used with different details.');return {resourceId:previous.resourceId,kind:previous.kind,status:previous.status};}
    // Lifetime uniqueness survives expiry of the 24-hour replay cache.
    const creations:{[path:string]:{collection:string;owner:string;kind:MutationResult['kind']}}={'/api/v1/places':{collection:'places',owner:'creatorId',kind:'place'},'/api/v1/care-cases':{collection:'careCases',owner:'reporterId',kind:'case'}};
    const creation=creations[route]??(/^\/api\/v1\/places\/[^/]+\/feedings$/.test(route)?{collection:'feedings',owner:'authorId',kind:'feeding' as const}:null);
    if(creation){const existing=await db.collection(creation.collection).findOne({[creation.owner]:actor._id,clientRequestId:route+':'+key},{session:transaction});if(existing){if(existing.clientPayloadHash!==payloadHash)fail(409,'IDEMPOTENCY_CONFLICT','This request identifier has already been used.');if(existing.visibility==='deleted')fail(410,'RECORD_REMOVED','The original record was removed.');return {resourceId:String(existing._id),kind:creation.kind,status:201};}}
    const result=await operation(transaction,actor,route+':'+key);
    await db.collection<IdempotencyDoc>('idempotency').insertOne({_id:randomUUID(),actorId:actor._id,route,key:key!,payloadHash,...result,expiresAt:new Date(Date.now()+day)},{session:transaction});
    return result;
   },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}}))!;
  }finally{await transaction.endSession();}
 }
 async function sendResult(req:Request,res:Response,result:MutationResult){
  // Replay projections are always regenerated under current visibility and authorization.
  if(result.kind==='place'){const place=await placeById(result.resourceId);return res.status(result.status).json({place:await publicPlace(db,place)});}
  if(result.kind==='feeding'){const feeding=await db.collection<FeedingDoc>('feedings').findOne({_id:result.resourceId,visibility:'visible'});if(!feeding)notFound();await placeById(feeding!.placeId);return res.status(result.status).json({feeding:await publicFeeding(db,feeding!)});}
  const care=await caseById(result.resourceId);const place=await placeById(care.placeId,undefined,true);
  if(place.visibility!=='visible'||care.visibility!=='visible')notFound();
  return res.status(result.status).json({case:await publicCase(db,care,place,req.viewer)});
 }
 app.get('/api/v1/places',async(req,res)=>{
  const query:Filter<PlaceDoc>={visibility:'visible'};
  if(req.query.q!==undefined){const q=z.string().trim().min(2).max(100).parse(req.query.q).toLocaleLowerCase('sv');query.searchName={$gte:q,$lt:q+'\uffff'};}
  if(req.query.bbox!==undefined){const values=z.string().parse(req.query.bbox).split(',').map(Number);if(values.length!==4||values.some(v=>!Number.isFinite(v)))fail(422,'INVALID_BBOX','The map bounds are invalid.');const [west,south,east,north]=values as [number,number,number,number];if(west>=east||south>=north)fail(422,'INVALID_BBOX','Map bounds must be ordered west, south, east, north.');if(east-west>1||north-south>1)fail(422,'ZOOM_IN_REQUIRED','Zoom in to see places.');if(west< -180||east>180||south< -90||north>90)fail(422,'INVALID_BBOX','The map bounds are invalid.');query.location={$geoWithin:{$geometry:{type:'Polygon',coordinates:[[[west,south],[east,south],[east,north],[west,north],[west,south]]]}}};}
  const limit=req.query.limit===undefined?100:z.coerce.number().int().min(1).max(200).parse(req.query.limit);
  const places=await db.collection<PlaceDoc>('places').find(query,{maxTimeMS:250}).sort({_id:1}).limit(limit+1).toArray();
  res.json({places:await Promise.all(places.slice(0,limit).map(p=>publicPlace(db,p))),hasMore:places.length>limit});
 });
 app.get('/api/v1/places/:id',async(req,res)=>{const place=await placeById(String(req.params.id));res.json({place:await publicPlace(db,place)});});
 app.get('/api/v1/places/:id/feedings',async(req,res)=>{const place=await placeById(String(req.params.id));const feedings=await db.collection<FeedingDoc>('feedings').find({placeId:place._id,visibility:'visible'}).sort({occurredAt:-1,_id:-1}).limit(50).toArray();res.json({feedings:await Promise.all(feedings.map(f=>publicFeeding(db,f)))});});
 app.get('/api/v1/places/:id/activity',async(req,res)=>{const place=await placeById(String(req.params.id));res.json(await publicActivity(db,place));});
 app.get('/api/v1/places/:id/care-cases',async(req,res)=>{const place=await placeById(String(req.params.id));const cases=await db.collection<CaseDoc>('careCases').find({placeId:place._id,visibility:'visible'}).sort({createdAt:-1,_id:-1}).limit(50).toArray();res.json({cases:await Promise.all(cases.map(c=>publicCase(db,c,place,req.viewer)))});});
 app.post('/api/v1/places',async(req,res)=>{
  const input=placeSchema.parse(req.body);
  const result=await transact(req,async(transaction,actor,key)=>{
   const initialTime=input.initialFeeding?observedTime(input.initialFeeding.occurredAt):null;
   const id=randomUUID();const now=new Date();
   const place:PlaceDoc={_id:id,name:input.name,searchName:input.name.toLocaleLowerCase('sv'),location:{type:'Point',coordinates:[input.longitude,input.latitude]},creatorId:actor._id,comment:input.comment??'',visibility:'visible',version:1,visibilityVersion:1,writeFence:0,createdAt:now,clientRequestId:key};
   await db.collection<PlaceDoc & {clientPayloadHash:string}>('places').insertOne({...place,clientPayloadHash:digest(req.body)},{session:transaction});
   if(input.initialFeeding){const feeding:FeedingDoc={_id:randomUUID(),placeId:id,authorId:actor._id,flockBand:input.initialFeeding.flockBand,foodTypes:input.initialFeeding.foodTypes,comment:input.initialFeeding.comment??'',publicAttribution:true,occurredAt:initialTime!,createdAt:now,visibility:'visible',clientRequestId:key};await db.collection<FeedingDoc>('feedings').insertOne(feeding,{session:transaction});}
   return {resourceId:id,kind:'place',status:201};
  });await sendResult(req,res,result);
 });
 app.post('/api/v1/places/:id/feedings',async(req,res)=>{
  const input=feedingSchema.parse(req.body);
  const result=await transact(req,async(transaction,actor,key)=>{
   const place=await placeById(String(req.params.id),transaction);await parentFence(place,transaction);
   const occurredAt=observedTime(input.occurredAt);
   const feeding:FeedingDoc={_id:randomUUID(),placeId:place._id,authorId:actor._id,flockBand:input.flockBand,foodTypes:input.foodTypes,comment:input.comment??'',publicAttribution:true,occurredAt,createdAt:new Date(),visibility:'visible',clientRequestId:key};
   await db.collection<FeedingDoc & {clientPayloadHash:string}>('feedings').insertOne({...feeding,clientPayloadHash:digest(req.body)},{session:transaction});return {resourceId:feeding._id,kind:'feeding',status:201};
  });await sendResult(req,res,result);
 });
 async function appendEvent(care:CaseDoc,actor:UserDoc,action:CareAction,comment:string,transaction:ClientSession,plannedDate?:string|null){
  const id=randomUUID();const event:CareEventDoc={_id:id,publicId:id,caseId:care._id,placeId:care.placeId,actorId:actor._id,action,comment,publicAttribution:true,createdAt:new Date(Date.now()),...(plannedDate?{plannedDate}:{})};
  await db.collection<CareEventDoc>('careEvents').insertOne(event,{session:transaction});
 }
 app.post('/api/v1/care-cases',async(req,res)=>{
  const input=careSchema.parse(req.body);
  const result=await transact(req,async(transaction,actor,key)=>{
   const place=await placeById(input.placeId,transaction);await parentFence(place,transaction);
   const now=new Date(Date.now());const care:CaseDoc={_id:randomUUID(),placeId:place._id,reporterId:actor._id,issueTypes:input.issueTypes,urgency:input.urgency,state:input.resolveImmediately?'resolved':'open',version:1,visibility:'visible',publicDescription:input.description,publicAttribution:true,birdCount:input.birdCount,assignedUserId:null,plannedDate:null,assignmentParentVersion:null,detailsState:'retained',lifecycleVersion:2,createdAt:now,updatedAt:now,clientRequestId:key};
   await db.collection<CaseDoc & {clientPayloadHash:string}>('careCases').insertOne({...care,clientPayloadHash:digest(req.body)},{session:transaction});
   await appendEvent(care,actor,input.resolveImmediately?'reported_resolved':'create',input.resolveImmediately?(input.resolutionComment??''):input.description,transaction);
   return {resourceId:care._id,kind:'case',status:201};
  });await sendResult(req,res,result);
 });
 app.get('/api/v1/care-cases/:id',async(req,res)=>{const care=await caseById(String(req.params.id));const place=await placeById(care.placeId);if(care.visibility!=='visible')notFound();res.json({case:await publicCase(db,care,place,req.viewer)});});
 for(const action of ['claim','release','resolve','reopen','comment'] as const)app.post(`/api/v1/care-cases/:id/${action==='comment'?'comments':action}`,async(req,res)=>{
  const input=(action==='claim'?claimSchema:action==='comment'?commentSchema:actionSchema).parse(req.body);const version=versionHeader(req);
  const plannedDate=action==='claim'?(input as z.infer<typeof claimSchema>).plannedDate:undefined;
  const result=await transact(req,async(transaction,actor)=>{
   const care=await caseById(String(req.params.id),transaction);const place=await placeById(care.placeId,transaction);const owner=care.reporterId===actor._id||isModerator(actor);
   if(care.visibility!=='visible')notFound();
   const state=effectiveState(care,place);const assigned=state==='claimed'&&care.assignedUserId===actor._id;
   if(action==='claim'&&state!=='open')fail(409,'CASE_UNAVAILABLE','Another member has already taken responsibility for this case.');
   if(care.version!==version)fail(412,'STALE_VERSION','This case has changed. Refresh it and try again.');
   if(!detailsRetained(care))fail(410,'CASE_DETAILS_EXPIRED','This legacy report was retired. Create a new report with a fresh observation.');
   const update:Partial<CaseDoc>={updatedAt:new Date(Date.now()),version:care.version+1};
   if(action==='claim'){
    Object.assign(update,{state:'claimed',assignedUserId:actor._id,plannedDate,assignmentParentVersion:place.visibilityVersion});
   }else if(action==='release'){
    if(state!=='claimed')fail(409,'CASE_NOT_CLAIMED','This case has no current care commitment.');
    if(!isModerator(actor)&&!assigned)fail(403,'FORBIDDEN','Only the assigned member or a moderator can release this case.');
    Object.assign(update,{state:'open',assignedUserId:null,plannedDate:null,assignmentParentVersion:null});
   }else if(action==='resolve'){
    if(!owner&&!assigned)fail(403,'FORBIDDEN','Only the reporter, assigned member or a moderator can resolve this case.');
    if(state==='resolved')fail(409,'ALREADY_RESOLVED','This case has already been resolved.');
    Object.assign(update,{state:'resolved',assignedUserId:null,plannedDate:null,assignmentParentVersion:null});
   }else if(action==='reopen'){
    if(!owner)fail(403,'FORBIDDEN','Only the reporter or a moderator can reopen this case.');
    if(state!=='resolved')fail(409,'CASE_NOT_RESOLVED','Only a resolved case can be reopened.');
    if(!input.comment||input.comment.length<3)fail(422,'FRESH_OBSERVATION_REQUIRED','Describe a fresh observation before reopening this case.');
    Object.assign(update,{state:'open',assignedUserId:null,plannedDate:null,assignmentParentVersion:null});
   }
   await reporterFence(care,transaction);await parentFence(place,transaction);
   if(!detailsRetained(care))fail(410,'CASE_DETAILS_EXPIRED','This legacy report was retired.');
   // Moving calendar-date validation belongs only to a NEW operation, after replay
   // lookup and after fence waits, including a wait that crosses Stockholm midnight.
   if(action==='claim'&&(!plannedDate||plannedDate<stockholmToday()))fail(422,'INVALID_PLANNED_DATE','Choose today or a future care date.');
   update.updatedAt=new Date(Date.now());
   const requiresAssignment=(action==='resolve'&&!owner)||(action==='release'&&!isModerator(actor));
   const conditions:Filter<CaseDoc>={_id:care._id,version,visibility:'visible',detailsState:'retained',lifecycleVersion:2,...(requiresAssignment?{assignedUserId:actor._id,assignmentParentVersion:place.visibilityVersion,state:'claimed'}:{})};
   const changed=await db.collection<CaseDoc>('careCases').updateOne(conditions,{$set:update},{session:transaction});
   if(!changed.matchedCount)fail(412,'STALE_VERSION','This case has changed. Refresh it and try again.');
   await appendEvent(care,actor,action,input.comment??'',transaction,action==='claim'?plannedDate:undefined);
   return {resourceId:care._id,kind:'case',status:200};
  });await sendResult(req,res,result);
 });
 app.use((_req,_res,next)=>next(new ApiError(404,'NOT_FOUND','This endpoint is unavailable in the prototype.')));
 app.use((error:unknown,req:Request,res:Response,_next:NextFunction)=>{
  if(error instanceof ZodError){res.status(422).json({error:{code:'VALIDATION_FAILED',message:'Check the highlighted fields.',fields:Object.fromEntries(error.issues.map(i=>[i.path.join('.'),i.message])),requestId:req.requestId}});return;}
  if(error instanceof ApiError){res.status(error.status).json({error:{code:error.code,message:error.message,fields:error.fields,requestId:req.requestId}});return;}
  const status=(error as {status?:number})?.status;
  if(status===400||status===413){res.status(status).json({error:{code:status===413?'BODY_TOO_LARGE':'INVALID_JSON',message:status===413?'This request is too large.':'The JSON request is malformed.',requestId:req.requestId}});return;}
  const unavailable=error instanceof MongoServerError||(error instanceof Error&&error.message.startsWith('SESSION_'));
  console.error('API request failed',{requestId:req.requestId,type:error instanceof Error?error.name:'unknown'});
  res.status(unavailable?503:500).json({error:{code:unavailable?'SERVICE_UNAVAILABLE':'INTERNAL_ERROR',message:'The request could not be completed. Please try again.',requestId:req.requestId}});
 });
 return app;
}
