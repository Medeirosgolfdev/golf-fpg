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
const pdf = require("pdf-parse");
const { writeJsonGuarded } = require("./lib/shrink-guard");

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

// ── PDF → linhas com coordenadas ──────────────────────────────────────
async function itensPdf(buf) {
  const itens = [];
  await pdf(buf, {
    pagerender: async (pg) => {
      const tc = await pg.getTextContent();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        itens.push({ s: it.str.trim(), x: it.transform[4], y: it.transform[5], p: pg.pageIndex });
      }
      return "";
    },
  });
  return itens;
}
/** Agrupa itens em linhas (mesma página, |Δy| ≤ 2), de cima para baixo. */
function linhas(itens) {
  const ord = [...itens].sort((a, b) => a.p - b.p || b.y - a.y || a.x - b.x);
  const out = [];
  for (const it of ord) {
    const l = out[out.length - 1];
    if (l && l.p === it.p && Math.abs(l.y - it.y) <= 2) l.itens.push(it);
    else out.push({ p: it.p, y: it.y, itens: [it] });
  }
  for (const l of out) l.itens.sort((a, b) => a.x - b.x);
  return out;
}

const CATS = [[/benjam/i, "Benjamín"], [/alev/i, "Alevín"], [/infantil/i, "Infantil"], [/cadet/i, "Cadete"], [/junior|sub-?18/i, "Junior"]];
const NIVEL = { B: "Benjamín", A: "Alevín", I: "Infantil", C: "Cadete", J: "Junior" };
const catDe = (s) => { for (const [re, c] of CATS) if (re.test(s || "")) return c; return null; };
const sexoDe = (s) => (/femen|femin|\bfem\b/i.test(s || "") ? "F" : /mascul|\bmas\b/i.test(s || "") ? "M" : null);
const num = (s) => { const v = parseFloat(String(s || "").replace(",", ".")); return Number.isFinite(v) ? v : null; };
/** «+5» → 5, «-2» → −2, «PAR»/«E» → 0; o resto (NP, RET, DESC) → null. */
const toParDe = (s) => { const t = String(s || "").trim().toUpperCase(); if (t === "PAR" || t === "E") return 0; return /^[+-]?\d+$/.test(t) ? parseInt(t, 10) : null; };
const LIC = /^[A-Z]{2}\d{8}$|^\d{10}$/;

/**
 * Classificações de um PDF (formatos A e B). Devolve blocos
 * { titulo, categoria, sexo, nRounds, parRonda, players[] } — um por título de
 * secção («RESULTADOS CADETE MASCULINO», «INFANTIL MASCULINO»…).
 */
