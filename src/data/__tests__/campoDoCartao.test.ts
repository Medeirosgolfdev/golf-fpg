import { describe, it, expect } from "vitest";
import { campoDoCartao, teesDoCartao, teeInicial } from "../campoDoCartao";

const PAR18 = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5]; // 72
const M_BRANCAS = [350, 370, 150, 480, 340, 360, 160, 380, 470, 355, 145, 365, 490, 345, 375, 155, 385, 475];
const M_VERMELHAS = M_BRANCAS.map((m) => m - 40);
const SI = [7, 3, 17, 11, 9, 5, 15, 1, 13, 8, 18, 4, 12, 10, 2, 16, 6, 14];

const jog = (over: Record<string, unknown> = {}) => ({ name: "x", sex: "M", par: PAR18, meters: M_BRANCAS, si: SI, teeName: "Brancas", courseRating: 71.2, slope: 128, ...over });

describe("campoDoCartao — o campo de uma prova a partir do cartão dela", () => {
  it("monta o campo no formato da base: buracos, distâncias e ratings", () => {
    const c = campoDoCartao({ name: "Open de Rennes", campo: "Golf de Rennes", players: [jog(), jog(), jog()] })!;
    expect(c.master.name).toBe("Golf de Rennes");
    expect(c.master.tees).toHaveLength(1);
    const t = c.master.tees[0];
    expect(t.teeName).toBe("Brancas");
    expect(t.sex).toBe("M");
    expect(t.holes).toHaveLength(18);
    expect(t.holes[2]).toEqual({ hole: 3, par: 3, si: 17, distance: 150 });
    expect(t.distances).toEqual({ total: 6150, front9: 3060, back9: 3090, holesCount: 18, complete18: true });
    expect(t.ratings.holes18).toEqual({ par: 72, courseRating: 71.2, slopeRating: 128 });
  });

  it("cada cartão diferente é um tee; o mais usado primeiro; homens e senhoras à parte", () => {
    const tees = teesDoCartao({ players: [
      jog({ meters: M_VERMELHAS, teeName: "Vermelhas" }),
      jog(), jog(),
      jog({ sex: "F", meters: M_VERMELHAS, teeName: "Vermelhas", courseRating: 73.4, slope: 131 }),
    ] });
    expect(tees.map((t) => `${t.teeName}/${t.sex}`)).toEqual(["Brancas/M", "Vermelhas/M", "Vermelhas/F"]);
    expect(tees[2].ratings.holes18?.courseRating).toBe(73.4);
  });

  it("sem par oficial ou sem metros em todos os buracos não há campo (nada se inventa)", () => {
    expect(campoDoCartao({ players: [jog({ par: [] })] })).toBeNull();
    expect(campoDoCartao({ players: [jog({ par: Array(18).fill(0) })] })).toBeNull();
    expect(campoDoCartao({ players: [jog({ meters: [] })] })).toBeNull();
    // um buraco a zero (cartões preenchidos à pressa) → o cartão não serve
    expect(campoDoCartao({ players: [jog({ meters: M_BRANCAS.map((m, i) => (i === 4 ? 0 : m)) })] })).toBeNull();
    expect(campoDoCartao({ players: [] })).toBeNull();
  });

  it("o SI só entra se for um SI a sério (na USKids essa linha leva os metros)", () => {
    const t = teesDoCartao({ players: [jog({ si: M_BRANCAS })] })[0];
    expect(t.holes.every((h) => h.si === null)).toBe(true);
    expect(t.holes[0].distance).toBe(350);
  });

  it("sem CR/Slope publicados os ratings ficam vazios, com o par", () => {
    const t = teesDoCartao({ players: [jog({ courseRating: undefined, slope: undefined })] })[0];
    expect(t.ratings.holes18).toEqual({ par: 72, courseRating: null, slopeRating: null });
  });

  it("lê as voltas (roundScores) e os campos de 9 buracos; sem nome de tee, a distância", () => {
    const p9 = PAR18.slice(0, 9), m9 = M_BRANCAS.slice(0, 9);
    const t = teesDoCartao({ players: [{ sex: "", roundScores: [{ pars: p9, meters: m9, si: [] }, { pars: p9, meters: m9, si: [] }] }] })[0];
    expect(t.sex).toBe("U");
    expect(t.teeName).toBe("3060 m");
    expect(t.distances.holesCount).toBe(9);
    expect(t.ratings.holes9Front?.par).toBe(36);
  });

  it("um tee que a fonte chama só «Tee» fica com a distância como nome", () => {
    expect(teesDoCartao({ players: [jog({ teeName: "Tee" })] })[0].teeName).toBe("6150 m");
    expect(teesDoCartao({ players: [jog({ teeName: "Tee 6073m" })] })[0].teeName).toBe("Tee 6073m");
  });

  it("tee inicial: o do jogador indicado, senão o 1.º de homens", () => {
    const c = campoDoCartao({ players: [jog({ sex: "F", teeName: "Vermelhas", meters: M_VERMELHAS }), jog({ sex: "F", teeName: "Vermelhas", meters: M_VERMELHAS }), jog()] })!;
    expect(c.master.tees[0].sex).toBe("F");
    expect(teeInicial(c)?.teeName).toBe("Brancas");
    expect(teeInicial(c, "vermelhas")?.teeName).toBe("Vermelhas");
  });
});
