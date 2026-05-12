/*
 * browser-resolve-missing-names.js
 *
 * ⚠️ COLA NA CONSOLA DO BROWSER (F12) — NÃO uses `node`.
 *
 * Script para resolver nomes em falta na cache USKids member-history e/ou
 * VERIFICAR se nomes existentes estão certos.
 *
 * Estratégia (3 modos):
 *
 *   MODO 1 — RESOLVER NOMES "?"
 *     Para cada mid sem nome, descobre os tcodes onde jogou via
 *     GetMemberTournamentResults, depois chama POST GetPlayerTeeTimes para
 *     o flight e cruza por strokes para resolver o nome.
 *
 *   MODO 2 — VERIFICAR NOMES EXISTENTES
 *     Para uma amostra de mids com nome resolvido, faz cross-check com a API:
 *     o nome no flight_players coincide com o que temos na cache?
 *
 *   MODO 3 — UM SÓ MID
 *     Útil para debug: dá um mid e vê tudo o que conseguimos sobre ele.
 *
 * Como usar:
 *   1) Abre QUALQUER página signupanytime (ex.:
 *      https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=18242)
 *   2) F12 → consola
 *   3) Cola este ficheiro
 *   4) Edita CONFIG abaixo (MODE, MIDS) e re-cola
 *   5) Descarrega o resultado JSON
 *   6) Depois corre `node scripts/integrate-resolved-names.js --apply` (a criar
 *      noutra sessão se o resultado for útil)
 */

