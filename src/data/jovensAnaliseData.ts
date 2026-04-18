/**
 * Agregador de dados para a página de análise JOVENS.
 *
 * Input: lista de torneios Jovens (todos os anos) + playersDB
 * Output:
 *   - Lista de campeões (Regional + Nacional) por ano × escalão × sexo × região
 *   - Top de jogadores mais frequentes
 *   - Evolução por jogador (timeline de escalão + títulos)
 *
 * Regras:
 *   - Nacional: name contém "Campeonato Nacional" e NÃO contém "Drive"
 *     (a "Final Nacional Drive Challenge" é um circuito diferente, não é o CNJ)
 *   - Regional: name contém "Campeonato Regional" ou "Camp Norte Jovens" (etc.),
 *     e NÃO contém "Drive"
 *   - Escalão por jogador no ano: Regra FPG year-based, idade = ano − yearOfBirth
 *     - idade 9-10 = Sub 10 (1º=9, 2º=10)
 *     - idade 11-12 = Sub 12 (1º=11, 2º=12)
 *     - idade 13-14 = Sub 14 (1º=13, 2º=14)
 *     - idade 15-16 = Sub 16 (1º=15, 2º=16)
 *     - idade 17-18 = Sub 18 (1º=17, 2º=18)
 */
import type { Tournament, Player } from "./fpgTypes";
import type { PlayersDB } from "../ui/tournamentPrimitives";

export type ChampionshipType = "Nacional" | "Regional";
export type Sex = "M" | "F" | "?";

/** Entrada de jogador (campeão ou sub-campeão) */
export interface PodiumEntry {
  name: string;
  fed: string | null;
  dob: string | null;
  age: number | null;             // idade = year − yearOfBirth
  yearInEscalao: 1 | 2 | null;    // 1º ou 2º ano do escalão
  pos: number | null;             // posição REAL no leaderboard
  gross: number | null;
  toPar: number | null;
}

export interface Champion {
  type: ChampionshipType;
  year: number;
  escalao: string;          // "Sub 10".."Sub 18"
  sex: Sex;
  region: string;           // "Nacional" | "Madeira" | "Norte" | "Sul" | "Tejo" | "Açores"
  ccode: string;
  tcode: string;
  tournamentName: string;
  campo: string;
  date: string;
  totalPlayers: number;
  champion: PodiumEntry;          // 1º português
  runnerUp: PodiumEntry | null;   // 2º português (sub-campeão), se existir
  // Vencedor "de facto" (pode ser estrangeiro) — só preenchido quando diferente do campeão PT.
  defactoWinnerName?: string;
  defactoWinnerFed?: string | null;
  defactoWinnerCountry?: string;  // "CN", "US", "NL", etc.
  // Resultado provisório? (torneio em curso — só algumas rondas jogadas)
  provisional?: boolean;
  roundsPlayed?: number;
  roundsExpected?: number;

  // ── Campos legacy (mantidos para retrocompatibilidade — rs. timelines) ──
  championName: string;
  championFed: string | null;
  championDob: string | null;
  championAge: number | null;
  yearInEscalao: 1 | 2 | null;
  championPos: number | null;
  gross: number | null;
  toPar: number | null;
}

/** Mapa fed → country_prefix (PT, CN, US, …) — formato compacto antigo */
export type NationalityMap = Record<string, string>;

/** Info detalhada por fed: country, dob, sex, name (ficheiro enriquecido com
 *  federados activos + inactivos para cobrir TODOS os jogadores em Jovens). */
export interface PlayerInfo {
  country?: string;
  dob?: string;
  sex?: string;
  name?: string;
}
export type PlayerInfoMap = Record<string, PlayerInfo>;

export interface PlayerStats {
  fed: string | null;
  name: string;
  displayName: string;
  dob: string | null;
  appearances: number;           // total de torneios (Regional + Nacional)
  regionalAppearances: number;
  nacionalAppearances: number;
  titles: Champion[];            // campeonatos ganhos
  years: Set<number>;            // anos em que participou
  escaloes: Set<string>;         // escalões em que jogou (pela idade)
  sexesSeen: Set<Sex>;
}

