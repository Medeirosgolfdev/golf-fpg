'use strict';

/**
 * fix-pt-local-tour-course-info.js
 *
 * Os ficheiros uskids_torneios_completos(23..28).json foram criados com
 * `course_info.R1.holes` vazio porque o scraper procurou no `flight_courses`
 * por `flight_id` quando o índice correcto é `flight_round_id`.
 *
 * O mapping correcto:
 *   flight_rounds[frId].flight === flightId  &&  flight_rounds[frId].round === 1
 *   → flight_courses[frId].pars / lengths     (par e jardas por buraco)
 *
 * Este script:
 *   1) Lê cada um dos 6 ficheiros
 *   2) Mapeia flight → flight_round correcto
 *   3) Popula course_info.R1.holes com par+length
 *   4) Adiciona course_name (ex: "Ribagolfe Lakes" via courses[course_id])
 *   5) Define o `course` em cada round do flight_players (course_id)
 *
 * Uso:
 *   node scripts/fix-pt-local-tour-course-info.js          (dry-run)
 *   node scripts/fix-pt-local-tour-course-info.js --apply  (escreve)
 */

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const DIR = path.join(__dirname, '..', 'public', 'data');

const FILES = [23, 24, 25, 26, 27, 28].map(n => path.join(DIR, `uskids_torneios_completos(${n}).json`));

for (const fn of FILES) {
  if (!fs.existsSync(fn)) {
    console.warn(`⚠️  ${fn} não existe — saltado`);
    continue;
  }
  const d = JSON.parse(fs.readFileSync(fn, 'utf8'));
  console.log(`\n▶ ${path.basename(fn)}  tcode=${d.signupanytime_t}  ${d.name}`);

  const flightRounds = d.flight_rounds || {};
  const flightCourses = d.flight_courses || {};
  const courses = d.courses || {};

  // Construir índice: flightId → { frId, courseId, pars, lengths }
  const flightToRound = {};
  for (const [frId, fr] of Object.entries(flightRounds)) {
    const fid = String(fr.flight);
    if (!fr || fr.round !== 1) continue;
    flightToRound[fid] = {
      frId,
      courseId: fr.course,
      courseName: courses[fr.course]?.name?.trim() || '',
      pars: flightCourses[frId]?.pars || null,
      lengths: flightCourses[frId]?.lengths || null,
    };
  }

  let flightsFixed = 0, playersTouched = 0;
  for (const [fid, fl] of Object.entries(d.flights || {})) {
    const info = flightToRound[fid];
    if (!info) continue;

    // Construir holes a partir dos pars (filtra zeros à direita = buracos não jogados)
    let pars = info.pars || [];
    let lengths = info.lengths || [];
    // Determinar nº real de holes (pars > 0)
    let nHoles = 0;
    for (let i = 0; i < pars.length; i++) {
      if (pars[i] && pars[i] > 0) nHoles = Math.max(nHoles, i + 1);
    }
    // Algumas idades jogam 18 (Boys 11+, Girls 11+) — manter array completo
    // mas só popular o que tem par real
    const holes = pars.map((p, i) => ({ par: p || 0, length: lengths[i] || 0 }));

    fl.course_info = fl.course_info || {};
    fl.course_info.R1 = {
      holes,
      course_id: info.courseId,
      course_name: info.courseName,
      total_par: pars.reduce((s, p) => s + (p || 0), 0),
      total_yards: lengths.reduce((s, p) => s + (p || 0), 0),
      n_holes: nHoles
    };
    flightsFixed++;

    // Para cada jogador, garantir que round.course aponta ao course_id
    for (const [pid, pl] of Object.entries(fl.flight_players || {})) {
      for (const [rn, r] of Object.entries(pl.rounds || {})) {
        if (rn !== '1') continue;
        if (!r.course) r.course = info.courseId;
        if (!r.course_name) r.course_name = info.courseName;
        playersTouched++;
      }
    }
  }
  console.log(`  flights fixed: ${flightsFixed}/${Object.keys(d.flights||{}).length}, player-rounds touched: ${playersTouched}`);

  if (APPLY) {
    fs.writeFileSync(fn, JSON.stringify(d, null, 2));
    console.log(`  ✓ Escrito.`);
  }
}

if (!APPLY) {
  console.log(`\nDRY-RUN — para aplicar: node scripts/fix-pt-local-tour-course-info.js --apply`);
}
