(async () => {

  // ════════════════════════════════════════════════════════════
  // ▼▼▼  CONFIGURAÇÃO — 6 torneios, agrupados por ano  ▼▼▼
  //
  //  Para re-descarregar só alguns anos, comenta os grupos
  //  que não são necessários.
  // ════════════════════════════════════════════════════════════

  const GRUPOS_ANO = [
    {
      ano: "2024",
      ficheiro: "clubes_sub_14&18_2024.json",
      torneios: [
        { tclub: "000", tcode: "10768" },   // Sub 14
        { tclub: "000", tcode: "10769" },   // Sub 18
      ],
    },
    {
      ano: "2025",
      ficheiro: "clubes_sub_14&18_2025.json",
      torneios: [
        { tclub: "000", tcode: "10825" },   // Sub 14
        { tclub: "000", tcode: "10826" },   // Sub 18
      ],
    },
    {
      ano: "2026",
      ficheiro: "clubes_sub_14&18_2026.json",
      torneios: [
        { tclub: "000", tcode: "10898" },   // Sub 14
        { tclub: "000", tcode: "10899" },   // Sub 18
      ],
    },
  ];

  // ▲▲▲  FIM DA CONFIGURAÇÃO  ▲▲▲
  // ════════════════════════════════════════════════════════════

  const DELAY = 150;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log  = m => console.log("%c[PULL] " + m,    "color:#2563eb;font-weight:bold");
  const ok   = m => console.log("%c[PULL] ✓ " + m, "color:green;font-weight:bold");
  const warn = m => console.log("%c[PULL] ⚠ " + m, "color:orange;font-weight:bold");
  const info = m => console.log("%c[PULL]   " + m,  "color:#6366f1");

  // ─────────────────────────────────────────────
  // API helpers
  // ─────────────────────────────────────────────

  async function resolveByCode(tclub, tcode) {
    const body = {
      ClubCode: String(tclub), TournCode: String(tcode),
      TournName: "", CourseName: "", dtIni: "", dtFim: "",
      jtStartIndex: "0", jtPageSize: "50", jtSorting: "started_at DESC",
    };
    const qs = "jtStartIndex=0&jtPageSize=50&jtSorting=" + encodeURIComponent("started_at DESC");
    try {
      const res = await fetch("tournaments.aspx/TournamentsLST?" + qs, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const records = ((await res.json()).d || {}).Records || [];
      return records.find(r => String(r.code) === String(tcode) && String(r.club_code) === String(tclub)) || null;
    } catch (e) {
      warn("Erro ao resolver " + tclub + "/" + tcode + ": " + e.message);
      return null;
    }
  }

  async function fetchClassif(tclub, tcode, round) {
    const allRecords = [];
    let startIndex = 0;
    const pageSize = 150;
    while (true) {
      const body = {
        Classi: "1", tclub: String(tclub), tcode: String(tcode),
        classiforder: "1", classiftype: "I", classifroundtype: "D",
        scoringtype: "1", round: String(round),
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
        const d = (await res.json()).d || {};
        if (d.Result !== "OK") return { records: allRecords, error: d.Result };
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
      const d = (await res.json()).d || {};
      return (d.Result === "OK" && d.Records?.length > 0) ? d.Records : null;
    } catch (e) { return null; }
  }

  async function fetchScorecardSingle(scoreId, tclub, tcode, round) {
    const qs = "score_id=" + scoreId + "&tclub=" + tclub + "&tcode=" + tcode + "&scoringtype=1&classiftype=I&classifround=" + round;
    const body = { score_id: String(scoreId), tclub: String(tclub), tcode: String(tcode), scoringtype: "1", classiftype: "I", classifround: String(round) };
    try {
      const res = await fetch("classif.aspx/ScoreCard?" + qs, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const d = (await res.json()).d || {};
      return (d.Result === "OK" && d.Records?.length > 0) ? d.Records[0] : null;
    } catch (e) { return null; }
  }

  function extractHoleData(rec) {
    const n = rec.nholes || 18;
    const scores = [], pars = [], si = [], meters = [];
    for (let h = 1; h <= n; h++) {
      scores.push(rec["gross_" + h]        != null ? Number(rec["gross_" + h])        : 0);
      pars.push(rec["par_" + h]            != null ? Number(rec["par_" + h])           : 0);
      si.push(rec["stroke_index_" + h]     != null ? Number(rec["stroke_index_" + h]) : 0);
      meters.push(rec["meters_" + h]       != null ? Number(rec["meters_" + h])       : 0);
    }
    return { scores, pars, si, meters };
  }

  function parseTournament(raw) {
    const desc = raw.description || "";
    const dateMs = parseInt((raw.started_at || "").match(/\d+/)?.[0] || "0");
    const escMatch = desc.match(/Sub\s*(\d+)/i);
    return {
      name: desc,
      ccode: raw.club_code || "",
      tcode: raw.code || "",
      date: new Date(dateMs).toISOString().split("T")[0],
      campo: raw.course_description || "",
      escalao: escMatch ? "Sub " + escMatch[1] : null,
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
      scoreId:    String(r.score_id || ""),
      name:       (r.player_name || "").trim(),
      club:       (r.player_club_description || "").trim(),
      grossTotal: isNS ? 999 : grossNum,
      toPar:      isNS ? null : toParNum,
      hcpExact:   r.exact_hcp != null ? Number(r.exact_hcp) : undefined,
      fedCode: null, courseRating: null, slope: null,
      teeName: null, teeColorId: null, parTotal: null, nholes: null, course: null,
      roundScores: [],
    };
  }

  // ─────────────────────────────────────────────
  // Processar um torneio
  // ─────────────────────────────────────────────
  async function processarTorneio(tclub, tcode, label) {
    const raw = await resolveByCode(tclub, tcode);
    if (!raw) { warn(label + " → não encontrado"); return null; }
    const t = parseTournament(raw);
    let nRounds = t.rounds || 1;

    // Buscar classificação R1 (lista base)
    const { records: r1, error: err1 } = await fetchClassif(tclub, tcode, 1);
    if (err1 || r1.length === 0) {
      info(label + " → " + (err1 || "0 jogadores (futuro?)"));
      return t;
    }

    // Auto-detectar multi-ronda
    if (nRounds <= 1) {
      await sleep(DELAY);
      const probe = await fetchClassif(tclub, tcode, 2);
      if (!probe.error && probe.records.length > 0) { nRounds = 2; t.rounds = 2; }
    }

    // Juntar jogadores de TODAS as rondas (capta suplentes)
    // e registar em que rondas cada jogador aparece
    const byScoreId = new Map();
    const playerRounds = new Map(); // scoreId → [rondas disputadas]
    const addPlayers = (recs, rd) => {
      for (const r of recs) {
        const sid = String(r.score_id || "");
        if (!sid || sid === "0") continue;
        if (!byScoreId.has(sid)) byScoreId.set(sid, mapPlayer(r));
        if (!playerRounds.has(sid)) playerRounds.set(sid, []);
        if (!playerRounds.get(sid).includes(rd)) playerRounds.get(sid).push(rd);
      }
    };
    addPlayers(r1, 1);
    for (let rd = 2; rd <= nRounds; rd++) {
      await sleep(DELAY);
      const { records: rdRecs, error: rdErr } = await fetchClassif(tclub, tcode, rd);
      if (!rdErr && rdRecs.length > 0) {
        const novos = rdRecs.filter(r => !byScoreId.has(String(r.score_id || "")));
        if (novos.length > 0) info(label + " R" + rd + " → +" + novos.length + " suplentes");
        addPlayers(rdRecs, rd);
      }
    }

    t.players = [...byScoreId.values()];
    t.playerCount = t.players.length;
    ok(label + " → " + t.playerCount + " jogadores (" + nRounds + "R)");

    // Scorecards
    let scOk = 0, scFail = 0;
    for (let pi = 0; pi < t.players.length; pi++) {
      const p = t.players[pi];
      if (!p.scoreId || p.scoreId === "0") continue;

      const applyScorecard = (sc, rdNum) => {
        if (!p.fedCode && sc.federated_code) {
          p.fedCode = sc.federated_code;
          p.courseRating = sc.course_rating; p.slope = sc.slope;
          p.teeName = sc.tee_name; p.teeColorId = sc.tee_color_id;
          p.parTotal = sc.par_total; p.nholes = sc.nholes;
          p.course = sc.course_description;
        }
        p.roundScores.push({ round: rdNum, gross: sc.gross_total, ...extractHoleData(sc),
          courseRating: sc.course_rating, slope: sc.slope,
          teeName: sc.tee_name, teeColorId: sc.tee_color_id });
      };

      if (nRounds > 1) {
        const rdList = (playerRounds.get(p.scoreId) || []).slice().sort((a, b) => a - b);

        // Usar SEMPRE o agregado — devolve os scorecards reais de cada ronda disputada.
        // fetchScorecardSingle com classifround=N não funciona para parciais porque
        // o sistema numera internamente as rondas do jogador como 1,2 (não 1,3 ou 2,3).
        const recs = await fetchScorecardAggregate(p.scoreId, tclub, tcode);
        if (recs?.length > 0) {
          // O agregado pode devolver um registo extra de TOTAL no início
          // (ex: [total(184), R2(94), R3(90)] para um jogador que jogou 2 rondas).
          // Tomamos os ÚLTIMOS rdList.length registos para ignorar o total.
          const nExpected = rdList.length > 0 ? rdList.length : nRounds;
          const validRecs = recs.slice(-nExpected);
          validRecs.forEach((sc, idx) => applyScorecard(sc, rdList[idx] ?? (idx + 1)));
          scOk++;
        } else {
          // Fallback: ronda a ronda (raramente necessário)
          let found = false;
          const rounds = rdList.length > 0 ? rdList : Array.from({length: nRounds}, (_, i) => i + 1);
          for (const rd of rounds) {
            await sleep(DELAY);
            const sc = await fetchScorecardSingle(p.scoreId, tclub, tcode, rd);
            if (sc) { applyScorecard(sc, rd); found = true; }
          }
          found ? scOk++ : scFail++;
        }
      } else {
        const sc = await fetchScorecardSingle(p.scoreId, tclub, tcode, 1);
        sc ? (applyScorecard(sc, 1), scOk++) : scFail++;
      }

      if (p.roundScores.length > 0) {
        const sum = p.roundScores.reduce((s, r) => s + (r.gross || 0), 0);
        p.grossTotal = sum;
        p.toPar = sum - ((p.parTotal || 0) * p.roundScores.length);
      }

      await sleep(DELAY);
      if ((pi + 1) % 25 === 0) info("  " + (pi + 1) + "/" + t.players.length + " sc (" + scOk + " ok)");
    }

    info("  → " + scOk + " scorecards" + (scFail > 0 ? " (" + scFail + " falhas)" : ""));
    return t;
  }

  // ─────────────────────────────────────────────
  // Gravar ficheiro JSON
  // ─────────────────────────────────────────────
  function gravarFicheiro(tournaments, filename) {
    const now = new Date();
    const lastUpdated = String(now.getDate()).padStart(2, "0") + "/" +
      String(now.getMonth() + 1).padStart(2, "0") + "/" + now.getFullYear();
    const totalPlayers    = tournaments.reduce((s, t) => s + t.playerCount, 0);
    const totalScorecards = tournaments.reduce((s, t) => s + t.players.reduce((ps, p) => ps + p.roundScores.length, 0), 0);
    const output = { lastUpdated, source: "scoring.datagolf.pt", totalTournaments: tournaments.length, totalPlayers, totalScorecards, tournaments };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ok("Gravado: " + filename + " (" + totalPlayers + " jog · " + totalScorecards + " scorecards)");
  }

  // ─────────────────────────────────────────────
  // MAIN
  // ─────────────────────────────────────────────
  log("══════════════════════════════════════════════");
  log("  Clubes — " + GRUPOS_ANO.length + " anos · " + GRUPOS_ANO.reduce((s, g) => s + g.torneios.length, 0) + " torneios");
  log("══════════════════════════════════════════════");

  for (const grupo of GRUPOS_ANO) {
    log("");
    log("─── " + grupo.ano + " → " + grupo.ficheiro + " ───");
    const tournamentsDoAno = [];
    for (const spec of grupo.torneios) {
      await sleep(DELAY);
      const t = await processarTorneio(spec.tclub, spec.tcode, grupo.ano + " · " + spec.tcode);
      if (t) tournamentsDoAno.push(t);
    }
    if (tournamentsDoAno.length > 0) {
      tournamentsDoAno.sort((a, b) => (a.escalao || "").localeCompare(b.escalao || ""));
      gravarFicheiro(tournamentsDoAno, grupo.ficheiro);
    } else {
      warn(grupo.ano + " → sem torneios para gravar");
    }
    await sleep(500);
  }

  log("");
  log("══════════════════════════════════════════════");
  ok("CONCLUÍDO!");
  GRUPOS_ANO.forEach(g => log("  📄 " + g.ficheiro));
  log("══════════════════════════════════════════════");

})();
