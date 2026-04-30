#!/usr/bin/env node
/**
 * build-forma-data.js — Gera public/data/nacional-2026-forma.json
 *
 * Lê: public/data/fpg-admissions-draws.json (inscritos + draws + status reserva/confirmed)
 *     public/data/players.json              (escalão / hcp / sexo)
 *     output/{fed}/whs.json                 (rondas WHS por jogador, com sgd)
 *
 * Escreve: public/data/nacional-2026-forma.json
 *
 * Uso:  node scripts/build-forma-data.js
 */

const fs = require("fs");
const path = require("path");
const { writeJsonAtomicVerified } = require("../lib/atomic-write");

const REPO = path.resolve(__dirname, "..");
const ADM = path.join(REPO, "public/data/fpg-admissions-draws.json");
const PLAYERS = path.join(REPO, "public/data/players.json");
const OUT = path.join(REPO, "public/data/nacional-2026-forma.json");

const TC = ["10935","10936","10937","10938","10939","10940","10941","10942","10943","10944"];

const adm = JSON.parse(fs.readFileSync(ADM, "utf8"));
const players = JSON.parse(fs.readFileSync(PLAYERS, "utf8"));

const normName = (s) => String(s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().trim().replace(/\s+/g, " ");

function buildDrawsMap(t) {
  const m = new Map();
  const draws = t.draws || {};
  for (const round of Object.keys(draws)) {
    const groups = (draws[round] && draws[round].groups) || [];
    for (const g of groups) {
      const tee = { teeTime: g.teeTime, startHole: g.startHole, tee: g.tee };
      for (const pl of (g.players || [])) {
        const k = normName(pl.nome);
        if (!k) continue;
        if (!m.has(k)) m.set(k, {});
        m.get(k)[round] = tee;
      }
    }
  }
  return m;
}

const inscritos = new Map();
adm.tournaments.filter(t => TC.includes(String(t.tcode))).forEach(t => {
  const drawMap = buildDrawsMap(t);
  ((t.admissions && t.admissions.players) || []).forEach(p => {
    const k = String(p.fed);
    if (!inscritos.has(k)) inscritos.set(k, { fed: k, escaloes: new Set(), draws: null, status: "confirmed" });
    inscritos.get(k).escaloes.add(t.name.replace("Campeonato Nacional de Jovens ", "").trim());
    if (p.status === "reserva") inscritos.get(k).status = "reserva";
    if (!inscritos.get(k).draws) {
      const d = drawMap.get(normName(p.nome));
      if (d) inscritos.get(k).draws = d;
    }
  });
});

const num = (x) => (x == null || isNaN(x)) ? null : Number(x);
const fmtDate = (s) => (s || "").slice(0, 10);

const rows = [];
for (const [fed, info] of inscritos) {
  const p = players[fed] || {};
  const wp = path.join(REPO, `output/${fed}/whs.json`);
  let last10 = [];
  let total = 0;
  if (fs.existsSync(wp)) {
    try {
      const w = JSON.parse(fs.readFileSync(wp, "utf8"));
      if (Array.isArray(w)) {
        total = w.length;
        const sorted = w.slice()
          .filter(r => r && r.sgd != null)
          .sort((a, b) => (b.hcp_dateStr || "").localeCompare(a.hcp_dateStr || ""));
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
  const drawsArr = info.draws
    ? Object.keys(info.draws).sort().map(r => ({ round: Number(r), ...info.draws[r] }))
    : [];

  rows.push({
    fed,
    name: p.name || "?",
    escalao: p.escalao || "Outros",
    sex: p.sex || "?",
    hcp: num(p.hcp),
    escIns: [...info.escaloes].sort().join(", "),
    status: info.status,
    totalRounds: total,
    last10,
    draws: drawsArr,
  });
}

// Filtrar: só ficam os jogadores que vão jogar (têm pelo menos uma hora
// de saída no draw publicado). Inscrições tardias sem draw e reservas
// que não vão jogar saem da listagem.
const totalInscritosBrutos = rows.length;
const totalReservasBrutos = rows.filter(r => r.status === "reserva").length;
const totalSemDraw = rows.filter(r => r.draws.length === 0).length;
const playingRows = rows.filter(r => r.draws.length > 0);

const out = {
  generatedAt: new Date().toISOString(),
  tournament: "Campeonato Nacional de Jovens 2026 — Aroeira",
  tcodes: TC,
  startDate: "2026-05-01",
  totalInscritos: playingRows.length,
  totalInscritosBrutos,                    // inclui sem hora de saída
  excluidosSemHora: totalSemDraw,          // count dos que removemos
  withWhsData: playingRows.filter(r => r.last10.length > 0).length,
  rows: playingRows,
};

writeJsonAtomicVerified(OUT, out);
console.log(`✓ ${path.relative(REPO, OUT)}`);
console.log(`  Brutos: ${totalInscritosBrutos}   A jogar: ${playingRows.length}   Excluídos sem hora: ${totalSemDraw}`);
console.log(`  Com WHS: ${out.withWhsData} de ${playingRows.length}`);
