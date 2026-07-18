/**
 * build-classificacoes.js — Dados da página /FPG/classificacoes ("CLASSIFICAÇÕES")
 *
 * Ideia: os torneios a ranquear são os que TRÊS jogadores de referência
 * disputaram no ano (ANCHOR_FEDS). A carreira competitiva deles define, na
 * prática, o calendário juvenil que interessa seguir — sem lista curada à mão.
 *
 * Pipeline:
 *   1. Lê as voltas WHS dos âncoras (output/{fed}/analysis/data.json) e recolhe
 *      os (ccode|tcode) de torneios do ano.
 *   2. Procura a leaderboard COMPLETA desses torneios nos ficheiros já
 *      scrapeados (pull-torneios*, drive-data-*, aquapor-data-*). Torneios sem
 *      leaderboard ficam de fora — só temos lá as voltas dos nossos, o que
 *      falsearia o ranking.
 *   3. Descarta os torneios em EXCLUDE_RX (Drive Tour — circuito regional,
 *      colunas não comparáveis entre regiões; tem ranking próprio no PJA).
 *   4. Mantém apenas jogadores JÚNIORES (Sub-21 ou abaixo à data de hoje),
 *      resolvendo a DOB por players.json → federados.json.
 *   5. Escreve public/data/classificacoes.json no formato "fpg-pull" (o mesmo
 *      que a FPGPage/PJARankingView já consomem).
 *
 * CLI:
 *   node scripts/build-classificacoes.js            # ano corrente
 *   node scripts/build-classificacoes.js --year 2025
 *   node scripts/build-classificacoes.js --min-anchors 2   # só torneios com ≥2 âncoras
 */
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const OUTPUT_DIR = path.join(ROOT, "output");
const OUT_FILE = path.join(DATA_DIR, "classificacoes.json");

/** Jogadores de referência que definem o calendário a considerar. */
const ANCHOR_FEDS = [
  { fed: "49124", name: "Nuno Palmares Jr." },
  { fed: "42908", name: "Santiago Dias" },
  { fed: "43732", name: "João Setúbal" },
];

/** Escalão máximo incluído (Sub-21 = 21 anos ou menos hoje). */
const MAX_JUNIOR_AGE = 21;

/** Torneios excluídos do ranking mesmo quando um âncora lá jogou.
 *  Drive Tour: circuito regional (Tejo/Norte/Madeira/Sul/Açores) — cada miúdo
 *  só disputa a sua região, portanto as colunas nunca são comparáveis entre
 *  jogadores de regiões diferentes. Tem ranking próprio no /FPG/rankingPJA. */
const EXCLUDE_RX = [
  /Drive\s+Tour/i,
];

const argv = process.argv.slice(2);
const argOf = (flag, def) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const YEAR = argOf("--year", String(new Date().getFullYear()));
const MIN_ANCHORS = parseInt(argOf("--min-anchors", "1"), 10);

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

/** "DD-MM-YYYY" → "YYYY-MM-DD" (as voltas WHS guardam no formato PT). */
function toIso(d) {
  if (!d) return "";
  const m = String(d).match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(d).slice(0, 10);
}

/** Escalão FPG pela coorte de ano de nascimento (espelha escalaoAtDate). */
function escalaoAtDate(dob, dateOrYear) {
  if (!dob || !dateOrYear) return null;
  const anoNasc = parseInt(String(dob).slice(0, 4), 10);
  const anoRef = parseInt(String(dateOrYear).slice(0, 4), 10);
  if (isNaN(anoNasc) || isNaN(anoRef)) return null;
  const idade = anoRef - anoNasc;
  if (idade < 0) return null;
  if (idade <= 10) return "Sub 10";
  if (idade <= 12) return "Sub 12";
  if (idade <= 14) return "Sub 14";
  if (idade <= 16) return "Sub 16";
  if (idade <= 18) return "Sub 18";
  if (idade <= 21) return "Sub 21";
  if (idade <= 24) return "Sub 24";
  if (idade <= 49) return "Absoluto";
  if (idade <= 69) return "Sénior";
  return "Super Sénior";
}

