/**
 * scripts/scrape-intelligentgolf-hcp.js — Handicap Index actual de juniores
 * ingleses, pelas listas de inscritos dos opens de juniores dos clubes em
 * intelligentgolf (02/11/2026).
 *
 * A England Golf não publica handicaps (só na app My England Golf, com conta).
 * Mas nos clubes ingleses em intelligentgolf a lista de inscritos de uma prova
 * mostra, para os sócios do clube que a organiza, o HI entre parênteses
 * («Joseph Thorne (1.1)» no Goodwood Junior Open 2026). É o HI do dia em que se
 * lê, não o da inscrição — por isso a lista é datada com o dia da leitura.
 *
 * Para cada clube de scripts/intelligentgolf-scope.json (um pedido de cada vez,
 * com pausa):
 *   1. provas futuras (competition2.php?time=future) e passadas desde 1 de
 *      Janeiro do ano corrente (--desde; POST compsfilter, 20 a 20) — provas de
 *      anos anteriores não interessam;
 *   2. só os opens/campeonatos individuais de juniores (eProvaJunior);
 *   3. lista de inscritos de cada um → quem tem HI.
 *
 * Saída: public/data/hcp-listas/AAAA-MM_intelligentgolf.json, no formato das
 * hcp-listas (o agregador kids2 junta um ponto ao hcpHistory de quem já tem
 * ficha — scripts/aggregator/util/hcp-listas.js). Um ficheiro por mês: dentro
 * do mês é aditivo (quem já estava e não voltou a aparecer fica, o que voltou a
 * aparecer actualiza), e os meses anteriores ficam como histórico.
 *
 * Uso:
 *   node scripts/scrape-intelligentgolf-hcp.js                       # todos os clubes
 *   node scripts/scrape-intelligentgolf-hcp.js --club goodwood        # só os hosts que contêm «goodwood»
 *   node scripts/scrape-intelligentgolf-hcp.js --delay 1500 --dry
 * Exit: 0 = gravou · 2 = nada de novo · 1 = erro.
 */
const fs = require("fs");
const path = require("path");
const { writeJsonGuarded, hasForceFlag } = require("./lib/shrink-guard");
const { parseEntrants, parseCompRows, ajaxHtml, eProvaJunior } = require("./lib/intelligentgolf");

const SCOPE = path.join(__dirname, "intelligentgolf-scope.json");
const OUT_DIR = path.resolve(__dirname, "../public/data/hcp-listas");
const UA = "Mozilla/5.0 (golf-fpg; juniores)";
const MAX_PAGINAS = 15;

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hojeLisboa = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
const ddmmaaaa = (iso) => iso.split("-").reverse().join("/");
const chave = (nome, host) => `${nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z' -]/g, "").replace(/\s+/g, " ").trim()}|${host}`;

