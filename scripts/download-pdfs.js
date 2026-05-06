/**
 * scripts/download-pdfs.js
 *
 * FASE 1: Descarregar TODOS os PDFs disponíveis (sem parse).
 *
 * Funciona com múltiplas fontes:
 *   - lgpidf.com (Liga Paris-IDF)
 *   - Pode ser estendido para outras ligas francesas (Hauts-de-France, PACA, etc.)
 *
 * Para cada torneio:
 *   1. Fetch a página HTML
 *   2. Extrai TODOS os links PDF
 *   3. Descarrega cada um
 *   4. Guarda em public/data/ffgolf-pdfs/{source}/{year}/{slug}/{filename}.pdf
 *   5. Escreve `pdf-index.json` com metadata (source, slug, year, kind, category, url, localPath)
 *
 * USO:
 *   node scripts/download-pdfs.js                       # todas as fontes conhecidas
 *   node scripts/download-pdfs.js --source lgpidf       # só lgpidf.com
 *   node scripts/download-pdfs.js --slug grand-prix...  # 1 só torneio
 *   node scripts/download-pdfs.js --force               # re-download mesmo se já existe
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "../public/data/ffgolf-pdfs");
const INDEX_PATH = path.join(ROOT, "pdf-index.json");

/* ═══════════════════════════════════════════════════════════════
   FONTES — adicionar mais aqui quando descobrirmos
   ═══════════════════════════════════════════════════════════════ */
const SOURCES = {
  lgpidf: {
    name: "Ligue Paris-Île-de-France",
    base: "https://www.lgpidf.com",
    listUrl: "https://www.lgpidf.com/fr/competitions/jeunes/-/-/list/1/",
    competitionUrl: (slug) => `https://www.lgpidf.com/fr/competition/${slug}/`,
    // Slugs descobertos via crawl da página /competitions/jeunes/
    slugs: [
      "grand-prix-jeunes-de-la-ligue-paris-ile-de-france-1-u12-benjamins-1",
      "grand-prix-jeunes-de-la-ligue-paris-ile-de-france-2-u12-benjamins",
      "grand-prix-jeunes-de-la-ligue-paris-ile-de-france-3-4",
      "grand-prix-jeunes-de-la-ligue-paris-ile-de-france-4-4",
      "grand-prix-jeunes-de-la-ligue-paris-ile-de-france-5-benjamins-minimes-1",
      "grand-prix-jeunes-de-la-ligue-paris-ile-de-france-5-u12-2",
      "championnat-de-ligue-u12-trophee-pascale-bourson-5",
      "qualification-cjf-1-pidf-benjamins-3",
      "qualification-cjf-1-pidf-u12-3",
      "qualification-cjf-2-pidf-benjamins-3",
      "qualification-cjf-2-pidf-u12-3",
      "tour-poucets-individuel-open-1",
      "tour-poucets-individuel-open-2",
      "tour-poucets-individuel-open-3",
      "tour-poucets-individuel-open-4",
      "tour-poucets-individuel-open-5",
      "tour-poucets-finale-1",
      "challenge-des-ecoles-de-golf-de-la-ligue",
      "finale-interregionale-cfj",
      "pro-am-bernard-westphalen-lemaitre-2026",
    ],
    pdfPattern: /\/models\/gallerymedia\/assets\/[^\s"'<>]+\.pdf/gi,
  },
};

/* ═══════════════════════════════════════════════════════════════
   Classificadores — heurísticos sobre nome do ficheiro
   ═══════════════════════════════════════════════════════════════ */
function classifyKind(filename) {
  const f = filename.toLowerCase();
  if (/reglement|règlement/i.test(f)) return "reglement";
  if (/annexe|annex/i.test(f)) return "annexe";
  if (/liste|inscrits|joueurs.retenus/i.test(f)) return "liste-inscrits";
  if (/finaux|palmares|palmar[èe]s/i.test(f)) return "resultats-finaux";
  if (/classement/i.test(f)) return "classement";
  if (/-t2[-.]|t2-/i.test(f)) return "resultats-t2";
  if (/-t1[-.]|t1-/i.test(f)) return "resultats-t1";
  if (/resultats|résultats/i.test(f)) return "resultats";
  if (/depart|départ|tee.?times?/i.test(f)) return "departs";
  return "other";
}

function classifyCategory(filename) {
  const f = filename.toLowerCase();
  if (/u10f|u10-f/i.test(f)) return "U10F";
  if (/u10g|u10-g/i.test(f)) return "U10G";
  if (/u12f|u12-f/i.test(f)) return "U12F";
  if (/u12g|u12-g/i.test(f)) return "U12G";
  if (/u14f|u14-f/i.test(f)) return "U14F";
  if (/u14g|u14-g/i.test(f)) return "U14G";
  if (/u16f|u16-f/i.test(f)) return "U16F";
  if (/u16g|u16-g/i.test(f)) return "U16G";
  if (/-bf[-.]|benjamines/i.test(f)) return "BF";
  if (/-bg[-.]|benjamins/i.test(f)) return "BG";
  if (/-mf[-.]|minimes-fille/i.test(f)) return "MF";
  if (/-mg[-.]|minimes-garcon/i.test(f)) return "MG";
  if (/u10|u-10/i.test(f)) return "U10";
  if (/u8|u-8/i.test(f)) return "U8";
  return null;
}

function extractYear(filename) {
  const m = filename.match(/(20\d{2})/);
  return m ? parseInt(m[1], 10) : new Date().getFullYear();
}

/* ═══════════════════════════════════════════════════════════════
   HTTP fetch helper
   ═══════════════════════════════════════════════════════════════ */
function fetchUrl(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; pdf-downloader)",
          "Accept": "*/*",
        },
      },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          if (redirectsLeft <= 0) return reject(new Error("too many redirects"));
          return resolve(fetchUrl(res.headers.location, redirectsLeft - 1));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy(new Error("timeout")));
  });
}

