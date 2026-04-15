/**
 * console-fpg-whs-scrape.js — Browser Console Script
 * ═══════════════════════════════════════════════════════════════════
 * Faz **scrape de todas as rondas WHS** de uma lista de jogadores FPG,
 * usando a sessão do teu browser (cookies httpOnly incluídos).
 *
 * Output: downloads `fpg-whs-YYYY-MM-DD.json` — mover para
 *         `public/data/fpg-whs.json` (a app carrega automaticamente).
 *
 * ─── COMO USAR ────────────────────────────────────────────────────
 *   1. Abre UMA destas URLs no Chrome (ambas funcionam — são gémeas):
 *        • https://scoring.datagolf.pt/pt/PlayerWHS.aspx?no=52884
 *        • https://my.fpg.pt/Home/PlayerWHS.aspx?no=52884
 *   2. F12 → Console → cola este ficheiro inteiro → Enter
 *   3. Aparece um prompt a pedir a lista de feds — cola o JSON do teu
 *      players.json (ou lista CSV de fed codes)
 *   4. Aguarda ~3-5 min
 *   5. Downloads `fpg-whs-YYYY-MM-DD.json` automaticamente
 *   6. Renomeia para `fpg-whs.json` e move para `public/data/`
 *
 * ─── COMO OBTER A LISTA DE FEDS ────────────────────────────────────
 *   Opção A: abrir http://localhost:5173/data/players.json numa NOVA tab,
 *            Ctrl+A Ctrl+C, colar no prompt
 *   Opção B: lista CSV simples: 52884, 18734, 28894, ...
 *   Opção C: default (só o Manuel) para testes rápidos
 *
 * ─── OPÇÕES ────────────────────────────────────────────────────────
 *   MAX_ROUNDS          — máx rondas por jogador (default 300)
 *   INCLUDE_SCORECARDS  — true = scorecards hole-by-hole (lento)
 *   DELAY_MS            — pausa entre jogadores (default 150ms)
 * ═══════════════════════════════════════════════════════════════════
 */
