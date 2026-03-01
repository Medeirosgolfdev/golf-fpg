/**
 * DrivePage.tsx — Página de Torneios DRIVE
 *
 * Drive Tour (4 regiões: Norte, Centro/Tejo, Sul, Madeira)
 * Drive Challenge (4 regiões: Norte, Centro/Tejo, Sul, Madeira)
 *
 * Mostra ranking acumulado por região com posições em cada torneio,
 * pills de região, e links para classificações no scoring.datagolf.pt.
 */
import { useState, useEffect, useMemo } from "react";
import { isCalUnlocked } from "../utils/authConstants";
import PasswordGate from "../ui/PasswordGate";
import LoadingState from "../ui/LoadingState";

/* ═══ Types ═══ */
interface DriveResult {
  pos: number | null;
  name: string;
  fed?: string | null;
  club: string;
  gross: number | null;
  net: number | null;
  points: number | null;
  stableford?: number | null;
  hcp?: string | null;
}

interface DriveTournament {
  num: number | null;
  name: string;
  date: string | null;
  campo: string;
  url?: string;
  ccode?: string;
  tcode?: string;
  results: DriveResult[];
}

interface DriveRankEntry {
  pos: number;
  name: string;
  fed?: string | null;
  club: string;
  hcp?: string | null;
  results: (number | null)[];
  totalPoints: number;
  tournsPlayed: number;
}

interface DriveRegion {
  name: string;
  tournaments: DriveTournament[];
  ranking: DriveRankEntry[];
}

interface DriveSeries {
  name: string;
  regions: Record<string, DriveRegion>;
}

interface DriveData {
  lastUpdated: string;
  series: Record<string, DriveSeries>;
}

/* ═══ Cores por região ═══ */
const REGION_STYLES: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  norte:   { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd", icon: "🔵" },
  centro:  { bg: "#fef3c7", text: "#92400e", border: "#fcd34d", icon: "🟡" },
  sul:     { bg: "#dcfce7", text: "#166534", border: "#86efac", icon: "🟢" },
  madeira: { bg: "#f3e8ff", text: "#6b21a8", border: "#c4b5fd", icon: "🟣" },
};

const SERIES_STYLES: Record<string, { color: string; icon: string }> = {
  drive_tour: { color: "#16a34a", icon: "🏌️" },
  drive_challenge: { color: "#8b5cf6", icon: "⚡" },
};

/* ═══ Helpers ═══ */
const MONTHS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

function fmtDateFull(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** Derive ranking from tournament results if not already present */
function deriveRanking(region: DriveRegion): DriveRankEntry[] {
  if (region.ranking && region.ranking.length > 0) return region.ranking;

  const playerMap = new Map<string, DriveRankEntry>();
  const nTourns = region.tournaments.length;

  for (let i = 0; i < nTourns; i++) {
    const tourn = region.tournaments[i];
    for (const r of tourn.results) {
      if (!r.name) continue;
      const key = r.fed || r.name; // Use fed as key if available
      if (!playerMap.has(key)) {
        playerMap.set(key, {
          pos: 0,
          name: r.name,
          fed: r.fed,
          club: r.club,
          hcp: r.hcp,
          results: new Array(nTourns).fill(null),
          totalPoints: 0,
          tournsPlayed: 0,
        });
      }
      const p = playerMap.get(key)!;
      p.results[i] = r.pos;
      if (r.fed && !p.fed) p.fed = r.fed;
      if (r.club && !p.club) p.club = r.club;

      // Points: 100 - position (simple merit system)
      if (r.pos != null) {
        p.totalPoints += Math.max(0, 101 - r.pos);
        p.tournsPlayed++;
      }
    }
  }

  const ranking = Array.from(playerMap.values())
    .sort((a, b) => {
      // Sort by total points desc, then by tourns played desc
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return b.tournsPlayed - a.tournsPlayed;
    });

  ranking.forEach((p, i) => { p.pos = i + 1; });
  return ranking;
}

/* ═══ Components ═══ */

/** Pill badge de região */
function RegionPill({ regionKey }: { regionKey: string }) {
  const s = REGION_STYLES[regionKey] || REGION_STYLES.norte;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "1px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
      letterSpacing: "0.04em", textTransform: "uppercase",
      background: s.bg, color: s.text, border: `1px solid ${s.border}`,
      whiteSpace: "nowrap",
    }}>
      {s.icon} {regionKey === "centro" ? "TEJO" : regionKey.toUpperCase()}
    </span>
  );
}

