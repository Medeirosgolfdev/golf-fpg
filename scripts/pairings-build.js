// pairings-build.js — gera public/data/manuel-pairings.json
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
function listFiles(prefix) {
  return fs.readdirSync(DATA).filter(f => f.startsWith(prefix) && f.endsWith(".json")).map(f => path.join(DATA, f));
}
// Ficheiros com scores FPG (formato "fpg-pull": {tournaments:[{ccode,tcode,players}]}).
// Inclui os standalone `torneio-{ccode}-{tcode}.json` — torneios scrapados a parte,
// fora da numeracao pull-torneios (os mesmos que a FPGPage carrega em
// EXTRA_TOURN_FILES). Sem eles, os draws desses torneios ficavam sem scores
// (manuelScore/companheiros a null) no manuel-pairings.json.
function listFpgScoreFiles() {
  return [
    ...listFiles("pull-torneios"), ...listFiles("drive-data-"), ...listFiles("aquapor-data-"),
    ...listFiles("jovens_"), ...listFiles("clubes_"),
    ...fs.readdirSync(DATA).filter(f => /^torneio-\d+-\d+\.json$/.test(f)).map(f => path.join(DATA, f)),
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

function extractFpgPairings(fpg, scoreIdx, scoreByNameIdx, nomeIdx, clubeIdx, manuelTournIdx) {
  const out = [];
  for (const t of fpg.tournaments || []) {
    // ccode 982 (Madeira histórico) NÃO é excluído aqui:
    //   - FPG reatribuiu o ccode (era Madeira, agora Açores), mas os torneios
    //     históricos do Manuel (CGSS Santo da Serra) podem ainda aparecer
    //     legitimamente sob esse ccode nos snapshots antigos
    //   - O filtro de `manuelIdx === -1` mais abaixo já garante que torneios
    //     onde o Manuel não está (incluindo torneios novos em Açores) são
    //     ignorados — não há perigo de injectar dados errados
    //   - O `SKIP_CCODES` continua a ser usado no cálculo de cobertura para
    //     não listar torneios novos de Açores como "rondas sem draw"
    const torneioId = `${t.ccode}-${t.tcode}`;
    // Resolução de nome/data — preferir scorecards.json (autoritativo) quando
    // o fpg-admissions-draws.json trouxer placeholders (ex: "Torneio 10514"
    // / data=hoje, resíduo de scrape passado com tcode fora do scope).
    const m = manuelTournIdx ? manuelTournIdx.get(torneioId) : null;
    const tNameRaw = t.name || (t.admissions && t.admissions.name) || null;
    const tNameIsPlaceholder = tNameRaw && /^Torneio\s+\d+$/i.test(String(tNameRaw).trim());
    const tDateRaw = normIsoDate(t.date || (t.admissions && t.admissions.date) || null);
    // A data das admissions é muitas vezes um placeholder do scraper (data do
    // scrape, ex 2026-05-27, ou "hoje"). A data autoritativa vem dos scorecards
    // do Manuel (manuelTournIdx) — preferir SEMPRE m.data quando existe. Corrige
    // torneios antigos (ex "World Kids 2024") que apareciam com 27/05/2026.
    const data = (m && m.data) ? m.data : tDateRaw;
    const torneioNome = (tNameIsPlaceholder && m && m.nome)
      ? m.nome
      : (tNameRaw || (m && m.nome) || torneioId);
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
        const players = grp.players || [];
        // Detecção do Manuel por LICENÇA primeiro: quando um jogador traz fed
        // (campo `fed` ou `clube` com aparência de fed), a licença decide — assim
        // o homónimo "Manuel Medeiros" (fed 54907) NUNCA é confundido com o júnior
        // (fed 52884) em draws completos onde ambos aparecem. Só sem fed é que se
        // recorre à heurística por nome.
        const manuelIdx = players.findIndex(p => {
          const pf = (p.fed && String(p.fed).trim())
            || (isFedCode(p.clube) ? String(p.clube).trim() : null);
          if (pf) return pf === MANUEL_FED;
          return isManuel(p.nome);
        });
        if (manuelIdx === -1) continue;

        const companheiros = players.map((p, i) => {
          if (i === manuelIdx) return null;
          // Prioridade do `fed`: campo explícito do jogador (síntese/scrape novo)
          // > clube com aparência de fed (scraper FPG legacy) > lookup por nome.
          const pFed = p.fed && String(p.fed).trim() ? String(p.fed).trim() : null;
          const rawClube = String(p.clube || "").trim();
          const isNumericFed = isFedCode(rawClube);
          const fed = pFed || (isNumericFed ? rawClube : localNameToFed.get(normName(p.nome)) || null);
          const clubeTexto = (!isNumericFed && rawClube) ? rawClube : (fed && clubeIdx.get(fed)) || null;
          // Score: cruzar por fed; se falhar (ou sem fed, ex: emigrante), tentar
          // por NOME dentro do mesmo torneio (seguro — mesmo evento).
          const scInfo = (fed ? tScores.get(fed) : null) || tScoresByName.get(normName(p.nome)) || null;
          const rs = scInfo ? findRoundScore(scInfo.roundScores, rondaNum) : null;
          const parTot = rs && Array.isArray(rs.pars) ? rs.pars.reduce((a, b) => a + (Number(b) || 0), 0) : null;
          const toPar = rs && rs.gross != null && parTot != null ? Number(rs.gross) - parTot : null;
          return {
            nome: (nomeIdx.get(fed) || p.nome || "").trim(),
            fed, clube: clubeTexto, pais: null,
            score: rs && rs.gross != null && Number(rs.gross) < 200 ? { gross: Number(rs.gross), toPar } : null,
          };
        }).filter(Boolean);

        const mInfo = tScores.get(MANUEL_FED) || tScoresByName.get(normName("Manuel Goulartt Medeiros"));
        const mrs = mInfo ? findRoundScore(mInfo.roundScores, rondaNum) : null;
        const mParTot = mrs && Array.isArray(mrs.pars) ? mrs.pars.reduce((a, b) => a + (Number(b) || 0), 0) : null;
        const mToPar = mrs && mrs.gross != null && mParTot != null ? Number(mrs.gross) - mParTot : null;

        out.push({
          circuito: "FPG",
          torneioId, torneioNome, data,
          ronda: rondaNum,
          teeTime: grp.teeTime || null,
          startHole: grp.startHole != null ? Number(grp.startHole) : null,
          campo: t.campo || null,
          manuelScore: mrs && mrs.gross != null && Number(mrs.gross) < 200 ? { gross: Number(mrs.gross), toPar: mToPar } : null,
          companheiros,
        });
      }
    }
  }
  return out;
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

function extractUskidsPairings(uskidsDraws, scoreIdx) {
  const out = [];
  for (const t of uskidsDraws.torneios || []) {
    const torneioId = `usk-${t.t}`;
    const torneioNome = t.name;
    const dataBase = normIsoDate(t.date_inicio || null);
    for (const esc of t.escaloes || []) {
      if (!esc.is_manuel) continue;
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
          const manuelIdx = jogadores.findIndex(j => isManuel(j.nome));
          if (manuelIdx === -1) continue;
          const companheiros = jogadores.map((j, i) => {
            if (i === manuelIdx) return null;
            const lbE = lbByName.get(normName(j.nome));
            return {
              nome: (j.nome || "").trim(),
              fed: null, clube: null, pais: j.pais || null,
              score: lbE && lbE.score != null ? { gross: Number(lbE.score), toPar: lbE.to_par != null ? Number(lbE.to_par) : null } : null,
            };
          }).filter(Boolean);
          const mLb = lbByName.get(normName(jogadores[manuelIdx].nome)) || lb.find(e => isManuel(e.nome));
          const manuelScore = mLb && mLb.score != null
            ? { gross: Number(mLb.score), toPar: mLb.to_par != null ? Number(mLb.to_par) : null }
            : null;
          out.push({
            circuito: "USKids",
            torneioId, torneioNome, data: dataBase,
            ronda: rondaNum,
            teeTime: grp.tee_time || null,
            startHole: grp.start_hole != null ? Number(grp.start_hole) : null,
            campo: t.campo || grp.course || null,
            manuelScore, companheiros,
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
      manuelScore,
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

// ─── Lista de torneios FPG do Manuel (cobertura) ────────────────────

function buildManuelTournamentsList() {
  const scPath = path.join(ROOT, "output", MANUEL_FED, "scorecards.json");
  if (!fs.existsSync(scPath)) return [];
  const d = readJSON(scPath);
  if (!d) return [];
  const torneios = new Map();
  for (const sid of Object.keys(d)) {
    const sc = d[sid];
    if (sc.score_origin !== "Torn") continue;
    if (String(sc.federated_code || "") !== MANUEL_FED) continue;
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

function main() {
  console.log("[pairings-build] a ler…");
  const fpg = readJSON(path.join(DATA, "fpg-admissions-draws.json")) || { tournaments: [] };
  mergeCgssDraws(fpg);  // injecta draws curados CGSS (PDFs) antes de extrair pairings
  const uskidsDraws = readJSON(path.join(DATA, "uskids-draws.json")) || { torneios: [] };
  const uskidsResults = readJSON(path.join(DATA, "uskids-results.json")) || { resultados: [] };
  const overrides = readJSON(path.join(DATA, "manuel-draws-overrides.json"));

  const fpgScoreIdx = buildFpgScoreIndex();
  const fpgScoreByNameIdx = buildFpgScoreIndexByName();
  const clubeIdx = buildFpgClubeIndex(fpg);
  const nomeIdx = buildFpgNomeIndex(fpg, fpgScoreIdx);
  const uskScoreIdx = buildUskidsScoreIndex(uskidsResults);

  const injectados = applyUskidsOverrides(uskidsDraws, overrides);
  console.log(`  USKids overrides aplicados: ${injectados} grupos`);

  // Pré-construir índice de torneios do Manuel (vindo de scorecards.json) — usado
  // como fallback autoritativo de nome/data quando fpg-admissions-draws.json
  // tem placeholders ("Torneio 10514" / data=hoje).
  const manuelTournamentsList = buildManuelTournamentsList();
  const manuelTournIdx = new Map();
  for (const t of manuelTournamentsList) manuelTournIdx.set(t.torneioId, t);

  const fpgPairings = extractFpgPairings(fpg, fpgScoreIdx, fpgScoreByNameIdx, nomeIdx, clubeIdx, manuelTournIdx);
  const uskidsPairings = extractUskidsPairings(uskidsDraws, uskScoreIdx);
  const intlPairings = buildIntlPairingsFromOverrides(overrides);

  // dedup global FPG por NOME (com fallback nome+clube para homónimos)
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
  // nome canónico para todos com fed
  for (const r of fpgPairings) for (const c of r.companheiros) {
    if (c.fed) {
      const nm = nomeIdx.get(c.fed);
      if (nm) c.nome = nm;
    }
  }

  const rondas = [...fpgPairings, ...uskidsPairings, ...intlPairings].sort((a, b) => {
    const da = a.data || "0000-00-00", db = b.data || "0000-00-00";
    if (da !== db) return db.localeCompare(da);
    return (a.ronda || 0) - (b.ronda || 0);
  });

  const compSet = new Set();
  for (const r of rondas) for (const c of r.companheiros) {
    compSet.add(c.fed ? `fed:${c.fed}` : `name:${normName(c.nome)}|${c.pais || ""}`);
  }

  // Cobertura FPG via scorecards.json (já pré-construído acima)
  const manuelTournaments = manuelTournamentsList;
  const manuelTorneiosTotal = new Set(manuelTournaments.map(t => t.torneioId));
  const manuelRondasTotal = manuelTournaments.reduce((s, t) => s + t.rondas.length, 0);
  const fpgTorneiosComDraw = new Set(fpgPairings.map(r => r.torneioId));
  const torneiosSemDraw = [...manuelTorneiosTotal]
    .filter(tid => !fpgTorneiosComDraw.has(tid))
    .filter(tid => !SKIP_CCODES.has(tid.split("-")[0]))
    .sort();
  const nomesDosTorneiosSemDraw = manuelTournaments
    .filter(t => !fpgTorneiosComDraw.has(t.torneioId))
    .filter(t => !SKIP_CCODES.has(t.ccode))
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
    .map(t => ({ torneioId: t.torneioId, nome: t.nome, data: t.data, rondas: t.rondas.length }));
  // Torneios COM draw — detalhe (nome+data+rondas) para mostrar na UI
  const torneiosComDrawDetalhe = manuelTournaments
    .filter(t => fpgTorneiosComDraw.has(t.torneioId))
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
    .map(t => ({ torneioId: t.torneioId, nome: t.nome, data: t.data, rondas: t.rondas.length }));
  // Torneios silenciosamente excluídos pelo SKIP_CCODES — para diagnóstico
  // (ccode 982 = Drive Challenge Madeira; FPG reatribuiu ccode a Açores
  // e os torneios antigos deixaram de ter draws scrapáveis)
  const torneiosSkippedDetalhe = manuelTournaments
    .filter(t => SKIP_CCODES.has(t.ccode))
    .filter(t => !fpgTorneiosComDraw.has(t.torneioId))
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
    .map(t => ({ torneioId: t.torneioId, nome: t.nome, data: t.data, rondas: t.rondas.length }));

  // Cobertura USKids — SÓ torneios que o Manuel JOGOU. O uskids-draws.json
  // inclui de propósito escalões `is_manuel` de provas que ele NÃO jogou
  // (State Invitationals etc., capturadas para o tracker de rivais — fonte 3
  // do fetch-uskids-draws.js); contá-las no denominador dava um card de
  // cobertura alarmista e enganador na /draws ("20%"). Universo honesto:
  //   member-history-slim (carreira dele) ∪ torneios com pairing extraído
  //   (cobre provas a decorrer que ainda não entraram no member-history).
  // Provas antigas fora deste universo ficam fora de propósito: os tee times
  // USKids são efémeros (sem backfill possível) — não são "draws em falta".
  const uskidsTotal = uskidsPairings.length;
  const slim = readJSON(path.join(DATA, "uskids-member-history-slim.json"));
  const mhTorneios = new Map(); // tcode → { nome, data, rondas jogadas }
  if (slim && slim.jogadores) {
    for (const mid of MANUEL_USKIDS_IDS) {
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
  const uskPairingsByT = new Map(); // tcode → nº rondas com draw
  for (const r of uskidsPairings) {
    const tc = r.torneioId.replace(/^usk-/, "");
    uskPairingsByT.set(tc, (uskPairingsByT.get(tc) || 0) + 1);
  }
  const uskUniverse = new Set([...mhTorneios.keys(), ...uskPairingsByT.keys()]);
  let uskidsRondasEsperadas = 0;
  const uskidsSemDrawDetalhe = [];
  for (const tc of uskUniverse) {
    const played = mhTorneios.get(tc);
    const comDraw = uskPairingsByT.get(tc) || 0;
    uskidsRondasEsperadas += Math.max(played ? played.rondas : 0, comDraw);
    if (comDraw === 0 && played) {
      const dt = (uskidsDraws.torneios || []).find(x => String(x.t) === tc);
      uskidsSemDrawDetalhe.push({
        torneioId: `usk-${tc}`,
        nome: (dt && dt.name) || played.nome,
        data: normIsoDate(dt && dt.date_inicio) || played.data,
        rondas: played.rondas,
      });
    }
  }
  uskidsSemDrawDetalhe.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const uskidsTorneiosEsperados = uskUniverse;

  const cobertura = {
    fpg: {
      rondasJogadas: manuelRondasTotal,
      rondasComDraw: fpgPairings.length,
      torneiosJogados: manuelTorneiosTotal.size,
      torneiosComDraw: fpgTorneiosComDraw.size,
      torneiosComDrawDetalhe,
      torneiosSemDraw,
      torneiosSemDrawDetalhe: nomesDosTorneiosSemDraw,
      torneiosSkippedDetalhe,
      skipCcodes: [...SKIP_CCODES],
    },
    uskids: {
      rondasJogadas: uskidsRondasEsperadas,
      rondasComDraw: uskidsTotal,
      torneiosJogados: uskidsTorneiosEsperados.size,
      torneiosComDraw: uskPairingsByT.size,
      torneiosSemDrawDetalhe: uskidsSemDrawDetalhe,
    },
    // Registos "conhecidos" (ronda -1 — jogadores que o Manuel conhece mas com
    // quem nunca jogou; entrada Unknown nos overrides) ficam FORA da cobertura:
    // não são rondas jogadas nem draws.
    intl: (() => {
      const reais = intlPairings.filter(r => r.ronda >= 0);
      return {
        rondasJogadas: reais.length,
        rondasComDraw: reais.length,
        torneiosJogados: new Set(reais.map(r => r.torneioId)).size,
        torneiosComDraw: new Set(reais.map(r => r.torneioId)).size,
      };
    })(),
  };

  const out = {
    geradoEm: new Date().toISOString(),
    manuelFed: MANUEL_FED,
    manuelUskidsIds: MANUEL_USKIDS_IDS,
    totalRondas: rondas.length,
    totalCompanheirosUnicos: compSet.size,
    cobertura,
    rondas,
  };

  const outPath = path.join(DATA, "manuel-pairings.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`[pairings-build] escrito: ${outPath}`);
  console.log(`  FPG: ${fpgPairings.length}/${manuelRondasTotal} rondas (${Math.round(100*fpgPairings.length/manuelRondasTotal)}%), ${fpgTorneiosComDraw.size}/${manuelTorneiosTotal.size} torneios`);
  console.log(`  USKids: ${uskidsTotal}/${uskidsRondasEsperadas} rondas (${Math.round(100*uskidsTotal/uskidsRondasEsperadas)}%), ${cobertura.uskids.torneiosComDraw}/${uskidsTorneiosEsperados.size} torneios`);
  console.log(`  Intl: ${intlPairings.length} rondas, ${cobertura.intl.torneiosJogados} torneios (Bluegolf+Doral via overrides)`);
  console.log(`  Companheiros únicos: ${compSet.size}, fed resolvidos: ${resolvidos}`);
}

main();
