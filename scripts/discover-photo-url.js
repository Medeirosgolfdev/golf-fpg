/**
 * discover-photo-url.js — Browser Console (Chrome 90)
 * ═══════════════════════════════════════════════════
 * Descobre o URL real das fotos dos federados FPG.
 *
 * COMO USAR:
 *   1. Abrir https://my.fpg.pt/Home/FederatedsList_V2.aspx no Chrome 90 (logado)
 *   2. Esperar a página carregar com a lista de handicaps
 *   3. F12 → Console
 *   4. Colar este script inteiro e Enter
 *   5. O script vai:
 *      a) Procurar imagens <img> na página e reportar os src
 *      b) Inspeccionar o DOM/CSS por background-image
 *      c) Testar URLs candidatos conhecidos
 *      d) Mostrar o URL que funciona
 *
 * Se a página não tiver fotos visíveis, navegar para:
 *   https://my.fpg.pt/Home/PlayerWHS.aspx?no=18734
 *   (jogador com photo="1/503e183d-c52c-47eb-8e0d-fe09ae646ec5.jpeg")
 *   e repetir.
 */
(async () => {
  "use strict";
  const log = (...a) => console.log("%c[photo-discover]", "color:#f59e0b;font-weight:700", ...a);

  // ── 1. Procurar <img> tags na página ──
  log("=== Fase 1: Procurar <img> na página ===");
  const imgs = document.querySelectorAll("img");
  const found = [];
  for (const img of imgs) {
    const src = img.src || img.getAttribute("src") || "";
    if (src && !src.includes("data:") && !src.includes("google") && !src.includes("analytics")) {
      found.push(src);
      log("IMG src:", src, "| size:", img.naturalWidth, "x", img.naturalHeight);
    }
  }
  if (found.length === 0) log("Nenhum <img> relevante encontrado.");

  // ── 2. Procurar background-image em CSS ──
  log("=== Fase 2: Procurar background-image ===");
  const allEls = document.querySelectorAll("*");
  for (const el of allEls) {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== "none" && !bg.includes("data:") && !bg.includes("gradient")) {
      log("BG:", bg, "| tag:", el.tagName, "| class:", el.className);
    }
  }

  // ── 3. Testar URLs candidatos com fetch ──
  log("=== Fase 3: Testar URLs candidatos ===");
  const photoPath = "1/503e183d-c52c-47eb-8e0d-fe09ae646ec5.jpeg"; // jogador 18734
  const candidates = [
    "/Home/PhotoHandler.ashx?photo=" + encodeURIComponent(photoPath),
    "/Content/Images/players/" + photoPath,
    "/Content/photos/" + photoPath,
    "/photos/" + photoPath,
    "/Uploads/" + photoPath,
    "/Uploads/photos/" + photoPath,
    "/Images/players/" + photoPath,
    "/Home/photos/" + photoPath,
    "/Handler/Photo.ashx?photo=" + encodeURIComponent(photoPath),
    "/api/photo?path=" + encodeURIComponent(photoPath),
    // scoring.fpg.pt paths
    "https://scoring.fpg.pt/lists/PhotoHandler.ashx?photo=" + encodeURIComponent(photoPath),
    "https://scoring.fpg.pt/photos/" + photoPath,
    "https://scoring.fpg.pt/Content/Images/players/" + photoPath,
    "https://scoring.fpg.pt/Uploads/" + photoPath,
    // scoring.datagolf.pt paths
    "https://scoring.datagolf.pt/pt/PhotoHandler.ashx?photo=" + encodeURIComponent(photoPath),
    "https://scoring.datagolf.pt/photos/" + photoPath,
    "https://scoring.datagolf.pt/Uploads/" + photoPath,
  ];

  for (const url of candidates) {
    try {
      const r = await fetch(url, { credentials: "include", redirect: "follow" });
      const ct = r.headers.get("content-type") || "";
      const size = r.headers.get("content-length") || "?";
      if (r.ok && ct.startsWith("image/")) {
        log("✅ ENCONTRADO!", url, "→ HTTP", r.status, "CT:", ct, "Size:", size);
      } else {
        log("  ❌", url, "→ HTTP", r.status, "CT:", ct);
      }
    } catch (e) {
      log("  ⚠️", url, "→ erro:", e.message);
    }
  }

  // ── 4. Procurar no Network tab ──
  log("=== Fase 4: Verificar manualmente ===");
  log("Se nenhum URL acima funcionou:");
  log("1. Abrir https://my.fpg.pt/Home/FederatedsList_V2.aspx");
  log("2. F12 → Network → limpar (Ctrl+L)");
  log("3. Clicar num jogador que tenha foto visível");
  log("4. Procurar no Network por requests de imagem (filter: img)");
  log("5. O URL do request é o padrão que precisamos!");
  log("");
  log("Alternativa: document.querySelector('.foto img, .player-photo img, [class*=photo] img')?.src");
  log("Ou: performance.getEntriesByType('resource').filter(r => r.name.includes('photo') || r.name.includes('jpeg'))");

  // ── 5. Tentar PerformanceObserver para recursos já carregados ──
  const resources = performance.getEntriesByType("resource");
  const photoResources = resources.filter(r =>
    r.name.includes("photo") || r.name.includes("jpeg") || r.name.includes("jpg") ||
    r.name.includes("player") || r.name.includes("avatar")
  );
  if (photoResources.length > 0) {
    log("=== Recursos de fotos já carregados ===");
    for (const r of photoResources) log(" 📸", r.name);
  }

  log("=== Fim ===");
})();
