// lib/process-data.js — Load and prepare all player data for template rendering
const fs = require("fs");
const path = require("path");
const { loadMelhorias, applyMelhorias, applyMelhoriasScorecard,
  getMelhoriaLink, getMelhoriaPill, getMelhoriaGroup, getMelhoriaTornView } = require("./melhorias");
const { normKey } = require("./tee-colors");
const { norm, parseDotNetDate, fmtDate, toNum, pickHcpFromRow, isMeaningful,
  pickScorecardRec, metersTotalFromRec, getTee, getCourse,
  courseAlias, getPlayedAt, pickEventName, pickGrossFromWHS } = require("./helpers");
const { holeCountFromRec, parTotalFromRec } = require("./scorecard-fragment");
const { computeEclecticForTee } = require("./eclectic");
const { computeHoleStats } = require("./hole-stats");

function preparePlayerData(FED, allPlayers, crossStats) {
  // Marcar jogador atual e copiar info
  const players = allPlayers.map(p => {
    // Compute HCP bin
    let hcpBin = '';
    if (p.hcp != null) {
      const h = Number(p.hcp);
      if (h <= 0) hcpBin = '≤0';
      else if (h <= 5) hcpBin = '0.1-5';
      else if (h <= 10) hcpBin = '5.1-10';
      else if (h <= 15) hcpBin = '10.1-15';
      else if (h <= 20) hcpBin = '15.1-20';
      else if (h <= 30) hcpBin = '20.1-30';
      else if (h <= 40) hcpBin = '30.1-40';
      else hcpBin = '40+';
    }
    return {
      fed: p.fed,
      name: p.name,
      escalao: p.escalao || "",
      club: p.club || "",
      region: p.region || "",
      sex: p.sex || "",
      hcp: p.hcp,
      hcpBin,
      tags: p.tags || [],
      birthYear: p.birthYear || "",
      isCurrent: p.fed === FED
    };
  });
  players.sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    return a.name.localeCompare(b.name);
  });

  const currentPlayer = players.find(p => p.isCurrent);
  const playerName = currentPlayer ? currentPlayer.name : "";
  const playerEscalao = currentPlayer ? currentPlayer.escalao : "";

  const baseDir = path.join(process.cwd(), "output", FED);
  const whsPath = path.join(baseDir, "whs-list.json");
  const scorecardsDir = path.join(baseDir, "scorecards");

  if (!fs.existsSync(whsPath)) {
    console.error("  ⚠ Não encontrei:", whsPath, "- a saltar");
    return;
  }
  if (!fs.existsSync(scorecardsDir)) {
    console.error("  ⚠ Não encontrei:", scorecardsDir, "- a saltar");
    return;
  }

  const whs = JSON.parse(fs.readFileSync(whsPath, "utf-8"));
  const rows = whs?.Records || [];
  applyMelhorias(rows, FED);

  console.log(`Jogador: ${playerName || FED}${playerEscalao ? ' [' + playerEscalao + ']' : ''}`);

  const whsByScoreId = new Map();
  for (const r of rows) {
    if (r?.score_id != null) whsByScoreId.set(String(r.score_id), r);
  }

  const cardByScoreId = new Map();
  const holeCountByScoreId = new Map();
  const files = fs.readdirSync(scorecardsDir).filter(f => f.endsWith(".json"));
  for (const f of files) {
    const scoreId = path.basename(f, ".json");
    try {
      const json = JSON.parse(fs.readFileSync(path.join(scorecardsDir, f), "utf-8"));
      const rec = pickScorecardRec(json);
      if (rec) {
        applyMelhoriasScorecard(rec, FED, scoreId);
        cardByScoreId.set(String(scoreId), rec);
        holeCountByScoreId.set(String(scoreId), holeCountFromRec(rec));
      }
    } catch {}
  }

  const holeScores = {};
  for (const [scoreId, whsRow] of whsByScoreId.entries()) {
    const rec = cardByScoreId.get(scoreId);
    if (!rec) continue;
    const hc = holeCountFromRec(rec);
    const g = [], p = [], si = [], m = [];
    for (let i = 1; i <= hc; i++) {
      const gv = toNum(rec[`gross_${i}`]);
      g.push(gv && gv > 0 ? gv : null); // gross=0 means NR (No Return)
      p.push(toNum(rec[`par_${i}`]) ?? null);
      si.push(toNum(rec[`stroke_index_${i}`]) ?? null);
      m.push(toNum(rec[`meters_${i}`]) ?? null);
    }
    holeScores[scoreId] = { g, p, si, m, hc };
  }

  const rounds = [];
  
  // Processar rounds que estão no whs-list
  for (const [scoreId, whsRow] of whsByScoreId.entries()) {
    const rec = cardByScoreId.get(scoreId) || null;
    const dateObj = getPlayedAt(rec, whsRow);

    const course = getCourse(rec, whsRow);
    const holeCount = holeCountByScoreId.get(scoreId) || (rec ? holeCountFromRec(rec) : (toNum(whsRow?.holes) || 18));
    const displayCourse = courseAlias(course, holeCount, rec);
    const tee = getTee(rec, whsRow);
    const metersTotal = rec ? metersTotalFromRec(rec) : null;
    const eventName = pickEventName(whsRow, rec);

    let gross = pickGrossFromWHS(whsRow);
    if ((gross === "" || gross == null) && rec) {
      const cand = toNum(rec?.gross_total) ?? toNum(rec?.GrossTotal) ?? null;
      if (cand != null) gross = cand;
      else {
        const hc = holeCountByScoreId.get(scoreId) || holeCountFromRec(rec);
        let s = 0, c = 0;
        for (let i=1;i<=hc;i++){
          const v = toNum(rec?.[`gross_${i}`]);
          if (isMeaningful(v)) { s += v; c++; }
        }
        if (c>0) gross = s;
      }
    }

    rounds.push({
      scoreId,
      holeCount,
      course: displayCourse,
      courseOrig: course,
      courseKey: norm(displayCourse),
      date: fmtDate(dateObj),
      dateSort: dateObj ? dateObj.getTime() : 0,
      tee: tee || "",
      teeKey: normKey(tee || ""),
      meters: metersTotal != null ? metersTotal : "",
      gross: gross ?? "",
      par: rec ? parTotalFromRec(rec) : null,
      stb: whsRow.stableford ?? whsRow.Stableford ?? "",
      sd: whsRow.sgd ?? whsRow.SD ?? whsRow.sd ?? "",
      hi: pickHcpFromRow(whsRow),
      eventName: eventName || "",
      eventKey: norm(eventName || ""),
      scoreOrigin: whsRow.score_origin || "",
      hasCard: !!rec,
      _links: getMelhoriaLink(FED, scoreId),
      _pill: getMelhoriaPill(FED, scoreId),
      _group: getMelhoriaGroup(FED, scoreId),
      _showInTournament: getMelhoriaTornView(FED, scoreId)
    });
  }
  
  // Processar scorecards órfãos (existem na pasta mas não no whs-list)
  for (const [scoreId, rec] of cardByScoreId.entries()) {
    if (whsByScoreId.has(scoreId)) continue; // Já processado
    
    const dateObj = getPlayedAt(rec, null);
    if (!dateObj) continue; // Sem data válida, ignorar
    
    const course = getCourse(rec, null);
    const hcOrphan = holeCountFromRec(rec);
    const displayCourseOrphan = courseAlias(course, hcOrphan, rec);
    const tee = getTee(rec, null);
    const metersTotal = metersTotalFromRec(rec);
    const eventName = pickEventName(null, rec);
    
    let gross = toNum(rec?.gross_total) ?? toNum(rec?.GrossTotal) ?? null;
    if (gross == null) {
      const hc = hcOrphan;
      let s = 0, c = 0;
      for (let i=1; i<=hc; i++){
        const v = toNum(rec?.[`gross_${i}`]);
        if (isMeaningful(v)) { s += v; c++; }
      }
      if (c>0) gross = s;
    }
    
    rounds.push({
      scoreId,
      holeCount: hcOrphan,
      course: displayCourseOrphan,
      courseOrig: course,
      courseKey: norm(displayCourseOrphan),
      date: fmtDate(dateObj),
      dateSort: dateObj.getTime(),
      tee: tee || "",
      teeKey: normKey(tee || ""),
      meters: metersTotal != null ? metersTotal : "",
      gross: gross ?? "",
      par: parTotalFromRec(rec),
      stb: "",
      sd: "",
      hi: "",
      eventName: eventName || "",
      eventKey: norm(eventName || ""),
      scoreOrigin: "",
      hasCard: true,
      _links: getMelhoriaLink(FED, scoreId),
      _pill: getMelhoriaPill(FED, scoreId),
      _group: getMelhoriaGroup(FED, scoreId),
      _showInTournament: getMelhoriaTornView(FED, scoreId)
    });
  }

  // ===== Injectar treinos e extra_rounds do melhorias.json =====
  const melh = loadMelhorias();
  const melhPlayer = melh[String(FED)];
  if (melhPlayer) {
    // Treinos (Game Book) — com deduplicação por data+campo
    if (Array.isArray(melhPlayer.treinos)) {
      // Agrupar por data+campo para dedup
      const treinoGroups = new Map();
      for (let ti = 0; ti < melhPlayer.treinos.length; ti++) {
        const t = melhPlayer.treinos[ti];
        const key = (t.data || '') + '|' + norm(t.campo || '');
        if (!treinoGroups.has(key)) treinoGroups.set(key, []);
        treinoGroups.get(key).push({ idx: ti, t });
      }
      // Para cada grupo, manter o treino com mais informação
      const treinos = [];
      for (const [, group] of treinoGroups) {
        group.sort((a, b) => {
          // Preferir o que tem gross_holes (scorecard completo)
          const aScore = (a.t.gross_holes ? 10 : 0) + (a.t.gross != null ? 1 : 0) + (a.t.companhia ? 1 : 0);
          const bScore = (b.t.gross_holes ? 10 : 0) + (b.t.gross != null ? 1 : 0) + (b.t.companhia ? 1 : 0);
          return bScore - aScore;
        });
        treinos.push(group[0]);
        if (group.length > 1) {
          console.log(`  ↳ Dedup treino ${group[0].t.data} ${group[0].t.campo}: ${group.length} → 1 (mantido o mais completo)`);
        }
      }
      
      for (let i = 0; i < treinos.length; i++) {
        const { t } = treinos[i];
        const dp = (t.data || '').split('-');  // yyyy-mm-dd
        const dateObj = dp.length === 3 ? new Date(+dp[0], +dp[1]-1, +dp[2]) : null;
        const fakeId = 'treino_' + i;
        const hc = t.holes || 9;
        
        // Criar holeScores para treinos
        if (t.gross_holes && t.par_holes) {
          const cleanG = t.gross_holes.map(v => (v != null && v > 0) ? v : null);
          holeScores[fakeId] = {
            g: cleanG,
            p: t.par_holes,
            si: t.si_holes || [],
            m: t.meters_holes || [],
            hc: hc
          };
        }
        
        rounds.push({
          scoreId: fakeId,
          holeCount: hc,
          course: t.campo || '',
          courseOrig: t.campo || '',
          courseKey: norm(t.campo || ''),
          date: dateObj ? fmtDate(dateObj) : '',
          dateSort: dateObj ? dateObj.getTime() : 0,
          tee: '',
          teeKey: '',
          meters: '',
          gross: t.gross ?? '',
          par: t.par ?? null,
          stb: '',
          sd: '',
          hi: '',
          eventName: 'Treino' + (t.companhia ? ' (c/ ' + t.companhia + ')' : ''),
          eventKey: 'treino',
          scoreOrigin: 'Treino',
          hasCard: !!t.gross_holes,
          _isTreino: true,
          _fonte: t.fonte || 'Game Book'
        });
      }
      console.log(`  + ${treinos.length} treinos injectados (de ${melhPlayer.treinos.length} originais)`);
    }

    // Resolver nomes de campos dos treinos para coincidir com nomes FPG existentes
    // Recolher courseKeys dos rounds FPG
    const fpgCourseNames = new Map(); // norm(name) → displayName
    for (const r of rounds) {
      if (!r._isTreino && !r._isExtra && r.course) {
        fpgCourseNames.set(r.courseKey, r.course);
      }
    }
    // Para cada treino, tentar encontrar o campo FPG correspondente
    for (const r of rounds) {
      if (!r._isTreino) continue;
      if (fpgCourseNames.has(r.courseKey)) continue; // Já coincide
      
      // Tentar match parcial: "Desertas Course" → procurar courseKey que contenha "desertas"
      const treWords = r.courseKey.replace(/course|golfe|golf/gi, '').trim().split(/\s+/).filter(w => w.length > 2);
      let bestMatch = null, bestScore = 0;
      for (const [fKey, fName] of fpgCourseNames) {
        let score = 0;
        for (const w of treWords) {
          if (fKey.indexOf(w) >= 0) score++;
        }
        if (score > bestScore) { bestScore = score; bestMatch = { key: fKey, name: fName }; }
      }
      if (bestMatch && bestScore >= 1) {
        console.log(`  ↳ Treino "${r.course}" → "${bestMatch.name}"`);
        r.course = bestMatch.name;
        r.courseKey = bestMatch.key;
      }
    }

    // Extra rounds (torneios não aceites pela FPG)
    if (Array.isArray(melhPlayer.extra_rounds)) {
      for (let ei = 0; ei < melhPlayer.extra_rounds.length; ei++) {
        const ex = melhPlayer.extra_rounds[ei];
        if (!Array.isArray(ex.dias)) continue;
        for (let di = 0; di < ex.dias.length; di++) {
          const dia = ex.dias[di];
          const dp = (dia.data || '').split('-');
          const dateObj = dp.length === 3 ? new Date(+dp[0], +dp[1]-1, +dp[2]) : null;
          const fakeId = 'extra_' + ei + '_' + di;
          const hc = dia.holes || 18;
          
          if (dia.gross_holes && dia.par_holes) {
            const cleanG = dia.gross_holes.map(v => (v != null && v > 0) ? v : null);
            holeScores[fakeId] = {
              g: cleanG,
              p: dia.par_holes,
              si: dia.si_holes || [],
              m: dia.meters_holes || [],
              hc: hc
            };
          }
          
          const label = ex.torneio + (dia.dia ? ' ' + dia.dia : '');
          rounds.push({
            scoreId: fakeId,
            holeCount: hc,
            course: ex.campo || '',
            courseOrig: ex.campo || '',
            courseKey: norm(ex.campo || ''),
            date: dateObj ? fmtDate(dateObj) : '',
            dateSort: dateObj ? dateObj.getTime() : 0,
            tee: ex.categoria || '',
            teeKey: normKey(ex.categoria || ''),
            meters: dia.meters_total || '',
            gross: dia.gross ?? '',
            par: dia.par ?? null,
            stb: '',
            sd: '',
            hi: '',
            eventName: label,
            eventKey: norm(label),
            scoreOrigin: 'Extra',
            hasCard: !!dia.gross_holes,
            _isExtra: true,
            _showInTournament: !!ex.torneio_view,
            _naoAceiteFpg: ex.nao_aceite_fpg || false,
            _links: ex.links || (ex.link ? { link: ex.link } : null),
            _pill: ex.pill || ''
          });
        }
      }
      console.log(`  + ${melhPlayer.extra_rounds.length} extra round(s) injectados`);
    }
  }

  // ===== Preencher campos em falta para treinos e extra_rounds =====
  // 1) Calcular stableford (scratch) a partir de gross_holes/par_holes
  // 2) Estimar SD ≈ gross - par (sem slope/CR oficiais)
  // 3) Interpolar HI a partir dos records WHS mais próximos por data
  // 4) Preencher metros se disponíveis

  // Construir array de HI por data para interpolação
  const hiTimeline = rows
    .filter(r => r.new_handicap != null && r.hcp_dateStr)
    .map(r => ({ date: new Date(r.hcp_dateStr).getTime(), hi: r.new_handicap }))
    .sort((a, b) => a.date - b.date);

  function interpolateHI(dateSort) {
    if (!hiTimeline.length || !dateSort) return null;
    // Encontrar o HI mais próximo anterior ou igual à data
    let best = null;
    for (const h of hiTimeline) {
      if (h.date <= dateSort) best = h.hi;
      else break;
    }
    // Se não há anterior, usar o primeiro disponível
    if (best == null && hiTimeline.length) best = hiTimeline[0].hi;
    return best;
  }

  function calcScratchStableford(grossHoles, parHoles) {
    if (!grossHoles || !parHoles) return null;
    let total = 0;
    for (let i = 0; i < grossHoles.length; i++) {
      const g = grossHoles[i], p = parHoles[i];
      if (g != null && g > 0 && p != null) {
        total += Math.max(0, 2 + p - g);
      }
    }
    return total;
  }

  for (const r of rounds) {
    if (!r._isTreino && !r._isExtra) continue;

    const hs = holeScores[r.scoreId];

    // Stableford (scratch — sem handicap de jogo)
    if ((r.stb === '' || r.stb == null) && hs && hs.g && hs.p) {
      r.stb = calcScratchStableford(hs.g, hs.p);
    }

    // SD estimado ≈ gross - par (slope=113, CR≈par)
    if ((r.sd === '' || r.sd == null) && r.gross != null && r.gross !== '' && r.par != null) {
      const sdEst = Number(r.gross) - Number(r.par);
      r.sd = sdEst;
      r._sdEstimated = true;
    }

    // HI interpolado
    if ((r.hi === '' || r.hi == null) && r.dateSort) {
      r.hi = interpolateHI(r.dateSort);
    }

    // Metros totais
    if ((r.meters === '' || r.meters == null) && hs && hs.m && hs.m.length) {
      const mTotal = hs.m.reduce((s, v) => s + (v || 0), 0);
      if (mTotal > 0) r.meters = mTotal;
    }
  }

  const byCourse = new Map();
  for (const r of rounds) {
    if (!byCourse.has(r.courseKey)) byCourse.set(r.courseKey, { course: r.course, rounds: [] });
    byCourse.get(r.courseKey).rounds.push(r);
  }

  const courses = Array.from(byCourse.values()).map(c => {
    c.rounds.sort((a,b) => (b.dateSort - a.dateSort) || String(b.scoreId).localeCompare(String(a.scoreId)));
    const last = c.rounds[0] || null;
    return { course: c.course, count: c.rounds.length, lastDateSort: last?.dateSort || 0, rounds: c.rounds };
  });

  // Build teeMap per course (used for eclectic + hole stats)
  const teeMapByCourse = {};
  for (const c of courses) {
    const teeMap = new Map();
    for (const r of c.rounds) {
      if (!r.hasCard) continue;
      const rec = cardByScoreId.get(String(r.scoreId));
      if (!rec) continue;
      const tName = getTee(rec, whsByScoreId.get(String(r.scoreId)) || {});
      const tKey = normKey(tName);
      if (!teeMap.has(tKey)) teeMap.set(tKey, { teeName: tName, recs: [] });
      teeMap.get(tKey).recs.push({ rec, scoreId: String(r.scoreId), date: r.date || "", holeCount: holeCountByScoreId.get(String(r.scoreId)) || holeCountFromRec(rec) });
    }
    teeMapByCourse[norm(c.course)] = teeMap;
  }

  const eclecticByCourse = {};
  for (const c of courses) {
    const teeMap = teeMapByCourse[norm(c.course)] || new Map();
    const ecList = [];
    for (const [, obj] of teeMap.entries()) {
      const ec = computeEclecticForTee(obj.recs, obj.teeName);
      if (ec) ecList.push(ec);
    }
    ecList.sort((a,b)=> (b.holeCount - a.holeCount) || a.teeName.localeCompare(b.teeName));
    eclecticByCourse[norm(c.course)] = ecList;
  }


  // Detalhes do ecletico por curso+teeKey para UI (buraco a buraco)
  const eclecticDetails = {};
  for (const c of courses) {
    const key = norm(c.course);
    const list = eclecticByCourse[key] || [];
    if (!list.length) continue;
    eclecticDetails[key] = {};
    for (const ec of list) {
      eclecticDetails[key][ec.teeKey] = ec; // inclui holes[]
    }
  }

  // Análise por buraco (course+tee) para UI
  const courseHoleStats = {};
  for (const c of courses) {
    const key = norm(c.course);
    const teeMap = teeMapByCourse[key] || new Map();
    if (!teeMap.size) continue;
    courseHoleStats[key] = {};
    for (const [tk, obj] of teeMap.entries()) {
      const hs = computeHoleStats(obj.recs, obj.teeName);
      if (hs) courseHoleStats[key][tk] = hs;
    }
  }

  const analysisDir = path.join(baseDir, "analysis");
  fs.mkdirSync(analysisDir, { recursive: true });

  // Extract HCP calculation info from newest WHS record
  const sortedRows = rows.length > 0 ? [...rows].sort((a, b) => {
    const da = parseDotNetDate(a.played_at || a.hcp_date) || new Date(0);
    const db = parseDotNetDate(b.played_at || b.hcp_date) || new Date(0);
    return db - da;
  }) : [];
  const newestRow = sortedRows[0] || {};
  const hcpInfo = {
    // new_handicap = post-round HCP (authoritative)
    // exact_handicap = prev_handicap (pre-round) — NOT more precise, do NOT use
    current: toNum(newestRow.new_handicap) ?? null,
    lowHcp: toNum(newestRow.calc_low_hcp) ?? null,
    softCap: toNum(newestRow.calc_hcp_softcap) ?? null,
    hardCap: toNum(newestRow.calc_hcp_hardcap) ?? null,
    scoreAvg: toNum(newestRow.calc_score_avg) ?? null,
    qtyScores: toNum(newestRow.calc_qty_scores) ?? null,
    qtyCalc: toNum(newestRow.calc_qty_scores_calc) ?? null,
    adjustTotal: toNum(newestRow.calc_adjust_total) ?? null
  };

  // Data de última actualização: data da ronda mais recente
  const mostRecentRound = rounds.length > 0 ? rounds.reduce((a, b) => (b.dateSort || 0) > (a.dateSort || 0) ? b : a) : null;
  const lastRoundDate = mostRecentRound?.date || '';
  const now = new Date();
  const generatedDate = String(now.getDate()).padStart(2,'0') + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + now.getFullYear();

  return {
    FED, players, playerName,
    courses, holeScores,
    eclecticByCourse, eclecticDetails, courseHoleStats,
    hcpInfo, generatedDate, lastRoundDate, analysisDir
  };
}

module.exports = { preparePlayerData };
