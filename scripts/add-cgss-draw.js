#!/usr/bin/env node
/**
 * add-cgss-draw.js — COMANDO ÚNICO para inserir um torneio CGSS futuro a
 * partir do PDF do draw (o clube só envia draws por email).
 * ═══════════════════════════════════════════════════════════════════════════
 * Faz TODO o fluxo que antes era feito à mão em cada sessão:
 *   1. Extrai o draw do PDF (delega no scripts/extract-cgss-draws.py, que já
 *      sabe o layout DataGolf de 1/2 colunas) — ou aceita um JSON transcrito.
 *   2. Atribui o próximo tcode PLACEHOLDER 9xxxx livre (90071 RALI, 90072
 *      Calheta, 90073 8º OM NOS, …).
 *   3. Resolve fedCodes pela POPULAÇÃO CGSS (draws curados anteriores +
 *      scorecards 007 dos pull-torneios). Quando o PDF traz coluna de clube:
 *      federados.json com clube compatível como 3ª fonte, e "Internacional"
 *      fica fed:null + noFed:true (visitante — bloqueia o fallback por nome
 *      do DrawTab; lição João Rocha). Sem coluna de clube: NUNCA usar o
 *      registo global (sem clube não há desambiguação de homónimos).
 *   4. Escreve a entrada no cgss-draws-manual.json (drawOnly:true) e o stub
 *      _drawOnly no pull-torneios001.json (players:[] de propósito — com
 *      jogadores o TournamentDetail abria numa tab Scorecard vazia).
 * O workflow update-cgss-draw.yml NÃO precisa de ser tocado (2ª geração,
 * 2026-08-28): auto-descobre os draw-only pendentes pela data e corre nos
 * crons fixos de fim-de-semana — basta a entrada ficar committada. Depois é
 * só: verificar em /FPG, commitar (2 JSON) e push; a Action trata dos
 * resultados, do re-chaveamento placeholder→real e da reconciliação de feds.
 *
 * USO:
 *   node scripts/add-cgss-draw.js --pdf "C:/.../Draw X.pdf"
 *   node scripts/add-cgss-draw.js --json field.json      # transcrição manual
 *   ... [--strict-cgss]        # recusa PDFs que não sejam do Santo da Serra
 *                              # (usado pelo process-draw-inbox.js autónomo)
 *   ... [--dry-run]            # mostra tudo, não grava nada
 *
 * Formato do --json: {name, date, campo, modal, groups:[{teeTime, startHole,
 *   players:[{nome, clube|null, hcp, tee|null}]}]}
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");
const DATA = path.join(REPO, "public", "data");
const CGSS = path.join(DATA, "cgss-draws-manual.json");
const PULL = path.join(DATA, "pull-torneios001.json");

const args = process.argv.slice(2);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes("--dry-run");
const PDF = argVal("--pdf");
const JSON_IN = argVal("--json");
if (!PDF && !JSON_IN) {
  console.error('uso: node scripts/add-cgss-draw.js --pdf "Draw X.pdf" | --json field.json [--search STR] [--dry-run]');
  process.exit(1);
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/* ── 1) obter o draw (PDF via extractor python, ou JSON transcrito) ─────── */
let draw; // {name, date, campo, modal, groups:[{teeTime,startHole,players:[{nome,clube,hcp,tee}]}], source}
if (JSON_IN) {
  const j = JSON.parse(fs.readFileSync(JSON_IN, "utf8"));
  draw = { ...j, source: `${path.basename(JSON_IN)} (transcrição manual)` };
} else {
  const tmp = path.join(os.tmpdir(), `cgss-draw-extract-${Date.now()}.json`);
  try {
    execFileSync("python", [path.join(REPO, "scripts", "extract-cgss-draws.py"),
      "--pdf", PDF, "--data-dir", DATA, "--out", tmp], { stdio: ["ignore", "inherit", "inherit"] });
  } catch (e) {
    console.error("\n[add] ERRO: o extractor python falhou. Alternativa: transcrever o PDF para JSON e usar --json.");
    process.exit(1);
  }
  const extracted = JSON.parse(fs.readFileSync(tmp, "utf8"));
  fs.unlinkSync(tmp);
  const ts = extracted.tournaments || [];
  if (ts.length !== 1) {
    console.error(`[add] ERRO: esperava 1 torneio no PDF, o extractor devolveu ${ts.length}.`);
    process.exit(1);
  }
  const t = ts[0];
  const groups = [];
  for (const r of Object.values(t.draws || {})) {
    for (const g of r.groups || []) {
      groups.push({
        teeTime: g.teeTime, startHole: g.startHole,
        players: (g.players || []).map(p => ({
          nome: p.nome, clube: p.clube ?? null,
          hcp: p.hcp ?? null, tee: p.tee ? String(p.tee).toUpperCase() : null,
          fed: p.fed ?? null, // o extractor fixa Manuel/marido; o resto vem null em futuros
        })),
      });
    }
  }
  draw = { name: t.name, date: t.date, campo: t.campo, modal: t.modal, groups,
    source: `${path.basename(PDF)} (email do clube)` };
}

