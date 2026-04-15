/**
 * fpg-update-fase1.js — FASE 1: Descarregar só as listas WHS (rápido!)
 *
 * Descarrega APENAS as listas de rondas (whs-list) de todos os jogadores.
 * Sem scorecards — são só ~2 segundos por jogador.
 * 406 jogadores ≈ 15 minutos.
 *
 * COMO USAR:
 * 1. Abre: https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884
 * 2. F12 → Console → cola este código → ENTER
 * 3. Espera ~15 min — descarrega 1 ficheiro: fpg-whs-all.json
 * 4. Corre: node pipeline.js --update
 *    (isto identifica scorecards novos e gera o script da Fase 2)
 */

(async () => {
  const ALL_FEDS = [
    "2195", "2217", "6437", "8334", "9572", "20292", "20877", "27849", "28845", "28894",
    "29593", "30970", "31111", "31408", "31550", "31745", "31830", "31831", "31899", "32252",
    "32263", "32437", "32543", "32579", "33193", "33403", "33628", "33811", "33815", "33823",
    "33956", "34029", "34082", "34166", "34186", "34238", "34270", "34430", "34895", "35085",
    "35233", "35404", "35596", "35715", "35814", "35849", "35874", "36028", "36148", "36413",
    "36638", "36678", "36810", "36811", "36832", "36844", "36864", "36901", "36995", "37010",
    "37152", "37216", "37318", "37561", "37570", "37633", "37678", "37680", "37704", "37875",
    "38006", "38082", "38233", "38253", "38315", "38334", "38375", "38424", "38580", "38633",
    "38668", "38718", "38722", "38976", "39055", "39097", "39116", "39375", "39439", "39465",
    "39468", "39524", "39552", "39701", "39878", "39900", "39986", "40093", "40112", "40115",
    "40196", "40318", "40390", "40407", "40444", "40452", "40473", "40492", "40534", "40563",
    "40645", "40656", "40682", "40754", "40761", "40910", "40928", "40957", "40958", "40981",
    "40990", "40992", "41080", "41121", "41124", "41131", "41173", "41294", "41461", "41593",
    "41608", "41609", "41612", "41613", "41744", "41799", "41875", "42068", "42178", "42205",
    "42273", "42374", "42684", "42690", "42845", "42908", "42920", "42952", "42985", "43053",
    "43221", "43359", "43732", "43810", "43832", "43846", "43904", "43968", "43972", "44018",
    "44160", "44406", "44453", "44615", "44617", "44649", "44681", "44722", "44890", "44891",
    "44934", "45009", "45278", "45340", "45343", "45356", "45393", "45424", "45425", "45429",
    "45439", "45475", "45499", "45608", "45647", "45812", "45918", "46009", "46026", "46037",
    "46038", "46153", "46195", "46296", "46297", "46299", "46308", "46309", "46310", "46311",
    "46314", "46395", "46414", "46415", "46437", "46475", "46480", "46481", "46482", "46489",
    "46577", "46589", "46591", "46706", "46853", "46873", "46948", "47002", "47078", "47341",
    "47374", "47495", "47552", "47556", "47677", "47697", "47810", "47819", "47869", "48021",
    "48045", "48046", "48052", "48102", "48113", "48132", "48164", "48297", "48470", "48529",
    "48531", "48622", "48628", "48629", "48705", "48791", "48794", "48933", "48946", "48971",
    "49011", "49012", "49076", "49085", "49087", "49124", "49205", "49209", "49215", "49296",
    "49300", "49328", "49329", "49342", "49628", "49714", "49717", "49770", "49926", "50011",
    "50042", "50087", "50189", "50247", "50299", "50450", "50451", "50485", "50526", "50528",
    "50594", "50628", "50648", "50671", "50703", "50761", "50786", "50831", "50919", "51074",
    "51180", "51182", "51313", "51430", "51523", "51524", "51612", "51671", "51804", "51937",
    "51940", "51949", "52011", "52048", "52069", "52077", "52088", "52168", "52229", "52270",
    "52393", "52431", "52487", "52488", "52647", "52663", "52713", "52724", "52773", "52798",
    "52815", "52856", "52880", "52884", "53150", "53172", "53304", "53645", "53646", "53714",
    "53715", "53728", "53749", "53755", "53780", "53838", "53847", "53900", "53932", "54232",
    "54241", "54255", "54264", "54281", "54330", "54476", "54550", "54551", "54757", "54774",
    "54809", "54845", "54888", "55056", "55147", "55188", "55269", "55270", "55301", "55398",
    "55539", "55540", "55697", "55727", "55914", "55954", "56026", "56072", "56118", "56527",
    "56604", "56632", "56641", "56647", "56654", "56696", "56705", "56717", "56718", "56728",
    "56803", "56943", "56944", "57110", "57134", "57291", "57356", "57454", "57640", "57903",
    "57904", "58043", "58429", "58431", "58580", "58581", "58833", "58886", "58936", "58937",
    "58960", "58962", "58969", "58984", "59008", "59252",
  ];

  const PAGE_SIZE = 100;
  const headers = {
    "x-requested-with": "XMLHttpRequest",
    "content-type": "application/json; charset=utf-8"
  };

  const t0 = Date.now();
  console.log(`%c[FPG] ══ Fase 1: Listas WHS de ${ALL_FEDS.length} jogadores ══`,
    "color:blue;font-weight:bold;font-size:14px");

  const allData = {};
  let okCount = 0, failCount = 0;

  for (let i = 0; i < ALL_FEDS.length; i++) {
    const FED = ALL_FEDS[i];
    const records = [];
    let startIndex = 0;
    let ok = true;

    while (true) {
      try {
        const res = await fetch(
          `PlayerWHS.aspx/HCPWhsFederLST?fed_code=${FED}&jtStartIndex=${startIndex}&jtPageSize=${PAGE_SIZE}`,
          {
            method: "POST", headers,
            body: JSON.stringify({ fed_code: FED, jtStartIndex: String(startIndex), jtPageSize: String(PAGE_SIZE) })
          }
        );
        if (res.status !== 200) { ok = false; break; }
        const payload = (await res.json())?.d;
        if (payload?.Result !== "OK") { ok = false; break; }
        records.push(...(payload.Records || []));
        if ((payload.Records || []).length < PAGE_SIZE) break;
        startIndex += PAGE_SIZE;
      } catch { ok = false; break; }
    }

    if (ok && records.length > 0) {
      for (const r of records) {
        if (!r.score_id && r.id) r.score_id = r.id;
        if (!r.id && r.score_id) r.id = r.score_id;
      }
      allData[FED] = { Result: "OK", Records: records };
      okCount++;
    } else {
      failCount++;
    }

    // Progresso a cada 20
    if ((i + 1) % 20 === 0 || i === ALL_FEDS.length - 1) {
      const pct = ((i + 1) / ALL_FEDS.length * 100).toFixed(0);
      const elapsed = ((Date.now() - t0) / 1000 / 60).toFixed(1);
      console.log(`[FPG] ${i + 1}/${ALL_FEDS.length} (${pct}%) · ${okCount} ✅ ${failCount} ❌ · ${elapsed} min`);
    }

    // Micro-pausa
    if ((i + 1) % 5 === 0) await new Promise(r => setTimeout(r, 200));
  }

  // Gravar
  downloadJSON(allData, "fpg-whs-all.json");

  const totalMin = ((Date.now() - t0) / 1000 / 60).toFixed(1);
  console.log(`\n%c[FPG] ✅ Fase 1 concluída em ${totalMin} min`, "color:green;font-weight:bold;font-size:13px");
  console.log(`  ${okCount} jogadores · ${failCount} falhas`);
  console.log(`  📁 fpg-whs-all.json`);
  console.log(`  ➡️ Agora corre: node pipeline.js --update`);

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
