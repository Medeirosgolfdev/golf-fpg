import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CourseHeroCard from "../CourseHeroCard";
import { campoDoCartao } from "../../data/campoDoCartao";

/** Um campo de 18 buracos com UM par 6 (como o Otepää, na Estónia: par 73). */
const PAR = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 6, 4, 4, 3, 4, 5]; // 73
const METROS = [350, 370, 150, 480, 340, 360, 160, 380, 470, 355, 145, 365, 610, 345, 375, 155, 385, 475];

describe("ficha do campo com um buraco de par 6 (11/11/2026: dizia «17 buracos»)", () => {
  const course = campoDoCartao({ campo: "Otepää GC", players: [{ sex: "M", par: PAR, meters: METROS, courseRating: 71.4, slope: 135 }] })!;
  const html = renderToStaticMarkup(<CourseHeroCard course={course} tee={course.master.tees[0]} />);

  it("conta os 18 buracos e o par total certo", () => {
    expect(html).toContain("Par total · 18 buracos");
    expect(html).not.toContain("17 buracos");
    expect(html).toContain(">73<");
  });

  it("o par 6 tem o seu grupo no quadro «Por par»", () => {
    expect(html).toContain("Par 6");
    expect(html).toContain("1 buraco ·");
  });

  it("um campo sem par 6 não ganha um grupo vazio", () => {
    const normal = campoDoCartao({ campo: "X", players: [{ sex: "M", par: PAR.map((p) => (p === 6 ? 5 : p)), meters: METROS }] })!;
    const h = renderToStaticMarkup(<CourseHeroCard course={normal} tee={normal.master.tees[0]} />);
    expect(h).toContain("Par total · 18 buracos");
    expect(h).not.toContain("Par 6");
  });
});
