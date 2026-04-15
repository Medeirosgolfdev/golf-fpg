/**
 * KIDSdataLoader.test.ts
 *
 * Testes para as funções core do loader de rivais internacionais.
 * Foco nos bugs documentados no CLAUDE.md:
 *   - Scores negativos em torneios de 9 buracos
 *   - tp só calculado com scorecards completos
 *   - Filtro Boys 9-13
 *   - mergeInto dedup e forceTids
 *   - normName diacríticos
 *   - Formato v1 vs v2 dos torneios completos
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  normName,
  co,
  shortenTournName,
  mergeInto,
  processUskidsCompleto,
  processMemberHistory,
  processWjgc,
  processDoral,
  processPullTorneios,
  processManuelOverrides,
  uskTournNames,
  uskFieldSizes,
  type AutoRivalPlayer,
} from "../../data/KIDSdataLoader";

/* ═══════════════════════════════════════════
   normName — normalização de nomes
   ═══════════════════════════════════════════ */
describe("normName", () => {
  it("lowercase e trim", () => {
    expect(normName("  Manuel Medeiros  ")).toBe("manuel medeiros");
  });

  it("colapsa espaços múltiplos", () => {
    expect(normName("Manuel   Francisco   Medeiros")).toBe("manuel francisco medeiros");
  });

  it("remove diacríticos", () => {
    expect(normName("José André Gonçalves")).toBe("jose andre goncalves");
  });

  it("normaliza nomes iguais com acentos diferentes", () => {
    expect(normName("João")).toBe(normName("Joao"));
    expect(normName("Zürich")).toBe(normName("Zurich"));
  });

  it("string vazia", () => {
    expect(normName("")).toBe("");
    expect(normName("   ")).toBe("");
  });
});

/* ═══════════════════════════════════════════
   co — conversão de código de país
   ═══════════════════════════════════════════ */
describe("co", () => {
  it("converte código ISO para nome completo", () => {
    expect(co("PT")).toBe("Portugal");
    expect(co("US")).toBe("United States");
    expect(co("GB")).toBe("United Kingdom");
  });

  it("case-insensitive", () => {
    expect(co("pt")).toBe("Portugal");
    expect(co("Pt")).toBe("Portugal"); // falls to toUpperCase
  });

  it("suporta variantes (UK = GB)", () => {
    expect(co("UK")).toBe("United Kingdom");
  });

  it("retorna o input original se não mapeado", () => {
    expect(co("XYZ")).toBe("XYZ");
  });

  it("trata strings vazias e null-ish", () => {
    expect(co("")).toBe("");
    expect(co(null as unknown as string)).toBe("");
    expect(co(undefined as unknown as string)).toBe("");
  });
});

/* ═══════════════════════════════════════════
   shortenTournName — abreviatura de nomes
   ═══════════════════════════════════════════ */
describe("shortenTournName", () => {
  it("World Championship → WC + ano", () => {
    expect(shortenTournName("World Championship 2025")).toBe("WC 25");
  });

  it("European Championship → EC + ano", () => {
    expect(shortenTournName("European Championship 2024")).toBe("EC 24");
  });

  it("Venice Open → Venice + ano", () => {
    expect(shortenTournName("Venice Open 2023")).toBe("Venice 23");
  });

  it("Marco Simone → Marco + ano", () => {
    expect(shortenTournName("Marco Simone Invitational 2026")).toBe("Marco 26");
  });

  it("Rome Classic → Rome + ano", () => {
    expect(shortenTournName("Rome Classic 2025")).toBe("Rome 25");
  });

  it("El Prat → El Prat (sem ano)", () => {
    expect(shortenTournName("Real Club de Golf El Prat")).toBe("El Prat");
  });

  it("Red White & Blue → RWB + ano", () => {
    expect(shortenTournName("Red White & Blue Invitational 2024")).toBe("RWB 24");
  });
});

/* ═══════════════════════════════════════════
   mergeInto — merge de jogadores com dedup
   ═══════════════════════════════════════════ */
