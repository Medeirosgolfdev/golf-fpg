#!/usr/bin/env node
/**
 * scripts/scrape-federgolf-ranking.js — ranking juvenil nacional da Federgolf
 * (Itália): página /attivita-agonistica/attivita-giovanile/ranking/. 02/11/2026.
 *
 * `POST wp-admin/admin-ajax.php` (sem login; o nonce da página não é exigido):
 *   - `ranking-nazionale-2026-search` (anno, sesso 1 M/2 F, categoria 12 Baby ·
 *     14 Pulcini · 16 Cadetti · 18 Ragazzi, tipo_ranking=8, zona=8 nacional,
 *     anni_giocatore=0) → [lugar, nome, clube, zona, IDADE, qual., voltas,
 *     mínimo de voltas (pallino verde/rosso), média, —, id do jogador]. O id é o
 *     mesmo das classificações das provas. Média = média de (gross − CR) das
 *     voltas que contam (mais baixa = melhor).
 *   - `ranking-nazionale-2026-details` (id, anno) → as voltas do jogador nesse
 *     ano: [prova, data, clube, volta, gross, par, CR, gross − CR] — também
 *     provas que não são juvenis (Opens, equipas).
 *
 * Grava `public/data/federgolf-ranking.json` (listas, ~100 KB) e
 * `public/data/federgolf-ranking-voltas.json` (voltas de cada jogador, lidas só
 * ao abrir um jogador). Aditivo por ano: um ano que não se pediu fica como estava.
 *
 * USO: node scripts/scrape-federgolf-ranking.js [--anos 2026,2025] [--sem-voltas] [--force]
 * Exit: 0 gravou · 2 nada de novo · 1 erro.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonGuarded } = require("./lib/shrink-guard");

const AJAX = "https://www.federgolf.it/wp-admin/admin-ajax.php";
const OUT = path.resolve(__dirname, "../public/data/federgolf-ranking.json");
const OUT_VOLTAS = path.resolve(__dirname, "../public/data/federgolf-ranking-voltas.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PARALELO = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const anoActual = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric" }).format(new Date()));
const ANOS = (arg("--anos") || `${anoActual},${anoActual - 1}`).split(",").map(Number).filter(Boolean);
const SEM_VOLTAS = process.argv.includes("--sem-voltas");
const FORCE = process.argv.includes("--force");

const CATEGORIAS = { 12: "Baby", 14: "Pulcini", 16: "Cadetti", 18: "Ragazzi" };
const SEXOS = { 1: "M", 2: "F" };
const texto = (s) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&#0?39;|&#8217;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const isoDe = (dmy) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const num = (v) => (v !== "" && v != null && Number.isFinite(Number(v)) ? Number(v) : null);

async function ajax(campos) {
  let ultimo;
  for (let t = 1; t <= 5; t++) {
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(campos)) fd.append(k, String(v));
      const r = await fetch(AJAX, { method: "POST", body: fd, headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90_000) });
      const txt = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = JSON.parse(txt);
      if (!j.success) throw new Error(`success=false: ${txt.slice(0, 120)}`);
      return j;
    } catch (e) { ultimo = e; await sleep(4000 * t); }
  }
  throw new Error(`${campos.action}: ${ultimo.message}`);
}

async function emParalelo(itens, n, fn) {
  const out = new Array(itens.length);
  let prox = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (prox < itens.length) { const i = prox++; out[i] = await fn(itens[i], i); }
  }));
  return out;
}

const lerJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null); // ilegível = erro

/** id do jogador → «APELIDO, NOME» das provas já gravadas (o ranking escreve
 *  «APELIDO NOME» sem vírgula, e nos apelidos compostos não se sabe onde parte). */
function nomesDasProvas() {
  const dir = path.resolve(__dirname, "../public/data/federgolf");
  const m = new Map();
  if (!fs.existsSync(dir)) return m;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const j of d.jogadores || []) if (j.id && j.nome?.includes(",")) m.set(j.id, j.nome);
  }
  return m;
}

