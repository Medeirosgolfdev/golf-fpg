/**
 * computeToPar — ±par honesto para flights de 9 buracos em torneios de 18
 * (caso Marcus Karim, British Kids 2021: 2×9H gross 75 dava −69 com o par
 * do torneio ×2; o certo é +3 sobre o par dos 9 jogados).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { computeToPar } = require("./uskids.js");

// Par 72: front 9 = 36 (4,4,3,5,4,4,3,5,4) + back 9 = 36.
const PAR18 = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const front9 = (per) => [...Array(9).fill(0).map((_, i) => per[i]), ...Array(9).fill(0)];

describe("computeToPar", () => {
  it("2×9H com scorecard → par dos 9 jogados (caso Marcus, +3 e não −69)", () => {
    const s1 = front9([6, 5, 4, 6, 5, 5, 3, 4, 4]); // 42
    const s2 = front9([4, 4, 3, 5, 4, 4, 3, 3, 3]); // 33
    const rounds = [{ round: 1, gross: 42, strokes: s1 }, { round: 2, gross: 33, strokes: s2 }];
    expect(computeToPar(rounds, PAR18, 72, 75)).toBe(75 - 72); // 2×36
  });

  it("2×18H completos → par do torneio ×2 (comportamento normal mantém-se)", () => {
    const s = PAR18.map((p) => p + 1); // 90
    const rounds = [{ round: 1, gross: 90, strokes: s }, { round: 2, gross: 90, strokes: s }];
    expect(computeToPar(rounds, PAR18, 72, 180)).toBe(180 - 144);
  });

  it("cartão truncado na fonte (gross > Σ strokes) conta como volta completa", () => {
    const s = [...PAR18.slice(0, 17), 0]; // 17 buracos visíveis, soma 68
    const rounds = [{ round: 1, gross: 72, strokes: s }];
    expect(computeToPar(rounds, PAR18, 72, 72)).toBe(0);
  });

  it("ronda parcial SEM par por buraco → null (nunca fabricar)", () => {
    const s1 = front9([6, 5, 4, 6, 5, 5, 3, 4, 4]);
    const rounds = [{ round: 1, gross: 42, strokes: s1 }];
    expect(computeToPar(rounds, null, 72, 42)).toBeNull();
  });

  it("sem strokes → par cheio por ronda (sem sinal de 9H)", () => {
    const rounds = [{ round: 1, gross: 80 }, { round: 2, gross: 78 }];
    expect(computeToPar(rounds, PAR18, 72, 158)).toBe(158 - 144);
  });

  it("parArr USKids com zeros nos não jogados (9H): par cheio = só os >0", () => {
    const par9 = front9([4, 4, 3, 5, 4, 4, 3, 5, 4]); // par "18 slots" mas só 9 reais = 36
    const s = front9([5, 5, 4, 5, 4, 5, 3, 5, 5]);    // 41, joga os MESMOS 9 → volta completa
    const rounds = [{ round: 1, gross: 41, strokes: s }];
    expect(computeToPar(rounds, par9, null, 41)).toBe(41 - 36);
  });

  it("gross MENOR que a soma dos strokes (dados incoerentes, Local Tour) → null", () => {
    // Caso real Golf Le Vigne: 9 buracos somam 39 mas o gross diz 30, resto −1.
    const s = [6, 5, 4, 6, 5, 5, 3, 4, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1]; // Σ jogados 42... usar 39
    const s39 = [6, 4, 5, 3, 4, 5, 2, 7, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1];
    expect(computeToPar([{ round: 1, gross: 30, strokes: s39 }], PAR18, 72, 30)).toBeNull();
    expect(computeToPar([{ round: 1, gross: 30, strokes: s }], PAR18, 72, 30)).toBeNull();
  });

  it("gross fisicamente impossível (< 2/buraco — caso Ohio 2022) → null", () => {
    const s18 = PAR18.map(() => 2); // 18 jogados, soma 36
    expect(computeToPar([{ round: 1, gross: 33, strokes: s18 }], PAR18, 72, 33)).toBeNull();
    expect(computeToPar([{ round: 1, gross: 30 }], PAR18, 72, 30)).toBeNull(); // sem strokes, gross de 9H num evento 18
  });

  it("sem par nenhum → null; sem gross → null", () => {
    expect(computeToPar([{ round: 1, gross: 42 }], null, null, 42)).toBeNull();
    expect(computeToPar([], PAR18, 72, null)).toBeNull();
  });
});
