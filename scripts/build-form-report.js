#!/usr/bin/env node
/**
 * build-form-report.js — Gera public/reports/nacional-2026-forma.html
 *
 * Lê:
 *   public/data/fpg-admissions-draws.json   (inscritos por torneio)
 *   public/data/players.json                (escalão / hcp / sexo)
 *   output/{fed}/whs.json                   (rondas WHS por jogador, com sgd)
 *
 * Escreve:
 *   public/reports/nacional-2026-forma.html
 *
 * Uso:
 *   node scripts/build-form-report.js
 *
 * Re-gerar após cada scrape para refrescar os SDs.
 */

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const ADM = path.join(REPO, "public/data/fpg-admissions-draws.json");
const PLAYERS = path.join(REPO, "public/data/players.json");
const OUT = path.join(REPO, "public/reports/nacional-2026-forma.html");

const TC = ["10935","10936","10937","10938","10939","10940","10941","10942","10943","10944"];
const ESC_ORDER = ["Sub-10","Sub-12","Sub-14","Sub-16","Sub-18","Sub-21","Absoluto","Outros"];

const adm = JSON.parse(fs.readFileSync(ADM,"utf8"));
const players = JSON.parse(fs.readFileSync(PLAYERS,"utf8"));

const inscritos = new Map();
adm.tournaments.filter(t => TC.includes(String(t.tcode))).forEach(t => {
  ((t.admissions && t.admissions.players) || []).forEach(p => {
    const k = String(p.fed);
    if (!inscritos.has(k)) inscritos.set(k, { fed: k, escaloes: new Set() });
    inscritos.get(k).escaloes.add(t.name.replace("Campeonato Nacional de Jovens ","").trim());
  });
});

const fmtDate = (s) => (s||"").slice(0,10);
const num = (x) => (x==null || isNaN(x)) ? null : Number(x);

const rows = [];
for (const [fed, info] of inscritos) {
  const p = players[fed] || {};
  const wp = path.join(REPO, `output/${fed}/whs.json`);
  let last10 = [];
  let total = 0;
  if (fs.existsSync(wp)) {
    try {
      const w = JSON.parse(fs.readFileSync(wp,"utf8"));
      if (Array.isArray(w)) {
        total = w.length;
        const sorted = w.slice().filter(r => r && r.sgd != null).sort((a,b) => (b.hcp_dateStr||"").localeCompare(a.hcp_dateStr||""));
        last10 = sorted.slice(0, 10).map(r => ({
          sgd: num(r.sgd),
          date: fmtDate(r.hcp_dateStr),
          tourn: r.tourn_name || r.course_description || "",
          holes: r.holes,
          hcp: num(r.exact_handicap),
        }));
      }
    } catch {}
  }
  const sgds = last10.map(x => x.sgd).filter(x => x != null);
  const avg = sgds.length ? sgds.reduce((a,b)=>a+b,0)/sgds.length : null;
  const recent3 = sgds.slice(0,3);
  const older = sgds.slice(3);
  const avgRecent = recent3.length ? recent3.reduce((a,b)=>a+b,0)/recent3.length : null;
  const avgOlder = older.length ? older.reduce((a,b)=>a+b,0)/older.length : null;
  const delta = (avgRecent != null && avgOlder != null) ? (avgRecent - avgOlder) : null;
  rows.push({
    fed, name: p.name || "?", escalao: p.escalao || "Outros", sex: p.sex || "?",
    hcp: num(p.hcp), escIns: [...info.escaloes].sort().join(", "),
    totalRounds: total, last10, avg, delta,
  });
}

rows.sort((a,b) => {
  const ia = ESC_ORDER.indexOf(a.escalao); const ib = ESC_ORDER.indexOf(b.escalao);
  if (ia !== ib) return (ia<0?99:ia) - (ib<0?99:ib);
  if (a.sex !== b.sex) return a.sex.localeCompare(b.sex);
  return (a.hcp ?? 999) - (b.hcp ?? 999);
});

