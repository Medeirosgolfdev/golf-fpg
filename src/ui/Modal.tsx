/**
 * Modal — janela por cima da página, a mesma em todo o lado: fundo escurecido,
 * fecha ao clicar fora ou com Esc. Com `title` desenha o cabeçalho (título + ✕
 * global); sem ele (`bare`) o conteúdo traz o seu próprio cabeçalho (os popups
 * do Calendário, com a cor do evento). Antes eram 4 cópias à mão.
 *
 * `size`: "sm" 380px · "md" 600px · "lg" 900px.
 */
import { useEffect, type ReactNode } from "react";
import CloseButton from "./CloseButton";

interface ModalProps {
  onClose: () => void;
  title?: ReactNode;
  /** Linha por baixo do título (campo, data…). */
  subtitle?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Sem enchimento nem cabeçalho — o conteúdo desenha o seu. */
  bare?: boolean;
  className?: string;
  children: ReactNode;
}

export default function Modal({ onClose, title, subtitle, size = "md", bare, className, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
        className={`modal-panel is-${size}` + (bare ? " is-bare" : "") + (className ? " " + className : "")}>
        {!bare && (title != null || subtitle != null) && (
          <div className="modal-head">
            <div>
              {title != null && <div className="modal-title">{title}</div>}
              {subtitle != null && <div className="muted fs-11">{subtitle}</div>}
            </div>
            <CloseButton onClick={onClose} />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
