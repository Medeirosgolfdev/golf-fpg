/**
 * src/utils/voltasJogadas.ts — o que conta de uma VOLTA e de um RESULTADO, num
 * só sítio (10/11/2026). Antes cada componente refazia estas contas e os mesmos
 * erros voltavam:
 *   • total/gross ≥ 900 («sem cartão») aparecia como resultado e entrava no ±par
 *     (Kids 2: «1087», «+941»);
 *   • voltas de 9 buracos contra o par dos 18 («−37», «−96», «Sem histórico»);
 *   • o ±par de recurso multiplicava o par pelo nº de voltas da prova e não
 *     pelas que o jogador jogou;
 *   • diferenças de totais entre quem jogou 2 voltas e quem jogou 3 («−112»).
 *
 * Usar SEMPRE estas funções quando se mostra o total, o ±par ou o cartão de um
 * resultado com voltas (`{ totalGross, toPar, rounds: [{ gross, strokes }] }`).
 */
import { isNoCardGross } from "../data/intlCommon";
import { temCartao } from "./classificacao";

export interface VoltaLike { round?: number; gross?: number | null; strokes?: readonly number[] | null }
export interface ResultadoLike { totalGross?: number | null; toPar?: number | null; rounds?: readonly VoltaLike[] | null }

const soma = (a: readonly number[]) => a.reduce((s, x) => s + x, 0);
const pancadasDe = (v: VoltaLike | null | undefined): readonly number[] => (Array.isArray(v?.strokes) ? v!.strokes! : []);
const NOVE_IDA = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const NOVE_VOLTA = [9, 10, 11, 12, 13, 14, 15, 16, 17];
const DEZOITO = [...NOVE_IDA, ...NOVE_VOLTA];

/**
 * Quantos buracos tem UMA volta, pelas pancadas buraco a buraco: 9 ou 18.
 * null = não se sabe (sem buraco a buraco, ou cartão que não bate com o gross).
 * Um cartão com 9 pancadas ou menos cujo gross é MAIOR do que a soma é um cartão
 * de 18 truncado na fonte, não uma volta de 9.
 */
export function buracosDaVolta(v: VoltaLike | null | undefined): 9 | 18 | null {
  const jogados = pancadasDe(v).filter((x) => x > 0);
  if (!jogados.length) return null;
  if (jogados.length > 9) return 18;
  const g = v?.gross;
  if (temCartao(g)) {
    const s = soma(jogados);
    if (g > s) return 18;
    if (g < s) return null;
  }
  return 9;
}

/**
 * Buracos por volta de um escalão/flight (ou das voltas de um jogador): o que a
 * maioria das voltas com buraco a buraco jogou; sem elas, o par (9 ou 18 buracos
 * com par); senão `recurso` (o `holesPerRound` do torneio). O `holesPerRound` e o
 * par do torneio sozinhos enganam: os escalões novos da USKids (Boys 8, 7 & Under)
 * jogam 9 buracos em provas cuja ficha diz 18.
 */
export function buracosDoFlight(
  voltas: Iterable<VoltaLike | null | undefined> | null | undefined,
  par?: readonly number[] | null,
  recurso?: number | null,
): 9 | 18 {
  let n9 = 0, n18 = 0;
  for (const v of voltas ?? []) {
    const b = buracosDaVolta(v);
    if (b === 9) n9++; else if (b === 18) n18++;
  }
  if (n9 || n18) return n9 > n18 ? 9 : 18;
  const comPar = (par ?? []).filter((p) => p > 0).length;
  if (comPar === 9) return 9;
  if (comPar === 18) return 18;
  return recurso === 9 ? 9 : 18;
}

/** O cartão de uma volta já arrumado pelos buracos que ela jogou. */
export interface CartaoVolta {
  /** Índices (0 = buraco 1) dos buracos da volta, por ordem. */
  buracos: number[];
  /** Par de cada buraco da volta (0 = sem par). */
  par: number[];
  /** Pancadas em cada buraco da volta (0 = não jogado / sem buraco a buraco). */
  pancadas: number[];
  nBuracos: 9 | 18;
  /** Par da volta (soma dos buracos jogados); null se faltar o par de algum. */
  parVolta: number | null;
  /** Há buraco a buraco. */
  temPancadas: boolean;
  /** Há pancadas em todos os buracos da volta. */
  completa: boolean;
}

