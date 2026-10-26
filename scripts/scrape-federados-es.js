/**
 * scripts/scrape-federados-es.js — hándicap OFICIAL actual dos juniores
 * espanhóis que o site acompanha, pela pesquisa pública da RFEG.
 *
 * História: o de 26/06 (ramo nunca juntado `claude/eloquent-goldberg-ykatma`)
 * lia o antigo serviciohandicap.aspx?HLic=… e queria enriquecer as ~17 mil
 * licenças conhecidas (parou aos 500). Em Setembro de 2026 a RFEG mudou de site
 * e esse endereço redirecciona para a página inicial. Refeito a 22/10/2026:
 *
 *   GET https://rfegolf.es/wp-json/handicap-search/v1/search?q=<licença ou nome>&size=20
 *   (o buscador de rfegolf.es/aprende-mejora/consulta-handicap; JSON público,
 *   sem cookies; responde 429 a pesquisas muito seguidas)
 *   → data.hits[].document: guid_licence, full_name, handicap ("0.3"),
 *     date_hdc_updated_at ("2026-10-05"), enum_gender (1 M / 2 F), club_title,
 *     federation_title, is_professional. Sem data de nascimento.
 *
 * A pesquisa é aproximada: a licença pedida pode não vir, ou vir junto com
 * outras parecidas. Aceita-se: (1) a licença exacta; senão (2) uma licença com
 * os mesmos 6 dígitos finais — é a mesma pessoa depois de mudar de clube
 * (memória rfeg-licencia-sufixo-estavel) — e com um apelido em comum com o
 * nome que temos. Nunca se casa só pelo nome: sem licença não há idade e um
 * adulto homónimo passava por júnior.
 *
 * ÂMBITO (não as 17 mil licenças): os juniores do kids2 (juniors.json) com
 * licença RFEG que interessam ao Manuel — nascidos entre MANUEL−4 e MANUEL+4
 * (2010–2018), os de idade desconhecida com escalão Benjamín/Alevín/Infantil/
 * Cadete, e todos os que já jogaram com ele (juniors-scout.json) — mais as
 * licenças dos rankings juvenis (scrape-rfeg-ranking.js) cujo nome bate com
 * um júnior do kids2. ~1–1,5 mil pedidos, um de cada vez, com pausa.
 *
 * Saída: public/data/rfeg-hcp.json
 *   { generatedAt, source, total, byLicencia: { <licença pedida>: { lic, nome, hcp, hcpRaw, data,
 *       sexo, clube, federacao, pro, via: "licenca"|"sufixo", consultado } | { naoEncontrado: true, consultado } } }
 * Gravação aditiva (o que não se consultou desta vez fica) e com guarda
 * anti-encolhimento; a cada 100 consultas grava um ponto de retoma.
 *
 * Uso:
 *   node scripts/scrape-federados-es.js                    # âmbito acima; salta as consultadas há < 6 dias
 *   node scripts/scrape-federados-es.js --max-dias 0       # reconsulta tudo
 *   node scripts/scrape-federados-es.js --lic AM84955303   # uma licença (mostra, não grava)
 *   node scripts/scrape-federados-es.js --limit 50 --delay 2000
 * Exit: 0 = gravou · 2 = nada de novo · 1 = erro.
 */
const fs = require("fs");
const path = require("path");
const { Sessao, sleep, normLic, sufixoLic } = require("./lib/rfeg-web");
const { writeJsonGuarded, hasForceFlag } = require("./lib/shrink-guard");
const { carregarRankings, indexar, rankingsDoJunior } = require("./lib/rfeg-oficial");

const API = "https://rfegolf.es/wp-json/handicap-search/v1/search";
const DATA = path.resolve(__dirname, "../public/data");
const OUT = path.join(DATA, "rfeg-hcp.json");
const MANUEL_ANO = 2014;
const ESCALOES_JOVENS = /benjam|alev|infantil|cadete/i;

