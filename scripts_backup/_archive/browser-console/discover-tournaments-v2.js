/*
 * DESCOBRIR TODOS OS TORNEIOS (v2)
 * Cola em: https://scoring.datagolf.pt/pt/tournaments.aspx
 *
 * Replica o formato EXACTO do AJAX capturado
 */
(async () => {
  const log = (m) => console.log("%c[DISC] " + m, "color:#2563eb;font-weight:bold");
  const ok = (m) => console.log("%c[DISC] ✓ " + m, "color:green;font-weight:bold");
  const info = (m) => console.log("%c[DISC]   " + m, "color:#6366f1");

  log("=== Descobrir Torneios v2 ===");

  // Helper: replica EXACTAMENTE o formato do jQuery jtable
  async function search(TournName, startIndex) {
    const idx = String(startIndex || 0);
    const size = "50";
    const sort = "started_at DESC";
    
    const qs = "jtStartIndex=" + idx + "&jtPageSize=" + size + "&jtSorting=" + encodeURIComponent(sort);
    
    const body = {
      ClubCode: "0",
      dtIni: "",
      dtFim: "",
      CourseName: "",
      TournCode: "",
      TournName: TournName || "",
      jtStartIndex: idx,
      jtPageSize: size,
      jtSorting: sort
    };

    const res = await fetch("tournaments.aspx/TournamentsLST?" + qs, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    const d = json.d || json;
    return { records: d.Records || [], total: d.TotalRecordCount || 0 };
  }

  // Helper: busca TODAS as páginas de um filtro
  async function searchAll(TournName) {
    const first = await search(TournName, 0);
    const all = [...first.records];
    const total = first.total;
    
    log("  Página 1: " + first.records.length + " de " + total + " total");
    
    let offset = 50;
    while (offset < total) {
      const page = await search(TournName, offset);
      all.push(...page.records);
      log("  Página " + (offset/50 + 1) + ": +" + page.records.length + " (total: " + all.length + ")");
      offset += 50;
      // Pausa para não sobrecarregar
      await new Promise(r => setTimeout(r, 300));
    }
    return { records: all, total };
  }

  // ── 1. Primeiro teste simples (1 página) ──
  log("");
  log("--- 1. Teste: 1ª página sem filtro ---");
  try {
    const test = await search("", 0);
    ok("Funciona! " + test.records.length + " registos, " + test.total + " total");
    
    // Mostrar campos
    if (test.records[0]) {
      log("Campos: " + Object.keys(test.records[0]).join(", "));
      log("Exemplo completo:");
      console.log(test.records[0]);
      console.log(JSON.stringify(test.records[0], null, 2));
    }
  } catch (e) {
    log("ERRO no teste: " + e.message);
    log("A tentar com ClubCode diferente...");
    return;
  }

  // ── 2. Pesquisa DRIVE ──
  log("");
  log("--- 2. Todos os torneios DRIVE ---");
  const drive = await searchAll("drive");
  ok("DRIVE total: " + drive.total);

  // ── 3. Pesquisa AQUAPOR ──
  log("");
  log("--- 3. Todos os torneios AQUAPOR ---");
  const aquapor = await searchAll("aquapor");
  ok("AQUAPOR total: " + aquapor.total);

  // ── 4. Classificar ──
  log("");
  log("--- 4. Resumo ---");
  
  const getName = (r) => r.tournament_name || r.TournamentName || r.name || r.Name || r.description || "";
  const getCC = (r) => r.club_code || r.ClubCode || r.ccode || r.tclub || "";
  const getTC = (r) => r.tournament_code || r.TournamentCode || r.tcode || r.code || "";
  const getDate = (r) => r.started_at || r.StartDate || r.start_date || r.date || "";

  // DRIVE
  const driveTour = drive.records.filter(r => /tour\b/i.test(getName(r)) && !/challenge/i.test(getName(r)));
  const driveChallenge = drive.records.filter(r => /challenge/i.test(getName(r)) && !/final/i.test(getName(r)));
  const driveFinal = drive.records.filter(r => /final/i.test(getName(r)));
  const driveOther = drive.records.filter(r => {
    const n = getName(r);
    return !/tour\b/i.test(n) && !/challenge/i.test(n) && !/final/i.test(n);
  });

  log("DRIVE Tour: " + driveTour.length);
  driveTour.forEach(r => info(getCC(r) + "/" + getTC(r) + " " + getDate(r) + " " + getName(r)));
  
  log("DRIVE Challenge: " + driveChallenge.length);
  driveChallenge.forEach(r => info(getCC(r) + "/" + getTC(r) + " " + getDate(r) + " " + getName(r)));
  
  log("DRIVE Finals: " + driveFinal.length);
  driveFinal.forEach(r => info(getCC(r) + "/" + getTC(r) + " " + getDate(r) + " " + getName(r)));

  if (driveOther.length) {
    log("DRIVE Outros: " + driveOther.length);
    driveOther.forEach(r => info(getCC(r) + "/" + getTC(r) + " " + getDate(r) + " " + getName(r)));
  }

  log("");
  log("AQUAPOR: " + aquapor.total);
  aquapor.records.forEach(r => info(getCC(r) + "/" + getTC(r) + " " + getDate(r) + " " + getName(r)));

  // ── Guardar ──
  window._drive = drive.records;
  window._aquapor = aquapor.records;

  log("");
  log("=== FIM ===");
  log("Guardado: window._drive (" + drive.records.length + "), window._aquapor (" + aquapor.records.length + ")");
  log("");
  log("Para copiar os campos do 1º registo:");
  log("  copy(JSON.stringify(window._drive[0], null, 2))");
  log("");
  log("Para copiar TUDO:");
  log("  copy(JSON.stringify({ drive: window._drive, aquapor: window._aquapor }, null, 2))");
})();
