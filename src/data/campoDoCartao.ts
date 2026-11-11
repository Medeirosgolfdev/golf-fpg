/**
 * src/data/campoDoCartao.ts — o CAMPO de uma prova montado a partir do cartão
 * dela, no formato da base de campos (`Course`/`Tee`), para as abas «⛳ O campo»
 * e «🔮 Previsão» aparecerem também quando o campo não está na base (11/11/2026,
 * Mariana: «O campo e previsão são abas que eu quero que apareçam» → «Sim,
 * constrói»). Só dados — quem desenha são as peças de sempre (CourseHeroCard,
 * PrevisaoTab).
 *
 * De onde vêm os números: do cartão de cada jogador na prova (par, SI e metros
 * por buraco, nome do tee, CR e Slope quando a fonte os publica). Cada cartão
 * diferente é um tee. Regras:
 *   · só com PAR OFICIAL em todos os buracos (9 ou 18) e METROS em todos — sem
 *     isso não há campo (nunca se inventa par nem distância);
 *   · o SI só entra se for mesmo um SI (1..N, sem repetidos): nas provas USKids
 *     a linha do SI leva os metros;
 *   · homens e senhoras do mesmo tee físico são dois tees (ratings diferentes),
 *     como na base;
 *   · CR/Slope: os que a maioria dos cartões do tee traz; sem eles ficam vazios.
 *
 * ⚠ Só para provas DE FORA (o cartão é o do organizador). Nas provas da FPG e nos
 * torneios reconstruídos das voltas WHS os cartões podem ser os preenchidos pelos
 * clubes, que NÃO são fonte oficial do campo — aí vale só a base. Quem chama é que
 * garante isto (o TournamentDetail só o pede quando a prova não traz federados).
 */
import type { Course, Tee, Hole } from "./types";

/** O que se lê de um jogador (os campos do cartão — `Player`/`RoundScore` da FPG). */
interface CartaoLike {
  pars?: readonly number[] | null;
  par?: readonly number[] | null;
  si?: readonly number[] | null;
  meters?: readonly number[] | null;
  courseRating?: number | null;
  slope?: number | null;
  teeName?: string | null;
}
interface JogadorLike extends CartaoLike {
  sex?: string | null;
  identity?: { sex?: string | null } | null;
  roundScores?: readonly CartaoLike[] | null;
}
export interface ProvaLike {
  name?: string | null;
  campo?: string | null;
  players?: readonly JogadorLike[] | null;
}

type Sexo = "M" | "F" | "U";

const soma = (a: readonly number[]) => a.reduce((s, x) => s + x, 0);
const maisComum = <T,>(xs: readonly T[]): T | null => {
  const n = new Map<T, number>();
  let melhor: T | null = null, max = 0;
  for (const x of xs) {
    const c = (n.get(x) ?? 0) + 1;
    n.set(x, c);
    if (c > max) { max = c; melhor = x; }
  }
  return melhor;
};

/** Par oficial: 9 ou 18 buracos, todos entre 3 e 6. */
function parValido(p: readonly number[] | null | undefined): p is readonly number[] {
  return !!p && (p.length === 9 || p.length === 18) && p.every((x) => Number.isInteger(x) && x >= 3 && x <= 6);
}
/** Metros em todos os buracos (um par 3 tem pelo menos umas dezenas de metros). */
function metrosValidos(m: readonly number[] | null | undefined, n: number): m is readonly number[] {
  return !!m && m.length >= n && m.slice(0, n).every((x) => typeof x === "number" && x >= 30 && x <= 700);
}
/** Um SI a sério: os números 1..N, cada um uma vez. */
function siValido(si: readonly number[] | null | undefined, n: number): si is readonly number[] {
  if (!si || si.length < n) return false;
  const v = si.slice(0, n);
  return v.every((x) => Number.isInteger(x) && x >= 1 && x <= 18) && new Set(v).size === n;
}

