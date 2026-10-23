/**
 * src/data/ranking/fpgRanking.ts — as contas dos rankings da /FPG (fase 2,
 * 23/10/2026): Ranking PJA, Ranking Sub-12 por SD e Classificações.
 *
 * Saíram do `PJARankingView` sem mudar uma regra: o ecrã só desenha. A
 * classificação dos torneios, os multiplicadores e os pontos continuam a vir da
 * FONTE ÚNICA partilhada com ranking-pja.vercel.app (`ranking-pja/pja-rules.mjs`)
 * — alterar regras LÁ, nunca aqui.
 *
 * Regras de cálculo do total (por ano):
 *  - PJA 2025 (legacy): TOP-7 melhores torneios + Grande Final somada à parte;
 *    Vale Pisão D1 (10370) + D2 (10371) contam como UM torneio (Excel oficial
 *    da comissão técnica PJA, «PONTUAÇÕES E RANKINGS 2025.xlsx»).
 *  - PJA 2026+ (Regulamento PJA TOUR 2026): TOP-14 voltas; Aquapor só os 2
 *    primeiros do ano e só para quem não jogou Drive Tour; Greatgolf Main só
 *    R2+R3; Grande Final ×1,5; só membros PJA (tag "PJA").
 *  - Sem regras PJA (`specialRules: false`, as Classificações): TOP-14 voltas,
 *    todas as rondas contam, todos os torneios pesam o mesmo.
 *  - metric "sd" (Sub-12): média das BEST_SD_N melhores SD oficiais da FPG,
 *    mínimo MIN_SD_ROUNDS voltas; MENOR é melhor. Ver scripts/build-sub12-ranking.js.
 */
import type { Tournament } from "../fpgTypes";
import type { PlayersDB } from "../../ui/tournamentPrimitives";
import { escalaoAtDate } from "../../utils/format";
import {
  pjaPts, isGFTournament, getTournMultiplier, classifyPJAEvent,
} from "../../../ranking-pja/pja-rules.mjs";

export type RankMetric = "pts" | "sd";

export interface RankRound {
  roundKey: string;
  label: string;
  date: string;
}

export interface RankTournCol {
  tournKey: string;
  name: string;
  date: string;
  campo: string;
  isGF: boolean;
  /** Multiplicador de pontos aplicado a todas as rondas deste torneio.
   *  1.0 standard; 1.5 Grande Final; valores especiais por tcode em
   *  TOURN_MULTIPLIER (ex: Royal Óbidos AT&T 2025 com x1.75). */
  mult: number;
  rounds: RankRound[];
  colSpan: number;
  /** ccode do torneio — usado para construir URL `/FPG/torneio/{ccode}-{tcode}`. */
  ccode?: string;
  /** tcode (ou tcode+tcode para sintéticos). */
  tcode?: string;
  /** Nº real de rondas do torneio — pode ser maior que `rounds.length` quando
   *  alguma ronda está ocultada por regra (ex: GG Main 3R → mostra só R2+R3). */
  totalRondas?: number;
  /** Coluna que junta várias provas (ex: "3º Drive Tour" = as 4 regiões). As
   *  "rondas" aqui são VOLTAS que podem vir de provas diferentes — não são
   *  rondas do mesmo torneio, por isso não levam o pill de nº de rondas. */
  agregado?: boolean;
}

export interface RankRoundResult {
  toPar: number;
  pts: number;
  /** Só no modo metric="sd": o SD oficial da FPG nesta volta. */
  sd?: number | null;
  /** Metros jogados nessa volta (o tee/campo varia entre jogadores quando a
   *  coluna agrega várias provas — ex: "3º Drive Challenge" junta as regiões). */
  meters?: number | null;
  /** Prova concreta que o jogador disputou dentro de uma coluna agregada. */
  prova?: string | null;
  inTop14: boolean;
  /** Ronda foi excluída do ranking (ex. GG Main R1, Aquapor com DT, >2 Aquapor). */
  excluded?: boolean;
  /** Razão da exclusão, para tooltip/debug. */
  excludedReason?: string;
}

