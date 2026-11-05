/**
 * Nível em pancadas — o modelo do Nível do Kids 2 (05/11/2026).
 *
 * Cada volta de 18 buracos (as de 9 contam a dobrar, com metade do peso) é
 *   ±par = nível do jogador + dificuldade da volta (+ efeito do tee, quando na mesma
 *   volta há tees diferentes).
 * A dificuldade de cada volta mede-se pelos próprios jogadores que a jogaram — por isso o
 * tamanho do field, a força do field, o campo e a distância entram sem regras à mão. Uma
 * vitória num field de 3 diz pouco porque esses 3 não se comparam com ninguém.
 *
 * Regras (pedidos da Mariana):
 *   - o nível conta SÓ o último ano («a evolução dos juniores é muito rápida»), com as voltas
 *     recentes a pesar mais (meia-vida de 6 meses); as voltas até 3 anos servem só para medir
 *     a dificuldade das voltas (quem as jogou), nunca o jogador;
 *   - formatos de equipa (Parent/Child, scramble, foursomes…) não contam;
 *   - nível mais baixo = melhor (pancadas acima do par num campo médio do escalão).
 * Validado contra o índice antigo (posições × estrelas): acerta quem faz menos pancadas em
 * 70% dos pares de jogadores numa mesma volta futura, contra 64%.
 *
 * Usado pelo agregador (scripts/aggregator/util/scout.js) — por isso SEM imports, como o
 * juniorCalc.ts (o Node corre o TypeScript directamente).
 */

export interface NivelRonda { round: number; gross?: number | null; strokes?: number[]; metros?: number }
export interface NivelResultado { juniorId: string; rounds?: NivelRonda[] }
export interface NivelFlight {
  flightKey: string; label: string; par?: number[]; metros?: number; fieldSize?: number | null;
  results: NivelResultado[];
}
export interface NivelTorneio {
  id: string; name: string; sourceId?: string; date?: string | null; startDate?: string | null;
  parTotal?: number | null; flights: NivelFlight[];
}

export interface NivelJogador {
  /** Pancadas acima do par numa volta média do escalão (mais baixo = melhor). */
  nivel: number;
  /** Peso das voltas do último ano (voltas-equivalentes, as recentes pesam mais). */
  peso: number;
  /** Nº de voltas do último ano (as de 9 buracos contam meia). */
  voltas: number;
}

export interface NivelOpcoes {
  /** Janela das voltas que medem a DIFICULDADE (dias). */
  diasDificuldade?: number;
  /** Meia-vida do peso dessas voltas (dias). */
  meiaVidaDificuldade?: number;
  /** Janela das voltas que medem o JOGADOR (dias). */
  diasNivel?: number;
  /** Meia-vida do peso das voltas do jogador (dias). */
  meiaVidaNivel?: number;
}

const DIA = 864e5;
/** Peso da média da geração no nível (encolhe quem tem poucas voltas). */
const LAMBDA_JOGADOR = 0.5;
/** Peso do «esperado» de uma volta (escalão/fonte, metros, tamanho do field). */
const LAMBDA_VOLTA = 1.5;
/** Uma volta não puxa mais do que 10 pancadas para fora do esperado (robustez). */
const CORTE = 10;
const ITERACOES = 50;

/** Formatos de equipa — não são voltas individuais. */
export const FORMATO_EQUIPA_RE = /parent|child|scramble|foursome|pairs|greensome|equipa|team|par(e|ej)as|fourball|four-ball|texas/i;

interface Obs { p: string; u: number; y: number; idade: number; w9: number; dm: number; w: number }
interface Volta { lab: string; src: string; fs: number; metros: number | null }

/** Faixa do tamanho do field para o «esperado» da volta. */
const faixa = (fs: number) => (fs <= 3 ? "1-3" : fs <= 6 ? "4-6" : fs <= 12 ? "7-12" : fs <= 30 ? "13-30" : fs <= 80 ? "31-80" : "81+");

