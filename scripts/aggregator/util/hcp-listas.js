/**
 * scripts/aggregator/util/hcp-listas.js — listas de inscritos com handicap a
 * ENRIQUECER o kids2 (02/10/2026).
 *
 * Uma «Entry List» (ex.: a do Castro Marim U14 da FPG) traz, para cada miúdo,
 * o handicap à data da lista. Não é uma fonte do agregador: não tem resultados
 * nem DOB, e criar fichas a partir dela só traria homónimos. Este passo corre
 * DEPOIS do identity-matcher e só ACRESCENTA um ponto ao `hcpHistory` de quem
 * já tem ficha (padrão do wagr-enrich.js).
 *
 * Dados: public/data/hcp-listas/*.json — {id, label, data, torneio, nascidosDesde?, players:
 * [{pos, lista: "entry"|"waiting", name, country, hcp}]} (hcp «+» em negativo).
 *
 * Ligação, por jogador da lista:
 *   1. nome igual (canónico ou alias) — também invertido («Teyssier Léon»);
 *   2. sem nenhum: nome curto contido no da ficha com o mesmo 1.º e último
 *      nome («Manuel Medeiros» → «Manuel Goulartt Medeiros»);
 *   3. o país da lista tem de bater com o da ficha (GB cobre GB-ENG/SCT/…);
 *      ficha sem país não serve para o passo 2. Com `sexo` na lista (M/F), a
 *      ficha não pode ser do outro sexo; com `nascidosDesde`, nem mais velha.
 *      Linhas com `duplicadoDe` (repetidas no PDF) não entram.
 *   4. homónimos: 1.º fica o único com data de nascimento dentro do escalão
 *      da lista; 2.º o único com handicap conhecido a ≤2 do da lista.
 * Só liga quando sobra UM candidato; os outros ficam no relatório.
 */
const fs = require("fs");
const path = require("path");
const { DATA_DIR, readJsonSafe } = require("./io");
const { normName, countryToIso2 } = require("./names");

const LISTAS_DIR = path.join(DATA_DIR, "hcp-listas");

const paisOk = (iso, j, exigir) => {
  const da = [j.country, j.nationality].filter(Boolean).map((c) => String(c).toUpperCase());
  if (!da.length) return !exigir;
  if (!iso) return !exigir;
  return da.some((c) => c === iso || c.startsWith(iso + "-"));
};

/**
 * @param {{juniors: object[]}} res  resultado do matcher (é alterado se aplicar)
 * @param {{aplicar?: boolean}} opts
 */
