// lib/process-data.js — Load and prepare all player data for template rendering
const fs = require("fs");
const path = require("path");
const { loadMelhorias, applyMelhorias, applyMelhoriasScorecard,
  getMelhoriaLink, getMelhoriaPill, getMelhoriaGroup, getMelhoriaTornView } = require("./melhorias");
const { normKey } = require("./tee-colors");
const { norm, parseDotNetDate, fmtDate, toNum, pickHcpFromRow, isMeaningful,
  pickScorecardRec, metersTotalFromRec, getTee, getCourse,
  courseAlias, getPlayedAt, pickEventName, pickGrossFromWHS,
  normalizeWhsRows, normalizeCourse,
  loadWhsRows, loadScorecardsByScoreId } = require("./helpers");
const { holeCountFromRec, parTotalFromRec } = require("./scorecard-fragment");
const { computeEclecticForTee } = require("./eclectic");
const { computeHoleStats } = require("./hole-stats");
const { canonicalCourseName, rotateAroeira2RecordIfNeeded, resolveAroeiraIIByPar, resolveSantoDaSerraByPar } = require("./course-aliases");

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

  // Aceita ambos os formatos: whs.json (novo) ou whs-list.json (antigo);
  // scorecards.json (novo) ou scorecards/ (antigo)
  const rows = loadWhsRows(baseDir);
  if (!rows) {
    console.error("  ⚠ Não encontrei whs.json nem whs-list.json em:", baseDir, "- a saltar");
    return;
  }

  // ── Normalizar formato novo (Schema 2) → nomes Schema 1 ──
  normalizeWhsRows(rows);

  // ── Derivar new_handicap / prev_handicap da sequência de exact_hcp ──
  // A API antiga (HCPWhsFederLST) incluía prev_handicap e new_handicap por ronda.
  // A nova (ResultsLST) só inclui exact_hcp (= HCP pré-ronda).
  // Derivação: new_handicap da ronda N = exact_hcp da ronda N+1 (seguinte cronológica qualificativa)
  const qualifSorted = rows
    .filter(r => r.hcp_qualifying_round === 1 || (r.hcp_qualifying_name || "").toLowerCase() === "sim")
    .sort((a, b) => {
      const da = parseDotNetDate(a.score_date || a.hcp_date) || new Date(0);
      const db = parseDotNetDate(b.score_date || b.hcp_date) || new Date(0);
      return da - db; // oldest first
    });

  for (let i = 0; i < qualifSorted.length; i++) {
    const r = qualifSorted[i];
    // prev_handicap = exact_hcp desta ronda (HCP antes de jogar)
    if (r.prev_handicap == null && r.exact_hcp != null) {
      r.prev_handicap = r.exact_hcp;
    }
    // new_handicap = exact_hcp da próxima ronda qualificativa (HCP depois desta ser processada)
    if (r.new_handicap == null && i + 1 < qualifSorted.length) {
      r.new_handicap = qualifSorted[i + 1].exact_hcp;
    }
  }

  // ── Para a ronda mais recente (Schema 2): calcular HCP a partir dos SDs ──
  // WHS: média dos N melhores SDs das últimas 20 rondas qualificativas
  const _whsCalcCount = [
    /* 0*/0,/*1*/0,/*2*/0,/*3*/1,/*4*/1,/*5*/1,/*6*/2,/*7*/2,/*8*/2,
    /*9*/3,/*10*/3,/*11*/3,/*12*/4,/*13*/4,/*14*/4,/*15*/5,/*16*/5,
    /*17*/6,/*18*/6,/*19*/7,/*20*/8
  ];
  const _whsAdjust = [0,0,0,-2,-1,0,-1,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
  let _derivedHcpFromSDs = null;
  let _derivedScoreAvg = null;
  let _derivedQtyScores = null;
  let _derivedQtyCalc = null;
  let _derivedLowHcp = null;

  if (qualifSorted.length > 0) {
    const lastQualif = qualifSorted[qualifSorted.length - 1];
    const isSchema2 = lastQualif.score_date != null && lastQualif.new_handicap == null;

    if (isSchema2) {
      // Reunir SDs de todas as rondas qualificativas (últimas 20)
      const last20Qualif = qualifSorted.slice(-20);
      const sds = [];
      for (const r of last20Qualif) {
        const sd = toNum(r.sgd) ?? toNum(r.score_differential);
        if (sd != null) sds.push(sd);
      }
      _derivedQtyScores = sds.length;

      if (sds.length >= 3) {
        const n = _whsCalcCount[Math.min(sds.length, 20)];
        const adj = _whsAdjust[Math.min(sds.length, 20)];
        _derivedQtyCalc = n;
        const bestN = [...sds].sort((a, b) => a - b).slice(0, n);
        const avg = bestN.reduce((a, b) => a + b, 0) / bestN.length;
        _derivedScoreAvg = Math.round(avg * 10) / 10;
        _derivedHcpFromSDs = Math.round((avg + adj) * 10) / 10;

        // Calcular lowHcp: mínimo exact_hcp de todas as rondas qualificativas
        // (exact_hcp = HCP real do jogador no momento de cada ronda)
        const allExactHcps = qualifSorted
          .map(r => toNum(r.exact_hcp))
          .filter(v => v != null);
        _derivedLowHcp = Math.min(_derivedHcpFromSDs, ...allExactHcps);

        // Atribuir ao last qualifying round
        lastQualif.new_handicap = _derivedHcpFromSDs;
      } else {
        // Menos de 3 scores: usar calc_hcp_index ou exact_hcp
        lastQualif.new_handicap = lastQualif.calc_hcp_index ?? lastQualif.exact_hcp;
        _derivedHcpFromSDs = toNum(lastQualif.new_handicap);
      }
    } else {
      // Schema 1 ou ronda já tem new_handicap
      if (lastQualif.new_handicap == null) {
        lastQualif.new_handicap = lastQualif.calc_hcp_index ?? lastQualif.exact_hcp;
      }
    }
  }

  // Propagar new_handicap/prev_handicap também para rondas não-qualificativas
  // (usar o HI mais recente anterior)
  const allSorted = [...rows].sort((a, b) => {
    const da = parseDotNetDate(a.score_date || a.hcp_date) || new Date(0);
    const db = parseDotNetDate(b.score_date || b.hcp_date) || new Date(0);
    return da - db;
  });
  let lastKnownHI = null;
  for (const r of allSorted) {
    if (r.new_handicap != null) lastKnownHI = r.new_handicap;
    if (r.prev_handicap == null && r.exact_hcp != null) r.prev_handicap = r.exact_hcp;
    if (r.new_handicap == null && lastKnownHI != null) r.new_handicap = lastKnownHI;
  }

  applyMelhorias(rows, FED);

  console.log(`Jogador: ${playerName || FED}${playerEscalao ? ' [' + playerEscalao + ']' : ''}`);
  if (_derivedHcpFromSDs != null) {
    console.log(`  [Schema2] HCP derivado dos SDs: ${_derivedHcpFromSDs} (${_derivedQtyCalc} de ${_derivedQtyScores} scores)`);
  }
  const whsByScoreId = new Map();
  // Registos administrativos (Atribuição/Alteração de HCP) têm score_id=null mas
  // um `id` interno que pode coincidir com ficheiros de scorecard antigos. Guardar
  // esses IDs para excluí-los do processamento de scorecards órfãos.
  const adminIds = new Set();
  for (const r of rows) {
    if (r?.score_id != null) {
      whsByScoreId.set(String(r.score_id), r);
    } else if (r?.id != null) {
      adminIds.add(String(r.id));
    }
  }

  // Aceita scorecards.json (novo) e/ou scorecards/ (antigo) — merge dos dois
  const cardByScoreId = loadScorecardsByScoreId(baseDir);
  const holeCountByScoreId = new Map();
  let _rotatedCount = 0;
  for (const [scoreId, rec] of cardByScoreId.entries()) {
    applyMelhoriasScorecard(rec, FED, scoreId);
    // Aroeira No.2 — rodar +12 records que vieram na config antiga (ex:
    // Campeonato Nacional Jovens 2026). Detectado pelo par_1..par_18 do
    // próprio rec, sem depender de data nem de mapeamento de tcode.
    // Vê comentário em lib/course-aliases.js.
    if (rotateAroeira2RecordIfNeeded(rec)) _rotatedCount++;
    // Canonicar nome do campo no rec (ex: "PGA Aroeira No.2 - CNJ FPG"
    // → "PGA Aroeira No.2", "Aroeira Challenge" → "PGA Aroeira No.2",
    // "Aroeira Pines Classic" → "PGA Aroeira No.1", etc.).
    if (rec.course_description) {
      rec.course_description = canonicalCourseName(rec.course_description);
      // Construir array de pars consistente com o holeCount do scorecard.
      // Suporta back-9 (starting_hole=10) lendo par_10..par_18 quando par_1
      // está em falta.
      const hc = holeCountFromRec(rec);
      const start = hc === 9 && rec.par_1 == null && rec.par_10 != null ? 10 : 1;
      const pars = [];
      for (let i = start; i < start + hc; i++) {
        const v = rec[`par_${i}`];
        if (v == null) break;
        pars.push(Number(v));
      }
      // "Aroeira II" é ambíguo — resolver pelo par[] (só faz sentido em 18H).
      if (pars.length === 18) {
        rec.course_description = resolveAroeiraIIByPar(rec.course_description, pars);
      }
      // Santo da Serra — re-etiquetar pelo par[]:
      //   9H: corrige nine mal-etiquetado (Desertas com par Serras → Serras)
      //  18H: colapsa permutações F9/B9 (Serras-Machico ↔ Machico-Serras)
      if (pars.length === 9 || pars.length === 18) {
        rec.course_description = resolveSantoDaSerraByPar(rec.course_description, pars);
      }
    }
    holeCountByScoreId.set(scoreId, holeCountFromRec(rec));
  }
  if (_rotatedCount > 0) {
    console.log(`  ↻ ${_rotatedCount} scorecard(s) do Aroeira No.2 rotacionados +12 (config antiga → nova)`);
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
      _isTeamEvent: whsRow.competition_type_id != null && whsRow.competition_type_id !== 10,
      // tcode + ccode — identificadores canónicos do torneio na FPG.
      //   tcode (tournament_code) vem do WHS feed.
      //   ccode (club_code) vem do scorecard — é o clube ORGANIZADOR (não
      //   o local físico nem o clube do jogador). Sem isto, a URL
      //   Classifications.aspx?ccode=000&tcode=X só funcionava para torneios
      //   organizados pela FPG. Com ccode certo, qualquer torneio organizado
      //   por clube (Aroeira=009, CGSS=007, etc.) abre na página correcta.
      // Vazios para rondas que não são torneios FPG (treinos/EDS/individuais).
      tcode: whsRow.tournament_code || "",
      ccode: rec?.club_code || "",
      tournamentId: whsRow.tournament_id ?? null,
      _links: getMelhoriaLink(FED, scoreId),
      _pill: getMelhoriaPill(FED, scoreId) || (course === "INTERNACIONAL" || (whsRow.score_origin || "").trim().toLowerCase() === "intern" ? "INTL" : ""),
      _group: getMelhoriaGroup(FED, scoreId),
      _showInTournament: getMelhoriaTornView(FED, scoreId)
    });
  }
  
  // Processar scorecards órfãos (existem na pasta mas não no whs-list)
  for (const [scoreId, rec] of cardByScoreId.entries()) {
    if (whsByScoreId.has(scoreId)) continue; // Já processado

    // Rejeitar scorecards de OUTROS jogadores — ficheiros que foram parar
    // ao directório deste federado por erro no scraper/descarga antiga.
    // Rejeitar se: (a) fed_code preenchido e diferente do jogador, ou
    // (b) fed_code vazio (formatos antigos de equipa/greensomes sem ID).
    const scFed = String(rec?.federated_code || "").trim();
    if (scFed !== String(FED)) {
      continue; // Scorecard pertence a outro federado ou sem fed_code
    }

    if (adminIds.has(scoreId)) {             // ID interno de registo admin (Atribuição/Alteração HCP)
      console.log(`  ⊘ Scorecard órfão ${scoreId} é ID admin — ignorado`);
      continue;
    }

    const dateObj = getPlayedAt(rec, null);
    if (!dateObj) continue; // Sem data válida, ignorar

    const course = getCourse(rec, null);
    const eventName = pickEventName(null, rec);

    const hcOrphan = holeCountFromRec(rec);
    const displayCourseOrphan = courseAlias(course, hcOrphan, rec);
    const tee = getTee(rec, null);
    const metersTotal = metersTotalFromRec(rec);
    
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
      // Idem: scorecards órfãos também propagam tcode + ccode quando disponíveis.
      tcode: rec?.tournament_code || "",
      ccode: rec?.club_code || "",
      tournamentId: rec?.tournament_id ?? null,
      _links: getMelhoriaLink(FED, scoreId),
      _pill: getMelhoriaPill(FED, scoreId) || (course === "INTERNACIONAL" ? "INTL" : ""),
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
          course: normalizeCourse(t.campo || ''),
          courseOrig: t.campo || '',
          courseKey: norm(normalizeCourse(t.campo || '')),
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
            course: normalizeCourse(ex.campo || ''),
            courseOrig: ex.campo || '',
            courseKey: norm(normalizeCourse(ex.campo || '')),
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


  // ── Deduplicar rondas no mesmo dia e campo e gross ────────────────────────
  // Chave: dia-normalizado + campo + gross
  //   - dia normalizado (floor para o dia) elimina diferenças de hora do mesmo dia
  //   - gross na chave garante que rondas diferentes no mesmo dia/campo são preservadas
  // Preferência (por ordem decrescente de prioridade):
  //   1. Tem scorecard completo (hasCard)
  //   2. Origin "Torn" (torneio oficial FPG) > "Indiv" / "EDS" / outros > sem origin
  //   3. Em empate perfeito, mantém o de scoreId menor (mais antigo/oficial)
  // Treinos e extra_rounds excluídos.
  {
    // Peso de scoreOrigin: maior = mais preferido
    function _originWeight(origin) {
      const o = (origin || '').trim().toUpperCase();
      if (o === 'TORN')   return 3;
      if (o === 'INDIV')  return 2;
      if (o === 'EDS' || o === 'IMPORT' || o === 'INTERN') return 1;
      if (o !== '')       return 1; // qualquer outro preenchido
      return 0;
    }
    // Retorna true se o candidato `a` é preferível ao `b`
    function _preferA(a, b) {
      // 1. Prefere quem tem scorecard
      if (a.hasCard && !b.hasCard) return true;
      if (!a.hasCard && b.hasCard) return false;
      // 2. Prefere origin mais "oficial"
      const wa = _originWeight(a.scoreOrigin);
      const wb = _originWeight(b.scoreOrigin);
      if (wa !== wb) return wa > wb;
      // 3. Empate: scoreId numérico menor (mais antigo) ou string menor
      const na = parseInt(a.scoreId), nb = parseInt(b.scoreId);
      if (!isNaN(na) && !isNaN(nb)) return na < nb;
      return String(a.scoreId) < String(b.scoreId);
    }

    const _seen = new Map(); // chave → índice da ronda escolhida
    const _toRemove = new Set();
    const MS_PER_DAY = 86400000;

    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      if (r._isTreino || r._isExtra || !r.dateSort) continue;
      // Normalizar para dia (elimina diferenças de hora/timezone)
      const dayNum = Math.floor(r.dateSort / MS_PER_DAY);
      // Gross como string — se vazio/null não deduplicamos
      const g = (r.gross != null && r.gross !== '') ? String(r.gross) : null;
      if (!g) continue;

      const key = dayNum + '|' + r.courseKey + '|' + g;

      if (!_seen.has(key)) {
        _seen.set(key, i);
      } else {
        const prevIdx = _seen.get(key);
        const prev = rounds[prevIdx];

        if (_preferA(r, prev)) {
          // Novo (r) é melhor: descarta prev
          _toRemove.add(prevIdx);
          _seen.set(key, i);
          console.log('  ↳ Dedup ' + r.date + ' ' + r.course + ' gross=' + g
            + ': mantém #' + r.scoreId
            + ' (origin="' + r.scoreOrigin + '"' + (r.hasCard ? ', c/card' : '') + ')'
            + ', remove #' + prev.scoreId
            + ' (origin="' + prev.scoreOrigin + '"' + (prev.hasCard ? ', c/card' : '') + ')');
        } else {
          // Anterior (prev) é melhor ou igual: descarta novo
          _toRemove.add(i);
          console.log('  ↳ Dedup ' + r.date + ' ' + r.course + ' gross=' + g
            + ': mantém #' + prev.scoreId
            + ' (origin="' + prev.scoreOrigin + '"' + (prev.hasCard ? ', c/card' : '') + ')'
            + ', remove #' + r.scoreId
            + ' (origin="' + r.scoreOrigin + '"' + (r.hasCard ? ', c/card' : '') + ')');
        }
      }
    }

    if (_toRemove.size > 0) {
      rounds.splice(0, rounds.length, ...rounds.filter((_, i) => !_toRemove.has(i)));
      console.log('  ↳ ' + _toRemove.size + ' ronda(s) duplicada(s) removida(s)');
    }
  }

  // ── 2ª passagem: remover scorecards "órfãos" sem origin que coexistem
  // com uma ronda oficial (origin="Torn"/"Indiv"/etc.) no mesmo dia + campo.
  // Estes são versões parciais/preliminares do mesmo evento que a 1ª passagem
  // não apanhou porque o gross diferia ligeiramente (ex: scorecard incompleto
  // a ser actualizado em vários momentos pelo organizador).
  // Critério de remoção:
  //   - Mesmo dia + mesmo courseKey
  //   - Existe uma ronda com origin não-vazio (Torn/Indiv/etc.)
  //   - A ronda candidata tem origin "" (vazio) E não é treino/extra
  {
    const MS_PER_DAY = 86400000;
    // Agrupar por dia+campo, separando "oficiais" de "órfãos"
    const dayCourse = new Map(); // key → { official: [], orphans: [] }
    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      if (r._isTreino || r._isExtra || !r.dateSort) continue;
      const key = Math.floor(r.dateSort / MS_PER_DAY) + '|' + r.courseKey;
      if (!dayCourse.has(key)) dayCourse.set(key, { official: [], orphans: [] });
      const slot = dayCourse.get(key);
      const origin = (r.scoreOrigin || '').trim();
      if (origin === '') slot.orphans.push(i);
      else slot.official.push(i);
    }
    const _toRemove2 = new Set();
    for (const [, slot] of dayCourse) {
      if (slot.official.length > 0 && slot.orphans.length > 0) {
        // Há pelo menos 1 oficial → todos os órfãos do mesmo dia+campo são lixo
        for (const idx of slot.orphans) {
          _toRemove2.add(idx);
          const r = rounds[idx];
          const off = rounds[slot.official[0]];
          console.log('  ↳ Dedup órfão ' + r.date + ' ' + r.course + ' gross=' + r.gross
            + ': remove #' + r.scoreId + ' (origin="", versão preliminar)'
            + ' — existe oficial #' + off.scoreId + ' (origin="' + off.scoreOrigin + '")');
        }
      }
    }
    if (_toRemove2.size > 0) {
      rounds.splice(0, rounds.length, ...rounds.filter((_, i) => !_toRemove2.has(i)));
      console.log('  ↳ ' + _toRemove2.size + ' ronda(s) órfã(s) removida(s)');
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
  // Preferir ronda qualificativa mais recente para current HCP (new_handicap)
  const sortedRows = rows.length > 0 ? [...rows].sort((a, b) => {
    const da = parseDotNetDate(a.played_at || a.hcp_date) || new Date(0);
    const db = parseDotNetDate(b.played_at || b.hcp_date) || new Date(0);
    return db - da;
  }) : [];
  const newestRow = sortedRows[0] || {};
  const hcpInfo = {
    // new_handicap = post-round HCP (authoritative, já incorpora qualifying status)
    // Para Schema 2: derivado dos SDs se calc_* não existem
    current: toNum(newestRow.new_handicap) ?? _derivedHcpFromSDs ?? null,
    lowHcp: toNum(newestRow.calc_low_hcp) ?? _derivedLowHcp ?? null,
    softCap: toNum(newestRow.calc_hcp_softcap) ?? null,
    hardCap: toNum(newestRow.calc_hcp_hardcap) ?? null,
    scoreAvg: toNum(newestRow.calc_score_avg) ?? _derivedScoreAvg ?? null,
    qtyScores: toNum(newestRow.calc_qty_scores) ?? _derivedQtyScores ?? null,
    qtyCalc: toNum(newestRow.calc_qty_scores_calc) ?? _derivedQtyCalc ?? null,
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
