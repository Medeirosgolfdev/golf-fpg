import { describe, it, expect } from "vitest";
import fm2026Raw from "../../../public/data/ftm_fm_2026.json?raw";
import fm2025Raw from "../../../public/data/ftm_fm_2025.json?raw";
import evian2026Raw from "../../../public/data/evianjc_2026.json?raw";
import coc2025Raw from "../../../public/data/coc_2025.json?raw";
import ejt3Raw from "../../../public/data/ejt3_2026.json?raw";
import bjgt1011Raw from "../../../public/data/brjgt251_boys_10-11.json?raw";
import doral2025Raw from "../../../public/data/ftm_doral_2025.json?raw";
import catalogRaw from "../../../public/data/major-catalog.json?raw";
import { BLUEGOLF_FILES, normalizeBlueGolf, blueGolfToTournament, flagForLocation, type TDef } from "../major/bluegolf";
import { DORAL_FILES, normalizeDoralFile, doralEntryToTournament } from "../major/doral";
import { jobEntryId, jobFileDivisions, jobDivisionToTournament, type JobFile } from "../major/jobFile";
import { MAJOR_JOB_SOURCES, isBlueGolfSource } from "../major/majorLoader";
import type { Tournament, Player } from "../fpgTypes";

/**
 * Caracterização dos conversores da /major (tirados da MajorPage, BJGTPage e
 * DORALPage a 21/10/2026). Os valores foram tirados do código antigo — a
 * mudança de sítio não pode mexer em nada do que se vê: posição, gross, ±par,
 * desistências, buracos, par, tee, país/bandeira, jogadores e divisões.
 */

/** O que o leaderboard mostra de cada jogador, numa linha:
 *  pos | nome | país | gross | ±par | WD | buracos | par | Σpar | tee R1 | voltas */
function row(p: Player): string {
  const x = p as Player & { _wd?: boolean; wd?: boolean; _age?: number | null };
  const r1 = p.roundScores?.[0];
  return [
    p.pos, p.name, p.club, p.grossTotal, p.toPar, x._wd ?? x.wd ?? null, p.nholes, p.parTotal,
    (p.par || []).reduce((a, b) => a + b, 0), r1?.teeName ?? null, p.roundScores?.length ?? 0,
  ].map((v) => (v === undefined ? "–" : String(v))).join(" | ");
}
function top(t: Tournament, n = 3) { return t.players.slice(0, n).map(row); }

const parse = <T,>(s: string) => JSON.parse(s) as T;

