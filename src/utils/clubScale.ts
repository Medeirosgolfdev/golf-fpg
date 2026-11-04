/**
 * src/utils/clubScale.ts — a escala de distâncias do saco (percentagem
 * CONSTANTE do drive) e a escolha do taco da 1.ª pancada. Fonte única: a
 * «Vantagem de Tee» (/comparar) mostra a escala; o «📏 Alcance» (HoleDiffTable,
 * Previsão e Vantagem de Tee) escolhe o taco de saída de cada buraco.
 *
 * A escala é a do princípio 24-28× (medições Trackman da US Kids Golf
 * Foundation + ASGCA): ferro 7 ≈ 65-70% do drive, wedges ≈ 40-50%.
 * Monotónica decrescente.
 */

export interface ClubStep { club: string; abbr: string; pct: number }

export const CLUB_SCALE: ClubStep[] = [
  { club: "Driver", abbr: "D", pct: 100 },
  { club: "Madeira 3", abbr: "M3", pct: 93 },
  { club: "Madeira 5", abbr: "M5", pct: 87 },
  { club: "Híbrido", abbr: "Hb", pct: 81 },
  { club: "Ferro 4", abbr: "F4", pct: 77 },
  { club: "Ferro 5", abbr: "F5", pct: 73 },
  { club: "Ferro 6", abbr: "F6", pct: 69 },
  { club: "Ferro 7", abbr: "F7", pct: 65 },
  { club: "Ferro 8", abbr: "F8", pct: 60 },
  { club: "Ferro 9", abbr: "F9", pct: 55 },
  { club: "Pitching wedge", abbr: "PW", pct: 50 },
  { club: "Gap wedge", abbr: "GW", pct: 45 },
  { club: "Sand wedge", abbr: "SW", pct: 40 },
  { club: "Lob wedge", abbr: "LW", pct: 35 },
];

export interface ClubShot extends ClubStep { m: number }

/** Os tacos com os metros para este drive (do mais comprido ao mais curto). */
export function clubDistances(driveM: number): ClubShot[] {
  return CLUB_SCALE.map(c => ({ ...c, m: Math.round((driveM * c.pct) / 100) }));
}

/**
 * O taco da 1.ª pancada (04/11/2026, Mariana: «ele só vai sair de drive em
 * alguns casos… uma linha a dizer qual o primeiro taco e quantos metros dá»):
 *  - par 3 → o taco mais curto que chega ao green (sem nenhum, o driver);
 *  - par 4 → driver, salvo se deixar menos do que um sand wedge cheio (ou
 *    passar o green): aí o taco que deixa um pitching wedge cheio;
 *  - par 5 → driver.
 */
export function firstShotClub(par: number | null, dist: number | null, driveM: number): ClubShot | null {
  if (par == null || dist == null || dist <= 0 || driveM <= 0) return null;
  const tacos = clubDistances(driveM);
  const driver = tacos[0];
  if (par === 3) {
    const chega = tacos.filter(c => c.m >= dist);
    return chega.length ? chega[chega.length - 1] : driver;
  }
  if (par === 4) {
    const sw = tacos.find(c => c.abbr === "SW")!.m;
    const pw = tacos.find(c => c.abbr === "PW")!.m;
    if (dist - driver.m >= sw) return driver;
    const alvo = dist - pw;
    let melhor = driver;
    for (const c of tacos) if (Math.abs(c.m - alvo) < Math.abs(melhor.m - alvo)) melhor = c;
    return melhor;
  }
  return driver;
}

/**
 * O taco da 2.ª pancada para `m` metros (04/11/2026, Mariana: «na segunda
 * pancada porque não fazes o mesmo… o Driver não se repete»): sem o driver
 * (é do chão), o taco mais curto que dá esses metros; se nenhum chega, a
 * madeira 3. Devolve o taco com `m` = os metros que a pancada joga.
 */
export function secondShotClub(m: number, driveM: number): ClubShot | null {
  if (!(m > 0) || driveM <= 0) return null;
  const tacos = clubDistances(driveM).filter(c => c.abbr !== "D");
  const chega = tacos.filter(c => c.m >= m);
  const c = chega.length ? chega[chega.length - 1] : tacos[0];
  return { ...c, m: Math.round(m) };
}