describe("mergeInto", () => {
  it("adiciona jogador novo ao map", () => {
    const map = new Map<string, AutoRivalPlayer>();
    const players: AutoRivalPlayer[] = [
      { n: "John Smith", co: "United States", r: { t1: { p: 1, t: 72, tp: 0, rd: [72] } } },
    ];
    mergeInto(map, players);
    expect(map.size).toBe(1);
    expect(map.get("john smith")!.r.t1.p).toBe(1);
  });

  it("merge torneios de jogadores com mesmo nome normalizado", () => {
    const map = new Map<string, AutoRivalPlayer>();
    mergeInto(map, [
      { n: "João Silva", co: "Portugal", r: { t1: { p: 1, t: 72, tp: 0, rd: [72] } } },
    ]);
    mergeInto(map, [
      { n: "Joao Silva", co: "Portugal", r: { t2: { p: 3, t: 80, tp: 8, rd: [80] } } },
    ]);
    expect(map.size).toBe(1);
    const player = map.get("joao silva")!;
    expect(player.r.t1).toBeDefined();
    expect(player.r.t2).toBeDefined();
  });

  it("não sobrescreve torneio existente com menos rondas", () => {
    const map = new Map<string, AutoRivalPlayer>();
    mergeInto(map, [
      { n: "Test Player", co: "US", r: { t1: { p: 1, t: 150, tp: 6, rd: [74, 76] } } },
    ]);
    mergeInto(map, [
      { n: "Test Player", co: "US", r: { t1: { p: 5, t: 80, tp: 8, rd: [80] } } },
    ]);
    const player = map.get("test player")!;
    expect(player.r.t1.rd).toHaveLength(2); // mantém as 2 rondas
  });

  it("forceTids sobrescreve mesmo com menos rondas", () => {
    const map = new Map<string, AutoRivalPlayer>();
    mergeInto(map, [
      { n: "Test Player", co: "US", r: { t1: { p: 1, t: 150, tp: 6, rd: [74, 76] } } },
    ]);
    const force = new Set(["t1"]);
    mergeInto(map, [
      { n: "Test Player", co: "US", r: { t1: { p: 5, t: 80, tp: 8, rd: [80] } } },
    ], force);
    const player = map.get("test player")!;
    expect(player.r.t1.rd).toHaveLength(1); // sobrescrito pelo force
    expect(player.r.t1.p).toBe(5);
  });

  it("propaga memberId se o existente não tiver", () => {
    const map = new Map<string, AutoRivalPlayer>();
    mergeInto(map, [
      { n: "Test", co: "US", r: { t1: { p: 1, t: 72, tp: 0, rd: [72] } } },
    ]);
    mergeInto(map, [
      { n: "Test", co: "US", r: { t2: { p: 2, t: 75, tp: 3, rd: [75] } }, memberId: "12345" },
    ]);
    expect(map.get("test")!.memberId).toBe("12345");
  });
});

/* ═══════════════════════════════════════════
   processUskidsCompleto — formato v1
   Bug documentado: scores negativos em 9 buracos
   ═══════════════════════════════════════════ */
