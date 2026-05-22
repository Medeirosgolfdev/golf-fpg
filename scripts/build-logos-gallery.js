#!/usr/bin/env node
/**
 * build-logos-gallery.js
 *
 * Varre a pasta public/Logos e (re)gera o galeria.html com a lista de TODAS as
 * imagens visualizáveis no browser embutida directamente no ficheiro.
 *
 * Porquê embutir em vez de fetch a um manifesto: o galeria.html é aberto tanto
 * online (Vercel) como localmente (file://). Um fetch a um JSON falha em file://
 * por CORS — embutir funciona em ambos.
 *
 * Corre automaticamente antes de cada `npm run build` (script "prebuild" no
 * package.json) e também pode ser corrido à mão:
 *     node scripts/build-logos-gallery.js
 *
 * Tipos visualizáveis: png, jpg, jpeg, svg, avif, webp, gif.
 * Tipos NÃO visualizáveis (ai, eps, pdf, mp4, ...) são ignorados de propósito.
 */

const fs = require("fs");
const path = require("path");

const LOGOS_DIR = path.join(__dirname, "..", "public", "Logos");
const OUT_FILE = path.join(LOGOS_DIR, "galeria.html");
const VIEWABLE = new Set(["png", "jpg", "jpeg", "svg", "avif", "webp", "gif"]);

function human(n) {
  let v = Number(n);
  for (const u of ["B", "KB", "MB"]) {
    if (v < 1024) return u === "B" ? `${Math.round(v)} ${u}` : `${v.toFixed(1)} ${u}`;
    v /= 1024;
  }
  return `${v.toFixed(1)} GB`;
}

function walk(dir, base, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, base, out);
    } else if (entry.isFile()) {
      if (entry.name === "galeria.html") continue;
      const ext = entry.name.includes(".") ? entry.name.split(".").pop().toLowerCase() : "";
      if (!VIEWABLE.has(ext)) continue;
      const rel = path.relative(base, full).split(path.sep).join("/");
      const size = fs.statSync(full).size;
      out.push({ name: entry.name, path: rel, ext, sizeh: human(size) });
    }
  }
}

