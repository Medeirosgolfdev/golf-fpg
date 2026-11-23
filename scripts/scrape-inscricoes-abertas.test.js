import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { parseLista, parseTournAdmissions } = require("./scrape-inscricoes-abertas.js");

// HTML real da lista do Palheiro (059), 23/11/2026, encurtado.
const LISTA_059 = `<table class="tablelist">
<tr class="asp_linhaCabecalho"><td>Data</td><td>Torneio</td><td>Estado</td></tr>
<tr><td align="center">2026-11-28</td><td align="left"><a href="tourn_admissions.asp?club=059&tourn=10656&ack=XH256YF45T">Torneio Loja do Vinho Monthly Medal Novembro 2026</a></td><td>Em curso</td></tr>
<tr class="asp_linhapar"><td>2026-12-05</td><td><a href="tourn_admissions.asp?club=059&tourn=10663&ack=XH256YF45T">Loja do Vinho Monthly Stableford Dezembro 2026</a></td><td>Em curso</td></tr>
</table>`;

describe("scrape-inscricoes-abertas — parseLista", () => {
  it("lê data, tcode e nome de cada linha (sem o cabeçalho)", () => {
    expect(parseLista(LISTA_059)).toEqual([
      { tcode: "10656", data: "2026-11-28", nome: "Torneio Loja do Vinho Monthly Medal Novembro 2026" },
      { tcode: "10663", data: "2026-12-05", nome: "Loja do Vinho Monthly Stableford Dezembro 2026" },
    ]);
  });
  it("«Nenhum Torneio disponivel» → lista vazia", () => {
    expect(parseLista("<H4>Inscrições em Torneios</H4> Nenhum Torneio disponivel")).toEqual([]);
  });
  it("resposta estranha é erro, nunca «vazio»", () => {
    expect(() => parseLista("<html>Key not authorized</html>")).toThrow(/inesperada/);
  });
});

describe("scrape-inscricoes-abertas — parseTournAdmissions", () => {
  it("tira nome e data (dd/mm/aaaa → aaaa-mm-dd) dos rótulos da página", () => {
    const html = `<span id="lblTdesc">Campeonato Absoluto da Madeira</span><span id="lbldt">28/11/2026</span>`;
    expect(parseTournAdmissions(html)).toEqual({ nome: "Campeonato Absoluto da Madeira", data: "2026-11-28" });
  });
  it("sem nome → null", () => {
    expect(parseTournAdmissions("<span id=\"lbldt\">28/11/2026</span>")).toBeNull();
  });
});