function enrichWithHcpListas(res, { aplicar = true } = {}) {
  let ficheiros = [];
  try { ficheiros = fs.readdirSync(LISTAS_DIR).filter((f) => f.endsWith(".json")).sort(); } catch { /* sem pasta */ }
  if (!ficheiros.length) return { disponivel: false };

  const porNome = new Map(); // normName → Set(junior)
  for (const j of res.juniors) {
    for (const n of new Set([j.canonicalName, ...(j.aliases || [])].map(normName))) {
      if (!n) continue;
      if (!porNome.has(n)) porNome.set(n, new Set());
      porNome.get(n).add(j);
    }
  }
  const nomes = [...porNome.keys()];

  const relatorio = [];
  let ligados = 0;
  for (const f of ficheiros) {
    const lista = readJsonSafe(path.join(LISTAS_DIR, f), null);
    if (!lista || !Array.isArray(lista.players) || !lista.data) continue;
    for (const p of lista.players) {
      if (typeof p.hcp !== "number" || !p.name) continue;
      if (p.duplicadoDe) { relatorio.push({ lista: lista.id, name: p.name, country: p.country, hcp: p.hcp, estado: p.lista || null, duplicadoDe: p.duplicadoDe }); continue; }
      const iso = countryToIso2(p.country);
      const n = normName(p.name);
      const toks = n.split(" ").filter(Boolean);
      const invertido = toks.length >= 2 ? [...toks.slice(1), toks[0]].join(" ") : null;

      // idade do torneio (ex.: Sub-14 → nascidos em 2012 ou depois): ficha com
      // data de nascimento fora disso não é o miúdo da lista
      // …e do sexo da lista (rapazes/raparigas): ficha com o outro sexo não serve
      const idadeOk = (j) => {
        if (lista.sexo && j.sex && j.sex !== lista.sexo) return false;
        if (!lista.nascidosDesde) return true;
        const ano = Number(String(j.dob || j.birthYear || "").slice(0, 4));
        return !ano || ano >= lista.nascidosDesde;
      };
      let cands = new Set([...(porNome.get(n) || []), ...(invertido ? porNome.get(invertido) || [] : [])]);
      cands = new Set([...cands].filter((j) => paisOk(iso, j, false) && idadeOk(j)));
      let via = "nome";
      if (!cands.size && toks.length >= 2) {
        via = "nome contido";
        const set = new Set(toks);
        for (const nm of nomes) {
          const t = nm.split(" ");
          if (t.length <= toks.length || t[0] !== toks[0] || t[t.length - 1] !== toks[toks.length - 1]) continue;
          if (![...set].every((x) => t.includes(x))) continue;
          for (const j of porNome.get(nm)) if (paisOk(iso, j, true) && idadeOk(j)) cands.add(j);
        }
      }

      // Desempate entre homónimos. 1.º a IDADE (Mariana, 02/10/2026): numa lista
      // com idade (Sub-14…), fica o único com data de nascimento conhecida e
      // dentro do escalão (ex.: «Raul Pazos (jr)», n. 2013, contra um Raul Pazos
      // sem data). 2.º o handicap: o único com handicap conhecido (FPG/RFEG/FFG)
      // a menos de 2 pancadas do da lista.
      if (cands.size > 1 && lista.nascidosDesde) {
        const comIdade = [...cands].filter((j) => Number(String(j.dob || j.birthYear || "").slice(0, 4)) >= lista.nascidosDesde);
        if (comIdade.length === 1) { cands = new Set(comIdade); via += " + idade"; }
      }
      if (cands.size > 1) {
        const perto = [...cands].filter((j) => {
          const s = j.sources || {};
          const h = s.fpg?.hcpExact ?? s.rfeg?.hcp ?? s.ffgolf?.hcp;
          return typeof h === "number" && Math.abs(h - p.hcp) <= 2;
        });
        if (perto.length === 1) { cands = new Set(perto); via += " + handicap"; }
      }
      const linha = { lista: lista.id, name: p.name, country: p.country, hcp: p.hcp, estado: p.lista || null };
      if (cands.size === 1) {
        const j = [...cands][0];
        linha.junior = { id: j.id, name: j.canonicalName, via };
        if (aplicar) {
          const h = { date: lista.data, hcpExact: p.hcp, source: "entry-list", label: lista.label || lista.id };
          j.hcpHistory = Array.isArray(j.hcpHistory) ? j.hcpHistory : [];
          if (!j.hcpHistory.some((x) => x.date === h.date && x.source === h.source && x.hcpExact === h.hcpExact)) {
            j.hcpHistory.push(h);
            j.hcpHistory.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
          }
        }
        ligados++;
      } else {
        linha.semFicha = cands.size === 0;
        linha.ambiguo = cands.size > 1 ? [...cands].map((j) => `${j.canonicalName} (${j.country || "?"})`) : undefined;
      }
      relatorio.push(linha);
    }
  }
  return { disponivel: true, listas: ficheiros.length, total: relatorio.length, ligados, relatorio };
}

/**
 * Dados da página /kids2/listas: cada lista com os inscritos pela ordem do
 * PDF e, para os ligados, a ficha (id, nome, nascimento, clube, handicap
 * actual de outra fonte).
 */
/* Edição anterior do mesmo torneio (lista.edicaoAnterior: resultados finais,
 * por sexo e ordenados por pancadas) — liga-se pelo nome: o mais curto contido
 * no mais comprido, com pelo menos 2 nomes. */
const tokens = (s) => normName(s).split(" ").filter(Boolean);
function mesmoNome(a, b) {
  const x = tokens(a), y = tokens(b);
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 2 && s.every((k) => l.includes(k));
}
function anteriorDe(lista, nome) {
  const e = lista.edicaoAnterior;
  if (!e || !Array.isArray(e.players)) return null;
  const p = e.players.find((x) => mesmoNome(x.name, nome));
  return p ? { pos: p.pos, empate: !!p.empate, de: e.total, gross: p.gross, hcp: p.hcp } : null;
}

