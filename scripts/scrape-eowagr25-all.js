/**
 * scrape-eowagr25-all.js
 *
 * Descarrega TODOS os escalões do European Open WAGR (BlueGolf), descobrindo-os
 * automaticamente a partir do evento (não é preciso saber os nº de contest).
 * Corre sequencialmente — um browser, um escalão de cada vez. Resolve CAPTCHA
 * manualmente quando aparece (browser visível).
 *
 * Descobertas incorporadas (sessão 2026-05):
 *   • Auto-discovery: lê o seletor de flights da página de um contest semente
 *     (CONTESTS[0]) e apanha Boys + Girls + todas as idades.
 *   • Captura `yards` por buraco (input[data-distance]) → distâncias no scorecard
 *     (o site converte depois yards→metros).
 *   • Grava `category` (nome do escalão) em cada ficheiro.
 *
 * USO:
 *   node scrape-eowagr25-all.js                  # Firefox (defeito)
 *   BROWSER=chrome node scrape-eowagr25-all.js   # forçar Chrome real
 *   (Firefox precisa de: npx playwright install firefox)
 *
 * Ficheiros gerados (1 por escalão): eowagr25_contest<id>.json
 * Depois: copiar para public/data/ e registar no array URLS do BJGTPage.
 */

const { chromium, firefox } = require("playwright");
const fs = require("fs");

/* ─── Torneios a descarregar ─── */
const CONTESTS = [
  {
    url: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/13/leaderboard.htm",
    out: "eowagr25_contest13.json",
  },
  {
    url: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/77/leaderboard.htm",
    out: "eowagr25_contest77.json",
  },
  {
    url: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/121/leaderboard.htm",
    out: "eowagr25_contest121.json",
  },
];

const DELAY_MS = 700;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─── CAPTCHA ─── */
/** Verifica o estado HTTP real da navegação. 403/429 = bloqueio do servidor. */
function checkBlocked(resp, url) {
  const status = resp ? resp.status() : 0;
  if (status === 403 || status === 429) {
    console.error(`\n🚫 BlueGolf devolveu HTTP ${status} — bloqueio de servidor (Cloudflare/IP).`);
    console.error(`   URL: ${url}`);
    console.error("   Não é cache local. Teste decisivo: abre este URL no teu Chrome normal.");
    console.error("   • Se também der 403 → bloqueio de IP: muda de IP (hotspot 4G / VPN) ou espera.");
    console.error("   • Se abrir normalmente → deteção de automação: avisa-me que ligo via CDP ao teu Chrome.\n");
    throw new Error(`BlueGolf HTTP ${status}`);
  }
}

async function waitForHuman(page) {
  const title = (await page.title()).toLowerCase();
  if (!title.includes("confirm") && !title.includes("human")) return;
  console.log("\n⏳ CAPTCHA detectado! Resolve no browser...");
  await page.waitForFunction(
    () =>
      !document.title.toLowerCase().includes("confirm") &&
      !document.title.toLowerCase().includes("human"),
    { timeout: 300_000 }
  );
  console.log("✅ CAPTCHA resolvido!\n");
  await sleep(1500);
}

