/**
 * Testes do hándicap oficial e dos rankings juvenis da RFEG (22/10/2026):
 * parsing do site novo (lista, «CSV», PDF), escolha do resultado da pesquisa
 * de hándicap e o casamento com os juniores do kids2 e as suas guardas.
 */
import { describe, it, expect } from "vitest";
import { classificar, indexar, rankingsDoJunior, hcpDoJunior, enriquecer } from "./rfeg-oficial.js";
import { sufixoLic, dataIso } from "./rfeg-web.js";
import { parseLista, parseLinhasAjax, juntarPdf, slug } from "../scrape-rfeg-ranking.js";
import { escolher, nomesCompativeis } from "../scrape-federados-es.js";

describe("rfeg-web", () => {
  it("sufixo = os 6 dígitos finais (mesmo depois de mudar de clube)", () => {
    expect(sufixoLic("AM84955303")).toBe("955303");
    expect(sufixoLic("am11955303")).toBe("955303");
    expect(sufixoLic("1106942416")).toBe("942416");
    expect(sufixoLic("ABC")).toBeNull();
  });
  it("datas dd/mm/aaaa → ISO", () => {
    expect(dataIso("09/07/2026")).toBe("2026-07-09");
    expect(dataIso("5-3-2026")).toBe("2026-03-05");
    expect(dataIso("ontem")).toBeNull();
  });
});

describe("scrape-rfeg-ranking — site novo", () => {
  const card = (id, titulo, data) => `<div class="eqf-doc-card eqf-ranking-card"><span class="eqf-doc-date">${data}</span>
    <span class="eqf-doc-tag eqf-doc-tag--sub">Juvenil</span><span class="eqf-doc-title">${titulo}</span>
    <button class="eqf-ranking-card__btn eqf-ranking-card__btn--csv" data-ranking-id="${id}" data-titulo="${titulo}">CSV</button>
    <a href="https://media.rfegolf.es/ArticulosDocumentos/Ranking/2026/juvenil/pdf/X-${id}.pdf">PDF</a></div>`;
  it("lê os cartões, o nonce e se há página seguinte", () => {
    const html = card(157899, "RANKING NACIONAL INFANTIL MASCULINO 2026", "09/07/2026") +
      card(157896, "Ranking Zona 4 (Pa&iacute;s Vasco) Femenino 2026", "09/07/2026") +
      `<script>var eqfRankings = {"ajaxUrl":"x","nonce":"4b586a11d5"};</script>`;
    const r = parseLista(html);
    expect(r.cards).toHaveLength(2);
    expect(r.cards[0]).toMatchObject({ id: 157899, fecha: "09/07/2026", titulo: "RANKING NACIONAL INFANTIL MASCULINO 2026" });
    expect(r.cards[0].pdf).toMatch(/X-157899\.pdf$/);
    expect(r.cards[1].titulo).toBe("Ranking Zona 4 (País Vasco) Femenino 2026");
    expect(r.nonce).toBe("4b586a11d5");
    expect(r.seguinte).toBe(false);
  });
  it("linhas do «CSV»: o empate («-») fica com o lugar de cima", () => {
    const r = parseLinhasAjax({ success: true, data: { rows: [
      { posicion: "3º", nombre: "SEBASTIAN PEREZ RUIZ", puntos: "51" },
      { posicion: "-", nombre: "MARCOS LEDESMA OROZCO", puntos: "51" },
      { posicion: "5º", nombre: "Rodrigo Del Pino", puntos: "46" },
    ] } });
    expect(r.map((x) => x.pos)).toEqual([3, 3, 5]);
    expect(r[1]).toMatchObject({ nombre: "MARCOS LEDESMA OROZCO", puntos: 51 });
    expect(parseLinhasAjax({ success: false, data: "x" })).toBeNull();
  });
  it("PDF: licença colada antes do nome; o nome do «CSV» diz onde acaba (…DE LA FLOR + A12)", () => {
    const linhas = [
      { pos: 13, nombre: "BORJA ENRIQUEZ SAINZ DE LA FLOR", puntos: 35 },
      { pos: 7, nombre: "Carlos Dominguez Jurado", puntos: 45 },
      { pos: 1, nombre: "Ninguém No Pdf", puntos: 1 },
    ];
    const pdf = " 7ºAMJ7930322Carlos Dominguez JuradoI14201602515345\n 13ºAM05946296BORJA ENRIQUEZ SAINZ DE LA FLORA12141582115735";
    expect(juntarPdf(linhas, pdf)).toBe(2);
    expect(linhas[0]).toMatchObject({ licencia: "AM05946296", cat: "A", edad: 12 });
    expect(linhas[1]).toMatchObject({ licencia: "AMJ7930322", cat: "I", edad: 14 });
    expect(linhas[2].licencia).toBeUndefined();
  });
  it("slug inteiro: Zona 6 masculino e feminino já não colidem", () => {
    expect(slug("Ranking Zona 6 (Madrid-Castilla La Mancha) Masculino 2026")).not.toBe(slug("Ranking Zona 6 (Madrid-Castilla La Mancha) Femenino 2026"));
  });
});

