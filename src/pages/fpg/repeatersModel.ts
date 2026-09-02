/**
 * src/pages/fpg/repeatersModel.ts
 *
 * "Quem repete" — lógica PURA por trás do painel que a tab "Edições anteriores"
 * mostra por cima da tabela: quem do field de HOJE já jogou esta prova, o que
 * fez aqui, como está a forma agora e o que se espera que faça.
 *
 * Porquê aqui e não no `ui/circuit`: isto só funciona com dados que são da FPG
 * — federado, HCP exacto à data da volta, HCP exacto de hoje (federados.json),
 * CR/Slope do tee de cada jogador. As outras páginas de circuito (England,
 * MAJOR, FFG) não têm nada disto.
 *
 * ⚠ O field de hoje vem do DRAW quando o torneio ainda não tem resultados — que
 * é o caso interessante (véspera da prova). Ler só `players[]` deixava o painel
 * vazio exactamente quando ele serve para alguma coisa.
 */
import type { Tournament, Player } from "../../data/fpgTypes";
import { computeSD } from "../../data/fpgUtils";

/** Uma volta jogada por um repetente numa edição anterior. */
export interface RepeaterRound {
  year: number;
  round: number;
  gross: number;
  /** Score differential da volta (null quando falta CR/Slope ou é sentinela). */
  sd: number | null;
  cr: number | null;
  slope: number | null;
  tee: string | null;
}

/** O que um jogador fez numa edição anterior. */
export interface RepeaterEdition {
  id: string;
  year: number;
  pos: number | null;
  total: number | null;
  toPar: number | null;
  /** HCP exacto que ele tinha À DATA dessa prova. */
  hcpThen: number | null;
  rounds: RepeaterRound[];
}

export interface RepeaterForecast {
  /** Gross esperado numa volta. */
  perRound: number;
  /** Gross esperado no torneio (perRound × nº de voltas). */
  total: number;
  /** Extremos plausíveis do total (bom dia / mau dia). */
  low: number;
  high: number;
  /** ±par esperado no torneio, quando se conhece o par. */
  toPar: number | null;
  /**
   * "historico" — ancorado no que ELE fez nesta prova, corrigido pela variação
   * do índice desde então (o caso bom).
   * "indice" — só a partir do índice de hoje, quando as voltas antigas não têm
   * CR/Slope utilizável. Menos fiável; a UI di-lo.
   */
  basis: "historico" | "indice";
  /**
   * false quando NÃO se conhece o CR/Slope do tee que ele vai jogar hoje e se
   * usou o do tee que jogou antes. Caso real no PJA Torre: em 2026 as raparigas
   * passam para as "Laranjas", que não aparecem em edição nenhuma — a previsão
   * delas assume, à falta de melhor, o rating das amarelas de 2025. É uma
   * suposição, e a UI tem de a mostrar como tal.
   */
  teeKnown: boolean;
}

export interface Repeater {
  fed: string | null;
  name: string;
  club: string | null;
  escalao: string | null;
  sex: string | null;
  /** Índice de HOJE (federados.json). */
  hcpNow: number | null;
  /** Índice na última edição em que jogou. */
  hcpThen: number | null;
  /** hcpNow − hcpThen. Negativo = melhorou. */
  hcpDelta: number | null;
  editions: RepeaterEdition[];
  /** Melhor ±par que já fez nesta prova. */
  bestToPar: number | null;
  /** Média dos differentials das voltas que fez nesta prova. */
  sdAvg: number | null;
  sdBest: number | null;
  /** Tee que vai jogar (do draw), quando se sabe. */
  teeNow: string | null;
  forecast: RepeaterForecast | null;
}

/** Um jogador do field de hoje (draw ou leaderboard já publicada). */
export interface FieldEntry {
  fed: string | null;
  name: string;
  tee?: string | null;
}

