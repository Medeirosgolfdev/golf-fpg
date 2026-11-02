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
 *      node scripts/scrape-federgolf.js --futuras     (provas por jogar: inscritos)
 *      --so-pt-antes 2022   antes desse ano, só provas com portugueses inscritos
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
// Cartões em paralelo (4 aguenta; com 8 o servidor deles começa a falhar).
// `--paralelo N` para correr duas cargas ao mesmo tempo (ex.: 3 + 3).
const PARALELO = Number(process.argv[process.argv.indexOf("--paralelo") + 1]) > 0 && process.argv.includes("--paralelo")
  ? Number(process.argv[process.argv.indexOf("--paralelo") + 1]) : 4;
const TENTATIVAS = 5;
const ESTAVEL_DIAS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
// `--futuras`: só as provas por jogar (lista de inscritos), do ano corrente e do seguinte.
const FUTURAS = process.argv.includes("--futuras");
const ANOS = (arg("--anos") || (FUTURAS ? `${new Date().getFullYear()},${new Date().getFullYear() + 1}` : String(new Date().getFullYear())))
  .split(",").map(Number).filter(Boolean);
const IDS = arg("--ids") ? arg("--ids").split(",").map((s) => s.trim().toLowerCase()) : null;
const MAX_MS = (Number(arg("--max-min")) || 0) * 60_000;
const REFAZER = process.argv.includes("--refazer");
const SEM_CARTOES = process.argv.includes("--sem-cartoes");
// `--so-pt-antes 2022`: nas provas anteriores a esse ano, só as que têm
// portugueses (na Federgolf o «clube» dos estrangeiros é o país: POR/PRT).
const SO_PT_ANTES = Number(arg("--so-pt-antes")) || 0;
const PORTUGAL = /^(POR|PRT|PORTUGAL)$/i;
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

