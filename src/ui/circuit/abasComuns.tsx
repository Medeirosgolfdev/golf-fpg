/**
 * abasComuns — a DEFINIÇÃO das abas que todas as páginas de torneios têm a
 * seguir às da prova: «Edições anteriores», «Scorecards anteriores» e «Scout».
 * Chave, nome, regra de quando aparecem e a protecção contra erros vivem aqui e
 * só aqui (11/11/2026): o CircuitShell monta-as para todas as páginas e a /FPG
 * usa a mesma definição com as SUAS edições (lá a identidade de uma prova é
 * clube + família do nome + nomes rebaptizados à mão, uma prova por código —
 * `pages/fpg/fpgPastEditions.tsx`). Mudar um nome aqui muda em todo o lado.
 *
 * «Edições anteriores» (tabela-resumo de cada ano) e «Scorecards anteriores»
 * (os cartões) são DUAS abas e ficam as duas.
 */
import type React from "react";
import SectionErrorBoundary from "../SectionErrorBoundary";
import { CircuitPastEditionsTab } from "./pastEditions";
import { CircuitPastScorecardsTab } from "./PastScorecardsTab";
import type { CircuitDivision, CircuitEntry, CircuitTab } from "./types";

/** Mínimo de edições para haver com que comparar. */
export const MIN_EDICOES = 2;

/** «Edições anteriores» + «Scorecards anteriores» das edições irmãs de uma prova
 *  (a de hoje incluída). Menos de duas edições → nenhuma aba.
 *
 *  ⚠ Cada aba no seu error boundary: são carregadas com a página, e um erro lá
 *  dentro derrubava a página inteira (aconteceu na /FPG a 02/09/2026). */
export function abasDeEdicoes({ editions, division, currentId, match }: {
  editions: CircuitEntry[];
  /** Rótulo do escalão aberto — é com ele que cada edição escolhe a sua divisão. */
  division: string;
  /** Id da edição de HOJE dentro de `editions` (fica de fora dos cartões). */
  currentId: string;
  match?: (divisions: CircuitDivision[], label: string) => CircuitDivision | null;
}): CircuitTab[] {
  if (editions.length < MIN_EDICOES) return [];
  return [
    {
      key: "past-editions", label: "Edições anteriores",
      content: (
        <SectionErrorBoundary label="Edições anteriores">
          <CircuitPastEditionsTab editions={editions} division={division} match={match} />
        </SectionErrorBoundary>
      ),
    },
    {
      key: "sc-edicoes", label: "Scorecards anteriores",
      content: (
        <SectionErrorBoundary label="Scorecards anteriores">
          <CircuitPastScorecardsTab editions={editions} division={division} currentId={currentId} match={match} />
        </SectionErrorBoundary>
      ),
    },
  ];
}

/** A aba «Scout» — o conteúdo é sempre o `ScoutProva` (directo ou pelo
 *  `ScoutDoCircuito`, que lhe carrega as edições). */
export function abaScout(conteudo: React.ReactNode): CircuitTab {
  return { key: "scout", label: "Scout", content: <SectionErrorBoundary label="Scout">{conteudo}</SectionErrorBoundary> };
}
