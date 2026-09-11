import { describe, it, expect } from "vitest";
import { pontosEmJogo, projectar, type JogadorOm } from "../omProjection";

const TOPO = { A: 25, B: 20, C: 15 };

describe("pontosEmJogo", () => {
  it("soma os 1.ºs lugares das provas que faltam, por nível", () => {
    // O caso real a 2026-09: 3 Majors, 1 Nível B, 4 Nível C.
    const missing = [
      { level: "A" as const }, { level: "A" as const }, { level: "A" as const },
      { level: "B" as const },
      { level: "C" as const }, { level: "C" as const }, { level: "C" as const }, { level: "C" as const },
    ];
    const r = pontosEmJogo(missing, TOPO);
    expect(r.total).toBe(155);                       // 75 + 20 + 60
    expect(r.porNivel).toEqual([
      { level: "A", provas: 3, porProva: 25, soma: 75 },
      { level: "B", provas: 1, porProva: 20, soma: 20 },
      { level: "C", provas: 4, porProva: 15, soma: 60 },
    ]);
  });

  it("ignora níveis sem provas em falta ou sem escada conhecida", () => {
    expect(pontosEmJogo([{ level: "A" }], {}).total).toBe(0);
    expect(pontosEmJogo([], TOPO).total).toBe(0);
  });
});

describe("projectar", () => {
  const valores = [25, 25, 25, 20, 15, 15, 15, 15];   // 155
  const js: JogadorOm[] = [
    { fed: "1", name: "Líder", total: 70, played: 4, canWin: true, pontuacoes: [15, 25, 15, 15] },
    { fed: "2", name: "Segunda", total: 40, played: 2, canWin: true, pontuacoes: [20, 20] },
    { fed: "3", name: "Longe", total: 16, played: 1, canWin: true, pontuacoes: [16] },
  ];

  it("o líder não precisa de nada e toda a gente ainda chega", () => {
    const [lider, segunda, longe] = projectar(js, valores);
    expect(lider.paraOLider).toBe(0);
    expect(lider.vitoriasNecessarias).toBe(0);
    expect(segunda.paraOLider).toBe(31);      // 70 − 40 + 1
    expect(segunda.maximo).toBe(195);
    expect(segunda.aindaChega).toBe(true);
    expect(longe.aindaChega).toBe(true);
  });

  it("conta as vitórias pelas provas MAIS valiosas primeiro", () => {
    const [, segunda, longe] = projectar(js, valores);
    expect(segunda.vitoriasNecessarias).toBe(2);   // 25+25 = 50 ≥ 31
    expect(longe.vitoriasNecessarias).toBe(3);     // 25+25+25 = 75 ≥ 55
  });

  it("marca quem já não chega nem ganhando tudo", () => {
    const [, x] = projectar(
      [{ fed: "1", name: "Líder", total: 300, played: 9, canWin: true, pontuacoes: [] },
       { fed: "2", name: "Sem hipótese", total: 10, played: 1, canWin: true, pontuacoes: [10] }],
      valores,
    );
    expect(x.aindaChega).toBe(false);
    expect(x.vitoriasNecessarias).toBeNull();
  });

  it("o líder é o melhor de quem PODE ganhar (não-CGSS não conta)", () => {
    const r = projectar(
      [{ fed: "1", name: "Convidado", total: 200, played: 8, canWin: false, pontuacoes: [] },
       { fed: "2", name: "Sócio", total: 70, played: 4, canWin: true, pontuacoes: [70] }],
      valores,
    );
    expect(r[1].paraOLider).toBe(0);   // o sócio é que lidera a OM
  });

  it("regra 7.1: as 3 piores caem — com 4 provas sobra a melhor", () => {
    const [lider] = projectar(js, valores);
    expect(lider.comDesconto).toBe(25);          // [15,15,15,25] → só o 25
    const [, segunda] = projectar(js, valores);
    expect(segunda.comDesconto).toBe(0);         // 2 provas → não sobra nada
  });
});
