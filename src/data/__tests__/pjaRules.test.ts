/**
 * pja-rules.mjs — fonte ÚNICA das regras do Ranking PJA, partilhada entre a
 * app principal (FPGPage/PJARankingView/constants) e a página standalone
 * ranking-pja.vercel.app (ranking-pja/index.html). Estes testes fixam o
 * comportamento contra casos REAIS dos dados do repo.
 */
import { describe, it, expect } from "vitest";
import {
  PJA_TCODES, pjaPts, isGFTournament, getTournMultiplier,
  classifyPJAEvent, isPJACore,
} from "../../../ranking-pja/pja-rules.mjs";

describe("isPJACore", () => {
  it("aceita torneios com PJA no nome (qualquer ano)", () => {
    expect(isPJACore({ name: "PJA Race to Dunas", date: "2025-06-01" })).toBe(true);
    expect(isPJACore({ name: "PJA TOUR Vale Pisão", date: "2026-03-14" })).toBe(true);
  });

  it("aceita tcodes da whitelist PJA_TCODES, incluindo sintéticos A+B", () => {
    expect(isPJACore({ name: "Aroeira Master by Details", tcode: "10492", date: "2025-02-22" })).toBe(true);
    expect(isPJACore({ name: "X", tcode: "10370+10444", date: "2025-02-01" })).toBe(true);
  });

  it("2026+: Drive Tour sim, Drive Challenge não", () => {
    expect(isPJACore({ name: "1º Torneio Drive Tour Madeira - Palheiro Golf", date: "2026-01-10" })).toBe(true);
    expect(isPJACore({ name: "3º Drive Challenge Madeira - Palheiro", date: "2026-02-28" })).toBe(false);
  });

  it("2026+: Aquapor e Greatgolf Junior entram", () => {
    expect(isPJACore({ name: "1º Torneio do Circuito Aquapor-Morgado Golf", date: "2026-02-01" })).toBe(true);
    expect(isPJACore({ name: "Greatgolf Junior Open 2026", tcode: "10294", date: "2026-02-16" })).toBe(true);
  });

  it("Amendoeira World Kids: edição 2026 entra (todos os escalões), 2025 fica fora", () => {
    // 2026: ccode 179, tcodes 10603-10607 — match por NOME (os tcodes
    // 10604-10606 são reutilizados pelo Clube de Belas 2025)
    expect(isPJACore({ name: "Amendoeira World Kids Golfe 2026 Sub 10", tcode: "10603", date: "2026-07-29" })).toBe(true);
    expect(isPJACore({ name: "Amendoeira World Kids Golfe 2026 Sub 12", tcode: "10604", date: "2026-07-29" })).toBe(true);
    expect(isPJACore({ name: "Amendoeira World Kids Golfe 2026 Sub 16/18", tcode: "10606", date: "2026-07-29" })).toBe(true);
    // Edição 2025 — ranking 2025 é o legacy confirmado contra o Excel oficial
    expect(isPJACore({ name: "Amendoeira World Kids Sub 12", tcode: "10570", date: "2025-07-23" })).toBe(false);
  });

  it("Miramar Internacional Open U25 (2026) entra; provas de clube do mesmo campo ficam fora", () => {
    // ccode 003, tcodes 10652 (U25) + 10653 (Sub-10), 19-21 Ago 2026 —
    // "Miramar Open" no calendário oficial PJA TOUR 2026.
    expect(isPJACore({ name: "X Miramar Internacional Open U25", tcode: "10652", date: "2026-08-19" })).toBe(true);
    expect(isPJACore({ name: "X Miramar Internacional Open U25 - Sub10", tcode: "10653", date: "2026-08-19" })).toBe(true);
    expect(isPJACore({ name: "VIII Miramar Internacional Open U25", tcode: "10652", date: "2026-08-19" })).toBe(true);
    // gralha da fonte ("Internancional") — o regex tem de a apanhar
    expect(isPJACore({ name: "Miramar Internancional Open U25", tcode: "10652", date: "2026-08-19" })).toBe(true);
    // provas de clube do MESMO campo em 2026 — não são PJA
    expect(isPJACore({ name: "Taça Praia de Miramar", tcode: "10616", date: "2026-02-21" })).toBe(false);
    expect(isPJACore({ name: "Miramar Spring Cup", tcode: "10617", date: "2026-04-11" })).toBe(false);
    expect(isPJACore({ name: "XI Banco Carregosa Miramar Open - Final", tcode: "10572", date: "2026-09-14" })).toBe(false);
  });

  it("Camp. Juvenil — Taça Visconde Pereira Machado fica FORA (jogaram das brancas)", () => {
    // ccode 004, tcodes 10580 (Escalão A, 6 Jul) + 10581 (Escalão B, 7 Jul).
    // Está no calendário PJA TOUR 2026 mas NÃO conta: os miúdos jogaram das
    // brancas, fora das marcas do escalão deles — o par (e logo os pontos)
    // não é comparável com o resto do circuito. Ver a nota no isPJACore.
    expect(isPJACore({ name: "CAMP. JUVENIL - T.V.P.M. (Escalão A)", tcode: "10580", date: "2026-07-06" })).toBe(false);
    expect(isPJACore({ name: "CAMP. JUVENIL - T.V.P.M. (Escalão B)", tcode: "10581", date: "2026-07-07" })).toBe(false);
    // nome por extenso — a mesma prova, também fora
    expect(isPJACore({ name: "Camp. Juvenil - Taça Visconde de Pereira Machado", tcode: "10532", date: "2026-09-01" })).toBe(false);
  });

  it("tcodes reutilizados pela FPG nos mesmos números NÃO entram por tcode", () => {
    // 10652/10653 vivem noutros clubes e anos — o match do Miramar é por NOME
    expect(isPJACore({ name: "2º Estela Friday Cup 2026", tcode: "10652", date: "2026-02-20" })).toBe(false);
    expect(isPJACore({ name: "8ª Taça Manuel Melo", tcode: "10653", date: "2026-02-21" })).toBe(false);
    expect(isPJACore({ name: "23º Torneio Internacional Juvenil - Sub14", tcode: "10652", date: "2026-12-20" })).toBe(false);
  });

  it("tcodes do Clube de Belas 2025 que colidem com os do Amendoeira ficam fora", () => {
    expect(isPJACore({ name: "6ª Ordem de Merito do Clube de Belas/Sardinhada", tcode: "10604", date: "2025-06-29" })).toBe(false);
    expect(isPJACore({ name: "7ª Ordem de Mérito do Clube de Belas2025", tcode: "10606", date: "2025-07-19" })).toBe(false);
  });
});

