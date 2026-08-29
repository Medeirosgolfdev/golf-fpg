#!/usr/bin/env node
/**
 * build-om-cgss-junior.js — Ordem de Mérito JÚNIOR do CG Santo da Serra 2026.
 *
 * A FPG publica as 4 Ordens de Mérito adultas do CGSS (Homens/Senhoras/Seniores/
 * Super Seniores) em scoring.datagolf.pt, mas **não publica a categoria Júnior**
 * (0-18, sem distinção de género). Este script constrói-a segundo o
 * "Regulamento Ordens de Mérito CGSS 2026 by NOS Madeira"
 * (docs/reference/Regulamento-OM-CGSS-NOS-2026.pdf).
 *
 * ── Como se auto-mantém ──
 * A lista de provas que contam (e o seu NÍVEL A/B/C) é DERIVADA das próprias
 * OMs adultas oficiais: percorre-se o detalhe (RankingsPlayersLST) das 4
 * categorias e recolhe-se o conjunto {prova, data, nível}. O nível sai do par
 * (posição → pontos) confrontado com a tabela do regulamento. Assim, quando a
 * Comissão Técnica acrescenta um torneio à OM, a categoria Júnior acompanha
 * sozinha — sem lista hardcoded. (Os "Torneios Juniores exclusivos" são de 9
 * buracos e, por decisão do clube, NÃO contam — e como os adultos não os jogam,
 * nunca entram por esta via.)
 *
 * ── Cálculo (regulamento) ──
 *   · Júnior = idade ≤ 18 à data da prova (nascido ≥ ano−18).
 *   · Em cada prova, ordenam-se os juniores por GROSS (empates partilham lugar;
 *     sem cartão/NR não pontua) → posição na categoria júnior.
 *   · Pontos pela tabela Nível×Posição (A/B/C).
 *   · Total = soma das provas. (Regra 7.1: no ranking FINAL descontam-se as 3
 *     piores pontuações — só relevante no fim da época; replicamos o site, que
 *     soma tudo até lá. `bestDrop3` fica calculado à parte para o fecho.)
 *   · Só sócios com homeclub CGSS podem GANHAR (rule 1) — os restantes aparecem
 *     no ranking mas levam `canWin:false` (igual às OMs adultas, que listam
 *     Palheiro/Exército/etc.).
 *   · Desempate 1º (rule 4): melhor resultado na última prova; depois HCP WHS
 *     mais baixo. Aplicado só como ordenação secundária.
 *
 * Fonte de dados: scoring.datagolf.pt (cookies DATAGOLF_SCORING_COOKIES /
 * api/.scoring-datagolf-cookies.json). Sem esses cookies não corre.
 *
 * OUTPUT: public/data/om-cgss-junior.json
 * EXIT: 0 = escrito/atualizado · 2 = sem alterações · 1 = erro
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");
const { lisbonCivilDayStr } = require("../lib/helpers");

const REPO = path.resolve(__dirname, "..");
const OUT = path.join(REPO, "public", "data", "om-cgss-junior.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BASE = "https://scoring.datagolf.pt/pt";
const CLUB = "007";                 // CG Santo da Serra
const ACK = "8428ACK987";
const YEAR = parseInt(argVal("--year", "2026"), 10);
const YY = String(YEAR % 100).padStart(2, "0");
const MAX_JUNIOR_AGE = 18;

function argVal(f, d) { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; }

/* Ordens de Mérito adultas oficiais (para derivar provas+nível e para os links). */
const ADULT_RANKINGS = [
  { code: `OMCGSSH${YY}`,    key: "homens",        label: "Homens" },
  { code: `OMCGSSL${YY}`,    key: "senhoras",      label: "Senhoras" },
  { code: `OMCGSSsen${YY}`,  key: "seniores",      label: "Seniores" },
  { code: `OMCGSSspsn${YY}`, key: "superSeniores", label: "Super Seniores" },
];
const rankingUrl = code => `https://scoring.datagolf.pt/pt/rankings_classif.aspx?ccode=${CLUB}&ranking=${code}`;

