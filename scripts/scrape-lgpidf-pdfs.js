/**
 * scripts/scrape-lgpidf-pdfs.js
 *
 * Scraper PDF dos torneios juvenis Paris-Île-de-France (lgpidf.com).
 *
 * Estes torneios NÃO usam GolfGenius — publicam apenas PDFs com a leaderboard.
 * Este script:
 *   1. Lista os ~20 torneios juvenis em lgpidf.com/fr/competitions/jeunes/
 *   2. Para cada um, fetcha a página HTML, extrai URLs dos PDFs `resultats-*-t2`
 *      (cada categoria — U12F, U12G, BF, BG — tem o seu PDF)
 *   3. Descarrega cada PDF via fetch directo
 *   4. Parse com pdf-parse para extrair texto
 *   5. Regex para identificar linhas de leaderboard (pos | nome | clube | hcp | T1 | T2 | Total)
 *   6. Output: public/data/ffgolf/lgpidf-{ano}-{slug}.json em formato compatível com FFGPage
 *
 * REQUISITOS: npm install pdf-parse
 *
 * USO:
 *   node scripts/scrape-lgpidf-pdfs.js                 # todos os 20
 *   node scripts/scrape-lgpidf-pdfs.js --slug grand-prix-jeunes-de-la-ligue-paris-ile-de-france-1-u12-benjamins-1
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

// pdf-parse — usar import directo do lib path para evitar o "debug mode" no index.js
// que tenta abrir ./test/data/05-versions-space.pdf e crasha.
let pdfParse;
const importErrors = [];
const importPaths = [
  "pdf-parse/lib/pdf-parse.js",
  "pdf-parse/lib/pdf-parse",
  "pdf-parse",
];
for (const p of importPaths) {
  try {
    const mod = require(p);
    pdfParse = typeof mod === "function" ? mod : mod.default || mod.pdfParse;
    if (typeof pdfParse === "function") {
      console.log(`✓ pdf-parse loaded from ${p}`);
      break;
    }
  } catch (e) {
    importErrors.push(`${p}: ${e.message.slice(0, 100)}`);
  }
}
if (typeof pdfParse !== "function") {
  console.error("❌ Falhou carregar pdf-parse. Erros:");
  importErrors.forEach((e) => console.error("  - " + e));
  console.error("\nTenta:");
  console.error("    npm install pdf-parse@1.1.1");
  process.exit(1);
}

const BASE = "https://www.lgpidf.com";

/* Lista de slugs descoberta no /competitions/jeunes/ */
const SLUGS = [
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
];

/* Tipo do PDF (regulamento, anexo, resultado intermédio, resultado final, lista, etc.) */
function classifyPdf(filename) {
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

/* Categorização por sufixo do PDF */
function categoryFromPdfName(filename) {
  const f = filename.toLowerCase();
  // Order matters — check most specific first
  if (/u10f|u10-f/i.test(f)) return "U10 Filles";
  if (/u10g|u10-g/i.test(f)) return "U10 Garçons";
  if (/u12f|u12-f/i.test(f)) return "U12 Filles";
  if (/u12g|u12-g/i.test(f)) return "U12 Garçons";
  if (/u14f|u14-f/i.test(f)) return "U14 Filles";
  if (/u14g|u14-g/i.test(f)) return "U14 Garçons";
  if (/-bf[-.]|benjamines/i.test(f)) return "Benjamines";
  if (/-bg[-.]|benjamins/i.test(f)) return "Benjamins";
  if (/-mf[-.]|minimes-fille/i.test(f)) return "Minimes Filles";
  if (/-mg[-.]|minimes-garcon/i.test(f)) return "Minimes Garçons";
  if (/u10|u-10/i.test(f)) return "U10";
  if (/u8|u-8/i.test(f)) return "U8";
  return null;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0 lgpidf-scraper" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(fetchUrl(res.headers.location));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    }).on("error", reject);
  });
}

