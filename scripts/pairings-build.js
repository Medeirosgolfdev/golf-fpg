// pairings-build.js — gera os Draws (companheiros de jogo) da ficha do jogador:
//   - public/data/manuel-pairings.json — o Manuel: FPG + USKids + internacionais
//   - public/data/pairings/{fed}.json  — os outros jogadores seguidos (players.json):
//     FPG + USKids + GolfGenius (tee sheets MAJOR e provas francesas) + partidas
//     RMS9 (França), desde 23/11/2026; public/data/pairings/index.json diz quem tem
//
// Cada ronda: { circuito, torneioId, torneioNome, data, ronda, teeTime,
// startHole, campo, jogadorScore, companheiros[] }.
//
// Cruza:
//   - fpg-admissions-draws.json    (draws FPG)
//   - uskids-draws.json            (draws USKids)
//   - manuel-draws-overrides.json  (overrides manuais: USKids WD + intl Bluegolf/Doral)
// Com scores via:
//   - pull-torneios*.json / drive-data-*.json / aquapor-data-*.json  (FPG scores)
//   - uskids-results.json                                            (USKids scores)
// Cobertura via:
//   - output/52884/scorecards.json                                   (torneios FPG do Manuel)
//
// SKIP_CCODES = {"982"} — FPG reatribuiu este ccode (era Madeira → agora Açores)

const fs = require("fs");
const { writeAtomic } = require("./lib/atomic-write");
const { writeJsonGuarded, hasForceFlag } = require("./lib/shrink-guard");
const path = require("path");
const { lisbonCivilDayStr } = require("../lib/helpers");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");

const MANUEL_FED = "52884";
const MANUEL_USKIDS_IDS = ["630106", "605933"];
const MANUEL_NAME_PATTERNS = [/\bmanuel\b.*\bmedeir/i, /\bgoulart.*\bmedeir/i];
const SKIP_CCODES = new Set(["982"]);

// ─── utils ─────────────────────────────────────────────────────────

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { console.warn(`[warn] ${p}: ${e.message}`); return null; }
}
// Os tee sheets (MAJOR e FFG, ~50 MB) percorrem-se uma vez por jogador seguido:
// lêem-se do disco uma só vez.
const _jsonCache = new Map();
function readJSONCached(p) {
  if (!_jsonCache.has(p)) _jsonCache.set(p, readJSON(p));
  return _jsonCache.get(p);
}
function listFiles(prefix) {
  return fs.readdirSync(DATA).filter(f => f.startsWith(prefix) && f.endsWith(".json")).map(f => path.join(DATA, f));
}
// Ficheiros com scores FPG (formato "fpg-pull": {tournaments:[{ccode,tcode,players}]}).
// Os torneios scrapados a pedido (scrape-miramar.yml) vão também para os
// pull-torneios — não há ficheiros avulsos por torneio.
function listFpgScoreFiles() {
  return [
    ...listFiles("pull-torneios"), ...listFiles("drive-data-"), ...listFiles("aquapor-data-"),
    ...listFiles("jovens_"), ...listFiles("clubes_"),
  ];
}
function normName(s) {
  if (!s) return "";
  return String(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function isManuel(name) { return MANUEL_NAME_PATTERNS.some(rx => rx.test(normName(name))); }
function isFedCode(s) { return !!s && /^\d+$/.test(String(s).trim()); }
function normIsoDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const dn = t.match(/^\/Date\((\d+)\)\/?$/);
  if (dn) return lisbonCivilDayStr(Number(dn[1])); // meia-noite Lisboa; UTC dava dia -1 no verão
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), y = m[3];
    if (a > 12) return `${y}-${String(b).padStart(2,"0")}-${String(a).padStart(2,"0")}`;
    return `${y}-${String(a).padStart(2,"0")}-${String(b).padStart(2,"0")}`;
  }
  return t;
}

// ─── índices FPG ───────────────────────────────────────────────────

function buildFpgScoreIndex() {
  const idx = new Map();
  for (const f of listFpgScoreFiles()) {
    const j = readJSON(f);
    if (!j || !Array.isArray(j.tournaments)) continue;
    for (const t of j.tournaments) {
      const key = `${t.ccode}-${t.tcode}`;
      let m = idx.get(key);
      if (!m) { m = new Map(); idx.set(key, m); }
      for (const p of t.players || []) {
        const fed = String(p.fedCode || "").trim();
        if (!fed) continue;
        const prev = m.get(fed);
        const novo = { name: p.name || "", club: p.club || "", roundScores: p.roundScores || [] };
        if (!prev || (novo.roundScores.length > (prev.roundScores || []).length)) m.set(fed, novo);
      }
    }
  }
  return idx;
}
// Índice de scores por NOME (normalizado) e por torneio — inclui jogadores
// SEM fed (ex: emigrantes/convidados como o Valentin Bonnet, que jogam mas não
// têm licença FPG). Usado como fallback quando o cruzamento por fed falha. O
// match é sempre DENTRO do mesmo torneio (ccode-tcode), por isso é seguro mesmo
// sem fed/dob para confirmar identidade.
function buildFpgScoreIndexByName() {
  const idx = new Map();
  for (const f of listFpgScoreFiles()) {
    const j = readJSON(f);
    if (!j || !Array.isArray(j.tournaments)) continue;
    for (const t of j.tournaments) {
      const key = `${t.ccode}-${t.tcode}`;
      let m = idx.get(key);
      if (!m) { m = new Map(); idx.set(key, m); }
      for (const p of t.players || []) {
        const nm = normName(p.name || "");
        if (!nm) continue;
        const novo = { name: p.name || "", club: p.club || "", roundScores: p.roundScores || [] };
        const prev = m.get(nm);
        // Homónimos no mesmo torneio com rondas diferentes → ambíguo (não cruzar).
        if (prev === null) continue;
        if (prev && (prev.roundScores || []).length && novo.roundScores.length
            && (prev.name || "") !== (novo.name || "")) { m.set(nm, null); continue; }
        if (!prev || novo.roundScores.length > (prev.roundScores || []).length) m.set(nm, novo);
      }
    }
  }
  return idx;
}
function buildFpgClubeIndex(fpg) {
  const idx = new Map();
  for (const t of fpg.tournaments || []) {
    const adm = t.admissions;
    if (!adm || !Array.isArray(adm.players)) continue;
    for (const p of adm.players) {
      const fed = String(p.fed || "").trim();
      if (fed && !idx.has(fed) && p.clube) idx.set(fed, String(p.clube).trim());
    }
  }
  for (const f of listFpgScoreFiles()) {
    const j = readJSON(f);
    if (!j || !Array.isArray(j.tournaments)) continue;
    for (const t of j.tournaments) for (const p of t.players || []) {
      const fed = String(p.fedCode || "").trim();
      if (fed && !idx.has(fed) && p.club) idx.set(fed, String(p.club).trim());
    }
  }
  return idx;
}
function buildFpgNomeIndex(fpg, scoreIdx) {
  const idx = new Map();
  for (const t of fpg.tournaments || []) {
    const adm = t.admissions;
    if (!adm || !Array.isArray(adm.players)) continue;
    for (const p of adm.players) {
      const fed = String(p.fed || "").trim();
      if (fed && !idx.has(fed) && p.nome) idx.set(fed, String(p.nome).trim());
    }
  }
  for (const [, fedMap] of scoreIdx) for (const [fed, info] of fedMap) {
    if (!idx.has(fed) && info.name) idx.set(fed, info.name);
  }
  return idx;
}
function buildLocalNameToFed(t) {
  const m = new Map();
  if (t.admissions && Array.isArray(t.admissions.players)) {
    for (const p of t.admissions.players) {
      if (isFedCode(p.fed) && p.nome) m.set(normName(p.nome), String(p.fed).trim());
    }
  }
  for (const rn of Object.keys(t.draws || {})) {
    const ron = t.draws[rn];
    if (!ron || !Array.isArray(ron.groups)) continue;
    for (const g of ron.groups) for (const p of g.players || []) {
      if (isFedCode(p.clube) && p.nome) {
        const key = normName(p.nome);
        if (!m.has(key)) m.set(key, String(p.clube).trim());
      }
    }
  }
  return m;
}

