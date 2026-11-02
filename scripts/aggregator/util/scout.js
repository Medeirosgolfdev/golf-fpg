/**
 * scripts/aggregator/util/scout.js
 *
 * Resumo do Scout de cada junior, para a aba «Scout» dos circuitos (CircuitShell
 * e /uskids) — 20/10/2026. A página não pode carregar o juniors.json + shards
 * (~180 MB), por isso o agregador escreve aqui o que o Scout mostra, com as
 * MESMAS contas do kids2 (src/pages/kids2/juniorCalc.ts, carregado pelo Node —
 * nada copiado): nível (tier), vitórias, top-3, HCP, data de nascimento, clube,
 * país e as provas em comum com o Manuel. Leva também os resultados
 * WJGC/Doral/EOWAGR (`x`, 23/10/2026), para os Próximos torneios do kids2 não
 * carregarem a base inteira, e os últimos torneios (`u`, util/ultimos.js —
 * 02/11/2026: Kids 2 + as provas de clube dos cartões FPG; era a «forma» `f`).
 *
 * Saída (`public/data/juniors-scout.json`, compacta):
 *   { schemaVersion, generatedAt, manuelId, players: {
 *       [juniorId]: { n: torneios na carreira, t?: tier, w?: vitórias, t3?: top-3, h?: HCP, d?: "AAAA-MM-DD",
 *                     c?: clube, p?: país,
 *                     m?: [[data, torneio, lugar dele, lugar do Manuel, pancadas dele − Manuel, voltas, buracos], …]
 *                         — as pancadas só das voltas que OS DOIS jogaram (com cartão); `voltas` quantas
 *                         foram e `buracos` os de cada volta (02/11/2026: comparava totais de 36 contra 18
 *                         buracos e «sem cartão» 999 — dava −122 e +907),
 *                     a?: [torneios, vitórias, top-3] no último ano (365 dias até ao generatedAt),
 *                     v?: voltas de 18 buracos no último ano — [voltas, média de pancadas, melhor volta,
 *                         ±par médio, ±par da melhor] (os ±par só com o par oficial do escalão, senão null),
 *                     mf?: confrontos no mesmo flight,
 *                     r?: ranking da coorte — RankingRow do juniorCalc: [ano de nascimento, sexo, posição],
 *                     ne?: [ano, ano] — nascimento ESTIMADO pelos escalões USKids (sem `d`; util/nascimento-uskids.js),
 *                     hr?: [hcp, "AAAA-MM-DD"] — o «h» é o hándicap OFICIAL actual da RFEG, com a data,
 * *                     u?: últimos torneios — [[data, iNome, lugar | "WD" | "DQ" | "DNS" | null, field | null, voltas,
                         pancadas | null, ±par | null, buracos, SD médio | null], …] (iNome → `tn`),
 *                     x?: { [tid]: [lugar, gross, ±par, voltas[], escalão, buracos] } } },
 *     x: { [tid]: [nome, data ISO, link] },   ← os torneios WJGC/Doral/EOWAGR
    tn: [nome do torneio, …] }              ← os nomes do `u`
 * Os tids e os resultados saem de src/data/kidsTid.ts (o mesmo do browser).
 * O hr vem de junior.rfegOficial (util/rfeg-oficial.js, 22/10/2026). O ranking
 * juvenil da RFEG (`rk`) saiu do Scout a 02/11/2026: é de pontos por participar
 * no circuito da zona, mistura os 11 aos 16 anos e estava parado em Maio.
 * O `r` poupa ao browser o computeRanking sobre ~38 mil juniores (ficha do kids2
 * e /kids2/ranking; 21/10/2026).
 * Só entram juniores com alguma coisa para mostrar.
 */
const path = require("path");
const { buildUltimos } = require("./ultimos");
const { anosPelosEscaloesUskids } = require("./nascimento-uskids");

const MANUEL_ID = "u630106";
/** Par mínimo de um campo de 18 buracos «a sério» (os de par 3 têm 54). */
const PAR_MIN_18 = 60;

