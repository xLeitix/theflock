import type { CareAction, CareState, FlockBand, Locale, Role } from '../../../packages/contracts/src/index.ts';
export interface UserDoc { _id:string; displayName:string; locale:Locale; roles:Role[]; state:'active'|'suspended'|'deleting'; authGeneration:number; writeFence:number }
export interface PlaceDoc { _id:string; name:string; searchName:string; location:{type:'Point';coordinates:[number,number]}; creatorId:string; comment?:string; note?:string; visibility:'visible'|'hidden'|'deleted'; version:number; visibilityVersion:number; writeFence:number; createdAt:Date; clientRequestId?:string }
export interface FeedingDoc { _id:string; placeId:string; authorId:string; flockBand:FlockBand; foodTypes:string[]; comment?:string; publicAttribution?:boolean; note?:string; occurredAt:Date; createdAt:Date; visibility:'visible'|'hidden'|'deleted'; clientRequestId?:string }
export interface CaseDoc { _id:string; placeId:string; reporterId:string; issueTypes:string[]; urgency:'now'|'today'; state:CareState; version:number; visibility:'visible'|'hidden'|'withdrawn'|'deleted'; publicDescription?:string; publicAttribution?:boolean; birdCount:number; assignedUserId:string|null; plannedDate:string|null; assignmentParentVersion:number|null; detailsState:'retained'|'purged'; lifecycleVersion:2; createdAt:Date; updatedAt:Date; clientRequestId?:string }
export interface CareEventDoc { _id:string; publicId:string; caseId:string; placeId:string; actorId:string; action:CareAction; comment:string; publicAttribution:boolean; plannedDate?:string|null; createdAt:Date }
export interface IdempotencyDoc { _id:string; actorId:string; route:string; key:string; payloadHash:string; resourceId:string; kind:'place'|'feeding'|'case'; status:number; expiresAt:Date }
export const DEMO_IDS = {
 member:'10000000-0000-4000-8000-000000000001', member2:'10000000-0000-4000-8000-000000000002', moderator:'10000000-0000-4000-8000-000000000003', member3:'10000000-0000-4000-8000-000000000004',
 places:['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004'],
 cases:['40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003']
} as const;
export const demoFeedingId=(placeIndex:number,historyIndex:number)=>`30000000-0000-4000-8000-${String(historyIndex===0?placeIndex+1:(placeIndex+1)*100+historyIndex).padStart(12,'0')}`;
export const DEMO_FEEDING_IDS=Array.from({length:4},(_,p)=>Array.from({length:4},(_,h)=>demoFeedingId(p,h))).flat();
export const DEMO_DESCRIPTION='Fictional demo observation. No real bird has been reported here.';
