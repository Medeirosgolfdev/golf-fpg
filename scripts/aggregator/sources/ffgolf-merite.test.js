/**
 * sources/ffgolf.js — o ano de nascimento EXACTO da categoria do Mérite Jeunes e
 * o «Index» do Mérite no histórico (04/11/2026: os franceses do Venice e do
 * European tinham HCP mas nenhum ano — o france-players.json tinha-o e a fonte
 * não o lia).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { load } = require("./ffgolf.js");

describe("ffgolf — Mérite Jeunes", () => {
  const { players } = load();
  const lic = (l) => players.find((p) => p.sourceKey === l);

  it("ano certo pela categoria (Bokim Sadberry, Benjamin 1 em 2026 → 2013)", () => {
    const p = lic("544633352");
    expect(p.extra.birthYear).toBe(2013);
    expect(p.dobRange).toEqual({ lo: "2013-01-01", hi: "2013-12-31" });
  });

  it("o Index do Mérite entra no histórico com o mês; sem categoria do Mérite, sem ano", () => {
    expect(lic("544633352").hcpHistory).toEqual(expect.arrayContaining([expect.objectContaining({ source: "ffg-merite", date: expect.stringMatching(/^\d{4}-\d{2}-01$/) })]));
    const sem = players.filter((p) => !p.extra?.birthYear);
    expect(sem.length).toBeGreaterThan(0);
    expect(sem.every((p) => !p.dobRange)).toBe(true);
  });
});
