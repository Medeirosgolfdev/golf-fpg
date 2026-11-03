/**
 * scripts/scrape-ig-condados.js — campeonatos e provas de juniores das associações
 * de condado inglesas em intelligentgolf (Surrey, Kent, Lancashire, …) para o
 * kids2 (03/11/2026).
 *
 * Os sites não têm lista das provas passadas: os compid são sequenciais por site,
 * por isso percorrem-se de cima para baixo (a partir do maior compid que o site
 * mostra) até passar o início da época (`--desde`, por omissão 1 de Janeiro do
 * ano corrente — só interessam as provas do ano, decisão dela a 02/11/2026).
 * O que já se viu fica em data-archive/ig-condados-estado.json e não se volta a
 * pedir (só as provas de juniores ainda sem resultados).
 *
 * Por prova de juniores (scripts/lib/ig-condados.js — eProvaJuniorCondado):
 *   resultados em Gross (`&sort=2`), handicap de jogo de cada um (o número entre
 *   parênteses — não é o HI), divisões do site, e o cartão de cada volta
 *   (viewround.php: buraco a buraco, par, SI, jardas → metros, tee, data).
 *   O site repete as mesmas voltas na prova-mãe e nas filhas (por tee, R1/R2):
 *   cada volta fica numa só prova (umaProvaPorVolta). Provas com o mesmo nome no
 *   mesmo dia juntam-se num torneio com uma divisão por prova/tee.
 *
 * Saída: public/data/ig-condados/{condado}_{AAAA-MM-DD}_{compid}.json (JobFile)
 * → fonte `ggcondados` do agregador («Condados ingleses»).
 *
 * Uso:
 *   node scripts/scrape-ig-condados.js                  # todos os condados
 *   node scripts/scrape-ig-condados.js --condado surrey
 *   node scripts/scrape-ig-condados.js --dry --reler --desde 2026 --delay 150
 * Exit: 0 = gravou · 2 = nada de novo · 1 = erro.
 */
const fs = require("fs");
const path = require("path");
const { writeJsonGuarded, hasForceFlag } = require("./lib/shrink-guard");
const { writeJsonAtomic } = require("./lib/atomic-write");
const L = require("./lib/ig-condados");

const SCOPE = path.join(__dirname, "ig-condados-scope.json");
const OUT_DIR = path.resolve(__dirname, "../public/data/ig-condados");
// fora do deploy (data-archive): só serve ao leitor
const ESTADO = path.resolve(__dirname, "../data-archive/ig-condados-estado.json");
const UA = "Mozilla/5.0 (golf-fpg; juniores dos condados)";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const tem = (n) => process.argv.includes(n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hojeLisboa = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
const DELAY = Number(arg("--delay", 250));
const PARALELO = Number(arg("--paralelo", 4)); // condados ao mesmo tempo (cada site recebe um pedido de cada vez)
/** As linhas de cada condado imprimem-se juntas, no fim dele (vários correm ao mesmo tempo). */
const out = (c, s) => (c._log || (c._log = [])).push(s);
const OLHAR_ACIMA = 40;      // compids acima do maior que o site mostra (provas novas ainda sem ligação)
const PARAR_APOS = 60;       // provas seguidas antes do início da época → parar (os compid não são bem cronológicos)
const MAX_PROVAS = 700;      // páginas de provas abertas por condado e leitura

let pedidos = 0;
async function pedir(url) {
  await sleep(DELAY);
  pedidos++;
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
      if (r.status === 404) return "";
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (t === 2) throw new Error(`${e.message} em ${url}`);
      await sleep(2000 * (t + 1));
    }
  }
  return "";
}