describe("processUskidsCompleto", () => {
  beforeEach(() => {
    uskTournNames.clear();
    uskFieldSizes.clear();
  });

  // Fixture: torneio v1 minimal com 18 buracos
  const makeV1Tourn = (opts: {
    tcode: number;
    startDate: string;
    minAge: number;
    holes: number;
    pars: number[];
    players: Record<string, { first: string; last: string; country: string; rounds: Record<string, { strokes: number[] }> }>;
  }) => [{
    t: opts.tcode,
    meta: {
      tournament: { name: `Test Tournament ${opts.tcode}`, start_date: opts.startDate, rounds: 1 },
      age_groups: {
        "100": { name: `Boys ${opts.minAge}`, gender: "Boys", min_age: opts.minAge, holes_per_round: opts.holes },
      },
      flights: { "200": { age_group: "100" } },
      flight_courses: {
        "300": { course: 1, pars: opts.pars, lengths: opts.pars.map(() => 350) },
      },
      flight_rounds: {
        "300": { flight: "200", round: 1, course: 1, date: opts.startDate },
      },
    },
    flights: [{
      flight_id: "200",
      rounds_data: {
        r1_t0: { flight_players: opts.players },
      },
    }],
  }];

  it("processa torneio 18H com scores válidos", () => {
    const par18 = [4,4,3,5,4,3,4,5,4, 4,3,5,4,4,3,5,4,4]; // par 72
    const strokes18 = [4,5,3,5,4,3,4,6,4, 4,3,5,5,4,3,5,4,5]; // gross 76, tp +4

    const data = makeV1Tourn({
      tcode: 99999, startDate: "3/15/2024", minAge: 10, holes: 18,
      pars: par18,
      players: {
        p1: { first: "Test", last: "Player", country: "pt",
          rounds: { "1": { strokes: strokes18, flight_round: "300" } as any } },
      },
    });

    const result = processUskidsCompleto(data);
    expect(result.length).toBeGreaterThan(0);
    const player = result.find(r => normName(r.n) === "test player");
    expect(player).toBeDefined();

    const tourn = player!.r["usk99999_b10"];
    expect(tourn).toBeDefined();
    expect(tourn.t).toBe(76);
    expect(tourn.tp).toBe(4); // 76 - 72 = +4
    expect(tourn.rd).toEqual([76]);
  });

  it("rejeita rondas 9H com gross < nholes (bug dos scores negativos)", () => {
    const strokes9 = [4,5,3,5,4,3,4,6,4]; // gross = 38, 9 buracos

    const data = makeV1Tourn({
      tcode: 88888, startDate: "3/15/2024", minAge: 10, holes: 9,
      pars: [4,4,3,5,4,3,4,5,4], // par 9H = 36
      players: {
        p1: { first: "Test", last: "Nine", country: "pt",
          rounds: { "1": { strokes: strokes9, flight_round: "300" } as any } },
      },
    });

    const result = processUskidsCompleto(data);
    const player = result.find(r => normName(r.n) === "test nine");
    expect(player).toBeDefined();

    const tourn = player!.r["usk88888_b10"];
    expect(tourn).toBeDefined();
    expect(tourn.t).toBe(38);
    expect(tourn.tp).toBe(2); // 38 - 36 = +2 (correcto, não -34!)
  });

  it("rejeita rondas com grossStrokes = 0 (zeros completos)", () => {
    const zeros = [0,0,0,0,0,0,0,0,0];
    const data = makeV1Tourn({
      tcode: 77777, startDate: "3/15/2024", minAge: 10, holes: 9,
      pars: [4,4,3,5,4,3,4,5,4],
      players: {
        p1: { first: "Ghost", last: "Player", country: "us",
          rounds: { "1": { strokes: zeros, flight_round: "300" } as any } },
      },
    });

    const result = processUskidsCompleto(data);
    // Jogador com zeros completos não deve aparecer (gross < holes)
    const player = result.find(r => normName(r.n) === "ghost player");
    expect(player).toBeUndefined();
  });

  it("filtra escalões ±1 do escalão do Manuel", () => {
    // Em 2024, Manuel tem 10 anos (2024 - 2014).
    // Deve carregar Boys 9, 10, 11 (±1 do pivot)
    // Não deve carregar Boys 7 ou Boys 13
    const par = [4,4,3,5,4,3,4,5,4, 4,3,5,4,4,3,5,4,4];
    const strokes = [5,5,4,5,5,4,5,5,5, 5,4,5,5,5,4,5,5,5]; // gross 90

    const makePlayer = (name: string) => ({
      first: name, last: "Test", country: "pt",
      rounds: { "1": { strokes, flight_round: "c1" } },
    });

    const data = [{
      t: 66666,
      meta: {
        tournament: { name: "Multi Age Test", start_date: "6/1/2024", rounds: 1 },
        age_groups: {
          "1": { name: "Boys 7", gender: "Boys", min_age: 7, holes_per_round: 18 },
          "2": { name: "Boys 9", gender: "Boys", min_age: 9, holes_per_round: 18 },
          "3": { name: "Boys 10", gender: "Boys", min_age: 10, holes_per_round: 18 },
          "4": { name: "Boys 11", gender: "Boys", min_age: 11, holes_per_round: 18 },
          "5": { name: "Boys 13", gender: "Boys", min_age: 13, holes_per_round: 18 },
        },
        flights: {
          "f1": { age_group: "1" }, "f2": { age_group: "2" },
          "f3": { age_group: "3" }, "f4": { age_group: "4" },
          "f5": { age_group: "5" },
        },
        flight_courses: {
          "c1": { course: 1, pars: par, lengths: par.map(() => 300) },
        },
        flight_rounds: {
          "c1": { flight: "f1", round: 1, course: 1, date: "6/1/2024" },
          "c2": { flight: "f2", round: 1, course: 1, date: "6/1/2024" },
          "c3": { flight: "f3", round: 1, course: 1, date: "6/1/2024" },
          "c4": { flight: "f4", round: 1, course: 1, date: "6/1/2024" },
          "c5": { flight: "f5", round: 1, course: 1, date: "6/1/2024" },
        },
      },
      flights: [
        { flight_id: "f1", rounds_data: { r1_t0: { flight_players: { p1: makePlayer("Age7") } } } },
        { flight_id: "f2", rounds_data: { r1_t0: { flight_players: { p2: makePlayer("Age9") } } } },
        { flight_id: "f3", rounds_data: { r1_t0: { flight_players: { p3: makePlayer("Age10") } } } },
        { flight_id: "f4", rounds_data: { r1_t0: { flight_players: { p4: makePlayer("Age11") } } } },
        { flight_id: "f5", rounds_data: { r1_t0: { flight_players: { p5: makePlayer("Age13") } } } },
      ],
    }];

    const result = processUskidsCompleto(data);
    const names = result.map(r => r.n);

    expect(names).toContain("Age9 Test");
    expect(names).toContain("Age10 Test");
    expect(names).toContain("Age11 Test");
    // Boys 7 e Boys 13 estão fora do ±1 do pivot (10)
    expect(names).not.toContain("Age7 Test");
    expect(names).not.toContain("Age13 Test");
  });
});

