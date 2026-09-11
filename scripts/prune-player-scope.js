#!/usr/bin/env node
/**
 * prune-player-scope.js
 * ═══════════════════════════════════════════════════════════════════════
 * Reduz o UNIVERSO de jogadores seguidos (players.json + pastas
 * `output/{fed}/`) ao que é relevante para o percurso do Manuel.
 *
 * PORQUÊ (2026-09-06): a pasta `output/` é ao mesmo tempo o `outDir` do Vite
 * e a pasta onde o scraper escreve, por isso TODAS as pastas por federado
 * entram no deployment do Vercel. Com 697 pastas × ~12 MB isso são 8,1 GB
 * por deployment — sozinho enche os 10 GB de Deployment Storage do plano
 * gratuito (email da Vercel a 100%).
 *
 * REGRA (decidida com a utilizadora):
 *   • MANTÉM sempre: Manuel, a coorte curada dos 18 rapazes que a página
 *     /analise-percurso-juniores usa, e quem tem tag `PJA` ou
 *     `inscrito-nacional`.
 *   • MANTÉM juniores com voltas no ano corrente e índice dentro do tecto do
 *     escalão (LIMITES abaixo) — o universo competitivo em que o Manuel joga.
 *   • APAGA o resto: adultos sem PJA, juniores inactivos e juniores em início
 *     de percurso (sem índice ou acima do tecto).
 *
 * Não é destrutivo em sentido próprio: os dados vêm todos da FPG. Repor um
 * jogador é voltar a pô-lo no players.json e correr o scraper. A lista dos
 * removidos fica em `data-archive/` (fora de public/, não vai para o deploy).
 *
 * USO:
 *   node scripts/prune-player-scope.js            # dry-run (default)
 *   node scripts/prune-player-scope.js --apply
 *   node scripts/prune-player-scope.js --apply --year 2026
 *   node scripts/prune-player-scope.js --restore 40452 31831   # repor jogadores
 * ═══════════════════════════════════════════════════════════════════════
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PLAYERS_PUB  = path.join(ROOT, "public/data/players.json");
const PLAYERS_ROOT = path.join(ROOT, "players.json");
const OUTPUT       = path.join(ROOT, "output");
const ARCHIVE      = path.join(ROOT, "data-archive");

/* Tecto de índice por escalão. Acima disto (ou sem índice) o miúdo ainda não
 * compete no universo do Manuel — não é rival nem referência de percurso. */
const LIMITES = { "Sub-10": 36, "Sub-12": 25, "Sub-14": 15, "Sub-16": 10, "Sub-18": 5 };

/* Índice não estabelecido: a FPG guarda 99 / ≥54 em quem ainda não tem. */
const HCP_SEM_INDICE = 54;

/* A coorte dos 18 de scripts/build-percurso-path.js — se sair daqui, a página
 * /analise-percurso-juniores fica sem os dados que a constroem. */
const COORTE_PERCURSO = [
  "40452", "31831", "41294", "40682", "34186", "40534", "37010", "42205", "40112",
  "39701", "45340", "42845", "40115", "35404", "36638", "37152", "42908", "35849",
];
const MANUEL = "52884";
const TAGS_FIXAS = ["PJA", "inscrito-nacional"];

const args  = process.argv.slice(2);
const APPLY = args.includes("--apply");
const RESTORE = args.includes("--restore");
const YEAR  = Number((args[args.indexOf("--year") + 1] || "").match(/^\d{4}$/) ? args[args.indexOf("--year") + 1] : new Date().getFullYear());

const anoUltimaVolta = (s) => {
  const m = /(\d{2})-(\d{2})-(\d{4})/.exec(s || "");
  return m ? Number(m[3]) : 0;
};
const indice = (p) => (p.hcp == null || p.hcp >= HCP_SEM_INDICE ? Infinity : p.hcp);

function manter(p) {
  if (p.nfed === MANUEL) return "manuel";
  if (COORTE_PERCURSO.includes(p.nfed)) return "coorte-percurso";
  for (const t of TAGS_FIXAS) if ((p.tags || []).includes(t)) return t;
  const tecto = LIMITES[p.escalao];
  if (tecto == null) return null;                       // adulto / sénior
  if (anoUltimaVolta(p.lastRound) < YEAR) return null;  // inactivo
  if (indice(p) > tecto) return null;                   // acima do tecto
  return "activo-" + p.escalao;
}

/* ── Modo restauro ───────────────────────────────────────────────────────
 * Repor um jogador cortado: volta ao `players.json` (a partir da auditoria) e
 * o scrape bruto volta a `output/{fed}/` (a partir de `data-archive/players/`,
 * ou do histórico do git se não estiver arquivado). O `analysis/data.json` é
 * regenerado a seguir pelo pipeline — o comando di-lo no fim.
 */