export interface RankRow {
  key: string;
  name: string;
  fedCode?: string;
  club: string;
  escalao: string;
  sex: string;
  hcp: number | null;
  /** Regiões onde o jogador competiu (circuitos regionais). */
  regioes: string[];
  results: Map<string, RankRoundResult>;
  /** Voltas que contam para o ranking. Inclui tournKey/isGF/tcode para
   *  permitir agregação por torneio (regra 2025 = top-7 torneios + GF). */
  allRounds: { roundKey: string; pts: number; sd: number | null; tournKey: string; isGF: boolean; tcode: string }[];
  total: number;
  voltas: number;
  eligible: boolean;
}

/** Modo metric="sd": quantas voltas entram na média e mínimo para ranquear. */
export const BEST_SD_N = 8;
export const MIN_SD_ROUNDS = 4;

/** Chave única de um torneio na tabela.
 *  ⚠ TEM de incluir o ccode: a FPG reutiliza tcodes entre clubes, e sem ele
 *  duas provas do mesmo dia colapsavam na MESMA coluna — o cabeçalho ficava com
 *  o nome de uma e as células com os jogadores da outra (caso real 2026-01-04:
 *  Drive Challenge Madeira-Palheiro Sub 10 (ccode 982) × Drive Tour Tejo
 *  Montado (ccode 985), ambos tcode 10202). */
export function tournKeyOf(t: Tournament): string {
  return `${(t as any).ccode ?? "?"}_${t.tcode}_${t.date}`;
}

export function fmtPts(pts: number): string {
  return pts % 1 === 0 ? String(pts) : pts.toFixed(1);
}

/** Decompõe o nome de um torneio em {circuito, local}. Exemplos:
 *  "1º Torneio Drive Tour Madeira - Palheiro Golf" → { circuito: "DT1 Madeira", local: "Palheiro Golf" }
 *  "3º Torneio Drive Tour Tejo – Santo Estêvão"    → { circuito: "DT3 Tejo",    local: "Santo Estêvão" }
 *  "1º Torneio do Circuito Aquapor-Morgado Golf"   → { circuito: "Aquapor",     local: "Morgado Golf" }
 *  "Greatgolf Junior Open ... -U14"                 → { circuito: "Greatgolf U14", local: "Laguna" }
 *  "PJA Race to Dunas"                              → { circuito: "PJA",         local: "Race to Dunas" }
 */
export function shortTournName(name: string, campo?: string): { circuito: string; local: string } {
  const n = (name || "").trim();
  // Greatgolf variants
  const ggU = n.match(/Greatgolf.*?-?\s*U\s*(\d+)/i);
  if (ggU) return { circuito: `Greatgolf U${ggU[1]}`, local: campo || "Laguna" };
  if (/greatgolf/i.test(n)) return { circuito: "Greatgolf", local: campo || "Laguna" };
  // Aquapor
  const aq = n.match(/Circuito\s+Aquapor\s*(?:-|–)?\s*(.+)$/i);
  if (aq) return { circuito: "Aquapor", local: (aq[1] || "").trim() };
  // Drive Tour — extrair nº do torneio + região + local (após "-")
  const dt = n.match(/^(\d+)º\s+Torneio\s+(?:do\s+Circuito\s+)?Drive\s+Tour\s*(.*)$/i);
  if (dt) {
    const num = dt[1];
    const rest = dt[2].trim(); // "Madeira - Palheiro Golf" ou "- Quinta do Vale" etc.
    const parts = rest.split(/\s*[-–]\s*/).map(s => s.trim()).filter(Boolean);
    let regiao = "", local = "";
    if (parts.length >= 2) { regiao = parts[0]; local = parts.slice(1).join(" · "); }
    else if (parts.length === 1) {
      // Sem região (raro) — usar único segmento como local
      regiao = "";
      local = parts[0];
    }
    // Casos especiais
    if (/terceira/i.test(regiao) || /terceira/i.test(rest)) {
      regiao = regiao || "Açores";
      if (!local) local = "Terceira";
    }
    const circuito = regiao ? `DT${num} ${regiao}` : `DT${num}`;
    return { circuito, local: local || (campo || "") };
  }
  // Amendoeira World Kids — "Amendoeira World Kids Golfe 2026 Sub 14" → "World Kids Sub 14"
  const wk = n.match(/Amendoeira\s+World\s+Kids(?:\s+Golfe?)?(?:\s+\d{4})?\s*(Sub[\d\s/–-]*)?/i);
  if (wk) {
    const sub = (wk[1] || "").replace(/\s+/g, " ").trim();
    return { circuito: sub ? `World Kids ${sub}` : "World Kids", local: campo || "Amendoeira" };
  }
  // Miramar Internacional Open U25 (CGM, Ago 2026) — só o U25 conta para o
  // ranking (o Sub-10 fica fora, ver isPJACore).
  if (/Miramar\s+Intern\w*cional\s+Open/i.test(n)) {
    return { circuito: "Miramar Open", local: campo || "Miramar" };
  }
  // PJA exclusivo ou fallback
  const pjaMatch = n.match(/^PJA\s+(.+)$/i);
  if (pjaMatch) return { circuito: "PJA", local: pjaMatch[1].trim() };
  return { circuito: n, local: campo || "" };
}

