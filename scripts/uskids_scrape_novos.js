/*
 * USKids Golf — Scraper para os 3 torneios em falta
 *
 * CORRER EM: https://www.signupanytime.com (consola F12)
 *
 * Grava:
 *   uskids_torneios_completos(20).json  → Venice Open 2025
 *   uskids_torneios_completos(21).json  → Rome Classic 2025
 *   uskids_torneios_completos(22).json  → Marco Simone Invitational 2026
 */

(async function(){

  var TOURNAMENTS = [
    {t:"19418"},   // Venice Open 2025          → ficheiro (20)
    {t:"20175"},   // Rome Classic 2025          → ficheiro (21)
    {t:"21080"},   // Marco Simone Inv. 2026     → ficheiro (22)
  ];

  var FILE_START = 20;  // primeiro número de ficheiro

  var BASE       = '/plugins/links/admin/LinksAJAX.aspx';
  var IFRAME_BASE = '/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=';
  var DELAY = 500;

  async function safeJSON(url, ms){
    ms = ms || 6000;
    var ctrl = new AbortController();
    var timer = setTimeout(function(){ ctrl.abort(); }, ms);
    try {
      var r = await fetch(url, {signal: ctrl.signal});
      clearTimeout(timer);
      return JSON.parse(await r.text());
    } catch(e){ clearTimeout(timer); return null; }
  }

  console.log('%c⛳ USKids Scraper — ' + TOURNAMENTS.length + ' torneios (ficheiros ' + FILE_START + '-' + (FILE_START+TOURNAMENTS.length-1) + ')', 'color:green;font-weight:bold;font-size:16px');
  var t0 = Date.now();

  for(var ti = 0; ti < TOURNAMENTS.length; ti++){
    var tId = TOURNAMENTS[ti].t;
    var fileNum = FILE_START + ti;
    var pct = ((ti+1)/TOURNAMENTS.length*100).toFixed(0);
    document.title = pct + '% (' + (ti+1) + '/' + TOURNAMENTS.length + ') t=' + tId;
    console.log('%c\n━━━ ' + (ti+1) + '/' + TOURNAMENTS.length + ' — t=' + tId + ' ━━━', 'color:#2563eb;font-weight:bold');

    try {
      var meta = await safeJSON(BASE + '?op=GetMeta&t=' + tId, 10000);
      if(!meta){ console.error('❌ GetMeta falhou t=' + tId); continue; }

      var tournMeta = meta.tournament || {};
      var tournName = tournMeta.name || 'Tournament ' + tId;
      console.log('📋 ' + tournName);

      var flightCourses = meta.flight_courses || {};
      var flightRounds  = meta.flight_rounds  || {};
      var coursesRaw    = meta.courses        || {};
      var ageGroups     = meta.age_groups     || {};
      var metaFlights   = meta.flights        || {};

      var roundInfo = {};
      for(var frId in flightCourses){
        var fc = flightCourses[frId];
        var fr = flightRounds[frId] || {};
        var courseId   = fc.course || fr.course || null;
        var courseName = courseId && coursesRaw[courseId] ? coursesRaw[courseId].name : '';
        var pars    = fc.pars    || [];
        var lengths = fc.lengths || [];
        var holes = [];
        for(var hi = 0; hi < pars.length; hi++){
          if(pars[hi] > 0 || lengths[hi] > 0)
            holes.push({ number: hi+1, par: pars[hi]||0, yards: lengths[hi]||0 });
        }
        roundInfo[frId] = {
          flightRoundId: frId,
          flightId:    String(fr.flight||''),
          round:       fr.round||null,
          date:        fr.date||null,
          courseId:    courseId ? String(courseId) : null,
          courseName:  courseName,
          startingHole: fr.starting_hole||'1',
          numHoles:    holes.length,
          totalPar:    holes.reduce(function(s,h){ return s+h.par; },0),
          totalYards:  holes.reduce(function(s,h){ return s+h.yards; },0),
          holes: holes, pars: pars, lengths: lengths
        };
      }

      var flightCats = {};
      var flightTees = {};
      for(var fId in metaFlights){
        var fl = metaFlights[fId];
        var agId = fl.age_group;
        if(agId && ageGroups[agId]){
          flightCats[fId] = ageGroups[agId].name||'';
          if(ageGroups[agId].tee_marker) flightTees[fId] = ageGroups[agId].tee_marker;
        }
        if(fl.name) flightCats[fId] = fl.name;
      }
      var fIds = Object.keys(flightCats);
      if(fIds.length === 0) fIds = Object.keys(metaFlights);
      console.log('   📂 ' + fIds.length + ' flights');

      var flightToRounds = {};
      for(var frId2 in flightRounds){
        var fr2 = flightRounds[frId2];
        var fKey = String(fr2.flight||'');
        if(!flightToRounds[fKey]) flightToRounds[fKey] = {};
        flightToRounds[fKey][fr2.round||1] = frId2;
      }

      var flightData = {};
      for(var fi = 0; fi < fIds.length; fi++){
        var fid = fIds[fi];
        var catName = flightCats[fid]||'Flight '+fid;
        document.title = pct+'% t='+tId+' '+catName;

        var sc = await safeJSON(BASE+'?op=GetPlayerTeeTimes&f='+fid+'&r=3&p=1&t=0', 8000);
        if(!sc) sc = await safeJSON(BASE+'?op=GetPlayerTeeTimes&f='+fid+'&r=3&p=1&t=1', 8000);
        var players = sc ? (sc.flight_players||sc.players||{}) : {};

        var fRounds = flightToRounds[fid]||{};
        var courseInfo = {};
        for(var rn in fRounds){
          var frInfo = roundInfo[fRounds[rn]];
          if(frInfo) courseInfo['R'+rn] = {
            courseName: frInfo.courseName, numHoles: frInfo.numHoles,
            totalPar: frInfo.totalPar, totalYards: frInfo.totalYards, holes: frInfo.holes
          };
        }

        flightData[fid] = {
          flight_id: fid, category: catName,
          tee_marker: flightTees[fid]||null,
          course_info: courseInfo, flight_players: players
        };
        console.log('   ✅ '+catName+': '+Object.keys(players).length+' jog');
        await new Promise(function(r){ setTimeout(r, DELAY); });
      }

      var output = {
        signupanytime_t: tId, name: tournName,
        year: parseInt((tournMeta.start_date||'').split('/').pop())||null,
        start_date: tournMeta.start_date||null, end_date: tournMeta.end_date||null,
        rounds: tournMeta.rounds||null,
        flight_courses: roundInfo, courses: coursesRaw,
        age_groups: ageGroups, flight_categories: flightCats,
        flight_tees: flightTees, tee_markers: meta.teeMarkers||{},
        flights: flightData,
        meta: { tournament: tournMeta, flights: metaFlights, flight_rounds: flightRounds, age_groups: ageGroups }
      };

      var totalPl = Object.values(flightData).reduce(function(s,f){ return s+Object.keys(f.flight_players||{}).length; },0);
      var fileName = 'uskids_torneios_completos(' + fileNum + ').json';
      var blob = new Blob([JSON.stringify(output, null, 2)], {type:'application/json'});
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
      console.log('%c   💾 ' + fileName + ' (' + (blob.size/1024/1024).toFixed(2) + ' MB) — ' + totalPl + ' jog', 'color:green;font-weight:bold');

    } catch(e){ console.error('❌ t='+tId+': '+e.message, e); }
    await new Promise(function(r){ setTimeout(r, 1000); });
  }

  console.log('%c\n🏁 DONE! Ficheiros (20), (21), (22) gerados em ' + ((Date.now()-t0)/60000).toFixed(1) + ' min', 'color:green;font-weight:bold;font-size:16px');
  document.title = 'DONE';
})();
