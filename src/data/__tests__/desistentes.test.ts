/**
 * Quem se desinscreve fica na lista como «desistente» (src/data/desistentes.ts).
 * O carregamento pelos scripts Node está em scripts/desistentes-loader.test.js.
 */
import { describe, it, expect } from "vitest";
import { juntarDesistentes, type InscritoBase } from "../desistentes";

const p = (fed: string, status = "confirmed", extra: { desinscritoEm?: string } = {}): InscritoBase =>
  ({ fed, nome: `J${fed}`, status, pos: 1, ...extra });

describe("juntarDesistentes", () => {
  it("quem saiu volta como desistente, com o dia em que se deu pela saída", () => {
    const r = juntarDesistentes([p("1"), p("2"), p("3")], [p("1"), p("3"), p("4")], { hoje: "2026-11-02" })!;
    expect(r.saidas.map(x => x.fed)).toEqual(["2"]);
    expect(r.players.map(x => `${x.fed}:${x.status}`)).toEqual(["1:confirmed", "3:confirmed", "4:confirmed", "2:desistente"]);
    expect(r.players[3]).toMatchObject({ desinscritoEm: "2026-11-02", pos: null });
  });
  it("um desistente antigo mantém a data; se voltar a inscrever-se deixa de o ser", () => {
    const prev = [p("1"), p("2", "desistente", { desinscritoEm: "2026-10-20" }), p("3", "desistente", { desinscritoEm: "2026-10-21" })];
    const r = juntarDesistentes(prev, [p("1"), p("3")], { hoje: "2026-11-02" })!;
    expect(r.saidas).toEqual([]);
    expect(r.players.map(x => `${x.fed}:${x.status}:${x.desinscritoEm ?? ""}`))
      .toEqual(["1:confirmed:", "3:confirmed:", "2:desistente:2026-10-20"]);
  });
  it("saem demasiados de uma vez → null (fonte parcial)", () => {
    const prev = Array.from({ length: 10 }, (_, i) => p(String(i)));
    expect(juntarDesistentes(prev, prev.slice(0, 5))).toBeNull();
    expect(juntarDesistentes(prev, prev.slice(0, 7))).not.toBeNull();
  });
  it("sem federado casa pelo nome sem acentos", () => {
    const r = juntarDesistentes([{ fed: null, nome: "Conceição", status: "confirmed" }], [{ fed: null, nome: "Conceicao", status: "confirmed" }])!;
    expect(r.saidas).toEqual([]);
  });
});

