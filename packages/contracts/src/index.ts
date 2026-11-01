export type Locale = 'en' | 'sv';
export const PUBLIC_CONTRIBUTION_CONTRACT = 'community-care-v2';
export type Recency = 'recent' | 'due' | 'overdue' | 'unknown';
export type FlockBand = 'small' | 'medium' | 'large' | 'unknown';
export type Persona = 'member' | 'member2' | 'moderator';
export type Role = 'member' | 'moderator';
export interface User { id: string; displayName: string; roles: Role[]; locale: Locale }
export interface SessionResponse { user: User | null; csrfToken: string; prototype: true; mode?:'local'|'preview' }
export interface Place { id: string; name: string; comment: string; location: { type: 'Point'; coordinates: [number, number] }; recency: Recency; lastFedLabel: string; flockBand: FlockBand; careCount: number; version: number }
export interface Feeding { id: string; placeId: string; date: string; authorDisplayName: string; comment: string; flockBand: FlockBand; foodTypes: string[] }
export type CareState = 'open' | 'claimed' | 'resolved';
export interface CareCase { id: string; placeId: string; issueTypes: string[]; urgency: 'now' | 'today'; state: CareState; date: string; version: number; reporterDisplayName: string; assignedDisplayName: string | null; plannedDate: string | null; overdue: boolean; description: string; birdCount: number; canClaim: boolean; canResolve: boolean; canReopen: boolean; canRelease: boolean; canComment: boolean }
export type CareAction = 'create' | 'reported_resolved' | 'claim' | 'release' | 'resolve' | 'reopen' | 'comment';
interface ActivityBase { id: string; placeId: string; date: string; authorDisplayName: string; comment: string }
export type Activity = (ActivityBase & { kind: 'feeding'; feeding: { flockBand: FlockBand; foodTypes: string[] }; care?: never }) | (ActivityBase & { kind: 'care'; care: { caseId: string; action: CareAction; issueTypes: string[]; plannedDate?: string | null }; feeding?: never });
export interface ActivityResponse { activity: Activity[]; hasMore: boolean }
export interface FeedingInput { flockBand: FlockBand; foodTypes: string[]; comment?: string; occurredAt?: string }
export interface PlaceInput { name: string; longitude: number; latitude: number; publicLocationConfirmed: true; comment?: string; initialFeeding?: FeedingInput }
export interface CareInput { placeId: string; issueTypes: string[]; urgency: 'now' | 'today'; birdCount: number; description: string; resolveImmediately?: boolean; resolutionComment?: string }
export interface CareActionInput { plannedDate?: string; comment?: string }
export const PILOT_CENTER: [number, number] = [11.9746, 57.7089];
export const FOOD_TYPES = ['grain_mix', 'seeds', 'dried_peas', 'other'] as const;
export const ISSUE_TYPES = ['wing_injury', 'limping', 'entangled', 'sick', 'unable_to_fly', 'young_alone', 'other'] as const;
