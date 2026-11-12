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
import { compareNullsLast } from "../../hooks/useSort";
import { computeSD } from "../../data/fpgUtils";
import { isManuel } from "../../constants/manuel";
import { calcScore } from "../../utils/whsCalc";
import { norm } from "../../utils/courseAliases"; // a limpeza única «sem acentos, só letras e dígitos»
import { fedFpg, isFedFpg, playerKey } from "../../utils/playerKey";
import { parsePos, temCartao } from "../../utils/classificacao";
import { playerIdentity } from "../../data/model/identity";
import type { PlayerIdentity } from "../../data/model/types";

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
   * "forma" — o caso bom: as voltas das últimas semanas (player-stats).
   * "historico" — sem stats de forma: o que fez aqui, corrigido pela variação
   * do índice desde então.
   * "indice" — só o índice de hoje. O palpite mais fraco; a UI di-lo.
   */
  basis: "forma" | "historico" | "indice";
  /**
   * false quando NÃO se conhece o CR/Slope do tee que ele vai jogar hoje e se
   * usou o do tee que jogou antes. Caso real no PJA Torre: em 2026 as raparigas
   * passam para as "Laranjas", que não aparecem em edição nenhuma — a previsão
   * delas assume, à falta de melhor, o rating das amarelas de 2025. É uma
   * suposição, e a UI tem de a mostrar como tal.
   */
  teeKnown: boolean;
}

/** Forma actual do jogador (player-stats.json — voltas de TODA a carreira). */
export interface PlayerForm {
  avgSD5: number | null;
  avgSD8: number | null;
  avgSD20: number | null;
  lastSD: number | null;
  roundsLast3m: number;
  roundsLast12m: number;
  hcpDelta3m: number | null;
  bestGross: number | null;
  avgGross5: number | null;
  lastRoundDate: string | null;
}

export interface Repeater {
  /** Federado FPG para o índice e a forma WHS (o da prova; sem ele, o da ficha do Kids 2). */
  fed: string | null;
  /** O federado/licença tal como a prova o traz — com o nome, é a chave da
   *  linha (`playerKey`): dois homónimos não partilham dados (10/11/2026). */
  fedProva: string | null;
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
  /** Hora de saída e buraco de partida (do draw). */
  teeTime: string | null;
  startHole: number | null;
  /** Forma actual (player-stats). */
  form: PlayerForm | null;
  /**
   * Onde ficou face à MEDIANA do field na última edição que jogou (em
   * differential). Negativo = melhor que o campo do meio. Régua feita dos
   * adversários daquele dia, por isso absorve vento e estado do campo.
   * ⚠ Informação, NÃO entra na previsão: somá-lo à forma de hoje contava a
   * melhoria do jogador duas vezes.
   */
  courseFit: number | null;
  forecast: RepeaterForecast | null;
}

/** Um jogador do field de hoje (draw ou leaderboard já publicada). */
export interface FieldEntry {
  fed: string | null;
  name: string;
  tee?: string | null;
  teeTime?: string | null;
  startHole?: number | null;
  /** País (ISO) e nascimento (ISO, ou só o ano) que a PRÓPRIA prova traz —
   *  provas de fora: sem isto um estrangeiro sem ficha no Kids 2 ficava sem
   *  bandeira nem escalão no Scout (10/11/2026). */
  country?: string | null;
  dob?: string | null;
}

/** Dados de hoje vindos do federados.json, por federado. */
export interface FedInfo {
  hcp: number | null;
  club: string | null;
  escalao: string | null;
  sex: string | null;
}


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

/** País e nascimento de um registo da prova (resultado, inscrição ou linha do
 *  draw) — pela identidade do modelo comum (`src/data/model/identity.ts`). */
function paisENasc(x: object): { country: string | null; dob: string | null } {
  const id = (x as { identity?: PlayerIdentity }).identity ?? playerIdentity(x);
  return { country: id.countryIso, dob: id.dob ?? (id.birthYear != null ? String(id.birthYear) : null) };
}

