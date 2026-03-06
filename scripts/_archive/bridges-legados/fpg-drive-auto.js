#!/usr/bin/env node
/**
 * fpg-drive-auto.js — DRIVE scraper directo (sem browser para Fase 1)
 *
 * Fase 1: Descobre e descarrega torneios DRIVE directamente de scoring.datagolf.pt
 *         → Sem login, sem browser, sem intervenção manual
 * Fase 2: Download de perfis de jogadores (ainda precisa do browser bridge)
 *
 * Uso:
 *   node fpg-drive-auto.js --tournaments
 *   node fpg-drive-auto.js --tournaments --players --new-players
 *   node fpg-drive-auto.js --players --all-players --refresh
 *   node fpg-drive-auto.js --players --feds 47078 59252
 *
 * Opções:
 *   --tournaments     Descarregar torneios DRIVE (Fase 1) — sem browser
 *   --players         Download perfis de jogadores (Fase 2) — precisa browser
 *   --all-players     Todos os jogadores encontrados nos torneios
 *   --new-players     Só jogadores que NÃO estão em players.json
 *   --recommended     Só os jogadores em recommended-feds-download.txt
 *   --feds 123 456    Jogadores específicos
 *   --refresh         Saltar jogadores se WHS count não mudou
 *   --force           Re-descarregar tudo
 *   --qualif-only     Só rondas qualificativas HCP
 *   --skip-sd         Não construir SD lookup no fim
 *   --concurrency N   Downloads paralelos na Fase 2 (default: 8)
 *   --year YYYY       Filtrar torneios por ano (default: ano actual)
 */

const https = require("https");
const http  = require("http");
const fs    = require("fs");
const path  = require("path");

// ── Cores ──
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m",
      B = "\x1b[1m",  D = "\x1b[2m",  X = "\x1b[0m";

// ── Args ──
const args = process.argv.slice(2);
let doTournaments = false, doPlayers = false;
let allPlayersFlag = false, newPlayersFlag = false, recommendedFlag = false;
let refreshFlag = false, forceFlag = false, qualifOnly = false, skipSD = false;
let concurrency = 8;
let filterYear = new Date().getFullYear();
const explicitFeds = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--tournaments")  { doTournaments = true; continue; }
  if (a === "--players")      { doPlayers = true; continue; }
  if (a === "--all-players")  { allPlayersFlag = true; doPlayers = true; continue; }
  if (a === "--new-players")  { newPlayersFlag = true; doPlayers = true; continue; }
  if (a === "--recommended")  { recommendedFlag = true; doPlayers = true; continue; }
  if (a === "--refresh")      { refreshFlag = true; continue; }
  if (a === "--force")        { forceFlag = true; continue; }
  if (a === "--qualif-only")  { qualifOnly = true; continue; }
  if (a === "--skip-sd")      { skipSD = true; continue; }
  if (a === "--concurrency")  { concurrency = parseInt(args[++i]) || 8; continue; }
  if (a === "--year")         { filterYear = parseInt(args[++i]) || filterYear; continue; }
  if (a === "--feds")         { while (i + 1 < args.length && /^\d+$/.test(args[i+1])) explicitFeds.push(args[++i]); continue; }
  if (/^\d+$/.test(a))        { explicitFeds.push(a); continue; }
}

if (!doTournaments && !doPlayers && explicitFeds.length === 0) {
  console.log(`Uso: node fpg-drive-auto.js --tournaments --players --new-players`);
  console.log(`     node fpg-drive-auto.js --tournaments`);
  console.log(`     node fpg-drive-auto.js --players --recommended`);
  process.exit(1);
}

// ── Configuração ──
const PORT = 3456;
const BATCH_SIZE = 20;
const BASE_URL = "scoring.datagolf.pt";

// Club codes DRIVE
const DRIVE_CLUBS = {
  "982": "FPG_DM",       // Madeira
  "983": "FPG_DAT",      // Açores - Terceira
  "985": "FPG_DTejo",    // Tejo
  "987": "FPG_DNorte",   // Norte
  "988": "FPG_DRIVE",    // Sul
};

// URL pública de entrada da FPG — pode mudar (dt= e hash= são gerados pelo servidor)
// Valor actual guardado em session-datagolf.txt como JSON
let ENTRY_URL = "/pt/1EntryPage.aspx?user=fpguser&dt=5428&page=tournlist&hash=4e675dc937a0933f1ecb8a2a7ba005172b247170&ccode=All&pagelang=PT&callcontext=direct";
let DG_LISTS_COOKIE = "DG_Lists_URL=OriginalUrl=https%3a%2f%2fscoring.datagolf.pt%3a443%2fpt%2f1EntryPage.aspx%3fuser%3dfpguser%26dt%3d5428%26page%3dtournlist%26hash%3d4e675dc937a0933f1ecb8a2a7ba005172b247170%26ccode%3dAll%26pagelang%3dPT%26callcontext%3ddirect";

