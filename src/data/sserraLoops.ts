/**
 * Eclético de um jogador em cada um dos três 9 buracos do Santo da Serra
 * (Machico, Desertas, Serras).
 *
 * Os percursos de 18 buracos do clube são combinações de dois destes 9
 * (Machico-Desertas, Desertas-Serras, Serras-Machico) e as voltas de 9 buracos
 * jogam-se num só. O nome do percurso nos dados vem normalizado e perde a
 * ordem (ex. "Desertas+Machico"), por isso cada metade da volta é reconhecida
 * pela sequência de pares, que é a mesma em todos os tees.
 */
import type { CourseData, HoleScores, RoundData } from "./playerDataLoader";
import { normKey } from "../utils/teeColors";

export const SSERRA_LOOPS = [
  { nome: "Machico", pars: [4, 4, 5, 3, 4, 4, 5, 3, 4] },
  { nome: "Desertas", pars: [4, 5, 4, 4, 4, 3, 5, 3, 4] },
  { nome: "Serras", pars: [5, 4, 4, 4, 3, 4, 4, 3, 5] },
] as const;

export type LoopNome = (typeof SSERRA_LOOPS)[number]["nome"];

export interface LoopRound {
  scoreId: string;
  date: string;
  dateSort: number;
  teeName: string;
  /** Gross dos 9 buracos deste 9 (0/null = buraco sem resultado). */
  g: (number | null)[];
  /** Os dois 9 da volta, pela ordem jogada (um só nas voltas de 9 buracos). */
  combo: LoopNome[];
}

export interface LoopTee {
  teeName: string;
  teeKey: string;
  rounds: LoopRound[];
  best: (number | null)[];
  bestFrom: (string | null)[];
  meters: (number | null)[];
  /** Soma do eclético — só quando os 9 buracos têm resultado. */
  total: number | null;
}

export interface LoopEclectic {
  nome: LoopNome;
  pars: readonly number[];
  /** Tees por ordem da volta mais recente. */
  tees: LoopTee[];
}

const loopDe = (p: (number | null)[] | undefined, inicio: number) =>
  SSERRA_LOOPS.find(l => l.pars.every((v, i) => Number(p?.[inicio + i]) === v));

export function sserraLoopEclectics(data: { DATA: CourseData[]; HOLES: Record<string, HoleScores> }): LoopEclectic[] {
  type Acc = { teeName: string; rounds: LoopRound[]; meters: (number | null)[] };
  const porLoop = new Map<LoopNome, Map<string, Acc>>();

  const juntar = (nome: LoopNome, r: RoundData, h: HoleScores, inicio: number, combo: LoopNome[]) => {
    const g = Array.from({ length: 9 }, (_, i) => {
      const v = h.g?.[inicio + i];
      return v != null && Number(v) > 0 ? Number(v) : null;
    });
    if (!g.some(v => v != null)) return;
    const teeKey = normKey(r.tee || "");
    const tees = porLoop.get(nome) ?? new Map<string, Acc>();
    const acc: Acc = tees.get(teeKey) ?? { teeName: r.tee || "", rounds: [], meters: new Array(9).fill(null) };
    acc.rounds.push({ scoreId: r.scoreId, date: r.date, dateSort: r.dateSort, teeName: r.tee || "", g, combo });
    for (let i = 0; i < 9; i++) {
      const m = h.m?.[inicio + i];
      if (acc.meters[i] == null && m != null && Number(m) > 0) acc.meters[i] = Number(m);
    }
    tees.set(teeKey, acc);
    porLoop.set(nome, tees);
  };

  for (const course of data.DATA) {
    if (!/santo da serra/i.test(course.course || "")) continue;
    for (const r of course.rounds) {
      if (r._isTreino || r._isExtra || r._isTeamEvent) continue;
      const h = data.HOLES[r.scoreId];
      if (!h?.g || !h.p) continue;
      const metades = [0, 9]
        .map(inicio => ({ inicio, loop: loopDe(h.p, inicio) }))
        .filter((x): x is { inicio: number; loop: (typeof SSERRA_LOOPS)[number] } => !!x.loop);
      const combo = metades.map(x => x.loop.nome);
      for (const x of metades) juntar(x.loop.nome, r, h, x.inicio, combo);
    }
  }

  return SSERRA_LOOPS.flatMap(loop => {
    const tees = porLoop.get(loop.nome);
    if (!tees) return [];
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
      return { teeName: acc.teeName, teeKey, rounds, best, bestFrom, meters: acc.meters, total };
    });
    lista.sort((a, b) => (b.rounds[0]?.dateSort ?? 0) - (a.rounds[0]?.dateSort ?? 0));
    return [{ nome: loop.nome, pars: loop.pars, tees: lista }];
  });
}
