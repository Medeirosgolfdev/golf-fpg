#!/usr/bin/env node
/**
 * build-inativos-derivatives.js
 * ═══════════════════════════════════════════════════════════════
 * Processa o ficheiro pesado `federados-inativos.json` (41 MB, 43k jogadores)
 * e gera dois ficheiros derivados mais leves para a app:
 *
 *   1. `federados-inativos-stats.json` (~3 KB)
 *       - Agregados: total, por sexo, escalão, ano admissão, decade
 *       - HCP bins, top clubes, idade média
 *       - SEM registos individuais
 *
 *   2. `federados-inativos-jovens.json` (~7 MB, ~2.8k jogadores)
 *       - Só Sub-10 a Sub-21 (escalões jovens)
 *       - Registos completos (32 campos por jogador)
 *
 * O ficheiro pesado `federados-inativos.json` pode manter-se no
 * repo ou ser gitignored — a app só precisa dos derivados.
 *
 * USO:
 *   node scripts/build-inativos-derivatives.js
 * ═══════════════════════════════════════════════════════════════
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const INPUT       = path.join(ROOT, "public/data/federados-inativos.json");
const OUT_STATS   = path.join(ROOT, "public/data/federados-inativos-stats.json");
const OUT_JOVENS  = path.join(ROOT, "public/data/federados-inativos-jovens.json");

const YOUNG_LEVELS = new Set(["SUB10", "SUB12", "SUB14", "SUB16", "SUB18", "SUB21"]);

if (!fs.existsSync(INPUT)) {
  console.error("❌ Não encontrei", INPUT);
  console.error("   Faz o scrape primeiro com scripts/scrape-federados-inativos.js");
  process.exit(1);
}

console.log("📖 A ler", path.relative(ROOT, INPUT), "...");
const raw = JSON.parse(fs.readFileSync(INPUT, "utf8"));
console.log(`   ${raw.totalScraped.toLocaleString("pt-PT")} jogadores\n`);

/* ── Agregações ───────────────────────────────────────────────── */
const byAge      = {};
const byGender   = { M: 0, F: 0, other: 0 };
const byClub     = {};   // code → { name, m, f, count }
const byCountry  = {};   // cp → { count, name }
const byAdmYear  = {};   // YYYY → { m, f }
const hcpBins    = { plus: { m: 0, f: 0 }, "0-5": { m: 0, f: 0 }, "5-10": { m: 0, f: 0 }, "10-15": { m: 0, f: 0 }, "15-20": { m: 0, f: 0 }, "20-30": { m: 0, f: 0 }, "30+": { m: 0, f: 0 } };
let withHcp = 0, totalHcp = 0, totalAge = 0, withAge = 0, pros = 0;

const binKey = (h) => h < 0 ? "plus" : h < 5 ? "0-5" : h < 10 ? "5-10" : h < 15 ? "10-15" : h < 20 ? "15-20" : h < 30 ? "20-30" : "30+";

const jovens = [];