/** Extrai o field de HOJE: o draw da 1ª ronda se existir, senão a leaderboard. */
export function currentField(t: Tournament | null | undefined): FieldEntry[] {
  if (!t) return [];
  const draws = (t as unknown as { _draws?: Record<string, { groups?: { tee?: string | null; teeTime?: string | null; startHole?: number | null; players?: { nome?: string; fed?: string | null; tee?: string | null }[] }[] }> })._draws;
  const r1 = draws && (draws["1"] || Object.values(draws)[0]);
  // O draw de fora (MAJOR, USKids…) não traz o federado: o da MESMA prova —
  // resultados ou inscrições —, pelo nome (dados-da-propria-prova, 05/11/2026).
  // Idem o país e o nascimento. Um nome com DOIS federados na prova (homónimos)
  // não dá nada a ninguém pelo nome: não se adivinha qual é qual (10/11/2026).
  type DaProva = { fed: string | null; country: string | null; dob: string | null };
  const daProva = new Map<string, DaProva | null>();
  const junta = (nome: string | null | undefined, fed: string | null | undefined, x: object) => {
    const k = nameKey(nome);
    if (!k) return;
    const antes = daProva.get(k);
    if (antes === null) return;
    const id = paisENasc(x);
    // Dois federados do mesmo tipo e diferentes = duas pessoas. (Um número da FPG
    // e uma licença de fora podem ser a mesma: resultados e inscrições nem sempre
    // trazem o mesmo identificador.)
    if (antes?.fed && fed && antes.fed !== fed && isFedFpg(antes.fed) === isFedFpg(fed)) { daProva.set(k, null); return; }
    daProva.set(k, { fed: antes?.fed || fed || null, country: antes?.country ?? id.country, dob: antes?.dob ?? id.dob });
  };
  for (const p of t.players || []) junta(p.name, (p as Player).fedCode, p);
  for (const p of t._admissions?.players || []) if (p) junta(p.nome, p.fed, p);
  const out: FieldEntry[] = [];
  for (const g of r1?.groups || []) {
    for (const p of g.players || []) {
      if (!p?.nome) continue;
      const extra = daProva.get(nameKey(p.nome));
      // O que a prova diz desse nome só vale se não for de outro federado.
      const dele = extra && (!p.fed || !extra.fed || extra.fed === p.fed) ? extra : null;
      const id = paisENasc(p);
      out.push({
        fed: p.fed || dele?.fed || null, name: p.nome, tee: p.tee ?? g.tee ?? null,
        teeTime: g.teeTime ?? null, startHole: g.startHole ?? null,
        country: id.country ?? dele?.country ?? null, dob: id.dob ?? dele?.dob ?? null,
      });
    }
  }
  if (out.length) return out;
  for (const p of t.players || []) {
    if (!p?.name) continue;
    out.push({ fed: (p as Player).fedCode || null, name: p.name, tee: (p as Player).teeName || null, ...paisENasc(p) });
  }
  if (out.length) return out;
  // Só inscrições (prova por jogar, ainda sem draw — 05/11/2026, Castro Marim U14):
  // quem joga, fora desistentes e reservas; o Manuel fica sempre.
  for (const p of t._admissions?.players || []) {
    if (!p?.nome) continue;
    if ((p.status === "desistente" || p.status === "reserva") && !isManuel({ name: p.nome, fed: p.fed ?? undefined })) continue;
    out.push({ fed: p.fed || null, name: p.nome, tee: null, ...paisENasc(p) });
  }
  return out;
}