/** As observações (jogador × volta) até `diasDificuldade` antes de `hoje`. */
function observacoes(torneios: Iterable<NivelTorneio>, hoje: number, dias: number) {
  const obs: Obs[] = [];
  const voltas: Volta[] = [];
  const idx = new Map<string, number>();
  for (const t of torneios) {
    const data = t.date || t.startDate;
    if (!data) continue;
    const idade = (hoje - Date.parse(data)) / DIA;
    if (!(idade >= 0 && idade <= dias)) continue;
    for (const f of t.flights) {
      if (FORMATO_EQUIPA_RE.test(`${t.name} ${f.label}`)) continue;
      const par = f.par || [];
      const np = par.filter((p) => p > 0).length;
      const parTot = par.reduce((a, b) => a + (b || 0), 0);
      const metrosFlight = f.metros ? ((np || 18) === 9 ? f.metros * 2 : f.metros) : null;
      for (const r of f.results) {
        for (const rd of r.rounds || []) {
          const g = rd.gross;
          if (typeof g !== "number" || g <= 0 || g >= 300) continue;
          let buracos = Array.isArray(rd.strokes) ? rd.strokes.filter((x) => x > 0).length : (np || 18);
          if (buracos >= 15) buracos = 18;
          else if (buracos >= 8 && buracos <= 10) buracos = 9;
          else continue;
          let par18: number;
          if (buracos === 18) par18 = np === 18 ? parTot : (t.parTotal && t.parTotal >= 60 ? t.parTotal : 72);
          else {
            if (Array.isArray(rd.strokes) && np === 18) par18 = rd.strokes.reduce((s, x, i) => s + (x > 0 ? par[i] || 0 : 0), 0) * 2;
            else par18 = np === 9 ? parTot * 2 : (parTot >= 60 ? parTot : 72);
            if (par18 < 50) continue;
          }
          const y = (buracos === 9 ? g * 2 : g) - par18;
          if (y < -20 || y > 70) continue;
          const chave = `${t.id}|${f.flightKey}|${rd.round}|${buracos}`;
          let u = idx.get(chave);
          if (u == null) {
            u = voltas.length;
            idx.set(chave, u);
            voltas.push({ lab: (f.label || "").replace(/\s+/g, " ").trim(), src: t.sourceId || "", fs: f.fieldSize || f.results.length, metros: null });
          }
          const m = rd.metros ? (buracos === 9 ? rd.metros * 2 : rd.metros) : metrosFlight;
          // dm guarda temporariamente os metros do jogador; passa a Δ (por 100 m) abaixo
          obs.push({ p: r.juniorId, u, y, idade, w9: buracos === 9 ? 0.5 : 1, dm: m || 0, w: 0 });
        }
      }
    }
  }
  // metros da volta = média dos tees dos jogadores; cada jogador fica com a diferença
  const soma = new Map<number, [number, number]>();
  for (const x of obs) if (x.dm) { const c = soma.get(x.u) || [0, 0]; c[0] += x.dm; c[1]++; soma.set(x.u, c); }
  for (const [u, c] of soma) voltas[u].metros = Math.round(c[0] / c[1]);
  for (const x of obs) { const mv = voltas[x.u].metros; x.dm = x.dm && mv ? (x.dm - mv) / 100 : 0; }
  return { obs, voltas };
}

/**
 * Nível de cada junior com voltas no último ano.
 * `geracao(id)` = chave da geração (ano de nascimento + sexo) — o nível de quem tem
 * poucas voltas encolhe para a média da geração.
 */
