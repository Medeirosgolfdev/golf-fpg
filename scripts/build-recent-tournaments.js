#!/usr/bin/env node
/**
 * build-recent-tournaments.js
 *
 * Reconstrói uma listagem de torneios RECENTES a partir das voltas dos
 * "nossos" jogadores (todos os `output/{fed}/analysis/data.json`), SEM
 * precisar de scrapear o leaderboard completo de cada torneio.
 *
 * Ideia: cada volta WHS de um jogador traz `eventName`, `ccode`/`tcode`,
 * data, gross, par, tee e o scorecard buraco-a-buraco (via `HOLES[scoreId]`).
 * Agrupando por torneio (ccode|tcode) e juntando todos os nossos jogadores
 * que lá aparecem, obtemos "quem dos nossos jogou + a pontuação" — uma
 * reconstrução parcial do torneio. Torneios onde MUITOS dos nossos jogaram
 * são bons candidatos a scrapear a sério para ter o quadro completo.
 *
 * Output: `public/data/recent-tournaments.json` no formato "fpg-pull"
 * (tournaments[].players[].roundScores[]) — o MESMO que a FPGPage/DrivePage
 * consomem, para reutilizar os componentes de leaderboard tal e qual.
 *
 * Cada torneio ganha:
 *   - `scraped`: já existe leaderboard completa (pull-torneios/drive/aquapor/jovens)?
 *   - `nOurs`:   quantos dos nossos jogadores lá jogaram (sinal de prioridade)
 *
 * Uso:
 *   node scripts/build-recent-tournaments.js               # desde SINCE default
 *   node scripts/build-recent-tournaments.js --since 2024-06-01
 *   node scripts/build-recent-tournaments.js --min-ours 2  # só ≥2 nossos
 *   node scripts/build-recent-tournaments.js --all-origins # inclui Indiv/EDS/…
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "output");
const DATA_DIR = path.join(ROOT, "public", "data");
const ARCHIVE_DIR = path.join(ROOT, "data-archive");

/* ── args ─────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const SINCE = getArg("--since", "2024-01-01");           // janela temporal (start)
const MIN_OURS = Number(getArg("--min-ours", "1"));      // mínimo de nossos por torneio
const ALL_ORIGINS = args.includes("--all-origins");      // incluir origens não-Torn
const SINCE_MS = new Date(SINCE + "T00:00:00Z").getTime();

/* ── lookups de nome/clube/dob ────────────────────────────────── */
const readJsonSafe = (p) => {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
};
const readData = (f) => {
  const primary = path.join(DATA_DIR, f);
  const fallback = path.join(ARCHIVE_DIR, f);
  return readJsonSafe(fs.existsSync(primary) ? primary : fallback);
};

function buildPlayerLookup() {
  const name = {};
  const club = {};   // fed -> { short, long }
  const dob = {};
  const sex = {};
  const hcp = {};

  // 1. players.json (nome curado)
  const players = readData("players.json");
  if (players && typeof players === "object") {
    for (const [k, v] of Object.entries(players)) {
      if (v && typeof v === "object") {
        if (v.name && v.name !== k && !/^\d+$/.test(String(v.name).trim())) name[k] = v.name;
        if (v.dob) dob[k] = v.dob;
        if (v.sex === "M" || v.sex === "F") sex[k] = v.sex;
      }
    }
  }

  // 2. federados.json + federados-inativos.json (nome/clube/dob/sexo/hcp)
  for (const file of ["federados.json", "federados-inativos.json"]) {
    const doc = readData(file);
    if (!doc) continue;
    const list = Array.isArray(doc) ? doc : (doc.players || []);
    for (const p of list) {
      const code = p && p.federation_code;
      if (!code) continue;
      const nm = p.name ? String(p.name).replace(/^\s+/, "").trim() : "";
      if (nm && !(code in name)) name[code] = nm;
      if (!(code in club) && (p.club_name || p.acronym)) {
        club[code] = { short: p.acronym || p.club_name || "", long: p.club_name || p.acronym || "" };
      }
      if (p.birthdate && !(code in dob)) dob[code] = p.birthdate;
      if (!(code in sex) && (p.gender === "M" || p.gender === "F")) sex[code] = p.gender;
      if (!(code in hcp) && typeof p.hcp_exact === "number" && p.hcp_exact < 54) hcp[code] = p.hcp_exact;
    }
  }
  return { name, club, dob, sex, hcp };
}

