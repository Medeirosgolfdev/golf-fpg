/**
 * scripts/scrape-ffgolf-gg-teesheet.js
 *
 * Tee sheet ("Départs") dos torneios FFG hospedados no GolfGenius — Node puro,
 * sem browser (o GG devolve 403 a browsers automatizados, responde a fetch).
 *
 * O que traz, que o leaderboard NÃO tem:
 *   - HANDICAP de cada jogador (o leaderboard publica hcp: null)
 *   - DRAWS por ronda: hora de saída, tee e parceiros de jogo
 *   - A lista REAL de rondas do evento, com datas (incl. rondas ainda por jogar)
 *
 * Fluxo (tudo por GET):
 *   1. /pages/{gg_page} → ids das páginas irmãs do evento
 *   2. a página cujo título é "… :: Départs" usa o widget `next_round`
 *   3. /leagues/{lid}/widgets/next_round?page_id=… → <option> por ronda
 *      (round_id + label com data, ex: "Qualification T2 (Tue, July 21)")
 *   4. por ronda: mesmo widget com &round_id=… → tabela de saídas
 *
 * Escreve em public/data/ffgolf/{year}_{slug}.json:
 *   - `draws[]`   — uma entrada por ronda (mesmo que ainda sem jogadores)
 *   - `players[].hcp` — preenchido por nome normalizado
 *
 * Não apaga nada: se uma ronda ainda não tem draw publicado, fica com
 * `groups: []` e o que já existia mantém-se.
 *
 * USO:
 *   node scripts/scrape-ffgolf-gg-teesheet.js --slug championnat-... --year 2026
 *   node scripts/scrape-ffgolf-gg-teesheet.js --year 2026        # todos os do ano
 *   node scripts/scrape-ffgolf-gg-teesheet.js --live             # só eventos a decorrer
 *
 * Exit codes: 0 = gravou algo, 2 = nada novo, 1 = erro.
 */
const fs = require("fs");
const path = require("path");
const { ggGet, GG } = require("./scrape-fsga.js");
const { writeJsonAtomic } = require("./lib/atomic-write.js");

const OUT_DIR = path.resolve(__dirname, "../public/data/ffgolf");
const CATALOG_PATH = path.resolve(__dirname, "../public/data/ffgolf-catalog.json");

const args = process.argv.slice(2);
const getArg = (n, d = null) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };
const yearArg = getArg("year") ? parseInt(getArg("year"), 10) : null;
const slugArg = getArg("slug");
const liveOnly = args.includes("--live");

/* ── helpers de HTML ─────────────────────────────────────────────── */
const stripTags = (s) => String(s).replace(/<[^>]+>/g, " ");
const decode = (s) =>
  String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
