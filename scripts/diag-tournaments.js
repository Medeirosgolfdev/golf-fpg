/*
 * EXPLORAR TORNEIOS — Descobre todos os torneios de 2026
 * 
 * Cola em: https://scoring.datagolf.pt/pt/tournaments.aspx
 *
 * O que faz:
 * 1. Inspecciona o HTML da página para encontrar dados
 * 2. Tenta vários endpoints API possíveis
 * 3. Procura tabelas jtable / elementos com dados
 * 4. Lista tudo o que encontrar com ccode/tcode
 */
(async () => {
  const log = (m) => console.log("%c[TOURN] " + m, "color:#16a34a;font-weight:bold");
  const ok = (m) => console.log("%c[TOURN] ✓ " + m, "color:green;font-weight:bold");
  const info = (m) => console.log("%c[TOURN] " + m, "color:#6366f1");
  const warn = (m) => console.log("%c[TOURN] ⚠ " + m, "color:orange");

  log("=== Explorar Torneios 2026 ===");
  log("Site: " + location.host);
  log("URL: " + location.href);

  // ── 1. Inspecionar HTML ──
  log("");
  log("--- 1. Elementos da página ---");
  
  // Procurar tabelas
  const tables = document.querySelectorAll("table");
  log("Tabelas: " + tables.length);
  tables.forEach((t, i) => {
    const rows = t.querySelectorAll("tr");
    const id = t.id || t.className || "(sem id)";
    info("  Tabela " + i + ": " + id + " (" + rows.length + " linhas)");
  });

  // Procurar divs jtable
  const jtables = document.querySelectorAll("[class*='jtable'], [id*='jtable'], [class*='jTable']");
  log("jTables: " + jtables.length);
  jtables.forEach((el) => info("  " + el.tagName + "#" + el.id + " ." + el.className));

  // Procurar divs com dados de torneios
  const allDivs = document.querySelectorAll("div[id]");
  const relevantDivs = [...allDivs].filter(d => 
    d.id.toLowerCase().includes("tourn") || 
    d.id.toLowerCase().includes("compet") ||
    d.id.toLowerCase().includes("event") ||
    d.id.toLowerCase().includes("calendar") ||
    d.id.toLowerCase().includes("list")
  );
  if (relevantDivs.length) {
    log("Divs relevantes:");
    relevantDivs.forEach(d => info("  #" + d.id + " (" + d.children.length + " filhos)"));
  }

  // ── 2. Procurar links com ccode/tcode ──
  log("");
  log("--- 2. Links com ccode/tcode ---");
  const allLinks = document.querySelectorAll("a[href*='ccode'], a[href*='tcode']");
  const tournLinks = new Map();
  allLinks.forEach(a => {
    const href = a.href;
    const ccodeM = href.match(/ccode=(\d+)/);
    const tcodeM = href.match(/tcode=(\d+)/);
    if (ccodeM && tcodeM) {
      const key = ccodeM[1] + "-" + tcodeM[1];
      if (!tournLinks.has(key)) {
        tournLinks.set(key, { ccode: ccodeM[1], tcode: tcodeM[1], text: a.textContent.trim().substring(0, 80), href });
      }
    }
  });
  log("Encontrados: " + tournLinks.size + " torneios via links");
  for (const [key, t] of tournLinks) {
    info("  ccode=" + t.ccode + " tcode=" + t.tcode + " → " + t.text);
  }

  // ── 3. Procurar dados em scripts inline ──
  log("");
  log("--- 3. Dados em scripts ---");
  const scripts = document.querySelectorAll("script:not([src])");
  let foundData = false;
  scripts.forEach((s, i) => {
    const text = s.textContent;
    if (text.includes("tcode") || text.includes("ccode") || text.includes("tournament") || text.includes("jtable")) {
      info("  Script " + i + ": " + text.substring(0, 200).replace(/\n/g, " ") + "...");
      foundData = true;
    }
  });
  if (!foundData) info("  Nenhum script inline com dados de torneios");

  // ── 4. Testar endpoints API ──
  log("");
  log("--- 4. Testar endpoints API ---");

  const tryPost = async (label, url, body) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body)
      });
      if (!res.ok) { info("  " + label + " → HTTP " + res.status); return null; }
      const json = await res.json();
      const d = json.d || json;
      if (d.Result === "OK" || d.Records || Array.isArray(d)) {
        const records = d.Records || d;
        ok("  " + label + " → " + (Array.isArray(records) ? records.length : "OK") + " registos");
        return d;
      }
      info("  " + label + " → " + JSON.stringify(d).substring(0, 100));
      return d;
    } catch (e) {
      info("  " + label + " → " + e.message);
      return null;
    }
  };

  // Variações de endpoints possíveis
  const baseUrls = [
    "/pt/tournaments.aspx/",
    "/pt/Tournaments.aspx/",
    "tournaments.aspx/",
    "/pt/torneios.aspx/",
  ];
  const methods = [
    "TournamentsLST", "TournamentLST", "GetTournaments", "ListTournaments",
    "TournamentListLST", "CompetitionsLST", "EventsLST",
  ];
  const bodies = [
    { jtStartIndex: 0, jtPageSize: 200, jtSorting: "" },
    { jtStartIndex: 0, jtPageSize: 200, jtSorting: "", year: "2026" },
    { jtStartIndex: 0, jtPageSize: 200, jtSorting: "", season: "2026" },
    { year: "2026" },
    {},
  ];

  let apiResult = null;
  for (const base of baseUrls) {
    for (const method of methods) {
      for (const body of bodies) {
        const r = await tryPost(base + method, base + method, body);
        if (r?.Records?.length > 0 || (Array.isArray(r) && r.length > 0)) {
          apiResult = r;
          ok("  ^^^ ENCONTRADO! ^^^");
          break;
        }
      }
      if (apiResult) break;
    }
    if (apiResult) break;
  }

  // ── 5. Se encontrou dados via API, mostrar ──
  if (apiResult) {
    log("");
    log("--- 5. Torneios encontrados via API ---");
    const records = apiResult.Records || apiResult;
    if (Array.isArray(records)) {
      log("Total: " + records.length);
      // Mostrar campos do primeiro registo
      if (records[0]) {
        log("Campos: " + Object.keys(records[0]).join(", "));
        log("Exemplo completo:");
        console.log(records[0]);
      }
      // Filtrar 2026
      const r2026 = records.filter(r => {
        const str = JSON.stringify(r);
        return str.includes("2026") || str.includes("26");
      });
      log("Com '2026': " + r2026.length);
      r2026.forEach(r => {
        const name = r.tournament_name || r.name || r.description || r.title || JSON.stringify(r).substring(0, 60);
        const cc = r.club_code || r.ccode || r.tclub || "";
        const tc = r.tournament_code || r.tcode || r.code || "";
        info("  [" + cc + "/" + tc + "] " + name);
      });
    }
  }

  // ── 6. Alternativa: Ler a tabela HTML visível ──
  log("");
  log("--- 6. Dados da tabela HTML visível ---");
  // Procurar a tabela principal com dados
  const mainTable = document.querySelector("table.jtable-data-table, table[id*='table'], .jtable tbody");
  if (mainTable) {
    const rows = mainTable.querySelectorAll("tr");
    log("Linhas na tabela: " + rows.length);
    rows.forEach((row, i) => {
      if (i > 20) return; // máx 20
      const cells = row.querySelectorAll("td");
      if (cells.length > 0) {
        const text = [...cells].map(c => c.textContent.trim()).join(" | ");
        info("  " + text.substring(0, 120));
      }
    });
  } else {
    info("  Nenhuma tabela principal encontrada");
    // Tentar ler qualquer conteúdo visível
    const content = document.querySelector(".content, .main, #content, #main, .container");
    if (content) {
      info("  Conteúdo principal (" + content.children.length + " filhos):");
      info("  " + content.textContent.substring(0, 500).replace(/\s+/g, " "));
    }
  }

  // ── 7. Verificar dropdowns/selects ──
  log("");
  log("--- 7. Selectores e dropdowns ---");
  const selects = document.querySelectorAll("select");
  selects.forEach(s => {
    const opts = [...s.options].map(o => o.value + ":" + o.text).join(", ");
    info("  #" + s.id + " → " + opts.substring(0, 200));
  });

  // ── 8. Interceptar AJAX futuro ──
  log("");
  log("--- 8. Dica ---");
  log("Se a página carrega dados por AJAX ao interagir:");
  log("  1. Abre Network tab no F12");
  log("  2. Filtra por XHR/Fetch");
  log("  3. Navega na página (muda ano, filtra, etc.)");
  log("  4. Vê os requests que aparecem");
  log("");
  log("=== FIM ===");

  // Guardar resultados para fácil cópia
  window._diagResult = {
    site: location.host,
    url: location.href,
    tournLinks: Object.fromEntries(tournLinks),
    apiResult,
    tableCount: tables.length,
    jqueryVersion: typeof jQuery !== "undefined" ? jQuery.fn.jquery : null
  };
  log("Resultados guardados em window._diagResult");
  log("Para copiar: copy(JSON.stringify(window._diagResult, null, 2))");
})();
