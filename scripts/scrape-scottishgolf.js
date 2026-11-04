#!/usr/bin/env node
/**
 * scripts/scrape-scottishgolf.js
 *
 * Campeonatos JUVENIS da Scottish Golf → kids2 (04/11/2026, «Sim, a Escócia»):
 * Boys'/Girls' Open (U18), Boys'/Girls' Under 16 Open, Boys'/Girls' Amateur
 * (a fase de stroke play) e o Under 14 Open (misto desde 2024). Todos abertos a
 * estrangeiros — ingleses, irlandeses, nórdicos, espanhóis… que voltam a cruzar-se
 * com o Manuel na Europa.
 *
 * Fonte: a API pública do scottishgolf.org (peças em scripts/lib/scottishgolf.js).
 * O calendário de cada ano dá os campeonatos (TournamentId fixo); a classificação
 * dá posição, clube (dos escoceses) ou país (dos estrangeiros) e as voltas; o
 * cartão de CADA volta dá buraco a buraco, par e distâncias (jardas → metros).
 * Sem data de nascimento nem HCP — fonte FRACA no kids2 (nome + país).
 * Há resultados na API desde 2023; antes disso viviam noutro sistema.
 *
 * Saída: public/data/scottishgolf/{competitionId}.json — JobFile; adapter
 * sources/scottishgolf.js. Só kids2 (não vai à /major).
 *
 * Uso:
 *   node scripts/scrape-scottishgolf.js                 # 2023 em diante
 *   node scripts/scrape-scottishgolf.js --desde 2025
 *   node scripts/scrape-scottishgolf.js --force         # refaz as provas acabadas
 *
 * Uma prova acabada e já gravada não se volta a pedir (sem --force); numa a
 * decorrer só se pedem os cartões que faltam. Pedidos um a um, com pausa.
 * Exit: 0 gravou · 2 nada de novo · 1 erro.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonGuarded } = require("./lib/shrink-guard");
const { CAMPEONATOS, jogadorDaEntrada, cartaoDaVolta, sexoPeloTee, txt } = require("./lib/scottishgolf");

const OUT_DIR = path.join(__dirname, "..", "public", "data", "scottishgolf");
const SG = "https://www.scottishgolf.org";
const PAUSA_MS = 400;
const HEADERS = { "User-Agent": "Mozilla/5.0", Accept: "application/json", "X-Requested-With": "XMLHttpRequest" };

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(caminho, params) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, v == null ? "" : String(v)]));
  const url = `${SG}${caminho}?${qs}`;
  for (let t = 1; ; t++) {
    const r = await fetch(url, { headers: HEADERS });
    if (r.ok) return r.json();
    if (t >= 3 || r.status === 404) throw new Error(`HTTP ${r.status} — ${url}`);
    await dorme(5000 * t);
  }
}

/** O calendário de um ano: só os campeonatos juvenis de CAMPEONATOS. */
async function provasDoAno(ano) {
  const lista = await api("/api/Tournament/GetPastTournaments", {
    clubWebsiteId: 1002, date: `${ano}-12-31`, pageNumber: 1, pageSize: 200,
    memberId: null, regionId: null, tournamentCategoryId: null, subAssociationId: null, excludeInterclubTournaments: false,
  });
  // Em 2026 as fases de match play partilham o TournamentId com o stroke play.
  return (Array.isArray(lista) ? lista : []).filter((t) => CAMPEONATOS[t.TournamentId] && !/match ?play|salver|rosebowl/i.test(t.Name || "")
    && String(t.CompetitionDate || "").startsWith(String(ano)));
}

const classificacao = (competitionId, divisionId) => api("/api/Tournament/GetTournamentLeaderboard", {
  competitionId, competitionTypeId: null, divisionId: divisionId || null, competitionRoundId: null,
  showOnlyCountryName: false, pageNumber: 1, pageSize: 500, includeFavouritePlayers: false,
});

const rotulo = (sex, idade) => `${sex === "M" ? "Boys" : sex === "F" ? "Girls" : "Juniors"} U${idade}`;

