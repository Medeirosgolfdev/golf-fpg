/**
 * kids/FieldRivaisDashboard.tsx — Tabela tipo RivaisDashboard alimentada
 * dinamicamente pelos inscritos de um torneio futuro.
 *
 * Linhas: jogadores inscritos no escalão de Manuel + Manuel REF
 * Colunas: torneios USKids europeus passados relevantes (de uskids-member-history-slim.json)
 * UP: torneios futuros (incluindo o actual)
 *
 * Reutiliza o componente visual RivaisDashboard sem o modificar.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import RivaisDashboard from "../../ui/RivaisDashboard";
import LoadingState from "../../ui/LoadingState";
import { cachedFetchJson } from "../../data/fetchCache";
import { meanArr } from "../../utils/mathUtils";
import { normName, extraTidMeta, type AutoRivalPlayer } from "../../data/KIDSdataLoader";
import type { RivalPlayer, TournDef, RoundAvg } from "../../ui/bjgtAnalysisTypes";
import { normPaisDisplay } from "../../utils/flagUtils";
import { fmtToPar } from "../../utils/format";
import { tpColor } from "../../ui/tournamentPrimitives";
import HistoricScorecardsTab from "./HistoricScorecardsTab";
import CourseTab from "./CourseTab";
import PrevisaoTab from "./PrevisaoTab";
import { ScoutEmbed } from "../kids2/ScoutView";

// ─────────────────────────────────────────────────────────────────────
// Tcodes "canónicos" que aparecem sempre como coluna se metadata existe.
// Apenas torneios que são bons indicadores de nível para Boys 12 europeus:
// European, World, Venice, Marco Simone, Rome, Holiday Classic.
// (Sem Sandestin/Desert/MS State/RWB — esses só aparecem se ≥ MIN_PARTICIPANTS.)
// ─────────────────────────────────────────────────────────────────────
const CANONICAL_TCODES = new Set([
  // European Championship — 5 edições mais recentes (2026 acabou de jogar)
  "8300",  "13568", "15704", "18242", "21131",         // 2022, 2023, 2024, 2025, 2026
  // World Championship — 4 edições mais recentes
  "11604", "14029", "15807", "18124",                  // 2022, 2023, 2024, 2025
  // Venice Open — 4 edições mais recentes
  "12229", "14302", "16428", "19418",                  // 2022, 2023, 2024, 2025
  // Marco Simone Invitational — última edição (estreou 2025)
  "18438", "21080",                                    // 2025, 2026
  // Rome Classic — 4 edições (2022-2025)
  "12578", "14670", "16795", "20175",                  // 2022, 2023, 2024, 2025
  // Irish Open (Irlanda) — 5 edições (2021-2025); boa penetração europeia
  "8660", "11307", "13470", "16020", "18978",          // 2021, 2022, 2023, 2024, 2025
  // Paris Invitational (França) — 1 edição disponível no member-history
  "18975",                                             // 2025
  // (Holiday Classic excluído — raramente há ≥ 5 europeus do escalão a
  //  jogar, faz mais barulho que sinal na cross-table.)
]);

// Prioridade entre séries para a ordenação das colunas da cross-table.
// WC e EU vêm sempre primeiro (mais comparáveis entre si — são os dois
// "majors" USKids). Restantes séries caem para o ramo "por edição + antiga"
// (Venice cedo, Rome depois, etc.). Quanto MENOR o número, mais à esquerda.
const SERIES_PRIORITY: Record<string, number> = {
  WC: 1,
  EU: 2,
};

// Threshold mínimo: torneios não-canónicos com pelo menos N jogadores do escalão
const MIN_PARTICIPANTS = 5;
// Máximo de colunas (para não rebentar a UI) — prioridade aos mais recentes
const MAX_COLUMNS = 20;

// Tids "extra" vindos de autoRivals (não estão no member-history-slim).
// Para cada um: nome, abreviado, rondas, par, mês/ano para ordenação.
// Estes são WJGC, EOWAGR, Doral — torneios importantes mas hospedados noutros datasets.
interface ExtraTidDef { tid: string; name: string; short: string; rounds: number; par: number; sortDate: string }
const EXTRA_TIDS: ExtraTidDef[] = [
  // WJGC (Villa Padierna, Espanha)
  { tid: "wjgc25_b1011", name: "WJGC 2025 B10-11", short: "WJGC '25", rounds: 3, par: 71, sortDate: "2025-02-25" },
  { tid: "wjgc26",       name: "WJGC 2026 B10-11", short: "WJGC '26", rounds: 3, par: 72, sortDate: "2026-02-25" },
  { tid: "wjgc26_1213",  name: "WJGC 2026 B12-13", short: "WJGC '26 B12-13", rounds: 3, par: 72, sortDate: "2026-02-25" },
  // EOWAGR (Aragon Open, Espanha)
  { tid: "eowagr25",     name: "EOWAGR 2025",      short: "EU Open '25", rounds: 3, par: 72, sortDate: "2025-08-15" },
  // Doral (First Tee Miami, USA)
  { tid: "doral24_b1011",name: "Doral 2024 B10-11",short: "Doral '24", rounds: 2, par: 71, sortDate: "2024-12-15" },
  { tid: "doral25_b1011",name: "Doral 2025 B10-11",short: "Doral '25", rounds: 2, par: 71, sortDate: "2025-12-15" },
  { tid: "doral25_b1213",name: "Doral 2025 B12-13",short: "Doral '25 B12-13", rounds: 2, par: 71, sortDate: "2025-12-15" },
];

// EXTRA_TIDS são tids string (ex: "wjgc26"). Para os encaixar na lista do
// dropdown (que usa FieldTorneio.t: number) atribuímos IDs negativos estáveis.
// Mapeamento: tid string -> tcode negativo. Reverso usado em dataset useMemo.
const EXTRA_NEG_IDS: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  EXTRA_TIDS.forEach((def, i) => { m[def.tid] = -(i + 1); });
  return m;
})();
const EXTRA_TID_BY_NEG: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const [tid, neg] of Object.entries(EXTRA_NEG_IDS)) m[neg] = tid;
  return m;
})();

/** Extrai escalao a partir do nome do EXTRA_TID (ex: "WJGC 2026 B10-11" → "Boys 10-11"). */
function extraEscalaoFromName(name: string): string {
  // "WJGC 2026 B10-11" → "Boys 10-11"; "Doral 2024 B10-11" → "Boys 10-11"
  // "EOWAGR 2025" → "Geral" (sem escalao específico)
  const m = name.match(/B(\d+(?:-\d+)?)$/);
  if (m) return `Boys ${m[1]}`;
  return "Geral";
}

/** Parse "Boys 12" → [12, 12]; "Boys 10-11" → [10, 11]; "U14" → [0, 14]. */
function parseEscalaoRange(esc: string): [number, number] | null {
  if (!esc) return null;
  // "U14" / "U12" / "U10"
  const u = esc.match(/^U(\d+)$/i);
  if (u) return [0, parseInt(u[1], 10)];
  // "Boys 12" / "Boys 10-11" / "Boys 10 & 11" / "Boys 10 - 11"
  const m = esc.match(/(\d+)\s*[-&]\s*(\d+)/);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  const s = esc.match(/(\d+)/);
  if (s) { const n = parseInt(s[1], 10); return [n, n]; }
  return null;
}

/** True se o escalão "user" (ex: Boys 12) está incluído no escalão "candidato"
 *  (ex: Boys 12-13 ou Boys 11-12 ou U14). Geral/null → sempre matcha. */
function escalaoMatches(userEsc: string, candEsc: string): boolean {
  if (!candEsc || candEsc === "Geral") return true;
  const u = parseEscalaoRange(userEsc);
  const c = parseEscalaoRange(candEsc);
  if (!u || !c) return false;
  // Match se RANGES sobrepõem (qualquer overlap)
  return u[0] <= c[1] && c[0] <= u[1];
}

