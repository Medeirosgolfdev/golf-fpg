/**
 * scripts/aggregator/sources/futuremasters.js
 *
 * Adapter Future Masters Golf (Dothan Country Club, Alabama) — GolfGenius.
 *
 * Lê ftm_fm_YYYY.json. Cada ficheiro tem várias divisions (por escalão etário);
 * cada division é um flight. Players têm `detailId` (GolfGenius, único por
 * jogador×divisão), `name` ("First Last"), `country` (ISO2 ou nome longo),
 * `location` ("Cidade, ST"), `pos` ("T1"/"1"), `total`, `toPar` e `rounds[]`.
 *
 * Estruturalmente gémeo do Doral (mesmo scraper GolfGenius). Diferenças:
 *   - divisões nomeadas por idade ("10 and Under", "11 & 12", "13 & 14", "15-18")
 *   - nomes já vêm "First Last" (sem vírgula)
 *   - `pos` é string ("T1") — converter para número
 *   - 2024: o campo `country` veio corrompido (números, ex: "2032"); a função
 *     countryToIso2 devolve null para esses, por isso ficam sem país (ok).
 */

const path = require("path");
const { DATA_DIR, readJsonSafe, listFiles } = require("../util/io");
const { displayName, splitName, countryToIso2 } = require("../util/names");

const SOURCE_ID = "fm";
const SOURCE_LABEL = "Future Masters Golf (Dothan)";
const FM_PATTERN = /^ftm_fm_\d{4}\.json$/;

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function load() {
  const files = listFiles(DATA_DIR, FM_PATTERN);
  const players = [];
  const tournaments = [];
  const playerMap = new Map();

  for (const file of files) {
    const data = readJsonSafe(file, null);
    if (!data) continue;
    const tt = normalize(data, path.basename(file), playerMap);
    if (tt) tournaments.push(tt);
  }
  for (const p of playerMap.values()) players.push(p);
  return { sourceId: SOURCE_ID, sourceLabel: SOURCE_LABEL, players, tournaments };
}

/** "10 and Under" → {min:null,max:10}; "11 & 12" → {11,12}; "15-18" → {15,18}. */
function parseAgeRange(divKey) {
  const s = String(divKey || "");
  if (/and under/i.test(s)) {
    const m = /(\d+)/.exec(s);
    return { ageMin: null, ageMax: m ? +m[1] : null };
  }
  const range = /(\d+)\s*(?:-|&|and|to)\s*(\d+)/i.exec(s);
  if (range) return { ageMin: +range[1], ageMax: +range[2] };
  const single = /(\d+)/.exec(s);
  if (single) return { ageMin: +single[1], ageMax: +single[1] };
  return { ageMin: null, ageMax: null };
}

/** "T1" / "T12" / "1" → número; outros → null. */
function parsePos(pos) {
  if (typeof pos === "number") return Number.isFinite(pos) ? pos : null;
  if (typeof pos !== "string") return null;
  const m = /(\d+)/.exec(pos);
  return m ? parseInt(m[1], 10) : null;
}

