import { useEffect, useState, useMemo, useCallback } from "react";
import React from "react";
import { C } from "../utils/colors";
import EmptyState from "../ui/EmptyState";
import {
  ScorecardLB, AccumulatedLB, expandMultiRound,
  type Tournament as TATournament,
} from "./FPGPage";
import { buildAutoRivals, normName as normNameAuto, type AutoRivalPlayer } from "./KIDSdataLoader";

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
}
interface IntlTorneio { id: string; name: string; short: string; date: string; rounds: number; par: number; url: string; circuito?: string; }
interface IntlJogador { n: string; co: string; isM?: boolean; r: Record<string, { p: number; t: number; tp: number; rd: number[] }>; up: string[]; }
interface IntlData { torneios: IntlTorneio[]; proximos: { id: string; name: string }[]; jogadores: IntlJogador[]; }

// ── Member History (uskids-member-history.json) ──
interface MemberHistRound {
  strokes: number[]; course: string; startHole: number;
  startTime: string; group: number; gross: number; holes: number;
}
interface MemberHistTorneio {
  name: string; type: string; startDate: string; endDate: string;
  totalRounds: number; holesPerRound: number; par: number[]; yards: number[];
  ageGroup: string; status: number; place: number; totalStrokes: number;
  points: number; rounds: Record<string, MemberHistRound>;
}
interface MemberHistPlayer {
  memberId: number; name: string; country: string; place: string;
  ageGroup: string; totalTorneios: number;
  torneios: Record<string, MemberHistTorneio>;
}
interface MemberHistData {
  gerado_em: string;
  torneios: Record<string, { name: string; start_date: string; end_date: string; rounds: number }>;
  jogadores: Record<string, MemberHistPlayer>;
}

interface GGEntry { pos: number | null; name: string; fed: string | null; club: string; toPar: number | null; gross: number | null; status: string; }
interface GreatgolfData {
  name: string; course: string; dates: string[];
  results: { d1: GGEntry[]; sub14: GGEntry[]; sub12: GGEntry[] };
}

// ── Matching robusto USKids ↔ BJGT ──────────────────────────────
function normNome(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

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
  if (/venice/i.test(low))                        return `venice-${y2}`;
  if (/rome|roma/i.test(low))                     return `rome-${y2}`;
  if (/marco\s*simone/i.test(low))                return `marco-${y2}`;
  if (/wjgc|bjgt|world.*junior.*golf/i.test(low)) return `wjgc-${y2}`;
  if (/eu\s*open|european\s*open|eowagr/i.test(low)) return `euopen-${y2}`;
  if (/doral/i.test(low))                         return `doral-${y2}`;
  if (/great\s*golf/i.test(low))                  return `gg-${y2}`;
  if (/quinta.*lago|qdl/i.test(low))              return `qdl-${y2}`;
  if (/desert/i.test(low))                        return `desert-${y2}`;
  if (/sandestin/i.test(low))                     return `sandestin-${y2}`;
  if (/mississippi|msstate/i.test(low))           return `msstate-${y2}`;
  if (/south\s*carolina|scstate/i.test(low))      return `scstate-${y2}`;
  if (/el\s*prat/i.test(low))                     return `elprat-${y2}`;
  return low.replace(/[^a-z0-9]/g, "") + (y2 ? `-${y2}` : "");
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
  const partes = normNome(nome).split(' ');
  return partes.slice(1).filter(p => !ignorar.has(p) && p.length > 2);
}

