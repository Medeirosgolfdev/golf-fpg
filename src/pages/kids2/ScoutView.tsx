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
  useJuniorsCanonical, computeTier, getTierLabel, getTierColors,
  getSharedTournamentIds, getSharedFlightTids, countWins, countTop3,
  bestRoundGross,
} from "./data";
import type { CanonicalData, Junior, Tournament, Result, Flight } from "./data";
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

const MONTHS_PT_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function fmtRegDate(iso: string): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS_PT_SHORT[Number(m) - 1] || m}`;
}
function shortReg(name: string): string {
  const n = name.replace(/\b20\d{2}\b/g, "").replace(/\s+/g, " ").trim();
  return n.length > 24 ? n.slice(0, 23) + "…" : n;
}
const CIRCUIT_CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  US: { bg: "var(--bg-info-subtle, #eff6ff)", fg: "var(--color-info-dark, #1e3a8a)", label: "USKids" },
  PT: { bg: "var(--bg-success-subtle, #ecfdf5)", fg: "var(--color-good-dark)", label: "FPG (Portugal)" },
  ES: { bg: "var(--bg-warn-subtle, #fffbeb)", fg: "var(--color-warn-dark, #92400e)", label: "RFEG (Espanha)" },
  FR: { bg: "var(--bg-pink, #fdf2f8)", fg: "var(--color-purple, #6b21a8)", label: "FFG (França)" },
};

const ICON_SCOPE = "\u{1F52D}";
const ICON_BACK = "←";
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

function normName(s: string): string {
  return (s || "").trim().toLowerCase()
    .replace(/[-'’.·\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function usToIso(s: string | undefined): string {
  if (!s) return "";
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  return m[3] + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
}

export default function ScoutView() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <ScoutViewContent />;
}

function ScoutViewContent() {
  const status = useJuniorsCanonical();
  const field = useUskidsField();
  const params = useParams<{ tid: string }>();

  if (status.kind === "loading") return <LoadingState />;
  if (status.kind === "error") return <EmptyState size="md" message={"Falhou: " + status.error} />;

  const data = status.data;
  const tid = params.tid || "";

  const canonical = data.tournamentById.get(tid);
  if (canonical) {
    return <ScoutContent data={data} tournament={canonical} onSelect={(jid) => window.open("/kids2/" + jid, "_blank", "noopener")} />;
  }

  const uskMatch = tid.match(/^usk(\d+)$/);
  if (uskMatch && field?.torneios) {
    const tcode = parseInt(uskMatch[1], 10);
    const ft = field.torneios.find((x) => x.t === tcode);
    if (ft) {
      const built = buildFieldTournament(ft, data);
      return <ScoutContent
        data={built.data}
        tournament={built.tournament}
        onSelect={(jid) => window.open("/kids2/" + jid, "_blank", "noopener")}
      />;
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <p style={{ color: "var(--text-3)" }}>Torneio <code>{tid}</code> nao encontrado.</p>
      <Link to="/kids2" style={{ color: "var(--color-info)" }}>{ICON_BACK} voltar</Link>
    </div>
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
//   ScoutContent — vista principal
// ═══════════════════════════════════════════════════════════════════

function ScoutContent({ data, tournament, onSelect }: {
  data: CanonicalData; tournament: Tournament; onSelect: (jid: string) => void;
}) {
  const manuel = data.manuel;
  const today = new Date().toISOString().slice(0, 10);
  const tDate = tournament.date || tournament.startDate || "";
  const isFuture = tDate > today;
  const isFieldOnlySource = tournament.id.startsWith("usk");

  // Inscrições futuras por jogador (USKids + FPG) — para a coluna "Próximos".
  const upcoming = useUpcomingByJunior(data);
  const currentUskTcode = tournament.id.startsWith("usk") ? tournament.id.slice(3) : null;

  const manuelFlightKey = useMemo(() => {
    if (!manuel) return null;
    const f = tournament.flights.find((ff) => ff.results.some((r) => r.juniorId === manuel.id));
    return f?.flightKey || null;
  }, [tournament, manuel]);

  const [flightFilter, setFlightFilter] = useState<string>(manuelFlightKey || "all");

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
        if (manuel && !isFieldOnly) {
          const shared = getSharedTournamentIds(junior, manuel);
          let sum = 0; let n = 0;
          for (const stid of shared) {
            const t2 = data.tournamentById.get(stid);
            if (!t2) continue;
            for (const f2 of t2.flights) {
              const rJ = f2.results.find((x) => x.juniorId === junior.id);
              const rM = f2.results.find((x) => x.juniorId === manuel.id);
              if (rJ?.totalGross != null && rM?.totalGross != null) {
                sum += rJ.totalGross - rM.totalGross;
                n++;
              }
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

        const tier = isFieldOnly ? null : computeTier(junior, data.tournamentById);
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
          vsMTotal, vsMCount, vsMSameFlight,
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
    const manuelInField = manuel && tournament.flights.some((f) => f.results.some((r) => r.juniorId === manuel.id));
    const totalInscritos = allRows.length + (manuelInField ? 1 : 0);
    const fieldOnlyCount = allRows.filter((r) => r.fieldOnly).length;
    const matchedCount = allRows.length - fieldOnlyCount;
    const countries = new Set<string>();
    for (const r of allRows) {
      const c = r.junior.country || r.junior.nationality;
      if (c) countries.add(c.toUpperCase());
    }
    const withManuelHistory = allRows.filter((r) => r.vsMCount > 0).length;
    const eliteCount = allRows.filter((r) => r.tier === "elite" || r.tier === "strong").length;
    return {
      totalInscritos, matchedPct: totalInscritos > 0 ? Math.round((matchedCount / totalInscritos) * 100) : 0,
      countries: countries.size, withManuelHistory, eliteCount, fieldOnlyCount, matchedCount,
      manuelInField: !!manuelInField,
    };
  }, [allRows, manuel, tournament]);

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
      <Kids2SubNav />
      <div style={{ padding: "16px 20px", maxWidth: 1240, margin: "0 auto" }}>
      {tournament.links && tournament.links.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          {tournament.links.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--color-info)" }}>
              {l.label} {ICON_EXTERNAL}
            </a>
          ))}
        </div>
      )}

      <h2 style={{ margin: "0 0 4px", fontSize: 22, color: "var(--text)" }}>
        {ICON_SCOPE} Field Scout
      </h2>
      <div style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 14, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong style={{ color: "var(--text)" }}>{tournament.name || tournament.shortName || tournament.id}</strong>
        {tDate && <span>{ICON_DOT} {fmtDate(tDate)}</span>}
        {tournament.course && <span>{ICON_DOT} {tournament.course}</span>}
        {isFuture
          ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--bg-info-subtle, #eff6ff)", color: "var(--color-info-dark, #1e3a8a)", fontWeight: 600 }}>FUTURO</span>
          : <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--bg-muted)", color: "var(--text-2)", fontWeight: 600 }}>HISTORICO</span>
        }
        {isFieldOnlySource && (
          <span title="Inscritos do uskids-field.json - alguns jogadores podem nao ter perfil canonico"
                style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "var(--bg-muted)", color: "var(--text-3)", border: "1px solid var(--border-light)" }}>
            USKids field
          </span>
        )}
      </div>

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

      {kpis.manuelInField && manuel && manuelStats && (
        <div style={{
          marginBottom: 14, padding: "10px 14px",
          background: "var(--bg-success-subtle, #ecfdf5)",
          border: "1px solid var(--border-success, #97c459)",
          borderRadius: 8, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 18 }}>{ICON_SWORDS}</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, color: "var(--color-good-dark)", fontSize: 14 }}>
              Manuel inscrito {manuelFlightKey ? "no " + (tournament.flights.find((f) => f.flightKey === manuelFlightKey)?.label || "") : ""}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-good-dark)", marginTop: 2 }}>
              {manuelStats.flightFieldSize} inscritos no escalao{" "}
              {ICON_DOT} {manuelStats.rivalsWithHistory} ja cruzaram com ele{" "}
              {manuelStats.rivalsWithHistory > 0 && (
                <>{ICON_DOT} {manuelStats.rivalsBeatManuelOnAvg} com media superior</>
              )}
            </div>
          </div>
          <Link to={"/kids2/" + manuel.id}
                style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6,
                         background: "var(--color-good-dark)", color: "var(--bg)",
                         textDecoration: "none", fontWeight: 600 }}>
            Ver perfil do Manuel {ICON_EXTERNAL}
          </Link>
        </div>
      )}

      {isFieldOnlySource && kpis.fieldOnlyCount > 0 && (
        <div style={{ background: "var(--bg-warn-subtle, #fffbeb)", color: "var(--color-warn-dark, #92400e)",
                      padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
          {kpis.fieldOnlyCount} inscritos sem perfil canonico no nosso sistema (apenas nome + pais).
          Os scores historicos, tier, wins e diff vs Manuel nao estao disponiveis para estes.
        </div>
      )}

      {tournament.flights.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
          <button onClick={() => setFlightFilter("all")} style={flightPillStyle(flightFilter === "all")}>
            Todos {ICON_DOT} {allRows.length + (kpis.manuelInField ? 1 : 0)}
          </button>
          {tournament.flights.map((f) => {
            const isManuelFlight = !!manuel && f.results.some((r) => r.juniorId === manuel.id);
            return (
              <button key={f.flightKey} onClick={() => setFlightFilter(f.flightKey)} style={flightPillStyle(flightFilter === f.flightKey, isManuelFlight)}>
                {f.label} {ICON_DOT} {f.results.length}
                {isManuelFlight && <> {ICON_DOT} {ICON_SWORDS} Manuel</>}
              </button>
            );
          })}
        </div>
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
    : emphasis === "warn" ? "var(--color-warn-dark, #92400e)"
    : undefined;
  const border = emphasis === "good" ? "var(--color-good)"
    : emphasis === "warn" ? "var(--color-amber, #f59e0b)"
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
      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{flight.label}</span>
      <span style={{ fontSize: 12, color: "var(--text-3)" }}>{ICON_DOT} {count} c/ perfil</span>
      {typeof flight.fieldSize === "number" && flight.fieldSize > count && (
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{ICON_DOT} {flight.fieldSize} total</span>
      )}
      {isManuelFlight && (
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--bg-success-subtle, #ecfdf5)", color: "var(--color-good-dark)", fontWeight: 600 }}>
          {ICON_SWORDS} Manuel
        </span>
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
    return <div style={{ padding: 20, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
      Sem jogadores neste escalao.
    </div>;
  }
  return (
    <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, overflowX: "auto" }}>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
        <thead style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
          <tr>
            <SortableHdr<ScoutKey> k="country"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={thStyle}>Pais</SortableHdr>
            <SortableHdr<ScoutKey> k="name"        sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={thStyle}>Nome</SortableHdr>
            <SortableHdr<ScoutKey> k="threat"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 92 }} title="Ameaça ao Manuel — combina confronto directo, tier, forma recente e vitórias">{ICON_SWORDS} Ameaça</SortableHdr>
            <SortableHdr<ScoutKey> k="age"         sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, textAlign: "center", width: 50 }}>Idade</SortableHdr>
            <SortableHdr<ScoutKey> k="tier"        sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 110 }}>Tier</SortableHdr>
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
                    <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 6 }}>{ICON_DOT} {row.flight.label}</span>
                  )}
                  {(row.club || row.cidade) && <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 1 }}>{row.club || row.cidade}</div>}
                </td>
                <td style={tdStyle}>
                  <ThreatChip level={row.threatLevel} reasons={row.threatReasons} />
                </td>
                <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-2)" }}>{row.age != null ? row.age : "-"}</td>
                <td style={tdStyle}>
                  {row.tier ? (() => {
                    const c = getTierColors(row.tier);
                    return <span style={{ background: c.bg, color: c.fg, fontSize: 10, padding: "2px 7px", borderRadius: 10, fontWeight: 700, border: "1px solid " + c.fg }}>{getTierLabel(row.tier)}</span>;
                  })() : <span style={{ color: "var(--text-3)", fontSize: 10 }}>{row.fieldOnly ? "sem dados" : "-"}</span>}
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
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700,
                    color: row.vsMTotal == null ? "var(--text-3)" :
                           row.vsMTotal > 0 ? "var(--color-danger-dark)" :
                           row.vsMTotal < 0 ? "var(--medal-gold-strong)" : "var(--text-3)" }}>
                    {row.vsMTotal == null ? "-" :
                     row.vsMTotal === 0 ? "0" :
                     row.vsMTotal > 0 ? "+" + row.vsMTotal.toFixed(1) :
                     row.vsMTotal.toFixed(1)}
                  </td>
                )}
                {manuel && (
                  <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-3)", fontSize: 11 }}>
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
                            style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: m?.bg || "var(--bg-muted)", color: m?.fg || "var(--text-2)" }}>
                            {c}
                          </span>
                        );
                      })}
                    </span>
                  ) : <span style={{ color: "var(--text-3)", fontSize: 10 }}>—</span>}
                </td>
                <td style={{ ...tdStyle, maxWidth: 240 }}>
                  {(() => {
                    const regs = (upcoming?.get(row.junior.id) ?? [])
                      .filter(r => !(r.circuit === "uskids" && currentUskTcode && r.tournamentId === currentUskTcode));
                    if (!regs.length) return <span style={{ color: "var(--text-3)", fontSize: 10 }}>—</span>;
                    return (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                        {regs.map((r) => (
                          <a key={r.circuit + ":" + r.tournamentId} href={r.link} target="_blank" rel="noopener noreferrer"
                            title={`${r.name}${r.escalao ? " · " + r.escalao : ""} (${fmtRegDate(r.date)})`}
                            style={{
                              fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 10, textDecoration: "none", whiteSpace: "nowrap",
                              background: "var(--bg-info-subtle, #eff6ff)", color: "var(--color-info-dark, #1e3a8a)", border: "1px solid var(--border-info, #bfdbfe)",
                            }}>
                            {r.circuit === "fpg" ? "🇵🇹 " : ""}{shortReg(r.name)} · {fmtRegDate(r.date)}
                          </a>
                        ))}
                      </div>
                    );
                  })()}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  {clickable && <span style={{ color: "var(--color-info)", fontSize: 13 }}>{ICON_EXTERNAL}</span>}
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
    return <span title={tip} style={{ color: "var(--text-3)", fontSize: 11 }}>—</span>;
  }
  return (
    <span title={tip}
          style={{
            display: "inline-block", background: m.bg, color: m.fg,
            border: "1px solid " + m.border, borderRadius: 10,
            fontSize: 10, fontWeight: 700, padding: "2px 8px", whiteSpace: "nowrap",
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
              ? "var(--color-amber, #f59e0b)"
              : "var(--text-3)";
        return (
          <span key={i}
                title={p == null ? "-" : "#" + p}
                style={{
                  width: 20, height: 20, borderRadius: 999,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: p == null ? "var(--bg-muted)" : "var(--bg)",
                  border: "1px solid " + color,
                  fontSize: 9, fontWeight: 700, color,
                }}>
            {p == null ? "·" : p > 99 ? "99+" : String(p)}
          </span>
        );
      })}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "7px 8px", textAlign: "left", fontSize: 10, fontWeight: 700,
  color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.3, cursor: "pointer",
};
const tdStyle: React.CSSProperties = { padding: "7px 8px", fontSize: 12, color: "var(--text-2)" };

function flightPillStyle(active: boolean, isManuelFlight = false): React.CSSProperties {
  const accent = isManuelFlight ? "var(--color-good-dark)" : "var(--color-info-dark, #1e3a8a)";
  return {
    fontSize: 11, fontWeight: 600,
    padding: "5px 11px", borderRadius: 999,
    border: "1px solid " + (active ? accent : "var(--border)"),
    background: active ? accent : "var(--bg)",
    color: active ? "var(--bg)" : "var(--text-2)",
    cursor: "pointer", lineHeight: 1.4,
  };
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return d + " " + months[parseInt(m, 10) - 1] + " " + y;
}
