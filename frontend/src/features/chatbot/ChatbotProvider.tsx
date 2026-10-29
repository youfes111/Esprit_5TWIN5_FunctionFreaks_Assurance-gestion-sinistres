import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { createChatStore } from './store';
import type { ChatClient, ChatStore } from './store';

type ChatActions = ChatStore['actions'] & {
  openChat(trigger?: HTMLElement | null): void;
  restoreFocus(fallback?: HTMLElement | null): void;
}
const StoreContext = createContext<ChatStore | null>(null);
const ActionContext = createContext<ChatActions | null>(null);
export function ChatbotProvider({ client, children }: { client: ChatClient; children?: ReactNode }) {
  const [store] = useState(() => createChatStore(client));
  const opener = useRef<HTMLElement | null>(null);
  const [actions] = useState<ChatActions>(() => ({
    ...store.actions,
    openChat(trigger) { opener.current = trigger ?? null; store.actions.open(); },
    restoreFocus(fallback) {
      const target = opener.current?.isConnected && !opener.current.matches(':disabled') ? opener.current : fallback;
      target?.focus({ preventScroll:true });
    },
  }));
  useEffect(() => () => store.dispose(), [store]);
  return <StoreContext.Provider value={store}><ActionContext.Provider value={actions}>{children}</ActionContext.Provider></StoreContext.Provider>;
}
export function useChatActions() { const actions = useContext(ActionContext); if (!actions) throw new Error('ChatbotProvider is required.'); return actions; }
export function useChatSnapshot() {
  const store = useContext(StoreContext); if (!store) throw new Error('ChatbotProvider is required.');
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
