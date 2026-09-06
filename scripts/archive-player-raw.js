#!/usr/bin/env node
/**
 * archive-player-raw.js
 * ═══════════════════════════════════════════════════════════════════════
 * Guarda em `data-archive/players/{fed}/` o SCRAPE BRUTO dos jogadores que
 * saíram do scope (ver `scripts/prune-player-scope.js`).
 *
 * PORQUÊ: `data-archive/` está fora de `public/` e fora do `outDir` do Vite,
 * por isso NÃO entra no deployment do Vercel — mas continua no repositório.
 * Assim os derivados (course-players, recent-tournaments, cross-data…) podem
 * ser RECONSTRUÍDOS no futuro, e não apenas congelados, sem depender de a FPG
 * ainda ter os dados nem de as cookies estarem válidas.
 *
 * Os ficheiros vêm do commit ANTERIOR ao corte (`--from`), por isso são os
 * MESMOS objectos git que já estão no histórico: repô-los noutro caminho não
 * cria blobs novos, só entradas de árvore. O custo é disco no clone, não
 * histórico.
 *
 * USO:
 *   node scripts/archive-player-raw.js --from <sha>            # dry-run
 *   node scripts/archive-player-raw.js --from <sha> --apply
 *   node scripts/archive-player-raw.js --from <sha> --apply --scorecards
 *        (--scorecards inclui o buraco-a-buraco: mais 435 MB, mas é o que
 *         permite reconstruir scorecards e não só a lista de voltas)
 * ═══════════════════════════════════════════════════════════════════════
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT    = path.join(__dirname, "..");
const ARCHIVE = path.join(ROOT, "data-archive", "players");
const PLAYERS = path.join(ROOT, "public/data/players.json");

const args  = process.argv.slice(2);
const APPLY = args.includes("--apply");
const COM_SCORECARDS = args.includes("--scorecards");
const FROM  = args[args.indexOf("--from") + 1];
if (!FROM || FROM.startsWith("--")) {
  console.error("Falta --from <sha> (o commit ANTES do corte, onde as pastas ainda existem).");
  process.exit(1);
}

const git = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 1 << 28 });

/* Ficheiros a arquivar, por jogador. O `analysis/data.json` NÃO entra: é
 * derivado (o pipeline regenera-o do whs+scorecards) e é o que era pesado. */
const FICHEIROS = ["whs.json", "whs-list.json", ...(COM_SCORECARDS ? ["scorecards.json"] : [])];

/* Quem já não está no players.json é candidato a arquivo. */
const noScope = new Set(Object.keys(JSON.parse(fs.readFileSync(PLAYERS, "utf8"))));

const listagem = git("ls-tree", "-r", "-l", FROM, "output/").toString().split("\n");
const porFed = new Map();
for (const linha of listagem) {
  const [meta, caminho] = linha.split("\t");
  if (!caminho) continue;
  const m = /^output\/(\d+)\/(.+)$/.exec(caminho);
  if (!m) continue;
  const [, fed, resto] = m;
  if (noScope.has(fed)) continue;                 // ainda seguido — fica em output/
  if (!FICHEIROS.includes(resto)) continue;
  const size = Number(meta.trim().split(/\s+/)[3]) || 0;
  if (!porFed.has(fed)) porFed.set(fed, []);
  porFed.get(fed).push({ caminho, resto, size });
}

let bytes = 0, n = 0;
for (const [, fs_] of porFed) for (const f of fs_) { bytes += f.size; n++; }
console.log(`📦 ${porFed.size} jogadores fora do scope · ${n} ficheiros · ${(bytes / 1048576).toFixed(0)} MB`);
console.log(`   ficheiros por jogador: ${FICHEIROS.join(", ")}`);

if (!APPLY) { console.log("\n🔍 DRY-RUN — nada escrito. Correr com --apply."); process.exit(0); }

let escritos = 0, saltados = 0;
for (const [fed, ficheiros] of porFed) {
  const dir = path.join(ARCHIVE, fed);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ficheiros) {
    const destino = path.join(dir, f.resto);
    if (fs.existsSync(destino)) { saltados++; continue; }   // idempotente
    fs.writeFileSync(destino, git("show", `${FROM}:${f.caminho}`));
    escritos++;
  }
}
console.log(`✅ ${escritos} ficheiros arquivados em data-archive/players/ (${saltados} já existiam)`);
console.log("ℹ️  data-archive/ NÃO é copiado para o build — não conta para o deployment.");
