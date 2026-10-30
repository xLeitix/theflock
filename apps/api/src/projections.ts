import type {Db} from 'mongodb';
import type {Activity,ActivityResponse,CareCase,Feeding,Place,Recency,User} from '../../../packages/contracts/src/index.ts';
import type {CaseDoc,CareEventDoc,FeedingDoc,PlaceDoc,UserDoc} from './models.ts';
export function recency(occurredAt:Date|null,now=Date.now()):Recency {
 if(!occurredAt||!Number.isFinite(occurredAt.getTime()))return 'unknown';
 const elapsed=now-occurredAt.getTime();return elapsed<=48*3600000?'recent':elapsed<=96*3600000?'due':'overdue';
}
export function calendarDate(date:Date){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export const stockholmToday=()=>calendarDate(new Date(Date.now()));
export function publicUser(user:UserDoc):User{return {id:user._id,displayName:user.displayName,locale:user.locale,roles:user.roles};}
export async function displayName(db:Db,userId:string,publicAttribution:boolean|undefined):Promise<string>{
 const user=await db.collection<UserDoc>('users').findOne({_id:userId},{projection:{displayName:1,state:1}});
 if(!user||user.state==='deleting')return 'Deleted member';
 return publicAttribution?user.displayName.slice(0,100):'Community member';
}
export async function publicFeeding(db:Db,feeding:FeedingDoc):Promise<Feeding>{return {id:feeding._id,placeId:feeding.placeId,date:calendarDate(feeding.occurredAt),authorDisplayName:await displayName(db,feeding.authorId,feeding.publicAttribution),comment:feeding.comment??'',flockBand:feeding.flockBand,foodTypes:feeding.foodTypes};}
export function isModerator(user:UserDoc|null){return !!user?.roles.includes('moderator');}
export function effectiveState(care:CaseDoc,place:PlaceDoc){return care.state==='claimed'&&(!care.assignedUserId||!care.plannedDate||care.assignmentParentVersion!==place.visibilityVersion)?'open':care.state;}
export function detailsRetained(care:CaseDoc){return care.lifecycleVersion===2&&care.detailsState==='retained';}
export async function publicCase(db:Db,care:CaseDoc,place:PlaceDoc,user:UserDoc|null):Promise<CareCase> {
 const state=effectiveState(care,place);const visible=place.visibility==='visible'&&care.visibility==='visible';const owner=!!user&&(care.reporterId===user._id||isModerator(user));
 const assigned=!!user&&state==='claimed'&&care.assignedUserId===user._id;const retained=detailsRetained(care);const member=!!user&&user.state==='active';
 return {id:care._id,placeId:care.placeId,issueTypes:care.issueTypes,urgency:care.urgency,state,date:calendarDate(care.createdAt),version:care.version,
  reporterDisplayName:await displayName(db,care.reporterId,care.publicAttribution),assignedDisplayName:state==='claimed'&&care.assignedUserId?await displayName(db,care.assignedUserId,true):null,
  plannedDate:state==='claimed'?care.plannedDate:null,overdue:state==='claimed'&&!!care.plannedDate&&care.plannedDate<stockholmToday(),description:retained?(care.publicDescription??''):'',birdCount:care.birdCount??1,
  canClaim:visible&&member&&state==='open'&&retained,canResolve:visible&&state!=='resolved'&&(owner||assigned)&&retained,canRelease:visible&&state==='claimed'&&(isModerator(user)||assigned)&&retained,canReopen:visible&&owner&&state==='resolved'&&retained,canComment:visible&&member&&retained};
}
export async function publicPlace(db:Db,place:PlaceDoc):Promise<Place>{
 const last=await db.collection<FeedingDoc>('feedings').find({placeId:place._id,visibility:'visible'}).sort({occurredAt:-1,_id:-1}).limit(1).next();
 const count=await db.collection<CaseDoc>('careCases').countDocuments({placeId:place._id,visibility:'visible',detailsState:'retained',state:{$in:['open','claimed']}});
 return {id:place._id,name:place.name,comment:place.comment??'',location:place.location,recency:recency(last?.occurredAt??null),lastFedLabel:last?calendarDate(last.occurredAt):'unknown',flockBand:last?.flockBand??'unknown',careCount:count,version:place.version};
}
export async function publicActivity(db:Db,place:PlaceDoc):Promise<ActivityResponse> {
 const limit=50;
 const [feedings,events]=await Promise.all([
  db.collection<FeedingDoc>('feedings').find({placeId:place._id,visibility:'visible'}).sort({occurredAt:-1,_id:-1}).limit(limit+1).toArray(),
  db.collection<CareEventDoc>('careEvents').aggregate<CareEventDoc&{care:CaseDoc}>([
   {$match:{placeId:place._id,action:{$in:['create','reported_resolved','claim','release','resolve','reopen','comment']}}},
   {$lookup:{from:'careCases',localField:'caseId',foreignField:'_id',as:'caseRecords'}},{$unwind:'$caseRecords'},
   {$match:{'caseRecords.placeId':place._id,'caseRecords.visibility':'visible'}},
   {$sort:{createdAt:-1,publicId:-1}},{$limit:limit+1},{$set:{care:'$caseRecords'}},{$unset:'caseRecords'}
  ],{maxTimeMS:1000}).toArray()
 ]);
 const entries:{at:number;entry:Activity}[]=[];
 for(const feeding of feedings){const dto=await publicFeeding(db,feeding);entries.push({at:feeding.occurredAt.getTime(),entry:{id:dto.id,placeId:dto.placeId,kind:'feeding',date:dto.date,authorDisplayName:dto.authorDisplayName,comment:dto.comment,feeding:{flockBand:dto.flockBand,foodTypes:dto.foodTypes}}});}
 for(const event of events){const retained=detailsRetained(event.care);entries.push({at:event.createdAt.getTime(),entry:{id:event.publicId,placeId:place._id,kind:'care',date:calendarDate(event.createdAt),authorDisplayName:await displayName(db,event.actorId,retained&&event.publicAttribution),comment:retained?(event.comment??''):'',care:{caseId:event.caseId,action:event.action,issueTypes:event.care.issueTypes,plannedDate:event.plannedDate??null}}});}
 entries.sort((a,b)=>b.at-a.at||b.entry.id.localeCompare(a.entry.id)||b.entry.kind.localeCompare(a.entry.kind));
 return {activity:entries.slice(0,limit).map(e=>e.entry),hasMore:entries.length>limit};
}
