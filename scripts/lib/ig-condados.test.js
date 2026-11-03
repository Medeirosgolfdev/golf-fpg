import { describe, it, expect } from "vitest";
import { limparNome, dataISO, parseHcp, lerCabecalho, divisoes, linhasSimples, linhasLeaderboard, lerCartao, eProvaJuniorCondado, escalao, semRonda, umaProvaPorVolta } from "./ig-condados.js";

// Recortes das páginas reais (Surrey U13 & U14, Lancashire 36 buracos, cartão do Harry Wang).
const SIMPLES = `<div class="global"><h3>U13 &amp; U14 County Championships</h3><h4>Monday 27th July 2026,  White Tees, Leatherhead</h4><p class='noprint' style=''></p><p style="font-size:small;">(95% handicap allowance)</p></div>
<a href="?tab=details&compid=856&division=1" class="button btn ">Under 14 Championship</a>
<table class="global table table-striped"><thead><tr><td colspan="2"> Results</td><td><a href="?tab=details&compid=4975&div=&sort=1&division=">Gross <span>[Click for Nett]</span></a></td></tr></thead><tr  class="odd"><td width="10%"><span class='results_position'>1st</span></td><td>  <a href="roundmgmt.php?playerid=86398">Harry Wang</a>(1)  <br><i>Wentworth</i><td><a href="viewround.php?roundid=59793" title="Countback results:
 Back 9 - 34.0000">71</a> <i></i></td></td></tr><tr  class="even"><td width="10%"><span class='results_position'>2nd</span></td><td>  <a href="roundmgmt.php?playerid=1">Tommy Hulance</a>(-3)  <br><i>Dartford</i><td><a href="viewround.php?roundid=5" >67</a> <i></i></td></td></tr><tr  class="odd"><td width="10%"><span class='results_position'></span></td><td>  <a href="roundmgmt.php?playerid=2">Joe Bloggs</a>(12)  <br><i>Effingham</i><td>NR <i></i></td></td></tr></table>`;

const LEADERBOARD = `<div class="global"><h3>Lancashire Boys County Championship Childwall GC - 36 hole</h3><h4>Sunday 24th May 2026, White Tees, Childwall</h4></div><table class="global table table-striped"><thead><tr><td colspan="3" class='leaderboardText'>Gross Leaderboard <a href="?compid=822&sort=0">switch</a></td><td class='rdetail'><a href='/competition.php?compid=820'>R1</a></td><td class='rdetail'><a href='/competition.php?compid=821'>R2</a></td><td>Total</td><td>Par</td></tr></thead><tr class="odd"><td class="poscol">1st</td> <td class='flagcol'></td> <td class="namecol">Thomas Prescott <i style='font-size:small;' class='courseName'>Manchester Golf Club</i> (-2)</td><td class='rdetail'><a href="viewround.php?roundid=35652" style='color:#CC0000;'>71</a></td><td class='rdetail'><a href="viewround.php?roundid=35748" style='color:#CC0000;'>70</a></td><td >141</td><td><span style='color:#CC0000;'>-3</span></td></tr><tr class="even"><td class="poscol">66th</td> <td class='flagcol'></td> <td class="namecol">Jude Baldwin <i style='font-size:small;' class='courseName'>Royal Birkdale Golf Club</i> (3)</td><td class='rdetail'><a href="viewround.php?roundid=35700">80</a></td><td class='rdetail'>WD</td><td >WD</td><td></td></tr></table>`;