export function calcularNiveis(
  torneios: Iterable<NivelTorneio>,
  geracao: (juniorId: string) => string | null,
  hojeIso: string,
  op: NivelOpcoes = {},
): Map<string, NivelJogador> {
  const diasD = op.diasDificuldade ?? 3 * 365, meiaD = op.meiaVidaDificuldade ?? 365;
  const diasN = op.diasNivel ?? 365, meiaN = op.meiaVidaNivel ?? 182;
  const hoje = Date.parse(hojeIso);
  const { obs, voltas } = observacoes(torneios, hoje, diasD);
  for (const x of obs) x.w = Math.pow(0.5, x.idade / meiaD) * x.w9;

  const a = new Map<string, number>();
  const d = new Float64Array(voltas.length);
  let bTee = 0;
  const porJ = new Map<string, Obs[]>(), porV = new Map<number, Obs[]>();
  for (const x of obs) {
    let lj = porJ.get(x.p); if (!lj) porJ.set(x.p, (lj = [])); lj.push(x);
    let lv = porV.get(x.u); if (!lv) porV.set(x.u, (lv = [])); lv.push(x);
  }
  for (const [p, xs] of porJ) a.set(p, xs.reduce((s, x) => s + x.y, 0) / xs.length);
  const pesoJ = new Map<string, number>();
  for (const [p, xs] of porJ) pesoJ.set(p, xs.reduce((s, x) => s + x.w, 0));
  const ger = (p: string) => geracao(p) || "?";

  // «Esperado» de uma volta: grupo (escalão se há metros, senão a fonte) + metros + field
  const grupo = (V: Volta) => (V.metros ? `L:${V.lab}` : `S:${V.src}`);
  let gMedia = new Map<string, number>(), gMetros = new Map<string, number>(), fMedia = new Map<string, number>(), bMetros = 0;
  const dMetros = (V: Volta) => (V.metros && gMetros.has(grupo(V)) ? bMetros * (V.metros - gMetros.get(grupo(V))!) / 100 : 0);
  const esperado = (V: Volta) => (gMedia.get(grupo(V)) ?? 0) + dMetros(V) + (fMedia.get(faixa(V.fs)) ?? 0);
  const ajustarEsperado = () => {
    const us: [Volta, number, number][] = [];
    for (const [u, xs] of porV) {
      const wt = xs.reduce((s, x) => s + x.w * Math.min(1, (pesoJ.get(x.p) || 0) / 5), 0);
      if (wt > 0.5) us.push([voltas[u], d[u], wt]);
    }
    const met = new Map<string, [number, number]>();
    for (const [V, , wt] of us) if (V.metros) { const c = met.get(grupo(V)) || [0, 0]; c[0] += V.metros * wt; c[1] += wt; met.set(grupo(V), c); }
    gMetros = new Map([...met].map(([k, c]) => [k, c[0] / c[1]]));
    for (let passo = 0; passo < 8; passo++) {
      const gm = new Map<string, [number, number]>();
      for (const [V, dv, wt] of us) { const r = dv - (fMedia.get(faixa(V.fs)) ?? 0) - dMetros(V); const c = gm.get(grupo(V)) || [0, 0]; c[0] += r * wt; c[1] += wt; gm.set(grupo(V), c); }
      gMedia = new Map([...gm].map(([k, c]) => [k, c[0] / c[1]]));
      const fm = new Map<string, [number, number]>();
      for (const [V, dv, wt] of us) { const r = dv - (gMedia.get(grupo(V)) ?? 0) - dMetros(V); const k = faixa(V.fs); const c = fm.get(k) || [0, 0]; c[0] += r * wt; c[1] += wt; fm.set(k, c); }
      const ref = fm.get("31-80"); const refv = ref ? ref[0] / ref[1] : 0;
      fMedia = new Map([...fm].map(([k, c]) => [k, c[0] / c[1] - refv]));
      let sxy = 0, sxx = 0;
      for (const [V, dv, wt] of us) {
        if (!V.metros || !gMetros.has(grupo(V))) continue;
        const X = (V.metros - gMetros.get(grupo(V))!) / 100;
        const Y = dv - (gMedia.get(grupo(V)) ?? 0) - (fMedia.get(faixa(V.fs)) ?? 0);
        sxy += X * Y * wt; sxx += X * X * wt;
      }
      if (sxx > 0) bMetros = sxy / sxx;
    }
  };

  const mediaGeracao = () => {
    const cs = new Map<string, [number, number]>();
    for (const [p, v] of a) { const k = ger(p); const c = cs.get(k) || [0, 0]; c[0] += v; c[1]++; cs.set(k, c); }
    return cs;
  };
  const corta = (r: number, cur: number) => (r - cur > CORTE ? cur + CORTE : r - cur < -CORTE ? cur - CORTE : r);
  const ajustarJogadores = (lista: Map<string, Obs[]>) => {
    const cs = mediaGeracao();
    for (const [p, xs] of lista) {
      const c = cs.get(ger(p)); const mu = c ? c[0] / c[1] : 0; const cur = a.get(p)!;
      let s = LAMBDA_JOGADOR * mu, w = LAMBDA_JOGADOR;
      for (const x of xs) { s += x.w * corta(x.y - d[x.u] - bTee * x.dm, cur); w += x.w; }
      a.set(p, s / w);
    }
  };

  for (let it = 0; it < ITERACOES; it++) {
    for (const [u, xs] of porV) {
      const pv = esperado(voltas[u]);
      let s = pv * LAMBDA_VOLTA, w = LAMBDA_VOLTA;
      for (const x of xs) { s += x.w * (x.y - a.get(x.p)! - bTee * x.dm); w += x.w; }
      const m = s / w;
      let s2 = pv * LAMBDA_VOLTA, w2 = LAMBDA_VOLTA;
      for (const x of xs) { s2 += x.w * corta(x.y - a.get(x.p)! - bTee * x.dm, m); w2 += x.w; }
      d[u] = s2 / w2;
    }
    ajustarJogadores(porJ);
    if (it % 5 === 4) {
      // efeito do tee dentro da mesma volta (mesmo campo e dia, tees diferentes)
      let sxy = 0, sxx = 0;
      for (const x of obs) { if (!x.dm) continue; const e = x.y - a.get(x.p)! - d[x.u]; sxy += x.w * x.dm * e; sxx += x.w * x.dm * x.dm; }
      if (sxx > 1) bTee = sxy / sxx;
      ajustarEsperado();
    }
  }

  // 2.ª fase: a dificuldade das voltas fica; o nível de cada um refaz-se só com o último ano
  const recentes = new Map<string, Obs[]>();
  for (const [p, xs] of porJ) {
    const rec = xs.filter((x) => x.idade <= diasN).map((x) => ({ ...x, w: Math.pow(0.5, x.idade / meiaN) * x.w9 }));
    if (rec.length) recentes.set(p, rec); else a.delete(p);
  }
  for (let it = 0; it < 10; it++) ajustarJogadores(recentes);

  const out = new Map<string, NivelJogador>();
  for (const [p, xs] of recentes) {
    out.set(p, {
      nivel: Math.round(a.get(p)! * 10) / 10,
      peso: Math.round(xs.reduce((s, x) => s + x.w, 0) * 10) / 10,
      voltas: xs.reduce((s, x) => s + x.w9, 0),
    });
  }
  return out;
}
