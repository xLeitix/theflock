import {randomUUID} from 'node:crypto';
import type {Db} from 'mongodb';
import {DEMO_DESCRIPTION,DEMO_FEEDING_IDS,DEMO_IDS} from './models.ts';
export const COMMUNITY_SCHEMA='community-care-v2';
interface MigrationDoc {_id:string;status:'pending'|'complete';cutoverAt:Date;completedAt?:Date}
export async function schemaReady(db:Db){return !!await db.collection<MigrationDoc>('migrations').findOne({_id:COMMUNITY_SCHEMA,status:'complete'});}
export async function requireSchema(db:Db){if(!await schemaReady(db))throw new Error('COMMUNITY_SCHEMA_REQUIRED: stop legacy API/workers and run the explicit community-care cutover before serving requests.');}
export async function migrateCommunityCare(db:Db,{allowLegacyCutover=false}:{allowLegacyCutover?:boolean}={}) {
 if(!['flock_dev','flock_test','flock_preview'].includes(db.databaseName))throw new Error('Prototype migrations only support isolated prototype databases.');
 if(await schemaReady(db))return;
 const legacy=await db.collection('careCases').findOne({lifecycleVersion:{$ne:2}})||await db.collection('feedings').findOne({publicAttribution:{$exists:false}})||await db.collection('users').findOne({roles:'approved_helper'})||await db.collection('places').findOne({comment:{$exists:false}});
 if(legacy&&!allowLegacyCutover)throw new Error('Legacy records require a quiesced cutover. Stop the old application, back up data, then set FLOCK_ALLOW_COMMUNITY_CUTOVER=1 for dev:seed.');
 // The cutover instant survives failed/retried transactions; expiry cannot move.
 await db.collection<MigrationDoc>('migrations').updateOne({_id:COMMUNITY_SCHEMA},{$setOnInsert:{status:'pending',cutoverAt:new Date(Date.now())}},{upsert:true});
 const transaction=db.client.startSession();
 try {await transaction.withTransaction(async()=>{
  const marker=await db.collection<MigrationDoc>('migrations').findOne({_id:COMMUNITY_SCHEMA},{session:transaction});
  if(marker?.status==='complete')return;
  if(!marker)throw new Error('Missing migration cutover marker.');
  for(const user of await db.collection('users').find({},{session:transaction}).toArray()){
   const roles=user.roles?.includes('moderator')?['member','moderator']:['member'];
   const names:Record<string,string>={'Sam · demo helper':'Sam · demo member','Kim · second demo helper':'Kim · demo member'};
   if(JSON.stringify(user.roles)!==JSON.stringify(roles)||names[user.displayName])await db.collection('users').updateOne({_id:user._id},{$set:{roles,displayName:names[user.displayName]??user.displayName},$inc:{authGeneration:1,writeFence:1}},{session:transaction});
  }
  for(const place of await db.collection('places').find({comment:{$exists:false}},{session:transaction}).toArray()){
   const synthetic=(DEMO_IDS.places as readonly string[]).includes(String(place._id))&&['Fictional demonstration data; not a verified feeding place.','Real landmark with fictional demonstration sightings; not a verified feeding place.'].includes(place.note);
   await db.collection('places').updateOne({_id:place._id},{$set:{comment:synthetic?'Fictional demo sightings at this public place.':''},$inc:{version:1,writeFence:1}},{session:transaction});
  }
  for(const feeding of await db.collection('feedings').find({publicAttribution:{$exists:false}},{session:transaction}).toArray()){
   const synthetic=DEMO_FEEDING_IDS.includes(String(feeding._id))&&feeding.note==='Private fictional observation.';
   await db.collection('feedings').updateOne({_id:feeding._id},{$set:{publicAttribution:synthetic,comment:synthetic?'Fictional demo feeding.':''}},{session:transaction});
  }
  for(const care of await db.collection('careCases').find({lifecycleVersion:{$ne:2}},{session:transaction}).toArray()){
   const terminal=care.privateDataState!=='retained'||(care.purgeDueAt&&new Date(care.purgeDueAt).getTime()<=marker.cutoverAt.getTime());
   const synthetic=(DEMO_IDS.cases as readonly string[]).includes(String(care._id))&&care.description===DEMO_DESCRIPTION&&!terminal;
   await db.collection('careCases').updateOne({_id:care._id,version:care.version},{$set:{lifecycleVersion:2,detailsState:terminal?'purged':'retained',publicDescription:synthetic?DEMO_DESCRIPTION:'',publicAttribution:synthetic,assignedUserId:null,plannedDate:null,assignmentParentVersion:null,state:care.state==='claimed'?'open':care.state},$unset:{exactLocation:'',assignedHelperId:'',claimExpiresAt:'',claimParentVersion:'',privateDataState:'',purgeDueAt:''},$inc:{version:1}},{session:transaction});
  }
  // Existing event text and actor attribution were private; never reinterpret them.
  for(const event of await db.collection('careEvents').find({publicId:{$exists:false}},{session:transaction}).toArray()){
   const care=await db.collection('careCases').findOne({_id:event.caseId},{session:transaction});
   await db.collection('careEvents').updateOne({_id:event._id},{$set:{publicId:randomUUID(),placeId:care?.placeId??null,comment:'',publicAttribution:false}},{session:transaction});
  }
  await db.collection<MigrationDoc>('migrations').updateOne({_id:COMMUNITY_SCHEMA,status:'pending'},{$set:{status:'complete',completedAt:new Date(Date.now())}},{session:transaction});
 },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});}finally{await transaction.endSession();}
}