const fmtSd = (x) => x == null ? "" : x.toFixed(1);
const fmtH = (x) => x == null ? "—" : x.toFixed(1);
const fmtDelta = (d) => {
  if (d == null) return '<span class="dn">—</span>';
  if (Math.abs(d) < 0.5) return `<span class="dn">${d>=0?"+":""}${d.toFixed(1)}</span>`;
  if (d < 0) return `<span class="dg">↓ ${Math.abs(d).toFixed(1)}</span>`;
  return `<span class="dr">↑ ${d.toFixed(1)}</span>`;
};

function cellClass(sd, sgds) {
  if (sd == null) return "";
  if (sgds.length < 3) return "sd-mid";
  const sorted = [...sgds].sort((a,b)=>a-b);
  const median = sorted[Math.floor(sorted.length/2)];
  const range = (sorted[sorted.length-1] - sorted[0]) || 1;
  const z = (sd - median) / range;
  if (z < -0.25) return "sd-best";
  if (z < -0.05) return "sd-good";
  if (z >  0.25) return "sd-worst";
  if (z >  0.05) return "sd-bad";
  return "sd-mid";
}

const escCount = {};
for (const r of rows) escCount[r.escalao] = (escCount[r.escalao]||0)+1;

let lastEsc = "";
const trs = rows.map(r => {
  const sgds = r.last10.map(x => x.sgd);
  let header = "";
  if (r.escalao !== lastEsc) {
    lastEsc = r.escalao;
    header = `<tr class="hdr-esc"><td colspan="16">${r.escalao} <span class="cnt">(${escCount[r.escalao]})</span></td></tr>`;
  }
  const cells = [];
  for (let i=0;i<10;i++) {
    const x = r.last10[i];
    if (!x) { cells.push("<td></td>"); continue; }
    const cls = cellClass(x.sgd, sgds);
    const tip = `${x.date} — ${x.tourn} — ${x.holes||18}H — HCP ${fmtH(x.hcp)}`;
    cells.push(`<td class="${cls}" title="${tip.replace(/"/g,"&quot;")}">${fmtSd(x.sgd)}</td>`);
  }
  const sexBadge = r.sex === "F" ? '<span class="sx-f">F</span>' : '<span class="sx-m">M</span>';
  return `${header}<tr>
    <td class="nm"><a href="https://my.fpg.pt/Home/PlayerWHS.aspx?no=${r.fed}" target="_blank" rel="noopener">${r.name}</a></td>
    <td>${sexBadge}</td>
    <td class="num">${fmtH(r.hcp)}</td>
    <td class="esc-ins">${r.escIns}</td>
    ${cells.join("")}
    <td class="num bold">${r.avg==null?"—":r.avg.toFixed(1)}</td>
    <td>${fmtDelta(r.delta)}</td>
  </tr>`;
}).join("\n");

