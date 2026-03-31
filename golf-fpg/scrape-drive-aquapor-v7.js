// ============================================================
// scrape-drive-aquapor-v7.js — COMPLETO com Scorecards + Fix R2
// ============================================================
// Cola em: https://scoring.datagolf.pt/pt/tournaments.aspx
//
// ── HISTÓRICO ────────────────────────────────────────────────
//
// v6 → v7 (investigação 07/03/2026):
//
//   PROBLEMA ORIGINAL:
//     Torneios de 2 rondas (ex: Vale Pisão 28/02, AQUAPOR Morgado)
//     tinham R1 e R2 com scores idênticos no JSON de output.
//     O v6 usava o score_id da R1 com classifround=2 →
//     a API ignorava o parâmetro e devolvia sempre R1.
//
//   DIAGNÓSTICO (07/03/2026):
//     1. A API scoring.datagolf.pt usa o mesmo score_id para
//        R1 e R2 do mesmo jogador no mesmo torneio.
//     2. O endpoint classif.aspx/ScoreCard ignora completamente
//        o parâmetro classifround — devolve sempre o mesmo
//        scorecard independentemente do valor passado.
//     3. O website usa um endpoint DIFERENTE para torneios
//        agregados: classifAgregate.aspx/ScoreCard
//        com classifround="" (vazio).
//     4. Este endpoint devolve um array de Records (1 por ronda),
//        cada um com os 18 buracos correctos da sua ronda.
//        Ex: score_id=4276 (Santiago Dias, Vale Pisão):
//            Record[0]: gross=67, scores=[4,4,4,3,4,3,3,4,4,...] ← R1
//            Record[1]: gross=77, scores=[10,5,3,3,4,5,4,5,4,...] ← R2
//
//   SOLUÇÃO IMPLEMENTADA:
//     - Torneios nRounds > 1 → fetchScorecardAggregate()
//       usa classifAgregate.aspx/ScoreCard com classifround=""
//     - Torneios nRounds = 1 → fetchScorecard() como antes
//       usa classif.aspx/ScoreCard com classifround=1
//
//   AUTO-DETECÇÃO DE 2 RONDAS:
//     A API devolve rounds=null para alguns torneios de 2 dias
//     (ex: Vale Pisão). O scraper faz um probe à ClassifLST
//     com round=2 — se tiver registos, assume nRounds=2.
//
// ── ESTRUTURA DOS ENDPOINTS ──────────────────────────────────
//
//   ClassifLST (lista de jogadores por ronda):
//     POST classif.aspx/ClassifLST
//     Body: { tclub, tcode, round, classiftype, ... }
//
//   ScoreCard ronda única:
//     POST classif.aspx/ScoreCard
//     Body: { score_id, tclub, tcode, classifround: "1" }
//     → Devolve 1 Record com gross_1..gross_18
//
//   ScoreCard multi-ronda (DESCOBERTO 07/03/2026):
//     POST classifAgregate.aspx/ScoreCard
//     Body: { score_id, tclub, tcode, classifround: "" }
//     → Devolve N Records (1 por ronda), cada um com gross_1..gross_18
//
// ── FORMATO DE OUTPUT ────────────────────────────────────────
//   grossTotal/toPar ao nível do player = totais (soma das rondas)
//   grossTotal/toPar de cada ronda ficam em roundScores[i]
//   Compatível com drive-data.json e aquapor-data.json (v6)
// ============================================================

