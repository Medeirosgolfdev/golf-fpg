import { describe, it, expect } from "vitest";
import { resumoJogado, parDosJogados } from "../parJogado";

const par = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]; // 72

describe("parJogado", () => {
  it("cartão completo: pancadas contra o par inteiro", () => {
    const g = par.map((p) => p + 1); // 90
    expect(resumoJogado(g, par)).toMatchObject({ pancadas: 90, par: 72, jogados: 18, buracos: 18, completo: true, toPar: 18 });
  });

  it("buracos em branco: ±par só dos jogados (75 em 13 buracos não é «+3»)", () => {
    const g: (number | null)[] = par.map((p, i) => (i < 13 ? p + 2 : null));
    const r = resumoJogado(g, par);
    expect(r.jogados).toBe(13);
    expect(r.completo).toBe(false);
    expect(r.toPar).toBe(26);             // 13 buracos × +2
    expect(r.pancadas - 72).not.toBe(26); // a conta antiga, contra os 18
    expect(parDosJogados(g, par)).toBe(r.par);
  });

  it("troço Out/In e zeros (9 buracos guardados em 18 posições)", () => {
    const g = [...par.slice(0, 9), 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(resumoJogado(g, par, 0, 9)).toMatchObject({ jogados: 9, completo: true, toPar: 0 });
    expect(resumoJogado(g, par, 9, 18)).toMatchObject({ jogados: 0, completo: false, toPar: null });
  });

  it("sem par no buraco jogado não há ±par (nunca gross − 0)", () => {
    expect(resumoJogado([5, 4], [4, null]).toPar).toBeNull();
    expect(resumoJogado([5, 4], null).toPar).toBeNull();
    expect(resumoJogado([5, 4], [4, null]).pancadas).toBe(9);
  });
});
