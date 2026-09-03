/**
 * fpgUtils.ts — Funções utilitárias do pipeline FPG
 *
 * Funções partilhadas usadas por FPGPage, DrivePage e leaderboards.
 * Extraídas de FPGPage.tsx.
 */
import type { Player, Tournament, RoundScore, SDResult, PlayerFilter } from "./fpgTypes";
import { normLoose } from "../utils/normName";

/** Par total do percurso inferido do 1º jogador: parTotal → soma de par[] → soma dos pars da 1ª ronda → 0. */
export function firstPlayerParTotal(tournament: Tournament | null | undefined): number {
  const p = tournament?.players?.[0];
  return p?.parTotal
    || p?.par?.reduce((a, b) => a + b, 0)
    || p?.roundScores?.[0]?.pars?.reduce((a, b) => a + b, 0)
    || 0;
}
import type { EscLookup } from "../utils/playerUtils";
import type { PlayersDB } from "../ui/tournamentPrimitives";
import type { FpgDraw } from "./nacional2026Loader";
import { normalizePlayer } from "../utils/playerUtils";
import { calcAGS, expectedSD9 } from "../utils/whsCalc";
import { escalaoAtDate } from "../utils/format";
import { isManuel } from "../constants/manuel";

export function numGross(p: Player): number {
  return typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number) ?? 999;
}

/** Verifica se o Manuel está neste torneio — em qualquer fase.
 *
 *  Procura em 3 sítios (em ordem de disponibilidade):
 *    1. `t.players` — torneios jogados (scorecards) ou com resultados parciais
 *    2. `t._admissions.players` — torneios pre-jogo da FPG (Nacional 2026, Drive, etc.)
 *    3. `t._draws[*].groups[*].players` — torneios pre-jogo sem admissions scraped
 *       (ex: Regional Santo da Serra — draw vem por email em PDF, sem admissions)
 *
 *  Fonte única desta lógica para garantir consistência entre filtros da sidebar,
 *  pill no cabeçalho do detail e highlight na sidebar.
 */