/* ── conjunto de torneios já scrapeados (leaderboard completa) ── */
function buildScrapedSet() {
  const set = new Set();
  const files = fs.readdirSync(DATA_DIR).filter(
    (f) => /^(pull-torneios|drive-data|aquapor-data|jovens_)/.test(f) && f.endsWith(".json")
  );
  for (const f of files) {
    const d = readJsonSafe(path.join(DATA_DIR, f));
    if (!d) continue;
    const ts = d.tournaments || d.torneios || (Array.isArray(d) ? d : []);
    for (const t of ts) {
      if (t && t.ccode != null && t.tcode != null) {
        set.add(String(t.ccode) + "|" + String(t.tcode));
      }
    }
  }
  return set;
}

/* ── data "DD-MM-YYYY" → ISO "YYYY-MM-DD" (formato pull-torneios) ─
 * As voltas WHS trazem a data em DD-MM-YYYY; a app (fmtDate) e os
 * componentes de leaderboard esperam ISO como o pull-torneios. */
function toIsoDate(s) {
  if (!s) return "";
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s).trim());
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

/* ── limpeza do nome do torneio (tira marcadores de dia/ronda) ── */
function cleanTournName(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  // sufixos de dia/ronda: " D3", " R2", " - Dia 2", " Dia 2", " (Volta 3)", " V3"
  s = s.replace(/\s*[-–]?\s*(dia|volta|round|ronda|day)\s*\d+\s*$/i, "");
  s = s.replace(/\s+[DRV]\d+\s*$/i, "");
  // Gralhas conhecidas da fonte FPG (WHS) — reaparecem a cada scrape dos
  // jogadores, por isso normalizam-se aqui (durável entre rebuilds).
  s = s.replace(/\bWorld Kis\b/g, "World Kids");
  return s.trim();
}