/* ─── nomes ───────────────────────────────────────────────────── */
const PARTICULAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "I", "DA", "DO", "DOS", "VAN", "DER", "VON"]);
/** Palavras de um nome (maiúsculas, sem acentos nem partículas). */
function palavras(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w.length >= 2 && !PARTICULAS.has(w));
}
/** Dois nomes partilham pelo menos duas palavras (nome + apelido), ou uma se um deles só tiver uma. */
function nomesCompativeis(a, b) {
  const A = new Set(palavras(a)), B = palavras(b);
  if (!A.size || !B.length) return false;
  const comuns = B.filter((w) => A.has(w)).length;
  return comuns >= Math.min(2, A.size, B.length);
}

/* ─── API ─────────────────────────────────────────────────────── */
function docParaRegisto(d, via, hoje) {
  const raw = d.handicap == null ? "" : String(d.handicap);
  const n = parseFloat(raw.replace(",", "."));
  return {
    lic: normLic(d.guid_licence), nome: String(d.full_name || "").replace(/\s+/g, " ").trim(),
    hcp: Number.isFinite(n) && n < 54.1 ? n : null, hcpRaw: raw,
    data: /^\d{4}-\d{2}-\d{2}/.test(d.date_hdc_updated_at || "") ? d.date_hdc_updated_at.slice(0, 10) : null,
    sexo: d.enum_gender === 1 ? "M" : d.enum_gender === 2 ? "F" : null,
    clube: d.club_title || null, federacao: d.federation_title || null, pro: !!d.is_professional,
    via, consultado: hoje,
  };
}
/** Escolhe, entre os resultados de uma pesquisa, o registo desta licença (ou null). */
function escolher(hits, lic, nomeConhecido, hoje) {
  const docs = (hits || []).map((h) => h.document || h).filter((d) => d && d.guid_licence);
  const exacta = docs.find((d) => normLic(d.guid_licence) === lic);
  if (exacta) return docParaRegisto(exacta, "licenca", hoje);
  const suf = sufixoLic(lic);
  if (!suf) return null;
  const mesmos = docs.filter((d) => sufixoLic(d.guid_licence) === suf && (!nomeConhecido || nomesCompativeis(nomeConhecido, d.full_name)));
  return mesmos.length === 1 ? docParaRegisto(mesmos[0], "sufixo", hoje) : null;
}

/* ─── âmbito ──────────────────────────────────────────────────── */
function lerJson(f) { return JSON.parse(fs.readFileSync(f, "utf8")); } // ilegível = erro

/** [{lic, nome}] — juniores do kids2 que interessam (ver cabeçalho). Os
 *  rankings casam-se com a regra do lib/rfeg-oficial.js (a mesma do agregador):
 *  entram as licenças dos rankings dos juniores próximos e dos casados por
 *  nome + ano de nascimento (fichas sem licença RFEG). */
function ambito() {
  const juniors = lerJson(path.join(DATA, "juniors.json")).juniors;
  const scout = lerJson(path.join(DATA, "juniors-scout.json")).players || {};
  const idx = indexar(carregarRankings(path.join(DATA, "rfeg-rankings")));
  const out = new Map();
  const add = (lic, nome) => { const l = normLic(lic); if (l && !out.has(l)) out.set(l, nome || ""); };
  for (const j of juniors) {
    const lic = j.sources?.rfeg?.lic;
    const ano = Number(String(j.dob || "").slice(0, 4)) || null;
    const jogouComManuel = !!scout[j.id]?.m?.length;
    const perto = ano ? ano >= MANUEL_ANO - 4 && ano <= MANUEL_ANO + 4 : ESCALOES_JOVENS.test(j.sources?.rfeg?.catEdad || "");
    if (lic && !(perto || jogouComManuel)) continue;
    if (lic) add(lic, j.canonicalName);
    for (const l of rankingsDoJunior(j, idx).linhas) if (l.lic) add(l.lic, j.canonicalName);
  }
  return [...out].map(([lic, nome]) => ({ lic, nome }));
}

module.exports = { escolher, nomesCompativeis, palavras, docParaRegisto, ambito };

