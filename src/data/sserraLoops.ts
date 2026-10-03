/**
 * Ecléticos de 9 buracos de um jogador:
 *
 *  1. Os três 9 do Santo da Serra (Machico, Desertas, Serras). Os percursos de
 *     18 do clube são combinações de dois destes 9 e o nome nos dados vem
 *     normalizado, sem ordem (ex. "Desertas+Machico"), por isso cada metade é
 *     reconhecida pela sequência de pares, igual em todos os tees.
 *  2. Os campos de 9 buracos que se jogam duas vezes para fazer 18 (Miramar,
 *     Jamor…): reconhecidos por voltas de 18 cujas duas metades têm os mesmos
 *     pares e os mesmos metros. Contam as duas metades e as voltas de 9.
 */
import type { CourseData, HoleScores, RoundData } from "./playerDataLoader";
import { normKey } from "../utils/teeColors";

export const SSERRA_LOOPS = [
  { nome: "Machico", pars: [4, 4, 5, 3, 4, 4, 5, 3, 4] },
  { nome: "Desertas", pars: [4, 5, 4, 4, 4, 3, 5, 3, 4] },
  { nome: "Serras", pars: [5, 4, 4, 4, 3, 4, 4, 3, 5] },
] as const;

export interface LoopRound {
  scoreId: string;
  date: string;
  dateSort: number;
  teeName: string;
  /** Gross dos 9 buracos (null = buraco sem resultado). */
  g: (number | null)[];
  /** Os 9 jogados na volta, pela ordem (um só nas voltas de 9 buracos). */
  combo: string[];
}

export interface LoopTee {
  teeName: string;
  teeKey: string;
  rounds: LoopRound[];
  best: (number | null)[];
  bestFrom: (string | null)[];
  meters: (number | null)[];
  /** Pares deste tee (os da volta mais recente nele) — num campo de 9 o par
   *  de um buraco pode variar com o tee (Miramar 9: par 4 nas vermelhas, 3 nas brancas). */
  pars: number[];
  /** Soma do eclético — só quando os 9 buracos têm resultado. */
  total: number | null;
}

export interface LoopEclectic {
  nome: string;
  pars: readonly number[];
  /** Tees por ordem da volta mais recente. */
  tees: LoopTee[];
}

export interface GrupoEclecticos {
  /** "Santo da Serra" ou o nome do campo de 9 buracos. */
  grupo: string;
  linhas: LoopEclectic[];
}

type Acc = { teeName: string; rounds: LoopRound[]; meters: (number | null)[]; pars: number[] | null };

/** Forma mínima do master-courses.json que interessa aqui. */
export interface MasterCursos {
  courses: { master: { name: string; tees: { holes?: { distance?: number | null }[] }[] } }[];
}

/** Campos de 9 buracos segundo o master-courses (o mesmo da página /campos):
 *  algum tee com 18 buracos em que os metros do 10–18 repetem os do 1–9.
 *  Devolve os nomes normalizados (normKey). O Santo da Serra trata-se à parte. */
export function camposDe9(master: MasterCursos | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const c of master?.courses ?? []) {
    const nove = c.master.tees.some(t => {
      const h = t.holes ?? [];
      return h.length === 18 && h.slice(0, 9).every((x, i) => x.distance != null && x.distance > 0 && x.distance === h[9 + i].distance);
    });
    if (nove && !/santo da serra/i.test(c.master.name)) out.add(normKey(c.master.name));
  }
  return out;
}

const temG = (h: HoleScores, inicio: number) => Array.from({ length: 9 }, (_, i) => h.g?.[inicio + i]).some(v => v != null && Number(v) > 0);
const igual9 = (a: (number | null)[] | undefined, b0: number) =>
  !!a && Array.from({ length: 9 }, (_, i) => a[i]).every((v, i) => v != null && Number(v) === Number(a[b0 + i]));

function acumular(map: Map<string, Acc>, r: RoundData, h: HoleScores, inicio: number, combo: string[]) {
  const g = Array.from({ length: 9 }, (_, i) => {
    const v = h.g?.[inicio + i];
    return v != null && Number(v) > 0 ? Number(v) : null;
  });
  if (!g.some(v => v != null)) return;
  const teeKey = normKey(r.tee || "");
  const acc: Acc = map.get(teeKey) ?? { teeName: r.tee || "", rounds: [], meters: new Array(9).fill(null), pars: null };
  if (!acc.pars || r.dateSort > Math.max(...acc.rounds.map(x => x.dateSort))) acc.pars = Array.from({ length: 9 }, (_, i) => Number(h.p?.[inicio + i]));
  acc.rounds.push({ scoreId: r.scoreId, date: r.date, dateSort: r.dateSort, teeName: r.tee || "", g, combo });
  for (let i = 0; i < 9; i++) {
    const m = h.m?.[inicio + i];
    if (acc.meters[i] == null && m != null && Number(m) > 0) acc.meters[i] = Number(m);
  }
  map.set(teeKey, acc);
}