/* ═══════════════════════════════════════════════════════════════
   Download de 1 torneio
   ═══════════════════════════════════════════════════════════════ */
async function downloadTournament(source, slug, opts) {
  const sourceDef = SOURCES[source];
  const url = sourceDef.competitionUrl(slug);
  const r = await fetchUrl(url);
  if (r.status !== 200) {
    console.log(`   ⚠ ${slug}: HTTP ${r.status}`);
    return [];
  }
  const html = r.body.toString("utf-8");
  const pdfPaths = [...new Set([...html.matchAll(sourceDef.pdfPattern)].map((m) => m[0]))];
  if (!pdfPaths.length) {
    console.log(`   ⚠ ${slug}: sem PDFs`);
    return [];
  }
  // Detectar título da página para metadata
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : slug;
  // Detectar data
  const dateMatch = html.match(/(\d{1,2}\s+(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(20\d{2}))/i);
  const tournamentYear = dateMatch ? parseInt(dateMatch[2], 10) : null;

  console.log(`   📂 ${slug}: ${pdfPaths.length} PDFs`);
  const entries = [];
  for (const p of pdfPaths) {
    const filename = p.split("/").pop();
    const kind = classifyKind(filename);
    const category = classifyCategory(filename);
    const year = tournamentYear || extractYear(filename);
    const dir = path.join(ROOT, source, String(year), slug);
    const localPath = path.join(dir, filename);
    const relativePath = path.relative(ROOT, localPath).replace(/\\/g, "/");

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let downloaded = false;
    if (!opts.force && fs.existsSync(localPath) && fs.statSync(localPath).size > 1000) {
      // Já existe — skip download
    } else {
      const fullUrl = sourceDef.base + p;
      try {
        const pdfRes = await fetchUrl(fullUrl);
        if (pdfRes.status === 200 && pdfRes.body.length > 500) {
          fs.writeFileSync(localPath, pdfRes.body);
          downloaded = true;
        } else {
          console.log(`     ⚠ ${filename}: HTTP ${pdfRes.status}`);
          continue;
        }
      } catch (e) {
        console.log(`     ❌ ${filename}: ${e.message.slice(0, 40)}`);
        continue;
      }
    }

    entries.push({
      source,
      slug,
      title,
      year,
      tournamentYear,
      kind,
      category,
      filename,
      url: sourceDef.base + p,
      localPath: relativePath,
      sizeBytes: fs.statSync(localPath).size,
      downloaded,
      timestamp: new Date().toISOString(),
    });
  }
  const summary = entries.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1;
    return acc;
  }, {});
  console.log(`     ${entries.length} PDFs guardados (${Object.entries(summary).map(([k, v]) => `${k}=${v}`).join(", ")})`);
  return entries;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════ */
(async () => {
  const args = process.argv.slice(2);
  const opts = { force: args.includes("--force") };
  let sourcesToRun = Object.keys(SOURCES);
  if (args.includes("--source")) {
    sourcesToRun = [args[args.indexOf("--source") + 1]];
  }
  let slugFilter = null;
  if (args.includes("--slug")) {
    slugFilter = args[args.indexOf("--slug") + 1];
  }

  console.log(`📥 PDF downloader — fontes: ${sourcesToRun.join(", ")}${opts.force ? " (force)" : ""}`);
  if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

  // Carregar índice existente para merge
  let existingIndex = [];
  if (fs.existsSync(INDEX_PATH)) {
    try { existingIndex = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")).pdfs || []; } catch {}
  }
  const allEntries = [...existingIndex];

  for (const source of sourcesToRun) {
    const sourceDef = SOURCES[source];
    if (!sourceDef) { console.log(`⚠ source desconhecida: ${source}`); continue; }
    let slugs = sourceDef.slugs || [];
    if (slugFilter) slugs = slugs.filter((s) => s === slugFilter);
    console.log(`\n🏛️  ${source} — ${sourceDef.name} (${slugs.length} torneios)`);
    for (const slug of slugs) {
      try {
        const entries = await downloadTournament(source, slug, opts);
        // Substituir entries antigas do mesmo slug
        const filtered = allEntries.filter((e) => !(e.source === source && e.slug === slug));
        allEntries.splice(0, allEntries.length, ...filtered, ...entries);
      } catch (e) {
        console.error(`   ❌ ${slug}: ${e.message}`);
      }
    }
  }

  // Escrever índice
  const indexData = {
    generated_at: new Date().toISOString(),
    total_pdfs: allEntries.length,
    by_kind: allEntries.reduce((acc, e) => { acc[e.kind] = (acc[e.kind] || 0) + 1; return acc; }, {}),
    by_category: allEntries.reduce((acc, e) => { if (e.category) acc[e.category] = (acc[e.category] || 0) + 1; return acc; }, {}),
    by_source: allEntries.reduce((acc, e) => { acc[e.source] = (acc[e.source] || 0) + 1; return acc; }, {}),
    pdfs: allEntries,
  };
  fs.writeFileSync(INDEX_PATH, JSON.stringify(indexData, null, 2), "utf-8");
  console.log(`\n✅ ${allEntries.length} PDFs no índice — ${INDEX_PATH}`);
  console.log(`   By kind: ${JSON.stringify(indexData.by_kind)}`);
  console.log(`   By category: ${JSON.stringify(indexData.by_category)}`);
})();
