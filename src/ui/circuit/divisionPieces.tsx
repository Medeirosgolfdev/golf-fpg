/**
 * src/ui/circuit/divisionPieces.tsx — a peça que desenha cada parte de uma
 * divisão do CircuitShell, escolhida pelos DADOS que a divisão traz.
 *
 * Fase 0 do modelo comum (22/10/2026): as divisões passam a trazer dados
 * serializáveis (`roundDraws[].draw`, `totals`) em vez de JSX feito pela
 * página. Quem desenha é isto:
 *  - draw de uma volta → `DrawTab` partilhado (`render` da página, se existir, ganha);
 *  - só totais (`format: "totals"`) → `TotalsResumo` (`customResults`, se existir, ganha).
 * Assim os loaders ficam sem React e o Kids 2/scripts podem reaproveitá-los.
 */
import type React from "react";
import DrawTab from "../DrawTab";
import TotalsResumo, { type TotalsPlayer } from "./TotalsResumo";
import type { CircuitDivision, CircuitRoundDraw } from "./types";
import type { TotalsExtraCol, TotalsNotice } from "../../data/model/types";

/** O draw de uma volta: o desenho da página (`render`) ou o DrawTab com os dados. */
export function roundDrawNode(rd: CircuitRoundDraw): React.ReactNode {
  if (rd.render) return rd.render();
  if (!rd.draw) return null;
  return (
    <DrawTab draw={rd.draw} roundNum={rd.round} tournamentDate={rd.tournamentDate}
      results={rd.results} hideCols={rd.hideCols} clubLabel={rd.clubLabel} />
  );
}

/** Aviso por cima da tabela de totais. */
function noticeNode(n: TotalsNotice): React.ReactNode {
  return n.kind === "aviso"
    ? <div className="notice" style={{ marginBottom: 8 }} title={n.title}>{n.text}</div>
    : <span className="muted fs-10" title={n.title}>{n.text}</span>;
}

/** Coluna extra de totais (dados → coluna do TotalsResumo). */
function extraCol(c: TotalsExtraCol) {
  return {
    header: c.header, title: c.title,
    value: (p: TotalsPlayer) => {
      const v = p[c.field];
      return typeof v === "number" ? (c.decimals != null ? v.toFixed(c.decimals) : v) : "–";
    },
  };
}

/** Resultados de uma divisão sem cartões: o desenho da página
 *  (`customResults`) ou o TotalsResumo a partir de `totals`. */
export function divisionResultsNode(d: CircuitDivision): React.ReactNode {
  if (d.customResults !== undefined) return d.customResults;
  const t = d.totals;
  if (!t) return undefined;
  return (
    <TotalsResumo parPerRound={t.parPerRound} tournamentDate={t.tournamentDate} players={t.players}
      notice={t.notice ? noticeNode(t.notice) : undefined}
      extra={t.extra?.length ? t.extra.map(extraCol) : undefined} />
  );
}
