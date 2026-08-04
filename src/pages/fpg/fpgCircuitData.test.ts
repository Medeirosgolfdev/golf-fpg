import { describe, it, expect } from "vitest";
import type { Tournament, Player } from "../../data/fpgTypes";
import type { EventGroup } from "../../ui/InscricoesComponents";
import { buildFpgEntries, buildFpgDivisions, fpgMemberKey, fpgDivLabel, fpgRepDivision } from "./fpgCircuitData";
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