function ligacoesParaPagina(r, res) {
  const byId = new Map(res.juniors.map((j) => [j.id, j]));
  let ficheiros = [];
  try { ficheiros = fs.readdirSync(LISTAS_DIR).filter((f) => f.endsWith(".json")).sort(); } catch { /* sem pasta */ }
  const listas = [];
  for (const f of ficheiros) {
    const lista = readJsonSafe(path.join(LISTAS_DIR, f), null);
    if (!lista || !Array.isArray(lista.players)) continue;
    const linhas = r.relatorio.filter((l) => l.lista === lista.id);
    const players = lista.players.map((p, i) => {
      const l = linhas.find((x) => x.name === p.name && x.hcp === p.hcp) || {};
      const j = l.junior ? byId.get(l.junior.id) : null;
      const s = (j && j.sources) || {};
      const hcpAtual = s.fpg?.hcpExact != null ? { valor: s.fpg.hcpExact, fonte: "FPG", data: s.fpg.hcpDate || null }
        : s.rfeg?.hcp != null ? { valor: s.rfeg.hcp, fonte: "RFEG", data: s.rfeg.hcpDate || null }
          : s.ffgolf?.hcp != null ? { valor: s.ffgolf.hcp, fonte: "FFG", data: null } : null;
      return {
        ordem: i + 1, pos: p.pos, lista: p.lista || null, name: p.name, country: p.country, hcp: p.hcp,
        junior: j ? { id: j.id, name: j.canonicalName, dob: j.dob || null, club: s.fpg?.club || s.rfeg?.club || s.ffgolf?.club || j.club || null, via: l.junior.via } : null,
        ambiguo: l.ambiguo || null,
        duplicadoDe: p.duplicadoDe || null,
        // com ficha, compara-se com o nome completo da ficha: o «Afonso Pinto» de 2026
        // (Afonso de Sousa Pinto, n. 2013) não é o «Afonso Silva Pinto» de 2025 (n. 2011)
        anterior: p.duplicadoDe ? null : anteriorDe(lista, j ? j.canonicalName : p.name),
        hcpAtual,
      };
    });
    listas.push({ id: lista.id, label: lista.label || lista.id, torneio: lista.torneio || null, data: lista.data,
      sexo: lista.sexo || null, nascidosDesde: lista.nascidosDesde || null, wildcardsFpg: lista.wildcardsFpg ?? null,
      edicaoAnterior: lista.edicaoAnterior
        ? { label: lista.edicaoAnterior.label, torneio: lista.edicaoAnterior.torneio, total: lista.edicaoAnterior.total, vencedor: lista.edicaoAnterior.vencedor }
        : null,
      players, candidatosPt: candidatosWildCard(lista, players, res) });
  }
  return { listas };
}

/**
 * Portugueses que a FPG pode nomear (wild cards): federados de nacionalidade
 * portuguesa, do sexo da lista, nascidos a partir de `nascidosDesde`, activos
 * e com handicap — os 20 de handicap mais baixo, com a indicação de quem já
 * está na lista (por fed, ou pelo nome).
 */
const N_CANDIDATOS = 20;
function candidatosWildCard(lista, players, res) {
  if (!lista.wildcardsFpg || !lista.sexo) return null;
  const fed = readJsonSafe(path.join(DATA_DIR, "federados.json"), null);
  const todos = (fed && fed.players) || [];
  const fichaPorFed = new Map();
  for (const j of res.juniors) if (j.sources?.fpg?.fed) fichaPorFed.set(String(j.sources.fpg.fed), j.id);
  const naLista = new Map(); // juniorId / nome → linha da lista
  for (const p of players) {
    if (p.duplicadoDe) continue;
    if (p.junior) naLista.set("j:" + p.junior.id, p);
    naLista.set("n:" + normName(p.name), p);
  }
  return todos
    .filter((f) => f.country === "Portugal" && f.gender === lista.sexo && /ativo/i.test(f.federated_status || "")
      && typeof f.hcp_exact === "number" && Number(String(f.birthdate || "").slice(0, 4)) >= (lista.nascidosDesde || 0))
    .sort((a, b) => a.hcp_exact - b.hcp_exact || String(a.birthdate).localeCompare(String(b.birthdate)))
    .slice(0, N_CANDIDATOS)
    .map((f, i) => {
      const jid = fichaPorFed.get(String(f.federation_code)) || null;
      const linha = (jid && naLista.get("j:" + jid)) || naLista.get("n:" + normName(f.name)) || null;
      return {
        rank: i + 1, fed: String(f.federation_code), name: f.name, club: f.acronym || f.club_name || null,
        dob: f.birthdate || null, hcp: f.hcp_exact, juniorId: jid,
        inscrito: linha ? { lista: linha.lista, pos: linha.pos, hcp: linha.hcp } : null,
        anterior: anteriorDe(lista, f.name),
      };
    });
}

module.exports = { enrichWithHcpListas, ligacoesParaPagina };
