/*
 * MAPA COMPLETO DO SITE
 * Cola em qualquer página do site (scoring.datagolf.pt ou scoring.fpg.pt)
 * Mapeia TUDO: links, páginas, scripts, endpoints
 */
(async () => {
  const SITE = location.host;
  const log = (m) => console.log("%c[MAP " + SITE + "] " + m, "color:#2563eb;font-weight:bold");
  const ok = (m) => console.log("%c[MAP] ✓ " + m, "color:green;font-weight:bold");
  const info = (m) => console.log("%c[MAP]   " + m, "color:#6366f1");

  log("=== Mapa completo de " + SITE + " ===");
  log("Página actual: " + location.pathname);

  // ── 1. TODOS os links internos na página actual ──
  log("");
  log("--- 1. Links internos (mesma página) ---");
  const allAnchors = document.querySelectorAll("a[href]");
  const internalLinks = new Map();
  const externalLinks = [];
  
  allAnchors.forEach(a => {
    const href = a.href;
    const text = a.textContent.trim().substring(0, 60);
    if (!href || href.startsWith("javascript:") || href === "#") return;
    
    try {
      const url = new URL(href);
      if (url.host === SITE || url.host === "") {
        const path = url.pathname + url.search;
        if (!internalLinks.has(path)) {
          internalLinks.set(path, { path, text, hash: url.hash });
        }
      } else {
        externalLinks.push({ host: url.host, path: url.pathname, text });
      }
    } catch {}
  });

  log("Links internos: " + internalLinks.size);
  // Agrupar por directório
  const byDir = {};
  for (const [path, link] of internalLinks) {
    const dir = path.split("/").slice(0, -1).join("/") || "/";
    if (!byDir[dir]) byDir[dir] = [];
    byDir[dir].push(link);
  }
  for (const [dir, links] of Object.entries(byDir).sort()) {
    info(dir + "/  (" + links.length + " links)");
    links.forEach(l => info("    " + l.path + (l.text ? "  →  " + l.text : "")));
  }

  if (externalLinks.length) {
    log("Links externos: " + externalLinks.length);
    const byHost = {};
    externalLinks.forEach(l => { if (!byHost[l.host]) byHost[l.host] = 0; byHost[l.host]++; });
    for (const [host, count] of Object.entries(byHost)) {
      info("  " + host + " (" + count + ")");
    }
  }

  // ── 2. Menu/Navegação ──
  log("");
  log("--- 2. Menu e navegação ---");
  const navElements = document.querySelectorAll("nav, [role='navigation'], .menu, .nav, .navbar, #menu, #nav, .sidebar, ul.nav");
  navElements.forEach(nav => {
    const links = nav.querySelectorAll("a[href]");
    info("Nav (" + (nav.id || nav.className || nav.tagName) + "): " + links.length + " links");
    links.forEach(a => {
      const href = a.getAttribute("href");
      info("    " + href + "  →  " + a.textContent.trim().substring(0, 50));
    });
  });

  // Procurar menu items mesmo sem nav
  const menuItems = document.querySelectorAll("li > a, .menu-item a, .nav-item a");
  if (menuItems.length && navElements.length === 0) {
    info("Menu items (li > a):");
    const seen = new Set();
    menuItems.forEach(a => {
      const href = a.getAttribute("href");
      if (href && !seen.has(href)) {
        seen.add(href);
        info("    " + href + "  →  " + a.textContent.trim().substring(0, 50));
      }
    });
  }

  // ── 3. Scripts carregados ──
  log("");
  log("--- 3. Scripts externos ---");
  const extScripts = document.querySelectorAll("script[src]");
  extScripts.forEach(s => {
    const src = s.getAttribute("src");
    info("  " + src);
  });

  // ── 4. Formulários e inputs ──
  log("");
  log("--- 4. Formulários e inputs ---");
  const forms = document.querySelectorAll("form");
  forms.forEach((f, i) => {
    info("  Form " + i + ": action=" + (f.action || "(none)") + " method=" + (f.method || "GET"));
    f.querySelectorAll("input, select, textarea").forEach(inp => {
      const type = inp.type || inp.tagName.toLowerCase();
      const name = inp.name || inp.id || "(anon)";
      const val = inp.value ? inp.value.substring(0, 30) : "";
      info("    " + type + " name=" + name + (val ? " value=" + val : ""));
    });
  });

  // Hidden fields com dados úteis
  const hiddens = document.querySelectorAll("input[type='hidden']");
  if (hiddens.length) {
    log("Campos hidden:");
    hiddens.forEach(h => {
      if (h.value && h.value.length < 200) {
        info("  " + (h.name || h.id) + " = " + h.value);
      } else if (h.value) {
        info("  " + (h.name || h.id) + " = (" + h.value.length + " chars)");
      }
    });
  }

  // ── 5. Tentar descobrir TODAS as páginas .aspx ──
  log("");
  log("--- 5. Páginas .aspx conhecidas ---");
  
  // Extrair de links, scripts, e texto da página
  const pageText = document.documentElement.innerHTML;
  const aspxPattern = /["'\/]([a-zA-Z][a-zA-Z0-9_-]*\.aspx)(?:\?[^"'\s]*)?/gi;
  const aspxPages = new Set();
  let match;
  while ((match = aspxPattern.exec(pageText)) !== null) {
    aspxPages.add(match[1].toLowerCase());
  }
  
  log("Páginas .aspx referenciadas: " + aspxPages.size);
  [...aspxPages].sort().forEach(p => info("  " + p));

  // ── 6. Testar se as páginas existem ──
  log("");
  log("--- 6. Testar existência de páginas ---");
  
  const commonPages = [
    "/pt/tournaments.aspx",
    "/pt/classifications.aspx", 
    "/pt/Classifications.aspx",
    "/pt/classif.aspx",
    "/pt/calendar.aspx",
    "/pt/results.aspx",
    "/pt/players.aspx",
    "/pt/ranking.aspx",
    "/pt/events.aspx",
    "/pt/schedule.aspx",
    "/lists/PlayerWHS.aspx",
    "/lists/PlayerResults.aspx",
    "/lists/PlayerProfile.aspx",
    "/",
    "/pt/",
    "/en/",
  ];

  // Add discovered pages
  for (const page of aspxPages) {
    commonPages.push("/pt/" + page);
    commonPages.push("/" + page);
  }

  const tested = new Set();
  for (const page of commonPages) {
    if (tested.has(page)) continue;
    tested.add(page);
    try {
      const res = await fetch(page, { method: "HEAD" });
      if (res.ok) {
        ok(page + " → " + res.status + " (" + (res.headers.get("content-type") || "") + ")");
      }
      // Don't log 404s to reduce noise
    } catch {}
  }

  // ── 7. Se estamos em tournaments.aspx, explorar mais ──
  if (location.pathname.toLowerCase().includes("tournament")) {
    log("");
    log("--- 7. Exploração de tournaments.aspx ---");
    
    // Procurar TODOS os dados na página
    // Tabela de torneios
    const allTrs = document.querySelectorAll("tr");
    log("Total linhas <tr>: " + allTrs.length);
    
    // Qualquer link com Classifications
    const classifLinks = document.querySelectorAll("a[href*='classif'], a[href*='Classif'], a[href*='classification'], a[href*='Classification']");
    log("Links para classificações: " + classifLinks.length);
    classifLinks.forEach(a => {
      info("  " + a.href + "  →  " + a.textContent.trim().substring(0, 60));
    });

    // Qualquer coisa com "Drive" ou "Aquapor" ou "Tour"
    const allText = document.body.textContent;
    const circuits = ["Drive", "DRIVE", "Aquapor", "AQUAPOR", "Tour ", "Challenge", "Campeonato", "Torneio"];
    circuits.forEach(c => {
      const count = (allText.match(new RegExp(c, "gi")) || []).length;
      if (count > 0) info("  '" + c + "' aparece " + count + " vezes na página");
    });

    // Procurar select/dropdown para filtrar por ano ou tipo
    const pageSelects = document.querySelectorAll("select, [role='listbox']");
    pageSelects.forEach(s => {
      const opts = s.options ? [...s.options].map(o => o.value + ":" + o.text).join(", ") : "(custom)";
      info("  Select #" + (s.id || s.name) + " → " + opts.substring(0, 300));
    });

    // Interceptar jQuery ajax para ver que endpoints são chamados
    if (window.jQuery) {
      log("");
      log("--- 8. Interceptar AJAX (jQuery) ---");
      log("A instalar interceptor... Interage com a página para capturar requests!");
      
      const origAjax = jQuery.ajax;
      window._capturedAjax = [];
      jQuery.ajax = function(opts) {
        const url = typeof opts === "string" ? opts : opts.url;
        const data = opts.data;
        window._capturedAjax.push({ url, data, time: new Date().toISOString() });
        console.log("%c[AJAX CAPTURADO] " + url, "color:red;font-weight:bold;font-size:12px");
        if (data) console.log("  Body:", data);
        return origAjax.apply(this, arguments);
      };
      log("Interceptor instalado! Agora:");
      log("  1. Muda o ano no dropdown");
      log("  2. Clica em filtros");
      log("  3. Navega na tabela");
      log("  Cada request AJAX vai aparecer a VERMELHO na consola");
      log("  Depois: copy(JSON.stringify(window._capturedAjax, null, 2))");
    }
  }

  // ── Guardar resultado ──
  window._siteMap = {
    site: SITE,
    page: location.pathname,
    internalLinks: Object.fromEntries(internalLinks),
    externalHosts: [...new Set(externalLinks.map(l => l.host))],
    aspxPages: [...aspxPages],
    scripts: [...extScripts].map(s => s.getAttribute("src")),
    jquery: typeof jQuery !== "undefined" ? jQuery.fn.jquery : null,
  };
  
  log("");
  log("=== FIM ===");
  log("Resultado guardado em window._siteMap");
  log("Para copiar: copy(JSON.stringify(window._siteMap, null, 2))");
})();
