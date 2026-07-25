/**
 * scripts/lib/ffgolf-teesheet-preserve.js
 *
 * O scrape-ffgolf-gg-teesheet.js enriquece os JSON GolfGenius de
 * public/data/ffgolf/ com campos que o leaderboard NÃO tem:
 *   - `draws[]` (tee sheet por ronda: hora, tee, parceiros)
 *   - `teeSheetPage` / `teeSheetScrapedAt`
 *   - `players[].hcp` (o leaderboard GG publica sempre hcp: null)
 *
 * Os scrapers de leaderboard (scrape-ffgolf.js e scrape-ffgolf-gg-fetch.js)
 * reescrevem o ficheiro inteiro — sem este merge, cada re-scrape apagava o
 * tee sheet. Caso real: CFJ U12 Garçons 2026 perdeu os draws (2 rondas com
 * 29 grupos) no re-fetch das distâncias de 2026-07-21 e a aba "Draw" sumiu
 * da /ffg.
 *
 * `preserveTeesheet(outPath, fresh)` lê o ficheiro existente em outPath e
 * copia para `fresh` o que o scrape novo não traz. Mutação in-place; devolve
 * `{ draws, hcps }` (nº de rondas de draw preservadas e hcps re-aplicados)
 * para logging — ambos 0 quando não havia nada a preservar.
 */
const fs = require("fs");

const normName = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/** "RUBAL Alexandre" e "Alexandre Rubal" batem: multiset de tokens do nome. */
const nameKey = (s) => normName(s).split(" ").filter(Boolean).sort().join(" ");

function preserveTeesheet(outPath, fresh) {
  const stats = { draws: 0, hcps: 0 };
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(outPath, "utf-8"));
  } catch {
    return stats; // 1º scrape ou ficheiro inválido — nada a preservar
  }

  if (Array.isArray(existing.draws) && existing.draws.length && !(Array.isArray(fresh.draws) && fresh.draws.length)) {
    fresh.draws = existing.draws;
    if (existing.teeSheetPage != null) fresh.teeSheetPage = existing.teeSheetPage;
    if (existing.teeSheetScrapedAt != null) fresh.teeSheetScrapedAt = existing.teeSheetScrapedAt;
    stats.draws = existing.draws.length;
  }

  // Bracket de match play (scrape-ffgolf.js rota Playwright) — um re-scrape
  // pela rota fetch (sem browser) não o consegue reconstruir; não o apagar.
  if (existing.matchplay && !fresh.matchplay) fresh.matchplay = existing.matchplay;

  // Datas + campo: alguns eventos GG (CFJ 2026 Filles/Benjamins/Benjamines) não
  // expõem dateStart/dateEnd/course ao scraper e ficavam sem data — o que os
  // afundava para o fundo da sidebar (ordenada por data). Depois de preenchidos
  // (do portal FFG), um re-scrape fetch voltava a apagá-los. Preservar.
  if (existing.dateStart && !fresh.dateStart) fresh.dateStart = existing.dateStart;
  if (existing.dateEnd && !fresh.dateEnd) fresh.dateEnd = existing.dateEnd;
  if (existing.course && existing.course.name && (!fresh.course || !fresh.course.name)) {
    fresh.course = fresh.course || {};
    fresh.course.name = existing.course.name;
  }

  // hcp por nome normalizado: dos players antigos E dos draws (a tee sheet é
  // quem traz o hcp; um jogador do draw pode nem estar no leaderboard antigo).
  const hcpByName = new Map();
  for (const p of existing.players || []) {
    if (typeof p.hcp === "number") hcpByName.set(nameKey(p.name), p.hcp);
  }
  for (const r of fresh.draws || []) {
    for (const g of r.groups || []) {
      for (const p of g.players || []) {
        if (typeof p.hcp === "number" && !hcpByName.has(nameKey(p.nome ?? p.name))) {
          hcpByName.set(nameKey(p.nome ?? p.name), p.hcp);
        }
      }
    }
  }
  if (hcpByName.size) {
    for (const p of fresh.players || []) {
      if (p.hcp != null) continue;
      const h = hcpByName.get(nameKey(p.name));
      if (typeof h === "number") { p.hcp = h; stats.hcps++; }
    }
  }
  return stats;
}

module.exports = { preserveTeesheet, nameKey, normName };
