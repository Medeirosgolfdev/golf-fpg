/**
 * scripts/aggregator/util/scout.js
 *
 * Resumo do Scout de cada junior, para a aba «Scout» dos circuitos (CircuitShell
 * e /uskids) — 20/10/2026. A página não pode carregar o juniors.json + shards
 * (~180 MB), por isso o agregador escreve aqui o que o Scout mostra, com as
 * MESMAS contas do kids2 (src/pages/kids2/juniorCalc.ts, carregado pelo Node —
 * nada copiado): nível (tier), vitórias, top-3, HCP, data de nascimento, clube,
 * país e as provas em comum com o Manuel. A forma recente continua no
 * juniors-form.json (util/form.js).
 *
 * Saída (`public/data/juniors-scout.json`, compacta):
 *   { schemaVersion, generatedAt, manuelId, players: {
 *       [juniorId]: { n: torneios na carreira, t?: tier, w?: vitórias, t3?: top-3, h?: HCP, d?: "AAAA-MM-DD",
 *                     c?: clube, p?: país,
 *                     m?: [[data, torneio, lugar dele, lugar do Manuel, pancadas dele − Manuel], …],
 *                     mf?: confrontos no mesmo flight,
 *                     r?: ranking da coorte — RankingRow do juniorCalc: [ano de nascimento, sexo, posição],
 *                     hr?: [hcp, "AAAA-MM-DD"] — o «h» é o hándicap OFICIAL actual da RFEG, com a data,
 *                     rk?: [posição, jogadores, "ranking curto", "AAAA-MM-DD" | null] — ranking juvenil RFEG } } }
 * O hr/rk vêm de junior.rfegOficial (util/rfeg-oficial.js, 22/10/2026).
 * O `r` poupa ao browser o computeRanking sobre ~38 mil juniores (ficha do kids2
 * e /kids2/ranking; 21/10/2026).
 * Só entram juniores com alguma coisa para mostrar.
 */
const path = require("path");
const { MANUEL_ID } = require("./form");

let calc;
function loadCalc() {
  if (calc) return calc;
  try {
    calc = require(path.join(__dirname, "..", "..", "..", "src", "pages", "kids2", "juniorCalc.ts"));
  } catch (e) {
    throw new Error(`util/scout.js: não consegui carregar src/pages/kids2/juniorCalc.ts com o Node ${process.version} ` +
      `(precisa de Node ≥ 22.18, que corre TypeScript). Erro original: ${e.message}`);
  }
  return calc;
}

function buildScout(juniors, tournaments, generatedAt) {
  const { computeRanking, encodeRankingEntry, computeTier, countWins, countTop3, getSharedTournamentIds, getSharedFlightTids } = loadCalc();
  const tById = new Map(tournaments.map((t) => [t.id, t]));
  const ranking = computeRanking(juniors, tById);
  const manuel = juniors.find((j) => j.id === MANUEL_ID) || null;
  const players = {};
  for (const j of juniors) {
    if (!j.tournamentIds?.length) continue;
    // n = torneios na carreira (era a coluna «torn.» dos Rivais da /uskids, 20/10/2026).
    const o = { n: j.tournamentIds.length };
    const tier = computeTier(j, tById, ranking);
    if (tier) o.t = tier;
    const rk = ranking.get(j.id);
    if (rk) o.r = encodeRankingEntry(rk);
    const w = countWins(j, tById);
    if (w) o.w = w;
    const t3 = countTop3(j, tById);
    if (t3) o.t3 = t3;
    const src = j.sources || {};
    // HCP: o da FPG; senão o oficial actual da RFEG (com data); senão o da
    // última inscrição RFEG; senão o da FFG.
    const rfo = j.rfegOficial;
    const hOficial = src.fpg?.hcpExact == null && typeof rfo?.hcp === "number" ? rfo.hcp : null;
    const h = src.fpg?.hcpExact ?? hOficial ?? src.rfeg?.hcp ?? src.ffgolf?.hcp ?? null;
    if (typeof h === "number") o.h = h;
    if (hOficial != null) o.hr = [hOficial, rfo.hcpData || null];
    const rk = rfo?.rankings?.[0];
    if (rk && rk.pos != null) o.rk = [rk.pos, rk.n, rk.curto, rk.f || null];
    if (j.dob) o.d = j.dob;
    const club = j.club || src.fpg?.club || src.rfeg?.club || src.ffgolf?.club || null;
    if (club) o.c = club;
    const pais = j.country || j.nationality;
    if (pais) o.p = pais;
    if (manuel && j.id !== manuel.id) {
      const m = [];
      for (const tid of getSharedTournamentIds(j, manuel)) {
        const t = tById.get(tid);
        if (!t) continue;
        for (const f of t.flights) {
          const rJ = f.results.find((x) => x.juniorId === j.id);
          const rM = f.results.find((x) => x.juniorId === manuel.id);
          if (rJ?.totalGross == null || rM?.totalGross == null) continue;
          m.push([t.date || t.startDate || "", t.name || t.shortName || tid,
            typeof rJ.pos === "number" ? rJ.pos : null, typeof rM.pos === "number" ? rM.pos : null,
            rJ.totalGross - rM.totalGross]);
          break;
        }
      }
      if (m.length) {
        m.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
        o.m = m;
        const mf = getSharedFlightTids(j, manuel, tById).length;
        if (mf) o.mf = mf;
      }
    }
    if (o.t || o.w || o.m || o.h != null || o.r || o.rk) players[j.id] = o;
  }
  return { schemaVersion: 1, generatedAt, manuelId: MANUEL_ID, players };
}

module.exports = { buildScout };