/* ═══════════════════════════════════════════
   processMemberHistory — formato slim
   Bug documentado: tp com scorecards incompletos
   ═══════════════════════════════════════════ */
describe("processMemberHistory", () => {
  beforeEach(() => {
    uskTournNames.clear();
    uskFieldSizes.clear();
  });

  const makeSlimData = (jogadores: Record<string, {
    name: string; country: string; ageGroup: string;
    torneios: Record<string, {
      ageGroup: string; place: number | null;
      rounds: Record<string, { gross: number; strokes: number[] }>;
    }>;
  }>) => ({
    gerado_em: "2024-01-01T00:00:00Z",
    torneios: {
      "21080": { name: "Marco Simone 2026", startDate: "3/14/2026", holesPerRound: 18, par: [4,4,4,3,4,4,3,5,5,4,4,5,3,4,4,4,3,5], yards: null },
      "15573": { name: "El Prat 2023", startDate: "10/1/2023", holesPerRound: 9, par: [4,3,4,5,4,3,4,4,5], yards: null },
    },
    jogadores,
  });

  it("calcula tp quando scorecard completo (18H)", () => {
    const strokes = [4,5,4,3,5,4,3,6,5, 4,4,5,3,4,5,4,3,6]; // gross = 77
    const data = makeSlimData({
      "1001": {
        name: "Test Full", country: "PT", ageGroup: "Boys 11",
        torneios: { "21080": { ageGroup: "Boys 11", place: 5, rounds: { "1": { gross: 77, strokes } } } },
      },
    });

    const result = processMemberHistory(data);
    const player = result.find(r => r.n === "Test Full");
    expect(player).toBeDefined();
    const t = player!.r["usk21080_b11"];
    expect(t).toBeDefined();
    expect(t.t).toBe(77);
    // par = [4,4,4,3,4,4,3,5,5,4,4,5,3,4,4,4,3,5] = 72
    expect(t.tp).toBe(5); // 77 - 72 = +5
  });

  it("tp = null quando scorecard incompleto (só gross, sem strokes)", () => {
    const data = makeSlimData({
      "1002": {
        name: "Test NoCard", country: "US", ageGroup: "Boys 11",
        torneios: { "21080": { ageGroup: "Boys 11", place: 10, rounds: { "1": { gross: 85, strokes: [] } } } },
      },
    });

    const result = processMemberHistory(data);
    const player = result.find(r => r.n === "Test NoCard");
    expect(player).toBeDefined();
    expect(player!.r["usk21080_b11"].tp).toBeNull();
  });

  it("tp = null quando strokes têm zeros (scorecard parcial)", () => {
    // 18 posições mas metade zeros — strokes.every(v => v > 0) falha
    const partialStrokes = [4,5,4,3,5,4,3,6,5, 0,0,0,0,0,0,0,0,0];
    const data = makeSlimData({
      "1003": {
        name: "Test Partial", country: "IT", ageGroup: "Boys 11",
        torneios: { "21080": { ageGroup: "Boys 11", place: 15, rounds: { "1": { gross: 43, strokes: partialStrokes } } } },
      },
    });

    const result = processMemberHistory(data);
    const player = result.find(r => r.n === "Test Partial");
    expect(player).toBeDefined();
    expect(player!.r["usk21080_b11"].tp).toBeNull();
  });

  it("filtra Boys fora do range 9-13", () => {
    const strokes = [4,5,4,3,5,4,3,6,5, 4,4,5,3,4,5,4,3,6];
    const data = makeSlimData({
      "2001": {
        name: "Too Young", country: "US", ageGroup: "Boys 7",
        torneios: { "21080": { ageGroup: "Boys 7", place: 1, rounds: { "1": { gross: 77, strokes } } } },
      },
      "2002": {
        name: "Too Old", country: "US", ageGroup: "Boys 15",
        torneios: { "21080": { ageGroup: "Boys 15", place: 1, rounds: { "1": { gross: 77, strokes } } } },
      },
      "2003": {
        name: "Just Right", country: "PT", ageGroup: "Boys 11",
        torneios: { "21080": { ageGroup: "Boys 11", place: 3, rounds: { "1": { gross: 77, strokes } } } },
      },
    });

    const result = processMemberHistory(data);
    const names = result.map(r => r.n);
    expect(names).not.toContain("Too Young");
    expect(names).not.toContain("Too Old");
    expect(names).toContain("Just Right");
  });

  it("ignora jogadores com nome '?' (matching falhado)", () => {
    const data = makeSlimData({
      "3001": {
        name: "?", country: "US", ageGroup: "Boys 10",
        torneios: { "21080": { ageGroup: "Boys 10", place: 1, rounds: { "1": { gross: 77, strokes: [4,5,4,3,5,4,3,6,5, 4,4,5,3,4,5,4,3,6] } } } },
      },
    });

    const result = processMemberHistory(data);
    expect(result).toHaveLength(0);
  });

  it("suporta torneios de 9H (El Prat)", () => {
    const strokes9 = [4,4,5,5,4,3,5,5,5]; // gross 40
    const data = makeSlimData({
      "4001": {
        name: "Nine Holes", country: "ES", ageGroup: "Boys 10",
        torneios: { "15573": { ageGroup: "Boys 10", place: 2, rounds: { "1": { gross: 40, strokes: strokes9 } } } },
      },
    });

    const result = processMemberHistory(data);
    const player = result.find(r => r.n === "Nine Holes");
    expect(player).toBeDefined();
    const t = player!.r["usk15573_b10"];
    expect(t).toBeDefined();
    expect(t.t).toBe(40);
    // par 9H = [4,3,4,5,4,3,4,4,5] = 36
    expect(t.tp).toBe(4); // 40 - 36 = +4
    expect(t.nholes).toBe(9);
  });

  it("popula uskTournNames a partir dos dados do slim", () => {
    const data = makeSlimData({
      "5001": {
        name: "Name Test", country: "PT", ageGroup: "Boys 10",
        torneios: { "21080": { ageGroup: "Boys 10", place: 1, rounds: { "1": { gross: 77, strokes: [4,5,4,3,5,4,3,6,5, 4,4,5,3,4,5,4,3,6] } } } },
      },
    });

    processMemberHistory(data);
    const info = uskTournNames.get("usk21080");
    expect(info).toBeDefined();
    expect(info!.name).toBe("Marco Simone 2026");
    expect(info!.dateExact).toBe("2026-03-14");
  });
});

