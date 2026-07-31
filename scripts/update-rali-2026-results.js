#!/usr/bin/env node
/**
 * update-rali-2026-results.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Substitui a entrada DRAW-ONLY do "Torneio CGSS RALI 2026" (Santo da Serra,
 * ccode 007, tcode PLACEHOLDER 90071) pelos RESULTADOS REAIS, assim que a FPG
 * os publicar no scoring.datagolf.pt.
 *
 * Contexto: o draw foi inserido manualmente a 2026-07-31 (o CGSS só envia draws
 * por email) com um tcode sintético 90071. O torneio real ganha um tcode REAL
 * quando os resultados entram no datagolf. Este script:
 *   1. Descobre o tcode REAL via TournamentsLST (ClubCode=007), por nome+data.
 *   2. Faz o scrape das classificações + scorecards (scrape-classif-node.js).
 *   3. Substitui a entrada 90071 em pull-torneios001.json pela real (mesmo
 *      "sítio": ccode 007 → tab Santo da Serra). Remove duplicados.
 *   4. Re-chaveia o draw em cgss-draws-manual.json de 90071 → tcode real, para
 *      a tab "Draw R1" continuar a aparecer ao lado dos resultados.
 *
 * COOKIES: api/.scoring-datagolf-cookies.json (ou env DATAGOLF_SCORING_COOKIES).
 *          Validar antes: node scripts/test-datagolf-node.js  → Result:"OK".
 *
 * USO:
 *   node scripts/update-rali-2026-results.js            # descobre + scrape + merge
 *   node scripts/update-rali-2026-results.js --tcode N  # salta a descoberta (tcode real conhecido)
 *   node scripts/update-rali-2026-results.js --dry-run  # não grava, só relata
 *
 * EXIT CODES: 0 = actualizado (há resultados) · 2 = ainda sem resultados
 *             (torneio por jogar / não publicado) · 1 = erro.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { loadCookieHeader } = require("./lib/cookies");

const REPO = path.resolve(__dirname, "..");
const PULL = path.join(REPO, "public", "data", "pull-torneios001.json");
const CGSS = path.join(REPO, "public", "data", "cgss-draws-manual.json");

const CCODE = "007";
const PLACEHOLDER_TCODE = "90071";
const TARGET_DATE = "2026-08-01";
const NAME_RX = /rali/i;                 // "Torneio CGSS RALI 2026"

const args = process.argv.slice(2);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes("--dry-run");
const TCODE_OVERRIDE = argVal("--tcode");

const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const daysBetween = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
const msDate = (s) => { const m = String(s || "").match(/\d+/); return m ? new Date(parseInt(m[0], 10)) : null; };
const isoDay = (d) => d ? d.toISOString().slice(0, 10) : null;

async function discoverTcode(cookie) {
  // ⚠ TournamentsLST com ClubCode="007" devolve erro (bug conhecido, ver
  // santo-da-serra-tournaments.js). Usa-se ClubCode="0" + filtro server-side
  // TournName="RALI" (devolve só as ~6 edições RALI) e filtra-se por
  // club_code=007 + ano/data. Campos: description=nome, code=tcode,
  // club_code=ccode, started_at=/Date(ms)/.
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) golf-fpg/rali-update";
  const qs = `jtStartIndex=0&jtPageSize=25&jtSorting=${encodeURIComponent("started_at DESC")}`;
  const body = {
    ClubCode: "0", dtIni: "", dtFim: "", CourseName: "", TournCode: "", TournName: "RALI",
    jtStartIndex: "0", jtPageSize: "25", jtSorting: "started_at DESC",
  };
  const res = await fetch(`https://scoring.datagolf.pt/pt/tournaments.aspx/TournamentsLST?${qs}`, {
    method: "POST",
    headers: {
      "User-Agent": UA, "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest", "Accept": "application/json, text/javascript, */*; q=0.01",
      "Origin": "https://scoring.datagolf.pt", "Referer": "https://scoring.datagolf.pt/pt/tournaments.aspx",
      "Cookie": cookie,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TournamentsLST HTTP ${res.status}`);
  const j = await res.json();
  const d = j.d || j;
  if (d.Result !== "OK") throw new Error(`TournamentsLST: ${d.Message || "erro"}`);

  const cands = (d.Records || []).map(r => ({
    tcode: String(r.code),
    ccode: String(r.club_code || "").padStart(3, "0"),
    name: r.description || "",
    campo: r.course_description || "",
    date: isoDay(msDate(r.started_at)),
  })).filter(r => r.ccode === CCODE);

  // Só o RALI de 2026: nome contém "rali", E (nome contém "2026" OU data a ≤3
  // dias de 2026-08-01). A cláusula de data exclui a edição de 2025 (10921).
  const hit = cands.find(r =>
    NAME_RX.test(norm(r.name)) &&
    (/\b2026\b/.test(r.name) || (r.date && daysBetween(r.date, TARGET_DATE) <= 3)));
  if (hit) return hit;

  console.error(`[rali] RALI 2026 ainda não aparece na TournamentsLST. Edições RALI (ccode 007) vistas:`);
  for (const c of cands.slice(0, 8)) console.error(`   ${c.date}  t${c.tcode}  ${c.name}`);
  return null;
}

function scrapeTournament(tcode) {
  // Shell-out ao scraper provado; output para ficheiro temporário.
  const tmp = path.join(os.tmpdir(), `rali-scrape-${tcode}.json`);
  try { fs.unlinkSync(tmp); } catch {}
  console.log(`[rali] a fazer scrape de ccode ${CCODE} tcode ${tcode}…`);
  try {
    execFileSync("node", [
      path.join(REPO, "scripts", "scrape-classif-node.js"),
      "--tclub", CCODE, "--tcode", String(tcode), "--out", tmp,
    ], { stdio: "inherit", cwd: REPO });
  } catch (e) {
    // exit 2 = "nada novo" NÃO é erro; qualquer outro código é.
    if (e.status !== 2) throw e;
  }
  if (!fs.existsSync(tmp)) return null;
  const out = JSON.parse(fs.readFileSync(tmp, "utf8"));
  const t = (out.tournaments || []).find(x => String(x.ccode) === CCODE && String(x.tcode) === String(tcode));
  try { fs.unlinkSync(tmp); } catch {}
  return t || null;
}

function hasResults(t) {
  return !!t && Array.isArray(t.players) &&
    t.players.some(p => typeof p.grossTotal === "number" && p.grossTotal > 0);
}

function writeAtomic(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

(async () => {
  const cookie = loadCookieHeader({
    envVars: ["DATAGOLF_SCORING_COOKIES", "DATAGOLF_COOKIES"],
    file: path.join(REPO, "api", ".scoring-datagolf-cookies.json"),
    label: "scoring.datagolf.pt",
  });
  if (!cookie) { console.error("[rali] ERRO: sem cookies scoring.datagolf.pt."); process.exit(1); }

  // 1) tcode real
  let real;
  if (TCODE_OVERRIDE) {
    real = { tcode: String(TCODE_OVERRIDE), name: "(override)", date: TARGET_DATE };
    console.log(`[rali] tcode via --tcode: ${real.tcode}`);
  } else {
    real = await discoverTcode(cookie);
    if (!real) { console.log("[rali] Sem tcode real ainda — resultados não publicados. (exit 2)"); process.exit(2); }
    console.log(`[rali] RALI encontrado: t${real.tcode} · ${real.name} · ${real.date}`);
  }

  // 2) scrape
  const scraped = scrapeTournament(real.tcode);
  if (!hasResults(scraped)) {
    console.log("[rali] Torneio ainda sem classificação publicada (0 resultados). (exit 2)");
    process.exit(2);
  }
  const nWith = scraped.players.filter(p => typeof p.grossTotal === "number" && p.grossTotal > 0).length;
  console.log(`[rali] Scrape OK: ${scraped.players.length} jogadores (${nWith} com gross).`);

  if (DRY) { console.log("[rali] --dry-run: não gravado."); process.exit(0); }

  // 3) merge em pull-torneios001.json (remove placeholder 90071 + dup do tcode real)
  const pull = JSON.parse(fs.readFileSync(PULL, "utf8"));
  const before = pull.tournaments.length;
  pull.tournaments = pull.tournaments.filter(t =>
    !(String(t.ccode) === CCODE && (String(t.tcode) === PLACEHOLDER_TCODE || String(t.tcode) === String(real.tcode))));
  pull.tournaments.push(scraped);
  if (typeof pull.totalTournaments === "number") pull.totalTournaments = pull.tournaments.length;
  writeAtomic(PULL, pull);
  console.log(`[rali] pull-torneios001.json: ${before} → ${pull.tournaments.length} torneios (placeholder ${PLACEHOLDER_TCODE} → real ${real.tcode}).`);

  // 4) re-chavear o draw (mantém a tab "Draw R1" ao lado dos resultados)
  try {
    const cgss = JSON.parse(fs.readFileSync(CGSS, "utf8"));
    const entry = (cgss.tournaments || []).find(t => String(t.ccode) === CCODE && String(t.tcode) === PLACEHOLDER_TCODE);
    if (entry) {
      // remove qualquer entrada já no tcode real para não duplicar
      cgss.tournaments = cgss.tournaments.filter(t => !(String(t.ccode) === CCODE && String(t.tcode) === String(real.tcode)));
      entry.tcode = String(real.tcode);
      entry.drawOnly = false;
      cgss.total = cgss.tournaments.length;
      writeAtomic(CGSS, cgss);
      console.log(`[rali] cgss-draws-manual.json: draw re-chaveado ${PLACEHOLDER_TCODE} → ${real.tcode}.`);
    }
  } catch (e) {
    console.warn(`[rali] aviso: falhou re-chavear cgss-draws-manual.json: ${e.message}`);
  }

  console.log("[rali] ✓ Concluído. Verificar em /FPG (filtro Santo da Serra) e commitar public/data/.");
  process.exit(0);
})().catch(e => { console.error("[rali] ERRO:", e.message); process.exit(1); });
