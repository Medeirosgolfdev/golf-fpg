/**
 * scripts/lib/digest-extract.js
 *
 * Extracção do "que há de novo" a partir dos ficheiros de dados que os
 * scrapers produzem. Alimenta o resumo por email (ver scripts/build-run-digest.js).
 *
 * Duas famílias de novidade:
 *   1. TORNEIOS  — ficheiro de resultados novo (ou que ganhou vencedor) numa
 *      qualquer fonte: "Novo torneio X em Espanha, escalão Alevín, vencedor Y".
 *   2. FEDERADOS — voltas novas no `output/{fed}/whs.json` de um dos nossos:
 *      "Fulano tem 2 scorecards novos; participou no torneio K".
 *
 * ⚠ O routing é por FORMA do JSON (detectFormat), não por caminho. Assim uma
 * fonte nova entra no resumo sem tocar aqui — só o rótulo (país/circuito) é
 * que vem do caminho, via sourceInfo().
 *
 * Puro e sem I/O de propósito: tudo o que toca no git/disco vive no
 * build-run-digest.js e os testes (digest-extract.test.js) correm sobre
 * objectos.
 */

"use strict";

/* ── Apresentação de nomes ──────────────────────────────────────────────── */

// "FERNANDEZ GARCIA-POGGIO, Cayetana" → "Cayetana Fernandez Garcia-Poggio"
// (as fontes espanholas escrevem APELIDO, Nome em caixa alta; o Doral e o
// GolfGenius escrevem "Apelido, Nome" — a vírgula é o sinal em ambos.)
function displayName(raw) {
  let s = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
  if (!s) return "";
  const comma = s.indexOf(",");
  if (comma > 0 && s.indexOf(",", comma + 1) < 0) {
    const last = s.slice(0, comma).trim();
    const first = s.slice(comma + 1).trim();
    if (first) s = first + " " + last;
  }
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, "");
  // >45% maiúsculas ⇒ ALL CAPS da fonte, converter para Title Case
  if (letters.length && upper.length / letters.length > 0.45) {
    s = s.toLowerCase().replace(/(^|[\s'’\-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
  }
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Alguns scrapers guardam o SLUG no campo do nome quando a página não expõe
 * título (ex: os `ffgolf/2026_*.json` trazem
 * "championnat-de-france-des-jeunes-benjamines"). Só para apresentação.
 */
function prettyTournamentName(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return s;
  const isSlug = /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(s); // minúsculas + hífens, sem espaços
  if (!isSlug) return s;
  return s.replace(/-/g, " ").replace(/(^|\s)(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

/* ── Escalão ────────────────────────────────────────────────────────────── */

// Rótulos por federação → escalão canónico mostrado no resumo. A ordem importa:
// "Sub 14" tem de bater antes de "Sub 1" e "Infantil" antes de "Fem".
const ESC_PATTERNS = [
  // ⚠ `(?!\d)` em vez de `\b` depois do número: a FFG escreve os escalões
  // colados ao sexo ("u12G", "u12F") e o `\b` não fecha entre "2" e "G".
  [/\bsub[\s-]?(\d{1,2})(?!\d)/i, (m) => `Sub-${m[1]}`],
  [/\bu[\s-]?(\d{1,2})(?!\d)/i, (m) => `Sub-${m[1]}`],
  [/\bunder[\s-]?(\d{1,2})(?!\d)/i, (m) => `Sub-${m[1]}`],
  [/\b(\d{1,2})\s*(?:and|&)\s*under\b/i, (m) => `Sub-${m[1]}`],
  [/\bpoussins?e?s?/i, () => "Poussins"],
  // ⚠ Sem `\b` no fim: o catalão escreve BENJAMÍ / ALEVÍ (sem -n) e o `\b` do JS
  // só conhece [A-Za-z0-9_] — depois de "Í" não há fronteira e o padrão falhava.
  [/\bbenjam[ií][nm]?/i, () => "Benjamim"],
  [/\balev[ií]n?/i, () => "Alevín"],
  [/\binfantil/i, () => "Infantil"],
  [/\bcadet[ae]?/i, () => "Cadete"],
  [/\bjuvenil/i, () => "Juvenil"],
  [/\bminimes?/i, () => "Minimes"],
  [/\bjuniors?/i, () => "Junior"],
  [/\b(?:boys|girls)\s+(\d{1,2})(?:\s*-\s*\d{1,2})?\b/i, (m) => `Boys/Girls ${m[1]}`],
  [/\babsolut[oa]\b/i, () => "Absoluto"],
];

/** Escalão canónico a partir de um rótulo livre (categoria, série ou nome). */
function inferEscalao(...texts) {
  const s = texts.filter(Boolean).join(" ");
  if (!s) return null;
  for (const [re, fn] of ESC_PATTERNS) {
    const m = re.exec(s);
    if (m) return fn(m);
  }
  return null;
}

// A categoria mostrada é o rótulo REAL da fonte quando existe ("Handicap Alevin
// Femenino", "1ère Série Messieurs", "Under 12 Boys") — é mais honesto do que
// forçar uma taxonomia nossa. Só quando não há rótulo é que se infere do nome.
function categoryLabel(raw, fallbackText) {
  const s = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
  if (s) return s;
  return inferEscalao(fallbackText) || null;
}

/* ── Fonte / país a partir do caminho ───────────────────────────────────── */

const SOURCES = [
  [/^public\/data\/rfegolf-livegolfscoring\//, { source: "RFEG · LiveGolfScoring", country: "Espanha", flag: "🇪🇸" }],
  [/^public\/data\/rfegolf-resultats\//, { source: "RFEG", country: "Espanha", flag: "🇪🇸" }],
  [/^public\/data\/nextcaddy\//, { source: "NextCaddy", country: "Espanha", flag: "🇪🇸" }],
  [/^public\/data\/fcg\//, { source: "FCG (Catalunha)", country: "Espanha", flag: "🇪🇸" }],
  [/^public\/data\/mitarjeta\//, { source: "RFEG · mitarjeta", country: "Espanha", flag: "🇪🇸" }],
  [/^public\/data\/ffgolf-resultats\//, { source: "FFG · Resultats", country: "França", flag: "🇫🇷" }],
  [/^public\/data\/ffgolf\//, { source: "FFG · GolfGenius", country: "França", flag: "🇫🇷" }],
  [/^public\/data\/england[_/]/, { source: "England Golf", country: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" }],
  [/^public\/data\/gjgl\//, { source: "Global Junior Golf Live", country: null, flag: "🌍" }],
  [/^public\/data\/egr\//, { source: "EGR", country: null, flag: "🌍" }],
  [/^public\/data\/(?:drive|aquapor)-data-/, { source: "Drive / Aquapor", country: "Portugal", flag: "🇵🇹" }],
  [/^public\/data\/pull-torneios/, { source: "FPG", country: "Portugal", flag: "🇵🇹" }],
  [/^public\/data\/jovens_/, { source: "FPG · Jovens", country: "Portugal", flag: "🇵🇹" }],
  [/^public\/data\/fpg-nacionais/, { source: "FPG · Nacionais", country: "Portugal", flag: "🇵🇹" }],
  [/^public\/data\/uskids/, { source: "USKids", country: null, flag: "⛳" }],
  [/^public\/data\/(?:ejo|ejt\d?)_/, { source: "Estonian Junior", country: "Estónia", flag: "🇪🇪" }],
  [/^public\/data\/(?:mexnacional|icopa|interzonas)_/, { source: "MAJOR", country: "México", flag: "🇲🇽" }],
  [/^public\/data\/(?:fsga|uajt|optimist\d?)_/, { source: "MAJOR", country: "EUA", flag: "🇺🇸" }],
  [/^public\/data\/coc_/, { source: "Champion of Champions", country: null, flag: "🌍" }],
  [/^public\/data\/(?:avtrophy|ebtc2|egtc)_/, { source: "MAJOR · EGA", country: null, flag: "🇪🇺" }],
  [/^public\/data\/(?:ftm_doral|ftm_fm|brjgt|wjgc|bjgt|eowagr)/, { source: "MAJOR", country: null, flag: "🌍" }],
];

/** Rótulo de circuito/país para um caminho de ficheiro (repo-relative). */
function sourceInfo(filePath) {
  const p = String(filePath || "").replace(/\\/g, "/");
  for (const [re, info] of SOURCES) if (re.test(p)) return info;
  return { source: "Outros", country: null, flag: "📄" };
}

/**
 * Sinal de que a prova é de JOVENS. O site é sobre golfe júnior: sem isto o
 * resumo enchia-se de competições sociais de clube que vêm agarradas às mesmas
 * fontes ("MENS DAY 11/8", "Competição Mensal", "Campeonato Mid-Amateur").
 */
const JUNIOR_RX = /\b(?:jeunes|jovens|junior|juvenil|infantil|alev[ií]|benjam[ií]|cadet|minime|poussin|kids|youth|escolar|promesas?|colegial|boys|girls|garç?ons|filles|sub[\s-]?\d|u[\s-]?\d{1,2}(?!\d))/i;

function isJuniorish(...texts) {
  const s = texts.filter(Boolean).join(" ");
  if (!s) return false;
  return inferEscalao(s) !== null || JUNIOR_RX.test(s);
}

/* ── Detecção de formato ────────────────────────────────────────────────── */

function detectFormat(d) {
  if (!d || typeof d !== "object") return "unknown";
  if (Array.isArray(d)) return d.length && d[0] && "score_id" in d[0] ? "whs" : "unknown";
  if (Array.isArray(d.classification) && d.meta) return "lgs";
  if (Array.isArray(d.results) && d.meta && "compId" in d) return "rfegMicrosite";
  if (Array.isArray(d.leaderboard) && d.meta && "tourId" in d) return "nextcaddy";
  if (d.game && Array.isArray(d.categories)) return "fcg";
  if (d.details && Array.isArray(d.details.series)) return "ffgResultats";
  if (Array.isArray(d.divisions) && d.divisions.some((x) => x && Array.isArray(x.players))) return "jobfile";
  if (Array.isArray(d.players) && (d.tournament || d.slug)) return "flatPlayers";
  if (Array.isArray(d.tournaments) && d.tournaments.some((t) => t && Array.isArray(t.players))) return "fpgPull";
  if (Array.isArray(d.resultados)) return "uskidsResults";
  return "unknown";
}

/* ── Helpers de classificação ───────────────────────────────────────────── */

function posOf(p) {
  if (!p || typeof p !== "object") return null;
  for (const k of ["pos", "rank", "classement", "rankingPosition", "realRanking", "place"]) {
    if (p[k] == null) continue;
    const n = parseInt(String(p[k]).replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function nameOf(p) {
  if (!p || typeof p !== "object") return null;
  // A FFG parte o nome em nameNom/namePrenom e o campo `name` junto vem como
  // "HYEST Hugo" (apelido primeiro, sem vírgula) — impossível de desfazer
  // depois. Quando as partes existem, mandam elas.
  if (p.namePrenom || p.nameNom) return displayName(`${p.namePrenom || ""} ${p.nameNom || ""}`);
  if (p.firstName || p.surname) return displayName(`${p.firstName || ""} ${p.surname || ""}`);
  if (p.name) return displayName(p.name);
  if (p.nome) return displayName(p.nome);
  return null;
}

/** Vencedor de uma lista de jogadores: o pos 1, ou o melhor pos existente. */
function winnerOf(players) {
  if (!Array.isArray(players) || !players.length) return null;
  let best = null;
  let bestPos = Infinity;
  for (const p of players) {
    const pos = posOf(p);
    if (pos == null || pos < 1 || pos > 900) continue; // >900 = sentinela "sem classificação"
    if (pos < bestPos) { bestPos = pos; best = p; }
  }
  if (!best || bestPos !== 1) return null; // sem 1º classificado ⇒ prova ainda sem vencedor
  const name = nameOf(best);
  return name ? { name, club: best.club || best.clube || null } : null;
}

function firstDate(...vals) {
  for (const v of vals) {
    if (!v) continue;
    const s = String(v);
    let m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return null;
}

/* ── Extractores por formato ────────────────────────────────────────────── */
// Cada um devolve [{ tournament, category, winner, date, nPlayers, key }].
// `key` identifica a (prova × categoria) para o diff old↔new não repetir
// entradas já anunciadas.

function fromLgs(d) {
  const name = (d.meta && d.meta.name) || null;
  const w = winnerOf(d.classification);
  if (!name || !w) return [];
  return [{
    tournament: name,
    category: categoryLabel(null, name),
    winner: w.name,
    date: firstDate(d.meta && d.meta.dateIso, d.meta && d.meta.dateRange),
    nPlayers: d.classification.length,
    key: "lgs|" + name,
  }];
}

function fromRfegMicrosite(d) {
  const meta = d.meta || {};
  const out = [];
  // Preferir "Clasificación final" a uma jornada isolada — o vencedor de uma
  // jornada não é o vencedor da prova.
  const blocks = (d.results || []).filter((b) => b && Array.isArray(b.players) && b.players.length);
  const finals = blocks.filter((b) => /final/i.test(b.label || ""));
  for (const b of (finals.length ? finals : blocks)) {
    const w = winnerOf(b.players);
    if (!w) continue;
    const cat = categoryLabel(
      [b.categoria, b.sexo && b.sexo !== "Mixto" ? b.sexo : null].filter(Boolean).join(" "),
      meta.name,
    );
    out.push({
      tournament: meta.name || `Prova ${d.compId}`,
      category: cat,
      winner: w.name,
      date: firstDate(meta.dateEnd, meta.dateStart),
      nPlayers: b.players.length,
      key: `rfeg|${d.compId}|${b.label || ""}|${cat || ""}`,
    });
  }
  return out;
}

function fromNextCaddy(d) {
  const meta = d.meta || {};
  const out = [];
  for (const b of d.leaderboard || []) {
    if (!b || !Array.isArray(b.players)) continue;
    const w = winnerOf(b.players);
    if (!w) continue;
    const cat = categoryLabel(b.categoryName, meta.name);
    out.push({
      tournament: meta.name || `Torneio ${d.tourId}`,
      category: cat,
      winner: w.name,
      date: firstDate(meta.dateStart, meta.dateEnd),
      nPlayers: b.players.length,
      key: `nc|${d.tourId}|${cat || b.category || ""}`,
    });
  }
  return out;
}

function fromFcg(d) {
  const g = d.game || {};
  // ⚠ `game.name` é a JORNADA ("Jornada 1"); a prova está em game.tournament.name
  // ("CAMPIONAT DE CATALUNYA BENJAMÍ 2026"). Sem isto o resumo anunciava
  // dezenas de torneios todos chamados "Jornada 1".
  const tName = (g.tournament && g.tournament.name) || g.name || null;
  const isSingle = !g.tournament || g.tournament.isSingleGame !== false;
  const lap = !isSingle && g.name && g.name !== tName ? g.name : null;
  const out = [];
  for (const c of d.categories || []) {
    if (!c || !Array.isArray(c.players)) continue;
    // O FCG guarda a classificação em view.acc (acumulada) / view.day (do dia).
    const flat = c.players.map((p) => ({
      name: nameOf(p),
      club: p.club || null,
      pos: (p.view && ((p.view.acc && (p.view.acc.rankingPosition ?? p.view.acc.realRanking))
        ?? (p.view.day && (p.view.day.rankingPosition ?? p.view.day.realRanking)))) ?? null,
    }));
    const w = winnerOf(flat);
    if (!w) continue;
    const cat = categoryLabel(c.name, tName);
    out.push({
      tournament: tName || `Prova ${d.gameId}`,
      round: lap,
      category: cat,
      winner: w.name,
      date: firstDate(g.scheduleEndDate, g.scheduleStartDate),
      nPlayers: c.players.length,
      key: `fcg|${d.gameId}|${c._id || cat || ""}`,
    });
  }
  return out;
}

function fromFfgResultats(d) {
  const out = [];
  for (const s of (d.details && d.details.series) || []) {
    if (!s || !Array.isArray(s.players)) continue;
    const w = winnerOf(s.players);
    if (!w) continue;
    const cat = categoryLabel(s.label, d.name);
    out.push({
      tournament: d.name || `Épreuve ${d.trnId}`,
      category: cat,
      winner: w.name,
      date: firstDate(d.date),
      nPlayers: s.players.length,
      key: `ffg|${d.trnId}|${s.serieId || cat || ""}`,
    });
  }
  return out;
}

function fromJobfile(d) {
  const out = [];
  for (const dv of d.divisions || []) {
    if (!dv || !Array.isArray(dv.players)) continue;
    const w = winnerOf(dv.players);
    if (!w) continue;
    const cat = categoryLabel(dv.division || dv.label || dv.name, d.tournament);
    out.push({
      tournament: d.tournament || d.name || "(sem nome)",
      category: cat,
      winner: w.name,
      date: firstDate(d.endDate, d.startDate),
      year: d.year || null,
      nPlayers: dv.players.length,
      key: `job|${d.tournament || d.slug || ""}|${d.year || ""}|${cat || dv.tid || ""}`,
    });
  }
  return out;
}

function fromFlatPlayers(d) {
  const w = winnerOf(d.players);
  if (!w) return [];
  const cat = categoryLabel(
    d.category || d.ageGroup || (d.players[0] && d.players[0].division),
    d.tournament,
  );
  return [{
    tournament: d.tournament || d.slug || "(sem nome)",
    category: cat,
    winner: w.name,
    date: firstDate(d.date),
    year: d.year || null,
    nPlayers: d.players.length,
    key: `flat|${d.slug || d.tournament}|${d.year || ""}|${cat || ""}`,
  }];
}

function fromFpgPull(d) {
  const out = [];
  for (const t of d.tournaments || []) {
    if (!t || !Array.isArray(t.players)) continue;
    const w = winnerOf(t.players);
    if (!w) continue;
    const cat = categoryLabel(t.escalao, t.name);
    out.push({
      tournament: t.name || "(sem nome)",
      category: cat,
      winner: w.name,
      date: firstDate(t.date),
      nPlayers: t.players.length,
      key: `fpg|${t.ccode || ""}|${t.tcode || t.name}`,
    });
  }
  return out;
}

function fromUskidsResults(d) {
  const out = [];
  for (const t of d.resultados || []) {
    for (const esc of (t && t.escaloes) || []) {
      const rondas = (esc && esc.rondas) || [];
      // A última ronda com leaderboard é a classificação final do escalão.
      const last = [...rondas].reverse().find((r) => r && Array.isArray(r.leaderboard) && r.leaderboard.length);
      if (!last) continue;
      const flat = last.leaderboard.map((p, i) => ({ name: p.nome || p.name, pos: p.pos != null ? p.pos : i + 1 }));
      const w = winnerOf(flat);
      if (!w) continue;
      const cat = categoryLabel(esc.nome || esc.age_group, t.name);
      out.push({
        tournament: t.name || `Torneio ${t.t}`,
        category: cat,
        winner: w.name,
        date: null,
        nPlayers: last.leaderboard.length,
        key: `usk|${t.t}|${cat || ""}`,
      });
    }
  }
  return out;
}

const EXTRACTORS = {
  lgs: fromLgs,
  rfegMicrosite: fromRfegMicrosite,
  nextcaddy: fromNextCaddy,
  fcg: fromFcg,
  ffgResultats: fromFfgResultats,
  jobfile: fromJobfile,
  flatPlayers: fromFlatPlayers,
  fpgPull: fromFpgPull,
  uskidsResults: fromUskidsResults,
};

/**
 * Torneios com vencedor conhecido num ficheiro de dados.
 * Devolve [] para formatos que não conhecemos (nunca lança).
 */
function extractTournaments(json, filePath) {
  const fmt = detectFormat(json);
  const fn = EXTRACTORS[fmt];
  if (!fn) return [];
  let rows;
  try { rows = fn(json) || []; } catch { return []; }
  const info = sourceInfo(filePath);
  return rows.map((r) => Object.assign({ file: filePath }, info, r, {
    tournament: prettyTournamentName(r.tournament),
  }));
}

/**
 * Novidades entre a versão anterior e a nova do MESMO ficheiro: só entram as
 * (prova × categoria) que ganharam vencedor agora. Sem isto, um ficheiro
 * tocado por qualquer motivo re-anunciava tudo o que já tinha sido enviado.
 */
function diffTournaments(oldJson, newJson, filePath) {
  const fresh = extractTournaments(newJson, filePath);
  if (!oldJson) return fresh;
  const before = new Set(extractTournaments(oldJson, filePath).map((r) => r.key));
  return fresh.filter((r) => !before.has(r.key));
}

/* ── Federados (output/{fed}/whs.json) ──────────────────────────────────── */

// score_origin da FPG → como descrever a volta no resumo.
const ORIGIN_LABEL = {
  Torn: "torneio",
  Intern: "torneio internacional",
  EDS: "EDS",
  Indiv: "volta individual",
  Import: "importada",
  First: "volta inicial",
};

function roundInfo(r) {
  return {
    scoreId: r.score_id != null ? String(r.score_id) : null,
    event: (r.tourn_name || r.course_description || "").trim() || null,
    course: r.course_description || null,
    origin: r.score_origin || null,
    originLabel: ORIGIN_LABEL[r.score_origin] || r.score_origin || null,
    date: firstDate(r.hcp_dateStr, r.score_dateStr, r.mov_dateStr),
    holes: r.holes != null ? Number(r.holes) : null,
    sd: r.sgd != null ? Number(r.sgd) : null,
  };
}

// ⚠ Nem toda a linha do WHS é uma volta jogada: a FPG regista ali actos
// ADMINISTRATIVOS (atribuição inicial de índice, transferência de clube,
// alteração de tipo de jogador) com `score_origin: "Torn"`. Sem os filtrar, o
// resumo anunciava "participou em Transferencia de Clube" como se fosse uma
// prova. Medido no repo: 1105 destas linhas. Mesma armadilha que o
// build-recent-tournaments.js já trata.
const ADMIN_ACT_RX = /atribui[çc][ãa]?o|transfer[êe]ncia|altera[çc][ãa]o/i;

function isAdminAct(r) {
  return ADMIN_ACT_RX.test(String((r && r.tourn_name) || ""));
}

// ⚠ `score_id` vem a 0 nesses actos (639 dos 640 com valor) — é sentinela, não
// um ID. Usá-lo como chave fazia 639 registos diferentes colidirem no mesmo "0".
// Quando não há ID real, a chave é composta por data + evento + campo.
function roundKey(r) {
  const id = r.score_id;
  if (id != null && Number(id) > 0) return `id:${id}`;
  return `k:${r.hcp_dateStr || r.score_dateStr || ""}|${r.tourn_name || ""}|${r.course_description || ""}`;
}

/**
 * Voltas novas de um federado: presentes no whs.json novo e ausentes do antigo.
 * Chave = score_id (o `id` é da entrada WHS e muda; ver CLAUDE.md "score_id ≠ id").
 */
function diffWhs(oldRounds, newRounds) {
  const seen = new Set(
    (Array.isArray(oldRounds) ? oldRounds : [])
      .filter((r) => r && !isAdminAct(r))
      .map(roundKey),
  );
  const out = [];
  for (const r of Array.isArray(newRounds) ? newRounds : []) {
    if (!r) continue;
    if (isAdminAct(r)) continue;      // acto administrativo, não é scorecard
    const k = roundKey(r);
    if (seen.has(k)) continue;
    seen.add(k);                       // evita repetir a mesma volta sem ID
    out.push(roundInfo(r));
  }
  // Mais recentes primeiro
  out.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return out;
}

/**
 * Frase por jogador, no formato que a Mariana pediu:
 *   "Fulano tem 2 scorecards novos; participou em Campeonato Nacional"
 *   "Sicrano tem 4 scorecards novos, por via de EDS"
 */
function describePlayerRounds(playerName, rounds) {
  const n = rounds.length;
  if (!n) return null;
  const plural = n === 1 ? "1 scorecard novo" : `${n} scorecards novos`;
  const events = [];
  for (const r of rounds) {
    if (r.origin === "Torn" || r.origin === "Intern") {
      const ev = (r.event || "").replace(/\s+(?:D|R)\d\s*$/i, "").trim(); // "… D3" = ronda
      if (ev && !events.includes(ev)) events.push(ev);
    }
  }
  const others = rounds.filter((r) => r.origin !== "Torn" && r.origin !== "Intern");
  const parts = [];
  if (events.length) {
    parts.push(`participou em ${events.slice(0, 3).join(", ")}${events.length > 3 ? ` (+${events.length - 3})` : ""}`);
  }
  if (others.length) {
    const kinds = [...new Set(others.map((r) => r.originLabel).filter(Boolean))];
    parts.push(`por via de ${kinds.join(" / ")}`);
  }
  return `${playerName} tem ${plural}${parts.length ? "; " + parts.join("; ") : ""}`;
}

/* ── Federados (public/data/federados.json) ─────────────────────────────── */

// O ficheiro é {players: [...]} com FedStat=9 (activos). Quem entra aparece na
// lista nova; quem deixa de ser federado desaparece dela.
function fedPlayers(d) {
  if (!d) return [];
  if (Array.isArray(d)) return d;
  return Array.isArray(d.players) ? d.players : [];
}

// Espelha o HCP_UNESTABLISHED_THRESHOLD de src/pages/jogadores/filterPlayers.ts
// (`isCountableHcp`: h < 54). A FPG guarda 99 / "Sem HCP" em quem ainda não tem
// índice — e a maioria dos federados novos está nesse caso (12 dos 16 juniores
// da janela 05→14 Ago), por isso mostrar "99" seria mentira.
const HCP_UNESTABLISHED = 54;

function fedHcp(p) {
  const n = Number(p.hcp_exact);
  if (!Number.isFinite(n) || n >= HCP_UNESTABLISHED) return null;
  if (Number(p.hcp_status_id) === 99) return null;
  return n;
}

function fedEntry(p, opts) {
  const esc = (p.age_level || "").trim() || null;
  const admissao = p.admission_date || null;
  // ⚠ Um federado com admission_date ANTERIOR ao snapshot passado, mas ausente
  // dele, não é novo — é uma REENTRADA (estava inactivo e voltou). Caso real:
  // "Antonio Ferreira", inscrito em 2023-08-28, reapareceu na lista de Agosto/26.
  const reentrada = Boolean(
    admissao && opts && opts.previousSnapshot && admissao < String(opts.previousSnapshot).slice(0, 10),
  );
  return {
    fed: String(p.federation_code || "").trim(),
    name: displayName(String(p.name || "").trim()),
    club: p.acronym || p.club_name || null,
    escalao: esc,
    sexo: p.gender || null,
    hcp: fedHcp(p),
    nascimento: p.birthdate || null,
    admissao,
    reentrada,
    junior: /^sub/i.test(esc || ""),
  };
}

/**
 * Quem entrou e quem saiu da lista de federados activos entre dois snapshots.
 * `previousSnapshot` (o campo `generated` do ficheiro antigo) serve para
 * distinguir admissões novas de reentradas.
 */
function diffFederados(oldJson, newJson) {
  const antes = fedPlayers(oldJson);
  const agora = fedPlayers(newJson);
  if (!antes.length || !agora.length) return { entrou: [], saiu: [] };

  const prevSnapshot = (oldJson && oldJson.generated) || null;
  const codeOf = (p) => String(p.federation_code || "").trim();
  const mAntes = new Map(antes.map((p) => [codeOf(p), p]).filter(([k]) => k));
  const mAgora = new Map(agora.map((p) => [codeOf(p), p]).filter(([k]) => k));

  const entrou = [];
  for (const [k, p] of mAgora) if (!mAntes.has(k)) entrou.push(fedEntry(p, { previousSnapshot: prevSnapshot }));
  const saiu = [];
  for (const [k, p] of mAntes) if (!mAgora.has(k)) saiu.push(fedEntry(p, {}));

  // Juniores primeiro e, dentro deles, do mais novo para o mais velho — é o
  // que interessa a um site de golfe júnior.
  const escN = (e) => {
    const m = /^sub[\s-]?(\d{1,2})/i.exec(e.escalao || "");
    return m ? parseInt(m[1], 10) : 99;
  };
  const ord = (a, b) => escN(a) - escN(b) || String(a.name).localeCompare(String(b.name), "pt");
  entrou.sort(ord);
  saiu.sort(ord);
  return { entrou, saiu };
}

/**
 * "Duarte Rodrigues — SUB14 (M), RIO · entrou em 2026-08-10"
 * Com modo "saiu": "… · era federado desde 2008-04-03" (a data de admissão diz
 * há quanto tempo lá estava, que é a informação útil numa saída).
 */
function describeFederado(e, modo) {
  const bits = [];
  if (e.escalao) bits.push(e.sexo ? `${e.escalao} (${e.sexo})` : e.escalao);
  if (e.club) bits.push(e.club);
  let s = `${e.name}${bits.length ? " — " + bits.join(", ") : ""}`;
  // Dizer "sem HCP" em vez de calar: num federado novo isso é informação (ainda
  // não tem índice), enquanto o silêncio pareceria falha de leitura.
  s += e.hcp != null ? ` · hcp ${e.hcp}` : " · sem HCP";
  if (modo === "saiu") {
    if (e.admissao) s += ` · era federado desde ${e.admissao}`;
  } else if (e.reentrada) {
    s += ` · reentrada (inscrição de ${e.admissao})`;
  } else if (e.admissao) {
    s += ` · entrou em ${e.admissao}`;
  }
  return s;
}

module.exports = {
  displayName,
  prettyTournamentName,
  diffFederados,
  describeFederado,
  inferEscalao,
  isJuniorish,
  categoryLabel,
  sourceInfo,
  detectFormat,
  winnerOf,
  extractTournaments,
  diffTournaments,
  diffWhs,
  describePlayerRounds,
  ORIGIN_LABEL,
};
