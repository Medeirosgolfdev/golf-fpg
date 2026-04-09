/**
 * src/ui/FilterChip.tsx
 *
 * Botão pill de filtro com estado active/inactive e cor opcional.
 * Substitui a função chip() definida localmente em FPGPage (×2)
 * e MultiRoundLeaderboard.
 *
 * Uso:
 *   <FilterChip active={filter.escs.includes(e)} onClick={() => toggleEsc(e)}>{e}</FilterChip>
 *   <FilterChip active={sel} onClick={toggle} color="var(--accent)">Sub-12</FilterChip>
 */
import React from "react";

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  /** Cor de fundo/border quando active. Padrão: var(--accent) */
  color?: string;
  children: React.ReactNode;
}

export default function FilterChip({ active, onClick, color, children }: FilterChipProps) {
  const accent = color || "var(--accent)";
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: 20,
        border: `1px solid ${active ? accent : "var(--border)"}`,
        background: active ? accent : "var(--bg-hover)",
        color: active ? "#fff" : "var(--text-muted)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        fontWeight: active ? 700 : 500,
      }}
    >
      {children}
    </button>
  );
}
