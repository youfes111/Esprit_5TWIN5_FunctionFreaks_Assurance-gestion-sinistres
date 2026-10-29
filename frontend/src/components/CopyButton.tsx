import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from './ui/button';
export function CopyButton({ value, label = 'Copier' }: { value: string; label?: string }) {
  const [message, setMessage] = useState('');
  async function copy() {
    try { if (!navigator.clipboard) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(value); setMessage('Copié'); }
    catch { setMessage('Copie indisponible. Sélectionnez le texte.'); }
  }
  return <span className="inline-flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => { void copy(); }}>{message === 'Copié' ? <Check /> : <Copy />}{label}</Button><span className="sr-only" role="status">{message}</span></span>;
}
