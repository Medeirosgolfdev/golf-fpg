// As opções do «Mostrar» têm de fazer efeito em TODOS os desenhos dos PNGs:
// (a) o `has` do registo diz a verdade sobre o que cada desenho trata sozinho;
// (b) no cartão final (DesignCard: desenho + Par/S.I. nas células + linha de
//     informação) ligar/desligar cada opção muda sempre o resultado.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DESIGNS, ALL_TOGGLES } from "../overlay/registry";
import { calcStats } from "../overlay/shared";
import { DesignCard } from "../OverlayExport";
import type { DD, Vis } from "../overlay/types";

const par = [4, 4, 5, 3, 4, 4, 5, 3, 4, 5, 4, 4, 4, 3, 4, 4, 3, 5];
const one: DD = {
  player: "Manuel Medeiros", event: "Faldo Junior Tour Madeira", round: 1, date: "16 Out 2026", position: "10º",
  course: "Santo da Serra", tee: "White", teeDist: 5594, cr: 71, slope: 137,
  par, scores: [5, 4, 9, 3, 6, 4, 5, 4, 5, 6, 5, 5, 5, 3, 4, 4, 3, 5],
  si: [15, 13, 5, 11, 1, 7, 3, 17, 9, 2, 4, 14, 12, 8, 6, 16, 10, 18],
  meters: [352, 362, 476, 185, 368, 302, 460, 128, 310, 474, 326, 309, 279, 148, 338, 247, 122, 408],
  hi: 6.4, courseHcp: 7, sd: 10.7, is9h: false, hasHoles: true,
};
const tour: DD = { ...one, sd: null, rounds: [
  { round: 1, scores: one.scores, par, gross: 85, toPar: 13, date: "16 Out 2026" },
  { round: 2, scores: [4, 4, 6, 3, 5, 4, 5, 3, 4, 5, 4, 5, 4, 3, 4, 4, 3, 5], par, gross: 75, toPar: 3, date: "17 Out 2026" },
] };
const all: Vis = Object.fromEntries(ALL_TOGGLES.map((t) => [t.key, true]));
const P = { bg: "rgba(20,30,50,.88)", tc: "#fff", tc2: "#f0f0f0", tc3: "#e0e0e0", tc4: "#c8c8c8", fa: 0.88 };

// Não fazem sentido em certos desenhos (não há buracos / não há volta única).
const notApplicable = (x: (typeof DESIGNS)[number], key: string) =>
  (["holeScores", "holePar", "holeSI"].includes(key) && !x.needsHoles)
  || (x.needsRounds && ["round", "sd", "stats"].includes(key))
  || (x.needsHIO === true);

describe("opções do «Mostrar» nos PNGs", () => {
  for (const x of DESIGNS) {
    const d = x.needsRounds ? tour : one;
    const s = calcStats(d);
    const raw = (v: Vis) => renderToStaticMarkup(<x.C d={d} v={v} s={s} {...P} />);
    const card = (v: Vis) => renderToStaticMarkup(<DesignCard x={x} d={d} v={v} s={s} {...P} />);

    it(`${x.id} ${x.label}: o has do registo é o que o desenho faz`, () => {
      const real = ALL_TOGGLES.filter((t) => raw(all) !== raw({ ...all, [t.key]: false })).map((t) => t.key);
      expect(real.sort()).toEqual([...x.has].sort());
    });

    it(`${x.id} ${x.label}: cada opção muda o PNG`, () => {
      const dead = ALL_TOGGLES.filter((t) => !notApplicable(x, t.key) && card(all) === card({ ...all, [t.key]: false })).map((t) => t.key);
      expect(dead).toEqual([]);
    });
  }
});