/** Os anos com torneios, do mais recente para trás. */
export function rankingYears(list: Tournament[]): string[] {
  const s = new Set<string>();
  for (const t of list) if (t.date) s.add(t.date.substring(0, 4));
  return [...s].sort().reverse();
}

/** Ordem das SÉRIES quando a fonte as declara (ranking Sub-12). Mantém cada
 *  circuito em colunas seguidas em vez de intercalado por data. */
const SERIE_ORDER: Record<string, string> = {
  "Drive Tour": "1", "Drive Challenge": "2", "Aquapor": "3",
  "Nacional": "4", "Circuito juvenil": "5", "Adultos": "6", "Estágio": "7",
};

/** Categoria de um torneio para ordenar por grupo na tabela.
 *  Ordem: Madeira → Sul → Tejo → Norte → Açores → Aquapor → Greatgolf →
 *  PJA exclusivos. Dentro de cada grupo, ordena por data ascendente. */
function tournSortKey(t: Tournament): string {
  const n = t.name || "";
  const date = t.date || "";
  // Fonte com série própria (sub12-ranking.json): agrupar por série e, dentro
  // dela, por ordem cronológica.
  const serie = (t as any).serie as string | undefined;
  if (serie) {
    // As colunas de "provas extra" fecham o circuito, em vez de se meterem
    // entre as edições pela data.
    const sufixo = (t as any)._extra ? "z" : "a";
    return `${SERIE_ORDER[serie] ?? "8"}_${serie}_${sufixo}_${date}`;
  }
  const evType = classifyPJAEvent(t);
  // DT por região
  if (evType === "DT") {
    if (/Madeira/i.test(n))  return `1_madeira_${date}`;
    if (/\bSul\b|Laguna|Vila Sol|Penina|Vale.*—|Quinta do Vale|Pinheiros Altos/i.test(n)) return `2_sul_${date}`;
    if (/\bTejo\b|Montado|Sto\.?\s*Est[eê]v[aã]o|Santo Est[eê]v[aã]o|Lisbon|Jamor|Belas/i.test(n)) return `3_tejo_${date}`;
    if (/\bNorte\b|Estela|Vale Pis[aã]o|Ponte de Lima|Vidago/i.test(n)) return `4_norte_${date}`;
    if (/Terceira|A[çc]ores/i.test(n)) return `5_acores_${date}`;
    return `6_dt_outros_${date}`;
  }
  if (evType === "AQUAPOR") return `7_aquapor_${date}`;
  if (evType && evType.startsWith("GG")) return `8_gg_${date}`;
  return `9_pja_excl_${date}`;  // PJA exclusivo / torneios manuais
}

