/**
 * DrivePage.tsx — DRIVE Tour & Challenge Results
 *
 * Displays results from Portuguese junior golf DRIVE circuit.
 * Two series: Drive Tour (open age) and Drive Challenge (by escalão).
 * Regions: Norte, Tejo, Sul, Madeira, Açores.
 */
import React, { useEffect, useState, useMemo } from "react";
import { isCalUnlocked } from "../utils/authConstants";
import PasswordGate from "../ui/PasswordGate";
import LoadingState from "../ui/LoadingState";

/* ── Types ── */
interface Player {
  scoreId: string;
  pos: number | string | null;
  name: string;
  club: string;
  grossTotal: number | string | null;
  toPar: number | string | null;
  fed?: string;
  hcpExact?: number;
  hcpPlay?: number;
  course?: string;
  scores?: number[];
}

interface Tournament {
  name: string;
  ccode: string;
  tcode: string;
  series: "tour" | "challenge";
  region: string;
  escalao: string | null;
  num: number;
  playerCount: number;
  players: Player[];
}

interface DriveData {
  lastUpdated: string;
  source: string;
  totalTournaments: number;
  totalPlayers: number;
  totalScorecards: number;
  tournaments: Tournament[];
}

/* ── Constants ── */
const REGIONS = [
  { id: "norte", label: "Norte", emoji: "🔵", color: "#2563eb", bg: "#dbeafe" },
  { id: "tejo", label: "Tejo", emoji: "🟡", color: "#a16207", bg: "#fef3c7" },
  { id: "sul", label: "Sul", emoji: "🟢", color: "#16a34a", bg: "#dcfce7" },
  { id: "madeira", label: "Madeira", emoji: "🟣", color: "#7c3aed", bg: "#ede9fe" },
  { id: "acores", label: "Açores", emoji: "🔴", color: "#dc2626", bg: "#fee2e2" },
];

const ESCALOES = ["Sub 10", "Sub 12", "Sub 14", "Sub 16", "Sub 18"];

const MANUEL_FED = "52884";
const isManuel = (p: Player) =>
  p.fed === MANUEL_FED ||
  (p.name.includes("Manuel") && (p.name.includes("Medeiros") || p.name.includes("Goulartt")));

