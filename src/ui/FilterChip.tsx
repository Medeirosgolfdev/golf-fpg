/**
 * src/ui/FilterChip.tsx
 *
 * Botão pill de filtro com estado active/inactive e cor opcional.
 * Substitui a função chip() definida localmente em FPGPage (×2)
 * e MultiRoundLeaderboard. Aspecto em `.filter-chip` (App.css); a cor de
 * «ligado» chega pela variável `--chip-c` (escalão, tee, sexo…).
 *
 * Uso:
 *   <FilterChip active={filter.escs.includes(e)} onClick={() => toggleEsc(e)}>{e}</FilterChip>
 *   <FilterChip active={sel} onClick={toggle} color="var(--accent)">Sub-12</FilterChip>
 */
import type { CSSProperties, ReactNode } from "react";

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  /** Cor de fundo/border quando active. Padrão: var(--accent) */
  color?: string;
  children: ReactNode;
}

export default function FilterChip({ active, onClick, color, children }: FilterChipProps) {
  return (
    <button type="button" className={`filter-chip${active ? " active" : ""}`} onClick={onClick}
      style={color ? { "--chip-c": color } as CSSProperties : undefined}>
      {children}
    </button>
  );
}
