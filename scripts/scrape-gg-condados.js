/**
 * scripts/scrape-gg-condados.js — circuitos de juniores dos condados ingleses
 * no GolfGenius (BB&O Futures Tour, …) para o kids2 (03/11/2026).
 *
 * Para cada circuito de scripts/gg-condados-scope.json:
 *   1. lista as provas do «customer directory» (fetch_initial_data_for_directories);
 *   2. para cada prova já jogada, as classificações da página de resultados:
 *      «Gross - U14» são o resultado; «Net - U14» só servem para o handicap de
 *      jogo (Gross − Net — não é o HI, depende do campo);
 *   3. cartões buraco a buraco, par, tee, distâncias, CR e slope pelo motor do
 *      scrape-golfgenius-node.js (scrapeEdition + applyTeeCards). Distâncias em
 *      jardas só se convertem quando o scope diz `jardas: true`.
 *
 * Saída: public/data/gg-condados/{id}_{AAAA-MM-DD}.json (JobFile, um por prova)
 * → adapter scripts/aggregator/sources/ggcondados.js.
 * Uma prova já gravada não se volta a ler (os resultados de uma volta única não
 * mudam); --reler força.
 *
 * Uso:
 *   node scripts/scrape-gg-condados.js                 # todos os circuitos
 *   node scripts/scrape-gg-condados.js --circuito bbo  # só um
 *   node scripts/scrape-gg-condados.js --reler --dry
 * Exit: 0 = gravou · 2 = nada de novo · 1 = erro.
 */
const fs = require("fs");
const path = require("path");
const { writeJsonGuarded, hasForceFlag } = require("./lib/shrink-guard");
const { eventosDoDirectorio, classificarLeaderboard, linhasDe, hcpJogoPorNome, nomeDaProva, chaveNome, jardasParaMetros } = require("./lib/gg-condados");
const { scrapeEdition, ggGet, GG } = require("./scrape-fsga");
const { applyTeeCards } = require("./scrape-golfgenius-node");

const SCOPE = path.join(__dirname, "gg-condados-scope.json");
const OUT_DIR = path.resolve(__dirname, "../public/data/gg-condados");

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const tem = (n) => process.argv.includes(n);
// o ggGet já devolve o JSON lido quando se pede application/json
const comoJson = (x) => (typeof x === "string" ? JSON.parse(x) : x);
const hojeLisboa = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });

async function lerProva(ev, c) {
  const url = `${GG}/pages/${ev.resultsPageId}`;
  const widget = await ggGet(`${GG}/leagues/${ev.leagueId}/widgets/tournament_results?page_id=${ev.resultsPageId}`);
  const v2s = [...new Set([...widget.matchAll(/v2tournaments\/(\d+)/g)].map((m) => m[1]))];
  if (!v2s.length) return null;

  const porEscalao = new Map();
  for (const v of v2s) {
    const json = comoJson(await ggGet(`${GG}/v2tournaments/${v}`, "application/json"));
    const { tipo, escalao, saltar } = classificarLeaderboard(json?.event?.name);
    if (saltar) { console.log(`   ↷ ${json?.event?.name}: ${saltar} — fora`); continue; }
    const cur = porEscalao.get(escalao) || {};
    if (!cur[tipo]) cur[tipo] = { v2tid: v, linhas: linhasDe(json) };
    porEscalao.set(escalao, cur);
  }
  const ordem = (e) => parseInt(e.replace(/\D/g, ""), 10) || 99;
  const escaloes = [...porEscalao.entries()].filter(([, x]) => x.gross && x.gross.linhas.length)
    .sort((a, b) => ordem(a[0]) - ordem(b[0]));
  if (!escaloes.length) return null;

  // Sexo: o da classificação → o do nome da prova → a regra do scope
  // (`sexoPorProva`, só com o que o organizador diz). Sem nada, fica sem sexo.
  const sexoProva = /\bgirls?\b/i.test(ev.name) ? "F" : /\bboys?\b/i.test(ev.name) ? "M"
    : ((c.sexoPorProva || []).find((r) => new RegExp(r.re, "i").test(ev.name)) || {}).sexo || null;
  const rotulo = (e) => (/boys|girls/i.test(e) || !sexoProva ? e : `${sexoProva === "F" ? "Girls" : "Boys"} ${e}`);
  const out = await scrapeEdition({ name: nomeDaProva(ev.name, c), year: Number(ev.startDate.slice(0, 4)), divisions: escaloes.map(([e, x]) => ({ label: rotulo(e), v2tid: x.gross.v2tid })) }, { defaultCountry: null });
  await applyTeeCards(out);

  escaloes.forEach(([, x], i) => {
    const dv = out.divisions[i];
    const hcp = hcpJogoPorNome(x.gross.linhas, x.net?.linhas);
    const clube = new Map(x.gross.linhas.map((l) => [chaveNome(l.name), l.club]));
    dv.source = url;
    if (c.jardas) {
      if (dv.meters) dv.meters = jardasParaMetros(dv.meters);
      dv.distancias = "convertidas de jardas";
    }
    for (const p of dv.players) {
      const k = chaveNome(p.name);
      p.country = c.country || null;
      if (!p.club && clube.get(k)) p.club = clube.get(k);
      if (hcp.has(k)) p.hcpJogo = hcp.get(k);
      if (p.detailId) p.detailId = `${c.id}-${p.detailId}`;
      for (const r of p.rounds || []) {
        if (!r.date) r.date = ev.startDate;
        if (c.jardas && r.meters) r.meters = jardasParaMetros(r.meters);
      }
    }
  });
  // Voltas curtas (9 buracos, pitch & putt — par < 60) não se misturam com as de 18.
  const curtas = out.divisions.filter((dv) => dv.parTotal != null && dv.parTotal < 60);
  for (const dv of curtas) console.log(`   ↷ ${dv.division}: par ${dv.parTotal} — volta curta, fora`);
  out.divisions = out.divisions.filter((dv) => !curtas.includes(dv) && dv.players.length);
  if (!out.divisions.length) return null;
  return {
    _doc: `${c.nome} (${c.organizacao}) — GolfGenius. Resultado = Gross; hcpJogo = Gross − Net (handicap de jogo do dia, não o HI). Gerado por scripts/scrape-gg-condados.js.`,
    ...out,
    startDate: ev.startDate,
    endDate: ev.endDate || ev.startDate,
    course: out.course || (ev.courses[0] || "").replace(/\s*-\s*\d+$/, "").trim() || null,
    seriesId: `ggc-${c.id}`,
    seriesLabel: c.nome,
    organizacao: c.organizacao,
    source: url,
  };
}

