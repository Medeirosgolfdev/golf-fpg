/**
 * scripts/scrape-golfdata-se.js — data de nascimento e clube dos suecos do Kids 2
 * pelo golfdata.se (ranking da federação sueca, SGF Golf Ranking). 03/11/2026.
 *
 * Na Suécia o HCP não é público (Min Golf pede Golf-ID), mas o golfdata.se mostra,
 * para quem joga provas do ranking (Svenska Juniortouren, 13+ e adultos):
 *   pesquisa  POST https://golfdata.se/sgfranking/Players_searchpage
 *             (ASP.NET: TextBox2 = apelido, TextBox3 = nome, + viewstate)
 *   ficha     GET  https://golfdata.se/sgfranking/players_startpage?PlayerID=N
 *             → «Representerar» (clube) e «Födelsedatum» (data de nascimento).
 *
 * Âmbito: os suecos do Kids 2 sem data de nascimento (juniors.json, país SE).
 * Só se aceita UM jogador com o mesmo apelido e o mesmo primeiro nome; com dois
 * ou mais fica «ambíguo» e não se usa. Um pedido de cada vez, com pausa.
 *
 * Saída: public/data/golfdata-se.json
 *   { generatedAt, source, total, porNome: { "<nome normalizado>": {
 *       consultado, playerId?, nome?, clube?, dob?, naoEncontrado?, ambiguo? } } }
 * O agregador (util/golfdata-se.js) põe a data e o clube na ficha com esse nome.
 * Gravação aditiva, com guarda anti-encolhimento.
 *
 * Uso:
 *   node scripts/scrape-golfdata-se.js                 # âmbito; salta os consultados há < 60 dias
 *   node scripts/scrape-golfdata-se.js --nome "Erik Groth"   # um nome (mostra, não grava)
 *   node scripts/scrape-golfdata-se.js --limit 20 --delay 3000
 * Exit: 0 gravou · 2 nada de novo · 1 erro.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonGuarded, hasForceFlag } = require("./lib/shrink-guard");

const BASE = "https://golfdata.se/sgfranking";
const DATA = path.resolve(__dirname, "../public/data");
const OUT = path.join(DATA, "golfdata-se.json");
const UA = { "User-Agent": "Mozilla/5.0 (golf-fpg; junior tracker)" };

const argv = process.argv.slice(2);
const arg = (n, def) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def; };
const DELAY = Math.max(1500, parseInt(arg("delay", "3000"), 10));
const MAX_DIAS = Math.max(0, parseInt(arg("max-dias", "60"), 10));
const LIMIT = arg("limit", null) ? parseInt(arg("limit"), 10) : Infinity;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minúsculas, sem acentos nem pontuação, espaços simples. */
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
const ent = (s) => String(s || "").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim();
const campo = (html, n) => (html.match(new RegExp(`name="${n}"[^>]*value="([^"]*)"`)) || [])[1] || "";

/** Sessão ASP.NET: um GET para o viewstate, depois os POST da pesquisa. */
async function abrirPesquisa() {
  const r = await fetch(`${BASE}/Players_searchpage`, { headers: UA });
  if (!r.ok) throw new Error(`pesquisa HTTP ${r.status}`);
  const h = await r.text();
  const st = { cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
  for (const n of ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"]) st[n] = campo(h, n);
  if (!st.__VIEWSTATE) throw new Error("pesquisa sem viewstate (a página mudou?)");
  return st;
}

/** Linhas da pesquisa: [{ playerId, apelido, nome, clube }]. */
async function pesquisar(st, apelido, nome) {
  const corpo = new URLSearchParams({
    __EVENTTARGET: "", __EVENTARGUMENT: "", __LASTFOCUS: "",
    __VIEWSTATE: st.__VIEWSTATE, __VIEWSTATEGENERATOR: st.__VIEWSTATEGENERATOR, __EVENTVALIDATION: st.__EVENTVALIDATION,
    TextBox1: "", TextBox2: apelido, TextBox3: nome, DropDownList1: "0", DropDownListGender: "Alla", DropDownList2: "0", Button1: "Sök spelare",
  });
  const r = await fetch(`${BASE}/Players_searchpage`, {
    method: "POST", body: corpo,
    headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded", ...(st.cookie ? { Cookie: st.cookie } : {}) },
  });
  if (!r.ok) throw new Error(`pesquisa HTTP ${r.status}`);
  const h = await r.text();
  const out = [];
  for (const m of h.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const id = (m[1].match(/PlayerID=(\d+)/i) || [])[1];
    if (!id) continue;
    const c = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => ent(x[1].replace(/<[^>]*>/g, "")));
    out.push({ playerId: +id, apelido: c[0] || "", nome: c[1] || "", clube: c[2] || "" });
  }
  return out;
}

/** Ficha: { clube, dob }. */
async function ficha(playerId) {
  const r = await fetch(`${BASE}/players_startpage?PlayerID=${playerId}`, { headers: UA });
  if (!r.ok) throw new Error(`ficha ${playerId} HTTP ${r.status}`);
  const t = ent((await r.text()).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]*>/g, "|")).replace(/\s+/g, " ");
  const depois = (rot) => ((t.split(rot)[1] || "").split("|").map((x) => x.trim()).find((x) => x && x !== ":") || "").replace(/^:\s*/, "");
  const dob = depois("Födelsedatum");
  return { clube: depois("Representerar") || null, dob: /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null };
}