for (const p of raw.players) {
  const isM = p.gender === "M";
  const isF = p.gender === "F";
  if (isM) byGender.M++; else if (isF) byGender.F++; else byGender.other++;

  const lvl = p.age_level || "?";
  if (!byAge[lvl]) byAge[lvl] = { m: 0, f: 0 };
  if (isM) byAge[lvl].m++; else if (isF) byAge[lvl].f++;

  const cCode = p.club_code || "?";
  if (!byClub[cCode]) byClub[cCode] = { name: p.acronym || p.club_name || "?", m: 0, f: 0, count: 0 };
  if (isM) byClub[cCode].m++; else if (isF) byClub[cCode].f++;
  byClub[cCode].count++;

  const cp = p.country_prefix || "?";
  if (!byCountry[cp]) byCountry[cp] = { count: 0, name: p.country || cp };
  byCountry[cp].count++;

  if (p.admission_date) {
    const y = p.admission_date.slice(0, 4);
    if (!byAdmYear[y]) byAdmYear[y] = { m: 0, f: 0 };
    if (isM) byAdmYear[y].m++; else if (isF) byAdmYear[y].f++;
  }

  if (p.hcp_exact != null && p.hcp_exact < 99) {
    withHcp++;
    totalHcp += p.hcp_exact;
    const k = binKey(p.hcp_exact);
    if (isM) hcpBins[k].m++; else if (isF) hcpBins[k].f++;
  }

  if (p.birthdate) {
    const birth = new Date(p.birthdate);
    if (!isNaN(birth.getTime())) {
      const age = (new Date().getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      totalAge += age;
      withAge++;
    }
  }

  if (p.player_type_id === 2 || p.player_type === "Profissional") pros++;

  /* ── Filtro jovens ── */
  if (YOUNG_LEVELS.has(p.age_level)) jovens.push(p);
}

const topClubs = Object.entries(byClub)
  .map(([code, c]) => ({ code, ...c }))
  .sort((a, b) => b.count - a.count);

const topCountries = Object.entries(byCountry)
  .map(([cp, v]) => ({ cp, ...v }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 20);

const admissionYears = Object.entries(byAdmYear)
  .filter(([y]) => Number(y) >= 1990)
  .sort((a, b) => a[0].localeCompare(b[0]));

const stats = {
  generated:    new Date().toISOString(),
  source:       "federados-inativos.json (FedStat=7)",
  total:        raw.totalScraped,
  male:         byGender.M,
  female:       byGender.F,
  otherGender:  byGender.other,
  withHcp,
  avgHcp:       withHcp ? +(totalHcp / withHcp).toFixed(2) : null,
  avgAge:       withAge ? +(totalAge / withAge).toFixed(1) : null,
  pros,
  byAge,
  hcpBins,
  topCountries,
  admissionYears,
  allClubs: topClubs,   // completo (para tabelas sortable)
};

fs.writeFileSync(OUT_STATS, JSON.stringify(stats, null, 2) + "\n");
console.log(`✅ ${path.relative(ROOT, OUT_STATS)} (${(fs.statSync(OUT_STATS).size / 1024).toFixed(1)} KB)`);

/* ── Jovens (Sub-10 a Sub-21) ─────────────────────────────────── */
const youngOutput = {
  generated: new Date().toISOString(),
  source:    "federados-inativos.json (FedStat=7, escalão ∈ Sub10-Sub21)",
  total:     jovens.length,
  ageLevels: [...YOUNG_LEVELS],
  players:   jovens,
};
fs.writeFileSync(OUT_JOVENS, JSON.stringify(youngOutput, null, 2) + "\n");
console.log(`✅ ${path.relative(ROOT, OUT_JOVENS)} (${(fs.statSync(OUT_JOVENS).size / 1024 / 1024).toFixed(2)} MB, ${jovens.length.toLocaleString("pt-PT")} jovens)`);

/* ── Summary ──────────────────────────────────────────────────── */
console.log("\n── Resumo dos inactivos ──");
console.log(`Total:        ${raw.totalScraped.toLocaleString("pt-PT")}`);
console.log(`  Masculino:  ${byGender.M.toLocaleString("pt-PT")}`);
console.log(`  Feminino:   ${byGender.F.toLocaleString("pt-PT")}`);
console.log(`Com HCP:      ${withHcp.toLocaleString("pt-PT")} (média ${stats.avgHcp})`);
console.log(`Idade média:  ${stats.avgAge} anos`);
console.log(`Profissionais:${pros}`);
console.log(`Jovens extraídos: ${jovens.length.toLocaleString("pt-PT")}`);
const byAgeSummary = Object.entries(byAge).sort((a, b) => (b[1].m + b[1].f) - (a[1].m + a[1].f));
console.log("\nPor escalão:");
for (const [k, v] of byAgeSummary) {
  console.log(`   ${k.padEnd(12)} ${(v.m + v.f).toString().padStart(6)}  (M:${v.m} F:${v.f})`);
}
