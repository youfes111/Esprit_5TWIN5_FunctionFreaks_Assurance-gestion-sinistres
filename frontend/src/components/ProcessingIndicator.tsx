import { motion, useReducedMotion } from 'motion/react';
export function ProcessingIndicator() {
  const reduce = useReducedMotion();
  return <div className="processing-state" role="status"><span className="processing-dots" aria-hidden="true">{[0,1,2].map((index) => <motion.i key={index} animate={reduce ? { opacity: 1 } : { opacity: [.35, 1, .35] }} transition={reduce ? { duration: 0 } : { duration: 1, repeat: Infinity, delay: index * .15 }} />)}</span>Analyse linguistique et lecture du graphe…</div>;
}
