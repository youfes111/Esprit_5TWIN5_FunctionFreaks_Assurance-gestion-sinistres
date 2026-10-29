import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { Bot, X, Send, Eraser, Sparkles } from 'lucide-react';
import { DialogContent, DialogTitle, DialogDescription, DialogClose } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../../components/ui/accordion';
import { ChatMessage } from './ChatMessage';
import { useChatActions, useChatSnapshot } from './ChatbotProvider';
import { quickTransition } from '../../design/motion';
export function ChatbotPanel({ mobile, launcher }: { mobile: boolean; launcher: React.RefObject<HTMLButtonElement | null> }) {
  const state = useChatSnapshot(); const actions = useChatActions();
  const input = useRef<HTMLTextAreaElement | null>(null);
  const log = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion(); const present = useIsPresent();
  useEffect(() => {
    const element = log.current; if (element) element.scrollTop = element.scrollHeight;
  }, [state.turns, state.busy]);
  useEffect(() => {
    if (!mobile || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty('--chat-viewport-height', `${viewport.height}px`);
      document.documentElement.style.setProperty('--chat-keyboard-inset', `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
    };
    update(); viewport.addEventListener('resize', update); viewport.addEventListener('scroll', update);
    return () => { viewport.removeEventListener('resize', update); viewport.removeEventListener('scroll', update); document.documentElement.style.removeProperty('--chat-viewport-height'); document.documentElement.style.removeProperty('--chat-keyboard-inset'); };
  }, [mobile]);
  return <DialogContent asChild forceMount showCloseButton={false} onOpenAutoFocus={event => { event.preventDefault(); input.current?.focus({ preventScroll:true }); }} onCloseAutoFocus={event => { event.preventDefault(); actions.restoreFocus(launcher.current); }} onInteractOutside={event => { if (!mobile) event.preventDefault(); }}>
    <motion.section id="global-nlp-panel" className="chatbot-panel" initial={reduce ? false : { opacity:0, y:16, scale:.98 }} animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:reduce ? 1 : 0, y:reduce ? 0 : 12, scale:reduce ? 1 : .98 }} transition={reduce ? { duration:0 } : quickTransition} style={{ pointerEvents:present ? 'auto' : 'none' }}>
      <header className="chatbot-header"><span className="chat-avatar"><Bot size={22} /></span><div><DialogTitle>Assurance Intelligence</DialogTitle><DialogDescription>NLP français · RDF · Lecture seule</DialogDescription></div><Button size="icon" variant="ghost" aria-label="Effacer la conversation" title="Effacer la conversation" disabled={state.busy || !state.turns.length} onClick={actions.clear}><Eraser size={16} /></Button><DialogClose asChild><Button size="icon" variant="ghost" aria-label="Fermer l’assistant"><X /></Button></DialogClose></header>
      <div ref={log} className="chatbot-body" role="log" aria-label="Conversation NLP" aria-live="polite" aria-busy={state.busy}>
        {state.turns.length === 0 && <div className="chat-welcome"><span className="metric-icon"><Sparkles /></span><h2>Bonjour. Que souhaitez-vous explorer ?</h2><p>Consultez les sinistres, assurés ou contrats. Je montre comment chaque question devient un SELECT.</p><Badge variant="outline">Pas de LLM · Aucune modification</Badge>{state.examplesStatus === 'loading' && <p role="status">Chargement des suggestions…</p>}{state.examplesError && <p role="status">{state.examplesError}<Button variant="link" onClick={() => { void actions.retryExamples(); }}>Réessayer</Button></p>}<div className="chat-suggestions">{state.examples.slice(0,4).map(example => <motion.div key={example} whileHover={reduce ? undefined : { x:2 }}><Button variant="outline" onClick={() => { actions.setQuestion(example); input.current?.focus(); }}>{example}</Button></motion.div>)}</div>{state.examples.length > 4 && <Accordion type="single" collapsible><AccordionItem value="examples" className="border-0"><AccordionTrigger className="text-xs">Toutes les questions suggérées</AccordionTrigger><AccordionContent><div className="chat-suggestions">{state.examples.slice(4).map(example => <Button key={example} variant="ghost" onClick={() => { actions.setQuestion(example); input.current?.focus(); }}>{example}</Button>)}</div></AccordionContent></AccordionItem></Accordion>}</div>}
        <AnimatePresence initial={false}>{state.turns.map(turn => <ChatMessage key={turn.id} turn={turn} />)}</AnimatePresence>
      </div>
      <form className="chatbot-composer" onSubmit={event => { event.preventDefault(); void actions.submit(); }}><label htmlFor="global-nlp-question" className="sr-only">Votre question en français</label><div><Textarea id="global-nlp-question" ref={input} rows={2} minLength={3} maxLength={500} required value={state.question} disabled={state.busy} placeholder="Votre question en français…" aria-describedby="global-nlp-help" onChange={event => actions.setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><Button type="submit" size="icon" disabled={state.busy || state.question.trim().length < 3} aria-label="Envoyer la question"><Send size={17} /></Button></div><small id="global-nlp-help">{state.busy ? 'Interrogation du graphe en cours…' : 'Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne'}{state.question.length > 400 && ` · ${state.question.length}/500`}</small></form>
    </motion.section>
  </DialogContent>;
}
