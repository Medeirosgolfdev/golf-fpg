/*
 * browser-verify-3.js
 * Cobre os mids idx 700-999 do bucket A original (300 mids).
 * Output: verified-names-A3.json + checkpoints verified-names-A3-checkpoint-NNNN.json
 */

(async function () {
  const CONFIG = {
    BUCKET: 'A3',
    SAMPLE_SIZE: 500,
    CHECKPOINT_EVERY: 20,
    SLEEP_MS: 100,
    MIDS: ["575789", "579843", "590173", "521104", "529952", "532472", "534044", "538440", "540570", "541960", "543121", "545567", "554852", "559985", "562239", "564567", "565128", "566791", "570773", "573377", "577652", "581275", "583510", "583657", "592478", "608181", "533041", "535949", "543776", "544498", "550723", "550781", "551856", "552419", "556129", "561598", "569541", "571606", "583000", "584987", "515855", "527710", "532589", "538032", "539256", "543558", "558309", "559475", "562853", "572899", "504340", "518447", "526474", "530911", "531780", "532839", "535943", "540535", "549774", "555755", "563411", "572210", "573890", "577581", "583572", "502273", "517274", "518286", "525467", "538060", "540562", "541158", "551395", "553386", "559156", "559183", "569371", "572678", "580299", "581025", "600392", "603904", "517730", "538455", "541623", "543716", "551219", "551352", "561701", "565158", "568167", "578412", "619843", "501854", "505424", "538974", "543688", "548432", "550433", "556182", "561403", "564880", "577078", "485117", "498828", "508355", "511424", "519202", "524836", "528398", "534148", "541731", "542063", "554011", "554061", "557498", "560678", "561494", "564260", "564633", "572465", "503156", "506196", "525722", "528212", "529252", "531474", "536143", "538559", "539038", "540529", "541882", "548491", "560982", "571106", "580721", "582951", "592514", "530769", "531047", "538031", "556154", "558731", "563131", "565956", "567795", "569101", "569688", "571516", "574660", "576000", "577170", "578969", "580697", "589497", "485184", "511632", "520631", "536111", "538030", "542819", "547590", "548229", "550722", "553682", "553969", "569325", "570213", "579091", "579647", "599220", "524192", "527010", "527298", "535501", "544492", "548209", "551210", "555086", "562252", "564329", "567084", "567285", "569219", "569775", "575549", "579971", "608473", "506438", "519238", "521623", "526207", "552634", "554270", "567323", "569428", "571925", "589590", "501551", "524236", "525284", "532381", "534338", "547802", "550730", "551660", "554422", "560265", "569836", "583405", "592542", "600786", "494640", "501892", "511340", "529897", "533476", "540852", "551748", "565306", "572205", "579734", "597332", "517741", "518826", "522398", "530885", "551195", "552731", "557401", "559719", "559728", "568030", "568200", "570092", "575761", "582408", "583609", "587533", "603095", "608433", "499439", "511078", "512890", "514942", "523488", "536218", "538249", "538264", "542511", "553481", "558726", "564551", "564941", "565146", "571075", "593104", "600242", "611571", "514826", "520110", "522578", "535923", "549521", "551955", "554545", "556090", "558784", "559502", "562012", "564859", "566999", "570305", "571413", "578352", "582986", "587684", "461414", "497609", "518698", "531862", "534538", "536916", "536959", "543629", "556715", "557779", "566929", "568431", "568473", "570591", "573737", "582768", "594147", "611189", "522525", "528945", "557033", "560135", "565209"],
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
      downloadJSON({ gerado_em: new Date().toISOString(), mode: 'VERIFY', bucket: CONFIG.BUCKET, progress: { done, total: N, resolved: resolvedCount, elapsed_min: Number(elapsedMin) }, results }, fname);
      console.log(`  >> Checkpoint ${done}/${N} - resolvidos: ${resolvedCount} (${elapsedMin}min) -> ${fname}`);
    }
  }
  const resolvedCount = results.filter(r => r.resolved).length;
  console.log(`> Concluido bucket ${CONFIG.BUCKET}: ${resolvedCount}/${N}. Final: ${FINAL}`);
})();
