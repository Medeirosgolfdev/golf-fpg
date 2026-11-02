/**
 * scripts/aggregator/util/fundir-torneios.js — a mesma prova publicada duas
 * (ou mais) vezes passa a ser UMA, com toda a informação das cópias. 01/11/2026.
 *
 * Corre no index.js depois do identity-matcher (os jogadores já têm juniorId,
 * que é a evidência mais forte de «o mesmo miúdo»). Casos reais:
 *   - EGR com dois ids para o mesmo evento («R&A Junior Open Championship
 *     2022» = «Junior Open 2022»; Finnish Junior Tour 7 publicado 3×);
 *   - fonte dedicada + federação (Evian Juniors Cup no evianjc e na FFG);
 *   - FFG com a mesma volta em duas competições (Grand Prix Jeunes geral e
 *     «U16 et U14»);
 *   - classificação transversal (WJGC/EOWAGR: «Boys WAGR» por cima dos
 *     escalões — os mesmos cartões em duas listas).
 *
 * Duas provas são a mesma quando, em datas a ≤ 3 dias, partilham ≥ 3
 * jogadores com as MESMAS pancadas (total e voltas comuns) em ≥ 90 % dos que
 * se podem comparar. Voltas diferentes no mesmo dia (9 buracos de manhã e de
 * tarde) têm pancadas diferentes e não se tocam.
 *
 * Fundir: fica a cópia principal (fonte dedicada > federação > EGR/WAGR; em
 * empate a que tem mais cartões buraco-a-buraco) e cada campo que lhe falta
 * — posição, total, ±par, voltas, buracos, par/metros do flight, campo,
 * datas, ligações — vem das outras. Jogadores que só estão numa cópia passam
 * para a principal, no flight onde estão os seus colegas de flight.
 * Numa classificação transversal (liga-se a provas que não se ligam entre si)
 * só saem as linhas repetidas, enriquecendo a do escalão; quem só está lá fica.
 */

const { rosterKey } = require("./egr-dedup");
const { juntarFichas } = require("./juntar-fichas");

const DAY_MS = 86400000;
const DATE_SLACK_DAYS = 3;
const MIN_IGUAIS = 3;
const MIN_ACORDO = 0.9;

/** Meta-agregadores (só totais) perdem sempre; fontes de um só evento ganham. */
const PRIORIDADE_BAIXA = new Set(["egr", "wagr"]);
const DEDICADAS = new Set([
  "evianjc", "wjgc", "eowagr", "doral", "eatc", "eatc2", "ebtc2", "egtc", "ejo", "eym",
  "uaworlds", "uajt", "avtrophy", "coc", "reidtrophy", "optimist", "icopa", "fm",
  "faldomadeira", "mexnacional", "interzonas", "elg", "ejt", "job",
]);

const vazio = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
const grossOk = (g) => typeof g === "number" && g > 0 && g < 900;

function intervalo(t) {
  const a = Date.parse(String(t.startDate || t.date || "").slice(0, 10));
  if (Number.isNaN(a)) return null;
  const b = Date.parse(String(t.endDate || "").slice(0, 10));
  return [a, Number.isNaN(b) || b < a ? a : b];
}

/** true/false quando há pancadas para comparar; null quando não há. */
function mesmasPancadas(a, b) {
  let comparou = false;
  // com nº de voltas diferente (uma cópia sem a volta parcial de quem
  // desistiu) os totais não se comparam — só as voltas comuns
  const nv = (x) => (x.rounds || []).filter((r) => grossOk(r.gross)).length;
  const na = nv(a), nb = nv(b);
  if (grossOk(a.totalGross) && grossOk(b.totalGross) && !(na && nb && na !== nb)) {
    if (a.totalGross !== b.totalGross) return false;
    comparou = true;
  }
  const rb = new Map((b.rounds || []).filter((r) => grossOk(r.gross)).map((r) => [r.round, r.gross]));
  for (const r of a.rounds || []) {
    if (!grossOk(r.gross) || !rb.has(r.round)) continue;
    if (rb.get(r.round) !== r.gross) return false;
    comparou = true;
  }
  return comparou ? true : null;
}

function riqueza(t) {
  let buracos = 0, voltas = 0, linhas = 0, maxVoltas = 0;
  for (const f of t.flights || []) for (const r of f.results || []) {
    linhas++;
    if ((r.rounds || []).some((x) => Array.isArray(x.strokes) && x.strokes.some((s) => s > 0))) buracos++;
    const nv = (r.rounds || []).filter((x) => grossOk(x.gross)).length;
    if (nv) voltas++;
    if (nv > maxVoltas) maxVoltas = nv;
  }
  // dentro da mesma fonte, a classificação «Boys WAGR» perde para o escalão
  const transversal = ehTransversal(t) ? 0 : 5e8;
  // a cópia com mais voltas é a classificação final (golfdirecto: «Ronda 3»
  // com as 3 voltas e «Ronda 1» publicada à parte) — as posições vêm dela
  return prioridade(t) * 1e9 + transversal + Math.min(maxVoltas, 4) * 1e8 + Math.min(buracos, 999) * 1e5 + Math.min(voltas, 999) * 1e2 + Math.min(linhas, 99);
}

