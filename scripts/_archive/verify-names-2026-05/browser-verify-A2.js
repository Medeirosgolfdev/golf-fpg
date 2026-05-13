/*
 * browser-verify-A2.js
 *
 * COLA NA CONSOLA DO BROWSER (F12) - NAO uses node.
 *
 * Bucket A2: mids idx 220-609 do bucket A original (390 mids).
 * Sequela do verify-A que ja completou os primeiros 220.
 *
 * Output: verified-names-A2.json + checkpoints verified-names-A2-checkpoint-NNNN.json
 *
 * Estimativa: 390 mids * ~13s = ~85 min, paralelizavel com A3.
 */

(async function () {
  const CONFIG = {
    BUCKET: 'A2',
    SAMPLE_SIZE: 500,
    CHECKPOINT_EVERY: 20,
    SLEEP_MS: 100,
    MIDS: ["529586", "534955", "537593", "550878", "554788", "567208", "460115", "502982", "527513", "536628", "538262", "549109", "560011", "511150", "538547", "553075", "553314", "562887", "499274", "506368", "528657", "534184", "539686", "508296", "519363", "541746", "552640", "563793", "505860", "509269", "510039", "520188", "530023", "540138", "548094", "549598", "574028", "605001", "500160", "530013", "532081", "555689", "559656", "561267", "566606", "534061", "559876", "567061", "567073", "500063", "517661", "520306", "521542", "540989", "544026", "551676", "574154", "485670", "493329", "495440", "499840", "516138", "516252", "519568", "530685", "534604", "539290", "575553", "584933", "488391", "491447", "507432", "512228", "530855", "532267", "542189", "550599", "566540", "580029", "584331", "482570", "510996", "528480", "532309", "536578", "538216", "539273", "544442", "560522", "583566", "509587", "519825", "525150", "527989", "528927", "538436", "550989", "551244", "557970", "560420", "567015", "577617", "513927", "524769", "527465", "548188", "549238", "551649", "552166", "558847", "571836", "581409", "470281", "496576", "519098", "521132", "523076", "523593", "531237", "539994", "551314", "553267", "555359", "557741", "558618", "569566", "582055", "508446", "522061", "524557", "529514", "536264", "540830", "549364", "552478", "556226", "568689", "509026", "529149", "533072", "553303", "556634", "558828", "570615", "507389", "527659", "529913", "542264", "554643", "556927", "558304", "560995", "572441", "577185", "580657", "495185", "501525", "517534", "527609", "541572", "547907", "553111", "554136", "559453", "570143", "572298", "579597", "505538", "520581", "529401", "530042", "540081", "542992", "543221", "555019", "555979", "556300", "558990", "563043", "570048", "579916", "587307", "469770", "497799", "503742", "506140", "512312", "512781", "553441", "555733", "557954", "560288", "560547", "569743", "519003", "522802", "529054", "530018", "538350", "543730", "552004", "556043", "559226", "570938", "572508", "580202", "506621", "515709", "516978", "523984", "525035", "526416", "527032", "532669", "543959", "548494", "549782", "551677", "555293", "556224", "558366", "561894", "513791", "533256", "535550", "537329", "542085", "543393", "543782", "548074", "551452", "552122", "555182", "565204", "590963", "508606", "509055", "512450", "513311", "525340", "527576", "531137", "534685", "535517", "539790", "561259", "561318", "561442", "566829", "584280", "598588", "498914", "509402", "515861", "516712", "528085", "539262", "542045", "542146", "551747", "551849", "558681", "571408", "575116", "595132", "470865", "490477", "490807", "513898", "521026", "527313", "530880", "538336", "543338", "548427", "553935", "560025", "561280", "567062", "573269", "513338", "532576", "536776", "549788", "554329", "557792", "569543", "569544", "569569", "583312", "488196", "539533", "540165", "548701", "554477", "557515", "571337", "571503", "584115", "531614", "531668", "532915", "536580", "551356", "552207", "553912", "556081", "563320", "572116", "574468", "580389", "508879", "524323", "526417", "531021", "535444", "539760", "552871", "556783", "557500", "564096", "568395", "576473", "583703", "501617", "501815", "504219", "506221", "506882", "519736", "531652", "535189", "536115", "555166", "561699", "576196", "514613", "518670", "526664", "544639", "550948", "554738", "555309", "557019", "561018", "562318", "567622", "571002", "571143", "572089", "503943", "537106", "544398", "553900", "571353", "580880", "604762", "532341", "543388", "543962", "553304", "561088", "571066", "599625", "499379", "517755", "525641", "527035", "534981", "535390", "541165", "543063", "543220", "547959", "551719", "551798", "553638", "557539", "559249", "568396", "575413", "590169", "521636", "527722", "528394", "540349", "549151", "555961", "556320", "561777"],
  };

  const API = '/plugins/links/admin/LinksAJAX.aspx';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function getTournResults(mid) {
    return fetch(`${API}?op=GetMemberTournamentResults&m=${mid}`, {credentials:'include'}).then(r=>r.json());
  }
  async function getMeta(tcode) {
    return fetch(`${API}?op=GetMeta&t=${tcode}`, {credentials:'include'}).then(r=>r.json());
  }
  async function getFlightPlayers(tcode, fid) {
    await fetch(`/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${tcode}`, {credentials:'include'});
    await sleep(200);
    const r = await fetch(`${API}?op=GetPlayerTeeTimes&f=${fid}&r=1&p=1&t=1&pt=undefined&jbgr=${Date.now()}&c=1`, {method:'POST', credentials:'include'});
    return (await r.json()).flight_players || {};
  }
  async function resolveOne(mid) {
    const data = await getTournResults(mid);
    const tids = Object.keys(data || {});
    if (!tids.length) return { mid, resolved: false, reason: 'sem torneios USKids' };
    const candidates = tids
      .map(tid => ({ tid, t: data[tid] }))
      .filter(({ t }) => t.p_strokes && Number(t.p_strokes) > 0 && t.p_age_group)
      .sort((a, b) => (b.t.t_start_date || '').localeCompare(a.t.t_start_date || ''));
    if (!candidates.length) return { mid, resolved: false, reason: 'sem gross valido' };
    for (const { tid, t } of candidates.slice(0, 3)) {
      const meta = await getMeta(tid);
      const ageGroups = meta?.age_groups || {};
      let fid = null;
      for (const [f, fl] of Object.entries(meta?.flights || {})) {
        if (ageGroups[fl.age_group]?.name === t.p_age_group) { fid = f; break; }
      }
      if (!fid) continue;
      await sleep(CONFIG.SLEEP_MS);
      const fp = await getFlightPlayers(tid, fid);
      const r1strokes = t.p_rounds?.['1']?.strokes;
      if (!r1strokes) continue;
      const ourKey = r1strokes.join(',');
      for (const [, pl] of Object.entries(fp)) {
        const plStrokes = pl.rounds?.[1]?.strokes;
        if (!plStrokes) continue;
        if (plStrokes.join(',') === ourKey) {
          const name = `${(pl.first || '').trim()} ${(pl.last || '').trim()}`.trim();
          if (name) return { mid, resolved: true, name, country: (pl.country || '').toUpperCase(), via: `${tid}:${t.p_age_group}:strokes` };
        }
      }
      await sleep(CONFIG.SLEEP_MS);
    }
    return { mid, resolved: false, reason: 'sem match strokes em 3 tcodes' };
  }

  const mids = CONFIG.MIDS.slice(0, CONFIG.SAMPLE_SIZE);
  const N = mids.length;
  const checkpointEvery = CONFIG.CHECKPOINT_EVERY;
  const FINAL = `verified-names-${CONFIG.BUCKET}.json`;
  const CKPT_PREFIX = `verified-names-${CONFIG.BUCKET}-checkpoint`;
  console.log(`> VERIFY bucket ${CONFIG.BUCKET}: ${N} mids (checkpoint a cada ${checkpointEvery})...`);
  const results = [];
  const startTs = Date.now();
  for (let i = 0; i < N; i++) {
    const mid = mids[i];
    try {
      const r = await resolveOne(mid);
      results.push(r);
      const tag = r.resolved ? 'OK' : 'XX';
      const msg = r.resolved ? `-> ${r.name} (${r.country})` : `- ${r.reason}`;
      console.log(`  [${i+1}/${N}] ${tag} ${mid} ${msg}`);
    } catch (e) {
      results.push({ mid, resolved: false, reason: 'exception: ' + e.message });
      console.warn(`  [${i+1}/${N}] !! ${mid} - erro: ${e.message}`);
    }
    await sleep(CONFIG.SLEEP_MS);

    const done = i + 1;
    const isLast = done === N;
    if (done % checkpointEvery === 0 || isLast) {
      const elapsedMin = ((Date.now() - startTs) / 60000).toFixed(1);
      const fname = isLast ? FINAL : `${CKPT_PREFIX}-${String(done).padStart(4, '0')}.json`;
      const resolvedCount = results.filter(r => r.resolved).length;
      const out = {
        gerado_em: new Date().toISOString(),
        mode: 'VERIFY',
        bucket: CONFIG.BUCKET,
        progress: { done, total: N, resolved: resolvedCount, elapsed_min: Number(elapsedMin) },
        results,
      };
      downloadJSON(out, fname);
      console.log(`  >> Checkpoint ${done}/${N} - resolvidos: ${resolvedCount} (${elapsedMin}min) -> ${fname}`);
    }
  }
  const resolvedCount = results.filter(r => r.resolved).length;
  console.log(`> Concluido bucket ${CONFIG.BUCKET}: ${resolvedCount}/${N}. Final: ${FINAL}`);
})();
