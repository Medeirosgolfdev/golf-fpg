/**
 * scripts/parse-nextcaddy-pdfs.js
 *
 * Item #1 (NextCaddy). O RFEGolf já parseia os seus PDFs (parseLeaderboardPdfText
 * em scrape-rfegolf-node.js); o que faltava era o NextCaddy. Muitos torneios NC
 * publicam o leaderboard final SÓ em PDF (`leaderboardPdfOnly: true`), mas trazem
 * os URLs em `pdfs[]`. Este script descarrega esses PDFs, extrai o texto e tenta
 * montar um leaderboard.
 *
 * ⚠ SEGURANÇA / VALIDAÇÃO:
 *   - Escreve num campo SEPARADO `pdfLeaderboard` — NUNCA toca em `leaderboard`.
 *     Assim nunca corrompe os dados bons; a UI pode optar por mostrá-lo.
 *   - O parser é uma PRIMEIRA aproximação. Os PDFs das federações têm layouts
 *     variados; antes de confiar, correr com `--dump` para VER o texto real e
 *     afinar `parsePdfLeaderboard()`. NÃO está ligado ao cron (update-spain.yml)
 *     de propósito — correr à mão até estar validado.
 *
 * USO:
 *   node scripts/parse-nextcaddy-pdfs.js --limit 3 --dump        # ver texto de 3 PDFs
 *   node scripts/parse-nextcaddy-pdfs.js --ids 48140,48141 --verbose
 *   node scripts/parse-nextcaddy-pdfs.js --limit 20 --dry        # tenta parsear, não grava
 *   node scripts/parse-nextcaddy-pdfs.js                          # tudo (só-PDF com URL)
 *
 * Exit codes: 0 = parseou algo (commit), 2 = nada parseado, 1 = erro.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const NC_DIR = path.resolve(__dirname, "../public/data/nextcaddy");
const BASE = "https://www.nextcaddy.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const args = process.argv.slice(2);
const getArg = (n, def) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : def; };
const DUMP = args.includes("--dump");
const DRY = args.includes("--dry");
const VERBOSE = args.includes("--verbose") || DUMP;
const LIMIT = parseInt(getArg("limit", "0"), 10) || Infinity;
const ONLY_IDS = (getArg("ids", "") || "").split(",").map((s) => s.trim()).filter(Boolean);

let _pdfParse = null;
function getPdfParse() {
  if (!_pdfParse) {
    try { _pdfParse = require("pdf-parse/lib/pdf-parse.js"); }
    catch (e) { _pdfParse = null; }
  }
  return _pdfParse;
}

function httpGetBuffer(urlStr, retries = 2) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const u = new URL(urlStr);
      const req = https.request({
        method: "GET", hostname: u.hostname, path: u.pathname + u.search,
        headers: { "User-Agent": UA, "Accept": "application/pdf,*/*" }, timeout: 30000,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          httpGetBuffer(new URL(res.headers.location, urlStr).toString(), retries).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) { res.resume(); reject(new Error("HTTP " + res.statusCode)); return; }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      });
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", (e) => { if (n < retries) setTimeout(() => attempt(n + 1), 1000 * (n + 1)); else reject(e); });
      req.end();
    };
    attempt(0);
  });
}

/** Escolhe o(s) PDF(s) de RESULTADOS (não o regulamento) a partir dos nomes. */
function pickResultPdfs(pdfs) {
  const norm = (s) => s.toLowerCase();
  const isResult = (p) => /clasif|resultad|general|scratch|liguilla|ranking|final/.test(norm(p));
  const isRules = (p) => /reglament|reglamento|c\.\d|convocator|invitac|circular|bases/.test(norm(p));
  const results = pdfs.filter((p) => isResult(p) && !isRules(p));
  if (results.length) return results;
  // Sem pista no nome → tentar os que NÃO parecem regulamento.
  const notRules = pdfs.filter((p) => !isRules(p));
  return notRules.length ? notRules : pdfs;
}

/**
 * Parser do texto do PDF → linhas de leaderboard.
 * ⚠ PRIMEIRA APROXIMAÇÃO genérica — afinar contra `--dump` de PDFs reais.
 * Heurística: procura linhas com posição + nome + total (e opcional ±par).
 * Devolve { players:[{pos,name,total,toPar}], confidence } ou null.
 */