/* ── Lista de inscritos (separador «Lista iscritti») ───────────────── */
// Linha: [nº, nome+clube (HTML), Cat., Qual., WAGR, Hcp (índice), Odm, Data, Stato (ícone)].
// Legenda da própria lista: Cat. B Baby · P Pulcini · C Cadetti · R Ragazzi ·
// D Dilettanti · M Mid-Amateur · S Senior · Ss Super senior; Qual. B Brevetto ·
// BG Brevetto Giovanile · BN Brevetto Nazionale · GIF Interesse Federale · GIN
// Interesse Nazionale; Odm = lugar na Ordine di Merito; Stato = ammesso, in
// attesa, cancellato (não admitido/cancelado), wildcard. Estrangeiros: o
// «clube» é o país (FRA, ENG, SWI…).
const ESTADO = { "icona-ammesso": "ammesso", "icona-in-attesa": "attesa", "icona-cancellato": "cancellato", "icona-wildcard": "wildcard" };
const num = (v) => (v !== "" && v != null && Number.isFinite(Number(v)) ? Number(v) : null);
function lerInscritos(plData) {
  return (plData.processedData || []).map((r) => ({
    n: num(r[0]),
    nome: texto((/nome-giocatore">([^<]*)/.exec(r[1]) || [])[1]),
    clube: texto((/circolo-giocatore">([^<]*)/.exec(r[1]) || [])[1]) || null,
    cat: texto(r[2]) || null,
    qual: texto(r[3]) || null,
    wagr: num(r[4]),
    indice: num(r[5]),
    odm: num(r[6]),
    data: isoDe(texto(r[7])),
    estado: ESTADO[(/icona-[a-z-]+/.exec(r[8] || "") || [])[0]] || null,
  })).filter((i) => i.nome);
}

/** Acrescenta a lista de inscritos a uma prova já gravada (sem voltar aos cartões). */
async function completarInscritos(file, ant) {
  const lista = lerInscritos(await ajax("competition-player-list", { competition_id: ant.id }));
  const porNome = new Map(lista.map((i) => [i.nome.toUpperCase(), i]));
  const prova = {
    ...ant,
    jogadores: ant.jogadores.map((j) => {
      const i = porNome.get(j.nome.toUpperCase());
      return i ? { ...j, clube: j.clube ?? i.clube, indice: j.indice ?? i.indice, cat: j.cat || i.cat, qual: j.qual || i.qual, odm: j.odm ?? i.odm, wagr: i.wagr } : j;
    }),
    inscritos: lista,
  };
  const r = writeJsonGuarded(file, prova, { count: (d) => d.jogadores.length, maxDrop: 0.3, force: FORCE, spaces: 0, label: ant.id });
  console.log(`  ${r.written ? "✓" : "✗"} ${ant.data} ${ant.nome} — +${lista.length} inscritos`);
  return r.written;
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

  const listaInscritos = lerInscritos(plData);
  // A lista escreve às vezes o nome próprio em minúsculas («FABRE, Anatole»).
  const inscritos = new Map(listaInscritos.map((i) => [i.nome.toUpperCase(), i]));
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
    const ins = inscritos.get(nome.toUpperCase());
    const linhasRel = rel.get(nome.toUpperCase()) || [];
    // Prova de uma volta: a classificação não traz «G1», só o total.
    const gv = Array.from({ length: voltas }, (_, i) => { const g = p[`G${i + 1}`] ?? (voltas === 1 ? p.tot : undefined); return g > 0 ? g : null; });
    // Cada volta jogada leva o seu tee/CR/Slope/SD: a volta N é o N.º dia da
    // prova (o gross do relatório é o ajustado, não serve para casar).
    const rating = gv.map((g, i) => {
      const d = g != null && diasProva[i] ? linhasRel.find((x) => x.data === diasProva[i]) : null;
      return d ? { tee: d.tee, cr: d.cr, slope: d.slope, sd: d.sd, data: d.data } : null;
    });
    return {
      pos: typeof p.posizione === "number" ? p.posizione : null,
      nome, id: p.id, clube: ins?.clube ?? null, indice: ins?.indice ?? null,
      cat: ins?.cat || texto(p.cat) || null, qual: ins?.qual || texto(p.qual) || null, odm: ins?.odm ?? null, wagr: ins?.wagr ?? null,
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
    inscritos: listaInscritos,
    completo: nCartoes === nVoltas,
    extraidoEm: new Date().toISOString(),
  };
}

/* ── Provas por jogar: só a lista de inscritos (para ver quem vai) ──── */
async function lerFutura(c) {
  const inscritos = lerInscritos(await ajax("competition-player-list", { competition_id: c.competition_id }));
  return {
    fonte: "federgolf.it", id: c.competition_id, nome: texto(c.nome), data: isoDe(c.data), clube: texto(c.club),
    tipo: c.tipo, categoria: categoria(c.nome, c.tipo), sexo: sexo(c.nome), voltas: null,
    url: PAGINA(c.competition_id), campo: null, parTotal: null,
    jogadores: [], inscritos, futura: true, completo: false, extraidoEm: new Date().toISOString(),
  };
}

/* ── Índice (de todos os ficheiros em disco) ───────────────────────── */
function construirIndice() {
  const provas = [];
  for (const f of fs.readdirSync(OUT_DIR).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8")); // ilegível = erro
    // Filtros 🇵🇹 PT e ★ Manuel da /fig: na classificação OU na lista de inscritos
    // (quem ficou em lista de espera também conta — a página diz que não jogou).
    const quem = [...d.jogadores, ...(d.inscritos || [])];
    const tees = [...new Set(d.jogadores.flatMap((j) => (j.rating || []).filter(Boolean).map((r) => r.tee)).filter(Boolean))];
    provas.push({
      id: d.id, nome: d.nome, data: d.data, clube: d.clube, tipo: d.tipo, categoria: categoria(d.nome, d.tipo),
      sexo: d.sexo, voltas: d.voltas, jogadores: d.jogadores.length,
      parTotal: d.campo?.par?.every((x) => typeof x === "number") ? d.campo.par.reduce((a, b) => a + b, 0) : (d.parTotal ?? null),
      tees, completo: d.completo,
      cartoes: d.jogadores.some((j) => (j.cartoes || []).some(Boolean)),
      inscritos: d.inscritos?.length ?? null,
      ...(quem.some((j) => PORTUGAL.test(j.clube || "")) ? { hasPt: true } : {}),
      ...(quem.some((j) => /^MEDEIROS,\s*MANUEL\b/i.test(j.nome || "")) ? { hasManuel: true } : {}),
      ...(d.futura ? { futura: true } : {}),
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
    // O ano seguinte pode ainda não ter calendário (só nas futuras isso é normal).
    if (FUTURAS && ano > Number(hoje.slice(0, 4)) && Array.isArray(d)) return d;
    if (!Array.isArray(d) || !d.length) throw new Error(`calendário ${ano} vazio — a API mudou?`);
    return d;
  })).flat();
  if (FUTURAS) {
    // Provas por jogar: a lista de inscritos de cada uma (muda todos os dias).
    const futuras = cal.filter((c) => entra(c) && (isoDe(c.data) || "") > hoje);
    console.log(`Calendário ${ANOS.join(",")}: ${futuras.length} provas juvenis por jogar`);
    let n = 0, err = 0;
    await emParalelo(futuras, 3, async (c) => {
      try {
        const prova = await lerFutura(c);
        const file = path.join(OUT_DIR, `${c.competition_id}.json`);
        const r = writeJsonGuarded(file, prova, { count: (d) => d.inscritos.length, maxDrop: 0.5, force: FORCE, spaces: 0, label: c.competition_id });
        if (r.written) n++;
        console.log(`  ${r.written ? "✓" : "✗"} ${prova.data} ${prova.nome} — ${prova.inscritos.length} inscritos`);
      } catch (e) { err++; console.error(`  ✗ ${c.data} ${texto(c.nome)}: ${e.message}`); }
    });
    const ri = writeJsonGuarded(INDEX, construirIndice(), { count: (d) => d.provas.length, maxDrop: 0.3, force: FORCE, label: "federgolf-index" });
    console.log(`Futuras gravadas ${n}, erros ${err}`);
    process.exitCode = !ri.written || (err && !n) ? 1 : n ? 0 : 2;
    return;
  }
  const alvo = cal.filter((c) => (IDS ? IDS.includes(c.competition_id.toLowerCase()) : entra(c)) && (isoDe(c.data) || "9999") <= hoje);
  console.log(`Calendário ${ANOS.join(",")}: ${cal.length} provas, ${alvo.length} juvenis já jogadas`);

  // Passagem rápida: 3 provas de cada vez; com cartões, uma (os cartões já vão 4 a 4).
  let gravadas = 0, saltadas = 0, erros = 0, vazias = 0, semPt = 0, desdeIndice = 0;
  await emParalelo(alvo, SEM_CARTOES ? 3 : 1, async (c) => {
    if (MAX_MS && Date.now() - inicio > MAX_MS) return;
    const file = path.join(OUT_DIR, `${c.competition_id}.json`);
    if (!REFAZER && !IDS && fs.existsSync(file)) {
      const ant = JSON.parse(fs.readFileSync(file, "utf8"));
      if (SEM_CARTOES) {
        // Gravada antes de haver a lista de inscritos (02/11/2026): só esse pedido.
        if (!ant.inscritos) {
          try { if (await completarInscritos(file, ant)) gravadas++; } catch (e) { erros++; console.error(`  ✗ inscritos ${ant.nome}: ${e.message}`); }
        } else saltadas++;
        return;
      }
      const dias = (Date.parse(hoje) - Date.parse(ant.data)) / 86_400_000;
      if (ant.completo && dias > ESTAVEL_DIAS && Date.parse(ant.extraidoEm) - Date.parse(ant.data) > ESTAVEL_DIAS * 86_400_000) { saltadas++; return; }
    }
    const t0 = Date.now();
    try {
      // Antes de `--so-pt-antes` (2022): só as provas com portugueses inscritos
      // (pedido da Mariana, 02/11/2026). Um pedido à lista antes de tudo o resto.
      if (SO_PT_ANTES && Number(String(isoDe(c.data)).slice(0, 4)) < SO_PT_ANTES && !fs.existsSync(file)) {
        const ins = lerInscritos(await ajax("competition-player-list", { competition_id: c.competition_id }));
        if (!ins.some((i) => PORTUGAL.test(i.clube || ""))) { semPt++; return; }
      }
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
  console.log(`Gravadas ${gravadas}, já estáveis ${saltadas}, sem classificação ${vazias}, sem portugueses (antes de ${SO_PT_ANTES || "—"}) ${semPt}, erros ${erros}; índice ${idx.provas.length} provas`);
  if (!ri.written || (erros && !gravadas)) process.exitCode = 1;
  else if (!gravadas) process.exitCode = 2;
})().catch((e) => { console.error(e); process.exitCode = 1; });
