/*
 * browser-scrape-pt-local-tour-completos.js  (v2)
 *
 * Scrape dos 6 torneios USKids Local Tour Portugal 2023 (tcodes 13702-13707)
 * no formato v2 (compatível com uskids_torneios_completos(N).json).
 *
 * v2 fix: o `flight_courses` no signupanytime é indexado por flight_round_id,
 * NÃO por flight_id. Tem de se passar pelo `flight_rounds` para resolver
 * o mapping. Esta versão populates correctamente:
 *   - course_info.R1.holes  [{par, length}, ...]
 *   - course_info.R1.course_id / course_name / total_par / total_yards / n_holes
 *   - flight_players[pid].rounds[1].course (course_id) / course_name
 *
 * Como usar:
 *  1) Abre https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=13702
 *  2) F12 → consola
 *  3) Cola este ficheiro inteiro
 *  4) Aguarda 1-2 min; descarrega `pt-local-tour-completos.json` para Downloads
 *  5) Move para `C:\golf-fpg\data-archive\pt-local-tour-completos.json`
 *  6) Corre `node scripts/split-pt-local-tour-completos.js --apply`
 */

(async function () {
  const TCODES = [13702, 13703, 13704, 13705, 13706, 13707];
  const API = '/plugins/links/admin/LinksAJAX.aspx';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function buildOne(t) {
    await fetch(`/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t}`, {credentials:'include'});
    await sleep(300);
    const meta = await fetch(`${API}?op=GetMeta&t=${t}`, {credentials:'include'}).then(r=>r.json());

    const flightRounds = meta?.flight_rounds || {};
    const flightCourses = meta?.flight_courses || {};
    const courses = meta?.courses || {};
    const ageGroups = meta?.age_groups || {};

    // Mapping flight_id → { frId (flight_round_id), courseId, courseName, pars, lengths }
    const flightToRound = {};
    for (const [frId, fr] of Object.entries(flightRounds)) {
      if (!fr || fr.round !== 1) continue;
      const fid = String(fr.flight);
      flightToRound[fid] = {
        frId,
        courseId: fr.course,
        courseName: (courses[fr.course]?.name || '').trim(),
        pars: flightCourses[frId]?.pars || null,
        lengths: flightCourses[frId]?.lengths || null,
      };
    }

    const out = {
      signupanytime_t: parseInt(t),
      name: meta?.tournament?.name || '',
      start_date: meta?.tournament?.start_date || '',
      end_date: meta?.tournament?.end_date || '',
      age_groups: ageGroups,
      flight_rounds: flightRounds,
      flight_courses: flightCourses,
      courses,
      flights: {}
    };

    const flights = meta?.flights || {};
    let totalPlayers = 0;
    for (const [fid, fl] of Object.entries(flights)) {
      const agId = fl.age_group;
      const agName = ageGroups[agId]?.name || '';
      const info = flightToRound[fid];

      let holes = [];
      let totalPar = 0, totalYards = 0, nHoles = 0, courseId = null, courseName = '';
      if (info) {
        const pars = info.pars || [];
        const lengths = info.lengths || [];
        // signupanytime devolve `lengths` em JARDAS — guardamos como `yards`
        // (o converterTorneioCompleto.ts lê holes[].yards e converte ×0.9144)
        holes = pars.map((p, i) => ({ par: p || 0, yards: lengths[i] || 0 }));
        totalPar = pars.reduce((s, p) => s + (p || 0), 0);
        totalYards = lengths.reduce((s, p) => s + (p || 0), 0);
        for (let i = 0; i < pars.length; i++) if (pars[i] && pars[i] > 0) nHoles = Math.max(nHoles, i + 1);
        courseId = info.courseId;
        courseName = info.courseName;
      }
      const ci = { R1: { holes, course_id: courseId, course_name: courseName, total_par: totalPar, total_yards: totalYards, n_holes: nHoles } };

      let fp = {};
      try {
        const r = await fetch(`${API}?op=GetPlayerTeeTimes&f=${fid}&r=1&p=1&t=1&pt=undefined&jbgr=${Date.now()}&c=1`, {method:'POST', credentials:'include'});
        const d = await r.json();
        fp = d.flight_players || {};
      } catch (e) {
        console.warn(`  ⚠️ flight ${fid}: ${e.message}`);
      }

      // Garantir que cada player.round.course aponta ao courseId
      for (const pl of Object.values(fp)) {
        for (const [rn, r] of Object.entries(pl.rounds || {})) {
          if (rn !== '1') continue;
          if (!r.course && courseId) r.course = courseId;
          if (!r.course_name && courseName) r.course_name = courseName;
        }
      }

      totalPlayers += Object.keys(fp).length;
      out.flights[fid] = {
        flight_id: parseInt(fid),
        age_group: agId,
        category: agName,
        course_info: ci,
        flight_players: fp
      };
      await sleep(100);
    }
    console.log(`  ✓ t=${t} ${out.name}: ${Object.keys(out.flights).length} flights, ${totalPlayers} player entries`);
    return out;
  }

  console.log('▶ Scrape dos 6 tcodes PT Local Tour 2023 (v2 com course_info)...');
  const results = {};
  for (const t of TCODES) {
    results[String(t)] = await buildOne(t);
  }

  const json = JSON.stringify(results);
  console.log(`\n✓ Total: ${Object.keys(results).length} tcodes, ${json.length} bytes`);

  const blob = new Blob([json], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pt-local-tour-completos.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  console.log('✓ Download iniciado: pt-local-tour-completos.json');
})();
