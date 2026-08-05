/**
 * kids2/Sidebar.tsx
 *
 * Sidebar de rivais. Filtros (search + país) locais; pills de fonte e toggles
 * especiais (vs Manuel / vitórias) vêm de cima (via props) — são renderizados
 * pela toolbar da KIDS2Page.
 */

import React, { useMemo, useState } from "react";
import type { CanonicalData, Junior } from "./data";
import { getSharedFlightTids } from "./data";
import { flag as flagOf } from "../../utils/flagUtils";

const MAX_VISIBLE = 8000;

type SourceKey = "uskids" | "fpg" | "rfeg" | "fcg" | "ffgolf" | "wjgc" | "eowagr" | "doral" | "fm" | "england" | "gjgl" | "fsga" | "uajt" | "uaworlds" | "mexnacional" | "coc" | "reidtrophy" | "icopa" | "interzonas" | "avtrophy" | "job" | "ebtc2" | "egtc" | "elg" | "eym" | "ejo" | "egr";

function juniorHasSource(j: Junior, src: SourceKey, tournamentById: Map<string, { sourceId: string }>): boolean {
  if (src === "uskids") return !!j.sources.uskids?.memberId;
  if (src === "fpg") return !!j.sources.fpg?.fed;
  if (src === "rfeg") return !!j.sources.rfeg?.lic;
  if (src === "ffgolf") return !!j.sources.ffgolf?.lic;
  for (const tid of j.tournamentIds) {
    const t = tournamentById.get(tid);
    if (t && t.sourceId === src) return true;
  }
  return false;
}

function juniorHasWin(j: Junior, tournamentById: Map<string, any>): boolean {
  for (const tid of j.tournamentIds) {
    const t = tournamentById.get(tid);
    if (!t) continue;
    for (const f of t.flights) {
      const r = f.results.find((x: any) => x.juniorId === j.id);
      if (r?.pos === 1) return true;
    }
  }
  return false;
}

function juniorCountry(j: Junior): string {
  return (j.country || j.nationality || "—").trim() || "—";
}

interface Props {
  data: CanonicalData;
  selectedId: string | null;
  onSelect: (id: string) => void;
  countryFilter: string;
  onCountryFilterChange: (c: string) => void;
  // Filtros vindos da toolbar superior
  activeSources: Set<SourceKey>;
  onlyVsManuel: boolean;
  onlyWins: boolean;
}

