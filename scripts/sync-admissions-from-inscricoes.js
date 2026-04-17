#!/usr/bin/env node
/**
 * sync-admissions-from-inscricoes.js
 *
 * Sincroniza `public/data/fpg-admissions-draws.json` a partir de
 * `public/data/inscricoes_nacionais.json` — que é mantido actualizado pela
 * NacionaisPage (fetch live à FPG via `/api/inscricoes?tcode=X`).
 *
 * Porquê: o scrape browser de `fpg-admissions-draws.json` por vezes traz listas
 * incompletas (ex: Sub-18 M com pos 1-6 em falta). O `inscricoes_nacionais.json`
 * contém listas completas que se podem reutilizar.
 *
 * Só toca nos tcodes 10935-10944 (Campeonato Nacional de Jovens 2026). Os outros
 * torneios mantêm-se exactamente como estão.
 *
 * Atribui pos/status automaticamente:
 *   - Confirmed: pos 1..totalInscritos pela ordem do array
 *   - Reserva: pos 1..(len-total) pela ordem restante (pos reinicia em 1)
 *
 * Cria backup antes de escrever.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "..", "public", "data");
const ADM_DRAWS = path.join(DATA_DIR, "fpg-admissions-draws.json");
const INSCRICOES = path.join(DATA_DIR, "inscricoes_nacionais.json");
const BACKUP = path.join(DATA_DIR, `fpg-admissions-draws.pre-sync-${Date.now()}.json`);

const TCODES_NACIONAL = ["10935", "10936", "10937", "10938", "10939", "10940", "10941", "10942", "10943", "10944"];

function readJSafe(p) {
  if (!fs.existsSync(p)) throw new Error(`Não existe: ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const admDraws = readJSafe(ADM_DRAWS);
const insc = readJSafe(INSCRICOES);

// Backup
fs.writeFileSync(BACKUP, Buffer.from(JSON.stringify(admDraws, null, 2), "utf8"));
console.log(`Backup: ${BACKUP}`);

// Index por ccode-tcode
const idx = new Map();
for (let i = 0; i < (admDraws.tournaments || []).length; i++) {
  const t = admDraws.tournaments[i];
  idx.set(`${t.ccode}-${t.tcode}`, i);
}

let updated = 0;
for (const tcode of TCODES_NACIONAL) {
  const srcEntry = insc[tcode];
  if (!srcEntry) {
    console.warn(`  ${tcode}: não existe em inscricoes_nacionais.json — saltado`);
    continue;
  }
  const rowIdx = idx.get(`000-${tcode}`);
  if (rowIdx == null) {
    console.warn(`  ${tcode}: não existe em fpg-admissions-draws.json — saltado`);
    continue;
  }

  const jogadores = srcEntry.jogadores || [];

  // ⚠ IMPORTANTE: `inscricoes_nacionais.json` tem `totalInscritos` = total GLOBAL
  // (confirmed + reservas). O cut-off confirmed vs reserva é dado por:
  //   1) o `totalInscritos` do `fpg-admissions-draws.json` existente (se já foi
  //      scraped com a distinção)
  //   2) ou, como fallback, o cap regulamentar do Nacional: 15 por escalão
  //      (Regulamento 2026 secção 3: "30 jogadores por escalão (15 R + 15 R)").
  const existing = admDraws.tournaments[rowIdx].admissions;
  const existingTotal = (existing?.totalInscritos ?? 0);
  const NATIONAL_CAP = 15;
  const confCut = existingTotal > 0 && existingTotal <= NATIONAL_CAP
    ? existingTotal
    : Math.min(jogadores.length, NATIONAL_CAP);

  const confirmed = jogadores.slice(0, confCut);
  const reservas = jogadores.slice(confCut);

  const players = [
    ...confirmed.map((j, i) => ({
      pos: i + 1,
      status: "confirmed",
      fed: j.fed || null,
      nome: j.nome || "",
      clube: j.clube || "",
      hcp: j.hcp ?? null,
      vac: j.vac ?? null,
      dataInscricao: j.dataInscricao || null,
    })),
    ...reservas.map((j, i) => ({
      pos: i + 1,
      status: "reserva",
      fed: j.fed || null,
      nome: j.nome || "",
      clube: j.clube || "",
      hcp: j.hcp ?? null,
      vac: j.vac ?? null,
      dataInscricao: j.dataInscricao || null,
    })),
  ];

  const newAdm = {
    name: srcEntry.nome || admDraws.tournaments[rowIdx].admissions?.name || "",
    date: admDraws.tournaments[rowIdx].admissions?.date || "2026-05-01",
    status: jogadores.length > 0 ? "Inscrições em curso" : "Sem inscrições",
    totalInscritos: confirmed.length,  // confirmed apenas (padrão FPG do fpg-admissions-draws.json)
    reservas: reservas.length,
    players,
  };

  // Contar antes/depois
  const before = admDraws.tournaments[rowIdx].admissions?.players?.length ?? 0;

  admDraws.tournaments[rowIdx].admissions = newAdm;
  // Preservar campos do torneio (name, date, etc.)
  if (!admDraws.tournaments[rowIdx].name && srcEntry.nome) {
    admDraws.tournaments[rowIdx].name = srcEntry.nome;
  }

  updated++;
  console.log(`  ${tcode} ${srcEntry.nome}: ${before} → ${players.length} jogadores (${confirmed.length} confirmed + ${reservas.length} reserva)`);
}

admDraws.scrapedAt = new Date().toISOString();
admDraws.source = "merged (additive) + synced from inscricoes_nacionais.json";

fs.writeFileSync(ADM_DRAWS, Buffer.from(JSON.stringify(admDraws, null, 2), "utf8"));

console.log(`\n✓ Sincronizados ${updated}/${TCODES_NACIONAL.length} tcodes.`);
console.log(`✓ Escrito: ${ADM_DRAWS}`);
