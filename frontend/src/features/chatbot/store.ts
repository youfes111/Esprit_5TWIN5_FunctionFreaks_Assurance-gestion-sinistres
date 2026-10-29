import type { NlpAnswer } from '../../types/nlp';

export interface ChatClient {
  examples(signal?: AbortSignal): Promise<string[]>;
  ask(question: string, signal?: AbortSignal): Promise<NlpAnswer>;
}
export interface ChatTurn { id: number; question: string; answer?: NlpAnswer; error?: string }
export interface ChatState {
  open: boolean; question: string; turns: ChatTurn[]; busy: boolean;
  examples: string[]; examplesStatus: 'idle' | 'loading' | 'loaded' | 'error'; examplesError: string;
}
export function createChatStore(client: ChatClient) {
  let state: ChatState = { open:false, question:'', turns:[], busy:false, examples:[], examplesStatus:'idle', examplesError:'' };
  const listeners = new Set<() => void>();
  let sequence = 0;
  let generation = 0;
  let request: AbortController | null = null;
  let examplesRequest: AbortController | null = null;
  let examplesPromise: Promise<void> | null = null;
  const update = (patch: Partial<ChatState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  async function loadExamples() {
    if (state.examplesStatus === 'loaded') return;
    if (examplesPromise) return examplesPromise;
    const controller = new AbortController(); examplesRequest = controller;
    const current = generation;
    update({ examplesStatus:'loading', examplesError:'' });
    examplesPromise = (async () => {
      try {
        const examples = await Promise.resolve().then(() => client.examples(controller.signal));
        if (!controller.signal.aborted && current === generation) update({ examples, examplesStatus:'loaded' });
      } catch (error) {
        if (!controller.signal.aborted && current === generation) update({ examplesStatus:'error', examplesError:error instanceof Error ? error.message : 'Exemples indisponibles.' });
      } finally { if (examplesRequest === controller) { examplesPromise = null; examplesRequest = null; } }
    })();
    return examplesPromise;
  }
  const actions = {
    open() { if (!state.open) update({ open:true }); if (state.examplesStatus === 'idle') void loadExamples(); },
    close() { if (state.open) update({ open:false }); },
    setQuestion(question: string) { update({ question:question.slice(0, 500) }); },
    retryExamples: loadExamples,
    clear() { if (state.busy) return false; update({ turns:[], question:'' }); return true; },
    async submit() {
      const question = state.question.trim();
      if (state.busy || question.length < 3 || question.length > 500) return false;
      const id = ++sequence;
      const controller = new AbortController(); request = controller;
      const current = generation;
      update({ busy:true, question:'', turns:[...state.turns.slice(-9), { id, question }] });
      try {
        const answer = await client.ask(question, controller.signal);
        if (!controller.signal.aborted && current === generation) update({ turns:state.turns.map(turn => turn.id === id ? { ...turn, answer } : turn) });
      } catch (error) {
        if (!controller.signal.aborted && current === generation) update({ turns:state.turns.map(turn => turn.id === id ? { ...turn, error:error instanceof Error ? error.message : 'La question n’a pas pu être traitée.' } : turn) });
      } finally { if (request === controller) { request = null; if (current === generation) update({ busy:false }); } }
      return true;
    },
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    actions,
    dispose() {
      generation++; request?.abort(); examplesRequest?.abort(); request = null; examplesRequest = null; examplesPromise = null;
      update({ busy:false, examplesStatus:state.examplesStatus === 'loading' ? 'idle' : state.examplesStatus });
    },
  };
}
export type ChatStore = ReturnType<typeof createChatStore>;