/* ── 1. Torneios do ano disputados pelos âncoras ─────────────────── */
function collectAnchorTournaments() {
  const found = new Map(); // "ccode|tcode" → { anchors:Set, name, date }
  for (const a of ANCHOR_FEDS) {
    const p = path.join(OUTPUT_DIR, a.fed, "analysis", "data.json");
    const d = readJsonSafe(p);
    if (!d) { console.warn(`  ⚠ sem dados para ${a.name} (${a.fed}) — ${p}`); continue; }
    let n = 0;
    for (const c of d.DATA || []) {
      for (const r of c.rounds || []) {
        if (r.scoreOrigin !== "Torn") continue;
        if (!r.tcode || r.ccode == null) continue;
        if (/^0+$/.test(String(r.tcode))) continue;
        if (/transfer[eê]ncia|altera[çc][aã]o de handicap|revis[aã]o de handicap/i.test(r.eventName || "")) continue;
        const iso = toIso(r.date);
        if (!iso.startsWith(YEAR)) continue;
        const key = `${r.ccode}|${r.tcode}`;
        let e = found.get(key);
        if (!e) { e = { ccode: String(r.ccode), tcode: String(r.tcode), anchors: new Set(), date: iso }; found.set(key, e); }
        e.anchors.add(a.fed);
        if (iso < e.date) e.date = iso;
        n++;
      }
    }
    console.log(`  ${a.name.padEnd(20)} ${String(n).padStart(4)} voltas em ${YEAR}`);
  }
  return found;
}

/* ── 2. Leaderboards completas já scrapeadas ─────────────────────── */
function loadScrapedTournaments() {
  const byKey = new Map();
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (!/^(pull-torneios\d+\.json|drive-data-\d{4}-\d{2}\.json|aquapor-data-\d{4}-\d{2}\.json)$/.test(f)) continue;
    const d = readJsonSafe(path.join(DATA_DIR, f));
    for (const t of (d && d.tournaments) || []) {
      const key = `${t.ccode}|${t.tcode}`;
      const prev = byKey.get(key);
      // Preferir a versão com mais jogadores (ficheiros sobrepõem-se).
      if (!prev || (t.players || []).length > (prev._t.players || []).length) {
        byKey.set(key, { _t: t, _src: f });
      }
    }
  }
  return byKey;
}

/* ── 3. DOB por fedCode ──────────────────────────────────────────── */
function buildDobIndex() {
  const dob = new Map();
  const sex = new Map();
  const club = new Map();
  const fed = readJsonSafe(path.join(DATA_DIR, "federados.json"));
  for (const p of (fed && fed.players) || []) {
    const code = String(p.federation_code || "");
    if (!code) continue;
    if (p.birthdate) dob.set(code, String(p.birthdate).slice(0, 10));
    if (p.gender) sex.set(code, p.gender);
    if (p.acronym || p.club_name) club.set(code, p.acronym || p.club_name);
  }
  // players.json tem precedência (dados curados dos nossos jogadores).
  const pl = readJsonSafe(path.join(DATA_DIR, "players.json")) || {};
  for (const [code, p] of Object.entries(pl)) {
    if (p && p.dob) dob.set(String(code), String(p.dob).slice(0, 10));
    if (p && p.sex) sex.set(String(code), p.sex);
    if (p && p.club) club.set(String(code), typeof p.club === "object" ? p.club.short : p.club);
  }
  return { dob, sex, club };
}