/** Quem procurar: suecos do Kids 2 sem data de nascimento. */
function ambito() {
  const J = JSON.parse(fs.readFileSync(path.join(DATA, "juniors.json"), "utf8"));
  const arr = Array.isArray(J) ? J : (J.juniors || Object.values(J));
  const out = new Map();
  for (const j of arr) {
    if (j.country !== "SE" || j.dob || !j.canonicalName) continue;
    const k = norm(j.canonicalName);
    if (k.split(" ").length >= 2 && !out.has(k)) out.set(k, j.canonicalName);
  }
  return [...out];
}

/** Um nome → registo (ou null se a pesquisa falhar). */
async function consultar(st, nomeCompleto, hoje) {
  const partes = norm(nomeCompleto).split(" ");
  const primeiro = partes[0];
  // A pesquisa casa o INÍCIO do apelido: o último nome; com apelido composto
  // («Sandqvist Lidholm») tenta-se também o do meio.
  let bate = [];
  for (const apelido of [...new Set([partes[partes.length - 1], ...partes.slice(1, -1)])]) {
    const linhas = await pesquisar(st, apelido, primeiro);
    bate = linhas.filter((l) => norm(l.apelido).split(" ").includes(apelido) && norm(l.nome).split(" ")[0] === primeiro);
    if (bate.length) break;
    await sleep(DELAY);
  }
  if (!bate.length) return { consultado: hoje, naoEncontrado: true };
  if (bate.length > 1) return { consultado: hoje, ambiguo: bate.map((l) => l.playerId) };
  await sleep(DELAY);
  const f = await ficha(bate[0].playerId);
  return { consultado: hoje, playerId: bate[0].playerId, nome: `${bate[0].nome} ${bate[0].apelido}`.trim(), clube: f.clube || bate[0].clube || null, dob: f.dob };
}

(async () => {
  const hoje = new Date().toISOString().slice(0, 10);
  const st = await abrirPesquisa();
  if (arg("nome", null)) {
    console.log(JSON.stringify(await consultar(st, arg("nome"), hoje), null, 2));
    return;
  }
  const anterior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")).porNome || {} : {};
  const store = { ...anterior };
  const limite = new Date(Date.now() - MAX_DIAS * 864e5).toISOString().slice(0, 10);
  const todos = ambito();
  const fila = todos.filter(([k]) => !(store[k]?.consultado && MAX_DIAS > 0 && store[k].consultado > limite)).slice(0, LIMIT);
  console.log(`golfdata.se — âmbito ${todos.length} suecos sem data, ${fila.length} a consultar (pausa ${DELAY} ms)`);
  const gravar = () => writeJsonGuarded(OUT, { generatedAt: new Date().toISOString(), source: "scripts/scrape-golfdata-se.js (golfdata.se SGF ranking)", total: Object.keys(store).length, porNome: store },
    { count: (d) => Object.keys(d.porNome).length, maxDrop: 0.5, force: hasForceFlag(), spaces: 1, label: "golfdata-se.json" });
  let ok = 0, nao = 0, amb = 0, erros = 0, mudou = 0;
  for (let i = 0; i < fila.length; i++) {
    const [k, nome] = fila[i];
    try {
      const reg = await consultar(st, nome, hoje);
      const sem = (o) => JSON.stringify({ ...o, consultado: undefined });
      if (!store[k] || sem(store[k]) !== sem(reg)) mudou++;
      store[k] = reg;
      if (reg.playerId) ok++; else if (reg.ambiguo) amb++; else nao++;
      if (reg.playerId) console.log(`  ✓ ${nome} → ${reg.nome} · ${reg.clube || "?"} · ${reg.dob || "?"}`);
    } catch (e) {
      erros++;
      console.warn(`  ! ${nome}: ${e.message}`);
      if (erros >= 5 && ok + nao + amb === 0) { console.error("5 erros seguidos sem nenhuma resposta — a parar"); break; }
    }
    if ((i + 1) % 25 === 0) gravar();
    await sleep(DELAY);
  }
  const w = gravar();
  console.log(`Feito: ${ok} encontrados, ${amb} ambíguos, ${nao} não estão, ${erros} erros, ${mudou} mudaram. golfdata-se.json: ${Object.keys(store).length}${w.written ? "" : " (NÃO gravado)"}.`);
  if (!w.written || (fila.length && ok + nao + amb === 0)) process.exitCode = 1;
  else if (!mudou) process.exitCode = 2;
})().catch((e) => { console.error("ERRO:", e.message); process.exitCode = 1; });
