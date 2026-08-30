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
 *              É a FASE REGULAR: as Finais NÃO entram (medido em 2025, ano
 *              fechado: 0 entradas "Final" em 5 rankings de 3 zonas).
 *   Tour:      RDT{M|S|T|N|A}{ANO2} — um ranking por zona (Madeira/Sul/Tejo/
 *              Norte/Açores?), sem escalão no código. Ex: RDTM26.
 *   Final:     RFDC_{ANO2}{M|N|S|T|A|C}{ESCALAO2}{G|N} — RANKING FINAL do
 *              Challenge. Ex: RFDC_26M18G. Duas linhas por jogador:
 *                · "Fase Regular Drive Challenge" = total do DC_ correspondente
 *                · a Final regional, com os pontos a ×1.5 (arredondado):
 *                  1º 250→375 · 2º 165→248 · 3º 94→141 · 4º 75→113
 *              Só existe para zonas cuja Final já se disputou.
 *
 * OUTPUT: public/data/drive-rankings.json
 *
 * USAGE:
 *   node scripts/scrape-drive-rankings.js                    # matriz do ano corrente
 *   node scripts/scrape-drive-rankings.js --details          # + detalhe por torneio/jogador
 *   node scripts/scrape-drive-rankings.js --details --force-details   # ignora cache do detalhe
 *   node scripts/scrape-drive-rankings.js --codes DC_MADM12G26,DC_MADM12N26 --details
 *   node scripts/scrape-drive-rankings.js --year 26
 *
 * O --details é INCREMENTAL: só refaz o pedido de detalhe dos jogadores cujo
 * total de pontos mudou face ao drive-rankings.json anterior (os outros são
 * copiados). Primeira vez ~2400 pedidos; runs seguintes, poucas dezenas.
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
// Clube "dono" do ranking na FPG. O Drive (Challenge/Tour) vive no 988; os
// rankings do Circuito Aquapor vivem no 000. Cada target leva o seu.
const CLUB = "988";
const CLUB_AQUAPOR = "000";
const BASE = "https://scoring.fpg.pt/lists";

// ⚠ Opcionais desde 2026-08-30: o `linkpage.aspx?page=rankingresult` com o ack
// universal emite ele próprio a sessão a quem chega sem credenciais (medido:
// RankingsClassifLST devolve Result:OK). O warmup abaixo adopta-a.
const COOKIE = loadCookieHeader({
  exitOnFail: false,
  envVars: ["FPG_ADMISSIONS_COOKIES"],
  file: path.join(REPO, "api", ".fpg-admissions-cookies.json"),
  label: "[drive-rankings]",
}) || "";
// Jar em uso: começa nas nossas cookies (se houver) e passa a incluir o que o
// servidor emitir no warmup.
let COOKIE_JAR = COOKIE;

/* ── CLI ── */
const args = process.argv.slice(2);
const argVal = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const YEAR2 = String(argVal("--year", String(new Date().getFullYear() % 100))).padStart(2, "0");
const WITH_DETAILS = args.includes("--details");
const FORCE_DETAILS = args.includes("--force-details");
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

/* Letras de zona usadas nos códigos RFDC_ (ranking final do Challenge).
   Só existem códigos para as zonas cuja Final JÁ se disputou — as restantes
   devolvem 0 registos e são ignoradas em silêncio (como o resto da matriz). */
const ZONE_LETTERS = [
  { letter: "M", region: "madeira" },
  { letter: "N", region: "norte" },
  { letter: "S", region: "sul" },
  { letter: "T", region: "tejo" },
  { letter: "A", region: "acores" },
  { letter: "C", region: "centro" },
];

/* Rankings do Circuito Aquapor (clube 000, não 988). */
const AQUAPOR_SEXES = [
  { letter: "H", sex: "M" },
  { letter: "S", sex: "F" },
];

