'use strict';

/**
 * split-member-history.js
 *
 * Lê o ficheiro monolítico `data-archive/uskids-member-history.json`
 * produzido por `fetch-uskids-member-history.js` e parte-o em chunks
 * numerados (`uskids-member-history-001.json`, `-002.json`, ...) com
 * tamanho ≤ ~85 MB cada.
 *
 * Motivo: GitHub rejeita ficheiros ≥ 100 MB. Com chunks ≤ ~85 MB temos
 * margem folgada contra esse limite. Os chunks mantêm o formato esperado
 * por `build-member-history-slim.js`.
 *
 * Fluxo dentro do script:
 *   1. Ler o monolítico.
 *   2. Apagar todos os chunks numerados antigos em `data-archive/`
 *      (o número de chunks pode variar de corrida para corrida).
 *   3. Distribuir jogadores em chunks ≤ TARGET_CHUNK_SIZE.
 *   4. Escrever cada chunk com `{ gerado_em, torneios, jogadores: {...} }`.
 *      Nota: `torneios` é duplicado em todos os chunks — isto é seguro
 *      porque `build-member-history-slim.js` faz merge (ver linhas 113-132
 *      desse script).
 *   5. Apagar o monolítico (já não é necessário em git; o fetch seguinte
 *      vai reconstruí-lo a partir dos chunks via --clean ou mergerá-los
 *      internamente se for preciso).
 *
 * Uso:
 *   node scripts/split-member-history.js
 *   node scripts/split-member-history.js --keep-monolith   (não apaga o monolítico)
 *   node scripts/split-member-history.js --target-mb=70    (override do target size)
 *   node scripts/split-member-history.js --input=path.json (override do input)
 */

const fs   = require('fs');
const path = require('path');

// ── Config ───────────────────────────────────────────────────────────
const argArchiveDir = (process.argv.find(a => a.startsWith('--archive-dir=')) || '').split('=')[1];
const ARCHIVE_DIR   = argArchiveDir
  ? path.resolve(argArchiveDir)
  : path.join(__dirname, '..', 'data-archive');

const argTargetMb = (process.argv.find(a => a.startsWith('--target-mb=')) || '').split('=')[1];
const TARGET_MB   = argTargetMb ? parseInt(argTargetMb, 10) : 85;   // default 85 MB (margem contra 100 MB)
const TARGET_SIZE = TARGET_MB * 1024 * 1024;

const argInput = (process.argv.find(a => a.startsWith('--input=')) || '').split('=')[1];
// Se INPUT não for passado, default é o monolítico em ARCHIVE_DIR.
// Se for passado e for uma DIRECTORIA, consolida todos os chunks dela primeiro.
const INPUT    = argInput ? path.resolve(argInput) : path.join(ARCHIVE_DIR, 'uskids-member-history.json');

// Flag --from-chunks: lê os chunks existentes em ARCHIVE_DIR e re-distribui
// (sem precisar de monolítico). Útil quando o ficheiro 001.json passou >100MB
// e os outros já existem mas em tamanhos desequilibrados.
const FROM_CHUNKS = process.argv.includes('--from-chunks');

const KEEP_MONOLITH = process.argv.includes('--keep-monolith');

const CHUNK_RE = /^uskids-member-history-\d{3,}\.json$/;

// ── Helpers ──────────────────────────────────────────────────────────
function humanBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function writeChunk(idx, torneios, jogadoresSlice, geradoEm) {
  const nnn = String(idx).padStart(3, '0');
  const outPath = path.join(ARCHIVE_DIR, `uskids-member-history-${nnn}.json`);
  const payload = {
    gerado_em: geradoEm,
    torneios,
    jogadores: jogadoresSlice,
  };
  // JSON.stringify sem indentação — chunks são ficheiros de cache, não
  // precisam de ser human-readable. Reduz tamanho em ~30%.
  const str = JSON.stringify(payload);
  fs.writeFileSync(outPath, str, 'utf8');
  return { path: outPath, size: Buffer.byteLength(str, 'utf8') };
}

