#!/usr/bin/env node
/**
 * import-england-reid-trophy.js
 *
 * Converte as edições antigas do Reid Trophy (England Golf, formato
 * england_reid-trophy-{ano}.json do scraper Playwright) em JobFiles
 * reidtrophy_{ano}.json, para a /major as mostrar na tab "Edições anteriores"
 * do Reid Trophy (a edição 2026+ vem do GolfGenius — scope `reidtrophy`).
 * Pedido da Mariana (13/10/2026): a /england sai da barra; o Reid Trophy, o
 * único torneio inglês com interesse, vive na /major com as edições todas.
 *
 * ⚠ No kids2 estas edições continuam a entrar pelo adapter `england`; o
 * adapter `reidtrophy` só lê 2026+ (senão a mesma prova contava duas vezes).
 *
 *   node scripts/import-england-reid-trophy.js 2023 2024 2025
 */
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const DATA = path.join(__dirname, "..", "public", "data");
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

/** "Tue, August 8 Sandiway - Archived…" → { iso: "2023-08-08", course: "Sandiway" } */
function parseHeader(h, year) {
  const m = /^\w+,\s+(\w+)\s+(\d+)\s+(.*?)\s+-\s+Archived/i.exec(h || "");
  if (!m) return { iso: null, label: null, course: null };
  const mo = MONTHS[m[1].toLowerCase()];
  const iso = mo ? `${year}-${String(mo).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}` : null;
  return { iso, label: h.split(" ").slice(0, 3).join(" "), course: m[3].trim() };
}

function convert(year) {
  const src = path.join(DATA, `england_reid-trophy-${year}.json`);
  const e = JSON.parse(fs.readFileSync(src, "utf8"));
  const heads = (e.players.find((p) => (p.rounds || []).length) || { rounds: [] }).rounds.map((r) => parseHeader(r.headerText, year));
  const dates = heads.map((h) => h.iso).filter(Boolean).sort();
  const course = heads.find((h) => h.course)?.course || e.course || null;
  const players = e.players.map((p) => ({
    pos: p.pos != null ? String(p.pos) : "",
    name: p.name,
    country: p.country || null,
    location: p.club || "",
    club: p.club || null,
    toPar: p.toPar ?? null,
    total: p.total ?? null,
    roundGross: (p.roundScores || []).filter((g) => typeof g === "number"),
    rounds: (p.rounds || []).map((r, i) => ({
      day: r.day ?? i + 1,
      scores: r.scores || [],
      gross: r.gross,
      ...(r.f9 != null ? { f9: r.f9 } : {}),
      ...(r.b9 != null ? { b9: r.b9 } : {}),
      date: heads[i]?.label || undefined,
      pars: r.parPlayed || e.par,
    })),
  }));
  return {
    tournament: "Reid Trophy",
    year,
    startDate: dates[0] || null,
    endDate: dates[dates.length - 1] || null,
    source: e.source,
    course,
    importedFrom: `england_reid-trophy-${year}.json`,
    divisions: [{
      division: "Reid Trophy",
      tid: e.gg_page || null,
      par: e.par, parTotal: e.parTotal,
      meters: e.meters, si: e.si, teeName: null,
      players,
    }],
  };
}

const years = process.argv.slice(2).map(Number).filter(Boolean);
if (!years.length) { console.error("Uso: node scripts/import-england-reid-trophy.js 2023 2024 2025"); process.exit(1); }
for (const y of years) {
  const out = convert(y);
  const file = path.join(DATA, `reidtrophy_${y}.json`);
  writeJsonAtomic(file, out);
  console.log(`✅ reidtrophy_${y}.json — ${out.course} ${out.startDate}→${out.endDate} · ${out.divisions[0].players.length} jogadores`);
}
