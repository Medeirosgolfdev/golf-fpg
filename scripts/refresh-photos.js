#!/usr/bin/env node
/**
 * refresh-photos.js — Actualiza o campo `photo` em federados.json para
 * jogadores específicos, sem ter de re-scrapar os 15600 federados.
 *
 * Útil quando a FPG actualiza a foto de um jogador (ex: foto nova de
 * carreira) e o path antigo guardado em `federados.json` passa a 404.
 *
 * Como funciona:
 *   1. Lê cookies de `api/.scoring-datagolf-cookies.json` (ASP.NET_SessionId
 *      + DG_Lists_URL — capturados via Chrome 90 — ver CLAUDE.md secção
 *      "Backend 2: scoring.datagolf.pt").
 *   2. Para cada fed code recebido, chama
 *      `POST /pt/FederatedsList_V2.aspx/HandicapsLST` com `fedno: <fed>`
 *      → devolve 1 record com 32 campos, incluindo o `photo` actual.
 *   3. Compara o `photo` recebido com o guardado em `federados.json` —
 *      se mudou, actualiza E grava o ficheiro.
 *
 * Uso:
 *   node scripts/refresh-photos.js                    # default: Manuel (52884)
 *   node scripts/refresh-photos.js 52884              # 1 jogador
 *   node scripts/refresh-photos.js 52884 41124 47078  # vários
 *   node scripts/refresh-photos.js --all-tracked      # todos os PJA / Sub-* em players.json
 *   node scripts/refresh-photos.js --check-only       # só lista o que mudou, não grava
 *
 * Exit codes: 0 = ficheiro actualizado, 2 = sem alterações, 1 = erro.
 */
"use strict";

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const COOKIES_PATH   = path.join(ROOT, "api", ".scoring-datagolf-cookies.json");
const FEDERADOS_PATH = path.join(ROOT, "public", "data", "federados.json");
const PLAYERS_PATH   = path.join(ROOT, "public", "data", "players.json");

const ENDPOINT = "https://scoring.datagolf.pt/pt/FederatedsList_V2.aspx/HandicapsLST";

// ── Args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const checkOnly  = args.includes("--check-only");
const allTracked = args.includes("--all-tracked");
const fedArgs    = args.filter(a => /^\d+$/.test(a));

// ── Cookies ──────────────────────────────────────────────────────
function loadCookies() {
  if (!fs.existsSync(COOKIES_PATH)) {
    console.error(`✗ Ficheiro de cookies não encontrado: ${COOKIES_PATH}`);
    console.error(`  Capturar via Chrome 90 (ver CLAUDE.md "Cenário 1") e gravar em ${COOKIES_PATH}.`);
    process.exit(1);
  }
  const j = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8"));
  if (!j.cookieHeader) {
    console.error(`✗ Cookies inválidos: falta campo cookieHeader em ${COOKIES_PATH}`);
    process.exit(1);
  }
  return j.cookieHeader;
}

