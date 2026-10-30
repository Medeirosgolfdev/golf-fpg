/**
 * scrape-fed-pdfs.js e scripts/lib/pdf-classificacoes.js — os formatos de PDF
 * da Navarra, Castela-La Mancha e Rioja (itens com coordenadas, como os devolve
 * o pdf-parse; valores tirados dos PDFs reais de 2025-2026).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { lerClassificacoes, juntarClassificacoes } = require("./lib/pdf-classificacoes.js");
const { lerFng, nomeClm, gruposDeDatas } = require("./scrape-fed-pdfs.js");

/** Linhas [y, [[x, texto], …]] → itens do pdf-parse. */
const itens = (linhas) => linhas.flatMap(([y, cols]) => cols.map(([x, s]) => ({ s, x, y, p: 0 })));

describe("Castela-La Mancha — «Puesto Jugador Licencia … Golpes»", () => {
  const cab = [[47, "Puesto"], [116, "Jugador"], [195, "Licencia"], [284, "Club"], [354, "HEX"], [379, "NHEX"], [410, "HPU"], [445, "Cat."], [478, "Género"], [518, "Golpes"]];
  const linha = (y, pos, nome, lic, cat, sx, tp, g) => [y, [[57, pos], [80, nome], [189, lic], [275, "Layos Golf"], [357, "0.5"], [385, "0.5"], [416, "3"], [439, cat], [488, sx], [518, tp], [528, g]]];
  const pdf = itens([
    [800, [[67, "VII TPR JUVENIL - III TPR ESCUELAS - TORNEO HÁNDICAP NACIONAL 18 HOYOS"]]],
    [780, [[79, "Campo"], [213, "Modalidad"], [383, "Fecha"], [489, "Jugadores"]]],
    [770, [[74, "Layos Golf"], [193, "Stroke play - Individual"], [364, "16/05/2026 10:00"], [503, "20"]]],
    [750, [[43, "Scratch"]]],
    [735, cab],
    linha(720, "1", "Cañizares Del Moral, David", "8818911265", "JUNIOR", "M", "+6", "(78)"),
    linha(705, "2", "Rincon Parra, Rodrigo", "8820775704", "MAYOR", "M", "+8", "(80)"),
    linha(690, "3", "Fajardo Segovia, Manuel", "8819936930", "CADETE", "M", "+11", "(83)"),
    linha(675, "4", "Garcia Burgos, Jaime", "8828945473", "CADETE", "M", "+12", "(84)"),
    linha(660, "11", "Diaz Jiménez, Sofia", "8828322659", "INFANTIL", "F", "+16", "(88)"),
    [600, [[67, "VII TPR JUVENIL - TORNEO INICIACIÓN - 9 HOYOS"]]],
    [580, [[79, "Campo"], [213, "Modalidad"], [383, "Fecha"], [489, "Jugadores"]]],
    [570, [[74, "Layos Golf"], [193, "Stableford - Individual"], [364, "15/05/2026 11:00"], [503, "29"]]],
    [550, [[43, "Categoría única"]]],
    [535, [[47, "Puesto"], [116, "Jugador"], [195, "Licencia"], [284, "Club"], [354, "HEX"], [478, "Género"], [518, "Puntos"]]],
    [520, [[57, "1"], [80, "Martin Garcia, David Takeshi"], [189, "8810497080"], [275, "Cabanillas"], [357, "48.0"], [488, "M"], [518, "30"]]],
  ]);

  it("pancadas entre parênteses, ±par na coluna Golpes, campo e data da linha «Campo Modalidad Fecha»", () => {
    const [b, nove] = lerClassificacoes(pdf);
    expect(b).toMatchObject({ titulo: "Scratch", campo: "Layos Golf", fecha: "2026-05-16", parRonda: 72, fora: false, noveBuracos: false });
    expect(b.players[0]).toMatchObject({ pos: 1, name: "Cañizares Del Moral, David", licencia: "8818911265", catEdad: "Junior", sexo: "M", total: 78, rounds: [78], toPar: 6, club: "Layos Golf" });
    expect(nove.fora || nove.noveBuracos).toBe(true);   // Stableford, 9 buracos de iniciação
  });

  it("a scratch geral divide-se por escalão e sexo (posição pela ordem do PDF); adultos e 9 buracos saem", () => {
    const blocos = lerClassificacoes(pdf).map((b) => ({ ...b, pdfUrl: "https://x/vii-01-2026.pdf" }));
    const { results } = juntarClassificacoes(blocos, ["https://x/vii-01-2026.pdf"]);
    expect(results.map((r) => [r.label, r.players.map((p) => [p.pos, p.total])])).toEqual([
      ["Infantil Femenino", [[1, 88]]],
      ["Cadete Masculino", [[1, 83], [2, 84]]],
      ["Junior Masculino", [[1, 78]]],
    ]);
  });

  it("duas voltas: «1º Vuelta 2º Vuelta Total» com «-2 (70)»", () => {
    const [b] = lerClassificacoes(itens([
      [750, [[43, "Scratch"]]],
      [735, [[45, "Puesto"], [106, "Jugador"], [174, "Licencia"], [273, "Club"], [358, "HEX"], [419, "Cat."], [441, "Género"], [465, "1º Vuelta"], [494, "2º Vuelta"], [530, "Total"]]],
      [720, [[52, "1"], [68, "Huang Xu , Chloe"], [169, "CM07979315"], [240, "CLUB DE GOLF LOMAS BOSQUE"], [360, "0.6"], [412, "INFANTIL"], [449, "F"], [469, "-2"], [474, "(70)"], [497, "+1"], [504, "(73)"], [527, "-1"], [532, "(143)"]]],
    ]));
    expect(b.players[0]).toMatchObject({ name: "Huang Xu, Chloe", rounds: [70, 73], total: 143, toPar: -1, sexo: "F" });
    expect(b.nRounds).toBe(2);
  });
});

