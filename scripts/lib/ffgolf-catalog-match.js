/**
 * scripts/lib/ffgolf-catalog-match.js
 *
 * Matcher ÚNICO entre um torneio do portal FFG-resultats e uma entrada do
 * catálogo GolfGenius (ffgolf-catalog.json). Substitui três cópias divergentes
 * que existiam em scrape-ffgolf-resultats.js, backfill-ffgolf-links.js e
 * build-ffgolf-resultats-index.js — todas com o mesmo bug.
 *
 * REGRA (não se adivinha): só devolve match quando há CERTEZA razoável.
 *   - Entradas de catálogo SEM `title` NUNCA participam: sem nome não há o que
 *     casar, e o teste de contenção com título vazio dava sempre verdadeiro,
 *     ligando qualquer torneio à primeira entrada sem título do ano (produzia
 *     links oficiais/GolfGenius ERRADOS servidos como facto).
 *   - Ambiguidade (vários candidatos que não se distinguem por sexo) → null.
 *     Antes escolhia-se cand[0] às cegas, colando o mesmo GolfGenius a vários
 *     eventos distintos.
 */
"use strict";

const STOP_TOK = new Set(["de", "des", "du", "la", "le", "les", "et", "au", "aux", "un", "une", "sur", "par", "pour", "2022", "2023", "2024", "2025", "2026"]);

function normName(s) {
  return String(s || "").toLowerCase().normalize("NFKD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function sigTokens(s) {
  return normName(s).split(" ").filter((t) => t.length >= 3 && !STOP_TOK.has(t));
}
const hasG = (s) => /gar[cç]ons|boys|men|messieurs/i.test(s || "");
const hasF = (s) => /filles|girls|women|dames/i.test(s || "");

/** Conjunto de tokens de IDADE presentes num nome (u12, benjamin, minime…).
 *  Usado para exigir compatibilidade de escalão num match difuso: um nome
 *  genérico ("Grand Prix Jeunes") NÃO pode casar com um específico ("… U14"),
 *  senão vários eventos regionais distintos colam-se ao mesmo GolfGenius. */
function ageTokens(s) {
  const u = normName(s);
  const set = new Set();
  for (const m of u.matchAll(/\bu\s?(\d{1,2})\b/g)) set.add("u" + m[1]);
  if (/\bpoucet\b/.test(u)) set.add("u10");
  if (/\bpoussins?\b/.test(u)) set.add("u12");
  if (/\bbenjamins?e?s?\b/.test(u)) set.add("u14");
  if (/\bminimes?\b/.test(u)) set.add("u16");
  if (/\bcadets?\b/.test(u)) set.add("u18");
  return set;
}
/** Compatível se nenhum dos dois declara uma idade que o outro contradiz.
 *  (Um lado sem idade nenhuma é permitido; idades explícitas TÊM de coincidir.) */
function ageCompatible(a, b) {
  const A = ageTokens(a), B = ageTokens(b);
  if (!A.size || !B.size) {
    // Se só UM lado tem idade, o outro é genérico → não confirma o mesmo evento.
    return A.size === 0 && B.size === 0;
  }
  for (const x of A) if (!B.has(x)) return false;
  for (const x of B) if (!A.has(x)) return false;
  return true;
}

/**
 * @param {string} name  nome do torneio no portal resultats
 * @param {number|string} year
 * @param {Array} catalog  ffgolf-catalog.json.tournaments
 * @returns entrada do catálogo, ou null quando não há match seguro.
 */
function matchCatalog(name, year, catalog) {
  if (!name || !year || !Array.isArray(catalog)) return null;
  const resTok = sigTokens(name);
  if (!resTok.length) return null;

  // Só entradas do ano COM título real.
  const same = catalog.filter((e) => String(e.year) === String(year) && e.title && normName(e.title));
  if (!same.length) return null;

  // 1) Título idêntico (após normalização).
  const exact = same.find((e) => normName(e.title) === normName(name));
  if (exact) return exact;

  // 2) Candidatos: título contém TODOS os tokens significativos E o escalão é
  //    compatível (um nome genérico não casa com um específico por idade).
  const cand = same.filter((e) => {
    const catN = normName(e.title);
    return resTok.every((t) => catN.includes(t)) && ageCompatible(name, e.title);
  });
  if (cand.length === 1) return cand[0];
  if (cand.length > 1) {
    // Desambiguar por sexo — só se ficar exactamente UM.
    if (hasG(name)) {
      const m = cand.filter((e) => hasG(e.title));
      if (m.length === 1) return m[0];
    }
    if (hasF(name)) {
      const m = cand.filter((e) => hasF(e.title));
      if (m.length === 1) return m[0];
    }
    return null; // ambíguo → não adivinha
  }
  return null; // sem candidatos → sem link (melhor que um errado)
}

module.exports = { matchCatalog, normName, sigTokens };
