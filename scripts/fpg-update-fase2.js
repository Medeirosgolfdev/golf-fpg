/**
 * fpg-update-fase2.js — FASE 2: Descarregar SÓ os scorecards novos
 *
 * Gerado automaticamente por: node pipeline.js --update
 * 174 scorecards em falta de 139 jogadores.
 *
 * COMO USAR:
 * 1. Abre um destes URLs (o que funcionar hoje):
 *      https://my.fpg.pt/Home/PlayerWHS.aspx?no=52884
 *      https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884
 * 2. F12 → Console → cola este código → ENTER
 * 3. Espera — descarrega 1 ficheiro: fpg-batch-missing.json
 * 4. Corre: node pipeline.js --update
 *    (agora vai detectar o ficheiro e processar tudo)
 */
(async () => {
  // Detecta o site e configura os parâmetros adequados
  const IS_MY_FPG = window.location.hostname === "my.fpg.pt";
  const SITE = IS_MY_FPG ? "my.fpg.pt" : "scoring.fpg.pt";
  console.log(`%c[FPG] Site detectado: ${SITE}`, "color:purple;font-weight:bold;font-size:12px");

  const MISSING = [
{f:"2195",s:"4238252",st:"4",ct:"10"},
{f:"6437",s:"2807789",st:"1",ct:"10"},
{f:"20292",s:"4238363",st:"1",ct:"10"},
{f:"28894",s:"2520880",st:"1",ct:"10"},
{f:"31745",s:"4238362",st:"1",ct:"10"},
{f:"34186",s:"2523776",st:"1",ct:"10"},
{f:"36810",s:"2158549",st:"1",ct:"10"},
{f:"37010",s:"2616779",st:"1",ct:"10"},
{f:"37152",s:"2527098",st:"1",ct:"10"},
{f:"37152",s:"1783355",st:"1",ct:"10"},
{f:"37561",s:"2186681",st:"1",ct:"10"},
{f:"37561",s:"1570268",st:"1",ct:"10"},
{f:"38334",s:"2616781",st:"1",ct:"10"},
{f:"38375",s:"2526928",st:"1",ct:"10"},
{f:"38424",s:"2513042",st:"1",ct:"10"},
{f:"38424",s:"1783354",st:"1",ct:"10"},
{f:"38722",s:"4238733",st:"4",ct:"10"},
{f:"38722",s:"1829421",st:"1",ct:"10"},
{f:"38722",s:"2616784",st:"1",ct:"10"},
{f:"38976",s:"4239368",st:"1",ct:"10"},
{f:"38976",s:"4238389",st:"4",ct:"10"},
{f:"39465",s:"4238413",st:"4",ct:"10"},
{f:"40115",s:"1541361",st:"1",ct:"10"},
{f:"40452",s:"2230327",st:"1",ct:"10"},
{f:"40473",s:"4239873",st:"4",ct:"10"},
{f:"40473",s:"2806127",st:"1",ct:"10"},
{f:"40492",s:"4238364",st:"1",ct:"10"},
{f:"40563",s:"2616780",st:"1",ct:"10"},
{f:"40645",s:"4238272",st:"4",ct:"10"},
{f:"41121",s:"1783347",st:"1",ct:"10"},
{f:"41294",s:"2831295",st:"1",ct:"10"},
{f:"41593",s:"4238945",st:"1",ct:"10"},
{f:"41609",s:"2464467",st:"1",ct:"10"},
{f:"41609",s:"1561304",st:"1",ct:"10"},
{f:"42374",s:"4238939",st:"1",ct:"10"},
{f:"42845",s:"1762321",st:"1",ct:"10"},
{f:"42845",s:"2616783",st:"1",ct:"10"},
{f:"42908",s:"2583495",st:"1",ct:"10"},
{f:"43053",s:"4238963",st:"4",ct:"10"},
{f:"43732",s:"2801280",st:"1",ct:"10"},
{f:"43732",s:"2467336",st:"1",ct:"10"},
{f:"43732",s:"1672027",st:"1",ct:"10"},
{f:"43810",s:"2044489",st:"1",ct:"10"},
{f:"43832",s:"4239935",st:"4",ct:"10"},
{f:"43832",s:"4239934",st:"4",ct:"10"},
{f:"43832",s:"4239933",st:"4",ct:"10"},
{f:"43832",s:"2616787",st:"1",ct:"10"},
{f:"44160",s:"2431827",st:"1",ct:"10"},
{f:"44406",s:"4238940",st:"1",ct:"10"},
{f:"44649",s:"2494826",st:"1",ct:"10"},
{f:"44649",s:"1971083",st:"1",ct:"10"},
{f:"44681",s:"2158516",st:"1",ct:"10"},
{f:"44722",s:"2561552",st:"1",ct:"10"},
{f:"44934",s:"4238941",st:"1",ct:"10"},
{f:"45009",s:"1812813",st:"1",ct:"10"},
{f:"45278",s:"2464466",st:"1",ct:"10"},
{f:"45366",s:"2468946",st:"1",ct:"10"},
{f:"45393",s:"4238273",st:"4",ct:"10"},
{f:"45425",s:"1534892",st:"1",ct:"10"},
{f:"45439",s:"2493081",st:"1",ct:"10"},
{f:"45439",s:"2232638",st:"1",ct:"10"},
{f:"45608",s:"1684395",st:"1",ct:"10"},
{f:"45647",s:"2809968",st:"1",ct:"10"},
{f:"46195",s:"2846636",st:"1",ct:"10"},
{f:"46195",s:"2387506",st:"1",ct:"10"},
{f:"46308",s:"1482632",st:"1",ct:"10"},
{f:"46311",s:"2373997",st:"1",ct:"10"},
{f:"46414",s:"2807786",st:"1",ct:"10"},
{f:"46415",s:"2807787",st:"1",ct:"10"},
{f:"46481",s:"2186710",st:"1",ct:"10"},
{f:"46481",s:"1750116",st:"1",ct:"10"},
{f:"46481",s:"1491499",st:"1",ct:"10"},
{f:"46482",s:"2186711",st:"1",ct:"10"},
{f:"46482",s:"1750115",st:"1",ct:"10"},
{f:"46482",s:"1491500",st:"1",ct:"10"},
{f:"46489",s:"2478059",st:"1",ct:"10"},
{f:"46706",s:"1747194",st:"1",ct:"10"},
{f:"47002",s:"1928951",st:"1",ct:"10"},
{f:"48045",s:"1534896",st:"1",ct:"10"},
{f:"48046",s:"2030600",st:"1",ct:"10"},
{f:"48113",s:"2471831",st:"1",ct:"10"},
{f:"48132",s:"1493712",st:"1",ct:"10"},
{f:"48297",s:"4238861",st:"4",ct:"10"},
{f:"48529",s:"2475043",st:"1",ct:"10"},
{f:"48705",s:"2801736",st:"1",ct:"10"},
{f:"48791",s:"4238947",st:"1",ct:"10"},
{f:"48794",s:"4238949",st:"1",ct:"10"},
{f:"48933",s:"4238942",st:"1",ct:"10"},
{f:"48946",s:"1820006",st:"1",ct:"10"},
{f:"48971",s:"4238944",st:"1",ct:"10"},
{f:"48990",s:"4238951",st:"1",ct:"10"},
{f:"48990",s:"2471836",st:"1",ct:"10"},
{f:"49085",s:"2208405",st:"1",ct:"10"},
{f:"49087",s:"2710529",st:"1",ct:"10"},
{f:"49328",s:"2478060",st:"1",ct:"10"},
{f:"49717",s:"1534893",st:"1",ct:"10"},
{f:"49926",s:"2550926",st:"1",ct:"10"},
{f:"50247",s:"4238948",st:"1",ct:"10"},
{f:"50299",s:"1493083",st:"1",ct:"10"},
{f:"50398",s:"4238378",st:"1",ct:"10"},
{f:"50526",s:"1481577",st:"1",ct:"10"},
{f:"50628",s:"4238954",st:"1",ct:"10"},
{f:"50671",s:"1534884",st:"1",ct:"10"},
{f:"50703",s:"4239456",st:"4",ct:"10"},
{f:"50703",s:"2158527",st:"1",ct:"10"},
{f:"50786",s:"2813747",st:"1",ct:"10"},
{f:"50786",s:"2813746",st:"1",ct:"10"},
{f:"50831",s:"4238845",st:"4",ct:"10"},
{f:"51081",s:"2095513",st:"1",ct:"10"},
{f:"51523",s:"1873759",st:"1",ct:"10"},
{f:"51524",s:"4239370",st:"1",ct:"10"},
{f:"51524",s:"1873760",st:"1",ct:"10"},
{f:"51937",s:"2015229",st:"1",ct:"10"},
{f:"51937",s:"1825242",st:"1",ct:"10"},
{f:"51949",s:"2230323",st:"1",ct:"10"},
{f:"52011",s:"2527717",st:"1",ct:"10"},
{f:"52229",s:"1906782",st:"1",ct:"10"},
{f:"52663",s:"2400828",st:"1",ct:"10"},
{f:"52663",s:"2295206",st:"1",ct:"10"},
{f:"52713",s:"2509377",st:"1",ct:"10"},
{f:"52713",s:"1900382",st:"1",ct:"10"},
{f:"52724",s:"2475041",st:"1",ct:"10"},
{f:"52815",s:"1900379",st:"1",ct:"10"},
{f:"52880",s:"2554694",st:"1",ct:"10"},
{f:"52884",s:"2207456",st:"1",ct:"10"},
{f:"52956",s:"4239530",st:"4",ct:"10"},
{f:"52956",s:"2158525",st:"1",ct:"10"},
{f:"52984",s:"2479869",st:"1",ct:"10"},
{f:"53304",s:"2813748",st:"1",ct:"10"},
{f:"53548",s:"1969509",st:"1",ct:"10"},
{f:"53696",s:"2513039",st:"1",ct:"10"},
{f:"53715",s:"2185058",st:"1",ct:"10"},
{f:"53838",s:"4238957",st:"1",ct:"10"},
{f:"53847",s:"2471835",st:"1",ct:"10"},
{f:"53981",s:"2182259",st:"1",ct:"10"},
{f:"54255",s:"2484169",st:"1",ct:"10"},
{f:"54264",s:"4238958",st:"1",ct:"10"},
{f:"54330",s:"2165309",st:"1",ct:"10"},
{f:"54476",s:"2165307",st:"1",ct:"10"},
{f:"54550",s:"2220540",st:"1",ct:"10"},
{f:"54551",s:"2220539",st:"1",ct:"10"},
{f:"54845",s:"4238952",st:"1",ct:"10"},
{f:"54845",s:"2185045",st:"1",ct:"10"},
{f:"54888",s:"2182282",st:"1",ct:"10"},
{f:"54907",s:"2192756",st:"1",ct:"10"},
{f:"55056",s:"2220569",st:"1",ct:"10"},
{f:"55065",s:"4238959",st:"1",ct:"10"},
{f:"55093",s:"4238682",st:"4",ct:"10"},
{f:"55094",s:"4238681",st:"4",ct:"10"},
{f:"55301",s:"2281584",st:"1",ct:"10"},
{f:"55498",s:"2273134",st:"1",ct:"10"},
{f:"55540",s:"2831294",st:"1",ct:"10"},
{f:"55540",s:"2526911",st:"1",ct:"10"},
{f:"55954",s:"2475046",st:"1",ct:"10"},
{f:"55954",s:"2295205",st:"1",ct:"10"},
{f:"56026",s:"2478506",st:"1",ct:"10"},
{f:"56048",s:"2431182",st:"1",ct:"10"},
{f:"56072",s:"4238946",st:"1",ct:"10"},
{f:"56072",s:"2813750",st:"1",ct:"10"},
{f:"56118",s:"2561418",st:"1",ct:"10"},
{f:"56491",s:"4238956",st:"1",ct:"10"},
{f:"56641",s:"2453125",st:"1",ct:"10"},
{f:"56654",s:"2419396",st:"1",ct:"10"},
{f:"56803",s:"2467368",st:"1",ct:"10"},
{f:"56943",s:"2475063",st:"1",ct:"10"},
{f:"56944",s:"2475064",st:"1",ct:"10"},
{f:"57291",s:"4238943",st:"1",ct:"10"},
{f:"57291",s:"2645903",st:"1",ct:"10"},
{f:"57640",s:"2563340",st:"1",ct:"10"},
{f:"57904",s:"2575335",st:"1",ct:"10"},
{f:"58760",s:"2736964",st:"1",ct:"10"},
{f:"58937",s:"2734461",st:"1",ct:"10"},
{f:"59128",s:"4238955",st:"1",ct:"10"},
{f:"59128",s:"2803360",st:"1",ct:"10"}
  ];

  const headers = {
    "x-requested-with": "XMLHttpRequest",
    "content-type": "application/json; charset=utf-8"
  };

  const t0 = Date.now();
  console.log(`%c[FPG] Fase 2: ${MISSING.length} scorecards em falta`, "color:blue;font-weight:bold;font-size:13px");

  const result = {};
  let ok = 0, fail = 0;

  for (let i = 0; i < MISSING.length; i++) {
    const m = MISSING[i];
    try {
      const urlParams = IS_MY_FPG
        ? `PlayerWHS.aspx/ScoreCard?score_id=${m.s}&pp=N&scoringtype=${m.st}&competitiontype=${m.ct}`
        : `PlayerWHS.aspx/ScoreCard?score_id=${m.s}&scoringtype=${m.st}&competitiontype=${m.ct}`;
      const bodyParams = IS_MY_FPG
        ? { score_id: m.s, pp: "N", scoringtype: m.st, competitiontype: m.ct }
        : { score_id: m.s, scoringtype: m.st, competitiontype: m.ct };

      const res = await fetch(urlParams, {
        method: "POST", headers,
        body: JSON.stringify(bodyParams)
      });
      if (res.status !== 200) { fail++; continue; }
      const payload = (await res.json())?.d;
      if (payload?.Result === "OK") {
        if (!result[m.f]) result[m.f] = { scorecards: {} };
        result[m.f].scorecards[m.s] = payload;
        ok++;
      } else { fail++; }
    } catch { fail++; }

    if ((i + 1) % 20 === 0 || i === MISSING.length - 1) {
      console.log(`[FPG] ${i + 1}/${MISSING.length} (${ok} ✅ ${fail} ❌)`);
    }
    if ((i + 1) % 10 === 0) await new Promise(r => setTimeout(r, 80));
  }

  downloadJSON(result, "fpg-batch-missing.json");

  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`%c[FPG] ✅ Fase 2 concluída: ${ok} scorecards em ${secs}s`, "color:green;font-weight:bold");
  console.log("  ➡️ Agora corre: node pipeline.js --update");

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