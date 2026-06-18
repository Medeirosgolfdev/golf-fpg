/**
 * src/ui/Card.tsx
 *
 * Cartão tipado — wrapper da classe global `.card` (definida em App.css).
 * Substitui os ~70 usos avulsos de <div className="card …"> espalhados
 * pelas páginas, dando uma API consistente e auto-documentada.
 *
 * A `.card` já traz: margin vertical (var(--space-section)), padding
 * (var(--space-inner)), borda, raio (--radius-lg), fundo e sombra.
 * Aqui só expomos modificadores comuns como props.
 *
 * Uso:
 *   <Card>…</Card>
 *   <Card pad="lg" className="mb-12">…</Card>
 *   <Card title="Resultados" actions={<button>Exportar</button>}>…</Card>
 *   <Card as="section" overflowHidden>…</Card>
 *
 * Para o cabeçalho de um PAINEL DE DETALHE (título grande + sub-linha),
 * usar antes <DetailHeader>. Este Card é o contentor genérico.
 */
import React from "react";

type PadKey = "none" | "sm" | "md" | "lg";

const PAD_CLASS: Record<PadKey, string> = {
  none: "p-0",
  sm: "p-8",
  md: "",   // usa o padding default da .card (var(--space-inner))
  lg: "p-16",
};

interface CardProps {
  children: React.ReactNode;
  /** Elemento raiz (default "div"). Útil para semântica: "section", "article". */
  as?: keyof React.JSX.IntrinsicElements;
  /** Padding interno. "md" = default da .card. */
  pad?: PadKey;
  /** Recorta conteúdo que excede o raio (tabelas, barras). */
  overflowHidden?: boolean;
  /** Título opcional — renderiza um cabeçalho compacto (.h-md) + acções. */
  title?: React.ReactNode;
  /** Acções à direita do título (botões, links). Requer `title`. */
  actions?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export default function Card({
  children, as = "div", pad = "md", overflowHidden,
  title, actions, className, style, onClick,
}: CardProps) {
  const Tag = as as React.ElementType;
  const cls = [
    "card",
    PAD_CLASS[pad],
    overflowHidden ? "overflow-hidden" : "",
    className || "",
  ].filter(Boolean).join(" ");

  return (
    <Tag className={cls} style={style} onClick={onClick}>
      {(title || actions) && (
        <div className="mb-8" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {title && <div className="h-md" style={{ marginBottom: 0 }}>{title}</div>}
          {actions && <div style={{ display: "flex", gap: 6, alignItems: "center" }}>{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}