/** Maior compid que o site mostra (próximas provas, página inicial, últimos resultados). */
async function compidDeTopo(c, estado) {
  // só provas que existem (os «nada» não contam)
  const ids = Object.entries(estado.vistos).filter(([, v]) => v.tipo !== "nada").map(([id]) => Number(id));
  const host = new URL(c.base).host.replace(/^www\./, "");
  for (const p of ["competition.php?showall=1", "competition.php", "", "latest_results", "latest-results", "results"]) {
    const h = await pedir(`${c.base}/${p}`).catch(() => "");
    // ⚠ só ligações do próprio site: a página inicial de Hampshire liga a provas de clubes (blackmoorgolf.co.uk)
    for (const m of h.matchAll(/href="([^"]*compid=(\d+)[^"]*)"/g)) {
      if (/^https?:/i.test(m[1]) && !new URL(m[1].replace(/&amp;/g, "&")).host.endsWith(host)) continue;
      ids.push(Number(m[2]));
    }
  }
  for (const s of c.sementes || []) ids.push(s);
  return ids.length ? Math.max(...ids) : null;
}

/** Linhas de uma prova (todas as divisões), em Gross, com as voltas de cada um. */
async function lerProva(c, compid, cab, html) {
  if (cab.leaderboard) {
    const { rondas, linhas } = L.linhasLeaderboard(html);
    // o playerid sai das provas de cada volta (R1, R2…): roundid → playerid
    const pid = new Map();
    for (const r of rondas) {
      for (const l of L.linhasSimples(await pedir(`${c.base}/competition.php?compid=${r.compid}&sort=2`))) if (l.roundid) pid.set(l.roundid, l.playerid);
    }
    return linhas.map((l) => ({
      ...l, divisao: null, roundids: l.voltas.map((v) => v.roundid),
      playerid: l.voltas.map((v) => pid.get(v.roundid)).find(Boolean) || null,
    }));
  }
  const todas = L.linhasSimples(html).map((l) => ({ ...l, voltas: [{ roundid: l.roundid, gross: l.gross }], total: l.gross, divisao: null, roundids: [l.roundid] }));
  for (const d of L.divisoes(html)) {
    const daDiv = new Set(L.linhasSimples(await pedir(`${c.base}/competition.php?compid=${compid}&sort=2&division=${d.n}`)).map((l) => l.roundid || l.nome));
    for (const l of todas) if (!l.divisao && daDiv.has(l.roundid || l.nome)) l.divisao = d.nome;
  }
  return todas;
}

const MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Torneio (JobFile) de um grupo de provas com o mesmo nome e dia. */
async function montarTorneio(c, grupo) {
  const base = L.semRonda(grupo[0].cab.nome);
  const divs = new Map();
  // jogador → { pl, dv } no torneio todo: a R1 e a R2 nem sempre têm a mesma divisão no site (Dorset U18: «Boys» e «U18 Boys»)
  const porQuem = new Map();
  let campo = null;
  const datas = [];
  for (const p of grupo) {
    campo = campo || p.cab.campo;
    for (const l of p.linhas) {
      const rounds = [];
      let tee = null;
      for (const [i, v] of l.voltas.entries()) {
        let cart = null;
        if (v.roundid) cart = L.lerCartao(await pedir(`${c.base}/viewround.php?roundid=${v.roundid}`));
        tee = tee || cart?.tee || null;
        const data = cart?.data || p.cab.data;
        if (data) datas.push(data);
        const scores = cart?.pancadas?.every((x) => typeof x === "number") ? cart.pancadas : undefined;
        rounds.push({ day: i + 1, gross: v.gross ?? cart?.gross ?? null, ...(scores ? { scores } : {}), date: data, ...(cart?.par?.every((x) => typeof x === "number") ? { pars: cart.par } : {}), _cart: cart });
      }
      tee = tee || p.cab.tees || null;
      const rotulo = l.divisao || p.cab.nome;
      const esc = L.escalao(rotulo) || L.escalao(p.cab.nome);
      const chave = `${esc || L.semRonda(rotulo)}|${tee || ""}`;
      if (!divs.has(chave)) divs.set(chave, { esc, rotulo: L.semRonda(rotulo), tee, compid: p.compid, players: [], juntou: false, cart: null });
      const dv = divs.get(chave);
      const cart0 = rounds.map((r) => r._cart).find((x) => x?.par?.length >= 9 && x.par.every((y) => typeof y === "number"));
      if (!dv.cart && cart0) dv.cart = cart0;
      for (const r of rounds) delete r._cart;
      // A R1 e a R2 como provas separadas no mesmo dia (Kent «Junior Championship -
      // Round 1/2», sem leaderboard): o mesmo jogador junta as voltas.
      const quem = l.playerid || L.textOf(l.nome).toLowerCase();
      const { pl: ja, dv: dvJa } = porQuem.get(quem) || {};
      if (ja) {
        for (const r of rounds) ja.rounds.push({ ...r, day: ja.rounds.length + 1 });
        ja.total = ja.rounds.every((r) => typeof r.gross === "number") ? ja.rounds.reduce((s, r) => s + r.gross, 0) : null;
        delete ja.toPar;
        if (l.estado) ja._estado = l.estado;
        dvJa.juntou = true;
        continue;
      }
      const pl = {
        pos: l.estado || l.pos, name: l.nome, club: l.clube, country: c.country || "GB",
        ...(l.playerid ? { detailId: `${c.id}-${l.playerid}` } : {}),
        total: l.total ?? (rounds.every((r) => typeof r.gross === "number") ? rounds.reduce((s, r) => s + r.gross, 0) : null),
        ...(typeof l.toPar === "number" ? { toPar: l.toPar } : {}),
        roundGross: [], rounds,
        ...(typeof l.hcp === "number" ? { hcpJogo: l.hcp } : {}),
      };
      porQuem.set(quem, { pl, dv });
      dv.players.push(pl);
    }
  }
  // Voltas juntadas: a posição de cada volta já não vale. Quem fez todas fica sem
  // posição (o agregador ordena pelo total); quem não as fez todas fica «NR».
  for (const dv of divs.values()) {
    if (!dv.juntou) continue;
    const max = Math.max(...dv.players.map((p) => p.rounds.length));
    for (const p of dv.players) {
      const completo = p.rounds.length === max && typeof p.total === "number" && !p._estado;
      p.pos = completo ? null : p._estado || "NR";
      delete p._estado;
    }
  }
  const divisions = [];
  const varias = new Set([...divs.values()].map((d) => d.esc || d.rotulo)).size < divs.size; // o mesmo escalão em vários tees
  for (const dv of divs.values()) {
    const cart = dv.cart;
    const par = cart?.par || null;
    const parTotal = par ? par.reduce((s, x) => s + x, 0) : null;
    // 9 buracos e pitch & putt (par 54) fora; um campo curto de 18 (U12 de Surrey, par 58) fica
    if (parTotal != null && (par.length < 18 || parTotal < 56)) { out(c, `   ↷ ${dv.rotulo}: ${par.length} buracos, par ${parTotal} — volta curta, fora`); continue; }
    const metros = cart?.dist ? (cart.unidade === "m" ? cart.dist : L.jardasParaMetros(cart.dist)) : null;
    for (const p of dv.players) if (p.toPar == null && parTotal != null && typeof p.total === "number") p.toPar = p.total - parTotal * p.rounds.length;
    // sem escalão no nome: «Geral» (o nome da prova já é o do torneio), ou o rótulo quando há várias
    const nome = dv.esc ? `${dv.esc}${varias && dv.tee ? ` · ${dv.tee}` : ""}` : `${divs.size > 1 ? dv.rotulo : "Geral"}${dv.tee && (varias || divs.size > 1) ? ` · ${dv.tee}` : ""}`;
    divisions.push({
      division: nome, tid: String(dv.compid), par, parTotal,
      meters: metros && metros.every((x) => typeof x === "number") ? metros : null,
      si: cart?.si?.every((x) => typeof x === "number") ? cart.si : null,
      teeName: dv.tee, courseRating: null, slope: null, cardSource: "ig-cartao",
      source: `${c.base}/competition.php?compid=${dv.compid}`,
      ...(cart?.unidade === "jd" ? { distancias: "convertidas de jardas" } : {}),
      players: dv.players,
    });
  }
  if (!divisions.some((d) => d.players.length)) return null;
  datas.sort();
  const d0 = datas[0] || grupo[0].cab.data;
  const nomeTorneio = new RegExp(c.prefixo || c.nome, "i").test(base) ? base : `${c.prefixo || c.nome} — ${base}`;
  return {
    _doc: `${c.nome} — intelligentgolf (${c.base}). Resultado = Gross; hcpJogo = o handicap de jogo entre parênteses no site (não é o HI). CR/slope não publicados. Gerado por scripts/scrape-ig-condados.js.`,
    tournament: nomeTorneio, year: Number(d0.slice(0, 4)),
    source: `${c.base}/competition.php?compid=${grupo[0].compid}`, course: campo, scrapedAt: new Date().toISOString(),
    startDate: d0, endDate: datas[datas.length - 1] || d0,
    seriesId: `igc-${c.id}`, seriesLabel: c.nome, organizacao: c.organizacao || c.nome,
    divisions,
  };
}

