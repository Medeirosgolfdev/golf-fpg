/**
 * scripts/scrape-ffgolf.js
 *
 * Scraper Playwright dos torneios juvenis FFGolf (GolfGenius), com a lógica
 * validada via browser MCP em 2026-05-05.
 *
 * Para cada torneio do catálogo (`public/data/ffgolf-catalog.json`):
 *   1. Abre Classement page (`/pages/{gg_page}`) → extrai leagueId, statsPageId,
 *      dropdown de eventos (Qualif T1, T2, Finale, etc.).
 *   2. Filtra apenas eventos stroke play (regex: qualif|round).
 *   3. Abre Stats page → submete form `course_statistics_{eventId}_{courseId}`
 *      → parseia Hole|Meters|Par|Average|Rank → captura par[18], meters[18],
 *      si[18] (rank de dificuldade), parTotal, metersTotal.
 *   4. Volta à Classement → muda dropdown para Qualif T1 → extrai leaderboard
 *      com bandeiras (`span.flag-icon flag-icon-{cc}`), nome, clube, hcp,
 *      pos, toPar, R1, R2, total.
 *   5. Para cada jogador, fetch HTML de `tournaments2/details/{playerId}` →
 *      parseia scorecard hole-by-hole (18 buracos).
 *   6. Valida: R1 do scorecard == R1 do leaderboard (e R2 igual). Se houver
 *      mismatch, logga warning.
 *   7. Escreve `public/data/ffgolf/{year}_{slug}.json` no formato esperado
 *      pela FFGPage.tsx.
 *
 * Match play (Finale, 1/2 Finale, etc.) é EXCLUÍDO — não tem scorecards
 * stroke play úteis.
 *
 * USO:
 *   node scripts/scrape-ffgolf.js                       # todos os do catálogo
 *   node scripts/scrape-ffgolf.js --year 2025           # só 2025
 *   node scripts/scrape-ffgolf.js --slug benjamins-2025 # só esse slug
 *   node scripts/scrape-ffgolf.js --gg-page 11842510449344033466 --slug ad-hoc --year 2025
 *   node scripts/scrape-ffgolf.js --headless            # sem browser visível
 *
 * REQUISITOS: npm install playwright
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const GG = "https://www.golfgenius.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isStrokePlay = (name) => /qualif|round\s+\d|stroke/i.test(name || "");

/* ─────────────────────────────────────────────────────────────────
   Poll-wait até o dropdown do iframe ter opções (max maxMs)
   ───────────────────────────────────────────────────────────────── */
