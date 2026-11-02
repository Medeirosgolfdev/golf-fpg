#!/usr/bin/env node
/**
 * scripts/backfill-england-dates.js — datas reais das provas England Golf.
 * 01/11/2026.
 *
 * As provas de 2026 vêm sem cartões (rounds: []) e a data só existia no
 * cabeçalho dos cartões: o agregador punha-as todas a 01/07 (Carris, McGregor,
 * Reid, Bronte Law… no mesmo dia, e o Kids 2 mostrava-as como provas
 * repetidas). A GolfGenius publica as datas de cada ronda no evento
 * (`/v2tournaments/{eventId}` → event.rounds[].date): grava-se
 * `startDate`, `endDate` e `roundDates` no public/data/england_{slug}.json.
 *
 * Só fetch (GolfGenius dá 403 a browsers automatizados), um pedido de cada vez.
 * Corre depois do scrape-england-golf.js (que reescreve os ficheiros).
 *
 * USO: node scripts/backfill-england-dates.js [--all]   (--all refaz os que já têm data)
 * Exit: 0 gravou · 2 nada de novo · 1 erro
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonGuarded } = require("./lib/shrink-guard");
const { ggGet, GG } = require("./scrape-fsga.js");

const DIR = path.join(__dirname, "..", "public", "data");
const ALL = process.argv.includes("--all");

async function datasDoEvento(eventId) {
  const raw = await ggGet(`${GG}/v2tournaments/${eventId}`, "application/json");
  const j = typeof raw === "string" ? JSON.parse(raw) : raw;
  return ((j && j.event && j.event.rounds) || []).map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || ""));
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => /^england_.*\.json$/.test(f));
  let gravados = 0, erros = 0;
  for (const f of files) {
    const p = path.join(DIR, f);
    let d;
    try { d = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { console.error(`✗ ${f}: ilegível (${e.message})`); erros++; continue; }
    if (!Array.isArray(d.players) || !d.players.length) continue;
    if (d.startDate && !ALL) continue;
    const eventos = [...new Set(d.players.map((x) => x.eventId).filter(Boolean))];
    if (!eventos.length) continue;
    const datas = new Set();
    try {
      for (const ev of eventos) for (const x of await datasDoEvento(ev)) datas.add(x);
    } catch (e) { console.error(`✗ ${f}: ${e.message}`); erros++; continue; }
    // o evento é do ano do ficheiro; datas de outro ano são outra edição
    const doAno = [...datas].filter((x) => !d.year || x.startsWith(String(d.year))).sort();
    if (!doAno.length && datas.size) {
      // Só datas de outro ano = a página do catálogo é de OUTRA edição (a English
      // Girls' U16 & U14 «2023» era a de 2021 e parecia jogar-se em cima do
      // English Girls' Open de 2023). Corrigir o england-golf-catalog.json.
      const anos = [...new Set([...datas].map((x) => x.slice(0, 4)))].join(", ");
      console.error(`✗ ${f}: o ficheiro diz ${d.year} mas as rondas são de ${anos} — a gg_page do catálogo é de outra edição`);
      erros++;
      continue;
    }
    if (!doAno.length) { console.log(`· ${f}: a GolfGenius não tem datas`); continue; }
    const novo = { startDate: doAno[0], endDate: doAno[doAno.length - 1], roundDates: doAno };
    if (d.startDate === novo.startDate && d.endDate === novo.endDate && JSON.stringify(d.roundDates) === JSON.stringify(doAno)) continue;
    const r = writeJsonGuarded(p, { ...d, ...novo }, { failOnRefuse: true });
    if (r.written) { gravados++; console.log(`✓ ${f}: ${novo.startDate} → ${novo.endDate}`); }
  }
  console.log(`backfill-england-dates: ${gravados} ficheiro(s) com datas novas${erros ? ` · ${erros} erro(s)` : ""}`);
  if (erros || process.exitCode === 1) process.exitCode = 1;
  else if (!gravados) process.exitCode = 2;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
