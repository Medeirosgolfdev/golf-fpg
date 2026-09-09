/**
 * scripts/scrape-wagr.test.js — o parser do `__NEXT_DATA__` das páginas de
 * evento do wagr.com.
 *
 * É a parte frágil do scraper: os resultados NÃO vêm da API (não há endpoint
 * de leaderboard), vêm embutidos no HTML SSR do Next.js. Se o wagr.com mudar
 * a forma do `pageProps`, o scraper passa a escrever eventos vazios em silêncio
 * — os testes fixam o contrato com um HTML mínimo real.
 *
 * As três regras que estes testes protegem:
 *   1. datas cortadas SEM passar por Date (o bug dos fusos: meia-noite em UTC
 *      dava −1 dia);
 *   2. posições com "T" (empate) e texto ("Participant") não partem o posNum;
 *   3. rondas em falta ficam null, não 0 — um R4 a 0 punha o jogador em 1º.
 */
import { describe, it, expect, afterAll } from "vitest";
import { createRequire } from "module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { parseEventPage, posNum, isoDay, isSettled } = require("./scrape-wagr.js");

/** HTML mínimo com a mesma forma do wagr.com/events/{slug}-{id}. */
function html(pageProps) {
  return `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    { props: { pageProps } }
  )}</script></body></html>`;
}

const PAGE = html({
  eventDetailsData: {
    eventDetails: {
      eventName: "Campeonato Nacional de Jovens",
      eventStartDate: "2026-05-01T00:00:00",
      eventEndDate: "2026-05-03T00:00:00",
      country: "Portugal", region: "Europe", city: null,
      eventType: "Junior", format: "Strokeplay", gender: "M",
      organiserName: "Portuguese Golf Federation",
      wagrWeek: "202618", power: "26.4860",
      strokeplayRounds: 3, matchplayRounds: 0,
    },
  },
  eventResultsData: {
    eventResults: {
      results: [
        {
          playerId: 43316, finishPosition: "1", totalScore: "214", points: "7.1416",
          playerName: "Luis Silva", nationality: "Portugal",
          roundByRoundScores: [
            { roundNumber: "1", score: "75" }, { roundNumber: "2", score: "69" }, { roundNumber: "3", score: "70" },
          ],
        },
        {
          playerId: 39175, finishPosition: "T5", totalScore: "218", points: "5.6285",
          playerName: "Gabriel Sardo", nationality: "Portugal",
          roundByRoundScores: [{ roundNumber: "1", score: "71" }],
        },
        {
          playerId: 41076, finishPosition: "Participant", totalScore: null, points: "0.4567",
          playerName: "Francisco Reis", nationality: "Portugal", roundByRoundScores: [],
        },
        {
          // Linha "Participant" real: o WAGR manda totalScore "0", que NÃO é um score.
          playerId: 4371, finishPosition: "Participant", totalScore: "0", points: "0.1087",
          playerName: "Gianluca Bolla", nationality: "Italy",
          roundByRoundScores: [{ roundNumber: "1", score: "0" }],
        },
      ],
    },
  },
});

describe("parseEventPage — leaderboard do __NEXT_DATA__", () => {
  const ev = parseEventPage(PAGE, 272939);

  it("lê os detalhes do evento", () => {
    expect(ev.id).toBe("272939");
    expect(ev.name).toBe("Campeonato Nacional de Jovens");
    expect(ev.country).toBe("Portugal");
    expect(ev.eventType).toBe("Junior");
    expect(ev.sex).toBe("M");
    expect(ev.power).toBe(26.486);
    expect(ev.spRounds).toBe(3);
  });

  it("corta as datas sem passar por Date (não perde um dia em UTC)", () => {
    expect(ev.startDate).toBe("2026-05-01");
    expect(ev.endDate).toBe("2026-05-03");
  });

  it("lê os jogadores com rondas, total e pontos", () => {
    expect(ev.players).toHaveLength(4);
    const [p1, p2, p3] = ev.players;
    expect(p1).toMatchObject({ id: "43316", name: "Luis Silva", pos: "1", posNum: 1, total: 214, points: 7.1416 });
    expect([p1.r1, p1.r2, p1.r3, p1.r4]).toEqual([75, 69, 70, null]);
    // Empate: mantém o texto em `pos` e extrai o número para ordenar.
    expect(p2.pos).toBe("T5");
    expect(p2.posNum).toBe(5);
    // Rondas em falta ficam null — nunca 0, senão o jogador subia no sorting.
    expect([p2.r2, p2.r3, p2.r4]).toEqual([null, null, null]);
    // "Participant" não é posição numérica; o total ausente é null, não 0.
    expect(p3.posNum).toBeNull();
    expect(p3.total).toBeNull();
  });

  it("0 é ausência de score, não um score (linhas 'Participant')", () => {
    // Sem isto o jogador aparecia com TOTAL 0 e subia ao topo de qualquer
    // ordenação por total. São ~3% das linhas do WAGR.
    const bolla = ev.players.find((p) => p.id === "4371");
    expect(bolla.total).toBeNull();
    expect(bolla.r1).toBeNull();
    // Os pontos, esses, contam mesmo sendo pequenos — não são zerados.
    expect(bolla.points).toBe(0.1087);
  });

  it("rejeita HTML sem __NEXT_DATA__ em vez de devolver um evento vazio", () => {
    expect(() => parseEventPage("<html><body>bloqueado</body></html>", 1)).toThrow(/__NEXT_DATA__/);
  });

  it("um evento ainda sem resultados dá zero jogadores, não rebenta", () => {
    const vazio = parseEventPage(html({ eventDetailsData: { eventDetails: { eventName: "Futuro" } } }), 9);
    expect(vazio.players).toEqual([]);
    expect(vazio.name).toBe("Futuro");
  });
});

describe("isSettled — o que o --skip-existing pode saltar", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wagr-test-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (nome, obj) => {
    const f = path.join(dir, nome);
    fs.writeFileSync(f, JSON.stringify(obj));
    return f;
  };
  const dias = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  it("salta um evento com classificados", () => {
    expect(isSettled(write("cheio.json", { endDate: dias(-1), players: [{ name: "X" }] }))).toBe(true);
  });
  it("NÃO salta um evento futuro sem classificados (senão nunca mais era re-fetchado)", () => {
    expect(isSettled(write("futuro.json", { endDate: dias(30), players: [] }))).toBe(false);
  });
  it("NÃO salta um evento acabado há pouco e ainda sem classificados", () => {
    expect(isSettled(write("recente.json", { endDate: dias(-5), players: [] }))).toBe(false);
  });
  it("salta um evento antigo que nunca teve classificados — o vazio é definitivo", () => {
    expect(isSettled(write("antigo.json", { endDate: dias(-400), players: [] }))).toBe(true);
  });
  it("ficheiro inexistente ou corrompido nunca é saltado", () => {
    expect(isSettled(path.join(dir, "nao-existe.json"))).toBe(false);
    fs.writeFileSync(path.join(dir, "lixo.json"), "{nao é json");
    expect(isSettled(path.join(dir, "lixo.json"))).toBe(false);
  });
});

describe("helpers", () => {
  it("posNum aceita empates e recusa texto", () => {
    expect(posNum("3")).toBe(3);
    expect(posNum("T12")).toBe(12);
    expect(posNum("Participant")).toBeNull();
    expect(posNum(null)).toBeNull();
  });
  it("isoDay corta a hora e ignora valores inválidos", () => {
    expect(isoDay("2026-05-01T00:00:00")).toBe("2026-05-01");
    expect(isoDay(null)).toBeNull();
    expect(isoDay("")).toBeNull();
  });
});
