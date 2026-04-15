// ══════════════════════════════════════════════════════════════
// TESTE RÁPIDO — Schema 1 vs Schema 2
// 
// COMO USAR:
// 1. Abre: https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884
// 2. F12 → Console → Cola este código → ENTER
// 3. Vê qual dos endpoints responde
// ══════════════════════════════════════════════════════════════

(async () => {
  const FED = document.getElementById("lblFedno")?.textContent?.trim()
    || new URLSearchParams(window.location.search).get("no")
    || "52884";

  console.log(`%c[TESTE] Federado: ${FED}`, "color:blue;font-weight:bold");

  const headers = {
    "x-requested-with": "XMLHttpRequest",
    "content-type": "application/json; charset=utf-8"
  };
  const body = JSON.stringify({
    fed_code: String(FED),
    jtStartIndex: "0",
    jtPageSize: "5"
  });

  // ── Teste 1: Schema 1 (HCPWhsFederLST) — tem new_handicap ──
  console.log("\n%c[1] A testar Schema 1: PlayerWHS.aspx/HCPWhsFederLST ...", "color:orange");
  try {
    const r1 = await fetch(
      `PlayerWHS.aspx/HCPWhsFederLST?fed_code=${FED}&jtStartIndex=0&jtPageSize=5`,
      { method: "POST", headers, body }
    );
    const j1 = await r1.json();
    const p1 = j1?.d ?? j1;
    if (p1?.Result === "OK" && p1.Records?.length > 0) {
      const rec = p1.Records[0];
      console.log(`%c  ✅ FUNCIONA! ${p1.Records.length} registos`, "color:green;font-weight:bold");
      console.log("  Campos-chave:", {
        new_handicap: rec.new_handicap,
        prev_handicap: rec.prev_handicap,
        hcp_date: rec.hcp_date,
        sgd: rec.sgd,
        score_id: rec.score_id,
        calc_hcp_index: rec.calc_hcp_index
      });
      console.log("  Registo completo:", rec);
    } else {
      console.log(`%c  ❌ Resposta inesperada`, "color:red", p1);
    }
  } catch (e) {
    console.log(`%c  ❌ Erro: ${e.message}`, "color:red");
  }

  // ── Teste 2: Schema 2 (ResultsLST via PlayerResults) ──
  console.log("\n%c[2] A testar Schema 2: PlayerResults.aspx/ResultsLST ...", "color:orange");
  try {
    const r2 = await fetch(
      `../PlayerResults.aspx/ResultsLST?fed_code=${FED}&jtStartIndex=0&jtPageSize=5`,
      { method: "POST", headers, body }
    );
    const j2 = await r2.json();
    const p2 = j2?.d ?? j2;
    if (p2?.Result === "OK" && p2.Records?.length > 0) {
      const rec = p2.Records[0];
      console.log(`%c  ✅ FUNCIONA! ${p2.Records.length} registos`, "color:green;font-weight:bold");
      console.log("  Campos-chave:", {
        exact_hcp: rec.exact_hcp,
        calculated_exact_hcp: rec.calculated_exact_hcp,
        score_date: rec.score_date,
        score_differential: rec.score_differential,
        score_id: rec.score_id ?? rec.id
      });
      console.log("  Registo completo:", rec);
    } else {
      console.log(`%c  ❌ Resposta inesperada`, "color:red", p2);
    }
  } catch (e) {
    console.log(`%c  ❌ Erro: ${e.message}`, "color:red");
  }

  // ── Teste 3: Scorecard (funciona para ambos) ──
  console.log("\n%c[3] A testar ScoreCard endpoint ...", "color:orange");
  try {
    // Pegar o primeiro score_id disponível de qualquer teste que funcionou
    let testScoreId = null;
    try {
      const r = await fetch(
        `PlayerWHS.aspx/HCPWhsFederLST?fed_code=${FED}&jtStartIndex=0&jtPageSize=1`,
        { method: "POST", headers, body: JSON.stringify({ fed_code: FED, jtStartIndex: "0", jtPageSize: "1" }) }
      );
      const j = await r.json();
      const p = j?.d ?? j;
      if (p?.Records?.[0]) {
        testScoreId = p.Records[0].score_id;
      }
    } catch {}

    if (!testScoreId) {
      try {
        const r = await fetch(
          `../PlayerResults.aspx/ResultsLST?fed_code=${FED}&jtStartIndex=0&jtPageSize=1`,
          { method: "POST", headers, body: JSON.stringify({ fed_code: FED, jtStartIndex: "0", jtPageSize: "1" }) }
        );
        const j = await r.json();
        const p = j?.d ?? j;
        if (p?.Records?.[0]) {
          testScoreId = p.Records[0].score_id ?? p.Records[0].id;
        }
      } catch {}
    }

    if (testScoreId) {
      const scBody = JSON.stringify({
        score_id: String(testScoreId),
        scoringtype: "1",
        competitiontype: "1"
      });
      const r3 = await fetch(
        `PlayerWHS.aspx/ScoreCard?score_id=${testScoreId}&scoringtype=1&competitiontype=1`,
        { method: "POST", headers, body: scBody }
      );
      const j3 = await r3.json();
      const p3 = j3?.d ?? j3;
      if (p3?.Result === "OK") {
        console.log(`%c  ✅ ScoreCard OK (score_id=${testScoreId})`, "color:green;font-weight:bold");
      } else {
        console.log(`%c  ❌ ScoreCard falhou`, "color:red", p3);
      }
    } else {
      console.log("  ⚠️ Sem score_id para testar");
    }
  } catch (e) {
    console.log(`%c  ❌ Erro: ${e.message}`, "color:red");
  }

  console.log("\n%c[TESTE CONCLUÍDO]", "color:blue;font-weight:bold");
  console.log("Se Schema 1 ✅ → podemos usar new_handicap (HCP exacto)");
  console.log("Se só Schema 2 ✅ → continuamos com derivação WHS (aproximação)");
})();
