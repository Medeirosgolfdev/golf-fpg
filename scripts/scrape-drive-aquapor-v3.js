/*
 * scrape-drive-aquapor-v3.js
 * Cola em: https://scoring.datagolf.pt/pt/tournaments.aspx
 */
(async () => {
  const log  = (m) => console.log("%c[DRIVE] " + m, "color:#2563eb;font-weight:bold");
  const ok   = (m) => console.log("%c[DRIVE] ✓ " + m, "color:green;font-weight:bold");
  const warn = (m) => console.log("%c[DRIVE] ⚠ " + m, "color:orange;font-weight:bold");
  const info = (m) => console.log("%c[DRIVE]   " + m, "color:#6366f1");
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  log("═══ Extrator DRIVE + AQUAPOR 2026 (v3) ═══");

  async function tournSearch(TournName, startIndex) {
    const body = {
      ClubCode: "0", dtIni: "", dtFim: "",
      CourseName: "", TournCode: "",
      TournName: TournName || "",
      jtStartIndex: String(startIndex || 0),
      jtPageSize: "50",
      jtSorting: "started_at DESC",
    };
    const qs = "jtStartIndex=" + body.jtStartIndex + "&jtPageSize=50&jtSorting=" + encodeURIComponent(body.jtSorting);
    const res = await fetch("tournaments.aspx/TournamentsLST?" + qs, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    const d = json.d || json;
    return { records: d.Records || [], total: d.TotalRecordCount || 0 };
  }

  async function tournSearchAll(TournName) {
    const first = await tournSearch(TournName, 0);
    const all = [...first.records];
    log("  " + TournName + ": " + first.total + " total, página 1/" + Math.ceil(first.total/50));
    let offset = 50;
    while (offset < first.total) {
      await sleep(200);
      const page = await tournSearch(TournName, offset);
      all.push(...page.records);
      log("  página " + (offset/50+1) + "/" + Math.ceil(first.total/50) + " (" + all.length + " acum)");
      offset += 50;
    }
    return all;
  }

  const is2026 = (r) => {
    const ms = parseInt((r.started_at || "").match(/\d+/)?.[0] || "0");
    return new Date(ms).getFullYear() === 2026;
  };

  // ── DRIVE ──
  log("PASSO 1a: Buscar DRIVE (todas as páginas)...");
  const driveAll = await tournSearchAll("drive");
  const drive = driveAll.filter(is2026).filter(r => (r.acronym || "").startsWith("FPG_D"));
  ok("DRIVE 2026: " + drive.length + " torneios (de " + driveAll.length + " total)");

  // ── AQUAPOR ──
  log("PASSO 1b: Buscar AQUAPOR...");
  const aquaporAll = await tournSearchAll("aquapor");
  const aquapor = aquaporAll.filter(is2026);
  ok("AQUAPOR 2026: " + aquapor.length + " torneios (de " + aquaporAll.length + " total)");

  // ── Resumo ──
  log("");
  drive.forEach(r => info(r.club_code + "/" + r.code + " " + r.description));
  aquapor.forEach(r => info(r.club_code + "/" + r.code + " " + r.description));

  window._drive2026 = drive;
  window._aquapor2026 = aquapor;

  // ── PASSO 2: Testar ClassifLST ──
  log("");
  log("PASSO 2: Testar classificação...");

  const testT = drive.find(r => parseInt((r.started_at||"").match(/\d+/)?.[0]||"0") < Date.now()) || drive[0] || aquapor[0];
  if (!testT) { warn("Sem torneio para testar!"); return; }

  const cc = testT.club_code, tc = testT.code;
  log("  Teste: " + cc + "/" + tc + " — " + testT.description);

  const ENDPOINTS = [
    "Classifications.aspx/ClassifLST",
    "Classifications.aspx/ClassificationsLST",
    "Classifications.aspx/TournClassifLST",
  ];

  let foundEP = null, sample = null;

  for (const ep of ENDPOINTS) {
    try {
      info("→ " + ep);
      const res = await fetch(ep + "?jtStartIndex=0&jtPageSize=50", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ ccode: cc, tcode: tc, classif_order: "2", jtStartIndex: "0", jtPageSize: "50", jtSorting: "position ASC" }),
      });
      if (!res.ok) { info("  HTTP " + res.status); continue; }
      const json = await res.json();
      const d = json.d || json;
      if (d.Result === "OK" && d.Records) {
        foundEP = ep;
        sample = d.Records[0] || null;
        ok(ep + " → " + d.Records.length + " jogadores");
        if (sample) {
          log("  Campos: " + Object.keys(sample).join(", "));
          console.log(JSON.stringify(sample, null, 2));
        }
        break;
      }
      info("  Result=" + (d.Result||"?") + " Recs=" + (d.Records?.length ?? "null"));
    } catch (e) { info("  Erro: " + e.message); }
  }

  if (!foundEP) {
    warn("ClassifLST não encontrado! Abre o Network tab e vai a:");
    warn("  https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=" + cc + "&tcode=" + tc + "&classif_order=2");
  }

  window._classifEndpoint = foundEP;
  window._classifSample = sample;

  log("");
  log("═══ RESULTADO ═══");
  log("  DRIVE 2026: " + drive.length);
  log("  AQUAPOR 2026: " + aquapor.length);
  log("  ClassifLST: " + (foundEP || "❌"));
  if (sample) ok("Partilha o sample record acima para avançarmos.");
  log("═════════════════");
})();