async function lerCondado(c, desde, hoje, estadoTodo) {
  const estado = estadoTodo[c.id] || (estadoTodo[c.id] = { vistos: {} });
  let abertas = 0;
  const topo = await compidDeTopo(c, estado);
  if (!topo) { out(c, "  sem compid de partida"); return { gravados: 0 }; }
  const reler = tem("--reler");
  const juniores = [];
  let antigas = 0, erros = 0;
  for (let id = topo + OLHAR_ACIMA; id > 0 && antigas < PARAR_APOS && abertas < MAX_PROVAS; id--) {
    const v = estado.vistos[id];
    if (v && v.data && v.data < `${desde}-01-01`) { antigas++; continue; }
    if (v && !reler && (v.tipo === "outro" || v.tipo === "lida" || v.tipo === "coberta" || v.tipo === "nada")) { if (v.tipo !== "nada") antigas = 0; continue; }
    let html;
    try {
      html = await pedir(`${c.base}/competition.php?compid=${id}&sort=2`);
    } catch (e) {
      // uma prova que dá erro (Kent: HTTP 500 numa só) não pára o condado; fica para a próxima leitura
      if (++erros > 15) throw new Error(`demasiados erros — o último: ${e.message}`);
      out(c, `  ! ${e.message}`);
      continue;
    }
    abertas++;
    const cab = L.lerCabecalho(html);
    // compid sem prova: só se guarda abaixo do topo (acima dele ainda podem nascer provas novas)
    if (!cab.existe) { if (id <= topo) estado.vistos[id] = { tipo: "nada" }; continue; }
    if (cab.data && cab.data < `${desde}-01-01`) { estado.vistos[id] = { nome: cab.nome, data: cab.data, tipo: "outro" }; antigas++; continue; }
    antigas = 0;
    if (!L.eProvaJuniorCondado(cab.nome) || cab.pontos) { estado.vistos[id] = { nome: cab.nome, data: cab.data, tipo: "outro" }; continue; }
    if (!cab.data || cab.data > hoje) { estado.vistos[id] = { nome: cab.nome, data: cab.data, tipo: "junior" }; continue; }
    const linhas = await lerProva(c, id, cab, html);
    if (!linhas.length) { estado.vistos[id] = { nome: cab.nome, data: cab.data, tipo: "junior" }; continue; }
    juniores.push({ compid: id, cab, multi: cab.leaderboard, linhas });
  }
  // voltas já gravadas em leituras anteriores contam como vistas
  const anteriores = Object.entries(estado.vistos).filter(([, v]) => v.tipo === "lida" && v.roundids).map(([id, v]) => ({ compid: Number(id), multi: true, linhas: [{ roundids: v.roundids }], antiga: true }));
  const ficam = L.umaProvaPorVolta([...anteriores, ...juniores]).filter((p) => !p.antiga);
  const ficamIds = new Set(ficam.map((p) => p.compid));
  for (const p of juniores) if (!ficamIds.has(p.compid)) estado.vistos[p.compid] = { nome: p.cab.nome, data: p.cab.data, tipo: "coberta" };

  // mesmo nome (sem «Round N») e mesmo dia → um torneio
  const grupos = new Map();
  for (const p of ficam) {
    const k = `${L.semRonda(p.cab.nome).toLowerCase()}|${p.cab.data}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  }
  let gravados = 0;
  for (const grupo of grupos.values()) {
    grupo.sort((a, b) => a.compid - b.compid);
    const cid = grupo[0].compid;
    const file = path.join(OUT_DIR, `${c.id}_${grupo[0].cab.data}_${cid}.json`);
    const t = await montarTorneio(c, grupo);
    const marcar = (tipo) => { for (const p of grupo) estado.vistos[p.compid] = { nome: p.cab.nome, data: p.cab.data, tipo, ...(tipo === "lida" ? { roundids: p.linhas.flatMap((l) => l.roundids || []).filter(Boolean) } : {}) }; };
    if (!t) { out(c, `  · ${grupo[0].cab.data} ${grupo[0].cab.nome}: sem voltas de 18 buracos`); marcar("outro"); continue; }
    const n = t.divisions.reduce((s, d) => s + d.players.length, 0);
    out(c, `  ✓ ${t.startDate} ${t.tournament}: ${t.divisions.map((d) => `${d.division} ${d.players.length}`).join(" · ")} (${n})`);
    if (tem("--dry")) continue;
    const r = writeJsonGuarded(file, t, { count: (d) => d.divisions.reduce((s, x) => s + x.players.length, 0), maxDrop: 0.5, force: hasForceFlag(), spaces: 1, trailingNewline: true, failOnRefuse: true });
    if (r.written) gravados++;
    marcar("lida");
  }
  out(c, `  ${juniores.length} prova(s) de juniores lidas, ${grupos.size} torneio(s), ${abertas} provas abertas`);
  return { gravados };
}

async function main() {
  const scope = JSON.parse(fs.readFileSync(SCOPE, "utf8"));
  const hoje = hojeLisboa();
  const desde = Number(arg("--desde", hoje.slice(0, 4)));
  const so = arg("--condado", null);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // estado ilegível é erro (não «vazio»): sem ele relia-se tudo
  const estado = fs.existsSync(ESTADO) ? JSON.parse(fs.readFileSync(ESTADO, "utf8")) : { _doc: "Provas já vistas por condado (scrape-ig-condados.js): tipo outro/nada/coberta/lida não se voltam a pedir; junior = de juniores ainda sem resultados.", condados: {} };
  let gravados = 0, falhas = 0;
  const fila = scope.condados.filter((x) => !so || x.id === so);
  const trabalhador = async () => {
    for (let c = fila.shift(); c; c = fila.shift()) {
      try {
        // ⚠ ler o resultado antes de somar: «gravados += await …» perde contas com vários condados ao mesmo tempo
        const r = await lerCondado(c, desde, hoje, estado.condados);
        gravados += r.gravados;
      } catch (e) {
        falhas++;
        out(c, `  ✗ ${e.message}`);
      }
      console.log([`\n▸ ${c.nome} (${c.base})`, ...(c._log || [])].join("\n"));
      if (!tem("--dry")) writeJsonAtomic(ESTADO, estado);
    }
  };
  await Promise.all(Array.from({ length: PARALELO }, trabalhador));
  console.log(`\n${gravados} torneio(s) gravado(s)${falhas ? `, ${falhas} condado(s) com erro` : ""} · ${pedidos} pedidos.`);
  if (falhas) process.exitCode = 1;
  else if (!gravados && process.exitCode !== 1) process.exitCode = 2;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
