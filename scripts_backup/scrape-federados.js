/**
 * scrape-federados.js — Browser Console
 * ═══════════════════════════════════════════════════════════════
 * Descarrega a lista COMPLETA de federados FPG (~15.600 jogadores).
 *
 * COMO USAR:
 *   1. Abrir https://scoring.datagolf.pt/pt/FederatedsList_V2.aspx
 *      (a página carrega com a lista de handicaps — já com sessão)
 *   2. F12 → Console
 *   3. Colar este ficheiro inteiro e Enter
 *   4. Aguardar ~2 minutos (progresso mostrado na consola)
 *   5. Download automático de `federados.json`
 *   6. Mover para `public/data/federados.json`
 *
 * NOTAS:
 *   - Endpoint: POST /pt/FederatedsList_V2.aspx/HandicapsLST (ASP.NET PageMethod)
 *   - Limite do servidor: jtPageSize máximo ~100 (200+ devolve HTTP 500)
 *   - Cookies de sessão obtidos automaticamente do browser (credentials:"include")
 *   - Dados em bruto: 32 campos por jogador (inc. birthdate, admission_date,
 *     club_code, country, hcp_index, photo, etc.)
 *
 * OPÇÕES (editar no topo):
 *   PAGE_SIZE  — tamanho de cada página (default 100)
 *   DELAY_MS   — pausa entre calls para não sobrecarregar (default 150ms)
 *   MAX_PAGES  — limite de páginas para debug (default Infinity)
 *   DOWNLOAD   — gravar ficheiro JSON (default true)
 * ═══════════════════════════════════════════════════════════════
 */
(async () => {
  "use strict";

  const PAGE_SIZE = 100;
  const DELAY_MS  = 150;
  const MAX_PAGES = Infinity;
  const DOWNLOAD  = true;
  const OUT_NAME  = "federados.json";

  const ENDPOINT = "/pt/FederatedsList_V2.aspx/HandicapsLST";

  const log = (...a) => console.log("%c[federados]", "color:#0a84ff;font-weight:700", ...a);
  const warn = (...a) => console.warn("%c[federados]", "color:#f59e0b;font-weight:700", ...a);

  // ── .NET /Date(ms)/ → ISO YYYY-MM-DD ──────────────────────────
  const parseNetDate = (s) => {
    if (!s || typeof s !== "string") return null;
    const m = s.match(/^\/Date\((-?\d+)\)\/$/);
    if (!m) return null;
    const d = new Date(parseInt(m[1], 10));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };

  // ── Fetch de uma página ───────────────────────────────────────
  const fetchPage = async (startIndex, pageSize) => {
    const body = {
      name: "", fedno: "", ClubCode: "0", FedStat: "9", Gender: "0",
      Agelev: "0", HcpStat: "0", FHcp: "", THcp: "", ProAm: "0",
      IniFlag: "0", FAge: "", TAge: "", Permit: "", MaxResults: "0",
      MessMax: "Demasiados resultados. Por favor refine a pesquisa.",
      jtStartIndex: String(startIndex),
      jtPageSize:   String(pageSize),
      jtSorting:    "name ASC",
    };
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify(body),
      credentials: "include",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} @ startIndex=${startIndex}`);
    const json = await res.json();
    const d = json.d || json;
    if (d.Result !== "OK") throw new Error(`Result=${d.Result} msg=${d.Message}`);
    return { records: d.Records || [], total: d.TotalRecordCount };
  };

  // ── Normalizar registo — preservar os 32 campos originais,
  //    apenas converter as datas .NET (/Date(ms)/) para ISO.
  //    `encryptedfedcode` é mantido (pode servir para URLs de
  //    páginas individuais do jogador — a investigar).
  const DATE_FIELDS = new Set(["birthdate", "admission_date", "last_hcp_date", "dt_aniv"]);
  const normalize = (r) => {
    const out = {};
    for (const k of Object.keys(r)) {
      out[k] = DATE_FIELDS.has(k) ? parseNetDate(r[k]) : r[k];
    }
    return out;
  };

  // ── Loop principal ────────────────────────────────────────────
  log("A iniciar…");
  const t0 = Date.now();
  const all = [];
  let total = null;
  let page = 0;

  while (page < MAX_PAGES) {
    const startIndex = page * PAGE_SIZE;
    let data;
    try {
      data = await fetchPage(startIndex, PAGE_SIZE);
    } catch (e) {
      warn(`Falha na página ${page} (${startIndex}):`, e.message, "— a tentar novamente em 2s");
      await new Promise(r => setTimeout(r, 2000));
      try {
        data = await fetchPage(startIndex, PAGE_SIZE);
      } catch (e2) {
        warn(`Falha dupla — a abortar. Mantenho ${all.length} registos recolhidos.`);
        break;
      }
    }
    total = data.total;
    if (!data.records.length) break;
    for (const r of data.records) all.push(normalize(r));

    const pct = ((all.length / total) * 100).toFixed(1);
    log(`Página ${page + 1} · ${all.length}/${total} (${pct}%) · ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    page++;
    if (all.length >= total) break;
    if (DELAY_MS) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  log(`✓ Recolhidos ${all.length} de ${total} federados em ${elapsed}s (${page} páginas)`);

  // ── Estatísticas resumo ───────────────────────────────────────
  const byAge = {}, byCountry = {}, byGender = { M: 0, F: 0 };
  let withBirthdate = 0;
  for (const p of all) {
    byAge[p.age_level] = (byAge[p.age_level] || 0) + 1;
    byCountry[p.country_prefix] = (byCountry[p.country_prefix] || 0) + 1;
    if (p.gender) byGender[p.gender] = (byGender[p.gender] || 0) + 1;
    if (p.birthdate) withBirthdate++;
  }
  console.group("%cResumo", "color:#10b981;font-weight:700");
  log("Por escalão:", byAge);
  log("Por país:", byCountry);
  log("Por género:", byGender);
  log(`Com data de nascimento: ${withBirthdate} / ${all.length}`);
  console.groupEnd();

  // ── Output final ──────────────────────────────────────────────
  const out = {
    generated: new Date().toISOString(),
    source: "scoring.datagolf.pt/pt/FederatedsList_V2.aspx",
    totalReported: total,
    totalScraped: all.length,
    players: all,
  };

  window.__federados = out;   // acessível via consola para debug

  if (DOWNLOAD) {
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = OUT_NAME;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    log(`📥 ${OUT_NAME} descarregado.`);
  }

  log("Acessível em window.__federados");
  return { total: all.length, elapsed };
})();
