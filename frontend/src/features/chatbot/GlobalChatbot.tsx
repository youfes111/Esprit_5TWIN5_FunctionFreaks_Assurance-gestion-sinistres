import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Bot, X } from "lucide-react";
import { Dialog, DialogTrigger } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { useChatActions, useChatSnapshot } from "./ChatbotProvider";
const ChatbotPanel = lazy(() =>
  import("./ChatbotPanel").then((module) => ({ default: module.ChatbotPanel })),
);
const MotionButton = motion.create(Button);
export function GlobalChatbot() {
  const state = useChatSnapshot();
  const actions = useChatActions();
  const reduce = useReducedMotion();
  const launcher = useRef<HTMLButtonElement | null>(null);
  const [mobile, setMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 640px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const change = () => setMobile(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return (
    <Dialog
      modal={mobile}
      open={state.open}
      onOpenChange={(open) => {
        if (open) actions.openChat(launcher.current);
        else actions.close();
      }}
    >
      <div className="chatbot-launcher">
        <DialogTrigger asChild>
          <MotionButton
            whileHover={reduce ? undefined : { y: -2 }}
            whileTap={reduce ? undefined : { scale: 0.97 }}
            ref={launcher}
            className="chatbot-fab"
            aria-label={
              state.open ? "Fermer l’assistant NLP" : "Ouvrir l’assistant NLP"
            }
            aria-controls="global-nlp-panel"
            aria-expanded={state.open}
          >
            {state.open ? <X /> : <Bot />}
            <span>Assistant NLP</span>
          </MotionButton>
        </DialogTrigger>
      </div>
      <Suspense
        fallback={
          state.open ? (
            <p className="chat-loading" role="status">
              Ouverture de l’assistant…
            </p>
          ) : null
        }
      >
        <AnimatePresence initial={false}>
          {state.open && (
            <ChatbotPanel key="panel" mobile={mobile} launcher={launcher} />
          )}
        </AnimatePresence>
      </Suspense>
    </Dialog>
  );
}