// Consolida todos os chunks da pasta `dir` num único objecto in-memory.
// Merge: prioridade aos jogadores com `name` (não-vazio, não "?"). Para
// torneios, prioridade ao registo mais completo (mais campos não-vazios).
function consolidateChunks(dir) {
  const files = fs.readdirSync(dir)
    .filter(f => CHUNK_RE.test(f))
    .map(f => path.join(dir, f))
    .sort();
  if (!files.length) {
    console.error(`❌ Nenhum chunk encontrado em ${dir}`);
    process.exit(1);
  }
  console.log(`📂 A consolidar ${files.length} chunks de ${path.relative(process.cwd(), dir)}…`);
  const torneios = {};
  const jogadores = {};
  let geradoEm = '';
  for (const fn of files) {
    const stat = fs.statSync(fn);
    console.log(`   • ${path.basename(fn)} (${humanBytes(stat.size)})`);
    const d = JSON.parse(fs.readFileSync(fn, 'utf8'));
    if (d.gerado_em && d.gerado_em > geradoEm) geradoEm = d.gerado_em;
    for (const [tid, t] of Object.entries(d.torneios || {})) {
      if (!torneios[tid]) torneios[tid] = t;
    }
    for (const [mid, p] of Object.entries(d.jogadores || {})) {
      const existing = jogadores[mid];
      if (!existing) { jogadores[mid] = p; continue; }
      // Preferir nome real sobre "?" / vazio
      const goodName = (n) => n && n !== '?';
      if (!goodName(existing.name) && goodName(p.name)) {
        jogadores[mid] = { ...existing, ...p, torneios: { ...(existing.torneios || {}), ...(p.torneios || {}) } };
      } else {
        // Merge torneios (mais é melhor)
        existing.torneios = { ...(existing.torneios || {}), ...(p.torneios || {}) };
        if (!existing.country && p.country) existing.country = p.country;
        if (!existing.ageGroup && p.ageGroup) existing.ageGroup = p.ageGroup;
      }
    }
  }
  return { torneios, jogadores, geradoEm: geradoEm || new Date().toISOString() };
}