// ─── extrair pairings FPG ──────────────────────────────────────────

/**
 * Sintetiza draws em falta a partir do leaderboard acumulado das rondas
 * anteriores (regra FPG: 1º+2º+3º acumulado juntos, depois 4º+5º+6º, etc.).
 * Aplicável quando a FPG ainda não publicou (ou não chegou a ser scraped) o
 * draw oficial dessa ronda. Devolve um clone de `existingDraws` enriquecido
 * com os draws sintetizados nas rondas em falta. Cada draw sintetizado tem
 * `_synthesized: true` para fácil identificação a jusante.
 *
 * Replica `synthesizeDrawFromCumulative` em src/data/fpgUtils.ts — esta versão
 * Node trabalha sobre os roundScores já indexados em `tScores` (Map fed→info).
 */
function synthesizeMissingDraws(existingDraws, tScores) {
  const out = { ...existingDraws };
  if (!tScores || tScores.size === 0) return out;

  const players = [];
  let maxRound = 0;
  for (const [fed, info] of tScores) {
    const rs = info.roundScores || [];
    if (!rs.length) continue;
    let m = 0;
    for (const r of rs) if (r && Number(r.round) > m) m = Number(r.round);
    if (m > maxRound) maxRound = m;
    players.push({ name: info.name || "", club: info.club || null, fed: String(fed), roundScores: rs });
  }
  if (maxRound < 2) return out;

  for (let R = 2; R <= maxRound; R++) {
    if (out[String(R)]) continue;
    const priorRounds = R - 1;
    const eligible = [];
    for (const p of players) {
      let cum = 0, ok = true;
      for (let r = 1; r <= priorRounds; r++) {
        const rs = p.roundScores.find((x) => Number(x.round) === r);
        const g = rs && rs.gross != null ? Number(rs.gross) : null;
        if (g == null || isNaN(g) || g <= 0 || g >= 999) { ok = false; break; }
        cum += g;
      }
      if (!ok) continue;
      eligible.push({ name: p.name, club: p.club, fed: p.fed, cum });
    }
    if (eligible.length === 0) continue;
    eligible.sort((a, b) => a.cum - b.cum);
    const groups = [];
    for (let i = 0; i < eligible.length; i += 3) {
      const slice = eligible.slice(i, i + 3);
      const gnum = groups.length + 1;
      groups.push({
        teeTime: `G${gnum}`,
        startHole: null,
        tee: null,
        players: slice.map((p) => ({ nome: p.name, clube: p.club, fed: p.fed, hcp: null })),
      });
    }
    out[String(R)] = {
      totalJogadores: eligible.length,
      groups,
      note: `Draw estimado — emparelhamentos calculados pelo acumulado das rondas 1-${priorRounds} (FPG ainda não publicou o draw oficial)`,
      _synthesized: true,
    };
  }
  return out;
}

// Encontra o score de uma ronda, com fallback para eventos de ronda única:
// alguns draws manuais (ex: PJA Vale Pisão Dia 1, tcode 10370) estão sob a
// ronda "2" mas a classificação só tem a ronda 1. Se o torneio tem UMA só
// ronda de scores, usa-a independentemente do nº de ronda do draw.
function findRoundScore(roundScores, rondaNum) {
  if (!Array.isArray(roundScores) || roundScores.length === 0) return null;
  const exact = roundScores.find(x => Number(x.round) === rondaNum);
  if (exact) return exact;
  if (roundScores.length === 1) return roundScores[0];
  return null;
}

// Score de uma ronda ({gross, toPar}) a partir da linha da classificação.
function scoreDaRonda(info, rondaNum) {
  const rs = info ? findRoundScore(info.roundScores, rondaNum) : null;
  if (!rs || rs.gross == null || Number(rs.gross) >= 200) return null;
  const parTot = Array.isArray(rs.pars) ? rs.pars.reduce((a, b) => a + (Number(b) || 0), 0) : null;
  return { gross: Number(rs.gross), toPar: parTot != null ? Number(rs.gross) - parTot : null };
}

/**
 * Uma só passagem por TODOS os grupos de todos os draws FPG (23/11/2026: os
 * Draws passaram a existir para todos os jogadores seguidos, não só para o
 * Manuel). Cada membro do grupo leva:
 *   - `quem`: o federado do jogador, para saber de quem é a ronda — a licença
 *     manda; sem ela, o Manuel pelo nome (regra antiga: o homónimo «Manuel
 *     Medeiros», 54907, só se distingue pela licença) e os outros pelas
 *     inscrições/draw da MESMA prova (`buildLocalNameToFed`), nunca por outras listas;
 *   - `comp`: a linha dele como companheiro dos outros.
 *
 * ccode 982 (Madeira histórico) NÃO é excluído aqui: a FPG reatribuiu o ccode
 * (era Madeira, agora Açores), mas torneios antigos do CGSS podem aparecer sob
 * ele. Só entra quem está no grupo, por isso não há dados errados; o
 * `SKIP_CCODES` serve só a cobertura (não listar Açores como «sem draw»).
 */
function buildFpgGroups(fpg, scoreIdx, scoreByNameIdx, nomeIdx, clubeIdx) {
  const out = [];
  for (const t of fpg.tournaments || []) {
    const torneioId = `${t.ccode}-${t.tcode}`;
    const tNameRaw = t.name || (t.admissions && t.admissions.name) || null;
    const tNameIsPlaceholder = !!tNameRaw && /^Torneio\s+\d+$/i.test(String(tNameRaw).trim());
    const tDateRaw = normIsoDate(t.date || (t.admissions && t.admissions.date) || null);
    const tScores = scoreIdx.get(torneioId) || new Map();
    const tScoresByName = (scoreByNameIdx && scoreByNameIdx.get(torneioId)) || new Map();
    const localNameToFed = buildLocalNameToFed(t);
    // Inclui draws sintetizados para rondas em falta (regra: cumulativo R1..R-1)
    const draws = synthesizeMissingDraws(t.draws || {}, tScores);

    for (const rn of Object.keys(draws)) {
      const ronda = draws[rn];
      if (!ronda || !Array.isArray(ronda.groups)) continue;
      const rondaNum = Number(rn);
      for (const grp of ronda.groups) {
        const membros = (grp.players || []).map((p) => {
          // Prioridade do `fed`: campo explícito do jogador (síntese/scrape novo)
          // > clube com aparência de fed (scraper FPG legacy) > lookup por nome.
          const pFed = p.fed && String(p.fed).trim() ? String(p.fed).trim() : null;
          const rawClube = String(p.clube || "").trim();
          const isNumericFed = isFedCode(rawClube);
          const licenca = pFed || (isNumericFed ? rawClube : null);
          const fed = licenca || localNameToFed.get(normName(p.nome)) || null;
          const quem = licenca || (isManuel(p.nome) ? MANUEL_FED : fed);
          const clubeTexto = (!isNumericFed && rawClube) ? rawClube : (fed && clubeIdx.get(fed)) || null;
          // Score: cruzar por fed; se falhar (ou sem fed, ex: emigrante), tentar
          // por NOME dentro do mesmo torneio (seguro — mesmo evento).
          const scInfo = (fed ? tScores.get(fed) : null) || tScoresByName.get(normName(p.nome)) || null;
          return {
            quem,
            nomeBruto: p.nome || "",
            comp: {
              nome: (nomeIdx.get(fed) || p.nome || "").trim(),
              fed, clube: clubeTexto, pais: null,
              score: scoreDaRonda(scInfo, rondaNum),
            },
          };
        });
        out.push({
          torneioId, tNameRaw, tNameIsPlaceholder, tDateRaw,
          campo: t.campo || null,
          ronda: rondaNum,
          teeTime: grp.teeTime || null,
          startHole: grp.startHole != null ? Number(grp.startHole) : null,
          tScores, tScoresByName, membros,
        });
      }
    }
  }
  return out;
}

