import { describe, it, expect } from "vitest";
import { buildFpgEditionsIndex } from "../fpgPastEditions";
import type { Tournament } from "../../../data/fpgTypes";

const t = (ccode: string, tcode: string, name: string, date: string, escalao?: string): Tournament =>
  ({ ccode, tcode, name, date, escalao: escalao ?? null, campo: "Porto Santo Golfe", players: [] } as unknown as Tournament);

describe("buildFpgEditionsIndex — alias de ccode do mesmo organizador", () => {
  it("funde edições publicadas sob 920 e 183 (Porto Santo Golfe)", () => {
    const index = buildFpgEditionsIndex([
      t("920", "10077", "Torneio José Rosado", "2024-08-09"),
      t("183", "10142", "Torneio José Rosado", "2025-08-08"),
      t("920", "10088", "Torneio José Rosado", "2026-08-08"),
    ]);
    const groups = [...index.values()];
    expect(groups).toHaveLength(1);
    expect(groups[0].map(e => e.year).sort()).toEqual([2024, 2025, 2026]);
  });

  it("não funde homónimos de clubes distintos (ccodes sem alias)", () => {
    const index = buildFpgEditionsIndex([
      t("125", "20001", "Taça de Natal", "2024-12-14"),
      t("152", "20002", "Taça de Natal", "2025-12-13"),
    ]);
    expect([...index.values()]).toHaveLength(2);
  });
});

describe("buildFpgEditionsIndex — Miramar Internacional Open", () => {
  // O nome do Sub-10 mudou todos os anos; o de 2025 nem sequer traz "U25".
  // Sem o alias curado davam três family keys e a tab não aparecia.
  const sub10 = [
    t("003", "10478", "Miramar Internacional Open U25 ( Sub10)", "2024-08-26", "Sub 10"),
    t("003", "10565", "Miramar Internacional Open - sub 10", "2025-08-19", "Sub 10"),
    t("003", "10653", "X Miramar Internacional Open U25 - Sub10", "2026-08-19", "Sub 10"),
  ];
  const u25 = [
    t("003", "10477", "Miramar Internacional Open U25", "2024-08-26"),
    t("003", "10564", "Miramar Internacional Open U25", "2025-08-19"),
    t("003", "10652", "X Miramar Internacional Open U25", "2026-08-19"),
  ];

  it("junta as três edições do Sub-10 apesar dos nomes divergentes", () => {
    const index = buildFpgEditionsIndex(sub10);
    const groups = [...index.values()];
    expect(groups).toHaveLength(1);
    expect(groups[0].map(e => e.year).sort()).toEqual([2024, 2025, 2026]);
  });

  it("mantém o Sub-10 separado do U25 (são provas distintas)", () => {
    const index = buildFpgEditionsIndex([...sub10, ...u25]);
    expect([...index.values()]).toHaveLength(2);
    const byYear = [...index.values()].map(g => g.map(e => e.tcode).sort());
    expect(byYear).toContainEqual(["10478", "10565", "10653"]);
    expect(byYear).toContainEqual(["10477", "10564", "10652"]);
  });

  it("não atribui 'Sub 25' ao Sub-10 (o U25 do nome vem antes do Sub10)", () => {
    const index = buildFpgEditionsIndex(sub10);
    const escs = [...index.values()][0].flatMap(e => (e.divisions ?? []).map(d => d.escalao));
    expect(escs).toEqual(["Sub 10", "Sub 10", "Sub 10"]);
  });

  it("o U25 continua a juntar as três edições (sem regressão)", () => {
    const index = buildFpgEditionsIndex(u25);
    const groups = [...index.values()];
    expect(groups).toHaveLength(1);
    expect(groups[0].map(e => e.year).sort()).toEqual([2024, 2025, 2026]);
  });
});

describe("buildFpgEditionsIndex — PJA @ Terras da Comporta (alias por campo)", () => {
  // O nome muda todos os anos; o campo é que distingue as duas provas anuais.
  const tc = (tcode: string, name: string, date: string, campo: string): Tournament =>
    ({ ccode: "192", tcode, name, date, escalao: null, campo, players: [] } as unknown as Tournament);

  const torre = [
    tc("10013", "PJA Race to Dunas", "2025-09-12", "Terras da Comporta Torre Golf Course"),
    tc("90101", "PJA Torre 2026", "2026-09-05", "Terras da Comporta - Torre"),
  ];
  const dunas = [
    tc("10005", "PJA TOUR Grand Final", "2024-11-30", "Terras da Comporta Dunas Golf Course"),
    tc("10019", "Race to Dunas G. Final", "2025-11-29", "Terras da Comporta Dunas Golf Course"),
  ];

  it("junta as edições do Torre apesar dos nomes diferentes", () => {
    const groups = [...buildFpgEditionsIndex(torre).values()];
    expect(groups).toHaveLength(1);
    expect(groups[0].map(e => e.tcode).sort()).toEqual(["10013", "90101"]);
  });

  it("junta as Grandes Finais das Dunas", () => {
    const groups = [...buildFpgEditionsIndex(dunas).values()];
    expect(groups).toHaveLength(1);
    expect(groups[0].map(e => e.tcode).sort()).toEqual(["10005", "10019"]);
  });

  it("NÃO mistura o Torre com as Dunas — o 'Dunas' do nome de 2025 é um engano", () => {
    const index = buildFpgEditionsIndex([...torre, ...dunas]);
    const groups = [...index.values()].map(g => g.map(e => e.tcode).sort());
    expect(groups).toHaveLength(2);
    expect(groups).toContainEqual(["10013", "90101"]);
    expect(groups).toContainEqual(["10005", "10019"]);
  });

  it("não apanha provas de outro clube com 'Torre' no campo", () => {
    const outroClube = { ccode: "029", tcode: "10543", name: "PJA Aroeira Masters 2026",
      date: "2026-04-24", escalao: null, campo: "PGA Aroeira", players: [] } as unknown as Tournament;
    const index = buildFpgEditionsIndex([...torre, outroClube]);
    expect([...index.values()]).toHaveLength(2);
  });
});

describe("buildFpgEditionsIndex — o nome da etapa do Torre pode mudar", () => {
  // Quando os resultados saírem, o placeholder é promovido e o torneio adopta o
  // nome OFICIAL da FPG. A tab não pode desaparecer nessa altura.
  const tc = (tcode: string, name: string, date: string): Tournament =>
    ({ ccode: "192", tcode, name, date, escalao: null,
       campo: "Terras da Comporta Torre Golf Course", players: [] } as unknown as Tournament);

  for (const nome of ["PJA Torre 2026", "PJA Race to Dunas", "Race to Dunas - Torre",
                      "2º Torneio Torre Golf Course"]) {
    it(`casa com a edição de 2025 quando se chama "${nome}"`, () => {
      const groups = [...buildFpgEditionsIndex([
        tc("10013", "PJA Race to Dunas", "2025-09-12"),
        tc("10024", nome, "2026-09-05"),
      ]).values()];
      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(2);
    });
  }
});
