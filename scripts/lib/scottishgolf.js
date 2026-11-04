/**
 * scripts/lib/scottishgolf.js — peças puras do scraper da Scottish Golf
 * (scrape-scottishgolf.js), à parte para os testes.
 *
 * A API pública do scottishgolf.org (a mesma das páginas «tournament-leaderboard»):
 *   /api/Tournament/GetPastTournaments   → o calendário de um ano (TournamentId fixo por campeonato)
 *   /api/Tournament/GetTournamentLeaderboard → classificação (posição, «Apelido, Nome», clube
 *                                          dos escoceses / PAÍS dos estrangeiros, voltas)
 *   /api/Score/GetRsScoreV2              → o cartão de uma volta: pancadas, par e distância
 *                                          por buraco (JARDAS — sem SI, sem CR/Slope)
 */
"use strict";

/** Campeonatos juvenis em stroke play: TournamentId → escalão (sexo + idade máxima).
 *  Os «Match Play» (66855…), as equipas (Area Team, Home Internationals) e os
 *  adultos ficam de fora. O U14 é misto desde 2024 (Gender «A»). */
const CAMPEONATOS = {
  7: { nome: "Scottish Boys' Open Championship", sex: "M", idade: 18 },
  5: { nome: "Scottish Girls' Open Championship", sex: "F", idade: 18 },
  12: { nome: "Scottish Boys' Under 16 Open Championship", sex: "M", idade: 16 },
  16: { nome: "Scottish Girls' Under 16 Open Championship", sex: "F", idade: 16 },
  13: { nome: "Scottish Boys' Amateur Championship", sex: "M", idade: 18 },
  14: { nome: "Scottish Girls' Amateur Championship", sex: "F", idade: 18 },
  15: { nome: "Scottish Under 14 Open Championship", sex: null, idade: 14 },
};

const txt = (h) => String(h ?? "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

/** Bandeira do clubhouse («…/countries/gb-sct.png», «eng.png», «ie.png») → código do site. */
function paisDaBandeira(url) {
  const c = (/\/countries\/([a-z-]+)\.png/i.exec(String(url || "")) || [])[1];
  if (!c) return null;
  const k = c.toLowerCase();
  const uk = { eng: "GB-ENG", "gb-eng": "GB-ENG", sct: "GB-SCT", "gb-sct": "GB-SCT", sco: "GB-SCT", wal: "GB-WLS", wls: "GB-WLS", "gb-wls": "GB-WLS", nir: "GB-NIR", "gb-nir": "GB-NIR", uk: "GB", gb: "GB" };
  return uk[k] || (k.length === 2 ? k.toUpperCase() : k.toUpperCase());
}

/** A coluna «ClubCountry» traz o CLUBE dos escoceses e o PAÍS dos estrangeiros. */
const PAISES_EM_INGLES = /^(england|scotland|wales|northern ireland|ireland|united kingdom|great britain|[a-z .'-]+ (republic|islands|emirates|states))$/i;
function clubeDe(e) {
  const c = txt(e.ClubCountry);
  if (!c) return null;
  if (/golf|club|links|\bgc\b|\bg&cc\b|\bgolfclub\b/i.test(c)) return c;
  // sem «Golf/Club» no nome: é um país se a bandeira não for a da Escócia
  if (PAISES_EM_INGLES.test(c)) return null;
  return paisDaBandeira(e.CountryFlag) === "GB-SCT" ? c : null;
}

/** «78» / «<a …>69</a>» / «-» → número ou null. */
const voltaGross = (s) => { const n = Number(txt(s)); return Number.isFinite(n) && n > 0 ? n : null; };

/** Linha da classificação → jogador JobFile (sem os cartões). */
function jogadorDaEntrada(e) {
  const pos = txt(e.NoHTML);
  const toParTxt = txt(e.ToPar);
  const roundGross = ((e.EntryRound && e.EntryRound.Rounds) || []).map(voltaGross).filter((g) => g != null);
  const total = Number(txt(e.EntryRound && e.EntryRound.RoundTotal));
  const nome = (e.PlayerNames && e.PlayerNames[0]) || txt(e.DisplayName).split(",").reverse().join(" ");
  return {
    pos: /^\d+$/.test(pos) ? pos : /^T\d+$/i.test(pos) ? pos.toUpperCase() : pos.toUpperCase() || "",
    name: txt(nome).replace(/\s+/g, " "),
    country: paisDaBandeira(e.CountryFlag),
    club: clubeDe(e),
    detailId: `sg${e.RSEntryId}`,
    rsEntryId: e.RSEntryId,
    toPar: /^[+-]?\d+$/.test(toParTxt) ? Number(toParTxt) : /^E$/i.test(toParTxt) ? 0 : null,
    total: Number.isFinite(total) && total > 0 ? total : null,
    roundGross,
    rounds: [],
  };
}

/** Cartão de uma volta (GetRsScoreV2[0]) → { scores, par, yards, startingHole } — null se vazio. */
function cartaoDaVolta(c) {
  if (!c || c.ScoresHidden) return null;
  const h = Array.from({ length: 18 }, (_, i) => i + 1);
  const scores = h.map((i) => Number(c[`Gross${i}`]) || 0);
  if (!scores.some((x) => x > 0)) return null;
  const par = h.map((i) => Number(c[`Par${i}`]) || null);
  const dist = h.map((i) => Number(c[`Dist${i}`]) || null);
  // a unidade vem vazia nas provas escocesas (jardas); «m»/«Metres» → metros
  const metros = /^m/i.test(String(c.DistUnit || ""));
  return {
    scores,
    par: par.every((p) => p) ? par : null,
    meters: dist.every((d) => d) ? dist.map((d) => (metros ? d : Math.round(d * 0.9144))) : null,
    startingHole: Number(c.StartTee) === 10 ? 10 : 1,
    gross: scores.reduce((a, b) => a + b, 0),
  };
}

/** Sexo no U14 misto pelo tee: o mais comprido é o dos rapazes (como o Faldo
 *  Madeira, onde o GG também não diz sexo). Só com DOIS tees distintos. */
function sexoPeloTee(jogadores) {
  const dist = (p) => (p.rounds.find((r) => r.meters) || {}).meters;
  const totais = [...new Set(jogadores.map((p) => { const m = dist(p); return m ? m.reduce((a, b) => a + b, 0) : null; }).filter(Boolean))].sort((a, b) => a - b);
  if (totais.length !== 2) return null;
  const [curto, longo] = totais;
  return (p) => { const m = dist(p); const t = m ? m.reduce((a, b) => a + b, 0) : null; return t === longo ? "M" : t === curto ? "F" : null; };
}

module.exports = { CAMPEONATOS, txt, paisDaBandeira, clubeDe, jogadorDaEntrada, cartaoDaVolta, sexoPeloTee };