// Sessão activa (preenchida por initSession)
let sessionCookie = "";

// Construir DG_LISTS_COOKIE a partir do valor legível do DG_Lists_URL
function buildDGCookie(dgListsUrlValue) {
  return "DG_Lists_URL=" + encodeURIComponent(dgListsUrlValue).replace(/%20/g, "+");
}
function buildEntryUrl(dgListsUrlValue) {
  // Extrair o OriginalUrl do valor do cookie
  const m = dgListsUrlValue.match(/OriginalUrl=(.+)/);
  if (!m) return ENTRY_URL;
  try {
    const orig = decodeURIComponent(m[1]);
    return new URL(orig).pathname + new URL(orig).search;
  } catch { return ENTRY_URL; }
}

// ── Caminhos ──
const playersJsonPath  = path.join(process.cwd(), "players.json");
const driveDataPath    = path.join(process.cwd(), "public", "data", "drive-data.json");
const playersDB        = fs.existsSync(playersJsonPath) ? JSON.parse(fs.readFileSync(playersJsonPath, "utf-8")) : {};
const existingDrive    = fs.existsSync(driveDataPath) ? JSON.parse(fs.readFileSync(driveDataPath, "utf-8")) : null;

// ── Inicializar sessão (GET à 1EntryPage pública) ──
// ── Obter sessão: via argumento, ficheiro, ou pedido ao browser ──
async function initSession() {
  process.stdout.write(`  ${C}▸ A obter sessão...${X} `);

  const sf = path.join(process.cwd(), "session-datagolf.txt");

  // Ler --dg-url se fornecido (actualiza o cookie DG_Lists_URL)
  const di = args.indexOf("--dg-url");
  if (di !== -1 && args[di+1]) {
    const dgVal = args[di+1];
    DG_LISTS_COOKIE = buildDGCookie(dgVal);
    ENTRY_URL = buildEntryUrl(dgVal);
  }

  // 1. Argumento --session XXXX
  const si = args.indexOf("--session");
  if (si !== -1 && args[si+1]) {
    const s = args[si+1];
    sessionCookie = `ASP.NET_SessionId=${s}; ${DG_LISTS_COOKIE}`;
    // Guardar ambos os valores
    fs.writeFileSync(sf, JSON.stringify({ session: s, dgListsUrl: DG_LISTS_COOKIE }));
    console.log(`${G}✓${X} (via --session)`);
    return true;
  }

  // 2. Ficheiro session-datagolf.txt (guardado da última vez)
  if (fs.existsSync(sf)) {
    try {
      const saved = JSON.parse(fs.readFileSync(sf, "utf-8").trim());
      if (saved.session) {
        if (saved.dgListsUrl) DG_LISTS_COOKIE = saved.dgListsUrl;
        sessionCookie = `ASP.NET_SessionId=${saved.session}; ${DG_LISTS_COOKIE}`;
        console.log(`${G}✓${X} (session-datagolf.txt)`);
        return true;
      }
    } catch {
      // ficheiro no formato antigo (só o session ID)
      const s = fs.readFileSync(sf, "utf-8").trim();
      if (s && !s.startsWith("{")) {
        sessionCookie = `ASP.NET_SessionId=${s}; ${DG_LISTS_COOKIE}`;
        console.log(`${G}✓${X} (session-datagolf.txt)`);
        return true;
      }
    }
  }

  // 3. Pedir ao browser via servidor local temporário (porta 3457)
  console.log(`${Y}a aguardar sessão do browser...${X}`);
  return new Promise((resolve) => {
    const tmpServer = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
      if (req.method === "POST" && req.url === "/set-session") {
        let body = "";
        req.on("data", c => body += c);
        req.on("end", () => {
          const m = body.match(/ASP\.NET_SessionId=([^;\s]+)/i);
          if (m) {
            sessionCookie = `ASP.NET_SessionId=${m[1]}; ${DG_LISTS_COOKIE}`;
            fs.writeFileSync(sf, m[1]); // guardar para próximas vezes
            res.writeHead(200); res.end("ok");
            tmpServer.close();
            console.log(`${G}✓${X} sessão: ${m[1].substring(0,8)}... (guardada em session-datagolf.txt)`);
            resolve(true);
          } else {
            res.writeHead(400); res.end("sem sessao ASP.NET");
          }
        });
        return;
      }
      res.writeHead(404); res.end();
    });

    tmpServer.listen(3457, () => {
      console.log(`
${B}  Abre o browser em:${X} ${C}https://scoring.datagolf.pt/pt/tournaments.aspx${X}
${B}  Cola na consola F12:${X}

  ${G}fetch("http://localhost:3457/set-session",{method:"POST",body:document.cookie})${X}

${D}  (só precisas de fazer isto uma vez — fica guardado em session-datagolf.txt)${X}
`);
    });

    tmpServer.on("error", () => {
      sessionCookie = DG_LISTS_COOKIE;
      console.log(`${R}erro ao iniciar servidor de sessão${X}`);
      resolve(false);
    });
  });
}

