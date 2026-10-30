/**
 * scripts/scrape-ffgolf-merite.js
 *
 * Mérite National Jeunes da FFG (ranking mensal dos juniores franceses), sem login:
 *   GET https://pages.ffgolf.org/merite/datas/jeunes/{messieurs|dames}/{AAAAMM}   (JSON)
 *   GET https://pages.ffgolf.org/merite/merite_details/{AAAAMM}/jeunes?h={CODE}   (HTML, ficha)
 * O CODE muda de mês para mês: a ficha pede-se sempre com o código do mesmo mês.
 *
 * Dá duas coisas que o portal de resultados não dá:
 *  1. o ESCALÃO EXACTO de cada jogador (Poucet 1 … Minime 2 → ano de nascimento),
 *     lido pelo build-france-players.js (`cat` exacto em vez de inferido);
 *  2. na ficha, a média contra o SSS em cada prova (Moy.SSS) com as voltas —
 *     SSS que a FFG usou = média das voltas − Moy.SSS. Agregado por série
 *     (mediana dos jogadores) dá o SSS do tee nesse dia; SSS − CR = PCC.
 *
 * Fichas: só dos jogadores CLASSIFICADOS do mês mais recente (~1 mil pedidos,
 * um de cada vez). As linhas guardam-se e somam-se de mês para mês (aditivo):
 * uma prova que sai da janela de 12 meses do Mérite não se perde.
 *
 * Uso: node scripts/scrape-ffgolf-merite.js [--month AAAAMM] [--history] [--no-details] [--limit N]
 *   --history  lê também as listas dos meses anteriores (desde 202411) para o ano de nascimento
 *              de quem já não aparece no mês actual.
 *
 * Outputs:
 *   public/data/ffgolf-merite-jeunes.json — jogadores (escalão, ano de nascimento, lugar, médias)
 *                                           e as linhas das fichas (para o builder; o site não o lê)
 *   public/data/ffgolf-merite-sss.json    — { tournaments: { trnId: { SERIE: { sss, n, lo, hi } } } } (site)
 */
const fs = require("fs");
const path = require("path");
const { writeJsonGuarded } = require("./lib/shrink-guard");

const DATA = path.resolve(__dirname, "../public/data");
const OUT = path.join(DATA, "ffgolf-merite-jeunes.json");
const OUT_SSS = path.join(DATA, "ffgolf-merite-sss.json");
const INDEX = path.join(DATA, "ffgolf-resultats-index.json");
const RES_DIR = path.join(DATA, "ffgolf-resultats");
const BASE = "https://pages.ffgolf.org/merite";

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const HISTORY = args.includes("--history");
const DETAILS = !args.includes("--no-details");
const LIMIT = Number(arg("--limit")) || Infinity;
const FIRST_MONTH = "202411";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, json = true) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 golf-fpg", Accept: json ? "application/json" : "text/html" } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(String(r.status));
      return json ? await r.json() : await r.text();
    } catch (e) {
      if (i === 2) { console.warn(`  ${url}: ${e.message}`); return null; }
      await sleep(2000 * (i + 1));
    }
  }
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const pkey = (sex, nom, prenom) => `${sex}|${norm(nom)}|${norm(prenom)}`;
const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

/** Idade FFG de cada escalão (catégories d'âge: a idade que se faz no ano civil). */
const AGE = { "POUCET 1": 9, "POUCET 2": 10, "POUSSIN 1": 11, "POUSSIN 2": 12, "BENJAMIN 1": 13, "BENJAMIN 2": 14,
  "MINIME 1": 15, "MINIME 2": 16, "CADET 1": 17, "CADET 2": 18 };
