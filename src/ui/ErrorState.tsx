/**
 * ErrorState — a mensagem de erro, a mesma em todas as páginas: caixa vermelha
 * (.notice-error) com ⚠️, o texto, o detalhe técnico (opcional, em letra de
 * código) e, se houver, «Tentar de novo». Antes havia 7 aspectos (caixa
 * vermelha, «sem dados» cinzento, texto âmbar, vermelho solto…).
 */
import type { ReactNode } from "react";

interface ErrorStateProps {
  /** O que falhou, em português («Erro ao carregar o ranking»). */
  message: ReactNode;
  /** Mensagem técnica do erro (fica por baixo, em letra de código). */
  detail?: string | null;
  onRetry?: () => void;
  className?: string;
}

export default function ErrorState({ message, detail, onRetry, className }: ErrorStateProps) {
  return (
    <div role="alert" className={"notice-error error-state" + (className ? " " + className : "")}>
      <div className="error-state-msg">⚠️ {message}</div>
      {detail && <div className="error-state-detail">{detail}</div>}
      {onRetry && <button type="button" className="btn mt-8" onClick={onRetry}>Tentar de novo</button>}
    </div>
  );
}
