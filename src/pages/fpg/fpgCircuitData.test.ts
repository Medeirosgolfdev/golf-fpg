import { describe, it, expect } from "vitest";
import type { Tournament, Player } from "../../data/fpgTypes";
import { buildJovensGroups, type EventGroup } from "../../ui/InscricoesComponents";
import {
  buildFpgEntries, buildFpgDivisions, buildJovensEntries, fpgMemberKey, fpgDivLabel,
  fpgRepDivision, resolveFpgTkey,
} from "./fpgCircuitData";
import { parseTournKey } from "../../utils/format";

const mkPlayer = (name: string, fedCode?: string): Player =>
  ({ scoreId: `${name}-1`, name, fedCode, playerCount: 0 } as unknown as Player);

const mkT = (o: Partial<Tournament> & { ccode: string; tcode: string; name: string; date: string }): Tournament =>
  ({ players: [], playerCount: 0, ...o } as Tournament);

const mkGroup = (o: Partial<EventGroup> & { key: string; date: string; name: string; entries: Tournament[] }): EventGroup =>
  ({ campo: "Campo X", ccode: o.entries[0]?.ccode ?? "000", ...o } as EventGroup);

const MANUEL = () => mkPlayer("Manuel Medeiros", "52884");

describe("fpgMemberKey", () => {
  it("gera a chave de URL do escalão e faz round-trip com parseTournKey", () => {
    const t = mkT({ ccode: "000", tcode: "10941", name: "Nacional Sub 12 H", date: "2026-05-01" });
    const key = fpgMemberKey(t);
    expect(key).toBe("000-10941");
    const parsed = parseTournKey(key);
    expect(parsed).toEqual({ ccode: "000", tcode: "10941" });
  });
});

describe("buildFpgEntries — evento de escalão único", () => {
  const t = mkT({
    ccode: "000", tcode: "10941", name: "Campeonato Nacional Sub 12 H",
    date: "2026-05-01", escalao: "Sub 12", players: [mkPlayer("Ana"), MANUEL()],
  });
  const entries = buildFpgEntries([mkGroup({ key: "2026-05-01-000", date: "2026-05-01", name: "Campeonato Nacional", entries: [t] })]);

  it("cria uma entrada com uma divisão", () => {
    expect(entries).toHaveLength(1);
    expect(entries[0].divisions).toHaveLength(1);
    expect(entries[0].divisionCount).toBe(1);
  });
  it("preenche year/dateStart/course/name/tcode", () => {
    const e = entries[0];
    expect(e.year).toBe(2026);
    expect(e.dateStart).toBe("2026-05-01");
    expect(e.name).toBe("Campeonato Nacional");
    expect(e.tcode).toBe("10941");
    expect(e.course).toBe("Campo X");
  });
  it("escalao único → e.escalao definido, e.escaloes vazio; memberIds e playerCount somados", () => {
    const e = entries[0];
    expect(e.escalao).toBe("Sub 12");
    expect(e.escaloes).toBeUndefined();
    expect(e.memberIds).toEqual(["000-10941"]);
    expect(e.playerCount).toBe(2);
    expect(e.hasManuel).toBe(true);
  });
  it("liga a divisão ao Tournament em results", () => {
    expect(entries[0].divisions![0].results).toBe(t);
  });
});

