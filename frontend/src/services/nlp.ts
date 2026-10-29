import { request } from './api';
import type { NlpAnswer } from '../types/nlp';

export const nlpApi = {
  examples: (signal?: AbortSignal) => request<string[]>('/nlp/examples', { signal }),
  ask: (question: string, signal?: AbortSignal) => request<NlpAnswer>('/nlp/ask', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }), signal,
  }),
};
