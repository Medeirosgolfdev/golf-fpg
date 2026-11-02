/**
 * scripts/aggregator/util/ultimos.js
 *
 * Os últimos torneios de cada junior, para o Scout (02/11/2026 — substitui o
 * util/form.js). Pedido da Mariana: «os últimos torneios deviam sair do Kids 2
 * + os da FPG». Juntam-se duas fontes:
 *   1. os torneios do Kids 2 (todas as fontes do agregador), com o lugar e o field;
 *   2. os cartões FPG de cada federado seguido (`output/{fed}/scorecards.json`):
 *      as provas de clube que o Kids 2 não tem (Aberto do Estoril, Jamor Summer
 *      Series, Campeonato Juvenil…) — sem lugar, mas com as pancadas e o par.
 *      A mesma prova nas duas = mesmo tcode a ≤ 6 dias: fica a do Kids 2.
 * O SD é o OFICIAL da FPG (o `sgd` do WHS: `output/{fed}/whs.json` dos seguidos
 * ou o data-archive/whs-sd.json, pela lib do backfill-sd — scripts/lib/official-sd.js),
 * a média das voltas desse tcode na semana da prova; nunca estimado. Nas provas
 * de fora, o das voltas internacionais que o clube registou no WHS (tcode 999999),
 * só quando batem certo com as voltas jogadas.
 * Quem ficou sem cartão (gross ≥ 900) ou não acabou fica «WD» (ou «DQ»/«DNS»),
 * sem ±par (o form.js dava «+949»).
 *
 * Saída: buildUltimos(juniors, tournaments, generatedAt) →
 *   { nomes: [nome do torneio, …],
 *     porJunior: Map<id, { u: [[data, iNome, lugar | "WD" | null, field | null, voltas, pancadas | null,
 *                               ±par | null, buracos, SD médio | null], …mais recente primeiro, KEEP],
 *                          extraAno: torneios FPG fora do Kids 2 no último ano,
 *                          voltasAno: [[pancadas, ±par | null], …] das voltas de 18 FPG fora do Kids 2 } > }
 */
const fs = require("fs");
const path = require("path");
const { lisbonCivilDayStr } = require("../../../lib/helpers");
const officialSd = require("../../lib/official-sd");

const KEEP = 8;           // torneios por junior
const MAX_AGE_DAYS = 550; // ~18 meses — mais antigo já não é «últimos»
const OUTPUT_DIR = path.join(__dirname, "..", "..", "..", "output");

const comCartao = (g) => typeof g === "number" && g > 0 && g < 900;
const diasEntre = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
const media1 = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

function lerJson(f) {
  try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch { return null; }
}