/** «MINIME 2 / BOY», «POUSSINE 1», «BENJAMINE 2» → { cat: "Minime 2", age } (ENFANT = até 8, sem ano exacto). */
function categoria(raw) {
  const t = norm(raw).replace(/\bBOY\b|\bGIRL\b/g, "").replace(/(POUCET|POUSSIN|BENJAMIN|CADET)(TE|E)\b/, "$1").trim();
  const m = t.match(/^(POUCET|POUSSIN|BENJAMIN|MINIME|CADET) ([12])$/);
  if (!m) return { cat: t ? t[0] + t.slice(1).toLowerCase() : null, age: null };
  const k = `${m[1]} ${m[2]}`;
  return { cat: m[1][0] + m[1].slice(1).toLowerCase() + " " + m[2], age: AGE[k] };
}

const serieCourseKey = (label) => {
  const k = String(label || "").toUpperCase().replace(/\s+/g, "");
  return ({ BG: "U14G", BF: "U14F", MG: "U16G", MF: "U16F" })[k] || k;
};

const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
/** Ficha HTML → { idx, rows: [{ date, trnId, t:[…], moy }] }. */
function parseDetail(html) {
  const idx = num((html.match(/Index:\s*<span[^>]*>([^<]*)</) || [])[1]);
  const rows = [];
  const body = html.split(/<tbody>/i).slice(2).join(" ") || html; // 2.ª tabela = provas
  for (const tr of body.split(/<tr[\s>]/i).slice(1)) {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (tds.length < 12) continue;
    const link = tds[3].match(/resultats-details\/([0-9a-f]+)\/(\d+)/i);
    const t = tds.slice(5, 9).map((x) => num(strip(x))).filter((x) => x != null);
    const moy = num(strip(tds[11]));
    if (!link || !t.length || moy == null) continue;
    const [d, m, y] = strip(tds[0]).split("/");
    rows.push({ date: `${y}-${m}-${d}`, trnId: link[2], t, moy });
  }
  return { idx, rows };
}

function monthsBack(from, to) {
  const out = [];
  let y = +from.slice(0, 4), m = +from.slice(4);
  while (`${y}${String(m).padStart(2, "0")}` >= to) {
    out.push(`${y}${String(m).padStart(2, "0")}`);
    if (--m === 0) { m = 12; y--; }
  }
  return out;
}

