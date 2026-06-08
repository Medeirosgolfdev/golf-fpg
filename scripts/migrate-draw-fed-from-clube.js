#!/usr/bin/env node
/*
 * migrate-draw-fed-from-clube.js
 *
 * Correção offline (sem rede) do bug histórico em que o parser antigo de draws
 * lia a coluna "Federado" como se fosse "Clube" (layout de 6 colunas
 * [Hora, Tee#, Cor, Nome, Fed, Clube] não previsto). Resultado: ~77 torneios
 * (sobretudo 2022-2023) ficaram com o nº de federado guardado em player.clube.
 *
 * Esta migração percorre public/data/fpg-admissions-draws.json e, para cada
 * jogador de draw cujo `clube` parece um fed (4-6 dígitos) e que não tem `fed`,
 * move o número para `fed` e limpa `clube` (o nome real do clube não foi
 * capturado na altura; a UI preenche-o via playersDB).
 *
 * NÃO faz pedidos de rede. Cria backup antes de escrever.
 *
 *   node scripts/migrate-draw-fed-from-clube.js          # dry-run (não escreve)
 *   node scripts/migrate-draw-fed-from-clube.js --apply  # aplica
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "public", "data", "fpg-admissions-draws.json");
const APPLY = process.argv.includes("--apply");
const isFed = (s) => typeof s === "string" && /^\d{4,6}$/.test(s.trim());

const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
let players = 0, fixed = 0, tournamentsTouched = 0;

for (const t of data.tournaments || []) {
  let touched = false;
  for (const rd of Object.values(t.draws || {})) {
    for (const g of rd.groups || []) {
      for (const p of g.players || []) {
        players++;
        if (!p.fed && isFed(p.clube)) {
          p.fed = p.clube.trim();
          p.clube = null;
          fixed++;
          touched = true;
        }
      }
    }
  }
  if (touched) tournamentsTouched++;
}

console.log(`Jogadores de draw analisados: ${players}`);
console.log(`Corrigidos (fed movido de clube): ${fixed}`);
console.log(`Torneios afetados: ${tournamentsTouched}`);

if (!fixed) {
  console.log("Nada a fazer.");
  process.exit(0);
}

if (!APPLY) {
  console.log("\nDry-run — nada escrito. Corre com --apply para aplicar.");
  process.exit(0);
}

const backup = FILE.replace(/\.json$/, `.backup-${Date.now()}.json`);
fs.copyFileSync(FILE, backup);
fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
console.log(`\nBackup: ${path.basename(backup)}`);
console.log(`Escrito: ${path.basename(FILE)}`);