(async () => {
  const ant = lerJson(OUT) || { anos: {} };
  const antVoltas = lerJson(OUT_VOLTAS) || { anos: {} };
  const anos = { ...ant.anos };
  const voltas = { ...antVoltas.anos };
  let erros = 0;
  const nomes = nomesDasProvas();

  for (const ano of ANOS) {
    const listas = {};
    for (const [sesso, sx] of Object.entries(SEXOS)) {
      for (const [cat, nomeCat] of Object.entries(CATEGORIAS)) {
        try {
          const j = await ajax({ action: "ranking-nazionale-2026-search", anno: ano, sesso, categoria: cat, tipo_ranking: 8, zona: 8, anni_giocatore: 0 });
          const linhas = (j.data || []).map((r) => ({
            pos: num(r[0]), nome: texto(r[1]), clube: texto(r[2]) || null, zona: num(r[3]), idade: num(r[4]),
            qual: texto(r[5]) || null, voltas: num(r[6]), minimo: /pallino-verde/.test(r[7] || ""),
            media: num(r[8]), id: texto(r[10]) || null,
          })).filter((l) => l.nome).map((l) => (l.id && nomes.has(l.id) ? { ...l, nome: nomes.get(l.id) } : l))
            .sort((a, b) => (a.pos ?? 1e9) - (b.pos ?? 1e9));
          listas[`${sx}-${cat}`] = linhas;
          console.log(`  ${ano} ${sx} ${nomeCat}: ${linhas.length}`);
        } catch (e) { erros++; console.error(`  ✗ ${ano} ${sx} ${nomeCat}: ${e.message}`); }
      }
    }
    if (!Object.values(listas).some((l) => l.length)) { console.log(`  ${ano}: sem ranking`); continue; }
    anos[ano] = listas;

    if (SEM_VOLTAS) continue;
    const ids = [...new Set(Object.values(listas).flat().map((l) => l.id).filter(Boolean))];
    const porId = {};
    let feitos = 0;
    await emParalelo(ids, PARALELO, async (id) => {
      try {
        const j = await ajax({ action: "ranking-nazionale-2026-details", id, anno: ano });
        porId[id] = (j.risultatiData || []).map((r) => [texto(r[0]), isoDe(r[1]), texto(r[2]) || null, num(r[3]), num(r[4]), num(r[5]), num(r[6]), num(r[7])]);
      } catch (e) { erros++; console.error(`  ✗ voltas ${id}: ${e.message}`); }
      if (++feitos % 100 === 0) console.log(`  ${ano}: voltas de ${feitos}/${ids.length} jogadores`);
    });
    voltas[ano] = { ...(voltas[ano] || {}), ...porId };
  }

  const contar = (d) => Object.values(d.anos).reduce((a, l) => a + Object.values(l).reduce((b, x) => b + x.length, 0), 0);
  const r1 = writeJsonGuarded(OUT, {
    fonte: "federgolf.it — ranking juvenil nacional", geradoEm: new Date().toISOString(),
    colunas: "pos, nome, clube, zona, idade, qual, voltas, minimo (cumpriu o mínimo de voltas), media (média de gross − CR), id",
    anos,
  }, { count: contar, maxDrop: 0.3, force: FORCE, spaces: 0, label: "federgolf-ranking" });
  let r2 = { written: false };
  if (!SEM_VOLTAS) {
    r2 = writeJsonGuarded(OUT_VOLTAS, {
      fonte: "federgolf.it — voltas do ranking", geradoEm: new Date().toISOString(),
      colunas: ["prova", "data", "clube", "volta", "gross", "par", "cr", "score (gross − CR)"],
      anos: voltas,
    }, { count: (d) => Object.values(d.anos).reduce((a, x) => a + Object.keys(x).length, 0), maxDrop: 0.3, force: FORCE, spaces: 0, label: "federgolf-ranking-voltas" });
  }
  console.log(`Ranking: ${contar({ anos })} linhas${r1.written ? "" : " (não gravado)"}; erros ${erros}`);
  if (!r1.written && !FORCE && erros) process.exitCode = 1;
  else if (!r1.written && !r2.written) process.exitCode = 2;
})().catch((e) => { console.error(e); process.exitCode = 1; });
