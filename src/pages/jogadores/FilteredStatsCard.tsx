/**
 * src/pages/jogadores/FilteredStatsCard.tsx
 *
 * Painel mostrado quando não há nenhum jogador seleccionado na sidebar:
 * estatísticas agregadas dos jogadores actualmente filtrados (KPIs, top 10
 * por HCP, distribuições por escalão/clube/região e histograma de HCP).
 */
import type { FederadoRaw, MergedPlayer } from "../../data/federadosLoader";
import { gf, isForeignPrefix } from "../../utils/flagUtils";
import SexBadge from "../../ui/SexBadge";
import EmptyState from "../../ui/EmptyState";
import { HCP_BINS, emptyHcpBins, hcpBinKey, isCountableHcp } from "./hcpBins";
import { barPct, MFBar, MFColumn, MFLegend } from "./statsWidgets";
import KpiCard from "../../ui/KpiCard";
import { fmt, todayIso } from "../../utils/format";
import { ESC_IDX, type ViewMode } from "./filterPlayers";
import { fmtHcp } from "../../utils/format";
import SectionTitle from "../../ui/SectionTitle";

import { HcpText } from "../../ui/HcpPill";
import { Cols, Fill } from "../../ui/DataStyle";
export type FilteredPlayer = { name: string; fed: string; escalao: string; sex?: "M" | "F" | string; hcp: number | null; club: unknown; region?: string; _federadoRaw?: FederadoRaw; _source?: MergedPlayer["_source"]; tags?: string[] };