// fed → [{ g, idx }]: os grupos em que cada federado jogou (idx = a posição dele).
function indexGroupsByFed(groups) {
  const idx = new Map();
  for (const g of groups) {
    const vistos = new Set();
    g.membros.forEach((m, i) => {
      if (!m.quem || vistos.has(m.quem)) return;
      vistos.add(m.quem);
      if (!idx.has(m.quem)) idx.set(m.quem, []);
      idx.get(m.quem).push({ g, idx: i });
    });
  }
  return idx;
}

// As rondas FPG de um federado. `tournIdx` (dos scorecards DELE) corrige nome e
// data quando o fpg-admissions-draws.json traz placeholders («Torneio 10514» /
// data do scrape): a data autoritativa é a dos scorecards, sempre que existe —
// corrige torneios antigos (ex «World Kids 2024») que apareciam com 27/05/2026.
function fpgPairingsDe(fed, groupsByFed, tournIdx) {
  return (groupsByFed.get(fed) || []).map(({ g, idx }) => {
    const m = tournIdx.get(g.torneioId) || null;
    const eu = g.membros[idx];
    const info = g.tScores.get(fed)
      || g.tScoresByName.get(normName(fed === MANUEL_FED ? "Manuel Goulartt Medeiros" : eu.nomeBruto));
    return {
      circuito: "FPG",
      torneioId: g.torneioId,
      torneioNome: (g.tNameIsPlaceholder && m && m.nome) ? m.nome : (g.tNameRaw || (m && m.nome) || g.torneioId),
      data: (m && m.data) ? m.data : g.tDateRaw,
      ronda: g.ronda,
      teeTime: g.teeTime,
      startHole: g.startHole,
      campo: g.campo,
      jogadorScore: scoreDaRonda(info, g.ronda),
      // cópias: a resolução por nome de cada ficheiro mexe nelas
      companheiros: g.membros.filter((_, i) => i !== idx).map((x) => ({ ...x.comp })),
    };
  });
}

// ─── USKids ────────────────────────────────────────────────────────

function buildUskidsScoreIndex(uskidsResults) {
  const idx = new Map();
  for (const tres of uskidsResults.resultados || []) {
    const t = String(tres.t);
    for (const esc of tres.escaloes || []) {
      const ag = esc.age_group || esc.nome;
      const rondaMap = new Map();
      for (const r of esc.rondas || []) rondaMap.set(Number(r.ronda), r.leaderboard || []);
      idx.set(`${t}|${ag}`, rondaMap);
    }
  }
  return idx;
}

// Injecta o Manuel em grupos dos USKids onde foi WD/IE (override manual).
function applyUskidsOverrides(uskidsDraws, overrides) {
  if (!overrides || !Array.isArray(overrides.uskids)) return 0;
  let injectados = 0;
  for (const ov of overrides.uskids) {
    const t = (uskidsDraws.torneios || []).find(x => String(x.t) === String(ov.t));
    if (!t) { console.warn(`[ovr-usk] torneio t=${ov.t} não encontrado`); continue; }
    const esc = (t.escaloes || []).find(e => e.age_group === ov.ageGroup || e.nome === ov.ageGroup);
    if (!esc) { console.warn(`[ovr-usk] escalão ${ov.ageGroup} não encontrado em t=${ov.t}`); continue; }
    esc.is_manuel = true;
    const ron = (esc.rondas || []).find(r => Number(r.ronda) === Number(ov.ronda));
    if (!ron) { console.warn(`[ovr-usk] ronda ${ov.ronda} não encontrada`); continue; }
    const grp = (ron.grupos || []).find(g => Number(g.group_number) === Number(ov.group_number));
    if (!grp) { console.warn(`[ovr-usk] grupo ${ov.group_number} não encontrado na ronda ${ov.ronda}`); continue; }
    if (ov.manuel_inject) {
      const jaTem = (grp.jogadores || []).some(j => isManuel(j.nome));
      if (!jaTem) {
        grp.jogadores.push({
          nome: "Manuel Goulartt Medeiros",
          pais: "PT",
          cidade: "",
          _injected: true,
        });
        injectados++;
      }
    }
  }
  return injectados;
}

// `eEle(nome)` diz se um nome do draw é o jogador. Os draws USKids não trazem
// número nenhum: o Manuel reconhece-se pelo nome (`isManuel`) e só nos escalões
// dele; os outros pelos nomes que o Kids 2 liga ao federado (`nomesUskidsPorFed`).
function extractUskidsPairings(uskidsDraws, scoreIdx, eEle, soEscaloesDoManuel) {
  const out = [];
  for (const t of uskidsDraws.torneios || []) {
    const torneioId = `usk-${t.t}`;
    const torneioNome = t.name;
    const dataBase = normIsoDate(t.date_inicio || null);
    for (const esc of t.escaloes || []) {
      if (soEscaloesDoManuel && !esc.is_manuel) continue;
      const ageGroup = esc.age_group || esc.nome;
      for (const ron of esc.rondas || []) {
        const rondaNum = Number(ron.ronda);
        const lb = (scoreIdx.get(`${t.t}|${ageGroup}`) || new Map()).get(rondaNum) || [];
        const lbByName = new Map();
        for (const e of lb) if (e.nome) lbByName.set(normName(e.nome), e);
        for (const grp of ron.grupos || []) {
          const jogadores = grp.jogadores || [];
          // Placeholder de draw por publicar: o signupanytime devolve o field
          // INTEIRO num único "grupo 0" com tee_time default (08:00) enquanto o
          // draw da ronda não sai (visto no Venice Open 2026 R2/R3: 31 jogadores
          // num grupo). Um grupo real USKids tem 3-4 jogadores — ignorar dumps.
          if (jogadores.length > 5) continue;
          const euIdx = jogadores.findIndex(j => eEle(j.nome));
          if (euIdx === -1) continue;
          const companheiros = jogadores.map((j, i) => {
            if (i === euIdx) return null;
            const lbE = lbByName.get(normName(j.nome));
            return {
              nome: (j.nome || "").trim(),
              fed: null, clube: null, pais: j.pais || null,
              score: lbE && lbE.score != null ? { gross: Number(lbE.score), toPar: lbE.to_par != null ? Number(lbE.to_par) : null } : null,
            };
          }).filter(Boolean);
          const mLb = lbByName.get(normName(jogadores[euIdx].nome)) || lb.find(e => eEle(e.nome));
          const jogadorScore = mLb && mLb.score != null
            ? { gross: Number(mLb.score), toPar: mLb.to_par != null ? Number(mLb.to_par) : null }
            : null;
          out.push({
            circuito: "USKids",
            torneioId, torneioNome, data: dataBase,
            ronda: rondaNum,
            teeTime: grp.tee_time || null,
            startHole: grp.start_hole != null ? Number(grp.start_hole) : null,
            campo: t.campo || grp.course || null,
            jogadorScore, companheiros,
          });
        }
      }
    }
  }
  return out;
}