const clean = (s) => decode(stripTags(s)).replace(/\s+/g, " ").trim();

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
/** "Qualification T2 (Tue, July 21)" + ano → "2026-07-21". */
function isoFromLabel(label, year) {
  const m = String(label).match(/([A-Za-z]+)\s+(\d{1,2})\s*\)?\s*$/);
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  if (!mon) return null;
  return `${year}-${String(mon).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

const normName = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
/** "RUBAL Alexandre" e "Alexandre Rubal" batem: comparamos o multiset de tokens. */
const nameKey = (s) => normName(s).split(" ").filter(Boolean).sort().join(" ");

/* ── passo 1+2: encontrar a página "Départs" do evento ───────────── */
async function findTeeSheetPage(ggPage) {
  const html = await ggGet(`${GG}/pages/${ggPage}`);
  const ids = [...new Set((html.match(/\/pages\/(\d+)/g) || []).map((s) => s.split("/").pop()))]
    .filter((id) => id !== String(ggPage));
  for (const id of ids) {
    let h;
    try { h = await ggGet(`${GG}/pages/${id}`); } catch { continue; }
    if (!/widgets\/next_round/.test(h)) continue;
    const lid = (h.match(/\/leagues\/(\d+)\/widgets\/next_round/) || [])[1] || null;
    return { pageId: id, lid };
  }
  return null;
}

/* ── passo 3: lista de rondas ────────────────────────────────────── */
async function listRounds(lid, pageId, year) {
  const html = await ggGet(`${GG}/leagues/${lid}/widgets/next_round?page_id=${pageId}`);
  const out = [];
  for (const m of html.matchAll(/<option[^>]*value=["']([^"']*round_id=(\d+)[^"']*)["'][^>]*>([^<]*)</g)) {
    const label = clean(m[3]);
    if (!label) continue;
    out.push({ roundId: m[2], label, dateIso: isoFromLabel(label, year) });
  }
  // Sem <select> (evento de 1 ronda) o widget já é a própria ronda.
  if (!out.length) out.push({ roundId: null, label: null, dateIso: null, _inline: html });
  return out;
}

/* ── passo 4: parse da tabela de saídas de UMA ronda ─────────────── */
function parseTeeSheet(html) {
  // Cabeçalho: "Golf du Gouverneur - Montaplan CFJ 2026 / Jaunes"
  const hdr = html.match(/<tr class='do_not_hide'[^>]*>[\s\S]*?<h5>[\s\S]*?<center>([\s\S]*?)<\/center>/);
  let course = null, tee = null;
  if (hdr) {
    const txt = clean(hdr[1]);
    const slash = txt.lastIndexOf("/");
    if (slash > 0) { course = txt.slice(0, slash).trim(); tee = txt.slice(slash + 1).trim(); }
    else course = txt;
  }
  const roundDate = clean((html.match(/<div class='round_date'>([\s\S]*?)<\/div>/) || [])[1] || "") || null;

  const groups = [];
  // Cada <tr class='search_rows'> traz PARES (hora, jogadores) — o GG mostra
  // dois grupos por linha em ecrã largo.
  for (const row of html.matchAll(/<tr class='search_rows[^']*'[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tds = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    for (let i = 0; i + 1 < tds.length; i += 2) {
      const teeTime = clean(tds[i]);
      if (!/^\d{1,2}:\d{2}$/.test(teeTime)) continue;
      const players = [];
      for (const pm of tds[i + 1].matchAll(/<div class='players_portrait'>([\s\S]*?)<div class='clearfix'>/g)) {
        const chunk = pm[1];
        const teeAbbr = clean((chunk.match(/<span class='tee_abbr'>([\s\S]*?)<\/span>/) || [])[1] || "") || null;
        const club = clean((chunk.match(/<span class='affiliation_portrait'>([\s\S]*?)<\/span>/) || [])[1] || "") || null;
        // O nome fica antes do primeiro <span>; o hcp vem entre parênteses.
        const head = clean(chunk.split("<span")[0]);
        const hm = head.match(/^(.*?)\s*\(([+-]?\d+(?:\.\d+)?)\)\s*$/);
        const name = (hm ? hm[1] : head).trim();
        if (!name) continue;
        players.push({ name, hcp: hm ? parseFloat(hm[2]) : null, club, tee: teeAbbr });
      }
      if (players.length) groups.push({ teeTime, players });
    }
  }
  // ⚠ O GG serve a MESMA tabela duas vezes (layout desktop `hidden-xs` +
  // layout mobile), por isso cada grupo aparece a dobrar. Desduplicar pela
  // assinatura completa (hora + nomes) e não só pela hora: duas partidas
  // distintas podem sair à mesma hora em tees diferentes.
  const seen = new Set();
  const uniq = groups.filter((g) => {
    const k = `${g.teeTime}|${g.players.map((p) => p.name).join("~")}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { course, tee, roundDate, groups: uniq };
}