/** Par e metros mais frequentes dos cartões de uma divisão. */
function campoDaDivisao(players) {
  const conta = new Map();
  for (const p of players) for (const r of p.rounds) if (r.meters && r.pars) {
    const k = JSON.stringify([r.pars, r.meters]);
    conta.set(k, (conta.get(k) || 0) + 1);
  }
  const best = [...conta.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return {};
  const [par, meters] = JSON.parse(best[0]);
  const metersTotal = meters.reduce((a, b) => a + b, 0);
  return { par, parTotal: par.reduce((a, b) => a + b, 0), meters, metersTotal, teeName: `Tee ${metersTotal}m`, distancias: "convertidas de jardas" };
}

async function raspar(t, anterior) {
  const camp = CAMPEONATOS[t.TournamentId];
  const lb = await classificacao(t.CompetitionId);
  await dorme(PAUSA_MS);
  const entradas = lb.Entries || [];
  if (!entradas.length) return null;

  // Divisões por idade dentro da prova (Girls' U16/U14 2023: «Leading U16»/«Leading U14»)
  const divDe = new Map();
  for (const d of (lb.Divisions || []).filter((d) => d.DivisionId && /U\s?\d+/i.test(d.Name))) {
    const r = await classificacao(t.CompetitionId, d.DivisionId);
    await dorme(PAUSA_MS);
    const idade = +(/U\s?(\d+)/i.exec(d.Name) || [])[1];
    for (const e of r.Entries || []) if (!divDe.has(e.RSEntryId) || idade < divDe.get(e.RSEntryId)) divDe.set(e.RSEntryId, idade);
  }

  // Cartões já gravados (prova a decorrer): só se pede o que falta
  const velhos = new Map();
  for (const dv of (anterior && anterior.divisions) || []) for (const p of dv.players) velhos.set(p.detailId, p.rounds || []);

  const players = [];
  let pedidos = 0;
  for (const e of entradas) {
    const p = jogadorDaEntrada(e);
    const nVoltas = ((e.EntryRound && e.EntryRound.Rounds) || []).length;
    const rondasVelhas = velhos.get(p.detailId) || [];
    for (let i = 0; i < nVoltas; i++) {
      const gross = voltaGrossDe(e, i);
      if (gross == null) continue;
      const velha = rondasVelhas.find((r) => r.day === i + 1 && r.gross === gross && r.scores && r.scores.length === 18);
      if (velha) { p.rounds.push(velha); continue; }
      let c = null;
      try {
        const resp = await api("/api/Score/GetRsScoreV2", { competitionId: t.CompetitionId, rsEntryId: e.RSEntryId, roundNo: i + 1, competitionTypeId: 1 });
        c = cartaoDaVolta(Array.isArray(resp) ? resp[0] : null);
      } catch (err) { console.log(`      ⚠ cartão ${p.name} R${i + 1}: ${err.message}`); }
      pedidos++;
      await dorme(PAUSA_MS);
      const ok = c && c.gross === gross;
      p.rounds.push({
        day: i + 1, gross, scores: ok ? c.scores : [],
        ...(ok ? { f9: c.scores.slice(0, 9).reduce((a, b) => a + b, 0), b9: c.scores.slice(9).reduce((a, b) => a + b, 0), startingHole: c.startingHole } : {}),
        ...(ok && c.par ? { pars: c.par } : {}), ...(ok && c.meters ? { meters: c.meters } : {}),
      });
    }
    p.ageMax = divDe.get(e.RSEntryId) || null;
    players.push(p);
  }

  // Divisões: o escalão do campeonato; U14 misto → por sexo pelo tee
  const grupos = new Map();
  // o sexo do campeonato, ou o da prova no calendário (o U14 de 2023 era só de rapazes, «M»)
  const sexoFixo = camp.sex || (t.Gender === "M" ? "M" : t.Gender === "W" || t.Gender === "F" ? "F" : null);
  const sexo = sexoFixo ? () => sexoFixo : (sexoPeloTee(players) || (() => null));
  for (const p of players) {
    const lab = rotulo(sexo(p), p.ageMax || camp.idade);
    if (!grupos.has(lab)) grupos.set(lab, []);
    grupos.get(lab).push(p);
  }
  const fonte = `${SG}/tournament-leaderboard?tournamentid=${t.TournamentId}&competitionid=${t.CompetitionId}`;
  const divisions = [...grupos.entries()].map(([division, ps]) => {
    if (grupos.size > 1) reposicionar(ps);
    const campo = campoDaDivisao(ps);
    for (const p of ps) { for (const r of p.rounds) delete r.pars; delete p.rsEntryId; delete p.ageMax; }
    return { division, source: fonte, ...campo, players: ps };
  });

  const nome = txt(t.Name);
  return {
    data: {
      tournament: `${nome} ${String(t.CompetitionDate).slice(0, 4)}`,
      year: +String(t.CompetitionDate).slice(0, 4),
      startDate: String(t.CompetitionDate).slice(0, 10),
      endDate: String(t.FinishDate || t.CompetitionDate).slice(0, 10),
      source: fonte,
      course: txt((lb.CourseRounds && lb.CourseRounds[0] && lb.CourseRounds[0].CourseName) || t.ClubName),
      competitionId: String(t.CompetitionId),
      customer: "Scottish Golf",
      finished: !!lb.IsFinished || new Date(String(t.FinishDate || t.CompetitionDate).slice(0, 10)) < new Date(Date.now() - 3 * 864e5),
      divisions,
    },
    pedidos,
  };
}
/** Posições DENTRO da divisão (a classificação da API é a geral): pelo total,
 *  empates com «T»; quem não acabou (MC, WD, DQ…) fica com o rótulo e no fim. */
function reposicionar(ps) {
  const classif = ps.filter((p) => /^T?\d+$/i.test(p.pos) && p.total != null);
  for (const p of classif) {
    const melhor = classif.filter((q) => q.total < p.total).length + 1;
    const empate = classif.filter((q) => q.total === p.total).length > 1;
    p.pos = `${empate ? "T" : ""}${melhor}`;
  }
  ps.sort((a, b) => (classif.includes(a) ? 0 : 1) - (classif.includes(b) ? 0 : 1) || (a.total ?? 9999) - (b.total ?? 9999));
}
function voltaGrossDe(e, i) {
  const s = ((e.EntryRound && e.EntryRound.Rounds) || [])[i];
  const n = Number(txt(s));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const comVoltas = (d) => (d.divisions || []).reduce((n, dv) => n + dv.players.filter((p) => p.roundGross.length).length, 0);

(async () => {
  const desde = Number(arg("--desde") || 2023);
  const force = process.argv.includes("--force");
  const anoActual = new Date().getFullYear();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let gravados = 0, iguais = 0, vazios = 0, erros = 0;
  for (let ano = desde; ano <= anoActual; ano++) {
    let provas;
    try { provas = await provasDoAno(ano); } catch (e) { erros++; console.error(`❌ calendário ${ano}: ${e.message}`); continue; }
    await dorme(PAUSA_MS);
    console.log(`Scottish Golf ${ano}: ${provas.length} campeonato(s) juvenil(is)`);
    for (const t of provas) {
      if (arg("--comp") && String(t.CompetitionId) !== arg("--comp")) continue;
      const file = path.join(OUT_DIR, `${t.CompetitionId}.json`);
      let anterior = null;
      try { anterior = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* novo */ }
      if (anterior && anterior.finished && !force) { iguais++; continue; }
      if (new Date(String(t.CompetitionDate).slice(0, 10)) > new Date()) { vazios++; continue; }
      try {
        const r = await raspar(t, anterior);
        if (!r) { vazios++; console.log(`   ⏭️  ${t.Name}: sem classificação`); continue; }
        const { data, pedidos } = r;
        const semTempo = (d) => JSON.stringify({ ...d, scrapedAt: undefined });
        if (anterior && semTempo(anterior) === semTempo(data)) { iguais++; console.log(`   ⏭️  ${data.tournament}: sem alterações`); continue; }
        data.scrapedAt = new Date().toISOString();
        if (writeJsonGuarded(file, data, { count: comVoltas }).written) {
          gravados++;
          console.log(`   ✅ ${data.tournament} (${data.startDate}, ${data.course}) — ${data.divisions.map((d) => `${d.division}:${d.players.length}`).join(" · ")} · ${pedidos} cartões pedidos`);
        } else erros++;
      } catch (e) {
        erros++;
        console.error(`   ❌ ${t.Name} (${t.CompetitionId}): ${e.message}`);
      }
    }
  }
  console.log(`\n🏁 ${gravados} gravado(s) · ${iguais} sem alterações · ${vazios} sem resultados/futuros · ${erros} erro(s)`);
  process.exitCode = erros && !gravados ? 1 : gravados ? 0 : 2;
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
