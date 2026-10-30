import type { FlockBand } from '../../../packages/contracts/src/index';
export interface FeedingDraft { flockBand: FlockBand | ''; foodTypes: string[]; comment: string; occurredAt: string }
export function localNow(): string { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
export function newFeeding(): FeedingDraft { return { flockBand: '', foodTypes: [], comment: '', occurredAt: localNow() }; }

export function stockholmToday(): string { return new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