// ─── Intl (overrides manuais, Bluegolf/Doral/etc.) ─────────────────

// Cache de scoreSource lookups
const _scoreSourceCache = new Map();
function loadIntlScoreSource(filename) {
  if (_scoreSourceCache.has(filename)) return _scoreSourceCache.get(filename);
  const p = path.join(DATA, filename);
  if (!fs.existsSync(p)) { _scoreSourceCache.set(filename, null); return null; }
  const j = readJSON(p);
  const sumPar = (arr) => Array.isArray(arr) ? arr.reduce((a, b) => a + (Number(b) || 0), 0) || null : null;
  // Construir { normName(player) → { rondas:{1:90,...}, total, parTotal } }
  const byName = new Map();
  if (j && Array.isArray(j.players)) {
    // formato bluegolf (wjgc_*.json, eowagr*.json)
    const parTotal = j.parTotal != null ? Number(j.parTotal) : sumPar(j.par);
    for (const p of j.players) {
      const map = {};
      for (const r of (p.rounds || [])) {
        if (r.gross != null) map[Number(r.day)] = Number(r.gross);
      }
      byName.set(normName(p.name), { rondas: map, total: p.total != null ? Number(p.total) : null, parTotal });
    }
  } else if (j && Array.isArray(j.divisions)) {
    // formato ftm-doral
    for (const div of j.divisions) {
      const parTotal = div.parTotal != null ? Number(div.parTotal) : sumPar(div.par);
      for (const p of (div.players || [])) {
        const map = {};
        if (p.r1Gross != null) map[1] = Number(p.r1Gross);
        if (p.r2Gross != null) map[2] = Number(p.r2Gross);
        if (p.r3Gross != null) map[3] = Number(p.r3Gross);
        byName.set(normName(p.name), { rondas: map, total: p.total != null ? Number(p.total) : null, parTotal });
      }
    }
  }
  _scoreSourceCache.set(filename, byName);
  return byName;
}
function lookupIntlScore(byName, nome, ronda) {
  if (!byName) return null;
  const mk = (v) => {
    const gross = v.rondas[ronda];
    if (gross == null) return null;
    return { gross, toPar: v.parTotal != null ? gross - v.parTotal : null };
  };
  const exact = byName.get(normName(nome));
  if (exact) { const s = mk(exact); if (s) return s; }
  // tentar last-name match (Bluegolf usa "Maier, Luis" vs override "Luis Maier")
  const partes = nome.split(/\s+/);
  if (partes.length >= 2) {
    const inverso = `${partes[partes.length-1]}, ${partes.slice(0, -1).join(" ")}`;
    const e2 = byName.get(normName(inverso));
    if (e2) { const s = mk(e2); if (s) return s; }
    // tentar "Apelido, Nome" → procurar "Nome Apelido"
    const inverso2 = `${partes.slice(0, -1).join(" ")} ${partes[partes.length-1]}`;
    const e3 = byName.get(normName(inverso2));
    if (e3) { const s = mk(e3); if (s) return s; }
  }
  // tentar match parcial: contains
  for (const [k, v] of byName) {
    if (k.includes(normName(nome)) || normName(nome).includes(k)) {
      const s = mk(v); if (s) return s;
    }
  }
  return null;
}

function buildIntlPairingsFromOverrides(overrides) {
  if (!overrides || !Array.isArray(overrides.intl)) return [];
  return overrides.intl.map(ov => {
    const src = ov.scoreSource ? loadIntlScoreSource(ov.scoreSource) : null;
    // ronda 0 = practice round (o "|| 1" antigo transformava-a em R1)
    const rondaNum = ov.ronda != null && !isNaN(Number(ov.ronda)) ? Number(ov.ronda) : 1;
    // score do Manuel (procurar pelo nome)
    let manuelScore = ov.manuelScore || null;
    if (!manuelScore && src) {
      const m = lookupIntlScore(src, "Manuel Medeiros", rondaNum)
            || lookupIntlScore(src, "Medeiros, Manuel", rondaNum)
            || lookupIntlScore(src, "Manuel Francisco Medeiros", rondaNum);
      if (m) manuelScore = m;
    }
    return {
      circuito: "Intl",
      torneioId: ov.torneioId || "intl-?",
      torneioNome: ov.torneioNome || ov.torneioId,
      data: ov.data || null,
      ronda: rondaNum,
      teeTime: ov.teeTime || null,
      startHole: ov.startHole != null ? Number(ov.startHole) : null,
      campo: ov.campo || null,
      fonte: ov.fonte || null,
      jogadorScore: manuelScore,
      companheiros: (ov.companheiros || []).map(c => {
        let score = c.score || null;
        if (!score && src) score = lookupIntlScore(src, c.nome, rondaNum);
        return {
          nome: c.nome || "",
          fed: null,
          clube: null,
          pais: c.pais || null,
          score,
        };
      }),
    };
  });
}