async function main() {
  const scope = JSON.parse(fs.readFileSync(SCOPE, "utf8"));
  const so = arg("--circuito", null);
  const hoje = hojeLisboa();
  let gravados = 0, falhas = 0;
  for (const c of scope.circuitos.filter((x) => !so || x.id === so)) {
    console.log(`\n▸ ${c.nome}`);
    const filtro = new RegExp(c.filtro || ".", "i");
    const excluir = c.excluir ? new RegExp(c.excluir, "i") : null;
    const porId = new Map();
    for (const d of c.directorios) {
      // O directório vem em páginas de 20; a época escolhe-se pelo page_id.
      for (let pag = 1; pag <= 10; pag++) {
        const q = [d.pageId ? `page_id=${d.pageId}` : null, pag > 1 ? `page=${pag}` : null].filter(Boolean).join("&");
        const json = comoJson(await ggGet(`${GG}/leagues/${d.league}/v2_customer_directories/${d.directory}/fetch_initial_data_for_directories${q ? `?${q}` : ""}`, "application/json"));
        const evs = eventosDoDirectorio(json);
        const antes = porId.size;
        for (const e of evs) if (!porId.has(e.id)) porId.set(e.id, e);
        if (pag === 1) console.log(`  directório «${json?.misc?.directoryName || d.directory}»`);
        if (!evs.length || porId.size === antes || json?.misc?.noMoreData) break;
      }
    }
    const provas = [...porId.values()].filter((e) => filtro.test(e.name) && !(excluir && excluir.test(e.name)) && e.startDate && e.startDate <= hoje && e.resultsPageId)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    console.log(`  ${provas.length} provas já jogadas`);
    for (const ev of provas) {
      const file = path.join(OUT_DIR, `${c.id}_${ev.startDate}_${ev.id.slice(-6)}.json`);
      if (fs.existsSync(file) && !tem("--reler")) { console.log(`  · ${ev.startDate} ${ev.name}: já lida`); continue; }
      try {
        const prova = await lerProva(ev, c);
        if (!prova) { console.log(`  · ${ev.startDate} ${ev.name}: sem resultados`); continue; }
        const n = prova.divisions.reduce((s, d) => s + d.players.length, 0);
        const nh = prova.divisions.reduce((s, d) => s + d.players.filter((p) => p.hcpJogo != null).length, 0);
        console.log(`  ✓ ${ev.startDate} ${prova.tournament}: ${prova.divisions.map((d) => `${d.division} ${d.players.length}`).join(" · ")} · ${nh}/${n} com handicap de jogo`);
        if (tem("--dry")) continue;
        const r = writeJsonGuarded(file, prova, { count: (d) => d.divisions.reduce((s, x) => s + x.players.length, 0), maxDrop: 0.5, force: hasForceFlag(), spaces: 1, trailingNewline: true, failOnRefuse: true });
        if (r.written) gravados++;
      } catch (e) {
        falhas++;
        console.error(`  ✗ ${ev.startDate} ${ev.name}: ${e.message}`);
      }
    }
  }
  console.log(`\n${gravados} prova(s) gravada(s)${falhas ? `, ${falhas} falha(s)` : ""}.`);
  if (falhas) process.exitCode = 1;
  else if (!gravados && process.exitCode !== 1) process.exitCode = 2;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
