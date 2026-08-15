/**
 * src/pages/jogadores/FilteredStatsCard.tsx
 *
 * Painel mostrado quando não há nenhum jogador seleccionado na sidebar:
 * estatísticas agregadas dos jogadores actualmente filtrados (KPIs, top 10
 * por HCP, distribuições por escalão/clube/região e histograma de HCP).
 */
import type { FederadoRaw, MergedPlayer } from "../../data/federadosLoader";
import { gf } from "../../utils/flagUtils";
import SexBadge from "../../ui/SexBadge";
import EmptyState from "../../ui/EmptyState";
import { HCP_BINS, emptyHcpBins, hcpBinKey, isCountableHcp } from "./hcpBins";
import { barPct, KpiCard, MFBar, MFColumn, MFLegend } from "./statsWidgets";
import { ESC_IDX, type ViewMode } from "./filterPlayers";

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
  let male = 0, female = 0, withHcp = 0, totalHcp = 0, active2026 = 0;
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
    if ((p._federadoRaw?.rounds_current_year || 0) > 0) active2026++;
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
      <div style={{ marginBottom: 14 }}>
        <h2 className="detail-title" style={{ margin: 0 }}>📊 Estatísticas da selecção actual</h2>
        <div className="muted fs-10" style={{ marginTop: 4 }}>
          {filtered.length.toLocaleString("pt-PT")} jogadores
          {activeFiltersCount > 0 && <> · {activeFiltersCount} filtro{activeFiltersCount > 1 ? "s" : ""} activo{activeFiltersCount > 1 ? "s" : ""}</>}
          {" · "}<span className="c-muted">clica num jogador na sidebar para ver o detalhe</span>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 16 }}>
        <KpiCard label="Total" value={filtered.length} big />
        <KpiCard label={<><SexBadge sex="M" /> Masculino</>} value={male} pct={male / filtered.length} />
        <KpiCard label={<><SexBadge sex="F" /> Feminino</>} value={female} pct={female / filtered.length} />
        {withHcp > 0 && <KpiCard label="Com HCP" value={withHcp} sub={`média ${avgHcp.toFixed(1)}`} />}
        {viewMode === "todos" && active2026 > 0 && <KpiCard label="Activos 2026" value={active2026} pct={active2026 / filtered.length} sub="com rondas" />}
        {viewMode === "todos" && withAnalysis > 0 && cadastroOnly > 0 && (
          <KpiCard label="🔍 Com análise" value={withAnalysis} sub={`+ ${cadastroOnly} cadastro`} />
        )}
      </div>

      {/* Top 10 por HCP */}
      {topBest.length > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 16 }}>
          <div className="fw-700 fs-14 mb-8">🏆 Top 10 por HCP (melhores primeiro)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 4 }}>
            {topBest.map((p, i) => {
              const cp = p._federadoRaw?.country_prefix;
              return (
                <button
                  key={p.fed}
                  className="course-item"
                  onClick={() => onPickPlayer(p.fed)}
                  style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left" }}
                >
                  <span className="fw-700 muted" style={{ width: 22, fontSize: "var(--fs-11)" }}>{i + 1}</span>
                  {p.sex === "M" || p.sex === "F" ? <SexBadge sex={p.sex} /> : null}
                  <span style={{ flex: 1, fontSize: "var(--fs-12)" }}>
                    {cp && cp !== "PT" && !cp.startsWith("@") && <span className="mr-4">{gf(cp)}</span>}
                    <span className="fw-600">{p.name}</span>
                    {(() => {
                      const club = typeof p.club === "object" && p.club ? (p.club as { short?: string }).short : null;
                      return club ? <span className="muted fs-10 ml-4">({club})</span> : null;
                    })()}
                  </span>
                  <span className="fw-900" style={{ fontSize: "var(--fs-13)", color: (p.hcp as number) < 0 ? "var(--medal-gold)" : "var(--text-1)" }}>
                    {(p.hcp as number).toFixed(1)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3 colunas: Escalões, Clubes, Regiões */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 16 }}>
        {sortedEsc.length > 1 && (
          <div className="card" style={{ padding: 12 }}>
            <div className="fw-700 fs-14 mb-8">Por escalão</div>
            {sortedEsc.map(([k, v]) => {
              const total = v.m + v.f;
              return (
                <div key={k} style={{ marginBottom: 5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-12)" }}>
                    <span className="fw-500">{k}</span>
                    <span className="fw-700">{total}</span>
                  </div>
                  <MFBar m={v.m} f={v.f} widthPct={barPct(total, maxEsc)} height={6} />
                </div>
              );
            })}
          </div>
        )}

        {topClubs.length > 1 && (
          <div className="card" style={{ padding: 12 }}>
            <div className="fw-700 fs-14 mb-8">Top 12 clubes</div>
            {topClubs.map(([code, c]) => (
              <div key={code} style={{ marginBottom: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-12)" }}>
                  <span className="fw-500">{c.name} <span className="muted fs-10">({code})</span></span>
                  <span className="fw-700">{c.count}</span>
                </div>
                <div style={{ height: 4, background: "var(--bg-subtle)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: barPct(c.count, maxClub), height: "100%", background: "var(--color-good)" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {topRegions.length > 1 && (
          <div className="card" style={{ padding: 12 }}>
            <div className="fw-700 fs-14 mb-8">Por região</div>
            {topRegions.map(([r, n]) => (
              <div key={r} style={{ marginBottom: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-12)" }}>
                  <span className="fw-500">{r}</span>
                  <span className="fw-700">{n}</span>
                </div>
                <div style={{ height: 4, background: "var(--bg-subtle)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: barPct(n, maxRegion), height: "100%", background: "var(--chart-2)" }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Distribuição de HCP */}
      {withHcp > 0 && (
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="fw-700 fs-14">Distribuição de HCP · <span className="muted fs-10">{withHcp} jogadores</span></div>
            <MFLegend />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${HCP_BINS.length}, 1fr)`, gap: 10, alignItems: "end", height: 220 }}>
            {HCP_BINS.map(bin => {
              const { m, f } = hcpBins[bin];
              const total = m + f;
              const label = bin === "plus" ? "Scratch" : bin;
              const barHeight = (total / maxHcpBin) * 140;
              return (
                <div key={bin} style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                  <div className="fw-700 fs-11" style={{ marginBottom: 2 }}>{total}</div>
                  <div className="muted fs-10" style={{ marginBottom: 4 }}>{total > 0 ? ((total / withHcp) * 100).toFixed(0) + "%" : ""}</div>
                  <MFColumn m={m} f={f} barHeight={barHeight} width="80%" minWidth={14} />
                  <div className="fw-600 fs-10" style={{ marginTop: 4 }}>{label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
