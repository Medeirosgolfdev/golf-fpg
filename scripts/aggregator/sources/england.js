/**
 * scripts/aggregator/sources/england.js
 *
 * Adapter England Golf (GolfGenius).
 *
 * Lê todos os england_{slug}[_divN].json em public/data/ (catálogo:
 * england-golf-catalog.json, só para metadados/section).
 *
 * Fonte FRACA: o GolfGenius público não expõe DOB/HCP e os memberIds são
 * por-torneio (não cross-event) — matching por nome+país, como o wjgc.
 */

const path = require("path");
const { DATA, DATA_DIR, readJsonSafe, listFiles } = require("../util/io");
const { displayName } = require("../util/names");
const { rankResults } = require("../util/rank");

const SOURCE_ID = "england";
const SOURCE_LABEL = "England Golf";

/** country do GolfGenius vem em código flag-icon ("FR", "GB-ENG", "GB-SCT"). */
function ggCountryToIso2(c) {
  if (!c) return null;
  const s = String(c).toUpperCase().trim();
  if (/^GB(-|$)/.test(s)) return "GB";
  if (/^[A-Z]{2}$/.test(s)) return s;
  return null;
}

const MONTHS_EN = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/** Extrai data ISO do headerText da 1ª ronda ("Tue, July 22 Luffenham ..."). */
function dateFromRounds(players, year) {
  if (!year) return null;
  for (const p of players || []) {
    for (const r of p.rounds || []) {
      const m = /,\s*([A-Za-z]+)\s+(\d{1,2})\b/.exec(r.headerText || "");
      if (m && MONTHS_EN[m[1].toLowerCase()]) {
        return `${year}-${MONTHS_EN[m[1].toLowerCase()]}-${String(m[2]).padStart(2, "0")}`;
      }
    }
  }
  return `${year}-07-01`; // época dos trophies EG — fallback plausível
}

function seriesFor(tournament) {
  const n = String(tournament || "").replace(/\b20\d{2}\b/g, "").replace(/\([^)]*\)/g, "").trim();
  if (!n) return { id: "england", label: "England Golf" };
  const id = "england-" + n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return { id, label: n };
}

function load() {
  const files = listFiles(DATA_DIR, DATA.englandPattern);
  const players = [];
  const playerMap = new Map(); // "name|iso" → RawPlayer
  const tournaments = [];

  for (const file of files) {
    const base = path.basename(file);
    if (base === "england-golf-catalog.json") continue;
    const data = readJsonSafe(file, null);
    if (!data || !Array.isArray(data.players) || data.players.length === 0) continue;

    const sourceKey = base.replace(/\.json$/, "");
    const name = data.tournament || sourceKey;
    const year = data.year || null;
    const par = Array.isArray(data.par) && data.par.length ? data.par : null;
    const parTotal = typeof data.parTotal === "number" ? data.parTotal
      : (par ? par.reduce((a, b) => a + (b || 0), 0) : null);
    const ageMax = /U(\d+)/.exec(data.ageGroup || "")?.[1] ? +/U(\d+)/.exec(data.ageGroup)[1] : null;
    const sex = data.gender === "M" || data.gender === "F" ? data.gender : null;
    const dateIso = dateFromRounds(data.players, year);
    const series = seriesFor(name);

    const results = [];
    for (const pl of data.players) {
      const playerName = displayName(pl.name || "");
      if (!playerName) continue;
      const iso = ggCountryToIso2(pl.country);
      const key = `${playerName.toLowerCase()}|${iso || ""}`;
      const existing = playerMap.get(key);
      if (!existing) {
        playerMap.set(key, {
          sourceKey: key,
          name: playerName,
          country: iso,
          sex,
          club: pl.club || null,
          extra: { ggCountry: pl.country || null },
        });
      } else if (!existing.club && pl.club) {
        existing.club = pl.club;
      }
      const rounds = (Array.isArray(pl.rounds) ? pl.rounds : []).map((r, i) => ({
        round: r.day || i + 1,
        gross: typeof r.gross === "number" ? r.gross : null,
        strokes: Array.isArray(r.scores) ? r.scores : undefined,
      }));
      results.push({
        playerSourceKey: key,
        playerName,
        // O `pos` do ficheiro NAO serve: e o `data-rank` cru da leaderboard do
        // GolfGenius, que conta as DUAS linhas que o GG poe por jogador (gross +
        // sub-linha) -- daí 1, 3, 5, 7... e 144 jogadores a acabarem no lugar
        // 288, com os empates nunca a partilhar lugar. A posicao real e
        // reconstruida dos totais logo abaixo (rankResults), tal como o `loadT`
        // da EnglandGolfPage sempre fez -- por isso a /england nunca mostrou o
        // erro e so o kids2 o herdava.
        pos: null,
        status: pl.pos == null && !rounds.length ? "DNS" : "OK",
        totalGross: typeof pl.total === "number" ? pl.total : null,
        toPar: typeof pl.toPar === "number" ? pl.toPar : (typeof pl.result === "number" ? pl.result : null),
        rounds,
      });
    }
    if (!results.length) continue;
    rankResults(results, par ? par.filter((x) => x > 0).length : 18);

    const division = data.players[0]?.division || data.category || data.ageGroup || "Geral";
    tournaments.push({
      sourceKey,
      name,
      date: dateIso,
      startDate: dateIso,
      year,
      seriesId: series.id,
      seriesLabel: series.label,
      course: data.course || data.courses?.[0]?.courseName || null,
      parTotal,
      holesPerRound: par ? par.filter((p) => p > 0).length : 18,
      rounds: typeof data.rounds === "number" ? data.rounds : undefined,
      flights: [{
        flightKey: String(division).toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        label: [division, data.ageGroup].filter(Boolean).join(" · "),
        ageMin: null,
        ageMax,
        sex,
        par: par || undefined,
        fieldSize: results.length,
        results,
      }],
      links: data.source ? [{ label: "GolfGenius", url: data.source }] : [],
    });
  }

  for (const p of playerMap.values()) players.push(p);

  return {
    sourceId: SOURCE_ID,
    sourceLabel: SOURCE_LABEL,
    players,
    tournaments,
  };
}

module.exports = { load, SOURCE_ID, SOURCE_LABEL };
