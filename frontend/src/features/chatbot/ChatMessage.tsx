import { memo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Bot, UserRound } from 'lucide-react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../../components/ui/accordion';
import { Badge } from '../../components/ui/badge';
import { NlpResults } from '../../components/NlpResults';
import { ChatbotResults } from '../../components/ChatbotResults';
import { ProcessingIndicator } from '../../components/ProcessingIndicator';
import { entrance } from '../../design/motion';
import { chatExplanation, resultCountLabel } from '../../utils/rdf-presentation';
import type { ChatTurn } from './store';
export const ChatMessage = memo(function ChatMessage({ turn }: { turn: ChatTurn }) {
  const reduce = useReducedMotion();
  const answer = turn.answer;
  return <motion.article className="chat-turn" {...entrance(reduce)}>
    <div className="chat-user"><span><UserRound size={11} />Vous</span><p>{turn.question}</p></div>
    <div className="chat-answer"><div className="chat-speaker"><Bot size={14} />Assistant NLP</div>
      {answer ? <>
        <p className="chat-explanation">{chatExplanation(answer)}</p>
        {answer.results.results.bindings.length > 0 && <div className="chat-result-meta"><Badge variant="secondary">{resultCountLabel(answer.results.results.bindings.length)}</Badge></div>}
        <ChatbotResults results={answer.results} />
        {answer.truncated && <p className="chat-results-limit" role="status">Résultats partiels : seuls les 100 premiers sont affichés.</p>}
        <Accordion type="single" collapsible className="chat-technical-analysis"><AccordionItem value="analysis" className="border-0">
          <AccordionTrigger className="text-xs py-3">Voir l’analyse NLP</AccordionTrigger>
          <AccordionContent><NlpResults answer={answer} defaultTab="analysis" compact /></AccordionContent>
        </AccordionItem></Accordion>
      </> : turn.error ? <p className="error-message" role="alert">{turn.error}</p> : <ProcessingIndicator />}
    </div>
  </motion.article>;
});
