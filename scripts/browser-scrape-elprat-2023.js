/*
 * browser-scrape-elprat-2023.js
 *
 * Scrape do t=15573 (Real Club de Golf El Prat, Out 2023, 9H) — flights Boys 8/9/10
 * no formato v2 (compatível com uskids_torneios_completos(N).json).
 *
 * O Manuel jogou este torneio mas com a conta USKids antiga (mid diferente do 630106).
 * Este scrape vai descobrir esse mid antigo via cross-reference.
 *
 * Como usar:
 *  1) Abre https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=2760&t=15573
 *     (ax=2760 é o "El Prat" — o ax padrão 1129 pode não cobrir este; testa primeiro)
 *     Se 2760 não funcionar, tenta ax=1129.
 *  2) F12 → consola
 *  3) Cola este ficheiro inteiro
 *  4) Aguarda ~30s; descarrega `elprat-2023.json` para Downloads
 *  5) Move para `C:\golf-fpg\data-archive\elprat-2023.json`
 *  6) Corre `node scripts/integrate-elprat-2023.js --apply`
 */

(async function () {
  const TCODE = 15573;
  const TARGET_AGE_NAMES = ['Boys 8', 'Boys 9', 'Boys 10'];
  const API = '/plugins/links/admin/LinksAJAX.aspx';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Tentar primeiro ax=2760, depois ax=1129
  let metaWorks = null;
  for (const ax of [2760, 1129]) {
    await fetch(`/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=${ax}&t=${TCODE}`, {credentials:'include'});
    await sleep(400);
    try {
      const m = await fetch(`${API}?op=GetMeta&t=${TCODE}`, {credentials:'include'}).then(r=>r.json());
      if (m?.flights && Object.keys(m.flights).length) { metaWorks = { ax, meta: m }; break; }
    } catch {}
  }
  if (!metaWorks) {
    console.error('❌ Não consegui obter GetMeta. Tenta abrir o iframe à mão primeiro.');
    return;
  }
  const meta = metaWorks.meta;
  console.log(`▶ ax=${metaWorks.ax}, torneio: ${meta?.tournament?.name}`);

  const ageGroups = meta?.age_groups || {};
  const flights = meta?.flights || {};
  const flightRounds = meta?.flight_rounds || {};
  const flightCourses = meta?.flight_courses || {};
  const courses = meta?.courses || {};

  // Mapping flight_id → flight_round → pars
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
    signupanytime_t: TCODE,
    name: meta?.tournament?.name || '',
    start_date: meta?.tournament?.start_date || '',
    end_date: meta?.tournament?.end_date || '',
    age_groups: ageGroups,
    flight_rounds: flightRounds,
    flight_courses: flightCourses,
    courses,
    flights: {}
  };

  for (const [fid, fl] of Object.entries(flights)) {
    const agName = ageGroups[fl.age_group]?.name || '';
    if (!TARGET_AGE_NAMES.includes(agName)) continue;
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

    out.flights[fid] = {
      flight_id: parseInt(fid),
      age_group: fl.age_group,
      category: agName,
      course_info: ci,
      flight_players: fp
    };
    console.log(`  ✓ ${agName} (fid=${fid}): ${Object.keys(fp).length} jogadores`);
    await sleep(120);
  }

  const json = JSON.stringify(out);
  console.log(`\n✓ ${Object.keys(out.flights).length} flights, ${json.length} bytes`);
  const blob = new Blob([json], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'elprat-2023.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  console.log('✓ Download iniciado: elprat-2023.json');
})();
