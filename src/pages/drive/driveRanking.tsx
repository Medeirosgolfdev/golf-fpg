/**
 * src/pages/drive/driveRanking.tsx — o Ranking do Drive (Sub-12 e restantes
 * escalões) como capacidade `ranking` do CircuitShell (decisões D e G, 22/10/2026).
 *
 * As linhas saem dos torneios que o shell mostra (série/ano/zona da barra, ★Manuel,
 * pesquisa) — os pontos são SEMPRE os do campo todo do torneio original
 * (`buildSub12Data`, regra em `constants/drivePoints.ts`), nunca os das cópias da
 * «Classificação» por escalão. Três vistas: Tabela (a grelha por torneio), Ranking
 * (a `RankingTable`, ordenável) e Evolução (SD). A aba «Época» de cada torneio
 * mostra a mesma tabela só com as etapas da época (série/zona/ano).
 */
import type React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import type { Tournament } from "../../data/fpgTypes";
import type { CircuitEntry } from "../../ui/circuit/types";
import type { CircuitRanking, CircuitRankingContext } from "../../ui/circuit/CircuitRanking";
import { RankingTable, type RankingCol } from "../../ui/ranking/RankingPage";
import { buildSub12Data, dateToSort, filterBySub12Series, sub12Kpis, sub12Tournaments } from "../../data/drive/driveSub12";
import type { DriveSeries } from "../../data/drive/driveSource";
import type { Sub12View } from "../../data/drive/driveUrl";
import { escalaoCanon } from "../../data/model/escalao";
import type { TemporalEscLookup } from "../../data/fpgUtils";
import { ESCALOES_DRIVE } from "../../constants/escaloes";
import { fmtToPar, fmtHcp, medal, shortDateSlash } from "../../utils/format";
import { sdClassByHcp } from "../../utils/scoreDisplay";
import { flagOrEmpty } from "../../utils/flagUtils";
import { C } from "../../utils/colors";
import { norm } from "../../utils/format";
import SexBadge from "../../ui/SexBadge";
import KpiCard from "../../ui/KpiCard";
import PlayerLink from "../../ui/PlayerLink";
import TournamentGrid from "../../ui/TournamentGrid";
import type { PlayersDB } from "../../ui/tournamentPrimitives";
import type { EscLookup, Sub12Row, TournResult } from "../../ui/driveTypes";

export const SERIE_LABELS: Record<DriveSeries, string> = { tour: "Tour", challenge: "Challenge", aquapor: "AQUAPOR" };
const REGION_LABEL: Record<string, string> = { norte: "Norte", tejo: "Tejo", sul: "Sul", madeira: "Madeira", acores: "Açores", nacional: "Nacional" };
export const regionLabel = (r: string): string => REGION_LABEL[r.toLowerCase()] || r;

/* ── Peças pequenas ─────────────────────────────────────────────── */
function SdSpan({ sd, hcp }: { sd: number | null; hcp?: number | null }) {
  if (sd == null) return <span className="c-muted">–</span>;
  return <span className={"p p-sm fs-11 p-" + sdClassByHcp(sd, hcp ?? null)}>{sd.toFixed(1)}</span>;
}
function ToParSpan({ tp }: { tp: number | null }) {
  if (tp == null) return <span className="c-muted">–</span>;
  return <span className={"fw-700 fs-11" + (tp < 0 ? " c-good" : tp > 0 ? " c-danger" : "")}>{fmtToPar(tp)}</span>;
}

/** O `ccode|tcode|data` de um torneio (sem sufixo de volta). */
const tkeyOf = (t: { ccode?: string | null; tcode?: string | null; date?: string | null }) =>
  `${t.ccode}|${String(t.tcode ?? "").replace(/_R\d+$|_Total$/, "")}|${t.date}`;

/** Os torneios ORIGINAIS (lista expandida: só a volta única ou o Resumo) dos
 *  torneios das entradas — os pontos contam com o campo todo. */
export function rankingTournaments(entries: CircuitEntry[], expanded: Tournament[]): Tournament[] {
  const keys = new Set<string>();
  for (const e of entries) for (const d of e.divisions ?? []) if (d.results) keys.add(tkeyOf(d.results));
  return expanded.filter(t => (!t._roundLabel || t._roundLabel === "Resumo") && keys.has(tkeyOf(t)));
}

/** O escalão da «Época»: o da divisão aberta quando é um «Sub N», senão todos. */
export function seasonEscalao(division: string | null | undefined): string {
  const c = escalaoCanon(division ?? "", "fpg");
  return c && ESCALOES_DRIVE.includes(c) ? c : "all";
}