(async function () {
  // ── CONFIG ───────────────────────────────────────────────────────
  const CONFIG = {
    MODE: 'RESOLVE',  // 'RESOLVE' | 'VERIFY' | 'SINGLE'
    SAMPLE_SIZE: 20,  // quantos mids processar (RESOLVE/VERIFY)
    MIDS: [],         // se vazio, modo RESOLVE/VERIFY usa carregamento dinâmico
                      // se cheio, processa só estes (modo SINGLE ou subset)
    SLEEP_MS: 100,    // delay entre chamadas (rate-limit)
  };

  const API = '/plugins/links/admin/LinksAJAX.aspx';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ── HELPERS ──────────────────────────────────────────────────────
  async function getTournResults(mid) {
    return fetch(`${API}?op=GetMemberTournamentResults&m=${mid}`, {credentials:'include'}).then(r=>r.json());
  }

  async function getMeta(tcode) {
    return fetch(`${API}?op=GetMeta&t=${tcode}`, {credentials:'include'}).then(r=>r.json());
  }

  async function getFlightPlayers(tcode, fid) {
    // Carregar contexto do iframe primeiro (necessário para sessão)
    await fetch(`/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${tcode}`, {credentials:'include'});
    await sleep(200);
    const r = await fetch(`${API}?op=GetPlayerTeeTimes&f=${fid}&r=1&p=1&t=1&pt=undefined&jbgr=${Date.now()}&c=1`, {method:'POST', credentials:'include'});
    const d = await r.json();
    return d.flight_players || {};
  }

  async function getMemberIds(tcode, fid) {
    const tp = await fetch(`${API}?op=GetTournamentPlayers&t=${tcode}&f=${fid}`, {credentials:'include'}).then(r=>r.json());
    return (tp.PlayerNodeId || []).map(String);
  }

  // Tenta resolver o nome de um mid usando o histórico + cross-ref
  async function resolveOne(mid) {
    const data = await getTournResults(mid);
    const tids = Object.keys(data || {});
    if (!tids.length) return { mid, resolved: false, reason: 'sem torneios USKids' };
    // Escolher o tcode mais recente onde estamos confiantes (gross > 0)
    const candidates = tids
      .map(tid => ({ tid, t: data[tid] }))
      .filter(({ t }) => t.p_strokes && Number(t.p_strokes) > 0 && t.p_age_group)
      .sort((a, b) => (b.t.t_start_date || '').localeCompare(a.t.t_start_date || ''));
    if (!candidates.length) return { mid, resolved: false, reason: 'só torneios sem gross válido' };

    for (const { tid, t } of candidates.slice(0, 3)) {  // tentar até 3 tcodes
      // Encontrar o fid do escalão dele neste tcode
      const meta = await getMeta(tid);
      const ageGroups = meta?.age_groups || {};
      let fid = null;
      for (const [f, fl] of Object.entries(meta?.flights || {})) {
        if (ageGroups[fl.age_group]?.name === t.p_age_group) { fid = f; break; }
      }
      if (!fid) continue;
      await sleep(CONFIG.SLEEP_MS);
      // GetPlayerTeeTimes para apanhar nome + strokes
      const fp = await getFlightPlayers(tid, fid);
      // Match por strokes na R1
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
    return { mid, resolved: false, reason: 'sem match por strokes em 3 tcodes recentes' };
  }

  // MODO 1: RESOLVER mids "?" — carrega slim, identifica nomes em falta
  async function modeResolve() {
    // Carregar slim do nosso site (mesmo origin não funciona — usar localhost
    // ou apontar à app actual). Fallback: usar CONFIG.MIDS se preenchido.
    let mids = CONFIG.MIDS;
    if (!mids.length) {
      console.log('▶ CONFIG.MIDS vazio — não consigo carregar slim daqui.');
      console.log('  Pré-popula CONFIG.MIDS com os mids "?" do uskids-member-history-slim.json');
      console.log('  (extrai com: jq -r \'.jogadores | to_entries[] | select(.value.name == "?" or .value.name == null) | .key\' public/data/uskids-member-history-slim.json | head -20)');
      return;
    }
    mids = mids.slice(0, CONFIG.SAMPLE_SIZE);
    console.log(`▶ A tentar resolver ${mids.length} mids…`);
    const results = [];
    for (const mid of mids) {
      try {
        const r = await resolveOne(mid);
        results.push(r);
        const tag = r.resolved ? '✓' : '✗';
        console.log(`  ${tag} ${mid} ${r.resolved ? `→ ${r.name} (${r.country})` : `— ${r.reason}`}`);
      } catch (e) {
        results.push({ mid, resolved: false, reason: e.message });
        console.warn(`  ✗ ${mid} — erro: ${e.message}`);
      }
      await sleep(CONFIG.SLEEP_MS);
    }
    const out = {
      gerado_em: new Date().toISOString(),
      mode: 'RESOLVE',
      total: results.length,
      resolved: results.filter(r => r.resolved).length,
      results
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'resolved-missing-names.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    console.log(`✓ Resolvidos: ${out.resolved}/${out.total}. Download iniciado.`);
  }

  // MODO 2: VERIFICAR nomes existentes — sample + cross-ref
  async function modeVerify() {
    if (!CONFIG.MIDS.length) {
      console.log('▶ Modo VERIFY exige CONFIG.MIDS pré-populado (mids com nome esperado).');
      console.log('  Vou processar 5 mids exemplo para demonstrar o formato.');
      CONFIG.MIDS = ['549578', '521022', '562449', '576306', '591601'];
    }
    const mids = CONFIG.MIDS.slice(0, CONFIG.SAMPLE_SIZE);
    console.log(`▶ A verificar ${mids.length} mids…`);
    const results = [];
    for (const mid of mids) {
      const r = await resolveOne(mid);
      results.push(r);
      const tag = r.resolved ? '✓' : '⚠️';
      console.log(`  ${tag} ${mid} ${r.resolved ? `→ ${r.name} (${r.country})` : `— ${r.reason}`}`);
      await sleep(CONFIG.SLEEP_MS);
    }
    const out = { gerado_em: new Date().toISOString(), mode: 'VERIFY', results };
    const blob = new Blob([JSON.stringify(out, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'verified-names.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    console.log(`✓ Verificados: ${results.length}. Download iniciado.`);
  }

  // MODO 3: UM SÓ MID — debug
  async function modeSingle() {
    if (!CONFIG.MIDS.length) {
      console.log('▶ Modo SINGLE exige CONFIG.MIDS = ["{mid}"] (1 só).');
      return;
    }
    const mid = CONFIG.MIDS[0];
    console.log(`▶ Debug do mid ${mid}…`);
    const data = await getTournResults(mid);
    console.log(`  Histórico USKids: ${Object.keys(data).length} torneios`);
    const r = await resolveOne(mid);
    console.log(r.resolved ? `  ✓ Nome: ${r.name} (${r.country}) via ${r.via}` : `  ✗ Não resolvido: ${r.reason}`);
    return r;
  }

  console.log(`▶ Modo: ${CONFIG.MODE}`);
  switch (CONFIG.MODE) {
    case 'RESOLVE': await modeResolve(); break;
    case 'VERIFY':  await modeVerify();  break;
    case 'SINGLE':  await modeSingle();  break;
    default: console.error(`Modo desconhecido: ${CONFIG.MODE}`);
  }
})();
