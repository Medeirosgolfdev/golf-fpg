#!/usr/bin/env node
/**
 * enrich-players.js — Compute per-player stats for sidebar
 *
 * Uses extractPlayerStats (which already does correct date parsing via
 * parseDotNetDate) and derives period counts from its output.
 *
 * Usage:
 *   node enrich-players.js                  # All players
 *   node enrich-players.js 42205 52884      # Specific players
 */

const fs = require("fs");
const path = require("path");
const { extractPlayerStats } = require("../lib/cross-stats");
const { writeJsonAtomic } = require("../lib/atomic-write");

const args = process.argv.slice(2);
const fedFilter = args.filter(a => /^\d+$/.test(a));

const playersPath = path.join(__dirname, "..", "players.json");
const outputRoot = path.join(__dirname, "..", "output");
const statsOutPath = path.join(__dirname, "..", "public", "player-stats.json");
const histOutPath = path.join(__dirname, "..", "public", "data", "hcp-history.json");

/* HCP máximo plausível (WHS topo = 54). Acima disto é provisório/lixo
 * (ex: índices 77/99 que esmagavam a escala do gráfico) → excluído. */
const HCP_MAX_PLAUSIBLE = 54;
/* Pontos máximos guardados por jogador no histórico compacto. Quase todos os
 * juniores têm menos do que isto; só downsample em casos extremos. */
const HIST_MAX_PTS = 160;

/**
 * Converte raw.hcpHistory ([{d:ms, h}]) num histórico compacto e robusto:
 *  - exclui HCP não plausível (> 54) e valores não finitos
 *  - resolução diária (1 ponto/dia, fica o último), d em dias inteiros
 *  - downsample uniforme se exceder HIST_MAX_PTS (preservando extremos)
 * Formato: [[dayInt, h1dp], ...] — dayInt = ms/86400000, h com 1 casa.
 */
function compactHcpHistory(hh) {
  if (!Array.isArray(hh) || hh.length === 0) return null;
  const byDay = new Map();
  for (const p of hh) {
    const d = Number(p.d), h = Number(p.h);
    if (!isFinite(d) || d <= 0 || !isFinite(h) || h <= 0 || h > HCP_MAX_PLAUSIBLE) continue;
    byDay.set(Math.round(d / 86400000), Math.round(h * 10) / 10); // último do dia vence
  }
  let pts = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return null;
  if (pts.length > HIST_MAX_PTS) {
    const step = (pts.length - 1) / (HIST_MAX_PTS - 1);
    const keep = [];
    for (let i = 0; i < HIST_MAX_PTS; i++) keep.push(pts[Math.round(i * step)]);
    // garantir extremos e remover duplicados consecutivos do arredondamento
    pts = keep.filter((p, i) => i === 0 || p[0] !== keep[i - 1][0]);
  }
  return pts;
}

/**
 * Lê data.json (fonte canónica que a UI lê) e devolve contagens consistentes
 * com o que aparece no detalhe do jogador. Inclui treinos+extras injectados
 * por process-data.js a partir de melhorias.json — coisa que extractPlayerStats
 * não inclui. Sem isto, o sidebar mostra um total diferente do detalhe.
 *
 * IMPORTANTE: o Vite serve `/{fed}/analysis/data.json` a partir de `output/`
 * (via middleware em vite.config.ts) — esse é o ficheiro canónico, com schema
 * { DATA, HOLES, META, ... }. NÃO é `public/data/{fed}/analysis/data.json`
 * (que tem schema { courses, ... } e pode estar desactualizado).
 */
const corruptedFiles = [];

