/**
 * src/ui/ModoClassifTabs.tsx — os separadores da modalidade da classificação
 * (Stroke Play · Medal Net · Stableford Net), a mesma peça nas tabelas de volta
 * (`ScorecardLB`) e no Resumo (`AccumulatedLB`). Estavam copiados nas duas
 * (10/11/2026); só o texto de ajuda muda quando se somam as voltas.
 */
import TabRow from "./TabRow";
import type { ModoClassif } from "../data/fpgModalidades";

const MODOS: Array<{ key: ModoClassif; label: string; title: string; titleAcumulado: string }> = [
  { key: "stroke", label: "Stroke Play", title: "Pancadas, sem handicap", titleAcumulado: "Pancadas, sem handicap" },
  { key: "medalNet", label: "Medal Net", title: "Pancadas menos o HCP de jogo", titleAcumulado: "Pancadas menos o HCP de jogo, somadas as voltas" },
  { key: "stbNet", label: "Stableford Net", title: "Pontos Stableford com o HCP de jogo (2 pontos no par líquido)", titleAcumulado: "Pontos Stableford com o HCP de jogo, somadas as voltas" },
];

export default function ModoClassifTabs({ active, onChange, modoDaProva, acumulado = false }: {
  active: ModoClassif;
  onChange: (modo: ModoClassif) => void;
  /** A modalidade oficial da prova — leva o «✓». */
  modoDaProva?: ModoClassif | null;
  /** Resumo de várias voltas: a ajuda diz «somadas as voltas». */
  acumulado?: boolean;
}) {
  return (
    <TabRow className="seg-sm" ariaLabel="Modalidade da classificação" active={active} onChange={onChange}
      tabs={MODOS.map((m) => {
        const ajuda = acumulado ? m.titleAcumulado : m.title;
        return {
          key: m.key,
          label: m.label + (modoDaProva === m.key ? " ✓" : ""),
          title: modoDaProva === m.key ? `${ajuda} — a modalidade desta prova` : ajuda,
        };
      })} />
  );
}
