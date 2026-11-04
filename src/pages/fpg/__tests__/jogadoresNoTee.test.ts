import { describe, it, expect } from "vitest";
import { jogadoresNoTee } from "../fpgCourseTab";
import type { Tournament } from "../../../data/fpgTypes";

/** O «👥 O field neste tee» da Previsão: antes dos resultados conta só quem
 *  está inscrito — 04/11/2026, Final Drive Tour (Oeiras): apareciam apurados
 *  ainda por inscrever («tem jogadores que nem se inscreveram»). */
describe("jogadoresNoTee — só os inscritos confirmados", () => {
  const vazio = { dob: new Map<string, string>(), sex: new Map<string, "M" | "F">(), hcp: new Map<string, number>() };
  const p = (nome: string, fed: string, status: string) =>
    ({ nome, fed, clube: "X", hcp: 5, status, teeName: "Vermelhas" });
  const t = {
    name: "Final", date: "2026-11-07", ccode: "985", tcode: "10246", players: [],
    _admissions: { players: [
      p("Manuel Goulartt Medeiros", "52884", "confirmed"),
      p("Inscrito Confirmado", "1", "confirmed"),
      p("Apurado Por Inscrever", "2", "reserva"),
      p("Saiu Da Prova", "3", "desistente"),
    ] },
  } as unknown as Tournament;

  it("tira reservas e desistentes, fica o Manuel e os confirmados", () => {
    const nomes = jogadoresNoTee(t, "Vermelhas", vazio).map((j) => j.fed);
    expect(nomes).toEqual(["52884", "1"]);
  });

  it("o Manuel fica mesmo sem estar confirmado", () => {
    const t2 = { ...t, _admissions: { players: [p("Manuel Goulartt Medeiros", "52884", "reserva")] } } as unknown as Tournament;
    expect(jogadoresNoTee(t2, "Vermelhas", vazio).map((j) => j.fed)).toEqual(["52884"]);
  });
});
