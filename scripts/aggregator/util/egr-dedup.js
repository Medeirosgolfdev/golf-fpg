/**
 * scripts/aggregator/util/egr-dedup.js
 *
 * Dedup GENÉRICO de eventos EGR contra as fontes dedicadas — corre no
 * index.js DEPOIS de todos os adapters carregarem e ANTES do identity-matcher.
 *
 * O EGR é um meta-agregador: republica (só com totais R1-R4) eventos que
 * muitas vezes já scrapamos numa fonte dedicada mais rica (rfeg, ffgolf,
 * england, gjgl, ejo, fpg, job, …). A whitelist regex do adapter egr.js só
 * cobria meia dúzia de casos; o resto entrava DUPLICADO no kids2 (o mesmo
 * miúdo com o mesmo torneio 2× lado a lado).
 *
 * Sinal: OVERLAP DE ROSTER por nome normalizado (tokens ordenados, para
 * "Apelido, Nome" ↔ "Nome Apelido" casarem), com janela de datas.
 * Calibrado 2026-08-06 sobre o canónico (juniorId como ground truth,
 * 673 eventos EGR × ~20k dedicados):
 *   - verdadeiros duplicados: egr% ≥ 0.82, ou ovMin = 1 com dezenas partilhados
 *     (caso FCG: o EGR agrupa categorias que a fonte dedicada parte em jornadas);
 *   - falsos positivos (eventos distintos no mesmo fim-de-semana com o mesmo
 *     pool de jogadores de topo): todos ≤ 0.5 em ambas as métricas.
 * Regra (margem 0.5 → 0.82): shared ≥ 5 E (shared/|egr| ≥ 0.7 OU
 * (shared/min ≥ 0.85 E shared ≥ 15)). A fonte dedicada ganha SEMPRE
 * (tem scorecards/licenças/DOB); o evento EGR é removido por inteiro.
 */

const { normName } = require("./names");

const DAY_MS = 86400000;
/** Janela extra além do intervalo de datas do evento (datas de início divergem
 *  entre plataformas — ex: JOB 2025-01-01 vs 2025-01-03). */
const DATE_SLACK_DAYS = 3;

/** Chave de roster: normName + tokens ordenados — casa "Eva Mooslechner",
 *  "MOOSLECHNER, Eva" e variantes com/sem diacríticos. */
function rosterKey(name) {
  const n = normName(name);
  if (!n) return "";
  return n.split(" ").sort().join(" ");
}

/** Set de rosterKeys de um RawTournament (todos os flights). */
function rosterOf(t) {
  const s = new Set();
  for (const f of t.flights || []) {
    for (const r of f.results || []) {
      const k = rosterKey(r.playerName);
      if (k) s.add(k);
    }
  }
  return s;
}

/** [inícioMs, fimMs] do evento, ou null sem data válida. */
function dateRange(t) {
  const a = Date.parse(String(t.startDate || t.date || "").slice(0, 10));
  if (Number.isNaN(a)) return null;
  const b = t.endDate ? Date.parse(String(t.endDate).slice(0, 10)) : a;
  return [a, Number.isNaN(b) ? a : b];
}

/**
 * Remove IN-PLACE do source `egr` os torneios já cobertos por outra fonte.
 * @param {Array<{sourceId, tournaments}>} rawSources — outputs dos adapters.
 * @returns {{dropped: Array<{egrKey, egrName, coveredBy, coveredByName, shared, ovEgr, ovMin}>}}
 */
function dedupeEgrTournaments(rawSources) {
  const egr = rawSources.find((s) => s.sourceId === "egr");
  const dropped = [];
  if (!egr || !Array.isArray(egr.tournaments) || !egr.tournaments.length) return { dropped };

  // Candidatos dedicados: só torneios com data (sem data não há como ancorar).
  const others = [];
  for (const src of rawSources) {
    if (src.sourceId === "egr") continue;
    for (const t of src.tournaments || []) {
      const r = dateRange(t);
      if (r) others.push({ sourceId: src.sourceId, t, r, roster: null });
    }
  }
  if (!others.length) return { dropped };

  const slack = DATE_SLACK_DAYS * DAY_MS;
  const keep = [];
  for (const e of egr.tournaments) {
    const er = dateRange(e);
    const es = er ? rosterOf(e) : null;
    let hit = null;
    if (er && es && es.size >= 5) {
      for (const o of others) {
        if (o.r[0] > er[1] + slack || o.r[1] < er[0] - slack) continue;
        if (!o.roster) o.roster = rosterOf(o.t);
        if (o.roster.size < 5) continue;
        let shared = 0;
        for (const k of es) if (o.roster.has(k)) shared++;
        if (shared < 5) continue;
        const ovEgr = shared / es.size;
        const ovMin = shared / Math.min(es.size, o.roster.size);
        if (ovEgr >= 0.7 || (ovMin >= 0.85 && shared >= 15)) {
          hit = { egrKey: e.sourceKey, egrName: e.name, coveredBy: o.sourceId, coveredByName: o.t.name, shared, ovEgr: +ovEgr.toFixed(2), ovMin: +ovMin.toFixed(2) };
          break;
        }
      }
    }
    if (hit) dropped.push(hit); else keep.push(e);
  }
  egr.tournaments = keep;
  return { dropped };
}

module.exports = { dedupeEgrTournaments, rosterKey, rosterOf, dateRange };