describe("JobFile (GolfGenius/GolfBox) — jobFileDivisions / jobDivisionToTournament", () => {
  it("FM 2026: 4 escalões com draws, evolução de 2025", () => {
    const f26 = parse<JobFile>(fm2026Raw), f25 = parse<JobFile>(fm2025Raw);
    const divs = jobFileDivisions(f26, [f25, f26], (d) => d.division || "FM", true);
    expect(divs.map((d) => `${d.label}: ${d.results.players.length} jog, ${Object.keys(d.results._draws || {}).length} draws, ${d.evo?.size ?? 0} regressados`))
      .toMatchInlineSnapshot(`
        [
          "13 & 14: 127 jog, 2 draws, 75 regressados",
          "10 and Under: 44 jog, 1 draws, 14 regressados",
          "11 & 12: 78 jog, 2 draws, 52 regressados",
          "15-18: 232 jog, 3 draws, 82 regressados",
        ]
      `);
    expect(top(divs[0].results)).toMatchInlineSnapshot(`
      [
        "1 | Grey Ramsey | 🇺🇸 USA | 201 | -9 | null | 18 | 70 | 70 | Tee | 3",
        "2 | Martin Bustos | 🇺🇸 USA | 205 | -5 | null | 18 | 70 | 70 | Tee | 3",
        "3 | JT Stricklin IV | 🇺🇸 USA | 205 | -5 | null | 18 | 70 | 70 | Tee | 3",
      ]
    `);
    // ccode/tcode placeholder limpos (sem pill FPG).
    expect(divs[0].results.tcode).toBeUndefined();
    expect(jobEntryId("fm", f26, false)).toBe("fm:2026");
  });

  it("Evian Juniors Cup 2026: draws com HCP e país", () => {
    const f = parse<JobFile>(evian2026Raw);
    const [boys] = jobFileDivisions(f, [f], (d) => d.division || "Evian JC", true);
    expect(top(boys.results)).toMatchInlineSnapshot(`
      [
        "1 | Alan Rode | 🇫🇷 France | 203 | -10 | null | 18 | 71 | 71 | White | 3",
        "2 | Lionel Mutikainen | 🇫🇮 Finland | 208 | -5 | null | 18 | 71 | 71 | White | 3",
        "3 | Sunil Ramsamy | 🇫🇷 France | 209 | -4 | null | 18 | 71 | 71 | White | 3",
      ]
    `);
    const r1 = boys.results._draws!["1"];
    expect(r1.groups![0].players.slice(0, 2)).toMatchInlineSnapshot(`
      [
        {
          "clube": "🇫🇷 France",
          "hcp": -4.5,
          "nome": "Alan Rode",
          "tee": null,
        },
        {
          "clube": "🇺🇸 USA",
          "hcp": -4.1,
          "nome": "Wyatt Brindza",
          "tee": null,
        },
      ]
    `);
  });

  it("Champion of Champions 2025: 9 escalões", () => {
    const f = parse<JobFile>(coc2025Raw);
    const divs = f.divisions.map((dv) => jobDivisionToTournament(dv, dv.division, f.year, f.startDate));
    expect(divs.map((t) => `${t.name}: ${t.players.length} jog, ${t.rounds} voltas, ${t.players[0]?.nholes} buracos`)).toMatchInlineSnapshot(`
      [
        "Under 7 Boys: 8 jog, 3 voltas, 9 buracos",
        "Under 9 Boys: 39 jog, 3 voltas, 9 buracos",
        "Under 12 Boys: 60 jog, 3 voltas, 18 buracos",
        "Under 15 Boys: 40 jog, 3 voltas, 18 buracos",
        "Under 19 Boys: 33 jog, 3 voltas, 18 buracos",
        "Under 9 Girls: 8 jog, 3 voltas, 9 buracos",
        "Under 12 Girls: 21 jog, 3 voltas, 18 buracos",
        "Under 14 Girls: 23 jog, 3 voltas, 18 buracos",
        "Under 19 Girls: 16 jog, 3 voltas, 18 buracos",
      ]
    `);
    expect(top(divs[2])).toMatchInlineSnapshot(`
      [
        "1 | Leo Taylor | 🇬🇧 United Kingdom | 205 | -10 | null | 18 | 72 | 72 | null | 3",
        "2 | Taylor Kelly | 🇮🇪 Ireland | 210 | -5 | null | 18 | 72 | 72 | null | 3",
        "3 | Harry Tiernan | 🇮🇪 Ireland | 214 | -1 | null | 18 | 72 | 72 | null | 3",
      ]
    `);
  });

  it("Estonian Junior Tour 2026, etapa 3: id com a etapa, idades", () => {
    const f = parse<JobFile>(ejt3Raw);
    expect(jobEntryId("ejt", f)).toBe("ejt:2026:3");
    const t = jobDivisionToTournament(f.divisions[0], f.divisions[0].division, f.year, f.startDate);
    expect(t.players.slice(0, 3).map((p) => `${row(p)} | idade ${(p as Player & { _age?: number | null })._age} | hcp ${p.hcpExact ?? "–"}`))
      .toMatchInlineSnapshot(`
        [
          "1 | Arthur Marti Animägi | 🇪🇪 Estonia | 73 | 1 | null | 18 | 72 | 72 | Tee 6210m | 1 | idade 17 | hcp 3.2",
          "2 | Kris Kenzap | 🇪🇪 Estonia | 78 | 6 | null | 18 | 72 | 72 | Tee 6210m | 1 | idade 16 | hcp 7.4",
          "2 | Aivar Paalberg jr | 🇪🇪 Estonia | 78 | 6 | null | 18 | 72 | 72 | Tee 6210m | 1 | idade 19 | hcp -1",
        ]
      `);
  });
});

describe("BlueGolf — normalizeBlueGolf / blueGolfToTournament", () => {
  it("BJGT 2025 Boys 10-11", () => {
    const m = BLUEGOLF_FILES.find((x) => x.id === "2025_b1011")!;
    const data = normalizeBlueGolf(parse<unknown>(bjgt1011Raw));
    const def = { ...m, data } as unknown as TDef;
    const t = blueGolfToTournament(data, def);
    expect(`${t.name} · ${t.campo} · ${t.players.length} jog · ${t.rounds} voltas`).toMatchInlineSnapshot(`"2025 // Boys 10-11 · Villa Padierna — Flamingos · 36 jog · 3 voltas"`);
    expect(top(t, 5)).toMatchInlineSnapshot(`
      [
        "1 | Dmitrii Elchaninov | 🇷🇺 Russia | 205 | -8 | false | 18 | 71 | 71 | Villa Padierna | 3",
        "2 | Marcus Karim | 🇬🇧 United Kingdom | 218 | 5 | false | 18 | 71 | 71 | Villa Padierna | 3",
        "3 | Harrison Barnett | 🇬🇧 United Kingdom | 220 | 7 | false | 18 | 71 | 71 | Villa Padierna | 3",
        "4 | Julian Sepulveda | 🇺🇸 USA | 223 | 10 | false | 18 | 71 | 71 | Villa Padierna | 3",
        "5 | Mihir Pasura | 🇬🇧 United Kingdom | 229 | 16 | false | 18 | 71 | 71 | Villa Padierna | 3",
      ]
    `);
    // Quem não terminou fica sem posição e no fim.
    expect(t.players.filter((p) => p.pos == null).map(row)).toMatchInlineSnapshot(`
      [
        "null | Borja Enriquez Sainz de la Flor | 🇪🇸 Spain | 194 | 52 | true | 18 | 71 | 71 | Villa Padierna | 2",
      ]
    `);
  });

  it("bandeira por localidade: string toda, depois do último segmento para o primeiro", () => {
    expect(flagForLocation("Portugal")).toBe(flagForLocation("Lisboa, Portugal"));
    expect(flagForLocation("xx, yy")).toBe("🏳️");
  });
});

