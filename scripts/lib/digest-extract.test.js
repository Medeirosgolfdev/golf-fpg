/**
 * Testes da extracção do resumo diário (scripts/lib/digest-extract.js).
 * Os fixtures são fatias reduzidas dos formatos REAIS do repo — quando uma
 * fonte mudar de forma, é aqui que rebenta primeiro.
 */

import { describe, it, expect } from "vitest";
import {
  displayName,
  prettyTournamentName,
  inferEscalao,
  isJuniorish,
  sourceInfo,
  detectFormat,
  winnerOf,
  extractTournaments,
  diffTournaments,
  diffWhs,
  diffFederados,
  describeFederado,
  describePlayerRounds,
} from "./digest-extract.js";

describe("displayName", () => {
  it("desfaz 'APELIDO, Nome' em caixa alta (RFEG/LGS)", () => {
    expect(displayName("FERNANDEZ GARCIA-POGGIO, Cayetana")).toBe("Cayetana Fernandez Garcia-Poggio");
  });
  it("converte ALL CAPS sem vírgula para Title Case", () => {
    expect(displayName("MIGUEL ANGEL LUQUE")).toBe("Miguel Angel Luque");
  });
  it("deixa nomes já bem escritos em paz", () => {
    expect(displayName("Manuel Medeiros")).toBe("Manuel Medeiros");
  });
  it("não parte nomes com duas vírgulas (não é 'apelido, nome')", () => {
    expect(displayName("Smith, John, Jr")).toBe("Smith, John, Jr");
  });
  it("aguenta vazio/null", () => {
    expect(displayName(null)).toBe("");
  });
});

describe("inferEscalao", () => {
  it("reconhece as nomenclaturas das várias federações", () => {
    expect(inferEscalao("Campeonato de España Sub 16 Masculino")).toBe("Sub-16");
    expect(inferEscalao("Under 12 Boys")).toBe("Sub-12");
    expect(inferEscalao("10 and Under")).toBe("Sub-10");
    expect(inferEscalao("Handicap Alevin Femenino")).toBe("Alevín");
    expect(inferEscalao("BENJAMÍ MASCULÍ")).toBe("Benjamim");
    expect(inferEscalao("Campeonato Infantil")).toBe("Infantil");
  });
  it("devolve null quando não há sinal de idade", () => {
    expect(inferEscalao("Campeonato de España Mid-Amateur")).toBeNull();
    expect(inferEscalao("")).toBeNull();
  });
});

describe("prettyTournamentName", () => {
  it("desdobra o slug que alguns scrapers guardam como nome", () => {
    expect(prettyTournamentName("championnat-de-france-des-jeunes-benjamines"))
      .toBe("Championnat De France Des Jeunes Benjamines");
  });
  it("não mexe em nomes a sério", () => {
    expect(prettyTournamentName("Grand Prix Jeunes")).toBe("Grand Prix Jeunes");
    expect(prettyTournamentName("Trofeo Alevín - Madrid")).toBe("Trofeo Alevín - Madrid");
  });
});

describe("isJuniorish", () => {
  it("aceita provas de jovens em qualquer das federações", () => {
    expect(isJuniorish("Grand Prix Jeunes", "POUSSINS")).toBe(true);
    expect(isJuniorish("Campeonato de España Sub 16")).toBe(true);
    expect(isJuniorish("III Liguilla Benjamín", "Handicap Alevin Femenino")).toBe(true);
    expect(isJuniorish("Champion of Champions", "Under 12 Boys")).toBe(true);
    expect(isJuniorish("Grand Prix", "u12G")).toBe(true);
  });
  it("recusa competições sociais/de adultos", () => {
    expect(isJuniorish("MENS DAY 11/8", "Handicap General")).toBe(false);
    expect(isJuniorish("Competição Mensal")).toBe(false);
    expect(isJuniorish("Campeonato de España Mid-Amateur")).toBe(false);
    expect(isJuniorish("")).toBe(false);
  });
});

