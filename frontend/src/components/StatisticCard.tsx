import { motion, useReducedMotion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { Database } from 'lucide-react';
import { Card } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { cardEntrance, quickTransition } from '../design/motion';
const MotionCard = motion.create(Card);
export function StatisticCard({ label, value, note, loading, icon: Icon = Database }: { label: string; value?: number; note: string; loading: boolean; icon?: LucideIcon }) {
  const reduce = useReducedMotion();
  return <MotionCard className="stat-card" variants={reduce ? undefined : cardEntrance} transition={reduce ? { duration: 0 } : quickTransition} whileHover={reduce ? undefined : { y: -2 }}><div className="stat-top"><span>{label}</span><span className="metric-icon"><Icon size={15} aria-hidden="true" /></span></div>{loading ? <Skeleton className="my-4 h-10 w-20" aria-label="Chargement" /> : <strong>{value?.toLocaleString('fr-FR') ?? '—'}</strong>}<p>{note}</p><span className="metric-accent" aria-hidden="true" /></MotionCard>;
}
