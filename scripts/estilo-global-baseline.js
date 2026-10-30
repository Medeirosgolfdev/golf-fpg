#!/usr/bin/env node
/**
 * Regrava scripts/estilo-global.baseline.json com as contas actuais (ver
 * scripts/lib/estilo-global.js). Correr depois de arrumar um ficheiro, para a
 * trava do teste apertar. Recusa SUBIR uma conta sem `--force`.
 */
const fs = require("fs");
const { contar, totais, BASELINE } = require("./lib/estilo-global");

const force = process.argv.includes("--force");
const novo = contar();
const antigo = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : null;

if (antigo && !force) {
  const subiram = [];
  for (const [f, linha] of Object.entries(novo)) {
    for (const [k, n] of Object.entries(linha)) {
      const antes = antigo.ficheiros?.[f]?.[k] ?? 0;
      if (n > antes) subiram.push(`${f} ${k}: ${antes} → ${n}`);
    }
  }
  if (subiram.length) {
    console.error("❌ Contas que subiram (usar as peças globais, ou --force):\n  " + subiram.join("\n  "));
    process.exit(1);
  }
}

const out = { gerado: new Date().toISOString().slice(0, 10), totais: totais(novo), ficheiros: novo };
fs.writeFileSync(BASELINE, JSON.stringify(out, null, 2) + "\n");
console.log("✓ baseline regravado:", JSON.stringify(out.totais));
if (antigo) console.log("  antes:", JSON.stringify(antigo.totais));
