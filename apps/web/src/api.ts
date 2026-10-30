import type { SessionResponse } from '../../../packages/contracts/src/index';
import { PUBLIC_CONTRIBUTION_CONTRACT } from '../../../packages/contracts/src/index';
export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}
let csrfToken = '';
export function setCsrf(session: SessionResponse) { csrfToken = session.csrfToken; }
export async function api<T>(path: string, options: { body?: unknown; key?: string; version?: number; method?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined || options.method) {
    headers['Content-Type'] = 'application/json';
    headers['X-CSRF-Token'] = csrfToken;
    headers['Idempotency-Key'] = options.key || crypto.randomUUID();
    headers['X-Flock-Contract'] = PUBLIC_CONTRIBUTION_CONTRACT;
  }
  if (options.version !== undefined) headers['If-Match'] = String(options.version);
  let response: Response;
  try {
    response = await fetch(path.startsWith('/auth') ? path : `/api/v1${path}`, {
      credentials: 'same-origin', cache: 'no-store', headers,
      method: options.method || (options.body !== undefined ? 'POST' : 'GET'),
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
    });
  } catch { throw new ApiError(options.body !== undefined ? 'SAVE_UNCONFIRMED' : 'CONNECTION_FAILED', 0, 'NETWORK'); }
  let data: any;
  try { data = await response.json(); } catch { throw new ApiError('SERVER_UNAVAILABLE', response.status, 'INVALID_RESPONSE'); }
  if (!response.ok) throw new ApiError(data.error?.message || 'Request failed', response.status, data.error?.code || 'UNKNOWN');
  return data as T;
}