const html = `<!doctype html><html lang="pt"><head>
<meta charset="utf-8">
<title>Forma dos 146 inscritos — Nacional 2026 Aroeira</title>
<style>
:root {
  --bg: #fafaf9; --fg: #1a1a1a; --muted: #6b7280;
  --border: #e5e7eb; --hdr: #f3f4f6;
  --best: #15803d; --worst: #b91c1c;
  --male: #2563eb; --female: #db2777;
}
* { box-sizing: border-box; }
body { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--fg); margin: 0; padding: 20px; font-size: 12px; }
h1 { font-size: 18px; margin: 0 0 6px; }
.sub { color: var(--muted); font-size: 12px; margin-bottom: 12px; }
.legend { display: flex; gap: 12px; align-items: center; font-size: 11px; margin: 10px 0 16px; flex-wrap: wrap; }
.legend span { padding: 2px 8px; border-radius: 4px; }
table { border-collapse: collapse; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
th, td { padding: 4px 6px; border-bottom: 1px solid var(--border); text-align: center; white-space: nowrap; }
th { background: var(--hdr); font-weight: 600; position: sticky; top: 0; z-index: 5; }
th.sd-h { font-size: 10px; min-width: 36px; }
td.nm { text-align: left; font-weight: 500; min-width: 200px; }
td.nm a { color: var(--fg); text-decoration: none; }
td.nm a:hover { text-decoration: underline; color: #1d4ed8; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
td.bold { font-weight: 600; }
td.esc-ins { font-size: 10px; color: var(--muted); text-align: left; }
.hdr-esc td { background: #1f2937; color: white; font-size: 13px; font-weight: 600; padding: 8px 10px; text-align: left; }
.hdr-esc .cnt { color: #9ca3af; font-weight: 400; margin-left: 6px; }
.sd-best  { background: #15803d; color: white; font-weight: 700; }
.sd-good  { background: #86efac; }
.sd-mid   { background: #f5f5f5; }
.sd-bad   { background: #fca5a5; }
.sd-worst { background: #b91c1c; color: white; font-weight: 700; }
.sx-m { background: var(--male); color: white; padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: 600; }
.sx-f { background: var(--female); color: white; padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: 600; }
.dg { color: #15803d; font-weight: 600; }
.dr { color: #b91c1c; font-weight: 600; }
.dn { color: var(--muted); }
.kpi { display: inline-flex; gap: 14px; margin-bottom: 10px; flex-wrap: wrap; }
.kpi div { background: white; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); }
.kpi b { color: var(--best); font-size: 14px; }
.note { background: #fef3c7; border: 1px solid #fcd34d; padding: 8px 12px; border-radius: 6px; margin: 12px 0; font-size: 11px; color: #78350f; }
</style>
</head><body>
<h1>Forma dos 146 inscritos — Campeonato Nacional 2026 Aroeira</h1>
<div class="sub">Últimos 10 SD (Score Differential) por jogador, do mais recente (esquerda) ao mais antigo (direita). Valor mais baixo = melhor.</div>
<div class="kpi">
  <div>Total inscritos: <b>${rows.length}</b></div>
  <div>Com dados WHS: <b>${rows.filter(r=>r.last10.length>0).length}</b></div>
  <div>Sem dados: <b style="color:var(--worst)">${rows.filter(r=>r.last10.length===0).length}</b></div>
</div>
<div class="legend">
  Escala de cores (relativa ao próprio jogador):
  <span class="sd-best">Melhor</span>
  <span class="sd-good">Bom</span>
  <span class="sd-mid">Médio</span>
  <span class="sd-bad">Mau</span>
  <span class="sd-worst">Pior</span>
  <span style="background:none;padding-left:14px;">|</span>
  <span class="dg">↓ a melhorar</span>
  <span class="dr">↑ a piorar</span>
</div>
<div class="note">"Tendência" compara média dos últimos 3 SD com a média dos restantes 7. Negativo (verde) = SD a baixar = boa fase. Positivo (vermelho) = SD a subir = má fase.</div>
<table>
<thead><tr>
  <th>Jogador</th><th>Sx</th><th>HCP</th><th>Escalão Inscr.</th>
  ${[...Array(10)].map((_,i)=>`<th class="sd-h">SD ${i+1}</th>`).join("")}
  <th>Média 10</th><th>Tend.</th>
</tr></thead>
<tbody>
${trs}
</tbody>
</table>
<div class="sub" style="margin-top:14px">Gerado em ${new Date().toISOString().slice(0,16).replace("T"," ")} · Clica num nome para abrir o perfil WHS na FPG.</div>
</body></html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`✓ Report escrito: ${path.relative(REPO, OUT)}`);
console.log(`  Linhas: ${rows.length}   Com WHS: ${rows.filter(r=>r.last10.length>0).length}   Sem dados: ${rows.filter(r=>r.last10.length===0).length}`);
