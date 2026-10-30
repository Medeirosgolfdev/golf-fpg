/**
 * scrape-fvg.js — calendário do fvgolf.com e os três formatos de PDF de
 * resultados (itens com coordenadas, como os devolve o pdf-parse).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { lerCalendario, lerClassificacoes } = require("./scrape-fvg.js");

/** Linhas [y, [[x, texto], …]] → itens do pdf-parse. */
const itens = (linhas) => linhas.flatMap(([y, cols]) => cols.map(([x, s]) => ({ s, x, y, p: 0 })));

describe("FVG — calendário (admin-ajax)", () => {
  it("uuid, datas, nome, categoria e campo", () => {
    const html = `<tbody><tr><td colspan="7" class="aC mes-listado">Julio 2026</td></tr>
      <tr data-uuid="d891d8ff-10a5-11f1-afa6-506b4bb1f79e"><td>02/07/2026</td><td>03/07/2026</td>
      <td><a href="https://www.fvgolf.com/torneo/d891d8ff-10a5-11f1-afa6-506b4bb1f79e/i-puntuable-zonal-juvenil">I PUNTUABLE ZONAL JUVENIL</a></td>
      <td>Sub-16</td><td><span>BASOZABAL</span></td><td></td></tr></tbody>`;
    expect(lerCalendario(html)).toEqual([{
      uuid: "d891d8ff-10a5-11f1-afa6-506b4bb1f79e", desde: "02/07/2026", ate: "03/07/2026",
      url: "https://www.fvgolf.com/torneo/d891d8ff-10a5-11f1-afa6-506b4bb1f79e/i-puntuable-zonal-juvenil",
      name: "I PUNTUABLE ZONAL JUVENIL", categoria: "Sub-16", campo: "BASOZABAL",
    }]);
  });
});

describe("FVG — classificações em PDF", () => {
  it("formato da federação: ±par por volta → pancadas, par tirado de STRS − TOT", () => {
    const b = lerClassificacoes(itens([
      [730, [[30, "RESULTADOS CADETE MASCULINO"]]],
      [712, [[30, "POS"], [58, "LICENCIA"], [108, "CATEG."], [157, "NOMBRE"], [379, "TOT"], [398, "STR"], [423, "S"], [439, "HCE"], [468, "HCJ"], [495, "R1"], [516, "R2"], [537, "R3"], [559, "R4"]]],
      [697, [[37, "1"], [50, "VB04729016"], [106, "Cadete"], [156, "JAIME ORMAZABAL IGUAL"], [382, "+5"], [401, "149"], [422, "M"], [441, "3.8"], [473, "5"], [495, "+3"], [516, "+2"]]],
      [686, [[37, "2"], [50, "VB01727018"], [106, "Cadete"], [156, "JULEN ORTIZ RODRIGUEZ"], [379, "+12"], [401, "156"], [422, "M"], [440, "-0.6"], [473, "0"], [495, "+7"], [516, "+5"]]],
    ]));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ categoria: "Cadete", sexo: "M", parRonda: 72, nRounds: 2, noveBuracos: false, fora: false });
    expect(b[0].players[0]).toMatchObject({ pos: 1, licencia: "VB04729016", name: "JAIME ORMAZABAL IGUAL", toPar: 5, total: 149, rounds: [75, 74], hcp: 3.8 });
    expect(b[0].players[1].rounds).toEqual([79, 77]);
  });

  it("formato Laukariz/Vizcaya: a posição perto da licença e o «G» do vencedor não contam", () => {
    const b = lerClassificacoes(itens([
      [334, [[170, "ALEVIN FEMENINO"]]],
      [319, [[53, "Pos"], [75, "Licencia"], [139, "Nombre"], [321, "Hp"], [345, "Nivel"], [375, "Sex"], [418, "Total"]]],
      [305, [[66, "1"], [75, "VB09729055"], [139, "GUTIERREZ ROCO, NAHIA"], [325, "7"], [354, "A"], [380, "F"], [402, "8"], [424, "84"], [454, "G"]]],
      [290, [[75, "VB09729472"], [139, "BILBAO ERVITI, SOFIA"], [317, "20,8"], [354, "A"], [380, "F"], [399, "24"], [424, "84"]]],
    ]));
    expect(b[0]).toMatchObject({ categoria: "Alevín", sexo: "F", nRounds: 1 });
    expect(b[0].players.map((p) => [p.pos, p.total, p.hcp])).toEqual([[1, 84, 7], [1, 84, 20.8]]);
  });

  it("formato dos clubes (nome antes da licença); 9 buracos e hándicap marcados", () => {
    const cab = [[15, "Pos"], [40, "Nombre"], [310, "Licencia"], [395, "Hex"], [428, "NVH"], [460, "Niv"], [482, "Sex"], [507, "Cat."], [537, "Hpu"], [565, "Tot"]];
    const linha = (y, pos, nome, lic, tot) => [y, [[17, pos], [42, nome], [312, lic], [397, "18.6"], [464, "A"], [487, "M"], [513, "4"], [549, "7"], [572, tot]]];
    const scratch = lerClassificacoes(itens([
      [747, [[15, "Clasificación  Scratch Masculina Acumulada (ASC: 0)"], [521, "1ª Vuelta"]]], [728, cab],
      linha(710, "1", "ALTUNA MIRALLES, ALAN", "VB03730627", "75"), linha(695, "2", "EL KHOULY, TELMO", "VB09730246", "80"),
    ]))[0];
    expect(scratch).toMatchObject({ categoria: "Alevín", sexo: "M", noveBuracos: false, fora: false });
    expect(scratch.players[0]).toMatchObject({ pos: 1, name: "ALTUNA MIRALLES, ALAN", licencia: "VB03730627", total: 75, rounds: [75] });
    const nove = lerClassificacoes(itens([[747, [[15, "ALEVIN B MASCULINO"]]], [728, cab], linha(710, "1", "X, Y", "VB03730627", "38"), linha(695, "2", "Z, W", "VB09730246", "41")]))[0];
    expect(nove.noveBuracos).toBe(true);
    const hcp = lerClassificacoes(itens([[747, [[15, "INFANTIL HCP JUVENIL (ASC: 0)"]]], [728, cab], linha(710, "1", "X, Y", "VB03730627", "75")]))[0];
    expect(hcp.fora).toBe(true);
  });
});
