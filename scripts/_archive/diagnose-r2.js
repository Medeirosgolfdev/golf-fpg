// ============================================================
// diagnose-r2.js — Encontrar como obter R2 do Vale Pisão
// Cola em: https://scoring.datagolf.pt/pt/tournaments.aspx
// 
// Testa várias combinações de parâmetros para Santiago Dias
// no 3º Torneio Drive Tour Norte – Vale Pisão (987/10208, 2R)
// score_id da R1 = 4276
// ============================================================

(async () => {
  const DELAY = 200;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = m => console.log("%c[diag] " + m, "color:#2563eb;font-weight:bold");
  const ok  = m => console.log("%c[diag] ✓ " + m, "color:green;font-weight:bold");
  const warn = m => console.log("%c[diag] ✗ " + m, "color:red;font-weight:bold");
  const info = m => console.log("%c[diag]   " + m, "color:#6366f1");

  const TCLUB = "987", TCODE = "10208";
  const SCORE_ID_R1 = "4276"; // Santiago Dias R1
  const SANTIAGO_R1_FRONT = 33; // Front 9 da R1 para comparar
  const SANTIAGO_R2_FRONT = 43; // Front 9 da R2 (do screenshot)

  async function tryClassif(label, overrides) {
    const base = {
      Classi: "1", tclub: TCLUB, tcode: TCODE,
      classiforder: "1", classiftype: "I", classifroundtype: "D",
      scoringtype: "1", round: "1", members: "0", playertypes: "0",
      gender: "0", minagemen: "0", maxagemen: "999",
      minageladies: "0", maxageladies: "999",
      minhcp: "-8", maxhcp: "99", idfilter: "-1",
      jtStartIndex: "0", jtPageSize: "150", jtSorting: "score_id DESC",
    };
    const body = { ...base, ...overrides };
    const qs = "jtStartIndex=0&jtPageSize=150&jtSorting=" + encodeURIComponent("score_id DESC");
    try {
      const res = await fetch("classif.aspx/ClassifLST?" + qs, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { warn(label + " → HTTP " + res.status); return []; }
      const json = await res.json();
      const d = json.d || json;
      if (d.Result !== "OK") { warn(label + " → Result=" + d.Result); return []; }
      const recs = d.Records || [];
      if (recs.length === 0) {
        info(label + " → 0 registos");
      } else {
        const santiago = recs.find(r => (r.player_name || "").includes("Santiago"));
        ok(label + " → " + recs.length + " registos" +
          (santiago ? " | Santiago: score_id=" + santiago.score_id + " gross=" + santiago.gross_total + " V1=" + (santiago.round1_gross||"?") + " V2=" + (santiago.round2_gross||"?") : ""));
        // Log all field names from first record
        if (recs.length > 0) {
          const allKeys = Object.keys(recs[0]).sort();
          info("  Campos: " + allKeys.join(", "));
          if (santiago) {
            // Show round-related fields
            const roundFields = allKeys.filter(k => /round|volta|v1|v2|r1|r2/i.test(k));
            if (roundFields.length) info("  Round fields: " + roundFields.map(k => k + "=" + santiago[k]).join(", "));
          }
        }
      }
      return recs;
    } catch(e) {
      warn(label + " → ERRO: " + e.message);
      return [];
    }
  }

  async function tryScorecard(label, scoreId, round) {
    const qs = "score_id=" + scoreId + "&tclub=" + TCLUB + "&tcode=" + TCODE + "&scoringtype=1&classiftype=I&classifround=" + round;
    const body = {
      score_id: String(scoreId), tclub: TCLUB, tcode: TCODE,
      scoringtype: "1", classiftype: "I", classifround: String(round),
    };
    try {
      const res = await fetch("classif.aspx/ScoreCard?" + qs, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { warn(label + " → HTTP " + res.status); return null; }
      const json = await res.json();
      const d = json.d || json;
      if (d.Result !== "OK" || !d.Records || !d.Records.length) {
        warn(label + " → vazio/erro");
        return null;
      }
      const sc = d.Records[0];
      const front = [1,2,3,4,5,6,7,8,9].reduce((s,h) => s + (Number(sc["gross_"+h]) || 0), 0);
      const isR1 = front === SANTIAGO_R1_FRONT;
      const isR2 = front === SANTIAGO_R2_FRONT;
      const tag = isR2 ? " 🎯 É A R2!" : isR1 ? " (= R1 duplicada)" : "";
      const color = isR2 ? "color:green;font-weight:bold;font-size:14px" : undefined;
      if (isR2) {
        console.log("%c[diag] 🎯 " + label + " → Front=" + front + " gross=" + sc.gross_total + " FED=" + sc.federated_code + tag, color);
      } else {
        info(label + " → Front=" + front + " gross=" + sc.gross_total + tag);
      }
      return sc;
    } catch(e) {
      warn(label + " → ERRO: " + e.message);
      return null;
    }
  }

  // ═══════════════════════════════════════
  log("═══ TESTE 1: ClassifLST com diferentes round + classifroundtype ═══");
  // ═══════════════════════════════════════

  const roundTypes = ["D", "R", "A", "T", "1", "2", ""];
  const rounds = ["1", "2", "0", ""];

  for (const rt of roundTypes) {
    for (const rd of rounds) {
      if (rt === "D" && rd === "1") continue; // Já sabemos que funciona
      await tryClassif("classifroundtype=" + (rt||"vazio") + " round=" + (rd||"vazio"), { classifroundtype: rt, round: rd });
      await sleep(DELAY);
    }
  }

  log("");
  log("═══ TESTE 2: ScoreCard com score_id R1 + diferentes classifround ═══");

  for (const rd of ["1", "2", "3", "0"]) {
    await tryScorecard("score_id=" + SCORE_ID_R1 + " classifround=" + rd, SCORE_ID_R1, rd);
    await sleep(DELAY);
  }

  log("");
  log("═══ TESTE 3: ScoreCard com score_id's próximos (R2 pode ter ID diferente) ═══");

  const baseId = parseInt(SCORE_ID_R1);
  // Tentar IDs próximos (-5 a +100 em saltos)
  const idsToTry = [];
  for (let i = -5; i <= 5; i++) if (i !== 0) idsToTry.push(baseId + i);
  for (let i = 10; i <= 100; i += 10) idsToTry.push(baseId + i);
  // Also try +51 (number of players in tournament)
  idsToTry.push(baseId + 51, baseId + 52, baseId + 50);

  for (const id of idsToTry) {
    await tryScorecard("score_id=" + id + " classifround=1", id, "1");
    await sleep(DELAY);
  }

  log("");
  log("═══ TESTE 4: ClassifLST com classiftype diferente ═══");

  for (const ct of ["I", "T", "A", "N", "G"]) {
    if (ct === "I") continue;
    await tryClassif("classiftype=" + ct + " round=2", { classiftype: ct, round: "2" });
    await sleep(DELAY);
  }

  log("");
  log("═══ TESTE 5: ClassifLST round=1 tipo D — ver TODOS os score_id ═══");
  const r1recs = await tryClassif("R1 completa", { round: "1", classifroundtype: "D" });
  if (r1recs.length > 0) {
    const ids = r1recs.map(r => Number(r.score_id)).sort((a,b) => a-b);
    info("Score IDs R1: min=" + ids[0] + " max=" + ids[ids.length-1] + " range=" + (ids[ids.length-1]-ids[0]));
    info("IDs: " + ids.join(", "));

    // Now try range above max
    const maxId = ids[ids.length-1];
    log("");
    log("═══ TESTE 6: ScoreCard acima do max score_id R1 (" + maxId + ") ═══");
    for (let id = maxId + 1; id <= maxId + 60; id += 1) {
      const sc = await tryScorecard("score_id=" + id, id, "1");
      if (sc) {
        const name = sc.player_name || sc.federated_code || "?";
        info("  → Jogador: " + name);
      }
      await sleep(50); // faster for sequential scan
    }
  }

  log("");
  ok("═══ DIAGNÓSTICO COMPLETO ═══");
})();
