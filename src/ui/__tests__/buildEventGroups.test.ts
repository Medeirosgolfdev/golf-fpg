import { describe, it, expect } from "vitest";
import {
  buildEventGroups,
  buildJovensGroups,
  eventNameTokens,
  jaccardSimilarity,
} from "../InscricoesComponents";
import type { Tournament } from "../../data/fpgTypes";

/** Helper: Tournament mínimo para os testes (só os campos que o builder lê). */
function mkT(partial: Partial<Tournament> & { name: string; date: string; ccode: string; tcode: string }): Tournament {
  return {
    campo: "Campo Default",
    players: [],
    playerCount: 0,
    escalao: null,
    ...partial,
  } as Tournament;
}

describe("eventNameTokens", () => {
  it("remove sufixos de escalão e género", () => {
    const a = eventNameTokens("Campeonato Nacional de Jovens Sub 12 H");
    const b = eventNameTokens("Campeonato Nacional de Jovens Sub 14 F");
    expect(jaccardSimilarity(a, b)).toBeGreaterThanOrEqual(0.5);
  });

  it("remove Dia N e ano", () => {
    const a = eventNameTokens("Open de Verão Dia 1 2025");
    const b = eventNameTokens("Open de Verão Dia 2");
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  it("remove diacríticos e case", () => {
    const a = eventNameTokens("CAMPEONATO de Jóvens");
    const b = eventNameTokens("campeonato de jovens");
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  it("nomes completamente diferentes têm baixa similaridade", () => {
    const a = eventNameTokens("Taça do Presidente");
    const b = eventNameTokens("Campeonato Stableford");
    expect(jaccardSimilarity(a, b)).toBeLessThan(0.5);
  });
});

describe("jaccardSimilarity", () => {
  it("dois conjuntos vazios → 1", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
  });

  it("conjuntos idênticos → 1", () => {
    const s = new Set(["a", "b", "c"]);
    expect(jaccardSimilarity(s, new Set(s))).toBe(1);
  });

  it("sem intersecção → 0", () => {
    expect(jaccardSimilarity(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  it("cálculo clássico", () => {
    // |{a,b} ∩ {b,c}| = 1, |{a,b} ∪ {b,c}| = 3, Jaccard = 1/3
    expect(jaccardSimilarity(new Set(["a","b"]), new Set(["b","c"]))).toBeCloseTo(1/3, 3);
  });
});

describe("buildEventGroups — agrupamento date+ccode", () => {
  it("Nacional Jovens 10 escalões em 2026-05-01 Aroeira → 1 grupo", () => {
    const nacional = [
      "Sub 10 H", "Sub 10 F", "Sub 12 H", "Sub 12 F", "Sub 14 H",
      "Sub 14 F", "Sub 16 H", "Sub 16 F", "Sub 18 H", "Sub 18 F",
    ].map((esc, i) => mkT({
      name: `Campeonato Nacional de Jovens ${esc}`,
      date: "2026-05-01", ccode: "000", tcode: `1093${5 + i}`,
      campo: "Aroeira I",
    }));
    const groups = buildEventGroups(nacional);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(10);
    expect(groups[0].name).toBe("Campeonato Nacional de Jovens");
    expect(groups[0].ccode).toBe("000");
  });

  it("Greatgolf PJA Sub-10/12/14 no mesmo dia/clube → 1 grupo", () => {
    const pja = ["Sub 10", "Sub 12", "Sub 14"].map((esc, i) => mkT({
      name: `Greatgolf Junior Open 2026 ${esc}`,
      date: "2026-06-15", ccode: "007", tcode: `1029${4 + i}`,
      campo: "Greatgolf",
    }));
    const groups = buildEventGroups(pja);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(3);
    expect(groups[0].name).toMatch(/greatgolf/i);
  });

  it("mesmo dia+ccode mas nomes muito diferentes → SEPARAR", () => {
    const mixed = [
      mkT({ name: "Taça do Presidente", date: "2025-08-10", ccode: "123", tcode: "100" }),
      mkT({ name: "Campeonato Stableford Sócios", date: "2025-08-10", ccode: "123", tcode: "101" }),
    ];
    const groups = buildEventGroups(mixed);
    expect(groups).toHaveLength(2);
  });

  it("Ranking PJA #1 e #2 em dias diferentes NÃO fundem (eventos distintos)", () => {
    // Importante: Phase 2 deve ser conservador. Só funde cross-date quando
    // o nome normalizado é idêntico (Dia 1 + Dia 2 do MESMO evento).
    const pja = [
      mkT({ name: "Ranking PJA Primavera Sub 10", date: "2026-04-05", ccode: "007", tcode: "100" }),
      mkT({ name: "Ranking PJA Primavera Sub 10", date: "2026-04-12", ccode: "007", tcode: "101" }),
    ];
    // Nome idêntico após normalização → FUNDE (assumimos ser Dia 1 / Dia 2).
    expect(buildEventGroups(pja)).toHaveLength(1);

    const distintos = [
      mkT({ name: "Ranking PJA #1 Sub 10", date: "2026-04-05", ccode: "007", tcode: "100" }),
      mkT({ name: "Ranking PJA #2 Sub 10", date: "2026-04-12", ccode: "007", tcode: "101" }),
    ];
    // "#1" vs "#2" são conservados → Phase 2 NÃO funde → 2 grupos.
    expect(buildEventGroups(distintos)).toHaveLength(2);
  });

  it("Dia 1 + Dia 2 do mesmo evento → fundir (diferentes datas, mesmo ccode+nome)", () => {
    const multi = [
      mkT({ name: "Open de Verão Dia 1", date: "2025-07-01", ccode: "123", tcode: "200" }),
      mkT({ name: "Open de Verão Dia 2", date: "2025-07-02", ccode: "123", tcode: "201" }),
    ];
    const groups = buildEventGroups(multi);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].name).toMatch(/open de ver/i);
  });

  it("singleton → grupo de 1 entrada", () => {
    const one = [mkT({ name: "Solo Event", date: "2025-03-15", ccode: "555", tcode: "999" })];
    const groups = buildEventGroups(one);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(1);
    expect(groups[0].name).toBe("Solo Event");
  });

  it("eventos em ccodes diferentes no mesmo dia NÃO são agrupados", () => {
    const diffCcode = [
      mkT({ name: "Torneio Local A", date: "2025-05-10", ccode: "100", tcode: "111" }),
      mkT({ name: "Torneio Local A", date: "2025-05-10", ccode: "200", tcode: "222" }),
    ];
    const groups = buildEventGroups(diffCcode);
    expect(groups).toHaveLength(2);
  });

  it("ordem descendente por data", () => {
    const mix = [
      mkT({ name: "Antigo", date: "2024-01-01", ccode: "A", tcode: "1" }),
      mkT({ name: "Recente", date: "2026-01-01", ccode: "B", tcode: "2" }),
      mkT({ name: "Meio", date: "2025-01-01", ccode: "C", tcode: "3" }),
    ];
    const groups = buildEventGroups(mix);
    expect(groups.map(g => g.date)).toEqual(["2026-01-01", "2025-01-01", "2024-01-01"]);
  });

  it("threshold customizado — Jaccard=0.2 junta nomes quase diferentes", () => {
    const pair = [
      mkT({ name: "Taça Primavera Sócios", date: "2025-04-01", ccode: "X", tcode: "1" }),
      mkT({ name: "Taça Verão Sócios",     date: "2025-04-01", ccode: "X", tcode: "2" }),
    ];
    // threshold 0.5: "taca sub" + "taca verao socios" vs "taca primavera socios"
    // tokens: {taca, primavera, socios} vs {taca, verao, socios} → 2/4 = 0.5 → juntam
    expect(buildEventGroups(pair, { jaccardThreshold: 0.5 })).toHaveLength(1);
    // threshold 0.8: mesmos tokens → 0.5 < 0.8 → separam
    expect(buildEventGroups(pair, { jaccardThreshold: 0.8 })).toHaveLength(2);
  });

  it("escalão é inferido de nome quando t.escalao é null", () => {
    const sub = [
      mkT({ name: "Campeonato Regional Sub 10", date: "2025-09-01", ccode: "001", tcode: "1", escalao: null }),
      mkT({ name: "Campeonato Regional Sub 12", date: "2025-09-01", ccode: "001", tcode: "2", escalao: null }),
    ];
    const groups = buildEventGroups(sub);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries[0].escalao).toBe("Sub 10");
    expect(groups[0].entries[1].escalao).toBe("Sub 12");
  });
});

describe("buildJovensGroups (wrapper) — preserva contrato antigo", () => {
  it("adiciona year/isRegional/isNacional", () => {
    const t = [
      mkT({ name: "Campeonato Nacional de Jovens Sub 12", date: "2026-05-01", ccode: "000", tcode: "10937" }),
      mkT({ name: "Campeonato Nacional de Jovens Sub 14", date: "2026-05-01", ccode: "000", tcode: "10939" }),
    ];
    const groups = buildJovensGroups(t);
    expect(groups).toHaveLength(1);
    expect(groups[0].year).toBe("2026");
    expect(groups[0].isNacional).toBe(true);
    expect(groups[0].isRegional).toBe(false);
  });

  it("detecta Regional", () => {
    const t = [mkT({ name: "Campeonato Regional Sub 10", date: "2025-09-01", ccode: "001", tcode: "1" })];
    const groups = buildJovensGroups(t);
    expect(groups[0].isRegional).toBe(true);
    expect(groups[0].isNacional).toBe(false);
  });

  it("respeita _jovensYear override quando presente", () => {
    const t = [
      mkT({ name: "Algum Torneio", date: "2025-12-31", ccode: "X", tcode: "1", _jovensYear: "2026" } as any),
    ];
    const groups = buildJovensGroups(t);
    expect(groups[0].year).toBe("2026");
  });
});

describe("buildEventGroups — fusão de edições (opts.mergeEditions)", () => {
  it("agrupa 1º/2º da mesma série no mesmo clube+campo+ano", () => {
    const g = buildEventGroups([
      mkT({ name: "1º Torneio do Circuito de Verão 2026", date: "2026-07-02", ccode: "050", campo: "Oporto", tcode: "10567" }),
      mkT({ name: "2º Torneio do Circuito de Verão 2026", date: "2026-07-09", ccode: "050", campo: "Oporto", tcode: "10569" }),
    ], { mergeEditions: true });
    expect(g).toHaveLength(1);
    expect(g[0].entries).toHaveLength(2);
    // rotuladas pela data (dd/mm)
    expect(g[0].entries.map(e => (e as any)._tabLabel).sort()).toEqual(["02/07", "09/07"]);
  });

  it("agrupa 'X' / 'X 2' (número de edição final)", () => {
    const g = buildEventGroups([
      mkT({ name: "Torneio Verão – Escola de Golfe", date: "2026-07-07", ccode: "010", campo: "Miramar", tcode: "10657" }),
      mkT({ name: "Torneio Verão – Escola de Golfe 2", date: "2026-07-09", ccode: "010", campo: "Miramar", tcode: "10659" }),
    ], { mergeEditions: true });
    expect(g).toHaveLength(1);
    expect(g[0].entries).toHaveLength(2);
  });

  it("NUNCA agrupa quando o campo diverge", () => {
    const g = buildEventGroups([
      mkT({ name: "1º Torneio de Verão 2026", date: "2026-07-02", ccode: "010", campo: "Miramar", tcode: "1" }),
      mkT({ name: "2º Torneio de Verão 2026", date: "2026-07-09", ccode: "011", campo: "Oporto", tcode: "2" }),
    ], { mergeEditions: true });
    expect(g).toHaveLength(2);
  });

  it("não agrupa edições de ANOS diferentes (isso é a tab Edições anteriores)", () => {
    const g = buildEventGroups([
      mkT({ name: "1º Torneio de Natal", date: "2025-12-20", ccode: "010", campo: "Miramar", tcode: "1" }),
      mkT({ name: "1º Torneio de Natal", date: "2026-12-19", ccode: "010", campo: "Miramar", tcode: "2" }),
    ], { mergeEditions: true });
    expect(g).toHaveLength(2);
  });

  it("mergeEditions desligado (default) mantém edições separadas", () => {
    const g = buildEventGroups([
      mkT({ name: "1º Torneio do Circuito de Verão 2026", date: "2026-07-02", ccode: "050", campo: "Oporto", tcode: "10567" }),
      mkT({ name: "2º Torneio do Circuito de Verão 2026", date: "2026-07-09", ccode: "050", campo: "Oporto", tcode: "10569" }),
    ]);
    expect(g).toHaveLength(2);
  });

  it("NÃO funde Sub 10 / Sub 12 de datas diferentes (nº é escalão, não edição)", () => {
    const g = buildEventGroups([
      mkT({ name: "Torneio Regional Sub 10", date: "2026-06-06", ccode: "010", campo: "Miramar", tcode: "1", escalao: "Sub 10" }),
      mkT({ name: "Torneio Regional Sub 12", date: "2026-06-13", ccode: "010", campo: "Miramar", tcode: "2", escalao: "Sub 12" }),
    ], { mergeEditions: true });
    expect(g).toHaveLength(2);
  });

  it("escalões do mesmo dia continuam a agrupar (sem regressão)", () => {
    const g = buildEventGroups([
      mkT({ name: "Campeonato X Sub 10", date: "2026-05-01", ccode: "000", campo: "Aroeira", tcode: "1", escalao: "Sub 10" }),
      mkT({ name: "Campeonato X Sub 12", date: "2026-05-01", ccode: "000", campo: "Aroeira", tcode: "2", escalao: "Sub 12" }),
    ], { mergeEditions: true });
    expect(g).toHaveLength(1);
    expect(g[0].entries).toHaveLength(2);
  });

  it("fusão FORÇADA: Par3 Citygolf junta apesar dos patrocinadores diferentes", () => {
    const g = buildEventGroups([
      mkT({ name: "3º Troféu Par3 2025 by Clark - Grupo ECB", date: "2025-04-26", ccode: "107", campo: "Citygolf", tcode: "10927" }),
      mkT({ name: "4º Troféu Par3 2025 by OP - GRUPO BOA IMAGEM", date: "2025-06-21", ccode: "107", campo: "Citygolf", tcode: "10948" }),
      mkT({ name: "5º Troféu Par3 2025 by Chef Mamã", date: "2025-09-06", ccode: "107", campo: "Citygolf", tcode: "10975" }),
    ], { mergeEditions: true });
    expect(g).toHaveLength(1);
    expect(g[0].entries).toHaveLength(3);
    expect(g[0].name).toBe("Torneios Par3");
  });

  it("fusão FORÇADA não junta ANOS diferentes (continua por ano)", () => {
    const g = buildEventGroups([
      mkT({ name: "3º Troféu Par3 2024 by Chef Mamã", date: "2024-05-18", ccode: "107", campo: "Citygolf", tcode: "10824" }),
      mkT({ name: "3º Troféu Par3 2025 by Clark", date: "2025-04-26", ccode: "107", campo: "Citygolf", tcode: "10927" }),
    ], { mergeEditions: true });
    expect(g).toHaveLength(2);
  });
});
