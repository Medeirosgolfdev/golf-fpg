import { describe, it, expect } from "vitest";
import {
  buracosDaVolta, buracosDoFlight, cartaoDaVolta, toParDaVolta, parPorVoltaDaFonte,
  resumoResultado, diferencaDeTotais,
} from "../voltasJogadas";

const PAR18 = [4, 5, 4, 3, 4, 5, 3, 4, 4, 4, 4, 4, 5, 3, 5, 4, 3, 4]; // 36 + 36
const SO_VOLTA = [0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 3, 5, 4, 4, 3, 4, 5]; // par só no 10–18 (36)
const NOVE = [4, 5, 3, 4, 3, 4, 2, 5, 5]; // 35

describe("voltasJogadas — quantos buracos", () => {
  it("buracosDaVolta: pelas pancadas, com a guarda do cartão truncado", () => {
    expect(buracosDaVolta({ gross: 35, strokes: NOVE })).toBe(9);
    expect(buracosDaVolta({ gross: 35, strokes: [...NOVE, -1, -1, -1, -1, -1, -1, -1, -1, -1] })).toBe(9);
    expect(buracosDaVolta({ gross: 72, strokes: PAR18 })).toBe(18);
    expect(buracosDaVolta({ gross: 84, strokes: NOVE })).toBe(18); // cartão de 18 truncado
    expect(buracosDaVolta({ gross: 80, strokes: [] })).toBeNull();
    expect(buracosDaVolta({ gross: 80 })).toBeNull();
  });

  it("buracosDoFlight: as voltas mandam no holesPerRound e no par do torneio", () => {
    // Venice Open Boys 8: a ficha do torneio diz 18, o escalão joga 9.
    expect(buracosDoFlight([{ gross: 35, strokes: NOVE }, { gross: 35, strokes: NOVE }], PAR18, 18)).toBe(9);
    expect(buracosDoFlight([{ gross: 72, strokes: PAR18 }], PAR18, 9)).toBe(18);
    expect(buracosDoFlight([{ gross: 80 }], SO_VOLTA, 18)).toBe(9); // sem buraco a buraco: o par
    expect(buracosDoFlight([], [], 9)).toBe(9);
    expect(buracosDoFlight(null, null, undefined)).toBe(18);
  });
});