describe("buildFpgEntries — evento multi-escalão (Manuel num deles)", () => {
  const sub12h = mkT({ ccode: "000", tcode: "10941", name: "Nacional Sub 12 H", date: "2026-05-01", escalao: "Sub 12", players: [MANUEL(), mkPlayer("Rui")] });
  const sub12s = mkT({ ccode: "000", tcode: "10942", name: "Nacional Sub 12 S", date: "2026-05-01", escalao: "Sub 12", players: [mkPlayer("Beatriz")] });
  const sub14h = mkT({ ccode: "000", tcode: "10943", name: "Nacional Sub 14 H", date: "2026-05-01", escalao: "Sub 14", players: [mkPlayer("Diogo"), mkPlayer("Tiago")] });
  const entries = buildFpgEntries([mkGroup({ key: "2026-05-01-000", date: "2026-05-01", name: "Campeonato Nacional", entries: [sub12h, sub12s, sub14h] })]);
  const e = entries[0];

  it("uma entrada, três divisões, uma por escalão/tcode", () => {
    expect(entries).toHaveLength(1);
    expect(e.divisions).toHaveLength(3);
    expect(e.memberIds).toEqual(["000-10941", "000-10942", "000-10943"]);
  });
  it("escaloes agregados; e.escalao indefinido (>1 escalão)", () => {
    expect(e.escalao).toBeUndefined();
    expect(e.escaloes).toEqual(["Sub 12", "Sub 14"]);
  });
  it("hasManuel só na divisão do Manuel; entrada hasManuel=true; playerCount somado", () => {
    expect(e.hasManuel).toBe(true);
    expect(e.divisions!.map(d => d.hasManuel)).toEqual([true, false, false]);
    expect(e.playerCount).toBe(5);
  });
  it("sexo misto (H+S) → e.sex = 'Mixed'", () => {
    expect(e.sex).toBe("Mixed");
  });
});

describe("fpgRepDivision", () => {
  it("prefere a divisão do Manuel", () => {
    const divs = buildFpgDivisions(mkGroup({
      key: "g", date: "2026-05-01", name: "Nacional",
      entries: [
        mkT({ ccode: "000", tcode: "1", name: "Sub 14", date: "2026-05-01", escalao: "Sub 14", players: [mkPlayer("X")] }),
        mkT({ ccode: "000", tcode: "2", name: "Sub 12", date: "2026-05-01", escalao: "Sub 12", players: [MANUEL()] }),
      ],
    }));
    expect(fpgRepDivision(divs)!.key).toBe("000-2");
  });
  it("sem Manuel → primeira divisão", () => {
    const divs = buildFpgDivisions(mkGroup({
      key: "g", date: "2026-05-01", name: "Nacional",
      entries: [
        mkT({ ccode: "000", tcode: "1", name: "Sub 14", date: "2026-05-01", escalao: "Sub 14", players: [mkPlayer("X")] }),
        mkT({ ccode: "000", tcode: "2", name: "Sub 12", date: "2026-05-01", escalao: "Sub 12", players: [mkPlayer("Y")] }),
      ],
    }));
    expect(fpgRepDivision(divs)!.key).toBe("000-1");
  });
});

describe("fpgDivLabel", () => {
  it("prioridade _tabLabel", () => {
    expect(fpgDivLabel(mkT({ ccode: "0", tcode: "1", name: "X", date: "2026-01-01", escalao: "Sub 12", _tabLabel: "Sub 10 e 12" }), "X")).toBe("Sub 10 e 12");
  });
  it("depois escalao", () => {
    expect(fpgDivLabel(mkT({ ccode: "0", tcode: "1", name: "Nacional Sub 12", date: "2026-01-01", escalao: "Sub 12" }), "Nacional")).toBe("Sub 12");
  });
  it("sem escalao → sufixo distintivo do nome do grupo", () => {
    expect(fpgDivLabel(mkT({ ccode: "0", tcode: "1", name: "Academia Junior - 18 buracos", date: "2026-01-01" }), "Academia Junior")).toBe("18 buracos");
  });
  it("sem escalao nem sufixo → dd/mm", () => {
    expect(fpgDivLabel(mkT({ ccode: "0", tcode: "1", name: "Circuito Junior", date: "2026-03-08" }), "Circuito Junior")).toBe("08/03");
  });
});

