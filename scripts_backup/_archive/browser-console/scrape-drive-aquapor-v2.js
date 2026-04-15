/*
 * scrape-drive-aquapor-v2.js — Extrator DRIVE + AQUAPOR 2026
 * Cola em: https://scoring.datagolf.pt/pt/tournaments.aspx
 *
 * PASSO 1: Descobre torneios 2026 (com filtro de data — rápido!)
 * PASSO 2: Testa endpoint de classificação
 * 
 * v2: Usa dtIni/dtFim para filtrar 2026, log de progresso
 */
(async () => {
  const log  = (m) => console.log("%c[DRIVE] " + m, "color:#2563eb;font-weight:bold");
  const ok   = (m) => console.log("%c[DRIVE] ✓ " + m, "color:green;font-weight:bold");
  const warn = (m) => console.log("%c[DRIVE] ⚠ " + m, "color:orange;font-weight:bold");
  const info = (m) => console.log("%c[DRIVE]   " + m, "color:#6366f1");
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  log("═══ Extrator DRIVE + AQUAPOR 2026 (v2) ═══");

  // ── Helper: buscar torneios com paginação + filtro de data ──
  async function tournSearch(TournName, startIndex) {
    const body = {
      ClubCode: "0",
      dtIni: "01/01/2026",  // ← filtra 2026!
      dtFim: "31/12/2026",
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
    info("Página 1: " + first.records.length + " de " + first.total + " total");
    let offset = 50;
    while (offset < first.total) {
      await sleep(200);
      const page = await tournSearch(TournName, offset);
      all.push(...page.records);
      info("Página " + (offset/50 + 1) + ": +" + page.records.length + " (acum: " + all.length + ")");
      offset += 50;
    }
    return all;
  }

  // ── PASSO 1: Descobrir torneios ──
  log("PASSO 1: Descobrir torneios 2026...");

  log("  Buscar DRIVE 2026...");
  const driveAll = await tournSearchAll("drive");
  // Remover falsos positivos (ex: "Captain's Drive in")
  const drive = driveAll.filter(r => (r.acronym || "").startsWith("FPG_D"));
  ok("DRIVE 2026: " + drive.length + " torneios" + (driveAll.length > drive.length ? " (excluídos " + (driveAll.length - drive.length) + " falsos positivos)" : ""));

  log("  Buscar AQUAPOR 2026...");
  const aquapor = await tournSearchAll("aquapor");
  ok("AQUAPOR 2026: " + aquapor.length + " torneios");

  // ── Mostrar resumo ──
  log("");
  log("═══ TORNEIOS ENCONTRADOS ═══");
  drive.forEach(r => info(r.club_code + "/" + r.code + " " + r.description));
  log("---");
  aquapor.forEach(r => info(r.club_code + "/" + r.code + " " + r.description));

  // Guardar para próximo passo
  window._drive2026 = drive;
  window._aquapor2026 = aquapor;

  // ── PASSO 2: Testar ClassifLST ──
  log("");
  log("PASSO 2: Testar endpoint de classificação...");

  const testT = drive.find(r => {
    const ms = parseInt((r.started_at || "").match(/\d+/)?.[0] || "0");
    return ms < Date.now(); // torneio já passado
  }) || drive[0] || aquapor[0];

  if (!testT) { warn("Nenhum torneio para testar!"); return; }

  const cc = testT.club_code, tc = testT.code;
  log("  Teste com: " + cc + "/" + tc + " — " + testT.description);

  const ENDPOINTS = [
    "Classifications.aspx/ClassifLST",
    "Classifications.aspx/ClassificationsLST",
    "Classifications.aspx/TournClassifLST",
  ];

  let foundEndpoint = null;
  let sampleRecord = null;

  for (const ep of ENDPOINTS) {
    try {
      info("Testar " + ep + "...");
      const res = await fetch(ep + "?jtStartIndex=0&jtPageSize=50", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          ccode: cc, tcode: tc, classif_order: "2",
          jtStartIndex: "0", jtPageSize: "50", jtSorting: "position ASC",
        }),
      });

      if (!res.ok) { info("  → HTTP " + res.status); continue; }

      const json = await res.json();
      const d = json.d || json;

      if (d.Result === "OK" && d.Records) {
        foundEndpoint = ep;
        sampleRecord = d.Records[0] || null;
        ok("Endpoint OK: " + ep + " → " + d.Records.length + " jogadores");
        if (sampleRecord) {
          log("  Campos disponíveis:");
          console.log(Object.keys(sampleRecord));
          log("  Exemplo completo:");
          console.log(JSON.stringify(sampleRecord, null, 2));
        }
        break;
      } else {
        info("  → Result: " + (d.Result || "?") + ", Records: " + (d.Records?.length ?? "null"));
      }
    } catch (e) {
      info("  → Erro: " + e.message);
    }
  }

  if (!foundEndpoint) {
    warn("Nenhum endpoint ClassifLST funcionou!");
    warn("Abre esta página e verifica o Network tab:");
    warn("  https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=" + cc + "&tcode=" + tc + "&classif_order=2");
    warn("Procura por POST requests com 'Classif' no nome.");
  }

  window._classifEndpoint = foundEndpoint;
  window._classifSample = sampleRecord;

  log("");
  log("═══════════════════════════════════");
  log("RESULTADO:");
  log("  DRIVE: " + drive.length + " torneios");
  log("  AQUAPOR: " + aquapor.length + " torneios");
  log("  ClassifLST: " + (foundEndpoint || "NÃO ENCONTRADO"));
  log("");
  if (foundEndpoint && sampleRecord) {
    ok("Tudo pronto! Cola o output do sample record aqui para avançarmos.");
  } else if (foundEndpoint) {
    ok("Endpoint encontrado mas torneio teste sem dados. Podemos avançar.");
  } else {
    warn("Precisamos do endpoint correcto antes de avançar.");
  }
  log("═══════════════════════════════════");
})();
