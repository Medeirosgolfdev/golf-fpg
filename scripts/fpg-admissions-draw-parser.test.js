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
const { parseAdmissions, parseAdmissionsPt, parseDraw } = require("./fpg-admissions-draw-parser.js");

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

/* ─────────────────────────────────────────────────────────────────────────
   HANDICAPS PLUS ("+5.1")
   Regressão 2026-07-18: a FPG publica handicaps plus com "+" no HTML, mas
   parseFloat("+5.1") devolve 5.1 e o sinal desaparecia em silêncio — a Sofia
   Barroso Sá (+5.1, abaixo de scratch) aparecia nas inscrições como um 5.1
   vulgar. Convenção do projecto: plus guarda-se NEGATIVO (fmtHcp formata
   negativos como "+5.1").
   ───────────────────────────────────────────────────────────────────────── */
const { _parseHcp } = require("./fpg-admissions-draw-parser.js");

describe("parseHcp — convenção de handicap plus", () => {
  it('"+5.1" (plus) → negativo', () => {
    expect(_parseHcp("+5.1")).toBe(-5.1);
  });
  it('"5.1" (normal) → positivo', () => {
    expect(_parseHcp("5.1")).toBe(5.1);
  });
  it('aceita vírgula decimal', () => {
    expect(_parseHcp("+2,3")).toBe(-2.3);
    expect(_parseHcp("2,3")).toBe(2.3);
  });
  it('"+0.0" é scratch, não -0', () => {
    expect(Object.is(_parseHcp("+0.0"), 0)).toBe(true);
  });
  it("vazio/inválido → null", () => {
    expect(_parseHcp("")).toBe(null);
    expect(_parseHcp("-")).toBe(null);
    expect(_parseHcp("abc")).toBe(null);
  });
});

