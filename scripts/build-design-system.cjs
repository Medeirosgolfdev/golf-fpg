#!/usr/bin/env node
/**
 * scripts/build-design-system.cjs — gera src/design-system.html, a referência
 * visual das cores e das peças globais da app.
 *
 *   node scripts/build-design-system.cjs           # regrava a página
 *   node scripts/build-design-system.cjs --check   # só diz se está desactualizada
 *
 * A página carrega o tokens.css e o App.css REAIS (antes tinha uma cópia do CSS de
 * Abril/2026 que já não batia com a app). As secções de tokens saem do tokens.css,
 * pela ordem e com os títulos das secções de lá; as amostras das peças estão aqui
 * em baixo (PECAS) — quando uma peça global muda, actualizar a amostra aqui.
 * O teste scripts/design-system.test.js falha se a página não estiver em dia, se
 * mostrar uma classe que já não existe ou um token que já não existe.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TOKENS = path.join(ROOT, "src", "tokens.css");
const OUT = path.join(ROOT, "src", "design-system.html");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Lê o tokens.css: [{ titulo, tokens: [{ nome, valor, nota }] }] pela ordem do ficheiro. */
function lerTokens(txt) {
  const seccoes = [];
  let cur = null;
  for (const linha of txt.replace(/\r\n/g, "\n").split("\n")) {
    const h = linha.match(/^\s*\/\*\s*──\s*(.+?)\s*─/);
    if (h) { cur = { titulo: h[1].trim(), tokens: [] }; seccoes.push(cur); continue; }
    const t = linha.match(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);\s*(?:\/\*\s*(.*?)\s*\*\/)?/);
    if (t && cur) cur.tokens.push({ nome: t[1], valor: t[2].trim(), nota: t[3] || "" });
  }
  return seccoes.filter((s) => s.tokens.length);
}