let calc, tidLib;
function loadTid() {
  if (!tidLib) tidLib = require(path.join(__dirname, "..", "..", "..", "src", "data", "kidsTid.ts"));
  return tidLib;
}
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

/** Os resultados WJGC/Doral/EOWAGR de cada junior (tid → resultado compacto) e
 *  a ficha de cada torneio (tid → [nome, data, link]). */
function buildExtra(tournaments) {
  const { legacyTid, toAutoResult, keepBetter, EXTRA_SOURCES } = loadTid();
  const meta = {};
  const byJunior = new Map();
  for (const t of tournaments) {
    if (!EXTRA_SOURCES.includes(t.sourceId)) continue;
    for (const f of t.flights || []) {
      const tid = legacyTid(t, f);
      if (!tid) continue;
      if (!meta[tid]) meta[tid] = [t.name || tid, t.date || "", t.links && t.links[0] ? t.links[0].url : null];
      for (const r of f.results || []) {
        if (!r.juniorId) continue;
        let m = byJunior.get(r.juniorId);
        if (!m) byJunior.set(r.juniorId, (m = {}));
        m[tid] = keepBetter(m[tid], toAutoResult(r, f, t));
      }
    }
  }
  const players = new Map();
  for (const [id, m] of byJunior) {
    const o = {};
    for (const [tid, a] of Object.entries(m)) o[tid] = [a.p, a.t, a.tp, a.rd, a.ageGroup, a.nholes];
    players.set(id, o);
  }
  return { meta, players };
}

/** As voltas que os dois jogaram (com cartão), pela ordem: a diferença de
 *  pancadas dele − Manuel e quantas voltas. Sem voltas, compara os totais só
 *  quando os dois têm cartão. Nada em comum → null. */
function voltasEmComum(rJ, rM) {
  const ok = (g) => typeof g === "number" && g > 0 && g < 900;
  const vJ = rJ.rounds || [], vM = rM.rounds || [];
  let diff = 0, n = 0;
  for (let i = 0; i < Math.min(vJ.length, vM.length); i++) {
    if (ok(vJ[i]?.gross) && ok(vM[i]?.gross)) { diff += vJ[i].gross - vM[i].gross; n++; }
  }
  if (n) return { diff, n };
  if (!vJ.length && !vM.length && ok(rJ.totalGross) && ok(rM.totalGross)) return { diff: rJ.totalGross - rM.totalGross, n: 1 };
  return null;
}

/** As voltas de 18 buracos do último ano: quantas, média, melhor e os ±par
 *  (só quando o escalão tem o par oficial dos 18 buracos — nunca inventado). */
function voltasDoAno(j, tById, desde, voltasFpg = []) {
  const ok = (g) => typeof g === "number" && g > 0 && g < 900;
  const voltas = [...voltasFpg];
  for (const tid of j.tournamentIds) {
    const t = tById.get(tid);
    if (!t || (t.date || t.startDate || "") < desde || (t.holesPerRound || 18) !== 18) continue;
    for (const f of t.flights || []) {
      const r = f.results.find((x) => x.juniorId === j.id);
      if (!r) continue;
      const par = Array.isArray(f.par) && f.par.length === 18 && f.par.every((x) => typeof x === "number") ? f.par.reduce((s, x) => s + x, 0) : null;
      // Só voltas de 18 buracos num campo a sério: com cartão, 18 buracos jogados
      // quando há os buracos (havia voltas de 9 com 36 dentro de provas «de 18» —
      // «melhor 36, −36») e nada de campos de par 3 (par 54 — «melhor 50, −4»):
      // par ≥ 60 quando se sabe, senão ≥ 60 pancadas. E nunca menos de 50 nem mais
      // de 10 abaixo do par (cartões com só parte dos buracos — «melhor 18, −53»).
      if (par != null && par < PAR_MIN_18) break;
      for (const rd of r.rounds || []) {
        const nb = (rd.strokes || []).filter((x) => x > 0).length;
        if (ok(rd.gross) && rd.gross >= 50 && (par != null ? rd.gross >= par - 10 : rd.gross >= PAR_MIN_18) && (!nb || nb === 18)) voltas.push([rd.gross, par == null ? null : rd.gross - par]);
      }
      break;
    }
  }
  if (!voltas.length) return null;
  const media = (xs) => Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10;
  const tps = voltas.filter((x) => x[1] != null).map((x) => x[1]);
  // A melhor é a de melhor ±par quando todas têm par (72 num par 72 é melhor do
  // que 72 num par 70 — dava «72 (+2)» ao Manuel, que fez E duas vezes); sem
  // par em todas, a de menos pancadas.
  const comPar = tps.length === voltas.length;
  const melhor = voltas.reduce((b, x) => (comPar ? x[1] < b[1] || (x[1] === b[1] && x[0] < b[0]) : x[0] < b[0]) ? x : b);
  return [voltas.length, media(voltas.map((x) => x[0])), melhor[0], comPar ? media(tps) : null, comPar ? melhor[1] : null];
}