function normalize(data, fileName, playerMap) {
  const year = data.year || (fileName.match(/(\d{4})/) ? +fileName.match(/(\d{4})/)[1] : null);
  const sourceKey = fileName.replace(/\.json$/, "");
  const divisions = Array.isArray(data.divisions) ? data.divisions : [];
  const flights = [];
  let earliestTs = null; // para inferir a data de início real do torneio

  for (const div of divisions) {
    const divKey = div.division || div.key || div.name || "";
    const { ageMin, ageMax } = parseAgeRange(divKey);

    const par = Array.isArray(div.par) ? div.par : null;

    const divPlayers = Array.isArray(div.players) ? div.players : [];
    const results = [];
    for (const pl of divPlayers) {
      const cleanName = displayName(splitName(pl.name || ""));
      if (!cleanName) continue;
      const iso = countryToIso2(pl.country || "") || null;
      const key = pl.detailId ? `fm-${pl.detailId}` : `${cleanName.toLowerCase()}|${iso || ""}`;
      if (!playerMap.has(key)) {
        playerMap.set(key, {
          sourceKey: key,
          name: cleanName,
          country: iso,
          extra: {
            countryName: iso ? null : (pl.country || null),
            location: cleanLocation(pl.location),
            golfGeniusId: pl.detailId || null,
          },
        });
      }

      // Ordenar rondas cronologicamente quando todas têm data parseável
      // (mesma precaução do Doral — o GolfGenius por vezes numera por ordem
      // de entrada do jogador, não cronológica).
      const rawRounds = Array.isArray(pl.rounds) ? pl.rounds.slice() : [];
      const datedRounds = rawRounds.map((r) => {
        const ts = parseFmDate(r.date, year);
        if (ts != null && (earliestTs == null || ts < earliestTs)) earliestTs = ts;
        return {
          _ts: ts,
          gross: typeof r.gross === "number" ? r.gross : null,
          strokes: Array.isArray(r.scores) ? r.scores : undefined,
        };
      });
      const allDated = datedRounds.length > 0 && datedRounds.every((r) => r._ts != null);
      if (allDated) datedRounds.sort((a, b) => a._ts - b._ts);
      let rounds = datedRounds.map((r, i) => ({
        round: i + 1,
        gross: r.gross,
        strokes: r.strokes,
      }));
      // Fallback: roundGross[] sem rounds detalhados
      if (rounds.length === 0 && Array.isArray(pl.roundGross)) {
        rounds = pl.roundGross
          .filter((g) => typeof g === "number")
          .map((g, i) => ({ round: i + 1, gross: g }));
      }

      results.push({
        playerSourceKey: key,
        playerName: cleanName,
        pos: parsePos(pl.pos),
        status: "OK",
        totalGross: typeof pl.total === "number" ? pl.total : null,
        toPar: typeof pl.toPar === "number" ? pl.toPar : null,
        rounds,
      });
    }

    inferMissingPositions(results);

    flights.push({
      flightKey: divKey.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label: divKey,
      ageMin, ageMax, sex: null, // divisões FM são mistas (M+F por idade)
      par,
      fieldSize: results.length,
      results,
    });
  }

  const startDate = earliestTs != null
    ? new Date(earliestTs).toISOString().slice(0, 10)
    : (year ? `${year}-06-21` : null);

  return {
    sourceKey,
    name: `${data.tournament || "Future Masters Golf"} ${year || ""}`.trim(),
    date: startDate,
    seriesId: "future-masters",
    seriesLabel: "Future Masters Golf",
    course: data.course || "Dothan Country Club",
    flights,
    links: collectLinks(divisions),
  };
}

/** Junta os `source` (URL GolfGenius) das divisões em links únicos. */
function collectLinks(divisions) {
  const seen = new Set();
  const links = [];
  for (const div of divisions) {
    const url = div.source;
    if (url && !seen.has(url)) {
      seen.add(url);
      links.push({ label: `GolfGenius — ${div.division || ""}`.trim(), url });
    }
  }
  return links;
}

/** Remove o sufixo numérico corrompido do scrape 2024 (", 2032"). */
function cleanLocation(loc) {
  if (!loc || typeof loc !== "string") return null;
  return loc.replace(/,\s*\d{3,4}\s*$/, "").trim() || null;
}

/** Parse de datas GolfGenius "Sun, June 21" → timestamp ms (com `year`). */
function parseFmDate(s, year) {
  if (!s || typeof s !== "string") return null;
  const m = /(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2})/.exec(s);
  if (!m) return null;
  const mi = MONTHS[m[1].toLowerCase()];
  const day = parseInt(m[2], 10);
  if (mi === undefined || !day) return null;
  return new Date(year || 2000, mi, day).getTime();
}

/** Atribui pos a players sem posição mas com totalGross (ranking ascendente,
 *  empates partilham pos no padrão golf). Igual ao Doral. */
function inferMissingPositions(results) {
  const withTotal = results.filter((r) => typeof r.totalGross === "number");
  if (withTotal.length === 0) return;
  const sorted = [...withTotal].sort((a, b) => (a.totalGross || 0) - (b.totalGross || 0));
  let lastTotal = -1;
  let lastPos = 0;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const t = r.totalGross || 0;
    const pos = t === lastTotal ? lastPos : i + 1;
    if (r.pos === null || r.pos === undefined) r.pos = pos;
    lastTotal = t;
    lastPos = pos;
  }
}

module.exports = { load, SOURCE_ID, SOURCE_LABEL };
