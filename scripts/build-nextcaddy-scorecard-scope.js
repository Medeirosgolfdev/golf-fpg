/**
 * scripts/build-nextcaddy-scorecard-scope.js
 *
 * Gera um scope de torneios NextCaddy que TÊM leaderboard HTML real (com
 * inscribedId por jogador) mas estão SEM os scorecards hole-by-hole
 * (roundScores). São os "nextcaddy-only" — torneios cujo único sítio com
 * cartão por buraco é o /tarjeta-aux do NextCaddy (ao contrário dos que também
 * estão no livegolfscoring). O passo de leaderboards do pipeline grava-os sem
 * scorecards; este scope alimenta a passagem `--patch-scorecards`.
 *
 * Ordenação: por nº de scorecards em falta DESCENDENTE. Assim um lote limitado
 * (`--limit N`) ataca sempre os maiores buracos primeiro (mais dados por
 * corrida) e os torneios com 1 straggler permanente (jogador sem cartão, WD)
 * afundam para o fim — sem precisar de ficheiro de estado. Stateless e
 * idempotente: à medida que os scorecards entram, os torneios saem do scope.
 *
 * Exclui: leaderboardPdfOnly (resultados só em PDF, sem cartões), torneios sem
 * jogadores (futuros/vazios) e torneios cujos jogadores não têm inscribedId
 * (formato antigo sem link de tarjeta — não raspável).
 *
 * USO:
 *   node scripts/build-nextcaddy-scorecard-scope.js                       # todos os backfillable
 *   node scripts/build-nextcaddy-scorecard-scope.js --limit 100           # top-100 por gap
 *   node scripts/build-nextcaddy-scorecard-scope.js --limit 30 --out scripts/x.json
 *   node scripts/build-nextcaddy-scorecard-scope.js --min-missing 3       # só com ≥3 em falta
 *   node scripts/build-nextcaddy-scorecard-scope.js --include 65641,71639 # força incluir estes no topo
 */
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "../public/data/nextcaddy");

/* Termos que marcam um torneio como JUVENIL (--junior). Testados contra o NOME
 * do torneio e os nomes das categorias do leaderboard. NÃO inclui "menor"
 * (ambíguo: as categorias adultas de hcp dizem "menor de 36"). O corpus
 * NextCaddy do pipeline contém ~739 torneios ADULTOS (Senior/Caballeros/
 * Categorías por hcp) que não interessam ao tracking juvenil — este filtro
 * isola os ~210 genuinamente juvenis (~6.6k scorecards vs 38k totais). */
const JUNIOR_RE = /benj|alev[ií]?n|infant|cadet|juven|junior|\bsub\s?-?\s?\d{1,2}\b|pequec|promes|escolar|\bU-?(1[0-8]|[6-9])\b/i;

function isJuniorTour(d) {
  const name = (d.meta && d.meta.name) || "";
  const cats = (d.leaderboard || []).map((c) => c.categoryName || "").join(" ");
  return JUNIOR_RE.test(name) || JUNIOR_RE.test(cats);
}

function main() {
  const args = process.argv.slice(2);
  const getArg = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };
  const limit = parseInt(getArg("limit", "0"), 10) || 0;            // 0 = sem limite
  const minMissing = parseInt(getArg("min-missing", "1"), 10) || 1;
  const juniorOnly = args.includes("--junior");                    // só torneios juvenis
  const out = path.resolve(process.cwd(), getArg("out", "scripts/nextcaddy-scorecard-scope.json"));
  const include = new Set((getArg("include", "") || "").split(",").map((s) => parseInt(s.trim(), 10)).filter(Boolean));

  const rows = [];
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".json")) continue;
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { continue; }
    if (d.leaderboardPdfOnly === true) continue;                    // só PDF — sem cartões
    if (juniorOnly && !isJuniorTour(d)) continue;                   // --junior: salta adultos
    const all = (d.leaderboard || []).flatMap((c) => c.players || []);
    if (!all.length) continue;                                      // vazio/futuro
    const ids = [...new Set(all.filter((p) => p.inscribedId).map((p) => p.inscribedId))];
    if (!ids.length) continue;                                      // sem inscribedId — não raspável
    // "Cheio" = tem roundScores COM a chave `meters` (distância do tee do jogador).
    // Cartões de runs antigos têm roundScores mas sem `meters` → contam como em falta
    // para serem re-buscados 1× e ganharem os metros por jogador (rapazes/raparigas
    // jogam tees diferentes). Alinhado com o needsFetch() do patch mode.
    const filled = new Set(all.filter((p) => p.roundScores && p.roundScores[0] && ("meters" in p.roundScores[0])).map((p) => p.inscribedId));
    const missing = ids.filter((id) => !filled.has(id)).length;
    if (missing >= minMissing) rows.push({ tourId: d.tourId, missing, total: ids.length });
  }

  // Maior gap primeiro; forçados (--include) sobem ao topo na ordem dada.
  rows.sort((a, b) => {
    const ia = include.has(a.tourId) ? 1 : 0;
    const ib = include.has(b.tourId) ? 1 : 0;
    if (ia !== ib) return ib - ia;
    return b.missing - a.missing || a.tourId - b.tourId;
  });

  const picked = limit > 0 ? rows.slice(0, limit) : rows;
  const totMiss = picked.reduce((a, b) => a + b.missing, 0);

  fs.writeFileSync(out, JSON.stringify({
    note: "nextcaddy tours com leaderboard+inscribedId mas roundScores em falta (gap desc)",
    totalBackfillable: rows.length,
    selected: picked.length,
    scorecardsToFetch: totMiss,
    tours: picked.map((p) => p.tourId),
  }, null, 2));

  console.log(`Backfillable total: ${rows.length} | selecionados: ${picked.length}${limit ? ` (limit ${limit})` : ""} | scorecards em falta no lote: ${totMiss}`);
  console.log(`Scope → ${out}`);
}

main();