/* Listar PDFs `resultats-*-t2` para um slug */
async function findResultPdfs(slug) {
  const url = `${BASE}/fr/competition/${slug}/`;
  const r = await fetchUrl(url);
  if (r.status !== 200) return [];
  const html = r.body.toString("utf-8");
  // Match TODOS os PDFs (regulamentos, listas, resultados, etc.)
  const all = [...new Set([...html.matchAll(/\/models\/gallerymedia\/assets\/[^\s"'<>]+\.pdf/gi)].map((m) => m[0]))];
  return all.map((p) => ({ url: BASE + p, filename: p.split("/").pop(), kind: classifyPdf(p) }));
}

/* Parse PDF buffer → texto */
async function parsePdf(buffer) {
  const data = await pdfParse(buffer);
  return data.text;
}

/* Extrair leaderboard de texto PDF lgpidf.
   Formato observado (sem espaços entre colunas):
     "11BADATE, FarahBASSIN BLEU5,67979158"  → pos=1, prix=1, name="BADATE, Farah", club="BASSIN BLEU", index=5.6, tour1=79, tour2=79, total=158
     "4---LEBLOND, SofiaST NOM LA BRETECHE14,89081171" → pos=4, prix=---, name="LEBLOND, Sofia", ...
     "15---TARDIEU, EmmaBUSSY20,993d---93d" → DSQ (93d / --- / 93d)
*/
function extractLeaderboard(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);
  const players = [];
  for (const line of lines) {
    // Skip headers, footers, totais
    if (/^(Pos\.|Page|Total|Format|Nombre|Liste|Grand Prix|GOLF|Score|Simple|Dames|Messieurs|U\d+|Benjamin|Minim|\d{2}\.\d{2}\.\d{4})/i.test(line)) continue;
    // Pattern: pos(1-3) prix(digits|---) name(APELIDO, Nome) club(UPPER) index(N,N) t1(NN[d]?) t2(NN[d]?|---) total(NNN|Nd)
    const m = line.match(
      /^(\d{1,3})(\d{1,3}|-{2,3})([A-ZÀ-Ý][A-ZÀ-Ý' \-]+,\s*[A-Za-zÀ-ÿ\-'. ]+?)([A-ZÀ-Ý][A-ZÀ-Ý' \-/]{2,40}?)(\d{1,2},\d)(\d{2,3}d?|-{3})(\d{2,3}d?|-{3})(\d{2,4}|-{3}|\d+d)$/
    );
    if (m) {
      const pos = parseInt(m[1], 10);
      const prix = m[2] === "---" ? null : parseInt(m[2], 10);
      const name = m[3].replace(/,\s*/, " ").replace(/\s+/g, " ").trim(); // "APELIDO Nome"
      const club = m[4].replace(/\s+/g, " ").trim();
      const hcp = parseFloat(m[5].replace(",", "."));
      const t1Raw = m[6];
      const t2Raw = m[7];
      const totalRaw = m[8];
      const r1 = /^\d+d?$/.test(t1Raw) ? parseInt(t1Raw, 10) : null;
      const r2 = /^\d+d?$/.test(t2Raw) ? parseInt(t2Raw, 10) : null;
      const total = /^\d+d?$/.test(totalRaw) ? parseInt(totalRaw, 10) : null;
      const dnf = /d/.test(t1Raw) || /d/.test(t2Raw) || /d/.test(totalRaw);
      players.push({
        pos, prix, name, club, hcp, r1, r2, total, dnf,
      });
      continue;
    }
    // Pattern simplificado: 1 ronda só (sem t1/t2 distintos, total = score)
    // "11BADATE, FarahBASSIN BLEU5,679" → pos=1, total=79
    const m1r = line.match(
      /^(\d{1,3})(\d{1,3}|-{2,3})([A-ZÀ-Ý][A-ZÀ-Ý' \-]+,\s*[A-Za-zÀ-ÿ\-'. ]+?)([A-ZÀ-Ý][A-ZÀ-Ý' \-/]{2,40}?)(\d{1,2},\d)(\d{2,3}d?)$/
    );
    if (m1r) {
      const pos = parseInt(m1r[1], 10);
      const prix = m1r[2] === "---" ? null : parseInt(m1r[2], 10);
      const name = m1r[3].replace(/,\s*/, " ").replace(/\s+/g, " ").trim();
      const club = m1r[4].replace(/\s+/g, " ").trim();
      const hcp = parseFloat(m1r[5].replace(",", "."));
      const total = parseInt(m1r[6], 10);
      players.push({
        pos, prix, name, club, hcp, r1: total, total, roundScores: [total], dnf: /d$/.test(m1r[6]),
      });
    }
  }
  return players;
}

/* Inferir ano e título do slug */
function parseSlug(slug) {
  // slug examples:
  // grand-prix-jeunes-de-la-ligue-paris-ile-de-france-1-u12-benjamins-1
  // championnat-de-ligue-u12-trophee-pascale-bourson-5
  let title = slug
    .split("-")
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(" ")
    .replace(/\bDe\b/g, "de")
    .replace(/\bLa\b/g, "la")
    .replace(/\bDu\b/g, "du");
  // Try to extract year (assume 2026 if no info)
  return { title };
}

/* Main scrape para 1 slug */
async function scrapeOne(slug, opts = {}) {
  console.log(`\n🏌️  ${slug}`);
  const pdfs = await findResultPdfs(slug);
  if (!pdfs.length) {
    console.log("   ⚠ sem PDFs disponíveis");
    return null;
  }
  console.log(`   ${pdfs.length} PDFs (kinds: ${[...new Set(pdfs.map(p => p.kind))].join(", ")})`);
  // Save todos os PDFs raw em public/data/ffgolf-pdfs/{slug}/
  const rawDir = path.resolve(__dirname, "../public/data/ffgolf-pdfs", slug);
  if (opts.savePdfs) {
    if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });
  }
  const courses = [];
  for (const pdf of pdfs) {
    const cat = categoryFromPdfName(pdf.filename);
    try {
      const r = await fetchUrl(pdf.url);
      if (r.status !== 200) {
        console.log(`     ⚠ HTTP ${r.status} para ${pdf.filename.slice(0, 50)}`);
        continue;
      }
      // Save raw PDF
      if (opts.savePdfs) {
        fs.writeFileSync(path.join(rawDir, pdf.filename), r.body);
      }
      // Só parse se for tipo "resultados"
      if (!/^resultats|^classement|^finaux/i.test(pdf.kind)) {
        console.log(`   ▷ skip parse (${pdf.kind}): ${pdf.filename.slice(0, 50)}`);
        continue;
      }
      if (!cat) {
        console.log(`   ▷ skip (cat indef): ${pdf.filename.slice(0, 60)}`);
        continue;
      }
      console.log(`   ▶ ${cat} — ${pdf.filename.slice(0, 60)}`);
      const text = await parsePdf(r.body);
      const players = extractLeaderboard(text);
      console.log(`     ${players.length} jogadores (PDF text length: ${text.length})`);
      courses.push({
        category: cat,
        pdfFilename: pdf.filename,
        pdfUrl: pdf.url,
        rawTextLength: text.length,
        players,
      });
    } catch (e) {
      console.log(`     ❌ ${e.message.slice(0, 50)}`);
    }
  }
  if (!courses.length) return null;
  // Inferir ano do nome do slug ou hoje
  const yearGuess = (() => {
    for (const c of courses) {
      const ym = c.pdfFilename.match(/^(20\d{2})/);
      if (ym) return parseInt(ym[1], 10);
    }
    return new Date().getFullYear();
  })();
  const { title } = parseSlug(slug);
  return {
    tournament: title,
    slug,
    year: yearGuess,
    section: "lgpidf",
    source: `${BASE}/fr/competition/${slug}/`,
    scrapedAt: new Date().toISOString(),
    courseLevel: "regional-paris-idf",
    course: { name: "Paris IdF (vários)", tee: "", par: [], meters: [], si: [], parTotal: 0, metersTotal: 0 },
    rounds: courses[0]?.players?.[0]?.r2 != null ? 2 : 1,
    format: "PDF-only (sem hole-by-hole)",
    divisions: courses.map((c) => c.category),
    courses, // estrutura nova: cada categoria é uma "divisão"
    // Vista plana de jogadores
    players: courses.flatMap((c) =>
      c.players.map((p) => ({
        ...p,
        division: c.category,
        country: "FR",
        rounds: p.r1 != null && p.r2 != null
          ? [
              { round: 1, gross: p.r1, scores: [], f9: 0, b9: 0 },
              { round: 2, gross: p.r2, scores: [], f9: 0, b9: 0 },
            ]
          : [],
        roundScores: p.r1 != null ? [p.r1, p.r2].filter((x) => x != null) : [p.total],
        toPar: null, // sem par disponível
      }))
    ),
  };
}

(async () => {
  const args = process.argv.slice(2);
  let targets = SLUGS;
  if (args.includes("--slug")) {
    const idx = args.indexOf("--slug");
    targets = [args[idx + 1]];
  }
  // Default: SAVE PDFs sempre (pode-se desactivar com --no-save-pdfs)
  const savePdfs = !args.includes("--no-save-pdfs");
  console.log(`📄 lgpidf PDF scraper — ${targets.length} torneios${savePdfs ? " (a guardar PDFs raw)" : ""}`);
  const outDir = path.resolve(__dirname, "../public/data/ffgolf");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  let ok = 0;
  for (const slug of targets) {
    try {
      const result = await scrapeOne(slug, { savePdfs });
      if (!result) continue;
      const outPath = path.join(outDir, `lgpidf-${result.year}-${slug.slice(0, 60)}.json`);
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");
      console.log(`   💾 ${outPath} (${result.players.length} jogadores)`);
      ok++;
    } catch (e) {
      console.error(`   ❌ ${slug}: ${e.message}`);
    }
  }
  console.log(`\n✅ ${ok}/${targets.length} OK`);
  if (savePdfs) console.log(`📂 PDFs raw em public/data/ffgolf-pdfs/{slug}/`);
})();
