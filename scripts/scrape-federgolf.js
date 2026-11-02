#!/usr/bin/env node
/**
 * scripts/scrape-federgolf.js — provas juvenis da Federazione Italiana Golf
 * (federgolf.it). 02/11/2026.
 *
 * API pública, sem login nem nonce: `POST wp-admin/admin-ajax.php` do plugin
 * federgolf-crm, sempre com `competition_id` (GUID da página
 * `/attivita-agonistica/dettaglio-gara/{id}/`).
 *   - calendário: `competitions-search` (anno, tipo=0, mese=0, keyword)
 *   - `competition-tipologia-classifica` → classificações + nº de voltas
 *   - `competition-details-classifica` (+tipologia, giro=nº de voltas) → linhas
 *   - `competition-details-classifica-giri` (+player_id) → TODAS as voltas do
 *     jogador num pedido (22 valores: 1-9, OUT, 10-18, IN, TOT, ±par) e o
 *     par/metros do campo; volta não jogada = cartão a zeros (fica de fora)
 *   - `competition-player-list` → clube, índice, ordem de mérito e a categoria
 *     de cada jogador (B Baby = Under 12, P Pulcini = U14, C Cadetti = U16,
 *     R Ragazzi = U18 — página de ranking juvenil da Federgolf, 02/11/2026).
 *     Os PDFs de classificação e horários repetem isto; não trazem licença nem idade.
 *   - `competition-hcp-report` → por jogador e volta: tee, CR, Slope e o SD
 *
 * ⚠️ O servidor é lento (~10–20 s por pedido) e com 8 pedidos em paralelo
 * responde com erros: 4 de cada vez, com repetição e espera.
 *
 * Provas: todas as juvenis individuais de 2006 em diante — os Trofei Giovanili
 * (Federali, U16, WAGR e os antigos) e qualquer prova com escalão juvenil no
 * nome (Baby, Pulcini, Cadetti, Ragazzi, Juniores, U14…U18). Fora: equipas,
 * match play, qualificações e anuladas.
 * Grava `public/data/federgolf/{id}.json` (uma prova = um sexo) e o índice
 * `public/data/federgolf-index.json` (de todos os ficheiros em disco).
 * Uma prova já gravada com todos os cartões e jogada há mais de 10 dias não
 * se volta a pedir (`--refazer` força). `--sem-cartoes`: passagem rápida (4
 * pedidos por prova: classificação, inscritos, relatório de handicap) que só
 * grava provas novas; os cartões chegam nas passagens normais seguintes,
 * porque a prova fica `completo: false`.
 *
 * USO: node scripts/scrape-federgolf.js [--anos 2026,2025] [--ids id1,id2]
 *        [--max-min 300] [--refazer] [--sem-cartoes] [--force]
 *      node scripts/scrape-federgolf.js --so-indice   (só refaz o índice)
 * Exit: 0 gravou · 2 nada de novo · 1 erro.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonGuarded } = require("./lib/shrink-guard");

const OUT_DIR = path.resolve(__dirname, "../public/data/federgolf");
const INDEX = path.resolve(__dirname, "../public/data/federgolf-index.json");
const AJAX = "https://www.federgolf.it/wp-admin/admin-ajax.php";
const PAGINA = (id) => `https://www.federgolf.it/attivita-agonistica/dettaglio-gara/${id}/`;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PARALELO = 4;
const TENTATIVAS = 5;
const ESTAVEL_DIAS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const ANOS = (arg("--anos") || String(new Date().getFullYear())).split(",").map(Number).filter(Boolean);
const IDS = arg("--ids") ? arg("--ids").split(",").map((s) => s.trim().toLowerCase()) : null;
const MAX_MS = (Number(arg("--max-min")) || 0) * 60_000;
const REFAZER = process.argv.includes("--refazer");
const SEM_CARTOES = process.argv.includes("--sem-cartoes");
const FORCE = process.argv.includes("--force");
const inicio = Date.now();

/* ── Que provas entram ─────────────────────────────────────────────── */
// Todas as juvenis: os Trofei Giovanili (Federali, U16, WAGR e os antigos sem
// «Federali») e qualquer prova com escalão juvenil no nome — Campionati,
// Gare Nazionali/Internazionali, e as de 2006, que vêm sem tipo.
const TG = /^Trofe[io] Giovanil[ei]/i;
const JUVENIL = /\b(BABY|PULCIN[IE]|CADETT[IE]|RAGAZZ[IE]|U\s?1[0-8]|UNDER\s?1[0-8]|JUNIOR(?:ES)?|GIOVANIL[EI]|ALLIEV[IE])\b/i;
const FORA = /A SQUADRE|MATCH ?PLAY|QUALIFICA|SELEZIONE|ANNULLATA|RINVIATA/i;

