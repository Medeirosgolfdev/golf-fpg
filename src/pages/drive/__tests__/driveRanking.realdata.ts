import { describe, it, expect, beforeAll } from "vitest";
import { useRealDataFetch } from "../../../data/drive/__tests__/realDataFetch";
import { loadDriveAdmissions, loadDriveData } from "../../../data/drive/driveLoader";
import { attachDriveAdmissions, buildDriveSource, filterDriveSource } from "../../../data/drive/driveSource";
import { buildDriveEntries } from "../../../data/drive/driveCircuitData";
import { buildSub12Data, filterBySub12Series } from "../../../data/drive/driveSub12";
import { buildEscLookup } from "../../../utils/playerUtils";
import { buildTemporalEscLookup } from "../../../data/fpgUtils";
import { driveRanking, rankingTournaments, seasonEscalao } from "../driveRanking";
import type { Tournament } from "../../../data/fpgTypes";
import type { PlayersDB } from "../../../ui/tournamentPrimitives";

/** Decisões D e G: o Ranking do Drive é a capacidade `ranking` do CircuitShell —
 *  as linhas saem dos torneios visíveis; os pontos são os de sempre. */
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

const deps = (over = {}) => {
  const escLookup = buildEscLookup(pdb, expanded);
  const temporal = buildTemporalEscLookup(expanded);
  return { expanded, pdb, escLookup, temporal, fedBirthdates: new Map<string, string>(), series: "tour" as const, seriesAll: "tour" as const,
    year: "2026", esc: "Sub 12", sex: "all", search: "", view: "ranking" as const, selected: null,
    set: () => {}, setSearch: () => {}, setSelected: () => {}, ...over };
};

describe("Ranking do Drive como capacidade do shell (D/G)", () => {
  it("Tour 2026 Sub 12: os mesmos jogadores e pontos que o Ranking Sub-12 de antes", () => {
    const d = deps();
    const ents = buildDriveEntries(filterDriveSource(src, { series: "tour", year: "2026", region: null }));
    const rows = driveRanking(d).rows!({ entries: ents, scope: "view" });
    const antes = filterBySub12Series(buildSub12Data(expanded.filter(t => t.date?.startsWith("2026")), pdb, d.escLookup, d.temporal, new Map(), "Sub 12"), "tour");
    const pts = (rs: { fed: string; totalPts: number }[]) => rs.map(r => [r.fed, r.totalPts]).sort();
    expect(rows.length).toBeGreaterThan(5);
    expect(pts(rows)).toEqual(pts(antes));
  });
  it("só os torneios originais (volta única ou Resumo) das entradas", () => {
    const ents = buildDriveEntries(filterDriveSource(src, { series: "tour", year: "2026", region: "madeira" }));
    const ts = rankingTournaments(ents, expanded);
    expect(ts.length).toBe(4);
    expect(ts.every(t => t.region === "madeira" && (!t._roundLabel || t._roundLabel === "Resumo"))).toBe(true);
  });
  it("«Época»: o escalão é o da divisão aberta quando é Sub N", () => {
    expect(seasonEscalao("Sub 14")).toBe("Sub 14");
    expect(seasonEscalao("—")).toBe("all");
    expect(seasonEscalao("Masculino")).toBe("all");
    const ents = buildDriveEntries(filterDriveSource(src, { series: "tour", year: "2026", region: "madeira" }));
    const rows = driveRanking(deps()).rows!({ entries: ents, scope: "season", division: "—" });
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.some(r => r.esc === "Sub 16")).toBe(true);
  });
});