const CARTAO = `<thead> <tr><td colspan="15">Harry Wang <i style='font-size:small;' class='courseName'>Wentworth</i> (1) <span style="font-size:small;">(95% allowance)</span>: U13 &amp; U14 County Championships <span style="font-size:small;">Monday 27th July 2026</span></td> <td style="font-size:small;text-align: right;" colspan="9">Leatherhead - White Tees</td> </tr></thead>
<tr class="holedata">
        <td  class="rowheader"><strong>Yards</strong></td><td class="yards odd">483</td><td class="yards">176</td><td><strong>659</strong></td><td class="lastcol">659</td></tr><tr class="holedata">
        <td  class="rowheader"><strong>SI</strong></td><td class="yards odd">18</td><td class="yards">8</td><td><strong>OUT</strong></td><td class="lastcol"><strong>TOTAL</strong></td></tr><tr class="holedata"><td class="rowheader"><strong>Par</strong></td><td class="holedata odd">5</td><td class="holedata">3</td><td><strong>8</strong></td><td class="lastcol">8</td></tr><tr class="holedata"><td class="rowheader"><strong>Score</strong></td><td class="odd"><span  class="birdie">4</span></td><td><span class="bogey">4</span></td><td><strong>8</strong></td><td class="lastcol">8</td></tr><tr><td class="finalres" colspan="22">Result: Gross 71</td></tr>`;

describe("datas e handicap", () => {
  it("«Monday 27th July 2026» → ISO", () => {
    expect(dataISO("Monday 27th July 2026")).toBe("2026-07-27");
    expect(dataISO("Sunday 1st March 2026,  White Tees")).toBe("2026-03-01");
    expect(dataISO("sem data")).toBeNull();
  });
  it("handicap de jogo: «-3» e «+3» são plus 3", () => {
    expect(parseHcp("-3")).toBe(-3);
    expect(parseHcp("+3")).toBe(-3);
    expect(parseHcp("12")).toBe(12);
    expect(parseHcp("1.1")).toBeNull();
  });
});

describe("lerCabecalho", () => {
  it("nome, data, tees, campo e percentagem", () => {
    expect(lerCabecalho(SIMPLES)).toMatchObject({ existe: true, nome: "U13 & U14 County Championships", data: "2026-07-27", tees: "White", campo: "Leatherhead", allowance: 95, pontos: false, leaderboard: false });
    expect(lerCabecalho(LEADERBOARD)).toMatchObject({ nome: "Lancashire Boys County Championship Childwall GC - 36 hole", data: "2026-05-24", leaderboard: true });
  });
  it("compid inexistente = «Login Required»", () => {
    expect(lerCabecalho("<title>Login Required - Kent Golf</title>")).toEqual({ existe: false });
  });
  it("Stableford em pontos", () => {
    expect(lerCabecalho(`<div class="global"><h3>Junior Stableford</h3><h4>Thursday 16th April 2026, White Tees, X</h4></div><td>Gross Points</td>`).pontos).toBe(true);
  });
});

describe("resultados", () => {
  it("formato de uma volta: posição, playerid, handicap de jogo, clube, roundid, gross; NR sem gross", () => {
    const l = linhasSimples(SIMPLES);
    expect(l).toHaveLength(3);
    expect(l[0]).toEqual({ pos: "1st", playerid: "86398", nome: "Harry Wang", hcp: 1, clube: "Wentworth", roundid: "59793", gross: 71, estado: null });
    expect(l[1]).toMatchObject({ nome: "Tommy Hulance", hcp: -3, gross: 67 });
    expect(l[2]).toMatchObject({ nome: "Joe Bloggs", gross: null, roundid: null, estado: "NR" });
    expect(divisoes(SIMPLES)).toEqual([{ n: "1", nome: "Under 14 Championship" }]);
    // na vista Gross o division= vem a meio do endereço (Lancashire)
    expect(divisoes(`<a href="?tab=details&compid=856&division=1&sort=2&sort=2" class="button btn  ">Under 14 Championship</a>`)).toEqual([{ n: "1", nome: "Under 14 Championship" }]);
  });
  it("leaderboard de várias voltas: rondas, voltas, total e ±par; WD", () => {
    const { rondas, linhas } = linhasLeaderboard(LEADERBOARD);
    expect(rondas).toEqual([{ compid: "820", nome: "R1" }, { compid: "821", nome: "R2" }]);
    expect(linhas[0]).toMatchObject({ pos: "1st", nome: "Thomas Prescott", clube: "Manchester Golf Club", hcp: -2, total: 141, toPar: -3, estado: null });
    expect(linhas[0].voltas).toEqual([{ roundid: "35652", gross: 71 }, { roundid: "35748", gross: 70 }]);
    expect(linhas[1]).toMatchObject({ nome: "Jude Baldwin", total: null, estado: "WD" });
  });
});

