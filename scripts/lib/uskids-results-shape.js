'use strict';
/**
 * scripts/lib/uskids-results-shape.js
 *
 * Formato das voltas do uskids-results.json, partilhado entre o
 * fetch-uskids-results.js (scrape) e o build-uskids-edicoes-anteriores.js
 * (edições anteriores montadas a partir da uskids-rich-flight-cache). Extraído
 * a 20/10/2026 sem mudar a lógica.
 */

function construirMapaCursos(meta) {
  const flightCourses = meta.flight_courses || {};
  const flightRounds  = meta.flight_rounds  || {};
  const coursesRaw    = meta.courses        || {};
  const teeMarkersRaw = meta.teeMarkers     || {};

  // flightId → { roundNum → courseInfo }
  const mapa = {};

  for (const [frId, fc] of Object.entries(flightCourses)) {
    const fr = flightRounds[frId] || {};
    const flightId = String(fr.flight || '');
    const roundNum = fr.round || 1;
    const courseId = fc.course || fr.course || null;
    const courseName = courseId && coursesRaw[courseId] ? coursesRaw[courseId].name : '';

    const pars    = fc.pars    || [];
    const lengths = fc.lengths || [];

    // Construir array de buracos (filtrar zeros = não jogados)
    const holes = [];
    for (let i = 0; i < pars.length; i++) {
      if (pars[i] > 0 || lengths[i] > 0) {
        holes.push({ number: i + 1, par: pars[i] || 0, yards: lengths[i] || 0 });
      }
    }

    const totalPar   = holes.reduce((s, h) => s + h.par, 0);
    const totalYards = holes.reduce((s, h) => s + h.yards, 0);

    // Par array limpo (só buracos jogados) para compatibilidade com leaderboard
    const parClean = holes.map(h => h.par);

    if (!mapa[flightId]) mapa[flightId] = {};
    mapa[flightId][roundNum] = {
      flightRoundId: frId,
      courseId:       courseId ? String(courseId) : null,
      courseName,
      startingHole:  fr.starting_hole || '1',
      date:          fr.date || null,
      numHoles:      holes.length,
      totalPar,
      totalYards,
      par:           parClean,
      yards:         holes.map(h => h.yards),
      holes,
      pars_raw:      pars,
      lengths_raw:   lengths,
    };
  }

  return mapa;
}

// Buscar par/yards para um flight e ronda a partir do mapa construído do GetMeta
function buscarParDoMapa(mapaCursos, fid, ronda) {
  const flightInfo = mapaCursos[fid];
  if (!flightInfo) return { par: [], yards: [], courseName: '', totalPar: 0, totalYards: 0, numHoles: 0 };
  const roundInfo = flightInfo[ronda];
  if (!roundInfo) return { par: [], yards: [], courseName: '', totalPar: 0, totalYards: 0, numHoles: 0 };
  return {
    par:        roundInfo.par,
    yards:      roundInfo.yards,
    courseName: roundInfo.courseName,
    totalPar:   roundInfo.totalPar,
    totalYards: roundInfo.totalYards,
    numHoles:   roundInfo.numHoles,
    holes:      roundInfo.holes,
  };
}

// Calcular to_par e ordenar leaderboard.
// Volta encurtada (PGA Golf Club Invitational 2026, Boys 12: R2 só com 9
// buracos) — a USKids manda -1 nos buracos por jogar: passam a 0 e o ±par
// conta só o par dos buracos jogados (antes dava −38 contra o par de 18).
function calcularLeaderboard(jogadores, par) {
  const totalPar = par.reduce((s, p) => s + p, 0) || 72;
  return jogadores
    .filter(j => j.score > 0)
    .map(j => {
      const strokes = Array.isArray(j.strokes) ? j.strokes.map(s => (s > 0 ? s : 0)) : j.strokes;
      const jogados = Array.isArray(strokes) ? strokes.map((s, i) => (s > 0 ? i : -1)).filter(i => i >= 0) : [];
      if (jogados.length && jogados.length < par.length && Array.isArray(j.strokes) && j.strokes.some(s => s < 0)) {
        const score = jogados.reduce((s, i) => s + strokes[i], 0);
        const parJogado = jogados.reduce((s, i) => s + (par[i] || 0), 0);
        return { ...j, strokes, score, buracos: jogados.length, to_par: score - parJogado };
      }
      return { ...j, strokes, to_par: j.score > 0 ? j.score - totalPar : null };
    })
    .sort((a, b) => (a.score || 999) - (b.score || 999));
}

module.exports = { construirMapaCursos, buscarParDoMapa, calcularLeaderboard };
