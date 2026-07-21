#!/usr/bin/env node
/**
 * scripts/backfill-ffgolf-links.js (2026-05-08)
 *
 * Enriquece os JSONs FFG resultats com links directos para consulta rápida.
 *
 * Adiciona a cada public/data/ffgolf-resultats/{file}.json:
 *   pagesFfgolfUrl     — sempre. Portal FFG resultats (entrada genérica, SPA)
 *   ffgolfOfficialUrl  — só majeurs. Página oficial em ffgolf.org com iframe GG
 *   ggPage             — só majeurs. ID GolfGenius (-> golfgenius.com/pages/{id})
 *   ffgolfSlug, ffgolfSection — para reconstruir URLs no futuro
 *
 * Match: nome+ano com token-overlap (todos os tokens >=3 chars do res no cat).
 *
 * USO:
 *   node scripts/backfill-ffgolf-links.js              # actualizar tudo
 *   node scripts/backfill-ffgolf-links.js --dry-run    # só relatório
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const RESULTATS_DIR = path.join(REPO, "public", "data", "ffgolf-resultats");
const CATALOG_FILE = path.join(REPO, "public", "data", "ffgolf-catalog.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const PAGES_FFGOLF_URL = "https://pages.ffgolf.org/resultats/";

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadCatalog() {
  if (!fs.existsSync(CATALOG_FILE)) {
    console.warn("[backfill] catálogo não encontrado — só será adicionado pagesFfgolfUrl");
    return [];
  }
  return JSON.parse(fs.readFileSync(CATALOG_FILE, "utf-8")).tournaments || [];
}

// Matcher partilhado (uma só cópia honesta — ver lib/ffgolf-catalog-match.js).
const { matchCatalog } = require("./lib/ffgolf-catalog-match.js");
const findCatalogMatch = (resName, resYear, catalog) => matchCatalog(resName, resYear, catalog);

function ffgolfOfficialUrl(catEntry) {
  if (!catEntry || !catEntry.year || !catEntry.slug || !catEntry.section) return null;
  return "https://www.ffgolf.org/golf-amateur/jeunes/calendrier-resultats/" +
    catEntry.section + "/" + catEntry.year + "/" + catEntry.slug + "/page-scores-tournoi";
}

function enrichTournament(t, catalog) {
  const updated = Object.assign({}, t);
  let changed = false;

  if (updated.pagesFfgolfUrl !== PAGES_FFGOLF_URL) {
    updated.pagesFfgolfUrl = PAGES_FFGOLF_URL;
    changed = true;
  }

  let year = updated.year;
  if (!year && updated.date) {
    const m = String(updated.date).match(/(\d{4})$/);
    if (m) year = parseInt(m[1], 10);
  }

  const match = findCatalogMatch(updated.name, year, catalog);
  if (match) {
    if (match.gg_page && updated.ggPage !== match.gg_page) {
      updated.ggPage = match.gg_page;
      changed = true;
    }
    const url = ffgolfOfficialUrl(match);
    if (url && updated.ffgolfOfficialUrl !== url) {
      updated.ffgolfOfficialUrl = url;
      changed = true;
    }
    if (match.slug && updated.ffgolfSlug !== match.slug) {
      updated.ffgolfSlug = match.slug;
      changed = true;
    }
    if (match.section && updated.ffgolfSection !== match.section) {
      updated.ffgolfSection = match.section;
      changed = true;
    }
  } else {
    // Sem match agora → LIMPAR quaisquer links de catálogo escritos por uma
    // versão anterior do matcher (que ligava torneios a entradas erradas). Um
    // link errado é pior que nenhum; sem match seguro, apagam-se.
    for (const k of ["ggPage", "ffgolfOfficialUrl", "ffgolfSlug", "ffgolfSection"]) {
      if (updated[k] != null) { delete updated[k]; changed = true; }
    }
  }

  return { updated, changed, matched: !!match, hasGG: !!(match && match.gg_page) };
}

function main() {
  if (!fs.existsSync(RESULTATS_DIR)) {
    console.error("[backfill] directório não existe: " + RESULTATS_DIR);
    process.exit(1);
  }
  const catalog = loadCatalog();
  console.log("[backfill] Catálogo: " + catalog.length + " torneios majeurs");

  const files = fs.readdirSync(RESULTATS_DIR).filter(f => /^\d{1,2}-\d{2}-\d+\.json$/.test(f));
  console.log("[backfill] Ficheiros: " + files.length);

  let updated = 0, matched = 0, withGG = 0;
  const sampleMatched = [];
  const unmatched = [];

  for (const f of files) {
    const filePath = path.join(RESULTATS_DIR, f);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (e) {
      console.warn("[backfill] skip " + f + " (parse: " + e.message + ")");
      continue;
    }
    const r = enrichTournament(data, catalog);
    if (r.matched) {
      matched++;
      if (r.hasGG) withGG++;
      if (sampleMatched.length < 5) sampleMatched.push({ f, name: data.name, ggPage: r.updated.ggPage });
    } else {
      const looksMajor = /(internationaux|championnat de france|grand prix jeunes majeur|grand prix national)/i.test(data.name || "");
      const yr = data.year || (data.date ? parseInt((String(data.date).match(/\d{4}$/) || [0])[0], 10) : 0);
      if (looksMajor && yr >= 2024 && unmatched.length < 8) {
        unmatched.push({ f, year: yr, name: data.name });
      }
    }
    if (r.changed) {
      if (!DRY_RUN) fs.writeFileSync(filePath, JSON.stringify(r.updated, null, 2), "utf-8");
      updated++;
    }
  }

  console.log("[backfill] Actualizados:        " + updated + "/" + files.length);
  console.log("[backfill] Match com catálogo:  " + matched);
  console.log("[backfill] Com GolfGenius page: " + withGG);
  if (sampleMatched.length) {
    console.log("[backfill] Sample matched:");
    sampleMatched.forEach(s => console.log("  " + s.f + " ggPage=" + s.ggPage + " " + (s.name || "").slice(0, 60)));
  }
  if (unmatched.length) {
    console.log("[backfill] Possíveis majeurs sem match (rever catálogo):");
    unmatched.forEach(s => console.log("  " + s.f + " [" + s.year + "] " + (s.name || "").slice(0, 80)));
  }
  if (DRY_RUN) console.log("[backfill] DRY-RUN — sem escritas");
  console.log("[backfill] A seguir: node scripts/build-ffgolf-resultats-index.js");
}

main();
