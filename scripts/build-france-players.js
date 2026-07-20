#!/usr/bin/env node
/**
 * build-france-players.js — Gera public/data/france-players.json
 *
 * Roster consolidado dos jogadores FR vistos nos torneios juvenis do portal
 * FFGolf (public/data/ffgolf-resultats/*.json). Análogo ao spain-players.json:
 * além da metadata (license, club, region, hcp, sex), baka a contagem de
 * torneios (total + ano corrente), o período de actividade e a série mais
 * recente — consumido pela vista "👥 Joueurs de France" (/ffg/info/joueurs),
 * pelo KIDSdataLoader (france-enrich) e pelo aggregator (sources/ffgolf.js).
 *
 * Campos por jogador (byLicense/byName):
 *   license, name, sex, country, glfLic          — identidade
 *   club, region, lastSerie                      — do torneio MAIS RECENTE
 *   hcp, hcpDate                                 — HCP mais recente COM valor
 *   tot, ano, firstSeenIso, lastSeenIso          — contagem/período (por trnId)
 *
 * Passagem 2 — torneios GolfGenius (public/data/ffgolf/{year}_{slug}.json:
 * Championnats de France, Internationaux, GP Majeur/National). O GG não
 * publica licenças → matching de NOME contra o roster (lib/ffgolf-gg.js);
 * torneios GG que são GÉMEOS de um torneio do portal resultats (o mesmo
 * evento publicado nos dois sítios) são detectados por overlap de licenças e
 * NÃO contam 2×. Verdicto gravado em public/data/ffgolf-gg-twins.json,
 * consumido pelo adapter kids2 (aggregator/sources/ffgolf.js).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { listGgTournaments, buildNameMaps, matchGgName } = require("./lib/ffgolf-gg");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");
const DIR = path.join(DATA, "ffgolf-resultats");
const GG_DIR = path.join(DATA, "ffgolf");
const OUT = path.join(DATA, "france-players.json");
const OUT_TWINS = path.join(DATA, "ffgolf-gg-twins.json");

const CUR_YEAR = new Date().getFullYear();

const norm = s => (s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

const decode = s => (s || "").replace(/&#039;/g, "'").replace(/&amp;/g, "&");

/** "DD/MM/YYYY" → "YYYY-MM-DD" (vazio se não parsear). */
function dateIso(d) {
  const m = (d || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** Title-case de apelidos em CAPS ("LE PETIT" → "Le Petit"), como no slim. */
function titleCaseCaps(s) {
  if (s && /^[A-ZÀ-ÖØ-Þ\-]+$/.test(s.replace(/[\s'\-]/g, ""))) {
    return s.toLowerCase().replace(/(^|[\s'\-])(\w)/g, (_, sep, ch) => sep + ch.toUpperCase());
  }
  return s;
}

/** Nome canónico "Prenom Apelido" a partir do bloco de jogador FFGolf. */
function canonName(p) {
  let first = decode(p.namePrenom || "").trim();
  let last = decode(p.nameNom || "").trim();
  if (!first || !last) {
    // `name` cru vem "Lastname Firstname" — invertido.
    const parts = decode(p.name || "").trim().split(/\s+/);
    if (parts.length >= 2) {
      if (!last) last = parts[0];
      if (!first) first = parts.slice(1).join(" ");
    } else if (parts[0]) {
      return titleCaseCaps(parts[0]);
    }
  }
  return `${first} ${titleCaseCaps(last)}`.trim();
}

// license → registo consolidado (+ campos internos _lastDate/_seen p/ agregação)
const players = new Map();
// trnId → { iso, year, lics:Set } — para a detecção de gémeos GG↔resultats.
const trnLics = new Map();

let nFiles = 0, nParseErr = 0, nNoSeries = 0, nOcc = 0;
for (const f of fs.existsSync(DIR) ? fs.readdirSync(DIR) : []) {
  if (!f.endsWith(".json")) continue;
  nFiles++;
  let d;
  try {
    d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  } catch {
    nParseErr++;
    continue;
  }
  const series = d?.details?.series || d?.series || [];
  if (!series.length) { nNoSeries++; continue; }
  const trnId = String(d.trnId || d?.details?.trnId || f.replace(/\.json$/, ""));
  const iso = dateIso(d.date);
  const year = iso ? parseInt(iso.slice(0, 4), 10) : null;
  let trn = trnLics.get(trnId);
  if (!trn) { trn = { iso, year, lics: new Set() }; trnLics.set(trnId, trn); }

  for (const s of series) {
    const label = (s.label || "").trim();
    for (const p of (s.players || [])) {
      const lic = (p.license || "").trim();
      if (!lic) continue;
      trn.lics.add(lic);
      let e = players.get(lic);
      if (!e) {
        e = {
          license: lic, name: "", sex: undefined, country: undefined, glfLic: undefined,
          club: undefined, region: undefined, lastSerie: undefined,
          hcp: undefined, hcpDate: undefined,
          tot: 0, ano: 0, firstSeenIso: null, lastSeenIso: null,
          _lastDate: "", _lastHcpDate: "", _seen: new Set(),
        };
        players.set(lic, e);
      }
      // Identidade — preencher quando em falta (estável entre torneios).
      if (!e.sex && (p.sex === "M" || p.sex === "F")) e.sex = p.sex;
      if (!e.country && p.nationality) e.country = p.nationality;
      if (!e.glfLic && p.glfLic) e.glfLic = p.glfLic;

      // Contagem por torneio (dedup por trnId — o mesmo jogador pode surgir
      // em mais do que uma série do mesmo torneio).
      if (!e._seen.has(trnId)) {
        e._seen.add(trnId);
        e.tot++;
        if (year === CUR_YEAR) e.ano++;
        if (iso && (!e.firstSeenIso || iso < e.firstSeenIso)) e.firstSeenIso = iso;
        if (iso && (!e.lastSeenIso || iso > e.lastSeenIso)) e.lastSeenIso = iso;
      }

      // Dados "vivos" — do torneio mais recente (nome/clube/região/série).
      if (iso >= e._lastDate) {
        e._lastDate = iso;
        const name = canonName(p);
        if (name) e.name = name;
        if (p.club) e.club = decode(p.club);
        if (p.region) e.region = p.region;
        if (label) e.lastSerie = label;
      }
      // HCP mais recente COM valor (um torneio sem hcp não apaga o anterior).
      if (typeof p.hcp === "number" && iso >= e._lastHcpDate) {
        e._lastHcpDate = iso;
        e.hcp = p.hcp;
        e.hcpDate = iso;
      }
      nOcc++;
    }
  }
}

console.log(`Scaneados ${nFiles} ficheiros FFG resultats (${nParseErr} erros parse, ${nNoSeries} sem séries)`);
console.log(`Total jogadores únicos (por license): ${players.size} — ${nOcc} aparições`);

// ── Passagem 2: torneios GolfGenius (matching por nome + dedup de gémeos) ──
const nameMaps = buildNameMaps(
  [...players.values()].map((e) => ({ name: e.name, lic: e.license })),
);
const ggTourns = listGgTournaments(GG_DIR);
/**
 * Overlap mínimo de licenças para declarar que um evento GG é o MESMO evento do
 * portal. Medido em 2026-07-20 sobre os 19 gémeos então detectados: 17 estavam
 * em 1.00 (campo idêntico) e 1 em 0.67. O limiar antigo (0.40) apanhava também
 * pares que só partilham a COORTE — os mesmos U12 franceses jogam várias provas
 * na época. Caso real: "CFJ - U12 Garçons" (Julho, Golf du Gouverneur, 87 jog.)
 * foi dado como gémeo de "GPN U12 - Strasbourg" (30/05, 72 jog.) com 0.48, e a
 * /ffg escondia-o — um falso gémeo não duplica, APAGA o torneio da página.
 *
 * ⚠ O guard de data (±5 dias) que devia apanhar isto nunca disparou: nenhum dos
 * 25 ficheiros GG traz data. Enquanto não trouxerem, o overlap é o único sinal.
 */
const MIN_TWIN_OVERLAP = 0.6;
/** Abaixo disto o gémeo é plausível mas não óbvio — vale a pena olhar. */
const TWIN_REVIEW_BELOW = 0.9;

const twins = {};
let nGgCounted = 0, nGgTwins = 0, nGgMatched = 0, nGgUnmatched = 0;

/** Dias entre dois ISO (Infinity se algum faltar). */
const dayDiff = (a, b) => (a && b)
  ? Math.abs(Date.parse(a) - Date.parse(b)) / 86400000
  : Infinity;

for (const gg of ggTourns) {
  // Matching nome→licença de cada jogador GG (null = sem match / ambíguo).
  const matched = new Map(); // lic → player GG
  for (const p of gg.players) {
    const lic = matchGgName(nameMaps, p.name);
    if (lic) { if (!matched.has(lic)) matched.set(lic, p); }
    else nGgUnmatched++;
  }
  nGgMatched += matched.size;

  // Gémeo no portal resultats? O mesmo evento é por vezes publicado nos dois
  // sítios (ex: Internationaux U14, GP Jeunes Majeur) — detectado por overlap
  // de licenças no mesmo ano (±5 dias quando ambas as datas são conhecidas).
  let twin = null;
  if (matched.size >= 5) {
    for (const [trnId, t] of trnLics) {
      if (t.year !== gg.year) continue;
      if (gg.dateIso && t.iso && dayDiff(gg.dateIso, t.iso) > 5) continue;
      let inter = 0;
      for (const lic of matched.keys()) if (t.lics.has(lic)) inter++;
      const ratio = inter / matched.size;
      if (ratio >= MIN_TWIN_OVERLAP && (!twin || ratio > twin.overlap)) {
        twin = { trnId, overlap: +ratio.toFixed(2) };
      }
    }
  }
  if (twin) {
    twins[gg.key] = twin;
    nGgTwins++;
    if (twin.overlap < TWIN_REVIEW_BELOW) {
      // Esconder um torneio é irreversível do ponto de vista do utilizador (não
      // aparece em lado nenhum) — um gémeo não-óbvio tem de ser visível no log.
      console.warn(`  ⚠ gémeo pouco óbvio (overlap ${twin.overlap}): ${gg.key} → trnId ${twin.trnId} — confirmar que é mesmo o mesmo evento`);
    }
    continue; // já contado pela versão do portal (que tem licenças)
  }

  // Contar o torneio GG para cada jogador matched.
  nGgCounted++;
  const ggTid = `gg:${gg.key}`;
  for (const [lic, p] of matched) {
    const e = players.get(lic);
    if (e._seen.has(ggTid)) continue;
    e._seen.add(ggTid);
    e.tot++;
    if (gg.year === CUR_YEAR) e.ano++;
    if (gg.dateIso) {
      if (!e.firstSeenIso || gg.dateIso < e.firstSeenIso) e.firstSeenIso = gg.dateIso;
      if (!e.lastSeenIso || gg.dateIso > e.lastSeenIso) e.lastSeenIso = gg.dateIso;
      if (typeof p.hcp === "number" && gg.dateIso >= e._lastHcpDate) {
        e._lastHcpDate = gg.dateIso;
        e.hcp = p.hcp;
        e.hcpDate = gg.dateIso;
      }
    }
  }
}

console.log(`GolfGenius: ${ggTourns.length} torneios — ${nGgCounted} contados, ${nGgTwins} gémeos do portal (ignorados), ${nGgMatched} jogadores matched, ${nGgUnmatched} sem match`);

fs.writeFileSync(OUT_TWINS, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "scripts/build-france-players.js",
  twins,
}, null, 2));
console.log(`${OUT_TWINS} escrito (${Object.keys(twins).length} gémeos).`);

// Output: byLicense → record + byName (normalizado, 1º vence) → record
const byName = {};
const byLicense = {};
for (const [lic, e] of players) {
  const { _lastDate, _lastHcpDate, _seen, ...rec } = e;
  byLicense[lic] = rec;
  if (rec.name) {
    const k = norm(rec.name);
    if (!byName[k]) byName[k] = rec;
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  source: "scripts/build-france-players.js",
  totalPlayers: players.size,
  byName,
  byLicense,
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${OUT} escrito (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB).`);
