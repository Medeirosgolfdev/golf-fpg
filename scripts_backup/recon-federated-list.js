/**
 * recon-federated-list.js — Browser Console
 * ═══════════════════════════════════════════════════════════════
 * Cola em F12 Console em:
 *   https://scoring.datagolf.pt/pt/FederatedsList_V2.aspx
 *
 * OBJECTIVO: reconhecimento da página antes de escrever scraper.
 *   - Identifica tabela principal e colunas
 *   - Conta linhas visíveis
 *   - Detecta paginação / filtros / dropdowns
 *   - Intercepta XHR/fetch durante 15s para descobrir endpoints AJAX
 *   - Extrai ViewState se for postback ASP.NET
 *   - Imprime amostra de 3 linhas
 *
 * NÃO faz requests nem grava nada. Só observa.
 * ═══════════════════════════════════════════════════════════════
 */
(() => {
  const log = (...a) => console.log("%c[recon]", "color:#0a84ff;font-weight:700", ...a);
  const grp = (n) => console.group("%c" + n, "color:#d946ef;font-weight:700");
  const end = () => console.groupEnd();

  // ── 1. Tabelas ────────────────────────────────────────────────
  grp("1. Tabelas detectadas");
  const tables = [...document.querySelectorAll("table")];
  log("Total:", tables.length);
  tables.forEach((t, i) => {
    const rows = t.querySelectorAll("tr");
    const headers = [...t.querySelectorAll("th, thead td")].map(x => x.innerText.trim()).filter(Boolean);
    log(`  Tabela #${i}: id="${t.id}" rows=${rows.length} headers=[${headers.join(" | ")}]`);
  });
  end();

  // ── 2. Tabela principal (maior) ──────────────────────────────
  grp("2. Tabela principal (mais linhas)");
  const main = tables.sort((a, b) => b.querySelectorAll("tr").length - a.querySelectorAll("tr").length)[0];
  if (!main) { log("Nenhuma tabela"); end(); }
  else {
    log("ID:", main.id);
    log("Classes:", main.className);
    const rows = [...main.querySelectorAll("tbody tr, tr")].filter(r => r.querySelector("td"));
    log("Linhas de dados:", rows.length);
    if (rows[0]) {
      log("Colunas na primeira linha:", rows[0].querySelectorAll("td").length);
      rows.slice(0, 3).forEach((r, i) => {
        const cells = [...r.querySelectorAll("td")].map(c => c.innerText.trim());
        log(`  Linha ${i}:`, cells);
      });
    }
    end();
  }

  // ── 3. Filtros / dropdowns ────────────────────────────────────
  grp("3. Filtros / dropdowns / inputs");
  const selects = [...document.querySelectorAll("select")];
  log("Selects:", selects.length);
  selects.forEach(s => log(`  ${s.id || "?"} → ${s.options.length} opções (seleccionado: "${s.value}")`));
  const inputs = [...document.querySelectorAll("input[type=text], input[type=search]")];
  log("Text inputs:", inputs.length);
  inputs.forEach(i => log(`  ${i.id || i.name || "?"}`));
  end();

  // ── 4. Paginação ──────────────────────────────────────────────
  grp("4. Paginação");
  const pagLinks = [...document.querySelectorAll("a")].filter(a =>
    /page|próx|anterior|next|prev|\d+/i.test(a.innerText.trim()) && a.href.includes("javascript:") || a.href.includes("Page$"));
  log("Possíveis links de paginação:", pagLinks.length);
  pagLinks.slice(0, 10).forEach(a => log(`  "${a.innerText.trim()}" → ${a.href.slice(0, 80)}`));
  // DataTables?
  if (window.jQuery && jQuery.fn.DataTable) {
    log("⚠ DataTables presente!");
    jQuery(".dataTable").each((i, t) => {
      const dt = jQuery(t).DataTable();
      log(`  DataTable #${i}: ${dt.data().count()} rows no buffer`);
    });
  }
  end();

  // ── 5. ASP.NET ViewState ──────────────────────────────────────
  grp("5. ASP.NET");
  const vs = document.querySelector("#__VIEWSTATE");
  const ev = document.querySelector("#__EVENTVALIDATION");
  log("ViewState:", vs ? `${vs.value.length} chars` : "—");
  log("EventValidation:", ev ? `${ev.value.length} chars` : "—");
  const form = document.querySelector("form");
  log("Form action:", form?.action || "—");
  end();

  // ── 6. Interceptar XHR/fetch durante 15s ─────────────────────
  grp("6. Monitor de network (15s) — interage com a página agora");
  const captured = [];
  const origFetch = window.fetch;
  window.fetch = function(...args) {
    captured.push({ type: "fetch", url: String(args[0]).slice(0, 200), t: Date.now() });
    return origFetch.apply(this, args);
  };
  const origXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    captured.push({ type: "xhr", method, url: url.slice(0, 200), t: Date.now() });
    return origXhrOpen.apply(this, arguments);
  };
  log("A monitorizar... muda de página, aplica filtros, etc. Resultado em 15s.");
  setTimeout(() => {
    window.fetch = origFetch;
    XMLHttpRequest.prototype.open = origXhrOpen;
    console.group("%c→ Resultado do monitor", "color:#10b981;font-weight:700");
    log("Total requests:", captured.length);
    captured.forEach(c => log(`  [${c.type}]`, c.method || "GET", c.url));
    console.groupEnd();
  }, 15000);
  end();

  // ── 7. Contadores visíveis ────────────────────────────────────
  grp("7. Texto com contadores (\"total\", \"federados\", números grandes)");
  const bodyText = document.body.innerText;
  const totalMatches = bodyText.match(/(\d[\d.,]{3,})\s*(federad|jogador|total|registr|resultad)/gi);
  log("Matches:", totalMatches?.slice(0, 5) || "—");
  end();

  log("✓ Reconhecimento inicial completo. Aguarda 15s pelo monitor de network.");
})();