// ── HTTP helpers (HTTPS para scoring.datagolf.pt) ──
function dgRequest(method, path, body) {
  return new Promise((resolve) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": body ? "application/json, text/javascript, */*" : "text/html,application/xhtml+xml,*/*",
      "Referer": "https://scoring.datagolf.pt/pt/tournaments.aspx",
      "Cookie": sessionCookie,
    };
    if (bodyStr) {
      headers["Content-Type"] = "application/json; charset=utf-8";
      headers["Content-Length"] = Buffer.byteLength(bodyStr);
      headers["X-Requested-With"] = "XMLHttpRequest";
    }
    const req = https.request({ hostname: BASE_URL, path, method, headers }, (res) => {
      // Capturar novos cookies de sessão (refresh)
      const setCookies = res.headers["set-cookie"] || [];
      for (const c of setCookies) {
        const m = c.match(/ASP\.NET_SessionId=([^;]+)/i);
        if (m) {
          sessionCookie = `ASP.NET_SessionId=${m[1]}; ${DG_LISTS_COOKIE}`;
          const sf = path.join ? null : require("path").join(process.cwd(), "session-datagolf.txt");
          // actualizar ficheiro
          try { require("fs").writeFileSync(require("path").join(process.cwd(), "session-datagolf.txt"), m[1]); } catch {}
        }
      }
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => {
        if (!bodyStr) { resolve({ ok: res.statusCode < 400, status: res.statusCode }); return; }
        try {
          const json = JSON.parse(data);
          resolve({ ok: res.statusCode === 200, data: json?.d ?? json, status: res.statusCode });
        } catch {
          resolve({ ok: false, data: null, status: res.statusCode, raw: data.substring(0, 300) });
        }
      });
    });
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ ok: false, error: "timeout" }); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function dgGet(path) { return dgRequest("GET", path, null); }
function dgPost(endpoint, body) { return dgRequest("POST", endpoint, body); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Classificação de torneio ──
function classifyTournament(name, clubCode) {
  const lc = name.toLowerCase();
  const club = DRIVE_CLUBS[clubCode] || "";
  const series = lc.includes("challenge") ? "challenge" : "tour";
  let region = "outro";
  if (club === "FPG_DM"     || lc.includes("madeira") || lc.includes("palheiro"))   region = "madeira";
  else if (club === "FPG_DAT"    || lc.includes("acor") || lc.includes("terceira")) region = "acores";
  else if (club === "FPG_DTejo"  || lc.includes("tejo") || lc.includes("montado"))  region = "tejo";
  else if (club === "FPG_DNorte" || lc.includes("norte") || lc.includes("estela") || lc.includes("vale pis")) region = "norte";
  else if (club === "FPG_DRIVE"  || lc.includes("sul") || lc.includes("laguna") || lc.includes("vila sol"))   region = "sul";
  const em = lc.match(/sub[\s-]*(\d+)/);
  const escalao = em ? "Sub " + em[1] : null;
  const nm = name.match(/^(\d+)[ºª°]/);
  const num = nm ? parseInt(nm[1]) : null;
  return { series, region, escalao, num, clube: club };
}

// ── Converter timestamp /Date(ms)/ ──
function parseDate(dateVal) {
  if (!dateVal) return "";
  const m = String(dateVal).match(/(\d+)/);
  if (!m) return "";
  return new Date(parseInt(m[1])).toISOString().split("T")[0];
}

// ═══════════════════════════════════════════
// FASE 1: Torneios DRIVE (directo, sem browser)
// ═══════════════════════════════════════════
async function fetchDriveTournaments() {
  console.log(`\n${B}═══ Fase 1: Torneios DRIVE (directo) ═══${X}`);
  console.log(`  ${D}Fonte: ${BASE_URL} | Ano: ${filterYear} | Sem login${X}`);

  // Descobrir torneios existentes para evitar re-processar
  const existingTcodes = new Set();
  if (existingDrive && !forceFlag) {
    for (const t of existingDrive.tournaments) existingTcodes.add(t.tcode);
    console.log(`  ${D}Torneios já processados: ${existingTcodes.size}${X}`);
  }

  // Passo 1: Obter sessão
  await initSession();

  // Passo 2: Aquecer sessão no servidor (necessário para ccode=All)
  process.stdout.write(`  ${C}▸ A validar sessão no servidor...${X} `);
  const warmup = await dgGet(ENTRY_URL);
  if (!warmup.ok) {
    console.log(`${R}✗ sessão inválida ou expirada (status ${warmup.status})${X}`);
    console.log(`
${Y}  A sessão expirou. Vai a scoring.datagolf.pt, copia o ASP.NET_SessionId${X}`);
    console.log(`${Y}  do Network tab e volta a correr com --session NOVO_VALOR${X}
`);
    // Limpar ficheiro de sessão inválida
    const sf = require("path").join(process.cwd(), "session-datagolf.txt");
    if (require("fs").existsSync(sf)) require("fs").unlinkSync(sf);
    process.exit(1);
  }
  console.log(`${G}✓${X}`);

  // Passo 3: Listar todos os torneios DRIVE por club code
  console.log(`\n  ${C}▸ A listar torneios DRIVE...${X}`);

  const allTournaments = [];

  // Buscar todos os torneios de uma vez (ClubCode "0" = todos os clubes)
  const driveCcodes = new Set(Object.keys(DRIVE_CLUBS));
  const yearStart = new Date(`${filterYear}-01-01`).getTime();
  const yearEnd   = new Date(`${filterYear + 1}-01-01`).getTime();

  const res = await dgPost(
    "/pt/tournaments.aspx/TournamentsLST?jtStartIndex=0&jtPageSize=1000&jtSorting=started_at%20DESC",
    { ClubCode: "0", dtIni: "", dtFim: "", CourseName: "", TournCode: "", TournName: "",
      jtStartIndex: "0", jtPageSize: "1000", jtSorting: "started_at DESC" }
  );

  if (!res.ok || !res.data?.Records) {
    console.log(`  ${R}✗ TournamentsLST falhou (status ${res.status || "?"}, raw: ${res.raw || ""})${X}`);
  } else {
    console.log(`  ${G}✓${X} Total registos recebidos: ${res.data.Records.length} (TotalRecordCount: ${res.data.TotalRecordCount})`);

    for (const t of res.data.Records) {
      // Filtrar só clubes DRIVE
      if (!driveCcodes.has(String(t.club_code))) continue;
      // Filtrar por ano
      const ts = parseInt(String(t.started_at || "").match(/(\d+)/)?.[1] || "0");
      if (ts < yearStart || ts >= yearEnd) continue;

      const clubCode = String(t.club_code);
      const clubName = DRIVE_CLUBS[clubCode] || clubCode;
      allTournaments.push({
        id: t.id,
        ccode: clubCode,
        tcode: String(t.code),
        name: t.description,
        date: parseDate(t.started_at),
        campo: t.course_description,
        clube: clubName,
        rounds: t.rounds || 1,
      });
    }

    // Resumo por clube
    for (const [cc, cn] of Object.entries(DRIVE_CLUBS)) {
      const n = allTournaments.filter(t => t.ccode === cc).length;
      if (n > 0) console.log(`  ${G}✓${X} ${cn}: ${n} torneios em ${filterYear}`);
    }
  }

  // Separar novos vs já processados
  const newTournaments = forceFlag
    ? allTournaments
    : allTournaments.filter(t => !existingTcodes.has(t.tcode));

  console.log(`\n  ${B}Total DRIVE ${filterYear}: ${allTournaments.length} | Novos: ${newTournaments.length}${X}`);

  if (newTournaments.length === 0) {
    console.log(`  ${Y}Nenhum torneio novo. Usa --force para re-processar.${X}`);
    return existingDrive;
  }

  // Passo 2: Para cada torneio novo, ir buscar classificação + scorecards
  const processedTournaments = [];
  let totalScorecards = 0;

  for (let i = 0; i < newTournaments.length; i++) {
    const t = newTournaments[i];
    const info = classifyTournament(t.name, t.ccode);
    const fullT = { ...t, ...info };

    process.stdout.write(`  [${i+1}/${newTournaments.length}] ${C}${t.name}${X} `);

    // Classificação
    const classifRes = await dgPost(
      `/pt/classif.aspx/ClassifLST?jtStartIndex=0&jtPageSize=200&jtSorting=`,
      { Classi: "1", tclub: t.ccode, tcode: t.tcode,
        classiforder: "1", classiftype: "I", classifroundtype: "D",
        scoringtype: "1", round: "1", members: "0", playertypes: "0",
        gender: "0", minagemen: "0", maxagemen: "999",
        minageladies: "0", maxageladies: "999",
        minhcp: "-8", maxhcp: "99", idfilter: "-1",
        jtStartIndex: 0, jtPageSize: 200, jtSorting: "score_id DESC" }
    );

    const classif = [];
    if (classifRes.ok && classifRes.data?.Result === "OK") {
      for (const r of (classifRes.data.Records || [])) {
        classif.push({
          scoreId: String(r.score_id),
          pos: r.classif_pos,
          name: r.player_name || "",
          club: r.player_club_description || ""
        });
      }
    }

    if (classif.length === 0) {
      console.log(`${Y}sem classificação${X}`);
      // Verificar se é erro de acesso ou torneio vazio
      if (!classifRes.ok) {
        console.log(`    ${D}Status: ${classifRes.status} | Possivelmente precisa de sessão activa${X}`);
      }
      processedTournaments.push({ ...fullT, playerCount: 0, players: [] });
      await sleep(300);
      continue;
    }

    process.stdout.write(`${classif.length} jogadores `);

    // Scorecards
    const players = [];
    let scOk = 0;

    for (let j = 0; j < classif.length; j++) {
      const c = classif[j];
      const scRes = await dgPost(
        `/pt/classif.aspx/ScoreCard?`,
        { score_id: c.scoreId, tclub: t.ccode, tcode: t.tcode,
          scoringtype: "1", classiftype: "I", classifround: "1",
          jtStartIndex: 0, jtPageSize: 10, jtSorting: "" }
      );

      if (scRes.ok && scRes.data?.Result === "OK" && scRes.data.Records?.length) {
        const r = scRes.data.Records[0];
        const nh = r.nholes || 18;
        const scores = [], par = [], si = [], meters = [];
        for (let h = 1; h <= nh; h++) {
          scores.push(r[`gross_${h}`] || 0);
          par.push(r[`par_${h}`] || 0);
          si.push(r[`stroke_index_${h}`] || 0);
          meters.push(r[`meters_${h}`] || 0);
        }
        players.push({
          scoreId: c.scoreId, pos: c.pos,
          name: r.player_name || c.name,
          fed: r.federated_code || "",
          club: r.player_acronym || c.club,
          hcpExact: r.exact_hcp, hcpPlay: r.play_hcp,
          grossTotal: r.gross_total, parTotal: r.par_total,
          course: r.course_description || "",
          courseRating: r.course_rating, slope: r.slope,
          teeName: r.tee_name || "",
          nholes: nh, scores, par, si, meters
        });
        scOk++;
      } else {
        players.push({
          scoreId: c.scoreId, pos: c.pos,
          name: c.name, club: c.club,
          grossTotal: 999, scores: []
        });
      }
      await sleep(80);
    }

    console.log(`${G}✓${X} ${scOk} SC`);
    totalScorecards += scOk;
    processedTournaments.push({ ...fullT, playerCount: players.length, players });
    await sleep(300);
  }

  // Combinar com existentes
  const allProcessed = forceFlag ? processedTournaments : [
    ...(existingDrive?.tournaments || []),
    ...processedTournaments
  ];

  // Ordenar por data desc
  allProcessed.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const output = {
    lastUpdated: new Date().toISOString().split("T")[0],
    source: BASE_URL,
    filterYear,
    totalTournaments: allProcessed.length,
    totalPlayers: allProcessed.reduce((s, t) => s + (t.players?.length || 0), 0),
    totalScorecards: allProcessed.reduce((s, t) => s + (t.players?.filter(p => p.scores?.length > 0).length || 0), 0),
    tournaments: allProcessed
  };

  // Guardar
  const dir = path.dirname(driveDataPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(driveDataPath, JSON.stringify(output, null, 2));

  console.log(`\n  ${G}✓${X} ${B}Concluído:${X} ${newTournaments.length} torneios | ${totalScorecards} scorecards`);
  console.log(`  ${G}✓${X} Guardado: ${driveDataPath}`);

  return output;
}

// ═══════════════════════════════════════════
// FASE 2: Jogadores (precisa do browser bridge)
// ═══════════════════════════════════════════
let phase = "idle";
let playerIdx = 0;
let playerFeds = [];
let driveDataRef = null;

function resolvePlayerList() {
  if (explicitFeds.length > 0) return explicitFeds;
  const source = driveDataRef || existingDrive;
  if (!source) { console.error(`${R}Sem drive-data.json${X}`); return []; }

  const allFeds = new Set();
  for (const t of source.tournaments) {
    for (const p of t.players) { if (p.fed) allFeds.add(p.fed); }
  }

  if (recommendedFlag) {
    const recPath = path.join(process.cwd(), "recommended-feds-download.txt");
    if (fs.existsSync(recPath)) {
      const lines = fs.readFileSync(recPath, "utf-8").split("\n").map(l => l.trim()).filter(l => /^\d+$/.test(l));
      console.log(`  ${C}Recomendados: ${lines.length} jogadores${X}`);
      return lines;
    }
    newPlayersFlag = true;
  }

  if (newPlayersFlag) {
    const missing = [...allFeds].filter(f => !playersDB[f]);
    console.log(`  ${C}Novos jogadores: ${missing.length} (de ${allFeds.size} total)${X}`);
    return missing;
  }

  if (allPlayersFlag) {
    console.log(`  ${C}Todos os jogadores DRIVE: ${allFeds.size}${X}`);
    return [...allFeds];
  }
  return [];
}

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
  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => cb(body));
}

