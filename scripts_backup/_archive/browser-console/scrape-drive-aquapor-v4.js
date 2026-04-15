/*
 * scrape-drive-aquapor-v4.js — Extrator completo DRIVE + AQUAPOR 2026
 * Cola em: https://scoring.datagolf.pt/pt/tournaments.aspx
 *
 * Exporta: drive-data.json + aquapor-data.json
 */
(async () => {
  const log  = (m) => console.log("%c[DRIVE] " + m, "color:#2563eb;font-weight:bold");
  const ok   = (m) => console.log("%c[DRIVE] ✓ " + m, "color:green;font-weight:bold");
  const warn = (m) => console.log("%c[DRIVE] ⚠ " + m, "color:orange;font-weight:bold");
  const info = (m) => console.log("%c[DRIVE]   " + m, "color:#6366f1");
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const DELAY = 200;

  log("═══ Extrator DRIVE + AQUAPOR 2026 (v4) ═══");

  /* ═══════════════════════════════════════
     PASSO 1: DESCOBRIR TORNEIOS 2026
     ═══════════════════════════════════════ */
  log("PASSO 1: Descobrir torneios 2026...");

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
    const pages = Math.ceil(first.total / 50);
    log("  " + TournName + ": " + first.total + " total (" + pages + " páginas)");
    let offset = 50;
    while (offset < first.total) {
      await sleep(DELAY);
      const page = await tournSearch(TournName, offset);
      all.push(...page.records);
      if (pages > 3 && (offset / 50) % 10 === 0) log("    pág " + (offset/50+1) + "/" + pages);
      offset += 50;
    }
    return all;
  }

  const is2026 = (r) => {
    const ms = parseInt((r.started_at || "").match(/\d+/)?.[0] || "0");
    return new Date(ms).getFullYear() === 2026;
  };

  const driveAll = await tournSearchAll("drive");
  const drive = driveAll.filter(is2026).filter(r => (r.acronym || "").startsWith("FPG_D"));
  ok("DRIVE 2026: " + drive.length + " torneios");

  const aquaporAll = await tournSearchAll("aquapor");
  const aquapor = aquaporAll.filter(is2026);
  ok("AQUAPOR 2026: " + aquapor.length + " torneios");

  /* ═══════════════════════════════════════
     PASSO 2: BUSCAR CLASSIFICAÇÕES
     Endpoint: classif.aspx/ClassifLST
     (descoberto via HAR — NÃO é Classifications.aspx!)
     ═══════════════════════════════════════ */
  log("");
  log("PASSO 2: Buscar classificações via classif.aspx/ClassifLST...");

  const CLUB_REGION = {
    "982": "madeira", "983": "acores", "985": "tejo",
    "987": "norte", "988": "sul", "000": "nacional",
  };

  async function fetchClassif(tclub, tcode) {
    const allRecords = [];
    let startIndex = 0;
    const pageSize = 150;

    while (true) {
      const body = {
        Classi: "1",
        tclub: String(tclub),
        tcode: String(tcode),
        classiforder: "1",
        classiftype: "I",
        classifroundtype: "D",
        scoringtype: "1",
        round: "1",
        members: "0",
        playertypes: "0",
        gender: "0",
        minagemen: "0",
        maxagemen: "999",
        minageladies: "0",
        maxageladies: "999",
        minhcp: "-8",
        maxhcp: "99",
        idfilter: "-1",
        jtStartIndex: String(startIndex),
        jtPageSize: String(pageSize),
        jtSorting: "score_id DESC",
      };

      const qs = "jtStartIndex=" + startIndex + "&jtPageSize=" + pageSize + "&jtSorting=" + encodeURIComponent("score_id DESC");

      try {
        const res = await fetch("classif.aspx/ClassifLST?" + qs, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify(body),
        });
        if (!res.ok) return { records: allRecords, error: "HTTP " + res.status };
        const json = await res.json();
        const d = json.d || json;
        if (d.Result !== "OK") return { records: allRecords, error: "Result=" + d.Result };
        const recs = d.Records || [];
        allRecords.push(...recs);
        if (recs.length < pageSize) break;
        startIndex += pageSize;
        await sleep(DELAY);
      } catch (e) {
        return { records: allRecords, error: e.message };
      }
    }
    return { records: allRecords, error: null };
  }

  function parseTournament(raw, circuit) {
    const desc = raw.description || "";
    const cc = raw.club_code || "";
    const tc = raw.code || "";
    const dateMs = parseInt((raw.started_at || "").match(/\d+/)?.[0] || "0");
    const dateStr = new Date(dateMs).toISOString().split("T")[0];

    let series = circuit === "aquapor" ? "aquapor" : "tour";
    if (/challenge/i.test(desc)) series = "challenge";

    let escalao = null;
    const escMatch = desc.match(/Sub\s*(\d+)/i);
    if (escMatch) escalao = "Sub " + escMatch[1];

    let num = 1;
    const numMatch = desc.match(/(\d+)º/);
    if (numMatch) num = parseInt(numMatch[1]);

    return {
      name: desc,
      ccode: cc,
      tcode: tc,
      date: dateStr,
      campo: raw.course_description || "",
      clube: cc,
      series,
      region: CLUB_REGION[cc] || "outro",
      escalao,
      num,
      rounds: raw.rounds || 1,
      playerCount: 0,
      players: [],
    };
  }

  function mapPlayer(r) {
    const pos = r.classif_pos;
    const grossStr = r.gross_total;
    const toParStr = r.to_par_total;
    const isNS = pos === "NS" || grossStr === "NS" || r.score_status_id === 99;

    let grossNum = null;
    if (grossStr && grossStr !== "NS" && grossStr !== "NR" && grossStr !== "DQ") {
      grossNum = parseInt(grossStr);
      if (isNaN(grossNum)) grossNum = null;
    }

    let toParNum = null;
    if (toParStr && toParStr !== "NS" && toParStr !== "NR" && toParStr !== "DQ" && toParStr !== "PAR") {
      toParNum = parseInt(toParStr.replace("+", ""));
      if (isNaN(toParNum)) toParNum = null;
    }
    if (toParStr === "PAR") toParNum = 0;

    return {
      scoreId: String(r.score_id || ""),
      pos: isNS ? "NS" : (isNaN(Number(pos)) ? pos : Number(pos)),
      name: (r.player_name || "").trim(),
      club: (r.player_club_description || "").trim(),
      grossTotal: isNS ? 999 : grossNum,
      toPar: isNS ? null : toParNum,
      hcpExact: r.exact_hcp != null ? Number(r.exact_hcp) : undefined,
      hcpPlay: r.play_hcp != null ? Number(r.play_hcp) : undefined,
      nholes: undefined, // not in classif response
      parTotal: undefined,
    };
  }

  // ── Processar todos os torneios ──
  const allTourns = [
    ...drive.map(r => ({ raw: r, circuit: "drive" })),
    ...aquapor.map(r => ({ raw: r, circuit: "aquapor" })),
  ];

  const driveTournaments = [];
  const aquaporTournaments = [];
  let totalPlayers = 0;
  let classifErrors = 0;

  for (let i = 0; i < allTourns.length; i++) {
    const { raw, circuit } = allTourns[i];
    const t = parseTournament(raw, circuit);
    const label = "[" + (i+1) + "/" + allTourns.length + "] " + t.ccode + "/" + t.tcode;

    const { records, error } = await fetchClassif(t.ccode, t.tcode);

    if (error) {
      warn(label + " " + t.name + " → ERRO: " + error);
      classifErrors++;
    } else if (records.length === 0) {
      info(label + " " + t.name + " → 0 jogadores (futuro?)");
    } else {
      t.players = records.map(mapPlayer);
      t.playerCount = t.players.length;
      totalPlayers += t.playerCount;
      ok(label + " " + t.name + " → " + t.playerCount + " jogadores");
    }

    if (circuit === "aquapor") aquaporTournaments.push(t);
    else driveTournaments.push(t);

    await sleep(DELAY);
  }

  /* ═══════════════════════════════════════
     PASSO 3: EXPORTAR
     ═══════════════════════════════════════ */
  log("");
  log("PASSO 3: Exportar...");

  const now = new Date();
  const lastUpdated = String(now.getDate()).padStart(2, "0") + "/" +
    String(now.getMonth() + 1).padStart(2, "0") + "/" + now.getFullYear();

  function buildOutput(tournaments) {
    return {
      lastUpdated,
      source: "scoring.datagolf.pt",
      totalTournaments: tournaments.length,
      totalPlayers: tournaments.reduce((s, t) => s + t.playerCount, 0),
      totalScorecards: 0, // sem scorecards nesta versão
      tournaments,
    };
  }

  const driveData = buildOutput(driveTournaments);
  const aquaporData = buildOutput(aquaporTournaments);

  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadJSON(driveData, "drive-data.json");
  await sleep(500);
  downloadJSON(aquaporData, "aquapor-data.json");

  window._driveData = driveData;
  window._aquaporData = aquaporData;

  log("");
  log("═══════════════════════════════════");
  ok("CONCLUÍDO!");
  log("  DRIVE: " + driveData.totalTournaments + " torneios, " + driveData.totalPlayers + " jogadores");
  log("  AQUAPOR: " + aquaporData.totalTournaments + " torneios, " + aquaporData.totalPlayers + " jogadores");
  if (classifErrors > 0) warn("  " + classifErrors + " erros de classificação");
  log("  Ficheiros: drive-data.json, aquapor-data.json");
  log("  Copia para public/data/ e faz deploy.");
  log("═══════════════════════════════════");
})();
