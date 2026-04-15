#!/usr/bin/env node
/**
 * cleanup-inactive-players.js
 * ═══════════════════════════════════════════════════════════════
 * Remove de `public/data/players.json` os jogadores que já não
 * aparecem em `public/data/federados.json` (i.e. não pagaram
 * quotas FPG este ano — perderam estado "Ativo").
 *
 * - Faz backup do ficheiro original em `public/data/players.json.bak`
 * - Escreve `public/data/players-inactive.json` com os removidos
 *   (por auditoria e possível restauro)
 * - Preserva os /data/analysis/{fed}/data.json (dados históricos)
 *
 * USO:
 *   node scripts/cleanup-inactive-players.js --dry     # apenas lista, não altera
 *   node scripts/cleanup-inactive-players.js --apply   # aplica remoção
 * ═══════════════════════════════════════════════════════════════
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PLAYERS_FILE  = path.join(ROOT, "public/data/players.json");
const FEDS_FILE     = path.join(ROOT, "public/data/federados.json");
const BACKUP_FILE   = path.join(ROOT, "public/data/players.json.bak");
const INACTIVE_FILE = path.join(ROOT, "public/data/players-inactive.json");

const args = process.argv.slice(2);
const DRY   = args.includes("--dry") || (!args.includes("--apply"));
const APPLY = args.includes("--apply");

if (DRY && !APPLY) console.log("🔍 Modo DRY-RUN (use --apply para aplicar)\n");

/* ── Carregar ficheiros ───────────────────────────────────────── */
if (!fs.existsSync(PLAYERS_FILE)) { console.error("❌ players.json não encontrado"); process.exit(1); }
if (!fs.existsSync(FEDS_FILE))    { console.error("❌ federados.json não encontrado"); process.exit(1); }

const players = JSON.parse(fs.readFileSync(PLAYERS_FILE, "utf8"));
const feds    = JSON.parse(fs.readFileSync(FEDS_FILE,    "utf8"));

const activeFednos = new Set(feds.players.map(f => String(f.federation_code)));
console.log(`📖 Lidos ${Object.keys(players).length} players, ${feds.players.length} federados activos na FPG\n`);

/* ── Separar activos / inactivos ──────────────────────────────── */
const kept = {};
const removed = {};
for (const [nfed, p] of Object.entries(players)) {
  if (activeFednos.has(String(nfed))) {
    kept[nfed] = p;
  } else {
    removed[nfed] = p;
  }
}

const keptCount = Object.keys(kept).length;
const removedCount = Object.keys(removed).length;

console.log(`✅ Manter: ${keptCount}`);
console.log(`🗑  Remover (não-activos FPG): ${removedCount}\n`);

/* ── Resumo dos removidos ─────────────────────────────────────── */
if (removedCount) {
  const byEsc = {};
  for (const p of Object.values(removed)) {
    byEsc[p.escalao || "?"] = (byEsc[p.escalao || "?"] || 0) + 1;
  }
  console.log("Removidos por escalão:");
  for (const [k, v] of Object.entries(byEsc).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${k.padEnd(10)} ${v}`);
  }
  console.log("\nPrimeiros 10:");
  const list = Object.entries(removed).slice(0, 10);
  for (const [nfed, p] of list) {
    const club = p.club?.short || p.club || "";
    console.log(`   ${nfed.padEnd(7)} ${p.name.padEnd(40)} ${club.padEnd(20)} HCP ${p.hcp ?? "—"}`);
  }
  if (removedCount > 10) console.log(`   ... + ${removedCount - 10} mais`);
}

/* ── Aplicar ou parar ─────────────────────────────────────────── */
if (!APPLY) {
  console.log("\n💡 Dry-run concluído. Use `--apply` para persistir as mudanças.");
  console.log("   Um backup será criado em players.json.bak");
  console.log("   Os removidos serão guardados em players-inactive.json");
  process.exit(0);
}

/* ── Backup ───────────────────────────────────────────────────── */
fs.copyFileSync(PLAYERS_FILE, BACKUP_FILE);
console.log(`\n💾 Backup criado: ${path.relative(ROOT, BACKUP_FILE)}`);

/* ── Gravar players.json limpo ────────────────────────────────── */
fs.writeFileSync(PLAYERS_FILE, JSON.stringify(kept, null, 2) + "\n", "utf8");
console.log(`✍️  players.json actualizado: ${keptCount} jogadores`);

/* ── Gravar players-inactive.json com os removidos ────────────── */
const inactiveOutput = {
  generated: new Date().toISOString(),
  reason: "Não presentes em federados.json (FedStat=9 Ativo) — provavelmente não pagaram quotas FPG este ano",
  count: removedCount,
  players: removed,
};
fs.writeFileSync(INACTIVE_FILE, JSON.stringify(inactiveOutput, null, 2) + "\n", "utf8");
console.log(`📁 Removidos guardados: ${path.relative(ROOT, INACTIVE_FILE)}`);

console.log("\n✅ Concluído.");