export default function FilteredStatsCard({ filtered, viewMode, onPickPlayer, activeFiltersCount }: {
  filtered: FilteredPlayer[];
  viewMode: ViewMode;
  onPickPlayer: (fed: string) => void;
  activeFiltersCount: number;
}) {
  if (!filtered.length) {
    return <EmptyState size="sm" message="Nenhum jogador corresponde aos filtros actuais" />;
  }

  // Agregados
  let male = 0, female = 0, withHcp = 0, totalHcp = 0, activeThisYear = 0;
  let withAnalysis = 0, cadastroOnly = 0;
  const byEsc: Record<string, { m: number; f: number }> = {};
  const byClub: Record<string, { name: string; count: number }> = {};
  const byRegion: Record<string, number> = {};
  const hcpBins = emptyHcpBins();

  for (const p of filtered) {
    const isM = p.sex === "M"; const isF = p.sex === "F";
    if (isM) male++; else if (isF) female++;
    // Excluir placeholders ≥54/99 (HI não estabelecido) — antes só excluía 99.
    if (isCountableHcp(p.hcp)) {
      withHcp++; totalHcp += p.hcp;
      const k = hcpBinKey(p.hcp);
      if (isM) hcpBins[k].m++; else if (isF) hcpBins[k].f++;
    }
    if ((p._federadoRaw?.rounds_current_year || 0) > 0) activeThisYear++;
    if (!byEsc[p.escalao]) byEsc[p.escalao] = { m: 0, f: 0 };
    if (isM) byEsc[p.escalao].m++; else if (isF) byEsc[p.escalao].f++;
    const club = typeof p.club === "object" && p.club ? p.club as { code?: string; short?: string; long?: string } : null;
    if (club?.code) {
      if (!byClub[club.code]) byClub[club.code] = { name: club.short || club.long || club.code, count: 0 };
      byClub[club.code].count++;
    }
    if (p.region) byRegion[p.region] = (byRegion[p.region] || 0) + 1;
    if (p._source === "both" || p._source === "players" || (!p._source && viewMode === "ours")) withAnalysis++;
    if (p._source === "feds") cadastroOnly++;
  }

  const avgHcp = withHcp ? totalHcp / withHcp : 0;
  const sortedEsc = Object.entries(byEsc).sort((a, b) => (ESC_IDX.get(a[0]) ?? 999) - (ESC_IDX.get(b[0]) ?? 999));
  const maxEsc = Math.max(...Object.values(byEsc).map(v => v.m + v.f), 1);
  const topClubs = Object.entries(byClub).sort((a, b) => b[1].count - a[1].count).slice(0, 12);
  const maxClub = topClubs[0]?.[1].count ?? 1;
  const topRegions = Object.entries(byRegion).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxRegion = topRegions[0]?.[1] ?? 1;
  const maxHcpBin = Math.max(...Object.values(hcpBins).map(v => v.m + v.f), 1);

  const topBest = [...filtered]
    .filter(p => isCountableHcp(p.hcp))
    .sort((a, b) => (a.hcp as number) - (b.hcp as number))
    .slice(0, 10);

  return (
    <div className="p-16">
      <div className="u-mb-14px">
        <h2 className="detail-title u-m-0">📊 Estatísticas da selecção actual</h2>
        <div className="muted fs-10 u-mt-4px">
          {filtered.length.toLocaleString("pt-PT")} jogadores
          {activeFiltersCount > 0 && <> · {activeFiltersCount} filtro{activeFiltersCount > 1 ? "s" : ""} activo{activeFiltersCount > 1 ? "s" : ""}</>}
          {" · "}<span className="c-muted">clica num jogador na sidebar para ver o detalhe</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        <KpiCard label="Total" value={fmt(filtered.length)} />
        <KpiCard label={<><SexBadge sex="M" /> Masculino</>} value={fmt(male)} pct={male / filtered.length} />
        <KpiCard label={<><SexBadge sex="F" /> Feminino</>} value={fmt(female)} pct={female / filtered.length} />
        {withHcp > 0 && <KpiCard label="Com HCP" value={fmt(withHcp)} sub={`média ${fmtHcp(avgHcp)}`} />}
        {viewMode === "todos" && activeThisYear > 0 && <KpiCard label={`Activos ${todayIso().slice(0, 4)}`} value={fmt(activeThisYear)} pct={activeThisYear / filtered.length} sub="com rondas" />}
        {viewMode === "todos" && withAnalysis > 0 && cadastroOnly > 0 && (
          <KpiCard label="🔍 Com análise" value={fmt(withAnalysis)} sub={`+ ${cadastroOnly} cadastro`} />
        )}
      </div>

      {/* Top 10 por HCP */}
      {topBest.length > 0 && (
        <div className="card u-p-12px u-mb-16px">
          <SectionTitle icon="🏆" sub="melhores primeiro">Top 10 por HCP</SectionTitle>
          <div className="u-d-grid u-grid-template-columns-120gf u-gap-4px">
            {topBest.map((p, i) => {
              const cp = p._federadoRaw?.country_prefix;
              return (
                <button
                  key={p.fed}
                  className="course-item u-p-4px-8px u-d-flex u-ai-center u-gap-8px u-cur-pointer u-ta-left"
                  onClick={() => onPickPlayer(p.fed)}

                >
                  <span className="fw-700 muted u-w-22px u-fs-fs-11">{i + 1}</span>
                  {p.sex === "M" || p.sex === "F" ? <SexBadge sex={p.sex} /> : null}
                  <span className="u-fl-1 u-fs-fs-12">
                    {isForeignPrefix(cp) && <span className="mr-4">{gf(cp)}</span>}
                    <span className="fw-600">{p.name}</span>
                    {(() => {
                      const club = typeof p.club === "object" && p.club ? (p.club as { short?: string }).short : null;
                      return club ? <span className="muted fs-10 ml-4">({club})</span> : null;
                    })()}
                  </span>
                  <HcpText hcp={p.hcp as number} className="fs-13" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3 colunas: Escalões, Clubes, Regiões */}
      <div className="u-d-grid u-grid-template-columns-120gf u-gap-14px u-mb-16px">
        {sortedEsc.length > 1 && (
          <div className="card u-p-12px">
            <SectionTitle>Por escalão</SectionTitle>
            {sortedEsc.map(([k, v]) => {
              const total = v.m + v.f;
              return (
                <div key={k} className="u-mb-4px">
                  <div className="u-d-flex u-jc-space-between u-fs-fs-12">
                    <span className="fw-500">{k}</span>
                    <span className="fw-700">{total}</span>
                  </div>
                  <MFBar m={v.m} f={v.f} widthPct={barPct(total, maxEsc)} />
                </div>
              );
            })}
          </div>
        )}

        {topClubs.length > 1 && (
          <div className="card u-p-12px">
            <SectionTitle>Top 12 clubes</SectionTitle>
            {topClubs.map(([code, c]) => (
              <div key={code} className="u-mb-4px">
                <div className="u-d-flex u-jc-space-between u-fs-fs-12">
                  <span className="fw-500">{c.name} <span className="muted fs-10">({code})</span></span>
                  <span className="fw-700">{c.count}</span>
                </div>
                <div className="u-h-4px u-bg-bg-subtle u-br-radius-xs u-ov-hidden">
                  <Fill pct={barPct(c.count, maxClub)} bg="var(--color-good)" className="u-h-100pc" />
                </div>
              </div>
            ))}
          </div>
        )}

        {topRegions.length > 1 && (
          <div className="card u-p-12px">
            <SectionTitle>Por região</SectionTitle>
            {topRegions.map(([r, n]) => (
              <div key={r} className="u-mb-4px">
                <div className="u-d-flex u-jc-space-between u-fs-fs-12">
                  <span className="fw-500">{r}</span>
                  <span className="fw-700">{n}</span>
                </div>
                <div className="u-h-4px u-bg-bg-subtle u-br-radius-xs u-ov-hidden">
                  <Fill pct={barPct(n, maxRegion)} bg="var(--chart-2)" className="u-h-100pc" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Distribuição de HCP */}
      {withHcp > 0 && (
        <div className="card u-p-12px">
          <SectionTitle sub={`${withHcp} jogadores`} right={<MFLegend />}>Distribuição de HCP</SectionTitle>
          <Cols n={HCP_BINS.length} className="u-gap-10px u-ai-end u-h-220px">
            {HCP_BINS.map(bin => {
              const { m, f } = hcpBins[bin];
              const total = m + f;
              const label = bin === "plus" ? "Scratch" : bin;
              const barHeight = (total / maxHcpBin) * 140;
              return (
                <div key={bin} className="u-d-flex u-fd-column u-ai-center u-h-100pc u-jc-flex-end">
                  <div className="fw-700 fs-11 u-mb-2px">{total}</div>
                  <div className="muted fs-10 u-mb-4px">{total > 0 ? ((total / withHcp) * 100).toFixed(0) + "%" : ""}</div>
                  <MFColumn m={m} f={f} barHeight={barHeight} className="mf-col-sm" />
                  <div className="fw-600 fs-10 u-mt-4px">{label}</div>
                </div>
              );
            })}
          </Cols>
        </div>
      )}
    </div>
  );
}
