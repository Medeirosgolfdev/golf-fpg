import React, { useMemo, useState } from "react";
import { abreviarNome, escalaoAtDate } from "../utils/format";
import { EscPill } from "./PillBadge";
import type { Player, Tournament, GrupoEntry } from "../data/fpgTypes";
import type { PlayersDB } from "./tournamentPrimitives";

/* ─────────────────────────────────────────────
   ClubesCategoriasView
   Vista de Grupos para torneios de clubes com VÁRIAS categorias por clube
   (ex: Campeonato Regional de Clubes Absoluto — Homens >18, Senhoras >18,
   Juniores ≤Sub-18). Cada clube é um card; dentro do card os jogadores são
   divididos em sub-grupos por categoria, cada um com o seu nº de melhores a
   contar (Homens 5, Senhoras 2, Juniores 3). A categoria de cada jogador é
   derivada do playersDB (sexo + data de nascimento) por fedCode.
   Componente ISOLADO: só usado quando o torneio tem `categories` configurado.
   ───────────────────────────────────────────── */

const SINGLE_COLOR = "var(--color-good-dark)";

export interface CategoriaCfg { key: string; label: string; bestN: number }

interface Props {
  tournament: Tournament | null;
  grupos: GrupoEntry[];
  playersDB: PlayersDB;
  categories: CategoriaCfg[];
  /** Texto introdutório no topo. Default: derivado de `categories`
   *  ("Homens N melhores · Senhoras N · Juniores N"). */
  intro?: React.ReactNode;
  /** Rótulo do nº a contar por categoria. Default: `n => "N melhores"`.
   *  Em match play (composição de equipas) passa-se `n => "N + 1 supl."`. */
  bestNLabel?: (n: number) => string;
  /** Coluna de ordenação inicial. Default "total"; numa composição sem
   *  resultados convém "hcp" para listar do melhor handicap ao pior. */
  initialSort?: SortCol;
  /** Modo "composição de equipas" (pré-jogo, match play): o rodapé de cada
   *  categoria mostra o nº REAL de inscritos (não o `bestN` do regulamento) e
   *  não há ranking. Sem isto, "(cfg.bestN)" leria-se como contagem. */
  rosterMode?: boolean;
}

type SortCol = "nome" | "hcp" | "total" | number; // number = índice da ronda (1-based)

function grossForRound(p: Player | undefined, rd: number): number | null {
  if (!p) return null;
  const rs = p.roundScores?.find(r => r.round === rd);
  if (rs) {
    if (rs.gross >= 999) return null;
    if (rs.scores?.length && !rs.scores.every(s => s === 0)) {
      return rs.scores.reduce((s, v) => s + v, 0);
    }
    return rs.gross >= 999 ? null : rs.gross;
  }
  if (rd === 1 && p.grossTotal != null && (!p.roundScores || p.roundScores.length === 0)) {
    const g = typeof p.grossTotal === "number" ? p.grossTotal : parseInt(String(p.grossTotal), 10);
    return isNaN(g) ? null : g;
  }
  return null;
}

function bestN(scores: number[], n: number): number {
  return [...scores].sort((a, b) => a - b).slice(0, n).reduce((s, v) => s + v, 0);
}

function fmtHcp(h: number | string | undefined): string {
  if (h == null) return "–";
  return typeof h === "string" ? h : h % 1 === 0 ? String(h) : h.toFixed(1);
}

function fmtTP(tp: number): string {
  return tp === 0 ? "E" : tp > 0 ? `+${tp}` : `${tp}`;
}

