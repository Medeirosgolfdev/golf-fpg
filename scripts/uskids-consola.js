// scripts/uskids-consola.js — USKids À MÃO, no browser: DRAWS, inscritos, resultados e NÚMEROS NOVOS
// num só ficheiro.
// (16/11/2026: inscritos — «é melhor fazeres com que ele grave um ficheiro» + «quero também saber se
// há alterações aos inscritos que já temos de todos os torneios»; resultados — «quero os resultados
// dos torneios desde dia 6».
// 18/11/2026: draws e números novos — «já há os draws para o torneio, como vamos fazer scrape,
// podemos aproveitar para ver se há resultados novos e números de torneios novos, actualiza o script
// da consola para fazer tudo de uma vez só». O uskids-consola-numeros-novos.js ficou dentro deste.)
//
// Os workflows estão pausados: o signupanytime recusa (HTTP 403) os pedidos feitos sem browser
// (docs/claude/uskids.md). Este script corre na consola do browser dela, numa página do
// signupanytime aberta por ela, e faz os mesmos pedidos que a página faz — devagar (3 s entre
// pedidos) e parando à primeira recusa.
//
//   0. Vai buscar à app (golf-fpg.vercel.app, CORS aberto) a lista de torneios, os inscritos e o
//      índice dos resultados que já temos.
//   1. DRAWS (primeiro, por ser o mais urgente): torneios onde o Manuel está inscrito que começam
//      daqui a 3 dias ou menos, ou estão a decorrer — o escalão dele e os vizinhos ±1, todas as
//      voltas com draw publicado (GetPlayerTeeTimes&r=<volta>). Mostra o grupo e a hora dele.
//      É a mesma regra do fetch-uskids-draws.js (Fonte 1).
//   2. INSCRITOS de cada torneio que ainda não acabou: o resumo (GetMeta — inscritos por escalão)
//      e, nos escalões Boys 9–13, a lista de nomes — sempre nos torneios seguidos e nos do Manuel;
//      nos outros só onde o número mudou ou ainda não temos nomes («contagens» do
//      fetch-uskids-field.js). Mostra quem entrou, quem saiu, quem desistiu (WD).
//   3. RESULTADOS dos torneios A DECORRER (as voltas já jogadas; 18/11/2026, ela: «mas não apanha os
//      resultados de cada dia, só quando o torneio acaba?») e dos que já acabaram e que a app ainda
//      não tem, ou só tem a meio (índice `parciais`) — GetMeta inteiro e, nos escalões Boys, as
//      listas de cada volta, página a página até ter o flight todo.
//   4. NÚMEROS NOVOS de torneios: do último número conhecido para a frente, até 25 vazios seguidos.
//   5. Descarrega um ficheiro `uskids-AAAA-MM-DD-HHMM.json` com as respostas tal como vieram
//      (aparadas ao que a app usa). A tarefa «USKids - aplicar ficheiro da consola» apanha-o nas
//      Transferências e aplica-o sozinha; à mão é:
//        node scripts/fetch-uskids-field.js   --replay  <ficheiro>   (inscritos)
//        node scripts/fetch-uskids-results.js --replay  <ficheiro>   (resultados)
//        node scripts/fetch-uskids-draws.js   --replay  <ficheiro>   (draws)
//        node scripts/fetch-uskids-field.js   --numeros <ficheiro>   (números novos → catálogo)
//
// Como usar: abrir https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=field&fmt=nohead&ax=2739&t=23132
// → F12 → Consola → colar → Enter. ~300 pedidos de inscritos + ~10 por torneio acabado + ~10 por
// draw + ~30 de números; 3 s cada (20–30 min). Para gravar a meio sem parar: uskidsGravar().
(async () => {
  const APP = "https://golf-fpg.vercel.app/data";
  const PAUSA_MS = 3000;
  const MAX_PEDIDOS = 1100;
  const DIAS_ANTES_DRAW = 3;        // como o fetch-uskids-draws.js: antes disto o draw raramente sai
  const NUM_PARAR_APOS_VAZIOS = 25; // o maior buraco medido na zona viva é de 15 números
  const NUM_MAX_PEDIDOS = 150;
  const PREFIXOS_NOMES = ["boys 9", "boys 10", "boys 11", "boys 12", "boys 13"];
  const comNomes = (nome) => PREFIXOS_NOMES.some(p => String(nome || "").toLowerCase().startsWith(p));
  const norm = (s) => String(s || "").toLowerCase().trim().replace(/\s+/g, " ");
  const dormir = (ms) => new Promise(r => setTimeout(r, ms));
  const dataISO = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ""); return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null; };
  const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const hojeISO = new Date().toISOString().slice(0, 10);
  const diasAte = (s) => { const d = dataISO(s); return d ? Math.round((Date.parse(d) - Date.parse(hojeISO)) / 86400000) : 999; };
  const eManuel = (nome) => /manuel.*medeiros/i.test(String(nome || ""));
  const nomeJ = (p) => `${p.first || ""} ${p.last || ""}`.trim();

  // ── 0. O que a app já tem ────────────────────────────────────────────────
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
  const doManuel = (p) => (p?.escaloes || []).some(e => (e.jogadores || []).some(j => eManuel(j.nome)));
  const torneios = [...lista.values()].sort((a, b) => {
    const pa = prevPorT.get(a.t), pb = prevPorT.get(b.t);
    const ka = (pa?.seguido || doManuel(pa)) ? 0 : 1, kb = (pb?.seguido || doManuel(pb)) ? 0 : 1;
    return ka - kb || (dataISO(a.date_inicio) || "").localeCompare(dataISO(b.date_inicio) || "");
  });
  // Draws: o Manuel inscrito, começa daqui a ≤ 3 dias ou está a decorrer (acabou ontem ou depois).
  const comDraw = field.torneios.filter(t => doManuel(t) && diasAte(t.date_inicio) <= DIAS_ANTES_DRAW
    && diasAte(t.date_fim || t.date_inicio) >= -1);
  // Resultados: os torneios A DECORRER (já começaram e ainda não acabaram) e os que acabaram há menos
  // de 60 dias e a app ainda não tem — ou tem a meio (gravados antes do último dia: `parciais`).
  const temRes = new Set(indiceRes.t || []);
  const parciais = new Set(indiceRes.parciais || []);
  const ha60 = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const aDecorrer = (t) => { const fim = dataISO(t.date_fim) || dataISO(t.date_inicio); return !!fim && fim >= hojeISO; };
  const acabados = cache.torneios.filter(t => {
    const ini = dataISO(t.date_inicio), fim = dataISO(t.date_fim) || ini;
    if (!ini || ini > hojeISO || fim < ha60) return false;
    return fim >= hojeISO || !temRes.has(t.t) || parciais.has(t.t);
  }).sort((a, b) => (dataISO(a.date_inicio) || "").localeCompare(dataISO(b.date_inicio) || ""));
  const nDecorrer = acabados.filter(aDecorrer).length;
  // Números novos: a seguir ao último número que existe (a fronteira gravada na app).
  const numInicio = (cache.fronteira_max_t_visto || cache.varredura_max_t || 0) + 1;
  console.log(`📋 ${comDraw.length} torneio(s) com draw a ver · ${torneios.length} torneios por jogar (os seguidos e os do Manuel primeiro) · ` +
    `${acabados.length} com resultados a ver (${nDecorrer} a decorrer) · números novos a partir do ${numInicio}.`);

  // ── Pedidos, como a página os faz ────────────────────────────────────────
  let pedidos = 0, recusa = null;
  const respostas = {};
  // O mesmo pedido não se repete na mesma corrida (o draw, os inscritos e os resultados de um torneio a
  // decorrer pedem as mesmas listas).
  const jaPedido = new Map();
  async function pedir(op, extra) {
    const chave = `${op}&${extra}`;
    if (jaPedido.has(chave)) return jaPedido.get(chave);
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
    let j = null;
    if (!txt) j = {};
    else try { j = JSON.parse(txt); } catch { j = null; }
    if (j) jaPedido.set(chave, j);
    return j;
  }
  // O GetMeta de um torneio pede-se uma vez só (os draws e os inscritos usam o mesmo).
  const metas = new Map();
  async function getMeta(t) {
    if (metas.has(t)) return metas.get(t);
    const m = await pedir("GetMeta", `t=${t}`);
    if (m) metas.set(t, m);
    return m;
  }
  /** Um flight numa volta, página a página até ter o flight todo. null = ficou a meio. */
  async function flightNaVolta(fid, r, registados, guardar) {
    const vistos = new Set();
    for (let p = 1; p <= 10; p++) {
      const d = await pedir("GetPlayerTeeTimes", `f=${fid}&r=${r}&p=${p}&t=0`);
      if (!d) return null;
      const fp = d.flight_players || {};
      guardar(p, fp);
      const antes = vistos.size;
      for (const pid of Object.keys(fp)) vistos.add(pid);
      if (vistos.size === antes || vistos.size >= registados) break;
    }
    return vistos;
  }

  const drawFeitos = [], drawRespostas = {}, drawLinhas = [];
  const alteracoes = [];
  const feitos = [];
  const resFeitos = [], resRespostas = {}, resLinhas = [];
  const numEntradas = {}, numVazios = [];
  let numFim = null, numCompleto = false;
  let gravacoes = 0;
  function gravar(parcial) {
    const agora = new Date();
    const carimbo = `${agora.toISOString().slice(0, 10)}-${String(agora.getHours()).padStart(2, "0")}${String(agora.getMinutes()).padStart(2, "0")}`;
    const ficheiro = { gerado_em: agora.toISOString(), fonte: "consola do browser (scripts/uskids-consola.js)", parcial: !!parcial, recusa, pedidos,
      torneios: [...feitos], alteracoes: [...alteracoes], respostas,
      resultados: { torneios: [...resFeitos], respostas: resRespostas },
      draws: { torneios: [...drawFeitos], respostas: drawRespostas },
      numeros: { inicio: numInicio, fim: numFim, completo: numCompleto, entradas: { ...numEntradas }, vazios: [...numVazios] } };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(ficheiro)], { type: "application/json" }));
    a.download = `uskids-${carimbo}${parcial ? "-parcial" : ""}${gravacoes++ ? `-${gravacoes}` : ""}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    console.log(`💾 Gravado: ${a.download} (draws de ${drawFeitos.length} torneio(s), inscritos de ${feitos.length}, resultados de ${resFeitos.length}, ` +
      `${Object.keys(numEntradas).length} números novos; pasta Transferências).`);
  }
  // A meio, para gravar o que já veio sem parar: escrever  uskidsGravar()  na consola.
  window.uskidsGravar = () => gravar(true);
  console.log("ℹ️ Para gravar a meio, sem parar: escreve  uskidsGravar()  e Enter.");
  try {

  // ── 1. Draws ──────────────────────────────────────────────────────────────
  for (const tor of comDraw) {
    if (recusa || pedidos >= MAX_PEDIDOS) break;
    const meta = await getMeta(tor.t);
    if (!meta) break;
    const nomeT = meta.tournament?.name || tor.name;
    const escM = (tor.escaloes || []).find(e => (e.jogadores || []).some(j => eManuel(j.nome)));
    const idade = Number(/^boys (\d+)$/i.exec(escM?.nome || "")?.[1]);
    const nomes = Number.isFinite(idade) && idade > 0 ? [`Boys ${idade}`, `Boys ${idade - 1}`, `Boys ${idade + 1}`] : [escM?.nome];
    const porNome = {};
    for (const [fid, f] of Object.entries(meta.flights || {})) {
      const n = meta.age_groups?.[f.age_group]?.name;
      if (n && !porNome[n]) porNome[n] = { fid: Number(fid), age_group: Number(f.age_group), registered: f.registered || 0 };
    }
    const alvos = nomes.map((n, i) => porNome[n] && { ...porNome[n], nome: n, is_manuel: i === 0, adjacent: i > 0 }).filter(Boolean);
    const rondas = meta.tournament?.rounds || tor.rondas || 1;
    const novas = {};
    let incompleto = false;
    const voltasComDraw = new Set();
    for (const alvo of alvos) {
      for (let r = 1; r <= rondas && !incompleto; r++) {
        let comPairing = 0;
        const vistos = await flightNaVolta(alvo.fid, r, alvo.registered, (p, fp) => {
          const aparado = {};
          for (const [pid, j] of Object.entries(fp)) {
            const { strokes, ...rd } = j.rounds?.[r] || j.rounds?.[String(r)] || {};
            if (rd.group_number) comPairing++; // por publicar = todos às 08:00 com group_number 0
            aparado[pid] = { first: j.first, last: j.last, country: j.country, place: j.place, status: j.status, rounds: { [r]: rd } };
          }
          novas[`GetPlayerTeeTimes:${alvo.fid}:${r}:${p}`] = { flight_players: aparado };
        });
        if (!vistos) { incompleto = true; break; }
        if (!comPairing) break; // esta volta ainda não tem draw: as seguintes também não
        voltasComDraw.add(r);
      }
      if (incompleto) break;
    }
    // Um torneio a meio não vai no ficheiro (a app ficava com escalões sem draw).
    if (incompleto) { console.warn(`… draw de ${nomeT} (t=${tor.t}) ficou a meio — não vai no ficheiro`); break; }
    Object.assign(drawRespostas, novas);
    drawFeitos.push({ t: tor.t, name: nomeT, date_inicio: meta.tournament?.start_date || tor.date_inicio,
      date_fim: meta.tournament?.end_date || tor.date_fim, campo: meta.tournament?.courses || tor.campo || null, rondas,
      alvos: alvos.map(a => ({ age_group: a.age_group, nome: a.nome, flight_id: a.fid, is_manuel: a.is_manuel, adjacent: a.adjacent })) });
    // O grupo do Manuel em cada volta com draw.
    const alvoM = alvos.find(a => a.is_manuel);
    for (const r of [...voltasComDraw].sort()) {
      const jogs = Object.entries(novas).filter(([k]) => alvoM && k.startsWith(`GetPlayerTeeTimes:${alvoM.fid}:${r}:`))
        .flatMap(([, v]) => Object.values(v.flight_players)).filter(j => j.status === 1 && j.rounds[r]?.group_number);
      const m = jogs.find(j => eManuel(nomeJ(j)));
      if (!m) continue;
      const rd = m.rounds[r];
      const parceiros = jogs.filter(j => j !== m && j.rounds[r]?.group_number === rd.group_number && j.rounds[r]?.start_time === rd.start_time);
      drawLinhas.push({ torneio: nomeT, volta: r, hora: rd.start_time || "", buraco: rd.start_hole || rd.starting_hole || "", campo: rd.course_name || rd.course || "",
        com: parceiros.map(j => `${nomeJ(j)} (${String(j.country || "").toUpperCase()})`).join(", ") });
    }
    console.log(`⛳ Draw de ${nomeT} (t=${tor.t}) · ${alvos.map(a => a.nome).join(", ")} · voltas com draw: ${[...voltasComDraw].join(", ") || "nenhuma ainda"} · ${pedidos} pedidos até agora`);
  }

  // ── 2. Inscritos ──────────────────────────────────────────────────────────
  for (const tor of torneios) {
    if (recusa || pedidos >= MAX_PEDIDOS) break;
    const prev = prevPorT.get(tor.t);
    const completo = !prev || prev.seguido || doManuel(prev);
    const nAlteracoes = alteracoes.length;
    const meta = await getMeta(tor.t);
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
        const ativos = Object.values(fp).filter(p => p.status === 1).map(nomeJ);
        const agora = new Set(ativos.map(norm));
        const wd = Object.values(fp).filter(p => p.status === 8).map(nomeJ);
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

  // ── 3. Resultados: a decorrer e acabados ─────────────────────────────────
  for (const tor of acabados) {
    if (recusa || pedidos >= MAX_PEDIDOS) break;
    const meta = await getMeta(tor.t);
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
      for (let r = 1; r <= rondas; r++) {
        const vistos = await flightNaVolta(fid, r, f.registered, (p, fp) => { novas[`GetPlayerTeeTimes:${fid}:${r}:${p}`] = { flight_players: fp }; });
        if (!vistos) { incompleto = true; break; }
        if (r === 1) nJog += vistos.size;
      }
      if (incompleto) break;
    }
    // Um torneio a meio não vai no ficheiro (a app ficava com escalões vazios).
    if (incompleto) { console.warn(`… resultados de ${meta.tournament?.name || tor.name} (t=${tor.t}) ficaram a meio — não vão no ficheiro`); break; }
    Object.assign(resRespostas, novas);
    resFeitos.push(tor.t);
    resLinhas.push({ torneio: meta.tournament?.name || tor.name, data: tor.date_inicio, estado: aDecorrer(tor) ? "a decorrer" : "acabado", rondas, jogadores_boys: nJog });
    console.log(`🏆 ${meta.tournament?.name || tor.name} (t=${tor.t})${aDecorrer(tor) ? " · A DECORRER" : ""} · ${rondas} volta(s) · ${nJog} rapazes · ${pedidos} pedidos até agora`);
  }

  // ── 4. Números novos de torneios ─────────────────────────────────────────
  // Um número que não existe responde vazio; pára ao fim de 25 vazios seguidos.
  let vaziosSeguidos = 0;
  for (let t = numInicio, n = 0; n < NUM_MAX_PEDIDOS; t++, n++) {
    if (recusa || pedidos >= MAX_PEDIDOS) break;
    const m = await pedir("GetMeta", `t=${t}`);
    if (!m) break;
    numFim = t;
    const tn = m.tournament;
    if (tn?.name) {
      vaziosSeguidos = 0;
      numEntradas[t] = { n: tn.name.trim(), ty: tn.type ?? null, tour: tn.tour || null, s: tn.start_date || null, e: tn.end_date || null,
        st: tn.status ?? null, r: tn.rounds ?? null, c: tn.courses || null, f: tn.fee_18 || null };
      console.log(`🆕 ${t} · ${tn.name.trim()} · ${tn.start_date || ""} · ${tn.tour || ""}`);
    } else {
      numVazios.push(t);
      if (++vaziosSeguidos >= NUM_PARAR_APOS_VAZIOS) { numCompleto = true; break; }
    }
  }
  // Os vazios do fim não interessam (são só a fronteira); os do meio são buracos.
  while (numVazios.length && numVazios[numVazios.length - 1] > Math.max(0, ...Object.keys(numEntradas).map(Number))) numVazios.pop();

  } catch (err) {
    console.error("❌ Erro inesperado — gravo o que já veio:", err);
  } finally {

  // ── 5. Resultado ──────────────────────────────────────────────────────────
  if (recusa) console.warn(recusa.status
    ? `⛔ A USKids recusou (HTTP ${recusa.status}) no pedido ${recusa.op} ${recusa.extra} — parei aqui. Não voltes a correr hoje.`
    : `⛔ Falhou a ligação (${recusa.erro}) no pedido ${recusa.op} ${recusa.extra} — parei aqui e gravo o que já veio.`);
  if (pedidos >= MAX_PEDIDOS) console.warn(`⚠️ Parei no tecto de ${MAX_PEDIDOS} pedidos.`);
  const nNum = Object.keys(numEntradas).length;
  console.log(`📊 Draws: ${drawFeitos.length} de ${comDraw.length} · Inscritos: ${feitos.length} de ${torneios.length} torneios vistos · ${alteracoes.length} alterações · ` +
    `Resultados: ${resFeitos.length} de ${acabados.length} · Números novos: ${nNum}${numFim ? ` (vistos ${numInicio}–${numFim})` : ""} · ${pedidos} pedidos`);
  if (drawLinhas.length) { console.log("⛳ O Manuel no draw:"); console.table(drawLinhas); }
  else if (drawFeitos.length) console.log("⛳ O draw ainda não tem o Manuel em nenhuma volta (ainda não saiu?).");
  if (alteracoes.length) console.table(alteracoes); else console.log("Sem alterações aos inscritos.");
  if (resLinhas.length) console.table(resLinhas);
  if (nNum) console.table(Object.entries(numEntradas).map(([t, e]) => ({ numero: Number(t), torneio: e.n, inicio: e.s, tour: e.tour })));

  gravar(false);
  }
})();
