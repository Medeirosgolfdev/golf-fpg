#!/usr/bin/env node
/**
 * update-jogadores.js — Download perfis de jogadores DRIVE
 *
 * SITE: scoring.fpg.pt ou my.fpg.pt (NÃO funciona em datagolf!)
 *
 * Uso:
 *   node update-jogadores.js --new              # Só jogadores sem perfil
 *   node update-jogadores.js --refresh           # Todos, mas salta se nada mudou
 *   node update-jogadores.js --force             # Re-descarregar tudo
 *   node update-jogadores.js --feds 47078 59252  # Jogadores específicos
 *
 * Depois cola no browser (scoring.fpg.pt, F12 Console):
 *   fetch("http://localhost:3456/browser-script.js").then(r=>r.text()).then(eval)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PORT = 3456;
const BATCH_SIZE = 20;
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", B = "\x1b[1m", D = "\x1b[2m", X = "\x1b[0m";

// ── Parse args ──
const args = process.argv.slice(2);
let mode = "new"; // new | refresh | force
let concurrency = 8;
const explicitFeds = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--new")           { mode = "new"; continue; }
  if (a === "--refresh")       { mode = "refresh"; continue; }
  if (a === "--force")         { mode = "force"; continue; }
  if (a === "--concurrency")   { concurrency = parseInt(args[++i]) || 8; continue; }
  if (a === "--feds")          { while (i + 1 < args.length && /^\d+$/.test(args[i + 1])) explicitFeds.push(args[++i]); continue; }
  if (/^\d+$/.test(a))         { explicitFeds.push(a); continue; }
}

// ── Load drive-data.json to find DRIVE players ──
const driveDataPath = path.join(process.cwd(), "public", "data", "drive-data.json");
const playersJsonPath = path.join(process.cwd(), "players.json");
const playersDB = fs.existsSync(playersJsonPath) ? JSON.parse(fs.readFileSync(playersJsonPath, "utf-8")) : {};

let playerFeds = [];

if (explicitFeds.length > 0) {
  playerFeds = explicitFeds;
} else if (fs.existsSync(driveDataPath)) {
  const drive = JSON.parse(fs.readFileSync(driveDataPath, "utf-8"));
  const allFeds = new Set();
  for (const t of drive.tournaments) {
    for (const p of t.players) {
      if (p.fed) allFeds.add(p.fed);
    }
  }

  if (mode === "new") {
    playerFeds = [...allFeds].filter(f => !playersDB[f]);
    console.log(`  ${D}Jogadores nos torneios: ${allFeds.size} | Em players.json: ${Object.keys(playersDB).length} | Novos: ${playerFeds.length}${X}`);
  } else {
    playerFeds = [...allFeds];
  }
} else {
  console.error(`${R}drive-data.json não encontrado! Corre primeiro: node update-torneios.js${X}`);
  process.exit(1);
}

if (playerFeds.length === 0) {
  console.log(`${G}Nenhum jogador novo para descarregar.${X}`);
  process.exit(0);
}

// ── State ──
let playerIdx = 0;
let startTime = Date.now();
let stats = { processed: 0, skipped: 0, newScorecards: 0 };

function getExistingScoreIds(fed) {
  const dir = path.join(process.cwd(), "output", fed, "scorecards");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => f.replace(".json", ""));
}

function getExistingWHSCount(fed) {
  const p = path.join(process.cwd(), "output", fed, "whs-list.json");
  if (!fs.existsSync(p)) return 0;
  try { return JSON.parse(fs.readFileSync(p, "utf-8"))?.Records?.length || 0; } catch { return 0; }
}

function collectBody(req, cb) {
  let body = ""; req.on("data", c => body += c); req.on("end", () => cb(body));
}

// ── Server ──
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // GET /next-task
  if (req.method === "GET" && req.url === "/next-task") {
    if (playerIdx >= playerFeds.length) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ done: true }));
      return;
    }
    const fed = playerFeds[playerIdx];
    const existing = mode === "force" ? [] : getExistingScoreIds(fed);
    const oldWHS = getExistingWHSCount(fed);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ done: false, fed, index: playerIdx, total: playerFeds.length, existingScoreIds: existing, oldWHSCount: oldWHS, refresh: mode === "refresh", force: mode === "force", concurrency }));
    playerIdx++;
    return;
  }

  // POST /save-whs
  if (req.method === "POST" && req.url === "/save-whs") {
    collectBody(req, (body) => {
      try {
        const { fed, data, count } = JSON.parse(body);
        const outDir = path.join(process.cwd(), "output", fed);
        fs.mkdirSync(outDir, { recursive: true });
        const records = data?.Records || [];
        for (const r of records) {
          if (!r.score_id && r.id) r.score_id = r.id;
          if (!r.id && r.score_id) r.id = r.score_id;
        }
        fs.writeFileSync(path.join(outDir, "whs-list.json"), JSON.stringify(data, null, 2), "utf-8");
        process.stdout.write(`  ${G}✓${X} [${fed}] WHS: ${count}\n`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // POST /save-scorecards-batch
  if (req.method === "POST" && req.url === "/save-scorecards-batch") {
    collectBody(req, (body) => {
      try {
        const { fed, scorecards } = JSON.parse(body);
        const dir = path.join(process.cwd(), "output", fed, "scorecards");
        fs.mkdirSync(dir, { recursive: true });
        let saved = 0;
        for (const [id, data] of Object.entries(scorecards)) {
          fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data, null, 2), "utf-8");
          saved++;
        }
        stats.newScorecards += saved;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, saved }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // POST /player-done
  if (req.method === "POST" && req.url === "/player-done") {
    collectBody(req, (body) => {
      try {
        const { fed, skipped, scOk } = JSON.parse(body);
        const pct = ((playerIdx / playerFeds.length) * 100).toFixed(0);
        if (skipped) {
          stats.skipped++;
          process.stdout.write(`  ${D}[${playerIdx}/${playerFeds.length}] ${pct}% · [${fed}] saltado${X}\n`);
        } else {
          stats.processed++;
          process.stdout.write(`  ${D}[${playerIdx}/${playerFeds.length}] ${pct}% · [${fed}] +${scOk || 0} SC${X}\n`);
        }
      } catch {}
      res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // POST /all-done
  if (req.method === "POST" && req.url === "/all-done") {
    res.writeHead(200); res.end(JSON.stringify({ ok: true }));

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n${B}═══ Download concluído (${elapsed} min) ═══${X}`);
    console.log(`  Processados: ${stats.processed} | Saltados: ${stats.skipped} | SC novos: ${stats.newScorecards}`);

    // Run pipeline
    console.log(`\n${B}A processar dados...${X}`);
    try {
      execSync(`node golf-all.js --skip-download ${playerFeds.join(" ")}`, { stdio: "inherit", cwd: process.cwd(), maxBuffer: 50 * 1024 * 1024 });
    } catch { console.log(`${Y}⚠ Pipeline com erros (parcial)${X}`); }

    // Build SD lookup
    console.log(`\n${B}A construir SD lookup...${X}`);
    try {
      execSync(`node build-drive-sd-lookup.js`, { stdio: "inherit", cwd: process.cwd() });
    } catch { console.log(`${Y}⚠ SD lookup com erros${X}`); }

    console.log(`\n${G}${B}✓ TUDO CONCLUÍDO!${X}`);
    setTimeout(() => { server.close(); process.exit(0); }, 1000);
    return;
  }

  // GET /browser-script.js
  if (req.method === "GET" && req.url === "/browser-script.js") {
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(BROWSER_SCRIPT);
    return;
  }

  res.writeHead(404); res.end("Not found");
});

/* ── Browser Script ── */
const BROWSER_SCRIPT = `
(async () => {
  const SERVER = "http://localhost:${PORT}";
  const BATCH_SIZE = ${BATCH_SIZE};

  const log = (m) => console.log("%c[JOGADORES] " + m, "color:#2563eb;font-weight:bold");
  const logOk = (m) => console.log("%c[JOGADORES] " + m, "color:green;font-weight:bold;font-size:14px");
  const logErr = (m) => console.log("%c[JOGADORES] " + m, "color:red;font-weight:bold");

  // SAFETY: Check site
  if (location.host.includes("datagolf")) {
    logErr("⚠ SITE ERRADO! Jogadores só funcionam em scoring.fpg.pt ou my.fpg.pt");
    return;
  }
  if (!location.host.includes("fpg")) {
    logErr("⚠ Site não reconhecido! Usa scoring.fpg.pt ou my.fpg.pt");
    return;
  }

  const isMy = location.host.includes("my.fpg");
  log("A iniciar download de jogadores em " + location.host);
  const t0 = Date.now();

  const fpgPost = async (endpoint, params) => {
    const qs = Object.entries(params).map(([k,v]) => k + "=" + encodeURIComponent(v)).join("&");
    const url = endpoint + "?" + qs;
    const bodyObj = {};
    for (const [k,v] of Object.entries(params)) bodyObj[k] = String(v);

    if (isMy && window.jQuery) {
      return new Promise(resolve => {
        window.jQuery.ajax({ url, type: "POST", contentType: "application/json; charset=utf-8", dataType: "json",
          data: JSON.stringify(bodyObj),
          success: data => resolve({ ok: true, data: data?.d ?? data }),
          error: () => resolve({ ok: false })
        });
      });
    }
    return fetch(url, { method: "POST", headers: { "x-requested-with": "XMLHttpRequest", "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(bodyObj) })
      .then(async r => { if (r.status !== 200) return { ok: false }; const j = await r.json(); return { ok: true, data: j?.d ?? j }; })
      .catch(() => ({ ok: false }));
  };

  while (true) {
    let task;
    try { task = await (await fetch(SERVER + "/next-task")).json(); }
    catch (e) { logErr("Servidor: " + e.message); break; }

    if (task.done) {
      logOk("CONCLUÍDO em " + Math.round((Date.now() - t0) / 60000) + " min!");
      await fetch(SERVER + "/all-done", { method: "POST" });
      break;
    }

    const { fed, index, total, existingScoreIds, oldWHSCount, refresh, force, concurrency } = task;
    const existingSet = new Set(existingScoreIds);
    const ppParams = isMy ? { pp: "N" } : {};

    log("[" + (index + 1) + "/" + total + "] Fed " + fed);

    // WHS list
    const hcpRecords = [];
    let hcpIdx = 0, hcpOk = true;
    while (true) {
      const res = await fpgPost("PlayerWHS.aspx/HCPWhsFederLST", { fed_code: fed, ...ppParams, jtStartIndex: hcpIdx, jtPageSize: 100 });
      if (!res.ok || res.data?.Result !== "OK") { hcpOk = false; break; }
      const recs = res.data.Records || [];
      hcpRecords.push(...recs);
      if (recs.length < 100) break;
      hcpIdx += 100;
    }
    for (const r of hcpRecords) { if (!r.score_id && r.id) r.score_id = r.id; if (!r.id && r.score_id) r.id = r.score_id; }
    const hcpIdSet = new Set(hcpRecords.map(r => String(r.score_id || r.id)));

    // Extra results
    let extraRecords = [];
    let startIdx = 0;
    while (true) {
      const res = await fpgPost("PlayerResults.aspx/ResultsLST", { fed_code: fed, ...ppParams, jtStartIndex: startIdx, jtPageSize: 100 });
      if (!res.ok || res.data?.Result !== "OK") break;
      const recs = res.data.Records || [];
      for (const r of recs) { if (!r.score_id && r.id) r.score_id = r.id; if (!r.id && r.score_id) r.id = r.score_id; }
      extraRecords.push(...recs.filter(r => !hcpIdSet.has(String(r.score_id || r.id))));
      if (recs.length < 100) break;
      startIdx += 100;
    }

    const allRecords = [...hcpRecords, ...extraRecords];
    if (!hcpOk || allRecords.length === 0) { log("[" + fed + "] WHS falhou"); await fetch(SERVER + "/player-done", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fed, skipped: true }) }); continue; }

    // Refresh skip
    if (refresh && !force && allRecords.length === oldWHSCount) {
      const newIds = allRecords.filter(r => !existingSet.has(String(r.score_id || r.id)) && r.score_origin_id !== 7);
      if (newIds.length === 0) { await fetch(SERVER + "/player-done", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fed, skipped: true }) }); continue; }
    }

    await fetch(SERVER + "/save-whs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fed, data: { Result: "OK", Records: allRecords }, count: allRecords.length }) });

    // Scorecards
    const toFetch = allRecords.filter(r => r.score_origin_id !== 7 && (force || !existingSet.has(String(r.score_id || r.id))));
    let scOk = 0, batch = {}, batchCount = 0;
    const flush = async () => { if (!batchCount) return; try { await fetch(SERVER + "/save-scorecards-batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fed, scorecards: batch }) }); } catch {} batch = {}; batchCount = 0; };

    for (let i = 0; i < toFetch.length; i += concurrency) {
      const chunk = toFetch.slice(i, i + concurrency);
      const results = await Promise.allSettled(chunk.map(async r => {
        const sid = String(r.score_id || r.id);
        const res = await fpgPost("PlayerResults.aspx/ScoreCard", { score_id: sid, scoringtype: r.scoring_type_id, competitiontype: r.competition_type_id, ...ppParams });
        if (res.ok && res.data?.Result === "OK") return { id: sid, data: res.data };
        return null;
      }));
      for (const r of results) { if (r.status === "fulfilled" && r.value) { batch[r.value.id] = r.value.data; batchCount++; scOk++; if (batchCount >= BATCH_SIZE) await flush(); } }
    }
    await flush();
    await fetch(SERVER + "/player-done", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fed, scOk }) });
  }
})();
`;

server.listen(PORT, () => {
  console.log(`
${B}╔══════════════════════════════════════════════════════╗${X}
${B}║        JOGADORES — Download de Perfis                ║${X}
${B}╠══════════════════════════════════════════════════════╣${X}
${B}║${X}  Modo:       ${(mode === "new" ? "Só novos" : mode === "refresh" ? "Refresh" : "Forçar tudo").padEnd(39)}${B}║${X}
${B}║${X}  Jogadores:  ${String(playerFeds.length).padEnd(39)}${B}║${X}
${B}║${X}  Paralelos:  ${String(concurrency).padEnd(39)}${B}║${X}
${B}╚══════════════════════════════════════════════════════╝${X}

${Y}1. Abre no browser:${X}
   ${G}https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884${X}

${Y}2. F12 → Console → Cola:${X}
   ${G}fetch("http://localhost:${PORT}/browser-script.js").then(r=>r.text()).then(eval)${X}
`);
});
