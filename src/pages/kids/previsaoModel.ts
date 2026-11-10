/**
 * pages/kids/previsaoModel.ts
 *
 * Modelo (funcoes puras) para a tab "Previsao":
 *   1. buildHoleProfile  — perfil do Manuel: strokes vs par por (par, distancia)
 *      a partir de TODAS as voltas dele (estilo "expected score" do Broadie).
 *   2. buildGamePlan     — plano de jogo buraco-a-buraco (atacar/neutro/defender),
 *      alcance (drive/2a pancada) e onde recebe pancada de handicap.
 *   3. estimateField     — score vencedor / top-10 / mediana das edicoes
 *      passadas do MESMO torneio+escalao (member-history-slim).
 */
import type { PlayerPageData } from "../../data/playerDataLoader";
import type { Tee } from "../../data/types";
import { strokesOnHole } from "../../utils/whsCalc";
import { firstShotClub } from "../../utils/clubScale";
import { classificarPorTotal, temCartao } from "../../utils/classificacao";
import { buracosDoFlight } from "../../utils/voltasJogadas";

// ── 1. Perfil do Manuel por (par, distancia) ─────────────────────────────
export interface HoleProfile {
  /** Amostras de strokes-vs-par por par (3/4/5). */
  byPar: Record<number, { dist: number | null; vsPar: number }[]>;
  overallVsPar: number;
  nHoles: number;
  /** true se o perfil usou apenas voltas recentes (últimos meses). */
  recent: boolean;
  /** Strokes-vs-par esperados num buraco de `par` e `dist` (metros). */
  expectedVsPar(par: number | null, dist: number | null): number | null;
  /** Quantos birdies (ou melhor) / pares / bogeys (ou pior) fez em buracos do
   *  mesmo par a ±(largura do núcleo) metros — null com menos de 3 buracos. */
  distribution(par: number | null, dist: number | null): HoleHist | null;
}
export interface HoleHist { n: number; birdies: number; pares: number; bogeys: number }

const KERNEL_BW: Record<number, number> = { 3: 18, 4: 30, 5: 42 };
const RECENT_MONTHS = 6;
const MIN_RECENT_HOLES = 120; // ~7 voltas 18h; abaixo disto cai p/ histórico todo