// ── Main ─────────────────────────────────────────────────────────────
function main() {
  let data;
  if (FROM_CHUNKS) {
    data = consolidateChunks(ARCHIVE_DIR);
    console.log('══════════════════════════════════════════════');
    console.log('✂️   split-member-history.js (--from-chunks)');
    console.log(`    archive-dir: ${path.relative(process.cwd(), ARCHIVE_DIR)}`);
    console.log(`    target:      ≤ ${TARGET_MB} MB por chunk`);
    console.log('══════════════════════════════════════════════\n');
  } else {
    if (!fs.existsSync(INPUT)) {
      console.error(`❌ Input não encontrado: ${INPUT}`);
      console.error(`   Dica: usa --from-chunks para consolidar os chunks existentes em ${ARCHIVE_DIR}`);
      process.exit(1);
    }
    const statIn = fs.statSync(INPUT);
    console.log('══════════════════════════════════════════════');
    console.log('✂️   split-member-history.js');
    console.log(`    input:       ${path.relative(process.cwd(), INPUT)} (${humanBytes(statIn.size)})`);
    console.log(`    archive-dir: ${path.relative(process.cwd(), ARCHIVE_DIR)}`);
    console.log(`    target:      ≤ ${TARGET_MB} MB por chunk`);
    console.log('══════════════════════════════════════════════\n');
    console.log('📂 A ler monolítico…');
    const raw = fs.readFileSync(INPUT, 'utf8');
    const parsed = JSON.parse(raw);
    data = {
      torneios: parsed.torneios || {},
      jogadores: parsed.jogadores || {},
      geradoEm: parsed.gerado_em || new Date().toISOString()
    };
  }

  const { torneios, jogadores, geradoEm } = data;
  const mids = Object.keys(jogadores);
  console.log(`   ${Object.keys(torneios).length} torneios, ${mids.length} jogadores\n`);

  // Apagar chunks antigos
  let removed = 0;
  for (const f of fs.readdirSync(ARCHIVE_DIR)) {
    if (CHUNK_RE.test(f)) {
      fs.unlinkSync(path.join(ARCHIVE_DIR, f));
      removed++;
    }
  }
  console.log(`🗑️   ${removed} chunks antigos removidos\n`);

  // Estimar overhead fixo: o envelope (gerado_em + torneios vazio) + o
  // `torneios` partilhado. Tudo o que NÃO seja jogadores.
  const envelope = { gerado_em: geradoEm, torneios, jogadores: {} };
  const fixedOverhead = Buffer.byteLength(JSON.stringify(envelope), 'utf8');
  const playersBudget = Math.max(TARGET_SIZE - fixedOverhead, 1024 * 1024); // no mínimo 1 MB
  console.log(`📏 Overhead fixo (torneios partilhados): ${humanBytes(fixedOverhead)}`);
  console.log(`📏 Budget de jogadores por chunk: ${humanBytes(playersBudget)}\n`);

  if (fixedOverhead > TARGET_SIZE * 0.8) {
    console.warn(`⚠️   Aviso: overhead fixo ocupa >80 % do target. Considerar aumentar --target-mb.`);
  }

  // Distribuir
  console.log('📦 A escrever chunks…');
  const written = [];
  let chunkIdx = 1;
  let currentSlice = {};
  let currentSize  = 0;  // tamanho acumulado dos jogadores do chunk actual

  for (let i = 0; i < mids.length; i++) {
    const mid = mids[i];
    const player = jogadores[mid];
    // Estimativa: string serializada do par "mid":{...} + vírgula.
    // É uma aproximação suficiente (±1 %) e muito mais rápida do que
    // serializar o chunk completo a cada jogador.
    const entryStr = JSON.stringify({ [mid]: player });
    // entryStr começa com `{` e acaba com `}` — descontar esses 2 chars
    // para aproximar do incremento dentro de um objecto maior.
    const entrySize = Buffer.byteLength(entryStr, 'utf8') - 2 + 1; // +1 por vírgula

    if (currentSize + entrySize > playersBudget && Object.keys(currentSlice).length > 0) {
      const info = writeChunk(chunkIdx++, torneios, currentSlice, geradoEm);
      written.push(info);
      currentSlice = {};
      currentSize  = 0;
    }

    currentSlice[mid] = player;
    currentSize += entrySize;
  }

  if (Object.keys(currentSlice).length > 0) {
    const info = writeChunk(chunkIdx++, torneios, currentSlice, geradoEm);
    written.push(info);
  }

  // Relatório
  const maxSize = written.reduce((m, w) => Math.max(m, w.size), 0);
  const totalSize = written.reduce((s, w) => s + w.size, 0);
  console.log();
  for (const w of written) {
    const rel = path.relative(process.cwd(), w.path);
    console.log(`   ✅ ${rel}  (${humanBytes(w.size)})`);
  }
  console.log();
  console.log(`✅ ${written.length} chunks escritos`);
  console.log(`   Maior chunk: ${humanBytes(maxSize)}`);
  console.log(`   Total:       ${humanBytes(totalSize)}`);

  if (maxSize >= 100 * 1024 * 1024) {
    console.error(`\n❌ ERRO: pelo menos um chunk excede 100 MB — GitHub vai rejeitar.`);
    console.error(`   Tentar com --target-mb=${Math.floor(TARGET_MB * 0.9)}.`);
    process.exit(1);
  }

  // Apagar monolítico (só se existia — em modo --from-chunks pode não existir)
  if (!KEEP_MONOLITH) {
    if (!FROM_CHUNKS && fs.existsSync(INPUT)) {
      fs.unlinkSync(INPUT);
      console.log(`\n🗑️   monolítico removido: ${path.relative(process.cwd(), INPUT)}`);
    }
  } else {
    console.log(`\n📌 --keep-monolith: monolítico mantido`);
  }

  console.log('══════════════════════════════════════════════');
}

main();
