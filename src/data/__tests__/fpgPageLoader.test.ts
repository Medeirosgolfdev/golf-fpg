import { describe, it, expect } from "vitest";
import {
  dedupDisplayTournaments, enrichAdmDraws, sameTournamentName,
  jovensCandidates, selectJovens, mergeJovensWithAdmissions, buildTcodePills,
} from "../fpgPageLoader";
import { buildJovensGroups } from "../../ui/InscricoesComponents";
import type { Tournament, Player } from "../fpgTypes";
import type { FpgTournamentData, FpgDraw, FpgAdmissions } from "../nacional2026Loader";
import type { MelhoriasJson } from "../melhoriasTypes";

/** Torneio mínimo (só os campos que as funções lêem). */
function mkT(p: Partial<Tournament> & { name: string; ccode: string; tcode: string }): Tournament {
  return { date: "2026-05-01", campo: "Campo", players: [], playerCount: 0, escalao: null, ...p } as Tournament;
}
/** Jogador com `n` rondas jogadas. */
function mkP(name: string, n: number, fed = "1"): Player {
  return {
    scoreId: name, name, fed, fedCode: fed, pos: 1, grossTotal: 72 * n, toPar: 0,
    roundScores: Array.from({ length: n }, (_, i) => ({ round: i + 1, gross: 72, scores: [], pars: [], si: [], meters: [] })),
  } as Player;
}
const draw: Record<string, FpgDraw> = { "1": { name: "Draw R1", groups: [] } };
const adm: FpgAdmissions = { totalInscritos: 2, players: [] };

describe("dedupDisplayTournaments (displayList)", () => {
  it("o mesmo ccode/tcode em dois pull-torneios → fica a versão com mais rondas", () => {
    const parcial = mkT({ name: "Amendoeira", ccode: "100", tcode: "1", players: [mkP("A", 2)] });
    const final = mkT({ name: "Amendoeira", ccode: "100", tcode: "1", players: [mkP("A", 3)] });
    const out = dedupDisplayTournaments([parcial, final], []);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(final);
  });

  it("a versão jovem enxerta inscrições/draws/extraLinks na versão com resultados", () => {
    const res = mkT({ name: "Miramar U25", ccode: "200", tcode: "2", players: [mkP("A", 1)] });
    const jov = mkT({ name: "Miramar U25", ccode: "200", tcode: "2", _admissions: adm, _draws: draw,
      extraLinks: [{ label: "Clube", url: "https://x" }] });
    const [t] = dedupDisplayTournaments([res], [jov]);
    expect(t.players).toBe(res.players);
    expect(t._admissions).toBe(adm);
    expect(t._draws).toBe(draw);
    expect(t.extraLinks?.[0].label).toBe("Clube");
  });

  it("um jovem com ccode/tcode novo entra tal como está", () => {
    const a = mkT({ name: "Torneio A", ccode: "300", tcode: "3" });
    const j = mkT({ name: "Nacional Sub 12", ccode: "000", tcode: "9" });
    expect(dedupDisplayTournaments([a], [j]).map(t => t.tcode)).toEqual(["3", "9"]);
  });

  it("o mesmo torneio com outro ccode-tcode (nome+data+campo) → uma entrada, _mergedFrom", () => {
    const comRes = mkT({ name: "Troféu João Sousa", ccode: "011", tcode: "50", players: [mkP("A", 1), mkP("B", 1, "2")] });
    const soDraw = mkT({ name: "Trofeu Joao Sousa", ccode: "999", tcode: "77", _draws: draw });
    const out = dedupDisplayTournaments([soDraw, comRes], []);
    expect(out).toHaveLength(1);
    expect(out[0].tcode).toBe("50");
    expect(out[0]._draws).toBe(draw);
    expect(out[0]._mergedFrom).toBe("999-77");
  });

  it("drives sem o Manuel saem (vivem na /drive); com o Manuel ficam", () => {
    const semM = mkT({ name: "Drive Tour Sul", ccode: "988", tcode: "5" });
    const comM = mkT({ name: "Drive Tour Norte", ccode: "987", tcode: "6", players: [mkP("Manuel Medeiros", 1, "52884")] });
    expect(dedupDisplayTournaments([semM, comM], []).map(t => t.tcode)).toEqual(["6"]);
  });
});