export interface AnaliseData {
  nacionalChampions: Champion[];  // todos os campeões Nacional, ordenados por year desc, esc asc
  regionalChampions: Champion[];  // todos os campeões Regional
  topPlayers: PlayerStats[];      // jogadores ordenados por appearances (Regional + Nacional) desc
  years: number[];                // anos cobertos
  regionsSeen: string[];          // regiões com Regional (sem "Nacional")
}

// ── Classificação de ccode → região ────────────────────────────────────
const CCODE_REGION: Record<string, string> = {
  "000": "Nacional",
  // Norte
  "910": "Norte",
  "987": "Norte",
  // Sul
  "988": "Sul",
  // Tejo
  "985": "Tejo",
  // Madeira
  "982": "Madeira",
  "007": "Madeira",
  "059": "Madeira",
  // Açores
  "005": "Açores",
  "051": "Açores",
  "003": "Açores",
};

export function ccodeToRegion(ccode: string | null | undefined): string {
  if (!ccode) return "outro";
  return CCODE_REGION[ccode] ?? "outro";
}

// ── Classificação do torneio: Nacional vs Regional vs outro ────────────
//
// Regras (confirmadas com a user, 2026-04-19):
//   - "Campeonato Nacional de Jovens" / "Campeonato Nacional Sub N" → Nacional
//     directo (histórico: Sub 10 e Sub 12 em 2022-2024; todos os escalões 2025+)
//   - "Final Nacional Drive Tour Sub-N" / "Grande Final Drive Tour CN Jovens..."
//     → Nacional (circuito nacional, a final define o campeão nacional do
//     escalão). Presente em 2022-2024 para Sub 12-24 quando não havia CNJ
//     direto ainda.
//   - "Final Nacional Drive Challenge..." → EXCLUI (circuito regional/iniciação,
//     a "Final Nacional" aqui é só a final interna do circuito, não CNJ).
//   - "Campeonato Regional..." / "Camp Norte Jovens..." → Regional
//   - "Campeonato Nacional de Clubes" → EXCLUI (competição de equipas, não
//     individual).
export function classifyTournament(t: Tournament): ChampionshipType | null {
  const name = t.name || "";
  // Clubes (equipas) — excluir
  if (/Campeonato\s+Nacional\s+(de\s+)?Clubes/i.test(name)) return null;
  // Drive Challenge — excluir (circuito regional/iniciação, não nacional)
  if (/Drive\s+Challenge/i.test(name)) return null;
  // Drive Tour Final → Nacional (substituto do CNJ para escalões sem CNJ directo)
  if (/(?:Final|Grande\s+Final)\s+(?:Nacional\s+)?Drive\s+Tour/i.test(name)) return "Nacional";
  if (/Grande\s+Final\s+Drive\s+Tour\s+CN\s+Jovens/i.test(name)) return "Nacional";
  // Outro Drive — excluir
  if (/Drive/i.test(name)) return null;
  // CNJ directo
  if (/Campeonato\s+Nacional/i.test(name)) return "Nacional";
  // Regional
  if (/Camp[a-z\.]*\s+Regional/i.test(name)) return "Regional";
  if (/Camp\s+Norte\s+Jovens/i.test(name)) return "Regional";
  return null;
}