// ── SD Lookup ──
function driveToFpgDate(d) {
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

function buildSDLookup() {
  if (skipSD) return;
  console.log(`\n${B}═══ Fase 3: SD Lookup ═══${X}`);
  const source = driveDataRef || existingDrive;
  if (!source) { console.log(`  ${Y}Sem drive-data${X}`); return; }

  const driveEntries = [];
  const fedSet = new Set();
  for (const t of source.tournaments) {
    const fpgDate = driveToFpgDate(t.date);
    for (const p of t.players) {
      if (!p.fed || !p.scoreId) continue;
      const g = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
      if (g >= 900 || isNaN(g)) continue;
      driveEntries.push({ driveScoreId: String(p.scoreId), fed: p.fed, fpgDate, gross: g, nholes: p.nholes || 18 });
      fedSet.add(p.fed);
    }
  }

  const sdLookup = {};
  let matched = 0, noFile = 0;

  for (const fed of fedSet) {
    const candidates = [
      path.join(process.cwd(), "output", fed, "analysis", "data.json"),
      path.join(process.cwd(), "public", fed, "analysis", "data.json"),
    ];
    const dataFile = candidates.find(f => fs.existsSync(f));
    if (!dataFile) { noFile++; continue; }
    let pdata;
    try { pdata = JSON.parse(fs.readFileSync(dataFile, "utf-8")); } catch { continue; }

    const roundIndex = new Map();
    for (const course of (pdata.DATA || [])) {
      for (const r of (course.rounds || [])) {
        if (r.sd == null) continue;
        const gross = parseInt(r.gross);
        if (!gross || isNaN(gross)) continue;
        const key = `${r.date}|${gross}`;
        if (!roundIndex.has(key)) roundIndex.set(key, []);
        roundIndex.get(key).push({ sd: Number(r.sd), holes: r.holeCount || 18 });
      }
    }

    for (const entry of driveEntries.filter(e => e.fed === fed)) {
      const key = `${entry.fpgDate}|${entry.gross}`;
      const matches = roundIndex.get(key);
      if (!matches?.length) continue;
      const best = matches.find(c => c.holes === entry.nholes) || matches[0];
      sdLookup[entry.driveScoreId] = best.sd;
      matched++;
    }
  }

  const lookupPath = path.join(process.cwd(), "public", "data", "drive-sd-lookup.json");
  fs.mkdirSync(path.dirname(lookupPath), { recursive: true });
  fs.writeFileSync(lookupPath, JSON.stringify(sdLookup, null, 2));
  console.log(`  ${G}✓${X} SD lookup: ${matched} matched (${noFile} sem data.json)`);
  console.log(`  ${G}✓${X} Guardado: ${lookupPath}`);
}

// ── HTTP Server (apenas para Fase 2 — player bridge) ──
const BROWSER_PORT = PORT;

const BROWSER_SCRIPT = `
(async () => {
  const SERVER = "http://localhost:${BROWSER_PORT}";
  const BATCH_SIZE = ${BATCH_SIZE};
  const log = (m) => console.log("%c[DRIVE-P2] " + m, "color:#2563eb;font-weight:bold");
  const logOk = (m) => console.log("%c[DRIVE-P2] ✓ " + m, "color:green;font-weight:bold;font-size:14px");
  const logErr = (m) => console.log("%c[DRIVE-P2] ✗ " + m, "color:red");
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const isMy = location.host.includes("my.fpg");
  const ppParams = isMy ? { pp: "N" } : {};

  const fpgPost = async (endpoint, params) => {
    const qs = Object.entries(params).map(([k,v]) => k + "=" + encodeURIComponent(v)).join("&");
    const bodyObj = {};
    for (const [k,v] of Object.entries(params)) bodyObj[k] = String(v);
    if (isMy && window.jQuery) {
      return new Promise((resolve) => {
        window.jQuery.ajax({
          url: endpoint + "?" + qs, type: "POST",
          contentType: "application/json; charset=utf-8", dataType: "json",
          data: JSON.stringify(bodyObj),
          success: (data) => resolve({ ok: true, data: data?.d ?? data }),
          error: () => resolve({ ok: false })
        });
      });
    }
    return fetch(endpoint + "?" + qs, {
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest", "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(bodyObj)
    }).then(async r => {
      if (r.status !== 200) return { ok: false };
      const j = await r.json();
      return { ok: true, data: j?.d ?? j };
    }).catch(() => ({ ok: false }));
  };

  log("Fase 2 — Jogadores | " + (isMy ? "my.fpg.pt" : location.host));

  while (true) {
    let task;
    try { task = await (await fetch(SERVER + "/next-task")).json(); }
    catch (e) { logErr("Servidor não responde: " + e.message); break; }

    if (task.phase === "done") {
      logOk("CONCLUÍDO! " + task.summary);
      await fetch(SERVER + "/all-done", { method: "POST" });
      break;
    }

    if (task.phase !== "player") continue;

    const { fed, index, total, existingScoreIds, oldWHSCount, refresh, force, qualifOnly, concurrency } = task;
    const existingSet = new Set(existingScoreIds);

    log("[" + (index+1) + "/" + total + "] fed:" + fed);

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

    let extraRecords = [];
    if (!qualifOnly) {
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
    }

    const allRecords = [...hcpRecords, ...extraRecords];
    if (!hcpOk || allRecords.length === 0) {
      log("[" + fed + "] WHS falhou");
      await fetch(SERVER + "/player-done", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fed, skipped: true }) });
      continue;
    }

    if (refresh && !force) {
      const newIds = allRecords.filter(r => !existingSet.has(String(r.score_id || r.id)) && r.score_origin_id !== 7);
      if (newIds.length === 0 && allRecords.length === oldWHSCount) {
        await fetch(SERVER + "/player-done", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fed, skipped: true }) });
        continue;
      }
    }

    await fetch(SERVER + "/save-whs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fed, data: { Result: "OK", Records: allRecords }, count: allRecords.length })
    });

    const toFetch = allRecords.filter(r => {
      if (r.score_origin_id === 7) return false;
      if (qualifOnly && r.hcp_qualifying_round !== 1) return false;
      if (!force && existingSet.has(String(r.score_id || r.id))) return false;
      return true;
    });

    let scOk = 0, scFailed = 0;
    let batch = {}, batchCount = 0;
    const flush = async () => {
      if (batchCount === 0) return;
      try { await fetch(SERVER + "/save-scorecards-batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fed, scorecards: batch }) }); } catch {}
      batch = {}; batchCount = 0;
    };

    for (let i = 0; i < toFetch.length; i += concurrency) {
      const chunk = toFetch.slice(i, i + concurrency);
      const results = await Promise.allSettled(chunk.map(async (r) => {
        const sid = String(r.score_id || r.id);
        const res = await fpgPost("PlayerResults.aspx/ScoreCard", { score_id: sid, scoringtype: r.scoring_type_id, competitiontype: r.competition_type_id, ...ppParams });
        if (res.ok && res.data?.Result === "OK") return { id: sid, data: res.data };
        return null;
      }));
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          batch[r.value.id] = r.value.data; batchCount++; scOk++;
          if (batchCount >= BATCH_SIZE) await flush();
        } else scFailed++;
      }
    }
    await flush();

    await fetch(SERVER + "/player-done", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fed, scOk, scFailed })
    });
  }
})();
`;

// ── Servidor HTTP para Fase 2 ──
let server;
let stats = {
  tournamentsNew: 0, totalScorecards: 0,
  playersProcessed: 0, playersSkipped: 0, playersFailed: 0, newScorecards: 0, sdMatched: 0
};

function startPlayerServer() {
  playerFeds = resolvePlayerList();
  if (playerFeds.length === 0) {
    console.log(`  ${Y}Nenhum jogador para processar${X}`);
    buildSDLookup();
    return;
  }

  console.log(`\n${B}═══ Fase 2: Jogadores (${playerFeds.length}) ═══${X}`);
  phase = "players";
  playerIdx = 0;

  server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (req.method === "GET" && req.url === "/next-task") {
      if (phase === "players" && playerIdx < playerFeds.length) {
        const fed = playerFeds[playerIdx];
        const existing = forceFlag ? [] : getExistingScoreIds(fed);
        const oldWHS = getExistingWHSCount(fed);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ phase: "player", fed, index: playerIdx, total: playerFeds.length,
          existingScoreIds: existing, oldWHSCount: oldWHS,
          refresh: refreshFlag, force: forceFlag, qualifOnly, concurrency }));
        playerIdx++;
        return;
      }
      const summary = `${stats.playersProcessed} processados, ${stats.playersSkipped} saltados, ${stats.newScorecards} SC novos`;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ phase: "done", summary }));
      return;
    }

    if (req.method === "GET" && req.url === "/browser-script.js") {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(BROWSER_SCRIPT);
      return;
    }

    if (req.method === "POST" && req.url === "/save-whs") {
      collectBody(req, (body) => {
        try {
          const { fed, data, count } = JSON.parse(body);
          const dir = path.join(process.cwd(), "output", fed);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, "whs-list.json"), JSON.stringify(data, null, 2));
          // Actualizar players.json
          playersDB[fed] = { ...(playersDB[fed] || {}), whsCount: count, updatedAt: new Date().toISOString() };
          fs.writeFileSync(playersJsonPath, JSON.stringify(playersDB, null, 2));
        } catch {}
        res.writeHead(200); res.end("ok");
      });
      return;
    }

    if (req.method === "POST" && req.url === "/save-scorecards-batch") {
      collectBody(req, (body) => {
        try {
          const { fed, scorecards } = JSON.parse(body);
          const dir = path.join(process.cwd(), "output", fed, "scorecards");
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          for (const [id, data] of Object.entries(scorecards)) {
            fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data, null, 2));
            stats.newScorecards++;
          }
        } catch {}
        res.writeHead(200); res.end("ok");
      });
      return;
    }

    if (req.method === "POST" && req.url === "/player-done") {
      collectBody(req, (body) => {
        try {
          const d = JSON.parse(body);
          if (d.skipped) stats.playersSkipped++;
          else {
            stats.playersProcessed++;
            if (d.scOk) stats.newScorecards += d.scOk;
          }
          if (playerIdx >= playerFeds.length) {
            buildSDLookup();
            printReport();
            setTimeout(() => { server.close(); process.exit(0); }, 1000);
          }
        } catch {}
        res.writeHead(200); res.end("ok");
      });
      return;
    }

    if (req.method === "POST" && req.url === "/all-done") {
      buildSDLookup();
      printReport();
      setTimeout(() => { server.close(); process.exit(0); }, 1000);
      res.writeHead(200); res.end("ok");
      return;
    }

    res.writeHead(404); res.end("Not found");
  });

  server.listen(BROWSER_PORT, () => {
    console.log(`
${B}╔══════════════════════════════════════════════════════╗${X}
${B}║     Fase 2: Player Bridge — Porta ${BROWSER_PORT}               ║${X}
${B}╚══════════════════════════════════════════════════════╝${X}

${Y}No browser (em scoring.fpg.pt ou my.fpg.pt), cola na consola:${X}

  ${G}fetch("http://localhost:${BROWSER_PORT}/browser-script.js").then(r=>r.text()).then(eval)${X}
`);
  });
}