/* ═══════════════════════════════════════════
   processWjgc — formato bluegolf
   ═══════════════════════════════════════════ */
describe("processWjgc", () => {
  it("processa formato bluegolf com scores 18H", () => {
    const data = {
      tournament: "Test WJGC",
      category: "Boys 10-11",
      course: "Test Golf Club",
      year: 2025,
      par: [4,4,3,5,4,3,4,5,4, 4,3,5,4,4,3,5,4,4], // par 72
      si: [1,3,5,7,9,11,13,15,17, 2,4,6,8,10,12,14,16,18],
      players: [
        {
          name: "Player One",
          country: "Portugal",
          pos: 1,
          result: -3,
          total: 141,
          rounds: [
            { day: 1, scores: [4,4,3,5,3,3,4,5,4, 4,3,4,4,4,3,5,4,4], f9: 35, b9: 35, gross: 70 },
            { day: 2, scores: [4,4,3,5,4,3,4,5,4, 4,3,5,4,4,3,5,3,4], f9: 36, b9: 35, gross: 71 },
          ],
        },
      ],
    };

    const result = processWjgc(data, "wjgc_test");
    expect(result).toHaveLength(1);
    expect(result[0].n).toBe("Player One");
    expect(result[0].co).toBe("Portugal");
    expect(result[0].r.wjgc_test.t).toBe(141);
    expect(result[0].r.wjgc_test.rd).toEqual([70, 71]);
  });
});

/* ═══════════════════════════════════════════
   processManuelOverrides — injeção manual
   ═══════════════════════════════════════════ */
describe("processManuelOverrides", () => {
  it("injeta os overrides do Manuel", () => {
    const result = processManuelOverrides();
    expect(result.length).toBeGreaterThan(0);

    const manuel = result.find(r => normName(r.n) === normName("Manuel Medeiros"));
    expect(manuel).toBeDefined();
    expect(manuel!.co).toBe("Portugal");

    // Marco Simone 2026 Boys 11
    const marco = manuel!.r["marco26_b11"];
    expect(marco).toBeDefined();
    expect(marco.rd).toEqual([86, 79]); // R1=86, R2=79
    expect(marco.t).toBe(165);
  });
});
