// ============================================================
// pull-torneios.js
// ============================================================
// Cola em: https://scoring.datagolf.pt/pt/tournaments.aspx
//
// Descarrega scorecards de torneios específicos, à escolha.
// Complemento ao scrape-drive-aquapor-v7.js (que corre em auto).
//
// COMO ENCONTRAR tclub e tcode:
//   No URL da classificação:
//   ...Classifications.aspx?ccode=985&tcode=12345
//                                  ^^^        ^^^^^
//                                tclub       tcode
//
// OUTPUT: pull-torneios.json
//   Estrutura idêntica ao drive-data.json / aquapor-data.json,
//   com campo "circuit" em cada torneio para identificar a origem.
// ============================================================

(async () => {

  // ════════════════════════════════════════════════════════════
  // ▼▼▼  LISTA DE TORNEIOS  ▼▼▼
  // ════════════════════════════════════════════════════════════

  // Opção A — Por tclub + tcode (directo, sem pesquisa):
  const POR_CODIGO = [
    // { tclub: "985", tcode: "12345" },
    // { tclub: "988", tcode: "67890", circuit: "aquapor" },
    // circuit é opcional — se omitido é auto-detectado
  ];

  // Opção B — Por nome (pesquisa parcial, case-insensitive):
  // Descarrega todos os torneios do YEAR cujo nome contenha
  // qualquer uma destas strings.
  const POR_NOME = [
    // "Morgado",
    // "Vale Pisão",
    // "BJGT",
  ];

  // Ano a considerar para a pesquisa por nome
  const YEAR = 2026;

  // ▲▲▲  FIM DA LISTA  ▲▲▲
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
    return new Date(ms).getFullYear() === YEAR;
  };

  const detectCircuit = raw => {
    if ((raw.acronym || "").startsWith("FPG_D")) return "drive";
    if (/aquapor/i.test(raw.description || "") || /aquapor/i.test(raw.acronym || "")) return "aquapor";
    return "tour";
  };

  // ─────────────────────────────────────────────
  // Helpers: pesquisa de torneios
  // ─────────────────────────────────────────────

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

  async function resolveByCode(tclub, tcode) {
    try {
      const { records } = await apiSearch({ clubCode: String(tclub), tournCode: String(tcode) }, 0);
      return records.find(r => String(r.code) === String(tcode) && String(r.club_code) === String(tclub)) || null;
    } catch (e) {
      warn("Erro ao resolver " + tclub + "/" + tcode + ": " + e.message);
      return null;
    }
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

  // ─────────────────────────────────────────────
  // FASE 1: Resolver lista de torneios
  // ─────────────────────────────────────────────
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

  if (POR_CODIGO.length > 0) {
    log("  Por código (" + POR_CODIGO.length + ")...");
    for (const spec of POR_CODIGO) {
      await sleep(DELAY);
      const raw = await resolveByCode(spec.tclub, spec.tcode);
      if (!raw) { warn("  Não encontrado: " + spec.tclub + "/" + spec.tcode); continue; }
      add(raw, spec.circuit);
    }
  }

  if (POR_NOME.length > 0) {
    log("  Por nome (" + POR_NOME.length + " pesquisa(s))...");
    for (const nome of POR_NOME) {
      await sleep(DELAY);
      const results = await resolveByName(nome);
      if (results.length === 0) { warn("  \"" + nome + "\" — nenhum resultado"); continue; }
      results.forEach(raw => add(raw));
    }
  }

  if (allTourns.length === 0) {
    warn("Lista vazia. Preenche POR_CODIGO ou POR_NOME no topo do script.");
    return;
  }

  log("Total: " + allTourns.length + " torneio(s) a processar");

  // ─────────────────────────────────────────────
  // FASE 2: Classificações + Scorecards
  // ─────────────────────────────────────────────
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
    let series = circuit === "aquapor" ? "aquapor" : "tour";
    if (/challenge/i.test(desc)) series = "challenge";
    const escMatch = desc.match(/Sub\s*(\d+)/i);
    const numMatch = desc.match(/(\d+)º/);
    return {
      name: desc, ccode: raw.club_code || "", tcode: raw.code || "",
      date: dateStr, campo: raw.course_description || "",
      clube: raw.club_code || "", circuit, series,
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
    if (error) {
      warn(label + " " + t.name + " → ERRO: " + error);
      errors++;
      tournaments.push(t);
      await sleep(DELAY);
      continue;
    }
    if (records.length === 0) {
      info(label + " " + t.name + " → 0 jogadores (futuro?)");
      tournaments.push(t);
      await sleep(DELAY);
      continue;
    }

    t.players = records.map(mapPlayer);
    t.playerCount = t.players.length;
    totalPlayers += t.playerCount;

    // Auto-detectar multi-ronda
    let nRounds = t.rounds || 1;
    if (nRounds <= 1) {
      await sleep(DELAY);
      const probe = await fetchClassif(t.ccode, t.tcode, 2);
      if (!probe.error && probe.records.length > 0) {
        nRounds = 2; t.rounds = 2;
        info(label + " → Auto-detectado torneio de 2 rondas (" + probe.records.length + " jog na R2)");
      }
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
          if (!p.fedCode && sc0.federated_code) {
            p.fedCode = sc0.federated_code; p.courseRating = sc0.course_rating; p.slope = sc0.slope;
            p.teeName = sc0.tee_name; p.teeColorId = sc0.tee_color_id;
            p.parTotal = sc0.par_total; p.nholes = sc0.nholes; p.course = sc0.course_description;
          }
          recs.forEach((sc, idx) => {
            const hd = extractHoleData(sc);
            p.roundScores.push({ round: idx + 1, gross: sc.gross_total, ...hd, courseRating: sc.course_rating, slope: sc.slope, teeName: sc.tee_name, teeColorId: sc.tee_color_id });
          });
          scOk++; totalScorecards++;
        } else { scFail++; }
      } else {
        const sc = await fetchScorecard(p.scoreId, t.ccode, t.tcode, 1);
        if (sc) {
          const hd = extractHoleData(sc);
          if (!p.fedCode && sc.federated_code) {
            p.fedCode = sc.federated_code; p.courseRating = sc.course_rating; p.slope = sc.slope;
            p.teeName = sc.tee_name; p.teeColorId = sc.tee_color_id;
            p.parTotal = sc.par_total; p.nholes = sc.nholes; p.course = sc.course_description;
          }
          p.roundScores.push({ round: 1, gross: sc.gross_total, ...hd, courseRating: sc.course_rating, slope: sc.slope, teeName: sc.tee_name, teeColorId: sc.tee_color_id });
          scOk++; totalScorecards++;
        } else { scFail++; }
      }

      if (nRounds > 1 && p.roundScores.length > 1) {
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
  // FASE 3: Exportar
  // ─────────────────────────────────────────────
  log("");
  log("═══ FASE 3: Exportar ═══");

  const now = new Date();
  const lastUpdated = String(now.getDate()).padStart(2, "0") + "/" +
    String(now.getMonth() + 1).padStart(2, "0") + "/" + now.getFullYear();

  tournaments.sort((a, b) => a.date.localeCompare(b.date));

  const output = {
    lastUpdated, source: "scoring.datagolf.pt",
    totalTournaments: tournaments.length, totalPlayers, totalScorecards,
    tournaments,
  };

  const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "pull-torneios.json";
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  window._pullData = output;

  log("═══════════════════════════════════════");
  ok("CONCLUÍDO!");
  log("  " + tournaments.length + " torneios · " + totalPlayers + " jogadores · " + totalScorecards + " scorecards");
  if (errors > 0) warn("  " + errors + " erros de classificação");
  log("  Ficheiro: pull-torneios.json");
  log("  Debug: window._pullData");
  log("═══════════════════════════════════════");
})();
