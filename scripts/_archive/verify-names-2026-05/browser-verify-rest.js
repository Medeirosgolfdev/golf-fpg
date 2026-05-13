/*
 * browser-verify-rest.js
 *
 * COLA NA CONSOLA DO BROWSER (F12) - NAO uses node.
 *
 * Cobre os mids idx 350-999 do bucket A original (650 mids).
 * Para correr em paralelo com o verify-A actual que vai chegar a ~350.
 *
 * Output: verified-names-A2.json + checkpoints verified-names-A2-checkpoint-NNNN.json
 * Estimativa: 650 mids * ~13s = ~140 min.
 */

(async function () {
  const CONFIG = {
    BUCKET: 'A2',
    SAMPLE_SIZE: 1000,
    CHECKPOINT_EVERY: 20,
    SLEEP_MS: 100,
    MIDS: ["529514", "536264", "540830", "549364", "552478", "556226", "568689", "509026", "529149", "533072", "553303", "556634", "558828", "570615", "507389", "527659", "529913", "542264", "554643", "556927", "558304", "560995", "572441", "577185", "580657", "495185", "501525", "517534", "527609", "541572", "547907", "553111", "554136", "559453", "570143", "572298", "579597", "505538", "520581", "529401", "530042", "540081", "542992", "543221", "555019", "555979", "556300", "558990", "563043", "570048", "579916", "587307", "469770", "497799", "503742", "506140", "512312", "512781", "553441", "555733", "557954", "560288", "560547", "569743", "519003", "522802", "529054", "530018", "538350", "543730", "552004", "556043", "559226", "570938", "572508", "580202", "506621", "515709", "516978", "523984", "525035", "526416", "527032", "532669", "543959", "548494", "549782", "551677", "555293", "556224", "558366", "561894", "513791", "533256", "535550", "537329", "542085", "543393", "543782", "548074", "551452", "552122", "555182", "565204", "590963", "508606", "509055", "512450", "513311", "525340", "527576", "531137", "534685", "535517", "539790", "561259", "561318", "561442", "566829", "584280", "598588", "498914", "509402", "515861", "516712", "528085", "539262", "542045", "542146", "551747", "551849", "558681", "571408", "575116", "595132", "470865", "490477", "490807", "513898", "521026", "527313", "530880", "538336", "543338", "548427", "553935", "560025", "561280", "567062", "573269", "513338", "532576", "536776", "549788", "554329", "557792", "569543", "569544", "569569", "583312", "488196", "539533", "540165", "548701", "554477", "557515", "571337", "571503", "584115", "531614", "531668", "532915", "536580", "551356", "552207", "553912", "556081", "563320", "572116", "574468", "580389", "508879", "524323", "526417", "531021", "535444", "539760", "552871", "556783", "557500", "564096", "568395", "576473", "583703", "501617", "501815", "504219", "506221", "506882", "519736", "531652", "535189", "536115", "555166", "561699", "576196", "514613", "518670", "526664", "544639", "550948", "554738", "555309", "557019", "561018", "562318", "567622", "571002", "571143", "572089", "503943", "537106", "544398", "553900", "571353", "580880", "604762", "532341", "543388", "543962", "553304", "561088", "571066", "599625", "499379", "517755", "525641", "527035", "534981", "535390", "541165", "543063", "543220", "547959", "551719", "551798", "553638", "557539", "559249", "568396", "575413", "590169", "521636", "527722", "528394", "540349", "549151", "555961", "556320", "561777", "568025", "568464", "579261", "580477", "598121", "603866", "498065", "531835", "570040", "571468", "572139", "512238", "517379", "529629", "533992", "536523", "544504", "572296", "572773", "573676", "585269", "501236", "503902", "537806", "539325", "541157", "542455", "544149", "558624", "561216", "566734", "573431", "583401", "520788", "522076", "524989", "528243", "542548", "550409", "559981", "565465", "569625", "570543", "576620", "485552", "514199", "519941", "541302", "548123", "549625", "552039", "557615", "564448", "568214", "572672", "579235", "534876", "551534", "561792", "563176", "569324", "576319", "506357", "536274", "537933", "538808", "551528", "560400", "571067", "585709", "586233", "531468", "531882", "544942", "552647", "553216", "559847", "569445", "572053", "573207", "574687", "588286", "520637", "526518", "536453", "537048", "538334", "540378", "541318", "573984", "575789", "579843", "590173", "521104", "529952", "532472", "534044", "538440", "540570", "541960", "543121", "545567", "554852", "559985", "562239", "564567", "565128", "566791", "570773", "573377", "577652", "581275", "583510", "583657", "592478", "608181", "533041", "535949", "543776", "544498", "550723", "550781", "551856", "552419", "556129", "561598", "569541", "571606", "583000", "584987", "515855", "527710", "532589", "538032", "539256", "543558", "558309", "559475", "562853", "572899", "504340", "518447", "526474", "530911", "531780", "532839", "535943", "540535", "549774", "555755", "563411", "572210", "573890", "577581", "583572", "502273", "517274", "518286", "525467", "538060", "540562", "541158", "551395", "553386", "559156", "559183", "569371", "572678", "580299", "581025", "600392", "603904", "517730", "538455", "541623", "543716", "551219", "551352", "561701", "565158", "568167", "578412", "619843", "501854", "505424", "538974", "543688", "548432", "550433", "556182", "561403", "564880", "577078", "485117", "498828", "508355", "511424", "519202", "524836", "528398", "534148", "541731", "542063", "554011", "554061", "557498", "560678", "561494", "564260", "564633", "572465", "503156", "506196", "525722", "528212", "529252", "531474", "536143", "538559", "539038", "540529", "541882", "548491", "560982", "571106", "580721", "582951", "592514", "530769", "531047", "538031", "556154", "558731", "563131", "565956", "567795", "569101", "569688", "571516", "574660", "576000", "577170", "578969", "580697", "589497", "485184", "511632", "520631", "536111", "538030", "542819", "547590", "548229", "550722", "553682", "553969", "569325", "570213", "579091", "579647", "599220", "524192", "527010", "527298", "535501", "544492", "548209", "551210", "555086", "562252", "564329", "567084", "567285", "569219", "569775", "575549", "579971", "608473", "506438", "519238", "521623", "526207", "552634", "554270", "567323", "569428", "571925", "589590", "501551", "524236", "525284", "532381", "534338", "547802", "550730", "551660", "554422", "560265", "569836", "583405", "592542", "600786", "494640", "501892", "511340", "529897", "533476", "540852", "551748", "565306", "572205", "579734", "597332", "517741", "518826", "522398", "530885", "551195", "552731", "557401", "559719", "559728", "568030", "568200", "570092", "575761", "582408", "583609", "587533", "603095", "608433", "499439", "511078", "512890", "514942", "523488", "536218", "538249", "538264", "542511", "553481", "558726", "564551", "564941", "565146", "571075", "593104", "600242", "611571", "514826", "520110", "522578", "535923", "549521", "551955", "554545", "556090", "558784", "559502", "562012", "564859", "566999", "570305", "571413", "578352", "582986", "587684", "461414", "497609", "518698", "531862", "534538", "536916", "536959", "543629", "556715", "557779", "566929", "568431", "568473", "570591", "573737", "582768", "594147", "611189", "522525", "528945", "557033", "560135", "565209"],
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