// ── Sexo a partir do nome do torneio ───────────────────────────────────
export function detectSex(t: Tournament): Sex {
  const name = t.name || "";
  // Sufixos explícitos: "Rapazes" / "Raparigas" / " H" / " S" / " M" / " F"
  if (/Raparigas?/i.test(name)) return "F";
  if (/Rapazes?/i.test(name)) return "M";
  // Sufixo letra: " H"/" S"/" M"/" F" no final (com ou sem hífen antes)
  const m = name.match(/\s+[-–]?\s*([HhSsMmFf])\s*$/);
  if (m) {
    const c = m[1].toUpperCase();
    if (c === "H" || c === "M") return "M";
    if (c === "S" || c === "F") return "F";
  }
  // Padrão tipo "Sub 12 H" no meio
  const m2 = name.match(/Sub\s*\d+\s*([HhSsMmFf])\b/);
  if (m2) {
    const c = m2[1].toUpperCase();
    if (c === "H" || c === "M") return "M";
    if (c === "S" || c === "F") return "F";
  }
  return "?";
}

// ── Escalão do torneio (o nome) ────────────────────────────────────────
//
// Normalização: "Sub 25" (formato antigo FPG, 2022-2023) → "Sub 24" (formato
// canónico actual, usado a partir de 2024 e nas análises). Mantém consistência
// nas tabelas da análise cross-year.
export function detectEscalao(t: Tournament): string | null {
  const raw = t.escalao || (t.name || "").match(/Sub\s*[-–]?\s*(\d+)/i)?.[0] || null;
  if (!raw) return null;
  const m = raw.match(/Sub\s*[-–]?\s*(\d+)/i);
  if (!m) return null;
  const n = parseInt(m[1]);
  return `Sub ${n === 25 ? 24 : n}`;
}

// ── Escalão de um jogador num ano (regra FPG year-based) ───────────────
export function escalaoInYear(dob: string | null, year: number): string | null {
  if (!dob) return null;
  const yob = parseInt(String(dob).slice(0, 4));
  if (isNaN(yob)) return null;
  const age = year - yob;
  if (age < 0) return null;
  if (age <= 10) return "Sub 10";
  if (age <= 12) return "Sub 12";
  if (age <= 14) return "Sub 14";
  if (age <= 16) return "Sub 16";
  if (age <= 18) return "Sub 18";
  return "Sub 24";
}

// ── Parser de lista de escalões designados por um torneio ──
//
// Input: string (nome do torneio OU tabLabel), ex:
//   "Sub 10"              → ["Sub 10"]                    (mono)
//   "Sub 10 e 12"         → ["Sub 10","Sub 12"]           (combinado 2)
//   "Sub 10 & 12 & 14"    → ["Sub 10","Sub 12","Sub 14"]  (combinado 3)
//   "Sub 14-24"           → ["Sub 14","Sub 16","Sub 18","Sub 24"]  (range hífen)
//   "Sub 14 a 24"         → ["Sub 14","Sub 16","Sub 18","Sub 24"]  (range "a")
//   "Sub25 a Sub16"       → ["Sub 16","Sub 18","Sub 24"]  (Sub 25 → Sub 24)
//
// Uso: identificar escalões designados pelo organizador, mesmo quando
// jogadores fora do intervalo tenham jogado "para cima" (bug histórico:
// Teresa Ferreira 13 yo a jogar no Sub25-Sub16 não pode ser campeã Sub 14).
export const ESC_BRACKETS = [10, 12, 14, 16, 18, 24];
export function parseEscaloes(s: string): string[] {
  if (!s) return [];
  const asEsc = (n: number) => `Sub ${n === 25 ? 24 : n}`;

  // Caso 1: range "Sub N1-N2" (hífen ou "–") OU "Sub N1 a (Sub )?N2"
  const rangeMatch = s.match(/Sub\s*(\d+)\s*(?:[-–]|\sa\s)\s*(?:Sub\s*)?(\d+)/i);
  if (rangeMatch) {
    let n1 = parseInt(rangeMatch[1]);
    let n2 = parseInt(rangeMatch[2]);
    if (n1 === 25) n1 = 24;
    if (n2 === 25) n2 = 24;
    const lo = Math.min(n1, n2);
    const hi = Math.max(n1, n2);
    return ESC_BRACKETS.filter(b => b >= lo && b <= hi).map(b => `Sub ${b}`);
  }

  // Caso 2: enumeração "Sub N1 e N2 & N3 / N4, N5"
  const firstMatch = s.match(/Sub\s*(\d+)/i);
  if (!firstMatch) return [];
  const nums = new Set<number>();
  nums.add(parseInt(firstMatch[1]));
  const after = s.slice((firstMatch.index || 0) + firstMatch[0].length);
  const extraRe = /(?:[&/,]|\s+e\s+)\s*(?:Sub\s*)?(\d+)/gi;
  let em: RegExpExecArray | null;
  while ((em = extraRe.exec(after)) !== null) {
    nums.add(parseInt(em[1]));
  }
  return [...nums].sort((a, b) => a - b).map(asEsc);
}