export default function Sidebar({
  data, selectedId, onSelect,
  countryFilter, activeSources, onlyVsManuel, onlyWins,
}: Props) {
  // Estado local da search — evita propagar para KIDS2Page e re-renderizar o detail
  // a cada keystroke. É a única razão deste estado existir.
  const [q, setQ] = useState("");
  const manuel = data.manuel;
  const [collapsedCountries, setCollapsedCountries] = useState<Set<string>>(new Set());

  const toggleCountry = (c: string) => {
    setCollapsedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  const { directos, byCountry, totalFiltered, totalShown, sharedCountByJunior } = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const seen = new Set<string>();
    const srcArr = Array.from(activeSources);

    // Pré-calcula nº de confrontos REAIS (mesmo flight) por junior. "Cruzou
    // com Manuel" passa a significar "competiu no mesmo escalão", não "esteve
    // no mesmo evento em escalão diferente". Usado também para a pill "Nx M".
    const sharedFlightCountMap = new Map<string, number>();
    if (manuel) {
      for (const j of data.juniors) {
        if (j.id === manuel.id) continue;
        const c = getSharedFlightTids(j, manuel, data.tournamentById).length;
        if (c > 0) sharedFlightCountMap.set(j.id, c);
      }
    }
    const sharedFlightSet = new Set(sharedFlightCountMap.keys());

    const matched: Junior[] = [];
    for (const j of data.juniors) {
      if (seen.has(j.id)) continue;
      seen.add(j.id);
      if (countryFilter && j.country !== countryFilter && j.nationality !== countryFilter) continue;
      if (ql) {
        const inName = j.canonicalName.toLowerCase().includes(ql)
          || (j.aliases || []).some((a) => a.toLowerCase().includes(ql));
        const inCountry = (j.country || "").toLowerCase().includes(ql)
          || (j.nationality || "").toLowerCase().includes(ql);
        if (!inName && !inCountry) continue;
      }
      if (srcArr.length > 0) {
        const okSrc = srcArr.some((s) => juniorHasSource(j, s, data.tournamentById));
        if (!okSrc) continue;
      }
      if (onlyWins && !juniorHasWin(j, data.tournamentById)) continue;
      if (onlyVsManuel) {
        if (!manuel || j.id === manuel.id) continue;
        if (!sharedFlightSet.has(j.id)) continue;
      }
      matched.push(j);
    }

    const dir: Junior[] = [];
    const oth: Junior[] = [];
    const inDir = new Set<string>();
    const inOth = new Set<string>();
    for (const j of matched) {
      if (manuel && j.id === manuel.id) {
        if (!inDir.has(j.id)) { dir.unshift(j); inDir.add(j.id); }
        continue;
      }
      if (sharedFlightSet.has(j.id)) {
        if (!inDir.has(j.id)) { dir.push(j); inDir.add(j.id); }
      } else {
        if (!inOth.has(j.id)) { oth.push(j); inOth.add(j.id); }
      }
    }

    // Manuel sempre no topo; restantes ordenados por nº de confrontos REAIS
    // (mesmo flight) — não pelo total de torneios. Faz com que os rivais
    // mais relevantes (que já cruzaram mais vezes com o Manuel) fiquem em
    // cima. Empate: nº total de torneios como tie-breaker estável.
    dir.sort((a, b) => {
      if (manuel && a.id === manuel.id) return -1;
      if (manuel && b.id === manuel.id) return 1;
      const sa = sharedFlightCountMap.get(a.id) || 0;
      const sb = sharedFlightCountMap.get(b.id) || 0;
      if (sa !== sb) return sb - sa;
      return b.tournamentIds.length - a.tournamentIds.length;
    });

    const countryMap = new Map<string, Junior[]>();
    for (const j of oth) {
      const c = juniorCountry(j);
      let arr = countryMap.get(c);
      if (!arr) { arr = []; countryMap.set(c, arr); }
      arr.push(j);
    }
    for (const arr of countryMap.values()) {
      arr.sort((a, b) => b.tournamentIds.length - a.tournamentIds.length);
    }
    const sortedCountries: { country: string; juniors: Junior[] }[] = Array.from(countryMap.entries())
      .map(([country, juniors]) => ({ country, juniors }))
      .sort((a, b) => b.juniors.length - a.juniors.length);

    let remaining = Math.max(0, MAX_VISIBLE - dir.length);
    const byCountry: { country: string; juniors: Junior[]; totalInCountry: number }[] = [];
    for (const { country, juniors } of sortedCountries) {
      if (remaining <= 0) break;
      const slice = juniors.slice(0, remaining);
      byCountry.push({ country, juniors: slice, totalInCountry: juniors.length });
      remaining -= slice.length;
    }

    const shown = dir.length + byCountry.reduce((a, b) => a + b.juniors.length, 0);
    return {
      directos: dir,
      byCountry,
      totalFiltered: matched.length,
      totalShown: shown,
      sharedCountByJunior: sharedFlightCountMap,
    };
  }, [data, manuel, q, countryFilter, activeSources, onlyVsManuel, onlyWins]);

  return (
    <div className="kids2-sidebar" style={{
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
      height: "100%",
    }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-light)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-11)", color: "var(--text-3)", marginBottom: 8 }}>
          <span style={{ marginLeft: "auto" }}>
            {totalFiltered === totalShown
              ? `${totalFiltered} de ${data.juniors.length}`
              : `${totalShown} de ${totalFiltered}`}
          </span>
        </div>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquisar rival..."
          style={{
            width: "100%",
            padding: "6px 10px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: "var(--fs-13)",
            background: "var(--bg)",
            color: "var(--text)",
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {directos.length > 0 && (
          <>
            <SectionHeader color="var(--color-good-dark)" icon="⚔️">
              Cruzou com Manuel ({directos.length})
            </SectionHeader>
            {directos.map((j) => (
              <RivalRow key={j.id} junior={j} manuel={manuel} selected={selectedId === j.id} onSelect={onSelect} sharedCount={sharedCountByJunior.get(j.id) || 0} />
            ))}
          </>
        )}
        {byCountry.length > 0 && byCountry.map(({ country, juniors, totalInCountry }) => {
          const collapsed = collapsedCountries.has(country);
          const flagE = flagOf(country);
          return (
            <React.Fragment key={country}>
              <SectionHeader
                color="var(--text-2)"
                onClick={() => toggleCountry(country)}
                icon={flagE || "🌐"}
              >
                <span style={{ flex: 1 }}>{country || "Sem país"}</span>
                <span style={{ fontSize: "var(--fs-10)", opacity: 0.7, fontWeight: 600, marginRight: 4 }}>
                  {juniors.length}{totalInCountry > juniors.length ? `/${totalInCountry}` : ""}
                </span>
                <span style={{ fontSize: "var(--fs-9)", opacity: 0.5 }}>{collapsed ? "▶" : "▼"}</span>
              </SectionHeader>
              {!collapsed && juniors.map((j) => (
                <RivalRow key={j.id} junior={j} manuel={manuel} selected={selectedId === j.id} onSelect={onSelect} sharedCount={sharedCountByJunior.get(j.id) || 0} />
              ))}
            </React.Fragment>
          );
        })}
        {directos.length === 0 && byCountry.length === 0 && (
          <div style={{ padding: "20px 12px", textAlign: "center", color: "var(--text-3)", fontSize: "var(--fs-12)" }}>
            Sem rivais com estes filtros
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ children, color, icon, onClick }: {
  children: React.ReactNode;
  color: string;
  icon?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "6px 12px",
        fontSize: "var(--fs-11)",
        fontWeight: 700,
        background: "var(--bg-muted)",
        color,
        borderBottom: "1px solid var(--border-light)",
        borderTop: "1px solid var(--border-light)",
        position: "sticky",
        top: 0,
        zIndex: "var(--z-base)",
        cursor: onClick ? "pointer" : "default",
        display: "flex",
        alignItems: "center",
        gap: 6,
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {icon && <span style={{ fontSize: "var(--fs-13)", lineHeight: 1 }}>{icon}</span>}
      {children}
    </div>
  );
}

function RivalRow({ junior, manuel, selected, onSelect, sharedCount }: {
  junior: Junior;
  manuel: Junior | null;
  selected: boolean;
  onSelect: (id: string) => void;
  /** Nº de confrontos REAIS (mesmo flight) com Manuel — pré-calculado pelo Sidebar. */
  sharedCount: number;
}) {
  const isManuel = manuel?.id === junior.id;
  const flagEmoji = flagOf(junior.country || junior.nationality || "");
  const tournCount = junior.tournamentIds.length;
  const shared = sharedCount;

  const club = junior.sources.fpg?.club || junior.sources.rfeg?.club || junior.sources.ffgolf?.club || junior.club;

  return (
    <button
      onClick={() => onSelect(junior.id)}
      className={`kids2-rival-row${selected ? " active" : ""}`}
      style={{
        display: "block",
        width: "100%",
        padding: "8px 12px",
        border: 0,
        borderLeft: `3px solid ${selected ? "var(--accent)" : "transparent"}`,
        borderBottom: "1px solid var(--border-light)",
        background: selected ? "var(--bg-active, rgba(0,0,0,0.04))" : "transparent",
        textAlign: "left",
        cursor: "pointer",
        fontSize: "var(--fs-12)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: "var(--fs-13)", flexShrink: 0 }}>{flagEmoji}</span>
        <span style={{ flex: 1, fontWeight: selected ? 700 : 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {junior.canonicalName}
          {isManuel && <span style={{ marginLeft: 4, fontSize: "var(--fs-9)", padding: "1px 5px", borderRadius: 4, background: "var(--bg-success-subtle)", color: "var(--color-good-dark)", fontWeight: 700 }}>REF</span>}
        </span>
        <span style={{ flexShrink: 0, fontSize: "var(--fs-11)", fontWeight: 600, color: "var(--text-3)" }}>{tournCount}</span>
      </div>
      <div style={{ paddingLeft: 19, display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-10)", color: "var(--text-3)", marginTop: 2 }}>
        {club && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🏌️ {club}</span>}
        {shared > 0 && (
          <span style={{ marginLeft: "auto", padding: "0 5px", borderRadius: 4, background: "var(--bg-warn-subtle, var(--bg-warn))", color: "var(--color-warn-dark, var(--color-warn-dark))", fontWeight: 700 }}>
            {shared}× M
          </span>
        )}
      </div>
    </button>
  );
}
