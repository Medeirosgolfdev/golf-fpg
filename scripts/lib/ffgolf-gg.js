/**
 * lib/ffgolf-gg.js — leitura + matching dos torneios FFG hospedados em
 * GolfGenius (public/data/ffgolf/{year}_{slug}.json, scrape-ffgolf.js).
 *
 * O GolfGenius NÃO publica licenças FFG, por isso estes torneios só se ligam
 * ao resto do desempenho de um jogador por MATCHING DE NOME contra o roster
 * de licenças do portal resultats. Esta lib é partilhada por:
 *   - scripts/build-france-players.js (contagem de torneios por jogador)
 *   - scripts/aggregator/sources/ffgolf.js (ingestão kids2)
 * para garantir que ambos usam exactamente as mesmas regras.
 *
 * Regras de matching (conservadoras — um falso match corrompe a ficha):
 *   1. Nome GG vem "NOM Prenom" → inverte-se pelo prefixo em CAPS.
 *   2. Lookup por normName do nome invertido; se ambíguo (2+ licenças com o
 *      mesmo nome) → SEM match.
 *   3. Fallback: chave de tokens ordenados (nomes onde a inversão falha).
 */
"use strict";

const fs = require("fs");
const path = require("path");

/** Eventos alojados no site FFG mas que NÃO são torneios FFG (campos
 *  estrangeiros, cobertos por outras fontes) — excluídos de contagens/kids2. */
const EXCLUDE_SLUGS = new Set([
  "junior-invitational",              // Sage Valley (USA)
  "world-junior-girls-golf-championship", // WAGR (Canadá)
]);

const MONTHS = {
  janvier: 1, january: 1, fevrier: 2, february: 2, mars: 3, march: 3,
  avril: 4, april: 4, mai: 5, may: 5, juin: 6, june: 6, juillet: 7, july: 7,
  aout: 8, august: 8, septembre: 9, september: 9, octobre: 10, october: 10,
  novembre: 11, november: 11, decembre: 12, december: 12,
};

const stripAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const normName = (s) => stripAccents(s).toLowerCase().replace(/\s+/g, " ").trim();

/** "Tour 1 (Ven, Mars  6)" + 2026 → "2026-03-06" (null se não parsear). */
function eventDateIso(evName, year) {
  const m = /\(([^,()]+),\s*([A-Za-zÀ-ÿ]+)\s+(\d{1,2})\)/.exec(evName || "");
  if (!m) return null;
  const month = MONTHS[stripAccents(m[2]).toLowerCase()];
  if (!month) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
}

function titleCaseCaps(s) {
  return String(s || "").toLowerCase().replace(/(^|[\s'\-])(\w)/g, (_, sep, ch) => sep + ch.toUpperCase());
}

/** "PILLARD Tom" → "Tom Pillard". Se o padrão CAPS-prefixo não se aplicar
 *  (tudo caps, tudo minúsculas…), devolve o nome tal-qual — o matching por
 *  tokens ordenados cobre esses. */
function invertGgName(raw) {
  const t = String(raw || "").trim().replace(/\s+/g, " ");
  const toks = t.split(" ");
  const isCaps = (w) => /[A-ZÀ-Þ]/.test(w) && w === w.toUpperCase();
  let i = 0;
  while (i < toks.length && isCaps(toks[i])) i++;
  if (i === 0 || i === toks.length) return t; // sem prefixo caps OU tudo caps
  const surname = titleCaseCaps(toks.slice(0, i).join(" "));
  const given = toks.slice(i).join(" ");
  return `${given} ${surname}`;
}

/** Chave insensível à ordem dos tokens ("tom pillard" == "pillard tom"). */
const sortedKey = (name) => normName(name).split(" ").filter(Boolean).sort().join(" ");

/** Constrói os mapas de lookup nome→licenças a partir de pares (name, lic).
 *  Guarda TODAS as licenças por chave para detectar ambiguidade. */
function buildNameMaps(pairs) {
  const byKey = new Map();
  const bySorted = new Map();
  const push = (m, k, lic) => {
    if (!k) return;
    const arr = m.get(k);
    if (!arr) m.set(k, [lic]);
    else if (!arr.includes(lic)) arr.push(lic);
  };
  for (const { name, lic } of pairs) {
    push(byKey, normName(name), lic);
    push(bySorted, sortedKey(name), lic);
  }
  return { byKey, bySorted };
}

/** Nome GG cru → licença única do roster, ou null (sem match / ambíguo). */
function matchGgName(maps, rawName) {
  const inverted = invertGgName(rawName);
  const exact = maps.byKey.get(normName(inverted));
  if (exact && exact.length === 1) return exact[0];
  if (exact && exact.length > 1) return null; // ambíguo — não arriscar
  const sorted = maps.bySorted.get(sortedKey(rawName));
  if (sorted && sorted.length === 1) return sorted[0];
  return null;
}

/** Lê todos os torneios GG válidos do dir (default public/data/ffgolf). */
function listGgTournaments(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    const m = /^(\d{4})_(.+)\.json$/.exec(f);
    if (!m) continue;
    const year = parseInt(m[1], 10);
    const slug = m[2];
    if (EXCLUDE_SLUGS.has(slug)) continue;
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    const players = Array.isArray(d.players) ? d.players : [];
    if (!players.length) continue;
    let dateIso = null;
    for (const ev of d.events || []) {
      dateIso = eventDateIso(ev.name, year);
      if (dateIso) break;
    }
    out.push({
      file: f,
      key: `${year}_${slug}`,
      year,
      slug,
      name: d.tournament || slug,
      dateIso,
      ggPage: d.source || null,
      course: d.course?.name || null,
      parTotal: d.course?.parTotal ?? null,
      parPerHole: Array.isArray(d.course?.par) && d.course.par.length === 18 ? d.course.par : null,
      players,
    });
  }
  return out;
}

module.exports = { listGgTournaments, invertGgName, buildNameMaps, matchGgName, EXCLUDE_SLUGS };