const nPlayers = draw.groups.reduce((s, g) => s + g.players.length, 0);
if (!draw.name || !/^\d{4}-\d{2}-\d{2}$/.test(draw.date || "") || !nPlayers) {
  console.error(`[add] ERRO: draw incompleto (name="${draw.name}" date="${draw.date}" jogadores=${nPlayers}).`);
  process.exit(1);
}
console.log(`[add] "${draw.name}" · ${draw.date} · ${draw.campo || "?"} · ${draw.groups.length} grupos / ${nPlayers} jogadores`);

// Guarda para o modo autónomo (inbox): este fluxo é CGSS/ccode 007 — um draw
// de outro organizador (ex: Porto Santo/PXO, "Draw Oficial PXO.pdf") tem de
// ser tratado à mão (ccode diferente, outro ficheiro de pull).
if (args.includes("--strict-cgss") && !/santo da serra/i.test(draw.campo || "")) {
  console.error(`[add] ERRO: campo "${draw.campo}" não é do Santo da Serra — não parece um draw CGSS. Tratar manualmente. (exit 3)`);
  process.exit(3);
}

/* ── detectar se o PDF traz coluna de clube real ─────────────────────────
 * O extractor mete "Santo da Serra" por defeito quando a coluna não existe —
 * se ≥95% vier assim, tratamos como SEM clube (clube:null, matching só pela
 * população CGSS). */
const allPlayers = draw.groups.flatMap(g => g.players);
const nSds = allPlayers.filter(p => norm(p.clube) === "santo da serra").length;
const hasClubCol = allPlayers.some(p => p.clube) && nSds / nPlayers < 0.95;
if (!hasClubCol) for (const p of allPlayers) p.clube = null;
console.log(`[add] coluna de clube no PDF: ${hasClubCol ? "SIM (regras de clube + noFed para Internacional)" : "NÃO (matching só pela população CGSS)"}`);

/* ── 2) placeholder seguinte ────────────────────────────────────────────── */
const cgss = JSON.parse(fs.readFileSync(CGSS, "utf8"));
const pull = JSON.parse(fs.readFileSync(PULL, "utf8"));
let maxPh = 90070;
for (const t of [...cgss.tournaments, ...pull.tournaments])
  if (/^9\d{4}$/.test(String(t.tcode))) maxPh = Math.max(maxPh, parseInt(t.tcode, 10));
const TCODE = String(maxPh + 1);
console.log(`[add] placeholder atribuído: 007/${TCODE}`);

// entrada duplicada? (mesmo nome+data já inserido)
const dup = cgss.tournaments.find(t => norm(t.name) === norm(draw.name) && t.date === draw.date);
if (dup) {
  console.error(`[add] ERRO: já existe "${dup.name}" (${dup.date}) como ${dup.ccode}/${dup.tcode} — nada feito.`);
  process.exit(1);
}

/* ── 3) fedCodes ────────────────────────────────────────────────────────── */
const CLUB_KEYS = {
  "santo da serra": ["santo da serra"], "palheiro": ["palheiro"],
  "exercito": ["exercito"], "xira golfe": ["xira"], "atlantico": ["atlantico"],
  "pxo clube": ["pxo", "porto santo"], "aroeira": ["aroeira"],
  "vale pisao": ["pisao"], "tigresdobosque": ["tigres"], "acp golfe": ["acp"],
  "belas": ["belas"], "vidago palace c": ["vidago"], "clube benfica": ["benfica"],
};
const addTo = (map, k, v) => { if (!map.has(k)) map.set(k, new Set()); map.get(k).add(v); };
const curated = new Map();
for (const t of cgss.tournaments)
  for (const r of Object.values(t.draws || {})) for (const g of r.groups || [])
    for (const p of g.players || []) if (p.fed) addTo(curated, norm(p.nome), String(p.fed));