describe("parseAdmissions — torneio com handicap plus (fixture 10880)", () => {
  const adm = parseAdmissions(loadFixture("admissions-10880-plushcp.html"));

  it("parseia o torneio", () => {
    expect(adm.name).toBe("4º Torneio do Circuito Aquapor S");
    expect(adm.players.length).toBe(12);
  });

  it("Sofia Barroso Sá (+5.1) fica guardada como -5.1", () => {
    const sofia = adm.players.find(p => /Sofia Barroso/.test(p.nome || ""));
    expect(sofia).toBeTruthy();
    expect(sofia.hcp).toBe(-5.1);
  });

  it("apanha TODOS os plus do torneio (eram 3 em 12)", () => {
    // Confirmado no HTML cru: "+5.1", "+0.2", "+0.6" — os três apareciam
    // como 5.1 / 0.2 / 0.6 antes deste fix.
    const plus = adm.players.filter(p => p.hcp != null && p.hcp < 0)
      .map(p => [p.nome, p.hcp]);
    expect(plus).toEqual([
      ["Sofia Barroso Sá", -5.1],
      ["Francisca Ferreira Da Costa", -0.2],
      ["Eva Silva", -0.6],
    ]);
  });

  it("handicaps normais mantêm-se positivos", () => {
    const laura = adm.players.find(p => /Laura Santos/.test(p.nome || ""));
    expect(laura.hcp).toBe(1.2);
  });

  it("o VAC não é afectado pela regra do plus", () => {
    const sofia = adm.players.find(p => /Sofia Barroso/.test(p.nome || ""));
    expect(sofia.vacf).toBe(70.4);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   DRAW DE TORNEIO DE CLUBE COM ESTRANGEIROS (962/10084, Quinta do Lago)
   Três regressões apanhadas neste torneio (2026-08-20):
     1. Nome do torneio ficava null — a regex exigia que a célula da direita
        começasse por "Federa(ção)", o que só é verdade nos torneios da FPG.
     2. O "-" da coluna Federado (jogador não federado) era lido como CLUBE e
        o país/clube real desaparecia — 12 dos 20 jogadores deste flight.
     3. Flights com tees mistos (rapazes Brancas + raparigas Verdes) perdiam o
        tee das raparigas, que ficavam com o do grupo.
   ───────────────────────────────────────────────────────────────────────── */
describe("parseDraw — torneio de clube com estrangeiros (962/10084)", () => {
  const draw = parseDraw(loadFixture("draw-10084-qdl-u12.html"));

  it("extrai nome, campo, clube e data", () => {
    expect(draw.name).toBe("Paul McGinley Junior Cup 2026 - U12");
    expect(draw.campo).toBe("Quinta do Lago Norte");
    expect(draw.clube).toBe("Sociedade do Golfe da Quinta do Lago");
    expect(draw.date).toBe("2026-08-21");
    expect(draw.totalJogadores).toBe(20);
  });

  it("apanha todos os flights e jogadores", () => {
    expect(draw.groups).toHaveLength(7);
    const total = draw.groups.reduce((n, g) => n + g.players.length, 0);
    expect(total).toBe(draw.totalJogadores);
  });

  it('"-" na coluna Federado → fed null SEM comer o clube', () => {
    const landon = draw.groups.flatMap(g => g.players).find(p => p.nome === "Landon Binninger");
    expect(landon.fed).toBe(null);
    expect(landon.clube).toBe("USA");
  });

  it("federados mantêm nº e clube", () => {
    const ricardo = draw.groups[0].players[0];
    expect(ricardo.nome).toBe("Ricardo Castro Ferreira");
    expect(ricardo.fed).toBe("49085");
    expect(ricardo.clube).toBe("POR");
  });

  it("tee próprio quando o flight tem tees mistos", () => {
    const g0 = draw.groups[0];
    expect(g0.tee).toBe("Brancas");
    const sabrina = g0.players.find(p => /Sabrina/.test(p.nome));
    expect(sabrina.tee).toBe("Verdes");
    // quem joga o tee do grupo não leva override
    expect(g0.players[0].tee).toBeUndefined();
  });

  it("captura o HCP exacto de cada jogador (com a convenção plus)", () => {
    expect(draw.groups[0].players[0].hcp).toBe(5.3);
    const all = draw.groups.flatMap(g => g.players);
    expect(all.every(p => typeof p.hcp === "number")).toBe(true);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   INSCRITOS PÚBLICOS (admissions.asp) — fallback sem cookies
   ───────────────────────────────────────────────────────────────────────── */
describe("parseAdmissionsPt — inscritos da admissions.asp", () => {
  const adm = parseAdmissionsPt(loadFixture("admissions-pt-10084-qdl-u12.html"));

  it("extrai meta do torneio", () => {
    expect(adm.name).toBe("Paul McGinley Junior Cup 2026 - U12");
    expect(adm.campo).toBe("Quinta do Lago Norte");
    expect(adm.date).toBe("2026-08-21");
    expect(adm.totalInscritos).toBe(20);
    expect(adm._source).toBe("admissions.asp");
  });

  it("lista todos os inscritos", () => {
    expect(adm.players).toHaveLength(20);
    expect(adm.players.every(p => p.status === "confirmed")).toBe(true);
  });

  it("federado vs não-federado", () => {
    const joe = adm.players.find(p => p.nome === "Joe Short");
    expect(joe.fed).toBe("51804");
    expect(joe.hcp).toBe(7.6);
    const benji = adm.players.find(p => p.nome === "Benji Botham");
    expect(benji.fed).toBe(null);
    expect(benji.clube).toBe("UK");
  });

  it("campos que esta fonte NÃO tem ficam null (não inventar)", () => {
    expect(adm.players.every(p => p.pos === null && p.registo === null && p.vacf === null)).toBe(true);
    expect(adm.reservas).toBe(0);
  });

  it("aceita HTML vazio sem crashar", () => {
    expect(parseAdmissionsPt("")).toEqual({ error: "empty-html" });
  });
});
