/**
 * src/pages/jogadores/FederadosStatsPanel.tsx
 *
 * Painel de estatísticas globais do ficheiro federados.json (página inteira),
 * com drill-down em clubes, escalões e bins de HCP (clicáveis).
 * `computeGlobalStats` é a agregação pura (era o useMemo `globalStats` do
 * corpo da página antes da extracção de 2026-08-15).
 */
import React from "react";
import type { FederadoRaw } from "../../data/federadosLoader";
import { gf } from "../../utils/flagUtils";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import SexBadge from "../../ui/SexBadge";
import { HCP_BINS, emptyHcpBins, hcpBinKey, hcpBinRange, isCountableHcp } from "./hcpBins";
import { COL_M, COL_F, barPct, KpiCard, MFBar, MFColumn, MFLegend } from "./statsWidgets";

export interface GlobalStats {
  total: number; male: number; female: number; withHcp: number; avgHcp: number;
  activeThisYear: number; pros: number;
  byAge: Record<string, { m: number; f: number }>;
  byAgeFull: Record<string, FederadoRaw[]>;
  topCountries: { cp: string; count: number; m: number; f: number; name: string }[];
  allClubs: [string, { name: string; m: number; f: number; count: number; members: FederadoRaw[] }][];
  topBestHcp: FederadoRaw[];
  admissionYears: [string, { m: number; f: number }][];
  hcpBins: Record<string, { m: number; f: number }>;
  hcpBinOrder: readonly string[];
}

