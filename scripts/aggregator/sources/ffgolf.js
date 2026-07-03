/**
 * scripts/aggregator/sources/ffgolf.js
 *
 * Adapter FFGolf (Fédération française de golf).
 *
 * Lê:
 *   - france-players.json (roster por byName, ~12191 jogadores com hcp+clube+região)
 *   - ffgolf-juniors-slim.json (torneios juvenis FFG: GP Jeunes + Championnats)
 *   - ffgolf-resultats-index.json (índice de torneios; metadata mas sem resultados)
 *
 * FFG NÃO expõe DOB no portal. Cross-source pode preencher via USKids/RFEG.
 */

const { DATA, readJsonSafe } = require("../util/io");
const { displayName, dobToIso, countryToIso2, normName } = require("../util/names");
const { seriesId } = require("../util/id");

const SOURCE_ID = "ffgolf";
const SOURCE_LABEL = "Fédération française de golf";

function load(opts) {
  const france = readJsonSafe(DATA.ffgFrancePlayers, { byName: {} });
  const slim = readJsonSafe(DATA.ffgJuniorsSlim, { tournaments: [] });

  // 1) Roster — agrupar por licença (france-players.json tem byName com várias entries por jogador)
  const byLic = new Map();
  for (const [, p] of Object.entries(france.byName || {})) {
    if (!p?.license) continue;
    const lic = String(p.license);
    const existing = byLic.get(lic);
    // Preferir a entrada com nome capitalizado normalmente (não-ALLCAPS)
    if (!existing) byLic.set(lic, p);
    else if (isBetterName(p.name, existing.name)) byLic.set(lic, p);
  }

  const players = [];
  for (const [lic, p] of byLic) {
    const country = countryToIso2(p.country) || "FR";
    const cleanName = displayName(p.name || "");
    if (!cleanName) continue;
    players.push({
      sourceKey: lic,
      name: cleanName,
      sex: p.sex || null,
      country,
      region: p.region || null,
      club: p.club ? String(p.club).trim() : null,
      hcp: typeof p.hcp === "number" ? p.hcp : null,
      extra: {
        glfLic: p.glfLic || null,
      },
    });
  }

  // 2) Torneios — o slim tem UMA entrada por (trnId, série/escalão). Agrupar
  // por trnId num único torneio multi-flight: o id canónico é
  // `ffgolf-{trnId}` e ids duplicados fariam o tournamentById do kids2
  // guardar só o último flight (os outros escalões desapareciam do lookup).
  const tournaments = [];
  const byTrn = new Map(); // trnId → tournament normalizado (flights acumulados)
  const playersByLic = new Map(players.map((p) => [p.sourceKey, p]));
  for (const t of slim.tournaments || []) {
    const tt = normalizeFfgTournament(t);
    if (tt) {
      const prev = byTrn.get(tt.sourceKey);
      if (!prev) {
        byTrn.set(tt.sourceKey, tt);
      } else {
        for (const f of tt.flights) {
          // O portal lista o mesmo torneio em várias ligas com subsets
          // diferentes de jogadores — em colisão de flightKey ganha o flight
          // mais completo (mais resultados).
          const i = prev.flights.findIndex((x) => x.flightKey === f.flightKey);
          if (i === -1) prev.flights.push(f);
          else if (f.results.length > prev.flights[i].results.length) prev.flights[i] = f;
        }
      }
    }
    // 2b) hcpHistory: snapshot por participação (date + hcp)
    if (t && t.dateIso && Array.isArray(t.players)) {
      const date = String(t.dateIso).slice(0, 10);
      const tid = String(t.trnId || "");
      const label = t.name || ("FFG " + tid);
      for (const pl of t.players) {
        if (!pl || typeof pl.hcp !== "number") continue;
        const lic = pl.license ? String(pl.license) : null;
        if (!lic) continue;
        let player = playersByLic.get(lic);
        if (!player) {
          const cleanName = displayName(pl.name || "");
          if (!cleanName) continue;
          player = {
            sourceKey: lic, name: cleanName, country: "FR",
            club: pl.club || null, hcp: pl.hcp, extra: {},
          };
          players.push(player);
          playersByLic.set(lic, player);
        }
        if (!player.hcpHistory) player.hcpHistory = [];
        player.hcpHistory.push({ date, hcpExact: pl.hcp, source: "ffg", tcode: tid, label });
      }
    }
  }
  tournaments.push(...byTrn.values());

  return {
    sourceId: SOURCE_ID,
    sourceLabel: SOURCE_LABEL,
    players,
    tournaments,
  };
}

