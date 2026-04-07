// @refresh reset
import { useEffect, useState, useMemo, useCallback, useTransition } from "react";
import SidebarToggle from "../ui/SidebarToggle";
import { useMasterDetail } from "../hooks/useMasterDetail";
import React from "react";
import SectionErrorBoundary from "../ui/SectionErrorBoundary";
import LoadingState from "../ui/LoadingState";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { C } from "../utils/colors";
import { scClass } from "../utils/scoreDisplay";
import { MONTHS_PT, isoDate, fmtDate, fmtToPar } from "../utils/format";
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
interface IntlTorneio { id: string; name: string; short: string; date: string; rounds: number; par: number; url: string; circuito?: string; }
interface IntlJogador { n: string; co: string; isM?: boolean; r: Record<string, { p: number; t: number; tp: number; rd: number[] }>; up: string[]; }
interface IntlData {
  torneios: IntlTorneio[];
  proximos: { id: string; name: string }[];
  jogadores: IntlJogador[];
  aliases?: { canonical: string; also: string[] }[];
  nao_confundir?: { nomes: string[] }[];
}

// ── Member History (uskids-member-history.json) ──
interface MemberHistRound { gross: number; strokes: number[]; }
interface MemberHistTorneio { ageGroup: string; place: number | null; rounds: Record<string, MemberHistRound>; }
interface MemberHistSharedTorneio { name: string; startDate: string; holesPerRound: number; par: number[] | null; yards: number[] | null; }
interface MemberHistPlayer { name: string; country: string; ageGroup: string; torneios: Record<string, MemberHistTorneio>; }
interface MemberHistData {
  gerado_em: string;
  torneios: Record<string, MemberHistSharedTorneio>;
  jogadores: Record<string, MemberHistPlayer>;
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

function apelidos(nome: string): string[] {
  const ignorar = new Set(['de','da','do','dos','das','van','von','le','la','el','al','del','and','jr','ii','iii']);
  const partes = normNameAuto(nome).split(' ');
  return partes.slice(1).filter(p => !ignorar.has(p) && p.length > 2);
}

function scoreMatch(n1: string, n2: string): number {
  const p1 = normNameAuto(n1).split(' ').filter(Boolean);
  const p2 = normNameAuto(n2).split(' ').filter(Boolean);
  const ap1 = new Set(apelidos(n1));
  const ap2 = new Set(apelidos(n2));
  if (!ap1.size || !ap2.size) return 0;
  const comuns = [...ap1].filter(p => ap2.has(p));
  if (!comuns.length) return 0;
  // Exige pelo menos 1 apelido com >5 letras
  if (!comuns.some(c => c.length > 5) && comuns.length < 2) return 0;
  // Se os apelidos são iguais mas os primeiros nomes são completamente
  // diferentes, reduzir drasticamente (previne siblings: Nikita vs Dmitrii)
  const f1 = p1[0] || "";
  const f2 = p2[0] || "";
  if (f1 && f2 && f1 !== f2) {
    // Primeiro nome diferente: só aceitar se partilham ≥3 chars iniciais
    const prefixLen = Math.min(f1.length, f2.length, 3);
    if (f1.slice(0, prefixLen) !== f2.slice(0, prefixLen)) {
      // Nomes completamente diferentes — penalizar pesado
      const base = comuns.length / Math.min(ap1.size, ap2.size);
      return Math.min(0.5, base * 0.4); // abaixo do threshold de 0.7
    }
  }
  const base = comuns.length / Math.min(ap1.size, ap2.size);
  const bonus = comuns.filter(c => c.length > 7).length * 0.15;
  return Math.min(1.0, base + bonus);
}

function criarMatcherIntl(intlData: IntlData | null) {
  if (!intlData) return (_: string, _p?: string) => null;

  // Mapa canonical → jogador
  const byNorm = new Map<string, IntlJogador>();
  for (const j of intlData.jogadores) {
    byNorm.set(normNameAuto(j.n), j);
  }

  // Aliases: also → canonical
  const aliasMap = new Map<string, string>();
  for (const a of (intlData.aliases ?? [])) {
    for (const also of a.also) {
      aliasMap.set(normNameAuto(also), a.canonical);
    }
  }

  // Pares a não confundir
  const naoConfundir = new Set<string>();
  for (const grupo of (intlData.nao_confundir ?? [])) {
    for (let i = 0; i < grupo.nomes.length; i++) {
      for (let j = i + 1; j < grupo.nomes.length; j++) {
        const chave = [normNameAuto(grupo.nomes[i]), normNameAuto(grupo.nomes[j])].sort().join('|');
        naoConfundir.add(chave);
      }
    }
  }

  // Índice por "primeiro último" normalizado
  const byFirstLast = new Map<string, IntlJogador | null>();
  for (const j of intlData.jogadores) {
    const parts = normNameAuto(j.n).split(' ').filter(Boolean);
    if (parts.length >= 2) {
      const key = `${parts[0]} ${parts[parts.length - 1]}`;
      if (!byFirstLast.has(key)) byFirstLast.set(key, j);
      else byFirstLast.set(key, null); // colisão
    }
  }

  // Índice por "país:último_apelido" normalizado
  const byCountryLast = new Map<string, IntlJogador | null>();
  for (const j of intlData.jogadores) {
    const parts = normNameAuto(j.n).split(' ').filter(Boolean);
    if (parts.length >= 1 && j.co) {
      const key = `${normCountry(j.co)}:${parts[parts.length - 1]}`;
      if (!byCountryLast.has(key)) byCountryLast.set(key, j);
      else byCountryLast.set(key, null);
    }
  }

  const bjgtNomes = intlData.jogadores.filter(j => !j.isM).map(j => j.n);

  return (nomeUskids: string, paisUskids?: string): IntlJogador | null => {
    const nNorm = normNameAuto(nomeUskids);

    // 1. Alias directo
    const canonical = aliasMap.get(nNorm);
    if (canonical) {
      const jog = byNorm.get(normNameAuto(canonical));
      if (jog) return jog;
    }

    // 2. Match exacto normalizado
    const exact = byNorm.get(nNorm);
    if (exact) return exact;

    // 3. First+Last token match
    const partsInsc = nNorm.split(' ').filter(Boolean);
    if (partsInsc.length >= 2) {
      const flKey = `${partsInsc[0]} ${partsInsc[partsInsc.length - 1]}`;
      const fl = byFirstLast.get(flKey);
      if (fl) return fl;
    }

    // 4. País + último apelido (com verificação de primeiro nome)
    if (paisUskids && partsInsc.length >= 1) {
      const clKey = `${normCountry(paisUskids || "")}:${partsInsc[partsInsc.length - 1]}`;
      const cl = byCountryLast.get(clKey);
      if (cl) {
        // Verificar que primeiro nome é compatível (previne irmãos: Nikita ≠ Dmitrii)
        const clFirst = normNameAuto(cl.n).split(' ')[0] || "";
        const inFirst = partsInsc[0] || "";
        const prefix = Math.min(clFirst.length, inFirst.length, 3);
        if (prefix === 0 || clFirst.slice(0, prefix) === inFirst.slice(0, prefix)) return cl;
      }
    }

    // 5. Fuzzy por apelidos
    let melhorScore = 0;
    let melhorNome: string | null = null;
    for (const nb of bjgtNomes) {
      const s = scoreMatch(nomeUskids, nb);
      if (s > melhorScore) { melhorScore = s; melhorNome = nb; }
    }

    if (melhorScore >= 0.7 && melhorNome) {
      // Verificar não-confundir
      const chave = [nNorm, normNameAuto(melhorNome)].sort().join('|');
      if (naoConfundir.has(chave)) return null;
      return byNorm.get(normNameAuto(melhorNome)) ?? null;
    }

    return null;
  };
}
// ─────────────────────────────────────────────────────────────────
/** Cria um lookup fuzzy sobre a lista de rivais USKids.
 *  Exact match primeiro; depois first+last token; depois país+último apelido; depois fuzzy (scoreMatch >= 0.7).
 */
function criarMatcherRivals(rivals: { nome: string; pais: string; cidade: string; encontros: any[] }[]) {
  const byNorm = new Map<string, typeof rivals[0]>();
  for (const r of rivals) byNorm.set(normNameAuto(r.nome), r);

  // Índice por "primeiro último" normalizado — apanha diferenças em middle names
  const byFirstLast = new Map<string, typeof rivals[0] | null>();
  for (const r of rivals) {
    const parts = normNameAuto(r.nome).split(' ').filter(Boolean);
    if (parts.length >= 2) {
      const key = `${parts[0]} ${parts[parts.length - 1]}`;
      if (!byFirstLast.has(key)) byFirstLast.set(key, r);
      else byFirstLast.set(key, null); // colisão → marca como inválido
    }
  }

  // Índice por "país_normalizado:último_apelido" — forte para juniores
  const byCountryLast = new Map<string, typeof rivals[0] | null>();
  for (const r of rivals) {
    const parts = normNameAuto(r.nome).split(' ').filter(Boolean);
    if (parts.length >= 1 && r.pais) {
      const last = parts[parts.length - 1];
      const key = `${normCountry(r.pais)}:${last}`;
      if (!byCountryLast.has(key)) byCountryLast.set(key, r);
      else byCountryLast.set(key, null); // colisão → ignorar
    }
  }

  return (nomeInscrito: string, paisInscrito?: string): typeof rivals[0] | null => {
    const nNorm = normNameAuto(nomeInscrito);
    // 1. Exact match normalizado
    const exact = byNorm.get(nNorm);
    if (exact) return exact;
    // 2. First+Last token match (apanha "João Silva" vs "João Pedro Silva")
    const partsInsc = nNorm.split(' ').filter(Boolean);
    if (partsInsc.length >= 2) {
      const flKey = `${partsInsc[0]} ${partsInsc[partsInsc.length - 1]}`;
      const fl = byFirstLast.get(flKey);
      if (fl) return fl;
    }
    // 3. País + último apelido (com verificação de primeiro nome)
    if (paisInscrito && partsInsc.length >= 1) {
      const lastInsc = partsInsc[partsInsc.length - 1];
      const clKey = `${normCountry(paisInscrito || "")}:${lastInsc}`;
      const cl = byCountryLast.get(clKey);
      if (cl) {
        // Verificar primeiro nome (previne irmãos)
        const clFirst = normNameAuto(cl.nome).split(' ')[0] || "";
        const inFirst = partsInsc[0] || "";
        const prefix = Math.min(clFirst.length, inFirst.length, 3);
        if (prefix === 0 || clFirst.slice(0, prefix) === inFirst.slice(0, prefix)) return cl;
      }
    }
    // 4. Fuzzy por apelidos
    let melhorScore = 0;
    let melhorRival: typeof rivals[0] | null = null;
    for (const r of rivals) {
      const s = scoreMatch(nomeInscrito, r.nome);
      if (s > melhorScore) { melhorScore = s; melhorRival = r; }
    }
    return melhorScore >= 0.7 ? melhorRival : null;
  };
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
function EscalaoSection({ escalao: e, torneio: t }: {
  escalao: EscalaoResult;
  torneio: TorneioResult;
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
      {isScorecardTab
        ? <AllRoundsScorecardLB tournament={tournament} escLookup={new Map()} playersDB={{}} />
        : isAccTab
          ? <AccumulatedLB tournament={curT} nRounds={rondasComDados.length} escLookup={new Map()} playersDB={{}} />
          : <ScorecardLB tournament={curT} escLookup={new Map()} playersDB={{}} siLabel="m" parLabelColSpan={6} />
      }

    </div>
  );
}

function EscalaoTabs({ escaloes, torneio: t, defaultIdx }: {
  escaloes: EscalaoResult[];
  torneio: TorneioResult;
  defaultIdx: number;
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
      {e && <EscalaoSection key={e.age_group} escalao={e} torneio={t} />}
    </div>
  );
}


// ─────────────────────────────────────────────
// TAB CAMPO
// ─────────────────────────────────────────────
function TabCampoDetalhe({ torneio: t }: { torneio: Torneio }) {
  const escalaoM = escalaoManuelParaData(t.date_inicio);
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
                            <span>{isM ? "★ " : ""}{displayName(j.nome)}</span>
                            <span title={j.cidade}>{flag(j.pais)}</span>
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
                      <span style={{ fontWeight:600 }}>{displayName(j.nome)}</span>
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
        return <EscalaoTabs escaloes={escaloes} torneio={t} defaultIdx={manuelIdx >= 0 ? manuelIdx : 0} />;
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

interface Encontro {
  torneio_t: number;
  torneio_nome: string;
  torneio_data: string;
  escalao: string;
  man_score: number;
  rival_score: number;
  man_to_par: number | null;
  rival_to_par: number | null;
  man_pos: number;
  rival_pos: number;
  adjacente?: boolean;  // true = jogador de escalão vizinho (±1), não jogou directamente com o Manuel
}

interface RivalInfo {
  nome: string; pais: string; cidade: string;
  encontros: Encontro[];
}

// Normaliza nome de torneio para comparação cross-year (remove ano final)
function torneioBaseName(name: string): string {
  return name.replace(/\s+\d{4}$/, "").replace(/[^\w\s]/g, "").toLowerCase().trim();
}

function TabelaConhecidos({
  torneioT, torneioNome, torneioData, escalaoManuel,
  rivals, fieldData, intlData, matchIntl, matchRival, resultados, defaultOpen, mhCountMap, autoRivals,
}: {
  torneioT: number; torneioNome: string; torneioData?: string; escalaoManuel?: string;
  rivals: RivalInfo[]; fieldData: FieldData | null; intlData: IntlData | null;
  matchIntl: (nome: string, pais?: string) => IntlJogador | null;
  matchRival: (nome: string, pais?: string) => RivalInfo | null;
  resultados: TorneioResult[];
  defaultOpen?: boolean;
  mhCountMap: Map<string, number>;
  autoRivals: AutoRivalPlayer[];
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const torneio = fieldData?.torneios.find(t => t.t === torneioT);

  // Guardar o escalão de referência apenas para o header (contagem)
  const _escalao = torneio?.escaloes.find(e =>
    escalaoManuel ? e.nome === escalaoManuel : (e.jogadores?.length ?? 0) > 0
  );
  // Agregar inscritos de TODOS os escalões — um rival pode estar num escalão
  // diferente do Manuel (ex: rival ainda em Boys 11 quando Manuel sobe para Boys 12)
  const inscritos: { nome: string; pais: string; escalao: string }[] = useMemo(() => {
    // 1. Tentar fieldData (torneios activos/futuros com lista de inscritos)
    if (torneio) {
      const fromField = torneio.escaloes.flatMap(e =>
        (e.jogadores?.length ?? 0) > 0
          ? (e.jogadores ?? []).map(j => ({ ...j, escalao: e.nome }))
          : []
      );
      if (fromField.length > 0) return fromField;
    }
    // 2. Fallback: extrair jogadores do resultsData (torneios passados com leaderboard)
    const resT = resultados.find(r => r.t === torneioT);
    if (!resT) return [];
    const seen = new Set<string>();
    const fromResults: { nome: string; pais: string; escalao: string }[] = [];
    for (const esc of resT.escaloes ?? []) {
      for (const rd of esc.rondas ?? []) {
        for (const j of (rd.leaderboard ?? rd.jogadores ?? [])) {
          const key = j.nome.toLowerCase().trim();
          if (seen.has(key)) continue;
          seen.add(key);
          fromResults.push({ nome: j.nome, pais: j.pais || "", escalao: esc.nome });
        }
      }
    }
    return fromResults;
  }, [torneio, resultados, torneioT]);

  const manuelIntl = intlData?.jogadores.find(jj => jj.isM);
  const manuelIntlTids = manuelIntl ? new Set(Object.keys(manuelIntl.r)) : new Set<string>();

  // inscritoRivalCache: LAZY — só computa quando o card está aberto
  const inscritoRivalCache = useMemo(() => {
    if (!open) return new Map<string, RivalInfo | null>();
    return new Map<string, RivalInfo | null>(
    inscritos.map(j => {
      // 1. Match via rivals list (já tem autoRivals correctos)
      const rivalMatch = matchRival(j.nome, j.pais);
      if (rivalMatch) return [j.nome, rivalMatch];

      // 2. Fallback: matchIntl → obter o nome canónico → procurar nos rivals
      const intlJog = matchIntl(j.nome, j.pais);
      if (intlJog && !intlJog.isM) {
        // Tentar encontrar nos rivals pelo nome intl (que pode ser diferente do nome inscrito)
        const rivalByIntlName = matchRival(intlJog.n, intlJog.co);
        if (rivalByIntlName) return [j.nome, rivalByIntlName];

        // Último recurso: lookup directo no mapa de rivals por nome normalizado
        const intlKey = intlJog.n.toLowerCase().trim();
        const rivalDirect = rivals.find(r => r.nome.toLowerCase().trim() === intlKey);
        if (rivalDirect) return [j.nome, rivalDirect];

        // Se partilha torneios com o Manuel mas não está nos rivals,
        // criar RivalInfo vazio — allRows adicionará encontros do intlData
        const sharedTids = Object.keys(intlJog.r).filter(tid => manuelIntlTids.has(tid));
        if (sharedTids.length > 0) {
          return [j.nome, { nome: intlJog.n, pais: intlJog.co ?? j.pais, cidade: "", encontros: [] }];
        }
      }

      return [j.nome, null];
    })
    );
  }, [open, inscritos, matchRival, matchIntl, intlData, manuelIntl, manuelIntlTids, rivals]);

  // ── Jogaram este torneio no ano passado (escalão abaixo) — LAZY ──
  const anoPassadoMap = useMemo(() => {
    if (!open) return new Map<string, { pos: number; escalao: string; ronda: number }>();
    const base = torneioBaseName(torneioNome);
    const isoYear = (d: string) => {
      if (!d) return 0;
      if (d.includes("-")) return parseInt(d.substring(0, 4));
      const parts = d.split("/"); return parseInt(parts[2] ?? "0");
    };
    const anoAtual = isoYear(torneioData ?? "");
    const tornAnterior = resultados.find(r =>
      torneioBaseName(r.name) === base && isoYear(r.date_inicio) === anoAtual - 1
    );
    const map = new Map<string, { pos: number; escalao: string; ronda: number }>();
    if (!tornAnterior) return map;
    for (const insc of inscritos) {
      const escalaoActual = torneio?.escaloes.find(e =>
        (e.jogadores ?? []).some(j => j.nome.toLowerCase().trim() === insc.nome.toLowerCase().trim())
      );
      const ageGrpActual = escalaoActual?.age_group ?? 0;
      const ageGrpAnterior = ageGrpActual > 0 ? ageGrpActual - 1 : 0;
      const escalaoAnt = tornAnterior.escaloes.find(e => e.age_group === ageGrpAnterior);
      if (!escalaoAnt) continue;

      const rondasAnt = escalaoAnt.rondas.filter(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);
      if (!rondasAnt.length) continue;

      // Calcular posição final: acumular totais de todas as rondas e ordenar
      if (rondasAnt.length >= 2) {
        // Multi-ronda: somar scores de todas as rondas e calcular posição final
        const totaisMap = new Map<string, number>();
        for (const r of rondasAnt) {
          const lb = r.leaderboard ?? r.jogadores ?? [];
          for (const j of lb) {
            const k = j.nome.toLowerCase().trim();
            totaisMap.set(k, (totaisMap.get(k) ?? 0) + (j.score || 0));
          }
        }
        const sorted = [...totaisMap.entries()].sort((a, b) => a[1] - b[1]);
        const idx = sorted.findIndex(([k]) => k === insc.nome.toLowerCase().trim());
        if (idx >= 0) {
          map.set(insc.nome.toLowerCase().trim(), {
            pos: idx + 1,
            escalao: escalaoAnt.nome,
            ronda: rondasAnt.length,
          });
        }
      } else {
        // Ronda única: usar posição directamente do leaderboard
        const lb = rondasAnt[0].leaderboard ?? rondasAnt[0].jogadores ?? [];
        const idx = lb.findIndex(j => j.nome.toLowerCase().trim() === insc.nome.toLowerCase().trim());
        if (idx >= 0)
          map.set(insc.nome.toLowerCase().trim(), { pos: idx + 1, escalao: escalaoAnt.nome, ronda: 1 });
      }
    }
    return map;
  }, [open, torneioNome, torneioData, resultados, inscritos, torneio]);
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ marginBottom:10, border:"1px solid var(--border-light)", borderRadius:10, overflow:"hidden" }}>
      {/* Header do torneio — clicável para collapse */}
      <div onClick={() => setOpen(v => !v)} style={{
        padding:"12px 16px", background:"var(--bg-header)",
        borderBottom: open ? "1px solid var(--border)" : "none",
        cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between",
        gap:12,
      }}>
        <div style={{ minWidth:0, flex:1 }}>
          <div className="h-md" style={{ marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {torneioNome}
          </div>
          <div className="detail-sub" style={{ marginTop:0 }}>
            {torneioData && <span className="muted">📅 {fmtDate(torneioData)}</span>}
            {escalaoManuel && <span className="chip">🏌️ {escalaoManuel}</span>}
            {torneio && (
              <span className="muted">
                {inscritos.filter(jj => !isManuel(jj.nome)).length} inscritos
                {anoPassadoMap.size > 0 && <strong style={{ color:"var(--text-2)", marginLeft:6 }}>· ↩ {anoPassadoMap.size} repetem</strong>}
              </span>
            )}
            {!torneio && inscritos.length > 0 && (
              <span className="muted">{inscritos.filter(jj => !isManuel(jj.nome)).length} jogadores</span>
            )}
          </div>
        </div>
        <span style={{ color:"var(--text-3)", fontSize:13, flexShrink:0 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && <div style={{ padding:"12px 16px" }}>
        {/* ── Todos os inscritos (conhecidos + novos) ── */}
        <InscritosTable
          inscritos={inscritos}
          inscritoRivalCache={inscritoRivalCache}
          matchIntl={matchIntl}
          intlData={intlData}
          manuelIntl={manuelIntl}
          anoPassadoMap={anoPassadoMap}
          escalaoManuel={escalaoManuel}
          mhCountMap={mhCountMap}
          autoRivals={autoRivals}
        />
      </div>}
    </div>
  );
}

/* ── Tabela unificada de inscritos com filtros e ordenação ── */
type InscSortCol = "nome" | "pais" | "escalao" | "antEsc" | "antPos" | "encontros" | "hist";
type InscSortDir = "asc" | "desc";
// Filtros fixos + dinâmicos por escalão (prefixo "esc:" para escalões)
type InscFilter = string;

function InscritosTable({
  inscritos, inscritoRivalCache, matchIntl,
  intlData, manuelIntl, anoPassadoMap, escalaoManuel, mhCountMap, autoRivals,
}: {
  inscritos: { nome: string; pais: string; escalao: string }[];
  inscritoRivalCache: Map<string, RivalInfo | null>;
  matchIntl: (nome: string, pais?: string) => IntlJogador | null;
  intlData: IntlData | null;
  manuelIntl: IntlJogador | undefined;
  anoPassadoMap: Map<string, { pos: number; escalao: string; ronda: number }>;
  escalaoManuel?: string;
  mhCountMap: Map<string, number>;
  autoRivals: AutoRivalPlayer[];
}) {
  const [filtro, setFiltro] = useState<InscFilter>("todos");
  const [sortCol, setSortCol] = useState<InscSortCol>("encontros");
  const [sortDir, setSortDir] = useState<InscSortDir>("desc");

  // Mapa nome normalizado → nome canónico no KIDSPage
  const kidsRivalMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of autoRivals) m.set(normNameAuto(r.n), r.n);
    return m;
  }, [autoRivals]);

  const toggleSort = (col: InscSortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(col === "nome" || col === "pais" || col === "escalao" || col === "antEsc" ? "asc" : "desc"); }
  };