async function pedir(url, delay, opts = {}) {
  await sleep(delay);
  const r = await fetch(url, { ...opts, headers: { "User-Agent": UA, ...(opts.headers || {}) }, redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return opts.json ? r.json() : r.text();
}

/** Provas de juniores de um clube (futuras + passadas desde `desde`). */
async function provasDoClube(host, desde, hoje, delay) {
  const ano = Number(hoje.slice(0, 4));
  const provas = new Map();
  const juntar = (lista) => { for (const p of lista) if (!provas.has(p.compid)) provas.set(p.compid, p); };

  juntar(parseCompRows(await pedir(`https://${host}/competition2.php?time=future`, delay), ano));
  for (let y = desde; y <= ano; y++) {
    const fim = y === ano ? hoje : `${y}-12-31`;
    for (let pag = 0; pag < MAX_PAGINAS; pag++) {
      const body = new URLSearchParams({
        // «all», não «juniors»: o filtro do site perde os opens de juniores marcados «Men & Ladies»
        fromdate: ddmmaaaa(`${y}-01-01`), todate: ddmmaaaa(fim), entrants: "all",
        offset: String(pag * 20), all_loaded: "0", requestType: "ajax", ajaxaction: "compsfilter",
        ...(pag ? { loadmore: "1" } : {}),
      });
      const json = await pedir(`https://${host}/competition2.php?time=past`, delay, {
        method: "POST", body, json: true, headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const linhas = parseCompRows(ajaxHtml(json), y);
      const antes = provas.size;
      juntar(linhas);
      if (linhas.length < 20 || provas.size === antes) break;
    }
  }
  // a lista das futuras pode trazer provas «em curso» de anos anteriores
  return [...provas.values()].filter((p) => eProvaJunior(p.title) && (!p.date || Number(p.date.slice(0, 4)) >= desde));
}

/** Provas indicadas à mão no scope (`provas` do clube): as que o site deixou
 *  «Competition in Progress» não aparecem nem nas futuras nem nas passadas. */
function provasDoScope(c, encontradas) {
  const ja = new Set(encontradas.map((p) => p.compid));
  return (c.provas || []).filter((p) => !ja.has(p.compid)).map((p) => ({ compid: p.compid, title: p.title || `compid ${p.compid}`, date: p.date || null }));
}

async function main() {
  const scope = JSON.parse(fs.readFileSync(SCOPE, "utf8"));
  const filtro = arg("--club", null);
  const delay = Number(arg("--delay", 1200));
  const hoje = hojeLisboa();
  // só provas do ano corrente (e as futuras já abertas): as de anos anteriores não
  // interessam (Mariana, 02/11/2026)
  const desde = Number(arg("--desde", Number(hoje.slice(0, 4))));
  const dry = process.argv.includes("--dry");
  const clubes = scope.clubs.filter((c) => !filtro || c.host.includes(filtro));
  if (!clubes.length) throw new Error(`nenhum clube com «${filtro}» no scope`);

  const mes = hoje.slice(0, 7);
  const out = path.join(OUT_DIR, `${mes}_intelligentgolf.json`);
  let anterior = null;
  if (fs.existsSync(out)) anterior = JSON.parse(fs.readFileSync(out, "utf8")); // ilegível = erro (não «vazio»)
  const porChave = new Map((anterior?.players || []).map((p) => [chave(p.name, p.host), p]));

  let lidos = 0, falhas = 0, provasLidas = 0;
  for (const c of clubes) {
    let provas;
    try { provas = await provasDoClube(c.host, desde, hoje, delay); } catch (e) {
      falhas++; console.error(`✗ ${c.host}: ${e.message}`); continue;
    }
    provas = [...provas, ...provasDoScope(c, provas)];
    console.log(`${c.nome}: ${provas.length} provas de juniores`);
    for (const p of provas) {
      let ents;
      try { ents = parseEntrants(await pedir(`https://${c.host}/competition.php?go=entrants&compid=${p.compid}`, delay)); } catch (e) {
        falhas++; console.error(`  ✗ ${p.title}: ${e.message}`); continue;
      }
      provasLidas++;
      if (!ents) { console.log(`  · ${p.date || "?"} ${p.title}: sem lista pública`); continue; }
      const comHi = ents.filter((x) => typeof x.hcp === "number");
      console.log(`  · ${p.date || "?"} ${p.title}: ${ents.length} inscritos, ${comHi.length} com HI`);
      for (const x of comHi) {
        const k = chave(x.name, c.host);
        const prova = { compid: p.compid, title: p.title, date: p.date };
        const ja = porChave.get(k);
        const provasJ = [...(ja?.provas || []).filter((q) => q.compid !== p.compid), prova]
          .sort((a, b) => String(b.date).localeCompare(String(a.date)));
        porChave.set(k, { lista: "entry", name: ja?.name || x.name, country: c.country || "GB", hcp: x.hcp, clube: c.nome, host: c.host, lido: hoje, provas: provasJ });
        lidos++;
      }
    }
  }
  if (falhas && !provasLidas) throw new Error("nenhuma prova lida");

  const players = [...porChave.values()]
    .sort((a, b) => a.clube.localeCompare(b.clube) || a.name.localeCompare(b.name))
    .map((p, i) => ({ pos: i + 1, ...p }));
  const lista = {
    _doc: "Handicap Index ACTUAL de juniores ingleses, lido das listas de inscritos dos opens de juniores dos clubes em intelligentgolf (os sócios do clube organizador aparecem com o HI entre parênteses). Um ficheiro por mês; «lido» = dia em que o valor foi visto. Plus em negativo. Gerado por scripts/scrape-intelligentgolf-hcp.js; usado pelo agregador kids2 (util/hcp-listas.js).",
    id: `intelligentgolf-${mes}`,
    label: `Opens de juniores ingleses (intelligentgolf, HI de ${ddmmaaaa(hoje)})`,
    fonte: "Listas de inscritos públicas dos clubes ingleses em intelligentgolf (scripts/intelligentgolf-scope.json)",
    data: hoje,
    torneio: "Opens de juniores dos clubes ingleses (vários)",
    // opens de juniores = sub-18; e nomes ingleses comuns só ligam por nome igual
    nascidosDesde: Number(hoje.slice(0, 4)) - 18,
    soNomeExacto: true,
    fonteCurta: "intelligentgolf",
    players,
  };

  // igual = mesmos jogadores e valores e mesmo cabeçalho (sem contar as datas de leitura)
  const semDatas = (l) => JSON.stringify({ ...l, data: null, label: null, players: l.players.map(({ lido, pos, ...r }) => r) });
  const igual = anterior && semDatas(anterior) === semDatas(lista);
  console.log(`\n${players.length} juniores com HI (${lidos} linhas lidas em ${provasLidas} provas, ${falhas} falhas) → ${path.relative(process.cwd(), out)}`);
  if (dry) { console.log("(--dry: não gravado)"); return; }
  if (igual) { console.log("Nada de novo."); process.exitCode = 2; return; }
  const r = writeJsonGuarded(out, lista, { count: (d) => d.players.length, maxDrop: 0.5, force: hasForceFlag(), spaces: 1, trailingNewline: true, failOnRefuse: true });
  if (!r.written) return;
  if (falhas) process.exitCode = 1; // gravou o que leu, mas fica vermelho para se ver o que falhou
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
