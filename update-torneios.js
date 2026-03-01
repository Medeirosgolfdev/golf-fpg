#!/usr/bin/env node
/**
 * update-torneios.js — Scrape torneios DRIVE + AQUAPOR
 *
 * SITE: scoring.datagolf.pt (NÃO funciona em scoring.fpg.pt!)
 *
 * Uso:
 *   node update-torneios.js
 *
 * Depois cola no browser (scoring.datagolf.pt, F12 Console):
 *   fetch("http://localhost:3456/browser-script.js").then(r=>r.text()).then(eval)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3456;
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", B = "\x1b[1m", D = "\x1b[2m", X = "\x1b[0m";

/* ══════════════════════════════════════════════════════════
   LISTA DE TORNEIOS — Editar aqui quando houver novos!
   
   Para encontrar ccode/tcode de um torneio novo:
   1. Abre scoring.datagolf.pt
   2. Vai às classificações do torneio
   3. O URL tem: ?ccode=XXX&tcode=YYYYY
   ══════════════════════════════════════════════════════════ */
const TOURNAMENTS = [
  // ── DRIVE TOUR ──
  { name: "3º Drive Tour Norte – Vale Pisão", ccode: "987", tcode: "10208", date: "2026-02-28", campo: "Vale Pisão", circuit: "drive" },
  { name: "2º Drive Tour Madeira - Santo da Serra", ccode: "982", tcode: "10199", date: "2026-02-07", campo: "Santo da Serra", circuit: "drive" },
  { name: "2º Drive Tour Sul – Vila Sol", ccode: "988", tcode: "10293", date: "2026-02-01", campo: "Vila Sol", circuit: "drive" },
  { name: "1º Drive Tour Sul – Laguna G.C.", ccode: "988", tcode: "10292", date: "2026-01-11", campo: "Vilamoura - Laguna", circuit: "drive" },
  { name: "1º Drive Tour Tejo – Montado", ccode: "985", tcode: "10202", date: "2026-01-04", campo: "Montado", circuit: "drive" },
  { name: "1º Drive Tour Norte – Estela GC", ccode: "987", tcode: "10206", date: "2026-01-04", campo: "Estela", circuit: "drive" },
  { name: "1º Drive Tour Madeira - Palheiro Golf", ccode: "982", tcode: "10198", date: "2026-01-03", campo: "Palheiro Golf", circuit: "drive" },

  // ── DRIVE CHALLENGE ──
  { name: "2º Challenge Açores Sub 18", ccode: "983", tcode: "10154", date: "2026-02-28", campo: "Terceira", circuit: "drive" },
  { name: "2º Challenge Açores Sub 16", ccode: "983", tcode: "10153", date: "2026-02-28", campo: "Terceira", circuit: "drive" },
  { name: "2º Challenge Açores Sub 14", ccode: "983", tcode: "10152", date: "2026-02-28", campo: "Terceira", circuit: "drive" },
  { name: "2º Challenge Açores Sub 12", ccode: "983", tcode: "10151", date: "2026-02-28", campo: "Terceira", circuit: "drive" },
  { name: "2º Challenge Açores Sub 10", ccode: "983", tcode: "10150", date: "2026-02-28", campo: "Terceira", circuit: "drive" },
  { name: "2º Challenge Tejo Sub 18", ccode: "985", tcode: "10215", date: "2026-02-22", campo: "Montado", circuit: "drive" },
  { name: "2º Challenge Tejo Sub 16", ccode: "985", tcode: "10214", date: "2026-02-22", campo: "Montado", circuit: "drive" },
  { name: "2º Challenge Tejo Sub 14", ccode: "985", tcode: "10213", date: "2026-02-22", campo: "Montado", circuit: "drive" },
  { name: "2º Challenge Tejo Sub 12", ccode: "985", tcode: "10212", date: "2026-02-22", campo: "Montado", circuit: "drive" },
  { name: "2º Challenge Tejo Sub 10", ccode: "985", tcode: "10211", date: "2026-02-22", campo: "Montado", circuit: "drive" },
  { name: "2º Challenge Sul Laguna Sub 18", ccode: "988", tcode: "10297", date: "2026-02-21", campo: "Vilamoura - Laguna", circuit: "drive" },
  { name: "2º Challenge Sul Laguna Sub 16", ccode: "988", tcode: "10300", date: "2026-02-21", campo: "Vilamoura - Laguna", circuit: "drive" },
  { name: "2º Challenge Sul Laguna Sub 14", ccode: "988", tcode: "10296", date: "2026-02-21", campo: "Vilamoura - Laguna", circuit: "drive" },
  { name: "2º Challenge Sul Laguna Sub 12", ccode: "988", tcode: "10295", date: "2026-02-21", campo: "Vilamoura - Laguna", circuit: "drive" },
  { name: "2º Challenge Sul Laguna Sub 10", ccode: "988", tcode: "10294", date: "2026-02-21", campo: "Vilamoura - Laguna", circuit: "drive" },
  { name: "2º Challenge Madeira Sub 18", ccode: "982", tcode: "10211", date: "2026-02-08", campo: "Santo da Serra", circuit: "drive" },
  { name: "2º Challenge Madeira Sub 16", ccode: "982", tcode: "10210", date: "2026-02-08", campo: "Santo da Serra", circuit: "drive" },
  { name: "2º Challenge Madeira Sub 14", ccode: "982", tcode: "10209", date: "2026-02-08", campo: "Santo da Serra", circuit: "drive" },
  { name: "2º Challenge Madeira Sub 12", ccode: "982", tcode: "10208", date: "2026-02-08", campo: "Santo da Serra", circuit: "drive" },
  { name: "2º Challenge Madeira Sub 10", ccode: "982", tcode: "10207", date: "2026-02-08", campo: "Santo da Serra", circuit: "drive" },
  { name: "1º Challenge Açores Sub 18", ccode: "983", tcode: "10149", date: "2026-01-24", campo: "Terceira", circuit: "drive" },
  { name: "1º Challenge Açores Sub 16", ccode: "983", tcode: "10148", date: "2026-01-24", campo: "Terceira", circuit: "drive" },
  { name: "1º Challenge Açores Sub 14", ccode: "983", tcode: "10147", date: "2026-01-24", campo: "Terceira", circuit: "drive" },
  { name: "1º Challenge Açores Sub 12", ccode: "983", tcode: "10146", date: "2026-01-24", campo: "Terceira", circuit: "drive" },
  { name: "1º Challenge Açores Sub 10", ccode: "983", tcode: "10145", date: "2026-01-24", campo: "Terceira", circuit: "drive" },
  { name: "1º Challenge Madeira Sub 18", ccode: "982", tcode: "10205", date: "2026-01-04", campo: "Palheiro Golf", circuit: "drive" },
  { name: "1º Challenge Madeira Sub 16", ccode: "982", tcode: "10206", date: "2026-01-04", campo: "Palheiro Golf", circuit: "drive" },
  { name: "1º Challenge Madeira Sub 14", ccode: "982", tcode: "10204", date: "2026-01-04", campo: "Palheiro Golf", circuit: "drive" },
  { name: "1º Challenge Madeira Sub 12", ccode: "982", tcode: "10203", date: "2026-01-04", campo: "Palheiro Golf", circuit: "drive" },
  { name: "1º Challenge Madeira Sub 10", ccode: "982", tcode: "10202", date: "2026-01-04", campo: "Palheiro Golf", circuit: "drive" },

  // ── AQUAPOR ──
  // TODO: Encontrar ccode/tcode em scoring.datagolf.pt
  // { name: "1º Circuito AQUAPOR - Morgado", ccode: "???", tcode: "?????", date: "2026-01-17", campo: "Morgado do Reguengo", circuit: "aquapor" },
  // { name: "2º Circuito AQUAPOR - Quinta do Peru", ccode: "???", tcode: "?????", date: "2026-03-14", campo: "Quinta do Peru", circuit: "aquapor" },
];

