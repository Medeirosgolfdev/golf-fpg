/**
 * PrintButton.tsx — botão simples que dispara o diálogo nativo de impressão
 * do browser. Na prática o utilizador pode escolher "Guardar como PDF" ou
 * imprimir directamente.
 *
 * O que aparece no PDF é controlado por `@media print` em App.css, que
 * esconde elementos marcados com `.print-hide` (topbar, sidebar, tabs,
 * filtros, etc.) e estiliza as tabelas de scorecards para caber na folha.
 */
import React from "react";

interface PrintButtonProps {
  /** Texto do botão (default "Imprimir"). */
  label?: string;
  /** Classe CSS extra (default "tourn-ext-link" para integrar na toolbar do torneio). */
  className?: string;
  /** Título do tooltip. */
  title?: string;
  /** Função chamada ANTES do window.print() — útil para ajustar UI (ex:
   *  expandir todos os scorecards colapsados). */
  beforePrint?: () => void;
}

export default function PrintButton({
  label = "Imprimir",
  className = "tourn-ext-link print-hide",
  title = "Imprimir ou guardar como PDF",
  beforePrint,
}: PrintButtonProps) {
  const handleClick = () => {
    if (beforePrint) {
      try { beforePrint(); } catch { /* noop */ }
    }
    // Pequeno delay permite ao DOM aplicar alterações do beforePrint antes
    // do browser tirar o snapshot para impressão.
    setTimeout(() => window.print(), 50);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      title={title}
      style={{
        cursor: "pointer",
        // Garantir que o botão, se usar .tourn-ext-link, tem o mesmo look dos links.
        font: "inherit",
      }}
    >
      🖨 {label}
    </button>
  );
}
