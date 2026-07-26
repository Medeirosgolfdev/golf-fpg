/**
 * export-inscricoes.js
 * Copia data/inscricoes_nacionais.json para public/data/inscricoes_nacionais.json
 * para que seja servido como ficheiro estático tanto em Vite como em Vercel.
 *
 * Uso: node scripts/export-inscricoes.js
 * Ou adicionar ao package.json: "export:inscricoes": "node scripts/export-inscricoes.js"
 */

const { existsSync, mkdirSync, copyFileSync, readFileSync } = require('fs');
const { join } = require('path');

const SRC  = join(process.cwd(), 'data', 'inscricoes_nacionais.json');
const DEST_DIR = join(process.cwd(), 'public', 'data');
const DEST = join(DEST_DIR, 'inscricoes_nacionais.json');

if (!existsSync(SRC)) {
  console.error('[export-inscricoes] Ficheiro de origem nao encontrado:', SRC);
  console.error('  -> Corre primeiro o Vite localmente e carrega as inscricoes uma vez.');
  process.exit(1);
}

if (!existsSync(DEST_DIR)) {
  mkdirSync(DEST_DIR, { recursive: true });
  console.log('[export-inscricoes] Criado directorio:', DEST_DIR);
}

copyFileSync(SRC, DEST);

// Sumario
const cache = JSON.parse(readFileSync(SRC, 'utf8'));
const entries = Object.entries(cache);
console.log(`[export-inscricoes] Exportados ${entries.length} torneios para ${DEST}`);
entries.forEach(([tcode, entry]) => {
  const e = entry;
  console.log(`  ${e.nome ?? tcode}: ${e.totalInscritos ?? 0} inscritos (${e.lastFetched ? new Date(e.lastFetched).toLocaleString('pt-PT') : '?'})`);
});
console.log('\n[export-inscricoes] Faz commit de public/data/inscricoes_nacionais.json e faz deploy.');
