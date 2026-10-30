import {z} from 'zod';
import {FOOD_TYPES,ISSUE_TYPES} from '../../../packages/contracts/src/index.ts';
export const feedingSchema=z.object({flockBand:z.enum(['small','medium','large','unknown']),foodTypes:z.array(z.enum(FOOD_TYPES)).max(4).refine(v=>new Set(v).size===v.length),comment:z.string().trim().max(1000).optional(),occurredAt:z.iso.datetime({offset:true}).optional()}).strict();
export const coordinateSchema={longitude:z.number().min(11.4).max(12.6),latitude:z.number().min(57.4).max(58.1)};
export const placeSchema=z.object({name:z.string().trim().min(2).max(100),...coordinateSchema,publicLocationConfirmed:z.literal(true),comment:z.string().trim().max(500).optional(),initialFeeding:feedingSchema.optional()}).strict();
export const careSchema=z.object({placeId:z.uuid(),issueTypes:z.array(z.enum(ISSUE_TYPES)).min(1).max(7).refine(v=>new Set(v).size===v.length),urgency:z.enum(['now','today']),birdCount:z.number().int().min(1).max(1000),description:z.string().trim().min(3).max(2000),resolveImmediately:z.boolean().optional(),resolutionComment:z.string().trim().max(1000).optional()}).strict().refine(v=>v.resolveImmediately||!v.resolutionComment,{path:['resolutionComment'],message:'A resolution comment needs immediate resolution.'});
export const actionSchema=z.object({comment:z.string().trim().max(1000).optional()}).strict();
export const claimSchema=z.object({plannedDate:z.iso.date(),comment:z.string().trim().max(1000).optional()}).strict();
export const commentSchema=z.object({comment:z.string().trim().min(1).max(1000)}).strict();
