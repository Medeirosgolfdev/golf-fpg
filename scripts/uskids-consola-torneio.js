// scripts/uskids-consola-torneio.js — os RESULTADOS de UM torneio USKids, à mão, no browser.
// (20/11/2026, Mariana: «é para ir buscar os resultados de 1 único torneio… ele ainda está a
// decorrer, mas quero já dos escalões que já acabaram».)
//
// Só fala com o signupanytime (nada da app). O torneio é o da página aberta (o `t=` do endereço).
// Pede o GetMeta e, em cada escalão, as listas de cada volta (GetPlayerTeeTimes), página a página,
// e guarda TUDO o que já houver — também as voltas a meio, com os buracos já jogados («não é para
// quando todos acabarem, é para descarregar o que já houver»). Pára em cada escalão na primeira
// volta ainda sem nenhum buraco jogado.
// Devagar (3 s entre pedidos) e pára à primeira recusa, como o uskids-consola.js.
//
// Voltas já ACABADAS não se voltam a pedir (20/11/2026, ela: «escusa de estar sempre a fazer os
// pedidos dos que já temos»): ficam guardadas neste browser (localStorage do signupanytime, chave
// `uskidsTorneio:<t>`) e entram no ficheiro sem pedido nenhum. Só se pedem o GetMeta e as voltas a
// meio ou ainda não vistas. Sem nada de novo, não grava ficheiro. Para esquecer: uskidsEsquecer().
//
// Como usar: abrir a página do torneio, por exemplo
//   https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=field&fmt=nohead&ax=2739&t=23132
// → F12 → Consola → colar → Enter. ~2 pedidos por escalão e volta (poucos minutos).
// Descarrega `uskids-AAAA-MM-DD-HHMM.json` (o mesmo formato da consola grande, só a secção dos
// resultados); a tarefa «USKids - aplicar ficheiro da consola» apanha-o nas Transferências. À mão:
//   node scripts/fetch-uskids-results.js --replay <ficheiro>
(async () => {
  const PAUSA_MS = 3000;
  const MAX_PEDIDOS = 300;
  const t = Number(new URLSearchParams(location.search).get("t"));
  if (!t) { console.error("❌ Esta página não tem t= no endereço — abre a página do torneio no signupanytime."); return; }
  const dormir = (ms) => new Promise(r => setTimeout(r, ms));

  let pedidos = 0, recusa = null;
  async function pedir(op, extra) {
    if (recusa || pedidos >= MAX_PEDIDOS) return null;
    pedidos++;
    let r, txt;
    try {
      r = await fetch(`/plugins/links/admin/LinksAJAX.aspx?op=${op}&${extra}&jbgr=${Math.floor(Date.now() / 1000)}&c=1`, { method: "POST" });
      txt = (await r.text()).trim();
    } catch (err) { recusa = { op, extra, status: 0, erro: String(err) }; return null; }
    await dormir(PAUSA_MS);
    if ([403, 429, 503].includes(r.status) || /too many requests/i.test(txt)) { recusa = { op, extra, status: r.status }; return null; }
    if (!txt) return {};
    try { return JSON.parse(txt); } catch { return null; }
  }
  /** Um escalão numa volta, página a página até ter todos. null = falhou o pedido. */
  async function flightNaVolta(fid, r, registados) {
    const paginas = {}, vistos = new Set();
    for (let p = 1; p <= 10; p++) {
      const d = await pedir("GetPlayerTeeTimes", `f=${fid}&r=${r}&p=${p}&t=0`);
      if (!d) return null;
      const fp = d.flight_players || {};
      paginas[p] = fp;
      const antes = vistos.size;
      for (const pid of Object.keys(fp)) vistos.add(pid);
      if (vistos.size === antes || vistos.size >= registados) break;
    }
    return paginas;
  }
  /** Estado de uma volta: «acabada» (todos com os buracos todos), «a meio» ou «por jogar». */
  function estadoDaVolta(paginas, r) {
    const js = Object.values(Object.assign({}, ...Object.values(paginas))).filter(j => j.status === 1);
    const rd = (j) => j.rounds?.[String(r)] || {};
    const feitos = (j) => (rd(j).strokes || []).slice(0, rd(j).num_holes || 18).filter(x => x > 0).length;
    const acabou = (j) => feitos(j) >= (rd(j).num_holes || 18);
    if (!js.length || !js.some(j => feitos(j) > 0)) return { estado: "por jogar", n: js.length, acabaram: 0 };
    const n = js.filter(acabou).length;
    return { estado: n === js.length ? "acabada" : "a meio", n: js.length, acabaram: n };
  }

  // Voltas acabadas de corridas anteriores: { "<fid>:<volta>": { <página>: flight_players } }.
  const CHAVE = `uskidsTorneio:${t}`;
  let memoria = {};
  try { memoria = JSON.parse(localStorage.getItem(CHAVE) || "{}") || {}; } catch { memoria = {}; }
  const lembrar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(memoria)); } catch (err) { console.warn("Não consegui guardar as voltas acabadas neste browser:", err); } };
  window.uskidsEsquecer = () => { try { localStorage.removeItem(CHAVE); } catch { /* nada */ } memoria = {}; console.log(`Esqueci as voltas guardadas do t=${t}.`); };

  const respostas = {}, linhas = [];
  let nome = `t=${t}`, novas = 0, deMemoria = 0;
  try {
    const meta = await pedir("GetMeta", `t=${t}`);
    if (!meta?.flights) throw new Error(`o torneio ${t} não tem escalões publicados`);
    nome = meta.tournament?.name || nome;
    respostas[`GetMeta:${t}`] = meta;
    const rondas = meta.tournament?.rounds || 1;
    // Dia de cada volta: a R2 é no dia a seguir ao da R1, e assim por diante. Antes desse dia
    // não se pede a volta (nem se lhe conta um pedido por escalão em cada corrida).
    const mIni = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(meta.tournament?.start_date || "");
    const hoje = new Date().toISOString().slice(0, 10);
    const diaDaVolta = (r) => mIni ? new Date(Date.UTC(+mIni[3], +mIni[1] - 1, +mIni[2] + r - 1)).toISOString().slice(0, 10) : null;
    console.log(`🏆 ${nome} (t=${t}) · ${rondas} volta(s) · ${Object.keys(meta.flights).length} escalões`);
    const porAG = {};
    for (const [fid, f] of Object.entries(meta.flights)) if (!porAG[f.age_group]) porAG[f.age_group] = { fid, f };
    for (const [ag, { fid, f }] of Object.entries(porAG)) {
      const esc = String(meta.age_groups?.[ag]?.name || `escalão ${ag}`);
      if (!(f.registered > 0)) continue;
      let guardadas = 0, falta = "";
      for (let r = 1; r <= rondas; r++) {
        const guardada = memoria[`${fid}:${r}`];
        if (!guardada && r > 1 && diaDaVolta(r) && diaDaVolta(r) > hoje) break;
        const paginas = guardada || await flightNaVolta(fid, r, f.registered);
        if (!paginas) { falta = "falhou o pedido"; break; }
        const e = guardada ? { estado: "acabada" } : estadoDaVolta(paginas, r);
        if (e.estado === "por jogar") break;
        if (guardada) deMemoria++;
        else if (e.estado === "acabada") { novas++; memoria[`${fid}:${r}`] = paginas; lembrar(); }
        else {
          // Volta a meio: só conta como novidade se mudou desde a última corrida (buracos
          // lançados por jogador) — senão gravava um ficheiro igual em cada corrida.
          const assinatura = Object.values(Object.assign({}, ...Object.values(paginas))).filter(j => j.status === 1)
            .map(j => `${j.first} ${j.last}:${(j.rounds?.[String(r)]?.strokes || []).join(",")}`).sort().join("|");
          if (memoria[`meio:${fid}:${r}`] !== assinatura) { novas++; memoria[`meio:${fid}:${r}`] = assinatura; lembrar(); }
        }
        for (const [p, fp] of Object.entries(paginas)) respostas[`GetPlayerTeeTimes:${fid}:${r}:${p}`] = { flight_players: fp };
        guardadas = r;
        if (e.estado === "a meio") { falta = `R${r} a meio (${e.acabaram}/${e.n} com resultado)`; break; }
      }
      linhas.push({ escalao: esc, jogadores: f.registered, voltas_guardadas: guardadas ? `R1–R${guardadas}`.replace("R1–R1", "R1") : "—", estado: falta || (guardadas === rondas ? "acabou o torneio" : guardadas ? `R${guardadas} acabada` : "sem resultados publicados") });
      console.log(`  ${guardadas ? "✅" : "⏳"} ${esc}: ${guardadas ? `até à R${guardadas}` : "sem resultados publicados"}${falta ? ` · ${falta}` : ""} · ${pedidos} pedidos (${deMemoria} volta(s) já guardadas, sem pedido)`);
      if (recusa) break;
    }
  } catch (err) {
    console.error("❌", err.message || err);
  } finally {
    if (recusa) console.warn(recusa.status
      ? `⛔ A USKids recusou (HTTP ${recusa.status}) — parei aqui. Não voltes a correr hoje.`
      : `⛔ Falhou a ligação (${recusa.erro}) — parei aqui.`);
    if (linhas.length) console.table(linhas);
    const comVoltas = linhas.some(l => l.voltas_guardadas !== "—");
    if (!comVoltas) { console.warn("Ainda não há buracos jogados em nenhum escalão — não gravei ficheiro."); return; }
    if (!novas) { console.log(`Nada de novo desde a última vez (${deMemoria} volta(s) acabadas já guardadas) — não gravei ficheiro.`); return; }
    const agora = new Date();
    const carimbo = `${agora.toISOString().slice(0, 10)}-${String(agora.getHours()).padStart(2, "0")}${String(agora.getMinutes()).padStart(2, "0")}`;
    const ficheiro = {
      gerado_em: agora.toISOString(), fonte: "consola do browser (scripts/uskids-consola-torneio.js)", parcial: false, recusa, pedidos,
      torneios: [], alteracoes: [], respostas: {},
      resultados: { torneios: [t], todos_escaloes: [t], respostas },
      draws: { torneios: [], respostas: {} },
      numeros: { inicio: null, fim: null, completo: false, entradas: {}, vazios: [] },
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(ficheiro)], { type: "application/json" }));
    a.download = `uskids-${carimbo}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    console.log(`💾 Gravado: ${a.download} — resultados de ${nome}, tudo o que já havia (pasta Transferências).`);
  }
})();
