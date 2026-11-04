/**
 * src/utils/reach.ts
 *
 * Alcance de greens em regulacao (GIR) — fonte UNICA da formula, partilhada
 * pela "Vantagem de Tee" (/comparar) e pela tab "Previsao" (/kids2/next-t).
 * Melhorias aqui propagam-se a todos os sitios.
 */
import type { Tee } from "../data/types";
import { firstShotClub, secondShotClub, type ClubShot } from "./clubScale";

/** Orcamento de metros para chegar ao green em regulacao.
 *  par3 = drive ; par4 = drive + 2a ; par5 = drive + 2a*(par-3). */
export function reachBudget(par: number, driveM: number, secondM: number): number {
  return par === 3 ? driveM : par === 4 ? driveM + secondM : driveM + secondM * (par - 3);
}

export interface HoleReach {
  hole: number;
  par: number | null;
  dist: number | null;
  /** O taco da 1.ª pancada e os metros que dá (utils/clubScale) — nem
   *  sempre o driver (par 3, par 4 curtos). */
  first: ClubShot | null;
  /** Metros que faltam depois da pancada do tee — a partir do taco da 1.ª
   *  pancada (par3 = a propria do green). */
  afterDrive: { m: number; reachable: boolean } | null;
  /** O taco da 2.ª pancada (par 4/5; sem o driver) e os metros que joga: o
   *  que falta até ao green, no máximo a «2.ª pancada» configurada. */
  second: ClubShot | null;
  /** Metros que faltam depois da 2a pancada grande (so par 4/5). */
  after2: { m: number; reachable: boolean } | null;
  /** A 3.ª pancada (sem driver) quando a 2.ª não chega ao green, e o que falta
   *  depois dela (04/11/2026: «falta acabares para os outros buracos»). */
  third: ClubShot | null;
  after3: { m: number; reachable: boolean } | null;
}

export function buildReach(tee: Tee, driveM: number, secondM: number): HoleReach[] {
  return tee.holes.map(h => {
    const par = h.par, d = h.distance;
    const budget = (par != null && par >= 3) ? reachBudget(par, driveM, secondM) : null;
    const first = firstShotClub(par, d, driveM);
    const saida = par != null && par >= 4 && first ? first.m : driveM;
    const afterDrive = (par != null && d != null && par >= 3 && budget != null)
      ? { m: Math.max(0, d - saida), reachable: d <= budget } : null;
    const after2 = (par != null && d != null && par >= 4 && budget != null)
      ? { m: Math.max(0, d - saida - secondM), reachable: d <= budget } : null;
    const second = par != null && par >= 4 && afterDrive && afterDrive.m > 0
      ? secondShotClub(Math.min(afterDrive.m, secondM), driveM) : null;
    const third = after2 && after2.m > 0 ? secondShotClub(Math.min(after2.m, secondM), driveM) : null;
    const after3 = after2 && after2.m > 0 && third ? { m: Math.max(0, after2.m - third.m), reachable: after2.reachable } : null;
    return { hole: h.hole, par, dist: d, first, afterDrive, second, after2, third, after3 };
  });
}

/** Buracos cujo green NAO se alcanca em regulacao com o alcance dado. */
export function notReachableHoles(reach: HoleReach[]): HoleReach[] {
  return reach.filter(r =>
    (r.par === 3 && r.afterDrive != null && !r.afterDrive.reachable) ||
    (r.par != null && r.par >= 4 && r.after2 != null && !r.after2.reachable),
  );
}