function entra(c) {
  if (c.annullata || FORA.test(c.nome)) return false;
  return TG.test(c.tipo || "") || JUVENIL.test(c.nome);
}

/** Categoria da prova, pelo nome (Baby, Pulcini…) ou pelo tipo do TGF. */
// Primeiro o escalão explícito do nome, depois o tipo; «Junior Trophy» não é a
// categoria Juniores (o Junior Trophy de 2026 é um TGF U16).
function categoria(nome, tipo) {
  const n = String(nome || "").toUpperCase();
  if (/\bBABY\b/.test(n)) return "Baby";
  if (/\bPULCIN[IE]\b/.test(n)) return "Pulcini";
  if (/\bCADETT[IE]\b/.test(n)) return "Cadetti";
  if (/\bRAGAZZ[IE]\b/.test(n)) return "Ragazzi";
  const u = /\b(?:U|UNDER)\s?(1[0-8])\b/.exec(n);
  if (u) return `U${u[1]}`;
  if (/U16/i.test(tipo || "")) return "U16";
  if (/WAGR/i.test(tipo || "")) return "TGF WAGR";
  if (/\bJUNIORES\b/.test(n)) return "Juniores";
  if (/\bALLIEV[IE]\b/.test(n)) return "Allievi";
  if (/Federal/i.test(tipo || "")) return "TGF";
  return "Giovanile";
}

const sexo = (nome) => (/\b(FEMMINILE|RAGAZZE|CADETTE|PULCINE)\b/i.test(nome) ? "F" : /\b(MASCHILE|RAGAZZI|CADETTI|PULCINI)\b/i.test(nome) ? "M" : null);
const isoDe = (dmy) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const hojeIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
const texto = (s) => String(s ?? "").replace(/<[^>]+>/g, " ")
  .replace(/&#0?39;|&#8217;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();

const moda = (xs) => {
  const n = new Map();
  for (const x of xs) n.set(x, (n.get(x) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/* ── Pedidos ───────────────────────────────────────────────────────── */
async function ajax(action, campos = {}) {
  let ultimo;
  for (let t = 1; t <= TENTATIVAS; t++) {
    try {
      const fd = new FormData();
      fd.append("action", action);
      for (const [k, v] of Object.entries(campos)) fd.append(k, String(v));
      const r = await fetch(AJAX, { method: "POST", body: fd, headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90_000) });
      const txt = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = JSON.parse(txt); // «Si è verificato un errore» vem em HTML → falha aqui
      // o calendário vem só com `data`; os outros com `success: true`
      if (j.success === false || j.data === undefined) throw new Error(`sem dados: ${txt.slice(0, 120)}`);
      return j.data;
    } catch (e) {
      ultimo = e;
      await sleep(5000 * t);
    }
  }
  throw new Error(`${action} ${JSON.stringify(campos)}: ${ultimo.message}`);
}

async function emParalelo(itens, n, fn) {
  const out = new Array(itens.length);
  let prox = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (prox < itens.length) { const i = prox++; out[i] = await fn(itens[i], i); }
  }));
  return out;
}

