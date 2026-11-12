/**
 * scripts/aggregator/util/feds-das-provas.js
 *
 * Federado de cada inscrito, pelas abas da PRÓPRIA prova (inscrições e draws,
 * `fpg-admissions-draws*.json`): «ccode|tcode|ano» → (nome → fed). A
 * classificação traz às vezes um jogador sem número (Ryan Dantas no Nacional
 * Sub 16 2026) e as Entry Lists não trazem nenhum; a prova sabe quem ele é.
 * Nunca se procura o número noutras listas por nome + clube — isso é adivinhar
 * (Mariana, 03/11/2026). Usado pela fonte `fpg` e pelas listas de inscritos.
 */
const { DATA, readJsonSafe } = require("./io");
const { normName } = require("./names");

const chaveProva = (ccode, tcode, data) => `${ccode || "000"}|${tcode}|${String(data || "").slice(0, 4)}`;

function lerFedsDasProvas() {
  const porProva = new Map();
  for (const file of [DATA.fpgAdmissionsDraws, DATA.fpgAdmissionsDrawsDrive]) {
    const data = readJsonSafe(file, { tournaments: [] });
    for (const t of Array.isArray(data?.tournaments) ? data.tournaments : []) {
      if (!t?.tcode || !t.date) continue;
      const k = chaveProva(t.ccode, t.tcode, t.date);
      const nomes = porProva.get(k) || new Map();
      const juntar = (p) => { if (p?.fed && p.nome) nomes.set(normName(p.nome), String(Number(p.fed))); };
      // `saidos` = quem já esteve na lista e saiu (Castro Marim U14, 10/11/2026: a FPG
      // tirou quem tinha HI acima de 6,0). As Entry Lists antigas continuam a tê-los.
      for (const p of t.admissions?.saidos || []) juntar(p);
      for (const p of t.admissions?.players || []) juntar(p);
      for (const ronda of Object.values(t.draws || {})) for (const g of ronda?.groups || []) for (const p of g.players || []) juntar(p);
      if (nomes.size) porProva.set(k, nomes);
    }
  }
  return porProva;
}

/**
 * Licença de OUTRA federação de cada inscrito, pelas abas da própria prova: os
 * estrangeiros não têm federado FPG, mas as inscrições/draws curadas trazem a
 * ficha da RFEG em `_rfeg` (licença, nome canónico, nascimento, sexo, país) —
 * Miramar Internacional Open 2026. «ccode|tcode|ano» → (nome → _rfeg).
 * Sem isto, o «Diego Gross» da classificação ficava numa ficha anónima à parte
 * da do Diego Gross Paneque (12/11/2026).
 */
function lerRfegDasProvas() {
  const porProva = new Map();
  for (const file of [DATA.fpgAdmissionsDraws, DATA.fpgAdmissionsDrawsDrive]) {
    const data = readJsonSafe(file, { tournaments: [] });
    for (const t of Array.isArray(data?.tournaments) ? data.tournaments : []) {
      if (!t?.tcode || !t.date) continue;
      const k = chaveProva(t.ccode, t.tcode, t.date);
      const nomes = porProva.get(k) || new Map();
      const juntar = (p) => { if (p?._rfeg?.licencia && p.nome && !nomes.has(normName(p.nome))) nomes.set(normName(p.nome), p._rfeg); };
      for (const p of t.admissions?.saidos || []) juntar(p);
      for (const p of t.admissions?.players || []) juntar(p);
      for (const ronda of Object.values(t.draws || {})) for (const g of ronda?.groups || []) for (const p of g.players || []) juntar(p);
      if (nomes.size) porProva.set(k, nomes);
    }
  }
  return porProva;
}

/** A ficha RFEG (`_rfeg`) do jogador nas inscrições/draws da mesma prova, ou null. */
function rfegDoJogador(t, pl, rfegDasProvas = new Map()) {
  return rfegDasProvas.get(chaveProva(t.ccode, t.tcode, t.date))?.get(normName(pl?.name)) || null;
}

/** O federado do jogador: o da classificação; sem ele, o das inscrições/draws da mesma prova. */
function fedDoJogador(t, pl, fedsDasProvas = new Map()) {
  if (pl?.fedCode) return String(pl.fedCode);
  return fedsDasProvas.get(chaveProva(t.ccode, t.tcode, t.date))?.get(normName(pl?.name)) || null;
}

module.exports = { lerFedsDasProvas, fedDoJogador, lerRfegDasProvas, rfegDoJogador };
