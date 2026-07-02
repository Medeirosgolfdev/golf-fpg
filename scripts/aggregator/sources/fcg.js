/**
 * scripts/aggregator/sources/fcg.js
 *
 * Adapter FCG (Federació Catalana de Golf, via golfdirecto.com).
 *
 * Lê:
 *   - fcg-rivals.json (gerado por scripts/build-fcg-rivals.js)
 *
 * Fonte FRACA no identity-matcher: as licenças FCG (ex: "CB35994870") vivem
 * num keyspace diferente das licenças RFEG, por isso NÃO pode partilhar o
 * sourceId "rfeg" (violaria o invariante de 1 chave forte por fonte quando o
 * mesmo miúdo tem licença RFEG + FCG). O merge cross-source faz-se por
 * nome+DOB — ~58% dos jogadores FCG têm DOB, o que dá matching forte.
 */

const { DATA, readJsonSafe } = require("../util/io");
const { displayName, splitName, dobToIso, countryToIso2, normName } = require("../util/names");

const SOURCE_ID = "fcg";
const SOURCE_LABEL = "Federació Catalana de Golf";

// Escalões juvenis FCG. "Other" agrega categorias adultas/handicap — fora.
const JUVENILE_AGE = /^(Benjam[íi]n|Alev[íi]n|Infantil|Cadete|Junior|Juvenil|Sub-?1[0-8])$/i;

function ageRange(ag) {
  const s = String(ag || "").toLowerCase();
  if (s.startsWith("benjam")) return { ageMin: 9, ageMax: 10 };
  if (s.startsWith("alev")) return { ageMin: 11, ageMax: 12 };
  if (s.startsWith("infantil")) return { ageMin: 13, ageMax: 14 };
  if (s.startsWith("cadete")) return { ageMin: 15, ageMax: 16 };
  if (s.startsWith("junior") || s.startsWith("juvenil")) return { ageMin: 17, ageMax: 18 };
  return { ageMin: null, ageMax: null };
}

function seriesFor(name) {
  const n = String(name || "");
  if (/Copa Catalunya/i.test(n)) return { id: "fcg-copa-catalunya", label: "Copa Catalunya" };
  if (/Campionat|Campeonato/i.test(n)) return { id: "fcg-campionat", label: "Campionat de Catalunya" };
  if (/Circuit/i.test(n)) return { id: "fcg-circuit", label: "Circuit Juvenil FCG" };
  return { id: "fcg", label: "FCG" };
}

function load() {
  const rivals = readJsonSafe(DATA.fcgRivals, { torneios: {} });
  const players = [];
  const playerMap = new Map(); // sourceKey → RawPlayer
  const tournaments = [];

  function resolveKey(pl) {
    if (pl.license) return String(pl.license);
    const nk = normName(splitName(pl.n || pl.name || ""));
    return nk ? `anon|${nk}` : null;
  }

  function collectPlayer(key, pl) {
    if (!key) return;
    const prev = playerMap.get(key);
    const dob = dobToIso(pl.dobIso || pl.dob) || prev?.dob || null;
    const entry = {
      sourceKey: key,
      name: displayName(splitName(pl.n || pl.name || "")) || prev?.name || null,
      dob,
      sex: pl.sex || prev?.sex || null,
      country: countryToIso2(pl.country) || prev?.country || "ES",
      club: pl.club || prev?.club || null,
      hcp: typeof pl.hcpExact === "number" ? pl.hcpExact : (prev?.hcp ?? null),
      extra: { fcgLicense: pl.license || null },
    };
    if (!prev || (dob && !prev.dob)) playerMap.set(key, entry);
  }

  for (const [tid, t] of Object.entries(rivals.torneios || {})) {
    if (!t) continue;
    if (!JUVENILE_AGE.test(String(t.ageGroup || ""))) continue;
    const plist = Array.isArray(t.players) ? t.players : [];
    if (!plist.length) continue;

    const results = plist.map((pl) => {
      const rd = Array.isArray(pl.rd) ? pl.rd : [];
      const sc = Array.isArray(pl.sc) ? pl.sc : [];
      const rounds = [];
      const nRds = Math.max(rd.length, sc.length);
      for (let i = 0; i < nRds; i++) {
        rounds.push({
          round: i + 1,
          gross: typeof rd[i] === "number" ? rd[i] : null,
          strokes: Array.isArray(sc[i]) ? sc[i] : undefined,
        });
      }
      const key = resolveKey(pl);
      collectPlayer(key, pl);
      return {
        playerSourceKey: key,
        playerName: displayName(splitName(pl.n || pl.name || "")),
        pos: typeof pl.p === "number" ? pl.p : null,
        status: "OK",
        totalGross: typeof pl.t === "number" ? pl.t : null,
        toPar: typeof pl.tp === "number" ? pl.tp : null,
        rounds,
      };
    });

    const { ageMin, ageMax } = ageRange(t.ageGroup);
    const series = seriesFor(t.gameName || t.name);
    tournaments.push({
      sourceKey: tid,
      name: t.gameName || t.name || `FCG ${tid}`,
      date: t.dateIso || null,
      startDate: t.dateIso || null,
      year: t.year || (t.dateIso ? parseInt(t.dateIso.slice(0, 4), 10) : null),
      seriesId: series.id,
      seriesLabel: series.label,
      course: t.courseName || t.club || null,
      parTotal: typeof t.parTotal === "number" ? t.parTotal : null,
      holesPerRound: typeof t.nholes === "number" ? t.nholes : 18,
      rounds: typeof t.nRounds === "number" ? t.nRounds : undefined,
      flights: [{
        flightKey: `${String(t.ageGroup).toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${t.gender === "F" ? "f" : t.gender === "M" ? "m" : "x"}`,
        label: [t.ageGroup, t.gender === "F" ? "Femenino" : t.gender === "M" ? "Masculino" : null].filter(Boolean).join(" "),
        ageMin,
        ageMax,
        sex: t.gender === "F" || t.gender === "M" ? t.gender : null,
        par: Array.isArray(t.par) ? t.par : undefined,
        fieldSize: results.length,
        results,
      }],
      links: t.gameId ? [{
        label: "GolfDirecto",
        url: `https://www.golfdirecto.com/micro/game/${t.gameId}/summary?lang=es`,
      }] : [],
    });
  }

  for (const p of playerMap.values()) {
    if (p.name) players.push(p);
  }

  return {
    sourceId: SOURCE_ID,
    sourceLabel: SOURCE_LABEL,
    players,
    tournaments,
  };
}

module.exports = { load, SOURCE_ID, SOURCE_LABEL };
