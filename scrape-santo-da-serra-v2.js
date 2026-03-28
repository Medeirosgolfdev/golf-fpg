// ============================================================
// scrape-santo-da-serra-v2.js
// ============================================================
// Cola em: https://scoring.datagolf.pt/pt/tournaments.aspx
//
// Clube do Santo da Serra (ccode=007), desde 2022
// Exclui torneios cujo nome contenha "Flinstones" (case-insensitive)
// Exclui torneios cujo nome contenha "Quarta Feira Europeia" (case-insensitive)
// ============================================================

(async () => {
  const YEAR_MIN = 2022;
  const DELAY = 150;
  const CLUB_CODE = "007";
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log  = m => console.log("%c[SSerra] " + m, "color:#2563eb;font-weight:bold");
  const ok   = m => console.log("%c[SSerra] ✓ " + m, "color:green;font-weight:bold");
  const warn = m => console.log("%c[SSerra] ⚠ " + m, "color:orange;font-weight:bold");
  const info = m => console.log("%c[SSerra]   " + m, "color:#6366f1");

  // ═══════════════════════════════════════════════════════
  // FASE 1: Descobrir torneios desde YEAR_MIN
  // ═══════════════════════════════════════════════════════
  log("═══ FASE 1: Descobrir torneios desde " + YEAR_MIN + " (Santo da Serra / ccode=" + CLUB_CODE + ") ═══");

  const isInRange = r => {
    const ms = parseInt((r.started_at || "").match(/\d+/)?.[0] || "0");
    return new Date(ms).getFullYear() >= YEAR_MIN;
  };

  const isExcluded = name => {
    if (!name) return false;
    const n = name.trim();
    if (/flinstones/i.test(n)) return true;
    if (/quarta feira europeia/i.test(n)) return true;
    return false;
  };

  async function tournSearch(startIndex) {
    const body = {
      ClubCode: CLUB_CODE,
      dtIni: "", dtFim: "",
      CourseName: "", TournCode: "",
      TournName: "",
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

  async function tournSearchAll() {
    const first = await tournSearch(0);
    const all = [...first.records];
    const total = first.total;
    const pages = Math.ceil(total / 50);
    info("Santo da Serra: " + total + " torneios no total (" + pages + " páginas) — a paginar tudo...");

    let offset = 50;
    let pageNum = 2;

    while (offset < total) {
      await sleep(DELAY);
      const page = await tournSearch(offset);
      all.push(...page.records);

      // Parar quando chegarmos a registos anteriores a YEAR_MIN — ordenação DESC
      // garante que os mais recentes vêm primeiro; quando a página inteira for
      // anterior a YEAR_MIN podemos parar com segurança.
      const pageYears = page.records.map(r => {
        const ms = parseInt((r.started_at || "").match(/\d+/)?.[0] || "0");
        return new Date(ms).getFullYear();
      });
      const maxYearInPage = pageYears.length > 0 ? Math.max(...pageYears) : 0;

      info("  Pág " + pageNum + "/" + pages + " — " + page.records.length + " registos (ano mais recente na pág: " + maxYearInPage + ")");

      if (maxYearInPage > 0 && maxYearInPage < YEAR_MIN) {
        info("  Página inteira anterior a " + YEAR_MIN + " — paragem antecipada.");
        break;
      }

      offset += 50;
      pageNum++;
    }

    return all;
  }

  log("  A buscar torneios Santo da Serra...");
  const allRaw = await tournSearchAll();
  const inRange = allRaw.filter(isInRange);
  const filtered = inRange.filter(r => !isExcluded(r.description));
  const excluded = inRange.filter(r => isExcluded(r.description));

  ok("Desde " + YEAR_MIN + ": " + inRange.length + " torneios encontrados → " + filtered.length + " após exclusões");
  if (excluded.length > 0) {
    warn("  Excluídos (" + excluded.length + "):");
    excluded.forEach(r => warn("    → " + r.description));
  }
  filtered.forEach(r => info("  " + r.club_code + "/" + r.code + "  " + r.description + "  [" + (new Date(parseInt((r.started_at||"").match(/\d+/)?.[0]||"0")).toISOString().split("T")[0]) + "]"));

  // ═══════════════════════════════════════════════════════
  // FASE 2: Classificações + Scorecards
  // ═══════════════════════════════════════════════════════
  log("");
  log("═══ FASE 2: Classificações + Scorecards (" + filtered.length + " torneios) ═══");

  async function fetchClassif(tclub, tcode, round) {
    const allRecords = [];
    let startIndex = 0;
    const pageSize = 150;
    while (true) {
      const body = {
        Classi: "1",
        tclub: String(tclub), tcode: String(tcode),
        classiforder: "1", classiftype: "I", classifroundtype: "D",
        scoringtype: "1", round: String(round || 1),
        members: "0", playertypes: "0", gender: "0",
        minagemen: "0", maxagemen: "999",
        minageladies: "0", maxageladies: "999",
        minhcp: "-8", maxhcp: "99", idfilter: "-1",
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

  async function fetchScorecard(scoreId, tclub, tcode, round) {
    const qs = "score_id=" + scoreId + "&tclub=" + tclub + "&tcode=" + tcode + "&scoringtype=1&classiftype=I&classifround=" + round;
    const body = {
      score_id: String(scoreId), tclub: String(tclub), tcode: String(tcode),
      scoringtype: "1", classiftype: "I", classifround: String(round),
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
    } catch (e) { return null; }
  }

  async function fetchScorecardAggregate(scoreId, tclub, tcode) {
    const qs = "score_id=" + scoreId + "&tclub=" + tclub + "&tcode=" + tcode + "&scoringtype=1&classiftype=I&classifround=";
    const body = {
      score_id: String(scoreId), tclub: String(tclub), tcode: String(tcode),
      scoringtype: "1", classiftype: "I", classifround: "",
    };
    try {
      const res = await fetch("classifAgregate.aspx/ScoreCard?" + qs, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const d = json.d || json;
      if (d.Result === "OK" && d.Records && d.Records.length > 0) return d.Records;
      return null;
    } catch (e) { return null; }
  }

  function extractHoleData(rec) {
    const n = rec.nholes || 18;
    const scores = [], pars = [], si = [], meters = [];
    for (let h = 1; h <= n; h++) {
      scores.push(rec["gross_" + h] != null ? Number(rec["gross_" + h]) : 0);
      pars.push(rec["par_" + h]    != null ? Number(rec["par_" + h])   : 0);
      si.push(rec["stroke_index_" + h] != null ? Number(rec["stroke_index_" + h]) : 0);
      meters.push(rec["meters_" + h]   != null ? Number(rec["meters_" + h])   : 0);
    }
    return { scores, pars, si, meters };
  }

  function parseTournament(raw) {
    const dateMs = parseInt((raw.started_at || "").match(/\d+/)?.[0] || "0");
    return {
      name: raw.description || "",
      ccode: raw.club_code || "",
      tcode: raw.code || "",
      date: new Date(dateMs).toISOString().split("T")[0],
      campo: raw.course_description || "",
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
    if (grossStr && !["NS","NR","DQ"].includes(grossStr)) {
      grossNum = parseInt(grossStr);
      if (isNaN(grossNum)) grossNum = null;
    }
    let toParNum = null;
    if (toParStr && !["NS","NR","DQ","PAR"].includes(toParStr)) {
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
      fedCode: null, courseRating: null, slope: null,
      teeName: null, teeColorId: null,
      parTotal: null, nholes: null, course: null,
      roundScores: [],
    };
  }

  const tournaments = [];
  let totalPlayers = 0;
  let totalScorecards = 0;
  let classifErrors = 0;

  for (let i = 0; i < filtered.length; i++) {
    const raw = filtered[i];
    const t = parseTournament(raw);
    const label = "[" + (i+1) + "/" + filtered.length + "] " + t.date + " " + t.ccode + "/" + t.tcode;

    // ── Fase 2a: Classificação R1 ──
    const { records, error } = await fetchClassif(t.ccode, t.tcode, 1);

    if (error) {
      warn(label + " " + t.name + " → ERRO: " + error);
      classifErrors++;
      tournaments.push(t);
      await sleep(DELAY);
      continue;
    }

    if (records.length === 0) {
      info(label + " " + t.name + " → 0 jogadores (futuro ou sem dados)");
      tournaments.push(t);
      await sleep(DELAY);
      continue;
    }

    t.players = records.map(mapPlayer);
    t.playerCount = t.players.length;
    totalPlayers += t.playerCount;

    // ── Auto-detectar 2ª ronda ──
    let nRounds = t.rounds || 1;
    if (nRounds <= 1) {
      await sleep(DELAY);
      const probe = await fetchClassif(t.ccode, t.tcode, 2);
      if (!probe.error && probe.records.length > 0) {
        nRounds = 2;
        t.rounds = 2;
        info(label + " → Auto-detectado torneio de 2 rondas! (" + probe.records.length + " jog na R2)");
      }
    }

    ok(label + " " + t.name + " → " + t.playerCount + " jogadores" + (nRounds > 1 ? " (" + nRounds + "R)" : ""));

    // ── Fase 2b: Scorecards ──
    let scOk = 0, scFail = 0, scSkip = 0;

    for (let pi = 0; pi < t.players.length; pi++) {
      const p = t.players[pi];

      if (p.pos === "NS" || p.pos === "DQ" || p.pos === "WD" || !p.scoreId || p.scoreId === "0") {
        scSkip++;
        continue;
      }

      if (nRounds > 1) {
        const recs = await fetchScorecardAggregate(p.scoreId, t.ccode, t.tcode);
        if (recs && recs.length > 0) {
          const sc0 = recs[0];
          p.fedCode = sc0.federated_code;
          p.courseRating = sc0.course_rating;
          p.slope = sc0.slope;
          p.teeName = sc0.tee_name;
          p.teeColorId = sc0.tee_color_id;
          p.parTotal = sc0.par_total;
          p.nholes = sc0.nholes;
          p.course = sc0.course_description;
          recs.forEach((sc, idx) => {
            const hd = extractHoleData(sc);
            p.roundScores.push({
              round: idx + 1,
              gross: sc.gross_total,
              scores: hd.scores, pars: hd.pars, si: hd.si, meters: hd.meters,
              courseRating: sc.course_rating, slope: sc.slope,
              teeName: sc.tee_name, teeColorId: sc.tee_color_id,
            });
          });
          // Recalcular grossTotal/toPar como soma das rondas
          if (p.roundScores.length > 1) {
            const sumGross = p.roundScores.reduce((s, r) => s + (r.gross || 0), 0);
            p.grossTotal = sumGross;
            p.toPar = p.parTotal ? sumGross - (p.parTotal * p.roundScores.length) : null;
          }
          scOk++; totalScorecards++;
        } else { scFail++; }
        await sleep(DELAY);
      } else {
        const sc = await fetchScorecard(p.scoreId, t.ccode, t.tcode, 1);
        if (sc) {
          const hd = extractHoleData(sc);
          p.fedCode = sc.federated_code;
          p.courseRating = sc.course_rating;
          p.slope = sc.slope;
          p.teeName = sc.tee_name;
          p.teeColorId = sc.tee_color_id;
          p.parTotal = sc.par_total;
          p.nholes = sc.nholes;
          p.course = sc.course_description;
          p.roundScores.push({
            round: 1,
            gross: sc.gross_total,
            scores: hd.scores, pars: hd.pars, si: hd.si, meters: hd.meters,
            courseRating: sc.course_rating, slope: sc.slope,
            teeName: sc.tee_name, teeColorId: sc.tee_color_id,
          });
          scOk++; totalScorecards++;
        } else { scFail++; }
        await sleep(DELAY);
      }

      if ((pi + 1) % 25 === 0) {
        info("  scorecards: " + (pi+1) + "/" + t.players.length + " (" + scOk + " ok, " + scFail + " falhas)");
      }
    }

    if (scOk > 0 || scFail > 0) info("  → " + scOk + " scorecards (" + scFail + " falhas, " + scSkip + " NS/DQ/WD)");
    tournaments.push(t);
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

  tournaments.sort((a, b) => a.date.localeCompare(b.date));

  const output = {
    lastUpdated,
    source: "scoring.datagolf.pt",
    club: "Santo da Serra",
    ccode: CLUB_CODE,
    yearFrom: YEAR_MIN,
    totalTournaments: tournaments.length,
    totalPlayers,
    totalScorecards,
    tournaments,
  };

  const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "santo-da-serra-data.json";
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  window._santoSerraData = output;

  log("");
  log("═══════════════════════════════════════");
  ok("CONCLUÍDO!");
  log("  Período: " + YEAR_MIN + " → hoje");
  log("  " + output.totalTournaments + " torneios, " + output.totalPlayers + " jogadores, " + output.totalScorecards + " scorecards");
  if (classifErrors > 0) warn("  " + classifErrors + " erros de classificação");
  log("  Ficheiro: santo-da-serra-data.json");
  log("  Debug: window._santoSerraData");
  log("═══════════════════════════════════════");
})();