describe("classifyPJAEvent", () => {
  it("distingue os 3 Greatgolf 2026 por tcode", () => {
    expect(classifyPJAEvent({ name: "Greatgolf Junior Open 2026", tcode: "10294" })).toBe("GG_MAIN");
    expect(classifyPJAEvent({ name: "Greatgolf Junior Open 2026 -U14", tcode: "10295" })).toBe("GG_U14");
    expect(classifyPJAEvent({ name: "Greatgolf Junior Open 2026 -U12", tcode: "10296" })).toBe("GG_U12");
  });

  it("DT / Aquapor / exclusivos", () => {
    expect(classifyPJAEvent({ name: "2º Torneio Drive Tour Sul - Laguna" })).toBe("DT");
    expect(classifyPJAEvent({ name: "1º Torneio do Circuito Aquapor-Morgado Golf" })).toBe("AQUAPOR");
    expect(classifyPJAEvent({ name: "Amendoeira World Kids Golfe 2026 Sub 12", tcode: "10604" })).toBe("PJA_EXCL");
    expect(classifyPJAEvent({ name: "PJA PGA Aroeira No.2" })).toBe("PJA_EXCL");
    expect(classifyPJAEvent({ name: "X Miramar Internacional Open U25", tcode: "10652" })).toBe("PJA_EXCL");
  });
});

describe("multiplicadores e pontos", () => {
  it("Grande Final por tcode e por nome → ×1.5", () => {
    expect(isGFTournament({ name: "Race to Dunas G. Final", tcode: "10019" })).toBe(true);
    expect(getTournMultiplier({ name: "PJA TOUR Grand Final", tcode: "99999" })).toBe(1.5);
    // "Race to Dunas" sem "Final" NÃO é GF (bug 2026-04-28)
    expect(isGFTournament({ name: "PJA Race to Dunas", tcode: "88888" })).toBe(false);
  });

  it("Royal Óbidos 10444 → ×1.75 (decisão da comissão técnica)", () => {
    expect(getTournMultiplier({ name: "AT&T Pebble Beach Pro-Am by Titleist", tcode: "10444" })).toBe(1.75);
  });

  it("standard ×1.0 e pontos par=25 com mínimo 0", () => {
    expect(getTournMultiplier({ name: "Amendoeira World Kids Golfe 2026 Sub 14", tcode: "10605" })).toBe(1.0);
    expect(getTournMultiplier({ name: "X Miramar Internacional Open U25", tcode: "10652" })).toBe(1.0);
    expect(pjaPts(0, 1)).toBe(25);
    expect(pjaPts(3, 1)).toBe(22);
    expect(pjaPts(-2, 1)).toBe(27);
    expect(pjaPts(30, 1)).toBe(0);      // nunca negativo
    expect(pjaPts(2, 1.5)).toBe(34.5);  // GF
  });

  it("PJA_TCODES mantém os 5 exclusivos de 2025", () => {
    expect([...PJA_TCODES].sort()).toEqual(["10019", "10036", "10260", "10444", "10492"]);
  });
});
