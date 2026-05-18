/**
 * scrape-bluegolf.js
 *
 * Playwright script para descarregar leaderboard + scorecards do BlueGolf.
 * Abre browser VISÍVEL para permitir resolver CAPTCHA manualmente.
 *
 * USO:
 *   node scrape-bluegolf.js "https://brjgt.bluegolf.com/.../contest/73/leaderboard.htm" output.json
 *     → modo "contest": scrape de UM leaderboard específico para um ficheiro
 *
 *   node scrape-bluegolf.js "https://www.bluegolf.com/junior/events/brjgt243/index.html" public/data
 *     → modo "event": descobre todos os contests (segue sub-eventos
 *       recursivamente quando o root só tem links para escalões) e gera
 *       1 JSON por contest com nome auto-derivado.
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const DELAY_MS = 700;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractRoundNum(label) {
  if (!label || typeof label !== "string") return null;
  const m = /\b(?:round|rd|day|volta|r)\s*[\.#]?\s*(\d+)/i.exec(label);
  if (m) return parseInt(m[1], 10);
  const m2 = /\d+/.exec(label);
  if (m2) return parseInt(m2[0], 10);
  return null;
}

async function waitForHuman(page) {
  const title = await page.title();
  if (!title.toLowerCase().includes("confirm") && !title.toLowerCase().includes("human")) return;
  console.log("\n⏳ CAPTCHA detectado! Resolve no browser...");
  await page.waitForFunction(
    () => !document.title.toLowerCase().includes("confirm") && !document.title.toLowerCase().includes("human"),
    null,
    { timeout: 300_000 }
  );
  console.log("✅ CAPTCHA resolvido!\n");
  await sleep(1500);
}

/** Tenta extrair categoria (Boys 10-11 / Girls 12-13 / etc.) a partir de
 *  qualquer texto. Suporta os dois formatos:
 *    "Boys 12-13"  ou  "12-13 Boys"  (e variantes com en-dash).
 *  Devolve string canónica "Boys 12-13" ou null. */
function parseCategorySingle(txt) {
  if (!txt) return null;
  // WAGR — categorias séniores sem idade (Boys WAGR / Girls WAGR)
  let m = /\b(Boys|Girls)\s+WAGR\b/i.exec(txt);
  if (m) {
    const prefix = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    return `${prefix} WAGR`;
  }
  // Caso especial "7&Under Boys" / "7&Under Girls" / "7 & Under Boys"
  m = /\b(\d+)\s*&\s*under\s+(Boys|Girls)\b/i.exec(txt);
  if (m) {
    const prefix = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
    return `${prefix} ${m[1]}&Under`;
  }
  // "Boys 7&Under" (formato invertido do anterior)
  m = /\b(Boys|Girls)\s+(\d+)\s*&\s*under\b/i.exec(txt);
  if (m) {
    const prefix = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    return `${prefix} ${m[2]}&Under`;
  }
  // "Boys 10-11" / "Girls 12-13"
  m = /\b(Boys|Girls)\s+(\d+)(?:\s*[-–]\s*(\d+))?/i.exec(txt);
  if (m) {
    const prefix = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    return m[3] ? `${prefix} ${m[2]}-${m[3]}` : `${prefix} ${m[2]}`;
  }
  // Invertido: "10-11 Boys" / "12-13 Girls"
  m = /\b(\d+)(?:\s*[-–]\s*(\d+))?\s+(Boys|Girls)\b/i.exec(txt);
  if (m) {
    const prefix = m[3].charAt(0).toUpperCase() + m[3].slice(1).toLowerCase();
    return m[2] ? `${prefix} ${m[1]}-${m[2]}` : `${prefix} ${m[1]}`;
  }
  return null;
}

function parseCategoryFromText(txt) {
  if (!txt) return null;
  // Os títulos típicos têm formato:
  //   "Daily Mail WJGC, 6-11 Boys & 6-13 Girls - 10-11 Boys"
  // onde o escalão ESPECÍFICO está depois do " - " (a parte antes é a
  // descrição geral do torneio). Por isso fazemos split e tentamos
  // primeiro a ÚLTIMA parte; se não bater nada, cai à parte anterior.
  const parts = txt.split(/\s+[-–]\s+/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const cat = parseCategorySingle(parts[i]);
    if (cat) return cat;
  }
  return null;
}

