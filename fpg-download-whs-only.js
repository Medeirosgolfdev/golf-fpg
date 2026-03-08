/**
 * fpg-download-whs-only.js — Fase 1: descarregar SÓ as listas WHS (sem scorecards)
 * v2 — 10 pedidos em paralelo (~10x mais rápido)
 *
 * É muito rápido (~2-5 min para 400+ jogadores) porque não descarrega scorecards.
 * O pipeline.js --update compara depois com o que já tens e gera um script
 * com APENAS os scorecards em falta.
 *
 * FLUXO COMPLETO DE ACTUALIZAÇÃO:
 *
 *   1. Abre: https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884
 *   2. F12 → Console → cola ESTE script → ENTER
 *   3. Espera o download de fpg-whs-all.json (~2-5 min)
 *   4. Corre: node pipeline.js --update
 *      → compara com output/ e gera scripts/fpg-update-fase2.js
 *      → mostra quantos scorecards novos há
 *   5. Se há scorecards novos:
 *      Cola scripts/fpg-update-fase2.js na consola → descarrega fpg-batch-missing.json
 *   6. Corre de novo: node pipeline.js --update
 *      → importa os scorecards novos e processa tudo
 *
 * NOTA: Para retomar se a página refrescar, muda START_INDEX para o índice onde paraste.
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
    "40990", "40992", "41080", "41108", "41121", "41124", "41130", "41131", "41173", "41294",
    "41461", "41593", "41608", "41609", "41612", "41613", "41744", "41799", "41875", "42068",
    "42178", "42205", "42273", "42374", "42684", "42690", "42845", "42908", "42920", "42952",
    "42985", "43053", "43221", "43359", "43732", "43810", "43832", "43846", "43904", "43968",
    "43972", "44018", "44019", "44160", "44406", "44453", "44615", "44617", "44649", "44677",
    "44681", "44722", "44821", "44844", "44890", "44891", "44934", "45009", "45278", "45340",
    "45343", "45356", "45366", "45393", "45424", "45425", "45429", "45439", "45475", "45499",
    "45608", "45647", "45812", "45869", "45918", "46009", "46026", "46037", "46038", "46079",
    "46153", "46195", "46296", "46297", "46299", "46308", "46309", "46310", "46311", "46314",
    "46395", "46414", "46415", "46437", "46475", "46480", "46481", "46482", "46489", "46577",
    "46589", "46591", "46606", "46706", "46853", "46873", "46948", "47002", "47003", "47078",
    "47341", "47374", "47495", "47552", "47556", "47576", "47677", "47697", "47810", "47819",
    "47869", "48021", "48045", "48046", "48052", "48102", "48113", "48132", "48164", "48297",
    "48470", "48529", "48531", "48622", "48628", "48629", "48705", "48791", "48794", "48933",
    "48946", "48971", "48990", "49011", "49012", "49066", "49076", "49085", "49087", "49124",
    "49205", "49209", "49215", "49296", "49300", "49328", "49329", "49342", "49528", "49628",
    "49714", "49717", "49770", "49926", "50011", "50042", "50053", "50087", "50189", "50193",
    "50215", "50247", "50299", "50398", "50450", "50451", "50467", "50485", "50526", "50528",
    "50594", "50628", "50648", "50671", "50703", "50761", "50786", "50831", "50919", "51074",
    "51081", "51150", "51180", "51182", "51313", "51352", "51430", "51523", "51524", "51612",
    "51671", "51803", "51804", "51937", "51940", "51949", "52011", "52048", "52069", "52077",
    "52088", "52168", "52229", "52270", "52393", "52431", "52487", "52488", "52647", "52663",
    "52713", "52724", "52773", "52798", "52815", "52856", "52880", "52884", "52956", "52984",
    "53150", "53172", "53304", "53532", "53548", "53645", "53646", "53687", "53696", "53714",
    "53715", "53728", "53749", "53755", "53780", "53838", "53847", "53900", "53932", "53981",
    "54232", "54241", "54255", "54264", "54281", "54330", "54476", "54550", "54551", "54713",
    "54757", "54774", "54809", "54845", "54888", "55056", "55065", "55093", "55094", "55147",
    "55188", "55269", "55270", "55301", "55398", "55466", "55498", "55539", "55540", "55697",
    "55727", "55914", "55954", "56026", "56048", "56072", "56118", "56491", "56527", "56604",
    "56632", "56641", "56647", "56654", "56696", "56705", "56717", "56718", "56728", "56749",
    "56765", "56803", "56943", "56944", "56984", "57110", "57134", "57291", "57356", "57454",
    "57640", "57756", "57903", "57904", "58043", "58051", "58327", "58429", "58431", "58484",
    "58580", "58581", "58760", "58833", "58886", "58936", "58937", "58960", "58962", "58969",
    "58984", "59008", "59128", "59252",
  ];

  const CONCURRENCY = 10; // pedidos em paralelo — aumenta para 15 se não houver erros
  const PAGE_SIZE = 100;
  const headers = {
    "x-requested-with": "XMLHttpRequest",
    "content-type": "application/json; charset=utf-8"
  };

  async function fetchWHS(FED) {
    const allRecords = [];
    let startIndex = 0;
    while (true) {
      try {
        const res = await fetch(
          `PlayerWHS.aspx/HCPWhsFederLST?fed_code=${FED}&jtStartIndex=${startIndex}&jtPageSize=${PAGE_SIZE}`,
          {
            method: "POST", headers,
            body: JSON.stringify({ fed_code: FED, jtStartIndex: String(startIndex), jtPageSize: String(PAGE_SIZE) })
          }
        );
        if (res.status !== 200) return null;
        const payload = (await res.json())?.d;
        if (payload?.Result !== "OK") return null;
        const records = payload.Records || [];
        for (const r of records) {
          if (!r.score_id && r.id) r.score_id = r.id;
          if (!r.id && r.score_id) r.id = r.score_id;
        }
        allRecords.push(...records);
        if (records.length < PAGE_SIZE) break;
        startIndex += PAGE_SIZE;
      } catch { return null; }
    }
    return allRecords.length > 0 ? { Result: "OK", Records: allRecords } : null;
  }

  const t0 = Date.now();
  const total = ALL_FEDS.length;
  console.log(`%c[FPG] Fase 1 — ${total} jogadores · ${CONCURRENCY} paralelos`,
    "color:blue;font-weight:bold;font-size:13px");

  const result = {};
  let ok = 0, fail = 0, done = 0;

  for (let i = 0; i < ALL_FEDS.length; i += CONCURRENCY) {
    const batch = ALL_FEDS.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(fed => fetchWHS(fed)));

    for (let j = 0; j < batch.length; j++) {
      const FED = batch[j];
      const data = results[j];
      done++;
      if (data) { result[FED] = data; ok++; }
      else { console.warn(`  ✗ ${FED} falhou`); fail++; }
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    const eta = done > 0 ? Math.round((Date.now() - t0) / done * (total - done) / 1000) : "?";
    console.log(`  ${done}/${total} · ${elapsed}s · ETA ${eta}s`);

    if (i + CONCURRENCY < ALL_FEDS.length) await new Promise(r => setTimeout(r, 200));
  }

  downloadJSON(result, "fpg-whs-all.json");

  const totalSec = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n%c[FPG] ✅ ${ok}/${total} jogadores em ${totalSec}s (${fail} falhas)`,
    "color:green;font-weight:bold;font-size:13px");
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
