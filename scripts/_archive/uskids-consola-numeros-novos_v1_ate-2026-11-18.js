// scripts/uskids-consola-numeros-novos.js — números novos de torneios USKids, À MÃO, no browser
// (16/11/2026, Mariana: «guia-me, dá-me um script para eu colar na consola e fazer a varredura»).
//
// Os workflows da USKids estão pausados: o signupanytime recusa (HTTP 403) os pedidos feitos sem
// browser desde 07/11/2026 (docs/claude/uskids.md). Este script corre NA CONSOLA do browser dela,
// numa página do signupanytime aberta por ela, e faz o mesmo pedido que a página faz (GetMeta),
// devagar: um número de cada vez, 4 s entre pedidos, e pára à primeira recusa.
//
// Como usar:
//   1. Abrir https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=field&fmt=nohead&ax=2739&t=23132
//   2. F12 → Consola (no Edge/Chrome pode ser preciso escrever «allow pasting» antes de colar).
//   3. Mudar INICIO para o número a seguir ao último do catálogo (public/data/uskids-tcode-catalog.json).
//   4. Colar e Enter. No fim os torneios encontrados ficam copiados (formato das `entradas` do
//      catálogo, com o `t`) — colá-los no chat para entrarem na app.
(async () => {
  const INICIO = 23893;          // o último conhecido a 16/11/2026 é o 23892
  const MAX_PEDIDOS = 150;       // tecto de segurança
  const PARAR_APOS_VAZIOS = 25;  // o maior buraco medido na zona viva é de 15 números
  const PAUSA_MS = 4000;         // 4 s entre pedidos

  const novos = [];
  let vazios = 0;
  for (let t = INICIO, n = 0; n < MAX_PEDIDOS && vazios < PARAR_APOS_VAZIOS; t++, n++) {
    const r = await fetch(`/plugins/links/admin/LinksAJAX.aspx?op=GetMeta&t=${t}&jbgr=${Math.floor(Date.now() / 1000)}&c=1`, { method: "POST" });
    const txt = (await r.text()).trim();
    if ([403, 429, 503].includes(r.status) || /too many requests/i.test(txt)) {
      console.warn(`⛔ Recusa no ${t} (HTTP ${r.status}) — parei aqui.`);
      break;
    }
    let tn = null;
    try { tn = JSON.parse(txt)?.tournament ?? null; } catch { /* vazio = número ainda não existe */ }
    if (tn?.name) {
      vazios = 0;
      const e = { t, n: tn.name.trim(), ty: tn.type ?? null, tour: tn.tour || null, s: tn.start_date || null,
        e: tn.end_date || null, st: tn.status ?? null, r: tn.rounds ?? null, c: tn.courses || null, f: tn.fee_18 || null };
      novos.push(e);
      console.log(`✅ ${t} · ${e.n} · ${e.s} · ${e.tour ?? ""}`);
    } else {
      vazios++;
      console.log(`· ${t} vazio (${vazios} seguidos)`);
    }
    await new Promise(res => setTimeout(res, PAUSA_MS));
  }
  console.table(novos.map(x => ({ numero: x.t, torneio: x.n, inicio: x.s, tour: x.tour })));
  copy(JSON.stringify(novos));
  console.log(`📋 ${novos.length} torneios encontrados e copiados — cola-os no chat.`);
})();
