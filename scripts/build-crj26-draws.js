#!/usr/bin/env node
/**
 * build-crj26-draws.js
 *
 * Gera os ficheiros do Campeonato Regional de Jovens 2026 (Santo da Serra).
 * Santo da Serra não publica este torneio em datagolf — os draws chegam por
 * email em PDF. Este script transcreve esses PDFs para JSON no formato que
 * a FPGPage já consome.
 *
 * Fontes:
 *   uploads/Draw_CRJ26_S10 a S12.pdf
 *   uploads/Draw_CRJ26_S14 a S24.pdf
 *   uploads/Regulamento CRJ 2026 (1).pdf
 *
 * Output:
 *   public/data/jovens_2026.json           — skeleton pre-jogo (players: [])
 *   public/data/fpg-admissions-draws.json  — +2 entradas com admissions + draws R1
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");

// ─── Fed lookup ───────────────────────────────────────────────────────
const federados = JSON.parse(fs.readFileSync(path.join(DATA, "federados.json"), "utf8"));
const playersJson = JSON.parse(fs.readFileSync(path.join(DATA, "players.json"), "utf8"));

const norm = s => (s || "")
  .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const byName = new Map(); // norm → {fed,name,club}

// players.json is an object: fed → { name, club{code,long,short}, dob, ... }
for (const [fed, p] of Object.entries(playersJson)) {
  if (p?.name) {
    const club = typeof p.club === "string" ? p.club : (p.club?.short || p.club?.long);
    byName.set(norm(p.name), { fed, name: p.name, club });
  }
}
for (const p of (federados.players || [])) {
  const key = norm(p.name);
  if (!byName.has(key) && p.federation_code) {
    byName.set(key, { fed: p.federation_code, name: p.name, club: p.club_name });
  }
}

const resolveFed = (nome) => {
  const hit = byName.get(norm(nome));
  return hit ? hit.fed : null;
};

// ─── Dados extraídos dos PDFs ─────────────────────────────────────────
// Sub 10/12 — Campo "Santo da Serra - Serras-Serras", 9H, 16 jog.
const SUB1012 = [
  { tee: "13:20", hole: 1, t: "Verdes", nome: "Manuel Goulartt Medeiros", club: "Santo da Serra", hcp: 10.0,  jogo: 1  },
  { tee: "13:20", hole: 1, t: "Verdes", nome: "Vicente Rodrigues",        club: "Palheiro",       hcp: 35.7,  jogo: 14 },
  { tee: "13:30", hole: 1, t: "Roxas",  nome: "Henrique Santana",         club: "Santo da Serra", hcp: 30.7,  jogo: 9  },
  { tee: "13:30", hole: 1, t: "Roxas",  nome: "Maximilian Luckhardt",     club: "Palheiro",       hcp: 45.1,  jogo: 16 },
  { tee: "13:40", hole: 1, t: "Roxas",  nome: "Afonso Aniceto",           club: "Santo da Serra", hcp: 41.5,  jogo: 14 },
  { tee: "13:40", hole: 1, t: "Roxas",  nome: "Daniel Augusto",           club: "PXO Clube",      hcp: 49.7,  jogo: 18 },
  { tee: "13:40", hole: 1, t: "Verdes", nome: "Íris Costa",               club: "Palheiro",       hcp: 39.2,  jogo: 17 },
  { tee: "13:50", hole: 1, t: "Roxas",  nome: "Dominic Kowalczewski",     club: "Santo da Serra", hcp: 50.8,  jogo: 19 },
  { tee: "13:50", hole: 1, t: "Roxas",  nome: "Gastão Thomaz Medeiros",   club: "Santo da Serra", hcp: 54.0,  jogo: 20 },
  { tee: "13:50", hole: 1, t: "Roxas",  nome: "Mikhail Bugaev",           club: "Palheiro",       hcp: 52.8,  jogo: 20 },
  { tee: "14:00", hole: 1, t: "Roxas",  nome: "Artur Sobrinho",           club: "Santo da Serra", hcp: 54.0,  jogo: 20 },
  { tee: "14:00", hole: 1, t: "Roxas",  nome: "Maria Do Carmo Mendes",    club: "Santo da Serra", hcp: 54.0,  jogo: 21 },
  { tee: "14:00", hole: 1, t: "Roxas",  nome: "Matilde Teixeira",         club: "Palheiro",       hcp: 54.0,  jogo: 21 },
  { tee: "14:10", hole: 1, t: "Verdes", nome: "Benedita Carvalho",        club: "Santo da Serra", hcp: 54.0,  jogo: 25 },
  { tee: "14:10", hole: 1, t: "Verdes", nome: "Laura Temtem",             club: "Santo da Serra", hcp: 54.0,  jogo: 25 },
  { tee: "14:10", hole: 1, t: "Verdes", nome: "Áurea Camacho",            club: "Palheiro",       hcp: 54.0,  jogo: 25 },
];

// Sub 14 a 24 — Campo "Santo da Serra - Desertas-Serras", 18H, 23 jog.
const SUB1424 = [
  { tee: "13:30", hole: 1, t: "Amarelas",  nome: "João Santos",           club: "PXO Clube",      hcp: 2.7,  jogo: -2 },
  { tee: "13:30", hole: 1, t: "Amarelas",  nome: "André Gonçalves",       club: "Palheiro",       hcp: 6.5,  jogo: 3  },
  { tee: "13:30", hole: 1, t: "Vermelhas", nome: "Matilde Leal Gouveia",  club: "Santo da Serra", hcp: 3.3,  jogo: 1  },
  { tee: "13:40", hole: 1, t: "Amarelas",  nome: "Salvador Rodrigues",    club: "Palheiro",       hcp: 6.8,  jogo: 3  },
  { tee: "13:40", hole: 1, t: "Amarelas",  nome: "Martim Lima",           club: "Santo da Serra", hcp: 12.5, jogo: 9  },
  { tee: "13:40", hole: 1, t: "Vermelhas", nome: "Laura Santos",          club: "PXO Clube",      hcp: 2.1,  jogo: 0  },
  { tee: "13:50", hole: 1, t: "Amarelas",  nome: "José Pedro Miranda",    club: "Palheiro",       hcp: 8.3,  jogo: 5  },
  { tee: "13:50", hole: 1, t: "Vermelhas", nome: "Mateus Penucho",        club: "Santo da Serra", hcp: 15.7, jogo: 10 },
  { tee: "13:50", hole: 1, t: "Vermelhas", nome: "Maria Cunha",           club: "Palheiro",       hcp: 6.3,  jogo: 4  },
  { tee: "14:00", hole: 1, t: "Amarelas",  nome: "Rodrigo Abreu",         club: "Palheiro",       hcp: 11.0, jogo: 7  },
  { tee: "14:00", hole: 1, t: "Amarelas",  nome: "Tomás Câmara",          club: "PXO Clube",      hcp: 12.3, jogo: 9  },
  { tee: "14:00", hole: 1, t: "Vermelhas", nome: "Maria Câmara",          club: "Santo da Serra", hcp: 8.8,  jogo: 7  },
  { tee: "14:10", hole: 1, t: "Amarelas",  nome: "Vasco Leal Gouveia",    club: "Santo da Serra", hcp: 17.9, jogo: 15 },
  { tee: "14:10", hole: 1, t: "Vermelhas", nome: "Gonçalo Gouveia",       club: "Santo da Serra", hcp: 21.7, jogo: 16 },
  { tee: "14:10", hole: 1, t: "Amarelas",  nome: "Rafael Brito",          club: "PXO Clube",      hcp: 23.0, jogo: 20 },
  { tee: "14:20", hole: 1, t: "Amarelas",  nome: "Manuel Gouveia",        club: "Santo da Serra", hcp: 18.0, jogo: 15 },
  { tee: "14:20", hole: 1, t: "Amarelas",  nome: "Lucas Costa Cubbin",    club: "Santo da Serra", hcp: 25.1, jogo: 23 },
  { tee: "14:20", hole: 1, t: "Vermelhas", nome: "Santiago Santos",       club: "PXO Clube",      hcp: 32.0, jogo: 27 },
  { tee: "14:30", hole: 1, t: "Amarelas",  nome: "Santiago Nicolau",      club: "Santo da Serra", hcp: 34.2, jogo: 33 },
  { tee: "14:30", hole: 1, t: "Amarelas",  nome: "Lucas Duarte",          club: "Palheiro",       hcp: 40.6, jogo: 40 },
  { tee: "14:30", hole: 1, t: "Vermelhas", nome: "Vadzim Lyhach",         club: "Santo da Serra", hcp: 45.8, jogo: 41 },
  { tee: "14:40", hole: 1, t: "Vermelhas", nome: "Mafalda Sousa",         club: "Santo da Serra", hcp: 42.8, jogo: 42 },
  { tee: "14:40", hole: 1, t: "Vermelhas", nome: "Isabela Ramalho",       club: "Palheiro",       hcp: 48.2, jogo: 48 },
];

// ─── Builders ─────────────────────────────────────────────────────────
function buildDrawGroups(players) {
  const groups = new Map(); // teeTime → {teeTime, startHole, tee, players[]}
  const makePlayer = (p) => ({
    nome: p.nome,
    clube: p.club,
    fed: resolveFed(p.nome),   // ≠ null sempre que possível, robusto para escalão
    hcp: p.hcp,                 // HCP do PDF oficial (mais actual que o playersDB)
  });
  for (const p of players) {
    if (!groups.has(p.tee)) {
      groups.set(p.tee, { teeTime: p.tee, startHole: p.hole, tee: p.t, players: [] });
    }
    const g = groups.get(p.tee);
    // Se dentro do mesmo teeTime houver mais do que um "tee" (ex: Verdes e Roxas),
    // mantemos separados em linhas distintas (mesma hora, flights diferentes).
    if (g.tee !== p.t) {
      const altKey = `${p.tee}|${p.t}`;
      if (!groups.has(altKey)) {
        groups.set(altKey, { teeTime: p.tee, startHole: p.hole, tee: p.t, players: [] });
      }
      groups.get(altKey).players.push(makePlayer(p));
    } else {
      g.players.push(makePlayer(p));
    }
  }
  return [...groups.values()].sort((a, b) =>
    a.teeTime.localeCompare(b.teeTime) || a.tee.localeCompare(b.tee)
  );
}

// NOTA: Santo da Serra envia apenas o DRAW por email (PDF). NÃO temos lista
// de inscrições separada — não inventamos uma. A única tab pre-jogo é o Draw R1.

// Meta dos 2 torneios — nome base comum para agrupar em 1 item no sidebar Jovens
// (o escalão distingue-os como tabs dentro do detail view).
//
// Cada torneio regional é combinado: Sub 10/12 jogam 9H nas Serras e
// Sub 14/16/18/24 jogam 18H nas Desertas. O campo `escalao` canónico
// (Sub 10/Sub 14) é usado para sorting + pill; `_tabLabel` é o texto real
// mostrado no botão da Jovens view (descritivo do que está em jogo).
const BASE_NAME = "Campeonato Regional de Jovens 2026";
const CRJ_TORNEIOS = [
  {
    ccode: "007",  // Santo da Serra — SSERRA_CCODE, mapeado para "Madeira" no sidebar Jovens
    tcode: "99012",  // placeholder numérico — não publicado em datagolf
    name: BASE_NAME,
    date: "2026-04-18",
    campo: "Santo da Serra - Serras-Serras",
    escalao: "Sub 10",        // canónico (mínimo) — para sorting/pill
    tabLabel: "Sub 10 e 12",  // label real do botão
    rounds: 2,
    players: SUB1012,
  },
  {
    ccode: "007",
    tcode: "99014",
    name: BASE_NAME,
    date: "2026-04-18",
    campo: "Santo da Serra - Desertas-Serras",
    escalao: "Sub 14",         // canónico (mínimo) — para sorting/pill
    tabLabel: "Sub 14 a 24",   // label real do botão
    rounds: 2,
    players: SUB1424,
  },
];

// ─── 1) jovens_2026.json (skeleton pre-jogo) ──────────────────────────
const jovens2026 = {
  lastUpdated: new Date().toISOString().slice(0, 10),
  source: "Santo da Serra — Draw enviado por email (PDF)",
  totalTournaments: CRJ_TORNEIOS.length,
  totalPlayers: CRJ_TORNEIOS.reduce((s, t) => s + t.players.length, 0),
  totalScorecards: 0,
  tournaments: CRJ_TORNEIOS.map(t => ({
    name: t.name,
    ccode: t.ccode,
    tcode: t.tcode,
    date: t.date,
    campo: t.campo,
    clube: t.ccode,
    circuit: "tour",
    series: "jovens",
    region: "madeira",
    escalao: t.escalao,
    _tabLabel: t.tabLabel,   // override do texto do botão (Sub 10 e 12, Sub 14 a 24)
    num: 1,
    rounds: t.rounds,
    playerCount: t.players.length,
    players: [],  // pre-jogo
  })),
};

fs.writeFileSync(path.join(DATA, "jovens_2026.json"), JSON.stringify(jovens2026, null, 2) + "\n");
console.log(`✓ public/data/jovens_2026.json escrito (${CRJ_TORNEIOS.length} torneios, ${jovens2026.totalPlayers} inscritos).`);

// ─── 2) fpg-admissions-draws.json (merge) ─────────────────────────────
const admDrawsFile = path.join(DATA, "fpg-admissions-draws.json");
const admDraws = JSON.parse(fs.readFileSync(admDrawsFile, "utf8"));

for (const t of CRJ_TORNEIOS) {
  const drawR1 = { groups: buildDrawGroups(t.players) };
  const entry = {
    ccode: t.ccode,
    tcode: t.tcode,
    name: t.name,
    date: t.date,
    // SEM admissions — só temos draw (PDF enviado por email pela SSerra).
    draws: { "1": drawR1 },
  };

  const idx = admDraws.tournaments.findIndex(x => x.ccode === t.ccode && x.tcode === t.tcode);
  if (idx >= 0) {
    admDraws.tournaments[idx] = entry;
    console.log(`↻ actualizado ${t.ccode}-${t.tcode} (${t.name}) — só draw R1`);
  } else {
    admDraws.tournaments.push(entry);
    console.log(`+ adicionado ${t.ccode}-${t.tcode} (${t.name}) — só draw R1`);
  }
}

admDraws.total = admDraws.tournaments.length;
admDraws.scrapedAt = new Date().toISOString();
admDraws.source = (admDraws.source || "") + " + CRJ26 manual (PDFs de Santo da Serra)";

fs.writeFileSync(admDrawsFile, JSON.stringify(admDraws, null, 2) + "\n");
console.log(`✓ public/data/fpg-admissions-draws.json actualizado (total=${admDraws.total}).`);

// ─── Sanity check ─────────────────────────────────────────────────────
for (const t of CRJ_TORNEIOS) {
  const missing = t.players.filter(p => !resolveFed(p.nome));
  if (missing.length) {
    console.log(`⚠ ${t.name}: fed codes em falta para ${missing.length} jogadores:`);
    for (const m of missing) console.log(`    - ${m.nome} (${m.club})`);
  } else {
    console.log(`✓ ${t.name}: todos os ${t.players.length} jogadores encontrados em federados.json/players.json.`);
  }
}
