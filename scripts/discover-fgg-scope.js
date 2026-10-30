#!/usr/bin/env node
/**
 * scripts/discover-fgg-scope.js — provas juvenis da Federação Galega de Golf
 * (FGG, fggolf.com). 30/10/2026.
 *
 * A FGG usa o golfdirecto.com, a mesma plataforma da Federació Catalana: cada
 * prova da página `fggolf.com/torneos.aspx` (a época corrente) liga a
 * `golfdirecto.com/game/{gameId}/summary`. Este script só faz a LISTA — os
 * dados vêm do scrape-fcg.js (`--scope scripts/fgg-scope.json`) e entram na
 * /rfeg pela fonte golfdirecto.
 *
 * Ficam as juvenis (Liga Gallega Juvenil, Galicia Junior Cup, Puntuable Zonal,
 * Campeonatos de Galicia juvenis…). Fora: Cativ@s (iniciação) e as provas só
 * de Benjamines (escalões muito novos — pedido da Mariana), adiadas/canceladas,
 * a de pais e filhos e os Campeonatos de España (já vêm da RFEG/LGS).
 *
 * O scope ACUMULA: a página só mostra a época corrente; as provas de épocas
 * anteriores ficam no ficheiro. Página ilegível/vazia = erro (não grava).
 *
 * USO: node scripts/discover-fgg-scope.js
 * Exit: 0 gravou · 2 nada de novo · 1 erro.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const { writeJsonGuarded } = require("./lib/shrink-guard");

const OUT = path.resolve(__dirname, "fgg-scope.json");
const URL_TORNEOS = "https://www.fggolf.com/torneos.aspx";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const JUVENIL = /juvenil|junior|sub[\s-]?\d|infantil|alev[ií]n|cadete|zonal/i;
const FORA = /cativ@?s|^\s*benjam[ií]n(es)?[\s_-]|categor[ií]a benjam|aplazad|cancelad|padres e hijos|campeonato de espa[ñn]a/i;

function pedir(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": UA }, timeout: 60000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const c = []; res.on("data", (x) => c.push(x)); res.on("end", () => resolve(Buffer.concat(c).toString("utf8")));
    }).on("error", reject).on("timeout", function () { this.destroy(new Error("timeout")); });
  });
}

const ENT = { amp: "&", quot: '"', nbsp: " ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ" };
const texto = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&(#\d+|[a-z]+);/gi, (m, e) => (e[0] === "#" ? String.fromCharCode(+e.slice(1)) : ENT[e] ?? m)).replace(/\s+/g, " ").trim();

/** Linhas da tabela de torneios: data «dd/mm», nome, gameId golfdirecto, campo. */
function lerTorneios(html) {
  const out = [];
  for (const tr of html.match(/<tr>[\s\S]*?<\/tr>/g) || []) {
    const t = /data-label="Torneo"><a[^>]*golfdirecto\.com\/game\/([0-9a-f]{24})[^>]*>([\s\S]*?)<\/a>/.exec(tr);
    if (!t) continue;
    const d = /data-label="Fecha">[^0-9]*(\d{2})\/(\d{2})/.exec(tr);
    const c = /data-label="Campo"><a[^>]*>([\s\S]*?)<\/a>/.exec(tr);
    out.push({ gameId: t[1], name: texto(t[2]), date: d ? `${d[2]}-${d[1]}` : null, campo: c ? texto(c[1]) : null });
  }
  return out;
}

async function main() {
  const html = await pedir(URL_TORNEOS);
  const todos = lerTorneios(html);
  if (!todos.length) { console.error("::error::fggolf.com/torneos.aspx sem torneios — a página mudou?"); process.exit(1); }
  const juvenis = todos.filter((t) => JUVENIL.test(t.name) && !FORA.test(t.name));

  let anterior = { tournaments: [] };
  if (fs.existsSync(OUT)) anterior = JSON.parse(fs.readFileSync(OUT, "utf8"));   // ilegível = erro
  const porId = new Map((anterior.tournaments || []).map((t) => [t.games[0].gameId, t]));
  let novos = 0;
  for (const t of juvenis) {
    if (!porId.has(t.gameId)) novos++;
    porId.set(t.gameId, { title: t.name, sede: t.campo, dateMD: t.date, organizer: "Federación Gallega de Golf", games: [{ gameId: t.gameId }] });
  }
  const tournaments = [...porId.values()];
  console.log(`FGG: ${todos.length} provas na página, ${juvenis.length} juvenis, ${novos} novas → ${tournaments.length} no scope`);
  if (!novos && fs.existsSync(OUT)) { process.exitCode = 2; return; }
  writeJsonGuarded(OUT, {
    generatedAt: new Date().toISOString(), source: URL_TORNEOS,
    totalTournaments: tournaments.length, tournaments,
  }, { count: (d) => d.tournaments.length, maxDrop: 0.1, label: "fgg-scope.json" });
}

if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });
module.exports = { lerTorneios, JUVENIL, FORA };