function buildMatrix() {
  const out = [];
  for (const z of ZONES) for (const a of AGES) for (const ty of TYPES) {
    out.push({ code: `DC_${z.token}${a}${ty.t}${YEAR2}`, series: "challenge", zone: z.region, escalao: `Sub ${a}`, type: ty.label });
  }
  for (const z of TOUR_ZONES) {
    out.push({ code: `RDT${z.letter}${YEAR2}`, series: "tour", zone: z.region, escalao: null, type: "gross" });
  }
  // Ranking FINAL do Challenge: Fase Regular (= total do DC_) + Final ×1.5.
  for (const z of ZONE_LETTERS) for (const a of AGES) for (const ty of TYPES) {
    out.push({ code: `RFDC_${YEAR2}${z.letter}${a}${ty.t}`, series: "challenge-final", zone: z.region, escalao: `Sub ${a}`, type: ty.label });
  }
  // Circuito Aquapor: 1 ranking por sexo, no clube 000 (H = masculino,
  // S = feminino). Sem zona nem escalão — é nacional e absoluto.
  for (const s of AQUAPOR_SEXES) {
    out.push({ code: `RCA${s.letter}${YEAR2}`, series: "aquapor", zone: null, escalao: null, type: "gross", sex: s.sex, club: CLUB_AQUAPOR });
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
  m = code.match(/^RCA([HS])(\d{2})$/);
  if (m) {
    const s = AQUAPOR_SEXES.find(x => x.letter === m[1]);
    return { series: "aquapor", zone: null, escalao: null, type: "gross", sex: s?.sex ?? null, club: CLUB_AQUAPOR, year: `20${m[2]}` };
  }
  m = code.match(/^RFDC_(\d{2})([A-Z])(\d{2})([GN])$/);
  if (m) {
    const z = ZONE_LETTERS.find(x => x.letter === m[2]);
    return { series: "challenge-final", zone: z?.region ?? m[2].toLowerCase(), escalao: `Sub ${m[3]}`, type: m[4] === "G" ? "gross" : "net", year: `20${m[1]}` };
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
async function warmup(code, club = CLUB) {
  /* ⚠ Segue os redirects À MÃO, acumulando cookies de TODOS os hops: o
     `fetch` com `redirect:"follow"` só expõe os headers da resposta FINAL, e a
     sessão que o gateway emite no 302 perder-se-ia pelo caminho. É isso que
     permite correr sem credenciais nossas. Ver scripts/lib/fpg-session.js. */
  const { Sessao } = require("./lib/fpg-session");
  const sess = new Sessao({ base: BASE, ua: UA });
  for (const part of String(COOKIE_JAR || "").split(";")) {
    const kv = part.trim();
    const i = kv.indexOf("=");
    if (i > 0) sess.jar.set(kv.slice(0, i).trim(), kv.slice(i + 1));
  }
  const url = `${BASE}/linkpage.aspx?page=rankingresult&club=${club}&ranking=${code}&ack=${ACK}&minpoints=1`;
  try {
    const r = await sess.get(url);
    COOKIE_JAR = sess.cookieHeader;
    const ok = r.status === 200 && !/Runtime Error|Param_Errors|Err=999/i.test(r.html);
    console.log(`[drive-rankings] warmup linkpage HTTP ${r.status}${ok ? "" : " (sem contexto)"}`);
    return ok;
  } catch (e) {
    console.log(`[drive-rankings] warmup falhou: ${e.message}`);
    return false;
  }
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
        "User-Agent": UA, ...(COOKIE_JAR ? { "Cookie": COOKIE_JAR } : {}),
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Origin": "https://scoring.fpg.pt",
        "Referer": `${BASE}/linkpage.aspx?page=rankingresult&club=${params.Club ?? CLUB}&ranking=${params.Rk_Code}&ack=${ACK}&minpoints=1`,
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
  if (!COOKIE) console.log("[drive-rankings] sem cookies — a usar o gateway público (a sessão vem do ack)");

  const targets = EXPLICIT_CODES.length
    ? EXPLICIT_CODES.map(code => ({ code, ...parseCode(code) }))
    : buildMatrix();

  await warmup(targets[0].code);

  const prev = fs.existsSync(OUT_FILE)
    ? (() => { try { return JSON.parse(fs.readFileSync(OUT_FILE, "utf8")); } catch { return { rankings: {} }; } })()
    : { rankings: {} };
  const rankings = { ...(prev.rankings || {}) };

  let found = 0, empty = 0, changed = 0, errs = 0;
  let detailFetched = 0, detailReused = 0;
  for (const t of targets) {
    const res = await pageMethod("RankingsClassifLST", { Club: t.club || CLUB, Rk_Code: t.code });
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

    // Detalhe por torneio (child table) — 1 POST por jogador.
    // INCREMENTAL: o detalhe só muda se o total de pontos do jogador mudou —
    // reaproveita-se o do run anterior para os restantes. Sem isto eram ~2400
    // pedidos/run (~12 min no Action); com isto, só os jogadores que jogaram.
    // `--force-details` refaz tudo (útil se o cache ficar suspeito).
    if (WITH_DETAILS) {
      const prevByFed = new Map(
        (rankings[t.code]?.players || []).filter(p => p.fed).map(p => [String(p.fed), p]),
      );
      let reused = 0, fetched = 0;
      for (const p of players) {
        if (!p.fed) continue;
        const old = prevByFed.get(String(p.fed));
        if (!FORCE_DETAILS && old?.results && old.points === p.points) {
          p.results = old.results;
          reused++;
          continue;
        }
        const det = await pageMethod("RankingsPlayersLST", { Club: t.club || CLUB, Rk_Code: t.code, fed_code: p.fed });
        await sleep(DELAY_MS);
        fetched++;
        if (det.records?.length) {
          p.results = det.records.map(r => ({
            date: dotNetToIso(r.tourn_date),
            tournament: r.tournament_desc || "",
            pos: r.rk_pos ?? null,
            points: r.rank_points ?? null,
          }));
        }
      }
      detailFetched += fetched;
      detailReused += reused;
    }

    const entry = {
      code: t.code, series: t.series || "challenge",
      zone: t.zone, escalao: t.escalao ?? null, type: t.type,
      sex: t.sex ?? null, club: t.club || CLUB,
      year: t.year || `20${YEAR2}`,
      fetchedAt: new Date().toISOString(),
      players,
    };
    const prevEntry = rankings[t.code];
    // Compara jogadores E metadata (série/zona/escalão/sexo/clube): sem isto,
    // enriquecer a metadata de um ranking cujos pontos não mudaram não chegava
    // a ser gravado (o run saía com "sem novidades").
    const metaOf = (e) => JSON.stringify([e.series, e.zone, e.escalao, e.type, e.sex ?? null, e.club ?? null]);
    const same = prevEntry
      && JSON.stringify(prevEntry.players) === JSON.stringify(players)
      && metaOf(prevEntry) === metaOf(entry);
    if (!same) changed++;
    rankings[t.code] = entry;
    console.log(`[drive-rankings] ✓ ${t.code} (${t.series || "challenge"} ${t.zone} ${t.escalao ?? "todos"} ${t.type}): ${players.length} jogadores${WITH_DETAILS ? " +detalhe" : ""}${same ? " (inalterado)" : ""}`);
  }

  console.log(`[drive-rankings] ${found} rankings com dados · ${empty} vazios/inexistentes · ${errs} erros · ${changed} alterados`);
  if (WITH_DETAILS) {
    console.log(`[drive-rankings] detalhe: ${detailFetched} pedidos · ${detailReused} reaproveitados do run anterior${FORCE_DETAILS ? " (--force-details)" : ""}`);
  }
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