(async () => {
  const YEAR = 2026;
  const DELAY = 150;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log  = m => console.log("%c[v7] " + m, "color:#2563eb;font-weight:bold");
  const ok   = m => console.log("%c[v7] ✓ " + m, "color:green;font-weight:bold");
  const warn = m => console.log("%c[v7] ⚠ " + m, "color:orange;font-weight:bold");
  const info = m => console.log("%c[v7]   " + m, "color:#6366f1");

  const regionMap = { "982": "madeira", "983": "acores", "985": "tejo", "987": "norte", "988": "sul", "000": "nacional" };

  // ═══════════════════════════════════════════════════════
  // FASE 1: Descobrir torneios 2026
  // ═══════════════════════════════════════════════════════
  log("═══ FASE 1: Descobrir torneios " + YEAR + " ═══");

  const is2026 = r => {
    const ms = parseInt((r.started_at || "").match(/\d+/)?.[0] || "0");
    return new Date(ms).getFullYear() === YEAR;
  };

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
    // Resultados ordenados por started_at DESC → parar quando página não tiver dados do YEAR
    let emptyPages = 0;
    while (offset < first.total) {
      await sleep(DELAY);
      const page = await tournSearch(TournName, offset);
      const hasCurrentYear = page.records.some(is2026);
      all.push(...page.records);
      if (!hasCurrentYear) {
        emptyPages++;
        // 2 páginas seguidas sem dados do ano → parar (margem de segurança)
        if (emptyPages >= 2) {
          info("  Parou na pág " + (offset/50+1) + "/" + pages + " (sem dados " + YEAR + ")");
          break;
        }
      } else {
        emptyPages = 0;
      }
      offset += 50;
    }
    return all;
  }

  log("  Buscar torneios DRIVE...");
  const driveAll = await tournSearchAll("drive");
  const drive = driveAll.filter(is2026).filter(r => (r.acronym || "").startsWith("FPG_D"));
  ok("DRIVE " + YEAR + ": " + drive.length + " torneios (de " + driveAll.length + " total)");
  drive.forEach(r => info(r.club_code + "/" + r.code + " " + r.description));

  log("  Buscar torneios AQUAPOR...");
  const aquaporAll = await tournSearchAll("aquapor");
  const aquapor = aquaporAll.filter(is2026);
  ok("AQUAPOR " + YEAR + ": " + aquapor.length + " torneios (de " + aquaporAll.length + " total)");
  aquapor.forEach(r => info(r.club_code + "/" + r.code + " " + r.description));

  // ═══════════════════════════════════════════════════════
  // FASE 2: Classificações + Scorecards
  // ═══════════════════════════════════════════════════════
  log("");
  log("═══ FASE 2: Classificações + Scorecards ═══");

  // v7 FIX: round é agora parâmetro (era hardcoded "1" no v6)
  async function fetchClassif(tclub, tcode, round) {
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
        round: String(round || 1),   // ← v7: parametrizado
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

  // Para torneios multi-ronda: classifAgregate.aspx devolve todos os records (1 por ronda)
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
      if (d.Result === "OK" && d.Records && d.Records.length > 0) return d.Records;
      return null;
    } catch (e) {
      return null;
    }
  }

  function extractHoleData(rec, fromHole, toHole) {
    // fromHole/toHole são 1-based inclusivos. Default: 1 a nholes
    const n = rec.nholes || 18;
    const start = fromHole || 1;
    const end   = toHole   || n;
    const scores = [], pars = [], si = [], meters = [];
    for (let h = start; h <= end; h++) {
      scores.push(rec["gross_" + h] != null ? Number(rec["gross_" + h]) : 0);
      pars.push(rec["par_" + h]   != null ? Number(rec["par_" + h])   : 0);
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

    // ── Fase 2a: Classificação R1 ──
    const { records, error } = await fetchClassif(t.ccode, t.tcode, 1);

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

    // ── v7 FIX: Auto-detectar rondas quando raw.rounds é null/1 ──
    // A API nem sempre devolve o campo rounds correctamente (ex: Vale Pisão).
    // Tentamos buscar a ClassifLST da R2 — se tiver registos, é multi-ronda.
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
    // Multi-ronda: classifAgregate.aspx devolve todos os records de uma vez (1 por ronda)
    // Ronda única: classif.aspx/ScoreCard como antes
    let scOk = 0, scFail = 0, scSkip = 0;

    for (let pi = 0; pi < t.players.length; pi++) {
      const p = t.players[pi];

      if (p.pos === "NS" || p.pos === "DQ" || p.pos === "WD" || !p.scoreId || p.scoreId === "0") {
        scSkip++;
        continue;
      }

      if (nRounds > 1) {
        // ── Multi-ronda: usar classifAgregate ──
        const records = await fetchScorecardAggregate(p.scoreId, t.ccode, t.tcode);
        if (records && records.length > 0) {
          // Preencher dados comuns do 1º record
          const sc0 = records[0];
          if (!p.fedCode && sc0.federated_code) {
            p.fedCode = sc0.federated_code;
            p.courseRating = sc0.course_rating;
            p.slope = sc0.slope;
            p.teeName = sc0.tee_name;
            p.teeColorId = sc0.tee_color_id;
            p.parTotal = sc0.par_total;
            p.nholes = sc0.nholes;
            p.course = sc0.course_description;
          }
          records.forEach((sc, idx) => {
            const hd = extractHoleData(sc);
            p.roundScores.push({
              round: idx + 1,
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
          });
          scOk++;
          totalScorecards++;
        } else {
          scFail++;
        }
        await sleep(DELAY);

      } else {
        // ── Ronda única: classif.aspx ──
        const sc = await fetchScorecard(p.scoreId, t.ccode, t.tcode, 1);
        if (sc) {
          const hd = extractHoleData(sc);
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
          p.roundScores.push({
            round: 1,
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

      // v7: Para multi-ronda, recalcular grossTotal/toPar como soma real
      if (nRounds > 1 && p.roundScores.length > 1) {
        const sumGross = p.roundScores.reduce((s, r) => s + (r.gross || 0), 0);
        const parT = p.parTotal || 0;
        p.grossTotal = sumGross;
        p.toPar = sumGross - (parT * p.roundScores.length);
      }

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