function parseRoundDate(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/** Perfil por (par, distância). Sem `soVoltas`: todas as voltas, preferindo as
 *  dos últimos 6 meses. Com `soVoltas` (scoreIds): só essas, sem corte de
 *  datas — é assim que se faz o «Bom dia» (as 8 voltas que contam para o
 *  handicap, `ultimas20`). */
export function buildHoleProfile(pd: PlayerPageData | null, soVoltas?: Set<string>): HoleProfile {
  // Recolhe todas as amostras e prefere as RECENTES (últimos 6 meses): um
  // júnior melhora depressa — a média de toda a carreira sobrestima o que ele
  // faz HOJE. Só cai para o histórico completo se não houver dados recentes.
  type Sample = { par: number; dist: number | null; vsPar: number; ts: number | null };
  const all: Sample[] = [];
  if (pd) {
    for (const c of pd.DATA || []) {
      for (const r of c.rounds || []) {
        if (soVoltas && !soVoltas.has(String(r.scoreId))) continue;
        const hs = pd.HOLES?.[r.scoreId];
        if (!hs) continue;
        const ts = parseRoundDate((r as { date?: string }).date);
        const g = hs.g || [], p = hs.p || [], m = hs.m || [];
        for (let i = 0; i < g.length; i++) {
          const gi = g[i], pi = p[i];
          if (gi == null || pi == null || gi <= 0 || pi <= 0) continue;
          const vsPar = gi - pi;
          if (vsPar < -3 || vsPar > 8) continue; // descartar lixo
          const dist = (m[i] != null && (m[i] as number) > 0) ? (m[i] as number) : null;
          all.push({ par: pi, dist, vsPar, ts });
        }
      }
    }
  }
  const cutoff = Date.now() - RECENT_MONTHS * 30.4 * 24 * 3600 * 1000;
  const recentSamples = soVoltas ? all : all.filter(s => s.ts != null && s.ts >= cutoff);
  const recent = soVoltas ? true : recentSamples.length >= MIN_RECENT_HOLES;
  const used = recent ? recentSamples : all;

  const byPar: Record<number, { dist: number | null; vsPar: number }[]> = { 3: [], 4: [], 5: [] };
  let sum = 0, n = 0;
  for (const s of used) {
    if (!byPar[s.par]) byPar[s.par] = [];
    byPar[s.par].push({ dist: s.dist, vsPar: s.vsPar });
    sum += s.vsPar; n++;
  }
  const overallVsPar = n > 0 ? sum / n : 0;

  function avgFor(par: number): number | null {
    const arr = byPar[par];
    if (!arr || arr.length === 0) return null;
    return arr.reduce((a, b) => a + b.vsPar, 0) / arr.length;
  }

  function expectedVsPar(par: number | null, dist: number | null): number | null {
    if (par == null) return null;
    const arr = byPar[par];
    if (!arr || arr.length === 0) return overallVsPar || null;
    if (dist != null) {
      const bw = KERNEL_BW[par] ?? 30;
      let wSum = 0, vSum = 0, used = 0;
      for (const s of arr) {
        if (s.dist == null) continue;
        const z = (s.dist - dist) / bw;
        const w = Math.exp(-z * z);
        wSum += w; vSum += w * s.vsPar; used++;
      }
      if (used >= 3 && wSum > 0) {
        const v = vSum / wSum;
        return Math.max(-1, Math.min(3, v));
      }
    }
    const a = avgFor(par);
    return a == null ? overallVsPar : Math.max(-1, Math.min(3, a));
  }

  function distribution(par: number | null, dist: number | null): HoleHist | null {
    if (par == null || dist == null) return null;
    const bw = KERNEL_BW[par] ?? 30;
    const near = (byPar[par] ?? []).filter(s => s.dist != null && Math.abs(s.dist - dist) <= bw);
    if (near.length < 3) return null;
    return { n: near.length, birdies: near.filter(s => s.vsPar < 0).length,
      pares: near.filter(s => s.vsPar === 0).length, bogeys: near.filter(s => s.vsPar > 0).length };
  }

  return { byPar, overallVsPar, nHoles: n, recent, expectedVsPar, distribution };
}

// ── 2. Plano de jogo buraco-a-buraco ─────────────────────────────────────
type HoleTag = "attack" | "neutral" | "defend";
export interface HolePlan {
  hole: number;
  par: number | null;
  si: number | null;
  dist: number | null;
  remainingAfterDrive: number | null;
  reach: "reg" | "stretch" | "out";
  getsStroke: boolean;
  expVsPar: number | null;
  expStrokes: number | null;
  /** «Bom dia»: o esperado pelo perfil das voltas que contam para o handicap
   *  (as 8 melhores das últimas 20) — dados reais por buraco, não um desconto
   *  igual em todos (04/11/2026: o «Já/Pode» antigo era a Média menos uma
   *  constante, e a melhor volta de sempre não serve de marcador num júnior). */
  expBom: number | null;
  tag: HoleTag;
  /** De onde vem o Atacar/Neutro/Defender: o field da edição anterior, o SI do
   *  campo (sem field — provas FPG/Drive/…) ou, sem SI, o perfil do Manuel. */
  tagSource: "manuel" | "field" | "si" | "perfil";
  /** Birdies/pares/bogeys dele em buracos parecidos (mesmo par, distância
   *  próxima) nos últimos 6 meses — o que sustenta o Atacar/Defender. */
  hist: HoleHist | null;
  note: string;
  /** vsPar médio do field na edição anterior (null se sem dados). */
  fieldVsPar: number | null;
}

export interface GamePlanOpts { driveM: number; secondM: number; courseHcp: number; fieldVsPar?: (number | null)[]; bomProfile?: HoleProfile | null }

/** Texto de estratégia COERENTE com a tag (atacar/neutro/defender). */
function strategyNote(tag: HoleTag, par: number | null, dist: number | null, remainingAfterDrive: number | null, secondM: number, peloManuel: boolean, saida = "Drive"): string {
  const rem = remainingAfterDrive;
  if (par === 3) {
    return tag === "attack" ? (dist != null && dist <= 130 ? "Ferro curto — atacar a bandeira." : "Num bom dia faz par ou melhor — atacar o green.")
      : tag === "defend" ? (peloManuel ? "Mesmo num bom dia perde pancada — centro do green, par é ganho." : "Par-3 exigente — centro do green, par é ganho.")
      : "Centro do green, 2 putts.";
  }
  if (par === 4) {
    return tag === "attack"
      ? (rem != null && rem > 110 ? `${saida} + ${Math.round(rem)}m ao green — oportunidade de birdie.` : `${saida} + wedge — oportunidade de birdie.`)
      : tag === "defend" ? (peloManuel ? "Mesmo num bom dia perde pancada — par é excelente, evitar o duplo." : "Buraco difícil — evitar o duplo, par é excelente.")
      : `${saida} + ${rem != null ? Math.round(rem) + "m" : "ferro"} ao green — 2 putts.`;
  }
  if (par === 5) {
    const em2 = rem != null && rem <= secondM * 1.05;
    const terceira = rem != null ? Math.max(0, Math.round(rem - secondM)) : null;
    return tag === "attack"
      ? (em2 ? "Alcançável em 2 — ir ao green, oportunidade de birdie."
        : terceira != null && terceira <= 40 ? `Quase em 2 — a 3.ª é um chip (~${terceira}m), oportunidade de birdie.`
        : terceira != null && terceira <= 110 ? `Em 3 pancadas, a última com wedge (~${terceira}m) — oportunidade de birdie.`
        : "Em 3 pancadas — deixar a 2.ª para um wedge, oportunidade de birdie.")
      : tag === "defend" ? (peloManuel ? "Mesmo num bom dia perde pancada — 3 pancadas seguras, evitar erros." : "Par-5 longo — 3 pancadas seguras, evitar erros.")
      : "Par-5 de 3 pancadas — lay-up para a distância preferida.";
  }
  return "";
}

/** Limiares do Plano pelo «Bom dia» (pancadas acima do par, num bom dia). */
const BOM_ATACAR = 0.05;
const BOM_DEFENDER = 0.2;

export function buildGamePlan(tee: Tee, profile: HoleProfile, opts: GamePlanOpts): HolePlan[] {
  const { driveM, secondM, courseHcp, fieldVsPar, bomProfile } = opts;
  const chRounded = Math.round(courseHcp);

  // ── Passe 1: base por buraco (par/dist/alcance/expectativa média) ──
  const base = tee.holes.map(h => {
    const par = h.par;
    const dist = h.distance;
    const si = h.si;
    const expVsPar = profile.expectedVsPar(par, dist);
    const expStrokes = (par != null && expVsPar != null) ? par + expVsPar : null;
    // Pancada de handicap neste buraco — conta da biblioteca (dá a 2.ª com CH > 18)
    const getsStroke = si != null && strokesOnHole(si, chRounded) > 0;

    let reach: "reg" | "stretch" | "out" = "reg";
    let remainingAfterDrive: number | null = null;
    let note = "";
    // O taco de saída (utils/clubScale) — nos par 4 curtos não é o driver.
    const first = firstShotClub(par, dist, driveM);
    const saida = !first || first.abbr === "D" ? "Drive" : first.club;

    if (par === 3) {
      reach = dist == null ? "reg" : dist <= driveM ? "reg" : dist <= driveM * 1.08 ? "stretch" : "out";
      note = dist != null && dist <= 130 ? "Ferro curto — apontar à bandeira."
        : (reach === "out" || (dist != null && dist > 175)) ? "Par-3 longo — centro do green."
        : "Centro do green.";
    } else if (par === 4) {
      remainingAfterDrive = dist != null ? Math.max(0, dist - (first?.m ?? driveM)) : null;
      const rem = remainingAfterDrive;
      reach = rem == null ? "reg" : rem <= secondM ? "reg" : rem <= secondM * 1.15 ? "stretch" : "out";
      note = rem != null && rem <= 110 ? `${saida} + wedge — buraco de birdie.`
        : reach === "out" ? "Fora de alcance em 2 — jogar seguro."
        : `${saida} + ${rem != null ? Math.round(rem) + "m" : "ferro"} ao green.`;
    } else if (par === 5) {
      const afterDrive = dist != null ? Math.max(0, dist - driveM) : null;
      remainingAfterDrive = afterDrive;
      const reachableIn2 = afterDrive != null && afterDrive <= secondM * 1.05;
      reach = afterDrive == null ? "reg" : reachableIn2 ? "reg" : afterDrive <= secondM * 2 ? "stretch" : "out";
      note = reachableIn2 ? "Alcançável em 2 — oportunidade de birdie."
        : "Par-5 de 3 pancadas — lay-up para a distância preferida.";
    }

    return {
      hole: h.hole, par, si, dist, remainingAfterDrive, reach, getsStroke, saida,
      expVsPar, expStrokes, note, fieldVsPar: fieldVsPar?.[h.hole - 1] ?? null,
    };
  });

  const parTotal = base.reduce((a, r) => a + (r.par ?? 0), 0);
  const profileTotal = base.reduce((a, r) => a + (r.expStrokes ?? (r.par ?? 0)), 0);
  const overPar = profileTotal - parTotal;

  // Redistribui a volta média do Manuel pela DIFICULDADE REAL de cada buraco
  // (vsPar do field na edição anterior) — dá spread real por buraco em vez de
  // um valor quase plano por par. Sem field, mantém o perfil do Manuel.
  const fieldW = base.map(r => Math.max(0, r.fieldVsPar ?? 0));
  const sumW = fieldW.reduce((a, b) => a + b, 0);
  const useField = base.filter(r => r.fieldVsPar != null).length >= 10 && sumW > 0;
  const media = base.map((r, i) => {
    if (r.par == null) return r.expStrokes;
    return useField ? r.par + overPar * (fieldW[i] / sumW) : r.expStrokes;
  });

  // «Bom dia»: o perfil das 8 voltas que contam para o handicap; com field,
  // redistribui-se pela dificuldade real de cada buraco como a Média.
  const bomBase = base.map(r => {
    const v = bomProfile && r.par != null ? bomProfile.expectedVsPar(r.par, r.dist) : null;
    return v != null && r.par != null ? r.par + v : null;
  });
  const bomOk = bomProfile != null && bomProfile.nHoles > 0 && bomBase.every((v, i) => v != null || base[i].par == null);
  const bomOver = bomBase.reduce<number>((a, v, i) => a + (v ?? base[i].par ?? 0), 0) - parTotal;
  const bom = base.map((r, i) => !bomOk || r.par == null ? null
    : useField ? r.par + bomOver * (fieldW[i] / sumW) : bomBase[i]);

  // Terciles da dificuldade por buraco (= média vsPar) → atacar/neutro/defender,
  // sempre com spread e alinhado à coluna Média.
  const vsParSorted = media
    .map((mv, i) => (mv != null && base[i].par != null) ? mv - (base[i].par as number) : null)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const easyTh = vsParSorted.length >= 6 ? vsParSorted[Math.floor((vsParSorted.length - 1) * 0.34)] : null;
  const hardTh = vsParSorted.length >= 6 ? vsParSorted[Math.floor((vsParSorted.length - 1) * 0.66)] : null;

  // Sem field, a dificuldade de cada buraco é a do SI do campo (1 = o mais
  // difícil): o perfil do Manuel por par+distância é quase plano e dava
  // «Defender» ao buraco mais fácil (Oeiras, buraco 1, SI 17 — 04/11/2026).
  const sis = base.map(r => r.si).filter((s): s is number => s != null);
  const useSi = !useField && sis.length >= Math.min(9, base.length);
  const maxSi = sis.length ? Math.max(...sis) : 18;

  return base.map((r, i) => {
    const expStrokes = media[i];
    const expVsPar = (expStrokes != null && r.par != null) ? expStrokes - r.par : r.expVsPar;
    const expBom = bom[i];
    const vsPar = (expStrokes != null && r.par != null) ? expStrokes - r.par : null;
    let tag: HoleTag = "neutral";
    let tagSource: HolePlan["tagSource"] = useField ? "field" : "perfil";
    if (expBom != null && r.par != null) {
      // Pelo Manuel (04/11/2026, escolha dela): o SI é a dificuldade para o
      // jogador em geral e contradizia os números dele (Oeiras: o buraco 3,
      // SI 1, é um par-5 de 425 m onde ele ganha pancadas). Atacar = num bom
      // dia faz par ou melhor; Defender = mesmo num bom dia fica acima do par.
      tagSource = "manuel";
      const bomVsPar = expBom - r.par;
      tag = bomVsPar <= BOM_ATACAR ? "attack" : bomVsPar >= BOM_DEFENDER ? "defend" : "neutral";
    } else if (useSi && r.si != null) {
      tagSource = "si";
      tag = r.si <= maxSi / 3 ? "defend" : r.si > (maxSi * 2) / 3 ? "attack" : "neutral";
    } else if (vsPar != null && easyTh != null && hardTh != null) {
      tag = vsPar <= easyTh ? "attack" : vsPar >= hardTh ? "defend" : "neutral";
    } else if (expStrokes == null) {
      tag = r.reach === "out" ? "defend" : "neutral";
    }
    return { ...r, expVsPar, expStrokes, expBom, tag, tagSource, hist: profile.distribution(r.par, r.dist),
      note: strategyNote(tag, r.par, r.dist, r.remainingAfterDrive, secondM, tagSource === "manuel", r.saida) };
  });
}

// ── 3. Estimativa de score do field (edicoes passadas) ───────────────────
interface MHRoundLite { gross: number; strokes?: number[] }
interface MHTornLite { ageGroup: string; place: number | null; rounds: Record<string, MHRoundLite> }
interface MHPlrLite { name: string; torneios: Record<string, MHTornLite> }
interface MHEscMeta { par?: number[] }
interface MHSlimLite {
  torneios: Record<string, { name: string; startDate: string; holesPerRound: number; par?: number[] | null; byEscalao?: Record<string, MHEscMeta> }>;
  jogadores: Record<string, MHPlrLite>;
}
interface FieldTorneioLite { t: number; name: string }

interface EditionScore {
  year: string; tcode: string; nRounds: number; holesPerRound: number; parPerRound: number;
  winner: number; top10: number | null; median: number; field: number;
  /** true = entra na estimativa (formato de referência + field suficiente) */
  counted: boolean;
  /** motivo da exclusão, quando counted=false */
  exclReason: "format" | "field" | null;
}
export interface FieldEstimate {
  editions: EditionScore[];
  avgWinner: number | null;
  avgTop10: number | null;
  avgMedian: number | null;
  parPerRound: number | null;
  nRoundsTypical: number | null;
  holesPerRoundTypical: number | null;
  /** ex: "3×18" — formato de referência usado na estimativa */
  formatLabel: string | null;
  /** nº de edições que entram na estimativa */
  nCounted: number;
  /** nº de edições excluídas (total) */
  nExcluded: number;
  /** excluídas por formato diferente (rondas × buracos) */
  nExcludedFormat: number;
  /** excluídas por field pequeno (amostra pouco fiável) */
  nExcludedField: number;
  /** field mínimo aplicado (null se não chegou a filtrar por field) */
  minField: number | null;
}

const MIN_FIELD = 4;             // mínimo para a edição sequer aparecer na tabela
const MIN_FIELD_ESTIMATE = 10;   // mínimo para a edição CONTAR na estimativa (amostra fiável)
const MIN_GROSS_18 = 55, MIN_GROSS_9 = 28;

export function estimateField(mh: MHSlimLite | null, torneio: FieldTorneioLite | null, escalaoNome: string): FieldEstimate {
  const empty: FieldEstimate = { editions: [], avgWinner: null, avgTop10: null, avgMedian: null, parPerRound: null, nRoundsTypical: null, holesPerRoundTypical: null, formatLabel: null, nCounted: 0, nExcluded: 0, nExcludedFormat: 0, nExcludedField: 0, minField: null };
  if (!mh || !torneio) return empty;
  const baseName = torneio.name.replace(/\s+\d{4}\s*$/, "").trim();
  if (!baseName) return empty;

  const editions: EditionScore[] = [];
  for (const [tcode, meta] of Object.entries(mh.torneios)) {
    if (!meta?.name) continue;
    if (/Parent\/Child/i.test(meta.name)) continue;
    if (meta.name.replace(/\s+\d{4}\s*$/, "").trim() !== baseName) continue;
    const ym = meta.name.match(/(\d{4})/);
    if (!ym) continue;
    const par = meta.byEscalao?.[escalaoNome]?.par || meta.par || null;
    const doEscalao = Object.values(mh.jogadores).map((pl) => pl.torneios[tcode]).filter((t) => t && t.ageGroup === escalaoNome);
    // Buracos por volta do ESCALÃO, pelas voltas jogadas (10/11/2026): a ficha do
    // torneio diz 18 mas o Boys 8 e o 7 & Under jogam 9 — com o mínimo de 55
    // pancadas todas as voltas eram deitadas fora («Sem histórico»).
    const hpr = buracosDoFlight(doEscalao.flatMap((t) => Object.values(t.rounds || {})), par, meta.holesPerRound);
    const is9 = hpr === 9;
    const minGross = is9 ? MIN_GROSS_9 : MIN_GROSS_18;
    const parPerRound = Array.isArray(par) ? par.slice(0, hpr).reduce((a, b) => a + (b || 0), 0) : 0;

    // totais por jogador (so quem completou todas as rondas da edicao)
    let nRoundsMax = 0;
    const players: number[][] = [];
    for (const t of doEscalao) {
      const rs: number[] = [];
      for (const r of Object.values(t.rounds || {})) {
        if (!r || r.gross < minGross || !temCartao(r.gross)) continue;
        rs.push(r.gross);
      }
      if (rs.length === 0) continue;
      if (rs.length > nRoundsMax) nRoundsMax = rs.length;
      players.push(rs);
    }
    const totals = players
      .filter(rs => rs.length === nRoundsMax)
      .map(rs => rs.reduce((a, b) => a + b, 0))
      .sort((a, b) => a - b);
    if (totals.length < MIN_FIELD) continue;

    const median = totals[Math.floor((totals.length - 1) / 2)];
    editions.push({
      year: ym[1], tcode, nRounds: nRoundsMax, holesPerRound: hpr,
      parPerRound,
      winner: totals[0],
      // só há "top-10" quando o field chega a 10; senão o 10.º lugar não existe
      // (usar o último classificado inflacionava a estimativa em fields pequenos)
      top10: totals.length >= 10 ? totals[9] : null,
      median,
      field: totals.length,
      counted: false, exclReason: null, // definidos abaixo, após conhecer a referência
    });
  }
  editions.sort((a, b) => b.year.localeCompare(a.year));
  if (editions.length === 0) return empty;

  // ── Proteção anti-enviesamento (rondas × buracos) ──────────────────────────
  // Edições encurtadas (chuva → 2 voltas em vez de 3) ou com voltas de 9 buracos
  // têm totais numa escala diferente e distorciam as médias (uma edição de 2×18
  // "vencia" com ~145). Só entram na estimativa as edições no MESMO formato. O
  // formato de referência é o mais frequente entre as edições, com desempate a
  // favor da mais recente (melhor palpite para a próxima edição).
  const fmtKey = (e: EditionScore) => `${e.nRounds}x${e.holesPerRound}`;
  const freq = new Map<string, number>();
  for (const e of editions) freq.set(fmtKey(e), (freq.get(fmtKey(e)) || 0) + 1);
  let modalKey = fmtKey(editions[0]);
  let modalCount = -1;
  for (const e of editions) { // editions ordenadas por ano desc → empate fica com a mais recente
    const c = freq.get(fmtKey(e)) as number;
    if (c > modalCount) { modalCount = c; modalKey = fmtKey(e); }
  }
  const sameFormat = editions.filter(e => fmtKey(e) === modalKey);

  // ── 2.º filtro: field pequeno ──────────────────────────────────────────────
  // Edições com poucos jogadores (tipicamente os primeiros anos do torneio) são
  // amostras ruidosas e sistematicamente mais altas (campos fracos/jovens) — um
  // "vencedor" de 5 jogadores não diz o que é preciso para ganhar hoje. Só entram
  // as que têm field ≥ MIN_FIELD_ESTIMATE. Se NENHUMA no formato chegar lá, não
  // filtramos por field (torneio pequeno) — antes uma estimativa fraca que nenhuma.
  const reliable = sameFormat.filter(e => e.field >= MIN_FIELD_ESTIMATE);
  const fieldGuardApplied = reliable.length > 0;
  const counted = fieldGuardApplied ? reliable : sameFormat;
  const countedSet = new Set(counted);
  let nExcludedFormat = 0, nExcludedField = 0;
  for (const e of editions) {
    e.counted = countedSet.has(e);
    if (e.counted) { e.exclReason = null; continue; }
    e.exclReason = fmtKey(e) !== modalKey ? "format" : "field";
    if (e.exclReason === "format") nExcludedFormat++; else nExcludedField++;
  }

  const mean = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  const avgWinner = mean(counted.map(e => e.winner));
  const avgTop10 = mean(counted.filter(e => e.top10 != null).map(e => e.top10 as number));
  const avgMedian = mean(counted.map(e => e.median));
  // par/rondas tipicos = da edicao contada mais recente com par valido
  const ref = counted.find(e => e.parPerRound > 0) || counted[0];
  return {
    editions,
    avgWinner, avgTop10, avgMedian,
    parPerRound: ref.parPerRound || null,
    nRoundsTypical: ref.nRounds || null,
    holesPerRoundTypical: ref.holesPerRound || null,
    formatLabel: `${ref.nRounds}×${ref.holesPerRound}`,
    nCounted: counted.length,
    nExcluded: editions.length - counted.length,
    nExcludedFormat, nExcludedField,
    minField: fieldGuardApplied ? MIN_FIELD_ESTIMATE : null,
  };
}

/** vsPar médio do FIELD por buraco (18), da edição mais recente (com scores
 *  buraco-a-buraco) do MESMO torneio+escalão. Base da classificação de
 *  dificuldade do plano de jogo (atacar = fácil p/ field, defender = difícil). */
export function fieldHoleVsPar(mh: MHSlimLite | null, torneio: FieldTorneioLite | null, escalaoNome: string): (number | null)[] {
  const out: (number | null)[] = new Array(18).fill(null);
  if (!mh || !torneio) return out;
  const baseName = torneio.name.replace(/\s+\d{4}\s*$/, "").trim();
  if (!baseName) return out;
  let best: { year: number; sums: number[]; cnt: number[]; par: number[] } | null = null;
  for (const [tcode, meta] of Object.entries(mh.torneios)) {
    if (!meta?.name) continue;
    if (/Parent\/Child/i.test(meta.name)) continue;
    if (meta.name.replace(/\s+\d{4}\s*$/, "").trim() !== baseName) continue;
    const ym = meta.name.match(/(\d{4})/);
    if (!ym) continue;
    const year = parseInt(ym[1], 10);
    const par = meta.byEscalao?.[escalaoNome]?.par || meta.par;
    if (!Array.isArray(par)) continue;
    const sums = new Array(18).fill(0), cnt = new Array(18).fill(0);
    let any = false;
    for (const p of Object.values(mh.jogadores)) {
      const t = p.torneios?.[tcode];
      if (!t || t.ageGroup !== escalaoNome) continue;
      for (const r of Object.values(t.rounds || {})) {
        const st = r.strokes || [];
        for (let i = 0; i < 18; i++) {
          if (st[i] > 0 && par[i] > 0) { sums[i] += st[i]; cnt[i]++; any = true; }
        }
      }
    }
    if (!any) continue;
    if (!best || year > best.year) best = { year, sums, cnt, par };
  }
  if (!best) return out;
  for (let i = 0; i < 18; i++) out[i] = best.cnt[i] ? (best.sums[i] / best.cnt[i] - best.par[i]) : null;
  return out;
}


export interface TopFieldStats {
  year: string | null;
  roundKeys: string[];
  par: number[];
  players: string[];
  /** [holeIdx][roundIdx] = { avg, scores[], nomes[] } do top-N na edição anterior
   *  (`nomes[j]` é quem fez `scores[j]` — quem não tem pancadas nesse buraco não entra). */
  holes: { avg: number | null; scores: number[]; nomes: string[] }[][];
}

/** Comportamento do TOP-N (por total) na edição mais recente do MESMO
 *  torneio+escalão: média e scores por buraco e por ronda. Mostra que os bons
 *  fazem birdies onde a média do field/Manuel fica acima do par. */
export function topFieldHoleStats(
  mh: MHSlimLite | null, torneio: FieldTorneioLite | null, escalaoNome: string, topN = 5,
): TopFieldStats | null {
  if (!mh || !torneio) return null;
  const baseName = torneio.name.replace(/\s+\d{4}\s*$/, "").trim();
  if (!baseName) return null;
  let best: { year: number; tcode: string; par: number[] } | null = null;
  for (const [tcode, meta] of Object.entries(mh.torneios)) {
    if (!meta?.name || /Parent\/Child/i.test(meta.name)) continue;
    if (meta.name.replace(/\s+\d{4}\s*$/, "").trim() !== baseName) continue;
    const ym = meta.name.match(/(\d{4})/);
    if (!ym) continue;
    const year = parseInt(ym[1], 10);
    const par = meta.byEscalao?.[escalaoNome]?.par || meta.par;
    if (!Array.isArray(par)) continue;
    let has = false;
    for (const p of Object.values(mh.jogadores)) {
      const t = p.torneios?.[tcode];
      if (t && t.ageGroup === escalaoNome) {
        for (const r of Object.values(t.rounds || {})) { if ((r.strokes || []).some(x => x > 0)) { has = true; break; } }
      }
      if (has) break;
    }
    if (!has) continue;
    if (!best || year > best.year) best = { year, tcode, par };
  }
  if (!best) return null;
  const { tcode, par } = best;

  const players: { name: string; tot: number; rounds: Record<string, number[]> }[] = [];
  for (const p of Object.values(mh.jogadores)) {
    const t = p.torneios?.[tcode];
    if (!t || t.ageGroup !== escalaoNome) continue;
    const rounds: Record<string, number[]> = {};
    let tot = 0, any = false;
    for (const [rn, r] of Object.entries(t.rounds || {})) {
      const st = r.strokes || [];
      const g = r.gross || st.reduce((a, b) => a + (b > 0 ? b : 0), 0);
      if (st.some(x => x > 0) && temCartao(g)) { rounds[rn] = st; tot += g; any = true; }
    }
    if (any) players.push({ name: p.name, tot, rounds });
  }
  // Top-N só entre quem jogou TODAS as voltas (10/11/2026): por total simples,
  // quem só jogou 1 volta (77) ficava à frente do vencedor (3 voltas).
  const top = classificarPorTotal(players, p => Object.keys(p.rounds).length, p => p.tot).ordenados.slice(0, topN);
  const roundKeys = [...new Set(top.flatMap(p => Object.keys(p.rounds)))].sort((a, b) => Number(a) - Number(b));

  const holes: TopFieldStats["holes"] = [];
  for (let i = 0; i < 18; i++) {
    holes.push(roundKeys.map(rk => {
      // Pancadas e nome lado a lado: filtrar só as pancadas desalinhava os nomes do hover.
      const quem = top.map(p => ({ nome: p.name, sc: p.rounds[rk]?.[i] })).filter((x): x is { nome: string; sc: number } => typeof x.sc === "number" && x.sc > 0);
      const sc = quem.map(x => x.sc);
      const avg = sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null;
      return { avg, scores: sc, nomes: quem.map(x => x.nome) };
    }));
  }
  return { year: String(best.year), roundKeys, par, players: top.map(p => p.name), holes };
}


/** As últimas 20 voltas de 18 buracos com SD (da mais recente para trás) e as
 *  8 de SD mais baixo — as que contam para o índice (WHS). É daqui que saem o
 *  «Bom dia» (perfil só dessas 8, `buildHoleProfile(pd, bomIds)`) e o «em
 *  quantas das últimas 20 faria o handicap» da Previsão. */
export function ultimas20(pd: PlayerPageData | null): { sds: number[]; bomIds: Set<string> } {
  if (!pd) return { sds: [], bomIds: new Set() };
  const rs: { id: string; sd: number; ts: number }[] = [];
  for (const c of pd.DATA || []) {
    for (const r of c.rounds || []) {
      if (r.holeCount !== 18 || typeof r.sd !== "number") continue;
      const ts = parseRoundDate((r as { date?: string }).date);
      if (ts != null) rs.push({ id: String(r.scoreId), sd: r.sd, ts });
    }
  }
  const last = rs.sort((a, b) => b.ts - a.ts).slice(0, 20);
  const bomIds = new Set([...last].sort((a, b) => a.sd - b.sd).slice(0, 8).map(r => r.id));
  return { sds: last.map(r => r.sd), bomIds };
}

/** Comprimento do tee (04/11/2026, Mariana: «estamos a fazer uma análise apenas
 *  do SD… sem levar em conta a distância e dificuldade do tee»). As voltas de 18
 *  dos últimos `months` meses em 3 grupos pelo comprimento, comparado com o tee
 *  da prova (±`janela` m): em pancadas a distância pesa; em SD (que já desconta
 *  CR/Slope) vê-se se ele joga pior nos tees compridos do que o rating diz. */
export interface GrupoComprimento {
  key: "curtos" | "parecidos" | "compridos";
  n: number; metros: number | null; sdMedio: number | null; sdMelhor: number | null; vsParMedio: number | null;
}
export function porComprimento(pd: PlayerPageData | null, teeM: number, months = 6, janela = 250): GrupoComprimento[] {
  const cut = Date.now() - months * 30.4 * 24 * 3600 * 1000;
  const g: Record<GrupoComprimento["key"], { m: number; sd: number; vp: number | null }[]> = { curtos: [], parecidos: [], compridos: [] };
  for (const c of pd?.DATA || []) {
    for (const r of c.rounds || []) {
      if (r.holeCount !== 18 || typeof r.sd !== "number") continue;
      const ts = parseRoundDate((r as { date?: string }).date);
      if (ts == null || ts < cut) continue;
      const hm = (pd?.HOLES?.[r.scoreId]?.m || []).filter((x): x is number => typeof x === "number" && x > 0);
      const m = hm.length === 18 ? hm.reduce((a, b) => a + b, 0) : Number((r as { meters?: number }).meters) || 0;
      if (!m) continue;
      const gross = Number((r as { gross?: number }).gross), par = Number((r as { par?: number }).par);
      g[m < teeM - janela ? "curtos" : m > teeM + janela ? "compridos" : "parecidos"]
        .push({ m, sd: r.sd, vp: gross > 0 && par > 0 ? gross - par : null });
    }
  }
  const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return (["curtos", "parecidos", "compridos"] as const).map(key => {
    const v = g[key];
    const vps = v.map(x => x.vp).filter((x): x is number => x != null);
    return { key, n: v.length, metros: v.length ? Math.round(avg(v.map(x => x.m))!) : null,
      sdMedio: avg(v.map(x => x.sd)), sdMelhor: v.length ? Math.min(...v.map(x => x.sd)) : null, vsParMedio: avg(vps) };
  });
}
