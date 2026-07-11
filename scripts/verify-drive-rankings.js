#!/usr/bin/env node
/**
 * scripts/verify-drive-rankings.js (2026-07-10)
 * ─────────────────────────────────────────────────────────────────────────
 * VERIFICA que os rankings Drive calculados por nós (drive-data-*.json +
 * tabela drivePoints + regra dos melhores-N) COINCIDEM com os oficiais
 * (public/data/drive-rankings.json, scraped do RankingsClassifLST).
 *
 * Três níveis de comparação:
 *  1. INTERNO (gross + net): melhores-N dos pontos por prova oficiais vs o
 *     total oficial — auto-DETECTA o N (3..6) que a FPG aplica por ranking
 *     (e denuncia pesos especiais, ex: final ×1.5, quando nenhum N encaixa).
 *  2. TABELA DE PONTOS (gross): recolhe todos os pares (pos → pontos) dos
 *     detalhes oficiais e compara com a nossa DRIVE_POINTS — apanha erros
 *     tipo "8º=38 vs 35" e posições que nos faltam (20º+ nos campos Tour).
 *  3. EXTERNO (gross): prova a prova (match por data) e totais melhores-N,
 *     oficial vs calculado dos nossos drive-data (challenge: zona+escalão;
 *     tour: zona, posição geral do torneio).
 *
 * OUTPUT: relatório na consola + public/data/drive-rankings-check.json
 * EXIT: 0 = tudo igual · 1 = divergências · 2 = sem dados p/ comparar
 *
 * USAGE:
 *   node scripts/verify-drive-rankings.js            # tudo
 *   node scripts/verify-drive-rankings.js --code DC_MADM12G26
 *   node scripts/verify-drive-rankings.js --year 2026
 * ─────────────────────────────────────────────────────────────────────────
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { DRIVE_POINTS_TOUR, DRIVE_POINTS_CHALLENGE, drivePoints } = require("./lib/drive-points.cjs");
const { writeJsonAtomic } = require("./lib/atomic-write");

const REPO = path.resolve(__dirname, "..");
const DATA = path.join(REPO, "public", "data");
const RK_FILE = path.join(DATA, "drive-rankings.json");
const OUT_FILE = path.join(DATA, "drive-rankings-check.json");

const args = process.argv.slice(2);
const argVal = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const ONLY_CODE = argVal("--code", null);
const YEAR = argVal("--year", String(new Date().getFullYear()));

if (!fs.existsSync(RK_FILE)) {
  console.error("[verify-rk] falta public/data/drive-rankings.json — corre scrape-drive-rankings.js primeiro");
  process.exit(2);
}
const RK = JSON.parse(fs.readFileSync(RK_FILE, "utf8")).rankings || {};

/* ── Lado NOSSO: índices a partir dos drive-data mensais ────────────────── */
// challenge: `${zone}|${escalao}` → fed → [{date, pos, pts}]
// tour:      `${zone}`            → fed → [{date, pos, pts}]
const oursChallenge = new Map();
const oursTour = new Map();
{
  const files = fs.readdirSync(DATA).filter(f => new RegExp(`^drive-data-${YEAR}-\\d{2}\\.json$`).test(f));
  for (const f of files) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { continue; }
    for (const t of (j.tournaments || [])) {
      if (t.series === "aquapor") continue;
      const isTour = (t.series || "tour") === "tour";
      const idx = isTour ? oursTour : oursChallenge;
      const key = isTour ? `${t.region}` : `${t.region}|${t.escalao}`;
      if (!idx.has(key)) idx.set(key, new Map());
      const m = idx.get(key);
      for (const p of (t.players || [])) {
        const fed = String(p.fedCode || p.fed || "");
        if (!fed) continue;
        if (typeof p.grossTotal === "string") continue;  // WD/DNS
        if (!m.has(fed)) m.set(fed, []);
        m.get(fed).push({ date: t.date, pos: p.pos, pts: drivePoints(p.pos, isTour ? "tour" : "challenge"), name: p.name });
      }
    }
  }
}

const topN = (nums, n) => [...nums].sort((a, b) => b - a).slice(0, n).reduce((s, x) => s + x, 0);

/* ── Nível 2: tabela de pontos empírica (pares pos→pontos dos detalhes) ── */
const empirical = new Map();  // `${serie}|${pos}` → Map(points → count)
function collectEmpirical(r) {
  const serie = r.series || "challenge";
  for (const p of r.players) {
    for (const res of (p.results || [])) {
      const pos = parseInt(String(res.pos), 10);
      const pts = Number(res.points);
      if (!Number.isFinite(pos) || !Number.isFinite(pts) || pts <= 0) continue;
      const key = `${serie}|${pos}`;
      if (!empirical.has(key)) empirical.set(key, new Map());
      const m = empirical.get(key);
      m.set(pts, (m.get(pts) || 0) + 1);
    }
  }
}

/* ── Verificação por ranking ────────────────────────────────────────────── */
const report = { checkedAt: new Date().toISOString(), year: YEAR, rankings: {}, pointsTable: {}, summary: {} };
let nOK = 0, nDiff = 0, nSkipped = 0;

