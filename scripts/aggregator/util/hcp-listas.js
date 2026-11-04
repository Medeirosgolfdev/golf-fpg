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
 * Dados: public/data/hcp-listas/*.json — {id, label, data, torneio, nascidosDesde?, fonteCurta?
 * (nome na pill da ficha em vez de «Entry List»), soNomeExacto?, players:
 * [{pos, lista: "entry"|"waiting", name, country, hcp}]} (hcp «+» em negativo).
 *
 * Ligação, por jogador da lista:
 *   1. nome igual (canónico ou alias) — também invertido («Teyssier Léon»);
 *   2. sem nenhum: nome curto contido no da ficha com o mesmo 1.º e último
 *      nome («Manuel Medeiros» → «Manuel Goulartt Medeiros»);
 *   3. o país da lista tem de bater com o da ficha (GB cobre GB-ENG/SCT/…);
 *      ficha sem país não serve para o passo 2 (nem há passo 2 em listas com
 *      `soNomeExacto`). Com `sexo` na lista (M/F), a
 *      ficha não pode ser do outro sexo; com `nascidosDesde`, nem mais velha.
 *      Linhas com `duplicadoDe` (repetidas no PDF) não entram.
 *   4. homónimos: 1.º fica o único com data de nascimento dentro do escalão
 *      da lista; 2.º o único com handicap conhecido a ≤2 do da lista.
 * Só liga quando sobra UM candidato; os outros ficam no relatório.
 *
 * O NÚMERO manda sobre o nome (Mariana, 03/11/2026: «nos torneios há sempre o
 * draw e os outros tabs… tens o número também de federado dele»): a licença FFG
 * da lista (`licFFG`) e o federado que a própria prova dá ao inscrito
 * (`lista.prova` = {ccode, tcode} → inscrições/draw, `util/feds-das-provas.js`).
 * Só pelo nome, a ligação é verificada (`verificar`): não se faz se houver um
 * homónimo compatível na federação inteira (PT/ES/FR), outra licença FFG ou um
 * handicap recente a mais de 5; é «confirmada» se o nome for único na
 * federação, o clube bater, o handicap recente estiver a ≤ 3 ou o ano de
 * nascimento conhecido couber no escalão; senão fica «por confirmar» — aparece
 * na página mas NÃO escreve na ficha. A mesma ficha para duas pessoas da lista
 * (handicaps a mais de 3) não fica ligada a nenhuma.
 *
 * `ficha` numa linha (id da ficha, ex. "g531001335") liga-a à mão e salta os
 * passos acima — nomes mal escritos no PDF («Nathan Bonefant») ou país da
 * lista diferente do da ficha (Mariana, 03/11/2026). Ficha sem data de
 * nascimento mas com federado FPG: a idade vem do federados.json.
 */
const fs = require("fs");
const path = require("path");
const { DATA_DIR, readJsonSafe } = require("./io");
const { normName, countryToIso2 } = require("./names");
const { lerFedsDasProvas, fedDoJogador } = require("./feds-das-provas");

const LISTAS_DIR = path.join(DATA_DIR, "hcp-listas");

let fedCache = null;
function federados() {
  if (!fedCache) {
    const fed = readJsonSafe(path.join(DATA_DIR, "federados.json"), null);
    fedCache = (fed && fed.players) || [];
  }
  return fedCache;
}

const paisOk = (iso, j, exigir) => {
  const da = [j.country, j.nationality, ...(j.countries || [])].filter(Boolean).map((c) => String(c).toUpperCase());
  if (!da.length) return !exigir;
  if (!iso) return !exigir;
  return da.some((c) => c === iso || c.startsWith(iso + "-"));
};

const semZeros = (s) => String(s || "").trim().replace(/^0+/, "");
const fmtH = (h) => (h < 0 ? `+${-h}` : String(h));

/**
 * As federações inteiras, não só as fichas do Kids 2: PT (federados.json), ES
 * (licenças RFEG; a mesma pessoa tem várias licenças — junta-se pela data de
 * nascimento ou pelos 6 dígitos finais) e FR (licenças FFG). Um homónimo fora
 * do Kids 2 também conta: sem isto, quando o miúdo certo ainda não tem ficha, a
 * lista liga-se ao único homónimo que tem.
 */