export function tournamentHasManuel(t: Tournament | undefined | null): boolean {
  if (!t) return false;
  if ((t.players || []).some(p => isManuel(p as any))) return true;
  const adm = (t as any)._admissions?.players as Array<{ fed?: string | null; nome?: string }> | undefined;
  if (adm?.some(p => isManuel({ name: p.nome, fed: p.fed ?? undefined }))) return true;
  const dr = (t as any)._draws as Record<string, { groups?: Array<{ players?: Array<{ nome?: string; fed?: string | null }> }> }> | undefined;
  if (dr) {
    for (const round of Object.values(dr)) {
      for (const g of (round?.groups || [])) {
        for (const p of (g.players || [])) {
          if (isManuel({ name: p.nome, fed: p.fed ?? undefined })) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Um torneio é da série "Drive" (Drive Challenge regional ou Drive Tour) se o
 * nome contiver "drive".
 */
function isDriveSeries(t: Tournament | undefined | null): boolean {
  return /drive/i.test(t?.name || "");
}

/**
 * True para QUALQUER torneio do circuito Drive/Aquapor (pelo nome). Estes
 * circuitos têm a sua própria página `/drive` e não devem aparecer na `/FPG` —
 * mesmo os que o Manuel jogou (chegam à `/FPG` porque foram scrapeados para
 * pull-torneios). É um filtro de VISUALIZAÇÃO da sidebar da FPGPage: o torneio
 * continua em `displayList` (para deep-links resolverem) e nos ficheiros.
 */
export function isDriveOrAquapor(t: Tournament | undefined | null): boolean {
  return /\b(drive|aquapor)\b/i.test(t?.name || "");
}

/**
 * True para drives onde o Manuel NÃO jogou. Estes vivem na página /drive
 * (pipeline drive-data) e não devem poluir a lista do /diversos — mesmo quando
 * só têm dados de admissions. Os admissions ficam intactos no ficheiro; isto é
 * apenas um filtro de visualização. Drives do Manuel passam (tournamentHasManuel
 * cobre players + _admissions + _draws).
 */
export function isHiddenNonManuelDrive(t: Tournament | undefined | null): boolean {
  return isDriveSeries(t) && !tournamentHasManuel(t);
}

/**
 * Sintetiza o draw de uma ronda a partir do leaderboard acumulado das rondas
 * anteriores. Aplicável quando a FPG ainda não publicou (ou não chegou a ser
 * scraped) o draw oficial dessa ronda mas as rondas anteriores já foram jogadas.
 *
 * Regra FPG canónica para emparelhamentos a partir da R2:
 *   - Ordena os jogadores pelo total acumulado das rondas 1..N-1 (menor = melhor)
 *   - Agrupa de 3 em 3 mantendo os líderes juntos: 1º+2º+3º num grupo,
 *     4º+5º+6º no seguinte, e assim sucessivamente
 *   - O último grupo pode ter 1 ou 2 jogadores se o total não for múltiplo de 3
 *   - Jogadores que não terminaram alguma das rondas anteriores (WD, scorecard
 *     vazio ou gross >= 999) são excluídos — não vão a jogar a ronda seguinte
 *
 * Não tem tee times nem buracos de saída (a FPG só os define com o draw oficial).
 * O `note` no draw devolvido sinaliza que é estimado para o DrawTab mostrar aviso.
 *
 * @returns FpgDraw com note marcado, ou `null` se não houver dados suficientes
 *          (round < 2, sem players com rondas anteriores válidas, etc.).
 */
export function synthesizeDrawFromCumulative(
  tournament: Tournament,
  roundNum: number,
): FpgDraw | null {
  if (roundNum < 2) return null;
  const players = tournament.players || [];
  if (players.length === 0) return null;
  const priorRounds = roundNum - 1;

  type Eligible = { name: string; club: string | null; fed: string | null; cum: number };
  const eligible: Eligible[] = [];
  for (const p of players) {
    const rs = p.roundScores || [];
    if (rs.length < priorRounds) continue;
    let cum = 0;
    let ok = true;
    for (let i = 0; i < priorRounds; i++) {
      const g = rs[i]?.gross;
      // gross >= 999 é o sentinela de WD/DNS; <=0 é cartão vazio/não entregue
      if (typeof g !== "number" || g <= 0 || g >= 999) { ok = false; break; }
      cum += g;
    }
    if (!ok) continue;
    eligible.push({
      name: p.name || "",
      club: p.club || null,
      fed: (p as any).fed || p.fedCode || null,
      cum,
    });
  }

  if (eligible.length === 0) return null;
  // Ordenar por acumulado crescente (menor = melhor em stroke play)
  eligible.sort((a, b) => a.cum - b.cum);

  const groups: NonNullable<FpgDraw["groups"]> = [];
  for (let i = 0; i < eligible.length; i += 3) {
    const slice = eligible.slice(i, i + 3);
    const groupNum = groups.length + 1;
    groups.push({
      // Sem tee times reais. Usamos um identificador de grupo único ("G1", "G2"...)
      // para que o DrawTab mantenha a separação visual entre flights (cor de fundo
      // e linha de separação dependem do `teeTime` ser distinto entre grupos).
      teeTime: `G${groupNum}`,
      startHole: null,
      tee: null,
      players: slice.map(p => ({
        nome: p.name,
        clube: p.club,
        fed: p.fed,
        hcp: null,
      })),
    });
  }

  return {
    totalJogadores: eligible.length,
    groups,
    note: `Draw estimado — emparelhamentos calculados pelo acumulado das rondas 1-${priorRounds} (FPG ainda não publicou o draw oficial)`,
  };
}

/** Mapa fed → ano → escalão. Construído a partir de torneios Challenge (t.escalao explícito).
 *  Usado como fallback quando não há DOB na playersDB para inferir o escalão num ano específico. */
export type TemporalEscLookup = Map<string, Map<string, string>>;

/** Escalão do jogador no contexto do torneio — FONTE ÚNICA DE VERDADE.
 *
 *  Regra FPG: escalão é baseado na idade que o jogador faz no ano civil do torneio
 *  (year − yearOfBirth). Ver `escalaoAtDate` em utils/format.ts.
 *
 *  Prioridade:
 *    1) escalaoAtDate(dob, tournamentDate) — SEMPRE preferido se há dob + data (cálculo directo)
 *    2) escalão gravado no registo do torneio (histórico do scrape) — reflecte o escalão na altura
 *    3) temporalEscLookup[fed][year] — escalão inferido de outros torneios do mesmo ano (ex: Challenge)
 *    4) lookup actual (players.json) — último recurso (pode estar errado para torneios antigos)
 *
 *  Usar sempre esta função em vez de aceder directamente ao playersDB[fed].escalao ou
 *  ao escLookup global: isso mostraria sempre o escalão ACTUAL, errado para torneios antigos.
 */
/**
 * MÉTODO ÚNICO de resolver a data de nascimento de um jogador de torneio.
 *
 * Um jogador pode ter dob em quatro sítios, por ordem de fiabilidade:
 *   1. `playersDB[fed].dob`  — ficha curada (players.json)
 *   2. `fedBirthdates(fed)`  — federados.json (base FPG completa; cobre Sub-10
 *                              e novos registos que o players.json não tem)
 *   3. `p.dob`               — o que o próprio scrape do torneio trouxe
 *   4. `p._rfeg.dob`         — ficha da federação espanhola, anexada por
 *                              scripts/enrich-intl-players.js
 *
 * A (4) é a ÚNICA fonte para quem joga como "Internacional": não tem número de
 * federado português, logo (1) e (2) — que são indexadas por `fed` — não têm
 * por onde lá chegar. Toda a cadeia que começava por exigir `fed` deixava esses
 * jogadores sem dob, e por arrasto sem ano de nascimento, sem idade e sem
 * escalão. Usar esta função em vez de remontar a cadeia à mão em cada tabela.
 */
export function playerDob(
  // Tipo ESTRUTURAL (tudo opcional/unknown) de propósito: há várias interfaces
  // `Player` locais pelas páginas fora, com campos incompatíveis entre si
  // (ex.: `toPar` string|number numa, number noutra). Só se leem estes quatro.
  p: { fed?: unknown; fedCode?: unknown; dob?: unknown; _rfeg?: unknown },
  opts?: { playersDB?: PlayersDB; fedBirthdates?: Map<string, string> },
): string | null {
  const any = p as any;
  const fed: string | undefined = any.fedCode || any.fed || undefined;
  return (
    (fed ? ((opts?.playersDB?.[fed] as any)?.dob || opts?.fedBirthdates?.get(fed)) : undefined) ||
    (any.dob as string | undefined) ||
    (any._rfeg?.dob as string | undefined) ||
    null
  );
}

/** Idade-tecto de um rótulo de escalão: o MAIOR "Sub N" que lá aparecer.
 *
 * "Sub 12" → 12 · "Sub 14-24" → 24 · "Sub 10+12" → 12 · "Absoluto" → null.
 *
 * ⚠ O maior, não o primeiro: os torneios combinados ("Sub 14-24") admitem toda
 * a gama, e um tecto de 14 excluiria os jogadores de 20 anos que lá jogam de
 * pleno direito.
 *
 * `null` = sem tecto conhecido (escalão absoluto, sénior ou label não
 * reconhecida) — quem consome deve tratar isso como "não dá para filtrar",
 * nunca como "tecto 0".
 */
export function escalaoAgeCap(escalao: string | null | undefined): number | null {
  const nums = String(escalao || "").match(/sub\s*(\d{1,2})/gi);
  if (!nums || nums.length === 0) return null;
  const caps = nums
    .map(m => parseInt(m.replace(/\D/g, ""), 10))
    .filter(n => Number.isFinite(n));
  // Um label como "Sub 14-24" dá só um match ("Sub 14") — apanhar também o
  // segundo número do intervalo.
  const range = String(escalao || "").match(/sub\s*\d{1,2}\s*[-–+/]\s*(\d{1,2})/i);
  if (range) caps.push(parseInt(range[1], 10));
  return caps.length ? Math.max(...caps) : null;
}

/** Um jogador nascido em `dobYear` pode estar num torneio com este tecto?
 *
 * Regra do golfe juvenil: jogar ACIMA do escalão é permitido (um Sub-10 entra
 * num Sub-12), jogar ABAIXO não. Logo só a idade máxima é vinculativa.
 *
 * Sem tecto, sem ano do torneio ou sem data de nascimento → `true`: não há
 * como excluir, e excluir por falta de dados apagaria jogadores legítimos.
 */
export function fitsEscalaoAgeCap(
  dobYear: number | null | undefined,
  ageCap: number | null | undefined,
  tournamentYear: number | null | undefined,
): boolean {
  if (ageCap == null || tournamentYear == null) return true;
  if (dobYear == null || !Number.isFinite(dobYear)) return true;
  return tournamentYear - dobYear <= ageCap;
}

export function resolveEsc(
  p: Player,
  escLookup: EscLookup,
  opts?: {
    tournamentDate?: string | null;
    playersDB?: PlayersDB;
    temporalEscLookup?: TemporalEscLookup;
    /** Fallback: fed → birthdate vindo de `federados.json` (FPG). Cobre Sub-10
     *  e novos registados que não estão em `players.json`. Fonte: hook
     *  `useFedBirthdates()` em `InscricoesComponents.tsx`. */
    fedBirthdates?: Map<string, string>;
  }
): string {
  const fed = p.fedCode || (p as any).fed;
  // 1) Cálculo dob + data do torneio (verdade matemática, year-based).
  //    Dob: playersDB (curado) → federados.json (base FPG) → ficha RFEG.
  //    A condição NÃO exige `fed`: quem não tem federado português (os
  //    inscritos como "Internacional") ficava fora deste ramo e caía até ao
  //    fim da função sem escalão. A ficha `_rfeg` — anexada por
  //    scripts/enrich-intl-players.js — é a única fonte de dob que eles têm.
  if (opts?.tournamentDate) {
    const dob = playerDob(p, opts);
    if (dob) {
      const calc = escalaoAtDate(dob, opts.tournamentDate);
      if (calc) return calc;
    }
  }
  // 2) Histórico do registo do torneio (escalão guardado no scrape)
  const historic = (p as any).escalao || (p as any).ageCategory;
  if (historic) return historic.replace("-", " ").replace(/sub(\d)/i, "Sub $1").trim();
  // 3) Temporal lookup por ano do torneio (inferido de outros torneios do mesmo ano)
  if (fed && opts?.tournamentDate && opts?.temporalEscLookup) {
    const year = String(opts.tournamentDate).slice(0, 4);
    const y = opts.temporalEscLookup.get(fed)?.get(year);
    if (y) return y;
  }
  // 4) Lookup actual (fallback — pode estar errado para torneios antigos)
  if (fed && escLookup.has(fed)) return escLookup.get(fed)!;
  return "";
}

/** Constrói o temporal lookup: fedCode → Map<year, escalão>
 *  A partir dos torneios Challenge (que têm t.escalao explícito).
 *  Permite saber o escalão de um jogador num ANO específico mesmo sem DOB na playersDB. */
export function buildTemporalEscLookup(
  tournaments: Array<{
    escalao?: string | null;
    series?: string;
    date?: string;
    players: Array<{ fed?: string; fedCode?: string }>;
    _roundLabel?: string;
  }>
): TemporalEscLookup {
  const map: TemporalEscLookup = new Map();
  for (const t of tournaments) {
    // Só Challenge têm t.escalao explícito (escalão único por torneio)
    if (t.series !== "challenge" || !t.escalao) continue;
    // Ignorar rondas expandidas (R1/R2) — só o torneio base ou Total
    if (t._roundLabel && t._roundLabel !== "Resumo") continue;
    const year = t.date?.split("-")[0];
    if (!year) continue;
    for (const p of t.players) {
      const fed = p.fed || p.fedCode || "";
      if (!fed) continue;
      if (!map.has(fed)) map.set(fed, new Map());
      // Não sobrescrever se já existe (primeiro torneio encontrado ganha)
      if (!map.get(fed)!.has(year)) map.get(fed)!.set(year, t.escalao);
    }
  }
  return map;
}

export interface FilledScores {
  /** Scores por buraco com os buracos vazios preenchidos com o valor inferido. */
  scores: number[];
  /** Máscara: true no índice de cada buraco cujo valor foi inferido. */
  inferred: boolean[];
  /** True se pelo menos um buraco foi preenchido. */
  hasInferred: boolean;
}

/** Cap Net Double Bogey por buraco = par + 2 + pancadas de handicap recebidas.
 *  Distribui as pancadas pelo SI (handicaps mais baixos primeiro). */
function ndbCaps(
  parArr: number[], si: number[], cr: number, slope: number, hcp: number, nh: number,
): number[] | null {
  if (parArr.length < nh || si.length < nh) return null;
  const parT = parArr.slice(0, nh).reduce((a, b) => a + b, 0);
  const ch = Math.round(hcp * (slope / 113) + (cr - parT));
  const order = Array.from({ length: nh }, (_, i) => i).sort((a, b) => si[a] - si[b]);
  const strokes = new Array(nh).fill(0);
  let rem = Math.max(0, ch);
  while (rem > 0) { for (const idx of order) { if (rem <= 0) break; strokes[idx]++; rem--; } }
  return parArr.slice(0, nh).map((pp, i) => pp + 2 + strokes[i]);
}

/** Preenche buracos vazios (score 0) de um cartão devolvido mas incompleto.
 *
 *  Em torneios sociais, um buraco vazio significa que o jogador não terminou
 *  esse buraco (pegou na bola) — fez pelo menos +1/+2 nesse buraco. O total
 *  gross OFICIAL (`grossTotal`) é a fonte de verdade: o valor inferido =
 *  grossTotal − soma dos buracos jogados, distribuído pelos buracos vazios e
 *  limitado por buraco ao Net Double Bogey (par + 2 + pancadas).
 *
 *  NÃO infere nada (devolve o cartão tal como está) quando:
 *   - não há buracos vazios;
 *   - o gross oficial é desconhecido / WD / DNS;
 *   - todos os buracos estão vazios (cartão não entregue);
 *   - o gross é ≤ soma dos buracos jogados (dados inconsistentes).
 *
 *  IMPORTANTE: não escreve nada nos ficheiros de dados — a inferência vive só
 *  na camada de cálculo/visualização. Os buracos inferidos são marcados em
 *  `inferred[]` para a UI os poder pintar a cinzento. */
export function fillBlankHoles(p: Player): FilledScores {
  const rs0 = p.roundScores?.[0];
  const raw = (p.scores?.length ? p.scores : rs0?.scores) || [];
  const parArr = (p.par?.length ? p.par : rs0?.pars) || [];
  const si = (p.si?.length ? p.si : rs0?.si) || [];
  const cr = p.courseRating ?? rs0?.courseRating;
  const slope = p.slope ?? rs0?.slope;
  const hcp = p.hcpExact;
  const nh = p.nholes || raw.length || parArr.length || 18;
  const gross = numGross(p);

  const scores = raw.slice(0, nh).map((v) => (typeof v === "number" ? v : 0));
  const inferred = new Array(scores.length).fill(false);
  const blanks: number[] = [];
  for (let i = 0; i < scores.length; i++) if (!scores[i] || scores[i] <= 0) blanks.push(i);

  if (blanks.length === 0) return { scores, inferred, hasInferred: false };
  if (gross == null || isNaN(gross) || gross >= 999 || gross <= 0) return { scores, inferred, hasInferred: false };
  if (blanks.length >= scores.length) return { scores, inferred, hasInferred: false };

  const played = scores.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  const remaining = gross - played;
  if (remaining <= 0) return { scores, inferred, hasInferred: false };

  const caps = (cr != null && slope != null && hcp != null)
    ? ndbCaps(parArr, si, cr, slope, hcp, nh) : null;

  // Caso comum — um único buraco vazio: o valor é exacto (gross − jogados).
  if (blanks.length === 1) {
    const i = blanks[0];
    let v = remaining;
    if (caps && v > caps[i]) v = caps[i]; // segurança — nunca exceder o NDB
    scores[i] = v;
    inferred[i] = true;
    return { scores, inferred, hasInferred: true };
  }

  // Vários buracos vazios — distribuir `remaining`, cada um limitado ao NDB.
  const vals = blanks.map((i) => (caps ? caps[i] : (parArr[i] || 4) + 2));
  const floors = blanks.map((i) => (caps ? Math.max(1, caps[i] - 2) : Math.max(1, parArr[i] || 4))); // net par
  let sum = vals.reduce((a, b) => a + b, 0);
  // gross < soma dos NDB → reduzir, começando pelos buracos com valor mais alto.
  let guard = 0;
  while (sum > remaining && guard++ < 5000) {
    let bi = -1, bv = -1;
    for (let k = 0; k < vals.length; k++) if (vals[k] > floors[k] && vals[k] > bv) { bv = vals[k]; bi = k; }
    if (bi < 0) break;
    vals[bi]--; sum--;
  }
  guard = 0;
  while (sum > remaining && guard++ < 5000) { // floors esgotados — continuar até 1
    let bi = -1, bv = -1;
    for (let k = 0; k < vals.length; k++) if (vals[k] > 1 && vals[k] > bv) { bv = vals[k]; bi = k; }
    if (bi < 0) break;
    vals[bi]--; sum--;
  }
  // gross > soma dos NDB (raro) → distribuir o défice pelos buracos.
  let gi = 0;
  while (sum < remaining && vals.length) { vals[gi % vals.length]++; sum++; gi++; }

  blanks.forEach((i, k) => { scores[i] = vals[k]; inferred[i] = true; });
  return { scores, inferred, hasInferred: true };
}

export function computeSD(p: Player): SDResult {
  const scores = fillBlankHoles(p).scores;
  const parArr = p.par || [];
  const si = p.si || [];
  const nh = p.nholes || scores.length || (parArr.length > 0 ? parArr.length : 18);
  const is9 = nh <= 9;
  const cr = p.courseRating;
  const slope = p.slope;
  const hcp = p.hcpExact;
  const gross = numGross(p);
  // PCC oficial da FPG (−1..+3): SD = (113/slope)×(AGS − CR − PCC). Sem ele
  // a tabela divergia do SD oficial exactamente por (113/slope)×PCC — caso
  // Amendoeira 2026 (PCC −1): tabela 6.3 vs oficial 7.3.
  const pcc = typeof p.pcc === "number" ? p.pcc : 0;
  if (!cr || !slope || gross == null || isNaN(gross)) return { sd: null, source: null };
  // ⚠ Sentinelas de "sem cartão": a FPG põe 998 (ND/NR — não devolveu) e 999
  // (NS/WD) no lugar do gross, e o numGross() converte um grossTotal null no
  // mesmo 999. Sem esta guarda o cartão a zeros era "reparado" pelo Net Double
  // Bogey e saía um SD absurdo (−58.8 no 8º Torneio CGSS OM NOS 2026) que,
  // sendo ≤ HCP, pintava o badge de VERDE: 9 desistências apareciam como as
  // melhores voltas do dia. Mesma convenção do ranking Drive (gross ≥ 900 =
  // sem cartão, não pontua).
  if (gross >= 900) return { sd: null, source: null };
  // ⚠ Volta A DECORRER: cartão hole-by-hole com buracos por jogar (a zero ou
  // array curto) e gross igual à soma dos jogados → um SD sobre 5 buracos não
  // significa nada (dava −22.2 — caso Alexander Eikner, EJO 2026 R1). Se o
  // gross é MAIOR que a soma, o cartão é que está truncado na fonte (volta
  // completa) e o SD mantém-se — mesma convenção do isFullRound
  // (PastEditionsTable). Sem cartão nenhum (0 buracos visíveis) também se
  // mantém: o gross oficial de uma volta fechada continua a valer.
  const playedHoles = scores.filter((v) => v > 0).length;
  const playedSum = scores.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  if (playedHoles > 0 && playedHoles < nh && gross <= playedSum) return { sd: null, source: null };
  // ⚠ O score differential WHS PODE ser negativo (volta abaixo do Course Rating).
  // Antes havia `Math.max(0, …)` que achatava tudo o que fosse < CR a 0.0 — um
  // gross −5 vs CR e um gross =CR davam ambos "0.0", indistinguíveis. Removido.
  if (hcp != null && si.length >= nh && scores.length >= nh && parArr.length >= nh) {
    const ags = calcAGS(scores, parArr, si, cr, slope, hcp, nh);
    const raw = (113 / slope) * (ags - cr - pcc);
    const sd = is9 ? raw + expectedSD9(hcp) : raw;
    return { sd: Math.round(sd * 10) / 10, source: "ags" };
  }
  if (!is9) {
    const sd = Math.round((113 / slope) * (gross - cr - pcc) * 10) / 10;
    return { sd, source: "raw" };
  }
  if (hcp != null) {
    const raw = (113 / slope) * (gross - cr - pcc);
    const sd = Math.round((raw + expectedSD9(hcp)) * 10) / 10;
    return { sd, source: "raw" };
  }
  return { sd: null, source: null };
}

export function filterPlayers(
  players: Player[],
  f: PlayerFilter,
  escLookup: EscLookup,
  playersDB: PlayersDB,
  opts?: { tournamentDate?: string | null; temporalEscLookup?: TemporalEscLookup; fedBirthdates?: Map<string, string> }
): Player[] {
  let ps = players;
  if (f.name) { const q = f.name.toLowerCase(); ps = ps.filter(p => p.name.toLowerCase().includes(q) || (p.club || "").toLowerCase().includes(q)); }
  if (f.escs.length) ps = ps.filter(p => f.escs.includes(resolveEsc(p, escLookup, { tournamentDate: opts?.tournamentDate, playersDB, temporalEscLookup: opts?.temporalEscLookup, fedBirthdates: opts?.fedBirthdates })));
  if (f.tees.length) ps = ps.filter(p => p.teeName != null && f.tees.includes(p.teeName));
  if (f.club) ps = ps.filter(p => p.club === f.club);
  if (f.sex) {
    // Resolve sexo via _sex, playersDB[fed].sex, OU lookup por nome em
    // playersDB (entries kids:* com sex extraído de FFG resultats).
    const norm = normLoose;
    const sexByName = new Map<string, string>();
    for (const k in playersDB) {
      const e = (playersDB as any)[k];
      if ((e?.sex === "M" || e?.sex === "F") && e?.name) {
        const nn = norm(e.name);
        if (!sexByName.has(nn)) sexByName.set(nn, e.sex);
      }
    }
    ps = ps.filter(p => {
      let psex = (p as any)._sex || (p.fedCode && playersDB[p.fedCode]?.sex);
      if (!psex && p.name) psex = sexByName.get(norm(p.name));
      return psex === f.sex;
    });
  }
  return ps;
}

/** "PJA TOUR Vale Pisão - Dia 1" → "PJA TOUR Vale Pisão" */
function extractBaseName(name: string): string {
  return name.replace(/\s*[-–]?\s*(?:dia|round|ronda)\s*\d+\s*$/i, "").trim();
}

function detectRoundNumber(name: string): number | null {
  const m = name.match(/[-–]?\s*(?:dia|round|ronda)\s*(\d+)\s*$/i);
  return m ? parseInt(m[1]) : null;
}

/**
 * Par dos buracos REALMENTE jogados numa ronda.
 *
 * ⚠ Não usar o `parTotal` do jogador (par da volta completa) numa ronda a meio:
 * numa prova a decorrer o cartão só tem os buracos já jogados e comparar 9
 * buracos com o par de 18 dá to-pars absurdos (o Champion of Champions 2026
 * mostrava a R3 com "Média 44.6 (−26)" e um total de −50). Casos cobertos:
 *   - `pars` já vem do tamanho da ronda (9) → soma direita;
 *   - cartão de 18 com zeros nos buracos por jogar → só conta onde há score;
 *   - menos scores do que pares (sem zeros) → conta os primeiros N.
 */
export function playedParTotal(rs: { scores?: number[]; pars?: number[] }, fallback = 0): number {
  const pars = rs.pars || [];
  const sc = rs.scores || [];
  if (!pars.length) return fallback;
  const sum = (a: number[]) => a.reduce((x, y) => x + (y || 0), 0);
  if (sc.length === pars.length) {
    return sc.some((s) => !s) ? sum(pars.filter((_, i) => !!sc[i])) : sum(pars);
  }
  if (sc.length && sc.length < pars.length) return sum(pars.slice(0, sc.length));
  return sum(pars);
}

/**
 * Volta AINDA A DECORRER (não é o mesmo que cartão incompleto na fonte).
 * Distingue-se pelo gross publicado:
 *   • gross === soma dos buracos visíveis → o gross só cobre o que já jogou →
 *     está a meio da volta;
 *   • gross MAIOR que essa soma → jogou a volta toda e é o CARTÃO que vem
 *     truncado da fonte.
 * Sem isto, quem vai a meio aparece em 1º no acumulado: 13 buracos somam 54 e
 * uma volta inteira 68 (caso Johanna Janisch, European Ladies' Team Ch. 2026).
 */
export function isRoundInProgress(rs: { gross?: number | null; scores?: number[]; pars?: (number | null)[] }): boolean {
  const gross = rs.gross || 0;
  if (gross <= 0) return false;
  const sc = rs.scores || [];
  const n = sc.filter(Boolean).length;
  const nPar = (rs.pars || []).length;
  if (!n || !nPar || n >= nPar) return false;
  return sc.reduce((a, b) => a + (b > 0 ? b : 0), 0) === gross;
}

/** Expand multi-round: 1 torneio → R1 + R2 + ... + Total */
export function expandMultiRound(t: Tournament): Tournament[] {
  const nRounds = t.rounds || 1;
  const hasMulti = t.players.some(p => (p.roundScores?.length ?? 0) > 1);
  if (nRounds <= 1 || !hasMulti) return [t];

  const out: Tournament[] = [];

  // Per-round entries
  for (let rd = 1; rd <= nRounds; rd++) {
    const rdPlayers: Player[] = [];
    for (const p of t.players) {
      const rs = p.roundScores?.find(r => r.round === rd);
      if (!rs) continue;
      const parT = playedParTotal(rs, p.parTotal || 0);
      rdPlayers.push(normalizePlayer({
        ...p,
        scoreId: p.scoreId + "_R" + rd,
        grossTotal: rs.gross,
        toPar: rs.gross - parT,
        scores: rs.scores, par: rs.pars, si: rs.si, meters: rs.meters,
        courseRating: rs.courseRating, slope: rs.slope, teeName: rs.teeName,
        pcc: rs.pcc,
        startHole: rs.startHole,
        roundScores: [rs],
      }));
    }
    // Sort by gross for this round — WD players sempre no fim
    rdPlayers.sort((a, b) => {
      const aWD = a._wd; const bWD = b._wd;
      if (aWD && !bWD) return 1;
      if (!aWD && bWD) return -1;
      return numGross(a) - numGross(b);
    });
    out.push({ ...t, players: rdPlayers, _roundLabel: `R${rd}` } as any);
  }

  // Total (accumulated) entry — jogadores incompletos vão para o fim
  // playedRounds = máximo de rondas realmente jogadas (não o total declarado do torneio)
  // Isto evita marcar todos como "incompletos" quando ainda faltam rondas futuras.
  // ⚠ Voltas A DECORRER não contam para este máximo: numa ronda a meio só uma
  // parte do campo já saiu, e contá-la fazia com que todos os outros ficassem
  // "incompletos" — e, sendo muitos, a heurística de cut promovia-os a
  // eliminados. Aparecia "CUT" no campo inteiro a meio do segundo dia.
  // Uma volta A MEIO não conta como jogada (nem para quem a está a jogar, nem
  // para o máximo) — senão o campo todo ficava "incompleto" logo ao primeiro
  // cartão entregue.
  const openRound = (t as { _openRound?: number })._openRound;
  const playedRounds = Math.max(0, ...t.players.map(p =>
    (p.roundScores ?? []).filter(rs => !isRoundInProgress(rs)).length));

  const totalPlayers: Player[] = [];
  for (const p of t.players) {
    if (!p.roundScores?.length) continue;

    // Rondas válidas: excluir WD (gross>=999 ou scorecard todo zeros)
    const validRounds = p.roundScores.filter(rs =>
      rs.gross < 999 && !(rs.scores?.length && rs.scores.every(s => s === 0))
    );
    const isWD = validRounds.length < p.roundScores.length;   // desistiu em ≥1 ronda
    const nPlayed = validRounds.length;

    // "incompleto" = menos rondas válidas do que o máximo disponível OU alguma
    // volta ainda a decorrer (sem ser WD). O MultiRoundLeaderboard só classifica
    // os completos — sem a 2ª condição, quem ia a meio da última volta entrava
    // na classificação com um total mais baixo e ficava em 1º.
    const incomplete = !isWD && (nPlayed < playedRounds || validRounds.some(isRoundInProgress));

    const gross = validRounds.reduce((s, rs) => s + rs.gross, 0);
    const parPerRound = p.parTotal || (p.roundScores[0]?.pars.reduce((a, b) => a + b, 0) || 0);
    // Somar o par RONDA A RONDA (e só dos buracos jogados) em vez de
    // `parPerRound × nPlayed` — com uma ronda a meio o produto inventa par.
    const parT = validRounds.reduce((s, rs) => s + playedParTotal(rs, parPerRound), 0);

    totalPlayers.push(normalizePlayer({
      ...p,
      grossTotal: gross,
      toPar: gross - parT,
      _incomplete: incomplete,
      _wd: isWD,
      _roundsPlayed: nPlayed,
    } as any));
  }
  /* Detectar cut: contagem de jogadores por nRoundsPlayed. O N < playedRounds
     com >= 5 jogadores e maior contagem e o "cut" (ex: 80 jogadores em 2R apos
     R3 -- foram eliminados no cut, nao desistiram). Promover esses de _incomplete
     para _cut. */
  const countByN: Record<number, number> = {};
  for (const p of totalPlayers) {
    const n = (p as any)._roundsPlayed as number;
    if (!(p as any)._wd && n > 0 && n < playedRounds) {
      countByN[n] = (countByN[n] || 0) + 1;
    }
  }
  let cutN = -1;
  let cutCount = 0;
  // ⚠ Com uma ronda AINDA A DECORRER não se procura cut nenhum: quem não saiu
  // tem menos voltas que os primeiros grupos, e a heurística lia isso como uma
  // eliminação em massa — a meio da manhã metade do campo aparecia como "CUT",
  // o líder da véspera incluído. Fica em "INC" (ronda por jogar), que é o que é.
  if (!openRound) {
    for (const k of Object.keys(countByN)) {
      const n = Number(k);
      if (countByN[n] >= 5 && countByN[n] > cutCount) {
        cutCount = countByN[n];
        cutN = n;
      }
    }
  }
  // Promover _incomplete -> _cut quando rondas batem com o cut detectado
  if (cutN > 0) {
    for (const p of totalPlayers) {
      const pa = p as any;
      if (pa._incomplete && !pa._wd && pa._roundsPlayed === cutN) {
        pa._cut = true;
        pa._incomplete = false;
      }
    }
  }

  // Completos ordenados por gross; cut no meio; incompletos no fim; WD no fim de tudo
  const complete   = totalPlayers.filter(p => !(p as any)._incomplete && !p._wd && !(p as any)._cut).sort((a, b) => numGross(a) - numGross(b));
  const cutPlayers = totalPlayers.filter(p =>  (p as any)._cut && !p._wd).sort((a, b) => numGross(a) - numGross(b));
  const wdPlayers  = totalPlayers.filter(p => p._wd);
  const incomplete = totalPlayers.filter(p =>  (p as any)._incomplete && !p._wd).sort((a, b) => numGross(a) - numGross(b));
  // Positions only for complete players
  let pos = 1;
  complete.forEach((p, i) => {
    if (i > 0 && numGross(p) !== numGross(complete[i - 1])) pos = i + 1;
    (p as any)._pos = pos;
  });
  cutPlayers.forEach(p => { (p as any)._pos = null; });
  incomplete.forEach(p => { (p as any)._pos = null; });
  // Label do tab: "Resumo" quando terminou, "Resumo R1–R2" quando ainda faltam rondas
  const accumLabel = playedRounds < nRounds ? `Resumo R1–R${playedRounds}` : "Resumo";
  const accumTourn = { ...t, players: [...complete, ...cutPlayers, ...incomplete, ...wdPlayers], _roundLabel: accumLabel, _isTotal: true, _cutAfterRound: cutN > 0 ? cutN : undefined } as any;
  out.push(accumTourn);

  return out;
}

/** Funde N torneios (rondas separadas) num único torneio multi-ronda sintético */
function mergeTournamentRounds(rounds: Tournament[]): Tournament {
  const sorted = [...rounds].sort((a, b) => {
    const ra = detectRoundNumber(a.name) ?? 99;
    const rb = detectRoundNumber(b.name) ?? 99;
    if (ra !== rb) return ra - rb;
    return (a.date || "").localeCompare(b.date || "");
  });

  const nRounds = sorted.length;
  const byKey = new Map<string, { player: Player; rsArr: RoundScore[] }>();

  sorted.forEach((t, ri) => {
    for (const p of t.players) {
      const key = p.fedCode || ("name:" + p.name.toLowerCase().trim());
      const rs: RoundScore = {
        round: ri + 1,
        gross: numGross(p),
        scores: p.scores || p.roundScores?.[0]?.scores || [],
        pars: p.par || p.roundScores?.[0]?.pars || [],
        si: p.si || p.roundScores?.[0]?.si || [],
        meters: p.meters || p.roundScores?.[0]?.meters || [],
        courseRating: p.courseRating ?? p.roundScores?.[0]?.courseRating,
        slope: p.slope ?? p.roundScores?.[0]?.slope,
        teeName: p.teeName ?? p.roundScores?.[0]?.teeName,
      };
      if (byKey.has(key)) {
        byKey.get(key)!.rsArr.push(rs);
      } else {
        byKey.set(key, { player: p, rsArr: [rs] });
      }
    }
  });

  const refParTotal = sorted[0].players[0]?.parTotal
    || sorted[0].players[0]?.par?.reduce((a, b) => a + b, 0)
    || 72;

  const players: Player[] = [];
  for (const { player, rsArr } of byKey.values()) {
    const grossTotal = rsArr.reduce((s, r) => s + r.gross, 0);
    players.push({
      ...player,
      roundScores: rsArr,
      grossTotal,
      toPar: grossTotal - refParTotal * rsArr.length,
      parTotal: refParTotal,
      scores: rsArr[0]?.scores,
      par:    rsArr[0]?.pars,
      si:     rsArr[0]?.si,
      meters: rsArr[0]?.meters,
    });
  }

  const baseName  = extractBaseName(sorted[0].name);
  const lastDate  = sorted[sorted.length - 1].date;
  const tcodeList = sorted.map(t => t.tcode).join("+");

  return {
    ...sorted[0],
    name: baseName,
    date: lastDate,
    rounds: nRounds,
    playerCount: players.length,
    players,
    tcode: tcodeList,
    _sourceFile: sorted[0]._sourceFile,
    _sourceIndex: sorted[0]._sourceIndex,
    _isSynthetic: true,
    _subRounds: sorted,
  } as any;
}

/**
 * Constrói a lista de display: detecta pares "Dia 1/Dia 2" com mesmo ccode+baseName,
 * cria torneios sintéticos e esconde os originais da sidebar.
 */
export function buildDisplayList(tournaments: Tournament[]): Tournament[] {
  const candidates = new Map<string, Tournament[]>();
  for (const t of tournaments) {
    if (detectRoundNumber(t.name) == null) continue;
    const base = extractBaseName(t.name);
    const key  = `${t.ccode || "?"}_${base.toLowerCase().trim()}`;
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key)!.push(t);
  }

  const hiddenTcodes = new Set<string>();
  const synthetics: Tournament[] = [];
  for (const group of candidates.values()) {
    if (group.length < 2) continue;
    group.forEach(t => hiddenTcodes.add(t.tcode));
    synthetics.push(mergeTournamentRounds(group));
  }

  const standalone = tournaments.filter(t => !hiddenTcodes.has(t.tcode));
  return [...standalone, ...synthetics].sort((a, b) => {
    const d = (b.date || "").localeCompare(a.date || "");
    if (d !== 0) return d;
    const ka = (a.ccode || "?") + "/" + String(a.tcode ?? "?");
    const kb = (b.ccode || "?") + "/" + String(b.tcode ?? "?");
    return ka.localeCompare(kb);
  });
}
