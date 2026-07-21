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
const { applyCourseOverride } = require("./lib/ffgolf-course-overrides.js");
const { preserveTeesheet } = require("./lib/ffgolf-teesheet-preserve.js");

const GG = "https://www.golfgenius.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "Tour N" é o nome francês de uma ronda de stroke play (Championnats FFG:
// Tour 1/2/3). Sem isto vinham marcados "match" e eram excluídos da consolidação
// → 0 jogadores (ver Championnat U18 WAGR). "T N" cobre a abreviatura.
const isStrokePlay = (name) => /qualif|round\s+\d|tour\s*\d|\bt\s*\d|stroke/i.test(name || "");

/* ─────────────────────────────────────────────────────────────────
   Poll-wait até o dropdown do iframe ter opções (max maxMs)
   ───────────────────────────────────────────────────────────────── */
async function waitForIframeReady(page, maxMs = 60000) {
  const start = Date.now();
  let lastDiag = null;
  while (Date.now() - start < maxMs) {
    const ready = await page.evaluate(() => {
      const iframes = [...document.querySelectorAll("iframe")];
      // Procurar o iframe golfgenius (pode haver iframes de ads que vêm primeiro)
      const ifr = iframes.find((f) => /golfgenius/i.test(f.src || "")) || iframes[0];
      const doc = ifr?.contentDocument;
      const sel = doc?.querySelector("select");
      const hasPlayers = doc?.querySelector('a[href*="tournaments2/details"]');
      const hasV2event = doc?.querySelector('.v2tournament-event');
      return {
        hasIframe: !!ifr,
        ifrSrc: ifr?.src?.slice(0, 80) || "",
        hasDoc: !!doc,
        selectOptions: sel ? sel.options.length : -1,
        hasPlayerLinks: !!hasPlayers,
        hasV2event: !!hasV2event,
      };
    });
    lastDiag = ready;
    // Aceitar se: dropdown carregado OU jogadores visíveis OU v2tournament-event div presente
    if (ready.selectOptions > 0 || ready.hasPlayerLinks || ready.hasV2event) return ready;
    if (!ready.hasIframe) await sleep(1500);
    else await sleep(800);
  }
  // Log diagnostic on failure
  if (lastDiag) console.log(`   ⚠ diagnostic: ${JSON.stringify(lastDiag)}`);
  return null;
}

/* ─────────────────────────────────────────────────────────────────
   Abre Classement page e extrai metadados (league, stats, dates)
   ───────────────────────────────────────────────────────────────── */
