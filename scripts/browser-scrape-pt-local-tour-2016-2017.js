/*
 * browser-scrape-pt-local-tour-2016-2017.js
 *
 * ⚠️ COLA ESTE FICHEIRO NA CONSOLA DO BROWSER (F12) na página signupanytime.
 *    NÃO corras com `node` — não vai funcionar (são fetches autenticados pelo browser).
 *
 * Scrape dos 11 torneios USKids Local Tour Portugal 2016 + 2017:
 *
 *   2016 (5 tcodes):
 *     3120  Quinta do Peru Golf and Country Club    3/Set/2016
 *     3121  Lisbon Sports Club                      18/Set/2016
 *     3123  Ribagolfe Oaks (Ribagolfe I)             6/Nov/2016
 *     3124  Ribagolfe Lakes (Ribagolfe II)          27/Nov/2016
 *     3125  Beloura Pestana — Tour Championship      8/Dez/2016
 *
 *   2017 (6 tcodes):
 *     4168  Quinta do Peru                          10/Jul/2017
 *     4169  Beloura Pestana                         22/Jul/2017
 *     4170  Oeiras Golf                              3/Set/2017
 *     4171  Quinta do Peru                           9/Set/2017
 *     4172  Oeiras Golf — Tour Championship         24/Set/2017
 *     4173  Montado Hotel & Golf Resort             27/Ago/2017
 *
 * Como usar:
 *  1) Abre https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=3120
 *  2) F12 → consola
 *  3) Cola este ficheiro inteiro
 *  4) Aguarda ~3 min; descarrega `pt-local-tour-2016-2017.json` para Downloads
 *  5) Move para `C:\golf-fpg\public\data-archive\pt-local-tour-2016-2017.json`
 *  6) Corre `node scripts/integrate-pt-local-tour-2016-2017.js --apply`
 */

(async function () {
  const TCODES = [
    3120, 3121, 3123, 3124, 3125,                      // 2016
    4168, 4169, 4170, 4171, 4172, 4173,                // 2017
  ];
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

    // Mapping flight_id → flight_round_id (para pars/yards)
    const flightToRound = {};
    for (const [frId, fr] of Object.entries(flightRounds)) {
      if (!fr || fr.round !== 1) continue;
      const fid = String(fr.flight);
      flightToRound[fid] = {
        frId, courseId: fr.course,
        courseName: (courses[fr.course]?.name || '').trim(),
        pars: flightCourses[frId]?.pars || null,
        lengths: flightCourses[frId]?.lengths || null,
      };
    }

    const out = {
      signupanytime_t: t,
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
      const agName = ageGroups[fl.age_group]?.name || '';
      const info = flightToRound[fid];

      let holes = [];
      let totalPar = 0, totalYards = 0, nHoles = 0, courseId = null, courseName = '';
      if (info) {
        const pars = info.pars || [];
        const lengths = info.lengths || [];
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
        age_group: fl.age_group,
        category: agName,
        course_info: ci,
        flight_players: fp
      };
      await sleep(80);
    }
    console.log(`  ✓ t=${t} ${out.name} (${out.start_date}): ${Object.keys(out.flights).length} flights, ${totalPlayers} player entries`);
    return out;
  }

  console.log(`▶ Scrape de ${TCODES.length} tcodes PT Local Tour 2016/2017...`);
  const results = {};
  for (const t of TCODES) {
    try {
      results[String(t)] = await buildOne(t);
    } catch (e) {
      console.error(`  ❌ t=${t} falhou: ${e.message}`);
    }
  }

  const json = JSON.stringify(results);
  console.log(`\n✓ Total: ${Object.keys(results).length} tcodes, ${json.length} bytes`);

  const blob = new Blob([json], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pt-local-tour-2016-2017.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  console.log('✓ Download iniciado: pt-local-tour-2016-2017.json');
})();
