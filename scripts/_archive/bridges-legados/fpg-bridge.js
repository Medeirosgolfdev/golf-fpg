#!/usr/bin/env node
/**
 * fpg-bridge.js v2 — Download rápido via Firefox
 * 
 * Optimizações vs v1:
 *   - 8 downloads paralelos de scorecards (8x mais rápido)
 *   - Batch save (envia 20 scorecards de uma vez ao servidor)
 *   - Salta jogadores se WHS count não mudou (--refresh)
 *   - --qualif-only: só rondas qualificativas HCP (como antes)
 *
 * Uso:
 *   node fpg-bridge.js [opções] [federados]
 *
 * Opções:
 *   --all           Todos os jogadores do players.json
 *   --priority      Só jogadores prioritários
 *   --refresh       Só scorecards novos (salta se WHS count igual)
 *   --force         Re-descarregar tudo
 *   --qualif-only   Só rondas qualificativas HCP (ignora treinos etc)
 *   --skip-render   Não processar dados depois
 *   --concurrency N Número de downloads paralelos (default: 8)
 *
 * Exemplos:
 *   node fpg-bridge.js --all --refresh                # Todos, só novos
 *   node fpg-bridge.js --all --refresh --qualif-only  # Todos, só novos, só qualif
 *   node fpg-bridge.js --priority --force             # Prioritários, tudo
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── Parse args ──
const args = process.argv.slice(2);
let allFlag = false, priorityFlag = false, refreshFlag = false, forceFlag = false;
let skipRender = false, qualifOnly = false, concurrency = 8;
const fedCodes = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--all")           { allFlag = true; continue; }
  if (a === "--priority")      { priorityFlag = true; continue; }
  if (a === "--refresh")       { refreshFlag = true; continue; }
  if (a === "--force")         { forceFlag = true; continue; }
  if (a === "--skip-render")   { skipRender = true; continue; }
  if (a === "--qualif-only")   { qualifOnly = true; continue; }
  if (a === "--concurrency")   { concurrency = parseInt(args[++i]) || 8; continue; }
  if (/^\d+$/.test(a))        { fedCodes.push(a); continue; }
}

// Load players
if ((allFlag || priorityFlag) && fedCodes.length === 0) {
  const pPath = path.join(process.cwd(), "players.json");
  if (fs.existsSync(pPath)) {
    const db = JSON.parse(fs.readFileSync(pPath, "utf-8"));
    for (const [k, v] of Object.entries(db)) {
      if (allFlag) { fedCodes.push(k); continue; }
      const tags = v.tags || [];
      const esc = v.escalao || "";
      if (tags.includes("pja") || v.region === "Madeira" || esc === "Sub-12" || esc === "Sub-14") {
        fedCodes.push(k);
      }
    }
  }
}

if (fedCodes.length === 0) {
  console.error("Nenhum federado. Usa --all, --priority, ou indica números.");
  process.exit(1);
}

// ── Colors ──
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m", B = "\x1b[1m", D = "\x1b[2m", X = "\x1b[0m";

// ── State ──
const PORT = 3456;
let currentPlayerIdx = 0;
const totalPlayers = fedCodes.length;
let totalNewScorecards = 0;
let totalSkippedPlayers = 0;
let startTime = Date.now();

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

// ── HTTP Server ──
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // GET /next-player
  if (req.method === "GET" && req.url === "/next-player") {
    if (currentPlayerIdx >= fedCodes.length) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ done: true }));
      return;
    }
    const fed = fedCodes[currentPlayerIdx];
    const existing = forceFlag ? [] : getExistingScoreIds(fed);
    const oldWHS = getExistingWHSCount(fed);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      done: false, fed, index: currentPlayerIdx, total: totalPlayers,
      existingScoreIds: existing, oldWHSCount: oldWHS,
      refresh: refreshFlag, force: forceFlag, qualifOnly,
      concurrency
    }));
    currentPlayerIdx++;
    return;
  }

  // POST /save-whs
  if (req.method === "POST" && req.url?.startsWith("/save-whs")) {
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
        const whsPath = path.join(outDir, "whs-list.json");
        const oldCount = getExistingWHSCount(fed);
        fs.writeFileSync(whsPath, JSON.stringify(data, null, 2), "utf-8");
        const diff = count - oldCount;
        const tag = diff > 0 ? `${G}+${diff} novos${X}` : `${D}=${count}${X}`;
        process.stdout.write(`  ${G}\u2713${X} [${fed}] WHS: ${count} (${tag})\n`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // POST /save-scorecards-batch
  if (req.method === "POST" && req.url?.startsWith("/save-scorecards-batch")) {
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
        totalNewScorecards += saved;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, saved }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // POST /player-done
  if (req.method === "POST" && req.url?.startsWith("/player-done")) {
    collectBody(req, (body) => {
      try {
        const { fed, whsCount, scOk, scSkipped, scFailed, skipped } = JSON.parse(body);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const pct = ((currentPlayerIdx / totalPlayers) * 100).toFixed(0);
        if (skipped) {
          totalSkippedPlayers++;
          process.stdout.write(`  ${D}[${currentPlayerIdx}/${totalPlayers}] ${pct}% \u00B7 ${elapsed}s \u00B7 [${fed}] saltado${X}\n`);
        } else {
          process.stdout.write(`  ${D}[${currentPlayerIdx}/${totalPlayers}] ${pct}% \u00B7 ${elapsed}s \u00B7 [${fed}] SC: +${scOk}, ${scSkipped} exist, ${scFailed} fail${X}\n`);
        }
      } catch {}
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // POST /all-done
  if (req.method === "POST" && req.url === "/all-done") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const mins = (elapsed / 60).toFixed(1);
    console.log(`\n${B}=== DOWNLOAD CONCLUIDO ===${X}`);
    console.log(`  ${G}\u2713${X} ${totalPlayers} jogadores (${totalSkippedPlayers} saltados) em ${mins} min`);
    console.log(`  ${G}\u2713${X} ${totalNewScorecards} scorecards novos`);
    if (!skipRender) {
      console.log(`\n${B}A processar dados...${X}`);
      try {
        execSync(`node golf-all.js --skip-download ${fedCodes.join(" ")}`, { stdio: "inherit", cwd: process.cwd(), maxBuffer: 50 * 1024 * 1024 });
      } catch (e) { console.log(`${Y}\u26A0 Pipeline com erros (parcial)${X}`); }
    }
    console.log(`\n${G}${B}Tudo feito!${X}\n`);
    setTimeout(() => process.exit(0), 500);
    return;
  }

  // GET /browser-script.js
  if (req.method === "GET" && req.url === "/browser-script.js") {
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(BROWSER_SCRIPT);
    return;
  }

  // GET /
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html><html><head><title>FPG Bridge v2</title></head>
<body style="font-family:monospace;padding:20px;background:#1a1a2e;color:#e0e0e0">
<h2 style="color:#00d4aa">FPG Bridge v2</h2>
<p>${totalPlayers} jogadores | ${qualifOnly ? "so qualificativas" : "todas as rondas"} | ${concurrency} paralelos</p>
<p>Cola na consola do Firefox (F12) em scoring.fpg.pt ou my.fpg.pt:</p>
<pre style="background:#0d0d1a;padding:15px;border-radius:8px;color:#4fc3f7">fetch("http://localhost:${PORT}/browser-script.js").then(r=>r.text()).then(eval)</pre>
</body></html>`);
    return;
  }

  res.writeHead(404); res.end("Not found");
});

// ── Browser script ──
const BROWSER_SCRIPT = `
(async () => {
  const SERVER = "http://localhost:${PORT}";
  const BATCH_SIZE = 20;

  const log = (msg) => console.log("%c[FPG] " + msg, "color: #4fc3f7");
  const logOk = (msg) => console.log("%c[FPG] " + msg, "color: #00d4aa; font-weight: bold");
  const logErr = (msg) => console.log("%c[FPG] x " + msg, "color: #ef5350");

  const isMy = window.location.href.includes("my.fpg.pt");
  const isScoring = window.location.href.includes("scoring.fpg.pt");
  if (!isMy && !isScoring) {
    logErr("Precisas de estar em scoring.fpg.pt ou my.fpg.pt");
    return;
  }

  // Helper: call FPG API — uses jQuery $.ajax on my.fpg.pt (matches page's own requests)
  const fpgPost = (endpoint, params) => {
    const qs = Object.entries(params).map(([k,v]) => k + "=" + encodeURIComponent(v)).join("&");
    const url = endpoint + "?" + qs;
    const bodyObj = {};
    for (const [k,v] of Object.entries(params)) bodyObj[k] = String(v);

    if (isMy && window.jQuery) {
      return new Promise((resolve) => {
        window.jQuery.ajax({
          url: url,
          type: "POST",
          contentType: "application/json; charset=utf-8",
          dataType: "json",
          data: JSON.stringify(bodyObj),
          success: (data) => resolve({ ok: true, data: data?.d ?? data }),
          error: () => resolve({ ok: false })
        });
      });
    }
    // Fallback: fetch (works on scoring.fpg.pt)
    return fetch(url, {
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest", "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(bodyObj)
    }).then(async r => {
      if (r.status !== 200) return { ok: false };
      const j = await r.json();
      return { ok: true, data: j?.d ?? j };
    }).catch(() => ({ ok: false }));
  };

  log("Iniciado!" + (isMy ? " (my.fpg.pt mode — jQuery)" : " (scoring.fpg.pt mode)"));
  const t0 = Date.now();

  while (true) {
    let task;
    try {
      task = await (await fetch(SERVER + "/next-player")).json();
    } catch (e) { logErr("Servidor nao responde"); break; }

    if (task.done) {
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      logOk("CONCLUIDO em " + Math.round(secs/60) + " min!");
      await fetch(SERVER + "/all-done", { method: "POST" });
      break;
    }

    const { fed, index, total, existingScoreIds, oldWHSCount, refresh, force, qualifOnly, concurrency } = task;
    const existingSet = new Set(existingScoreIds);

    log("[" + (index+1) + "/" + total + "] Federado " + fed);

    // Extra params for my.fpg.pt
    const ppParams = isMy ? { pp: "N" } : {};

    // 1a. HCP WHS list (primary source)
    const hcpRecords = [];
    let hcpIdx = 0, hcpOk = true;
    while (true) {
      const res = await fpgPost("PlayerWHS.aspx/HCPWhsFederLST", {
        fed_code: fed, ...ppParams, jtStartIndex: hcpIdx, jtPageSize: 100
      });
      if (!res.ok || res.data?.Result !== "OK") { hcpOk = false; break; }
      const recs = res.data.Records || [];
      hcpRecords.push(...recs);
      if (recs.length < 100) break;
      hcpIdx += 100;
    }

    // Normalize score_id
    for (const r of hcpRecords) {
      if (!r.score_id && r.id) r.score_id = r.id;
      if (!r.id && r.score_id) r.id = r.score_id;
    }
    const hcpIdSet = new Set(hcpRecords.map(r => String(r.score_id || r.id)));

    // 1b. ResultsLST (extra non-qualifying rounds)
    let extraRecords = [];
    if (!qualifOnly) {
      let startIdx = 0;
      while (true) {
        const res = await fpgPost("PlayerResults.aspx/ResultsLST", {
          fed_code: fed, ...ppParams, jtStartIndex: startIdx, jtPageSize: 100
        });
        if (!res.ok || res.data?.Result !== "OK") break;
        const recs = res.data.Records || [];
        for (const r of recs) {
          if (!r.score_id && r.id) r.score_id = r.id;
          if (!r.id && r.score_id) r.id = r.score_id;
        }
        const newOnly = recs.filter(r => !hcpIdSet.has(String(r.score_id || r.id)));
        extraRecords.push(...newOnly);
        if (recs.length < 100) break;
        startIdx += 100;
      }
    }

    const allRecords = [...hcpRecords, ...extraRecords];

    if (!hcpOk || allRecords.length === 0) { log("[" + fed + "] WHS falhou, a saltar"); continue; }
    log("[" + fed + "] WHS: " + allRecords.length + " registos (" + hcpRecords.length + " HCP + " + extraRecords.length + " extra)");

    // Refresh: skip if count same and no new score_ids
    if (refresh && !force && allRecords.length === oldWHSCount) {
      const newIds = allRecords.filter(r => !existingSet.has(String(r.score_id || r.id)) && r.score_origin_id !== 7);
      if (newIds.length === 0) {
        await fetch(SERVER + "/player-done", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fed, skipped: true })
        });
        continue;
      }
    }

    await fetch(SERVER + "/save-whs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fed, data: { Result: "OK", Records: allRecords }, count: allRecords.length })
    });

    // 2. Scorecards — parallel + batched
    const toFetch = allRecords.filter(r => {
      if (r.score_origin_id === 7) return false;
      if (qualifOnly && r.hcp_qualifying_round !== 1) return false;
      if (!force && existingSet.has(String(r.score_id || r.id))) return false;
      return true;
    });

    let scOk = 0, scFailed = 0;
    const scSkipped = allRecords.length - toFetch.length;
    let batch = {};
    let batchCount = 0;

    const flush = async () => {
      if (batchCount === 0) return;
      try {
        await fetch(SERVER + "/save-scorecards-batch", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fed, scorecards: batch })
        });
      } catch {}
      batch = {};
      batchCount = 0;
    };

    log("[" + fed + "] Scorecards: " + toFetch.length + " a descarregar, " + scSkipped + " existentes");

    for (let i = 0; i < toFetch.length; i += concurrency) {
      const chunk = toFetch.slice(i, i + concurrency);
      const results = await Promise.allSettled(chunk.map(async (r) => {
        const sid = String(r.score_id || r.id);
        const res = await fpgPost("PlayerWHS.aspx/ScoreCard", {
          score_id: sid, scoringtype: r.scoring_type_id, competitiontype: r.competition_type_id, ...ppParams
        });
        if (res.ok && res.data?.Result === "OK") return { id: sid, data: res.data };
        return null;
      }));

      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          batch[r.value.id] = r.value.data;
          batchCount++;
          scOk++;
          if (batchCount >= BATCH_SIZE) await flush();
        } else {
          scFailed++;
        }
      }

      if ((i + concurrency) % 40 === 0) {
        log("[" + fed + "] SC: " + (i + chunk.length) + "/" + toFetch.length);
      }
    }
    await flush();

    log("[" + fed + "] SC: " + scOk + " OK, " + scFailed + " falhas");

    await fetch(SERVER + "/player-done", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fed, whsCount: allRecords.length, scOk, scSkipped, scFailed })
    });

    if ((index + 1) % 50 === 0) {
      const elapsed = ((Date.now() - t0) / 1000 / 60).toFixed(1);
      log((index+1) + "/" + total + " | " + elapsed + " min");
    }
  }
})();
`;

// ── Start ──
server.listen(PORT, () => {
  console.log(`
${B}+------------------------------------------------------+${X}
${B}|       FPG Bridge v2 — Download Rapido                 |${X}
${B}+------------------------------------------------------+${X}
${B}|${X}  Jogadores:   ${String(totalPlayers).padEnd(37)}${B}|${X}
${B}|${X}  Modo:        ${(forceFlag ? "Forcar tudo" : refreshFlag ? "Refresh (so novos)" : "Normal").padEnd(37)}${B}|${X}
${B}|${X}  Rondas:      ${(qualifOnly ? "So qualificativas HCP" : "Todas (incl. treinos)").padEnd(37)}${B}|${X}
${B}|${X}  Paralelos:   ${String(concurrency).padEnd(37)}${B}|${X}
${B}|${X}  Render:      ${(skipRender ? "Nao" : "Sim").padEnd(37)}${B}|${X}
${B}+------------------------------------------------------+${X}

${Y}No Firefox (em scoring.fpg.pt ou my.fpg.pt), cola na consola (F12):${X}

  ${G}fetch("http://localhost:${PORT}/browser-script.js").then(r=>r.text()).then(eval)${X}
`);
});