describe("enrichAdmDraws (inscrições/draws com verificação de nome)", () => {
  const idx = (d: Partial<FpgTournamentData>) =>
    new Map<string, FpgTournamentData>([["011-50", { ccode: "011", tcode: "50", name: null, date: null, ...d }]]);

  it("nome igual → recebe inscrições e draws do fpg-admissions-draws", () => {
    const t = enrichAdmDraws(mkT({ name: "Troféu João Sousa", ccode: "011", tcode: "50" }),
      idx({ name: "TROFÉU JOÃO SOUSA", admissions: adm, draws: draw }));
    expect(t._admissions).toBe(adm);
    expect(t._draws).toBe(draw);
  });

  it("tcode reutilizado com outro nome → não recebe nada (ficam as embebidas)", () => {
    const proprias: FpgAdmissions = { totalInscritos: 9 };
    const t = enrichAdmDraws(mkT({ name: "Troféu João Sousa", ccode: "011", tcode: "50", admissions: proprias }),
      idx({ name: "Final Drive Challenge Jamor", admissions: adm, draws: draw }));
    expect(t._admissions).toBe(proprias);
    expect(t._draws).toBeUndefined();
  });

  it("draws embebidos ganham; `draws: {}` vazio não tapa os do ficheiro", () => {
    const emb: Record<string, FpgDraw> = { "1": { name: "embebido" } };
    const a = enrichAdmDraws(mkT({ name: "Regional", ccode: "011", tcode: "50", draws: emb }), idx({ name: "Regional", draws: draw }));
    expect(a._draws).toBe(emb);
    const b = enrichAdmDraws(mkT({ name: "Regional", ccode: "011", tcode: "50", draws: {} }), idx({ name: "Regional", draws: draw }));
    expect(b._draws).toBe(draw);
  });

  it("sameTournamentName aceita abreviaturas e nomes em falta", () => {
    expect(sameTournamentName("Drive Chall Tejo", "Drive Chall Tejo - Belas")).toBe(true);
    expect(sameTournamentName(null, "Qualquer")).toBe(true);
    expect(sameTournamentName("Troféu A", "Taça B")).toBe(false);
  });
});

