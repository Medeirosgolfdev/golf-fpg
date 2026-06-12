#!/usr/bin/env node
/**
 * rebuild-nacionais-historico.js
 *
 * Pipeline COMPLETO em Node, sem browser:
 *   1. Lê targets do fpg-nacionais-historico.json existente; se vazio,
 *      bootstrap via TournamentsLST + chunk5 hardcoded.
 *   2. ClassifLST por torneio → todos os players + roundScores.
 *   3. ScoreCard por player → federated_code.
 *   4. Cross-ref federados.json + federados-inativos.json → country + dob real.
 *   5. Save state incremental em .rebuild-nacionais-state.json.
 *   6. Escreve fpg-nacionais-historico.json directamente.
 *
 * Persistência: se script interrompido, retoma exactamente onde parou.
 * Protecção: NÃO sobrescreve historico se 0 torneios processados (mantém o anterior).
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const HISTORICO_PATH = path.join(DATA_DIR, "fpg-nacionais-historico.json");
const FEDERADOS_PATH = path.join(DATA_DIR, "federados.json");
const FEDERADOS_INATIVOS_PATH = path.join(ROOT, "data-archive", "federados-inativos.json");
const STATE_PATH = path.join(DATA_DIR, ".rebuild-nacionais-state.json");
const COOKIES_PATH = path.join(ROOT, "api", ".scoring-datagolf-cookies.json");

const COOKIES = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8")).cookieHeader;
const BASE = "https://scoring.datagolf.pt";
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Requested-With": "XMLHttpRequest",
  Origin: BASE,
  Referer: BASE + "/pt/tournaments.aspx",
  Cookie: COOKIES,
};

let _logFirstError = true;
async function callApi(endpoint, body) {
  const res = await fetch(BASE + endpoint, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    if (j.d && j.d.Result !== "OK" && _logFirstError) {
      console.error("[API ERROR]", endpoint, "->", j.d.Result || JSON.stringify(j.d).slice(0, 200));
      _logFirstError = false;
    }
    return j;
  } catch {
    if (_logFirstError) {
      console.error("[API HTML]", endpoint, "->", res.status, text.slice(0, 400));
      _logFirstError = false;
    }
    return { d: { Result: "ERROR", Records: [] } };
  }
}

async function getClassif(ccode, tcode) {
  const body = {
    Classi: "1", tclub: ccode, tcode: tcode,
    classiforder: "1", classiftype: "I", classifroundtype: "A", scoringtype: "1",
    round: "4", members: "0", playertypes: "0", gender: "0",
    minagemen: "0", maxagemen: "999", minageladies: "0", maxageladies: "999",
    minhcp: "-8", maxhcp: "99", idfilter: "-1",
    jtStartIndex: "0", jtPageSize: "200", jtSorting: "classif_pos ASC",
  };
  const j = await callApi("/pt/classif.aspx/ClassifLST?jtStartIndex=0&jtPageSize=200&jtSorting=classif_pos+ASC", body);
  return j.d && j.d.Result === "OK" ? j.d.Records || [] : [];
}

async function getScoreCard(scoreId, ccode, tcode) {
  try {
    const j = await callApi("/pt/classifAgregate.aspx/ScoreCard", {
      score_id: scoreId, tclub: ccode, tcode: tcode,
      scoringtype: "1", classiftype: "I", classifround: "",
    });
    if (!j.d || j.d.Result !== "OK") return null;
    const records = j.d.Records || [];
    if (records.length === 0) return null;
    const fed = records[0].federated_code || null;
    // Extrair hole-by-hole para cada ronda
    const rounds = records.map((r) => {
      const scores = [], pars = [], si = [], meters = [];
      for (let i = 1; i <= 18; i++) {
        scores.push(parseInt(r["gross_" + i]) || 0);
        pars.push(parseInt(r["par_" + i]) || 0);
        si.push(parseInt(r["stroke_index_" + i]) || 0);
        meters.push(parseInt(r["meters_" + i]) || 0);
      }
      const grossTot = scores.reduce((s, x) => s + (x > 0 ? x : 0), 0);
      return {
        round: r.round_number,
        gross: grossTot,
        scores, pars, si, meters,
        courseRating: r.course_rating || null,
        slope: r.slope || null,
        teeName: r.tee_name || null,
        teeColorId: r.tee_color_id || null,
      };
    });
    return { fed, rounds, parTotal: records[0].par_total || null, nholes: records[0].nholes || null };
  } catch { return null; }
}

function loadFederadosIndex() {
  console.log("[load] federados.json + federados-inativos.json...");
  const active = JSON.parse(fs.readFileSync(FEDERADOS_PATH, "utf8")).players || [];
  const inactive = fs.existsSync(FEDERADOS_INATIVOS_PATH)
    ? JSON.parse(fs.readFileSync(FEDERADOS_INATIVOS_PATH, "utf8")).players || []
    : [];
  const idx = {};
  for (const p of active) if (p.federation_code) idx[p.federation_code] = p;
  for (const p of inactive) if (p.federation_code && !idx[p.federation_code]) idx[p.federation_code] = p;
  console.log("[load]   active:", active.length, "inactive:", inactive.length, "indexed:", Object.keys(idx).length);
  return idx;
}

const CHUNK5_EXTRAS = [
  { ccode: "000", tcode: "10164", date: "2018-11-10", name: "Grande Final Drive Tour Sub 12 -Montado" },
  { ccode: "000", tcode: "10163", date: "2018-11-10", name: "Grande Final Drive Tour Sub 14-Feminino-Montado" },
  { ccode: "000", tcode: "10162", date: "2018-11-10", name: "Grande Final Drive Tour Sub 14-Masculino-Montado" },
  { ccode: "000", tcode: "10161", date: "2018-11-10", name: "Grande Final Drive Tour Sub 16-Feminino-Montado" },
  { ccode: "000", tcode: "10160", date: "2018-11-10", name: "Grande Final Drive Tour Sub 16-Masculino-Montado" },
  { ccode: "000", tcode: "10159", date: "2018-11-10", name: "Grande Final Drive Tour Sub 18-Feminino-Montado" },
  { ccode: "000", tcode: "10158", date: "2018-11-10", name: "Grande Final Drive Tour Sub 18-Masculino-Montado" },
  { ccode: "000", tcode: "10260", date: "2019-11-02", name: "Grande Final Drive Tour - Montado - Sub 12" },
  { ccode: "000", tcode: "10259", date: "2019-11-02", name: "Grande Final Drive Tour - Montado - Sub 14 S" },
  { ccode: "000", tcode: "10258", date: "2019-11-02", name: "Grande Final Drive Tour - Montado - Sub 14 H" },
  { ccode: "000", tcode: "10257", date: "2019-11-02", name: "Grande Final Drive Tour - Montado - Sub 16 S" },
  { ccode: "000", tcode: "10256", date: "2019-11-02", name: "Grande Final Drive Tour - Montado - Sub 16 H" },
  { ccode: "000", tcode: "10255", date: "2019-11-02", name: "Grande Final Drive Tour - Montado - Sub 18 S" },
  { ccode: "000", tcode: "10254", date: "2019-11-02", name: "Grande Final Drive Tour - Montado - Sub 18 H" },
  { ccode: "000", tcode: "10464", date: "2021-11-20", name: "Grande Final Drive Tour CN Jovens Sub 12" },
  { ccode: "000", tcode: "10463", date: "2021-11-20", name: "Grande Final Drive Tour CN Jovens Sub 14 & 12 S" },
  { ccode: "000", tcode: "10462", date: "2021-11-20", name: "Grande Final Drive Tour CN Jovens Sub 14 H" },
  { ccode: "000", tcode: "10461", date: "2021-11-20", name: "Grande Final Drive Tour CN Jovens Sub 16 S" },
  { ccode: "000", tcode: "10460", date: "2021-11-20", name: "Grande Final Drive Tour CN Jovens Sub 16 H" },
  { ccode: "000", tcode: "10459", date: "2021-11-20", name: "Grande Final Drive Tour CN Jovens Sub 18 S" },
  { ccode: "000", tcode: "10458", date: "2021-11-20", name: "Grande Final Drive Tour CN Jovens Sub 18 H" },
  { ccode: "000", tcode: "10579", date: "2022-11-12", name: "Grande Final Drive Tour CN Jovens Sub18 S" },
  { ccode: "000", tcode: "10578", date: "2022-11-12", name: "Grande Final Drive Tour CN Jovens Sub18 H" },
  { ccode: "000", tcode: "10577", date: "2022-11-12", name: "Grande Final Drive Tour CN Jovens Sub16 S" },
  { ccode: "000", tcode: "10576", date: "2022-11-12", name: "Grande Final Drive Tour CN Jovens Sub16 H" },
  { ccode: "000", tcode: "10575", date: "2022-11-12", name: "Grande Final Drive Tour CN Jovens Sub14 S" },
  { ccode: "000", tcode: "10574", date: "2022-11-12", name: "Grande Final Drive Tour CN Jovens Sub14 H" },
  { ccode: "000", tcode: "10573", date: "2022-11-12", name: "Grande Final Drive Tour CN Jovens Sub12 S" },
  { ccode: "000", tcode: "10572", date: "2022-11-12", name: "Grande Final Drive Tour CN Jovens Sub12 H" },
  { ccode: "000", tcode: "10689", date: "2023-11-04", name: "Grande Final Drive Tour CN Jovens - Sub18 S" },
  { ccode: "000", tcode: "10688", date: "2023-11-04", name: "Grande Final Drive Tour CN Jovens - Sub18 H" },
  { ccode: "000", tcode: "10687", date: "2023-11-04", name: "Grande Final Drive Tour CN Jovens - Sub16 S" },
  { ccode: "000", tcode: "10686", date: "2023-11-04", name: "Grande Final Drive Tour CN Jovens - Sub16 H" },
  { ccode: "000", tcode: "10685", date: "2023-11-04", name: "Grande Final Drive Tour CN Jovens - Sub14 S" },
  { ccode: "000", tcode: "10684", date: "2023-11-04", name: "Grande Final Drive Tour CN Jovens - Sub14 H" },
  { ccode: "000", tcode: "10683", date: "2023-11-04", name: "Grande Final Drive Tour CN Jovens - Sub12 S" },
  { ccode: "000", tcode: "10682", date: "2023-11-04", name: "Grande Final Drive Tour CN Jovens - Sub12 H" },
  { ccode: "000", tcode: "10807", date: "2024-11-23", name: "Final Nacional Drive Tour Sub-18 S" },
  { ccode: "000", tcode: "10806", date: "2024-11-23", name: "Final Nacional Drive Tour Sub-18 H" },
  { ccode: "000", tcode: "10805", date: "2024-11-23", name: "Final Nacional Drive Tour Sub 16 S" },
  { ccode: "000", tcode: "10804", date: "2024-11-23", name: "Final Nacional Drive Tour Sub-16 H" },
  { ccode: "000", tcode: "10803", date: "2024-11-23", name: "Final Nacional Drive Tour Sub-14 S" },
  { ccode: "000", tcode: "10802", date: "2024-11-23", name: "Final Nacional Drive Tour Sub-14 H" },
  { ccode: "988", tcode: "10256", date: "2025-06-27", name: "Campeonato Nacional de Jovens Sub 10 H" },
  { ccode: "988", tcode: "10255", date: "2025-06-27", name: "Campeonato Nacional de Jovens Sub 12 S" },
  { ccode: "988", tcode: "10254", date: "2025-06-27", name: "Campeonato Nacional de Jovens Sub 12 H" },
];

async function fetchTargetsFromFPG() {
  console.log("[bootstrap] historico vazio — a procurar via TournamentsLST...");
  const all = [];
  for (let start = 0; start < 500; start += 100) {
    const j = await callApi(
      "/pt/tournaments.aspx/TournamentsLST?jtStartIndex=" + start + "&jtPageSize=100&jtSorting=started_at%20DESC",
      {
        ClubCode: "000", dtIni: "", dtFim: "", CourseName: "",
        TournCode: "", TournName: "Sub",
        jtStartIndex: String(start), jtPageSize: "100",
        jtSorting: "started_at DESC",
      },
    );
    if (j.d && j.d.Result === "OK") {
      const recs = j.d.Records || [];
      all.push(...recs);
      if (recs.length < 100) break;
    } else {
      console.error("[bootstrap] erro:", j.d?.Result || JSON.stringify(j).slice(0, 200));
      break;
    }
  }
  function categorize(n) {
    const t = (n || "").toLowerCase();
    if (/drive\s+challenge/.test(t)) return null;
    if (/drive\s+tour/.test(t)) return null;
    if (/^drive\s/.test(t)) return null;
    if (/campeonato\s+nacional.*de\s+clubes/.test(t)) return "Clubes";
    if (/campeonato\s+nacional.*(jovens|sub)/.test(t)) return "Jovens";
    return null;
  }
  const targets = all
    .filter((t) => categorize(t.description))
    .map((t) => {
      const m = String(t.started_at).match(/\/Date\((\d+)/);
      return {
        ccode: t.club_code, tcode: t.code,
        date: m ? new Date(parseInt(m[1])).toISOString().slice(0, 10) : null,
        name: t.description, campo: t.course_description || "",
        circuit: "FPG-NAC", escalao: "", tipo: categorize(t.description),
      };
    });
  for (const e of CHUNK5_EXTRAS) {
    targets.push({ ...e, campo: "", circuit: "FPG-NAC", escalao: "", tipo: "Jovens" });
  }
  console.log("[bootstrap] " + targets.length + " torneios (TournamentsLST: " + all.length + " + chunk5: " + CHUNK5_EXTRAS.length + ")");
  return targets;
}

async function loadTargets() {
  if (fs.existsSync(HISTORICO_PATH)) {
    try {
      const h = JSON.parse(fs.readFileSync(HISTORICO_PATH, "utf8"));
      const tournaments = h.tournaments || [];
      if (tournaments.length > 0) {
        return tournaments.map((t) => ({
          ccode: t.ccode, tcode: t.tcode, name: t.name, date: t.date,
          campo: t.campo || "", circuit: t.circuit || "FPG-NAC",
          escalao: t.escalao || "", tipo: t.tipo || "Jovens",
        }));
      }
    } catch {}
  }
  return await fetchTargetsFromFPG();
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { tournaments: {} };
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    // Cleanup: remover entries com 0 players (de runs falhados anteriores)
    const cleaned = {};
    let pruned = 0;
    for (const [k, v] of Object.entries(s.tournaments || {})) {
      if (v && (v.players || []).length > 0) {
        cleaned[k] = v;
      } else {
        pruned++;
      }
    }
    if (pruned > 0) {
      console.log("[state] auto-cleanup: removidas " + pruned + " entries vazias do state file");
    }
    return { tournaments: cleaned };
  } catch { return { tournaments: {} }; }
}
function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state));
}

function detectEscalao(name) {
  const m = (name || "").match(/sub\s*-?\s*(\d{1,2})/i);
  return m ? "Sub-" + m[1] : "";
}

async function processTournament(t) {
  const records = await getClassif(t.ccode, t.tcode);
  const players = [];
  for (const p of records) {
    const rs = [];
    ["classif_r1", "classif_r2", "classif_r3", "classif_r4"].forEach((k, i) => {
      const v = String(p[k] || "").trim();
      if (v && v !== "0" && /^\d+$/.test(v)) {
        rs.push({ round: i + 1, gross: parseInt(v), scores: [], pars: [] });
      }
    });
    players.push({
      scoreId: p.score_id, pos: parseInt(p.classif_pos) || null,
      name: p.player_name, club: p.player_club_description,
      grossTotal: parseInt(p.gross_total) || (p.classif_total ? parseInt(p.classif_total) : null),
      toPar: typeof p.to_par_total === "string" ? parseInt(p.to_par_total) || 0 : p.to_par_total,
      hcpExact: p.exact_hcp, hcpPlay: p.play_hcp,
      fedCode: null,
      sex: p.player_gender === "M" || p.player_gender === "F" ? p.player_gender : null,
      age: p.player_age, course: t.campo,
      roundScores: rs,
    });
  }
  for (let i = 0; i < players.length; i += 5) {
    const batch = players.slice(i, i + 5);
    const cards = await Promise.all(batch.map(async (p) => [p, await getScoreCard(p.scoreId, t.ccode, t.tcode)]));
    for (const [p, sc] of cards) {
      if (!sc) continue;
      if (sc.fed) p.fedCode = sc.fed;
      if (sc.parTotal) p.parTotal = sc.parTotal;
      if (sc.nholes) p.nholes = sc.nholes;
      // Substituir roundScores pelos hole-by-hole (já tinha só gross + arrays vazios)
      if (sc.rounds && sc.rounds.length > 0) p.roundScores = sc.rounds;
    }
  }
  const maxRounds = players.reduce((m, p) => Math.max(m, (p.roundScores || []).length), 1);
  return {
    name: t.name, ccode: t.ccode, tcode: t.tcode, date: t.date,
    campo: t.campo, circuit: t.circuit,
    escalao: t.escalao || detectEscalao(t.name), tipo: t.tipo,
    rounds: maxRounds, playerCount: players.length, players,
  };
}

function enrichWithFederados(tournament, federadosIdx) {
  const tournYear = parseInt((tournament.date || "").slice(0, 4));
  for (const p of tournament.players || []) {
    if (p.fedCode) {
      const fp = federadosIdx[p.fedCode];
      if (fp) {
        if (fp.birthdate) p.dob = fp.birthdate;
        if (fp.country_prefix) p.country = fp.country_prefix;
        if (fp.gender && !p.sex) p.sex = fp.gender;
        continue;
      }
    }
    if (typeof p.age === "number" && p.age > 0 && tournYear) {
      const yob = tournYear - p.age;
      if (yob >= 1980 && yob <= 2030) p.dob = (yob + "-06-01");
    }
  }
}

async function main() {
  const targets = await loadTargets();
  if (targets.length === 0) {
    console.error("[ABORT] 0 targets — verifica cookies");
    process.exit(1);
  }
  const federadosIdx = loadFederadosIndex();
  const state = loadState();

  console.log("[run] " + targets.length + " torneios alvo, " + Object.keys(state.tournaments).length + " já feitos");
  const pending = targets.filter((t) => !state.tournaments[t.ccode + "/" + t.tcode]);
  console.log("[run] pendentes: " + pending.length);

  let processed = 0;
  let emptyCount = 0;
  const start = Date.now();
  for (const t of pending) {
    try {
      const result = await processTournament(t);
      if ((result.players || []).length === 0) {
        emptyCount++;
        if (emptyCount <= 3) console.warn("  [empty] " + t.ccode + "/" + t.tcode);
        if (emptyCount >= 5) {
          console.error("\n[ABORT] 5+ torneios vazios — cookies expirados?");
          break;
        }
        continue;
      }
      emptyCount = 0;
      enrichWithFederados(result, federadosIdx);
      state.tournaments[t.ccode + "/" + t.tcode] = result;
      processed++;
      if (processed % 5 === 0) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const rate = processed / parseFloat(elapsed);
        const eta = Math.ceil((pending.length - processed) / rate);
        const totFeds = Object.values(state.tournaments).reduce((s, t) => s + (t.players || []).filter((p) => p.fedCode).length, 0);
        const totCountry = Object.values(state.tournaments).reduce((s, t) => s + (t.players || []).filter((p) => p.country).length, 0);
        console.log("  [" + processed + "/" + pending.length + "] " + t.ccode + "/" + t.tcode + " (" + t.date + ") — " + elapsed + "s, ETA " + eta + "s | feds:" + totFeds + " country:" + totCountry);
        saveState(state);
      }
    } catch (e) {
      console.warn("  [warn] " + t.ccode + "/" + t.tcode + " falhou: " + e.message);
    }
  }
  saveState(state);

  // Filtrar torneios sem players (e.g. Sub-10 F 2026 com tcode 10944 e 0 inscritos)
  const tournaments = Object.values(state.tournaments)
    .filter((t) => (t.players || []).length > 0)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (tournaments.length === 0) {
    console.error("[ABORT] 0 torneios processados");
    process.exit(1);
  }

  const totalPlayers = tournaments.reduce((s, t) => s + (t.players || []).length, 0);
  const totalScorecards = tournaments.reduce((s, t) => s + (t.players || []).reduce((s2, p) => s2 + (p.roundScores || []).length, 0), 0);
  const withFed = tournaments.reduce((s, t) => s + (t.players || []).filter((p) => p.fedCode).length, 0);
  const withCountry = tournaments.reduce((s, t) => s + (t.players || []).filter((p) => p.country).length, 0);

  const out = {
    lastUpdated: new Date().toISOString().slice(0, 10).split("-").reverse().join("/"),
    source: "rebuild-nacionais-historico.js",
    totalTournaments: tournaments.length,
    totalPlayers, totalScorecards,
    enrichmentStats: {
      playersWithFed: withFed,
      playersWithCountry: withCountry,
      coverage: ((withFed / totalPlayers) * 100).toFixed(1) + "%",
    },
    tournaments,
  };
  fs.writeFileSync(HISTORICO_PATH, JSON.stringify(out, null, 2));
  console.log("\n[ok] " + tournaments.length + " torneios escritos");
  console.log("     " + totalPlayers + " jogadores | " + totalScorecards + " scorecards");
  console.log("     " + withFed + " com fedCode (" + out.enrichmentStats.coverage + ") | " + withCountry + " com country");
}

main();
