/**
 * src/ui/circuit/divisionPieces.tsx — a peça que desenha cada parte de uma
 * divisão do CircuitShell, escolhida pelos DADOS que a divisão traz.
 *
 * Fase 0 do modelo comum (22/10/2026): as divisões passam a trazer dados
 * serializáveis (`roundDraws[].draw`, `totals`) em vez de JSX feito pela
 * página. Quem desenha é isto:
 *  - draw de uma volta → `DrawTab` partilhado (`render` da página, se existir, ganha);
 *  - só totais (`format: "totals"`) → UM SÓ CAMINHO (02/11/2026): a prova vai
 *    para o TournamentDetail como prova sem buraco a buraco (`_noHbh`, como as
 *    provas só em PDF da /rfeg) — o MESMO Resumo das provas com cartões; as
 *    colunas próprias (pontos WAGR…) entram como colunas extra do Resumo.
 * Assim os loaders ficam sem React e o Kids 2/scripts podem reaproveitá-los.
 */
import type React from "react";
import DrawTab from "../DrawTab";
import type { CircuitDivision, CircuitRoundDraw } from "./types";
import type { TotalsExtraCol, TotalsNotice, TotalsPlayer } from "../../data/model/types";
import type { Tournament as FPGTournament } from "../../data/fpgTypes";
import type { ExtraColumn } from "../multiRoundTypes";
import { buildFPGTournament, type IntlPlayerIn } from "../../data/intlTournament";
import { gf } from "../../utils/flagUtils";

/** O draw de uma volta: o desenho da página (`render`) ou o DrawTab com os dados. */
export function roundDrawNode(rd: CircuitRoundDraw): React.ReactNode {
  if (rd.render) return rd.render();
  if (!rd.draw) return null;
  return (
    <DrawTab draw={rd.draw} roundNum={rd.round} tournamentDate={rd.tournamentDate}
      results={rd.results} hideCols={rd.hideCols} clubLabel={rd.clubLabel} />
  );
}

/** Aviso por cima de uma tabela (totais, ou o Resumo de qualquer divisão). */
export function noticeNode(n: TotalsNotice): React.ReactNode {
  return n.kind === "aviso"
    ? <div className="notice u-mb-8px" title={n.title}>{n.text}</div>
    : <span className="muted fs-10" title={n.title}>{n.text}</span>;
}

/** Divisão só com totais → a prova sem buraco a buraco que o TournamentDetail
 *  desenha, as colunas extra do Resumo e o aviso por cima. */
export interface TotalsView {
  tournament: FPGTournament;
  accExtraColumns?: ExtraColumn[];
  accHeader?: React.ReactNode;
}

export function totalsDivisionView(d: CircuitDivision, meta: { name: string; date?: string; campo?: string }): TotalsView | null {
  const t = d.totals;
  if (!t?.players.length) return null;
  // Voltas da prova = a última com algum gross (as listas acabam às vezes em vazio).
  const nRounds = Math.max(0, ...t.players.map((p) => p.rounds.reduce<number>((n, g, r) => (g != null && g > 0 ? r + 1 : n), 0)));
  // Cada linha do Resumo leva o `scoreId` do jogador → as colunas extra vão
  // buscar o valor ao jogador original.
  const porId = new Map<string, TotalsPlayer>();
  const players = t.players.map((p, i): IntlPlayerIn => {
    const id = `${i}|${p.name}`;
    porId.set(id, p);
    const jogadas = p.rounds.filter((g) => g != null && g > 0).length;
    // ±par: o da fonte; sem ele, total − par × voltas jogadas.
    const toPar = p.toPar !== undefined ? p.toPar
      : (t.parPerRound && p.total != null ? p.total - t.parPerRound * jogadas : null);
    return {
      // Sem clube (WAGR, EGR, GJGL), a coluna mostra o país com a bandeira.
      id, name: p.name, pos: p.pos ?? null, club: p.club || (p.country ? `${gf(p.country)} ${p.country}`.trim() : ""), country: p.country ?? null,
      total: p.total ?? null, hcp: p.hcp ?? null, toPar,
      rounds: p.rounds.flatMap((g, r) => (g != null && g > 0 ? [{ gross: g, round: r + 1 }] : [])),
      extra: {
        ...(p.birthYear != null ? { birthYear: p.birthYear } : {}),
        ...(p.sex ? { sex: p.sex } : {}),
        ...(p.fed ? { fed: p.fed, fedCode: p.fed } : {}),
      },
    };
  });
  const tournament = buildFPGTournament(
    { name: meta.name, tcode: d.key, date: t.tournamentDate ?? meta.date ?? "", campo: meta.campo ?? "", rounds: nRounds },
    { par: [], holes: 18, parTotal: t.parPerRound ?? null },
    players,
    { keepNoRounds: true, extra: { _noHbh: true, ...(t.officialPos ? { _officialPos: true } : {}) } },
  );
  const accExtraColumns = t.extra?.map((c: TotalsExtraCol): ExtraColumn => {
    const valor = (key?: string) => { const v = key ? porId.get(key)?.[c.field] : undefined; return typeof v === "number" ? v : null; };
    return {
      header: <span title={c.title}>{c.header}</span>,
      className: "ta-c",
      cell: (row) => { const v = valor(row.key); return v == null ? "–" : c.decimals != null ? v.toFixed(c.decimals) : v; },
      sortValue: (row) => valor(row.key),
    };
  });
  return {
    tournament,
    ...(accExtraColumns?.length ? { accExtraColumns } : {}),
    ...(t.notice ? { accHeader: noticeNode(t.notice) } : {}),
  };
}