function lerClassificacoes(itens) {
  const blocos = [];
  let titulo = "", cols = null, bloco = null;
  for (const l of linhas(itens)) {
    const txt = l.itens.map((i) => i.s).join(" ");
    const h = l.itens.map((i) => i.s.toUpperCase().replace(/\.$/, ""));
    if (h.includes("LICENCIA") && (h.includes("NOMBRE"))) {
      cols = l.itens.map((i) => ({ n: i.s.toUpperCase().replace(/\.$/, "").replace(/^STR$/, "STRS"), x: i.x }));
      bloco = null;
      continue;
    }
    const lic = l.itens.find((i) => LIC.test(i.s));
    if (!lic || !cols) {
      // Linha de título (sem licença): «RESULTADOS CADETE MASCULINO», «INFANTIL
      // FEMENINO», «Clasificación Scratch Masculina Acumulada (ASC: 0) 1ª Vuelta».
      if ((catDe(txt) || sexoDe(txt) || /clasificaci/i.test(txt)) && txt.length < 90 && !/campeonato|puntuable|copa|torneo|cpto/i.test(txt)) { titulo = txt.replace(/^RESULTADOS\s+/i, ""); bloco = null; }
      continue;
    }
    // Cada item vai para a coluna do cabeçalho mais próxima. Formato A tem R1..R4
    // (±par por volta); nos outros o total é o último número da linha.
    const v = {};
    const formatoA = cols.some((c) => c.n === "R1");
    let ultimo = null;
    const xNome = Math.min(...cols.filter((c) => c.n === "NOMBRE" || c.n === "LICENCIA").map((c) => c.x));
    for (const it of l.itens) {
      if (it === lic) continue;
      // A posição é o número à esquerda do nome e da licença (no formato B fica
      // mais perto da coluna «Licencia» do que da «Pos»).
      if (/^\d+$/.test(it.s) && it.x < xNome - 2 && v.POS == null) { v.POS = it.s; continue; }
      let melhor = null;
      for (const c of cols) if (!melhor || Math.abs(c.x - it.x) < Math.abs(melhor.x - it.x)) melhor = c;
      if (v[melhor.n] == null) v[melhor.n] = it.s;
      if (/^\d+$/.test(it.s)) ultimo = it.s;   // «G» (vencedor) no fim não conta
    }
    const nome = v.NOMBRE || "";
    if (!nome) continue;
    const categoria = catDe(v.CATEG || v.CAT) || NIVEL[String(v.NIVEL || v.NIV || "").toUpperCase()] || catDe(titulo);
    const sx = v.S || v.SEX || "";
    const sexo = /^[MF]$/i.test(sx) ? sx.toUpperCase() : sexoDe(titulo);
    if (!bloco || bloco.titulo !== titulo) {
      bloco = { titulo, formato: formatoA ? "A" : "B", players: [] };
      blocos.push(bloco);
    }
    const p = { pos: /^\d+$/.test(v.POS || "") ? +v.POS : null, licencia: lic.s, name: nome, catEdad: categoria, sexo };
    if (!formatoA) {
      p.hcp = num(v.HP ?? v.HEX);
      const tot = /^\d+$/.test(ultimo || "") ? parseInt(ultimo, 10) : NaN;
      p.total = Number.isFinite(tot) && tot > 20 ? tot : null;
      p.rounds = p.total != null ? [p.total] : [];
      p.toPar = null;
    } else {
      p.hcp = num(v.HCE);
      p.toPar = toParDe(v.TOT);
      p.strokes = /^\d+$/.test(v.STRS || "") ? +v.STRS : null;
      p.rtp = ["R1", "R2", "R3", "R4"].map((k) => toParDe(v[k])).filter((x, i, a) => x != null || a.slice(i + 1).some((y) => y != null));
    }
    bloco.players.push(p);
  }
  // Formato A: ±par por volta → pancadas, com o par da volta tirado da própria
  // classificação ((STRS − TOT) / voltas): o valor de pelo menos 80% dos
  // jogadores (um desistente a meio da volta não o estraga). Quem não bate com
  // ele fica só com o total.
  for (const b of blocos) {
    if (b.formato === "A") {
      const pares = [];
      for (const p of b.players) if (p.strokes != null && p.toPar != null && p.rtp.length) pares.push((p.strokes - p.toPar) / p.rtp.length);
      const moda = mais(pares.filter(Number.isInteger));
      const parRonda = moda != null && pares.filter((x) => x === moda).length >= 0.8 * pares.length ? moda : null;
      b.parRonda = parRonda;
      for (const p of b.players) {
        p.total = p.strokes;
        const bate = p.strokes != null && p.toPar != null && p.rtp.length && (p.strokes - p.toPar) / p.rtp.length === parRonda;
        p.rounds = parRonda != null && bate && p.rtp.every((x) => x != null) ? p.rtp.map((x) => parRonda + x) : [];
        delete p.strokes; delete p.rtp;
      }
      b.nRounds = Math.max(1, ...b.players.map((p) => p.rounds.length));
    } else {
      b.nRounds = 1;
    }
    // Empatados: o PDF deixa a posição em branco — herda a de cima (mesmo total).
    for (let i = 1; i < b.players.length; i++) {
      const p = b.players[i], a = b.players[i - 1];
      if (p.pos == null && p.total != null && p.total === a.total) p.pos = a.pos;
    }
    // Escalão do título («RESULTADOS CADETE MASCULINO») ou o da maioria dos
    // jogadores (coluna Categ./Nivel/Niv); sexo idem.
    b.categoria = catDe(b.titulo) || mais(b.players.map((p) => p.catEdad));
    // Rapazes e raparigas na mesma classificação (Interclubes) = mista.
    const sexos = new Set(b.players.map((p) => p.sexo).filter(Boolean));
    b.sexo = sexos.size > 1 ? null : (sexoDe(b.titulo) || [...sexos][0] || null);
    // Classificações que não são a scratch (hándicap, «no nacional», neto).
    b.fora = /h[aá]ndicap|\bhcp\b|no nacional|neto|stableford/i.test(b.titulo);
    // 9 buracos: par da volta ≤ 40 (formato A) ou totais típicos de 9 buracos.
    const tots = b.players.map((p) => p.total).filter((x) => x != null).sort((x, y) => x - y);
    b.noveBuracos = b.parRonda != null ? b.parRonda <= 40 : (tots.length > 0 && tots[Math.floor(tots.length / 2)] / b.nRounds < 60);
  }
  return blocos.filter((b) => b.players.length);
}
function mais(arr) {
  const c = new Map();
  for (const x of arr) if (x) c.set(x, (c.get(x) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
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
  // Cada jogador fica numa só classificação: primeiro as de mais voltas (o PDF
  // da última volta é acumulado e substitui o da 1.ª), depois pela ordem da
  // página; o «acumulado» repetido noutro PDF deixa de contar. Fora: hándicap/
  // «no nacional», 9 buracos e as de Benjamín (escalões muito novos).
  const ordemPdf = (b) => urls.indexOf(b.pdfUrl);
  const vistos = new Set();
  const usados = [];
  for (const b of todos.filter((x) => !x.fora && !x.noveBuracos && !/9\s?h(oyos)?(?![a-z])/i.test(decodeURIComponent(x.pdfUrl.split("/").pop())) && x.categoria && x.categoria !== "Benjamín")
    .sort((a, b2) => b2.nRounds - a.nRounds || ordemPdf(a) - ordemPdf(b2))) {
    const players = b.players.filter((p) => !vistos.has(p.licencia));
    if (!players.length) continue;
    for (const p of players) vistos.add(p.licencia);
    // Quem só está no PDF de uma volta anterior (desistiu, não passou o corte)
    // entra na classificação principal do mesmo escalão, sem posição nem total.
    const principal = usados.find((u) => u.categoria === b.categoria && u.sexo === b.sexo && (u.nRounds > b.nRounds || players.every((p) => p.total == null)));
    if (principal) {
      for (const p of players) principal.players.push({ ...p, pos: null, total: null, toPar: null });
      continue;
    }
    usados.push({ ...b, players });
  }
  const ordem = ["Alevín", "Infantil", "Cadete", "Junior"];
  usados.sort((a, b) => ordem.indexOf(a.categoria) - ordem.indexOf(b.categoria) || String(a.sexo).localeCompare(String(b.sexo)));
  const labels = new Map();
  const results = usados.map((b) => {
    let label = `${b.categoria}${b.sexo === "M" ? " Masculino" : b.sexo === "F" ? " Femenino" : ""}`;
    const n = (labels.get(label) || 0) + 1;
    labels.set(label, n);
    // Duas classificações do mesmo escalão (Uraburu: «Nacional» e outra) → o
    // título do próprio PDF a distinguir.
    if (n > 1) label += ` — ${b.titulo.replace(/\(ASC:[^)]*\)|\d+ª Vuelta/gi, "").replace(/\s+/g, " ").trim() || n}`;
    return {
      label, sexo: b.sexo, categoria: b.categoria, pdfUrl: b.pdfUrl, nRounds: b.nRounds,
      parTotal: b.parRonda ?? null,
      players: b.players.map((p) => ({ pos: p.pos, name: p.name, licencia: p.licencia, toPar: p.toPar, rounds: p.rounds, total: p.total, hcp: p.hcp })),
    };
  });
  // Os inscritos são quem jogou (a FVG não publica a lista de inscritos).
  const admitidos = usados.flatMap((b) => b.players).map((p) => ({ name: p.name, licencia: p.licencia, pais: "ES", hcp: p.hcp, catEdad: p.catEdad, sexo: p.sexo, club: null, dob: null, estado: null }));
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