function tipo(t) {
  const n = t.nome;
  if (/^--radius/.test(n)) return "raio";
  if (/^--shadow/.test(n)) return "sombra";
  if (/^--fs-/.test(n)) return "letra";
  if (/^--space-/.test(n)) return "espaco";
  if (/^--font/.test(n)) return "fonte";
  if (/^--(z|lh|fw)-/.test(n) || /^--z-/.test(n)) return "texto";
  if (/^(#|rgb|hsl|color-mix|transparent)/.test(t.valor) || /^var\(--/.test(t.valor)) return "cor";
  return "texto";
}

function tokenHtml(t) {
  const nota = t.nota ? `<div class="ds-tok-nota">${esc(t.nota)}</div>` : "";
  const cab = `<code class="ds-code">${esc(t.nome)}</code><div class="ds-tok-val">${esc(t.valor)}</div>${nota}`;
  switch (tipo(t)) {
    case "cor": return `<div class="ds-tok"><span class="ds-swatch" style="background:var(${t.nome})"></span><div>${cab}</div></div>`;
    case "raio": return `<div class="ds-tok"><span class="ds-swatch ds-swatch-raio" style="border-radius:var(${t.nome})"></span><div>${cab}</div></div>`;
    case "sombra": return `<div class="ds-tok"><span class="ds-swatch ds-swatch-sombra" style="box-shadow:var(${t.nome})"></span><div>${cab}</div></div>`;
    case "letra": return `<div class="ds-tok ds-tok-linha"><span class="ds-letra" style="font-size:var(${t.nome})">Aa 72</span><div>${cab}</div></div>`;
    case "espaco": return `<div class="ds-tok ds-tok-linha"><span class="ds-espaco" style="width:var(${t.nome})"></span><div>${cab}</div></div>`;
    case "fonte": return `<div class="ds-tok ds-tok-linha"><span class="ds-letra" style="font-family:var(${t.nome})">Manuel 72 · −2</span><div>${cab}</div></div>`;
    default: return `<div class="ds-tok ds-tok-linha"><div>${cab}</div></div>`;
  }
}

function seccaoTokens(s, i) {
  return `<div class="ds-section" id="t${i + 1}">
  <div class="ds-title">${esc(s.titulo)} <span>tokens.css · ${s.tokens.length}</span></div>
  <div class="ds-box"><div class="ds-tok-grid">
    ${s.tokens.map(tokenHtml).join("\n    ")}
  </div></div>
</div>`;
}

/* ── Amostras das peças globais (actualizar aqui quando uma peça muda) ── */
const uso = (pecas, ficheiro) => `<div class="ds-usage"><b>Peça:</b> ${pecas.map((p) => `<code>${esc(p)}</code>`).join(" ")}${ficheiro ? ` <span class="ds-file">${esc(ficheiro)}</span>` : ""}</div>`;

const PECAS = [
  {
    titulo: "Tipografia",
    html: `<div class="ds-box">
    <div class="h-lg">Título de secção — <code class="ds-code">.h-lg</code></div>
    <div class="h-md">Subtítulo — <code class="ds-code">.h-md</code></div>
    <div class="h-sm">Título pequeno — <code class="ds-code">.h-sm</code></div>
    <div class="h-xs">Rótulo em maiúsculas — <code class="ds-code">.h-xs</code></div>
    <div class="mono">72 · 3,4 · −2 (números) — <code class="ds-code">.mono</code></div>
    ${uso([".h-lg", ".h-md", ".h-sm", ".h-xs", ".mono"], "App.css")}
  </div>`,
  },
  {
    titulo: "Filtros e interruptores",
    html: `<div class="ds-grid-2">
    <div class="ds-box">
      <div class="ds-box-label">Filtro liga/desliga — ligado verde, desligado cinzento (regra de 31/10/2026)</div>
      <div class="ds-row">
        <button class="tourn-tab tourn-tab-sm active" aria-pressed="true">Ligado</button>
        <button class="tourn-tab tourn-tab-sm" aria-pressed="false">Desligado</button>
        <button class="tourn-tab tourn-tab-sm active">Com contagem <span class="pill-count fs-10 fw-700">12</span></button>
        <button class="tourn-tab tourn-tab-sm">Sem <span class="pill-count fs-10 fw-700">3</span></button>
      </div>
      ${uso(["FilterPills", "FilterPillRow", "ToggleChip", ".tourn-tab.tourn-tab-sm"], "ui/FilterPills.tsx")}
    </div>
    <div class="ds-box">
      <div class="ds-box-label">Escolha única — interruptor</div>
      <div class="ds-row">
        <div class="segmented-toggle" role="tablist"><button class="seg-btn active"><span class="seg-label">Cartões</span></button><button class="seg-btn"><span class="seg-label">Lista</span><span class="seg-count">8</span></button><button class="seg-btn"><span class="seg-label">Jogadores</span></button></div>
      </div>
      <div class="ds-row">
        <div class="segmented-toggle seg-sm" role="tablist"><button class="seg-btn active"><span class="seg-label">M</span></button><button class="seg-btn"><span class="seg-label">F</span></button></div>
        <span class="ds-code">.seg-sm</span>
      </div>
      ${uso(["TabRow"], "ui/TabRow.tsx")}
    </div>
  </div>`,
  },
  {
    titulo: "Botões e paginação",
    html: `<div class="ds-grid-2">
    <div class="ds-box">
      <div class="ds-box-label">Acções (nunca uma pill de filtro)</div>
      <div class="ds-row">
        <button class="btn">Limpar filtros</button>
        <button class="btn" disabled>Desactivado</button>
        <button class="btn-link">▸ 12 voltas</button>
        <button class="btn-round">‹</button><button class="btn-round">›</button>
        <button class="btn-round btn-round-sm">›</button>
        <button class="btn-add">＋ Adicionar ronda</button>
      </div>
      ${uso([".btn", ".btn-link", ".btn-round", ".btn-round-sm", ".btn-add"], "App.css")}
    </div>
    <div class="ds-box">
      <div class="ds-box-label">Paginação das listas longas</div>
      <div class="pager"><button class="btn" disabled>«</button><button class="btn" disabled>‹</button><span class="pager-info">Página <b>1</b> de 8</span><button class="btn">›</button><button class="btn">»</button></div>
      ${uso(["Pager"], "ui/Pager.tsx")}
    </div>
  </div>`,
  },
  {
    titulo: "Pills e etiquetas",
    html: `<div class="ds-grid-2">
    <div class="ds-box">
      <div class="ds-box-label">Escalão · tipo de torneio · tee · sexo</div>
      <div class="ds-row">
        <span class="p p-sm p-sub10">Sub-10</span><span class="p p-sm p-sub12">Sub-12</span><span class="p p-sm p-sub14">Sub-14</span><span class="p p-sm p-sub16">Sub-16</span><span class="p p-sm p-sub18">Sub-18</span>
      </div>
      <div class="ds-row">
        <span class="p p-tourn p-regional">REGIONAL</span><span class="p p-tourn p-nacional">NACIONAL</span><span class="p p-tourn p-intl">INTL</span><span class="p p-tourn p-pja">PJA</span>
      </div>
      <div class="ds-row">
        <span class="p p-tee" style="background:#f0d000;color:#333">Amarelas</span><span class="p p-tee" style="background:#e0e0e0;color:#333">Brancas</span>
        <span class="sex-badge sex-M">M</span><span class="sex-badge sex-F">F</span>
      </div>
      ${uso(["EscPill", "TeePill", "SexBadge", "PillBadge"], "ui/PillBadge.tsx")}
    </div>
    <div class="ds-box">
      <div class="ds-box-label">Pódio · nível · origem · fonte</div>
      <div class="ds-row">
        <span class="pos-medal pos-medal-1">🏆 #1</span><span class="pos-medal pos-medal-2">🏆 #2</span><span class="pos-medal pos-medal-3">🏆 #3</span><span class="pos-medal pos-medal-n">7º</span><span class="pos-medal pos-medal-sm pos-medal-1">🏆 #1</span>
      </div>
      <div class="ds-row">
        <span class="tier-pill" style="background:var(--bg-warn-subtle);color:var(--color-warn-dark);border-color:var(--color-warn-dark)">★ Elite</span>
        <span class="scoring-tag scratch">SCRATCH</span><span class="scoring-tag hcp">HCP</span>
        <span class="src-link-tag" style="color:var(--color-info-dark);border-color:var(--color-info-dark)">USKids ↗</span>
        <span class="trend-pill" style="background:var(--bg-success-subtle);color:var(--color-good-dark);border-color:var(--color-good-dark)">▲ a subir</span>
      </div>
      <div class="ds-row">
        <span class="cor-dot" style="background:var(--chart-2)"></span><span class="cor-dot cor-dot-9" style="background:var(--chart-3)"></span><span class="cor-dot cor-dot-10" style="background:var(--chart-1)"></span>
        <span class="legend-dot" style="background:var(--chart-5)"></span>
        <span class="p p-sd-excellent">2,1 SD</span><span class="p p-sd-good">4,8 SD</span><span class="p p-sd-poor">9,2 SD</span>
        <span class="badge-evo-up">▲</span><span class="badge-evo-eq">=</span><span class="badge-evo-new">NOVO</span><span class="badge-wd">WD</span>
      </div>
      ${uso(["PosBadge / medalClass()", ".tier-pill", ".scoring-tag", ".src-link-tag", ".trend-pill", ".cor-dot", ".legend-dot"], "App.css")}
    </div>
  </div>`,
  },
  {
    titulo: "Números",
    html: `<div class="ds-box">
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-lbl">Índice</div><div class="kpi-val">6,4</div><div class="kpi-sub">−3,2 em 12m</div></div>
      <div class="kpi"><div class="kpi-lbl">Voltas</div><div class="kpi-val">187</div><div class="kpi-sub">34 campos</div></div>
      <div class="kpi" style="border-left:4px solid var(--color-good)"><div class="kpi-lbl">Melhor SD</div><div class="kpi-val" style="color:var(--color-good)">4,2</div><div class="kpi-delta" style="color:var(--color-good)">−1,1 vs média</div></div>
    </div>
    ${uso(["KpiCard", ".kpi-row"], "ui/KpiCard.tsx")}
  </div>`,
  },
  {
    titulo: "Tabelas",
    html: `<div class="ds-grid-2">
    <div class="ds-box">
      <div class="ds-box-label">Lista — modelo único das tabelas</div>
      <table class="dtable u-w-100pc">
        <thead><tr><th>Jogador</th><th>Clube</th><th class="r">HCP</th></tr></thead>
        <tbody>
          <tr class="row-manuel"><td>Manuel Medeiros</td><td>Santo da Serra</td><td class="r">6,4</td></tr>
          <tr class="row-portuguese"><td>Jogador português</td><td>Oporto</td><td class="r">5,1</td></tr>
          <tr><td>Outro jogador</td><td>Real Madrid</td><td class="r">3,9</td></tr>
        </tbody>
      </table>
      ${uso([".dtable", ".row-manuel", ".row-portuguese", "SortableHdr", "RankingTable"], "App.css «MODELO ÚNICO DAS TABELAS»")}
    </div>
    <div class="ds-box">
      <div class="ds-box-label">Cartão de buracos — eagle âmbar, birdie vermelho, par branco, bogey azul</div>
      <div class="ds-row">
        <span class="sc-score eagle">3</span><span class="sc-score birdie">3</span><span class="sc-score par">4</span><span class="sc-score bogey">5</span><span class="sc-score double">6</span>
      </div>
      ${uso(["ScorecardTable", "ScorecardLeaderboard", "scClass()"], "ui/ScorecardTable.tsx")}
      <div class="ds-box-label">Matriz / grelha</div>
      <table class="mx-table"><tbody><tr><td class="mp-sc">1</td><td class="mp-sc">2</td><td class="mp-sc mp-nine">10</td></tr></tbody></table>
      ${uso([".mx-table"], "App.css")}
    </div>
  </div>`,
  },
  {
    titulo: "Cartões e avisos",
    html: `<div class="ds-grid-2">
    <div class="ds-box">
      <div class="ds-row">
        <div class="fed-card"><div class="fed-card-label">USKIDS <span class="fed-card-flag">🇺🇸</span></div><div class="fed-card-value">#549578</div></div>
        <div class="fed-card empty"><div class="fed-card-label">FPG</div><div class="fed-card-value">sem registo</div></div>
      </div>
      <div class="tee-card"><div class="tee-card-hdr" style="background:color-mix(in srgb, #f0d000 13%, var(--bg-card))">Amarelas · 5200 m</div><div class="u-p-8px-12px">Cartão por tee (risca e banda na cor do tee)</div></div>
      ${uso([".fed-card", ".tee-card", ".tee-card-hdr"], "App.css")}
    </div>
    <div class="ds-box">
      <div class="notice notice-info">Aviso informativo — <code class="ds-code">.notice-info</code></div>
      <div class="notice notice-warn">Atenção — <code class="ds-code">.notice-warn</code></div>
      <div class="notice-error">Erro — <code class="ds-code">.notice-error</code></div>
      ${uso([".notice", ".notice-info", ".notice-warn", ".notice-error"], "App.css")}
    </div>
  </div>`,
  },
  {
    titulo: "Regras",
    html: `<div class="ds-box ds-regras">
    <ul>
      <li><b>Cores:</b> só via <code class="ds-code">src/tokens.css</code>; o <code class="ds-code">src/utils/colors.ts</code> espelha-as para o JavaScript (gráficos, contas de contraste). Excepções de propósito: imagens de partilha (overlays), cores dos tees da FPG e o relatório exportado pelo simulador.</li>
      <li><b>Espaçamento, letra e cantos:</b> sempre os tokens <code class="ds-code">--space-*</code>, <code class="ds-code">--fs-*</code>, <code class="ds-code">--radius-*</code>. Em px só ficam os redondos, os negativos e o bloco de impressão.</li>
      <li><b>Valores fixos soltos nas páginas:</b> utilitários <code class="ds-code">.u-*</code> (fim do App.css). <code class="ds-code">style={{…}}</code> só para o que vem dos dados (cor do resultado, da equipa, do tee; larguras de barras).</li>
      <li><b>Trava:</b> <code class="ds-code">scripts/estilo-global.test.js</code> falha se um ficheiro ganhar estilos à mão, cores hex, letra/cantos em número ou uma tabela sem classe global; <code class="ds-code">node scripts/estilo-global-baseline.js</code> aperta-a depois de arrumar.</li>
      <li><b>Esta página:</b> gerada por <code class="ds-code">node scripts/build-design-system.cjs</code> — não editar à mão.</li>
    </ul>
  </div>`,
  },
];

const DS_CSS = `
  body { background: var(--bg); font-family: var(--font-sans, 'DM Sans', sans-serif); color: var(--text); margin: 0; }
  .ds { max-width: 1200px; margin: 0 auto; padding: 0 var(--space-24) var(--space-40); }
  .ds-hero { padding: var(--space-40) 0 var(--space-32); border-bottom: 3px solid var(--accent); margin-bottom: var(--space-24); }
  .ds-hero h1 { font-size: var(--fs-32); font-weight: 900; margin: 0 0 var(--space-4); letter-spacing: -0.03em; }
  .ds-hero p { font-size: var(--fs-14); color: var(--text-3); margin: 0; }
  .ds-indice { display: flex; flex-wrap: wrap; gap: var(--space-6); margin-bottom: var(--space-32); }
  .ds-indice a { font-size: var(--fs-12); color: var(--accent); text-decoration: none; }
  .ds-parte { font-size: var(--fs-24); font-weight: 900; margin: var(--space-40) 0 var(--space-16); color: var(--accent); }
  .ds-section { margin-bottom: var(--space-32); }
  .ds-title { font-size: var(--fs-18); font-weight: 900; margin-bottom: var(--space-12); padding-bottom: var(--space-8); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: var(--space-10); }
  .ds-title span { font-size: var(--fs-12); font-weight: 600; color: var(--text-3); background: var(--bg-muted); padding: var(--space-2) var(--space-8); border-radius: var(--radius-sm); }
  .ds-box { border: 1px solid var(--border-light); border-radius: var(--radius-lg); padding: var(--space-14); background: var(--bg-card); display: flex; flex-direction: column; gap: var(--space-8); }
  .ds-box-label { font-size: var(--fs-10); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); }
  .ds-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-16); }
  @media (max-width: 768px) { .ds-grid-2 { grid-template-columns: 1fr; } }
  .ds-row { display: flex; flex-wrap: wrap; gap: var(--space-8); align-items: center; }
  .ds-code { font-family: var(--font-mono); font-size: var(--fs-10); color: var(--text-2); background: var(--bg-muted); padding: 1px var(--space-4); border-radius: var(--radius-sm); }
  .ds-tok-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: var(--space-10) var(--space-16); }
  .ds-tok { display: flex; gap: var(--space-8); align-items: flex-start; min-width: 0; }
  .ds-tok-linha { align-items: center; }
  .ds-tok-val { font-family: var(--font-mono); font-size: var(--fs-10); color: var(--text-3); word-break: break-all; }
  .ds-tok-nota { font-size: var(--fs-10); color: var(--text-muted); }
  .ds-swatch { flex-shrink: 0; width: 36px; height: 36px; border-radius: var(--radius); border: 1px solid var(--border-light); }
  .ds-swatch-raio { background: var(--accent-light); border-color: var(--accent); }
  .ds-swatch-sombra { background: var(--bg-card); border: none; }
  .ds-letra { flex-shrink: 0; min-width: 90px; font-weight: 700; }
  .ds-espaco { flex-shrink: 0; height: 12px; background: var(--accent); border-radius: var(--radius-xs); }
  .ds-usage { padding: var(--space-4) var(--space-8); background: var(--bg-header); border-radius: var(--radius-sm); font-size: var(--fs-10); color: var(--text-3); display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: center; }
  .ds-usage b { color: var(--text-2); }
  .ds-usage code { font-family: var(--font-mono); background: var(--bg-muted); padding: 1px var(--space-4); border-radius: var(--radius-sm); color: var(--text-2); }
  .ds-file { font-family: var(--font-mono); background: var(--accent-light); color: var(--accent-hover); padding: 1px var(--space-6); border-radius: var(--radius-sm); font-weight: 600; }
  .ds-regras ul { margin: 0; padding-left: var(--space-18); display: flex; flex-direction: column; gap: var(--space-6); font-size: var(--fs-13); }
`;

function gerar() {
  const seccoes = lerTokens(fs.readFileSync(TOKENS, "utf8"));
  const nTokens = seccoes.reduce((s, x) => s + x.tokens.length, 0);
  const indice = [
    ...seccoes.map((s, i) => `<a href="#t${i + 1}">${esc(s.titulo)}</a>`),
    ...PECAS.map((p, i) => `<a href="#p${i + 1}">${esc(p.titulo)}</a>`),
  ].join(" · ");
  return `<!DOCTYPE html>
<!-- GERADO por scripts/build-design-system.cjs — não editar à mão. -->
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Golf Portugal — Design System</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="./tokens.css">
<link rel="stylesheet" href="./App.css">
<style>${DS_CSS}</style>
</head>
<body>
<div class="ds">

<div class="ds-hero">
  <h1>⛳ Golf Portugal — Design System</h1>
  <p>Cores e peças globais da app, com o CSS real (tokens.css + App.css) · ${nTokens} tokens em ${seccoes.length} secções</p>
</div>
<div class="ds-indice">${indice}</div>

<div class="ds-parte">Tokens</div>
${seccoes.map(seccaoTokens).join("\n\n")}

<div class="ds-parte">Peças globais</div>
${PECAS.map((p, i) => `<div class="ds-section" id="p${i + 1}">
  <div class="ds-title">${esc(p.titulo)}</div>
  ${p.html}
</div>`).join("\n\n")}

</div>
</body>
</html>
`;
}

module.exports = { gerar, lerTokens, OUT };

if (require.main === module) {
  const html = gerar();
  const atual = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
  if (process.argv.includes("--check")) {
    if (atual !== html) { console.error("design-system.html desactualizado — correr: node scripts/build-design-system.cjs"); process.exit(1); }
    console.log("design-system.html em dia"); process.exit(0);
  }
  if (atual === html) { console.log("design-system.html já estava em dia"); process.exit(2); }
  fs.writeFileSync(OUT, html);
  console.log("design-system.html regravado");
}