describe("limparNome", () => {
  it("sem alcunhas, marcas «(Jnr)» nem espaços a mais", () => {
    expect(limparNome("Ryan (Ryino)  Salisbury")).toBe("Ryan Salisbury");
    expect(limparNome("Hugh Harris (Jnr)")).toBe("Hugh Harris");
    expect(limparNome("Oscar  Ross")).toBe("Oscar Ross");
  });
});

describe("lerCartao", () => {
  it("jardas, SI, par, pancadas, tee e data (sem as colunas OUT/IN/TOTAL)", () => {
    expect(lerCartao(CARTAO)).toEqual({ par: [5, 3], si: [18, 8], dist: [483, 176], unidade: "jd", pancadas: [4, 4], tee: "White", data: "2026-07-27", gross: 71 });
  });
});

describe("que provas entram", () => {
  it("juniores sim; Stableford, pares, adultos e inscrições não", () => {
    expect(eProvaJuniorCondado("U13 & U14 County Championships")).toBe(true);
    expect(eProvaJuniorCondado("Lancashire Boys Under 16 & Under 14 Championships 2026")).toBe(true);
    expect(eProvaJuniorCondado("Junior Championship - Round 1")).toBe(true);
    expect(eProvaJuniorCondado("England Golf Northern Boys Qualifying at Sandmoor GC")).toBe(true);
    expect(eProvaJuniorCondado("Junior Stableford")).toBe(false);
    expect(eProvaJuniorCondado("Lohan Trophy 2026 (Women & Girls)")).toBe(false);
    expect(eProvaJuniorCondado("Kent Junior Foursomes 2026 (Boys & Girls) - Sign Up")).toBe(false);
    expect(eProvaJuniorCondado("Surrey Colts County Championship 2026")).toBe(false);
    expect(eProvaJuniorCondado("Surrey Boys Handicap Knockout 2026")).toBe(false);
  });
  it("escalão = sexo + a maior idade; «Round N» sai do nome", () => {
    expect(escalao("U13 & U14 County Championships")).toBe("U14");
    expect(escalao("Lancashire Boys Under 16 & Under 14 Championships 2026")).toBe("Boys U16");
    expect(escalao("Under 14 Championship")).toBe("U14");
    expect(escalao("Lancashire Golf Girls Spring Meeting")).toBe("Girls");
    expect(escalao("Junior Championship")).toBeNull();
    expect(escalao("Junior Summer Meeting - Medal (Girls & Boys)")).toBeNull();
    expect(semRonda("U17 & U18 Surrey County Championship  2026 Round 1")).toBe("U17 & U18 Surrey County Championship  2026");
    expect(semRonda("Junior Championship - Round 1")).toBe("Junior Championship");
  });
});

describe("umaProvaPorVolta", () => {
  it("a prova de várias voltas fica e as de cada volta saem", () => {
    const r = umaProvaPorVolta([
      { compid: 820, multi: false, linhas: [{ roundids: ["a1"] }, { roundids: ["b1"] }] },
      { compid: 822, multi: true, linhas: [{ roundids: ["a1", "a2"] }, { roundids: ["b1", "b2"] }] },
      { compid: 821, multi: false, linhas: [{ roundids: ["a2"] }, { roundids: ["b2"] }] },
    ]);
    expect(r.map((p) => p.compid)).toEqual([822]);
  });
  it("as filhas por tee ficam e a prova-mãe sai; o que só a mãe tem fica nela", () => {
    const r = umaProvaPorVolta([
      { compid: 1921, multi: false, linhas: [{ roundids: ["x"] }, { roundids: ["y"] }, { roundids: ["z"] }] },
      { compid: 1922, multi: false, linhas: [{ roundids: ["x"] }] },
      { compid: 1923, multi: false, linhas: [{ roundids: ["y"] }] },
    ]);
    expect(r.map((p) => [p.compid, p.linhas.length])).toEqual([[1922, 1], [1923, 1], [1921, 1]]);
  });
});
