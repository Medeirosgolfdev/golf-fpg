/**
 * Guarda-costas do ESPELHO `scripts/lib/ffg-escalao.cjs` ↔ `src/utils/ffgEscalao.ts`.
 *
 * O build Node (build-france-players.js) e a app (PlayersView/FFGPage) têm de
 * classificar o escalão da MESMA maneira — senão o `cat` bakado no
 * france-players.json deixa de bater com o dropdown de escalões da página.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { ffgEscalaoCanonico as ts, ffgEscalaoMaisNovo as tsMin, FFG_ESC_ORDER } from "../src/utils/ffgEscalao";
import { ffgEscalaoCanonico as cjs, ffgEscalaoMaisNovo as cjsMin, FFG_ESC_ORDER as CJS_ORDER } from "./lib/ffg-escalao.cjs";

/** Labels crus representativos de cada ramo da função. */
const LABELS = [
  "", "   ", "Messieurs", "Dames", "1ère Série Messieurs", "Simple Score maximum",
  "U12 G", "U12F", "U12 Filles", "H/U14", "U  12", "GARCONS U-12", "U8", "U21",
  "CFJ - U12 Garçons", "1re Division U16 Garçons - Trophée Jean Louis DUPONT",
  "GRAND PRIX JEUNES HP 2026 U12", "CHAMPIONNAT REGIONAL JEUNES NA 2026",
  "POUCET", "Poucets Garçons", "Poussins", "POU G", "BENJAMINES", "BNJ F", "BG", "BF",
  "MINIMES", "MI", "MNIMES", "MG", "MF", "CADETS", "CAD F", "JUNIOR", "JUN G", "JG", "JF",
  "ENFANTS", "Joueurs jusqu'à 14 ans", "MOINS DE 15 ANS", "-13 ans",
  "SENIORS", "VETERANS", "ADULTES", "MID-AM", "Mid Am",
  "Trophée Brigitte VARANGOT", "Grand Prix de Chantaco", "Coupe des Régions",
];

describe("ffg-escalao.cjs espelha src/utils/ffgEscalao.ts", () => {
  it("mesma ordem de escalões", () => {
    expect(CJS_ORDER).toEqual([...FFG_ESC_ORDER]);
  });

  it("mesmo veredicto nos labels representativos", () => {
    for (const l of LABELS) expect([l, cjs(l)]).toEqual([l, ts(l)]);
  });

  it("mesmo veredicto nos labels REAIS do portal FFG", () => {
    const dir = path.resolve(__dirname, "..", "public", "data", "ffgolf-resultats");
    if (!fs.existsSync(dir)) return; // dados não versionados neste checkout
    const labels = new Set();
    for (const f of fs.readdirSync(dir).slice(0, 300)) {
      if (!f.endsWith(".json")) continue;
      let d;
      try { d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
      if (d?.name) labels.add(String(d.name));
      for (const s of (d?.details?.series || d?.series || [])) if (s?.label) labels.add(String(s.label));
    }
    expect(labels.size).toBeGreaterThan(50);
    for (const l of labels) expect([l, cjs(l)]).toEqual([l, ts(l)]);
  });
});

describe("ffgEscalaoMaisNovo", () => {
  it("devolve o escalão mais novo (jogar acima é permitido, abaixo não)", () => {
    // Caso real: Xan Iribarne (U12) jogou a 1re Division U16 em Julho de 2026.
    const esc = ["Sub-16 (Minime)", "Sub-12 (Poussin)"];
    expect(tsMin(esc)).toBe("Sub-12 (Poussin)");
    expect(cjsMin(esc)).toBe("Sub-12 (Poussin)");
  });

  it("ignora nulls e devolve null sem sinal nenhum", () => {
    expect(tsMin([null, undefined, ""])).toBeNull();
    expect(cjsMin([null, undefined, ""])).toBeNull();
  });

  it("Adultos só ganha quando é o único sinal", () => {
    expect(tsMin(["Adultos", "Sub-18 (Cadet)"])).toBe("Sub-18 (Cadet)");
    expect(tsMin(["Adultos"])).toBe("Adultos");
    expect(cjsMin(["Adultos", "Sub-18 (Cadet)"])).toBe("Sub-18 (Cadet)");
  });
});