const scraped = new Map();
for (const f of fs.readdirSync(DATA).filter(x => /^pull-torneios\d+\.json$/.test(x))) {
  const d = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
  for (const t of d.tournaments || []) {
    if (t.ccode !== "007") continue;
    for (const p of t.players || []) if (p.fedCode) addTo(scraped, norm(p.name), String(p.fedCode));
  }
}
let registryByName = null;
if (hasClubCol) {
  registryByName = new Map();
  const feds = JSON.parse(fs.readFileSync(path.join(DATA, "federados.json"), "utf8"));
  const list = Array.isArray(feds) ? feds : (feds.federados || Object.values(feds));
  for (const r of list) {
    const k = norm(r.name);
    if (!k) continue;
    if (!registryByName.has(k)) registryByName.set(k, []);
    registryByName.get(k).push(r);
  }
}
const one = (set) => (set && set.size === 1 ? [...set][0] : null);
const stats = { kept: 0, curated: 0, scraped: 0, registry: 0, none: [], ambiguous: [], noFed: 0 };
for (const p of allPlayers) {
  if (p.fed) { stats.kept++; continue; } // fixados pelo extractor (Manuel/marido)
  const k = norm(p.nome);
  const isIntl = hasClubCol && norm(p.clube) === "internacional";
  if (isIntl) { p.fed = null; p.noFed = true; stats.noFed++; continue; }
  let fed = one(curated.get(k)) ?? one(scraped.get(k));
  if (fed) { stats[curated.has(k) && one(curated.get(k)) ? "curated" : "scraped"]++; }
  if (!fed && (curated.get(k)?.size > 1 || scraped.get(k)?.size > 1)) {
    stats.ambiguous.push(p.nome);
  } else if (!fed && registryByName) {
    const keys = CLUB_KEYS[norm(p.clube)];
    const cands = keys ? (registryByName.get(k) || []).filter(r =>
      keys.some(key => norm(r.club_name + " " + (r.acronym || "")).includes(key))) : [];
    if (cands.length === 1) { fed = String(cands[0].federation_code); stats.registry++; }
    else if (cands.length > 1 && typeof p.hcp === "number") {
      const sc = cands.map(r => ({ r, d: Math.abs(Number(r.hcp_exact) - p.hcp) })).sort((a, b) => a.d - b.d);
      if (sc[0].d <= 3 && (sc.length < 2 || sc[1].d > 3)) { fed = String(sc[0].r.federation_code); stats.registry++; }
      else stats.ambiguous.push(p.nome);
    }
  }
  if (!fed && !stats.ambiguous.includes(p.nome)) stats.none.push(p.nome);
  p.fed = fed || null;
}
const withFed = allPlayers.filter(p => p.fed).length;
console.log(`[add] fedCodes: ${withFed}/${nPlayers} (extractor=${stats.kept} curated=${stats.curated} scraped=${stats.scraped} registry=${stats.registry} noFed=${stats.noFed})`);
if (stats.ambiguous.length) console.log(`[add] ambíguos (fed null, a reconciliação resolve): ${stats.ambiguous.join(" · ")}`);
if (stats.none.length) console.log(`[add] sem match (fed null, a reconciliação resolve): ${stats.none.join(" · ")}`);

/* ── 4) entradas ────────────────────────────────────────────────────────── */
const entry = {
  ccode: "007", tcode: TCODE, name: draw.name, date: draw.date,
  campo: draw.campo || "Santo da Serra", modal: draw.modal || null,
  source: draw.source, drawOnly: true,
  draws: { "1": { totalJogadores: nPlayers, groups: draw.groups.map(g => ({
    teeTime: g.teeTime, startHole: g.startHole, tee: null,
    players: g.players.map(p => ({ nome: p.nome, clube: p.clube, fed: p.fed, hcp: p.hcp, tee: p.tee || null, ...(p.noFed ? { noFed: true } : {}) })),
  })) } },
};
const stub = {
  name: draw.name, ccode: "007", tcode: TCODE, date: draw.date,
  campo: draw.campo || "Santo da Serra", rounds: 1, playerCount: nPlayers,
  _drawOnly: true, players: [],
};

/* ── gravar ─────────────────────────────────────────────────────────────── */
if (DRY) {
  console.log(`[add] --dry-run: nada gravado. Placeholder ${TCODE} · a Action update-cgss-draw.yml apanha-o sozinha na data ${draw.date}.`);
  process.exit(0);
}
const writeAtomic = (file, obj) => {
  fs.writeFileSync(file + ".tmp", typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
  fs.renameSync(file + ".tmp", file);
};
cgss.tournaments.push(entry);
cgss.total = cgss.tournaments.length;
pull.tournaments.push(stub);
if (typeof pull.totalTournaments === "number") pull.totalTournaments = pull.tournaments.length;
writeAtomic(CGSS, cgss);
writeAtomic(PULL, pull);
console.log(`[add] ✓ cgss-draws-manual.json + pull-torneios001.json (007/${TCODE}).`);
console.log(`[add] Próximos passos:
  1. Verificar em http://localhost:5199/FPG (filtro ⛳ Santo da Serra) — draw com ${nPlayers} jogadores.
  2. npm test && npm run build
  3. git add public/data/cgss-draws-manual.json public/data/pull-torneios001.json && git commit && git push
  4. A Action update-cgss-draw.yml auto-descobre o pendente na data ${draw.date} (crons de fim-de-semana), re-chaveia ${TCODE} → tcode real e reconcilia os feds. Nada mais a fazer.`);