describe("sourceInfo", () => {
  it("rotula país e circuito a partir do caminho", () => {
    expect(sourceInfo("public/data/nextcaddy/48161.json").country).toBe("Espanha");
    expect(sourceInfo("public/data/ffgolf-resultats/01-00-x.json").country).toBe("França");
    expect(sourceInfo("public/data/drive-data-2026-07.json").country).toBe("Portugal");
  });
  it("não explode em caminhos desconhecidos", () => {
    expect(sourceInfo("public/data/qualquer-coisa.json").source).toBe("Outros");
  });
});

describe("winnerOf", () => {
  it("escolhe o pos 1", () => {
    expect(winnerOf([{ name: "B", pos: 2 }, { name: "A", pos: 1 }]).name).toBe("A");
  });
  it("devolve null se ninguém está em 1º (prova por acabar)", () => {
    expect(winnerOf([{ name: "B", pos: 2 }, { name: "C", pos: 3 }])).toBeNull();
  });
  it("ignora sentinelas de 'sem classificação' (pos ≥ 900)", () => {
    expect(winnerOf([{ name: "X", pos: 999 }])).toBeNull();
  });
  it("aceita pos como string ('1', 'T1')", () => {
    expect(winnerOf([{ name: "A", pos: "T1" }]).name).toBe("A");
  });
});

/* ── Fixtures por formato ───────────────────────────────────────────────── */

const LGS = {
  meta: { name: "Campeonato de España Sub 16", dateIso: "2026-05-02" },
  classification: [
    { name: "JIMENEZ ROMERO, Sergio", pos: 1, total: 210 },
    { name: "HAO, Jorge", pos: 2, total: 212 },
  ],
};

const NEXTCADDY = {
  tourId: 48161,
  meta: { name: "III Liguilla Benjamín", dateStart: "2026-03-01" },
  leaderboard: [
    { category: 1, categoryName: "Handicap Alevin Femenino", players: [{ pos: 1, name: "Daniela Pascual Calleja" }] },
    { category: 2, categoryName: "Handicap Benjamin Masculino", players: [{ pos: 1, name: "Pablo Herguedas Sanz" }] },
  ],
};

const FCG = {
  gameId: "abc",
  game: {
    name: "Jornada 1",
    scheduleStartDate: "2026-05-16T07:00:00.000Z",
    tournament: { name: "CAMPIONAT DE CATALUNYA BENJAMÍ 2026", isSingleGame: false },
  },
  categories: [
    {
      _id: "c1",
      name: "BENJAMÍ MASCULÍ",
      players: [
        { firstName: "NIL", surname: "CARRERA COSTA", view: { acc: { rankingPosition: 1 } } },
        { firstName: "PAU", surname: "SOLE", view: { acc: { rankingPosition: 2 } } },
      ],
    },
  ],
};

const FFG = {
  trnId: "1500190711",
  name: "Championnat de France U14",
  date: "31/03/2026",
  details: {
    series: [
      {
        serieId: "11",
        label: "1ère Série Messieurs",
        players: [
          { classement: "1", pos: 1, name: "HYEST Hugo", nameNom: "HYEST", namePrenom: "Hugo" },
          { classement: "2", pos: 2, name: "DUPONT Luc", nameNom: "DUPONT", namePrenom: "Luc" },
        ],
      },
    ],
  },
};

const JOBFILE = {
  tournament: "2026 Champion of Champions",
  year: 2026,
  startDate: "2026-07-23",
  divisions: [{ division: "Under 12 Boys", players: [{ pos: "1", name: "Theo Oderinde" }] }],
};

const FPG_PULL = {
  tournaments: [
    {
      name: "1º Torn. Drive Challenge Açores - Sub 14",
      ccode: "988", tcode: "10212", date: "2026-07-04", escalao: "Sub 14",
      players: [{ pos: 1, name: "Guilherme Matos", grossTotal: 53 }],
    },
  ],
};

describe("detectFormat", () => {
  it("distingue os formatos das várias fontes", () => {
    expect(detectFormat(LGS)).toBe("lgs");
    expect(detectFormat(NEXTCADDY)).toBe("nextcaddy");
    expect(detectFormat(FCG)).toBe("fcg");
    expect(detectFormat(FFG)).toBe("ffgResultats");
    expect(detectFormat(JOBFILE)).toBe("jobfile");
    expect(detectFormat(FPG_PULL)).toBe("fpgPull");
    expect(detectFormat({ qualquer: "coisa" })).toBe("unknown");
    expect(detectFormat(null)).toBe("unknown");
  });
});

