import { useState, useMemo, useEffect } from "react";
import type { PlayerPageData, CrossPlayerData } from "../data/playerDataLoader";
import { useSort, compareNullsLast } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";
import PlayerLink from "./PlayerLink";
import { ESC_ORDER_FULL } from "../constants/escaloes";
import { fmtHcp } from "../utils/format";
import TabRow from "./TabRow";
import SexSelect from "./SexSelect";
import Select from "./Select";
import { SDPill } from "./tournamentPrimitives";

// Common Courses
function CommonCourses({ players }: {
  players: CrossPlayerData[]; currentFed: string; escName: string;
}) {
  const courseMap = useMemo(() => {
    const m: Record<string, { name: string; count: number; players: string[] }> = {};
    players.forEach(p => {
      if (p.courseTee) {
        // Agrega por campo (courseTee é indexado por tee — somar as voltas de todos os tees do mesmo campo).
        Object.values(p.courseTee).forEach(ct => {
          const c = ct.course;
          if (!m[c]) m[c] = { name: c, count: 0, players: [] };
          m[c].count += ct.count;
          if (!m[c].players.includes(p.name)) m[c].players.push(p.name);
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

export function CrossAnalysis({ data, bare }: { data: PlayerPageData; bare?: boolean }) {
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

  const escalaos = [...ESC_ORDER_FULL, "Sem escalão"].filter(e => byEscalao[e]?.length >= 1);

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
      let av: number | null, bv: number | null;
      switch (sortKey) {
        case "jogador": return dir * a.name.localeCompare(b.name, "pt");
        case "hcp": av = a.currentHcp ?? null; bv = b.currentHcp ?? null; break;
        case "ult_sd": av = a.lastSD ?? null; bv = b.lastSD ?? null; break;
        case "m_sd": av = a.avgSD20 ?? null; bv = b.avgSD20 ?? null; break;
        case "torneios": av = a.numTournaments ?? 0; bv = b.numTournaments ?? 0; break;
        case "total": av = a.numRounds ?? 0; bv = b.numRounds ?? 0; break;
        default: av = a.numRounds ?? 0; bv = b.numRounds ?? 0;
      }
      return compareNullsLast(av, bv, dir);
    });
    return p;
  }, [byEscalao, activeEsc, sexFilter, hcpMax, sortKey, sortDir]);

  const curYear = new Date().getFullYear();

  return (
    // bare = já vive dentro de um CollapseCard com título próprio (AnalysisView)
    // — sem cartão-dentro-de-cartão nem título duplicado.
    <div className={bare ? undefined : "card mt-24"}>
      {!bare && <div className="h-xs fs-18 mb-16">📊 Cross-Análise por Escalão</div>}
      {/* Tabs */}
      <TabRow className="jog-cross-wrap" ariaLabel="Escalão" active={activeEsc} onChange={setActiveEsc}
        tabs={escalaos.map(esc => ({ key: esc, label: esc, count: byEscalao[esc].length }))} />
      {/* Filters */}
      <div className="jog-cross-filter">
        <SexSelect variant="compact" value={sexFilter} onChange={setSexFilter} allValue="all" />
        <Select variant="compact"
          value={hcpMax} onChange={setHcpMax}>
          <option value="all">HCP máx</option>
          {[0, 3, 6, 9, 12, 15, 18, 21, 25, 28, 31, 38, 45].map(v => (
            <option key={v} value={v}>{v === 0 ? "Scratch (≤0)" : `≤ ${v}`}</option>
          ))}
        </Select>
        <span className="muted fw-600 fs-11">{players.length} jogadores</span>
      </div>
      {/* Ranking table */}
      <div className="scroll-x">
        <table className="dtable cross-table">
          <thead>
            <tr>
              <th className="r u-w-28px">#</th>
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
                    <PlayerLink fed={p.fed} name={p.name} className={isCurrent ? "u-fw-700" : undefined} />
                    {" "}<span className="muted fs-10">{p.fed}</span>
                    {p.birthYear && <span className="p p-sm p-birth ml-4">{p.birthYear}</span>}
                    {p.club && <span className="p p-sm p-club ml-4">{p.club}</span>}
                  </td>
                  <td className="r"><b>{fmtHcp(p.currentHcp, "–")}</b></td>
                  <td className="r">
                    {p.lastSD != null
                      ? <SDPill sd={p.lastSD} hcp={p.currentHcp} />
                      : "–"}
                  </td>
                  <td className="r">
                    {p.avgSD20 != null
                      ? <SDPill sd={p.avgSD20} hcp={p.currentHcp} />
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

      {/* Common Courses */}
      <CommonCourses players={players} currentFed={data.CURRENT_FED} escName={activeEsc} />
    </div>
  );
}
