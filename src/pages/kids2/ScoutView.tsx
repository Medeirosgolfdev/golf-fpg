/**
 * kids2/ScoutView.tsx
 *
 * /kids2/scout/:tid — field scout. 2 fontes:
 *
 *   1. Torneios canonicos (tid = tournament.id): junior history + tier + vsM
 *      calculados a partir do canonico.
 *   2. Torneios "field-only" (tid = "usk{tcode}"): le directamente
 *      /data/uskids-field.json e cruza nomes dos inscritos com os juniors
 *      canonicos (match por normName + aliases).
 *
 * UI (2026-05-17 rebuild):
 *   - 4 KPI cards no topo (inscritos, paises, tier alto, ja confrontou Manuel)
 *   - Manuel banner quando inscrito + comparacao dele vs todo o field
 *   - Tabs de escalao (com badge Manuel no flight dele)
 *   - Tabela por escalao (quando filter=all renderiza seccao por flight)
 *   - Colunas (simplificado 2026-05): pais, nome, idade, tier, wins,
 *     forma (3 ultimas pos como dots), vs Manuel (avg diff + n confrontos),
 *     H2H, e "Proximos" (outros torneios futuros onde o jogador esta inscrito).
 *     T/Top3/Best foram removidos da tabela — continuam na ficha do jogador.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useJuniorsCanonical, computeTier, computeRanking, getTierLabel, getTierColors,
  getSharedTournamentIds, getSharedFlightTids, countWins, countTop3,
  bestRoundGross,
} from "./data";
import type { CanonicalData, Junior, Tournament, Result, Flight, RankingEntry } from "./data";
import { flag as flagOf } from "../../utils/flagUtils";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import LoadingState from "../../ui/LoadingState";
import EmptyState from "../../ui/EmptyState";
import UiKpiCard from "../../ui/KpiCard";
import { usePasswordGate } from "../../hooks/usePasswordGate";
import PasswordGate from "../../ui/PasswordGate";
import { cachedFetchJson } from "../../data/fetchCache";
import { useUpcomingByJunior, type UpcomingReg } from "./upcomingRegs";
import Kids2SubNav from "./Kids2SubNav";
import { MANUEL_BIRTH_YEAR } from "../../constants/manuel";
import { tpColor } from "../../ui/tournamentPrimitives";
import { fmtToPar, MONTHS_PT } from "../../utils/format";
import { normName } from "../../utils/normName";
import { Pill } from "../../ui/PillBadge";

// ── Tipos para uskids-results.json ───────────────────────────────────
interface UskRsPlayer { nome: string; pais: string; score: number; buracos: number; to_par?: number }
interface UskRsRonda  { ronda: number; leaderboard: UskRsPlayer[] }
interface UskRsEscalao { nome: string; age_group?: number | string; rondas: UskRsRonda[] }
interface UskRsTourn  { t: number; name: string; escaloes: UskRsEscalao[] }
interface UskResultsJson { resultados: UskRsTourn[] }

function fmtRegDate(iso: string): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS_PT[Number(m) - 1] || m}`;
}
function shortTournName(name: string): string {
  return name
    .replace("European Championship", "EC")
    .replace("World Championship", "WC")
    .replace("Venice Open", "Venice")
    .replace("Marco Simone Invitational", "Marco Simone")
    .replace("Rome Classic", "Rome")
    .replace("Irish Open", "Irish")
    .replace("Paris Invitational", "Paris")
    .replace("Belgium Invitational", "Belgium")
    .replace("Red White & Blue Invitational", "RWB")
    .replace("Sandestin Championship", "Sandestin")
    .replace("Desert Shootout", "Desert")
    .replace("Mississippi State Invitational", "MS State")
    .replace("South Carolina State Invitational", "SC State")
    .replace(/Real Club de Golf\s+/, "")
    .replace(/20(\d{2})\b/, "'$1");
}

function shortReg(name: string): string {
  const n = name.replace(/\b20\d{2}\b/g, "").replace(/\s+/g, " ").trim();
  return n.length > 24 ? n.slice(0, 23) + "…" : n;
}
const CIRCUIT_CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  US: { bg: "var(--bg-info-subtle, var(--bg-info))", fg: "var(--color-info-dark, var(--color-navy))", label: "USKids" },
  PT: { bg: "var(--bg-success-subtle, #ecfdf5)", fg: "var(--color-good-dark)", label: "FPG (Portugal)" },
  ES: { bg: "var(--bg-warn-subtle, var(--bg-warn))", fg: "var(--color-warn-dark, var(--color-warn-dark))", label: "RFEG (Espanha)" },
  FR: { bg: "var(--bg-pink, var(--bg-pink))", fg: "var(--color-purple, #6b21a8)", label: "FFG (França)" },
};

// ── Séries USKids: tcode → edições [mais recente primeiro] ───────────
const SERIES_EDITIONS: Record<string, number[]> = {
  "European Championship":     [21131, 18242, 15704, 13568, 8300],
  "World Championship":        [21610, 18124, 15807, 14029, 11604],
  "Venice Open":               [22243, 19418, 16428, 14302, 12229],
  "Rome Classic":              [20175, 16795, 14670, 12578],
  "Marco Simone Invitational": [21080, 18438],
  "Marco Simone":              [21080, 18438],
  "Irish Open":                [21455, 18978, 16020, 13470],
  "Paris Invitational":        [21795, 18975],
  "Belgium Invitational":      [22480],
  "Red White & Blue Invitational": [18719, 16705, 14218],
};

function seriesBase(name: string): string {
  return name.replace(/\s+20\d{2}\b.*$/, "").trim();
}

function prevEditionTcode(tournName: string, currentTcode: number): number | null {
  const base = seriesBase(tournName);
  const editions = SERIES_EDITIONS[base];
  if (!editions || editions.length < 2) return null;
  const idx = editions.indexOf(currentTcode);
  if (idx < 0) return editions[0] !== currentTcode ? editions[0] : (editions[1] ?? null);
  return editions[idx + 1] ?? null;
}

function tournTcode(tid: string): number | null {
  const m1 = tid.match(/^uskids-(\d+)$/);
  if (m1) return parseInt(m1[1], 10);
  const m2 = tid.match(/^usk(\d+)$/);
  if (m2) return parseInt(m2[1], 10);
  return null;
}

const ICON_SCOPE = "\u{1F52D}";
const ICON_DOT = "·";
const ICON_SWORDS = "⚔️";
const ICON_TROPHY = "\u{1F3C6}";
const ICON_EXTERNAL = "↗";

// ── Modelo de ameaça (quão perigoso é o rival para o Manuel) ──────────
// Combina 4 sinais, do mais forte ao mais fraco:
//   1. Confronto directo vs Manuel (vsM) — se o rival costuma bater o Manuel
//      é o sinal decisivo, ponderado pela confiança (nº de confrontos).
//   2. Tier (Elite / Forte / Sólido / ...).
//   3. Forma recente (última posição conhecida).
//   4. Vitórias na carreira.
// Devolve score numérico (sort), nível categórico (chip) e razões (tooltip).
type ThreatLevel = "high" | "med" | "low" | "none";

const THREAT_META: Record<ThreatLevel, { label: string; bg: string; fg: string; border: string }> = {
  high: { label: "Alto",  bg: "var(--bg-danger-strong)", fg: "var(--color-danger-dark)", border: "var(--border-danger)" },
  med:  { label: "Médio", bg: "var(--bg-warn-subtle)",   fg: "var(--color-warn-dark)",   border: "var(--color-amber)" },
  low:  { label: "Baixo", bg: "var(--bg-muted)",         fg: "var(--text-3)",            border: "var(--border-light)" },
  none: { label: "—",     bg: "transparent",             fg: "var(--text-3)",            border: "transparent" },
};

const THREAT_BORDER: Record<ThreatLevel, string> = {
  high: "3px solid var(--color-danger)",
  med:  "3px solid var(--color-amber)",
  low:  "3px solid transparent",
  none: "3px solid transparent",
};

function fmtMargin(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function clampThreat(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

interface ThreatArgs {
  fieldOnly: boolean;
  hasManuel: boolean;
  vsMTotal: number | null;
  vsMCount: number;
  vsMSameFlight: number;
  tier: ReturnType<typeof computeTier>;
  recentPos: number | null;
  wins: number;
}

interface ThreatInfo { score: number; level: ThreatLevel; reasons: string[] }

function computeThreat(a: ThreatArgs): ThreatInfo {
  // Inscritos sem perfil canónico — não há nada para avaliar.
  if (a.fieldOnly) return { score: -1, level: "none", reasons: ["Sem perfil canónico"] };

  const reasons: string[] = [];
  let score = 0;
  let h2hStrong = false;
  let h2hBeatsManuel = false;

  // 1. Confronto directo vs Manuel. vsMTotal = gross(rival) − gross(Manuel),
  //    logo NEGATIVO significa que o rival joga MENOS pancadas → bate o Manuel.
  if (a.hasManuel && a.vsMCount > 0 && a.vsMTotal != null) {
    const margin = -a.vsMTotal; // positivo → rival bate o Manuel
    const conf = clampThreat((a.vsMSameFlight || a.vsMCount) / 4, 0, 1); // 0..1
    score += clampThreat(margin, -15, 15) * (0.6 + 0.4 * conf);
    if (margin > 0.5) {
      h2hBeatsManuel = true;
      reasons.push(`Bate o Manuel em média (${fmtMargin(margin)} pancadas, ${a.vsMCount} confronto${a.vsMCount > 1 ? "s" : ""})`);
      if (margin >= 3) h2hStrong = true;
    } else if (margin < -0.5) {
      reasons.push(`Manuel costuma bater (${fmtMargin(-margin)} pancadas a menos)`);
    } else {
      reasons.push(`Equilibrado com o Manuel (${a.vsMCount} confronto${a.vsMCount > 1 ? "s" : ""})`);
    }
  }

  // 2. Tier.
  const tierPts: Record<string, number> = { elite: 12, strong: 8, solid: 4, developing: 1, beginner: 0 };
  if (a.tier) {
    score += tierPts[a.tier] ?? 0;
    if (a.tier === "elite" || a.tier === "strong") reasons.push(`Tier ${getTierLabel(a.tier)}`);
  }

  // 3. Forma recente.
  if (a.recentPos != null) {
    if (a.recentPos <= 3) { score += 5; reasons.push(`Forma recente forte (#${a.recentPos})`); }
    else if (a.recentPos <= 10) { score += 2; }
  }

  // 4. Vitórias.
  if (a.wins > 0) {
    score += Math.min(a.wins, 5);
    reasons.push(`${a.wins} vitória${a.wins > 1 ? "s" : ""}`);
  }

  // Nível categórico.
  let level: ThreatLevel;
  if (a.tier == null && a.vsMCount === 0 && a.recentPos == null && a.wins === 0) {
    level = "none";
    if (reasons.length === 0) reasons.push("Sem histórico suficiente");
  } else if (h2hStrong || score >= 11) {
    level = "high";
  } else if (h2hBeatsManuel || score >= 5) {
    level = "med";
  } else {
    level = "low";
  }

  return { score, level, reasons };
}

type ScoutKey =
  | "name" | "country" | "age" | "tier"
  | "pos" | "vsM" | "form"
  | "wins" | "hcp" | "threat";

interface ScoutRow {
  junior: Junior;
  flight: Flight;
  result: Result | null;
  age: number | null;
  tier: ReturnType<typeof computeTier>;
  bestPos: number | null;
  recentPos: number | null;
  formPositions: Array<number | null>;
  wins: number;
  top3: number;
  totalTourns: number;
  bestGross: number | null;
  vsMTotal: number | null;
  vsMCount: number;
  vsMSameFlight: number;
  sharedTournNames: { name: string; posRival: number | null; posManuel: number | null }[];
  fieldOnly?: boolean;
  cidade?: string;
  hcp: number | null;
  club: string | null;
  circuits: string[];
  threatScore: number;
  threatLevel: ThreatLevel;
  threatReasons: string[];
}

interface FieldPlayer { nome: string; pais?: string; cidade?: string; firstSeen?: string }
interface FieldEscalao {
  nome: string;
  age_group?: number;
  flight_id?: number;
  inscritos?: number;
  maximo?: number;
  jogadores?: FieldPlayer[] | null;
}
interface FieldTournament {
  t: number;
  name: string;
  date_inicio?: string;
  date_fim?: string;
  rondas?: number;
  campo?: string;
  total_inscritos?: number;
  escaloes?: FieldEscalao[];
}
interface FieldData { gerado_em?: string; torneios?: FieldTournament[] }

function useUskidsField(): FieldData | null {
  const [d, setD] = useState<FieldData | null>(null);
  useEffect(() => {
    let alive = true;
    cachedFetchJson("/data/uskids-field.json")
      .then((data) => { if (alive) setD(data as FieldData); })
      .catch(() => { if (alive) setD(null); });
    return () => { alive = false; };
  }, []);
  return d;
}

function usToIso(s: string | undefined): string {
  if (!s) return "";
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  return m[3] + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
}

interface ScoutTournamentOption { tid: string; name: string }

/** Componente embebível (sem nav) — usado como tab em NextTournaments. */
export function ScoutEmbed({
  tid,
  tournaments,
  onTidChange,
  hideNav,
  escalao,
}: {
  tid: string;
  tournaments?: ScoutTournamentOption[];
  onTidChange?: (tid: string) => void;
  /** Quando true, oculta o header Torneio+Escalão (o pai já tem os seus selectors) */
  hideNav?: boolean;
  /** Escalão do pai (ex: "Boys 12") — sincroniza o flight filter quando hideNav=true */
  escalao?: string;
}) {
  const status = useJuniorsCanonical();
  const field = useUskidsField();

  if (status.kind === "loading") return <LoadingState />;
  if (status.kind === "error") return <EmptyState size="md" message={"Falhou: " + status.error} />;

  const data = status.data;

  const canonical = data.tournamentById.get(tid);
  if (canonical) {
    return <ScoutContent key={tid} data={data} tournament={canonical}
      tournaments={tournaments} currentTid={tid} onTidChange={onTidChange}
      hideNav={hideNav} escalao={escalao}
      onSelect={(jid) => window.open("/kids2/" + jid, "_blank", "noopener")} />;
  }

  const uskMatch = tid.match(/^usk(\d+)$/);
  if (uskMatch) {
    const canonicalFallback = data.tournamentById.get("uskids-" + uskMatch[1]);
    if (canonicalFallback) {
      return <ScoutContent key={tid} data={data} tournament={canonicalFallback}
        tournaments={tournaments} currentTid={tid} onTidChange={onTidChange}
        hideNav={hideNav} escalao={escalao}
        onSelect={(jid) => window.open("/kids2/" + jid, "_blank", "noopener")} />;
    }
    if (field?.torneios) {
      const tcode = parseInt(uskMatch[1], 10);
      const ft = field.torneios.find((x) => x.t === tcode);
      if (ft) {
        const built = buildFieldTournament(ft, data);
        return <ScoutContent key={tid} data={built.data} tournament={built.tournament}
          tournaments={tournaments} currentTid={tid} onTidChange={onTidChange}
          hideNav={hideNav} escalao={escalao}
          onSelect={(jid) => window.open("/kids2/" + jid, "_blank", "noopener")} />;
      }
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <p style={{ color: "var(--text-3)" }}>Torneio <code>{tid}</code> nao encontrado.</p>
    </div>
  );
}

export default function ScoutView() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <ScoutViewContent />;
}

