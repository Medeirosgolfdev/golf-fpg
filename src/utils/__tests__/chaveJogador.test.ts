import { describe, it, expect } from "vitest";
import { chavesSemFundir } from "../chaveJogador";
import { playerKey } from "../playerKey";

describe("chavesSemFundir", () => {
  it("federado primeiro (a chave do playerKey); sem ele, o nome", () => {
    const m = { name: "Manuel Medeiros", fed: "52884" }, j = { name: "João  Sousa", fedCode: "" };
    const k = chavesSemFundir([[m, j]]);
    expect(k.get(m)).toBe(playerKey("52884", "Manuel Medeiros"));
    expect(k.get(j)).toBe(playerKey("", "João Sousa"));
  });

  it("a mesma pessoa tem a mesma chave nas várias voltas", () => {
    const a1 = { name: "Ricardo Camacho", fed: "111" }, a2 = { name: "Ricardo Camacho", fed: "111" };
    const b1 = { name: "Tomás Araújo" }, b2 = { name: "Tomas Araujo" };
    const k = chavesSemFundir([[a1, b1], [a2, b2]]);
    expect(k.get(a1)).toBe(k.get(a2));
    expect(k.get(b1)).toBe(k.get(b2));
  });

  it("homónimos sem federado: separa-os o clube, em TODAS as voltas", () => {
    const e1 = { name: "Pedro Aires", club: "Estela" }, o1 = { name: "Pedro Aires", club: "Oporto" };
    const e2 = { name: "Pedro Aires", club: "Estela" }; // na R2 só um deles (o outro falhou o cut)
    const k = chavesSemFundir([[e1, o1], [e2]]);
    expect(k.get(e1)).not.toBe(k.get(o1));
    expect(k.get(e1)).toBe(k.get(e2));
  });

  it("mesmo nome e mesmo clube: sem chave (não se adivinha)", () => {
    const x = { name: "Pedro Aires", club: "Estela" }, y = { name: "Pedro Aires", club: "Estela" };
    const comFed = { name: "Pedro Aires", club: "Estela", fed: "4939" };
    const k = chavesSemFundir([[x, y, comFed]]);
    expect(k.get(x)).toBeNull();
    expect(k.get(y)).toBeNull();
    expect(k.get(comFed)).toBe("f:4939");
  });
});
