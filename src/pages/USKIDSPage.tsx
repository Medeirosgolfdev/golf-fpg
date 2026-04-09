// @refresh reset
import { useEffect, useState, useMemo, useTransition } from "react";
import SidebarToggle from "../ui/SidebarToggle";
import { useMasterDetail } from "../hooks/useMasterDetail";
import React from "react";
import SectionErrorBoundary from "../ui/SectionErrorBoundary";
import LoadingState from "../ui/LoadingState";
import { useSearchParams } from "react-router-dom";
import { C } from "../utils/colors";
import { scClass } from "../utils/scoreDisplay";
import { MONTHS_PT, isoDate, fmtDate, fmtToPar, monthLabel } from "../utils/format";
import { flag, normCountry, normPaisDisplay } from "../utils/flagUtils";
import EmptyState from "../ui/EmptyState";
import { tpColor, isManuel as _isManuel } from "../ui/tournamentPrimitives";
import { TournSidebarItem, type SidebarItemTournament } from "../ui/TournSidebarItem";
import { SIDEBAR_ACCENT, ManuelPill } from "../ui/PillBadge";
/** Wrapper: isManuel para contexto USKids onde o identificador é o nome (string) */
const isManuel = (nome: string): boolean => _isManuel({ name: nome });
import {
  ScorecardLB, AccumulatedLB, AllRoundsScorecardLB, expandMultiRound,
  type Tournament as TATournament,
} from "./FPGPage";
import { buildAutoRivals, normName as normNameAuto, type AutoRivalPlayer, uskTournNames, uskFieldSizes } from "./KIDSdataLoader";
import { cachedFetchJson } from "../data/fetchCache";

// ─────────────────────────────────────────────
// CONTEXTO arMap — partilhado por toda a árvore
// Permite que qualquer componente (incluindo leaderboards) aceda ao arMap
// sem ter de passar a prop manualmente por toda a hierarquia.
// ─────────────────────────────────────────────
const ArMapCtx = React.createContext<Map<string, AutoRivalPlayer>>(new Map());

/** Devolve o elemento ↗ com link para a página Kids do jogador.
 *  Usa memberId quando disponível (resolve antes dos 45 ficheiros carregarem). */
function KidsLink({ nome }: { nome: string }) {
  const arMap = React.useContext(ArMapCtx);
  const arEntry = arMap.get(normNameAuto(nome));
  if (!arEntry) return null;
  const memberId = (arEntry as any).memberId as string | undefined;
  const hash = memberId ?? encodeURIComponent(arEntry.n);
  return (
    <a
      href="/kids"
      onClick={e => { e.preventDefault(); window.open(`/kids#${hash}`, "_blank"); }}
      title="Ver em Kids"
      style={{ fontWeight: 800, color: "var(--color-good-dark)", fontSize: 13,
        cursor: "pointer", textDecoration: "none", flexShrink: 0, marginLeft: 4 }}>
      ↗
    </a>
  );
}

// ─────────────────────────────────────────────
// TIPOS — CAMPO (inscritos)
// ─────────────────────────────────────────────
interface Jogador      { nome: string; pais: string; cidade: string; }
interface PaisContagem { pais: string; n: number; }
interface Escalao {
  age_group: number; nome: string; genero: string | null;
  holes: number; flight_id: number;
  inscritos: number; maximo: number; vagas: number; pct_cheio: number;
  jogadores: Jogador[] | null; paises: PaisContagem[] | null;
}
interface Torneio {
  t: number; name: string; emoji?: string;
  date_inicio: string; date_fim?: string; rondas?: number;
  campo: string | null; fee_18?: string | null;
  total_inscritos: number; total_maximo: number;
  escaloes: Escalao[];
  ultima_atualizacao: string;
  sem_flights?: boolean; erro?: string;
  url_uskids?: string | null;
}
interface GGEntry { pos: number | null; name: string; fed: string | null; club: string; toPar: number | null; gross: number | null; status: string; }
interface GreatgolfData {
  name: string; course: string; dates: string[];
  results: { d1: GGEntry[]; sub14: GGEntry[]; sub12: GGEntry[] };
}

// ── Matching robusto USKids ↔ BJGT ──────────────────────────────

/** Normaliza nomes ALL CAPS para Title Case e limpa espaços duplos.
 *  "GREGORIO VITOLO" → "Gregorio Vitolo"
 *  "LORENZO MARIA TRIOLO" → "Lorenzo Maria Triolo"
 *  "Jean Imperiali De Francavilla" → "Jean Imperiali de Francavilla"
 */
const PARTICLES = new Set(['de','da','do','dos','das','di','del','van','von','den','der','ter','le','la','el','al','y','e']);
function displayName(s: string): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  if (!clean) return clean;
  // Detectar se é ALL CAPS (>80% maiúsculas nas letras)
  const letters = clean.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  const upper = letters.replace(/[^A-ZÀ-Ý]/g, '');
  const isAllCaps = letters.length > 2 && upper.length / letters.length > 0.45;
  if (!isAllCaps) {
    // Não é all caps, só corrigir partículas e espaços
    return clean.split(' ').map((w, i) =>
      i > 0 && PARTICLES.has(w.toLowerCase()) ? w.toLowerCase() : w
    ).join(' ');
  }
  // Converter para Title Case
  return clean.toLowerCase().split(' ').map((w, i) => {
    if (i > 0 && PARTICLES.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

/** Encurta nome de torneio com sufixo de ano: "Rome Classic 2025" → "Rome Classic '25"
 *  "WJGC '26" → "WJGC '26" (já tem), "European Open" → "European Open" */
function shortTornName(s: string): string {
  return s.replace(/\s(\d{4})$/, (_, y) => ` '${y.slice(2)}`);
}

/** Canónico de torneio para dedup. Mapeia variantes para série+ano.
 *  "Venice Open 2025" = "VENICE '25" → "venice-25"
 *  "WJGC '26" = "BJGT 2026" → "wjgc-26"   */
function tornCanon(s: string): string {
  const low = s.toLowerCase().replace(/['']/g, "").trim();
  const y2 = low.match(/\b20(\d{2})\b/)?.[1] || low.match(/(?:^|\s)(\d{2})$/)?.[1] || "";
  const pc = /parent.child/i.test(low) ? "pc" : ""; // Parent/Child = evento separado
  if (/venice/i.test(low))                           return `venice${pc}-${y2}`;
  if (/rome|roma/i.test(low))                        return `rome${pc}-${y2}`;
  if (/marco\s*simone/i.test(low))                   return `marco${pc}-${y2}`;
  if (/wjgc|bjgt|world.*junior.*golf/i.test(low))    return `wjgc${pc}-${y2}`;
  if (/eu\s*open|european\s*open|eowagr/i.test(low)) return `euopen${pc}-${y2}`;
  if (/world\s*champ/i.test(low))                    return `wc${pc}-${y2}`;
  if (/european\s*champ/i.test(low))                 return `ec${pc}-${y2}`;
  if (/red.*white.*blue|rwb/i.test(low))             return `rwb${pc}-${y2}`;
  if (/doral/i.test(low))                            return `doral${pc}-${y2}`;
  if (/great\s*golf/i.test(low))                     return `gg${pc}-${y2}`;
  if (/quinta.*lago|qdl/i.test(low))                 return `qdl${pc}-${y2}`;
  if (/desert/i.test(low))                           return `desert${pc}-${y2}`;
  if (/sandestin/i.test(low))                        return `sandestin${pc}-${y2}`;
  if (/mississippi|msstate/i.test(low))              return `msstate${pc}-${y2}`;
  if (/south\s*carolina|scstate/i.test(low))         return `scstate${pc}-${y2}`;
  if (/el\s*prat/i.test(low))                        return `elprat${pc}-${y2}`;
  return low.replace(/[^a-z0-9]/g, "") + (y2 ? `-${y2}` : "") + pc;
}

/** Verifica se um torneio já existe num set de tornCanon keys.
 *  Faz match exacto primeiro, depois match por série (sem ano) se o torneio não tem ano. */
function hasCanon(set: Set<string>, name: string, short?: string): boolean {
  const cn = tornCanon(name);
  const cs = short ? tornCanon(short) : "";
  if (set.has(cn) || (cs && set.has(cs))) return true;
  // Se não tem ano (termina em "-"), verificar se existe algum com a mesma série
  const series = cn.split("-")[0];
  if (cn.endsWith("-") && series) {
    for (const k of set) {
      if (k.startsWith(series + "-") && k !== cn) return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────


interface FieldData { gerado_em: string; torneios: Torneio[]; }

// ─────────────────────────────────────────────
// TIPOS — RESULTADOS
// ─────────────────────────────────────────────
interface RondaJogador {
  nome: string; pais: string; cidade: string;
  pontos: number; score: number; tee: string;
  to_par: number | null;
  buracos: number;
  start_time: string; grupo: number;
  strokes: number[];  // directamente no jogador (nova estrutura)
  // legacy (estrutura antiga — manter compatibilidade)
  rondas?: Record<string, {
    strokes: number[]; total: number; buracos: number;
    start_time: string; grupo: number;
  }>;
}
interface RondaResult {
  ronda: number;
  par: number[];
  si: number[];
  metros?: number[];   // distâncias por buraco em metros (convertidas de jardas)
  buracos: number;
  total_par: number | null;
  leaderboard: RondaJogador[];  // nova estrutura
  jogadores?: RondaJogador[];   // legacy
}
interface EscalaoResult  { age_group: number; nome: string; holes: number; is_manuel: boolean; rondas: RondaResult[]; campo?: string; }
interface TorneioResult  {
  t: number; name: string;
  date_inicio: string; date_fim?: string; campo: string | null;
  rondas_total: number;
  escalao_manuel?: number;
  url_resultados?: string;
  escaloes: EscalaoResult[];
  ultima_atualizacao: string;
}
interface ResultsData { gerado_em: string; resultados: TorneioResult[]; }

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const ESCALOES_DESTAQUE  = new Set(["Boys 9","Boys 10","Boys 11","Boys 12","Boys 13","Boys 13-14"]);
// Manuel nasceu a 29/4/2014 — escalao depende da data do torneio
const MANUEL_BIRTHDAY_MONTH = 3; // Abril (0-indexed)
const MANUEL_BIRTHDAY_DAY   = 29;
const MANUEL_BIRTHDAY_YEAR  = 2014;
function escalaoManuelParaData(dateStr: string): string {
  const iso  = dateStr?.includes("-") ? dateStr : (() => {
    const [m,d,y] = (dateStr||"").split("/");
    return `${y}-${(m||"1").padStart(2,"0")}-${(d||"1").padStart(2,"0")}`;
  })();
  const data = new Date(iso);
  const anoT = data.getFullYear();
  const aniversarioNesse = new Date(anoT, MANUEL_BIRTHDAY_MONTH, MANUEL_BIRTHDAY_DAY);
  const anos = anoT - MANUEL_BIRTHDAY_YEAR - (data < aniversarioNesse ? 1 : 0);
  if (anos <= 9)  return "Boys 9";
  if (anos <= 10) return "Boys 10";
  if (anos <= 11) return "Boys 11";
  return "Boys 12";
}
const ESCALAO_ORDER: Record<string, number> = {
  "Boys 7 & Under":1,"Boys 7":2,"Boys 8":3,"Boys 9":4,"Boys 10":5,"Boys 11":6,"Boys 12":7,
  "Boys 13":8,"Boys 13-14":9,"Boys 14":10,"Boys 15-18":11,
  "Girls 7 & Under":20,"Girls 8 & Under":21,"Girls 8":22,"Girls 9":23,"Girls 9-10":24,
  "Girls 10":25,"Girls 11":26,"Girls 11-12":27,"Girls 12":28,"Girls 13":29,"Girls 13-14":30,
  "Girls 15-18":31,
};
function sortEscaloes<T extends { nome: string }>(arr: T[]): T[] {
  return [...arr].sort((a,b) => (ESCALAO_ORDER[a.nome]??99) - (ESCALAO_ORDER[b.nome]??99));
}

// ── Overrides para jogadores IE/WD excluídos pelo scraper ──
// Muta o array de resultados in-place, injectando jogadores em falta.
function applyResultOverrides(resultados: TorneioResult[]): void {
  const OVERRIDES: Array<{
    tCode: number;
    escalaoNome: string;       // escalão correcto
    fixIsManuel?: boolean;     // corrigir is_manuel flag
    rounds: Array<{
      ronda: number;
      jogador: RondaJogador;
    }>;
  }> = [
    {
      // Marco Simone 2026 — Manuel IE (scorecard signing error)
      tCode: 21080,
      escalaoNome: "Boys 11",
      fixIsManuel: true,
      rounds: [
        {
          ronda: 1,
          jogador: {
            nome: "Manuel Medeiros", pais: "PT", cidade: "Funchal, Madeira",
            tee: "Tee 4", pontos: 0, score: 86, buracos: 18,
            start_time: "", grupo: 0,
            to_par: 14,
            strokes: [5,5,4,3,5,4,4,9,5, 6,4,5,3,4,4,5,6,5],
          } as RondaJogador,
        },
        {
          ronda: 2,
          jogador: {
            nome: "Manuel Medeiros", pais: "PT", cidade: "Funchal, Madeira",
            tee: "Tee 4", pontos: 0, score: 79, buracos: 18,
            start_time: "", grupo: 0,
            to_par: 7,
            strokes: [4,5,4,3,3,5,4,4,5, 4,4,5,4,4,5,5,5,6],
          } as RondaJogador,
        },
      ],
    },
  ];

  for (const ov of OVERRIDES) {
    const tourn = resultados.find(r => r.t === ov.tCode);
    if (!tourn) continue;

    // Corrigir is_manuel: desligar de todos os escalões, ligar no correcto
    if (ov.fixIsManuel) {
      for (const esc of tourn.escaloes) esc.is_manuel = false;
      const target = tourn.escaloes.find(e => e.nome === ov.escalaoNome);
      if (target) {
        target.is_manuel = true;
        tourn.escalao_manuel = target.age_group;
      }
    }

    // Injectar jogador no leaderboard de cada ronda
    const esc = tourn.escaloes.find(e => e.nome === ov.escalaoNome);
    if (!esc) continue;
    for (const ovRd of ov.rounds) {
      const rd = esc.rondas.find(r => r.ronda === ovRd.ronda);
      if (!rd) continue;
      const lb = rd.leaderboard ?? rd.jogadores ?? [];
      // Não duplicar se já existir
      const exists = lb.some(j =>
        j.nome.toLowerCase().includes("medeiros") && j.nome.toLowerCase().includes("manuel")
      );
      if (!exists) {
        lb.push(ovRd.jogador);
        if (rd.leaderboard) rd.leaderboard = lb;
        else if (rd.jogadores) rd.jogadores = lb;
        else rd.leaderboard = lb;
      }
    }
  }
}

/**
 * Dados de tee por torneio e escalão: campo, nome do tee, pares e metros por buraco.
 * Fonte: scorecards oficiais USKids (PDF de distâncias) + melhorias.json.
 * Chave: t-code → age_group → TeeInfo
 * (todos os rounds de um mesmo torneio usam o mesmo tee por escalão)
 */
interface TeeInfo {
  campo: string;
  tee: string;
  par: number[];
  metros: number[];
}
const TEES_LOOKUP: Record<number, Record<number, TeeInfo>> = {
  // ── Rome Classic 2025 – Terre Dei Consoli Golf Club (Championship Course) ───
  // Fonte: PDF oficial "2025 Rome Classic - Meters" + melhorias.json › extra_rounds
  // Todos os escalões têm o mesmo par [4,5,3,4,4,4,4,5,3,4,5,4,3,4,4,3,5,4] (Par 72)
  // apenas os metros variam
  20175: {
    2105: { // Boys 12
      campo: "Terre Dei Consoli Golf Club", tee: "Championship Course",
      par:    [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4],
      metros: [255,442,125,298,293,315,327,380,106, 263,390,239,110,284,301,134,380,333],
    },
    2104: { // Boys 11
      campo: "Terre Dei Consoli Golf Club", tee: "Championship Course",
      par:    [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4],
      metros: [193,390,119,266,254,282,270,350,94, 263,350,229,110,284,224,134,350,260],
    },
    2103: { // Boys 10 — mesmos metros que Boys 11
      campo: "Terre Dei Consoli Golf Club", tee: "Championship Course",
      par:    [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4],
      metros: [193,390,119,266,254,282,270,350,94, 263,350,229,110,284,224,134,350,260],
    },
    2102: { // Boys 9
      campo: "Terre Dei Consoli Golf Club", tee: "Championship Course",
      par:    [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4],
      metros: [193,350,119,200,254,247,236,330,90, 200,330,229,91,249,224,114,330,260],
    },
  },
  // ── Venice Open 2025 – Golf Della Montecchia ─────────────────────────────────
  // Fonte: PDF oficial "U.S. Kids Golf Venice Open 2025 - Meters"
  19418: {
    2105: { // Boys 12 — White+Red
      campo: "Golf Della Montecchia", tee: "White+Red",
      par:    [5,3,4,4,4,4,3,4,5, 4,3,5,4,4,4,4,3,5],
      metros: [401,145,300,310,280,330,128,290,390, 305,150,410,280,283,310,310,145,410],
    },
    2104: { // Boys 11 — White+Red
      campo: "Golf Della Montecchia", tee: "White+Red",
      par:    [5,3,4,4,4,4,3,4,5, 4,3,5,4,4,4,4,3,5],
      metros: [389,145,262,266,280,289,128,290,350, 255,122,330,230,265,284,290,115,325],
    },
    2103: { // Boys 10 — Red+Green
      campo: "Golf Della Montecchia", tee: "Red+Green",
      par:    [4,3,5,4,4,4,4,3,5, 4,5,4,3,4,3,4,5,4],
      metros: [255,122,330,230,265,284,290,115,325, 263,350,287,120,250,103,244,340,250],
    },
    2102: { // Boys 9 — Green+White
      campo: "Golf Della Montecchia", tee: "Green+White",
      par:    [4,5,4,3,4,3,4,5,4, 5,3,4,4,4,4,3,4,5],
      metros: [220,300,240,100,210,90,210,300,230, 300,110,225,230,210,230,95,215,290],
    },
  },
  // ── USKids Catalunya Local Tour – Real Club de Golf El Prat ─────────────────
  // Fonte: melhorias.json › extra_rounds  (stableford, 9H)
  15573: {
    2102: { // Boys 9
      campo: "Real Club de Golf El Prat", tee: "Boys 9",
      par:    [4,3,4,5,4,3,4,4,5],
      metros: [],
    },
  },
  // ── Marco Simone Invitational 2025 (t=18438) ──────────────────────────────────────────
  // Mesmas distâncias e pares que 2026 (mesmo percurso)
  18438: {
    2105: { // Boys 12
      campo: "Marco Simone Golf & Country Club", tee: "Boys 12",
      par:    [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5],
      metros: [274,349,302,113,266,258,152,375,382, 307,247,381,103,310,292,255,151,442],
    },
    2104: { // Boys 11
      campo: "Marco Simone Golf & Country Club", tee: "Boys 11",
      par:    [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5],
      metros: [274,299,272,103,227,231,132,338,352, 267,219,356,91,270,237,225,133,404],
    },
    2103: { // Boys 10
      campo: "Marco Simone Golf & Country Club", tee: "Boys 10",
      par:    [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5],
      metros: [274,299,272,103,227,231,132,338,352, 267,219,356,91,270,237,225,133,404],
    },
    2102: { // Boys 9
      campo: "Marco Simone Golf & Country Club", tee: "Boys 9",
      par:    [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5],
      metros: [240,262,238,103,200,201,127,298,308, 234,219,291,91,236,225,190,133,354],
    },
  },
  // ── Marco Simone Invitational 2026 (t=21080) ──────────────────────────────────────────
  // Fonte: "2026 Marco Simone Invitational - Meters" (PDF oficial)
  21080: {
    2105: { // Boys 12
      campo: "Marco Simone Golf & Country Club", tee: "Boys 12",
      par:    [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5],
      metros: [274,349,302,113,266,258,152,375,382, 307,247,381,103,310,292,255,151,442],
    },
    2104: { // Boys 11
      campo: "Marco Simone Golf & Country Club", tee: "Boys 11",
      par:    [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5],
      metros: [274,299,272,103,227,231,132,338,352, 267,219,356,91,270,237,225,133,404],
    },
    2103: { // Boys 10
      campo: "Marco Simone Golf & Country Club", tee: "Boys 10",
      par:    [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5],
      metros: [274,299,272,103,227,231,132,338,352, 267,219,356,91,270,237,225,133,404],
    },
    2102: { // Boys 9
      campo: "Marco Simone Golf & Country Club", tee: "Boys 9",
      par:    [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5],
      metros: [240,262,238,103,200,201,127,298,308, 234,219,291,91,236,225,190,133,354],
    },
  },
};

/** Links adicionais por t-code (página oficial USKids, etc.) */
const LINKS_EXTRA: Record<number, { label: string; url: string }[]> = {
  // Rome Classic 2025
  20175: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516026/rome-classic-2025/registration" },
    { label: "📄 Distâncias", url: "https://drive.google.com/file/d/14rQM4CQuN7d4VqWaYTewcrRAoSzCzrgv/view?usp=sharing" },
  ],
  // Venice Open 2025
  19418: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/515206/venice-open-2025/field" },
    { label: "📄 Distâncias", url: "https://tournaments.uskidsgolf.com/sites/default/files/venice_open_2025_tournament_distances_-_meters.pdf" },
  ],
  // Marco Simone Invitational 2025
  18438: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/international/past-results?date%5Bvalue%5D%5Byear%5D=2025&tournament_id=514135" },
    { label: "📄 Distâncias", url: "https://drive.google.com/file/d/1AgicV6PnrYYc8AbA5CFPmttJOICzZVZm/view" },
  ],
  // Marco Simone Invitational 2026
  21080: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516989/marco-simone-invitational-2026" },
    { label: "📄 Distâncias", url: "https://drive.google.com/file/d/1AgicV6PnrYYc8AbA5CFPmttJOICzZVZm/view" },
    { label: "🏌️ Campo", url: "https://tournaments.uskidsgolf.com/node/514018" },
  ],

  // 2026 Mississippi State Invitational
  21239: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517160/2026-mississippi-state-invitational" },
  ],
  // 2026 Hawaii State Invitational
  21471: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517475/2026-hawaii-state-invitational" },
  ],
  // Jekyll Island Cup 2026
  21133: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/517061/jekyll-island-cup-2026" },
  ],
  // Texas Open 2026
  21620: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/517558/texas-open-2026" },
  ],
  // Palmer Kids Invitational 2026
  22037: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/517996/palmer-foundation-kids-invitational-2026" },
  ],
  // World Championship 2026
  21610: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/world/find-tournament/517536/world-championship-2026" },
  ],
  // 2026 Tennessee - Spring State Invitational
  21628: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517562/2026-tennessee-spring-state-invitational" },
  ],
  // 2026 Wisconsin State Invitational
  21629: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517563/2026-wisconsin-state-invitational" },
  ],
  // 2026 Nevada State Invitational
  21631: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517628/2026-nevada-state-invitational" },
  ],
  // 2026 Northwest State Invitational
  21650: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517647/2026-northwest-state-invitational" },
  ],
  // 2026 Arkansas State Invitational
  21722: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517714/2026-arkansas-state-invitational" },
  ],
  // 2026 Florida - Spring State Invitational
  21845: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517776/2026-florida-spring-state-invitational" },
  ],
  // 2026 Northern California State Invitational
  21846: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517777/2026-northern-california-state-invitational" },
  ],
  // 2026 Arizona State Invitational
  21847: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517778/2026-arizona-state-invitational" },
  ],
  // 2026 North Carolina State Invitational
  21848: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517786/2026-north-carolina-state-invitational" },
  ],
  // 2026 Illinois State Invitational
  22059: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518025/2026-illinois-state-invitational" },
  ],
  // 2026 Georgia State Invitational
  22062: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518037/2026-georgia-state-invitational" },
  ],
  // 2026 Oklahoma State Invitational
  22080: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518039/2026-oklahoma-state-invitational" },
  ],
  // 2026 Ohio State Invitational
  22088: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518045/2026-ohio-state-invitational" },
  ],
  // 2026 Missouri State Invitational
  22090: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518043/2026-missouri-state-invitational" },
  ],
  // 2026 Texas - Spring State Invitational
  22099: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518057/2026-texas-spring-state-invitational" },
  ],
  // 2026 Washington State Invitational
  22121: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518093/2026-washington-state-invitational" },
  ],
  // 2026 Virginia State Invitational
  22122: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518092/2026-virginia-state-invitational" },
  ],
};