/* ─── Extrair scorecard ─── */
async function extractScorecard(page) {
  return page.evaluate(() => {
    const result = {
      name: "",
      country: "",
      pos: null,
      result: "",
      total: null,
      par: [],
      si: [],
      yards: [],
      rounds: [],
    };

    /* Nome */
    const nameSelectors = [
      ".bg-profile-header h3 a",
      ".bg-profile-header h2 a",
      ".player-name a",
      ".player-name",
      "h3.contestant-name",
      ".contestant-name",
    ];
    for (const sel of nameSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const clone = el.cloneNode(true);
        clone.querySelectorAll("i, img, span.flag-icon, svg").forEach((x) => x.remove());
        const txt = clone.textContent.replace(/\s+/g, " ").trim();
        if (txt.length > 1) { result.name = txt; break; }
      }
    }

    /* País */
    for (const sel of [
      ".bg-profile-header p.text-muted",
      ".bg-profile-header .text-muted",
      ".player-country",
      ".contestant-country",
    ]) {
      const el = document.querySelector(sel);
      if (el) { result.country = el.textContent.trim(); break; }
    }

    /* Posição / resultado / total */
    for (const tr of document.querySelectorAll(
      "table.scorecard-profile tr, table.player-profile tr"
    )) {
      const tds = tr.querySelectorAll("td");
      if (tds.length < 2) continue;
      const label = tds[0].textContent.trim().toLowerCase();
      const val = tds[1].textContent.trim();
      if (label.includes("posi")) result.pos = parseInt(val, 10) || null;
      if (label.includes("resultado") || label.includes("result")) result.result = val;
      if (label.includes("tacada") || label.includes("stroke") || label.includes("total"))
        result.total = parseInt(val, 10) || null;
    }

    /* Parser de tabela.
       Devolve par/si/yards/rounds JÁ compactados aos buracos jogados neste
       contest. Crucial para os sub-contests "Par 3/4/5", em que só se jogam
       os buracos desse par (ex.: Par 5 → só os 4-6 buracos par-5). */
    function parseTable(table) {
      const trs = Array.from(table.querySelectorAll("tr"));

      // Linha-cabeçalho dos buracos = a que contém os inputs hidden data-par
      // (uma célula por buraco). As células de label e de TOTAL (Fora/Dentro/
      // Total) NÃO têm esse input — é assim que as excluímos com segurança.
      let headerRow = null;
      for (const tr of trs) {
        if (tr.querySelector('input[type="hidden"][data-par]')) { headerRow = tr; break; }
      }

      /* ── Caminho coluna-a-coluna (layout moderno bluegolfw) ── */
      if (headerRow) {
        const headCells = Array.from(headerRow.querySelectorAll("th, td"));
        const holeCols = [];   // índices de coluna que são buracos
        const fullPar = [];    // par do campo (todos os buracos do cartão)
        const fullYards = [];  // jardas por buraco
        headCells.forEach((c, i) => {
          const parInp = c.querySelector('input[type="hidden"][data-par]');
          if (!parInp) return; // label ou coluna de total → ignorar
          holeCols.push(i);
          fullPar.push(parseInt(parInp.getAttribute("data-par"), 10) || 0);
          const distInp = c.querySelector('input[type="hidden"][data-distance]');
          const d = distInp ? parseInt(distInp.getAttribute("data-distance"), 10) : 0;
          fullYards.push(!isNaN(d) && d > 0 ? d : 0);
        });

        // SI: linha "hcp"/"handicap"/"tee handicap", lida nas mesmas colunas.
        const fullSi = new Array(holeCols.length).fill(0);
        for (const tr of trs) {
          const first = tr.querySelector("td, th");
          if (!first) continue;
          const label = first.textContent.trim().toLowerCase();
          if (label.includes("handicap") || label.includes("hcp")) {
            const cells = Array.from(tr.querySelectorAll("th, td"));
            holeCols.forEach((ci, k) => {
              const n = parseInt((cells[ci] ? cells[ci].textContent : "").trim(), 10);
              if (!isNaN(n) && n >= 1 && n <= 18) fullSi[k] = n;
            });
            break;
          }
        }

        // Par do CONCURSO: linha visível "Par" (0 nos buracos não jogados neste
        // contest). Define quais buracos foram efectivamente jogados.
        let contestPar = null;
        for (const tr of trs) {
          const first = tr.querySelector("td, th");
          if (!first) continue;
          if (first.textContent.trim().toLowerCase() === "par") {
            const cells = Array.from(tr.querySelectorAll("th, td"));
            contestPar = holeCols.map(
              (ci) => parseInt((cells[ci] ? cells[ci].textContent : "").trim(), 10) || 0
            );
            break;
          }
        }
        const playedIdx = [];
        for (let k = 0; k < holeCols.length; k++) {
          if (!contestPar || contestPar[k] > 0) playedIdx.push(k);
        }

        const par = playedIdx.map((k) => fullPar[k]);
        const yards = playedIdx.map((k) => fullYards[k]);
        const si = playedIdx.map((k) => fullSi[k]);

        // Rondas: linhas Volta/Round/scores, lidas SÓ nas colunas de buracos
        // jogados (exclui Fora/Dentro/Total). Aceita a ronda só se todos os
        // buracos jogados têm tacada (ronda completa) — evita rondas a meio.
        // ⚠ A scorecard.htm lista as Voltas por ordem DESCENDENTE (Volta 3, 2, 1).
        // Captura-se o nº da Volta do rótulo e ordena-se ASCENDENTE, senão a R1
        // ficava trocada com a R3 (bug confirmado contra o BlueGolf 2026-05).
        const roundsTmp = [];
        let seq = 0;
        for (const tr of trs) {
          const first = tr.querySelector("td, th");
          if (!first) continue;
          const label = first.textContent.trim().toLowerCase();
          const isScore =
            tr.classList.contains("scores") ||
            /^(volta|round|rd)\s*\d/.test(label) ||
            /^r\s*\d$/.test(label);
          if (!isScore) continue;
          seq++;
          const numM = label.match(/(\d+)/);
          const num = numM ? parseInt(numM[1], 10) : seq; // nº da Volta (1/2/3)
          const cells = Array.from(tr.querySelectorAll("th, td"));
          const scores = playedIdx.map((k) => {
            const n = parseInt((cells[holeCols[k]] ? cells[holeCols[k]].textContent : "").trim(), 10);
            return !isNaN(n) && n >= 1 && n <= 30 ? n : NaN;
          });
          if (scores.length > 0 && scores.every((s) => !isNaN(s))) roundsTmp.push({ num, scores });
        }
        roundsTmp.sort((a, b) => a.num - b.num); // ascendente: R1, R2, R3
        const rounds = roundsTmp.map((r) => r.scores);

        return { par, si, yards, rounds };
      }

      /* ── Caminho antigo (layouts sem inputs data-par): baseado em texto ── */
      const localPar = [], localSi = [], localYards = [], localRounds = [];

      for (const tr of table.querySelectorAll("tr")) {
        const first = tr.querySelector("td, th");
        if (first && first.textContent.trim().toLowerCase() === "par") {
          for (const td of Array.from(tr.querySelectorAll("td, th")).slice(1)) {
            const n = parseInt(td.textContent.trim(), 10);
            if (!isNaN(n) && n >= 3 && n <= 5) localPar.push(n);
          }
          break;
        }
      }

      for (const tr of table.querySelectorAll("tr")) {
        const first = tr.querySelector("td, th");
        if (!first) continue;
        const label = first.textContent.trim().toLowerCase();
        if (label === "hcp" || label.includes("handicap")) {
          for (const td of Array.from(tr.querySelectorAll("td, th")).slice(1)) {
            const n = parseInt(td.textContent.trim(), 10);
            if (!isNaN(n) && n >= 1 && n <= 18) localSi.push(n);
          }
          break;
        }
      }

      // Preserva o limite antigo (9) para cartões de 18 buracos; mais permissivo
      // só quando o par conhecido indica um cartão curto (sub-contests par-N).
      const minHoles = localPar.length > 0 ? Math.max(1, Math.min(9, localPar.length)) : 9;
      const scoreRows = table.querySelectorAll("tr.scores");
      const rowSet = scoreRows.length > 0 ? scoreRows : table.querySelectorAll("tr");
      for (const tr of rowSet) {
        if (scoreRows.length === 0) {
          const first = tr.querySelector("td");
          if (!first) continue;
          const label = first.textContent.trim().toLowerCase();
          if (!label.match(/^(volta|rd|round)\s*\d/) && !label.match(/^r\s*\d$/)) continue;
        }
        const scores = [];
        for (const td of Array.from(tr.querySelectorAll("td")).slice(1)) {
          const n = parseInt(td.textContent.trim(), 10);
          if (!isNaN(n) && n >= 1 && n <= 15) scores.push(n);
        }
        if (scores.length >= minHoles) localRounds.push(scores);
      }
      return { par: localPar, si: localSi, yards: localYards, rounds: localRounds };
    }

    /* Desktop block */
    const desktopBlock =
      document.querySelector(".row.d-none.d-md-block") ||
      document.querySelector(".d-none.d-md-flex") ||
      document.querySelector(".desktop-scorecard");

    if (desktopBlock) {
      const table = desktopBlock.querySelector(
        "table.bg-tbl-scorecard, table.scorecard-table, table"
      );
      if (table) {
        const p = parseTable(table);
        if (p.par.length > 0) result.par = p.par.slice(0, 18);
        if (p.si.length > 0) result.si = p.si.slice(0, 18);
        if (p.yards.length > 0) result.yards = p.yards.slice(0, 18);
        if (p.rounds.length > 0) result.rounds = p.rounds;
      }
    }

    /* Fallback mobile */
    if (result.rounds.length === 0) {
      const allTables = document.querySelectorAll(
        "table.bg-tbl-scorecard, table.scorecard-table"
      );
      const mobileRounds = [];
      for (const table of allTables) {
        const p = parseTable(table);
        if (result.par.length === 0 && p.par.length > 0) result.par = p.par.slice(0, 18);
        if (result.si.length === 0 && p.si.length > 0) result.si = p.si.slice(0, 18);
        if (result.yards.length === 0 && p.yards.length > 0) result.yards = p.yards.slice(0, 18);
        mobileRounds.push(...p.rounds);
      }
      if (mobileRounds.length >= 2 && mobileRounds[0].length === 9) {
        for (let i = 0; i + 1 < mobileRounds.length; i += 2)
          result.rounds.push([...mobileRounds[i], ...mobileRounds[i + 1]]);
      } else if (mobileRounds.length > 0) {
        result.rounds = mobileRounds;
      }
    }

    return result;
  });
}