/** Os tees da prova, do cartão: o mais usado primeiro. */
export function teesDoCartao(prova: ProvaLike): Tee[] {
  type Grupo = { n: number; sex: Sexo; pars: readonly number[]; metros: readonly number[]; si: (readonly number[] | null)[]; nomes: string[]; ratings: string[]; jogadores: Set<number> };
  const grupos = new Map<string, Grupo>();
  (prova.players ?? []).forEach((p, iJog) => {
    const sx = String(p.sex || p.identity?.sex || "").toUpperCase();
    const sex: Sexo = sx === "M" || sx === "F" ? sx : "U";
    const cartoes: CartaoLike[] = p.roundScores?.length
      ? p.roundScores.map((r) => ({ ...r, courseRating: r.courseRating ?? p.courseRating, slope: r.slope ?? p.slope, teeName: r.teeName ?? p.teeName }))
      : [p];
    for (const c of cartoes) {
      const pars = c.pars ?? c.par;
      if (!parValido(pars)) continue;
      const n = pars.length;
      if (!metrosValidos(c.meters, n)) continue;
      const metros = c.meters.slice(0, n);
      const key = `${sex}|${pars.join("")}|${metros.join(",")}`;
      let g = grupos.get(key);
      if (!g) { g = { n, sex, pars, metros, si: [], nomes: [], ratings: [], jogadores: new Set() }; grupos.set(key, g); }
      g.jogadores.add(iJog);
      g.si.push(siValido(c.si, n) ? c.si.slice(0, n) : null);
      // (há fontes que chamam ao tee só «Tee» — não diz nada; fica a distância)
      if (c.teeName?.trim() && !/^tees?$/i.test(c.teeName.trim())) g.nomes.push(c.teeName.trim());
      if (typeof c.courseRating === "number" && c.courseRating > 0 && typeof c.slope === "number" && c.slope > 0) g.ratings.push(`${c.courseRating}|${c.slope}`);
    }
  });

  const ordenados = [...grupos.values()].sort((a, b) => b.jogadores.size - a.jogadores.size || soma(b.metros) - soma(a.metros));
  return ordenados.map((g, i): Tee => {
    const siStr = maisComum(g.si.filter((s): s is readonly number[] => !!s).map((s) => s.join(",")));
    const si = siStr ? siStr.split(",").map(Number) : null;
    const holes: Hole[] = g.pars.map((par, h) => ({ hole: h + 1, par, si: si ? si[h] : null, distance: g.metros[h] }));
    const total = soma(g.metros);
    const rt = maisComum(g.ratings);
    const [cr, slope] = rt ? rt.split("|").map(Number) : [null, null];
    const ratings = { par: soma(g.pars), courseRating: cr, slopeRating: slope };
    const sufixo = g.sex === "F" ? " (senhoras)" : "";
    return {
      teeId: `prova-${i}`,
      sex: g.sex,
      teeName: maisComum(g.nomes) ?? `${total} m${sufixo}`,
      scorecardMeta: { teeColor: null },
      ratings: g.n === 18 ? { holes18: ratings } : { holes9Front: ratings },
      holes,
      distances: {
        total,
        front9: soma(g.metros.slice(0, 9)),
        back9: g.n === 18 ? soma(g.metros.slice(9, 18)) : null,
        holesCount: g.n,
        complete18: g.n === 18,
      },
    };
  });
}

/** O campo da prova, do cartão — ou null quando o cartão não chega (sem par
 *  oficial ou sem metros em todos os buracos). `nome` = o nome do campo, se se sabe. */
export function campoDoCartao(prova: ProvaLike, nome?: string | null): Course | null {
  const tees = teesDoCartao(prova);
  if (!tees.length) return null;
  const name = nome?.trim() || prova.campo?.trim() || prova.name?.trim() || "Campo da prova";
  const courseKey = `prova:${name.toLowerCase().replace(/\s+/g, "-")}`;
  return { courseKey, master: { courseId: courseKey, name, links: { fpg: null, scorecards: null }, tees } };
}

/** O tee por onde começar: o do jogador indicado (pelo nome do tee) → o 1.º de
 *  homens (ou sem sexo) → o primeiro. */
export function teeInicial(course: Course, teeName?: string | null): Tee | null {
  const k = teeName?.trim().toLowerCase();
  const tees = course.master.tees;
  return (k ? tees.find((t) => t.teeName.trim().toLowerCase() === k) : undefined)
    ?? tees.find((t) => t.sex !== "F") ?? tees[0] ?? null;
}
