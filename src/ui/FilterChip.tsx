/**
 * src/ui/FilterChip.tsx
 *
 * Botão pill de filtro com estado active/inactive.
 * Substitui a função chip() definida localmente em FPGPage (×2)
 * e MultiRoundLeaderboard. Aspecto em `.filter-chip` (App.css): desligado
 * cinzento, ligado SEMPRE verde `--accent` (regra global, Mariana 31/10 e 03/11/2026;
 * antes cada chip ligado tinha a cor do escalão/tee/sexo).
 *
 * Uso:
 *   <FilterChip active={filter.escs.includes(e)} onClick={() => toggleEsc(e)}>{e}</FilterChip>
 */
import type { ReactNode } from "react";

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

export default function FilterChip({ active, onClick, children }: FilterChipProps) {
  return (
    <button type="button" className={`filter-chip${active ? " active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}
