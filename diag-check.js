// diag-check.js — Verificar dados de um jogador
// Uso: node diag-check.js 45812
const fs = require("fs");
const path = require("path");

const fed = process.argv[2] || "45812";
const root = process.cwd();

console.log(`\n=== Diagnóstico para federado ${fed} ===\n`);

// 1. players.json
const pPath = path.join(root, "players.json");
try {
  const pdb = JSON.parse(fs.readFileSync(pPath, "utf-8"));
  const entry = pdb[fed];
  if (entry) {
    const club = typeof entry.club === "object" ? JSON.stringify(entry.club) : entry.club;
    console.log(`[players.json]`);
    console.log(`  name:    ${entry.name}`);
    console.log(`  club:    ${club}`);
    console.log(`  hcp:     ${entry.hcp}`);
    console.log(`  escalao: ${entry.escalao}`);
  } else {
    console.log(`[players.json] Federado ${fed} não encontrado`);
  }
} catch (e) { console.log(`[players.json] Erro: ${e.message}`); }

// 2. WHS list — most recent row
const whsPath = path.join(root, "output", fed, "whs-list.json");
try {
  const whs = JSON.parse(fs.readFileSync(whsPath, "utf-8"));
  const rows = (whs?.d ?? whs)?.Records || whs?.Records || [];
  // Sort by date descending
  const sorted = [...rows].sort((a, b) => {
    const da = String(a.hcp_date || a.mov_date || "").match(/Date\((\d+)\)/);
    const db = String(b.hcp_date || b.mov_date || "").match(/Date\((\d+)\)/);
    return (db ? +db[1] : 0) - (da ? +da[1] : 0);
  });
  const newest = sorted[0];
  if (newest) {
    const d = String(newest.hcp_date || newest.mov_date || "").match(/Date\((\d+)\)/);
    const dateStr = d ? new Date(+d[1]).toISOString().slice(0, 10) : "?";
    console.log(`\n[whs-list.json] ${rows.length} registos, mais recente:`);
    console.log(`  date:            ${dateStr}`);
    console.log(`  prev_handicap:   ${newest.prev_handicap}`);
    console.log(`  new_handicap:    ${newest.new_handicap}`);
    console.log(`  exact_handicap:  ${newest.exact_handicap}`);
    console.log(`  course:          ${newest.course_description}`);
    console.log(`  tourn:           ${newest.tourn_name}`);
  }
  // Also show 2nd most recent for comparison
  if (sorted[1]) {
    const d2 = String(sorted[1].hcp_date || sorted[1].mov_date || "").match(/Date\((\d+)\)/);
    const dateStr2 = d2 ? new Date(+d2[1]).toISOString().slice(0, 10) : "?";
    console.log(`  --- 2ª mais recente ---`);
    console.log(`  date:            ${dateStr2}`);
    console.log(`  prev_handicap:   ${sorted[1].prev_handicap}`);
    console.log(`  exact_handicap:  ${sorted[1].exact_handicap}`);
  }
} catch (e) { console.log(`\n[whs-list.json] Erro: ${e.message}`); }

// 3. Most recent scorecard — player_acronym (club)
const scDir = path.join(root, "output", fed, "scorecards");
try {
  const files = fs.readdirSync(scDir).filter(f => f.endsWith(".json"));
  let latestClub = null, latestDate = 0, latestFile = "";
  for (const f of files) {
    const sc = JSON.parse(fs.readFileSync(path.join(scDir, f), "utf-8"));
    const rec = (sc.Records || [])[0];
    if (!rec) continue;
    const dm = String(rec.played_at || "").match(/Date\((\d+)\)/);
    const d = dm ? +dm[1] : 0;
    if (d > latestDate) {
      latestDate = d;
      latestClub = rec.player_acronym;
      latestFile = f;
    }
  }
  console.log(`\n[scorecards] ${files.length} ficheiros, mais recente: ${latestFile}`);
  console.log(`  player_acronym:  ${latestClub}`);
  console.log(`  date:            ${new Date(latestDate).toISOString().slice(0, 10)}`);
} catch (e) { console.log(`\n[scorecards] Erro: ${e.message}`); }

// 4. data.json — CROSS_DATA and HCP_INFO
const dataPath = path.join(root, "output", fed, "analysis", "data.json");
try {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const cross = data.CROSS_DATA?.[data.CURRENT_FED || fed];
  const clubVal = cross?.club;
  const clubDisplay = typeof clubVal === "object" ? JSON.stringify(clubVal) : clubVal;
  console.log(`\n[data.json] CURRENT_FED=${data.CURRENT_FED}`);
  console.log(`  HCP_INFO.current:     ${data.HCP_INFO?.current}`);
  console.log(`  CROSS_DATA.club:      ${clubDisplay}`);
  console.log(`  CROSS_DATA.escalao:   ${cross?.escalao}`);
  console.log(`  CROSS_DATA.currentHcp: ${cross?.currentHcp}`);
  console.log(`  META.lastUpdate:      ${data.META?.lastUpdate}`);
} catch (e) { console.log(`\n[data.json] Erro: ${e.message}`); }

console.log("\n=== Fim ===\n");