/* ─── Scrape um contest ─── */
async function scrapeContest(page, contestUrl, outFile, category) {
  const contestMatch = contestUrl.match(/^(https?:\/\/.+\/contest\/\d+)/);
  if (!contestMatch) throw new Error("URL inválida: " + contestUrl);
  const contestBase = contestMatch[1];
  const contestId = contestUrl.match(/contest\/(\d+)/)[1];

  console.log(`\n${"═".repeat(60)}`);
  console.log(`📋 Contest ${contestId} → ${outFile}`);
  console.log(`   URL: ${contestUrl}`);

  const resp = await page.goto(contestUrl, { waitUntil: "domcontentloaded" });
  checkBlocked(resp, contestUrl);
  await waitForHuman(page);
  await page.waitForLoadState("networkidle");

  const pageTitle = await page.title();
  const tournamentTitle = pageTitle
    .replace(/ \| .*$/, "")
    .replace(" Leaderboard", "")
    .trim();
  console.log(`   Torneio: ${tournamentTitle}`);

  /* Contestants */
  const contestants = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="contestant"], a[href*="player"]');
    const seen = new Map();
    for (const link of links) {
      const href = link.getAttribute("href") || "";
      const match = href.match(/contestant\/(\d+)/);
      if (!match) continue;
      const id = match[1];
      if (seen.has(id)) continue;
      const clone = link.cloneNode(true);
      clone.querySelectorAll("i, img, span.flag-icon, svg").forEach((el) => el.remove());
      const name = clone.textContent.replace(/\s+/g, " ").trim();
      seen.set(id, { id, name });
    }
    return Array.from(seen.values());
  });

  console.log(`   Jogadores: ${contestants.length}\n`);

  if (contestants.length === 0) {
    const html = await page.content();
    const debugFile = `debug_contest${contestId}.html`;
    fs.writeFileSync(debugFile, html);
    console.error(`   ❌ Nenhum contestant. HTML guardado em ${debugFile}`);
    return;
  }

  /* Scorecards */
  const players = [];
  let par = null;
  let si = null;
  let yards = null;

  for (let i = 0; i < contestants.length; i++) {
    const c = contestants[i];
    const url = `${contestBase}/contestant/${c.id}/scorecard.htm`;

    process.stdout.write(
      `\r   🔍 [${String(i + 1).padStart(2)}/${contestants.length}] ${c.name.padEnd(32).slice(0, 32)}`
    );

    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await waitForHuman(page);
      await page
        .waitForSelector(
          "table.bg-tbl-scorecard, table.scorecard-table, table.scorecard-profile",
          { timeout: 12_000 }
        )
        .catch(() => {});

      const sc = await extractScorecard(page);

      // >= 1 (não >= 9): nos sub-contests "Par 3/4/5" só se jogam 4-6 buracos,
      // por isso par/yards compactados têm menos de 9 valores.
      if (!par && sc.par.length >= 1) par = sc.par.slice(0, 18);
      if (!si && sc.si.length >= 1) si = sc.si.slice(0, 18);
      if (!yards && sc.yards && sc.yards.length >= 1) yards = sc.yards.slice(0, 18);

      const name = sc.name && sc.name.length > 1 ? sc.name : c.name;
      const rounds = sc.rounds.map((scores, idx) => {
        const f9 = scores.slice(0, 9).reduce((a, b) => a + b, 0);
        const b9 = scores.length > 9 ? scores.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
        const gross = scores.reduce((a, b) => a + b, 0);
        return { day: idx + 1, scores, f9, ...(scores.length > 9 ? { b9 } : {}), gross };
      });

      const total =
        rounds.length > 0 ? rounds.reduce((a, r) => a + r.gross, 0) : sc.total;
      const parTotal = par ? par.reduce((a, b) => a + b, 0) : 0;
      const result =
        parTotal > 0 && rounds.length > 0 ? total - parTotal * rounds.length : null;

      players.push({ name, country: sc.country || "", pos: sc.pos, result, total, rounds });

      const nR = rounds.length;
      const nH = nR > 0 ? rounds[0].scores.length : 0;
      process.stdout.write(
        nR === 0 ? " ⚠️  sem scores" : ` ✅ ${nR}R ${nH}H gross=${total}`
      );
    } catch (err) {
      process.stdout.write(` ❌ ${err.message.slice(0, 35)}`);
      players.push({
        name: c.name,
        country: "",
        pos: null,
        result: null,
        total: null,
        rounds: [],
        _error: err.message,
      });
    }

    await sleep(DELAY_MS);
  }

  console.log("\n");

  /* Output */
  const parF9 = par ? par.slice(0, 9).reduce((a, b) => a + b, 0) : null;
  const parB9 = par && par.length > 9 ? par.slice(9).reduce((a, b) => a + b, 0) : null;
  const parTotal = par ? par.reduce((a, b) => a + b, 0) : null;

  const output = {
    tournament: tournamentTitle,
    category: category || "",
    course: "",
    year: 2025,
    par: par || [],
    ...(si && si.length > 0 ? { si } : {}),
    ...(yards && yards.length > 0 ? { yards } : {}),
    parF9,
    parB9,
    parTotal,
    players: players.sort((a, b) => {
      if (a.pos != null && b.pos != null) return a.pos - b.pos;
      if (a.total != null && b.total != null) return a.total - b.total;
      return 0;
    }),
  };

  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), "utf-8");

  const ok = players.filter((p) => p.rounds.length > 0).length;
  const errs = players.filter((p) => p._error).length;
  console.log(`   ✅ ${players.length} jogadores | ${ok} com scorecards | ${errs} erros`);
  if (par) console.log(`   Par: [${par.join(",")}] = ${parTotal}`);
  if (yards) console.log(`   Yards: [${yards.join(",")}]`);
  else console.log(`   ⚠️  Sem distâncias (yards) capturadas neste escalão`);
  console.log(`   Ficheiro: ${outFile}`);
}