(async () => {
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { players: {}, rows: {} };
  const players = { ...(prev.players || {}) };
  const rowsBy = { ...(prev.rows || {}) }; // trnId → { playerKey: [t1,…,moy] }

  // Mês mais recente publicado: o pedido, ou o actual e para trás até 3 meses.
  const now = new Date();
  const cur = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  let month = arg("--month"), lists = null;
  for (const m of month ? [month] : monthsBack(cur, FIRST_MONTH).slice(0, 4)) {
    const [h, d] = [await get(`${BASE}/datas/jeunes/messieurs/${m}`), await get(`${BASE}/datas/jeunes/dames/${m}`)];
    if (h?.datas?.length && d?.datas?.length) { month = m; lists = { M: h, F: d }; break; }
  }
  if (!lists) { console.error("Mérite: nenhum mês publicado encontrado"); process.exit(1); }
  console.log(`Mérite Jeunes ${month}: ${lists.M.datas.length} rapazes (${lists.M.nb} classificados), ${lists.F.datas.length} raparigas (${lists.F.nb})`);

  const addList = (sex, j, m) => {
    const season = +m.slice(0, 4);
    for (const p of j.datas || []) {
      const k = pkey(sex, p.NOM, p.PRENOM);
      const { cat, age } = categoria(p.CATEGORIE);
      const old = players[k];
      if (old && old.month > m) { if (!old.by && age) old.by = season - age; continue; }
      players[k] = {
        s: sex, nom: p.NOM, prenom: p.PRENOM, golf: p.GOLF || null, cat, by: age ? season - age : (old?.by ?? null),
        rank: p.RANK === "-" ? null : Number(p.RANK), rankAnn: Number(p.RANKANN) || null,
        moy: num(p.MOY_SSS), moy6: num(p.MOY_SSS_6), nbt: Number(p.NBTOURNOIS) || 0, total: num(p.TOTAL),
        statut: p.STATUT || null, idx: old?.idx ?? null, month: m,
      };
    }
  };
  if (HISTORY) {
    for (const m of monthsBack(month, FIRST_MONTH).slice(1).reverse()) {
      for (const [sex, part] of [["M", "messieurs"], ["F", "dames"]]) {
        const j = await get(`${BASE}/datas/jeunes/${part}/${m}`);
        if (j?.datas?.length) addList(sex, j, m);
      }
    }
  }
  addList("M", lists.M, month);
  addList("F", lists.F, month);

  if (DETAILS) {
    const todo = ["M", "F"].flatMap((sex) => lists[sex].datas.filter((p) => p.RANK !== "-").map((p) => ({ sex, p })));
    let n = 0, nRows = 0;
    for (const { sex, p } of todo.slice(0, LIMIT)) {
      const html = await get(`${BASE}/merite_details/${month}/jeunes?h=${p.CODE}`, false);
      if (++n % 100 === 0) console.log(`  ${n}/${todo.length} fichas…`);
      if (!html) continue;
      const k = pkey(sex, p.NOM, p.PRENOM);
      const { idx, rows } = parseDetail(html);
      if (idx != null) players[k].idx = idx;
      for (const r of rows) { (rowsBy[r.trnId] ||= {})[k] = [...r.t, r.moy]; nRows++; }
      await sleep(150);
    }
    console.log(`Fichas: ${n} lidas, ${nRows} linhas com Moy.SSS`);
  }

  // SSS por série: cada linha liga-se ao jogador no ficheiro de resultados (nome
  // E voltas iguais — o nome sozinho não chega, há homónimos).
  const ix = JSON.parse(fs.readFileSync(INDEX, "utf8")).tournaments || [];
  const fileOf = Object.fromEntries(ix.map((t) => [t.trnId, t.file]));
  const sss = {};
  let nLig = 0, nSem = 0;
  for (const [trnId, byP] of Object.entries(rowsBy)) {
    if (!fileOf[trnId]) continue;
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(RES_DIR, fileOf[trnId]), "utf8")); } catch { continue; }
    const acc = {};
    for (const s of (d.details && d.details.series) || []) {
      for (const pl of s.players || []) {
        const k = pkey(pl.sex === "F" ? "F" : "M", pl.nameNom, pl.namePrenom);
        const row = byP[k];
        if (!row) continue;
        const t = row.slice(0, -1), moy = row[row.length - 1];
        const mine = [pl.t1, pl.t2, pl.t3, pl.t4].filter((x) => x != null);
        if (mine.length !== t.length || mine.some((x, i) => x !== t[i])) { nSem++; continue; }
        (acc[serieCourseKey(s.label)] ||= []).push(t.reduce((a, b) => a + b, 0) / t.length - moy);
        nLig++;
      }
    }
    for (const [key, v] of Object.entries(acc)) {
      v.sort((a, b) => a - b);
      const med = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
      const r1 = (x) => Math.round(x * 10) / 10;
      (sss[trnId] ||= {})[key] = { sss: r1(med), n: v.length, lo: r1(v[0]), hi: r1(v[v.length - 1]) };
    }
  }
  console.log(`SSS: ${nLig} linhas ligadas a uma série (${nSem} com voltas diferentes, ignoradas) → ${Object.keys(sss).length} provas`);

  const nP = Object.keys(players).length;
  writeJsonGuarded(OUT, { generatedAt: new Date().toISOString(), month, source: `${BASE}/jeunes/{messieurs|dames}`, players, rows: rowsBy },
    { spaces: 0, failOnRefuse: true, count: (o) => Object.keys(o.players).length });
  writeJsonGuarded(OUT_SSS, { generatedAt: new Date().toISOString(), month, tournaments: Object.fromEntries(Object.entries(sss).sort(([a], [b]) => a.localeCompare(b))) },
    { spaces: 0, failOnRefuse: true, count: (o) => Object.keys(o.tournaments).length });
  console.log(`Mérite: ${nP} jogadores (${Object.values(players).filter((p) => p.by).length} com ano de nascimento)`);
})();
