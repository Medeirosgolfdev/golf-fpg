import React, { useState, useMemo } from "react";
import { useSort } from "../hooks/useSort";
import { C as _C } from "../utils/colors";
import { abreviarNome, medal } from "../utils/format";
import type { Player, Tournament, GrupoJogador, GrupoEntry } from "../data/fpgTypes";
import { bestN } from "../utils/mathUtils";
import { firstPlayerParTotal } from "../data/fpgUtils";

/* ─────────────────────────────────────────────
   CONFIGURAÇÃO
   ───────────────────────────────────────────── */
const CLUBES_BEST_N = 3;
const MAX_HOLE_SCORE = 10;
const MULTI_ACCENTS = [_C.chartRust, _C.chartPurple, _C.chartCyan, _C.chartRose, _C.chartLime, _C.chartBlue];
const SINGLE_COLOR = "var(--color-good-dark)";

type SortCol = "grupo" | "total" | number;

/* ─────────────────────────────────────────────
   HELPER FUNCTIONS
   ───────────────────────────────────────────── */


function grossForRound(p: Player, rd: number, maxHole: number = MAX_HOLE_SCORE): number | null {
  const rs = p.roundScores?.find(r => r.round === rd);
  if (rs) {
    if (rs.gross >= 999) return null;
    if (rs.scores?.length) {
      if (rs.scores.every(s => s === 0)) return null;
      return rs.scores.reduce((sum, s) => sum + Math.min(s, maxHole), 0);
    }
    return rs.gross;
  }
  if (rd === 1 && p.grossTotal != null && (!p.roundScores || p.roundScores.length === 0)) {
    const g = typeof p.grossTotal === "number" ? p.grossTotal : parseInt(String(p.grossTotal));
    return isNaN(g) ? null : g;
  }
  return null;
}


function fmtHcp(h: number | string) {
  return typeof h === "string" ? h : h % 1 === 0 ? String(h) : h.toFixed(1);
}

/* ─────────────────────────────────────────────
   COMPONENT
   ───────────────────────────────────────────── */

interface ClubesGruposViewProps {
  grupos: GrupoEntry[];
  tournament: Tournament | null;
  escKey: "sub14" | "sub18";
  /** Nº de resultados contados por ronda (índice 0 = R1). Quando ausente, usa
   *  `defaultBestN` em todas as rondas. Ex Mid-Amateur: [5, 2] (R1 individual
   *  conta 5 melhores; R2 foursomes conta 2 melhores). */
  bestNByRound?: number[];
  /** Best-N por defeito (juvenis = 3 de 4). */
  defaultBestN?: number;
  /** Máximo de pancadas por buraco aplicado ao recompor o gross. Default 10
   *  (juvenis). Passar Infinity para desligar (Mid-Amateur — sem cap). */
  maxHoleScore?: number;
  /** Nota de formato no topo. `undefined` → texto default ("Melhores N de 4 ·
   *  Máximo M…"); `null` → escondida; ReactNode → texto custom. */
  formatNote?: React.ReactNode | null;
}

