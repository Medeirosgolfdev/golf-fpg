#!/usr/bin/env node
/**
 * scripts/scrape-fvg.js — provas juvenis da Federación Vasca de Golf
 * (fvgolf.com). 30/10/2026.
 *
 * Calendário: `wp-admin/admin-ajax.php` com `action=fvgolf_get_torneos_por_anyo`
 * (HTML: uma linha por prova com uuid, datas, nome, categoria e campo). Página
 * da prova `fvgolf.com/torneo/{uuid}/{slug}`: listas de PDFs (Horarios,
 * Resultados…). Sem inscritos nem API de resultados — só os PDFs.
 *
 * Cada clube publica no seu programa; lêem-se os dois formatos com colunas:
 *   A) o da federação: «POS LICENCIA CATEG. NOMBRE TOT STRS S HCE HCJ R1…R4»
 *      (Puntuables Zonales Juveniles, Campeonato e Copa do País Vasco, Álava…)
 *      — R1..R4 vêm em ±par; o par da volta sai de (STRS − TOT) / nº de voltas.
 *   B) «Pos Licencia Nombre Hp Nivel Sex Total» (Laukariz, Vizcaya) e o dos
 *      clubes «Pos Nombre Licencia Hex NVH Niv Sex Cat. Hpu Tot» (Zarauz,
 *      Gipuzkoa, Meaztegi…) — 1 volta, o total é o último número da linha.
 * Os outros (só a lista de campeões, PDFs em imagem, ligas por equipas) ficam
 * de fora: a prova aparece só se houver classificação lida.
 *
 * Fora: Benjamín (escalões muito novos — pedido da Mariana) e as provas de
 * adultos. Grava `public/data/fvg/{uuid}.json` no formato do microsite antigo
 * da RFEG (como a FGCV) → fonte «FVG» na /rfeg e nos rivais do Kids 2.
 *
 * USO: node scripts/scrape-fvg.js [--desde 2025] [--ids uuid1,uuid2]
 * Exit: 0 gravou · 2 nada de novo · 1 erro.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonGuarded } = require("./lib/shrink-guard");
const { itensPdf, linhas, lerClassificacoes, juntarClassificacoes } = require("./lib/pdf-classificacoes");

const OUT_DIR = path.resolve(__dirname, "../public/data/fvg");
const AJAX = "https://www.fvgolf.com/wp-admin/admin-ajax.php";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PAUSA_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const JUVENIL = /infantil|alev[ií]n|juvenil|junior|cadete|sub-?1[0-8]\b/i;
const FORA = /benjam[ií]n\s*$|copa fvg benjam/i;

async function pedir(url, binario = false) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return binario ? Buffer.from(await r.arrayBuffer()) : r.text();
}
async function calendario(anyo) {
  const r = await fetch(AJAX, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ action: "fvgolf_get_torneos_por_anyo", anyo: String(anyo), campo: "", categoria_clasificacion: "", limite: "" }),
  });
  if (!r.ok) throw new Error(`calendário ${anyo}: HTTP ${r.status}`);
  return r.text();
}

const ENT = { amp: "&", quot: '"', nbsp: " ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", Ntilde: "Ñ", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú" };
const texto = (s) => String(s || "").replace(/<[^>]+>/g, " ")
  .replace(/&(#\d+|[a-z]+);/gi, (m, e) => (e[0] === "#" ? String.fromCharCode(+e.slice(1)) : ENT[e] ?? m))
  .replace(/\s+/g, " ").trim();

/** Linhas do calendário: uuid, datas dd/mm/aaaa, nome, categoria, campo, url. */
function lerCalendario(html) {
  const out = [];
  for (const tr of html.match(/<tr data-uuid="[^"]+">[\s\S]*?<\/tr>/g) || []) {
    const uuid = /data-uuid="([^"]+)"/.exec(tr)[1];
    const td = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    const a = /<a href="([^"]+)">([\s\S]*?)<\/a>/.exec(td[2] || "");
    if (!a) continue;
    out.push({
      uuid, desde: texto(td[0]), ate: texto(td[1]), url: a[1], name: texto(a[2]),
      categoria: texto(td[3]), campo: [...String(td[4] || "").matchAll(/<span>([^<]*)<\/span>/g)].map((m) => texto(m[1])).join(" / ") || null,
    });
  }
  return out;
}

/** PDFs da secção «Resultados» da página da prova. */
function pdfsResultados(html, base) {
  const sec = (html.split('class="resultados"')[1] || "").split("</ul>")[0];
  return [...sec.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => new URL(m[1], base).toString());
}

