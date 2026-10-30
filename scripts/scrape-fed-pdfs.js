#!/usr/bin/env node
/**
 * scripts/scrape-fed-pdfs.js — provas juvenis das federações que só publicam
 * a classificação em PDF: Navarra (FNG), Castela-La Mancha (FGCLM) e Rioja
 * (FRG). 30/10/2026.
 *
 *   FNG   fnavarragolf.com/campeonatos/clasificaciones/ — uma página com todas
 *         as provas (título + PDFs por categoria). Ficam os Zonais da Zona 9, os
 *         Campeonatos Sub-NN e os Juegos Deportivos de Navarra a 18 buracos;
 *         fora as Ligas Junior/Infantil (9 e 4 buracos), P&P, dobles, equipas.
 *   FGCLM fedgolfclm.com — notícias da categoria «Juvenil» (API do WordPress);
 *         os PDFs de resultados acabam em «-01-2026.pdf» (os horários, inscritos
 *         e rankings ficam de fora). Puntuables do Ranking Juvenil, Zonais
 *         Madrid–CLM, Liga Zonal Sub-14.
 *   FRG   frgolf.es — notícias dos Puntuables Zonais (o resto do calendário
 *         juvenil riojano é match play ou de clubes). O PDF da Rioja Alta não
 *         tem licença: os jogadores ficam só pelo nome.
 *
 * A leitura dos PDFs é a mesma do País Basco (scripts/lib/pdf-classificacoes.js).
 * Grava `public/data/{fng|fgclm|frg}/{chave}.json` no formato do microsite
 * antigo da RFEG (como a FGCV e a FVG). A mesma prova no NextCaddy/golfdirecto
 * ou no PDF de outra federação (o Zonal da Zona 9 está nas duas) sai no índice
 * e nos rivais (scripts/lib/golfdirecto-twins.js).
 *
 * USO: node scripts/scrape-fed-pdfs.js [--fed fng,fgclm,frg] [--desde 2025] [--force]
 * Exit: 0 gravou · 2 nada de novo · 1 erro.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonGuarded } = require("./lib/shrink-guard");
const { itensPdf, lerClassificacoes, juntarClassificacoes } = require("./lib/pdf-classificacoes");

const DATA = path.resolve(__dirname, "../public/data");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PAUSA_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(url, binario = false) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return binario ? Buffer.from(await r.arrayBuffer()) : r.text();
}

const ENT = { amp: "&", quot: '"', nbsp: " ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", Ntilde: "Ñ" };
const texto = (s) => String(s || "").replace(/<[^>]+>/g, " ")
  .replace(/&(#\d+|[a-z]+);/gi, (m, e) => (e[0] === "#" ? String.fromCharCode(+e.slice(1)) : ENT[e] ?? m))
  .replace(/\s+/g, " ").trim();
const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
const anoDoPdf = (u) => { const m = /\/uploads\/(\d{4})\//.exec(u); return m ? +m[1] : null; };

// ── Navarra ───────────────────────────────────────────────────────────
const FNG_PAGINA = "https://fnavarragolf.com/campeonatos/clasificaciones/";
const FNG_JUVENIL = /zonal|sub\s*-?\s*(1\d|21)\b|juvenil|infantil|alev[ií]n|cadete|juegos deportivos|jj\.?\s*dd|\bjdn\b/i;
// Ligas (Junior/Infantil a 9 e 4 buracos; a de Verão são várias jornadas num só título) fora.
const FNG_FORA = /\bliga\b|pitch|p\s*&\s*p|dobles|equipos|interclub/i;
// PDFs que não são classificações individuais a 18 buracos. «Ranking-…» é a
// tabela do ranking (os PDFs das provas do Ranking Juvenil da FGCLM ficam).
const PDF_FORA = /9[-_ ]?h(oyos)?(?![a-z])|4[-_ ]?hoyos|cortos|equipos|match|cuadro|horario|inscrit|reglament|circular|\bcir\d|^ranking/i;

/** Títulos da página e os PDFs que se lhes seguem. */
function lerFng(html) {
  const out = [];
  let ultimo = "", atual = null;
  const re = /<(h[1-6]|strong|summary|button)[^>]*>([\s\S]{1,200}?)<\/\1>|href="([^"]+\.pdf)"/gi;
  for (const m of html.matchAll(re)) {
    if (m[3]) {
      if (ultimo) { atual = { name: ultimo, pdfs: [] }; out.push(atual); ultimo = ""; }
      if (atual && !atual.pdfs.includes(m[3])) atual.pdfs.push(m[3]);
    } else {
      const t = texto(m[2]);
      if (t.length > 3) ultimo = t;
    }
  }
  return out;
}
async function descobrirFng(desde) {
  const provas = lerFng(await pedir(FNG_PAGINA));
  if (!provas.length) throw new Error("página de classificações da FNG sem provas — o site mudou?");
  return provas
    .filter((p) => FNG_JUVENIL.test(p.name) && !FNG_FORA.test(p.name) && (anoDoPdf(p.pdfs[0]) || 0) >= desde)
    .map((p) => ({ chave: `${anoDoPdf(p.pdfs[0])}-${slug(p.name)}`, name: p.name, url: FNG_PAGINA, pdfs: p.pdfs.filter((u) => !PDF_FORA.test(decodeURIComponent(u.split("/").pop()))) }))
    .filter((p) => p.pdfs.length);
}