function isBetterName(candidate, current) {
  if (!candidate) return false;
  if (!current) return true;
  // Title Case > ALL CAPS
  const ucCand = (candidate.match(/[A-Z]/g) || []).length;
  const lcCand = (candidate.match(/[a-z]/g) || []).length;
  const ucCur = (current.match(/[A-Z]/g) || []).length;
  const lcCur = (current.match(/[a-z]/g) || []).length;
  const candRatio = ucCand / Math.max(1, ucCand + lcCand);
  const curRatio = ucCur / Math.max(1, ucCur + lcCur);
  return candRatio < curRatio;
}

function normalizeFfgTournament(t) {
  if (!t || !t.trnId) return null;
  const series = ffgSeries(t);
  const flightLabel = t.serieLabel || t.ageGroup || "Geral";
  // Sexo a partir do código da série: sufixo F/G ("U12F", "BenG", "MINF")
  // ou prefixo H//F/ ("H/U12" = Garçons, "F/U12" = Filles).
  const sl = (t.serieLabel || "").trim().toUpperCase();
  const sex = sl.endsWith("F") ? "F" : sl.endsWith("G") ? "M"
    : sl.startsWith("H/") ? "M" : sl.startsWith("F/") ? "F" : null;

  const flightPlayers = Array.isArray(t.players) ? t.players : [];
  const results = flightPlayers.map((pl) => ({
    playerSourceKey: pl.license ? String(pl.license) : null,
    playerName: displayName(pl.name || ""),
    pos: typeof pl.pos === "number" ? pl.pos : null,
    status: "OK",
    totalGross: typeof pl.total === "number" ? pl.total : null,
    toPar: null,
    rounds: Array.isArray(pl.rounds) ? pl.rounds.map((r) => ({
      round: r.r,
      gross: typeof r.gross === "number" ? r.gross : null,
      strokes: Array.isArray(r.scores) ? r.scores : undefined,
    })) : [],
  }));

  return {
    sourceKey: String(t.trnId),
    name: t.name || `FFG ${t.trnId}`,
    date: t.dateIso || null,
    startDate: t.dateIso || null,
    seriesId: series.id,
    seriesLabel: series.label,
    course: t.courseTerrain || null,
    parTotal: typeof t.parTotal === "number" ? t.parTotal : null,
    flights: [{
      flightKey: (t.serieLabel || "geral").toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label: flightLabel,
      ageMin: typeof t.ageMin === "number" ? t.ageMin : null,
      ageMax: typeof t.ageMax === "number" ? t.ageMax : null,
      sex,
      par: Array.isArray(t.parPerHole) ? t.parPerHole : undefined,
      fieldSize: flightPlayers.length,
      results,
    }],
    // O portal FFG é POST-only (sem URL por torneio) — o deep-link é a nossa
    // página France, que suporta ?t={trnId} e tem os mesmos resultados.
    links: [{
      label: "France",
      url: `/ffg?t=${t.trnId}`,
    }],
    extra: {
      typeCompetition: t.typeCompetition || null,
      ligue: t.ligue || null,
    },
  };
}

function ffgSeries(t) {
  const name = t.name || "";
  if (/GRAND PRIX JEUNES|GP JEUNES/i.test(name)) {
    return { id: "ffgolf-gp-jeunes", label: "GP Jeunes" };
  }
  if (/CHAMPIONNAT|CHAMPS DE FRANCE/i.test(name)) {
    return { id: "ffgolf-championnats-france", label: "Championnats de France" };
  }
  if (/INTERNATIONAUX/i.test(name)) {
    return { id: "ffgolf-internationaux", label: "Internationaux U14/U18" };
  }
  // Fallback por slug do nome sem ano
  const noYear = name.replace(/\b20\d{2}\b/g, "").trim();
  return { id: `ffgolf-${seriesId(noYear)}`, label: noYear };
}

module.exports = { load, SOURCE_ID, SOURCE_LABEL };
