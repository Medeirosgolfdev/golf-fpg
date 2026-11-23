/**
 * scripts/aggregator/util/provas-fora.js
 *
 * A prova verdadeira de cada volta internacional dos federados — 23/11/2026.
 * As voltas que um português joga lá fora (ou num torneio internacional cá,
 * como o Faldo Madeira) chegam à FPG lançadas pelo clube com o código de
 * torneio fictício «999999». A ficha do jogador (/jogadores, coluna Prova)
 * fazia com ele um link para a FPG que dá erro (Mariana: «tu sabes identificar
 * que os resultados são internacionais, então tb tens de saber colocar o link
 * correcto para o evento»). O Kids 2 tem essas provas e o link do organizador
 * (Signupanytime, GolfGenius…); este índice liga cada volta 999999 à prova do
 * Kids 2, para a ficha não carregar a base inteira (~180 MB).
 *
 * Como se liga uma volta (cartão `output/{fed}/scorecards.json`, tcode 999999):
 *   1. voltas de treino/EDS/registo inicial não se ligam (o «Extra Day Score»
 *      da véspera não é a prova);
 *   2. a prova é uma em que a ficha do Kids 2 desse federado jogou e a volta cai
 *      DENTRO dos dias da prova; OU o nome da prova bate com o que o clube
 *      escreveu na FPG e a volta cai nos dias da prova com 1 dia de folga (o
 *      Mikhail Khontulev da Rome Classic não está ligado ao federado no Kids 2)
 *      — nunca só a data.
 *   Entre várias, ganha a de nome mais parecido e, empatadas, a do organizador
 *   (as cópias dos rankings EGR/WAGR ficam para último).
 *
 * Saída (`public/data/provas-fora-federados.json`, compacta):
 *   { schemaVersion, generatedAt,
 *     t: { [tid]: [nome, [[rótulo, url], …]] },
 *     v: { [fed]: { [id do cartão = scoreId da ficha]: tid } } }
 */
const fs = require("fs");
const path = require("path");
const { lisbonCivilDayStr } = require("../../../lib/helpers");

const OUTPUT_DIR = path.join(__dirname, "..", "..", "..", "output");
const DIA_MS = 864e5;
const FOLGA_DIAS = 1;
const MAX_DIAS_PROVA = 10;
const TCODE_INTL = "999999";
/** Fontes que são cópias de rankings: só servem se não houver a do organizador. */
const FONTES_RANKING = new Set(["egr", "wagr"]);

/** Voltas que não são de uma prova, mesmo jogadas nos dias dela. */
const NAO_E_PROVA = /extra\s*day|^\s*ed[sc]\b|treino|practice|first\s*score|score\s*virtual|role\s*up|casual|handicap\s*round|volta\s*(ao|no|para)|^\s*jogo\s*$/i;

/** Palavras que não distinguem provas (e os «D1», «R2», anos e números). */
const PALAVRAS_GENERICAS = new Set([
  "golf", "junior", "juniors", "jr", "tour", "open", "international", "internacional", "intl",
  "championship", "championships", "campeonato", "torneio", "trophy", "trofeo", "cup", "taca",
  "the", "of", "and", "de", "do", "da", "dos", "das", "des", "du", "la", "le", "el", "del", "di",
  "boys", "girls", "kids", "us", "series", "event", "dia", "day", "round", "volta",
]);

function palavras(s) {
  return new Set(
    String(s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !/\d/.test(w) && !PALAVRAS_GENERICAS.has(w)),
  );
}

/** Parecença de nomes: palavras em comum / palavras do nome mais curto (0..1). */
function parecenca(a, b) {
  const A = palavras(a);
  const B = palavras(b);
  if (!A.size || !B.size) return 0;
  let comum = 0;
  for (const w of A) if (B.has(w)) comum++;
  return comum / Math.min(A.size, B.size);
}

const isoMais = (iso, dias) => new Date(Date.parse(iso + "T12:00:00Z") + dias * DIA_MS).toISOString().slice(0, 10);

/** Fim da prova: o da fonte; senão início + (nº de voltas − 1) dias. */
function fimDaProva(t, ini) {
  if (t.endDate && /^\d{4}-\d{2}-\d{2}/.test(t.endDate)) return String(t.endDate).slice(0, 10);
  let voltas = 1;
  for (const fl of t.flights || []) {
    for (const r of fl.results || []) {
      for (const rd of r.rounds || []) if (rd && rd.round > voltas) voltas = rd.round;
    }
  }
  return isoMais(ini, voltas - 1);
}