(async () => {
  "use strict";

  const MAX_ROUNDS = 300;
  const INCLUDE_SCORECARDS = false;
  const DELAY_MS = 150;
  const OUT_PREFIX = "fpg-whs";

  const log  = (...a) => console.log("%c[fpg-whs]", "color:#10b981;font-weight:700", ...a);
  const warn = (...a) => console.warn("%c[fpg-whs]", "color:#f59e0b;font-weight:700", ...a);
  const err  = (...a) => console.error("%c[fpg-whs]", "color:#dc2626;font-weight:700", ...a);

  /* ── 1. Auto-descobrir o endpoint real lendo a config jTable da página ── */
  const host = location.hostname;
  log(`Host: ${host} · path actual: ${location.pathname}`);

  // Inspeccionar a instância jTable da página
  let LIST_ENDPOINT, EXTRA_PARAMS;
  try {
    const parent = document.querySelector(".jtable-main-container")?.parentElement;
    if (!parent) throw new Error("Não encontrei a tabela jTable na página");
    const jt = jQuery.data(parent, "hik-jtable");
    const la = jt?.options?.actions?.listAction;
    if (typeof la !== "string") throw new Error("listAction não é string");
    const u = new URL(la, location.href);
    LIST_ENDPOINT = u.pathname + u.search;
    // Extrair query params (excepto jt*) — vão para o body do POST
    EXTRA_PARAMS = {};
    for (const [k, v] of u.searchParams.entries()) {
      if (!k.startsWith("jt")) EXTRA_PARAMS[k] = v;
    }
    log(`✓ Endpoint descoberto: ${LIST_ENDPOINT}`);
    log(`✓ Params extra do body: ${JSON.stringify(EXTRA_PARAMS)}`);
  } catch (e) {
    err(`Não consegui descobrir o endpoint da página: ${e.message}`);
    err(`Confirma que estás em PlayerWHS.aspx?no=XXXX (e que carregou bem)`);
    return;
  }

  const buildUrl = (fed) => LIST_ENDPOINT.replace(/fed_code=\d+/, `fed_code=${fed}`);

  // Path base para o ScoreCard endpoint
  const BASE_PATH = LIST_ENDPOINT.replace(/\/PlayerWHS\.aspx\/.*/, "");
  const buildScorecardUrl = (id) => `${BASE_PATH}/PlayerWHS.aspx/ScoreCard?score_id=${id}`;

  // Constrói body com EXTRA_PARAMS + jtStartIndex/jtPageSize por jogador
  const buildBody = (fed, pageSize) => ({
    ...EXTRA_PARAMS,
    fed_code: fed,
    jtStartIndex: "0",
    jtPageSize: String(pageSize),
  });

  /* ── 2. Ping ── */
  try {
    const r = await fetch(buildUrl("52884"), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify(buildBody("52884", 1)),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    if ((j.d || j).Result !== "OK") throw new Error((j.d || j).Message || "sessão inválida");
    log(`✓ Ping OK · ${(j.d || j).TotalRecordCount} rondas (sessão activa)`);
  } catch (e) {
    err(`Ping falhou: ${e.message}`);
    err(`Possível causa: sessão expirou ou o endpoint requer login. Faz refresh à página e tenta de novo.`);
    return;
  }

  /* ── 3. Obter lista de jogadores ── */
  let players;
  const input = prompt(
    "Cola a lista de fed codes:\n\n" +
    "• JSON do players.json (objecto com fed codes como chaves)\n" +
    "• OU lista CSV separada por vírgulas: 52884, 18734, ...\n" +
    "• OU vazio para só testar com o Manuel (52884)\n\n" +
    "Dica: abre http://localhost:5173/data/players.json numa tab, Ctrl+A, Ctrl+C, cola aqui."
  );

  if (!input || !input.trim()) {
    players = ["52884"];
    log("ℹ Sem input — a usar só Manuel (teste)");
  } else {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      try {
        players = Object.keys(JSON.parse(trimmed));
        log(`✓ JSON parseado — ${players.length} jogadores`);
      } catch (e) {
        err(`JSON inválido: ${e.message}`);
        return;
      }
    } else if (trimmed.startsWith("[")) {
      try {
        const arr = JSON.parse(trimmed);
        players = arr.map(String);
        log(`✓ Array parseado — ${players.length} jogadores`);
      } catch (e) {
        err(`Array JSON inválido: ${e.message}`);
        return;
      }
    } else {
      // CSV
      players = trimmed.split(/[,\s]+/).map(s => s.trim()).filter(s => /^\d+$/.test(s));
      log(`✓ CSV parseado — ${players.length} jogadores`);
    }
  }

  if (!players.length) {
    err("Lista vazia. A abortar.");
    return;
  }

  /* ── 4. Scrape ── */
  const results = {};
  const errors = [];
  const t0 = Date.now();

  // Helper de fetch com retry em HTTP 500 transitório
  const fetchWithRetry = async (fed, attempt = 1) => {
    const r = await fetch(buildUrl(fed), {
      method: "POST", credentials: "include",
      headers: {
        "Content-Type":     "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest",
        "Accept":           "application/json, text/javascript, */*; q=0.01",
      },
      body: JSON.stringify(buildBody(fed, MAX_ROUNDS)),
    });
    if (r.status === 500 && attempt < 3) {
      // Backoff: 500ms, 1s, 2s
      await new Promise(s => setTimeout(s, 500 * attempt));
      return fetchWithRetry(fed, attempt + 1);
    }
    return r;
  };

  for (let i = 0; i < players.length; i++) {
    const fed = String(players[i]);
    try {
      const r = await fetchWithRetry(fed);
      if (!r.ok) { errors.push({ fed, msg: "HTTP " + r.status }); continue; }
      const j = await r.json();
      const d = j.d || j;
      if (d.Result !== "OK") { errors.push({ fed, msg: d.Message }); continue; }
      const records = d.Records || [];

      // Scorecards hole-by-hole (opcional)
      let scorecards = null;
      if (INCLUDE_SCORECARDS) {
        scorecards = {};
        for (const rec of records) {
          try {
            const scRes = await fetch(buildScorecardUrl(rec.score_id), {
              method: "POST", credentials: "include",
              headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
              body: JSON.stringify({
                score_id: String(rec.score_id),
                scoringtype: String(rec.scoring_type_id),
                competitiontype: String(rec.competition_type_id),
              }),
            });
            const scJ = await scRes.json();
            scorecards[rec.score_id] = (scJ.d || scJ).Records?.[0] || null;
            await new Promise(r => setTimeout(r, DELAY_MS));
          } catch {}
        }
      }

      results[fed] = { rounds: records, scorecards };
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      log(`[${i + 1}/${players.length}] fed=${fed} · ${records.length} rondas · ${elapsed}s`);
    } catch (e) {
      errors.push({ fed, msg: e.message });
      warn(`fed=${fed} falhou:`, e.message);
    }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  /* ── 5. Output ── */
  const out = {
    generated: new Date().toISOString(),
    source: `${host}${LIST_ENDPOINT.split("?")[0]}`,
    totalPlayers: players.length,
    totalScraped: Object.keys(results).length,
    totalErrors: errors.length,
    includesScorecards: INCLUDE_SCORECARDS,
    players: results,
    errors,
  };

  const today = new Date().toISOString().slice(0, 10);
  const filename = `${OUT_PREFIX}-${today}.json`;
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);

  log(`\n✓ Concluído em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  log(`  Jogadores: ${out.totalScraped}/${out.totalPlayers}`);
  log(`  Erros: ${out.totalErrors}`);
  log(`  📥 ${filename} descarregado`);
  log(`  Próximo passo: renomear para fpg-whs.json e mover para public/data/`);
  window.__fpgWhs = out;
})();
