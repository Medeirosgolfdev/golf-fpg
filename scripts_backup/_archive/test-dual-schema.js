// test-dual-schema.js — Testa normalização e derivação para ambos os schemas
// Uso: node test-dual-schema.js [fed1] [fed2]
//   Ex: node test-dual-schema.js 52884 52393
//   52884 = Manuel (Schema 1+2 misto), 52393 = Mateus (100% Schema 2)
const fs = require("fs");
const path = require("path");
const { normalizeWhsRows, parseDotNetDate, toNum } = require("./lib/helpers");

const feds = process.argv.slice(2);
if (!feds.length) feds.push("52884", "52393");

const _whsCalcCount = [0,0,0,1,1,1,2,2,2,3,3,3,4,4,4,5,5,6,6,7,8];
const _whsAdjust = [0,0,0,-2,-1,0,-1,0,0,0,0,0,0,0,0,0,0,0,0,0,0];

for (const fed of feds) {
  const whsPath = path.join("output", fed, "whs-list.json");
  const dataPath = path.join("output", fed, "analysis", "data.json");
  
  if (!fs.existsSync(whsPath)) { console.log(`[${fed}] whs-list.json não encontrado`); continue; }

  const rows = JSON.parse(fs.readFileSync(whsPath, "utf-8"))?.Records || [];
  
  // Contar schemas ANTES da normalização
  const s1 = rows.filter(r => r.hcp_date != null).length;
  const s2 = rows.filter(r => r.score_date != null && r.hcp_date == null).length;
  
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[${fed}] Total: ${rows.length} records | Schema1: ${s1} | Schema2: ${s2}`);
  console.log("=".repeat(60));

  // Normalizar
  normalizeWhsRows(rows);

  // Verificar que played_at existe em todos
  const noDate = rows.filter(r => !r.played_at);
  if (noDate.length) console.log(`  ⚠ ${noDate.length} rows sem played_at após normalização!`);
  else console.log("  ✓ Todos os rows têm played_at");

  // Verificar sgd
  const noSgd = rows.filter(r => r.sgd == null && r.score_differential == null);
  const hasSgd = rows.filter(r => r.sgd != null);
  console.log(`  ✓ ${hasSgd.length} rows com SD | ${noSgd.length} sem SD`);

  // Qualifying rows
  const qualif = rows
    .filter(r => r.hcp_qualifying_round === 1 || (r.hcp_qualifying_name || "").toLowerCase() === "sim")
    .sort((a, b) => {
      const da = parseDotNetDate(a.played_at || a.hcp_date) || new Date(0);
      const db = parseDotNetDate(b.played_at || b.hcp_date) || new Date(0);
      return da - db;
    });
  console.log(`  ✓ ${qualif.length} qualifying rounds`);

  // Derivar new_handicap
  for (let i = 0; i < qualif.length; i++) {
    const r = qualif[i];
    if (r.new_handicap == null && i + 1 < qualif.length) {
      r.new_handicap = qualif[i + 1].exact_hcp;
    }
  }

  // Schema 2 SD calc para última ronda
  const last = qualif[qualif.length - 1];
  let derivedHcp = null;
  if (last && last.new_handicap == null) {
    const last20 = qualif.slice(-20);
    const sds = last20.map(r => toNum(r.sgd)).filter(v => v != null);
    if (sds.length >= 3) {
      const n = _whsCalcCount[Math.min(sds.length, 20)];
      const adj = _whsAdjust[Math.min(sds.length, 20)];
      const bestN = [...sds].sort((a, b) => a - b).slice(0, n);
      const avg = bestN.reduce((a, b) => a + b, 0) / bestN.length;
      derivedHcp = Math.round((avg + adj) * 10) / 10;
      last.new_handicap = derivedHcp;
      console.log(`  ✓ HCP derivado dos SDs: ${derivedHcp} (${n} de ${sds.length} scores)`);
    } else {
      last.new_handicap = last.calc_hcp_index ?? last.exact_hcp;
      derivedHcp = toNum(last.new_handicap);
      console.log(`  ⚠ Poucos SDs (${sds.length}), usando exact_hcp: ${derivedHcp}`);
    }
  } else if (last) {
    console.log(`  ✓ Última ronda Schema 1: new_handicap=${last.new_handicap}`);
  }

  // Propagar
  const allSorted = [...rows].sort((a, b) => {
    const da = parseDotNetDate(a.played_at || a.hcp_date) || new Date(0);
    const db = parseDotNetDate(b.played_at || b.hcp_date) || new Date(0);
    return da - db;
  });
  let lastHI = null;
  for (const r of allSorted) {
    if (r.new_handicap != null) lastHI = r.new_handicap;
    if (r.new_handicap == null && lastHI != null) r.new_handicap = lastHI;
  }
  const noHI = rows.filter(r => r.new_handicap == null);
  console.log(`  ✓ ${rows.length - noHI.length} rows com new_handicap | ${noHI.length} sem`);

  // Newest row
  const newest = [...rows].sort((a, b) => {
    const da = parseDotNetDate(a.played_at || a.hcp_date) || new Date(0);
    const db = parseDotNetDate(b.played_at || b.hcp_date) || new Date(0);
    return db - da;
  })[0];
  
  if (newest) {
    const d = parseDotNetDate(newest.played_at || newest.hcp_date);
    console.log(`\n  Mais recente: score_id=${newest.score_id} ${d ? d.toISOString().slice(0,10) : '?'}`);
    console.log(`    schema: ${newest._schema || '1'}  new_handicap: ${newest.new_handicap}  exact_handicap: ${newest.exact_handicap}`);
  }

  // Comparar com data.json
  if (fs.existsSync(dataPath)) {
    const dj = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
    const djHcp = dj?.HCP_INFO?.current;
    const expectedHcp = toNum(newest?.new_handicap) ?? derivedHcp;
    const match = djHcp === expectedHcp;
    console.log(`\n  data.json HCP: ${djHcp}`);
    console.log(`  Esperado:      ${expectedHcp}`);
    console.log(`  ${match ? '✓ MATCH' : '✗ MISMATCH — precisa regenerar: node make-scorecards-ui.js ' + fed}`);
    if (dj?.HCP_INFO?.qtyScores != null) {
      console.log(`  qtyScores: ${dj.HCP_INFO.qtyScores} | qtyCalc: ${dj.HCP_INFO.qtyCalc}`);
    }
  } else {
    console.log(`\n  ⚠ data.json não encontrado`);
  }
}