describe("scrape-federados-es — escolher o resultado da pesquisa", () => {
  const doc = (lic, nome, hcp = "0.3") => ({ document: { guid_licence: lic, full_name: nome, handicap: hcp, date_hdc_updated_at: "2026-10-05", enum_gender: 1, club_title: "Clube" } });
  it("licença exacta", () => {
    const r = escolher([doc("AM11345303", "FRANCISCO MORENO"), doc("AM84955303", "DMITRII ELCHANINOV ")], "AM84955303", "Dmitrii Elchaninov", "2026-10-22");
    expect(r).toMatchObject({ lic: "AM84955303", hcp: 0.3, data: "2026-10-05", sexo: "M", via: "licenca" });
  });
  it("licença antiga → a nova com os mesmos 6 dígitos e o mesmo nome", () => {
    const hits = [doc("AM11345303", "FRANCISCO MORENO PACHECO"), doc("AM84955303", "DMITRII ELCHANINOV")];
    expect(escolher(hits, "AM11955303", "Dmitrii Elchaninov", "x")).toMatchObject({ lic: "AM84955303", via: "sufixo" });
    // mesmo sufixo mas outro nome → não
    expect(escolher(hits, "AM11955303", "Pedro Tineo", "x")).toBeNull();
  });
  it("sem hándicap (99,9 / vazio) fica null", () => {
    expect(escolher([doc("AM84955303", "X Y", "")], "AM84955303", "", "x").hcp).toBeNull();
  });
  it("nomes compatíveis: nome + apelido, sem partículas", () => {
    expect(nomesCompativeis("Felipe Seferian", "FELIPE SEFERIAN GOMEZ-ACEBO")).toBe(true);
    expect(nomesCompativeis("Felipe Seferian", "FELIPE DE LA TORRE")).toBe(false);
  });
});

