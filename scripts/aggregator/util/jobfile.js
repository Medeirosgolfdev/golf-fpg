/**
 * scripts/aggregator/util/jobfile.js
 *
 * Helper partilhado para adapters de fontes GolfGenius em formato "JobFile"
 * (o output do scrape-fsga.js / scrape-golfgenius-node.js): FSGA, Under Armour
 * e Campeonato Nacional Infantil Juvenil do México. Estruturalmente gémeo do
 * Future Masters / Doral, com duas diferenças:
 *   - sexo/idade parseados do label da divisão (parseDiv por fonte)
 *   - `dob`/`club` por jogador quando a ficha GG os expõe (México → matching forte)
 *
 * Cada adapter chama `buildJobfileSource({...})` e reexporta {load, SOURCE_ID,
 * SOURCE_LABEL}.
 */
const path = require("path");
const { DATA_DIR, readJsonSafe, listFiles } = require("./io");
const { displayName, splitName, countryToIso2, dobToIso } = require("./names");

/** "T1" / "T12" / "1" → número; outros → null. */
function parsePos(pos) {
  if (typeof pos === "number") return Number.isFinite(pos) ? pos : null;
  if (typeof pos !== "string") return null;
  const m = /(\d+)/.exec(pos);
  return m ? parseInt(m[1], 10) : null;
}

function cleanLocation(loc) {
  if (!loc || typeof loc !== "string") return null;
  return loc.replace(/,\s*\d{3,4}\s*$/, "").trim() || null;
}

function inferMissingPositions(results) {
  const withTotal = results.filter((r) => typeof r.totalGross === "number");
  if (withTotal.length === 0) return;
  const sorted = [...withTotal].sort((a, b) => (a.totalGross || 0) - (b.totalGross || 0));
  let lastTotal = -1, lastPos = 0;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const t = r.totalGross || 0;
    const pos = t === lastTotal ? lastPos : i + 1;
    if (r.pos == null) r.pos = pos;
    lastTotal = t; lastPos = pos;
  }
}

function collectLinks(divisions, seriesLabel) {
  const seen = new Set(); const links = [];
  for (const div of divisions) {
    const url = div.source;
    if (url && !seen.has(url)) { seen.add(url); links.push({ label: `GolfGenius — ${div.division || seriesLabel}`.trim(), url }); }
  }
  return links;
}

/**
 * @param {object} opts
 * @param {string} opts.sourceId          id da fonte (ex: "uajt")
 * @param {string} opts.sourceLabel       label legível
 * @param {RegExp} opts.pattern           padrão do ficheiro (ex: /^uajt_\d{4}\.json$/)
 * @param {string} opts.seriesId          id da série (kids2)
 * @param {string} opts.seriesLabel       label da série
 * @param {string} [opts.defaultCountry]  país por defeito (ISO2) quando o jogador não tem
 * @param {(divKey:string)=>{ageMin:?number,ageMax:?number,sex:?string}} opts.parseDiv
 * @param {(data:object)=>string} [opts.nameFn]  nome do torneio (default: data.tournament + ano)
 */