const dmyParaIso = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

async function lerTorneio(t) {
  const pagina = await pedir(t.url); await sleep(PAUSA_MS);
  const urls = pdfsResultados(pagina, t.url);
  const todos = [];
  const avisos = [];
  for (const url of urls) {
    try {
      for (const b of lerClassificacoes(await itensPdf(await pedir(url, true)))) todos.push({ ...b, pdfUrl: url });
      await sleep(PAUSA_MS);
    } catch (e) { avisos.push(`${url.split("/").pop()}: ${e.message}`); }
  }
  const { results, admitidos } = juntarClassificacoes(todos, urls);
  const counts = { admitidos: admitidos.length, reservas: 0, bajas: 0, invitados: 0, noAdmitidos: 0, provisional: 0 };
  return {
    out: {
      compId: t.uuid, ok: true, scrapedAt: new Date().toISOString(), source: "fvg", url: t.url,
      meta: {
        name: t.name, dateStart: t.desde, dateEnd: t.ate || t.desde, course: t.campo,
        mode: "Individual", style: null, category: t.categoria || null, sex: null,
        federation: "Federación Vasca de Golf", codigo: null,
      },
      inscritos: { admitidos, reservas: [], bajas: [], invitados: [], noAdmitidos: [], provisional: [], counts },
      palmares: [], leaderboard: [], results,
    },
    avisos, nPdfs: urls.length,
  };
}

/** Já está lido? Lido mais de 7 dias depois do último dia (resultados tardios). */
function completo(file, fimIso) {
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!fimIso) return false;
    const lim = new Date(fimIso + "T00:00:00Z"); lim.setUTCDate(lim.getUTCDate() + 7);
    return String(d.scrapedAt || "") > lim.toISOString();
  } catch { return false; }
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const ids = getArg("--ids") ? new Set(getArg("--ids").split(",")) : null;
  const anoAtual = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric" }).format(new Date()));
  const desde = Number(getArg("--desde") || anoAtual - 1);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const todos = [];
  for (let a = desde; a <= anoAtual + 1; a++) { todos.push(...lerCalendario(await calendario(a))); await sleep(PAUSA_MS); }
  if (!todos.length) { console.error("::error::calendário FVG vazio — o site mudou?"); process.exit(1); }
  const alvo = todos.filter((t) => (ids ? ids.has(t.uuid) : JUVENIL.test(`${t.name} ${t.categoria}`) && !FORA.test(t.name)));
  console.log(`FVG: ${todos.length} provas desde ${desde}, ${alvo.length} juvenis`);

  const hoje = new Date().toISOString().slice(0, 10);
  let gravados = 0, iguais = 0, falhas = 0, saltados = 0;
  for (const t of alvo) {
    const fimIso = dmyParaIso(t.ate || t.desde);
    const file = path.join(OUT_DIR, `${t.uuid}.json`);
    if (!ids && (completo(file, fimIso) || (dmyParaIso(t.desde) || "") > hoje)) { saltados++; continue; }
    try {
      const { out, avisos, nPdfs } = await lerTorneio(t);
      const n = out.results.reduce((a, r) => a + r.players.length, 0);
      for (const a of avisos) console.warn(`  ⚠ ${t.name}: ${a}`);
      if (fs.existsSync(file)) {
        const ant = JSON.parse(fs.readFileSync(file, "utf8"));   // ilegível = erro
        const nAnt = (ant.results || []).reduce((a, r) => a + r.players.length, 0);
        if (n < nAnt && !args.includes("--force")) { console.warn(`  ⚠ ${t.name}: ${n} < ${nAnt} jogadores no ficheiro — mantém-se o anterior`); iguais++; continue; }
      }
      writeJsonGuarded(file, out, { count: (d) => d.results.reduce((a, r) => a + r.players.length, 0), maxDrop: 0.5, label: `fvg/${t.uuid}` });
      console.log(`${t.desde} ${t.name}: ${nPdfs} PDFs, ${out.results.length} classificações, ${n} jogadores`);
      gravados++;
    } catch (e) {
      console.error(`::warning::${t.name} (${t.uuid}): ${e.message}`);
      falhas++;
    }
  }
  console.log(`FVG: ${gravados} gravados, ${iguais} mantidos, ${saltados} saltados, ${falhas} falhas`);
  if (falhas && !gravados && !saltados) process.exitCode = 1;
  else if (!gravados) process.exitCode = 2;
}

if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });
module.exports = { lerCalendario, pdfsResultados, lerClassificacoes, linhas };
