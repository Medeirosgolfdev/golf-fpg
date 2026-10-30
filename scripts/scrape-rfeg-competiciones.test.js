/**
 * scrape-rfeg-competiciones.js — leitura do calendário e da página da prova do
 * site novo da RFEG (HTML recortado das páginas reais de 30/10/2026) e o
 * casamento com os rfegolf-resultats que já existiam.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { linhasCalendario, lerPagina, ehJuvenil, casar, nomeBase, agendaGolfBox, casarAgenda } = require("./scrape-rfeg-competiciones.js");

describe("calendário do GolfBox (ids antes de a página da RFEG os ligar)", () => {
  const agenda = agendaGolfBox({ CompetitionData: { S2027: { Months: {
    M2: { Entries: {
      E769: { ID: 769, Name: "PUNTUABLE NACIONAL JUVENIL FEMENINO", StartDate: "20270205T000000" },
      E777: { ID: 777, Name: "PUNTUABLE NACIONAL JUVENIL MASCULINO", StartDate: "20270205T000000" },
    } },
    M6: { Entries: { E784: { ID: 784, Name: "CAMPEONATO DE ESPAÑA BENJAMÍN, ALEVÍN E INFANTIL \"Mem. Juan Andreu\"", StartDate: "20270625T000000" } } },
    M10: { Entries: { E813: { ID: 813, Name: "CAMPEONATO DE ESPAÑA DE FFAA INFANTIL \"Mem. Blanca Mayor\"", StartDate: "20271009T000000" } } },
  } } } });
  it("lê as provas da época", () => {
    expect(agenda.map((a) => a.id)).toEqual([769, 777, 784, 813]);
    expect(agenda[0].iniIso).toBe("2027-02-05");
  });
  it("mesmo dia + mesmas palavras; Masculino nunca casa com Femenino", () => {
    expect(casarAgenda(agenda, "Puntuable Nacional Juvenil Masculino 2027", "2027-02-05").id).toBe(777);
    expect(casarAgenda(agenda, "Puntuable Nacional Juvenil Femenino 2027", "2027-02-05").id).toBe(769);
    expect(casarAgenda(agenda, "Campeonato de España Infantil, Alevín y Benjamín 2027", "2027-06-25").id).toBe(784);
  });
  it("uma palavra em comum não chega (P&P × Match Cuadrangular, 30/10/2026)", () => {
    const ag = [{ id: 126, nome: "CAMPEONATO DE ESPAÑA MASCULINO P&P", iniIso: "2026-03-07" }];
    expect(casarAgenda(ag, "Match Cuadrangular Sub-18 Masculino 2026", "2026-03-06")).toBeNull();
  });
  it("aceita 1 dia de diferença, não mais", () => {
    expect(casarAgenda(agenda, "Campeonato de España de FFAA Infantil \"Mem. Blanca Mayor\" 2027", "2027-10-10").id).toBe(813);
    expect(casarAgenda(agenda, "Puntuable Nacional Juvenil Masculino 2027", "2027-02-08")).toBeNull();
  });
});

const CAL = `<div class="wpe-mes-body"> <a href="https://rfegolf.es/competicion/campeonato-de-espana-sub-16-masculino" class="wpe-fila-evento" data-id="158989" data-titulo="campeonato de españa sub-16 masculino 2026" data-sede="infinitum" data-estado="finalizado" data-inicio="2026-05-01" data-mes-grupo="2026-05" data-comite="comité juvenil"> <div class="wpe-fila-fecha"><span class='wpe-mes'>MAY</span></div> <div class="wpe-fila-info"> <span class="wpe-fila-titulo">Campeonato de España Sub-16 Masculino 2026</span></div></a>
<a href="https://rfegolf.es/competicion/campeonato-de-espana-absoluto-masculino" class="wpe-fila-evento" data-id="158001" data-titulo="campeonato de españa absoluto masculino 2026" data-sede="x" data-estado="finalizado" data-inicio="2026-06-01" data-comite="comité masculino"><span class="wpe-fila-titulo">Campeonato de España Absoluto Masculino 2026</span></a>
<a href="https://rfegolf.es/competicion/internacional-de-belgica-sub-14-2026" class="wpe-fila-evento" data-id="158100" data-titulo="internacional de bélgica sub 14 2026" data-sede="y" data-estado="finalizado" data-inicio="2026-07-02" data-comite=""><span class="wpe-fila-titulo">Internacional de Bélgica Sub 14 2026</span></a></div>`;

const PAGINA = `<div class="wpe-ficha-hero-fechas"> <div><span>Inscripción</span><strong>09/09/2026 — 29/09/2026</strong></div> <div><span>Competición</span><strong>11/10/2026 — 14/10/2026</strong></div> </div> </div> <div class="wpe-ficha-hero-inner"> <h1>Campeonato de España de FFAA Infantil 2026 &quot;XIV Memorial Blanca Mayor&quot;</h1> <p class="wpe-ficha-sede"> <svg><path d="M21"/></svg> Campo de Golf Balneario de Mondariz </p> </div>
<button type="button" class="wpe-fase-tab wpe-fase-tab--active" data-fase-id="general" data-cid="551"></button><button type="button" class="wpe-fase-tab" data-fase-id="f1" data-cid="660"></button>
<iframe src="https://rfegolf.es/wpgb-golfbox/?url=https%3A%2F%2Fscores.golfbox.es%2Fapi%2Fjs%2Fleaderboard%2Fcompetitionid%2F551%2Flanguage%2F1034"></iframe>`;

describe("calendário do site novo", () => {
  const linhas = linhasCalendario(CAL);
  it("lê as linhas com os atributos data-*", () => {
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toMatchObject({ id: "158989", inicio: "2026-05-01", comite: "comité juvenil", nome: "Campeonato de España Sub-16 Masculino 2026" });
  });
  it("fica o comité juvenil e os títulos juvenis de outros comités", () => {
    expect(linhas.filter(ehJuvenil).map((l) => l.id)).toEqual(["158989", "158100"]);
  });
});

describe("página da prova", () => {
  const p = lerPagina(PAGINA);
  it("nome com entidades, campo e datas", () => {
    expect(p.nome).toBe('Campeonato de España de FFAA Infantil 2026 "XIV Memorial Blanca Mayor"');
    expect(p.campo).toBe("Campo de Golf Balneario de Mondariz");
    expect(p.competicao).toEqual({ ini: "11/10/2026", fim: "14/10/2026" });
    expect(p.inscricao).toEqual({ ini: "09/09/2026", fim: "29/09/2026" });
  });
  it("ids GolfBox de todas as fases, sem repetir o do embed", () => {
    expect(p.cids).toEqual([551, 660]);
  });
});

describe("casamento com os ficheiros antigos", () => {
  const ex = [
    { compId: 16179, wpId: null, nome: "campeonato de espana sub 16 masculino 2026", base: nomeBase("Campeonato de España Sub 16 Masculino 2026"), ano: 2026, ini: "2026-05-01" },
    { compId: 15100, wpId: null, nome: "campeonato de espana sub 16 masculino 2025", base: nomeBase("Campeonato de España Sub 16 Masculino 2025"), ano: 2025, ini: "2025-05-02" },
  ];
  it("mesmo nome (pontuação à parte) e ano → o ficheiro antigo", () => {
    expect(casar(ex, 158989, "Campeonato de España Sub-16 Masculino 2026", "2026-05-01").compId).toBe(16179);
  });
  it("a edição de outro ano não casa", () => {
    expect(casar(ex, 170000, "Campeonato de España Sub-16 Masculino 2027", "2027-04-30")).toBeNull();
  });
});
