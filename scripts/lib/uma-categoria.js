"use strict";
/**
 * scripts/lib/uma-categoria.js — cada jogador numa só categoria por prova
 * (rivais do Kids 2). 31/10/2026.
 *
 * O NextCaddy e o golfdirecto publicam a mesma volta em várias classificações:
 * Scratch e Hándicap do mesmo escalão, e o escalão (Alevín) mais a geral
 * (Juvenil, Sub-18, Sub-25). No Kids 2 isso dava duas ou mais linhas do mesmo
 * resultado (Dmitrii Elchaninov, Circuito Juvenil Zona C: Scratch #1 e
 * Hándicap #8). Fica a melhor: scratch antes de hándicap, depois o escalão
 * mais específico; em empate, a primeira. As posições ficam as da fonte.
 */

const HCP_RE = /\bH[aá]ndicap\b|\bHcp\b|\bHdc\b|\bNet[oa]?\b/i;

/** Maior = mais específico (Juvenil/Sub-25 são as gerais). */
function especificidade(escalao) {
  const e = String(escalao || "");
  if (/Benjam[íi]n/i.test(e)) return 100;
  if (/Alev[íi]n/i.test(e)) return 90;
  if (/Infantil/i.test(e)) return 80;
  if (/Cadete/i.test(e)) return 70;
  const sub = /^Sub-?(\d+)$/i.exec(e);
  if (sub) return 70 - Number(sub[1]);   // Sub-12 (58) antes de Sub-18 (52) e Sub-25 (45)
  if (/Junior/i.test(e)) return 50;
  if (/Juvenil/i.test(e)) return 10;
  return 30;
}

const semAcentos = (s) => String(s || "").toLowerCase().normalize("NFKD")
  .replace(/[̀-ͯ]/g, "").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();

/**
 * @param torneios  { [tid]: { ageGroup, categoryName|category, players[] } } — alterado no sítio
 * @param prova     (tid) => chave da prova (ou null: não mexe)
 * @param hcp       (tid, t) => true se for classificação de hándicap
 * @returns nº de linhas de jogador retiradas
 */
function umaCategoriaPorProva(torneios, prova, hcp = (_tid, t) => HCP_RE.test(t.categoryName || t.category || "")) {
  const porProva = new Map();
  for (const tid of Object.keys(torneios)) {
    const k = prova(tid);
    if (k == null) continue;
    if (!porProva.has(k)) porProva.set(k, []);
    porProva.get(k).push(tid);
  }
  let retirados = 0;
  for (const tids of porProva.values()) {
    if (tids.length < 2) continue;
    const valor = (tid) => (hcp(tid, torneios[tid]) ? 0 : 1000) + especificidade(torneios[tid].ageGroup);
    const ordem = [...tids].sort((a, b) => valor(b) - valor(a));   // sort estável: empate fica a primeira
    const vistos = new Set();
    for (const tid of ordem) {
      const t = torneios[tid];
      const antes = t.players.length;
      t.players = t.players.filter((p) => {
        const lic = p.lic || p.license || p.licencia;
        const chave = lic ? `l:${lic}` : `n:${semAcentos(p.n || p.name)}`;
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
      });
      retirados += antes - t.players.length;
      if (t.players.length === 0) delete torneios[tid];
    }
  }
  return retirados;
}

module.exports = { umaCategoriaPorProva, especificidade, HCP_RE };
