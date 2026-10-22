import { describe, it, expect, beforeAll, vi } from "vitest";
import lgs388Raw from "../../../public/data/rfegolf-livegolfscoring/388.json?raw";
import nc74574Raw from "../../../public/data/nextcaddy/74574.json?raw";
import nc74579Raw from "../../../public/data/nextcaddy/74579.json?raw";
import rfeg16192Raw from "../../../public/data/rfegolf-resultats/16192.json?raw";
import fcgRaw from "../../../public/data/fcg/69e7837119dbb562774fed8d.json?raw";
import dobRaw from "../../../public/data/licencia-dob-lookup.json?raw";
import hcpRaw from "../../../public/data/licencia-hcp-lookup.json?raw";
import golfboxRaw from "../../../public/data/golfbox-players.json?raw";
import federadosRaw from "../../../public/data/federados.json?raw";
import indexRaw from "../../../public/data/rfegolf-resultats-index.json?raw";
import twinsRaw from "../../../public/data/rfegolf-lgs-twins.json?raw";
import { loadRfegDivisionData, type RfegDivisionData } from "../rfeg/divisionData";
import { rfegRoundDraw } from "../rfeg/roundDraw";
import { buildRfegEntries } from "../rfeg/entries";
import { ageToSubN, escaloEsForPlayer } from "../rfeg/escalao";
import { rfegPlayerFlag } from "../rfeg/flags";
import type { RFEGIndex, RFEGIndexEntry } from "../rfeg/types";
import type { Player } from "../fpgTypes";

/**
 * Caracterização dos conversores de Espanha (tirados da RFEGPage a 21/10/2026).
 * Os valores vêm do código antigo: a mudança de sítio não pode mexer em nada
 * do que se vê — posição, gross, ±par, buracos, par, tee, escalão, país,
 * jogadores, inscrições, voltas com draw e o draw de cada volta.
 */

const FILES: Record<string, string> = {
  "/data/rfegolf-livegolfscoring/388.json": lgs388Raw,
  "/data/nextcaddy/74574.json": nc74574Raw,
  "/data/nextcaddy/74579.json": nc74579Raw,
  "/data/rfegolf-resultats/16192.json": rfeg16192Raw,
  "/data/fcg/69e7837119dbb562774fed8d.json": fcgRaw,
  "/data/licencia-dob-lookup.json": dobRaw,
  "/data/licencia-hcp-lookup.json": hcpRaw,
  "/data/golfbox-players.json": golfboxRaw,
  "/data/federados.json": federadosRaw,
};
beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string) => {
    const txt = FILES[url];
    return txt == null
      ? { ok: false, status: 404, text: async () => "" }
      : { ok: true, status: 200, text: async () => txt };
  });
});

const t = (source: RFEGIndexEntry["source"], id: string | number, filePath: string) =>
  ({ source, id, filePath, category: null, sex: null }) as unknown as RFEGIndexEntry;

/** pos | nome | país/clube | gross | ±par | buracos | par | tee R1 | escalão | idade */
function row(p: Player): string {
  const x = p as Player & { escalao?: string | null; _age?: number | null };
  return [
    p.pos, p.name, p.club, p.grossTotal, p.toPar, p.nholes, p.parTotal,
    p.roundScores?.[0]?.teeName ?? null, x.escalao ?? null, x._age ?? null,
  ].map((v) => (v === undefined ? "–" : String(v))).join(" | ");
}
function resumo(d: RfegDivisionData | null) {
  if (!d) return null;
  return {
    jogadores: d.results?.players.length ?? null,
    voltas: d.results?.rounds ?? null,
    top: d.results?.players.slice(0, 3).map(row) ?? [],
    inscritos: `${d.admissions.totalInscritos} + ${d.admissions.reservas} reservas`,
    inscritos1: (d.admissions.players ?? []).slice(0, 2).map((p) => [p.nome, p.fed, p.hcp, p.escalao, p.country ?? null, p.teeName].join(" | ")),
    links: d.links.map((l) => l.label),
    drawRounds: d.drawRounds,
    totais: d.ncTotals?.length ?? null,
    destaques: d.ncHighlights ? d.ncHighlights.players.slice(0, 3).map((p) => `${p.name} ${(p.ace as number) * 100 + (p.eagle as number) * 10 + (p.birdie as number)}`) : null,
    porSexo: d.bySex ? `M ${d.bySex.M.length} · F ${d.bySex.F.length}` : null,
  };
}

