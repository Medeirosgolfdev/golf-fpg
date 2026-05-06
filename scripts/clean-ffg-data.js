/**
 * scripts/clean-ffg-data.js
 *
 * Limpeza de JSONs FFG/LGPIDF antigos. Útil depois de re-correr o scraper
 * com o novo formato (que inclui hole-by-hole + par real).
 *
 * O que apaga:
 *  - --resultats-old : JSONs em ffgolf-resultats/ que NÃO têm o formato novo
 *                      (sem details.series[].parPerHole). Estes são do scrape
 *                      inicial antes da descoberta do JSON joueursSerie.
 *  - --lgpidf-matched : JSONs LGPIDF (em ffgolf/lgpidf-*.json) que JÁ estão
 *                      cobertos pelo FFG resultats (mesma data + nome similar).
 *                      Mantém os de torneios futuros (sem resultados FFG ainda).
 *  - --lgpidf-all     : Apaga TODOS os LGPIDF (drástico — só usar se confirmares
 *                      que tens o equivalente em ffgolf-resultats).
 *  - --pdfs           : Apaga PDFs descarregados em ffgolf-pdfs/ (cache, podem
 *                      ser re-descarregados via download-pdfs.js).
 *  - --all            : Tudo acima.
 *
 * USO:
 *   node scripts/clean-ffg-data.js --resultats-old      # default seguro
 *   node scripts/clean-ffg-data.js --resultats-old --lgpidf-matched
 *   node scripts/clean-ffg-data.js --all
 *   node scripts/clean-ffg-data.js --resultats-old --dry-run   # ver o que apagaria
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FFGOLF_RES_DIR = path.join(ROOT, "public/data/ffgolf-resultats");
const FFGOLF_DIR = path.join(ROOT, "public/data/ffgolf");
const PDFS_DIR = path.join(ROOT, "public/data/ffgolf-pdfs");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const doResOld = args.includes("--resultats-old") || args.includes("--all");
const doLgMatched = args.includes("--lgpidf-matched") || args.includes("--all");
const doLgAll = args.includes("--lgpidf-all") || args.includes("--all");
const doPdfs = args.includes("--pdfs") || args.includes("--all");

if (!doResOld && !doLgMatched && !doLgAll && !doPdfs) {
  console.log("⚠ Nenhuma flag de limpeza passada. Usa uma das:");
  console.log("    --resultats-old      Apaga JSONs ffgolf-resultats/ sem hole-by-hole");
  console.log("    --lgpidf-matched     Apaga LGPIDF que já estão em FFG resultats");
  console.log("    --lgpidf-all         Apaga TODOS os LGPIDF (drástico)");
  console.log("    --pdfs               Apaga ffgolf-pdfs/ (cache)");
  console.log("    --all                Tudo acima");
  console.log("    --dry-run            Mostra o que apagaria sem apagar");
  process.exit(0);
}

console.log(`🧹 clean-ffg-data ${dryRun ? "[DRY RUN]" : "[APAGAR]"}`);
console.log(`   resultats-old: ${doResOld}, lgpidf-matched: ${doLgMatched}, lgpidf-all: ${doLgAll}, pdfs: ${doPdfs}`);

let totalRemoved = 0;
let totalBytes = 0;

function rmFile(p) {
  if (!fs.existsSync(p)) return 0;
  const sz = fs.statSync(p).size;
  if (!dryRun) fs.unlinkSync(p);
  totalRemoved++;
  totalBytes += sz;
  return sz;
}

function rmDirRecursive(p) {
  if (!fs.existsSync(p)) return;
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, entry.name);
    if (entry.isDirectory()) {
      rmDirRecursive(full);
      if (!dryRun) try { fs.rmdirSync(full); } catch { /* not empty */ }
    } else {
      rmFile(full);
    }
  }
}

/* ───────── 1) Resultats antigos (sem parPerHole) ───────── */
if (doResOld && fs.existsSync(FFGOLF_RES_DIR)) {
  console.log(`\n📁 ffgolf-resultats/ — verificar formato antigo`);
  const files = fs.readdirSync(FFGOLF_RES_DIR).filter((f) => /^\d{2}-\d{2}-\d+\.json$/.test(f));
  let oldFormat = 0;
  for (const file of files) {
    const p = path.join(FFGOLF_RES_DIR, file);
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf-8"));
      const series = j.details?.series || [];
      // Formato novo: pelo menos uma série tem parPerHole (array)
      const hasNewFormat = series.some((s) => Array.isArray(s.parPerHole) && s.parPerHole.length > 0);
      // Formato novo (extra): pelo menos um jogador tem scoresR1
      const hasHbh = series.some((s) => s.players?.some((p) => Array.isArray(p.scoresR1) && p.scoresR1.length > 0));
      if (!hasNewFormat && !hasHbh) {
        console.log(`   🗑  ${file}`);
        rmFile(p);
        oldFormat++;
      }
    } catch (e) {
      console.log(`   ⚠ ${file}: ${e.message.slice(0, 60)}`);
    }
  }
  console.log(`   ${oldFormat} ficheiros antigos ${dryRun ? "marcados" : "apagados"} (de ${files.length} totais)`);
}

