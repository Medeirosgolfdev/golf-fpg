// ============================================================
// diagnose-r2-aquapor.js — Encontrar como obter R2 do AQUAPOR
// Cola em: https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=000&tcode=10873
// 
// 1º Torneio do Circuito Aquapor-Morgado Golf (2R)
// José Miguel Franco de Sousa, score_id R1 = 53013
// R1 front = 34 (gross 67), queremos encontrar a R2
// Score IDs R1: 53008-53104 (79 jogadores)
// ============================================================

(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log  = m => console.log("%c[diag] " + m, "color:#2563eb;font-weight:bold");
  const ok   = m => console.log("%c[diag] ✓ " + m, "color:green;font-weight:bold");
  const warn = m => console.log("%c[diag] ✗ " + m, "color:red;font-weight:bold");
  const info = m => console.log("%c[diag]   " + m, "color:#6366f1");
  const HIT  = m => console.log("%c[diag] 🎯 " + m, "color:green;font-weight:bold;font-size:14px");

  const TC = "000", TCD = "10873";
  const SID_R1 = "53013"; // José Miguel R1
  const R1_FRONT = 34; // para detectar duplicado

  async function classif(label, overrides) {
    const base = {
      Classi: "1", tclub: TC, tcode: TCD,
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
      const jose = recs.find(r => (r.player_name || "").includes("Franco"));
      if (recs.length > 0) {
        ok(label + " → " + recs.length + " registos" +
          (jose ? " | José Miguel: sid=" + jose.score_id + " gross=" + jose.gross_total : ""));
        // Se é a primeira vez que temos registos, mostrar campos
        if (jose) {
          const keys = Object.keys(jose).filter(k => /round|volta|v1|v2|gross|score_id/i.test(k));
          info("  Campos relevantes: " + keys.map(k => k + "=" + jose[k]).join(", "));
        }
      } else {
        info(label + " → 0 registos");
      }
      return recs;
    } catch(e) {
      warn(label + " → ERRO: " + e.message);
      return [];
    }
  }

  async function sc(label, scoreId, round) {
    const qs = "score_id=" + scoreId + "&tclub=" + TC + "&tcode=" + TCD + "&scoringtype=1&classiftype=I&classifround=" + round;
    const body = {
      score_id: String(scoreId), tclub: TC, tcode: TCD,
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
      if (d.Result !== "OK" || !d.Records?.length) {
        info(label + " → vazio");
        return null;
      }
      const rec = d.Records[0];
      const front = [1,2,3,4,5,6,7,8,9].reduce((s,h) => s + (Number(rec["gross_"+h]) || 0), 0);
      const isR1 = front === R1_FRONT;
      if (!isR1) {
        HIT(label + " → Front=" + front + " gross=" + rec.gross_total + " ← DADOS DIFERENTES DA R1!");
      } else {
        info(label + " → Front=" + front + " gross=" + rec.gross_total + " (= R1)");
      }
      return rec;
    } catch(e) {
      warn(label + " → ERRO: " + e.message);
      return null;
    }
  }

  // ═══════════════════════════════════════
  log("═══ TESTE 1: ClassifLST — round + classifroundtype ═══");
  log("   (procurar combinação que devolva score_ids da R2)");
  // ═══════════════════════════════════════

  for (const rt of ["D", "R", "A", "T"]) {
    for (const rd of ["1", "2"]) {
      if (rt === "D" && rd === "1") { info("D/1 = default, skip"); continue; }
      await classif("rndtype=" + rt + " round=" + rd, { classifroundtype: rt, round: rd });
      await sleep(150);
    }
  }

  log("");
  log("═══ TESTE 2: ClassifLST — classiforder variações ═══");
  for (const co of ["1", "2", "3"]) {
    await classif("classiforder=" + co + " round=2", { classiforder: co, round: "2" });
    await sleep(150);
  }

  log("");
  log("═══ TESTE 3: ScoreCard sid=53013 com classifround 1 e 2 ═══");
  await sc("sid=" + SID_R1 + " cr=1", SID_R1, "1");
  await sleep(150);
  await sc("sid=" + SID_R1 + " cr=2", SID_R1, "2");
  await sleep(150);

  log("");
  log("═══ TESTE 4: Scan score_ids acima do max R1 (53104+) ═══");
  log("   (os IDs da R2 podem estar num bloco separado)");
  let found = 0;
  for (let id = 53105; id <= 53210; id++) {
    const rec = await sc("sid=" + id + " cr=1", id, "1");
    if (rec) found++;
    // Parar se 10 seguidos vazios depois de encontrar algo
    if (found > 0 && id > 53105 + found + 10) {
      let recentHit = false;
      // keep going if we found something in last 10
    }
    await sleep(40);
  }

  if (found === 0) {
    log("");
    log("═══ TESTE 5: Scan IDs mais acima (53200-53400) ═══");
    for (let id = 53200; id <= 53400; id += 5) {
      await sc("sid=" + id, id, "1");
      await sleep(40);
    }
  }

  log("");
  log("═══ TESTE 6: Tentar endpoint AllScoreCards se existir ═══");
  try {
    const qs = "tclub=" + TC + "&tcode=" + TCD + "&scoringtype=1&classiftype=I";
    const body = { tclub: TC, tcode: TCD, scoringtype: "1", classiftype: "I" };
    for (const ep of ["AllScoreCards", "ScoreCardAll", "ScoreCards", "AllRounds"]) {
      const res = await fetch("classif.aspx/" + ep + "?" + qs, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = await res.json();
        ok("classif.aspx/" + ep + " EXISTS! → " + JSON.stringify(json).substring(0, 200));
      } else {
        info("classif.aspx/" + ep + " → " + res.status);
      }
      await sleep(100);
    }
  } catch(e) {
    info("Endpoint alternativo: " + e.message);
  }

  log("");
  log("═══ TESTE 7: Interceptar o que o site faz ═══");
  log("   A abrir Classifications.aspx na mesma tab...");
  log("   NOTA: Se o site carrega R2 via JS no page load,");
  log("   pode ser preciso olhar o HTML/JS source.");
  
  // Tentar encontrar no DOM se já há dados da R2
  try {
    const allText = document.body?.innerText || "";
    const has77 = allText.includes("77"); // Santiago R2 total = 77
    const hasVolta2 = allText.includes("Volta 2") || allText.includes("V2") || allText.includes("volta : 2");
    info("DOM contém '77'? " + has77);
    info("DOM contém 'Volta 2'/'V2'? " + hasVolta2);
    
    // Procurar scripts inline com referências a round/volta
    const scripts = document.querySelectorAll("script");
    let foundRoundRef = false;
    scripts.forEach(s => {
      const txt = s.textContent || "";
      if (/classifround|volta|round.*2/i.test(txt) && txt.length < 5000) {
        ok("Script com referência a round/volta encontrado!");
        info("  " + txt.substring(0, 300));
        foundRoundRef = true;
      }
    });
    if (!foundRoundRef) info("Nenhum script inline com referências a round/volta.");
  } catch(e) {}

  log("");
  ok("═══ DIAGNÓSTICO COMPLETO ═══");
})();