describe("voltasJogadas — cartão e ±par de uma volta", () => {
  it("9 pancadas seguidas com o par só no 10–18: casa-as com esses buracos", () => {
    const c = cartaoDaVolta(SO_VOLTA, { gross: 35, strokes: NOVE });
    expect(c.buracos).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(c.pancadas).toEqual(NOVE);
    expect(c.parVolta).toBe(36);
    expect(toParDaVolta(SO_VOLTA, { gross: 35, strokes: NOVE })).toBe(-1);
  });

  it("9 buracos num campo com par nos 18: ±par contra 9 buracos, não «−37»", () => {
    expect(toParDaVolta(PAR18, { gross: 35, strokes: NOVE })).toBe(-1);
    const c = cartaoDaVolta(PAR18, { gross: 35, strokes: NOVE });
    expect(c.nBuracos).toBe(9);
    expect(c.buracos).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("o par que a fonte usou escolhe o nove certo", () => {
    const par = [4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 4, 4, 4, 4, 4, 4, 4, 4]; // ida 36, volta 37
    expect(cartaoDaVolta(par, { gross: 36, strokes: NOVE.map(() => 4) }, { parEsperado: 37 }).buracos[0]).toBe(9);
    expect(cartaoDaVolta(par, { gross: 36, strokes: NOVE.map(() => 4) }).buracos[0]).toBe(0);
    expect(parPorVoltaDaFonte({ totalGross: 80, toPar: 6, rounds: [{ gross: 40 }, { gross: 40 }] })).toBe(37);
    expect(parPorVoltaDaFonte({ totalGross: 999, toPar: 6, rounds: [{ gross: 999 }] })).toBeNull();
  });

  it("18 posições com −1 nos não jogados; campo de 9 jogado 2 vezes", () => {
    const st = [-1, -1, -1, -1, -1, -1, -1, -1, -1, 6, 4, 5, 4, 4, 5, 6, 5, 4];
    expect(cartaoDaVolta(PAR18, { gross: 43, strokes: st }).buracos[0]).toBe(9);
    expect(toParDaVolta(PAR18, { gross: 43, strokes: st })).toBe(7);
    const duas = cartaoDaVolta(NOVE, { gross: 72, strokes: PAR18 });
    expect(duas.nBuracos).toBe(18);
    expect(duas.parVolta).toBe(70);
  });

  it("sem cartão, a meio ou impossível → sem ±par", () => {
    expect(toParDaVolta(PAR18, { gross: 999, strokes: [] })).toBeNull();
    expect(toParDaVolta(PAR18, { gross: 24, strokes: [6, 5, 9, 2, 2, -1, -1, -1, -1] })).toBeNull(); // 5 buracos
    expect(toParDaVolta(PAR18, { gross: 40 })).toBeNull(); // 9 buracos sem buraco a buraco, par de 18
    expect(toParDaVolta(PAR18, { gross: 80 })).toBe(8);
    expect(toParDaVolta([], { gross: 80 })).toBeNull();
  });
});

describe("voltasJogadas — resumo de um resultado", () => {
  it("«sem cartão» (88 + 999 = 1087): voltas à vista, sem total nem ±par", () => {
    const r = resumoResultado({ totalGross: 1087, toPar: 941, rounds: [{ gross: 88 }, { gross: 999 }] }, PAR18);
    expect(r.voltas).toEqual([88, null]);
    expect(r.jogadas).toEqual([88]);
    expect(r.semCartao).toBe(true);
    expect(r.total).toBeNull();
    expect(r.toPar).toBeNull();
    expect(resumoResultado({ totalGross: 999, rounds: [] }, PAR18).total).toBeNull();
  });

  it("o ±par de recurso faz-se pelas voltas JOGADAS", () => {
    // 3 voltas na ficha, uma sem gross: 2 × 72, não 3 × 72.
    const r = resumoResultado({ rounds: [{ gross: 75 }, { gross: 77 }, { gross: null }] }, PAR18);
    expect(r.total).toBe(152);
    expect(r.toPar).toBe(8);
    expect(resumoResultado({ totalGross: 150, toPar: 6, rounds: [{ gross: 75 }, { gross: 75 }] }, PAR18).toPar).toBe(6);
  });

  it("9 buracos (três voltas de 40 no Venice Open Boys 8): +12, não «−96»", () => {
    const v = { gross: 40, strokes: [5, 5, 4, 4, 4, 5, 4, 5, 4] };
    const r = resumoResultado({ rounds: [v, v, v] }, PAR18, { buracos: 18 });
    expect(r.nBuracos).toBe(9);
    expect(r.toPar).toBe(12);
  });

  it("sem par por buraco usa o par do torneio (só em 18 buracos)", () => {
    expect(resumoResultado({ rounds: [{ gross: 80 }] }, [], { parTotal: 72 }).toPar).toBe(8);
    expect(resumoResultado({ rounds: [{ gross: 80 }] }, []).toPar).toBeNull();
    expect(resumoResultado({ totalGross: 150 }, PAR18).toPar).toBeNull(); // sem voltas não se sabe quantas foram
  });

  it("diferencaDeTotais: só com o mesmo nº de voltas e sem «sem cartão»", () => {
    const a = resumoResultado({ totalGross: 173, rounds: [{ gross: 86 }, { gross: 87 }] }, PAR18);
    const m = resumoResultado({ totalGross: 285, rounds: [{ gross: 95 }, { gross: 95 }, { gross: 95 }] }, PAR18);
    expect(diferencaDeTotais(a, m)).toBeNull(); // CN Clubes Sub 14: não é «−112»
    const b = resumoResultado({ totalGross: 180, rounds: [{ gross: 90 }, { gross: 90 }] }, PAR18);
    expect(diferencaDeTotais(a, b)).toBe(-7);
    const wd = resumoResultado({ totalGross: 1087, rounds: [{ gross: 88 }, { gross: 999 }] }, PAR18);
    expect(diferencaDeTotais(wd, b)).toBeNull();
  });
});
