import {
  FileWarning,
  MessagesSquare,
  Network,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { useChatActions } from "../features/chatbot/ChatbotProvider";
export function DashboardQuickActions() {
  const { openChat } = useChatActions();
  return (
    <div className="quick-actions">
      <Button variant="outline" asChild className="quick-action">
        <Link to="/sinistres">
          <FileWarning size={20} />
          <span>
            <strong>Gérer les sinistres</strong>
            <small>Dossiers et déclarations</small>
          </span>
          <ArrowUpRight size={15} />
        </Link>
      </Button>
      <Button
        variant="outline"
        className="quick-action"
        onClick={(event) => openChat(event.currentTarget)}
      >
        <MessagesSquare size={20} />
        <span>
          <strong>Interroger en français</strong>
          <small>Assistant NLP global</small>
        </span>
        <ArrowUpRight size={15} />
      </Button>
      <Button variant="outline" asChild className="quick-action">
        <Link to="/ontologie">
          <Network size={20} />
          <span>
            <strong>Explorer l’ontologie</strong>
            <small>Concepts et relations RDF</small>
          </span>
          <ArrowUpRight size={15} />
        </Link>
      </Button>
    </div>
  );
}
