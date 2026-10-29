import { request } from './api';
import type { Claim, ClaimInput, ClaimPage, ClaimOptions } from '../types/claims';

const writeHeaders = () => ({ 'Content-Type': 'application/json' });
export const claimsApi = {
  list: (params: URLSearchParams, signal?: AbortSignal) => request<ClaimPage>(`/claims?${params}`, { signal }),
  get: (id: string, signal?: AbortSignal) => request<Claim>(`/claims/${encodeURIComponent(id)}`, { signal }),
  options: (signal?: AbortSignal) => request<ClaimOptions>('/claims/options', { signal }),
  create: (input: ClaimInput) => request<{ id: string; revision: string }>('/claims', { method: 'POST', headers: writeHeaders(), body: JSON.stringify(input) }),
  update: (id: string, input: Partial<Omit<ClaimInput, 'id'>> & { revision: string }) => request<{ id: string; revision: string }>(`/claims/${encodeURIComponent(id)}`, { method: 'PATCH', headers: writeHeaders(), body: JSON.stringify(input) }),
  delete: (claim: Claim) => request<{ id: string; deleted: boolean }>(`/claims/${encodeURIComponent(claim.id)}`, { method: 'DELETE', headers: { ...writeHeaders(), 'If-Match': `"${claim.revision ?? ''}"` } }),
};
