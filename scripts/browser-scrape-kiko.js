/*
 * browser-scrape-kiko.js
 *
 * ⚠️ COLA ESTE FICHEIRO NA CONSOLA DO BROWSER (F12) — NÃO uses `node`.
 *
 * Scrape do histórico USKids de KIKO Matos Coelho (mid 471043).
 * Vencedor do Boys 13-14 do Oeiras Tour Championship 2017 (tcode 4172).
 *
 * Como usar:
 *  1) Abre QUALQUER página signupanytime (ex.: a do tcode 4172)
 *     https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=4172
 *  2) F12 → consola
 *  3) Cola este ficheiro inteiro
 *  4) Descarrega `kiko-matos-coelho-471043-history.json` para a tua pasta Downloads
 *  5) Corre `node scripts/integrate-kiko-matos-coelho.js --apply`
 *     (o script auto-move o ficheiro de Downloads para data-archive)
 */

(async function () {
  const MID = '471043';
  const NAME = 'KIKO Matos Coelho';
  const COUNTRY = 'PT';
  const API = '/plugins/links/admin/LinksAJAX.aspx';

  console.log(`▶ Scrape do mid ${MID} (${NAME})...`);
  const data = await fetch(`${API}?op=GetMemberTournamentResults&m=${MID}`, {credentials:'include'}).then(r=>r.json());
  console.log(`  ${Object.keys(data).length} torneios USKids no histórico`);

  // Construir formato compatível com uskids-member-history-XXX.json
  const sharedTorneios = {};
  const playerTorneios = {};
  for (const [tid, t] of Object.entries(data || {})) {
    const rounds = {};
    for (const [rn, rd] of Object.entries(t.p_rounds || {})) {
      rounds[rn] = {
        strokes: rd.strokes || [],
        course: rd.course_name || '',
        startHole: rd.start_hole ?? null,
        gross: rd.num_strokes ?? null,
        holes: rd.num_holes ?? null,
      };
    }
    playerTorneios[tid] = {
      ageGroup: t.p_age_group || '',
      status: t.p_status ?? null,
      place: t.p_place ?? null,
      totalStrokes: t.p_strokes ?? null,
      points: t.p_points ?? null,
      rounds,
    };
    sharedTorneios[tid] = {
      name: t.t_name || '?',
      startDate: t.t_start_date || '',
      endDate: t.t_end_date || '',
      holesPerRound: t.t_holes_per_round || null,
      par: t.t_pars || null,
      yards: t.t_yards || null,
    };
  }

  const out = {
    gerado_em: new Date().toISOString(),
    fonte: 'browser-scrape-kiko.js (GetMemberTournamentResults)',
    torneios: sharedTorneios,
    jogadores: {
      [MID]: {
        name: NAME,
        country: COUNTRY,
        ageGroup: Object.values(data).sort((a,b)=>(b.t_start_date||'').localeCompare(a.t_start_date||''))[0]?.p_age_group || null,
        totalTorneios: Object.keys(data).length,
        torneios: playerTorneios
      }
    }
  };

  const blob = new Blob([JSON.stringify(out, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'kiko-matos-coelho-471043-history.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  console.log('✓ Download iniciado: kiko-matos-coelho-471043-history.json');
  console.log('  Próximo passo: node scripts/integrate-kiko-matos-coelho.js --apply');
})();
