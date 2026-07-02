#!/usr/bin/env node
/**
 * scrape-federados-node.js — Refresh COMPLETO de federados.json (~15.600)
 *                            via Node puro (sem browser console).
 *
 * Versão Node-puro do antigo `scripts/scrape-federados.js` (browser console
 * em scoring.datagolf.pt). Cookies (ASP.NET_SessionId + DG_Lists_URL) via
 * env DATAGOLF_SCORING_COOKIES (Actions) ou ficheiro local
 * `api/.scoring-datagolf-cookies.json` (dev).
 *
 * Útil quando:
 *   - A FPG actualiza fotos de jogadores (paths antigos passam a 404)
 *   - Há novos federados ou mudanças de clube/HCP
 *   - Geral: refresh periódico para manter players.json + federados.json
 *     sincronizados com o estado actual da FPG.
 *
 * Características:
 *   - Endpoint: POST /pt/FederatedsList_V2.aspx/HandicapsLST
 *   - jtPageSize=100 (200+ → HTTP 500), ~156 páginas, ~30s total
 *   - Filtros default: FedStat=9 (activos), todos os clubes, género, escalão
 *   - .NET /Date(ms)/ → ISO YYYY-MM-DD para 4 campos
 *   - Compara byte-a-byte com federados.json existente; só grava se mudou
 *   - Exit code 0 = ficheiro actualizado, 2 = sem alterações, 1 = erro
 *
 * Uso:
 *   node scripts/scrape-federados-node.js                 # full refresh, grava se mudou
 *   node scripts/scrape-federados-node.js --check-only    # não grava, só compara
 *   node scripts/scrape-federados-node.js --max-pages 5   # limite (debug)
 *   node scripts/scrape-federados-node.js --out ./fed.json
 *
 * Pré-requisito: api/.scoring-datagolf-cookies.json com cookies frescos do
 * Chrome 90 (ver CLAUDE.md "Cenário 1: Os cookies expiraram").
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const { loadCookieHeader } = require("./lib/cookies");
const { lisbonCivilDayStr } = require("../lib/helpers");

const ROOT = path.resolve(__dirname, "..");
const COOKIES_PATH   = path.join(ROOT, "api", ".scoring-datagolf-cookies.json");
const FEDERADOS_PATH = path.join(ROOT, "public", "data", "federados.json");

const ENDPOINT = "https://scoring.datagolf.pt/pt/FederatedsList_V2.aspx/HandicapsLST";

// ── Args CLI ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const checkOnly = args.includes("--check-only");
const force     = args.includes("--force");
// Bug fix 2026-05-05: parseInt("Infinity") devolve NaN → loop `page < NaN`
// nunca corre → script gravava 0 registos por cima de federados.json bom.
// Sem default explícito, só limitar quando o user passa --max-pages.
const maxPagesRaw = argVal("--max-pages");
const maxPages    = maxPagesRaw ? parseInt(maxPagesRaw, 10) : Number.MAX_SAFE_INTEGER;
const outPath   = argVal("--out") || FEDERADOS_PATH;
const pageSize  = parseInt(argVal("--page-size") || "100", 10);
const delayMs   = parseInt(argVal("--delay-ms") || "150", 10);

if (Number.isNaN(maxPages)) {
  console.error(`✗ --max-pages inválido: "${maxPagesRaw}" — esperava um inteiro.`);
  process.exit(1);
}

// ── Cookies ──────────────────────────────────────────────────────
// Fonte (por ordem): env DATAGOLF_SCORING_COOKIES (Actions) → ficheiro
// api/.scoring-datagolf-cookies.json (dev local). Via lib partilhada.
function loadCookies() {
  return loadCookieHeader({
    envVars: ["DATAGOLF_SCORING_COOKIES"],
    file: COOKIES_PATH,
    label: "[federados]",
  });
}

// ── .NET /Date(ms)/ → ISO YYYY-MM-DD (dia civil de Lisboa) ────────
// Os epochs codificam meia-noite em hora de Lisboa; converter via
// toISOString() dava o dia -1 no horário de verão (Abril-Outubro).
function parseNetDate(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^\/Date\((-?\d+)\)\/$/);
  return m ? lisbonCivilDayStr(parseInt(m[1], 10)) : null;
}

const DATE_FIELDS = new Set(["birthdate", "admission_date", "last_hcp_date", "dt_aniv"]);
function normalize(r) {
  const out = {};
  for (const k of Object.keys(r)) {
    out[k] = DATE_FIELDS.has(k) ? parseNetDate(r[k]) : r[k];
  }
  return out;
}

// ── Fetch dum batch ──────────────────────────────────────────────
async function fetchPage(cookieHeader, startIndex, batchSize) {
  const body = {
    name: "", fedno: "", ClubCode: "0", FedStat: "9", Gender: "0",
    Agelev: "0", HcpStat: "0", FHcp: "", THcp: "", ProAm: "0",
    IniFlag: "0", FAge: "", TAge: "", Permit: "", MaxResults: "0",
    MessMax: "Demasiados resultados. Por favor refine a pesquisa.",
    jtStartIndex: String(startIndex),
    jtPageSize:   String(batchSize),
    jtSorting:    "name ASC",
  };

  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
      "Origin":  "https://scoring.datagolf.pt",
      "Referer": "https://scoring.datagolf.pt/pt/FederatedsList_V2.aspx",
      "Cookie":  cookieHeader,
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) throw new Error(`HTTP ${r.status} @ startIndex=${startIndex}`);
  const json = await r.json();
  const d = json.d || json;
  if (d.Result !== "OK") throw new Error(`Result=${d.Result} msg=${d.Message || "(vazio)"}`);
  return { records: d.Records || [], total: d.TotalRecordCount };
}

// ── Comparação byte-a-byte ignorando timestamps ─────────────────
function jsonEqualIgnoringTimestamps(a, b) {
  if (!a || !b) return false;
  if ((a.players || []).length !== (b.players || []).length) return false;
  // Comparar players canonicamente: ordenar por federation_code e stringify
  const canon = (file) => {
    const sorted = [...(file.players || [])].sort(
      (x, y) => String(x.federation_code).localeCompare(String(y.federation_code))
    );
    return JSON.stringify(sorted);
  };
  return canon(a) === canon(b);
}

// ── Diff resumo: quantos players têm campo X diferente ──────────
function summarizeChanges(prev, next) {
  if (!prev) return { newPlayers: (next.players || []).length, photoChanges: 0, hcpChanges: 0, clubChanges: 0 };
  const prevByFed = new Map((prev.players || []).map(p => [String(p.federation_code), p]));
  const nextByFed = new Map((next.players || []).map(p => [String(p.federation_code), p]));
  let photoChanges = 0, hcpChanges = 0, clubChanges = 0, newPlayers = 0, removed = 0;
  for (const [fed, n] of nextByFed) {
    const p = prevByFed.get(fed);
    if (!p) { newPlayers++; continue; }
    if ((p.photo || null) !== (n.photo || null)) photoChanges++;
    if ((p.hcp_exact ?? null) !== (n.hcp_exact ?? null)) hcpChanges++;
    if ((p.club_code || "") !== (n.club_code || "")) clubChanges++;
  }
  for (const fed of prevByFed.keys()) if (!nextByFed.has(fed)) removed++;
  return { newPlayers, removed, photoChanges, hcpChanges, clubChanges };
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const cookieHeader = loadCookies();
  console.log(`→ Endpoint: ${ENDPOINT}`);
  console.log(`→ jtPageSize=${pageSize}, delay=${delayMs}ms, max-pages=${maxPages === Infinity ? "∞" : maxPages}`);
  console.log(`→ A iniciar...`);

  const t0 = Date.now();
  const all = [];
  let total = null;
  let page = 0;

  while (page < maxPages) {
    const startIndex = page * pageSize;
    let data;
    try {
      data = await fetchPage(cookieHeader, startIndex, pageSize);
    } catch (e) {
      console.warn(`  Falha na página ${page} (${startIndex}): ${e.message} — retry em 2s`);
      await new Promise(r => setTimeout(r, 2000));
      try {
        data = await fetchPage(cookieHeader, startIndex, pageSize);
      } catch (e2) {
        console.error(`  Falha dupla na página ${page}: ${e2.message} — abortar com ${all.length} recolhidos.`);
        break;
      }
    }
    total = data.total;
    if (!data.records.length) break;

    for (const r of data.records) all.push(normalize(r));

    const pct = total ? ((all.length / total) * 100).toFixed(1) : "?";
    process.stdout.write(`\r  Página ${page + 1} · ${all.length}/${total ?? "?"} (${pct}%) · ${((Date.now() - t0) / 1000).toFixed(1)}s   `);

    page++;
    if (total && all.length >= total) break;
    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  }
  process.stdout.write("\n");

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`✓ Recolhidos ${all.length} de ${total ?? "?"} federados em ${elapsed}s (${page} páginas)`);

  // ── Estatísticas resumo ─────────────────────────────────────────
  const byAge = {}, byCountry = {}, byGender = { M: 0, F: 0 };
  let withBirthdate = 0, withPhoto = 0;
  for (const p of all) {
    byAge[p.age_level] = (byAge[p.age_level] || 0) + 1;
    byCountry[p.country_prefix] = (byCountry[p.country_prefix] || 0) + 1;
    if (p.gender) byGender[p.gender] = (byGender[p.gender] || 0) + 1;
    if (p.birthdate) withBirthdate++;
    if (p.photo) withPhoto++;
  }
  console.log(`  Com fotografia:    ${withPhoto} / ${all.length} (${(withPhoto / all.length * 100).toFixed(1)}%)`);
  console.log(`  Com data nasc.:    ${withBirthdate} / ${all.length}`);
  console.log(`  Por género:        M=${byGender.M}, F=${byGender.F}`);

  // ── Output ──────────────────────────────────────────────────────
  const out = {
    generated: new Date().toISOString(),
    source: "scoring.datagolf.pt/pt/FederatedsList_V2.aspx",
    totalReported: total,
    totalScraped: all.length,
    players: all,
  };

  // Carregar versão prévia para comparar
  let prev = null;
  if (fs.existsSync(outPath)) {
    try {
      prev = JSON.parse(fs.readFileSync(outPath, "utf8"));
    } catch (e) {
      console.warn(`  Aviso: não consegui ler ${outPath} — assumir primeiro run.`);
    }
  }

  const changes = summarizeChanges(prev, out);
  console.log();
  console.log(`Diff vs ${path.basename(outPath)}:`);
  console.log(`  Jogadores novos:   ${changes.newPlayers}`);
  console.log(`  Jogadores fora:    ${changes.removed ?? 0}`);
  console.log(`  Fotos alteradas:   ${changes.photoChanges}`);
  console.log(`  HCP alterado:      ${changes.hcpChanges}`);
  console.log(`  Clube alterado:    ${changes.clubChanges}`);

  const isUnchanged = prev && jsonEqualIgnoringTimestamps(prev, out);
  if (isUnchanged) {
    console.log(`✓ Sem alterações reais — skip gravação.`);
    process.exit(2);
  }

  // ── Sanity guards para impedir overwrite com dados parciais/vazios ──
  // Aprendido em 2026-05-05 quando um bug do --max-pages NaN gravou 0
  // registos por cima de 15600 bons. Estas guardas só podem ser
  // ultrapassadas com --force.

  // Guard 1: nunca gravar 0 registos.
  if (all.length === 0) {
    console.error(`✗ Recolhidos 0 registos — recusar gravar (provável falha de cookies / endpoint).`);
    console.error(`  Verificar api/.scoring-datagolf-cookies.json e correr de novo.`);
    process.exit(1);
  }

  // Guard 2: se o scrape parou antes de chegar ao total reportado E o
  // user não passou --max-pages explicitamente, é run incompleto — recusar.
  const isCappedRun = total && all.length < total;
  if (isCappedRun && !maxPagesRaw && !force) {
    console.error(`✗ Run incompleto: ${all.length} de ${total} (parou aos ${page} pages sem --max-pages).`);
    console.error(`  Refazer ou usar --force se intencional.`);
    process.exit(1);
  }

  // Guard 3: se o resultado é DRASTICAMENTE menor que o anterior (>10% de
  // perda), recusar — provavelmente run parcial / max-pages baixo.
  if (prev && prev.players && prev.players.length > 0) {
    const ratio = all.length / prev.players.length;
    if (ratio < 0.9 && !force) {
      console.error(`✗ Recolhidos ${all.length} mas anterior tinha ${prev.players.length} — perda de ${((1 - ratio) * 100).toFixed(1)}%.`);
      console.error(`  Recusar gravar sem --force (provável run parcial via --max-pages).`);
      console.error(`  Se intencional, correr com --force.`);
      process.exit(1);
    }
  }

  // Guard 4: se foi um run com --max-pages explícito, avisar mas permitir
  // (com --force ou sem) — user sabe que está a fazer scrape parcial.
  if (maxPagesRaw && all.length < (total ?? Infinity)) {
    console.warn(`⚠ Run com --max-pages=${maxPagesRaw} (${all.length}/${total} federados).`);
    if (!force) {
      console.error(`✗ Recusar gravar federados.json parcial — usar --force se intencional, ou --out para outro ficheiro.`);
      process.exit(1);
    }
    console.warn(`  --force activo: vai gravar ficheiro PARCIAL. CUIDADO — vai destruir dados.`);
  }

  if (checkOnly) {
    console.log(`(check-only) Alterações detectadas mas não foi gravado.`);
    process.exit(0);
  }

  console.log(`→ A gravar ${outPath}...`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(`✓ Gravado: ${outPath} (${sizeKb} KB)`);
  process.exit(0);
}

main().catch(err => {
  console.error(`✗ Erro fatal: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