// ─────────────────────────────────────────────
// REGIONAL CHAMPIONSHIPS (invitation events)
// ─────────────────────────────────────────────
const REGIONAL_CHAMPIONSHIPS: Record<number, { shortName: string; location: string; urlUSKids?: string; past2026?: boolean }> = {
  // ── Já realizados em 2026 (HISTORICOS) ──
  20895: { shortName: "Sandestin Championship",      location: "Sandestin, FL",      urlUSKids: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/516801/sandestin-championship-2026", past2026: true },
  21004: { shortName: "Desert Shootout",             location: "Phoenix, AZ",        urlUSKids: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/516958/desert-shootout-2026", past2026: true },
  // ── Futuros 2026 ──
  21133: { shortName: "Jekyll Island Cup",           location: "Jekyll Island, GA",  urlUSKids: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/517061/jekyll-island-cup-2026" },
  21620: { shortName: "Texas Open",                  location: "Horseshoe Bay, TX",  urlUSKids: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/517558/texas-open-2026" },
  22037: { shortName: "Palmer Kids Invitational",    location: "Latrobe, PA",        urlUSKids: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/517996/palmer-foundation-kids-invitational-2026" },
  // t-code ainda não disponível (2026 não criado no USKids):
  // Red White & Blue Invitational — JUL 4-5  — Pinehurst, NC   → ref 2025: find-tournament/514718/red-white-blue-invitational-2025
  // Seaview Open                  — SEP 5-6  — Galloway, NJ    → ref 2025: find-tournament/515652/seaview-open-2025
  // Palm Springs Open             — SEP 19-20 — Palm Springs   → ref 2025: find-tournament/515710/palm-springs-open-2025
  // PGA Golf Club Invitational    — OCT 10-11 — Port St. Lucie → ref 2025: find-tournament/515055/pga-golf-club-invitational-2025
  // Colonial Williamsburg Classic — NOV 7-8  — Williamsburg    → ref 2025: find-tournament/515903/colonial-williamsburg-classic-2025
  // Monterey Challenge            — NOV 7-8  — Monterey, CA    → ref 2025: find-tournament/515902/monterey-challenge-2025
  // Holiday Classic               — DEC 21-22 — Palm Beach Grd → ref 2025: find-tournament/516789/holiday-classic-2025
};

// ─────────────────────────────────────────────
// LOCALIZAÇÃO
// ─────────────────────────────────────────────
const USA_KEYWORDS = [
  'jekyll', 'state invitational', 'state championship', 'state open',
  'tennessee', 'florida', 'texas', 'california', 'georgia', 'virginia',
  'wisconsin', 'nevada', 'arkansas', 'ohio', 'oklahoma', 'missouri',
  'mississippi', 'hawaii', 'illinois', 'north carolina', 'northwest',
  'palmer foundation', 'van horn cup', 'world championship', 'world van horn',
  'canadian invitational',
];
const EURO_KEYWORDS = [
  'european championship', 'european van horn', 'europe',
  'marco simone', 'venice', 'rome', 'terre dei consoli',
  'irish open', 'paris invitational',
  'nordic', 'al hamra',
];

function torneioRegiao(name: string): "USA" | "EURO" | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (EURO_KEYWORDS.some(k => n.includes(k))) return "EURO";
  if (USA_KEYWORDS.some(k => n.includes(k))) return "USA";
  return null;
}

// Torneios hospedados no signupanytime mas que NÃO são USKids
const NON_USKIDS_KEYWORDS = [
  'greatgolf', 'great golf', 'quinta do lago', 'qdl', 'figo',
  'doral', 'wjgc', 'bjgt', 'daily mail',
];
function isUSKidsTorneio(name: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return !NON_USKIDS_KEYWORDS.some(k => n.includes(k));
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function badgeVagas(vagas: number, maximo: number) {
  if (maximo === 0) return null;
  if (vagas === 0)  return { bg: C.vagas.full.bg,         cor: C.vagas.full.fg,         label: "FULL" };
  if (vagas <= 1)   return { bg: C.vagas.almostFull.bg,   cor: C.vagas.almostFull.fg,   label: `+${vagas}` };
  if (vagas <= 3)   return { bg: C.vagas.limited.bg,      cor: C.vagas.limited.fg,      label: `+${vagas}` };
  if (vagas <= 6)   return { bg: C.vagas.available.bg,    cor: C.vagas.available.fg,    label: `+${vagas}` };
  return                   { bg: C.vagas.open.bg,         cor: C.vagas.open.fg,         label: `+${vagas}` };
}



function fmtTs(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-PT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
}

function diasAte(s: string) {
  const iso = isoDate(s);
  if (!iso) return 999;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

/** Torneio considerado terminado: após as 21h locais do último dia.
 *  Usa hora local do browser (CET/CEST para nós). */
function isTerminado(dateFim: string | undefined, dateInicio?: string): boolean {
  const raw = dateFim || dateInicio;
  const iso = raw ? isoDate(raw) : null;
  if (!iso) return false;
  // 21:00 local do último dia — não se joga de noite
  const endTime = new Date(iso + "T21:00:00").getTime();
  return Date.now() > endTime;
}



// ─────────────────────────────────────────────
/** Jogador sem scorecard: score=0 e todos os strokes são 0 ou ausentes */
function isWD(score: number, strokes: number[]): boolean {
  if (score > 0) return false;
  return !strokes || strokes.every(s => !s || s === 0);
}

// ADAPTADOR: EscalaoResult → Tournament (para reutilizar ScorecardLB / AccumulatedLB)
// ─────────────────────────────────────────────
function escalaoToTournament(e: EscalaoResult, t: TorneioResult): TATournament {
  const teeInfo = TEES_LOOKUP[t.t]?.[e.age_group];
  const rondasComDados = e.rondas.filter(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);

  // Colectar todos os jogadores de todas as rondas
  const playerMap = new Map<string, any>();

  for (const r of rondasComDados) {
    const lb = r.leaderboard ?? r.jogadores ?? [];
    const buracos = r.buracos || 18;
    // par por buraco: só usar se tiver dados reais — nunca inventar
    const par: number[] =
      teeInfo?.par.length === buracos ? teeInfo.par :
      r.par?.length === buracos ? r.par :
      [];  // desconhecido → ScoreCircles sem cor vs par
    const parKnown = par.length === buracos;
    const si: number[] = r.si?.length === buracos ? r.si : [];
    const meters: number[] =
      teeInfo?.metros?.length === buracos ? teeInfo.metros :
      (r.metros?.length === buracos ? r.metros : Array(buracos).fill(0));
    const hasSI = si.some(v => v > 0);
    // Para USKids: se não há SI real, usar metros na linha que normalmente seria SI
    const siForDisplay: number[] = hasSI ? si : meters;
    const parPerRound = parKnown ? par.reduce((s, p) => s + p, 0) : null;

    for (const j of lb) {
      const key = j.nome.toLowerCase().trim();
      const strokes: number[] = j.strokes?.length ? j.strokes : (j.rondas?.["1"]?.strokes ?? []);
      if (!playerMap.has(key)) {
        playerMap.set(key, {
          scoreId: j.nome,
          pos: null,
          name: displayName(j.nome),
          club: flag(j.pais) + " " + j.pais,
          grossTotal: 0,
          toPar: null,
          par, si: siForDisplay, meters,
          parTotal: 0,
          nholes: buracos,
          roundScores: [],
          _wd: false,
        });
      }
      const p = playerMap.get(key)!;
      p.grossTotal += j.score || 0;
      if (parPerRound !== null) p.parTotal = parPerRound;  // par de UMA ronda — expandMultiRound multiplica por nPlayed
      p.roundScores.push({
        round: r.ronda,
        gross: j.score || 0,
        scores: strokes,
        pars: par,
        si: siForDisplay,
        meters,
      });
      // scores / par / si do primeiro round (para ScorecardLB de ronda única)
      if (r.ronda === rondasComDados[0].ronda) {
        p.scores = strokes;
      }
    }
  }

  // WD players ficam no fundo da tabela — marcados com _wd para o sort em expandMultiRound
  const allPlayersRaw = [...playerMap.values()];
  for (const p of allPlayersRaw) {
    const allScores: number[] = p.roundScores.flatMap((rs: any) => rs.scores ?? []);
    const totalGross: number = typeof p.grossTotal === 'number' ? p.grossTotal : 0;
    p._wd = isWD(totalGross, allScores);
  }
  const players = [
    ...allPlayersRaw.filter(p => !p._wd),
    ...allPlayersRaw.filter(p =>  p._wd),
  ];
  return {
    name: `${t.name} — ${e.nome}`,
    tcode: `${t.t}-${e.age_group}`,
    date: t.date_inicio,
    campo: teeInfo?.campo ?? e.campo ?? t.campo ?? "",
    rounds: rondasComDados.length,
    playerCount: allPlayersRaw.filter(p => {
      const allScores: number[] = p.roundScores.flatMap((rs: any) => rs.scores ?? []);
      const totalGross: number = typeof p.grossTotal === 'number' ? p.grossTotal : 0;
      return !isWD(totalGross, allScores);
    }).length,
    players,
  } as any;
}

// ─────────────────────────────────────────────
// ESCALÃO SECTION — tabs R1 / R2 / Acumulado
// usa ScorecardLB e AccumulatedLB de TorneiosAnalisePage
// ─────────────────────────────────────────────
function EscalaoSection({ escalao: e, torneio: t, arMap }: {
  escalao: EscalaoResult;
  torneio: TorneioResult;
  arMap?: Map<string, AutoRivalPlayer>;
}) {
  const rondasComDados = e.rondas.filter(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);
  if (!rondasComDados.length) return <EmptyState size="sm" message="Sem dados para este escalão." />;

  const hasAcumulado = rondasComDados.length >= 2;
  const SCORECARD_TAB = rondasComDados.length + 1;
  const defaultTab = (() => {
    for (let i = 0; i < rondasComDados.length; i++) {
      const lb = rondasComDados[i].leaderboard ?? rondasComDados[i].jogadores ?? [];
      if (lb.some(j => isManuel(j.nome))) return i;
    }
    return 0;
  })();
  const [tab, setTab] = useState(defaultTab);

  const tournament = useMemo(() => escalaoToTournament(e, t), [e, t]);
  const expandedT = useMemo(() => expandMultiRound(tournament), [tournament]);

  const isAccTab       = hasAcumulado && tab === rondasComDados.length;
  const isScorecardTab = hasAcumulado && tab === SCORECARD_TAB;
  const curT = (isAccTab || isScorecardTab)
    ? expandedT[expandedT.length - 1]
    : expandedT[tab] ?? tournament;

  const tabStyle = (i: number): React.CSSProperties => ({
    padding: "6px 14px", fontSize: 12,
    fontWeight: tab === i ? 700 : 500,
    color: tab === i ? "var(--text)" : "var(--text-muted)",
    background: "transparent", border: "none",
    borderBottom: tab === i ? "2px solid var(--accent)" : "2px solid transparent",
    cursor: "pointer", whiteSpace: "nowrap" as const,
  });

  const campo = (curT as any).campo || tournament.campo || "";

  return (
    <div>
      {campo && (
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>
          📍 {campo}
        </div>
      )}
      {/* Sub-tabs R1 / R2 / Resumo / 📋 Scorecards */}
      {(rondasComDados.length > 1) && (
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
          {rondasComDados.map((_, i) => (
            <button key={i} style={tabStyle(i)} onClick={() => setTab(i)}>R{i + 1}</button>
          ))}
          {hasAcumulado && (
            <button style={tabStyle(rondasComDados.length)} onClick={() => setTab(rondasComDados.length)}>
              Resumo
            </button>
          )}
          {hasAcumulado && (
            <button style={tabStyle(SCORECARD_TAB)} onClick={() => setTab(SCORECARD_TAB)}>
              📋 Scorecards
            </button>
          )}
        </div>
      )}
      {(() => {
        // Construir playersDB com kidsHash para todos os jogadores deste escalão
        const kidsDB: Record<string, { name: string; kidsHash: string }> = {};
        if (arMap) {
          for (const rd of rondasComDados) {
            for (const j of (rd.leaderboard ?? rd.jogadores ?? [])) {
              const ar = arMap.get(normNameAuto(j.nome));
              if (!ar) continue;
              const memberId = (ar as any).memberId as string | undefined;
              const hash = memberId ?? encodeURIComponent(ar.n);
              const key = normNameAuto(j.nome);
              if (!kidsDB[key]) kidsDB[key] = { name: ar.n, kidsHash: hash };
            }
          }
        }
        return isScorecardTab
          ? <AllRoundsScorecardLB tournament={tournament} escLookup={new Map()} playersDB={kidsDB} />
          : isAccTab
            ? <AccumulatedLB tournament={curT} nRounds={rondasComDados.length} escLookup={new Map()} playersDB={kidsDB} />
            : <ScorecardLB tournament={curT} escLookup={new Map()} playersDB={kidsDB} siLabel="m" parLabelColSpan={6} />;
      })()}

    </div>
  );
}

function EscalaoTabs({ escaloes, torneio: t, defaultIdx, arMap }: {
  escaloes: EscalaoResult[];
  torneio: TorneioResult;
  defaultIdx: number;
  arMap?: Map<string, AutoRivalPlayer>;
}) {
  const [esc, setEsc] = useState(defaultIdx);
  const escalaoEsperado = escalaoManuelParaData(t.date_inicio);

  const escTabStyle = (i: number): React.CSSProperties => ({
    padding: "6px 12px", fontSize: 12,
    fontWeight: esc === i ? 700 : 500,
    color: esc === i ? "var(--text)" : "var(--text-muted)",
    background: "transparent", border: "none",
    borderBottom: esc === i ? "2px solid var(--accent)" : "2px solid transparent",
    cursor: "pointer", whiteSpace: "nowrap" as const,
    marginBottom: -1,
  });

  const e = escaloes[esc];

  return (
    <div>
      {/* Barra de escalões */}
      <div style={{ display: "flex", flexWrap: "wrap", borderBottom: "1px solid var(--border)", marginBottom: 12 }}>
        {escaloes.map((es, i) => {
          const isME = t.escalao_manuel
            ? es.age_group === t.escalao_manuel
            : (es.is_manuel === true && es.nome === escalaoEsperado);
          const tInfo = TEES_LOOKUP[t.t]?.[es.age_group];
          const dist = tInfo?.metros?.length === 18
            ? tInfo.metros.reduce((a: number, b: number) => a + b, 0) : null;
          return (
            <button key={es.age_group} style={escTabStyle(i)} onClick={() => setEsc(i)}>
              {isME ? "★ " : ""}{es.nome}
              {dist ? <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{dist}m</span> : null}
            </button>
          );
        })}
      </div>
      {/* Conteúdo do escalão activo */}
      {e && <EscalaoSection key={e.age_group} escalao={e} torneio={t} arMap={arMap} />}
    </div>
  );
}


// ─────────────────────────────────────────────
// TAB CAMPO
// ─────────────────────────────────────────────
function TabCampoDetalhe({ torneio: t }: { torneio: Torneio }) {
  const arMap = React.useContext(ArMapCtx);
  const escalaoM = escalaoManuelParaData(t.date_inicio);
  const sBase = seriesBase(t.name);
  const currentYear = parseInt((isoDate(t.date_inicio) || `${new Date().getFullYear()}-01-01`).slice(0, 4));
  const b12     = t.escaloes.find(e => e.nome === escalaoM);
  const ptTotal = t.escaloes.flatMap(e => e.jogadores ?? []).filter(j => j.pais === "PT");
  const dias    = diasAte(t.date_inicio);
  const urgente = b12 && b12.vagas <= 3 && b12.vagas > 0;

  return (
    <div>
      {/* ── Header — padrão detail-header idêntico a FPGPage/DrivePage ── */}
      <div className="detail-header">
        <div className="detail-header-top">
          <h2 className="detail-title">
            {t.emoji && <span style={{ marginRight: 6 }}>{t.emoji}</span>}
            {t.name}
          </h2>
          <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
            {REGIONAL_CHAMPIONSHIPS[t.t] && (
              <span className="p p-sm" style={{
                background:"var(--bg-pink)", color:"var(--color-purple)", borderColor:"var(--border-purple)",
                fontWeight:800, letterSpacing:"0.04em",
              }}>⭐ REGIONAL INVITATION</span>
            )}
            {dias >= 0 && dias <= 14 && (
              <span className="p p-sm" style={{ background:"var(--chart-5)", color:"#fff", borderColor:"var(--chart-5)" }}>
                daqui a {dias}d
              </span>
            )}
            {dias < 0 && !isTerminado(t.date_fim, t.date_inicio) && (
              <span className="p p-sm" style={{ background:"var(--color-good)", color:"#fff", borderColor:"var(--color-good)" }}>
                ▶ em curso
              </span>
            )}
          </div>
        </div>

        {/* Sub-linha: data · campo · rondas · fee · tcode */}
        <div className="detail-sub">
          <span className="muted">
            📅 {fmtDate(t.date_inicio)}{t.date_fim && t.date_fim !== t.date_inicio ? ` → ${fmtDate(t.date_fim)}` : ""}
          </span>
          {t.campo && <span className="muted">📍 {t.campo}</span>}
          {t.rondas && <span className="chip">{t.rondas} rondas</span>}
          {t.fee_18 && <span className="chip">💵 {t.fee_18}</span>}
          <span className="muted fs-11" style={{ userSelect:"all", cursor:"text", opacity:.6 }}>t={t.t}</span>
        </div>

        {/* KPIs de inscrição */}
        {!t.erro && !t.sem_flights && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:8 }}>
            <span className="chip" style={{ background:"var(--color-good-dark)", color:"#fff", fontWeight:700, fontSize:13, padding:"3px 12px" }}>
              {t.total_inscritos}/{t.total_maximo} inscritos
            </span>
            {b12 && (() => {
              const bd = badgeVagas(b12.vagas, b12.maximo);
              return bd ? (
                <span className="chip" style={{
                  background: urgente ? bd.bg : "var(--bg-hover)",
                  color: urgente ? bd.cor : "var(--text-2)",
                  border:`1px solid ${bd.bg}`, fontWeight:700, fontSize:13, padding:"3px 12px",
                }}>
                  ★ {escalaoM}: {b12.inscritos}/{b12.maximo}
                  <span style={{ marginLeft:5, opacity:.8 }}>({bd.label})</span>
                </span>
              ) : null;
            })()}
          </div>
        )}

        {/* Alertas */}
        {t.sem_flights && (
          <div className="notice" style={{ marginTop:10 }}>⏳ Flights ainda não publicados</div>
        )}
        {t.erro && (
          <div className="notice-error" style={{ marginTop:10 }}>⚠️ {t.erro}</div>
        )}

        {/* Links */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:10 }}>
          {[
            { href:`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=field&fmt=nohead&ax=2739&t=${t.t}`, label:"📋 Inscritos" },
            { href:`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t.t}`, label:"🏆 Resultados ↗" },
          ].map(l => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:12, padding:"3px 10px", borderRadius:6, fontWeight:600,
                background:"var(--bg-muted)", color:"var(--accent-text)", border:"1px solid var(--border)", textDecoration:"none" }}>
              {l.label}
            </a>
          ))}
          {(t.url_uskids || (LINKS_EXTRA[t.t] ?? []).find(l => l.label === "USKids ↗")?.url) && (
            <a href={t.url_uskids ?? (LINKS_EXTRA[t.t] ?? []).find(l => l.label === "USKids ↗")!.url}
              target="_blank" rel="noopener noreferrer"
              style={{ fontSize:12, padding:"3px 10px", borderRadius:6, fontWeight:600,
                background:"var(--bg-muted)", color:"var(--accent-text)", border:"1px solid var(--border)", textDecoration:"none" }}>
              USKids ↗
            </a>
          )}
          {(LINKS_EXTRA[t.t] ?? []).filter(l => l.label !== "USKids ↗").map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:12, padding:"3px 10px", borderRadius:6, fontWeight:600,
                background:"var(--bg-muted)", color:"var(--accent-text)", border:"1px solid var(--border)", textDecoration:"none" }}>
              {l.label}
            </a>
          ))}
        </div>
      </div>

      {t.erro || t.sem_flights ? null : (
        <>
          {/* ── Grid de escalões ── */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))", gap:10, marginBottom:20 }}>
            {sortEscaloes(t.escaloes).map(e => {
              const bd  = badgeVagas(e.vagas, e.maximo);
              const dst = ESCALOES_DESTAQUE.has(e.nome);
              const man = e.nome === escalaoM;
              return (
                <div key={e.age_group} className="card" style={{
                  background: man ? "var(--accent-light)" : dst ? "var(--bg-card)" : "var(--bg-card)",
                  border: `1.5px solid ${man ? "var(--accent)" : dst ? "var(--border)" : "var(--border-light)"}`,
                  padding:"12px 14px",
                  boxShadow: man ? "0 0 0 2px var(--accent-alpha-10)" : undefined,
                }}>
                  {/* Cabeçalho do card */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color: man ? "var(--accent)" : dst ? "var(--text)" : "var(--text-2)" }}>
                        {man && <span style={{ marginRight:4 }}>★</span>}{e.nome}
                      </div>
                      <div style={{ fontSize:11, color:"var(--text-3)", marginTop:1 }}>{e.holes} buracos</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:15, fontWeight:800, color: man ? "var(--accent)" : "var(--text)" }}>
                        {e.inscritos}<span style={{ fontSize:11, fontWeight:400, color:"var(--text-3)" }}>/{e.maximo}</span>
                      </div>
                      {bd && (
                        <span style={{ background:bd.bg, color:bd.cor, padding:"1px 6px", borderRadius:5, fontSize:11, fontWeight:700 }}>
                          {bd.label}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Barra de preenchimento */}
                  {e.maximo > 0 && (
                    <div style={{ height:4, borderRadius:2, background:"var(--border)", overflow:"hidden", marginBottom: e.jogadores?.length ? 8 : 0 }}>
                      <div style={{ height:"100%", borderRadius:2, background: man ? "var(--accent)" : "var(--color-good)", width:`${Math.min(100, Math.round((e.inscritos/e.maximo)*100))}%`, transition:"width .3s" }} />
                    </div>
                  )}
                  {/* Lista de jogadores */}
                  {e.jogadores && e.jogadores.length > 0 && (
                    <div style={{ borderTop:"1px solid var(--border-light)", paddingTop:6, display:"flex", flexDirection:"column", gap:2 }}>
                      {e.jogadores.map((j, i) => {
                        const isM = isManuel(j.nome);
                        const arEntry = !isM ? arMap.get(normNameAuto(j.nome)) : undefined;
                        const nTorn = arEntry ? Object.values(arEntry.r).filter(r => r.tp != null || (r.rd?.length ?? 0) > 0).length : 0;
                        // Resultados nos 2 anos anteriores neste mesmo torneio
                        const prevResults = arEntry
                          ? [currentYear - 1, currentYear - 2]
                              .filter(y => y >= 2020)
                              .map(y => ({ y, res: playerSeriesResult(arEntry, sBase, y) }))
                              .filter(x => x.res !== null)
                          : [];
                        return (
                          <div key={i} style={{
                            display:"flex", justifyContent:"space-between", alignItems:"center",
                            fontSize: isM ? 13 : 12, fontWeight: isM ? 800 : 400,
                            padding: isM ? "4px 8px" : "1px 0",
                            margin: isM ? "2px -14px" : "0",
                            borderRadius: isM ? 5 : 0,
                            background: isM ? "var(--accent)" : "transparent",
                            color: isM ? "#fff" : j.pais === "PT" ? "var(--accent)" : "var(--text)",
                          }}>
                            <span style={{ display:"flex", alignItems:"center", gap:2 }}>
                              {isM ? "★ " : ""}{displayName(j.nome)}
                              {!isM && <KidsLink nome={j.nome} />}
                            </span>
                            <span style={{ display:"flex", alignItems:"center", gap:5 }}>
                              {/* Resultados anos anteriores */}
                              {prevResults.map(({ y, res }) => {
                                const p = res!.p;
                                const medal = p === 1 ? "🥇" : p === 2 ? "🥈" : p === 3 ? "🥉" : null;
                                const col = p <= 3 ? "var(--color-warn-dark)" : p <= 10 ? "var(--color-good-dark)" : "var(--text-3)";
                                return (
                                  <span key={y} title={`${y}: #${p}${res!.tp != null ? ` (${res!.tp > 0 ? "+" : ""}${res!.tp})` : ""}`}
                                    style={{ fontSize:10, fontWeight:700, color: col, opacity:.85 }}>
                                    {medal ?? `#${p}`}
                                    <span style={{ fontSize:9, fontWeight:400, opacity:.7 }}>'{String(y).slice(2)}</span>
                                  </span>
                                );
                              })}
                              {nTorn > 0 && (
                                <span style={{
                                  fontSize:10, fontWeight:700, color:"var(--text-2)",
                                  background:"var(--bg-muted)", border:"1px solid var(--border)",
                                  borderRadius:4, padding:"0 4px", lineHeight:"16px",
                                  display:"inline-block",
                                }}>
                                  {nTorn}T
                                </span>
                              )}
                              <span title={j.cidade}>{flag(j.pais)}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!e.jogadores && e.paises && e.paises.length > 0 && (
                    <div style={{ fontSize:12, color:"var(--text-3)", marginTop:4, lineHeight:1.6 }}>
                      {e.paises.slice(0, 8).map(p => `${flag(p.pais)} ${p.n}`).join("  ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Portugueses inscritos ── */}
          {ptTotal.length > 0 && (
            <div className="card" style={{ background:"var(--accent-light)", border:"1.5px solid var(--accent)", marginBottom:12 }}>
              <div className="h-sm" style={{ color:"var(--accent)", marginBottom:10 }}>🇵🇹 Portugueses inscritos</div>
              {t.escaloes.filter(e => e.jogadores?.some(j => j.pais === "PT")).map(e => (
                <div key={e.age_group} style={{ marginBottom:8 }}>
                  <div className="h-xs" style={{ color:"var(--accent-text)", marginBottom:4 }}>{e.nome}</div>
                  {e.jogadores!.filter(j => j.pais === "PT").map((j, i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"3px 8px", borderRadius:4, background:"rgba(255,255,255,.5)", marginBottom:2 }}>
                      <span style={{ fontWeight:600, display:"flex", alignItems:"center", gap:2 }}>
                        {displayName(j.nome)}<KidsLink nome={j.nome} />
                      </span>
                      <span style={{ color:"var(--text-3)", fontSize:12 }}>{j.cidade}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="muted fs-11" style={{ textAlign:"right" }}>{fmtTs(t.ultima_atualizacao)}</div>
        </>
      )}
    </div>
  );
}

// manter TabCampo para compatibilidade (não é usada directamente mas pode existir)
function TabResultados({ data, selectedT, greatgolfData }: {
  data: ResultsData;
  selectedT: number | null;
  greatgolfData: GreatgolfData | null;
}) {
  const arMap = React.useContext(ArMapCtx);
  const t = data.resultados.find(r => r.t === selectedT) ?? null;

  // ── PRINT ──────────────────────────────────────────────────────────────────
  function printRondas() {
    if (!t) return;


    const css = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'DM Sans', sans-serif; font-size: 11px; color: var(--text); background: #fff; padding: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      h1 { font-size: 15px; font-weight: 800; margin-bottom: 3px; }
      h2 { font-size: 12px; font-weight: 700; color: var(--text-dark); margin: 14px 0 6px; border-bottom: 1px solid var(--text-dark); padding-bottom: 3px; }
      h3 { font-size: 11px; font-weight: 700; color: var(--text-3); margin: 10px 0 4px; }
      .meta { font-size: 10px; color: var(--text-3); margin-bottom: 8px; }
      .page-break { page-break-before: always; }

      table { border-collapse: collapse; font-size: 10px; width: 100%; }
      th, td { padding: 4px 3px; text-align: center; border: none; white-space: nowrap; }
      th { background: var(--bg-header); font-weight: 600; font-size: 10px; color: var(--text-3); border-bottom: 1px solid var(--border); }
      tbody td { border-bottom:1px solid var(--border-light); }
      td.name { text-align: left; padding-left: 8px; min-width: 120px; }
      td.pos { width: 24px; font-weight: 700; }
      td.flag { width: 22px; }

      .lb-topar { width: 32px; font-weight: 700; font-family: 'JetBrains Mono', monospace; background: var(--accent-light); border-left: 1px solid var(--border); }
      .lb-gross { width: 36px; font-weight: 800; font-family: 'JetBrains Mono', monospace; background: var(--accent-light); border-left: 1px solid var(--border-light); }
      .lb-halftot { width: 40px; background: var(--bg-muted); font-weight: 600; font-size: 10px; font-family: 'JetBrains Mono', monospace; border-left: 1px solid var(--border); }
      .lb-hole { min-width: 28px; border-left: 1px solid var(--border-light); }
      .lb-hole-first { border-left: 1px solid var(--border); }
      .lb-par-row td { background: var(--bg-muted); font-weight: 600; border-bottom: 2px solid var(--border); }
      .lb-par-row td.lb-topar, .lb-par-row td.lb-gross { background: var(--accent-light); }
      .lb-si-row td { background:var(--bg); font-size: 10px; color:var(--text-muted); border-bottom:1px solid var(--border-light); }
      .lb-par-lbl { text-align: left; padding-left: 8px; font-weight: 800; }

      .row-manuel td { background: var(--bg-success-subtle) !important; }
      .row-manuel td.lb-topar, .row-manuel td.lb-gross { background: var(--bg-manuel-gross) !important; }

      .sc-score { display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; font-size: 10px; font-weight: 700; border-radius: 0; }
      .sc-score.birdie { background:var(--color-danger); color: #fff; border-radius: 50%; }
      .sc-score.eagle  { background: var(--score-eagle); color: #fff; border-radius: 50%; }
      .sc-score.par    { background: transparent; color: var(--text); }
      .sc-score.bogey  { background: var(--score-bogey); color: var(--score-bogey-fg); border: 1px solid var(--score-bogey-border); }
      .sc-score.double { background: var(--score-double); color: #fff; }
      .sc-score.triple { background:var(--score-triple); color: #fff; }
      .sc-score.quad   { background: var(--score-quad); color: #fff; }
      .sc-score.empty  { color:var(--text-4); }
      .row-wd td { color: var(--text-muted) !important; }
      .row-wd td.name { color: var(--text-muted) !important; }

      @media print {
        body { padding: 6px; }
        @page { margin: 10mm; size: landscape; }
      }
    `;

    const escalaoEsperado = escalaoManuelParaData(t.date_inicio);

    let tableIndex = 0;
    const tablesHtml = sortEscaloes(t.escaloes).map(e => {
      const rondasComDados = e.rondas.filter(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);
      if (!rondasComDados.length) return "";
      const isManuelEscalao = t.escalao_manuel
        ? e.age_group === t.escalao_manuel
        : (e.is_manuel === true && e.nome === escalaoEsperado);
      const teeInfo = TEES_LOOKUP[t.t]?.[e.age_group];

      const escalaoTitle = `<h2>${isManuelEscalao ? "★ " : ""}${e.nome}</h2>`;
      const rondasHtml = rondasComDados.map((r, _ri) => {
          const jogadores = r.leaderboard ?? r.jogadores ?? [];
          const buracos = r.buracos || 18;
          const has18 = buracos >= 18;
          const hasPontos = jogadores.some((j: any) => j.pontos > 0);
          const par: number[] | undefined = (() => {
            if (teeInfo?.par.length === buracos) return teeInfo.par;
            if (r.par?.length === buracos) return r.par;
            return undefined;
          })();
          const metros: number[] | undefined =
            teeInfo?.metros && teeInfo.metros.length === buracos ? teeInfo.metros : undefined;
          const totalPar = par ? par.reduce((s: number, p: number) => s + p, 0) : r.total_par;
          const outPar = par?.slice(0, 9).reduce((s: number, p: number) => s + p, 0);
          const inPar  = par?.slice(9, 18).reduce((s: number, p: number) => s + p, 0);
          const outM   = metros?.slice(0, 9).reduce((s: number, m: number) => s + m, 0);
          const inM    = metros?.slice(9, 18).reduce((s: number, m: number) => s + m, 0);

          const getStrokes = (j: any) => j.strokes?.length ? j.strokes : (j.rondas?.["1"]?.strokes ?? []);

          const holeHeaders = Array.from({length: 9}, (_, i) => `<th class="lb-hole${i===0?" lb-hole-first":""}">${i+1}</th>`).join("") +
            (has18 ? `<th class="lb-halftot">Out</th>` + Array.from({length:9}, (_,i) => `<th class="lb-hole${i===0?" lb-hole-first":""}">${i+10}</th>`).join("") + `<th class="lb-halftot">In</th>` : `<th class="lb-halftot">Tot</th>`);

          const metrosRow = metros ? `<tr class="lb-si-row">
            <td class="pos"></td><td class="name lb-par-lbl" colspan="2">m</td>
            <td class="lb-topar"></td><td class="lb-gross">${(outM??0)+(inM??0)}</td>
            ${metros.slice(0,9).map((m:number,i:number)=>`<td class="lb-hole${i===0?" lb-hole-first":""}">${m}</td>`).join("")}
            <td class="lb-halftot">${outM}</td>
            ${has18 ? metros.slice(9,18).map((m:number,i:number)=>`<td class="lb-hole${i===0?" lb-hole-first":""}">${m}</td>`).join("")+"<td class='lb-halftot'>"+inM+"</td>" : ""}
            ${hasPontos?"<td></td>":""}
          </tr>` : "";

          const parRow = par ? `<tr class="lb-par-row">
            <td class="pos"></td><td class="name lb-par-lbl" colspan="2">PAR</td>
            <td class="lb-topar"></td><td class="lb-gross">${totalPar}</td>
            ${par.slice(0,9).map((p:number,i:number)=>`<td class="lb-hole${i===0?" lb-hole-first":""}">${p}</td>`).join("")}
            <td class="lb-halftot">${outPar}</td>
            ${has18 ? par.slice(9,18).map((p:number,i:number)=>`<td class="lb-hole${i===0?" lb-hole-first":""}">${p}</td>`).join("")+"<td class='lb-halftot'>"+inPar+"</td>" : ""}
            ${hasPontos?"<td></td>":""}
          </tr>` : "";

          // Separar WD dos outros antes de renderizar (WD vai para o fundo)
          const jogadoresOrdenados = [
            ...jogadores.filter((j: any) => !isWD(j.score || 0, j.strokes?.length ? j.strokes : (j.rondas?.["1"]?.strokes ?? []))),
            ...jogadores.filter((j: any) =>  isWD(j.score || 0, j.strokes?.length ? j.strokes : (j.rondas?.["1"]?.strokes ?? []))),
          ];
          let posCounter = 0;
          const rows = jogadoresOrdenados.map((j: any) => {
            const st = getStrokes(j);
            const wd = isWD(j.score || 0, st);
            const out9 = st.slice(0,9).reduce((s:number,v:number)=>s+(v||0),0);
            const in9  = st.slice(9,18).reduce((s:number,v:number)=>s+(v||0),0);
            const manuel = isManuel(j.nome);
            const manCls = manuel ? " row-manuel" : wd ? " row-wd" : "";
            if (!wd) posCounter++;
            const holes9 = st.slice(0,9).map((s:number, hi:number) => {
              const cl = scClass(s, par?.[hi] ?? null);
              return `<td class="lb-hole${hi===0?" lb-hole-first":""}"><span class="sc-score ${cl||"empty"}">${s||""}</span></td>`;
            }).join("");
            const holes9b = has18 ? st.slice(9,18).map((s:number, hi:number) => {
              const cl = scClass(s, par?.[hi+9] ?? null);
              return `<td class="lb-hole${hi===0?" lb-hole-first":""}"><span class="sc-score ${cl||"empty"}">${s||""}</span></td>`;
            }).join("") : "";
            const tpVal = fmtToPar(j.to_par, "–");
            const tpC   = tpColor(j.to_par);
            return `<tr class="${manCls.trim()}">
              <td class="pos">${wd ? "" : posCounter}</td>
              <td class="name">${manuel?"★ ":""}${displayName(j.nome)}${wd?' <span style="color:var(--text-3);font-size:9px;font-weight:700">WD</span>':""}</td>
              <td class="flag">${flag(j.pais)}</td>
              <td class="lb-topar" style="color:${wd?"var(--text-muted)":tpC}">${wd?"WD":tpVal}</td>
              <td class="lb-gross" style="${wd?"color:var(--text-muted)":""}">${wd?"–":j.score||"–"}</td>
              ${holes9}
              <td class="lb-halftot">${out9||"–"}</td>
              ${has18 ? holes9b + `<td class="lb-halftot">${in9||"–"}</td>` : ""}
              ${hasPontos?`<td style="color:var(--color-warn);font-weight:700">${j.pontos>0?j.pontos:"–"}</td>`:""}
            </tr>`;
          }).join("");

          const pb = tableIndex++ > 0 ? '<div class="page-break"></div>' : '';
          return `${pb}${escalaoTitle}<h3>Ronda ${r.ronda} · ${jogadores.length} jogadores · ${buracos}H${totalPar ? ` · Par ${totalPar}` : ""}</h3>
          <div className="table-wrap">
          <table>
            <thead>
              ${metrosRow}${parRow}
              <tr>
                <th class="pos">#</th><th class="name">Jogador</th><th class="flag"></th>
                <th class="lb-topar">±</th><th class="lb-gross">Tot</th>
                ${holeHeaders}
                ${hasPontos?"<th>PTS</th>":""}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          </div>`;
        }).join("");

      // Tabela acumulada (só se ≥2 rondas)
      let accHtml = "";
      if (rondasComDados.length >= 2) {
        const totaisMap = new Map<string, { nome: string; pais: string; scores: number[]; total: number }>();
        for (const r of rondasComDados) {
          const lb = r.leaderboard ?? r.jogadores ?? [];
          for (const j of lb) {
            const k = j.nome.toLowerCase().trim();
            if (!totaisMap.has(k)) totaisMap.set(k, { nome: j.nome, pais: j.pais, scores: [], total: 0 });
            const entry = totaisMap.get(k)!;
            entry.scores.push(j.score || 0);
            entry.total += j.score || 0;
          }
        }
        const sorted = [...totaisMap.values()]
          .filter(p => p.scores.length === rondasComDados.length)
          .sort((a, b) => a.total - b.total);
        const incomplete = [...totaisMap.values()]
          .filter(p => p.scores.length < rondasComDados.length)
          .sort((a, b) => a.total - b.total);
        const allSorted = [...sorted, ...incomplete];

        const totalParAcc = (() => {
          const firstR = rondasComDados[0];
          const p0 = (firstR.leaderboard ?? firstR.jogadores ?? [])[0];
          const par0 = teeInfo?.par ?? (p0 as any)?.par ?? [];
          return par0.reduce((s: number, p: number) => s + p, 0) * rondasComDados.length;
        })();

        const rondaHeaders = rondasComDados.map((r, _i) => `<th class="lb-gross">R${r.ronda}</th>`).join("");
        const accRows = allSorted.map((p, idx) => {
          const manuel = isManuel(p.nome);
          const manCls = manuel ? "row-manuel" : "";
          const isInc = p.scores.length < rondasComDados.length;
          const tpRaw = totalParAcc > 0 ? p.total - totalParAcc : null;
          const tpVal = fmtToPar(tpRaw, "–");
          const tpC   = tpColor(tpRaw);
          const rondaCells = rondasComDados.map((_, i) =>
            `<td class="lb-gross">${p.scores[i] ?? "–"}</td>`
          ).join("");
          return `<tr class="${manCls}">
            <td class="pos">${isInc ? "–" : idx + 1}</td>
            <td class="name">${manuel ? "★ " : ""}${displayName(p.nome)}</td>
            <td class="flag">${flag(p.pais)}</td>
            <td class="lb-topar" style="color:${tpC}">${isInc ? "–" : tpVal}</td>
            <td class="lb-gross" style="font-weight:700">${p.total || "–"}</td>
            ${rondaCells}
          </tr>`;
        }).join("");

        accHtml = `<div class="page-break"></div>${escalaoTitle}<h3>Acumulado · ${sorted.length} classificados · ${rondasComDados.length} rondas${totalParAcc ? ` · Par ${totalParAcc}` : ""}</h3>
        <div className="table-wrap">
        <table>
          <thead><tr>
            <th class="pos">#</th><th class="name">Jogador</th><th class="flag"></th>
            <th class="lb-topar">±Par</th><th class="lb-gross">Total</th>
            ${rondaHeaders}
          </tr></thead>
          <tbody>${accRows}</tbody>
        </table>
        </div>`;
        tableIndex++;
      }

      return rondasHtml + accHtml;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${t.name}</title>
      <style>${css}</style>
    </head><body>
      <h1>${t.name}</h1>
      <div class="meta">📅 ${fmtDate(t.date_inicio)}${t.campo ? ` · ${t.campo}` : ""}</div>
      ${tablesHtml}
    </body></html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  }
  // ──────────────────────────────────────────────────────────────────────────

  if (!data.resultados.length) return (
    <div style={{ color:"var(--text-3)", padding:"32px 0", textAlign:"center", fontSize:13 }}>
      Sem resultados ainda — os scorecards aparecerão aqui durante e após os torneios
    </div>
  );

  if (!t) return (
    <div>
      <div style={{ color:"var(--text-3)", padding:"32px 0 16px", textAlign:"center", fontSize:13 }}>
        Selecciona um torneio na sidebar
      </div>
      {greatgolfData && <SecaoGreatgolf data={greatgolfData} />}
    </div>
  );

  const manuelRows = t.escaloes.flatMap(e =>
    e.rondas.flatMap(r => {
      const lb = r.leaderboard ?? r.jogadores ?? [];
      const manuel = lb.find(j => isManuel(j.nome));
      if (!manuel) return [];
      const lider = lb[0];
      const diffLider = (lider && lider.score > 0 && manuel.score > 0)
        ? manuel.score - lider.score
        : null;
      return [{ escalao: e.nome, ronda: r.ronda, ...manuel, diffLider }];
    })
  );

  return (
    <div>
      {/* ── Header — padrão detail-header ── */}
      <div className="detail-header">
        <div className="detail-header-top">
          <h2 className="detail-title">{t.name}</h2>
          <button onClick={printRondas} className="btn" style={{ fontSize:12, display:"flex", alignItems:"center", gap:5 }}>
            🖨️ Imprimir
          </button>
        </div>
        <div className="detail-sub">
          <span className="muted">📅 {fmtDate(t.date_inicio)}{t.campo ? ` · ${t.campo}` : ""}</span>
          <span className="muted fs-11">actualizado {fmtTs(t.ultima_atualizacao)}</span>
          <a href={`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t.t}`}
            target="_blank" rel="noopener noreferrer"
            style={{ fontSize:12, fontWeight:600, textDecoration:"none", color:"var(--accent-text)",
              border:"1px solid var(--border)", borderRadius:5, padding:"1px 8px" }}>
            📋 Resultados ↗
          </a>
          {(LINKS_EXTRA[t.t] ?? []).map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:12, fontWeight:600, textDecoration:"none", color:"var(--accent-text)",
                border:"1px solid var(--border)", borderRadius:5, padding:"1px 8px" }}>
              {l.label}
            </a>
          ))}
        </div>
        {/* Resultados do Manuel em destaque */}
        {manuelRows.length > 0 && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:10 }}>
            {manuelRows.map((m, i) => {
              const toPar = m.to_par != null
                ? (m.to_par === 0 ? "E" : m.to_par > 0 ? `+${m.to_par}` : `${m.to_par}`)
                : null;
              const liderStr = m.diffLider === 0 ? "líder"
                : m.diffLider != null ? `+${m.diffLider} do líder`
                : null;
              return (
                <span key={i} style={{
                  background:"var(--accent)", color:"#fff",
                  padding:"5px 14px", borderRadius:8, fontSize:13, fontWeight:700,
                  display:"inline-flex", alignItems:"center", gap:6,
                }}>
                  <span style={{ opacity:.8 }}>★</span>
                  <span>{m.escalao} · R{m.ronda} · {m.score}{toPar ? ` (${toPar})` : ""}</span>
                  {liderStr && <span style={{ opacity:.8, fontSize:11 }}>{liderStr}</span>}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Escalões — barra de tabs no topo */}
      {(() => {
        const escaloes = sortEscaloes(t.escaloes).filter(e =>
          e.rondas.some(r => (r.leaderboard ?? r.jogadores ?? []).length > 0)
        );
        if (!escaloes.length) return null;
        const escalaoEsperado = escalaoManuelParaData(t.date_inicio);
        const manuelIdx = escaloes.findIndex(e =>
          t.escalao_manuel ? e.age_group === t.escalao_manuel
            : (e.is_manuel === true && e.nome === escalaoEsperado)
        );
        return <EscalaoTabs escaloes={escaloes} torneio={t} defaultIdx={manuelIdx >= 0 ? manuelIdx : 0} arMap={arMap} />;
      })()}

      {/* ── Greatgolf Junior Open ── */}
      {greatgolfData && <SecaoGreatgolf data={greatgolfData} />}
    </div>
  );
}

function SecaoGreatgolf({ data }: { data: GreatgolfData }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<"sub12"|"sub14"|"d1">("sub12");

  const cats: { key: "sub12"|"sub14"|"d1"; label: string }[] = [
    { key:"sub12", label:"Sub-12" },
    { key:"sub14", label:"Sub-14" },
    { key:"d1",    label:"WAGR / Open" },
  ];

  const rows = data.results[cat] ?? [];

  const _renderToPar = (v: number | null) => {
    if (v == null) return <span className="muted">—</span>;
    if (v === 0)   return <span style={{ color:"var(--text-2)", fontWeight:700 }}>E</span>;
    if (v < 0)     return <span style={{ color:"var(--color-good)", fontWeight:700 }}>{v}</span>;
    return <span style={{ color:"var(--color-danger)", fontWeight:700 }}>+{v}</span>;
  };

  return (
    <div className="card" style={{ marginTop:20, padding:0, overflow:"hidden" }}>
      {/* Header clicável */}
      <div onClick={() => setOpen(v => !v)} style={{
        padding:"12px 16px",
        background: open ? "var(--bg-header)" : "var(--bg-card)",
        borderBottom: open ? "1px solid var(--border)" : "none",
        cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        <div>
          <div className="h-md" style={{ marginBottom:3 }}>🏆 {data.name}</div>
          <div className="detail-sub" style={{ marginTop:0 }}>
            <span className="muted">📅 {data.dates.map(d => fmtDate(d)).join(" · ")}</span>
            <span className="muted">📍 {data.course}</span>
          </div>
        </div>
        <span style={{ color:"var(--text-3)", fontSize:13 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ padding:"14px 16px" }}>
          {/* Selector de categoria — usa tourn-tab */}
          <div style={{ display:"flex", gap:6, marginBottom:14 }}>
            {cats.map(c => (
              <button key={c.key}
                className={`tourn-tab tourn-tab-sm${cat === c.key ? " active" : ""}`}
                style={cat !== c.key ? { background:"var(--bg-muted)", color:"var(--text-2)", borderColor:"var(--border)" } : {}}
                onClick={() => setCat(c.key)}>
                {c.label}
              </button>
            ))}
          </div>

          <div className="table-wrap">
            <table className="sc-lb" style={{ width:"100%" }}>
              <thead>
                <tr>
                  <th className="sticky-col-0" style={{ width:26 }}>#</th>
                  <th className="sticky-col-1" style={{ textAlign:"left", paddingLeft:10 }}>Jogador</th>
                  <th style={{ textAlign:"left" }}>Clube</th>
                  <th className="lb-topar">±</th>
                  <th className="lb-gross">TOT</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const manuelRow = isManuel(r.name);
                  return (
                    <tr key={i} className={manuelRow ? "row-manuel" : undefined}>
                      <td className={`sticky-col-0${manuelRow ? " row-manuel" : ""}`} style={{ textAlign:"center", fontWeight:700 }}>
                        {r.pos != null
                          ? r.pos
                          : <span className="muted fs-11">{r.status}</span>}
                      </td>
                      <td className={`sticky-col-1${manuelRow ? " row-manuel" : ""}`}
                          style={{ textAlign:"left", paddingLeft:10, fontWeight: manuelRow ? 800 : 500 }}>
                        {manuelRow && "★ "}{r.name}
                      </td>
                      <td className="muted fs-11" style={{ padding:"6px 8px" }}>{r.club}</td>
                      <td className="lb-topar" style={{ color: tpColor(r.toPar) }}>
                        {r.toPar == null ? "–" : r.toPar === 0 ? "E" : r.toPar > 0 ? `+${r.toPar}` : r.toPar}
                      </td>
                      <td className="lb-gross">{r.gross ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB RIVAIS
// ─────────────────────────────────────────────


/* ════════════════════════════════════════════════════════════════
   RIVAIS — tipos e helpers
   ════════════════════════════════════════════════════════════════ */

type TorneioComManuel = {
  t: number; name: string; date_inicio: string;
  escalaoManuel?: string; source: "field" | "results";
};

function seriesBase(name: string): string {
  return tornCanon(name).replace(/-\d+$/, "");
}

function playerSeriesResult(
  ar: AutoRivalPlayer,
  sBase: string,
  year: number,
): { p: number; tp: number | null; fieldSize: number } | null {
  for (const [tid, res] of Object.entries(ar.r)) {
    const uskM = tid.match(/^(usk\d+)/);
    if (!uskM) continue;
    const meta = uskTournNames.get(uskM[1]);
    if (!meta?.name || !meta?.dateExact) continue;
    const metaYear = parseInt(meta.dateExact.slice(0, 4));
    if (metaYear !== year) continue;
    const canon = tornCanon(meta.name).replace(/-\d+$/, "");
    if (canon !== sBase) continue;
    const fs = uskFieldSizes.get(tid) ?? 0;
    return { p: res.p ?? 0, tp: res.tp ?? null, fieldSize: fs };
  }
  return null;
}

function fmtToParRivais(tp: number | null): { text: string; color: string } {
  if (tp === null) return { text: "—", color: "var(--text-muted)" };
  if (tp < 0) return { text: String(tp), color: "var(--color-good)" };
  if (tp === 0) return { text: "E", color: "var(--text-3)" };
  if (tp <= 3) return { text: `+${tp}`, color: "var(--color-warn)" };
  return { text: `+${tp}`, color: "var(--color-danger)" };
}

function fmtPosRivais(p: number, fieldSize: number): string {
  if (p <= 0) return "—";
  if (p === 1) return "🥇";
  if (p === 2) return "🥈";
  if (p === 3) return "🥉";
  return fieldSize > 0 ? `${p}/${fieldSize}` : `${p}º`;
}

/* ════════════════════════════════════════════════════════════════
   RivCell — célula de resultado passado (score + posição)
   ════════════════════════════════════════════════════════════════ */
function RivCell({ tp, pos, fieldSize }: { tp: number | null; pos: number; fieldSize: number }) {
  const { text: tpText, color: tpColor } = fmtToParRivais(tp);
  const posText = fmtPosRivais(pos, fieldSize);
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1, lineHeight:1.2 }}>
      <span style={{ fontSize:13, fontWeight:800, color: tpColor }}>{tpText}</span>
      <span style={{ fontSize:11, color:"var(--text-3)" }}>{posText}</span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TabRivais — componente principal
   ════════════════════════════════════════════════════════════════ */
function TabRivais({ resultados, fieldData, torneiosComManuel, selectedT, setSelectedT, autoRivals, showTabela, setShowTabela, futureTorneios }: {
  resultados: TorneioResult[];
  fieldData: FieldData | null;
  torneiosComManuel: TorneioComManuel[];
  selectedT: number | null;
  setSelectedT: (t: number | null) => void;
  autoRivals: AutoRivalPlayer[];
  showTabela: boolean;
  setShowTabela: (v: boolean) => void;
  futureTorneios?: TorneioComManuel[];
}) {
  const kidsMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of autoRivals) m.set(normNameAuto(r.n), r.n);
    return m;
  }, [autoRivals]);

  const arMap = useMemo(() => {
    const m = new Map<string, AutoRivalPlayer>();
    for (const r of autoRivals) m.set(normNameAuto(r.n), r);
    return m;
  }, [autoRivals]);

  const selectedTorneio = !showTabela && selectedT != null
    ? torneiosComManuel.find(t => t.t === selectedT) ?? null
    : null;

  const handleSelectTorneio = (t: number) => {
    setShowTabela(false);
    setSelectedT(t);
  };

  if (showTabela) {
    const futureCols = (futureTorneios ?? []).map(t => ({
      tid: `usk${t.t}`,
      short: t.name.replace(/\s*\d{4}$/, "").slice(0, 12),
      escalao: t.escalaoManuel ?? "",
      url: undefined as string | undefined,
    }));
    return (
      <TabelaGlobal
        autoRivals={autoRivals}
        futureCols={futureCols}
        fieldData={fieldData}
      />
    );
  }

  if (selectedTorneio) {
    return (
      <TorneioRivaisDetalhe
        torneio={selectedTorneio}
        resultados={resultados}
        fieldData={fieldData}
        torneiosComManuel={torneiosComManuel}
        arMap={arMap}
        kidsMap={kidsMap}
      />
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <div className="h-sm" style={{ marginBottom:4 }}>Torneios do Manuel ({torneiosComManuel.length})</div>
      {torneiosComManuel.map(t => {
        const isFuture = isoDate(t.date_inicio) > today;
        const resT = resultados.find(r => r.t === t.t);
        return (
          <button key={t.t}
            className="course-item"
            style={{ textAlign:"left", padding:"12px 16px", display:"block", width:"100%", cursor:"pointer" }}
            onClick={() => handleSelectTorneio(t.t)}>
            <div className="h-md" style={{ marginBottom:4 }}>{t.name}</div>
            <div className="detail-sub">
              {t.date_inicio && <span className="muted">📅 {fmtDate(t.date_inicio)}</span>}
              {t.escalaoManuel && <span className="chip">{t.escalaoManuel}</span>}
              {isFuture
                ? <span className="p p-sm" style={{ background:"var(--bg-info-strong)", color:"var(--color-info)", borderColor:"var(--border-info)" }}>inscrito</span>
                : resT && <span className="p p-sm" style={{ background:"var(--bg-success-strong)", color:"var(--color-good-dark)", borderColor:"var(--border-success)" }}>resultados</span>
              }
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TorneioRivaisDetalhe — detalhe de um torneio seleccionado
   ════════════════════════════════════════════════════════════════ */
function TorneioRivaisDetalhe({ torneio, resultados, fieldData, torneiosComManuel, arMap, kidsMap }: {
  torneio: TorneioComManuel;
  resultados: TorneioResult[];
  fieldData: FieldData | null;
  torneiosComManuel: TorneioComManuel[];
  arMap: Map<string, AutoRivalPlayer>;
  kidsMap: Map<string, string>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isFuture = isoDate(torneio.date_inicio) > today;

  const resT = resultados.find(r => r.t === torneio.t);
  const fieldT = fieldData?.torneios.find(f => f.t === torneio.t);

  const escaloes: { nome: string; age_group: number; players: { nome: string; pais: string }[]; isManuel: boolean }[] = useMemo(() => {
    const esc = new Map<string, { nome: string; age_group: number; players: { nome: string; pais: string }[]; isManuel: boolean }>();
    if (resT) {
      for (const e of resT.escaloes) {
        const seen = new Set<string>();
        const pList: { nome: string; pais: string }[] = [];
        for (const rd of e.rondas) {
          for (const j of (rd.leaderboard ?? rd.jogadores ?? [])) {
            const k = normNameAuto(j.nome);
            if (!seen.has(k)) { seen.add(k); pList.push({ nome: j.nome, pais: j.pais }); }
          }
        }
        if (pList.length > 0) esc.set(e.nome, { nome: e.nome, age_group: e.age_group, players: pList, isManuel: e.is_manuel });
      }
    }
    if (fieldT) {
      for (const e of fieldT.escaloes) {
        const jogadores = e.jogadores ?? [];
        if (jogadores.length === 0) continue;
        const hasManuel = jogadores.some(j => isManuel(j.nome) && j.pais === "PT");
        if (!esc.has(e.nome)) {
          esc.set(e.nome, { nome: e.nome, age_group: e.age_group ?? 0, players: jogadores.map(j => ({ nome: j.nome, pais: j.pais })), isManuel: hasManuel });
        } else {
          const ex = esc.get(e.nome)!;
          const existNames = new Set(ex.players.map(p => normNameAuto(p.nome)));
          for (const j of jogadores) {
            if (!existNames.has(normNameAuto(j.nome))) ex.players.push({ nome: j.nome, pais: j.pais });
          }
          if (hasManuel) ex.isManuel = true;
        }
      }
    }
    return sortEscaloes([...esc.values()]);
  }, [resT, fieldT]);

  const defaultEsc = torneio.escalaoManuel ?? escaloes.find(e => e.isManuel)?.nome ?? escaloes[0]?.nome ?? "";
  const [activeEsc, setActiveEsc] = useState(defaultEsc);
  useEffect(() => { setActiveEsc(defaultEsc); }, [torneio.t]);

  const activeEscData = escaloes.find(e => e.nome === activeEsc);
  const nPaises = new Set((activeEscData?.players ?? []).map(p => normPaisDisplay(p.pais)).filter(Boolean)).size;

  const sBase = seriesBase(torneio.name);
  const currentYear = parseInt((isoDate(torneio.date_inicio) || `${new Date().getFullYear()}-01-01`).slice(0, 4));
  const prevYears = [currentYear - 1, currentYear - 2, currentYear - 3].filter(y => y >= 2020);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div>
        <div className="h-lg" style={{ marginTop:0 }}>{torneio.name}</div>
        <div className="detail-sub" style={{ marginTop:4 }}>
          {torneio.date_inicio && <span className="muted">📅 {fmtDate(torneio.date_inicio)}</span>}
          {isFuture
            ? <span className="p p-sm" style={{ background:"var(--bg-info-strong)", color:"var(--color-info)", borderColor:"var(--border-info)" }}>futuro</span>
            : <span className="p p-sm" style={{ background:"var(--bg-success-strong)", color:"var(--color-good-dark)", borderColor:"var(--border-success)" }}>disputado</span>
          }
          {activeEscData && <span className="muted">{activeEscData.players.length} jogadores</span>}
          {nPaises > 1 && <span className="muted">{nPaises} países</span>}
          {resT?.url_resultados && (
            <a href={resT.url_resultados} target="_blank" rel="noopener noreferrer"
              className="p p-sm p-muted" style={{ textDecoration:"none" }}>
              Resultados ↗
            </a>
          )}
          {fieldT?.url_uskids && !resT?.url_resultados && (
            <a href={fieldT.url_uskids} target="_blank" rel="noopener noreferrer"
              className="p p-sm p-muted" style={{ textDecoration:"none" }}>
              USKids ↗
            </a>
          )}
        </div>
      </div>

      {escaloes.length > 1 && (
        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
          {escaloes.map(e => (
            <button key={e.nome}
              className={`tourn-tab tourn-tab-sm${activeEsc === e.nome ? " active" : ""}`}
              style={activeEsc === e.nome ? {} : { background:"var(--bg-muted)", color:"var(--text-2)", borderColor:"var(--border)" }}
              onClick={() => setActiveEsc(e.nome)}>
              {e.nome}
              <span style={{ marginLeft:4, opacity:.7, fontSize:11 }}>{e.players.length}</span>
              {e.isManuel && (
                <span style={{ marginLeft:3, fontSize:10, color: activeEsc === e.nome ? "rgba(255,255,255,.8)" : "var(--color-good)" }}>●</span>
              )}
            </button>
          ))}
        </div>
      )}

      {activeEscData && (
        <FieldEscalaoTable
          escalaoNome={activeEsc}
          players={activeEscData.players}
          isFuture={isFuture}
          torneioT={torneio.t}
          resultados={resultados}
          sBase={sBase}
          prevYears={prevYears}
          tornName={torneio.name}
          arMap={arMap}
          kidsMap={kidsMap}
          urlResultados={resT?.url_resultados}
          urlUskids={fieldT?.url_uskids ?? undefined}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   FieldEscalaoTable — tabela do field com colunas de edições anteriores
   ════════════════════════════════════════════════════════════════ */
function FieldEscalaoTable({ escalaoNome, players, isFuture, torneioT, resultados, sBase, prevYears, tornName, arMap, kidsMap, urlResultados, urlUskids }: {
  escalaoNome: string;
  players: { nome: string; pais: string }[];
  isFuture: boolean;
  torneioT: number;
  resultados: TorneioResult[];
  sBase: string;
  prevYears: number[];
  tornName: string;
  arMap: Map<string, AutoRivalPlayer>;
  kidsMap: Map<string, string>;
  urlResultados?: string;
  urlUskids?: string;
}) {
  type LbRow = { nome: string; pais: string; pos: number; finalToPar: number | null; fieldSize: number };
  const leaderboard: LbRow[] | null = useMemo(() => {
    if (isFuture) return null;
    const resT = resultados.find(r => r.t === torneioT);
    if (!resT) return null;
    const esc = resT.escaloes.find(e => e.nome === escalaoNome);
    if (!esc) return null;
    const rondasValidas = esc.rondas.filter(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);
    if (rondasValidas.length === 0) return null;
    const totaisMap = new Map<string, { nome: string; pais: string; totalScore: number; toParArr: (number | null)[] }>();
    for (const rd of rondasValidas) {
      for (const j of (rd.leaderboard ?? rd.jogadores ?? [])) {
        const k = normNameAuto(j.nome);
        if (!totaisMap.has(k)) totaisMap.set(k, { nome: j.nome, pais: j.pais, totalScore: 0, toParArr: [] });
        const entry = totaisMap.get(k)!;
        entry.totalScore += (j.score || 0);
        entry.toParArr.push(j.to_par ?? null);
      }
    }
    const fieldSize = totaisMap.size;
    return [...totaisMap.entries()]
      .sort((a, b) => a[1].totalScore - b[1].totalScore)
      .map(([, v], i) => ({
        nome: v.nome, pais: v.pais,
        pos: i + 1,
        finalToPar: v.toParArr.every(x => x != null) ? v.toParArr.reduce((s, x) => s + x!, 0) : null,
        fieldSize,
      }));
  }, [isFuture, resultados, torneioT, escalaoNome]);

  const displayPlayers: { nome: string; pais: string; pos?: number; finalToPar?: number | null; fieldSize?: number }[] = useMemo(() => {
    if (!isFuture && leaderboard) return leaderboard;
    return [...players].sort((a, b) => {
      if (isManuel(a.nome)) return 1;
      if (isManuel(b.nome)) return -1;
      const getBest = (ar: AutoRivalPlayer | undefined) => {
        if (!ar) return 9999;
        let best = 9999;
        for (const yr of prevYears) {
          const res = playerSeriesResult(ar, sBase, yr);
          if (res && res.p > 0 && res.p < best) best = res.p;
        }
        return best;
      };
      return getBest(arMap.get(normNameAuto(a.nome))) - getBest(arMap.get(normNameAuto(b.nome)));
    });
  }, [isFuture, leaderboard, players, arMap, sBase, prevYears]);

  const shortBase = tornName.replace(/\s*\d{4}$/, "");
  const histCols = prevYears.map(y => ({ year: y, label: `${shortBase} '${String(y).slice(2)}` }));

  return (
    <div>
      <div className="h-sm" style={{ marginBottom:8 }}>
        {isFuture ? "Inscritos" : "Resultados"} — {escalaoNome} ({displayPlayers.length})
      </div>
      <div style={{ overflowX:"auto" }}>
        <table className="dtable-lg" style={{ width:"100%" }}>
          <thead>
            <tr>
              {!isFuture && <th style={{ width:40, textAlign:"center" }}>#</th>}
              <th style={{ width:28, textAlign:"center" }}>🌍</th>
              <th>Jogador</th>
              {!isFuture && <th style={{ width:56, textAlign:"center" }}>vs par</th>}
              {histCols.map(c => (
                <th key={c.year} style={{ width:92, textAlign:"center" }}>{c.label}</th>
              ))}
              <th style={{ width:44, textAlign:"center" }}>torn.</th>
            </tr>
          </thead>
          <tbody>
            {displayPlayers.map((p, i) => {
              const isM = isManuel(p.nome);
              const arEntry = arMap.get(normNameAuto(p.nome));
              const totalTorn = arEntry ? Object.keys(arEntry.r).length : 0;
              const kidsName = kidsMap.get(normNameAuto(p.nome));
              const rowBg = isM
                ? "var(--bg-success-subtle)"
                : i % 2 === 0 ? "var(--bg-card)" : "var(--bg-detail)";
              return (
                <tr key={p.nome} style={{ background: rowBg, fontWeight: isM ? 700 : 400 }}>
                  {!isFuture && (
                    <td style={{ textAlign:"center", fontSize:14, fontWeight:700 }}>
                      {(p.pos ?? 0) === 1 ? "🥇" : (p.pos ?? 0) === 2 ? "🥈" : (p.pos ?? 0) === 3 ? "🥉" : (p.pos ?? "?")}
                    </td>
                  )}
                  <td style={{ textAlign:"center", fontSize:16 }}>{flag(p.pais)}</td>
                  <td style={{ padding:"7px 10px" }}>
                    <span style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                      <span>{displayName(p.nome)}</span>
                      {kidsName && (
                        <a href="/kids"
                          onClick={e => {
                            e.preventDefault();
                            // Preferir memberId (ID único USKids) — resolve no KIDSPage antes dos 45 ficheiros
                            const memberId = arEntry?.memberId;
                            const hash = memberId ?? encodeURIComponent(kidsName);
                            window.open(`/kids#${hash}`, "_blank");
                          }}
                          title="Ver em Kids"
                          style={{ fontWeight:800, color:"var(--color-good-dark)", fontSize:14, cursor:"pointer", textDecoration:"none", flexShrink:0 }}>
                          ↗
                        </a>
                      )}
                    </span>
                  </td>
                  {!isFuture && (() => {
                    const { text, color } = fmtToParRivais(p.finalToPar ?? null);
                    return (
                      <td style={{ textAlign:"center" }}>
                        <span style={{ fontSize:13, fontWeight:800, color }}>{text}</span>
                      </td>
                    );
                  })()}
                  {histCols.map(c => {
                    if (!arEntry) return (
                      <td key={c.year} style={{ textAlign:"center" }}>
                        <span style={{ color:"var(--text-muted)", fontSize:13 }}>—</span>
                      </td>
                    );
                    const res = playerSeriesResult(arEntry, sBase, c.year);
                    if (!res || res.p <= 0) return (
                      <td key={c.year} style={{ textAlign:"center" }}>
                        <span style={{ color:"var(--text-muted)", fontSize:13 }}>—</span>
                      </td>
                    );
                    return (
                      <td key={c.year} style={{ textAlign:"center" }}>
                        <RivCell tp={res.tp} pos={res.p} fieldSize={res.fieldSize} />
                      </td>
                    );
                  })}
                  <td style={{ textAlign:"center", color:"var(--text-3)", fontWeight:700, fontSize:12 }}>
                    {totalTorn || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(urlResultados || urlUskids) && (
        <div style={{ textAlign:"right", marginTop:6 }}>
          {urlResultados && (
            <a href={urlResultados} target="_blank" rel="noopener noreferrer"
              className="p p-sm p-muted" style={{ textDecoration:"none", fontSize:11 }}>
              Resultados ↗
            </a>
          )}
          {urlUskids && (
            <a href={urlUskids} target="_blank" rel="noopener noreferrer"
              className="p p-sm p-muted" style={{ textDecoration:"none", fontSize:11, marginLeft:6 }}>
              USKids ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TABELA GLOBAL — porta directa de RivaisDashboard (KIDSPage)
   Usa autoRivals (AutoRivalPlayer[]) + D (dados estáticos BJGT/WJGC)
   ════════════════════════════════════════════════════════════════ */

// ── Tipos locais ──
interface TGTournDef {
  id: string; name: string; short: string; date: string;
  rounds: number; par: number; field: number; nations: number;
  intendedRounds?: number; url: string; dateExact?: string;
}
interface TGResult {
  p: number | "WD"; t?: number | null; tp?: number | null; rd: number[];
}
interface TGPlayer {
  n: string; co: string; isM?: boolean; dob?: string;
  r: Record<string, TGResult>; up: string[];
}

// ── Torneios fixos (BJGT/EOWAGR — tids que NÃO existem no USKids scraper) ──
const TG_T: TGTournDef[] = [
  { id:"gg25",     name:"Greatgolf Open 2025",    short:"GG25",      date:"Fev 2025", rounds:2, par:72, field:12, nations:4,  dateExact:"2025-02-08", url:"https://scoring-pt.datagolf.pt/scripts/classif.asp?tourn=10202&club=935" },
  { id:"brjgt25",  name:"WJGC 2025",              short:"WJGC",      date:"Fev 2025", rounds:3, par:71, field:40, nations:17, dateExact:"2025-02-24", url:"https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/34/leaderboard.htm" },
  { id:"eowagr25", name:"European Open",           short:"EU Open",   date:"Ago 2025", rounds:3, par:72, field:8,  nations:6,  dateExact:"2025-08-01", url:"https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/21/leaderboard.htm" },
  { id:"venice25", name:"Venice Open 2025",        short:"Venice",    date:"Ago 2025", rounds:3, par:72, field:39, nations:16, dateExact:"2025-08-07", url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/515206/venice-open-2025/results" },
  { id:"rome25",   name:"Rome Classic 2025",       short:"Rome",      date:"Out 2025", rounds:2, par:72, field:14, nations:6,  dateExact:"2025-10-18", url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516026/rome-classic-2025/results" },
  { id:"doral25",  name:"Doral Junior 2025",       short:"Doral",     date:"Dez 2025", rounds:2, par:71, field:35, nations:13, dateExact:"2025-12-18", url:"https://www.golfgenius.com/v2tournaments/4222407" },
  { id:"qdl25",    name:"QDL Junior Open 2025",    short:"QDL",       date:"Nov 2025", rounds:1, par:72, field:12, nations:7,  dateExact:"2025-11-08", url:"https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=962&tcode=10080&classif_order=2" },
  { id:"gg26",     name:"Greatgolf Junior Open",   short:"GG",        date:"Fev 2026", rounds:2, par:72, field:12, nations:4,  dateExact:"2026-02-08", url:"https://scoring-pt.datagolf.pt/scripts/classif.asp?tourn=10296&club=935&ack=OT342GH16T" },
  { id:"wjgc26",   name:"WJGC 2026",              short:"WJGC26",    date:"Fev 2026", rounds:3, par:72, field:38, nations:18, dateExact:"2026-02-24", url:"https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/73/leaderboard.htm" },
  { id:"marco26",  name:"Marco Simone Inv. 2026",  short:"Marco 26",  date:"Mar 2026", rounds:2, par:72, field:17, nations:9,  dateExact:"2026-03-14", url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516989/marco-simone-invitational-2026/results" },
];


const TG_AUTO_META: Record<string, { field: number; par: number; url?: string }> = {
  wjgc25_b89:    { field:37, par:71 }, wjgc25_b1011: { field:40, par:71 }, wjgc25_b1213: { field:38, par:71 },
  wjgc26_b1213:  { field:39, par:73 },
  marco26_b9:    { field:17, par:72 }, marco26_b10: { field:17, par:72 }, marco26_b11: { field:17, par:72 }, marco26_b12: { field:17, par:72 },
  doral25_b89:   { field:30, par:71 }, doral25_b1011: { field:35, par:71 }, doral25_b1213: { field:32, par:71 },
  venice25_b9:   { field:35, par:72 }, venice25_b10: { field:38, par:72 }, venice25_b11: { field:39, par:72 }, venice25_b12: { field:36, par:72 },
  rome25_b9:     { field:12, par:72 }, rome25_b10: { field:14, par:72 }, rome25_b11: { field:14, par:72 }, rome25_b12: { field:12, par:72 },
};

const TG_AUTO_NAMES: Record<string, { name: string; short: string; date: string }> = {
  wjgc25_b89:    { name:"WJGC 2025",          short:"WJGC25",   date:"Fev 2025" },
  wjgc25_b1011:  { name:"WJGC 2025",          short:"WJGC25",   date:"Fev 2025" },
  wjgc25_b1213:  { name:"WJGC 2025",          short:"WJGC25",   date:"Fev 2025" },
  wjgc26_b1213:  { name:"WJGC 2026",          short:"WJGC26",   date:"Fev 2026" },
  eowagr25_b78:  { name:"European Open",       short:"EU Open",  date:"Ago 2025" },
  eowagr25_b910: { name:"European Open",       short:"EU Open",  date:"Ago 2025" },
  eowagr25_b1314:{ name:"European Open",       short:"EU Open",  date:"Ago 2025" },
  doral25_b89:   { name:"Doral Junior 2025",   short:"Doral",    date:"Dez 2025" },
  doral25_b1011: { name:"Doral Junior 2025",   short:"Doral",    date:"Dez 2025" },
  doral25_b1213: { name:"Doral Junior 2025",   short:"Doral",    date:"Dez 2025" },
  venice25_b9:   { name:"Venice Open 2025",    short:"Venice",   date:"Ago 2025" },
  venice25_b10:  { name:"Venice Open 2025",    short:"Venice",   date:"Ago 2025" },
  venice25_b11:  { name:"Venice Open 2025",    short:"Venice",   date:"Ago 2025" },
  venice25_b12:  { name:"Venice Open 2025",    short:"Venice",   date:"Ago 2025" },
  rome25_b10:    { name:"Rome Classic 2025",   short:"Rome",     date:"Out 2025" },
  rome25_b11:    { name:"Rome Classic 2025",   short:"Rome",     date:"Out 2025" },
  rome25_b12:    { name:"Rome Classic 2025",   short:"Rome",     date:"Out 2025" },
  marco25_b9:    { name:"Marco Simone Inv.",    short:"Marco25",  date:"Mar 2025" },
  marco25_b10:   { name:"Marco Simone Inv.",    short:"Marco25",  date:"Mar 2025" },
  marco25_b11:   { name:"Marco Simone Inv.",    short:"Marco25",  date:"Mar 2025" },
  marco25_b12:   { name:"Marco Simone Inv.",    short:"Marco25",  date:"Mar 2025" },
  marco26_b9:    { name:"Marco Simone Inv. 2026", short:"Marco26", date:"Mar 2026" },
  marco26_b10:   { name:"Marco Simone Inv. 2026", short:"Marco26", date:"Mar 2026" },
  marco26_b11:   { name:"Marco Simone Inv. 2026", short:"Marco26", date:"Mar 2026" },
  marco26_b12:   { name:"Marco Simone Inv. 2026", short:"Marco26", date:"Mar 2026" },
  desert26_b9:   { name:"Desert Shootout",     short:"Desert",   date:"Fev 2026" },
  desert26_b10:  { name:"Desert Shootout",     short:"Desert",   date:"Fev 2026" },
  desert26_b11:  { name:"Desert Shootout",     short:"Desert",   date:"Fev 2026" },
  desert26_b12:  { name:"Desert Shootout",     short:"Desert",   date:"Fev 2026" },
  sandestin26_b9: { name:"Sandestin Champ.",   short:"Sandest",  date:"Jan 2026" },
  sandestin26_b10:{ name:"Sandestin Champ.",   short:"Sandest",  date:"Jan 2026" },
  sandestin26_b11:{ name:"Sandestin Champ.",   short:"Sandest",  date:"Jan 2026" },
  sandestin26_b12:{ name:"Sandestin Champ.",   short:"Sandest",  date:"Jan 2026" },
  msstate26_b9:  { name:"MS State Inv. 2026",  short:"MS State", date:"Mar 2026" },
  msstate26_b10: { name:"MS State Inv. 2026",  short:"MS State", date:"Mar 2026" },
  msstate26_b11: { name:"MS State Inv. 2026",  short:"MS State", date:"Mar 2026" },
  msstate26_b12: { name:"MS State Inv. 2026",  short:"MS State", date:"Mar 2026" },
  elprat23_b8:   { name:"El Prat 2023",        short:"El Prat",  date:"Out 2023" },
  elprat23_b9:   { name:"El Prat 2023",        short:"El Prat",  date:"Out 2023" },
  elprat23_b10:  { name:"El Prat 2023",        short:"El Prat",  date:"Out 2023" },
  doral24_b89:   { name:"Doral Junior 2024",   short:"Doral24",  date:"Dez 2024" },
  doral24_b1011: { name:"Doral Junior 2024",   short:"Doral24",  date:"Dez 2024" },
  doral24_b1213: { name:"Doral Junior 2024",   short:"Doral24",  date:"Dez 2024" },
  gg25:          { name:"Greatgolf Open 2025",  short:"GG25",     date:"Fev 2025" },
  gg26_u14:      { name:"Greatgolf U14 2026",   short:"GG U14",   date:"Fev 2026" },
  gg26_open:     { name:"Greatgolf Open 2026",  short:"GG Open",  date:"Fev 2026" },
};

// ── Players estáticos (BJGT/WJGC não cobertos pelo USKids scraper) ──
const TG_D: TGPlayer[] = [
  {n:"Manuel Medeiros",co:"Portugal",isM:true,dob:"29/04/2014",r:{brjgt25:{p:26,t:265,tp:52,rd:[90,85,90]},eowagr25:{p:7,t:238,tp:22,rd:[85,77,76]},venice25:{p:28,t:237,tp:21,rd:[78,76,83]},rome25:{p:10,t:166,tp:22,rd:[89,77]},doral25:{p:29,t:177,tp:35,rd:[98,79]},qdl25:{p:11,t:90,tp:18,rd:[90]},gg26:{p:4,t:169,tp:25,rd:[87,82]},wjgc26:{p:9,t:232,tp:16,rd:[79,78,75]}},up:[]},
  {n:"Dmitrii Elchaninov",co:"Russian Federation",dob:"13/05/2014",r:{brjgt25:{p:1,t:205,tp:-8,rd:[69,68,68]},eowagr25:{p:2,t:218,tp:2,rd:[77,70,71]},venice25:{p:1,t:198,tp:-18,rd:[62,68,68]},qdl25:{p:1,t:71,tp:-1,rd:[71]},wjgc26:{p:1,t:210,tp:-6,rd:[69,69,72]}},up:[]},
  {n:"Diego Gross Paneque",co:"Spain",r:{brjgt25:{p:16,t:249,tp:36,rd:[80,84,85]},wjgc26:{p:9,t:232,tp:16,rd:[76,75,81]}},up:[]},
  {n:"Álex Carrón",co:"Spain",r:{brjgt25:{p:13,t:246,tp:33,rd:[82,84,80]},wjgc26:{p:12,t:241,tp:25,rd:[76,82,83]}},up:[]},
  {n:"Henry Liechti",co:"Switzerland",r:{brjgt25:{p:17,t:250,tp:37,rd:[87,84,79]},wjgc26:{p:23,t:255,tp:39,rd:[79,87,89]}},up:[]},
  {n:"Niko Alvarez Van Der Walt",co:"Spain",r:{brjgt25:{p:22,t:261,tp:48,rd:[89,83,89]},wjgc26:{p:19,t:249,tp:33,rd:[81,86,82]}},up:[]},
  {n:"Miroslavs Bogdanovs",co:"Spain",dob:"19/05/2014",r:{brjgt25:{p:24,t:263,tp:50,rd:[86,88,89]},venice25:{p:18,t:227,tp:11,rd:[76,74,77]},wjgc26:{p:20,t:252,tp:36,rd:[78,86,88]}},up:[]},
  {n:"Christian Chepishev",co:"Bulgaria",r:{brjgt25:{p:29,t:270,tp:57,rd:[87,86,97]},wjgc26:{p:7,t:230,tp:14,rd:[75,76,79]}},up:["marco26"]},
  {n:"James Doyle",co:"Ireland",r:{brjgt25:{p:32,t:277,tp:64,rd:[93,92,92]},wjgc26:{p:31,t:276,tp:60,rd:[91,87,98]}},up:[]},
  {n:"Alexis Beringer",co:"Switzerland",r:{brjgt25:{p:33,t:290,tp:77,rd:[93,94,103]},wjgc26:{p:17,t:246,tp:30,rd:[83,82,81]}},up:[]},
  {n:"Kevin Canton",co:"Italy",r:{brjgt25:{p:34,t:291,tp:78,rd:[98,96,97]},wjgc26:{p:30,t:273,tp:57,rd:[85,88,100]}},up:[]},
  {n:"Leon Schneitter",co:"Switzerland",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]},wjgc26:{p:11,t:236,tp:20,rd:[76,80,80]}},up:[]},
  {n:"Victor Canot Januel",co:"France",r:{brjgt25:{p:30,t:274,tp:61,rd:[88,88,98]},venice25:{p:24,t:233,tp:17,rd:[76,82,75]}},up:[]},
  {n:"Theodore Dausse",co:"France",r:{brjgt25:{p:31,t:275,tp:62,rd:[96,90,89]},venice25:{p:30,t:244,tp:28,rd:[83,80,81]}},up:[]},
  {n:"Aronas Juodis",co:"Lithuania",r:{brjgt25:{p:8,t:232,tp:19,rd:[74,77,81]},eowagr25:{p:1,t:213,tp:-3,rd:[72,71,70]},qdl25:{p:4,t:75,tp:3,rd:[75]},wjgc26_1213:{p:22,t:163,tp:17,rd:[87,76]}},up:[]},
  {n:"Marcus Karim",co:"England",r:{brjgt25:{p:2,t:218,tp:5,rd:[74,73,71]},qdl25:{p:3,t:72,tp:0,rd:[72]},wjgc26_1213:{p:8,t:150,tp:4,rd:[78,72]}},up:[]},
  {n:"Harrison Barnett",co:"England",r:{brjgt25:{p:3,t:220,tp:7,rd:[77,71,72]},qdl25:{p:6,t:78,tp:6,rd:[78]},wjgc26_1213:{p:19,t:160,tp:14,rd:[83,77]}},up:[]},
  {n:"Julian Sepulveda",co:"United States",r:{brjgt25:{p:4,t:223,tp:10,rd:[73,77,73]},doral25:{p:17,t:162,tp:20,rd:[81,81]}},up:[]},
  {n:"Mihir Pasura",co:"United Kingdom",r:{brjgt25:{p:5,t:229,tp:16,rd:[82,74,73]}},up:[]},
  {n:"Yorick De Hek",co:"Netherlands",r:{brjgt25:{p:28,t:270,tp:57,rd:[92,87,91]},eowagr25:{p:5,t:234,tp:18,rd:[79,76,79]}},up:[]},
  {n:"Nial Diwan",co:"England",r:{brjgt25:{p:25,t:264,tp:51,rd:[93,87,84]},eowagr25:{p:6,t:238,tp:22,rd:[81,84,73]}},up:[]},
  {n:"Maximilien Demole",co:"Switzerland",r:{venice25:{p:3,t:207,tp:-9,rd:[69,70,68]},doral25:{p:5,t:155,tp:13,rd:[80,75]}},up:[]},
  {n:"Emile Cuanalo",co:"England",r:{eowagr25:{p:3,t:224,tp:8,rd:[70,76,78]},venice25:{p:5,t:211,tp:-5,rd:[67,71,73]},rome25:{p:2,t:139,tp:-5,rd:[70,69]},qdl25:{p:5,t:75,tp:3,rd:[75]},wjgc26_1213:{p:5,t:146,tp:0,rd:[74,72]}},up:[]},
  {n:"Gregorio Vitolo",co:"Italy",r:{venice25:{p:2,t:204,tp:-12,rd:[64,71,69]},rome25:{p:1,t:134,tp:-10,rd:[67,67]},wjgc26:{p:14,t:244,tp:28,rd:[80,82,82]}},up:[]},
  {n:"Hugo Luque Reina",co:"Spain",r:{eowagr25:{p:4,t:229,tp:13,rd:[80,74,75]},wjgc26:{p:18,t:247,tp:31,rd:[82,82,83]}},up:["marco26"]},
  {n:"Maxime Vervaet",co:"Belgium",r:{eowagr25:{p:8,t:246,tp:30,rd:[85,80,81]},wjgc26:{p:16,t:244,tp:28,rd:[81,82,81]}},up:[]},
  {n:"Emilio Valverde",co:"Spain",r:{eowagr25:{p:9,t:252,tp:36,rd:[87,84,81]},wjgc26:{p:26,t:261,tp:45,rd:[87,87,87]}},up:[]},
  {n:"Nicolas Pape",co:"France",r:{wjgc26:{p:6,t:227,tp:11,rd:[75,76,76]}},up:[]},
];

// ── Pesos de presença (round averages a partir de D estático) ──
const TG_AVG_R: Record<string, Array<{ m: number; s: number } | null>> = {};
for (const t of TG_T) {
  TG_AVG_R[t.id] = [];
  for (let i = 0; i < t.rounds; i++) {
    const vals = TG_D.filter(p => (p.r[t.id] as any)?.rd?.[i] != null).map(p => (p.r[t.id] as any).rd[i]).filter((v: any): v is number => v != null);
    if (vals.length > 1) {
      const m = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
      const s = Math.sqrt(vals.reduce((a: number, b: number) => a + (b - m) ** 2, 0) / vals.length);
      TG_AVG_R[t.id][i] = { m, s };
    }
  }
}

const TG_TIER_L = { elite: "Elite", strong: "Forte", solid: "Sólido", developing: "Em Desenv.", beginner: "Iniciante" };
const TG_TR_I: Record<string, { i: string; c: string }> = {
  up2:    { i: "▲▲", c: "var(--color-good)" },
  up:     { i: "▲",  c: "var(--score-par-seg)" },
  stable: { i: "●",  c: "var(--text-muted)" },
  down:   { i: "▼",  c: "var(--color-warn)" },
  down2:  { i: "▼▼", c: "var(--color-danger)" },
};
const TG_TIER = {
  elite:      { bg: "var(--bg-success-strong)",  c: "var(--color-good-dark)" },
  strong:     { bg: "var(--bg-current,#e0f7fa)", c: "var(--text-current,#006064)" },
  solid:      { bg: "var(--bg-warn-light)",       c: "var(--color-warn-dark)" },
  developing: { bg: "var(--bg-warn-strong)",      c: "var(--color-warn-dark)" },
  beginner:   { bg: "var(--bg-danger-subtle,var(--bg-danger-strong))", c: "var(--color-danger-dark)" },
};

const TG_HIDDEN: Array<[string, string]> = [
  // WJGC25: brjgt25 escondido quando existe o tid USKids
  ["brjgt25",        "wjgc25_b1011"],
  // WJGC26: wjgc26_1213 (Boys 12-13) já não está em TG_T; suprimir auto tids USKids
  ["wjgc26_b1213",   "wjgc26_1213"],
  ["wjgc26_b1011",   "wjgc26"],
  // EU Open 2025: suprimir tids USKids em favor do TG_T eowagr25
  ["eowagr25_b78",   "eowagr25"], ["eowagr25_b910",  "eowagr25"],
  ["eowagr25_b1011", "eowagr25"], ["eowagr25_b1314", "eowagr25"],
  // Venice 2025
  ["venice25_b11","venice25"], ["venice25_b12","venice25"],
  ["venice25_b9", "venice25"], ["venice25_b10","venice25"],
  // Rome 2025
  ["rome25_b11","rome25"], ["rome25_b12","rome25"],
  ["rome25_b9", "rome25"], ["rome25_b10","rome25"],
  // Doral 2025
  ["doral25_b1011","doral25"], ["doral25_b89","doral25"], ["doral25_b1213","doral25"],
  // QDL 2025
  ["qdl25_b11","qdl25"], ["qdl25_b12","qdl25"], ["qdl25_b9","qdl25"],
  // Greatgolf 2026
  ["gg26_u14","gg26"], ["gg26_open","gg26"],
  // Marco Simone 2026 — esconder outros escalões quando Boys 11 (marco26) presente
  ["marco26_b9","marco26"],  ["marco26_b10","marco26"],  ["marco26_b12","marco26"],
  ["usk21080_b9","marco26"], ["usk21080_b10","marco26"], ["usk21080_b12","marco26"],
  // Marco Simone 2025 — esconder outros escalões quando Boys 11 (usk18438_b11) presente
  ["marco25_b9","usk18438_b11"],  ["marco25_b10","usk18438_b11"],  ["marco25_b12","usk18438_b11"],
  ["usk18438_b9","usk18438_b11"], ["usk18438_b10","usk18438_b11"], ["usk18438_b12","usk18438_b11"],
];

function tgHiddenTids(p: TGPlayer): Set<string> {
  const hidden = new Set<string>();
  for (const [toHide, whenPresent] of TG_HIDDEN) {
    if ((p.r[toHide] as any)?.rd?.length > 0 && (p.r[whenPresent] as any)?.rd?.length > 0)
      hidden.add(toHide);
  }
  return hidden;
}

function tgNPlayed(p: TGPlayer) {
  const total = Object.values(p.r).filter(r => r && (r.tp != null || r.rd?.length > 0)).length;
  return total - tgHiddenTids(p).size;
}

function tgNRounds(p: TGPlayer) {
  const hidden = tgHiddenTids(p);
  return Object.entries(p.r).reduce((acc, [tid, res]) => {
    if (hidden.has(tid)) return acc;
    return acc + (res?.rd ? res.rd.filter((x: number) => x != null && x > 0).length : 0);
  }, 0);
}

function tgGetVsAvg(p: TGPlayer, manuelRef: TGPlayer | null): number | null {
  if (p.isM || !manuelRef) return null;
  const ds: number[] = [];
  Object.keys(p.r).forEach(tid => {
    const mr = manuelRef.r[tid];
    if (mr && p.r[tid].tp != null && mr.tp != null) ds.push(p.r[tid].tp! - mr.tp!);
  });
  return ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
}

function tgGetTournInfo(tid: string): { name: string; short: string; date: string; dateExact: string } {
  const manual = TG_T.find(t => t.id === tid);
  if (manual) return { name: manual.name, short: manual.short, date: manual.date, dateExact: manual.dateExact ?? manual.date };
  const autoName = TG_AUTO_NAMES[tid];
  if (autoName) return { ...autoName, dateExact: autoName.date };
  const uskMatch = tid.match(/^(usk\d+)_b(\d+)$/);
  if (uskMatch) {
    const base = uskTournNames.get(uskMatch[1]);
    if (base) return { name: base.name, short: base.short, date: base.date, dateExact: base.dateExact ?? base.date };
  }
  return { name: tid, short: tid, date: "?", dateExact: "9999" };
}

function tgGetTournWeight(tid: string): number {
  if (tid.startsWith("brjgt") || tid.startsWith("wjgc"))  return 1.2;
  if (tid.startsWith("venice") || tid.startsWith("doral")) return 1.2;
  if (/^usk\d+_b\d+$/.test(tid)) {
    const base = tid.replace(/_b\d+$/, "");
    const name = (uskTournNames.get(base)?.name ?? "").toLowerCase();
    if (name.includes("world")) return 1.4;
    if (name.includes("european")) return 1.2;
    if (name.includes("venice")) return 1.2;
    return 1.0;
  }
  return 0.3;
}

function tgFmtSign(n: number | null | undefined, dec = 0): string {
  if (n == null) return "—";
  const s = dec === 0 ? Math.round(n).toString() : n.toFixed(dec);
  return n > 0 ? `+${s}` : s;
}

function tgSc3m(v: number): string {
  if (v < -2) return "var(--color-good)";
  if (v < 0) return "var(--score-par-seg,var(--color-good))";
  if (v === 0) return "var(--text-3)";
  if (v <= 3) return "var(--color-warn)";
  return "var(--color-danger)";
}

function tgTpColorDark(tp: number | null | undefined): string {
  if (tp == null) return "var(--text-3)";
  if (tp <= -5) return "var(--score-eagle)";
  if (tp < 0)  return "var(--color-good-dark)";
  if (tp === 0) return "var(--text-2)";
  if (tp <= 10) return "var(--color-warn-dark)";
  return "var(--color-danger-dark)";
}

// ── zTier calculation (simplified) ──
function tgZTier(playerAvg: number, field: { m: number; s: number }): keyof typeof TG_TIER | null {
  if (field.s <= 0) return null;
  const z = (playerAvg - field.m) / field.s;
  if (z <= -1.5) return "elite";
  if (z <= -0.8) return "strong";
  if (z <= 0.2)  return "solid";
  if (z <= 1.0)  return "developing";
  return "beginner";
}

// ── Rank map (simplified z-rank) ──
function tgBuildRankMap(rivals: TGPlayer[]): Record<string, number> {
  const scored: { n: string; avg: number }[] = [];
  for (const p of rivals) {
    const hidden = tgHiddenTids(p);
    const tps = Object.entries(p.r)
      .filter(([tid, r]) => !hidden.has(tid) && r?.tp != null)
      .map(([, r]) => r.tp as number);
    if (tps.length >= 2) {
      scored.push({ n: p.n, avg: tps.reduce((a, b) => a + b, 0) / tps.length });
    }
  }
  scored.sort((a, b) => a.avg - b.avg);
  const m: Record<string, number> = {};
  scored.forEach((s, i) => { m[s.n] = i + 1; });
  return m;
}

// ── Trend (simplified) ──
function tgGetTrend(p: TGPlayer): string | null {
  const hidden = tgHiddenTids(p);
  const tps = Object.entries(p.r)
    .filter(([tid, r]) => !hidden.has(tid) && r?.tp != null)
    .sort(([a], [b]) => tgGetTournInfo(a).dateExact.localeCompare(tgGetTournInfo(b).dateExact))
    .map(([, r]) => r.tp as number);
  if (tps.length < 2) return null;
  const half = Math.floor(tps.length / 2);
  const first = tps.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const last  = tps.slice(-half).reduce((a, b) => a + b, 0) / half;
  const diff = last - first;
  if (diff <= -5)  return "up2";
  if (diff <= -2)  return "up";
  if (diff >= 5)   return "down2";
  if (diff >= 2)   return "down";
  return "stable";
}

// ── Mapeamento de tids USKids/auto → tids canónicos de TG_T ──
// Permite que jogadores auto-carregados apareçam nas colunas fixas correctas.
// Mapeamento de tids auto → tids canónicos de TG_T.
// REGRA: mapear APENAS o escalão que o Manuel jogou em cada torneio.
// Os outros escalões ficam com o tid original e são ignorados (não aparecem
// em visibleTids nem em manuelTids → filtrados automaticamente na TabelaGlobal).
const TG_TID_EXACT: Record<string, string> = {
  // WJGC 2025 → brjgt25 — APENAS Boys 10-11 (escalão do Manuel)
  "wjgc25_b1011":"brjgt25",
  // EU Open 2025 → eowagr25 — Manuel jogou o escalão principal (eowagr25 directo)
  // Os outros escalões (b78, b910, b1314) não são mapeados e ficam suprimidos.
  // Venice 2025 → venice25 — APENAS Boys 11 (escalão do Manuel)
  "venice25_b11":"venice25",
  // Rome 2025 → rome25 — APENAS Boys 11 (escalão do Manuel)
  "rome25_b11":"rome25",
  // Doral 2025 → doral25 — APENAS Boys 10-11 (escalão do Manuel)
  "doral25_b1011":"doral25",
  // QDL 2025 → qdl25 (torneio sub-12 unificado — escalão único)
  "qdl25_b9":"qdl25", "qdl25_b11":"qdl25", "qdl25_b12":"qdl25",
  // GG 2025 → gg25 — APENAS Boys 10 (escalão do Manuel)
  "gg25_b10":"gg25",
  // WJGC 2026 → wjgc26 — APENAS Boys 10-11 (escalão do Manuel)
  "wjgc26_b1011":"wjgc26",
  // Marco Simone 2026 → marco26 — APENAS Boys 11 (escalão do Manuel)
  "marco26_b11":"marco26",
  // USKids completo (tcode numérico) — apenas escalão do Manuel
  "usk21080_b11":"marco26",   // Marco Simone Inv. 2026 (tcode 21080)
  "usk19418_b11":"venice25",  // Venice Open 2025 (tcode 19418) — Boys 11
  "usk20175_b11":"rome25",    // Rome Classic 2025 (tcode 20175) — Boys 11
  // Marco Simone 2025 — colapsar formato antigo no formato completo (evitar 2 colunas auto)
  "marco25_b11":"usk18438_b11",  // Marco Simone Inv. 2025 (tcode 18438) — Boys 11
};
// Mapeamento genérico por tcode USKids — vazio intencionalmente.
// Anteriormente mapeava TODOS os escalões de venice25/rome25 para o mesmo tid.
// Substituído por entradas exactas por escalão em TG_TID_EXACT acima.
const TG_USK_TCODE: Record<string, string> = {};

function tgNormalizeTid(tid: string): string {
  if (TG_TID_EXACT[tid]) return TG_TID_EXACT[tid];
  const m = tid.match(/^(usk\d+)_b\d+$/);
  if (m && TG_USK_TCODE[m[1]]) return TG_USK_TCODE[m[1]];
  return tid;
}

// ── Merge TG_D com autoRivals ──
function tgMerge(autoRivals: AutoRivalPlayer[]): TGPlayer[] {
  const normName = (n: string) => n.toLowerCase().trim().replace(/\s+/g, " ");
  const ALIASES: Record<string, string> = {
    "manuel francisco medeiros": "manuel medeiros",
    "manuel goulartt medeiros":  "manuel medeiros",
    "manuel f medeiros":         "manuel medeiros",
  };
  const resolve = (n: string) => ALIASES[normName(n)] ?? normName(n);

  const map = new Map<string, TGPlayer>(TG_D.map(p => [resolve(p.n), { ...p, r: { ...p.r } }]));

  for (const ap of autoRivals) {
    const key = resolve(ap.n);
    if (map.has(key)) {
      const ex = map.get(key)!;
      for (const [rawTid, res] of Object.entries(ap.r)) {
        const tid = tgNormalizeTid(rawTid);
        if (!ex.r[tid] || (res.rd?.length ?? 0) > (ex.r[tid]?.rd?.length ?? 0)) {
          ex.r[tid] = { p: res.p ?? "WD", tp: res.tp ?? null, t: undefined, rd: res.rd ?? [] };
        }
      }
      if (ap.co && !ex.co) ex.co = ap.co;
      if (ap.dob && !ex.dob) ex.dob = ap.dob;
      // Merge up arrays — inscrições futuras do autoRivals
      if (ap.up?.length) ex.up = [...new Set([...ex.up, ...ap.up])];
    } else {
      const convertedR: Record<string, TGResult> = {};
      for (const [rawTid, v] of Object.entries(ap.r)) {
        const tid = tgNormalizeTid(rawTid);
        if (!convertedR[tid] || (v.rd?.length ?? 0) > (convertedR[tid]?.rd?.length ?? 0)) {
          convertedR[tid] = { p: v.p ?? "WD" as "WD", tp: v.tp ?? null, rd: v.rd ?? [] };
        }
      }
      map.set(key, { n: ap.n, co: ap.co ?? "", r: convertedR, up: ap.up ?? [] });
    }
  }
  return Array.from(map.values());
}

/* ════════════════════════════════════════════════════════════════
   TabelaGlobal — tabela completa de todos os rivais × torneios
   ════════════════════════════════════════════════════════════════ */
function TabelaGlobal({ autoRivals, futureCols, fieldData }: {
  autoRivals: AutoRivalPlayer[];
  futureCols?: { tid: string; short: string; escalao: string; url?: string }[];
  fieldData: FieldData | null;
}) {
  const rivals = useMemo(() => tgMerge(autoRivals), [autoRivals]);
  const manuelRef = useMemo(() => rivals.find(p => p.isM) ?? null, [rivals]);

  // Mapa de inscrições: tid → Set de nomes normalizados (de fieldData, não de up)
  const inscricaoMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!fieldData || !futureCols?.length) return m;
    for (const fc of futureCols) {
      const tNum = parseInt(fc.tid.replace("usk", ""));
      const torneio = fieldData.torneios.find(t => t.t === tNum);
      if (!torneio) continue;
      const s = new Set<string>();
      for (const esc of torneio.escaloes) {
        for (const j of (esc.jogadores ?? [])) {
          s.add(normNameAuto(j.nome));
        }
      }
      m.set(fc.tid, s);
    }
    return m;
  }, [fieldData, futureCols]);

  const [fTour, setFTour] = useState("all");
  const [fCo,   setFCo]   = useState("all");
  const [q,     setQ]     = useState("");
  const [sort,  setSort]  = useState("rank");
  const [dir,   setDir]   = useState<"asc"|"desc">("asc");
  const [dOnly, setDOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const rankMap = useMemo(() => tgBuildRankMap(rivals), [rivals]);
  const totalRanked = Object.keys(rankMap).length;

  const allCountries = useMemo(() => [...new Set(rivals.map(p => p.co))].sort(), [rivals]);

  // Tids de escalões que o Manuel NÃO jogou — suprimir de colunas auto e do list filter
  const TG_SUPPRESS = [
    "wjgc26_1213",
    // WJGC 2025 — Boys 8-9 e Boys 12-13 (Manuel jogou Boys 10-11)
    "wjgc25_b89", "wjgc25_b1213",
    // EU Open 2025 — outros escalões (Manuel jogou eowagr25 directo = Boys 11-12)
    "eowagr25_b78", "eowagr25_b910", "eowagr25_b1011", "eowagr25_b1314",
    // Venice 2025 — Boys 9, 10, 12 (Manuel jogou Boys 11)
    "venice25_b9", "venice25_b10", "venice25_b12",
    "usk19418_b9", "usk19418_b10", "usk19418_b12",
    // Rome 2025 — Boys 9, 10, 12 (Manuel jogou Boys 11)
    "rome25_b9", "rome25_b10", "rome25_b12",
    "usk20175_b9", "usk20175_b10", "usk20175_b12",
    // Doral 2025 — Boys 8-9 e Boys 12-13 (Manuel jogou Boys 10-11)
    "doral25_b89", "doral25_b1213",
    // WJGC 2026 — Boys 12-13 (Manuel jogou Boys 10-11)
    "wjgc26_b1213",
    // GG 2026 — U14 e Open (Manuel jogou sub-12 = gg26)
    "gg26_u14", "gg26_open",
    // Marco 2026 — Boys 9, 10, 12 (Manuel jogou Boys 11)
    "marco26_b9", "marco26_b10", "marco26_b12",
    "usk21080_b9", "usk21080_b10", "usk21080_b12",
    // GG 2025 — outros escalões além do Boys 10 (Manuel)
    "gg25_b9", "gg25_b11", "gg25_b12",
    // Marco Simone 2025 — Boys 9, 10, 12 (Manuel jogou Boys 11 = usk18438_b11)
    "marco25_b9", "marco25_b10", "marco25_b12",
    "usk18438_b9", "usk18438_b10", "usk18438_b12",
    // Venice 2025 — Boys 8 (tcode 19418 e formato antigo; Manuel jogou Boys 11)
    "venice25_b8", "usk19418_b8",
  ];

  const autoTournCols = useMemo(() => {
    const tFixed = new Set(TG_T.map(t => t.id));
    const tFuture = new Set((futureCols ?? []).map(c => c.tid));

    // Tids onde o Manuel tem resultado real
    const manuelTids = new Set<string>();
    const manuel = rivals.find(p => p.isM);
    if (manuel) {
      for (const [tid, res] of Object.entries(manuel.r)) {
        if (res && (res.tp != null || (res.rd?.length ?? 0) > 0)) manuelTids.add(tid);
      }
    }

    const counts = new Map<string, number>();
    for (const p of rivals) {
      for (const [tid, res] of Object.entries(p.r)) {
        if (tFixed.has(tid) || tFuture.has(tid)) continue;
        if (TG_SUPPRESS.some(pfx => tid.startsWith(pfx))) continue; // duplicado de TG_T
        if (!manuelTids.has(tid)) continue;
        if (!res || (res.tp == null && !(res as any).p)) continue;
        counts.set(tid, (counts.get(tid) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .filter(([, n]) => n >= 1)
      .sort((a, b) => {
        const dA = tgGetTournInfo(a[0]).dateExact, dB = tgGetTournInfo(b[0]).dateExact;
        return dB.localeCompare(dA) || b[1] - a[1];
      })
      .map(([tid]) => ({ tid, info: tgGetTournInfo(tid), weight: tgGetTournWeight(tid) }));
  }, [rivals, futureCols]);

  // AVG_R dinâmico para colunas auto-detectadas (para z-tier coloring)
  const autoAvgR = useMemo(() => {
    const m: Record<string, { avg: number; std: number } | null> = {};
    for (const { tid } of autoTournCols) {
      const avgs: number[] = [];
      for (const p of rivals) {
        const res = p.r[tid];
        if (!res || res.tp == null) continue;
        const rounds = res.rd?.filter((x: number) => x > 0);
        if (!rounds?.length) continue;
        const gross = rounds.reduce((a: number, b: number) => a + b, 0);
        avgs.push(gross / rounds.length); // média por ronda
      }
      if (avgs.length < 3) { m[tid] = null; continue; }
      const avg = avgs.reduce((a, b) => a + b, 0) / avgs.length;
      const std = Math.sqrt(avgs.reduce((a, b) => a + (b - avg) ** 2, 0) / avgs.length);
      m[tid] = std > 0 ? { avg, std } : null;
    }
    return m;
  }, [autoTournCols, rivals]);

  const allTournCols = useMemo(() => [
    ...TG_T.map(t => ({ tid: t.id, info: { name: t.name, short: t.short, date: t.date, dateExact: t.dateExact ?? "" }, weight: tgGetTournWeight(t.id), url: t.url, isFixed: true, isFuture: false })),
    ...autoTournCols.map(c => ({ ...c, url: undefined, isFixed: false, isFuture: false })),
    ...(futureCols ?? []).map(c => ({ tid: c.tid, info: { name: c.short, short: c.short, date: "", dateExact: "9999" }, weight: 1.2, url: c.url, isFixed: false, isFuture: true })),
  ], [autoTournCols, futureCols]);

  const list = useMemo(() => {
    // Tids visíveis (colunas reais, sem futuras)
    const visibleTids = new Set(allTournCols.filter(c => !c.isFuture).map(c => c.tid));
    let pl = rivals.filter(p =>
      p.isM || Object.keys(p.r).some(tid => visibleTids.has(tid) && p.r[tid]?.tp != null)
    );
    if (dOnly) pl = pl.filter(x => Object.values(x.r).some(r => r.tp != null));
    if (fTour !== "all") pl = pl.filter(x => x.r[fTour]);
    if (fCo !== "all") pl = pl.filter(x => x.co === fCo);
    if (q) { const ql = q.toLowerCase(); pl = pl.filter(x => x.n.toLowerCase().includes(ql)); }
    pl.sort((a, b) => {
      let cmp = 0;
      if (sort === "name") cmp = a.n.localeCompare(b.n);
      else if (sort === "rank") cmp = (rankMap[a.n] ?? 9999) - (rankMap[b.n] ?? 9999);
      else if (sort === "nT") cmp = tgNPlayed(b) - tgNPlayed(a);
      else if (sort.startsWith("t:")) {
        const tid = sort.slice(2);
        const isFutureTid = allTournCols.find(c => c.tid === tid)?.isFuture ?? false;
        if (isFutureTid) {
          // Coluna de inscrições: inscritos primeiro (1), não inscritos depois (0)
          const inscribed = inscricaoMap.get(tid);
          const aIn = inscribed ? (a.isM ? inscribed.has(normNameAuto("Manuel Medeiros")) : inscribed.has(normNameAuto(a.n))) : false;
          const bIn = inscribed ? (b.isM ? inscribed.has(normNameAuto("Manuel Medeiros")) : inscribed.has(normNameAuto(b.n))) : false;
          cmp = (bIn ? 1 : 0) - (aIn ? 1 : 0);
        } else {
          const posOf = (x: TGPlayer) => { const r = x.r[tid]; if (!r || (r.tp == null && r.p !== "WD")) return 9999; return typeof r.p === "number" ? r.p : 9998; };
          cmp = posOf(a) - posOf(b);
        }
      }
      if (a.isM) return -999;
      if (b.isM) return 999;
      return dir === "desc" ? -cmp : cmp;
    });
    return pl;
  }, [fTour, fCo, q, sort, dir, dOnly, rivals, rankMap, allTournCols]);

  const doSort = (c: string) => { if (sort === c) setDir(d => d === "asc" ? "desc" : "asc"); else { setSort(c); setDir("asc"); } };
  const sortIcon = (c: string) => sort === c ? (dir === "asc" ? " ↑" : " ↓") : "";

  // Manuel KPIs
  const manuelKpis = manuelRef ? (() => {
    const allRds = Object.values(manuelRef.r).flatMap((r: any) => r.rd?.filter((x: number) => x > 0) ?? []) as number[];
    return {
      torn: tgNPlayed(manuelRef),
      rondas: tgNRounds(manuelRef),
      avg: allRds.length ? (allRds.reduce((a, b) => a + b, 0) / allRds.length).toFixed(1) : null,
      best: allRds.length ? Math.min(...allRds) : null,
    };
  })() : null;

  const activeCount = [fTour, fCo].filter(v => v !== "all").length + (dOnly ? 1 : 0) + (q ? 1 : 0);
  const resetAll = () => { setFTour("all"); setFCo("all"); setDOnly(false); setQ(""); };

  return (
    <div>
      {/* Manuel KPIs */}
      {manuelKpis && (
        <div style={{ display:"flex", gap:6, flexWrap:"nowrap", overflowX:"auto", marginBottom:12, alignItems:"stretch", scrollbarWidth:"none" }}>
          <div className="kpi" style={{ flex:"0 0 auto", padding:"6px 10px", background:"var(--bg-info-subtle,var(--bg-info))", borderLeft:"3px solid var(--accent)", minWidth:0 }}>
            <div className="kpi-lbl" style={{ color:"var(--color-info-alt)", fontSize:9, marginBottom:3 }}>MANUEL — TOTAL</div>
            <div style={{ display:"flex", gap:8, alignItems:"baseline" }}>
              <span><span className="fw-800 fs-14">{manuelKpis.torn}</span><span style={{ fontSize:9, color:"var(--text-3)", marginLeft:2 }}>T</span></span>
              <span><span className="fw-800 fs-14">{manuelKpis.rondas}</span><span style={{ fontSize:9, color:"var(--text-3)", marginLeft:2 }}>R</span></span>
              {manuelKpis.avg && <span><span className="fw-700 fs-13">{manuelKpis.avg}</span><span style={{ fontSize:9, color:"var(--text-3)", marginLeft:2 }}>avg</span></span>}
              {manuelKpis.best && <span><span className="fw-700 fs-13" style={{ color:"var(--color-good-dark)" }}>{manuelKpis.best}</span><span style={{ fontSize:9, color:"var(--text-3)", marginLeft:2 }}>min</span></span>}
            </div>
          </div>
          {TG_T.map(t => {
            const res = manuelRef?.r[t.id];
            if (!res) return (
              <div key={t.id} className="kpi" style={{ opacity:.4, padding:"6px 8px", flex:"1 1 60px", minWidth:60 }}>
                <div className="kpi-lbl">{t.short}</div>
                <div className="kpi-val fs-15">–</div>
              </div>
            );
            return (
              <div key={t.id} className="kpi" style={{ padding:"6px 8px", flex:"1 1 60px", minWidth:60 }}>
                <div className="kpi-lbl">{t.short}</div>
                <div className="kpi-val" style={{ fontSize:16, color: tgTpColorDark(res.tp) }}>{tgFmtSign(res.tp)}</div>
                <div className="kpi-sub">#{res.p as number}{res.rd?.length > 0 && <span style={{ marginLeft:3, opacity:.7 }}>{res.rd.join("-")}</span>}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filtros */}
      <div style={{ marginBottom:8 }}>
        <div className="detail-toolbar" style={{ flexWrap:"wrap" }}>
          <input type="text" placeholder="Pesquisar..." value={q} onChange={e => setQ(e.target.value)} className="input" style={{ maxWidth:140 }} />
          <select value={fTour} onChange={e => setFTour(e.target.value)} className="select">
            <option value="all">Todos Torneios</option>
            {allTournCols.map(({ tid, info }) => <option key={tid} value={tid}>{info.short} {info.date}</option>)}
          </select>
          <select value={fCo} onChange={e => setFCo(e.target.value)} className="select">
            <option value="all">🌍 País</option>
            {allCountries.map(c => <option key={c} value={c}>{flag(c)} {c}</option>)}
          </select>
          <button
            className={`p p-filter p-sm${showFilters ? " active" : ""}`}
            onClick={() => setShowFilters(s => !s)}
            style={{ position:"relative" }}>
            Filtros {showFilters ? "▲" : "▼"}
            {activeCount > 0 && (
              <span style={{ position:"absolute", top:-4, right:-4, background:"var(--accent)", color:"#fff", borderRadius:"50%", width:16, height:16, fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {activeCount}
              </span>
            )}
          </button>
          {activeCount > 0 && <button className="p p-filter p-sm" onClick={resetAll} style={{ color:"var(--color-danger)" }}>✕ Limpar</button>}
          <div className="chip" style={{ marginLeft:"auto" }}>{list.length} jogadores</div>
        </div>
        {showFilters && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", padding:"8px 0 4px", borderTop:"1px solid var(--border-light)", marginTop:6 }}>
            <label className="filter-checkbox" style={{ fontSize:11 }}>
              <input type="checkbox" checked={dOnly} onChange={e => setDOnly(e.target.checked)} /> Só com dados
            </label>
          </div>
        )}
      </div>

      {/* Legenda tiers */}
      <div className="legend-row" style={{ marginBottom:8 }}>
        {(Object.keys(TG_TIER) as Array<keyof typeof TG_TIER>).map(k => (
          <span key={k} className="legend-item">
            <span className="legend-dot" style={{ background: TG_TIER[k].bg }} />
            <span style={{ color: TG_TIER[k].c, fontSize:10 }}>{TG_TIER_L[k]}</span>
          </span>
        ))}
      </div>

      {/* Tabela */}
      <div className="card">
        <div className="scroll-x">
          <table className="tourn-form-table">
            <thead>
              <tr className="rivais-group-header">
                <th className="rivais-th-name pointer" onClick={() => doSort("name")}>Jogador{sortIcon("name")}</th>
                <th className="rivais-th pointer ta-center" onClick={() => doSort("nT")} title="Torneios">#T{sortIcon("nT")}</th>
                {allTournCols.map(({ tid, info, weight, url, isFixed, isFuture }) => {
                  const stars = weight >= 1.3 ? "★★★★★" : weight >= 1.1 ? "★★★★" : weight >= 0.9 ? "★★★" : weight >= 0.6 ? "★★" : weight >= 0.4 ? "★" : "½";
                  return (
                    <th key={tid} className="rivais-th pointer ta-center"
                      style={{ minWidth:56, opacity: isFixed ? 1 : 0.85,
                        color: isFuture ? "var(--color-info)" : undefined }}
                      onClick={() => doSort("t:" + tid)}>
                      {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="rivais-link" onClick={e => e.stopPropagation()}>{info.short}</a> : info.short}
                      {sortIcon("t:" + tid)}
                      {!isFuture && <div className="fs-9 fw-500 op-6 mt-1">{stars} {info.date}</div>}
                      {isFuture && <div className="fs-9 fw-500 mt-1" style={{ color:"var(--color-info)" }}>inscrito</div>}
                    </th>
                  );
                })}
                <th className="rivais-th pointer ta-center" style={{ borderLeft:"3px solid var(--text-muted)", minWidth:56 }} onClick={() => doSort("rank")}>Rank{sortIcon("rank")}</th>
                <th className="rivais-th ta-center">Tend.</th>
              </tr>
            </thead>
            <tbody>
              {list.map(p => {
                const isM = p.isM;
                const tr = tgGetTrend(p);
                const fl = flag(p.co);
                const played = tgNPlayed(p);
                return (
                  <tr key={p.n} className={isM ? "rivais-row-ref" : ""}>
                    <td className="rivais-player-name">
                      <span className="rivais-flag" title={p.co}>{fl}</span>
                      <span className={`fs-12${isM ? " fw-700" : " fw-600"}`} style={{ color: isM ? "var(--text)" : "var(--text-2)" }}>{p.n}</span>
                      {isM && <span className="p p-sm p-outline ml-4">REF</span>}
                      {!isM && <KidsLink nome={p.n} />}
                    </td>
                    <td className="ta-center fs-12 fw-600 c-text-3">{played || ""}</td>
                    {allTournCols.map(({ tid, isFixed, isFuture }) => {
                      // Coluna futura: mostrar escalão inscrito se player está inscrito
                      if (isFuture) {
                        const inscribed = inscricaoMap.get(tid);
                        const inscrito = p.isM
                          ? inscribed?.has(normNameAuto("Manuel Medeiros")) ?? false
                          : inscribed?.has(normNameAuto(p.n)) ?? false;
                        return (
                          <td key={tid} className="ta-center"
                            style={{ background: inscrito ? "var(--bg-info-strong,var(--bg-info))" : undefined }}>
                            {inscrito
                              ? <span style={{ fontSize:14 }}>⛳</span>
                              : <span className="fs-10 c-border">—</span>}
                          </td>
                        );
                      }
                      const res = p.r[tid];
                      if (!res || (res.tp == null && res.p !== "WD")) return <td key={tid} />;
                      if (res.p === "WD") return <td key={tid} className="ta-center fs-11 c-muted">WD</td>;

                      // Calcular z-tier: usar TG_AVG_R para fixas, autoAvgR para auto
                      const validRd = res.rd?.filter((x: number) => x > 0) ?? [];
                      const rounds = validRd.length || 1;
                      const playerAvg = validRd.length
                        ? validRd.reduce((a: number, b: number) => a + b, 0) / rounds
                        : (res.t != null ? res.t / rounds : 0);
                      let ti: keyof typeof TG_TIER | null = null;
                      const fixedAvgs = TG_AVG_R[tid];
                      const hasFixedAvg = fixedAvgs?.some((x: any) => x != null);
                      if (hasFixedAvg) {
                        const ms = fixedAvgs.filter((x: any): x is {m:number;s:number} => x != null).map((x: {m:number}) => x.m);
                        const ss = fixedAvgs.filter((x: any): x is {m:number;s:number} => x != null).map((x: {s:number}) => x.s);
                        if (ms.length) ti = tgZTier(playerAvg, { m: ms.reduce((a,b)=>a+b,0)/ms.length, s: ss.reduce((a,b)=>a+b,0)/ss.length });
                      } else {
                        const ar = autoAvgR[tid];
                        if (ar) ti = tgZTier(playerAvg, { m: ar.avg, s: ar.std });
                      }
                      const st = ti ? TG_TIER[ti] : null;
                      const tpStr = res.tp != null ? tgFmtSign(res.tp) : "—";
                      return (
                        <td key={tid} className="ta-center" style={{ background: st?.bg || "transparent", padding:"5px 4px" }}>
                          <div className="fw-700 fs-13" style={{ color: st?.c || "var(--text-3)" }}>{tpStr}</div>
                          {res.p != null && <div className="fs-10 fw-600 c-text-3">#{res.p}</div>}
                        </td>
                      );
                    })}
                    <td className="ta-center" style={{ borderLeft:"3px solid var(--border-light)", padding:"4px 6px" }}>
                      {rankMap[p.n] != null ? (
                        <div>
                          <div className="fw-800 fs-13" style={{ color: rankMap[p.n] <= 10 ? "var(--color-good-dark)" : rankMap[p.n] <= 30 ? "var(--text)" : "var(--text-3)" }}>
                            {rankMap[p.n]}º
                          </div>
                          <div className="fs-10 c-text-3">{tgNPlayed(p)}T · {tgNRounds(p)}R</div>
                        </div>
                      ) : <span className="fs-10 c-border">s/d</span>}
                    </td>
                    <td className="ta-center">
                      {tr ? <span className="fw-700 fs-13" style={{ color: TG_TR_I[tr]?.c }}>{TG_TR_I[tr]?.i}</span> : <span className="c-border">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="section-subtitle ta-c mt-10">
        Clica num cabeçalho para ordenar · Rank por to-par médio · ★★★★★ WJGC/World · ★★★★ European/Venice · ★★★ USKids · ½ peso mínimo · ({totalRanked} jogadores classificados)
      </div>
    </div>
  );
}

function Secao({ titulo, sub, count, corTitulo, defaultOpen, children }: {
  titulo: string; sub?: string; count: number; corTitulo?: string;
  defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  if (!count) return null;
  return (
    <div>
      <button onClick={() => setOpen(v => !v)} style={{
        display:"flex", alignItems:"baseline", gap:8, background:"none", border:"none",
        cursor:"pointer", padding:0, marginBottom: open ? 4 : 0, width:"100%", textAlign:"left",
      }}>
        <span style={{ fontSize:11, fontWeight:700, color: corTitulo ?? "var(--text-3)",
          textTransform:"uppercase", letterSpacing:"0.06em" }}>
          {titulo} ({count})
        </span>
        <span style={{ fontSize:11, color:"var(--text-3)", marginLeft:"auto" }}>{open ? "▲" : "▼"}</span>
      </button>
      {sub && open && (
        <div style={{ fontSize:11, color:"var(--text-3)", marginBottom:8 }}>{sub}</div>
      )}
      {open && children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSOR: formato raw signupanytime → TorneioResult
// Suporta dois formatos:
//   ANTIGO (v1): array [{t, meta:{tournament,age_groups,flight_courses,...}, flights:[...]}]
//   NOVO  (v2): objecto {signupanytime_t, name, start_date, age_groups, flight_courses, flights:{fid:{category,course_info,flight_players}}}
// ─────────────────────────────────────────────────────────────────────────────
function converterTorneioCompleto(raw: any): TorneioResult | null {
  // Detectar formato pela presença de signupanytime_t (novo) vs t+meta (antigo)
  const isNovoFormato = !!raw?.signupanytime_t;

  if (isNovoFormato) {
    // ── NOVO FORMATO (v2) ────────────────────────────────────────────────────
    if (!raw.signupanytime_t || !raw.name) return null;

    const tCode      = Number(raw.signupanytime_t);
    const ageGroups: Record<string, { name: string; holes_per_round: number }> = raw.age_groups ?? {};

    // par por buraco por flight: fid → ronda → par[]
    // Fonte: flight.course_info['R1'].holes[].par  (mais fiável — por escalão)
    const _flightRoundPar = new Map<string, number[]>(); // key: `${fid}_R${rn}`

    // Agrupa flights pelo nome do escalão (category)
    // Usar índice numérico sintético para manter compatibilidade com age_group int
    const catToId = new Map<string, number>();
    let nextId = 1;
    const escalaoMap = new Map<number, {
      age_group: number; nome: string; holes: number;
      roundsMap: Map<number, RondaJogador[]>;
      parPorRonda: Map<number, number[]>;
      metrosPorRonda: Map<number, number[]>;
      campo?: string;
    }>();

    const flightsDict: Record<string, any> = raw.flights ?? {};
    for (const [_fidStr, flight] of Object.entries(flightsDict)) {
      const category: string = flight.category ?? '';
      if (!category) continue;

      // Mapear category → id numérico (lookup nos age_groups pelo nome)
      let agId = catToId.get(category);
      if (agId == null) {
        // Tentar encontrar nos age_groups pelo nome
        const agEntry = Object.entries(ageGroups).find(([, v]) => v.name === category);
        agId = agEntry ? parseInt(agEntry[0]) : nextId++;
        catToId.set(category, agId);
      }

      // holes_per_round: tirar dos age_groups pelo nome
      const agEntry = Object.entries(ageGroups).find(([, v]) => v.name === category);
      const holes = agEntry ? (agEntry[1].holes_per_round ?? 9) : 9;

      if (!escalaoMap.has(agId)) {
        escalaoMap.set(agId, {
          age_group: agId, nome: category,
          holes,
          roundsMap: new Map(),
          parPorRonda: new Map(),
          metrosPorRonda: new Map(),
        });
      }
      const esc = escalaoMap.get(agId)!;

      // Extrair par e metros (de jardas) por ronda do course_info (R1/R2/R3...)
      const courseInfo: Record<string, any> = flight.course_info ?? {};
      for (const [rKey, rInfo] of Object.entries(courseInfo)) {
        const rn = parseInt(rKey.replace(/^R/, ''));
        if (isNaN(rn)) continue;
        const holes_arr: any[] = rInfo.holes ?? [];
        if (!esc.parPorRonda.has(rn)) {
          const par = holes_arr.map((h: any) => h.par as number).filter(p => p > 0);
          if (par.length > 0) esc.parPorRonda.set(rn, par);
        }
        if (!esc.metrosPorRonda.has(rn)) {
          const metros = holes_arr.map((h: any) => Math.round((h.yards ?? 0) * 0.9144)).filter(m => m > 0);
          if (metros.length > 0) esc.metrosPorRonda.set(rn, metros);
        }
        if (!esc.campo && rInfo.courseName) esc.campo = rInfo.courseName;
      }

      // Players estão directamente em flight.flight_players (sem rounds_data)
      const fp: Record<string, any> = flight.flight_players ?? {};
      for (const player of Object.values(fp)) {
        const nome = `${player.first ?? ''} ${player.last ?? ''}`.trim();
        if (!nome) continue;
        const pais   = (player.country ?? '').toUpperCase();
        const cidade = player.place ?? '';
        const tee    = player.teeMarkerName ?? '';

        for (const [rnStr, rdRaw] of Object.entries(player.rounds ?? {})) {
          const rn = parseInt(rnStr);
          if (isNaN(rn)) continue;
          const rd = rdRaw as any;
          if (!esc.roundsMap.has(rn)) esc.roundsMap.set(rn, []);
          esc.roundsMap.get(rn)!.push({
            nome, pais, cidade, tee,
            pontos:     0,
            score:      rd.num_strokes ?? (rd.strokes ?? []).filter((s: number) => s > 0).reduce((a: number, b: number) => a + b, 0),
            buracos:    rd.num_holes   ?? (rd.strokes ?? []).filter((s: number) => s > 0).length,
            start_time: rd.start_time  ?? '',
            grupo:      rd.group_number ?? 0,
            strokes:    rd.strokes ?? [],
            to_par:     null,
          });
        }
      }
    }

    // Campo: primeiro curso listado
    const firstCourse = Object.values(raw.courses ?? {})[0] as any;
    const campo = firstCourse?.name ?? null;

    const escaloes: EscalaoResult[] = [];
    for (const esc of escalaoMap.values()) {
      const rondas: RondaResult[] = [];
      for (const [rn, leaderboard] of esc.roundsMap) {
        const par = esc.parPorRonda.get(rn) ?? [];
        const metros = (esc as any).metrosPorRonda?.get(rn) as number[] | undefined;
        rondas.push({
          ronda: rn,
          par,
          si: [],
          ...(metros?.length ? { metros } : {}),
          buracos: esc.holes,
          total_par: par.length === esc.holes ? par.reduce((a, b) => a + b, 0) : null,
          leaderboard,
        });
      }
      rondas.sort((a, b) => a.ronda - b.ronda);
      escaloes.push({
        age_group: esc.age_group, nome: esc.nome,
        holes: esc.holes, is_manuel: false, rondas,
        ...(esc.campo ? { campo: esc.campo } : {}),
      });
    }

    return {
      t:           tCode,
      name:        raw.name,
      date_inicio: raw.start_date ?? '',
      date_fim:    raw.end_date,
      campo,
      rondas_total: raw.rounds ?? 1,
      escaloes,
      ultima_atualizacao: '',
    };

  } else {
    // ── FORMATO ANTIGO (v1) ──────────────────────────────────────────────────
    if (!raw?.t || !raw?.meta?.tournament?.name) return null;
    const meta   = raw.meta;
    const tourn  = meta.tournament;
    const ageGroups: Record<string, { name: string; holes_per_round: number }> = meta.age_groups ?? {};

    // par por flight_round_id (chave do flight_course)
    const frPars: Record<number, number[]> = {};
    for (const [, fc] of Object.entries(meta.flight_courses ?? {})) {
      const fcAny = fc as any;
      const frid = fcAny.flightRoundId ?? Number(Object.keys(meta.flight_courses ?? {}).find(k => (meta.flight_courses as any)[k] === fc));
      const pars = (fcAny.pars ?? []).filter((p: number) => p > 0);
      if (pars.length > 0) frPars[frid] = pars;
    }

    const escalaoMap = new Map<number, {
      age_group: number; nome: string; holes: number;
      roundsMap: Map<number, RondaJogador[]>;
      parPorRonda: Map<number, number[]>;
    }>();

    for (const flight of (raw.flights ?? [])) {
      const fn   = flight.flight_name;
      const agId = fn?.age_group as number | undefined;
      if (!agId) continue;
      const ag = ageGroups[String(agId)];
      if (!ag) continue;

      if (!escalaoMap.has(agId)) {
        escalaoMap.set(agId, {
          age_group: agId, nome: ag.name,
          holes: ag.holes_per_round ?? 9,
          roundsMap: new Map(),
          parPorRonda: new Map(),
        });
      }
      const esc = escalaoMap.get(agId)!;

      const roundsData: Record<string, any> = flight.rounds_data ?? {};
      const firstKey = Object.keys(roundsData)[0];
      if (!firstKey) continue;
      const fp: Record<string, any> = roundsData[firstKey].flight_players ?? {};

      for (const player of Object.values(fp)) {
        const nome = `${player.first ?? ''} ${player.last ?? ''}`.trim();
        if (!nome) continue;
        const pais   = (player.country ?? '').toUpperCase();
        const cidade = player.place ?? '';
        const tee    = player.teeMarkerName ?? '';

        for (const [rnStr, rdRaw] of Object.entries(player.rounds ?? {})) {
          const rn = parseInt(rnStr);
          if (isNaN(rn)) continue;
          const rd = rdRaw as any;
          // Tentar obter par do flight_round
          if (!esc.parPorRonda.has(rn) && rd.flight_round) {
            const par = frPars[rd.flight_round];
            if (par?.length) esc.parPorRonda.set(rn, par);
          }
          if (!esc.roundsMap.has(rn)) esc.roundsMap.set(rn, []);
          esc.roundsMap.get(rn)!.push({
            nome, pais, cidade, tee,
            pontos:     0,
            score:      rd.num_strokes ?? (rd.strokes ?? []).filter((s: number) => s > 0).reduce((a: number, b: number) => a + b, 0),
            buracos:    rd.num_holes   ?? (rd.strokes ?? []).filter((s: number) => s > 0).length,
            start_time: rd.start_time  ?? '',
            grupo:      rd.group_number ?? 0,
            strokes:    rd.strokes ?? [],
            to_par:     null,
          });
        }
      }
    }

    const escaloes: EscalaoResult[] = [];
    for (const esc of escalaoMap.values()) {
      const rondas: RondaResult[] = [];
      for (const [rn, leaderboard] of esc.roundsMap) {
        const par = esc.parPorRonda.get(rn) ?? [];
        rondas.push({
          ronda: rn,
          par,
          si: [],
          buracos: esc.holes,
          total_par: par.length === esc.holes ? par.reduce((a, b) => a + b, 0) : null,
          leaderboard,
        });
      }
      rondas.sort((a, b) => a.ronda - b.ronda);
      escaloes.push({
        age_group: esc.age_group, nome: esc.nome,
        holes: esc.holes, is_manuel: false, rondas,
      });
    }

    return {
      t:           raw.t,
      name:        tourn.name,
      date_inicio: tourn.start_date  ?? '',
      date_fim:    tourn.end_date,
      campo:       tourn.courses ? String(tourn.courses).split(',')[0].trim() : null,
      rondas_total: tourn.rounds ?? 1,
      escaloes,
      ultima_atualizacao: '',
    };
  }
}

// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
type Tab = "campo" | "resultados" | "rivais";

// Tipo explícito para entradas do mapa allTorneios — elimina os (as any) casts
type TorneioEntry = {
  t: number; name: string; date: string; dateFim?: string;
  temResultados: boolean; temCampo: boolean;
  inscritos?: number; maximo?: number; vagas?: number;
  escalaoManuel?: string; rondas?: number; fee?: number;
  campo?: string; totalInscritos?: number; totalMaximo?: number;
  urlResultados?: string; manuelJogou?: boolean; terminado?: boolean;
  manuelPos?: number | null; manuelScore?: number | null; nPaises?: number;
};

export default function USKidsFieldPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const VALID_TABS: Tab[] = ["campo", "resultados", "rivais"];
  const paramTab = searchParams.get("tab") as Tab | null;

  const [fieldData,   setFieldData]   = useState<FieldData | null>(null);
  const [resultsData, setResultsData] = useState<ResultsData | null>(null);
  const [autoRivals,  setAutoRivals]  = useState<AutoRivalPlayer[]>([]);
  const [erro,        setErro]        = useState<string | null>(null);
  const [tab, setTabState] = useState<Tab>(() => {
    if (paramTab && VALID_TABS.includes(paramTab)) return paramTab;
    return "campo";
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set("tab", t); return n; }, { replace: true });
  };
  const md = useMasterDetail();
  const [filterManuel, setFilterManuel] = useState(true);

  // selectedT sincronizado com URL params (?t=)
  const paramT = searchParams.get("t");
  const [selectedT, setSelectedTState] = useState<number | null>(paramT ? (parseInt(paramT) || null) : null);

  const setSelectedT = (t: number | null) => {
    setSelectedTState(t);
    setSearchParams(prev => { const n = new URLSearchParams(prev); if (t != null) n.set("t", String(t)); else n.delete("t"); return n; }, { replace: true });
  };

  // Declarado ANTES do useEffect que o usa — regra de React: hooks antes de qualquer uso.
  // Marca setAutoRivals como actualização não-urgente para não bloquear o render inicial.
  const [, startRivalsTransition] = useTransition();

  useEffect(() => {
    // Cache diário: só re-faz fetch uma vez por dia (usa HTTP cache nos restantes pedidos da sessão)
    const daily = new Date().toISOString().slice(0, 10); // "2026-04-03"

    fetch(`/data/uskids-field.json?v=${daily}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: FieldData) => {
        setFieldData(d);
        if (d.torneios.length) setSelectedTState(prev => prev !== null ? prev : d.torneios[0].t);
      })
      .catch(e => setErro(e.message));

    // ── Carregar resultados: 15 ficheiros históricos permanentes + ficheiro auto-gerado ──
    // Os históricos têm prioridade; o auto-gerado apenas acrescenta torneios ainda não cobertos.
    const TORNEIOS_COMPLETOS_COUNT = 30;
    const historicosUrls = Array.from({ length: TORNEIOS_COMPLETOS_COUNT }, (_, i) =>
      `/data/uskids_torneios_completos(${i + 1}).json`
    );

    Promise.all([
      // ficheiro auto-gerado — cache diária para não re-buscar em cada refresh
      fetch(`/data/uskids-results.json?v=${daily}`)
        .then(r => r.ok ? r.json() : { gerado_em: "", resultados: [] })
        .catch((): ResultsData => ({ gerado_em: "", resultados: [] })),
      // ficheiros históricos permanentes (usam cachedFetchJson — cached em memória na sessão)
      ...historicosUrls.map(url => cachedFetchJson(url).catch(() => null)),
    ]).then(([autoGerado, ...historicos]) => {
      const auto = autoGerado as ResultsData;

      // 1. Construir lista a partir dos históricos permanentes (têm prioridade)
      // Os ficheiros históricos têm formato raw {t, meta, flights} → converter primeiro
      const historicosResultados: TorneioResult[] = [];
      const tExistentes = new Set<number>();

      for (const raw of historicos) {
        if (!raw) continue;
        // Pode ser array de entradas raw ou objecto único raw
        const lista: any[] = Array.isArray(raw) ? raw : [raw];
        for (const entrada of lista) {
          // Suporte novo formato (signupanytime_t) e antigo (t)
          const tCode: number | undefined = entrada?.signupanytime_t ?? entrada?.t;
          if (!tCode || tExistentes.has(tCode)) continue;
          // Detectar formato: já convertido tem {escaloes}; raw tem {meta,flights} ou {signupanytime_t}
          const tr: TorneioResult | null = entrada.escaloes
            ? entrada as TorneioResult          // já no formato TorneioResult
            : converterTorneioCompleto(entrada); // converter do formato raw (antigo ou novo)
          if (tr) {
            historicosResultados.push(tr);
            tExistentes.add(tr.t);
          }
        }
      }

      // 2. O auto-gerado apenas entra se o t-code ainda não está coberto pelos históricos
      const autoExtras = auto.resultados.filter(r => !tExistentes.has(r.t));

      // 2b. Converter yards → metros nas rondas do auto-gerado (o JSON tem yards, não metros)
      for (const t of autoExtras) {
        for (const esc of t.escaloes ?? []) {
          for (const rd of esc.rondas ?? []) {
            if (!rd.metros?.length && (rd as any).yards?.length) {
              rd.metros = ((rd as any).yards as number[]).map(y => Math.round(y * 0.9144));
            }
          }
        }
      }

      // 3. Injectar overrides para jogadores excluídos pelo scraper (IE/WD)
      const merged = [...historicosResultados, ...autoExtras];
      applyResultOverrides(merged);

      setResultsData({
        gerado_em: auto.gerado_em,
        resultados: merged,
      });
    });

    // Carregar auto-rivals com carregamento progressivo em duas fases:
    // Fase 1 (rápida): dados essenciais → página já funciona
    // Fase 2 (background): member history ficheiro a ficheiro → enriquece progressivamente
    buildAutoRivals(undefined, {
      onUpdate: (rivals) => startRivalsTransition(() => setAutoRivals(rivals)),
    }).catch(() => {});
  }, []);

  const nResultados = resultsData?.resultados?.length ?? 0;

  const torneiosCampo = useMemo(() => fieldData?.torneios ?? [], [fieldData]);
  const torneiosResultados = useMemo(() => resultsData?.resultados ?? [], [resultsData]);

  const [showRivaisTabela, setShowRivaisTabela] = useState(false);

  const allTorneios = useMemo(() => {
    const map = new Map<number, TorneioEntry>();
    for (const t of torneiosCampo) {
      if (!t.t || !t.name) continue;
      if (!isUSKidsTorneio(t.name)) continue; // Filtrar torneios não-USKids
      const em = escalaoManuelParaData(t.date_inicio);
      const esc = t.escaloes?.find((e: any) => e.nome === em);
      const ended = isTerminado(t.date_fim, t.date_inicio);
      // Verificar se Manuel está inscrito na lista de jogadores do escalão
      const manuelInscrito = esc?.jogadores?.some((j: any) => isManuel(j.nome)) ?? false;
      map.set(t.t, { t: t.t, name: t.name, date: t.date_inicio, dateFim: t.date_fim ?? undefined, temResultados: false, temCampo: true,
        inscritos: esc?.inscritos, maximo: esc?.maximo, vagas: esc?.vagas, escalaoManuel: em,
        rondas: t.rondas ?? undefined,
        fee: t.fee_18 ? parseFloat(t.fee_18) : undefined,
        campo: t.campo ?? undefined,
        totalInscritos: t.total_inscritos ?? undefined,
        totalMaximo: t.total_maximo ?? undefined,
        terminado: ended,
        manuelJogou: manuelInscrito,
      });
    }
    for (const t of torneiosResultados) {
      if (!t.t || !t.name) continue;
      if (!isUSKidsTorneio(t.name)) continue;
      const manuelJogou = t.escaloes?.some((e: EscalaoResult) =>
        e.rondas?.some((r: RondaResult) =>
          (r.leaderboard ?? r.jogadores ?? []).some((j: RondaJogador) => isManuel(j.nome))
        )
      ) ?? false;
      // Posição e score do Manuel (última ronda do seu escalão)
      let manuelPos: number | null = null;
      let manuelScore: number | null = null;
      if (manuelJogou) {
        const escalaoM = t.escaloes?.find((e: EscalaoResult) =>
          e.rondas?.some((r: RondaResult) =>
            (r.leaderboard ?? r.jogadores ?? []).some((j: RondaJogador) => isManuel(j.nome))
          )
        );
        const lastRonda = escalaoM?.rondas?.[escalaoM.rondas.length - 1];
        const lb = lastRonda?.leaderboard ?? lastRonda?.jogadores ?? [];
        const sorted = [...lb].sort((a, b) => b.pontos - a.pontos || a.score - b.score);
        const mIdx = sorted.findIndex(j => isManuel(j.nome));
        if (mIdx >= 0) { manuelPos = mIdx + 1; manuelScore = sorted[mIdx].score; }
      }
      const ended = isTerminado(t.date_fim, t.date_inicio);
      const rondasTotal = t.rondas_total ?? (t.escaloes?.[0]?.rondas?.length ?? 1);
      // Total de jogadores: soma dos participantes na última ronda de cada escalão
      const totalJogadores = t.escaloes?.reduce((sum: number, e: EscalaoResult) => {
        const lastR = e.rondas?.[e.rondas.length - 1];
        return sum + ((lastR?.leaderboard ?? lastR?.jogadores ?? []).length);
      }, 0) ?? 0;
      // Países únicos
      const paises = new Set<string>();
      t.escaloes?.forEach((e: EscalaoResult) => {
        const lastR = e.rondas?.[e.rondas.length - 1];
        (lastR?.leaderboard ?? lastR?.jogadores ?? []).forEach((j: RondaJogador) => { if (j.pais) paises.add(j.pais); });
      });
      if (map.has(t.t)) {
        const entry = map.get(t.t)!;
        entry.temResultados = true;
        if (t.url_resultados) entry.urlResultados = t.url_resultados;
        if (manuelJogou) { entry.manuelJogou = true; entry.manuelPos = manuelPos; entry.manuelScore = manuelScore; }
        if (!entry.dateFim && t.date_fim) entry.dateFim = t.date_fim;
        if (ended) entry.terminado = true;
        if (!entry.rondas) entry.rondas = rondasTotal;
        if (!entry.campo && t.campo) entry.campo = t.campo;
        if (totalJogadores > 0) entry.totalInscritos = totalJogadores;
        entry.nPaises = paises.size;
      } else {
        map.set(t.t, {
          t: t.t, name: t.name, date: t.date_inicio, dateFim: t.date_fim ?? undefined,
          temResultados: true, temCampo: false, urlResultados: t.url_resultados, manuelJogou,
          terminado: ended, rondas: rondasTotal,
          campo: t.campo ?? undefined,
          totalInscritos: totalJogadores || undefined,
          manuelPos: manuelJogou ? manuelPos : undefined,
          manuelScore: manuelJogou ? manuelScore : undefined,
          nPaises: paises.size,
        });
      }
    }
    return [...map.values()]
      .filter(t => t.name && t.date)
      .sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)));
  }, [torneiosCampo, torneiosResultados]);

  // Torneios onde o Manuel participou ou está inscrito (para tab Rivais)
  const torneiosComManuel = useMemo((): TorneioComManuel[] => {
    const map = new Map<number, TorneioComManuel>();

    // Helper: confirmação estrita de que é o nosso Manuel (nome + PT + cidade de Madeira quando disponível)
    const isManuelStrict = (j: { nome: string; pais: string; cidade?: string }) => {
      if (!isManuel(j.nome)) return false;
      if (j.pais && j.pais !== "PT") return false;
      // Se cidade está preenchida, tem de ser Madeira/Funchal/Santo da Serra/CGSS
      if (j.cidade) {
        const c = j.cidade.toLowerCase();
        if (!c.includes("madeira") && !c.includes("funchal") && !c.includes("santo") && !c.includes("cgss")) return false;
      }
      return true;
    };

    if (fieldData) {
      for (const t of fieldData.torneios) {
        const esc = t.escaloes.find(e => (e.jogadores ?? []).some(j => isManuelStrict(j)));
        if (esc) map.set(t.t, { t: t.t, name: t.name, date_inicio: t.date_inicio, escalaoManuel: esc.nome, source: "field" });
      }
    }
    if (resultsData) {
      for (const t of resultsData.resultados) {
        if (map.has(t.t)) continue;
        // Só incluir se o Manuel realmente aparece no leaderboard (não apenas is_manuel flag)
        const manEsc = t.escaloes?.find(e =>
          e.rondas?.some(r => (r.leaderboard ?? r.jogadores ?? []).some(j => isManuelStrict({ nome: j.nome, pais: j.pais, cidade: j.cidade })))
        );
        if (manEsc) map.set(t.t, { t: t.t, name: t.name, date_inicio: t.date_inicio, escalaoManuel: manEsc.nome, source: "results" });
      }
    }
    return [...map.values()].sort((a, b) => isoDate(b.date_inicio).localeCompare(isoDate(a.date_inicio)));
  }, [fieldData, resultsData]);

  const nRivais = torneiosComManuel.length || null;

  // useMemo ANTES dos early returns — obrigatório pelas Rules of Hooks
  const arMapCtxValue = useMemo(() => {
    const m = new Map<string, AutoRivalPlayer>();
    for (const r of autoRivals) m.set(normNameAuto(r.n), r);
    return m;
  }, [autoRivals]);

  if (erro) return (
    <div style={{ padding: 32 }}>
      <div className="notice-error">
        <div className="fw-700 c-danger mb-4">Erro ao carregar dados USKids</div>
        <div className="muted fs-11 mono">{erro}</div>
        <button className="btn mt-8" onClick={() => window.location.reload()}>Recarregar</button>
      </div>
    </div>
  );
  if (!fieldData) return <LoadingState message="A carregar dados USKids…" size="lg" icon="🏌️" />;

  // Quando muda de tab, verificar se o torneio seleccionado existe nessa tab
  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    if (newTab !== "rivais") setShowRivaisTabela(false);
    if (newTab === "resultados" && selectedT) {
      const exists = torneiosResultados.some(t => t.t === selectedT);
      if (!exists && torneiosResultados.length) setSelectedT(torneiosResultados[0].t);
    }
  };

  const TABS: { id: Tab; label: string; badge: number | null }[] = [
    { id:"campo",      label:"⛳ Torneios",   badge: fieldData.torneios.length },
    { id:"resultados", label:"🏆 Resultados", badge: nResultados },
    { id:"rivais",     label:"🤝 Rivais",     badge: nRivais },
  ];

  const selectedFieldTorneio = fieldData.torneios.find(t => t.t === selectedT) ?? null;

  // ── Render functions para o sidebar — extraídas dos IIFEs para melhor legibilidade ──

  const renderSidebarRivais = () => {
    const today = new Date().toISOString().slice(0, 10);
    return (
      <>
        {/* ── Tabela global (entrada fixa no topo) ── */}
        <button
          className={`course-item${showRivaisTabela ? " active" : ""}`}
          style={{ padding:"10px 12px", display:"block", width:"100%", textAlign:"left", borderBottom:"2px solid var(--border-light)" }}
          onClick={() => { setShowRivaisTabela(true); setSelectedT(null); }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:15 }}>📊</span>
            <span style={{ fontSize:13, fontWeight:700, color: showRivaisTabela ? "var(--accent)" : "var(--text)" }}>
              Tabela global
            </span>
            <span className="p p-sm p-muted" style={{ fontSize:10, marginLeft:"auto" }}>
              {torneiosComManuel.length} torneios
            </span>
          </div>
          <div style={{ fontSize:11, color:"var(--text-3)", marginTop:2 }}>
            Todos os jogadores × todos os torneios
          </div>
        </button>

        <div className="sidebar-section-title">{torneiosComManuel.length} torneios</div>
        {torneiosComManuel.length === 0 && (
          <div className="muted" style={{ padding:"16px 12px", fontSize:12 }}>Sem torneios com o Manuel</div>
        )}
        {torneiosComManuel.map(t => {
          const active = !showRivaisTabela && t.t === selectedT;
          const isFuture = isoDate(t.date_inicio) > today;
          const resT = resultsData?.resultados.find(r => r.t === t.t);
          const temResultados = !isFuture && !!resT;
          return (
            <button key={t.t}
              className={`course-item${active ? " active" : ""}`}
              style={{ padding:"9px 10px 9px 12px", textAlign:"left", width:"100%", display:"block" }}
              onClick={() => { setShowRivaisTabela(false); setSelectedT(t.t); }}>
              <div style={{ fontSize:13, fontWeight: active ? 700 : 600, color:"var(--text)",
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom:3 }}>
                {t.name.replace(/\s*\d{4}$/, "")} <span style={{ color:"var(--text-3)", fontWeight:400, fontSize:12 }}>'{isoDate(t.date_inicio).slice(2,4)}</span>
              </div>
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center" }}>
                <span style={{ fontSize:11, color:"var(--text-3)" }}>{fmtDate(t.date_inicio)}</span>
                {t.escalaoManuel && (
                  <span className="p p-sm p-muted" style={{ fontSize:10 }}>{t.escalaoManuel}</span>
                )}
                {temResultados && (
                  <span className="p p-sm" style={{ fontSize:10, background:"var(--bg-success-strong)", color:"var(--color-good-dark)", borderColor:"var(--border-success)" }}>
                    resultados
                  </span>
                )}
                {isFuture && (
                  <span className="p p-sm" style={{ fontSize:10, background:"var(--bg-info-strong)", color:"var(--color-info)", borderColor:"var(--border-info)" }}>
                    inscrito
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </>
    );
  };

  const renderSidebarTorneios = () => {
    const manuelFilter = (t: TorneioEntry) => !filterManuel || t.manuelJogou;
    const activeList = tab === "campo"
      ? allTorneios.filter(t => !t.terminado && manuelFilter(t))
      : allTorneios.filter(manuelFilter);

    const buildMonthMap = (list: TorneioEntry[]) => {
      const monthMap: Record<string, TorneioEntry[]> = {};
      const currentYear = new Date().getFullYear().toString();
      for (const t of list) {
        const iso = isoDate(t.date);
        const yr = iso ? iso.substring(0, 4) : "?";
        const mo = iso ? iso.substring(0, 7) : "?";
        const key = (yr === currentYear || yr === "?") ? mo : yr;
        if (!monthMap[key]) monthMap[key] = [];
        monthMap[key].push(t);
      }
      return monthMap;
    };
    const monthMap = buildMonthMap(activeList);

    const today = new Date().toISOString().substring(0, 7);
    const currentYear = new Date().getFullYear().toString();

    const sortKeys = (map: Record<string, TorneioEntry[]>, reverse?: boolean) => {
      const allKeys = Object.keys(map);
      const futureKeys = allKeys.filter(k => k >= today || (k.length === 4 && k > currentYear)).sort();
      const pastKeys   = allKeys.filter(k => k <  today && !(k.length === 4 && k > currentYear)).sort();
      if (reverse) return [...pastKeys, ...futureKeys];
      return [...futureKeys, ...pastKeys];
    };

    const mainKeys = tab === "resultados" ? sortKeys(monthMap, true) : sortKeys(monthMap);

    const renderItem = (t: TorneioEntry, dimmed?: boolean) => {
      const active = t.t === selectedT;
      const temConteudo = tab === "resultados" ? t.temResultados : t.temCampo;
      const reg = torneioRegiao(t.name);
      const isEuro = reg === "EURO";
      const isInvit = !!REGIONAL_CHAMPIONSHIPS[t.t];
      const pct = t.maximo ? Math.min(100, Math.round(((t.inscritos ?? 0) / t.maximo) * 100)) : 0;
      const manuelPos: number | null = t.manuelPos ?? null;
      const manuelScore: number | null = t.manuelScore ?? null;
      const nPaises: number = t.nPaises ?? 0;
      const extraPills = (
        <>
          {reg && (
            <span className="p p-sm p-tourn" style={{
              background: isEuro ? "var(--bg-info)" : "var(--bg-warn-orange)",
              color: isEuro ? "var(--color-info)" : "var(--color-orange-deep)",
              borderColor: isEuro ? "var(--border-info)" : "var(--color-amber)",
            }}>{reg}</span>
          )}
          {isInvit && (
            <span className="p p-sm p-tourn" style={{
              background:"var(--bg-pink)", color:"var(--color-purple)", borderColor:"var(--border-purple)",
            }}>INVIT</span>
          )}
          {t.escalaoManuel && <span className="p p-sm p-muted">{t.escalaoManuel}</span>}
          {nPaises > 1 && <span className="p p-sm p-muted">{nPaises} países</span>}
          {t.manuelJogou && <ManuelPill />}
          {t.manuelJogou && manuelPos != null && (
            <span className="p p-sm p-tourn" style={{
              background: manuelPos === 1 ? "var(--bg-warn-strong)" : manuelPos <= 3 ? "var(--bg-info-strong)" : "var(--bg-muted)",
              color: manuelPos === 1 ? "var(--color-warn-dark)" : manuelPos <= 3 ? "var(--color-navy)" : "var(--text-2)",
              borderColor: "transparent",
            }}>
              {manuelPos === 1 ? "🥇" : manuelPos === 2 ? "🥈" : manuelPos === 3 ? "🥉" : `#${manuelPos}`}
              {manuelScore != null && ` (${manuelScore > 0 ? "+" : ""}${manuelScore === 0 ? "E" : manuelScore})`}
            </span>
          )}
          {t.urlResultados && (
            <a href={t.urlResultados} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="p p-sm p-muted" style={{ textDecoration:"none" }}>
              Resultados ↗
            </a>
          )}
        </>
      );
      const tData: SidebarItemTournament = {
        name: t.name.replace(/\s*\d{4}$/, ""),
        campo: t.campo ? t.campo.split(",")[0] : undefined,
        date: isoDate(t.date) || t.date,
        playerCount: t.totalInscritos ?? t.inscritos,
        rounds: t.rondas,
        players: [],
        series: "tour",
      };
      const uskidsFooter = (!dimmed && t.temCampo) ? (
        <>
          {t.maximo != null && t.maximo > 0 && (
            <div style={{ marginBottom: 4 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3, fontSize:11, color:"var(--text-2)" }}>
                <span style={{ fontWeight:600 }}>{t.escalaoManuel}</span>
                <span>
                  {t.inscritos}/{t.maximo}
                  {(t.vagas ?? 0) > 0
                    ? <span style={{ color:"var(--color-success)", marginLeft:4 }}>{t.vagas} vagas</span>
                    : <span style={{ color:"var(--color-danger)", marginLeft:4 }}>cheio</span>}
                </span>
              </div>
              <div style={{ height:4, borderRadius:2, background:"var(--border)", overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:2, width:`${pct}%`, background:"var(--accent)" }} />
              </div>
            </div>
          )}
          {(t.totalMaximo ?? 0) > 0 && (
            <div style={{ fontSize:11, color:"var(--text-3)", display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <span>Total: {t.totalInscritos}/{t.totalMaximo}</span>
              {t.fee && <span>${t.fee.toFixed(0)}</span>}
            </div>
          )}
        </>
      ) : null;
      return (
        <div key={t.t} style={{ opacity: dimmed ? 0.55 : (temConteudo ? 1 : 0.45) }}>
          <TournSidebarItem
            t={tData}
            isActive={active}
            onClick={() => { setSelectedT(t.t); md.onSelect(); }}
            accentColor={t.manuelJogou ? SIDEBAR_ACCENT.pja : SIDEBAR_ACCENT.tour}
            extraPills={extraPills}
            footer={uskidsFooter}
          />
        </div>
      );
    };

    const renderGroup = (gmap: Record<string, TorneioEntry[]>, keys: string[], dimmed?: boolean) =>
      keys.map(key => (
        <div key={key}>
          <div className="sidebar-section-title-dark">{monthLabel(key)}</div>
          {gmap[key].map(t => renderItem(t, dimmed))}
        </div>
      ));

    return <>{renderGroup(monthMap, mainKeys)}</>;
  };

  return (
    <ArMapCtx.Provider value={arMapCtxValue}>
    <div className="tourn-layout" style={{ height:"calc(100vh - 52px)" }}>

      {/* ── TOOLBAR ── */}
      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 10px", overflowX:"auto", flexWrap:"nowrap", borderBottom:"1px solid var(--border-light)", scrollbarWidth:"none" }}>
        <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />
        <span className="toolbar-title" style={{ flexShrink:0 }}>🏌️ USKids</span>
        <div className="toolbar-sep" style={{ flexShrink:0 }} />
        {TABS.map(tb => (
          <button key={tb.id}
            onClick={() => handleTabChange(tb.id)}
            className={`tourn-tab tourn-tab-sm${tab === tb.id ? " active" : ""}`}
            style={tab === tb.id ? { flexShrink:0 } : { flexShrink:0, background:"var(--bg-muted)", color:"var(--text-2)", borderColor:"var(--border)" }}>
            {tb.label}
            {tb.badge > 0 && (
              <span style={{ marginLeft:4, fontSize:10, fontWeight:700, padding:"0 5px", borderRadius:8,
                background: tab === tb.id ? "rgba(255,255,255,0.25)" : "var(--bg-hover)",
                color: tab === tb.id ? "#fff" : "var(--text-3)",
              }}>{tb.badge}</span>
            )}
          </button>
        ))}
        {tab !== "rivais" && (<>
          <div className="toolbar-sep" style={{ flexShrink:0 }} />
          <button
            className={"tourn-tab tourn-tab-sm" + (filterManuel ? " active" : "")}
            onClick={() => setFilterManuel(v => !v)}
            style={filterManuel
              ? { flexShrink:0, background:"var(--bg-success-subtle)", borderColor:"var(--color-good)", color:"var(--color-good-dark)" }
              : { flexShrink:0, background:"var(--bg-muted)", color:"var(--text-2)", borderColor:"var(--border)" }}>
            ★ Manuel
          </button>
        </>)}
        <div style={{ flex:1, minWidth:8 }} />
        <a href="https://uskids-golf.vercel.app/" target="_blank" rel="noopener noreferrer"
          style={{ fontSize:11, fontWeight:600, flexShrink:0, color:"var(--accent)", border:"1px solid var(--accent)", borderRadius:5, padding:"3px 8px", textDecoration:"none", whiteSpace:"nowrap", display:"inline-flex", alignItems:"center", gap:3 }}>
          Histórico ↗
        </a>
        <span className="chip" style={{ flexShrink:0 }}>{allTorneios.length} torn.</span>
      </div>

      {/* ── MASTER-DETAIL ── */}
      <div className="master-detail">

        {/* ── SIDEBAR ── */}
        <div className={`sidebar${md.open ? "" : " sidebar-closed"}`}>

        {/* Lista de torneios agrupada por mês — OU lista de rivais */}
        <div style={{ overflowY:"auto", flex:1 }}>
          {tab === "rivais" ? renderSidebarRivais() : renderSidebarTorneios()}
        </div>

        <div className="muted fs-10" style={{ padding:"8px 12px", borderTop:"1px solid var(--border-light)" }}>
          signupanytime.com · actualização diária
        </div>
      </div>

      {/* ── CONTEÚDO ── */}
      <div style={{ flex:1, overflow:"auto", padding:"16px 20px" }}>

        {tab === "campo" && (
          selectedFieldTorneio
            ? <TabCampoDetalhe torneio={selectedFieldTorneio} />
            : <EmptyState message="Selecciona um torneio na barra lateral" icon="⛳" />
        )}

        {tab === "resultados" && resultsData && (
          <TabResultados greatgolfData={null}
            data={resultsData}
            selectedT={selectedT}
          />
        )}
        {tab === "resultados" && !resultsData && (
          <LoadingState message="A carregar resultados…" size="md" icon="🏆" />
        )}

        {tab === "rivais" && !resultsData && (
          <LoadingState message="A carregar rivais…" size="md" icon="🤝" />
        )}
        {tab === "rivais" && resultsData && (
          <SectionErrorBoundary label="TabRivais">
            <TabRivais
              resultados={resultsData.resultados}
              fieldData={fieldData}
              torneiosComManuel={torneiosComManuel}
              selectedT={selectedT}
              setSelectedT={setSelectedT}
              autoRivals={autoRivals}
              showTabela={showRivaisTabela}
              setShowTabela={setShowRivaisTabela}
              futureTorneios={torneiosComManuel.filter(t => isoDate(t.date_inicio) > new Date().toISOString().slice(0, 10))}
            />
          </SectionErrorBoundary>
        )}

      </div>
      {/* ← fecha master-detail */}
      </div>
    {/* ← fecha tourn-layout */}
    </div>
    </ArMapCtx.Provider>
  );
}
