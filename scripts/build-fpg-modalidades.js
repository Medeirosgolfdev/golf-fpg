#!/usr/bin/env node
/**
 * build-fpg-modalidades.js — modalidade de cada torneio FPG (Stroke Play,
 * Medal Net, Stableford Net, Stableford Gross…), tal como o clube a configurou
 * na FPG segundo os Termos da Competição.
 *
 * O site usa-a no cabeçalho de cada prova (pill da modalidade) e para abrir o
 * tab «Scorecard» já nessa modalidade (Mariana, 30/10/2026). Os ficheiros de
 * torneios (pull-torneios*.json) não a guardam; vem do campo `scoring` da lista
 * de torneios de cada clube (`tournaments.aspx/TournamentsLST`), pelo gateway
 * PÚBLICO (sem cookies), um pedido de cada vez.
 *
 * Clubes e anos = os que aparecem nos pull-torneios*.json. Os anos passados já
 * guardados não se voltam a pedir (só com --all); o ano corrente refresca-se
 * sempre (o clube pode criar torneios novos).
 *
 * OUTPUT: public/data/fpg-modalidades.json  { generated, modalidades: { "ccode-tcode": "Stableford Net" } }
 * EXIT: 0 = escrito · 2 = sem alterações · 1 = erro · 3 = FPG em baixo
 *
 * Uso: node scripts/build-fpg-modalidades.js [--all] [--force]
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { criarRoteador } = require("./lib/fpg-session");
const { writeJsonGuarded } = require("./lib/shrink-guard");
const { lisbonCivilDayStr } = require("../lib/helpers");

const REPO = path.resolve(__dirname, "..");
const DATA = path.join(REPO, "public", "data");
const OUT = path.join(DATA, "fpg-modalidades.json");
const ALL = process.argv.includes("--all");
const FORCE = process.argv.includes("--force");
const DELAY_MS = 250;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROTA = criarRoteador({ dgPost: null, info: (m) => console.log(`[modalidades] ${m}`) });

/** Clubes × anos com torneios nos pull-torneios*.json. Ficheiro ilegível = erro. */
function clubesPorAno() {
  const pares = new Map(); // "ccode|ano" → { ccode, ano }
  for (const f of fs.readdirSync(DATA).filter((x) => /^pull-torneios\d+\.json$/.test(x))) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); }
    catch (e) { throw new Error(`${f} ilegível: ${e.message}`); }
    for (const t of d.tournaments || []) {
      const ccode = String(t.ccode || "").padStart(3, "0");
      const ano = Number(String(t.date || "").slice(0, 4));
      if (!/^\d{3}$/.test(ccode) || !(ano > 2000)) continue;
      pares.set(`${ccode}|${ano}`, { ccode, ano });
    }
  }
  return [...pares.values()].sort((a, b) => a.ano - b.ano || a.ccode.localeCompare(b.ccode));
}

/** Todos os torneios de um clube num ano (páginas de 50 — a FPG recusa ≥ 200). */
async function torneiosDoClube(ccode, ano) {
  const out = [];
  for (let si = 0, total = Infinity; si < total; si += 50) {
    const body = { ClubCode: ccode, dtIni: `${ano}-01-01`, dtFim: `${ano}-12-31`, CourseName: "", TournCode: "", TournName: "",
      jtStartIndex: String(si), jtPageSize: "50", jtSorting: "started_at DESC" };
    const d = await ROTA.post("tournaments.aspx/TournamentsLST", body, new URLSearchParams(body).toString());
    const recs = d.Records || [];
    total = d.TotalRecordCount ?? recs.length;
    out.push(...recs);
    if (!recs.length) break;
    await sleep(DELAY_MS);
  }
  return out;
}

(async () => {
  let prev = { modalidades: {}, anos: {} };
  if (fs.existsSync(OUT)) {
    try { prev = JSON.parse(fs.readFileSync(OUT, "utf8")); }
    catch (e) { console.error(`[modalidades] ${OUT} ilegível: ${e.message}`); process.exit(1); }
  }
  const modalidades = { ...(prev.modalidades || {}) };
  const anos = { ...(prev.anos || {}) }; // "ccode|ano" → dia em que se leu
  const anoCorrente = Number(lisbonCivilDayStr(Date.now()).slice(0, 4));
  const pares = clubesPorAno().filter((p) => ALL || p.ano >= anoCorrente || !anos[`${p.ccode}|${p.ano}`]);
  console.log(`[modalidades] ${pares.length} clube×ano a ler${ALL ? " (--all)" : ""}.`);

  let falhas = 0, lidos = 0;
  for (const { ccode, ano } of pares) {
    try {
      const recs = await torneiosDoClube(ccode, ano);
      for (const r of recs) {
        const scoring = String(r.scoring || "").trim();
        const tc = String(r.code || "").trim();
        if (scoring && tc) modalidades[`${String(r.club_code || ccode).padStart(3, "0")}-${tc}`] = scoring;
      }
      anos[`${ccode}|${ano}`] = lisbonCivilDayStr(Date.now());
      lidos++;
      console.log(`[modalidades]   ${ccode} ${ano}: ${recs.length} torneios`);
    } catch (e) {
      falhas++;
      console.warn(`[modalidades]   ${ccode} ${ano}: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }
  if (pares.length && !lidos) {
    console.error("[modalidades] nenhum clube respondeu — FPG em baixo? (exit 3)");
    process.exit(3);
  }

  const ordenado = Object.fromEntries(Object.entries(modalidades).sort(([a], [b]) => a.localeCompare(b)));
  if (JSON.stringify(ordenado) === JSON.stringify(prev.modalidades || {}) && JSON.stringify(anos) === JSON.stringify(prev.anos || {})) {
    console.log("[modalidades] sem alterações.");
    process.exit(falhas ? 1 : 2);
  }
  const r = writeJsonGuarded(OUT, { generated: new Date().toISOString(), modalidades: ordenado, anos }, {
    count: (d) => Object.keys(d.modalidades || {}).length, maxDrop: 0.1, force: FORCE, label: "modalidades",
  });
  if (!r.written) process.exit(1);
  const tipos = {};
  for (const v of Object.values(ordenado)) tipos[v] = (tipos[v] || 0) + 1;
  console.log(`[modalidades] ✓ ${Object.keys(ordenado).length} torneios · ${Object.entries(tipos).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error("[modalidades] ERRO:", e); process.exit(1); });
