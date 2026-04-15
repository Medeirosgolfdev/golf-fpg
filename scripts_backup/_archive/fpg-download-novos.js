/**
 * fpg-download-novos.js — Download completo de 43 jogadores novos
 *
 * COMO USAR:
 * 1. Abre: https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884
 * 2. F12 → Console → cola TODO este código → ENTER
 * 3. Espera ~20-30 min — descarrega 1 ficheiro: fpg-batch-novos.json
 * 4. Corre: node pipeline.js --batch-file fpg-batch-novos.json
 */

(async () => {
  const FEDS = [
    "44844","45366","45869","46079","46606","47003","47576","48990","49066","49528",
    "50053","50193","50215","50398","50467","51081","51150","51352","51803","52956",
    "52984","53532","53548","53687","53696","53981","54713","55065","55093","55094",
    "55466","55498","56048","56491","56749","56765","56984","57756","58051","58327",
    "58484","58760","59128"
  ];

  const PAGE_SIZE = 100;
  const headers = {
    "x-requested-with": "XMLHttpRequest",
    "content-type": "application/json; charset=utf-8"
  };

  const t0 = Date.now();
  console.log(`%c[FPG] ══ Download de ${FEDS.length} jogadores novos ══`, "color:blue;font-weight:bold;font-size:14px");

  const batchData = {};
  let okCount = 0, failCount = 0;

  for (let fi = 0; fi < FEDS.length; fi++) {
    const FED = FEDS[fi];

    // ── WHS List ──
    const allRecords = [];
    let startIndex = 0;
    let listOK = true;

    while (true) {
      try {
        const res = await fetch(
          `PlayerWHS.aspx/HCPWhsFederLST?fed_code=${FED}&jtStartIndex=${startIndex}&jtPageSize=${PAGE_SIZE}`,
          {
            method: "POST", headers,
            body: JSON.stringify({ fed_code: FED, jtStartIndex: String(startIndex), jtPageSize: String(PAGE_SIZE) })
          }
        );
        if (res.status !== 200) { listOK = false; break; }
        const payload = (await res.json())?.d;
        if (payload?.Result !== "OK") { listOK = false; break; }
        const records = payload.Records || [];
        allRecords.push(...records);
        if (records.length < PAGE_SIZE) break;
        startIndex += PAGE_SIZE;
      } catch { listOK = false; break; }
    }

    if (!listOK || allRecords.length === 0) {
      console.warn(`  [${fi+1}/${FEDS.length}] ${FED} — sem dados`);
      failCount++;
      continue;
    }

    for (const r of allRecords) {
      if (!r.score_id && r.id) r.score_id = r.id;
      if (!r.id && r.score_id) r.id = r.score_id;
    }

    // ── Scorecards ──
    const scorecards = {};
    let ok = 0, skip = 0, fail = 0;

    for (let i = 0; i < allRecords.length; i++) {
      const r = allRecords[i];
      const scoreId = r.score_id || r.id;
      if (!scoreId) { skip++; continue; }

      try {
        const res = await fetch(
          `PlayerWHS.aspx/ScoreCard?score_id=${scoreId}&scoringtype=${r.scoring_type_id ?? 1}&competitiontype=${r.competition_type_id ?? 1}`,
          {
            method: "POST", headers,
            body: JSON.stringify({
              score_id: String(scoreId),
              scoringtype: String(r.scoring_type_id ?? 1),
              competitiontype: String(r.competition_type_id ?? 1)
            })
          }
        );
        if (res.status !== 200) { fail++; continue; }
        const payload = (await res.json())?.d;
        if (payload?.Result === "OK") { scorecards[scoreId] = payload; ok++; }
        else skip++;
      } catch { fail++; }

      if ((i + 1) % 10 === 0) await new Promise(r => setTimeout(r, 80));
    }

    const hcp = allRecords.find(r => r.new_handicap != null)?.new_handicap;
    console.log(`  [${fi+1}/${FEDS.length}] ${FED}: ${allRecords.length} reg · ${ok} sc · HCP ${hcp ?? "?"}`);

    batchData[FED] = { whs: { Result: "OK", Records: allRecords }, scorecards };
    okCount++;

    if (fi < FEDS.length - 1) await new Promise(r => setTimeout(r, 1500));
  }

  downloadJSON(batchData, "fpg-batch-novos.json");

  const totalMin = ((Date.now() - t0) / 1000 / 60).toFixed(1);
  console.log(`\n%c[FPG] ✅ ${okCount}/${FEDS.length} jogadores · ${totalMin} min`, "color:green;font-weight:bold;font-size:13px");
  console.log(`  📁 fpg-batch-novos.json`);
  console.log(`  ➡️ Agora corre: node pipeline.js --batch-file fpg-batch-novos.json`);

  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj)], { type: "application/json" });
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
