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
 *      ficha sem país não serve para o passo 2.
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
      const iso = countryToIso2(p.country);
      const n = normName(p.name);
      const toks = n.split(" ").filter(Boolean);
      const invertido = toks.length >= 2 ? [...toks.slice(1), toks[0]].join(" ") : null;

      // idade do torneio (ex.: Sub-14 → nascidos em 2012 ou depois): ficha com
      // data de nascimento fora disso não é o miúdo da lista
      const idadeOk = (j) => {
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

module.exports = { enrichWithHcpListas };