/** SD de uma volta: o oficial da FPG ou, sem ele, o calculado (ver computeSD). */
function roundSD(p: Player, r: NonNullable<Player["roundScores"]>[number]): number | null {
  return computeSD({
    ...p,
    sd: undefined,
    roundScores: [r],
    scores: r.scores || [],
    par: r.pars || p.par,
    si: r.si || p.si,
    nholes: (r.scores || []).length || p.nholes,
    grossTotal: r.gross ?? null,
    courseRating: r.courseRating ?? p.courseRating,
    slope: r.slope ?? p.slope,
    pcc: r.pcc ?? p.pcc,
  }).sd;
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

/**
 * CR/Slope de TODOS os tees de um campo, a partir do `master-courses.json`.
 * É a fonte autoritativa e cobre tees que nunca apareceram numa edição — no
 * PJA Torre, as "Laranjas" das raparigas (74.2/132) não existem em 2025, e
 * inferi-las das amarelas (71.1/126) subestimava a prova em ~3 golpes.
 *
 * `campo` é o nome como vem do torneio ("Terras da Comporta - Torre"); o
 * `courseKey` do master é um slug ("terras-da-comporta-torre-golf-course"), daí
 * o match por prefixo de slug em vez de igualdade.
 */
export function masterTeeRatings(
  master: { courses?: { courseKey?: string; master?: { tees?: MasterTee[] } }[] } | null | undefined,
  campo: string | null | undefined,
): Map<string, { cr: number; slope: number }> {
  const out = new Map<string, { cr: number; slope: number }>();
  const slug = norm(campo).replace(/\s+/g, "-");
  if (!slug || !master?.courses) return out;
  const c = master.courses.find((x) => {
    const k = String(x.courseKey || "");
    return k === slug || k.startsWith(slug + "-") || slug.startsWith(k);
  });
  for (const t of c?.master?.tees || []) {
    const r = t.ratings?.holes18;
    if (!r?.courseRating || !r?.slopeRating) continue;
    out.set(`${norm(t.teeName)}|${t.sex || "?"}`, { cr: r.courseRating, slope: r.slopeRating });
  }
  return out;
}

interface MasterTee {
  teeName?: string;
  sex?: string;
  ratings?: { holes18?: { courseRating?: number; slopeRating?: number } };
}

export interface BuildRepeatersInput {
  /** Torneio aberto (dá o field de hoje e o nº de voltas). */
  current: Tournament;
  /** Edições anteriores da mesma prova, mais recente primeiro. */
  previous: { id: string; year: number; t: Tournament }[];
  /** federados.json (ou players.json) indexado por código de federado. */
  fedInfo: (fed: string | null) => FedInfo | null;
  /** Forma actual por federado (player-stats.json). Sem isto a previsão cai
   *  para o índice, que é bastante pior. */
  form?: (fed: string | null) => PlayerForm | null;
  /**
   * CR/Slope por `${tee}|${sexo}` vindos do master-courses (ver
   * `masterTeeRatings`). Ganham aos inferidos das edições anteriores: cobrem
   * tees que nunca lá apareceram.
   */
  masterRatings?: Map<string, { cr: number; slope: number }>;
  /** Nº de voltas desta edição (default: o `rounds` do torneio, ou 1). */
  nRounds?: number;
  /** Par de uma volta (default: o do primeiro jogador que o traga). */
  parPerRound?: number | null;
  /** Também quem nunca jogou esta prova (aba «Scout», 20/10/2026): sem
   *  edições, a previsão sai da forma ou do índice. Default: só repetentes. */
  todos?: boolean;
  /** Federado de quem a prova não o traz (provas de fora): o da ficha do Kids 2
   *  ligada pelo nome — a mesma ligação da seta ↗ (05/11/2026). */
  fedPorNome?: (name: string) => string | null | undefined;
}

/**
 * Cruza o field de hoje com as edições anteriores e devolve os repetentes,
 * ordenados pelo melhor resultado que já fizeram aqui.
 */
export function buildRepeaters(input: BuildRepeatersInput): Repeater[] {
  const { current, previous, fedInfo } = input;
  const field = currentField(current);
  if (!field.length || (!previous.length && !input.todos)) return [];

  // 1.º as voltas da PRÓPRIA prova; as edições anteriores só quando ela não diz
  // (uma prova de 3 voltas sem edições anteriores previa o total de 1 volta).
  const nRounds = input.nRounds
    || (typeof current.rounds === "number" && current.rounds > 0 ? current.rounds : 0)
    || Math.max(1, ...previous.map((p) => Math.max(1, ...(p.t.players || []).map((x) => (x.roundScores || []).length || 1))));
  const parPerRound = input.parPerRound
    ?? current.players?.find((p) => typeof p.parTotal === "number")?.parTotal
    ?? previous[0]?.t.players?.find((p) => typeof p.parTotal === "number")?.parTotal
    ?? null;

  const sexOf = (fed: string | null) => fedInfo(fed)?.sex ?? null;
  const ratings = teeRatings(previous.map((p) => p.t), sexOf);

  // Índice: chave → participações nas edições anteriores.
  const hist = new Map<string, RepeaterEdition[]>();
  const sdsPorEdicao = new Map<string, number[]>();
  for (const { id, year, t } of previous) {
    for (const p of t.players || []) {
      if (!p?.name) continue;
      const k = playerKey((p as Player).fedCode, p.name);
      const rounds: RepeaterRound[] = [];
      for (const r of p.roundScores || []) {
        if (!temCartao(r.gross)) continue;
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
        pos: parsePos(p.pos),
        total: typeof p.grossTotal === "number" && temCartao(p.grossTotal) ? p.grossTotal : null,
        toPar: typeof p.toPar === "number" ? p.toPar : null,
        hcpThen: typeof p.hcpExact === "number" ? p.hcpExact : null,
        rounds,
      };
      const arr = hist.get(k);
      if (arr) arr.push(ed); else hist.set(k, [ed]);
      for (const rd of rounds) if (rd.sd != null) (sdsPorEdicao.get(id) ?? sdsPorEdicao.set(id, []).get(id)!).push(rd.sd);
    }
  }
  // Mediana dos differentials de cada edição — a régua contra a qual se mede
  // quem se dá bem com esta prova. É o próprio field daquele dia, por isso
  // absorve o vento e o estado do campo sem precisar de constantes.
  const medianaPorEdicao = new Map<string, number>();
  for (const [id, xs] of sdsPorEdicao) {
    if (xs.length < 5) continue;                 // amostra curta não faz régua
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    medianaPorEdicao.set(id, m);
  }

  const out: Repeater[] = [];
  for (const f of field) {
    const editions = hist.get(playerKey(f.fed, f.name)) ?? [];
    if (!editions.length && !input.todos) continue;
    editions.sort((a, b) => b.year - a.year);
    // O federado para o índice e a forma WHS (o histórico desta prova já casou
    // acima). Só um federado FPG serve: nas provas de fora o `fed` é a licença
    // estrangeira, e com ela um português com ficha no Kids 2 ficava sem WHS
    // (10/11/2026) — aí vale o da ficha, ligada pelo nome.
    const fed = fedFpg(f.fed) || input.fedPorNome?.(f.name) || null;

    const info = fedInfo(fed);
    const sds = editions.flatMap((e) => e.rounds.map((r) => r.sd)).filter((x): x is number => x != null);
    const sdAvg = sds.length ? media(sds) : null;
    const sdBest = sds.length ? Math.min(...sds) : null;
    const hcpNow = info?.hcp ?? null;
    // O índice "de então" é o da edição mais recente que traga um.
    const hcpThen = editions.find((e) => e.hcpThen != null)?.hcpThen ?? null;
    const toPars = editions.map((e) => e.toPar).filter((x): x is number => x != null);
    const medianaSD = editions[0] ? medianaPorEdicao.get(editions[0].id) ?? null : null;

    // Tee de hoje → CR/Slope. Do draw quando existe; senão o tee que ele jogou.
    const teeNow = f.tee || editions[0]?.rounds[0]?.tee || null;
    const sex = info?.sex || "?";
    const chaveTee = `${norm(teeNow)}|${sex}`;
    const ratTee = input.masterRatings?.get(chaveTee)
      ?? ratings.get(chaveTee) ?? ratings.get(`${norm(teeNow)}|?`) ?? null;
    const rat = ratTee
      ?? (editions[0]?.rounds[0]?.cr && editions[0]?.rounds[0]?.slope
        ? { cr: editions[0].rounds[0].cr!, slope: editions[0].rounds[0].slope! } : null);

    // ── Forma de hoje ────────────────────────────────────────────────────
    // A forma manda: são as voltas das últimas semanas, medidas. O índice é a
    // média das 8 MELHORES de 20 — melhora devagar e não diz como ele está a
    // jogar agora. (Manuel a 2026-09: índice 7,5 mas avgSD8 7,7 e avgSD20 10,5.)
    //
    // ⚠ Uma volta de torneio típica não sai nem ao nível das 8 melhores (o
    // potencial) nem à média de 20 (que inclui as más): fica no MEIO. Prever
    // pelo avgSD8 dava disparates — 132 (−12) ao Nuno Palmares, ou seja 66+66,
    // quando a melhor volta da vida dele é um único 66.
    const form = input.form?.(fed) ?? null;
    const sdBom = form?.avgSD8 ?? form?.avgSD5 ?? null;         // bom dia
    const sdNormal = form?.avgSD20 ?? form?.avgSD5 ?? null;     // dia qualquer
    const formaSD = sdBom != null && sdNormal != null ? (sdBom + sdNormal) / 2
      : sdBom ?? sdNormal;
    // Como ele se dá com esta prova: onde ficou face à MEDIANA do field nesse
    // ano. Negativo = melhor que o campo do meio. Medido contra os adversários
    // reais, sem constantes — e por isso NÃO entra na previsão (é informação,
    // não um ajuste; misturá-lo com a forma contava a melhoria duas vezes).
    const courseFit = sdAvg != null && medianaSD != null
      ? +(sdAvg - medianaSD).toFixed(1) : null;

    let forecast: RepeaterForecast | null = null;
    if (rat) {
      let sdEsp: number | null = null;
      let basis: RepeaterForecast["basis"] = "historico";
      if (formaSD != null) {
        sdEsp = formaSD;
        basis = "forma";
      } else if (sdAvg != null) {
        // Sem stats de forma: o que fez aqui, corrigido pela evolução do índice.
        const ajuste = hcpNow != null && hcpThen != null ? hcpNow - hcpThen : 0;
        sdEsp = sdAvg + ajuste;
      } else if (hcpNow != null) {
        sdEsp = hcpNow + SD_MEDIA_ACIMA_DO_INDICE;
        basis = "indice";
      }
      if (sdEsp != null) {
        // Espalhamento: metade da distância entre o bom dia e o dia normal —
        // assim o intervalo vai de ~avgSD8 (se lhe correr bem) a tanto acima da
        // média quanto o bom dia está abaixo. Sem forma, a dispersão das voltas
        // que fez aqui.
        const oscila = sdBom != null && sdNormal != null ? Math.abs(sdNormal - sdBom) : null;
        const spread = Math.max(SPREAD_MIN,
          oscila ?? (sds.length >= 2 ? (Math.max(...sds) - Math.min(...sds)) / 2 : SD_MEDIA_ACIMA_DO_INDICE));
        const toGross = (sd: number) => calcScore(sd, rat.cr, rat.slope);
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
      fed, fedProva: f.fed ?? null, name: f.name,
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
      teeTime: f.teeTime ?? null,
      startHole: f.startHole ?? null,
      form,
      courseFit,
      forecast,
    });
  }

  // Melhor ±par aqui primeiro; sem ±par, pela previsão.
  out.sort((a, b) =>
    compareNullsLast(a.bestToPar, b.bestToPar, 1)
    || compareNullsLast(a.forecast?.total, b.forecast?.total, 1)
    || a.name.localeCompare(b.name));
  return out;
}
