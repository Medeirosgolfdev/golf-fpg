import { describe, it, expect } from "vitest";
import { parseEntrants, parseHi, parseCompDate, parseCompRows, ajaxHtml, eProvaJunior } from "./intelligentgolf.js";

const ENTRANTS = `<div id="global"><h3>Entrant List for Junior Open</h3><p>5 players</p><table>
<tr class="odd"><td>Leo Warburton (J) (Ringway Golf Club)</td></tr><tr ><td>Laurent Beech (Eaton (Chester) Golf Club)</td></tr>
<tr class="odd"><td>James Clark (Junior) (-2.7)</td></tr><tr ><td>Joseph  Thorne (1.1)</td></tr>
<tr class="odd"><td>Jasper Hughes ()</td></tr><tr ><td>Kieran O&#39;Connor (+0.4)</td></tr>
</table><p><a href="competition2.php?tab=details&compid=3341">Back</a></p></div>`;

describe("parseEntrants", () => {
  const r = parseEntrants(ENTRANTS);
  it("HI entre parênteses (plus em negativo) e marcas de júnior fora do nome", () => {
    expect(r.find((p) => p.name === "James Clark")).toEqual({ name: "James Clark", hcp: -2.7, clube: null });
    expect(r.find((p) => p.name === "Joseph Thorne")).toEqual({ name: "Joseph Thorne", hcp: 1.1, clube: null });
    expect(r.find((p) => p.name === "Kieran O'Connor").hcp).toBe(-0.4);
  });
  it("clube (também com parênteses lá dentro) não é HI", () => {
    expect(r.find((p) => p.name === "Leo Warburton")).toEqual({ name: "Leo Warburton", hcp: null, clube: "Ringway Golf Club" });
    expect(r.find((p) => p.name === "Laurent Beech").clube).toBe("Eaton (Chester) Golf Club");
    expect(r.find((p) => p.name === "Jasper Hughes")).toEqual({ name: "Jasper Hughes", hcp: null, clube: null });
  });
  it("página sem lista → null", () => {
    expect(parseEntrants("<html>Login</html>")).toBeNull();
  });
});

describe("parseHi / parseCompDate", () => {
  it("só números de handicap", () => {
    expect(parseHi("54.0")).toBe(54);
    expect(parseHi("Worthing")).toBeNull();
    expect(parseHi("2026")).toBeNull();
  });
  it("datas com e sem ano", () => {
    expect(parseCompDate("Sunday 20th September", 2026)).toBe("2026-09-20");
    expect(parseCompDate("Thursday 27th May 2027", 2026)).toBe("2027-05-27");
    expect(parseCompDate("TBC", 2026)).toBeNull();
  });
});

describe("parseCompRows", () => {
  const row = (id, nome, data) => `<tr><td><a href="/competition.php?compid=${id}"><img></a></td><td>
    <div class="comp-name"><a href="/competition.php?compid=${id}">${nome} </a> <span class='comp-type-badge open'>OPEN COMPETITION</span></div>
    <div class="comp-date">${data}</div></td></tr>`;
  it("páginas seguintes («loadmore») vêm em {html}", () => {
    expect(parseCompRows(ajaxHtml({ html: row(54850, "Junior Open", "Sunday 5th April") }), 2026))
      .toEqual([{ compid: 54850, title: "Junior Open", date: "2026-04-05" }]);
  });
  it("uma linha por prova, com a data", () => {
    const html = ajaxHtml({ actions: [{ type: "setvalue" }, { html: row(54977, "Golf At Goodwood Junior Open - PARK", "Friday 29th May") + row(54919, "Junior Starter Series 24", "Sunday 20th September") }] });
    expect(parseCompRows(html, 2026)).toEqual([
      { compid: 54977, title: "Golf At Goodwood Junior Open - PARK", date: "2026-05-29" },
      { compid: 54919, title: "Junior Starter Series 24", date: "2026-09-20" },
    ]);
  });
});

describe("eProvaJunior", () => {
  it("opens e campeonatos de juniores sim; iniciação e pares não", () => {
    expect(eProvaJunior("Golf At Goodwood Junior Open - PARK")).toBe(true);
    expect(eProvaJunior("Under 15 Junior Open")).toBe(true);
    expect(eProvaJunior("Boys U14 Championship")).toBe(true);
    expect(eProvaJunior("Junior Starter Series 24 PARK COURSE")).toBe(false);
    expect(eProvaJunior("Junior & Parent Texas Scramble")).toBe(false);
    expect(eProvaJunior("Goodwood Ladies Invitational")).toBe(false);
  });
});
