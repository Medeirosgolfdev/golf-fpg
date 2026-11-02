/**
 * Passo 5b do identity-matcher — casamento da Federgolf (fig) por provas
 * (regra dela, 02/11/2026: liga A, B, C e F; o D não se liga).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { resolve } = require("./identity-matcher.js");

const fig = (anos = []) => ({
  sourceId: "fig",
  players: [{ sourceKey: "fg-1", name: "Matteo Durando", sex: "M", country: "IT", extra: { anosNascimento: anos } }],
  tournaments: [{
    sourceKey: "p1", name: "Trofeo", date: "2026-10-24",
    flights: [{ flightKey: "maschile", label: "Maschile", results: [
      { playerSourceKey: "fg-1", totalGross: 149, rounds: [{ round: 1, gross: 78 }, { round: 2, gross: 71 }] },
    ] }],
  }],
});
/** Outra fonte com um jogador «Matteo Durando» e uma prova: a mesma do fig
 *  (24/10/2026, ±3 dias) quando `pancadas` = 149, senão outra. */
const outra = (sourceId, key, { country = "MC", pancadas = 160, dob } = {}) => ({
  sourceId,
  players: [{ sourceKey: key, name: "Matteo Durando", sex: "M", country, dob }],
  tournaments: [{
    sourceKey: `${key}-t`, name: "Trofeo", date: pancadas === 149 ? "2026-10-25" : "2025-05-01",
    flights: [{ flightKey: "g", label: "Geral", results: [{ playerSourceKey: key, totalGross: pancadas }] }],
  }],
});
const comFig = (juniors) => juniors.filter((j) => j._match.evidence.some((e) => e.startsWith("fig:")));

describe("identity-matcher — casamento da Federgolf por provas", () => {
  it("A: casa com a ficha que tem a prova em comum (mesmas pancadas), mesmo de outro país e havendo outra com o nome", () => {
    const { juniors } = resolve([fig(), outra("egr", "e1", { pancadas: 149 }), outra("uskids", "111", { country: "ZA" })], {});
    const [j] = comFig(juniors);
    expect(j._match.evidence).toContain("egr:e1");
    expect(j._match.evidence).not.toContain("uskids:111");
  });
  it("C: sem prova em comum, casa com a única ficha com esse nome", () => {
    const { juniors } = resolve([fig(), outra("uskids", "557351")], {});
    expect(juniors).toHaveLength(1);
    expect(juniors[0].id).toBe("u557351");
  });
  it("D: várias fichas possíveis e nenhuma prova em comum → não casa (ficha própria, id «i…»)", () => {
    const { juniors } = resolve([fig(), outra("uskids", "111"), outra("uskids", "222", { country: "ZA" })], {});
    const [j] = comFig(juniors);
    expect(j._match.evidence).toEqual(["fig:fg-1"]);
    expect(j.id).toMatch(/^i[0-9a-f]{10}$/);
  });
  it("o ano de nascimento contra trava (data da ficha ≠ ano do ranking)", () => {
    const { juniors } = resolve([fig([2014]), outra("uskids", "557351", { dob: "2010-05-05" })], {});
    expect(juniors).toHaveLength(2);
  });
  it("o mesmo ano deixa casar", () => {
    const { juniors } = resolve([fig([2014]), outra("uskids", "557351", { dob: "2014-05-05" })], {});
    expect(juniors).toHaveLength(1);
  });
});
