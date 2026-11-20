import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { parseAceites, paisIso, dataPublicada, juntarAceites, manterAceites } = require("./doral-aceites.js");

const td = (s) => `<td class="xl66" style="border:0.5pt"><span style="font-size:10pt"><span style="font-family:Verdana">${s}</span></span></td>`;
const tr = (...c) => `<tr height="17">${c.map(td).join("")}</tr>`;
const HTML = `<p>PUBLISHED NOV 16, 26</p><table>
${tr("Gianluca", "Giudice", "South Africa", "Boys 7 &amp; Under")}
${tr("D&#39;annah", "Lundwright", "USA", "Girls 8 &amp; 9")}
${tr("Henry", "Sokol", "United States", "Boys 14 &amp; 16")}
${tr("Jack", "Smith", "33166", "Boys 14 &amp; 15")}
${tr("Luigi", "Gherardi", "VENETO", "Boys 14 &amp; 15")}
${tr("Anna", "Bell", "United States", "Girls 16-18")}
${tr("H&eacute;ctor", "Nu&ntilde;ez", "M&eacute;xico", "Boys 16-18")}
${tr("Fulano", "Tal", "USA", "Boys 19 &amp; 20")}
</table>`;

describe("parseAceites", () => {
  const r = parseAceites(HTML);
  it("lê a data de publicação", () => {
    expect(r.publicado).toBe("2026-11-16");
    expect(dataPublicada("nada")).toBeNull();
  });
  it("uma linha por jogador, nome «Apelido, Nome», país ISO-2", () => {
    expect(r.jogadores[0]).toEqual({ first: "Gianluca", last: "Giudice", name: "Giudice, Gianluca", country: "ZA", division: "Boys 7 & Under" });
    expect(r.jogadores[1].name).toBe("Lundwright, D'annah");
    expect(r.jogadores[1].country).toBe("US");
  });
  it("país que não se reconhece fica vazio, com o texto original", () => {
    const smith = r.jogadores.find((j) => j.last === "Smith");
    expect(smith.country).toBe("");
    expect(smith.countryRaw).toBe("33166");
  });
  it("entidades com nome (&eacute; &ntilde;) viram letras acentuadas", () => {
    const h = r.jogadores.find((j) => j.first === "Héctor");
    expect(h.name).toBe("Nuñez, Héctor");
    expect(h.country).toBe("MX");
  });
  it("região italiana no lugar do país → Itália", () => {
    expect(r.jogadores.find((j) => j.last === "Gherardi").country).toBe("IT");
  });
  it("gralha provada: Henry Sokol «Boys 14 & 16» → Boys 14 & 15, com o original guardado", () => {
    const h = r.jogadores.find((j) => j.last === "Sokol");
    expect(h.division).toBe("Boys 14 & 15");
    expect(h.divisionRaw).toBe("Boys 14 & 16");
  });
  it("escalão que não existe e não tem correcção provada → ignorado, nunca adivinhado", () => {
    expect(r.jogadores.some((j) => j.last === "Tal")).toBe(false);
    expect(r.ignorados.some((l) => l.includes("Boys 19 & 20"))).toBe(true);
  });
});

describe("paisIso", () => {
  it("as grafias da lista de 2026", () => {
    for (const s of ["USA", "Usa", "US", "Us", "united states", "United State", "United States of America"]) expect(paisIso(s)).toBe("US");
    expect(paisIso("México")).toBe("MX");
    expect(paisIso("CA")).toBe("CA");
    expect(paisIso("Brasil")).toBe("BR");
    expect(paisIso("Deutschland")).toBe("DE");
    expect(paisIso("Republica Dominicana")).toBe("DO");
    expect(paisIso("PANAMA")).toBe("PA");
  });
});

describe("juntarAceites / manterAceites", () => {
  const { jogadores } = parseAceites(HTML);
  const base = { tournament: "2026 Doral", year: 2026, divisions: [] };
  const comLista = juntarAceites(base, jogadores);
  it("cria um escalão por cada um da lista, na ordem do Doral, sem resultados", () => {
    expect(comLista.divisions.map((d) => d.division)).toEqual(["Boys 7 & Under", "Boys 14 & 15", "Boys 16-18", "Girls 8 & 9", "Girls 16-18"]);
    expect(comLista.divisions.every((d) => d.players.length === 0)).toBe(true);
    expect(comLista.divisions[1].accepted.map((p) => p.name)).toEqual(["Sokol, Henry", "Smith, Jack", "Gherardi, Luigi"]);
  });
  it("os resultados novos não apagam a lista, as datas nem os escalões ainda sem leaderboard", () => {
    const ant = { ...comLista, startDate: "2026-12-20", endDate: "2026-12-23" };
    const novo = { tournament: "2026 Doral", year: 2026, divisions: [{ division: "Boys 14 & 15", name: "Boys 14 & 15 Division", players: [{ name: "Sokol, Henry", total: 150 }] }] };
    const r = manterAceites(ant, novo);
    expect(r.startDate).toBe("2026-12-20");
    const b14 = r.divisions.find((d) => d.division === "Boys 14 & 15");
    expect(b14.players).toHaveLength(1);
    expect(b14.accepted).toHaveLength(3);
    expect(r.divisions.map((d) => d.division)).toContain("Girls 16-18");
  });
  it("sem ficheiro anterior fica o novo", () => {
    expect(manterAceites(null, base)).toBe(base);
  });
});
