/**
 * scripts/scrape-nextcaddy-horarios.js
 *
 * Scrape do tab "horarios" (tee times / Draw saída) do NextCaddy.
 * Endpoint: POST /getListadoHorarios (body: id=N) → HTML.
 *
 * Output: actualiza public/data/nextcaddy/{id}.json adicionando o campo
 *   `horarios: [{ round: 1, players: [{ time, tee, name, hcp, jid }, ...] }, ...]`
 *
 * Uso:
 *   node scripts/scrape-nextcaddy-horarios.js --tour 61131
 *   node scripts/scrape-nextcaddy-horarios.js --scope scripts/nextcaddy-juvenil-need-scorecards.json
 *   node scripts/scrape-nextcaddy-horarios.js --all       # processa todos os JSONs em public/data/nextcaddy/
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const NC_DIR = path.resolve(__dirname, "../public/data/nextcaddy");
const BASE = "https://www.nextcaddy.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const AGENT = new https.Agent({ keepAlive: true, maxSockets: 8, keepAliveMsecs: 5000 });

function postHorarios(tourId) {
  return new Promise((resolve, reject) => {
    const body = `id=${tourId}`;
    const url = new URL(`${BASE}/getListadoHorarios`);
    const req = https.request({
      method: "POST",
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Content-Length": Buffer.byteLength(body),
        "X-Requested-With": "XMLHttpRequest",
        "Referer": `${BASE}/tour/${tourId}`,
      },
      timeout: 25000,
      agent: AGENT,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString("utf-8"),
      }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    req.write(body);
    req.end();
  });
}

/* ─── parser ──────────────────────────────────────────────────── */

/** Extrair texto de uma tag (remove HTML interno). */
function stripTags(s) {
  return (s || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function parseHorariosHtml(html) {
  // Cada ronda aparece num bloco delimitado por <h4 ... data-table-index="N"> seguido
  // de uma <table>. Encontrar todas as combinações.
  const rounds = [];
  // Simplificação: dividir o HTML por dataset-index headers
  const headerRe = /<h4[^>]*data-table-index="(\d+)"/g;
  const splits = [];
  let m;
  while ((m = headerRe.exec(html)) !== null) {
    splits.push({ round: parseInt(m[1], 10), idx: m.index });
  }
  for (let i = 0; i < splits.length; i++) {
    const start = splits[i].idx;
    const end = i + 1 < splits.length ? splits[i + 1].idx : html.length;
    const segment = html.slice(start, end);

    const players = [];
    let lastTime = null;
    let lastTee = null;
    // <tr class="gradeX..."> ... </tr> — só os principais (ignorar trFormula nested)
    const trRe = /<tr class="gradeX[^"]*">([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = trRe.exec(segment)) !== null) {
      const row = rowMatch[1];
      // time: <td class="negrita"> ... <span class="visibleSearch">10:00</span> ... </td>
      const tdNegrita = /<td class="negrita">([\s\S]*?)<\/td>/.exec(row);
      let time = null;
      if (tdNegrita) {
        const visibleSearchM = /<span class="visibleSearch">\s*([0-9:]+)\s*<\/span>/.exec(tdNegrita[1]);
        if (visibleSearchM) time = visibleSearchM[1];
      }
      // tee: <td class="mobile hidden center aligned"> ... <span class="visibleSearch">1</span> ... </td>
      const tdTee = /<td class="mobile hidden center aligned">([\s\S]*?)<\/td>/.exec(row);
      let tee = null;
      if (tdTee) {
        const teeM = /<span class="visibleSearch">\s*(\d+)\s*<\/span>/.exec(tdTee[1]);
        if (teeM) tee = parseInt(teeM[1], 10);
      }
      // Continuation rows (mesma flight) não têm time/tee — herdar da linha anterior
      if (time) lastTime = time;
      else time = lastTime;
      if (tee != null) lastTee = tee;
      else tee = lastTee;

      // nome: <td class="nombre-horario" data-ins="X" data-jid="Y"> <div> NOME </div>
      const nameM = /<td class="nombre-horario"\s+data-ins="(\d+)"\s+data-jid="(\d+)">([\s\S]*?)<\/td>/.exec(row);
      if (!nameM) continue;
      const ins = nameM[1];
      const jid = nameM[2];
      // Extrair nome do conteúdo (primeiro <div>...</div>)
      const nameInner = /<div[^>]*>([\s\S]*?)(?:<\/div>|$)/.exec(nameM[3]);
      const name = stripTags(nameInner ? nameInner[1] : nameM[3]);
      // hcp: <td class="right aligned"> 4.7 ... </td>
      const hcpM = /<td class="right aligned">\s*([+\-]?[0-9.]+)/.exec(row);
      const hcp = hcpM ? parseFloat(hcpM[1]) : null;
      // nivel: <td class="disabled center aligned mostrarNivel..."> A </td>
      const nivelM = /<td class="disabled center aligned mostrarNivel[^"]*">\s*([A-Z0-9]+)/.exec(row);
      const nivel = nivelM ? nivelM[1].trim() : null;

      players.push({ time, tee, name, hcp, ins, jid, nivel });
    }
    if (players.length > 0) {
      rounds.push({ round: splits[i].round, players });
    }
  }
  return rounds;
}

