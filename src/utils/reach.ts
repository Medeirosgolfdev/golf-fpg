/**
 * src/utils/reach.ts
 *
 * Alcance de greens em regulacao (GIR) — fonte UNICA da formula, partilhada
 * pela "Vantagem de Tee" (/comparar) e pela tab "Previsao" (/kids2/next-t).
 * Melhorias aqui propagam-se a todos os sitios.
 */
import type { Tee } from "../data/types";

/** Orcamento de metros para chegar ao green em regulacao.
 *  par3 = drive ; par4 = drive + 2a ; par5 = drive + 2a*(par-3). */
export function reachBudget(par: number, driveM: number, secondM: number): number {
  return par === 3 ? driveM : par === 4 ? driveM + secondM : driveM + secondM * (par - 3);
}

export interface HoleReach {
  hole: number;
  par: number | null;
  dist: number | null;
  /** Metros que faltam depois da pancada do tee (par3 = a propria do green). */
  afterDrive: { m: number; reachable: boolean } | null;
  /** Metros que faltam depois da 2a pancada grande (so par 4/5). */
  after2: { m: number; reachable: boolean } | null;
}

export function buildReach(tee: Tee, driveM: number, secondM: number): HoleReach[] {
  return tee.holes.map(h => {
    const par = h.par, d = h.distance;
    const budget = (par != null && par >= 3) ? reachBudget(par, driveM, secondM) : null;
    const afterDrive = (par != null && d != null && par >= 3 && budget != null)
      ? { m: Math.max(0, d - driveM), reachable: d <= budget } : null;
    const after2 = (par != null && d != null && par >= 4 && budget != null)
      ? { m: Math.max(0, d - driveM - secondM), reachable: d <= budget } : null;
    return { hole: h.hole, par, dist: d, afterDrive, after2 };
  });
}

/** Buracos cujo green NAO se alcanca em regulacao com o alcance dado. */
export function notReachableHoles(reach: HoleReach[]): HoleReach[] {
  return reach.filter(r =>
    (r.par === 3 && r.afterDrive != null && !r.afterDrive.reachable) ||
    (r.par != null && r.par >= 4 && r.after2 != null && !r.after2.reachable),
  );
}
