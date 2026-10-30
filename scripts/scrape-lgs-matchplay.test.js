/**
 * scrape-lgs-matchplay.js — leitura das páginas de match play do mitarjeta
 * (HTML recortado do CE de FFAA Infantil 2026, torneio 393).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { lerDia, lerJogos, lerClassificacao, nomeJogador } = require("./scrape-lgs-matchplay.js");

const DIA = `<h4>Día 4 - Final</h4> <div class="division"> <h5>1º Flight</h5> <table class="cruces"> <tr> <td class="logoc"><img src="/img/banderas/territoriales/13mini.png" /></td> <td class="comunidad"><h6>Castilla y León</h6></td> <td class="resultado"><a href="/partidos/view/393/1461">2 - 3</a></td> <td class="logoc"><img src="/img/banderas/territoriales/9mini.png" /></td> <td class="comunidad"><h6>País Vasco</h6></td> <td class="rank"><a href="/partidos/view/393/1461">3 y 4 Puesto</a></td> <td class="cruceinfo"><a href="/partidos/view/393/1461" class="button_final">Final</a></td> </tr> <tr> <td class="logoc"></td> <td class="comunidad"><h6>Andalucía</h6></td> <td class="resultado"><a href="/partidos/view/393/1462">2 - 3</a></td> <td class="logoc"></td> <td class="comunidad"><h6>Madrid</h6></td> <td class="rank"><a href="/partidos/view/393/1462">1 - 2 Puesto</a></td> </tr> </table> </div> <div class="division"> <h5>2º Flight</h5> <table class="cruces"> <tr> <td class="comunidad"><h6>Pdo. Asturias</h6></td> <td class="resultado"><a href="/partidos/view/393/1466">3.5 - 1.5</a></td> <td class="comunidad"><h6>Baleares</h6></td> <td class="rank"><a href="/partidos/view/393/1466">9 y 10 Puestos</a></td> </tr> </table> </div>`;

const PARTIDO = `<table class="partidosi"> <tr> <td colspan="6" style="padding: 0"><div class="division"><h5>Foursomes</h5></div></td> </tr> <tr class="partidoi altrow odd"> <td class="partidon"><strong>1</strong></td> <td class="right comunidad perdedor"> <h6 class="foursome"><a href="/partido/7126" class="ficha">MARTIN ALVAREZ, LUCAS</a></h6> <h6 class="foursome"><a href="/partido/7126" class="ficha">LATT, MARCUS</a></h6> </td> <td class="gana1"></td> <td class="as"></td> <td class="gana2 right"><div class="inputpartido">5/4</div></td> <td class="comunidad ganador"> <h6 class="foursome"><a href="/partido/7126" class="ficha">RONA BASELGA, MIGUEL</a></h6> <h6 class="foursome"><a href="/partido/7126" class="ficha">BARRA MORRIS, LUCAS</a></h6> </td> </tr> <tr> <td></td> <td class="infopartido" colspan="5"> <p> <span>Hoyo: 14 -</span> <span class="updated">Actualizado: 17:48</span><br/> - Finalizado - </p> </td> </tr> <tr> <td colspan="6" style="padding: 0"><div class="division"><h5>Individuales</h5></div></td> </tr> <tr class="partidoi altrow odd"> <td class="partidon"><strong>2</strong></td> <td class="right comunidad ganador"> <h6 class="single"><a href="/partido/7129" class="ficha">TINEO VELAZQUEZ, PEDRO</a></h6> </td> <td class="gana1"><div class="inputpartido">1UP</div></td> <td class="as"></td> <td class="gana2 right"></td> <td class="comunidad perdedor"> <h6 class="single"><a href="/partido/7129" class="ficha">MATEU ALDERETE, ALVARO</a></h6> </td> </tr> <tr> <td></td> <td class="infopartido" colspan="5"> <p> <span>Hoyo: 18 -</span><br/> - Finalizado - </p> </td> </tr> <tr class="partidoi altrow odd"> <td class="partidon"><strong>3</strong></td> <td class="right comunidad "> <h6 class="single"><a href="/partido/7130" class="ficha">GOMEZ PONCE, LUCIA</a></h6> </td> <td class="gana1"></td> <td class="as"><div class="inputpartido">AS</div></td> <td class="gana2 right"></td> <td class="comunidad "> <h6 class="single"><a href="/partido/7130" class="ficha">HUANG XU, CHLOE</a></h6> </td> </tr> <tr> <td></td> <td class="infopartido" colspan="5"><p>Hoyo: 18 - Finalizado</p></td> </tr> </table>`;

describe("mitarjeta — match play por equipas", () => {
  it("um dia: flights, confrontos, resultado, disputa e id do encontro", () => {
    const d = lerDia(DIA, "Día 4 - Final");
    expect(d.flights.map((f) => f.flight)).toEqual(["1º Flight", "2º Flight"]);
    expect(d.flights[0].confrontos[1]).toEqual({ casa: "Andalucía", fora: "Madrid", resultado: "2 - 3", label: "1 - 2 Puesto", pid: 1462 });
    expect(d.flights[1].confrontos[0].resultado).toBe("3.5 - 1.5");
  });

  it("jogos: formato, jogadores, quem ganhou e por quanto, empate", () => {
    const j = lerJogos(PARTIDO);
    expect(j).toHaveLength(3);
    expect(j[0]).toMatchObject({ format: "foursome", result: "5/4", playedHoles: 14, isFinal: true });
    expect(j[0].home).toMatchObject({ players: ["Lucas Martin Alvarez", "Marcus Latt"], won: false });
    expect(j[0].away).toMatchObject({ players: ["Miguel Rona Baselga", "Lucas Barra Morris"], won: true, result: "5/4" });
    expect(j[1]).toMatchObject({ format: "single", result: "1UP" });
    expect(j[1].home.won).toBe(true);
    expect(j[2]).toMatchObject({ result: "AS" });
    expect(j[2].home.won || j[2].away.won).toBe(false);
  });

  it("classificação final e nomes «APELLIDOS, NOMBRE»", () => {
    const html = `<table cellpadding="0" class="resultadofinal"> <thead><tr><th>Pos.</th><th>Interterritorial</th></tr></thead> <tbody> <tr> <td><strong>1</strong></td> <td><strong>Madrid</strong></td> </tr> <tr> <td><strong>2</strong></td> <td><strong>Andalucía</strong></td> </tr> </tbody></table>`;
    expect(lerClassificacao(html)).toEqual([{ pos: 1, name: "Madrid" }, { pos: 2, name: "Andalucía" }]);
    expect(nomeJogador("DE LA MACORRA ESCOBAR, EDUARDO")).toBe("Eduardo De La Macorra Escobar");
  });
});