describe("loadRfegDivisionData — uma prova de cada fonte", () => {
  it("livegolfscoring 388 (Spanish International U-18)", async () => {
    const d = await loadRfegDivisionData(t("livegolfscoring", 388, "rfegolf-livegolfscoring/388.json"));
    expect(resumo(d)).toMatchInlineSnapshot(`
      {
        "destaques": null,
        "drawRounds": [
          1,
          2,
        ],
        "inscritos": "120 + 0 reservas",
        "inscritos1": [
          "CHIRBAND, Junes |  |  |  | SE | ",
          "GLENNON, Tom |  |  |  | IE | ",
        ],
        "jogadores": 120,
        "links": [],
        "porSexo": null,
        "top": [
          "1 | Junes Chirband | 🇸🇪 | 131 | -11 | 18 | 71 | 6311 m | null | null",
          "2 | Tom Glennon | 🇮🇪 | 132 | -10 | 18 | 71 | 6311 m | null | null",
          "3 | Mathias Aase | 🇳🇴 Norway | 133 | -9 | 18 | 71 | 6311 m | Junior | 17",
        ],
        "totais": null,
        "voltas": 2,
      }
    `);
    const r2 = rfegRoundDraw(d!.data, t("livegolfscoring", 388, ""), 2);
    expect([r2.horarios?.map((h) => `R${h.round}: ${h.players.length}`), r2.draw?.groups?.length, r2.results.size, r2.tournamentDate])
      .toMatchInlineSnapshot(`
        [
          [
            "R1: 60",
            "R2: 60",
          ],
          20,
          325,
          "2026-09-02",
        ]
      `);
    expect(r2.draw?.groups?.[0]).toMatchInlineSnapshot(`
      {
        "players": [
          {
            "clube": "Baviera Golf Sa",
            "country": "ES",
            "fed": "AM58065728",
            "hcp": 0.3,
            "isPortuguese": false,
            "nome": "Iñigo Ferreira Cardona",
            "tee": null,
          },
          {
            "clube": "Real Guadalhorce Club de Golf",
            "country": "ES",
            "fed": "AM15935229",
            "hcp": -0.7,
            "isPortuguese": false,
            "nome": "Javier Muñoz Rubio",
            "tee": null,
          },
          {
            "clube": "Granada Club de Golf",
            "country": "ES",
            "fed": "AM65917019",
            "hcp": -0.9,
            "isPortuguese": false,
            "nome": "Roberto Ruiz Morell",
            "tee": null,
          },
        ],
        "startHole": 1,
        "tee": null,
        "teeTime": "08:15",
      }
    `);
  });

  it("NextCaddy 74574 com cartões: rapazes e raparigas em tabs", async () => {
    const d = await loadRfegDivisionData(t("nextcaddy", 74574, "nextcaddy/74574.json"));
    expect(resumo(d)).toMatchInlineSnapshot(`
      {
        "destaques": null,
        "drawRounds": [
          1,
        ],
        "inscritos": "22 + 0 reservas",
        "inscritos1": [
          "Lucia Saenz Vidau | AM05983535 | 37.9 | A |  | 4730 m",
          "Gadea Geldinovski Ruiz | AM05322815 | 30.8 | Benjamín |  | 4730 m",
        ],
        "jogadores": 22,
        "links": [],
        "porSexo": "M 21 · F 1",
        "top": [
          "1 | Lucia Saenz Vidau | — | 96 | 24 | 18 | 72 | 4730 m | A | null",
          "2 | Gadea Geldinovski Ruiz | Real Club de Golf Vista Hermosa | 94 | 22 | 18 | 72 | 4730 m | Benjamín | 10",
          "3 | Blanca Moreno Quintero | — | 104 | 32 | 18 | 72 | 4730 m | I | null",
        ],
        "totais": null,
        "voltas": 1,
      }
    `);
    const r1 = rfegRoundDraw(d!.data, t("nextcaddy", 74574, ""), 1);
    expect([r1.draw?.totalJogadores, r1.draw?.groups?.[0]?.players[0], Object.keys(r1.playersDB).length, r1.results.size])
      .toMatchInlineSnapshot(`
        [
          22,
          {
            "clube": null,
            "country": null,
            "fed": "79879",
            "hcp": 4.1,
            "isPortuguese": false,
            "nome": "Beltran Dauthieu Domecq",
            "tee": "5358 m",
          },
          1,
          1,
        ]
      `);
  });

  it("NextCaddy 74579 sem leaderboard: destaques de live scoring", async () => {
    const d = await loadRfegDivisionData(t("nextcaddy", 74579, "nextcaddy/74579.json"));
    expect(resumo(d)).toMatchInlineSnapshot(`
      {
        "destaques": [
          "Les Bell 10",
          "Trudy Helen Baldwyn 3",
          "Michael Mooney 3",
        ],
        "drawRounds": [
          1,
        ],
        "inscritos": "4 + 0 reservas",
        "inscritos1": [
          "Santiago Segura Ramos | AM05008598 | 54 | B |  | ",
          "Alvaro Peña Brandariz | AM05499827 | 54 | B |  | ",
        ],
        "jogadores": null,
        "links": [],
        "porSexo": null,
        "top": [],
        "totais": null,
        "voltas": null,
      }
    `);
  });

  it("RFEGolf + mitarjeta 16192 (Campeonato de España Alevín Masculino 2026)", async () => {
    const d = await loadRfegDivisionData(t("rfegolf", 16192, "rfegolf-resultats/16192.json"));
    expect(resumo(d)).toMatchInlineSnapshot(`
      {
        "destaques": null,
        "drawRounds": [
          1,
          2,
          3,
        ],
        "inscritos": "90 + 49 reservas",
        "inscritos1": [
          "ELCHANINOV , DMITRII | AM84955303 | -0.7 | Alevín | RU | ",
          "GANCEDO FERNANDEZ, MARTIN | GC54983846 | 4.3 | Alevín |  | ",
        ],
        "jogadores": 90,
        "links": [
          "Clasificación · La Manga Club Norte",
        ],
        "porSexo": null,
        "top": [
          "1 | Jaime De Wint Senussi | Real Guadalhorce Club de Golf | 216 | 3 | 18 | 71 | Camp. | Alevín | 11",
          "1 | Dmitrii Elchaninov | La Hacienda Links Golf Resort | 216 | 3 | 18 | 71 | Camp. | Alevín | 12",
          "3 | Theo Oderinde Oderinde | Club de Golf Terramar | 222 | 9 | 18 | 71 | Camp. | Alevín | 12",
        ],
        "totais": null,
        "voltas": 3,
      }
    `);
    const r3 = rfegRoundDraw(d!.data, t("rfegolf", 16192, ""), 3);
    expect([r3.draw?.groups?.length, r3.draw?.groups?.[0]?.players[0], r3.results.size]).toMatchInlineSnapshot(`
      [
        30,
        {
          "clube": "Club de Golf la Dehesa",
          "country": null,
          "fed": "CM61152858",
          "hcp": 19.5,
          "isPortuguese": false,
          "nome": "Bruno Paradela Martin",
          "tee": null,
        },
        267,
      ]
    `);
  });

  it("golfdirecto (Campionat de Catalunya Infantil i Aleví 2026)", async () => {
    const d = await loadRfegDivisionData(t("golfdirecto", "69e7837119dbb562774fed8d", "fcg/69e7837119dbb562774fed8d.json"));
    expect(resumo(d)).toMatchInlineSnapshot(`
      {
        "destaques": null,
        "drawRounds": [],
        "inscritos": "75 + 0 reservas",
        "inscritos1": [
          "Marcos Leach Lopez | CB03961168 | 5.3 | Infantil |  | ",
          "Ona Martinez Cucco | CB01912504 | 5.6 | Infantil |  | ",
        ],
        "jogadores": 75,
        "links": [],
        "porSexo": null,
        "top": [
          "1 | Ana Iturmendi Simon | REAL CLUB DE GOLF "EL PRAT" | 76 | 6 | 18 | 70 | Yellow | Alevín | 11",
          "1 | Gabriel de Souza Rodriguez | CLUB DE GOLF TERRAMAR | 69 | -1 | 18 | 70 | Yellow | Alevín | 11",
          "1 | Marcos Leach Lopez | REAL CLUB DE GOLF DE CERDAÑA | 71 | 1 | 18 | 70 | Yellow | Infantil | 13",
        ],
        "totais": null,
        "voltas": 1,
      }
    `);
  });

  it("ficheiro que não existe → null", async () => {
    expect(await loadRfegDivisionData(t("nextcaddy", 1, "nextcaddy/nao-existe.json"))).toBeNull();
  });
});

