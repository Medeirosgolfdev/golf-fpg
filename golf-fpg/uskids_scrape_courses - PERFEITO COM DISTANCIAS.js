/*
 * USKids Golf — Scraper com PAR + YARDS reais por buraco
 * 
 * CORRER EM: https://www.signupanytime.com (consola F12)
 * 
 * Fonte dos dados:
 *   GetMeta → flight_courses[flight_round_id].pars[]   = par por buraco
 *   GetMeta → flight_courses[flight_round_id].lengths[] = yards por buraco
 *   GetMeta → flight_rounds[flight_round_id]            = flight, course, round, date
 *   GetMeta → courses[course_id].name                   = nome do campo
 *   GetMeta → age_groups                                = escalões
 *   GetPlayerTeeTimes                                   = scorecards
 *
 * Grava: uskids_torneios_completos(1).json, (2).json, etc.
 */

(async function(){

  var TOURNAMENTS = [
    {t:"18124"}, {t:"13568"}, {t:"21004"}, {t:"20895"},
    {t:"8300"}, {t:"11604"}, {t:"12229"}, {t:"14218"},
    {t:"14029"}, {t:"14302"}, {t:"15573"}, {t:"15704"},
    {t:"16705"}, {t:"18719"}, {t:"18242"}, {t:"16428"}
  ];

  var seen = {};
  TOURNAMENTS = TOURNAMENTS.filter(function(x){ if(seen[x.t]) return false; seen[x.t]=1; return true; });

  var BASE = '/plugins/links/admin/LinksAJAX.aspx';
  var IFRAME_BASE = '/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=';
  var DELAY = 500;

  async function safeJSON(url, ms){
    ms = ms || 6000;
    var ctrl = new AbortController();
    var timer = setTimeout(function(){ ctrl.abort(); }, ms);
    try {
      var r = await fetch(url, {signal: ctrl.signal});
      clearTimeout(timer);
      var t = await r.text();
      return JSON.parse(t);
    } catch(e){ clearTimeout(timer); return null; }
  }

  console.log('%c⛳ USKids Scraper — ' + TOURNAMENTS.length + ' torneios', 'color:green;font-weight:bold;font-size:16px');
  var t0 = Date.now();

  for(var ti = 0; ti < TOURNAMENTS.length; ti++){
    var tId = TOURNAMENTS[ti].t;
    var pct = ((ti+1)/TOURNAMENTS.length*100).toFixed(0);
    document.title = pct + '% (' + (ti+1) + '/' + TOURNAMENTS.length + ') t=' + tId;
    console.log('%c\n━━━ ' + (ti+1) + '/' + TOURNAMENTS.length + ' — t=' + tId + ' ━━━', 'color:#2563eb;font-weight:bold');

    try {
      /* ═══ 1. GetMeta ═══ */
      var meta = await safeJSON(BASE + '?op=GetMeta&t=' + tId, 10000);
      if(!meta){ console.error('❌ GetMeta falhou t=' + tId); continue; }

      var tournMeta = meta.tournament || {};
      var tournName = tournMeta.name || 'Tournament ' + tId;
      console.log('📋 ' + tournName + ' | R:' + (tournMeta.rounds||'?') + ' | ' + (tournMeta.start_date||'?'));

      /* ═══ 2. flight_courses → PAR + YARDS por buraco ═══ */
      var flightCourses = meta.flight_courses || {};
      var flightRounds = meta.flight_rounds || {};
      var coursesRaw = meta.courses || {};
      var ageGroups = meta.age_groups || {};
      var metaFlights = meta.flights || {};

      /* Construir mapa: flight_round_id → {pars, lengths, course, courseName} */
      var roundInfo = {};
      var courseParData = {};  /* course_id → {pars, lengths, courseName} por tee/flight */

      for(var frId in flightCourses){
        var fc = flightCourses[frId];
        var fr = flightRounds[frId] || {};
        var courseId = fc.course || fr.course || null;
        var courseName = courseId && coursesRaw[courseId] ? coursesRaw[courseId].name : '';

        var pars = fc.pars || [];
        var lengths = fc.lengths || [];

        /* Filtrar zeros (buracos não jogados) */
        var holes = [];
        for(var hi = 0; hi < pars.length; hi++){
          if(pars[hi] > 0 || lengths[hi] > 0){
            holes.push({
              number: hi + 1,
              par: pars[hi] || 0,
              yards: lengths[hi] || 0
            });
          }
        }

        var totalPar = holes.reduce(function(s,h){ return s + h.par; }, 0);
        var totalYards = holes.reduce(function(s,h){ return s + h.yards; }, 0);

        roundInfo[frId] = {
          flightRoundId: frId,
          flightId: String(fr.flight || ''),
          round: fr.round || null,
          date: fr.date || null,
          courseId: courseId ? String(courseId) : null,
          courseName: courseName,
          startingHole: fr.starting_hole || '1',
          numHoles: holes.length,
          totalPar: totalPar,
          totalYards: totalYards,
          holes: holes,
          pars: pars,
          lengths: lengths
        };
      }

      var nWithPar = Object.values(roundInfo).filter(function(r){ return r.totalPar > 0; }).length;
      console.log('   🏌️ ' + Object.keys(roundInfo).length + ' flight_rounds, ' + nWithPar + ' com par/yards');

      /* Resumir cursos únicos */
      var uniqueCourses = {};
      for(var ri in roundInfo){
        var r = roundInfo[ri];
        if(r.totalPar === 0) continue;
        var ck = (r.courseName || r.courseId) + '_' + r.numHoles + 'h';
        if(!uniqueCourses[ck]) uniqueCourses[ck] = r;
        /* Preferir a versão com mais yards (tee mais longo) */
        if(r.totalYards > uniqueCourses[ck].totalYards) uniqueCourses[ck] = r;
      }
      for(var uk in uniqueCourses){
        var uc = uniqueCourses[uk];
        console.log('   ⛳ ' + (uc.courseName || 'Course ' + uc.courseId) + ': ' + uc.numHoles + 'h par ' + uc.totalPar + ' | ' + uc.totalYards + 'y');
      }

      /* ═══ 3. Flight categories ═══ */
      var flightCats = {};
      var flightTees = {};

      /* Via meta.flights → age_group → age_groups[id].name */
      for(var fId in metaFlights){
        var fl = metaFlights[fId];
        var agId = fl.age_group;
        if(agId && ageGroups[agId]){
          flightCats[fId] = ageGroups[agId].name || '';
          if(ageGroups[agId].tee_marker) flightTees[fId] = ageGroups[agId].tee_marker;
        }
        if(fl.name) flightCats[fId] = fl.name;
      }

      /* teeMarkers mapping */
      var teeMarkers = meta.teeMarkers || {};

      /* Fallback: HTML select */
      if(Object.keys(flightCats).length === 0){
        try {
          var ifrResp = await fetch(IFRAME_BASE + tId);
          var ifrHtml = await ifrResp.text();
          var doc = new DOMParser().parseFromString(ifrHtml, 'text/html');
          var sel = doc.getElementById('view_flight_age_group');
          if(sel) for(var si=0; si<sel.options.length; si++) flightCats[sel.options[si].value] = sel.options[si].text.trim();
        } catch(e){}
      }

      var fIds = Object.keys(flightCats);
      if(fIds.length === 0) fIds = Object.keys(metaFlights);
      console.log('   📂 ' + fIds.length + ' flights');

      /* ═══ 4. Mapa flight → flight_rounds (para ligar par ao flight) ═══ */
      var flightToRounds = {};
      for(var frId2 in flightRounds){
        var fr2 = flightRounds[frId2];
        var fKey = String(fr2.flight || '');
        if(!flightToRounds[fKey]) flightToRounds[fKey] = {};
        flightToRounds[fKey][fr2.round || 1] = frId2;
      }

      /* ═══ 5. Scorecards por flight ═══ */
      var flightData = {};

      for(var fi = 0; fi < fIds.length; fi++){
        var fid = fIds[fi];
        var catName = flightCats[fid] || 'Flight ' + fid;
        document.title = pct + '% t=' + tId + ' ' + catName + ' (' + (fi+1) + '/' + fIds.length + ')';

        var sc = await safeJSON(BASE + '?op=GetPlayerTeeTimes&f=' + fid + '&r=3&p=1&t=0', 8000);
        if(!sc) sc = await safeJSON(BASE + '?op=GetPlayerTeeTimes&f=' + fid + '&r=3&p=1&t=1', 8000);

        var players = sc ? (sc.flight_players || sc.players || {}) : {};
        var nP = Object.keys(players).length;

        /* Par/yards deste flight */
        var fRounds = flightToRounds[fid] || {};
        var courseInfo = {};
        for(var rn in fRounds){
          var frInfo = roundInfo[fRounds[rn]];
          if(frInfo) courseInfo['R' + rn] = {
            courseName: frInfo.courseName,
            numHoles: frInfo.numHoles,
            totalPar: frInfo.totalPar,
            totalYards: frInfo.totalYards,
            holes: frInfo.holes
          };
        }

        flightData[fid] = {
          flight_id: fid,
          category: catName,
          tee_marker: flightTees[fid] || null,
          course_info: courseInfo,
          flight_players: players
        };

        var parStr = Object.values(courseInfo).map(function(c){ return c.numHoles + 'h par ' + c.totalPar + '/' + c.totalYards + 'y'; }).join(', ');
        console.log('   ✅ ' + catName + ': ' + nP + ' jog' + (parStr ? ' | ' + parStr : ''));

        await new Promise(function(r){ setTimeout(r, DELAY); });
      }

      /* ═══ 6. Gravar ficheiro ═══ */
      var output = {
        signupanytime_t: tId,
        name: tournName,
        year: parseInt((tournMeta.start_date || '').split('/').pop()) || null,
        start_date: tournMeta.start_date || null,
        end_date: tournMeta.end_date || null,
        rounds: tournMeta.rounds || null,
        /* PAR/YARDS por flight_round */
        flight_courses: roundInfo,
        /* Courses (nomes) */
        courses: coursesRaw,
        /* Estrutura do torneio */
        age_groups: ageGroups,
        flight_categories: flightCats,
        flight_tees: flightTees,
        tee_markers: teeMarkers,
        /* Scorecards */
        flights: flightData,
        meta: {
          tournament: tournMeta,
          flights: metaFlights,
          flight_rounds: flightRounds,
          age_groups: ageGroups
        }
      };

      var totalPl = 0;
      for(var fk in flightData) totalPl += Object.keys(flightData[fk].flight_players || {}).length;

      var fileName = 'uskids_torneios_completos(' + (ti+1) + ').json';
      var blob = new Blob([JSON.stringify(output, null, 2)], {type:'application/json'});
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; a.click();

      console.log('%c   💾 ' + fileName + ' (' + (blob.size/1024/1024).toFixed(2) + ' MB) — ' + totalPl + ' jog, ' + nWithPar + ' rounds com par', 'color:green;font-weight:bold');

    } catch(e){
      console.error('❌ t=' + tId + ': ' + e.message, e);
    }
    await new Promise(function(r){ setTimeout(r, 1000); });
  }

  console.log('%c\n🏁 DONE! ' + TOURNAMENTS.length + ' torneios em ' + ((Date.now()-t0)/60000).toFixed(1) + ' min', 'color:green;font-weight:bold;font-size:16px');
  document.title = 'DONE — ' + TOURNAMENTS.length;
})();
