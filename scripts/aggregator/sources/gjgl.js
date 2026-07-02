/**
 * scripts/aggregator/sources/gjgl.js
 *
 * Adapter GJGL (Global Junior Golf Live).
 *
 * Lê todos os gjgl_{slug}.json em public/data/gjgl/.
 *
 * Fonte FRACA: sem licenças nem DOB exacta — matching por nome+país.
 * O GJGL expõe birthYearEst (derivado do gradYear) → dobRange anual, que o
 * identity-matcher usa como evidência compatível no Pass 2.
 * Só entram os escalões juvenis U14/U18 (U23 é fora do âmbito Sub-18).
 */

const path = require("path");
const { DATA, readJsonSafe, listFiles } = require("../util/io");
const { displayName, splitName, countryToIso2 } = require("../util/names");

const SOURCE_ID = "gjgl";
const SOURCE_LABEL = "Global Junior Golf Live";

function seriesFor(tournament) {
  const n = String(tournament || "").replace(/\b20\d{2}\b/g, "").trim();
  if (!n) return { id: "gjgl", label: "GJGL" };
  const id = "gjgl-" + n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return { id, label: n };
}

function load() {
  const files = listFiles(DATA.gjglDir, DATA.gjglPattern);
  const players = [];
  const playerMap = new Map(); // sourceKey → RawPlayer
  const tournaments = [];

  for (const file of files) {
    const data = readJsonSafe(file, null);
    if (!data || !Array.isArray(data.divisions)) continue;

    const sourceKey = path.basename(file).replace(/^gjgl_/, "").replace(/\.json$/, "");
    const name = data.tournament || sourceKey;
    const dateIso = data.start_date || null;
    const year = data.year || (dateIso ? parseInt(dateIso.slice(0, 4), 10) : null);
    const par = Array.isArray(data.par) && data.par.length ? data.par : null;
    const parTotal = typeof data.parTotal === "number" ? data.parTotal
      : (par ? par.reduce((a, b) => a + (b || 0), 0) : null);
    const series = seriesFor(name);

    const flights = [];
    for (const div of data.divisions) {
      const ak = typeof div.ak === "number" ? div.ak : parseInt(div.ageGroup?.replace(/\D/g, "") || "", 10);
      if (!Number.isFinite(ak) || ak > 18) continue; // U23 fora do âmbito juvenil
      const plist = Array.isArray(div.players) ? div.players : [];
      if (!plist.length) continue;

      const results = [];
      for (const pl of plist) {
        const playerName = displayName(splitName(pl.name || ""));
        if (!playerName) continue;
        const iso = countryToIso2(pl.country) || null;
        const key = pl.playerKey ? String(pl.playerKey) : `${playerName.toLowerCase()}|${iso || ""}`;
        const sex = pl.gender === "m" ? "M" : pl.gender === "f" ? "F" : null;
        const existing = playerMap.get(key);
        if (!existing) {
          const by = typeof pl.birthYearEst === "number" ? pl.birthYearEst : null;
          playerMap.set(key, {
            sourceKey: key,
            name: playerName,
            country: iso,
            sex,
            club: pl.club || null,
            hcp: typeof pl.hcp === "number" ? pl.hcp : null,
            dobRange: by ? { lo: `${by}-01-01`, hi: `${by}-12-31` } : undefined,
            extra: {
              countryName: pl.country || null,
              gradYear: pl.gradYear || null,
              birthYearEst: by,
            },
          });
        } else {
          if (!existing.club && pl.club) existing.club = pl.club;
          if (existing.hcp == null && typeof pl.hcp === "number") existing.hcp = pl.hcp;
        }
        const rounds = (Array.isArray(pl.rounds) ? pl.rounds : []).map((r, i) => ({
          round: r.day || i + 1,
          gross: typeof r.gross === "number" ? r.gross : null,
          strokes: Array.isArray(r.scores) ? r.scores : undefined,
        }));
        results.push({
          playerSourceKey: key,
          playerName,
          pos: typeof pl.pos === "number" ? pl.pos : null,
          status: rounds.length ? "OK" : "DNS",
          totalGross: typeof pl.total === "number" ? pl.total : null,
          toPar: typeof pl.toPar === "number" ? pl.toPar : null,
          rounds,
        });
      }
      if (!results.length) continue;

      flights.push({
        flightKey: `u${ak}`,
        label: div.ageGroup || `U${ak}`,
        ageMin: null,
        ageMax: ak,
        sex: null, // GJGL mistura M/F na mesma divisão; sexo fica no jogador
        par: par || undefined,
        fieldSize: results.length,
        results,
      });
    }
    if (!flights.length) continue;

    tournaments.push({
      sourceKey,
      name,
      date: dateIso,
      startDate: dateIso,
      endDate: data.end_date || undefined,
      year,
      seriesId: series.id,
      seriesLabel: series.label,
      course: data.course || null,
      parTotal,
      holesPerRound: par ? par.filter((p) => p > 0).length : 18,
      rounds: typeof data.rounds === "number" ? data.rounds : undefined,
      flights,
      links: [
        data.tour_url ? { label: "GJGL", url: data.tour_url } : null,
        data.livescoring_url ? { label: "Live Scoring", url: data.livescoring_url } : null,
      ].filter(Boolean),
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
