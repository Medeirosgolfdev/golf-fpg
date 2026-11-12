import { describe, it, expect } from "vitest";
import { inscritosComGemeo } from "../gemeo";
import type { RFEGDetail, RFEGPlayer } from "../types";

type Inscritos = RFEGDetail["inscritos"];

const j = (name: string, extra: Partial<RFEGPlayer> = {}): RFEGPlayer => ({
  pos: null, name, licencia: null, pais: "ESPAÑA", hcp: null, catEdad: null, sexo: null, club: null, dob: null, estado: null, ...extra,
});
const listas = (p: Partial<Inscritos>): Inscritos => ({
  admitidos: [], reservas: [], bajas: [], invitados: [], noAdmitidos: [], provisional: [],
  counts: { admitidos: 0, reservas: 0, bajas: 0, invitados: 0, noAdmitidos: 0, provisional: 0 } as Inscritos["counts"],
  ...p,
});

/** Quem jogou (as linhas que o adaptador do LGS monta a partir das voltas). */
const jogaram = listas({
  admitidos: [
    j("GARCÍA LÓPEZ, Ana", { pos: 1, licencia: "CM12345678", club: "RCG La Herrería", dob: "02/03/2009" }),
    j("PINTO JOHANSEN, Martim", { pos: 2, pais: "PORTUGAL", licencia: "51234", club: "Oporto Golf Club", dob: "23/05/2010", hcp: 6.1 }),
    j("SEWEL, Harrison", { pos: 3, pais: "INGLATERRA" }),
  ],
});

describe("inscritosComGemeo — a lista oficial do gémeo, sem perder ninguém", () => {
  it("sem listas oficiais fica como estava", () => {
    expect(inscritosComGemeo(jogaram, null)).toBe(jogaram);
    expect(inscritosComGemeo(jogaram, listas({}))).toBe(jogaram);
  });

  it("a lista oficial é a base: admitidos e reservas entram como estão, com o handicap de inscrição", () => {
    const oficial = listas({
      admitidos: [j("García López, Ana", { pos: 12, licencia: "CM12345678", hcp: 3.4, club: "FEDERACION DE MADRID" })],
      reservas: [j("Ruiz Soler, Pablo", { pos: 1, licencia: "AM00011111", hcp: 9.9 })],
    });
    const r = inscritosComGemeo(jogaram, oficial);
    expect(r.admitidos[0]).toMatchObject({ name: "García López, Ana", pos: 12, hcp: 3.4, licencia: "CM12345678", club: "FEDERACION DE MADRID" });
    // o que a lista oficial não traz preenche-se com o de quem jogou (a mesma pessoa)
    expect(r.admitidos[0].dob).toBe("02/03/2009");
    expect(r.reservas.map((p) => p.name)).toEqual(["Ruiz Soler, Pablo"]);
    expect(r.counts.reservas).toBe(1);
  });

  it("um português mantém o federado e o clube da FPG, e fica com o handicap de inscrição oficial", () => {
    const oficial = listas({
      admitidos: [j("PINTO JOHANSEN, MARTIM", { pos: 76, pais: "PORTUGAL", licencia: "AM00086368", hcp: 8.2, club: "REAL FEDERACION ANDALUZA DE GOLF", dob: "23/05/2010" })],
    });
    const m = inscritosComGemeo(jogaram, oficial).admitidos[0];
    expect(m.licencia).toBe("51234");
    expect(m.club).toBe("Oporto Golf Club");
    expect(m.hcp).toBe(8.2);
    expect(m.pos).toBe(76);
  });

  it("quem jogou e não consta da lista oficial junta-se no fim, sem lugar", () => {
    const oficial = listas({ admitidos: [j("García López, Ana", { pos: 12 })] });
    const r = inscritosComGemeo(jogaram, oficial);
    expect(r.admitidos.map((p) => p.name)).toEqual(["García López, Ana", "PINTO JOHANSEN, Martim", "SEWEL, Harrison"]);
    expect(r.admitidos[1].pos).toBeNull();
    expect(r.counts.admitidos).toBe(3);
  });

  it("o mesmo nome com apelidos a mais ou a menos casa quando só há uma candidata", () => {
    const oficial = listas({ admitidos: [j("Martim Johansen", { pos: 5, pais: "PORTUGAL", hcp: 7 })] });
    const r = inscritosComGemeo(jogaram, oficial);
    expect(r.admitidos[0].licencia).toBe("51234");
    // …e por isso não aparece duas vezes
    expect(r.admitidos.filter((p) => /johansen/i.test(p.name ?? "")).length).toBe(1);
  });

  it("na dúvida não casa: dois candidatos possíveis ficam cada um na sua linha", () => {
    const dois = listas({ admitidos: [j("GARCÍA LÓPEZ, Ana", { licencia: "A1" }), j("GARCÍA PÉREZ, Ana", { licencia: "B2" })] });
    const oficial = listas({ admitidos: [j("Ana García", { pos: 1 })] });
    const r = inscritosComGemeo(dois, oficial);
    expect(r.admitidos[0].licencia).toBeNull();
    expect(r.admitidos.length).toBe(3);
  });

  it("dois jogadores com o mesmo nome entre quem jogou: não se casa nenhum", () => {
    const homonimos = listas({ admitidos: [j("Ruiz, Pablo", { licencia: "A1" }), j("Pablo Ruiz", { licencia: "B2" })] });
    const oficial = listas({ admitidos: [j("RUIZ, PABLO", { pos: 4 })] });
    expect(inscritosComGemeo(homonimos, oficial).admitidos[0].licencia).toBeNull();
  });

  it("sem admitidos nem convidados usa a lista provisória (a regra da aba Inscrições)", () => {
    const oficial = listas({ provisional: [j("García López, Ana", { pos: 1, hcp: 3.4 })] });
    const r = inscritosComGemeo(jogaram, oficial);
    expect(r.admitidos).toEqual([]);
    expect(r.provisional.map((p) => p.name)).toEqual(["García López, Ana", "PINTO JOHANSEN, Martim", "SEWEL, Harrison"]);
  });

  it("licença-fantasma da lista oficial não tapa a verdadeira; sem outra, fica a que há", () => {
    const quem = listas({ admitidos: [j("GRABNER MOREIRA, Guilherme", { pais: "PORTUGAL", licencia: "GC00418017" })] });
    const oficial = listas({
      admitidos: [j("Grabner Moreira , Guilherme", { pos: 99, pais: "PORTUGAL", licencia: "XXXXXPOR04" })],
      reservas: [j("Assis, Francisco", { pos: 1, pais: "PORTUGAL", licencia: "XXXXXPOR00" })],
    });
    const r = inscritosComGemeo(quem, oficial);
    expect(r.admitidos[0].licencia).toBe("GC00418017");
    expect(r.reservas[0].licencia).toBe("XXXXXPOR00");
  });

  it("os convidados mantêm-se à parte dos admitidos", () => {
    const oficial = listas({ admitidos: [j("García López, Ana")], invitados: [j("Sewel, Harrison", { pais: "INGLATERRA" })] });
    const r = inscritosComGemeo(jogaram, oficial);
    expect(r.invitados.map((p) => p.name)).toEqual(["Sewel, Harrison"]);
    expect(r.admitidos.map((p) => p.name)).toEqual(["García López, Ana", "PINTO JOHANSEN, Martim"]);
  });
});