export default function ClubesCategoriasView({ tournament, grupos, playersDB, categories, intro, bestNLabel, initialSort, rosterMode }: Props) {
  const tournDate = tournament?.date ?? null;
  const labelN = bestNLabel ?? ((n: number) => `${n} melhores`);
  const [sortCol, setSortCol] = useState<SortCol>(initialSort ?? "total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const byFed = useMemo(() => {
    const m = new Map<string, Player>();
    if (tournament) for (const p of tournament.players) if (p.fedCode) m.set(p.fedCode, p);
    return m;
  }, [tournament]);

  const parTotal = useMemo(() =>
    tournament?.players[0]?.parTotal
    || tournament?.players[0]?.par?.reduce((a, b) => a + b, 0)
    || tournament?.players[0]?.roundScores?.[0]?.pars?.reduce((a, b) => a + b, 0)
    || 0,
  [tournament]);

  // Categoria de um jogador: Juniores (≤Sub-18) → senão Senhoras (F) → senão Homens.
  function catOf(fed: string | null): string {
    const pdb = fed ? playersDB[fed] : undefined;
    const dob = (pdb as any)?.dob as string | undefined;
    const esc = escalaoAtDate(dob, tournDate);
    if (esc && /^Sub (10|12|14|16|18)$/.test(esc)) return "J";
    if ((pdb?.sex || "").toUpperCase() === "F") return "S";
    return "H";
  }

  // Escalão de um jogador à data do torneio (Sub 14, Absoluto, Sénior, …).
  function escOf(fed: string | null): string | null {
    const pdb = fed ? playersDB[fed] : undefined;
    const dob = (pdb as any)?.dob as string | undefined;
    return escalaoAtDate(dob, tournDate);
  }

  const playedRounds = tournament
    ? Math.max(0, ...tournament.players.map(p => p.roundScores?.length ?? 0))
    : 0;
  const rdCols = Array.from({ length: playedRounds }, (_, i) => i + 1);

  const cards = useMemo(() => {
    const sortRows = <T extends { j: GrupoEntry["jogadores"][number]; p: Player | undefined; rds: (number | null)[]; total: number | null }>(rows: T[]): T[] => {
      const INF = sortDir === "asc" ? Infinity : -Infinity;
      return [...rows].sort((a, b) => {
        let av: number | string, bv: number | string;
        if (sortCol === "nome") { av = a.j.nome; bv = b.j.nome; }
        else if (sortCol === "hcp") {
          av = a.p?.hcpExact ?? (typeof a.j.hcp === "number" ? a.j.hcp : 999);
          bv = b.p?.hcpExact ?? (typeof b.j.hcp === "number" ? b.j.hcp : 999);
        } else if (sortCol === "total") { av = a.total ?? INF; bv = b.total ?? INF; }
        else { const ri = (sortCol as number) - 1; av = a.rds[ri] ?? INF; bv = b.rds[ri] ?? INF; }
        if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv as string, "pt") : (bv as string).localeCompare(av, "pt");
        return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
      });
    };

    const raw = grupos.map(g => {
      const cats = categories.map(cfg => {
        const js = g.jogadores.filter(j => catOf(j.fed) === cfg.key);
        let rows = js.map(j => {
          const p = j.fed ? byFed.get(j.fed) : undefined;
          const rds = rdCols.map(rd => grossForRound(p, rd));
          const played = rds.filter(v => v != null) as number[];
          return { j, p, rds, total: played.length ? played.reduce((s, v) => s + v, 0) : null };
        });
        rows = sortRows(rows);
        const rdTotals = rdCols.map((_, ri) => {
          const sc = rows.map(r => r.rds[ri]).filter(v => v != null) as number[];
          return sc.length ? bestN(sc, cfg.bestN) : null;
        });
        const present = rdTotals.filter(v => v != null) as number[];
        const catTotal = present.length ? present.reduce((s, v) => s + v, 0) : null;
        const thresholds = rdCols.map((_, ri) => {
          const sc = [...(rows.map(r => r.rds[ri]).filter(v => v != null) as number[])].sort((a, b) => a - b);
          return sc[cfg.bestN - 1];
        });
        return { cfg, rows, rdTotals, catTotal, thresholds, pos: null as number | null, fieldSize: 0 };
      }).filter(c => c.rows.length > 0);
      return { g, cats };
    });

    // Ranking POR CATEGORIA (cada escalão é um campeonato independente).
    for (const cfg of categories) {
      const entries = raw
        .map(c => ({ club: c.g.grupo, cat: c.cats.find(x => x.cfg.key === cfg.key) }))
        .filter(e => e.cat && e.cat.catTotal != null) as { club: string; cat: { catTotal: number | null } & any }[];
      entries.sort((a, b) => (a.cat.catTotal as number) - (b.cat.catTotal as number));
      let pos = 1;
      entries.forEach((e, i) => {
        if (i > 0 && e.cat.catTotal !== entries[i - 1].cat.catTotal) pos = i + 1;
        e.cat.pos = pos;
        e.cat.fieldSize = entries.length;
      });
    }

    // Ordenar cards pela MELHOR posição que o clube alcançou em qualquer
    // categoria (assim os campeões de cada escalão sobem ao topo).
    return raw.sort((a, b) => {
      const bestA = Math.min(...a.cats.map(c => c.pos ?? Infinity), Infinity);
      const bestB = Math.min(...b.cats.map(c => c.pos ?? Infinity), Infinity);
      if (bestA !== bestB) return bestA - bestB;
      return a.g.clube.localeCompare(b.g.clube, "pt");
    });
  }, [grupos, categories, byFed, rdCols, playersDB, tournDate, parTotal, playedRounds, sortCol, sortDir]);

  const tdC: React.CSSProperties = { padding: "5px 6px", fontSize: "var(--fs-12)", textAlign: "center", borderBottom: "1px solid var(--border)", verticalAlign: "middle" };
  const tdL: React.CSSProperties = { ...tdC, textAlign: "left" };

  function Hdr({ label, col, left }: { label: string; col: SortCol; left?: boolean }) {
    const active = sortCol === col;
    return (
      <th onClick={() => toggleSort(col)} style={{
        ...tdC, textAlign: left ? "left" : "center", paddingLeft: left ? 10 : 6,
        cursor: "pointer", userSelect: "none", fontWeight: 700, fontSize: "var(--fs-10)",
        color: active ? SINGLE_COLOR : "var(--text-muted)", background: "var(--bg-muted)",
        textTransform: "uppercase", letterSpacing: "0.04em",
      }}>
        {label}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
      </th>
    );
  }

  function ScoreCell({ s, counts }: { s: number | null; counts: boolean }) {
    if (s == null) return <td style={{ ...tdC, color: "var(--text-muted)", opacity: 0.4 }}>–</td>;
    const tp = parTotal > 0 ? s - parTotal : null;
    return (
      <td style={{ ...tdC, fontWeight: counts ? 700 : 400, color: counts ? SINGLE_COLOR : "var(--text)" }}>
        <div style={{ lineHeight: 1.15 }}>
          <div>{s}</div>
          {tp != null && (
            <div style={{ fontSize: "var(--fs-9)", lineHeight: 1, opacity: counts ? 0.85 : 0.6, color: counts ? SINGLE_COLOR : "var(--text-muted)" }}>
              ({fmtTP(tp)})
            </div>
          )}
        </div>
      </td>
    );
  }

  return (
    <div style={{ padding: "12px 16px 24px" }}>
      <div className="mb-10" style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>
        {intro ?? (
          <>
            Por categoria dentro de cada clube —{" "}
            {categories.map((c, i) => (
              <React.Fragment key={c.key}>
                <strong>{c.label}</strong> {labelN(c.bestN)}
                {i < categories.length - 1 ? " · " : "."}
              </React.Fragment>
            ))}
          </>
        )}
        {playedRounds > 0 && <span style={{ marginLeft: 8 }}>R{playedRounds}/{tournament?.rounds ?? playedRounds}</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
        {cards.map(({ g, cats }) => {
          return (
            <div key={g.grupo} style={{
              background: "var(--bg-card,#fff)", border: "1px solid var(--border)",
              borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            }}>
              {/* Header do clube — SEM total combinado (cada escalão é um
                  campeonato à parte; a posição vive em cada sub-grupo). */}
              <div style={{ background: SINGLE_COLOR, color: "#fff", padding: "8px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                <div className="shrink-0 fw-900" style={{ width: 30, height: 30, background: "rgba(255,255,255,0.18)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-16)" }}>
                  {g.grupo}
                </div>
                <div className="flex-1 fw-700 fs-13" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g.clube}
                </div>
              </div>

              {/* Sub-grupos por categoria — cada um com a SUA posição/total */}
              {cats.map(({ cfg, rows, rdTotals, catTotal, thresholds, pos, fieldSize }, idx) => {
                const catPar = parTotal * cfg.bestN * playedRounds;
                const catTP = catTotal != null && catPar > 0 ? catTotal - catPar : null;
                const isChamp = pos === 1;
                return (
                  <div key={cfg.key} style={{ marginTop: idx === 0 ? 0 : 10 }}>
                    <div style={{
                      background: isChamp ? "var(--accent-light, #eef6ef)" : "var(--bg-hover)",
                      padding: "4px 10px",
                      fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--text-2)",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                      borderBottom: "1px solid var(--border)",
                    }}>
                      <span>
                        {pos != null && (
                          <span style={{ fontWeight: 900, color: isChamp ? SINGLE_COLOR : "var(--text-2)", marginRight: 6 }}>
                            {isChamp ? "🏆 " : ""}#{pos}{fieldSize > 1 ? `/${fieldSize}` : ""}
                          </span>
                        )}
                        {cfg.label}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{labelN(cfg.bestN)}</span>
                    </div>
                    <table className="w-full" style={{ borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <Hdr label="Jogador" col="nome" left />
                          <Hdr label="HCP" col="hcp" />
                          {rdCols.map(rd => <Hdr key={rd} label={`R${rd}`} col={rd} />)}
                          {rdCols.length > 1 && <Hdr label="Tot." col="total" />}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ j, p, rds, total }) => (
                          <tr key={j.fed ?? j.nome}>
                            <td style={{ ...tdL, paddingLeft: 10 }}>
                              <span style={{ display: "grid", gridTemplateColumns: "94px 1fr", alignItems: "center", columnGap: 6 }}>
                                <span style={{ whiteSpace: "nowrap" }}>
                                  {(() => { const e = escOf(j.fed); return e ? <EscPill esc={e} /> : null; })()}
                                </span>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {p && j.fed
                                    ? <a href={`/jogadores/${j.fed}`} target="_blank" rel="noopener noreferrer" className="td-none" style={{ color: "inherit" }}>{abreviarNome(j.nome)}</a>
                                    : abreviarNome(j.nome)}
                                </span>
                              </span>
                            </td>
                            <td style={{ ...tdC, color: "var(--text-muted)" }}>{fmtHcp(p?.hcpExact ?? (typeof j.hcp === "number" && j.hcp > 0 ? j.hcp : undefined))}</td>
                            {rds.map((s, ri) => (
                              <ScoreCell key={ri} s={s} counts={s != null && thresholds[ri] != null && s <= (thresholds[ri] as number)} />
                            ))}
                            {rdCols.length > 1 && (
                              <td style={{ ...tdC, fontWeight: 500 }}>{total ?? "–"}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "var(--accent-light, #eef6ef)" }}>
                          <td colSpan={2} style={{ ...tdL, paddingLeft: 10, fontWeight: 700, fontSize: "var(--fs-10)", textTransform: "uppercase", color: "var(--text-2)" }}>
                            {cfg.label} ({rosterMode ? rows.length : cfg.bestN})
                          </td>
                          {rdCols.map((_, ri) => <td key={ri} style={{ ...tdC, fontWeight: 700 }}>{rdTotals[ri] ?? "–"}</td>)}
                          {rdCols.length > 1 && (
                            <td style={{ ...tdC, fontWeight: 900 }}>
                              <div style={{ lineHeight: 1.15 }}>
                                <div>{catTotal ?? "–"}</div>
                                {catTP != null && <div style={{ fontSize: "var(--fs-9)", lineHeight: 1, opacity: 0.7 }}>({fmtTP(catTP)})</div>}
                              </div>
                            </td>
                          )}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