/* ── main ────────────────────────────────────────────────────────── */
function main() {
  console.log(`\n📊 CLASSIFICAÇÕES ${YEAR} — torneios dos jogadores de referência\n`);

  const anchorTourns = collectAnchorTournaments();
  console.log(`\n  União: ${anchorTourns.size} torneios em ${YEAR}`);

  const scraped = loadScrapedTournaments();
  const { dob, sex, club } = buildDobIndex();
  const todayYear = new Date().getFullYear();

  const out = [];
  let semLeaderboard = 0, semAnchors = 0, excluidos = 0;
  let totalLinhas = 0, juniores = 0, semDob = 0;

  for (const e of [...anchorTourns.values()].sort((a, b) => b.date.localeCompare(a.date))) {
    if (e.anchors.size < MIN_ANCHORS) { semAnchors++; continue; }
    const hit = scraped.get(`${e.ccode}|${e.tcode}`);
    if (!hit) { semLeaderboard++; continue; }
    const t = hit._t;
    if (EXCLUDE_RX.some((rx) => rx.test(t.name || ""))) { excluidos++; continue; }

    const players = [];
    for (const p of t.players || []) {
      totalLinhas++;
      const fedCode = String(p.fedCode || p.fed || "");
      const d = fedCode ? dob.get(fedCode) : null;
      if (!d) { semDob++; continue; }           // sem DOB não dá para saber se é júnior
      const idadeHoje = todayYear - parseInt(d.slice(0, 4), 10);
      if (!(idadeHoje >= 0 && idadeHoje <= MAX_JUNIOR_AGE)) continue;
      juniores++;
      // Payload slim: o ranking só precisa de gross + par por ronda. Os
      // scorecards buraco-a-buraco (scores/si/meters) ficam de fora — para o
      // detalhe de um torneio a FPGPage já tem a fonte original.
      const roundScores = (p.roundScores || []).map((rs) => ({
        round: rs.round,
        gross: rs.gross,
        parTotal: (rs.pars || []).reduce((a, b) => a + (b || 0), 0) || null,
        teeName: rs.teeName || undefined,
      }));
      players.push({
        scoreId: p.scoreId,
        pos: p.pos,
        name: p.name,
        grossTotal: p.grossTotal,
        toPar: p.toPar,
        parTotal: p.parTotal,
        nholes: p.nholes,
        hcpExact: p.hcpExact,
        teeName: p.teeName,
        roundScores: roundScores.length ? roundScores : undefined,
        fedCode,
        // Escalão À DATA do torneio (o mesmo miúdo muda de escalão ao longo dos anos).
        escalao: escalaoAtDate(d, t.date || e.date) || p.escalao || "",
        sex: p.sex || sex.get(fedCode) || "",
        club: p.club || club.get(fedCode) || "",
        _dob: d,
      });
    }
    if (!players.length) continue;

    out.push({
      ...t,
      players,
      date: t.date || e.date,
      _anchors: [...e.anchors],
      _sourceFile: hit._src,
    });
  }

  const payload = {
    generated: new Date().toISOString(),
    year: YEAR,
    source: "build-classificacoes.js",
    anchors: ANCHOR_FEDS,
    maxJuniorAge: MAX_JUNIOR_AGE,
    tournaments: out,
  };
  writeJsonAtomic(OUT_FILE, payload);

  const nPlayers = new Set();
  for (const t of out) for (const p of t.players) nPlayers.add(p.fedCode);

  console.log(`\n  Torneios ranqueados: ${out.length}`);
  console.log(`   ↳ descartados: ${semLeaderboard} sem leaderboard completa` +
              (excluidos ? `, ${excluidos} excluídos por regra (Drive Tour)` : "") +
              (semAnchors ? `, ${semAnchors} abaixo de --min-anchors` : ""));
  console.log(`  Linhas de jogador: ${totalLinhas} → ${juniores} juniores (${semDob} sem DOB conhecida)`);
  console.log(`  Juniores distintos: ${nPlayers.size}`);
  console.log(`\n  ✔ ${path.relative(ROOT, OUT_FILE)} (${(fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(1)} MB)\n`);
}

main();