if (RESTORE) {
  const alvos = args.filter((a) => /^\d+$/.test(a));
  if (!alvos.length) { console.error("Uso: --restore <fed> [<fed> ...]"); process.exit(1); }

  const players = JSON.parse(fs.readFileSync(PLAYERS_PUB, "utf8"));
  /* A auditoria mais recente que conheça cada jogador. */
  const auditorias = fs.existsSync(ARCHIVE)
    ? fs.readdirSync(ARCHIVE).filter((f) => /^players-removidos-.*\.json$/.test(f)).sort().reverse()
    : [];

  let repostos = 0, semFicha = 0, comBruto = 0;
  for (const fed of alvos) {
    if (players[fed]) { console.log(`  ${fed}: já está no players.json`); }
    else {
      let ficha = null;
      for (const a of auditorias) {
        const d = JSON.parse(fs.readFileSync(path.join(ARCHIVE, a), "utf8"));
        if (d.players && d.players[fed]) { ficha = d.players[fed]; break; }
      }
      if (!ficha) { console.log(`  ${fed}: ⚠ sem ficha em nenhuma auditoria — acrescentar à mão`); semFicha++; }
      else { players[fed] = ficha; repostos++; console.log(`  ${fed}: ${ficha.name} reposto no players.json`); }
    }
    /* Bruto: do arquivo, senão do histórico do git. */
    const src = path.join(ARCHIVE, "players", fed);
    const dst = path.join(OUTPUT, fed);
    if (fs.existsSync(src)) {
      fs.mkdirSync(dst, { recursive: true });
      for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dst, f));
      comBruto++;
      console.log(`  ${fed}: scrape bruto restaurado de data-archive/players/${fed}/`);
    } else {
      console.log(`  ${fed}: ⚠ sem bruto arquivado — recuperar do histórico:`);
      console.log(`        git checkout <sha-antes-do-corte> -- output/${fed}/`);
    }
  }
  if (repostos) {
    const json = JSON.stringify(players, null, 2) + "\n";
    fs.writeFileSync(PLAYERS_PUB, json);
    if (fs.existsSync(PLAYERS_ROOT)) fs.writeFileSync(PLAYERS_ROOT, json);
  }
  console.log(`\n✅ ${repostos} reposto(s) no players.json · ${comBruto} com scrape bruto restaurado` +
              (semFicha ? ` · ${semFicha} sem ficha` : ""));
  console.log(`ℹ️  A seguir: node pipeline.js --skip-import ${alvos.join(" ")}   (regenera analysis/data.json)`);
  console.log(`   E, se o bruto vier do histórico e estiver desactualizado:`);
  console.log(`   node scripts/fpg-scrape-node.js ${alvos.join(" ")} --full`);
  process.exit(0);
}

/* ── Ler ─────────────────────────────────────────────────────────────── */
const players = JSON.parse(fs.readFileSync(PLAYERS_PUB, "utf8"));
const feds = Object.keys(players);

const kept = {}, removed = {};
const motivos = {};
for (const [fed, p] of Object.entries(players)) {
  const m = manter({ ...p, nfed: fed });
  if (m) { kept[fed] = p; motivos[m] = (motivos[m] || 0) + 1; }
  else removed[fed] = p;
}

/* Pastas em output/ sem entrada em players.json (órfãs de runs antigos). */
const dirs = fs.existsSync(OUTPUT)
  ? fs.readdirSync(OUTPUT).filter((d) => /^\d+$/.test(d) && fs.statSync(path.join(OUTPUT, d)).isDirectory())
  : [];
const orfaos = dirs.filter((d) => !players[d]);
const apagar = dirs.filter((d) => removed[d] || !players[d]);

const tamanho = (d) => {
  let s = 0;
  const walk = (p) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const q = path.join(p, e.name);
      if (e.isDirectory()) walk(q); else { try { s += fs.statSync(q).size; } catch {} }
    }
  };
  try { walk(d); } catch {}
  return s;
};
const bytesApagar = apagar.reduce((s, d) => s + tamanho(path.join(OUTPUT, d)), 0);
const gb = (b) => (b / 1073741824).toFixed(2) + " GB";

/* ── Relatório ───────────────────────────────────────────────────────── */
console.log(`📖 players.json: ${feds.length} jogadores · output/: ${dirs.length} pastas`);
console.log(`\n✅ Manter: ${Object.keys(kept).length}`);
for (const [k, v] of Object.entries(motivos).sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(4)}  ${k}`);
console.log(`\n🗑  Remover de players.json: ${Object.keys(removed).length}`);
console.log(`🗑  Apagar pastas em output/: ${apagar.length} (inclui ${orfaos.length} órfãs) = ${gb(bytesApagar)}`);

if (!APPLY) {
  console.log(`\n🔍 DRY-RUN — nada foi alterado. Correr com --apply para aplicar.`);
  process.exit(0);
}

/* ── Aplicar ─────────────────────────────────────────────────────────── */
fs.mkdirSync(ARCHIVE, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const auditPath = path.join(ARCHIVE, `players-removidos-${stamp}.json`);
/* ⚠ A auditoria é a rede de segurança do `--restore`: NUNCA a substituir.
 * Duas passagens no mesmo dia caem no mesmo nome de ficheiro — sem este
 * merge, a segunda (com 1 jogador) apagava a primeira (com 494) e perdiam-se
 * as fichas de quem tinha sido cortado. */
let anterior = {};
if (fs.existsSync(auditPath)) {
  try { anterior = JSON.parse(fs.readFileSync(auditPath, "utf8")).players || {}; } catch {}
}
const todos = { ...anterior, ...removed };
fs.writeFileSync(auditPath, JSON.stringify({
  gerado_em: new Date().toISOString(),
  regra: { LIMITES, ano: YEAR, fixos: { manuel: MANUEL, coorte: COORTE_PERCURSO, tags: TAGS_FIXAS } },
  total: Object.keys(todos).length,
  players: todos,
}, null, 2) + "\n");
console.log(`\n💾 Auditoria: ${path.relative(ROOT, auditPath)}`);

const json = JSON.stringify(kept, null, 2) + "\n";
fs.writeFileSync(PLAYERS_PUB, json);
if (fs.existsSync(PLAYERS_ROOT)) fs.writeFileSync(PLAYERS_ROOT, json);
console.log(`✏️  players.json reescrito (${Object.keys(kept).length} jogadores)`);

let n = 0;
for (const d of apagar) { fs.rmSync(path.join(OUTPUT, d), { recursive: true, force: true }); n++; }
console.log(`🗑  ${n} pastas apagadas de output/ (${gb(bytesApagar)} libertados)`);
