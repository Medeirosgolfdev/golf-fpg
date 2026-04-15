/*
 * DESCOBRIR TODOS OS TORNEIOS
 * Cola em: https://scoring.datagolf.pt/pt/tournaments.aspx
 *
 * Usa o endpoint real TournamentsLST para listar TUDO:
 * - DRIVE Tour + Challenge
 * - AQUAPOR
 * - Qualquer outro circuito
 */
(async () => {
  const log = (m) => console.log("%c[DISC] " + m, "color:#2563eb;font-weight:bold");
  const ok = (m) => console.log("%c[DISC] ✓ " + m, "color:green;font-weight:bold");
  const info = (m) => console.log("%c[DISC]   " + m, "color:#6366f1");

  log("=== Descobrir Torneios ===");

  // ── Helper: chamar TournamentsLST ──
  async function searchTournaments(params = {}) {
    const body = {
      ClubCode: params.ClubCode || "0",
      dtIni: params.dtIni || "",
      dtFim: params.dtFim || "",
      CourseName: params.CourseName || "",
      TournCode: params.TournCode || "",
      TournName: params.TournName || "",
      jtStartIndex: String(params.jtStartIndex || 0),
      jtPageSize: String(params.jtPageSize || 500),
      jtSorting: params.jtSorting || "started_at DESC"
    };

    const res = await fetch("tournaments.aspx/TournamentsLST?" +
      "jtStartIndex=" + body.jtStartIndex +
      "&jtPageSize=" + body.jtPageSize +
      "&jtSorting=" + encodeURIComponent(body.jtSorting), {
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

  // ── 1. Buscar TUDO (sem filtro) ──
  log("--- 1. Todos os torneios (sem filtro, max 500) ---");
  const all = await searchTournaments({ jtPageSize: 500 });
  ok("Total: " + all.total + " torneios (obtidos: " + all.records.length + ")");

  if (all.records.length === 0) {
    log("ERRO: Nenhum torneio encontrado! Verifica se estás em tournaments.aspx");
    return;
  }

  // Mostrar campos do primeiro registo
  log("Campos disponíveis: " + Object.keys(all.records[0]).join(", "));
  log("Exemplo completo:");
  console.log(all.records[0]);

  // ── 2. Classificar torneios ──
  log("");
  log("--- 2. Classificar torneios ---");

  const circuits = {
    drive_tour: [],
    drive_challenge: [],
    drive_final: [],
    aquapor: [],
    other: []
  };

  all.records.forEach(r => {
    const name = (r.tournament_name || r.name || r.description || "").toString();
    const nameLower = name.toLowerCase();

    if (/aquapor/i.test(nameLower)) {
      circuits.aquapor.push(r);
    } else if (/drive/i.test(nameLower)) {
      if (/final/i.test(nameLower)) {
        circuits.drive_final.push(r);
      } else if (/challenge/i.test(nameLower)) {
        circuits.drive_challenge.push(r);
      } else if (/tour/i.test(nameLower)) {
        circuits.drive_tour.push(r);
      } else {
        circuits.other.push(r);
      }
    } else {
      circuits.other.push(r);
    }
  });

  for (const [circuit, list] of Object.entries(circuits)) {
    log(circuit.toUpperCase() + ": " + list.length);
    list.forEach(r => {
      const name = r.tournament_name || r.name || r.description || "";
      const cc = r.club_code || r.ccode || r.tclub || r.ClubCode || "";
      const tc = r.tournament_code || r.tcode || r.code || r.TournCode || "";
      const date = r.started_at || r.start_date || r.date || "";
      info("[" + cc + "/" + tc + "] " + date + " " + name);
    });
  }

  // ── 3. Agora buscar especificamente por AQUAPOR ──
  log("");
  log("--- 3. Pesquisa específica: AQUAPOR ---");
  const aquapor = await searchTournaments({ TournName: "aquapor", jtPageSize: 200 });
  ok("AQUAPOR: " + aquapor.total + " torneios");
  aquapor.records.forEach(r => {
    const name = r.tournament_name || r.name || r.description || "";
    const cc = r.club_code || r.ccode || r.tclub || r.ClubCode || "";
    const tc = r.tournament_code || r.tcode || r.code || r.TournCode || "";
    const date = r.started_at || r.start_date || r.date || "";
    info("[" + cc + "/" + tc + "] " + date + " " + name);
  });

  // ── 4. Pesquisa por DRIVE (para confirmar total) ──
  log("");
  log("--- 4. Pesquisa específica: DRIVE ---");
  const drive = await searchTournaments({ TournName: "drive", jtPageSize: 200 });
  ok("DRIVE: " + drive.total + " torneios");

  // ── 5. Pesquisa por ano: 2026 ──
  log("");
  log("--- 5. Torneios 2026 ---");
  const t2026 = await searchTournaments({ dtIni: "01/01/2026", dtFim: "31/12/2026", jtPageSize: 500 });
  ok("2026: " + t2026.total + " torneios");
  t2026.records.forEach(r => {
    const name = r.tournament_name || r.name || r.description || "";
    const cc = r.club_code || r.ccode || r.tclub || r.ClubCode || "";
    const tc = r.tournament_code || r.tcode || r.code || r.TournCode || "";
    const date = r.started_at || r.start_date || r.date || "";
    info("[" + cc + "/" + tc + "] " + date + " " + name);
  });

  // ── 6. Pesquisa por ano: 2025 ──
  log("");
  log("--- 6. Torneios 2025 ---");
  const t2025 = await searchTournaments({ dtIni: "01/01/2025", dtFim: "31/12/2025", jtPageSize: 500 });
  ok("2025: " + t2025.total + " torneios");

  // ── 7. Lista de ClubCodes únicos ──
  log("");
  log("--- 7. ClubCodes únicos ---");
  const clubCodes = new Map();
  all.records.forEach(r => {
    const cc = r.club_code || r.ccode || r.tclub || r.ClubCode || "";
    const name = r.tournament_name || r.name || "";
    if (cc && !clubCodes.has(cc)) {
      // Try to extract region from name
      let region = "?";
      if (/Norte/i.test(name)) region = "Norte";
      else if (/Tejo/i.test(name)) region = "Tejo";
      else if (/Sul/i.test(name)) region = "Sul";
      else if (/Madeira/i.test(name)) region = "Madeira";
      else if (/A[çc]ores/i.test(name)) region = "Açores";
      clubCodes.set(cc, region);
    }
  });
  for (const [cc, region] of [...clubCodes.entries()].sort()) {
    info("ccode=" + cc + " → " + region);
  }

  // ── Guardar tudo ──
  window._allTournaments = all.records;
  window._aquaporTournaments = aquapor.records;
  window._2026Tournaments = t2026.records;
  window._2025Tournaments = t2025.records;

  log("");
  log("=== FIM ===");
  log("Dados guardados em:");
  log("  window._allTournaments (" + all.records.length + ")");
  log("  window._aquaporTournaments (" + aquapor.records.length + ")");
  log("  window._2026Tournaments (" + t2026.records.length + ")");
  log("  window._2025Tournaments (" + t2025.records.length + ")");
  log("");
  log("Para copiar TUDO:");
  log("  copy(JSON.stringify({ all: window._allTournaments, aquapor: window._aquaporTournaments, t2026: window._2026Tournaments }, null, 2))");
  log("");
  log("Para copiar só 2026:");
  log("  copy(JSON.stringify(window._2026Tournaments, null, 2))");
})();