/* ── Classify ── */
function classify(name, campo, ccode) {
  const lc = name.toLowerCase();
  const series = lc.includes("challenge") ? "challenge" : "tour";
  let region = "outro";
  const regMap = { "982": "madeira", "983": "acores", "985": "tejo", "987": "norte", "988": "sul" };
  region = regMap[ccode] || "outro";
  if (lc.includes("madeira") || lc.includes("palheiro")) region = "madeira";
  else if (lc.includes("norte") || lc.includes("estela") || lc.includes("vale pis")) region = "norte";
  else if (lc.includes("tejo") || lc.includes("montado")) region = "tejo";
  else if (lc.includes("sul") || lc.includes("laguna") || lc.includes("vila sol")) region = "sul";
  else if (lc.includes("acor") || lc.includes("terceira")) region = "acores";
  let escalao = null;
  const em = lc.match(/sub\s*(\d+)/);
  if (em) escalao = "Sub " + em[1];
  const nm = name.match(/(\d+)\s*[^\d]/);
  const num = nm ? parseInt(nm[1]) : null;
  return { series, region, escalao, num };
}

/* ── State ── */
let tournIdx = 0;
let startTime = Date.now();
const activeTournaments = TOURNAMENTS.filter(t => !t.name.startsWith("//"));
console.log(`\n${B}═══ Torneios: ${activeTournaments.length} (${TOURNAMENTS.filter(t => t.circuit === "aquapor" && !t.ccode?.startsWith("?")).length} AQUAPOR) ═══${X}\n`);

