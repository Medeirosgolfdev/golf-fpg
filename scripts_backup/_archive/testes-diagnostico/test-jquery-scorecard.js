/* Teste rapido: buscar 1 scorecard via jQuery.ajax
   CORRE em: https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=982&tcode=10199
   (ou qualquer outra pagina de Classifications)
*/
(function() {
  if (typeof jQuery === "undefined") {
    console.log("%cERRO: jQuery nao existe nesta pagina!", "color:red;font-size:14px");
    return;
  }
  console.log("%cjQuery OK: " + jQuery.fn.jquery, "color:green");

  /* Tentar buscar scorecard da Matilde (score_id=1677, DT Madeira) */
  jQuery.ajax({
    url: "classif.aspx/ScoreCard",
    type: "POST",
    dataType: "json",
    contentType: "application/json; charset=utf-8",
    data: JSON.stringify({
      score_id: "1677",
      tclub: "982",
      tcode: "10199",
      scoringtype: "1",
      classiftype: "I",
      classifround: "1",
      jtStartIndex: 0,
      jtPageSize: 10,
      jtSorting: ""
    }),
    success: function(json) {
      var d = json.d || json;
      if (d && d.Result === "OK" && d.Records && d.Records.length > 0) {
        var r = d.Records[0];
        console.log("%cSUCESSO! " + r.player_name + " | gross_1=" + r.gross_1 + " | fed=" + r.federated_code, "color:green;font-weight:bold;font-size:14px");
        console.log("Scores:", [r.gross_1,r.gross_2,r.gross_3,r.gross_4,r.gross_5,r.gross_6,r.gross_7,r.gross_8,r.gross_9].join(","));
        console.log("%cFunciona! Podes correr o scraper completo.", "color:blue;font-weight:bold;font-size:13px");
      } else {
        console.log("%cFALHOU: " + JSON.stringify(d).substring(0,300), "color:red");
      }
    },
    error: function(xhr, status, error) {
      console.log("%cERRO " + xhr.status + ": " + error, "color:red;font-weight:bold");
      console.log("Resposta:", xhr.responseText ? xhr.responseText.substring(0, 300) : "(vazio)");
    }
  });
})();