function buildScout(juniors, tournaments, generatedAt) {
  const { computeRanking, encodeRankingEntry, computeTier, countWins, countTop3, getSharedTournamentIds, getSharedFlightTids } = loadCalc();
  const tById = new Map(tournaments.map((t) => [t.id, t]));
  const extra = buildExtra(tournaments);
  const ultimos = buildUltimos(juniors, tournaments, generatedAt);
  const ranking = computeRanking(juniors, tById);
  const manuel = juniors.find((j) => j.id === MANUEL_ID) || null;
  const desdeAno = new Date(new Date(generatedAt || Date.now()).getTime() - 365 * 864e5).toISOString().slice(0, 10);
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
    // Último ano: torneios, vitórias e top-3 dos últimos 365 dias.
    // Mais as provas de clube dos cartões FPG que o Kids 2 não tem.
    const ul = ultimos.porJunior.get(j.id);
    const nAno = j.tournamentIds.filter((tid) => (tById.get(tid)?.date || tById.get(tid)?.startDate || "") >= desdeAno).length + (ul?.extraAno || 0);
    if (nAno) o.a = [nAno, countWins(j, tById, desdeAno), countTop3(j, tById, desdeAno)];
    const v = voltasDoAno(j, tById, desdeAno, ul?.voltasAno);
    if (v) o.v = v;
    const src = j.sources || {};
    // HCP: o da FPG; senão o oficial actual da RFEG (com data); senão o da
    // última inscrição RFEG; senão o da FFG.
    const rfo = j.rfegOficial;
    const hOficial = src.fpg?.hcpExact == null && typeof rfo?.hcp === "number" ? rfo.hcp : null;
    const h = src.fpg?.hcpExact ?? hOficial ?? src.rfeg?.hcp ?? src.ffgolf?.hcp ?? null;
    if (typeof h === "number") o.h = h;
    if (hOficial != null) o.hr = [hOficial, rfo.hcpData || null];
    if (j.dob) o.d = j.dob;
    else {
      const ne = anosPelosEscaloesUskids(j, tById);
      if (ne) o.ne = ne;
    }
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
          if (!rJ || !rM) continue;
          const d = voltasEmComum(rJ, rM);
          if (!d) break;
          m.push([t.date || t.startDate || "", t.name || t.shortName || tid,
            typeof rJ.pos === "number" ? rJ.pos : null, typeof rM.pos === "number" ? rM.pos : null,
            d.diff, d.n, t.holesPerRound || 18]);
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
    if (ul) o.u = ul.u;
    const x = extra.players.get(j.id);
    if (x) o.x = x;
    if (o.t || o.w || o.m || o.a || o.v || o.h != null || o.r || o.u || o.x || o.d || o.p) players[j.id] = o;
  }
  return { schemaVersion: 3, generatedAt, manuelId: MANUEL_ID, keep: ultimos.keep, x: extra.meta, tn: ultimos.nomes, players };
}

module.exports = { buildScout };