/** Os torneios do ano, pela ordem das colunas. */
export function buildYearTournaments(list: Tournament[], year: string, specialRules: boolean): Tournament[] {
  let filtered = list.filter(t => (t.date || "").startsWith(year));

  // Caso especial 2025: Vale Pisão D1 (10370) + D2 (10371) foram registados
  // pela FPG como 2 tcodes distintos, mas a comissão técnica PJA conta como
  // UM só torneio com 2 rondas. Combinar num torneio sintético antes do
  // sort/agregação. (Ver pja-members.json _2025_regras + Excel oficial.)
  if (specialRules && year === "2025") {
    const d1 = filtered.find(t => String(t.tcode || "") === "10370");
    const d2 = filtered.find(t => String(t.tcode || "") === "10371");
    if (d1 && d2) {
      // Construir map de player → roundScores combinado [D1.r1, D2.r1]
      const byPlayer = new Map<string, any>();
      const addFromSub = (sub: Tournament, ri: number) => {
        for (const p of (sub.players || [])) {
          const key = p.fedCode || ("name:" + (p.name || "").toLowerCase().trim());
          let merged = byPlayer.get(key);
          if (!merged) {
            merged = { ...p, roundScores: [] };
            byPlayer.set(key, merged);
          }
          const rs = (p as any).roundScores || [];
          // O D1/D2 cada um tem 1 ronda só (rs[0])
          const ronda = rs[0] ? { ...rs[0], round: ri + 1 } : { round: ri + 1, gross: null, scores: [], pars: [], si: [] };
          merged.roundScores[ri] = ronda;
        }
      };
      addFromSub(d1, 0);
      addFromSub(d2, 1);
      // Calcular grossTotal e toPar combinados onde possível
      const players = Array.from(byPlayer.values()).map((p: any) => {
        const rondas = p.roundScores || [];
        const grossSum = rondas.reduce((s: number, r: any) => s + (typeof r.gross === "number" ? r.gross : 0), 0);
        const parSum = rondas.reduce((s: number, r: any) => s + ((r.pars || []).reduce((a: number,b: number) => a+b, 0) || 0), 0);
        if (grossSum > 0 && parSum > 0) {
          p.grossTotal = grossSum;
          p.toPar = grossSum - parSum;
          p.parTotal = parSum;
        }
        return p;
      });
      const synthetic: Tournament = {
        ...d1,
        name: "PJA TOUR Vale Pisão",
        tcode: "10370+10371",
        rounds: 2,
        players,
        _isSynthetic: true,
        _subRounds: [d1, d2],
      } as any;
      filtered = filtered.filter(t => t !== d1 && t !== d2);
      filtered.push(synthetic);
    }
  }

  return filtered.sort((a, b) => tournSortKey(a).localeCompare(tournSortKey(b)));
}

/** As colunas (torneios e rondas) da Tabela. */
export function buildTournCols(yearTournaments: Tournament[], year: string, specialRules: boolean, showMeters: boolean): RankTournCol[] {
  const cols: RankTournCol[] = [];
  const perRound = showMeters ? 3 : 2;
  for (const t of yearTournaments) {
    const isSynth = !!t._isSynthetic;
    const subRounds: Tournament[] = t._subRounds || [];
    // Sem specialRules nenhum torneio pesa mais que outro: multiplicador 1.0
    // e nada é tratado como Grande Final (a vista CLASSIFICAÇÕES ranqueia um
    // calendário onde todas as provas valem o mesmo).
    const isGF = specialRules && isGFTournament(t);
    const mult = specialRules ? getTournMultiplier(t) : 1.0;
    const tournKey = tournKeyOf(t);

    // Descobrir nº de rondas: preferencialmente pelos subRounds sintéticos,
    // senão por t.rounds ou pelo máximo de roundScores de algum jogador.
    let nR = 1;
    if (isSynth && subRounds.length > 1) nR = subRounds.length;
    else if (t.rounds && t.rounds > 1) nR = t.rounds;
    else {
      for (const p of (t.players || [])) {
        const rs = (p as any).roundScores;
        if (rs && rs.length > nR) nR = rs.length;
      }
    }

    const ccode = (t as any).ccode || "";
    const tcode = String((t as any).tcode || "");
    const agregado = !!(t as any)._agregado;
    // GG Main 3R em 2026+: R1 nunca conta (regulamento §2.5 — só os últimos 2
    // dias contam). Ocultar a coluna R1 e mostrar só R2/R3.
    const evType = classifyPJAEvent(t);
    const hideR1 = specialRules && (year >= "2026") && evType === "GG_MAIN" && nR === 3;

    if (nR > 1) {
      const rounds: RankRound[] = [];
      for (let i = 0; i < nR; i++) {
        if (hideR1 && i === 0) continue;  // R1 ocultada
        rounds.push({
          roundKey: tournKey + "_r" + (i + 1),
          label: (agregado ? "V" : "R") + (i + 1),
          date: (subRounds[i]?.date) || t.date || "",
        });
      }
      cols.push({ tournKey, name: t.name, date: t.date || "", campo: t.campo || "", isGF, mult, rounds, colSpan: rounds.length * perRound, ccode, tcode, totalRondas: nR, agregado });
    } else {
      cols.push({ tournKey, name: t.name, date: t.date || "", campo: t.campo || "", isGF, mult, rounds: [{ roundKey: tournKey + "_r1", label: "", date: t.date || "" }], colSpan: perRound, ccode, tcode, totalRondas: 1, agregado });
    }
  }
  return cols;
}