export default function ClubesGruposView({
  grupos,
  tournament,
  bestNByRound,
  defaultBestN = CLUBES_BEST_N,
  maxHoleScore = MAX_HOLE_SCORE,
  formatNote,
}: ClubesGruposViewProps) {
  const bestNFor = (rd: number): number => bestNByRound?.[rd - 1] ?? defaultBestN;
  const { sortKey: sortCol, sortDir, toggleSort: toggleSortCol } = useSort<SortCol>("total");
  const [playerSort, setPlayerSort] = useState<"nome" | "hcp" | number>("nome");
  const [playerSortDir, setPlayerSortDir] = useState<"asc" | "desc">("asc");

  function togglePlayerSort(col: "nome" | "hcp" | number) {
    if (playerSort === col) setPlayerSortDir(d => d === "asc" ? "desc" : "asc");
    else { setPlayerSort(col); setPlayerSortDir(col === "nome" ? "asc" : "asc"); }
  }

  function calcAllBPB(p: Player) {
    let bir = 0, par = 0, bog = 0, hasData = false;
    for (const rs of p.roundScores || []) {
      const b = calcBPB(p, rs.round);
      if (b) { bir += b.bir; par += b.par; bog += b.bog; hasData = true; }
    }
    return hasData ? { bir, par, bog } : null;
  }

  const byFed = useMemo(() => {
    const m = new Map<string, Player>();
    if (!tournament) return m;
    for (const p of tournament.players) if (p.fedCode) m.set(p.fedCode, p);
    return m;
  }, [tournament]);

  const nRounds = tournament?.rounds ?? 1;
  const playedRounds = tournament
    ? Math.max(0, ...tournament.players.map(p => p.roundScores?.length ?? 0))
    : 0;
  const rdCols = Array.from({ length: playedRounds }, (_, i) => i + 1);
  const viewRd: number | null = typeof sortCol === "number" ? sortCol as number : null;
  const showGroupBPB = sortCol === "grupo" && rdCols.length > 1;
  const viewCols = showGroupBPB ? [] : viewRd != null ? rdCols.filter(rd => rd === viewRd) : rdCols;

  function calcBPB(p: Player, rd: number) {
    const rs = p.roundScores?.find(r => r.round === rd);
    if (!rs?.scores?.length || !rs?.pars?.length) return null;
    let bir = 0, par = 0, bog = 0;
    rs.scores.forEach((s, h) => {
      const diff = Math.min(s, maxHoleScore) - (rs.pars[h] || 0);
      if (diff <= -1) bir++; else if (diff === 0) par++; else bog++;
    });
    return { bir, par, bog };
  }

  const parTotal = useMemo(() => firstPlayerParTotal(tournament), [tournament]);

  const { clubColorMap, clubCount, clubTeamOrder } = useMemo(() => {
    const counts = new Map<string, number>();
    const order = new Map<string, string[]>();
    for (const g of grupos) {
      counts.set(g.clube, (counts.get(g.clube) || 0) + 1);
      if (!order.has(g.clube)) order.set(g.clube, []);
      order.get(g.clube)!.push(g.grupo);
    }
    const multiClubs = [...counts.entries()]
      .filter(([, n]) => n > 1).map(([name]) => name).sort((a, b) => a.localeCompare(b, "pt"));
    const colorMap = new Map<string, string>();
    multiClubs.forEach((name, i) => colorMap.set(name, MULTI_ACCENTS[i % MULTI_ACCENTS.length]));
    return { clubColorMap: colorMap, clubCount: counts, clubTeamOrder: order };
  }, [grupos]);

  interface JRow { j: GrupoJogador; p: Player | undefined; rds: (number | null)[]; total: number | null; }
  interface TeamData {
    g: GrupoEntry; color: string; isMulti: boolean; teamIdx: number;
    jRows: JRow[]; rdTeam: (number | null)[]; teamTotal: number | null;
  }

  const teamDataList: TeamData[] = useMemo(() => grupos.map(g => {
    const color = clubColorMap.get(g.clube) ?? SINGLE_COLOR;
    const isMulti = (clubCount.get(g.clube) ?? 1) > 1;
    const teamIdx = (clubTeamOrder.get(g.clube) ?? []).indexOf(g.grupo);

    const jRows: JRow[] = g.jogadores.map(j => {
      const p = j.fed ? byFed.get(j.fed) : undefined;
      const rds = rdCols.map(rd => p ? grossForRound(p, rd, maxHoleScore) : null);
      const played = rds.filter(v => v != null) as number[];
      return { j, p, rds, total: played.length ? played.reduce((s, v) => s + v, 0) : null };
    });

    const rdTeam = rdCols.map((rd, ri) => {
      const scores = jRows.map(r => r.rds[ri]).filter(v => v != null) as number[];
      return scores.length ? bestN(scores, bestNFor(rd)) : null;
    });
    const playedTeamRds = rdTeam.filter(v => v != null) as number[];
    const teamTotal = playedTeamRds.length ? playedTeamRds.reduce((s, v) => s + v, 0) : null;

    return { g, color, isMulti, teamIdx, jRows, rdTeam, teamTotal };
  }), [grupos, byFed, rdCols, clubColorMap, clubCount, clubTeamOrder]);

  const rankMap = useMemo(() => {
    const withT = [...teamDataList]
      .filter(td => td.teamTotal != null)
      .sort((a, b) => a.teamTotal! - b.teamTotal!);
    const m = new Map<string, number>();
    let pos = 1;
    withT.forEach((td, i) => {
      if (i > 0 && td.teamTotal !== withT[i - 1].teamTotal) pos = i + 1;
      m.set(td.g.grupo, pos);
    });
    return m;
  }, [teamDataList]);

  const sorted = useMemo(() => [...teamDataList].sort((a, b) => {
    const INF = sortDir === "asc" ? Infinity : -Infinity;
    let av: number | string, bv: number | string;
    if (sortCol === "grupo") { av = a.g.grupo; bv = b.g.grupo; }
    else if (sortCol === "total") { av = a.teamTotal ?? INF; bv = b.teamTotal ?? INF; }
    else { const ri = (sortCol as number) - 1; av = a.rdTeam[ri] ?? INF; bv = b.rdTeam[ri] ?? INF; }
    if (typeof av === "string")
      return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  }), [teamDataList, sortCol, sortDir]);

  const tdC: React.CSSProperties = { padding: "5px 6px", fontSize: "var(--fs-12)", textAlign: "center", borderBottom: "1px solid var(--border)" };
  const tdL: React.CSSProperties = { ...tdC, textAlign: "left" };
  const thC: React.CSSProperties = { ...tdC, fontWeight: 700, fontSize: "var(--fs-11)", color: "var(--text-muted)", background: "var(--bg-muted)", textTransform: "uppercase", letterSpacing: "0.04em" };

  function SortBtn({ label, col }: { label: string; col: SortCol }) {
    const active = sortCol === col;
    return (
      <button onClick={() => toggleSortCol(col)} style={{
        fontSize: "var(--fs-11)", fontWeight: active ? 700 : 500, padding: "3px 9px", borderRadius: 4,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "var(--accent)" : "var(--bg-hover)",
        color: active ? "#fff" : "var(--text-muted)", cursor: "pointer",
      }}>{label}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}</button>
    );
  }

  const multiEntries = [...clubCount.entries()]
    .filter(([, n]) => n > 1)
    .sort(([a], [b]) => a.localeCompare(b, "pt"));

  return (
    <div style={{ padding: "12px 16px 24px" }}>

      {/* Barra de ordenação */}
      <div className="mb-10 flex-wrap" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: "var(--fs-10)", color: "var(--text-muted)" }}>Ordenar:</span>
        <SortBtn label="Grupo" col="grupo" />
        {rdCols.map(rd => <SortBtn key={rd} label={`R${rd}`} col={rd} />)}
        <SortBtn label="Total" col="total" />
        <span style={{ marginLeft: "auto", fontSize: "var(--fs-14)", color: "var(--text-muted)", marginTop: 4 }}>
          {formatNote === undefined
            ? <>Melhores {defaultBestN} de 4 · Máximo {maxHoleScore} pancadas por buraco</>
            : formatNote}
          {nRounds > 1 && (
            <span style={{ marginLeft: 8, fontWeight: 600,
              color: playedRounds >= nRounds ? "var(--color-good)" : "var(--color-warn)" }}>
              · R{playedRounds}/{nRounds}
            </span>
          )}
        </span>
      </div>

      {/* Legenda clubes com 2 equipas */}
      {multiEntries.length > 0 && (
        <div className="flex-wrap mb-12" style={{ display: "flex", gap: 6 }}>
          {multiEntries.map(([clube]) => {
            const color = clubColorMap.get(clube)!;
            const teams = (clubTeamOrder.get(clube) ?? []).sort().join(" + ");
            return (
              <span key={clube} style={{
                fontSize: "var(--fs-10)", display: "inline-flex", alignItems: "center", gap: 5,
                border: `1px solid ${color}`, borderRadius: 4, padding: "2px 8px",
                background: `${color}12`,
              }}>
                <span className="shrink-0" style={{ width: 9, height: 9, borderRadius: 2, background: color, display: "inline-block" }} />
                <strong style={{ color }}>{teams}</strong>
                <span style={{ color: "var(--text-muted)" }}>— {clube}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Grelha */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 10 }}>
        {sorted.map(({ g, color, isMulti, teamIdx, jRows, rdTeam, teamTotal }) => {
          const pos = rankMap.get(g.grupo);
          const mdl = medal(pos ?? 0);
          const teamPar = parTotal > 0 && playedRounds > 0
            ? parTotal * rdCols.reduce((s, rd) => s + bestNFor(rd), 0) : 0;
          const teamTP = teamTotal != null && teamPar > 0 ? teamTotal - teamPar : null;

          return (
            <div key={g.grupo} style={{
              background: "var(--bg-card,#fff)",
              border: `1px solid ${isMulti ? color + "80" : "var(--border)"}`,
              borderRadius: 8, overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            }}>
              {/* Header do card */}
              <div style={{ background: color, color: "#fff", padding: "8px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                {/* Letra do grupo em caixa */}
                <div className="shrink-0 fw-900" style={{ width: 34, height: 34, background: "rgba(255,255,255,0.18)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-20)", lineHeight: 1 }}>
                  {g.grupo}
                </div>

                {/* Nome do clube */}
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className="fs-12 fw-700 overflow-hidden" style={{ lineHeight: 1.3, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.clube}
                  </div>
                  {isMulti && (
                    <div className="fs-10 fw-600 mt-1" style={{ opacity: 0.8 }}>equipa {teamIdx + 1}</div>
                  )}
                </div>

                {/* Posição + total ou score da ronda seleccionada */}
                {pos != null && (viewRd != null ? rdTeam[viewRd - 1] != null : teamTotal != null) && (() => {
                  const dispScore = viewRd != null ? rdTeam[viewRd - 1]! : teamTotal!;
                  const dispTP = viewRd != null
                    ? (parTotal > 0 ? dispScore - parTotal * bestNFor(viewRd) : null)
                    : teamTP;
                  return (
                    <div className="shrink-0 ta-right">
                      <div className="fs-10" style={{ opacity: 0.85, lineHeight: 1, marginBottom: 2 }}>
                        {viewRd != null ? `R${viewRd}` : (mdl ?? `#${pos}`)}
                      </div>
                      <div className="fw-900" style={{ fontSize: "var(--fs-20)", lineHeight: 1 }}>{dispScore}</div>
                      {dispTP != null && (
                        <div className="fs-10 mt-1" style={{ opacity: 0.85, lineHeight: 1 }}>
                          ({dispTP >= 0 ? `+${dispTP}` : dispTP})
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Tabela jogadores */}
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {(() => {
                      function PHdr({ label, col, style, className }: { label: string; col: "nome" | "hcp" | number; style?: React.CSSProperties; className?: string }) {
                        const active = playerSort === col;
                        const title = active
                          ? (playerSortDir === "asc" ? "Ordenado crescente" : "Ordenado decrescente")
                          : "Clique para ordenar";
                        return (
                          <th
                            className={"lb-sortable " + (className || "")}
                            onClick={() => togglePlayerSort(col)}
                            title={title}
                            style={{
                              ...thC, cursor: "pointer", userSelect: "none",
                              color: active ? color : "var(--text-muted)",
                              fontWeight: active ? 700 : undefined,
                              ...style,
                            }}
                          >
                            {label}
                            {active && <span className="fs-10" style={{ marginLeft: 2 }}>{playerSortDir === "asc" ? "▲" : "▼"}</span>}
                          </th>
                        );
                      }
                      return (<>
                        <PHdr label="Jogador" col="nome" className="ta-left" style={{ paddingLeft: 10 }} />
                        <PHdr label="HCP" col="hcp" />
                        {viewCols.map(rd => <PHdr key={rd} label={`R${rd}`} col={rd} />)}
                        {viewRd != null ? (<>
                          <th style={{ ...thC, color: "var(--color-good)", borderLeft: "1px solid var(--border)" }}>🐦</th>
                          <th style={{ ...thC, color: "var(--text-3)", borderLeft: "1px solid var(--border-light)" }}>○</th>
                          <th style={{ ...thC, color: "var(--color-danger)", borderLeft: "1px solid var(--border-light)" }}>■</th>
                        </>) : showGroupBPB ? (<>
                          <th style={{ ...thC, color: "var(--color-good)", borderLeft: "1px solid var(--border)" }}>🐦</th>
                          <th style={{ ...thC, color: "var(--text-3)", borderLeft: "1px solid var(--border-light)" }}>○</th>
                          <th style={{ ...thC, color: "var(--color-danger)", borderLeft: "1px solid var(--border-light)" }}>■</th>
                        </>) : (
                          viewCols.length > 1 && <th style={thC}>Tot.</th>
                        )}
                      </>);
                    })()}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const sortedJRows = [...jRows].sort((a, b) => {
                      let av: number | string, bv: number | string;
                      if (playerSort === "nome") { av = a.j.nome; bv = b.j.nome; }
                      else if (playerSort === "hcp") {
                        av = typeof a.j.hcp === "string" ? parseFloat(a.j.hcp.replace("+","")) * (a.j.hcp.startsWith("+") ? -1 : 1) : (a.j.hcp as number);
                        bv = typeof b.j.hcp === "string" ? parseFloat(b.j.hcp.replace("+","")) * (b.j.hcp.startsWith("+") ? -1 : 1) : (b.j.hcp as number);
                      } else {
                        const ri = (playerSort as number) - 1;
                        av = a.rds[ri] ?? (playerSortDir === "asc" ? Infinity : -Infinity);
                        bv = b.rds[ri] ?? (playerSortDir === "asc" ? Infinity : -Infinity);
                      }
                      if (typeof av === "string") return playerSortDir === "asc" ? av.localeCompare(bv as string, "pt") : (bv as string).localeCompare(av, "pt");
                      return playerSortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
                    });

                    return sortedJRows.map(({ j, p, rds, total }) => {
                      const counts = viewCols.map((rd) => {
                        const ri = rdCols.indexOf(rd);
                        const allS = jRows.map(r => r.rds[ri]).filter(v => v != null) as number[];
                        const threshold = [...allS].sort((a, b) => a - b)[bestNFor(rd) - 1];
                        const mine = rds[ri];
                        return mine != null && threshold != null && mine <= threshold;
                      });
                      const hasAnyScore = rds.some(v => v != null);
                      const bpb = viewRd != null && p ? calcBPB(p, viewRd) : null;
                      const allBpb = showGroupBPB && p ? calcAllBPB(p) : null;
                      return (
                        <tr key={j.fed ?? j.nome}>
                          <td style={{ ...tdL, paddingLeft: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            color: hasAnyScore ? "var(--text)" : "var(--text-muted)",
                            fontWeight: hasAnyScore ? 500 : 400,
                            opacity: hasAnyScore ? 1 : 0.55 }}>
                            {p && j.fed
                              ? <a href={`/jogadores/${j.fed}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="td-none"
                                  style={{ color: "inherit" }}
                                  onClick={e => e.stopPropagation()}>{abreviarNome(j.nome)}</a>
                              : abreviarNome(j.nome)}
                          </td>
                          <td style={{ ...tdC, color: "var(--text-muted)", opacity: hasAnyScore ? 1 : 0.55 }}>
                            {p?.hcpExact != null ? fmtHcp(p.hcpExact) : Number(j.hcp) > 0 ? fmtHcp(j.hcp) : "–"}
                          </td>
                          {viewCols.map((rd, ci) => {
                            const ri = rdCols.indexOf(rd);
                            const score = rds[ri];
                            const c = counts[ci];
                            const tp = score != null && parTotal > 0 ? score - parTotal : null;
                            return (
                              <td key={ri} style={{
                                ...tdC,
                                fontWeight: c ? 700 : 400,
                                color: c ? color : score != null ? "var(--text)" : "var(--text-muted)",
                                padding: "4px 4px",
                                verticalAlign: "middle",
                              }}>
                                {score != null ? (
                                  <div style={{ lineHeight: 1.2 }}>
                                    <div style={{ fontWeight: c ? 700 : 400 }}>{score}</div>
                                    {tp != null && (
                                      <div style={{
                                        fontSize: "var(--fs-9)", lineHeight: 1,
                                        color: c ? color : "var(--text-muted)",
                                        opacity: c ? 0.85 : 0.65,
                                      }}>
                                        ({tp >= 0 ? `+${tp}` : tp})
                                      </div>
                                    )}
                                  </div>
                                ) : <span style={{ color: "var(--text-muted)", opacity: 0.4 }}>–</span>}
                              </td>
                            );
                          })}
                          {viewRd != null ? (<>
                            <td style={{ ...tdC, color: "var(--color-good)", fontWeight: 600, borderLeft: "1px solid var(--border)" }}>{bpb ? (bpb.bir || "") : "–"}</td>
                            <td style={{ ...tdC, color: "var(--text-3)", borderLeft: "1px solid var(--border-light)" }}>{bpb ? (bpb.par || "") : "–"}</td>
                            <td style={{ ...tdC, color: "var(--color-danger)", borderLeft: "1px solid var(--border-light)" }}>{bpb ? (bpb.bog || "") : "–"}</td>
                          </>) : showGroupBPB ? (<>
                            <td style={{ ...tdC, color: "var(--color-good)", fontWeight: 600, borderLeft: "1px solid var(--border)" }}>{allBpb ? (allBpb.bir || "") : "–"}</td>
                            <td style={{ ...tdC, color: "var(--text-3)", borderLeft: "1px solid var(--border-light)" }}>{allBpb ? (allBpb.par || "") : "–"}</td>
                            <td style={{ ...tdC, color: "var(--color-danger)", borderLeft: "1px solid var(--border-light)" }}>{allBpb ? (allBpb.bog || "") : "–"}</td>
                          </>) : (
                            viewCols.length > 1 && (
                              <td style={{ ...tdC, fontWeight: hasAnyScore ? 500 : 400, color: hasAnyScore ? "var(--text)" : "var(--text-muted)", opacity: hasAnyScore ? 1 : 0.55 }}>
                                {total != null ? total : "–"}
                              </td>
                            )
                          )}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
                {/* Rodapé: apenas total dos 4 jogadores */}
                <tfoot>
                  <tr style={{ background: color }}>
                    <td colSpan={2} style={{ ...tdL, paddingLeft: 10, fontWeight: 600, fontSize: "var(--fs-10)", color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Total {g.jogadores.length} Jogadores
                    </td>
                    {viewCols.map((rd) => {
                      const ri = rdCols.indexOf(rd);
                      const allS = jRows.map(r => r.rds[ri]).filter(v => v != null) as number[];
                      const tot = allS.length ? allS.reduce((s, v) => s + v, 0) : null;
                      return <td key={ri} style={{ ...tdC, color: "#fff", fontWeight: 600, borderBottom: "none" }}>{tot != null ? tot : "–"}</td>;
                    })}
                    {viewRd != null ? (() => {
                      let tb = 0, tp2 = 0, tbo = 0, hasData = false;
                      jRows.forEach(({ p }) => {
                        if (!p) return;
                        const b = calcBPB(p, viewRd);
                        if (b) { tb += b.bir; tp2 += b.par; tbo += b.bog; hasData = true; }
                      });
                      return (<>
                        <td style={{ ...tdC, color: "#fff", fontWeight: 600, borderBottom: "none", borderLeft: "1px solid rgba(255,255,255,0.3)", opacity: 0.9 }}>{hasData ? (tb || "") : "–"}</td>
                        <td style={{ ...tdC, color: "#fff", fontWeight: 400, borderBottom: "none", borderLeft: "1px solid rgba(255,255,255,0.2)", opacity: 0.8 }}>{hasData ? (tp2 || "") : "–"}</td>
                        <td style={{ ...tdC, color: "#fff", fontWeight: 400, borderBottom: "none", borderLeft: "1px solid rgba(255,255,255,0.2)", opacity: 0.8 }}>{hasData ? (tbo || "") : "–"}</td>
                      </>);
                    })() : showGroupBPB ? (() => {
                      let tb = 0, tp2 = 0, tbo = 0, hasData = false;
                      jRows.forEach(({ p }) => {
                        if (!p) return;
                        const b = calcAllBPB(p);
                        if (b) { tb += b.bir; tp2 += b.par; tbo += b.bog; hasData = true; }
                      });
                      return (<>
                        <td style={{ ...tdC, color: "#fff", fontWeight: 600, borderBottom: "none", borderLeft: "1px solid rgba(255,255,255,0.3)", opacity: 0.9 }}>{hasData ? (tb || "") : "–"}</td>
                        <td style={{ ...tdC, color: "#fff", fontWeight: 400, borderBottom: "none", borderLeft: "1px solid rgba(255,255,255,0.2)", opacity: 0.8 }}>{hasData ? (tp2 || "") : "–"}</td>
                        <td style={{ ...tdC, color: "#fff", fontWeight: 400, borderBottom: "none", borderLeft: "1px solid rgba(255,255,255,0.2)", opacity: 0.8 }}>{hasData ? (tbo || "") : "–"}</td>
                      </>);
                    })() : (
                      viewCols.length > 1 && (() => {
                        const allRdTotals = viewCols.map(rd => {
                          const ri = rdCols.indexOf(rd);
                          const allS = jRows.map(r => r.rds[ri]).filter(v => v != null) as number[];
                          return allS.length ? allS.reduce((s, v) => s + v, 0) : null;
                        });
                        const grand = allRdTotals.every(v => v != null) ? (allRdTotals as number[]).reduce((s, v) => s + v, 0) : null;
                        return <td style={{ ...tdC, color: "#fff", fontWeight: 700, borderBottom: "none" }}>{grand != null ? grand : "–"}</td>;
                      })()
                    )}
                  </tr>
                </tfoot>
              </table>

              {/* Capitão e Suplente */}
              {(g.capitao || g.suplente) && (
                <div style={{
                  display: "flex", gap: 0,
                  borderTop: "1px solid var(--border)",
                  fontSize: "var(--fs-11)",
                }}>
                  {g.capitao && (
                    <div style={{
                      flex: 1, padding: "5px 10px",
                      display: "flex", alignItems: "center", gap: 5,
                      borderRight: g.suplente ? "1px solid var(--border)" : "none",
                      color: "var(--text-2)",
                    }}>
                      <span className="fs-13">🎖️</span>
                      <span>
                        <span style={{ fontSize: "var(--fs-9)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "block", lineHeight: 1 }}>Capitão</span>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>{g.capitao}</span>
                      </span>
                    </div>
                  )}
                  {g.suplente && (
                    <div style={{
                      flex: 1, padding: "5px 10px",
                      display: "flex", alignItems: "center", gap: 5,
                      color: "var(--text-2)",
                    }}>
                      <span className="fs-13">🔄</span>
                      <span>
                        <span style={{ fontSize: "var(--fs-9)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "block", lineHeight: 1 }}>Suplente</span>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>{g.suplente}</span>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
