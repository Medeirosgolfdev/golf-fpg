import { describe, it, expect, beforeAll } from "vitest";
import { useRealDataFetch } from "./realDataFetch";
import { loadDriveAdmissions, loadDriveData } from "../driveLoader";
import { attachDriveAdmissions, buildDriveSource, filterDriveSource } from "../driveSource";
import { buildDriveEntries } from "../driveCircuitData";
import { driveEntriesByEsc, resolveEscForTournament } from "../driveSub12";
import { buildEscLookup } from "../../../utils/playerUtils";
import { buildTemporalEscLookup } from "../../fpgUtils";
import type { Tournament } from "../../fpgTypes";
import type { PlayersDB } from "../../../ui/tournamentPrimitives";

/** Decisão H: «Classificação» Sub 12 no Tour (divisões sem escalão) deixava a
 *  lista vazia. Agora fica cada torneio só com os jogadores desse escalão, com as
 *  posições refeitas em cópias. */
let src: Tournament[] = [];
let expanded: Tournament[] = [];
let pdb: PlayersDB = {};
beforeAll(async () => {
  useRealDataFetch();
  const d = await loadDriveData();
  const { idx } = await loadDriveAdmissions();
  attachDriveAdmissions(d.raw, idx);
  src = buildDriveSource(d.raw, idx);
  expanded = d.tournaments;
  pdb = d.players;
}, 120000);

describe("Classificação por escalão com os dados reais (decisão H)", () => {
  it("Tour 2026 com Sub 12: torneios com jogadores Sub 12, posições 1.., objectos partilhados intactos", () => {
    const escLookup = buildEscLookup(pdb, expanded);
    const temporal = buildTemporalEscLookup(expanded);
    const escOf = (p: Tournament["players"][number], t: Tournament) => resolveEscForTournament(p, t, escLookup, pdb, temporal);
    const ents = buildDriveEntries(filterDriveSource(src, { series: "tour", year: "2026", region: null }));
    const posAntes = ents.flatMap(e => e.divisions!.flatMap(d => (d.results?.players ?? []).map(p => p.pos)));
    const out = driveEntriesByEsc(ents, ["Sub 12"], escOf);
    expect(out.length).toBeGreaterThan(5);
    for (const e of out) for (const d of e.divisions!) {
      const ps = d.results!.players;
      if (!ps.length) continue;
      for (const p of ps) expect(escOf(p, d.results!)).toBe("Sub 12");
      expect(ps.some(p => p.pos === 1)).toBe(true);
    }
    expect(ents.flatMap(e => e.divisions!.flatMap(d => (d.results?.players ?? []).map(p => p.pos)))).toEqual(posAntes);
  });
  it("Challenge: os eventos ficam com todos os escalões (como hoje)", () => {
    const ents = buildDriveEntries(filterDriveSource(src, { series: "challenge", year: "2026", region: null }));
    const out = driveEntriesByEsc(ents, ["Sub 12"], () => "");
    const ev = out.find(e => (e.divisions?.length ?? 0) > 2)!;
    expect(ev.divisions!.length).toBe(ents.find(e => e.id === ev.id)!.divisions!.length);
    expect(out.every(e => e.divisions!.some(d => d.escalao === "Sub 12"))).toBe(true);
  });
});
