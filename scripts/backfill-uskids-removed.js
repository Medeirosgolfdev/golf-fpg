/**
 * backfill-uskids-removed.js
 *
 * Reconstrói o histórico de desinscrições (removed) de uskids-field.json a
 * partir do histórico git, e popula o campo `removed` (formato cumulativo
 * { nome, removedAt, pais }) no ficheiro atual.
 *
 * - Percorre todos os commits do ficheiro (oldest -> newest) + working tree.
 * - Para cada escalão com lista de jogadores (Boys 9-13), deteta quem estava
 *   na recolha anterior e desapareceu na seguinte -> evento de saída na data
 *   desse commit.
 * - Quem se re-inscreveu depois é removido da lista (limpo pela presença).
 * - Mantém apenas saídas dentro da janela de WINDOW_DAYS dias.
 *
 * Uso:
 *   node scripts/backfill-uskids-removed.js          # dry-run (não escreve)
 *   node scripts/backfill-uskids-removed.js --apply   # escreve o ficheiro
 */
const { execSync } = require('child_process');
const fs = require('fs');

const FILE = 'public/data/uskids-field.json';
const WINDOW_DAYS = 60;
const APPLY = process.argv.includes('--apply');
const NOW = Date.now();

function norm(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function snapshotFromJson(d) {
  // t||esc -> Map(norm -> { nome, pais })  — só escalões com lista de nomes
  const m = new Map();
  for (const t of (d.torneios || [])) {
    for (const e of (t.escaloes || [])) {
      if (!Array.isArray(e.jogadores)) continue;
      const key = `${t.t}||${e.nome}`;
      const inner = new Map();
      for (const j of e.jogadores) {
        if (!j || !j.nome) continue;
        inner.set(norm(j.nome), { nome: j.nome, pais: j.pais });
      }
      m.set(key, inner);
    }
  }
  return m;
}

// 1) commits oldest -> newest (janela folgada para apanhar contexto)
const log = execSync(
  `git log --format=%H%x09%cI --reverse -- ${FILE}`,
  { encoding: 'utf8', maxBuffer: 1 << 30 }
).trim().split('\n').filter(Boolean);
const commits = log.map(l => { const [h, d] = l.split('\t'); return { hash: h, date: d }; });

const prevPresent = new Map();          // t||esc -> Map(norm -> {nome,pais})
const removal = new Map();               // t||esc||norm -> {nome,pais,removedAt}

function processSnapshot(snap, date) {
  // saídas: estava em prev, já não está agora
  for (const [key, prevInner] of prevPresent) {
    const curInner = snap.get(key);
    if (!curInner) continue; // escalão ausente nesta recolha (glitch) -> não marcar
    for (const [nk, info] of prevInner) {
      if (!curInner.has(nk)) {
        removal.set(`${key}||${nk}`, { nome: info.nome, pais: info.pais, removedAt: date });
      }
    }
  }
  // re-inscrições / presentes: limpar da lista de saídas
  for (const [key, curInner] of snap) {
    for (const nk of curInner.keys()) removal.delete(`${key}||${nk}`);
  }
  // baseline para a próxima recolha (só chaves presentes nesta)
  for (const [key, inner] of snap) prevPresent.set(key, inner);
}

for (const c of commits) {
  let d;
  try { d = JSON.parse(execSync(`git show ${c.hash}:${FILE}`, { encoding: 'utf8', maxBuffer: 1 << 30 })); }
  catch { continue; }
  processSnapshot(snapshotFromJson(d), c.date);
}

// 2) working tree como recolha final (estado que o site serve agora)
const current = JSON.parse(fs.readFileSync(FILE, 'utf8'));
processSnapshot(snapshotFromJson(current), current.gerado_em || new Date().toISOString());

// 3) filtrar janela e agrupar por escalão
const byEsc = new Map(); // t||esc -> [{nome,removedAt,pais}]
let totalKept = 0, totalPruned = 0;
for (const [k, v] of removal) {
  const ageDays = (NOW - new Date(v.removedAt).getTime()) / 86400_000;
  if (ageDays > WINDOW_DAYS) { totalPruned++; continue; }
  const escKey = k.split('||').slice(0, 2).join('||');
  if (!byEsc.has(escKey)) byEsc.set(escKey, []);
  byEsc.get(escKey).push({ nome: v.nome, removedAt: v.removedAt, pais: v.pais || null });
  totalKept++;
}
for (const arr of byEsc.values()) arr.sort((a, b) => b.removedAt.localeCompare(a.removedAt));

// 4) aplicar ao ficheiro atual
let escComRemoved = 0, torneiosComRemoved = new Set();
for (const t of current.torneios) {
  for (const e of (t.escaloes || [])) {
    if (!Array.isArray(e.jogadores)) continue;
    const escKey = `${t.t}||${e.nome}`;
    const rem = byEsc.get(escKey);
    if (rem && rem.length) {
      e.removed = rem;
      escComRemoved++;
      torneiosComRemoved.add(t.t);
    } else if ('removed' in e) {
      delete e.removed;
    }
  }
}

console.log(`Commits processados: ${commits.length}`);
console.log(`Saídas detetadas (dentro de ${WINDOW_DAYS}d): ${totalKept}  |  podadas (>${WINDOW_DAYS}d): ${totalPruned}`);
console.log(`Escalões com desinscritos: ${escComRemoved}  em ${torneiosComRemoved.size} torneios`);

// amostra: EC 2026 (21131) Boys 12
const ec = current.torneios.find(t => t.t === 21131);
if (ec) {
  const b12 = ec.escaloes.find(e => e.nome === 'Boys 12');
  console.log(`\nEC2026 Boys 12 desinscritos:`, b12 && b12.removed ? b12.removed : '(nenhum)');
}
// top torneios por nº de desinscritos
const tops = [...current.torneios]
  .map(t => ({ name: t.name, t: t.t, n: (t.escaloes || []).reduce((s, e) => s + (e.removed ? e.removed.length : 0), 0) }))
  .filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 12);
console.log(`\nTop torneios por desinscritos:`);
for (const x of tops) console.log(`  ${x.n.toString().padStart(3)}  ${x.name} (t=${x.t})`);

if (APPLY) {
  const json = JSON.stringify(current, null, 2).replace(/\n/g, '\r\n');
  fs.writeFileSync(FILE, json, 'utf8');
  console.log(`\n✅ Escrito ${FILE} (CRLF, ${json.length} bytes)`);
} else {
  console.log(`\n(dry-run — usar --apply para escrever)`);
}