describe("escalão e bandeiras", () => {
  it("idade → Sub-N e escalão RFEG pela idade-no-ano", () => {
    expect([8, 10, 11, 12, 14, 16, 18, 21].map(ageToSubN)).toMatchInlineSnapshot(`
      [
        "Sub-10",
        "Sub-10",
        "Sub-12",
        "Sub-12",
        "Sub-14",
        "Sub-16",
        "Sub-18",
        "Sub-21",
      ]
    `);
    expect(escaloEsForPlayer("Infantil", "01/02/2015", "2026-06-10")).toMatchInlineSnapshot(`"Alevín"`);
    expect(escaloEsForPlayer("alevin", null, "2026-06-10")).toMatchInlineSnapshot(`"Alevín"`);
  });
  it("só os estrangeiros levam bandeira; overrides curados por nome", () => {
    expect([
      rfegPlayerFlag("Juan Pérez", "ESPAÑA"), rfegPlayerFlag("João Silva", "PORTUGAL"), rfegPlayerFlag("X", "PT"),
      rfegPlayerFlag("Y", "EXTRANJERO"), rfegPlayerFlag("ELCHANINOV , DMITRII", "ESPAÑA"),
    ]).toMatchInlineSnapshot(`
      [
        undefined,
        "PT",
        "PT",
        undefined,
        "RU",
      ]
    `);
  });
});

