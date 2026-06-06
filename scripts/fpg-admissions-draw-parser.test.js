/**
 * Tests dos parsers FPG (admissions + draw).
 *
 * Usa fixtures em scripts/__fixtures__/ capturadas de torneios reais:
 *   - admissions-10941.html — Campeonato Nacional Jovens Sub 12 M (tcode 10941), inscrições em curso
 *   - draw-10254-r2.html    — Campeonato Nacional Jovens Sub 12 H Dia 2 (tcode 10254), pós-R1
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { parseAdmissions, parseDraw } = require("./fpg-admissions-draw-parser.js");

function loadFixture(name) {
  return fs.readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");
}

describe("parseAdmissions", () => {
  const html = loadFixture("admissions-10941.html");
  const adm = parseAdmissions(html);

  it("extrai meta do torneio", () => {
    expect(adm.name).toBe("Campeonato Nacional de Jovens Sub 12 H");
    expect(adm.date).toBe("2026-05-01");
    expect(adm.tcode).toBe("10941");
    expect(adm.ccode).toBe("000");
    expect(adm.status).toBe("Inscrições em curso");
  });

  it("extrai contagens correctas", () => {
    expect(adm.totalInscritos).toBe(15);
    expect(adm.reservas).toBe(2);
    expect(adm.players.length).toBe(17);  // 15 + 2
    expect(adm._warning).toBeUndefined();
  });

  it("marca reservas correctamente (pos reseta em 1)", () => {
    const confirmed = adm.players.filter(p => p.status === "confirmed");
    const reservas = adm.players.filter(p => p.status === "reserva");
    expect(confirmed.length).toBe(15);
    expect(reservas.length).toBe(2);
    expect(reservas[0].nome).toBe("Martim Silva");
    expect(reservas[0].fed).toBe("49714");
    expect(reservas[0].pos).toBe(1);  // pos reseta para reservas
  });

  it("extrai campos de cada jogador", () => {
    const manuel = adm.players.find(p => p.fed === "52884");
    expect(manuel).toBeDefined();
    expect(manuel.nome).toBe("Manuel Goulartt Medeiros");
    expect(manuel.clube).toBe("Santo da Serra");
    expect(manuel.hcp).toBe(10);
    expect(manuel.vacf).toBe(82.9);
    expect(manuel.registo).toBe("2026/04/01 17:30");
    expect(manuel.status).toBe("confirmed");
  });

  it("aceita HTML vazio sem crashar", () => {
    expect(parseAdmissions("")).toEqual({ error: "empty-html" });
    expect(parseAdmissions(null)).toEqual({ error: "empty-html" });
  });
});

describe("parseDraw", () => {
  const html = loadFixture("draw-10254-r2.html");
  const draw = parseDraw(html);

  it("extrai meta do torneio e ronda", () => {
    expect(draw.name).toMatch(/Campeonato Nacional de Jovens Sub 12 H/);
    expect(draw.name).toMatch(/Dia 2/);
    expect(draw.date).toBe("2025-06-29");
    expect(draw.totalJogadores).toBe(23);
  });

  it("extrai grupos (flights)", () => {
    expect(draw.groups.length).toBe(9);
    const first = draw.groups[0];
    expect(first.teeTime).toBe("08:00");
    expect(first.startHole).toBe(10);
    expect(first.tee).toBe("Vermelhas");
    expect(first.players.length).toBe(2);
  });

  it("extrai nomes e clubes dos jogadores", () => {
    const first = draw.groups[0];
    expect(first.players[0].nome).toBe("David Stocksreiter Ferreira");
    expect(first.players[0].clube).toBe("Lisbon SC");
    expect(first.players[1].nome).toBe("Gabriel Guimarães Mota");
    expect(first.players[1].clube).toBe("Estela");
  });

  it("último grupo pode ter 3 jogadores", () => {
    const last = draw.groups[draw.groups.length - 1];
    expect(last.teeTime).toBe("09:20");
    expect(last.players.length).toBe(3);
    const names = last.players.map(p => p.nome);
    expect(names).toContain("Marc Costa");
    expect(names).toContain("David Filip");
    expect(names).toContain("Raul Pazos (jr)");
  });

  it("total de jogadores extraídos bate com header", () => {
    const totalExtracted = draw.groups.reduce((n, g) => n + g.players.length, 0);
    expect(totalExtracted).toBe(draw.totalJogadores);
  });

  it("aceita HTML vazio sem crashar", () => {
    expect(parseDraw("")).toEqual({ error: "empty-html" });
    expect(parseDraw(null)).toEqual({ error: "empty-html" });
  });

  it("captura coluna Federado quando presente (Cor + Fed + Clube)", () => {
    // Layout do draw 059/10615: [Hora, Tee#, Cor, Nome, Fed, Clube]
    const htmlFed = `
      <table>
        <tr><td align="left">3º Torneio Academia Junior</td><td align="right">Federado</td></tr>
        <tr><td align="right">2026-06-06</td></tr>
        <tr><td align="right">Jogadores 2</td></tr>
        <tr><td>Hora</td><td>Tee</td><td>Jogador</td><td>Federado</td><td>Club/Equipa</td></tr>
        <tr style="border-top:2pt solid gray"><td>11:45</td><td>1</td><td>Vermelhas</td><td>Goulartt Medeiros,Manuel</td><td>52884</td><td>Santo da Serra</td></tr>
        <tr><td>11:45</td><td>1</td><td>Vermelhas</td><td>Rodrigues,Vicente</td><td>51896</td><td>Palheiro</td></tr>
      </table>`;
    const d = parseDraw(htmlFed);
    expect(d.groups.length).toBe(1);
    const ps = d.groups[0].players;
    expect(ps[0].nome).toBe("Goulartt Medeiros,Manuel");
    expect(ps[0].fed).toBe("52884");
    expect(ps[0].clube).toBe("Santo da Serra");
    expect(ps[1].fed).toBe("51896");
    expect(ps[1].clube).toBe("Palheiro");
  });
});
