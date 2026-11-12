import { describe, it, expect } from "vitest";
import { buildFpgEditionsIndex, buildFpgManuelH2H } from "../fpgPastEditions";
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

describe("buildFpgEditionsIndex — jovens da Quinta do Lago (escalão colado ao nome)", () => {
  // 12/11/2026: o Junior Open 2026 entra com o escalão posto e nomes «… - U12»;
  // as edições anteriores vêm sem `escalao` e com os mais velhos num só código.
  const qdl = [
    t("962", "10067", "Quinta do Lago Junior Open 2024 - U21&U16", "2024-12-27"),
    t("962", "10069", "Quinta do Lago Junior Open 2024 - U12", "2024-12-27"),
    t("962", "10078", "Quinta do Lago Junior Open 2025 - U21 & U16", "2025-12-29"),
    t("962", "10080", "Quinta do Lago Junior Open 2025 - U12", "2025-12-29"),
    t("962", "90912", "Quinta do Lago Junior Open 2026 - U12", "2026-12-27", "Sub 12"),
    t("962", "90916", "Quinta do Lago Junior Open 2026 - U16", "2026-12-27", "Sub 16"),
    t("962", "90921", "Quinta do Lago Junior Open 2026 - U21", "2026-12-27", "Sub 21"),
  ];
  const escsDe = (index: ReturnType<typeof buildFpgEditionsIndex>, tcode: string) =>
    [...index.values()].flat().find(e => e.tcode === tcode)!.divisions!.map(d => d.escalao);

  it("todas as edições e escalões ficam na mesma família", () => {
    const index = buildFpgEditionsIndex(qdl);
    expect([...index.values()]).toHaveLength(1);
  });

  it("a edição sem escalão lê-o do nome (U12 → Sub 12)", () => {
    const index = buildFpgEditionsIndex(qdl);
    expect(escsDe(index, "10080")).toEqual(["Sub 12"]);
    expect(escsDe(index, "90912")).toEqual(["Sub 12"]);
  });

  it("a prova conjunta «U21 & U16» é edição anterior dos dois escalões", () => {
    const index = buildFpgEditionsIndex(qdl);
    expect(escsDe(index, "10078")).toEqual(["Sub 21", "Sub 16"]);
    expect(escsDe(index, "10067")).toEqual(["Sub 21", "Sub 16"]);
  });

  it("com a idade da FPG, a prova conjunta parte-se: cada escalão só com os seus, lugar recalculado", () => {
    const conjunta = {
      ccode: "962", tcode: "10078", name: "Quinta do Lago Junior Open 2025 - U21 & U16", date: "2025-12-29",
      escalao: null, campo: "Quinta do Lago Laranjal",
      players: [
        { scoreId: "1", name: "Mais Velho A", pos: 1, grossTotal: 70, toPar: -2, age: 18, roundScores: [{ gross: 70 }] },
        { scoreId: "2", name: "Novo A", pos: 2, grossTotal: 74, toPar: 2, age: 16, roundScores: [{ gross: 74 }] },
        { scoreId: "3", name: "Mais Velho B", pos: 3, grossTotal: 75, toPar: 3, age: 17, roundScores: [{ gross: 75 }] },
        { scoreId: "4", name: "Novo B", pos: 4, grossTotal: 79, toPar: 7, age: 15, roundScores: [{ gross: 79 }] },
      ],
    } as unknown as Tournament;
    const index = buildFpgEditionsIndex([conjunta, t("962", "90916", "Quinta do Lago Junior Open 2026 - U16", "2026-12-27", "Sub 16")]);
    const e = [...index.values()].flat().find(x => x.tcode === "10078")!;
    const de = (esc: string) => (e.divisions!.find(d => d.escalao === esc)!.results as Tournament).players.map(p => `${p.pos}.${p.name}`);
    expect(de("Sub 16")).toEqual(["1.Novo A", "2.Novo B"]);
    expect(de("Sub 21")).toEqual(["1.Mais Velho A", "2.Mais Velho B"]);
  });

  it("sem idades gravadas, a prova conjunta fica inteira nos dois escalões (não se adivinha)", () => {
    const index = buildFpgEditionsIndex(qdl);
    const e = [...index.values()].flat().find(x => x.tcode === "10078")!;
    expect(e.divisions![0].results).toBe(e.divisions![1].results);
  });

  it("o Paul McGinley junta «Under 14» com «U14» e parte o «Under 18 & 16»", () => {
    const index = buildFpgEditionsIndex([
      t("962", "10064", "Paul McGinley Junior Cup 2024 - Under 14", "2024-08-23"),
      t("962", "10063", "Paul McGinley Junior Cup 2024 - Under 18 & 16", "2024-08-23"),
      t("962", "10083", "Paul McGinley Junior Cup 2026 - U14", "2026-08-21"),
    ]);
    expect([...index.values()]).toHaveLength(1);
    expect(escsDe(index, "10064")).toEqual(["Sub 14"]);
    expect(escsDe(index, "10083")).toEqual(["Sub 14"]);
    expect(escsDe(index, "10063")).toEqual(["Sub 18", "Sub 16"]);
  });

  it("não se mistura com o Junior Open (são duas provas do mesmo clube)", () => {
    const index = buildFpgEditionsIndex([...qdl, t("962", "10083", "Paul McGinley Junior Cup 2026 - U14", "2026-08-21")]);
    expect([...index.values()]).toHaveLength(2);
  });
});

describe("buildFpgManuelH2H — provas FPG em comum com o Manuel, pelo federado", () => {
  const torneio = (tcode: string, date: string, players: object[]) =>
    ({ ccode: "007", tcode, name: `T${tcode}`, date, players } as unknown as Tournament);
  it("conta pelo fed (o pai, 54907, não é o Manuel) e ignora sem cartão", () => {
    const pool = [
      torneio("1", "2026-09-12", [
        { name: "Manuel Goulartt Medeiros", fed: "52884", grossTotal: 80, pos: 2 },
        { name: "Manuel Medeiros", fed: "54907", grossTotal: 95, pos: 9 },
        { name: "Mateus Penucho", fed: "52393", grossTotal: 78, pos: 1 },
      ]),
      torneio("2", "03/10/2026", [
        { name: "Manuel Goulartt Medeiros", fed: "52884", grossTotal: 76 },
        { name: "Mateus Penucho", fed: "52393", grossTotal: 999 },
      ]),
    ];
    const h = buildFpgManuelH2H(pool);
    expect(h.get("52393")).toEqual([["2026-09-12", "T1", 1, 2, -2]]);
    expect(h.get("54907")).toEqual([["2026-09-12", "T1", 9, 2, 15]]);
    expect(h.has("52884")).toBe(false);
  });
});