const ehTransversal = (t) => /\bWAGR$/i.test(String(t.name || "").trim());
const prioridade = (t) => (PRIORIDADE_BAIXA.has(t.sourceId) ? 0 : DEDICADAS.has(t.sourceId) ? 2 : 1);

/** Preenche em `p` o que lhe falta com o que `s` tem. A posição só vem de `s`
 *  quando `p` não tem nenhuma (é a mesma classificação ou nada). */
function fundirLinha(p, s) {
  for (const [k, v] of Object.entries(s)) {
    if (k === "juniorId" || k === "rounds" || k === "extra") continue;
    if (vazio(p[k]) && !vazio(v)) p[k] = v;
  }
  if (s.extra && typeof s.extra === "object") p.extra = { ...s.extra, ...(p.extra || {}) };
  if (Array.isArray(s.rounds) && s.rounds.length) {
    if (!Array.isArray(p.rounds)) p.rounds = [];
    for (const rs of s.rounds) {
      const rp = p.rounds.find((x) => x.round === rs.round);
      if (!rp) { p.rounds.push({ ...rs }); continue; }
      if (!grossOk(rp.gross) && grossOk(rs.gross)) rp.gross = rs.gross;
      const nz = (a) => (Array.isArray(a) ? a.filter((x) => x > 0).length : 0);
      if (nz(rs.strokes) > nz(rp.strokes)) rp.strokes = rs.strokes;
      for (const [k, v] of Object.entries(rs)) if (vazio(rp[k]) && !vazio(v)) rp[k] = v;
    }
    p.rounds.sort((a, b) => a.round - b.round);
  }
}

function fundirFlight(fp, fs) {
  for (const k of ["par", "yards", "ageMin", "ageMax", "sex"]) if (vazio(fp[k]) && !vazio(fs[k])) fp[k] = fs[k];
}

function fundirCabecalho(p, s) {
  for (const k of ["course", "parTotal", "holesPerRound", "rounds", "startDate", "endDate", "shortName"]) {
    if (vazio(p[k]) && !vazio(s[k])) p[k] = s[k];
  }
  const urls = new Set((p.links || []).map((l) => l.url));
  for (const l of s.links || []) if (l && l.url && !urls.has(l.url)) { (p.links = p.links || []).push(l); urls.add(l.url); }
  p.extra = p.extra || {};
  const ja = p.extra.fundidoCom || [];
  p.extra.fundidoCom = [...ja, { id: s.id, sourceId: s.sourceId, name: s.name }, ...((s.extra && s.extra.fundidoCom) || [])];
}

/**
 * Altera `matchResult` no sítio (tournaments, juniors[].tournamentIds).
 * @returns {{inteiras:number, transversais:number, linhasFundidas:number, linhasMovidas:number, homonimos:number, amostra:string[]}}
 */
