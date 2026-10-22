/**
 * src/ui/circuit/TotalsResumo.tsx — Resumo para fontes SÓ COM TOTAIS por volta
 * (EGR, WAGR, GJGL sem buraco a buraco) — 14/10/2026, «tudo homogéneo».
 *
 * Antes cada página tinha a sua tabela («R1 R2 R3 ± Tot», «R1 R2 R3 TOT PTS»,
 * a dtable do GJGL). Agora é o MESMO Resumo das outras secções: linha de
 * resumo (classif. · nR · Par · Média), barra de filtros e o
 * MultiRoundLeaderboard (±Par · Total · R1 ± · R2 ± …), sem as colunas de
 * birdies/SD (não há buracos).
 *
 * Também o leaderboard de totais do NextCaddy (Liguillas: pos/total/±par sem
 * cartões) e os destaques de live scoring (só HiO/eagles/birdies) — 22/10/2026,
 * eram tabelas próprias na RFEGPage.
 */
import type React from "react";
import { MultiRoundLeaderboard } from "../MultiRoundLeaderboard";
import type { MultiRoundRow, ExtraColumn } from "../multiRoundTypes";
import { RoundPill } from "../PillBadge";
import { gf } from "../../utils/flagUtils";
import { isManuelByName } from "../../constants/manuel";
import SexBadge from "../SexBadge";
import { isNoCardGross } from "../../data/intlCommon";

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
  /** ±par da fonte (null = sem ±par); omitido, total − par × voltas jogadas. */
  toPar?: number | null;
  /** Sexo → SexBadge a seguir ao nome. */
  sex?: "M" | "F" | null;
  /** Licença/federado → coluna FED. */
  fed?: string | null;
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
  extra?: { header: string; title?: string; value: (p: TotalsPlayer) => React.ReactNode; sortValue?: (p: TotalsPlayer) => number | string | null }[];
  tournamentDate?: string;
}) {
  // Volta jogada = gross > 0 e não «sem cartão» (≥ 900, regra comum).
  const isCard = (g: number | null | undefined): g is number => g != null && g > 0 && !isNoCardGross(g);
  const nRounds = Math.max(0, ...players.map((p) => p.rounds.filter(isCard).length));
  const byKey = new Map<string, TotalsPlayer>();
  const rows: MultiRoundRow[] = players.map((p, i) => {
    const played = p.rounds.filter(isCard);
    const gross = isNoCardGross(p.total) ? null : (p.total ?? (played.length ? played.reduce((a, b) => a + b, 0) : null));
    const parTotal = parPerRound ? parPerRound * played.length : undefined;
    const key = `${p.name}-${i}`;
    byKey.set(key, p);
    return {
      key,
      name: p.name,
      pos: p.pos ?? i + 1,
      gross,
      toPar: p.toPar !== undefined ? p.toPar : (gross != null && parTotal ? gross - parTotal : null),
      parTotal,
      club: p.club || p.country || "",
      hcp: p.hcp ?? null,
      ...(p.fed ? { fed: p.fed } : {}),
      ...(p.sex ? { sex: p.sex } : {}),
      dob: p.birthYear ? `${p.birthYear}-07-01` : null,
      countryFlag: p.country ? gf(p.country) : undefined,
      isHighlighted: isManuelByName(p.name),
      isPortuguese: !isManuelByName(p.name) && isPt(p.country),
      isIncomplete: nRounds > 0 && played.length < nRounds,
      rounds: Array.from({ length: nRounds }, (_, r) => {
        const g = p.rounds[r];
        return isCard(g) ? { gross: g, parPerRound: parPerRound ?? undefined } : undefined;
      }) as MultiRoundRow["rounds"],
    };
  });

  const complete = rows.filter((r) => !r.isIncomplete && r.gross != null);
  const parTorneio = parPerRound ? parPerRound * nRounds : null;
  const avg = complete.length ? complete.reduce((s, r) => s + (r.gross as number), 0) / complete.length : null;
  const extraColumns: ExtraColumn[] | undefined = extra?.map((x) => ({
    header: <span title={x.title}>{x.header}</span>,
    cell: (row) => x.value(byKey.get(row.key || "")!),
    ...(x.sortValue ? { sortValue: (row: MultiRoundRow) => x.sortValue!(byKey.get(row.key || "")!) } : {}),
  }));
  const hasToPar = !!parPerRound || players.some((p) => typeof p.toPar === "number");
  const hasGross = rows.some((r) => r.gross != null);
  // SexBadge a seguir ao nome (mesmo desenho do nome por omissão da tabela).
  const renderName = players.some((p) => p.sex) ? (row: MultiRoundRow) => (
    <>
      {row.countryFlag && <>{row.countryFlag} </>}<span className="fw-700">{row.name}</span>
      {(row.sex === "M" || row.sex === "F") && <> <SexBadge sex={row.sex} /></>}
    </>
  ) : undefined;

  return (
    <div>
      {notice}
      <div className="fs-13 fw-600" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", margin: "4px 0 10px", color: "var(--text-2)" }}>
        <span>{hasGross ? `${complete.length} classif.` : `${rows.length} jogadores`}</span>
        {hasGross && rows.length > complete.length && <span>· {rows.length - complete.length} inc.</span>}
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
        showCols={{ esc: false, fed: players.some((p) => !!p.fed), tee: false, roundStats: false, roundToPar: !!parPerRound, toPar: hasToPar, gross: hasGross }}
        extraColumns={extraColumns}
        renderName={renderName}
      />
    </div>
  );
}
