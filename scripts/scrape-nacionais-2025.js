/**
 * scrape-nacionais-2025.js
 * Descarrega os resultados dos Campeonatos Nacionais de Jovens 2025 da datagolf.pt
 * 
 * Uso:
 *   node scripts/scrape-nacionais-2025.js
 *   node scripts/scrape-nacionais-2025.js --raw   (guarda HTML bruto para debug)
 */

const { writeFileSync, mkdirSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');

// Ler .env.local manualmente sem dependencias externas
function loadEnvLocal() {
  const f = join(process.cwd(), '.env.local');
  if (!existsSync(f)) return;
  readFileSync(f, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}
loadEnvLocal();

const RAW_FLAG  = process.argv.includes('--raw');
const OUT_FILE  = join(process.cwd(), 'data', 'nacionais_2025.json');
const HTML_DIR  = join(process.cwd(), 'data', '_html_debug');

const TORNEIOS = [
  // Campeonato Nacional de Jovens 2025 — inscrições normais (ccode=000)
  { tcode: '10870', ccode: '000', nome: 'Nacional 2025 — Sub-12 H (estimativa)',  escalao: 'Sub-12', sex: 'M' },
  { tcode: '10869', ccode: '000', nome: 'Nacional 2025 — Sub-12 S (estimativa)',  escalao: 'Sub-12', sex: 'F' },
  { tcode: '10868', ccode: '000', nome: 'Nacional 2025 — Sub-14 H (estimativa)',  escalao: 'Sub-14', sex: 'M' },
  // ccode=988 (outro circuito / fase)
  { tcode: '10254', ccode: '988', nome: 'Nacional 2025 — A (ccode=988)',           escalao: '?',     sex: '?' },
  { tcode: '10255', ccode: '988', nome: 'Nacional 2025 — B (ccode=988)',           escalao: '?',     sex: '?' },
  { tcode: '10256', ccode: '988', nome: 'Nacional 2025 — C (ccode=988)',           escalao: '?',     sex: '?' },
];

const HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-PT,pt;q=0.9',
  'Referer':         'https://scoring.datagolf.pt/',
};

const cookie = process.env.DATAGOLF_SESSION || '';
if (cookie) HEADERS['Cookie'] = cookie;
else console.warn('[aviso] DATAGOLF_SESSION nao definido em .env.local — pode falhar com 500');

/* ── Parser de tabela de classificacoes ── */
function parseClassificationsTable(html, tcode) {
  const results = [];

  // Tentar detectar o titulo do torneio
  const titleMatch = html.match(/<h[12][^>]*>(.*?)<\/h[12]>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  // Padrão principal: tabela com linhas de jogadores
  // datagolf.pt usa geralmente <tr class="..."> com células <td>
  // Cada linha contém: pos, nome, clube, nfed, hcp, R1, R2, R3, total, toPar
  
  // Remover scripts e styles para simplificar
  const clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Encontrar todas as linhas de dados (tr com td)
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(clean)) !== null) {
    const row = rowMatch[1];
    const cells = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(row)) !== null) {
      // Limpar HTML das células
      const text = cellMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
      cells.push(text);
    }
    if (cells.length < 4) continue;

    // Tentar identificar se é uma linha de jogador
    // Geralmente: pos (número), nome, clube, nfed, hcp, scores...
    const posCell = cells[0];
    const isPos = /^\d+$/.test(posCell) || /^T?\d+$/.test(posCell);
    if (!isPos) continue;

    // Tentar extrair nfed (5-6 dígitos) de qualquer célula
    let nfed = null;
    for (const c of cells) {
      const m = c.match(/\b(\d{5,6})\b/);
      if (m) { nfed = m[1]; break; }
    }

    // Extrair scores — procurar padrões de números entre 60-130 (18H) ou 30-70 (9H)
    const scores = [];
    for (const c of cells) {
      const n = parseFloat(c);
      if (!isNaN(n) && n >= 50 && n <= 140) scores.push(n);
    }

    // Nome: célula que tem letras e não é clube conhecido — heurística simples
    const nome = cells.length > 1 ? cells[1] : '';
    const clube = cells.length > 2 ? cells[2] : '';
    const hcpCell = cells.find(c => /^-?\d+[.,]\d$/.test(c));
    const hcp = hcpCell ? parseFloat(hcpCell.replace(',', '.')) : null;

    const pos = parseInt(posCell.replace('T', ''));

    results.push({
      pos,
      nome,
      clube,
      nfed,
      hcp,
      scores,          // [R1, R2, R3, ...]
      total: scores.length > 0 ? scores.reduce((s, x) => s + x, 0) : null,
      rawCells: cells, // guardar raw para debug
    });
  }

  return { title, results, total: results.length };
}

/* ── Sleep ── */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ── Main ── */
async function main() {
  if (!existsSync(join(process.cwd(), 'data'))) {
    mkdirSync(join(process.cwd(), 'data'), { recursive: true });
  }
  if (RAW_FLAG && !existsSync(HTML_DIR)) {
    mkdirSync(HTML_DIR, { recursive: true });
  }

  const allResults = {};
  let successCount = 0;

  for (const t of TORNEIOS) {
    const url = `https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=${t.ccode}&tcode=${t.tcode}`;
    console.log(`\n[fetch] ${t.nome}`);
    console.log(`  URL: ${url}`);

    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      console.log(`  HTTP: ${res.status}`);

      if (!res.ok) {
        const body = await res.text();
        console.warn(`  ERRO: ${body.slice(0, 200)}`);
        allResults[t.tcode] = { ...t, error: `HTTP ${res.status}`, results: [] };
        continue;
      }

      const html = await res.text();

      if (RAW_FLAG) {
        const htmlPath = join(HTML_DIR, `class_${t.ccode}_${t.tcode}.html`);
        writeFileSync(htmlPath, html, 'utf8');
        console.log(`  HTML guardado: ${htmlPath}`);
      }

      const parsed = parseClassificationsTable(html, t.tcode);
      console.log(`  Titulo detectado: "${parsed.title}"`);
      console.log(`  Jogadores: ${parsed.total}`);

      if (parsed.total > 0) {
        console.log(`  Exemplo (1º): pos=${parsed.results[0].pos} nome="${parsed.results[0].nome}" nfed=${parsed.results[0].nfed} scores=${JSON.stringify(parsed.results[0].scores)}`);
      }

      allResults[t.tcode] = {
        tcode: t.tcode, ccode: t.ccode, nome: t.nome,
        escalao: t.escalao, sex: t.sex,
        title: parsed.title,
        totalJogadores: parsed.total,
        resultados: parsed.results.map(r => ({
          pos: r.pos, nome: r.nome, clube: r.clube, nfed: r.nfed, hcp: r.hcp,
          scores: r.scores, total: r.total,
        })),
        scrapedAt: new Date().toISOString(),
      };
      successCount++;
    } catch (err) {
      console.error(`  EXCEPCAO:`, err.message);
      allResults[t.tcode] = { ...t, error: err.message, results: [] };
    }

    await sleep(600);
  }

  writeFileSync(OUT_FILE, JSON.stringify(allResults, null, 2), 'utf8');
  console.log(`\n[ok] ${successCount}/${TORNEIOS.length} torneios guardados em ${OUT_FILE}`);
  console.log('[dica] Se o parser nao detectou jogadores, corre com --raw para inspeccionar o HTML');
}

main().catch(console.error);