// ── Relatório ──
function printReport() {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`
${B}╔══════════════════════════════════════════╗${X}
${B}║     DRIVE Auto — Relatório               ║${X}
${B}╠══════════════════════════════════════════╣${X}
${B}║${X}  Jogadores:   ${String(stats.playersProcessed + " (" + stats.playersSkipped + " saltados)").padEnd(26)}${B}║${X}
${B}║${X}  SC novos:    ${String(stats.newScorecards).padEnd(26)}${B}║${X}
${B}║${X}  Tempo:       ${(Math.ceil(elapsed/60) + " min").padEnd(26)}${B}║${X}
${B}╚══════════════════════════════════════════╝${X}`);
}

// ── Main ──
const startTime = Date.now();

(async () => {
  console.log(`
${B}╔══════════════════════════════════════════════════════╗${X}
${B}║     FPG Drive Auto — Pipeline Directo                ║${X}
${B}╠══════════════════════════════════════════════════════╣${X}
${B}║${X}  Fase 1 (torneios):  ${(doTournaments ? "SIM — directo, sem browser" : "não").padEnd(32)}${B}║${X}
${B}║${X}  Fase 2 (jogadores): ${(doPlayers ? "SIM — precisa browser" : "não").padEnd(32)}${B}║${X}
${B}║${X}  Ano:                ${String(filterYear).padEnd(32)}${B}║${X}
${B}║${X}  Force:              ${(forceFlag ? "sim" : "não").padEnd(32)}${B}║${X}
${B}║${X}  players.json:       ${String(Object.keys(playersDB).length + " jogadores").padEnd(32)}${B}║${X}
${B}╚══════════════════════════════════════════╝${X}
`);

  if (doTournaments) {
    driveDataRef = await fetchDriveTournaments();
    if (!doPlayers) {
      buildSDLookup();
      process.exit(0);
    }
  }

  if (doPlayers || explicitFeds.length > 0) {
    if (!driveDataRef) driveDataRef = existingDrive;
    doPlayers = true;
    startPlayerServer();
  }
})();