  const hasAnt = anoPassadoMap.size > 0;

  // Build enriched rows
  type Row = {
    nome: string; pais: string; escalao: string;
    isKnown: boolean;
    ant: { pos: number; escalao: string } | undefined;
    isManuelEsc: boolean; nEncontros: number;
    allEncontros: Encontro[];   // merged: rival.encontros + intlData
    foiTop3: boolean;
    mhTorneios: number;
  };

  const allRows = useMemo<Row[]>(() => {
    const manuelIntlTids = manuelIntl ? Object.keys(manuelIntl.r) : [];
    const todos = inscritos.filter(j => !isManuel(j.nome));

    // Member history name lookup
    // mhCountMap pré-calculado no pai

    return todos.map(j => {
      const rival = inscritoRivalCache.get(j.nome) ?? null;

      // ── 1. Encontros do rival (USKids + já merged intl/autoRivals) ──
      const rivalEncs: Encontro[] = rival ? [...rival.encontros] : [];

      // ── 2. Encontros do intlData para torneios NOVOS (que não existem nos rivals) ──
      // intlData pode ter posições stale; só adiciona torneios não cobertos.
      const intlJog = matchIntl(j.nome, j.pais);
      if (intlJog && !intlJog.isM && manuelIntl) {
        const existCanons = new Set(rivalEncs.map(e => tornCanon(e.torneio_nome)));
        for (const tid of manuelIntlTids) {
          const rivalRes = intlJog.r[tid];
          if (!rivalRes) continue;
          const torn = intlData?.torneios.find(t => t.id === tid);
          if (!torn) continue;
          // Skip se este torneio já existe por tornCanon
          if (hasCanon(existCanons, torn.name, torn.short)) continue;
          const manRes = manuelIntl.r[tid];
          rivalEncs.push({
            torneio_t: 0, torneio_nome: torn.name, torneio_data: torn.date || "",
            escalao: torn.short || torn.name,
            man_score: 0, rival_score: 0,
            man_to_par: manRes?.tp ?? null, rival_to_par: rivalRes.tp ?? null,
            man_pos: manRes?.p ?? 0, rival_pos: rivalRes.p ?? 0,
            adjacente: false,
          });
        }
      }

      // Dedup by tornCanon + escalão (keep first = autoRivals/USKids, correct data)
      const allEncontros = [...new Map(
        rivalEncs.map(e => [`${tornCanon(e.torneio_nome)}-${e.escalao}`, e])
      ).values()];

      const isKnown = allEncontros.length > 0;
      const ant = anoPassadoMap.get(j.nome.toLowerCase().trim());
      const foiTop3 = allEncontros.some(e => e.rival_pos > 0 && e.rival_pos <= 3)
                    || (ant != null && ant.pos <= 3);
      const isManuelEsc = j.escalao === escalaoManuel;
      const nEncontros = allEncontros.length;
      const mhTorneios = mhCountMap.get(j.nome.toLowerCase().trim()) ?? 0;
      return { nome: j.nome, pais: j.pais, escalao: j.escalao, isKnown, ant, isManuelEsc, nEncontros, allEncontros, foiTop3, mhTorneios };
    });
  }, [inscritos, inscritoRivalCache, matchIntl, intlData, manuelIntl, anoPassadoMap, escalaoManuel, mhCountMap]);

  // Filter
  const filtered = useMemo(() => {
    let rows = allRows;
    if (filtro === "mesmo_esc") rows = rows.filter(r => r.isManuelEsc);
    else if (filtro === "conhecidos") rows = rows.filter(r => r.isKnown);
    else if (filtro === "repetentes") rows = rows.filter(r => !!r.ant);
    else if (filtro === "novos") rows = rows.filter(r => !r.isKnown);
    else if (filtro.startsWith("esc:")) {
      const escNome = filtro.slice(4);
      rows = rows.filter(r => r.escalao === escNome);
    }
    return rows;
  }, [allRows, filtro]);