let univCache = null;
function universos() {
  if (univCache) return univCache;
  const novo = () => ({ porNome: new Map(), porPontas: new Map(), porFed: new Map() });
  const PT = novo(), ES = novo(), FR = novo();
  const juntar = (U, nome, x) => {
    const k = normName(nome);
    if (!k) return;
    U.porNome.set(k, [...(U.porNome.get(k) || []), x]);
    // pelo 1.º e último nome, para os nomes contidos: o «Ricardo Ferreira» da
    // lista de Castro Marim era o Ricardo ROCHA Ferreira (51180), não o 45366
    const t = k.split(" ");
    if (t.length >= 2) { const p = `${t[0]}|${t[t.length - 1]}`; U.porPontas.set(p, [...(U.porPontas.get(p) || []), { ...x, toks: t }]); }
  };
  for (const f of federados()) {
    const fed = String(Number(f.federation_code));
    const x = { chave: fed, sexo: f.gender || null, ano: Number(String(f.birthdate || "").slice(0, 4)) || 0, hcp: typeof f.hcp_exact === "number" ? f.hcp_exact : null };
    juntar(PT, f.name, x);
    PT.porFed.set(fed, x);
  }
  const es = readJsonSafe(path.join(DATA_DIR, "spain-players.json"), null);
  for (const p of Object.values(es?.byLicencia || {})) {
    const [ap, ...nm] = String(p.name || "").split(",");
    juntar(ES, nm.length ? `${nm.join(" ")} ${ap}` : ap, { chave: p.dobIso || String(p.licencia).slice(-6), sexo: p.sex || null,
      ano: Number(String(p.dobIso || "").slice(0, 4)) || 0, hcp: typeof p.hcp === "number" ? p.hcp : null, hcpData: p.hcpDate || null });
  }
  const fr = readJsonSafe(path.join(DATA_DIR, "france-players.json"), null);
  for (const p of Object.values(fr?.byLicense || {})) {
    // O índice actual é o do Mérite (`merite.idx`, plus em negativo, mês AAAAMM); o
    // `hcp` da ficha é o de uma prova — a Zélie Guilloux tinha 3.9 e o índice +2.6.
    const m = p.merite && typeof p.merite.idx === "number" && /^\d{6}$/.test(String(p.merite.month || "")) ? p.merite : null;
    const x = { chave: semZeros(p.license), sexo: p.sex || null, ano: Number(p.birthYear) || 0,
      hcp: m ? m.idx : typeof p.hcp === "number" ? p.hcp : null,
      hcpData: m ? `${String(m.month).slice(0, 4)}-${String(m.month).slice(4, 6)}-01` : p.hcpDate || null };
    juntar(FR, p.name, x);
    FR.porFed.set(x.chave, x); // pela licença (também as «E…» dos estrangeiros)
  }
  univCache = { PT, ES, FR };
  return univCache;
}