/* ── Provas OM já DISPUTADAS mas ainda NÃO lançadas nas OMs adultas oficiais ──
 * O build deriva a lista de provas (e o nível) das OMs adultas. Quando uma prova
 * acaba de ser jogada, o clube ainda não a lançou lá — mas os resultados já
 * existem no scoring. Estas entradas incluem-na JÁ, com o nível pelo regulamento
 * (a mesma tabela que a UI usa em OM_LEVELS/OM_CALENDAR, fpgOmRanking.tsx). Só é
 * preciso {tcode, level}: nome/data/campo vêm da própria TournamentsLST por
 * tcode. Assim que a prova entrar nas OMs adultas, o passo 2 mapeia o MESMO
 * tcode e o guard de dedup evita duplicar (a versão derivada ganha). Remover a
 * entrada aqui é então opcional (o dedup trata; fica só como documentação).
 *   RALI 2026 (007/11050) = Nível C (regulamento).
 *   8º Torneio CGSS OM NOS 2026 (007/11057, 29-08) = Nível C (confirmado pela
 *   Mariana; jogado hoje, ainda não lançado nas OMs adultas). */
const PENDING_EVENTS = [
  { tcode: "11050", level: "C" },
  { tcode: "11057", level: "C" },
];

/* Tabela de pontos do regulamento (Nível × posição). 11–15 e 16–20 em faixas. */
const PTS = {
  A: { 1:25,2:20,3:18,4:14,5:13,6:10,7:9,8:8,9:7,10:6 },
  B: { 1:20,2:16,3:14,4:11,5:10,6:8,7:7,8:6,9:5,10:4 },
  C: { 1:15,2:12,3:10,4:8,5:7,6:6,7:5,8:4,9:3,10:2 },
};
const BAND = { A: { "11-15":3, "16-20":1 }, B: { "11-15":2, "16-20":1 }, C: { "11-15":1, "16-20":1 } };
function points(level, pos) {
  if (!level || !pos) return 0;
  if (PTS[level][pos] != null) return PTS[level][pos];
  if (pos >= 11 && pos <= 15) return BAND[level]["11-15"];
  if (pos >= 16 && pos <= 20) return BAND[level]["16-20"];
  return 0;
}
/** Nível compatível com um par (posição, pontos) — para inferir o nível da prova. */
function levelsFor(pos, pts) {
  const out = [];
  for (const lv of ["A", "B", "C"]) if (points(lv, pos) === pts && pts > 0) out.push(lv);
  return out;
}

/* ── cookies ── */
function loadCookie() {
  if (process.env.DATAGOLF_SCORING_COOKIES) return process.env.DATAGOLF_SCORING_COOKIES;
  const fp = path.join(REPO, "api", ".scoring-datagolf-cookies.json");
  if (fs.existsSync(fp)) { const j = JSON.parse(fs.readFileSync(fp, "utf8")); return j.cookieHeader || j.cookie || ""; }
  return "";
}
const COOKIE = loadCookie();