/* ── orquestração por torneio ────────────────────────────────────── */
async function scrapeOne(meta) {
  const outPath = path.join(OUT_DIR, `${meta.year}_${meta.slug}.json`);
  if (!fs.existsSync(outPath)) {
    console.log(`   skip ${meta.slug}: sem ficheiro de resultados`);
    return false;
  }
  const data = JSON.parse(fs.readFileSync(outPath, "utf-8"));

  const found = await findTeeSheetPage(meta.gg_page);
  if (!found) { console.log(`   ${meta.slug}: sem página Départs`); return false; }
  const { pageId, lid } = found;

  const rounds = await listRounds(lid, pageId, meta.year);
  console.log(`   ${rounds.length} ronda(s) na tee sheet`);

  const draws = [];
  const hcpByName = new Map();
  for (const [i, r] of rounds.entries()) {
    let html = r._inline;
    if (!html) {
      html = await ggGet(`${GG}/leagues/${lid}/widgets/next_round?page_id=${pageId}&round_id=${r.roundId}`);
    }
    const parsed = parseTeeSheet(html);
    const nPlayers = parsed.groups.reduce((s, g) => s + g.players.length, 0);
    draws.push({
      round: i + 1,
      roundId: r.roundId,
      label: r.label || parsed.roundDate,
      dateIso: r.dateIso,
      course: parsed.course,
      tee: parsed.tee,
      groups: parsed.groups,
    });
    for (const g of parsed.groups) {
      for (const p of g.players) {
        if (typeof p.hcp === "number" && !hcpByName.has(nameKey(p.name))) hcpByName.set(nameKey(p.name), p.hcp);
      }
    }
    console.log(`     R${i + 1} ${r.label || ""} — ${parsed.groups.length} grupos, ${nPlayers} jogadores${nPlayers ? "" : " (draw ainda não publicado)"}`);
  }

  // Preencher hcp nos jogadores do leaderboard (por nome normalizado).
  let nHcp = 0;
  for (const p of data.players || []) {
    if (p.hcp != null) continue;
    const h = hcpByName.get(nameKey(p.name));
    if (typeof h === "number") { p.hcp = h; nHcp++; }
  }

  data.draws = draws;
  data.teeSheetPage = pageId;
  data.teeSheetScrapedAt = new Date().toISOString();
  writeJsonAtomic(outPath, data);
  console.log(`   💾 ${meta.year}_${meta.slug}: ${draws.length} rondas · ${nHcp} handicaps preenchidos`);
  return true;
}

(async () => {
  const cat = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  let list = (cat.tournaments || []).filter((t) => t.gg_page);
  if (slugArg) list = list.filter((t) => t.slug === slugArg);
  if (yearArg) list = list.filter((t) => t.year === yearArg);
  if (liveOnly) {
    // "A decorrer" = já começou e ainda não passaram 2 dias do fim conhecido.
    const hoje = new Date().toISOString().slice(0, 10);
    list = list.filter((t) => {
      const f = path.join(OUT_DIR, `${t.year}_${t.slug}.json`);
      if (!fs.existsSync(f)) return false;
      let d; try { d = JSON.parse(fs.readFileSync(f, "utf-8")); } catch { return false; }
      const ini = d.dateStart, fim = (d.draws || []).map((r) => r.dateIso).filter(Boolean).sort().pop() || d.dateEnd;
      return ini && ini <= hoje && (!fim || fim >= hoje);
    });
  }
  if (!list.length) { console.error("❌ Nenhum torneio para processar"); process.exit(1); }

  console.log(`🇫🇷 FFG tee sheet (GolfGenius) — ${list.length} torneio(s)\n`);
  let ok = 0, err = 0;
  for (const meta of list) {
    console.log(`🏌️  ${meta.title || meta.slug}`);
    try { if (await scrapeOne(meta)) ok++; }
    catch (e) { err++; console.error(`   ❌ ${meta.slug}: ${e.message}`); }
  }
  console.log(`\n✅ Gravados: ${ok} · Erros: ${err}`);
  process.exit(err && !ok ? 1 : ok ? 0 : 2);
})();