/** Para regras 2026+: os 2 primeiros Aquapor do ano (ordem cronológica) — só
 *  esses contam para o ranking PJA. `null` = a regra não se aplica. */
function aquaporAllowedKeys(yearTournaments: Tournament[], year: string, specialRules: boolean): Set<string> | null {
  if (!specialRules) return null;  // ranking genérico: sem regra Aquapor
  if (year < "2026") return null;  // Aquapor não se aplica a anos anteriores
  const aqs = yearTournaments
    .filter(t => classifyPJAEvent(t) === "AQUAPOR")
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .slice(0, 2);
  return new Set(aqs.map(tournKeyOf));
}

export interface BuildRankRowsOpts {
  playersDB: PlayersDB;
  year: string;
  specialRules: boolean;
  metric: RankMetric;
  /** fedCodes inscritos no circuito PJA por ano (pja-members.json). */
  pjaMembersByYear?: Record<string, string[]>;
}

/** As linhas do ranking (todos os jogadores do ano, já com total e voltas). */
export function buildRankRows(yearTournaments: Tournament[], opts: BuildRankRowsOpts): RankRow[] {
  const { playersDB, year, specialRules, metric, pjaMembersByYear } = opts;
  const allowedAquapor = aquaporAllowedKeys(yearTournaments, year, specialRules);
  const map = new Map<string, RankRow>();
  // applyNewRules: regras especiais 2026+ de elegibilidade de torneios
  // (DT/Aquapor exclusão mútua, GG Main R2+R3 só, Aquapor só os 2 primeiros).
  const applyNewRules = specialRules && year >= "2026";
  // applyMembershipMode: modo "lista oficial de inscritos" — injecta skeleton
  // rows para todos os fedCodes em pja-members.json[year] e filtra a tabela
  // a apenas membros com tag "PJA". Activa-se quando há lista oficial para
  // este ano (independente de aplicar as regras 2026+).
  const yearMembers = pjaMembersByYear?.[year];
  const applyMembershipMode = !!(yearMembers && yearMembers.length);

  // Track, per player, whether they played any Drive Tour this year.
  // Used to exclude Aquapor rounds for players who also played DT.
  const playerDidDT = new Map<string, boolean>();

  for (const t of yearTournaments) {
    const evType = classifyPJAEvent(t);
    if (!evType) continue;
    // Com regras novas, Aquapor fora dos 2 primeiros é ignorado por completo
    if (applyNewRules && evType === "AQUAPOR" && allowedAquapor && !allowedAquapor.has(tournKeyOf(t))) {
      continue;
    }
    for (const p of t.players) {
      if (evType === "DT") {
        const k = p.fedCode || ("name:" + (p.name || "").toLowerCase().trim());
        playerDidDT.set(k, true);
      }
    }
  }

  for (const t of yearTournaments) {
    const evType = classifyPJAEvent(t);
    if (!evType) continue;
    if (applyNewRules && evType === "AQUAPOR" && allowedAquapor && !allowedAquapor.has(tournKeyOf(t))) continue;

    const isSynth = !!t._isSynthetic;
    const subRounds: Tournament[] = t._subRounds || [];
    // Sem specialRules nenhum torneio pesa mais que outro: multiplicador 1.0
    // e nada é tratado como Grande Final.
    const isGF = specialRules && isGFTournament(t);
    const mult = specialRules ? getTournMultiplier(t) : 1.0;
    const tournKey = tournKeyOf(t);

    for (const p of t.players) {
      const playerKey = p.fedCode || ("name:" + p.name.toLowerCase().trim());

      if (!map.has(playerKey)) {
        const db = p.fedCode ? playersDB[p.fedCode] : null;
        const clubRaw = db?.club;
        const club = clubRaw
          ? (typeof clubRaw === "object" ? (clubRaw as any).short || "" : String(clubRaw))
          : (p.club || "");
        const dob = (db as any)?.dob;
        const escByYear = dob && year ? escalaoAtDate(dob, year) : null;
        const historic = (p as any).escalao;
        const esc = escByYear
          || (historic ? String(historic).replace("-", " ").replace(/sub(\d)/i, "Sub $1").trim() : "")
          || db?.escalao
          || "";
        map.set(playerKey, {
          key: playerKey, name: p.name, fedCode: p.fedCode,
          club, escalao: esc,
          // playersDB só cobre os nossos jogadores — para o resto do campo o
          // sexo vem da própria linha do torneio (a fonte preenche-o a partir
          // do federados.json). Sem isto o badge e o filtro ♀ falhavam neles.
          sex: db?.sex || (p as any).sex || "", hcp: p.hcpExact ?? null,
          regioes: [],
          results: new Map(), allRounds: [], total: 0, voltas: 0, eligible: false,
        });
      }
      const row = map.get(playerKey)!;
      if (p.hcpExact != null) row.hcp = p.hcpExact;
      const reg = (p as any).regiao;
      if (reg && !row.regioes.includes(reg)) row.regioes.push(reg);

      // Aquapor: se jogador fez DT no ano, as rondas não contam.
      const aquaporSkipped = applyNewRules && evType === "AQUAPOR" && playerDidDT.get(playerKey) === true;

      const addRound = (roundNum: number, gross: number, par: number, rs?: any) => {
        if (!par || !gross || gross >= 900) return;
        const tp = gross - par;
        const pts = pjaPts(tp, mult);
        const roundKey = tournKey + "_r" + roundNum;

        // GG Main (Sub 16+ joga 3 dias): só R2 e R3 contam para PJA
        const ggMainExcluded = applyNewRules && evType === "GG_MAIN" && roundNum === 1;
        const excluded = ggMainExcluded || aquaporSkipped;
        let excludedReason: string | undefined;
        if (ggMainExcluded) excludedReason = "Greatgolf Main: R1 não conta para o ranking PJA (só R2+R3)";
        else if (aquaporSkipped) excludedReason = "Aquapor: jogador também fez Drive Tour, Aquapor não conta";

        // Modo "sd": o SD oficial da FPG vem na ronda (build-sub12-ranking.js);
        // aqui nunca se calcula.
        const sd = metric === "sd" && rs && typeof rs.sd === "number" ? rs.sd : null;
        const meters = rs && typeof rs.meters === "number" ? rs.meters : null;
        const prova = rs && rs._prova ? String(rs._prova) : null;
        row.results.set(roundKey, { toPar: tp, pts, sd, meters, prova, inTop14: false, excluded, excludedReason });
        if (!excluded) row.allRounds.push({ roundKey, pts, sd, tournKey, isGF, tcode: String((t as any).tcode || "") });
      };

      if (isSynth && subRounds.length > 1 && p.roundScores && p.roundScores.length > 0) {
        p.roundScores.forEach((rs: any, i: number) => {
          const parR = (rs.pars || []).reduce((a: number, b: number) => a + b, 0) || rs.parTotal || 0;
          addRound(i + 1, rs.gross, parR, rs);
        });
      } else if (p.roundScores && p.roundScores.length > 1) {
        // Multi-round não-sintético (e.g. pull-torneios 2-round event vindo directo)
        p.roundScores.forEach((rs: any, i: number) => {
          const parR = (rs.pars || []).reduce((a: number, b: number) => a + b, 0) || rs.parTotal || 0;
          addRound(i + 1, rs.gross, parR, rs);
        });
      } else {
        const tp = typeof p.toPar === "string" ? parseInt(p.toPar) : p.toPar as number;
        const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal as number;
        if (tp == null || isNaN(tp) || gross == null || isNaN(gross) || gross >= 900) continue;
        const par = gross - tp;
        // Passar a ronda (quando existe) para o modo metric="sd" poder ler o
        // differential dela — torneios de 1 ronda caem neste ramo e sem isto
        // ficavam sem SD (é a maioria do Drive Challenge).
        addRound(1, gross, par, p.roundScores?.[0]);
      }
    }
  }

  for (const row of map.values()) {
    if (metric === "sd") {
      // Média das BEST_SD_N melhores voltas — menor é melhor. Sem soma de
      // pontos: somar differentials premiaria quem joga mais provas.
      const sds = row.allRounds.filter(r => r.sd != null) as { roundKey: string; sd: number }[];
      const ordenadas = [...sds].sort((a, b) => a.sd - b.sd);
      const melhores = ordenadas.slice(0, BEST_SD_N);
      const chaves = new Set(melhores.map(r => r.roundKey));
      for (const [rk, res] of row.results.entries()) res.inTop14 = chaves.has(rk);
      row.total = melhores.length
        ? Math.round((melhores.reduce((a, r) => a + r.sd, 0) / melhores.length) * 10) / 10
        : NaN;
      row.voltas = sds.length;
      row.eligible = sds.length >= MIN_SD_ROUNDS;
      continue;
    }
    // A regra 2025 (top-7 torneios + GF à parte) é do regulamento PJA — o
    // ranking genérico usa sempre top-14 voltas, sem provas de peso especial.
    if (specialRules && year === "2025") {
      // Agrupar voltas por tournKey. Vale Pisão D1+D2 já vem combinado num
      // torneio sintético (tcode "10370+10371"), portanto basta agrupar pelo
      // tournKey natural.
      type TournAgg = { pts: number; isGF: boolean; roundKeys: string[] };
      const byTourn = new Map<string, TournAgg>();
      for (const r of row.allRounds) {
        let agg = byTourn.get(r.tournKey);
        if (!agg) { agg = { pts: 0, isGF: r.isGF, roundKeys: [] }; byTourn.set(r.tournKey, agg); }
        agg.pts += r.pts;
        if (r.isGF) agg.isGF = true;
        agg.roundKeys.push(r.roundKey);
      }
      const regular: TournAgg[] = [];
      let gfTotal = 0;
      const acceptedRoundKeys = new Set<string>();
      for (const agg of byTourn.values()) {
        if (agg.isGF) {
          gfTotal += agg.pts;
          agg.roundKeys.forEach(k => acceptedRoundKeys.add(k));
        } else {
          regular.push(agg);
        }
      }
      regular.sort((a, b) => b.pts - a.pts);
      const top7 = regular.slice(0, 7);
      let top7Total = 0;
      for (const t of top7) {
        top7Total += t.pts;
        t.roundKeys.forEach(k => acceptedRoundKeys.add(k));
      }
      for (const [rk, res] of row.results.entries()) {
        res.inTop14 = acceptedRoundKeys.has(rk);
      }
      row.total = top7Total + gfTotal;
      row.voltas = row.allRounds.length;
      // "Elegível" em 2025: ter participado em ≥7 torneios regulares (≈ campanha completa)
      row.eligible = regular.length >= 7;
    } else {
      // 2026+ e legado: TOP-14 voltas
      const sorted = [...row.allRounds].sort((a, b) => b.pts - a.pts);
      const top14Keys = new Set(sorted.slice(0, 14).map(r => r.roundKey));
      for (const [rk, res] of row.results.entries()) {
        res.inTop14 = top14Keys.has(rk);
      }
      row.total = sorted.slice(0, 14).reduce((s, r) => s + r.pts, 0);
      row.voltas = row.allRounds.length;
      row.eligible = row.voltas >= 14;
    }
  }

  // Membership mode: injectar rows "esqueleto" (0 voltas, 0 pts) para TODOS
  // os inscritos da lista pja-members.json do ano corrente que ainda não
  // pontuaram. Assim o ranking mostra quem está inscrito mesmo antes de haver
  // resultados (ex: início da época, ou inscritos que só vão jogar torneios
  // futuros). Activa-se sempre que existir lista oficial para o ano.
  if (applyMembershipMode) {
    for (const fed of yearMembers || []) {
      if (map.has(fed)) continue;  // já tem dados a partir de torneios
      const db = playersDB[fed];
      if (!db) continue;  // fedCode desconhecido → ignorar
      const clubRaw = (db as any).club;
      const club = clubRaw
        ? (typeof clubRaw === "object" ? (clubRaw as any).short || "" : String(clubRaw))
        : "";
      const dob = (db as any).dob;
      const escByYear = dob && year ? escalaoAtDate(dob, year) : null;
      const esc = escByYear
        || ((db as any).escalao ? String((db as any).escalao).replace("-", " ").replace(/sub(\d)/i, "Sub $1").trim() : "")
        || "";
      map.set(fed, {
        key: fed,
        name: (db as any).name || fed,
        fedCode: fed,
        club,
        escalao: esc,
        sex: (db as any).sex || "",
        hcp: (db as any).hcpExact ?? (db as any).hcp ?? null,
        regioes: [],
        results: new Map(),
        allRounds: [],
        total: 0,
        voltas: 0,
        eligible: false,
      });
    }
  }

  // Membership mode: mostrar todos os inscritos (incluindo 0 voltas/0 pts).
  // Sem lista oficial: só quem pontuou.
  let rows = applyMembershipMode
    ? [...map.values()]
    : [...map.values()].filter(r => r.voltas > 0);
  // No modo SD uma média de 1-3 voltas não diz nada — exigir um mínimo.
  if (metric === "sd") rows = rows.filter(r => r.voltas >= MIN_SD_ROUNDS);

  // Membership mode: filtrar apenas membros PJA (tag "PJA" em players.json).
  // Sem lista oficial (legado): qualquer participante aparece.
  if (applyMembershipMode) {
    rows = rows.filter(r => {
      if (!r.fedCode) return false;
      const db = playersDB[r.fedCode];
      const tags = (db as any)?.tags || [];
      return Array.isArray(tags) && tags.includes("PJA");
    });
  }

  return rows;
}

