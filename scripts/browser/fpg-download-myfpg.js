/**
 * fpg-download-myfpg.js — Download de scorecards via my.fpg.pt
 * 
 * COMO USAR:
 * 1. Abre o browser e vai a: https://my.fpg.pt/Home/PlayerResults.aspx?no=49085
 * 2. Confirma que vês a tabela de resultados do Manuel
 * 3. Abre a consola (F12 > Console)
 * 4. Cola TODO este código e carrega ENTER
 * 5. Espera — vai descarregar 2 ficheiros: whs-list.json e scorecards-all.json
 */

(async () => {
  // Detectar federado do URL ou do label na página
  const urlNo = new URLSearchParams(window.location.search).get("no");
  const lblNo = document.getElementById("lblFedno")?.textContent?.trim();
  const FED = urlNo || lblNo || "49085";
  const PAGE_SIZE = 100;

  // Base path — my.fpg.pt usa /Home/ prefix
  const BASE = window.location.pathname.replace(/PlayerResults\.aspx.*/, "");
  
  console.log(`%c[FPG] Federado: ${FED} | Base: ${BASE}`, "color: blue; font-weight: bold");
  
  // ── 1. Descarregar lista de resultados ──
  console.log("[FPG] A descarregar lista de resultados...");
  const allRecords = [];
  let startIndex = 0;
  
  while (true) {
    const res = await fetch(`${BASE}PlayerResults.aspx/ResultsLST?fed_code=${FED}&jtStartIndex=${startIndex}&jtPageSize=${PAGE_SIZE}`, {
      method: "POST",
      headers: {
        "x-requested-with": "XMLHttpRequest",
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        fed_code: String(FED),
        jtStartIndex: String(startIndex),
        jtPageSize: String(PAGE_SIZE)
      })
    });
    
    const json = await res.json();
    const payload = json?.d ?? json;
    
    if (payload?.Result !== "OK") {
      console.error("[FPG] Erro na lista:", payload);
      break;
    }
    
    const records = payload.Records || [];
    allRecords.push(...records);
    console.log(`[FPG] ${allRecords.length} registos...`);
    
    if (records.length < PAGE_SIZE) break;
    startIndex += PAGE_SIZE;
  }
  
  console.log(`%c[FPG] Lista: ${allRecords.length} registos`, "color: green; font-weight: bold");
  
  // Normalizar campo id/score_id
  for (const r of allRecords) {
    if (!r.score_id && r.id) r.score_id = r.id;
    if (!r.id && r.score_id) r.id = r.score_id;
  }
  
  // Guardar lista
  const whsList = { Result: "OK", Records: allRecords };
  downloadJSON(whsList, `whs-list-${FED}.json`);
  
  // ── 2. Descarregar scorecards ──
  console.log("[FPG] A descarregar scorecards...");
  const scorecards = {};
  let ok = 0, failed = 0, skipped = 0;
  
  for (let i = 0; i < allRecords.length; i++) {
    const r = allRecords[i];
    const scoreId = r.score_id || r.id;
    const scoringType = r.scoring_type_id;
    const compType = r.competition_type_id;
    
    // Skip manual adjustments (no scorecard)
    if (r.score_origin_id === 7) {
      skipped++;
      continue;
    }
    
    try {
      const res = await fetch(
        `${BASE}PlayerResults.aspx/ScoreCard?score_id=${scoreId}&scoringtype=${scoringType}&competitiontype=${compType}`,
        {
          method: "POST",
          headers: {
            "x-requested-with": "XMLHttpRequest",
            "content-type": "application/json; charset=utf-8"
          },
          body: JSON.stringify({
            score_id: String(scoreId),
            scoringtype: String(scoringType),
            competitiontype: String(compType)
          })
        }
      );
      
      if (res.status !== 200) {
        failed++;
        continue;
      }
      
      const json = await res.json();
      const payload = json?.d ?? json;
      
      if (payload?.Result === "OK") {
        scorecards[scoreId] = payload;
        ok++;
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
    }
    
    // Progresso
    if ((i + 1) % 20 === 0 || i === allRecords.length - 1) {
      console.log(`[FPG] Scorecards: ${i + 1}/${allRecords.length} (${ok} OK, ${failed} falhas, ${skipped} saltados)`);
    }
    
    // Pausa para não sobrecarregar
    if ((i + 1) % 10 === 0) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  console.log(`%c[FPG] Scorecards: ${ok} OK, ${failed} falhas, ${skipped} saltados`, "color: green; font-weight: bold");
  
  // Guardar scorecards
  downloadJSON(scorecards, `scorecards-${FED}.json`);
  
  console.log(`%c[FPG] CONCLUÍDO!`, "color: blue; font-weight: bold; font-size: 14px");
  console.log(`  1. whs-list-${FED}.json (${allRecords.length} registos)`);
  console.log(`  2. scorecards-${FED}.json (${ok} scorecards)`);
  
  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
})();
