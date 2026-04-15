/* Teste: verificar se os score_ids do DRIVE funcionam no my.fpg.pt
   Cola na consola em: https://my.fpg.pt/Home/PlayerWHS.aspx?no=45366
*/
(async function() {
  var BASE = "/Home/";
  var ok = function(m) { console.log("%c[TEST] " + m, "color:green;font-weight:bold"); };
  var err = function(m) { console.log("%c[TEST] " + m, "color:red;font-weight:bold"); };
  var log = function(m) { console.log("%c[TEST] " + m, "color:#16a34a"); };

  /* Testar 3 score_ids conhecidos do scoring.datagolf.pt */
  var tests = [
    { scoreId: "4276", name: "Santiago Dias (DT Norte, Vale Pisão)" },
    { scoreId: "1677", name: "Matilde Leal Gouveia (DT Madeira, Santo Serra)" },
    { scoreId: "3908", name: "Joe Short (DT Sul, Vila Sol)" },
  ];

  /* Tentar varios formatos de API */
  var attempts = [
    /* 1. my.fpg.pt PlayerResults ScoreCard (scoringtype=1, competitiontype=1) */
    function(sid) {
      return { 
        url: BASE + "PlayerResults.aspx/ScoreCard?score_id=" + sid + "&scoringtype=1&competitiontype=1",
        body: JSON.stringify({ score_id: sid, scoringtype: "1", competitiontype: "1" })
      };
    },
    /* 2. my.fpg.pt PlayerResults ScoreCard (scoringtype=1, competitiontype=2) */
    function(sid) {
      return {
        url: BASE + "PlayerResults.aspx/ScoreCard?score_id=" + sid + "&scoringtype=1&competitiontype=2",
        body: JSON.stringify({ score_id: sid, scoringtype: "1", competitiontype: "2" })
      };
    },
    /* 3. my.fpg.pt PlayerWHS ScoreCard */
    function(sid) {
      return {
        url: BASE + "PlayerWHS.aspx/ScoreCard?score_id=" + sid + "&scoringtype=1&competitiontype=1",
        body: JSON.stringify({ score_id: sid, scoringtype: "1", competitiontype: "1" })
      };
    },
    /* 4. jTable style body */
    function(sid) {
      return {
        url: BASE + "PlayerResults.aspx/ScoreCard?score_id=" + sid + "&scoringtype=1&competitiontype=1",
        body: JSON.stringify({ jtStartIndex: 0, jtPageSize: 10, jtSorting: "" })
      };
    },
  ];

  ok("=== Teste ScoreCard via my.fpg.pt ===");

  for (var a = 0; a < attempts.length; a++) {
    var attempt = attempts[a];
    var test = tests[0]; /* Santiago Dias */
    var cfg = attempt(test.scoreId);
    log("");
    log("Tentativa " + (a+1) + ": " + cfg.url.substring(0,80));

    try {
      var resp = await fetch(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
        body: cfg.body
      });
      log("  HTTP " + resp.status);
      if (resp.ok) {
        var json = await resp.json();
        var d = json.d || json;
        if (d && d.Result === "OK" && d.Records && d.Records.length > 0) {
          var r = d.Records[0];
          ok("  SUCESSO! " + (r.player_name || "") + " | gross_1=" + r.gross_1 + " | par_1=" + r.par_1);
          ok("  FORMATO CORRECTO: tentativa " + (a+1));
          ok("");

          /* Testar os outros 2 */
          for (var t = 1; t < tests.length; t++) {
            var cfg2 = attempt(tests[t].scoreId);
            var resp2 = await fetch(cfg2.url, {
              method: "POST",
              headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
              body: cfg2.body
            });
            if (resp2.ok) {
              var json2 = await resp2.json();
              var d2 = json2.d || json2;
              if (d2 && d2.Result === "OK" && d2.Records && d2.Records.length > 0) {
                ok("  Confirmado: " + tests[t].name + " -> " + d2.Records[0].player_name);
              } else {
                err("  Falhou: " + tests[t].name);
              }
            }
          }
          
          ok("");
          ok("COPIA esta info e cola no Claude!");
          ok("Tentativa que funcionou: " + (a+1));
          ok("URL: " + cfg.url);
          ok("Body: " + cfg.body);
          return;
        } else {
          err("  Result: " + (d ? d.Result : "null") + " Records: " + (d && d.Records ? d.Records.length : 0));
          if (d && d.Message) err("  Msg: " + d.Message);
        }
      } else {
        var txt = "";
        try { txt = await resp.text(); } catch(e){}
        err("  Resposta: " + txt.substring(0, 200));
      }
    } catch(e) {
      err("  Excepção: " + e.message);
    }
  }

  err("");
  err("Nenhuma tentativa funcionou.");
  err("Cola os resultados acima no Claude para eu ajustar.");
})();
