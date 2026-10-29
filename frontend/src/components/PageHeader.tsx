import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Badge } from './ui/badge';
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <header className="page-heading"><div><Badge variant="outline" className="eyebrow-badge">{eyebrow}</Badge><h1 ref={heading} tabIndex={-1}>{title}</h1><p>{description}</p></div>{actions && <div className="page-heading-actions">{actions}</div>}</header>;
}