/** Que nove joga uma volta de 9: o que tem par; com par nos 18, a ida — a não
 *  ser que só a volta bata com o par que a fonte usou (`parEsperado`). */
function qualNove(par: readonly number[], parEsperado?: number | null): number[] {
  const comPar = (ix: number[]) => ix.filter((i) => par[i] > 0).length;
  const somaDe = (ix: number[]) => soma(ix.map((i) => par[i] || 0));
  if (parEsperado != null) {
    const ida = somaDe(NOVE_IDA) === parEsperado, volta = somaDe(NOVE_VOLTA) === parEsperado;
    if (ida !== volta) return ida ? NOVE_IDA : NOVE_VOLTA;
  }
  return comPar(NOVE_IDA) === 9 || comPar(NOVE_VOLTA) < 9 ? NOVE_IDA : NOVE_VOLTA;
}

/**
 * Arruma par e pancadas de uma volta pelos buracos que ela jogou. As fontes
 * guardam as voltas de 9 de três maneiras, todas tratadas aqui:
 *   • 18 posições com zeros/−1 nos buracos não jogados (USKids);
 *   • 9 pancadas seguidas, com o par só nos buracos 10–18 (ou só no 1–9);
 *   • 9 pancadas seguidas e o par dos 18 buracos do campo.
 * `nBuracos` só é usado quando a volta não tem buraco a buraco.
 */
export function cartaoDaVolta(
  parDoFlight: readonly number[] | null | undefined,
  volta: VoltaLike | null | undefined,
  opts: { parEsperado?: number | null; nBuracos?: 9 | 18 | null } = {},
): CartaoVolta {
  const P = parDoFlight ?? [];
  const st = pancadasDe(volta);
  const jogados = st.map((x, i) => (x > 0 ? i : -1)).filter((i) => i >= 0);
  const somaJog = soma(jogados.map((i) => st[i]));
  // Cartão de 18 truncado na fonte: o gross é maior do que as pancadas guardadas.
  const g = volta?.gross;
  const truncado = temCartao(g) && g > somaJog;
  let buracos: number[];
  let pancadas: number[];
  if (!jogados.length) {
    const n = opts.nBuracos ?? (P.filter((p) => p > 0).length === 9 ? 9 : 18);
    buracos = n === 9 ? qualNove(P, opts.parEsperado) : DEZOITO;
    pancadas = buracos.map(() => 0);
  } else if (st.length <= 9 && !truncado) {
    // 9 pancadas seguidas: a k-ésima é do k-ésimo buraco do nove jogado.
    buracos = qualNove(P, opts.parEsperado);
    pancadas = buracos.map((_, k) => (st[k] > 0 ? st[k] : 0));
  } else {
    const soIda = jogados.every((i) => i < 9), soVolta = jogados.every((i) => i >= 9);
    buracos = jogados.length <= 9 && (soIda || soVolta) && !truncado ? (soIda ? NOVE_IDA : NOVE_VOLTA) : DEZOITO;
    pancadas = buracos.map((i) => (st[i] > 0 ? st[i] : 0));
  }
  // Campo de 9 jogado duas vezes: o par do 10–18 é o do 1–9.
  const semParNaVolta = !NOVE_VOLTA.some((i) => P[i] > 0);
  const par = buracos.map((i) => (P[i] > 0 ? P[i] : i >= 9 && semParNaVolta && P[i - 9] > 0 ? P[i - 9] : 0));
  return {
    buracos, par, pancadas,
    nBuracos: buracos.length === 9 ? 9 : 18,
    parVolta: par.every((p) => p > 0) ? soma(par) : null,
    temPancadas: jogados.length > 0,
    completa: pancadas.every((x) => x > 0),
  };
}

/**
 * ±par de UMA volta contra o par dos buracos que ela jogou. null quando não há
 * cartão (gross ≥ 900 ou em falta), falta o par de algum buraco, a volta ficou a
 * meio, ou a conta dá um valor impossível (abaixo de −20: é uma volta de 9
 * buracos contra o par de 18 numa fonte sem buraco a buraco).
 */
export function toParDaVolta(
  parDoFlight: readonly number[] | null | undefined,
  volta: VoltaLike | null | undefined,
  opts: { parEsperado?: number | null; nBuracos?: 9 | 18 | null } = {},
): number | null {
  const g = volta?.gross;
  if (!temCartao(g)) return null;
  const c = cartaoDaVolta(parDoFlight, volta, opts);
  if (c.parVolta == null) return null;
  if (c.temPancadas && !c.completa && soma(c.pancadas) === g) return null;
  const tp = g - c.parVolta;
  return tp < -20 ? null : tp;
}