for (const [code, r] of Object.entries(RK)) {
  if (ONLY_CODE && code !== ONLY_CODE) continue;
  if (String(r.year) !== String(YEAR)) { nSkipped++; continue; }
  const hasDetails = r.players.some(p => p.results?.length);
  if (hasDetails) collectEmpirical(r);

  const entry = { code, series: r.series || "challenge", zone: r.zone, escalao: r.escalao, type: r.type, issues: [] };

  // 1) INTERNO: detectar melhores-N (só com detalhe)
  let bestN = null;
  if (hasDetails) {
    let bestFit = { n: null, misses: Infinity };
    for (let n = 3; n <= 6; n++) {
      let misses = 0;
      for (const p of r.players) {
        if (!p.results?.length || p.points == null) continue;
        if (Math.abs(topN(p.results.map(x => Number(x.points) || 0), n) - Number(p.points)) > 0.01) misses++;
      }
      if (misses < bestFit.misses) bestFit = { n, misses };
    }
    bestN = bestFit.n;
    entry.bestN = bestN;
    entry.bestNmisses = bestFit.misses;
    if (bestFit.misses > 0) {
      entry.issues.push(`regra melhores-${bestN} não explica ${bestFit.misses} totais oficiais (peso especial? final ×1.5?)`);
    }
  }

  // 3) EXTERNO (só gross): comparar com os nossos dados
  if (r.type === "gross") {
    const isTour = (r.series || "challenge") === "tour";
    const m = isTour ? (oursTour.get(r.zone) || new Map()) : (oursChallenge.get(`${r.zone}|${r.escalao}`) || new Map());
    const n = bestN ?? 4;
    for (const p of r.players) {
      if (!p.fed) continue;
      const mine = m.get(String(p.fed));
      const oficialTotal = Number(p.points) || 0;
      if (!mine) {
        if (oficialTotal > 0) entry.issues.push(`${p.name}: oficial=${oficialTotal} mas SEM dados nossos`);
        continue;
      }
      const myTotal = topN(mine.map(x => x.pts), n);
      if (Math.abs(myTotal - oficialTotal) > 0.01) {
        entry.issues.push(`${p.name}: oficial=${oficialTotal} nosso(melhores-${n})=${myTotal} (${mine.length} provas nossas${p.results ? ` vs ${p.results.length} oficiais` : ""})`);
      }
      // prova a prova (com detalhe): match por data com tolerância ±1 dia
      // (eventos de 2 dias: o oficial usa a data final, nós às vezes a inicial).
      // Provas oficiais a 0 pts são WD/DNS/posição fora da tabela — ignoradas
      // (nós excluímos WD/DNS de propósito e 0 pts não afecta totais).
      const near = (a, b) => {
        const pa = Date.parse(a), pb = Date.parse(b);
        return Number.isFinite(pa) && Number.isFinite(pb) && Math.abs(pa - pb) <= 1.5 * 86400000;
      };
      for (const res of (p.results || [])) {
        if (!(Number(res.points) > 0)) continue;
        const mineT = mine.find(x => x.date === res.date) || mine.find(x => near(x.date, res.date));
        if (!mineT) { entry.issues.push(`${p.name} ${res.date}: prova oficial (${res.points} pts) FALTA nos nossos dados — "${res.tournament}"`); continue; }
        if (Math.abs((Number(res.points) || 0) - mineT.pts) > 0.01) {
          entry.issues.push(`${p.name} ${res.date}: pts oficial=${res.points} (pos ${res.pos}) vs nosso=${mineT.pts} (pos ${mineT.pos})`);
        }
      }
    }
  }

  report.rankings[code] = entry;
  if (entry.issues.length === 0) { nOK++; }
  else {
    nDiff++;
    console.log(`\n⚠ ${code} (${entry.series} ${r.zone} ${r.escalao ?? "todos"} ${r.type}) — ${entry.issues.length} divergências:`);
    for (const i of entry.issues.slice(0, 10)) console.log(`   · ${i}`);
    if (entry.issues.length > 10) console.log(`   … +${entry.issues.length - 10}`);
  }
}

/* ── Relatório da tabela de pontos empírica ─────────────────────────────── */
if (empirical.size > 0) {
  const rows = [...empirical.entries()].sort((a, b) => {
    const [sa, pa] = a[0].split("|"); const [sb, pb] = b[0].split("|");
    return sa === sb ? Number(pa) - Number(pb) : sa.localeCompare(sb);
  });
  const tableIssues = [];
  for (const [key, counts] of rows) {
    const [serie, posStr] = key.split("|");
    const pos = Number(posStr);
    const table = serie === "tour" ? DRIVE_POINTS_TOUR : DRIVE_POINTS_CHALLENGE;
    const variants = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const modal = variants[0][0];
    const oursV = table[pos] ?? 0;
    report.pointsTable[key] = { oficial: modal, nosso: oursV, amostras: variants.map(([v, c]) => `${v}×${c}`).join(" ") };
    if (variants.length > 1) {
      // >1 valor para a mesma posição na MESMA série = pesos especiais (final ×1.5?)
      tableIssues.push(`${serie} pos ${pos}: valores oficiais múltiplos [${variants.map(([v, c]) => `${v}(${c}×)`).join(", ")}] — nosso=${oursV}`);
    } else if (modal !== oursV) {
      tableIssues.push(`${serie} pos ${pos}: oficial=${modal} vs nosso=${oursV}`);
    }
  }
  if (tableIssues.length) {
    console.log(`\n⚠ TABELA DE PONTOS (empírica, ${rows.length} posições observadas):`);
    for (const i of tableIssues) console.log(`   · ${i}`);
    report.summary.pointsTableIssues = tableIssues;
  } else {
    console.log(`\n✓ Tabela de pontos: ${rows.length} posições observadas, todas iguais à nossa DRIVE_POINTS`);
  }
}

report.summary.ok = nOK;
report.summary.divergent = nDiff;
console.log(`\n═══ ${nOK} rankings iguais · ${nDiff} com divergências · ${nSkipped} fora do ano ${YEAR}`);
writeJsonAtomic(OUT_FILE, report);
console.log(`[verify-rk] relatório em ${OUT_FILE}`);
process.exit(nDiff === 0 ? (nOK > 0 ? 0 : 2) : 1);
