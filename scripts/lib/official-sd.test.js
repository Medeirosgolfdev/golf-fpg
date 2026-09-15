import { describe, it, expect } from "vitest";
import sdLib from "./official-sd.js";

const { matchPlayer } = sdLib;

/**
 * Caso real: Taça João Salazar de Sousa 2026 (038/10758). R1 a 12-09, R2 e R3
 * no MESMO dia (13-09). O WHS do Gabriel Sardo (37010) traz duas linhas a 13-09
 * com o mesmo tcode e sem gross. Casar volta a volta dava à R3 (70) o SD da R2
 * (72 → 0.1) em vez do dela (−1.5).
 */
describe("matchPlayer — duas voltas no mesmo dia", () => {
  const t = { tcode: "10758", date: "2026-09-12" };
  // A data de cada volta é t.date + ronda − 1 (roundsOf) — a R3 cai a 14-09.
  const datas = ["2026-09-12", "2026-09-13", "2026-09-14"];
  const vs = [1, 2, 3].map((round, i) => ({ t, rs: { round }, i, n: 3, date: datas[i], gross: 70 + i }));
  const rows = [
    { date: "2026-09-13", tcode: 10758, gross: null, sd: -1.5 },
    { date: "2026-09-13", tcode: 10758, gross: null, sd: 0.1 },
    { date: "2026-09-12", tcode: 10758, gross: null, sd: 3.3 },
  ];

  it("desempata pelo SD calculado de cada volta", () => {
    const calcs = { 1: 3.3, 2: 0.1, 3: -1.5 };
    expect(matchPlayer(rows, vs, (v) => calcs[v.rs.round])).toEqual([3.3, 0.1, -1.5]);
  });

  it("a R1, sozinha no seu dia, casa sempre certa", () => {
    expect(matchPlayer(rows, vs, () => null)[0]).toBe(3.3);
  });

  it("nunca dá a mesma linha a duas voltas", () => {
    const [, r2, r3] = matchPlayer(rows, vs, (v) => ({ 1: 3.3, 2: 0.1, 3: -1.5 })[v.rs.round]);
    expect(r2).not.toBe(r3);
  });

  it("com menos linhas que voltas, casa só as seguras", () => {
    const soR1 = [rows[2]];
    expect(matchPlayer(soR1, vs, () => null)).toEqual([3.3, null, null]);
  });
});