function parsePdfLeaderboard(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const players = [];
  // Padrões tentados (ordem de preferência):
  //  A) "1 APELLIDOS, Nombre  CLUB  72 71 143 -1"  → pos, nome, ..., total, ±par
  //  B) "1 APELLIDOS, Nombre  143"                 → pos, nome, total
  const reA = /^(\d{1,3})\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'.\- ]+?,\s*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'.\- ]+?)\s+.*?\s(\d{2,3})\s*([+\-]\d{1,2}|E|=)?\s*$/;
  const reB = /^(\d{1,3})\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'.\- ]+?,\s*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'.\- ]+?)\s+(\d{2,3})\s*$/;
  for (const ln of lines) {
    let m = reA.exec(ln) || reB.exec(ln);
    if (!m) continue;
    const pos = parseInt(m[1], 10);
    const name = m[2].trim();
    const total = parseInt(m[3], 10);
    if (!name || total < 50 || total > 200) continue; // sanidade
    let toPar = null;
    if (m[4]) { const t = m[4]; toPar = (t === "E" || t === "=") ? 0 : parseInt(t, 10); }
    players.push({ pos, name, total, toPar });
  }
  if (players.length < 5) return null; // conservador: poucos = parse pouco fiável
  // Confiança: posições crescentes e totais ordenados?
  const ordered = players.every((p, i) => i === 0 || p.total >= players[i - 1].total);
  return { players, confidence: ordered ? "medium" : "low" };
}

function listFiles() {
  if (!fs.existsSync(NC_DIR)) { console.error("public/data/nextcaddy não existe."); process.exit(1); }
  let files = fs.readdirSync(NC_DIR).filter((f) => /^\d+\.json$/.test(f));
  if (ONLY_IDS.length) files = files.filter((f) => ONLY_IDS.includes(f.replace(".json", "")));
  return files;
}

async function main() {
  const pdfParse = getPdfParse();
  if (!pdfParse) { console.error("pdf-parse não disponível (npm ci?)."); process.exit(1); }

  const files = listFiles();
  let parsed = 0, tried = 0, noPdf = 0, failed = 0;

  for (const file of files) {
    if (tried >= LIMIT) break;
    const fpath = path.join(NC_DIR, file);
    let j;
    try { j = JSON.parse(fs.readFileSync(fpath, "utf8")); } catch { failed++; continue; }
    // Só torneios sem leaderboard estruturado e com PDFs.
    const hasLb = (j.leaderboard || []).some((c) => (c.players || []).length > 0);
    const urls = (j.pdfs || []).filter(Boolean);
    if (hasLb || !urls.length) { noPdf++; continue; }

    tried++;
    const candidates = pickResultPdfs(urls).map((p) => (p.startsWith("http") ? p : BASE + p).replace(/&amp;/g, "&"));
    let best = null;
    for (const url of candidates) {
      try {
        const buf = await httpGetBuffer(url);
        const data = await pdfParse(buf);
        if (DUMP) {
          console.log("\n===== " + file + " :: " + url + " =====");
          console.log((data.text || "").slice(0, 2500));
          continue;
        }
        const lb = parsePdfLeaderboard(data.text);
        if (lb && (!best || lb.players.length > best.players.length)) { best = { ...lb, url }; }
      } catch (e) {
        if (VERBOSE) console.log("  " + file + " :: " + url + " — falhou: " + e.message);
      }
    }
    if (DUMP) continue;
    if (best) {
      j.pdfLeaderboard = {
        source: best.url, parsedAt: new Date().toISOString(),
        confidence: best.confidence, players: best.players,
      };
      if (!DRY) fs.writeFileSync(fpath, JSON.stringify(j, null, 2));
      parsed++;
      if (VERBOSE) console.log("  " + file + ": " + best.players.length + " jog (" + best.confidence + ") <- " + best.url.split("/").pop());
    } else if (VERBOSE) {
      console.log("  " + file + ": sem parse fiável");
    }
  }

  if (DUMP) { console.log("\n(--dump: só impressão, nada gravado)"); return; }
  console.log("\nNextCaddy PDF parse: " + parsed + " torneios parseados, " + tried + " tentados, " + failed + " erros, " + noPdf + " sem PDF/já com lb");
  if (DRY) console.log("(--dry: nada gravado)");
  process.exitCode = parsed > 0 ? 0 : 2;
}

main().catch((e) => { console.error(e); process.exit(1); });
