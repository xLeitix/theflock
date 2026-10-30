import type { Db } from 'mongodb';
import { ensureIndexes } from './database.ts';
import { DEMO_IDS, DEMO_DESCRIPTION, demoFeedingId, type UserDoc, type PlaceDoc, type FeedingDoc, type CaseDoc, type CareEventDoc } from './models.ts';
import {migrateCommunityCare} from './migrations.ts';
export async function seedDatabase(db:Db, options:{allowLegacyCutover?:boolean}={}) {
 if(!['flock_dev','flock_test'].includes(db.databaseName)) throw new Error('Refusing to seed a non-prototype database.');
 await ensureIndexes(db);
 await migrateCommunityCare(db,options);
 const now=new Date();
 for(const [persona,id] of Object.entries(DEMO_IDS).filter(([key])=>['member','member2','moderator','member3'].includes(key))) {
  const key=persona as 'member'|'member2'|'moderator'|'member3';
  const user:UserDoc={_id:id as string,displayName:{member:'Alex · demo member',member2:'Sam · demo member',moderator:'Robin · demo moderator',member3:'Kim · demo member'}[key],locale:'en',roles:key==='moderator'?['member','moderator']:['member'],state:'active',authGeneration:1,writeFence:0};
  await db.collection<UserDoc>('users').updateOne({_id:user._id},{$setOnInsert:user},{upsert:true});
 }
 // Approximate public landmark positions; sightings here remain fictional.
 // Coordinate sources are recorded in README.md. Legacy fields migrate only
 // the original fixtures, without resetting contributions or care workflow state.
 const fixtures=[
  {name:'Coop Eriksberg',coordinates:[11.91953,57.70889] as [number,number],legacyName:'Demo · Canal steps',legacyCoordinates:[11.9675,57.7069],ages:[12,36,72,144],band:'medium' as const},
  {name:'Vårväderstorget',coordinates:[11.89208,57.71246] as [number,number],legacyName:'Demo · Garden corner',legacyCoordinates:[11.9811,57.7079],ages:[72,96,120,156],band:'small' as const},
  {name:'Friskväderstorget',coordinates:[11.89143,57.72393] as [number,number],legacyName:'Demo · Riverside square',legacyCoordinates:[11.9550,57.7108],ages:[120,132,144,156],band:'large' as const},
  {name:'Järntorget',coordinates:[11.95278,57.69972] as [number,number],legacyName:'Demo · Quiet courtyard',legacyCoordinates:[11.9754,57.7160],ages:[24,48,96,144],band:'medium' as const}
 ];
 for(const [index,fixture] of fixtures.entries()) {
  const place:PlaceDoc={_id:DEMO_IDS.places[index]!,name:fixture.name,searchName:fixture.name.toLocaleLowerCase('sv'),location:{type:'Point',coordinates:fixture.coordinates},creatorId:DEMO_IDS.member,comment:'Fictional demo sightings at this public place.',visibility:'visible',version:1,visibilityVersion:1,writeFence:0,createdAt:now};
  await db.collection<PlaceDoc>('places').updateOne({_id:place._id},{$setOnInsert:place},{upsert:true});
  await db.collection<PlaceDoc>('places').updateOne({_id:place._id,name:fixture.legacyName,'location.coordinates':fixture.legacyCoordinates},{$set:{name:place.name,searchName:place.searchName,location:place.location,comment:place.comment},$inc:{version:1,writeFence:1}});
  for(const [historyIndex,age] of fixture.ages.entries()) {
   // Preserve the original latest-record IDs, and give added history stable IDs.
   const bands=['small','medium','large'] as const;
   const foods=[['grain_mix'],['seeds'],['dried_peas','seeds'],['grain_mix','seeds']];
   const feeding:FeedingDoc={_id:demoFeedingId(index,historyIndex),placeId:place._id,authorId:DEMO_IDS.member,flockBand:historyIndex===0?fixture.band:bands[(index+historyIndex)%bands.length]!,foodTypes:foods[historyIndex]!,comment:'Fictional demo feeding.',publicAttribution:true,occurredAt:new Date(now.getTime()-age*3600000),createdAt:now,visibility:'visible'};
   await db.collection<FeedingDoc>('feedings').updateOne({_id:feeding._id},{$setOnInsert:feeding},{upsert:true});
  }
 }
 for(let i=0;i<3;i++) {
  const care:CaseDoc={_id:DEMO_IDS.cases[i]!,placeId:DEMO_IDS.places[i]!,reporterId:DEMO_IDS.member,issueTypes:[['limping','wing_injury','other'][i]!],urgency:i===0?'today':'now',state:i===2?'resolved':'open',version:1,visibility:'visible',publicDescription:DEMO_DESCRIPTION,publicAttribution:true,birdCount:1,assignedUserId:null,plannedDate:null,assignmentParentVersion:null,detailsState:'retained',lifecycleVersion:2,createdAt:now,updatedAt:now};
  await db.collection<CaseDoc>('careCases').updateOne({_id:care._id},{$setOnInsert:care},{upsert:true});
  const stored=await db.collection<CaseDoc>('careCases').findOne({_id:care._id});
  if(stored?.publicAttribution&&stored.detailsState==='retained') {
   const eventId=`50000000-0000-4000-8000-00000000000${i+1}`;
   const event:CareEventDoc={_id:eventId,publicId:eventId,caseId:care._id,placeId:care.placeId,actorId:care.reporterId,action:i===2?'reported_resolved':'create',comment:DEMO_DESCRIPTION,publicAttribution:true,createdAt:stored.createdAt};
   await db.collection<CareEventDoc>('careEvents').updateOne({_id:event._id},{$setOnInsert:event},{upsert:true});
  }
 }
}