/** Par por volta que a FONTE usou no ±par do resultado: (total − ±par) / voltas.
 *  Serve para saber que nove jogou uma volta de 9 num campo com par nos 18. */
export function parPorVoltaDaFonte(res: ResultadoLike | null | undefined): number | null {
  const n = (res?.rounds ?? []).filter((r) => temCartao(r?.gross)).length;
  const total = res?.totalGross, tp = res?.toPar;
  if (!n || !temCartao(total) || typeof tp !== "number") return null;
  const p = (total - tp) / n;
  return Number.isInteger(p) && p > 0 ? p : null;
}

/** O que se mostra e se compara de um resultado. */
export interface ResumoResultado {
  /** Gross de cada volta pela ordem da fonte; null = sem cartão (≥ 900) ou sem gross. */
  voltas: (number | null)[];
  /** Só as voltas com cartão. */
  jogadas: number[];
  /** Alguma volta, ou o total, é «sem cartão» (≥ 900: 997/998/999, 88 + 999…). */
  semCartao: boolean;
  /** Total: o da fonte, ou a soma das voltas. null com «sem cartão» ou sem nada. */
  total: number | null;
  /** ±par: o da fonte, ou a soma do ±par de cada volta JOGADA. null com «sem cartão». */
  toPar: number | null;
  /** Buracos por volta (ver `buracosDoFlight`). */
  nBuracos: 9 | 18;
}

/**
 * Resumo de um resultado: voltas, total e ±par com as regras do site —
 * «sem cartão» fica sem total nem ±par (as voltas jogadas continuam à vista) e o
 * ±par de recurso faz-se volta a volta, contra o par dos buracos jogados.
 * `parTotal` = par de uma volta de 18 quando o flight não traz par por buraco;
 * `buracos` = `holesPerRound` do torneio (só de recurso).
 */
export function resumoResultado(
  res: ResultadoLike | null | undefined,
  parDoFlight?: readonly number[] | null,
  opts: { parTotal?: number | null; buracos?: number | null } = {},
): ResumoResultado {
  const rounds = res?.rounds ?? [];
  const totalFonte = res?.totalGross, toParFonte = res?.toPar;
  const grossDe = (r: VoltaLike | null | undefined) => r?.gross;
  const voltas = rounds.map((r) => { const g = grossDe(r); return temCartao(g) ? g : null; });
  const jogadas = voltas.filter((g): g is number => g != null);
  const semCartao = isNoCardGross(totalFonte) || rounds.some((r) => isNoCardGross(grossDe(r)));
  const nBuracos = buracosDoFlight(rounds, parDoFlight, opts.buracos);
  const total = semCartao ? null : temCartao(totalFonte) ? totalFonte : jogadas.length ? soma(jogadas) : null;
  let toPar: number | null = null;
  if (!semCartao) {
    if (typeof toParFonte === "number" && Number.isFinite(toParFonte)) toPar = toParFonte;
    else if (jogadas.length) {
      const semParPorBuraco = !(parDoFlight ?? []).some((p) => p > 0);
      let s = 0, ok = true;
      for (const r of rounds) {
        const g = grossDe(r);
        if (!temCartao(g)) continue;
        let tp = toParDaVolta(parDoFlight, r, { nBuracos });
        if (tp == null && semParPorBuraco && nBuracos === 18 && opts.parTotal && opts.parTotal > 0) {
          tp = g - opts.parTotal;
          if (tp < -20) tp = null;
        }
        if (tp == null) { ok = false; break; }
        s += tp;
      }
      toPar = ok ? s : null;
    }
  }
  return { voltas, jogadas, semCartao, total, toPar, nBuracos };
}

/**
 * Diferença de totais a − b, só quando se podem comparar: os dois com total e
 * com o MESMO nº de voltas jogadas (173 em 2 voltas contra 285 em 3 não é −112).
 */
export function diferencaDeTotais(a: ResumoResultado, b: ResumoResultado): number | null {
  if (a.total == null || b.total == null) return null;
  if (a.voltas.length && b.voltas.length && a.jogadas.length !== b.jogadas.length) return null;
  return a.total - b.total;
}
