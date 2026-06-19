import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import type { PlayerPageData, CrossPlayerData } from "../data/playerDataLoader";
import { numSafe } from "../utils/mathUtils";
import { sdClassByHcp } from "../utils/scoreDisplay";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";

// HCP Evolution SVG Chart
function HcpEvolutionChart({ players, currentFed, escName }: {
  players: CrossPlayerData[]; currentFed: string; escName: string;
}) {
  const [period, setPeriod] = useState(12);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const chartPlayers = useMemo(() =>
    players.filter(p => p.hcpHistory && p.hcpHistory.length >= 2),
    [players]
  );

  const cutoff = period > 0 ? Date.now() - period * 30.44 * 86400000 : 0;

  const togglePlayer = (fed: string) => {
    setHidden(prev => {
      const n = new Set(prev);
      n.has(fed) ? n.delete(fed) : n.add(fed);
      return n;
    });
  };

  if (chartPlayers.length < 1) return null;

  const W = 800, H = 280;
  const PAD = { top: 20, right: 20, bottom: 30, left: 45 };
  const visiblePlayers = chartPlayers.filter(p => !hidden.has(p.fed));

  let allPts: { d: number; h: number }[] = [];
  visiblePlayers.forEach(p => {
    allPts = allPts.concat((p.hcpHistory || []).filter(pt => pt.d >= cutoff));
  });
  if (allPts.length === 0) return null;

  const minD = Math.min(...allPts.map(p => p.d));
  const maxD = Math.max(...allPts.map(p => p.d));
  const minH = Math.min(...allPts.map(p => p.h));
  const maxH = Math.max(...allPts.map(p => p.h));
  const rangeD = maxD - minD || 1;
  const rangeH = maxH - minH || 1;

  const scaleX = (d: number) => PAD.left + (d - minD) / rangeD * (W - PAD.left - PAD.right);
  const scaleY = (h: number) => H - PAD.bottom - (h - minH) / rangeH * (H - PAD.top - PAD.bottom);

  const COLORS = ["#0066cc", "#ff6b6b", "#51cf66", "#ffd43b", "#a78bfa", "#ff922b"];

  return (
    <div className="card mt-12">
      <div className="h-xs fs-14 mb-8">📈 Evolução HCP - {escName}</div>
      <div className="mb-8">
        <label style={{ marginRight: 12, fontSize: "var(--fs-12)" }}>
          Período:
          <select value={period} onChange={e => setPeriod(Number(e.target.value))} style={{ marginLeft: 6, padding: "4px 8px" }}>
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
            <option value={24}>24 meses</option>
            <option value={0}>Tudo</option>
          </select>
        </label>
      </div>
      <div className="scroll-x mb-10">
        <svg width={W} height={H} style={{ border: "1px solid var(--border)" }}>
          {/* Grid */}
          {Array.from({ length: 5 }, (_, i) => {
            const h = minH + (i / 4) * rangeH;
            const y = scaleY(h);
            return <line key={`h${i}`} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--border-light)" strokeDasharray="2,2" />;
          })}
          {/* Y-axis labels */}
          {Array.from({ length: 5 }, (_, i) => {
            const h = minH + (i / 4) * rangeH;
            const y = scaleY(h);
            return (
              <text key={`yl${i}`} x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize={10} fill="var(--text-3)">
                {h.toFixed(1)}
              </text>
            );
          })}
          {/* Lines */}
          {visiblePlayers.map((p, pi) => {
            const color = COLORS[pi % COLORS.length];
            const pts = (p.hcpHistory || []).filter(pt => pt.d >= cutoff).sort((a, b) => a.d - b.d);
            if (pts.length < 2) return null;
            const path = pts.map((pt, i) => {
              const x = scaleX(pt.d);
              const y = scaleY(pt.h);
              return `${i === 0 ? "M" : "L"} ${x} ${y}`;
            }).join(" ");
            return (
              <g key={p.fed}>
                <path d={path} stroke={color} strokeWidth={2} fill="none" />
              </g>
            );
          })}
        </svg>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {chartPlayers.map((p, pi) => {
          const color = COLORS[pi % COLORS.length];
          const isHidden = hidden.has(p.fed);
          return (
            <button
              key={p.fed}
              onClick={() => togglePlayer(p.fed)}
              style={{
                padding: "4px 8px",
                fontSize: "var(--fs-11)",
                background: isHidden ? "var(--bg-muted)" : color + "20",
                border: `1px solid ${color}`,
                borderRadius: 4,
                cursor: "pointer",
                opacity: isHidden ? 0.5 : 1,
              }}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Common Courses
function CommonCourses({ players, currentFed, escName }: {
  players: CrossPlayerData[]; currentFed: string; escName: string;
}) {
  const courseMap = useMemo(() => {
    const m: Record<string, { name: string; count: number; players: string[] }> = {};
    players.forEach(p => {
      if (p.courseCount) {
        Object.entries(p.courseCount).forEach(([c, cnt]) => {
          if (!m[c]) m[c] = { name: c, count: 0, players: [] };
          m[c].count += cnt;
          m[c].players.push(p.name);
        });
      }
    });
    const list = Object.values(m).sort((a, b) => b.count - a.count).slice(0, 10);
    return list;
  }, [players]);

  if (courseMap.length === 0) return null;

  return (
    <div className="card mt-12">
      <div className="h-xs fs-14 mb-8">🏌 Campos Comuns</div>
      <table className="dtable fs-12">
        <thead><tr><th>Campo</th><th className="r">Jogadores</th><th className="r">Total</th></tr></thead>
        <tbody>
          {courseMap.map(c => (
            <tr key={c.name}>
              <td>{c.name}</td>
              <td className="r">{c.players.length}</td>
              <td className="r"><b>{c.count}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CrossAnalysis({ data, bare: _bare }: { data: PlayerPageData; bare?: boolean }) {
  const keys = Object.keys(data.CROSS_DATA);
  const [activeEsc, setActiveEsc] = useState<string>("");
  const [sexFilter, setSexFilter] = useState("all");
  const [hcpMax, setHcpMax] = useState("all");
  const { sortKey, sortDir, toggleSort } = useSort<"jogador" | "hcp" | "ult_sd" | "m_sd" | "torneios" | "total">("total", "desc", {
    hcp: "asc", ult_sd: "asc", m_sd: "asc", torneios: "desc",
  });

  const byEscalao = useMemo(() => {
    const map: Record<string, CrossPlayerData[]> = {};
    for (const fed in data.CROSS_DATA) {
      const p = data.CROSS_DATA[fed];
      const esc = p.escalao || "Sem escalão";
      if (!map[esc]) map[esc] = [];
      map[esc].push(p);
    }
    return map;
  }, [data.CROSS_DATA]);

  const escOrder = ["Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18", "Absoluto", "Sénior", "Sem escalão"];
  const escalaos = escOrder.filter(e => byEscalao[e]?.length >= 1);

  useEffect(() => {
    if (!activeEsc && escalaos.length > 0) {
      const cur = data.CROSS_DATA[data.CURRENT_FED]?.escalao || "";
      setActiveEsc(escalaos.find(e => e === cur) || escalaos[0]);
    }
  }, [escalaos, activeEsc, data]);

  if (keys.length < 2) return null;

  const players = useMemo(() => {
    let p = (byEscalao[activeEsc] || [])
      .filter(pp => {
        if (sexFilter !== "all" && pp.sex !== sexFilter) return false;
        if (hcpMax !== "all" && (pp.currentHcp == null || pp.currentHcp > Number(hcpMax))) return false;
        return true;
      });

    const dir = sortDir === "asc" ? 1 : -1;
    p.sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "jogador": return dir * a.name.localeCompare(b.name, "pt");
        case "hcp": av = a.currentHcp ?? 999; bv = b.currentHcp ?? 999; break;
        case "ult_sd": av = a.lastSD ?? 999; bv = b.lastSD ?? 999; break;
        case "m_sd": av = a.avgSD20 ?? 999; bv = b.avgSD20 ?? 999; break;
        case "torneios": av = a.numTournaments ?? 0; bv = b.numTournaments ?? 0; break;
        case "total": av = a.numRounds ?? 0; bv = b.numRounds ?? 0; break;
        default: av = a.numRounds ?? 0; bv = b.numRounds ?? 0;
      }
      return dir * (av - bv);
    });
    return p;
  }, [byEscalao, activeEsc, sexFilter, hcpMax, sortKey, sortDir]);

  const curYear = new Date().getFullYear();

  return (
    <div className="card mt-24">
      <div className="h-xs fs-18 mb-16">📊 Cross-Análise por Escalão</div>
      {/* Tabs */}
      <div className="escalao-pills jog-cross-wrap">
        {escalaos.map(esc => (
          <button key={esc} className={`p p-filter${esc === activeEsc ? " active" : ""}`}
            onClick={() => setActiveEsc(esc)}>
            {esc} <span className="p-filter-count">{byEscalao[esc].length}</span>
          </button>
        ))}
      </div>
      {/* Filters */}
      <div className="jog-cross-filter">
        <select className="mini-badge"
          value={sexFilter} onChange={e => setSexFilter(e.target.value)}>
          <option value="all">Sexo</option>
          <option value="M">Masc.</option>
          <option value="F">Fem.</option>
        </select>
        <select className="mini-badge"
          value={hcpMax} onChange={e => setHcpMax(e.target.value)}>
          <option value="all">HCP máx</option>
          {[0, 3, 6, 9, 12, 15, 18, 21, 25, 28, 31, 38, 45].map(v => (
            <option key={v} value={v}>{v === 0 ? "Scratch (≤0)" : `≤ ${v}`}</option>
          ))}
        </select>
        <span className="muted fw-600 fs-11">{players.length} jogadores</span>
      </div>
      {/* Ranking table */}
      <div className="scroll-x">
        <table className="dtable cross-table">
          <thead>
            <tr>
              <th className="r" style={{ width: 28 }}>#</th>
              <SortableHdr k="jogador" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Jogador</SortableHdr>
              <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">HCP</SortableHdr>
              <SortableHdr k="ult_sd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Últ.SD</SortableHdr>
              <SortableHdr k="m_sd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">M.SD</SortableHdr>
              <SortableHdr k="torneios" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Torneios</SortableHdr>
              <SortableHdr k="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Total</SortableHdr>
              {[curYear - 3, curYear - 2, curYear - 1, curYear].map(y => (
                <th key={y} className="r">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => {
              const isCurrent = p.fed === data.CURRENT_FED;
              return (
                <tr key={p.fed} className={isCurrent ? "cross-current" : ""}>
                  <td className="r"><b>{i + 1}</b></td>
                  <td>
                    <Link
                      to={`/jogadores/${p.fed}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="courseLink"
                      style={{ fontWeight: isCurrent ? 700 : undefined }}
                      onClick={e => e.stopPropagation()}
                    >
                      {p.name}
                    </Link>
                    {" "}<span className="muted fs-10">{p.fed}</span>
                    {p.birthYear && <span className="p p-sm p-birth ml-4">{p.birthYear}</span>}
                    {p.club && <span className="p p-sm p-club ml-4">{p.club}</span>}
                  </td>
                  <td className="r"><b>{p.currentHcp?.toFixed(1) ?? "–"}</b></td>
                  <td className="r">
                    {p.lastSD != null
                      ? <span className={`p p-${sdClassByHcp(p.lastSD, p.currentHcp)}`}>{p.lastSD.toFixed(1)}</span>
                      : "–"}
                  </td>
                  <td className="r">
                    {p.avgSD20 != null
                      ? <span className={`p p-${sdClassByHcp(p.avgSD20, p.currentHcp)}`}>{p.avgSD20.toFixed(1)}</span>
                      : "–"}
                  </td>
                  <td className="r">{p.numTournaments}</td>
                  <td className="r"><b>{p.numRounds ?? ""}</b></td>
                  {[curYear - 3, curYear - 2, curYear - 1, curYear].map((y, yi) => {
                    const yearFields = ["rounds3YearsAgo", "rounds2YearsAgo", "roundsLastYear", "roundsCurrentYear"] as const;
                    const val = p[yearFields[yi]];
                    return <td key={y} className="r">{val ?? ""}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* HCP Evolution Chart */}
      <HcpEvolutionChart players={players} currentFed={data.CURRENT_FED} escName={activeEsc} />

      {/* Common Courses */}
      <CommonCourses players={players} currentFed={data.CURRENT_FED} escName={activeEsc} />
    </div>
  );
}