/** Dados de hoje vindos do federados.json, por federado. */
export interface FedInfo {
  hcp: number | null;
  club: string | null;
  escalao: string | null;
  sex: string | null;
}

const norm = (s: string | null | undefined): string =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Chave de nome para casar jogadores entre edições quando não há federado.
 * ⚠ A FPG escreve "APELIDO,Nome" na classificação e "Nome Apelido" no draw —
 * ordenar os tokens faz as duas darem a mesma chave (mesmo truque do `vetKey`
 * da /major, onde o Doral e o Future Masters divergiam no mesmo jogador).
 */
export function nameKey(name: string | null | undefined): string {
  const t = norm(name).split(" ").filter(Boolean);
  return t.sort().join(" ");
}

/** Índice de um jogador dentro de uma edição: pelo federado, senão pelo nome. */
const keyOf = (fed: string | null | undefined, name: string): string =>
  fed ? `f:${fed}` : `n:${nameKey(name)}`;

/** Extrai o field de HOJE: o draw da 1ª ronda se existir, senão a leaderboard. */
export function currentField(t: Tournament | null | undefined): FieldEntry[] {
  if (!t) return [];
  const draws = (t as unknown as { _draws?: Record<string, { groups?: { tee?: string | null; players?: { nome?: string; fed?: string | null; tee?: string | null }[] }[] }> })._draws;
  const r1 = draws && (draws["1"] || Object.values(draws)[0]);
  const out: FieldEntry[] = [];
  for (const g of r1?.groups || []) {
    for (const p of g.players || []) {
      if (!p?.nome) continue;
      out.push({ fed: p.fed || null, name: p.nome, tee: p.tee ?? g.tee ?? null });
    }
  }
  if (out.length) return out;
  for (const p of t.players || []) {
    if (!p?.name) continue;
    out.push({ fed: (p as Player).fedCode || null, name: p.name, tee: (p as Player).teeName || null });
  }
  return out;
}

/** SD de uma volta, reaproveitando o computeSD oficial (trata PCC e sentinelas). */
function roundSD(p: Player, r: NonNullable<Player["roundScores"]>[number]): number | null {
  const asPlayer = {
    ...p,
    scores: r.scores || [],
    par: r.pars || p.par,
    si: r.si || p.si,
    nholes: (r.scores || []).length || p.nholes,
    grossTotal: r.gross ?? null,
    courseRating: r.courseRating ?? p.courseRating,
    slope: r.slope ?? p.slope,
    pcc: (r as { pcc?: number }).pcc ?? (p as { pcc?: number }).pcc,
  } as unknown as Player;
  return computeSD(asPlayer).sd;
}

/**
 * CR/Slope por (tee, sexo) recolhidos das edições anteriores — é assim que se
 * sabe o rating do tee que um jogador vai jogar hoje.
 * ⚠ Tem de incluir o SEXO: no mesmo campo, as amarelas medidas em 2025 dão
 * 66.2/122 aos rapazes e 71.1/126 às raparigas. Um mapa só por cor atribuía a
 * uns o rating dos outros e a previsão saía deslocada vários golpes.
 */
export function teeRatings(prev: Tournament[], sexOf: (fed: string | null) => string | null): Map<string, { cr: number; slope: number }> {
  const acc = new Map<string, { cr: number; slope: number; n: number }>();
  for (const t of prev) {
    for (const p of t.players || []) {
      const sex = sexOf((p as Player).fedCode || null) || "?";
      for (const r of (p.roundScores || []).length ? p.roundScores! : [{ courseRating: p.courseRating, slope: p.slope, teeName: p.teeName } as NonNullable<Player["roundScores"]>[number]]) {
        const cr = r.courseRating ?? p.courseRating;
        const slope = r.slope ?? p.slope;
        const tee = norm(r.teeName ?? p.teeName);
        if (!cr || !slope || !tee) continue;
        const k = `${tee}|${sex}`;
        const cur = acc.get(k);
        if (cur) { cur.cr += cr; cur.slope += slope; cur.n += 1; }
        else acc.set(k, { cr, slope, n: 1 });
      }
    }
  }
  const out = new Map<string, { cr: number; slope: number }>();
  for (const [k, v] of acc) out.set(k, { cr: v.cr / v.n, slope: v.slope / v.n });
  return out;
}