function loadCanonicalCounts(fed) {
  // Caminho canónico: output/{fed}/analysis/data.json (servido pelo Vite middleware).
  const candidates = [
    path.join(outputRoot, fed, "analysis", "data.json"),
    // Fallback: public/data/{fed}/analysis/data.json (formato antigo "courses").
    path.join(__dirname, "..", "public", "data", fed, "analysis", "data.json"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    let txt;
    try {
      txt = fs.readFileSync(p, "utf-8");
      if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
    } catch (e) {
      continue;
    }
    try {
      const d = JSON.parse(txt);
      const courses = Array.isArray(d.DATA) ? d.DATA : (d.courses || []);
      if (!courses.length) continue;
      let total = 0, thisYear = 0;
      const curYear = String(new Date().getFullYear());
      let lastDate = null;
      for (const c of courses) {
        for (const r of (c.rounds || [])) {
          total++;
          const date = r.date || "";
          if (date.endsWith(curYear)) thisYear++;
          if (date) {
            const iso = date.split("-").reverse().join("-");
            if (!lastDate || iso > lastDate) lastDate = iso;
          }
        }
      }
      // Holes-in-one: gross 1 num buraco de par 3 ou 4 (par conhecido).
      // Mesma regra do helper src/utils/aces.ts. HOLES/holeScores: { g[], p[] }.
      const holes = d.HOLES || d.holeScores || {};
      let aces = 0;
      for (const sid of Object.keys(holes)) {
        const e = holes[sid] || {};
        const g = e.g || [], p = e.p || [];
        const n = Math.min(g.length, p.length);
        for (let i = 0; i < n; i++) {
          if (g[i] === 1 && (p[i] === 3 || p[i] === 4)) aces++;
        }
      }
      return { total, thisYear, lastDate, aces };
    } catch (parseErr) {
      // JSON inválido (ex: truncado a meio por escrita interrompida).
      // Marcar como corrompido e seguir para o próximo candidato/fallback.
      // O extractPlayerStats vai ser usado como backup (whs.json é mais pequeno
      // e raramente trunca). O utilizador é avisado no fim para re-correr o
      // pipeline para estes feds.
      corruptedFiles.push({ fed, path: p, parseErr: String(parseErr).slice(0, 60) });
    }
  }
  return null;
}

let txt = fs.readFileSync(playersPath, "utf-8");
if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
const players = JSON.parse(txt);
const allFeds = Object.keys(players);
const targetFeds = fedFilter.length > 0 ? fedFilter : allFeds;

console.log(`📊 Enriching ${targetFeds.length} of ${allFeds.length} players...`);

let existing = {};
if (fs.existsSync(statsOutPath)) {
  try {
    let t = fs.readFileSync(statsOutPath, "utf-8");
    if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
    existing = JSON.parse(t);
  } catch {}
}

// Histórico de HCP (merge incremental, igual ao player-stats.json).
let histExisting = {};
if (fs.existsSync(histOutPath)) {
  try {
    let t = fs.readFileSync(histOutPath, "utf-8");
    if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
    t = t.replace(/\0+/g, "");
    histExisting = JSON.parse(t);
  } catch {}
}

const now = Date.now();
const MS_DAY = 86400000;
const MS_3M = 91 * MS_DAY;
const MS_6M = 183 * MS_DAY;
const MS_12M = 366 * MS_DAY;

let processed = 0, skipped = 0;

for (const fed of targetFeds) {
  if (!players[fed]) { skipped++; continue; }

  const raw = extractPlayerStats(fed, outputRoot);
  if (!raw) { skipped++; continue; }

  /*
   * raw.courseTee: { "key|tee": { rounds: [{ gross, sd, hi, dateSort, ... }] } }
   * raw.hcpHistory: [{ d: timestamp, h: hcp }] sorted asc
   * raw: numRounds, currentHcp, avgGross20, avgSD20, lastSD, ...
   */

  /* ── Collect ALL round timestamps from courseTee (these are 18H named-course rounds) ── */
  const allRounds = [];
  for (const ct of Object.values(raw.courseTee)) {
    for (const r of ct.rounds) {
      if (r.dateSort > 0) allRounds.push(r);
    }
  }
  allRounds.sort((a, b) => b.dateSort - a.dateSort);

  /* ── Also use hcpHistory for broader activity (includes 9H and unnamed) ── */
  const allDates = (raw.hcpHistory || []).map(h => h.d).filter(d => d > 0);

  /* ── Period counts (use hcpHistory for wider coverage) ── */
  const roundsLast3m = allDates.filter(d => now - d <= MS_3M).length;
  const roundsLast6m = allDates.filter(d => now - d <= MS_6M).length;
  const roundsLast12m = allDates.filter(d => now - d <= MS_12M).length;
  const lastDate = allDates.length > 0 ? Math.max(...allDates) : 0;
  const lastRoundDate = lastDate > 0 ? new Date(lastDate).toISOString().slice(0, 10) : null;

  /* ── SD stats from 18H rounds ── */
  const sds = allRounds.filter(r => r.sd != null).map(r => r.sd);
  const sds5 = sds.slice(0, 5);
  const sds20 = sds.slice(0, 20);
  const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const avgSD5 = avg(sds5);
  const best8 = sds20.length > 0
    ? [...sds20].sort((a, b) => a - b).slice(0, Math.min(8, sds20.length))
    : [];
  const avgSD8 = avg(best8);

  /* ── Gross stats ── */
  const grosses = allRounds.filter(r => r.gross != null).map(r => r.gross);
  const avgGross5 = avg(grosses.slice(0, 5));
  const grosses12m = allRounds.filter(r => r.gross != null && now - r.dateSort <= MS_12M).map(r => r.gross);
  const bestGross = grosses12m.length > 0 ? Math.min(...grosses12m) : null;

  /* ── HCP Trend ── */
  let hcpTrend = "stable", hcpDelta3m = null;
  const hh = raw.hcpHistory || [];
  if (hh.length >= 2) {
    const recent = hh[hh.length - 1]?.h;
    const cutoff = now - MS_3M;
    const older = hh.filter(h => h.d <= cutoff);
    const old = older.length > 0 ? older[older.length - 1]?.h : hh[0]?.h;
    if (recent != null && old != null) {
      hcpDelta3m = Math.round((recent - old) * 10) / 10;
      if (hcpDelta3m <= -1.5) hcpTrend = "up";
      else if (hcpDelta3m >= 1.5) hcpTrend = "down";
    }
  }

  /* ── Form Alert ── */
  let formAlert = null;
  if (sds20.length >= 5) {
    const mean = avg(sds20);
    const sigma = Math.sqrt(sds20.reduce((s, v) => s + (v - mean) ** 2, 0) / sds20.length);
    const last3 = sds20.slice(0, 3);
    if (last3.length >= 3 && sigma > 0) {
      if (last3.every(sd => sd < mean - sigma * 0.5)) formAlert = "hot";
      else if (last3.every(sd => sd > mean + sigma * 0.5)) formAlert = "cold";
    }
  }

  const r = v => v != null ? Math.round(v * 10) / 10 : null;

  // Usar contagens canónicas do data.json (fonte da UI). Se data.json não
  // existir (jogador sem análise gerada), cai para extractPlayerStats.
  const canonical = loadCanonicalCounts(fed);
  const roundsTotal = canonical ? canonical.total : raw.numRounds;
  const roundsCurrentYear = canonical ? canonical.thisYear : (raw.roundsCurrentYear ?? 0);
  const finalLastRoundDate = canonical?.lastDate ?? lastRoundDate;

  existing[fed] = {
    lastRoundDate: finalLastRoundDate,
    roundsTotal,
    roundsCurrentYear,
    roundsLast3m, roundsLast6m, roundsLast12m,
    avgSD5: r(avgSD5), avgSD8: r(avgSD8), avgSD20: r(raw.avgSD20),
    lastSD: r(raw.lastSD), currentHcp: r(raw.currentHcp),
    hcpTrend, hcpDelta3m, formAlert,
    bestGross, avgGross5: r(avgGross5), avgGross20: r(raw.avgGross20),
    aces: canonical?.aces ?? 0,
  };

  // Histórico compacto de HCP (para o gráfico de evolução da /jogadores-por-ano).
  const compactHist = compactHcpHistory(raw.hcpHistory);
  if (compactHist) histExisting[fed] = compactHist;
  else delete histExisting[fed]; // jogador sem histórico plausível → não deixar entrada stale

  processed++;
}

const outDir = path.dirname(statsOutPath);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
writeJsonAtomic(statsOutPath, existing);

const histDir = path.dirname(histOutPath);
if (!fs.existsSync(histDir)) fs.mkdirSync(histDir, { recursive: true });
writeJsonAtomic(histOutPath, histExisting);

console.log(`✅ ${processed} enriched, ${skipped} skipped`);
console.log(`📄 ${statsOutPath}`);
console.log(`📄 ${histOutPath} (${Object.keys(histExisting).length} jogadores com histórico)`);

if (corruptedFiles.length > 0) {
  // Dedup por fed (um fed pode ter o output/ E o public/data/ corrompidos).
  const uniqFeds = [...new Set(corruptedFiles.map(c => c.fed))];
  console.log(`\n⚠ ${uniqFeds.length} ficheiro(s) data.json corrompido(s) — usados fallbacks (extractPlayerStats):`);
  for (const fed of uniqFeds.slice(0, 30)) {
    console.log(`   #${fed}`);
  }
  if (uniqFeds.length > 30) console.log(`   ... e mais ${uniqFeds.length - 30}`);
  console.log(`\n   Re-correr pipeline para regenerar:`);
  console.log(`   node pipeline.js --skip-import ${uniqFeds.join(" ")}`);
  console.log(`\n   (causa típica: escrita interrompida em mounts Windows com ficheiros grandes >5MB)`);
}

// Diagnostic
const vals = Object.values(existing);
const withSD = vals.filter(v => v.avgSD8 != null).length;
const act3 = vals.filter(v => v.roundsLast3m > 0).length;
const act12 = vals.filter(v => v.roundsLast12m > 0).length;
const hot = vals.filter(v => v.formAlert === "hot").length;
const cold = vals.filter(v => v.formAlert === "cold").length;
console.log(`   ${withSD} com SD · ${act3} activos 3m · ${act12} activos 12m · ${hot} 🔥 · ${cold} ❄️`);
// Sample one player
const sample = Object.entries(existing).find(([,v]) => v.roundsLast12m > 0);
if (sample) console.log(`   Amostra [${sample[0]}]:`, JSON.stringify(sample[1]));