describe("Navarra", () => {
  it("«Tot 1ª 2ª»: o total e as voltas pelas posições (o Hpu fica perto de «Tot»)", () => {
    const [b] = lerClassificacoes(itens([
      [747, [[15, "Clasificación  Scratch Femenina Acumulada (ASC: 0)"], [521, "2ª Vuelta"]]],
      [728, [[15, "Pos"], [38, "Nombre"], [287, "Licencia"], [363, "Hex"], [392, "NVH"], [421, "Niv"], [440, "Sex"], [463, "Cat."], [489, "Hpu"], [513, "Tot"], [550, "1ª"], [576, "2ª"]]],
      [710, [[17, "1"], [40, "ALICIA SAENZ DE SANTAMARIA KHOTKO"], [289, "1106478321"], [365, "18,5"], [425, "A"], [446, "F"], [469, "4"], [495, "21"], [515, "188"], [546, "93"], [572, "95"]]],
      [695, [[17, "2"], [40, "LOLA MOSQUERA FERNANDEZ"], [289, "RL04965985"], [365, "30,2"], [425, "B"], [446, "F"], [469, "5"], [495, "33"], [515, "203"], [541, "101"], [566, "102"]]],
      [680, [[40, "EMMA REIMONDEZ MAGALLON"], [289, "0102990523"], [365, "26,3"], [425, "A"], [446, "F"], [469, "4"], [495, "29"], [515, "203"], [541, "101"], [566, "102"]]],
    ]));
    expect(b.players.map((p) => [p.pos, p.total, p.rounds])).toEqual([[1, 188, [93, 95]], [2, 203, [101, 102]], [2, 203, [101, 102]]]);
    expect(b).toMatchObject({ sexo: "F", nRounds: 2, noveBuracos: false });
  });

  it("programa do Gorraiz: colunas coladas, clube colado ao nome comprido", () => {
    const [b] = lerClassificacoes(itens([
      [760, [[65, "PUNTUABLE ZONAL 2025 SUB-14"]]],
      [745, [[14, "INDIVIDUAL - Medalplay   (Recorrido: Gorraiz)"], [388, "FECHA: 10/05/2025  CODIGO: 440225312"]]],
      [730, [[14, "SUB-14 MASCULINA (ASC: 0)"], [521, "1ªVuelta"]]],
      [715, [[14, "POS JUGADOR"], [201, "CLUB"], [295, "HEX NVH"], [349, "NIV"], [378, "S"], [392, "Cat Hpu"], [442, "1ª  2ª  3ª  4ª  TOT"]]],
      [700, [[25, "1"], [39, "ACEREDA RUPEREZ,TELMO"], [201, "GORRAIZ"], [295, "3,9"], [356, "M  M  1  5"], [442, "77  78"], [543, "155"]]],
      [685, [[25, "2"], [39, "MATEO SANCHEZ,ISMAEL"], [201, "LA PEÑAZA"], [295, "3,5"], [356, "M  M  1  5"], [442, "78  79"], [543, "157"]]],
      [670, [[25, "3"], [39, "LAHOZ MARQUESAN,ALEJANDRO LA PEÑAZA"], [295, "3,6"], [356, "M  M  1  5"], [442, "78  80"], [543, "158"]]],
    ]));
    expect(b).toMatchObject({ categoria: "Sub-14", sexo: "M", nRounds: 2, fecha: "2025-05-10", evento: "PUNTUABLE ZONAL 2025 SUB-14" });
    expect(b.players.map((p) => [p.pos, p.name, p.club, p.rounds, p.total])).toEqual([
      [1, "ACEREDA RUPEREZ,TELMO", "GORRAIZ", [77, 78], 155],
      [2, "MATEO SANCHEZ,ISMAEL", "LA PEÑAZA", [78, 79], 157],
      [3, "LAHOZ MARQUESAN,ALEJANDRO", "LA PEÑAZA", [78, 80], 158],
    ]);
  });

  it("página de classificações: cada título leva os PDFs que se lhe seguem", () => {
    const html = `<h3>II PUNTUABLE ZONAL ZONA 9 2026</h3><a href="https://fnavarragolf.com/wp-content/uploads/2026/04/Clasificacion-final-sub-12-masculina.pdf">x</a>
      <a href="https://fnavarragolf.com/wp-content/uploads/2026/04/Clasificacion-final-cadete-femenina.pdf">y</a>
      <h3>7ª PRUEBA LIGA JUNIOR FNG 2026</h3><a href="https://fnavarragolf.com/wp-content/uploads/2026/04/Clasificacion-masculina-9-HOYOS-gorraiz.pdf">z</a>`;
    expect(lerFng(html).map((p) => [p.name, p.pdfs.length])).toEqual([["II PUNTUABLE ZONAL ZONA 9 2026", 2], ["7ª PRUEBA LIGA JUNIOR FNG 2026", 1]]);
  });
});