/** Ficheiro ausente → null; ilegível → null com aviso (um ficheiro por jogador
 *  não pára o agregador, mas não fica calado). */
function lerJson(f) {
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, "utf-8")); }
  catch (e) {
    console.log(`::warning::agregador (provas de fora): ${path.relative(process.cwd(), f)} ilegível — ${String(e.message).slice(0, 100)}`);
    return null;
  }
}

function dataFpg(s) {
  const m = String(s || "").match(/\/Date\((-?\d+)\)\//);
  return m ? lisbonCivilDayStr(+m[1]) : null;
}

/** As voltas internacionais (tcode 999999) de um federado: [{ id, data, nome }]. */
function voltasIntl(fed, outputDir) {
  const sc = lerJson(path.join(outputDir, String(fed), "scorecards.json"));
  if (!sc) return [];
  const out = [];
  for (const [id, c] of Object.entries(sc)) {
    if (!c || String(c.tournament_code) !== TCODE_INTL) continue;
    const data = dataFpg(c.played_at);
    if (data) out.push({ id: String(c.id ?? id), data, nome: c.tournament_description || "" });
  }
  return out;
}

/**
 * @param {object[]} juniors   — fichas do Kids 2
 * @param {object[]} tournaments — torneios do Kids 2
 * @param {string} generatedAt
 * @param {{ outputDir?: string, voltasDe?: (fed: string) => {id: string, data: string, nome: string}[] }} [opts]
 */
function buildProvasFora(juniors, tournaments, generatedAt, opts = {}) {
  const voltasDe = opts.voltasDe || ((fed) => voltasIntl(fed, opts.outputDir || OUTPUT_DIR));

  // Provas de fora com data e link, indexadas por dia (cada dia da prova ± folga).
  const porDia = new Map();
  const meta = new Map(); // tid → { t, ini, fim, links }
  for (const t of tournaments) {
    if (!t?.id || t.sourceId === "fpg") continue;
    const ini = String(t.startDate || t.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ini)) continue;
    const links = (t.links || []).filter((l) => l && l.url).map((l) => [l.label || "", l.url]);
    if (!links.length) continue;
    let fim = fimDaProva(t, ini);
    if (fim < ini || (Date.parse(fim) - Date.parse(ini)) / DIA_MS > MAX_DIAS_PROVA) fim = ini;
    meta.set(t.id, { t, ini, fim, links });
    for (let d = isoMais(ini, -FOLGA_DIAS); d <= isoMais(fim, FOLGA_DIAS); d = isoMais(d, 1)) {
      if (!porDia.has(d)) porDia.set(d, []);
      porDia.get(d).push(t.id);
    }
  }

  // Em que provas jogou cada ficha do Kids 2.
  const provasDoJunior = new Map();
  for (const [tid, { t }] of meta) {
    for (const fl of t.flights || []) {
      for (const r of fl.results || []) {
        if (!r?.juniorId) continue;
        if (!provasDoJunior.has(r.juniorId)) provasDoJunior.set(r.juniorId, new Set());
        provasDoJunior.get(r.juniorId).add(tid);
      }
    }
  }

  const tOut = {};
  const v = {};
  for (const j of juniors) {
    const fed = j?.sources?.fpg?.fed ? String(j.sources.fpg.fed) : null;
    if (!fed || v[fed]) continue;
    const dele = provasDoJunior.get(j.id) || new Set();
    for (const volta of voltasDe(fed)) {
      if (NAO_E_PROVA.test(volta.nome)) continue;
      let melhor = null;
      for (const tid of porDia.get(volta.data) || []) {
        const m = meta.get(tid);
        const p = parecenca(volta.nome, m.t.name);
        const jogou = dele.has(tid) && volta.data >= m.ini && volta.data <= m.fim;
        if (!jogou && p < 0.5) continue; // sem a ficha a confirmar, só com o nome a bater
        const ranking = FONTES_RANKING.has(meta.get(tid).t.sourceId);
        // jogou > nome mais parecido > organizador antes dos rankings
        const nota = (jogou ? 10 : 0) + p + (ranking ? 0 : 0.01);
        if (!melhor || nota > melhor.nota) melhor = { tid, nota };
      }
      if (!melhor) continue;
      (v[fed] ||= {})[volta.id] = melhor.tid;
      if (!tOut[melhor.tid]) {
        const m = meta.get(melhor.tid);
        tOut[melhor.tid] = [m.t.name || m.t.shortName || melhor.tid, m.links];
      }
    }
  }
  return { schemaVersion: 1, generatedAt, t: tOut, v };
}

module.exports = { buildProvasFora, parecenca, fimDaProva, NAO_E_PROVA };