async function waitForIframeReady(page, maxMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const ready = await page.evaluate(() => {
      const ifr = document.querySelectorAll("iframe")[0];
      const doc = ifr?.contentDocument;
      const sel = doc?.querySelector("select");
      // Algumas páginas (sem dropdown) só têm leaderboard directo —
      // aceitar se já há linhas de tournaments2/details
      const hasPlayers = doc?.querySelector('a[href*="tournaments2/details"]');
      return {
        hasIframe: !!ifr,
        hasDoc: !!doc,
        selectOptions: sel ? sel.options.length : -1,
        hasPlayerLinks: !!hasPlayers,
      };
    });
    if (ready.selectOptions > 0 || ready.hasPlayerLinks) return ready;
    if (!ready.hasIframe) await sleep(1000);
    else await sleep(700);
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────
   Abre Classement page e extrai metadados (league, stats, dates)
   ───────────────────────────────────────────────────────────────── */
async function openClassement(page, ggPage) {
  await page.goto(`${GG}/pages/${ggPage}`, { waitUntil: "domcontentloaded" });
  // Poll até ao iframe estar pronto (dropdown carregado OU jogadores visíveis)
  const ready = await waitForIframeReady(page, 30000);
  if (!ready) console.log(`   ⚠ iframe não ficou pronto em 30s`);
  return page.evaluate(() => {
    const ifr = document.querySelectorAll("iframe")[0];
    const ifrSrc = ifr?.src || "";
    const leagueId = ifrSrc.match(/leagues\/(\d+)/)?.[1] || null;
    const sel = ifr?.contentDocument?.querySelector("select");
    const dates = sel
      ? [...sel.options].map((o) => ({ id: o.value, name: o.textContent.trim() }))
      : [];
    const statsLink = [...document.querySelectorAll("a")].find(
      (a) => a.textContent.trim() === "Statistiques du parcours de golf"
    );
    const statsPageId = statsLink?.getAttribute("href")?.match(/pages\/(\d+)/)?.[1] || null;
    return { leagueId, statsPageId, dates };
  });
}

/* ─────────────────────────────────────────────────────────────────
   Abre Stats page e captura par+meters+SI para um evento (course_statistics)
   ───────────────────────────────────────────────────────────────── */
async function fetchCourseStats(page, statsPageId, eventId) {
  await page.goto(`${GG}/pages/${statsPageId}`, { waitUntil: "domcontentloaded" });
  // Poll até existirem forms course_statistics no iframe
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const ready = await page.evaluate(() => {
      const ifr = document.querySelectorAll("iframe")[0];
      const doc = ifr?.contentDocument;
      return doc?.querySelectorAll('form[id^="course_statistics_"]').length || 0;
    });
    if (ready > 0) break;
    await sleep(800);
  }
  return page.evaluate(async (eId) => {
    const ifr = document.querySelectorAll("iframe")[0];
    const doc = ifr?.contentDocument;
    if (!doc) return null;
    // 1ª tentativa: form que contém o eventId. 2ª tentativa: qualquer form course_statistics
    const allForms = [...doc.querySelectorAll('form[id^="course_statistics_"]')];
    const someForm = allForms.find((f) => f.id.includes(eId)) || allForms[0];
    if (!someForm) return null;
    const idParts = someForm.id.split("_");
    const courseId = idParts[idParts.length - 1];
    const fd = new FormData(someForm);
    const res = await fetch(someForm.action, {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    const html = await res.text();
    const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    const rows = [];
    for (const tr of trs) {
      const cells = [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)]
        .map((m) =>
          m[1]
            .replace(/<[^>]+>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter((x) => x);
      if (cells.length >= 11 && /^\d+$/.test(cells[0]) && /^\d+$/.test(cells[2])) {
        rows.push({
          hole: +cells[0],
          meters: +cells[1],
          par: +cells[2],
          rank: +cells[4],
        });
      }
    }
    if (!rows.length) return null;
    const par = rows.map((r) => r.par);
    const meters = rows.map((r) => r.meters);
    const si = rows.map((r) => r.rank);
    return {
      courseId,
      par,
      meters,
      si,
      parTotal: par.reduce((s, v) => s + v, 0),
      metersTotal: meters.reduce((s, v) => s + v, 0),
    };
  }, eventId);
}

/* ─────────────────────────────────────────────────────────────────
   Detecta nome+tee do campo via meta-data da Classement page (header)
   ───────────────────────────────────────────────────────────────── */
async function detectCourseInfo(page) {
  return page.evaluate(() => {
    const ifr = document.querySelectorAll("iframe")[0];
    const doc = ifr?.contentDocument;
    if (!doc) return { name: "", tee: "" };
    // Procurar texto com nome do campo (1ª <a class="course_link"> ou similar)
    const courseLink = doc.querySelector("a[class*='course']");
    let name = courseLink?.textContent?.trim() || "";
    let tee = "";
    const m = name.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (m) {
      name = m[1].trim();
      tee = m[2].trim();
    }
    name = name.replace(/\s*-\s*Archived on \d{2}-\d{2}-\d{4}/, "").trim();
    return { name, tee };
  });
}

/* ─────────────────────────────────────────────────────────────────
   Detectar categorias/divisões dentro do widget (Boys/Girls/etc.)
   Algumas torneios têm múltiplas categorias no MESMO gg_page —
   precisamos de iterar todas (não só a default).
   ───────────────────────────────────────────────────────────────── */
async function detectDivisions(page) {
  return page.evaluate(() => {
    const ifr = document.querySelectorAll("iframe")[0];
    const doc = ifr?.contentDocument;
    if (!doc) return [];
    const opts = [];
    const seen = new Set();
    // 1) Tabs/links com nomes de divisão
    const tabSelectors = [
      ".tournament_name a",
      "a.tournament_name",
      ".tournament_selector a",
      ".event-tab",
      "[data-tournament-id]",
      "[data-event-id]",
    ];
    for (const sel of tabSelectors) {
      doc.querySelectorAll(sel).forEach((el) => {
        const t = el.textContent.replace(/\s+/g, " ").trim();
        const did = el.dataset?.tournamentId || el.dataset?.eventId;
        if (!t || t.length > 80 || seen.has(t)) return;
        // Filtrar Round/Day labels
        if (/^Round\s+\d|^\d{1,2}\s+(jan|fev|mar|apr|mai|jun|jul|aug|sep|oct|nov|dec)/i.test(t)) return;
        seen.add(t);
        opts.push({ type: "tab", label: t, divId: did, selector: sel });
      });
    }
    // 2) Selects que não sejam o "round" principal (já tratado em fetchLeaderboard)
    doc.querySelectorAll("select").forEach((s) => {
      if (s.name === "round") return;
      [...s.options].forEach((o) => {
        const t = o.textContent.trim();
        if (!t || seen.has(t)) return;
        if (/^Round\s+\d/i.test(t)) return;
        seen.add(t);
        opts.push({ type: "select", label: t, value: o.value, selectName: s.name || s.id });
      });
    });
    // 3) Botões/links com palavras-chave de categoria
    if (opts.length === 0) {
      doc.querySelectorAll("a, button, div[onclick]").forEach((el) => {
        const t = el.textContent.replace(/\s+/g, " ").trim();
        if (!t || t.length > 60 || seen.has(t)) return;
        if (
          /\b(boys|girls|garçons?|filles?|men|women|messieurs|dames|cadets?|cadettes?|benjamins?|benjamines?|minimes?|équipe|mixed|mixte)\b/i.test(t)
        ) {
          seen.add(t);
          opts.push({ type: "clickable", label: t });
        }
      });
    }
    return opts;
  });
}

/* Tenta seleccionar uma divisão (clicar tab ou mudar select) */
async function selectDivision(page, division) {
  return page.evaluate((div) => {
    const ifr = document.querySelectorAll("iframe")[0];
    const doc = ifr?.contentDocument;
    if (!doc) return false;
    if (div.type === "select") {
      const sel = [...doc.querySelectorAll("select")].find((s) => s.name === div.selectName || s.id === div.selectName);
      if (!sel) return false;
      sel.value = div.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    // type === tab/clickable: encontrar pelo label
    const candidates = [...doc.querySelectorAll("a, button, [role='tab'], div[onclick]")];
    const target = candidates.find((el) => el.textContent.replace(/\s+/g, " ").trim() === div.label);
    if (target) {
      target.click();
      return true;
    }
    return false;
  }, division);
}

/* ─────────────────────────────────────────────────────────────────
   Switch dropdown e extrai leaderboard
   ───────────────────────────────────────────────────────────────── */
async function fetchLeaderboard(page, ggPage, eventId) {
  await page.goto(`${GG}/pages/${ggPage}`, { waitUntil: "domcontentloaded" });
  await waitForIframeReady(page, 30000);
  await page.evaluate((eId) => {
    const ifr = document.querySelectorAll("iframe")[0];
    const doc = ifr?.contentDocument;
    const sel = doc?.querySelector("select");
    if (sel && sel.value !== eId) {
      sel.value = eId;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, eventId);
  // Poll até a leaderboard ter recarregado para o evento certo
  const start = Date.now();
  while (Date.now() - start < 20000) {
    const ready = await page.evaluate(() => {
      const ifr = document.querySelectorAll("iframe")[0];
      const doc = ifr?.contentDocument;
      return doc?.querySelectorAll('a[href*="tournaments2/details"]').length || 0;
    });
    if (ready > 0) break;
    await sleep(800);
  }
  return page.evaluate(() => {
    const ifr = document.querySelectorAll("iframe")[0];
    const doc = ifr?.contentDocument;
    if (!doc) return { players: [], headers: [] };

    // Detectar cabeçalhos de coluna para saber quantas rondas e o que cada coluna é
    const headerCells = [];
    const headerRow = doc.querySelector("thead tr") || doc.querySelector("table tr");
    if (headerRow) {
      [...headerRow.querySelectorAll("th, td")].forEach((c) =>
        headerCells.push(c.textContent.replace(/\s+/g, " ").trim())
      );
    }
    // Detectar quantas colunas são rondas (R1/R2/T1/T2/Round 1/etc)
    const isRoundHeader = (h) => /^(R|T|Round|Tour)\s*\d|^J\d/i.test(h.trim());
    const isTotalHeader = (h) => /^Total/i.test(h.trim());

    const players = [];
    let rowIdx = 0;
    for (const tr of doc.querySelectorAll("tr")) {
      const link = tr.querySelector('a[href*="tournaments2/details"]');
      if (!link) continue;
      const idM = (link.getAttribute("href") || "").match(/details\/(\d+)/);
      if (!idM) continue;
      rowIdx++;

      const flagSpan = tr.querySelector("span.flag-icon");
      const cc = flagSpan?.className.match(/flag-icon-([a-z\-]+)/i)?.[1]?.toUpperCase();
      const nameClone = link.cloneNode(true);
      nameClone
        .querySelectorAll("span.flag-icon, i, img, .flag, .flags")
        .forEach((el) => el.remove());
      const name = nameClone.textContent.replace(/\s+/g, " ").trim();
      const cells = [...tr.querySelectorAll("td")].map((td) =>
        td.textContent.replace(/\s+/g, " ").trim()
      );
      const playerCell = link.closest("td");
      const cellText = playerCell?.textContent.replace(/\s+/g, " ").trim() || "";
      const afterName = cellText.replace(name, "").trim().replace(/^,\s*/, "");
      const hcpMatch = afterName.match(/,\s*([+-]?\d+\.?\d*)\s*$/);
      let club = "",
        hcp = null;
      if (hcpMatch) {
        hcp = parseFloat(hcpMatch[1]);
        club = afterName.replace(hcpMatch[0], "").trim();
      } else {
        club = afterName.trim();
      }
      const nameCellIdx = cells.findIndex((c) => c.includes(name));
      const after = cells.slice(nameCellIdx + 1);

      // Parse: [toPar/E, R1, R2, ..., RN, Total]
      const toPar = after[0] === "E" ? 0 : parseInt(after[0], 10);
      // Mapear todas as células numéricas após toPar
      const numerics = after.slice(1).map((c) => {
        const n = parseInt(c, 10);
        return isNaN(n) ? null : n;
      });
      // Filtrar só >= 30 (excluir contagens de buracos vazios)
      const validNums = numerics.filter((n) => n !== null && n >= 30);

      // Heurística para distinguir rondas de total:
      // - Se há cabeçalhos identificáveis, usar a posição do cabeçalho "Total"
      // - Caso contrário: o último número é o total se for ≥ qualquer ronda
      let roundScores = [];
      let total = null;
      if (validNums.length === 1) {
        // 1 ronda: pode ser total OU R1 (1 ronda só)
        total = validNums[0];
        roundScores = [validNums[0]];
      } else {
        // Última coluna = Total. Resto = rondas.
        total = validNums[validNums.length - 1];
        roundScores = validNums.slice(0, -1);
      }

      // Posição: do cells[0] (número) OU rowIdx como fallback
      let pos = parseInt(cells[0], 10);
      if (isNaN(pos)) {
        // Pode estar em formato "T5" (tied) ou "1"
        const m = cells[0]?.match(/^T?(\d+)/);
        pos = m ? parseInt(m[1], 10) : rowIdx;
      }

      players.push({
        id: idM[1],
        pos,
        name,
        country: cc || "",
        club,
        hcp,
        toPar: isNaN(toPar) ? null : toPar,
        roundScores,
        total,
      });
    }
    return { players, headers: headerCells };
  });
}

/* ─────────────────────────────────────────────────────────────────
   Fetch scorecards para uma lista de jogadores (em paralelo, batches)
   ───────────────────────────────────────────────────────────────── */
async function fetchScorecards(page, players, batchSize = 10) {
  const all = {};
  function chunks(arr, n) {
    const o = [];
    for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n));
    return o;
  }
  for (const batch of chunks(players, batchSize)) {
    const results = await page.evaluate(async (ids) => {
      function parseSc(html) {
        const tables = [
          ...html.matchAll(
            /<table[^>]*class=["'][^"']*detail_table[^"']*["'][\s\S]*?<\/table>/gi
          ),
        ];
        const rounds = [];
        for (const t of tables) {
          const trs = [...t[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
          for (const tr of trs) {
            if (/header_row/.test(tr[0])) continue;
            const cells = [
              ...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g),
            ].map((m) =>
              m[1]
                .replace(/<[^>]+>/g, "")
                .replace(/&nbsp;/g, " ")
                .replace(/\s+/g, " ")
                .trim()
            );
            if (cells.length >= 22) {
              const scores = [];
              for (let i = 1; i <= 9; i++) {
                const n = parseInt(cells[i], 10);
                if (!isNaN(n) && n >= 1 && n <= 15) scores.push(n);
              }
              for (let i = 11; i <= 19; i++) {
                const n = parseInt(cells[i], 10);
                if (!isNaN(n) && n >= 1 && n <= 15) scores.push(n);
              }
              if (scores.length === 18) {
                const f9 =
                  parseInt(cells[10], 10) ||
                  scores.slice(0, 9).reduce((a, b) => a + b, 0);
                const b9 =
                  parseInt(cells[20], 10) ||
                  scores.slice(9).reduce((a, b) => a + b, 0);
                const gross =
                  parseInt(cells[21], 10) || f9 + b9;
                rounds.push({ scores, f9, b9, gross });
              }
            } else if (cells.length >= 11 && cells.length < 22) {
              const scores = [];
              for (let i = 1; i <= 9; i++) {
                const n = parseInt(cells[i], 10);
                if (!isNaN(n) && n >= 1 && n <= 15) scores.push(n);
              }
              if (scores.length === 9) {
                const gross =
                  parseInt(cells[10], 10) ||
                  scores.reduce((a, b) => a + b, 0);
                rounds.push({ scores, gross, nineHole: true });
              }
            }
          }
        }
        return rounds;
      }
      return Promise.all(
        ids.map(async (id) => {
          try {
            const r = await fetch(
              `https://www.golfgenius.com/tournaments2/details/${id}?round_index=&player_stats_for_portal=true`,
              { credentials: "include" }
            );
            const html = await r.text();
            return { id, rounds: parseSc(html) };
          } catch (e) {
            return { id, err: e.message };
          }
        })
      );
    }, batch.map((p) => p.id));
    for (const r of results) all[r.id] = r;
  }
  return all;
}

/* ─────────────────────────────────────────────────────────────────
   Scrape completo de 1 torneio
   ───────────────────────────────────────────────────────────────── */
async function scrapeOne(browser, t) {
  console.log(`\n🏌️  ${t.title || t.slug} (${t.year})`);
  console.log(`   gg_page=${t.gg_page}`);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    // 1. Classement page → metadados
    const meta = await openClassement(page, t.gg_page);
    if (!meta.leagueId) {
      console.log(`   ⚠ sem leagueId — saltar`);
      return null;
    }
    console.log(`   league=${meta.leagueId} statsPage=${meta.statsPageId} events=${meta.dates.length}`);
    if (!meta.dates.length) {
      console.log(`   ⚠ dropdown sem eventos — saltar`);
      return null;
    }

    // strokeEvents em ordem cronológica (T1, T2, etc.)
    // O dropdown vem em ordem inversa (Finale primeiro). Reverter.
    const allEvents = [...meta.dates].reverse();
    console.log(`   eventos: ${allEvents.map((e) => e.name).join(" | ")}`);

    // 2. Detectar info do campo (nome, tee)
    const courseInfo = await detectCourseInfo(page);

    // 3. Course stats (par/meters/SI) — usa o primeiro evento stroke
    let courseStats = null;
    const firstStroke = allEvents.find((e) => isStrokePlay(e.name));
    if (meta.statsPageId && firstStroke) {
      courseStats = await fetchCourseStats(page, meta.statsPageId, firstStroke.id);
      if (courseStats) {
        console.log(`   par=${courseStats.parTotal} meters=${courseStats.metersTotal}`);
      } else {
        console.log(`   ⚠ course_statistics vazio`);
      }
    }

    // 4. Para CADA evento do dropdown, capturar leaderboard + scorecards.
    //    DENTRO de cada evento, também detectar e iterar divisões/categorias
    //    (ex: Boys/Girls num torneio que partilha gg_page).
    const events = [];
    const divisionsSet = new Set();
    let allPlayerIds = new Set();
    let teamDetected = false;

    for (const ev of allEvents) {
      const fmt = isStrokePlay(ev.name) ? "stroke" : "match";
      console.log(`   ▶ ${ev.name} [${fmt}]`);
      try {
        const lb = await fetchLeaderboard(page, t.gg_page, ev.id);
        // Após carregar o evento, detectar tabs/selects de categoria
        const divs = await detectDivisions(page);
        if (divs.length > 1) {
          if (events.length === 0) console.log(`     divisões detectadas: ${divs.map((d) => d.label).join(" | ")}`);
          divs.forEach((d) => divisionsSet.add(d.label));
        }
        console.log(`     ${lb.players.length} jogadores (default division)`);
        if (!lb.players.length) {
          events.push({ id: ev.id, name: ev.name, format: fmt, players: [] });
          continue;
        }

        // Fetch scorecards (uma fetch por jogador devolve TODAS as rondas do torneio)
        // Optimização: só fazer fetch dos novos IDs, reutilizar se já fizemos
        const newPlayers = lb.players.filter((p) => !allPlayerIds.has(p.id));
        const newScs = newPlayers.length ? await fetchScorecards(page, newPlayers, 10) : {};
        for (const p of newPlayers) allPlayerIds.add(p.id);

        // Detectar team event no 1º evento
        if (events.length === 0) {
          const top = newScs[lb.players[0]?.id]?.rounds?.[0]?.scores || [];
          if (top.some((s) => s > 12)) {
            teamDetected = true;
            console.log(`   ⚠ TEAM EVENT — saltar`);
            break;
          }
        }

        const eventPlayers = lb.players.map((p) => ({
          id: p.id,
          pos: p.pos,
          name: p.name,
          country: p.country,
          club: p.club,
          hcp: p.hcp,
          total: p.total,
          toPar: p.toPar,
          roundScores: p.roundScores,
        }));

        // Capturar a divisão default
        const eventEntry = {
          id: ev.id,
          name: ev.name,
          format: fmt,
          headers: lb.headers,
          players: eventPlayers,
          division: divs[0]?.label || "default",
          scorecardsByPlayerId: Object.fromEntries(
            newPlayers
              .filter((p) => newScs[p.id]?.rounds?.length)
              .map((p) => [p.id, newScs[p.id].rounds])
          ),
        };
        events.push(eventEntry);

        // Se houver mais divisões além da default, iterar todas
        if (divs.length > 1) {
          for (const div of divs.slice(1)) {
            console.log(`     → switch divisão "${div.label}"`);
            const switched = await selectDivision(page, div);
            if (!switched) { console.log(`     ⚠ falha switch para ${div.label}`); continue; }
            await sleep(3500);
            // Re-extrair leaderboard
            const lbDiv = await page.evaluate(() => {
              const ifr = document.querySelectorAll("iframe")[0];
              const doc = ifr?.contentDocument;
              if (!doc) return { players: [] };
              const players = [];
              let rowIdx = 0;
              for (const tr of doc.querySelectorAll("tr")) {
                const link = tr.querySelector('a[href*="tournaments2/details"]');
                if (!link) continue;
                const idM = (link.getAttribute("href") || "").match(/details\/(\d+)/);
                if (!idM) continue;
                rowIdx++;
                const flagSpan = tr.querySelector("span.flag-icon");
                const cc = flagSpan?.className.match(/flag-icon-([a-z\-]+)/i)?.[1]?.toUpperCase();
                const nameClone = link.cloneNode(true);
                nameClone.querySelectorAll("span.flag-icon, i, img, .flag, .flags").forEach((el) => el.remove());
                const name = nameClone.textContent.replace(/\s+/g, " ").trim();
                const cells = [...tr.querySelectorAll("td")].map((td) => td.textContent.replace(/\s+/g, " ").trim());
                const playerCell = link.closest("td");
                const cellText = playerCell?.textContent.replace(/\s+/g, " ").trim() || "";
                const afterName = cellText.replace(name, "").trim().replace(/^,\s*/, "");
                const hcpMatch = afterName.match(/,\s*([+-]?\d+\.?\d*)\s*$/);
                let club = "", hcp = null;
                if (hcpMatch) { hcp = parseFloat(hcpMatch[1]); club = afterName.replace(hcpMatch[0], "").trim(); }
                else club = afterName.trim();
                const nameCellIdx = cells.findIndex((c) => c.includes(name));
                const after = cells.slice(nameCellIdx + 1);
                const toPar = after[0] === "E" ? 0 : parseInt(after[0], 10);
                const numerics = after.slice(1).map((c) => { const n = parseInt(c, 10); return isNaN(n) ? null : n; });
                const validNums = numerics.filter((n) => n !== null && n >= 30);
                let total = null, roundScores = [];
                if (validNums.length === 1) { total = validNums[0]; roundScores = [validNums[0]]; }
                else { total = validNums[validNums.length - 1]; roundScores = validNums.slice(0, -1); }
                let pos = parseInt(cells[0], 10);
                if (isNaN(pos)) { const m = cells[0]?.match(/^T?(\d+)/); pos = m ? parseInt(m[1], 10) : rowIdx; }
                players.push({ id: idM[1], pos, name, country: cc || "", club, hcp, toPar: isNaN(toPar) ? null : toPar, roundScores, total });
              }
              return { players };
            });
            console.log(`     ${div.label}: ${lbDiv.players.length} jogadores`);
            const newDivPlayers = lbDiv.players.filter((p) => !allPlayerIds.has(p.id));
            const newDivScs = newDivPlayers.length ? await fetchScorecards(page, newDivPlayers, 10) : {};
            for (const p of newDivPlayers) allPlayerIds.add(p.id);
            events.push({
              id: ev.id + "_" + div.label.replace(/\s+/g, "_"),
              name: ev.name + " — " + div.label,
              format: fmt,
              players: lbDiv.players,
              division: div.label,
              scorecardsByPlayerId: Object.fromEntries(
                newDivPlayers.filter((p) => newDivScs[p.id]?.rounds?.length).map((p) => [p.id, newDivScs[p.id].rounds])
              ),
            });
          }
        }
      } catch (e) {
        console.log(`     ⚠ erro: ${e.message.slice(0, 60)}`);
        events.push({ id: ev.id, name: ev.name, format: fmt, error: e.message.slice(0, 100) });
      }
    }

    if (teamDetected) return null;

    // 5. Consolidar scorecards de TODOS os eventos para um único map por playerId
    const allScorecards = {};
    for (const ev of events) {
      for (const [pid, rounds] of Object.entries(ev.scorecardsByPlayerId || {})) {
        if (!allScorecards[pid]) allScorecards[pid] = rounds;
      }
    }

    // 6. Para a vista "consolidada" (compatibilidade com FFGPage actual): usar o LEADERBOARD
    //    do último evento stroke (tem totais cumulativos) e juntar todos os scorecards do torneio.
    const strokeEvents = events.filter((e) => e.format === "stroke" && e.players?.length);
    const lastStroke = strokeEvents[strokeEvents.length - 1] || null;
    const consolidatedPlayers = (lastStroke?.players || []).map((p) => {
      const scRounds = allScorecards[p.id] || [];
      const nRounds = strokeEvents.length;
      const rounds = [...scRounds].reverse().slice(0, nRounds).map((r, i) => ({
        round: i + 1,
        gross: r.gross,
        scores: r.scores,
        f9: r.f9,
        b9: r.b9,
      }));
      return {
        id: p.id,
        pos: p.pos,
        name: p.name,
        country: p.country,
        club: p.club,
        hcp: p.hcp,
        total: p.total,
        toPar: p.toPar,
        roundScores: p.roundScores,
        rounds,
      };
    });

    return {
      tournament: t.title || t.slug,
      slug: t.slug,
      year: t.year,
      section: t.section,
      source: `${GG}/pages/${t.gg_page}`,
      gg_page: t.gg_page,
      gg_league: meta.leagueId,
      stats_page: meta.statsPageId,
      scrapedAt: new Date().toISOString(),
      course: {
        name: courseInfo.name || "",
        tee: courseInfo.tee || "",
        par: courseStats?.par || [],
        meters: courseStats?.meters || [],
        si: courseStats?.si || [],
        parTotal: courseStats?.parTotal || 0,
        metersTotal: courseStats?.metersTotal || 0,
      },
      rounds: strokeEvents.length,
      format: `${events.length} eventos (${strokeEvents.length} stroke + ${events.length - strokeEvents.length} match)`,
      divisions: [...divisionsSet],
      // Vista consolidada (jogadores do ÚLTIMO evento stroke + scorecards de todo o torneio)
      players: consolidatedPlayers,
      // Vista por evento — todos os 7+ eventos do dropdown com leaderboard própria
      // Se há múltiplas divisões, há um event entry POR divisão por evento (ex: "Qualif T1 — Boys", "Qualif T1 — Girls")
      events,
    };
  } finally {
    await ctx.close();
  }
}

/* ─────────────────────────────────────────────────────────────────
   MAIN
   ───────────────────────────────────────────────────────────────── */
function parseArgs(argv) {
  const args = { headless: false, slug: null, year: null, ggPage: null, title: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--headless") args.headless = true;
    else if (argv[i] === "--slug") args.slug = argv[++i];
    else if (argv[i] === "--year") args.year = parseInt(argv[++i], 10);
    else if (argv[i] === "--gg-page") args.ggPage = argv[++i];
    else if (argv[i] === "--title") args.title = argv[++i];
  }
  return args;
}

(async () => {
  const args = parseArgs(process.argv);
  let tournaments = [];

  if (args.ggPage) {
    tournaments = [
      {
        gg_page: args.ggPage,
        slug: args.slug || `adhoc-${args.ggPage}`,
        year: args.year || new Date().getFullYear(),
        title: args.title || args.slug || "Ad-hoc",
        section: "ad-hoc",
      },
    ];
  } else {
    const catPath = path.resolve(__dirname, "../public/data/ffgolf-catalog.json");
    if (!fs.existsSync(catPath)) {
      console.error(`❌ Catálogo não encontrado: ${catPath}`);
      console.error(`   Corre primeiro o discover-ffgolf-catalog.js, ou cria manualmente.`);
      process.exit(1);
    }
    const cat = JSON.parse(fs.readFileSync(catPath, "utf-8"));
    tournaments = (cat.tournaments || []).filter((t) => t.gg_page);
    if (args.slug) tournaments = tournaments.filter((t) => t.slug === args.slug);
    if (args.year) tournaments = tournaments.filter((t) => t.year === args.year);
  }

  if (!tournaments.length) {
    console.error("❌ Nenhum torneio para processar");
    process.exit(1);
  }
  console.log(`🇫🇷 FFGolf scraper — ${tournaments.length} torneios`);

  const browser = await chromium.launch({ headless: args.headless });
  const outDir = path.resolve(__dirname, "../public/data/ffgolf");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  let ok = 0,
    fail = 0;
  for (const t of tournaments) {
    try {
      const result = await scrapeOne(browser, t);
      if (result) {
        const outPath = path.join(outDir, `${t.year}_${t.slug}.json`);
        fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");
        console.log(`   💾 ${outPath} (${result.players.length} jogadores)`);
        ok++;
      } else {
        fail++;
      }
    } catch (e) {
      console.error(`   ❌ ${t.slug}: ${e.message}`);
      fail++;
    }
  }

  await browser.close();
  console.log(`\n✅ ${ok}/${tournaments.length} OK · ${fail} falhas`);
})();