function scoreMatch(n1: string, n2: string): number {
  const p1 = normNome(n1).split(' ').filter(Boolean);
  const p2 = normNome(n2).split(' ').filter(Boolean);
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
    byNorm.set(normNome(j.n), j);
  }

  // Aliases: also → canonical
  const aliasMap = new Map<string, string>();
  for (const a of (intlData.aliases ?? [])) {
    for (const also of a.also) {
      aliasMap.set(normNome(also), a.canonical);
    }
  }

  // Pares a não confundir
  const naoConfundir = new Set<string>();
  for (const grupo of (intlData.nao_confundir ?? [])) {
    for (let i = 0; i < grupo.nomes.length; i++) {
      for (let j = i + 1; j < grupo.nomes.length; j++) {
        const chave = [normNome(grupo.nomes[i]), normNome(grupo.nomes[j])].sort().join('|');
        naoConfundir.add(chave);
      }
    }
  }

  // Índice por "primeiro último" normalizado
  const byFirstLast = new Map<string, IntlJogador | null>();
  for (const j of intlData.jogadores) {
    const parts = normNome(j.n).split(' ').filter(Boolean);
    if (parts.length >= 2) {
      const key = `${parts[0]} ${parts[parts.length - 1]}`;
      if (!byFirstLast.has(key)) byFirstLast.set(key, j);
      else byFirstLast.set(key, null); // colisão
    }
  }

  // Índice por "país:último_apelido" normalizado
  const byCountryLast = new Map<string, IntlJogador | null>();
  for (const j of intlData.jogadores) {
    const parts = normNome(j.n).split(' ').filter(Boolean);
    if (parts.length >= 1 && j.co) {
      const key = `${normCountry(j.co)}:${parts[parts.length - 1]}`;
      if (!byCountryLast.has(key)) byCountryLast.set(key, j);
      else byCountryLast.set(key, null);
    }
  }

  const bjgtNomes = intlData.jogadores.filter(j => !j.isM).map(j => j.n);

  return (nomeUskids: string, paisUskids?: string): IntlJogador | null => {
    const nNorm = normNome(nomeUskids);

    // 1. Alias directo
    const canonical = aliasMap.get(nNorm);
    if (canonical) {
      const jog = byNorm.get(normNome(canonical));
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
        const clFirst = normNome(cl.n).split(' ')[0] || "";
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
      const chave = [nNorm, normNome(melhorNome)].sort().join('|');
      if (naoConfundir.has(chave)) return null;
      return byNorm.get(normNome(melhorNome)) ?? null;
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
  for (const r of rivals) byNorm.set(normNome(r.nome), r);

  // Índice por "primeiro último" normalizado — apanha diferenças em middle names
  const byFirstLast = new Map<string, typeof rivals[0] | null>();
  for (const r of rivals) {
    const parts = normNome(r.nome).split(' ').filter(Boolean);
    if (parts.length >= 2) {
      const key = `${parts[0]} ${parts[parts.length - 1]}`;
      if (!byFirstLast.has(key)) byFirstLast.set(key, r);
      else byFirstLast.set(key, null); // colisão → marca como inválido
    }
  }

  // Índice por "país_normalizado:último_apelido" — forte para juniores
  const byCountryLast = new Map<string, typeof rivals[0] | null>();
  for (const r of rivals) {
    const parts = normNome(r.nome).split(' ').filter(Boolean);
    if (parts.length >= 1 && r.pais) {
      const last = parts[parts.length - 1];
      const key = `${normCountry(r.pais)}:${last}`;
      if (!byCountryLast.has(key)) byCountryLast.set(key, r);
      else byCountryLast.set(key, null); // colisão → ignorar
    }
  }

  return (nomeInscrito: string, paisInscrito?: string): typeof rivals[0] | null => {
    const nNorm = normNome(nomeInscrito);
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
        const clFirst = normNome(cl.nome).split(' ')[0] || "";
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
const MANUEL_FRAGMENT    = "medeiros";
const MANUEL_FIRST       = "manuel";
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

const FLAG: Record<string,string> = {
  PT:"🇵🇹",GB:"🇬🇧",IE:"🇮🇪",FR:"🇫🇷",ES:"🇪🇸",DE:"🇩🇪",IT:"🇮🇹",
  NL:"🇳🇱",SE:"🇸🇪",NO:"🇳🇴",DK:"🇩🇰",FI:"🇫🇮",US:"🇺🇸",CA:"🇨🇦",
  AU:"🇦🇺",ZA:"🇿🇦",MX:"🇲🇽",JP:"🇯🇵",KR:"🇰🇷",CH:"🇨🇭",CN:"🇨🇳",
  IN:"🇮🇳",BR:"🇧🇷",AR:"🇦🇷",BE:"🇧🇪",PL:"🇵🇱",SK:"🇸🇰",HU:"🇭🇺",
  RU:"🇷🇺",PH:"🇵🇭",SG:"🇸🇬",CZ:"🇨🇿",
  TH:"🇹🇭",RO:"🇷🇴",UA:"🇺🇦",SI:"🇸🇮",BG:"🇧🇬",LT:"🇱🇹",LV:"🇱🇻",
  EE:"🇪🇪",TR:"🇹🇷",MA:"🇲🇦",AE:"🇦🇪",KZ:"🇰🇿",VN:"🇻🇳",AT:"🇦🇹",
  PY:"🇵🇾",NG:"🇳🇬",OM:"🇴🇲",PR:"🇵🇷",CR:"🇨🇷",JE:"🇯🇪",CY:"🇨🇾",
  LB:"🇱🇧",ID:"🇮🇩",HK:"🇭🇰",TW:"🇹🇼",NZ:"🇳🇿",AM:"🇦🇲",CO:"🇨🇴",
  CL:"🇨🇱",BB:"🇧🇧",BS:"🇧🇸",BO:"🇧🇴",DO:"🇩🇴",DZ:"🇩🇿",EC:"🇪🇨",
  GT:"🇬🇹",HN:"🇭🇳",KE:"🇰🇪",KH:"🇰🇭",NI:"🇳🇮",PA:"🇵🇦",PE:"🇵🇪",
  SV:"🇸🇻",UG:"🇺🇬",UY:"🇺🇾",VE:"🇻🇪",GR:"🇬🇷",IL:"🇮🇱",HR:"🇭🇷",
  RS:"🇷🇸",LU:"🇱🇺",IS:"🇮🇸",MY:"🇲🇾",
};
/** Converte qualquer formato de país (código, nome EN, nome PT) para emoji de bandeira */
const flag = (p: string): string => {
  if (!p) return "🏳️";
  const upper = p.trim().toUpperCase();
  // 1. Directo por código
  if (FLAG[upper]) return FLAG[upper];
  // 2. Via normCountry (nome completo → código)
  const code = normCountry(p).toUpperCase();
  if (FLAG[code]) return FLAG[code];
  return "🏳️";
};

/** Normaliza país para código de 2 letras (ou lowercase do nome completo).
 *  Aceita "PT", "Portugal", "England", "GB", "United Kingdom", etc. */
const COUNTRY_TO_CODE: Record<string, string> = {
  // English
  portugal:"pt",england:"gb",spain:"es",france:"fr",germany:"de",italy:"it",
  netherlands:"nl",sweden:"se",norway:"no",denmark:"dk",finland:"fi",
  "united states":"us",canada:"ca",australia:"au","south africa":"za",mexico:"mx",
  japan:"jp","south korea":"kr",switzerland:"ch",china:"cn",india:"in",
  brazil:"br",argentina:"ar",belgium:"be",poland:"pl",slovakia:"sk",hungary:"hu",
  "russian federation":"ru",russia:"ru",philippines:"ph",singapore:"sg",
  "czech republic":"cz",ireland:"ie","great britain":"gb","united kingdom":"gb",
  wales:"gb",scotland:"gb","northern ireland":"gb",colombia:"co",chile:"cl",
  thailand:"th",romania:"ro",ukraine:"ua",slovenia:"si",bulgaria:"bg",
  lithuania:"lt",latvia:"lv",estonia:"ee",turkey:"tr",morocco:"ma",
  "united arab emirates":"ae",kazakhstan:"kz","viet nam":"vn",vietnam:"vn",
  austria:"at",paraguay:"py",nigeria:"ng",oman:"om","puerto rico":"pr",
  "costa rica":"cr",jersey:"je",cyprus:"cy",lebanon:"lb",indonesia:"id",
  "hong kong":"hk",taiwan:"tw","new zealand":"nz",armenia:"am",
  barbados:"bb",bahamas:"bs",bolivia:"bo","dominican republic":"do",
  algeria:"dz",ecuador:"ec",guatemala:"gt",honduras:"hn",kenya:"ke",
  cambodia:"kh",nicaragua:"ni",panama:"pa",peru:"pe","el salvador":"sv",
  uganda:"ug",uruguay:"uy",venezuela:"ve",greece:"gr",israel:"il",
  croatia:"hr",serbia:"rs",luxembourg:"lu",iceland:"is",malaysia:"my",
  // Português
  espanha:"es",frança:"fr",alemanha:"de",itália:"it","países baixos":"nl",
  holanda:"nl",suécia:"se",noruega:"no",dinamarca:"dk",finlândia:"fi",
  "estados unidos":"us",canadá:"ca",austrália:"au","áfrica do sul":"za",
  méxico:"mx",japão:"jp","coreia do sul":"kr",suíça:"ch",índia:"in",
  brasil:"br",bélgica:"be",polónia:"pl",eslováquia:"sk",hungria:"hu",
  "federação russa":"ru",rússia:"ru",filipinas:"ph",singapura:"sg",
  "república checa":"cz",irlanda:"ie","reino unido":"gb",
  inglaterra:"gb",escócia:"gb","irlanda do norte":"gb",gales:"gb",
  colômbia:"co",tailândia:"th",roménia:"ro",ucrânia:"ua",
  eslovénia:"si",bulgária:"bg",lituânia:"lt",letónia:"lv",
  estónia:"ee",turquia:"tr",marrocos:"ma",
  "emirados árabes unidos":"ae",cazaquistão:"kz",vietname:"vn",
  áustria:"at",paraguai:"py",nigéria:"ng",omã:"om","porto rico":"pr",
  chipre:"cy",líbano:"lb",indonésia:"id",
  "nova zelândia":"nz",arménia:"am",
  bolívia:"bo","república dominicana":"do",argélia:"dz",equador:"ec",
  quénia:"ke",camboja:"kh",
  nicarágua:"ni",panamá:"pa",
  uruguai:"uy",grécia:"gr",
  croácia:"hr",sérvia:"rs",luxemburgo:"lu",islândia:"is",malásia:"my",
};
function normCountry(raw: string): string {
  if (!raw) return "";
  const lower = raw.toLowerCase().trim();
  // Already a 2-letter code?
  if (lower.length === 2) return lower;
  return COUNTRY_TO_CODE[lower] || lower;
}

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

function isoDate(s: string): string {
  if (!s) return "";
  if (s.includes("-")) return s;
  const [m,d,y] = s.split("/");
  return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
}

function fmtDate(s: string) {
  const iso = isoDate(s);
  if (!iso) return s;
  return new Date(iso).toLocaleDateString("pt-PT",{day:"2-digit",month:"short",year:"numeric"});
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

function isManuel(nome: string) {
  const n = nome.toLowerCase();
  return n.includes(MANUEL_FRAGMENT) && n.includes(MANUEL_FIRST);
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

  const isAccTab = hasAcumulado && tab === rondasComDados.length;
  const curT = isAccTab ? expandedT[expandedT.length - 1] : expandedT[tab] ?? tournament;

  const tabStyle = (i: number): React.CSSProperties => ({
    padding: "6px 14px", fontSize: 12,
    fontWeight: tab === i ? 700 : 500,
    color: tab === i ? "var(--text)" : "var(--text-muted,#888)",
    background: "transparent", border: "none",
    borderBottom: tab === i ? "2px solid var(--accent,#2563eb)" : "2px solid transparent",
    cursor: "pointer", whiteSpace: "nowrap" as const,
  });

  const campo = (curT as any).campo || tournament.campo || "";

  return (
    <div>
      {/* Campo por escalão */}
      {campo && (
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>
          📍 {campo}
        </div>
      )}
      {/* Sub-tabs R1 / R2 / Acumulado — só se houver mais de 1 ronda */}
      {(rondasComDados.length > 1) && (
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
          {rondasComDados.map((_, i) => (
            <button key={i} style={tabStyle(i)} onClick={() => setTab(i)}>R{i + 1}</button>
          ))}
          {hasAcumulado && (
            <button style={tabStyle(rondasComDados.length)} onClick={() => setTab(rondasComDados.length)}>
              Acumulado
            </button>
          )}
        </div>
      )}
      {isAccTab
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
    color: esc === i ? "var(--text)" : "var(--text-muted,#888)",
    background: "transparent", border: "none",
    borderBottom: esc === i ? "2px solid var(--accent,#2563eb)" : "2px solid transparent",
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
      {/* Header */}
      <div style={{ marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
          <span style={{ fontSize:18, fontWeight:700, color:"var(--text)" }}>{t.emoji} {t.name}</span>
          {REGIONAL_CHAMPIONSHIPS[t.t] && (
            <span style={{
              fontSize:10, fontWeight:800, padding:"2px 9px", borderRadius:8,
              background:"var(--bg-pink)", color:"var(--color-purple)", border:"1px solid #e1bee7",
              letterSpacing:"0.04em",
            }}>⭐ REGIONAL INVITATION</span>
          )}
          {dias >= 0 && dias <= 14 && (
            <span style={{ background:"var(--chart-5)", color:"#fff", padding:"1px 7px", borderRadius:8, fontSize:10 }}>daqui a {dias}d</span>
          )}
          {dias < 0 && !isTerminado(t.date_fim, t.date_inicio) && (
            <span style={{ background:"var(--color-good)", color:"#fff", padding:"1px 7px", borderRadius:8, fontSize:10 }}>em curso</span>
          )}
        </div>
        <div style={{ fontSize:12, color:"var(--text-3)" }}>
          📅 {fmtDate(t.date_inicio)}
          {t.date_fim && t.date_fim !== t.date_inicio ? ` → ${fmtDate(t.date_fim)}` : ""}
          {t.rondas ? ` · ${t.rondas}R` : ""}
          {t.campo   ? ` · ${t.campo}` : ""}
          {t.fee_18  ? ` · 💵 ${t.fee_18}` : ""}
          {" · "}<span style={{ userSelect:"all", cursor:"text" }}>t={t.t}</span>
        </div>

        {t.sem_flights && (
          <div style={{ color:"var(--text-3)", fontSize:11, marginTop:6 }}>⏳ Flights ainda não publicados</div>
        )}
        {t.erro && <div style={{ color:"var(--color-danger)", fontSize:11, marginTop:6 }}>⚠️ {t.erro}</div>}

        {!t.erro && !t.sem_flights && (
          <div style={{ marginTop:10, display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ background:"var(--color-good-dark)", color:"#fff", padding:"2px 8px", borderRadius:8, fontSize:11 }}>
              {t.total_inscritos}/{t.total_maximo} inscritos
            </span>
            {b12 && (() => {
              const bd = badgeVagas(b12.vagas, b12.maximo);
              return bd ? (
                <span style={{ background: urgente ? bd.bg : "var(--bg-hover)", color: urgente ? bd.cor : "var(--text-2)",
                  border:`1px solid ${bd.bg}`, padding:"2px 8px", borderRadius:8, fontSize:11, fontWeight:700 }}>
                  ★ {escalaoM}: {b12.inscritos}/{b12.maximo} ({bd.label})
                </span>
              ) : null;
            })()}
          </div>
        )}
        {/* Links */}
        <div style={{ marginTop:8, display:"flex", gap:5, flexWrap:"wrap" }}>
          <a href={`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=field&fmt=nohead&ax=2739&t=${t.t}`}
            target="_blank" rel="noopener noreferrer" style={{ fontSize:11, padding:"2px 9px", borderRadius:10,
              background:"var(--bg-muted)", color:"var(--accent-text)", border:"1px solid var(--border)", textDecoration:"none" }}>
            📋 Inscritos
          </a>
          <a href={`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t.t}`}
            target="_blank" rel="noopener noreferrer" style={{ fontSize:11, padding:"2px 9px", borderRadius:10,
              background:"var(--bg-muted)", color:"var(--accent-text)", border:"1px solid var(--border)", textDecoration:"none" }}>
            🏆 Resultados ↗
          </a>
          {(t.url_uskids || (LINKS_EXTRA[t.t] ?? []).find(l => l.label === "USKids ↗")?.url) && (
            <a href={t.url_uskids ?? (LINKS_EXTRA[t.t] ?? []).find(l => l.label === "USKids ↗")!.url}
              target="_blank" rel="noopener noreferrer" style={{ fontSize:11, padding:"2px 9px", borderRadius:10,
                background:"var(--bg-muted)", color:"var(--accent-text)", border:"1px solid var(--border)", textDecoration:"none" }}>
              USKids ↗
            </a>
          )}
          {(LINKS_EXTRA[t.t] ?? []).filter(l => l.label !== "USKids ↗").map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:11, padding:"2px 9px", borderRadius:10,
                background:"var(--bg-muted)", color:"var(--accent-text)", border:"1px solid var(--border)", textDecoration:"none" }}>
              {l.label}
            </a>
          ))}
        </div>
      </div>

      {t.erro || t.sem_flights ? null : (
        <>
          {/* Grid de escalões */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))", gap:6, marginBottom:16 }}>
            {sortEscaloes(t.escaloes).map(e => {
              const bd  = badgeVagas(e.vagas, e.maximo);
              const dst = ESCALOES_DESTAQUE.has(e.nome);
              const man = e.nome === escalaoM;
              return (
                <div key={e.age_group} style={{
                  background: man?"var(--accent-light)":dst?"var(--bg-detail)":"var(--bg)",
                  border:`1px solid ${man?"var(--accent)":dst?"var(--border)":"transparent"}`,
                  borderRadius:6, padding:"7px 10px",
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: e.jogadores?.length ? 5 : 0 }}>
                    <span style={{ fontSize:11, color:man?"var(--accent)":dst?"var(--text-2)":"var(--text-3)" }}>
                      {man?"★ ":""}{e.nome}
                      <span style={{ color:"var(--text-3)", fontSize:10, marginLeft:3 }}>({e.holes}H)</span>
                    </span>
                    <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                      <span style={{ fontSize:10, color:"var(--text-3)" }}>{e.inscritos}/{e.maximo}</span>
                      {bd && <span style={{ background:bd.bg, color:bd.cor, padding:"1px 5px", borderRadius:5, fontSize:10, fontWeight:700 }}>{bd.label}</span>}
                    </div>
                  </div>
                  {e.jogadores && e.jogadores.length > 0 && (
                    <div style={{ borderTop:"1px solid var(--border)", paddingTop:4 }}>
                      {e.jogadores.map((j,i) => {
                        const isM = isManuel(j.nome);
                        return (
                          <div key={i} style={{
                            display:"flex", justifyContent:"space-between",
                            fontSize: isM ? 13 : 12,
                            fontWeight: isM ? 800 : 400,
                            padding: isM ? "3px 6px" : "2px 0",
                            margin: isM ? "3px -10px" : "0",
                            borderRadius: isM ? 5 : 0,
                            background: isM ? "var(--accent)" : "transparent",
                            color: isM ? "#fff" : j.pais==="PT" ? "var(--accent)" : "var(--text)",
                          }}>
                            <span>{isM ? "★ " : ""}{displayName(j.nome)}</span>
                            <span title={j.cidade}>{flag(j.pais)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!e.jogadores && e.paises && e.paises.length > 0 && (
                    <div style={{ fontSize:10, color:"var(--text-3)", marginTop:3 }}>
                      {e.paises.slice(0,5).map(p=>`${flag(p.pais)}${p.n}`).join(" ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Portugueses */}
          {ptTotal.length > 0 && (
            <div style={{ background:"var(--accent-light)", border:"1px solid var(--accent)", borderRadius:8, padding:"10px 14px", marginBottom:8 }}>
              <div style={{ color:"var(--accent)", fontWeight:700, fontSize:12, marginBottom:6 }}>🇵🇹 Portugueses inscritos</div>
              {t.escaloes.filter(e=>e.jogadores?.some(j=>j.pais==="PT")).map(e=>(
                <div key={e.age_group} style={{ marginBottom:4 }}>
                  <div style={{ color:"var(--accent)", fontSize:10, marginBottom:1 }}>{e.nome}</div>
                  {e.jogadores!.filter(j=>j.pais==="PT").map((j,i)=>(
                    <div key={i} style={{ color:"var(--text)", fontSize:12, paddingLeft:8 }}>
                      {displayName(j.nome)} <span style={{ color:"var(--text-3)", fontSize:11 }}>{j.cidade}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div style={{ textAlign:"right", color:"var(--text-3)", fontSize:10 }}>{fmtTs(t.ultima_atualizacao)}</div>
        </>
      )}
    </div>
  );
}

// manter TabCampo para compatibilidade (não é usada directamente mas pode existir)
function TabCampo({ data }: { data: FieldData }) {
  return <div>{data.torneios.map(t => <TabCampoDetalhe key={t.t} torneio={t} />)}</div>;
}


// ─────────────────────────────────────────────
// TAB RESULTADOS
// ─────────────────────────────────────────────
function TabResultados({ data, selectedT, greatgolfData }: {
  data: ResultsData;
  selectedT: number | null;
  greatgolfData: GreatgolfData | null;
}) {
  const t = data.resultados.find(r => r.t === selectedT) ?? null;

  // ── PRINT ──────────────────────────────────────────────────────────────────
  function printRondas() {
    if (!t) return;

    function tpStr(v: number | null | undefined) {
      return v == null ? "–" : v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`;
    }
    function tpColor(v: number | null | undefined) {
      return v == null ? "var(--grey-400)" : v < 0 ? "var(--color-good)" : v === 0 ? "var(--grey-700)" : "var(--color-danger)";
    }
    function scClass(gross: number, par: number | null) {
      if (!par || !gross) return "";
      const d = gross - par;
      if (d <= -3) return "eagle";
      if (d === -2) return "eagle";
      if (d === -1) return "birdie";
      if (d === 0)  return "par";
      if (d === 1)  return "bogey";
      if (d === 2)  return "double";
      if (d === 3)  return "triple";
      return "quad";
    }

    const css = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'DM Sans', sans-serif; font-size: 11px; color: #1a2e0f; background: #fff; padding: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      h1 { font-size: 15px; font-weight: 800; margin-bottom: 3px; }
      h2 { font-size: 12px; font-weight: 700; color: #3a5a28; margin: 14px 0 6px; border-bottom: 1px solid #3a5a28; padding-bottom: 3px; }
      h3 { font-size: 11px; font-weight: 700; color: #555; margin: 10px 0 4px; }
      .meta { font-size: 10px; color: #666; margin-bottom: 8px; }
      .page-break { page-break-before: always; }

      table { border-collapse: collapse; font-size: 10px; width: 100%; }
      th, td { padding: 4px 3px; text-align: center; border: none; white-space: nowrap; }
      th { background: #eef2e8; font-weight: 600; font-size: 10px; color: #555; border-bottom: 1px solid #bcc5ad; }
      tbody td { border-bottom: 1px solid #d5dac9; }
      td.name { text-align: left; padding-left: 8px; min-width: 120px; }
      td.pos { width: 24px; font-weight: 700; }
      td.flag { width: 22px; }

      .lb-topar { width: 32px; font-weight: 700; font-family: 'JetBrains Mono', monospace; background: #e0efdb; border-left: 1px solid #bcc5ad; }
      .lb-gross { width: 36px; font-weight: 800; font-family: 'JetBrains Mono', monospace; background: #e0efdb; border-left: 1px solid #d5dac9; }
      .lb-halftot { width: 40px; background: #f0f2ec; font-weight: 600; font-size: 10px; font-family: 'JetBrains Mono', monospace; border-left: 1px solid #bcc5ad; }
      .lb-hole { min-width: 28px; border-left: 1px solid #d5dac9; }
      .lb-hole-first { border-left: 1px solid #bcc5ad; }
      .lb-par-row td { background: #f0f2ec; font-weight: 600; border-bottom: 2px solid #bcc5ad; }
      .lb-par-row td.lb-topar, .lb-par-row td.lb-gross { background: #e0efdb; }
      .lb-si-row td { background: #f7f8f6; font-size: 10px; color: #888; border-bottom: 1px solid #d5dac9; }
      .lb-par-lbl { text-align: left; padding-left: 8px; font-weight: 800; }

      .row-manuel td { background: #d1fae5 !important; }
      .row-manuel td.lb-topar, .row-manuel td.lb-gross { background: #a7f3d0 !important; }

      .sc-score { display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; font-size: 10px; font-weight: 700; border-radius: 0; }
      .sc-score.birdie { background: #dc2626; color: #fff; border-radius: 50%; }
      .sc-score.eagle  { background: #f59e0b; color: #fff; border-radius: 50%; }
      .sc-score.par    { background: transparent; color: #1a2e0f; }
      .sc-score.bogey  { background: #bfdbfe; color: #1e3a8a; border: 1px solid #93c5fd; }
      .sc-score.double { background: #60a5fa; color: #fff; }
      .sc-score.triple { background: #2563eb; color: #fff; }
      .sc-score.quad   { background: #1d4ed8; color: #fff; }
      .sc-score.empty  { color: #ccc; }
      .row-wd td { color: #bbb !important; }
      .row-wd td.name { color: #bbb !important; }

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
      const rondasHtml = rondasComDados.map((r, ri) => {
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
            const tpVal = tpStr(j.to_par);
            const tpC   = tpColor(j.to_par);
            return `<tr class="${manCls.trim()}">
              <td class="pos">${wd ? "" : posCounter}</td>
              <td class="name">${manuel?"★ ":""}${displayName(j.nome)}${wd?' <span style="color:#999;font-size:9px;font-weight:700">WD</span>':""}</td>
              <td class="flag">${flag(j.pais)}</td>
              <td class="lb-topar" style="color:${wd?"#bbb":tpC}">${wd?"WD":tpVal}</td>
              <td class="lb-gross" style="${wd?"color:#bbb":""}">${wd?"–":j.score||"–"}</td>
              ${holes9}
              <td class="lb-halftot">${out9||"–"}</td>
              ${has18 ? holes9b + `<td class="lb-halftot">${in9||"–"}</td>` : ""}
              ${hasPontos?`<td style="color:#d97706;font-weight:700">${j.pontos>0?j.pontos:"–"}</td>`:""}
            </tr>`;
          }).join("");

          const pb = tableIndex++ > 0 ? '<div class="page-break"></div>' : '';
          return `${pb}${escalaoTitle}<h3>Ronda ${r.ronda} · ${jogadores.length} jogadores · ${buracos}H${totalPar ? ` · Par ${totalPar}` : ""}</h3>
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
          </table>`;
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
          const par0 = teeInfo?.par ?? p0?.par ?? [];
          return par0.reduce((s: number, p: number) => s + p, 0) * rondasComDados.length;
        })();

        const rondaHeaders = rondasComDados.map((r, i) => `<th class="lb-gross">R${r.ronda}</th>`).join("");
        const accRows = allSorted.map((p, idx) => {
          const manuel = isManuel(p.nome);
          const manCls = manuel ? "row-manuel" : "";
          const isInc = p.scores.length < rondasComDados.length;
          const tpRaw = totalParAcc > 0 ? p.total - totalParAcc : null;
          const tpVal = tpStr(tpRaw);
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
        <table>
          <thead><tr>
            <th class="pos">#</th><th class="name">Jogador</th><th class="flag"></th>
            <th class="lb-topar">±Par</th><th class="lb-gross">Total</th>
            ${rondaHeaders}
          </tr></thead>
          <tbody>${accRows}</tbody>
        </table>`;
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
      {/* Header torneio */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:17, fontWeight:700, color:"var(--text)", marginBottom:4 }}>{t.name}</div>
        <div style={{ fontSize:12, color:"var(--text-3)", display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <span>📅 {fmtDate(t.date_inicio)}{t.campo ? ` · ${t.campo}` : ""}</span>
          <span>Actualizado {fmtTs(t.ultima_atualizacao)}</span>
          <a href={`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t.t}`}
            target="_blank" rel="noopener noreferrer"
            style={{ color:"var(--text-3)", fontSize:10, textDecoration:"none",
              border:"1px solid var(--border)", borderRadius:5, padding:"1px 7px" }}>
            📋 Resultados ↗
          </a>
          {(LINKS_EXTRA[t.t] ?? []).map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
              style={{ color:"var(--text-3)", fontSize:10, textDecoration:"none",
                border:"1px solid var(--border)", borderRadius:5, padding:"1px 7px" }}>
              {l.label}
            </a>
          ))}
          <button onClick={printRondas} style={{
            marginLeft:"auto", fontSize:10, cursor:"pointer", background:"var(--bg-header)",
            border:"1px solid var(--border)", borderRadius:5, padding:"2px 9px",
            color:"var(--text-2)", fontFamily:"inherit", display:"flex", alignItems:"center", gap:4,
          }}>
            🖨️ Imprimir
          </button>
        </div>
        {manuelRows.length > 0 && (
          <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
            {manuelRows.map((m,i) => {
              const toPar = m.to_par != null
                ? (m.to_par === 0 ? "E" : m.to_par > 0 ? `+${m.to_par}` : `${m.to_par}`)
                : null;
              const liderStr = m.diffLider === 0 ? "líder"
                : m.diffLider != null ? `+${m.diffLider} do líder`
                : null;
              return (
                <span key={i} style={{ background:"var(--accent-light)", border:"1px solid var(--accent)",
                  color:"var(--accent)", padding:"2px 10px", borderRadius:8, fontSize:12, fontWeight:700 }}>
                  Manuel ★ {m.escalao} · R{m.ronda} · {m.score}{toPar ? ` (${toPar})` : ""}{liderStr ? ` · ${liderStr}` : ""}
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
    { key:"sub12",  label:"Sub-12" },
    { key:"sub14",  label:"Sub-14" },
    { key:"d1",     label:"WAGR / Open" },
  ];

  const rows = data.results[cat] ?? [];

  const renderToPar = (v: number | null) => {
    if (v == null) return <span style={{ color:"var(--text-3)" }}>—</span>;
    if (v === 0)   return <span style={{ color:"var(--color-good)", fontWeight:700 }}>E</span>;
    if (v < 0)     return <span style={{ color:"var(--color-good)", fontWeight:700 }}>{v}</span>;
    return <span style={{ color:"var(--text-2)" }}>+{v}</span>;
  };

  return (
    <div style={{ marginTop:24, border:"1px solid var(--border)", borderRadius:10, overflow:"hidden" }}>
      {/* Header clicável */}
      <div onClick={() => setOpen(v => !v)}
        style={{ padding:"10px 16px", background:"var(--bg-header)", cursor:"pointer",
          borderBottom: open ? "1px solid var(--border)" : "none",
          display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:"var(--text)" }}>
            🏆 {data.name}
          </div>
          <div style={{ fontSize:11, color:"var(--text-3)", marginTop:2 }}>
            📅 {data.dates.map(d => fmtDate(d)).join(" · ")} · {data.course}
          </div>
        </div>
        <span style={{ color:"var(--text-3)", fontSize:13 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ padding:"12px 16px" }}>
          {/* Selector de categoria */}
          <div style={{ display:"flex", gap:6, marginBottom:14 }}>
            {cats.map(c => (
              <button key={c.key} onClick={() => setCat(c.key)} style={{
                background: cat===c.key ? "var(--bg-active)" : "var(--bg-card)",
                border:`1px solid ${cat===c.key ? "var(--border-success)" : "var(--border)"}`,
                color:"var(--text-2)", borderRadius:7, padding:"4px 12px",
                fontSize:12, cursor:"pointer", fontWeight: cat===c.key ? 700 : 400,
              }}>{c.label}</button>
            ))}
          </div>

          <table className="sc-lb" style={{ width:"100%" }}>
            <thead>
              <tr>
                <th className="sticky-col-0" style={{ width:26 }}>#</th>
                <th className="sticky-col-1" style={{ textAlign:"left", paddingLeft:10 }}>Jogador</th>
                <th style={{ textAlign:"left", fontSize:11 }}>Clube</th>
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
                        : <span style={{ color:"var(--text-3)", fontSize:11 }}>{r.status}</span>}
                    </td>
                    <td className={`sticky-col-1${manuelRow ? " row-manuel" : ""}`} style={{ textAlign:"left", paddingLeft:10, fontWeight: manuelRow ? 800 : 500 }}>
                      {manuelRow && "★ "}{r.name}
                    </td>
                    <td style={{ fontSize:11, color:"var(--text-3)", padding:"6px 8px" }}>{r.club}</td>
                    <td className="lb-topar" style={{ color: r.toPar == null ? "var(--text-muted)" : r.toPar < 0 ? "var(--color-good)" : r.toPar === 0 ? "var(--text-2)" : "var(--color-danger)" }}>
                      {r.toPar == null ? "–" : r.toPar === 0 ? "E" : r.toPar > 0 ? `+${r.toPar}` : r.toPar}
                    </td>
                    <td className="lb-gross">{r.gross ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
  rivals, fieldData, intlData, matchIntl, matchRival, resultados, defaultOpen, memberHist,
}: {
  torneioT: number; torneioNome: string; torneioData?: string; escalaoManuel?: string;
  rivals: RivalInfo[]; fieldData: FieldData | null; intlData: IntlData | null;
  matchIntl: (nome: string, pais?: string) => IntlJogador | null;
  matchRival: (nome: string, pais?: string) => RivalInfo | null;
  resultados: TorneioResult[];
  defaultOpen?: boolean;
  memberHist: MemberHistData | null;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const torneio = fieldData?.torneios.find(t => t.t === torneioT);

  // Guardar o escalão de referência apenas para o header (contagem)
  const escalao = torneio?.escaloes.find(e =>
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
    <div style={{ marginBottom:8, border:"1px solid var(--border)", borderRadius:10, overflow:"hidden" }}>
      {/* Header do torneio — clicável para collapse */}
      <div onClick={() => setOpen(v => !v)} style={{ padding:"12px 16px", background:"var(--bg-header)",
        borderBottom: open ? "1px solid var(--border)" : "none",
        cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontWeight:700, fontSize:15, color:"var(--text)", marginBottom:2 }}>
            {torneioNome}
          </div>
          <div style={{ fontSize:11, color:"var(--text-3)", display:"flex", gap:10, flexWrap:"wrap" }}>
            {torneioData && <span>📅 {fmtDate(torneioData)}</span>}
            {escalaoManuel && <span>🏌️ {escalaoManuel}</span>}
            {torneio && (
              <span>
                · {inscritos.filter(jj => !isManuel(jj.nome)).length} inscritos
                {anoPassadoMap.size > 0 && <span style={{ marginLeft:6, fontWeight:700, color:"var(--text-2)" }}>· ↩ {anoPassadoMap.size} repetem</span>}
              </span>
            )}
            {!torneio && inscritos.length > 0 && (
              <span>· {inscritos.filter(jj => !isManuel(jj.nome)).length} jogadores</span>
            )}
          </div>
        </div>
        <span style={{ color:"var(--text-3)", fontSize:13, marginLeft:12 }}>{open ? "▲" : "▼"}</span>
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
          memberHist={memberHist}
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
  intlData, manuelIntl, anoPassadoMap, escalaoManuel, memberHist,
}: {
  inscritos: { nome: string; pais: string; escalao: string }[];
  inscritoRivalCache: Map<string, RivalInfo | null>;
  matchIntl: (nome: string, pais?: string) => IntlJogador | null;
  intlData: IntlData | null;
  manuelIntl: IntlJogador | undefined;
  anoPassadoMap: Map<string, { pos: number; escalao: string; ronda: number }>;
  escalaoManuel?: string;
  memberHist: MemberHistData | null;
}) {
  const [filtro, setFiltro] = useState<InscFilter>("todos");
  const [sortCol, setSortCol] = useState<InscSortCol>("encontros");
  const [sortDir, setSortDir] = useState<InscSortDir>("desc");

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
    const mhByName = new Map<string, MemberHistPlayer>();
    if (memberHist) {
      for (const mh of Object.values(memberHist.jogadores)) {
        if (mh.name && mh.name !== '?' && mh.name !== null && !String(mh.name).startsWith('[unknown')) {
          mhByName.set(mh.name.toLowerCase().trim(), mh);
        }
      }
    }

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
      const mhPlayer = mhByName.get(j.nome.toLowerCase().trim());
      const mhTorneios = mhPlayer?.totalTorneios ?? 0;
      return { nome: j.nome, pais: j.pais, escalao: j.escalao, isKnown, ant, isManuelEsc, nEncontros, allEncontros, foiTop3, mhTorneios };
    });
  }, [inscritos, inscritoRivalCache, matchIntl, intlData, manuelIntl, anoPassadoMap, escalaoManuel, memberHist]);

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

    // Obter dados do Manuel no seu escalão
    const manuelRondas = manuelEsc.rondas.flatMap(r => r.leaderboard ?? r.jogadores ?? []);
    manuelJog = manuelRondas.find(j => isManuel(j.nome)) ?? null;
    if (manuelJog) {
      const lb0 = manuelEsc.rondas[0]?.leaderboard ?? manuelEsc.rondas[0]?.jogadores ?? [];
      manuelPos = lb0.findIndex(j => isManuel(j.nome)) + 1 || 99;
    }

    // 2. Escalões adjacentes: age_group ± 1 (método numérico, funciona para
    //    qualquer formato de nome: "Boys 9", "Boys 9-10", etc.)
    const manuelAg = manuelEsc.age_group;
    const adjacentAgs = new Set([manuelAg - 1, manuelAg, manuelAg + 1]);

    // 3. Processar todos os escalões adjacentes (incluindo o do Manuel)
    for (const e of t.escaloes) {
      if (!adjacentAgs.has(e.age_group)) continue;

      const isManuelsEscalao = (e.age_group === manuelAg);
      const todasRondas = e.rondas.flatMap(r => r.leaderboard ?? r.jogadores ?? []);
      const lb0 = e.rondas[0]?.leaderboard ?? e.rondas[0]?.jogadores ?? [];

      const adversariosVistos = new Set<string>();
      for (const r of e.rondas)
        for (const j of (r.leaderboard ?? r.jogadores ?? []))
          if (!isManuel(j.nome)) adversariosVistos.add(j.nome.trim());

      for (const nomeAdv of adversariosVistos) {
        const key = nomeAdv.toLowerCase().trim().replace(/\s+/g, " ");
        const advJog = todasRondas.find(j => j.nome.trim() === nomeAdv);
        if (!advJog) continue;
        const advPos = lb0.findIndex(j => j.nome.trim() === nomeAdv) + 1 || 99;

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

function TabRivais({ data, fieldData, intlData, autoRivals, selectedT, memberHist,
  subTab, setSubTab, selectedRival, setSelectedRival, greatgolfData,
  onRivalsReady,
}: {
  data: ResultsData; fieldData: FieldData | null; intlData: IntlData | null;
  autoRivals: AutoRivalPlayer[]; selectedT: number | null;
  memberHist: MemberHistData | null;
  subTab: RivaisSubTab; setSubTab: (t: RivaisSubTab) => void;
  selectedRival: string | null; setSelectedRival: (r: string | null) => void;
  greatgolfData: GreatgolfData | null;
  onRivalsReady?: (list: { nome: string; pais: string; nEnc: number }[]) => void;
}) {
  const matchIntl = useMemo(() => criarMatcherIntl(intlData), [intlData]);

  const rivals = useMemo<RivalInfo[]>(() => {
    const base = buildRivalsFromResultados(data.resultados);
    const mapa = new Map<string, RivalInfo>(base.map(r => [r.nome.toLowerCase().trim().replace(/\s+/g, " "), r]));

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
  }, [data, intlData, autoRivals]);

  // Notify parent of sidebar-ready rivals list (avoids duplicate computation)
  useEffect(() => {
    if (onRivalsReady && rivals.length > 0) {
      onRivalsReady(
        rivals.map(r => {
          const nTorn = new Set(r.encontros.map(e => tornCanon(e.torneio_nome))).size;
          return { nome: r.nome, pais: r.pais, nEnc: nTorn };
        }).sort((a, b) => b.nEnc - a.nEnc)
      );
    }
  }, [rivals, onRivalsReady]);

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

  if (!rivals.length) return (
    <div style={{ color:"var(--text-3)", padding:"32px 0", textAlign:"center", fontSize:13 }}>
      Sem dados de rivais ainda — os scorecards aparecem após os torneios
    </div>
  );

  // ── MODO PERFIL: rival seleccionado ──
  if (selectedRival) {
    return (
      <div>
        <button onClick={goBack} style={{
          background:"none", border:"none", cursor:"pointer", padding:"4px 0", marginBottom:12,
          fontSize:12, fontWeight:600, color:"var(--accent)", display:"flex", alignItems:"center", gap:4,
        }}>
          ◀ Voltar ao ranking
        </button>
        <PerfilDoRival
          nome={selectedRival} rivals={rivals} matchIntl={matchIntl}
          intlData={intlData} memberHist={memberHist} autoRivals={autoRivals}
          goToProfile={goToProfile}
        />
      </div>
    );
  }

  // ── MODO LISTA: 2 sub-tabs ──
  return (
    <div>
      <div style={{ display:"flex", gap:0, marginBottom:16 }}>
        {([
          { id: "proximos" as const, label: "Próximos torneios" },
          { id: "ranking" as const,  label: "Todos os rivais" },
        ]).map(st => (
          <button key={st.id}
            onClick={() => setSubTab(st.id)}
            className={`tourn-tab${subTab === st.id ? " tourn-tab-active" : ""}`}>
            {st.label}
          </button>
        ))}
      </div>

      {subTab === "proximos" && (
        <SubTabPorTorneio
          torneiosComManuel={torneiosComManuel}
          rivals={rivals} fieldData={fieldData} intlData={intlData}
          matchIntl={matchIntl} matchRival={matchRival} resultados={data.resultados}
          memberHist={memberHist} goToProfile={goToProfile}
        />
      )}

      {subTab === "ranking" && (
        <HistoricoTable rivals={rivals} matchIntl={matchIntl} intlData={intlData}
          memberHist={memberHist} goToProfile={goToProfile} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SubTabPorTorneio — Vista por torneio (rivais + inscritos unificados)
   Mostra TabelaConhecidos per tournament + secções de inscritos futuros
   ════════════════════════════════════════════════════════════════ */
function SubTabPorTorneio({
  torneiosComManuel, rivals, fieldData, intlData, matchIntl, matchRival, resultados, memberHist, goToProfile,
}: {
  torneiosComManuel: { t: number; name: string; date_inicio: string; escalaoManuel?: string; source: "field" | "results" }[];
  rivals: RivalInfo[]; fieldData: FieldData | null; intlData: IntlData | null;
  matchIntl: (nome: string, pais?: string) => IntlJogador | null;
  matchRival: (nome: string, pais?: string) => RivalInfo | null;
  resultados: TorneioResult[];
  memberHist: MemberHistData | null;
  goToProfile: (nome: string) => void;
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
    <table className="dtable-lg" style={{ width:"100%" }}>
      <thead><tr>
        <th style={{ textAlign:"left" }}>Jogador</th>
        <th style={{ width:30, textAlign:"center" }}>🌍</th>
        <th style={{ textAlign:"left" }}>Torneios</th>
        <th style={{ width:36, textAlign:"center" }}>#</th>
      </tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.nome} style={{ background: i%2===0 ? "var(--bg-card)" : "var(--bg-detail)" }}>
            <td style={{ padding:"6px 10px" }}>
              {r.rival ? (
                <span style={{ cursor:"pointer", color:"var(--accent)", fontWeight:600 }} onClick={() => goToProfile(r.nome)}>
                  {displayName(r.nome)}
                </span>
              ) : (
                <span style={{ color:"var(--text-2)" }}>{displayName(r.nome)}</span>
              )}
              {showHist && r.rival && <HistorialLine rival={r.rival} />}
            </td>
            <td style={{ textAlign:"center", fontSize:14 }}>{flag(r.pais)}</td>
            <td style={{ padding:"6px 10px" }}><TorneiosPills torneios={r.torneios} /></td>
            <td style={{ textAlign:"center", fontWeight:700, fontSize:12, color:"var(--text-2)" }}>{r.torneios.length}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
                memberHist={memberHist}
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
   PerfilDoRival — vista detalhada de um rival individual
   Mostra todos os encontros, member history, estatísticas
   ════════════════════════════════════════════════════════════════ */
function PerfilDoRival({
  nome, rivals, matchIntl, intlData, memberHist, autoRivals, goToProfile,
}: {
  nome: string; rivals: RivalInfo[];
  matchIntl: (nome: string, pais?: string) => IntlJogador | null;
  intlData: IntlData | null; memberHist: MemberHistData | null;
  autoRivals: AutoRivalPlayer[]; goToProfile: (nome: string) => void;
}) {
  const rival = useMemo(() => {
    const key = nome.toLowerCase().trim().replace(/\s+/g, " ");
    return rivals.find(r => r.nome.toLowerCase().trim().replace(/\s+/g, " ") === key);
  }, [nome, rivals]);

  // Enriched encounters (same logic as HistoricoTable allRows)
  const enrichedEncontros = useMemo<Encontro[]>(() => {
    if (!rival) return [];
    const encs: Encontro[] = [...rival.encontros];
    const manuelIntl = intlData?.jogadores.find(j => j.isM);
    if (manuelIntl) {
      const intlJog = matchIntl(rival.nome, rival.pais);
      if (intlJog && !intlJog.isM) {
        const existCanons = new Set(encs.map(e => tornCanon(e.torneio_nome)));
        for (const tid of Object.keys(manuelIntl.r)) {
          const rivalRes = intlJog.r[tid];
          if (!rivalRes) continue;
          const torn = intlData?.torneios.find(t => t.id === tid);
          if (!torn) continue;
          if (hasCanon(existCanons, torn.name, torn.short)) continue;
          const manRes = manuelIntl.r[tid];
          encs.push({
            torneio_t: 0, torneio_nome: torn.name, torneio_data: torn.date || "",
            escalao: torn.short || torn.name,
            man_score: 0, rival_score: 0,
            man_to_par: manRes?.tp ?? null, rival_to_par: rivalRes.tp ?? null,
            man_pos: manRes?.p ?? 0, rival_pos: rivalRes.p ?? 0,
            adjacente: false,
          });
        }
      }
    }
    return [...new Map(encs.map(e => [`${tornCanon(e.torneio_nome)}-${e.escalao}`, e])).values()];
  }, [rival, matchIntl, intlData]);

  // Member history
  const mhPlayer = useMemo<MemberHistPlayer | null>(() => {
    if (!memberHist) return null;
    for (const mh of Object.values(memberHist.jogadores)) {
      if (mh.name && mh.name.toLowerCase().trim() === nome.toLowerCase().trim()) return mh;
    }
    return null;
  }, [memberHist, nome]);

  const mhTorneios = useMemo(() => {
    if (!mhPlayer) return [];
    return Object.entries(mhPlayer.torneios)
      .map(([tid, t]) => ({ tid, ...t }))
      .filter(t => t.rounds && Object.keys(t.rounds).length > 0)
      .sort((a, b) => {
        const da = a.startDate || ""; const db = b.startDate || "";
        const pa = da.includes("-") ? da : da.split("/").length===3 ? `${da.split("/")[2]}-${da.split("/")[0].padStart(2,"0")}-${da.split("/")[1].padStart(2,"0")}` : "";
        const pb = db.includes("-") ? db : db.split("/").length===3 ? `${db.split("/")[2]}-${db.split("/")[0].padStart(2,"0")}-${db.split("/")[1].padStart(2,"0")}` : "";
        return pb.localeCompare(pa);
      });
  }, [mhPlayer]);

  // Stats
  const nTorneios = new Set(enrichedEncontros.map(e => tornCanon(e.torneio_nome))).size;
  const manuelWins = enrichedEncontros.filter(e => !e.adjacente && e.man_pos > 0 && e.man_pos < e.rival_pos).length;
  const rivalWins  = enrichedEncontros.filter(e => !e.adjacente && e.man_pos > 0 && e.man_pos > e.rival_pos).length;
  const draws      = enrichedEncontros.filter(e => !e.adjacente && e.man_pos > 0 && e.man_pos === e.rival_pos).length;
  const bestRivalPos = Math.min(...enrichedEncontros.filter(e => e.rival_pos > 0).map(e => e.rival_pos), 999);

  if (!rival) return (
    <div style={{ textAlign:"center", padding:"32px 0", color:"var(--text-3)", fontSize:13 }}>
      Rival não encontrado: "{nome}"
    </div>
  );

  return (
    <div>
      {/* ── Header do rival ── */}
      <div className="card" style={{
        display:"flex", alignItems:"center", gap:16, padding:"14px 20px", marginBottom:16,
      }}>
        <div style={{ fontSize:32 }}>{flag(rival.pais)}</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18, fontWeight:800, color:"var(--text)", marginBottom:2 }}>
            {displayName(rival.nome)}
          </div>
          <div style={{ fontSize:12, color:"var(--text-3)", display:"flex", gap:10, flexWrap:"wrap" }}>
            {rival.pais && <span>{rival.pais}</span>}
            {rival.cidade && <span>· {rival.cidade}</span>}
            {mhPlayer && <span>· USKids ID: {mhPlayer.memberId}</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:16, flexShrink:0 }}>
          <div className="tourn-kpi">
            <div className="tourn-kpi-val">{nTorneios}</div>
            <div className="tourn-kpi-lbl">Torneios</div>
          </div>
          {bestRivalPos < 999 && (
            <div className="tourn-kpi">
              <div className="tourn-kpi-val" style={{ color: bestRivalPos <= 3 ? "var(--color-warn)" : undefined }}>
                {bestRivalPos}º
              </div>
              <div className="tourn-kpi-lbl">Melhor</div>
            </div>
          )}
        </div>
      </div>

      {/* ── KPIs: Manuel vs Rival ── */}
      {(manuelWins + rivalWins + draws) > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10, marginBottom:16 }}>
          <div className="card-success" style={{ textAlign:"center", padding:"10px 8px" }}>
            <div style={{ fontSize:22, fontWeight:900, color:"var(--color-good)" }}>{manuelWins}</div>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--color-good-dark)" }}>VITÓRIAS MANUEL</div>
          </div>
          <div className="card" style={{ textAlign:"center", padding:"10px 8px" }}>
            <div style={{ fontSize:22, fontWeight:900, color:"var(--text-3)" }}>{draws}</div>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--text-3)" }}>EMPATES</div>
          </div>
          <div className="card-danger" style={{ textAlign:"center", padding:"10px 8px" }}>
            <div style={{ fontSize:22, fontWeight:900, color:"var(--color-danger)" }}>{rivalWins}</div>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--color-danger-dark)" }}>VITÓRIAS {displayName(rival.nome).split(" ").pop()?.toUpperCase()}</div>
          </div>
        </div>
      )}

      {/* ── Todos os encontros ── */}
      {enrichedEncontros.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div className="h-md" style={{ marginBottom:8 }}>
            Encontros ({enrichedEncontros.length})
          </div>
          <table className="dtable-lg" style={{ width:"100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign:"left" }}>Torneio</th>
                <th style={{ textAlign:"center", width:90 }}>Escalão</th>
                <th style={{ textAlign:"center", width:60 }}>Manuel</th>
                <th style={{ textAlign:"center", width:60 }}>{displayName(rival.nome).split(" ").pop()}</th>
                <th style={{ textAlign:"center", width:50 }}></th>
              </tr>
            </thead>
            <tbody>
              {enrichedEncontros.map((enc, i) => {
                const isAdj = enc.adjacente;
                const hasVs = !isAdj && enc.man_pos > 0;
                const manMelhor = hasVs && enc.man_pos < enc.rival_pos;
                const manPior   = hasVs && enc.man_pos > enc.rival_pos;
                return (
                  <tr key={i} style={{
                    background: i%2===0 ? "var(--bg-card)" : "var(--bg-detail)",
                    opacity: isAdj ? 0.7 : 1,
                  }}>
                    <td style={{ fontWeight:500, padding:"6px 10px" }}>
                      {shortTornName(enc.torneio_nome)}
                      {enc.torneio_data && <span style={{ fontSize:10, color:"var(--text-3)", marginLeft:6 }}>{fmtDate(enc.torneio_data)}</span>}
                    </td>
                    <td style={{ textAlign:"center" }}>
                      <span style={{
                        fontSize:10, fontWeight:600, padding:"1px 6px", borderRadius:3,
                        background: isAdj ? "var(--bg-muted)" : "var(--bg-success-subtle,rgba(0,128,0,0.06))",
                        color: isAdj ? "var(--text-3)" : "var(--text-2)",
                        border: `1px solid ${isAdj ? "var(--border)" : "var(--border-success,var(--border))"}`,
                      }}>
                        {enc.escalao} {isAdj && <span style={{ fontSize:8 }}>(adj)</span>}
                      </span>
                    </td>
                    <td style={{
                      textAlign:"center", fontWeight:700, fontSize:13,
                      color: hasVs ? (manMelhor ? "var(--color-good)" : manPior ? "var(--color-danger)" : "var(--text-3)") : "var(--text-3)",
                    }}>
                      {enc.man_pos > 0 ? `${enc.man_pos}º` : "—"}
                      {enc.man_to_par != null && enc.man_to_par !== 0 && (
                        <span style={{ fontSize:10, fontWeight:400, marginLeft:3 }}>
                          ({enc.man_to_par > 0 ? `+${enc.man_to_par}` : enc.man_to_par})
                        </span>
                      )}
                    </td>
                    <td style={{
                      textAlign:"center", fontWeight:700, fontSize:13,
                      color: hasVs ? (manPior ? "var(--color-good)" : manMelhor ? "var(--color-danger)" : "var(--text-3)") : "var(--text-2)",
                    }}>
                      {enc.rival_pos > 0 ? `${enc.rival_pos}º` : "—"}
                      {enc.rival_to_par != null && enc.rival_to_par !== 0 && (
                        <span style={{ fontSize:10, fontWeight:400, marginLeft:3 }}>
                          ({enc.rival_to_par > 0 ? `+${enc.rival_to_par}` : enc.rival_to_par})
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign:"center" }}>
                      {hasVs && (
                        <span style={{
                          fontSize:11, fontWeight:800,
                          color: manMelhor ? "var(--color-good)" : manPior ? "var(--color-danger)" : "var(--text-muted)",
                        }}>
                          {manMelhor ? "✓" : manPior ? "✗" : "="}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Member History (USKids) ── */}
      {mhTorneios.length > 0 && (
        <div>
          <div className="h-md" style={{ marginBottom:8 }}>
            📊 Histórico USKids ({mhTorneios.length} torneios)
          </div>
          <table className="dtable" style={{ width:"100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign:"left" }}>Torneio</th>
                <th style={{ textAlign:"center", width:60 }}>Escalão</th>
                <th style={{ textAlign:"center", width:40 }}>Pos</th>
                <th style={{ textAlign:"center", width:55 }}>Total</th>
                <th style={{ textAlign:"center", width:65 }}>Rondas</th>
                <th style={{ textAlign:"left", width:70 }}>Data</th>
              </tr>
            </thead>
            <tbody>
              {mhTorneios.map(t => {
                const nRounds = Object.keys(t.rounds || {}).length;
                const rdGross = Object.values(t.rounds || {}).map(rd => rd.gross).filter(g => g > 0);
                const parTotal = (t.par || []).reduce((a: number, b: number) => a + b, 0);
                const tp = t.totalStrokes && parTotal ? t.totalStrokes - parTotal * nRounds : null;
                const tpStr = tp != null ? (tp > 0 ? `+${tp}` : tp === 0 ? "E" : String(tp)) : "";
                const dateStr = t.startDate || "";
                const isoD = dateStr.includes("-") ? dateStr : dateStr.split("/").length===3 ? `${dateStr.split("/")[2]}-${dateStr.split("/")[0].padStart(2,"0")}-${dateStr.split("/")[1].padStart(2,"0")}` : "";
                const fmtD = isoD ? new Date(isoD).toLocaleDateString("pt-PT",{month:"short",year:"numeric"}) : dateStr;
                return (
                  <tr key={t.tid}>
                    <td style={{ padding:"3px 6px" }}>{t.name}</td>
                    <td style={{ textAlign:"center", fontSize:10, color:"var(--text-2)" }}>{t.ageGroup}</td>
                    <td style={{ textAlign:"center", fontWeight:700,
                      color: t.place <= 3 && t.place > 0 ? "var(--color-good)" : "var(--text-2)" }}>
                      {t.place > 0 ? `${t.place}º` : "—"}
                    </td>
                    <td style={{ textAlign:"center" }}>
                      {t.totalStrokes > 0 ? (
                        <><span style={{ fontWeight:600 }}>{t.totalStrokes}</span>{tpStr && <span style={{ color: tp != null && tp < 0 ? "var(--color-good)" : "var(--text-3)", marginLeft:2, fontSize:10 }}>({tpStr})</span>}</>
                      ) : "—"}
                    </td>
                    <td style={{ textAlign:"center", fontSize:10, color:"var(--text-3)" }}>
                      {rdGross.length > 0 ? rdGross.join(" + ") : "—"}
                    </td>
                    <td style={{ fontSize:10, color:"var(--text-3)" }}>{fmtD}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════
   HistoricoTable — tabela de todos os rivais históricos
   Filtros, ordenação por cabeçalho, encontros flex-wrap, contagem correcta
   ════════════════════════════════════════════════════════════════ */
type HistSortCol = "nome" | "pais" | "torneios" | "encontros" | "hist";
type HistFilter = string; // "todos" | "top3" | "mesmo_esc" | "adj" | circuit prefixes

function HistoricoTable({ rivals, matchIntl, intlData, memberHist, goToProfile }: {
  rivals: RivalInfo[];
  matchIntl: (nome: string, pais?: string) => IntlJogador | null;
  intlData: IntlData | null;
  memberHist: MemberHistData | null;
  goToProfile?: (nome: string) => void;
}) {
  const [filtro, setFiltro] = useState<HistFilter>("todos");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<HistSortCol>("encontros");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  const toggleSort = (col: HistSortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(col === "nome" || col === "pais" ? "asc" : "desc"); }
  };

  // Enrich rivals
  type HRow = {
    nome: string; pais: string; cidade: string;
    allEncontros: Encontro[];
    nTorneios: number;
    foiTop3: boolean;
    hasAdj: boolean;       // tem encontro de escalão adjacente
    circuits: Set<string>; // "uskids", "bjgt", "eowagr", etc.
    mhTorneios: number;    // total de torneios no member history (0 = sem dados)
    mhPlayer: MemberHistPlayer | null; // dados completos do member history
  };

  const allRows = useMemo<HRow[]>(() => {
    const manuelIntl = intlData?.jogadores.find(j => j.isM);

    // Build name-based lookup from memberHist
    const mhByName = new Map<string, MemberHistPlayer>();
    if (memberHist) {
      for (const mh of Object.values(memberHist.jogadores)) {
        if (mh.name && mh.name !== '?' && !mh.name.startsWith('[unknown')) {
          mhByName.set(mh.name.toLowerCase().trim(), mh);
        }
      }
    }

    return rivals.map(r => {
      const encs: Encontro[] = [...r.encontros];

      // Add intl encounters for tournaments NOT already present
      if (manuelIntl) {
        const intlJog = matchIntl(r.nome, r.pais);
        if (intlJog && !intlJog.isM) {
          const existCanons = new Set(encs.map(e => tornCanon(e.torneio_nome)));
          for (const tid of Object.keys(manuelIntl.r)) {
            const rivalRes = intlJog.r[tid];
            if (!rivalRes) continue;
            const torn = intlData?.torneios.find(t => t.id === tid);
            if (!torn) continue;
            if (hasCanon(existCanons, torn.name, torn.short)) continue;
            const manRes = manuelIntl.r[tid];
            encs.push({
              torneio_t: 0, torneio_nome: torn.name, torneio_data: torn.date || "",
              escalao: torn.short || torn.name,
              man_score: 0, rival_score: 0,
              man_to_par: manRes?.tp ?? null, rival_to_par: rivalRes.tp ?? null,
              man_pos: manRes?.p ?? 0, rival_pos: rivalRes.p ?? 0,
              adjacente: false,
            });
          }
        }
      }

      // Dedup by tornCanon + escalão (keep first = autoRivals)
      const allEncontros = [...new Map(
        encs.map(e => [`${tornCanon(e.torneio_nome)}-${e.escalao}`, e])
      ).values()];

      // Count unique tournaments
      const nTorneios = new Set(allEncontros.map(e => tornCanon(e.torneio_nome))).size;

      const foiTop3 = allEncontros.some(e => e.rival_pos > 0 && e.rival_pos <= 3);
      const hasAdj = allEncontros.some(e => !!e.adjacente);

      // Determine circuits
      const circuits = new Set<string>();
      for (const e of allEncontros) {
        const n = e.torneio_nome.toLowerCase();
        if (n.includes("eu open") || n.includes("european")) circuits.add("eowagr");
        else if (n.includes("wjgc") || n.includes("bjgt")) circuits.add("bjgt");
        else if (n.includes("doral")) circuits.add("doral");
        else if (n.includes("great golf") || n.includes("gg")) circuits.add("outros");
        else if (n.includes("qdl") || n.includes("quinta do lago")) circuits.add("outros");
        else if (e.torneio_t > 0) circuits.add("uskids");
        else circuits.add("outros");
      }

      // Match member history by name
      const mhPlayer = mhByName.get(r.nome.toLowerCase().trim()) ?? null;
      const mhTorneios = mhPlayer?.totalTorneios ?? 0;

      return { nome: r.nome, pais: r.pais, cidade: r.cidade, allEncontros, nTorneios, foiTop3, hasAdj, circuits, mhTorneios, mhPlayer };
    });
  }, [rivals, matchIntl, intlData, memberHist]);

  // Filter
  const filtered = useMemo(() => {
    let rows = allRows;
    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r => r.nome.toLowerCase().includes(q) || r.pais.toLowerCase().includes(q));
    }
    // Pill filter
    if (filtro === "top3") rows = rows.filter(r => r.foiTop3);
    else if (filtro === "adj") rows = rows.filter(r => r.hasAdj);
    else if (filtro === "mesmo_esc") rows = rows.filter(r => r.allEncontros.some(e => !e.adjacente));
    else if (filtro.startsWith("circ:")) {
      const circ = filtro.slice(5);
      rows = rows.filter(r => r.circuits.has(circ));
    }
    return rows;
  }, [allRows, filtro, search]);

  // Sort
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let v = 0;
      if (sortCol === "nome") v = a.nome.localeCompare(b.nome);
      else if (sortCol === "pais") v = a.pais.localeCompare(b.pais);
      else if (sortCol === "torneios") v = a.nTorneios - b.nTorneios;
      else if (sortCol === "encontros") v = a.allEncontros.length - b.allEncontros.length;
      else if (sortCol === "hist") v = a.mhTorneios - b.mhTorneios;
      return v * dir;
    });
  }, [filtered, sortCol, sortDir]);

  // Filter pills
  const nTop3 = allRows.filter(r => r.foiTop3).length;
  const nMesmoEsc = allRows.filter(r => r.allEncontros.some(e => !e.adjacente)).length;
  const nAdj = allRows.filter(r => r.hasAdj).length;
  const circuitCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allRows) for (const c of r.circuits) m.set(c, (m.get(c) ?? 0) + 1);
    return m;
  }, [allRows]);

  const circuitLabels: Record<string, string> = {
    uskids: "USKids", bjgt: "BJGT/WJGC", eowagr: "EU Open", doral: "Doral", outros: "Outros",
  };

  const filters: { id: string; label: string; n: number; sep?: boolean }[] = [
    { id: "todos",     label: "Todos",       n: allRows.length },
    { id: "mesmo_esc", label: "Mesmo escalão", n: nMesmoEsc },
    ...(nAdj > 0 ? [{ id: "adj", label: "Esc. adjacente", n: nAdj }] : []),
    { id: "top3",      label: "🏆 Top 3",    n: nTop3 },
    ...["uskids","bjgt","eowagr","doral","outros"]
      .filter(c => (circuitCounts.get(c) ?? 0) > 0)
      .map((c, i) => ({ id: `circ:${c}`, label: circuitLabels[c] || c, n: circuitCounts.get(c)!, sep: i === 0 })),
  ];

  const ThSort = ({ col, label, style }: { col: HistSortCol; label: string; style?: React.CSSProperties }) => (
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
      <div style={{ fontSize:13, fontWeight:700, color:"var(--text-2)", marginBottom:12 }}>
        Todos os adversários históricos ({allRows.length})
      </div>

      {/* Search + filter pills */}
      <div style={{ display:"flex", gap:5, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Nome ou país…"
          style={{ border:"1px solid var(--border)", borderRadius:7,
            color:"var(--text)", background:"var(--bg-card)",
            padding:"5px 10px", fontSize:11, width:160, outline:"none", marginRight:4 }} />
        {filters.map(f => (
          <React.Fragment key={f.id}>
            {f.sep && <span style={{ width:1, height:18, background:"var(--border)", margin:"0 2px", flexShrink:0 }} />}
            <button onClick={() => setFiltro(prev => prev === f.id ? "todos" : f.id)} style={{
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
        <span style={{ color:"var(--text-3)", fontSize:11, marginLeft:4 }}>{sorted.length} jogadores</span>
      </div>

      {sorted.length === 0 ? (
        <div style={{ fontSize:12, color:"var(--text-3)", padding:"8px 0 12px" }}>Nenhum jogador neste filtro.</div>
      ) : (
        <table className="sc-lb" style={{ width:"100%" }}>
          <thead>
            <tr>
              <th className="sticky-col-0" style={{ width:26 }}>#</th>
              <ThSort col="nome" label="Jogador" style={{ textAlign:"left", paddingLeft:10, minWidth:130 }} />
              <ThSort col="pais" label="🌍" style={{ width:30, textAlign:"center" }} />
              <ThSort col="hist" label="📊" style={{ width:36, textAlign:"center" }} />
              <ThSort col="torneios" label="Torn." style={{ width:42, textAlign:"center" }} />
              <ThSort col="encontros" label="Encontros com o Manuel" style={{ textAlign:"left", padding:"6px 8px", minWidth:280 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const mh = r.mhPlayer;
              const mhTorneios = mh ? Object.entries(mh.torneios)
                .map(([tid, t]) => ({ tid, ...t }))
                .filter(t => t.rounds && Object.keys(t.rounds).length > 0)
                .sort((a, b) => {
                  const da = a.startDate || ""; const db = b.startDate || "";
                  const pa = da.includes("-") ? da : da.split("/").length===3 ? `${da.split("/")[2]}-${da.split("/")[0].padStart(2,"0")}-${da.split("/")[1].padStart(2,"0")}` : "";
                  const pb = db.includes("-") ? db : db.split("/").length===3 ? `${db.split("/")[2]}-${db.split("/")[0].padStart(2,"0")}-${db.split("/")[1].padStart(2,"0")}` : "";
                  return pb.localeCompare(pa);
                }) : [];

              return (
              <React.Fragment key={r.nome}>
              <tr>
                <td className="sticky-col-0" style={{ textAlign:"center", fontWeight:700, color:"var(--text-3)", fontSize:11 }}>{i + 1}</td>
                <td style={{ textAlign:"left", paddingLeft:10 }}>
                  <span style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <span style={{ cursor: goToProfile ? "pointer" : "default", color: goToProfile ? "var(--accent)" : "var(--text)" }}
                      onClick={() => goToProfile?.(r.nome)}>
                      {displayName(r.nome)}
                    </span>
                    {r.foiTop3 && (
                      <span style={{ background:"var(--color-warn)", color:"#fff",
                        fontSize:10, fontWeight:800, padding:"1px 5px", borderRadius:4, whiteSpace:"nowrap" }}>
                        🏆 top 3
                      </span>
                    )}
                    {r.cidade && <span style={{ color:"var(--text-3)", fontSize:10, marginLeft:2 }}>{r.cidade}</span>}
                  </span>
                </td>
                <td style={{ textAlign:"center", fontSize:14 }}>{flag(r.pais)}</td>
                <td style={{ textAlign:"center", fontSize:11, cursor: mhTorneios.length > 0 ? "pointer" : "default",
                  color: r.mhTorneios > 0 ? "var(--accent,#2563eb)" : "var(--text-3)",
                  fontWeight: r.mhTorneios > 0 ? 700 : 400, textDecoration: r.mhTorneios > 0 ? "underline" : "none" }}
                  title={r.mhTorneios > 0 ? `Clica para ver ${r.mhTorneios} torneios` : "Sem dados de histórico"}
                  onClick={() => { if (mhTorneios.length > 0) setExpandedPlayer(prev => prev === r.nome ? null : r.nome); }}>
                  {r.mhTorneios > 0 ? r.mhTorneios : "—"}
                </td>
                <td style={{ textAlign:"center", fontWeight:700, color:"var(--text-2)", fontSize:12 }}>{r.nTorneios}</td>
                <td style={{ fontSize:11, padding:"5px 8px", lineHeight:1.9, textAlign:"left" }}>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 10px" }}>
                    {r.allEncontros.map(enc => {
                      const isAdj = enc.adjacente;
                      const hasVs = !isAdj && enc.man_pos > 0;
                      const manMelhor = hasVs && enc.man_pos < enc.rival_pos;
                      const manPior   = hasVs && enc.man_pos > enc.rival_pos;
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
                </td>
              </tr>
              {/* ── Expanded member history row ── */}
              {expandedPlayer === r.nome && mhTorneios.length > 0 && (
                <tr>
                  <td colSpan={6} style={{ padding:0, background:"var(--bg-muted,#f8f8f8)" }}>
                    <div style={{ padding:"8px 16px 12px 40px", maxHeight:320, overflowY:"auto" }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"var(--text-2)", marginBottom:6 }}>
                        📊 Histórico USKids de {displayName(r.nome)} — {mhTorneios.length} torneios com resultados
                      </div>
                      <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse" }}>
                        <thead>
                          <tr style={{ borderBottom:"1px solid var(--border)", color:"var(--text-3)" }}>
                            <th style={{ textAlign:"left", padding:"3px 6px", fontWeight:600 }}>Torneio</th>
                            <th style={{ textAlign:"center", padding:"3px 6px", fontWeight:600, width:60 }}>Escalão</th>
                            <th style={{ textAlign:"center", padding:"3px 6px", fontWeight:600, width:40 }}>Pos</th>
                            <th style={{ textAlign:"center", padding:"3px 6px", fontWeight:600, width:50 }}>Total</th>
                            <th style={{ textAlign:"center", padding:"3px 6px", fontWeight:600, width:60 }}>Rondas</th>
                            <th style={{ textAlign:"left", padding:"3px 6px", fontWeight:600 }}>Data</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mhTorneios.map(t => {
                            const nRounds = Object.keys(t.rounds || {}).length;
                            const rdGross = Object.values(t.rounds || {}).map(rd => rd.gross).filter(g => g > 0);
                            const parTotal = (t.par || []).reduce((a: number, b: number) => a + b, 0);
                            const tp = t.totalStrokes && parTotal ? t.totalStrokes - parTotal * nRounds : null;
                            const tpStr = tp != null ? (tp > 0 ? `+${tp}` : tp === 0 ? "E" : String(tp)) : "";
                            const dateStr = t.startDate || "";
                            const isoD = dateStr.includes("-") ? dateStr : dateStr.split("/").length===3 ? `${dateStr.split("/")[2]}-${dateStr.split("/")[0].padStart(2,"0")}-${dateStr.split("/")[1].padStart(2,"0")}` : "";
                            const fmtD = isoD ? new Date(isoD).toLocaleDateString("pt-PT",{month:"short",year:"numeric"}) : dateStr;
                            return (
                              <tr key={t.tid} style={{ borderBottom:"1px solid var(--border-light,#eee)" }}>
                                <td style={{ padding:"3px 6px", color:"var(--text)" }}>{t.name}</td>
                                <td style={{ padding:"3px 6px", textAlign:"center", color:"var(--text-2)", fontSize:10 }}>{t.ageGroup}</td>
                                <td style={{ padding:"3px 6px", textAlign:"center", fontWeight:700,
                                  color: t.place <= 3 && t.place > 0 ? "var(--color-good)" : "var(--text-2)" }}>
                                  {t.place > 0 ? `${t.place}º` : "—"}
                                </td>
                                <td style={{ padding:"3px 6px", textAlign:"center" }}>
                                  {t.totalStrokes > 0 ? (
                                    <><span style={{ fontWeight:600 }}>{t.totalStrokes}</span>{tpStr && <span style={{ color: tp != null && tp < 0 ? "var(--color-good)" : "var(--text-3)", marginLeft:2, fontSize:10 }}>({tpStr})</span>}</>
                                  ) : "—"}
                                </td>
                                <td style={{ padding:"3px 6px", textAlign:"center", fontSize:10, color:"var(--text-3)" }}>
                                  {rdGross.length > 0 ? rdGross.join(" + ") : "—"}
                                </td>
                                <td style={{ padding:"3px 6px", color:"var(--text-3)", fontSize:10 }}>{fmtD}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}





// ─────────────────────────────────────────────
// TAB INSCRITOS
// ─────────────────────────────────────────────
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
    const flightRoundPar = new Map<string, number[]>(); // key: `${fid}_R${rn}`

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
    for (const [fidStr, flight] of Object.entries(flightsDict)) {
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
type RivaisSubTab = "proximos" | "ranking";

export default function USKidsFieldPage() {
  const [fieldData,   setFieldData]   = useState<FieldData | null>(null);
  const [resultsData, setResultsData] = useState<ResultsData | null>(null);
  const [intlData,    setIntlData]    = useState<IntlData | null>(null);
  const [autoRivals,  setAutoRivals]  = useState<AutoRivalPlayer[]>([]);
  const [greatgolfData, setGreatgolfData] = useState<GreatgolfData | null>(null);
  const [memberHist,   setMemberHist]   = useState<MemberHistData | null>(null);
  const [tab,         setTab]         = useState<Tab>("campo");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rivaisSubTab, setRivaisSubTab] = useState<RivaisSubTab>("proximos");
  const [selectedRival, setSelectedRival] = useState<string | null>(null);
  const [sidebarRivalSearch, setSidebarRivalSearch] = useState("");
  const [erro,        setErro]        = useState<string | null>(null);
  const [selectedT,   setSelectedT]   = useState<number | null>(null);

  useEffect(() => {
    fetch("/data/uskids-field.json?v=" + Date.now())
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: FieldData) => {
        setFieldData(d);
        if (d.torneios.length) setSelectedT(d.torneios[0].t);
      })
      .catch(e => setErro(e.message));

    // ── Carregar resultados: 15 ficheiros históricos permanentes + ficheiro auto-gerado ──
    // Os históricos têm prioridade; o auto-gerado apenas acrescenta torneios ainda não cobertos.
    const TORNEIOS_COMPLETOS_COUNT = 19;
    const historicosUrls = Array.from({ length: TORNEIOS_COMPLETOS_COUNT }, (_, i) =>
      `/data/uskids_torneios_completos(${i + 1}).json`
    );

    Promise.all([
      // ficheiro auto-gerado (carregado em paralelo com os históricos)
      fetch("/data/uskids-results.json?v=" + Date.now())
        .then(r => r.ok ? r.json() : { gerado_em: "", resultados: [] })
        .catch((): ResultsData => ({ gerado_em: "", resultados: [] })),
      // 15 ficheiros históricos permanentes
      ...historicosUrls.map(url =>
        fetch(url)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      ),
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

    // Carregar auto-rivals (BJGT/EOWAGR/Doral — todos os escalões adjacentes)
    buildAutoRivals().then(setAutoRivals).catch(() => {});

    // Carregar member history (histórico completo dos rivais USKids)
    fetch("/data/uskids-member-history.json?v=" + Date.now())
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMemberHist(d as MemberHistData); })
      .catch(() => {});
  }, []);

  const nResultados = resultsData?.resultados?.length ?? 0;

  // Sidebar rivals — populated by TabRivais via callback (avoids duplicate buildRivalsFromResultados)
  const [sidebarRivals, setSidebarRivals] = useState<{ nome: string; pais: string; nEnc: number }[]>([]);
  const onRivalsReady = useCallback((list: { nome: string; pais: string; nEnc: number }[]) => {
    setSidebarRivals(list);
  }, []);

  // nRivais: contagem rápida para badge (sem buildRivalsFromResultados pesado)
  // Usa sidebarRivals se já foram calculados, senão conta autoRivals como estimativa
  const nRivais = sidebarRivals.length > 0
    ? sidebarRivals.length
    : autoRivals.filter(p => {
        const n = p.n.toLowerCase();
        return !(n.includes("medeiros") && n.includes("manuel"));
      }).length;

  const torneiosCampo = useMemo(() => fieldData?.torneios ?? [], [fieldData]);
  const torneiosResultados = useMemo(() => resultsData?.resultados ?? [], [resultsData]);

  const allTorneios = useMemo(() => {
    const map = new Map<number, { t: number; name: string; date: string; dateFim?: string; temResultados: boolean; temCampo: boolean; inscritos?: number; maximo?: number; vagas?: number; escalaoManuel?: string; rondas?: number; fee?: number; campo?: string; totalInscritos?: number; totalMaximo?: number; urlResultados?: string; manuelJogou?: boolean; terminado?: boolean }>();
    for (const t of torneiosCampo) {
      if (!t.t || !t.name) continue;
      if (!isUSKidsTorneio(t.name)) continue; // Filtrar torneios não-USKids
      const em = escalaoManuelParaData(t.date_inicio);
      const esc = t.escaloes?.find((e: any) => e.nome === em);
      const ended = isTerminado(t.date_fim, t.date_inicio);
      map.set(t.t, { t: t.t, name: t.name, date: t.date_inicio, dateFim: t.date_fim ?? undefined, temResultados: false, temCampo: true,
        inscritos: esc?.inscritos, maximo: esc?.maximo, vagas: esc?.vagas, escalaoManuel: em,
        rondas: t.rondas ?? undefined,
        fee: t.fee_18 ? parseFloat(t.fee_18) : undefined,
        campo: t.campo ?? undefined,
        totalInscritos: t.total_inscritos ?? undefined,
        totalMaximo: t.total_maximo ?? undefined,
        terminado: ended,
      });
    }
    for (const t of torneiosResultados) {
      if (!t.t || !t.name) continue;
      if (!isUSKidsTorneio(t.name)) continue; // Filtrar torneios não-USKids
      // Determinar se o Manuel jogou: recalcular SEMPRE pelos nomes reais (não confiar
      // em is_manuel do JSON — foi gerado pelo pipeline com a lógica antiga que só
      // verificava "medeiros", podendo ter marcado outro jogador erroneamente)
      const manuelJogou = t.escaloes?.some((e: EscalaoResult) =>
        e.rondas?.some((r: RondaResult) =>
          (r.leaderboard ?? r.jogadores ?? []).some((j: RondaJogador) => isManuel(j.nome))
        )
      ) ?? false;
      const ended = isTerminado(t.date_fim, t.date_inicio);
      if (map.has(t.t)) {
        map.get(t.t)!.temResultados = true;
        if (t.url_resultados) map.get(t.t)!.urlResultados = t.url_resultados;
        if (manuelJogou) map.get(t.t)!.manuelJogou = true;
        if (!map.get(t.t)!.dateFim && t.date_fim) map.get(t.t)!.dateFim = t.date_fim;
        if (ended) map.get(t.t)!.terminado = true;
      } else {
        map.set(t.t, { t: t.t, name: t.name, date: t.date_inicio, dateFim: t.date_fim ?? undefined, temResultados: true, temCampo: false, urlResultados: t.url_resultados, manuelJogou, terminado: ended });
      }
    }
    return [...map.values()]
      .filter(t => t.name && t.date)
      .sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)));
  }, [torneiosCampo, torneiosResultados]);

  if (erro) return (
    <div style={{ padding:32, color:"var(--color-danger)", fontFamily:"monospace", fontSize:13 }}>
      ⚠️ {erro}
    </div>
  );
  if (!fieldData) return (
    <div style={{ padding:32, color:"var(--text-3)", fontSize:13 }}>A carregar…</div>
  );

  // Quando muda de tab, verificar se o torneio seleccionado existe nessa tab
  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    // Seleccionar o primeiro torneio disponível para a nova tab se o actual não existir
    if (newTab === "resultados" && selectedT) {
      const exists = torneiosResultados.some(t => t.t === selectedT);
      if (!exists && torneiosResultados.length) setSelectedT(torneiosResultados[0].t);
    }
  };

  const TABS: { id: Tab; label: string; badge: number }[] = [
    { id:"campo",      label:"⛳ Torneios",   badge: fieldData.torneios.length },
    { id:"resultados", label:"🏆 Resultados", badge: nResultados },
    { id:"rivais",     label:"🤝 Rivais",     badge: nRivais },
  ];

  const selectedFieldTorneio = fieldData.torneios.find(t => t.t === selectedT) ?? null;

  return (
    <div className="tourn-layout" style={{ height:"calc(100vh - 52px)" }}>

      {/* ── TOOLBAR ── */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)}
            title={sidebarOpen ? "Fechar painel" : "Abrir painel"}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <span className="toolbar-title">🏌️ USKids Golf</span>
          <div className="toolbar-sep" />
          <div className="escalao-pills">
            {TABS.map(tb => (
              <button key={tb.id}
                onClick={() => handleTabChange(tb.id)}
                className={`tourn-tab tourn-tab-sm${tab === tb.id ? " active" : ""}`}
                style={tab === tb.id ? {} : { background:"var(--bg-muted)", color:"var(--text-2)", borderColor:"var(--border)" }}>
                {tb.label}
                {tb.badge > 0 && (
                  <span style={{
                    marginLeft:5, fontSize:10, fontWeight:700, padding:"0 5px", borderRadius:8,
                    background: tab === tb.id ? "rgba(255,255,255,0.25)" : "var(--bg-hover)",
                    color: tab === tb.id ? "#fff" : "var(--text-3)",
                  }}>{tb.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-right">
          <a href="https://uskids-golf.vercel.app/" target="_blank" rel="noopener noreferrer"
            style={{
              fontSize:11, fontWeight:600, cursor:"pointer",
              color:"var(--accent)", border:"1px solid var(--accent)",
              borderRadius:5, padding:"3px 8px", lineHeight:1.6,
              textDecoration:"none", whiteSpace:"nowrap",
              display:"inline-flex", alignItems:"center", gap:3,
            }}>
            Histórico ↗
          </a>
        </div>
      </div>

      {/* ── MASTER-DETAIL ── */}
      <div className="master-detail">

        {/* ── SIDEBAR ── */}
        <div className={`sidebar${sidebarOpen ? "" : " sidebar-closed"}`} style={{ minWidth:230, maxWidth:270 }}>

        {/* Lista de torneios agrupada por mês — OU lista de rivais */}
        <div style={{ overflowY:"auto", flex:1 }}>

          {/* ── Sidebar: RIVAIS (quando no tab rivais) ── */}
          {tab === "rivais" ? (
            <div>
              <div style={{ padding:"6px 8px", borderBottom:"1px solid var(--border-light)" }}>
                <input value={sidebarRivalSearch} onChange={e => setSidebarRivalSearch(e.target.value)}
                  placeholder="🔎 Pesquisar rival…"
                  style={{ width:"100%", border:"1px solid var(--border)", borderRadius:6,
                    background:"var(--bg-card)", color:"var(--text)",
                    padding:"5px 8px", fontSize:11, outline:"none", boxSizing:"border-box" }} />
              </div>
              {(() => {
                const q = sidebarRivalSearch.toLowerCase().trim();
                const filtered = q
                  ? sidebarRivals.filter(r => r.nome.toLowerCase().includes(q) || r.pais.toLowerCase().includes(q))
                  : sidebarRivals;
                return filtered.map(r => {
                  const active = selectedRival === r.nome;
                  return (
                    <button key={r.nome}
                      onClick={() => setSelectedRival(prev => prev === r.nome ? null : r.nome)}
                      className={`course-item${active ? " active" : ""}`}
                      style={{ width:"100%", textAlign:"left", padding:"5px 10px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ display:"flex", alignItems:"center", gap:5, minWidth:0, overflow:"hidden" }}>
                        <span style={{ fontSize:13, flexShrink:0 }}>{flag(r.pais)}</span>
                        <span style={{ fontSize:12, fontWeight: active ? 700 : 500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                          {displayName(r.nome)}
                        </span>
                      </span>
                      <span style={{
                        flexShrink:0, fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:8,
                        background: active ? "var(--accent)" : "var(--bg-muted)",
                        color: active ? "#fff" : "var(--text-3)",
                      }}>{r.nEnc}</span>
                    </button>
                  );
                });
              })()}
              {sidebarRivals.length === 0 && (
                <div style={{ padding:"16px 12px", fontSize:11, color:"var(--text-3)", textAlign:"center" }}>
                  Sem rivais encontrados
                </div>
              )}
            </div>
          ) : (
          /* ── Sidebar: TORNEIOS (default) ── */
          (() => {
            // Filtrar: no tab "campo", separar terminados dos activos
            const activeList = tab === "campo"
              ? allTorneios.filter(t => !t.terminado)
              : allTorneios;
            const endedList = tab === "campo"
              ? allTorneios.filter(t => t.terminado)
              : [];

            // agrupar por mês/ano
            const buildMonthMap = (list: typeof allTorneios) => {
              const monthMap: Record<string, typeof allTorneios> = {};
              const currentYear = new Date().getFullYear().toString();
              for (const t of list) {
                const iso = isoDate(t.date);
                const yr  = iso ? iso.substring(0, 4) : "?";
                const mo  = iso ? iso.substring(0, 7) : "?";
                // anos anteriores ao corrente → agrupar por ano; ano corrente → por mês
                const key = (yr === currentYear || yr === "?") ? mo : yr;
                if (!monthMap[key]) monthMap[key] = [];
                monthMap[key].push(t);
              }
              return monthMap;
            };
            const monthMap = buildMonthMap(activeList);
            const endedMap = buildMonthMap(endedList);

            const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
            const monthLabel = (key: string) => {
              if (key === "?") return "Data desconhecida";
              if (key.length === 4) return key; // ano
              const [yr, mo] = key.split("-");
              return `${months[parseInt(mo) - 1] || mo} ${yr}`;
            };
            const today = new Date().toISOString().substring(0, 7);
            const currentYear = new Date().getFullYear().toString();

            const sortKeys = (map: Record<string, typeof allTorneios>, reverse?: boolean) => {
              const allKeys = Object.keys(map);
              const futureKeys = allKeys.filter(k => k >= today || (k.length === 4 && k > currentYear)).sort();
              const pastKeys   = allKeys.filter(k => k <  today && !(k.length === 4 && k > currentYear)).sort();
              if (reverse) return [...pastKeys, ...futureKeys];
              return [...futureKeys, ...pastKeys];
            };

            const mainKeys = tab === "resultados"
              ? sortKeys(monthMap, true)   // resultados: passados primeiro (2023 → 2024 → …)
              : sortKeys(monthMap);        // campo/rivais: próximos primeiro
            // Terminados: cronológico inverso (mais recentes primeiro)
            const endedKeys = sortKeys(endedMap, true);

            const renderGroup = (gmap: Record<string, typeof allTorneios>, keys: string[], dimmed?: boolean) =>
              keys.map(key => (
              <div key={key + (dimmed ? "_ended" : "")}>
                <div className="sidebar-section-title-dark">{monthLabel(key)}</div>
                {gmap[key].map(t => {
                  const active = t.t === selectedT;
                  const temConteudo = tab === "resultados" ? t.temResultados : t.temCampo;
                  const reg = torneioRegiao(t.name);
                  const isEuro = reg === "EURO";
                  const isInvit = !!REGIONAL_CHAMPIONSHIPS[t.t];
                  const pct = t.maximo ? Math.min(100, Math.round(((t.inscritos ?? 0) / t.maximo) * 100)) : 0;
                  return (
                    <button key={t.t}
                      onClick={() => {
                        setSelectedT(t.t);
                        // Torneio terminado com resultados → mudar para tab resultados
                        if (dimmed && t.temResultados && tab === "campo") handleTabChange("resultados");
                      }}
                      className={`course-item${active ? " active" : ""}`}
                      style={{ opacity: dimmed ? 0.55 : (temConteudo ? 1 : 0.45), width:"100%", textAlign:"left" }}>

                      {/* Linha 1: nome + badges à direita */}
                      <div style={{ display:"flex", alignItems:"flex-start", gap:4, marginBottom:3 }}>
                        <span style={{ flex:1, minWidth:0, fontWeight: active ? 700 : 500, fontSize:12, lineHeight:1.3 }}>
                          {t.name.replace(/\s*\d{4}$/, "")}
                        </span>
                        <div style={{ display:"flex", gap:2, flexShrink:0, paddingTop:1, flexWrap:"wrap", justifyContent:"flex-end" }}>
                          {reg && (
                            <span style={{
                              fontSize:10, fontWeight:800, padding:"1px 5px", borderRadius:4,
                              background: isEuro ? "var(--bg-info)" : "#fff3e0",
                              color: isEuro ? "var(--color-info)" : "#e65100",
                              border:`1px solid ${isEuro ? "var(--border-info)" : "#ffcc80"}`,
                              whiteSpace:"nowrap",
                            }}>{reg}</span>
                          )}
                          {isInvit && (
                            <span style={{
                              fontSize:10, fontWeight:800, padding:"1px 5px", borderRadius:4,
                              background:"var(--bg-pink)", color:"var(--color-purple)", border:"1px solid #e1bee7",
                              whiteSpace:"nowrap",
                            }}>INVIT</span>
                          )}
                          {t.temResultados && <span style={{ fontSize:11 }}>🏆</span>}
                        </div>
                      </div>

                      {/* Linha 2: campo */}
                      {t.campo && (
                        <div style={{ fontSize:11, color:"var(--text-2)", fontWeight:500, marginBottom:3 }}>
                          📍 {t.campo.split(',')[0]}
                        </div>
                      )}

                      {/* Linha 3: data · rondas · escalão */}
                      <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:3, display:"flex", gap:4, flexWrap:"wrap" }}>
                        <span>{fmtDate(t.date)}</span>
                        {t.rondas && <span>· {t.rondas}R</span>}
                        {t.escalaoManuel && <span>· {t.escalaoManuel}</span>}
                      </div>

                      {/* Linha 4b: pill Manuel jogou */}
                      {t.manuelJogou && (
                        <span title="Manuel participou neste torneio" style={{
                          display:"inline-block", marginBottom:3,
                          fontSize:10, fontWeight:700,
                          background:"var(--bg-success-subtle)", color:"var(--color-good-dark)",
                          borderRadius:6, padding:"2px 8px",
                          border:"1px solid var(--color-good)",
                        }}>★ Manuel</span>
                      )}

                      {/* Linha 4: barra de inscritos */}
                      {!dimmed && t.temCampo && t.maximo != null && t.maximo > 0 && (
                        <div style={{ marginTop:4 }}>
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

                      {/* Linha 5: total + fee */}
                      {!dimmed && t.temCampo && (t.totalMaximo ?? 0) > 0 && (
                        <div style={{ fontSize:11, marginTop:4, color:"var(--text-3)", display:"flex", justifyContent:"space-between" }}>
                          <span>Total: {t.totalInscritos}/{t.totalMaximo}</span>
                          {t.fee && <span>${t.fee.toFixed(0)}</span>}
                        </div>
                      )}

                    </button>
                  );
                })}
              </div>
            ));
            return <>
              {renderGroup(monthMap, mainKeys)}
              {endedKeys.length > 0 && (
                <>
                  <div className="sidebar-section-title-dark" style={{ color:"var(--text-muted)", fontStyle:"italic", borderTop:"2px solid var(--border)" }}>
                    Terminados
                  </div>
                  {renderGroup(endedMap, endedKeys, true)}
                </>
              )}
            </>;
          })()
          )}
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
            : <div className="muted" style={{ padding:32, textAlign:"center" }}>Selecciona um torneio</div>
        )}

        {tab === "resultados" && resultsData && (
          <TabResultados greatgolfData={greatgolfData}
            data={resultsData}
            selectedT={selectedT}
          />
        )}
        {tab === "resultados" && !resultsData && (
          <div style={{color:"var(--text-3)",padding:"24px 0"}}>A carregar resultados…</div>
        )}

        {tab === "rivais" && resultsData && (
          <TabRivais data={resultsData} fieldData={fieldData} intlData={intlData}
            autoRivals={autoRivals} selectedT={selectedT} memberHist={memberHist}
            subTab={rivaisSubTab} setSubTab={setRivaisSubTab}
            selectedRival={selectedRival} setSelectedRival={setSelectedRival}
            greatgolfData={greatgolfData}
            onRivalsReady={onRivalsReady}
          />
        )}
        {tab === "rivais" && !resultsData && (
          <div style={{color:"var(--text-3)",padding:"24px 0"}}>A carregar…</div>
        )}

      </div>
      {/* ← fecha master-detail */}
      </div>
    {/* ← fecha tourn-layout */}
    </div>
  );
}
