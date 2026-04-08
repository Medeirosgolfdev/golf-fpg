// Cola em: https://scoring.datagolf.pt/pt/tournaments.aspx

(async () => {

  // ════════════════════════════════════════════════════════════
  // ▼▼▼  CONFIGURAÇÃO  ▼▼▼
  // ════════════════════════════════════════════════════════════

  const POR_NOME = [ "JOVENS", "Campeonato Nacional Sub", "Final Nacional Drive" ];
  const YEARS    = [2022, 2023, 2024, 2025, 2026];

  // ▲▲▲  FIM DA CONFIGURAÇÃO  ▲▲▲
  // ════════════════════════════════════════════════════════════

  const DELAY = 150;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log  = m => console.log("%c[PULL] " + m,    "color:#2563eb;font-weight:bold");
  const ok   = m => console.log("%c[PULL] ✓ " + m, "color:green;font-weight:bold");
  const warn = m => console.log("%c[PULL] ⚠ " + m, "color:orange;font-weight:bold");
  const info = m => console.log("%c[PULL]   " + m,  "color:#6366f1");

  const regionMap = {
    "982": "madeira", "983": "acores", "985": "tejo",
    "987": "norte",   "988": "sul",    "000": "nacional",
  };

  const isYear = r => {
    const ms = parseInt((r.started_at || "").match(/\d+/)?.[0] || "0");
    return YEARS.includes(new Date(ms).getFullYear());
  };

  const getYear = r => {
    const ms = parseInt((r.started_at || "").match(/\d+/)?.[0] || "0");
    return new Date(ms).getFullYear();
  };

  const detectCircuit = raw => {
    if ((raw.acronym || "").startsWith("FPG_D")) return "drive";
    if (/aquapor/i.test(raw.description || "") || /aquapor/i.test(raw.acronym || "")) return "aquapor";
    return "tour";
  };

  async function apiSearch(params, startIndex) {
    const body = {
      ClubCode: params.clubCode || "0", TournCode: params.tournCode || "",
      TournName: params.tournName || "", CourseName: "",
      dtIni: "", dtFim: "",
      jtStartIndex: String(startIndex || 0),
      jtPageSize: "50", jtSorting: "started_at DESC",
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

  async function resolveByName(tournName) {
    const first = await apiSearch({ tournName }, 0);
    const all = [...first.records];
    let offset = 50;
    let emptyPages = 0;
    while (offset < first.total) {
      await sleep(DELAY);
      const page = await apiSearch({ tournName }, offset);
      all.push(...page.records);
      if (!page.records.some(isYear)) {
        if (++emptyPages >= 2) break;
      } else {
        emptyPages = 0;
      }
      offset += 50;
    }
    return all.filter(isYear);
  }

  log("═══ FASE 1: Resolver torneios ═══");

  const seen = new Set();
  const allTourns = [];

  const add = (raw, circuitOverride) => {
    const key = raw.club_code + "/" + raw.code;
    if (seen.has(key)) return;
    seen.add(key);
    const circuit = circuitOverride || detectCircuit(raw);
    ok("  " + key + " — " + raw.description + " [" + circuit + "]");
    allTourns.push({ raw, circuit });
  };

  for (const nome of POR_NOME) {
    await sleep(DELAY);
    const results = await resolveByName(nome);
    if (results.length === 0) { warn("  \"" + nome + "\" — nenhum resultado"); continue; }
    results.forEach(raw => add(raw));
  }

  if (allTourns.length === 0) { warn("Nenhum torneio encontrado."); return; }
  log("Total: " + allTourns.length + " torneio(s) a processar");

  log("");
  log("═══ FASE 2: Classificações + Scorecards ═══");

  async function fetchClassif(tclub, tcode, round) {
    const allRecords = [];
    let startIndex = 0;
    const pageSize = 150;
    while (true) {
      const body = {
        Classi: "1", tclub: String(tclub), tcode: String(tcode),
        classiforder: "1", classiftype: "I", classifroundtype: "D",
        scoringtype: "1", round: String(round || 1),
        members: "0", playertypes: "0", gender: "0",
        minagemen: "0", maxagemen: "999", minageladies: "0", maxageladies: "999",
        minhcp: "-8", maxhcp: "99", idfilter: "-1",
        jtStartIndex: String(startIndex), jtPageSize: String(pageSize),
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

  async function fetchScorecard(scoreId, tclub, tcode, round) {
    const qs = "score_id=" + scoreId + "&tclub=" + tclub + "&tcode=" + tcode + "&scoringtype=1&classiftype=I&classifround=" + round;
    const body = { score_id: String(scoreId), tclub: String(tclub), tcode: String(tcode), scoringtype: "1", classiftype: "I", classifround: String(round) };
    try {
      const res = await fetch("classif.aspx/ScoreCard?" + qs, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const d = json.d || json;
      return (d.Result === "OK" && d.Records?.length > 0) ? d.Records[0] : null;
    } catch (e) { return null; }
  }

  async function fetchScorecardAggregate(scoreId, tclub, tcode) {
    const qs = "score_id=" + scoreId + "&tclub=" + tclub + "&tcode=" + tcode + "&scoringtype=1&classiftype=I&classifround=";
    const body = { score_id: String(scoreId), tclub: String(tclub), tcode: String(tcode), scoringtype: "1", classiftype: "I", classifround: "" };
    try {
      const res = await fetch("classifAgregate.aspx/ScoreCard?" + qs, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const d = json.d || json;
      return (d.Result === "OK" && d.Records?.length > 0) ? d.Records : null;
    } catch (e) { return null; }
  }

  function extractHoleData(rec) {
    const n = rec.nholes || 18;
    const scores = [], pars = [], si = [], meters = [];
    for (let h = 1; h <= n; h++) {
      scores.push(rec["gross_" + h] != null ? Number(rec["gross_" + h]) : 0);
      pars.push(rec["par_" + h]     != null ? Number(rec["par_" + h])   : 0);
      si.push(rec["stroke_index_" + h] != null ? Number(rec["stroke_index_" + h]) : 0);
      meters.push(rec["meters_" + h]   != null ? Number(rec["meters_" + h]) : 0);
    }
    return { scores, pars, si, meters };
  }

  function parseTournament(raw, circuit) {
    const desc = raw.description || "";
    const dateMs = parseInt((raw.started_at || "").match(/\d+/)?.[0] || "0");
    const dateStr = new Date(dateMs).toISOString().split("T")[0];
    const escMatch = desc.match(/Sub\s*(\d+)/i);
    const numMatch = desc.match(/(\d+)º/);
    return {
      name: desc, ccode: raw.club_code || "", tcode: raw.code || "",
      date: dateStr, campo: raw.course_description || "",
      clube: raw.club_code || "", circuit, series: "jovens",
      region: regionMap[raw.club_code] || "outro",
      escalao: escMatch ? "Sub " + escMatch[1] : null,
      num: numMatch ? parseInt(numMatch[1]) : 1,
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
    if (grossStr && !["NS","NR","DQ"].includes(grossStr)) { grossNum = parseInt(grossStr); if (isNaN(grossNum)) grossNum = null; }
    let toParNum = null;
    if (toParStr && !["NS","NR","DQ","PAR"].includes(toParStr)) { toParNum = parseInt(String(toParStr).replace("+", "")); if (isNaN(toParNum)) toParNum = null; }
    if (toParStr === "PAR") toParNum = 0;
    return {
      scoreId: String(r.score_id || ""),
      pos: isNS ? "NS" : (isNaN(Number(pos)) ? pos : Number(pos)),
      name: (r.player_name || "").trim(),
      club: (r.player_club_description || "").trim(),
      grossTotal: isNS ? 999 : grossNum,
      toPar: isNS ? null : toParNum,
      hcpExact: r.exact_hcp != null ? Number(r.exact_hcp) : undefined,
      hcpPlay:  r.play_hcp  != null ? Number(r.play_hcp)  : undefined,
      fedCode: null, courseRating: null, slope: null,
      teeName: null, teeColorId: null, parTotal: null, nholes: null, course: null,
      roundScores: [],
    };
  }

  const tournaments = [];
  let totalPlayers = 0, totalScorecards = 0, errors = 0;

  for (let i = 0; i < allTourns.length; i++) {
    const { raw, circuit } = allTourns[i];
    const t = parseTournament(raw, circuit);
    const label = "[" + (i+1) + "/" + allTourns.length + "] " + t.ccode + "/" + t.tcode;

    const { records, error } = await fetchClassif(t.ccode, t.tcode, 1);
    if (error) { warn(label + " " + t.name + " → ERRO: " + error); errors++; tournaments.push(t); await sleep(DELAY); continue; }
    if (records.length === 0) { info(label + " " + t.name + " → 0 jogadores (futuro?)"); tournaments.push(t); await sleep(DELAY); continue; }

    t.players = records.map(mapPlayer);
    t.playerCount = t.players.length;
    totalPlayers += t.playerCount;

    let nRounds = t.rounds || 1;
    if (nRounds <= 1) {
      await sleep(DELAY);
      const probe2 = await fetchClassif(t.ccode, t.tcode, 2);
      if (!probe2.error && probe2.records.length > 0) { nRounds = 2; t.rounds = 2; }
    }
    if (nRounds <= 2) {
      await sleep(DELAY);
      const probe3 = await fetchClassif(t.ccode, t.tcode, 3);
      if (!probe3.error && probe3.records.length > 0) { nRounds = 3; t.rounds = 3; }
    }

    ok(label + " " + t.name + " → " + t.playerCount + " jogadores" + (nRounds > 1 ? " (" + nRounds + "R)" : ""));

    let scOk = 0, scFail = 0, scSkip = 0;
    for (let pi = 0; pi < t.players.length; pi++) {
      const p = t.players[pi];
      if (["NS","DQ","WD"].includes(p.pos) || !p.scoreId || p.scoreId === "0") { scSkip++; continue; }
      if (nRounds > 1) {
        const recs = await fetchScorecardAggregate(p.scoreId, t.ccode, t.tcode);
        if (recs?.length > 0) {
          const sc0 = recs[0];
          if (!p.fedCode && sc0.federated_code) { p.fedCode = sc0.federated_code; p.courseRating = sc0.course_rating; p.slope = sc0.slope; p.teeName = sc0.tee_name; p.teeColorId = sc0.tee_color_id; p.parTotal = sc0.par_total; p.nholes = sc0.nholes; p.course = sc0.course_description; }
          recs.forEach((sc, idx) => { p.roundScores.push({ round: idx + 1, gross: sc.gross_total, ...extractHoleData(sc), courseRating: sc.course_rating, slope: sc.slope, teeName: sc.tee_name, teeColorId: sc.tee_color_id }); });
          scOk++; totalScorecards++;
        } else { scFail++; }
      } else {
        const sc = await fetchScorecard(p.scoreId, t.ccode, t.tcode, 1);
        if (sc) {
          if (!p.fedCode && sc.federated_code) { p.fedCode = sc.federated_code; p.courseRating = sc.course_rating; p.slope = sc.slope; p.teeName = sc.tee_name; p.teeColorId = sc.tee_color_id; p.parTotal = sc.par_total; p.nholes = sc.nholes; p.course = sc.course_description; }
          p.roundScores.push({ round: 1, gross: sc.gross_total, ...extractHoleData(sc), courseRating: sc.course_rating, slope: sc.slope, teeName: sc.tee_name, teeColorId: sc.tee_color_id });
          scOk++; totalScorecards++;
        } else { scFail++; }
      }
      if (nRounds > 1 && p.roundScores.length > 0) {
        const sumGross = p.roundScores.reduce((s, r) => s + (r.gross || 0), 0);
        p.grossTotal = sumGross;
        p.toPar = sumGross - ((p.parTotal || 0) * p.roundScores.length);
      }
      await sleep(DELAY);
      if ((pi + 1) % 25 === 0) info("  " + (pi+1) + "/" + t.players.length + " scorecards (" + scOk + " ok, " + scFail + " falhas)");
    }
    if (scOk > 0) info("  → " + scOk + " scorecards (" + scFail + " falhas, " + scSkip + " NS/DQ)");
    tournaments.push(t);
    await sleep(DELAY);
  }

  // ─────────────────────────────────────────────
  // FASE 3: Exportar — um ficheiro por ano
  // ─────────────────────────────────────────────
  log("");
  log("═══ FASE 3: Exportar ═══");

  const now = new Date();
  const lastUpdated = String(now.getDate()).padStart(2, "0") + "/" +
    String(now.getMonth() + 1).padStart(2, "0") + "/" + now.getFullYear();

  function gravarFicheiro(tourns, filename) {
    const tp = tourns.reduce((s, t) => s + t.playerCount, 0);
    const ts = tourns.reduce((s, t) => s + t.players.reduce((ps, p) => ps + p.roundScores.length, 0), 0);
    const output = { lastUpdated, source: "scoring.datagolf.pt", totalTournaments: tourns.length, totalPlayers: tp, totalScorecards: ts, tournaments: tourns };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ok("Gravado: " + filename + " (" + tourns.length + " torneios · " + tp + " jog · " + ts + " sc)");
  }

  // Agrupar por ano e gravar um ficheiro por ano
  const byYear = {};
  for (const t of tournaments) {
    const year = t.date ? t.date.slice(0, 4) : "0000";
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(t);
  }
  for (const year of Object.keys(byYear).sort()) {
    byYear[year].sort((a, b) => a.date.localeCompare(b.date));
    gravarFicheiro(byYear[year], "jovens_" + year + ".json");
  }

  log("═══════════════════════════════════════");
  ok("CONCLUÍDO! " + tournaments.length + " torneios · " + totalPlayers + " jog · " + totalScorecards + " sc");
  if (errors > 0) warn(errors + " erros de classificação");
  log("═══════════════════════════════════════");
})();
