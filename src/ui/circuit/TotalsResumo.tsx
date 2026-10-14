/**
 * src/ui/circuit/TotalsResumo.tsx — Resumo para fontes SÓ COM TOTAIS por volta
 * (EGR, WAGR, GJGL sem buraco a buraco) — 14/10/2026, «tudo homogéneo».
 *
 * Antes cada página tinha a sua tabela («R1 R2 R3 ± Tot», «R1 R2 R3 TOT PTS»,
 * a dtable do GJGL). Agora é o MESMO Resumo das outras secções: linha de
 * resumo (classif. · nR · Par · Média), barra de filtros e o
 * MultiRoundLeaderboard (±Par · Total · R1 ± · R2 ± …), sem as colunas de
 * birdies/SD (não há buracos).
 */
import type React from "react";
import { MultiRoundLeaderboard } from "../MultiRoundLeaderboard";
import type { MultiRoundRow, ExtraColumn } from "../multiRoundTypes";
import { RoundPill } from "../PillBadge";
import { gf } from "../../utils/flagUtils";
import { isManuelByName } from "../../constants/manuel";

export interface TotalsPlayer {
  name: string;
  country?: string | null;
  club?: string | null;
  hcp?: number | null;
  /** Ano de nascimento (exacto ou estimado) — coluna Nasc. */
  birthYear?: number | null;
  pos?: number | null;
  /** Gross de cada volta, por ordem (null = não jogou). */
  rounds: (number | null)[];
  total?: number | null;
  /** Colunas extra (ex.: pontos WAGR) — lidas pelos `extra`. */
  [k: string]: unknown;
}

const isPt = (c?: string | null) => /portugal/i.test(c || "") || /^(pt|prt|por)$/i.test(c || "");

export default function TotalsResumo({ players, parPerRound, notice, extra, tournamentDate }: {
  players: TotalsPlayer[];
  /** Par de UMA volta (null = desconhecido → sem ±par). */
  parPerRound: number | null;
  /** Aviso por cima (ex.: «só os que pontuaram»). */
  notice?: React.ReactNode;
  extra?: { header: string; title?: string; value: (p: TotalsPlayer) => React.ReactNode }[];
  tournamentDate?: string;
}) {
  const nRounds = Math.max(0, ...players.map((p) => p.rounds.filter((g) => g != null && g > 0).length));
  const byKey = new Map<string, TotalsPlayer>();
  const rows: MultiRoundRow[] = players.map((p, i) => {
    const played = p.rounds.filter((g): g is number => g != null && g > 0);
    const gross = p.total ?? (played.length ? played.reduce((a, b) => a + b, 0) : null);
    const parTotal = parPerRound ? parPerRound * played.length : undefined;
    const key = `${p.name}-${i}`;
    byKey.set(key, p);
    return {
      key,
      name: p.name,
      pos: p.pos ?? i + 1,
      gross,
      toPar: gross != null && parTotal ? gross - parTotal : null,
      parTotal,
      club: p.club || p.country || "",
      hcp: p.hcp ?? null,
      dob: p.birthYear ? `${p.birthYear}-07-01` : null,
      countryFlag: p.country ? gf(p.country) : undefined,
      isHighlighted: isManuelByName(p.name),
      isPortuguese: !isManuelByName(p.name) && isPt(p.country),
      isIncomplete: nRounds > 0 && played.length < nRounds,
      rounds: Array.from({ length: nRounds }, (_, r) => {
        const g = p.rounds[r];
        return g != null && g > 0 ? { gross: g, parPerRound: parPerRound ?? undefined } : undefined;
      }) as MultiRoundRow["rounds"],
    };
  });

  const complete = rows.filter((r) => !r.isIncomplete && r.gross != null);
  const parTorneio = parPerRound ? parPerRound * nRounds : null;
  const avg = complete.length ? complete.reduce((s, r) => s + (r.gross as number), 0) / complete.length : null;
  const extraColumns: ExtraColumn[] | undefined = extra?.map((x) => ({
    header: <span title={x.title}>{x.header}</span>,
    cell: (row) => x.value(byKey.get(row.key || "")!),
  }));

  return (
    <div>
      {notice}
      <div className="fs-13 fw-600" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", margin: "4px 0 10px", color: "var(--text-2)" }}>
        <span>{complete.length} classif.</span>
        {rows.length > complete.length && <span>· {rows.length - complete.length} inc.</span>}
        {nRounds > 1 && <>· <RoundPill nR={nRounds} /></>}
        {parTorneio && <span>· Par {parTorneio}</span>}
        {avg != null && (
          <span>· Média {avg.toFixed(1)}{parTorneio ? ` (${avg - parTorneio >= 0 ? "+" : ""}${(avg - parTorneio).toFixed(1)})` : ""}</span>
        )}
      </div>
      <MultiRoundLeaderboard
        rows={rows}
        nRounds={nRounds}
        sortable
        filterable
        tournamentDate={tournamentDate}
        showCols={{ esc: false, fed: false, tee: false, roundStats: false, roundToPar: !!parPerRound, toPar: !!parPerRound }}
        extraColumns={extraColumns}
      />
    </div>
  );
}
