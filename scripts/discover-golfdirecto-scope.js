#!/usr/bin/env node
/**
 * scripts/discover-golfdirecto-scope.js — provas juvenis das federações
 * regionais que publicam no golfdirecto.com (30/10/2026).
 *
 * A lista oficial do golfdirecto (`/api/v2/public/tournament/last`, a mesma da
 * página «Torneos oficiales») filtra-se por nome e estado; cada torneio traz o
 * cliente (`client._id`) e o jogo (`nextGame._id`). Ficam os jogos das
 * federações em CLIENTES com nome juvenil, stroke play individual, desde 2025.
 * A Catalunha e a Galiza têm descoberta própria (catgolf.com, fggolf.com).
 *
 * Fora: iniciação (Cativ@s), só-Benjamines, provas de 9/5/4/12 buracos e P&P,
 * partidas de treino, «igual de buenas», hándicap, pares/equipas, match play
 * e os Campeonatos de España / provas nacionais (já vêm da RFEG).
 *
 * O scope ACUMULA (scripts/golfdirecto-scope.json); os dados vêm do
 * scrape-fcg.js (`--scope scripts/golfdirecto-scope.json`).
 *
 * USO: node scripts/discover-golfdirecto-scope.js
 * Exit: 0 gravou · 2 nada de novo · 1 erro.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonGuarded } = require("./lib/shrink-guard");

const OUT = path.resolve(__dirname, "golfdirecto-scope.json");
const API = "https://www.golfdirecto.com/api/v2/public/tournament/last";
const UA = { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" } };
const DESDE = "2025-01-01";

/** Clientes (federações) do golfdirecto — ids confirmados a 30/10/2026. */
const CLIENTES = {
  "651539d7307e3268ffbbf506": "Federación Balear de Golf",
  "637e09f515ba6a3a13bb8c7d": "Federación Aragonesa de Golf",
  "6047665a65a85c484f08dbba": "Federación de Golf de la Región de Murcia",
  "6748319494912fc2a948a5ed": "Federación Cántabra de Golf",
  "621fa796f1cc9046887033ef": "Federación Extremeña de Golf",
  "673cd0ca74b2ddc38d5c533d": "Federación Vasca de Golf",
  "633a9ccde93c2038694d84e7": "Federación de Golf Comunitat Valenciana",
};
const PALAVRAS = ["Junior", "Juvenil", "Infantil", "Alevin", "Alevín", "Cadete", "Sub", "Puntuable", "Zonal", "PVACE"];
const JUVENIL = /junior|juvenil|infantil|alev[ií]n|cadete|sub[\s-]?1[0-8]\b|sub[\s-]?21|zonal|pvace/i;
/** Só-Benjamines: «benjam» sem outro escalão no nome (PVCE Infantil-Alevín-Benjamín fica). */
const SO_BENJAMIN = (n) => /benjam/i.test(n) && !/infantil|alev[ií]n|cadete|junior|sub[\s-]?\d/i.test(n);
const FORA = /cativ|h[aá]ndicap|campeonato de espa|nacional|\b(9|5|4|3|12)\s*h(oyos)?\b|p\s*&\s*p|pitch|partida|entrenamiento|igual de buenas|padres|parejas|equipos|foursome|fourball|greensome|scramble|match\s*-?play|ryder|social|escuela/i;

async function pagina(nome, estado, offset) {
  const u = `${API}?limit=100&offset=${offset}&filter%5BgameStatus%5D%5B0%5D=${estado}&filter%5Bprofile%5D=official&sort=-sortingDate&filter%5Bname%5D=${encodeURIComponent(nome)}`;
  const r = await fetch(u, UA);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${u}`);
  const j = await r.json();
  if (!j.data || !Array.isArray(j.data.docs)) throw new Error(`resposta inesperada: ${JSON.stringify(j).slice(0, 200)}`);
  return j.data.docs;
}

/** Torneios da lista → jogos que interessam. */
function filtrar(docs) {
  const out = [];
  for (const t of docs) {
    const g = t.nextGame || {};
    const org = CLIENTES[t.client && t.client._id];
    const nome = String(t.name || g.name || "").trim();
    if (!org || !g._id || (g.scheduleStartDate || "") < DESDE) continue;
    if (!JUVENIL.test(nome) || FORA.test(nome) || SO_BENJAMIN(nome)) continue;
    if (g.pointMode && g.pointMode !== "strokePlay") continue;
    if (g.gameConfig && g.gameConfig.gameMode && g.gameConfig.gameMode !== "individual") continue;
    out.push({ gameId: g._id, title: nome, organizer: org, date: (g.scheduleStartDate || "").slice(0, 10), sede: (g.club && g.club.name) || null });
  }
  return out;
}

async function main() {
  const achados = new Map();
  for (const nome of PALAVRAS) {
    for (const estado of ["finished", "scheduled"]) {
      for (let off = 0; off < 5000; off += 100) {
        const docs = await pagina(nome, estado, off);
        for (const x of filtrar(docs)) achados.set(x.gameId, x);
        // Ordenado do mais recente: quando a página já é toda anterior a DESDE, parar.
        if (docs.length < 100 || docs.every((t) => ((t.nextGame || {}).scheduleStartDate || "") < DESDE)) break;
      }
    }
  }
  if (!achados.size) { console.error("::error::golfdirecto sem provas das federações — a API mudou?"); process.exit(1); }

  let anterior = { tournaments: [] };
  if (fs.existsSync(OUT)) anterior = JSON.parse(fs.readFileSync(OUT, "utf8"));   // ilegível = erro
  const porId = new Map((anterior.tournaments || []).map((t) => [t.games[0].gameId, t]));
  let novos = 0;
  for (const x of achados.values()) {
    if (!porId.has(x.gameId)) novos++;
    porId.set(x.gameId, { title: x.title, sede: x.sede, date: x.date, organizer: x.organizer, games: [{ gameId: x.gameId }] });
  }
  const tournaments = [...porId.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const porOrg = {};
  for (const t of tournaments) porOrg[t.organizer] = (porOrg[t.organizer] || 0) + 1;
  console.log(`golfdirecto: ${achados.size} provas juvenis das federações, ${novos} novas → ${tournaments.length} no scope`, porOrg);
  if (!novos && fs.existsSync(OUT)) { process.exitCode = 2; return; }
  writeJsonGuarded(OUT, {
    generatedAt: new Date().toISOString(), source: API,
    totalTournaments: tournaments.length, tournaments,
  }, { count: (d) => d.tournaments.length, maxDrop: 0.1, label: "golfdirecto-scope.json" });
}

if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });
module.exports = { filtrar, CLIENTES, JUVENIL, FORA };