// ── Fetch dum federado individual ────────────────────────────────
async function fetchFederado(cookieHeader, fed) {
  const body = {
    name: "", fedno: String(fed), ClubCode: "0", FedStat: "9", Gender: "0",
    Agelev: "0", HcpStat: "0", FHcp: "", THcp: "", ProAm: "0",
    IniFlag: "0", FAge: "", TAge: "", Permit: "", MaxResults: "0",
    MessMax: "Demasiados resultados. Por favor refine a pesquisa.",
    jtStartIndex: "0",
    jtPageSize:   "10",
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

  if (!r.ok) throw new Error(`HTTP ${r.status} para fed=${fed}`);
  const json = await r.json();
  const d = json.d || json;
  if (d.Result !== "OK") throw new Error(`Result=${d.Result} para fed=${fed}: ${d.Message || ""}`);
  const recs = d.Records || [];
  // O servidor pode devolver 0 records se o jogador é inactivo (FedStat=9 filtra),
  // ou múltiplos se o fedno parcial bate com vários. Procurar match exacto.
  const match = recs.find(rec => String(rec.federation_code) === String(fed));
  return match || null;
}

// ── Resolver lista de fed codes a refrescar ──────────────────────
function resolveFedCodes() {
  if (fedArgs.length > 0) return fedArgs.map(String);
  if (allTracked) {
    if (!fs.existsSync(PLAYERS_PATH)) {
      console.error(`✗ players.json não encontrado: ${PLAYERS_PATH}`);
      process.exit(1);
    }
    const p = JSON.parse(fs.readFileSync(PLAYERS_PATH, "utf8"));
    const list = Array.isArray(p) ? p : Object.values(p);
    return list.map(x => String(x.nfed || x.fed || "")).filter(Boolean);
  }
  return ["52884"]; // default: Manuel
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const cookieHeader = loadCookies();
  const fedCodes = resolveFedCodes();
  console.log(`→ Refresh de fotos para ${fedCodes.length} jogador(es): ${fedCodes.join(", ")}`);
  console.log(`  ${checkOnly ? "(modo check-only — não grava)" : "(vai gravar federados.json se houver alterações)"}`);

  console.log(`→ A ler federados.json...`);
  const federadosFile = JSON.parse(fs.readFileSync(FEDERADOS_PATH, "utf8"));
  const players = federadosFile.players || [];
  const byFed = new Map(players.map(p => [String(p.federation_code), p]));

  const changes = [];
  const errors = [];

  for (const fed of fedCodes) {
    process.stdout.write(`  fed=${fed}... `);
    try {
      const live = await fetchFederado(cookieHeader, fed);
      if (!live) {
        console.log(`não encontrado na FPG (FedStat=9)`);
        continue;
      }
      const local = byFed.get(String(fed));
      const livePhoto  = live.photo || null;
      const localPhoto = local ? (local.photo || null) : null;

      if (livePhoto === localPhoto) {
        console.log(`OK (foto inalterada: ${livePhoto ? livePhoto.substring(0, 40) + "…" : "null"})`);
        continue;
      }

      console.log(`MUDOU`);
      console.log(`     antiga: ${localPhoto || "(null)"}`);
      console.log(`     nova:   ${livePhoto  || "(null)"}`);

      if (local) {
        local.photo = livePhoto;
        changes.push({ fed, name: local.name, from: localPhoto, to: livePhoto });
      } else {
        // Não está em federados.json (provavelmente novo / inactivo) — não criamos entry novo
        // só por isto. Reportamos para o user saber.
        console.log(`     ⚠ Não está em federados.json — saltar.`);
      }
    } catch (err) {
      console.log(`ERRO: ${err.message}`);
      errors.push({ fed, error: err.message });
    }
    // Pequeno delay para não sobrecarregar o servidor
    await new Promise(r => setTimeout(r, 200));
  }

  console.log();
  console.log(`────────────────────────────────────────`);
  console.log(`Total: ${fedCodes.length}, alteradas: ${changes.length}, erros: ${errors.length}`);

  if (errors.length > 0) {
    console.log(`Erros:`);
    for (const e of errors) console.log(`  fed=${e.fed}: ${e.error}`);
  }

  if (changes.length === 0) {
    console.log(`✓ Sem alterações — nada a gravar.`);
    process.exit(2);
  }

  if (checkOnly) {
    console.log(`(check-only) ${changes.length} alteração(ões) detectadas, mas não foi gravado.`);
    process.exit(0);
  }

  console.log(`→ A gravar federados.json (${players.length} jogadores)...`);
  fs.writeFileSync(FEDERADOS_PATH, JSON.stringify(federadosFile, null, 2), "utf8");
  console.log(`✓ Gravado: ${FEDERADOS_PATH}`);
  console.log();
  console.log(`Resumo das alterações:`);
  for (const c of changes) {
    console.log(`  fed=${c.fed} (${c.name}): ${c.from || "null"} → ${c.to || "null"}`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(`✗ Erro fatal: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