/** Clube da lista e da ficha com uma palavra em comum, pela raiz (Münchener GC ~ München). */
const PALAVRAS_CLUBE = new Set(["golf", "golfe", "club", "clube", "the", "and", "country", "gcc", "lgc", "golfclub", "park"]);
function clubeBate(a, b) {
  const palavras = (s) => normName(s).split(" ").filter((w) => w.length > 2 && !PALAVRAS_CLUBE.has(w)).map((w) => w.replace(/(er|es|s)$/, ""));
  const A = palavras(a), B = palavras(b);
  return A.some((x) => B.some((y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x)))));
}

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
  const porId = new Map(res.juniors.map((j) => [j.id, j]));
  let nascFed = null; // fed → data de nascimento (só se alguma ficha precisar)
  const anoNasc = (j) => {
    let d = j.dob || j.birthYear;
    if (!d && j.sources?.fpg?.fed) {
      if (!nascFed) nascFed = new Map(federados().map((x) => [String(x.federation_code), x.birthdate]));
      d = nascFed.get(String(j.sources.fpg.fed));
    }
    return Number(String(d || "").slice(0, 4)) || 0;
  };

  // Números: licença FFG da ficha (ou o id «g<licença>») e federado FPG.
  const porLicFFG = new Map();
  const porFed = new Map();
  for (const j of res.juniors) {
    const lic = semZeros(j.sources?.ffgolf?.lic) || (/^g\d+$/.test(j.id) ? semZeros(j.id.slice(1)) : "");
    if (lic) porLicFFG.set(lic, j);
    if (j.sources?.fpg?.fed) porFed.set(String(Number(j.sources.fpg.fed)), j);
  }
  let fedsDasProvas = null; // só se alguma lista tiver `prova`

  const relatorio = [];
  let ligados = 0;
  let porConfirmar = 0;
  for (const f of ficheiros) {
    const lista = readJsonSafe(path.join(LISTAS_DIR, f), null);
    if (!lista || !Array.isArray(lista.players) || !lista.data) continue;
    const linhasLista = [];
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
        const ano = anoNasc(j);
        return !ano || ano >= lista.nascidosDesde;
      };
      let cands = new Set([...(porNome.get(n) || []), ...(invertido ? porNome.get(invertido) || [] : [])]);
      cands = new Set([...cands].filter((j) => paisOk(iso, j, false) && idadeOk(j)));
      let via = "nome";
      if (p.ficha) { cands = new Set(porId.has(p.ficha) ? [porId.get(p.ficha)] : []); via = "ficha (manual)"; }
      // `soNomeExacto` (listas de nomes ingleses comuns, intelligentgolf): sem o
      // passo do nome contido — «Ben Smith» não é o «Ben Cordwell-Smith»
      if (!cands.size && !p.ficha && toks.length >= 2 && !lista.soNomeExacto) {
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
        const comIdade = [...cands].filter((j) => anoNasc(j) >= lista.nascidosDesde);
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
      // O NÚMERO manda sobre o nome (Mariana, 03/11/2026): a licença FFG que a
      // lista traz, ou o federado que a própria prova (`lista.prova`) dá ao inscrito.
      let porNumero = false;
      if (!p.ficha && p.licFFG) {
        const j = porLicFFG.get(semZeros(p.licFFG));
        if (j) { cands = new Set([j]); via = "licença FFG"; porNumero = true; }
      }
      if (!p.ficha && !porNumero && lista.prova?.tcode) {
        if (!fedsDasProvas) fedsDasProvas = lerFedsDasProvas();
        const fed = fedDoJogador({ ccode: lista.prova.ccode, tcode: lista.prova.tcode, date: lista.prova.data || lista.data }, { name: p.name }, fedsDasProvas);
        if (fed) { const j = porFed.get(String(Number(fed))); cands = new Set(j ? [j] : []); via = "federado da prova"; porNumero = true; }
      }

      const linha = { lista: lista.id, name: p.name, country: p.country, hcp: p.hcp, estado: p.lista || null };
      if (cands.size === 1) {
        const j = [...cands][0];
        const v = p.ficha || porNumero ? { confirma: via } : verificar(lista, p, j, iso, [n, invertido]);
        if (v.contradiz) {
          linha.semFicha = false;
          linha.ambiguo = [`${j.canonicalName}: ${v.contradiz}`];
        } else {
          linha.junior = { id: j.id, name: j.canonicalName, via, ...(v.confirma ? { confirmadoPor: v.confirma } : { porConfirmar: true }) };
          linhasLista.push({ linha, j });
        }
      } else {
        linha.semFicha = cands.size === 0;
        linha.ambiguo = cands.size > 1 ? [...cands].map((j) => `${j.canonicalName} (${j.country || "?"})`) : undefined;
      }
      relatorio.push(linha);
    }

    // A mesma ficha para duas pessoas da lista (handicaps a mais de 3 — dois Ben
    // Smith, 5.4 e 17): não se sabe qual é, nenhuma fica ligada.
    const porFicha = new Map();
    for (const x of linhasLista) if (!/manual/.test(x.linha.junior.via)) porFicha.set(x.j.id, [...(porFicha.get(x.j.id) || []), x]);
    for (const xs of porFicha.values()) {
      const hs = xs.map((x) => x.linha.hcp);
      if (xs.length < 2 || Math.max(...hs) - Math.min(...hs) <= 3) continue;
      for (const x of xs) {
        x.linha.ambiguo = [`${x.j.canonicalName}: a mesma ficha para ${xs.length} pessoas da lista (handicaps ${hs.map(fmtH).join(" e ")})`];
        delete x.linha.junior;
      }
    }

    // Só o que está confirmado escreve na ficha; o resto fica «por confirmar».
    for (const { linha, j } of linhasLista) {
      if (!linha.junior) continue;
      if (linha.junior.porConfirmar) { porConfirmar++; continue; }
      if (aplicar) {
        const h = { date: lista.data, hcpExact: linha.hcp, source: "entry-list", label: lista.label || lista.id, ...(lista.fonteCurta ? { fonte: lista.fonteCurta } : {}) };
        j.hcpHistory = Array.isArray(j.hcpHistory) ? j.hcpHistory : [];
        if (!j.hcpHistory.some((x) => x.date === h.date && x.source === h.source && x.hcpExact === h.hcpExact)) {
          j.hcpHistory.push(h);
          j.hcpHistory.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        }
      }
      ligados++;
    }
  }
  return { disponivel: true, listas: ficheiros.length, total: relatorio.length, ligados, porConfirmar, relatorio };

  /**
   * Ligação só pelo nome a UMA ficha: o que a contradiz e o que a confirma.
   *   contradiz — homónimo compatível na federação inteira (PT/ES/FR), licença
   *     FFG diferente, ou handicap recente a mais de 5 do da lista;
   *   confirma — único na federação, clube igual, handicap recente a ≤ 3, ou
   *     ano de nascimento conhecido dentro do escalão.
   * Sem contradição nem confirmação fica «por confirmar».
   */
  function verificar(lista, p, j, iso, nomesLinha) {
    const U = universos()[iso];
    let pessoas = [];
    if (U) {
      const vistas = new Map();
      for (const nm of new Set([...nomesLinha, normName(j.canonicalName)].filter(Boolean))) {
        for (const x of U.porNome.get(nm) || []) vistas.set(x.chave, x);
        const t = nm.split(" ");
        if (t.length < 2) continue;
        for (const x of U.porPontas.get(`${t[0]}|${t[t.length - 1]}`) || []) if (t.every((w) => x.toks.includes(w))) vistas.set(x.chave, x);
      }
      pessoas = [...vistas.values()].filter((x) => (!lista.sexo || !x.sexo || x.sexo === lista.sexo)
        && (!lista.nascidosDesde || !x.ano || x.ano >= lista.nascidosDesde));
      if (pessoas.length >= 2) return { contradiz: `${pessoas.length} com este nome na federação (${iso})` };
    }
    const licFicha = semZeros(j.sources?.ffgolf?.lic);
    if (p.licFFG && licFicha && !/^E/i.test(j.sources.ffgolf.lic) && licFicha !== semZeros(p.licFFG)) {
      return { contradiz: `licença FFG ${p.licFFG} na lista, ${j.sources.ffgolf.lic} na ficha` };
    }
    const h = hcpRecente(j, iso, pessoas, lista.data);
    if (h != null && Math.abs(h - p.hcp) > 5) return { contradiz: `handicap ${fmtH(p.hcp)} na lista, ${fmtH(h)} hoje` };
    if (U && pessoas.length === 1) return { confirma: "único na federação" };
    if (clubeBate(p.clube, j.sources?.fpg?.club || j.sources?.rfeg?.club || j.sources?.ffgolf?.club || j.club)) return { confirma: "clube" };
    if (h != null && Math.abs(h - p.hcp) <= 3) return { confirma: "handicap" };
    const ano = anoNasc(j);
    if (lista.nascidosDesde && ano >= lista.nascidosDesde) return { confirma: "idade" };
    return {};
  }

  /** Handicap da ficha com data a ≤ 6 meses da lista (o FPG oficial de hoje para federados). */
  function hcpRecente(j, iso, pessoas, data) {
    const fed = j.sources?.fpg?.fed;
    if (fed) {
      const x = universos().PT.porFed.get(String(Number(fed)));
      if (typeof x?.hcp === "number") return x.hcp;
    }
    const perto = (d) => d && Math.abs(Date.parse(d) - Date.parse(data)) <= 183 * 864e5;
    const s = j.sources || {};
    const daLicenca = s.ffgolf?.lic ? universos().FR.porFed.get(semZeros(s.ffgolf.lic)) : null;
    if (typeof daLicenca?.hcp === "number" && perto(daLicenca.hcpData)) return daLicenca.hcp;
    if ((iso === "ES" || iso === "FR") && pessoas.length === 1 && typeof pessoas[0].hcp === "number" && perto(pessoas[0].hcpData)) return pessoas[0].hcp;
    if (typeof s.rfeg?.hcp === "number" && perto(s.rfeg.hcpDate)) return s.rfeg.hcp;
    if (typeof s.fpg?.hcpExact === "number" && perto(s.fpg.hcpDate)) return s.fpg.hcpExact;
    return null;
  }
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
        junior: j ? { id: j.id, name: j.canonicalName, dob: j.dob || null, club: s.fpg?.club || s.rfeg?.club || s.ffgolf?.club || j.club || null, via: l.junior.via,
          ...(l.junior.porConfirmar ? { porConfirmar: true } : { confirmadoPor: l.junior.confirmadoPor || l.junior.via }) } : null,
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
  const todos = federados();
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
