// generate-index.js — Gera index.html na pasta output/ com lista de todos os jogadores
// Este ficheiro é servido pelo Vercel como página principal do site.

const fs = require("fs");
const path = require("path");

const outputRoot = path.join(process.cwd(), "output");
const playersPath = path.join(process.cwd(), "players.json");

// Carregar players.json
let playersDb = {};
if (fs.existsSync(playersPath)) {
  try { playersDb = JSON.parse(fs.readFileSync(playersPath, "utf-8")); } catch {}
}

// Descobrir jogadores com dados
const players = [];
if (fs.existsSync(outputRoot)) {
  for (const d of fs.readdirSync(outputRoot)) {
    const full = path.join(outputRoot, d);
    if (!fs.statSync(full).isDirectory()) continue;
    const htmlPath = path.join(full, "analysis", "by-course-ui.html");
    const whsPath = path.join(full, "whs-list.json");
    if (!fs.existsSync(htmlPath)) continue;

    const fed = d;
    const pj = playersDb[fed] || {};
    let name = pj.name || "";
    let escalao = pj.escalao || "";
    let club = typeof pj.club === "object" ? (pj.club?.short || pj.club?.long || "") : (pj.club || "");
    let hcp = pj.hcp != null ? pj.hcp : null;

    // Fallback: tentar extrair nome do whs-list
    if (!name && fs.existsSync(whsPath)) {
      try {
        const whs = JSON.parse(fs.readFileSync(whsPath, "utf-8"));
        const rec = whs?.Records?.[0];
        if (rec) {
          name = rec.player_name || rec.PlayerName || "";
          if (!hcp && rec.hcp_index != null) hcp = rec.hcp_index;
        }
      } catch {}
    }

    if (!name) name = `Federado ${fed}`;

    players.push({ fed, name, escalao, club, hcp, htmlPath: `${fed}/analysis/by-course-ui.html` });
  }
}

players.sort((a, b) => a.name.localeCompare(b.name, "pt"));

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const now = new Date().toLocaleString("pt-PT", { dateStyle: "long", timeStyle: "short" });

const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Golf FPG — Scorecards</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #f8fafb;
    --card: #ffffff;
    --border: #e2e8f0;
    --text: #1e293b;
    --text-dim: #64748b;
    --green: #059669;
    --green-light: #ecfdf5;
    --green-dark: #047857;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
  }
  .header {
    background: linear-gradient(135deg, #047857, #059669, #0d9488);
    color: white;
    padding: 2rem 1.5rem;
    text-align: center;
  }
  .header h1 { font-size: 1.8rem; font-weight: 700; }
  .header p { opacity: 0.85; margin-top: 0.3rem; font-size: 0.95rem; }
  .container { max-width: 900px; margin: 0 auto; padding: 1.5rem; }
  .search-box {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 2px solid var(--border);
    border-radius: 10px;
    font-size: 1rem;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
    margin-bottom: 1rem;
  }
  .search-box:focus { border-color: var(--green); }
  .stats { text-align: center; color: var(--text-dim); font-size: 0.85rem; margin-bottom: 1rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.75rem; }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1rem;
    text-decoration: none;
    color: inherit;
    transition: all 0.2s;
    display: block;
  }
  .card:hover { border-color: var(--green); box-shadow: 0 2px 8px rgba(5,150,105,0.12); transform: translateY(-1px); }
  .card .name { font-weight: 600; font-size: 0.95rem; color: var(--text); }
  .card .meta { font-size: 0.8rem; color: var(--text-dim); margin-top: 0.3rem; }
  .card .hcp { display: inline-block; background: var(--green-light); color: var(--green-dark); padding: 0.1rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; margin-top: 0.4rem; }
  .footer { text-align: center; padding: 2rem; color: var(--text-dim); font-size: 0.8rem; }
  .empty { text-align: center; color: var(--text-dim); padding: 3rem; }
</style>
</head>
<body>
<div class="header">
  <h1>⛳ Golf FPG — Scorecards</h1>
  <p>${players.length} jogadores · Atualizado: ${esc(now)}</p>
</div>
<div class="container">
  <input type="text" class="search-box" placeholder="Pesquisar jogador, clube ou escalão..." id="search" autocomplete="off">
  <div class="stats" id="stats">${players.length} jogadores</div>
  <div class="grid" id="grid">
${players.map(p => `    <a class="card" href="${esc(p.htmlPath)}" data-search="${esc((p.name + ' ' + p.club + ' ' + p.escalao + ' ' + p.fed).toLowerCase())}">
      <div class="name">${esc(p.name)}</div>
      <div class="meta">${[p.club, p.escalao].filter(Boolean).map(esc).join(' · ') || 'N.º ' + esc(p.fed)}</div>
      ${p.hcp != null ? `<span class="hcp">HCP ${p.hcp}</span>` : ''}
    </a>`).join('\n')}
  </div>
  ${players.length === 0 ? '<div class="empty">Nenhum jogador encontrado. Corre o pipeline primeiro.</div>' : ''}
</div>
<div class="footer">Golf FPG Scorecards · Dados da Federação Portuguesa de Golfe</div>
<script>
const search = document.getElementById('search');
const cards = document.querySelectorAll('.card');
const stats = document.getElementById('stats');
search.addEventListener('input', () => {
  const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  let shown = 0;
  cards.forEach(c => {
    const s = c.dataset.search;
    const match = !words.length || words.every(w => s.includes(w));
    c.style.display = match ? '' : 'none';
    if (match) shown++;
  });
  stats.textContent = shown + ' jogador' + (shown !== 1 ? 'es' : '');
});
</script>
</body>
</html>`;

const outPath = path.join(outputRoot, "index.html");
fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(outPath, html, "utf-8");
console.log(`✓ Índice gerado: ${outPath} (${players.length} jogadores)`);
