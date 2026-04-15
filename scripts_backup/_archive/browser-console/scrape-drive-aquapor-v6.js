// ============================================================
// scrape-drive-aquapor-v6.js — COMPLETO com Scorecards
// ============================================================
// Cola em: https://scoring.datagolf.pt/pt/tournaments.aspx
//
// Usa os formatos EXACTOS que funcionaram no v4:
//   - tournaments.aspx/TournamentsLST (query string + body)
//   - classif.aspx/ClassifLST (query string + body)
//   - classif.aspx/ScoreCard (query string + body)
// ============================================================

(async () => {
  const YEAR = 2026;
  const DELAY = 150;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log  = m => console.log("%c[v6] " + m, "color:#2563eb;font-weight:bold");
  const ok   = m => console.log("%c[v6] ✓ " + m, "color:green;font-weight:bold");
  const warn = m => console.log("%c[v6] ⚠ " + m, "color:orange;font-weight:bold");
  const info = m => console.log("%c[v6]   " + m, "color:#6366f1");

  const regionMap = { "982": "madeira", "983": "acores", "985": "tejo", "987": "norte", "988": "sul", "000": "nacional" };

  // ═══════════════════════════════════════════════════════
  // FASE 1: Descobrir torneios 2026
  // Formato EXACTO do v4 que funcionou
  // ═══════════════════════════════════════════════════════
  log("═══ FASE 1: Descobrir torneios " + YEAR + " ═══");

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
    info(TournName + ": " + first.total + " total (" + pages + " páginas)");
    let offset = 50;
    while (offset < first.total) {
      await sleep(DELAY);
      const page = await tournSearch(TournName, offset);
      all.push(...page.records);
      if (pages > 5 && (offset / 50) % 10 === 0) info("  pág " + (offset/50+1) + "/" + pages);
      offset += 50;
    }
    return all;
  }

  const is2026 = r => {
    const ms = parseInt((r.started_at || "").match(/\d+/)?.[0] || "0");
    return new Date(ms).getFullYear() === YEAR;
  };

  // Buscar DRIVE
  log("  Buscar torneios DRIVE...");
  const driveAll = await tournSearchAll("drive");
  const drive = driveAll.filter(is2026).filter(r => (r.acronym || "").startsWith("FPG_D"));
  ok("DRIVE " + YEAR + ": " + drive.length + " torneios (de " + driveAll.length + " total)");
  drive.forEach(r => info(r.club_code + "/" + r.code + " " + r.description));

  // Buscar AQUAPOR
  log("  Buscar torneios AQUAPOR...");
  const aquaporAll = await tournSearchAll("aquapor");
  const aquapor = aquaporAll.filter(is2026);
  ok("AQUAPOR " + YEAR + ": " + aquapor.length + " torneios (de " + aquaporAll.length + " total)");
  aquapor.forEach(r => info(r.club_code + "/" + r.code + " " + r.description));

  // ═══════════════════════════════════════════════════════
  // FASE 2: Buscar classificações + Scorecards
  // classif.aspx/ClassifLST + classif.aspx/ScoreCard
  // ═══════════════════════════════════════════════════════
  log("");
  log("═══ FASE 2: Classificações + Scorecards ═══");

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

  // Scorecard: formato EXACTO do HAR — params na query string E no body
  async function fetchScorecard(scoreId, tclub, tcode, round) {
    const qs = "score_id=" + scoreId + "&tclub=" + tclub + "&tcode=" + tcode + "&scoringtype=1&classiftype=I&classifround=" + round;
    const body = {
      score_id: String(scoreId),
      tclub: String(tclub),
      tcode: String(tcode),
      scoringtype: "1",
      classiftype: "I",
      classifround: String(round),
    };
    try {
      const res = await fetch("classif.aspx/ScoreCard?" + qs, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const d = json.d || json;
      if (d.Result === "OK" && d.Records && d.Records.length > 0) return d.Records[0];
      return null;
    } catch (e) {
      return null;
    }
  }

  function extractHoleData(rec) {
    const n = rec.nholes || 18;
    const scores = [], pars = [], si = [], meters = [];
    for (let h = 1; h <= n; h++) {
      scores.push(rec["gross_" + h] != null ? Number(rec["gross_" + h]) : 0);
      pars.push(rec["par_" + h] != null ? Number(rec["par_" + h]) : 0);
      si.push(rec["stroke_index_" + h] != null ? Number(rec["stroke_index_" + h]) : 0);
      meters.push(rec["meters_" + h] != null ? Number(rec["meters_" + h]) : 0);
    }
    return { scores, pars, si, meters };
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
      name: desc, ccode: cc, tcode: tc, date: dateStr,
      campo: raw.course_description || "",
      clube: cc, series,
      region: regionMap[cc] || "outro",
      escalao, num,
      rounds: raw.rounds || 1,
      playerCount: 0, players: [],
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
      toParNum = parseInt(String(toParStr).replace("+", ""));
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
      // Preenchidos pelo scorecard
      fedCode: null, courseRating: null, slope: null,
      teeName: null, teeColorId: null,
      parTotal: null, nholes: null, course: null,
      roundScores: [],
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
  let totalScorecards = 0;
  let classifErrors = 0;

  for (let i = 0; i < allTourns.length; i++) {
    const { raw, circuit } = allTourns[i];
    const t = parseTournament(raw, circuit);
    const label = "[" + (i+1) + "/" + allTourns.length + "] " + t.ccode + "/" + t.tcode;

    // Fase 2a: Classificação
    const { records, error } = await fetchClassif(t.ccode, t.tcode);

    if (error) {
      warn(label + " " + t.name + " → ERRO: " + error);
      classifErrors++;
      if (circuit === "aquapor") aquaporTournaments.push(t);
      else driveTournaments.push(t);
      await sleep(DELAY);
      continue;
    }

    if (records.length === 0) {
      info(label + " " + t.name + " → 0 jogadores (futuro?)");
      if (circuit === "aquapor") aquaporTournaments.push(t);
      else driveTournaments.push(t);
      await sleep(DELAY);
      continue;
    }

    t.players = records.map(mapPlayer);
    t.playerCount = t.players.length;
    totalPlayers += t.playerCount;
    ok(label + " " + t.name + " → " + t.playerCount + " jogadores");

    // Fase 2b: Scorecards para cada jogador
    const nRounds = t.rounds || 1;
    let scOk = 0, scFail = 0, scSkip = 0;

    for (let pi = 0; pi < t.players.length; pi++) {
      const p = t.players[pi];

      if (p.pos === "NS" || p.pos === "DQ" || p.pos === "WD" || !p.scoreId || p.scoreId === "0") {
        scSkip++;
        continue;
      }

      for (let rd = 1; rd <= nRounds; rd++) {
        const sc = await fetchScorecard(p.scoreId, t.ccode, t.tcode, rd);
        if (sc) {
          // Preencher dados comuns na primeira ronda que funcionar
          if (!p.fedCode && sc.federated_code) {
            p.fedCode = sc.federated_code;
            p.courseRating = sc.course_rating;
            p.slope = sc.slope;
            p.teeName = sc.tee_name;
            p.teeColorId = sc.tee_color_id;
            p.parTotal = sc.par_total;
            p.nholes = sc.nholes;
            p.course = sc.course_description;
          }
          const hd = extractHoleData(sc);
          p.roundScores.push({
            round: rd,
            gross: sc.gross_total,
            scores: hd.scores,
            pars: hd.pars,
            si: hd.si,
            meters: hd.meters,
            courseRating: sc.course_rating,
            slope: sc.slope,
            teeName: sc.tee_name,
            teeColorId: sc.tee_color_id,
          });
          scOk++;
          totalScorecards++;
        } else {
          scFail++;
        }
        await sleep(DELAY);
      }

      // Progresso a cada 25 jogadores
      if ((pi + 1) % 25 === 0) {
        info("  scorecards: " + (pi+1) + "/" + t.players.length + " (" + scOk + " ok, " + scFail + " falhas)");
      }
    }

    if (scOk > 0) info("  → " + scOk + " scorecards (" + scFail + " falhas, " + scSkip + " NS)");

    if (circuit === "aquapor") aquaporTournaments.push(t);
    else driveTournaments.push(t);

    await sleep(DELAY);
  }

  // ═══════════════════════════════════════════════════════
  // FASE 3: Exportar
  // ═══════════════════════════════════════════════════════
  log("");
  log("═══ FASE 3: Exportar ═══");

  const now = new Date();
  const lastUpdated = String(now.getDate()).padStart(2, "0") + "/" +
    String(now.getMonth() + 1).padStart(2, "0") + "/" + now.getFullYear();

  function buildOutput(tournaments, circuit) {
    let tp = 0, ts = 0;
    for (const t of tournaments) {
      tp += t.playerCount;
      for (const p of t.players) ts += p.roundScores.length;
    }
    tournaments.sort((a, b) => a.date.localeCompare(b.date));
    return {
      lastUpdated, source: "scoring.datagolf.pt", circuit,
      totalTournaments: tournaments.length,
      totalPlayers: tp, totalScorecards: ts,
      tournaments,
    };
  }

  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const driveData = buildOutput(driveTournaments, "drive");
  const aquaporData = buildOutput(aquaporTournaments, "aquapor");

  downloadJSON(driveData, "drive-data.json");
  await sleep(500);
  downloadJSON(aquaporData, "aquapor-data.json");

  window._driveData = driveData;
  window._aquaporData = aquaporData;

  log("");
  log("═══════════════════════════════════════");
  ok("CONCLUÍDO!");
  log("  DRIVE: " + driveData.totalTournaments + " torneios, " + driveData.totalPlayers + " jogadores, " + driveData.totalScorecards + " scorecards");
  log("  AQUAPOR: " + aquaporData.totalTournaments + " torneios, " + aquaporData.totalPlayers + " jogadores, " + aquaporData.totalScorecards + " scorecards");
  if (classifErrors > 0) warn("  " + classifErrors + " erros de classificação");
  log("  Ficheiros: drive-data.json, aquapor-data.json");
  log("  Debug: window._driveData, window._aquaporData");
  log("═══════════════════════════════════════");
})();
