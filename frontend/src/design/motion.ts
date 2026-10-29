export const quickTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };
export function entrance(reduced: boolean | null) {
  return { initial: reduced ? false as const : { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: reduced ? 1 : 0, y: reduced ? 0 : -6 }, transition: reduced ? { duration: 0 } : quickTransition };
}
export const staggerChildren = { hidden: {}, show: { transition: { staggerChildren: 0.045 } } };
export const cardEntrance = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };
