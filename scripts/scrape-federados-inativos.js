/**
 * scrape-federados-inativos.js — Browser Console
 * ═══════════════════════════════════════════════════════════════
 * Descarrega a lista de federados com estado = INATIVO (e falecidos).
 * Variante de scrape-federados.js com `FedStat: "7"` em vez de "9".
 *
 * Dois modos (editar FED_STAT abaixo):
 *   - "7" → Inativo (deixaram de pagar quotas)
 *   - "5" → Falecido (arquivo histórico)
 *   - "0" → Todos (Ativo + Inativo + Falecido)
 *
 * Output: federados-inativos.json (ou ajustar OUT_NAME).
 *
 * USO:
 *   1. https://scoring.datagolf.pt/pt/FederatedsList_V2.aspx
 *   2. F12 Console → colar ficheiro inteiro → Enter
 *   3. Download automático em ~1-2 min
 *   4. Mover para public/data/ — não é servido à UI (só arquivo)
 * ═══════════════════════════════════════════════════════════════
 */
(async () => {
  "use strict";

  const FED_STAT  = "7";                              // 7=Inativo, 5=Falecido, 0=Todos
  const OUT_NAME  = "federados-inativos.json";
  const PAGE_SIZE = 100;
  const DELAY_MS  = 150;
  const ENDPOINT  = "/pt/FederatedsList_V2.aspx/HandicapsLST";

  const log  = (...a) => console.log("%c[feds-inat]", "color:#f59e0b;font-weight:700", ...a);
  const warn = (...a) => console.warn("%c[feds-inat]", "color:#dc2626;font-weight:700", ...a);

  const parseNetDate = (s) => {
    if (!s || typeof s !== "string") return null;
    const m = s.match(/^\/Date\((-?\d+)\)\/$/);
    if (!m) return null;
    const d = new Date(parseInt(m[1], 10));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };
  const DATE_FIELDS = new Set(["birthdate", "admission_date", "last_hcp_date", "dt_aniv"]);
  const normalize = (r) => {
    const out = {};
    for (const k of Object.keys(r)) out[k] = DATE_FIELDS.has(k) ? parseNetDate(r[k]) : r[k];
    return out;
  };

  const fetchPage = async (startIndex) => {
    const body = {
      name: "", fedno: "", ClubCode: "0", FedStat: FED_STAT, Gender: "0",
      Agelev: "0", HcpStat: "0", FHcp: "", THcp: "", ProAm: "0",
      IniFlag: "0", FAge: "", TAge: "", Permit: "", MaxResults: "0",
      MessMax: "Demasiados resultados",
      jtStartIndex: String(startIndex),
      jtPageSize:   String(PAGE_SIZE),
      jtSorting:    "name ASC",
    };
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    const d = j.d || j;
    if (d.Result !== "OK") throw new Error(d.Message);
    return { records: d.Records || [], total: d.TotalRecordCount };
  };

  log(`A iniciar scrape com FedStat=${FED_STAT}…`);
  const t0 = Date.now();
  const all = [];
  let total = null;
  let page = 0;

  while (true) {
    let data;
    try { data = await fetchPage(page * PAGE_SIZE); }
    catch (e) {
      warn(`Falha pág ${page}:`, e.message, "— retry em 2s");
      await new Promise(r => setTimeout(r, 2000));
      try { data = await fetchPage(page * PAGE_SIZE); }
      catch (e2) { warn("Falha dupla — aborto. Mantenho", all.length, "registos."); break; }
    }
    total = data.total;
    if (!data.records.length) break;
    for (const r of data.records) all.push(normalize(r));
    const pct = ((all.length / total) * 100).toFixed(1);
    log(`Pág ${page + 1} · ${all.length}/${total} (${pct}%) · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    page++;
    if (all.length >= total) break;
    if (DELAY_MS) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  log(`✓ Recolhidos ${all.length} de ${total} inactivos em ${elapsed}s`);

  // Estatísticas
  const byStatus = {}, byAge = {}, byClub = {};
  for (const p of all) {
    byStatus[p.federated_status] = (byStatus[p.federated_status] || 0) + 1;
    byAge[p.age_level] = (byAge[p.age_level] || 0) + 1;
    const k = p.acronym || p.club_name || "?";
    byClub[k] = (byClub[k] || 0) + 1;
  }
  console.group("%cResumo", "color:#10b981;font-weight:700");
  log("Por status:", byStatus);
  log("Por escalão:", byAge);
  log("Top 10 clubes:", Object.entries(byClub).sort((a,b)=>b[1]-a[1]).slice(0, 10));
  console.groupEnd();

  const out = {
    generated: new Date().toISOString(),
    source: "scoring.datagolf.pt/pt/FederatedsList_V2.aspx",
    fedStatFilter: FED_STAT,
    totalReported: total,
    totalScraped: all.length,
    players: all,
  };
  window.__federadosInativos = out;

  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = OUT_NAME;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  log(`📥 ${OUT_NAME} descarregado.`);
  log("Acessível em window.__federadosInativos");
})();