/* ─── main ─────────────────────────────────────────────────────── */
if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (n, def) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def; };
  const DELAY = Math.max(800, parseInt(arg("delay", "1200"), 10));
  const MAX_DIAS = Math.max(0, parseInt(arg("max-dias", "6"), 10));
  const LIMIT = arg("limit", null) ? parseInt(arg("limit"), 10) : Infinity;
  const force = hasForceFlag();
  const hoje = new Date().toISOString().slice(0, 10);
  const s = new Sessao();

  const consultar = async (lic, nome) => {
    for (let t = 0; t < 4; t++) {
      const r = await s.get(`${API}?q=${encodeURIComponent(lic)}&size=20`);
      if (r.status === 429) { console.warn(`  429 — espera ${30 * (t + 1)} s`); await sleep(30000 * (t + 1)); continue; }
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const j = JSON.parse(r.body);
      if (!j || !j.data || !Array.isArray(j.data.hits)) throw new Error("resposta sem data.hits");
      return escolher(j.data.hits, lic, nome, hoje);
    }
    throw new Error("429 repetido — a parar para não insistir");
  };

  (async () => {
    if (arg("lic", null)) {
      const lic = normLic(arg("lic"));
      console.log(JSON.stringify(await consultar(lic, arg("nome", "")), null, 2));
      return;
    }
    let anterior = {};
    if (fs.existsSync(OUT)) anterior = lerJson(OUT).byLicencia || {};
    const store = { ...anterior };
    const limite = new Date(Date.now() - MAX_DIAS * 864e5).toISOString().slice(0, 10);
    const todos = ambito();
    const fila = todos.filter((x) => !(store[x.lic]?.consultado && MAX_DIAS > 0 && store[x.lic].consultado > limite)).slice(0, LIMIT);
    console.log(`RFEG hándicap — âmbito ${todos.length} licenças, ${fila.length} a consultar (pausa ${DELAY} ms)`);

    const gravar = () => writeJsonGuarded(OUT, {
      generatedAt: new Date().toISOString(), source: "scripts/scrape-federados-es.js (rfegolf.es handicap-search)",
      total: Object.keys(store).length, byLicencia: store,
    }, { count: (d) => Object.keys(d.byLicencia).length, maxDrop: 0.5, force, spaces: 0, label: "rfeg-hcp.json" });

    let ok = 0, nao = 0, erros = 0, mudou = 0, parou = null;
    for (let i = 0; i < fila.length; i++) {
      const { lic, nome } = fila[i];
      try {
        const reg = await consultar(lic, nome);
        const novo = reg || { naoEncontrado: true, consultado: hoje };
        const sem = (o) => JSON.stringify({ ...o, consultado: undefined });
        if (!store[lic] || sem(store[lic]) !== sem(novo)) mudou++;
        store[lic] = novo;
        if (reg) ok++; else nao++;
      } catch (e) {
        erros++;
        console.warn(`  ! ${lic}: ${e.message}`);
        if (/429 repetido/.test(e.message)) { parou = e.message; break; }
        if (erros >= 20 && ok === 0) { parou = "20 erros seguidos sem nenhum sucesso"; break; }
      }
      if ((i + 1) % 100 === 0) { gravar(); console.log(`  ${i + 1}/${fila.length} — ${ok} com hcp, ${nao} não encontradas, ${erros} erros`); }
      await sleep(DELAY);
    }
    const w = gravar();
    console.log(`Feito: ${ok} com hcp, ${nao} não encontradas, ${erros} erros, ${mudou} mudaram. rfeg-hcp.json: ${Object.keys(store).length} licenças${w.written ? "" : " (NÃO gravado)"}.`);
    if (parou) console.error(`::error::scrape-federados-es parou: ${parou}`);
    if (!w.written || parou || (fila.length && ok === 0 && erros > 0)) process.exitCode = 1;
    else if (!mudou) process.exitCode = 2;
  })().catch((e) => { console.error("ERRO:", e.message); process.exitCode = 1; });
}
