import { describe, it, expect, beforeAll, vi } from "vitest";
import rennesRaw from "../../../public/data/ffgolf-resultats/03-11-2601477509.json?raw";
import overridesRaw from "../../../public/data/ffgolf-course-overrides.json?raw";
import catalogRaw from "../../../public/data/ffgolf-catalog.json?raw";
import cfjBenjaminesRaw from "../../../public/data/ffgolf/2026_championnat-de-france-des-jeunes-benjamines.json?raw";
import cfjBenjaminsRaw from "../../../public/data/ffgolf/2026_championnat-de-france-des-jeunes-benjamins.json?raw";
import cfjU12FRaw from "../../../public/data/ffgolf/2026_championnat-de-france-des-jeunes-u12-filles-trophee-lacoste.json?raw";
import cfjU12GRaw from "../../../public/data/ffgolf/2026_championnat-de-france-des-jeunes-u12-garcons-trophee-crocodile.json?raw";
import { ffgResLoadDivisions, ggMergedEntry } from "../ffg/ffgEntries";
import { normalizeName, ffgCountry, divisionLabel, ffgEscaloesOfTournament } from "../ffg/names";
import { toFPGTournament } from "../ffg/toTournament";
import { buildFfgMatchplay, ggDrawToFpgDraw, ffgEventFamilyKey } from "../ffg/golfgenius";
import type { Catalog, FFGResIndexEntry, FFGTournament } from "../ffg/types";
import type { Player, Tournament } from "../fpgTypes";

/**
 * Caracterização dos conversores de França (tirados da FFGPage a 21/10/2026).
 * Os valores vêm do código antigo: a mudança de sítio não pode mexer em nada
 * do que se vê — posição, gross, ±par, buracos, par, tee, país, jogadores e
 * divisões, o bracket e os draws do Championnat de France des Jeunes.
 */

const FILES: Record<string, string> = {
  "/data/ffgolf-resultats/03-11-2601477509.json": rennesRaw,
  "/data/ffgolf-course-overrides.json": overridesRaw,
};
beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string) => {
    const txt = FILES[url];
    return txt == null
      ? { ok: false, status: 404, text: async () => "" }
      : { ok: true, status: 200, text: async () => txt };
  });
});

/** pos | nome | país/clube | gross | ±par | buracos | par | tee R1 | voltas */
function row(p: Player): string {
  return [
    p.pos, p.name, p.club, p.grossTotal, p.toPar, p.nholes, p.parTotal,
    p.roundScores?.[0]?.teeName ?? null, p.roundScores?.length ?? 0,
  ].map((v) => (v === undefined ? "–" : String(v))).join(" | ");
}
const top = (t: Tournament | undefined, n = 3) => (t?.players ?? []).slice(0, n).map(row);


describe("portal FFG Resultats — ffgResLoadDivisions", () => {
  it("Grand Prix Jeunes de Rennes 2026 (ffgres:2601477509): séries, par real, cartão por série", async () => {
    const meta = { trnId: "2601477509", file: "03-11-2601477509.json", year: 2026 } as FFGResIndexEntry;
    const divs = await ffgResLoadDivisions(meta);
    expect(divs.map((d) => `${d.key} · ${d.escalao} · ${d.results?.players.length} jog · ${d.results?.rounds} voltas`)).toMatchInlineSnapshot(`
      [
        "119 · Poussin Garçons (Sub 12) · 47 jog · 2 voltas",
        "217 · Poussin Filles (Sub 12) · 12 jog · 2 voltas",
        "115 · Benjamin Garçons (Sub 14) · 20 jog · 2 voltas",
        "213 · Benjamin Filles (Sub 14) · 8 jog · 2 voltas",
        "111 · Minime Garçons (Sub 16) · 6 jog · 2 voltas",
        "29 · Minime Filles (Sub 16) · 1 jog · 2 voltas",
      ]
    `);
    // Pela chave da série (a ordem dos separadores é por idade desde 22/10/2026).
    expect(top(divs.find((d) => d.key === "29")?.results)).toMatchInlineSnapshot(`
      [
        "1 | Louise Garnier-Gueguen | 🇫🇷 Ch. Cheverny | 179 | 35 | 18 | 72 | Minimes Filles (#20) — misto: Azuis + Vermelhas | 2",
      ]
    `);
    expect(top(divs.find((d) => d.key === "119")?.results)).toMatchInlineSnapshot(`
      [
        "1 | Gabin Tosatto | 🇫🇷 Guerande | 140 | -4 | 18 | 72 | U12 Garçons / Poussins (#12) — misto: Azuis + Vermelhas | 2",
        "2 | Ricardo Castro Ferreira | 🇫🇷 St Germain | 143 | -1 | 18 | 72 | U12 Garçons / Poussins (#12) — misto: Azuis + Vermelhas | 2",
        "3 | Noa Lucas | 🇫🇷 L'Odet | 146 | 2 | 18 | 72 | U12 Garçons / Poussins (#12) — misto: Azuis + Vermelhas | 2",
      ]
    `);
  });
});

