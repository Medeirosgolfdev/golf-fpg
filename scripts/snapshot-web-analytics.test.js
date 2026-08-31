/**
 * Testes do scripts/snapshot-web-analytics.js
 *
 * Cobre a aritmética de datas e o parsing de argumentos — a parte que falha
 * em silêncio (um retrato do dia errado parece perfeitamente normal) e que
 * só se nota meses depois, quando já não há como recuperar os dados.
 * A camada HTTP não é testada aqui: precisa de token e de rede.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  dayBounds,
  monthBounds,
  shiftDay,
  yesterdayUtc,
  previousMonthUtc,
  parseArgs,
  mudou,
} from "./snapshot-web-analytics.js";

describe("limites do dia", () => {
  it("cobre o dia inteiro, do primeiro ao último milissegundo", () => {
    expect(dayBounds("2026-08-28")).toEqual({
      since: "2026-08-28T00:00:00.000Z",
      until: "2026-08-28T23:59:59.999Z",
    });
  });
});

describe("limites do mês", () => {
  it("mês de 31 dias", () => {
    expect(monthBounds("2026-08")).toEqual({
      since: "2026-08-01T00:00:00.000Z",
      until: "2026-08-31T23:59:59.999Z",
    });
  });

  it("mês de 30 dias", () => {
    expect(monthBounds("2026-04").until).toBe("2026-04-30T23:59:59.999Z");
  });

  it("Fevereiro comum acaba a 28", () => {
    expect(monthBounds("2026-02").until).toBe("2026-02-28T23:59:59.999Z");
  });

  it("Fevereiro bissexto acaba a 29", () => {
    expect(monthBounds("2028-02").until).toBe("2028-02-29T23:59:59.999Z");
  });

  it("Dezembro não escorrega para Janeiro", () => {
    expect(monthBounds("2026-12").until).toBe("2026-12-31T23:59:59.999Z");
  });
});

describe("deslocar dias", () => {
  it("recua dentro do mesmo mês", () => {
    expect(shiftDay("2026-08-28", -1)).toBe("2026-08-27");
  });

  it("atravessa a fronteira do mês para trás", () => {
    expect(shiftDay("2026-08-01", -1)).toBe("2026-07-31");
  });

  it("atravessa a fronteira do ano para trás", () => {
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("respeita o 29 de Fevereiro num ano bissexto", () => {
    expect(shiftDay("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("avança também", () => {
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("ontem em UTC", () => {
  it("no meio do mês", () => {
    expect(yesterdayUtc(new Date("2026-08-28T03:15:00Z"))).toBe("2026-08-27");
  });

  it("no primeiro dia do mês devolve o último do anterior", () => {
    expect(yesterdayUtc(new Date("2026-09-01T03:15:00Z"))).toBe("2026-08-31");
  });

  it("logo depois da meia-noite UTC, e não o próprio dia", () => {
    expect(yesterdayUtc(new Date("2026-08-28T00:00:01Z"))).toBe("2026-08-27");
  });
});

describe("mês anterior em UTC", () => {
  it("no meio do ano", () => {
    expect(previousMonthUtc(new Date("2026-08-15T00:00:00Z"))).toBe("2026-07");
  });

  it("em Janeiro devolve Dezembro do ano anterior", () => {
    expect(previousMonthUtc(new Date("2026-01-03T03:15:00Z"))).toBe("2025-12");
  });

  it("no dia 1 devolve o mês que acabou de fechar", () => {
    expect(previousMonthUtc(new Date("2026-09-01T03:15:00Z"))).toBe("2026-08");
  });

  it("preenche o mês com zero à esquerda", () => {
    expect(previousMonthUtc(new Date("2026-10-05T00:00:00Z"))).toBe("2026-09");
  });
});

describe("argumentos", () => {
  it("sem argumentos, o alvo é o dia de ontem", () => {
    const o = parseArgs([]);
    expect(o.alvos).toHaveLength(1);
    expect(o.alvos[0].tipo).toBe("day");
    expect(o.dryRun).toBe(false);
  });

  it("--day com data explícita", () => {
    expect(parseArgs(["--day", "2026-08-28"]).alvos).toEqual([
      { tipo: "day", chave: "2026-08-28" },
    ]);
  });

  it("--month sem valor usa o mês anterior", () => {
    const o = parseArgs(["--month"]);
    expect(o.alvos[0].tipo).toBe("month");
    expect(o.alvos[0].chave).toMatch(/^[0-9]{4}-[0-9]{2}$/);
  });

  it("--month com valor explícito", () => {
    expect(parseArgs(["--month", "2026-07"]).alvos).toEqual([
      { tipo: "month", chave: "2026-07" },
    ]);
  });

  it("--dry-run não é confundido com o valor de --day", () => {
    const o = parseArgs(["--day", "--dry-run"]);
    expect(o.dryRun).toBe(true);
    expect(o.alvos[0].tipo).toBe("day");
    expect(o.alvos[0].chave).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  });

  it("--backfill gera N dias, do mais antigo para o mais recente, sem incluir hoje", () => {
    const o = parseArgs(["--backfill", "3"]);
    expect(o.alvos).toHaveLength(3);
    expect(o.alvos.every((a) => a.tipo === "day")).toBe(true);
    const chaves = o.alvos.map((a) => a.chave);
    expect([...chaves].sort()).toEqual(chaves); // ordem cronológica
    const hoje = new Date().toISOString().slice(0, 10);
    expect(chaves).not.toContain(hoje);
  });

  it("dia e mês podem ser pedidos na mesma corrida", () => {
    const o = parseArgs(["--day", "2026-08-31", "--month", "2026-08"]);
    expect(o.alvos).toEqual([
      { tipo: "day", chave: "2026-08-31" },
      { tipo: "month", chave: "2026-08" },
    ]);
  });
});

describe("detecção de alterações", () => {
  const tmp = path.join(os.tmpdir(), `wa-test-${process.pid}.json`);

  it("ficheiro inexistente conta como alteração", () => {
    expect(mudou(path.join(os.tmpdir(), "nao-existe-de-todo.json"), { a: 1 })).toBe(true);
  });

  it("o carimbo temporal sozinho não conta como alteração", () => {
    fs.writeFileSync(tmp, JSON.stringify({ geradoEm: "2026-01-01T00:00:00Z", total: { visitors: 5 } }));
    expect(mudou(tmp, { geradoEm: "2026-06-06T12:00:00Z", total: { visitors: 5 } })).toBe(false);
    fs.unlinkSync(tmp);
  });

  it("um número diferente conta como alteração", () => {
    fs.writeFileSync(tmp, JSON.stringify({ geradoEm: "2026-01-01T00:00:00Z", total: { visitors: 5 } }));
    expect(mudou(tmp, { geradoEm: "2026-01-01T00:00:00Z", total: { visitors: 6 } })).toBe(true);
    fs.unlinkSync(tmp);
  });

  it("ficheiro corrompido é reescrito em vez de rebentar", () => {
    fs.writeFileSync(tmp, "{ isto nao e json");
    expect(mudou(tmp, { total: { visitors: 1 } })).toBe(true);
    fs.unlinkSync(tmp);
  });
});