function fechar(nome: string, pars: readonly number[], tees: Map<string, Acc>): LoopEclectic {
  const lista: LoopTee[] = [...tees.entries()].map(([teeKey, acc]) => {
    const rounds = acc.rounds.sort((a, b) => b.dateSort - a.dateSort);
    const best: (number | null)[] = new Array(9).fill(null);
    const bestFrom: (string | null)[] = new Array(9).fill(null);
    for (const r of rounds) {
      r.g.forEach((v, i) => {
        if (v != null && (best[i] == null || v < (best[i] as number))) { best[i] = v; bestFrom[i] = r.date; }
      });
    }
    const total = best.every(v => v != null) ? best.reduce<number>((s, v) => s + (v as number), 0) : null;
    return { teeName: acc.teeName, teeKey, rounds, best, bestFrom, meters: acc.meters, pars: acc.pars ?? [...pars], total };
  });
  lista.sort((a, b) => (b.rounds[0]?.dateSort ?? 0) - (a.rounds[0]?.dateSort ?? 0));
  return { nome, pars, tees: lista };
}

const ignorar = (r: RoundData) => r._isTreino || r._isExtra || r._isTeamEvent;

/** Só os três 9 do Santo da Serra. */
export function sserraLoopEclectics(data: { DATA: CourseData[]; HOLES: Record<string, HoleScores> }): LoopEclectic[] {
  const porLoop = new Map<string, Map<string, Acc>>();
  for (const course of data.DATA) {
    if (!/santo da serra/i.test(course.course || "")) continue;
    for (const r of course.rounds) {
      if (ignorar(r)) continue;
      const h = data.HOLES[r.scoreId];
      if (!h?.g || !h.p) continue;
      const metades = [0, 9].flatMap(inicio => {
        const loop = SSERRA_LOOPS.find(l => l.pars.every((v, i) => Number(h.p?.[inicio + i]) === v));
        return loop ? [{ inicio, nome: loop.nome as string }] : [];
      });
      const combo = metades.map(x => x.nome);
      for (const x of metades) {
        const m = porLoop.get(x.nome) ?? new Map<string, Acc>();
        acumular(m, r, h, x.inicio, combo);
        porLoop.set(x.nome, m);
      }
    }
  }
  return SSERRA_LOOPS.flatMap(l => (porLoop.get(l.nome)?.size ? [fechar(l.nome, l.pars, porLoop.get(l.nome)!)] : []));
}

/** Campos de 9 buracos (fora do Santo da Serra).
 *  - Na lista oficial (`campos9`, do master-courses): entram todas as voltas —
 *    as de 9 e as duas metades das de 18 — sem conferir pares (o par de um
 *    buraco muda com o tee ou com o dia: Miramar 9 é par 3 nas brancas, Jamor 3
 *    foi par 3 a 18/05/2025). Cada tee leva os pares dos seus cartões.
 *  - Fora da lista (campos estrangeiros…): só se há voltas de 18 com as duas
 *    metades iguais em pares e metros, e só com esses pares. */
export function doubledNineEclectics(
  data: { DATA: CourseData[]; HOLES: Record<string, HoleScores> }, campos9: Set<string> = new Set(),
): LoopEclectic[] {
  const out: LoopEclectic[] = [];
  for (const course of data.DATA) {
    if (/santo da serra/i.test(course.course || "")) continue;
    const voltas = course.rounds.filter(r => !ignorar(r) && data.HOLES[r.scoreId]?.g && data.HOLES[r.scoreId]?.p);
    if (!voltas.length) continue;
    const dobrada = (h: HoleScores) =>
      igual9(h.p, 9) && (!h.m?.some(v => v != null && Number(v) > 0) || igual9(h.m, 9));
    const oficial = campos9.has(normKey(course.course));
    const dobradas = voltas.filter(r => { const h = data.HOLES[r.scoreId]; return temG(h, 0) && temG(h, 9) && dobrada(h); });
    if (!oficial && !dobradas.length) continue;
    const ref = data.HOLES[(dobradas[0] ?? [...voltas].sort((a, b) => b.dateSort - a.dateSort)[0]).scoreId];
    const pars = Array.from({ length: 9 }, (_, i) => Number(ref.p[i]));
    const mesmoPar = (h: HoleScores, inicio: number) => oficial || pars.every((v, i) => Number(h.p?.[inicio + i]) === v);
    const tees = new Map<string, Acc>();
    for (const r of voltas) {
      const h = data.HOLES[r.scoreId];
      const duas = temG(h, 0) && temG(h, 9);
      if (duas && !oficial && !dobrada(h)) continue; // 18 buracos a sério: não é este 9
      for (const inicio of [0, 9]) {
        if (!temG(h, inicio) || !mesmoPar(h, inicio)) continue;
        acumular(tees, r, h, inicio, duas ? [course.course, course.course] : [course.course]);
      }
    }
    if (tees.size) out.push(fechar(course.course, pars, tees));
  }
  return out.sort((a, b) => (b.tees[0]?.rounds[0]?.dateSort ?? 0) - (a.tees[0]?.rounds[0]?.dateSort ?? 0));
}

/** Todos os ecléticos de 9 buracos do jogador, agrupados por campo.
 *  `campos9`: nomes normalizados dos campos de 9 buracos (ver camposDe9). */
export function eclecticos9(data: { DATA: CourseData[]; HOLES: Record<string, HoleScores> }, campos9?: Set<string>): GrupoEclecticos[] {
  const sds = sserraLoopEclectics(data);
  return [
    ...(sds.length ? [{ grupo: "Santo da Serra", linhas: sds }] : []),
    ...doubledNineEclectics(data, campos9).map(l => ({ grupo: l.nome, linhas: [l] })),
  ];
}