describe("Jovens: candidatos, filtros e grupos", () => {
  it("o sintético (só inscrições) dá lugar à versão com resultados e passa-lhe as inscrições", () => {
    const sint = mkT({ name: "Amendoeira World Kids", ccode: "400", tcode: "4", _admissions: adm });
    const real = mkT({ name: "Amendoeira World Kids", ccode: "400", tcode: "4", players: [mkP("A", 3)] });
    const [t] = jovensCandidates([sint], [real]);
    expect(t.players).toHaveLength(1);
    expect(t._admissions).toBe(adm);
  });

  it("entram os juvenis pelo nome; ficam de fora PJA, Academia Militar e adultos", () => {
    const ts = [
      mkT({ name: "Vila Sol Junior Open", ccode: "1", tcode: "1" }),
      mkT({ name: "Torneio CityKids", ccode: "1", tcode: "2" }),
      mkT({ name: "Taça Yeatman Júnior", ccode: "1", tcode: "3" }),
      mkT({ name: "PJA Junior Tour", ccode: "1", tcode: "4" }),
      mkT({ name: "Torneio Academia Militar", ccode: "1", tcode: "5" }),
      mkT({ name: "Campeonato Mid-Amateur", ccode: "1", tcode: "6" }),
    ];
    expect(jovensCandidates([], ts).map(t => t.tcode)).toEqual(["1", "2", "3"]);
  });

  it("selectJovens: sem Drive, sem clubes em match play, ano, pesquisa e ★Manuel", () => {
    const base = [
      mkT({ name: "Regional Sub 12", ccode: "007", tcode: "1", date: "2026-04-17" }),
      mkT({ name: "Drive Tour Jovens", ccode: "007", tcode: "2" }),
      mkT({ name: "Regional de Clubes Jovens", ccode: "059", tcode: "10685" }),
      mkT({ name: "Nacional Sub 14", ccode: "000", tcode: "3", date: "2025-07-01", campo: "Aroeira" }),
      mkT({ name: "Nacional Sub 12", ccode: "000", tcode: "4", date: "2026-05-01", players: [mkP("Manuel Medeiros", 1, "52884")] }),
    ];
    const all = { filterManuel: false, yearFilter: null, searchTerm: "" };
    expect(selectJovens(base, all).map(t => t.tcode)).toEqual(["1", "3", "4"]);
    expect(selectJovens(base, { ...all, yearFilter: "2025" }).map(t => t.tcode)).toEqual(["3"]);
    expect(selectJovens(base, { ...all, searchTerm: "aroeira" }).map(t => t.tcode)).toEqual(["3"]);
    expect(selectJovens(base, { ...all, filterManuel: true }).map(t => t.tcode)).toEqual(["4"]);
  });

  it("buildJovensGroups agrupa os escalões do mesmo evento num só grupo", () => {
    const ts = selectJovens(jovensCandidates([
      mkT({ name: "Campeonato Nacional de Jovens Sub 12", ccode: "000", tcode: "10", escalao: "Sub 12", _jovensYear: "2026" }),
      mkT({ name: "Campeonato Nacional de Jovens Sub 14", ccode: "000", tcode: "11", escalao: "Sub 14", _jovensYear: "2026" }),
    ], []), { filterManuel: false, yearFilter: null, searchTerm: "" });
    const groups = buildJovensGroups(ts);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map(e => e.tcode).sort()).toEqual(["10", "11"]);
  });

  it("mergeJovensWithAdmissions: dedup, inscrições e torneios só-inscrições pelo nome", () => {
    const rows = [
      mkT({ name: "Regional Sub 10", ccode: "007", tcode: "1" }),
      mkT({ name: "Regional Sub 10 (cópia)", ccode: "007", tcode: "1" }),
    ];
    const idx = new Map<string, FpgTournamentData>([
      ["007-1", { ccode: "007", tcode: "1", name: "Regional Sub 10", date: "2026-04-01", admissions: adm, draws: draw }],
      ["004-9", { ccode: "004", tcode: "9", name: "Torneio Junior Sub 14", date: "2026-06-01", admissions: { totalInscritos: 5 } }],
      ["004-8", { ccode: "004", tcode: "8", name: "Torneio Seniores", date: "2026-06-01", admissions: { totalInscritos: 5 } }],
    ]);
    const out = mergeJovensWithAdmissions(rows, idx);
    expect(out.map(t => `${t.ccode}-${t.tcode}`)).toEqual(["007-1", "004-9"]);
    expect(out[0].name).toBe("Regional Sub 10");
    expect(out[0]._draws).toBe(draw);
    expect(out[1].players).toEqual([]);
    expect(out[1]._jovensYear).toBe("2026");
    expect(out[1].playerCount).toBe(5);
  });
});

describe("buildTcodePills", () => {
  it("tira os tcodes dos links das entradas com pill", () => {
    const m = {
      "52884": {
        "s1": { pill: "REGIONAL", links: { d1: "https://x?tcode=111&x=1", d2: "https://x?tcode=112" } },
        "s2": { links: { d1: "https://x?tcode=999" } },
      },
    } as unknown as MelhoriasJson;
    expect(buildTcodePills(m)).toEqual({ "111": "REGIONAL", "112": "REGIONAL" });
  });
});