describe("extractTournaments", () => {
  it("LGS — nome, vencedor e data", () => {
    const [r] = extractTournaments(LGS, "public/data/rfegolf-livegolfscoring/1.json");
    expect(r.tournament).toBe("Campeonato de España Sub 16");
    expect(r.winner).toBe("Sergio Jimenez Romero");
    expect(r.country).toBe("Espanha");
    expect(r.date).toBe("2026-05-02");
  });

  it("NextCaddy — uma entrada por categoria", () => {
    const rows = extractTournaments(NEXTCADDY, "public/data/nextcaddy/48161.json");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.category)).toEqual(["Handicap Alevin Femenino", "Handicap Benjamin Masculino"]);
  });

  it("FCG — usa a PROVA, não a jornada, como nome do torneio", () => {
    const [r] = extractTournaments(FCG, "public/data/fcg/abc.json");
    expect(r.tournament).toBe("CAMPIONAT DE CATALUNYA BENJAMÍ 2026");
    expect(r.round).toBe("Jornada 1");
    expect(r.winner).toBe("Nil Carrera Costa");
  });

  it("FFG — nome pelas partes prenom/nom, não pela string colada", () => {
    const [r] = extractTournaments(FFG, "public/data/ffgolf-resultats/01-00-x.json");
    expect(r.winner).toBe("Hugo Hyest");
    expect(r.category).toBe("1ère Série Messieurs");
    expect(r.date).toBe("2026-03-31");
  });

  it("JobFile — uma entrada por divisão", () => {
    const [r] = extractTournaments(JOBFILE, "public/data/coc_2026.json");
    expect(r.category).toBe("Under 12 Boys");
    expect(r.winner).toBe("Theo Oderinde");
  });

  it("fpg-pull — escalão vem do campo escalao", () => {
    const [r] = extractTournaments(FPG_PULL, "public/data/drive-data-2026-07.json");
    expect(r.category).toBe("Sub 14");
    expect(r.winner).toBe("Guilherme Matos");
    expect(r.country).toBe("Portugal");
  });

  it("prova sem vencedor ainda não entra no resumo", () => {
    const semVencedor = { meta: { name: "X" }, classification: [{ name: "A", pos: 2 }] };
    expect(extractTournaments(semVencedor, "public/data/rfegolf-livegolfscoring/2.json")).toEqual([]);
  });

  it("formato desconhecido devolve [] em vez de rebentar", () => {
    expect(extractTournaments({ lixo: true }, "public/data/x.json")).toEqual([]);
  });
});

describe("diffTournaments", () => {
  it("só anuncia o que ganhou vencedor desde a versão anterior", () => {
    const antes = { tourId: 1, meta: { name: "T" }, leaderboard: [
      { category: 1, categoryName: "Alevín", players: [{ pos: 1, name: "A" }] },
      { category: 2, categoryName: "Infantil", players: [{ pos: 2, name: "B" }] },
    ] };
    const depois = { tourId: 1, meta: { name: "T" }, leaderboard: [
      { category: 1, categoryName: "Alevín", players: [{ pos: 1, name: "A" }] },
      { category: 2, categoryName: "Infantil", players: [{ pos: 1, name: "C" }] },
    ] };
    const novos = diffTournaments(antes, depois, "public/data/nextcaddy/1.json");
    expect(novos).toHaveLength(1);
    expect(novos[0].winner).toBe("C");
  });

  it("ficheiro novo (sem versão anterior) entra todo", () => {
    expect(diffTournaments(null, NEXTCADDY, "public/data/nextcaddy/48161.json")).toHaveLength(2);
  });

  it("ficheiro tocado sem novidade não anuncia nada", () => {
    expect(diffTournaments(NEXTCADDY, NEXTCADDY, "public/data/nextcaddy/48161.json")).toEqual([]);
  });
});

