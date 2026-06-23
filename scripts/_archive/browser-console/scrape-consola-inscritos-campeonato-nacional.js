// ── Cola isto na consola do browser em qualquer página da FPG ──
// Vai buscar os 10 escalões e descarrega inscricoes_nacionais.json

(async () => {

const TORNEIOS = {
  '10935': { nome: 'Sub-18 H', escalao: 'Sub-18', sex: 'M' },
  '10936': { nome: 'Sub-18 S', escalao: 'Sub-18', sex: 'F' },
  '10937': { nome: 'Sub-16 H', escalao: 'Sub-16', sex: 'M' },
  '10938': { nome: 'Sub-16 S', escalao: 'Sub-16', sex: 'F' },
  '10939': { nome: 'Sub-14 H', escalao: 'Sub-14', sex: 'M' },
  '10940': { nome: 'Sub-14 S', escalao: 'Sub-14', sex: 'F' },
  '10941': { nome: 'Sub-12 H', escalao: 'Sub-12', sex: 'M' },
  '10942': { nome: 'Sub-12 S', escalao: 'Sub-12', sex: 'F' },
  '10943': { nome: 'Sub-10 H', escalao: 'Sub-10', sex: 'M' },
  '10944': { nome: 'Sub-10 S', escalao: 'Sub-10', sex: 'F' },
};

function strip(s) {
  return s.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&#\d+;/g,'').replace(/\s+/g,' ').trim();
}
function num(s) {
  if (!s || s==='-' || s==='–') return null;
  const n = parseFloat(s.replace(',','.'));
  return isNaN(n) ? null : n;
}
function parse(html, tcode) {
  const meta = TORNEIOS[tcode];
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'');
  const rows = [], trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi; let m;
  while ((m = trRe.exec(clean)) !== null) rows.push(m[1]);
  if (rows.length < 2) return { ...meta, tcode, totalInscritos:0, jogadores:[] };

  function cells(r) {
    const c=[], re=/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi; let x;
    while ((x=re.exec(r))!==null) c.push(strip(x[1])); return c;
  }
  const h = cells(rows[0]).map(c=>c.toLowerCase());
  const iN=h.findIndex(x=>/nome|jogador/.test(x));
  const iF=h.findIndex(x=>/fed|lic/.test(x));
  const iH=h.findIndex(x=>/hcp|handicap|ndice/.test(x));
  const iV=h.findIndex(x=>/vac/.test(x));
  const iC=h.findIndex(x=>/clube|assoc/.test(x));
  const iD=h.findIndex(x=>/data|insc/.test(x));

  const jogadores = [];
  for (let i=1; i<rows.length; i++) {
    const cs = cells(rows[i]); if (cs.length<2) continue;
    let fed = iF>=0 ? ((cs[iF].match(/\b(\d{4,6})\b/)||[])[1]||null) : null;
    let fi = iF;
    if (!fed) { for(let j=0;j<cs.length;j++){const x=cs[j].match(/\b(\d{4,6})\b/);if(x){fed=x[1];fi=j;break;}} }
    const nome  = iN>=0 ? cs[iN]||'' : cs.find(c=>c.length>4&&/[a-záéíóú]/i.test(c)&&!/^\d/.test(c))||'';
    const clube = iC>=0 ? cs[iC]||'' : '';
    let hcp=iH>=0?num(cs[iH]):null, vac=iV>=0?num(cs[iV]):null;
    if ((hcp===null||vac===null) && fi>=0) {
      for(let j=fi+1;j<cs.length;j++){
        const v=num(cs[j]); if(v===null) continue;
        if(hcp===null&&v>=-10&&v<=54){hcp=v;continue;}
        if(vac===null&&v>60){vac=v;break;}
      }
    }
    let data=iD>=0?cs[iD]||null:null;
    if(!data){const x=cs.find(c=>/\d{4}\/\d{2}\/\d{2}/.test(c));if(x)data=x;}
    if(!nome&&!fed) continue;
    jogadores.push({fed:fed||null,nome,clube,hcp,vac,dataInscricao:data});
  }
  const now = new Date().toISOString();
  return {...meta, tcode, totalInscritos:jogadores.length, jogadores,
    lastFetched:now, lastChanged:now,
    fpgUrl:`https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=000&tcode=${tcode}`};
}

const result = {};
for (const [tcode, meta] of Object.entries(TORNEIOS)) {
  console.log(`A carregar ${meta.nome}...`);
  try {
    const r = await fetch(
      `https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=000&tcode=${tcode}`,
      { credentials: 'include' }
    );
    if (!r.ok) { console.warn(`  ✗ HTTP ${r.status}`); continue; }
    const html = await r.text();
    const data = parse(html, tcode);
    result[tcode] = data;
    console.log(`  ✓ ${data.totalInscritos} inscritos`);
  } catch(e) { console.warn(`  ✗ ${e.message}`); }
  await new Promise(r=>setTimeout(r,300));
}

const total = Object.values(result).reduce((s,t)=>s+t.totalInscritos,0);
console.log(`\n✅ Total: ${total} inscritos em ${Object.keys(result).length} escalões`);

const blob = new Blob([JSON.stringify(result,null,2)],{type:'application/json'});
const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
a.download='inscricoes_nacionais.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
console.log('📥 Ficheiro descarregado: inscricoes_nacionais.json');
console.log('→ Copia para C:\\golf-fpg\\public\\data\\');

})();