function collect() {
  const items = [];
  walk(LOGOS_DIR, LOGOS_DIR, items);
  items.sort((a, b) => {
    const da = (a.path.match(/\//g) || []).length;
    const db = (b.path.match(/\//g) || []).length;
    if (da !== db) return da - db;
    return a.path.toLowerCase().localeCompare(b.path.toLowerCase());
  });
  return items;
}

function pageHtml(data) {
  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Galeria · Logos</title>
<style>
  :root{--bg:#0f1115; --panel:#171a21; --panel2:#1e222b; --line:#2a2f3a; --text:#e7eaf0; --muted:#9aa3b2; --accent:#16a34a; --accent2:#22c55e; --card:#1a1e26;}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{background:var(--bg); color:var(--text); font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased;}
  header{position:sticky; top:0; z-index:20; background:rgba(15,17,21,.92); backdrop-filter:blur(8px); border-bottom:1px solid var(--line); padding:14px 20px;}
  .htop{display:flex; align-items:center; gap:14px; flex-wrap:wrap}
  h1{font-size:18px; margin:0; font-weight:700; letter-spacing:.2px}
  .count{color:var(--muted); font-size:13px}
  .grow{flex:1}
  input[type=search]{background:var(--panel2); border:1px solid var(--line); color:var(--text); border-radius:9px; padding:8px 12px; min-width:200px; font-size:14px; outline:none;}
  input[type=search]:focus{border-color:var(--accent)}
  .controls{display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:12px}
  .chip{background:var(--panel2); border:1px solid var(--line); color:var(--muted); border-radius:999px; padding:6px 13px; font-size:13px; cursor:pointer; user-select:none; transition:.15s;}
  .chip:hover{color:var(--text); border-color:#3a4150}
  .chip.on{background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600}
  .label{color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.5px; margin-right:2px}
  .btn{background:var(--accent); border:none; color:#fff; border-radius:9px; padding:8px 15px; font-size:14px; font-weight:600; cursor:pointer; transition:.15s;}
  .btn:hover{background:var(--accent2)}
  .sep{width:1px; height:22px; background:var(--line); margin:0 4px}
  main{padding:22px 20px 60px; max-width:1500px; margin:0 auto}
  .grid{display:grid; gap:16px; grid-template-columns:repeat(auto-fill,minmax(210px,1fr));}
  .card{background:var(--card); border:1px solid var(--line); border-radius:13px; overflow:hidden; display:flex; flex-direction:column;}
  .thumb{height:160px; display:flex; align-items:center; justify-content:center; cursor:zoom-in; position:relative; overflow:hidden;}
  .thumb img{max-width:88%; max-height:88%; width:auto; height:auto; object-fit:contain; display:block}
  body[data-bg="dark"]  .thumb{background:#0b0d11}
  body[data-bg="light"] .thumb{background:#ffffff}
  body[data-bg="check"] .thumb{background-color:#fff; background-image:linear-gradient(45deg,#d6d9de 25%,transparent 25%),linear-gradient(-45deg,#d6d9de 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d6d9de 75%),linear-gradient(-45deg,transparent 75%,#d6d9de 75%); background-size:18px 18px; background-position:0 0,0 9px,9px -9px,-9px 0;}
  .meta{padding:10px 12px; border-top:1px solid var(--line); display:flex; flex-direction:column; gap:8px}
  .name{font-size:13px; font-weight:600; word-break:break-word; line-height:1.3}
  .sub{display:flex; align-items:center; gap:8px; font-size:11px; color:var(--muted)}
  .tag{text-transform:uppercase; font-weight:700; letter-spacing:.5px; background:var(--panel2); border:1px solid var(--line); border-radius:6px; padding:2px 6px;}
  .tag.png{color:#60a5fa}.tag.jpg{color:#f59e0b}.tag.jpeg{color:#f59e0b}.tag.svg{color:#22c55e}.tag.avif{color:#c084fc}.tag.webp{color:#f472b6}.tag.gif{color:#f87171}
  .row{display:flex; gap:7px}
  .row a, .row button{flex:1; text-align:center; text-decoration:none; font-size:12.5px; font-weight:600; padding:7px 6px; border-radius:8px; cursor:pointer; border:1px solid var(--line); background:var(--panel2); color:var(--text); transition:.15s;}
  .row .dl{background:var(--accent); border-color:var(--accent); color:#fff}
  .row .dl:hover{background:var(--accent2)}
  .row .open:hover{border-color:#3a4150}
  .empty{color:var(--muted); text-align:center; padding:60px 20px}
  .lb{position:fixed; inset:0; background:rgba(0,0,0,.85); display:none; z-index:100; align-items:center; justify-content:center; padding:30px; cursor:zoom-out}
  .lb.on{display:flex}
  .lb .frame{max-width:92vw; max-height:86vh; display:flex; flex-direction:column; align-items:center; gap:14px}
  .lb .imgwrap{background-color:#fff; background-image:linear-gradient(45deg,#d6d9de 25%,transparent 25%),linear-gradient(-45deg,#d6d9de 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d6d9de 75%),linear-gradient(-45deg,transparent 75%,#d6d9de 75%); background-size:22px 22px; background-position:0 0,0 11px,11px -11px,-11px 0; border-radius:10px; padding:10px; display:flex; align-items:center; justify-content:center;}
  .lb img{max-width:88vw; max-height:74vh; object-fit:contain; display:block}
  .lb .cap{color:#fff; font-size:14px; text-align:center; cursor:auto}
  .lb .cap a{color:var(--accent2); font-weight:600}
  .toast{position:fixed; bottom:22px; left:50%; transform:translateX(-50%); background:var(--panel); border:1px solid var(--line); color:var(--text); padding:11px 18px; border-radius:10px; font-size:14px; z-index:200; display:none; box-shadow:0 8px 30px rgba(0,0,0,.4);}
</style>
</head>
<body data-bg="check">
<header>
  <div class="htop">
    <h1>Logos</h1>
    <span class="count" id="count"></span>
    <span class="grow"></span>
    <input type="search" id="q" placeholder="Pesquisar por nome…" autocomplete="off">
  </div>
  <div class="controls">
    <span class="label">Tipo</span>
    <span class="chip on" data-type="all">Todos</span>
    <span class="chip" data-type="png">PNG</span>
    <span class="chip" data-type="jpg">JPG</span>
    <span class="chip" data-type="jpeg">JPEG</span>
    <span class="chip" data-type="svg">SVG</span>
    <span class="chip" data-type="webp">WEBP</span>
    <span class="chip" data-type="avif">AVIF</span>
    <span class="sep"></span>
    <span class="label">Fundo</span>
    <span class="chip bgchip" data-bgv="check">Transparência</span>
    <span class="chip bgchip" data-bgv="dark">Escuro</span>
    <span class="chip bgchip" data-bgv="light">Claro</span>
    <span class="sep"></span>
    <button class="btn" id="dlall">⬇ Descarregar todas</button>
  </div>
</header>
<main>
  <div class="grid" id="grid"></div>
  <div class="empty" id="empty" style="display:none">Nenhuma imagem corresponde à pesquisa.</div>
</main>
<div class="lb" id="lb">
  <div class="frame" onclick="event.stopPropagation()">
    <div class="imgwrap"><img id="lbimg" alt=""></div>
    <div class="cap" id="lbcap"></div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
const IMAGES = __DATA__;
const grid=document.getElementById('grid'), empty=document.getElementById('empty'), countEl=document.getElementById('count'), q=document.getElementById('q');
let typeFilter='all';
function enc(p){ return p.split('/').map(encodeURIComponent).join('/'); }
function esc(s){ return s.replace(/"/g,'&quot;'); }
function render(){
  const term=q.value.trim().toLowerCase();
  const list=IMAGES.filter(im=>(typeFilter==='all'||im.ext===typeFilter)&&(!term||im.name.toLowerCase().includes(term)));
  countEl.textContent=list.length+' de '+IMAGES.length+' imagens';
  grid.innerHTML=''; empty.style.display=list.length?'none':'block';
  for(const im of list){
    const url=enc(im.path);
    const card=document.createElement('div'); card.className='card';
    card.innerHTML='<div class="thumb" data-url="'+url+'" data-name="'+esc(im.name)+'"><img loading="lazy" src="'+url+'" alt="'+esc(im.name)+'"></div>'+
      '<div class="meta"><div class="name">'+im.name+'</div>'+
      '<div class="sub"><span class="tag '+im.ext+'">'+im.ext+'</span><span>'+im.sizeh+'</span>'+(im.path.includes('/')?'<span>· '+im.path.split('/')[0]+'/</span>':'')+'</div>'+
      '<div class="row"><a class="dl" href="'+url+'" download="'+esc(im.name)+'">Descarregar</a><a class="open" href="'+url+'" target="_blank" rel="noopener">Abrir</a></div></div>';
    grid.appendChild(card);
  }
}
document.querySelectorAll('.chip[data-type]').forEach(c=>c.addEventListener('click',()=>{document.querySelectorAll('.chip[data-type]').forEach(x=>x.classList.remove('on')); c.classList.add('on'); typeFilter=c.dataset.type; render();}));
function setBg(v){document.body.dataset.bg=v; document.querySelectorAll('.bgchip').forEach(x=>x.classList.toggle('on', x.dataset.bgv===v));}
document.querySelectorAll('.bgchip').forEach(c=>c.addEventListener('click',()=>setBg(c.dataset.bgv)));
setBg('check');
q.addEventListener('input', render);
const lb=document.getElementById('lb'), lbimg=document.getElementById('lbimg'), lbcap=document.getElementById('lbcap');
grid.addEventListener('click', e=>{const t=e.target.closest('.thumb'); if(!t) return; lbimg.src=t.dataset.url; lbcap.innerHTML=t.dataset.name+' &nbsp;·&nbsp; <a href="'+t.dataset.url+'" download="'+t.dataset.name+'">descarregar</a>'; lb.classList.add('on');});
lb.addEventListener('click',()=>lb.classList.remove('on'));
document.addEventListener('keydown', e=>{ if(e.key==='Escape') lb.classList.remove('on'); });
const toast=document.getElementById('toast');
function showToast(m){toast.textContent=m; toast.style.display='block'; clearTimeout(toast._t); toast._t=setTimeout(()=>toast.style.display='none',2500);}
document.getElementById('dlall').addEventListener('click', async ()=>{
  const term=q.value.trim().toLowerCase();
  const list=IMAGES.filter(im=>(typeFilter==='all'||im.ext===typeFilter)&&(!term||im.name.toLowerCase().includes(term)));
  if(!list.length){ showToast('Nada para descarregar'); return; }
  showToast('A descarregar '+list.length+' ficheiros…');
  for(const im of list){ const a=document.createElement('a'); a.href=enc(im.path); a.download=im.name; document.body.appendChild(a); a.click(); a.remove(); await new Promise(r=>setTimeout(r,350)); }
});
render();
</script>
</body>
</html>
`.replace("__DATA__", JSON.stringify(data));
}

function main() {
  if (!fs.existsSync(LOGOS_DIR)) {
    console.error("[logos-gallery] pasta nao encontrada:", LOGOS_DIR);
    process.exit(0); // nao falhar o build se a pasta nao existir
  }
  const items = collect();
  fs.writeFileSync(OUT_FILE, pageHtml(items), "utf8");
  const byType = {};
  for (const it of items) byType[it.ext] = (byType[it.ext] || 0) + 1;
  console.log(`[logos-gallery] galeria.html gerado com ${items.length} imagens`, byType);
}

main();
