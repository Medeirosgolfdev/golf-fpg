/* A selecção do que se apaga no Vercel — a parte que, se estiver errada,
 * deita abaixo o site. Testada em isolamento porque exercitá-la contra a API
 * a sério apagaria deployments a sério. */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const { escolher, minutosDoErro } = createRequire(import.meta.url)("./prune-vercel-deployments.js");

const DIA = 86400000;
const agora = Date.parse("2026-09-06T21:00:00Z");
const dep = (uid, diasAtras, state = "READY") =>
  ({ uid, created: agora - diasAtras * DIA, state });

const correr = (deps, opts = {}) =>
  escolher(deps, { producaoId: null, keep: 5, minAgeDays: 1, agora, ...opts });

describe("escolher — o que se apaga", () => {
  it("nunca apaga o deployment que está em produção, por antigo que seja", () => {
    const deps = [dep("prod", 400), ...Array.from({ length: 20 }, (_, i) => dep(`d${i}`, i + 2))];
    const { guardar, apagar } = correr(deps, { producaoId: "prod" });
    expect(apagar.find((d) => d.uid === "prod")).toBeUndefined();
    expect(guardar.find((g) => g.d.uid === "prod").motivo).toBe("produção actual");
  });

  it("nunca apaga um deployment a construir ou em fila", () => {
    const deps = [...Array.from({ length: 10 }, (_, i) => dep(`d${i}`, i + 2)), dep("build", 30, "BUILDING"), dep("fila", 40, "QUEUED")];
    const { apagar } = correr(deps);
    expect(apagar.map((d) => d.uid)).not.toContain("build");
    expect(apagar.map((d) => d.uid)).not.toContain("fila");
  });

  it("guarda os N mais recentes (margem de rollback)", () => {
    const deps = Array.from({ length: 12 }, (_, i) => dep(`d${i}`, i + 2));
    const { guardar, apagar } = correr(deps, { keep: 5 });
    expect(guardar).toHaveLength(5);
    expect(guardar.map((g) => g.d.uid)).toEqual(["d0", "d1", "d2", "d3", "d4"]);
    expect(apagar).toHaveLength(7);
  });

  it("nao apaga nada mais novo do que min-age-days", () => {
    const deps = Array.from({ length: 30 }, (_, i) => dep(`d${i}`, 0.1 * i));  // todos < 3 dias
    const { apagar } = correr(deps, { keep: 0, minAgeDays: 3 });
    expect(apagar).toHaveLength(0);
  });

  it("ordena por data — o mais recente conta como recente mesmo vindo no fim da lista", () => {
    const deps = [dep("velho", 100), dep("novo", 0.5)];
    const { guardar } = correr(deps, { keep: 1 });
    expect(guardar[0].d.uid).toBe("novo");
  });

  it("com uma lista vazia nao explode nem apaga nada", () => {
    const { guardar, apagar } = correr([]);
    expect(guardar).toHaveLength(0);
    expect(apagar).toHaveLength(0);
  });

  it("as tres excepcoes somam-se: producao ANTIGA + em curso antigos + 5 recentes", () => {
    /* Producao e builds propositadamente VELHOS: se estivessem no topo da
     * lista ja seriam guardados pela regra dos N recentes e o teste nao
     * provava nada. */
    const deps = [
      dep("prod", 300),
      dep("b1", 200, "BUILDING"),
      dep("b2", 150, "QUEUED"),
      ...Array.from({ length: 37 }, (_, i) => dep(`d${i}`, i + 2)),
    ];
    const { guardar, apagar } = correr(deps, { producaoId: "prod", keep: 5 });
    expect(guardar).toHaveLength(8);   // prod + 2 em curso + 5 recentes
    expect(apagar).toHaveLength(32);
    expect(apagar.every((d) => d.state === "READY")).toBe(true);
  });
});

describe("minutosDoErro — espera pedida pelo limite da API", () => {
  it("lê os minutos da mensagem real do Vercel", () => {
    expect(minutosDoErro('HTTP 429 em /v13/deployments/dpl_x: Too many requests - try again in 10 minutes (more than 200, code: "now-rm").')).toBe(10);
  });
  it("aceita outros valores", () => {
    expect(minutosDoErro("Too many requests - try again in 3 minutes")).toBe(3);
  });
  it("cai no valor por defeito quando a mensagem não diz nada", () => {
    expect(minutosDoErro("Too many requests")).toBe(10);
    expect(minutosDoErro(undefined)).toBe(10);
  });
  it("ignora valores absurdos (protege contra esperar horas)", () => {
    expect(minutosDoErro("try again in 5000 minutes")).toBe(10);
    expect(minutosDoErro("try again in 0 minutes")).toBe(10);
  });
});