describe("diffWhs", () => {
  const antigas = [{ score_id: 100, tourn_name: "A", score_origin: "Torn", hcp_dateStr: "2026-01-01" }];
  const novas = [
    { score_id: 100, tourn_name: "A", score_origin: "Torn", hcp_dateStr: "2026-01-01" },
    { score_id: 101, tourn_name: "Nacional Sub-12 D1", score_origin: "Torn", hcp_dateStr: "2026-08-15", holes: 18, sgd: 9 },
    { score_id: 102, tourn_name: "", score_origin: "EDS", hcp_dateStr: "2026-08-16" },
  ];

  it("apanha só as voltas com score_id novo", () => {
    const d = diffWhs(antigas, novas);
    expect(d.map((r) => r.scoreId)).toEqual(["102", "101"]); // mais recentes primeiro
  });

  it("jogador sem histórico anterior conta todas", () => {
    expect(diffWhs(null, novas)).toHaveLength(3);
  });

  it("volta sem score_id conta na mesma (chave por data+evento+campo)", () => {
    const r = diffWhs([], [{ tourn_name: "Torneio X", course_description: "Jamor", hcp_dateStr: "2026-06-13" }]);
    expect(r).toHaveLength(1);
  });

  it("IGNORA actos administrativos — não são scorecards", () => {
    // A FPG regista-os no WHS com score_origin "Torn"; sem este filtro o email
    // dizia "participou em Transferencia de Clube".
    const admin = [
      { score_id: null, tourn_name: "Atribuição Inicial WHS", score_origin: "Torn", hcp_dateStr: "2026-06-09" },
      { score_id: 0, tourn_name: "Transferencia de Clube", score_origin: "Torn", hcp_dateStr: "2026-02-18" },
      { score_id: 0, tourn_name: "Alteração Tipo de Jogador", score_origin: "Torn", hcp_dateStr: "2022-09-01" },
      { score_id: 0, tourn_name: "Atribuição Inicial de Handicap", score_origin: "Torn", hcp_dateStr: "2017-12-31" },
    ];
    expect(diffWhs([], admin)).toEqual([]);
  });

  it("score_id 0 é sentinela, não um ID — dois actos distintos não colidem", () => {
    // 639 registos no repo partilham score_id 0; com a chave antiga o primeiro
    // tapava todos os outros.
    const novas = [
      { score_id: 0, tourn_name: "Torneio A", course_description: "Jamor", hcp_dateStr: "2026-06-01" },
      { score_id: 0, tourn_name: "Torneio B", course_description: "Aroeira", hcp_dateStr: "2026-06-02" },
    ];
    expect(diffWhs([], novas)).toHaveLength(2);
  });
});

describe("diffFederados", () => {
  const fed = (code, name, esc, extra = {}) => ({
    federation_code: code, name, age_level: esc, gender: "M",
    acronym: "RIO", admission_date: "2026-08-10", ...extra,
  });
  const antes = {
    generated: "2026-08-05T23:25:40.264Z",
    players: [fed("1", "Ana Costa", "SUB14"), fed("2", "Rui Pinto", "MidAmateur")],
  };
  const agora = {
    generated: "2026-08-14T18:00:00.000Z",
    players: [
      fed("1", "Ana Costa", "SUB14"),
      fed("3", "Duarte Rodrigues", "SUB12"),
      fed("4", "Velho Sócio", "Senior", { admission_date: "2015-03-01" }),
    ],
  };

  it("apanha quem entrou e quem saiu", () => {
    const d = diffFederados(antes, agora);
    expect(d.entrou.map((e) => e.name)).toEqual(["Duarte Rodrigues", "Velho Sócio"]);
    expect(d.saiu.map((e) => e.name)).toEqual(["Rui Pinto"]);
  });

  it("marca REENTRADA quem tem inscrição anterior ao snapshot passado", () => {
    const d = diffFederados(antes, agora);
    expect(d.entrou.find((e) => e.name === "Duarte Rodrigues").reentrada).toBe(false);
    expect(d.entrou.find((e) => e.name === "Velho Sócio").reentrada).toBe(true);
  });

  it("marca os juniores e ordena-os do escalão mais novo para o mais velho", () => {
    const d = diffFederados(antes, agora);
    expect(d.entrou[0].junior).toBe(true);   // SUB12 primeiro
    expect(d.entrou[1].junior).toBe(false);  // Senior depois
  });

  it("lê o HCP e trata os placeholders da FPG como 'sem HCP'", () => {
    // A FPG guarda 99 / hcp_status_id 99 em quem ainda não tem índice; o
    // projecto trata >= 54 como não-estabelecido (isCountableHcp).
    const novos = {
      generated: "2026-08-14T18:00:00.000Z",
      players: [
        fed("1", "Ana Costa", "SUB14"),
        fed("5", "Com Indice", "SUB18", { hcp_exact: 41.5, hcp_status_id: 10 }),
        fed("6", "Sem Indice", "SUB12", { hcp_exact: 99, hcp_status_id: 99 }),
        fed("7", "Em Formacao", "SUB10", { hcp_exact: 54, hcp_status_id: 10 }),
        fed("8", "Limite Valido", "SUB16", { hcp_exact: 48.3, hcp_status_id: 10 }),
      ],
    };
    const byName = Object.fromEntries(diffFederados(antes, novos).entrou.map((e) => [e.name, e.hcp]));
    expect(byName["Com Indice"]).toBe(41.5);
    expect(byName["Limite Valido"]).toBe(48.3);
    expect(byName["Sem Indice"]).toBeNull();
    expect(byName["Em Formacao"]).toBeNull();
  });

  it("um ficheiro vazio NÃO gera milhares de saídas", () => {
    // Guarda contra um scrape falhado: sem isto um federados.json truncado
    // anunciava o país inteiro a deixar de ser federado.
    expect(diffFederados(antes, { players: [] })).toEqual({ entrou: [], saiu: [] });
    expect(diffFederados(null, agora)).toEqual({ entrou: [], saiu: [] });
  });
});

