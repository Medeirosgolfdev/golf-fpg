import { describe, it, expect } from "vitest";
import { temCartao, voltasComCartao, parsePos, posicoesComEmpates, classificarPorTotal } from "../classificacao";

describe("classificacao", () => {
  it("temCartao: 0, null e ≥ 900 não são cartão", () => {
    expect(temCartao(74)).toBe(true);
    expect(temCartao(0)).toBe(false);
    expect(temCartao(null)).toBe(false);
    expect(temCartao(997)).toBe(false);
    expect(temCartao(1072)).toBe(false);
  });

  it("voltasComCartao aceita números e voltas com gross", () => {
    expect(voltasComCartao([74, 998, null, 0])).toBe(1);
    expect(voltasComCartao([{ gross: 80 }, { gross: 999 }, { gross: 79 }])).toBe(2);
    expect(voltasComCartao(undefined)).toBe(0);
  });

  it("parsePos lê T4 e recusa CUT/WD", () => {
    expect(parsePos(4)).toBe(4);
    expect(parsePos("T4")).toBe(4);
    expect(parsePos(" 12 ")).toBe(12);
    expect(parsePos("CUT")).toBeNull();
    expect(parsePos("WD")).toBeNull();
    expect(parsePos(null)).toBeNull();
    expect(parsePos(0)).toBeNull();
  });

  it("posicoesComEmpates: 1, 2, 2, 4", () => {
    const l = [{ t: 70 }, { t: 72 }, { t: 72 }, { t: 75 }];
    const pos = posicoesComEmpates(l, (x) => x.t);
    expect(l.map((x) => pos.get(x))).toEqual([1, 2, 2, 4]);
  });

  it("classificarPorTotal deixa de fora quem jogou menos voltas ou ficou sem cartão", () => {
    const a = { n: "duas voltas", r: [70, 71], t: 141 };
    const b = { n: "uma volta", r: [86], t: 86 };
    const c = { n: "sem cartão", r: [74, 998], t: 1072 };
    const d = { n: "empatado", r: [71, 70], t: 141 };
    const { ordenados, pos, voltasDaProva } = classificarPorTotal([b, a, c, d], (x) => voltasComCartao(x.r), (x) => x.t);
    expect(voltasDaProva).toBe(2);
    expect(ordenados.map((x) => x.n)).toEqual(["duas voltas", "empatado"]);
    expect(pos.get(a)).toBe(1);
    expect(pos.get(d)).toBe(1);
    expect(pos.has(b)).toBe(false);
    expect(pos.has(c)).toBe(false);
  });
});