/* ── Formatting helpers ── */
const fmtToPar = (v: number | string | null): string => {
  if (v == null || v === "") return "–";
  const n = typeof v === "string" ? parseInt(v) : v;
  if (isNaN(n)) return String(v);
  return n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`;
};

const toParColor = (v: number | string | null): string | undefined => {
  if (v == null) return undefined;
  const n = typeof v === "string" ? parseInt(v) : v;
  if (isNaN(n)) return undefined;
  if (n < 0) return "var(--color-good)";
  if (n === 0) return "var(--color-info-alt)";
  return undefined;
};

const posLabel = (pos: number | string | null): string => {
  if (pos == null) return "–";
  return String(pos);
};

const posMedal = (pos: number | string | null): string => {
  const n = typeof pos === "string" ? parseInt(pos) : pos;
  if (n === 1) return "🥇";
  if (n === 2) return "🥈";
  if (n === 3) return "🥉";
  return "";
};

/* ── Region pill ── */
function RegionPill({ regionId }: { regionId: string }) {
  const r = REGIONS.find(x => x.id === regionId);
  if (!r) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700,
      background: r.bg, color: r.color, letterSpacing: "0.03em",
    }}>
      {r.emoji} {r.label}
    </span>
  );
}

/* ── Escalão pill ── */
function EscalaoPill({ escalao }: { escalao: string }) {
  const cls = "p-" + escalao.toLowerCase().replace(/\s+/g, "");
  return <span className={`p p-sm ${cls}`}>{escalao}</span>;
}

/* ── Results table ── */
function ResultsTable({ players }: { players: Player[] }) {
  if (!players.length) {
    return <div className="muted fs-12" style={{ padding: "12px 0" }}>Sem resultados disponíveis.</div>;
  }
  return (
    <div className="table-wrap">
      <table className="dtable">
        <thead>
          <tr>
            <th style={{ width: 32, textAlign: "center" }}>#</th>
            <th>Jogador</th>
            <th>Clube</th>
            <th className="r" style={{ width: 52 }}>Gross</th>
            <th className="r" style={{ width: 52 }}>±Par</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => {
            const bg = isManuel(p) ? "var(--bg-success-subtle, #f0fdf4)" : undefined;
            const medal = posMedal(p.pos);
            return (
              <tr key={p.scoreId || i} style={bg ? { background: bg } : undefined}>
                <td className="fw-800 ta-center" style={{ color: "var(--text-3)", fontSize: 12, width: 32, padding: "5px 4px" }}>
                  {medal || posLabel(p.pos)}
                </td>
                <td style={{ fontWeight: 700, fontSize: 12, paddingLeft: 6, whiteSpace: "nowrap" }}>
                  {p.name}
                  {isManuel(p) && <span style={{ marginLeft: 4, fontSize: 10 }}>⭐</span>}
                </td>
                <td style={{ fontSize: 11, color: "var(--text-3)" }}>{p.club}</td>
                <td className="fw-700 r" style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
                  {p.grossTotal ?? "–"}
                </td>
                <td className="fw-700 r" style={{
                  fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                  color: toParColor(p.toPar),
                }}>
                  {fmtToPar(p.toPar)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Tournament card ── */
function TournamentCard({ t }: { t: Tournament }) {
  return (
    <div className="card" style={{ padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <RegionPill regionId={t.region} />
        {t.escalao && <EscalaoPill escalao={t.escalao} />}
        <span className="fw-700 fs-13" style={{ color: "var(--text)" }}>{t.name}</span>
        <span className="chip" style={{ marginLeft: "auto" }}>{t.playerCount} jogadores</span>
      </div>
      <ResultsTable players={t.players} />
    </div>
  );
}

/* ═══════════════════════════════════════════
   DRIVE TOUR VIEW
   ═══════════════════════════════════════════ */
function DriveTourView({ tournaments }: { tournaments: Tournament[] }) {
  const [regionIdx, setRegionIdx] = useState(0);
  const availableRegions = useMemo(() => {
    const rIds = new Set(tournaments.map(t => t.region));
    return REGIONS.filter(r => rIds.has(r.id));
  }, [tournaments]);

  const region = availableRegions[regionIdx]?.id;
  const regionTourns = useMemo(
    () => tournaments.filter(t => t.region === region).sort((a, b) => b.num - a.num),
    [tournaments, region]
  );

  if (!availableRegions.length) return <div className="muted ta-center" style={{ padding: 24 }}>Sem torneios Drive Tour disponíveis.</div>;

  return (
    <div>
      <div className="escalao-pills" style={{ padding: "8px 12px", flexWrap: "wrap" }}>
        {availableRegions.map((r, i) => {
          const count = tournaments.filter(t => t.region === r.id).reduce((a, t) => a + t.playerCount, 0);
          return (
            <button
              key={r.id}
              className={`tourn-tab tourn-tab-sm${regionIdx === i ? " active" : ""}`}
              onClick={() => setRegionIdx(i)}
              style={regionIdx === i ? {} : { borderColor: r.bg, color: r.color, background: r.bg }}
            >
              {r.emoji} {r.label} ({count})
            </button>
          );
        })}
      </div>
      <div style={{ padding: "0 12px 12px" }}>
        {regionTourns.map(t => (
          <TournamentCard key={`${t.ccode}-${t.tcode}`} t={t} />
        ))}
        {!regionTourns.length && (
          <div className="muted ta-center" style={{ padding: 24 }}>Sem torneios nesta região.</div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   DRIVE CHALLENGE VIEW
   ═══════════════════════════════════════════ */
function DriveChallengeView({ tournaments }: { tournaments: Tournament[] }) {
  const [regionIdx, setRegionIdx] = useState(0);
  const [escIdx, setEscIdx] = useState(0);

  const availableRegions = useMemo(() => {
    const rIds = new Set(tournaments.map(t => t.region));
    return REGIONS.filter(r => rIds.has(r.id));
  }, [tournaments]);

  const region = availableRegions[regionIdx]?.id;
  const regionTourns = useMemo(
    () => tournaments.filter(t => t.region === region),
    [tournaments, region]
  );

  const availableEsc = useMemo(() => {
    const esc = new Set(regionTourns.map(t => t.escalao).filter(Boolean) as string[]);
    return ESCALOES.filter(e => esc.has(e));
  }, [regionTourns]);

  useEffect(() => { setEscIdx(0); }, [regionIdx]);

  const escalao = availableEsc[escIdx];
  const filteredTourns = useMemo(
    () => regionTourns.filter(t => t.escalao === escalao).sort((a, b) => b.num - a.num),
    [regionTourns, escalao]
  );

  if (!availableRegions.length) return <div className="muted ta-center" style={{ padding: 24 }}>Sem torneios Drive Challenge disponíveis.</div>;

  return (
    <div>
      <div className="escalao-pills" style={{ padding: "8px 12px", flexWrap: "wrap" }}>
        {availableRegions.map((r, i) => {
          const count = tournaments.filter(t => t.region === r.id).reduce((a, t) => a + t.playerCount, 0);
          return (
            <button
              key={r.id}
              className={`tourn-tab tourn-tab-sm${regionIdx === i ? " active" : ""}`}
              onClick={() => setRegionIdx(i)}
              style={regionIdx === i ? {} : { borderColor: r.bg, color: r.color, background: r.bg }}
            >
              {r.emoji} {r.label} ({count})
            </button>
          );
        })}
      </div>

      {availableEsc.length > 0 && (
        <div className="escalao-pills" style={{ padding: "0 12px 8px", flexWrap: "wrap" }}>
          {availableEsc.map((e, i) => {
            const count = regionTourns.filter(t => t.escalao === e).reduce((a, t) => a + t.playerCount, 0);
            return (
              <button
                key={e}
                className={`tourn-tab tourn-tab-sm${escIdx === i ? " active" : ""}`}
                onClick={() => setEscIdx(i)}
              >
                {e} ({count})
              </button>
            );
          })}
        </div>
      )}

      <div style={{ padding: "0 12px 12px" }}>
        {filteredTourns.map(t => (
          <TournamentCard key={`${t.ccode}-${t.tcode}`} t={t} />
        ))}
        {!filteredTourns.length && (
          <div className="muted ta-center" style={{ padding: 24 }}>Sem torneios para este escalão.</div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
function DriveContent() {
  const [data, setData] = useState<DriveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<"tour" | "challenge">("tour");

  useEffect(() => {
    fetch("/data/drive-data.json")
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(d => { setData(d as DriveData); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const tourTourns = useMemo(() => data?.tournaments.filter(t => t.series === "tour") ?? [], [data]);
  const challTourns = useMemo(() => data?.tournaments.filter(t => t.series === "challenge") ?? [], [data]);

  if (loading) return <LoadingState />;
  if (error) return (
    <div className="tourn-layout">
      <div className="notice-error" style={{ margin: 16 }}>Erro ao carregar dados DRIVE: {error}</div>
    </div>
  );
  if (!data) return null;

  const tourPlayers = tourTourns.reduce((a, t) => a + t.playerCount, 0);
  const challPlayers = challTourns.reduce((a, t) => a + t.playerCount, 0);
  const regions = new Set(data.tournaments.map(t => t.region)).size;

  return (
    <div className="tourn-layout">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <span className="tourn-toolbar-title">🏁 DRIVE</span>
          <span className="tourn-toolbar-meta">Circuito Regional Juvenil</span>
          <div className="tourn-toolbar-sep" />
          <div className="escalao-pills">
            <button
              className={`tourn-tab tourn-tab-sm${series === "tour" ? " active" : ""}`}
              onClick={() => setSeries("tour")}
            >
              🏌️ Tour ({tourTourns.length})
            </button>
            <button
              className={`tourn-tab tourn-tab-sm${series === "challenge" ? " active" : ""}`}
              onClick={() => setSeries("challenge")}
              style={series === "challenge" ? {} : { background: "#ede9fe", color: "#7c3aed", borderColor: "#ede9fe" }}
            >
              ⚡ Challenge ({challTourns.length})
            </button>
          </div>
        </div>
        <div className="toolbar-right">
          <span className="chip">{data.totalPlayers} jog · {data.totalTournaments} torneios</span>
        </div>
      </div>

      {/* Summary pills */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", flexWrap: "wrap" }}>
        <span className="chip">🏌️ {tourTourns.length} Tour · {tourPlayers} jog</span>
        <span className="chip" style={{ background: "#ede9fe", color: "#7c3aed" }}>⚡ {challTourns.length} Challenge · {challPlayers} jog</span>
        <span className="chip" style={{ background: "#fef3c7", color: "#a16207" }}>📍 {regions} regiões</span>
        <span className="chip" style={{ background: "var(--bg-muted)", color: "var(--text-3)" }}>📅 {data.lastUpdated}</span>
      </div>

      {/* Content */}
      {series === "tour" ? (
        <DriveTourView tournaments={tourTourns} />
      ) : (
        <DriveChallengeView tournaments={challTourns} />
      )}

      {/* Source */}
      <div style={{ padding: "8px 12px", fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>
        Fonte: scoring.datagolf.pt · Actualizado: {data.lastUpdated}
      </div>
    </div>
  );
}

export default function DrivePage() {
  const [unlocked, setUnlocked] = useState(() => isCalUnlocked());
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return <DriveContent />;
}