// Próximos torneios (UP) — onde os rivais podem aparecer inscritos.
// Tcodes têm de estar em /data/uskids-field.json (validado em runtime pelo filtro
// de futureTorneios). Ordenados por data ascendente.
// NOTA: Marco Simone Local Tour 2026 (tcode 21573) ficou fora porque é uma
// série de eventos locais não-coberta pelo scraper signupanytime. Quando a
// FPG publicar field também desse torneio, adicionar aqui.
const UP_TORN: Array<{ id: string; name: string; short?: string; url?: string; hub?: string; tcode?: string; date_iso?: string }> = [
  // European Championship 2026 (26 Mai — já jogado, Manuel participou)
  { id: "european26", tcode: "21131", date_iso: "2026-05-26", name: "European Championship 2026", short: "EU '26",     url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/521131/european-championship-2026/field" },
  // Irish Open 2026 — 1-2 Jul, K Club (Irlanda)
  { id: "irish26",    tcode: "21455", date_iso: "2026-07-01", name: "Irish Open 2026",            short: "Irish '26",  url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/521455/irish-open-2026/field" },
  // Paris Invitational 2026 — 4-6 Jul (França)
  { id: "paris26",    tcode: "21795", date_iso: "2026-07-04", name: "Paris Invitational 2026",    short: "Paris '26",  url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/521795/paris-invitational-2026/field", hub: "https://tournaments.uskidsgolf.com/paris_player_hub" },
  // World Championship 2026 — 30 Jul-1 Ago (Pinehurst, USA)
  { id: "world26",    tcode: "21610", date_iso: "2026-07-30", name: "World Championship 2026",    short: "WC '26",     url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/521610/world-championship-2026/field" },
  // Venice Open 2026 — 13-15 Ago (Itália)
  { id: "venice26",   tcode: "22243", date_iso: "2026-08-13", name: "Venice Open 2026",           short: "Venice '26", url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/522243/venice-open-2026/field" },
  // Belgium Invitational 2026 — 26-27 Set (Bélgica, novo torneio europeu)
  { id: "belgium26",  tcode: "22480", date_iso: "2026-09-26", name: "Belgium Invitational 2026",  short: "Belgium '26", url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/522480/belgium-invitational-2026/field" },
];
// Só torneios ainda não passados (data hoje ou futura)
const _today = new Date().toISOString().slice(0, 10);
const UP_TORN_FUTURE = UP_TORN.filter(u => !u.date_iso || u.date_iso >= _today);

// Link oficial de RESULTADOS (signupanytime) por tcode USKids — usado nos
// cabeçalhos de torneio da cross-table (coluna por edição + grupo da série).
const SIGNUP_AX_INTL = "1129";
function signupResultsUrl(tcode: string | number): string {
  return `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=${SIGNUP_AX_INTL}&t=${tcode}`;
}

// Ficheiros FFG Internationaux U14 a integrar (Garçons). O escalão U14
// abrange Boys 9-14 — qualquer escalão dentro desse range vê estes torneios.
// Para cada um: caminho do JSON em public/data/ffgolf/, ID negativo único
// (a partir de -100 para não colidir com EXTRA_NEG_IDS), nome a mostrar.
interface FFGFileDef { path: string; neg: number; name: string; year: string; dateMM_DD: string }
const FFG_FILES: FFGFileDef[] = [
  { neg: -101, year: "2026", dateMM_DD: "4/9",
    path: "/data/ffgolf/2026_internationaux-de-france-u14-garcons-challenge-alexis-godillot.json",
    name: "Internationaux U14 Garçons 2026" },
  { neg: -102, year: "2025", dateMM_DD: "4/3",
    path: "/data/ffgolf/2025_internationaux-de-france-u14-garcons-challenge-alexis-godillot.json",
    name: "Internationaux U14 Garçons 2025" },
];
const FFG_NEG_IDS = new Set(FFG_FILES.map(f => f.neg));

// Tcodes a esconder do dropdown (torneios irrelevantes/eventos únicos):
//   • 15573 = Real Club de Golf El Prat 2023 (one-off espanhol)
//   • 21004 = USKids Desert Shootout 2026 (US-only, irrelevante para europeu)
const HIDDEN_TCODES = new Set<string>(["15573", "21004"]);

// Prefixos de tid para EXTRA detection automática (substitui EXTRA_TIDS hardcoded).
// Qualquer tid em autoRivals.r que comece com um destes prefixos passa a ser
// considerado uma fonte EXTRA — disponível para o dropdown.
const EXTRA_TID_PREFIXES = ["wjgc", "doral", "eowagr"] as const;

/** Nome/abreviado/data para um tid EXTRA (wjgc/doral/eowagr) quando os
 *  metadados do loader não bastam. Deriva ano + escalão do próprio tid.
 *  `meta` (do canónico) tem prioridade para nome e data. */
function describeExtraTid(
  tid: string,
  meta?: { name: string; short: string; dateISO: string; url: string | null },
): { name: string; short: string; date: string; url: string } {
  let year = new Date().getFullYear();
  const y4 = tid.match(/20(\d{2})/);
  const ys = tid.match(/(?:wjgc|doral|eowagr)(\d{2})(?:[_\-]|$)/);
  if (y4) year = 2000 + parseInt(y4[1], 10);
  else if (ys) year = 2000 + parseInt(ys[1], 10);
  else if (meta?.dateISO) { const m = meta.dateISO.match(/^(\d{4})/); if (m) year = parseInt(m[1], 10); }
  const yy = String(year).slice(2);

  let esc = "";
  const bc = tid.match(/_b(\d{2,4})(?:[_\-]|$)/);
  if (bc) {
    const a = bc[1];
    esc = a.length === 2 ? `B${a[0]}-${a[1]}` : a.length === 4 ? `B${a.slice(0, 2)}-${a.slice(2)}` : `B${a}`;
  } else if (/_1213(?:[_\-]|$)/.test(tid)) esc = "B12-13";
  else if (/_1011(?:[_\-]|$)/.test(tid)) esc = "B10-11";
  else if (/_89(?:[_\-]|$)/.test(tid)) esc = "B8-9";
  else if (/_bwagr(?:[_\-]|$)/.test(tid)) esc = "WAGR";
  else if (/_gwagr(?:[_\-]|$)/.test(tid)) esc = "G-WAGR";
  else if (/_g1213(?:[_\-]|$)/.test(tid)) esc = "G12-13";
  else if (/^wjgc\d{2}$/.test(tid)) esc = "B10-11";

  const pfx = tid.startsWith("wjgc") ? "WJGC" : tid.startsWith("doral") ? "Doral" : tid.startsWith("eowagr") ? "EOWAGR" : "";
  return {
    name: meta?.name || `${pfx} ${year}${esc ? " " + esc : ""}`,
    short: `${pfx} '${yy}${esc ? " " + esc : ""}`,
    date: meta?.dateISO || `${year}-06-15`,
    url: meta?.url || "",
  };
}

interface FFGPlayer { name?: string; country?: string; club?: string; pos?: number; total?: number;
  rounds?: Array<{ round?: number; gross?: number; scores?: number[] }> }
interface FFGFile {
  tournament?: string;
  year?: number;
  rounds?: number;
  course?: { name?: string; par?: number[]; meters?: number[]; metersTotal?: number; parTotal?: number };
  players?: FFGPlayer[];
}

// ─────────────────────────────────────────────────────────────────────
// Types do field e member-history
// ─────────────────────────────────────────────────────────────────────
interface FieldPlayer { nome: string; pais: string; cidade?: string }
interface FieldEscalao { nome: string; jogadores?: FieldPlayer[] }
interface FieldTorneio { t: number; name: string; date_inicio: string; escaloes: FieldEscalao[] }
interface FieldData { torneios: FieldTorneio[] }

// uskids-results.json — leaderboards reais (a fonte mais rápida a actualizar
// quando um torneio acaba). Estrutura usada apenas para sintetizar Passados
// quando o member-history-slim ainda não foi regenerado.
interface USKResLBPlayer { nome?: string; pais?: string; cidade?: string }
interface USKResRonda { ronda?: number; leaderboard?: USKResLBPlayer[] }
interface USKResEscalao { nome?: string; age_group?: number; rondas?: USKResRonda[] }
interface USKResTorneio {
  t: number;
  name: string;
  date_inicio?: string;
  date_fim?: string;
  escaloes?: USKResEscalao[];
}
interface USKResData { resultados?: USKResTorneio[] }

interface MHRound { gross: number; strokes?: number[] }
interface MHTorn { ageGroup: string; place: number | null; rounds: Record<string, MHRound> }
interface MHPlr { name: string; country: string; torneios: Record<string, MHTorn> }
interface MHEscalaoMeta { course?: string; yards?: number[]; par?: number[] }
interface MHSlim {
  torneios: Record<string, {
    name: string;
    startDate: string;
    holesPerRound: number;
    par: number[] | null;
    yards?: number[] | null;
    byEscalao?: Record<string, MHEscalaoMeta>;
  }>;
  jogadores: Record<string, MHPlr>;
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────
type TabKey = "players" | "scores" | "scorecards" | "campo" | "previsao" | "scout";
const VALID_TABS: readonly TabKey[] = ["players", "scores", "scorecards", "campo", "previsao", "scout"];

export default function FieldRivaisDashboard({ defaultT = 21131, defaultEscalao = "Boys 12", onSelectPlayer, autoRivals, syncUrl = false }: {
  defaultT?: number;
  defaultEscalao?: string;
  onSelectPlayer?: (name: string) => void;
  autoRivals?: AutoRivalPlayer[];
  /** Sincroniza torneio/escalão/tab com o URL (links partilháveis). */
  syncUrl?: boolean;
}) {
  const [field, setField] = useState<FieldData | null>(null);
  const [mh, setMh] = useState<MHSlim | null>(null);
  // uskids-results.json — para sintetizar Passados quando o member-history
  // ainda não foi regenerado (torneio acabou hoje/ontem).
  const [uskRes, setUskRes] = useState<USKResData | null>(null);
  // Map neg ID → FFG file data (loaded on mount)
  const [ffgData, setFfgData] = useState<Map<number, FFGFile>>(new Map());
  const [searchParams, setSearchParams] = useSearchParams();
  const [torneioT, setTorneioT] = useState<number>(() => {
    if (syncUrl) { const t = searchParams.get("t"); if (t && !Number.isNaN(Number(t))) return Number(t); }
    return defaultT;
  });
  const [escalaoNome, setEscalaoNome] = useState<string>(() =>
    (syncUrl && searchParams.get("esc")) || defaultEscalao,
  );
  // Tab activa: PLAYERS (cross-table de rivais), SCORES (totais por ronda),
  // SCORECARDS (pancadas hole-by-hole top-N) ou CAMPO (anatomia do campo).
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (syncUrl) { const t = searchParams.get("tab"); if (t && (VALID_TABS as readonly string[]).includes(t)) return t as TabKey; }
    return "players";
  });

  // Espelhar torneio/escalão/tab no URL -> cada torneio tem link próprio.
  useEffect(() => {
    if (!syncUrl) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("t", String(torneioT));
      next.set("esc", escalaoNome);
      next.set("tab", activeTab);
      return next;
    }, { replace: true });
  }, [syncUrl, torneioT, escalaoNome, activeTab, setSearchParams]);

  // Load field + member history + uskids-results (último é fallback para
  // sintetizar Passados de torneios UP_TORN que acabaram hoje/ontem).
  useEffect(() => {
    cachedFetchJson<FieldData>("/data/uskids-field.json").then(d => d && setField(d)).catch(() => {});
    cachedFetchJson<MHSlim>("/data/uskids-member-history-slim.json").then(d => d && setMh(d)).catch(() => {});
    cachedFetchJson<USKResData>("/data/uskids-results.json").then(d => d && setUskRes(d)).catch(() => {});
  }, []);

  // Load FFG Internationaux U14 files (carrega em paralelo, falhas silenciosas)
  useEffect(() => {
    let alive = true;
    Promise.all(FFG_FILES.map(async (def) => {
      try {
        const d = await cachedFetchJson<FFGFile>(def.path);
        return d ? [def.neg, d] as const : null;
      } catch { return null; }
    })).then(results => {
      if (!alive) return;
      const m = new Map<number, FFGFile>();
      for (const r of results) { if (r) m.set(r[0], r[1]); }
      setFfgData(m);
    });
    return () => { alive = false; };
  }, []);

  // Conversor de data US "M/D/YYYY" → ISO "YYYY-MM-DD"
  const toIso = (s: string): string => {
    const [m, d, y] = (s || "").split("/");
    if (!y) return "";
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };

  /** Constrói um FieldTorneio sintético para um tcode passado.
   *  Estratégia em cascata:
   *    1. member-history-slim (`mh`) — preferido (tem todos os escalões).
   *    2. uskids-results.json (`uskRes`) — fallback quando mh ainda não
   *       cobre o torneio (caso típico: torneio acabou hoje/ontem).
   *  Devolve null se nenhuma fonte tiver dados. */
  const buildSyntheticTorneio = (tcode: string): FieldTorneio | null => {
    // Fonte 1: member-history-slim
    if (mh) {
      const meta = mh.torneios[tcode];
      if (meta) {
        const byAgeGroup: Record<string, FieldPlayer[]> = {};
        for (const p of Object.values(mh.jogadores)) {
          const t = p.torneios[tcode];
          if (!t) continue;
          const ag = t.ageGroup || "Geral";
          if (!byAgeGroup[ag]) byAgeGroup[ag] = [];
          byAgeGroup[ag].push({ nome: p.name, pais: p.country || "" });
        }
        // Se mh já tem jogadores, é a fonte preferida.
        if (Object.keys(byAgeGroup).length > 0) {
          const escaloes = Object.entries(byAgeGroup).map(([nome, jogadores]) => ({ nome, jogadores }));
          return {
            t: parseInt(tcode, 10),
            name: meta.name,
            date_inicio: meta.startDate,
            escaloes,
          };
        }
      }
    }
    // Fonte 2: uskids-results.json — usar leaderboard da R1 (jogadores que
    // saíram a jogar) como field do torneio. Dedup por nome+país dentro
    // do escalão.
    if (uskRes) {
      const tNum = parseInt(tcode, 10);
      const torn = uskRes.resultados?.find(r => r.t === tNum);
      if (torn && torn.escaloes && torn.escaloes.length > 0) {
        const escaloes: FieldEscalao[] = [];
        for (const esc of torn.escaloes) {
          if (!esc.nome) continue;
          const r1 = esc.rondas?.find(r => r.ronda === 1) || esc.rondas?.[0];
          const lb = r1?.leaderboard || [];
          const seen = new Set<string>();
          const jogadores: FieldPlayer[] = [];
          for (const p of lb) {
            const nome = (p.nome || "").trim().replace(/\s+/g, " ");
            if (!nome) continue;
            const key = nome.toLowerCase() + "|" + (p.pais || "");
            if (seen.has(key)) continue;
            seen.add(key);
            jogadores.push({ nome, pais: p.pais || "", cidade: p.cidade });
          }
          if (jogadores.length > 0) escaloes.push({ nome: esc.nome, jogadores });
        }
        if (escaloes.length > 0) {
          // date_inicio em formato M/D/YYYY (compatível com toIso).
          return {
            t: tNum,
            name: torn.name,
            date_inicio: torn.date_inicio || "",
            escaloes,
          };
        }
      }
    }
    return null;
  };

  // Lista de torneios seleccionáveis no dropdown:
  //   • FUTUROS: UP_TORN ∩ uskids-field.json (3 entradas relevantes)
  //   • PASSADOS: todos os tcodes que Manuel jogou (de member-history-slim).
  //
  // Ordenados por data: futuros ascendente (próximo primeiro), passados
  // descendente (mais recente primeiro). Junta-se as duas listas.
  const futureTorneios = useMemo<FieldTorneio[]>(() => {
    if (!field && !mh && !uskRes) return [];
    const today = new Date().toISOString().slice(0, 10);
    const out: FieldTorneio[] = [];
    const seenTcodes = new Set<string>();

    // 1) Futuros (UP_TORN ∩ field)
    if (field) {
      const relevantTcodes = new Set(UP_TORN.map(u => u.tcode).filter(Boolean) as string[]);
      const fut = field.torneios
        .filter(t => relevantTcodes.has(String(t.t)))
        .filter(t => {
          const iso = toIso(t.date_inicio);
          return iso && iso >= today;
        })
        .sort((a, b) => toIso(a.date_inicio).localeCompare(toIso(b.date_inicio)));
      for (const ft of fut) {
        out.push(ft);
        seenTcodes.add(String(ft.t));
      }
    }

    // 2) Passados — candidatos vêm de várias fontes:
    //    a) tcodes que Manuel jogou (mh.jogadores[*].torneios) — fonte primária.
    //       Manuel tem 2 mids (legacy 605933 + actual 630106); apanhamos a
    //       UNIÃO de todos os mids cujo nome normalizado bate em qualquer alias.
    //    b) tcodes do UP_TORN cuja data já passou — mesmo que Manuel ainda
    //       não esteja em mh (típico: torneio acabou hoje, member-history
    //       demora a actualizar). Usa uskids-results.json como fonte.
    {
      const candidateTcodes = new Set<string>();
      // (a) tcodes do Manuel via mh
      if (mh) {
        const manuelAliases = new Set([
          "manuel medeiros",
          "manuel francisco medeiros",
          "manuel goulartt medeiros",
          "manuel francisco goulartt de medeiros",
        ]);
        for (const p of Object.values(mh.jogadores)) {
          const k = normName(p.name);
          if (!manuelAliases.has(k)) continue;
          for (const tcode of Object.keys(p.torneios)) candidateTcodes.add(tcode);
        }
      }
      // (b) UP_TORN com data passada — descoberta via mh.torneios OU uskRes
      for (const ut of UP_TORN) {
        if (!ut.tcode) continue;
        let startIso = "";
        if (mh && mh.torneios[ut.tcode]) startIso = toIso(mh.torneios[ut.tcode].startDate);
        if (!startIso && uskRes) {
          const r = uskRes.resultados?.find(x => x.t === parseInt(ut.tcode!, 10));
          if (r?.date_inicio) startIso = toIso(r.date_inicio);
        }
        if (startIso && startIso < today) candidateTcodes.add(ut.tcode);
      }

      const pastTcodes: Array<{ tcode: string; iso: string }> = [];
      for (const tcode of candidateTcodes) {
        if (seenTcodes.has(tcode)) continue;
        if (HIDDEN_TCODES.has(tcode)) continue; // blacklist (El Prat, Desert)
        // Resolver iso a partir da melhor fonte disponível
        let iso = "";
        if (mh && mh.torneios[tcode]) iso = toIso(mh.torneios[tcode].startDate);
        if (!iso && uskRes) {
          const r = uskRes.resultados?.find(x => x.t === parseInt(tcode, 10));
          if (r?.date_inicio) iso = toIso(r.date_inicio);
        }
        if (!iso) continue;
        // Filtro: só incluir torneios que tenham dados no escalão actual (ou
        // num range que inclua o user — ex: Boys 12 dentro de "Boys 11-12").
        const synth = buildSyntheticTorneio(tcode);
        if (!synth) continue;
        const hasEscalao = synth.escaloes.some(e => escalaoMatches(escalaoNome, e.nome) && (e.jogadores?.length ?? 0) > 0);
        if (!hasEscalao) continue;
        pastTcodes.push({ tcode, iso });
      }
      // Ordenar desc (mais recente primeiro)
      pastTcodes.sort((a, b) => b.iso.localeCompare(a.iso));
      for (const { tcode } of pastTcodes) {
        const synth = buildSyntheticTorneio(tcode);
        if (synth && synth.escaloes.length > 0) {
          out.push(synth);
          seenTcodes.add(tcode);
        }
      }
    }

    // 3) EXTRA via autoRivals — SCAN DINÂMICO de todos os tids cujo prefixo
    //    é wjgc/doral/eowagr. Substitui o EXTRA_TIDS hardcoded incompleto.
    //    Para cada tid: cria FieldTorneio sintético com todos os players que
    //    têm resultado nesse tid.
    if (autoRivals) {
      // 1. Descobrir todos os tids EXTRA presentes nos dados
      const allExtraTids = new Set<string>();
      for (const p of autoRivals) {
        for (const tid of Object.keys(p.r)) {
          if (EXTRA_TID_PREFIXES.some(pre => tid.startsWith(pre))) allExtraTids.add(tid);
        }
      }
      // 2. Para cada tid, construir entrada
      interface DynExtra { tid: string; name: string; players: FieldPlayer[]; year: number; escalao: string }
      const dyn: DynExtra[] = [];
      const ynow = new Date().getFullYear() % 100;
      for (const tid of allExtraTids) {
        const players: FieldPlayer[] = [];
        for (const p of autoRivals) {
          if (p.r[tid]) players.push({ nome: p.n, pais: (p as any).co || "" });
        }
        if (players.length === 0) continue;
        // Derivar ano + escalão do tid. Formatos possíveis:
        //   "doral25_b1011"          → year=25, escalao=Boys 10-11
        //   "wjgc26_1213"            → year=26, escalao=Boys 12-13
        //   "wjgc-wjgc_2025_b1011"   → year=25 (2025), escalao=Boys 10-11 (do flightKey via canonical)
        //   "eowagr-eowagr25_contest77" → year=25, escalao=Geral
        let year = ynow;
        // Procura QUALQUER sequência 20XX (4 dígitos) ou XX (2 dígitos depois de prefixo/separador)
        const y4 = tid.match(/20(\d{2})/);
        if (y4) {
          year = parseInt(y4[1], 10);
        } else {
          // Match curto: wjgc26, doral25, eowagr25
          const ys = tid.match(/(?:wjgc|doral|eowagr)(\d{2})(?:[_\-]|$)/);
          if (ys) year = parseInt(ys[1], 10);
        }

        let escalao = "Geral";
        // Padrões: _b89, _b1011, _b1213 (formato compacto)
        const bCompact = tid.match(/_b(\d{2,4})(?:[_\-]|$)/);
        if (bCompact) {
          const a = bCompact[1];
          if (a.length === 2) escalao = `Boys ${a[0]}-${a[1]}`; // "89" → "Boys 8-9"
          else if (a.length === 4) escalao = `Boys ${a.slice(0, 2)}-${a.slice(2)}`; // "1011" → "Boys 10-11"
          else escalao = `Boys ${a}`;
        } else if (/_1213(?:[_\-]|$)/.test(tid)) escalao = "Boys 12-13";
        else if (/_89(?:[_\-]|$)/.test(tid)) escalao = "Boys 8-9";
        else if (/_1011(?:[_\-]|$)/.test(tid)) escalao = "Boys 10-11";
        else if (/_b7u(?:[_\-]|$)/.test(tid)) escalao = "Boys 7&Under";
        else if (/_bwagr(?:[_\-]|$)/.test(tid)) escalao = "WAGR";
        else if (/_gwagr(?:[_\-]|$)/.test(tid)) escalao = "Girls WAGR";
        else if (/_g1213(?:[_\-]|$)/.test(tid)) escalao = "Girls 12-13";
        else if (/_b7(?:[_\-]|$)/.test(tid)) escalao = "Boys 7";
        else if (/^wjgc\d{2}$/.test(tid)) escalao = "Boys 10-11"; // wjgc26 (legacy)
        // Display name
        const yfull = year < 50 ? 2000 + year : 1900 + year;
        let displayName = "";
        if (tid.startsWith("wjgc")) displayName = `WJGC ${yfull}` + (escalao !== "Geral" ? ` ${escalao}` : "");
        else if (tid.startsWith("doral")) displayName = `Doral ${yfull}` + (escalao !== "Geral" ? ` ${escalao}` : "");
        else if (tid.startsWith("eowagr")) displayName = `EOWAGR ${yfull}` + (escalao !== "Geral" ? ` ${escalao}` : "");
        else displayName = tid;
        dyn.push({ tid, name: displayName, players, year, escalao });
      }
      // Ordenar: ano desc, depois nome
      dyn.sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
      // Atribuir IDs negativos (a partir de -200 para não colidir com FFG -101..)
      let nextNeg = -200;
      for (const d of dyn) {
        // dateUS de fallback (1 Jan do ano)
        const yfull = d.year < 50 ? 2000 + d.year : 1900 + d.year;
        const dateUS = `1/1/${yfull}`;
        out.push({
          t: nextNeg--,
          name: d.name,
          date_inicio: dateUS,
          escaloes: [{ nome: d.escalao, jogadores: d.players }],
        });
      }
    }

    // 4) FFG Internationaux U14 — disponível para Boys 9-14 (U14 inclui Boys 12)
    {
      const userRange = parseEscalaoRange(escalaoNome);
      // U14 = [0, 14] — mostrar se o user escalao está dentro deste range
      const showFFG = userRange ? userRange[0] <= 14 : true;
      if (showFFG) {
        for (const def of FFG_FILES) {
          const d = ffgData.get(def.neg);
          if (!d) continue;
          const players = (d.players || []).filter(p => p.name);
          if (players.length === 0) continue; // edição futura sem field ainda
          // Converter para FieldPlayer[]
          const fps: FieldPlayer[] = players.map(p => ({
            nome: p.name || "?",
            pais: (p.country || "").replace(/^GB-GBN$/, "GB"),
          }));
          // dateUS no formato M/D/YYYY (apenas o mês/dia + ano)
          const dateUS = `${def.dateMM_DD}/${def.year}`;
          out.push({
            t: def.neg,
            name: def.name,
            date_inicio: dateUS,
            escaloes: [{ nome: "U14", jogadores: fps }],
          });
        }
      }
    }

    return out;
  }, [field, mh, autoRivals, ffgData, escalaoNome, uskRes]);

  // Escalões disponíveis para o torneio escolhido
  const escaloesDisponiveis = useMemo(() => {
    const t = futureTorneios.find(x => x.t === torneioT);
    if (!t) return [] as string[];
    return t.escaloes.filter(e => (e.jogadores?.length ?? 0) > 0).map(e => e.nome);
  }, [futureTorneios, torneioT]);

  // Auto-normalização: quando `futureTorneios` muda (load async ou re-cálculo),
  // garantir que `torneioT` e `escalaoNome` apontam para algo válido. Sem
  // isto, o `defaultT/defaultEscalao` pode ficar bloqueado num torneio que
  // não tem o escalão pedido (caso real: European 2026 saiu do field; WC
  // tem Boys 12 mas o escalão fica "" no select se algo falhou antes).
  useEffect(() => {
    if (futureTorneios.length === 0) return;
    // 1) Se o torneio actual não existe, fixar no primeiro disponível
    const currentTorneio = futureTorneios.find(x => x.t === torneioT);
    if (!currentTorneio) {
      const first = futureTorneios[0];
      setTorneioT(first.t);
      const firstEsc = first.escaloes.find(e => e.nome === escalaoNome && (e.jogadores?.length ?? 0) > 0)
        || first.escaloes.find(e => (e.jogadores?.length ?? 0) > 0);
      if (firstEsc) setEscalaoNome(firstEsc.nome);
      return;
    }
    // 2) Se o escalão actual não existe (ou está vazio) para este torneio,
    //    escolher o primeiro escalão COM jogadores.
    const currentEsc = currentTorneio.escaloes.find(e => e.nome === escalaoNome && (e.jogadores?.length ?? 0) > 0);
    if (!currentEsc) {
      const firstEsc = currentTorneio.escaloes.find(e => (e.jogadores?.length ?? 0) > 0);
      if (firstEsc) setEscalaoNome(firstEsc.nome);
    }
  }, [futureTorneios, torneioT, escalaoNome]);

  // Construir dataset {D, T, UP, manuel, AVG_R, T_WEIGHTS, allCountries}
  const dataset = useMemo(() => {
    if (!field || !mh) return null;
    // O torneio pode vir de 3 fontes:
    //   • uskids-field (futuro com inscrições)
    //   • member-history-slim (passado USKids, via buildSyntheticTorneio)
    //   • EXTRA (WJGC/EOWAGR/Doral, tcode negativo — já construído em futureTorneios)
    let torneio: FieldTorneio | undefined;
    if (torneioT < 0) {
      // EXTRA — buscar directamente em futureTorneios (já tem o synthetic populado)
      torneio = futureTorneios.find(x => x.t === torneioT);
    } else {
      torneio = field.torneios.find(t => t.t === torneioT);
      if (!torneio) {
        const synth = buildSyntheticTorneio(String(torneioT));
        if (synth) torneio = synth;
      }
    }
    if (!torneio) return null;
    const esc = torneio.escaloes.find(e => e.nome === escalaoNome);
    if (!esc?.jogadores?.length) return null;

    // Index por nome normalizado → memberId
    const nameToMid: Record<string, string> = {};
    for (const [mid, p] of Object.entries(mh.jogadores)) {
      const k = normName(p.name);
      if (k) nameToMid[k] = mid;
    }
    // Fuzzy fallback por first+last
    function findMid(nome: string): string | null {
      const k = normName(nome);
      if (nameToMid[k]) return nameToMid[k];
      const parts = k.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        const first = parts[0], last = parts[parts.length - 1];
        for (const [kk, mid] of Object.entries(nameToMid)) {
          const kp = kk.split(/\s+/).filter(Boolean);
          if (kp[0] === first && kp[kp.length - 1] === last) return mid;
        }
      }
      return null;
    }

    const isManuelName = (n: string) => normName(n).includes("manuel medeiros");

    // ── PASSO 1: descobrir tcodes comuns entre os jogadores do escalão ──
    const tcodeCount = new Map<string, number>();
    const fieldMids: Array<{ p: FieldPlayer; mid: string | null; isM: boolean }> = [];
    const manuelMid = findMid("Manuel Medeiros");

    // Manuel REF (sempre presente, mesmo se não inscrito neste escalão)
    if (manuelMid && !esc.jogadores.some(p => isManuelName(p.nome))) {
      fieldMids.push({ p: { nome: "Manuel Medeiros", pais: "PT" }, mid: manuelMid, isM: true });
    }
    for (const p of esc.jogadores) {
      const mid = findMid(p.nome);
      fieldMids.push({ p, mid, isM: isManuelName(p.nome) });
    }

    // Contagem
    for (const fm of fieldMids) {
      if (!fm.mid) continue;
      const prof = mh.jogadores[fm.mid];
      for (const tcode of Object.keys(prof.torneios)) {
        tcodeCount.set(tcode, (tcodeCount.get(tcode) ?? 0) + 1);
      }
    }

    // ── PASSO 2: seleccionar tcodes a mostrar ──
    // Inclui TODOS os canónicos (mesmo com 0 participantes do escalão actual —
    // são bons indicadores de nível) + não-canónicos com >= MIN_PARTICIPANTS.
    const allTcodes = new Set<string>([...CANONICAL_TCODES, ...tcodeCount.keys()]);
    const selectedTcodes = [...allTcodes]
      .filter(tcode => {
        // Canónicos: sempre incluir (se metadata existe)
        if (CANONICAL_TCODES.has(tcode)) return !!mh.torneios[tcode];
        // Não-canónicos: precisam de MIN_PARTICIPANTS
        return (tcodeCount.get(tcode) ?? 0) >= MIN_PARTICIPANTS;
      })
      .sort((a, b) => {
        // ordenar por data desc (mais recente primeiro)
        const da = mh.torneios[a]?.startDate || "";
        const db = mh.torneios[b]?.startDate || "";
        const pa = da.split("/").map(Number); // M/D/YYYY
        const pb = db.split("/").map(Number);
        const dateA = (pa[2] || 0) * 10000 + (pa[0] || 0) * 100 + (pa[1] || 0);
        const dateB = (pb[2] || 0) * 10000 + (pb[0] || 0) * 100 + (pb[1] || 0);
        return dateB - dateA;
      })
      .slice(0, MAX_COLUMNS)
      .map(tcode => ({ tcode, count: tcodeCount.get(tcode) ?? 0 }));

    // ── PASSO 3: construir TournDef[] a partir dos tcodes seleccionados ──
    function shortName(name: string): string {
      // "European Championship 2024" → "EU '24"; "Venice Open 2025" → "Venice '25"
      const m = name.match(/^(.+?)\s+(\d{4})$/);
      if (!m) return name.slice(0, 12);
      const base = m[1], yr = m[2].slice(2);
      if (/european championship/i.test(base)) return `EU '${yr}`;
      if (/world championship/i.test(base)) return `WC '${yr}`;
      if (/marco simone/i.test(base)) return `M.SIM '${yr}`;
      if (/venice/i.test(base)) return `Venice '${yr}`;
      if (/rome/i.test(base)) return `Rome '${yr}`;
      if (/red white.*blue/i.test(base)) return `RWB '${yr}`;
      if (/el prat/i.test(base)) return `El Prat '${yr}`;
      if (/sandestin/i.test(base)) return `Sandestin '${yr}`;
      if (/desert/i.test(base)) return `Desert '${yr}`;
      if (/mississippi/i.test(base)) return `MS '${yr}`;
      // fallback: first 8 chars + apóstrofo + ano
      return `${base.slice(0, 8)} '${yr}`;
    }

    const T: TournDef[] = selectedTcodes.map(({ tcode, count }) => {
      const meta = mh.torneios[tcode];
      const name = meta?.name || `tcode ${tcode}`;
      // Buracos por ronda: usar holesPerRound se existir; senão inferir do array par
      const holes = meta?.holesPerRound ?? (meta?.par && meta.par.length === 9 ? 9 : 18);
      // Par por ronda: sumar APENAS os primeiros `holes` valores
      const par = meta?.par
        ? meta.par.slice(0, holes).reduce((a, b) => a + b, 0)
        : (holes === 9 ? 36 : 72);
      // contar nº max de rondas que algum jogador tem
      let maxRounds = 1;
      for (const fm of fieldMids) {
        if (!fm.mid) continue;
        const tEntry = mh.jogadores[fm.mid].torneios[tcode];
        if (tEntry?.rounds) maxRounds = Math.max(maxRounds, Object.keys(tEntry.rounds).length);
      }
      return {
        id: `usk${tcode}`,
        name,
        short: shortName(name),
        date: meta?.startDate || "",
        rounds: maxRounds,
        par,
        holes,
        field: count,        // proxy: número de jogadores DO ESCALÃO que jogaram
        nations: 0,           // será recalculado abaixo após D estar pronto
        url: signupResultsUrl(tcode),
      };
    });

    // ── PASSO 3b: adicionar tids "extra" (WJGC, EOWAGR, Doral) via autoRivals ──
    // autoRivals tem dados destes torneios em r[tid]. Cruzamos por nome normalizado.
    const arByName: Record<string, AutoRivalPlayer> = {};
    if (autoRivals) {
      for (const ar of autoRivals) {
        const k = normName(ar.n);
        if (k) arByName[k] = ar;
      }
    }
    function findAR(nome: string): AutoRivalPlayer | null {
      const k = normName(nome);
      if (arByName[k]) return arByName[k];
      const parts = k.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        const first = parts[0], last = parts[parts.length - 1];
        for (const [kk, ar] of Object.entries(arByName)) {
          const kp = kk.split(/\s+/).filter(Boolean);
          if (kp[0] === first && kp[kp.length - 1] === last) return ar;
        }
      }
      return null;
    }

    // Contar quantos jogadores do escalão têm dados em cada EXTRA_TID
    const extraCounts = new Map<string, number>();
    const extraData = new Map<string, Map<string, { p: number | string; t: number | null; tp: number | null; rd: number[] }>>(); // tid → playerName → result
    // SCAN DINÂMICO: qualquer tid wjgc/doral/eowagr que algum jogador do field
    // tenha jogado vira coluna (substitui a lista EXTRA_TIDS hardcoded e incompleta).
    const extraRounds = new Map<string, number>(); // tid → nº máx de rondas
    for (const fm of fieldMids) {
      const ar = findAR(fm.p.nome);
      if (!ar) continue;
      for (const tid of Object.keys(ar.r)) {
        if (!EXTRA_TID_PREFIXES.some((pre) => tid.startsWith(pre))) continue;
        const res = ar.r[tid];
        if (!res || res.tp == null) continue;
        const rounds = (res as any).rd as number[] | undefined;
        if (!rounds || rounds.length === 0) continue;
        const total = rounds.reduce((a, b) => a + b, 0);
        const place = (res as any).p as number | undefined;
        extraCounts.set(tid, (extraCounts.get(tid) ?? 0) + 1);
        extraRounds.set(tid, Math.max(extraRounds.get(tid) ?? 0, rounds.length));
        let m = extraData.get(tid);
        if (!m) { m = new Map(); extraData.set(tid, m); }
        m.set(normName(fm.p.nome), {
          p: place && place > 0 ? place : "WD",
          t: total,
          tp: (res as any).tp ?? null,
          rd: rounds,
        });
      }
    }
    // Adicionar cada tid EXTRA com >= 1 participante como coluna (nome + link
    // oficial vindos do canónico via extraTidMeta; par/rondas inferidos do field).
    for (const [tid, count] of extraCounts) {
      if (count < 1) continue;
      const info = describeExtraTid(tid, extraTidMeta.get(tid));
      const nrounds = extraRounds.get(tid) ?? 1;
      // Par por ronda: derivado de (total − toPar) / nº de rondas de um jogador.
      let parPer = 72;
      const m = extraData.get(tid);
      if (m) {
        for (const v of m.values()) {
          if (v.tp != null && v.t != null && v.rd && v.rd.length) {
            parPer = Math.round((v.t - v.tp) / v.rd.length);
            break;
          }
        }
      }
      T.push({
        id: tid,
        name: info.name,
        short: info.short,
        date: info.date,
        rounds: nrounds,
        par: parPer,
        field: count,
        nations: 0,
        url: info.url,
      });
    }
    // ── Ordenar T: agrupar por série, edições antigas → recentes, ─────────
    // séries ordenadas pela sua edição mais antiga.
    function toTs(d: string): number {
      if (!d) return 0;
      if (/\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d).getTime();
      const [m, dd, y] = d.split("/").map(Number);
      if (!y) return 0;
      return new Date(y, (m || 1) - 1, dd || 1).getTime();
    }
    // Extrair "série" do short (ex: "EU '24" → "EU", "WJGC '26 B12-13" → "WJGC B12-13")
    function seriesKey(short: string): string {
      // Tirar a parte do ano '24 / '25 / '26
      return short.replace(/\s*'?\d{2}\s*/g, " ").replace(/\s+/g, " ").trim();
    }
    const seriesOf = new Map<string, string>();      // tid → seriesKey
    const seriesEarliest = new Map<string, number>(); // seriesKey → ts da edição + antiga
    for (const td of T) {
      const sk = seriesKey(td.short);
      seriesOf.set(td.id, sk);
      const ts = toTs(td.date);
      const prev = seriesEarliest.get(sk);
      if (prev == null || ts < prev) seriesEarliest.set(sk, ts);
    }
    T.sort((a, b) => {
      const ska = seriesOf.get(a.id)!;
      const skb = seriesOf.get(b.id)!;
      if (ska !== skb) {
        // séries diferentes: primeiro a prioridade explícita (WC → EU →
        // restantes); depois fallback à edição mais antiga.
        const pa = SERIES_PRIORITY[ska] ?? 100;
        const pb = SERIES_PRIORITY[skb] ?? 100;
        if (pa !== pb) return pa - pb;
        return (seriesEarliest.get(ska) ?? 0) - (seriesEarliest.get(skb) ?? 0);
      }
      // mesma série: ordenar por data asc (antigo → recente)
      return toTs(a.date) - toTs(b.date);
    });
    // Boundary tids: primeiro tid de cada série na ordem final
    const seriesBoundaries = new Set<string>();
    let prevSk: string | null = null;
    for (const td of T) {
      const sk = seriesOf.get(td.id)!;
      if (sk !== prevSk) {
        seriesBoundaries.add(td.id);
        prevSk = sk;
      }
    }

    // ── PASSO 3c: índice de fallback a partir de uskids-results.json ──
    // Quando mh ainda não tem dados de um torneio (típico: torneio acabou
    // hoje/ontem), recuperamos {rounds, place} directamente do leaderboard.
    // O place é calculado por escalão (sort por total ascendente, ties iguais).
    interface UskResEntry { rounds: number[]; place: number | null }
    const uskResByTcode = new Map<string, Map<string, UskResEntry>>();
    if (uskRes) {
      for (const torn of uskRes.resultados ?? []) {
        const tcode = String(torn.t);
        const byName = new Map<string, UskResEntry>();
        for (const esc of torn.escaloes ?? []) {
          // Recolher por jogador: { rn → score } neste escalão
          const players = new Map<string, Record<number, number>>();
          for (const rnd of esc.rondas ?? []) {
            const rn = rnd.ronda ?? 0;
            for (const p of (rnd.leaderboard ?? []) as Array<{ nome?: string; score?: number }>) {
              if (typeof p.score !== "number" || p.score <= 0) continue;
              const nm = normName(p.nome ?? "");
              if (!nm) continue;
              let rec = players.get(nm);
              if (!rec) { rec = {}; players.set(nm, rec); }
              rec[rn] = p.score;
            }
          }
          // Calcular rounds[] em ordem e ranking por total dentro do escalão
          const arr = [...players.entries()].map(([nm, rs]) => {
            const rounds = Object.keys(rs).sort((a, b) => Number(a) - Number(b)).map(rn => rs[Number(rn)]);
            return { nm, rounds, total: rounds.reduce((a, b) => a + b, 0) };
          }).filter(x => x.rounds.length > 0)
            .sort((a, b) => a.total - b.total);
          let prevTotal = -1; let prevPlace = 0;
          for (let i = 0; i < arr.length; i++) {
            const place = arr[i].total === prevTotal ? prevPlace : i + 1;
            prevTotal = arr[i].total; prevPlace = place;
            // Prioridade ao primeiro escalão visto (preferimos o que o jogador
            // jogou de facto vs aparições duplicadas em age groups vizinhos).
            if (!byName.has(arr[i].nm)) {
              byName.set(arr[i].nm, { rounds: arr[i].rounds, place });
            }
          }
        }
        if (byName.size > 0) uskResByTcode.set(tcode, byName);
      }
    }

    // ── PASSO 4: construir D[] com results por torneio seleccionado ──
    const D: RivalPlayer[] = [];
    for (const fm of fieldMids) {
      const r: Record<string, { p: number | string; t: number | null; tp: number | null; rd: number[] }> = {};
      const prof = fm.mid ? mh.jogadores[fm.mid] : null;
      const playerKeyForUR = normName(fm.p.nome);
      for (const td of T) {
        if (!td.id.startsWith("usk")) continue; // skip extras here
        const tcode = td.id.slice(3); // strip "usk" prefix
        let rounds: number[] = [];
        let placeNum = 0;
        // Fonte 1: member-history-slim
        if (prof) {
          const tEntry = prof.torneios[tcode];
          if (tEntry) {
            placeNum = tEntry.place ?? 0;
            rounds = Object.keys(tEntry.rounds).sort((a, b) => Number(a) - Number(b))
              .map(rn => tEntry.rounds[rn].gross)
              .filter(g => g > 0);
          }
        }
        // Fonte 2: uskids-results.json (fallback quando mh ainda não cobre)
        if (rounds.length === 0) {
          const m = uskResByTcode.get(tcode);
          const ur = m?.get(playerKeyForUR);
          if (ur && ur.rounds.length > 0) {
            rounds = ur.rounds;
            placeNum = ur.place ?? 0;
          }
        }
        if (rounds.length === 0) continue;
        const total = rounds.reduce((a, b) => a + b, 0);
        // tp já com par per-round correcto (td.par considera só os `holes` primeiros)
        const tp = td.par > 0 ? total - td.par * rounds.length : null;
        r[td.id] = { p: placeNum > 0 ? placeNum : "WD", t: total, tp, rd: rounds };
      }
      // Preencher tids "extra" a partir do extraData (vindo de autoRivals)
      const playerKey = normName(fm.p.nome);
      for (const [tid, m] of extraData) {
        const data = m.get(playerKey);
        if (data) r[tid] = data;
      }

      const up: string[] = [];
      const upCurrent = UP_TORN.find(u => u.tcode === String(torneioT));
      if (upCurrent && !fm.isM) up.push(upCurrent.id);

      // Buscar DOB do autoRival correspondente (existe quando o loader cruza com players.json)
      const ar = findAR(fm.p.nome);
      const dob = (ar as any)?.dob as string | undefined;

      D.push({
        n: fm.p.nome,
        co: normPaisDisplay(fm.p.pais),
        isM: fm.isM,
        r,
        up: fm.isM ? UP_TORN_FUTURE.map(u => u.id) : up,
        dob,
      });
    }

    if (D.length === 0) return null;

    // Recalcular nations por torneio (contar países únicos de quem jogou)
    for (const td of T) {
      const countries = new Set<string>();
      for (const p of D) {
        if (p.r[td.id]) countries.add(p.co);
      }
      td.nations = countries.size;
    }

    // AVG_R: média + std por ronda em cada torneio
    const AVG_R: Record<string, RoundAvg[]> = {};
    for (const td of T) {
      AVG_R[td.id] = [];
      for (let i = 0; i < td.rounds; i++) {
        const vals = D.filter(p => p.r[td.id] && p.r[td.id].rd && p.r[td.id].rd[i] != null).map(p => p.r[td.id].rd[i]);
        if (vals.length > 1) {
          const m = meanArr(vals) ?? 0;
          const s = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
          AVG_R[td.id][i] = { m, s };
        }
      }
    }

    // T_WEIGHTS — pesos de prestígio
    const maxR = Math.max(1, ...T.map(t => t.intendedRounds || t.rounds));
    const maxF = Math.max(1, ...T.map(t => t.field));
    const maxN = Math.max(1, ...T.map(t => t.nations));
    const T_WEIGHTS: Record<string, number> = {};
    for (const t of T) {
      T_WEIGHTS[t.id] = 0.40 * ((t.intendedRounds || t.rounds) / maxR)
                     + 0.35 * (t.field / maxF)
                     + 0.25 * (t.nations / maxN);
    }

    // Manuel
    const manuel = D.find(p => p.isM) ?? null;
    if (!manuel) return null;

    const allCountries = [...new Set(D.map(p => p.co))].sort();
    return { D, T, UP: UP_TORN_FUTURE, manuel, AVG_R, T_WEIGHTS, allCountries, seriesBoundaries };
  }, [field, mh, torneioT, escalaoNome, autoRivals, futureTorneios, uskRes]);

  // Detectar "famílias" de torneios — séries recorrentes que aparecem múltiplas
  // vezes por ano/escalão (Doral, WJGC, EOWAGR). Quando a família tem >1 edição,
  // o dropdown principal mostra apenas uma entrada e o segundo dropdown deixa
  // o utilizador escolher (Ano × Escalão).
  // IMPORTANTE: este useMemo TEM de vir antes dos early returns abaixo, senão
  // o React queixa-se de "more hooks than during the previous render".
  const familyOf = (ft: FieldTorneio): string | null => {
    const m = ft.name.match(/^(WJGC|Doral|EOWAGR)\b/);
    return m ? m[1] : null;
  };
  const familias = useMemo(() => {
    const m = new Map<string, FieldTorneio[]>();
    for (const ft of futureTorneios) {
      const fam = familyOf(ft);
      if (!fam) continue;
      if (!m.has(fam)) m.set(fam, []);
      m.get(fam)!.push(ft);
    }
    // Manter só famílias com >1 entrada (senão fica como entrada normal)
    for (const [k, v] of [...m.entries()]) {
      if (v.length < 2) m.delete(k);
    }
    // Ordenar cada família por ano desc (mais recente primeiro)
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const ya = parseInt(a.name.match(/(\d{4})/)?.[1] || "0", 10);
        const yb = parseInt(b.name.match(/(\d{4})/)?.[1] || "0", 10);
        if (yb !== ya) return yb - ya;
        return (a.escaloes[0]?.nome || "").localeCompare(b.escaloes[0]?.nome || "");
      });
    }
    return m;
  }, [futureTorneios]);

  // Render — early returns DEPOIS de todos os hooks acima estarem chamados.
  if (!field || !mh) {
    return <LoadingState message="A carregar dados de torneios futuros…" />;
  }
  if (futureTorneios.length === 0) {
    return <div className="muted p-16">Sem torneios futuros disponíveis.</div>;
  }

  // Torneio actual seleccionado — usado para mostrar data/campo na barra
  const torneioSelecionado = futureTorneios.find(x => x.t === torneioT) || null;
  const currentFamilia = torneioSelecionado ? familyOf(torneioSelecionado) : null;
  const isFamilyMode = !!(currentFamilia && familias.has(currentFamilia));
  const dropdown1Value = isFamilyMode ? `family:${currentFamilia}` : String(torneioT);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--fs-12)", color: "var(--text-3)", fontWeight: 500 }}>Torneio</span>
        <select
          className="select fs-13"
          value={dropdown1Value}
          onChange={e => {
            const v = e.target.value;
            // Famílias agrupadas (Doral/WJGC/EOWAGR) — escolher a edição mais
            // recente como default; o utilizador afina depois no dropdown ao lado.
            if (v.startsWith("family:")) {
              const fam = v.slice("family:".length);
              const entries = familias.get(fam) || [];
              if (entries.length > 0) {
                const first = entries[0];
                setTorneioT(first.t);
                setEscalaoNome(first.escaloes[0]?.nome ?? "");
              }
              return;
            }
            const newT = parseInt(v);
            setTorneioT(newT);
            const newTorn = futureTorneios.find(x => x.t === newT);
            const newEsc = newTorn?.escaloes.find(e => e.nome === escalaoNome);
            if (!newEsc) setEscalaoNome(newTorn?.escaloes[0]?.nome ?? "");
          }}
        >
          {(() => {
            const UP_T_SET = new Set(UP_TORN.map(u => u.tcode));
            const todayIso = new Date().toISOString().slice(0, 10);
            const fmtDate = (us: string) => {
              const iso = (s => { const [m2,d2,y2]=(s||"").split("/"); return y2?`${y2}-${String(m2).padStart(2,"0")}-${String(d2).padStart(2,"0")}`:s; })(us);
              if (!iso || !iso.includes("-")) return us;
              const [y, m, d] = iso.split("-");
              return `${d}/${m}/${y}`;
            };
            const groupOf = (e: FieldTorneio): string => {
              if (e.t > 0) {
                if (UP_T_SET.has(String(e.t))) {
                  const [m2,d2,y2]=(e.date_inicio||"").split("/");
                  const iso = y2?`${y2}-${String(m2).padStart(2,"0")}-${String(d2).padStart(2,"0")}`:"";
                  if (iso && iso >= todayIso) return "Próximos torneios";
                }
                return "Passados USKids (Manuel)";
              }
              if (e.t > -100) return "Outros";
              if (e.t > -200) return "FFG · Internationaux U14";
              // -200+: famílias agrupáveis aparecem só como o nome da série.
              const fam = familyOf(e);
              if (fam) return fam;
              return "Outros";
            };
            const groups = new Map<string, FieldTorneio[]>();
            for (const ft of futureTorneios) {
              const g = groupOf(ft);
              let arr = groups.get(g);
              if (!arr) { arr = []; groups.set(g, arr); }
              arr.push(ft);
            }
            const groupOrder = [
              "Próximos torneios",
              "Passados USKids (Manuel)",
              "WJGC",
              "Doral",
              "EOWAGR",
              "FFG · Internationaux U14",
              "Outros",
            ];
            const seen = new Set<string>();
            const ordered: Array<[string, FieldTorneio[]]> = [];
            for (const g of groupOrder) {
              if (groups.has(g)) { ordered.push([g, groups.get(g)!]); seen.add(g); }
            }
            for (const [g, arr] of groups) {
              if (!seen.has(g)) ordered.push([g, arr]);
            }
            return ordered.map(([groupLabel, items]) => {
              // Família agrupada: 1 só opção (a escolha de ano/escalão vai
              // para o segundo dropdown).
              if (familias.has(groupLabel)) {
                return (
                  <option key={`family-${groupLabel}`} value={`family:${groupLabel}`}>
                    {(() => {
                      // Contar anos únicos (edição = ano), não combinações
                      // ano×escalão. Ex: Doral B10-11 2018-2025 + B12-13 2024 →
                      // 8 anos, não 9 entradas.
                      const anos = new Set<string>();
                      for (const ft of items) {
                        const y = ft.name.match(/(\d{4})/)?.[1];
                        if (y) anos.add(y);
                      }
                      const n = anos.size || items.length;
                      return `${groupLabel} (${n} ${n === 1 ? "edição" : "edições"})`;
                    })()}
                  </option>
                );
              }
              return (
                <optgroup key={groupLabel} label={groupLabel}>
                  {items.map(t => (
                    <option key={t.t} value={t.t}>{t.name} ({fmtDate(t.date_inicio)})</option>
                  ))}
                </optgroup>
              );
            });
          })()}
        </select>
        <span style={{ fontSize: "var(--fs-12)", color: "var(--text-3)", fontWeight: 500 }}>
          {isFamilyMode ? "Edição" : "Escalão"}
        </span>
        <select
          className="select fs-13"
          value={isFamilyMode ? `esc:${escalaoNome}` : escalaoNome}
          onChange={e => {
            if (isFamilyMode) {
              const v = e.target.value;
              const escolhido = v.startsWith("esc:") ? v.slice("esc:".length) : v;
              // Encontrar a edição mais recente desse escalão na família
              // (familia já vem ordenada por ano desc, logo o primeiro match
              // é o mais recente). O torneio principal usado na tab Jogadores
              // passa a ser essa edição; a tab Scores agrega todas as edições
              // do escalão automaticamente.
              const family = familias.get(currentFamilia!) || [];
              const target = family.find(ft => (ft.escaloes[0]?.nome || "Geral") === escolhido);
              if (target) {
                setTorneioT(target.t);
                setEscalaoNome(escolhido);
              }
            } else {
              setEscalaoNome(e.target.value);
            }
          }}
        >
          {isFamilyMode
            ? (() => {
                // Escalões únicos da família — sem repetir por ano. A escolha
                // de "Boys 10-11" agrega todas as edições disponíveis na vista.
                const seen = new Set<string>();
                const opts: string[] = [];
                for (const ft of (familias.get(currentFamilia!) || [])) {
                  const esc = ft.escaloes[0]?.nome || "Geral";
                  if (!seen.has(esc)) { seen.add(esc); opts.push(esc); }
                }
                // Ordenar por idade ascendente. Escalões sem range numérico
                // (WAGR, Girls WAGR, Geral) ficam no fim. Boys antes de Girls
                // quando idades iguais.
                const sortKey = (esc: string): [number, number, string] => {
                  const range = parseEscalaoRange(esc);
                  if (!range) return [9999, 0, esc.toLowerCase()];
                  const isGirls = /girls/i.test(esc);
                  return [range[0], isGirls ? 1 : 0, esc.toLowerCase()];
                };
                opts.sort((a, b) => {
                  const ka = sortKey(a);
                  const kb = sortKey(b);
                  if (ka[0] !== kb[0]) return ka[0] - kb[0];
                  if (ka[1] !== kb[1]) return ka[1] - kb[1];
                  return ka[2].localeCompare(kb[2]);
                });
                return opts.map(esc => (
                  <option key={esc} value={`esc:${esc}`}>{esc}</option>
                ));
              })()
            : escaloesDisponiveis.map(n => <option key={n} value={n}>{n}</option>)
          }
        </select>
        {torneioSelecionado && (
          <span style={{
            marginLeft: "auto",
            fontSize: "var(--fs-12)",
            color: "var(--text-3)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}>
            <span>{torneioSelecionado.date_inicio}</span>
            {(() => {
              const hub = UP_TORN.find(u => u.tcode === String(torneioT))?.hub;
              return hub ? (
                <a href={hub} target="_blank" rel="noreferrer"
                   style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
                   title="Player Hub oficial USKids">
                  🔗 Player Hub
                </a>
              ) : null;
            })()}
          </span>
        )}
      </div>

      <div className="tabbar-under" role="tablist">
        <button type="button" role="tab" aria-selected={activeTab === "players"}
          className={"tab-under" + (activeTab === "players" ? " active" : "")}
          onClick={() => setActiveTab("players")}>
          Jogadores
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "scout"}
          className={"tab-under" + (activeTab === "scout" ? " active" : "")}
          onClick={() => setActiveTab("scout")}>
          🔭 Scout
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "scores"}
          className={"tab-under" + (activeTab === "scores" ? " active" : "")}
          onClick={() => setActiveTab("scores")}>
          Scores
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "scorecards"}
          className={"tab-under" + (activeTab === "scorecards" ? " active" : "")}
          onClick={() => setActiveTab("scorecards")}>
          Scorecards
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "campo"}
          className={"tab-under" + (activeTab === "campo" ? " active" : "")}
          onClick={() => setActiveTab("campo")}>
          O Campo
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "previsao"}
          className={"tab-under" + (activeTab === "previsao" ? " active" : "")}
          onClick={() => setActiveTab("previsao")}>
          🔮 Previsão
        </button>
      </div>

      {/* Faixa de cabeçalho consistente por sub-tab (padrão único). */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        margin: "12px 0 10px", paddingBottom: 8, borderBottom: "1px solid var(--border-light)",
      }}>
        {(() => {
          const meta: Record<string, { icon: string; title: string; desc: string }> = {
            players: { icon: "🏌️", title: "Jogadores", desc: "Rivais inscritos e o histórico deles nos circuitos." },
            scout: { icon: "🔭", title: "Scout", desc: "Ficha individual de cada rival." },
            scores: { icon: "📊", title: "Scores", desc: "Totais por ronda nas edições passadas." },
            scorecards: { icon: "🗂️", title: "Scorecards", desc: "Pancadas buraco-a-buraco dos finishers." },
            campo: { icon: "⛳", title: "O Campo", desc: "Anatomia do campo e tee do escalão." },
            previsao: { icon: "🔮", title: "Previsão", desc: "O que o Manuel é capaz de fazer neste campo." },
          };
          const m = meta[activeTab];
          if (!m) return null;
          return (
            <>
              <span style={{ fontSize: "var(--fs-20, 20px)", lineHeight: 1 }}>{m.icon}</span>
              <span style={{ fontWeight: 800, fontSize: "var(--fs-16, 16px)" }}>{m.title}</span>
              <span className="muted fs-12">{m.desc}</span>
            </>
          );
        })()}
      </div>

      {activeTab === "players" && (
        dataset
          ? <RivaisDashboard
              onSelectPlayer={onSelectPlayer}
              D={dataset.D}
              T={dataset.T}
              UP={dataset.UP}
              manuel={dataset.manuel}
              T_WEIGHTS={dataset.T_WEIGHTS}
              AVG_R={dataset.AVG_R}
              allCountries={dataset.allCountries}
              showManuelKpis={false}
              seriesBoundaries={dataset.seriesBoundaries}
              fieldMode={true}
              noScroll={true}
              tournamentDate={(() => {
                const t = futureTorneios.find(x => x.t === torneioT);
                if (!t) return undefined;
                const [m, d, y] = (t.date_inicio || "").split("/");
                if (!y) return undefined;
                return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              })()}
            />
          : <div className="muted p-16">Sem dados para este torneio/escalão.</div>
      )}
      {activeTab === "scores" && (
        <HistoricTopNTable mh={mh} torneio={futureTorneios.find(x => x.t === torneioT) || null} escalaoNome={escalaoNome} autoRivals={autoRivals} />
      )}
      {activeTab === "scorecards" && (
        <HistoricScorecardsTab mh={mh} torneio={futureTorneios.find(x => x.t === torneioT) || null} escalaoNome={escalaoNome} />
      )}
      {activeTab === "campo" && (
        <CourseTab torneio={futureTorneios.find(x => x.t === torneioT) || null} escalaoNome={escalaoNome} mh={mh} />
      )}
      {activeTab === "previsao" && (
        <PrevisaoTab torneio={futureTorneios.find(x => x.t === torneioT) || null} escalaoNome={escalaoNome} mh={mh} />
      )}
      {activeTab === "scout" && (
        <ScoutEmbed
          tid={torneioT > 0 ? "usk" + torneioT : (EXTRA_TID_BY_NEG[torneioT] ?? "")}
          hideNav
          escalao={escalaoNome}
        />
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// HistoricTopNTable — pancadas dos top-40 ao longo dos anos
// Linhas: posição (1, 2, 3, ..., 40)
// Colunas: para cada edição (ano) do MESMO torneio + escalão, mostra R1/R2/R3.
// Dados: uskids-member-history-slim.json (apenas USKids).
// ─────────────────────────────────────────────────────────────────────
function HistoricTopNTable({ mh, torneio, escalaoNome, autoRivals }: {
  mh: MHSlim | null;
  torneio: FieldTorneio | null;
  escalaoNome: string;
  autoRivals?: AutoRivalPlayer[];
}) {
  // Mínimo de jogadores que completaram o torneio para mostrar a edição.
  // 5 (vs 10 anterior) para incluir Irish Open e outros torneios CANONICAL com
  // campos pequenos por escalão (ex: Irish 2021 Boys 12 = 7 jogadores, Irish 2025 = 6).
  const MIN_FIELD_SIZE = 5;
  // Sem cap — mostramos o field inteiro (cada ano pode ter N diferente)
  // Scores impossíveis (data quality): qualquer ronda 18H abaixo deste valor
  // é descartada (jogador tratado como DNF nessa ronda). Ex: WJGC25 Parker
  // Christianson R3=21 → upstream bug.
  const MIN_GROSS_18H = 55;
  const MIN_GROSS_9H = 28;

  const data = useMemo(() => {
    if (!torneio) return null;

    interface RankedEntry {
      name: string;
      country: string;
      total: number;
      rounds: Record<string, number>;
      /** Place oficial USKids (1, 2, T13...). null quando IE/DSQ/WD. */
      officialPlace: number | null;
      /** Posição virtual ordenada por total ASC (entre TODOS, oficiais+IE). */
      wouldBePos?: number;
    }
    interface Edition {
      tcode: string;
      year: string;
      nRounds: number;
      holesPerRound: number;
      fieldSize: number;
      course?: string;
      meters?: number;
      parPerRound?: number; // par total de UMA ronda (ex: 72)
      ranked: RankedEntry[];
    }
    const editions: Edition[] = [];

    // ─────────────────────────────────────────────────────────────────
    // RAMO EXTRA — séries WJGC / Doral / EOWAGR (tcode negativo ≤ -200,
    // sem entrada em member-history-slim). Agregamos via autoRivals
    // todos os tids da série filtrando pelo escalão do utilizador.
    // ─────────────────────────────────────────────────────────────────
    const seriesPrefix = (() => {
      if (torneio.t >= 0) return null;
      const n = torneio.name.toLowerCase();
      if (n.startsWith("wjgc"))   return "wjgc";
      if (n.startsWith("doral"))  return "doral";
      if (n.startsWith("eowagr")) return "eowagr";
      return null;
    })();
    if (seriesPrefix && autoRivals) {
      // 1. Recolher todos os tids da série
      const allTids = new Set<string>();
      for (const p of autoRivals) {
        for (const tid of Object.keys(p.r)) {
          if (tid.toLowerCase().startsWith(seriesPrefix)) allTids.add(tid);
        }
      }

      // Helpers locais reusando a lógica do futureTorneios
      const yearOfTid = (tid: string): number | null => {
        const y4 = tid.match(/20(\d{2})/);
        if (y4) return 2000 + parseInt(y4[1], 10);
        const ys = tid.match(/(?:wjgc|doral|eowagr)(\d{2})(?:[_\-]|$)/);
        if (ys) { const yy = parseInt(ys[1], 10); return yy < 50 ? 2000 + yy : 1900 + yy; }
        return null;
      };
      const escalaoOfTid = (tid: string): string => {
        // Mantém em sincronia com a derivação em futureTorneios — qualquer
        // escalão não capturado cai em "Geral" e passa por escalaoMatches
        // sempre, o que provoca mistura de escalões na tabela. Cobrir tudo.
        const bCompact = tid.match(/_b(\d{2,4})(?:[_\-]|$)/);
        if (bCompact) {
          const a = bCompact[1];
          if (a.length === 2) return `Boys ${a[0]}-${a[1]}`;
          if (a.length === 4) return `Boys ${a.slice(0, 2)}-${a.slice(2)}`;
          return `Boys ${a}`;
        }
        if (/_1213(?:[_\-]|$)/.test(tid)) return "Boys 12-13";
        if (/_89(?:[_\-]|$)/.test(tid))   return "Boys 8-9";
        if (/_1011(?:[_\-]|$)/.test(tid)) return "Boys 10-11";
        if (/_b7u(?:[_\-]|$)/.test(tid))  return "Boys 7&Under";
        if (/_bwagr(?:[_\-]|$)/.test(tid))return "WAGR";
        if (/_gwagr(?:[_\-]|$)/.test(tid))return "Girls WAGR";
        if (/_g1213(?:[_\-]|$)/.test(tid))return "Girls 12-13";
        if (/_b7(?:[_\-]|$)/.test(tid))   return "Boys 7";
        if (/^wjgc\d{2}$/.test(tid))      return "Boys 10-11";
        return "Geral";
      };
      // Match local: respeita o range numérico mas também aceita match exacto
      // por nome (case-insensitive) para escalões não-numéricos (WAGR, etc.).
      const escalaoMatchesLocal = (userEsc: string, candEsc: string): boolean => {
        if (!candEsc) return true;
        if (candEsc.toLowerCase() === userEsc.toLowerCase()) return true;
        return escalaoMatches(userEsc, candEsc);
      };
      const parOfTid = (tid: string): number | undefined => {
        if (tid.startsWith("wjgc25"))   return 71;
        if (tid.startsWith("wjgc26"))   return 72;
        if (tid.startsWith("eowagr"))   return 72;
        if (tid.startsWith("doral")) {
          // Boys 7 / 8-9 / 7&Under jogam 9 buracos → par ~36.
          // Boys 10-11 / 12-13 e restantes 18H → par ~71.
          if (/_b89(?:[_\-]|$)/.test(tid)
              || /_b7u(?:[_\-]|$)/.test(tid)
              || /_b7(?:[_\-]|$)/.test(tid)) return 36;
          return 71;
        }
        return undefined;
      };

      // 2. Para cada tid: filtra por escalão e agrupa por ano
      interface Cand { tid: string; escalao: string; players: number }
      const byYear = new Map<number, Cand[]>();
      for (const tid of allTids) {
        const yr = yearOfTid(tid);
        if (yr == null) continue;
        const escTid = escalaoOfTid(tid);
        if (!escalaoMatchesLocal(escalaoNome, escTid)) continue;
        let count = 0;
        for (const p of autoRivals) { if (p.r[tid]) count++; }
        if (count === 0) continue;
        if (!byYear.has(yr)) byYear.set(yr, []);
        byYear.get(yr)!.push({ tid, escalao: escTid, players: count });
      }

      // 3. Para cada ano: escolher o tid com MAIOR overlap com o escalão pedido
      const userRange = parseEscalaoRange(escalaoNome);
      for (const [year, list] of byYear) {
        list.sort((a, b) => {
          if (userRange) {
            const ra = parseEscalaoRange(a.escalao);
            const rb = parseEscalaoRange(b.escalao);
            if (ra && rb) {
              const oa = Math.min(userRange[1], ra[1]) - Math.max(userRange[0], ra[0]);
              const ob = Math.min(userRange[1], rb[1]) - Math.max(userRange[0], rb[0]);
              if (oa !== ob) return ob - oa;
            }
          }
          return b.players - a.players;
        });
        const chosen = list[0];
        const tid = chosen.tid;
        const par = parOfTid(tid);

        // Construir RankedEntry[] a partir de autoRivals
        const ranked: RankedEntry[] = [];
        let maxRounds = 0;
        const minGross = MIN_GROSS_18H;
        for (const p of autoRivals) {
          const tr = p.r[tid];
          if (!tr) continue;
          const rd: Record<string, number> = {};
          let total = 0;
          let valid = 0;
          const rdArr = tr.rd || [];
          for (let i = 0; i < rdArr.length; i++) {
            const g = rdArr[i];
            if (!g || g <= 0 || g < minGross) continue;
            rd[String(i + 1)] = g;
            total += g;
            valid++;
          }
          if (valid === 0) continue;
          if (valid > maxRounds) maxRounds = valid;
          ranked.push({
            name: p.n,
            country: p.co || "",
            total,
            rounds: rd,
            officialPlace: typeof tr.p === "number" && tr.p > 0 ? tr.p : null,
          });
        }
        const completed = ranked.filter(e => Object.keys(e.rounds).length === maxRounds);
        if (completed.length < MIN_FIELD_SIZE) continue;
        const byTotal = [...completed].sort((a, b) => a.total - b.total);
        byTotal.forEach((e, i) => { e.wouldBePos = i + 1; });
        completed.sort((a, b) => {
          const aOff = a.officialPlace ?? Number.POSITIVE_INFINITY;
          const bOff = b.officialPlace ?? Number.POSITIVE_INFINITY;
          if (aOff !== bOff) return aOff - bOff;
          return a.total - b.total;
        });
        editions.push({
          tcode: tid, year: String(year),
          nRounds: maxRounds, holesPerRound: 18,
          fieldSize: completed.length,
          parPerRound: par,
          ranked: completed,
        });
      }

      if (editions.length === 0) return null;
      editions.sort((a, b) => b.year.localeCompare(a.year));
      const maxPos = Math.max(...editions.map(e => e.ranked.length));
      const seriesLabel = seriesPrefix === "wjgc" ? "WJGC" : seriesPrefix === "doral" ? "Doral" : "EOWAGR";
      return { baseName: seriesLabel, ageGroup: escalaoNome, editions, maxPos };
    }

    // ─────────────────────────────────────────────────────────────────
    // RAMO USKids — usa member-history-slim, agrupando por nome base
    // (ex: "European Championship" agrega 2022/2023/2024/2025).
    // ─────────────────────────────────────────────────────────────────
    if (!mh) return null;
    const baseName = torneio.name.replace(/\s+\d{4}\s*$/, "").trim();
    if (!baseName) return null;

    for (const [tcode, meta] of Object.entries(mh.torneios)) {
      if (!meta?.name) continue;
      if (/Parent\/Child/i.test(meta.name)) continue;
      const mBase = meta.name.replace(/\s+\d{4}\s*$/, "").trim();
      if (mBase !== baseName) continue;
      const yearMatch = meta.name.match(/(\d{4})/);
      if (!yearMatch) continue;
      const year = yearMatch[1];
      const hpr = (meta as any).holesPerRound || 18;
      const minGross = hpr === 9 ? MIN_GROSS_9H : MIN_GROSS_18H;

      const all: RankedEntry[] = [];
      let maxRounds = 0;
      for (const p of Object.values(mh.jogadores)) {
        const tEntry = p.torneios[tcode];
        if (!tEntry) continue;
        if (tEntry.ageGroup !== escalaoNome) continue;
        // Aceitar TODOS os jogadores com rondas válidas (incluindo IE/DSQ/WD).
        // Os que não têm place oficial (null) são marcados visualmente como IE.
        const officialPlace = (typeof tEntry.place === "number" && tEntry.place > 0) ? tEntry.place : null;
        const rd: Record<string, number> = {};
        let total = 0;
        let valid = 0;
        for (const [rn, r] of Object.entries(tEntry.rounds || {})) {
          if (!r || r.gross <= 0) continue;
          if (r.gross < minGross) {
            // Round impossível → ignorada (ex: gross=21 numa volta de 18H).
            continue;
          }
          rd[rn] = r.gross;
          total += r.gross;
          valid++;
        }
        if (valid === 0) continue;
        if (valid > maxRounds) maxRounds = valid;
        all.push({
          name: p.name || "?",
          country: p.country || "",
          total,
          rounds: rd,
          officialPlace,
        });
      }
      const completed = all.filter(e => Object.keys(e.rounds).length === maxRounds);
      if (completed.length < MIN_FIELD_SIZE) continue;
      // Filtro de cobertura: edições antigas (2014-2019) só têm uma fracção dos
      // jogadores no slim (scrape incompleto). Se n_jogadores_com_place / max_place
      // < 0.6, considera-se que o field é incompleto demais para ser representativo.
      // Ex: 2019 Boys 11 → 18 jogadores no slim mas max place=71 → ratio 0.25 → drop.
      // EXCEPÇÃO: torneios em CANONICAL_TCODES foram scrape'd intencionalmente
      // (FULL_FIELD) — mostrar o que temos, mesmo que incompleto.
      if (!CANONICAL_TCODES.has(tcode)) {
        const placedEntries = completed.filter(e => e.officialPlace != null);
        if (placedEntries.length > 0) {
          const maxOfficialPlace = Math.max(...placedEntries.map(e => e.officialPlace!));
          const coverage = placedEntries.length / maxOfficialPlace;
          if (coverage < 0.6) continue; // field incompleto — descarta a edição
        }
      }
      // Calcular "would-be position" — posição que cada jogador teria se TODOS
      // contassem para o ranking (ordenando por total ASC). Necessária para
      // mostrar a posição virtual dos IE/DSQ em parêntesis.
      const byTotal = [...completed].sort((a, b) => a.total - b.total);
      byTotal.forEach((e, i) => { e.wouldBePos = i + 1; });
      // Ordenação final: officialPlace ASC (com place) primeiro, IE/DSQ no fim
      // (ordenados pelo total ASC entre si).
      completed.sort((a, b) => {
        const aOff = a.officialPlace ?? Number.POSITIVE_INFINITY;
        const bOff = b.officialPlace ?? Number.POSITIVE_INFINITY;
        if (aOff !== bOff) return aOff - bOff;
        return a.total - b.total;
      });
      // Tentar buscar course+yards específicos do escalão (byEscalao); fallback para o tcode-level yards
      const escMeta = (meta as any).byEscalao?.[escalaoNome] as MHEscalaoMeta | undefined;
      const yardsArr = escMeta?.yards || (meta as any).yards || [];
      const yardsTotal = Array.isArray(yardsArr) ? yardsArr.reduce((a: number, b: number) => a + (b || 0), 0) : 0;
      const meters = yardsTotal > 0 ? Math.round(yardsTotal * 0.9144) : undefined;
      const parArr = escMeta?.par || (meta as any).par || [];
      const parPerRound = Array.isArray(parArr) ? parArr.reduce((a: number, b: number) => a + (b || 0), 0) : 0;
      editions.push({
        tcode, year, nRounds: maxRounds,
        holesPerRound: hpr,
        fieldSize: completed.length,
        course: escMeta?.course,
        meters,
        parPerRound: parPerRound > 0 ? parPerRound : undefined,
        ranked: completed, // field inteiro — não limitamos
      });
    }

    if (editions.length === 0) return null;
    editions.sort((a, b) => b.year.localeCompare(a.year));
    const maxPos = Math.max(...editions.map(e => e.ranked.length));
    return { baseName, ageGroup: escalaoNome, editions, maxPos };
  }, [mh, torneio, escalaoNome, autoRivals]);

  type SortKey = string;
  // Default: ordem oficial do ano mais recente (rank = índice da edição que
  // já tem IE no fim com wouldBePos definido).
  const defaultSortKey: SortKey = "rank";
  const [sortKey, setSortKey] = useState<SortKey>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  useEffect(() => { setSortKey(defaultSortKey); setSortDir("asc"); }, [defaultSortKey]);

  const sortedRows = useMemo(() => {
    if (!data) return [];
    const rows = Array.from({ length: data.maxPos }, (_, idx) => ({ rank: idx + 1, idx }));
    const mul = sortDir === "asc" ? 1 : -1;
    const SAFE_INF = Number.POSITIVE_INFINITY;
    const getVal = (r: { idx: number; rank: number }): number => {
      if (sortKey === "rank") return r.rank;
      const us = sortKey.indexOf("_");
      const year = sortKey.slice(0, us);
      const col = sortKey.slice(us + 1);
      const ed = data.editions.find(e => e.year === year);
      if (!ed) return SAFE_INF;
      const entry = ed.ranked[r.idx];
      if (!entry) return SAFE_INF;
      if (col === "T") return entry.total;
      if (col === "TP") {
        if (!ed.parPerRound || !ed.nRounds) return SAFE_INF;
        return entry.total - ed.parPerRound * ed.nRounds;
      }
      const rn = col.replace(/^R/, "");
      return entry.rounds[rn] ?? SAFE_INF;
    };
    rows.sort((a, b) => mul * (getVal(a) - getVal(b)));
    return rows;
  }, [data, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };
  const arrow = (k: SortKey) => sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  if (!data) {
    return (
      <div className="muted p-16">
        Sem histórico de pancadas para esta combinação torneio/escalão. (Edições com &ge; {MIN_FIELD_SIZE} jogadores e cobertura &ge; 60% apenas.)
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 10, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--fs-13)", fontWeight: 700, color: "var(--text)" }}>
          Pancadas {data.maxPos === 1 ? "do jogador" : "todos os finishers"}
        </span>
        <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
          {data.baseName} {String.fromCharCode(0xb7)} {data.ageGroup} {String.fromCharCode(0xb7)} {data.editions.length} edi{data.editions.length === 1 ? "ção" : "ções"}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
      <table className="bc-collapse" style={{ fontSize: "var(--fs-11)", fontVariantNumeric: "tabular-nums", width: "max-content" }}>
        <thead>
          <tr style={{ background: "var(--bg-muted)", color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}>
            <th rowSpan={2} onClick={() => onSort("rank")}
                style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, position: "sticky", left: 0, background: "var(--bg-muted)", zIndex: "var(--z-raised)", cursor: "pointer", userSelect: "none", width: 50, minWidth: 50 }}>
              Pos{arrow("rank")}
            </th>
            {data.editions.map((e, ei) => (
              <th key={e.tcode} colSpan={e.nRounds + 2 + (e.parPerRound ? 1 : 0)}
                  style={{ padding: "10px 10px 8px", textAlign: "center", fontWeight: 700, borderLeft: ei === 0 ? "1px solid var(--border)" : "2px solid var(--border)" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  {/* Linha 1: ANO + METROS (destaque) + link ↗ + field-size */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, color: "var(--text)" }}>
                    <span style={{ fontSize: "var(--fs-16)", fontWeight: 700 }}>{e.year}</span>
                    {e.meters && (
                      <span style={{ fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--text-2)" }}>
                        {String.fromCharCode(0xb7)} {e.meters}m
                      </span>
                    )}
                    {/^\d+$/.test(e.tcode) && (
                      <a href={`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${e.tcode}`}
                         target="_blank" rel="noreferrer"
                         onClick={(ev) => ev.stopPropagation()}
                         title="Abrir resultados oficiais USKids/signupanytime"
                         style={{ fontSize: "var(--fs-11)", color: "var(--color-info)", textDecoration: "none", fontWeight: 700 }}>
                        ↗
                      </a>
                    )}
                    <span style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", fontWeight: 500 }}>(n={e.fieldSize})</span>
                  </div>
                  {/* Linha 2: NOME DO CAMPO */}
                  {e.course && (
                    <div style={{ fontSize: "var(--fs-12)", color: "var(--text-2)", fontWeight: 500, lineHeight: 1.2, fontStyle: "italic" }}>
                      {e.course}
                    </div>
                  )}
                </div>
              </th>
            ))}
          </tr>
          <tr style={{ background: "var(--bg-muted)", color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
            {data.editions.flatMap((e, ei) => {
              const cells = [];
              // Nome
              cells.push(
                <th key={`${e.year}_name`}
                    style={{ padding: "3px 6px", textAlign: "left", fontWeight: 600, fontSize: "var(--fs-10)", borderLeft: ei === 0 ? "1px solid var(--border)" : "2px solid var(--border)", width: 150, minWidth: 150 }}>
                  Nome
                </th>
              );
              // T (total) — antes de R1 — sortable, fundo destacado
              const totalKey = `${e.year}_T`;
              cells.push(
              <th key={totalKey} onClick={() => onSort(totalKey)}
                  style={{ padding: "3px 6px", textAlign: "center", fontWeight: 700, fontSize: "var(--fs-10)", background: "var(--bg-card, var(--bg))", color: "var(--text-2)", cursor: "pointer", userSelect: "none", width: 44, minWidth: 44 }}>
                  T{arrow(totalKey)}
                </th>
              );
              // ±par (TP) — diferença para o par total do torneio
              if (e.parPerRound) {
                const tpKey = `${e.year}_TP`;
                cells.push(
                  <th key={tpKey} onClick={() => onSort(tpKey)}
                      title={`Par por ronda: ${e.parPerRound} (total: ${e.parPerRound * e.nRounds})`}
                      style={{ padding: "3px 6px", textAlign: "center", fontWeight: 600, fontSize: "var(--fs-10)", color: "var(--text-3)", cursor: "pointer", userSelect: "none", width: 44, minWidth: 44 }}>
                    ±par{arrow(tpKey)}
                  </th>
                );
              }
              // R1, R2, R3
              for (let i = 0; i < e.nRounds; i++) {
                const key = `${e.year}_R${i + 1}`;
                cells.push(
                  <th key={key} onClick={() => onSort(key)}
                      style={{ padding: "3px 6px", textAlign: "center", fontWeight: 600, fontSize: "var(--fs-10)", cursor: "pointer", userSelect: "none", width: 38, minWidth: 38 }}>
                    R{i + 1}{arrow(key)}
                  </th>
                );
              }
              return cells;
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const pos = row.rank;
            const firstEd = data.editions[0];
            const firstEntry = firstEd?.ranked[row.idx];
            const isIE = firstEntry && firstEntry.officialPlace == null;
            const displayPos = firstEntry?.officialPlace ?? null;
            const medalPos = displayPos ?? 99;
            const medal = medalPos === 1 ? "var(--medal-gold-bg)" : medalPos === 2 ? "var(--medal-silver-bg)" : medalPos === 3 ? "var(--medal-bronze-bg)" : undefined;
            const medalFg = medalPos === 1 ? "var(--medal-gold-fg)" : medalPos === 2 ? "var(--medal-silver-fg)" : medalPos === 3 ? "var(--medal-bronze-fg)" : "var(--text-2)";
            return (
              <tr key={pos} style={{ borderBottom: "1px solid var(--border-light)", opacity: isIE ? 0.75 : 1 }}>
                <td style={{ padding: "4px 8px", fontWeight: 700, color: medalFg, textAlign: "center", position: "sticky", left: 0, background: medal || "var(--bg)", zIndex: "var(--z-base)", whiteSpace: "nowrap" }}>
                  {displayPos != null
                    ? `#${displayPos}`
                    : (
                      <span title={firstEntry?.wouldBePos ? `Sem classificação oficial. Por total seria #${firstEntry.wouldBePos}.` : "Sem classificação oficial"}>
                        — {firstEntry?.wouldBePos != null && (
                          <span style={{ fontSize: "var(--fs-9)", fontWeight: 500, color: "var(--text-3)" }}>
                            ({firstEntry.wouldBePos})
                          </span>
                        )}
                      </span>
                    )}
                </td>
                {data.editions.flatMap((e, ei) => {
                  const entry = e.ranked[row.idx];
                  const cells = [];
                  cells.push(
                    <td key={e.tcode + "_name"} style={{ padding: "4px 6px", borderLeft: ei === 0 ? "1px solid var(--border)" : "2px solid var(--border)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>
                      {entry ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <a href={`/kids2#${encodeURIComponent(entry.name)}`}
                             target="_blank" rel="noreferrer"
                             style={{ color: entry.officialPlace == null ? "var(--text-2)" : "var(--text)", textDecoration: "none", cursor: "pointer", opacity: entry.officialPlace == null ? 0.7 : 1 }}
                             title={entry.officialPlace == null ? `${entry.name} — IE/DSQ/WD (sem classificação oficial)` : `Abrir perfil de ${entry.name} em nova janela`}>
                            {entry.name}
                          </a>
                          {entry.officialPlace == null && (
                            <span title="Sem classificação oficial (IE / DSQ / WD)"
                                  style={{ fontSize: "var(--fs-8)", padding: "0 4px", borderRadius: 3, background: "var(--bg-danger-subtle, #fecaca)", color: "var(--color-danger-dark, #991b1b)", fontWeight: 700, letterSpacing: 0.3 }}>
                              IE
                            </span>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      )}
                    </td>
                  );
                  cells.push(
                    <td key={e.tcode + "_T"} style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, background: "var(--bg-card, var(--bg))", color: entry ? "var(--text)" : "var(--text-3)" }}>
                      {entry ? entry.total : "—"}
                    </td>
                  );
                  if (e.parPerRound) {
                    const tp = entry ? entry.total - e.parPerRound * e.nRounds : null;
                    cells.push(
                      <td key={e.tcode + "_TP"} style={{ padding: "4px 6px", textAlign: "center", fontWeight: 600, color: tpColor(tp) ?? "var(--text-3)" }}>
                        {fmtToPar(tp)}
                      </td>
                    );
                  }
                  for (let ri = 0; ri < e.nRounds; ri++) {
                    const v = entry?.rounds[String(ri + 1)];
                    cells.push(
                      <td key={e.tcode + "_r" + (ri + 1)} style={{ padding: "4px 6px", textAlign: "center", color: v ? "var(--text)" : "var(--text-3)" }}>
                        {v || "—"}
                      </td>
                    );
                  }
                  return cells;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