/**
 * Distância típica entre a MÉDIA das voltas de um jogador e o índice dele.
 * O índice WHS é a média das 8 melhores de 20 — o potencial de um bom dia, que
 * se joga ~1 em cada 5 voltas. Prever "gross = par + índice" é prever sempre o
 * melhor dia; a diferença medida ronda os 3-4 golpes. Só é usado quando não há
 * histórico do jogador NESTA prova (basis "indice").
 */
export const SD_MEDIA_ACIMA_DO_INDICE = 3.5;

/** Espalhamento mínimo do intervalo (golpes de differential), para não anunciar
 *  uma previsão mais precisa do que o golfe permite. */
const SPREAD_MIN = 2.5;

function media(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length; }

export interface BuildRepeatersInput {
  /** Torneio aberto (dá o field de hoje e o nº de voltas). */
  current: Tournament;
  /** Edições anteriores da mesma prova, mais recente primeiro. */
  previous: { id: string; year: number; t: Tournament }[];
  /** federados.json indexado por código de federado. */
  fedInfo: (fed: string | null) => FedInfo | null;
  /** Nº de voltas desta edição (default: o `rounds` do torneio, ou 1). */
  nRounds?: number;
  /** Par de uma volta (default: o do primeiro jogador que o traga). */
  parPerRound?: number | null;
}

/**
 * Cruza o field de hoje com as edições anteriores e devolve os repetentes,
 * ordenados pelo melhor resultado que já fizeram aqui.
 */