describe("Doral — normalizeDoralFile / doralEntryToTournament", () => {
  it("Doral 2025: escalões normalizados, metros e CR/Slope do escalão", () => {
    const src = DORAL_FILES.find((f) => f.url.includes("2025"))!.sourceUrl;
    const entries = normalizeDoralFile(parse(doral2025Raw), src);
    expect(entries.map((e) => `${e.id} · ${e.course} · ${e.nineHole ? 9 : 18}b · par ${e.parTotal} · CR ${e.cr ?? "–"}/${e.slope ?? "–"} · ${e.players.length} jog`)).toMatchInlineSnapshot(`
      [
        "2025_Boys_7_&_Under · Red Tiger · 9b · par 36 · CR –/– · 8 jog",
        "2025_Boys_8-9 · Red Tiger · 9b · par 36 · CR –/– · 21 jog",
        "2025_Boys_10-11 · Golden Palm · 18b · par 71 · CR 69.9/133 · 35 jog",
        "2025_Boys_12-13 · Silver Fox · 18b · par 71 · CR 74/140 · 70 jog",
        "2025_Boys_14-15 · Golden Palm · 18b · par 71 · CR 72/136 · 92 jog",
        "2025_Boys_16-18 · Blue Monster · 18b · par 71 · CR 74/140 · 93 jog",
        "2025_Girls_7_&_Under · Red Tiger · 18b · par 36 · CR –/– · 6 jog",
        "2025_Girls_8-9 · Red Tiger · 18b · par 36 · CR –/– · 12 jog",
        "2025_Girls_10-11 · Red Tiger · 18b · par 36 · CR –/– · 28 jog",
        "2025_Girls_12-13 · Golden Palm · 18b · par 71 · CR 71/134 · 15 jog",
        "2025_Girls_14-15 · Red Tiger · 9b · par 72 · CR –/– · 38 jog",
        "2025_Girls_16-18 · Red Tiger · 9b · par 72 · CR 75/140 · 50 jog",
      ]
    `);
    const b1011 = entries.find((e) => e.category === "Boys 10-11")!;
    expect(top(doralEntryToTournament(b1011), 4)).toMatchInlineSnapshot(`
      [
        "1 | Mauricio Mijares | 🇲🇽 Mexico | 148 | 6 | false | 18 | 71 | 71 | null | 2",
        "2 | Victor Monssoh | 🇺🇸 USA | 152 | 10 | false | 18 | 71 | 71 | null | 2",
        "3 | Stephen Sanders | 🇺🇸 USA | 154 | 12 | false | 18 | 71 | 71 | null | 2",
        "4 | Ignacio Beaujon | 🇺🇸 USA | 154 | 12 | false | 18 | 71 | 71 | null | 2",
      ]
    `);
  });
});

describe("catálogo: cada fonte tem quem a carregue, ids iguais aos do build-major-catalog.js", () => {
  it("todas as fontes do major-catalog.json são BlueGolf, Doral ou JobFile", () => {
    const cat = parse<{ entries: { id: string; source: string; year: number }[] }>(catalogRaw);
    const semLoader = [...new Set(cat.entries.map((e) => e.source))]
      .filter((s) => !isBlueGolfSource(s) && s !== "doral" && !MAJOR_JOB_SOURCES[s]);
    expect(semLoader).toEqual([]);
    // As fontes JobFile com etapa no id são as que lêem vários ficheiros por ano.
    const comEtapa = [...new Set(cat.entries.filter((e) => e.id.split(":").length === 3).map((e) => e.source))].sort();
    expect(comEtapa).toEqual(["ejt", "optimist"]);
  });
});