describe("GolfGenius — Championnat de France des Jeunes 2026", () => {
  const cat = JSON.parse(catalogRaw) as Catalog;
  const files: Record<string, string> = {
    "championnat-de-france-des-jeunes-benjamines": cfjBenjaminesRaw,
    "championnat-de-france-des-jeunes-benjamins": cfjBenjaminsRaw,
    "championnat-de-france-des-jeunes-u12-filles-trophee-lacoste": cfjU12FRaw,
    "championnat-de-france-des-jeunes-u12-garcons-trophee-crocodile": cfjU12GRaw,
  };
  const members = Object.entries(files).map(([slug, raw]) => ({
    meta: cat.tournaments.find((t) => t.year === 2026 && t.slug === slug)!,
    data: JSON.parse(raw) as FFGTournament,
  }));

  it("os 4 escalões juntam-se em gg:evt:championnat-de-france-des-jeunes_2026", () => {
    expect(new Set(members.map((m) => ffgEventFamilyKey(m.meta)))).toEqual(new Set(["championnat-de-france-des-jeunes"]));
    const e = ggMergedEntry(members);
    expect([e.id, e.name, e.course, e.dateStart, e.dateEnd, e.playerCount, e.roundsCount, e.escaloes]).toMatchInlineSnapshot(`
      [
        "gg:evt:championnat-de-france-des-jeunes_2026",
        "Championnat de France des Jeunes 2026",
        "Golf du Gouverneur",
        "2026-07-20",
        "2026-07-22",
        291,
        2,
        [
          "Poussin Garçons (Sub 12)",
          "Poussin Filles (Sub 12)",
          "Benjamin Filles (Sub 14)",
          "Benjamins (Sub 14)",
        ],
      ]
    `);
    expect(e.divisions!.map((d) => `${d.tabLabel} · ${d.sex ?? "–"} · ${d.results?.players.length} jog · match play ${d.matchplay?.flights.length ?? 0} · draws ${d.roundDraws?.length ?? 0}`))
      .toMatchInlineSnapshot(`
        [
          "Poussin Garçons (Sub 12) · M · 87 jog · match play 1 · draws 7",
          "Poussin Filles (Sub 12) · F · 57 jog · match play 1 · draws 7",
          "Benjamin Filles (Sub 14) · – · 65 jog · match play 1 · draws 5",
          "Benjamins (Sub 14) · – · 82 jog · match play 1 · draws 3",
        ]
      `);
  });

  it("U12 Garçons: leaderboard, bracket e draw", () => {
    const g = members.find((m) => m.meta.slug.includes("u12-garcons"))!.data;
    // Quem só jogou a 1.ª volta (Arthur Boue, 85) vai para o fim e sem lugar —
    // até 26/10/2026 aparecia em 1.º, acima do vencedor (140 em duas voltas).
    const boue = toFPGTournament(g).players.find((p) => /boue/i.test(p.name));
    expect([boue?.pos ?? null, boue?.roundScores?.length]).toEqual([null, 1]);
    expect(top(toFPGTournament(g))).toMatchInlineSnapshot(`
      [
        "1 | Maxence Le Theo | GOLF BORDELAIS | 140 | -2 | 18 | 71 | Jaunes | 2",
        "2 | Arthur Rolland | GOLF DE VALESCURE | 141 | -1 | 18 | 71 | Jaunes | 2",
        "3 | Guilain Houssais | GOLF DE PRUNEVELLE | 142 | 0 | 18 | 71 | Jaunes | 2",
      ]
    `);
    const mp = buildFfgMatchplay(g);
    expect(mp?.flights.map((f) => `${f.name}: ${f.rounds.map((r) => `${r.name} ${r.matches.length}`).join(" · ")}`)).toMatchInlineSnapshot(`
      [
        "U12 GARÇONS - MATCH PLAY: 1/16e de Finale 16 · 1/8e de Finale 8 · 1/4 de Finale 4 · 1/2 Finale 2 · Finale 1",
      ]
    `);
    const d0 = (g.draws ?? []).find((r) => r.groups.length);
    expect(d0 && ggDrawToFpgDraw(d0).groups?.[0]).toMatchInlineSnapshot(`
      {
        "players": [
          {
            "clube": "GOLF DEPARTEMENTAL DE L'ESPERANCE",
            "hcp": 33.1,
            "nome": "Alexandre Rubal",
            "tee": null,
          },
          {
            "clube": "GOLF 3 COLLINES MATITI GUYANE",
            "hcp": 14.5,
            "nome": "Yliane Lesperance Zulemaro",
            "tee": null,
          },
          {
            "clube": "GOLF CLUB D'HOSSEGOR",
            "hcp": 12.9,
            "nome": "Pablo Ravasse Dulaurans",
            "tee": null,
          },
        ],
        "startHole": null,
        "tee": "Jaunes",
        "teeTime": "10:55",
      }
    `);
  });
});

describe("nomes, países e escalões", () => {
  it("«APELIDO(S) Nome» → «Nome Apelido(s)»", () => {
    expect(["CASTRO FERREIRA Ricardo", "LE THEO Maxence", "Dupont Jean"].map(normalizeName)).toMatchInlineSnapshot(`
      [
        "Ricardo Castro Ferreira",
        "Maxence Le Theo",
        "Dupont Jean",
      ]
    `);
  });
  it("país e siglas de divisão", () => {
    expect([ffgCountry({ nationality: "FRA" }), ffgCountry({ nationality: "POR" }), ffgCountry({ flag: "PT" })]).toMatchInlineSnapshot(`
      [
        "FR",
        "POR",
        "PT",
      ]
    `);
    expect(["U12G", "BF", "MINIME Fille", "U16 G"].map(divisionLabel)).toMatchInlineSnapshot(`
      [
        "Poussin Garçons (Sub 12)",
        "Benjamin Filles (Sub 14)",
        "Minime Filles (Sub 16)",
        "Minime Garçons (Sub 16)",
      ]
    `);
    expect(ffgEscaloesOfTournament("Grand Prix Jeunes U14", ["BG", "BF"])).toMatchInlineSnapshot(`
      [
        "Sub-14 (Benjamin)",
      ]
    `);
  });
});
