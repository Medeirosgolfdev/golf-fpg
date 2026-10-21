/**
 * scripts/aggregator/validate/sanity-check.js
 *
 * Verifica invariantes pós-build. Se um check crítico falhar, o build aborta.
 *
 * Checks actuais:
 *   - Manuel Medeiros presente + tem sources.fpg + tem dob
 *   - Dmitrii Elchaninov presente + 5 confrontos com Manuel
 *   - Pisos absolutos realistas (MIN_JUNIORS / MIN_TOURNAMENTS) — antes eram
 *     100/500 contra ~38 672/27 987 reais, ou seja, nunca disparavam
 *   - Queda face ao canónico em disco ≤ MAX_DROP (10%), salvo --force
 *   - Cada junior com tournamentIds tem pelo menos 1 entrada em tournaments
 */

const fs = require("fs");
const { fail, ok, sub, warn } = require("../util/log");
const { normName } = require("../util/names");

// Medido a 2026-10-20: 38 672 juniores · 27 987 torneios. Os pisos ficam a
// ~75% para aguentar limpezas de duplicados legítimas; a queda relativa (10%)
// é a guarda principal.
const MIN_JUNIORS = 29000;
const MIN_TOURNAMENTS = 21000;
const MAX_DROP = 0.10;

/**
 * Contagens do canónico que está em disco (antes de gravar o novo).
 * null se não existir ou estiver ilegível (ex: marcadores de conflito do git).
 */
function readPrevious(DATA) {
  const prev = { juniors: null, tournaments: null };
  try {
    if (fs.existsSync(DATA.outJuniors)) {
      const j = JSON.parse(fs.readFileSync(DATA.outJuniors, "utf8"));
      if (Array.isArray(j.juniors)) prev.juniors = j.juniors.length;
    }
  } catch { /* ilegível → sem comparação */ }
  try {
    if (fs.existsSync(DATA.outTournaments)) {
      const m = JSON.parse(fs.readFileSync(DATA.outTournaments, "utf8"));
      if (typeof m.totalTournaments === "number") prev.tournaments = m.totalTournaments;
      else if (Array.isArray(m.tournaments)) prev.tournaments = m.tournaments.length;
    }
  } catch { /* idem */ }
  return prev;
}

/** Queda relativa: passa se não há anterior, se --force, ou se perdeu ≤ maxDrop. */
function dropCheck(name, prev, cur, force, maxDrop = MAX_DROP) {
  if (typeof prev !== "number" || prev <= 0) {
    return { name, pass: true, detail: `${cur} (sem canónico anterior para comparar)` };
  }
  const drop = (prev - cur) / prev;
  const pct = Math.abs(drop * 100).toFixed(1);
  const sign = drop > 0 ? "-" : "+";
  let note = "";
  if (drop > maxDrop) note = force ? " — aceite por --force" : ` — queda > ${maxDrop * 100}%, usar --force se for intencional`;
  return { name, pass: drop <= maxDrop || force, detail: `${prev} → ${cur} (${sign}${pct}%)${note}` };
}

function run(result, { previous = null, force = false } = {}) {
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

  // 6. Confrontos Manuel × Dmitrii — esperado: 7
  // (USKids EC26 + Venice 25 + Venice 26, FPG QDL 25, EOWAGR LTQ 25, WJGC 25 + 26)
  let confrontos = 0;
  if (manuel && dmitrii) {
    const manuelTids = new Set(manuel.tournamentIds);
    const dmitriiTids = new Set(dmitrii.tournamentIds);
    for (const tid of manuelTids) {
      if (dmitriiTids.has(tid)) confrontos++;
    }
  }
  checks.push({
    name: "Manuel × Dmitrii confrontos (esperado 7)",
    pass: confrontos === 7,
    detail: `${confrontos} confrontos`,
    soft: true, // warning não bloqueia build
  });

  // 7. Pisos absolutos (--force passa por cima, ex: corrida --only de debug)
  checks.push({
    name: `Pelo menos ${MIN_JUNIORS} juniores`,
    pass: juniors.length >= MIN_JUNIORS || force,
    detail: `${juniors.length} juniores`,
  });

  // 8. Pisos absolutos de torneios
  checks.push({
    name: `Pelo menos ${MIN_TOURNAMENTS} torneios`,
    pass: tournaments.length >= MIN_TOURNAMENTS || force,
    detail: `${tournaments.length} torneios`,
  });

  // 8b. Queda face ao canónico em disco
  checks.push(dropCheck("Juniores não caem mais de 10% face ao disco", previous?.juniors, juniors.length, force));
  checks.push(dropCheck("Torneios não caem mais de 10% face ao disco", previous?.tournaments, tournaments.length, force));

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

module.exports = { run, readPrevious, dropCheck, MIN_JUNIORS, MIN_TOURNAMENTS, MAX_DROP };