/* ── Uma prova ─────────────────────────────────────────────────────── */
async function lerProva(c) {
  const comp = { competition_id: c.competition_id };
  const tip = (await ajax("competition-tipologia-classifica", comp)).results;
  const lordo = (tip?.tipologia_classifica || []).find((t) => /lordo/i.test(t.value)) || tip?.tipologia_classifica?.[0];
  if (!lordo || !tip.giri_totali) return null;
  const voltas = tip.giri_totali;
  // Os três ao mesmo tempo; inscritos e relatório de handicap podem não existir
  // nas provas antigas (fica sem clube/categoria/tee — não é erro).
  const opcional = (action) => ajax(action, comp).catch((e) => { console.error(`    (${action}: ${e.message.slice(0, 80)})`); return {}; });
  const [clData, plData, hcpData] = await Promise.all([
    ajax("competition-details-classifica", { ...comp, tipologia_classifica: lordo.value, giro: voltas }),
    opcional("competition-player-list"),
    opcional("competition-hcp-report"),
  ]);
  const linhas = (clData.results?.items || []).filter((p) => p.id && p.nome);
  if (!linhas.length) return null;

  const inscritos = new Map();
  for (const r of plData.processedData || []) {
    const nome = texto((/nome-giocatore">([^<]*)/.exec(r[1]) || [])[1]);
    // [nº, nome+clube, categoria (B/P/C/R…), qualificação, —, índice, ordem de mérito, data de inscrição, admitido]
    inscritos.set(nome, {
      clube: texto((/circolo-giocatore">([^<]*)/.exec(r[1]) || [])[1]) || null,
      cat: texto(r[2]) || null, qual: texto(r[3]) || null,
      indice: r[5] !== "" && r[5] != null && Number.isFinite(Number(r[5])) ? Number(r[5]) : null,
      odm: Number(r[6]) || null,
    });
  }
  // Relatório de handicap: uma linha por jogador e volta (pela data).
  // [nome, apelido, data, par, tee, CR, Slope, índice, HCP de jogo, gross, pontos, SD]
  const rel = new Map();
  for (const r of hcpData.processedData || []) {
    const k = `${texto(r[1])}, ${texto(r[0])}`.toUpperCase();
    if (!rel.has(k)) rel.set(k, []);
    rel.get(k).push({ data: isoDe(r[2]), par: r[3], tee: r[4] || null, cr: Number(r[5]) || null, slope: Number(r[6]) || null, gross: Number(r[9]) || null, sd: r[11] != null && r[11] !== "" ? Number(r[11]) : null });
  }

  const diasProva = [...new Set([...rel.values()].flat().map((x) => x.data).filter(Boolean))].sort();
  let campo = null;
  const jogadores = await emParalelo(linhas, PARALELO, async (p) => {
    const sc = SEM_CARTOES ? null : await ajax("competition-details-classifica-giri", { ...comp, tipologia_classifica: lordo.value, player_id: p.id, giro: voltas });
    if (!campo && Array.isArray(sc?.par)) {
      campo = { par: [...sc.par.slice(0, 9), ...sc.par.slice(10, 19)], metros: [...sc.mt.slice(0, 9), ...sc.mt.slice(10, 19)] };
    }
    const cartoes = {};
    for (const g of sc?.giri || []) {
      const v = (g.valori || []).map((x) => x.valore);
      if (!(v[20] > 0)) continue;
      cartoes[g.nome] = [...v.slice(0, 9), ...v.slice(10, 19)];
    }
    const nome = texto(p.nome);
    const ins = inscritos.get(nome);
    const linhasRel = rel.get(nome.toUpperCase()) || [];
    const gv = Array.from({ length: voltas }, (_, i) => { const g = p[`G${i + 1}`]; return g > 0 ? g : null; });
    // Cada volta jogada leva o seu tee/CR/Slope/SD: a volta N é o N.º dia da
    // prova (o gross do relatório é o ajustado, não serve para casar).
    const rating = gv.map((g, i) => {
      const d = g != null && diasProva[i] ? linhasRel.find((x) => x.data === diasProva[i]) : null;
      return d ? { tee: d.tee, cr: d.cr, slope: d.slope, sd: d.sd, data: d.data } : null;
    });
    return {
      pos: typeof p.posizione === "number" ? p.posizione : null,
      nome, id: p.id, clube: ins?.clube ?? null, indice: ins?.indice ?? null,
      cat: ins?.cat || texto(p.cat) || null, qual: ins?.qual || texto(p.qual) || null, odm: ins?.odm ?? null,
      hcp: typeof p.hcp === "number" ? p.hcp : null,
      voltas: gv, total: p.tot > 0 ? p.tot : null,
      // Com voltas em falta a fonte conta-as a zero (−57) → sem ±par da fonte.
      toPar: gv.every((g) => g != null) && typeof p.par === "number" ? p.par : null,
      cartoes: gv.map((g, i) => (g != null ? cartoes[`G${i + 1}`] ?? null : null)),
      rating,
    };
  });

  const nCartoes = jogadores.reduce((a, j) => a + j.cartoes.filter(Boolean).length, 0);
  const nVoltas = jogadores.reduce((a, j) => a + j.voltas.filter((g) => g != null).length, 0);
  return {
    fonte: "federgolf.it",
    id: c.competition_id,
    nome: texto(c.nome),
    data: isoDe(c.data),
    clube: texto(c.club),
    tipo: c.tipo,
    categoria: categoria(c.nome, c.tipo),
    sexo: sexo(c.nome),
    voltas,
    url: PAGINA(c.competition_id),
    campo,
    // Par do campo (do relatório de handicap), para quando não há cartões.
    parTotal: moda([...rel.values()].flat().map((x) => Number(x.par)).filter((x) => x > 0)),
    jogadores,
    completo: nCartoes === nVoltas,
    extraidoEm: new Date().toISOString(),
  };
}

/* ── Índice (de todos os ficheiros em disco) ───────────────────────── */
function construirIndice() {
  const provas = [];
  for (const f of fs.readdirSync(OUT_DIR).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8")); // ilegível = erro
    const tees = [...new Set(d.jogadores.flatMap((j) => (j.rating || []).filter(Boolean).map((r) => r.tee)).filter(Boolean))];
    provas.push({
      id: d.id, nome: d.nome, data: d.data, clube: d.clube, tipo: d.tipo, categoria: categoria(d.nome, d.tipo),
      sexo: d.sexo, voltas: d.voltas, jogadores: d.jogadores.length,
      parTotal: d.campo?.par?.every((x) => typeof x === "number") ? d.campo.par.reduce((a, b) => a + b, 0) : (d.parTotal ?? null),
      tees, completo: d.completo,
      cartoes: d.jogadores.some((j) => (j.cartoes || []).some(Boolean)),
    });
  }
  provas.sort((a, b) => String(b.data).localeCompare(String(a.data)) || a.nome.localeCompare(b.nome));
  return { fonte: "federgolf.it", geradoEm: new Date().toISOString(), provas };
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (process.argv.includes("--so-indice")) {
    const idx = construirIndice();
    const r = writeJsonGuarded(INDEX, idx, { count: (d) => d.provas.length, maxDrop: 0.3, force: FORCE, label: "federgolf-index" });
    console.log(`Índice: ${idx.provas.length} provas${r.written ? "" : " (não gravado)"}`);
    process.exitCode = r.written ? 0 : 1;
    return;
  }
  const hoje = hojeIso();
  const cal = (await emParalelo(ANOS, 4, async (ano) => {
    const d = await ajax("competitions-search", { tipo: 0, keyword: "", anno: ano, mese: 0 });
    if (!Array.isArray(d) || !d.length) throw new Error(`calendário ${ano} vazio — a API mudou?`);
    return d;
  })).flat();
  const alvo = cal.filter((c) => (IDS ? IDS.includes(c.competition_id.toLowerCase()) : entra(c)) && (isoDe(c.data) || "9999") <= hoje);
  console.log(`Calendário ${ANOS.join(",")}: ${cal.length} provas, ${alvo.length} juvenis já jogadas`);

  // Passagem rápida: 3 provas de cada vez; com cartões, uma (os cartões já vão 4 a 4).
  let gravadas = 0, saltadas = 0, erros = 0, vazias = 0, desdeIndice = 0;
  await emParalelo(alvo, SEM_CARTOES ? 3 : 1, async (c) => {
    if (MAX_MS && Date.now() - inicio > MAX_MS) return;
    const file = path.join(OUT_DIR, `${c.competition_id}.json`);
    if (!REFAZER && !IDS && fs.existsSync(file)) {
      const ant = JSON.parse(fs.readFileSync(file, "utf8"));
      if (SEM_CARTOES) { saltadas++; return; }
      const dias = (Date.parse(hoje) - Date.parse(ant.data)) / 86_400_000;
      if (ant.completo && dias > ESTAVEL_DIAS && Date.parse(ant.extraidoEm) - Date.parse(ant.data) > ESTAVEL_DIAS * 86_400_000) { saltadas++; return; }
    }
    const t0 = Date.now();
    try {
      const prova = await lerProva(c);
      if (!prova) { vazias++; console.log(`  — ${c.data} ${texto(c.nome)}: sem classificação`); return; }
      const r = writeJsonGuarded(file, prova, { count: (d) => d.jogadores.length, maxDrop: 0.3, force: FORCE, spaces: 0, label: c.competition_id });
      if (r.written) gravadas++;
      console.log(`  ${r.written ? "✓" : "✗"} ${prova.data} ${prova.nome} — ${prova.jogadores.length} jog., ${prova.completo ? "cartões completos" : "sem cartões todos"} (${Math.round((Date.now() - t0) / 1000)} s)`);
      // Índice de 20 em 20, para o site ir vendo as provas sem esperar pelo fim.
      if (r.written && ++desdeIndice >= 20) {
        desdeIndice = 0;
        writeJsonGuarded(INDEX, construirIndice(), { count: (d) => d.provas.length, maxDrop: 0.3, force: FORCE, label: "federgolf-index" });
      }
    } catch (e) {
      erros++;
      console.error(`  ✗ ${c.data} ${texto(c.nome)}: ${e.message}`);
    }
  });
  if (MAX_MS && Date.now() - inicio > MAX_MS) console.log(`Tempo esgotado (--max-min) — o resto fica para a próxima.`);

  const idx = construirIndice();
  const ri = writeJsonGuarded(INDEX, idx, { count: (d) => d.provas.length, maxDrop: 0.3, force: FORCE, label: "federgolf-index" });
  console.log(`Gravadas ${gravadas}, já estáveis ${saltadas}, sem classificação ${vazias}, erros ${erros}; índice ${idx.provas.length} provas`);
  if (!ri.written || (erros && !gravadas)) process.exitCode = 1;
  else if (!gravadas) process.exitCode = 2;
})().catch((e) => { console.error(e); process.exitCode = 1; });
