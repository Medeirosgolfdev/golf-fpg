/**
 * console-capture-cookie.js — Browser Console Script
 * ═══════════════════════════════════════════════════════════════════
 * Captura TODOS os cookies da sessão FPG activa (visíveis + user cola
 * o ASP.NET_SessionId httpOnly) e envia automaticamente para o proxy
 * local (`http://localhost:5173/api/datagolf?action=save_cookie`).
 *
 * ─── COMO USAR ────────────────────────────────────────────────────
 *   1. `npm run dev` a correr em C:\golf-fpg (localhost:5173)
 *   2. Abre no Chrome UMA destas URLs (com login/sessão activa):
 *        • https://my.fpg.pt/Home/PlayerWHS.aspx?no=52884
 *        • https://scoring.datagolf.pt/pt/PlayerWHS.aspx?no=52884
 *   3. Confirma que vês a tabela de rondas
 *   4. F12 → Console → cola este ficheiro → Enter
 *   5. Aparece prompt pedindo o valor do ASP.NET_SessionId
 *      (que copias de DevTools → Application → Cookies)
 *   6. ✓ Cookies enviados e gravados em api/.datagolf-cookies.json
 *
 * Uma vez feito, o proxy usa estes cookies no fallback direct-to-FPG.
 * ═══════════════════════════════════════════════════════════════════
 */
(async () => {
  "use strict";

  const log  = (...a) => console.log("%c[fpg-cookie]", "color:#0a84ff;font-weight:700", ...a);
  const warn = (...a) => console.warn("%c[fpg-cookie]", "color:#f59e0b;font-weight:700", ...a);
  const err  = (...a) => console.error("%c[fpg-cookie]", "color:#dc2626;font-weight:700", ...a);

  const host = location.hostname;
  if (!["my.fpg.pt", "scoring.datagolf.pt"].includes(host)) {
    err(`Host não suportado: ${host}. Abre PlayerWHS.aspx em my.fpg.pt ou scoring.datagolf.pt.`);
    return;
  }
  log(`Host: ${host}`);

  /* ── Validar sessão activa ── */
  try {
    const parent = document.querySelector(".jtable-main-container")?.parentElement;
    const jt = jQuery.data(parent, "hik-jtable");
    const la = jt?.options?.actions?.listAction;
    if (!la) throw new Error("listAction não encontrado");
    const u = new URL(la, location.href);
    const extraParams = {};
    for (const [k, v] of u.searchParams) if (!k.startsWith("jt")) extraParams[k] = v;
    const r = await fetch(u.pathname + u.search, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ ...extraParams, jtStartIndex: "0", jtPageSize: "1" }),
    });
    const j = await r.json();
    if ((j.d || j).Result !== "OK") throw new Error("sessão não activa");
    log(`✓ Sessão activa — ${(j.d || j).TotalRecordCount} rondas`);
  } catch (e) {
    err(`Sessão não activa: ${e.message}. Faz refresh à página.`);
    return;
  }

  /* ── Capturar todos os cookies visíveis ── */
  const visible = await cookieStore.getAll();
  const parts = visible.map(c => `${c.name}=${c.value}`);
  log(`✓ ${visible.length} cookies visíveis: ${visible.map(c => c.name).join(", ")}`);

  /* ── Pedir ASP.NET_SessionId (httpOnly) ── */
  const aspnetVal = prompt(
    "Cola o VALOR do ASP.NET_SessionId (sem o nome).\n\n" +
    "Onde encontrar: DevTools → Application → Cookies → " + host + "\n" +
    "Dupla-clica na coluna Value do ASP.NET_SessionId → Ctrl+C → cola aqui.\n\n" +
    "Ex: 0x2krce1nq5ulmfnww1havqd"
  );
  if (!aspnetVal || !aspnetVal.trim()) {
    warn("Sem ASP.NET_SessionId — a gravar apenas os visíveis (pode não funcionar).");
  } else {
    parts.push(`ASP.NET_SessionId=${aspnetVal.trim()}`);
    log(`✓ ASP.NET_SessionId adicionado`);
  }

  const cookieHeader = parts.join("; ");
  log(`Cookie header: ${parts.length} cookies, ${cookieHeader.length} chars`);

  /* ── Enviar para o proxy local ── */
  const proxyUrl = "http://localhost:5173/api/datagolf?action=save_cookie";
  try {
    const r = await fetch(proxyUrl, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host, cookieHeader }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    log(`✓ Cookies gravados em api/.datagolf-cookies.json`);
    log(`  Cookies: ${j.cookies.join(", ")}`);
  } catch (e) {
    err(`Falha a enviar para proxy local: ${e.message}`);
    err(`Verifica que \`npm run dev\` está a correr em C:\\golf-fpg`);
    // Fallback: download manual
    const blob = new Blob([JSON.stringify({ host, cookieHeader, source: "manual" }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "datagolf-cookies.json";
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    log(`ℹ Fallback: download iniciado. Renomeia para .datagolf-cookies.json e move para api/`);
    return;
  }

  /* ── Testar se funciona ── */
  log("\n🧪 A testar...");
  try {
    const r = await fetch("http://localhost:5173/api/datagolf?action=force_datagolf&fed=52884");
    const j = await r.json();
    if (j.ok) log(`✅ FUNCIONOU! ${j.data?.length} rondas devolvidas pelo datagolf directo.`);
    else err(`⚠ Ainda falha: ${j.error?.slice(0, 200)}`);
  } catch (e) {
    err(`Teste falhou: ${e.message}`);
  }
})();
