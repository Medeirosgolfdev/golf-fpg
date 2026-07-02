/**
 * scripts/aggregator/validate/sanity-check.js
 *
 * Verifica invariantes pós-build. Se um check crítico falhar, o build aborta.
 *
 * Checks actuais:
 *   - Manuel Medeiros presente + tem sources.fpg + tem dob
 *   - Dmitrii Elchaninov presente + 5 confrontos com Manuel
 *   - Pelo menos 100 juniores resolvidos
 *   - Pelo menos 500 torneios totais
 *   - Cada junior com tournamentIds tem pelo menos 1 entrada em tournaments
 */

const { fail, ok, sub, warn } = require("../util/log");
const { normName } = require("../util/names");

function run(result) {
  const { juniors, tournaments } = result;
  const checks = [];

  // Helper para encontrar Manuel
  const manuel = juniors.find((j) => j.sources?.fpg?.fed === "52884");
  const dmitrii = juniors.find((j) => j.sources?.uskids?.memberId === "549578");

  // 1. Manuel presente
  checks.push({
    name: "Manuel Medeiros (FPG 52884) presente",
    pass: !!manuel,
    detail: manuel ? `id=${manuel.id} · canonicalName="${manuel.canonicalName}"` : "não encontrado",
  });

  // 2. Manuel tem DOB
  checks.push({
    name: "Manuel tem DOB",
    pass: !!manuel?.dob,
    detail: manuel?.dob || "(em falta)",
  });

  // 3. Manuel tem USKids memberId
  checks.push({
    name: "Manuel cruzado com USKids #630106",
    pass: manuel?.sources?.uskids?.memberId === "630106",
    detail: manuel?.sources?.uskids?.memberId || "(não cruzado)",
  });

  // 4. Dmitrii presente
  checks.push({
    name: "Dmitrii Elchaninov (USKids 549578) presente",
    pass: !!dmitrii,
    detail: dmitrii ? `id=${dmitrii.id} · DOB=${dmitrii.dob || "?"}` : "não encontrado",
  });

  // 5. Dmitrii cruzado com RFEG (esperado: lic AM84955303 + historical AM11955303)
  const rfegLic = dmitrii?.sources?.rfeg?.lic;
  const rfegHist = dmitrii?.sources?.rfeg?.historicalLicenses || [];
  checks.push({
    name: "Dmitrii cruzado com RFEG (deve ter 2 licenças: 1 activa + 1 historical)",
    pass: !!rfegLic && rfegHist.length >= 1,
    detail: rfegLic ? `active=${rfegLic} · historical=${JSON.stringify(rfegHist)}` : "(sem RFEG)",
  });

  // 6. Confrontos Manuel × Dmitrii — esperado: 6
  // (USKids EC26 + Venice 25, FPG QDL 25, EOWAGR LTQ 25, WJGC 25 + 26)
  let confrontos = 0;
  if (manuel && dmitrii) {
    const manuelTids = new Set(manuel.tournamentIds);
    const dmitriiTids = new Set(dmitrii.tournamentIds);
    for (const tid of manuelTids) {
      if (dmitriiTids.has(tid)) confrontos++;
    }
  }
  checks.push({
    name: "Manuel × Dmitrii confrontos (esperado 6)",
    pass: confrontos === 6,
    detail: `${confrontos} confrontos`,
    soft: true, // warning não bloqueia build
  });

  // 7. Pelo menos 100 juniores
  checks.push({
    name: "Pelo menos 100 juniores",
    pass: juniors.length >= 100,
    detail: `${juniors.length} juniores`,
  });

  // 8. Pelo menos 500 torneios
  checks.push({
    name: "Pelo menos 500 torneios",
    pass: tournaments.length >= 500,
    detail: `${tournaments.length} torneios`,
  });

  // 9. Consistência tournamentIds → tournaments
  const tournIdSet = new Set(tournaments.map((t) => t.id));
  let danglingTids = 0;
  for (const j of juniors) {
    for (const tid of j.tournamentIds || []) {
      if (!tournIdSet.has(tid)) danglingTids++;
    }
  }
  checks.push({
    name: "Sem tournamentIds dangling",
    pass: danglingTids === 0,
    detail: `${danglingTids} referências quebradas`,
  });

  // Imprimir resultados detalhados (sub)
  for (const c of checks) {
    if (c.pass) {
      sub(`✓ ${c.name} — ${c.detail}`);
    } else if (c.soft) {
      warn(`${c.name} — ${c.detail} (soft)`);
    } else {
      fail(`${c.name} — ${c.detail}`);
    }
  }

  const failures = checks.filter((c) => !c.pass && !c.soft).map((c) => `${c.name}: ${c.detail}`);
  const passedCount = checks.filter((c) => c.pass).length;
  return {
    passed: failures.length === 0,
    totalCount: checks.length,
    passedCount,
    failedCount: failures.length,
    failures,
  };
}

module.exports = { run };