/* ───────── 2) LGPIDF matched (já cobertos por FFG) ───────── */
if (doLgMatched && fs.existsSync(FFGOLF_DIR)) {
  console.log(`\n📁 ffgolf/ — LGPIDF matched a FFG resultats`);
  // Carregar todos os ffgolf-resultats com data+nome
  const ffgFiles = fs.existsSync(FFGOLF_RES_DIR)
    ? fs.readdirSync(FFGOLF_RES_DIR).filter((f) => /^\d{2}-\d{2}-\d+\.json$/.test(f))
    : [];
  const ffgEntries = [];
  for (const f of ffgFiles) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(FFGOLF_RES_DIR, f), "utf-8"));
      // dte_cpt format: DD/MM/YYYY → ISO
      const m = (j.date || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const dateIso = m ? `${m[3]}-${m[2]}-${m[1]}` : null;
      ffgEntries.push({ name: (j.name || "").toLowerCase(), dateIso });
    } catch { /* skip */ }
  }
  const lgFiles = fs.readdirSync(FFGOLF_DIR).filter((f) => /^lgpidf-/.test(f));
  let matched = 0;
  for (const f of lgFiles) {
    const p = path.join(FFGOLF_DIR, f);
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf-8"));
      const dateStart = j.dateStart;
      const lgName = (j.tournament || "").toLowerCase();
      // Match: mesma data + ≥2 palavras em comum
      const isMatched = ffgEntries.some((e) => {
        if (!e.dateIso || e.dateIso !== dateStart) return false;
        const ffgWords = new Set(e.name.split(/[\s-]+/).filter((w) => w.length > 3));
        const lgWords = lgName.split(/[\s-]+/).filter((w) => w.length > 3);
        const overlap = lgWords.filter((w) => ffgWords.has(w));
        return overlap.length >= 2;
      });
      if (isMatched) {
        console.log(`   🗑  ${f} (matched)`);
        rmFile(p);
        matched++;
      }
    } catch { /* skip */ }
  }
  console.log(`   ${matched} ficheiros LGPIDF matched ${dryRun ? "marcados" : "apagados"} (de ${lgFiles.length} totais)`);
}

/* ───────── 3) LGPIDF tudo ───────── */
if (doLgAll && fs.existsSync(FFGOLF_DIR)) {
  console.log(`\n📁 ffgolf/ — apagar TODOS os LGPIDF`);
  const lgFiles = fs.readdirSync(FFGOLF_DIR).filter((f) => /^lgpidf-/.test(f));
  for (const f of lgFiles) {
    rmFile(path.join(FFGOLF_DIR, f));
  }
  // Apagar manifest
  const manifest = path.join(ROOT, "public/data/ffgolf-lgpidf-index.json");
  rmFile(manifest);
  console.log(`   ${lgFiles.length} ficheiros LGPIDF + manifest ${dryRun ? "marcados" : "apagados"}`);
}

/* ───────── 4) PDFs cache ───────── */
if (doPdfs && fs.existsSync(PDFS_DIR)) {
  console.log(`\n📁 ffgolf-pdfs/ — apagar cache de PDFs`);
  const start = totalRemoved;
  rmDirRecursive(PDFS_DIR);
  if (!dryRun) try { fs.rmdirSync(PDFS_DIR); } catch { /* not empty */ }
  console.log(`   ${totalRemoved - start} ficheiros ${dryRun ? "marcados" : "apagados"}`);
}

/* ───────── Final ───────── */
console.log(`\n✅ ${dryRun ? "Marcados" : "Apagados"}: ${totalRemoved} ficheiros · ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
if (dryRun) console.log(`   (corre sem --dry-run para apagar realmente)`);
console.log(`\nDepois corre:`);
console.log(`   node scripts/build-ffgolf-resultats-index.js   # rebuild manifest`);
console.log(`   node scripts/build-lgpidf-index.js              # se ainda tens LGPIDF`);