// ── 1º ou 2º ano do escalão (idade ímpar = 1º, par = 2º; Sub 10 ímpar é 9) ──
export function yearInEscalao(dob: string | null, year: number): 1 | 2 | null {
  if (!dob) return null;
  const yob = parseInt(String(dob).slice(0, 4));
  if (isNaN(yob)) return null;
  const age = year - yob;
  if (age < 9) return null;
  // Sub 10: 9=1º, 10=2º | Sub 12: 11=1º, 12=2º | ... | Sub 18: 17=1º, 18=2º
  return (age % 2 === 1) ? 1 : 2;
}

// ── Construção do agregado ─────────────────────────────────────────────
export function buildJovensAnalise(
  tournaments: Tournament[],
  playersDB: PlayersDB,
  nationality: NationalityMap = {},
  playerInfo: PlayerInfoMap = {}
): AnaliseData {
  // Helper: obter dob/sex para um fed code. Tenta playersDB primeiro (curado),
  // depois cai para playerInfo (federados activos + inactivos = 100% cobertura).
  const getDob = (fed: string | null | undefined): string | null => {
    if (!fed) return null;
    const pinfo = playersDB[String(fed)] as any;
    if (pinfo?.dob) return pinfo.dob;
    const info = playerInfo[String(fed)];
    return info?.dob || null;
  };
  const getSex = (fed: string | null | undefined): Sex => {
    if (!fed) return "?";
    const pinfo = playersDB[String(fed)];
    if (pinfo?.sex === "M" || pinfo?.sex === "F") return pinfo.sex as Sex;
    const info = playerInfo[String(fed)];
    if (info?.sex === "M" || info?.sex === "F") return info.sex as Sex;
    return "?";
  };
  const nacionalChampions: Champion[] = [];
  const regionalChampions: Champion[] = [];
  const playerMap = new Map<string, PlayerStats>();  // key = fed || name-normalized
  const years = new Set<number>();
  const regionsSeen = new Set<string>();

  const keyFor = (p: Player | { fedCode?: string | null; name?: string | null }): string => {
    const fed = (p as any).fedCode || (p as any).fed;
    if (fed && String(fed) !== "0") return `fed:${fed}`;
    const nm = (p.name || "").toString().trim().toLowerCase();
    return `name:${nm}`;
  };

  const displayName = (s: string): string => s ? s.replace(/,\s*/, ", ").trim() : "";

  for (const t of tournaments) {
    const type = classifyTournament(t);
    if (!type) continue;

    const year = parseInt((t.date || "").slice(0, 4));
    if (!year) continue;
    years.add(year);

    const esc = detectEscalao(t);
    const sex = detectSex(t);
    const region = ccodeToRegion(t.ccode);
    if (type === "Regional") regionsSeen.add(region);

    const players = (t.players || []) as Player[];

    // ── Champion-finding: regra FPG ────────────────────────────────────
    // Campeonato NACIONAL: só portugueses podem ser campeões.
    // Campeonato REGIONAL: qualquer participante elegível pode ser
    //   campeão — os regionais não exigem nacionalidade portuguesa.
    //   (Isto foi confirmado pela user — erro anterior dava "melhor PT"
    //    como campeão regional, quando na realidade o estrangeiro era
    //    o campeão regional legítimo.)
    // Se não soubermos a nacionalidade (sem fed code ou ausente do
    // nationality map), assumimos PT (default conservador) — só relevante
    // para Nacionais.
    const applyForeignerRule = (type === "Nacional");
    const isEligibleForTitle = (p: Player): boolean => {
      if (!applyForeignerRule) return true;          // regionais: qualquer um
      const fed = (p as any).fedCode;
      if (!fed) return true;
      const cc = nationality[String(fed)];
      if (!cc) return true;
      return cc === "PT";
    };

    // Sexo de um jogador: playersDB primeiro, depois playerInfo (inativos).
    const playerSex = (p: Player): Sex => getSex((p as any).fedCode);

    // ── Escalões designados pelo organizador (parseEscaloes) ────────────
    //
    // Resolve o conjunto de escalões que ESTE torneio cobre, com base no
    // tabLabel (quando presente) ou no nome. Casos suportados:
    //   tabLabel="Sub 10"           → ["Sub 10"]                (mono)
    //   tabLabel="Sub 10 e 12"      → ["Sub 10","Sub 12"]       (combinado)
    //   tabLabel="Sub 14-24"        → ["Sub 14","Sub 16","Sub 18","Sub 24"]
    //   tabLabel="Sub 10 & 12 & 14" → ["Sub 10","Sub 12","Sub 14"]
    //   tabLabel="Sub25 a Sub16"    → ["Sub 16","Sub 18","Sub 24"]
    //
    // Porquê? Em eventos combinados, jogadores podem "jogar para cima" (ex:
    // um 13yo no Sub 14-24). Sem o designatedEscList, o código antigo
    // criava um champion "Sub 14" para o 13yo no evento Sub 14-24 — mas
    // esse torneio nem sequer tinha a categoria Sub 14 na regulamentação.
    const tabLabel = (t as any)._tabLabel || "";
    const designatedEscList = parseEscaloes(tabLabel) .length > 0
      ? parseEscaloes(tabLabel)
      : parseEscaloes(t.name || "");
    const combinedEscalao = designatedEscList.length > 1;

    // ⚠ Filtrar jogadores INCOMPLETOS — em torneios multi-ronda só consideramos
    // quem fez TODAS as rondas. Sem isto, alguém que só jogou R1 com gross 53
    // ficaria à frente de quem fez 2 rondas com 88. Bug grave detectado em
    // CRJ23 Madeira 2023-11-18 (Gonçalo Gouveia 1R só vs Laura Santos 2R).
    //
    // BUG 2026-04-18 (Cassiel Khayali pseudo-vencedor do Sub 14 2023):
    // alguns merges Dia1+Dia2 adicionam rondas placeholder com gross=998 e
    // scores=[0,0,...]. roundScores.length passa a ser 2 mas só 1 é real.
    // Solução: contar apenas rondas REAIS (gross válido <300). Também
    // recomputar grossTotal a partir das rondas reais — o grossTotal stored
    // pode estar incorrecto (apontava só para a ronda jogada mas ficava
    // associado a parTotal de 2 rondas → toPar negativo absurdo).
    const expectedRoundsMeta = t.rounds || 1;
    const isRealRound = (r: { gross?: number | null; scores?: number[] } | null | undefined): boolean => {
      if (!r) return false;
      const g = r.gross;
      if (typeof g !== "number" || g <= 0 || g >= 300) return false;
      // Defesa extra: se a ronda tem todos os scores=0, é placeholder
      const sc = r.scores;
      if (Array.isArray(sc) && sc.length > 0 && sc.every(s => !s || s === 0)) return false;
      return true;
    };
    const realRoundsOf = (p: Player): number[] =>
      (p.roundScores || []).filter(isRealRound).map(r => r.gross as number);

    // ── Rondas EFECTIVAS (vs meta) ──────────────────────────────────────
    //
    // Torneios em curso (multi-round): se hoje só foi jogada R1, não podemos
    // exigir 2 rondas — ninguém as tem ainda. Usamos o MÁXIMO de rondas reais
    // jogadas por qualquer jogador como `expectedRounds` efectivo.
    //   - Evento acabado com 2 rondas reais por todos → effectiveRounds=2
    //   - Evento em curso (só R1 ainda) → effectiveRounds=1 (provisório)
    //   - CRJ23 merged (maioria 2R, Cassiel só 1R) → effectiveRounds=2 e
    //     Cassiel é correctamente filtrado.
    //
    // Política (confirmada com user, 2026-04-18): "faz a tabela de 2026 com
    // os resultados de hoje; amanhã acumula com o segundo dia."
    const maxRealRoundsSeen = players.reduce(
      (mx, p) => Math.max(mx, realRoundsOf(p).length),
      0
    );
    const expectedRounds = maxRealRoundsSeen > 0
      ? Math.min(maxRealRoundsSeen, expectedRoundsMeta)
      : expectedRoundsMeta;
    const isProvisional = expectedRounds < expectedRoundsMeta;

    const isComplete = (p: Player): boolean => {
      if (expectedRounds <= 1) return true;
      return realRoundsOf(p).length >= expectedRounds;
    };
    // Gross efectivo: soma das rondas reais (multi-ronda) ou grossTotal (single)
    const effectiveGross = (p: Player): number | null => {
      if (expectedRounds <= 1) {
        // Em torneios provisórios (1R de 2), usar a primeira ronda real
        const reals = realRoundsOf(p);
        if (reals.length >= 1) return reals[0];
        return typeof p.grossTotal === "number" && p.grossTotal < 999 ? p.grossTotal : null;
      }
      const reals = realRoundsOf(p);
      if (reals.length < expectedRounds) return null;
      const sum = reals.slice(0, expectedRounds).reduce((s, g) => s + g, 0);
      return sum > 0 ? sum : null;
    };

    // Ordenar por grossTotal efectivo (NÃO pelo pos guardado nem pelo
    // grossTotal armazenado — ambos podem estar inconsistentes em torneios
    // merged manualmente).
    const ordered = players
      .filter(p => isComplete(p))
      .map(p => ({ p, gross: effectiveGross(p) }))
      .filter(x => typeof x.gross === "number" && (x.gross as number) > 0)
      .sort((a, b) => (a.gross as number) - (b.gross as number))
      .map((x, i) => ({ p: x.p, pos: i + 1, gross: x.gross as number }));

    // Vencedor de facto absoluto = primeiro do leaderboard (pode ser estrangeiro)
    const defactoWinner = ordered[0] || null;

    const buildPodium = (px: { p: Player; pos: number; gross: number } | null): PodiumEntry | null => {
      if (!px) return null;
      const p = px.p;
      const fed = (p as any).fedCode || null;
      const dob = getDob(fed);
      const age = dob ? (year - parseInt(String(dob).slice(0, 4))) : null;
      // toPar recalculado a partir do gross efectivo vs parTotal × rondas
      const par1 = typeof p.parTotal === "number" ? p.parTotal : null;
      const toPar = (par1 != null)
        ? px.gross - par1 * expectedRounds
        : (typeof p.toPar === "number" ? p.toPar : null);
      return {
        name: displayName(p.name || ""),
        fed: fed ? String(fed) : null,
        dob,
        age: (age != null && !isNaN(age)) ? age : null,
        yearInEscalao: yearInEscalao(dob, year),
        pos: px.pos,
        gross: px.gross,
        toPar,
      };
    };

    /** Constrói uma entrada de campeão para um sexo específico.
     *  filterByPlayerSex=true → só players cujo playerSex(p)===forSex.
     *    Usado em torneios combinados M+F (separa campeões por sexo).
     *  filterByPlayerSex=false → trust no torneio (todos os players têm o sexo
     *    certo por definição do torneio). Usado quando o torneio já é mono-sexo. */
    const buildChampionForSex = (forSex: Sex, filterByPlayerSex: boolean, forEscalao?: string): Champion | null => {
      const ptOfSex = ordered.filter(x =>
        isEligibleForTitle(x.p) && (
          !filterByPlayerSex || forSex === "?" || playerSex(x.p) === forSex
        ) && (
          // Filtrar por escalão quando é combinado — usar escalão real do jogador
          !forEscalao || escalaoInYear(getDob((x.p as any).fedCode), year) === forEscalao
        )
      );
      const championEntry = ptOfSex[0] || null;
      const runnerUpEntry = ptOfSex[1] || null;
      if (!championEntry) return null;
      if (!esc && !forEscalao) return null;

      const champion = buildPodium(championEntry as any)!;
      const runnerUp = buildPodium(runnerUpEntry as any);

      // Escalão de coluna — REGRA IMPORTANTE:
      //   - Torneio mono-escalão (ex: "Drive Tour Sub-14 H"): o escalão é o do
      //     TORNEIO. Se um Sub 12 vence o Sub 14, é campeão **Sub 14**.
      //   - Torneio combinado (ex: "Sub 10 e 12"): o escalão é o que foi
      //     passado (forEscalao) — ou, em legacy, pela idade do campeão.
      const playerEsc = forEscalao
        ? forEscalao
        : combinedEscalao
          ? (escalaoInYear(champion.dob, year) || esc || "")
          : (esc || "");
      if (!playerEsc) return null;

      const champ: Champion = {
        type,
        year,
        escalao: playerEsc,
        sex: forSex,
        region,
        ccode: t.ccode || "",
        tcode: t.tcode || "",
        tournamentName: t.name || "",
        campo: t.campo || "",
        date: t.date || "",
        totalPlayers: players.length,
        champion,
        runnerUp,
        provisional: isProvisional || undefined,
        roundsPlayed: isProvisional ? expectedRounds : undefined,
        roundsExpected: isProvisional ? expectedRoundsMeta : undefined,
        // ── Campos legacy (retrocompat) ──
        championName: champion.name,
        championFed: champion.fed,
        championDob: champion.dob,
        championAge: champion.age,
        yearInEscalao: champion.yearInEscalao,
        championPos: champion.pos,
        gross: champion.gross,
        toPar: champion.toPar,
      };

      // Vencedor de facto: melhor classificado absoluto no sub-leaderboard
      // (mesmo sexo + mesmo escalão). Só se anota se for ESTRANGEIRO e
      // diferente do campeão PT — e só faz sentido para Nacionais (onde há
      // regra de filtragem por nacionalidade). Para regionais, o vencedor
      // de facto É o campeão (não há regra de exclusão).
      if (applyForeignerRule) {
        const allOfSubLeader = ordered.filter(x =>
          (forSex === "?" || !filterByPlayerSex || playerSex(x.p) === forSex) &&
          (!forEscalao || escalaoInYear(getDob((x.p as any).fedCode), year) === forEscalao)
        );
        const defactoForSub = allOfSubLeader[0]?.p || null;
        if (defactoForSub && defactoForSub !== championEntry.p) {
          const dwFed = (defactoForSub as any).fedCode || null;
          const dwCountry = dwFed ? (nationality[String(dwFed)] || "?") : "?";
          if (dwCountry !== "PT") {
            champ.defactoWinnerName = displayName(defactoForSub.name || "");
            champ.defactoWinnerFed = dwFed ? String(dwFed) : null;
            champ.defactoWinnerCountry = dwCountry;
          }
        }
      }
      return champ;
    };

    // ── Determinar escalões que este torneio cobre ──────────────────────
    //
    // Princípio (user, 2026-04-18): "os dados mistos/multi-escalão/multi-sexo
    // são a forma que os organizadores decidem colocar os dados na plataforma;
    // é preciso olhar para a tabela geral e tirar os jogadores de Sub-10/12/14
    // e fazer uma tabela, apurar o vencedor; idem para Sub-16, etc. Duas mini
    // tabelas para cada escalão, uma para cada sexo."
    //
    // → Para torneios combinados: derivamos os escalões presentes nos
    //   jogadores (via DOB) e construímos um champion por (escalão, sexo).
    // → Para torneios mono-escalão: usamos t.escalao directamente.
    const champsForThisT: Champion[] = [];
    if (combinedEscalao) {
      // Iterar APENAS os escalões designados pelo organizador (não os que
      // foram derivados das idades dos jogadores — que poderia incluir
      // categorias fora do regulamento do evento).
      for (const escX of designatedEscList) {
        if (sex === "M" || sex === "F") {
          const c = buildChampionForSex(sex, false, escX);
          if (c) champsForThisT.push(c);
        } else {
          const cM = buildChampionForSex("M", true, escX);
          if (cM) champsForThisT.push(cM);
          const cF = buildChampionForSex("F", true, escX);
          if (cF) champsForThisT.push(cF);
        }
      }
    } else if (sex === "M" || sex === "F") {
      const c = buildChampionForSex(sex, false);
      if (c) champsForThisT.push(c);
    } else {
      const cM = buildChampionForSex("M", true);
      if (cM) champsForThisT.push(cM);
      const cF = buildChampionForSex("F", true);
      if (cF) champsForThisT.push(cF);
    }
    for (const c of champsForThisT) {
      if (type === "Nacional") nacionalChampions.push(c);
      else regionalChampions.push(c);
    }

    // ── Estatísticas de participação ──────────────────────────────────
    for (const p of players) {
      const k = keyFor(p);
      let ps = playerMap.get(k);
      if (!ps) {
        const fed = (p as any).fedCode || null;
        ps = {
          fed: fed ? String(fed) : null,
          name: p.name || "",
          displayName: displayName(p.name || ""),
          dob: getDob(fed),
          appearances: 0,
          regionalAppearances: 0,
          nacionalAppearances: 0,
          titles: [],
          years: new Set<number>(),
          escaloes: new Set<string>(),
          sexesSeen: new Set<Sex>(),
        };
        playerMap.set(k, ps);
      }
      ps.appearances += 1;
      if (type === "Regional") ps.regionalAppearances += 1;
      else ps.nacionalAppearances += 1;
      ps.years.add(year);
      const pEsc = ps.dob ? escalaoInYear(ps.dob, year) : (esc || null);
      if (pEsc) ps.escaloes.add(pEsc);
      ps.sexesSeen.add(sex);
    }
  }

  // Associar titles ao playerMap (cross-reference entre campeões e jogadores)
  const allChampions = [...nacionalChampions, ...regionalChampions];
  for (const ch of allChampions) {
    const k = ch.championFed ? `fed:${ch.championFed}` : `name:${ch.championName.toLowerCase()}`;
    const ps = playerMap.get(k);
    if (ps) ps.titles.push(ch);
  }

  // Ordenar
  nacionalChampions.sort((a, b) => b.year - a.year || compareEsc(a.escalao, b.escalao) || a.sex.localeCompare(b.sex));
  regionalChampions.sort((a, b) =>
    b.year - a.year ||
    a.region.localeCompare(b.region) ||
    compareEsc(a.escalao, b.escalao) ||
    a.sex.localeCompare(b.sex)
  );

  const topPlayers: PlayerStats[] = [...playerMap.values()]
    .sort((a, b) => b.appearances - a.appearances || b.titles.length - a.titles.length)
    .slice(0, 100);

  return {
    nacionalChampions,
    regionalChampions,
    topPlayers,
    years: [...years].sort().reverse(),
    regionsSeen: [...regionsSeen].sort(),
  };
}

// ── Helper: ordenação de escalão ───────────────────────────────────────
const ESC_ORDER = ["Sub 10", "Sub 12", "Sub 14", "Sub 16", "Sub 18", "Sub 24"];
function compareEsc(a: string, b: string): number {
  const ia = ESC_ORDER.indexOf(a);
  const ib = ESC_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
}
