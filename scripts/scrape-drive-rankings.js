#!/usr/bin/env node
/**
 * scripts/scrape-drive-rankings.js (2026-07-10, v2)
 * ─────────────────────────────────────────────────────────────────────────
 * Scraper dos RANKINGS OFICIAIS do Drive Challenge (scoring.fpg.pt).
 *
 * A página linkpage?page=rankingresult é uma SHELL jTable (v1 tentava parsear
 * HTML e vinha vazia). Os dados vêm por PageMethod POST (padrão FPG, igual ao
 * classif.aspx/ClassifLST — ver CLAUDE.md "PageMethods"):
 *
 *   POST /lists/rankings_classif.aspx/RankingsClassifLST?Club=988&Rk_Code={code}
 *     → Records: [{ rk_pos, name, federated_code, acronym (clube),
 *                   points_real (total), classif_status, rk_type }]
 *   POST /lists/rankings_classif.aspx/RankingsPlayersLST?Club=&Rk_Code=&fed_code=
 *     → detalhe por torneio: [{ tourn_date, tournament_desc, rk_pos, rank_points }]
 *
 * Warmup: GET ao linkpage (gateway canónico) UMA vez por run aquece a sessão.
 *
 * CODES conhecidos:
 *   Challenge: DC_{ZONA4}{ESCALAO2}{G|N}{ANO2} — MADM/TEJO/SUL_/NOR_/ACO_,
 *              Sub 10-18, Gross/Net. Ex: DC_MADM12G26.
 *   Tour:      RDT{M|S|T|N|A}{ANO2} — um ranking por zona (Madeira/Sul/Tejo/
 *              Norte/Açores?), sem escalão no código. Ex: RDTM26.
 *
 * OUTPUT: public/data/drive-rankings.json
 *
 * USAGE:
 *   node scripts/scrape-drive-rankings.js                    # matriz do ano corrente
 *   node scripts/scrape-drive-rankings.js --details          # + detalhe por torneio/jogador
 *   node scripts/scrape-drive-rankings.js --codes DC_MADM12G26,DC_MADM12N26 --details
 *   node scripts/scrape-drive-rankings.js --year 26
 *
 * EXIT: 0 = dados novos · 2 = sem novidades · 1 = erro fatal
 * ─────────────────────────────────────────────────────────────────────────
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { loadCookieHeader } = require("./lib/cookies");
const { writeJsonAtomic } = require("./lib/atomic-write");
const { lisbonCivilDayStr } = require("../lib/helpers");

const REPO = path.resolve(__dirname, "..");
const OUT_FILE = path.join(REPO, "public", "data", "drive-rankings.json");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const ACK = "8428ACK987";
const CLUB = "988";
const BASE = "https://scoring.fpg.pt/lists";

const COOKIE = loadCookieHeader({
  envVars: ["FPG_ADMISSIONS_COOKIES"],
  file: path.join(REPO, "api", ".fpg-admissions-cookies.json"),
  label: "[drive-rankings]",
});

/* ── CLI ── */
const args = process.argv.slice(2);
const argVal = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const YEAR2 = String(argVal("--year", String(new Date().getFullYear() % 100))).padStart(2, "0");
const WITH_DETAILS = args.includes("--details");
const EXPLICIT_CODES = (argVal("--codes", "") || "").split(",").map(s => s.trim()).filter(Boolean);
const DELAY_MS = parseInt(argVal("--delay", "150"), 10);

const ZONES = [
  { token: "MADM", region: "madeira" },
  { token: "TEJO", region: "tejo" },
  { token: "SUL_", region: "sul" },
  { token: "NOR_", region: "norte" },
  { token: "ACOR", region: "acores" },
  { token: "AZOR", region: "acores" },
  { token: "ACO_", region: "acores" },
];
const AGES = ["10", "12", "14", "16", "18"];
const TYPES = [{ t: "G", label: "gross" }, { t: "N", label: "net" }];

/* Rankings Drive TOUR: um por zona, letra única (sem escalão no código). */
const TOUR_ZONES = [
  { letter: "M", region: "madeira" },
  { letter: "S", region: "sul" },
  { letter: "T", region: "tejo" },
  { letter: "N", region: "norte" },
  { letter: "A", region: "acores" },  // candidato — sondado como os da matriz DC
];

function buildMatrix() {
  const out = [];
  for (const z of ZONES) for (const a of AGES) for (const ty of TYPES) {
    out.push({ code: `DC_${z.token}${a}${ty.t}${YEAR2}`, series: "challenge", zone: z.region, escalao: `Sub ${a}`, type: ty.label });
  }
  for (const z of TOUR_ZONES) {
    out.push({ code: `RDT${z.letter}${YEAR2}`, series: "tour", zone: z.region, escalao: null, type: "gross" });
  }
  return out;
}
function parseCode(code) {
  let m = code.match(/^DC_(.{4})(\d{2})([GN])(\d{2})$/);
  if (m) {
    const z = ZONES.find(x => x.token === m[1]);
    return { series: "challenge", zone: z?.region ?? m[1].toLowerCase(), escalao: `Sub ${m[2]}`, type: m[3] === "G" ? "gross" : "net", year: `20${m[4]}` };
  }
  m = code.match(/^RDT([A-Z])(\d{2})$/);
  if (m) {
    const z = TOUR_ZONES.find(x => x.letter === m[1]);
    return { series: "tour", zone: z?.region ?? m[1].toLowerCase(), escalao: null, type: "gross", year: `20${m[2]}` };
  }
  return { series: null, zone: null, escalao: null, type: null, year: null };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function dotNetToIso(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(String(s))) return String(s).slice(0, 10);
  const m = String(s).match(/\d+/);
  if (!m) return null;
  const ms = parseInt(m[0], 10);
  return Number.isFinite(ms) ? lisbonCivilDayStr(ms) : null;
}