// ── Vista Jovens (/FPG/jovens) no CircuitShell ─────────────────────────────
// Regional de Jovens da Madeira 2026 (clube 007): dois tcodes no mesmo dia,
// Sub 10&12 (11010) e Sub 14 a 24 (11011) — um evento, dois escalões.
describe("buildJovensEntries — Regional multi-escalão 007", () => {
  const sub10 = mkT({
    ccode: "007", tcode: "11010", date: "2026-04-17", escalao: "Sub 10",
    name: "Campeonato Regional de Jovens Sub 10&12 2026", campo: "Santo da Serra",
    players: [mkPlayer("A"), mkPlayer("B")], playerCount: 2,
  });
  const sub14 = mkT({
    ccode: "007", tcode: "11011", date: "2026-04-17", escalao: "Sub 14",
    name: "Campeonato Regional de Jovens Sub 14 a 24 2026", campo: "Santo da Serra",
    players: [mkPlayer("C"), MANUEL(), mkPlayer("D")], playerCount: 3,
  });
  const groups = buildJovensGroups([sub10, sub14]);
  const entries = buildJovensEntries(groups);

  it("um evento → uma entrada com uma divisão por tcode (a chave é a do URL)", () => {
    expect(groups).toHaveLength(1);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(groups[0].key);
    expect(entries[0].memberIds).toEqual(["007-11010", "007-11011"]);
    expect(entries[0].divisions!.map(d => d.results)).toEqual([sub10, sub14]);
    expect(entries[0].year).toBe(2026);
    expect(entries[0].playerCount).toBe(5);
    expect(entries[0].hasManuel).toBe(true);
  });
  it("/FPG/torneio/007-11011 abre o mesmo evento no escalão Sub 14 a 24", () => {
    expect(resolveFpgTkey(entries, "007-11011")).toEqual({ id: entries[0].id, divKey: "007-11011" });
    expect(resolveFpgTkey(entries, "007-11010")).toEqual({ id: entries[0].id, divKey: "007-11010" });
  });
  it("a divisão por omissão é a do Manuel", () => {
    expect(fpgRepDivision(entries[0].divisions!)!.key).toBe("007-11011");
  });
});

describe("buildJovensEntries — ano da edição e torneios por disputar", () => {
  it("o ano vem de _jovensYear (o que agrupa a sidebar), não da data", () => {
    const t = mkT({ ccode: "000", tcode: "9001", name: "Campeonato Nacional de Jovens", date: "2019-01-05", escalao: "Sub 12", _jovensYear: "2018" } as Partial<Tournament> & { ccode: string; tcode: string; name: string; date: string });
    const [e] = buildJovensEntries(buildJovensGroups([t]));
    expect(e.year).toBe(2018);
  });
  it("sem jogadores (só inscrições) conta o playerCount", () => {
    const t = mkT({ ccode: "000", tcode: "10941", name: "Campeonato Nacional de Jovens Sub 12", date: "2026-05-01", escalao: "Sub 12", players: [], playerCount: 19 });
    const [e] = buildJovensEntries(buildJovensGroups([t]));
    expect(e.playerCount).toBe(19);
  });
});

describe("resolveFpgTkey", () => {
  const t = mkT({ ccode: "000", tcode: "10935+10936", name: "Nacional", date: "2026-05-01", escalao: "Sub 12" });
  const entries = buildFpgEntries([mkGroup({ key: "g1", date: "2026-05-01", name: "Nacional", entries: [t] })]);
  it("tcode sintético A+B: o URL leva só um dos tcodes", () => {
    expect(resolveFpgTkey(entries, "000-10936")).toEqual({ id: "g1", divKey: "000-10935+10936" });
  });
  it("sem tkey, tkey inválido ou de outro clube → vazio", () => {
    expect(resolveFpgTkey(entries, undefined)).toEqual({});
    expect(resolveFpgTkey(entries, "lixo")).toEqual({});
    expect(resolveFpgTkey(entries, "007-10935")).toEqual({});
  });
});

describe("labelIsEscalao (filtro «Escalão» da /FPG)", () => {
  it("aceita escalões e recusa datas e «9 buracos»", async () => {
    const { labelIsEscalao } = await import("./fpgCircuitData");
    for (const ok of ["Sub 14", "Sub-12", "S18", "Absoluto", "Seniores", "Juvenil", "Mid-Amateur"]) expect(labelIsEscalao(ok)).toBe(true);
    for (const no of ["01/02", "05/09", "9 buracos", "9 HOLES", "9buracos", "Esc", "R2"]) expect(labelIsEscalao(no)).toBe(false);
  });
});
