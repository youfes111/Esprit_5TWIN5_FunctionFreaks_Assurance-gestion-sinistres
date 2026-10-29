import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatActions } from './ChatbotProvider';
export function LegacyAssistantRedirect() {
  const actions = useChatActions(); const navigate = useNavigate();
  useEffect(() => { actions.openChat(); navigate('/', { replace:true }); }, [actions, navigate]);
  return <p role="status">Ouverture de l’assistant NLP…</p>;
}
