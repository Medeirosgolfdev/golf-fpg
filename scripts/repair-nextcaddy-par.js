/**
 * scripts/repair-nextcaddy-par.js
 *
 * Reparação one-shot (mas idempotente/re-corrível) do par dos torneios NextCaddy.
 *
 * Contexto (bug 2026-07-08): o scrape-nextcaddy.js SEMPRE capturou o par real da
 * tarjeta (linha "Par" do cartão), mas o infer-nextcaddy-par.js sobrescrevia-o
 * incondicionalmente com um par inferido dos scores — inferência essa contaminada
 * pelas classificações Handicap (líquidos) e por comparar totais de UMA volta com
 * o toPar do torneio inteiro. Resultado: pares absurdos (77 no Campeonato
 * Andalucía Alevín 2026, par real 72) e ± errados em toda a página /rfeg.
 *
 * Este script re-busca UMA tarjeta por torneio afectado (course.parInferred=true
 * e jogadores com cartões) e restaura o par real. Prefere tarjetas cujo nº de
 * buracos bate com o par existente (um Benjamín de 9 buracos num campo de 18
 * devolve o par cortado à frente-9 — ver effNine no parseScorecard).
 *
 * O infer-nextcaddy-par.js já NÃO sobrescreve par real (guard adicionado no
 * mesmo fix), portanto correr o infer depois deste repair é seguro.
 *
 * Uso:
 *   node scripts/repair-nextcaddy-par.js            # repara todos os parInferred
 *   node scripts/repair-nextcaddy-par.js --dry      # só relatório
 *   node scripts/repair-nextcaddy-par.js --ids 61180,61181
 *   node scripts/repair-nextcaddy-par.js --limit 10 # smoke test
 */

const fs = require("fs");
const path = require("path");
const { fetchScorecard } = require("./scrape-nextcaddy");
const { writeJsonAtomic } = require("./lib/atomic-write");

const NC_DIR = path.resolve(__dirname, "../public/data/nextcaddy");
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const ONLY_IDS = argVal("--ids") ? new Set(argVal("--ids").split(",").map((s) => s.trim())) : null;
const LIMIT = argVal("--limit") ? parseInt(argVal("--limit"), 10) : Infinity;
const CONCURRENCY = argVal("--concurrency") ? parseInt(argVal("--concurrency"), 10) : 3;
// Nº máximo de tarjetas a tentar por torneio até obter um par válido.
const MAX_CANDIDATES = 6;

/** Candidatos: inscribedIds de jogadores que TÊM cartão no ficheiro (a tarjeta
 *  existe de certeza no site), preferindo os com scores do comprimento esperado. */
function candidateIds(j, expectedLen) {
  const withLen = [];
  const others = [];
  const seen = new Set();
  for (const cat of j.leaderboard || []) {
    for (const p of cat.players || []) {
      if (!p.inscribedId || seen.has(p.inscribedId)) continue;
      const rs = (p.roundScores || []).filter((r) => Array.isArray(r.scores) && r.scores.length > 0);
      if (!rs.length) continue;
      seen.add(p.inscribedId);
      if (expectedLen && rs.some((r) => r.scores.length === expectedLen)) withLen.push(p.inscribedId);
      else others.push(p.inscribedId);
    }
  }
  return [...withLen, ...others];
}

async function repairFile(file, stats) {
  const fpath = path.join(NC_DIR, file);
  let j;
  try {
    j = JSON.parse(fs.readFileSync(fpath, "utf-8"));
  } catch {
    stats.badJson++;
    return;
  }
  if (!j.course || !j.course.parInferred || !Array.isArray(j.course.par)) { stats.notAffected++; return; }

  const expectedLen = j.course.par.length === 9 || j.course.par.length === 18 ? j.course.par.length : null;
  const ids = candidateIds(j, expectedLen).slice(0, MAX_CANDIDATES);
  if (!ids.length) { stats.noCandidates++; console.log(`  ${file}: sem tarjetas candidatas — mantém par inferido`); return; }

  let realPar = null, sc = null;
  for (const id of ids) {
    sc = await fetchScorecard(id, { retries: 2, retryDelay: 800 });
    if (sc && Array.isArray(sc.par) && sc.par.length > 0 && sc.par.every((v) => v == null || (v >= 3 && v <= 6))) {
      const clean = sc.par.filter((v) => typeof v === "number");
      if (clean.length === sc.par.length && (!expectedLen || sc.par.length === expectedLen)) { realPar = sc.par; break; }
    }
    sc = null;
  }
  if (!realPar) { stats.fetchFail++; console.log(`  ${file}: nenhuma tarjeta devolveu par válido — mantém par inferido`); return; }

  const oldTotal = j.course.par.reduce((a, b) => a + (b || 0), 0);
  const newTotal = realPar.reduce((a, b) => a + b, 0);
  const changed = JSON.stringify(j.course.par) !== JSON.stringify(realPar);

  j.course.par = realPar;
  j.course.parTotal = newTotal;
  delete j.course.parInferred;
  delete j.course.parConfidence;
  j.course.parSource = "tarjeta";
  // SI/metros: preencher só se faltarem (os existentes vieram do scrape original;
  // os metros são do tee do 1.º jogador — não trocar pelo tee de outro).
  if ((j.course.si == null || !Array.isArray(j.course.si) || !j.course.si.length) && Array.isArray(sc.si) && sc.si.length) j.course.si = sc.si;
  if ((j.course.meters == null || !Array.isArray(j.course.meters) || !j.course.meters.length) && Array.isArray(sc.meters) && sc.meters.length) j.course.meters = sc.meters;

  if (!DRY) writeJsonAtomic(fpath, j);
  stats.repaired++;
  if (changed) {
    stats.parChanged++;
    console.log(`  ${file}: par ${oldTotal} → ${newTotal}${DRY ? " (dry)" : ""}`);
  }
}

async function main() {
  const files = fs.readdirSync(NC_DIR)
    .filter((f) => /^\d+\.json$/.test(f))
    .filter((f) => !ONLY_IDS || ONLY_IDS.has(f.replace(".json", "")));

  // Pré-filtrar os afectados sem carregar tudo em memória de uma vez
  const affected = [];
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(NC_DIR, f), "utf-8"));
      if (j.course && j.course.parInferred && Array.isArray(j.course.par)) affected.push(f);
    } catch { /* contabilizado no repair */ }
    if (affected.length >= LIMIT) break;
  }
  console.log(`${affected.length} torneios com par inferido a reparar${DRY ? " (--dry)" : ""}`);

  const stats = { repaired: 0, parChanged: 0, fetchFail: 0, noCandidates: 0, notAffected: 0, badJson: 0 };
  let cursor = 0;
  async function worker() {
    while (cursor < affected.length) {
      const f = affected[cursor++];
      await repairFile(f, stats);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(`\nRepair: ${stats.repaired} reparados (${stats.parChanged} com par diferente), ` +
    `${stats.fetchFail} sem tarjeta válida, ${stats.noCandidates} sem candidatos, ${stats.badJson} JSON inválido`);
  // Exit 0 mesmo com falhas parciais — os falhados mantêm o par inferido (não pior que antes).
}

main().catch((e) => { console.error(e); process.exit(1); });
