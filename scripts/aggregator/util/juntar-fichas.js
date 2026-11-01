/**
 * scripts/aggregator/util/juntar-fichas.js
 *
 * A mesma pessoa com duas fichas no canónico, quando há PROVA disso (01/11/2026):
 *
 *  - o mesmo nome com as MESMAS pancadas na mesma prova publicada duas vezes
 *    (o `fundir-torneios` encontra-os: Francisca Costa da FPG = a licença
 *    «E…» que a FFG lhe deu na Evian 2024);
 *  - uma licença «E…» da FFG (a FFG dá uma nova ao estrangeiro em cada prova)
 *    com o mesmo nome e a mesma data de nascimento de UMA outra ficha.
 *
 * O matcher não as junta porque são duas chaves fortes da mesma fonte (duas
 * licenças FFG ou RFEG) ou porque «jogaram juntas» na prova repetida. Aqui a
 * ficha com mais provas fica; a outra passa-lhe as provas, as chaves (a licença
 * vai para o histórico da fonte) e tudo o que ela não tinha.
 */

const { normName } = require("./names");

const vazio = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

// onde cada fonte forte guarda as chaves antigas (o mesmo que o
// manualHistoricalIds do identity-matcher)
const HISTORICO = {
  rfeg: ["historicalLicenses", "lic"],
  ffgolf: ["historicalLicenses", "lic"],
  fpg: ["historicalFeds", "fed"],
  uskids: ["historicalMemberIds", "memberId"],
};

function juntarSources(p, s) {
  p.sources = p.sources || {};
  for (const [k, v] of Object.entries(s.sources || {})) {
    if (k === "_secondary") {
      const ja = new Set((p.sources._secondary || []).map((x) => `${x.sourceId}|${x.key}`));
      for (const x of v || []) if (!ja.has(`${x.sourceId}|${x.key}`)) (p.sources._secondary = p.sources._secondary || []).push(x);
      continue;
    }
    const atual = p.sources[k];
    if (!atual) { p.sources[k] = v; continue; }
    const [campo, id] = HISTORICO[k] || [];
    if (campo && v && v[id] && v[id] !== atual[id]) {
      const lista = (atual[campo] = atual[campo] || []);
      const tem = (x) => (typeof x === "string" ? x : x[id]) === v[id];
      if (!lista.some(tem)) lista.push({ [id]: v[id], ...(v.club ? { club: v.club } : {}), note: "ficha dupla junta pela prova (agregador)" });
      for (const h of v[campo] || []) if (!lista.some((x) => (typeof x === "string" ? x : x[id]) === (typeof h === "string" ? h : h[id]))) lista.push(h);
    }
    if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) if (vazio(atual[kk]) && !vazio(vv)) atual[kk] = vv;
  }
}

/**
 * Junta as fichas de cada par [a, b] (ids de juniores). Altera `matchResult`
 * no sítio: as linhas das provas passam a apontar para a ficha que fica e a
 * outra sai de `juniors`.
 * @returns {{juntas:number, amostra:string[]}}
 */
function juntarFichas(matchResult, pares) {
  const stats = { juntas: 0, amostra: [] };
  if (!pares || !pares.length) return stats;
  const byId = new Map(matchResult.juniors.map((j) => [j.id, j]));
  const pai = new Map();
  const raiz = (x) => { while (pai.has(x) && pai.get(x) !== x) x = pai.get(x); return x; };
  for (const [a, b] of pares) {
    if (!byId.has(a) || !byId.has(b) || a === b) continue;
    const ra = raiz(a), rb = raiz(b);
    if (ra === rb) continue;
    const [p, s] = [byId.get(ra), byId.get(rb)].sort((x, y) => (y.tournamentIds.length - x.tournamentIds.length) || (x.id < y.id ? -1 : 1));
    pai.set(s.id, p.id); pai.set(p.id, p.id);
  }
  const sai = new Map();   // id que sai → id que fica
  for (const id of pai.keys()) { const r = raiz(id); if (r !== id) sai.set(id, r); }
  if (!sai.size) return stats;

  const tById = new Map(matchResult.tournaments.map((t) => [t.id, t]));
  for (const [sid, pid] of sai) {
    const s = byId.get(sid), p = byId.get(pid);
    for (const tid of s.tournamentIds) {
      const t = tById.get(tid);
      if (t) for (const f of t.flights || []) {
        // a ficha que fica já está nesta prova: a linha repetida sai
        const ja = f.results.some((r) => r.juniorId === pid);
        f.results = f.results.filter((r) => !(ja && r.juniorId === sid));
        for (const r of f.results) if (r.juniorId === sid) r.juniorId = pid;
      }
      if (!p.tournamentIds.includes(tid)) p.tournamentIds.push(tid);
    }
    for (const k of ["dob", "sex", "nationality", "country", "region", "club"]) if (vazio(p[k]) && !vazio(s[k])) p[k] = s[k];
    const nomes = new Set([p.canonicalName, ...(p.aliases || [])]);
    p.aliases = p.aliases || [];
    for (const n of [s.canonicalName, ...(s.aliases || [])]) if (n && !nomes.has(n)) { p.aliases.push(n); nomes.add(n); }
    juntarSources(p, s);
    if (s._match) {
      p._match = p._match || {};
      p._match.evidence = [...new Set([...(p._match.evidence || []), ...(s._match.evidence || [])])];
      p._match.mergedFromSources = [...new Set([...(p._match.mergedFromSources || []), ...(s._match.mergedFromSources || [])])];
    }
    (p._match = p._match || {}).fichasJuntas = [...(p._match.fichasJuntas || []), sid];
    for (const [k, v] of Object.entries(s)) if (!(k in p) && !vazio(v)) p[k] = v;
    stats.juntas++;
    if (stats.amostra.length < 60) stats.amostra.push(`${s.canonicalName} ${sid} → ${pid}`);
  }
  matchResult.juniors = matchResult.juniors.filter((j) => !sai.has(j.id));
  return stats;
}

/**
 * Fichas só com uma licença «E…» da FFG que têm o mesmo nome e a mesma data de
 * nascimento de exactamente UMA outra ficha.
 * @returns {Array<[string, string]>}
 */
function paresLicencaE(juniors) {
  const nomeDe = (j) => normName(String(j.canonicalName || "").replace(/\((?:U|Sub-?)\d{1,2}\)/gi, " "));
  const porNome = new Map();
  for (const j of juniors) {
    const k = nomeDe(j);
    if (!k) continue;
    if (!porNome.has(k)) porNome.set(k, []);
    porNome.get(k).push(j);
  }
  const soLicencaE = (j) => {
    const fortes = Object.keys(j.sources || {}).filter((k) => k !== "_secondary");
    return fortes.length === 1 && fortes[0] === "ffgolf" && /^E\d/.test(String(j.sources.ffgolf.lic || ""));
  };
  const pares = [];
  for (const j of juniors) {
    if (!j.dob || !soLicencaE(j)) continue;
    const outros = (porNome.get(nomeDe(j)) || []).filter((o) => o.id !== j.id && o.dob === j.dob);
    // uma só ficha «a sério» com esse nome e nascimento; as outras licenças E
    // do mesmo estrangeiro (Louis Dirickx tem três) vão todas com ela
    const serias = outros.filter((o) => !soLicencaE(o));
    if (serias.length === 1) pares.push([serias[0].id, j.id]);
    else if (!serias.length) for (const o of outros) pares.push([o.id, j.id]);
  }
  return pares;
}

module.exports = { juntarFichas, paresLicencaE };