/** Esconde as colunas de torneios sem nenhum inscrito PJA:
 *  - torneios onde NENHUM inscrito está nos players, em `_admissions` nem em
 *    `_draws` (ex: DT Açores Terceira, DT4 Norte Ponte de Lima — só jogaram
 *    não-inscritos) saem;
 *  - torneios FUTUROS com inscritos PJA em `_admissions`/`_draws` ficam mesmo
 *    sem rondas (ex: PJA Aroeira 2 que vai acontecer).
 *  Sem lista de inscritos do ano, ficam todas. */
export function visibleTournCols(cols: RankTournCol[], yearTournaments: Tournament[], members: string[] | undefined): RankTournCol[] {
  const inscritos = members && members.length ? new Set(members) : null;
  if (!inscritos) return cols;
  const hasPjaInscrito = (t: Tournament): boolean => {
    // 1. Players com grossTotal (torneio já jogado)
    for (const p of (t.players || [])) {
      if (p.fedCode && inscritos.has(p.fedCode)) return true;
    }
    // 2. Admissions (torneio futuro com inscrições)
    const adm = (t as any)._admissions?.players as Array<{fed?: string|null}> | undefined;
    if (adm) {
      for (const p of adm) {
        if (p.fed && inscritos.has(p.fed)) return true;
      }
    }
    // 3. Draws (pre-jogo)
    const dr = (t as any)._draws as Record<string, { groups?: Array<{ players?: Array<{ fed?: string|null }> }> }> | undefined;
    if (dr) {
      for (const round of Object.values(dr)) {
        for (const g of (round?.groups || [])) {
          for (const p of (g.players || [])) {
            if (p.fed && inscritos.has(p.fed)) return true;
          }
        }
      }
    }
    return false;
  };
  return cols.filter(tc => {
    const t = yearTournaments.find(x => tournKeyOf(x) === tc.tournKey);
    return !t || hasPjaInscrito(t);
  });
}