function ScoutViewContent() {
  const params = useParams<{ tid: string }>();
  return (
    <>
      <Kids2SubNav />
      <ScoutEmbed tid={params.tid || ""} />
    </>
  );
}

function buildFieldTournament(ft: FieldTournament, data: CanonicalData): { tournament: Tournament; data: CanonicalData } {
  const dateIso = usToIso(ft.date_inicio);
  const endIso = usToIso(ft.date_fim);

  const augmentedJuniorById = new Map(data.juniorById);
  const flights: Flight[] = [];

  for (const esc of ft.escaloes || []) {
    const results: Result[] = [];
    const players = esc.jogadores || [];
    for (const p of players) {
      const k = normName(p.nome);
      if (!k) continue;
      const candidates = data.juniorByNormName.get(k) || [];
      let junior: Junior | null = candidates.length > 0 ? candidates[0] : null;
      if (!junior) {
        const syntheticId = "_field:" + ft.t + ":" + k;
        junior = {
          id: syntheticId,
          canonicalName: p.nome,
          country: p.pais || undefined,
          nationality: p.pais || undefined,
          sources: {},
          tournamentIds: [],
          _match: { confidence: "manual", evidence: ["uskids-field"], mergedFromSources: ["uskids-field"] },
        } as Junior;
        augmentedJuniorById.set(syntheticId, junior);
      }
      results.push({
        juniorId: junior.id,
        playerNameInSource: p.nome,
        pos: null,
        status: "OK",
      } as Result);
      _fieldExtras.set(junior.id, { cidade: p.cidade });
    }
    flights.push({
      flightKey: "esc_" + (esc.flight_id ?? esc.age_group ?? esc.nome),
      label: esc.nome,
      ageMin: null,
      ageMax: null,
      sex: "M",
      par: [],
      yards: [],
      fieldSize: typeof esc.inscritos === "number" ? esc.inscritos : results.length,
      results,
    });
  }

  const tournament: Tournament = {
    id: "usk" + ft.t,
    sourceId: "uskids",
    sourceKey: String(ft.t),
    name: ft.name,
    shortName: ft.name,
    date: dateIso,
    startDate: dateIso,
    endDate: endIso,
    course: ft.campo || "",
    parTotal: 0,
    holesPerRound: 18,
    rounds: ft.rondas || 1,
    flights,
    links: [{ label: "USKids", url: "https://www.signupanytime.com/plugins/links/admin/Links.aspx?ax=1129&t=" + ft.t }],
  };

  return {
    tournament,
    data: { ...data, juniorById: augmentedJuniorById },
  };
}