/* ── federados: nome → dob/clube/género (para identificar juniores) ── */
const norm = s => (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
function birthYear(b) {
  if (!b) return null;
  if (String(b).includes("Date(")) { const m = /Date\((\d+)/.exec(b); if (m) return new Date(+m[1]).getUTCFullYear(); }
  const m = /(\d{4})/.exec(b); return m ? +m[1] : null;
}
/* ── Roster CGSS júnior = pool de "potenciais pontuadores" da OM ──
 * O que a /jogadores mostra com o filtro Santo da Serra + Sub-18 e abaixo:
 * todos os federados com homeclub CGSS e idade ≤ 18 (nascidos ≥ ano−18).
 * Ancorar aqui (em vez de casar nomes contra TODOS os federados) elimina as
 * colisões de nome — um homónimo de outro clube nunca entra, porque só as
 * entradas do roster contam. */
const CGSS_CLUB = "santo da serra";
const roster = [];                 // [{fed,name,by,age,esc,gender}] — só ≤18 (categoria Júnior)
const rosterByName = new Map();    // normName → [rosterEntry]  (array: homonímias raras)
const omMembers = {};              // fed → catKey — TODOS os sócios CGSS, por categoria (mesmo sem pontos)

/** Categoria da OM de um sócio CGSS pelo escalão etário + sexo (regulamento):
 *  Júnior 0-18 · Senhoras F 19+ · Homens M 19-49 · Seniores M 50-69 · Super Sen. M 70+. */
function omCategoryOf(age, gender) {
  if (age == null) return null;
  if (age <= MAX_JUNIOR_AGE) return "junior";
  if (norm(gender) === "f") return "senhoras";
  if (age <= 49) return "homens";
  if (age <= 69) return "seniores";
  return "superSeniores";
}
(function loadRoster() {
  const players = JSON.parse(fs.readFileSync(path.join(REPO, "public", "data", "federados.json"), "utf8")).players || [];
  for (const p of players) {
    if (!norm(p.acronym).includes(CGSS_CLUB)) continue;
    const by = birthYear(p.birthdate);
    if (!by) continue;
    const age = YEAR - by;
    const cat = omCategoryOf(age, p.gender);
    if (cat) omMembers[String(p.federation_code)] = cat;   // pill do escalão, mesmo sem pontos
    if (age > MAX_JUNIOR_AGE) continue;                     // roster júnior = só ≤18
    const e = { fed: String(p.federation_code), name: p.name, by, age, esc: p.age_level || null, gender: p.gender || null };
    roster.push(e);
    const n = norm(p.name);
    if (!rosterByName.has(n)) rosterByName.set(n, []);
    rosterByName.get(n).push(e);
  }
  roster.sort((a, b) => a.age - b.age || a.name.localeCompare(b.name));
})();

/** Casa um jogador do campo → entrada do roster CGSS (ou null). Guarda: só casa
 *  entradas cujo CLUBE na prova é o CGSS, para um namesake de outro clube nunca
 *  ser atribuído a um júnior do roster. */
function matchRoster(fieldName, fieldClub, fieldAge) {
  if (!norm(fieldClub).includes(CGSS_CLUB)) return null;
  const arr = rosterByName.get(norm(fieldName));
  if (!arr || !arr.length) return null;
  if (arr.length === 1) return arr[0];
  if (Number.isFinite(fieldAge) && fieldAge > 0)
    return arr.slice().sort((a, b) => Math.abs(a.age - fieldAge) - Math.abs(b.age - fieldAge))[0];
  return arr[0];
}

/* ── HTTP ── */
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* ⚠ Os DOIS endpoints datam as provas de maneira diferente — medido contra o
 * pull-torneios (fonte já corrigida), com um caso de cada lado no verão:
 *   · `started_at` (TournamentsLST) = meia-noite em hora de LISBOA → no horário
 *     de verão são 23:00 UTC do dia anterior e o toISOString() dava dia −1
 *     (RALI 01-08 saía 31-07; o 8º CGSS OM NOS de 29-08 saía 28-08).
 *   · `tourn_date` (RankingsPlayersLST) já vem no dia civil em UTC — passá-lo
 *     por lisbonCivilDayStr empurrava-o um dia para a FRENTE (NOS Empresas
 *     22-05 virava 23-05).
 * Daí dois helpers. A data PUBLICADA vem sempre do `started_at`. */
const isoDate = s => { const m = /Date\((\d+)/.exec(s || ""); return m ? new Date(+m[1]).toISOString().slice(0, 10) : (s || null); };
const isoDateStart = s => { const m = /Date\((\d+)/.exec(s || ""); return m ? lisbonCivilDayStr(+m[1]) : (s || null); };

async function warmupClassif(tc) {
  try { const r = await fetch(`${BASE}/linkpage.aspx?page=classif&club=${CLUB}&tourn=${tc}&ack=${ACK}`, { headers: { "User-Agent": UA, Cookie: COOKIE, Referer: "https://scoring.datagolf.pt/" }, redirect: "follow" }); await r.text(); } catch {}
}
async function pageMethod(pageAsp, method, params, referer) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${BASE}/${pageAsp}/${method}?${qs}`, {
    method: "POST",
    headers: {
      "User-Agent": UA, Cookie: COOKIE, "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest", "Accept": "application/json, text/javascript, */*; q=0.01",
      "Origin": "https://scoring.datagolf.pt", "Referer": referer || `${BASE}/tournaments.aspx`,
    },
    body: JSON.stringify(params),
  });
  if (!r.ok) return { error: `http-${r.status}`, records: [] };
  const j = await r.json(); const d = j.d || j;
  if (d.Result !== "OK") return { error: d.Message || d.Result, records: [] };
  return { records: d.Records || [], total: d.TotalRecordCount };
}
const rankLST = (method, params) => pageMethod("rankings_classif.aspx", method, { jtStartIndex: "0", jtPageSize: "500", ...params }, `${BASE}/linkpage.aspx?page=rankingresult&club=${CLUB}&ranking=${params.Rk_Code}&ack=${ACK}`);
async function classifLST(tc) {
  await warmupClassif(tc);
  const body = { Classi:"1", tclub:CLUB, tcode:String(tc), classiforder:"1", classiftype:"I", classifroundtype:"D",
    scoringtype:"1", round:"1", members:"0", playertypes:"0", gender:"0", minagemen:"0", maxagemen:"999",
    minageladies:"0", maxageladies:"999", minhcp:"-8", maxhcp:"99", idfilter:"-1",
    jtStartIndex:"0", jtPageSize:"400", jtSorting:"score_id DESC" };
  return pageMethod("classif.aspx", "ClassifLST", body, `${BASE}/classif.aspx?ccode=${CLUB}&tcode=${tc}`);
}
async function tournamentsLST(startIndex) {
  // pageSize ≤ 100 obrigatório (≥200 → HTTP 500)
  const body = { ClubCode: CLUB, dtIni: `${YEAR}-01-01`, dtFim: `${YEAR}-12-31`, CourseName: "", TournCode: "", TournName: "",
    jtStartIndex: String(startIndex), jtPageSize: "50", jtSorting: "started_at DESC" };
  return pageMethod("tournaments.aspx", "TournamentsLST", body, `${BASE}/tournaments.aspx`);
}

/* ── main ── */
(async () => {
  if (!COOKIE) { console.error("[om-junior] sem cookies (DATAGOLF_SCORING_COOKIES / api/.scoring-datagolf-cookies.json)"); process.exit(1); }

  // 1. Derivar provas OM + nível a partir das OMs adultas oficiais.
  console.log("[om-junior] a derivar provas da OM adulta oficial…");
  const omEvents = new Map(); // key `${desc}|${date}` → {desc,date,levelVotes,cats}
  const officialLinks = {};
  const adultRankings = {}; // key → [{name,fed,pos,pts}] (roster para a coluna do draw)
  for (const rk of ADULT_RANKINGS) {
    officialLinks[rk.key] = rankingUrl(rk.code);
    const cls = await rankLST("RankingsClassifLST", { Club: CLUB, Rk_Code: rk.code });
    if (cls.error) { console.warn(`[om-junior]   ${rk.code}: ${cls.error}`); continue; }
    adultRankings[rk.key] = cls.records.map(p => ({ name: p.name, fed: String(p.federated_code), pos: p.rk_pos, pts: p.points_real }));
    for (const p of cls.records) {
      const det = await rankLST("RankingsPlayersLST", { Club: CLUB, Rk_Code: rk.code, fed_code: p.federated_code });
      for (const d of det.records) {
        const desc = (d.tournament_desc || "").trim();
        const date = isoDate(d.tourn_date);
        const key = `${norm(desc)}|${date}`;
        if (!omEvents.has(key)) omEvents.set(key, { desc, date, votes: { A:0,B:0,C:0 } });
        const lv = levelsFor(d.rk_pos, d.rank_points);
        if (lv.length === 1) omEvents.get(key).votes[lv[0]]++;
      }
      await sleep(12);
    }
    console.log(`[om-junior]   ${rk.code}: ${cls.records.length} jogadores`);
  }
  const events = [...omEvents.values()].map(e => {
    const level = ["A","B","C"].sort((a,b) => e.votes[b] - e.votes[a])[0];
    const decided = e.votes.A || e.votes.B || e.votes.C;
    return { desc: e.desc, date: e.date, level: decided ? level : null };
  }).filter(e => e.level).sort((a,b) => (a.date||"").localeCompare(b.date||""));
  console.log(`[om-junior] ${events.length} provas OM (níveis derivados).`);

  // 2. Mapear cada prova → tcode real via TournamentsLST(007).
  const tourns = [];
  for (let si = 0, total = Infinity; si < total; si += 50) {
    const { records, total: t, error } = await tournamentsLST(si);
    if (error) { console.warn(`[om-junior] TournamentsLST @${si}: ${error}`); break; }
    total = t || records.length; tourns.push(...records);
    if (!records.length) break;
  }
  // ⚠ O record do TournamentsLST usa `description` (não `name`) e `course_description`.
  const tName = t => t.description || t.name || "";
  // A chave casa `tourn_date` (dia civil UTC) com `started_at`; como os dois
  // campos discordam em um dia no verão, regista-se a prova nas DUAS datas.
  const byKey = new Map();
  for (const t of tourns) {
    for (const d of new Set([isoDate(t.started_at), isoDateStart(t.started_at)])) {
      if (d && !byKey.has(`${norm(tName(t))}|${d}`)) byKey.set(`${norm(tName(t))}|${d}`, t);
    }
  }
  for (const ev of events) {
    const t = byKey.get(`${norm(ev.desc)}|${ev.date}`) || tourns.find(x => norm(tName(x)) === norm(ev.desc));
    ev.tcode = t ? String(t.code) : null;
    ev.ccode = t ? String(t.club_code || CLUB).padStart(3, "0") : CLUB;
    ev.course = t ? (t.course_description || null) : null;
    if (t) ev.date = isoDateStart(t.started_at); // data autoritativa (dia civil de Lisboa)
  }
  const playable = events.filter(e => e.tcode);
  console.log(`[om-junior] ${playable.length}/${events.length} provas mapeadas a tcode real.`);

  // 2b. Juntar as provas PENDENTES (já jogadas, ainda não nas OMs adultas).
  // Metadados vêm da TournamentsLST por tcode; nível pelo regulamento. Dedup por
  // tcode: se o passo 2 já mapeou esta prova (= já entrou na OM adulta), salta-se.
  for (const pe of PENDING_EVENTS) {
    if (playable.some(e => String(e.tcode) === String(pe.tcode))) continue;
    const t = tourns.find(x => String(x.code) === String(pe.tcode));
    if (!t) { console.warn(`[om-junior] pendente t${pe.tcode}: não está na TournamentsLST(${CLUB}) — ignorada`); continue; }
    playable.push({
      desc: tName(t), date: isoDateStart(t.started_at), level: pe.level,
      tcode: String(pe.tcode), ccode: String(t.club_code || CLUB).padStart(3, "0"),
      course: t.course_description || null, pending: true,
    });
    console.log(`[om-junior] + prova pendente (ainda não na OM adulta): "${tName(t)}" [${pe.level}] t${pe.tcode} ${isoDateStart(t.started_at)}`);
  }
  playable.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  // 3. Para cada prova: campo → juniores → posição por gross → pontos.
  const players = new Map(); // fed → registo
  for (const ev of playable) {
    const { records, error } = await classifLST(ev.tcode);
    if (error) { console.warn(`[om-junior]   ${ev.desc} (${ev.tcode}): ${error}`); ev.juniors = []; continue; }
    const juniors = [];
    for (const r of records) {
      const gross = Number(r.gross_total);
      if (!(Number.isFinite(gross) && gross > 0)) continue;
      // Só juniores do ROSTER CGSS (com o clube da prova a bater no CGSS).
      const e = matchRoster(r.player_name, r.player_club_description, Number(r.player_age));
      if (!e) continue;
      juniors.push({ fed: e.fed, name: e.name, club: "Santo da Serra", gender: e.gender, gross });
    }
    juniors.sort((a, b) => a.gross - b.gross);
    let pos = 0, prev = null, seen = 0;
    for (const jp of juniors) {
      seen++; if (prev === null || jp.gross !== prev) { pos = seen; prev = jp.gross; }
      jp.pos = pos; jp.pts = points(ev.level, pos);
      if (!players.has(jp.fed)) players.set(jp.fed, { fed: jp.fed, name: jp.name, club: jp.club, gender: jp.gender, canWin: /santo da serra/i.test(jp.club || ""), events: [], total: 0 });
      const rp = players.get(jp.fed);
      rp.events.push({ tcode: ev.tcode, ccode: ev.ccode, name: ev.desc, date: ev.date, level: ev.level, pos, gross: jp.gross, pts: jp.pts });
      rp.total += jp.pts;
    }
    ev.juniors = juniors.map(j => ({ fed: j.fed, name: j.name, club: j.club, gross: j.gross, pos: j.pos, pts: j.pts }));
    console.log(`[om-junior]   ${ev.date} ${ev.desc} [${ev.level}] → ${juniors.length} juniores`);
  }

  // 4. Ranking + desempate (rule 4). bestDrop3 para o fecho de época.
  const lastEventDate = playable.reduce((m, e) => e.date > m ? e.date : m, "");
  const ranking = [...players.values()].map(p => {
    const scores = p.events.map(e => e.pts).sort((a, b) => a - b);
    const bestDrop3 = scores.slice(3).reduce((a, b) => a + b, 0); // total sem as 3 piores
    const lastEv = p.events.find(e => e.date === lastEventDate);
    return { ...p, played: p.events.length, bestDrop3, lastResult: lastEv ? lastEv.pos : null };
  }).sort((a, b) => b.total - a.total || (a.lastResult || 99) - (b.lastResult || 99) || a.name.localeCompare(b.name));
  // posição com empates partilhados
  let rpos = 0, rprev = null, rseen = 0;
  for (const p of ranking) { rseen++; if (rprev === null || p.total !== rprev) { rpos = rseen; rprev = p.total; } p.rank = rpos; }

  const out = {
    generated: new Date().toISOString(),
    season: YEAR,
    title: "Ordem de Mérito Júnior — CG Santo da Serra",
    subtitle: `by NOS Madeira · categoria Júnior (0-${MAX_JUNIOR_AGE}, sem distinção de género)`,
    regulamento: "docs/reference/Regulamento-OM-CGSS-NOS-2026.pdf",
    source: "scoring.datagolf.pt (derivado das OMs adultas oficiais + ClassifLST por prova)",
    method: "Pool = roster CGSS Sub-18 e abaixo (federados, homeclub CGSS). Em cada prova, posição por gross entre os juniores do roster presentes; pontos Nível(A/B/C)×posição; total soma as provas (regra 7.1 desconta 3 piores no fecho).",
    points: PTS, bands: BAND,
    officialAdultRankings: officialLinks,
    adultLabels: { homens: "Homens", senhoras: "Senhoras", seniores: "Seniores", superSeniores: "Super Sen." },
    adultRankings, // roster das 4 categorias adultas (para a coluna OM do draw)
    omMembers,     // fed → categoria OM de TODOS os sócios CGSS (dá o pill do escalão mesmo sem pontos)
    eligibleCount: roster.length,
    eligible: roster.map(e => ({ fed: e.fed, name: e.name, age: e.age, escalao: e.esc, gender: e.gender })),
    events: playable.map(e => ({ tcode: e.tcode, ccode: e.ccode, name: e.desc, date: e.date, level: e.level, course: e.course, nJuniors: (e.juniors || []).length, juniors: e.juniors || [], ...(e.pending ? { pending: true } : {}) })),
    ranking,
  };

  // ── PROTECÇÃO DE DADOS ──────────────────────────────────────────────────
  // Nunca sobrescrever um om-cgss-junior.json bom por um vazio. Se a derivação
  // falhou em bloco (cookies scoring.datagolf.pt expirados / servidor a devolver
  // HTTP 500 em tudo → 0 provas, 0 juniores) mas já existe um ficheiro com
  // ranking, preservar o antigo e sair com ERRO (1) — NÃO é "sem alterações".
  // Sem isto, um run com cookies expirados (incl. o cron semanal) apagava a OM.
  if (playable.length === 0 || ranking.length === 0) {
    let prevN = 0;
    if (fs.existsSync(OUT)) { try { prevN = (JSON.parse(fs.readFileSync(OUT, "utf8")).ranking || []).length; } catch {} }
    if (prevN > 0) {
      console.error(`[om-junior] ERRO: resultado vazio (${playable.length} provas, ${ranking.length} juniores) — provável cookies expirados / HTTP 500 no scoring.datagolf.pt. O ficheiro actual tem ${prevN} juniores; NÃO sobrescrevo. (exit 1)`);
      process.exit(1);
    }
  }

  // escrita só-se-mudou (ignora `generated`)
  let changed = true;
  if (fs.existsSync(OUT)) {
    try { const prev = JSON.parse(fs.readFileSync(OUT, "utf8")); const a = { ...prev, generated: 0 }, b = { ...out, generated: 0 }; changed = JSON.stringify(a) !== JSON.stringify(b); } catch {}
  }
  if (!changed) { console.log("[om-junior] sem alterações — não escrevo."); process.exit(2); }
  writeJsonAtomic(OUT, out);
  console.log(`[om-junior] ✓ ${OUT} — ${ranking.length} juniores, ${playable.length} provas.`);
  const man = ranking.find(p => p.fed === "52884"), mar = ranking.find(p => p.fed === "40990");
  if (man) console.log(`[om-junior]   Manuel: ${man.total} pts (${man.played} provas), ${man.rank}º`);
  if (man && mar) console.log(`[om-junior]   Manuel×Maria Câmara: ${man.total} vs ${mar.total} ${man.total === mar.total ? "(empate ✓)" : ""}`);
})().catch(e => { console.error("[om-junior] ERRO:", e); process.exit(1); });
