#!/usr/bin/env node
/**
 * build-forma-data.js — Gera public/data/nacional-2026-forma.json
 *
 * Lê:
 *   public/data/fpg-admissions-draws.json   (inscritos por torneio)
 *   public/data/players.json                (escalão / hcp / sexo)
 *   output/{fed}/whs.json                   (rondas WHS por jogador, com sgd)
 *
 * Escreve:
 *   public/data/nacional-2026-forma.json    (consumido pela FormaPage)
 *
 * Uso:
 *   node scripts/build-forma-data.js
 *
 * Re-gerar após cada scrape para refrescar os SDs.
 */

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const ADM = path.join(REPO, "public/data/fpg-admissions-draws.json");
const PLAYERS = path.join(REPO, "public/data/players.json");
const OUT = path.join(REPO, "public/data/nacional-2026-forma.json");

const TC = ["10935","10936","10937","10938","10939","10940","10941","10942","10943","10944"];

const adm = JSON.parse(fs.readFileSync(ADM,"utf8"));
const players = JSON.parse(fs.readFileSync(PLAYERS,"utf8"));

const inscritos = new Map();
adm.tournaments.filter(t => TC.includes(String(t.tcode))).forEach(t => {
  ((t.admissions && t.admissions.players) || []).forEach(p => {
    const k = String(p.fed);
    if (!inscritos.has(k)) inscritos.set(k, { fed: k, escaloes: new Set() });
    inscritos.get(k).escaloes.add(t.name.replace("Campeonato Nacional de Jovens ","").trim());
  });
});

const num = (x) => (x==null || isNaN(x)) ? null : Number(x);
const fmtDate = (s) => (s||"").slice(0,10);

const rows = [];
for (const [fed, info] of inscritos) {
  const p = players[fed] || {};
  const wp = path.join(REPO, `output/${fed}/whs.json`);
  let last10 = [];
  let total = 0;
  if (fs.existsSync(wp)) {
    try {
      const w = JSON.parse(fs.readFileSync(wp,"utf8"));
      if (Array.isArray(w)) {
        total = w.length;
        const sorted = w.slice()
          .filter(r => r && r.sgd != null)
          .sort((a,b) => (b.hcp_dateStr||"").localeCompare(a.hcp_dateStr||""));
        last10 = sorted.slice(0, 10).map(r => ({
          sgd: num(r.sgd),
          date: fmtDate(r.hcp_dateStr),
          tourn: r.tourn_name || r.course_description || "",
          holes: r.holes || 18,
          hcp: num(r.exact_handicap),
        }));
      }
    } catch {}
  }
  rows.push({
    fed,
    name: p.name || "?",
    escalao: p.escalao || "Outros",
    sex: p.sex || "?",
    hcp: num(p.hcp),
    escIns: [...info.escaloes].sort().join(", "),
    totalRounds: total,
    last10,
  });
}

const out = {
  generatedAt: new Date().toISOString(),
  tournament: "Campeonato Nacional de Jovens 2026 — Aroeira",
  tcodes: TC,
  startDate: "2026-05-01",
  totalInscritos: rows.length,
  withWhsData: rows.filter(r => r.last10.length > 0).length,
  rows,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`✓ ${path.relative(REPO, OUT)}`);
console.log(`  Inscritos: ${rows.length}   Com WHS: ${out.withWhsData}   Sem dados: ${rows.length - out.withWhsData}`);