  // Sort
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let v = 0;
      if (sortCol === "nome") v = a.nome.localeCompare(b.nome);
      else if (sortCol === "pais") v = a.pais.localeCompare(b.pais);
      else if (sortCol === "escalao") v = (ESCALAO_ORDER[a.escalao] ?? 99) - (ESCALAO_ORDER[b.escalao] ?? 99);
      else if (sortCol === "antEsc") v = (a.ant?.escalao ?? "zzz").localeCompare(b.ant?.escalao ?? "zzz");
      else if (sortCol === "antPos") v = (a.ant?.pos ?? 999) - (b.ant?.pos ?? 999);
      else if (sortCol === "encontros") {
        // Known first, then by nEncontros desc
        if (a.isKnown !== b.isKnown) return a.isKnown ? -1 : 1;
        v = a.nEncontros - b.nEncontros;
      }
      else if (sortCol === "hist") v = a.mhTorneios - b.mhTorneios;
      return v * dir;
    });
  }, [filtered, sortCol, sortDir]);

  // Filter pill counts
  const nConhecidos = allRows.filter(r => r.isKnown).length;
  const nRepetentes = allRows.filter(r => !!r.ant).length;
  const nNovos = allRows.filter(r => !r.isKnown).length;

  // Escalões disponíveis (ordenados), excluindo o do Manuel (que já tem pill próprio)
  const escalaosDisponiveis = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allRows) {
      counts.set(r.escalao, (counts.get(r.escalao) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => (ESCALAO_ORDER[a] ?? 99) - (ESCALAO_ORDER[b] ?? 99));
  }, [allRows]);

  // Escalão do Manuel separado (com contagem)
  const nMesmoEsc = allRows.filter(r => r.isManuelEsc).length;

  const filters: { id: string; label: string; n: number; sep?: boolean }[] = [
    { id: "todos",      label: "Todos",        n: allRows.length },
    ...(escalaoManuel ? [{ id: "mesmo_esc", label: `★ ${escalaoManuel}`, n: nMesmoEsc }] : []),
    // Escalões individuais (incluindo o do Manuel, mas como filtro de escalão genérico)
    ...escalaosDisponiveis
      .filter(([esc]) => esc !== escalaoManuel) // já temos o ★ pill
      .map(([esc, n], i) => ({ id: `esc:${esc}`, label: esc, n, sep: i === 0 })),
    { id: "conhecidos", label: "Conhecidos",   n: nConhecidos, sep: true },
    ...(nRepetentes > 0 ? [{ id: "repetentes", label: "↩ Repetem", n: nRepetentes }] : []),
    { id: "novos",      label: "Novos",        n: nNovos },
  ];

  const ThSort = ({ col, label, style }: { col: InscSortCol; label: string; style?: React.CSSProperties }) => (
    <th onClick={() => toggleSort(col)} style={{
      cursor:"pointer", userSelect:"none", whiteSpace:"nowrap",
      color: sortCol === col ? "var(--text)" : "var(--text-3)",
      ...style,
    }}>
      {label}
      <span style={{ marginLeft:3, fontSize:9, opacity: sortCol === col ? 1 : 0.3 }}>
        {sortCol === col ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
      </span>
    </th>
  );

  return (
    <div>
      {/* Filter pills */}
      <div style={{ display:"flex", gap:5, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
        {filters.map(f => (
          <React.Fragment key={f.id}>
            {f.sep && <span style={{ width:1, height:18, background:"var(--border)", margin:"0 2px", flexShrink:0 }} />}
            <button onClick={() => setFiltro(f.id)} style={{
              background: filtro === f.id ? "var(--bg-active)" : "var(--bg-card)",
              border: `1px solid ${filtro === f.id ? "var(--border-success)" : "var(--border)"}`,
              color: filtro === f.id ? "var(--text)" : "var(--text-3)",
              borderRadius: 7, padding: "4px 9px", fontSize: 11, cursor: "pointer",
              fontWeight: filtro === f.id ? 700 : 400,
            }}>
              {f.label} <span style={{ fontWeight:700, marginLeft:2, opacity:0.7 }}>{f.n}</span>
            </button>
          </React.Fragment>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div style={{ fontSize:12, color:"var(--text-3)", padding:"8px 0 12px" }}>
          Nenhum jogador neste filtro.
        </div>
      ) : (
        <div className="table-wrap">
        <table className="sc-lb" style={{ width:"100%", marginBottom:16 }}>
          <thead>
            <tr>
              <ThSort col="nome" label="Jogador" style={{ textAlign:"left", paddingLeft:10, minWidth:130 }} />
              <ThSort col="pais" label="🌍" style={{ width:30, textAlign:"center" }} />
              <ThSort col="escalao" label="Escalão" style={{ width:75, textAlign:"center", fontSize:10 }} />
              <ThSort col="hist" label="📊" style={{ width:36, textAlign:"center" }} />
              {hasAnt && <>
                <ThSort col="antEsc" label="Ano ant." style={{ width:75, textAlign:"center", fontSize:10 }} />
                <ThSort col="antPos" label="Pos." style={{ width:42, textAlign:"center", fontSize:10 }} />
              </>}
              <ThSort col="encontros" label="Encontros com o Manuel" style={{ textAlign:"left", padding:"6px 8px", minWidth:280 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} style={!r.isKnown ? { opacity: 0.55 } : undefined}>
                <td className="sticky-col-0" style={{ textAlign:"left", paddingLeft:10 }}>
                  <span style={{ display:"flex", alignItems:"center", gap:5 }}>
                    {displayName(r.nome)}
                    {r.foiTop3 && (
                      <span style={{ background:"var(--color-warn)", color:"#fff",
                        fontSize:10, fontWeight:800, padding:"1px 5px", borderRadius:4, whiteSpace:"nowrap" }}>
                        🏆 top 3
                      </span>
                    )}
                    {!r.isKnown && (
                      <span style={{ background:"var(--bg-muted)", color:"var(--text-3)",
                        fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3,
                        border:"1px solid var(--border)", whiteSpace:"nowrap" }}>
                        NOVO
                      </span>
                    )}
                    {r.ant && (
                      <span style={{ background:"var(--bg-info)", color:"var(--color-info)",
                        fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3, whiteSpace:"nowrap" }}>
                        ↩
                      </span>
                    )}
                    {(() => {
                      const kidsName = kidsRivalMap.get(normNameAuto(r.nome));
                      if (!kidsName) return null;
                      return (
                        <a href="/kids"
                          onClick={e => { e.preventDefault(); window.open(`/kids#${encodeURIComponent(kidsName)}`, "_blank"); }}
                          title="Ver perfil completo em Kids"
                          style={{ fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:4,
                            background:"var(--bg-success-subtle)", color:"var(--color-good-dark)",
                            border:"1px solid var(--border-success,var(--color-good))",
                            textDecoration:"none", whiteSpace:"nowrap", flexShrink:0 }}>
                          ↗ Kids
                        </a>
                      );
                    })()}
                  </span>
                </td>
                <td style={{ textAlign:"center" }}>{flag(r.pais)}</td>
                <td style={{ textAlign:"center" }}>
                  <span style={{
                    fontSize:10, fontWeight:600, padding:"1px 6px", borderRadius:3,
                    background: r.isManuelEsc ? "var(--bg-success-subtle,rgba(0,128,0,0.06))" : "var(--bg-muted)",
                    color: r.isManuelEsc ? "var(--color-good)" : "var(--text-3)",
                    border: `1px solid ${r.isManuelEsc ? "var(--border-success,var(--border))" : "var(--border)"}`,
                  }}>{r.escalao}</span>
                </td>
                <td style={{ textAlign:"center", fontSize:11,
                  color: r.mhTorneios > 0 ? "var(--text-2)" : "var(--text-3)", fontWeight: r.mhTorneios > 0 ? 600 : 400 }}
                  title={r.mhTorneios > 0 ? `${r.mhTorneios} torneios USKids no histórico` : ""}>
                  {r.mhTorneios > 0 ? r.mhTorneios : "—"}
                </td>
                {hasAnt && <>
                  <td style={{ textAlign:"center", fontSize:10, color:"var(--text-3)" }}>
                    {r.ant ? r.ant.escalao : "—"}
                  </td>
                  <td style={{ textAlign:"center", fontWeight: r.ant ? 700 : 400, fontSize:11,
                    fontFamily:"'JetBrains Mono',monospace",
                    color: r.ant ? (r.ant.pos <= 3 ? "var(--color-warn)" : "var(--text)") : "var(--text-3)" }}>
                    {r.ant ? <>{r.ant.pos <= 3 ? "🏆" : ""}{r.ant.pos}º</> : "—"}
                  </td>
                </>}
                <td style={{ fontSize:11, padding:"5px 8px", lineHeight:1.9, textAlign:"left" }}>
                  {r.allEncontros.length > 0 ? (
                    <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 10px" }}>
                      {r.allEncontros.map(enc => {
                        const isAdj = enc.adjacente;
                        const manMelhor = !isAdj && enc.man_pos > 0 && enc.man_pos < enc.rival_pos;
                        const manPior   = !isAdj && enc.man_pos > 0 && enc.man_pos > enc.rival_pos;
                        const hasVs = !isAdj && enc.man_pos > 0;
                        return (
                          <span key={`${enc.torneio_nome}-${enc.escalao}`} style={{ whiteSpace:"nowrap" }}>
                            <span style={{ color:"var(--text-2)" }}>
                              {shortTornName(enc.torneio_nome)}
                            </span>
                            <span style={{
                              marginLeft:4, fontSize:10, fontWeight:600, padding:"1px 5px", borderRadius:3,
                              background: isAdj ? "var(--bg-muted)" : "var(--bg-success-subtle,rgba(0,128,0,0.06))",
                              color: isAdj ? "var(--text-3)" : "var(--text-2)",
                              border: `1px solid ${isAdj ? "var(--border)" : "var(--border-success,var(--border))"}`,
                            }}>
                              {enc.escalao}:{" "}
                              {hasVs ? (
                                <>
                                  <span style={{ fontWeight:700, color: manMelhor?"var(--color-good)":manPior?"var(--color-danger)":"var(--text-3)" }}>
                                    {enc.man_pos}º
                                  </span>
                                  <span style={{ color:"var(--text-3)" }}> vs </span>
                                  <span style={{ fontWeight:700 }}>{enc.rival_pos}º</span>
                                </>
                              ) : (
                                <>{enc.rival_pos}º</>
                              )}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span style={{ color:"var(--text-3)", fontSize:10, fontStyle:"italic" }}>sem historial</span>
                  )}
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

/** Constrói a lista de rivais a partir dos resultados USKids.
 *  Inclui jogadores do escalão do Manuel E dos escalões adjacentes (±1 age_group),
 *  porque nos torneios os miúdos de escalões vizinhos convivem e por vezes
 *  jogam no mesmo draw. Encontros de escalão adjacente ficam marcados
 *  com `adjacente: true`.
 *
 *  Usa o campo numérico `age_group` (ex: 2102, 2103…) em vez de nomes de
 *  escalão, porque os nomes variam entre torneios ("Boys 9", "Boys 9-10", etc.)
 *  mas os age_group codes são sequenciais e consistentes.
 */
function buildRivalsFromResultados(resultados: TorneioResult[]): RivalInfo[] {
  const mapa = new Map<string, RivalInfo>();
  for (const t of resultados) {
    // 1. Encontrar o escalão do Manuel via escalao_manuel, is_manuel, ou busca directa
    const escalaoEsperado = escalaoManuelParaData(t.date_inicio);
    let manuelEsc: EscalaoResult | null = null;
    let manuelJog: RondaJogador | null = null;
    let manuelPos = 99;

    // Prioridade: escalao_manuel (numérico, injectado pelo pipeline)
    if (t.escalao_manuel) {
      manuelEsc = t.escaloes.find(e => e.age_group === t.escalao_manuel) ?? null;
    }
    // Fallback: is_manuel flag + nome esperado
    if (!manuelEsc) {
      manuelEsc = t.escaloes.find(e => e.is_manuel && e.nome === escalaoEsperado) ?? null;
    }
    // Último recurso: procurar o Manuel directamente nos jogadores
    if (!manuelEsc) {
      for (const e of t.escaloes) {
        const todasRondas = e.rondas.flatMap(r => r.leaderboard ?? r.jogadores ?? []);
        if (todasRondas.some(j => isManuel(j.nome))) { manuelEsc = e; break; }
      }
    }
    if (!manuelEsc) continue;

    // Obter dados do Manuel no seu escalão (posição calculada dentro do loop onde posMap existe)
    const manuelRondas = manuelEsc.rondas.flatMap(r => r.leaderboard ?? r.jogadores ?? []);
    manuelJog = manuelRondas.find(j => isManuel(j.nome)) ?? null;

    const manuelAg = manuelEsc.age_group;
    const adjacentAgs = new Set([manuelAg - 1, manuelAg, manuelAg + 1]);

    for (const e of t.escaloes) {
      if (!adjacentAgs.has(e.age_group)) continue;

      const isManuelsEscalao = (e.age_group === manuelAg);
      const todasRondas = e.rondas.flatMap(r => r.leaderboard ?? r.jogadores ?? []);

      // Calcular posições correctas por total acumulado de todas as rondas
      const totais = new Map<string, { score: number; rondas: number }>();
      for (const ronda of e.rondas) {
        for (const j of (ronda.leaderboard ?? ronda.jogadores ?? [])) {
          if (!j.nome || j.buracos < 9) continue;
          const k = j.nome.trim();
          const c = totais.get(k) ?? { score: 0, rondas: 0 };
          totais.set(k, { score: c.score + j.score, rondas: c.rondas + 1 });
        }
      }
      const maxRds2 = totais.size ? Math.max(...[...totais.values()].map(v => v.rondas)) : 0;
      const rankSorted = [...totais.entries()]
        .filter(([, v]) => v.rondas >= maxRds2)
        .sort((a, b) => a[1].score - b[1].score);
      const posMap = new Map<string, number>();
      let rankPos = 1;
      for (let ri = 0; ri < rankSorted.length; ri++) {
        if (ri > 0 && rankSorted[ri][1].score === rankSorted[ri-1][1].score) { /* empate */ }
        else rankPos = ri + 1;
        posMap.set(rankSorted[ri][0], rankPos);
      }

      // manuelPos calculado aqui onde posMap está disponível
      if (isManuelsEscalao && manuelJog) {
        manuelPos = posMap.get(manuelJog.nome.trim()) ?? 99;
      }

      const adversariosVistos = new Set<string>();
      for (const r of e.rondas)
        for (const j of (r.leaderboard ?? r.jogadores ?? []))
          if (!isManuel(j.nome)) adversariosVistos.add(j.nome.trim());

      for (const nomeAdv of adversariosVistos) {
        const key = nomeAdv.toLowerCase().trim().replace(/\s+/g, " ");
        const advJog = todasRondas.find(j => j.nome.trim() === nomeAdv);
        if (!advJog) continue;
        const advPos = posMap.get(nomeAdv) ?? 99;

        if (!mapa.has(key))
          mapa.set(key, { nome: advJog.nome, pais: advJog.pais, cidade: advJog.cidade ?? "", encontros: [] });

        mapa.get(key)!.encontros.push({
          torneio_t:    t.t,
          torneio_nome: t.name,
          torneio_data: t.date_inicio,
          escalao:      e.nome,
          man_score:    isManuelsEscalao && manuelJog ? (manuelJog.score || 0) : 0,
          rival_score:  advJog.score || 0,
          man_to_par:   isManuelsEscalao && manuelJog ? (manuelJog.to_par ?? null) : null,
          rival_to_par: advJog.to_par ?? null,
          man_pos:      isManuelsEscalao ? manuelPos : 0,
          rival_pos:    advPos,
          adjacente:    !isManuelsEscalao,
        });
      }
    }
  }
  return [...mapa.values()];
}

/** Extrai base do tid (remove sufixo de escalão) para agrupar por torneio físico */
function tidBase(tid: string): string {
  // eowagr25_b910 → eowagr25, wjgc26_1213 → wjgc26, doral25_b89 → doral25,
  // gg26_u14 → gg26, gg26_open → gg26, usk18124_b10 → usk18124
  return tid.replace(/_(?:b?\d+|u\d+|open)$/, "");
}

function TabRivais({ data, fieldData, intlData, autoRivals, selectedT: _selectedT, mhCountMap,
  selectedRival, setSelectedRival, greatgolfData: _greatgolfData,
  onRivalsReady,
}: {
  data: ResultsData; fieldData: FieldData | null; intlData: IntlData | null;
  autoRivals: AutoRivalPlayer[]; selectedT: number | null;
  mhCountMap: Map<string, number>;
  selectedRival: string | null; setSelectedRival: (r: string | null | ((prev: string | null) => string | null)) => void;
  greatgolfData: GreatgolfData | null;
  onRivalsReady?: (list: {
    nome: string; pais: string; nEnc: number;
    vitorias: number; derrotas: number; empates: number;
    totalTournaments: number; firstYear: number | null;
    nextTournName: string | null; daysToNext: number | null; nextIsCommon: boolean;
  }[]) => void;
}) {
  const matchIntl = useMemo(() => criarMatcherIntl(intlData), [intlData]);

  // ── PASSO 1: Base de rivais a partir dos resultados USKids ──────────────────
  // Dependência apenas em [data] — NÃO recalcula quando autoRivals chega.
  // buildRivalsFromResultados é a operação mais pesada: itera todos os torneios
  // × escalões × jogadores. Separá-la evita que corra 2× por sessão.
  const baseRivals = useMemo<RivalInfo[]>(
    () => buildRivalsFromResultados(data.resultados),
    [data]
  );

  // ── PASSO 2: Merge com autoRivals (internacionais) e intlData (fallback) ─
  // Este memo é muito mais leve — só faz lookups e pushes num Map já construído.
  // Corre quando baseRivals, autoRivals ou intlData mudam.
  const rivals = useMemo<RivalInfo[]>(() => {
    const mapa = new Map<string, RivalInfo>(baseRivals.map(r => [r.nome.toLowerCase().trim().replace(/\s+/g, " "), r]));

    // ── 2. AutoRivals (KIDSdataLoader): dados dos JSONs brutos (AUTORITATIVOS) ──
    // Processados PRIMEIRO porque os JSONs têm dados completos e actualizados.
    // O rivals-intl.json pode ter dados stale (ex: apenas 2 de 3 rondas).
    if (autoRivals.length > 0) {
      // Manuel aparece com nomes diferentes em ficheiros diferentes
      // ("Manuel Medeiros", "Manuel Francisco Medeiros", "Manuel Goulartt Medeiros")
      // → encontrar TODAS as entradas e mergir todos os torneios
      const manuelEntries = autoRivals.filter(p =>
        normNameAuto(p.n).includes("medeiros") && normNameAuto(p.n).includes("manuel")
      );
      const manuelBases = new Map<string, { tid: string; res: (typeof autoRivals)[0]["r"][string] }>();
      for (const me of manuelEntries) {
        for (const [tid, res] of Object.entries(me.r)) {
          const b = tidBase(tid);
          if (!manuelBases.has(b) || res.rd.length > (manuelBases.get(b)!.res.rd?.length ?? 0))
            manuelBases.set(b, { tid, res });
        }
      }
      if (manuelBases.size > 0) {
        const manuelKeys = new Set(manuelEntries.map(me => normNameAuto(me.n)));

        for (const ap of autoRivals) {
          if (manuelKeys.has(normNameAuto(ap.n))) continue;
          const key = ap.n.toLowerCase().trim().replace(/\s+/g, " ");

          for (const [apTid, apRes] of Object.entries(ap.r)) {
            const b = tidBase(apTid);
            const manuelEntry = manuelBases.get(b);
            if (!manuelEntry) continue;

            const isSameTid = (apTid === manuelEntry.tid);
            const existing = mapa.get(key);

            // Extract year from tidBase: "wjgc26" → "'26", "eowagr25" → "'25"
            const yearMatch = b.match(/(\d{2})$/);
            const yearSuffix = yearMatch ? `'${yearMatch[1]}` : "";

            const tornLabel = (() => {
              const bl = b.toLowerCase();
              if (bl.startsWith("eowagr")) return `EU Open ${yearSuffix}`.trim();
              if (bl.startsWith("wjgc") || bl.startsWith("brjgt")) return `WJGC ${yearSuffix}`.trim();
              if (bl.startsWith("doral")) return `Doral ${yearSuffix}`.trim();
              if (bl.startsWith("gg")) return `Great Golf ${yearSuffix}`.trim();
              if (bl.startsWith("qdl")) return `QDL ${yearSuffix}`.trim();
              if (bl.startsWith("marco")) return `Marco Simone ${yearSuffix}`.trim();
              if (bl.startsWith("venice")) return `Venice Open ${yearSuffix}`.trim();
              if (bl.startsWith("rome")) return `Rome Classic ${yearSuffix}`.trim();
              if (bl.startsWith("desert")) return `Desert Shootout ${yearSuffix}`.trim();
              if (bl.startsWith("sandestin")) return `Sandestin ${yearSuffix}`.trim();
              if (bl.startsWith("msstate")) return `MS State ${yearSuffix}`.trim();
              if (bl.startsWith("scstate")) return `SC State ${yearSuffix}`.trim();
              if (bl.startsWith("elprat")) return `El Prat ${yearSuffix}`.trim();
              return b.replace(/\d+$/, "").replace(/_/g, " ").toUpperCase().trim() + (yearSuffix ? ` ${yearSuffix}` : "") || b;
            })();
            const ageLabel = apRes.ageGroup || (() => {
              const suffix = apTid.replace(b, "").replace(/^_/, "");
              if (!suffix) return "";
              const digits = suffix.replace(/^b/, "");
              const n = Number(digits);
              if (n >= 7 && n <= 18) return `Boys ${n}`;
              for (let i = 1; i < digits.length; i++) {
                const a = Number(digits.slice(0, i));
                const bb = Number(digits.slice(i));
                if (a >= 7 && a <= 17 && bb >= 8 && bb <= 18 && bb === a + 1) {
                  return `Boys ${a}-${bb}`;
                }
              }
              return suffix;
            })();

            // Dedup: skip se já temos um encontro com este tornCanon (wjgc25 ≠ wjgc26)
            if (existing) {
              const existKeys = new Set(existing.encontros.map(e => tornCanon(e.torneio_nome)));
              if (hasCanon(existKeys, tornLabel)) continue;
            }

            if (!mapa.has(key))
              mapa.set(key, { nome: ap.n, pais: ap.co ?? "", cidade: "", encontros: [] });

            mapa.get(key)!.encontros.push({
              torneio_t:    0,
              torneio_nome: tornLabel,
              torneio_data: "",
              escalao:      ageLabel || tornLabel,
              man_score:    0,
              rival_score:  0,
              man_to_par:   manuelEntry.res.tp ?? null,
              rival_to_par: apRes.tp ?? null,
              man_pos:      manuelEntry.res.p ?? 0,
              rival_pos:    apRes.p ?? 0,
              adjacente:    !isSameTid,
            });
          }
        }
      }
    }

    // ── 3. intlData (rivals-intl.json): FALLBACK para jogadores sem encontros ──
    // Só adiciona encontros para jogadores que NÃO foram cobertos pelos passos 1+2.
    // O intlData pode ter posições stale; autoRivals (passo 2) é autoritativo.
    if (intlData) {
      const manuelIntlJog = intlData.jogadores.find(j => j.isM);
      if (manuelIntlJog) {
        const torneiosComManuel = new Map<string, IntlTorneio>();
        for (const tid of Object.keys(manuelIntlJog.r)) {
          const torn = intlData.torneios.find(t => t.id === tid);
          if (torn && torn.circuito !== "uskids") torneiosComManuel.set(tid, torn);
        }

        for (const j of intlData.jogadores) {
          if (j.isM) continue;
          const key = j.n.toLowerCase().trim().replace(/\s+/g, " ");

          if (!mapa.has(key))
            mapa.set(key, { nome: j.n, pais: j.co ?? "", cidade: "", encontros: [] });

          const existing = mapa.get(key)!;
          const existCanons = new Set(existing.encontros.map(e => tornCanon(e.torneio_nome)));

          for (const [tid, torn] of torneiosComManuel) {
            const rivalRes = j.r[tid];
            if (!rivalRes) continue;
            const manRes = manuelIntlJog.r[tid];
            if (!manRes) continue;
            // Skip se este torneio já existe por tornCanon
            if (hasCanon(existCanons, torn.name, torn.short)) continue;

            const ym = tid.match(/(\d{2})(?:_|$)/);
            const ys = ym ? `'${ym[1]}` : "";
            const catLabel = `${torn.short || torn.name} ${ys}`.trim();

            mapa.get(key)!.encontros.push({
              torneio_t:    0,
              torneio_nome: torn.name,
              torneio_data: torn.date || "",
              escalao:      catLabel,
              man_score:    0,
              rival_score:  0,
              man_to_par:   manRes.tp ?? null,
              rival_to_par: rivalRes.tp ?? null,
              man_pos:      manRes.p ?? 0,
              rival_pos:    rivalRes.p ?? 0,
              adjacente:    false,
            });
          }
        }
      }
    }

    return [...mapa.values()];
  }, [baseRivals, intlData, autoRivals]);

  // Notify parent of sidebar-ready rivals list (avoids duplicate computation)
  useEffect(() => {
    if (!onRivalsReady || rivals.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const manuelInscTids = new Set(
      (fieldData?.torneios ?? [])
        .filter(t => t.escaloes.some(e => (e.jogadores ?? []).some(j => isManuel(j.nome) && j.pais === "PT")))
        .map(t => t.t)
    );

    // ── Rivais que cruzaram com Manuel ──
    const lista: SidebarRival[] = rivals.map(r => {
      const nTorn = new Set(r.encontros.map(e => tornCanon(e.torneio_nome))).size;
      let vitorias = 0, derrotas = 0, empates = 0;
      for (const e of r.encontros) {
        if (e.adjacente) continue;
        if (e.man_pos < e.rival_pos) vitorias++;
        else if (e.man_pos > e.rival_pos) derrotas++;
        else empates++;
      }
      const ar = autoRivals.find(a => normNameAuto(a.n) === normNameAuto(r.nome));
      const totalTournaments = ar ? Object.keys(ar.r).length : nTorn;
      const anosEncontros = r.encontros
        .map(e => { const iso = isoDate(e.torneio_data); return iso ? parseInt(iso.slice(0,4)) : 0; })
        .filter(Boolean);
      const anosAr = ar ? Object.keys(ar.r).map(tid => {
        const b = tidBase(tid); const m = b.match(/(\d{2})$/);
        if (!m) return 0; const n = parseInt(m[1]);
        return (n >= 20 && n <= 35) ? 2000 + n : 0;
      }).filter(Boolean) : [];
      const todosAnos = [...anosEncontros, ...anosAr];
      const firstYear = todosAnos.length ? Math.min(...todosAnos) : null;
      let nextTournName: string | null = null;
      let daysToNext: number | null = null;
      let nextIsCommon = false;
      if (fieldData) {
        const rivalNorm = normNameAuto(r.nome);
        const futuros = fieldData.torneios
          .filter(t => {
            const iso = isoDate(t.date_inicio);
            return iso >= today && t.escaloes.some(e =>
              (e.jogadores ?? []).some(j => normNameAuto(j.nome) === rivalNorm)
            );
          })
          .sort((a, b) => isoDate(a.date_inicio).localeCompare(isoDate(b.date_inicio)));
        if (futuros.length > 0) {
          const first = futuros[0];
          nextTournName = first.name.replace(/\s*\d{4}$/, "");
          const diff = Math.round((new Date(isoDate(first.date_inicio)).getTime() - new Date(today).getTime()) / 86400000);
          daysToNext = Math.max(0, diff);
          nextIsCommon = manuelInscTids.has(first.t);
        }
      }
      return { nome: r.nome, pais: r.pais, nEnc: nTorn, vitorias, derrotas, empates, totalTournaments, firstYear, nextTournName, daysToNext, nextIsCommon };
    });

    // ── Adicionar autoRivals Boys 9-14 que ainda não estão na lista ──
    // E enriquecer rivais já existentes com totalTournaments real do member history
    const nomesNaLista = new Set(lista.map(r => normNameAuto(r.nome)));
    for (const ap of autoRivals) {
      if (normNameAuto(ap.n).includes("medeiros") && normNameAuto(ap.n).includes("manuel")) continue;

      // Verificar se tem pelo menos uma entrada Boys 9-14
      const temBoysRelevante = Object.entries(ap.r).some(([tid]) => {
        const m = tid.match(/_b(\d+)$/);
        if (!m) return false;
        const age = parseInt(m[1]);
        return age >= 9 && age <= 14;
      });
      if (!temBoysRelevante) continue;

      // Anos e totalTournaments do member history
      const tids = Object.keys(ap.r);
      const anos = tids.map(tid => {
        const uskM = tid.match(/^usk(\d+)/);
        if (uskM) { const meta = uskTournNames.get(`usk${uskM[1]}`); if (meta?.dateExact) return parseInt(meta.dateExact.slice(0,4)); }
        const b = tidBase(tid); const m = b.match(/(\d{2})$/);
        if (!m) return 0; const n = parseInt(m[1]);
        return (n >= 20 && n <= 35) ? 2000 + n : 0;
      }).filter(Boolean);
      const firstYearAr = anos.length ? Math.min(...anos) : null;
      const totalTournAr = tids.length;

      if (nomesNaLista.has(normNameAuto(ap.n))) {
        // Rival já na lista (tem encontros) → actualizar totalTournaments e firstYear
        const idx = lista.findIndex(r => normNameAuto(r.nome) === normNameAuto(ap.n));
        if (idx >= 0) {
          lista[idx] = {
            ...lista[idx],
            totalTournaments: Math.max(lista[idx].totalTournaments, totalTournAr),
            firstYear: firstYearAr != null
              ? (lista[idx].firstYear != null ? Math.min(lista[idx].firstYear, firstYearAr) : firstYearAr)
              : lista[idx].firstYear,
          };
        }
        continue;
      }

      const pais = ap.co || "";

      // Próximo torneio inscrito
      let nextTournName: string | null = null;
      let daysToNext: number | null = null;
      let nextIsCommon = false;
      if (fieldData) {
        const rivalNorm = normNameAuto(ap.n);
        const futuros = fieldData.torneios
          .filter(t => {
            const iso = isoDate(t.date_inicio);
            return iso >= today && t.escaloes.some(e =>
              (e.jogadores ?? []).some(j => normNameAuto(j.nome) === rivalNorm)
            );
          })
          .sort((a, b) => isoDate(a.date_inicio).localeCompare(isoDate(b.date_inicio)));
        if (futuros.length > 0) {
          const first = futuros[0];
          nextTournName = first.name.replace(/\s*\d{4}$/, "");
          const diff = Math.round((new Date(isoDate(first.date_inicio)).getTime() - new Date(today).getTime()) / 86400000);
          daysToNext = Math.max(0, diff);
          nextIsCommon = manuelInscTids.has(first.t);
        }
      }

      lista.push({
        nome: ap.n, pais, nEnc: 0,
        vitorias: 0, derrotas: 0, empates: 0,
        totalTournaments: totalTournAr,
        firstYear: firstYearAr, nextTournName, daysToNext, nextIsCommon,
      });
      nomesNaLista.add(normNameAuto(ap.n));
    }

    // ── Calcular playerTier e normalizar país ──────────────────────────────
    // Quick tier a partir dos dados disponíveis no member history / encounters
    // Só faz sentido para rivais que podem disputar directamente com o Manuel (escalão ±2)
    // Manuel está actualmente em Boys 12 (nascido 2012) — escalões relevantes: 10, 11, 12, 13, 14
    const MANUEL_CURRENT_AGE = new Date().getFullYear() - MANUEL_BIRTHDAY_YEAR;
    const RELEVANT_AGES = new Set([
      MANUEL_CURRENT_AGE - 2, MANUEL_CURRENT_AGE - 1, MANUEL_CURRENT_AGE,
      MANUEL_CURRENT_AGE + 1, MANUEL_CURRENT_AGE + 2,
    ].map(String));

    function computeQuickTier(
      r: { nEnc: number; vitorias: number; derrotas: number; totalTournaments: number; firstYear: number | null },
      ar: AutoRivalPlayer | undefined,
    ): SidebarRival["playerTier"] {
      // Verificar se tem escalões relevantes (±2 do Manuel)
      if (ar) {
        const ages = Object.keys(ar.r)
          .map(tid => tid.match(/_b(\d+)$/)?.[1])
          .filter((a): a is string => a != null);
        const temEscalaoRelevante = ages.some(a => RELEVANT_AGES.has(a));
        if (!temEscalaoRelevante) return null;
      } else if (r.nEnc === 0) {
        // Sem autoRivals e sem encontros — não classificar
        return null;
      }

      // avgPos aproximada a partir dos resultados do rival
      let avgPos: number | null = null;
      let wins = 0;
      if (ar) {
        const ps = Object.values(ar.r).map(v => v.p).filter((p): p is number => p != null && p > 0);
        if (ps.length >= 3) avgPos = ps.reduce((s, p) => s + p, 0) / ps.length;
        wins = Object.values(ar.r).filter(v => v.p === 1).length;
      }
      const curYear = new Date().getFullYear();
      const anosActivo = r.firstYear ? curYear - r.firstYear + 1 : 0;
      const tot = r.totalTournaments;

      if (wins >= 3 && avgPos != null && avgPos <= 4)       return "elite";
      if (wins >= 1 && avgPos != null && avgPos <= 5)        return "contender";
      if (avgPos != null && avgPos <= 8 && tot >= 10)        return "forte";
      if (anosActivo <= 3 && tot >= 10)                      return "subindo";
      if (tot >= 20 && anosActivo >= 4)                      return "assiduo";
      if (avgPos != null && avgPos <= 12 && tot >= 8)        return "consistente";
      return null;
    }

    // Normalizar país e adicionar tier
    const listaFinal: SidebarRival[] = lista.map(r => {
      const ar = autoRivals.find(a => normNameAuto(a.n) === normNameAuto(r.nome));
      return {
        ...r,
        pais: normPaisDisplay(r.pais),
        playerTier: computeQuickTier(r, ar),
      };
    });

    onRivalsReady(listaFinal.sort((a, b) => b.nEnc - a.nEnc || b.totalTournaments - a.totalTournaments));
  }, [rivals, onRivalsReady, autoRivals, fieldData]);

  // Memoized matcher — criado UMA vez, reutilizado por SubTabPorTorneio e TabelaConhecidos
  const matchRival = useMemo(() => criarMatcherRivals(rivals), [rivals]);

  // Torneios futuros onde o Manuel está inscrito (nome+PT)
  const torneiosComManuel = useMemo(() => {
    const map = new Map<number, { t: number; name: string; date_inicio: string; escalaoManuel?: string; source: "field" | "results" }>();

    // 1. Torneios do fieldData (inscritos — futuros e recentes)
    if (fieldData) {
      for (const t of fieldData.torneios) {
        const esc = t.escaloes.find(e =>
          (e.jogadores ?? []).some(j => isManuel(j.nome) && j.pais === "PT")
        );
        if (esc) {
          map.set(t.t, { t: t.t, name: t.name, date_inicio: t.date_inicio, escalaoManuel: esc.nome, source: "field" });
        }
      }
    }

    // 2. Torneios do resultsData (passados onde o Manuel jogou)
    for (const t of data.resultados) {
      if (map.has(t.t)) continue; // já temos do fieldData
      const manuelJogou = t.escaloes?.some(e =>
        e.rondas?.some(r =>
          (r.leaderboard ?? r.jogadores ?? []).some(j => isManuel(j.nome))
        )
      );
      if (manuelJogou) {
        const esc = t.escaloes?.find(e =>
          e.rondas?.some(r =>
            (r.leaderboard ?? r.jogadores ?? []).some(j => isManuel(j.nome))
          )
        );
        map.set(t.t, { t: t.t, name: t.name, date_inicio: t.date_inicio, escalaoManuel: esc?.nome, source: "results" });
      }
    }

    return [...map.values()]
      .sort((a, b) => isoDate(b.date_inicio).localeCompare(isoDate(a.date_inicio)));  // mais recentes primeiro
  }, [fieldData, data]);

  // Navigate to rival profile
  const goToProfile = (nome: string) => {
    setSelectedRival(nome);
  };
  const goBack = () => {
    setSelectedRival(null);
  };

  // Mapa nome normalizado → nome canónico para link ↗ Kids (abre nova janela)
  const kidsRivalMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of autoRivals) m.set(normNameAuto(r.n), r.n);
    return m;
  }, [autoRivals]);

  if (!rivals.length) return (
    <div style={{ color:"var(--text-3)", padding:"32px 0", textAlign:"center", fontSize:13 }}>
      Sem dados de rivais ainda — os scorecards aparecem após os torneios
    </div>
  );

  // ── MODO PERFIL: rival seleccionado ──
  if (selectedRival) {
    return (
      <PerfilRivalNovo
        nome={selectedRival}
        rivals={rivals}
        autoRivals={autoRivals}
        fieldData={fieldData}
        resultados={data.resultados}
        torneiosComManuel={torneiosComManuel}
        goBack={goBack}
        goToProfile={goToProfile}
      />
    );
  }

  // ── Vista por torneio (directa, sem sub-tabs) ──
  return (
    <SubTabPorTorneio
      torneiosComManuel={torneiosComManuel}
      rivals={rivals} fieldData={fieldData} intlData={intlData}
      matchIntl={matchIntl} matchRival={matchRival} resultados={data.resultados}
      mhCountMap={mhCountMap} goToProfile={goToProfile}
      kidsRivalMap={kidsRivalMap}
    />
  );
}

/* ════════════════════════════════════════════════════════════════
   SubTabPorTorneio — Vista por torneio (rivais + inscritos unificados)
   Mostra TabelaConhecidos per tournament + secções de inscritos futuros
   ════════════════════════════════════════════════════════════════ */
function SubTabPorTorneio({
  torneiosComManuel, rivals, fieldData, intlData, matchIntl, matchRival, resultados, mhCountMap, goToProfile, kidsRivalMap,
}: {
  torneiosComManuel: { t: number; name: string; date_inicio: string; escalaoManuel?: string; source: "field" | "results" }[];
  rivals: RivalInfo[]; fieldData: FieldData | null; intlData: IntlData | null;
  matchIntl: (nome: string, pais?: string) => IntlJogador | null;
  matchRival: (nome: string, pais?: string) => RivalInfo | null;
  resultados: TorneioResult[];
  mhCountMap: Map<string, number>;
  goToProfile: (nome: string) => void;
  kidsRivalMap: Map<string, string>;
}) {
  const [showInscritos, setShowInscritos] = useState(false);

  // ── Inscritos: LAZY — só computa quando showInscritos === true ──
  const torneiosFuturos = useMemo(() => {
    if (!fieldData || !showInscritos) return [];
    return fieldData.torneios
      .filter(t => isoDate(t.date_inicio) >= new Date().toISOString().slice(0,10))
      .sort((a,b) => isoDate(a.date_inicio).localeCompare(isoDate(b.date_inicio)));
  }, [fieldData, showInscritos]);

  type InscritoEntry = { torneioT: number; torneioNome: string; torneioData: string; escalao: string; mesmoEscalao: boolean };
  const { conhecidosMap, desconhecidosMap } = useMemo(() => {
    if (!showInscritos) return {
      conhecidosMap: new Map<string, { rival: RivalInfo; torneios: InscritoEntry[] }>(),
      desconhecidosMap: new Map<string, { nome: string; pais: string; torneios: InscritoEntry[] }>(),
    };
    const conhecidosMap  = new Map<string, { rival: RivalInfo; torneios: InscritoEntry[] }>();
    const desconhecidosMap = new Map<string, { nome: string; pais: string; torneios: InscritoEntry[] }>();
    for (const t of torneiosFuturos) {
      const manuelInscrito = t.escaloes.some(e => (e.jogadores ?? []).some(j => isManuel(j.nome) && j.pais === "PT"));
      const escalaoComManuel = new Set(
        t.escaloes.filter(e => (e.jogadores ?? []).some(j => isManuel(j.nome) && j.pais === "PT")).map(e => e.nome)
      );
      for (const esc of t.escaloes) {
        if ((esc.jogadores?.length ?? 0) === 0) continue;
        for (const j of (esc.jogadores ?? [])) {
          if (isManuel(j.nome)) continue;
          const key = j.nome.toLowerCase().trim();
          const mesmoEscalao = manuelInscrito && escalaoComManuel.has(esc.nome);
          const rivalMatch = matchRival(j.nome, j.pais);
          if (rivalMatch) {
            const entry: InscritoEntry = { torneioT: t.t, torneioNome: t.name, torneioData: t.date_inicio, escalao: esc.nome, mesmoEscalao };
            if (!conhecidosMap.has(key)) conhecidosMap.set(key, { rival: rivalMatch, torneios: [] });
            if (!conhecidosMap.get(key)!.torneios.some(p => p.torneioT === t.t)) conhecidosMap.get(key)!.torneios.push(entry);
          } else {
            if (!manuelInscrito) continue;
            const entry: InscritoEntry = { torneioT: t.t, torneioNome: t.name, torneioData: t.date_inicio, escalao: esc.nome, mesmoEscalao: true };
            if (!desconhecidosMap.has(key)) desconhecidosMap.set(key, { nome: j.nome, pais: j.pais, torneios: [] });
            if (!desconhecidosMap.get(key)!.torneios.some(p => p.torneioT === t.t)) desconhecidosMap.get(key)!.torneios.push(entry);
          }
        }
      }
    }
    return { conhecidosMap, desconhecidosMap };
  }, [showInscritos, matchRival, torneiosFuturos]);

  const vaiReencontrar = useMemo(() =>
    [...conhecidosMap.values()].filter(e => e.torneios.some(t => t.mesmoEscalao)).sort((a,b) => b.torneios.length - a.torneios.length)
  , [conhecidosMap]);
  const vaiConhecer = useMemo(() =>
    [...desconhecidosMap.values()].filter(e => e.torneios.some(t => t.mesmoEscalao)).sort((a,b) => b.torneios.length - a.torneios.length)
  , [desconhecidosMap]);
  const escalaoOutro = useMemo(() =>
    [...conhecidosMap.values()].filter(e => !e.torneios.some(t => t.mesmoEscalao)).sort((a,b) => b.torneios.length - a.torneios.length)
  , [conhecidosMap]);
  const assiduos = useMemo(() =>
    [...desconhecidosMap.values()]
      .filter(e => !e.torneios.some(t => t.mesmoEscalao) && e.torneios.length >= 2)
      .sort((a,b) => b.torneios.length - a.torneios.length)
  , [desconhecidosMap]);
  const assiduosTodos = useMemo(() => {
    const conhecidosKeys = new Set(rivals.map(r => r.nome.toLowerCase().trim()));
    const presencas = new Map<string, { nome: string; pais: string; torneios: { torneioT: number; torneioNome: string; escalao: string }[] }>();
    for (const t of torneiosFuturos) {
      for (const esc of t.escaloes) {
        if ((esc.jogadores?.length ?? 0) === 0) continue;
        for (const j of (esc.jogadores ?? [])) {
          if (isManuel(j.nome)) continue;
          const key = j.nome.toLowerCase().trim();
          if (conhecidosKeys.has(key)) continue;
          if (!presencas.has(key)) presencas.set(key, { nome: j.nome, pais: j.pais, torneios: [] });
          if (!presencas.get(key)!.torneios.some(p => p.torneioT === t.t))
            presencas.get(key)!.torneios.push({ torneioT: t.t, torneioNome: t.name, escalao: esc.nome });
        }
      }
    }
    return [...presencas.values()].filter(e => e.torneios.length >= 2).sort((a, b) => b.torneios.length - a.torneios.length);
  }, [rivals, torneiosFuturos]);

  const TorneiosPills = ({ torneios }: { torneios: InscritoEntry[] }) => (
    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
      {torneios.map((t, j) => (
        <span key={j} style={{
          fontSize:11, padding:"2px 8px", borderRadius:6, whiteSpace:"nowrap",
          background: t.mesmoEscalao ? "var(--bg-active)" : "var(--bg-muted)",
          color: t.mesmoEscalao ? "var(--text)" : "var(--text-3)",
          border: `1px solid ${t.mesmoEscalao ? "var(--border-success)" : "var(--border)"}`,
          fontWeight: t.mesmoEscalao ? 600 : 400,
        }}>
          {t.mesmoEscalao && <span style={{ marginRight:2 }}>★</span>}{t.torneioNome.replace(/\s*\d{4}$/, "")}
          <span style={{ opacity:0.6, marginLeft:3, fontSize:10 }}>{t.escalao}</span>
        </span>
      ))}
    </div>
  );

  const HistorialLine = ({ rival }: { rival: RivalInfo }) => {
    const unicos = [...new Map(rival.encontros.map(e => [e.torneio_t, e])).values()];
    if (!unicos.length) return null;
    return (
      <div style={{ fontSize:10, color:"var(--text-3)", marginTop:2, display:"flex", flexWrap:"wrap", gap:"0 8px" }}>
        {unicos.map(enc => (
          <span key={`${enc.torneio_nome}-${enc.escalao}`}>
            {shortTornName(enc.torneio_nome)}
            <span style={{ marginLeft:2, fontWeight:600,
              color: enc.man_pos < enc.rival_pos ? "var(--color-good)" : enc.man_pos > enc.rival_pos ? "var(--color-danger)" : "var(--text-3)" }}>
              {enc.man_pos}º vs {enc.rival_pos}º
            </span>
          </span>
        ))}
      </div>
    );
  };

  // Tabela genérica para secções de inscritos
  const InscTable = ({ rows, showHist }: { rows: { nome: string; pais: string; rival?: RivalInfo; torneios: InscritoEntry[] }[]; showHist?: boolean }) => (
    <div className="table-wrap">
    <table className="dtable-lg" style={{ width:"100%" }}>
      <thead><tr>
        <th style={{ textAlign:"left" }}>Jogador</th>
        <th style={{ width:30, textAlign:"center" }}>🌍</th>
        <th style={{ textAlign:"left" }}>Torneios</th>
        <th style={{ width:36, textAlign:"center" }}>#</th>
      </tr></thead>
      <tbody>
        {rows.map((r, i) => {
          const kidsName = kidsRivalMap.get(normNameAuto(r.nome));
          return (
            <tr key={r.nome} style={{ background: i%2===0 ? "var(--bg-card)" : "var(--bg-detail)" }}>
              <td style={{ padding:"6px 10px" }}>
                <span style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
                  {r.rival ? (
                    <span style={{ cursor:"pointer", color:"var(--accent)", fontWeight:600 }} onClick={() => goToProfile(r.nome)}>
                      {displayName(r.nome)}
                    </span>
                  ) : (
                    <span style={{ color:"var(--text-2)" }}>{displayName(r.nome)}</span>
                  )}
                  {kidsName && (
                    <a href={`/kids`}
                      onClick={e => { e.preventDefault(); window.open(`/kids#${encodeURIComponent(kidsName)}`, "_blank"); }}
                      title="Ver perfil completo em Kids"
                      style={{ fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:4,
                        background:"var(--bg-success-subtle)", color:"var(--color-good-dark)",
                        border:"1px solid var(--border-success,var(--color-good))",
                        textDecoration:"none", whiteSpace:"nowrap", flexShrink:0 }}>
                      ↗ Kids
                    </a>
                  )}
                </span>
                {showHist && r.rival && <HistorialLine rival={r.rival} />}
              </td>
              <td style={{ textAlign:"center", fontSize:14 }}>{flag(r.pais)}</td>
              <td style={{ padding:"6px 10px" }}><TorneiosPills torneios={r.torneios} /></td>
              <td style={{ textAlign:"center", fontWeight:700, fontSize:12, color:"var(--text-2)" }}>{r.torneios.length}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      {/* ── 1. Torneios com o Manuel (cards colapsáveis) ── */}
      {torneiosComManuel.length > 0 && (
        <div>
          <div className="h-sm" style={{ marginBottom:8, color:"var(--text-2)" }}>
            Resultados por torneio ({torneiosComManuel.length})
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {torneiosComManuel.map(t => (
              <TabelaConhecidos
                key={t.t}
                torneioT={t.t} torneioNome={t.name}
                torneioData={t.date_inicio}
                escalaoManuel={t.escalaoManuel}
                rivals={rivals} fieldData={fieldData}
                intlData={intlData} matchIntl={matchIntl}
                matchRival={matchRival}
                resultados={resultados}
                mhCountMap={mhCountMap}
                autoRivals={autoRivals}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── 2. Inscritos futuros (LAZY — só carrega quando pedido) ── */}
      {!showInscritos ? (
        <button onClick={() => setShowInscritos(true)} className="btn" style={{
          display:"flex", alignItems:"center", gap:6, fontSize:12, padding:"8px 16px",
        }}>
          🗓️ Carregar inscrições futuras
        </button>
      ) : (vaiReencontrar.length > 0 || vaiConhecer.length > 0) ? (
        <div>
          <div className="h-sm" style={{ marginBottom:8, color:"var(--text-2)" }}>
            Inscrições em torneios futuros
          </div>

          {vaiReencontrar.length > 0 && (
            <Secao titulo="🤝 Vai reencontrar" corTitulo="var(--color-good)"
              sub="Já se cruzaram — inscrito no mesmo escalão"
              count={vaiReencontrar.length} defaultOpen={true}>
              <InscTable rows={vaiReencontrar.map(e => ({ nome: e.rival.nome, pais: e.rival.pais, rival: e.rival, torneios: e.torneios }))} showHist />
            </Secao>
          )}

          {vaiConhecer.length > 0 && (
            <Secao titulo="🆕 Vai conhecer" corTitulo="var(--color-info)"
              sub="Primeiro encontro — inscrito no mesmo escalão"
              count={vaiConhecer.length} defaultOpen={false}>
              <InscTable rows={vaiConhecer.map(e => ({ nome: e.nome, pais: e.pais, torneios: e.torneios }))} />
            </Secao>
          )}

          {escalaoOutro.length > 0 && (
            <Secao titulo="⚔️ Noutro escalão" corTitulo="var(--text-3)"
              sub="Já se cruzaram mas agora competem noutro escalão"
              count={escalaoOutro.length} defaultOpen={false}>
              <InscTable rows={escalaoOutro.map(e => ({ nome: e.rival.nome, pais: e.rival.pais, rival: e.rival, torneios: e.torneios }))} showHist />
            </Secao>
          )}

          {assiduos.length > 0 && (
            <Secao titulo="🔍 Assíduos noutro escalão" corTitulo="var(--text-3)"
              sub="2+ torneios futuros, sem cruzamento directo"
              count={assiduos.length} defaultOpen={false}>
              <InscTable rows={assiduos.map(e => ({ nome: e.nome, pais: e.pais, torneios: e.torneios }))} />
            </Secao>
          )}

          {assiduosTodos.length > 0 && (
            <Secao titulo="📊 Mais assíduos" corTitulo="var(--text-3)"
              sub="2+ torneios futuros — todo o universo USKids"
              count={assiduosTodos.length} defaultOpen={false}>
              <div className="table-wrap">
              <table className="dtable-lg" style={{ width:"100%" }}>
                <thead><tr><th style={{ textAlign:"left" }}>Jogador</th><th style={{ width:30 }}></th><th style={{ textAlign:"left" }}>Torneios</th><th style={{ width:36, textAlign:"center" }}>#</th></tr></thead>
                <tbody>
                  {assiduosTodos.map((entry, i) => (
                    <tr key={i} style={{ background: i%2===0 ? "var(--bg-card)" : "var(--bg-detail)" }}>
                      <td style={{ padding:"6px 10px", color:"var(--text-2)" }}>{displayName(entry.nome)}</td>
                      <td style={{ textAlign:"center", fontSize:14 }}>{flag(entry.pais)}</td>
                      <td style={{ padding:"6px 10px" }}>
                        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                          {entry.torneios.map((t, j) => (
                            <span key={j} style={{ fontSize:11, padding:"2px 8px", borderRadius:6, background:"var(--bg-muted)", color:"var(--text-3)", border:"1px solid var(--border)" }}>
                              {t.torneioNome.replace(/\s*\d{4}$/, "")} <span style={{ opacity:0.6, fontSize:10 }}>{t.escalao}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ textAlign:"center", fontWeight:700, fontSize:12, color:"var(--text-3)" }}>{entry.torneios.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Secao>
          )}
        </div>
      ) : showInscritos && (
        <div style={{ color:"var(--text-3)", fontSize:12, padding:"8px 0" }}>
          Nenhum adversário inscrito em torneios futuros
        </div>
      )}

      {/* ── Vazio ── */}
      {torneiosComManuel.length === 0 && !showInscritos && (
        <div style={{ color:"var(--text-3)", fontSize:12, padding:"24px 0", textAlign:"center" }}>
          Sem torneios com o Manuel
        </div>
      )}
    </div>
  );
}



/* ════════════════════════════════════════════════════════════════
   tidToLabel — converte tid interno em nome legível
   ════════════════════════════════════════════════════════════════ */
function tidToLabel(tid: string): string {
  const b = tidBase(tid);
  const ym = b.match(/(\d{2})$/);
  const ys = ym ? `'${ym[1]}` : "";
  const bl = b.toLowerCase();
  if (bl.startsWith("eowagr"))   return `EU Open ${ys}`.trim();
  if (bl.startsWith("wjgc") || bl.startsWith("brjgt")) return `WJGC ${ys}`.trim();
  if (bl.startsWith("doral"))    return `Doral ${ys}`.trim();
  if (bl.startsWith("gg"))       return `Great Golf ${ys}`.trim();
  if (bl.startsWith("qdl"))      return `QDL ${ys}`.trim();
  if (bl.startsWith("marco"))    return `Marco Simone ${ys}`.trim();
  if (bl.startsWith("venice"))   return `Venice Open ${ys}`.trim();
  if (bl.startsWith("rome"))     return `Rome Classic ${ys}`.trim();
  if (bl.startsWith("desert"))   return `Desert Shootout ${ys}`.trim();
  if (bl.startsWith("sandestin"))return `Sandestin ${ys}`.trim();
  if (bl.startsWith("msstate"))  return `MS State ${ys}`.trim();
  if (bl.startsWith("scstate"))  return `SC State ${ys}`.trim();
  if (bl.startsWith("elprat"))   return `El Prat ${ys}`.trim();
  if (bl.startsWith("usk"))      return `USK ${ys}`.trim();
  return b.replace(/\d+$/, "").replace(/_/g, " ").toUpperCase().trim() + (ys ? ` ${ys}` : "") || tid;
}

/* ════════════════════════════════════════════════════════════════
   tidToLabel — converte tid interno em nome legível
   ════════════════════════════════════════════════════════════════ */
function PerfilRivalNovo({
  nome, rivals, autoRivals, fieldData, resultados, torneiosComManuel, goBack,
}: {
  nome: string; rivals: RivalInfo[]; autoRivals: AutoRivalPlayer[];
  fieldData: FieldData | null; resultados: TorneioResult[];
  torneiosComManuel: { t: number; name: string; date_inicio: string; escalaoManuel?: string }[];
  goBack: () => void; goToProfile: (nome: string) => void;
}) {
  const rival = rivals.find(r => r.nome.toLowerCase().trim() === nome.toLowerCase().trim());
  const ar    = autoRivals.find(a => normNameAuto(a.n) === normNameAuto(nome));
  const today = new Date().toISOString().slice(0, 10);

  const directEnc = useMemo(() =>
    [...(rival?.encontros ?? [])].filter(e => !e.adjacente)
      .sort((a, b) => isoDate(b.torneio_data).localeCompare(isoDate(a.torneio_data)))
  , [rival]);

  // ── Wall of fame com dados de contexto do torneio ──
  const wallOfFame = useMemo(() => {
    if (!ar) return [];
    const manuelTornNomes = new Set((rival?.encontros ?? []).map(e => tornCanon(e.torneio_nome)));
    const entries: {
      tid: string; nome: string; date: string; year: number;
      pos: number | null; tp: number | null; rondas: number;
      ageGroup: string; withManuel: boolean; isDirectConfronto: boolean; manPos?: number; rivalPos?: number;
      // Contexto do campo
      fieldSize: number | null;       // nº jogadores no escalão
      winnerTp: number | null;        // to-par do vencedor
      medianTp: number | null;        // to-par da mediana
      percentile: number | null;      // top X% (0-100, menor = melhor)
    }[] = [];

    for (const [tid, res] of Object.entries(ar.r)) {
      const uskMatch = tid.match(/^usk(\d{4,})/i);
      const tidNum = uskMatch ? parseInt(uskMatch[1]) : (isNaN(parseInt(tid)) ? NaN : parseInt(tid));
      const torn = isNaN(tidNum) ? null : resultados.find(t => t.t === tidNum);
      // Fallback: uskTournNames (preenchido pelo processMemberHistory e TCODE_META)
      const uskKey  = tid.replace(/_b\d+$/, "");   // "usk8300_b12" → "usk8300"
      const uskMeta = uskTournNames.get(uskKey);
      const tornNome = torn?.name ?? uskMeta?.name ?? tidToLabel(tid);
      const tornDate = torn?.date_inicio ?? uskMeta?.dateExact ?? "";
      const yrFromTid = (() => {
        if (uskMeta?.dateExact) return parseInt(uskMeta.dateExact.slice(0, 4));
        const b = tidBase(tid); const m = b.match(/(\d{2})$/);
        if (!m) return 0; const n = parseInt(m[1]);
        return (n >= 20 && n <= 35) ? 2000 + n : 0;
      })();
      const year = tornDate ? parseInt(isoDate(tornDate).slice(0, 4)) : yrFromTid;
      // withManuel: estiveram no mesmo torneio (mesmo que escalões diferentes) → fundo azul + ∩
      const withManuel = manuelTornNomes.has(tornCanon(tornNome));
      // isDirectConfronto: mesmo torneio E mesmo escalão → mostra resultado
      const enc = withManuel
        ? (rival?.encontros ?? []).find(e =>
            tornCanon(e.torneio_nome) === tornCanon(tornNome) && !e.adjacente)
        : undefined;
      const isDirectConfronto = enc != null;

      // Dados de contexto do campo (via resultados → fallback: uskids-field-sizes.json)
      let fieldSize: number | null = null;
      let winnerTp: number | null = null;
      let medianTp: number | null = null;
      let percentile: number | null = null;

      if (torn && res.ageGroup) {
        const esc = torn.escaloes?.find(e => e.nome === res.ageGroup)
          ?? torn.escaloes?.find(e => e.nome.includes(res.ageGroup ?? ""));
        if (esc) {
          const lastRd = esc.rondas?.[esc.rondas.length - 1];
          const lb = [...(lastRd?.leaderboard ?? lastRd?.jogadores ?? [])];
          if (lb.length > 0) {
            fieldSize = lb.length;
            const sorted = [...lb].filter(j => j.to_par != null).sort((a, b) => (a.to_par ?? 0) - (b.to_par ?? 0));
            if (sorted.length > 0) {
              winnerTp = sorted[0].to_par ?? null;
              medianTp = sorted[Math.floor(sorted.length / 2)].to_par ?? null;
            }
          }
        }
      }
      // Fallback: uskids-field-sizes.json (inscritos por escalão)
      if (fieldSize == null) {
        fieldSize = uskFieldSizes.get(tid) ?? null;
      }
      // Percentil: só calcular com o field real (leaderboard), não com inscritos
      if (res.p != null && fieldSize != null && !winnerTp && !medianTp) {
        // field-sizes dá inscritos, não to-par — apenas percentil de posição
        percentile = Math.round((res.p / fieldSize) * 100);
      } else if (res.p != null && fieldSize != null && fieldSize > 0 && winnerTp != null) {
        percentile = Math.round((res.p / fieldSize) * 100);
      }

      entries.push({
        tid, nome: tornNome, date: tornDate, year,
        pos: res.p ?? null,
        tp: res.tp, rondas: res.rd?.length ?? 1,
        ageGroup: res.ageGroup ?? "", withManuel, isDirectConfronto,
        manPos: enc?.man_pos, rivalPos: enc?.rival_pos,
        fieldSize, winnerTp, medianTp, percentile,
      });
    }
    return entries.sort((a, b) =>
      b.year !== a.year ? b.year - a.year : isoDate(b.date).localeCompare(isoDate(a.date))
    );
  }, [ar, rival, resultados]);

  const byYear = useMemo(() => {
    const map = new Map<number, typeof wallOfFame>();
    for (const e of wallOfFame) {
      if (!map.has(e.year)) map.set(e.year, []);
      map.get(e.year)!.push(e);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [wallOfFame]);

  // ── Stats globais ──
  const stats = useMemo(() => {
    const withPos = wallOfFame.filter(e => e.pos != null);
    if (!withPos.length) return null;
    const ps  = withPos.map(e => e.pos!);
    const tps = wallOfFame.filter(e => e.tp != null).map(e => e.tp!);
    const pcts = wallOfFame.filter(e => e.percentile != null).map(e => e.percentile!);

    // vs campo: diferença do jogador à mediana do field (trimmed 10% em cada extremo)
    const vsFieldRaw = wallOfFame
      .filter(e => e.tp != null && e.medianTp != null)
      .map(e => e.tp! - e.medianTp!);
    let vsFieldTrimmed: number | null = null;
    if (vsFieldRaw.length >= 4) {
      const sorted = [...vsFieldRaw].sort((a,b)=>a-b);
      const cut = Math.max(1, Math.floor(sorted.length * 0.1));
      const trimmed = sorted.slice(cut, sorted.length - cut);
      vsFieldTrimmed = +(trimmed.reduce((s,v)=>s+v,0)/trimmed.length).toFixed(1);
    } else if (vsFieldRaw.length > 0) {
      vsFieldTrimmed = +(vsFieldRaw.reduce((s,v)=>s+v,0)/vsFieldRaw.length).toFixed(1);
    }

    // Média do tamanho do field (só entradas com dados)
    const fieldSizes = wallOfFame.filter(e => e.fieldSize != null).map(e => e.fieldSize!);
    const avgFieldSize = fieldSizes.length
      ? Math.round(fieldSizes.reduce((s,v)=>s+v,0)/fieldSizes.length)
      : null;

    return {
      total: wallOfFame.length,
      avgPos: ps.reduce((s,p)=>s+p,0)/ps.length,
      avgTp:  tps.length ? tps.reduce((s,t)=>s+t,0)/tps.length : null,
      best: Math.min(...ps), bestTp: tps.length ? Math.min(...tps) : null,
      top3: ps.filter(p=>p<=3).length, top5: ps.filter(p=>p<=5).length,
      avgRd: wallOfFame.reduce((s,e)=>s+e.rondas,0)/wallOfFame.length,
      avgPct: pcts.length ? Math.round(pcts.reduce((s,p)=>s+p,0)/pcts.length) : null,
      vsFieldTrimmed,
      avgFieldSize,
    };
  }, [wallOfFame]);

  // ── DOB: mesmo algoritmo do computeDobInfo (KIDSPage.tsx) ────────────────
  // Usa ar.r directamente: o sufixo _b{n} do tid dá a idade exacta, e o
  // ageGroup refina para grupos de idade simples ("Boys 10" → exact=10).
  // Intersecta todas as janelas e aperta com transições de escalão.
  const { dobLabel, ageGroupRange } = useMemo(() => {
    const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

    // parseExactAge: só grupos de 1 número ("Boys 10" → 10; "Boys 9-10" → null)
    function parseExactAge(ag: string): number | null {
      const m = ag.match(/boys\s+(\d+)$/i);
      return m ? parseInt(m[1]) : null;
    }

    if (!ar) return { dobLabel: null, ageGroupRange: null };

    // ── Step 1: construir constraints a partir de ar.r ──
    const constraints: Array<{ dateExact: string; ageMin: number; ageMax: number }> = [];

    for (const [tid, res] of Object.entries(ar.r)) {
      // Tentar obter data e idade base a partir do sufixo do tid
      const uskMatch = tid.match(/^(usk\d+)_b(\d+)$/);
      if (!uskMatch) continue; // ignorar tids sem sufixo _b{n} (ex: wjgc25, doral25)

      const base = uskTournNames.get(uskMatch[1]);
      if (!base?.dateExact) continue;

      const ageFromTid = parseInt(uskMatch[2]);
      let ageMin = ageFromTid;
      let ageMax = ageFromTid;

      // Refinar com ageGroup string se for exacto ("Boys 10" → 10)
      const exact = res.ageGroup ? parseExactAge(res.ageGroup) : null;
      if (exact != null) {
        ageMin = Math.max(ageMin, exact);
        ageMax = Math.min(ageMax, exact);
      }
      if (ageMin > ageMax || ageMin < 7 || ageMax > 18) continue;

      constraints.push({ dateExact: base.dateExact, ageMin, ageMax });
    }

    if (!constraints.length) return { dobLabel: null, ageGroupRange: null };

    // ── Step 2: intersectar todas as janelas ──
    // "Idade A no dia D" → birthday ∈ (D − (A+1) anos + 1 dia, D − A anos]
    let rangeMin: Date | null = null;
    let rangeMax: Date | null = null;

    for (const c of constraints) {
      const tDate = new Date(c.dateExact);
      const latest = new Date(tDate);
      latest.setFullYear(latest.getFullYear() - c.ageMin);
      const earliest = new Date(tDate);
      earliest.setFullYear(earliest.getFullYear() - c.ageMax - 1);
      earliest.setDate(earliest.getDate() + 1);

      const newMin = (!rangeMin || earliest > rangeMin) ? earliest : rangeMin;
      const newMax = (!rangeMax || latest  < rangeMax)  ? latest   : rangeMax;
      if (newMin <= newMax) { rangeMin = newMin; rangeMax = newMax; }
      // else: constraint conflituoso (provavelmente outro jogador com mesmo nome) — ignorar
    }

    if (!rangeMin || !rangeMax || rangeMin > rangeMax)
      return { dobLabel: null, ageGroupRange: null };

    // ── Step 3: apertar com transições de escalão ──
    const sorted = [...constraints].sort((a,b) => a.dateExact.localeCompare(b.dateExact));
    for (let i = 0; i < sorted.length - 1; i++) {
      const c1 = sorted[i], c2 = sorted[i+1];
      if (c2.ageMin - c1.ageMax === 1) {
        const transA = c1.ageMax + 1;
        const transLate = new Date(c2.dateExact);
        transLate.setFullYear(transLate.getFullYear() - transA);
        const transEarly = new Date(c1.dateExact);
        transEarly.setFullYear(transEarly.getFullYear() - transA);
        transEarly.setDate(transEarly.getDate() + 1);
        const tMin = transEarly > rangeMin ? transEarly : rangeMin;
        const tMax = transLate  < rangeMax ? transLate  : rangeMax;
        if (tMin <= tMax) { rangeMin = tMin; rangeMax = tMax; }
      }
    }

    // ── Step 4: formatar ──
    const minY = rangeMin.getFullYear(), maxY = rangeMax.getFullYear();
    const minM = rangeMin.getMonth(),    maxM = rangeMax.getMonth();
    const spanDays = Math.round((rangeMax.getTime() - rangeMin.getTime()) / 86400000);

    let dobLabel: string;
    if (spanDays <= 1) {
      dobLabel = `n. ${String(rangeMin.getDate()).padStart(2,"0")}/${String(rangeMin.getMonth()+1).padStart(2,"0")}/${rangeMin.getFullYear()}`;
    } else if (minY === maxY) {
      dobLabel = minM === maxM
        ? `n. ${MESES[minM]} ${minY}`
        : `n. ${MESES[minM]}–${MESES[maxM]} ${minY}`;
    } else {
      dobLabel = `n. ${MESES[minM]} ${minY} – ${MESES[maxM]} ${maxY}`;
    }

    // Range de escalões (mín → máx idade dos tids _b{n})
    const allAges = Object.keys(ar.r)
      .map(tid => tid.match(/^usk\d+_b(\d+)$/)?.[1])
      .filter(Boolean)
      .map(Number)
      .filter(n => n >= 7 && n <= 18);
    const minAg = allAges.length ? Math.min(...allAges) : null;
    const maxAg = allAges.length ? Math.max(...allAges) : null;
    const ageGroupRange = minAg && maxAg && minAg < maxAg
      ? `Boys ${minAg}→${maxAg}`
      : minAg ? `Boys ${minAg}` : null;

    return { dobLabel, ageGroupRange };
  }, [ar]);

  // ── Regularidade ──
  const { torneiosPorAno, anosActivo, anosComParticipacao, hiatos } = useMemo(() => {
    const firstYear = byYear.length ? byYear[byYear.length-1][0] : null;
    const lastYear  = byYear[0]?.[0] ?? null;
    if (!firstYear || !lastYear) return { torneiosPorAno: 0, anosActivo: 0, anosComParticipacao: 0, hiatos: [] as number[] };
    const anosActivo = lastYear - firstYear + 1;
    const anosComPart = byYear.length;
    const torneiosPorAno = +(wallOfFame.length / anosActivo).toFixed(1);
    const todosAnos = Array.from({length: anosActivo}, (_, i) => firstYear + i);
    const anosParticipou = new Set(byYear.map(([yr]) => yr));
    const hiatos = todosAnos.filter(yr => !anosParticipou.has(yr));
    return { torneiosPorAno, anosActivo, anosComParticipacao: anosComPart, hiatos };
  }, [byYear, wallOfFame]);

  // ── Torneios recorrentes (evolução no mesmo torneio) ──
  const torneiosRecorrentes = useMemo(() => {
    const map = new Map<string, typeof wallOfFame>();
    for (const e of wallOfFame) {
      // Chave SEM ano — para agrupar Marco Simone 2025 + Marco Simone 2026 juntos
      const canon = tornCanon(e.nome).replace(/-\d{2}$/, "");
      if (!map.has(canon)) map.set(canon, []);
      map.get(canon)!.push(e);
    }
    return [...map.entries()]
      .map(([canon, es]) => {
        // Deduplicar: mesmo torneio (mesmo nome + mesmo ano) → manter só a melhor entrada
        const dedupMap = new Map<string, typeof wallOfFame[0]>();
        for (const e of es) {
          const key = `${tornCanon(e.nome)}|${e.year}|${e.ageGroup}`;
          const ex = dedupMap.get(key);
          if (!ex || e.rondas > ex.rondas || (e.rondas === ex.rondas && e.tp != null && ex.tp == null))
            dedupMap.set(key, e);
        }
        return { canon, entries: [...dedupMap.values()].sort((a,b) => a.year - b.year || isoDate(a.date).localeCompare(isoDate(b.date))) };
      })
      .filter(g => g.entries.length >= 2)
      .sort((a,b) => b.entries.length - a.entries.length);
  }, [wallOfFame]);

  // ── V/E/D ──
  const { vitorias, empates, derrotas } = useMemo(() => {
    let v=0,e=0,d=0;
    // Perspectiva do RIVAL: V = rival ganhou (rival_pos < man_pos)
    for (const enc of directEnc) {
      if (enc.rival_pos < enc.man_pos) v++;
      else if (enc.rival_pos > enc.man_pos) d++;
      else e++;
    }
    return {vitorias:v,empates:e,derrotas:d};
  }, [directEnc]);

  const firstYear = byYear.length ? byYear[byYear.length-1][0] : null;
  const lastYear  = byYear[0]?.[0] ?? null;

  // ── Inscrições futuras ──
  const manuelInscTids = new Set(
    (fieldData?.torneios ?? [])
      .filter(t => t.escaloes.some(e=>(e.jogadores??[]).some(j=>isManuel(j.nome)&&j.pais==="PT")))
      .map(t=>t.t)
  );
  const inscricoesFuturas = useMemo(() => {
    if (!fieldData) return [];
    const rn = normNameAuto(nome);
    return fieldData.torneios.filter(t => {
      const iso = isoDate(t.date_inicio);
      return iso>=today && t.escaloes.some(e=>(e.jogadores??[]).some(j=>normNameAuto(j.nome)===rn));
    }).map(t => {
      const esc = t.escaloes.find(e=>(e.jogadores??[]).some(j=>normNameAuto(j.nome)===normNameAuto(nome)));
      const iso = isoDate(t.date_inicio);
      const diff = Math.round((new Date(iso).getTime()-new Date(today).getTime())/86400000);
      return {t:t.t,name:t.name,date:t.date_inicio,escalao:esc?.nome??"",daysAway:Math.max(0,diff),isCommon:manuelInscTids.has(t.t)};
    }).sort((a,b)=>isoDate(a.date).localeCompare(isoDate(b.date)));
  }, [fieldData,nome,today]);

  // ── Tendência ──
  const yearAvgs = byYear.map(([yr,es])=>({yr,avg:(es.filter(e=>e.pos!=null).map(e=>e.pos!).reduce((s,p,_,a)=>s+p/a.length,0))||null}));
  const trend = yearAvgs.length>=2&&yearAvgs[0].avg!=null&&yearAvgs[yearAvgs.length-1].avg!=null
    ? yearAvgs[0].avg<yearAvgs[yearAvgs.length-1].avg?"melhora":"piora" : null;

  const posLabel = (p:number|null|undefined) => p==null?"—":p===1?"🥇":p===2?"🥈":p===3?"🥉":`#${p}`;
  const tpFmt = (t:number|null|undefined,short=false) => t==null?(short?"—":"—"):t===0?"E":t>0?`+${t}`:`${t}`;
  const firstName = displayName(nome).split(" ")[0];

  // Pill helpers usando o sistema de classes da app
  const Pill = ({cls,style:st,children}:{cls?:string,style?:React.CSSProperties,children:React.ReactNode}) => (
    <span className={`p p-sm${cls?" "+cls:""}`} style={st}>{children}</span>
  );

  // ── Palmarès: pódio (pos 1/2/3) com contexto ──────────────────
  const palmares = useMemo(() =>
    wallOfFame
      .filter(e => e.pos != null && e.pos <= 3)
      .sort((a, b) => (a.pos ?? 9) - (b.pos ?? 9) || b.year - a.year || isoDate(b.date).localeCompare(isoDate(a.date))),
  [wallOfFame]);

  // ── Tipo de jogador (classificação automática) ────────────────
  const playerType = useMemo(() => {
    if (!stats) return null;
  const wins = palmares.filter(e => e.pos === 1).length;
    const avg  = stats.avgPos;
    const pct  = stats.avgPct;
    const tot  = stats.total;
    if (wins >= 3 && avg <= 4)                        return { label: "🏆 Elite",               bg: "var(--score-eagle)",       fg: "#fff" };
    if (wins >= 1 && avg <= 5)                        return { label: "⭐ Top Contender",        bg: "var(--medal-gold)",        fg: "#fff" };
    if (avg <= 8 && (pct == null || pct <= 25))       return { label: "🎯 Forte Competidor",    bg: "var(--color-good-dark)",   fg: "#fff" };
    if (trend === "melhora" && anosActivo <= 3)       return { label: "📈 Em Ascensão",          bg: "var(--color-info)",        fg: "#fff" };
    if (tot >= 20 && anosActivo >= 4)                 return { label: "🔁 Assíduo do Circuito", bg: "var(--text-dark)",         fg: "#fff" };
    if (avg <= 12 && tot >= 10)                       return { label: "✅ Consistente",          bg: "var(--accent)",            fg: "#fff" };
    return null;
  }, [stats, palmares, trend, anosActivo]);

  return (
    <div style={{maxWidth:920, paddingBottom:32}}>

      {/* Voltar */}
      <button onClick={goBack} className="btn" style={{
        display:"flex", alignItems:"center", gap:6,
        marginBottom:16, fontSize:13, fontWeight:600,
        color:"var(--accent)", background:"transparent", border:"none",
        padding:"6px 0", cursor:"pointer",
      }}>
        ◀ Todos os rivais
      </button>

      {/* ══ HERO CARD ══ */}
      <div className="card" style={{marginBottom:16, padding:0, overflow:"hidden", border:"1.5px solid var(--border-light)"}}>

        {/* Faixa de identidade */}
        <div style={{
          display:"flex", gap:16, alignItems:"flex-start",
          padding:"20px 22px 16px",
          background: playerType ? "linear-gradient(135deg, var(--bg-card) 60%, rgba(0,0,0,.03))" : "var(--bg-card)",
          borderBottom:"1px solid var(--border-light)",
        }}>
          {/* Flag grande */}
          <div style={{fontSize:56, lineHeight:1, flexShrink:0, marginTop:2}}>{flag(rival?.pais??ar?.co??"")}</div>

          {/* Nome + pills */}
          <div style={{flex:1, minWidth:0}}>
            <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:8}}>
              <div style={{fontSize:26, fontWeight:900, color:"var(--text)", lineHeight:1.1, letterSpacing:"-0.02em"}}>
                {displayName(nome)}
              </div>
              {playerType && (
                <span style={{
                  fontSize:12, fontWeight:800, padding:"3px 10px", borderRadius:20,
                  background:playerType.bg, color:playerType.fg,
                  letterSpacing:"0.02em", flexShrink:0,
                }}>
                  {playerType.label}
                </span>
              )}
              {ar && (
                <a href="/kids"
                  onClick={e => { e.preventDefault(); window.open(`/kids#${encodeURIComponent(ar.n)}`, "_blank"); }}
                  title="Ver perfil completo em Kids"
                  style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20,
                    background:"var(--bg-success-subtle)", color:"var(--color-good-dark)",
                    border:"1px solid var(--color-good)", textDecoration:"none", flexShrink:0 }}>
                  ↗ Kids
                </a>
              )}
            </div>
            <div style={{display:"flex", gap:5, flexWrap:"wrap", alignItems:"center"}}>
              {(rival?.pais||ar?.co) && <Pill cls="p-muted" style={{fontSize:12}}>{normPaisDisplay(rival?.pais||ar?.co||"")}</Pill>}
              {dobLabel && <Pill style={{background:"var(--bg-info)", color:"var(--color-info)", fontWeight:700, fontSize:12}}>{dobLabel}</Pill>}
              {/* Escalão actual: pill com o grupo mais recente detectado */}
              {ageGroupRange && (
                <Pill style={{
                  background:"var(--bg-topbar)", color:"var(--text-inv)", fontWeight:700, fontSize:12,
                }}>
                  {ageGroupRange}
                </Pill>
              )}
              {firstYear && <Pill cls="p-muted" style={{fontSize:12}}>desde {firstYear}</Pill>}
              {anosActivo>1 && <Pill cls="p-muted" style={{fontSize:12}}>{anosActivo} anos activo</Pill>}
              {hiatos.length>0 && <Pill style={{background:"var(--bg-warn)", color:"var(--color-warn-dark)", fontSize:12}}>pausa {hiatos.join(", ")}</Pill>}
              {trend && <Pill style={{background:trend==="melhora"?"var(--bg-success-subtle)":"var(--bg-danger-strong)", color:trend==="melhora"?"var(--color-good-dark)":"var(--color-danger-vivid)", fontWeight:800, fontSize:12}}>{trend==="melhora"?"↑ a melhorar":"↓ a piorar"}</Pill>}
            </div>
            {/* Palmarès compacto inline — top-3, com nome do torneio */}
            {palmares.length > 0 && (
              <div style={{display:"flex", alignItems:"flex-start", gap:4, marginTop:8, flexWrap:"wrap"}}>
                {palmares.slice(0, 5).map((e, i) => {
                  const tornNome = e.nome.replace(/\s*\d{4}$/, "").replace(/\s*'\d{2}$/, "");
                  const medal = e.pos===1?"🥇":e.pos===2?"🥈":"🥉";
                  const bg = e.pos===1?"#fffbea":e.pos===2?"#f0f4ff":"#fff4f0";
                  const border = e.pos===1?"var(--medal-gold)":e.pos===2?"var(--medal-silver)":"var(--medal-bronze)";
                  return (
                    <div key={i} title={`${tornNome} ${e.year}`} style={{
                      display:"inline-flex", alignItems:"center", gap:4,
                      padding:"3px 7px", borderRadius:6,
                      background:bg, border:`1px solid ${border}`, flexShrink:0,
                    }}>
                      <span style={{fontSize:13}}>{medal}</span>
                      <div style={{lineHeight:1.2}}>
                        <div style={{fontSize:10, fontWeight:700, color:"var(--color-warn-dark)", maxWidth:90, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{tornNome}</div>
                        <div style={{fontSize:9, color:"var(--text-3)"}}>{e.year}</div>
                      </div>
                    </div>
                  );
                })}
                {palmares.length > 5 && (
                  <div style={{display:"inline-flex", alignItems:"center", gap:3, padding:"3px 8px", borderRadius:6, background:"var(--bg-warn-strong)", border:"1px solid var(--medal-gold)"}}>
                    <span style={{fontSize:11, fontWeight:800, color:"var(--color-warn-dark)"}}>+{palmares.length - 5}</span>
                    <span style={{fontSize:11}}>🏆</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* V/E/D vs Manuel */}
          <div style={{flexShrink:0, textAlign:"center"}}>
            <div style={{fontSize:11, fontWeight:700, color:"var(--text-3)", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em"}}>vs Manuel</div>
            <div style={{display:"flex", gap:5, marginBottom:5}}>
              {([
                {n:vitorias, bg:"var(--bg-success-strong)", co:"var(--color-good-dark)", l:"V"},
                {n:empates,  bg:"var(--bg-muted)",          co:"var(--text-2)",           l:"E"},
                {n:derrotas, bg:"var(--bg-danger-strong)",  co:"var(--color-danger-vivid)", l:"D"},
              ] as const).map(({n,bg,co,l})=>(
                <div key={l} style={{textAlign:"center", minWidth:46, padding:"10px 6px", background:bg, borderRadius:10}}>
                  <div style={{fontSize:28, fontWeight:900, color:co, lineHeight:1}}>{n}</div>
                  <div style={{fontSize:11, fontWeight:700, color:co, marginTop:2, opacity:.75}}>{l}</div>
                </div>
              ))}
            </div>
            {directEnc.length > 0 && (
              <div style={{fontSize:11, color:"var(--text-3)"}}>
                {directEnc.length} confronto{directEnc.length!==1?"s":""}
              </div>
            )}
          </div>
        </div>

        {/* KPI grid — números grandes */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(110px, 1fr))"}}>
          {[
            {v: String(stats?.total ?? wallOfFame.length),               l:"torneios",           accent:false},
            {v: String(palmares.filter(e => e.pos === 1).length || "0"),          l:"vitórias 🥇",       accent: palmares.some(e => e.pos === 1)},
            {v: stats?.best!=null ? posLabel(stats.best) : "—",          l:"melhor resultado",   accent:stats?.best!=null && stats.best<=3},
            {v: stats ? `${Math.round(stats.avgPos)}º` : "—",
             sub: stats?.avgFieldSize!=null ? `em ~${stats.avgFieldSize}` : null,
             l:"posição média",    accent:false},
            {v: stats?.avgPct!=null ? `top ${stats.avgPct}%` : "—",      l:"percentil médio",    accent:stats?.avgPct!=null && stats.avgPct<=25},
            {v: torneiosPorAno>0 ? torneiosPorAno.toFixed(1) : "—",      l:"torn./ano",          accent:false},
            {v: stats?.vsFieldTrimmed!=null ? (stats.vsFieldTrimmed>0?"+":"")+stats.vsFieldTrimmed : "—",
             l:"vs campo",         accent:stats?.vsFieldTrimmed!=null && stats.vsFieldTrimmed<-1,
             tip:"Score médio comparado com a mediana do field (aparado 10%)"},
          ].map(({v,l,accent,sub,tip}:{v:string,l:string,accent:boolean,sub?:string|null,tip?:string}, i, arr)=>(
            <div key={l} title={tip} style={{
              padding:"14px 10px", textAlign:"center",
              borderRight: i<arr.length-1 ? "1px solid var(--border-light)" : "none",
              borderTop:"1px solid var(--border-light)",
              background:"var(--bg-card)",
              cursor:tip?"help":"default",
            }}>
              <div style={{fontSize:24, fontWeight:900, color:accent?"var(--color-good-dark)":"var(--text)", lineHeight:1}}>{v}</div>
              {sub && <div style={{fontSize:11, color:"var(--text-3)", marginTop:2}}>{sub}</div>}
              <div style={{fontSize:12, color:"var(--text-3)", marginTop:5, fontWeight:500}}>{l}</div>
            </div>
          ))}
        </div>

        {/* Confrontos directos — linha de contexto */}
        {directEnc.length>0 && (
          <div style={{padding:"10px 20px", background:"var(--accent-light)", borderTop:"1px solid var(--accent-alpha-20)", display:"flex", gap:20, flexWrap:"wrap", fontSize:13, color:"var(--text-2)"}}>
            <span>
              Confrontos directos ({directEnc.length}): &nbsp;
              <strong style={{color:"var(--text)"}}>{firstName}</strong> média <strong style={{color:vitorias>derrotas?"var(--color-good-dark)":"var(--color-danger-vivid)"}}>{Math.round(directEnc.reduce((s,e)=>s+e.rival_pos,0)/directEnc.length)}º</strong>
              &nbsp;·&nbsp;
              <strong style={{color:"var(--text)"}}>Manuel</strong> média <strong>{Math.round(directEnc.reduce((s,e)=>s+e.man_pos,0)/directEnc.length)}º</strong>
            </span>
            {stats && <span>Top-3: <strong style={{color:"var(--text)"}}>{stats.top3}/{stats.total}</strong></span>}
            {anosComParticipacao>0 && <span>Activo em <strong style={{color:"var(--text)"}}>{anosComParticipacao}/{anosActivo}</strong> anos</span>}
            {(()=>{
              const difs=directEnc.filter(e=>e.man_to_par!=null&&e.rival_to_par!=null).map(e=>(e.rival_to_par??0)-(e.man_to_par??0));
              if(!difs.length) return null;
              const avg=difs.reduce((s,d)=>s+d,0)/difs.length;
              return <span>Dif. to-par: <strong style={{color:avg>0?"var(--color-good-dark)":"var(--color-danger-vivid)"}}>{avg>0?"+":""}{avg.toFixed(1)}</strong></span>;
            })()}
          </div>
        )}
      </div>

      {/* ══ PALMARÈS ══ */}
      {palmares.length > 0 && (
        <div className="card" style={{marginBottom:16, padding:"14px 16px"}}>
          <div className="h-md" style={{marginBottom:12, display:"flex", alignItems:"center", gap:10}}>
            🏆 Palmarès
            <span style={{fontSize:13, fontWeight:400, color:"var(--text-3)"}}>
              {palmares.filter(e=>e.pos===1).length} 🥇
              {palmares.filter(e=>e.pos===2).length > 0 && ` · ${palmares.filter(e=>e.pos===2).length} 🥈`}
              {palmares.filter(e=>e.pos===3).length > 0 && ` · ${palmares.filter(e=>e.pos===3).length} 🥉`}
            </span>
          </div>
          <div style={{display:"flex", flexWrap:"wrap", gap:5}}>
            {palmares.map((e, i) => {
              const tornNome = e.nome.replace(/\s*\d{4}$/, "").replace(/\s*'\d{2}$/, "");
              const tpStr = e.tp != null ? (e.tp === 0 ? "E" : e.tp > 0 ? `+${e.tp}` : `${e.tp}`) : null;
              const medal = e.pos===1?"🥇":e.pos===2?"🥈":"🥉";
              const bg = e.pos===1?(e.isDirectConfronto?"var(--bg-warn-strong)":"#fffbea"):e.pos===2?"#f0f4ff":"#fff4f0";
              const border = e.pos===1?(e.isDirectConfronto?"var(--color-amber)":"var(--medal-gold)"):e.pos===2?"var(--medal-silver)":"var(--medal-bronze)";
              const textColor = e.pos===1?"var(--color-warn-dark)":e.pos===2?"var(--color-info)":"var(--medal-bronze)";
              return (
                <div key={i} style={{
                  display:"flex", alignItems:"center", gap:6,
                  padding:"6px 10px", borderRadius:7,
                  background:bg, border:`1px solid ${border}`,
                  minWidth:110, maxWidth:175,
                }}>
                  <div style={{fontSize:20, lineHeight:1, flexShrink:0}}>{medal}</div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:11, fontWeight:700, color:textColor, marginBottom:1, lineHeight:1.2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                      {tornNome}
                    </div>
                    <div style={{fontSize:10, color:"var(--text-2)", fontWeight:500}}>
                      {e.year}
                      {e.ageGroup && <span style={{marginLeft:4, color:"var(--text-3)", fontWeight:400}}>{e.ageGroup}</span>}
                      {tpStr && <span style={{marginLeft:4, color:"var(--color-good-dark)", fontWeight:700}}>{tpStr}</span>}
                    </div>
                    {e.isDirectConfronto && e.pos === 1 && <div style={{fontSize:9, color:"var(--color-warn-vivid)", fontWeight:700}}>⚔️ vs Manuel</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ TORNEIOS RECORRENTES ══ */}
      {torneiosRecorrentes.length>0 && (
        <div style={{marginBottom:16}}>
          <div className="h-md" style={{marginBottom:10}}>
            Evolução por torneio
            <span className="muted fs-11 fw-400" style={{marginLeft:8}}>torneios com 2+ participações</span>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px,1fr))", gap:6}}>
            {torneiosRecorrentes.map(({canon,entries:es})=>{
              const nomeBase = es[0].nome.replace(/\s*'\d\d$/,"").replace(/\s*\d{4}$/,"");
              const hasPodium = es.some(e => e.pos != null && e.pos <= 3);
              const podiumBorder = es.some(e=>e.pos===1)?"var(--medal-gold)":es.some(e=>e.pos===2)?"var(--medal-silver)":es.some(e=>e.pos===3)?"var(--medal-bronze)":undefined;
              const manyEntries = es.length > 5;
              return(
                <div key={canon} className="card" style={{padding:"8px 12px", borderLeft: podiumBorder ? `3px solid ${podiumBorder}` : undefined, margin:0}}>
                  <div style={{fontSize:12, fontWeight:700, color:"var(--text)", marginBottom:5, display:"flex", alignItems:"center", gap:4}}>
                    {hasPodium && <span style={{fontSize:12}}>{es.find(e=>e.pos===1)?"🏆":es.find(e=>e.pos===2)?"🥈":"🥉"}</span>}
                    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{nomeBase}</span>
                    <span className="muted fs-10 fw-400" style={{flexShrink:0}}>{es.length}×</span>
                  </div>
                  <div style={{overflowX:"auto", paddingBottom:1}}>
                    <div style={{display:"flex", gap:3, flexWrap:"nowrap", alignItems:"center"}}>
                      {es.map((e,i)=>{
                        const prev=es[i-1];
                        const delta=prev&&e.pos!=null&&prev.pos!=null?e.pos-prev.pos:null;
                        const medal = e.pos===1?"🥇":e.pos===2?"🥈":e.pos===3?"🥉":null;
                        const posColor = e.pos===1?"var(--color-warn-dark)":e.pos!=null&&e.pos<=3?"var(--medal-silver)":e.pos!=null&&e.pos<=8?"var(--text)":"var(--text-3)";
                        const posBg = e.pos===1?"#fffbea":e.pos===2?"#f0f4ff":e.pos===3?"#fff4f0":"var(--bg-detail)";
                        const borderColor = e.pos===1?"var(--medal-gold)":e.pos===2?"var(--medal-silver)":e.pos===3?"var(--medal-bronze)":"var(--border-light)";
                        return(
                          <React.Fragment key={e.tid}>
                            {i>0 && (
                              <span style={{fontSize:10, fontWeight:800, color:delta!=null&&delta<0?"var(--color-good-dark)":delta!=null&&delta>0?"var(--color-danger-vivid)":"var(--text-3)", flexShrink:0}}>
                                {delta!=null&&delta<0?"↑":delta!=null&&delta>0?"↓":"="}
                              </span>
                            )}
                            <div style={{display:"flex", flexDirection:"column", alignItems:"center", gap:0, padding:"3px 5px", borderRadius:4, background:posBg, border:`1px solid ${borderColor}`, flexShrink:0}}>
                              <span style={{fontSize:9, color:"var(--text-3)", fontWeight:500, lineHeight:1.3}}>{e.year}</span>
                              <span style={{fontSize:medal?13:11, fontWeight:900, color:posColor, lineHeight:1}}>
                                {medal ?? (e.pos!=null?`#${e.pos}`:"—")}
                              </span>
                              {e.tp!=null && <span style={{fontSize:9, color:e.tp<=0?"var(--color-good-dark)":"var(--text-3)", fontWeight:600, lineHeight:1.3}}>{e.tp>0?"+":""}{e.tp}</span>}
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ INSCRIÇÕES FUTURAS ══ */}
      {inscricoesFuturas.length>0 && (
        <div style={{marginBottom:16}}>
          <div className="h-md" style={{marginBottom:10}}>
            Inscrições futuras <Pill cls="p-muted" style={{fontWeight:400,marginLeft:4}}>{inscricoesFuturas.length}</Pill>
          </div>
          <div className="card" style={{padding:0, overflow:"hidden"}}>
            {inscricoesFuturas.map((t,i)=>(
              <div key={t.t} style={{display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom:i<inscricoesFuturas.length-1?"1px solid var(--border-light)":"none", background:t.isCommon?"var(--bg-success)":"transparent"}}>
                <Pill style={{background:t.daysAway===0?"var(--bg-success-strong)":t.daysAway<=7?"var(--bg-warn-strong)":"var(--bg-muted)", color:t.daysAway===0?"var(--color-good-dark)":t.daysAway<=7?"var(--color-warn-dark)":"var(--text-3)", minWidth:64, justifyContent:"center", fontSize:12, fontWeight:700}}>
                  {t.daysAway===0?"hoje":`em ${t.daysAway}d`}
                </Pill>
                <span style={{flex:1, fontSize:14, fontWeight:t.isCommon?700:500, color:"var(--text)"}}>{t.name.replace(/\s*\d{4}$/,"")}</span>
                <Pill cls="p-muted" style={{fontSize:12}}>{t.escalao}</Pill>
                {t.isCommon && <Pill style={{background:"var(--color-good)", color:"#fff", fontSize:12, fontWeight:700}}>∩ Manuel</Pill>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ WALL OF FAME ══ */}
      <div style={{marginBottom:20}}>
        <div className="h-md" style={{marginBottom:10, display:"flex", alignItems:"baseline", gap:8}}>
          Histórico completo
          <Pill cls="p-muted" style={{fontWeight:400}}>{wallOfFame.length} torneios{firstYear&&lastYear?` · ${lastYear}→${firstYear}`:""}</Pill>
          <span className="muted fs-11 fw-400">borda azul = encontrou o Manuel</span>
        </div>
        <div style={{border:"1px solid var(--border-light)",borderRadius:10,overflow:"hidden"}}>
          {byYear.length===0&&<div style={{padding:"24px",color:"var(--text-3)",fontSize:13,textAlign:"center"}}>Sem dados</div>}
          {byYear.map(([yr,entries],yi)=>{
            const ps=entries.filter(e=>e.pos!=null).map(e=>e.pos!);
            const tps=entries.filter(e=>e.tp!=null).map(e=>e.tp!);
            const yrBest=ps.length?Math.min(...ps):null;
            const yrAvgPos=ps.length?+(ps.reduce((s,p)=>s+p,0)/ps.length).toFixed(1):null;
            const yrAvgTp=tps.length?+(tps.reduce((s,t)=>s+t,0)/tps.length).toFixed(1):null;
            const prevPs=byYear[yi+1]?.[1].filter(e=>e.pos!=null).map(e=>e.pos!)??[];
            const prevAvg=prevPs.length?prevPs.reduce((s,p)=>s+p,0)/prevPs.length:null;
            const improving=yrAvgPos!=null&&prevAvg!=null?yrAvgPos<prevAvg:null;
            const ageGrp=entries.find(e=>e.ageGroup)?.ageGroup??"";
            const n=entries.length;
            return(
              <React.Fragment key={yr}>
                {/* Cabeçalho de ano */}
                <div style={{padding:"10px 14px",background:"var(--bg-muted)",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:yi>0?"1px solid var(--border-light)":"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:16,fontWeight:800,color:"var(--text)"}}>{yr}</span>
                    {ageGrp&&<span style={{fontSize:12,color:"var(--text-2)"}}>{ageGrp}</span>}
                    {firstYear===yr&&<Pill style={{background:"var(--bg-warn-strong)",color:"var(--color-warn-dark)"}}>estreia</Pill>}
                    {yr===new Date().getFullYear()&&<Pill style={{background:"var(--bg-success-strong)",color:"var(--color-good-dark)"}}>em curso</Pill>}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <Pill style={{background:n>=7?"var(--bg-info)":n>=4?"var(--bg-warn-strong)":"var(--bg-muted)",color:n>=7?"var(--color-info)":n>=4?"var(--color-warn-dark)":"var(--text-3)"}}>{n} torn.</Pill>
                    {yrBest!=null&&<Pill style={{background:"var(--bg-success-subtle)",color:"var(--color-good-dark)"}}>melhor: {posLabel(yrBest)}</Pill>}
                    {yrAvgPos!=null&&<span style={{fontSize:11,color:"var(--text-3)"}}>avg {yrAvgPos}º</span>}
                    {yrAvgTp!=null&&<span style={{fontSize:12,fontWeight:700,color:yrAvgTp<=0?"var(--color-good-dark)":"var(--text-3)"}}>{yrAvgTp>0?"+":""}{yrAvgTp}</span>}
                    {improving!=null&&<span style={{fontSize:15,fontWeight:800,color:improving?"var(--color-good-dark)":"var(--color-danger-vivid)"}}>{improving?"↑":"↓"}</span>}
                  </div>
                </div>
                {/* Coluna header (só no primeiro ano) */}
                {yi===0&&<div style={{display:"grid",gridTemplateColumns:"38px 82px 1fr 70px 22px 64px 56px",fontSize:10,color:"var(--text-3)",padding:"4px 14px",background:"var(--bg-card)",borderBottom:".5px solid var(--border-light)"}}>
                  <span style={{textAlign:"center"}}>Pos.</span>
                  <span>Data</span>
                  <span>Torneio · jogadores</span>
                  <span style={{textAlign:"center"}}>Escalão</span>
                  <span style={{textAlign:"center"}}>R</span>
                  <span style={{textAlign:"right"}}>Score · top%</span>
                  <span style={{textAlign:"center"}}>vs campo</span>
                </div>}
                {/* Torneios */}
                {entries.map((e,ei)=>{
                  const isTop3=e.pos!=null&&e.pos<=3;
                  const opac=e.pos==null?0.45:1;
                  const vsWinner=e.tp!=null&&e.winnerTp!=null?e.tp-e.winnerTp:null;
                  const vsMedian=e.tp!=null&&e.medianTp!=null?e.tp-e.medianTp:null;
                  const dateStr = e.date ? fmtDate(e.date) : null;
                  return(
                    <div key={e.tid} style={{display:"grid",gridTemplateColumns:"38px 82px 1fr 70px 22px 64px 56px",alignItems:"center",padding:"8px 14px",borderBottom:ei<entries.length-1?".5px solid var(--border-light)":"none",
                      background:e.isDirectConfronto?"var(--accent-alpha-10)":e.withManuel?"var(--accent-alpha-10)":"transparent",
                      borderLeft:e.isDirectConfronto?"3px solid var(--accent)":e.withManuel?"3px solid var(--accent-alpha-20)":"3px solid transparent",
                      opacity:opac}}>
                      {/* Pos */}
                      <div style={{textAlign:"center"}}>
                        {isTop3?<span style={{fontSize:20}}>{e.pos===1?"🥇":e.pos===2?"🥈":"🥉"}</span>:<span style={{fontSize:12,fontWeight:600,color:"var(--text-3)"}}>#{e.pos??""}</span>}
                      </div>
                      {/* Data — só dia/mês */}
                      <div style={{fontSize:11,color:"var(--text-3)",lineHeight:1.3}}>
                        {dateStr
                          ? (() => {
                              const parts = dateStr.split(" ");
                              return <><span style={{fontWeight:600,color:"var(--text-2)"}}>{parts[0]}</span> {parts[1]}</>;
                            })()
                          : <span style={{opacity:.4}}>—</span>}
                      </div>
                      {/* Nome + contexto */}
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:13,fontWeight: (e.fieldSize??0)>=15 ? 800 : 700,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>
                          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.nome.replace(/\s*\d{4}$/,"")}</span>
                          {(() => {
                            const m = e.tid.match(/^usk(\d+)/);
                            if (!m) return null;
                            const url = `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${m[1]}`;
                            return (
                              <a href={url} target="_blank" rel="noopener noreferrer"
                                onClick={ev => ev.stopPropagation()}
                                style={{flexShrink:0,fontSize:10,color:"var(--accent)",opacity:.6,textDecoration:"none",lineHeight:1}}
                                title="Ver resultados no signupanytime">
                                ↗
                              </a>
                            );
                          })()}
                        </div>
                        <div style={{fontSize:10,marginTop:1,display:"flex",alignItems:"center",gap:4}}>
                          {e.fieldSize!=null
                            ? <span style={{
                                color: (e.fieldSize)>=15 ? "var(--accent)" : "var(--text-3)",
                                fontWeight: (e.fieldSize)>=15 ? 700 : 400,
                              }}>
                                {(e.fieldSize)>=15 && "⭐ "}{e.fieldSize} jog.
                              </span>
                            : <span style={{opacity:.4,color:"var(--text-3)"}}>campo desconhecido</span>}
                        </div>
                        {e.withManuel&&!e.isDirectConfronto&&<div style={{fontSize:10,color:"var(--accent)",opacity:.7,marginTop:1}}>∩ Manuel jogou neste torneio</div>}
                        {e.isDirectConfronto&&e.manPos!=null&&e.rivalPos!=null&&<div style={{fontSize:11,color:"var(--accent)",fontWeight:600,marginTop:1}}>∩ Manuel {e.manPos}º · {firstName} {e.rivalPos}º</div>}
                      </div>
                      {/* Escalão */}
                      <div style={{textAlign:"center"}}><Pill cls="p-muted" style={{fontSize:10}}>{e.ageGroup||"—"}</Pill></div>
                      {/* Rondas */}
                      <span style={{fontSize:11,color:"var(--text-3)",textAlign:"center"}}>{e.rondas}</span>
                      {/* To-par + percentil juntos */}
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:13,fontWeight:700,color:e.tp==null?"var(--text-3)":e.tp<0?"var(--color-good-dark)":e.tp>0?"var(--text-2)":"var(--text-3)"}}>{tpFmt(e.tp)}</div>
                        {e.percentile!=null&&<div style={{fontSize:10,fontWeight:600,color:e.percentile<=10?"var(--color-good-dark)":e.percentile<=25?"var(--color-good)":"var(--text-3)",marginTop:1}}>top {e.percentile}%</div>}
                      </div>
                      {/* vs campo */}
                      <div style={{textAlign:"center",fontSize:10,color:"var(--text-3)"}}>
                        {vsWinner!=null&&<div style={{color:vsWinner===0?"var(--color-good-dark)":"var(--text-3)"}}>W: {vsWinner===0?"=":(vsWinner>0?"+":"")+vsWinner}</div>}
                        {vsMedian!=null&&<div style={{color:vsMedian<0?"var(--color-good-dark)":vsMedian>0?"var(--color-danger-vivid)":"var(--text-3)"}}>Med: {vsMedian===0?"=":(vsMedian>0?"+":"")+vsMedian}</div>}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ══ HEAD-TO-HEAD ══ */}
      {directEnc.length>0&&(
        <div>
          <div className="h-md" style={{marginBottom:8,display:"flex",alignItems:"baseline",gap:8}}>
            Head-to-head
            <span style={{fontSize:12,fontWeight:400,color:"var(--text-3)"}}>
              {directEnc.length} confronto{directEnc.length!==1?"s":""}
            </span>
            {/* Score explícito: X vitórias de cada lado */}
            <span style={{fontSize:13,fontWeight:700,display:"flex",gap:6,alignItems:"center"}}>
              <span style={{color:vitorias>derrotas?"var(--color-good-dark)":"var(--text-3)"}}>{firstName} {vitorias}×</span>
              <span style={{color:"var(--text-3)",fontWeight:400}}>vs</span>
              <span style={{color:derrotas>vitorias?"var(--color-good-dark)":"var(--text-3)"}}>Manuel {derrotas}×</span>
            </span>
          </div>
          <div style={{border:"1px solid var(--border-light)",borderRadius:10,overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 56px 72px 72px 44px 96px",fontSize:11,fontWeight:600,color:"var(--text-3)",background:"var(--bg-muted)",padding:"7px 14px",borderBottom:"1px solid var(--border-light)"}}>
              <span>Torneio</span><span style={{textAlign:"center"}}>Escalão</span>
              <span style={{textAlign:"center"}}>Manuel</span><span style={{textAlign:"center"}}>{firstName}</span>
              <span style={{textAlign:"center"}}>Dif.</span><span style={{textAlign:"right"}}>Vencedor</span>
            </div>
            {directEnc.map((e,i)=>{
              const rivalWon = e.rival_pos < e.man_pos;
              const draw = e.man_pos === e.rival_pos;
              const dif = e.man_to_par!=null&&e.rival_to_par!=null ? e.man_to_par - e.rival_to_par : null;
              const isNext = torneiosComManuel.some(t=>tornCanon(t.name)===tornCanon(e.torneio_nome)&&isoDate(t.date_inicio)>=today);
              return(
                <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 56px 72px 72px 44px 96px",alignItems:"center",padding:"9px 14px",fontSize:12,borderBottom:i<directEnc.length-1?".5px solid var(--border-light)":"none",
                  background:rivalWon?"rgba(22,163,74,.04)":isNext?"rgba(59,130,246,.04)":i%2===1?"rgba(0,0,0,.013)":"transparent"}}>
                  <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    <span style={{color:"var(--text)",fontWeight:500}}>{e.torneio_nome.replace(/\s*\d{4}$/,"")}{e.torneio_data?` '${isoDate(e.torneio_data).slice(2,4)}`:""}</span>
                    {isNext&&<Pill cls="" style={{marginLeft:6,background:"var(--bg-info)",color:"var(--color-info)"}}>próx.</Pill>}
                  </div>
                  <div style={{textAlign:"center"}}><Pill cls="p-muted" style={{fontSize:10}}>{e.escalao?.replace(/Boys /,"B").replace(/Girls /,"G")??"—"}</Pill></div>
                  {/* Manuel: verde quando Manuel ganhou */}
                  <div style={{textAlign:"center"}}>
                    <span style={{fontWeight:700,fontSize:13,color:!rivalWon&&!draw?"var(--color-good-dark)":"var(--text-2)"}}>{e.man_pos}º</span>
                    {e.man_to_par!=null&&<span style={{fontSize:11,color:"var(--text-3)",marginLeft:3}}>{tpFmt(e.man_to_par)}</span>}
                  </div>
                  {/* Rival: verde quando rival ganhou */}
                  <div style={{textAlign:"center"}}>
                    <span style={{fontWeight:700,fontSize:13,color:rivalWon?"var(--color-good-dark)":"var(--text-2)"}}>{e.rival_pos}º</span>
                    {e.rival_to_par!=null&&<span style={{fontSize:11,color:"var(--text-3)",marginLeft:3}}>{tpFmt(e.rival_to_par)}</span>}
                  </div>
                  {/* Dif: positivo = rival melhor */}
                  <div style={{textAlign:"center",fontWeight:800,fontSize:14,color:dif==null?"var(--text-3)":dif>0?"var(--color-good-dark)":dif<0?"var(--color-danger-vivid)":"var(--text-3)"}}>{dif==null?"—":dif>0?"+"+dif:dif===0?"=":dif}</div>
                  {/* Vencedor — explícito, sem ambiguidade */}
                  <div style={{textAlign:"right"}}>
                    {isNext
                      ? <Pill style={{background:"var(--bg-info)",color:"var(--color-info)"}}>inscrito</Pill>
                      : rivalWon
                        ? <Pill style={{background:"var(--bg-success-strong)",color:"var(--color-good-dark)",fontWeight:700}}>✓ {firstName}</Pill>
                        : draw
                          ? <Pill cls="p-muted">empate</Pill>
                          : <Pill style={{background:"var(--bg-danger-strong)",color:"var(--color-danger-vivid)",fontWeight:700}}>✓ Manuel</Pill>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
  const location = useLocation();
  const locationRival = (location.state as any)?.rival as string | undefined;
  const [searchParams, setSearchParams] = useSearchParams();

  const VALID_TABS: Tab[] = ["campo", "resultados", "rivais"];
  const paramTab = searchParams.get("tab") as Tab | null;

  const [fieldData,   setFieldData]   = useState<FieldData | null>(null);
  const [resultsData, setResultsData] = useState<ResultsData | null>(null);
  const [intlData,    setIntlData]    = useState<IntlData | null>(null); void setIntlData;
  const [autoRivals,  setAutoRivals]  = useState<AutoRivalPlayer[]>([]);
  const [greatgolfData, setGreatgolfData] = useState<GreatgolfData | null>(null); void setGreatgolfData;
  const [memberHist,   setMemberHist]   = useState<MemberHistData | null>(null);

  // Mapa leve nome→nTorneios — substitui memberHist nas props
  const mhCountMap = useMemo<Map<string, number>>(() => {
    const m = new Map<string, number>();
    if (!memberHist) return m;
    for (const mh of Object.values(memberHist.jogadores)) {
      if (!mh.name || mh.name === '?' || String(mh.name).startsWith('[unknown')) continue;
      m.set(mh.name.toLowerCase().trim(), Object.keys(mh.torneios).length);
    }
    return m;
  }, [memberHist]);
  const [tab, setTabState] = useState<Tab>(() => {
    if (paramTab && VALID_TABS.includes(paramTab)) return paramTab;
    if (locationRival) return "rivais";
    return "campo";
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set("tab", t); return n; }, { replace: true });
  };
    const md = useMasterDetail();
  const [filterManuel, setFilterManuel] = useState(true);
  const [sidebarRivalSearch, setSidebarRivalSearch] = useState("");
  const [sidebarRivalSort, setSidebarRivalSort] = useState<"torn" | "enc" | "name">("torn");
  const [sidebarRivalTier, setSidebarRivalTier] = useState<string>("");
  const [rivalFilters, setRivalFilters] = useState<{
    pais: string;
    escaloes: Set<string>;   // multi-select: "9","10","11","12","13"
    apenasCruzaram: boolean;
    apenasProximoTourn: boolean;
    minTorneios: number;
    maxNascimento: number;
    minNascimento: number;
  }>({ pais: "", escaloes: new Set(), apenasCruzaram: false, apenasProximoTourn: false, minTorneios: 0, maxNascimento: 0, minNascimento: 0 });
  const [erro,        setErro]        = useState<string | null>(null);

  // selectedT e selectedRival sincronizados com URL params (?t=&rival=)
  const paramT = searchParams.get("t");
  const paramRival = searchParams.get("rival");
  const [selectedT,     setSelectedTState]    = useState<number | null>(paramT ? (parseInt(paramT) || null) : null);
  const [selectedRival, setSelectedRivalState] = useState<string | null>(locationRival ?? paramRival ?? null);

  const setSelectedT = (t: number | null) => {
    setSelectedTState(t);
    setSearchParams(prev => { const n = new URLSearchParams(prev); if (t != null) n.set("t", String(t)); else n.delete("t"); return n; }, { replace: true });
  };
  const setSelectedRival = (r: string | null | ((prev: string | null) => string | null)) => {
    const next = typeof r === "function" ? r(selectedRival) : r;
    setSelectedRivalState(next);
    setSearchParams(prev => { const n = new URLSearchParams(prev); if (next) n.set("rival", next); else n.delete("rival"); return n; }, { replace: true });
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

    // Carregar member history (slim — cachedFetchJson partilha cache com KIDSdataLoader)
    cachedFetchJson("/data/uskids-member-history-slim.json")
      .then(d => setMemberHist(d as MemberHistData))
      .catch(() => {});
  }, []);

  const nResultados = resultsData?.resultados?.length ?? 0;

  // Sidebar rivals — populated by TabRivais via callback (avoids duplicate buildRivalsFromResultados)
  type SidebarRival = {
    nome: string; pais: string; nEnc: number;
    vitorias: number; derrotas: number; empates: number;
    totalTournaments: number; firstYear: number | null;
    nextTournName: string | null; daysToNext: number | null; nextIsCommon: boolean;
    playerTier?: "elite" | "contender" | "forte" | "subindo" | "assiduo" | "consistente" | null;
  };
  const [sidebarRivals, setSidebarRivals] = useState<SidebarRival[]>([]);
  const onRivalsReady = useCallback((list: SidebarRival[]) => {
    setSidebarRivals(list);
  }, []);

  // nRivais: só mostrar quando sidebarRivals já foi calculado (valor real)
  // Evita o flash 1700 → 498 durante o carregamento
  const nRivais = sidebarRivals.length > 0 ? sidebarRivals.length : null;

  const torneiosCampo = useMemo(() => fieldData?.torneios ?? [], [fieldData]);
  const torneiosResultados = useMemo(() => resultsData?.resultados ?? [], [resultsData]);

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

  // Pré-computar escalão máximo por rival — evita autoRivals.find() dentro de renderItem (era O(n²))
  const escalaoMap = useMemo<Map<string, number | null>>(() => {
    const m = new Map<string, number | null>();
    for (const a of autoRivals) {
      const ages = Object.keys(a.r)
        .map(tid => tid.match(/^usk\d+_b(\d+)$/)?.[1])
        .filter(Boolean).map(Number);
      m.set(normNameAuto(a.n), ages.length ? Math.max(...ages) : null);
    }
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
    // Seleccionar o primeiro torneio disponível para a nova tab se o actual não existir
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
    const q = sidebarRivalSearch.toLowerCase().trim();
    const filtered = sidebarRivals.filter(r => {
      if (q && !r.nome.toLowerCase().includes(q) && !r.pais.toLowerCase().includes(q)) return false;
      if (rivalFilters.pais && normPaisDisplay(r.pais) !== rivalFilters.pais) return false;
      if (sidebarRivalTier && r.playerTier !== sidebarRivalTier) return false;
      if (rivalFilters.escaloes.size > 0) {
        const arR = autoRivals.find(a => normNameAuto(a.n) === normNameAuto(r.nome));
        if (!arR || !Object.keys(arR.r).some(tid =>
          [...rivalFilters.escaloes].some(n => tid.includes(`_b${n}`))
        )) return false;
      }
      if (rivalFilters.minTorneios > 0 && r.totalTournaments < rivalFilters.minTorneios) return false;
      if (rivalFilters.apenasCruzaram && r.nEnc === 0) return false;
      if (rivalFilters.apenasProximoTourn && !r.nextIsCommon) return false;
      return true;
    });

    // Ordenar
    const sorted = [...filtered].sort((a, b) => {
      if (sidebarRivalSort === "torn") return b.totalTournaments - a.totalTournaments || b.nEnc - a.nEnc;
      if (sidebarRivalSort === "enc")  return b.nEnc - a.nEnc || b.totalTournaments - a.totalTournaments;
      return displayName(a.nome).localeCompare(displayName(b.nome), "pt");
    });

    // Separar em grupos
    const directos  = sorted.filter(r => r.nEnc > 0);
    const circuito  = sorted.filter(r => r.nEnc === 0);

    const maxTorn = sorted[0]?.totalTournaments ?? 1;

    const renderItem = (r: typeof sorted[0], rank: number) => {
      const active = selectedRival === r.nome;
      const accentColor = r.vitorias > r.derrotas
        ? "var(--color-teal)"
        : r.derrotas > r.vitorias ? "var(--color-danger)"
        : r.nEnc > 0 ? "var(--accent)"
        : "var(--border)";

      const recordStr = r.nEnc > 0
        ? [r.vitorias > 0 ? `${r.vitorias}V` : "", r.empates > 0 ? `${r.empates}E` : "", r.derrotas > 0 ? `${r.derrotas}D` : ""].filter(Boolean).join(" ")
        : null;
      const recordBg = r.vitorias > r.derrotas ? "var(--bg-success-subtle)"
        : r.derrotas > r.vitorias ? "var(--bg-danger-strong)"
        : "var(--bg-muted)";
      const recordCo = r.vitorias > r.derrotas ? "var(--color-good-dark)"
        : r.derrotas > r.vitorias ? "var(--color-danger-dark)"
        : "var(--text-3)";

      // Barra de actividade relativa
      const pct = Math.max(8, Math.round((r.totalTournaments / maxTorn) * 100));

      return (
        <button key={r.nome}
          className={`course-item${active ? " active" : ""}`}
          style={{ borderLeftColor: active ? accentColor : undefined, padding: "9px 10px 9px 12px" }}
          onClick={() => setSelectedRival(prev => prev === r.nome ? null : r.nome)}>

          {/* Linha 1: rank + flag + nome + nº torneios */}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
            {/* Rank */}
            <span className="sidebar-rank" style={{ flexShrink:0, fontSize:10, minWidth:20, height:20, borderRadius:4,
              background: rank <= 3 ? "var(--bg-topbar)" : "var(--bg-muted)",
              color: rank <= 3 ? "var(--text-inv)" : "var(--text-3)",
              display:"inline-flex", alignItems:"center", justifyContent:"center", fontWeight:700,
            }}>
              {rank}
            </span>
            {/* Flag + nome */}
            <span style={{ fontSize:14, flexShrink:0 }}>{flag(r.pais)}</span>
            <span style={{ flex:1, fontSize:13, fontWeight: active ? 700 : 600, color:"var(--text)",
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {displayName(r.nome)}
            </span>
            {/* Total torneios — número em destaque */}
            <span style={{ flexShrink:0, textAlign:"right" }}>
              <span style={{ fontSize:17, fontWeight:900, color: active ? "var(--accent)" : "var(--text-2)", lineHeight:1 }}>
                {r.totalTournaments}
              </span>
              <span style={{ fontSize:9, color:"var(--text-muted)", display:"block", lineHeight:1, textAlign:"center" }}>
                torn.
              </span>
            </span>
          </div>

          {/* Barra de actividade */}
          <div style={{ height:3, borderRadius:2, background:"var(--border-light)", overflow:"hidden", marginBottom:5 }}>
            <div style={{ height:"100%", width:`${pct}%`, borderRadius:2,
              background: r.nEnc > 0 ? accentColor : "var(--border)" }} />
          </div>

          {/* Linha 2: encontros + record + desde + escalão actual */}
          <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
            {r.nEnc > 0 && (
              <span style={{ fontSize:11, fontWeight:700, color:"var(--text-2)" }}>
                {r.nEnc} enc.
              </span>
            )}
            {recordStr && (
              <span className="p p-sm" style={{ background:recordBg, color:recordCo, fontSize:10, padding:"1px 5px" }}>
                {recordStr}
              </span>
            )}
            {r.firstYear && (
              <span style={{ fontSize:11, color:"var(--text-3)" }}>
                {r.firstYear}–
              </span>
            )}
            {/* Tier pill compacta */}
            {r.playerTier && (
              <span style={{ fontSize:9, padding:"1px 5px", borderRadius:10, fontWeight:700, flexShrink:0,
                background: r.playerTier==="elite"?"var(--score-eagle)":r.playerTier==="contender"?"var(--medal-gold)":r.playerTier==="forte"?"var(--color-good-dark)":r.playerTier==="subindo"?"var(--color-info)":r.playerTier==="assiduo"?"var(--text-dark)":"var(--accent)",
                color:"#fff",
              }}>
                {r.playerTier==="elite"?"🏆":r.playerTier==="contender"?"⭐":r.playerTier==="forte"?"🎯":r.playerTier==="subindo"?"📈":r.playerTier==="assiduo"?"🔁":"✅"}
              </span>
            )}
            {/* Escalão actual: pré-computado no escalaoMap (O(1) em vez de O(n)) */}
            {(() => {
              const maxAge = escalaoMap.get(normNameAuto(r.nome)) ?? null;
              if (!maxAge) return null;
              const cls = maxAge <= 10 ? "p-sub10" : maxAge <= 12 ? "p-sub12" : "p-sub14";
              return <span className={`p p-sm ${cls}`} style={{fontSize:9, padding:"1px 5px"}}>Boys {maxAge}</span>;
            })()}
          </div>

          {/* Linha 3: próximo torneio */}
          {r.nextTournName && (
            <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:4 }}>
              <span style={{ fontSize:10, color:"var(--text-3)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
                🗓 {r.nextTournName}
                {r.daysToNext != null && (
                  <span style={{ marginLeft:4, fontWeight:700,
                    color: r.daysToNext === 0 ? "var(--color-good)" : r.daysToNext <= 14 ? "var(--color-warn-vivid)" : "var(--text-3)" }}>
                    {r.daysToNext === 0 ? "hoje" : `${r.daysToNext}d`}
                  </span>
                )}
              </span>
              {r.nextIsCommon && (
                <span className="p p-sm" style={{ flexShrink:0, background:"var(--bg-success-subtle)", color:"var(--color-good-dark)", fontSize:9, padding:"1px 4px" }}>∩</span>
              )}
            </div>
          )}
        </button>
      );
    };

    return (
      <>
        {/* ── Painel de filtros (estilo DrivePage) ── */}
        <div style={{ borderBottom:"1px solid var(--border-light)", background:"var(--bg-card)" }}>

          {/* Pesquisa + Ordenar */}
          <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:5 }}>
            <input className="input" value={sidebarRivalSearch}
              onChange={e => setSidebarRivalSearch(e.target.value)}
              placeholder="🔎 Pesquisar rival…"
              style={{ width:"100%", fontSize:12, boxSizing:"border-box" }} />
            <select className="select" value={sidebarRivalSort}
              onChange={e => setSidebarRivalSort(e.target.value as "torn" | "enc" | "name")}
              style={{ width:"100%", fontSize:12 }}>
              <option value="torn">↓ Ordenar por: mais presenças</option>
              <option value="enc">↓ Ordenar por: mais encontros</option>
              <option value="name">↓ Ordenar por: nome A–Z</option>
            </select>
          </div>

          {/* Escalão — multi-select com cores */}
          <div className="sidebar-section-title" style={{ paddingTop:2, paddingBottom:2 }}>Escalão (multi-select)</div>
          <div style={{ padding:"4px 10px 8px", display:"flex", gap:4, flexWrap:"wrap" }}>
            {([
              { n:"9",  cls:"p-sub10", bg:"var(--esc-sub10-bg)", fg:"var(--esc-sub10-fg)" },
              { n:"10", cls:"p-sub10", bg:"var(--esc-sub10-bg)", fg:"var(--esc-sub10-fg)" },
              { n:"11", cls:"p-sub12", bg:"var(--esc-sub12-bg)", fg:"var(--esc-sub12-fg)" },
              { n:"12", cls:"p-sub14", bg:"var(--esc-sub14-bg)", fg:"var(--esc-sub14-fg)" },
              { n:"13", cls:"p-sub14", bg:"var(--esc-sub14-bg)", fg:"var(--esc-sub14-fg)" },
            ] as const).map(({ n, bg, fg }) => {
              const active = rivalFilters.escaloes.has(n);
              return (
                <button key={n}
                  className="p p-sm"
                  style={{
                    background: active ? bg : "var(--bg-muted)",
                    color: active ? fg : "var(--text-2)",
                    border: active ? "none" : "1px solid var(--border)",
                    cursor:"pointer", fontWeight: active ? 700 : 500,
                    boxShadow: active ? "0 1px 3px rgba(0,0,0,.2)" : "none",
                    opacity: active ? 1 : 0.7,
                  }}
                  onClick={() => setRivalFilters(f => {
                    const next = new Set(f.escaloes);
                    next.has(n) ? next.delete(n) : next.add(n);
                    return { ...f, escaloes: next };
                  })}>
                  Boys {n}
                </button>
              );
            })}
          </div>

          {/* País */}
          <div className="sidebar-section-title" style={{ paddingTop:2, paddingBottom:2 }}>País</div>
          <div style={{ padding:"4px 10px 8px" }}>
            <select className="select" value={rivalFilters.pais}
              onChange={e => setRivalFilters(f => ({ ...f, pais: e.target.value }))}
              style={{ width:"100%", fontSize:12 }}>
              <option value="">Todos os países</option>
              {[...new Set(sidebarRivals.map(r => normPaisDisplay(r.pais)).filter(Boolean))]
                .map(p => ({ p, n: sidebarRivals.filter(r => normPaisDisplay(r.pais) === p).length }))
                .sort((a, b) => b.n - a.n)
                .map(({ p, n }) => (
                  <option key={p} value={p}>{flag(p)} {p} ({n})</option>
                ))}
            </select>
          </div>

          {/* Tipo de jogador */}
          <div className="sidebar-section-title" style={{ paddingTop:2, paddingBottom:2 }}>Tipo de jogador</div>
          <div style={{ padding:"4px 10px 8px", display:"flex", gap:4, flexWrap:"wrap" }}>
            {([
              { key:"elite",      label:"🏆 Elite",            bg:"var(--score-eagle)",    fg:"#fff" },
              { key:"contender",  label:"⭐ Top Contender",    bg:"var(--medal-gold)",     fg:"#fff" },
              { key:"forte",      label:"🎯 Forte Competidor", bg:"var(--color-good-dark)",fg:"#fff" },
              { key:"subindo",    label:"📈 Em Ascensão",      bg:"var(--color-info)",     fg:"#fff" },
              { key:"assiduo",    label:"🔁 Assíduo",          bg:"var(--text-dark)",      fg:"#fff" },
              { key:"consistente",label:"✅ Consistente",      bg:"var(--accent)",         fg:"#fff" },
            ] as const).map(({ key, label, bg, fg }) => {
              const count = sidebarRivals.filter(r => r.playerTier === key).length;
              if (count === 0) return null;
              const active = sidebarRivalTier === key;
              return (
                <button key={key}
                  onClick={() => setSidebarRivalTier(active ? "" : key)}
                  style={{
                    display:"flex", alignItems:"center", gap:4,
                    padding:"3px 8px", borderRadius:20, border:"none", cursor:"pointer",
                    background: active ? bg : "var(--bg-muted)",
                    color: active ? fg : "var(--text-2)",
                    fontSize:11, fontWeight:active?700:500,
                    boxShadow: active ? "0 1px 3px rgba(0,0,0,.15)" : "none",
                  }}>
                  {label}
                  <span style={{ fontSize:10, opacity:.8 }}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Mínimo de torneios */}
          <div className="sidebar-section-title" style={{ paddingTop:2, paddingBottom:2 }}>Presenças mínimas</div>
          <div style={{ padding:"4px 10px 8px", display:"flex", gap:4, flexWrap:"wrap" }}>
            {([0, 5, 10, 20] as const).map(n => (
              <button key={n}
                className={`tourn-tab tourn-tab-sm${rivalFilters.minTorneios===n?" active":""}`}
                style={rivalFilters.minTorneios===n?{}:{ background:"var(--bg-muted)", color:"var(--text-2)", borderColor:"var(--border)" }}
                onClick={() => setRivalFilters(f=>({...f, minTorneios:n}))}>
                {n===0 ? "Todos" : `${n}+`}
              </button>
            ))}
          </div>

          {/* Tipo */}
          <div className="sidebar-section-title" style={{ paddingTop:2, paddingBottom:2 }}>Tipo</div>
          <div style={{ padding:"4px 10px 10px", display:"flex", gap:4, flexWrap:"wrap" }}>
            <button
              className={`tourn-tab tourn-tab-sm${rivalFilters.apenasCruzaram?" active":""}`}
              style={rivalFilters.apenasCruzaram?{ background:"var(--bg-success-subtle)", borderColor:"var(--color-good)", color:"var(--color-good-dark)" }:{ background:"var(--bg-muted)", color:"var(--text-2)", borderColor:"var(--border)" }}
              onClick={() => setRivalFilters(f=>({...f, apenasCruzaram:!f.apenasCruzaram}))}>
              ⚔️ Só directos
            </button>
            {/* Limpar filtros */}
            {(rivalFilters.pais || rivalFilters.escaloes.size > 0 || rivalFilters.minTorneios > 0 || rivalFilters.apenasCruzaram || sidebarRivalTier) && (
              <button className="tourn-tab tourn-tab-sm" style={{ background:"var(--bg-danger)", color:"var(--color-danger)", borderColor:"var(--border-danger)" }}
                onClick={() => { setRivalFilters({ pais:"", escaloes: new Set(), apenasCruzaram:false, apenasProximoTourn:false, minTorneios:0, maxNascimento:0, minNascimento:0 }); setSidebarRivalTier(""); }}>
                ✕ Limpar
              </button>
            )}
          </div>
        </div>

        {/* Cabeçalho com contagem */}
        <div className="sidebar-section-title" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span>{filtered.length} rival{filtered.length !== 1 ? "s" : ""}
            {filtered.length < sidebarRivals.length ? ` (de ${sidebarRivals.length})` : ""}
          </span>
        </div>

        {/* Grupo 1: Confrontos directos */}
        {directos.length > 0 && (
          <>
            <div className="sidebar-section-title-dark" style={{ fontSize:10, letterSpacing:"0.06em", textTransform:"uppercase" }}>
              ⚔️ Directos ({directos.length})
            </div>
            {directos.map((r, i) => renderItem(r, i + 1))}
          </>
        )}

        {/* Grupo 2: Mesmo circuito */}
        {circuito.length > 0 && (
          <>
            <div className="sidebar-section-title-dark" style={{ fontSize:10, letterSpacing:"0.06em", textTransform:"uppercase" }}>
              🌍 Circuito ({circuito.length})
            </div>
            {circuito.map((r, i) => renderItem(r, directos.length + i + 1))}
          </>
        )}

        {filtered.length === 0 && (
          <div className="muted" style={{ padding:"16px 12px", fontSize:12 }}>Sem rivais com estes filtros</div>
        )}
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

    const monthLabel = (key: string) => {
      if (key === "?") return "Data desconhecida";
      if (key.length === 4) return key;
      const [yr, mo] = key.split("-");
      return `${MONTHS_PT[parseInt(mo) - 1] || mo} ${yr}`;
    };
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
          <TabResultados greatgolfData={greatgolfData}
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
        {/* TabRivais renderizado sempre quando resultsData existe — pré-calcula em background */}
        {resultsData && (
          <SectionErrorBoundary label="TabRivais">
            <div style={{ display: tab === "rivais" ? "block" : "none" }}>
              <TabRivais data={resultsData} fieldData={fieldData} intlData={intlData}
                autoRivals={autoRivals} selectedT={selectedT} mhCountMap={mhCountMap}
                selectedRival={selectedRival} setSelectedRival={setSelectedRival}
                greatgolfData={greatgolfData}
                onRivalsReady={onRivalsReady}
              />
            </div>
          </SectionErrorBoundary>
        )}

      </div>
      {/* ← fecha master-detail */}
      </div>
    {/* ← fecha tourn-layout */}
    </div>
  );
}
