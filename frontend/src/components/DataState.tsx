import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, Database } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import { entrance } from '../design/motion';
export function DataState({ loading, error, empty, label = 'Aucune donnée disponible.' }: { loading?: boolean; error?: string; empty?: boolean; label?: string }) {
  const reduce = useReducedMotion();
  return <AnimatePresence mode="wait">{loading ? <motion.div key="loading" {...entrance(reduce)} className="data-skeleton" role="status" aria-label="Chargement des données RDF"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><span className="sr-only">Chargement…</span></motion.div> : error ? <motion.div key="error" {...entrance(reduce)} className="error-message" role="alert"><AlertCircle size={16} />{error}</motion.div> : empty ? <motion.div key="empty" {...entrance(reduce)} className="data-empty" role="status"><Database size={25} /><p>{label}</p></motion.div> : null}</AnimatePresence>;
}
