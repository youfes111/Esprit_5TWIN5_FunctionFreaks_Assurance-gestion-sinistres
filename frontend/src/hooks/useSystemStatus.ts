import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { OntologySummary } from '../types/api';

export function useSystemStatus() {
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<'loading' | 'connected' | 'offline'>('loading');
  const [summary, setSummary] = useState<OntologySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(new Error('Délai de connexion dépassé.')), 8000);
    let active = true;
    setStatus('loading'); setError(null); setSummary(null);
    void (async () => {
      try {
        const health = await api.health(controller.signal);
        if (health.status !== 'ok') throw new Error('Le serveur est indisponible.');
        if (active) setStatus('connected');
        const ontology = await api.summary(controller.signal);
        if (active) setSummary(ontology);
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Connexion impossible.');
          // A summary error does not erase a successful health response.
          setStatus((current) => current === 'connected' ? current : 'offline');
        }
      } finally { window.clearTimeout(timer); }
    })();
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [revision]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return { status, summary, error, refresh };
}