async function openClassement(page, ggPage) {
  await page.goto(`${GG}/pages/${ggPage}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {
    // networkidle pode timeout em sites com tracking constante — fallback para domcontentloaded
    return page.goto(`${GG}/pages/${ggPage}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  });
  // Poll até ao iframe estar pronto (dropdown carregado OU jogadores visíveis)
  const ready = await waitForIframeReady(page, 30000);
  if (!ready) console.log(`   ⚠ iframe não ficou pronto em 30s`);
  // Extrair statsPageId via REGEX no HTML cru (server-side rendered, não depende
  // do menu lateral lazy-loaded que falha em headless). Idem para os outros IDs.
  const rawHtml = await page.content();
  // Helper: regex tolerante — substitui espaços por \s+ para apanhar HTML com tabs/newlines
  // entre palavras (template Rails costuma indentar). Funciona com texto acentuado.
  const _re = (text) => {
    const escaped = text
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    const r = new RegExp(`href="\\/pages\\/(\\d+)"[^>]*>\\s*${escaped}\\s*<`, "i");
    const m = rawHtml.match(r);
    return m ? m[1] : null;
  };
  const _statsPageIdRaw    = _re("Statistiques du parcours de golf") || _re("Course Stats");
  const _departsPageIdRaw  = _re("Départs")     || _re("Tee Times");
  const _groupViewPageIdRaw= _re("Group View");
  return page.evaluate(({ statsPageIdRaw, departsPageIdRaw, groupViewPageIdRaw }) => {
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
    const statsPageId = statsLink?.getAttribute("href")?.match(/pages\/(\d+)/)?.[1] || statsPageIdRaw;
    // Pages auxiliares para captura completa
    const departsLink = [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Départs");
    const departsPageId = departsLink?.getAttribute("href")?.match(/pages\/(\d+)/)?.[1] || departsPageIdRaw;
    const groupViewLink = [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Group View");
    const groupViewPageId = groupViewLink?.getAttribute("href")?.match(/pages\/(\d+)/)?.[1] || groupViewPageIdRaw;
    return { leagueId, statsPageId, departsPageId, groupViewPageId, dates };
  }, { statsPageIdRaw: _statsPageIdRaw, departsPageIdRaw: _departsPageIdRaw, groupViewPageIdRaw: _groupViewPageIdRaw });
}

/* ─────────────────────────────────────────────────────────────────
   Fetch pairings/brackets da página Départs para um evento.
   Retorna: [{teeTime, players: [{name, hcp, club}, {name, hcp, club}]}]
   ───────────────────────────────────────────────────────────────── */
async function fetchPairings(page, departsPageId, eventId) {
  await page.goto(`${GG}/pages/${departsPageId}`, { waitUntil: "domcontentloaded" });
  await waitForIframeReady(page, 30000);
  // Switch to event
  await page.evaluate((eId) => {
    const ifr = document.querySelectorAll("iframe")[0];
    const doc = ifr?.contentDocument;
    const sel = doc?.querySelector("select");
    if (sel && sel.value !== eId) {
      sel.value = eId;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, eventId);
  await sleep(5000);
  return page.evaluate(() => {
    const ifr = document.querySelectorAll("iframe")[0];
    const doc = ifr?.contentDocument;
    if (!doc) return [];
    const pairings = [];
    // Cada linha de tee time tem: tee time + cells com player names+hcp+club
    const trs = [...doc.querySelectorAll("tr")];
    let currentTeeTime = "";
    for (const tr of trs) {
      const cells = [...tr.querySelectorAll("td")].map((td) => td.textContent.replace(/\s+/g, " ").trim());
      // Detectar tee time
      const teeTime = cells[0]?.match(/^\d{1,2}:\d{2}/)?.[0];
      if (teeTime) currentTeeTime = teeTime;
      // Cells com nome de jogador (formato "APELIDO Nome (hcp) CLUBE")
      for (const cell of cells) {
        // Pode ter múltiplos jogadores num só cell (match play A vs B)
        const playerMatches = [...cell.matchAll(/([A-ZÀ-Ý][A-ZÀ-Ý' \-]+?\s+[A-ZÀ-Ýa-zà-ý][\w'\-]+)\s*\(([+-]?[\d.]+)\)\s+([A-ZÀ-Ý][A-ZÀ-Ý' \-]+?)(?=\s+[A-ZÀ-Ý]{3,}|$)/g)];
        if (playerMatches.length >= 1) {
          const players = playerMatches.map((m) => ({
            name: m[1].replace(/\s+/g, " ").trim(),
            hcp: parseFloat(m[2]),
            club: m[3].replace(/\s+/g, " ").trim(),
          }));
          if (players.length > 0) pairings.push({ teeTime: currentTeeTime, players });
        }
      }
    }
    // Dedup pairings
    const seen = new Set();
    const unique = pairings.filter((p) => {
      const k = p.teeTime + "|" + p.players.map((pl) => pl.name).join(",");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return unique;
  });
}

/* ─────────────────────────────────────────────────────────────────
   Abre Stats page e captura par+meters+SI para um evento (course_statistics)
   ───────────────────────────────────────────────────────────────── */
/* Fetch UM course_statistics form (par/meters/SI por buraco) */
async function fetchOneCourseStats(page, eventId) {
  return page.evaluate(async (eId) => {
    const ifr = document.querySelectorAll("iframe")[0];
    const doc = ifr?.contentDocument;
    if (!doc) return null;
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

/* Fetch TODOS os course_statistics forms da Stats page —
   captura TODAS as combinações (event × course × tee),
   deduplicado por (par, meters) para identificar tees distintos.
   Devolve um array de courses únicos, cada um com par/meters/SI. */
async function fetchAllCourseStats(page, statsPageIdOrLeagueId, mode = "statsPage") {
  // Usa HTTP fetch directo via page.context().request (NÃO renderiza página).
  // Mais robusto que page.goto + page.evaluate: sem detecção headless, sem timing
  // do iframe, sem cross-origin issues. Funciona para TODOS os torneios testados.
  // Cookies do contexto Playwright são automaticamente enviadas.
  const ctx = page.context();
  const widgetUrl = mode === "league"
    ? `${GG}/leagues/${statsPageIdOrLeagueId}/widgets/course_analytics?shared=false`
    : `${GG}/pages/${statsPageIdOrLeagueId}`; // statsPage tem iframe — vamos seguir o iframe abaixo
  let html;
  // Headers que imitam browser real (alguns servidores GG são picky)
  const browserHeaders = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Referer": `${GG}/pages/${statsPageIdOrLeagueId}`,
  };
  try {
    const resp = await ctx.request.get(widgetUrl, { headers: browserHeaders });
    html = await resp.text();
    const formCount = (html.match(/<form[^>]*id="course_statistics_/g) || []).length;
    console.log(`   [debug] ${mode} fetch ${widgetUrl.slice(GG.length)} → ${html.length} bytes, ${formCount} forms`);
  } catch (e) {
    console.log(`   ⚠ fetch widget falhou: ${e.message}`);
    return [];
  }
  // Em mode "statsPage" o HTML retornado é a parent page com <iframe src="...course_analytics?...">.
  // Extrair o iframe URL e fazer fetch a esse.
  if (mode === "statsPage") {
    const iframeMatch = html.match(/<iframe[^>]*src="([^"]*\/widgets\/course_analytics[^"]*)"/);
    if (!iframeMatch) {
      console.log("   ⚠ statsPage sem iframe course_analytics — skip");
      return [];
    }
    const iframeUrl = iframeMatch[1].startsWith("http") ? iframeMatch[1] : `${GG}${iframeMatch[1]}`;
    try {
      const resp2 = await ctx.request.get(iframeUrl);
      html = await resp2.text();
    } catch (e) {
      console.log(`   ⚠ fetch iframe falhou: ${e.message}`);
      return [];
    }
  }
  // Extrair forms via regex no HTML cru (evita parsing DOM)
  const formBlocks = [...html.matchAll(/<form[^>]*id="(course_statistics_[^"]+)"[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)];
  if (!formBlocks.length) return [];
  const allResults = [];
  // Processar até 24 forms; cada POST é independente.
  // Limitamos concorrência a 4 para não sobrecarregar o servidor.
  const concurrency = 4;
  for (let i = 0; i < formBlocks.length; i += concurrency) {
    const batch = formBlocks.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async (fm) => {
      const formId = fm[1];
      const action = fm[2].startsWith("http") ? fm[2] : `${GG}${fm[2]}`;
      const body = fm[3];
      // Extrair inputs do form
      const inputs = [...body.matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g)];
      const formData = {};
      for (const inp of inputs) formData[inp[1]] = inp[2];
      try {
        const resp = await ctx.request.post(action, { form: formData, headers: browserHeaders });
        const respHtml = await resp.text();
        const idParts = formId.replace(/^course_statistics_/, "").split("_");
        const trs = [...respHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
        // Debug do PRIMEIRO form — ver o que o servidor responde
        if (i === 0 && fm === batch[0]) {
          const sample = respHtml.slice(0, 400).replace(/\s+/g, " ");
          console.log(`   [debug-post] form0 → ${respHtml.length} bytes, ${trs.length} <tr>, status=${resp.status()}`);
          console.log(`   [debug-post] sample: ${sample.slice(0, 250)}`);
        }
        const rows = [];
        const teeMatch = respHtml.match(/(?:Tee|Marqueurs|Marques)\s*[:<][\s\S]{0,200}?>([^<]+?)<\/(?:a|td|span|h[1-6])/i);
        const teeName = teeMatch ? teeMatch[1].replace(/\s+/g, " ").trim() : "";
        const courseHeader = respHtml.match(/Course:\s*([^<]+)/);
        // Helper: extrai primeiro inteiro de uma cell que pode ser "354" ou "354-407" (range entre 2 tees).
        // Usar o MAIOR (back/longer tee) — é geralmente o tee dos Garçons (NOIR/black).
        const firstInt = (s) => {
          const nums = (String(s).match(/\d+/g) || []).map(Number);
          return nums.length ? Math.max(...nums) : NaN;
        };
        for (const tr of trs) {
          const cells = [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)]
            .map((mm) => mm[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim())
            .filter((x) => x);
          // Aceita "Hole|Meters|Par|..." (EN) ou "Trou|Mètre|Par|..." (FR).
          // cells[0] = hole number (1-18), cells[1] = meters (range ou inteiro), cells[2] = par.
          if (cells.length >= 11 && /^\d+$/.test(cells[0]) && /^\d+$/.test(cells[2])) {
            const meters = firstInt(cells[1]);
            const rank = firstInt(cells[4]);
            if (Number.isFinite(meters)) {
              rows.push({ hole: +cells[0], meters, par: +cells[2], rank: Number.isFinite(rank) ? rank : 0 });
            }
          }
        }
        if (!rows.length) return null;
        const par = rows.map((r) => r.par);
        const meters = rows.map((r) => r.meters);
        const si = rows.map((r) => r.rank);
        return {
          formId,
          eventId: idParts.length >= 2 ? idParts[0] : null,
          courseId: idParts.length >= 2 ? idParts[1] : idParts[0],
          teeId: idParts.length >= 3 ? idParts[2] : null,
          teeName,
          courseName: courseHeader ? courseHeader[1].replace(/\s+/g, " ").trim() : "",
          par, meters, si,
          parTotal: par.reduce((s, v) => s + v, 0),
          metersTotal: meters.reduce((s, v) => s + v, 0),
        };
      } catch (e) {
        return null;
      }
    }));
    allResults.push(...results);
  }
  // Deduplicar por (parTotal, metersTotal) — combinações únicas de tees
  const seen = new Map();
  for (const r of allResults) {
    if (!r || !isFinite(r.metersTotal) || r.metersTotal === 0) continue;
    const key = `${r.parTotal}-${r.metersTotal}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

/* Wrapper compatibility: devolve só o 1º course (para chamadas legadas) */
async function fetchCourseStats(page, statsPageId, eventId) {
  await page.goto(`${GG}/pages/${statsPageId}`, { waitUntil: "domcontentloaded" });
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
  return fetchOneCourseStats(page, eventId);
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
    const ifr = [...document.querySelectorAll("iframe")].find((f) => /golfgenius/i.test(f.src || "")) || document.querySelectorAll("iframe")[0];
    const doc = ifr?.contentDocument;
    if (!doc) return [];
    const opts = [];
    const seen = new Set();
    // Filtros de UI/lixo (NÃO são divisões)
    const isJunk = (t) => {
      const lt = t.toLowerCase();
      return (
        /^(expand|collapse|show|hide|view|select|all|toggle|close|open)\b/i.test(t) ||
        /^(round|tour|jour|day|day\s*\d|\d+(st|nd|rd|th))\b/i.test(t) ||
        /^\d{1,2}\s+(jan|fev|mar|apr|mai|jun|jul|aug|sep|oct|nov|dec)/i.test(t) ||
        /^\d+\s*$/.test(t) ||
        lt === "all" || lt === "default" || lt === "men" || lt === "women" || lt.length < 4
      );
    };
    // 1) Selects (só os que NÃO sejam o "round" principal, e que tenham >1 opção real)
    doc.querySelectorAll("select").forEach((s) => {
      if (s.name === "round") return;
      const realOpts = [...s.options].filter((o) => o.value && !isJunk(o.textContent.trim()));
      if (realOpts.length < 2) return; // só uma opção = não é divisão
      realOpts.forEach((o) => {
        const t = o.textContent.replace(/\s+/g, " ").trim();
        if (!t || seen.has(t) || isJunk(t)) return;
        seen.add(t);
        opts.push({ type: "select", label: t, value: o.value, selectName: s.name || s.id });
      });
    });
    // 2) Tabs específicos do GolfGenius com data-tournament-id (mais fiável que classes)
    if (opts.length === 0) {
      doc.querySelectorAll("[data-tournament-id], [data-event-id]").forEach((el) => {
        const t = el.textContent.replace(/\s+/g, " ").trim();
        const did = el.dataset?.tournamentId || el.dataset?.eventId;
        if (!t || t.length > 80 || seen.has(t) || isJunk(t)) return;
        seen.add(t);
        opts.push({ type: "tab", label: t, divId: did });
      });
    }
    // 3) Links com palavras-chave de categoria EXACTAS (não substring)
    if (opts.length === 0) {
      doc.querySelectorAll("a, button").forEach((el) => {
        const t = el.textContent.replace(/\s+/g, " ").trim();
        if (!t || t.length > 80 || seen.has(t) || isJunk(t)) return;
        // Match: divisão clara (ex: "Boys", "Girls Division", "Garçons U12", "Boys 11")
        if (
          /\b(boys|girls|gar[çc]ons?|filles?|cadets?|cadettes?|benjamins?|benjamines?|minimes?)\b/i.test(t) &&
          // E tem mais de uma palavra OU é seguido de número (Boys 11, U14 Filles, etc.)
          (t.split(/\s+/).length >= 2 || /\d/.test(t))
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
    const ifr = [...document.querySelectorAll("iframe")].find((f) => /golfgenius/i.test(f.src || "")) || document.querySelectorAll("iframe")[0];
    const doc = ifr?.contentDocument;
    if (!doc) return { ok: false, err: "no doc" };
    if (div.type === "select") {
      const sel = [...doc.querySelectorAll("select")].find((s) => s.name === div.selectName || s.id === div.selectName);
      if (!sel) return { ok: false, err: "select not found" };
      sel.value = div.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      // jQuery se houver
      try { ifr.contentWindow.jQuery && ifr.contentWindow.jQuery(sel).trigger("change"); } catch {}
      return { ok: true, via: "select" };
    }
    // type === tab/clickable: encontrar pelo texto (várias estratégias)
    const candidates = [...doc.querySelectorAll("a, button, [role='tab'], div[onclick], li, span")];
    // 1. match exacto
    let target = candidates.find((el) => el.textContent.replace(/\s+/g, " ").trim() === div.label);
    // 2. match prefix (Boys, Girls, etc.)
    if (!target) target = candidates.find((el) => el.textContent.replace(/\s+/g, " ").trim().startsWith(div.label));
    // 3. match contém (caso o label tenha sido truncado)
    if (!target) target = candidates.find((el) => {
      const t = el.textContent.replace(/\s+/g, " ").trim();
      return t.length > 5 && t.length < 200 && t.includes(div.label.split(" - ")[0]);
    });
    if (!target) return { ok: false, err: "no candidate found", candidateCount: candidates.length };
    // Tentar click + dispatch mouse events
    try {
      target.scrollIntoView();
      target.click();
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: ifr.contentWindow }));
      // Se for link com data-href, tentar trigger via attr
      if (target.dataset?.href) target.click();
      return { ok: true, via: "click", tag: target.tagName };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  }, division);
}

/* ─────────────────────────────────────────────────────────────────
   Switch dropdown e extrai leaderboard
   ───────────────────────────────────────────────────────────────── */
/* Expand TODAS as divisões clicando em a.expand-tournament — necessário para
   carregar todos os jogadores quando há múltiplas categorias num gg_page. */
async function expandAllDivisions(page) {
  return page.evaluate(async () => {
    const ifr = [...document.querySelectorAll("iframe")].find((f) => /golfgenius/i.test(f.src || "")) || document.querySelectorAll("iframe")[0];
    const doc = ifr?.contentDocument;
    if (!doc) return 0;
    // Click TODOS os links em paralelo (cada um dispara seu próprio AJAX)
    const links = [...doc.querySelectorAll("a.expand-tournament")];
    if (!links.length) return 0;
    for (const link of links) {
      try { link.click(); } catch {}
    }
    // Esperar uma vez 3s após todos os clicks
    await new Promise((r) => setTimeout(r, 3000));
    return links.length;
  });
}

async function fetchLeaderboard(page, ggPage, eventId) {
  // Só navega se URL diferente — caso contrário reutiliza tab
  const targetUrl = `${GG}/pages/${ggPage}`;
  const currentUrl = page.url();
  if (!currentUrl.startsWith(targetUrl)) {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForIframeReady(page, 60000);
    // Expandir divisões só na 1ª vez
    const expandedCount = await expandAllDivisions(page);
    if (expandedCount > 0) await sleep(2000);
  }
  // Mudar dropdown
  await page.evaluate((eId) => {
    const ifr = [...document.querySelectorAll("iframe")].find((f) => /golfgenius/i.test(f.src || "")) || document.querySelectorAll("iframe")[0];
    const doc = ifr?.contentDocument;
    const sel = doc?.querySelector("select");
    if (sel && sel.value !== eId) {
      sel.value = eId;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, eventId);
  await sleep(2500);
  // Expand de novo após dropdown change (alguns torneios re-renderizam divisões)
  await expandAllDivisions(page);
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
    const ifr = [...document.querySelectorAll("iframe")].find((f) => /golfgenius/i.test(f.src || "")) || document.querySelectorAll("iframe")[0];
    const doc = ifr?.contentDocument;
    if (!doc) return { players: [], headers: [] };

    // Detectar cabeçalhos de coluna
    const headerCells = [];
    const headerRow = doc.querySelector("thead tr") || doc.querySelector("table tr");
    if (headerRow) {
      [...headerRow.querySelectorAll("th, td")].forEach((c) =>
        headerCells.push(c.textContent.replace(/\s+/g, " ").trim())
      );
    }

    // Capturar texto da divisão (header do v2tournament-event div) para CADA jogador
    const players = [];
    let rowIdx = 0;
    for (const tr of doc.querySelectorAll("tr")) {
      const link = tr.querySelector('a[href*="tournaments2/details"]');
      if (!link) continue;
      const idM = (link.getAttribute("href") || "").match(/details\/(\d+)/);
      if (!idM) continue;
      rowIdx++;
      // Detectar a divisão: procurar tournament_container ancestor (contém tanto título como tabela)
      let division = null;
      let ancestor = tr.parentElement;
      while (ancestor) {
        const cls = ancestor.className || "";
        if (typeof cls === "string" && cls.includes("tournament_container")) {
          // O título .expand-tournament/.tournament_name está dentro deste container
          const titleEl = ancestor.querySelector(".expand-tournament, .tournament_name, h1, h2, h3, h4");
          if (titleEl) division = titleEl.textContent.replace(/\s+/g, " ").trim().slice(0, 100);
          break;
        }
        ancestor = ancestor.parentElement;
      }

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
        division,
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
/* Auto-dismiss de cookie banners (GolfGenius/FFGolf usam Didomi e CookieScript) */
async function dismissCookieBanners(page) {
  try {
    await page.evaluate(() => {
      // Didomi (golfgenius/ffgolf)
      const didomi = document.querySelector('#didomi-notice-agree-button, [aria-label*="Accept"], [data-action="agree"]');
      if (didomi) didomi.click();
      // CookieScript / OneTrust
      document.querySelectorAll('button').forEach((b) => {
        const t = (b.textContent || '').trim().toLowerCase();
        if (/(accept|tout|ok|agree|j’accepte|continuer)/i.test(t)) {
          try { b.click(); } catch {}
        }
      });
      // Generic close X buttons em iframes
      document.querySelectorAll('iframe[id*="cookie"], iframe[id*="consent"], iframe[id*="didomi"]').forEach((f) => {
        try { f.style.display = 'none'; f.remove(); } catch {}
      });
    });
  } catch {
    /* ignore */
  }
}

async function scrapeOne(browser, t) {
  console.log(`\n🏌️  ${t.title || t.slug} (${t.year})`);
  console.log(`   gg_page=${t.gg_page}`);
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1024 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  const page = await ctx.newPage();
  // Disfarçar headless: remover navigator.webdriver e mais
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", { get: () => ["fr-FR", "fr", "en-US", "en"] });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    window.chrome = { runtime: {} };
  });
  try {
    // 1. Classement page → metadados
    const meta = await openClassement(page, t.gg_page);
    if (!meta.leagueId) {
      console.log(`   ⚠ sem leagueId — saltar`);
      return null;
    }
    console.log(`   league=${meta.leagueId} statsPage=${meta.statsPageId} departsPage=${meta.departsPageId} events=${meta.dates.length}`);
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
    let allCourses = [];
    // Preferir leagueId (acede DIRECTO ao widget course_analytics — sempre funciona,
    // não depende do iframe nested que pode falhar a carregar). Fallback para statsPage
    // só se leagueId estiver indisponível (raro).
    if (meta.leagueId) {
      allCourses = await fetchAllCourseStats(page, meta.leagueId, "league");
      // Se o widget directo não devolveu nada e temos statsPageId, tentar via /pages/
      if (allCourses.length === 0 && meta.statsPageId) {
        console.log(`   ⚠ widget directo vazio — tentar via statsPageId=${meta.statsPageId}`);
        allCourses = await fetchAllCourseStats(page, meta.statsPageId, "statsPage");
      }
    } else if (meta.statsPageId) {
      allCourses = await fetchAllCourseStats(page, meta.statsPageId, "statsPage");
    }
    if (meta.statsPageId || meta.leagueId) {
      if (allCourses.length) {
        console.log(`   ${allCourses.length} configurações de campo (par/metros únicos):`);
        allCourses.forEach((c) =>
          console.log(`     • par=${c.parTotal} meters=${c.metersTotal}${c.teeName ? ` tee="${c.teeName}"` : ""}`)
        );
        courseStats = allCourses[0]; // 1º para retro-compat
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
      const evStart = Date.now();
      process.stdout.write(`   ▶ ${ev.name} [${fmt}] ... `);
      try {
        const lb = await fetchLeaderboard(page, t.gg_page, ev.id);
        process.stdout.write(`(${Math.round((Date.now() - evStart) / 1000)}s) `);
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

        // 4b. Fetch pairings/brackets para este evento (Départs page)
        let pairings = [];
        if (meta.departsPageId) {
          try {
            pairings = await fetchPairings(page, meta.departsPageId, ev.id);
            if (pairings.length) console.log(`     ${pairings.length} pairings/grupos capturados`);
          } catch (e) {
            console.log(`     ⚠ pairings erro: ${e.message.slice(0, 50)}`);
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
          division: p.division,  // tag com divisão real (Boys/Girls)
        }));
        // Resumo das divisões neste evento
        const divCounts = {};
        for (const p of lb.players) {
          const k = p.division || "default";
          divCounts[k] = (divCounts[k] || 0) + 1;
        }
        const divSummary = Object.entries(divCounts).map(([d, c]) => `${d.slice(0, 30)}=${c}`).join(", ");
        console.log(`     divisões: ${divSummary}`);

        // Capturar a divisão default
        const eventEntry = {
          id: ev.id,
          name: ev.name,
          format: fmt,
          headers: lb.headers,
          players: eventPlayers,
          pairings,
          division: divs[0]?.label || "default",
          scorecardsByPlayerId: Object.fromEntries(
            newPlayers
              .filter((p) => newScs[p.id]?.rounds?.length)
              .map((p) => [p.id, newScs[p.id].rounds])
          ),
        };
        events.push(eventEntry);

        // (NOTA: o switch redundante foi removido — expandAllDivisions já carregou
        //  TODAS as divisões na página, e o parser tag cada jogador com a sua divisão
        //  via ancestor .tournament_container)
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

    // 6. Vista consolidada — um jogador por player ID (não por evento×divisão)
    //    Pega no MELHOR registo do jogador (último stroke event onde aparece)
    const strokeEvents = events.filter((e) => e.format === "stroke" && e.players?.length);
    const playerLatestRecord = new Map(); // id → mais recente stroke entry
    const playerDivision = new Map();      // id → division da entry
    for (const ev of strokeEvents) {
      for (const p of ev.players) {
        // Se já temos um registo, mantemos. O LAST stroke event tem totais cumulativos.
        playerLatestRecord.set(p.id, p);
        if (ev.division && ev.division !== "default") playerDivision.set(p.id, ev.division);
      }
    }
    const nRounds = new Set(strokeEvents.map((e) => e.name.replace(/ — .*$/, ""))).size; // únicos nomes de eventos
    const consolidatedPlayers = [...playerLatestRecord.values()].map((p) => {
      const scRounds = allScorecards[p.id] || [];
      const rounds = [...scRounds].reverse().slice(0, nRounds || 1).map((r, i) => ({
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
        division: playerDivision.get(p.id) || null,
        rounds,
      };
    }).sort((a, b) => {
      if (a.total == null) return 1;
      if (b.total == null) return -1;
      return a.total - b.total;
    });
    console.log(`   ✓ ${consolidatedPlayers.length} jogadores consolidados (todas as divisões)`);

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
        name: courseInfo.name || allCourses[0]?.courseName || "",
        tee: courseInfo.tee || allCourses[0]?.teeName || "",
        par: courseStats?.par || [],
        meters: courseStats?.meters || [],
        si: courseStats?.si || [],
        parTotal: courseStats?.parTotal || 0,
        metersTotal: courseStats?.metersTotal || 0,
      },
      // NOVO: array com TODAS as configurações de tees/categorias (multi-categoria torneios)
      courses: allCourses.map((c) => ({
        teeName: c.teeName || "",
        courseName: c.courseName || "",
        par: c.par,
        meters: c.meters,
        si: c.si,
        parTotal: c.parTotal,
        metersTotal: c.metersTotal,
      })),
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
  // Headless é DEFAULT — mais rápido e sem popups. --no-headless mostra browser para debug.
  const args = { headless: true, slug: null, year: null, ggPage: null, title: null, onlyEmpty: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--headless") args.headless = true;
    else if (argv[i] === "--no-headless" || argv[i] === "--show-browser") args.headless = false;
    else if (argv[i] === "--slug") args.slug = argv[++i];
    else if (argv[i] === "--year") args.year = parseInt(argv[++i], 10);
    else if (argv[i] === "--gg-page") args.ggPage = argv[++i];
    else if (argv[i] === "--title") args.title = argv[++i];
    // --only-empty: re-scrape só de torneios cujo ficheiro está vazio (course.meters.length !== 18).
    else if (argv[i] === "--only-empty") args.onlyEmpty = true;
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
    const all = cat.tournaments || [];
    tournaments = all.filter((t) => t.gg_page);
    if (args.slug) tournaments = tournaments.filter((t) => t.slug === args.slug);
    if (args.year) tournaments = tournaments.filter((t) => t.year === args.year);

    // Sem gg_page não há nada a scrapar — mas dizê-lo em voz alta. Saltar em
    // silêncio já escondeu torneios inteiros do site (CFJ U12 Garçons 2026).
    const mudos = all
      .filter((t) => !t.gg_page)
      .filter((t) => (!args.slug || t.slug === args.slug) && (!args.year || t.year === args.year));
    if (mudos.length) {
      console.warn(`⚠️  ${mudos.length} torneio(s) do catálogo sem gg_page — SALTADOS:`);
      for (const t of mudos) console.warn(`   ✗ ${t.year} ${t.slug}`);
      console.warn(`   (corre o discover-ffgolf-catalog.js, ou preenche o gg_page à mão)`);
    }
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
    fail = 0,
    skippedEmpty = 0,
    skippedExisting = 0;
  for (const t of tournaments) {
    try {
      const outPath = path.join(outDir, `${t.year}_${t.slug}.json`);
      if (args.onlyEmpty && fs.existsSync(outPath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(outPath, "utf-8"));
          const meters = existing && existing.course && existing.course.meters || [];
          if (meters.length === 18) {
            console.log("   skip " + t.slug + ": ja tem distancias completas (--only-empty)");
            skippedExisting++;
            continue;
          }
        } catch (e) { /* JSON invalido — re-scrape */ }
      }
      const result = await scrapeOne(browser, t);
      if (result) {
        // Cartão oficial (par + metros por buraco) ganha ao inferido dos marcadores.
        // Aqui em cima do hasMeters de propósito: o override é quem traz os metros
        // nos torneios em que o GolfGenius não os expõe.
        const ov = applyCourseOverride(result);
        if (ov) console.log("   cartao oficial aplicado: " + (result.course.tee || "?") + " · par " + result.course.parTotal + " · " + result.course.metersTotal + "m");
        const hasMeters = Array.isArray(result.course && result.course.meters) && result.course.meters.length === 18;
        const hasPlayers = Array.isArray(result.players) && result.players.length > 0;
        // Torneios sem jogadores (leaderboard vazio, só match play, ou divisão não
        // capturada) não têm valor no /ffg — não gravar. E se já existe um ficheiro
        // vazio destes, limpá-lo; NUNCA apagar um que tenha jogadores (não sobrescrever
        // dados bons com um re-scrape falhado).
        if (!hasPlayers) {
          if (fs.existsSync(outPath)) {
            let existingN = 0;
            try { existingN = (JSON.parse(fs.readFileSync(outPath, "utf-8")).players || []).length; } catch { /* inválido */ }
            if (existingN > 0) {
              console.log("   skip " + t.slug + ": 0 jogadores no re-scrape — mantido o existente (" + existingN + " jog)");
            } else {
              fs.unlinkSync(outPath);
              console.log("   removido " + t.slug + ": 0 jogadores (ficheiro vazio limpo)");
            }
          } else {
            console.log("   nao grava " + t.slug + ": 0 jogadores");
          }
          skippedEmpty++;
          continue;
        }
        // Preservar o enriquecimento do tee-sheet scraper (draws + hcp) — o
        // re-scrape do leaderboard não os traz e apagava-os (caso CFJ U12 2026).
        const kept = preserveTeesheet(outPath, result);
        if (kept.draws || kept.hcps) console.log("   tee sheet preservado: " + kept.draws + " ronda(s) de draw, " + kept.hcps + " hcp(s)");
        // Atomic write: escrever para .tmp e renomear no fim. Evita ficheiros truncados
        // se o processo for interrompido (Ctrl+C) durante a escrita.
        const tmpPath = outPath + ".tmp";
        fs.writeFileSync(tmpPath, JSON.stringify(result, null, 2), "utf-8");
        fs.renameSync(tmpPath, outPath);
        console.log("   gravado " + outPath + " (" + result.players.length + " jogadores, " + (hasMeters ? "metros OK" : "sem metros") + ")");
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