/** Data ISO de um `/Date(ms)/` da FPG (meia-noite de Lisboa). */
function dataFpg(s) {
  const m = String(s || "").match(/\/Date\((-?\d+)\)\//);
  return m ? lisbonCivilDayStr(+m[1]) : null;
}

/** As linhas do WHS oficial de um federado ({ date, tcode, sd }): as do
 *  output/{fed}/whs.json e, sem elas, as do índice descarregado. */
let _indice = null;
function linhasSd(fed) {
  const rows = officialSd.whsRows(String(fed));
  if (rows) return rows;
  if (!_indice) _indice = officialSd.loadIndex();
  return officialSd.indexRows(_indice, String(fed));
}

/** SD oficial médio de uma prova FPG: as voltas desse tcode na semana que começa
 *  em `data` (nunca só pelo tcode — a FPG reutiliza-os entre clubes e anos). */
function sdDaProva(rows, tcode, data) {
  const fim = officialSd.roundDate(data, 8);
  const tc = Number(tcode);
  return media1(rows.filter((r) => r.tcode === tc && r.date >= data && r.date < fim).map((r) => r.sd));
}

/** SD oficial médio de uma prova de FORA da FPG: o WHS regista as voltas
 *  internacionais com o tcode 999999 (melhorias.json). Só quando há exactamente
 *  tantas linhas dessas nos dias da prova como voltas jogadas — senão nada. */
function sdInternacional(rows, data, voltas) {
  if (!voltas) return null;
  const fim = officialSd.roundDate(data, voltas + 1);
  const xs = rows.filter((r) => r.tcode === 999999 && r.date >= data && r.date < fim);
  return xs.length === voltas ? media1(xs.map((r) => r.sd)) : null;
}

/** Os cartões FPG de um federado, agrupados por prova: [{ tcode, data, nome, voltas: [{gross, par, buracos}] }]. */
function provasFpg(fed) {
  const sc = lerJson(path.join(OUTPUT_DIR, String(fed), "scorecards.json"));
  if (!sc) return [];
  const cartoes = [];
  const vistos = new Set();
  for (const c of Object.values(sc)) {
    if (c?.score_origin !== "Torn") continue; // só torneios (fora os cartões individuais)
    const data = dataFpg(c.played_at);
    if (!data) continue;
    // O mesmo cartão às vezes vem duas vezes.
    const k = `${c.club_code}|${c.tournament_code}|${data}|${c.round_number}|${c.gross_total}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    cartoes.push({ c, data });
  }
  cartoes.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  // Uma prova = mesmo clube + tcode, voltas a ≤ 6 dias umas das outras (a FPG reutiliza tcodes entre anos).
  const provas = [];
  for (const { c, data } of cartoes) {
    const chave = `${c.club_code}|${c.tournament_code}`;
    let p = provas.find((x) => x.chave === chave && diasEntre(x.ultimaData, data) <= 6);
    if (!p) {
      p = { chave, tcode: String(c.tournament_code), data, ultimaData: data, nome: null, ronda1: Infinity, voltas: [] };
      provas.push(p);
    }
    p.ultimaData = data;
    const rn = Number(c.round_number) || 1;
    if (rn < p.ronda1 || !p.nome) {
      p.ronda1 = rn;
      p.nome = String(c.tournament_description || "").replace(/\s+(D|Dia|Day)\s*\d+\s*$/i, "").trim();
    }
    p.voltas.push({
      gross: comCartao(c.gross_total) ? c.gross_total : null,
      par: typeof c.par_total === "number" && c.par_total > 0 ? c.par_total : null,
      buracos: Number(c.hole_count || c.nholes) || 18,
    });
  }
  return provas;
}

function buracosJogados(r, holesPerRound) {
  let n = 0;
  for (const rd of r.rounds || []) {
    const s = (rd.strokes || []).filter((x) => x > 0).length;
    n += s || (comCartao(rd.gross) ? holesPerRound : 0);
  }
  return n;
}

function buildUltimos(juniors, tournaments, generatedAt) {
  const corte = new Date(Date.parse(generatedAt) - MAX_AGE_DAYS * 864e5).toISOString().slice(0, 10);
  const desdeAno = new Date(Date.parse(generatedAt) - 365 * 864e5).toISOString().slice(0, 10);
  const tById = new Map(tournaments.map((t) => [t.id, t]));
  const nomes = [];
  const iNome = new Map();
  const idx = (n) => {
    if (!iNome.has(n)) { iNome.set(n, nomes.length); nomes.push(n); }
    return iNome.get(n);
  };
  const porJunior = new Map();

  for (const j of juniors) {
    const fed = j.sources?.fpg?.fed;
    const fpg = fed ? provasFpg(fed) : [];
    const sdRows = fed ? linhasSd(fed) : [];
    const lista = [];
    const vistos = new Set(); // o mesmo torneio por DUAS fontes (ex.: USKids + Doral) conta uma vez
    const tcodesKids = []; // [tcode, data] dos torneios FPG que o Kids 2 já tem
    for (const tid of j.tournamentIds || []) {
      const t = tById.get(tid);
      const data = t?.date || t?.startDate || "";
      if (!t || data < corte) continue;
      const tcode = t.sourceId === "fpg" ? String(t.extra?.tcode || "") : "";
      if (tcode) tcodesKids.push([tcode, data]);
      for (const fl of t.flights || []) {
        const r = (fl.results || []).find((x) => x.juniorId === j.id);
        if (!r) continue;
        const hpr = t.holesPerRound || 18;
        const voltas = (r.rounds || []).filter((rd) => comCartao(rd.gross));
        const semCartao = (r.rounds || []).some((rd) => typeof rd.gross === "number" && rd.gross >= 900);
        const acabou = r.status === "OK" && !semCartao;
        const lugar = r.status === "CUT" ? (typeof r.pos === "number" ? r.pos : null)
          : acabou ? (typeof r.pos === "number" ? r.pos : null) : semCartao || r.status === "OK" ? "WD" : r.status;
        const gross = voltas.length ? voltas.reduce((s, rd) => s + rd.gross, 0)
          : comCartao(r.totalGross) && !semCartao ? r.totalGross : null;
        const toPar = !semCartao && typeof r.toPar === "number" && Math.abs(r.toPar) < 150 ? r.toPar : null;
        const k = `${data}|${gross}|${toPar}`;
        if (vistos.has(k)) break;
        vistos.add(k);
        const sd = tcode ? sdDaProva(sdRows, tcode, data)
          : t.sourceId !== "fpg" ? sdInternacional(sdRows, data, voltas.length) : null;
        // O field é quem a fonte trouxe; um lugar maior do que isso (fontes que só
        // publicam parte da classificação) deixa o field por saber.
        const field = (fl.results || []).length || null;
        lista.push([data, idx(t.name || t.shortName || tid), lugar, field && typeof lugar === "number" && lugar > field ? null : field,
          voltas.length || (gross != null ? 1 : 0), gross, toPar, buracosJogados(r, hpr), sd]);
        break;
      }
    }
    // As provas FPG que o Kids 2 não tem.
    let extraAno = 0;
    const voltasAno = [];
    for (const p of fpg) {
      if (p.data < corte) continue;
      if (tcodesKids.some(([tc, d]) => tc === p.tcode && diasEntre(d, p.data) <= 6)) continue;
      const ok = p.voltas.filter((v) => v.gross != null);
      const todas = ok.length === p.voltas.length;
      const gross = ok.length && todas ? ok.reduce((s, v) => s + v.gross, 0) : null;
      const par = todas && ok.every((v) => v.par != null) ? ok.reduce((s, v) => s + v.par, 0) : null;
      lista.push([p.data, idx(p.nome || `Torneio ${p.tcode}`), todas ? null : "WD", null, ok.length,
        gross, gross != null && par != null ? gross - par : null, ok.reduce((s, v) => s + v.buracos, 0),
        sdDaProva(sdRows, p.tcode, p.data)]);
      if (p.data >= desdeAno) {
        extraAno++;
        for (const v of ok) if (v.buracos === 18 && v.gross >= 50) voltasAno.push([v.gross, v.par != null ? v.gross - v.par : null]);
      }
    }
    if (!lista.length) continue;
    lista.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
    porJunior.set(j.id, { u: lista.slice(0, KEEP), extraAno, voltasAno });
  }
  return { nomes, porJunior, keep: KEEP };
}

module.exports = { buildUltimos, provasFpg };