describe("buildRfegEntries — gémeos e campeonatos juntos", () => {
  const index = JSON.parse(indexRaw) as RFEGIndex;
  const tw = JSON.parse(twinsRaw) as { twins: Record<string, number>; lgsSuppressed?: Record<string, number> };
  const entries = buildRfegEntries(index, tw.twins, tw.lgsSuppressed, async () => []);
  const ids = new Set(entries.flatMap((e) => [e.id, ...(e.memberIds ?? [])]));

  it("o RFEGolf com gémeo LGS não aparece (o URL redirecciona para o LGS)", () => {
    for (const compId of Object.keys(tw.twins)) expect(ids.has(`rfegolf:${compId}`)).toBe(false);
  });
  it("o Campeonato de España 2026 junta as categorias numa entrada grp-…", () => {
    const grp = entries.find((e) => e.memberIds?.includes("rfegolf:16192"))!;
    expect([grp.id, grp.memberIds?.length, grp.sex, grp.divisionCount]).toMatchInlineSnapshot(`
      [
        "rfegolf:grp-campeonato-de-espana-2026",
        6,
        "Mixed",
        6,
      ]
    `);
  });
  it("sem categoria ou sem inscritos/resultados → fora da lista", () => {
    expect(ids.has("livegolfscoring:64")).toBe(false);
    expect(ids.has("rfegolf:16111")).toBe(false);
  });
});
