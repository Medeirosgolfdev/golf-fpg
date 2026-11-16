// scripts/uskids-consola.js — inscritos E resultados dos torneios USKids, À MÃO, no browser
// (até 16/11/2026 chamava-se uskids-consola-inscritos.js e só fazia os inscritos; os resultados
// entraram a pedido dela: «quero os resultados dos torneios desde dia 6»)
// (16/11/2026, Mariana: «e agora o script para colar na consola e ter os inscritos? é melhor fazeres
// com que ele grave um ficheiro» + «quero também saber se há alterações aos inscritos que já temos
// de todos os torneios»).
//
// Os workflows estão pausados: o signupanytime recusa (HTTP 403) os pedidos feitos sem browser
// (docs/claude/uskids.md). Este script corre na consola do browser dela, numa página do
// signupanytime aberta por ela, e faz os mesmos pedidos que a página faz — devagar (3 s entre
// pedidos) e parando à primeira recusa.
//
//   1. Vai buscar à app (golf-fpg.vercel.app, CORS aberto) a lista de torneios e os inscritos que
//      já temos.
//   2. Para cada torneio que ainda não acabou: o resumo (GetMeta — inscritos por escalão) e, nos
//      escalões Boys 9–13 (os que a app guarda com nomes), a lista de nomes (GetPlayerTeeTimes) —
//      sempre nos torneios seguidos todos os dias e nos do Manuel; nos outros só onde o número
//      mudou ou ainda não temos nomes. É a mesma regra do fetch-uskids-field.js («contagens»).
//   3. Mostra as alterações (quem entrou, quem saiu, quem desistiu — WD — e os números que mudaram).
//   4. RESULTADOS: os torneios que já acabaram e que a app ainda não tem (índice
//      uskids-results-index.json) — GetMeta inteiro e, nos escalões Boys, as listas de cada volta
//      (GetPlayerTeeTimes&r=<volta>), página a página até ter o flight todo.
//   5. Descarrega um ficheiro `uskids-AAAA-MM-DD-HHMM.json` com as respostas tal como vieram
//      (aparadas ao que a app usa), que a app lê com:
//        node scripts/fetch-uskids-field.js --replay <ficheiro>     (inscritos)
//        node scripts/fetch-uskids-results.js --replay <ficheiro>   (resultados)
//
// Como usar: abrir https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=field&fmt=nohead&ax=2739&t=23132
// → F12 → Consola → colar → Enter. ~300 pedidos de inscritos + ~10 por torneio acabado; 3 s cada.
(async () => {
  const APP = "https://golf-fpg.vercel.app/data";
  const PAUSA_MS = 3000;
  const MAX_PEDIDOS = 900;
  const PREFIXOS_NOMES = ["boys 9", "boys 10", "boys 11", "boys 12", "boys 13"];
  const comNomes = (nome) => PREFIXOS_NOMES.some(p => String(nome || "").toLowerCase().startsWith(p));
  const norm = (s) => String(s || "").toLowerCase().trim().replace(/\s+/g, " ");
  const dormir = (ms) => new Promise(r => setTimeout(r, ms));
  const dataISO = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ""); return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null; };
  const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const hojeISO = new Date().toISOString().slice(0, 10);

  // ── 1. O que a app já tem ────────────────────────────────────────────────
  const [field, cache, indiceRes] = await Promise.all([
    fetch(`${APP}/uskids-field.json`, { cache: "no-store" }).then(r => r.json()),
    fetch(`${APP}/uskids-discovery-cache.json`, { cache: "no-store" }).then(r => r.json()),
    fetch(`${APP}/uskids-results-index.json`, { cache: "no-store" }).then(r => r.json()),
  ]);
  const prevPorT = new Map(field.torneios.map(t => [t.t, t]));
  const lista = new Map();
  for (const t of [...cache.torneios, ...field.torneios]) {
    const d = dataISO(t.date_inicio);
    if (d && d >= ontem && !lista.has(t.t)) lista.set(t.t, t);
  }
  const doManuel = (p) => (p?.escaloes || []).some(e => (e.jogadores || []).some(j => /manuel.*medeiros/i.test(j.nome)));
  const torneios = [...lista.values()].sort((a, b) => {
    const pa = prevPorT.get(a.t), pb = prevPorT.get(b.t);
    const ka = (pa?.seguido || doManuel(pa)) ? 0 : 1, kb = (pb?.seguido || doManuel(pb)) ? 0 : 1;
    return ka - kb || (dataISO(a.date_inicio) || "").localeCompare(dataISO(b.date_inicio) || "");
  });
  // Resultados em falta: acabaram (até ontem), há menos de 60 dias, e a app ainda não os tem.
  const temRes = new Set(indiceRes.t || []);
  const ha60 = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const acabados = cache.torneios.filter(t => {
    const fim = dataISO(t.date_fim) || dataISO(t.date_inicio);
    return fim && fim < hojeISO && fim >= ha60 && !temRes.has(t.t);
  }).sort((a, b) => (dataISO(a.date_inicio) || "").localeCompare(dataISO(b.date_inicio) || ""));
  console.log(`📋 ${torneios.length} torneios por jogar (os seguidos e os do Manuel primeiro) · ${acabados.length} acabados sem resultados.`);

  // ── 2. Pedidos, como a página os faz ─────────────────────────────────────
  let pedidos = 0, recusa = null;
  const respostas = {};
  async function pedir(op, extra) {
    if (recusa || pedidos >= MAX_PEDIDOS) return null;
    pedidos++;
    let r, txt;
    try {
      r = await fetch(`/plugins/links/admin/LinksAJAX.aspx?op=${op}&${extra}&jbgr=${Math.floor(Date.now() / 1000)}&c=1`, { method: "POST" });
      txt = (await r.text()).trim();
    } catch (err) {
      // Rede em baixo: pára como numa recusa (e grava o que já há), em vez de rebentar sem gravar.
      recusa = { op, extra, status: 0, erro: String(err) };
      return null;
    }
    await dormir(PAUSA_MS);
    if ([403, 429, 503].includes(r.status) || /too many requests/i.test(txt)) { recusa = { op, extra, status: r.status }; return null; }
    if (!txt) return {};
    try { return JSON.parse(txt); } catch { return null; }
  }

  const alteracoes = [];
  const feitos = [];
  const resFeitos = [], resRespostas = {}, resLinhas = [];
  let gravacoes = 0;
  function gravar(parcial) {
    const agora = new Date();
    const carimbo = `${agora.toISOString().slice(0, 10)}-${String(agora.getHours()).padStart(2, "0")}${String(agora.getMinutes()).padStart(2, "0")}`;
    const ficheiro = { gerado_em: agora.toISOString(), fonte: "consola do browser (scripts/uskids-consola.js)", parcial: !!parcial, recusa, pedidos, torneios: [...feitos], alteracoes: [...alteracoes], respostas,
      resultados: { torneios: [...resFeitos], respostas: resRespostas } };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(ficheiro)], { type: "application/json" }));
    a.download = `uskids-${carimbo}${parcial ? "-parcial" : ""}${gravacoes++ ? `-${gravacoes}` : ""}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    console.log(`💾 Gravado: ${a.download} (inscritos de ${feitos.length} torneios, resultados de ${resFeitos.length}; pasta Transferências).`);
  }
  // A meio, para gravar o que já veio sem parar: escrever  uskidsGravar()  na consola.
  window.uskidsGravar = () => gravar(true);
  console.log("ℹ️ Para gravar a meio, sem parar: escreve  uskidsGravar()  e Enter.");
  try {
  for (const tor of torneios) {
    if (recusa || pedidos >= MAX_PEDIDOS) break;
    const prev = prevPorT.get(tor.t);
    const completo = !prev || prev.seguido || doManuel(prev);
    const nAlteracoes = alteracoes.length;
    const meta = await pedir("GetMeta", `t=${tor.t}`);
    if (!meta) continue;
    respostas[`GetMeta:${tor.t}`] = { tournament: meta.tournament, age_groups: meta.age_groups, flights: meta.flights };
    const nomeT = meta.tournament?.name || tor.name;
    const flights = meta.flights || {};
    const porAG = {};
    for (const [fid, f] of Object.entries(flights)) if (!porAG[f.age_group]) porAG[f.age_group] = { fid, f };
    let todosComNomes = true, incompleto = false;
    if (!prev) alteracoes.push({ torneio: nomeT, escalao: "(torneio novo na app)", antes: "", agora: Object.values(flights).reduce((n, f) => n + (f.active ?? f.registered ?? 0), 0), entraram: "", sairam: "" });
    for (const [ag, { fid, f }] of Object.entries(porAG)) {
      const esc = meta.age_groups?.[ag]?.name || `age_group_${ag}`;
      const inscr = f.active ?? f.registered ?? 0; // `registered` conta os WD; `active` não
      const ePrev = (prev?.escaloes || []).find(e => e.age_group === Number(ag));
      if (ePrev && ePrev.inscritos !== inscr) alteracoes.push({ torneio: nomeT, escalao: esc, antes: ePrev.inscritos, agora: inscr, entraram: "", sairam: "" });
      if (!comNomes(esc) || (f.registered ?? inscr) <= 0) continue;
      const precisa = completo || !ePrev || !ePrev.jogadores || ePrev.inscritos !== inscr;
      if (!precisa) { todosComNomes = false; continue; }
      const d = await pedir("GetPlayerTeeTimes", `f=${fid}&r=1&p=1&t=0`);
      // Sem esta lista (recusa ou tecto a meio), o torneio NÃO vai no ficheiro: a app apagaria os
      // nomes que já tem deste escalão. Fica como está e vê-se na próxima vez.
      if (!d) { incompleto = true; break; }
      const fp = {};
      for (const [pid, p] of Object.entries(d.flight_players || {})) fp[pid] = { first: p.first, last: p.last, country: p.country, place: p.place, status: p.status };
      respostas[`GetPlayerTeeTimes:${fid}`] = { flight_players: fp };
      if (ePrev?.jogadores) {
        const antes = new Set(ePrev.jogadores.map(j => norm(j.nome)));
        const ativos = Object.values(fp).filter(p => p.status === 1).map(p => `${p.first || ""} ${p.last || ""}`.trim());
        const agora = new Set(ativos.map(norm));
        const wd = Object.values(fp).filter(p => p.status === 8).map(p => `${p.first || ""} ${p.last || ""}`.trim());
        const entraram = ativos.filter(n => !antes.has(norm(n)));
        const sairam = ePrev.jogadores.map(j => j.nome).filter(n => !agora.has(norm(n)))
          .map(n => wd.some(w => norm(w) === norm(n)) ? `${n} (WD)` : n);
        if (entraram.length || sairam.length) {
          const linha = alteracoes.find(a => a.torneio === nomeT && a.escalao === esc);
          if (linha) { linha.entraram = entraram.join(", "); linha.sairam = sairam.join(", "); }
          else alteracoes.push({ torneio: nomeT, escalao: esc, antes: ePrev.inscritos, agora: inscr, entraram: entraram.join(", "), sairam: sairam.join(", ") });
        }
      }
    }
    if (incompleto) { alteracoes.length = nAlteracoes; console.warn(`… ${nomeT} (t=${tor.t}) ficou a meio — não vai no ficheiro`); break; }
    feitos.push({ t: tor.t, modo: todosComNomes ? "completo" : "contagens" });
    console.log(`✓ ${nomeT} (t=${tor.t}) · ${pedidos} pedidos até agora`);
  }

  // ── Resultados dos torneios que já acabaram ──────────────────────────────
  for (const tor of acabados) {
    if (recusa || pedidos >= MAX_PEDIDOS) break;
    const meta = await pedir("GetMeta", `t=${tor.t}`);
    if (!meta) break;
    if (!meta.flights) continue; // sem escalões publicados: nada a guardar
    const novas = { [`GetMeta:${tor.t}`]: meta };
    const rondas = meta.tournament?.rounds || tor.rondas || 1;
    const porAG = {};
    for (const [fid, f] of Object.entries(meta.flights || {})) if (!porAG[f.age_group]) porAG[f.age_group] = { fid, f };
    let incompleto = false, nJog = 0;
    for (const [ag, { fid, f }] of Object.entries(porAG)) {
      const nome = String(meta.age_groups?.[ag]?.name || "");
      if (!nome.toLowerCase().startsWith("boys") || !(f.registered > 0)) continue; // a app guarda os Boys
      for (let r = 1; r <= rondas && !incompleto; r++) {
        const vistos = new Set();
        for (let p = 1; p <= 10; p++) {
          const d = await pedir("GetPlayerTeeTimes", `f=${fid}&r=${r}&p=${p}&t=0`);
          if (!d) { incompleto = true; break; }
          const fp = d.flight_players || {};
          novas[`GetPlayerTeeTimes:${fid}:${r}:${p}`] = { flight_players: fp };
          const antes = vistos.size;
          for (const pid of Object.keys(fp)) vistos.add(pid);
          if (vistos.size === antes || vistos.size >= f.registered) break; // já temos o flight todo
        }
        if (r === 1) nJog += vistos.size;
      }
      if (incompleto) break;
    }
    // Um torneio a meio não vai no ficheiro (a app ficava com escalões vazios).
    if (incompleto) { console.warn(`… resultados de ${meta.tournament?.name || tor.name} (t=${tor.t}) ficaram a meio — não vão no ficheiro`); break; }
    Object.assign(resRespostas, novas);
    resFeitos.push(tor.t);
    resLinhas.push({ torneio: meta.tournament?.name || tor.name, data: tor.date_inicio, rondas, jogadores_boys: nJog });
    console.log(`🏆 ${meta.tournament?.name || tor.name} (t=${tor.t}) · ${rondas} volta(s) · ${nJog} rapazes · ${pedidos} pedidos até agora`);
  }
  } catch (err) {
    console.error("❌ Erro inesperado — gravo o que já veio:", err);
  } finally {

  // ── 3. Resultado ──────────────────────────────────────────────────────────
  if (recusa) console.warn(recusa.status
    ? `⛔ A USKids recusou (HTTP ${recusa.status}) no pedido ${recusa.op} ${recusa.extra} — parei aqui. Não voltes a correr hoje.`
    : `⛔ Falhou a ligação (${recusa.erro}) no pedido ${recusa.op} ${recusa.extra} — parei aqui e gravo o que já veio.`);
  if (pedidos >= MAX_PEDIDOS) console.warn(`⚠️ Parei no tecto de ${MAX_PEDIDOS} pedidos.`);
  console.log(`📊 Inscritos: ${feitos.length} de ${torneios.length} torneios vistos · ${alteracoes.length} alterações · Resultados: ${resFeitos.length} de ${acabados.length} · ${pedidos} pedidos`);
  if (alteracoes.length) console.table(alteracoes); else console.log("Sem alterações aos inscritos.");
  if (resLinhas.length) console.table(resLinhas);

  gravar(false);
  }
})();
