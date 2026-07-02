#!/usr/bin/env node
/**
 * fix-net-epoch-dates.js — Reparação OFFLINE do bug de fuso nas datas .NET.
 *
 * Contexto: até 2026-07-02, os scrapers convertiam os epochs .NET /Date(ms)/
 * (que codificam meia-noite em hora de Lisboa) com toISOString(), o que dava
 * o dia -1 para qualquer data no horário de verão português (fim de Março a
 * fim de Outubro). Os scripts foram corrigidos (lisbonCivilDayStr), mas os
 * JSON já gravados ficaram com datas erradas — e o re-scrape depende de
 * cookies frescos.
 *
 * Este script inverte a transformação errada SEM re-scrapear: para cada data
 * gravada S, o dia real D é o único candidato em {S, S+1} cuja meia-noite de
 * Lisboa, convertida com o toISOString() bugado, devolve S. A inversão é
 * exacta excepto no domingo da mudança de hora da Primavera (S e S+1 mapeiam
 * ambos para S) — esses casos ficam como estão e são contados no relatório.
 *
 * Alvos:
 *   - public/data/federados.json            (birthdate, admission_date, last_hcp_date, dt_aniv)
 *   - data-archive/federados-inativos.json  (idem)
 *   - public/data/players.json              (dob ← federados/inativos reparados)
 *
 * ⚠ NÃO É IDEMPOTENTE: depois de reparado, um dia de verão correcto é
 * indistinguível do valor bugado do dia seguinte — um segundo run somaria
 * +1 outra vez. Duas guardas impedem isso:
 *   1. marcador top-level `dateRepair` gravado no ficheiro reparado;
 *   2. recusa ficheiros com `generated` >= 2026-07-03 (já produzidos pelos
 *      scrapers corrigidos — datas certas, reparar corrompia).
 * Ferramenta de ocasião única (2026-07-02); mantida como referência.
 *
 * Uso:
 *   node scripts/fix-net-epoch-dates.js            # aplica
 *   node scripts/fix-net-epoch-dates.js --dry-run  # só relatório
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const ROOT = path.resolve(__dirname, "..");
const FEDERADOS = path.join(ROOT, "public", "data", "federados.json");
const INATIVOS  = path.join(ROOT, "data-archive", "federados-inativos.json");
const PLAYERS   = path.join(ROOT, "public", "data", "players.json");

const DRY = process.argv.includes("--dry-run");
const DATE_FIELDS = ["birthdate", "admission_date", "last_hcp_date", "dt_aniv"];

// ── Inversão da conversão bugada ───────────────────────────────────
// Meia-noite de Lisboa do dia civil `iso`, em ms UTC.
const _lisbonHourFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", hour12: false, hourCycle: "h23",
});
function lisbonMidnightMs(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  for (const offH of [0, 1]) {
    const ms = base - offH * 3600e3;
    const f = _lisbonHourFmt.format(ms); // "YYYY-MM-DD, 00"
    if (f.startsWith(iso) && f.endsWith("00")) return ms;
  }
  return base;
}
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z"); // meio-dia evita bordas
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// O que o código ANTIGO gravava para o dia real `iso`.
function buggyStored(iso) {
  return new Date(lisbonMidnightMs(iso)).toISOString().slice(0, 10);
}
/** Data gravada S → { fixed, ambiguous }. fixed === S quando já estava certa. */
const _cache = new Map();
function repairDate(S) {
  if (!S || !/^\d{4}-\d{2}-\d{2}$/.test(S)) return { fixed: S, ambiguous: false };
  let r = _cache.get(S);
  if (r) return r;
  const cands = [S, addDays(S, 1)].filter(c => buggyStored(c) === S);
  r = cands.length === 1 ? { fixed: cands[0], ambiguous: false }
    : cands.length === 2 ? { fixed: S, ambiguous: true }   // domingo da mudança de hora
    : { fixed: S, ambiguous: false };                      // não devia acontecer
  _cache.set(S, r);
  return r;
}

// Ficheiros gerados a partir desta data já vêm dos scrapers corrigidos.
const SCRAPER_FIX_CUTOFF = "2026-07-03";
const REPAIR_MARKER = "fix-net-epoch-dates v1 (2026-07-02)";

// ── Reparar um ficheiro estilo federados (players[] com DATE_FIELDS) ─
function repairFederadosFile(file, label) {
  if (!fs.existsSync(file)) { console.warn(`[fix-dates] ${label}: não existe — skip`); return null; }
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const byFedOnly = () => new Map((j.players || []).filter(p => p.federation_code).map(p => [String(p.federation_code), p.birthdate || ""]));
  if (j.dateRepair) {
    console.log(`[fix-dates] ${label}: já reparado (${j.dateRepair}) — skip`);
    return byFedOnly();
  }
  if (String(j.generated || "") >= SCRAPER_FIX_CUTOFF) {
    console.log(`[fix-dates] ${label}: generated=${j.generated} >= ${SCRAPER_FIX_CUTOFF} (scraper já corrigido) — skip`);
    return byFedOnly();
  }
  let changed = 0, ambiguous = 0;
  const byFed = new Map();
  for (const p of j.players || []) {
    for (const k of DATE_FIELDS) {
      const { fixed, ambiguous: amb } = repairDate(p[k]);
      if (amb) ambiguous++;
      else if (fixed !== p[k]) { p[k] = fixed; changed++; }
    }
    if (p.federation_code) byFed.set(String(p.federation_code), p.birthdate || "");
  }
  console.log(`[fix-dates] ${label}: ${changed} datas corrigidas (+1 dia), ${ambiguous} ambíguas (mudança de hora — mantidas)`);
  if (!DRY && changed) {
    j.dateRepair = REPAIR_MARKER;
    writeJsonAtomic(file, j);
  }
  return byFed;
}

// ── Main ───────────────────────────────────────────────────────────
console.log(`[fix-dates] modo: ${DRY ? "DRY-RUN (sem gravar)" : "aplicar"}`);

const fedAtivos   = repairFederadosFile(FEDERADOS, "federados.json") || new Map();
const fedInativos = repairFederadosFile(INATIVOS, "federados-inativos.json") || new Map();

// players.json: dob ← birthdate reparado (ativos primeiro, inativos como fallback)
const players = JSON.parse(fs.readFileSync(PLAYERS, "utf8"));
let dobFixed = 0, dobSemFonte = 0;
for (const [fed, p] of Object.entries(players)) {
  if (!p || typeof p !== "object" || !p.dob) continue;
  const src = fedAtivos.get(fed) || fedInativos.get(fed);
  if (!src) { dobSemFonte++; continue; }
  if (src !== p.dob) {
    console.log(`  dob ${fed} ${p.name}: ${p.dob} → ${src}`);
    p.dob = src;
    dobFixed++;
  }
}
console.log(`[fix-dates] players.json: ${dobFixed} dob corrigidos, ${dobSemFonte} sem fonte (mantidos)`);
if (!DRY && dobFixed) writeJsonAtomic(PLAYERS, players);

console.log(DRY ? "[fix-dates] dry-run concluído." : "[fix-dates] concluído.");