// ─── Intl automáticos: draws dos ficheiros MAJOR (GolfGenius) ─────────
// Os tee sheets do GolfGenius ({slug}_{ano}.json, divisions[].draws) trazem os
// grupos de cada volta — o Faldo Madeira 2026, por exemplo. Cada volta em que o
// Manuel aparece vira uma ronda Intl, com os scores do leaderboard da divisão.
// As provas que já estão nos overrides manuais (mesmo nome + ronda) ficam lá.
const MESES_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function ggDateIso(label, year) {
  const m = String(label || "").match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})/);
  if (!m || !MESES_EN[m[1].toLowerCase()]) return null;
  return `${year}-${String(MESES_EN[m[1].toLowerCase()]).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}
function buildMajorDrawPairings(jaCobertos, eEle) {
  const out = [];
  const files = fs.readdirSync(DATA).filter((f) => /^[a-z0-9]+_\d{4}\.json$/.test(f));
  for (const f of files) {
    const j = readJSONCached(path.join(DATA, f));
    if (!j || !Array.isArray(j.divisions) || !j.divisions.some((d) => d.draws && Object.keys(d.draws).length)) continue;
    const year = j.year || Number(f.match(/_(\d{4})\./)[1]);
    const nome = `${j.tournament || f.replace(/\.json$/, "")} ${year}`;
    const campo = typeof j.course === "string" ? j.course : (j.course && j.course.name) || null;
    const vistas = new Set();
    for (const dv of j.divisions) {
      const byName = new Map((dv.players || []).map((p) => [normName(p.name), p]));
      const sumPar = (r) => Array.isArray(r && r.pars) && r.pars.length ? r.pars.reduce((a, b) => a + (Number(b) || 0), 0) : null;
      const scoreOf = (nm, rn, dataLbl) => {
        const p = byName.get(normName(nm));
        if (!p) return null;
        const r = (p.rounds || []).find((x) => dataLbl && x.date === dataLbl) || (p.rounds || []).find((x) => Number(x.day) === rn);
        if (!r || r.gross == null) return null;
        const par = sumPar(r);
        return { gross: Number(r.gross), toPar: par != null ? Number(r.gross) - par : null };
      };
      for (const [rnKey, rd] of Object.entries(dv.draws || {})) {
        const rn = Number(rd.round || rnKey);
        for (const g of rd.groups || []) {
          const nomes = (g.players || []).map((x) => x.name);
          const mNome = nomes.find((n) => eEle(n));
          if (!mNome) continue;
          const key = `${rn}|${g.time}`;
          if (vistas.has(key) || jaCobertos.has(`${normName(nome)}|${rn}`)) continue;
          vistas.add(key);
          out.push({
            circuito: "Intl",
            torneioId: `gg-${f.replace(/\.json$/, "")}`,
            torneioNome: nome,
            data: ggDateIso(rd.date || rd.label, year),
            ronda: rn,
            teeTime: g.time || null,
            startHole: g.startHole != null ? Number(g.startHole) : null,
            campo,
            fonte: `GolfGenius tee sheet (${f})`,
            jogadorScore: scoreOf(mNome, rn, rd.date),
            companheiros: nomes.filter((n) => n !== mNome).map((n) => {
              const p = byName.get(normName(n)) || {};
              return { nome: n, fed: p.fed || null, clube: p.club || null, pais: p.country || null, score: scoreOf(n, rn, rd.date) };
            }),
          });
        }
      }
    }
  }
  return out;
}

// ─── Intl automáticos: draws GolfGenius das provas francesas (FFG) ────
// public/data/ffgolf/{ano}_{slug}.json — `draws` [{ round, label, dateIso,
// course, groups[{ teeTime, players[{ name, club, country }] }] }] e os scores
// em `players[].rounds` (23/11/2026, «e os do ricardo em frança?»). As horas
// dos resultados FFG (ffgolf-resultats) NÃO entram: cada jogador traz uma só
// hora sem dizer de que volta é — só 35% das séries com várias voltas batem
// com «última volta» (medido a 23/11/2026); seria adivinhar os grupos.
function buildFfgDrawPairings(jaCobertos, eEle) {
  const out = [];
  const dir = path.join(DATA, "ffgolf");
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const j = readJSONCached(path.join(dir, f));
    if (!j || !Array.isArray(j.draws) || !j.draws.some((d) => (d.groups || []).length)) continue;
    const nome = `${j.tournament || f.replace(/\.json$/, "")} ${j.year || ""}`.trim();
    const parTotal = j.course && Array.isArray(j.course.par) && j.course.par.length
      ? j.course.par.reduce((a, b) => a + (Number(b) || 0), 0) : null;
    // O mesmo jogador pode vir em várias divisões: juntam-se as voltas.
    const voltas = new Map();
    for (const p of j.players || []) {
      const k = normName(p.name);
      if (!voltas.has(k)) voltas.set(k, { club: p.club || null, country: p.country || null, rounds: [] });
      voltas.get(k).rounds.push(...(p.rounds || []));
    }
    const scoreOf = (nm, rn) => {
      const r = ((voltas.get(normName(nm)) || {}).rounds || []).find((x) => Number(x.round) === rn && x.gross != null);
      return r ? { gross: Number(r.gross), toPar: parTotal != null ? Number(r.gross) - parTotal : null } : null;
    };
    for (const d of j.draws) {
      const rn = Number(d.round);
      if (jaCobertos.has(`${normName(nome)}|${rn}`)) continue;
      for (const g of d.groups || []) {
        const nomes = (g.players || []).map((x) => x.name);
        const eu = nomes.find((n) => eEle(n));
        if (!eu) continue;
        out.push({
          circuito: "Intl",
          torneioId: `ffg-${f.replace(/\.json$/, "")}`,
          torneioNome: nome,
          data: d.dateIso || null,
          ronda: rn,
          teeTime: g.teeTime || null,
          startHole: g.startHole != null ? Number(g.startHole) : null,
          campo: d.course || (j.course && j.course.name) || null,
          fonte: `GolfGenius (ffgolf/${f}) — ${d.label || `R${rn}`}`,
          jogadorScore: scoreOf(eu, rn),
          companheiros: nomes.filter((n) => n !== eu).map((n) => {
            const v = voltas.get(normName(n)) || {};
            return { nome: n, fed: null, clube: v.club || null, pais: v.country || null, score: scoreOf(n, rn) };
          }),
        });
      }
    }
  }
  return out;
}

// ─── Intl automáticos: partidas RMS9 das provas francesas ────────────
// public/data/ffgolf-rms9-startlists.json (scrape-ffgolf-rms9-startlists.js):
// as listas de partidas que os organizadores publicam no RMS9 — os grupos
// reais de cada volta (23/11/2026, «queria mais draws de frança..»). Os scores
// vêm dos resultados FFG da mesma prova (ffgolf-resultats, pelo índice).
// Uma volta que o jogador já tem pelo GolfGenius no mesmo dia fica de fora.
let _rms9Provas = null;
function rms9Provas() {
  if (_rms9Provas) return _rms9Provas;
  _rms9Provas = [];
  const sl = readJSON(path.join(DATA, "ffgolf-rms9-startlists.json"));
  const ix = readJSON(path.join(DATA, "ffgolf-resultats-index.json"));
  if (!sl || !ix) return _rms9Provas;
  const byTrn = new Map((ix.tournaments || []).map((t) => [String(t.trnId), t]));
  for (const [trnId, t] of Object.entries(sl.tournaments || {})) {
    if (!(t.rounds || []).some((r) => r.flights.length)) continue;
    const meta = byTrn.get(trnId);
    if (!meta) continue;
    // Scores por jogador (chave do nome) → { t1..t4, parTotal da série dele }.
    const scores = new Map();
    const res = meta.file ? readJSON(path.join(DATA, "ffgolf-resultats", meta.file)) : null;
    const series = res ? (Array.isArray(res.details) ? res.details : Object.values(res.details || {}).flat()) : [];
    for (const s of series) {
      for (const p of (s && s.players) || []) {
        const k = chaveNome(p.name);
        if (k && !scores.has(k)) scores.set(k, { p, parTotal: s.parTotal != null ? Number(s.parTotal) : null });
      }
    }
    _rms9Provas.push({ trnId, meta, rounds: t.rounds, scores });
  }
  return _rms9Provas;
}
function buildRms9DrawPairings(eEle, diasJaCobertos) {
  const out = [];
  for (const { trnId, meta, rounds, scores } of rms9Provas()) {
    const scoreOf = (nm, rn) => {
      const e = scores.get(chaveNome(nm));
      const g = e ? e.p[`t${rn}`] : null;
      return g != null && Number(g) > 0 ? { gross: Number(g), toPar: e.parTotal != null ? Number(g) - e.parTotal : null } : null;
    };
    for (const r of rounds) {
      if (r.date && diasJaCobertos.has(r.date)) continue;
      for (const f of r.flights) {
        const eu = f.p.find((x) => eEle(x.n));
        if (!eu) continue;
        out.push({
          circuito: "Intl",
          torneioId: `rms9-${trnId}`,
          torneioNome: `${meta.name}${meta.year && !String(meta.name).includes(String(meta.year)) ? ` ${meta.year}` : ""}`,
          data: r.date || meta.dateIso || null,
          ronda: Number(r.number),
          teeTime: f.t || null,
          startHole: f.h != null ? Number(f.h) : null,
          campo: (Array.isArray(meta.course) ? meta.course[0] : meta.course) || null,
          fonte: "RMS9 (partidas do organizador)",
          jogadorScore: scoreOf(eu.n, Number(r.number)),
          companheiros: f.p.filter((x) => x !== eu).map((x) => ({
            nome: x.n, fed: null, clube: x.c || null, pais: null, score: scoreOf(x.n, Number(r.number)),
          })),
        });
      }
    }
  }
  return out;
}

// ─── Lista de torneios FPG de um jogador (cobertura) ─────────────────

function buildTournamentsList(fed) {
  const scPath = path.join(ROOT, "output", fed, "scorecards.json");
  if (!fs.existsSync(scPath)) return [];
  const d = readJSON(scPath);
  if (!d) return [];
  const torneios = new Map();
  for (const sid of Object.keys(d)) {
    const sc = d[sid];
    if (sc.score_origin !== "Torn") continue;
    if (String(sc.federated_code || "") !== fed) continue;
    const cc = sc.club_code, tc = sc.tournament_code;
    if (!cc || !tc) continue;
    const key = `${cc}-${tc}`;
    let entry = torneios.get(key);
    if (!entry) {
      entry = {
        torneioId: key, ccode: cc, tcode: tc,
        nome: sc.tournament_description || "",
        data: normIsoDate(sc.played_at) || null,
        rondas: [],
      };
      torneios.set(key, entry);
    }
    entry.rondas.push(Number(sc.round_number));
    if (sc.tournament_description && !entry.nome) entry.nome = sc.tournament_description;
    const d2 = normIsoDate(sc.played_at);
    if (d2 && (!entry.data || d2 < entry.data)) entry.data = d2;
  }
  return [...torneios.values()];
}

// ─── main ──────────────────────────────────────────────────────────

function mergeCgssDraws(fpg) {
  // Funde draws curados manuais nos torneios FPG antes de extrair os pairings.
  // Dois ficheiros:
  //   - cgss-draws-manual.json : sociais CGSS (PDFs). fixMeta!=false -> nome/data
  //     do PDF sao autoritativos (scraper deixava placeholder "Torneio NNNN").
  //   - pja-draws-manual.json  : PJA Tour (imagens/Excel). fixMeta:false -> nome/
  //     data do scrape sao reais; so preenche os draws.
  if (!Array.isArray(fpg.tournaments)) fpg.tournaments = [];
  const hasDraws = (t) => t && t.draws && Object.keys(t.draws).length > 0;
  const byKey = new Map(fpg.tournaments.map((t) => [`${t.ccode}-${t.tcode}`, t]));
  let preenchidos = 0, injectados = 0;
  for (const file of ["cgss-draws-manual.json", "pja-draws-manual.json"]) {
    const cur = readJSON(path.join(DATA, file));
    if (!cur || !Array.isArray(cur.tournaments)) continue;
    for (const c of cur.tournaments) {
      const fixMeta = c.fixMeta !== false;
      const ex = byKey.get(`${c.ccode}-${c.tcode}`);
      if (ex) {
        if (!hasDraws(ex)) { ex.draws = c.draws; preenchidos++; }
        if (fixMeta) {
          if (c.name) ex.name = c.name;
          if (c.date) ex.date = c.date;
          if (c.campo) ex.campo = c.campo;
        }
      } else {
        const pushed = { ccode: c.ccode, tcode: c.tcode, name: c.name,
          date: c.date, campo: c.campo, draws: c.draws };
        fpg.tournaments.push(pushed);
        byKey.set(`${c.ccode}-${c.tcode}`, pushed);
        injectados++;
      }
    }
  }
  console.log(`  draws manuais (CGSS+PJA): ${preenchidos} preenchidos, ${injectados} injectados`);
}

// ─── Montar o ficheiro de um jogador ───────────────────────────────

// Companheiros FPG sem licença: resolve pelo nome DENTRO das rondas deste
// jogador (com o clube a desempatar homónimos) e dá a todos o nome canónico.
function resolverCompanheirosPorNome(fpgPairings, nomeIdx) {
  const nomeToFeds = new Map();
  const nomeClubeToFed = new Map();
  for (const r of fpgPairings) for (const c of r.companheiros) {
    if (c.fed && c.nome) {
      const nm = normName(c.nome);
      if (!nomeToFeds.has(nm)) nomeToFeds.set(nm, new Set());
      nomeToFeds.get(nm).add(c.fed);
      if (c.clube) {
        const k = `${nm}|${normName(c.clube)}`;
        if (!nomeClubeToFed.has(k)) nomeClubeToFed.set(k, c.fed);
      }
    }
  }
  let resolvidos = 0;
  for (const r of fpgPairings) for (const c of r.companheiros) {
    if (!c.fed && c.nome) {
      const nm = normName(c.nome);
      const feds = nomeToFeds.get(nm);
      if (feds && feds.size === 1) {
        c.fed = [...feds][0];
        resolvidos++;
      } else if (feds && feds.size > 1 && c.clube) {
        const fed = nomeClubeToFed.get(`${nm}|${normName(c.clube)}`);
        if (fed) { c.fed = fed; resolvidos++; }
      }
    }
  }
  for (const r of fpgPairings) for (const c of r.companheiros) {
    if (c.fed) {
      const nm = nomeIdx.get(c.fed);
      if (nm) c.nome = nm;
    }
  }
  return resolvidos;
}

// Volta de treino (override «<id>-pr», ronda 0) fica JUNTO do torneio (Mariana,
// 19/11/2026: «deveria ficar tudo junto… as voltas de treino com o torneio»):
// ganha o id, o nome, o circuito e o campo do torneio, e aparece como «PR» no
// mesmo cartão. Sem pairings do torneio, fica sozinha como estava.
function juntarTreinos(todas) {
  const torneioDoTreino = new Map();
  for (const r of todas) {
    if (!/-pr$/.test(r.torneioId) && !torneioDoTreino.has(r.torneioId)) torneioDoTreino.set(r.torneioId, r);
  }
  return todas.map((r) => {
    const t = r.ronda === 0 && /-pr$/.test(r.torneioId) ? torneioDoTreino.get(r.torneioId.slice(0, -3)) : null;
    return t ? { ...r, circuito: t.circuito, torneioId: t.torneioId, torneioNome: t.torneioNome, campo: t.campo || r.campo, treino: true } : r;
  });
}

const porDataDesc = (a, b) => (b.data || "").localeCompare(a.data || "");
const resumoTorneio = (t) => ({ torneioId: t.torneioId, nome: t.nome, data: t.data, rondas: t.rondas.length });

// Cobertura FPG: os torneios do jogador (scorecards dele) com e sem draw.
function coberturaFpg(tournList, fpgPairings) {
  const torneiosTotal = new Set(tournList.map(t => t.torneioId));
  const comDraw = new Set(fpgPairings.map(r => r.torneioId));
  const semDraw = tournList.filter(t => !comDraw.has(t.torneioId));
  return {
    rondasJogadas: tournList.reduce((s, t) => s + t.rondas.length, 0),
    rondasComDraw: fpgPairings.length,
    torneiosJogados: torneiosTotal.size,
    torneiosComDraw: comDraw.size,
    torneiosComDrawDetalhe: tournList.filter(t => comDraw.has(t.torneioId)).sort(porDataDesc).map(resumoTorneio),
    torneiosSemDraw: [...torneiosTotal].filter(tid => !comDraw.has(tid) && !SKIP_CCODES.has(tid.split("-")[0])).sort(),
    torneiosSemDrawDetalhe: semDraw.filter(t => !SKIP_CCODES.has(t.ccode)).sort(porDataDesc).map(resumoTorneio),
    // Excluídos pelo SKIP_CCODES — para diagnóstico (ccode 982 = Drive Challenge
    // Madeira; a FPG reatribuiu o ccode a Açores e os antigos ficaram sem draws)
    torneiosSkippedDetalhe: semDraw.filter(t => SKIP_CCODES.has(t.ccode)).sort(porDataDesc).map(resumoTorneio),
    skipCcodes: [...SKIP_CCODES],
  };
}

// Cobertura USKids — SÓ torneios que o jogador JOGOU. O uskids-draws.json
// inclui escalões de provas que ele não jogou (capturadas para o tracker de
// rivais); contá-las no denominador dava uma cobertura alarmista. Universo:
//   member-history-slim (carreira dele, pelos memberIds) ∪ torneios com pairing
//   (cobre provas a decorrer que ainda não entraram no member-history).
// Os tee times USKids são efémeros (sem backfill) — provas antigas fora deste
// universo não são «draws em falta».
function coberturaUskids(uskidsPairings, memberIds, slim, uskidsDraws) {
  const mhTorneios = new Map(); // tcode → { nome, data, rondas jogadas }
  if (slim && slim.jogadores) {
    for (const mid of memberIds) {
      const p = slim.jogadores[mid];
      if (!p) continue;
      for (const [tc, tt] of Object.entries(p.torneios || {})) {
        const meta = (slim.torneios || {})[tc] || {};
        const nR = Object.keys(tt.rounds || {}).length;
        const prev = mhTorneios.get(tc);
        if (!prev || nR > prev.rondas) {
          mhTorneios.set(tc, { nome: meta.name || tc, data: normIsoDate(meta.startDate) || null, rondas: nR });
        }
      }
    }
  }
  const porT = new Map(); // tcode → nº rondas com draw
  for (const r of uskidsPairings) {
    const tc = r.torneioId.replace(/^usk-/, "");
    porT.set(tc, (porT.get(tc) || 0) + 1);
  }
  const universo = new Set([...mhTorneios.keys(), ...porT.keys()]);
  let rondasEsperadas = 0;
  const semDraw = [];
  for (const tc of universo) {
    const played = mhTorneios.get(tc);
    const comDraw = porT.get(tc) || 0;
    rondasEsperadas += Math.max(played ? played.rondas : 0, comDraw);
    if (comDraw === 0 && played) {
      const dt = (uskidsDraws.torneios || []).find(x => String(x.t) === tc);
      semDraw.push({
        torneioId: `usk-${tc}`,
        nome: (dt && dt.name) || played.nome,
        data: normIsoDate(dt && dt.date_inicio) || played.data,
        rondas: played.rondas,
      });
    }
  }
  return {
    rondasJogadas: rondasEsperadas,
    rondasComDraw: uskidsPairings.length,
    torneiosJogados: universo.size,
    torneiosComDraw: porT.size,
    torneiosSemDrawDetalhe: semDraw.sort(porDataDesc),
  };
}

/**
 * O ficheiro de pairings de um jogador. `fpgPairings` é alterado (resolução de
 * companheiros por nome). Registos «conhecidos» (ronda -1 — jogadores que o
 * Manuel conhece mas com quem nunca jogou) ficam fora da cobertura Intl.
 */
function montarFicheiro({ fed, uskidsIds, fpgPairings, uskidsPairings, intlPairings, tournList, nomeIdx, slim, uskidsDraws }) {
  const resolvidos = resolverCompanheirosPorNome(fpgPairings, nomeIdx);
  const rondas = juntarTreinos([...fpgPairings, ...uskidsPairings, ...intlPairings]).sort((a, b) => {
    const da = a.data || "0000-00-00", db = b.data || "0000-00-00";
    if (da !== db) return db.localeCompare(da);
    return (a.ronda || 0) - (b.ronda || 0);
  });
  const compSet = new Set();
  for (const r of rondas) for (const c of r.companheiros) {
    compSet.add(c.fed ? `fed:${c.fed}` : `name:${normName(c.nome)}|${c.pais || ""}`);
  }
  // Depois de juntar as voltas de treino: as de provas USKids contam lá, não aqui.
  const intlReais = rondas.filter(r => r.circuito === "Intl" && r.ronda >= 0);
  const intlTorneios = new Set(intlReais.map(r => r.torneioId)).size;
  return {
    resolvidos,
    // Sem `geradoEm`: um ficheiro que não mudou fica igual byte a byte (o git
    // não vê 200 ficheiros alterados a cada corrida). A hora vai no índice.
    ficheiro: {
      fed,
      uskidsIds,
      totalRondas: rondas.length,
      totalCompanheirosUnicos: compSet.size,
      cobertura: {
        fpg: coberturaFpg(tournList, fpgPairings),
        uskids: coberturaUskids(uskidsPairings, uskidsIds, slim, uskidsDraws),
        intl: { rondasJogadas: intlReais.length, rondasComDraw: intlReais.length, torneiosJogados: intlTorneios, torneiosComDraw: intlTorneios },
      },
      rondas,
    },
  };
}

// Chave de um nome sem olhar à ordem das palavras: o GolfGenius escreve
// «CASTRO FERREIRA Ricardo», o Kids 2 «Ricardo Castro Ferreira».
function chaveNome(s) {
  return normName(s).replace(/[,.]/g, " ").split(/[\s-]+/).filter(Boolean).sort().join(" ");
}

// Nomes de fora (USKids, GolfGenius) de cada federado, pelo Kids 2
// (juniors-links.json: [id, nome, aliases | 0, memberId?, fed?]) — o mesmo
// caminho das setas ↗. Um nome que o Kids 2 dá a mais do que um federado não
// conta (homónimos), nem um que seja o do Manuel (o pai, 54907, também se
// chama «Manuel Medeiros»).
function nomesKids2PorFed(links) {
  const fedsDoNome = new Map();
  const idsPorFed = new Map();
  for (const [, nome, aliases, memberId, fed] of (links && links.j) || []) {
    if (!fed) continue;
    for (const n of [nome, ...(Array.isArray(aliases) ? aliases : [])]) {
      const nm = chaveNome(n);
      if (!nm || isManuel(n)) continue;
      if (!fedsDoNome.has(nm)) fedsDoNome.set(nm, new Set());
      fedsDoNome.get(nm).add(String(fed));
    }
    if (memberId) {
      if (!idsPorFed.has(String(fed))) idsPorFed.set(String(fed), new Set());
      idsPorFed.get(String(fed)).add(String(memberId));
    }
  }
  const nomesPorFed = new Map();
  for (const [nm, feds] of fedsDoNome) {
    if (feds.size !== 1) continue;
    const fed = [...feds][0];
    if (!nomesPorFed.has(fed)) nomesPorFed.set(fed, new Set());
    nomesPorFed.get(fed).add(nm);
  }
  return { nomesPorFed, idsPorFed };
}

const indiceTorneios = (lista) => new Map(lista.map(t => [t.torneioId, t]));

// ─── main ──────────────────────────────────────────────────────────

function main() {
  console.log("[pairings-build] a ler…");
  const fpg = readJSON(path.join(DATA, "fpg-admissions-draws.json")) || { tournaments: [] };
  mergeCgssDraws(fpg);  // injecta draws curados CGSS (PDFs) antes de extrair pairings
  const uskidsDraws = readJSON(path.join(DATA, "uskids-draws.json")) || { torneios: [] };
  const uskidsResults = readJSON(path.join(DATA, "uskids-results.json")) || { resultados: [] };
  const overrides = readJSON(path.join(DATA, "manuel-draws-overrides.json"));
  const slim = readJSON(path.join(DATA, "uskids-member-history-slim.json"));

  const fpgScoreIdx = buildFpgScoreIndex();
  const fpgScoreByNameIdx = buildFpgScoreIndexByName();
  const clubeIdx = buildFpgClubeIndex(fpg);
  const nomeIdx = buildFpgNomeIndex(fpg, fpgScoreIdx);
  const uskScoreIdx = buildUskidsScoreIndex(uskidsResults);

  const injectados = applyUskidsOverrides(uskidsDraws, overrides);
  console.log(`  USKids overrides aplicados: ${injectados} grupos`);

  const groupsByFed = indexGroupsByFed(buildFpgGroups(fpg, fpgScoreIdx, fpgScoreByNameIdx, nomeIdx, clubeIdx));

  // ── Manuel: FPG + USKids + internacionais (overrides e tee sheets MAJOR) ──
  const manuelTournamentsList = buildTournamentsList(MANUEL_FED);
  const fpgPairings = fpgPairingsDe(MANUEL_FED, groupsByFed, indiceTorneios(manuelTournamentsList));
  const uskidsPairings = extractUskidsPairings(uskidsDraws, uskScoreIdx, isManuel, true);
  const intlPairings = buildIntlPairingsFromOverrides(overrides);
  const cobertosIntl = new Set(intlPairings.map((r) => `${normName(r.torneioNome)}|${r.ronda}`));
  const majorPairings = buildMajorDrawPairings(cobertosIntl, isManuel);
  const ffgPairings = buildFfgDrawPairings(cobertosIntl, isManuel);
  const rms9Pairings = buildRms9DrawPairings(isManuel, new Set(ffgPairings.map((r) => r.data)));
  console.log(`  MAJOR (tee sheets GolfGenius): ${majorPairings.length} ronda(s) do Manuel · França: GolfGenius ${ffgPairings.length}, RMS9 ${rms9Pairings.length}`);
  intlPairings.push(...majorPairings, ...ffgPairings, ...rms9Pairings);

  const { ficheiro, resolvidos } = montarFicheiro({
    fed: MANUEL_FED, uskidsIds: MANUEL_USKIDS_IDS, fpgPairings, uskidsPairings, intlPairings,
    tournList: manuelTournamentsList, nomeIdx, slim, uskidsDraws,
  });
  const out = { geradoEm: new Date().toISOString(), ...ficheiro };
  const outPath = path.join(DATA, "manuel-pairings.json");
  writeAtomic(outPath, JSON.stringify(out, null, 2), "utf8");
  const cov = out.cobertura;
  const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
  console.log(`[pairings-build] escrito: ${outPath}`);
  console.log(`  FPG: ${cov.fpg.rondasComDraw}/${cov.fpg.rondasJogadas} rondas (${pct(cov.fpg.rondasComDraw, cov.fpg.rondasJogadas)}%), ${cov.fpg.torneiosComDraw}/${cov.fpg.torneiosJogados} torneios`);
  console.log(`  USKids: ${cov.uskids.rondasComDraw}/${cov.uskids.rondasJogadas} rondas (${pct(cov.uskids.rondasComDraw, cov.uskids.rondasJogadas)}%), ${cov.uskids.torneiosComDraw}/${cov.uskids.torneiosJogados} torneios`);
  console.log(`  Intl: ${cov.intl.rondasJogadas} rondas, ${cov.intl.torneiosJogados} torneios (Bluegolf+Doral via overrides)`);
  console.log(`  Companheiros únicos: ${out.totalCompanheirosUnicos}, fed resolvidos: ${resolvidos}`);

  // ── Os outros jogadores seguidos (23/11/2026): FPG + USKids + GolfGenius
  // (tee sheets MAJOR e provas francesas). Ficam de fora os registos à mão
  // (manuel-draws-overrides.json), que são só do Manuel.
  // Um ficheiro por jogador com rondas, em public/data/pairings/{fed}.json, e
  // o índice (quem tem) em public/data/pairings/index.json — a ficha só
  // mostra a vista «Draws» a quem lá está.
  const players = readJSON(path.join(DATA, "players.json"));
  if (!players) { console.error("[pairings-build] players.json ilegível — não gravo os pairings dos outros jogadores"); process.exitCode = 1; return; }
  const links = readJSON(path.join(DATA, "juniors-links.json"));
  if (!links) { console.error("[pairings-build] juniors-links.json ilegível — não gravo os pairings dos outros jogadores"); process.exitCode = 1; return; }
  const { nomesPorFed, idsPorFed } = nomesKids2PorFed(links);

  const ficheiros = new Map();
  for (const fed of Object.keys(players)) {
    if (fed === MANUEL_FED || !isFedCode(fed)) continue;
    const tournList = buildTournamentsList(fed);
    const fpgP = fpgPairingsDe(fed, groupsByFed, indiceTorneios(tournList));
    const nomes = nomesPorFed.get(fed);
    const eEle = (n) => !!nomes && nomes.has(chaveNome(n));
    const uskP = nomes ? extractUskidsPairings(uskidsDraws, uskScoreIdx, eEle, false) : [];
    const ffgP = nomes ? buildFfgDrawPairings(new Set(), eEle) : [];
    const intlP = nomes ? [
      ...buildMajorDrawPairings(new Set(), eEle), ...ffgP,
      ...buildRms9DrawPairings(eEle, new Set(ffgP.map((r) => r.data))),
    ] : [];
    if (!fpgP.length && !uskP.length && !intlP.length) continue;
    const { ficheiro } = montarFicheiro({
      fed, uskidsIds: [...(idsPorFed.get(fed) || [])], fpgPairings: fpgP, uskidsPairings: uskP, intlPairings: intlP,
      tournList, nomeIdx, slim, uskidsDraws,
    });
    ficheiros.set(fed, ficheiro);
  }

  const dir = path.join(DATA, "pairings");
  fs.mkdirSync(dir, { recursive: true });
  const indice = { geradoEm: new Date().toISOString(), jogadores: {} };
  for (const [fed, f] of [...ficheiros].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    indice.jogadores[fed] = f.rondas.filter(r => r.ronda >= 0).length;
  }
  const totalRondas = (d) => Object.values(d.jogadores).reduce((s, n) => s + n, 0);
  // Guarda anti-encolhimento no índice: se as fontes vierem vazias, não se
  // apagam os ficheiros que já estão em disco.
  const r = writeJsonGuarded(path.join(dir, "index.json"), indice, {
    count: totalRondas, maxDrop: 0.3, force: hasForceFlag(), label: "pairings/index", failOnRefuse: true,
  });
  if (!r.written) return;
  for (const [fed, f] of ficheiros) writeAtomic(path.join(dir, `${fed}.json`), JSON.stringify(f), "utf8");
  let apagados = 0;
  for (const nome of fs.readdirSync(dir)) {
    const m = nome.match(/^(\d+)\.json$/);
    if (m && !ficheiros.has(m[1])) { fs.unlinkSync(path.join(dir, nome)); apagados++; }
  }
  console.log(`[pairings-build] outros jogadores seguidos: ${ficheiros.size} com draws, ${totalRondas(indice)} rondas${apagados ? `, ${apagados} ficheiro(s) que deixaram de ter draws apagados` : ""} → ${dir}`);
}

main();