/** Position badge */
function PosBadge({ pos }: { pos: number | null }) {
  if (pos == null) return <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>;

  const medals: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
  if (medals[pos]) {
    return <span style={{ fontSize: 13 }}>{medals[pos]}</span>;
  }

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 22, height: 22, borderRadius: "50%",
      fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)",
      background: pos <= 5 ? "var(--accent-light)" : "var(--bg-muted)",
      color: pos <= 5 ? "var(--accent)" : "var(--text-3)",
    }}>
      {pos}
    </span>
  );
}

/** Ranking table for a region */
function RegionRanking({
  region,
  regionKey,
  seriesKey,
  onSelectPlayer,
}: {
  region: DriveRegion;
  regionKey: string;
  seriesKey: string;
  onSelectPlayer?: (fed: string) => void;
}) {
  const ranking = useMemo(() => deriveRanking(region), [region]);
  const [expandedTourn, setExpandedTourn] = useState<number | null>(null);
  const tourns = region.tournaments;
  const playedTourns = tourns.filter(t => t.results.length > 0);
  const nTourns = tourns.length;

  const regionStyle = REGION_STYLES[regionKey] || REGION_STYLES.norte;

  if (ranking.length === 0 && playedTourns.length === 0) {
    return (
      <div className="drive-region-empty">
        <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "16px 0" }}>
          Sem resultados disponíveis. Corre o scraper para descarregar dados.
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tourns.map((t, i) => (
            <span key={i} style={{
              padding: "3px 8px", borderRadius: 6, fontSize: 11,
              background: "var(--bg-muted)", color: "var(--text-3)",
            }}>
              T{t.num || i + 1}: {t.campo || "TBC"} · {fmtDate(t.date)}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Torneios mini-cards */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {tourns.map((t, i) => {
          const hasData = t.results.length > 0;
          const isExpanded = expandedTourn === i;
          return (
            <button
              key={i}
              onClick={() => hasData ? setExpandedTourn(isExpanded ? null : i) : undefined}
              style={{
                padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                border: `1.5px solid ${isExpanded ? regionStyle.border : hasData ? "var(--border, #ddd)" : "var(--bg-muted)"}`,
                background: isExpanded ? regionStyle.bg : hasData ? "var(--bg-card)" : "var(--bg-muted)",
                color: isExpanded ? regionStyle.text : hasData ? "var(--text)" : "var(--text-muted)",
                cursor: hasData ? "pointer" : "default",
                opacity: hasData ? 1 : 0.6,
                transition: "all 0.15s ease",
              }}
            >
              <span style={{ fontWeight: 800 }}>T{t.num || i + 1}</span>{" "}
              {t.campo || "TBC"}
              <span style={{ fontWeight: 400, marginLeft: 4, opacity: 0.7 }}>{fmtDate(t.date)}</span>
              {hasData && <span style={{ marginLeft: 4, fontSize: 9 }}>{t.results.length}👤</span>}
            </button>
          );
        })}
      </div>

      {/* Expanded tournament results */}
      {expandedTourn != null && tourns[expandedTourn]?.results.length > 0 && (
        <div style={{
          marginBottom: 12, padding: "8px 0",
          borderTop: `2px solid ${regionStyle.border}`,
          borderBottom: `2px solid ${regionStyle.border}`,
          background: regionStyle.bg + "33",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, padding: "0 8px 6px", color: regionStyle.text }}>
            {tourns[expandedTourn].name}
            {tourns[expandedTourn].url && (
              <a href={tourns[expandedTourn].url} target="_blank" rel="noopener"
                style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: "var(--link-color)" }}>
                Ver no DataGolf ↗
              </a>
            )}
          </div>
          <div className="drive-scroll">
            <table className="sc-table-modern" style={{ width: "auto", fontSize: 12 }}>
              <thead><tr>
                <th className="hole-header" style={{ width: 28, textAlign: "center", padding: "0 2px" }}>#</th>
                <th className="hole-header" style={{ textAlign: "left", paddingLeft: 6 }}>Jogador</th>
                <th className="hole-header" style={{ textAlign: "left", paddingLeft: 6 }}>Clube</th>
                <th className="hole-header" style={{ width: 40, textAlign: "center" }}>Gross</th>
                {tourns[expandedTourn].results.some(r => r.net != null) && (
                  <th className="hole-header" style={{ width: 40, textAlign: "center" }}>Net</th>
                )}
              </tr></thead>
              <tbody>
                {tourns[expandedTourn].results.map((r, idx) => (
                  <tr key={idx} style={{
                    background: r.fed === "52884" ? "var(--bg-current)" : undefined,
                  }}>
                    <td style={{ textAlign: "center", padding: "3px 2px" }}><PosBadge pos={r.pos} /></td>
                    <td style={{ paddingLeft: 6, fontWeight: r.fed === "52884" ? 700 : 500 }}>
                      {r.fed && onSelectPlayer ? (
                        <button className="link-btn" onClick={() => onSelectPlayer(r.fed!)}>{r.name}</button>
                      ) : r.name}
                    </td>
                    <td style={{ paddingLeft: 6, color: "var(--text-3)", fontSize: 11 }}>{r.club}</td>
                    <td style={{ textAlign: "center", fontFamily: "var(--mono)", fontWeight: 600 }}>{r.gross ?? "—"}</td>
                    {tourns[expandedTourn].results.some(r2 => r2.net != null) && (
                      <td style={{ textAlign: "center", fontFamily: "var(--mono)", color: "var(--text-2)" }}>{r.net ?? "—"}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main ranking table */}
      {ranking.length > 0 && (
        <div className="drive-scroll">
          <table className="sc-table-modern" style={{ width: "auto", fontSize: 12 }}>
            <thead><tr>
              <th className="hole-header" style={{ width: 28, textAlign: "center", padding: "0 2px" }}>Rk</th>
              <th className="hole-header" style={{ textAlign: "left", paddingLeft: 6 }}>Jogador</th>
              <th className="hole-header" style={{ textAlign: "left", paddingLeft: 6 }}>Clube</th>
              {tourns.map((t, i) => (
                <th key={i} className="hole-header" style={{
                  width: 32, textAlign: "center", padding: "0 2px", fontSize: 10,
                  color: t.results.length > 0 ? "var(--text)" : "var(--text-muted)",
                }}>
                  T{t.num || i + 1}
                </th>
              ))}
              <th className="hole-header col-total" style={{ width: 34, padding: "0 3px" }}>Pts</th>
              <th className="hole-header" style={{ width: 24, textAlign: "center", padding: "0 2px", fontSize: 10 }}>Jg</th>
            </tr></thead>
            <tbody>
              {ranking.map((p, idx) => (
                <tr key={idx} style={{
                  background: p.fed === "52884" ? "var(--bg-current)" : undefined,
                }}>
                  <td style={{ textAlign: "center", padding: "3px 2px" }}>
                    <PosBadge pos={p.pos} />
                  </td>
                  <td style={{ paddingLeft: 6, fontWeight: p.fed === "52884" ? 700 : 500 }}>
                    {p.fed && onSelectPlayer ? (
                      <button className="link-btn" onClick={() => onSelectPlayer(p.fed!)}>{p.name}</button>
                    ) : p.name}
                  </td>
                  <td style={{ paddingLeft: 6, color: "var(--text-3)", fontSize: 11 }}>{p.club}</td>
                  {p.results.map((r, i) => (
                    <td key={i} style={{
                      textAlign: "center", fontFamily: "var(--mono)", fontSize: 11,
                      fontWeight: r != null && r <= 3 ? 700 : 400,
                      color: r == null ? "var(--text-muted)"
                        : r === 1 ? "#d97706"
                        : r <= 3 ? "var(--accent)"
                        : r <= 5 ? "var(--text-2)"
                        : "var(--text-3)",
                    }}>
                      {r ?? "—"}
                    </td>
                  ))}
                  <td style={{
                    textAlign: "center", fontFamily: "var(--mono)", fontWeight: 700,
                    color: "var(--text)",
                  }}>
                    {p.totalPoints}
                  </td>
                  <td style={{
                    textAlign: "center", fontFamily: "var(--mono)", fontSize: 10,
                    color: "var(--text-muted)",
                  }}>
                    {p.tournsPlayed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══ Region section card ═══ */
function RegionCard({
  regionKey,
  region,
  seriesKey,
  defaultExpanded,
  onSelectPlayer,
}: {
  regionKey: string;
  region: DriveRegion;
  seriesKey: string;
  defaultExpanded: boolean;
  onSelectPlayer?: (fed: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rStyle = REGION_STYLES[regionKey] || REGION_STYLES.norte;
  const playedCount = region.tournaments.filter(t => t.results.length > 0).length;
  const totalCount = region.tournaments.length;
  const ranking = useMemo(() => deriveRanking(region), [region]);

  return (
    <div className="card" style={{
      marginBottom: 10, overflow: "hidden",
      borderLeft: `4px solid ${rStyle.border}`,
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "10px 12px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 16 }}>{rStyle.icon}</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
          {region.name}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 8,
          background: "var(--bg-muted)", color: "var(--text-3)",
        }}>
          {playedCount}/{totalCount} torneios
        </span>
        {ranking.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 8,
            background: rStyle.bg, color: rStyle.text,
          }}>
            {ranking.length} jogadores
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
          ▼
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "0 12px 12px" }}>
          <RegionRanking
            region={region}
            regionKey={regionKey}
            seriesKey={seriesKey}
            onSelectPlayer={onSelectPlayer}
          />
        </div>
      )}
    </div>
  );
}

/* ═══ Main Page ═══ */
export default function DrivePage({
  onSelectPlayer,
}: {
  onSelectPlayer?: (fed: string) => void;
}) {
  const [data, setData] = useState<DriveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSeries, setActiveSeries] = useState<string>("drive_tour");

  /* Auth */
  if (!isCalUnlocked()) return <PasswordGate />;

  /* Load data */
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/data/drive-data.json");
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        setData(json);
      } catch (e: any) {
        setError(e.message || "Erro ao carregar dados DRIVE");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState label="A carregar dados DRIVE…" />;
  if (error || !data) {
    return (
      <div className="center-msg error-box">
        <div className="error-title">Erro</div>
        <div className="error-msg">{error || "Dados não disponíveis"}</div>
        <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>
          Coloca o ficheiro <code style={{ background: "var(--bg-code)", padding: "1px 4px", borderRadius: 3 }}>drive-data.json</code> em <code style={{ background: "var(--bg-code)", padding: "1px 4px", borderRadius: 3 }}>public/data/</code>
        </p>
      </div>
    );
  }

  const seriesKeys = Object.keys(data.series);
  const currentSeries = data.series[activeSeries];
  const regionOrder = ["madeira", "norte", "centro", "sul"];
  const orderedRegions = regionOrder
    .filter(k => currentSeries?.regions[k])
    .map(k => [k, currentSeries.regions[k]] as [string, DriveRegion]);

  // Also add any regions not in the predefined order
  for (const [k, v] of Object.entries(currentSeries?.regions || {})) {
    if (!regionOrder.includes(k)) orderedRegions.push([k, v]);
  }

  // Stats
  let totalPlayers = 0;
  let totalTourns = 0;
  if (currentSeries) {
    for (const r of Object.values(currentSeries.regions)) {
      totalTourns += r.tournaments.length;
      const ranking = deriveRanking(r);
      totalPlayers += ranking.length;
    }
  }

  return (
    <div className="drive-page" style={{ maxWidth: 900, margin: "0 auto", padding: "0 8px" }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "var(--text)" }}>
            Circuito DRIVE
          </h1>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8,
            background: "var(--bg-success)", color: "var(--color-good-dark)",
          }}>
            2026
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--text-3)" }}>
          <span>Actualizado: {fmtDateFull(data.lastUpdated)}</span>
          <span>·</span>
          <span>{totalPlayers} jogadores</span>
          <span>·</span>
          <span>{totalTourns} torneios</span>
        </div>
      </div>

      {/* Series tabs */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 16,
        borderBottom: "2px solid var(--bg-muted)",
        paddingBottom: 0,
      }}>
        {seriesKeys.map(sk => {
          const s = SERIES_STYLES[sk] || SERIES_STYLES.drive_tour;
          const isActive = activeSeries === sk;
          const seriesData = data.series[sk];
          return (
            <button
              key={sk}
              onClick={() => setActiveSeries(sk)}
              style={{
                padding: "8px 16px", border: "none", cursor: "pointer",
                borderRadius: "8px 8px 0 0",
                fontWeight: isActive ? 800 : 600, fontSize: 13,
                background: isActive ? s.color : "transparent",
                color: isActive ? "#fff" : "var(--text-3)",
                transition: "all 0.15s ease",
                display: "flex", alignItems: "center", gap: 6,
                borderBottom: isActive ? `3px solid ${s.color}` : "3px solid transparent",
                marginBottom: -2,
              }}
            >
              <span>{s.icon}</span>
              {seriesData.name}
              <span style={{
                fontSize: 9, fontWeight: 600, padding: "0 5px", borderRadius: 6,
                background: isActive ? "rgba(255,255,255,0.25)" : "var(--bg-muted)",
                color: isActive ? "#fff" : "var(--text-muted)",
              }}>
                {Object.keys(seriesData.regions).length} regiões
              </span>
            </button>
          );
        })}
      </div>

      {/* Region pills overview */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {orderedRegions.map(([rk]) => (
          <RegionPill key={rk} regionKey={rk} />
        ))}
      </div>

      {/* Region cards */}
      {orderedRegions.map(([rk, region], idx) => (
        <RegionCard
          key={`${activeSeries}-${rk}`}
          regionKey={rk}
          region={region}
          seriesKey={activeSeries}
          defaultExpanded={idx === 0}
          onSelectPlayer={onSelectPlayer}
        />
      ))}

      {orderedRegions.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
          Sem regiões disponíveis para {currentSeries?.name || activeSeries}
        </div>
      )}

      {/* Footer info */}
      <div style={{
        marginTop: 20, padding: "12px 16px", borderRadius: 8,
        background: "var(--bg-info)", border: "1px solid var(--border-info)",
        fontSize: 11, color: "var(--color-info)",
        lineHeight: 1.5,
      }}>
        <strong>ℹ️ Fonte de dados:</strong> Classificações do{" "}
        <a href="https://scoring.datagolf.pt/pt/tournaments.aspx" target="_blank" rel="noopener"
           style={{ color: "var(--link-color)" }}>
          scoring.datagolf.pt
        </a>
        . Ranking derivado das posições obtidas em cada torneio (101 − posição = pontos).
        Para actualizar, corre o script <code style={{
          background: "var(--bg-code)", padding: "1px 4px", borderRadius: 3,
        }}>drive-scraper.js</code> na consola do browser.
      </div>
    </div>
  );
}