describe("describeFederado", () => {
  const base = {
    name: "Duarte Rodrigues", escalao: "SUB14", sexo: "M", hcp: null,
    club: "RIO", admissao: "2026-08-10", reentrada: false, junior: true,
  };
  it("entrada sem HCP (o caso comum num federado novo)", () => {
    expect(describeFederado(base)).toBe("Duarte Rodrigues — SUB14 (M), RIO · sem HCP · entrou em 2026-08-10");
  });
  it("entrada com HCP", () => {
    expect(describeFederado({ ...base, hcp: 41.5 }))
      .toBe("Duarte Rodrigues — SUB14 (M), RIO · hcp 41.5 · entrou em 2026-08-10");
  });
  it("reentrada", () => {
    expect(describeFederado({ ...base, hcp: 24.4, reentrada: true, admissao: "2023-08-28" }))
      .toBe("Duarte Rodrigues — SUB14 (M), RIO · hcp 24.4 · reentrada (inscrição de 2023-08-28)");
  });
  it("saída usa a admissão para dizer há quanto tempo era federado", () => {
    expect(describeFederado({ ...base, hcp: 20, admissao: "2008-04-03" }, "saiu"))
      .toBe("Duarte Rodrigues — SUB14 (M), RIO · hcp 20 · era federado desde 2008-04-03");
  });
});

describe("describePlayerRounds", () => {
  it("frase de torneio", () => {
    const r = diffWhs([], [
      { score_id: 1, tourn_name: "Campeonato Nacional D1", score_origin: "Torn", hcp_dateStr: "2026-08-15" },
      { score_id: 2, tourn_name: "Campeonato Nacional D2", score_origin: "Torn", hcp_dateStr: "2026-08-16" },
    ]);
    expect(describePlayerRounds("Manuel Medeiros", r))
      .toBe("Manuel Medeiros tem 2 scorecards novos; participou em Campeonato Nacional");
  });

  it("frase de EDS", () => {
    const r = diffWhs([], [
      { score_id: 1, score_origin: "EDS", hcp_dateStr: "2026-08-15" },
      { score_id: 2, score_origin: "EDS", hcp_dateStr: "2026-08-16" },
    ]);
    expect(describePlayerRounds("Joana Sousa", r)).toBe("Joana Sousa tem 2 scorecards novos; por via de EDS");
  });

  it("singular quando é só uma volta", () => {
    const r = diffWhs([], [{ score_id: 1, tourn_name: "Drive Tour", score_origin: "Torn" }]);
    expect(describePlayerRounds("X", r)).toBe("X tem 1 scorecard novo; participou em Drive Tour");
  });

  it("sem voltas novas devolve null", () => {
    expect(describePlayerRounds("X", [])).toBeNull();
  });
});