/* ── HTTP ── */
async function warmup(code) {
  const url = `${BASE}/linkpage.aspx?page=rankingresult&club=${CLUB}&ranking=${code}&ack=${ACK}&minpoints=1`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA, "Cookie": COOKIE,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-PT,pt;q=0.9",
      "Referer": "https://scoring.fpg.pt/",
    },
    redirect: "follow",
  });
  await r.text();
  console.log(`[drive-rankings] warmup linkpage HTTP ${r.status}`);
  return r.ok;
}

/** PageMethod POST — params extra vão na URL E espelhados no body (padrão FPG). */
async function pageMethod(method, params) {
  const qs = new URLSearchParams({ ...params, jtStartIndex: "0", jtPageSize: "200" }).toString();
  const url = `${BASE}/rankings_classif.aspx/${method}?${qs}`;
  const body = { ...params, jtStartIndex: "0", jtPageSize: "200" };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA, "Cookie": COOKIE,
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Origin": "https://scoring.fpg.pt",
        "Referer": `${BASE}/linkpage.aspx?page=rankingresult&club=${CLUB}&ranking=${params.Rk_Code}&ack=${ACK}&minpoints=1`,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { error: `http-${r.status}`, records: [] };
    const j = await r.json();
    const d = j.d || j;
    if (d.Result !== "OK") return { error: d.Message || d.Result || "erro", records: [] };
    return { records: d.Records || [] };
  } catch (e) {
    return { error: e.message, records: [] };
  }
}

/* ── Main ── */
(async () => {
  if (!COOKIE) { console.error("[drive-rankings] sem cookies (FPG_ADMISSIONS_COOKIES / api/.fpg-admissions-cookies.json)"); process.exit(1); }

  const targets = EXPLICIT_CODES.length
    ? EXPLICIT_CODES.map(code => ({ code, ...parseCode(code) }))
    : buildMatrix();

  await warmup(targets[0].code);

  const prev = fs.existsSync(OUT_FILE)
    ? (() => { try { return JSON.parse(fs.readFileSync(OUT_FILE, "utf8")); } catch { return { rankings: {} }; } })()
    : { rankings: {} };
  const rankings = { ...(prev.rankings || {}) };

  let found = 0, empty = 0, changed = 0, errs = 0;
  for (const t of targets) {
    const res = await pageMethod("RankingsClassifLST", { Club: CLUB, Rk_Code: t.code });
    await sleep(DELAY_MS);
    if (res.error && !/http-500/.test(res.error)) { errs++; console.warn(`[drive-rankings] ⚠ ${t.code}: ${res.error}`); continue; }
    if (!res.records || res.records.length === 0) { empty++; continue; }
    found++;

    const players = res.records.map(rec => ({
      pos: rec.rk_pos ?? null,
      name: rec.name || "",
      fed: rec.federated_code != null ? String(rec.federated_code) : null,
      club: rec.acronym || null,
      points: rec.points_real ?? null,
      status: rec.classif_status ?? null,
    }));

    // Detalhe por torneio (child table) — opcional, 1 POST por jogador.
    if (WITH_DETAILS) {
      for (const p of players) {
        if (!p.fed) continue;
        const det = await pageMethod("RankingsPlayersLST", { Club: CLUB, Rk_Code: t.code, fed_code: p.fed });
        await sleep(DELAY_MS);
        if (det.records?.length) {
          p.results = det.records.map(r => ({
            date: dotNetToIso(r.tourn_date),
            tournament: r.tournament_desc || "",
            pos: r.rk_pos ?? null,
            points: r.rank_points ?? null,
          }));
        }
      }
    }

    const entry = {
      code: t.code, series: t.series || "challenge",
      zone: t.zone, escalao: t.escalao ?? null, type: t.type,
      year: t.year || `20${YEAR2}`,
      fetchedAt: new Date().toISOString(),
      players,
    };
    const prevEntry = rankings[t.code];
    const same = prevEntry && JSON.stringify(prevEntry.players) === JSON.stringify(players);
    if (!same) changed++;
    rankings[t.code] = entry;
    console.log(`[drive-rankings] ✓ ${t.code} (${t.series || "challenge"} ${t.zone} ${t.escalao ?? "todos"} ${t.type}): ${players.length} jogadores${WITH_DETAILS ? " +detalhe" : ""}${same ? " (inalterado)" : ""}`);
  }

  console.log(`[drive-rankings] ${found} rankings com dados · ${empty} vazios/inexistentes · ${errs} erros · ${changed} alterados`);
  if (found === 0) {
    console.error("[drive-rankings] nenhum ranking devolveu dados — cookies expirados? (testa: node scripts/test-fpg-admissions-auth.js)");
    process.exit(1);
  }
  if (changed === 0) { console.log("[drive-rankings] sem novidades (exit 2)"); process.exit(2); }

  writeJsonAtomic(OUT_FILE, {
    scrapedAt: new Date().toISOString(),
    source: "scoring.fpg.pt rankings_classif.aspx/RankingsClassifLST (club=988)",
    rankings,
  });
  console.log(`[drive-rankings] ✓ Gravado ${OUT_FILE}`);
  process.exit(0);
})().catch(e => { console.error("[drive-rankings] ERRO fatal:", e); process.exit(1); });