/* ── main ─────────────────────────────────────────────────────── */
function main() {
  const t0 = Date.now();
  const lk = buildPlayerLookup();
  const scraped = buildScrapedSet();

  const feds = fs.readdirSync(OUTPUT_DIR).filter((f) => /^\d+$/.test(f));

  // tourns: key ccode|tcode -> { ccode, tcode, names:Map<name,count>, campos:Map,
  //   dateSortMax, byPlayer: Map<fed, [rounds]> }
  const tourns = new Map();
  let scanned = 0, parseErr = 0;

  for (const fed of feds) {
    const p = path.join(OUTPUT_DIR, fed, "analysis", "data.json");
    if (!fs.existsSync(p)) continue;
    const d = readJsonSafe(p);
    if (!d) { parseErr++; continue; }
    scanned++;
    if (!Array.isArray(d.DATA)) continue;
    const HOLES = d.HOLES || {};

    for (const c of d.DATA) {
      if (!Array.isArray(c.rounds)) continue;
      for (const r of c.rounds) {
        if (!ALL_ORIGINS && r.scoreOrigin !== "Torn") continue;
        if (!r.tcode || r.tcode === "999999" || r.ccode == null) continue;
        // Entradas administrativas WHS que passam como "Torn" mas não são
        // torneios: tcode só zeros ("000000000") ou nome de acto federativo.
        if (/^0+$/.test(String(r.tcode))) continue;
        if (/transfer[eê]ncia|altera[çc][aã]o de handicap|revis[aã]o de handicap/i.test(r.eventName || "")) continue;
        if (!(r.dateSort >= SINCE_MS)) continue;

        const key = String(r.ccode) + "|" + String(r.tcode);
        let t = tourns.get(key);
        if (!t) {
          t = {
            ccode: String(r.ccode), tcode: String(r.tcode),
            names: new Map(), campos: new Map(),
            dateSortMax: 0, dateSortMin: Infinity, dateMin: r.date,
            byPlayer: new Map(),
          };
          tourns.set(key, t);
        }
        const cn = cleanTournName(r.eventName);
        t.names.set(cn, (t.names.get(cn) || 0) + 1);
        if (r.course) t.campos.set(r.course, (t.campos.get(r.course) || 0) + 1);
        if (r.dateSort > t.dateSortMax) t.dateSortMax = r.dateSort;
        if (r.dateSort < t.dateSortMin) { t.dateSortMin = r.dateSort; t.dateMin = r.date; }

        let arr = t.byPlayer.get(fed);
        if (!arr) { arr = []; t.byPlayer.set(fed, arr); }
        const hole = HOLES[r.scoreId] || {};
        arr.push({
          scoreId: r.scoreId,
          date: r.date, dateSort: r.dateSort,
          gross: r.gross, parTotal: r.par,
          holeCount: r.holeCount || (hole.g ? hole.g.length : 18),
          tee: r.tee || "",
          sd: r.sd, hi: r.hi,
          hasCard: !!r.hasCard,
          scores: hole.g || [], pars: hole.p || [], si: hole.si || [], meters: hole.m || [],
        });
      }
    }
  }

  /* ── montar tournaments no formato fpg-pull ─────────────────── */
  const pickTop = (m) => {
    let best = "", n = -1;
    for (const [k, v] of m) if (v > n) { n = v; best = k; }
    return best;
  };
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

  const out = [];
  for (const t of tourns.values()) {
    const nOurs = t.byPlayer.size;
    if (nOurs < MIN_OURS) continue;

    const players = [];
    for (const [fed, rounds] of t.byPlayer) {
      rounds.sort((a, b) => a.dateSort - b.dateSort);
      const roundScores = rounds.map((rd, i) => ({
        round: i + 1,
        gross: num(rd.gross) ?? 0,
        scores: rd.scores.slice(0, 18),
        pars: rd.pars.slice(0, 18),
        si: rd.si.slice(0, 18),
        meters: rd.meters.slice(0, 18),
        teeName: rd.tee,
        sd: num(rd.sd),
        date: toIsoDate(rd.date),
        hasCard: rd.hasCard,
      }));
      // totais só sobre rondas válidas (gross real)
      const valid = rounds.filter((rd) => num(rd.gross) != null && rd.gross > 0 && rd.gross < 999);
      const roundPar = (rd) => num(rd.parTotal) || (rd.pars.reduce((a, b) => a + b, 0)) || 0;
      const grossTotal = valid.reduce((s, rd) => s + rd.gross, 0);
      // parTotal = par de UMA ronda (convenção pull-torneios; os componentes
      // de leaderboard multiplicam por nº de rondas para o acumulado).
      const parTotal = roundPar(valid[0] || rounds[0]);
      // toPar = total real (soma por ronda; robusto a pars diferentes por dia).
      const toPar = valid.length ? valid.reduce((s, rd) => s + (rd.gross - roundPar(rd)), 0) : null;
      const lastHi = rounds[rounds.length - 1]?.hi;

      players.push({
        scoreId: String(rounds[0].scoreId),
        fed, fedCode: fed,
        name: lk.name[fed] || fed,
        club: lk.club[fed]?.short || "",
        sex: lk.sex[fed] || null,
        dob: lk.dob[fed] || null,
        hcpExact: num(typeof lastHi === "number" ? lastHi : parseFloat(lastHi)) ?? lk.hcp[fed] ?? null,
        pos: null,
        grossTotal: grossTotal || null,
        parTotal: parTotal || null,
        toPar,
        nholes: rounds[0].holeCount,
        teeName: roundScores[0].teeName,
        // Sem duplicação flat de scores/par/si/meters — os componentes de
        // leaderboard (fillBlankHoles / AllRoundsScorecardLB) já lêem de
        // roundScores[0], e duplicar dobrava o tamanho do ficheiro.
        roundScores,
      });
    }

    // posição ENTRE OS NOSSOS (ranking parcial) — por gross total asc
    const ranked = players
      .filter((p) => typeof p.grossTotal === "number")
      .sort((a, b) => a.grossTotal - b.grossTotal);
    ranked.forEach((p, i) => { p.pos = i + 1; });

    const rounds = Math.max(1, ...[...t.byPlayer.values()].map((a) => a.length));
    const key = t.ccode + "|" + t.tcode;
    out.push({
      name: pickTop(t.names) || `Torneio ${t.tcode}`,
      ccode: t.ccode, tcode: t.tcode,
      date: toIsoDate(t.dateMin),
      dateSort: t.dateSortMax,
      campo: pickTop(t.campos) || "",
      rounds,
      scraped: scraped.has(key),
      nOurs,
      playerCount: players.length,
      players,
    });
  }

  /* ── Preservar o que já foi recolhido (2026-09-06) ──────────────────────
   * Este ficheiro é reconstruído DO ZERO a partir de `output/{fed}/`, por
   * isso encolhia sempre que o universo de jogadores seguidos encolhe (ver
   * `scripts/prune-player-scope.js`): a passagem de 673 → 179 jogadores
   * levava 48% das participações e deixava 1219 dos 3004 torneios sem
   * ninguém. Um torneio jogado não deixa de ter acontecido — as
   * participações de quem já não é seguido ficam, congeladas. `--rebuild`
   * força reconstrução limpa. */
  const outPath = path.join(DATA_DIR, "recent-tournaments.json");
  const REBUILD = process.argv.includes("--rebuild");
  const FORCE   = process.argv.includes("--force");
  let presJog = 0, presTorn = 0;
  if (!REBUILD && fs.existsSync(outPath)) {
    try {
      const antigos = JSON.parse(fs.readFileSync(outPath, "utf8")).tournaments || [];
      const porChave = new Map(out.map((t) => [t.ccode + "|" + t.tcode, t]));
      for (const velho of antigos) {
        const chave = velho.ccode + "|" + velho.tcode;
        const novo = porChave.get(chave);
        if (!novo) { out.push(velho); porChave.set(chave, velho); presTorn++; continue; }
        const vistos = new Set((novo.players || []).map((p) => String(p.scoreId)));
        for (const p of velho.players || []) {
          if (vistos.has(String(p.scoreId))) continue;   // o build novo manda
          novo.players.push(p); presJog++;
        }
        // Reordenar a posição ENTRE OS NOSSOS com o conjunto completo.
        novo.players
          .filter((p) => typeof p.grossTotal === "number")
          .sort((a, b) => a.grossTotal - b.grossTotal)
          .forEach((p, i) => { p.pos = i + 1; });
        novo.playerCount = novo.players.length;
        novo.nOurs = novo.players.length;
      }
    } catch { /* ficheiro corrompido — segue com o build novo */ }
  }

  out.sort((a, b) => (b.dateSort || 0) - (a.dateSort || 0));

  /* Guarda anti-encolhimento (mesma do build-course-players): recusa escrever
   * um ficheiro que perca >30% dos torneios face ao que está em disco. */
  if (!FORCE && fs.existsSync(outPath)) {
    try {
      const antes = (JSON.parse(fs.readFileSync(outPath, "utf8")).tournaments || []).length;
      if (antes > 0 && out.length < antes * 0.7) {
        console.error(`⚠  RECUSADO: ${out.length} torneios vs ${antes} em disco (perda de ${(100 - 100 * out.length / antes).toFixed(0)}%).`);
        console.error("   Ficheiro anterior preservado. Usar --force se a perda for intencional.");
        process.exit(2);
      }
    } catch { /* sem baseline fiável — segue */ }
  }
  if (presTorn || presJog) console.log(`Preservados ${presTorn} torneios e ${presJog} participações de jogadores já não seguidos`);

  const nScraped = out.filter((t) => t.scraped).length;
  const doc = {
    generated: new Date().toISOString(),
    source: "output/{fed}/analysis/data.json (voltas WHS dos nossos jogadores)",
    since: SINCE,
    minOurs: MIN_OURS,
    origins: ALL_ORIGINS ? "todas" : "Torn",
    counts: {
      playersScanned: scanned,
      tournaments: out.length,
      scraped: nScraped,
      unscraped: out.length - nScraped,
    },
    tournaments: out,
  };

  fs.writeFileSync(outPath, JSON.stringify(doc) + "\n");
  const sizeMB = (fs.statSync(outPath).size / 1e6).toFixed(1);

  // ── Scope de scrape: torneios com >5 nossos AINDA por scrapear ──────────
  // Estes valem o quadro completo — alimenta o scrape-classif-node.js (formato
  // {tclub,tcode}). Só FPG (ccode presente; Drive vazio scrapa-se por outro
  // pipeline). Ordenado por nº de nossos desc (mais valiosos primeiro). O
  // update-classif.yml consome-o e, à medida que forem scrapeados, saem do
  // scope no build seguinte (auto-drena).
  const SCRAPE_MIN_OURS = 6; // "mais de 5"
  const scrapeScope = out
    .filter((t) => !t.scraped && t.nOurs >= SCRAPE_MIN_OURS && t.ccode && t.ccode.trim() !== "")
    .sort((a, b) => b.nOurs - a.nOurs)
    .map((t) => ({ tclub: String(t.ccode).padStart(3, "0"), tcode: String(t.tcode), name: t.name, nOurs: t.nOurs }));
  const scopePath = path.join(DATA_DIR, "recent-tournaments-scrape-scope.json");
  fs.writeFileSync(scopePath, JSON.stringify(scrapeScope, null, 1) + "\n");

  console.log(`Jogadores lidos: ${scanned} (parseErr ${parseErr})`);
  console.log(`Torneios reconstruídos (desde ${SINCE}, ≥${MIN_OURS} nossos): ${out.length}`);
  console.log(`  já scrapeados: ${nScraped} | por scrapear: ${out.length - nScraped}`);
  console.log(`Escrito: public/data/recent-tournaments.json (${sizeMB} MB) em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`Scope de scrape (>${SCRAPE_MIN_OURS - 1} nossos, por scrapear): ${scrapeScope.length} → public/data/recent-tournaments-scrape-scope.json`);
}

if (require.main === module) main();

// Exportado para testes (scripts/build-recent-tournaments.test.js)
module.exports = { toIsoDate, cleanTournName };
