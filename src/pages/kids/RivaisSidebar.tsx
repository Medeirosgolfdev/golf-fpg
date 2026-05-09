/**
 * kids/RivaisSidebar.tsx — Sidebar de selecção de rivais
 * (extraído de KIDSPage.tsx)
 */
import React, { useMemo } from "react";
import { fmtToPar } from "../../utils/format";
import { tpColorDark } from "../../utils/scoreDisplay";
import SidebarSectionTitle from "../../ui/SidebarSectionTitle";
import { flag as flagOf } from "../../utils/flagUtils";
import { useRivals, useMH, getCanonicalTids, getPlayerType, hiddenTids, nPlayed, playerMatchesFilter, rankMap, totalRanked } from "../KIDSPage";
import type { RivalPlayer, MHPlayer } from "../KIDSPage";

export function RivaisSidebar({ selected, onSelect, fids, q, paisFilter, tierFilter, minTorn, apenasDirectos, playerTypeMap }: {
  selected: string | null;
  onSelect: (n: string) => void;
  fids: Set<string>;
  q: string;
  paisFilter: string;
  tierFilter: string;
  minTorn: number;
  apenasDirectos: boolean;
  playerTypeMap: Map<string, ReturnType<typeof getPlayerType>>;
}) {
  const rivals = useRivals();
  const memberHist = useMH();

  const mhCountSidebar = useMemo<Map<string, number>>(() => {
    const m = new Map<string, number>();
    if (!memberHist) return m;
    for (const mh of Object.values(memberHist.jogadores) as MHPlayer[]) {
      if (!mh.name || mh.name === "?" || mh.name.startsWith("[unknown")) continue;
      const key = mh.name.toLowerCase().trim().replace(/\s+/g, " ");
      const cnt = Object.values(mh.torneios).filter(t => t.rounds && Object.keys(t.rounds).length > 0).length;
      if (cnt > 0) m.set(key, cnt);
    }
    return m;
  }, [memberHist]);

  const manuelMerged = rivals.find(d => d.isM);

  const h2hMap = useMemo<Map<string, { w: number; l: number; d: number }>>(() => {
    const m = new Map<string, { w: number; l: number; d: number }>();
    if (!manuelMerged) return m;
    // Usa getCanonicalTids — mesma deduplicação que tournResults/confrontosH2H
    // no detail. Garante que sidebar e detail mostram o mesmo nº de confrontos.
    const manuelTids = getCanonicalTids(manuelMerged);
    for (const p of rivals) {
      if (p.isM) continue;
      const playerTids = getCanonicalTids(p);
      const shared: string[] = [];
      for (const tid of playerTids) {
        if (!manuelTids.has(tid)) continue;
        if (typeof manuelMerged.r[tid]?.p !== "number" || typeof p.r[tid]?.p !== "number") continue;
        shared.push(tid);
      }
      if (!shared.length) continue;
      const w = shared.filter(tid => (manuelMerged.r[tid].p as number) < (p.r[tid].p as number)).length;
      const l = shared.filter(tid => (manuelMerged.r[tid].p as number) > (p.r[tid].p as number)).length;
      m.set(p.n, { w, l, d: shared.length - w - l });
    }
    return m;
  }, [rivals, manuelMerged]);

  // Lista filtrada + agrupamento directos / circuito
  const { directos, circuito } = useMemo(() => {
    let pl = rivals.filter(p => nPlayed(p) > 0 || p.isM);
    if (fids.size > 0) pl = pl.filter(p => playerMatchesFilter(p, fids));
    if (paisFilter) pl = pl.filter(p => p.co === paisFilter);
    if (tierFilter) pl = pl.filter(p => !p.isM && playerTypeMap.get(p.n)?.label.includes(tierFilter.split(" ")[0]));
    if (minTorn > 0) pl = pl.filter(p => p.isM || nPlayed(p) >= minTorn);
    if (q) { const ql = q.toLowerCase(); pl = pl.filter(p => p.n.toLowerCase().includes(ql) || p.co.toLowerCase().includes(ql)); }

    const sorted = [...pl].sort((a, b) => {
      if (a.isM) return -1; if (b.isM) return 1;
      const ra = rankMap[a.n] ?? 9999, rb = rankMap[b.n] ?? 9999;
      return ra - rb;
    });

    const dir: typeof sorted = [];
    const circ: typeof sorted = [];
    for (const p of sorted) {
      if (p.isM) { dir.unshift(p); continue; }
      const h = h2hMap.get(p.n);
      if (h && h.w + h.l + h.d > 0) dir.push(p);
      else if (!apenasDirectos) circ.push(p);
    }
    return { directos: dir, circuito: circ };
  }, [q, fids, paisFilter, tierFilter, minTorn, apenasDirectos, rivals, h2hMap, playerTypeMap]);

  const renderItem = (p: RivalPlayer) => {
    const flagEmoji = flagOf(p.co);
    const rank = rankMap[p.n];
    const played = nPlayed(p);
    const isActive = selected === p.n;
    const h2h = h2hMap.get(p.n);
    const mhKey = p.n.toLowerCase().trim().replace(/\s+/g, " ");
    const mhCnt = mhCountSidebar.get(mhKey) ?? 0;
    const playerType = playerTypeMap.get(p.n);
    const hidden = hiddenTids(p);
    const bestTpVal = Object.entries(p.r).filter(([tid, r]) => !hidden.has(tid) && r?.tp != null).map(([, r]) => r.tp as number);
    const bestTp = bestTpVal.length ? Math.min(...bestTpVal) : null;
    const recordStr = h2h && (h2h.w + h2h.l + h2h.d) > 0
      ? [h2h.w > 0 ? `${h2h.w}V` : "", h2h.d > 0 ? `${h2h.d}E` : "", h2h.l > 0 ? `${h2h.l}D` : ""].filter(Boolean).join(" ")
      : null;
    const recordBg = h2h ? (h2h.w > h2h.l ? "var(--bg-success-subtle)" : h2h.l > h2h.w ? "var(--bg-danger-strong)" : "var(--bg-muted)") : "var(--bg-muted)";
    const recordCo = h2h ? (h2h.w > h2h.l ? "var(--color-good-dark)" : h2h.l > h2h.w ? "var(--color-danger-dark)" : "var(--text-3)") : "var(--text-3)";
    const accentColor = h2h ? (h2h.w > h2h.l ? "var(--color-teal)" : h2h.l > h2h.w ? "var(--color-danger)" : h2h.w + h2h.l + h2h.d > 0 ? "var(--accent)" : "var(--border)") : "var(--border)";
    return (
      <button key={p.n} className={`course-item${isActive ? " active" : ""}`}
        style={{ borderLeftColor: isActive ? accentColor : undefined, padding: "8px 10px 7px 12px" }}
        onClick={() => onSelect(p.n)}>

        {/* Linha 1: rank + flag + nome + nº torneios */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
          {rank != null ? (
            <span style={{ flexShrink: 0, fontSize: 10, minWidth: 18, height: 18, borderRadius: 4,
              background: rank <= 3 ? "var(--bg-topbar)" : rank <= 10 ? "var(--bg-warn-strong)" : "var(--bg-muted)",
              color: rank <= 3 ? "var(--text-inv)" : rank <= 10 ? "var(--color-warn-dark)" : "var(--text-3)",
              display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
              {rank}
            </span>
          ) : <span style={{ width: 18 }} />}
          <span className="fs-13 shrink-0">{flagEmoji}</span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: isActive ? 700 : 600, color: "var(--text)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.n}
            {p.isM && <span className="p p-sm p-outline" style={{ marginLeft: 5 }}>REF</span>}
          </span>
          <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: isActive ? "var(--accent)" : "var(--text-3)" }}>
            {played}
          </span>
        </div>

        {/* Linha 2: player type + record + bestTp + mhCnt + upcoming */}
        <div className="gap-4 flex-wrap" style={{ display: "flex", alignItems: "center", paddingLeft: 23 }}>
          {playerType && !p.isM && (
            <span className="fs-10 fw-700" style={{ padding: "1px 5px", borderRadius: 10, background: playerType.bg, color: playerType.fg }}>
              {playerType.label}
            </span>
          )}
          {recordStr && (
            <span className="p p-sm fs-10"  style={{ background: recordBg, color: recordCo, padding: "1px 5px" }}>
              {recordStr}
            </span>
          )}
          {bestTp != null && (
            <span className="fw-700 fs-11" style={{ color: tpColorDark(bestTp) }}>
              {fmtToPar(bestTp)}
            </span>
          )}
          {mhCnt > 0 && <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600 }} title={`${mhCnt} torneios USKids`}>📊</span>}
          {((p as any).fpgClub || (p as any).esClub) && (
            <span style={{ fontSize: 9, color: "var(--color-good-dark)", fontWeight: 600, opacity: 0.85 }}
              title={(p as any).fpgClub ? "Clube FPG" : "Clube espanhol"}>
              🏌️ {(p as any).fpgClub || (p as any).esClub}
            </span>
          )}
          {p.up.length > 0 && <span style={{ color: "var(--color-good-dark)", fontWeight: 700, marginLeft: "auto" }}>▲</span>}
        </div>
      </button>
    );
  };

  const total = directos.length + circuito.length;

  return (
    <div className="flex-col" style={{ display: "flex", height: "100%" }}>
      {/* Lista agrupada — sem pesquisa nem filtros (estão no toolbar) */}
      <div className="flex-1" style={{ overflowY: "auto" }}>
        {/* Jogadores com quem já se cruzou (directos) */}
        {directos.length > 0 && (
          <>
            <SidebarSectionTitle dark>Jogadores com quem já se cruzou ({directos.length})</SidebarSectionTitle>
            {directos.map((p) => renderItem(p))}
          </>
        )}
        {/* Todos (circuito alargado) */}
        {circuito.length > 0 && !apenasDirectos && (
          <>
            <SidebarSectionTitle dark color="var(--color-info-dark)">
              Todos ({circuito.length})
            </SidebarSectionTitle>
            {circuito.map((p) => renderItem(p))}
          </>
        )}
        {total === 0 && (
          <div style={{ padding: "16px 12px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
            Sem rivais com estes filtros
          </div>
        )}
      </div>

      <div style={{ padding: "5px 10px", borderTop: "1px solid var(--border-light)", fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
        {total} rivais · {totalRanked} com rank
      </div>
    </div>
  );
}
