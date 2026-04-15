/*
 * DIAGNÓSTICO — Testa endpoints em ambos os sites
 * 
 * Cola em: scoring.datagolf.pt  E DEPOIS  scoring.fpg.pt
 * Compara os resultados para ver o que funciona onde
 */
(async () => {
  const SITE = location.host;
  const log = (m) => console.log("%c[DIAG " + SITE + "] " + m, "color:#2563eb;font-weight:bold");
  const ok = (m) => console.log("%c[DIAG] ✓ " + m, "color:green;font-weight:bold");
  const fail = (m) => console.log("%c[DIAG] ✗ " + m, "color:red");

  log("=== Diagnóstico de endpoints em " + SITE + " ===");

  // Helper: testa um endpoint POST
  async function testPost(label, url, body) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body)
      });
      if (!res.ok) { fail(label + " → HTTP " + res.status); return null; }
      const json = await res.json();
      const d = json.d || json;
      if (d.Result === "OK") {
        const count = d.Records?.length || d.TotalRecordCount || 0;
        ok(label + " → OK (" + count + " registos)");
        return d;
      } else {
        fail(label + " → Result: " + d.Result);
        return null;
      }
    } catch (e) {
      fail(label + " → " + e.message);
      return null;
    }
  }

  // Helper: testa um endpoint GET
  async function testGet(label, url) {
    try {
      const res = await fetch(url);
      if (!res.ok) { fail(label + " → HTTP " + res.status); return null; }
      const text = await res.text();
      ok(label + " → OK (" + text.length + " bytes)");
      return text;
    } catch (e) {
      fail(label + " → " + e.message);
      return null;
    }
  }

  log("");
  log("--- 1. TORNEIOS (ClassifLST) ---");
  // Testar ClassifLST com um torneio DRIVE conhecido
  const classif = await testPost(
    "ClassifLST (DRIVE Sul Laguna, ccode=988 tcode=10292)",
    "/pt/classif.aspx/ClassifLST",
    { Classi: "1", tclub: "988", tcode: "10292", classiforder: "1", classiftype: "I",
      classifroundtype: "D", scoringtype: "1", round: "1", members: "0", playertypes: "0",
      gender: "0", minagemen: "0", maxagemen: "999", minageladies: "0", maxageladies: "999",
      minhcp: "-8", maxhcp: "99", idfilter: "-1", jtStartIndex: 0, jtPageSize: 5, jtSorting: "" }
  );
  if (classif?.Records?.[0]) {
    const r = classif.Records[0];
    log("  Exemplo: " + r.player_name + " | score_id=" + r.score_id);
  }

  log("");
  log("--- 2. SCORECARD (torneio) ---");
  if (classif?.Records?.[0]) {
    const sid = classif.Records[0].score_id;
    // Via classif.aspx/ScoreCard
    await testPost(
      "classif.aspx/ScoreCard (score_id=" + sid + ")",
      "/pt/classif.aspx/ScoreCard",
      { score_id: String(sid), tclub: "988", tcode: "10292", scoringtype: "1",
        classiftype: "I", classifround: "1", jtStartIndex: 0, jtPageSize: 10, jtSorting: "" }
    );
    // Via classif.aspx/ScoreCard sem /pt/
    await testPost(
      "classif.aspx/ScoreCard (sem /pt/)",
      "classif.aspx/ScoreCard",
      { score_id: String(sid), tclub: "988", tcode: "10292", scoringtype: "1",
        classiftype: "I", classifround: "1", jtStartIndex: 0, jtPageSize: 10, jtSorting: "" }
    );
  }

  log("");
  log("--- 3. JOGADORES (PlayerWHS) ---");
  // Testar PlayerWHS com um federado conhecido (52884 = David Rente)
  await testPost(
    "PlayerWHS.aspx/HCPWhsFederLST (fed=52884)",
    "PlayerWHS.aspx/HCPWhsFederLST",
    { fed_code: "52884", jtStartIndex: 0, jtPageSize: 5 }
  );
  // Tentar com path /lists/
  await testPost(
    "/lists/PlayerWHS.aspx/HCPWhsFederLST",
    "/lists/PlayerWHS.aspx/HCPWhsFederLST",
    { fed_code: "52884", jtStartIndex: 0, jtPageSize: 5 }
  );

  log("");
  log("--- 4. RESULTADOS (PlayerResults) ---");
  await testPost(
    "PlayerResults.aspx/ResultsLST (fed=52884)",
    "PlayerResults.aspx/ResultsLST",
    { fed_code: "52884", jtStartIndex: 0, jtPageSize: 5 }
  );
  await testPost(
    "/lists/PlayerResults.aspx/ResultsLST",
    "/lists/PlayerResults.aspx/ResultsLST",
    { fed_code: "52884", jtStartIndex: 0, jtPageSize: 5 }
  );

  log("");
  log("--- 5. TOURNAMENTS PAGE ---");
  // Testar se tournaments.aspx existe
  await testGet("tournaments.aspx (HTML)", "/pt/tournaments.aspx");

  // Tentar endpoint TournamentsLST (possível API da página)
  const tournEndpoints = [
    "/pt/tournaments.aspx/TournamentsLST",
    "/pt/tournaments.aspx/TournamentLST",
    "/pt/tournaments.aspx/GetTournaments",
    "/pt/Tournaments.aspx/TournamentsLST",
  ];
  for (const ep of tournEndpoints) {
    await testPost(
      ep,
      ep,
      { jtStartIndex: 0, jtPageSize: 50, jtSorting: "", year: "2026" }
    );
  }

  log("");
  log("--- 6. jQuery disponível? ---");
  if (typeof jQuery !== "undefined") {
    ok("jQuery " + jQuery.fn.jquery);
  } else {
    fail("jQuery não existe nesta página");
  }

  log("");
  log("=== FIM do diagnóstico em " + SITE + " ===");
  log("Agora corre o mesmo script no OUTRO site e compara!");
})();
