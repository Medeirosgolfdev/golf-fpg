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
import { gf, isForeignPrefix, prefixFlag } from "../../utils/flagUtils";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import SexBadge from "../../ui/SexBadge";
import { HCP_BINS, emptyHcpBins, hcpBinKey, hcpBinRange, isCountableHcp } from "./hcpBins";
import { barPct, MFBar, MFColumn, MFLegend } from "./statsWidgets";
import KpiCard from "../../ui/KpiCard";
import { fmt, todayIso } from "../../utils/format";
import CloseButton from "../../ui/CloseButton";
import { fmtHcp } from "../../utils/format";
import SectionTitle from "../../ui/SectionTitle";

import { HcpText } from "../../ui/HcpPill";
import { Cols } from "../../ui/DataStyle";
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
    .slice(0, 15);
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
    <div className="card u-p-12px">
      <SectionTitle sub={`${stats.allClubs.length} clubes · clica na linha para detalhe · clica no cabeçalho para ordenar`} right={<MFLegend long />}>
        Todos os clubes
      </SectionTitle>
      <div className="u-maxh-520px u-oy-auto u-pr-4px">
        <table className="dtable dt-compact">
          <thead>
            <tr className="sticky-head">
              <SortableHdr k="rank" sortKey={sortKey} sortDir={sortDir} onSort={k => toggleSort(k as ClubSortKey)} className="u-w-30px">#</SortableHdr>
              <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={k => toggleSort(k as ClubSortKey)}>Clube</SortableHdr>
              <th className="u-w-40pc">Distribuição</th>
              <SortableHdr k="m" sortKey={sortKey} sortDir={sortDir} onSort={k => toggleSort(k as ClubSortKey)} className="ta-c u-w-50px"><SexBadge sex="M" /></SortableHdr>
              <SortableHdr k="f" sortKey={sortKey} sortDir={sortDir} onSort={k => toggleSort(k as ClubSortKey)} className="ta-c u-w-50px"><SexBadge sex="F" /></SortableHdr>
              <SortableHdr k="count" sortKey={sortKey} sortDir={sortDir} onSort={k => toggleSort(k as ClubSortKey)} className="r u-w-60px">Total</SortableHdr>
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
                  <MFBar m={row.m} f={row.f} widthPct={barPct(row.count, maxClub)} lg />
                </td>
                <td className="r fw-600 c-male">{row.m}</td>
                <td className="r fw-600 c-female">{row.f}</td>
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
      <div className="u-d-flex u-ai-center u-jc-space-between u-mb-12px">
        <h2 className="detail-title u-m-0">📊 Estatísticas FPG</h2>
        <button type="button" className="btn" onClick={onClose} title="Fechar estatísticas">✕ Fechar</button>
      </div>

      {/* KPIs — 6 cards */}
      <div className="kpi-row">
        <KpiCard label="Total" value={fmt(stats.total)} />
        <KpiCard label={<><SexBadge sex="M" /> Masculino</>} value={fmt(stats.male)} pct={stats.male / stats.total} />
        <KpiCard label={<><SexBadge sex="F" /> Feminino</>} value={fmt(stats.female)} pct={stats.female / stats.total} />
        <KpiCard label="🇵🇹 Portugueses" value={fmt(ptCount)} pct={ptCount / stats.total} />
        <KpiCard label="🌍 Estrangeiros" value={fmt(foreignCount)} pct={foreignCount / stats.total} />
        <KpiCard label={`Activos ${todayIso().slice(0, 4)}`} value={fmt(stats.activeThisYear)} pct={stats.activeThisYear / stats.total} sub="com rondas este ano" />
        <KpiCard label="Com HCP válido" value={fmt(stats.withHcp)} pct={stats.withHcp / stats.total} sub={`média ${fmtHcp(stats.avgHcp)}`} />
        <KpiCard label="Profissionais" value={fmt(stats.pros)} pct={stats.pros / stats.total} />
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
      <div className="card u-p-12px u-mb-16px">
        <SectionTitle sub={`${stats.withHcp.toLocaleString("pt-PT")} jogadores com HCP válido`} right={<MFLegend long />}>
          Distribuição de HCP
        </SectionTitle>
        <Cols n={stats.hcpBinOrder.length} className="u-gap-12px u-ai-end u-h-300px">
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
                className={isActive ? "jg-bin-btn active" : "jg-bin-btn"}
                title={`Clica para ver top 15 (HCP ${label})`}
              >
                <div className="fw-700 fs-12 u-mb-4px">
                  {total.toLocaleString("pt-PT")}
                </div>
                <div className="muted fs-10 u-mb-4px">{((total / stats.withHcp) * 100).toFixed(1)}%</div>
                <MFColumn m={m} f={f} barHeight={barHeight} className="mf-col-lg" />
                <div className="fw-600 fs-11 u-mt-6pxx u-ta-center">{label}</div>
                <div className="fs-10 u-d-flex u-fd-column u-ai-center u-gap-1px u-mt-2px">
                  <span className="u-d-inline-flex u-ai-center u-gap-3px"><SexBadge sex="M" /><span className="fw-600">{m.toLocaleString("pt-PT")}</span></span>
                  <span className="u-d-inline-flex u-ai-center u-gap-3px"><SexBadge sex="F" /><span className="fw-600">{f.toLocaleString("pt-PT")}</span></span>
                </div>
              </button>
            );
          })}
        </Cols>
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
      <div className="u-d-grid u-grid-template-columns-p9a8d u-gap-16px u-mb-16px">
        {/* Top 15 melhores HCPs */}
        <div className="card u-p-12px">
          <SectionTitle icon="🏆">Top 15 melhores HCPs</SectionTitle>
          {stats.topBestHcp.map((p, i) => (
            <button
              key={p.federation_code}
              className="course-item u-w-100pc u-p-4px-6px u-mb-2px u-d-flex u-ai-center u-gap-8px u-cur-pointer"
              onClick={() => onPickPlayer(p.federation_code)}

            >
              <span className="fw-700 u-w-22px u-ta-center u-fs-fs-11">{i + 1}</span>
              <span className="fw-600 u-fl-1 u-ta-left u-fs-fs-12">
                {isForeignPrefix(p.country_prefix) && <span className="mr-4">{gf(p.country_prefix)}</span>}
                {p.name}
                <span className="muted fs-10 ml-4">({p.acronym})</span>
              </span>
              <HcpText hcp={p.hcp_exact as number} className="fs-14" />
            </button>
          ))}
        </div>

        {/* Novos federados por ano — stacked M/F */}
        <div className="card u-p-12px">
          <SectionTitle sub="stacked M/F">Novos federados por ano</SectionTitle>
          <Cols n={stats.admissionYears.length} className="u-gap-2px u-ai-end u-h-140px">
            {stats.admissionYears.map(([y, v]) => {
              const total = v.m + v.f;
              const barHeight = (total / Math.max(1, maxAdm)) * 110;
              return (
                <div key={y} className="u-d-flex u-fd-column u-ai-center u-h-100pc u-jc-flex-end">
                  <div className="fs-10 fw-600" title={`${v.m} M + ${v.f} F`}>{total}</div>
                  <MFColumn m={v.m} f={v.f} barHeight={barHeight} className="mf-col-wide" />
                  <div className="fs-10 muted u-mt-3px">{y.slice(2)}</div>
                </div>
              );
            })}
          </Cols>
        </div>
      </div>

      {/* 2 colunas: Escalões e Países */}
      <div className="u-d-grid u-grid-template-columns-120gf u-gap-16px u-mb-16px">
        {/* Por escalão (clicável) — stacked M/F */}
        <div className="card u-p-12px">
          <SectionTitle sub="clica para detalhe">Por escalão</SectionTitle>
          {sortedAges.map(([k, v]) => {
            const total = v.m + v.f;
            return (
              <button
                key={k}
                onClick={() => onDrillDown({ type: "age", key: k })}
                className="u-w-100pc u-p-4px-0 u-mb-4px u-bg-none u-bd-none u-cur-pointer u-ta-left"
              >
                <div className="u-d-flex u-jc-space-between u-fs-fs-12 u-fw-500">
                  <span>{k}</span>
                  <span>
                    <span className="fs-10 u-d-inline-flex u-ai-center u-gap-4px u-mr-6px">
                      <SexBadge sex="M" />{v.m} <SexBadge sex="F" />{v.f} ·
                    </span>
                    <span className="fw-700">{total.toLocaleString("pt-PT")}</span>
                  </span>
                </div>
                <MFBar m={v.m} f={v.f} widthPct={barPct(total, maxAge)} lg />
              </button>
            );
          })}
        </div>

        {/* Por país — M/F split */}
        <div className="card u-p-12px">
          <SectionTitle right={<MFLegend />}>Top 25 países</SectionTitle>
          {stats.topCountries.map(c => (
            <div key={c.cp} className="u-mb-6px">
              <div className="u-d-flex u-jc-space-between u-fs-fs-12 u-ai-center u-gap-6px">
                <span className="u-fl-1 u-minw-0 u-ov-hidden u-tov-ellipsis u-ws-nowrap">
                  {prefixFlag(c.cp)} <span className="fw-600">{c.name}</span> <span className="muted fs-10">({c.cp})</span>
                </span>
                <span className="muted fs-10 u-d-inline-flex u-gap-6px u-ws-nowrap">
                  <span className="c-male fw-600">{c.m}</span>·
                  <span className="c-female fw-600">{c.f}</span>
                </span>
                <span className="fw-700 u-minw-40px u-ta-right">{c.count.toLocaleString("pt-PT")}</span>
              </div>
              <div className="u-mt-2px">
                <MFBar m={c.m} f={c.f} widthPct={barPct(c.count, maxCountry)} />
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
  // A MESMA regra da contagem das barras (`hcpBinKey`), para a lista bater com o número.
  const inBin = federados.filter(f => isCountableHcp(f.hcp_exact) && hcpBinKey(f.hcp_exact) === bin);
  const top = inBin
    .sort((a, b) => (a.hcp_exact as number) - (b.hcp_exact as number))
    .slice(0, 15);
  const male = inBin.filter(f => f.gender === "M").length;
  const female = inBin.filter(f => f.gender === "F").length;

  return (
    <div className="card u-p-14px u-mb-16px u-bd-2px-solid-accent u-bg-bg-subtle">
      <div className="u-d-flex u-ai-center u-jc-space-between u-mb-10px">
        <div>
          <div className="fw-900 fs-14">🎯 {binRange.label}</div>
          <div className="muted fs-10 u-d-inline-flex u-ai-center u-gap-8px u-mt-4px">
            {inBin.length.toLocaleString("pt-PT")} jogadores ·
            <span className="u-d-inline-flex u-ai-center u-gap-3px"><SexBadge sex="M" />{male}</span>
            <span className="u-d-inline-flex u-ai-center u-gap-3px"><SexBadge sex="F" />{female}</span>
          </div>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="fw-800 fs-12 mb-4">Top 15 (ordenados por HCP)</div>
      <div className="u-d-grid u-grid-template-columns-120gf u-gap-4px">
        {top.map((p, i) => (
          <button
            key={p.federation_code}
            className="course-item u-p-4px-8px u-d-flex u-ai-center u-gap-8px u-cur-pointer u-ta-left"
            onClick={() => onPickPlayer(p.federation_code)}

          >
            <span className="fw-700 muted u-w-22px u-fs-fs-11">{i + 1}</span>
            <SexBadge sex={p.gender as "M" | "F"} />
            <span className="u-fl-1 u-fs-fs-12">
              {isForeignPrefix(p.country_prefix) && <span className="mr-4">{gf(p.country_prefix)}</span>}
              <span className="fw-600">{p.name}</span>
              <span className="muted fs-10 ml-4">({p.acronym})</span>
            </span>
            <HcpText hcp={p.hcp_exact as number} className="fs-13" />
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
    // Mesma regra dos restantes painéis: placeholders ≥54/99 fora das stats.
    if (isCountableHcp(f.hcp_exact)) { withHcp++; totalHcp += f.hcp_exact; }
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
  const best = [...members].filter(f => isCountableHcp(f.hcp_exact)).sort((a, b) => (a.hcp_exact as number) - (b.hcp_exact as number)).slice(0, 10);
  const topClubsDrill = drillDown.type === "age"
    ? Object.entries(byClub).sort((a, b) => b[1].count - a[1].count).slice(0, 10)
    : [];
  const topCountriesDrill = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const sortedAges = Object.entries(byAge).sort((a, b) => b[1] - a[1]);

  return (
    <div className="card u-p-14px u-mb-16px u-bd-2px-solid-accent u-bg-bg-subtle">
      <div className="u-d-flex u-ai-center u-jc-space-between u-mb-10px">
        <div className="fw-900 fs-14">
          {drillDown.type === "club" ? "🏌️ Clube" : "🎯 Escalão"}: {title}
        </div>
        <CloseButton onClick={onClose} title="Fechar drill-down" />
      </div>

      {/* KPIs do drill */}
      <div className="kpi-row">
        <KpiCard label="Total" value={fmt(members.length)} />
        <KpiCard label={<SexBadge sex="M" />} value={fmt(male)} pct={male / members.length} />
        <KpiCard label={<SexBadge sex="F" />} value={fmt(female)} pct={female / members.length} />
        <KpiCard label="Com HCP" value={fmt(withHcp)} sub={`média ${fmtHcp(avgHcp)}`} />
        <KpiCard label={`Activos ${todayIso().slice(0, 4)}`} value={fmt(active)} pct={active / members.length} />
        {pros > 0 && <KpiCard label="Pros" value={fmt(pros)} />}
      </div>

      <div className="u-d-grid u-grid-template-columns-1e70q u-gap-12px">
        {/* Top HCPs */}
        <div>
          <SectionTitle icon="🏆">Top 10 HCPs</SectionTitle>
          {best.map((p, i) => (
            <button
              key={p.federation_code}
              className="course-item u-w-100pc u-p-3px-6px u-mb-2px u-d-flex u-ai-center u-gap-6px u-cur-pointer"
              onClick={() => onPickPlayer(p.federation_code)}

            >
              <span className="fw-700 u-w-18px u-fs-fs-11">{i + 1}</span>
              <span className="u-fl-1 u-ta-left u-fs-fs-12">{p.name}</span>
              <HcpText hcp={p.hcp_exact as number} className="fs-13" />
            </button>
          ))}
        </div>

        {/* Só se for clube: distribuição por escalão */}
        {drillDown.type === "club" && sortedAges.length > 0 && (
          <div>
            <SectionTitle>Por escalão</SectionTitle>
            {sortedAges.map(([k, v]) => (
              <div key={k} className="u-d-flex u-jc-space-between u-fs-fs-12 u-mb-2px">
                <span>{k}</span><span className="fw-700">{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Só se for escalão: top clubes */}
        {drillDown.type === "age" && topClubsDrill.length > 0 && (
          <div>
            <SectionTitle>Top clubes</SectionTitle>
            {topClubsDrill.map(([code, c]) => (
              <div key={code} className="u-d-flex u-jc-space-between u-fs-fs-12 u-mb-2px">
                <span>{c.name}</span><span className="fw-700">{c.count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Top países (sempre) */}
        {topCountriesDrill.length > 1 && (
          <div>
            <SectionTitle>Por país</SectionTitle>
            {topCountriesDrill.map(([cp, n]) => (
              <div key={cp} className="u-d-flex u-jc-space-between u-fs-fs-12 u-mb-2px">
                <span>{prefixFlag(cp)} {cp}</span><span className="fw-700">{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