/* ── Vistas ─────────────────────────────────────────────────────── */
function EvolutionChart({ rows }: { rows: Sub12Row[] }) {
  const eligible = rows.filter(p => p.results.filter(r => r.sd != null).length >= 2);
  if (!eligible.length) {
    return <div className="card"><div className="h-xs">Evolução SD</div><div className="muted">Dados insuficientes (mínimo 2 torneios por jogador)</div></div>;
  }
  const top = [...eligible].sort((a, b) => b.results.filter(r => r.sd != null).length - a.results.filter(r => r.sd != null).length).slice(0, 10);
  const allDates = [...new Set(top.flatMap(p => p.results.filter(r => r.sd != null).map(r => r.date)))].sort((a, b) => dateToSort(a) - dateToSort(b));
  const chartData = allDates.map(d => {
    const point: Record<string, string | number | null> = { date: shortDateSlash(d) };
    for (const p of top) { const res = p.results.find(r => r.date === d && r.sd != null); if (res) point[p.fed] = res.sd; }
    return point;
  });
  return (
    <div className="card">
      <div className="h-xs">Evolução SD ao longo da época</div>
      <div className="w-full mt-8 drive-evo-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={["dataMin - 2", "dataMax + 2"]} />
            <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
              formatter={(value, name) => { const p = top.find(x => x.fed === name); return [value != null ? (value as number).toFixed(1) : "", p?.name || name]; }} />
            <Legend formatter={(value: string) => { const p = top.find(x => x.fed === value); return <span className="fs-10">{p?.name || value}</span>; }} />
            <ReferenceLine y={36} stroke="var(--color-danger)" strokeDasharray="4 4" strokeWidth={1} />
            {top.map((p, i) => (
              <Line key={p.fed} type="monotone" dataKey={p.fed} stroke={C.charts[i % C.charts.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const RESULT_COLS: RankingCol<TournResult>[] = [
  { key: "date", label: "Data", sort: r => r.dateSort, cell: r => r.date, tdClassName: "mono fs-10" },
  { key: "tourn", label: "Torneio", sort: r => norm(r.tournName), firstDir: "asc",
    cell: r => <><span className="fw-600">{r.tournName}</span><span className={`badge-serie drive-serie drive-serie-${r.series} ml-4`}>{SERIE_LABELS[r.series]}</span></> },
  { key: "campo", label: "Campo", sort: r => norm(r.campo), firstDir: "asc", cell: r => r.campo, tdClassName: "c-muted fs-10" },
  { key: "pos", label: "Pos", className: "num", sort: r => typeof r.pos === "number" ? r.pos : 999, firstDir: "asc",
    cell: r => <span className="mono">{r.pos ?? "–"}<span className="c-muted fs-10">/{r.totalPlayers}</span></span> },
  { key: "gross", label: "Gross", className: "num", sort: r => r.gross, firstDir: "asc", cell: r => <span className="mono fw-700">{r.gross}</span> },
  { key: "toPar", label: "±Par", className: "num", sort: r => r.toPar, firstDir: "asc", cell: r => <ToParSpan tp={r.toPar} /> },
  { key: "sd", label: "SD", className: "num", sort: r => r.sd ?? 999, firstDir: "asc", cell: r => <SdSpan sd={r.sd} /> },
  { key: "pts", label: "Pts", className: "num", sort: r => r.pts, firstDir: "desc", cell: r => r.pts || "–" },
];

function PlayerDetail({ row, onClose }: { row: Sub12Row; onClose: () => void }) {
  return (
    <div className="card drive-player-card mb-8">
      <button onClick={onClose} title="Fechar" aria-label="Fechar" className="drive-player-close">✕</button>
      <div className="mb-8 drive-player-head">
        <span className="fw-800 drive-player-name">{row.name}</span>
        <span className="muted fs-11">{row.club} · {regionLabel(row.region)} · HCP {fmtHcp(row.hcp)}</span>
        {/* PlayerLink põe cor/sublinhado em linha: o estilo tem de ir pela prop. */}
        <PlayerLink fed={row.fed} name="Ver perfil →" style={{ fontSize: "var(--fs-11)", color: "var(--accent)", textDecoration: "underline" }} />
      </div>
      <div className="mb-10 flex-wrap d-flex gap-6">
        <KpiCard label="Torneios" value={String(row.tourneiosPlayed)} />
        <KpiCard label="Pts" value={row.totalPts > 0 ? String(row.totalPts) : "–"} color="var(--color-warn-dark)" />
        <KpiCard label="Best SD" value={row.bestSD?.toFixed(1) ?? "–"} color={row.bestSD != null && row.bestSD <= 25 ? "var(--color-good)" : undefined} />
        <KpiCard label="Melhor" value={row.bestGross != null ? String(row.bestGross) : "–"} color="var(--color-good-dark)" />
      </div>
      <RankingTable rows={row.results} cols={RESULT_COLS} rowKey={r => r.tournKey} defaultSort="date" defaultDir="asc" />
    </div>
  );
}

/* ── A capacidade ───────────────────────────────────────────────── */
export interface DriveRankingDeps {
  expanded: Tournament[];
  pdb: PlayersDB;
  escLookup: EscLookup;
  temporal: TemporalEscLookup;
  fedBirthdates: Map<string, string>;
  /** Série da barra; com «Todos», a série do ranking escolhe-se na vista (`s12s`). */
  series: DriveSeries | "all";
  seriesAll: DriveSeries;
  year: string | null;
  esc: string;
  sex: string;
  search: string;
  view: Sub12View;
  selected: string | null;
  set: (p: { s12s?: DriveSeries; s12e?: string; s12x?: string; s12v?: Sub12View }) => void;
  setSearch: (q: string) => void;
  setSelected: (fed: string | null) => void;
  /** Acima de tudo na vista (o calendário). */
  top?: (series: DriveSeries) => React.ReactNode;
}

/** Posição de cada jogador por pontos (empates partilham). */
function rankByPts(rows: Sub12Row[]): Map<string, number> {
  const s = [...rows].sort((a, b) => b.totalPts - a.totalPts);
  const m = new Map<string, number>();
  s.forEach((r, i) => m.set(r.fed, i > 0 && s[i - 1].totalPts === r.totalPts ? m.get(s[i - 1].fed)! : i + 1));
  return m;
}

function cols(rows: Sub12Row[], withEsc: boolean, pdb: PlayersDB): RankingCol<Sub12Row>[] {
  const rk = rankByPts(rows);
  return [
    { key: "rank", label: "#", className: "num", sort: r => rk.get(r.fed) ?? 9999, firstDir: "asc",
      cell: r => r.totalPts > 0 ? (medal(rk.get(r.fed)!) ?? <span className="mono fw-700">{rk.get(r.fed)}</span>) : <span className="c-muted">–</span> },
    { key: "name", label: "Jogador", sort: r => norm(r.name), firstDir: "asc",
      cell: r => <>{pdb[r.fed]?.country && pdb[r.fed]!.country !== "PT" ? <span title={pdb[r.fed]!.country ?? ""}>{flagOrEmpty(pdb[r.fed]!.country)} </span> : null}<a href={`/jogadores/${r.fed}`} target="_blank" rel="noopener noreferrer" className="fw-700 drive-rank-name" onClick={e => e.stopPropagation()}>{r.name}</a>
        {(r.sex === "M" || r.sex === "F") && <SexBadge sex={r.sex} size="sm" className="ml-4" />}</> },
    ...(withEsc ? [{ key: "esc", label: "Escalão", sort: (r: Sub12Row) => ESCALOES_DRIVE.indexOf(r.esc ?? "") + 1 || 99, firstDir: "asc" as const,
      cell: (r: Sub12Row) => r.esc || "—" }] : []),
    { key: "club", label: "Clube", sort: r => norm(r.club), firstDir: "asc", cell: r => r.club, tdClassName: "c-muted fs-11" },
    { key: "hcp", label: "HCP", className: "num", sort: r => r.hcp ?? 99, firstDir: "asc", cell: r => <span className="mono">{fmtHcp(r.hcp)}</span> },
    { key: "t", label: "T", title: "Torneios jogados", className: "num", sort: r => r.tourneiosPlayed, firstDir: "desc", cell: r => <span className="mono">{r.tourneiosPlayed}</span> },
    { key: "pts", label: "Pts", title: "Pontos do Drive: as 4 melhores da fase regular + a Final regional ×1,5", className: "num", sort: r => r.totalPts, firstDir: "desc",
      cell: r => <span className="fw-800 drive-pts">{r.totalPts}</span> },
    { key: "bestSD", label: "Best SD", className: "num", sort: r => r.bestSD ?? 999, firstDir: "asc", cell: r => <SdSpan sd={r.bestSD} hcp={r.hcp} /> },
    { key: "best", label: "Melhor", className: "num", sort: r => r.bestGross ?? 999, firstDir: "asc", cell: r => <span className="mono fw-700 c-good-dark">{r.bestGross ?? "–"}</span> },
  ];
}

export function driveRanking(d: DriveRankingDeps): CircuitRanking<Sub12Row> {
  const seriesOf = (ctx: CircuitRankingContext): DriveSeries =>
    ctx.scope === "view" && d.series === "all" ? d.seriesAll
      : ((ctx.entries[0]?.divisions?.[0]?.results?.series || (d.series === "all" ? d.seriesAll : d.series)) as DriveSeries);
  const escOf = (ctx: CircuitRankingContext) => ctx.scope === "season" ? seasonEscalao(ctx.division) : d.esc;
  const rowsOf = (ctx: CircuitRankingContext): Sub12Row[] => {
    const esc = escOf(ctx);
    let rows = buildSub12Data(rankingTournaments(ctx.entries, d.expanded), d.pdb, d.escLookup, d.temporal, d.fedBirthdates, esc);
    rows = filterBySub12Series(rows, seriesOf(ctx));
    if (ctx.scope === "view") {
      if (d.sex !== "all") rows = rows.filter(p => p.sex === d.sex);
      const q = d.search.trim().toLowerCase();
      if (q) rows = rows.filter(p => p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q) || p.fed.includes(q));
    }
    return rows;
  };
  const escLabel = (esc: string) => esc === "all" ? "Todos os escalões" : esc;
  return {
    key: "ranking",
    label: "🏅 Ranking",
    rows: rowsOf,
    table: (rows, ctx) => ({
      cols: cols(rows, escOf(ctx) === "all", d.pdb),
      rowKey: r => r.fed,
      defaultSort: "pts",
      defaultDir: "desc",
      tieBreak: (a, b) => a.name.localeCompare(b.name, "pt"),
      rowStyle: r => r.sex === "F" ? { background: "var(--bg-female)" } : undefined,
    }),
    views: [
      { key: "grid", label: "📊 Tabela", render: rows => (
        <TournamentGrid rows={rows} allTournaments={sub12Tournaments(rows)} onPlayerClick={fed => d.setSelected(d.selected === fed ? null : fed)}
          playersDB={d.pdb} escLookup={d.escLookup} />) },
      { key: "ranking", label: "🏆 Ranking", table: true },
      { key: "evolucao", label: "📈 Evolução", render: rows => <EvolutionChart rows={rows} /> },
    ],
    view: d.view,
    onView: v => d.set({ s12v: v as Sub12View }),
    header: (rows, ctx) => {
      const k = sub12Kpis(rows);
      const s = seriesOf(ctx);
      return (
        <div className="drive-rank-head">
          {d.top?.(s)}
          <div className="h-md mt-8">🏅 Ranking — {escLabel(d.esc)} {SERIE_LABELS[s]} {d.year ?? ""}</div>
          <div className="muted fs-11 mb-8">
            {k.players} jogadores · {k.rounds} rondas
            {k.bestSD != null && <> · Best SD <span className={"drive-kpi" + (k.bestSD <= 25 ? " is-good" : "")}>{k.bestSD.toFixed(1)}</span></>}
            {k.best != null && <> · Melhor gross <span className="drive-kpi is-good-dark">{k.best}</span></>}
          </div>
          <div className="drive-rank-filters">
            {d.series === "all" && (
              <div className="segmented-toggle" role="tablist" aria-label="Série">
                {(["tour", "challenge", "aquapor"] as DriveSeries[]).map(x => (
                  <button key={x} type="button" role="tab" aria-selected={x === d.seriesAll}
                    className={"seg-btn" + (x === d.seriesAll ? " active" : "")} onClick={() => d.set({ s12s: x })}>
                    <span className="seg-label">{SERIE_LABELS[x]}</span>
                  </button>
                ))}
              </div>
            )}
            <select className="select fs-11" value={d.esc} onChange={e => { d.set({ s12e: e.target.value }); d.setSelected(null); }} aria-label="Escalão">
              <option value="all">Todos os escalões</option>
              {ESCALOES_DRIVE.map(esc => <option key={esc} value={esc}>{esc}</option>)}
            </select>
            <select className="select fs-11" value={d.sex} onChange={e => d.set({ s12x: e.target.value })} aria-label="Sexo">
              <option value="all">Ambos os sexos</option>
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
            <input className="input fs-11 drive-boxed" value={d.search} onChange={e => d.setSearch(e.target.value)} placeholder="Nome, clube…" />
          </div>
        </div>
      );
    },
    detail: {
      selected: d.selected,
      onSelect: d.setSelected,
      render: (row, close) => <PlayerDetail row={row} onClose={close} />,
    },
    emptyMessage: "Nenhum jogador com resultados neste escalão.",
    seasonTitle: (rows, ctx) => (
      <div className="h-sm mb-6">
        🏅 Classificação acumulada — {SERIE_LABELS[seriesOf(ctx)]} · {escLabel(escOf(ctx))} · {rows.length} jogadores
        <span className="muted fs-11 ml-4">(pontos do Drive: as 4 melhores da fase regular + a Final regional ×1,5)</span>
      </div>
    ),
  };
}