function buildJobfileSource(opts) {
  const { sourceId, sourceLabel, pattern, seriesId, seriesLabel, defaultCountry = null, parseDiv } = opts;

  function normalize(data, fileName, playerMap) {
    const year = data.year || (fileName.match(/(\d{4})/) ? +fileName.match(/(\d{4})/)[1] : null);
    const sourceKey = fileName.replace(/\.json$/, "");
    const divisions = Array.isArray(data.divisions) ? data.divisions : [];
    const flights = [];

    for (const div of divisions) {
      const divKey = div.division || div.key || div.name || "";
      const { ageMin, ageMax, sex } = parseDiv(divKey);
      const par = Array.isArray(div.par) ? div.par : null;
      const divPlayers = Array.isArray(div.players) ? div.players : [];
      const results = [];

      for (const pl of divPlayers) {
        const cleanName = displayName(splitName(pl.name || ""));
        if (!cleanName) continue;
        const iso = countryToIso2(pl.country || "") || defaultCountry || null;
        const dob = dobToIso(pl.dob) || null;
        // ANO de nascimento sem data completa (ex: GolfBox) → dobRange anual, a
        // mesma evidência média que o USKids/GJGL usam: permite fundir variantes
        // de nome no MESMO ano e discrimina homónimos de anos diferentes, sem
        // fabricar uma DOB exacta falsa. Só quando não há dob completa.
        const birthYear = Number.isInteger(pl.birthYear) && pl.birthYear > 1900 ? pl.birthYear : null;
        const dobRange = !dob && birthYear ? { lo: `${birthYear}-01-01`, hi: `${birthYear}-12-31` } : null;
        // Chave forte por GolfGenius id (único por jogador×divisão); resultados
        // só contam se o jogador estiver em players[] (invariante do matcher).
        const key = pl.detailId ? `${sourceId}-${pl.detailId}` : `${cleanName.toLowerCase()}|${iso || ""}`;
        const prev = playerMap.get(key);
        if (!prev || (dob && !prev.dob) || (dobRange && !prev.dob && !prev.dobRange)) {
          playerMap.set(key, {
            sourceKey: key,
            name: cleanName,
            country: iso,
            dob: dob || prev?.dob || null,
            dobRange: dobRange || prev?.dobRange || null,
            sex: sex || prev?.sex || null,
            club: pl.club || prev?.club || null,
            extra: {
              countryName: iso ? null : (pl.country || null),
              location: cleanLocation(pl.location),
              golfGeniusId: pl.detailId || null,
              gradYear: pl.gradYear || null,
              birthYear,
            },
          });
        }

        let rounds = (Array.isArray(pl.rounds) ? pl.rounds : []).map((r, i) => ({
          round: i + 1,
          gross: typeof r.gross === "number" ? r.gross : null,
          strokes: Array.isArray(r.scores) ? r.scores : undefined,
        }));
        if (rounds.length === 0 && Array.isArray(pl.roundGross)) {
          rounds = pl.roundGross.filter((g) => typeof g === "number").map((g, i) => ({ round: i + 1, gross: g }));
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
        flightKey: divKey.toLowerCase().replace(/[^a-z0-9]+/g, "_") || `f${flights.length}`,
        label: divKey,
        ageMin, ageMax, sex,
        par,
        fieldSize: results.length,
        results,
      });
    }

    return {
      sourceKey,
      name: (opts.nameFn ? opts.nameFn(data) : `${data.tournament || seriesLabel} ${year || ""}`).trim(),
      // Data real do evento quando a fonte a expõe (ex: GolfBox → startDate);
      // as fontes GolfGenius não a trazem → fallback a 1 de Janeiro do ano.
      date: data.startDate || data.date || (year ? `${year}-01-01` : null),
      seriesId,
      seriesLabel,
      course: data.course || null,
      flights,
      links: collectLinks(divisions, seriesLabel),
    };
  }

  function load() {
    const files = listFiles(DATA_DIR, pattern);
    const tournaments = [];
    const playerMap = new Map();
    for (const file of files) {
      const data = readJsonSafe(file, null);
      if (!data) continue;
      const tt = normalize(data, path.basename(file), playerMap);
      if (tt) tournaments.push(tt);
    }
    return { sourceId, sourceLabel, players: [...playerMap.values()], tournaments };
  }

  return { load, SOURCE_ID: sourceId, SOURCE_LABEL: sourceLabel };
}

// "Boys 13-14"/"Girls 8U"/"Varonil 18"/"Femenil 12-13"/"Overall"/"13-15" →
// {ageMin, ageMax, sex}. Boys/Varonil→M, Girls/Femenil→F, senão null (misto).
function parseSexAge(divKey) {
  const s = String(divKey || "");
  const sex = /^\s*(boys|var)/i.test(s) ? "M" : /^\s*(girls|fem)/i.test(s) ? "F" : null;
  if (/\bU\b|and under|y menores/i.test(s)) { const m = /(\d+)/.exec(s); return { ageMin: null, ageMax: m ? +m[1] : null, sex }; }
  if (/(\d+)\s*U\b/i.test(s)) { const m = /(\d+)\s*U/i.exec(s); return { ageMin: null, ageMax: +m[1], sex }; }
  const range = /(\d+)\s*(?:-|&|to|y|\/)\s*(\d+)/i.exec(s);
  if (range) return { ageMin: +range[1], ageMax: +range[2], sex };
  const single = /(\d+)/.exec(s);
  if (single) return { ageMin: +single[1], ageMax: +single[1], sex };
  return { ageMin: null, ageMax: null, sex };
}

module.exports = { buildJobfileSource, parseSexAge };
