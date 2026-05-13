/*
 * browser-resolve.js  (substituto limpo de browser-resolve-missing-names.js)
 *
 * COLA NA CONSOLA DO BROWSER (F12) - NAO uses node.
 *
 * Script generico para resolver/verificar nomes na cache USKids member-history.
 *
 * 3 modos:
 *   MODE: 'RESOLVE'  - tenta descobrir nome para cada mid via cross-ref strokes
 *   MODE: 'VERIFY'   - compara nome cache vs API para mids ja nomeados
 *   MODE: 'SINGLE'   - debug de 1 so mid
 *
 * Como usar:
 *   1) Abre https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=18242
 *   2) F12 -> consola
 *   3) Edita CONFIG.MODE e CONFIG.MIDS abaixo
 *   4) Cola este ficheiro
 *
 * Output:
 *   - MODE: VERIFY  -> verified-names.json (+ checkpoints intermedios)
 *   - MODE: RESOLVE -> resolved-missing-names.json (+ checkpoints)
 *
 * Depois corre:
 *   - VERIFY:  node scripts/check-names.js
 *   - RESOLVE: node scripts/integrate-names.js [--apply]
 *
 * Notas:
 *   - Checkpoint cumulativo a cada CONFIG.CHECKPOINT_EVERY mids (anti-crash).
 *   - Endpoint correcto: POST com t=1, pt=undefined, jbgr={ts}, c=1.
 */

(async function () {
  const CONFIG = {
    MODE: 'VERIFY',
    SAMPLE_SIZE: 200,
    CHECKPOINT_EVERY: 20,
    MIDS: [],
    SLEEP_MS: 100,
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
    const d = await r.json();
    return d.flight_players || {};
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
          if (name) {
            return { mid, resolved: true, name, country: (pl.country || '').toUpperCase(), via: `${tid}:${t.p_age_group}:strokes` };
          }
        }
      }
      await sleep(CONFIG.SLEEP_MS);
    }
    return { mid, resolved: false, reason: 'sem match strokes em 3 tcodes' };
  }

  async function runBatch(modeName, finalFilename, checkpointPrefix) {
    if (!CONFIG.MIDS.length) {
      console.log(`> Modo ${modeName} exige CONFIG.MIDS populado.`);
      return;
    }
    const mids = CONFIG.MIDS.slice(0, CONFIG.SAMPLE_SIZE);
    const N = mids.length;
    const checkpointEvery = CONFIG.CHECKPOINT_EVERY || 20;
    console.log(`> ${modeName}: ${N} mids (checkpoint cumulativo a cada ${checkpointEvery})...`);
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
        const fname = isLast ? finalFilename : `${checkpointPrefix}-checkpoint-${String(done).padStart(3, '0')}.json`;
        const resolvedCount = results.filter(r => r.resolved).length;
        const out = {
          gerado_em: new Date().toISOString(),
          mode: modeName,
          progress: { done, total: N, resolved: resolvedCount, elapsed_min: Number(elapsedMin) },
          results,
        };
        downloadJSON(out, fname);
        console.log(`  >> Checkpoint ${done}/${N} - resolvidos: ${resolvedCount} (${elapsedMin}min) -> ${fname}`);
      }
    }
    const resolvedCount = results.filter(r => r.resolved).length;
    console.log(`> Concluido: ${resolvedCount}/${N}. Final: ${finalFilename}`);
  }

  async function modeSingle() {
    if (!CONFIG.MIDS.length) { console.log('> SINGLE precisa de CONFIG.MIDS = ["mid"].'); return; }
    const mid = CONFIG.MIDS[0];
    console.log(`> Debug do mid ${mid}...`);
    const r = await resolveOne(mid);
    console.log(r.resolved ? `OK ${r.name} (${r.country}) via ${r.via}` : `XX ${r.reason}`);
    return r;
  }

  console.log(`> Modo: ${CONFIG.MODE}`);
  switch (CONFIG.MODE) {
    case 'RESOLVE': await runBatch('RESOLVE', 'resolved-missing-names.json', 'resolved-missing-names'); break;
    case 'VERIFY':  await runBatch('VERIFY', 'verified-names.json', 'verified-names'); break;
    case 'SINGLE':  await modeSingle(); break;
    default: console.error(`Modo desconhecido: ${CONFIG.MODE}`);
  }
})();
