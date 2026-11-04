/**
 * scripts/fetch-uskids-field.js — desinscrições (`removed`) de um escalão.
 * Pendente de 01/10/2026: quando o escalão vinha sem lista de nomes numa
 * recolha, perdia o histórico de quem tinha saído.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { aplicarFirstSeen } = require("./fetch-uskids-field.js");

const ontem = new Date(Date.now() - 86400_000).toISOString();

describe("aplicarFirstSeen — quem saiu", () => {
  it("escalão sem lista de nomes nesta recolha mantém as saídas já registadas", () => {
    const resultados = [{ t: "999", escaloes: [{ nome: "Boys 12" }] }];
    const prevRemoved = new Map([["999:Boys 12", new Map([["joao silva", { nome: "João Silva", removedAt: ontem, pais: "PT" }]])]]);
    aplicarFirstSeen(resultados, { firstSeenMap: new Map(), prevByEscalao: new Map(), prevRemoved });
    expect(resultados[0].escaloes[0].removed).toEqual([{ nome: "João Silva", removedAt: ontem, pais: "PT" }]);
  });

  it("com lista de nomes: quem estava e já não está entra em removed", () => {
    const resultados = [{ t: "999", escaloes: [{ nome: "Boys 12", jogadores: [{ nome: "Ana" }] }] }];
    const prevByEscalao = new Map([["999:Boys 12", new Map([["ana", { nome: "Ana" }], ["rui", { nome: "Rui", pais: "ES" }]])]]);
    aplicarFirstSeen(resultados, { firstSeenMap: new Map(), prevByEscalao, prevRemoved: new Map() });
    expect(resultados[0].escaloes[0].removed.map((r) => r.nome)).toEqual(["Rui"]);
  });
});