/* ── Server ── */
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // GET /next-task
  if (req.method === "GET" && req.url === "/next-task") {
    if (tournIdx >= activeTournaments.length) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ done: true }));
      return;
    }
    const t = activeTournaments[tournIdx];
    const info = classify(t.name, t.campo, t.ccode);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ done: false, index: tournIdx, total: activeTournaments.length, tournament: { ...t, ...info } }));
    tournIdx++;
    return;
  }

  // POST /save
  if (req.method === "POST" && req.url === "/save") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const totalSC = data.totalScorecards || 0;
        const totalP = data.totalPlayers || 0;

        // SAFETY: Never save empty data
        if (totalSC === 0 && totalP === 0) {
          console.log(`  ${R}✗ RECUSADO: 0 jogadores, 0 scorecards!${X}`);
          console.log(`  ${R}  Estás no site certo? Tem de ser scoring.datagolf.pt${X}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "empty" }));
          return;
        }

        // Save
        const outPath = path.join(process.cwd(), "public", "data", "drive-data.json");
        const outDir = path.dirname(outPath);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(data, null, 2));

        console.log(`  ${G}✓${X} drive-data.json: ${data.totalTournaments} torneios, ${totalP} jogadores, ${totalSC} SC`);

        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        console.log(`\n${B}═══ CONCLUÍDO em ${elapsed} min ═══${X}`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));

        setTimeout(() => { server.close(); process.exit(0); }, 1000);
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
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
  const SC_DELAY = 150;
  const T_DELAY = 300;

  const log = (m) => console.log("%c[TORNEIOS] " + m, "color:#16a34a;font-weight:bold");
  const logOk = (m) => console.log("%c[TORNEIOS] " + m, "color:green;font-weight:bold;font-size:14px");
  const logErr = (m) => console.log("%c[TORNEIOS] " + m, "color:red;font-weight:bold");
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // SAFETY: Check we're on the right site
  if (!location.host.includes("datagolf")) {
    logErr("⚠ SITE ERRADO! Este script só funciona em scoring.datagolf.pt");
    logErr("  Abre: https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=988&tcode=10292");
    return;
  }

  log("A iniciar scraping de torneios em scoring.datagolf.pt...");
  const t0 = Date.now();
  const allData = [];

  while (true) {
    let task;
    try { task = await (await fetch(SERVER + "/next-task")).json(); }
    catch (e) { logErr("Servidor não responde: " + e.message); break; }

    if (task.done) break;

    const t = task.tournament;
    log("[" + (task.index + 1) + "/" + task.total + "] " + t.name);

    // Fetch classification
    const classifRes = await fetch("/pt/classif.aspx/ClassifLST", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({
        Classi: "1", tclub: t.ccode, tcode: t.tcode,
        classiforder: "1", classiftype: "I", classifroundtype: "D",
        scoringtype: "1", round: "1", members: "0", playertypes: "0",
        gender: "0", minagemen: "0", maxagemen: "999",
        minageladies: "0", maxageladies: "999",
        minhcp: "-8", maxhcp: "99", idfilter: "-1",
        jtStartIndex: 0, jtPageSize: 200, jtSorting: "score_id DESC"
      })
    });

    let classif = [];
    if (classifRes.ok) {
      try {
        const json = await classifRes.json();
        const d = json.d || json;
        if (d.Result === "OK" && d.Records) {
          classif = d.Records.map(r => ({ scoreId: String(r.score_id), pos: r.classif_pos, name: r.player_name || "", club: r.player_club_description || "" }));
        }
      } catch {}
    }
    log("  " + classif.length + " jogadores");

    // Fetch scorecards
    const players = [];
    for (let j = 0; j < classif.length; j++) {
      const c = classif[j];
      try {
        const scRes = await new Promise(resolve => {
          jQuery.ajax({
            url: "classif.aspx/ScoreCard", type: "POST", dataType: "json",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({ score_id: c.scoreId, tclub: t.ccode, tcode: t.tcode, scoringtype: "1", classiftype: "I", classifround: "1", jtStartIndex: 0, jtPageSize: 10, jtSorting: "" }),
            success: json => { const d = json.d || json; resolve(d?.Result === "OK" && d.Records?.length ? d.Records[0] : null); },
            error: () => resolve(null)
          });
        });

        if (scRes) {
          const nh = scRes.nholes || 18;
          const scores = [], par = [], si = [], meters = [];
          for (let h = 1; h <= nh; h++) { scores.push(scRes["gross_" + h] || 0); par.push(scRes["par_" + h] || 0); si.push(scRes["stroke_index_" + h] || 0); meters.push(scRes["meters_" + h] || 0); }
          players.push({ scoreId: c.scoreId, pos: c.pos, name: scRes.player_name || c.name, fed: scRes.federated_code || "", club: scRes.player_acronym || c.club, hcpExact: scRes.exact_hcp, hcpPlay: scRes.play_hcp, grossTotal: scRes.gross_total, parTotal: scRes.par_total, course: scRes.course_description || "", courseRating: scRes.course_rating, slope: scRes.slope, teeName: scRes.tee_name || "", nholes: nh, scores, par, si, meters });
        } else {
          players.push({ scoreId: c.scoreId, pos: c.pos, name: c.name, club: c.club, grossTotal: 999, toPar: 0, scores: [] });
        }
      } catch { players.push({ scoreId: c.scoreId, pos: c.pos, name: c.name, club: c.club, grossTotal: 999, toPar: 0, scores: [] }); }

      await sleep(SC_DELAY);
      if ((j + 1) % 10 === 0) log("  SC: " + (j + 1) + "/" + classif.length);
    }

    allData.push({
      name: t.name, ccode: t.ccode, tcode: t.tcode, date: t.date, campo: t.campo, clube: t.clube || "",
      series: t.series, region: t.region, escalao: t.escalao, num: t.num, circuit: t.circuit || "drive",
      playerCount: players.length, players
    });

    const scOk = players.filter(p => p.scores?.length > 0).length;
    log("  ✔ " + scOk + "/" + players.length + " scorecards");
    await sleep(T_DELAY);
  }

  // Send to server
  const totalSC = allData.reduce((a, t) => a + t.players.filter(p => p.scores?.length > 0).length, 0);
  const output = {
    lastUpdated: new Date().toISOString().split("T")[0],
    source: "scoring.datagolf.pt",
    totalTournaments: allData.length,
    totalPlayers: allData.reduce((a, t) => a + t.players.length, 0),
    totalScorecards: totalSC,
    tournaments: allData
  };

  const saveRes = await fetch(SERVER + "/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(output) });
  const saveJson = await saveRes.json();

  if (saveJson.ok) {
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    logOk("CONCLUÍDO em " + Math.round(secs / 60) + " min!");
    logOk("Torneios: " + allData.length + " | Jogadores: " + output.totalPlayers + " | SC: " + totalSC);
  } else {
    logErr("Erro ao gravar: " + (saveJson.error || "desconhecido"));
  }
})();
`;

server.listen(PORT, () => {
  console.log(`
${B}╔══════════════════════════════════════════════════════╗${X}
${B}║        TORNEIOS — DRIVE + AQUAPOR                    ║${X}
${B}╠══════════════════════════════════════════════════════╣${X}
${B}║${X}  Torneios: ${String(activeTournaments.length).padEnd(40)}${B}║${X}
${B}║${X}  DRIVE:    ${String(activeTournaments.filter(t => t.circuit === "drive").length).padEnd(40)}${B}║${X}
${B}║${X}  AQUAPOR:  ${String(activeTournaments.filter(t => t.circuit === "aquapor").length).padEnd(40)}${B}║${X}
${B}╚══════════════════════════════════════════════════════╝${X}

${Y}1. Abre no browser:${X}
   ${G}https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=988&tcode=10292${X}

${Y}2. F12 → Console → Cola:${X}
   ${G}fetch("http://localhost:${PORT}/browser-script.js").then(r=>r.text()).then(eval)${X}
`);
});