// ── WordPress (Castela-La Mancha, Rioja) ──────────────────────────────
async function postsWp(base, query, desde) {
  const out = [];
  for (let pag = 1; pag < 30; pag++) {
    const r = await fetch(`${base}/wp-json/wp/v2/posts?${query}&after=${desde}-01-01T00:00:00&per_page=100&page=${pag}&_fields=id,date,link,title,content`, { headers: { "User-Agent": UA } });
    if (r.status === 400) break;   // passou da última página
    if (!r.ok) throw new Error(`HTTP ${r.status} ${base} posts`);
    const a = await r.json();
    out.push(...a);
    if (a.length < 100) break;
    await sleep(PAUSA_MS);
  }
  return out;
}
/** PDFs de uma notícia: em `href` ou nos shortcodes do construtor de páginas
 *  (frgolf.es: `url:https%3A%2F%2F…pdf`). */
const pdfsDoPost = (p) => {
  const c = p.content.rendered.replace(/%3A/gi, ":").replace(/%2F/gi, "/");
  return [...new Set([...c.matchAll(/https?:\/\/[^\s"'<>»«\]|,]+?\.pdf/gi)].map((m) => m[0]))];
};

const CLM = "https://fedgolfclm.com";
const CLM_RESULTADO = /-0\d-20\d\d(-\d)?\.pdf$/i;
/** Nome da prova a partir do título da notícia (há títulos de crónica). */
function nomeClm(titulo) {
  const t = texto(titulo).replace(/^(RESULTADOS|HORARIOS DE SALIDA)\s*[–-]\s*/i, "");
  // Numeração romana em maiúsculas e palavra inteira («el II Puntuable» → «II Puntuable»).
  const m = /(?<![A-Za-z])((?:[IVXL]+|Final)\s[^,]*?(?:Puntuable|PUNTUABLE|Zonal|ZONAL|Liga|LIGA)[^,]*?(?:Castilla[\s-]+[Ll]a Mancha|CASTILLA LA MANCHA|CLM)(?:\s*[–-]\s*Madrid)?(?:\s+20\d\d)?)/.exec(t);
  return m ? m[1].trim() : (/^RESULTADOS/i.test(texto(titulo)) ? t : null);
}
async function descobrirClm(desde) {
  const posts = await postsWp(CLM, "categories=198", desde);   // 198 = «Juvenil»
  if (!posts.length) throw new Error("FGCLM sem notícias juvenis — a API mudou?");
  const vistos = new Set();
  const out = [];
  for (const p of posts.sort((a, b) => a.date.localeCompare(b.date))) {
    const pdfs = pdfsDoPost(p).filter((u) => CLM_RESULTADO.test(u) && !PDF_FORA.test(decodeURIComponent(u.split("/").pop())) && !vistos.has(u));
    if (!pdfs.length) continue;
    for (const u of pdfs) vistos.add(u);
    out.push({ chave: `p${p.id}`, name: nomeClm(p.title.rendered), url: p.link, pdfs });
  }
  return out;
}

const FRG = "https://frgolf.es";
async function descobrirFrg(desde) {
  const posts = await postsWp(FRG, "search=zonal", desde);
  // Uma notícia repete às vezes os PDFs da prova anterior (a do II Zonal 2026
  // traz os do I): cada PDF fica na primeira notícia que o publicou.
  const vistos = new Set();
  const out = [];
  for (const p of posts.sort((a, b) => a.date.localeCompare(b.date))) {
    if (!/puntuable zonal/i.test(texto(p.title.rendered))) continue;
    const pdfs = pdfsDoPost(p).filter((u) => !PDF_FORA.test(decodeURIComponent(u.split("/").pop())) && !vistos.has(u));
    for (const u of pdfs) vistos.add(u);
    if (pdfs.length) out.push({ chave: `p${p.id}`, name: texto(p.title.rendered), url: p.link, pdfs });
  }
  return out;
}

const FEDS = {
  fng: { nome: "Federación Navarra de Golf", descobrir: descobrirFng },
  fgclm: { nome: "Federación de Golf de Castilla-La Mancha", descobrir: descobrirClm },
  frg: { nome: "Federación Riojana de Golf", descobrir: descobrirFrg },
};

const isoParaDmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : null);

/** Datas de uma notícia/título → grupos de dias seguidos (uma prova de 2 dias
 *  fica junta; duas jornadas em semanas diferentes separam-se). */
function gruposDeDatas(datas) {
  const g = [];
  for (const d of [...new Set(datas)].sort()) {
    const u = g[g.length - 1];
    if (u && (Date.parse(d) - Date.parse(u[u.length - 1])) <= 2 * 86400000) u.push(d);
    else g.push([d]);
  }
  return g;
}

/** Os PDFs de uma prova → um ficheiro por grupo de datas (quase sempre um). */
async function lerProva(fed, p) {
  const todos = [];
  const avisos = [];
  for (const url of p.pdfs) {
    try {
      for (const b of lerClassificacoes(await itensPdf(await pedir(url, true)))) todos.push({ ...b, pdfUrl: url });
      await sleep(PAUSA_MS);
    } catch (e) { avisos.push(`${decodeURIComponent(url.split("/").pop())}: ${e.message}`); }
  }
  const grupos = gruposDeDatas(todos.map((b) => b.fecha).filter(Boolean));
  const saidas = (grupos.length > 1 ? grupos : [null]).map((g) => {
    const blocos = g ? todos.filter((b) => (b.fecha ? g.includes(b.fecha) : g === grupos[0])) : todos;
    const { results, admitidos, usados } = juntarClassificacoes(blocos, p.pdfs);
    const datas = usados.map((b) => b.fecha).filter(Boolean).sort();
    const campo = usados.map((b) => b.campo).find(Boolean) || null;
    // Sem nome na notícia (crónicas da FGCLM): o nome da prova escrito no PDF.
    const name = (g ? usados.map((b) => b.evento).find(Boolean) : null) || p.name || usados.map((b) => b.evento).find(Boolean) || p.chave;
    const chave = g ? `${p.chave}-${g[0].replace(/-/g, "")}` : p.chave;
    const counts = { admitidos: admitidos.length, reservas: 0, bajas: 0, invitados: 0, noAdmitidos: 0, provisional: 0 };
    return {
      chave,
      out: {
        compId: chave, ok: true, scrapedAt: new Date().toISOString(), source: fed, url: p.url, pdfs: p.pdfs,
        meta: {
          name, dateStart: isoParaDmy(datas[0]), dateEnd: isoParaDmy(datas[datas.length - 1]), course: campo,
          mode: "Individual", style: null, category: null, sex: null,
          federation: FEDS[fed].nome, codigo: null,
        },
        inscritos: { admitidos, reservas: [], bajas: [], invitados: [], noAdmitidos: [], provisional: [], counts },
        palmares: [], leaderboard: [], results,
      },
    };
  });
  return { saidas, avisos };
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const force = args.includes("--force");
  const anoAtual = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric" }).format(new Date()));
  const desde = Number(getArg("--desde") || anoAtual - 1);
  const feds = (getArg("--fed") || Object.keys(FEDS).join(",")).split(",");
  const nJog = (d) => (d.results || []).reduce((a, r) => a + r.players.length, 0);

  let gravados = 0, iguais = 0, falhas = 0, saltados = 0;
  for (const fed of feds) {
    if (!FEDS[fed]) { console.error(`::error::federação desconhecida: ${fed}`); process.exitCode = 1; return; }
    const dir = path.join(DATA, fed);
    fs.mkdirSync(dir, { recursive: true });
    let provas;
    try { provas = await FEDS[fed].descobrir(desde); }
    catch (e) { console.error(`::warning::${fed}: ${e.message}`); falhas++; continue; }
    console.log(`${fed.toUpperCase()}: ${provas.length} provas juvenis com PDFs desde ${desde}`);
    for (const p of provas) {
      // Os mesmos PDFs já lidos → nada a fazer (os da Navarra têm ~1,7 MB cada).
      // A prova pode ter ficado em vários ficheiros ({chave}-{aaaammdd}).
      const meus = fs.readdirSync(dir).filter((x) => x === `${p.chave}.json` || x.startsWith(`${p.chave}-2`));
      const ant = meus.length ? JSON.parse(fs.readFileSync(path.join(dir, meus[0]), "utf8")) : null;   // ilegível = erro
      if (ant && !force && JSON.stringify([...(ant.pdfs || [])].sort()) === JSON.stringify([...p.pdfs].sort())) { saltados++; continue; }
      try {
        const { saidas, avisos } = await lerProva(fed, p);
        for (const a of avisos) console.warn(`  ⚠ ${p.name || p.chave}: ${a}`);
        for (const { chave, out } of saidas) {
          const n = nJog(out);
          if (!n) { console.log(`  · ${out.meta.name}: sem classificação scratch juvenil a 18 buracos`); continue; }
          const file = path.join(dir, `${chave}.json`);
          const nAnt = fs.existsSync(file) ? nJog(JSON.parse(fs.readFileSync(file, "utf8"))) : 0;
          if (n < nAnt && !force) { console.warn(`  ⚠ ${out.meta.name}: ${n} < ${nAnt} jogadores no ficheiro — mantém-se o anterior`); iguais++; continue; }
          writeJsonGuarded(file, out, { count: nJog, maxDrop: 0.5, label: `${fed}/${chave}`, force });
          console.log(`  ${out.meta.dateStart || "?"} ${out.meta.name}: ${p.pdfs.length} PDFs, ${out.results.length} classificações, ${n} jogadores`);
          gravados++;
        }
      } catch (e) {
        console.error(`::warning::${fed} ${p.name || p.chave}: ${e.message}`);
        falhas++;
      }
    }
  }
  console.log(`PDFs regionais: ${gravados} gravados, ${iguais} mantidos, ${saltados} já lidos, ${falhas} falhas`);
  if (falhas && !gravados && !saltados) process.exitCode = 1;
  else if (!gravados) process.exitCode = 2;
}

if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });
module.exports = { lerFng, nomeClm, gruposDeDatas };