/* ─── Descobrir TODOS os escalões (contests) do evento ───
 * A partir de um contest semente, lê o seletor de flights/divisões da página
 * e devolve todos os escalões (Boys + Girls + todas as idades + WAGR + …).
 *
 * O seletor de escalões do BlueGolf é, na maioria das páginas, um <select>
 * NATIVO (ver o ✓ ao lado da divisão activa) cujas <option> NÃO são links —
 * por isso a versão antiga (que só lia <a href*="/contest/">) só apanhava o
 * próprio contest semente. Esta versão lê de TRÊS fontes:
 *   A) o <select> de flights — identificado por conter o id semente entre as
 *      suas options (validação que confirma o mapeamento value→id);
 *   B) dropdowns Bootstrap / tabs (links <a href*="/contest/N/">);
 *   C) regex de fallback ao HTML inteiro (apanha /contest/N/ em onclick/JS).
 * Devolve { contests, debugHtml } — o HTML é gravado pelo chamador se a
 * descoberta vier fraca (≤1 escalão), para diagnóstico. */
async function discoverContests(page, seedUrl, includePar) {
  const resp = await page.goto(seedUrl, { waitUntil: "domcontentloaded" });
  checkBlocked(resp, seedUrl);
  await waitForHuman(page);
  await page.waitForLoadState("networkidle").catch(() => {});

  const base = (seedUrl.match(/^(https?:\/\/.+\/event\/[^/]+)/) || [])[1];
  const seedId = (seedUrl.match(/contest\/(\d+)/) || [])[1] || null;
  if (!base) return { contests: [], debugHtml: "", hadSelect: false };

  const found = await page.evaluate(({ seedId, includePar }) => {
    // Nomes genéricos (texto de link de leaderboard) que NÃO são escalões.
    const GENERIC = /^(placar|leaderboard|scorecard|resultados?|results?|scores?|classifica)/i;
    const looksLikeDivision = (s) =>
      /\b(boys?|girls?|wagr|ltq|combined|under|u-?\d|par\s*\d|\d+\s*[-–]\s*\d+)\b/i.test(s || "");

    // Extrair um id de contest de uma string (value/href/onclick).
    const idFrom = (s) => {
      if (s == null) return null;
      const str = String(s).trim();
      const m = str.match(/contest\/(\d+)/);
      if (m) return m[1];
      if (/^\d+$/.test(str)) return str; // <option value="13">
      return null;
    };

    const candidates = []; // { id, name }
    const push = (id, name) => {
      if (!id || !/^\d+$/.test(String(id))) return;
      candidates.push({ id: String(id), name: (name || "").replace(/\s+/g, " ").trim() });
    };

    let hadSelect = false;
    let hadMenu = false;

    // ── A0) Dropdown SPA do BlueGolf (caso real do EO WAGR) ──
    // O seletor de escalões NÃO é um <select> nem links <a href="/contest/N/">.
    // É um dropdown Bootstrap cujos items são
    //   <a class="dropdown-item" role="menuitem" data-key="{contestId}" href="javascript:void(0)">Nome</a>
    // O id do contest vive no atributo data-key. Os items estão sempre no DOM
    // (mesmo com o menu fechado), por isso basta lê-los — não é preciso clicar.
    const menuItems = document.querySelectorAll(
      'a[role="menuitem"][data-key], a.dropdown-item[data-key], [role="menu"] [data-key]'
    );
    for (const el of menuItems) {
      const key = el.getAttribute("data-key");
      if (!key || !/^\d+$/.test(key)) continue;
      // remover o "✓" do escalão activo e normalizar
      const name = (el.textContent || "").replace(/[✓✔]/g, "").trim();
      // só items que parecem escalões (exclui "Comparar"/"Compare" e afins)
      if (!looksLikeDivision(name)) continue;
      // saltar os sub-contests "Par 3/4/5" (são projeções dos 18 buracos —
      // derivam-se dos cartões completos via scripts/eowagr-par-splits.js)
      if (!includePar && /^par\s*[3-5]\b/i.test(name)) continue;
      hadMenu = true;
      push(key, name);
    }

    // ── A) <select> de flights ──
    // Procurar primeiro o <select> que CONTÉM o id semente (é o seletor de
    // escalões, e isso valida que value→id está correcto). Senão, cair para
    // o primeiro <select> cujas options parecem divisões.
    const selects = Array.from(document.querySelectorAll("select"));
    let flightSelect = null;
    if (seedId) {
      for (const sel of selects) {
        const ids = Array.from(sel.querySelectorAll("option")).map(
          (o) =>
            idFrom(o.getAttribute("value")) ||
            idFrom(o.getAttribute("data-href")) ||
            idFrom(o.getAttribute("data-url")) ||
            idFrom(o.getAttribute("data-contest"))
        );
        if (ids.includes(seedId)) { flightSelect = sel; break; }
      }
    }
    if (!flightSelect) {
      for (const sel of selects) {
        if (
          sel.querySelectorAll("option").length > 1 &&
          looksLikeDivision(sel.textContent)
        ) { flightSelect = sel; break; }
      }
    }
    if (flightSelect) {
      hadSelect = true;
      for (const o of flightSelect.querySelectorAll("option")) {
        const id =
          idFrom(o.getAttribute("value")) ||
          idFrom(o.getAttribute("data-href")) ||
          idFrom(o.getAttribute("data-url")) ||
          idFrom(o.getAttribute("data-contest"));
        push(id, o.textContent);
      }
    }

    // ── B) Links <a href*="/contest/"> (dropdowns Bootstrap, tabs) ──
    for (const a of document.querySelectorAll('a[href*="/contest/"]')) {
      const href = a.getAttribute("href") || "";
      if (/contestant|player|scorecard/i.test(href)) continue; // ignora links de jogador
      const m = href.match(/contest\/(\d+)/);
      if (m) push(m[1], a.textContent);
    }

    // ── C) Fallback: regex ao HTML inteiro — SÓ se A0/A/B não deram nada.
    // (Senão re-adicionaria ids sem nome, incluindo os Par 3/4/5 já filtrados.)
    if (candidates.length === 0) {
      const html = document.documentElement.outerHTML;
      let mm;
      const re = /contest\/(\d+)/g;
      while ((mm = re.exec(html))) push(mm[1], "");
    }

    // ── Dedup, preferindo nomes de divisão sobre genéricos/vazios ──
    const out = new Map();
    for (const c of candidates) {
      const isGood = c.name && !GENERIC.test(c.name);
      const prev = out.get(c.id);
      if (!prev) {
        out.set(c.id, { id: c.id, name: isGood ? c.name : "" });
      } else if (isGood && (!prev.name || GENERIC.test(prev.name))) {
        prev.name = c.name;
      }
    }
    let list = Array.from(out.values());
    // Rede de segurança: remover Par 3/4/5 que tenham entrado por links/regex.
    if (!includePar) list = list.filter((c) => !/^par\s*[3-5]\b/i.test(c.name || ""));
    return { contests: list, hadSelect, hadMenu };
  }, { seedId, includePar });

  const debugHtml = await page.content();
  const contests = found.contests.map((c) => ({
    ...c,
    url: `${base}/contest/${c.id}/leaderboard.htm`,
  }));
  return {
    contests,
    debugHtml,
    hadSelect: found.hadSelect,
    hadMenu: found.hadMenu,
  };
}

