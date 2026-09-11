/**
 * scripts/build-wagr-events-list.js
 *
 * Gera `public/data/wagr/wagr-events-list.json` — o ÍNDICE leve dos eventos
 * WAGR para a sidebar da WAGRPage (assente no CircuitShell). Cruza o
 * `wagr-events-index.json` (metadata do calendário: nome, datas, país, power,
 * campo, vencedor) com cada `wagr/events/wagr_{id}.json` scrapado (leaderboard)
 * para calcular o que o calendário não tem: sexo, nº de jogadores, nº de PAÍSES
 * distintos (= internacionalidade), presença de PT, formato e nº de rondas.
 *
 * Só inclui eventos SCRAPADOS com ≥1 jogador. É o único ficheiro que a página
 * carrega de uma vez; o leaderboard de cada evento carrega LAZY ao clicar.
 * Por isso é DELIBERADAMENTE magro — são ~8.000 eventos por 2 anos, e cada
 * campo a mais custa ~40 KB no arranque da página.
 *
 * Correr:  node scripts/build-wagr-events-list.js
 * (depois do scrape-wagr.js --events; ver workflow update-wagr.yml)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const DATA_DIR = path.resolve(__dirname, "..", "public", "data");
const WAGR_DIR = path.join(DATA_DIR, "wagr");
const EVENTS_DIR = path.join(WAGR_DIR, "events");
const INDEX = path.join(WAGR_DIR, "wagr-events-index.json");
const OUT = path.join(WAGR_DIR, "wagr-events-list.json");

function normName(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function isPt(c) {
  const s = String(c || "").trim();
  return /portugal/i.test(s) || /^(pt|prt|por)$/i.test(s);
}

function main() {
  const metaById = new Map();
  if (fs.existsSync(INDEX)) {
    const idx = JSON.parse(fs.readFileSync(INDEX, "utf8"));
    for (const e of idx.events || []) metaById.set(String(e.id), e);
  }

  const files = fs.existsSync(EVENTS_DIR)
    ? fs.readdirSync(EVENTS_DIR).filter((f) => /^wagr_\d+\.json$/.test(f))
    : [];
  const out = [];
  for (const f of files) {
    let e;
    try { e = JSON.parse(fs.readFileSync(path.join(EVENTS_DIR, f), "utf8")); } catch { continue; }
    const players = e.players || [];
    if (!players.length) continue;
    const id = String(e.id ?? f.replace(/^wagr_|\.json$/g, ""));
    const meta = metaById.get(id) || {};
    const countries = new Set(players.map((p) => normName(p.country)).filter(Boolean));
    const startDate = e.startDate || meta.startDate || null;
    out.push({
      id,
      name: e.name || meta.name || "",
      course: (e.courses && e.courses[0]) || (meta.courses && meta.courses[0]) || null,
      country: e.country || meta.country || "",       // país anfitrião
      eventType: e.eventType || meta.eventType || "", // Junior / All Ages / Collegiate / …
      format: e.format || null,
      sex: e.sex || null,
      startDate,
      endDate: e.endDate || meta.endDate || null,
      year: e.year ?? meta.year ?? (startDate ? parseInt(startDate.slice(0, 4), 10) : null),
      power: e.power ?? meta.power ?? null,
      rounds: Math.max(0, ...players.map((p) => [p.r1, p.r2, p.r3, p.r4].filter((x) => x != null).length)),
      playerCount: players.length,
      countryCount: countries.size,
      hasPt: players.some((p) => isPt(p.country)),
    });
  }
  // Ordenar: mais recentes primeiro; desempate por internacionalidade.
  out.sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")) || (b.countryCount - a.countryCount));

  writeJsonAtomic(OUT, { generatedAt: new Date().toISOString(), total: out.length, events: out }, { spaces: 0 });
  const intl = out.filter((e) => e.countryCount >= 4).length;
  const pt = out.filter((e) => e.hasPt).length;
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`wagr-events-list.json: ${out.length} eventos (${intl} internacionais ≥4 países · ${pt} com portugueses) · ${kb} KB → ${OUT}`);
}
main();
