/**
 * RivaisDashboard — International rivals analysis table
 */
import React, { useMemo, useState } from "react";
import { fmtSign, sortArrow } from "../utils/format";
import { FL } from "../utils/flagUtils";
import { zTier, getTrend, getAvgZ, meanArr } from "../utils/mathUtils";
import { scClass, sc3m, SC } from "../utils/scoreDisplay";
import KpiCard from "./KpiCard";
import WdBadge from "./WdBadge";
import { RoundPill } from "./PillBadge";
import { TIER } from "../data/rivalData";
import { TIER_L, TR_I } from "../constants/config";
import type { RivalPlayer, TournDef, RoundAvg } from "./bjgtAnalysisTypes";

// DOB formatter — aceita YYYY-MM-DD, DD/MM/YYYY, ou outro; devolve "DD/MM/YY"
function fmtDob(dob?: string): string {
  if (!dob) return "";
  // YYYY-MM-DD
  let m = dob.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
  // DD/MM/YYYY
  m = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3].slice(2)}`;
  return dob;
}

interface RivaisDashboardProps {
  onSelectPlayer?: (name: string) => void;
  // Global data passed from parent (BJGTContent)
  D: RivalPlayer[];
  T: TournDef[];
  UP: Array<{ id: string; name: string; short?: string; url?: string }>;
  manuel: RivalPlayer;
  T_WEIGHTS: Record<string, number>;
  AVG_R: Record<string, RoundAvg[] | undefined>;
  allCountries: string[];
  showManuelKpis?: boolean;
  seriesBoundaries?: Set<string>;
  // Modo "field" (tabela por torneio futuro): esconde Rank/Trend/UP/vsM,
  // adiciona Média18H, Melhor18H, Top10, Idade
  fieldMode?: boolean;
  /** Data de referência (ISO) para calcular idade no torneio. Se ausente, usa hoje. */
  tournamentDate?: string;
  /** Desactiva o wrapper <div class="scroll-x"> à volta da tabela. Útil quando
   *  o caller controla overflow no seu próprio container (ex: /kids2/next-t). */
  noScroll?: boolean;
}

export default function RivaisDashboard({
  onSelectPlayer,
  D,
  T,
  UP,
  manuel,
  T_WEIGHTS,
  AVG_R,
  allCountries,
  showManuelKpis = true,
  seriesBoundaries,
  fieldMode = false,
  tournamentDate,
  noScroll = false,
}: RivaisDashboardProps) {
  const [fTour, setFTour] = useState("all");
  const [fUp, setFUp] = useState("all");
  const [fCo, setFCo] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("zrank");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  // Em fieldMode (tabela /kids2/next-t) "Só com dados" arranca ON para esconder
  // inscritos sem histórico e dar uma vista útil logo à partida.
  const [dOnly, setDOnly] = useState(fieldMode);
  const [vsOn, setVsOn] = useState(true);

  const list = useMemo(() => {
    let pl = [...D];
    if (dOnly) pl = pl.filter(x => Object.values(x.r).some(r => r.tp != null));
    if (fTour !== "all") pl = pl.filter(x => x.r[fTour]);
    if (fUp !== "all") pl = pl.filter(x => x.up.includes(fUp));
    if (fCo !== "all") pl = pl.filter(x => x.co === fCo);
    if (q) {
      const ql = q.toLowerCase();
      pl = pl.filter(x => x.n.toLowerCase().includes(ql));
    }
    pl.sort((a, b) => {
      let cmp = 0;
      if (sort === "name") cmp = a.n.localeCompare(b.n);
      else if (sort === "zrank") {
        cmp =
          ((getAvgZ as unknown as (p: RivalPlayer) => number | null)(a) ?? 99) -
          ((getAvgZ as unknown as (p: RivalPlayer) => number | null)(b) ?? 99);
      } else if (sort === "vsManuel") {
        cmp = (getVsAvg(a) ?? 999) - (getVsAvg(b) ?? 999);
      } else if (sort.startsWith("t:")) {
        const tid = sort.slice(2);
        const posOf = (x: RivalPlayer) => {
          const r = x.r[tid];
          if (!r || r.tp == null) return 9999;
          return typeof r.p === "number" ? r.p : 9998;
        };
        cmp = posOf(a) - posOf(b);
      } else if (sort.startsWith("up:")) {
        const uid = sort.slice(3);
        cmp = (a.up.includes(uid) ? 0 : 1) - (b.up.includes(uid) ? 0 : 1);
        if (cmp === 0) cmp = a.n.localeCompare(b.n);
      } else if (sort === "avg18" || sort === "best18" || sort === "top10" || sort === "age") {
        const stat = (x: RivalPlayer): number => {
          if (sort === "top10") {
            let n = 0;
            for (const td of T) {
              const r = x.r[td.id];
              if (r && typeof r.p === "number" && r.p <= 10) n++;
            }
            return -n; // mais top10 primeiro quando asc
          }
          if (sort === "age") {
            if (!x.dob) return 9999;
            const dm = x.dob.match(/^(\d{4})-(\d{2})-(\d{2})/) || x.dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (!dm) return 9999;
            let y, m, d;
            if (dm[0].includes("-")) { y = +dm[1]; m = +dm[2]; d = +dm[3]; }
            else { d = +dm[1]; m = +dm[2]; y = +dm[3]; }
            return -new Date(y, m - 1, d).getTime(); // mais velho primeiro
          }
          // avg18 / best18
          const gross18: number[] = [];
          for (const td of T) {
            if ((td.holes ?? 18) < 18) continue;
            const r = x.r[td.id];
            if (!r || !r.rd) continue;
            for (const g of r.rd) if (g > 0) gross18.push(g);
          }
          if (gross18.length === 0) return 9999;
          if (sort === "best18") return Math.min(...gross18);
          return gross18.reduce((a, b) => a + b, 0) / gross18.length;
        };
        cmp = stat(a) - stat(b);
      }
      return dir === "desc" ? -cmp : cmp;
    });
    return pl;
  }, [fTour, fUp, fCo, q, sort, dir, dOnly, D, T]);

  const doSort = (c: string) => {
    if (sort === c) setDir(d => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(c);
      setDir("asc");
    }
  };

  // Compute global ordinal rankings from z-score (across ALL players, not just filtered)
  const rankMap = useMemo(() => {
    const scored = D.map(p => ({
      n: p.n,
      z: (getAvgZ as unknown as (p: RivalPlayer) => number | null)(p),
    })).filter(x => x.z != null) as { n: string; z: number }[];
    scored.sort((a, b) => a.z - b.z); // lower z = better
    const map: Record<string, number> = {};
    scored.forEach((s, i) => {
      map[s.n] = i + 1;
    });
    return map;
  }, [D]);
  const totalRanked = Object.keys(rankMap).length;

  function getVsAvg(p: RivalPlayer) {
    if (p.isM) return null;
    const ds: number[] = [];
    Object.keys(p.r).forEach(tid => {
      const m = manuel.r[tid];
      if (m && p.r[tid].tp != null && m.tp != null)
        ds.push(p.r[tid].tp - m.tp);
    });
    return ds.length ? Math.round(meanArr(ds) ?? 0) : null;
  }

  // Count tournaments & rounds played
  const nPlayed = (p: RivalPlayer) =>
    T.filter(t => p.r[t.id] && p.r[t.id].tp != null).length;
  const nRounds = (p: RivalPlayer) =>
    T.reduce((acc, t) => {
      const res = p.r[t.id];
      return (
        acc +
        (res && res.rd ? res.rd.filter((x: number | null) => x != null).length : 0)
      );
    }, 0);

  return (
    <div className="tourn-section">
      {/* Manuel KPIs (opcional) */}
      {showManuelKpis && (
        <div className="kpis" style={{ gridTemplateColumns: `repeat(${T.length}, 1fr)` }}>
          {T.map(t => {
            const res = manuel.r[t.id];
            if (!res)
              return (
                <div key={t.id} className="kpi op-4">
                  <div className="kpi-lbl">{t.short}</div>
                  <div className="kpi-val fs-16">–</div>
                </div>
              );
            return (
              <KpiCard
                key={t.id}
                label={t.short}
                value={fmtSign(res.tp!)}
                sub={`#${res.p} · ${res.rd.join("-")}`}
                color={res.tp! <= 0 ? "var(--color-good-dark)" : undefined}
                size="sm"
              />
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="detail-toolbar">
        <input
          type="text"
          placeholder="Pesquisar..."
          value={q}
          onChange={e => setQ(e.target.value)}
          className="input"
          style={{ maxWidth: 140 }}
        />
        <select
          value={fTour}
          onChange={e => setFTour(e.target.value)}
          className="select"
        >
          <option value="all">Todos Torneios</option>
          {T.map(t => (
            <option key={t.id} value={t.id}>
              {t.short}
            </option>
          ))}
        </select>
        <select
          value={fUp}
          onChange={e => setFUp(e.target.value)}
          className="select"
        >
          <option value="all">Próximos: Todos</option>
          {UP.map(u => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select
          value={fCo}
          onChange={e => setFCo(e.target.value)}
          className="select"
        >
          <option value="all">🌍 País</option>
          {allCountries.map(c => (
            <option key={c} value={c}>
              {FL[c] || ""} {c}
            </option>
          ))}
        </select>
        <label className="filter-checkbox">
          <input
            type="checkbox"
            checked={dOnly}
            onChange={e => setDOnly(e.target.checked)}
          />{" "}
          Só com dados
        </label>
        <label className="filter-checkbox">
          <input
            type="checkbox"
            checked={vsOn}
            onChange={e => setVsOn(e.target.checked)}
          />{" "}
          vs Manuel
        </label>
        <div className="chip">{list.length} jogadores</div>
      </div>

      {/* Legend */}
      <div className="legend-row">
        {(Object.keys(TIER) as Array<keyof typeof TIER>).map(k => (
          <span key={k} className="legend-item">
            <span
              className="legend-dot"
              style={{ background: TIER[k].bg }}
            />
            <span className="fs-10" style={{ color: TIER[k].c }}>
              {TIER_L[k]}
            </span>
          </span>
        ))}
      </div>

      {/* Table — quando noScroll, omite o wrapper .card (bg branca) para a tabela
          fluir com o background da pagina. */}
      <div className={noScroll ? "" : "card"}>
        <div className={noScroll ? "" : "scroll-x"}>
          <table className="bc-collapse">
            <thead>
              {/* Header de grupo (só em fieldMode) — agrupa colunas por circuito.
                  Usa seriesBoundaries para encontrar o início de cada grupo e
                  conta tournments até ao próximo boundary. */}
              {fieldMode && (() => {
                // Compute groups: array de { label, span, start }
                interface Grp { label: string; url?: string; span: number }
                const groups: Grp[] = [];
                // Extrai "EU", "WC", "Venice"… do t.short ("EU '22" → "EU")
                const seriesOf = (short: string): string => {
                  const m = short.match(/^(.+?)\s+['′][\d]/);
                  return m ? m[1] : short;
                };
                // Nome completo da série a partir do t.name ("European Championship
                // 2026" -> "European Championship"); fallback ao short.
                const fullName = (name: string): string => name.replace(/\s+\d{4}\s*$/, "").trim();
                T.forEach((t, i) => {
                  const isBoundary = i === 0 || seriesBoundaries?.has(t.id);
                  if (isBoundary) {
                    const label = fullName(t.name) || seriesOf(t.short);
                    groups.push({ label, url: t.url || undefined, span: 1 });
                  } else {
                    const g = groups[groups.length - 1];
                    g.span++;
                    if (t.url) g.url = t.url; // edição mais recente da série (ordem asc)
                  }
                });
                return (
                  <tr style={{ background: "var(--surface-2, var(--bg-secondary, #f7f6f1))" }}>
                    <th colSpan={2} style={{ borderBottom: "1px solid var(--border)" }} />
                    {groups.map((g, gi) => (
                      <th
                        key={gi}
                        colSpan={g.span}
                        style={{
                          textAlign: "center",
                          fontSize: "var(--fs-12)",
                          fontWeight: 600,
                          color: "var(--text-2)",
                          padding: "6px 8px",
                          borderLeft: gi > 0 ? "1px solid var(--border)" : undefined,
                          borderBottom: "1px solid var(--border)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {g.url ? (
                          <a href={g.url} target="_blank" rel="noopener noreferrer" className="rivais-link" title={`Página oficial — ${g.label}`}>{g.label}</a>
                        ) : g.label}
                      </th>
                    ))}
                  </tr>
                );
              })()}
              <tr className="rivais-group-header">
                <th
                  className="rivais-th-name pointer"
                  onClick={() => doSort("name")}
                >
                  Jogador{sortArrow("name", sort, dir)}
                </th>
                <th
                  className="rivais-th pointer ta-c"
                  onClick={() => doSort("zrank")}
                  title="Torneios jogados"
                >
                  #T
                </th>
                {T.map(t => {
                  const w = T_WEIGHTS[t.id];
                  const stars =
                    w >= 0.9 ? "★★★" : w >= 0.6 ? "★★" : w >= 0.4 ? "★" : "½";
                  const isBoundary = seriesBoundaries?.has(t.id);
                  return (
                    <th
                      key={t.id}
                      className="rivais-th pointer ta-c"
                      style={{ minWidth: 56, borderLeft: isBoundary ? "1px solid var(--border)" : undefined }}
                      onClick={() => doSort("t:" + t.id)}
                    >
                      {t.url ? (
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rivais-link"
                          onClick={e => e.stopPropagation()}
                        >
                          {t.short}
                        </a>
                      ) : (
                        t.short
                      )}
                      {sortArrow("t:" + t.id, sort, dir)}
                      <div className="fs-10 fw-500 op-6 mt-1">{stars}</div>
                    </th>
                  );
                })}
                {!fieldMode && (
                  <th
                    className="rivais-th pointer ta-c"
                    style={{ borderLeft: "3px solid var(--text-muted)", minWidth: 56 }}
                    onClick={() => doSort("zrank")}
                  >
                    Rank{sortArrow("zrank", sort, dir)}
                  </th>
                )}
                {!fieldMode && <th className="rivais-th ta-c">▲</th>}
                {!fieldMode && UP.map(u => (
                  <th
                    key={u.id}
                    className="rivais-th pointer ta-c"
                    onClick={() => doSort("up:" + u.id)}
                  >
                    {u.url ? (
                      <a
                        href={u.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rivais-link"
                        onClick={e => e.stopPropagation()}
                      >
                        {u.short}
                      </a>
                    ) : (
                      u.short
                    )}
                    {sortArrow("up:" + u.id, sort, dir)}
                  </th>
                ))}
                {!fieldMode && vsOn && (
                  <th
                    className="rivais-th pointer ta-c"
                    onClick={() => doSort("vsManuel")}
                  >
                    vs M{sortArrow("vsManuel", sort, dir)}
                  </th>
                )}
                {/* Em fieldMode não há mais bloco "Resumo" — a idade vai
                    inline com o nome do jogador (sub-texto) e o #T no início
                    serve de indicador de volume de dados. */}
              </tr>
            </thead>
            <tbody>
              {list.map(p => {
                const isM = p.isM;
                const tr = getTrend(p);
                const flag = FL[p.co] || "🏳️";
                const vsAvg = vsOn ? getVsAvg(p) : null;
                const played = nPlayed(p);

                return (
                  <tr
                    key={p.n}
                    className={isM ? "rivais-row-ref" : ""}
                    style={{ height: 52 }}
                  >
                    {/* Player name — clickable */}
                    <td className="rivais-player-name" style={{ verticalAlign: "middle" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="rivais-flag" title={p.co}>
                          {flag}
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
                          {onSelectPlayer ? (
                            <button
                              className="btn-link fs-12 fw-600"
                              style={{
                                color: isM ? "var(--text)" : "var(--text-2)",
                                padding: 0,
                                textAlign: "left",
                              }}
                              onClick={() => onSelectPlayer(p.n)}
                            >
                              {p.n}
                            </button>
                          ) : (
                            <span
                              className={`fs-12${isM ? " fw-700" : " fw-600"}`}
                              style={{
                                color: isM ? "var(--text)" : "var(--text-2)",
                              }}
                            >
                              {p.n}
                            </span>
                          )}
                          {p.dob && (() => {
                            // Em fieldMode + tournamentDate mostra idade calculada
                            // ("11.8 anos"). Sem tournamentDate cai no DOB cru.
                            let label = fmtDob(p.dob);
                            if (fieldMode && tournamentDate) {
                              const dm = p.dob.match(/^(\d{4})-(\d{2})-(\d{2})/) || p.dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                              if (dm) {
                                let y, m, d;
                                if (dm[0].includes("-")) { y = +dm[1]; m = +dm[2]; d = +dm[3]; }
                                else { d = +dm[1]; m = +dm[2]; y = +dm[3]; }
                                const dob = new Date(y, m - 1, d);
                                const tdt = new Date(tournamentDate);
                                const diffMs = tdt.getTime() - dob.getTime();
                                const diffYears = diffMs / (365.25 * 86400000);
                                if (!isNaN(diffYears) && diffYears > 0) {
                                  label = diffYears.toFixed(1) + " anos";
                                }
                              }
                            }
                            return (
                              <span className="fs-10 c-text-3" style={{ marginTop: 1 }}>
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                        {isM && <span className="p p-sm p-outline ml-4">REF</span>}
                      </div>
                    </td>

                    {/* # tournaments played */}
                    <td className="ta-c fs-12 fw-600 c-text-3">
                      {played || ""}
                    </td>

                    {/* One cell per tournament: ±par colored + position */}
                    {T.map(t => {
                      const isBoundary = seriesBoundaries?.has(t.id);
                      const boundaryStyle: React.CSSProperties = isBoundary
                        ? { borderLeft: "1px solid var(--border)" }
                        : {};
                      const res = p.r[t.id];
                      if (!res || (res.tp == null && res.p !== "WD"))
                        return <td key={t.id} style={boundaryStyle} />;
                      if (res.p === "WD")
                        return (
                          <td key={t.id} style={boundaryStyle}>
                            <WdBadge muted />
                          </td>
                        );

                      // Tier color
                      const playerAvg = res.t! / t.rounds;
                      const roundAvgs = AVG_R[t.id] as RoundAvg[] | undefined;
                      let fieldAvg: number | null = null,
                        fieldStd: number | null = null;
                      if (roundAvgs && roundAvgs.length > 0) {
                        const ms = roundAvgs
                          .filter(
                            (x: RoundAvg): x is { m: number; s: number } =>
                              x != null
                          )
                          .map(x => x.m);
                        const ss = roundAvgs
                          .filter(
                            (x: RoundAvg): x is { m: number; s: number } =>
                              x != null
                          )
                          .map(x => x.s);
                        if (ms.length > 0) {
                          fieldAvg =
                            ms.reduce((a: number, b: number) => a + b, 0) /
                            ms.length;
                          fieldStd =
                            ss.reduce((a: number, b: number) => a + b, 0) /
                            ss.length;
                        }
                      }
                      const ti =
                        fieldAvg != null
                          ? zTier(playerAvg, {
                              m: fieldAvg,
                              s: fieldStd ?? 0,
                            })
                          : null;
                      const st = (
                        ti ? TIER[ti as keyof typeof TIER] : null
                      ) as { bg: string; c: string } | null;
                      const tpStr = fmtSign(res.tp);

                      // vs Manuel delta
                      let vsM: number | null = null;
                      if (
                        vsOn &&
                        !isM &&
                        manuel?.r[t.id] &&
                        manuel.r[t.id].tp != null
                      ) {
                        vsM = res.tp! - manuel.r[t.id].tp!;
                      }

                      // Em fieldMode reduzimos o ruído visual: só pintamos o
                      // fundo da célula nos extremos (elite e beginner). Para os
                      // tiers intermédios (strong/solid/developing) ficamos só
                      // com a cor do texto a marcar o ±par.
                      const showBg = !fieldMode || ti === "elite" || ti === "beginner";
                      const cellBg = showBg ? (st?.bg || "transparent") : "transparent";
                      return (
                        <td
                          key={t.id}
                          className="ta-c"
                          style={{
                            background: cellBg,
                            padding: "5px 4px",
                            ...boundaryStyle,
                          }}
                        >
                          <div
                            className="fw-700 fs-13"
                            style={{
                              color: st?.c || "var(--text-3)",
                            }}
                          >
                            {tpStr}
                          </div>
                          <div className="fs-10 fw-600 c-text-3">#{res.p}</div>
                          {vsM != null && (
                            <div
                              className="fs-10 fw-600"
                              style={{ color: sc3m(vsM, 0, 0) }}
                            >
                              {fmtSign(vsM)}
                            </div>
                          )}
                        </td>
                      );
                    })}

                    {/* Rank — só em modo clássico */}
                    {!fieldMode && (
                      <td
                        className="ta-c"
                        style={{
                          borderLeft: "3px solid var(--border-light)",
                          padding: "4px 6px",
                        }}
                      >
                        {rankMap[p.n] != null ? (
                          <div
                            title={`z-score: ${(
                              (getAvgZ as unknown as (
                                p: RivalPlayer
                              ) => number | null)(p) ?? 0
                            ).toFixed(2)} · ${nRounds(p)} rondas`}
                          >
                            <div
                              className="fw-800 fs-13"
                              style={{
                                color:
                                  rankMap[p.n] <= 10
                                    ? "var(--color-good-dark)"
                                    : rankMap[p.n] <= 30
                                      ? "var(--text)"
                                      : "var(--text-3)",
                              }}
                            >
                              {rankMap[p.n]}º
                            </div>
                            <div className="fs-10 c-text-3">
                              {nPlayed(p)}T
                              {nRounds(p) > 1 && (
                                <>
                                  {" "}
                                  · <RoundPill nR={nRounds(p)} />
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="fs-10 c-border">s/d</span>
                        )}
                      </td>
                    )}

                    {/* Trend — só em modo clássico */}
                    {!fieldMode && (
                      <td className="ta-c">
                        {tr ? (
                          <span
                            className="fw-700 fs-13"
                            style={{ color: TR_I[tr].c }}
                          >
                            {TR_I[tr].i}
                          </span>
                        ) : (
                          <span className="c-border">—</span>
                        )}
                      </td>
                    )}

                    {/* Upcoming tournaments — só em modo clássico */}
                    {!fieldMode && UP.map(u => (
                      <td key={u.id} className="ta-c fs-12">
                        {p.up.includes(u.id) ? (
                          <span className="fw-700 c-good-dark">✓</span>
                        ) : (
                          <span className="c-border">—</span>
                        )}
                      </td>
                    ))}

                    {/* vs Manuel average — só em modo clássico */}
                    {!fieldMode && vsOn && (
                      <td className="ta-c">
                        {isM ? (
                          <span className="fs-10 c-border">—</span>
                        ) : vsAvg != null ? (
                          <span
                            className="fs-12 fw-700"
                            style={{ color: sc3m(vsAvg, 0, 0) }}
                          >
                            {fmtSign(vsAvg)}
                          </span>
                        ) : (
                          <span className="fs-10 c-border">—</span>
                        )}
                      </td>
                    )}

                    {/* Field mode: o bloco de resumo (Méd 18H + Best 18H + T10
                        + Idade) foi removido. A idade aparece agora como
                        sub-texto do nome do jogador. */}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-subtitle ta-c mt-10">
        Clica num jogador para ver detalhe · Rank ponderado por prestigio: estrelas, peso maximo, meio peso minimo ({totalRanked} jogadores com dados)
      </div>
    </div>
  );
}

