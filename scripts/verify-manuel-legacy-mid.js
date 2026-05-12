/*
 * verify-manuel-legacy-mid.js
 *
 * Verifica se um número candidato é o memberID USKids LEGACY do Manuel
 * (a conta anterior, antes da migração para mid 630106).
 *
 * COMO USAR — NO BROWSER:
 *  1) Abre https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=15573
 *  2) F12 → consola
 *  3) Cola este ficheiro
 *  4) Vê o resultado — se devolver torneios com nome "Manuel" + país "PT" → é o mid legacy
 */

(async () => {
  const API = '/plugins/links/admin/LinksAJAX.aspx';
  const CANDIDATES = [1228805];  // primeiro a testar — o pid_local do El Prat Boys 9

  for (const mid of CANDIDATES) {
    console.log(`\n▶ Testar mid=${mid}`);
    try {
      const r = await fetch(`${API}?op=GetMemberTournamentResults&m=${mid}`, {credentials: 'include'});
      const d = await r.json();
      const tids = Object.keys(d || {});
      console.log(`  Resposta: ${tids.length} torneios`);
      if (!tids.length) { console.log('  ⛔ Vazio — não é um memberID válido OU sem torneios'); continue; }

      // Pegar info dos primeiros torneios e do nome
      // O GetMemberTournamentResults não devolve nome — vê os p_age_group e country
      const samples = tids.slice(0, 5).map(tid => {
        const t = d[tid];
        return `t=${tid}: ${t.t_name} (${t.t_start_date}) — escalão ${t.p_age_group}, place=${t.p_place}, country=${t.p_country || '?'}`;
      });
      console.log('  Primeiros torneios:');
      samples.forEach(s => console.log('    ' + s));

      // Verificar se há um torneio em El Prat (tcode 15573) — confirmação directa
      const elprat = d['15573'];
      if (elprat) {
        console.log(`  ✓ JOGOU EL PRAT 2023: escalão=${elprat.p_age_group}, place=${elprat.p_place}, gross=${elprat.p_strokes}`);
        if (elprat.p_age_group === 'Boys 9' && elprat.p_strokes === 44) {
          console.log(`  ✅ MATCH PERFEITO com Manuel (Boys 9, gross 44 no El Prat 2023)`);
        }
      } else {
        console.log(`  ⛔ Não jogou El Prat 2023 (tcode 15573 ausente). Não é o Manuel.`);
      }
    } catch (e) {
      console.error(`  ❌ Erro: ${e.message}`);
    }
  }
})();