/** Agregação global dos federados — pura, sem React. */
export function computeGlobalStats(federados: FederadoRaw[]): GlobalStats {
  const byCountry: Record<string, { count: number; m: number; f: number; name: string }> = {};
  const byAge: Record<string, { m: number; f: number }> = {};
  const byClub: Record<string, { name: string; m: number; f: number; members: FederadoRaw[] }> = {};
  const byAdmissionYear: Record<string, { m: number; f: number }> = {};
  const byAgeFull: Record<string, FederadoRaw[]> = {};
  const hcpBins = emptyHcpBins();
  let male = 0, female = 0;
  let activeThisYear = 0, withHcp = 0;
  let pros = 0;
  let totalHcp = 0;

  for (const f of federados) {
    const isM = f.gender === "M";
    const isF = f.gender === "F";
    const cp = f.country_prefix || "?";
    if (!byCountry[cp]) byCountry[cp] = { count: 0, m: 0, f: 0, name: f.country || cp };
    byCountry[cp].count++;
    if (isM) byCountry[cp].m++; else if (isF) byCountry[cp].f++;
    if (!byAge[f.age_level]) byAge[f.age_level] = { m: 0, f: 0 };
    if (isM) byAge[f.age_level].m++; else if (isF) byAge[f.age_level].f++;
    if (!byAgeFull[f.age_level]) byAgeFull[f.age_level] = [];
    byAgeFull[f.age_level].push(f);
    if (isM) male++; else if (isF) female++;

    const key = f.club_code || "?";
    if (!byClub[key]) byClub[key] = { name: f.acronym || f.club_name || "?", m: 0, f: 0, members: [] };
    if (isM) byClub[key].m++; else if (isF) byClub[key].f++;
    byClub[key].members.push(f);

    if (f.admission_date) {
      const y = f.admission_date.slice(0, 4);
      if (!byAdmissionYear[y]) byAdmissionYear[y] = { m: 0, f: 0 };
      if (isM) byAdmissionYear[y].m++; else if (isF) byAdmissionYear[y].f++;
    }
    if ((f.rounds_current_year || 0) > 0) activeThisYear++;
    if (f.player_type_id === 2 || f.player_type === "Profissional") pros++;
    // "Com HCP válido" exclui placeholders ≥54/99 (HI não estabelecido) —
    // mesma regra do HcpPill da sidebar; senão a média/bins vinham inflados.
    if (isCountableHcp(f.hcp_exact)) {
      withHcp++;
      totalHcp += f.hcp_exact;
      const k = hcpBinKey(f.hcp_exact);
      if (isM) hcpBins[k].m++; else if (isF) hcpBins[k].f++;
    }
  }

  const topCountries = Object.entries(byCountry)
    .map(([cp, v]) => ({ cp, count: v.count, m: v.m, f: v.f, name: v.name }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
  const allClubs = Object.entries(byClub)
    .map(([code, c]) => [code, { ...c, count: c.m + c.f }] as [string, typeof c & { count: number }])
    .sort((a, b) => b[1].count - a[1].count);
  const topBestHcp = [...federados]
    .filter(f => isCountableHcp(f.hcp_exact))
    .sort((a, b) => (a.hcp_exact as number) - (b.hcp_exact as number))
    .slice(0, 20);
  const avgHcp = withHcp > 0 ? totalHcp / withHcp : 0;

  const admissionYears = Object.entries(byAdmissionYear)
    .filter(([y]) => Number(y) >= 2000)
    .sort((a, b) => a[0].localeCompare(b[0]));

  return {
    total: federados.length, male, female, withHcp, avgHcp,
    activeThisYear, pros,
    byAge, byAgeFull, topCountries, allClubs, topBestHcp,
    admissionYears, hcpBins, hcpBinOrder: HCP_BINS,
  };
}

/* ── Tabela sortable de todos os clubes ────────────────────── */
type ClubSortKey = "rank" | "name" | "m" | "f" | "count";
function ClubsTable({ stats, onDrillDown, maxClub }: {
  stats: GlobalStats;
  onDrillDown: (d: { type: "club" | "age"; key: string }) => void;
  maxClub: number;
}) {
  const { sortKey, sortDir, toggleSort } = useSort<ClubSortKey>("count", "desc", {
    rank: "asc", name: "asc", m: "desc", f: "desc", count: "desc",
  });
  const rowsBase = stats.allClubs.map(([code, c], i) => ({ code, name: c.name, m: c.m, f: c.f, count: c.count, rank: i + 1 }));
  const sortedRows = React.useMemo(() => {
    const arr = [...rowsBase];
    const mul = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "pt") * mul;
      return (Number(a[sortKey]) - Number(b[sortKey])) * mul;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortDir, stats.allClubs]);

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="fw-700 fs-14">
          Todos os clubes · <span className="muted fs-10">{stats.allClubs.length} clubes · clica na linha para detalhe · clica no cabeçalho para ordenar</span>
        </div>
        <MFLegend long gap={12} />
      </div>
      <div style={{ maxHeight: 520, overflowY: "auto", paddingRight: 4 }}>
        <table className="dt-compact">
          <thead>
            <tr className="sticky-head">
              <SortableHdr k="rank" sortKey={sortKey} sortDir={sortDir} onSort={k => toggleSort(k as ClubSortKey)} style={{ width: 30 }}>#</SortableHdr>
              <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={k => toggleSort(k as ClubSortKey)}>Clube</SortableHdr>
              <th style={{ width: "40%" }}>Distribuição</th>
              <SortableHdr k="m" sortKey={sortKey} sortDir={sortDir} onSort={k => toggleSort(k as ClubSortKey)} className="ta-c" style={{ width: 50 }}><SexBadge sex="M" /></SortableHdr>
              <SortableHdr k="f" sortKey={sortKey} sortDir={sortDir} onSort={k => toggleSort(k as ClubSortKey)} className="ta-c" style={{ width: 50 }}><SexBadge sex="F" /></SortableHdr>
              <SortableHdr k="count" sortKey={sortKey} sortDir={sortDir} onSort={k => toggleSort(k as ClubSortKey)} className="r" style={{ width: 60 }}>Total</SortableHdr>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(row => (
              <tr key={row.code} className="clickable" onClick={() => onDrillDown({ type: "club", key: row.code })}>
                <td className="muted fs-10">{row.rank}</td>
                <td>
                  <span className="fw-600">{row.name}</span> <span className="muted fs-10">({row.code})</span>
                </td>
                <td>
                  <MFBar m={row.m} f={row.f} widthPct={barPct(row.count, maxClub)} height={8} radius={3} />
                </td>
                <td className="r fw-600" style={{ color: COL_M }}>{row.m}</td>
                <td className="r fw-600" style={{ color: COL_F }}>{row.f}</td>
                <td className="r fw-900">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FederadosStatsPanel({ stats, drillDown, onDrillDown, hcpBinDrill, onHcpBinDrill, federados, onClose, onPickPlayer }: {
  stats: GlobalStats;
  drillDown: { type: "club" | "age"; key: string } | null;
  onDrillDown: (d: { type: "club" | "age"; key: string } | null) => void;
  hcpBinDrill: string | null;
  onHcpBinDrill: (bin: string | null) => void;
  federados: FederadoRaw[] | null;
  onClose: () => void;
  onPickPlayer: (fed: string) => void;
}) {
  const ageOrder = ["SUB10", "SUB12", "SUB14", "SUB16", "SUB18", "SUB21", "SUB24", "MidAmateur", "Senior", "SuperSenior"];
  const sortedAges = Object.entries(stats.byAge).sort((a, b) => {
    const ai = ageOrder.indexOf(a[0]);
    const bi = ageOrder.indexOf(b[0]);
    const at = a[1].m + a[1].f;
    const bt = b[1].m + b[1].f;
    if (ai === -1 && bi === -1) return bt - at;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  const totalOf = (o: { m: number; f: number }) => o.m + o.f;
  const maxAge = Math.max(...Object.values(stats.byAge).map(totalOf));
  const maxCountry = stats.topCountries[0]?.count ?? 1;
  const maxClub = stats.allClubs[0]?.[1].count ?? 1;
  const maxHcpBin = Math.max(...Object.values(stats.hcpBins).map(totalOf));
  const maxAdm = Math.max(...stats.admissionYears.map(([, v]) => totalOf(v)));

  const ptCount = stats.topCountries.find(c => c.cp === "PT")?.count ?? 0;
  const foreignCount = stats.total - ptCount;

  return (
    <div className="p-16">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 className="detail-title" style={{ margin: 0 }}>📊 Estatísticas FPG</h2>
        <button className="p" onClick={onClose} title="Fechar estatísticas">✕ Fechar</button>
      </div>

      {/* KPIs — 6 cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
        <KpiCard label="Total" value={stats.total} big />
        <KpiCard label={<><SexBadge sex="M" /> Masculino</>} value={stats.male} pct={stats.male / stats.total} />
        <KpiCard label={<><SexBadge sex="F" /> Feminino</>} value={stats.female} pct={stats.female / stats.total} />
        <KpiCard label="🇵🇹 Portugueses" value={ptCount} pct={ptCount / stats.total} />
        <KpiCard label="🌍 Estrangeiros" value={foreignCount} pct={foreignCount / stats.total} />
        <KpiCard label="Activos 2026" value={stats.activeThisYear} pct={stats.activeThisYear / stats.total} sub="com rondas este ano" />
        <KpiCard label="Com HCP válido" value={stats.withHcp} pct={stats.withHcp / stats.total} sub={`média ${stats.avgHcp.toFixed(1)}`} />
        <KpiCard label="Profissionais" value={stats.pros} pct={stats.pros / stats.total} />
      </div>

      {/* Drill-down inline (aparece no topo quando activo) */}
      {drillDown && (
        <DrillDownCard
          drillDown={drillDown}
          stats={stats}
          onClose={() => onDrillDown(null)}
          onPickPlayer={onPickPlayer}
        />
      )}

      {/* Distribuição de HCP — histograma vertical stacked M/F */}
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div className="fw-700 fs-14">Distribuição de HCP · <span className="muted fs-10">{stats.withHcp.toLocaleString("pt-PT")} jogadores com HCP válido</span></div>
          <MFLegend long gap={12} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.hcpBinOrder.length}, 1fr)`, gap: 12, alignItems: "end", height: 300 }}>
          {stats.hcpBinOrder.map(bin => {
            const { m, f } = stats.hcpBins[bin] || { m: 0, f: 0 };
            const total = m + f;
            const label = bin === "plus" ? "Scratch (+)" : bin;
            const barHeight = (total / Math.max(1, maxHcpBin)) * 180;  // max 180px da altura
            const isActive = hcpBinDrill === bin;
            return (
              <button
                key={bin}
                onClick={() => onHcpBinDrill(isActive ? null : bin)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", background: isActive ? "var(--bg-hover)" : "transparent", border: isActive ? "1px solid var(--accent)" : "1px solid transparent", borderRadius: 4, padding: 2, cursor: "pointer", minWidth: 0 }}
                title={`Clica para ver top 15 (HCP ${label})`}
              >
                <div className="fw-700 fs-12" style={{ marginBottom: 4 }}>
                  {total.toLocaleString("pt-PT")}
                </div>
                <div className="muted fs-10" style={{ marginBottom: 4 }}>{((total / stats.withHcp) * 100).toFixed(1)}%</div>
                <MFColumn m={m} f={f} barHeight={barHeight} width="85%" minWidth={20} shadow />
                <div className="fw-600 fs-11" style={{ marginTop: 6, textAlign: "center" }}>{label}</div>
                <div className="fs-10" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, marginTop: 2 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><SexBadge sex="M" /><span className="fw-600">{m.toLocaleString("pt-PT")}</span></span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><SexBadge sex="F" /><span className="fw-600">{f.toLocaleString("pt-PT")}</span></span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Drill-down de HCP bin — top 15 jogadores do bin seleccionado */}
      {hcpBinDrill && federados && (
        <HcpBinDrillCard
          bin={hcpBinDrill}
          federados={federados}
          onClose={() => onHcpBinDrill(null)}
          onPickPlayer={onPickPlayer}
        />
      )}

      {/* 2 colunas: Top scratch + Novos federados por ano */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 16 }}>
        {/* Top 15 melhores HCPs */}
        <div className="card" style={{ padding: 12 }}>
          <div className="fw-700 fs-14 mb-8">🏆 Top 15 melhores HCPs</div>
          {stats.topBestHcp.map((p, i) => (
            <button
              key={p.federation_code}
              className="course-item"
              onClick={() => onPickPlayer(p.federation_code)}
              style={{ width: "100%", padding: "4px 6px", marginBottom: 2, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
            >
              <span className="fw-700" style={{ width: 22, textAlign: "center", fontSize: "var(--fs-11)" }}>{i + 1}</span>
              <span className="fw-600" style={{ flex: 1, textAlign: "left", fontSize: "var(--fs-12)" }}>
                {p.country_prefix && p.country_prefix !== "PT" && !p.country_prefix.startsWith("@") && <span className="mr-4">{gf(p.country_prefix)}</span>}
                {p.name}
                <span className="muted fs-10 ml-4">({p.acronym})</span>
              </span>
              <span className="fw-900" style={{ fontSize: "var(--fs-14)", color: (p.hcp_exact as number) < 0 ? "var(--medal-gold)" : "var(--text-1)" }}>
                {(p.hcp_exact as number).toFixed(1)}
              </span>
            </button>
          ))}
        </div>

        {/* Novos federados por ano — stacked M/F */}
        <div className="card" style={{ padding: 12 }}>
          <div className="fw-700 fs-14 mb-8">Novos federados por ano · <span className="muted fs-10">stacked M/F</span></div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.admissionYears.length}, 1fr)`, gap: 2, alignItems: "end", height: 140 }}>
            {stats.admissionYears.map(([y, v]) => {
              const total = v.m + v.f;
              const barHeight = (total / Math.max(1, maxAdm)) * 110;
              return (
                <div key={y} style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                  <div className="fs-10 fw-600" title={`${v.m} M + ${v.f} F`}>{total}</div>
                  <MFColumn m={v.m} f={v.f} barHeight={barHeight} width="90%" />
                  <div className="fs-10 muted" style={{ marginTop: 3 }}>{y.slice(2)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2 colunas: Escalões e Países */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 16 }}>
        {/* Por escalão (clicável) — stacked M/F */}
        <div className="card" style={{ padding: 12 }}>
          <div className="fw-700 fs-14 mb-8">Por escalão · <span className="muted fs-10">clica para detalhe</span></div>
          {sortedAges.map(([k, v]) => {
            const total = v.m + v.f;
            return (
              <button
                key={k}
                onClick={() => onDrillDown({ type: "age", key: k })}
                style={{ width: "100%", padding: "4px 0", marginBottom: 4, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-12)", fontWeight: 500 }}>
                  <span>{k}</span>
                  <span>
                    <span className="fs-10" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 6 }}>
                      <SexBadge sex="M" />{v.m} <SexBadge sex="F" />{v.f} ·
                    </span>
                    <span className="fw-700">{total.toLocaleString("pt-PT")}</span>
                  </span>
                </div>
                <MFBar m={v.m} f={v.f} widthPct={barPct(total, maxAge)} height={8} radius={3} />
              </button>
            );
          })}
        </div>

        {/* Por país — M/F split */}
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="fw-700 fs-14">Top 25 países</div>
            <MFLegend />
          </div>
          {stats.topCountries.map(c => (
            <div key={c.cp} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-12)", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.cp && !c.cp.startsWith("@") ? gf(c.cp) : "🏴"} <span className="fw-600">{c.name}</span> <span className="muted fs-10">({c.cp})</span>
                </span>
                <span className="muted fs-10" style={{ display: "inline-flex", gap: 6, whiteSpace: "nowrap" }}>
                  <span style={{ color: COL_M, fontWeight: 600 }}>{c.m}</span>·
                  <span style={{ color: COL_F, fontWeight: 600 }}>{c.f}</span>
                </span>
                <span className="fw-700" style={{ minWidth: 40, textAlign: "right" }}>{c.count.toLocaleString("pt-PT")}</span>
              </div>
              <div style={{ marginTop: 2 }}>
                <MFBar m={c.m} f={c.f} widthPct={barPct(c.count, maxCountry)} height={6} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Todos os clubes — tabela sortable com stacked M/F */}
      <ClubsTable stats={stats} onDrillDown={onDrillDown} maxClub={maxClub} />
    </div>
  );
}

/* ── Drill-down de um bin de HCP — top 15 jogadores nesse range ── */
function HcpBinDrillCard({ bin, federados, onClose, onPickPlayer }: {
  bin: string;
  federados: FederadoRaw[];
  onClose: () => void;
  onPickPlayer: (fed: string) => void;
}) {
  const binRange = hcpBinRange(bin);

  // isCountableHcp já exclui os placeholders (≥54/99); o range 30+ tem tecto 54.
  const inBin = federados.filter(f =>
    isCountableHcp(f.hcp_exact) &&
    f.hcp_exact >= binRange.min &&
    f.hcp_exact < binRange.max
  );
  const top = inBin
    .sort((a, b) => (a.hcp_exact as number) - (b.hcp_exact as number))
    .slice(0, 15);
  const male = inBin.filter(f => f.gender === "M").length;
  const female = inBin.filter(f => f.gender === "F").length;

  return (
    <div className="card" style={{
      padding: 14, marginBottom: 16,
      border: "2px solid var(--accent)",
      background: "var(--bg-subtle)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div className="fw-900 fs-14">🎯 {binRange.label}</div>
          <div className="muted fs-10" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            {inBin.length.toLocaleString("pt-PT")} jogadores ·
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><SexBadge sex="M" />{male}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><SexBadge sex="F" />{female}</span>
          </div>
        </div>
        <button className="p p-sm" onClick={onClose} title="Fechar">✕</button>
      </div>
      <div className="fw-800 fs-12 mb-4">Top 15 (ordenados por HCP)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 4 }}>
        {top.map((p, i) => (
          <button
            key={p.federation_code}
            className="course-item"
            onClick={() => onPickPlayer(p.federation_code)}
            style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left" }}
          >
            <span className="fw-700 muted" style={{ width: 22, fontSize: "var(--fs-11)" }}>{i + 1}</span>
            <SexBadge sex={p.gender as "M" | "F"} />
            <span style={{ flex: 1, fontSize: "var(--fs-12)" }}>
              {p.country_prefix && p.country_prefix !== "PT" && !p.country_prefix.startsWith("@") && <span className="mr-4">{gf(p.country_prefix)}</span>}
              <span className="fw-600">{p.name}</span>
              <span className="muted fs-10 ml-4">({p.acronym})</span>
            </span>
            <span className="fw-900" style={{ fontSize: "var(--fs-13)", color: (p.hcp_exact as number) < 0 ? "var(--medal-gold)" : "var(--text-1)" }}>
              {(p.hcp_exact as number).toFixed(1)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DrillDownCard({ drillDown, stats, onClose, onPickPlayer }: {
  drillDown: { type: "club" | "age"; key: string };
  stats: GlobalStats;
  onClose: () => void;
  onPickPlayer: (fed: string) => void;
}) {
  const members: FederadoRaw[] = drillDown.type === "club"
    ? (stats.allClubs.find(([code]) => code === drillDown.key)?.[1].members || [])
    : (stats.byAgeFull[drillDown.key] || []);
  const title = drillDown.type === "club"
    ? (stats.allClubs.find(([code]) => code === drillDown.key)?.[1].name || drillDown.key)
    : drillDown.key;

  // Agregações locais
  let male = 0, female = 0, withHcp = 0, totalHcp = 0, active = 0, pros = 0;
  const byAge: Record<string, number> = {};
  const byClub: Record<string, { name: string; count: number }> = {};
  const byCountry: Record<string, number> = {};
  for (const f of members) {
    if (f.gender === "M") male++; else if (f.gender === "F") female++;
    if (f.hcp_exact != null) { withHcp++; totalHcp += f.hcp_exact; }
    if ((f.rounds_current_year || 0) > 0) active++;
    if (f.player_type_id === 2) pros++;
    if (drillDown.type === "club") byAge[f.age_level] = (byAge[f.age_level] || 0) + 1;
    if (drillDown.type === "age") {
      const k = f.club_code || "?";
      if (byClub[k]) byClub[k].count++;
      else byClub[k] = { name: f.acronym || f.club_name || "?", count: 1 };
    }
    byCountry[f.country_prefix || "?"] = (byCountry[f.country_prefix || "?"] || 0) + 1;
  }
  const avgHcp = withHcp > 0 ? totalHcp / withHcp : 0;
  const best = [...members].filter(f => f.hcp_exact != null).sort((a, b) => (a.hcp_exact as number) - (b.hcp_exact as number)).slice(0, 10);
  const topClubsDrill = drillDown.type === "age"
    ? Object.entries(byClub).sort((a, b) => b[1].count - a[1].count).slice(0, 10)
    : [];
  const topCountriesDrill = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const sortedAges = Object.entries(byAge).sort((a, b) => b[1] - a[1]);

  return (
    <div className="card" style={{
      padding: 14, marginBottom: 16,
      border: "2px solid var(--accent)",
      background: "var(--bg-subtle)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="fw-900 fs-14">
          {drillDown.type === "club" ? "🏌️ Clube" : "🎯 Escalão"}: {title}
        </div>
        <button className="p p-sm" onClick={onClose} title="Fechar drill-down">✕</button>
      </div>

      {/* KPIs do drill */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginBottom: 12 }}>
        <KpiCard label="Total" value={members.length} big />
        <KpiCard label={<SexBadge sex="M" />} value={male} pct={male / members.length} />
        <KpiCard label={<SexBadge sex="F" />} value={female} pct={female / members.length} />
        <KpiCard label="Com HCP" value={withHcp} sub={`média ${avgHcp.toFixed(1)}`} />
        <KpiCard label="Activos 2026" value={active} pct={active / members.length} />
        {pros > 0 && <KpiCard label="Pros" value={pros} />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {/* Top HCPs */}
        <div>
          <div className="fw-700 fs-14 mb-4">🏆 Top 10 HCPs</div>
          {best.map((p, i) => (
            <button
              key={p.federation_code}
              className="course-item"
              onClick={() => onPickPlayer(p.federation_code)}
              style={{ width: "100%", padding: "3px 6px", marginBottom: 2, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
            >
              <span className="fw-700" style={{ width: 18, fontSize: "var(--fs-11)" }}>{i + 1}</span>
              <span style={{ flex: 1, textAlign: "left", fontSize: "var(--fs-12)" }}>{p.name}</span>
              <span className="fw-900" style={{ fontSize: "var(--fs-13)", color: (p.hcp_exact as number) < 0 ? "var(--medal-gold)" : "var(--text-1)" }}>
                {(p.hcp_exact as number).toFixed(1)}
              </span>
            </button>
          ))}
        </div>

        {/* Só se for clube: distribuição por escalão */}
        {drillDown.type === "club" && sortedAges.length > 0 && (
          <div>
            <div className="fw-700 fs-14 mb-4">Por escalão</div>
            {sortedAges.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-12)", marginBottom: 2 }}>
                <span>{k}</span><span className="fw-700">{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Só se for escalão: top clubes */}
        {drillDown.type === "age" && topClubsDrill.length > 0 && (
          <div>
            <div className="fw-700 fs-14 mb-4">Top clubes</div>
            {topClubsDrill.map(([code, c]) => (
              <div key={code} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-12)", marginBottom: 2 }}>
                <span>{c.name}</span><span className="fw-700">{c.count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Top países (sempre) */}
        {topCountriesDrill.length > 1 && (
          <div>
            <div className="fw-700 fs-14 mb-4">Por país</div>
            {topCountriesDrill.map(([cp, n]) => (
              <div key={cp} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-12)", marginBottom: 2 }}>
                <span>{cp && !cp.startsWith("@") ? gf(cp) : "🏴"} {cp}</span><span className="fw-700">{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