/* ─── Main ─── */
const EVENT_SEED = CONTESTS[0].url;

(async () => {
  console.log(`🏌️  BlueGolf Multi-Contest Scraper — EO WAGR (auto-discovery)\n`);

  // Browser: FIREFOX por defeito — fingerprint diferente, pode contornar o
  // bloqueio do BlueGolf que apanha o Chromium. Para forçar Chrome:
  //   BROWSER=chrome node scripts/scrape-eowagr25-all.js
  const useChrome = /^(chrome|chromium)$/i.test(process.env.BROWSER || "");
  let browser, context;
  if (useChrome) {
    const launchArgs = { headless: false, args: ["--disable-blink-features=AutomationControlled"] };
    browser = await chromium.launch({ ...launchArgs, channel: "chrome" }).catch(() => chromium.launch(launchArgs));
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "pt-PT",
      viewport: { width: 1366, height: 900 },
    });
  } else {
    browser = await firefox.launch({ headless: false }).catch((e) => {
      console.error("\n❌ Firefox do Playwright não instalado. Corre primeiro:\n   npx playwright install firefox\n");
      throw e;
    });
    // Firefox: UA nativo (um UA de Chrome num motor Firefox seria suspeito).
    context = await browser.newContext({ locale: "pt-PT", viewport: { width: 1366, height: 900 } });
  }
  // Esconder navigator.webdriver (sinal típico de automação).
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  // 1) Descobrir todos os escalões do evento (a partir do contest semente).
  // --include-par: descarregar também os sub-contests Par 3/4/5 (por defeito
  // são saltados — são projeções dos cartões de 18 buracos).
  const includePar = process.argv.includes("--include-par");
  let contests = [];
  try {
    const disc = await discoverContests(page, EVENT_SEED, includePar);
    contests = disc.contests;
    const via = disc.hadMenu
      ? "via dropdown SPA (data-key)"
      : disc.hadSelect
        ? "via <select> de flights"
        : "só links/regex";
    console.log(`   🔎 ${contests.length} escalões descobertos no evento (${via})\n`);
    // Se a descoberta veio fraca, guardar o HTML para diagnóstico.
    if (contests.length <= 1 && disc.debugHtml) {
      fs.writeFileSync("debug_discovery.html", disc.debugHtml);
      console.warn(
        "   ⚠️  Descoberta fraca — HTML da página guardado em debug_discovery.html.\n" +
          "      Envia-me esse ficheiro (ou o markup do dropdown) que ajusto o seletor.\n"
      );
    }
  } catch (e) {
    console.warn(`   ⚠️  Discovery falhou (${e.message}) — uso a lista fixa\n`);
  }

  // Merge com os escalões conhecidos (13/77/121) — rede de segurança: garante
  // que mesmo que a descoberta falhe parcialmente, os 3 originais entram.
  {
    const byId = new Map(contests.map((c) => [c.id, c]));
    for (const c of CONTESTS) {
      const id = (c.url.match(/contest\/(\d+)/) || [])[1];
      if (id && !byId.has(id)) {
        const entry = { id, name: "", url: c.url };
        byId.set(id, entry);
        contests.push(entry);
      }
    }
    contests = Array.from(byId.values());
  }
  // Ordenar por id numérico (estável e previsível nos logs/ficheiros).
  contests.sort((a, b) => Number(a.id) - Number(b.id));
  console.log(`   📦 ${contests.length} escalões para descarregar: ${contests.map((c) => c.id).join(", ")}\n`);

  // 2) Scrape de cada escalão → eowagr25_contest<id>.json
  //    --skip-existing: salta os ficheiros já descarregados (re-run rápido).
  const SKIP_EXISTING = process.argv.includes("--skip-existing");
  for (const c of contests) {
    const outFile = `eowagr25_contest${c.id}.json`;
    if (SKIP_EXISTING && fs.existsSync(outFile)) {
      console.log(`\n⏭️  ${outFile} já existe — saltado (--skip-existing).`);
      continue;
    }
    try {
      await scrapeContest(page, c.url, outFile, c.name);
    } catch (err) {
      console.error(`\n❌ Erro no contest ${c.url}:\n   ${err.message}`);
    }
  }

  await browser.close();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`🏁 Concluído — ${contests.length} escalões:`);
  for (const c of contests) {
    const outFile = `eowagr25_contest${c.id}.json`;
    console.log(`   ${fs.existsSync(outFile) ? "✅" : "❌"} ${outFile}${c.name ? `  (${c.name})` : ""}`);
  }
})();