/* ─── orchestration ──────────────────────────────────────────── */

async function processTour(tourId) {
  const r = await postHorarios(tourId);
  if (r.status !== 200) {
    return { tourId, ok: false, error: `HTTP ${r.status}`, rounds: [] };
  }
  const rounds = parseHorariosHtml(r.body);
  return { tourId, ok: true, rounds };
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (n, def) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : (def === undefined ? null : def); };
  const tourArg = getArg("tour");
  const scopeArg = getArg("scope");
  const allFlag = args.includes("--all");
  const skipExisting = args.includes("--skip-existing");
  const concurrency = parseInt(getArg("concurrency", "4"), 10);

  let tourIds = [];
  if (tourArg) tourIds = tourArg.split(",").map((s) => parseInt(s.trim(), 10));
  if (scopeArg) {
    const sc = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), scopeArg), "utf8"));
    const list = sc.tours || sc;
    tourIds = list.map((t) => t.tourId || t.id || t).filter(Boolean);
  }
  if (allFlag) {
    tourIds = fs.readdirSync(NC_DIR)
      .filter(f => /^\d+\.json$/.test(f))
      .map(f => parseInt(f.replace(".json", ""), 10));
  }
  if (tourIds.length === 0) {
    console.log("Uso: --tour N | --scope path.json | --all  [--concurrency N] [--skip-existing]");
    process.exit(1);
  }

  console.log(`Scrape NC horarios: ${tourIds.length} tours, concurrency=${concurrency}`);
  let ok = 0, fail = 0, skipped = 0, withData = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < tourIds.length) {
      const tid = tourIds[cursor++];
      const outFile = path.join(NC_DIR, `${tid}.json`);
      if (!fs.existsSync(outFile)) { fail++; continue; }
      try {
        let existing = JSON.parse(fs.readFileSync(outFile, "utf-8"));
        if (skipExisting && Array.isArray(existing.horarios) && existing.horarios.length > 0) {
          skipped++;
          continue;
        }
        const r = await processTour(tid);
        if (!r.ok) { fail++; continue; }
        existing.horarios = r.rounds;
        existing.horariosScrapedAt = new Date().toISOString();
        fs.writeFileSync(outFile, JSON.stringify(existing, null, 2), "utf-8");
        ok++;
        if (r.rounds.length > 0 && r.rounds.some(rd => rd.players.length > 0)) withData++;
        const sample = r.rounds.length > 0 ? `${r.rounds.length} rondas, ${r.rounds[0].players.length} jog R1` : "vazio";
        console.log(`  [${cursor}/${tourIds.length}] ${tid}: ${sample}`);
      } catch (e) {
        fail++;
        console.warn(`  [${cursor}/${tourIds.length}] ${tid}: ERRO ${e.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  console.log(`Done: ok=${ok} fail=${fail} skipped=${skipped} withData=${withData}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