function fundirTorneiosRepetidos(matchResult) {
  const stats = { inteiras: 0, transversais: 0, linhasFundidas: 0, linhasMovidas: 0, homonimos: 0, amostra: [], fichasDuplas: [] };
  const ts = matchResult.tournaments;
  const byId = new Map(ts.map((t) => [t.id, t]));
  const juniorById = new Map(matchResult.juniors.map((j) => [j.id, j]));
  const datas = new Map();
  const linhas = new Map();   // tid → Map(juniorId → {f, r})
  for (const t of ts) {
    const iv = intervalo(t);
    if (!iv) continue;
    datas.set(t.id, iv);
    const m = new Map();
    for (const f of t.flights || []) for (const r of f.results || []) if (r.juniorId && !m.has(r.juniorId)) m.set(r.juniorId, { f, r });
    linhas.set(t.id, m);
  }

  // 1. Pares: provas com os mesmos jogadores e as mesmas pancadas.
  const slack = DATE_SLACK_DAYS * DAY_MS;
  const vizinhos = new Map();
  const liga = (a, b) => {
    if (!vizinhos.has(a)) vizinhos.set(a, new Set());
    if (!vizinhos.has(b)) vizinhos.set(b, new Set());
    vizinhos.get(a).add(b); vizinhos.get(b).add(a);
  };
  for (const [tid, m] of linhas) {
    const [a0, a1] = datas.get(tid);
    const candidatos = new Set();
    for (const jid of m.keys()) {
      const j = juniorById.get(jid);
      for (const o of (j && j.tournamentIds) || []) {
        if (o <= tid || !linhas.has(o)) continue;
        const [b0, b1] = datas.get(o);
        if (b0 > a1 + slack || b1 < a0 - slack) continue;
        candidatos.add(o);
      }
    }
    for (const o of candidatos) {
      const mo = linhas.get(o);
      let iguais = 0, comparaveis = 0;
      for (const [jid, { r }] of m) {
        const x = mo.get(jid);
        if (!x) continue;
        const v = mesmasPancadas(r, x.r);
        if (v == null) continue;
        comparaveis++;
        if (v) iguais++;
      }
      // a classificação «WAGR» da mesma fonte basta-lhe 1 cartão igual (há
      // escalões com 2 ou 3 jogadores nela)
      const transv = byId.get(tid).sourceId === byId.get(o).sourceId && (ehTransversal(byId.get(tid)) || ehTransversal(byId.get(o)));
      if (iguais >= (transv ? 1 : MIN_IGUAIS) && iguais / comparaveis >= MIN_ACORDO) liga(tid, o);
    }
  }

  // 2. Componentes. Clique = a mesma prova publicada várias vezes; senão, as
  //    provas que ligam a duas que não se ligam entre si são transversais.
  const visto = new Set();
  const componentes = [];
  for (const tid of vizinhos.keys()) {
    if (visto.has(tid)) continue;
    const comp = [];
    const pilha = [tid];
    visto.add(tid);
    while (pilha.length) {
      const x = pilha.pop();
      comp.push(x);
      for (const y of vizinhos.get(x)) if (!visto.has(y)) { visto.add(y); pilha.push(y); }
    }
    componentes.push(comp);
  }

  const removidas = new Set();
  const tirarDoJunior = (jid, tid) => {
    const j = juniorById.get(jid);
    if (j) j.tournamentIds = j.tournamentIds.filter((x) => x !== tid);
  };
  const porNome = (t) => {
    const m = new Map();
    for (const f of t.flights) for (const r of f.results) {
      const k = rosterKey(r.playerNameInSource);
      if (k && !m.has(k)) m.set(k, r);
    }
    return m;
  };

  /** Funde a prova `s` inteira em `p`. */
  function fundirInteira(p, s) {
    const lp = linhas.get(p.id);
    const nomesP = porNome(p);
    for (const fs of s.flights || []) {
      // flight de destino: onde estão (em p) os colegas deste flight. Se estão
      // espalhados por vários (o «Geral» do EGR sobre U14 e U18), quem só está
      // nesta cópia fica num flight à parte — o escalão dele não se sabe.
      const destinos = new Set();
      for (const r of fs.results) { const x = lp.get(r.juniorId); if (x) destinos.add(x.f); }
      let fp = destinos.size === 1 ? [...destinos][0]
        : destinos.size ? null : p.flights.find((f) => f.label === fs.label) || null;
      // sexo do flight à parte: o das fichas, quando são todas do mesmo
      const sexos = new Set(fs.results.map((r) => (juniorById.get(r.juniorId) || {}).sex || null));
      const sexo = fs.sex || (sexos.size === 1 ? [...sexos][0] : null);
      const novoLabel = destinos.size > 1
        ? `${fs.label}${sexo === "F" ? " Raparigas" : sexo === "M" ? " Rapazes" : ""} (${String(s.sourceId || "").toUpperCase()})`
        : fs.label;
      if (fp) fundirFlight(fp, fs);
      for (const r of fs.results) {
        const x = lp.get(r.juniorId);
        // a mesma pessoa com duas fichas: mesmo nome E as mesmas pancadas
        const h = !x && nomesP.get(rosterKey(r.playerNameInSource));
        const homonimo = h && mesmasPancadas(h, r) !== false ? h : null;
        if (x || homonimo) {
          fundirLinha(x ? x.r : homonimo, r);
          stats.linhasFundidas++;
          if (homonimo) {
            stats.homonimos++;
            // mesmas pancadas (não só «sem pancadas para comparar»): a mesma pessoa
            if (mesmasPancadas(homonimo, r) === true && homonimo.juniorId !== r.juniorId) stats.fichasDuplas.push([homonimo.juniorId, r.juniorId]);
            if (stats.amostra.length < 60) stats.amostra.push(`por nome: ${r.playerNameInSource} ${r.juniorId} = ${homonimo.juniorId} (${s.id} → ${p.id})`);
          }
          continue;
        }
        if (!fp) {
          fp = { ...fs, flightKey: `${s.id}:${fs.flightKey}`, label: novoLabel, sex: fs.sex || (destinos.size > 1 ? sexo : null), results: [] };
          p.flights.push(fp);
        }
        const nova = { ...r };
        fp.results.push(nova);
        lp.set(r.juniorId, { f: fp, r: nova });
        stats.linhasMovidas++;
        const j = juniorById.get(r.juniorId);
        if (j) j.tournamentIds = [...j.tournamentIds.filter((t) => t !== s.id), ...(j.tournamentIds.includes(p.id) ? [] : [p.id])];
      }
      if (fp && typeof fp.fieldSize === "number" && fp.fieldSize < fp.results.length) fp.fieldSize = fp.results.length;
    }
    for (const jid of linhas.get(s.id).keys()) tirarDoJunior(jid, s.id);
    fundirCabecalho(p, s);
    removidas.add(s.id);
    stats.inteiras++;
    if (stats.amostra.length < 40) stats.amostra.push(`${s.id} «${s.name}» → ${p.id} «${p.name}»`);
  }

  /** Tira da transversal `h` as linhas que já estão em `x`, enriquecendo-as. */
  function tirarTransversal(h, x) {
    const lx = linhas.get(x.id);
    let n = 0;
    for (const f of h.flights) {
      f.results = f.results.filter((r) => {
        const y = lx.get(r.juniorId);
        if (!y || mesmasPancadas(y.r, r) === false) return true;
        fundirLinha(y.r, r);
        tirarDoJunior(r.juniorId, h.id);
        n++;
        return false;
      });
    }
    h.flights = h.flights.filter((f) => f.results.length);
    stats.linhasFundidas += n;
    if (n && stats.amostra.length < 40) stats.amostra.push(`${h.id} «${h.name}» −${n} linhas → ${x.id}`);
    if (!h.flights.length) removidas.add(h.id);
  }

  for (const comp of componentes) {
    const clique = comp.every((a) => comp.every((b) => a === b || vizinhos.get(a).has(b)));
    if (clique) {
      const ordem = comp.map((id) => byId.get(id)).sort((a, b) => riqueza(b) - riqueza(a) || (a.id < b.id ? -1 : 1));
      const [p, ...resto] = ordem;
      for (const s of resto) {
        if (ehTransversal(s) && s.sourceId === p.sourceId) { tirarTransversal(s, p); stats.transversais++; }
        else fundirInteira(p, s);
      }
      continue;
    }
    const transversais = comp.filter((a) => {
      const v = [...vizinhos.get(a)];
      return v.some((b, i) => v.slice(i + 1).some((c) => !vizinhos.get(b).has(c)));
    });
    const hubs = new Set(transversais);
    for (const h of transversais) {
      const ht = byId.get(h);
      const alvos = [...vizinhos.get(h)].filter((x) => !hubs.has(x)).map((id) => byId.get(id))
        .sort((a, b) => riqueza(b) - riqueza(a));
      // fonte rica que o EGR/WAGR parte por escalão (Estonian Junior Open, GJGL):
      // não é transversal — as cópias por escalão é que se fundem nela
      if (alvos.every((x) => prioridade(x) < prioridade(ht))) {
        for (const x of alvos) fundirInteira(ht, x);
        continue;
      }
      for (const x of alvos) if (!removidas.has(h)) tirarTransversal(ht, x);
      stats.transversais++;
    }
    // o que sobra ligado sem transversais: pares soltos fundem-se inteiros
    for (const a of comp) {
      if (hubs.has(a) || removidas.has(a)) continue;
      for (const b of vizinhos.get(a)) {
        if (hubs.has(b) || removidas.has(b) || b <= a) continue;
        const [p, s] = [byId.get(a), byId.get(b)].sort((x, y) => riqueza(y) - riqueza(x));
        if (removidas.has(p.id) || removidas.has(s.id)) continue;
        if (ehTransversal(s) && s.sourceId === p.sourceId) tirarTransversal(s, p);
        else fundirInteira(p, s);
      }
    }
  }

  if (removidas.size) matchResult.tournaments = ts.filter((t) => !removidas.has(t.id));
  // a outra ficha da mesma pessoa junta-se antes de sair por ficar sem provas
  // (as chaves e o que só ela tinha passam para a que fica)
  stats.fichas = juntarFichas(matchResult, stats.fichasDuplas);
  // quem ficou sem provas sai, como no matcher
  matchResult.juniors = matchResult.juniors.filter((j) => j.tournamentIds.length > 0);
  stats.removidas = removidas.size;
  return stats;
}

module.exports = { fundirTorneiosRepetidos, mesmasPancadas, fundirLinha };