export function buildRepeaters(input: BuildRepeatersInput): Repeater[] {
  const { current, previous, fedInfo } = input;
  const field = currentField(current);
  if (!field.length || !previous.length) return [];

  const nRounds = input.nRounds
    || Math.max(1, ...previous.map((p) => Math.max(1, ...(p.t.players || []).map((x) => (x.roundScores || []).length || 1))));
  const parPerRound = input.parPerRound
    ?? current.players?.find((p) => typeof p.parTotal === "number")?.parTotal
    ?? previous[0]?.t.players?.find((p) => typeof p.parTotal === "number")?.parTotal
    ?? null;

  const sexOf = (fed: string | null) => fedInfo(fed)?.sex ?? null;
  const ratings = teeRatings(previous.map((p) => p.t), sexOf);

  // Índice: chave → participações nas edições anteriores.
  const hist = new Map<string, RepeaterEdition[]>();
  for (const { id, year, t } of previous) {
    for (const p of t.players || []) {
      if (!p?.name) continue;
      const k = keyOf((p as Player).fedCode, p.name);
      const rounds: RepeaterRound[] = [];
      for (const r of p.roundScores || []) {
        if (typeof r.gross !== "number" || r.gross >= 900) continue;
        rounds.push({
          year, round: r.round ?? rounds.length + 1, gross: r.gross,
          sd: roundSD(p as Player, r),
          cr: r.courseRating ?? p.courseRating ?? null,
          slope: r.slope ?? p.slope ?? null,
          tee: r.teeName ?? p.teeName ?? null,
        });
      }
      const ed: RepeaterEdition = {
        id, year,
        pos: typeof p.pos === "number" ? p.pos : (parseInt(String(p.pos ?? ""), 10) || null),
        total: typeof p.grossTotal === "number" && p.grossTotal < 900 ? p.grossTotal : null,
        toPar: typeof p.toPar === "number" ? p.toPar : null,
        hcpThen: typeof p.hcpExact === "number" ? p.hcpExact : null,
        rounds,
      };
      const arr = hist.get(k);
      if (arr) arr.push(ed); else hist.set(k, [ed]);
    }
  }

  const out: Repeater[] = [];
  for (const f of field) {
    const editions = hist.get(keyOf(f.fed, f.name));
    if (!editions?.length) continue;
    editions.sort((a, b) => b.year - a.year);

    const info = fedInfo(f.fed);
    const sds = editions.flatMap((e) => e.rounds.map((r) => r.sd)).filter((x): x is number => x != null);
    const sdAvg = sds.length ? media(sds) : null;
    const sdBest = sds.length ? Math.min(...sds) : null;
    const hcpNow = info?.hcp ?? null;
    // O índice "de então" é o da edição mais recente que traga um.
    const hcpThen = editions.find((e) => e.hcpThen != null)?.hcpThen ?? null;
    const toPars = editions.map((e) => e.toPar).filter((x): x is number => x != null);

    // Tee de hoje → CR/Slope. Do draw quando existe; senão o tee que ele jogou.
    const teeNow = f.tee || editions[0]?.rounds[0]?.tee || null;
    const sex = info?.sex || "?";
    const ratTee = ratings.get(`${norm(teeNow)}|${sex}`) ?? ratings.get(`${norm(teeNow)}|?`) ?? null;
    const rat = ratTee
      ?? (editions[0]?.rounds[0]?.cr && editions[0]?.rounds[0]?.slope
        ? { cr: editions[0].rounds[0].cr!, slope: editions[0].rounds[0].slope! } : null);

    let forecast: RepeaterForecast | null = null;
    if (rat) {
      let sdEsp: number | null = null;
      let basis: RepeaterForecast["basis"] = "historico";
      if (sdAvg != null) {
        // Ancorar no que ele FEZ aqui e corrigir pela evolução do índice: se
        // baixou 2 pontos desde a última edição, espera-se ~2 golpes melhor.
        const ajuste = hcpNow != null && hcpThen != null ? hcpNow - hcpThen : 0;
        sdEsp = sdAvg + ajuste;
      } else if (hcpNow != null) {
        sdEsp = hcpNow + SD_MEDIA_ACIMA_DO_INDICE;
        basis = "indice";
      }
      if (sdEsp != null) {
        const spread = sds.length >= 2
          ? Math.max(SPREAD_MIN, (Math.max(...sds) - Math.min(...sds)) / 2)
          : SD_MEDIA_ACIMA_DO_INDICE;
        const toGross = (sd: number) => rat.cr + (sd * rat.slope) / 113;
        const perRound = Math.round(toGross(sdEsp));
        forecast = {
          perRound,
          total: perRound * nRounds,
          low: Math.round(toGross(sdEsp - spread)) * nRounds,
          high: Math.round(toGross(sdEsp + spread)) * nRounds,
          toPar: parPerRound != null ? perRound * nRounds - parPerRound * nRounds : null,
          basis,
          teeKnown: ratTee != null,
        };
      }
    }

    out.push({
      fed: f.fed, name: f.name,
      club: info?.club ?? null,
      escalao: info?.escalao ?? null,
      sex: info?.sex ?? null,
      hcpNow, hcpThen,
      hcpDelta: hcpNow != null && hcpThen != null ? +(hcpNow - hcpThen).toFixed(1) : null,
      editions,
      bestToPar: toPars.length ? Math.min(...toPars) : null,
      sdAvg: sdAvg != null ? +sdAvg.toFixed(1) : null,
      sdBest: sdBest != null ? +sdBest.toFixed(1) : null,
      teeNow,
      forecast,
    });
  }

  // Melhor ±par aqui primeiro; sem ±par, pela previsão.
  out.sort((a, b) =>
    (a.bestToPar ?? 999) - (b.bestToPar ?? 999)
    || (a.forecast?.total ?? 9e9) - (b.forecast?.total ?? 9e9)
    || a.name.localeCompare(b.name));
  return out;
}