describe("rfeg-oficial — casar juniores com rankings e hándicap", () => {
  const linha = (o) => ({ lic: null, suf: null, pal: [], nome: "", edad: null, ano: 2026, pos: 1, n: 100, pts: 10, titulo: "RANKING NACIONAL INFANTIL MASCULINO 2026", curto: "Nacional Infantil M 2026", fecha: "2026-07-09", nacional: true, sexo: "M", id: 1, ...o });
  const L = [
    linha({ lic: "AM84955303", suf: "955303", pal: ["ELCHANINOV", "DMITRII"], edad: 12, pos: 20, id: 1 }),
    linha({ lic: "CM01952325", suf: "952325", pal: ["SEFERIAN", "GOMEZ", "ACEBO", "FELIPE"], edad: 12, pos: 5, id: 2, titulo: "Ranking Zona 6 (Madrid) Masculino 2026", curto: "Zona 6 (Madrid) M 2026", nacional: false }),
    linha({ lic: "AM11111111", suf: "111111", pal: ["GARCIA", "LOPEZ", "JUAN"], edad: 16, pos: 3, id: 3 }),
  ];
  const idx = indexar(L);
  const j = (o) => ({ id: "x", canonicalName: "", aliases: [], sex: "M", dob: null, sources: {}, ...o });

  it("classificar títulos", () => {
    expect(classificar("RANKING NACIONAL INFANTIL MASCULINO 2026")).toMatchObject({ nacional: true, sexo: "M", curto: "Nacional Infantil M 2026" });
    expect(classificar("Ranking Zona 6 (Madrid-Castilla La Mancha) Alevín Masculino 2025").curto).toBe("Zona 6 (Madrid-Castilla La Mancha) Alevín M 2025");
  });
  it("por licença e pela licença antiga (6 dígitos finais)", () => {
    expect(rankingsDoJunior(j({ dob: "2014-05-13", sources: { rfeg: { lic: "AM84955303" } } }), idx).linhas[0]).toMatchObject({ pos: 20, via: "licenca" });
    expect(rankingsDoJunior(j({ dob: "2014-05-13", sources: { rfeg: { lic: "AM11955303" } } }), idx).linhas[0]).toMatchObject({ pos: 20, via: "sufixo" });
  });
  it("guarda de idade: a licença bate mas o ranking diz 16 anos e ele nasceu em 2014 → recusado", () => {
    const r = rankingsDoJunior(j({ dob: "2014-01-01", sources: { rfeg: { lic: "AM11111111" } } }), idx);
    expect(r.linhas).toHaveLength(0);
    expect(r.recusadas).toBe(1);
  });
  it("sem licença: nome + ano de nascimento + sexo; nunca sem data de nascimento", () => {
    expect(rankingsDoJunior(j({ canonicalName: "Felipe Seferian", dob: "2014-04-10" }), idx).linhas[0]).toMatchObject({ pos: 5, via: "nome", lic: "CM01952325" });
    expect(rankingsDoJunior(j({ canonicalName: "Felipe Seferian", dob: "2012-04-10" }), idx).linhas).toHaveLength(0);
    expect(rankingsDoJunior(j({ canonicalName: "Felipe Seferian", dob: null }), idx).linhas).toHaveLength(0);
    expect(rankingsDoJunior(j({ canonicalName: "Felipe Seferian", dob: "2014-04-10", sex: "F" }), idx).linhas).toHaveLength(0);
  });
  it("quem tem licença no kids2 não casa por nome (outra licença = outra pessoa)", () => {
    expect(rankingsDoJunior(j({ canonicalName: "Felipe Seferian", dob: "2014-04-10", sources: { rfeg: { lic: "XX00000001" } } }), idx).linhas).toHaveLength(0);
  });
  it("hándicap: pela licença, nunca com sexo trocado; enriquecer põe junior.rfegOficial", () => {
    const hcp = { AM84955303: { lic: "AM84955303", hcp: 0.3, data: "2026-10-05", sexo: "M", via: "licenca" }, CM01952325: { lic: "CM01952325", hcp: 4.4, data: "2026-10-18", sexo: "F" } };
    const d = j({ dob: "2014-05-13", sources: { rfeg: { lic: "AM84955303" } } });
    expect(hcpDoJunior(d, hcp)).toMatchObject({ hcp: 0.3 });
    expect(hcpDoJunior(j({ sources: { rfeg: { lic: "CM01952325" } } }), hcp)).toBeNull();
    const st = enriquecer([d], { hcp, linhas: L });
    expect(st).toMatchObject({ comHcp: 1, comRanking: 1 });
    expect(d.rfegOficial).toMatchObject({ hcp: 0.3, hcpData: "2026-10-05", rankings: [{ pos: 20, n: 100, curto: "Nacional Infantil M 2026" }] });
  });
});