/** Converte slug do curso (ex: "villapadiernaalferin") num nome legível.
 *  Para slugs conhecidos usamos um mapping; outros caem na capitalização
 *  simples palavra-a-palavra. */
function prettifyCourseSlug(slug) {
  if (!slug) return "";
  const s = slug.toLowerCase().replace(/[-_]+/g, " ").trim();
  const map = {
    "villapadiernaflaming": "Villa Padierna — Flamingos",
    "villapadiernaalferin": "Villa Padierna — Alferini",
    "villapadiernatramores": "Villa Padierna — Tramores",
    "villapadierna": "Villa Padierna",
    "flamingos": "Flamingos",
    "alferini": "Alferini",
    "letouquetlaforet": "Le Touquet — La Forêt",
    "letouquetlamer": "Le Touquet — La Mer",
  };
  if (map[s.replace(/\s+/g, "")]) return map[s.replace(/\s+/g, "")];
  // Fallback: capitalize each word
  return s.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

async function extractScorecard(page) {
  return page.evaluate(() => {
    const result = { name: "", country: "", pos: null, result: "", total: null, par: [], si: [], yards: [], course: "", rounds: [] };

    const nameLink = document.querySelector(".bg-profile-header h3 a");
    if (nameLink) {
      const clone = nameLink.cloneNode(true);
      clone.querySelectorAll("i, img, span, svg").forEach(el => el.remove());
      result.name = clone.textContent.replace(/\s+/g, " ").trim();
    }
    const countryEl = document.querySelector(".bg-profile-header p.text-muted");
    if (countryEl) result.country = countryEl.textContent.trim();

    const profileCells = document.querySelectorAll("table.scorecard-profile tr");
    for (const tr of profileCells) {
      const tds = tr.querySelectorAll("td");
      if (tds.length < 2) continue;
      const label = tds[0].textContent.trim().toLowerCase();
      const val = tds[1].textContent.trim();
      if (label.includes("posi")) result.pos = parseInt(val, 10) || null;
      if (label.includes("resultado")) result.result = val;
      if (label.includes("tacada") || label.includes("stroke")) result.total = parseInt(val, 10) || null;
    }

    const desktopBlock = document.querySelector(".row.d-none.d-md-block");
    if (desktopBlock) {
      const table = desktopBlock.querySelector("table.bg-tbl-scorecard");
      if (table) {
        for (const inp of table.querySelectorAll('input[type="hidden"][data-par]')) {
          result.par.push(parseInt(inp.getAttribute("data-par"), 10));
        }
        // Distâncias (yards) — mesmo padrão de input hidden mas com
        // data-distance. Captura por ordem dos buracos.
        for (const inp of table.querySelectorAll('input[type="hidden"][data-distance]')) {
          const v = parseInt(inp.getAttribute("data-distance"), 10);
          if (!isNaN(v) && v > 0) result.yards.push(v);
        }
        for (const tr of table.querySelectorAll("tr")) {
          const firstTd = tr.querySelector("td");
          if (!firstTd) continue;
          const label = firstTd.textContent.trim().toLowerCase();
          if (label.includes("handicap") || label === "hcp") {
            for (const td of Array.from(tr.querySelectorAll("td")).slice(1)) {
              const n = parseInt(td.textContent.trim(), 10);
              if (!isNaN(n) && n >= 1 && n <= 18) result.si.push(n);
            }
            break;
          }
        }
        for (const tr of table.querySelectorAll("tr.scores")) {
          const allTds = Array.from(tr.querySelectorAll("td"));
          const labelTd = allTds[0];
          const label = labelTd ? labelTd.textContent.trim() : "";
          const tds = allTds.slice(1);
          const scores = [];
          for (const td of tds) {
            const n = parseInt(td.textContent.trim(), 10);
            if (!isNaN(n) && n >= 1 && n <= 15) scores.push(n);
          }
          if (scores.length >= 9) result.rounds.push({ scores, label });
        }
      }
    }

    if (result.rounds.length === 0) {
      const allTables = document.querySelectorAll("table.bg-tbl-scorecard");
      const mobileScores = [];
      for (const table of allTables) {
        for (const tr of table.querySelectorAll("tr")) {
          if (tr.classList.contains("bg-light")) continue;
          const firstTd = tr.querySelector("td");
          if (!firstTd) continue;
          const label = firstTd.textContent.trim().toLowerCase();
          if (label.includes("volta") || label.includes("rd ") || label.includes("round")) {
            const scores = [];
            for (const td of Array.from(tr.querySelectorAll("td")).slice(1)) {
              const n = parseInt(td.textContent.trim(), 10);
              if (!isNaN(n) && n >= 1 && n <= 15) scores.push(n);
            }
            if (scores.length >= 9) mobileScores.push(scores);
          }
        }
        if (result.par.length === 0) {
          for (const inp of table.querySelectorAll('input[type="hidden"][data-par]')) {
            result.par.push(parseInt(inp.getAttribute("data-par"), 10));
          }
        }
      }
      if (mobileScores.length >= 2 && mobileScores[0].length === 9) {
        for (let i = 0; i + 1 < mobileScores.length; i += 2) {
          result.rounds.push([...mobileScores[i], ...mobileScores[i + 1]]);
        }
      } else {
        result.rounds = mobileScores;
      }
    }
    // Curso — capturar nome do curso do menu de navegação do contest.
    // Padrão: links <a href*="/event/{slug}/course/{course-slug}/index.htm">.
    // Ignoramos o microsite genérico (course.bluegolf.com).
    // Estratégia: iteramos todos os links de course, preferimos o que tem
    // texto com nome real (ex: "Flamingos GC") sobre os que só dizem
    // "Course"/"Campo" (texto da tab de nav). Se NENHUM tiver nome bom,
    // capturamos o SLUG do href (ex: "villapadiernaflaming") prefixado com
    // "__slug__:" para o Node resolver via heurística.
    {
      let bestText = "";
      let bestSlug = "";
      const navLabel = /^(course|campo|info|leaderboard|placar|tee\s*times|highlights|stats?|map|fotos|results?|scorecards?|player\s*stats)$/i;
      for (const a of document.querySelectorAll('a[href*="/event/"][href*="/course/"]')) {
        const href = a.getAttribute("href") || "";
        if (href.includes("course.bluegolf.com")) continue;
        const m = href.match(/\/course\/([^\/?#]+)/);
        const slug = m ? m[1] : "";
        if (!slug) continue;
        const txt = (a.textContent || "").replace(/\s+/g, " ").trim();
        if (!bestSlug) bestSlug = slug;
        if (txt && txt.length <= 80 && !navLabel.test(txt)) { bestText = txt; break; }
      }
      if (bestText) result.course = bestText;
      else if (bestSlug) result.course = `__slug__:${bestSlug}`;
    }

    return result;
  });
}

/** Descobre links na página actual:
 *    - contests directos (/contest/N/...)
 *    - sub-eventos (/junior/events/SLUG/...) */
async function discoverLinksOnPage(page) {
  return page.evaluate(() => {
    const contests = [];
    const subEvents = [];
    const seenContest = new Set();
    const seenEvent = new Set();
    for (const a of document.querySelectorAll("a[href]")) {
      const abs = a.href;
      if (!abs) continue;
      const cm = abs.match(/\/contest\/(\d+)(?:\/(?:leaderboard|index)\.htm)?(?:[?#].*)?$/i);
      if (cm) {
        if (seenContest.has(cm[1])) continue;
        seenContest.add(cm[1]);
        let label = (a.textContent || "").replace(/\s+/g, " ").trim();
        const tr = a.closest("tr");
        if (tr && (!label || label.length < 3)) {
          const firstTd = Array.from(tr.querySelectorAll("td")).find(td => (td.textContent || "").trim().length > 0);
          if (firstTd) label = firstTd.textContent.replace(/\s+/g, " ").trim();
        }
        const base = abs.replace(/\/(?:leaderboard|index)\.htm.*$/i, "").replace(/\/+$/, "");
        contests.push({ url: `${base}/leaderboard.htm`, contestId: cm[1], label: label || `contest ${cm[1]}` });
        continue;
      }
      // Aceitar dois formatos de URL de evento:
      //   www.bluegolf.com/junior/events/SLUG/...
      //   brjgt.bluegolf.com/bluegolfw/XXX/event/SLUG/...
      const em = abs.match(/\/(?:junior\/events|bluegolfw\/[^\/]+\/event)\/([^\/?#]+)\/?/i);
      if (em) {
        const slug = em[1].toLowerCase();
        if (seenEvent.has(slug)) continue;
        seenEvent.add(slug);
        let label = (a.textContent || "").replace(/\s+/g, " ").trim();
        const tr = a.closest("tr");
        if (tr && (!label || label.length < 3)) {
          const firstTd = Array.from(tr.querySelectorAll("td")).find(td => (td.textContent || "").trim().length > 0);
          if (firstTd) label = firstTd.textContent.replace(/\s+/g, " ").trim();
        }
        subEvents.push({ url: abs, slug, label: label || slug });
      }
    }
    return { contests, subEvents };
  });
}

/** Deriva uma URL de leaderboard a partir do slug do evento.
 *  WJGT/BJGT vivem em brjgt.bluegolf.com/bluegolfw/brjgt{YY}/event/{slug}/contest/N/.
 *  Devolve null se o slug não bater no padrão. */
function deriveLeaderboardUrl(slug, contestId = 1) {
  const m = (slug || "").match(/^(brjgt|brjgtw|bjgt)(\d{2})/i);
  if (!m) return null;
  const seriesPrefix = m[1].toLowerCase() + m[2];
  return `https://brjgt.bluegolf.com/bluegolfw/${seriesPrefix}/event/${slug}/contest/${contestId}/leaderboard.htm`;
}

/** Extrai contests do dropdown da página actual.
 *  Os contests do mesmo evento aparecem como <a class="dropdown-item" data-key="N">. */
async function extractContestsFromDropdown(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('a.dropdown-item[data-key]')) {
      const txt = (el.textContent || '').replace(/\s+/g, ' ').replace(/^✓\s*/, '').trim();
      const key = el.getAttribute('data-key');
      if (key && txt && /(boys|girls)/i.test(txt)) {
        out.push({ contestId: key, label: txt });
      }
    }
    return out;
  });
}

/** Descobre contests a partir de uma URL de evento. Estratégia em camadas:
 *  1. Tenta discovery por links directos na página fornecida.
 *  2. Se nada, navega para um leaderboard derivado do slug e extrai o
 *     dropdown que lista todos os contests do evento.
 *  3. Tenta vários contest IDs candidatos (1, 9, 13, 17, 33, 37). */
async function discoverContests(page, eventUrl) {
  console.log(`   ↳ A varrer ${eventUrl}`);
  await page.goto(eventUrl, { waitUntil: "domcontentloaded" });
  await waitForHuman(page);
  await page.waitForLoadState("networkidle").catch(() => {});

  const direct = await discoverLinksOnPage(page);
  // Se há links directos para um contest, tentamos ir a esse contest e extrair
  // o dropdown — porque muitas vezes a página de evento só linka 1 contest mas
  // o dropdown dentro desse contest tem os restantes escalões.
  if (direct.contests.length > 0) {
    console.log(`   ↳ ${direct.contests.length} contest(s) directos — a verificar dropdown...`);
    try {
      const firstUrl = direct.contests[0].url;
      await page.goto(firstUrl, { waitUntil: "domcontentloaded" });
      await waitForHuman(page);
      await page.waitForLoadState("networkidle").catch(() => {});
      // Não confiar no resp.status() — após CAPTCHA o response original é 405
      // mas o DOM já tem o dropdown. Esperamos directamente pelo selector.
      await page.waitForSelector('a.dropdown-item[data-key]', { timeout: 15000 }).catch(() => {});
      await sleep(1000);
      const items = await extractContestsFromDropdown(page);
      console.log(`     · dropdown tem ${items.length} contest(s).`);
      if (items.length > 1) {
        const base = firstUrl.replace(/\/contest\/\d+\/leaderboard\.htm.*$/, "");
        return items.map(it => ({
          url: `${base}/contest/${it.contestId}/leaderboard.htm`,
          contestId: it.contestId,
          label: it.label,
        }));
      }
    } catch (e) {
      console.log(`     · erro a expandir dropdown: ${e.message}`);
    }
    // Fallback: usar os links directos descobertos
    return direct.contests;
  }

  const slugMatch = eventUrl.match(/\/(?:events|event)\/([^\/?#]+)/i);
  const slug = slugMatch ? slugMatch[1].toLowerCase() : null;
  if (!slug) {
    console.log(`   ⚠️  Não foi possível extrair slug da URL.`);
    return [];
  }
  console.log(`   📌 slug detectado: ${slug}`);

  const candidates = [1, 9, 13, 17, 33, 37];
  for (const cid of candidates) {
    const lbUrl = deriveLeaderboardUrl(slug, cid);
    if (!lbUrl) continue;
    console.log(`   🔎 a tentar ${lbUrl}`);
    try {
      const resp = await page.goto(lbUrl, { waitUntil: "domcontentloaded" });
      await waitForHuman(page);
      await page.waitForLoadState("networkidle").catch(() => {});
      const status = resp ? resp.status() : 0;
      if (status >= 400) {
        console.log(`     · HTTP ${status} — saltado`);
        continue;
      }
      await page.waitForSelector('a.dropdown-item[data-key]', { timeout: 15000 }).catch(() => {});
      await sleep(800);
      const items = await extractContestsFromDropdown(page);
      if (items.length > 0) {
        console.log(`     · ${items.length} contests no dropdown.`);
        const base = lbUrl.replace(/\/contest\/\d+\/leaderboard\.htm.*$/, "");
        return items.map(it => ({
          url: `${base}/contest/${it.contestId}/leaderboard.htm`,
          contestId: it.contestId,
          label: it.label,
        }));
      } else {
        console.log(`     · sem dropdown — assumindo contest único.`);
        return [{ url: lbUrl, contestId: String(cid), label: `contest ${cid}` }];
      }
    } catch (e) {
      console.log(`     · erro: ${e.message}`);
    }
  }
  console.log(`   ⚠️  Nenhum contest válido encontrado para ${slug}.`);
  return [];
}


async function scrapeContest(page, leaderboardUrl) {
  const contestMatch = leaderboardUrl.match(/^(https?:\/\/.+\/contest\/\d+)/);
  if (!contestMatch) throw new Error(`URL inválida (sem /contest/N/): ${leaderboardUrl}`);
  const contestBase = contestMatch[1];

  console.log(`\n📋 ${leaderboardUrl}`);
  await page.goto(leaderboardUrl, { waitUntil: "domcontentloaded" });
  await waitForHuman(page);
  await page.waitForLoadState("networkidle");

  const pageTitle = await page.title();
  const tournamentTitle = pageTitle.replace(/ \| .*$/, "").replace(" Leaderboard", "").trim();
  console.log(`   Torneio: ${tournamentTitle}`);

  const meta = await page.evaluate(() => {
    const out = { categoryRaw: "", course: "", h1s: [] };
    const titleEls = [
      ...document.querySelectorAll(".bg-event-title, .event-title, h1, h2, .breadcrumb-item.active"),
    ];
    for (const el of titleEls) {
      const txt = (el.textContent || "").trim();
      out.h1s.push(txt);
    }
    const courseEl = document.querySelector(".bg-event-course, .event-course, [data-course]");
    if (courseEl) out.course = (courseEl.textContent || "").trim();
    // Fallback: procurar links para /event/{slug}/course/ no nav do contest.
    if (!out.course) {
      let bestText = "";
      let bestSlug = "";
      const navLabel = /^(course|campo|info|leaderboard|placar|tee\s*times|highlights|stats?|map|fotos|results?|scorecards?|player\s*stats)$/i;
      for (const a of document.querySelectorAll('a[href*="/event/"][href*="/course/"]')) {
        const href = a.getAttribute("href") || "";
        if (href.includes("course.bluegolf.com")) continue;
        const m = href.match(/\/course\/([^\/?#]+)/);
        const slug = m ? m[1] : "";
        if (!slug) continue;
        const txt = (a.textContent || "").replace(/\s+/g, " ").trim();
        if (!bestSlug) bestSlug = slug;
        if (txt && txt.length <= 80 && !navLabel.test(txt)) { bestText = txt; break; }
      }
      if (bestText) out.course = bestText;
      else if (bestSlug) out.course = `__slug__:${bestSlug}`;
    }
    // Capturar data — para depois extrair o ano. Fallback robusto: varrer
    // text nodes do body inteiro procurando padrão "MonthName DD,? YYYY".
    out.dateText = "";
    for (const el of document.querySelectorAll("time, .event-date, .date-info, .bg-event-meta")) {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (/\b(20\d{2})\b/.test(t)) { out.dateText = t; break; }
    }
    if (!out.dateText) {
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      const monthRe = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}.{0,20}?(20\d{2})\b/i;
      while ((node = tw.nextNode())) {
        const t = (node.nodeValue || "").replace(/\s+/g, " ").trim();
        if (t.length > 200) continue;
        const m = monthRe.exec(t);
        if (m) { out.dateText = t; break; }
      }
    }
    return out;
  });

  // Tentar todos os candidatos — preferimos o título da PÁGINA primeiro
  // (ex: "Daily Mail WJGC, 6-11 Boys & 6-13 Girls - 10-11 Boys") porque
  // contém o escalão ESPECÍFICO depois do " - ", enquanto os <h1>/<h2>
  // tipicamente só têm a descrição geral do torneio.
  const candidates = [tournamentTitle, ...(meta.h1s || [])];
  let category = "";
  for (const txt of candidates) {
    const cat = parseCategoryFromText(txt);
    if (cat) { category = cat; break; }
  }
  // Resolver course do leaderboard. Se veio como "__slug__:xxx" do nosso
  // marker (texto era genérico tipo "Course"), prettificar via heurística.
  let course = meta.course || "";
  if (course.startsWith("__slug__:")) course = prettifyCourseSlug(course.slice(9));
  // Log do course/categoria aparece DEPOIS de scrapear os scorecards
  // (porque o course pode vir dos scorecards individuais quando o
  // leaderboard não tem o nome explícito).
  console.log(`   Categoria: ${category || "(não detectada)"}`);

  const contestants = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="contestant"]');
    const seen = new Map();
    for (const link of links) {
      const match = (link.getAttribute("href") || "").match(/contestant\/(\d+)/);
      if (!match) continue;
      const id = match[1];
      if (seen.has(id)) continue;
      const tr = link.closest("tr");
      const cells = tr ? Array.from(tr.querySelectorAll("td")).map(c => c.textContent.trim()) : [];
      seen.set(id, { id, name: link.textContent.trim(), cells });
    }
    return Array.from(seen.values());
  });

  console.log(`   Jogadores: ${contestants.length}`);
  if (contestants.length === 0) return null;

  const players = [];
  let par = null, si = null;
  let yards = null;
  let scCourse = "";

  for (let i = 0; i < contestants.length; i++) {
    const c = contestants[i];
    const url = `${contestBase}/contestant/${c.id}/scorecard.htm`;
    process.stdout.write(`\r🔍 [${i + 1}/${contestants.length}] ${c.name.padEnd(35).slice(0, 35)}`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await waitForHuman(page);
      await page.waitForSelector("table.bg-tbl-scorecard, table.scorecard-profile", { timeout: 12_000 }).catch(() => {});
      const sc = await extractScorecard(page);
      if (!par && sc.par.length >= 9) par = sc.par.length > 18 ? sc.par.slice(0, 18) : sc.par;
      if (!si && sc.si.length >= 9) si = sc.si.length > 18 ? sc.si.slice(0, 18) : sc.si;
      if (!yards && sc.yards && sc.yards.length >= 9) yards = sc.yards.length > 18 ? sc.yards.slice(0, 18) : sc.yards;
      if (!scCourse && sc.course) {
        scCourse = sc.course.startsWith("__slug__:")
          ? prettifyCourseSlug(sc.course.slice(9))
          : sc.course;
      }
      const name = sc.name || c.name;
      const enrichedRounds = sc.rounds.map((rd, idx) => ({
        scores: rd.scores, label: rd.label || "", origIdx: idx,
        roundNum: extractRoundNum(rd.label) || (idx + 1),
      }));
      enrichedRounds.sort((a, b) => a.roundNum - b.roundNum);
      const rounds = enrichedRounds.map((rd, idx) => {
        const scores = rd.scores;
        const f9 = scores.slice(0, 9).reduce((a, b) => a + b, 0);
        const b9 = scores.length > 9 ? scores.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
        const gross = scores.reduce((a, b) => a + b, 0);
        return { day: idx + 1, scores, f9, ...(scores.length > 9 ? { b9 } : {}), gross, label: rd.label || undefined };
      });
      const total = rounds.length > 0 ? rounds.reduce((a, r) => a + r.gross, 0) : sc.total;
      const parTotal = par ? par.reduce((a, b) => a + b, 0) : 0;
      const result = parTotal > 0 && rounds.length > 0 ? total - parTotal * rounds.length : null;
      players.push({ name, country: sc.country || "", pos: sc.pos, result, total, rounds });
      const nRounds = rounds.length;
      const nHoles = nRounds > 0 ? rounds[0].scores.length : 0;
      process.stdout.write(nRounds === 0 ? " ⚠️ sem scores" : ` ✅ ${nRounds}R ${nHoles}H gross=${total}`);
    } catch (err) {
      process.stdout.write(` ❌ ${err.message.slice(0, 40)}`);
      players.push({ name: c.name, country: "", pos: null, result: null, total: null, rounds: [], _error: err.message });
    }
    await sleep(DELAY_MS);
  }
  console.log("");

  const parF9 = par ? par.slice(0, 9).reduce((a, b) => a + b, 0) : null;
  const parB9 = par && par.length > 9 ? par.slice(9).reduce((a, b) => a + b, 0) : null;
  const pTotal = par ? par.reduce((a, b) => a + b, 0) : null;
  // Ano: tentar pelo título do torneio, depois pela data capturada do
  // leaderboard (meta.dateText), e por último o ano corrente.
  let outYear = new Date().getFullYear();
  let yrMatch = /\b(20\d{2})\b/.exec(tournamentTitle);
  if (!yrMatch && meta.dateText) yrMatch = /\b(20\d{2})\b/.exec(meta.dateText);
  if (yrMatch) outYear = +yrMatch[1];

  // Curso final: preferimos o detectado no scorecard (específico do contest),
  // caindo no meta capturado da página de leaderboard.
  const finalCourse = scCourse || course;
  console.log(`   Course: ${finalCourse || "(não detectado)"}`);
  const output = {
    tournament: tournamentTitle, category, course: finalCourse, year: outYear,
    source: leaderboardUrl,
    par: par || [], ...(si && si.length > 0 ? { si } : {}),
    ...(yards && yards.length > 0 ? { yards } : {}),
    parF9, parB9, parTotal: pTotal,
    players: players.sort((a, b) => {
      if (a.pos && b.pos) return a.pos - b.pos;
      if (a.total && b.total) return a.total - b.total;
      return 0;
    }),
  };
  return { output, category, tournamentTitle, year: outYear };
}

function slugCategory(cat) {
  return (cat || "").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_\-]/g, "");
}
function slugEvent(eventUrl) {
  const m = eventUrl.match(/\/events\/([^\/]+)/i);
  return m ? m[1].toLowerCase() : "event";
}

(async () => {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Uso:");
    console.error("  node scrape-bluegolf.js <leaderboard_url> [output.json]");
    console.error("  node scrape-bluegolf.js <event_index_url>  [output_dir]");
    process.exit(1);
  }
  const skipExisting = args.includes("--skip-existing");
  const positional = args.filter(a => !a.startsWith("--"));
  const url = positional[0];
  const isContest = /\/contest\/\d+/.test(url);
  const isEvent = !isContest && /\/(?:junior\/)?events?\/[^\/]+\/(?:index\.htm|$)/i.test(url);

  if (!isContest && !isEvent) {
    console.error("URL não reconhecida. Esperado:");
    console.error("  https://.../contest/NN/leaderboard.htm");
    console.error("  https://www.bluegolf.com/junior/events/SLUG/index.html");
    process.exit(1);
  }

  console.log(`🏌️  BlueGolf Scraper · ${isEvent ? "MODO EVENTO" : "MODO CONTEST"}`);
  console.log(`   URL: ${url}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  if (isContest) {
    const outFile = positional[1] || "bluegolf_scorecards.json";
    const res = await scrapeContest(page, url);
    if (!res) { console.error("❌ Nenhum contestant."); await browser.close(); process.exit(1); }
    fs.writeFileSync(outFile, JSON.stringify(res.output, null, 2), "utf-8");
    console.log(`✅ Ficheiro: ${outFile}`);
    await browser.close();
    return;
  }

  const outDir = positional[1] || ".";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const evSlug = slugEvent(url);

  console.log("🔎 A descobrir contests (com sub-eventos)...");
  const contests = await discoverContests(page, url);
  console.log(`\n   ${contests.length} contests encontrados:`);
  contests.forEach((c, i) => console.log(`   ${i + 1}. ${c.label}  →  ${c.url}`));
  if (contests.length === 0) {
    console.error("\n❌ Nenhum contest descoberto.");
    await browser.close(); process.exit(1);
  }

  const summary = [];
  // Pre-computar nome de ficheiro esperado para cada contest, usando a label
  // do dropdown (que tem o escalão). Permite skip-existing antes de pagar
  // o custo de navegar + CAPTCHA.
  function expectedFilename(c) {
    const cat = parseCategoryFromText(c.label) || "";
    const catSlug = slugCategory(cat) || `contest_${c.contestId}`;
    return `${evSlug}_${catSlug}.json`;
  }
  for (const c of contests) {
    const expFname = expectedFilename(c);
    const expPath = path.join(outDir, expFname);
    if (skipExisting && fs.existsSync(expPath)) {
      console.log(`   ⏭️  ${c.label}: ${expFname} já existe (skip).`);
      summary.push({ contestId: c.contestId, label: c.label, file: expFname, status: "skipped" });
      continue;
    }
    try {
      const res = await scrapeContest(page, c.url);
      if (!res) { summary.push({ contestId: c.contestId, label: c.label, status: "empty" }); continue; }
      const catSlug = slugCategory(res.category) || `contest_${c.contestId}`;
      const fname = `${evSlug}_${catSlug}.json`;
      const fpath = path.join(outDir, fname);
      fs.writeFileSync(fpath, JSON.stringify(res.output, null, 2), "utf-8");
      summary.push({ contestId: c.contestId, label: c.label, category: res.category, file: fname, players: res.output.players.length });
      console.log(`   💾 ${fname}  (${res.output.players.length} jogadores)`);
    } catch (err) {
      summary.push({ contestId: c.contestId, label: c.label, status: "error", error: err.message });
      console.log(`   ❌ ${c.label}: ${err.message}`);
    }
  }

  console.log("\n📊 Resumo:");
  summary.forEach(s => console.log(`   • ${s.label}  →  ${s.file || s.status || s.error}`));
  await browser.close();
})();
