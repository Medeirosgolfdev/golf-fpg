/**
 * scripts/build-egr-events-list.js
 *
 * Gera `public/data/egr/egr-events-list.json` — o ÍNDICE leve dos eventos EGR
 * para a sidebar da EGRPage (assente no CircuitShell). Cruza o
 * `egr-events-index.json` (metadata: nome, escalão, datas, país anfitrião,
 * pontos) com cada ficheiro `egr/events/egr_{id}.json` scrapado (leaderboard)
 * para calcular o que o índice não tem: nº de jogadores, nº de PAÍSES distintos
 * (= internacionalidade), presença de PT / Manuel, CR/par e nº de rondas.
 *
 * Só inclui eventos SCRAPADOS com ≥1 jogador. Ficheiro pequeno que a página
 * carrega de uma vez (metadata p/ a lista lateral); o leaderboard completo de
 * cada evento carrega LAZY do próprio `egr_{id}.json` ao clicar (loadDivisions).
 *
 * Correr:  node scripts/build-egr-events-list.js
 * (depois do scrape-egr.js --events; ver update-egr workflow)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const DATA_DIR = path.resolve(__dirname, "..", "public", "data");
const EGR_DIR = path.join(DATA_DIR, "egr");
const EVENTS_DIR = path.join(EGR_DIR, "events");
const INDEX = path.join(EGR_DIR, "egr-events-index.json");
const OUT = path.join(EGR_DIR, "egr-events-list.json");

function normName(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function isManuel(name) {
  const n = normName(name);
  return /\bmanuel\b/.test(n) && /\bmedeiros\b/.test(n) && !/\b(joao|antonio|jose|pedro|miguel)\b/.test(n);
}
function isPt(c) {
  const s = String(c || "").trim();
  return /portugal/i.test(s) || /^(pt|prt|por)$/i.test(s);
}

/** Data do PRÓPRIO ficheiro do evento ("Thursday, 06. Feb 25" / "3. Jan") →
 *  ISO. Fallback quando o índice não tem a meta do evento — o índice só
 *  enumera os anos do último run e sem isto 753/754 eventos ficavam sem data
 *  (bug 2026-08-06: timeline do kids2 toda a "—" e dedup EGR desligado). */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function rawToIso(raw, year) {
  const m = /(\d{1,2})\.?\s+([A-Za-z]{3,})\.?\s*(\d{2,4})?/.exec(String(raw || ""));
  if (!m) return null;
  const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  let y = m[3] ? parseInt(m[3], 10) : (year || null);
  if (y != null && y < 100) y += 2000;
  if (!y) return null;
  return `${y}-${String(mon).padStart(2, "0")}-${String(parseInt(m[1], 10)).padStart(2, "0")}`;
}

function main() {
  const idx = JSON.parse(fs.readFileSync(INDEX, "utf8"));
  const metaById = new Map();
  for (const e of idx.events || []) metaById.set(String(e.id), e);

  const files = fs.readdirSync(EVENTS_DIR).filter((f) => /^egr_\d+\.json$/.test(f));
  const out = [];
  for (const f of files) {
    let e;
    try { e = JSON.parse(fs.readFileSync(path.join(EVENTS_DIR, f), "utf8")); } catch { continue; }
    const players = e.players || e.leaderboard || [];
    if (!players.length) continue;
    const id = String(e.id ?? f.replace(/^egr_|\.json$/g, ""));
    const meta = metaById.get(id) || {};
    const countries = new Set(players.map((p) => normName(p.country)).filter(Boolean));
    out.push({
      id,
      name: e.name || meta.name || "",
      venue: e.venue || null,
      sourceUrl: e.sourceUrl || null,
      ageGroup: e.ageGroup || meta.ageGroup || "",
      ageNum: e.ageNum ?? meta.ageNum ?? null,
      sex: e.sex || null,
      country: e.country || meta.country || "",       // país anfitrião
      startDate: meta.startDate || rawToIso(e.startDateRaw, e.year ?? meta.year) || null,
      endDate: meta.endDate || rawToIso(e.endDateRaw, e.year ?? meta.year) || null,
      year: e.year ?? meta.year ?? null,
      egrPoints: e.egrPointsPool ?? meta.egrPoints ?? null,
      cr: e.cr ?? null,
      par: e.par ?? null,
      rounds: Math.max(0, ...players.map((p) => [p.r1, p.r2, p.r3, p.r4].filter((x) => x != null).length)),
      playerCount: players.length,
      countryCount: countries.size,
      hasPt: players.some((p) => isPt(p.country)),
      hasManuel: players.some((p) => isManuel(p.name)),
    });
  }
  // Ordenar: mais recentes primeiro; desempate por internacionalidade.
  out.sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")) || (b.countryCount - a.countryCount));

  writeJsonAtomic(OUT, { generatedAt: new Date().toISOString(), total: out.length, events: out });
  const intl = out.filter((e) => e.countryCount >= 4).length;
  const u14 = out.filter((e) => e.ageNum === 14 || e.ageNum === 13).length;
  console.log(`egr-events-list.json: ${out.length} eventos (${intl} internacionais ≥4 países · ${u14} U13/U14) → ${OUT}`);
}
main();