const _fieldExtras = new Map<string, { cidade?: string }>();

// ═══════════════════════════════════════════════════════════════════
//   FieldStrengthPanel — distribuição de tiers + dificuldade
// ═══════════════════════════════════════════════════════════════════

const TIER_BAR: Record<string, { bar: string; label: string; chip: string }> = {
  elite:      { bar: "var(--tier-bad)",  label: "Elite",      chip: "var(--bg-danger-subtle)" },
  strong:     { bar: "var(--tier-weak)", label: "Forte",      chip: "var(--bg-warn-subtle)" },
  solid:      { bar: "var(--tier-fair)", label: "Sólido",     chip: "var(--bg-info-subtle)" },
  developing: { bar: "var(--tier-good)", label: "Jovem",      chip: "var(--bg-success-subtle)" },
  beginner:   { bar: "var(--text-3)",    label: "Estreante",  chip: "var(--bg-muted)" },
};

function FieldStrengthPanel({ rows, label }: { rows: ScoutRow[]; label?: string }) {
  const total = rows.length;
  if (total === 0) return null;

  const counts: Record<string, number> = { elite: 0, strong: 0, solid: 0, developing: 0, beginner: 0, unknown: 0 };
  const countryMap = new Map<string, number>();
  for (const r of rows) {
    const t = r.tier as string | null;
    counts[t || "unknown"] = (counts[t || "unknown"] || 0) + 1;
    const c = (r.junior.country || r.junior.nationality || "").toUpperCase();
    if (c) countryMap.set(c, (countryMap.get(c) || 0) + 1);
  }

  const topCountries = [...countryMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  const known = total - counts.unknown;
  const knownPct = (known / total) * 100;
  const eliteStrongPct = ((counts.elite + counts.strong) / total) * 100;

  let diffLabel = "Campo Local";
  let diffColor = "var(--text-3)";
  if (counts.elite / total >= 0.10 && knownPct >= 40) {
    diffLabel = "Campo de Elite"; diffColor = "#dc2626";
  } else if (eliteStrongPct >= 20 && knownPct >= 35) {
    diffLabel = "Campo Muito Competitivo"; diffColor = "#f59e0b";
  } else if (eliteStrongPct >= 10 && knownPct >= 25) {
    diffLabel = "Campo Competitivo"; diffColor = "var(--color-info)";
  } else if (knownPct >= 25) {
    diffLabel = "Campo Misto"; diffColor = "var(--color-good-dark)";
  }

  const TIERS = ["elite", "strong", "solid", "developing", "beginner"] as const;

  return (
    <div style={{ flex: 1, minWidth: 220, padding: "10px 12px", background: "var(--bg-card, var(--bg-muted))",
                  borderRadius: 8, border: "1px solid var(--border-light)" }}>
      {label && <div style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{label}</div>}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ minWidth: 150 }}>
        <div style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Dificuldade</div>
        <div style={{ fontSize: "var(--fs-15)", fontWeight: 700, color: diffColor }}>{diffLabel}</div>
        <div style={{ fontSize: "var(--fs-11)", color: "var(--text-3)", marginTop: 3 }}>{Math.round(knownPct)}% com histórico USKids</div>
      </div>

      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Distribuição de Tier</div>
        <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", gap: 1, background: "var(--border-light)" }}>
          {TIERS.map((tier) => {
            const n = counts[tier] || 0;
            if (n === 0) return null;
            return (
              <div key={tier} title={`${TIER_BAR[tier].label}: ${n} (${Math.round((n / total) * 100)}%)`}
                   style={{ background: TIER_BAR[tier].bar, flex: n, minWidth: 2 }} />
            );
          })}
          {counts.unknown > 0 && (
            <div title={`Sem perfil: ${counts.unknown}`} style={{ background: "#e2e8f0", flex: counts.unknown, minWidth: 2 }} />
          )}
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
          {TIERS.filter(t => (counts[t] || 0) > 0).map((tier) => (
            <span key={tier} style={{ fontSize: "var(--fs-10)", padding: "1px 6px", borderRadius: 3, background: TIER_BAR[tier].chip, fontWeight: 600, color: "var(--text-2)" }}>
              {TIER_BAR[tier].label} {counts[tier]}
            </span>
          ))}
          {counts.unknown > 0 && (
            <span style={{ fontSize: "var(--fs-10)", padding: "1px 6px", borderRadius: 3, background: "var(--bg-muted)", color: "var(--text-3)", fontWeight: 600 }}>
              Novos {counts.unknown}
            </span>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Países ({countryMap.size})</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px" }}>
          {topCountries.map(([cc, n]) => (
            <span key={cc} style={{ fontSize: "var(--fs-12)", whiteSpace: "nowrap" }}>
              {flagOf(cc)} {cc} <span style={{ color: "var(--text-3)", fontSize: "var(--fs-11)" }}>×{n}</span>
            </span>
          ))}
        </div>
      </div>
      </div>{/* flex inner */}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//   PreviousEditionPanel — resultados da edição anterior
// ═══════════════════════════════════════════════════════════════════

function PreviousEditionPanel({ prevTcode, resultsData }: {
  prevTcode: number;
  resultsData: UskResultsJson | null;
}) {
  if (!resultsData) return null;
  const prevEntry = resultsData.resultados.find(r => r.t === prevTcode);
  if (!prevEntry) return null;

  // Filtrar escalões Boys 9-13 (relevantes para a análise)
  const boysRe = /boys?\s*(9|10|11|12|13)/i;
  const escaloes = prevEntry.escaloes
    .filter(e => boysRe.test(e.nome || e.age_group || ""))
    .sort((a, b) => {
      const numOf = (e: typeof a) => parseInt((e.nome || e.age_group || "").match(/\d+/)?.[0] ?? "99", 10);
      return numOf(a) - numOf(b);
    });
  const toShow = escaloes.length > 0 ? escaloes : prevEntry.escaloes.slice(0, 4);

  return (
    <details style={{ marginBottom: 14 }} open>
      <summary style={{ cursor: "pointer", fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--text-2)",
                        padding: "8px 12px", background: "var(--bg-muted)", borderRadius: 6,
                        listStyle: "none", display: "flex", alignItems: "center", gap: 8 }}>
        <span>📋</span>
        <span>Edição anterior: <strong style={{ color: "var(--text)" }}>{prevEntry.name}</strong></span>
        <span style={{ marginLeft: "auto", fontSize: "var(--fs-11)", color: "var(--text-3)" }}>▼</span>
      </summary>
      <div style={{ paddingTop: 10, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        {toShow.map((esc) => {
          if (esc.rondas.length === 0) return null;
          // Acumular to_par de TODAS as rondas por jogador (nome normalizado)
          const totals = new Map<string, { nome: string; pais: string; tp: number }>();
          for (const ronda of esc.rondas) {
            for (const p of ronda.leaderboard) {
              const key = p.nome.trim().toLowerCase();
              const prev = totals.get(key);
              const tp = p.to_par ?? 0;
              if (prev) { prev.tp += tp; }
              else { totals.set(key, { nome: p.nome, pais: p.pais, tp }); }
            }
          }
          const top = [...totals.values()]
            .sort((a, b) => a.tp - b.tp)
            .slice(0, 10);
          return (
            <div key={esc.nome} style={{ minWidth: 190, flex: 1 }}>
              <div style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--text-2)",
                            textTransform: "uppercase", letterSpacing: 1, marginBottom: 5,
                            borderBottom: "1px solid var(--border-light)", paddingBottom: 3,
                            display: "flex", alignItems: "center", gap: 6 }}>
                {esc.nome}
                {esc.age_group != null && (
                  <a href={`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${prevTcode}`}
                     target="_blank" rel="noopener noreferrer"
                     style={{ fontSize: "var(--fs-10)", fontWeight: 400, textTransform: "none",
                              letterSpacing: 0, color: "var(--color-info)", lineHeight: 1 }}
                     title="Ver resultados no signupanytime">
                    ↗
                  </a>
                )}
              </div>
              <table style={{ borderCollapse: "collapse", fontSize: "var(--fs-12)", width: "100%" }}>
                <tbody>
                  {top.map((p, i) => (
                    <tr key={i} style={{ borderBottom: i < top.length - 1 ? "1px solid var(--border-light)" : "none" }}>
                      <td style={{ padding: "2px 5px 2px 0", color: "var(--text-3)", fontVariantNumeric: "tabular-nums", textAlign: "right", minWidth: 18 }}>{i + 1}</td>
                      <td style={{ padding: "2px 4px" }}>{flagOf(p.pais)}</td>
                      <td style={{ padding: "2px 0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{p.nome}</td>
                      <td style={{ padding: "2px 0 2px 8px", fontWeight: 600, fontVariantNumeric: "tabular-nums", textAlign: "right", whiteSpace: "nowrap",
                                   color: tpColor(p.tp) ?? "var(--text-2)" }}>
                        {fmtToPar(p.tp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        {toShow.length === 0 && (
          <div style={{ fontSize: "var(--fs-12)", color: "var(--text-3)", padding: "8px 0" }}>
            Sem escalões Boys disponíveis nesta edição.
          </div>
        )}
      </div>
    </details>
  );
}

// ═══════════════════════════════════════════════════════════════════
//   ScoutContent — vista principal
// ═══════════════════════════════════════════════════════════════════

function ScoutContent({ data, tournament, onSelect, tournaments, currentTid, onTidChange, hideNav, escalao }: {
  data: CanonicalData; tournament: Tournament; onSelect: (jid: string) => void;
  tournaments?: ScoutTournamentOption[];
  currentTid?: string;
  onTidChange?: (tid: string) => void;
  hideNav?: boolean;
  escalao?: string;
}) {
  const manuel = data.manuel;
  const today = new Date().toISOString().slice(0, 10);
  const tDate = tournament.date || tournament.startDate || "";
  const isFuture = tDate > today;
  const isFieldOnlySource = tournament.id.startsWith("usk");

  // Ranking percentil por coorte — memoizado (O(n) sobre todos os juniors).
  // Usa data.juniors (array estável do canonical) para comparar globalmente.
  const ranking = useMemo<Map<string, RankingEntry>>(
    () => computeRanking(data.juniors, data.tournamentById),
    [data.juniors, data.tournamentById],
  );

  // Resultados históricos (edição anterior)
  const [resultsData, setResultsData] = useState<UskResultsJson | null>(null);
  useEffect(() => {
    cachedFetchJson("/data/uskids-results.json")
      .then(d => setResultsData(d as UskResultsJson))
      .catch(() => {});
  }, []);

  const prevTcode = useMemo(() => {
    const tcode = tournTcode(tournament.id);
    if (!tcode) return null;
    return prevEditionTcode(tournament.name || tournament.shortName || "", tcode);
  }, [tournament]);

  // Inscrições futuras por jogador (USKids + FPG) — para a coluna "Próximos".
  const upcoming = useUpcomingByJunior(data);
  const currentUskTcode = tournament.id.startsWith("usk") ? tournament.id.slice(3) : null;

  const manuelFlightKey = useMemo(() => {
    if (!manuel) return null;
    const f = tournament.flights.find((ff) => ff.results.some((r) => r.juniorId === manuel.id));
    return f?.flightKey || null;
  }, [tournament, manuel]);

  // Escalão actual do Manuel por ano de nascimento (ex: Boys 12 em 2026)
  const manuelAge = new Date().getFullYear() - MANUEL_BIRTH_YEAR;
  const defaultFlightKey = useMemo(() => {
    if (manuelFlightKey) return manuelFlightKey;
    const match = tournament.flights.find((f) => new RegExp(`boys\\s*${manuelAge}\\b`, "i").test(f.label));
    return match?.flightKey || "all";
  }, [manuelFlightKey, tournament.flights, manuelAge]);

  const [flightFilter, setFlightFilter] = useState<string>(defaultFlightKey);

  // Quando embebido no pai (hideNav=true), sincronizar o flight com o escalão seleccionado no pai.
  useEffect(() => {
    if (!hideNav || !escalao) return;
    const match = tournament.flights.find(
      (f) => f.label === escalao || f.label.startsWith(escalao + " ") || f.label.startsWith(escalao + "("),
    );
    if (match) setFlightFilter(match.flightKey);
  }, [hideNav, escalao, tournament.flights]);

  const allRows = useMemo<ScoutRow[]>(() => {
    const out: ScoutRow[] = [];
    for (const f of tournament.flights) {
      for (const r of f.results) {
        const junior = data.juniorById.get(r.juniorId);
        if (!junior) continue;
        if (manuel && junior.id === manuel.id) continue;

        const isFieldOnly = junior.id.startsWith("_field:");
        const cidade = isFieldOnly ? _fieldExtras.get(junior.id)?.cidade : undefined;

        let age: number | null = null;
        if (junior.dob) {
          const [y, m, d] = junior.dob.split("-").map(Number);
          if (y && m && d) {
            const tNow = new Date();
            age = tNow.getFullYear() - y;
            if (tNow.getMonth() + 1 < m || (tNow.getMonth() + 1 === m && tNow.getDate() < d)) age--;
          }
        }

        let bestPos: number | null = null;
        const positionsByDate: Array<{ pos: number | null; date: string }> = [];
        for (const tid2 of junior.tournamentIds) {
          if (tid2 === tournament.id) continue;
          const t2 = data.tournamentById.get(tid2);
          if (!t2) continue;
          for (const f2 of t2.flights) {
            const r2 = f2.results.find((x) => x.juniorId === junior.id);
            if (!r2) continue;
            const pos2 = typeof r2.pos === "number" ? r2.pos : null;
            const d2 = t2.date || t2.startDate || "";
            positionsByDate.push({ pos: pos2, date: d2 });
            if (pos2 != null && (bestPos === null || pos2 < bestPos)) bestPos = pos2;
          }
        }
        positionsByDate.sort((a, b) => b.date.localeCompare(a.date));
        const recentPos = positionsByDate[0]?.pos ?? null;
        const formPositions: Array<number | null> = positionsByDate.slice(0, 3).map((x) => x.pos);
        while (formPositions.length < 3) formPositions.push(null);

        const wins = isFieldOnly ? 0 : countWins(junior, data.tournamentById);
        const top3 = isFieldOnly ? 0 : countTop3(junior, data.tournamentById);
        const totalTourns = junior.tournamentIds.length;
        const bg = isFieldOnly ? null : bestRoundGross(junior, data.tournamentById);
        const bestGross = bg?.gross ?? null;

        let vsMTotal: number | null = null;
        let vsMCount = 0;
        let vsMSameFlight = 0;
        const sharedTournNames: { name: string; posRival: number | null; posManuel: number | null }[] = [];
        if (manuel && !isFieldOnly) {
          const shared = getSharedTournamentIds(junior, manuel);
          let sum = 0; let n = 0;
          for (const stid of shared) {
            const t2 = data.tournamentById.get(stid);
            if (!t2) continue;
            let hadFlight = false;
            let posRival: number | null = null;
            let posManuel: number | null = null;
            for (const f2 of t2.flights) {
              const rJ = f2.results.find((x) => x.juniorId === junior.id);
              const rM = f2.results.find((x) => x.juniorId === manuel.id);
              if (rJ?.totalGross != null && rM?.totalGross != null) {
                sum += rJ.totalGross - rM.totalGross;
                n++;
                hadFlight = true;
                if (rJ.pos != null) posRival = rJ.pos;
                if (rM.pos != null) posManuel = rM.pos;
              }
            }
            // chips: excluir o torneio actual (óbvio e redundante)
            if (hadFlight && stid !== tournament.id) {
              const tname = t2.name || t2.shortName || stid;
              sharedTournNames.push({ name: shortTournName(tname), posRival, posManuel });
            }
          }
          if (n > 0) { vsMTotal = sum / n; vsMCount = n; }
          vsMSameFlight = getSharedFlightTids(junior, manuel, data.tournamentById).length;
        }

        const src = junior.sources || {};
        const hcp = src.fpg?.hcpExact ?? src.rfeg?.hcp ?? src.ffgolf?.hcp ?? null;
        const club = junior.club || src.fpg?.club || src.rfeg?.club || src.ffgolf?.club || null;
        const circuits: string[] = [];
        if (src.uskids) circuits.push("US");
        if (src.fpg) circuits.push("PT");
        if (src.rfeg) circuits.push("ES");
        if (src.ffgolf) circuits.push("FR");

        const tier = isFieldOnly ? null : computeTier(junior, data.tournamentById, ranking);
        const threat = computeThreat({
          fieldOnly: isFieldOnly,
          hasManuel: !!manuel,
          vsMTotal, vsMCount, vsMSameFlight,
          tier, recentPos, wins,
        });

        out.push({
          junior, flight: f,
          result: isFuture ? null : r,
          age,
          tier,
          bestPos, recentPos, formPositions,
          wins, top3, totalTourns, bestGross,
          vsMTotal, vsMCount, vsMSameFlight, sharedTournNames,
          fieldOnly: isFieldOnly,
          cidade,
          hcp, club, circuits,
          threatScore: threat.score,
          threatLevel: threat.level,
          threatReasons: threat.reasons,
        });
      }
    }
    const seen = new Set<string>();
    return out.filter((r) => {
      if (seen.has(r.junior.id)) return false;
      seen.add(r.junior.id);
      return true;
    });
  }, [data, tournament, manuel, isFuture]);

  const rows = useMemo<ScoutRow[]>(
    () => flightFilter === "all" ? allRows : allRows.filter((r) => r.flight.flightKey === flightFilter),
    [allRows, flightFilter],
  );

  const kpis = useMemo(() => {
    // KPIs sobre o escalão seleccionado (rows), não o torneio inteiro (allRows)
    const selectedFlightHasManuel = manuel && (
      flightFilter === "all"
        ? tournament.flights.some((f) => f.results.some((r) => r.juniorId === manuel.id))
        : tournament.flights.find((f) => f.flightKey === flightFilter)?.results.some((r) => r.juniorId === manuel.id) ?? false
    );
    const totalInscritos = rows.length + (selectedFlightHasManuel ? 1 : 0);
    const fieldOnlyCount = rows.filter((r) => r.fieldOnly).length;
    const matchedCount = rows.length - fieldOnlyCount;
    const countries = new Set<string>();
    for (const r of rows) {
      const c = r.junior.country || r.junior.nationality;
      if (c) countries.add(c.toUpperCase());
    }
    const withManuelHistory = rows.filter((r) => r.vsMCount > 0).length;
    const eliteCount = rows.filter((r) => r.tier === "elite" || r.tier === "strong").length;
    return {
      totalInscritos, matchedPct: totalInscritos > 0 ? Math.round((matchedCount / totalInscritos) * 100) : 0,
      countries: countries.size, withManuelHistory, eliteCount, fieldOnlyCount, matchedCount,
      manuelInField: !!selectedFlightHasManuel,
    };
  }, [rows, flightFilter, manuel, tournament]);

  // Quando o Manuel está inscrito, o que interessa é a ameaça → ordenar por
  // ela (mais perigoso primeiro). Caso contrário, mantém o default histórico.
  const manuelInField = manuelFlightKey !== null;
  const { sortKey, sortDir, toggleSort } = useSort<ScoutKey>(
    manuelInField ? "threat" : (isFuture ? "tier" : "pos"),
    manuelInField ? "desc" : "asc",
    {
      name: "asc", country: "asc", age: "asc", tier: "asc",
      pos: "asc", vsM: "asc", form: "asc",
      wins: "desc", hcp: "asc", threat: "desc",
    });

  const sorted = useMemo(() => {
    const arr = [...rows];
    const sign = sortDir === "asc" ? 1 : -1;
    const TIER_RANK: Record<string, number> = { elite: 0, strong: 1, solid: 2, developing: 3, beginner: 4 };
    const safe = (v: unknown) => (typeof v === "number" ? v : Number.POSITIVE_INFINITY);
    arr.sort((a, b) => {
      switch (sortKey) {
        case "name":        return sign * a.junior.canonicalName.localeCompare(b.junior.canonicalName);
        case "country":     return sign * ((a.junior.country || "").localeCompare(b.junior.country || ""));
        case "age":         return sign * (safe(a.age) - safe(b.age));
        case "tier":        return sign * ((TIER_RANK[a.tier || "beginner"] ?? 5) - (TIER_RANK[b.tier || "beginner"] ?? 5));
        case "pos":         return sign * (safe(a.result?.pos) - safe(b.result?.pos));
        case "vsM":         return sign * (safe(a.vsMTotal) - safe(b.vsMTotal));
        case "form":        return sign * (safe(a.recentPos) - safe(b.recentPos));
        case "wins":        return sign * (b.wins - a.wins);
        case "hcp":         return sign * (safe(a.hcp) - safe(b.hcp));
        case "threat":      return sign * (a.threatScore - b.threatScore);
        default: return 0;
      }
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const manuelStats = useMemo(() => {
    if (!manuel || !kpis.manuelInField) return null;
    const rivalsWithHistory = allRows.filter((r) =>
      r.flight.flightKey === manuelFlightKey && r.vsMCount > 0
    );
    const rivalsBeatManuelOnAvg = rivalsWithHistory.filter((r) => (r.vsMTotal ?? 0) < 0).length;
    const flightFieldSize = manuelFlightKey
      ? tournament.flights.find((f) => f.flightKey === manuelFlightKey)?.results.length || 0
      : 0;
    return { flightFieldSize, rivalsWithHistory: rivalsWithHistory.length, rivalsBeatManuelOnAvg };
  }, [manuel, kpis.manuelInField, manuelFlightKey, allRows, tournament]);

  return (
    <>
      <div>
      {/* ── Barra de navegação estilo Rivais (oculta quando embebido no pai) ── */}
      {!hideNav && <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--fs-12)", color: "var(--text-3)", fontWeight: 500 }}>Torneio</span>
        {tournaments && tournaments.length > 0 ? (
          <select
            className="select fs-13"
            value={currentTid || ""}
            onChange={(e) => onTidChange?.(e.target.value)}
          >
            {tournaments.map((t) => (
              <option key={t.tid} value={t.tid}>{t.name}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--text)" }}>
            {tournament.name || tournament.shortName || tournament.id}
          </span>
        )}

        {tournament.flights.length > 1 && (
          <>
            <span style={{ fontSize: "var(--fs-12)", color: "var(--text-3)", fontWeight: 500 }}>Escalão</span>
            <select className="select fs-13" value={flightFilter} onChange={(e) => setFlightFilter(e.target.value)}>
              <option value="all">Todos ({allRows.length})</option>
              {tournament.flights.map((f) => {
                const isManuelFlight = !!manuel && f.results.some((r) => r.juniorId === manuel.id);
                return (
                  <option key={f.flightKey} value={f.flightKey}>
                    {f.label} ({f.results.length}){isManuelFlight ? " ⚔️" : ""}
                  </option>
                );
              })}
            </select>
          </>
        )}

        {/* Meta: data · campo · badges + link directo */}
        <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginLeft: 4 }}>
          {tDate && <span style={{ fontSize: "var(--fs-12)", color: "var(--text-3)" }}>{ICON_DOT} {fmtDate(tDate)}</span>}
          {tournament.course && <span style={{ fontSize: "var(--fs-12)", color: "var(--text-3)" }}>{ICON_DOT} {tournament.course}</span>}
          {isFuture
            ? <Pill style={{ fontSize: "var(--fs-11)", padding: "2px 8px", borderRadius: "var(--radius)", background: "var(--bg-info-subtle, var(--bg-info))", color: "var(--color-info-dark, var(--color-navy))" }}>FUTURO</Pill>
            : <Pill style={{ fontSize: "var(--fs-11)", padding: "2px 8px", borderRadius: "var(--radius)", background: "var(--bg-muted)", color: "var(--text-2)" }}>HISTORICO</Pill>
          }
          {isFieldOnlySource && (
            <span title="Inscritos do uskids-field.json"
                  style={{ fontSize: "var(--fs-10)", padding: "1px 6px", borderRadius: 3, background: "var(--bg-muted)", color: "var(--text-3)", border: "1px solid var(--border-light)" }}>
              USKids field
            </span>
          )}
          {tournament.links?.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
               style={{ fontSize: "var(--fs-12)", color: "var(--color-info)", marginLeft: 2 }}>
              {l.label} {ICON_EXTERNAL}
            </a>
          ))}
        </span>
      </div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiBox label="Inscritos" value={String(kpis.totalInscritos)} sub={isFieldOnlySource && kpis.fieldOnlyCount > 0
          ? kpis.matchedCount + " c/ perfil · " + kpis.fieldOnlyCount + " novos"
          : "em " + tournament.flights.length + " escal" + (tournament.flights.length === 1 ? "ao" : "oes")} />
        <KpiBox label="Paises" value={String(kpis.countries)} sub="bandeiras distintas" />
        <KpiBox label="Tier alto" value={String(kpis.eliteCount)} sub="Elite + Forte Competidor" emphasis={kpis.eliteCount > 0 ? "warn" : undefined} />
        <KpiBox label="Ja confrontou Manuel" value={String(kpis.withManuelHistory)}
                sub={kpis.manuelInField ? "vao estar no mesmo torneio" : "Manuel nao inscrito"}
                emphasis={kpis.withManuelHistory > 0 ? "good" : undefined} />
      </div>

      {flightFilter === "all" && tournament.flights.length > 1 ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {tournament.flights.map(f => {
            const flightRows = allRows.filter(r => r.flight.flightKey === f.flightKey);
            return <FieldStrengthPanel key={f.flightKey} rows={flightRows} label={f.label} />;
          })}
        </div>
      ) : (
        <FieldStrengthPanel rows={rows} />
      )}

      {kpis.manuelInField && manuel && manuelStats && (
        <div style={{
          marginTop: 14, marginBottom: 14, padding: "10px 14px",
          background: "var(--bg-success-subtle, #ecfdf5)",
          border: "1px solid var(--border-success, #97c459)",
          borderRadius: 8, display: "flex", alignItems: "center", gap: 16,
        }}>
          <span style={{ fontSize: "var(--fs-18)", flexShrink: 0 }}>{ICON_SWORDS}</span>
          <div style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <span style={{ fontWeight: 700, color: "var(--color-good-dark)", fontSize: "var(--fs-13)" }}>
              Manuel inscrito {manuelFlightKey ? "no " + (tournament.flights.find((f) => f.flightKey === manuelFlightKey)?.label || "") : ""}
            </span>
            <span style={{ fontSize: "var(--fs-13)", color: "var(--color-good-dark)", marginLeft: 10 }}>
              {manuelStats.flightFieldSize} inscritos
              {" "}{ICON_DOT} {manuelStats.rivalsWithHistory} já cruzaram
              {manuelStats.rivalsWithHistory > 0 && <>{" "}{ICON_DOT} {manuelStats.rivalsBeatManuelOnAvg} com média superior</>}
            </span>
          </div>
          <Link to={"/kids2/" + manuel.id}
                style={{ fontSize: "var(--fs-12)", padding: "5px 10px", borderRadius: 6,
                         background: "var(--color-good-dark)", color: "var(--bg)",
                         textDecoration: "none", fontWeight: 600 }}>
            Ver perfil do Manuel {ICON_EXTERNAL}
          </Link>
        </div>
      )}

      {isFieldOnlySource && kpis.fieldOnlyCount > 0 && (
        <div style={{ background: "var(--bg-warn-subtle, var(--bg-warn))", color: "var(--color-warn-dark, var(--color-warn-dark))",
                      padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: "var(--fs-12)" }}>
          {kpis.fieldOnlyCount} inscritos sem perfil canonico no nosso sistema (apenas nome + pais).
          Os scores historicos, tier, wins e diff vs Manuel nao estao disponiveis para estes.
        </div>
      )}

      {prevTcode && (
        <PreviousEditionPanel prevTcode={prevTcode} resultsData={resultsData} />
      )}


      {flightFilter === "all" && tournament.flights.length > 1 ? (
        tournament.flights.map((f) => {
          const flightRows = sorted.filter((r) => r.flight.flightKey === f.flightKey);
          if (flightRows.length === 0) return null;
          const isManuelFlight = !!manuel && f.results.some((r) => r.juniorId === manuel.id);
          return (
            <div key={f.flightKey} style={{ marginBottom: 18 }}>
              <FlightHeader flight={f} isManuelFlight={isManuelFlight} count={flightRows.length} />
              <ScoutTable
                rows={flightRows} manuel={manuel} isFuture={isFuture}
                sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort}
                onSelect={onSelect} hideFlight
                upcoming={upcoming} currentUskTcode={currentUskTcode}
              />
            </div>
          );
        })
      ) : (
        <ScoutTable
          rows={sorted} manuel={manuel} isFuture={isFuture}
          sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort}
          onSelect={onSelect}
          upcoming={upcoming} currentUskTcode={currentUskTcode}
        />
      )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//   Sub-componentes
// ═══════════════════════════════════════════════════════════════════

/* Adaptador fino → delega na definição única UiKpiCard (realce por ênfase). */
function KpiBox({ label, value, sub, emphasis }: {
  label: string; value: string; sub?: string;
  emphasis?: "good" | "warn";
}) {
  const color = emphasis === "good" ? "var(--color-good-dark)"
    : emphasis === "warn" ? "var(--color-warn-dark, var(--color-warn-dark))"
    : undefined;
  const border = emphasis === "good" ? "var(--color-good)"
    : emphasis === "warn" ? "var(--color-amber, var(--color-amber))"
    : undefined;
  return <UiKpiCard label={label} value={value} sub={sub} color={color} accentBorder={border} />;
}

function FlightHeader({ flight, isManuelFlight, count }: {
  flight: Flight; isManuelFlight: boolean; count: number;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6, padding: "6px 4px",
      borderBottom: "2px solid " + (isManuelFlight ? "var(--color-good-dark)" : "var(--border)"),
    }}>
      <span style={{ fontSize: "var(--fs-15)", fontWeight: 700, color: "var(--text)" }}>{flight.label}</span>
      <span style={{ fontSize: "var(--fs-12)", color: "var(--text-3)" }}>{ICON_DOT} {count} c/ perfil</span>
      {typeof flight.fieldSize === "number" && flight.fieldSize > count && (
        <span style={{ fontSize: "var(--fs-12)", color: "var(--text-3)" }}>{ICON_DOT} {flight.fieldSize} total</span>
      )}
      {isManuelFlight && (
        <Pill style={{ fontSize: "var(--fs-11)", padding: "2px 8px", borderRadius: "var(--radius)", background: "var(--bg-success-subtle, #ecfdf5)", color: "var(--color-good-dark)" }}>
          {ICON_SWORDS} Manuel
        </Pill>
      )}
    </div>
  );
}

function ScoutTable({ rows, manuel, isFuture, sortKey, sortDir, toggleSort, onSelect, hideFlight, upcoming, currentUskTcode }: {
  rows: ScoutRow[]; manuel: Junior | null; isFuture: boolean;
  sortKey: ScoutKey; sortDir: "asc" | "desc"; toggleSort: (k: ScoutKey) => void;
  onSelect: (jid: string) => void;
  hideFlight?: boolean;
  upcoming?: Map<string, UpcomingReg[]> | null;
  currentUskTcode?: string | null;
}) {
  if (rows.length === 0) {
    return <div style={{ padding: 20, textAlign: "center", color: "var(--text-3)", fontSize: "var(--fs-13)" }}>
      Sem jogadores neste escalao.
    </div>;
  }
  return (
    <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, overflowX: "auto" }}>
      <table className="dtable">
        <thead style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
          <tr>
            <SortableHdr<ScoutKey> k="country"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={thStyle}>Pais</SortableHdr>
            <SortableHdr<ScoutKey> k="name"        sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={thStyle}>Nome</SortableHdr>
            <SortableHdr<ScoutKey> k="threat"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 92 }} title="Ameaça ao Manuel — combina confronto directo, tier, forma recente e vitórias">{ICON_SWORDS} Ameaça</SortableHdr>
            <SortableHdr<ScoutKey> k="age"         sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, textAlign: "center", width: 50 }}>Idade</SortableHdr>
            <SortableHdr<ScoutKey> k="tier"        sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 80 }}>Tier ▲</SortableHdr>
            <SortableHdr<ScoutKey> k="hcp"         sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, textAlign: "center", width: 56 }} title="Handicap (PT / Espanha / França)">HCP</SortableHdr>
            <SortableHdr<ScoutKey> k="wins"        sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, textAlign: "center", width: 48 }}>{ICON_TROPHY}</SortableHdr>
            <th style={{ ...thStyle, width: 90, textAlign: "center" }} title="Ultimas 3 posicoes (mais recente a esquerda)">Forma</th>
            {!isFuture && <SortableHdr<ScoutKey> k="pos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 60, textAlign: "center" }}>Pos</SortableHdr>}
            {manuel && <SortableHdr<ScoutKey> k="vsM" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 100, textAlign: "right" }}>vs M (media)</SortableHdr>}
            {manuel && <th style={{ ...thStyle, width: 56, textAlign: "center" }} title="Confrontos no mesmo flight">{ICON_SWORDS}H2H</th>}
            <th style={{ ...thStyle, width: 96 }} title="Circuitos onde compete">Circuitos</th>
            <th style={{ ...thStyle, minWidth: 160 }} title="Outros torneios futuros onde este jogador está inscrito">📅 Próximos</th>
            <th style={{ ...thStyle, width: 30, textAlign: "center" }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const clickable = !row.fieldOnly;
            return (
              <tr
                key={row.junior.id}
                style={{
                  borderBottom: "1px solid var(--border-light)",
                  borderLeft: THREAT_BORDER[row.threatLevel],
                  cursor: clickable ? "pointer" : "default",
                  opacity: row.fieldOnly ? 0.6 : 1,
                }}
                onClick={clickable ? () => onSelect(row.junior.id) : undefined}
                title={clickable ? "Abrir perfil em KIDS2 (nova aba)" : "Sem perfil canonico (apenas inscricao)"}
              >
                <td style={tdStyle}>
                  <span style={{ marginRight: 4 }}>{flagOf(row.junior.country || row.junior.nationality || "")}</span>
                  {row.junior.country || row.junior.nationality || "-"}
                </td>
                <td style={{ ...tdStyle, fontWeight: 600, color: "var(--text)" }}>
                  {row.junior.canonicalName}
                  {!hideFlight && row.flight && (
                    <span style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", marginLeft: 6 }}>{ICON_DOT} {row.flight.label}</span>
                  )}
                  {(row.club || row.cidade) && <div style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", marginTop: 1 }}>{row.club || row.cidade}</div>}
                  {row.sharedTournNames.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                      {row.sharedTournNames.map((s, i) => (
                        <span key={i} style={{ fontSize: "var(--fs-9)", padding: "1px 5px", borderRadius: 3,
                                               background: "var(--bg-info-subtle, #eff6ff)", color: "var(--color-info-dark, var(--color-navy))",
                                               fontWeight: 700, border: "1px solid var(--color-info)", whiteSpace: "nowrap" }}>
                          {ICON_SWORDS} {s.name}
                          {(s.posRival != null || s.posManuel != null) && (() => {
                            const pr = s.posRival; const pm = s.posManuel;
                            const mColor = pm != null && pr != null
                              ? pm < pr ? "var(--color-good-dark, #15803d)"
                              : pm > pr ? "var(--color-danger-dark, #b91c1c)"
                              : undefined
                              : undefined;
                            return (
                              <span style={{ fontWeight: 400, marginLeft: 4 }}>
                                #{pr ?? "?"} vs{" "}
                                <span style={{ color: mColor, fontWeight: mColor ? 700 : 400 }}>
                                  MF#{pm ?? "?"}
                                </span>
                              </span>
                            );
                          })()}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td style={tdStyle}>
                  <ThreatChip level={row.threatLevel} reasons={row.threatReasons} />
                </td>
                <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-2)" }}>{row.age != null ? row.age : "-"}</td>
                <td style={tdStyle}>
                  {row.tier ? (() => {
                    const c = getTierColors(row.tier);
                    return <span style={{ background: c.bg, color: c.fg, fontSize: "var(--fs-10)", padding: "2px 7px", borderRadius: 10, fontWeight: 700, border: "1px solid " + c.fg }}>{getTierLabel(row.tier)}</span>;
                  })() : <span style={{ color: "var(--text-3)", fontSize: "var(--fs-10)" }}>{row.fieldOnly ? "sem dados" : "-"}</span>}
                </td>
                <td style={{ ...tdStyle, textAlign: "center", color: row.hcp != null ? "var(--text)" : "var(--text-3)", fontWeight: row.hcp != null ? 600 : 400 }}>
                  {row.hcp != null ? row.hcp.toFixed(1) : "-"}
                </td>
                <td style={{ ...tdStyle, textAlign: "center", fontWeight: row.wins > 0 ? 700 : 400, color: row.wins > 0 ? "var(--medal-gold-strong)" : "var(--text-3)" }}>
                  {row.wins || "-"}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  <FormDots positions={row.formPositions} />
                </td>
                {!isFuture && (
                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>
                    {row.result?.pos != null ? "#" + row.result.pos : "-"}
                  </td>
                )}
                {manuel && (
                  <td style={{ ...tdStyle, textAlign: "right" }}
                      title={row.sharedTournNames.length > 0 ? "Cruzamentos: " + row.sharedTournNames.map(s => s.name).join(", ") : undefined}>
                    <div style={{ fontWeight: 700,
                      color: row.vsMTotal == null ? "var(--text-3)" :
                             row.vsMTotal > 0 ? "var(--color-danger-dark)" :
                             row.vsMTotal < 0 ? "var(--medal-gold-strong)" : "var(--text-3)" }}>
                      {row.vsMTotal == null ? "-" :
                       row.vsMTotal === 0 ? "0" :
                       row.vsMTotal > 0 ? "+" + row.vsMTotal.toFixed(1) :
                       row.vsMTotal.toFixed(1)}
                    </div>
                  </td>
                )}
                {manuel && (
                  <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-3)", fontSize: "var(--fs-11)" }}>
                    {row.vsMCount > 0
                      ? row.vsMSameFlight > 0
                        ? <span style={{ color: "var(--medal-gold-strong)", fontWeight: 700 }}>{row.vsMSameFlight}</span>
                        : row.vsMCount
                      : "-"}
                  </td>
                )}
                <td style={tdStyle}>
                  {row.circuits.length ? (
                    <span style={{ display: "inline-flex", gap: 3, flexWrap: "wrap" }}>
                      {row.circuits.map((c) => {
                        const m = CIRCUIT_CHIP[c];
                        return (
                          <span key={c} title={m?.label || c}
                            style={{ fontSize: "var(--fs-9)", fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: m?.bg || "var(--bg-muted)", color: m?.fg || "var(--text-2)" }}>
                            {c}
                          </span>
                        );
                      })}
                    </span>
                  ) : <span style={{ color: "var(--text-3)", fontSize: "var(--fs-10)" }}>—</span>}
                </td>
                <td style={{ ...tdStyle, maxWidth: 240 }}>
                  {(() => {
                    const regs = (upcoming?.get(row.junior.id) ?? [])
                      .filter(r => !(r.circuit === "uskids" && currentUskTcode && r.tournamentId === currentUskTcode));
                    if (!regs.length) return <span style={{ color: "var(--text-3)", fontSize: "var(--fs-10)" }}>—</span>;
                    return (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                        {regs.map((r) => (
                          <a key={r.circuit + ":" + r.tournamentId} href={r.link} target="_blank" rel="noopener noreferrer"
                            title={`${r.name}${r.escalao ? " · " + r.escalao : ""} (${fmtRegDate(r.date)})`}
                            style={{
                              fontSize: "var(--fs-9)", fontWeight: 600, padding: "1px 6px", borderRadius: 10, textDecoration: "none", whiteSpace: "nowrap",
                              background: "var(--bg-info-subtle, var(--bg-info))", color: "var(--color-info-dark, var(--color-navy))", border: "1px solid var(--border-info, var(--border-info))",
                            }}>
                            {r.circuit === "fpg" ? "🇵🇹 " : ""}{shortReg(r.name)} · {fmtRegDate(r.date)}
                          </a>
                        ))}
                      </div>
                    );
                  })()}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  {clickable && <span style={{ color: "var(--color-info)", fontSize: "var(--fs-13)" }}>{ICON_EXTERNAL}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ThreatChip({ level, reasons }: { level: ThreatLevel; reasons: string[] }) {
  const m = THREAT_META[level];
  const tip = reasons.length ? reasons.join(" · ") : m.label;
  if (level === "none") {
    return <span title={tip} style={{ color: "var(--text-3)", fontSize: "var(--fs-11)" }}>—</span>;
  }
  return (
    <span title={tip}
          style={{
            display: "inline-block", background: m.bg, color: m.fg,
            border: "1px solid " + m.border, borderRadius: 10,
            fontSize: "var(--fs-10)", fontWeight: 700, padding: "2px 8px", whiteSpace: "nowrap",
          }}>
      {m.label}
    </span>
  );
}

function FormDots({ positions }: { positions: Array<number | null> }) {
  return (
    <div style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {positions.map((p, i) => {
        const color = p == null
          ? "var(--text-3)"
          : p <= 3
            ? "var(--medal-gold-strong)"
            : p <= 10
              ? "var(--color-amber, var(--color-amber))"
              : "var(--text-3)";
        return (
          <span key={i}
                title={p == null ? "-" : "#" + p}
                style={{
                  width: 20, height: 20, borderRadius: "999px",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: p == null ? "var(--bg-muted)" : "var(--bg)",
                  border: "1px solid " + color,
                  fontSize: "var(--fs-9)", fontWeight: 700, color,
                }}>
            {p == null ? "·" : p > 99 ? "99+" : String(p)}
          </span>
        );
      })}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "7px 8px", textAlign: "left", fontSize: "var(--fs-10)", fontWeight: 700,
  color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.3, cursor: "pointer",
};
const tdStyle: React.CSSProperties = { padding: "7px 8px", fontSize: "var(--fs-12)", color: "var(--text-2)" };

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return d + " " + MONTHS_PT[parseInt(m, 10) - 1] + " " + y;
}
