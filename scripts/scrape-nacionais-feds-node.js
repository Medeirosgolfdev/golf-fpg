#!/usr/bin/env node
/**
 * scrape-nacionais-feds-node.js
 *
 * Scrape COMPLETO de federated_code para todos os players nos 206 torneios
 * Nacionais Jovens (incluindo Drive Tour Finals e ccode 988 2025).
 *
 * Usa cookies em api/.scoring-datagolf-cookies.json (mesmo formato que
 * scrape-classif-node.js / scrape-drive-node.js).
 *
 * Resultado:
 *   public/data/nacionais-feds.json — { score_id: federated_code }
 *
 * Cross-reference depois com federados.json + federados-inativos.json em
 * scripts/enrich-nacionais-feds.js → adiciona fedCode + dob real + country
 * a cada player no historico.
 *
 * Persistência incremental: a cada batch de 25 torneios, save progresso a
 * disco. Se o script for interrompido, continua de onde parou.
 *
 * Uso:
 *   node scripts/scrape-nacionais-feds-node.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const STATE_PATH = path.join(DATA_DIR, "nacionais-feds.json");
const HISTORICO_PATH = path.join(DATA_DIR, "fpg-nacionais-historico.json");

const COOKIES_PATH = path.join(ROOT, "api", ".scoring-datagolf-cookies.json");

const { loadCookieHeader } = require("./lib/cookies");
const COOKIES = loadCookieHeader({
  envVars: ["DATAGOLF_SCORING_COOKIES"],
  file: COOKIES_PATH,
  label: "[nacionais-feds]",
});
const BASE = "https://scoring.datagolf.pt";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Requested-With": "XMLHttpRequest",
  Origin: BASE,
  Referer: BASE + "/pt/tournaments.aspx",
  Cookie: COOKIES,
};

async function callApi(endpoint, body) {
  const res = await fetch(BASE + endpoint, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    return j;
  } catch (e) {
    throw new Error("Parse fail: " + text.slice(0, 200));
  }
}

async function getClassif(ccode, tcode) {
  const body = {
    Classi: "1",
    tclub: ccode,
    tcode: tcode,
    classiforder: "1",
    classiftype: "I",
    classifroundtype: "A",
    scoringtype: "1",
    round: "4",
    members: "0",
    playertypes: "0",
    gender: "0",
    minagemen: "0",
    maxagemen: "999",
    minageladies: "0",
    maxageladies: "999",
    minhcp: "-8",
    maxhcp: "99",
    idfilter: "-1",
    jtStartIndex: "0",
    jtPageSize: "200",
    jtSorting: "classif_pos ASC",
  };
  const j = await callApi(
    "/pt/classif.aspx/ClassifLST?jtStartIndex=0&jtPageSize=200&jtSorting=classif_pos+ASC",
    body,
  );
  return j.d && j.d.Result === "OK" ? j.d.Records || [] : [];
}

async function getFed(scoreId, ccode, tcode) {
  try {
    const j = await callApi("/pt/classifAgregate.aspx/ScoreCard", {
      score_id: scoreId,
      tclub: ccode,
      tcode: tcode,
      scoringtype: "1",
      classiftype: "I",
      classifround: "",
    });
    if (j.d && j.d.Result === "OK" && j.d.Records[0]) {
      return j.d.Records[0].federated_code || null;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Carregar lista de torneios do historico (já temos a meta)
function loadTargetsFromHistorico() {
  if (!fs.existsSync(HISTORICO_PATH)) {
    console.error("[ERR] " + HISTORICO_PATH + " não existe — corre primeiro merge-nacionais-chunks.js");
    process.exit(1);
  }
  const h = JSON.parse(fs.readFileSync(HISTORICO_PATH, "utf8"));
  return (h.tournaments || []).map((t) => ({
    ccode: t.ccode,
    tcode: t.tcode,
    name: t.name,
    date: t.date,
  }));
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { fedByScoreId: {}, doneTcodes: {} };
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    return {
      fedByScoreId: s.fedByScoreId || {},
      doneTcodes: s.doneTcodes || {},
    };
  } catch {
    return { fedByScoreId: {}, doneTcodes: {} };
  }
}

function saveState(state) {
  const out = {
    generatedAt: new Date().toISOString(),
    note: "score_id → federated_code (full scrape via Node + ScoreCard endpoint)",
    totalEntries: Object.keys(state.fedByScoreId).length,
    doneTournaments: Object.keys(state.doneTcodes).length,
    fedByScoreId: state.fedByScoreId,
    doneTcodes: state.doneTcodes,
  };
  fs.writeFileSync(STATE_PATH, JSON.stringify(out, null, 2));
}

async function processOne(t, state) {
  const players = await getClassif(t.ccode, t.tcode);
  const scoreIds = players.map((p) => p.score_id).filter(Boolean);
  // Concorrência 5 dentro do torneio
  for (let i = 0; i < scoreIds.length; i += 5) {
    const batch = scoreIds.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (sid) => [sid, await getFed(sid, t.ccode, t.tcode)]),
    );
    for (const [sid, fed] of results) {
      if (fed) state.fedByScoreId[sid] = fed;
    }
  }
  state.doneTcodes[t.ccode + "/" + t.tcode] = scoreIds.length;
}

async function main() {
  const targets = loadTargetsFromHistorico();
  const state = loadState();

  console.log(`[scrape] ${targets.length} torneios alvo`);
  console.log(`[scrape] estado existente: ${Object.keys(state.doneTcodes).length} torneios feitos, ${Object.keys(state.fedByScoreId).length} feds em cache`);

  const pending = targets.filter(
    (t) => !state.doneTcodes[t.ccode + "/" + t.tcode],
  );
  console.log(`[scrape] pendentes: ${pending.length}`);

  if (pending.length === 0) {
    console.log("[ok] nada a fazer (estado completo)");
    return;
  }

  let processed = 0;
  const start = Date.now();
  for (const t of pending) {
    try {
      await processOne(t, state);
      processed++;
      if (processed % 5 === 0) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const rate = processed / parseFloat(elapsed);
        const eta = Math.ceil((pending.length - processed) / rate);
        console.log(
          `  [${processed}/${pending.length}] ${t.ccode}/${t.tcode} (${t.date}) — ${elapsed}s elapsed, ETA ${eta}s, ${Object.keys(state.fedByScoreId).length} feds`,
        );
        saveState(state);
      }
    } catch (e) {
      console.warn("  [warn] falhou " + t.tcode + ": " + e.message);
    }
  }
  saveState(state);
  console.log(
    `[ok] ${Object.keys(state.fedByScoreId).length} feds capturados em ${Object.keys(state.doneTcodes).length} torneios`,
  );
  console.log(`     ${path.relative(process.cwd(), STATE_PATH)}`);
}

main();
