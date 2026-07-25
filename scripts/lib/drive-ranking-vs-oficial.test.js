/**
 * Teste de INTEGRAÇÃO: o total que o site calcula (tournamentPoints +
 * rankingTotal, a mesma lógica que a DrivePage/ResumoTable usam) tem de dar
 * o MESMO número que o ranking oficial da FPG, com os dados reais do repo.
 *
 * É a rede de segurança da regra "o site calcula como a FPG": se alguém
 * mexer na tabela de pontos, no peso das Finais ou nos empates, isto cai.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { tournamentPoints, rankingTotal } from "./drive-points.cjs";

const DATA = path.resolve(__dirname, "..", "..", "public", "data");
const YEAR = "2026";

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
const rankings = readJson("drive-rankings.json").rankings || {};

/** Todos os torneios Drive do ano (sem as entradas de ronda individual). */
function loadTournaments(prefix) {
  const out = [];
  for (const f of fs.readdirSync(DATA)) {
    if (!new RegExp(`^${prefix}-data-${YEAR}-\\d{2}\\.json$`).test(f)) continue;
    out.push(...(readJson(f).tournaments || []));
  }
  return out;
}

const driveTournaments = loadTournaments("drive");

/** Reproduz o que a DrivePage faz: pontos por prova + total do ranking. */
function totalCalculado(fed, filtro) {
  const results = [];
  for (const t of driveTournaments) {
    if (!filtro(t)) continue;
    const pts = tournamentPoints(
      (t.players || []).map(p => ({
        fed: String(p.fedCode || p.fed || ""),
        pos: p.pos,
        gross: typeof p.grossTotal === "number" ? p.grossTotal : null,
      })),
      t.series,
    );
    if (!pts.has(String(fed))) continue;
    results.push({ pos: null, pts: pts.get(String(fed)), series: t.series, tournName: t.name });
  }
  return rankingTotal(results);
}

/** Última prova que o ranking oficial conhece (evita comparar o que a FPG
 *  ainda não carregou). */
function oficialAte(r) {
  let max = null;
  for (const p of r.players) {
    for (const res of p.results || []) {
      if (/fase\s+regular/i.test(res.tournament || "")) continue;
      if (res.date && (!max || res.date > max)) max = res.date;
    }
  }
  return max;
}

describe("total do site vs ranking oficial da FPG", () => {
  const casos = [
    // [código, filtro dos nossos torneios, quantos jogadores comparar]
    ["DC_MADM14G26", (t) => t.series === "challenge" && t.region === "madeira" && t.escalao === "Sub 14"],
    ["DC_MADM18G26", (t) => t.series === "challenge" && t.region === "madeira" && t.escalao === "Sub 18"],
    ["DC_NOR_12G26", (t) => t.series === "challenge" && t.region === "norte" && t.escalao === "Sub 12"],
  ];

  for (const [code, filtro] of casos) {
    const r = rankings[code];
    const rf = rankings[code.replace(/^DC_(.{4})(\d{2})([GN])(\d{2})$/, (_, z, a, ty, yy) =>
      `RFDC_${yy}${z[0]}${a}${ty}`)];
    // O ranking a comparar é o FINAL quando já existe (inclui a Final ×1.5),
    // senão a fase regular.
    const alvo = rf || r;
    if (!alvo) continue;

    it(`${alvo.code}: totais iguais aos oficiais`, () => {
      const ate = oficialAte(alvo);
      const comparados = alvo.players.filter(p => p.fed && Number(p.points) > 0).slice(0, 10);
      expect(comparados.length).toBeGreaterThan(0);

      for (const p of comparados) {
        const meu = totalCalculado(p.fed, (t) => filtro(t) && (!ate || !t.date || t.date <= ate));
        expect(
          Math.abs(meu - Number(p.points)),
          `${p.name} (fed ${p.fed}) em ${alvo.code}: site=${meu} oficial=${p.points}`,
        ).toBeLessThan(0.05);
      }
    });
  }
});
