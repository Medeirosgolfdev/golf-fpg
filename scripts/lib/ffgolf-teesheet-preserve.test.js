import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { preserveTeesheet } = require("./ffgolf-teesheet-preserve.js");

// A rota Playwright (scrape-ffgolf.js) gravava o slug como nome, fases vazias e
// voltas sem data por cima do ficheiro completo da rota fetch (CFJ 2026, 26/10).
describe("preserveTeesheet — nome, fases e datas das voltas", () => {
  const anterior = {
    tournament: "CFJ - U12 Garçons", slug: "cfj-u12", divisions: ["Qualification T1 (Mon, Jul", "Finale"],
    players: [{ id: "1", name: "BOUE Arthur", rounds: [{ round: 1, gross: 85, date: "Mon, July 20", dateIso: "2026-07-20" }] }],
  };
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ffg-")), "f.json");
  fs.writeFileSync(tmp, JSON.stringify(anterior));

  it("repõe o que o scrape novo não traz", () => {
    const novo = { tournament: "cfj-u12", slug: "cfj-u12", divisions: [], players: [{ id: "1", name: "BOUE Arthur", rounds: [{ round: 1, gross: 85 }] }] };
    const st = preserveTeesheet(tmp, novo);
    expect([novo.tournament, novo.divisions.length, novo.players[0].rounds[0].dateIso]).toEqual(["CFJ - U12 Garçons", 2, "2026-07-20"]);
    expect(st).toMatchObject({ nome: 1, divisions: 2, datas: 1 });
  });
  it("não mexe no que o scrape novo já traz", () => {
    const novo = { tournament: "CFJ - U12 Garçons (novo)", slug: "cfj-u12", divisions: ["X"], players: [{ id: "1", name: "BOUE Arthur", rounds: [{ round: 1, dateIso: "2026-07-21" }] }] };
    preserveTeesheet(tmp, novo);
    expect([novo.tournament, novo.divisions, novo.players[0].rounds[0].dateIso]).toEqual(["CFJ - U12 Garçons (novo)", ["X"], "2026-07-21"]);
  });
});