describe("Rioja — formato da federação sem licença", () => {
  it("só pelo nome, ±par por volta → pancadas", () => {
    const [b] = lerClassificacoes(itens([
      [780, [[118, "I PUNTUABLE ZONAL JUVENIL - Jornada 2"]]],
      [765, [[30, "Individual - Stroke Play"], [415, "Fecha:"], [459, "12-abr-2026, 10:00"]]],
      [750, [[30, "RESULTADOS SUB -12 MASCULINO"]]],
      [735, [[30, "POS"], [58, "NOMBRE"], [378, "TOT"], [398, "STR"], [423, "S"], [438, "HCE"], [467, "HCJ"], [494, "R1"], [515, "R2"], [536, "R3"], [558, "R4"]]],
      [720, [[36, "1"], [50, "YAGO GONZALEZ TARRIO"], [377, "+27"], [400, "171"], [422, "M"], [438, "16.4"], [470, "14"], [491, "+12"], [513, "+15"]]],
      [705, [[36, "2"], [50, "ARTURO MADORRAN CRESPO"], [377, "+35"], [400, "179"], [422, "M"], [438, "18.4"], [470, "16"], [491, "+15"], [513, "+20"]]],
      [690, [[36, "1 of 1"]]],
    ]));
    expect(b).toMatchObject({ categoria: "Sub-12", sexo: "M", parRonda: 72, fecha: "2026-04-12" });
    expect(b.players.map((p) => [p.licencia, p.name, p.rounds, p.total])).toEqual([[null, "YAGO GONZALEZ TARRIO", [84, 87], 171], [null, "ARTURO MADORRAN CRESPO", [87, 92], 179]]);
  });
});

describe("scrape-fed-pdfs — notícias e datas", () => {
  it("nome da prova a partir do título da notícia da FGCLM", () => {
    expect(nomeClm("RESULTADOS &#8211; IX Puntuable Ranking Juvenil de Castilla La Mancha 2026")).toBe("IX Puntuable Ranking Juvenil de Castilla La Mancha 2026");
    expect(nomeClm("Dominio madrileño en el II Puntuable Zonal Juvenil de Madrid - Castilla La Mancha 2026")).toBe("II Puntuable Zonal Juvenil de Madrid - Castilla La Mancha 2026");
    expect(nomeClm("Manuel Fajardo y Martina Gutiérrez estrenan el listado de victorias")).toBeNull();
  });

  it("dias seguidos ficam juntos; jornadas noutra semana separam-se", () => {
    expect(gruposDeDatas(["2026-04-19", "2026-04-18", "2026-04-18"])).toEqual([["2026-04-18", "2026-04-19"]]);
    expect(gruposDeDatas(["2025-04-24", "2025-04-03"])).toEqual([["2025-04-03"], ["2025-04-24"]]);
  });
});