/** Posição no RANKING (pela métrica), não a ordem da tabela: ao ordenar por
 *  outra coluna, o 1º do ranking continua a ser o 1º. */
export function rankPositions(rows: RankRow[], metric: RankMetric): Map<string, number> {
  const better = metric === "sd"
    ? (a: RankRow, b: RankRow) => (isNaN(a.total) ? Infinity : a.total) - (isNaN(b.total) ? Infinity : b.total)
    : (a: RankRow, b: RankRow) => b.total - a.total;
  const m = new Map<string, number>();
  [...rows].sort(better).forEach((r, i) => m.set(r.key, i + 1));
  return m;
}

/** Voltas que ficaram fora das que contam (só no modo de pontos — em "sd" a
 *  métrica é uma média das melhores, não uma soma) e os pontos de todas. */
export function cutInfo(row: RankRow, metric: RankMetric): { cortadas: number; contadas: number; totalTodas: number } {
  const cortadas = metric === "pts"
    ? [...row.results.values()].filter(r => !r.excluded && !r.inTop14).length
    : 0;
  return {
    cortadas,
    contadas: row.voltas - cortadas,
    totalTodas: cortadas > 0 ? row.allRounds.reduce((a, r) => a + r.pts, 0) : 0,
  };
}

/** Uma volta de um jogador, para o detalhe (lista dos resultados). */
export interface RankPlayerRound {
  key: string;
  col: RankTournCol;
  round: RankRound;
  res: RankRoundResult;
}

/** As voltas de um jogador, pela ordem das colunas. */
export function playerRounds(row: RankRow, cols: RankTournCol[]): RankPlayerRound[] {
  const out: RankPlayerRound[] = [];
  for (const col of cols) for (const round of col.rounds) {
    const res = row.results.get(round.roundKey);
    if (res) out.push({ key: round.roundKey, col, round, res });
  }
  return out;
}
