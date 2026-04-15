// ============================================================
// diagnose-r2-scorecard.js — Encontrar como obter ScoreCard R2
// Cola em: https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=000&tcode=10873
//
// Sabemos: ClassifLST round=2 → gross=71 (R2 real!)
// Problema: ScoreCard classifround=2 → devolve R1 (gross=67)
// Vamos testar combinações de parâmetros no ScoreCard
// ============================================================

(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log  = m => console.log("%c[sc] " + m, "color:#2563eb;font-weight:bold");
  const ok   = m => console.log("%c[sc] ✓ " + m, "color:green;font-weight:bold");
  const warn = m => console.log("%c[sc] ✗ " + m, "color:red;font-weight:bold");
  const info = m => console.log("%c[sc]   " + m, "color:#6366f1");
  const HIT  = m => console.log("%c[sc] 🎯 " + m, "color:green;font-weight:bold;font-size:14px");

  const TC = "000", TCD = "10873", SID = "53013";
  const R1_FRONT = 34; // José Miguel R1 front

  async function trySC(label, qsExtra, bodyExtra) {
    const baseQS = "score_id=" + SID + "&tclub=" + TC + "&tcode=" + TCD + "&scoringtype=1&classiftype=I";
    const baseBody = {
      score_id: SID, tclub: TC, tcode: TCD,
      scoringtype: "1", classiftype: "I",
    };
    const qs = baseQS + (qsExtra ? "&" + qsExtra : "");
    const body = { ...baseBody, ...bodyExtra };
    try {
      const res = await fetch("classif.aspx/ScoreCard?" + qs, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { warn(label + " → HTTP " + res.status); return; }
      const json = await res.json();
      const d = json.d || json;
      if (d.Result !== "OK" || !d.Records?.length) { info(label + " → vazio"); return; }
      const rec = d.Records[0];
      const front = [1,2,3,4,5,6,7,8,9].reduce((s,h) => s + (Number(rec["gross_"+h]) || 0), 0);
      const gross = rec.gross_total;
      if (front !== R1_FRONT) {
        HIT(label + " → Front=" + front + " gross=" + gross + " ← R2 ENCONTRADA!");
      } else {
        info(label + " → Front=" + front + " gross=" + gross + " (=R1)");
      }
      // Se múltiplos records, verificar
      if (d.Records.length > 1) {
        ok(label + " → " + d.Records.length + " RECORDS! (multi-round data?)");
        d.Records.forEach((r, i) => {
          const f = [1,2,3,4,5,6,7,8,9].reduce((s,h) => s + (Number(r["gross_"+h]) || 0), 0);
          info("  Record " + i + ": front=" + f + " gross=" + r.gross_total);
        });
      }
    } catch(e) {
      warn(label + " → ERRO: " + e.message);
    }
  }

  // ═══════════════════════════════════════
  log("═══ A: classifround variações ═══");
  await trySC("classifround=1", "classifround=1", { classifround: "1" });
  await sleep(100);
  await trySC("classifround=2", "classifround=2", { classifround: "2" });
  await sleep(100);

  log("");
  log("═══ B: Adicionar round ao body/qs ═══");
  await trySC("cr=2 + round=2", "classifround=2&round=2", { classifround: "2", round: "2" });
  await sleep(100);
  await trySC("cr=1 + round=2", "classifround=1&round=2", { classifround: "1", round: "2" });
  await sleep(100);
  await trySC("round=2 sem cr", "round=2", { round: "2" });
  await sleep(100);

  log("");
  log("═══ C: classifroundtype no ScoreCard ═══");
  await trySC("cr=2 + rndtype=D", "classifround=2&classifroundtype=D", { classifround: "2", classifroundtype: "D" });
  await sleep(100);
  await trySC("cr=2 + rndtype=R", "classifround=2&classifroundtype=R", { classifround: "2", classifroundtype: "R" });
  await sleep(100);

  log("");
  log("═══ D: Outros nomes de parâmetro ═══");
  await trySC("volta=2", "classifround=2&volta=2", { classifround: "2", volta: "2" });
  await sleep(100);
  await trySC("Volta=2", "classifround=2&Volta=2", { classifround: "2", Volta: "2" });
  await sleep(100);
  await trySC("roundnumber=2", "classifround=2&roundnumber=2", { classifround: "2", roundnumber: "2" });
  await sleep(100);

  log("");
  log("═══ E: Só round na QS (não no body) ═══");
  try {
    const qs = "score_id=" + SID + "&tclub=" + TC + "&tcode=" + TCD + "&scoringtype=1&classiftype=I&classifround=2&round=2";
    const body = { score_id: SID, tclub: TC, tcode: TCD, scoringtype: "1", classiftype: "I", classifround: "2" };
    const res = await fetch("classif.aspx/ScoreCard?" + qs, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    const rec = json.d?.Records?.[0];
    if (rec) {
      const front = [1,2,3,4,5,6,7,8,9].reduce((s,h) => s + (Number(rec["gross_"+h]) || 0), 0);
      if (front !== R1_FRONT) HIT("QS round=2, body sem → Front=" + front);
      else info("QS round=2, body sem → Front=" + front + " (=R1)");
    } else info("QS round=2, body sem → vazio");
  } catch(e) { warn("E → " + e.message); }
  await sleep(100);

  log("");
  log("═══ F: Trocar a página base (scoring.fpg.pt) ═══");
  info("Se o site irmão tiver IDs diferentes, pode ter R2 separada");
  info("(Isto só funciona se estiveres em scoring.fpg.pt — skip se estás no .datagolf.pt)");

  log("");
  log("═══ G: Ver o JS source do site para referências a round/volta ═══");
  try {
    // Procurar no source da página como abre o scorecard
    const scripts = document.querySelectorAll("script");
    let scRef = [];
    scripts.forEach(s => {
      const t = s.textContent || "";
      if (/ScoreCard/i.test(t)) {
        // Extrair linhas com ScoreCard
        const lines = t.split("\n").filter(l => /ScoreCard|classifround|round/i.test(l));
        scRef.push(...lines.map(l => l.trim()).filter(l => l.length > 5 && l.length < 300));
      }
    });
    if (scRef.length) {
      ok("Referências a ScoreCard no JS source:");
      scRef.forEach(l => info("  " + l));
    } else {
      info("Sem referências a ScoreCard no JS inline. Tentar ficheiros externos...");
      // Check external JS files
      const extScripts = [...document.querySelectorAll("script[src]")].map(s => s.src);
      info("Ficheiros JS externos: " + extScripts.length);
      extScripts.forEach(s => info("  " + s));
    }
  } catch(e) { info("G → " + e.message); }

  log("");
  log("═══ H: Capturar ClassifLST round=2 — ver TODOS os campos ═══");
  try {
    const body = {
      Classi: "1", tclub: TC, tcode: TCD,
      classiforder: "1", classiftype: "I", classifroundtype: "D",
      scoringtype: "1", round: "2", members: "0", playertypes: "0",
      gender: "0", minagemen: "0", maxagemen: "999",
      minageladies: "0", maxageladies: "999",
      minhcp: "-8", maxhcp: "99", idfilter: "-1",
      jtStartIndex: "0", jtPageSize: "5", jtSorting: "score_id DESC",
    };
    const qs = "jtStartIndex=0&jtPageSize=5&jtSorting=" + encodeURIComponent("score_id DESC");
    const res = await fetch("classif.aspx/ClassifLST?" + qs, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    const recs = json.d?.Records || [];
    if (recs.length > 0) {
      const jose = recs.find(r => (r.player_name || "").includes("Franco")) || recs[0];
      ok("ClassifLST round=2 — TODOS os campos de " + jose.player_name + ":");
      const keys = Object.keys(jose).sort();
      keys.forEach(k => info("  " + k + " = " + JSON.stringify(jose[k])));
    }
  } catch(e) { warn("H → " + e.message); }

  log("");
  ok("═══ DIAGNÓSTICO COMPLETO ═══");
})();
