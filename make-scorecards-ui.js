// make-scorecards-ui.js (v45 - TREINOS/EXTRAS + DRIVE GROUPING)
// v45:
// ✅ Treinos excluídos da "Vista: Por torneio" (não são torneios)
// ✅ Extra rounds com "torneio_view": true no melhorias.json aparecem na vista por torneio (exceção para USKIDS Barcelona)
// ✅ Dados preenchidos para treinos/extras na vista por campo: Stb (scratch), SD (estimado ~), HI (interpolado), metros
// ✅ SD estimado marcado com ~ e tooltip explicativo
// ✅ _group respeitado na vista por torneio (DRIVE TOUR ≠ DRIVE CHALLENGE)
// ✅ Nome _group usado como nome do torneio quando disponível
// v44:
// Adições pedidas:
// ✅ Explica Ecletico (gross) no topo do campo
// ✅ Ecletico pills servem como filtro por Tee (toggle). Ao clicar, mostra só as rondas desse tee.
// ✅ “Perguntar” (sem popups): deteta provável torneio multi‑ronda (dias consecutivos / nome parecido ou vazio)
//    e mostra uma faixa com botões: "Agrupar como torneio" / "Ignorar". Quando agrupado, etiqueta R1/R2/…
// ✅ Mantém: Gross visível, ordenação por últimos campos jogados, cores de tees, look FPG, sem iframes.
//
// Uso:
//   node .\make-scorecards-ui.js 52884

const fs = require("fs");
const path = require("path");

/* ------------------ Melhorias (correções manuais) ------------------ */
let _melhorias = null;
function loadMelhorias() {
  if (_melhorias !== null) return _melhorias;
  const mp = path.join(process.cwd(), "melhorias.json");
  if (fs.existsSync(mp)) {
    try {
      _melhorias = JSON.parse(fs.readFileSync(mp, "utf-8"));
      const nPlayers = Object.keys(_melhorias).filter(k => !k.startsWith("_")).length;
      console.log(`✓ melhorias.json carregado (${nPlayers} jogador(es))`);
    } catch (e) {
      console.error("⚠ Erro ao ler melhorias.json:", e.message);
      _melhorias = {};
    }
  } else {
    _melhorias = {};
  }
  return _melhorias;
}

function getMelhoria(fed, scoreId) {
  const m = loadMelhorias();
  const patches = m[String(fed)];
  if (!patches) return null;
  return patches[String(scoreId)] || null;
}

function applyMelhorias(rows, fed) {
  const m = loadMelhorias();
  const patches = m[String(fed)];
  if (!patches) return rows;
  let count = 0;
  for (const r of rows) {
    const p = patches[String(r.score_id)];
    if (p && p.whs) {
      Object.assign(r, p.whs);
      count++;
    }
  }
  if (count > 0) console.log(`  ✓ ${count} melhoria(s) WHS aplicada(s) ao jogador ${fed}`);
  return rows;
}

function applyMelhoriasScorecard(rec, fed, scoreId) {
  const sid = rec?.id || rec?.score_id || scoreId;
  if (!rec || !sid) return rec;
  const p = getMelhoria(fed, sid);
  if (p && p.scorecard) {
    Object.assign(rec, p.scorecard);
  }
  return rec;
}

function getMelhoriaLinks(fed, scoreId) {
  const p = getMelhoria(fed, scoreId);
  return p && p.links ? p.links : null;
}

function getMelhoriaNotas(fed, scoreId) {
  const p = getMelhoria(fed, scoreId);
  return p && p.notas ? p.notas : null;
}

function getMelhoriaFpgOriginal(fed, scoreId) {
  const p = getMelhoria(fed, scoreId);
  return p && p._fpg_original ? p._fpg_original : null;
}

function getMelhoriaLink(fed, scoreId) {
  const p = getMelhoria(fed, scoreId);
  if (!p) return null;
  // Novo formato: links (objecto {label: url})
  if (p.links && typeof p.links === 'object') return p.links;
  // Formato antigo: link (string)
  if (p.link) return { link: p.link };
  return null;
}

function getMelhoriaPill(fed, scoreId) {
  const p = getMelhoria(fed, scoreId);
  return p && p.pill ? p.pill : '';
}

function getMelhoriaGroup(fed, scoreId) {
  const p = getMelhoria(fed, scoreId);
  return p && p._group ? p._group : '';
}

function getMelhoriaTornView(fed, scoreId) {
  const p = getMelhoria(fed, scoreId);
  return !!(p && p.torneio_view);
}

/* ------------------ Tee colors (como TeeBadge.tsx) ------------------ */
const DEFAULT_TEE_COLORS = {
  pretas: "#111111", pretos: "#111111", preto: "#111111", black: "#111111",
  brancas: "#f2f2f2", brancos: "#f2f2f2", branco: "#f2f2f2", white: "#f2f2f2",
  amarelas: "#ffd000", amarelos: "#ffd000", amarelo: "#ffd000", yellow: "#ffd000",
  douradas: "#daa520", dourados: "#daa520", dourado: "#daa520", gold: "#daa520",
  vermelhas: "#e74c3c", vermelhos: "#e74c3c", vermelho: "#e74c3c", red: "#e74c3c",
  azuis: "#1e88e5", azuisclaro: "#1e88e5", azul: "#1e88e5", blue: "#1e88e5",
  verdes: "#2e7d32", verde: "#2e7d32", green: "#2e7d32",
  roxas: "#7b1fa2", roxos: "#7b1fa2", roxo: "#7b1fa2", purple: "#7b1fa2",
  laranjas: "#f57c00", laranja: "#f57c00", orange: "#f57c00",
  castanhas: "#6d4c41", castanhos: "#6d4c41", castanho: "#6d4c41", brown: "#6d4c41",
  prateadas: "#9e9e9e", prateados: "#9e9e9e", prateado: "#9e9e9e", silver: "#9e9e9e",
  cinzentas: "#9e9e9e", cinzentos: "#9e9e9e", cinzento: "#9e9e9e", grey: "#9e9e9e", gray: "#9e9e9e",
  // Tees especiais (torneios internacionais juvenis)
  boys11: "#06b6d4", "boys10-11": "#06b6d4", boys1011: "#06b6d4", boys1112: "#06b6d4", "boys11-12": "#06b6d4",
  boys12: "#06b6d4", boys13: "#06b6d4", boys14: "#06b6d4",
  girls11: "#06b6d4", "girls10-11": "#06b6d4", girls1011: "#06b6d4", "girls11-12": "#06b6d4", girls1112: "#06b6d4",
  girls12: "#06b6d4", girls13: "#06b6d4", girls14: "#06b6d4",
  rouge: "#e74c3c",
};

function normKey(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function teeColor(teeName) {
  const k = normKey(teeName);
  return DEFAULT_TEE_COLORS[k] || "#06b6d4";
}

function teeTextColor(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return "#fff";
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  const lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
  return lum > 0.72 ? "#111" : "#fff";
}

/* ------------------ Helpers ------------------ */

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseDotNetDate(dotNetDate) {
  const m = typeof dotNetDate === "string" && dotNetDate.match(/\/Date\((\d+)\)\//);
  if (!m) return null;
  return new Date(Number(m[1]));
}

function fmtDate(d) {
  if (!d) return "";
  // Usar hora local (Portugal UTC+0/+1) em vez de UTC
  // para lidar com datas FPG que são midnight hora local
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function pickHcpFromRow(row){
  if (!row) return "";
  // candidatos comuns — HCP no momento do jogo
  const direct = [
    row.exact_handicap, row.new_handicap,
    row.hi, row.HI,
    row.handicapIndex, row.HandicapIndex,
    row.hcp, row.Hcp,
    row.handicap, row.Handicap,
    row["HCP"], row["hcp"],
    row["HCP Exato"], row["HCP Exacto"], row["HCP Exato "],
    row["HCP Jogo"], row["HCP de Jogo"], row["HCP de jogo"],
    row["HCPExato"], row["HCPExacto"]
  ];
  for (const v of direct) {
    const n = toNum(v);
    if (n != null && Number.isFinite(n)) return String(n);
  }
  // fallback: procurar por chaves que pareçam HI/HCP
  const norm = (s)=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const keys = Object.keys(row);
  // prefer HI/Handicap Index
  for (const k of keys) {
    const nk = norm(k);
    if (nk.includes("handicap") && nk.includes("index")) {
      const n = toNum(row[k]);
      if (n != null && Number.isFinite(n)) return String(n);
    }
    if (nk === "hi" || nk.endsWith(" hi") || nk.includes(" handicap index")) {
      const n = toNum(row[k]);
      if (n != null && Number.isFinite(n)) return String(n);
    }
  }
  // depois HCP exato/jogo
  for (const k of keys) {
    const nk = norm(k);
    if (nk.includes("hcp") || nk.includes("handicap")) {
      const n = toNum(row[k]);
      // filtrar valores absurdos (por ex. distâncias)
      if (n != null && Number.isFinite(n) && n >= -5 && n <= 54) return String(n);
    }
  }
  return "";
}


function isMeaningful(n) {
  const v = Number(n);
  return Number.isFinite(v) && v !== 0;
}

function pickScorecardRec(json) {
  const p = json?.d ?? json;
  return p?.Records?.[0] || null;
}

function metersTotalFromRec(rec) {
  if (!rec) return null;
  let sum = 0, count = 0;
  for (let i = 1; i <= 18; i++) {
    const v = toNum(rec[`meters_${i}`]);
    if (isMeaningful(v)) { sum += v; count++; }
  }
  return count > 0 ? sum : null;
}

function getTee(rec, whsRow) {
  return rec?.tee_name || whsRow?.tee_name || whsRow?.tee || "";
}

function getCourse(rec, whsRow) {
  var course = rec?.course_description || whsRow?.course_description || whsRow?.course || "Campo desconhecido";
  var tournName = rec?.tourn_name || whsRow?.tourn_name || "";
  
  // Se course === tournament name, é placeholder incorreto → usar INTERNACIONAL
  if (course && tournName && course === tournName) {
    return "INTERNACIONAL";
  }
  
  return course;
}

// Aliasing de campos com 3 percursos de 9B
// Cada combinação 18B é "Parent - F9name / B9name" ou "Parent - F9name-B9name"
// Para 9B: detectar se F9 ou B9 foi jogado e agrupar pelo sub-percurso
const COURSE_9H_RULES = [
  // Santo da Serra: Desertas, Serras, Machico (separator: -)
  { parent: "Santo da Serra", pattern: /^Santo da Serra\s*[-–]\s*([\w\u00C0-\u024F]+)\s*[-–]\s*([\w\u00C0-\u024F]+)/i },
  // Vila Sol: Prime, Challenge, Prestige (separator: / or -)
  { parent: "Vila Sol", pattern: /^Vila Sol\s*[-–]\s*([\w\u00C0-\u024F]+)\s*[\/\-–]\s*([\w\u00C0-\u024F]+)/i },
  // Pinheiros Altos: Olives, Pines, Corks (separator: / or -)
  { parent: "Pinheiros Altos", pattern: /^Pinheiros Altos\s*[-–]\s*([\w\u00C0-\u024F]+)\s*[\/\-–]\s*([\w\u00C0-\u024F]+)/i },
  // Castro Marim: Atlântico, Grouse, Guadiana (separator: + or / or -)
  { parent: "Castro Marim", pattern: /^Castro Marim\s*[-–]\s*([\w\u00C0-\u024F]+)\s*[+\/\-–]\s*([\w\u00C0-\u024F]+)/i },
  // Palmares: Alvor, Lagos, Praia (separator: / or -)
  { parent: "Palmares", pattern: /^Palmares\s*[-–]\s*([\w\u00C0-\u024F]+)\s*[\/\-–]\s*([\w\u00C0-\u024F]+)/i },
  // Penha Longa: Atlântico (18h) + Mosteiro (9h) (separator: / or -)
  { parent: "Penha Longa", pattern: /^Penha Longa\s*[-–]\s*([\w\u00C0-\u024F]+)\s*[\/\-–]\s*([\w\u00C0-\u024F]+)/i },
];

function courseAlias(courseName, holeCount, rec) {
  if (holeCount !== 9) return courseName;
  
  for (const rule of COURSE_9H_RULES) {
    const m = courseName.match(rule.pattern);
    if (!m) continue;
    
    const f9Name = m[1]; // primeiro percurso = F9
    const b9Name = m[2]; // segundo percurso = B9
    
    // Detectar se B9 foi jogado (holes 10-18 com dados, 1-9 vazios)
    let playedB9 = false;
    if (rec) {
      const frontHas = Array.from({length:9}, (_,i) => toNum(rec[`gross_${i+1}`])).some(v => v != null);
      const backHas = Array.from({length:9}, (_,i) => toNum(rec[`gross_${i+10}`])).some(v => v != null);
      if (backHas && !frontHas) playedB9 = true;
    }
    
    const subCourse = playedB9 ? b9Name : f9Name;
    return rule.parent + " - " + subCourse;
  }
  
  return courseName;
}

function getPlayedAt(rec, whsRow) {
  return (
    parseDotNetDate(rec?.played_at) ||
    parseDotNetDate(whsRow?.date) ||
    parseDotNetDate(whsRow?.played_at) ||
    parseDotNetDate(whsRow?.hcp_date) ||
    null
  );
}

function pickEventName(whsRow, rec) {
  // tenta várias chaves comuns
  const cands = [
    whsRow?.tourn_name, whsRow?.tournament, whsRow?.tournament_name, whsRow?.tournament_description,
    whsRow?.competition, whsRow?.competition_name, whsRow?.event, whsRow?.event_name,
    whsRow?.torneio, whsRow?.prova, whsRow?.name,
    rec?.tournament_description, rec?.tournament, rec?.tournament_name, rec?.competition_name
  ];
  for (const v of cands) {
    const s = String(v || "").trim();
    if (s) return s;
  }
  return "";
}

// Calcular similaridade entre dois nomes (0-1, onde 1 = idêntico)
// v3 - Agrupamento inteligente de torneios multi-dia (away/internacional)
function nameSimilarity(name1, name2, course1, course2) {
  if (!name1 || !name2) return 0;
  var n1 = norm(name1);
  var n2 = norm(name2);
  if (n1 === n2) return 1;
  
  // Normalizar erros ortográficos comuns
  var normalize = function(s) {
    return s
      .replace(/internancional/g, 'internacional')
      .replace(/internaccional/g, 'internacional')
      .replace(/interacional/g, 'internacional');
  };
  n1 = normalize(n1);
  n2 = normalize(n2);
  if (n1 === n2) return 1;
  
  // Detetar palavras-chave de torneios away/internacional
  var awayKeywords = ['away', 'internacional', 'international', 'tour', 'viagem', 'estrangeiro', 'abroad'];
  var hasAwayKeyword1 = awayKeywords.some(function(k){ return n1.indexOf(k) >= 0; });
  var hasAwayKeyword2 = awayKeywords.some(function(k){ return n2.indexOf(k) >= 0; });
  
  if (hasAwayKeyword1 && hasAwayKeyword2) {
    var stopWords = ['away', 'internacional', 'international', 'tour', 'viagem', 'estrangeiro', 'de', 'do', 'da', 'em', 'no', 'na', 'abroad'];
    var w1 = n1.split(/\s+/).filter(function(w){ return w.length > 2 && stopWords.indexOf(w) < 0; });
    var w2 = n2.split(/\s+/).filter(function(w){ return w.length > 2 && stopWords.indexOf(w) < 0; });
    
    if (w1.length > 0 && w2.length > 0) {
      var hasCommon = w1.some(function(a){ return w2.some(function(b){ return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0; }); });
      if (hasCommon) return 0.95;
    }
    // Ambos puramente genéricos → tratar como match
    if (w1.length === 0 && w2.length === 0) {
      if (course1 && course2 && norm(course1) === norm(course2)) return 0.95;
      return 0.8;
    }
  }
  
  // Remover padrões de dia/volta para comparar base
  var patterns = [/\bd[1-9]\b/g, /\bdia\s*[1-9]\b/gi, /\b[1-9]a?\s*(volta|ronda|dia)\b/gi, /\b(primeira|segunda|terceira|quarta)\s*(volta|ronda)\b/gi];
  var base1 = n1, base2 = n2;
  patterns.forEach(function(p){
    base1 = base1.replace(p, '');
    base2 = base2.replace(p, '');
  });
  
  // Se base idêntica após remover padrões = mesmo torneio
  base1 = base1.replace(/\s+/g, ' ').trim();
  base2 = base2.replace(/\s+/g, ' ').trim();
  if (base1 === base2 && base1.length > 5) return 1;
  
  // Dividir em palavras
  var words1 = n1.split(/\s+/).filter(function(w){ return w.length > 2; });
  var words2 = n2.split(/\s+/).filter(function(w){ return w.length > 2; });
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // Contar palavras em comum
  var common = 0;
  words1.forEach(function(w1){
    if (words2.some(function(w2){ return w2.indexOf(w1) >= 0 || w1.indexOf(w2) >= 0; })) {
      common++;
    }
  });
  
  // Percentagem de palavras em comum
  var total = Math.max(words1.length, words2.length);
  return common / total;
}

function pickGrossFromWHS(whsRow) {
  const cands = [
    whsRow?.gross, whsRow?.Gross, whsRow?.gross_score, whsRow?.GrossScore,
    whsRow?.gross_total, whsRow?.GrossTotal
  ];
  for (const v of cands) {
    const n = toNum(v);
    if (n != null) return n;
  }
  return whsRow?.gross ?? whsRow?.Gross ?? "";
}

/* ------------------ Scorecard fragment ------------------ */

function scoreClassForDelta(delta) {
  if (delta == null) return "";
  if (delta <= -1) return "birdie";
  if (delta === 0) return "par";
  if (delta === 1) return "bogey";
  if (delta === 2) return "dbl";
  if (delta === 3) return "tpl";
  return "worse";
}

function detectHoleCount({ parArr, grossArr, metersArr }) {
  const backHas =
    grossArr.slice(9).some(isMeaningful) ||
    parArr.slice(9).some(isMeaningful) ||
    metersArr.slice(9).some(isMeaningful);
  return backHas ? 18 : 9;
}

function holeCountFromRec(rec) {
  if (!rec) return 18;
  const H18 = Array.from({ length: 18 }, (_, i) => i + 1);
  const par18 = H18.map(h => toNum(rec?.[`par_${h}`]));
  const m18   = H18.map(h => toNum(rec?.[`meters_${h}`]));
  const g18   = H18.map(h => toNum(rec?.[`gross_${h}`]));
  return detectHoleCount({ parArr: par18, grossArr: g18, metersArr: m18 });
}

function parTotalFromRec(rec) {
  if (!rec) return null;
  const hc = holeCountFromRec(rec);
  let s = 0, c = 0;
  for (let i = 1; i <= hc; i++) {
    const v = toNum(rec?.[`par_${i}`]);
    if (v != null && isMeaningful(v)) { s += v; c++; }
  }
  return c >= Math.min(6, hc) ? s : null;
}

function sum(arr) {
  return arr.reduce((a, v) => a + (Number(v) || 0), 0);
}

function buildScorecardFragment({ fed, scoreId, rec, whsRow }) {
  const course = getCourse(rec, whsRow);
  const tee = getTee(rec, whsRow);
  const date = fmtDate(getPlayedAt(rec, whsRow));
  const hi = pickHcpFromRow(whsRow);

  const teeHex = teeColor(tee);
  const teeFg = teeTextColor(teeHex);

  // Melhorias: links e notas
  const mLinks = getMelhoriaLinks(fed, rec?.id || scoreId);
  const mNotas = getMelhoriaNotas(fed, rec?.id || scoreId);
  const mFpg = getMelhoriaFpgOriginal(fed, rec?.id || scoreId);

  let linksHtml = '';
  const _scLinkLabels = {
    classificacao: 'Classificação', classificacao_d1: 'Classif. D1', classificacao_d2: 'Classif. D2',
    leaderboard: 'Leaderboard', scorecard: 'Scorecard', resultados: 'Resultados',
    fpg_scoring: 'FPG Scoring', noticia_teetimes: 'Notícia', link: 'Ver torneio'
  };
  if (mLinks) {
    const linkItems = Object.entries(mLinks).map(([label, url]) =>
      `<a href="${esc(url)}" target="_blank" class="sc-ext-link" title="${esc(_scLinkLabels[label] || label)}">🔗 ${esc(_scLinkLabels[label] || label)}</a>`
    ).join(' ');
    linksHtml = `<div class="sc-links">${linkItems}</div>`;
  }
  let fpgBadge = '';
  if (mFpg) {
    const diffs = [];
    if (mFpg.gross_total) diffs.push(`Gross FPG: ${mFpg.gross_total}`);
    if (mFpg.course_rating) diffs.push(`CR FPG: ${mFpg.course_rating}`);
    if (mFpg.slope) diffs.push(`Slope FPG: ${mFpg.slope}`);
    if (mFpg.tee_name) diffs.push(`Tee FPG: ${mFpg.tee_name}`);
    fpgBadge = `<span class="sc-fpg-badge" title="Dados FPG diferem: ${esc(diffs.join(', '))}">⚠ FPG</span>`;
  }

  const H18 = Array.from({ length: 18 }, (_, i) => i + 1);
  const par18 = H18.map(h => toNum(rec?.[`par_${h}`]));
  const si18  = H18.map(h => toNum(rec?.[`stroke_index_${h}`]));
  const g18   = H18.map(h => toNum(rec?.[`gross_${h}`]));
  const m18   = H18.map(h => toNum(rec?.[`meters_${h}`]));

  const holeCount = detectHoleCount({ parArr: par18, grossArr: g18, metersArr: m18 });
  
  const par = par18.slice(0, holeCount);
  const si  = si18.slice(0, holeCount);
  const gross = g18.slice(0, holeCount);
  const meters = m18.slice(0, holeCount);

  const parTotal = sum(par.filter(isMeaningful));
  const grossTotal = sum(gross.filter(isMeaningful));
  const metersTotal = sum(meters.filter(isMeaningful));
  const toPar = grossTotal - parTotal;
  const toParStr = toPar > 0 ? `+${toPar}` : String(toPar);

  function scoreClass(grossVal, parVal) {
    if (!isMeaningful(grossVal) || !isMeaningful(parVal)) return '';
    const delta = grossVal - parVal;
    
    // Hole-in-one (1 num par 3, 4 ou 5)
    if (grossVal === 1) return 'holeinone';
    
    // Albatross (-3 ou menos)
    if (delta <= -3) return 'albatross';
    
    // Eagle (-2)
    if (delta === -2) return 'eagle';
    
    // Birdie (-1)
    if (delta === -1) return 'birdie';
    
    // Par (0)
    if (delta === 0) return 'par';
    
    // Bogeys e piores
    if (delta === 1) return 'bogey';
    if (delta === 2) return 'double';
    if (delta === 3) return 'triple';
    if (delta === 4) return 'quad';
    if (delta === 5) return 'quint';
    return 'worse';
  }

  let html = `
<div class="sc-modern" style="--tee-color:${teeHex};--tee-fg:${teeFg}">
  <div class="sc-header ${teeFg === '#fff' ? 'sc-header-dark' : 'sc-header-light'}" style="background:${teeHex}">
    <div class="sc-header-left">
      <div class="sc-title">${esc(course)}</div>
      <div class="sc-subtitle">
        <span>${date}</span>
        <span>Tee ${esc(tee)}</span>
        ${hi ? `<span>HCP ${hi}</span>` : ''}
        ${metersTotal ? `<span>${metersTotal}m</span>` : ''}
        ${fpgBadge}
      </div>
      ${linksHtml}
    </div>
    <div class="sc-header-right">
      <div class="sc-stat">
        <div class="sc-stat-label">PAR</div>
        <div class="sc-stat-value">${parTotal || '—'}</div>
      </div>
      <div style="width:1px;height:28px;background:currentColor;opacity:0.25"></div>
      <div class="sc-stat">
        <div class="sc-stat-label">RESULTADO</div>
        <div class="sc-stat-value">${grossTotal || '—'}</div>
      </div>
      <div style="width:1px;height:28px;background:currentColor;opacity:0.25"></div>
      <div class="sc-stat sc-stat-score">
        <div class="sc-stat-label">SCORE</div>
        <div class="sc-stat-value">${toParStr}</div>
      </div>
    </div>
  </div>
  
  <table class="sc-table-modern" data-sc-table="1">
    <thead>
      <tr>
        <th class="hole-header" style="border-right:2px solid #d5dac9">Buraco</th>`;
  
  const is9 = holeCount === 9;
  const frontEnd = is9 ? holeCount : 9;
  
  // Header com todos os buracos + Out/In/TOTAL
  for (let h = 1; h <= holeCount; h++) {
    html += `<th class="hole-header">${h}</th>`;
    if (h === frontEnd && !is9) html += `<th class="hole-header col-out" style="font-size:10px">Out</th>`;
  }
  html += `<th class="hole-header col-${is9 ? 'total' : 'in'}" style="font-size:10px">${is9 ? 'TOTAL' : 'In'}</th>`;
  if (!is9) html += `<th class="hole-header col-total">TOTAL</th>`;
  html += `</tr></thead><tbody>`;
  
  function sumRange(arr, from, to) { let s = 0; for (let i = from; i < to; i++) if (isMeaningful(arr[i])) s += arr[i]; return s; }
  
  // Linha Metros
  if (meters && meters.some(isMeaningful)) {
    html += '<tr class="meta-row"><td class="row-label" style="color:#b0b8c4;font-size:10px;font-weight:400">Metros</td>';
    for (let h = 0; h < holeCount; h++) {
      html += `<td>${isMeaningful(meters[h]) ? meters[h] : ''}</td>`;
      if (h === frontEnd - 1 && !is9) html += `<td class="col-out" style="font-weight:600">${sumRange(meters, 0, frontEnd)}</td>`;
    }
    const inM = is9 ? sumRange(meters, 0, holeCount) : sumRange(meters, 9, holeCount);
    html += `<td class="col-${is9 ? 'total' : 'in'}" style="font-weight:600">${inM}</td>`;
    if (!is9) html += `<td class="col-total" style="color:#9aab8e;font-size:10px">${metersTotal}</td>`;
    html += '</tr>';
  }
  
  // Linha S.I.
  if (si && si.some(isMeaningful)) {
    html += '<tr class="meta-row"><td class="row-label" style="color:#b0b8c4;font-size:10px;font-weight:400">S.I.</td>';
    for (let h = 0; h < holeCount; h++) {
      html += `<td>${isMeaningful(si[h]) ? si[h] : ''}</td>`;
      if (h === frontEnd - 1 && !is9) html += `<td class="col-out"></td>`;
    }
    html += `<td class="col-${is9 ? 'total' : 'in'}"></td>`;
    if (!is9) html += `<td class="col-total"></td>`;
    html += '</tr>';
  }
  
  // Linha Par (com separador)
  html += '<tr class="sep-row"><td class="row-label par-label">Par</td>';
  for (let h = 0; h < holeCount; h++) {
    html += `<td>${isMeaningful(par[h]) ? par[h] : '—'}</td>`;
    if (h === frontEnd - 1 && !is9) html += `<td class="col-out" style="font-weight:700">${sumRange(par, 0, frontEnd)}</td>`;
  }
  const inPar = is9 ? parTotal : sumRange(par, 9, holeCount);
  html += `<td class="col-${is9 ? 'total' : 'in'}" style="font-weight:700">${inPar}</td>`;
  if (!is9) html += `<td class="col-total">${parTotal || '—'}</td>`;
  html += '</tr>';
  
  // Linha Resultado (data pill + scores + toPar abaixo)
  const dateFmt = date ? date.substring(0, 5).replace('-', '/') : 'Gross';
  html += `<tr><td class="row-label"><span class="sc-pill" style="background:${teeHex};color:${teeFg}">${dateFmt}</span></td>`;
  for (let h = 0; h < holeCount; h++) {
    const g = gross[h];
    const p = par[h];
    const cls = scoreClass(g, p);
    if (isMeaningful(g)) {
      html += `<td><span class="sc-score ${cls}">${g}</span></td>`;
    } else {
      html += `<td>—</td>`;
    }
    if (h === frontEnd - 1 && !is9) {
      const outG = sumRange(gross, 0, frontEnd);
      const outP = sumRange(par, 0, frontEnd);
      const outTP = outG - outP;
      const outTPcls = outTP > 0 ? 'sc-topar-pos' : (outTP < 0 ? 'sc-topar-neg' : 'sc-topar-zero');
      html += `<td class="col-out" style="font-weight:700">${outG}<span class="sc-topar ${outTPcls}">${outTP > 0 ? '+' : ''}${outTP}</span></td>`;
    }
  }
  const inG = is9 ? grossTotal : sumRange(gross, 9, holeCount);
  const inP = is9 ? parTotal : sumRange(par, 9, holeCount);
  const inTP = inG - inP;
  const inTPcls = inTP > 0 ? 'sc-topar-pos' : (inTP < 0 ? 'sc-topar-neg' : 'sc-topar-zero');
  html += `<td class="col-${is9 ? 'total' : 'in'}" style="font-weight:700">${inG}<span class="sc-topar ${inTPcls}">${inTP > 0 ? '+' : ''}${inTP}</span></td>`;
  if (!is9) {
    const totTPcls = toPar > 0 ? 'sc-topar-pos' : (toPar < 0 ? 'sc-topar-neg' : 'sc-topar-zero');
    html += `<td class="col-total">${grossTotal}<span class="sc-topar ${totTPcls}">${toParStr}</span></td>`;
  }
  html += `</tr></tbody></table>`;
  
  html += `
</div>`;

  return html;
}

/* Build a simplified scorecard fragment from manual data (treinos / extra_rounds) */
function buildManualFragment({ courseName, dateFmt, gross, par, si, meters, holeCount, tee, link, links, label }) {
  const hc = holeCount || gross.length || 9;
  const is9 = hc === 9;
  const frontEnd = is9 ? hc : 9;

  const parTotal = par.reduce((s, v) => s + (v || 0), 0);
  const grossTotal = gross.reduce((s, v) => s + (v || 0), 0);
  const metersTotal = meters ? meters.reduce((s, v) => s + (v || 0), 0) : 0;
  const toPar = grossTotal - parTotal;
  const toParStr = toPar > 0 ? `+${toPar}` : String(toPar);

  function scoreClass(g, p) {
    if (!g || !p) return '';
    const d = g - p;
    if (g === 1) return 'holeinone';
    if (d <= -3) return 'albatross';
    if (d === -2) return 'eagle';
    if (d === -1) return 'birdie';
    if (d === 0) return 'par';
    if (d === 1) return 'bogey';
    if (d === 2) return 'double';
    if (d === 3) return 'triple';
    if (d === 4) return 'quad';
    if (d === 5) return 'quint';
    return 'worse';
  }

  function sumR(arr, from, to) { let s = 0; for (let i = from; i < to; i++) if (arr[i]) s += arr[i]; return s; }

  const teeHex = tee ? teeColor(tee) : '#94a3b8';
  const teeFg = teeTextColor(teeHex);

  const _linkLabels = {
    classificacao: 'Classificação', classificacao_d1: 'Classif. D1', classificacao_d2: 'Classif. D2',
    leaderboard: 'Leaderboard', scorecard: 'Scorecard', resultados: 'Resultados',
    fpg_scoring: 'FPG Scoring', noticia_teetimes: 'Notícia', link: 'Ver torneio'
  };
  let linkHtml = '';
  const allLinks = links || (link ? { link } : null);
  if (allLinks && typeof allLinks === 'object') {
    const items = Object.entries(allLinks)
      .filter(([, v]) => typeof v === 'string' && v.startsWith('http'))
      .map(([k, v]) => `<a href="${esc(v)}" target="_blank" class="sc-ext-link">🔗 ${esc(_linkLabels[k] || k)}</a>`);
    if (items.length) linkHtml = `<div class="sc-links">${items.join('')}</div>`;
  }

  let badgeHtml = label ? `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;background:#f3e5f5;color:#6a1b9a;margin-left:6px">${esc(label)}</span>` : '';

  let html = `
<div class="sc-modern" style="--tee-color:${teeHex};--tee-fg:${teeFg}">
  <div class="sc-header ${teeFg === '#fff' ? 'sc-header-dark' : 'sc-header-light'}" style="background:${teeHex}">
    <div class="sc-header-left">
      <div class="sc-title">${esc(courseName)}${badgeHtml}</div>
      <div class="sc-subtitle">
        <span>${dateFmt || ''}</span>
        ${tee ? `<span>Tee ${esc(tee)}</span>` : ''}
        ${metersTotal ? `<span>${metersTotal}m</span>` : ''}
      </div>
      ${linkHtml}
    </div>
    <div class="sc-header-right">
      <div class="sc-stat"><div class="sc-stat-label">PAR</div><div class="sc-stat-value">${parTotal || '—'}</div></div>
      <div style="width:1px;height:28px;background:currentColor;opacity:0.25"></div>
      <div class="sc-stat"><div class="sc-stat-label">RESULTADO</div><div class="sc-stat-value">${grossTotal || '—'}</div></div>
      <div style="width:1px;height:28px;background:currentColor;opacity:0.25"></div>
      <div class="sc-stat sc-stat-score"><div class="sc-stat-label">SCORE</div><div class="sc-stat-value">${toParStr}</div></div>
    </div>
  </div>
  <table class="sc-table-modern" data-sc-table="1">
    <thead><tr><th class="hole-header" style="border-right:2px solid #d5dac9">Buraco</th>`;

  for (let h = 1; h <= hc; h++) {
    html += `<th class="hole-header">${h}</th>`;
    if (h === frontEnd && !is9) html += `<th class="hole-header col-out" style="font-size:10px">Out</th>`;
  }
  html += `<th class="hole-header col-${is9 ? 'total' : 'in'}" style="font-size:10px">${is9 ? 'TOTAL' : 'In'}</th>`;
  if (!is9) html += `<th class="hole-header col-total">TOTAL</th>`;
  html += `</tr></thead><tbody>`;

  // Metros
  if (meters && meters.some(v => v)) {
    html += '<tr class="meta-row"><td class="row-label" style="color:#b0b8c4;font-size:10px;font-weight:400">Metros</td>';
    for (let h = 0; h < hc; h++) {
      html += `<td>${meters[h] || ''}</td>`;
      if (h === frontEnd - 1 && !is9) html += `<td class="col-out" style="font-weight:600">${sumR(meters, 0, frontEnd)}</td>`;
    }
    const inM = is9 ? sumR(meters, 0, hc) : sumR(meters, 9, hc);
    html += `<td class="col-${is9 ? 'total' : 'in'}" style="font-weight:600">${inM}</td>`;
    if (!is9) html += `<td class="col-total" style="color:#9aab8e;font-size:10px">${metersTotal}</td>`;
    html += '</tr>';
  }

  // S.I.
  if (si && si.some(v => v)) {
    html += '<tr class="meta-row"><td class="row-label" style="color:#b0b8c4;font-size:10px;font-weight:400">S.I.</td>';
    for (let h = 0; h < hc; h++) {
      html += `<td>${si[h] || ''}</td>`;
      if (h === frontEnd - 1 && !is9) html += `<td class="col-out"></td>`;
    }
    html += `<td class="col-${is9 ? 'total' : 'in'}"></td>`;
    if (!is9) html += `<td class="col-total"></td>`;
    html += '</tr>';
  }

  // Par
  html += '<tr class="sep-row"><td class="row-label par-label">Par</td>';
  for (let h = 0; h < hc; h++) {
    html += `<td>${par[h] || '—'}</td>`;
    if (h === frontEnd - 1 && !is9) html += `<td class="col-out" style="font-weight:700">${sumR(par, 0, frontEnd)}</td>`;
  }
  const inPar = is9 ? parTotal : sumR(par, 9, hc);
  html += `<td class="col-${is9 ? 'total' : 'in'}" style="font-weight:700">${inPar}</td>`;
  if (!is9) html += `<td class="col-total">${parTotal || '—'}</td>`;
  html += '</tr>';

  // Gross
  const pill = dateFmt ? dateFmt.substring(0, 5).replace('-', '/') : 'Gross';
  html += `<tr><td class="row-label"><span class="sc-pill" style="background:${teeHex};color:${teeFg}">${pill}</span></td>`;
  for (let h = 0; h < hc; h++) {
    const g = gross[h], p = par[h];
    const cls = scoreClass(g, p);
    html += g ? `<td><span class="sc-score ${cls}">${g}</span></td>` : `<td>—</td>`;
    if (h === frontEnd - 1 && !is9) {
      const outG = sumR(gross, 0, frontEnd), outP = sumR(par, 0, frontEnd);
      const outTP = outG - outP;
      const cls2 = outTP > 0 ? 'sc-topar-pos' : (outTP < 0 ? 'sc-topar-neg' : 'sc-topar-zero');
      html += `<td class="col-out" style="font-weight:700">${outG}<span class="sc-topar ${cls2}">${outTP > 0 ? '+' : ''}${outTP}</span></td>`;
    }
  }
  const inG = is9 ? grossTotal : sumR(gross, 9, hc);
  const inP = is9 ? parTotal : sumR(par, 9, hc);
  const inTP = inG - inP;
  const inCls = inTP > 0 ? 'sc-topar-pos' : (inTP < 0 ? 'sc-topar-neg' : 'sc-topar-zero');
  html += `<td class="col-${is9 ? 'total' : 'in'}" style="font-weight:700">${inG}<span class="sc-topar ${inCls}">${inTP > 0 ? '+' : ''}${inTP}</span></td>`;
  if (!is9) {
    const totCls = toPar > 0 ? 'sc-topar-pos' : (toPar < 0 ? 'sc-topar-neg' : 'sc-topar-zero');
    html += `<td class="col-total">${grossTotal}<span class="sc-topar ${totCls}">${toParStr}</span></td>`;
  }
  html += `</tr></tbody></table></div>`;
  return html;
}
function computeEclecticForTee(roundRecs, teeName) {
  if (!roundRecs.length) return null;

  const holeCount = Math.max(...roundRecs.map(x => x.holeCount || 18));
  const holes = Array.from({ length: holeCount }, (_, i) => i + 1);

  const par = holes.map(h => {
    for (const rr of roundRecs) {
      const v = toNum(rr.rec?.[`par_${h}`]);
      if (isMeaningful(v)) return v;
    }
    return null;
  });

  const si = holes.map(h => {
    for (const rr of roundRecs) {
      const v = toNum(rr.rec?.[`stroke_index_${h}`]);
      if (isMeaningful(v)) return v;
    }
    return null;
  });

  const best = holes.map(h => {
    let bestVal = null;
    let bestFrom = null;
    for (const rr of roundRecs) {
      const v = toNum(rr.rec?.[`gross_${h}`]);
      if (!isMeaningful(v)) continue;
      if (bestVal == null || v < bestVal) {
        bestVal = v;
        bestFrom = { scoreId: rr.scoreId, date: rr.date || "" };
      }
    }
    return { h, best: bestVal, par: par[h - 1], from: bestFrom };
  });

  const playedHoles = best.filter(x => isMeaningful(x.best)).length;
  if (playedHoles < Math.min(6, holeCount)) return null;

  const totalGross = best.reduce((a, x) => a + (Number(x.best) || 0), 0);
  const totalPar = par.reduce((a, v) => a + (Number(v) || 0), 0);
  const toPar = (Number.isFinite(totalGross) && Number.isFinite(totalPar)) ? (totalGross - totalPar) : null;

    const wins = {};
  for (const h of best) {
    const sid = h?.from?.scoreId;
    if (!sid) continue;
    wins[sid] = (wins[sid] || 0) + 1;
  }

  return { teeName, teeKey: normKey(teeName), holeCount, totalGross, totalPar, toPar, holes: best, si, wins };
}

/* ------------------ Análise por buraco (course+tee) ------------------ */
function computeHoleStats(roundRecs, teeName) {
  if (roundRecs.length < 2) return null;

  const holeCount = Math.max(...roundRecs.map(x => x.holeCount || 18));
  const holes = [];
  for (let h = 1; h <= holeCount; h++) {
    const par = (() => { for (const rr of roundRecs) { const v = toNum(rr.rec?.[`par_${h}`]); if (isMeaningful(v)) return v; } return null; })();
    const si = (() => { for (const rr of roundRecs) { const v = toNum(rr.rec?.[`stroke_index_${h}`]); if (isMeaningful(v)) return v; } return null; })();
    const scores = [];
    for (const rr of roundRecs) {
      const v = toNum(rr.rec?.[`gross_${h}`]);
      if (isMeaningful(v)) scores.push(v);
    }
    if (!scores.length) { holes.push({ h, par, si, n: 0 }); continue; }
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const best = Math.min(...scores);
    const worst = Math.max(...scores);
    const dist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0 };
    if (par != null) {
      for (const s of scores) {
        const d = s - par;
        if (d <= -2) dist.eagle++;
        else if (d === -1) dist.birdie++;
        else if (d === 0) dist.par++;
        else if (d === 1) dist.bogey++;
        else if (d === 2) dist.double++;
        else dist.triple++;
      }
    }
    const strokesLost = par != null ? Math.round((avg - par) * 100) / 100 : 0;
    holes.push({ h, par, si, n: scores.length, avg: Math.round(avg * 100) / 100, best, worst, dist, strokesLost });
  }
  // Totals distribution
  const totalDist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, total: 0 };
  for (const hd of holes) {
    if (!hd.dist) continue;
    for (const k of Object.keys(totalDist)) { if (k !== 'total') totalDist[k] += hd.dist[k]; }
  }
  totalDist.total = totalDist.eagle + totalDist.birdie + totalDist.par + totalDist.bogey + totalDist.double + totalDist.triple;

  // By par type (Par 3, 4, 5)
  const byParType = {};
  for (const hd of holes) {
    if (hd.par == null || hd.n === 0) continue;
    const pt = hd.par;
    if (!byParType[pt]) byParType[pt] = { par: pt, holes: [], totalN: 0, sumAvg: 0, sumStrokesLost: 0, dist: { eagle:0, birdie:0, par:0, bogey:0, double:0, triple:0 } };
    const g = byParType[pt];
    g.holes.push(hd);
    g.totalN += hd.n;
    g.sumAvg += hd.avg * hd.n;
    g.sumStrokesLost += hd.strokesLost;
    if (hd.dist) { for (const k of Object.keys(g.dist)) g.dist[k] += hd.dist[k]; }
  }
  for (const pt of Object.keys(byParType)) {
    const g = byParType[pt];
    g.avg = g.totalN ? Math.round(g.sumAvg / g.totalN * 100) / 100 : null;
    g.avgVsPar = g.avg != null ? Math.round((g.avg - g.par) * 100) / 100 : null;
    g.strokesLostPerRound = Math.round(g.sumStrokesLost * 100) / 100;
    g.nHoles = g.holes.length;
    g.parOrBetterPct = g.totalN ? Math.round((g.dist.eagle + g.dist.birdie + g.dist.par) / g.totalN * 1000) / 10 : 0;
    g.doubleOrWorsePct = g.totalN ? Math.round((g.dist.double + g.dist.triple) / g.totalN * 1000) / 10 : 0;
  }

  // Front 9 vs Back 9 (only for 18-hole)
  let f9b9 = null;
  if (holeCount === 18) {
    const makeHalf = (start, end) => {
      const hh = holes.slice(start, end).filter(h => h.n > 0 && h.par != null);
      const sumSL = hh.reduce((a, h) => a + h.strokesLost, 0);
      const sumPar = hh.reduce((a, h) => a + h.par, 0);
      const dblPct = (() => {
        let tot = 0, dbl = 0;
        for (const h of hh) { if (h.dist) { tot += h.n; dbl += h.dist.double + h.dist.triple; } }
        return tot ? Math.round(dbl / tot * 1000) / 10 : 0;
      })();
      return { strokesLost: Math.round(sumSL * 100) / 100, par: sumPar, dblPct };
    };
    f9b9 = { f9: makeHalf(0, 9), b9: makeHalf(9, 18) };
  }

  // Overall round stats
  const roundGrosses = [];
  for (const rr of roundRecs) {
    let s = 0, c = 0;
    for (let i = 1; i <= holeCount; i++) {
      const v = toNum(rr.rec?.[`gross_${i}`]);
      if (isMeaningful(v)) { s += v; c++; }
    }
    if (c === holeCount) roundGrosses.push({ gross: s, date: rr.date || "" });
  }
  roundGrosses.sort((a, b) => a.gross - b.gross);
  const totalPar = holes.reduce((a, hd) => a + (hd.par || 0), 0);
  const totalStrokesLost = holes.reduce((a, hd) => a + (hd.strokesLost || 0), 0);

  return {
    teeName, teeKey: normKey(teeName), holeCount,
    nRounds: roundRecs.length,
    holes,
    totalDist,
    totalPar,
    totalStrokesLost: Math.round(totalStrokesLost * 100) / 100,
    byParType,
    f9b9,
    bestRound: roundGrosses[0] || null,
    worstRound: roundGrosses.length ? roundGrosses[roundGrosses.length - 1] : null,
    avgGross: roundGrosses.length ? Math.round(roundGrosses.reduce((a, x) => a + x.gross, 0) / roundGrosses.length * 10) / 10 : null,
    trend: (() => {
      if (roundGrosses.length < 4) return null;
      const dated = roundRecs.filter(rr => rr.date).map(rr => {
        let s = 0, c = 0;
        for (let i = 1; i <= holeCount; i++) { const v = toNum(rr.rec?.[`gross_${i}`]); if (isMeaningful(v)) { s += v; c++; } }
        return c === holeCount ? { gross: s, date: rr.date } : null;
      }).filter(Boolean);
      if (dated.length < 4) return null;
      const last3 = dated.slice(0, 3);
      const prev = dated.slice(3);
      const avgLast = last3.reduce((a, x) => a + x.gross, 0) / last3.length;
      const avgPrev = prev.reduce((a, x) => a + x.gross, 0) / prev.length;
      return Math.round((avgLast - avgPrev) * 10) / 10;
    })()
  };
}

/* ------------------ Discover other players ------------------ */
function loadPlayersJson(outputRoot) {
  const pPath = path.join(outputRoot, "players.json");
  if (!fs.existsSync(pPath)) return {};
  try { return JSON.parse(fs.readFileSync(pPath, "utf-8")); } catch { return {}; }
}

function calcEscalao(dob) {
  if (!dob) return "";
  const refYear = new Date().getFullYear();
  const y = Number(dob.split("-")[0]);
  if (!y) return "";
  const age = refYear - y;
  if (age >= 50) return "Sénior";
  if (age >= 19) return "Absoluto";
  if (age >= 17) return "Sub-18";
  if (age >= 15) return "Sub-16";
  if (age >= 13) return "Sub-14";
  if (age >= 11) return "Sub-12";
  return "Sub-10";
}

function discoverPlayers(outputRoot, currentFed) {
  const playersDb = loadPlayersJson(outputRoot);
  const players = [];
  if (!fs.existsSync(outputRoot)) return players;
  const dirs = fs.readdirSync(outputRoot).filter(d => {
    const full = path.join(outputRoot, d);
    return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, "whs-list.json"));
  });
  for (const fed of dirs) {
    // Fonte primária: players.json
    const pj = playersDb[fed];
    let name = "";
    let escalao = "";
    let dob = "";
    let club = "";
    let region = "";
    let sex = "";
    let hcp = null;
    let tags = [];
    if (pj) {
      if (typeof pj === "string") {
        name = pj;
      } else {
        name = pj.name || "";
        dob = pj.dob || "";
        escalao = pj.escalao || calcEscalao(dob);
        club = (typeof pj.club === "object" && pj.club) ? (pj.club.short || "") : (pj.club || "");
        region = pj.region || "";
        sex = pj.sex || "";
        hcp = (pj.hcp != null) ? Number(pj.hcp) : null;
        tags = Array.isArray(pj.tags) ? pj.tags : [];
      }
    }
    // Fallback: tentar extrair do whs/scorecards
    if (!name) {
      try {
        const whs = JSON.parse(fs.readFileSync(path.join(outputRoot, fed, "whs-list.json"), "utf-8"));
        const top = whs?.d ?? whs;
        const rows = top?.Records || [];
        const sources = [top, rows[0]].filter(Boolean);
        for (const src of sources) {
          if (name) break;
          const cands = [
            src?.player_name, src?.PlayerName, src?.player,
            src?.first_name && src?.last_name ? (src.first_name + " " + src.last_name) : null,
            src?.nome, src?.Nome, src?.name, src?.Name,
          ];
          for (const c of cands) {
            if (c && String(c).trim()) { name = String(c).trim(); break; }
          }
        }
      } catch {}
    }
    players.push({
      fed,
      name: name || ("Federado " + fed),
      escalao,
      dob,
      club,
      region,
      sex,
      hcp,
      tags,
      birthYear: dob ? dob.substring(0, 4) : "",
      isCurrent: fed === currentFed
    });
  }
  // Ordenar: jogador atual primeiro, depois por nome
  players.sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    return a.name.localeCompare(b.name);
  });
  return players;
}

/* -------------- Cross-Analysis: extract stats for all players -------------- */
function extractPlayerStats(fed, outputRoot) {
  const baseDir = path.join(outputRoot, fed);
  const whsPath = path.join(baseDir, "whs-list.json");
  const scorecardsDir = path.join(baseDir, "scorecards");
  if (!fs.existsSync(whsPath)) return null;

  const whs = JSON.parse(fs.readFileSync(whsPath, "utf-8"));
  const rows = (whs?.d ?? whs)?.Records || whs?.Records || [];
  applyMelhorias(rows, fed);

  const whsByScoreId = new Map();
  for (const r of rows) {
    if (r?.score_id != null) whsByScoreId.set(String(r.score_id), r);
  }

  const cardByScoreId = new Map();
  if (fs.existsSync(scorecardsDir)) {
    for (const f of fs.readdirSync(scorecardsDir).filter(f => f.endsWith(".json"))) {
      try {
        const json = JSON.parse(fs.readFileSync(path.join(scorecardsDir, f), "utf-8"));
        const rec = pickScorecardRec(json);
        if (rec) {
          const sid = path.basename(f, ".json");
          applyMelhoriasScorecard(rec, fed, sid);
          cardByScoreId.set(sid, rec);
        }
      } catch {}
    }
  }

  const rounds = [];
  for (const [scoreId, whsRow] of whsByScoreId.entries()) {
    const rec = cardByScoreId.get(scoreId) || null;
    const dateObj = getPlayedAt(rec, whsRow);
    const course = getCourse(rec, whsRow);
    const eventName = pickEventName(whsRow, rec);
    let gross = pickGrossFromWHS(whsRow);
    if ((gross === "" || gross == null) && rec) {
      const cand = toNum(rec?.gross_total) ?? toNum(rec?.GrossTotal) ?? null;
      if (cand != null) gross = cand;
      else {
        const hc = holeCountFromRec(rec);
        let s = 0, c = 0;
        for (let i = 1; i <= hc; i++) {
          const v = toNum(rec?.[`gross_${i}`]);
          if (isMeaningful(v)) { s += v; c++; }
        }
        if (c > 0) gross = s;
      }
    }
    const hc = rec ? holeCountFromRec(rec) : (toNum(whsRow?.holes) || 18);
    const displayCourse = courseAlias(course, hc, rec);
    const tee = getTee(rec, whsRow) || "";
    rounds.push({
      dateSort: dateObj ? dateObj.getTime() : 0,
      date: fmtDate(dateObj),
      course: displayCourse,
      courseKey: norm(displayCourse),
      tee: tee,
      teeKey: normKey(tee),
      gross: toNum(gross),
      par: rec ? parTotalFromRec(rec) : null,
      sd: toNum(whsRow.sgd ?? whsRow.SD ?? whsRow.sd ?? ""),
      hi: toNum(pickHcpFromRow(whsRow)),
      eventName: eventName || "",
      holeCount: hc,
      scoreOrigin: whsRow.score_origin || ""
    });
  }

  // Sort descending
  rounds.sort((a, b) => b.dateSort - a.dateSort);

  // Find most recent row for hcpInfo extraction
  const sortedRows = rows.length > 0 ? [...rows].sort((a, b) => {
    const da = parseDotNetDate(a.played_at) || new Date(0);
    const db = parseDotNetDate(b.played_at) || new Date(0);
    return db - da;
  }) : [];

  // Stats
  const last20 = rounds.slice(0, 20);
  const validGross20 = last20.map(r => r.gross).filter(v => v != null);
  const validSD20 = last20.map(r => r.sd).filter(v => v != null);
  const avgGross20 = validGross20.length ? validGross20.reduce((a, b) => a + b, 0) / validGross20.length : null;
  const avgSD20 = validSD20.length ? validSD20.reduce((a, b) => a + b, 0) / validSD20.length : null;
  const lastSD = validSD20.length ? validSD20[0] : null;
  const currentHcp = rounds.find(r => r.hi != null)?.hi ?? null;

  // HCP evolution (ascending for chart)
  const hcpHistory = rounds.filter(r => r.hi != null && r.dateSort > 0)
    .sort((a, b) => a.dateSort - b.dateSort)
    .map(r => ({ d: r.dateSort, h: r.hi }));

  // Unique events
  const eventSet = new Set(rounds.filter(r => r.eventName).map(r => norm(r.eventName)));
  const numEDS = rounds.filter(r => r.scoreOrigin === 'EDS' || r.scoreOrigin === 'Indiv').length;

  // Course+Tee stats (only 18-hole rounds with valid gross)
  // Keyed by courseKey|teeKey
  const courseTeeStats = {};
  for (const r of rounds) {
    if (r.gross == null || r.holeCount !== 18) continue;
    if (!r.course || r.course.toUpperCase() === 'NONE' || !r.course.trim()) continue;
    const ctk = r.courseKey + '|' + r.teeKey;
    if (!courseTeeStats[ctk]) courseTeeStats[ctk] = {
      course: r.course, tee: r.tee, courseKey: r.courseKey, teeKey: r.teeKey,
      rounds: []
    };
    courseTeeStats[ctk].rounds.push({
      gross: r.gross,
      par: r.par,
      sd: r.sd,
      hi: r.hi,
      date: r.date,
      dateSort: r.dateSort,
      event: r.eventName
    });
  }
  // Summarise per course+tee
  const courseTeeAvg = {};
  for (const [ctk, cs] of Object.entries(courseTeeStats)) {
    const grosses = cs.rounds.map(r => r.gross).sort((a, b) => a - b);
    const avg = grosses.reduce((a, b) => a + b, 0) / grosses.length;
    // Sort rounds by date desc for display
    cs.rounds.sort((a, b) => b.dateSort - a.dateSort);
    courseTeeAvg[ctk] = {
      course: cs.course,
      tee: cs.tee,
      courseKey: cs.courseKey,
      teeKey: cs.teeKey,
      avg: Math.round(avg * 10) / 10,
      count: grosses.length,
      best: grosses[0],
      worst: grosses[grosses.length - 1],
      rounds: cs.rounds
    };
  }

  // First game date and yearly stats
  const validDates = rounds.filter(r => r.dateSort > 0);
  const firstDate = validDates.length > 0 
    ? validDates.reduce((a, b) => a.dateSort < b.dateSort ? a : b).date 
    : null;
  const now = new Date();
  const currentYearStart = new Date(now.getFullYear(), 0, 1).getTime();
  const lastYearStart = new Date(now.getFullYear() - 1, 0, 1).getTime();
  const twoYearsAgoStart = new Date(now.getFullYear() - 2, 0, 1).getTime();
  const threeYearsAgoStart = new Date(now.getFullYear() - 3, 0, 1).getTime();
  const roundsCurrentYear = rounds.filter(r => r.dateSort >= currentYearStart).length;
  const roundsLastYear = rounds.filter(r => r.dateSort >= lastYearStart && r.dateSort < currentYearStart).length;
  const rounds2YearsAgo = rounds.filter(r => r.dateSort >= twoYearsAgoStart && r.dateSort < lastYearStart).length;
  const rounds3YearsAgo = rounds.filter(r => r.dateSort >= threeYearsAgoStart && r.dateSort < twoYearsAgoStart).length;

  return {
    fed,
    numRounds: rounds.length,
    numTournaments: eventSet.size,
    numEDS,
    currentHcp,
    avgGross20,
    avgSD20,
    lastSD,
    hcpHistory,
    courseTee: courseTeeAvg,
    firstDate,
    rounds3YearsAgo,
    rounds2YearsAgo,
    roundsLastYear,
    roundsCurrentYear
  };
}

function extractAllPlayerStats(allPlayers, outputRoot) {
  const stats = {};
  for (const p of allPlayers) {
    try {
      const s = extractPlayerStats(p.fed, outputRoot);
      if (s) {
        s.name = p.name;
        s.escalao = p.escalao || "";
        s.birthYear = p.birthYear || "";
        s.sex = p.sex || "";
        s.club = p.club || "";
        stats[p.fed] = s;
      }
    } catch (e) {
      console.error(`  ⚠ Erro ao extrair stats de ${p.name} (${p.fed}):`, e.message);
    }
  }
  return stats;
}

/* ------------------ MAIN ------------------ */

function processPlayer(FED, allPlayers, crossStats) {
  // Marcar jogador atual e copiar info
  const players = allPlayers.map(p => {
    // Compute HCP bin
    let hcpBin = '';
    if (p.hcp != null) {
      const h = Number(p.hcp);
      if (h <= 0) hcpBin = '≤0';
      else if (h <= 5) hcpBin = '0.1-5';
      else if (h <= 10) hcpBin = '5.1-10';
      else if (h <= 15) hcpBin = '10.1-15';
      else if (h <= 20) hcpBin = '15.1-20';
      else if (h <= 30) hcpBin = '20.1-30';
      else if (h <= 40) hcpBin = '30.1-40';
      else hcpBin = '40+';
    }
    return {
      fed: p.fed,
      name: p.name,
      escalao: p.escalao || "",
      club: p.club || "",
      region: p.region || "",
      sex: p.sex || "",
      hcp: p.hcp,
      hcpBin,
      tags: p.tags || [],
      birthYear: p.birthYear || "",
      isCurrent: p.fed === FED
    };
  });
  players.sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    return a.name.localeCompare(b.name);
  });

  const currentPlayer = players.find(p => p.isCurrent);
  const playerName = currentPlayer ? currentPlayer.name : "";
  const playerEscalao = currentPlayer ? currentPlayer.escalao : "";
  const playerClub = currentPlayer ? currentPlayer.club : "";
  const playerRegion = currentPlayer ? currentPlayer.region : "";

  const baseDir = path.join(process.cwd(), "output", FED);
  const whsPath = path.join(baseDir, "whs-list.json");
  const scorecardsDir = path.join(baseDir, "scorecards");

  if (!fs.existsSync(whsPath)) {
    console.error("  ⚠ Não encontrei:", whsPath, "- a saltar");
    return;
  }
  if (!fs.existsSync(scorecardsDir)) {
    console.error("  ⚠ Não encontrei:", scorecardsDir, "- a saltar");
    return;
  }

  const whs = JSON.parse(fs.readFileSync(whsPath, "utf-8"));
  const rows = whs?.Records || [];
  applyMelhorias(rows, FED);

  console.log(`Jogador: ${playerName || FED}${playerEscalao ? ' [' + playerEscalao + ']' : ''}`);

  const whsByScoreId = new Map();
  for (const r of rows) {
    if (r?.score_id != null) whsByScoreId.set(String(r.score_id), r);
  }

  const cardByScoreId = new Map();
  const holeCountByScoreId = new Map();
  const files = fs.readdirSync(scorecardsDir).filter(f => f.endsWith(".json"));
  for (const f of files) {
    const scoreId = path.basename(f, ".json");
    try {
      const json = JSON.parse(fs.readFileSync(path.join(scorecardsDir, f), "utf-8"));
      const rec = pickScorecardRec(json);
      if (rec) {
        applyMelhoriasScorecard(rec, FED, scoreId);
        cardByScoreId.set(String(scoreId), rec);
        holeCountByScoreId.set(String(scoreId), holeCountFromRec(rec));
      }
    } catch {}
  }

  const fragments = {};
  const holeScores = {};
  for (const [scoreId, whsRow] of whsByScoreId.entries()) {
    const rec = cardByScoreId.get(scoreId);
    if (!rec) continue;
    fragments[scoreId] = buildScorecardFragment({ fed: FED, scoreId, rec, whsRow }).trim();
    // Per-hole gross for eclectic comparison
    const hc = holeCountFromRec(rec);
    const g = [], p = [], si = [], m = [];
    for (let i = 1; i <= hc; i++) {
      const gv = toNum(rec[`gross_${i}`]);
      g.push(gv && gv > 0 ? gv : null); // gross=0 means NR (No Return)
      p.push(toNum(rec[`par_${i}`]) ?? null);
      si.push(toNum(rec[`stroke_index_${i}`]) ?? null);
      m.push(toNum(rec[`meters_${i}`]) ?? null);
    }
    holeScores[scoreId] = { g, p, si, m, hc };
  }

  const rounds = [];
  
  // Processar rounds que estão no whs-list
  for (const [scoreId, whsRow] of whsByScoreId.entries()) {
    const rec = cardByScoreId.get(scoreId) || null;
    const dateObj = getPlayedAt(rec, whsRow);

    const course = getCourse(rec, whsRow);
    const holeCount = holeCountByScoreId.get(scoreId) || (rec ? holeCountFromRec(rec) : (toNum(whsRow?.holes) || 18));
    const displayCourse = courseAlias(course, holeCount, rec);
    const tee = getTee(rec, whsRow);
    const metersTotal = rec ? metersTotalFromRec(rec) : null;
    const eventName = pickEventName(whsRow, rec);

    let gross = pickGrossFromWHS(whsRow);
    if ((gross === "" || gross == null) && rec) {
      const cand = toNum(rec?.gross_total) ?? toNum(rec?.GrossTotal) ?? null;
      if (cand != null) gross = cand;
      else {
        const hc = holeCountByScoreId.get(scoreId) || holeCountFromRec(rec);
        let s = 0, c = 0;
        for (let i=1;i<=hc;i++){
          const v = toNum(rec?.[`gross_${i}`]);
          if (isMeaningful(v)) { s += v; c++; }
        }
        if (c>0) gross = s;
      }
    }

    rounds.push({
      scoreId,
      holeCount,
      course: displayCourse,
      courseOrig: course,
      courseKey: norm(displayCourse),
      date: fmtDate(dateObj),
      dateSort: dateObj ? dateObj.getTime() : 0,
      tee: tee || "",
      teeKey: normKey(tee || ""),
      meters: metersTotal != null ? metersTotal : "",
      gross: gross ?? "",
      par: rec ? parTotalFromRec(rec) : null,
      stb: whsRow.stableford ?? whsRow.Stableford ?? "",
      sd: whsRow.sgd ?? whsRow.SD ?? whsRow.sd ?? "",
      hi: pickHcpFromRow(whsRow),
      eventName: eventName || "",
      eventKey: norm(eventName || ""),
      scoreOrigin: whsRow.score_origin || "",
      hasCard: !!rec,
      _links: getMelhoriaLink(FED, scoreId),
      _pill: getMelhoriaPill(FED, scoreId),
      _group: getMelhoriaGroup(FED, scoreId),
      _showInTournament: getMelhoriaTornView(FED, scoreId)
    });
  }
  
  // Processar scorecards órfãos (existem na pasta mas não no whs-list)
  for (const [scoreId, rec] of cardByScoreId.entries()) {
    if (whsByScoreId.has(scoreId)) continue; // Já processado
    
    const dateObj = getPlayedAt(rec, null);
    if (!dateObj) continue; // Sem data válida, ignorar
    
    const course = getCourse(rec, null);
    const hcOrphan = holeCountFromRec(rec);
    const displayCourseOrphan = courseAlias(course, hcOrphan, rec);
    const tee = getTee(rec, null);
    const metersTotal = metersTotalFromRec(rec);
    const eventName = pickEventName(null, rec);
    
    let gross = toNum(rec?.gross_total) ?? toNum(rec?.GrossTotal) ?? null;
    if (gross == null) {
      const hc = hcOrphan;
      let s = 0, c = 0;
      for (let i=1; i<=hc; i++){
        const v = toNum(rec?.[`gross_${i}`]);
        if (isMeaningful(v)) { s += v; c++; }
      }
      if (c>0) gross = s;
    }
    
    rounds.push({
      scoreId,
      holeCount: hcOrphan,
      course: displayCourseOrphan,
      courseOrig: course,
      courseKey: norm(displayCourseOrphan),
      date: fmtDate(dateObj),
      dateSort: dateObj.getTime(),
      tee: tee || "",
      teeKey: normKey(tee || ""),
      meters: metersTotal != null ? metersTotal : "",
      gross: gross ?? "",
      par: parTotalFromRec(rec),
      stb: "",
      sd: "",
      hi: "",
      eventName: eventName || "",
      eventKey: norm(eventName || ""),
      scoreOrigin: "",
      hasCard: true,
      _links: getMelhoriaLink(FED, scoreId),
      _pill: getMelhoriaPill(FED, scoreId),
      _group: getMelhoriaGroup(FED, scoreId),
      _showInTournament: getMelhoriaTornView(FED, scoreId)
    });
  }

  // ===== Injectar treinos e extra_rounds do melhorias.json =====
  const melh = loadMelhorias();
  const melhPlayer = melh[String(FED)];
  if (melhPlayer) {
    // Treinos (Game Book) — com deduplicação por data+campo
    if (Array.isArray(melhPlayer.treinos)) {
      // Agrupar por data+campo para dedup
      const treinoGroups = new Map();
      for (let ti = 0; ti < melhPlayer.treinos.length; ti++) {
        const t = melhPlayer.treinos[ti];
        const key = (t.data || '') + '|' + norm(t.campo || '');
        if (!treinoGroups.has(key)) treinoGroups.set(key, []);
        treinoGroups.get(key).push({ idx: ti, t });
      }
      // Para cada grupo, manter o treino com mais informação
      const treinos = [];
      for (const [, group] of treinoGroups) {
        group.sort((a, b) => {
          // Preferir o que tem gross_holes (scorecard completo)
          const aScore = (a.t.gross_holes ? 10 : 0) + (a.t.gross != null ? 1 : 0) + (a.t.companhia ? 1 : 0);
          const bScore = (b.t.gross_holes ? 10 : 0) + (b.t.gross != null ? 1 : 0) + (b.t.companhia ? 1 : 0);
          return bScore - aScore;
        });
        treinos.push(group[0]);
        if (group.length > 1) {
          console.log(`  ↳ Dedup treino ${group[0].t.data} ${group[0].t.campo}: ${group.length} → 1 (mantido o mais completo)`);
        }
      }
      
      for (let i = 0; i < treinos.length; i++) {
        const { t } = treinos[i];
        const dp = (t.data || '').split('-');  // yyyy-mm-dd
        const dateObj = dp.length === 3 ? new Date(+dp[0], +dp[1]-1, +dp[2]) : null;
        const fakeId = 'treino_' + i;
        const hc = t.holes || 9;
        
        // Criar fragment e holeScores para treinos
        if (t.gross_holes && t.par_holes) {
          const cleanG = t.gross_holes.map(v => (v != null && v > 0) ? v : null);
          holeScores[fakeId] = {
            g: cleanG,
            p: t.par_holes,
            si: t.si_holes || [],
            m: t.meters_holes || [],
            hc: hc
          };
          fragments[fakeId] = buildManualFragment({
            courseName: t.campo || '',
            dateFmt: dateObj ? fmtDate(dateObj) : '',
            gross: cleanG,
            par: t.par_holes,
            si: t.si_holes || [],
            meters: t.meters_holes || [],
            holeCount: hc,
            tee: '',
            link: '',
            label: 'TREINO'
          }).trim();
        }
        
        rounds.push({
          scoreId: fakeId,
          holeCount: hc,
          course: t.campo || '',
          courseOrig: t.campo || '',
          courseKey: norm(t.campo || ''),
          date: dateObj ? fmtDate(dateObj) : '',
          dateSort: dateObj ? dateObj.getTime() : 0,
          tee: '',
          teeKey: '',
          meters: '',
          gross: t.gross ?? '',
          par: t.par ?? null,
          stb: '',
          sd: '',
          hi: '',
          eventName: 'Treino' + (t.companhia ? ' (c/ ' + t.companhia + ')' : ''),
          eventKey: 'treino',
          scoreOrigin: 'Treino',
          hasCard: !!t.gross_holes,
          _isTreino: true,
          _fonte: t.fonte || 'Game Book'
        });
      }
      console.log(`  + ${treinos.length} treinos injectados (de ${melhPlayer.treinos.length} originais)`);
    }

    // Resolver nomes de campos dos treinos para coincidir com nomes FPG existentes
    // Recolher courseKeys dos rounds FPG
    const fpgCourseNames = new Map(); // norm(name) → displayName
    for (const r of rounds) {
      if (!r._isTreino && !r._isExtra && r.course) {
        fpgCourseNames.set(r.courseKey, r.course);
      }
    }
    // Para cada treino, tentar encontrar o campo FPG correspondente
    for (const r of rounds) {
      if (!r._isTreino) continue;
      if (fpgCourseNames.has(r.courseKey)) continue; // Já coincide
      
      // Tentar match parcial: "Desertas Course" → procurar courseKey que contenha "desertas"
      const treWords = r.courseKey.replace(/course|golfe|golf/gi, '').trim().split(/\s+/).filter(w => w.length > 2);
      let bestMatch = null, bestScore = 0;
      for (const [fKey, fName] of fpgCourseNames) {
        let score = 0;
        for (const w of treWords) {
          if (fKey.indexOf(w) >= 0) score++;
        }
        if (score > bestScore) { bestScore = score; bestMatch = { key: fKey, name: fName }; }
      }
      if (bestMatch && bestScore >= 1) {
        console.log(`  ↳ Treino "${r.course}" → "${bestMatch.name}"`);
        r.course = bestMatch.name;
        r.courseKey = bestMatch.key;
      }
    }

    // Extra rounds (torneios não aceites pela FPG)
    if (Array.isArray(melhPlayer.extra_rounds)) {
      for (let ei = 0; ei < melhPlayer.extra_rounds.length; ei++) {
        const ex = melhPlayer.extra_rounds[ei];
        if (!Array.isArray(ex.dias)) continue;
        for (let di = 0; di < ex.dias.length; di++) {
          const dia = ex.dias[di];
          const dp = (dia.data || '').split('-');
          const dateObj = dp.length === 3 ? new Date(+dp[0], +dp[1]-1, +dp[2]) : null;
          const fakeId = 'extra_' + ei + '_' + di;
          const hc = dia.holes || 18;
          
          if (dia.gross_holes && dia.par_holes) {
            const cleanG = dia.gross_holes.map(v => (v != null && v > 0) ? v : null);
            holeScores[fakeId] = {
              g: cleanG,
              p: dia.par_holes,
              si: dia.si_holes || [],
              m: dia.meters_holes || [],
              hc: hc
            };
            fragments[fakeId] = buildManualFragment({
              courseName: ex.campo || '',
              dateFmt: dateObj ? fmtDate(dateObj) : '',
              gross: cleanG,
              par: dia.par_holes,
              si: dia.si_holes || [],
              meters: dia.meters_holes || [],
              holeCount: hc,
              tee: ex.categoria || '',
              link: '',
              links: ex.links || (ex.link ? { link: ex.link } : null),
              label: (ex.nao_comunicado_fpg || ex.nao_aceite_fpg) ? 'Não comunicado FPG' : ''
            }).trim();
          }
          
          const label = ex.torneio + (dia.dia ? ' ' + dia.dia : '');
          rounds.push({
            scoreId: fakeId,
            holeCount: hc,
            course: ex.campo || '',
            courseOrig: ex.campo || '',
            courseKey: norm(ex.campo || ''),
            date: dateObj ? fmtDate(dateObj) : '',
            dateSort: dateObj ? dateObj.getTime() : 0,
            tee: ex.categoria || '',
            teeKey: normKey(ex.categoria || ''),
            meters: dia.meters_total || '',
            gross: dia.gross ?? '',
            par: dia.par ?? null,
            stb: '',
            sd: '',
            hi: '',
            eventName: label,
            eventKey: norm(label),
            scoreOrigin: 'Extra',
            hasCard: !!dia.gross_holes,
            _isExtra: true,
            _showInTournament: !!ex.torneio_view,
            _naoAceiteFpg: ex.nao_aceite_fpg || false,
            _links: ex.links || (ex.link ? { link: ex.link } : null),
            _pill: ex.pill || ''
          });
        }
      }
      console.log(`  + ${melhPlayer.extra_rounds.length} extra round(s) injectados`);
    }
  }

  // ===== Preencher campos em falta para treinos e extra_rounds =====
  // 1) Calcular stableford (scratch) a partir de gross_holes/par_holes
  // 2) Estimar SD ≈ gross - par (sem slope/CR oficiais)
  // 3) Interpolar HI a partir dos records WHS mais próximos por data
  // 4) Preencher metros se disponíveis

  // Construir array de HI por data para interpolação
  const hiTimeline = rows
    .filter(r => r.new_handicap != null && r.hcp_dateStr)
    .map(r => ({ date: new Date(r.hcp_dateStr).getTime(), hi: r.new_handicap }))
    .sort((a, b) => a.date - b.date);

  function interpolateHI(dateSort) {
    if (!hiTimeline.length || !dateSort) return null;
    // Encontrar o HI mais próximo anterior ou igual à data
    let best = null;
    for (const h of hiTimeline) {
      if (h.date <= dateSort) best = h.hi;
      else break;
    }
    // Se não há anterior, usar o primeiro disponível
    if (best == null && hiTimeline.length) best = hiTimeline[0].hi;
    return best;
  }

  function calcScratchStableford(grossHoles, parHoles) {
    if (!grossHoles || !parHoles) return null;
    let total = 0;
    for (let i = 0; i < grossHoles.length; i++) {
      const g = grossHoles[i], p = parHoles[i];
      if (g != null && g > 0 && p != null) {
        total += Math.max(0, 2 + p - g);
      }
    }
    return total;
  }

  for (const r of rounds) {
    if (!r._isTreino && !r._isExtra) continue;

    const hs = holeScores[r.scoreId];

    // Stableford (scratch — sem handicap de jogo)
    if ((r.stb === '' || r.stb == null) && hs && hs.g && hs.p) {
      r.stb = calcScratchStableford(hs.g, hs.p);
    }

    // SD estimado ≈ gross - par (slope=113, CR≈par)
    if ((r.sd === '' || r.sd == null) && r.gross != null && r.gross !== '' && r.par != null) {
      const sdEst = Number(r.gross) - Number(r.par);
      r.sd = sdEst;
      r._sdEstimated = true;
    }

    // HI interpolado
    if ((r.hi === '' || r.hi == null) && r.dateSort) {
      r.hi = interpolateHI(r.dateSort);
    }

    // Metros totais
    if ((r.meters === '' || r.meters == null) && hs && hs.m && hs.m.length) {
      const mTotal = hs.m.reduce((s, v) => s + (v || 0), 0);
      if (mTotal > 0) r.meters = mTotal;
    }
  }

  const byCourse = new Map();
  for (const r of rounds) {
    if (!byCourse.has(r.courseKey)) byCourse.set(r.courseKey, { course: r.course, rounds: [] });
    byCourse.get(r.courseKey).rounds.push(r);
  }

  const courses = Array.from(byCourse.values()).map(c => {
    c.rounds.sort((a,b) => (b.dateSort - a.dateSort) || String(b.scoreId).localeCompare(String(a.scoreId)));
    const last = c.rounds[0] || null;
    return { course: c.course, count: c.rounds.length, lastDateSort: last?.dateSort || 0, rounds: c.rounds };
  });

  // Build teeMap per course (used for eclectic + hole stats)
  const teeMapByCourse = {};
  for (const c of courses) {
    const teeMap = new Map();
    for (const r of c.rounds) {
      if (!r.hasCard) continue;
      const rec = cardByScoreId.get(String(r.scoreId));
      if (!rec) continue;
      const tName = getTee(rec, whsByScoreId.get(String(r.scoreId)) || {});
      const tKey = normKey(tName);
      if (!teeMap.has(tKey)) teeMap.set(tKey, { teeName: tName, recs: [] });
      teeMap.get(tKey).recs.push({ rec, scoreId: String(r.scoreId), date: r.date || "", holeCount: holeCountByScoreId.get(String(r.scoreId)) || holeCountFromRec(rec) });
    }
    teeMapByCourse[norm(c.course)] = teeMap;
  }

  const eclecticByCourse = {};
  for (const c of courses) {
    const teeMap = teeMapByCourse[norm(c.course)] || new Map();
    const ecList = [];
    for (const [, obj] of teeMap.entries()) {
      const ec = computeEclecticForTee(obj.recs, obj.teeName);
      if (ec) ecList.push(ec);
    }
    ecList.sort((a,b)=> (b.holeCount - a.holeCount) || a.teeName.localeCompare(b.teeName));
    eclecticByCourse[norm(c.course)] = ecList;
  }


  // Detalhes do ecletico por curso+teeKey para UI (buraco a buraco)
  const eclecticDetails = {};
  for (const c of courses) {
    const key = norm(c.course);
    const list = eclecticByCourse[key] || [];
    if (!list.length) continue;
    eclecticDetails[key] = {};
    for (const ec of list) {
      eclecticDetails[key][ec.teeKey] = ec; // inclui holes[]
    }
  }

  // Análise por buraco (course+tee) para UI
  const courseHoleStats = {};
  for (const c of courses) {
    const key = norm(c.course);
    const teeMap = teeMapByCourse[key] || new Map();
    if (!teeMap.size) continue;
    courseHoleStats[key] = {};
    for (const [tk, obj] of teeMap.entries()) {
      const hs = computeHoleStats(obj.recs, obj.teeName);
      if (hs) courseHoleStats[key][tk] = hs;
    }
  }

  const analysisDir = path.join(baseDir, "analysis");
  fs.mkdirSync(analysisDir, { recursive: true });

  const htmlPath = path.join(analysisDir, "by-course-ui.html");

  // Gerar menu dropdown de jogadores
  const displayName = playerName || ("Federado " + FED);
  const playerSex = currentPlayer ? currentPlayer.sex : "";
  const playerTags = currentPlayer ? (currentPlayer.tags || []) : [];
  const playerBirthYear = currentPlayer ? (currentPlayer.birthYear || "") : "";
  let playerMenuHtml = "";
  if (players.length > 1) {
    // Escalões únicos presentes
    const escalaosSet = new Set(players.map(p => p.escalao).filter(Boolean));
    const escalaoOrder = ['Sub-10','Sub-12','Sub-14','Sub-16','Sub-18','Sub-21','Sub-24','Outros','MidAmateur','Absoluto','Sénior'];
    const escalaos = escalaoOrder.filter(e => escalaosSet.has(e));
    escalaosSet.forEach(e => { if (!escalaos.includes(e)) escalaos.push(e); });

    // Collect unique filter values
    const clubsSet = [...new Set(players.map(p => p.club).filter(Boolean))].sort();
    const regionsSet = [...new Set(players.map(p => p.region).filter(Boolean))].sort();
    const sexSet = [...new Set(players.map(p => p.sex).filter(Boolean))].sort();
    const hcpMaxThresholds = [0, 3, 6, 9, 12, 15, 18, 21, 25, 28, 31, 38, 45];
    const hcpMaxLabels = {0:'Scratch (≤0)', 3:'≤ 3', 6:'≤ 6', 9:'≤ 9', 12:'≤ 12', 15:'≤ 15', 18:'≤ 18', 21:'≤ 21', 25:'≤ 25', 28:'≤ 28', 31:'≤ 31', 38:'≤ 38', 45:'≤ 45'};

    // Build dropdown filters
    let filterHtml = '';
    const selects = [];
    if (escalaos.length > 1) {
      selects.push(`<select class="pm-fsel" data-dim="escalao"><option value="all">Escalão</option>` +
        escalaos.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join('') + `</select>`);
    }
    if (sexSet.length > 1) {
      selects.push(`<select class="pm-fsel" data-dim="sex"><option value="all">Sexo</option>` +
        sexSet.map(s => `<option value="${esc(s)}">${s === 'M' ? 'Masc.' : s === 'F' ? 'Fem.' : esc(s)}</option>`).join('') + `</select>`);
    }
    if (regionsSet.length > 1) {
      selects.push(`<select class="pm-fsel" data-dim="region"><option value="all">Região</option>` +
        regionsSet.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('') + `</select>`);
    }
    if (players.some(p => p.hcp != null)) {
      selects.push(`<select class="pm-fsel" data-dim="hcpmax"><option value="all">HCP máx</option>` +
        hcpMaxThresholds.map(t => `<option value="${t}">${hcpMaxLabels[t]}</option>`).join('') + `</select>`);
    }
    if (clubsSet.length > 1) {
      selects.push(`<select class="pm-fsel" data-dim="club"><option value="all">Clube</option>` +
        clubsSet.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('') + `</select>`);
    }
    if (selects.length) {
      filterHtml =
        `<div class="pm-search-row"><input type="text" class="pm-search" id="pmSearch" placeholder="Pesquisar jogador…"><span class="pm-search-count" id="pmCount">${players.length} jogadores</span></div>` +
        `<div class="pm-filter-row">${selects.join('')}<button class="pm-reset" id="pmReset">✕ Limpar</button></div>`;
    }

    const linksHtml = players.map(p => {
      const href = p.isCurrent ? "#" : `../../${p.fed}/analysis/by-course-ui.html`;
      const cls = p.isCurrent ? ' class="active"' : '';
      const dot = p.isCurrent ? '<span class="pm-dot"></span>' : '';
      const esc2 = p.escalao ? `<span class="pm-esc">${esc(p.escalao)}</span>` : '';
      const clubTag = p.club ? `<span class="pm-club">${esc(p.club)}</span>` : '';
      const tagsStr = (p.tags || []).join(',');
      const hcpStr = (p.hcp != null) ? `<span class="pm-hcp">${p.hcp > 0 ? '+' : ''}${p.hcp}</span>` : '';
      const normName = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
      return `<a href="${href}"${cls} data-name="${esc(normName)}" data-fed="${esc(p.fed || '')}" data-escalao="${esc(p.escalao || '')}" data-club="${esc(p.club || '')}" data-region="${esc(p.region || '')}" data-sex="${esc(p.sex || '')}" data-hcp="${p.hcp != null ? p.hcp : ''}" data-tags="${esc(tagsStr)}">${dot}${esc(p.name)}${esc2}${clubTag}${hcpStr}<span class="pm-fed">${esc(p.fed)}</span></a>`;
    }).join("");

    playerMenuHtml = filterHtml + `<div class="pm-list">${linksHtml}</div>`;
  }

  // Build pills HTML for header
  const pillsArr = [];
  if (playerEscalao) pillsArr.push(`<span class="hd-pill hd-esc">${esc(playerEscalao)}</span>`);
  if (playerSex) pillsArr.push(`<span class="hd-pill ${playerSex === 'F' ? 'hd-sex-f' : 'hd-sex-m'}">${playerSex}</span>`);
  if (playerBirthYear) pillsArr.push(`<span class="hd-pill hd-birth">${playerBirthYear}</span>`);
  if (playerClub) pillsArr.push(`<span class="hd-pill hd-club">${esc(playerClub)}</span>`);
  if (playerRegion) pillsArr.push(`<span class="hd-pill hd-region">${esc(playerRegion)}</span>`);
  playerTags.forEach(t => pillsArr.push(`<span class="hd-pill hd-tag">${esc(t)}</span>`));
  const headerPillsHtml = pillsArr.length ? `<div class="hd-pills">${pillsArr.join('')}</div>` : '';

  const headerNameHtml = players.length > 1
    ? `<span class="player-dropdown" id="playerDD">` +
        `<button type="button" class="player-btn" id="playerBtn">` +
          `${esc(displayName)} <span class="muted" style="font-weight:400;font-size:12px">(${esc(FED)})</span>` +
          ` <span class="dd-arrow">▼</span>` +
        `</button>` +
        `<div class="player-menu">${playerMenuHtml}</div>` +
      `</span>`
    : `${esc(displayName)}${playerName ? ' <span class="muted" style="font-weight:400;font-size:12px">(' + esc(FED) + ')</span>' : ''}`;

  // Extract HCP calculation info from newest WHS record
  const sortedRows = rows.length > 0 ? [...rows].sort((a, b) => {
    const da = parseDotNetDate(a.played_at || a.hcp_date) || new Date(0);
    const db = parseDotNetDate(b.played_at || b.hcp_date) || new Date(0);
    return db - da;
  }) : [];
  const newestRow = sortedRows[0] || {};
  const hcpInfo = {
    current: toNum(newestRow.new_handicap ?? newestRow.exact_handicap) ?? null,
    lowHcp: toNum(newestRow.calc_low_hcp) ?? null,
    softCap: toNum(newestRow.calc_hcp_softcap) ?? null,
    hardCap: toNum(newestRow.calc_hcp_hardcap) ?? null,
    scoreAvg: toNum(newestRow.calc_score_avg) ?? null,
    qtyScores: toNum(newestRow.calc_qty_scores) ?? null,
    qtyCalc: toNum(newestRow.calc_qty_scores_calc) ?? null,
    adjustTotal: toNum(newestRow.calc_adjust_total) ?? null
  };

  // Data de última actualização: data da ronda mais recente
  const mostRecentRound = rounds.length > 0 ? rounds.reduce((a, b) => (b.dateSort || 0) > (a.dateSort || 0) ? b : a) : null;
  const lastRoundDate = mostRecentRound?.date || '';
  const now = new Date();
  const generatedDate = String(now.getDate()).padStart(2,'0') + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + now.getFullYear();

  const byCourseHtml = `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${playerName ? esc(playerName) + ' — ' : ''}Scorecards — Federado ${esc(FED)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
  :root{
    --bg:#f7f8f6; --fg:#1c2617; --muted:#7a8a6e; --line:#d5dac9;
    --chip:#e0efdb; --head:#eef2e8; --accent:#2d6a30;
  }
  body{margin:0;background:var(--bg);color:var(--fg);font-family:'DM Sans',system-ui,-apple-system,sans-serif;}
  header{padding:14px 18px;display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;border-bottom:1px solid var(--line)}
  h1{font-size:17px;margin:0;font-weight:800}
  .controls{margin-left:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  input, select{border:1px solid var(--line);border-radius:6px;padding:8px 10px;background:var(--bg);font-size:13px;font-family:'DM Sans',system-ui,sans-serif}
  input{min-width:260px}
  /* D-card header */
  .hd-card{
    background:linear-gradient(135deg,#f0f2ec 0%,#e0efdb 100%);
    border:1px solid #d5dac9;padding:14px 20px;border-radius:10px;
    box-shadow:0 1px 4px rgba(30,50,20,.05);flex:1;min-width:0;
  }
  .hd-top{display:flex;align-items:center;gap:12px}
  .hd-hcp-block{
    background:#2d6a30;color:#fff;border-radius:8px;padding:6px 12px;
    text-align:center;min-width:58px;flex-shrink:0;
  }
  .hd-hcp-label{font-size:8px;font-weight:600;text-transform:uppercase;opacity:.7;letter-spacing:.5px}
  .hd-hcp-val{font-size:18px;font-weight:800;line-height:1.1}
  .hd-info{flex:1;min-width:0}
  .hd-name-row{display:flex;align-items:center;gap:4px}
  .hd-pills{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:4px}
  .hd-pill{
    display:inline-flex;align-items:center;
    font-size:10px;font-weight:600;padding:2px 7px;border-radius:5px;white-space:nowrap;
  }
  .hd-esc{background:#e0f2fe;color:#2d6a30}
  .hd-sex-m{background:#dbeafe;color:#1e40af;font-weight:700}
  .hd-sex-f{background:#fce7f3;color:#be185d;font-weight:700}
  .hd-birth{background:#eef2e8;color:#7a8a6e}
  .hd-club{background:#dcfce7;color:#166534}
  .hd-region{background:#ffedd5;color:#9a3412}
  .hd-tag{background:#fef3c7;color:#b45309}
  .hd-meta{
    font-size:11px;color:#7a8a6e;margin-top:8px;padding-top:6px;
    border-top:1px solid #d5dac9;line-height:1.4;
  }
  .hd-meta b{color:#4a5940;font-weight:600}
  main{padding:14px 18px}
  .card{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff;}
  .toolbar{padding:10px 12px;border-bottom:1px solid var(--line);background:var(--head);display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;}
  .stats{display:flex;gap:10px;align-items:center}
  .pill{background:var(--chip);border:1px solid var(--line);border-radius:999px;padding:6px 10px;font-size:12px;color:var(--muted);}
  table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
  th, td{border-bottom:1px solid #e8ebdf;padding:6px 8px;text-align:left;vertical-align:middle;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  th{font-size:11px;color:#4a5940;background:var(--head);font-weight:700;border-bottom:2px solid #bcc5ad}
  tr:hover{background:#f0f2ec}
  .r,.right{text-align:right;white-space:nowrap}
  .rowHead{display:flex;gap:10px;align-items:center}
  .count{width:24px;height:24px;border-radius:6px;background:#2d6a30;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex:none;}
  .courseBtn{border:0;background:transparent;padding:0;margin:0;color:#2d6a30;font-weight:700;cursor:pointer;font-size:12px}
  .courseBtn:hover{text-decoration:underline}
  .sub{font-size:11px;color:var(--muted);margin-top:2px}
  .right{white-space:nowrap;text-align:right}
  .muted{color:var(--muted)}
  .details{display:none;background:#fff}
  .details.open{display:table-row}
  .inner{padding:0;}
  .innerWrap{padding:10px 10px 12px;background:#fff}
  .innerTop{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}
  .innerTable{width:100%;border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .innerTable table{font-size:12px}
  .innerTable th{background:var(--head);color:#4a5940;border-bottom:2px solid #bcc5ad}
  .tee-date{display:inline-block;padding:2px 10px;border-radius:8px;font-size:11px;font-weight:700;white-space:nowrap}
  .score-delta{display:block;font-size:10px;font-weight:600;margin-top:1px;color:#9aab8e}
  .score-delta.pos{color:#dc2626}
  .score-delta.neg{color:#16a34a}
  .dt-compact th,.dt-compact td{padding:5px 8px}
  a.dateLink{color:#1c2617;text-decoration:underline;text-underline-offset:2px;cursor:pointer;}
  a.dateLink:hover{opacity:.75}
  .tournPill{transition:all .15s}
  .tournPill:hover{opacity:.8}

  .scorecardRow td{background:#fafafa;padding:8px 10px !important;}
  .scHost{border:1px solid var(--line);border-radius:10px;background:#fff;padding:10px;overflow:hidden;}

  .actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .btn{
    border:1px solid var(--line);background:#fff;border-radius:6px;
    padding:6px 10px;font-size:12px;cursor:pointer;color:#1c2617;font-family:'DM Sans',system-ui,sans-serif;
  }
  .btn:hover{background:#f0f2ec}
  .btnGhost{border-color:transparent;background:var(--chip);}
  .btnSmall{padding:4px 8px;border-radius:999px;}
  .btnPrint{font-size:11px;padding:4px 10px;vertical-align:middle;background:#e0efdb;border-color:#2d6a30;color:#1e4d20;font-weight:700;margin-left:8px}
  .btnPrint:hover{background:#d0e5c8}
  .btnPdf{font-size:11px;padding:4px 10px;background:#fef3c7;border-color:#fcd34d;color:#92400e;font-weight:700}
  .btnPdf:hover{background:#fde68a}
  .ecBlock{display:flex;flex-direction:column;gap:6px}
  .ecTitle{font-size:12px;color:#1c2617;font-weight:800}
  .ecHint{font-size:12px;color:var(--muted)}
  .ecWrap{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .ecPill{
    border:1px solid var(--line);border-radius:6px;padding:6px 10px;font-size:12px;background:#fff;color:#1c2617;
    display:flex;gap:8px;align-items:center;cursor:pointer; user-select:none;
  }
  .ecPill:hover{background:#f0f2ec}
  .ecPill.active{outline:2px solid #2d6a30; outline-offset:1px}
  .teeDot{width:10px;height:10px;border-radius:999px;display:inline-block;border:1px solid rgba(0,0,0,.08)}
  .ecScore{font-weight:900}
  .ecToPar{font-weight:900;color:#1c2617}

  .banner{
    margin:10px 0 10px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:#fafbf9;
    display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;
  }
  .banner b{color:#1c2617}
  .banner .meta{margin:0}

  /* ========== SCORECARD ESTILO GAMEBOOK ========== */
  .sc-modern{border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(30,50,20,.08);background:#fff;margin:12px 0}
  .sc-header{padding:12px 16px;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:16px}
  .sc-header-dark{color:#fff}
  .sc-header-light{color:#111}
  .sc-header-left{flex:1;min-width:0}
  .sc-header-right{display:flex;gap:12px;align-items:center}
  .sc-title{font-size:18px;font-weight:800;margin-bottom:4px}
  .sc-subtitle{font-size:13px;opacity:0.9;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .sc-subtitle>span:not(:last-child)::after{content:'·';margin-left:6px;opacity:0.6}
  .sc-links{margin-top:4px;display:flex;gap:8px;flex-wrap:wrap}
  .sc-ext-link{font-size:11px;color:inherit;opacity:0.85;text-decoration:none;border:1px solid rgba(255,255,255,0.3);border-radius:4px;padding:1px 6px}
  .sc-ext-link:hover{opacity:1;background:rgba(255,255,255,0.15)}
  .sc-fpg-badge{font-size:10px;background:rgba(255,200,0,0.3);border:1px solid rgba(255,200,0,0.5);border-radius:3px;padding:0 4px;cursor:help}
  .sc-stat{text-align:center;min-width:55px}
  .sc-stat-label{font-size:10px;text-transform:uppercase;letter-spacing:0.05em;opacity:0.8;margin-bottom:2px}
  .sc-stat-value{font-size:18px;font-weight:900;line-height:1}
  .sc-stat-score .sc-stat-value{font-size:18px}
  .sc-table-modern{width:100%;border-collapse:collapse;font-size:11px}
  .sc-table-modern th,.sc-table-modern td{padding:6px 2px;text-align:center;border:1px solid #d5dac9}
  .sc-table-modern th{background:#eef2e8;font-weight:800;font-size:10px;color:#4a5940}
  .sc-table-modern .hole-header{background:#eef2e8;color:#4a5940;font-weight:700;font-size:11px;border-bottom:1px solid #d5dac9}
  .sc-table-modern .row-label{text-align:left;padding-left:8px;font-weight:700;color:#1c2617;min-width:70px;border-right:2px solid #d5dac9}
  .sc-table-modern .col-out,.sc-table-modern .col-in{background:#f0f2ec;border-left:1px solid #d5dac9;border-right:1px solid #d5dac9}
  .sc-table-modern .col-total{background:#e0efdb;border-left:1px solid #bcc5ad;font-weight:800}
  .sc-table-modern .sep-row td{border-bottom:2px solid #bcc5ad}
  .sc-table-modern .meta-row td{color:#b0b8c4;font-size:10px}
  .sc-table-modern .par-label{color:#9aab8e;font-weight:600;font-size:11px}
  .sc-topar{display:block;font-size:10px;font-weight:600;margin-top:1px}
  .sc-topar-pos{color:#dc2626}
  .sc-topar-neg{color:#16a34a}
  .sc-topar-zero{color:#9aab8e}
  .sc-bar-head{background:#eef2e8;padding:8px 12px;font-size:12px;font-weight:700;color:#4a5940;display:flex;justify-content:space-between;border-bottom:2px solid #bcc5ad}
  .sc-pill{display:inline-block;color:#fff;padding:2px 10px;border-radius:8px;font-size:11px;font-weight:700}
  .sc-separator{border-left:4px solid #fff !important}
  .sd-excellent{background:#d1fae5 !important}
  .sd-good{background:#fef3c7 !important}
  .sd-poor{background:#fee2e2 !important}
  .hcp-hard{color:#1c2617 !important}
  .hcp-medium{color:#1c2617 !important}
  .hcp-easy{color:#1c2617 !important}
  .sc-score{font-weight:900;font-size:13px;min-width:26px;min-height:26px;display:inline-flex;align-items:center;justify-content:center}
  .sc-score.holeinone{background:#10b981;color:#fff;border-radius:999px}
  .sc-score.albatross{background:#10b981;color:#fff;border-radius:999px}
  .sc-score.eagle{background:#f59e0b;color:#fff;border-radius:999px}
  .sc-score.birdie{background:#dc2626;color:#fff;border-radius:999px}
  .sc-score.par{background:transparent;color:#1c2617;border-radius:0}
  .sc-score.bogey{background:#f0f2ec;color:#1e40af;border-radius:0;border:1px solid #bfdbfe}
  .sc-score.double{background:#93c5fd;color:#1e3a5f;border-radius:0}
  .sc-score.triple{background:#2563eb;color:#fff;border-radius:0}
  .sc-score.quad{background:#1e3a8a;color:#fff;border-radius:0}
  .sc-score.quint{background:#172554;color:#fff;border-radius:0}
  .sc-score.worse{background:#0a0f1f;color:#fff;border-radius:0}
  .sc-totals{background:#eef2e8;font-weight:900;font-size:14px}
  .sc-footer{padding:16px 20px;display:flex;justify-content:space-between;align-items:center;background:#eef2e8;border-top:2px solid #d5dac9}
  .sc-footer-item{text-align:center;flex:1}
  .sc-footer-label{font-size:12px;color:#4a5940;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em}
  .sc-footer-value{font-size:28px;font-weight:900;color:#1c2617}
  .sc-footer-value.score-to-par{color:var(--tee-color)}
  .sc-table-separator{height:12px;background:transparent}
  @media (max-width:640px){
    .sc-header{flex-direction:column;align-items:flex-start;gap:8px}
    .sc-header-right{width:100%;justify-content:space-around}
    .sc-table-modern{font-size:10px}
    .sc-table-modern th,.sc-table-modern td{padding:5px 1px}
    .sc-score{min-width:24px;min-height:24px;font-size:12px}
    .sc-title{font-size:16px}
    .sc-subtitle{font-size:11px}
    .sc-stat-label{font-size:9px}
    .sc-stat-value{font-size:18px}
    .sc-stat-score .sc-stat-value{font-size:20px}
  }
  .teePill{border-radius:999px;padding:2px 7px;font-weight:800;font-size:10px;border:1px solid rgba(0,0,0,.08);white-space:nowrap}
  .teePill-sm{padding:1px 6px;font-size:9px}
  /* Gross + par diff alignment */
  /* gross delta uses .score-delta class */
  .grpRow td{background:#f0f2ec;font-weight:700;color:#1c2617;font-size:12px;border-bottom:1px solid #d5dac9;padding:6px 8px}
  .grpRow .muted{font-weight:600}
  .hb{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:999px;font-weight:900;font-size:12px;border:1px solid #d5dac9;background:#fff}
  .eds-badge{display:inline-block;font-size:9px;font-weight:700;color:#2d6a30;background:#e0f2fe;border-radius:3px;padding:0 3px;margin-left:4px;vertical-align:middle;letter-spacing:.5px}
  .away-pill{display:inline-block;font-size:9px;font-weight:800;color:#000;background:#39FF14;border-radius:3px;padding:0 4px;margin-left:4px;vertical-align:middle;letter-spacing:.5px;text-shadow:none}
  .intl-pill{display:inline-block;font-size:9px;font-weight:800;color:#fff;background:#1e88e5;border-radius:3px;padding:0 4px;margin-left:2px;vertical-align:middle;letter-spacing:.5px}
  .nacional-pill{display:inline-block;font-size:9px;font-weight:800;color:#fff;background:#c62828;border-radius:3px;padding:0 4px;margin-left:4px;vertical-align:middle;letter-spacing:.5px}
  .regional-pill{display:inline-block;font-size:9px;font-weight:800;color:#fff;background:#e65100;border-radius:3px;padding:0 4px;margin-left:4px;vertical-align:middle;letter-spacing:.5px}
  .kpi-info{cursor:help;font-size:12px;margin-left:4px;opacity:0.5;position:relative}
  .kpi-info:hover{opacity:1}
  .hb9{color:#1c2617}
  .hb18{color:#1c2617}


  @media (max-width: 900px){
    .sc-res{width:24px;height:24px;font-size:11px}
    .sc-l{width:80px}
    .sc-big-gross,.sc-big-topar{font-size:26px}
  }

  .an-wrap{max-width:1180px;margin:0 auto}
  .an-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:8px 0 14px}
  .an-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
  @media (max-width: 980px){ .an-grid{grid-template-columns:repeat(2,1fr)} .an-grid2{grid-template-columns:1fr} }
  .an-card{border:1px solid #d5dac9;border-radius:10px;background:#fff;padding:12px}
  .an-k-title{font-weight:700;margin-bottom:6px}
  .an-k-val{font-size:22px;line-height:1.1;font-family:'JetBrains Mono',monospace}
  .an-k-sub{margin-top:4px}
  .an-table{width:100%;border-collapse:collapse;margin-top:8px;table-layout:fixed}
  .an-table th,.an-table td{border-top:1px solid #e8ebdf;padding:6px 8px;font-size:12px;vertical-align:middle}
  .an-table th{background:#eef2e8;color:#4a5940;font-weight:700;font-size:11px;border-bottom:2px solid #bcc5ad;border-top:none}
  .an-rates{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:10px}
  .an-rates b{font-size:18px}


  /* Ecletico layout: fixa posição e aspeto do cartão (evita saltos por flex-wrap) */
  .ecGrid{display:flex;flex-direction:column;gap:12px;width:100%}
  .ecLeft{width:100%}
  .ecRight{width:100%;min-height:180px;transition:min-height 0.2s ease}
  .ecPlaceholder{padding:20px;text-align:center;color:#9aab8e;font-size:14px;font-style:italic;border:2px dashed #d5dac9;border-radius:12px;background:#f0f2ec}
  .ecDetailCard{border:1px solid #d5dac9;border-radius:10px;overflow:hidden;background:#fff}
  .ecDetailHead{padding:8px 12px;background:#eef2e8;border-bottom:2px solid #bcc5ad;font-size:12px;color:#4a5940;font-weight:900}
  .ecDetailBody{padding:8px 10px;font-size:12px;color:#7a8a6e}
  
  .courseAnalysis{margin:12px 0;padding:14px;border:1px solid #d5dac9;border-radius:10px;background:#fafbf9}
  .caTitle{font-size:13px;font-weight:800;color:#1c2617;margin-bottom:10px}
  .caKpis{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
  .caKpi{background:#fff;border:1px solid #d5dac9;border-radius:10px;padding:8px 12px;min-width:90px;text-align:center}
  .caKpiVal{font-size:16px;font-weight:800;color:#1c2617;font-family:'JetBrains Mono',monospace}
  .caKpiVal.best{color:#16a34a}
  .caKpiVal.worst{color:#dc2626}
  .caKpiLbl{font-size:10px;color:#7a8a6e;font-weight:600;margin-top:2px}
  .trend-up .caKpiVal{color:#16a34a}
  .trend-down .caKpiVal{color:#dc2626}
  .trend-flat .caKpiVal{color:#7a8a6e}
  .caSparkWrap{margin:0}
  .caSparkGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:10px 0}
  @media (max-width: 700px){ .caSparkGrid{grid-template-columns:1fr} }
  .caSparkLabel{font-size:11px;font-weight:600;color:#7a8a6e;margin-bottom:4px}
  .caSpark{display:flex;align-items:flex-end;gap:2px;height:48px;border-bottom:1px solid #d5dac9}
  .caBar{flex:1;border-radius:3px 3px 0 0;min-width:4px;max-width:18px;transition:height .2s;cursor:default}
  .bar-under{background:#22c55e}
  .bar-ok{background:#f59e0b}
  .bar-mid{background:#f97316}
  .bar-high{background:#ef4444}
  .caSparkAxis{display:flex;justify-content:space-between;font-size:9px;color:#9aab8e;font-weight:600;margin-top:2px}
  .caTeeSection{margin-top:10px}
  .caTeeTitle{font-size:11px;font-weight:700;color:#7a8a6e;margin-bottom:4px}
  .caTeeTable{width:100%;border-collapse:collapse;font-size:12px}
  .caTeeTable th{font-size:11px;color:#4a5940;font-weight:700;padding:5px 8px;background:#eef2e8;border-bottom:2px solid #bcc5ad;text-align:left}
  .caTeeTable th.right,.caTeeTable td.right{text-align:right}
  .caTeeTable td{padding:5px 8px;border-bottom:1px solid #e8ebdf}
  .caConclusion{margin-top:10px;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px}
  .caConcTitle{font-size:12px;font-weight:800;color:#92400e;margin-bottom:4px}
  .caConcText{font-size:12px;color:#78350f;line-height:1.5}
  
  .holeAnalysis{margin:12px 0;padding:14px;border:1px solid #d5dac9;border-radius:10px;background:#fff}
  .haTitle{font-size:14px;font-weight:900;color:#1c2617;margin-bottom:12px}
  .haSubTitle{font-size:12px;font-weight:800;color:#2d3f24;margin-bottom:8px;margin-top:14px}
  .haDiag{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-bottom:4px}
  .haDiagCard{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #d5dac9;border-radius:10px;padding:10px 12px}
  .haDiagIcon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
  .haDiagBody{min-width:0}
  .haDiagVal{font-size:20px;font-weight:900;line-height:1.1}
  .haDiagLbl{font-size:10px;color:#7a8a6e;font-weight:600;margin-top:1px;line-height:1.2}
  .haParGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
  .haParCard{border:1px solid #d5dac9;border-radius:10px;padding:10px 12px;background:#fff}
  .haParAlert{font-size:10px;font-weight:800;color:#dc2626;margin-bottom:4px}
  .haParHead{font-size:13px;font-weight:800;color:#1c2617;margin-bottom:4px}
  .haParAvg{font-size:18px;font-weight:900;line-height:1.2}
  .haParStat{font-size:11px;color:#7a8a6e;margin-top:2px}
  .haParStat span{font-weight:400}
  .haParDist{margin-top:6px}
  .haParDistBar{display:flex;height:10px;border-radius:6px;overflow:hidden;border:1px solid #d5dac9}
  .haParDistNums{font-size:9px;color:#9aab8e;margin-top:2px}
  .haDistSection{margin-top:4px}
  .haDistBar{display:flex;height:20px;border-radius:10px;overflow:hidden;margin-bottom:6px;border:1px solid #d5dac9}
  .haDistSeg{min-width:2px;transition:width .3s}
  .seg-eagle{background:#f59e0b}
  .seg-birdie{background:#dc2626}
  .seg-par{background:#22c55e}
  .seg-bogey{background:#93c5fd}
  .seg-double{background:#3b82f6}
  .seg-triple{background:#1e3a8a}
  .haDistLegend{display:flex;flex-wrap:wrap;gap:8px;font-size:10px;color:#4a5940}
  .haLeg{display:flex;align-items:center;gap:3px}
  .haLegDot{display:inline-block;width:10px;height:10px;border-radius:2px}
  .haTableSection{margin-top:4px}
  .haTable td{border-bottom:1px solid #d5dac9}
  .haTable tr:last-child td{border-bottom:none}
  .haTopWrap{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
  @media (max-width: 700px){ .haTopWrap{grid-template-columns:1fr} }
  .haTopCol{background:#fff;border-radius:10px;padding:10px 12px;border:1px solid #d5dac9}
  .haTopStrength{border-left:3px solid #16a34a}
  .haTopWeakness{border-left:3px solid #dc2626}
  .haTopTitle{font-size:12px;font-weight:800;margin-bottom:6px}
  .haTopItem{display:flex;align-items:center;gap:8px;font-size:11px;padding:5px 0;border-bottom:1px solid #eef2e8}
  .haTopItem:last-child{border-bottom:none}
  .haTopHole{width:28px;height:28px;border-radius:50%;background:#dcfce7;color:#16a34a;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .haTopHoleRed{background:#fee2e2;color:#dc2626}
  .haTopDetail{min-width:0}
  .haTopMeta{font-size:10px;color:#7a8a6e;margin-top:1px}
  .haTopEmpty{font-size:11px;color:#9aab8e;font-style:italic;padding:6px 0}
  .haTopSummary{margin-top:8px;padding:8px;background:#fef2f2;border-radius:8px;font-size:11px;color:#991b1b}
  


  .an-wrap{max-width:1180px;margin:0 auto}
  .an-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:8px 0 14px}
  .an-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
  @media (max-width: 980px){ .an-grid{grid-template-columns:repeat(2,1fr)} .an-grid2{grid-template-columns:1fr} }
  .an-card{border:1px solid #d5dac9;border-radius:14px;background:#fff;padding:12px}
  .an-k-title{font-weight:800;margin-bottom:6px}
  .an-k-val{font-size:22px;line-height:1.1}
  .an-k-sub{margin-top:4px}
  .an-table{width:100%;border-collapse:collapse;margin-top:8px;table-layout:fixed}
  .an-table th,.an-table td{border-top:1px solid #e8ebdf;padding:6px 8px;font-size:12px;vertical-align:middle}
  .an-table th{background:#eef2e8;color:#4a5940;font-weight:700;font-size:11px;border-bottom:2px solid #bcc5ad;border-top:none}
  .an-grid3{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
  @media (max-width: 980px){ .an-grid3{grid-template-columns:1fr} }
  .an-rec-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .an-rec-item{background:#f0f2ec;border-radius:8px;padding:8px}
  .an-rec-val{font-size:20px;font-weight:900}
  .an-rec-label{font-size:10px;color:#7a8a6e;margin-bottom:2px}
  .an-rec-detail{font-size:10px;color:#9aab8e;margin-top:2px}
  .an-hist-row{display:flex;align-items:center;gap:6px;margin:3px 0}
  .an-hist-label{font-size:10px;color:#7a8a6e;width:130px;text-align:right;flex-shrink:0}
  .an-hist-bar-wrap{flex:1;height:20px;background:#eef2e8;border-radius:3px;overflow:hidden}
  .an-hist-bar{height:100%;border-radius:3px;display:flex;align-items:center;padding-left:5px;font-size:10px;font-weight:700;color:#fff;min-width:18px}
  .an-sortable{cursor:pointer;user-select:none;position:relative}
  .an-sortable:hover{background:#f0f4f8}
  .an-sortable::after{content:'';margin-left:3px;opacity:0.3;font-size:10px}
  .an-sortable.sort-asc::after{content:'▲';opacity:1}
  .an-sortable.sort-desc::after{content:'▼';opacity:1}

  .ecHoleCell{min-width:44px;flex:0 0 44px;text-align:center}

/* ===== v31: Ecletico (linha única, sem scroll) ===== */
/* ecWrap/ecLeft/ecRight removidos - agora usa ecGrid com flex-direction:column */
.ecDetailCard{width:100%;max-width:none}
.ecDetailHolesWrap{width:100%;overflow:hidden}
.ecDetailHoles{
  width:100%;
  overflow:visible;
  display:grid;
  grid-template-columns: repeat(var(--ecCols, 18), minmax(34px, 1fr));
  gap:10px;
  align-items:center;
}
.ecDetailHoles .ecHole{min-width:0}
@media (max-width: 1000px){
  .ecWrap{flex-direction:column}
  .ecLeft,.ecRight{flex:1 1 auto;min-width:0}
  .ecDetailHolesWrap{overflow-x:auto}
  .ecDetailHoles{
    width:max-content;           /* permite scroll só em mobile */
    grid-template-columns: repeat(var(--ecCols, 18), 44px);
    overflow:visible;
  }
}
/* ============================================================= */

/* ===== v33: Ecletico layout/spacing fixes ===== */
.ecWrap{justify-content:flex-start !important}
.ecLeft{flex:1 1 auto !important}
.ecRight{flex:2 1 720px !important; min-width:0 !important}
.ecPills, .ecleticPills, .ecleticPillsRow{
  display:flex !important;
  flex-wrap:wrap !important;
  gap:10px !important;
  justify-content:flex-start !important;
  align-items:center !important;
  width:100% !important;
}
.ecPills .pill, .ecleticPills .pill, .ecleticPillsRow .pill,
.ecPills button, .ecleticPills button, .ecleticPillsRow button{
  width:auto !important;
  margin:0 !important;
}
.ecDetailCard{max-width:none !important}
.ecDetailHolesWrap{width:100% !important; overflow:hidden !important}
.ecDetailHoles{overflow:visible !important}
/* ============================================ */

/* ===== v34: FIXES ===== */
/* Ecletico pills: nunca "space-between" e nunca esticam */
.ecBlock .ecWrap{justify-content:flex-start !important}
.ecWrap{justify-content:flex-start !important}
.ecPill{flex:0 0 auto !important; width:auto !important; margin:0 !important}
/* Se algum layout anterior estiver a forçar width:100% */
.ecBlock{width:100%}
/* ====================== */

/* ===== v35: Ecletico sem quebras (especialmente na vista Por data) ===== */
/* Mantém a grelha H1..H18 sempre numa linha; se não couber, faz scroll horizontal */
.ecDetailHolesWrap{
  width:100% !important;
  overflow-x:auto !important;
  overflow-y:hidden !important;
  -webkit-overflow-scrolling:touch;
}
.ecDetailHoles{
  display:inline-grid !important;   /* inline-grid evita quebra para 2 linhas */
  white-space:nowrap !important;
  grid-auto-flow:column !important;
  gap:10px !important;
}
.ecDetailCard{
  overflow:hidden !important;
}
/* Pills do eclético: numa linha (com scroll se necessário) */
.ecPills, .ecleticPills, .ecleticPillsRow{
  flex-wrap:nowrap !important;
  overflow-x:auto !important;
  overflow-y:hidden !important;
  -webkit-overflow-scrolling:touch;
  padding-bottom:2px;
}
.ecPills::-webkit-scrollbar,
.ecleticPills::-webkit-scrollbar,
.ecleticPillsRow::-webkit-scrollbar,
.ecDetailHolesWrap::-webkit-scrollbar{height:8px}
.ecPills::-webkit-scrollbar-thumb,
.ecleticPills::-webkit-scrollbar-thumb,
.ecleticPillsRow::-webkit-scrollbar-thumb,
.ecDetailHolesWrap::-webkit-scrollbar-thumb{background:#bcc5ad;border-radius:8px}
/* ===================================================================== */

/* ===== v36: Ecletico 18 buracos sem quebras (covers front/back blocks) ===== */
/* Alguns layouts geram 2 blocos (front/back). Forçamos tudo a comportar-se como linha única. */
.ecDetailCard *{
  box-sizing:border-box;
}
/* wrappers possíveis */
.ecDetailHolesWrap,
.ecDetailHolesWrapFront,
.ecDetailHolesWrapBack,
.ecDetailHolesWrap18,
.ecDetailHolesWrap9,
.ecDetailHolesOuter{
  width:100% !important;
  overflow-x:auto !important;
  overflow-y:hidden !important;
  -webkit-overflow-scrolling:touch;
}

/* Qualquer grelha/linha de buracos: força fluxo horizontal */
.ecDetailHoles,
.ecDetailHolesFront,
.ecDetailHolesBack,
.ecDetailHoles18,
.ecDetailRow,
.ecDetailRowFront,
.ecDetailRowBack{
  display:flex !important;
  flex-wrap:nowrap !important;
  gap:10px !important;
  white-space:nowrap !important;
  overflow:visible !important;
}

/* Se houver <br> ou separadores a partir, anulamos no eclético */
.ecDetailCard br{display:none !important}

/* Cada "slot" de buraco: não encolher */
.ecDetailHoles > *,
.ecDetailHolesFront > *,
.ecDetailHolesBack > *,
.ecDetailHoles18 > *,
.ecDetailRow > *{
  flex:0 0 auto !important;
}

/* ======================================================================= */

/* ===== v39: Ecletico "buracos" em círculos mas em linha (sem coluna) ===== */
.ecWinsRow{
  display:flex !important;
  gap:10px !important;
  flex-wrap:wrap !important;
  align-items:flex-start !important;
  justify-content:flex-start !important;
  width:100% !important;
}
/* IMPORTANT: não deixar a classe global .pill forçar width:100% aqui */
.ecWinsRow .pill{
  width:auto !important;
  max-width:none !important;
  display:inline-flex !important;
  flex:0 0 auto !important;
}
/* ================================================================ */

/* ===== v40: Ecletico card mais à esquerda e sempre visível ===== */
/* A solução mais robusta: permitir wrap e fazer o painel do eclético ocupar 100% da largura (fica por baixo das pills). */
.ecWrap{
  flex-wrap:wrap !important;
  align-items:flex-start !important;
}
.ecLeft{
  flex:1 1 100% !important;
  min-width:0 !important;
}
.ecRight{
  flex:1 1 100% !important;
  min-width:0 !important;
  margin-left:0 !important;
}
.ecDetailCard{
  width:100% !important;
  max-width:none !important;
  margin-left:0 !important;
}
.ecDetailHolesWrap{
  max-width:100% !important;
}
/* ============================================================= */

/* ===== v41: Eclectic 2-table layout (summary + scorecard) ===== */
.ec-sum{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
.ec-sum th,.ec-sum td{padding:5px 8px;border-bottom:1px solid #e8ebdf;vertical-align:middle;font-size:12px}
.ec-sum th{font-size:11px;color:#4a5940;background:#eef2e8;font-weight:700;border-bottom:2px solid #bcc5ad}
.ec-sum .r{text-align:right}
.ec-sum tbody tr:hover{background:#fafbfc}

.ec-sc{width:100%;border-collapse:collapse;font-size:11px}
.ec-sc th,.ec-sc td{padding:4px 2px;text-align:center;border:1px solid #d5dac9}
.ec-sc th{background:#f0f2ec;font-weight:700;color:#7a8a6e;font-size:10px}
.ec-sc .row-label{text-align:left;padding-left:8px;font-weight:600;color:#4a5940;min-width:70px;border-right:2px solid #d5dac9;white-space:nowrap;font-size:10px}
.ec-sc .col-out,.ec-sc .col-in{background:#f4f6f8;border-left:1px solid #d5dac9;border-right:1px solid #d5dac9}
.ec-sc .col-total{background:#edf0f4;border-left:1px solid #dde1e7;font-weight:800}
.ec-sc .sep-row td{border-bottom:2px solid #bcc5ad}
.ec-tee-row{cursor:pointer;transition:opacity 0.15s}
.ec-tee-row:hover{opacity:0.85}
.ec-tee-row .row-label{display:flex;align-items:center;gap:4px}
.ec-tee-row .ec-arrow{font-size:8px;color:rgba(0,0,0,0.3);transition:transform 0.2s;flex-shrink:0}
.ec-tee-row.ec-active .ec-arrow{transform:rotate(90deg)}
.ec-detail-row{display:none}
.ec-detail-row.open{display:table-row}
.ec-detail-row>td{padding:0!important;background:#fafbfc;text-align:left!important;border-top:none!important}
.ec-detail-inner{padding:10px 12px}
.ec-detail-inner .caTitle{font-size:13px;font-weight:800;color:#2d3f24;margin-bottom:8px}
.ec-detail-inner .caKpis{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.ec-detail-inner .caKpi{background:#fff;border:1px solid #d5dac9;border-radius:10px;padding:8px 14px;text-align:center;min-width:80px;flex:1}
.ec-detail-inner .caKpiVal{font-size:18px;font-weight:800;color:#111;line-height:1.2}
.ec-detail-inner .caKpiVal.best{color:#16a34a}
.ec-detail-inner .caKpiVal.worst{color:#dc2626}
.ec-detail-inner .caKpiLbl{font-size:10px;color:#9aab8e;margin-top:2px}
.ec-detail-inner .trend-up .caKpiVal{color:#16a34a}
.ec-detail-inner .trend-down .caKpiVal{color:#dc2626}
.ec-detail-inner .trend-flat .caKpiVal{color:#9aab8e;font-size:14px}
.ec-contrib{font-size:10px;color:#7a8a6e;padding:6px 10px;border-top:1px solid #d5dac9}
.ec-contrib a{color:#2d6a30;text-decoration:none}
.ec-contrib a:hover{text-decoration:underline}
@media(max-width:700px){
  .ec-sum{font-size:11px}
  .ec-sum th,.ec-sum td{padding:4px 5px;font-size:11px}
  .ec-detail-inner .caKpis{gap:5px}
  .ec-detail-inner .caKpi{padding:6px 8px;min-width:60px}
  .ec-detail-inner .caKpiVal{font-size:15px}
}
/* ============================================================= */

/* ===== Player dropdown ===== */
.player-dropdown{position:relative;display:inline-block}
.player-btn{
  background:none;border:none;cursor:pointer;padding:0;margin:0;
  font:inherit;font-size:inherit;font-weight:inherit;color:inherit;
  display:inline-flex;align-items:center;gap:6px;
}
.player-btn:hover{opacity:.8}
.player-btn .dd-arrow{
  display:inline-block;font-size:10px;transition:transform .2s;
  opacity:.6;
}
.player-dropdown.open .dd-arrow{transform:rotate(180deg)}
.player-menu{
  display:none;position:absolute;top:calc(100% + 6px);left:0;z-index:999;
  min-width:340px;max-height:400px;overflow-y:auto;
  background:#fff;border:1px solid #d5dac9;border-radius:12px;
  box-shadow:0 8px 24px rgba(0,0,0,.15);padding:6px 0;
}
.player-dropdown.open .player-menu{display:block}
.player-menu a{
  display:flex;align-items:center;gap:8px;padding:10px 14px;
  text-decoration:none;color:#111827;font-size:14px;font-weight:500;
  transition:background .15s;
}
.player-menu a:hover{background:#eef2e8}
.player-menu a.active{background:#f0fdf4;font-weight:700}
.player-menu a .pm-fed{font-size:11px;color:#9aab8e;margin-left:auto;flex:none}
.player-menu a .pm-dot{width:8px;height:8px;border-radius:999px;background:#16a34a;flex:none}
.player-menu a .pm-esc{
  font-size:10px;font-weight:600;color:#2d6a30;background:#e0f2fe;
  padding:2px 6px;border-radius:6px;flex:none;
}
.pm-search-row{
  display:flex;align-items:center;gap:6px;padding:6px 12px;
  border-bottom:1px solid #eef2e8;
}
.pm-search{
  flex:1;font-size:12px;padding:5px 10px 5px 28px;border-radius:999px;
  border:1px solid #d5dac9;background:#f0f2ec;color:#1e293b;
  outline:none;transition:border-color .15s;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Ccircle cx='6' cy='6' r='5'/%3E%3Cline x1='10' y1='10' x2='13' y2='13'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:9px center;
}
.pm-search:focus{border-color:#2d6a30;background:#fff;box-shadow:0 0 0 2px rgba(3,105,161,.1)}
.pm-search::placeholder{color:#9aab8e}
.pm-search-count{font-size:10px;color:#9aab8e;font-weight:600;white-space:nowrap}
.pm-filter-row{
  display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:6px 12px 4px;
  border-bottom:1px solid #d5dac9;margin-bottom:2px;
}
.pm-fsel{
  font-size:11px;font-weight:600;padding:4px 22px 4px 8px;border-radius:999px;
  border:1px solid #bcc5ad;background:#fff;color:#4a5940;cursor:pointer;
  appearance:none;-webkit-appearance:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%2394a3b8'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 7px center;
  transition:all .15s;max-width:190px;
}
.pm-fsel:focus{border-color:#2d6a30;outline:none;box-shadow:0 0 0 2px rgba(3,105,161,.12)}
.pm-fsel.has-value{
  background-color:#2d6a30;color:#fff;border-color:#2d6a30;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='white'/%3E%3C/svg%3E");
}
.pm-reset{
  font-size:10px;font-weight:600;padding:4px 10px;border-radius:999px;
  border:1px solid #fca5a5;background:#fff;color:#dc2626;cursor:pointer;
  transition:all .15s;white-space:nowrap;display:none;
}
.pm-reset:hover{background:#fef2f2}
.pm-reset.visible{display:inline-flex}
.pm-list{max-height:300px;overflow-y:auto}
.pm-club{font-size:9px;color:#16a34a;margin-left:4px;font-weight:600}
.pm-hcp{font-size:9px;color:#6366f1;margin-left:4px;font-weight:700}
/* === Cross-Analysis === */
.cross-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.cross-tab{
  font-size:12px;font-weight:600;padding:6px 14px;border-radius:999px;
  border:1px solid #bcc5ad;background:#fff;color:#4a5940;cursor:pointer;
  transition:all .15s;
}
.cross-tab:hover{background:#eef2e8}
.cross-tab.active{background:#2d6a30;color:#fff;border-color:#2d6a30}
.cross-tab-count{font-size:10px;opacity:.7;margin-left:3px}
.cross-section-title{font-size:14px;font-weight:700;color:#1e293b;margin:12px 0 8px;padding-bottom:4px;border-bottom:2px solid #d5dac9}
.cross-table{width:100%;font-size:12px;table-layout:auto}
.cross-table th{background:#eef2e8;color:#4a5940;font-size:11px;font-weight:700;border-bottom:2px solid #bcc5ad}
.cross-table td,.cross-table th{white-space:nowrap}
.cross-table .center{text-align:center}
.cross-current{background:#f0fdf4 !important}
.cross-current td{font-weight:600}
.cross-chart-wrap{background:#f0f2ec;border-radius:10px;padding:16px;margin:8px 0}
.cross-period-select{font-size:12px;padding:3px 8px;border:1px solid #bcc5ad;border-radius:6px;background:#fff;color:#2d3f24;cursor:pointer;font-weight:400}
.cross-legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;font-size:12px}
.cross-legend-item{display:flex;align-items:center;gap:4px}
.cross-legend-dot{width:12px;height:3px;border-radius:2px}
.cross-course-card{background:#f0f2ec;border-radius:10px;padding:14px;margin:8px 0}
.cross-course-name{font-size:13px;font-weight:700;margin-bottom:10px}
.cross-bar-row{display:flex;align-items:center;gap:8px;margin:4px 0}
.cross-bar-name{font-size:12px;min-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cross-bar-name-current{font-weight:700;color:#16a34a}
.cross-bar-track{flex:1;height:18px;background:#d5dac9;border-radius:4px;overflow:hidden}
.cross-bar{height:100%;background:#9aab8e;border-radius:4px;transition:width .3s}
.cross-bar-current{background:#16a34a}
.cross-bar-val{font-size:12px;min-width:80px;text-align:right;font-weight:600}
/* Course deep analysis */
.cross-course-table{width:100%;font-size:12px;margin-top:6px}
.cross-course-table th{background:#eef2e8;color:#4a5940;font-size:11px;padding:5px 8px;border-bottom:2px solid #bcc5ad}
.cross-course-table td{padding:5px 8px}
.cross-spark-track{position:relative;height:14px;background:#eef2e8;border-radius:3px;min-width:90px}
.cross-spark-bar{position:absolute;top:2px;height:10px;border-radius:2px;opacity:.5}
.cross-spark-avg{position:absolute;top:0;width:2px;height:14px;border-left:2px solid;margin-left:-1px}
/* Expandable course cards */
.cross-course-toggle{cursor:pointer;transition:background .15s}
.cross-course-toggle:hover{background:#eef2ff}
.cross-course-header{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.cross-course-arrow{font-size:10px;color:#9aab8e;transition:transform .2s;display:inline-block}
.cross-course-arrow.open{transform:rotate(90deg)}
.cross-tee-badge{font-size:10px;font-weight:700;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:6px}
.cross-mini-ranking{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;font-size:12px}
.cross-mini-player{display:flex;align-items:center;gap:4px;color:#4a5940}
.cross-mini-current{color:#16a34a;font-weight:600}
.cross-course-detail{background:#f0f2ec;border:1px solid #d5dac9;border-radius:0 0 10px 10px;padding:14px;margin:-8px 0 8px;animation:slideDown .2s ease-out}
@keyframes slideDown{from{opacity:0;max-height:0}to{opacity:1;max-height:2000px}}
/* Round history */
.cross-rounds-title{font-size:13px;font-weight:700;color:#1e293b;margin:16px 0 8px;padding-top:10px;border-top:1px solid #d5dac9}
.cross-round-block{margin:8px 0;padding:10px;background:#fff;border-radius:8px;border:1px solid #d5dac9}
.cross-round-current{border-color:#86efac;background:#f0fdf4}
.cross-round-name{font-size:13px;font-weight:700;margin-bottom:6px}
.cross-round-list{display:flex;flex-direction:column;gap:4px}
.cross-round-item{display:flex;align-items:center;gap:10px;font-size:12px;padding:4px 8px;border-radius:4px}
.cross-round-item:hover{background:rgba(0,0,0,.03)}
.cross-round-best{background:#f0fdf4;font-weight:600}
.cross-round-date{min-width:80px;color:#7a8a6e}
.cross-round-gross{font-weight:700;min-width:36px;font-size:14px}
.cross-round-sd{color:#6366f1;min-width:55px}
.cross-round-hi{color:#2d6a30;min-width:60px}
.cross-round-event{color:#9aab8e;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px}
.cross-round-medal{color:#f59e0b;font-weight:700}
/* Row toggle styling - no checkboxes */
.cross-table tbody tr{cursor:pointer;transition:opacity .15s}
.cross-table tbody tr.cross-off{opacity:0.3}
.cross-table tbody tr.cross-off td{text-decoration:line-through;text-decoration-color:#bcc5ad}
.cross-table tbody tr.cross-off td:first-child{text-decoration:none}
.cross-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#3b82f6;margin-right:3px;vertical-align:middle;flex-shrink:0}
.cross-off .cross-dot{background:#bcc5ad}
/* Cross filter bar */
.cross-filter-bar{display:flex;align-items:center;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.cross-fade-toggle{
  display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#7a8a6e;
  cursor:pointer;user-select:none;padding:3px 8px;
  border-radius:999px;border:1px solid #d5dac9;background:#fff;transition:all .15s;
}
.cross-fade-toggle:hover{background:#f0f2ec}
.cross-fade-toggle.active{background:#f0fdf4;border-color:#86efac;color:#16a34a}
/* Filtered row states */
.cross-table tbody tr.cross-filtered-fade{opacity:0.2;cursor:pointer}
.cross-table tbody tr.cross-filtered-fade .cross-dot{background:#d5dac9}
.cross-table tbody tr.cross-filtered-hide{display:none}
.cross-name-cell{display:inline-flex;align-items:center;gap:1px;cursor:pointer}
.cross-hdr-group th{border-bottom:none !important}
.cross-hdr-voltas{text-align:center !important;background:#eef2e8 !important;font-size:11px;letter-spacing:.5px;border-bottom:1px solid #bcc5ad !important}
.cross-hdr-sub th{font-size:11px;background:#f0f2ec !important;padding-top:2px !important;padding-bottom:2px !important}
/* Sortable headers */
.cross-sort{cursor:pointer;user-select:none;position:relative;white-space:nowrap}
.cross-sort:hover{background:#e0f2fe !important}
.cross-sort::after{content:'⇅';font-size:9px;opacity:.3;margin-left:2px}
.cross-sort.asc::after{content:'▲';opacity:.7;color:#2d6a30}
.cross-sort.desc::after{content:'▼';opacity:.7;color:#2d6a30}
/* ============================== */
  /* Print styles */
  @media print {
    @page{
      size:landscape;
      margin:8mm 10mm 14mm 10mm;
      @bottom-left{content:"${esc(displayName)} (${esc(FED)})";font-size:8px;color:#7a8a6e;font-family:system-ui,sans-serif}
      @bottom-right{content:"Página " counter(page) " de " counter(pages);font-size:8px;color:#7a8a6e;font-family:system-ui,sans-serif}
    }
    * {print-color-adjust:exact !important;-webkit-print-color-adjust:exact !important}
    body{background:#fff !important;padding:0 !important;margin:0 !important;font-size:11px !important}
    /* Hide all interactive elements */
    .controls, .actions, .btnPrint, .btnPdf, .banner, .btn,
    input#q, select#view, .dd-arrow,
    .player-menu, .pm-list, .pm-filter-row, .pm-search-row
    {display:none !important}
    /* Header */
    header{position:static !important;background:#fff !important;border:none !important;box-shadow:none !important;padding:2px 0 !important;margin:0 !important}
    .hd-card{background:none !important;border:none !important;box-shadow:none !important;padding:4px 0 !important}
    .hd-hcp-block{padding:4px 8px !important;min-width:auto !important}
    .hd-hcp-val{font-size:14px !important}
    .hd-meta{font-size:9px !important;margin-top:4px !important;padding-top:3px !important}
    h1{font-size:14px !important;margin:0 !important;line-height:1.2 !important}
    .player-btn{border:none !important;background:none !important;padding:0 !important;font-size:14px !important;font-weight:800 !important;cursor:default !important}
    .player-dropdown{display:inline !important}
    /* Cards */
    .card{break-inside:avoid;box-shadow:none !important;border:1px solid #ccc !important;margin:6px 0 !important;padding:6px !important}
    .card .innerWrap{display:block !important}
    .details{display:table-row !important}
    .details.open .innerWrap{display:block !important}
    .innerTable{max-height:none !important;overflow:visible !important}
    /* Sparklines - ensure bars are visible */
    .caSpark{height:40px !important}
    .caSparkGrid{gap:6px !important}
    .caBar{min-width:4px !important}
    .bar-under{background:#22c55e !important}
    .bar-ok{background:#eab308 !important}
    .bar-mid{background:#f97316 !important}
    .bar-high{background:#ef4444 !important}
    /* Tables */
    .sc-table{font-size:9px !important}
    table{border-collapse:collapse !important}
    /* Analysis */
    .courseAnalysis,.holeAnalysis,.ecGrid{break-inside:avoid}
    .haDiag{gap:6px !important}
    .haTopWrap{gap:6px !important}
    .haParGrid{gap:6px !important}
    /* Links */
    a{text-decoration:none !important;color:inherit !important}
    /* Canvas charts */
    canvas{max-width:100% !important}
    /* Eclectic pills */
    .ecPill{padding:4px 6px !important;font-size:10px !important}
  }
  /* Per-course print: hide all cards except target */
  body.print-course .card{display:none !important}
  body.print-course .card.print-target{display:block !important}
  body.print-course .card.print-target .innerWrap{display:block !important}
  body.print-course .player-menu{display:none !important}
</style>
</head>
<body>
<header>
  <div class="hd-card">
    <div class="hd-top">
      <div class="hd-hcp-block" id="hcpBlock">
        <div class="hd-hcp-label">HCP</div>
        <div class="hd-hcp-val" id="hcpVal"></div>
      </div>
      <div class="hd-info">
        <div class="hd-name-row">
          <h1>${headerNameHtml}</h1>
        </div>
        ${headerPillsHtml}
      </div>
      <button type="button" class="btn btnPrint" onclick="printAll()" title="Imprimir tudo">🖨️ Imprimir</button>
    </div>
    <div class="hd-meta">
      Actualizado: <b>${lastRoundDate}</b> · Gerado: ${generatedDate}
    </div>
  </div>
  <div class="controls">
    <input id="q" placeholder="Pesquisar campo..." />
    <select id="view">
      <option value="by_course">Vista: Por campo</option>
      <option value="by_course_analysis">Vista: Análise por campo</option>
      <option value="by_date">Vista: Por data</option>
      <option value="by_tournament">Vista: Por torneio</option>
      <option value="analysis">Análises</option>
    </select>
    <select id="sort">
      <option value="last_desc">Ordenar: Mais recente</option>
      <option value="count_desc">Ordenar: Mais jogados</option>
      <option value="name_asc">Ordenar: Nome A–Z</option>
    </select>
  </div>
</header>

<main>
  <div class="card">
    <div class="toolbar">
      <div class="stats">
        <div class="pill"><b id="cCourses">0</b> campos</div>
        <div class="pill"><b id="cRounds">0</b> voltas</div>
      </div>
      <div class="meta">Pasta: output\\\\${esc(FED)}\\\\analysis</div>
    </div>

    <table>
      <colgroup id="mainColgroup">
        <col style="width:26%"><col style="width:6%"><col style="width:9%"><col style="width:6%"><col style="width:7%"><col style="width:12%"><col style="width:8%"><col style="width:9%"><col style="width:7%"><col style="width:7%">
      </colgroup>
      <thead id="thead">
        <tr>
          <th>Campo</th>
          <th class="r">Voltas</th>
          <th>Última</th>
          <th class="r">Bur.</th>
          <th class="r">HCP</th>
          <th>Tee</th>
          <th class="r">Dist.</th>
          <th class="r">Gross</th>
          <th class="r">Stb</th>
          <th class="r">SD</th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>
</main>

<script>
// Global print function - opens clean window
function printAll() {
  var cssText = "";
  var sheets = document.querySelectorAll("style");
  for (var i = 0; i < sheets.length; i++) cssText += sheets[i].innerHTML;

  // Get player name
  var playerBtn = document.querySelector(".player-btn");
  var h1 = document.querySelector("h1");
  var playerName = playerBtn ? playerBtn.textContent.replace(/▼/g,"").trim() : (h1 ? h1.textContent.replace("🖨️","").replace("Imprimir","").trim() : "Jogador");
  var safeName = playerName.replace(/"/g, '\\"');

  // Get meta info
  var metaEl = document.querySelector(".meta");
  var metaText = metaEl ? metaEl.textContent.trim() : "";

  // Clone the main content area
  var main = document.querySelector("main");
  if (!main) { alert("Sem conteúdo para imprimir."); return; }
  var clone = main.cloneNode(true);

  // Expand all innerWraps, remove interactive elements
  clone.querySelectorAll(".innerWrap").forEach(function(el){ el.style.display = "block"; });
  clone.querySelectorAll(".actions,.banner,.btn,.controls,input,select").forEach(function(el){ el.remove(); });

  var extraCss =
    "@page{size:landscape;margin:8mm 10mm 14mm 10mm;" +
      "@bottom-left{content:\\"" + safeName + "\\";font-size:8px;color:#64748b;font-family:system-ui,sans-serif}" +
      "@bottom-right{content:\\"Página \\" counter(page) \\" de \\" counter(pages);font-size:8px;color:#64748b;font-family:system-ui,sans-serif}" +
    "}" +
    "*{print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important}" +
    "body{background:#fff!important;padding:0!important;margin:0!important;font-family:system-ui,-apple-system,sans-serif;font-size:11px;color:#111827}" +
    "header{display:none!important}" +
    ".print-header{margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid #1e40af}" +
    ".print-name{font-size:14px;font-weight:900;color:#1e40af}" +
    ".print-meta{font-size:9px;color:#64748b;margin-left:12px}" +
    ".player-menu,.pm-list,.pm-filter-row,.pm-search-row,.dd-arrow,.player-dropdown,.player-btn{display:none!important}" +
    ".card{box-shadow:none!important;border:1px solid #ddd!important;margin:6px 0!important;padding:6px!important;break-inside:avoid}" +
    ".details{display:table-row!important}" +
    ".innerWrap{display:block!important}" +
    ".innerTable{max-height:none!important;overflow:visible!important}" +
    "table{border-collapse:collapse!important;width:100%}" +
    ".courseAnalysis,.holeAnalysis,.ecGrid{break-inside:avoid}" +
    ".sc-table{font-size:9px!important}" +
    ".caSpark{height:40px!important}" +
    ".caBar{min-width:4px!important}" +
    ".bar-under{background:#22c55e!important}" +
    ".bar-ok{background:#eab308!important}" +
    ".bar-mid{background:#f97316!important}" +
    ".bar-high{background:#ef4444!important}" +
    "a{text-decoration:none!important;color:inherit!important}" +
    "canvas{max-width:100%!important}" +
    ".hd-hcp-block,.btnPrint,.btnPdf{display:none!important}";

  var pw = window.open("", "_blank", "width=1200,height=900");
  if (!pw) { alert("Permite popups para imprimir."); return; }
  pw.document.write("<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + playerName + " — Relatório</title>");
  pw.document.write("<style>" + cssText + "</style>");
  pw.document.write("<style>" + extraCss + "</style>");
  pw.document.write("</head><body>");
  pw.document.write("<div class='print-header'><span class='print-name'>" + playerName + "</span><span class='print-meta'>" + metaText + "</span></div>");
  pw.document.write(clone.innerHTML);
  pw.document.write("</body></html>");
  pw.document.close();
  setTimeout(function(){ pw.print(); }, 600);
}

(function(){
  var DATA = ${JSON.stringify(courses)};
  var FRAG = ${JSON.stringify(fragments)};
  var HOLES = ${JSON.stringify(holeScores)};
  var EC = ${JSON.stringify(eclecticByCourse)};
  var ECDET = ${JSON.stringify(eclecticDetails)};
  var HOLE_STATS = ${JSON.stringify(courseHoleStats)};
  var TEE = ${JSON.stringify(DEFAULT_TEE_COLORS)};
  var CROSS_DATA = ${JSON.stringify(crossStats || {})};
  var CURRENT_FED = "${FED}";
  var HCP_INFO = ${JSON.stringify(hcpInfo)};

  // Função esc necessária para renderização
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toNum(x) {
    var n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  function isMeaningful(n) {
    var v = Number(n);
    return Number.isFinite(v) && v !== 0;
  }

  var tbody = document.getElementById("tbody");
  var q = document.getElementById("q");
  var sortSel = document.getElementById("sort");
  var viewSel = document.getElementById("view");
  var cCourses = document.getElementById("cCourses");
  var cRounds = document.getElementById("cRounds");

  // per-course state
  var teeFilter = {};     // rowId -> teeKey
  var groupMode = {};     // rowId -> boolean (agrupar torneio)
  var ignorePrompt = {};  // rowId -> boolean
  var openState = {};     // rowId -> boolean (campo aberto)
  var holeFilter = {};    // rowId -> 0|9|18

  function norm2(s){
    return (s||"").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/\\s+/g," ").trim();
  }
  function normKey2(s){
    return (s||"").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/['']/g,"").replace(/\\s+/g,"").trim();
  }
  function teeHex(teeName){
    var k = normKey2(teeName);
    return TEE[k] || "#06b6d4";
  }
  function teeFg(hex){
    hex = (hex||"").replace("#","");
    if (hex.length !== 6) return "#fff";
    var r=parseInt(hex.slice(0,2),16), g=parseInt(hex.slice(2,4),16), b=parseInt(hex.slice(4,6),16);
    var lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
    return lum > 0.72 ? "#111" : "#fff";
  }

  // Calcular similaridade entre dois nomes (0-1, onde 1 = idêntico)
  // Aceita opcionalmente course1/course2 para usar campo como evidência adicional
  function nameSimilarity(name1, name2, course1, course2) {
    if (!name1 || !name2) return 0;
    var n1 = norm2(name1);
    var n2 = norm2(name2);
    if (n1 === n2) return 1;
    
    // Normalizar erros ortográficos comuns
    var normalize = function(s) {
      return s
        .replace(/internancional/g, 'internacional')
        .replace(/internaccional/g, 'internacional')
        .replace(/interacional/g, 'internacional');
    };
    n1 = normalize(n1);
    n2 = normalize(n2);
    if (n1 === n2) return 1;
    
    // Detetar palavras-chave de torneios away/internacional
    var awayKeywords = ['away', 'internacional', 'international', 'tour', 'viagem', 'estrangeiro', 'abroad'];
    var hasAwayKeyword1 = awayKeywords.some(function(k){ return n1.indexOf(k) >= 0; });
    var hasAwayKeyword2 = awayKeywords.some(function(k){ return n2.indexOf(k) >= 0; });
    
    // Se ambos têm keyword away
    if (hasAwayKeyword1 && hasAwayKeyword2) {
      // Extrair palavras principais (sem stop words)
      var stopWords = ['away', 'internacional', 'international', 'tour', 'viagem', 'estrangeiro', 'de', 'do', 'da', 'em', 'no', 'na', 'abroad'];
      var words1 = n1.split(/\\s+/).filter(function(w){ return w.length > 2 && stopWords.indexOf(w) < 0; });
      var words2 = n2.split(/\\s+/).filter(function(w){ return w.length > 2 && stopWords.indexOf(w) < 0; });
      
      // Se partilham qualquer palavra principal = mesmo torneio away
      if (words1.length > 0 && words2.length > 0) {
        var hasCommon = words1.some(function(w1){ 
          return words2.some(function(w2){ return w1 === w2 || w1.indexOf(w2) >= 0 || w2.indexOf(w1) >= 0; });
        });
        if (hasCommon) return 0.95;
      }
      
      // Se AMBOS são puramente genéricos (sem palavras distintivas após filtrar stop words),
      // a federação está a usar labels genéricos intercambiáveis ("Away"/"Internacional"/etc.)
      // para o mesmo torneio → tratar como match
      if (words1.length === 0 && words2.length === 0) {
        // Se estão no mesmo campo, certeza quase absoluta
        if (course1 && course2 && norm2(course1) === norm2(course2)) return 0.95;
        // Mesmo sem campo igual, keywords genéricas em dias seguidos = mesmo torneio
        return 0.8;
      }
    }
    
    // Remover padrões de dia/volta para comparar base
    var patterns = [/\\bd[1-9]\\b/g, /\\bdia\\s*[1-9]\\b/gi, /\\b[1-9]a?\\s*(volta|ronda|dia)\\b/gi, /\\b(primeira|segunda|terceira|quarta)\\s*(volta|ronda)\\b/gi];
    var base1 = n1, base2 = n2;
    patterns.forEach(function(p){
      base1 = base1.replace(p, '');
      base2 = base2.replace(p, '');
    });
    
    // Se base idêntica após remover padrões = mesmo torneio
    base1 = base1.replace(/\\s+/g, ' ').trim();
    base2 = base2.replace(/\\s+/g, ' ').trim();
    if (base1 === base2 && base1.length > 5) {
      return 1;
    }
    
    // Dividir em palavras
    var words1 = n1.split(/\\s+/).filter(function(w){ return w.length > 2; });
    var words2 = n2.split(/\\s+/).filter(function(w){ return w.length > 2; });
    if (words1.length === 0 || words2.length === 0) return 0;
    
    // Contar palavras em comum
    var common = 0;
    words1.forEach(function(w1){
      if (words2.some(function(w2){ return w2.indexOf(w1) >= 0 || w1.indexOf(w2) >= 0; })) {
        common++;
      }
    });
    
    // Percentagem de palavras em comum
    var total = Math.max(words1.length, words2.length);
    return common / total;
  }

  function dayKey(ms){
    var d = new Date(ms);
    // UTC day
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function detectMultiRoundCandidate(rounds){
    // rounds já em ordem desc por data. Vamos olhar em ordem asc para detectar dias seguidos
    var list = rounds.slice().filter(function(r){ return r.dateSort; }).sort(function(a,b){ return a.dateSort - b.dateSort; });
    if (list.length < 2) return null;

    // grupos por proximidade (<=1 dia) e por "eventKey" se existir
    // Respeitar _group: rounds com _group diferente nunca se juntam
    var groups = [];
    var cur = [list[0]];
    for (var i=1;i<list.length;i++){
      var prev = list[i-1], now = list[i];
      var gapDays = (dayKey(now.dateSort) - dayKey(prev.dateSort)) / 86400000;
      var sameEvent = (norm2(now.eventName) && norm2(now.eventName) === norm2(prev.eventName));
      var bothEmpty = (!norm2(now.eventName) && !norm2(prev.eventName));
      var sameGroup = (!now._group && !prev._group) || (now._group && now._group === prev._group);
      if (gapDays <= 1 && (sameEvent || bothEmpty) && sameGroup) cur.push(now);
      else { if (cur.length >= 2) groups.push(cur); cur = [now]; }
    }
    if (cur.length >= 2) groups.push(cur);

    if (!groups.length) return null;

    // escolhe maior grupo
    groups.sort(function(a,b){ return b.length - a.length; });
    var g = groups[0];
    var name = norm2(g[0].eventName) ? g[0].eventName : "Torneio (nome não explícito)";
    return { name: name, count: g.length, ids: g.map(function(x){ return x.scoreId; }) };
  }

  function buildGroupedRows(rounds){
    // agrupar por eventName (se existir) senão por clusters de dias consecutivos.
    // _group override: rounds com _group são agrupados pelo valor de _group
    var list = rounds.slice().filter(function(r){ return r.dateSort; }).sort(function(a,b){ return a.dateSort - b.dateSort; });

    // Separar rounds com _group dos restantes
    var forcedMap = {};
    var remaining = [];
    list.forEach(function(r){
      if (r._group) {
        if (!forcedMap[r._group]) forcedMap[r._group] = [];
        forcedMap[r._group].push(r);
      } else {
        remaining.push(r);
      }
    });

    var groups = [];
    // Adicionar grupos forçados
    Object.keys(forcedMap).forEach(function(k){
      var arr = forcedMap[k].slice().sort(function(a,b){ return a.dateSort - b.dateSort; });
      groups.push({ name: k, rounds: arr });
    });

    // Agrupar restantes normalmente
    if (remaining.length > 0) {
      var hasNames = remaining.some(function(r){ return norm2(r.eventName); });

      if (hasNames){
        var map = {};
        remaining.forEach(function(r){
          var k = norm2(r.eventName) || "__sem_nome__";
          if (!map[k]) map[k] = [];
          map[k].push(r);
        });
        Object.keys(map).forEach(function(k){
          var arr = map[k].slice().sort(function(a,b){ return a.dateSort - b.dateSort; });
          groups.push({ name: (k==="__sem_nome__") ? "Torneio (nome não explícito)" : arr[0].eventName, rounds: arr });
        });
      } else {
        // clusters por dias consecutivos
        var cur = [remaining[0]];
        for (var i=1;i<remaining.length;i++){
          var prev = remaining[i-1], now = remaining[i];
          var gapDays = (dayKey(now.dateSort) - dayKey(prev.dateSort)) / 86400000;
          if (gapDays <= 1) cur.push(now);
          else { groups.push({ name:"Torneio (nome não explícito)", rounds:cur }); cur=[now]; }
        }
        groups.push({ name:"Torneio (nome não explícito)", rounds:cur });
      }
    }

    groups.sort(function(a,b){ return b.rounds.length - a.rounds.length; });
    return groups;
  }

  
  function mean(arr){
    var a = arr.filter(x => x!=null && x!=="" && isFinite(x));
    if (!a.length) return null;
    var s=0; for (var i=0;i<a.length;i++) s += Number(a[i]);
    return s / a.length;
  }
  function stdev(arr){
    var a = arr.filter(x => x!=null && x!=="" && isFinite(x)).map(Number);
    if (a.length < 2) return null;
    var m = mean(a);
    var v=0; for (var i=0;i<a.length;i++){ var d=a[i]-m; v += d*d; }
    v = v / (a.length-1);
    return Math.sqrt(v);
  }
  function movingAvg(arr, w){
    var out = new Array(arr.length).fill(null);
    for (var i=0;i<arr.length;i++){
      var start = Math.max(0, i-w+1);
      var slice = [];
      for (var j=start;j<=i;j++){
        var v = arr[j];
        if (v!=null && v!=="" && isFinite(v)) slice.push(Number(v));
      }
      out[i] = slice.length ? (slice.reduce((a,b)=>a+b,0)/slice.length) : null;
    }
    return out;
  }
  function asDateKey(d){ // dd-mm-yyyy
    return d;
  }
  function num(v){ var n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; }

  function miniLineSvg(series, width, height){
    var vals = series.filter(v=>v!=null && isFinite(v)).map(Number);
    if (vals.length < 2) return '<div class="muted">Sem dados suficientes</div>';
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    if (max === min) { max = min + 1; }
    var pts = [];
    var n = series.length;
    for (var i=0;i<n;i++){
      var v = series[i];
      if (v==null || !isFinite(v)) continue;
      var x = (i/(n-1)) * width;
      var y = (1-((v-min)/(max-min))) * height;
      pts.push([x,y]);
    }
    if (pts.length<2) return '<div class="muted">Sem dados suficientes</div>';
    var d = "M " + pts[0][0].toFixed(2) + " " + pts[0][1].toFixed(2);
    for (var k=1;k<pts.length;k++) d += " L " + pts[k][0].toFixed(2) + " " + pts[k][1].toFixed(2);
    return '<svg width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'" style="display:block">' +
             '<path d="'+d+'" fill="none" stroke="currentColor" stroke-width="2" />' +
           '</svg>';
  }

  // SD coloring relative to player's HCP at time of play
  function sdClassByHcp(sdNum, hi) {
    if (sdNum == null || isNaN(sdNum)) return '';
    var hcp = (hi != null && !isNaN(Number(hi))) ? Number(hi) : null;
    if (hcp == null) return '';
    var diff = sdNum - hcp;
    if (diff <= 2) return 'sd-excellent';
    if (diff <= 5) return 'sd-good';
    if (diff > 10) return 'sd-poor';
    return ''; // 5-10: sem cor
  }

  // Formatar Stableford com normalização WHS para 9 buracos (+17)
  function fmtStb(stb, holeCount) {
    if (stb == null || stb === '') return '';
    if (holeCount == 9) {
      var norm = Number(stb) + 17;
      return '<span style="color:#94a3b8;font-size:11px">*</span>' + norm;
    }
    return String(stb);
  }

  // Format SD — com indicador visual para valores estimados
  function fmtSd(r) {
    if (r.sd == null || r.sd === '') return '';
    var val = r.sd;
    var sdNum = Number(val);
    var cls = sdClassByHcp(sdNum, r.hi);
    if (r._sdEstimated) {
      // SD estimado: prefixo ~ e estilo mais suave
      return '<span class="' + (cls || '') + '" style="display:inline-block;min-width:36px;text-align:right;padding:2px 6px;border-radius:6px;opacity:0.75" title="SD estimado (sem slope/CR oficial): gross−par"><span style="color:#94a3b8;font-size:10px">~</span>' + val + '</span>';
    }
    return '<span class="' + (cls || '') + '" style="display:inline-block;min-width:36px;text-align:right;padding:2px 6px;border-radius:6px">' + val + '</span>';
  }
  // Simpler fmtSd for tournament detail (no span wrapping)
  function fmtSdSimple(r) {
    if (r.sd == null || r.sd === '') return '';
    var cls = sdClassByHcp(Number(r.sd), r.hi);
    var prefix = r._sdEstimated ? '<span style="color:#94a3b8;font-size:10px" title="SD estimado">~</span>' : '';
    return prefix + r.sd;
  }

  // Badge EDS / Indiv
  function fmtEds(origin) {
    if (origin === 'EDS') return '<span class="eds-badge">EDS</span>';
    if (origin === 'Indiv') return '<span class="eds-badge" style="background:#fef3c7;color:#92400e">INDIV</span>';
    if (origin === 'Treino') return '<span class="eds-badge" style="background:#f3e5f5;color:#6a1b9a">TREINO</span>';
    if (origin === 'Extra') return '<span class="eds-badge" style="background:#fce4ec;color:#c62828">EXTRA</span>';
    return '';
  }

  // Render multiple external links from _links object
  var linkLabels = {
    classificacao: 'Classificação', classificacao_d1: 'Classif. D1', classificacao_d2: 'Classif. D2',
    leaderboard: 'Leaderboard', scorecard: 'Scorecard', resultados: 'Resultados',
    fpg_scoring: 'FPG Scoring', noticia_teetimes: 'Notícia', link: '🔗'
  };
  function fmtLinks(links, size) {
    if (!links || typeof links !== 'object') return '';
    var keys = Object.keys(links);
    if (keys.length === 0) return '';
    var sz = size || 10;
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var url = links[k];
      if (!url || typeof url !== 'string' || url.indexOf('http') !== 0) continue;
      var label = linkLabels[k] || k;
      parts.push('<a href="'+esc(url)+'" target="_blank" style="font-size:'+sz+'px;color:#2d6a30;text-decoration:none" title="'+esc(label)+'">🔗'+( keys.length > 1 ? '<span style="font-size:'+(sz-1)+'px;margin-left:1px">'+esc(label)+'</span>' : '' )+'</a>');
    }
    return parts.length ? ' ' + parts.join(' ') : '';
  }
  // Render multiple link buttons (for detail view)
  function fmtLinkBtns(links) {
    if (!links || typeof links !== 'object') return '';
    var keys = Object.keys(links);
    if (keys.length === 0) return '';
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var url = links[k];
      if (!url || typeof url !== 'string' || url.indexOf('http') !== 0) continue;
      var label = linkLabels[k] || k;
      parts.push(' <a href="'+esc(url)+'" target="_blank" class="btn" style="text-decoration:none;background:#eff6ff;color:#0369a1;border-color:#bfdbfe">🔗 '+esc(label)+'</a>');
    }
    return parts.join('');
  }
  // Render pill badges (supports multiple: "AWAY INTL" → 2 badges)
  var pillStyles = {
    AWAY:     'away-pill',
    INTL:     'intl-pill',
    NACIONAL: 'nacional-pill',
    REGIONAL: 'regional-pill'
  };
  function fmtPills(pillStr) {
    if (!pillStr) return '';
    var tokens = pillStr.split(/\s+/);
    var parts = [];
    var icons = { INTL: '🌍 ', NACIONAL: '🏆 ', REGIONAL: '🏅 ' };
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      var cls = pillStyles[t] || 'away-pill';
      var icon = icons[t] || '';
      parts.push('<span class="'+cls+'">'+icon+esc(t)+'</span>');
    }
    return parts.length ? ' ' + parts.join('') : '';
  }

  // Universal scorecard color class — used everywhere (eclectic, comparison, etc.)
  function scClass(gross, par) {
    if (gross == null || gross === 0 || par == null) return ''; // gross=0 means NR
    var d = gross - par;
    if (gross === 1) return 'holeinone';
    if (d <= -3) return 'albatross';
    if (d === -2) return 'eagle';
    if (d === -1) return 'birdie';
    if (d === 0)  return 'par';
    if (d === 1)  return 'bogey';
    if (d === 2)  return 'double';
    if (d === 3)  return 'triple';
    if (d === 4)  return 'quad';
    if (d === 5)  return 'quint';
    return 'worse';
  }
  
  
  var AN_ROUNDS = []; // populated by renderAnalysis for dynamic cards

function renderAnalysis(FILTERED_ROUNDS){
  // Análises: KPIs + tendência (média móvel 5) + últimas 10
  var roundsDesc = FILTERED_ROUNDS.slice().sort(function(a,b){
    return (b.dateSort || 0) - (a.dateSort || 0);
  });
  var roundsAsc = roundsDesc.slice().reverse();
  
  // Populate AN_ROUNDS for dynamic histogram/records
  AN_ROUNDS = roundsDesc.map(function(r) {
    return { ds: r.dateSort||0, date: r.date||'', gross: numSafe(r.gross), par: numSafe(r.par), stb: numSafe(r.stb), sd: numSafe(r.sd), hi: numSafe(r.hi), course: r.course||'', scoreId: r.scoreId||'', hc: r.holeCount||18, scoreOrigin: r.scoreOrigin||'' };
  });

  // Helper para renderizar tee badge
  function renderTeeBadge(teeName){
    if (!teeName) return "";
    var hx = teeHex(teeName), fg = teeFg(hx);
    return '<span class="teePill" style="background:'+hx+';color:'+fg+'">'+teeName+'</span>';
  }

  function numSafe(v){
    if (v === null || v === undefined) return null;
    var n = parseFloat(String(v).replace(",", "."));
    return isFinite(n) ? n : null;
  }
  function meanArr(arr){
    var s=0, c=0;
    for (var i=0;i<arr.length;i++){
      var n = numSafe(arr[i]);
      if (n==null) continue;
      s += n; c++;
    }
    return c ? (s/c) : null;
  }
  function stdevArr(arr){
    var vals=[];
    for (var i=0;i<arr.length;i++){
      var n = numSafe(arr[i]);
      if (n!=null) vals.push(n);
    }
    if (vals.length < 2) return null;
    var m = meanArr(vals);
    var v=0;
    for (var j=0;j<vals.length;j++){
      var d = vals[j]-m; v += d*d;
    }
    v = v / (vals.length-1);
    return Math.sqrt(v);
  }
  function movingAvg(vals, w){
    var out = [];
    for (var i=0;i<vals.length;i++){
      var s=0,c=0;
      for (var j=Math.max(0,i-w+1); j<=i; j++){
        var n=numSafe(vals[j]);
        if (n==null) continue;
        s+=n;c++;
      }
      out.push(c ? (s/c) : null);
    }
    return out;
  }
  function miniSvg(series, w, h){
    var pts=[];
    var min=Infinity, max=-Infinity;
    for (var i=0;i<series.length;i++){
      var v = series[i];
      if (v==null) continue;
      if (v<min) min=v;
      if (v>max) max=v;
    }
    if (!isFinite(min) || !isFinite(max) || series.length < 2) return '<div class="muted">Sem dados</div>';
    if (max===min) max=min+1;
    for (var k=0;k<series.length;k++){
      var vv=series[k];
      if (vv==null) continue;
      var x=(k/(series.length-1))*w;
      var y=(1-((vv-min)/(max-min)))*h;
      pts.push([x,y]);
    }
    if (pts.length<2) return '<div class="muted">Sem dados</div>';
    var d='M '+pts[0][0].toFixed(2)+' '+pts[0][1].toFixed(2);
    for (var p=1;p<pts.length;p++) d+=' L '+pts[p][0].toFixed(2)+' '+pts[p][1].toFixed(2);
    return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" style="display:block"><path d="'+d+'" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  }

  // KPIs: apenas rondas de 18 buracos com gross válido (>50 = sanidade)
  var rounds18 = roundsDesc.filter(function(r){ return (r.holeCount === 18 || r.hc === 18); });
  var rounds18g = rounds18.filter(function(r){ var g = numSafe(r.gross); return g != null && g > 50; });
  var grossAll18 = rounds18g.map(function(r){ return r.gross; });
  var sdAll18    = rounds18.map(function(r){ return r.sd; });

  var last5_18 = rounds18g.slice(0,5);
  var last20_18= rounds18g.slice(0,20);

  var kpiGross5  = meanArr(last5_18.map(function(r){return r.gross;}));
  var kpiGross20 = meanArr(last20_18.map(function(r){return r.gross;}));
  var kpiSd20    = meanArr(last20_18.map(function(r){return r.sd;}));
  var kpiSigGross= stdevArr(grossAll18);

  // Todas as rondas para tabela
  var last20= roundsDesc.filter(function(r){ return !r._isTreino; }).slice(0,20);

  var gv=[];
  for (var i=0;i<grossAll18.length;i++){
    var n=numSafe(grossAll18[i]); if (n!=null && n > 50) gv.push(n);
  }
  gv.sort(function(a,b){return a-b;});
  var n20 = gv.length ? Math.max(1, Math.floor(gv.length*0.2)) : 0;
  var best20 = n20 ? meanArr(gv.slice(0,n20)) : null;

  function kpiCard(title, val, sub, tooltip){
    var tipHtml = tooltip ? '<span class="kpi-info" title="'+tooltip+'">ℹ️</span>' : '';
    return '<div class="an-card">' +
      '<div class="an-k-title">'+title+tipHtml+'</div>' +
      '<div class="an-k-val">'+(val==null?'<span class="muted">—</span>':'<b>'+val+'</b>')+'</div>' +
      (sub?'<div class="an-k-sub muted">'+sub+'</div>':'') +
    '</div>';
  }

  var html='';
  html+='<tr><td colspan="11"><div class="an-wrap">';
  html+='<div class="an-grid">';
  html+=kpiCard('Média (últimas 5)',  kpiGross5==null?null:kpiGross5.toFixed(1), 'Gross 18B (' + last5_18.length + ' rondas)',
    'Média do gross das últimas 5 rondas de 18 buracos. Indica a forma muito recente.');
  html+=kpiCard('Média (últimas 20)', kpiGross20==null?null:kpiGross20.toFixed(1), 'Gross 18B (' + last20_18.length + ' rondas)',
    'Média do gross das últimas 20 rondas de 18 buracos. Referência principal de forma actual.');
  html+=kpiCard('Best 20% (média)',   best20==null?null:best20.toFixed(1), 'Gross 18B (' + n20 + ' de ' + gv.length + ')',
    'Média dos melhores 20% dos resultados gross. Representa o potencial real do jogador — o nível que atinge nos seus melhores dias.');
  html+=kpiCard('Consistência (σ)',   kpiSigGross==null?null:kpiSigGross.toFixed(2), 'Gross 18B (' + gv.length + ' rondas)',
    'Desvio padrão do gross em todas as rondas de 18B. Quanto menor, mais consistente. Valores abaixo de 5 indicam alta consistência; acima de 8 indica resultados muito variáveis.');
  html+='</div>';

  // Period options shared by both cards
  var periodOpts = '<option value="3">3 meses</option>' +
    '<option value="6">6 meses</option>' +
    '<option value="9">9 meses</option>' +
    '<option value="12" selected>1 ano</option>' +
    '<option value="24">2 anos</option>' +
    '<option value="36">3 anos</option>' +
    '<option value="0">Total</option>';
  
  // Row with 3 cards
  html+='<div class="an-grid3">';
  
  // 1. PERFORMANCE vs PAR DISTRIBUTION
  html+='<div class="an-card">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
  html+='<div class="an-k-title" style="margin:0">Desempenho vs Par <span class="kpi-info info-toggle" data-target="parInfo" style="cursor:pointer">ℹ️</span></div>';
  html+='<select class="an-period-select" id="stbPeriod" style="font-size:11px;padding:2px 6px;border:1px solid #cbd5e1;border-radius:5px;background:#fff;color:#334155">' + periodOpts + '</select>';
  html+='</div>';
  html+='<div id="parInfo" style="display:none;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:8px 10px;margin-bottom:8px;font-size:11px;color:#334155;line-height:1.5">';
  html+='<b>Como é calculado:</b> Para cada ronda, calcula-se <code>Gross − Par</code> do campo. ';
  html+='O resultado indica quantas pancadas acima (ou abaixo) do par foi a ronda.<br>';
  html+='<b>Normalização 9B:</b> Rondas de 9 buracos têm a diferença multiplicada por 2 (×2) para equivaler a 18 buracos.<br>';
  html+='<b>Exemplo:</b> Gross 92 num campo Par 72 → +20. Gross 82 num Par 72 → +10.<br>';
  html+='<b>Categorias:</b> Excepcional (par ou melhor), Bom (+1 a +5), Razoável (+6 a +10), Difícil (+11 a +15), Fraco (+16 a +20), Mau (+21 a +25), Desastroso (>+25).';
  html+='</div>';
  html+='<div id="stbHistogram"></div>';
  html+='</div>';
  
  // 2. CAREER TRAJECTORY
  html+='<div class="an-card">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
  html+='<div class="an-k-title" style="margin:0">Trajectória <span class="kpi-info info-toggle" data-target="trajInfo" style="cursor:pointer">ℹ️</span></div>';
  html+='<select class="an-period-select" id="trajPeriod" style="font-size:11px;padding:2px 6px;border:1px solid #cbd5e1;border-radius:5px;background:#fff;color:#334155">' + periodOpts + '</select>';
  html+='</div>';
  html+='<div id="trajInfo" style="display:none;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:8px 10px;margin-bottom:8px;font-size:11px;color:#334155;line-height:1.5">';
  html+='<b>Carreira:</b> Duração e ritmo de jogo (rondas por ano).<br>';
  html+='<b>Pico:</b> Melhor média móvel de 10 rondas consecutivas — representa o período de melhor forma.<br>';
  html+='<b>Forma Actual:</b> Média das últimas 20 rondas + tendência (📈 melhorar / 📉 piorar / ➡️ estável). Tendência calculada comparando a 1ª metade vs 2ª metade das últimas 20.<br>';
  html+='<b>vs Média Carreira:</b> Diferença entre forma actual e média total. Valores negativos (verde) = a jogar melhor que a média; positivos (vermelho) = abaixo da média.<br>';
  html+='Todos os valores usam Gross normalizado a 18 buracos (9B ×2).';
  html+='</div>';
  html+='<div id="trajectoryCards"></div>';
  html+='</div>';
  
  // 2. PERSONAL RECORDS
  html+='<div class="an-card">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
  html+='<div class="an-k-title" style="margin:0">Recordes Pessoais</div>';
  html+='<select class="an-period-select" id="recPeriod" style="font-size:11px;padding:2px 6px;border:1px solid #cbd5e1;border-radius:5px;background:#fff;color:#334155">' + periodOpts + '</select>';
  html+='</div>';
  html+='<div id="recCards"></div>';
  html+='</div>';
  
  // 3. HCP WHS DETAIL (option B style)
  html+='<div class="an-card"><div class="an-k-title">Handicap — Detalhe WHS</div>';
  if (HCP_INFO.current != null) {
    var cur = HCP_INFO.current;
    var low = HCP_INFO.lowHcp;
    var soft = HCP_INFO.softCap;
    var hard = HCP_INFO.hardCap;
    var avg = HCP_INFO.scoreAvg;
    var qtyS = HCP_INFO.qtyScores;
    var qtyC = HCP_INFO.qtyCalc;
    
    html+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;margin:6px 0 10px">';
    html+='<div style="background:#f0fdf4;border-radius:10px;padding:10px 6px">';
    html+='<div class="muted" style="font-size:10px">MÍNIMO ATINGIDO</div>';
    html+='<div style="font-size:26px;font-weight:900;color:#16a34a">' + (low != null ? low.toFixed(1) : '—') + '</div>';
    html+='</div>';
    html+='<div style="background:#eff6ff;border-radius:10px;padding:10px 6px">';
    html+='<div class="muted" style="font-size:10px">ACTUAL</div>';
    html+='<div style="font-size:26px;font-weight:900;color:#0369a1">' + cur.toFixed(1) + '</div>';
    if (low != null) html+='<div style="font-size:11px;color:#dc2626;font-weight:600">+' + (cur - low).toFixed(1) + ' do mínimo</div>';
    html+='</div>';
    html+='<div style="background:#f8fafc;border-radius:10px;padding:10px 6px">';
    html+='<div class="muted" style="font-size:10px">MÉDIA ' + (qtyC||8) + ' MELHORES</div>';
    html+='<div style="font-size:26px;font-weight:900;color:#64748b">' + (avg != null ? avg.toFixed(1) : '—') + '</div>';
    html+='</div>';
    html+='</div>';
    
    html+='<div style="display:flex;gap:14px;font-size:11px;color:#64748b;border-top:1px solid #f1f5f9;padding-top:8px">';
    if (soft != null) html+='<span>Soft cap: <b>' + soft.toFixed(1) + '</b></span>';
    if (hard != null) html+='<span>Hard cap: <b>' + hard.toFixed(1) + '</b></span>';
    if (qtyS != null && qtyC != null) {
      html+='<span>Cálculo: <b>' + qtyC + '</b> de <b>' + qtyS + '</b> scores';
      if (HCP_INFO.adjustTotal != null && HCP_INFO.adjustTotal !== 0) html+=' (ajuste: ' + HCP_INFO.adjustTotal + ')';
      html+='</span>';
    }
    html+='</div>';
  } else {
    html+='<div class="muted">Sem dados WHS disponíveis</div>';
  }
  html+='</div>';
  
  html+='</div>'; // close 3-col grid

  // Encontrar os 8 melhores (menores) valores de SD nas últimas 20 voltas
  var sdIndexed = [];
  for (var si=0; si<last20.length; si++){
    var sdv = numSafe(last20[si].sd);
    if (sdv != null) sdIndexed.push({ idx: si, sd: sdv });
  }
  sdIndexed.sort(function(a,b){ return a.sd - b.sd; });
  var best8SDIndices = {};
  for (var bi=0; bi<Math.min(8, sdIndexed.length); bi++){
    best8SDIndices[sdIndexed[bi].idx] = bi + 1; // rank 1-8
  }

  html+='<div class="an-card"><div class="an-k-title">Últimas 20 rondas</div>';
  html+='<div class="muted" style="margin-bottom:8px">Os 8 melhores SD das últimas 20 estão assinalados com ★ · <b>*</b> = Stableford normalizado 9B→18B (+17 pts WHS)</div>';
  html+='<table class="an-table" id="last20Table">' +
        '<colgroup><col style="width:8%"><col style="width:16%"><col style="width:12%"><col style="width:6%"><col style="width:6%"><col style="width:10%"><col style="width:8%"><col style="width:9%"><col style="width:7%"><col style="width:7%"><col style="width:7%"></colgroup>' +
        '<thead><tr>' +
        '<th class="an-sortable" data-col="0" data-type="text">Data</th><th class="an-sortable" data-col="1" data-type="text">Campo</th><th>Prova</th>' +
        '<th class="right an-sortable" data-col="3" data-type="num">Bur.</th><th class="right an-sortable" data-col="4" data-type="num">HCP</th><th>Tee</th>' +
        '<th class="right an-sortable" data-col="6" data-type="num">Dist.</th>' +
        '<th class="right an-sortable" data-col="7" data-type="num">Gross</th>' +
        '<th class="right an-sortable" data-col="8" data-type="num">Stb</th><th class="right an-sortable" data-col="9" data-type="num">SD</th><th class="right">Top 8</th>' +
        '</tr></thead><tbody>';

  // Filtrar treinos e limitar a 20 rondas
  var allRoundsTable = roundsDesc.filter(function(r){ return !r._isTreino; });
  allRoundsTable = allRoundsTable.slice(0, 20);

  // Recalcular best8 para últimas 20 (que estão no topo do roundsDesc)
  var last20Set = {};
  for (var li = 0; li < allRoundsTable.length; li++) {
    last20Set[allRoundsTable[li].scoreId] = true;
  }

  for (var r=0;r<allRoundsTable.length;r++){
    var x = allRoundsTable[r];

    var sdClass = '';
    var sdVal = x.sd;
    if (sdVal != null) {
      var sdNum = Number(sdVal);
      sdClass = sdClassByHcp(sdNum, x.hi);
    }
    var isBest8Idx = -1;
    // Check if this round is in the last 20 and is a best8
    for (var bi2=0; bi2<Math.min(8, sdIndexed.length); bi2++){
      var origIdx = sdIndexed[bi2].idx;
      if (origIdx < last20.length && last20[origIdx].scoreId === x.scoreId) {
        isBest8Idx = bi2 + 1;
        break;
      }
    }
    var isBest8 = isBest8Idx > 0;
    var best8Html = isBest8 ? '<span style="color:#16a34a">★</span> <span style="font-weight:700">#' + isBest8Idx + '</span>' : '';
    var rowStyle = isBest8 ? ' style="background:#f0fdf4"' : '';
    var isLast20 = last20Set.hasOwnProperty(x.scoreId);
    
    // Stableford normalizado: 9 buracos + 17 (WHS)
    var stbDisplay = fmtStb(x.stb, x.holeCount);
    var stbSort = x.stb != null ? (x.holeCount == 9 ? x.stb + 17 : x.stb) : '';
    
    var scoreIdLabel = '';
    if (String(x.scoreId).indexOf('treino_') === 0) {
      scoreIdLabel = '<div class="muted" style="font-size:10px">Game Book</div>';
    } else if (String(x.scoreId).indexOf('extra_') === 0) {
      scoreIdLabel = '<div class="muted" style="font-size:10px">Extra (não FPG)</div>';
    } else {
      scoreIdLabel = '<div class="muted" style="font-size:10px">#'+x.scoreId+'</div>';
    }
    
    var hxL20 = teeHex(x.tee||''), fgL20 = teeFg(hxL20);
    var shortDateL20 = (x.date||'').replace(/^(\d{2})-(\d{2})-\d{4}$/,'$1-$2');
    var datePillL20 = (String(x.scoreId).indexOf('treino_') !== 0 && String(x.scoreId).indexOf('extra_') !== 0)
      ? '<a href="#" class="dateLink" data-score="'+x.scoreId+'"><span class="tee-date" style="background:'+hxL20+';color:'+fgL20+'">'+shortDateL20+'</span></a>'
      : '<span class="tee-date" style="background:'+hxL20+';color:'+fgL20+'">'+shortDateL20+'</span>';
    
    html+='<tr'+rowStyle+' data-sort-date="'+(x.dateSort||0)+'" data-sort-gross="'+(x.gross!=null?x.gross:999)+'" data-sort-stb="'+stbSort+'" data-sort-sd="'+(x.sd!=null?x.sd:999)+'" data-sort-hcp="'+(x.hi!=null?x.hi:999)+'" data-sort-bur="'+(x.holeCount||18)+'" data-sort-dist="'+(x.meters||0)+'">' +
      '<td>'+datePillL20+scoreIdLabel+'</td>' +
      '<td>'+esc(x.course||'')+'</td>' +
      '<td class="muted">'+esc(x.eventName||'')+fmtEds(x.scoreOrigin)+'</td>' +
      '<td class="right">'+(x.holeCount==9?'<span class="hb hb9">9</span>':'<span class="hb hb18">18</span>')+'</td>' +
      '<td class="right">'+(x.hi!=null?x.hi:'')+'</td>' +
      '<td>'+renderTeeBadge(x.tee||'')+'</td>' +
      '<td class="right muted">'+(x.meters ? (x.meters+'m') : '')+'</td>' +
      '<td class="right">'+fmtGross(x.gross, x.par)+'</td>' +
      '<td class="right">'+stbDisplay+'</td>' +
      '<td class="right">'+fmtSd(x)+'</td>' +
      '<td class="right">'+best8Html+'</td>' +
    '</tr>';
  }

  html+='</tbody></table>';
  html+='<div id="analysisScorecard" style="margin-top:12px"></div>';
  html+='</div>';

  // ========== CROSS-ANALYSIS ==========
  html += renderCrossAnalysis();

  html+='</div></td></tr>';
  tbody.innerHTML = html;
}

function renderCrossAnalysis() {
  var keys = Object.keys(CROSS_DATA);
  if (keys.length < 2) return ''; // Precisa de pelo menos 2 jogadores
  
  var html = '';
  html += '<div class="an-card" style="margin-top:24px">';
  html += '<div class="an-k-title" style="font-size:18px;margin-bottom:16px">📊 Cross-Análise por Escalão</div>';
  
  // Agrupar por escalão
  var byEscalao = {};
  for (var fed in CROSS_DATA) {
    var p = CROSS_DATA[fed];
    var esc = p.escalao || 'Sem escalão';
    if (!byEscalao[esc]) byEscalao[esc] = [];
    byEscalao[esc].push(p);
  }
  
  var escalaoOrder = ['Sub-10','Sub-12','Sub-14','Sub-16','Sub-18','Absoluto','Sénior','Sem escalão'];
  
  // Tabs de escalão
  var escalaos = escalaoOrder.filter(function(e){ return byEscalao[e] && byEscalao[e].length >= 1; });
  if (escalaos.length === 0) return '';
  
  html += '<div class="cross-tabs" id="crossTabs">';
  // Find current player's escalão for auto-selection
  var currentEsc = '';
  if (CROSS_DATA[CURRENT_FED]) currentEsc = CROSS_DATA[CURRENT_FED].escalao || '';
  var defaultIdx = 0;
  for (var di = 0; di < escalaos.length; di++) {
    if (escalaos[di] === currentEsc) { defaultIdx = di; break; }
  }
  for (var i = 0; i < escalaos.length; i++) {
    var active = i === defaultIdx ? ' active' : '';
    var count = byEscalao[escalaos[i]].length;
    html += '<button class="cross-tab' + active + '" data-cross-esc="' + esc2(escalaos[i]) + '">' + 
            esc2(escalaos[i]) + ' <span class="cross-tab-count">' + count + '</span></button>';
  }
  html += '</div>';
  
  // Cross filter bar: Sexo + HCP max + fade toggle
  html += '<div class="cross-filter-bar" id="crossFilterBar">' +
    '<select class="pm-fsel" id="crossSexFilter" style="font-size:11px">' +
    '<option value="all">Sexo</option>' +
    '<option value="M">Masc.</option>' +
    '<option value="F">Fem.</option>' +
    '</select>' +
    '<select class="pm-fsel" id="crossHcpMax" style="font-size:11px">' +
    '<option value="all">HCP máx</option>' +
    '<option value="0">Scratch (≤0)</option>' +
    '<option value="3">≤ 3</option>' +
    '<option value="6">≤ 6</option>' +
    '<option value="9">≤ 9</option>' +
    '<option value="12">≤ 12</option>' +
    '<option value="15">≤ 15</option>' +
    '<option value="18">≤ 18</option>' +
    '<option value="21">≤ 21</option>' +
    '<option value="25">≤ 25</option>' +
    '<option value="28">≤ 28</option>' +
    '<option value="31">≤ 31</option>' +
    '<option value="38">≤ 38</option>' +
    '<option value="45">≤ 45</option>' +
    '</select>' +
    '<label class="cross-fade-toggle active" id="crossFadeToggle">' +
    '<span style="font-size:12px">👁</span> Mostrar filtrados</label>' +
    '<span class="muted" style="font-size:11px;font-weight:600" id="crossFilterCount"></span>' +
    '</div>';
  
  // Conteúdo por escalão
  for (var ei = 0; ei < escalaos.length; ei++) {
    var escName = escalaos[ei];
    var players = byEscalao[escName];
    var display = ei === defaultIdx ? '' : 'display:none;';
    
    html += '<div class="cross-panel" id="crossPanel_' + esc2(escName) + '" style="' + display + '">';
    
    // 1. RANKING TABLE with checkboxes
    // Ordenar por HCP (melhor primeiro)
    var sorted = players.slice().sort(function(a, b) {
      if (a.currentHcp == null && b.currentHcp == null) return 0;
      if (a.currentHcp == null) return 1;
      if (b.currentHcp == null) return -1;
      return a.currentHcp - b.currentHcp;
    });
    
    var safeEsc = esc2(escName).replace(/[^a-zA-Z0-9]/g,'_');
    var curYear = new Date().getFullYear();
    var prevYear = curYear - 1;
    var twoYearsAgo = curYear - 2;
    var threeYearsAgo = curYear - 3;
    html += '<div class="cross-section-title">Ranking — ' + esc2(escName) + '</div>';
    html += '<table class="an-table cross-table cross-sortable" id="crossRank_' + safeEsc + '" data-esc="' + safeEsc + '">' +
            '<thead><tr class="cross-hdr-group">' +
            '<th rowspan="2" class="right cross-sort" data-col="0" data-type="num" style="width:28px">#</th>' +
            '<th rowspan="2" class="cross-sort" data-col="1" data-type="text">Jogador</th>' +
            '<th rowspan="2" class="right cross-sort" data-col="2" data-type="num">HCP</th>' +
            '<th rowspan="2" class="right cross-sort" data-col="3" data-type="num" title="Último Score Diferencial">Últ.SD</th>' +
            '<th rowspan="2" class="right cross-sort" data-col="4" data-type="num">M.SD</th>' +
            '<th rowspan="2" class="right cross-sort" data-col="5" data-type="num">Torneios</th>' +
            '<th rowspan="2" class="right cross-sort" data-col="6" data-type="num" title="Extra Day Score">EDS</th>' +
            '<th colspan="5" class="center cross-hdr-voltas">Voltas</th>' +
            '<th rowspan="2" class="cross-sort" data-col="12" data-type="date" style="font-size:10px">Início</th>' +
            '</tr><tr class="cross-hdr-sub">' +
            '<th class="right cross-sort" data-col="7" data-type="num">Total</th>' +
            '<th class="right cross-sort" data-col="8" data-type="num">' + threeYearsAgo + '</th>' +
            '<th class="right cross-sort" data-col="9" data-type="num">' + twoYearsAgo + '</th>' +
            '<th class="right cross-sort" data-col="10" data-type="num">' + prevYear + '</th>' +
            '<th class="right cross-sort" data-col="11" data-type="num">' + curYear + '</th>' +
            '</tr></thead><tbody>';
    
    for (var ri = 0; ri < sorted.length; ri++) {
      var p = sorted[ri];
      var isCurrent = p.fed === CURRENT_FED;
      var rowCls = isCurrent ? ' class="cross-current"' : '';
      // Format firstDate: show date, with years-ago as muted decoration
      var firstDateSortable = p.firstDate || '9999-99-99';
      var firstFmt = '—';
      if (p.firstDate) {
        var parts = p.firstDate.split('-');
        if (parts.length === 3) {
          var fYear = parseInt(parts[2], 10);
          var yearsAgo = curYear - fYear;
          firstDateSortable = parts[2] + '-' + parts[1] + '-' + parts[0]; // YYYY-MM-DD for sort
          firstFmt = p.firstDate;
          if (yearsAgo > 0) firstFmt += ' <span class="muted" style="font-size:9px">(' + yearsAgo + 'A)</span>';
        } else {
          firstFmt = p.firstDate;
        }
      }
      html += '<tr' + rowCls + ' data-fed="' + p.fed + '" data-esc="' + safeEsc + '" data-hcp="' + (p.currentHcp != null ? p.currentHcp : '') + '" data-sex="' + (p.sex || '') + '">' +
              '<td class="right" data-v="' + (ri + 1) + '"><span class="cross-dot"></span><b>' + (ri + 1) + '</b></td>' +
              '<td data-v="' + esc2(p.name) + '">' + (isCurrent ? '<b>' : '') + esc2(p.name) + (isCurrent ? '</b>' : '') + 
              ' <span class="muted" style="font-size:10px">' + p.fed + '</span>' +
              (p.birthYear ? ' <span class="hd-pill hd-birth" style="font-size:9px;padding:1px 5px">' + p.birthYear + '</span>' : '') +
              (p.club ? ' <span class="hd-pill hd-club" style="font-size:9px;padding:1px 5px">' + esc2(p.club) + '</span>' : '') +
              (p.sex ? ' <span class="hd-pill ' + (p.sex === 'F' ? 'hd-sex-f' : 'hd-sex-m') + '" style="font-size:9px;padding:1px 5px">' + p.sex + '</span>' : '') +
              '</td>' +
              '<td class="right" data-v="' + (p.currentHcp != null ? p.currentHcp : 999) + '"><b>' + (p.currentHcp != null ? p.currentHcp : '—') + '</b></td>' +
              (function(){ var sdCls = (p.lastSD != null && p.currentHcp != null) ? ' ' + sdClassByHcp(p.lastSD, p.currentHcp) : ''; return '<td class="right' + sdCls + '" data-v="' + (p.lastSD != null ? p.lastSD : 999) + '">' + (p.lastSD != null ? p.lastSD.toFixed(1) : '—') + '</td>'; })() +
              '<td class="right" data-v="' + (p.avgSD20 != null ? p.avgSD20 : 999) + '">' + (p.avgSD20 != null ? p.avgSD20.toFixed(1) : '—') + '</td>' +
              '<td class="right" data-v="' + p.numTournaments + '">' + p.numTournaments + '</td>' +
              '<td class="right" data-v="' + (p.numEDS || 0) + '">' + (p.numEDS || 0) + '</td>' +
              '<td class="right" data-v="' + p.numRounds + '">' + p.numRounds + '</td>' +
              '<td class="right" data-v="' + (p.rounds3YearsAgo || 0) + '">' + (p.rounds3YearsAgo || 0) + '</td>' +
              '<td class="right" data-v="' + (p.rounds2YearsAgo || 0) + '">' + (p.rounds2YearsAgo || 0) + '</td>' +
              '<td class="right" data-v="' + (p.roundsLastYear || 0) + '">' + (p.roundsLastYear || 0) + '</td>' +
              '<td class="right" data-v="' + (p.roundsCurrentYear || 0) + '">' + (p.roundsCurrentYear || 0) + '</td>' +
              '<td data-v="' + firstDateSortable + '" style="font-size:11px;color:#64748b;white-space:nowrap">' + firstFmt + '</td>' +
              '</tr>';
    }
    html += '</tbody></table>';
    
    // 2. HCP EVOLUTION CHART
    var chartPlayers = players.filter(function(p){ return p.hcpHistory && p.hcpHistory.length >= 2; });
    if (chartPlayers.length >= 1) {
      html += '<div class="cross-section-title" style="margin-top:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">Evolução HCP — ' + esc2(escName) + ' <select class="cross-period-select" data-esc="' + esc2(escName) + '">' +
        '<option value="0">Total</option>' +
        '<option value="36">3 anos</option>' +
        '<option value="24">2 anos</option>' +
        '<option value="12" selected>1 ano</option>' +
        '<option value="6">6 meses</option>' +
      '</select>' +
      '<span class="muted" style="font-size:11px;font-weight:400">(clica nas linhas acima para filtrar · duplo-clique no # para alternar todos)</span></div>';
      html += '<div class="cross-chart-wrap">';
      html += '<canvas id="crossChart_' + esc2(escName) + '" style="width:100%;height:300px"></canvas>';
      html += '<div class="cross-legend" id="crossLegend_' + esc2(escName) + '"></div>';
      html += '</div>';
    }
    
    // 3. COMMON COURSES — by tee, best round, expandable
    var courseTeeMap = {};
    for (var pi = 0; pi < players.length; pi++) {
      var pa = players[pi];
      if (!pa.courseTee) continue;
      for (var ctk in pa.courseTee) {
        var ct = pa.courseTee[ctk];
        var cName = ct.course || '';
        if (!cName || cName.toUpperCase() === 'NONE' || !cName.trim()) continue;
        if (!courseTeeMap[ctk]) courseTeeMap[ctk] = { course: cName, tee: ct.tee || '?', courseKey: ct.courseKey, teeKey: ct.teeKey, players: [] };
        courseTeeMap[ctk].players.push({
          name: pa.name, fed: pa.fed, best: ct.best, avg: ct.avg,
          worst: ct.worst, count: ct.count, rounds: ct.rounds || []
        });
      }
    }
    var commonCT = [];
    for (var ctk2 in courseTeeMap) {
      if (courseTeeMap[ctk2].players.length >= 2) {
        courseTeeMap[ctk2].players.sort(function(a, b) { return (a.best || 999) - (b.best || 999); });
        commonCT.push(courseTeeMap[ctk2]);
      }
    }
    commonCT.sort(function(a, b) { return b.players.length - a.players.length; });

    if (commonCT.length > 0) {
      html += '<div class="cross-section-title" style="margin-top:20px">Campos em Comum (mesmo tee) — ' + esc2(escName) + '</div>';
      html += '<div class="muted" style="font-size:11px;margin-bottom:8px">Ordenado pela melhor ronda. Clica num campo para ver detalhes.</div>';

      for (var ci = 0; ci < Math.min(commonCT.length, 25); ci++) {
        var cc = commonCT[ci];
        var ccId = 'crossCourse_' + safeEsc + '_' + ci;

        // Summary card (clickable)
        html += '<div class="cross-course-card cross-course-toggle" data-target="' + ccId + '">';
        html += '<div class="cross-course-header">';
        html += '<span class="cross-course-arrow" id="arrow_' + ccId + '">▶</span> ';
        html += '<span class="cross-course-name">⛳ ' + esc2(cc.course) + '</span> ';
        html += '<span class="teePill teePill-sm" style="background:' + teeHex(cc.tee) + ';color:' + teeFg(teeHex(cc.tee)) + '">' + esc2(cc.tee) + '</span>';
        html += '<span class="muted" style="font-size:11px;margin-left:8px">' + cc.players.length + ' jogadores</span>';
        html += '</div>';
        // Mini ranking by best gross
        html += '<div class="cross-mini-ranking">';
        for (var mr = 0; mr < cc.players.length; mr++) {
          var mp = cc.players[mr];
          var isCur = mp.fed === CURRENT_FED;
          var medal = mr === 0 ? '🥇' : mr === 1 ? '🥈' : mr === 2 ? '🥉' : (mr+1)+'º';
          html += '<span class="cross-mini-player' + (isCur ? ' cross-mini-current' : '') + '">' + medal + ' ' + esc2(mp.name.split(' ')[0]) + ' <b>' + (mp.best||'—') + '</b></span>';
        }
        html += '</div></div>';

        // Expanded detail (hidden)
        html += '<div class="cross-course-detail" id="' + ccId + '" style="display:none">';
        // Summary table
        html += '<table class="an-table cross-course-table"><thead><tr>' +
                '<th style="width:32px">#</th><th>Jogador</th><th class="right">Voltas</th>' +
                '<th class="right" style="color:#16a34a">★ Melhor</th><th class="right">Média</th>' +
                '<th class="right" style="color:#dc2626">Pior</th><th class="right">Ampl.</th>' +
                '<th style="min-width:120px">Distribuição</th></tr></thead><tbody>';

        var groupBest=Infinity, groupWorst=-Infinity;
        for (var gb=0; gb<cc.players.length; gb++) {
          if (cc.players[gb].best!=null && cc.players[gb].best<groupBest) groupBest=cc.players[gb].best;
          if (cc.players[gb].worst!=null && cc.players[gb].worst>groupWorst) groupWorst=cc.players[gb].worst;
        }
        var gRange = groupWorst - groupBest || 1;

        for (var bi2=0; bi2<cc.players.length; bi2++) {
          var cp = cc.players[bi2];
          var isCur2 = cp.fed === CURRENT_FED;
          var rowC = isCur2 ? ' class="cross-current"' : '';
          var ampl = (cp.best!=null && cp.worst!=null) ? (cp.worst-cp.best) : null;
          var barLeft = cp.best!=null ? ((cp.best-groupBest)/gRange*100) : 0;
          var barW = (cp.best!=null && cp.worst!=null) ? ((cp.worst-cp.best)/gRange*100) : 5;
          if (barW<3) barW=3;
          var avgM = cp.avg!=null ? ((cp.avg-groupBest)/gRange*100) : 50;
          var bCol = isCur2 ? '#16a34a' : '#94a3b8';
          var spk = '<div class="cross-spark-track">' +
                    '<div class="cross-spark-bar" style="left:'+barLeft.toFixed(1)+'%;width:'+barW.toFixed(1)+'%;background:'+bCol+'"></div>' +
                    '<div class="cross-spark-avg" style="left:'+avgM.toFixed(1)+'%;border-color:'+bCol+'"></div></div>';
          html += '<tr'+rowC+'><td><b>'+(bi2+1)+'</b></td>' +
                  '<td>'+(isCur2?'<b>':'')+esc2(cp.name)+(isCur2?'</b>':'')+'</td>' +
                  '<td class="right">'+cp.count+'</td>' +
                  '<td class="right" style="color:#16a34a;font-weight:700">'+(cp.best!=null?cp.best:'—')+'</td>' +
                  '<td class="right">'+cp.avg.toFixed(1)+'</td>' +
                  '<td class="right" style="color:#dc2626;font-weight:600">'+(cp.worst!=null?cp.worst:'—')+'</td>' +
                  '<td class="right">'+(ampl!=null?ampl:'—')+'</td>' +
                  '<td>'+spk+'</td></tr>';
        }
        html += '</tbody></table>';

        // Round-by-round history
        html += '<div class="cross-rounds-title">Histórico de rondas — ' + esc2(cc.course) + ' (' + esc2(cc.tee) + ')</div>';
        for (var hi2=0; hi2<cc.players.length; hi2++) {
          var hp = cc.players[hi2];
          var isC = hp.fed === CURRENT_FED;
          if (!hp.rounds || hp.rounds.length===0) continue;
          html += '<div class="cross-round-block'+(isC?' cross-round-current':'')+'">';
          html += '<div class="cross-round-name">'+esc2(hp.name)+' <span class="muted">('+hp.rounds.length+' ronda'+(hp.rounds.length>1?'s':'')+')</span></div>';
          html += '<div class="cross-round-list">';
          for (var rr=0; rr<hp.rounds.length; rr++) {
            var rd = hp.rounds[rr];
            var isBest = rd.gross === hp.best;
            html += '<div class="cross-round-item'+(isBest?' cross-round-best':'')+'">';
            html += '<span class="cross-round-date">'+(rd.date||'—')+'</span>';
            html += '<span class="cross-round-gross">'+fmtGross(rd.gross, rd.par)+'</span>';
            if (rd.sd!=null) html += '<span class="cross-round-sd">SD '+rd.sd+'</span>';
            if (rd.hi!=null) html += '<span class="cross-round-hi">HCP '+rd.hi+'</span>';
            if (rd.event) html += '<span class="cross-round-event">'+esc2(rd.event)+'</span>';
            if (isBest) html += '<span class="cross-round-medal">★</span>';
            html += '</div>';
          }
          html += '</div></div>';
        }
        html += '</div>'; // close detail
      }
    }

    html += '</div>'; // close panel
  }
  
  html += '</div>'; // close an-card
  return html;
}

// Helper para o cross-analysis (evitar conflito com o esc do template)
function esc2(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function fmtGross(gross, par) {
  if (gross == null || gross === '') return '';
  var g = Number(gross);
  if (!Number.isFinite(g)) return '<b>' + gross + '</b>';
  var p = Number(par);
  if (Number.isFinite(p) && p > 0) {
    var diff = g - p;
    var txt = diff === 0 ? 'E' : (diff > 0 ? '+' : '') + diff;
    var cls = diff > 0 ? 'pos' : diff < 0 ? 'neg' : '';
    return '<b>' + g + '</b><span class="score-delta ' + cls + '">' + txt + '</span>';
  }
  return '<b>' + g + '</b>';
}

// Gross com +/- por baixo e cor baseada no HCP
function fmtGrossBelow(gross, par, hi, holeCount) {
  if (gross == null || gross === '') return '';
  var g = Number(gross);
  if (!Number.isFinite(g)) return '<b>' + g + '</b>';
  var p = Number(par);
  if (!Number.isFinite(p) || p <= 0) return '<b>' + g + '</b>';
  var diff = g - p;
  var txt = diff === 0 ? 'E' : (diff > 0 ? '+' : '') + diff;
  // Cor baseada no HCP
  var col = '#64748b'; // default grey
  if (diff <= 0) {
    col = '#16a34a'; // green - par or better
  } else if (hi != null && Number.isFinite(Number(hi))) {
    var expected = (holeCount == 9) ? Number(hi) / 2 : Number(hi);
    if (diff <= expected) col = '#2563eb';         // blue - within HCP
    else if (diff <= expected + 5) col = '#ea580c'; // orange - slightly above
    else col = '#dc2626';                           // red - well above
  }
  return '<span style="font-weight:700;font-size:0.95em">' + g + '</span><span style="display:block;font-size:0.72em;color:'+col+';margin-top:1px">' + txt + '</span>';
}


  function detectHoleCountFromRec(rec){
    // se houver buracos 10..18 com gross/par válido -> 18 senão 9
    for (var h=10; h<=18; h++){
      var g = toNum(rec["gross_"+h]);
      var p = toNum(rec["par_"+h]);
      if (isMeaningful(g) || isMeaningful(p)) return 18;
    }
    return 9;
  }

function render(){
    var view = viewSel ? viewSel.value : "by_course";
    var term = norm2(q.value || "");
    var sort = sortSel.value;
    
    // Atualizar HCP badge com o valor mais recente
    try {
      var allRounds = [];
      DATA.forEach(function(c){
        c.rounds.forEach(function(r){
          if (r.dateSort && r.hi != null) allRounds.push(r);
        });
      });
      if (allRounds.length > 0) {
        allRounds.sort(function(a,b){ return b.dateSort - a.dateSort; });
        var latestHI = allRounds[0].hi;
        var badge = document.getElementById('hcpVal');
        if (badge) badge.textContent = latestHI;
      }
    } catch(e) { console.error('Erro a atualizar HCP:', e); }
    
    // Criar FILTERED_ROUNDS para análises (flatten all rounds e filtrar por termo de pesquisa)
    var FILTERED_ROUNDS = [];
    DATA.forEach(function(c){
      c.rounds.forEach(function(r){
        FILTERED_ROUNDS.push(Object.assign({ course: c.course, courseKey: norm2(c.course) }, r));
      });
    });
    if (term) {
      FILTERED_ROUNDS = FILTERED_ROUNDS.filter(function(x){
        return norm2(x.course).indexOf(term) >= 0 || norm2(x.eventName || "").indexOf(term) >= 0;
      });
    }
    
    if (sortSel) {
      var enableSort = (view === "by_course" || view === "by_course_analysis");
      sortSel.disabled = !enableSort;
      sortSel.style.opacity = enableSort ? "1" : "0.45";
      sortSel.title = enableSort ? "" : "Ordenação aplica-se à vista Por campo.";
    }

    // limpar tabela para evitar "restos" quando uma vista falha a renderizar
    if (tbody) tbody.innerHTML = "";

    // manter campos abertos mesmo com re-render (ex.: clicar no ecletico)
    try {
      document.querySelectorAll("tr.details").forEach(function(tr){
        var id = tr.getAttribute("id");
        if (!id) return;
        openState[id] = tr.classList.contains("open");
      });
    } catch (e) {}


    // Vista: Por campo (default) / Por data / Por torneio
    function setThead(html, colHtml){
      var th = document.getElementById("thead");
      if (th) th.innerHTML = html;
      var cg = document.getElementById("mainColgroup");
      if (cg) cg.innerHTML = colHtml || '';
    }

    if (view === "analysis") {
      setThead("<tr><th>Análises</th></tr>", '<col style="width:100%">');
      try {
        renderAnalysis(FILTERED_ROUNDS);
        // Refresh dynamic analysis cards (histogram + records)
        setTimeout(function(){ refreshAnalysisCards(); }, 20);
        // Render cross-analysis charts
        setTimeout(function(){ renderCrossCharts(); }, 50);
      } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="11" class="muted" style="padding:16px">Erro a renderizar <b>Análises</b>: '+esc(String(e && e.message ? e.message : e))+'</td></tr>';
      }
      return;
    }

    if (view === "by_date") {
      try {
      // flatten rounds
      var all = [];
      DATA.forEach(function(c){
        c.rounds.forEach(function(r){
          all.push(Object.assign({ course: c.course, courseKey: norm2(c.course) }, r));
        });
      });
      if (term) all = all.filter(function(x){
        return norm2(x.course).indexOf(term) >= 0 || norm2(x.eventName).indexOf(term) >= 0;
      });
      // sort newest first
      all.sort(function(a,b){ return (b.dateSort - a.dateSort) || String(b.scoreId).localeCompare(String(a.scoreId)); });

      setThead('<tr>' +
        '<th style="width:9%">Data</th>' +
        '<th style="width:18%">Campo</th>' +
        '<th style="width:13%">Prova</th>' +
        '<th class="right" style="width:6%">Bur.</th>' +
        '<th class="right" style="width:7%">HCP</th>' +
        '<th style="width:10%">Tee</th>' +
        '<th class="right" style="width:8%">Dist.</th>' +
        '<th class="right" style="width:9%">Gross</th>' +
        '<th class="right" style="width:7%">Stb</th>' +
        '<th class="right" style="width:7%">SD</th>' +
      '</tr>',
      '<col style="width:9%"><col style="width:18%"><col style="width:13%"><col style="width:6%"><col style="width:7%"><col style="width:10%"><col style="width:8%"><col style="width:9%"><col style="width:7%"><col style="width:7%">');

      cCourses.textContent = DATA.length;
      cRounds.textContent = all.length;

      var html = "";
      all.forEach(function(r){
        var hxD = teeHex(r.tee||""), fgD = teeFg(hxD);
        var shortDateD = (r.date||"").replace(/^(\d{2})-(\d{2})-\d{4}$/,"$1-$2");
        var datePillD = r.hasCard
          ? '<a class="dateLink" href="#" data-score="' + r.scoreId + '"><span class="tee-date" style="background:'+hxD+';color:'+fgD+'">'+shortDateD+'</span></a>'
          : '<span class="tee-date" style="background:'+hxD+';color:'+fgD+'">'+shortDateD+'</span>';
        datePillD += '<div class="muted" style="font-size:10px">#' + r.scoreId + '</div>';
        var teeHtml = (r.tee||"") ? '<span class="teePill" style="background:'+hxD+';color:'+fgD+'">'+r.tee+'</span>' : "";
        var sdClass = '';
        var sdVal = r.sd ?? '';
        if (sdVal !== '') {
          var sdNum = Number(sdVal);
          sdClass = sdClassByHcp(sdNum, r.hi);
        }
        html += '<tr class="roundRow" data-score="'+r.scoreId+'" data-hascard="'+(r.hasCard?'1':'0')+'" data-course="'+esc(r.courseKey||'')+'" data-tee="'+esc(r.teeKey||'')+'">' +
          '<td>'+datePillD+'</td>' +
          '<td>'+r.course+'</td>' +
          '<td><span class="muted">'+esc(r.eventName||"")+fmtEds(r.scoreOrigin)+'</span>'+fmtPills(r._pill)+fmtLinks(r._links, 10)+'</td>' +
          '<td class="right">'+(r.holeCount==9?'<span class="hb hb9">9</span>':'<span class="hb hb18">18</span>')+'</td>' +
          '<td class="right">'+(r.hi??"")+'</td>' +
          '<td>'+teeHtml+'</td>' +
          '<td class="right muted">'+(r.meters ? (r.meters+'m') : '')+'</td>' +
          '<td class="right">'+fmtGross(r.gross, r.par)+'</td>' +
          '<td class="right">'+fmtStb(r.stb, r.holeCount)+'</td>' +
          '<td class="right">'+fmtSd(r)+'</td>' +
        '</tr>';
      });
      tbody.innerHTML = html;
      return;
      } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="11" style="padding:16px" class="muted">Erro a renderizar vista por data: '+esc(String(e && e.message ? e.message : e))+'</td></tr>';
        return;
      }
    }

    if (view === "by_tournament") {
      try {
      // Flatten todos os rounds com eventName primeiro (agrupamento global cross-campo)
      // EXCLUIR treinos — não são torneios
      var allRoundsWithNames = [];
      DATA.forEach(function(c){
        c.rounds.forEach(function(r){
          if (r.eventName && r.dateSort && !r._isTreino) {
            allRoundsWithNames.push(Object.assign({ course: c.course }, r));
          }
        });
      });
      
      // Agrupar por similaridade de nome + dias consecutivos (ignorando campo)
      // RESPEITAR _group: rounds com _group diferente nunca se juntam
      var globalGroups = [];
      allRoundsWithNames.sort(function(a,b){ return a.dateSort - b.dateSort; }).forEach(function(r){
        
        var found = false;
        for (var g = 0; g < globalGroups.length; g++) {
          var group = globalGroups[g];

          // _group override: se ambos têm _group, só juntar se forem iguais
          // Se um tem _group e o outro não, nunca juntar
          var rGroup = r._group || '';
          var gGroup = group._group || '';
          if (rGroup || gGroup) {
            if (rGroup !== gGroup) continue; // _groups diferentes — nunca juntar
            // _groups iguais — forçar agrupamento (sem verificar datas/nomes)
            group.rounds.push(r);
            if (group.courses.indexOf(r.course) < 0) group.courses.push(r.course);
            found = true;
            break;
          }

          // Passar curso para ajudar na similaridade de nomes genéricos
          var similarity = nameSimilarity(r.eventName, group.name, r.course, group.courses[0]);
          
          // Verificar gap com QUALQUER round do grupo (não só o último)
          var minGap = 999;
          for (var i = 0; i < group.rounds.length; i++) {
            var gap = Math.abs((r.dateSort - group.rounds[i].dateSort) / 86400000);
            if (gap < minGap) minGap = gap;
          }
          var dayGap = minGap;
          
          // Torneios duram no máximo 4 dias, com dias consecutivos.
          // maxGap=2 no minGap garante que dia 4 está a <=2 dias do dia 3.
          var maxGap = 2;
          
          // Mesmo campo + dias consecutivos + ambos com keywords away = forte evidência
          var sameCourse = group.courses.some(function(gc){ return norm2(gc) === norm2(r.course); });
          var bothAway = /away|internacional|international|tour|viagem|estrangeiro|abroad/i.test(r.eventName) &&
                         /away|internacional|international|tour|viagem|estrangeiro|abroad/i.test(group.name);
          
          // Se nome 30%+ similar E dentro do gap permitido
          // OU mesmo campo + dias consecutivos + ambos away (a federação usa labels diferentes)
          if ((similarity >= 0.3 && dayGap <= maxGap) ||
              (sameCourse && dayGap <= maxGap && bothAway && group.rounds.length < 4)) {
            group.rounds.push(r);
            // Atualizar campos do grupo (pode ser multi-campo)
            if (group.courses.indexOf(r.course) < 0) group.courses.push(r.course);
            found = true;
            break;
          }
        }
        
        if (!found) {
          globalGroups.push({
            name: r.eventName,
            courses: [r.course],
            rounds: [r],
            _group: r._group || ''
          });
        }
      });
      
      // Adicionar grupos globais multi-ronda
      var items = [];
      var totalGroups = globalGroups.length;
      var addedCount = 0;
      var ignoredCount = 0;
      
      globalGroups.forEach(function(g){
        if (g.rounds.length >= 2) {
          addedCount++;
          
          // Filtrar placeholders de campo (INTERNACIONAL, AWAY, etc.)
          var placeholders = ['internacional', 'away', 'estrangeiro', 'tour', 'abroad'];
          var realCourses = g.courses.filter(function(c){
            var cn = norm2(c);
            return !placeholders.some(function(p){ return cn === p; });
          });
          
          // Se só tem placeholders, manter o primeiro
          var finalCourse = realCourses.length > 0 
            ? (realCourses.length === 1 ? realCourses[0] : realCourses.join(", "))
            : g.courses[0];
          
          // Usar _group como nome se disponível (mais limpo que o nome da FPG)
          var cleanName = g._group || g.name;
          
          items.push({
            type: "event",
            course: finalCourse,
            name: cleanName,
            rounds: g.rounds.sort(function(a,b){ return a.dateSort - b.dateSort; })
          });
        } else if (g.rounds.length === 1 && g.rounds[0]._showInTournament) {
          // Excepção explícita: ronda extra marcada com torneio_view no melhorias.json
          addedCount++;
          items.push({
            type: "event",
            course: g.courses[0],
            name: g.name,
            rounds: g.rounds
          });
        } else {
          ignoredCount++;
        }
      });
      
      // Agora processar rounds SEM eventName (clusters por campo)
      DATA.forEach(function(c){
        var rr = c.rounds.slice().filter(function(x){ return x.dateSort && !x.eventName; }).sort(function(a,b){ return a.dateSort - b.dateSort; });
        if (rr.length < 2) return;
        
        // clusters por dias consecutivos (2+)
        var cur = [rr[0]];
        for (var i=1;i<rr.length;i++){
          var prev=rr[i-1], now=rr[i];
          var gap = (dayKey(now.dateSort)-dayKey(prev.dateSort))/86400000;
          if (gap<=1) cur.push(now);
          else { if (cur.length>=2) items.push({type:"cluster", course:c.course, name:"Torneio (nome não explícito)", rounds:cur}); cur=[now]; }
        }
        if (cur.length>=2) items.push({type:"cluster", course:c.course, name:"Torneio (nome não explícito)", rounds:cur});
      });

      if (term) items = items.filter(function(it){
        return norm2(it.course).indexOf(term)>=0 || norm2(it.name).indexOf(term)>=0;
      });

      // ordenar por data do último dia do torneio (desc)
      items.sort(function(a,b){
        var al = a.rounds[a.rounds.length-1]?.dateSort || 0;
        var bl = b.rounds[b.rounds.length-1]?.dateSort || 0;
        return (bl-al) || (b.rounds.length-a.rounds.length) || a.course.localeCompare(b.course);
      });

      setThead('<tr>' +
        '<th style="width:46%">Torneio</th>' +
        '<th style="width:34%">Campo</th>' +
        '<th class="right" style="width:10%">Rondas</th>' +
        '<th style="width:10%">Datas</th>' +
      '</tr>',
      '<col style="width:46%"><col style="width:34%"><col style="width:10%"><col style="width:10%">');

      cCourses.textContent = DATA.length;
      cRounds.textContent = items.reduce(function(a,it){ return a+it.rounds.length; },0);

      var html = "";
      items.forEach(function(it, idx){
        var rowId = "t_" + idx;
        var start = it.rounds[0]?.date || "";
        var end = it.rounds[it.rounds.length-1]?.date || "";
        var dateTxt = start && end && start!==end ? (start+" → "+end) : (end||start||"");
        var edsTag = (it.rounds[0] && it.rounds[0].scoreOrigin) ? fmtEds(it.rounds[0].scoreOrigin) : '';
        // Extract link from extra rounds
        var eventLinks = null;
        for (var li = 0; li < it.rounds.length; li++) {
          if (it.rounds[li]._links) { eventLinks = it.rounds[li]._links; break; }
        }
        var linkTag = fmtLinks(eventLinks, 11);
        // Extract pill from rounds
        var eventPill = '';
        for (var pi = 0; pi < it.rounds.length; pi++) {
          if (it.rounds[pi]._pill) { eventPill = it.rounds[pi]._pill; break; }
        }
        var pillTag = fmtPills(eventPill);
        html += '<tr>' +
          '<td><button type="button" class="courseBtn" data-toggle="'+rowId+'">'+it.name+edsTag+pillTag+'</button>'+linkTag+'<div class="sub muted">'+dateTxt+'</div></td>' +
          '<td><b>'+it.course+'</b></td>' +
          '<td class="right"><b>'+it.rounds.length+'</b></td>' +
          '<td class="muted">'+dateTxt+'</td>' +
        '</tr>';

        // details with rounds (chronological for comparison)
        var rounds = it.rounds.slice().sort(function(a,b){ return a.dateSort - b.dateSort; });
        var pillColors = ['#64748b','#94a3b8','#78909c','#546e7a'];

        // --- Summary table ---
        var totalGross = 0, totalStb = 0, totalHoles = 0, roundsWithGross = 0;
        rounds.forEach(function(r){ 
          if (r.gross != null) { totalGross += r.gross; roundsWithGross++; }
          if (r.stb != null) totalStb += r.stb;
          totalHoles += (r.holeCount || 18);
        });
        var totalPar = 0;
        rounds.forEach(function(r){ if (r.par) totalPar += r.par; });
        var toParTotal = totalPar ? totalGross - totalPar : null;
        var toParStr = toParTotal != null ? (toParTotal > 0 ? '+' + toParTotal : (toParTotal === 0 ? 'E' : '' + toParTotal)) : '';

        var summaryHtml = '';
        summaryHtml += '<table class="dt-compact" style="table-layout:fixed">';
        summaryHtml += '<colgroup><col style="width:17%"><col style="width:8%"><col style="width:9%"><col style="width:15%"><col style="width:11%"><col style="width:14%"><col style="width:10%"><col style="width:10%"></colgroup>';
        summaryHtml += '<thead><tr>';
        summaryHtml += '<th>Volta</th>';
        summaryHtml += '<th class="right">Bur.</th>';
        summaryHtml += '<th class="right">HCP</th>';
        summaryHtml += '<th>Tee</th>';
        summaryHtml += '<th class="right">Dist.</th>';
        summaryHtml += '<th class="right">Gross</th>';
        summaryHtml += '<th class="right">Stb</th>';
        summaryHtml += '<th class="right">SD</th>';
        summaryHtml += '</tr></thead><tbody>';

        rounds.forEach(function(r, j){
          var dateFmt = r.date ? r.date.substring(0,5).replace('-','/') : ('V'+(j+1));
          var hx = teeHex(r.tee||""), fg = teeFg(hx);
          var teeHtml = (r.tee||"") ? '<span class="teePill" style="background:'+hx+';color:'+fg+'">'+r.tee+'</span>' : "";
          var sdClass = '';
          if (r.sd != null) sdClass = sdClassByHcp(Number(r.sd), r.hi);

          var scoreLabel = '';
          if (String(r.scoreId).indexOf('extra_') === 0) scoreLabel = '<span class="muted" style="font-size:10px">Extra (não FPG)</span>';
          else if (String(r.scoreId).indexOf('treino_') === 0) scoreLabel = '<span class="muted" style="font-size:10px">Game Book</span>';
          else scoreLabel = '<span class="muted" style="font-size:10px">#'+r.scoreId+'</span>';

          summaryHtml += '<tr class="roundRow" data-score="'+r.scoreId+'" data-hascard="'+(r.hasCard?'1':'0')+'">';
          summaryHtml += '<td><span class="tee-date tournPill" data-pill-for="'+rowId+'_sc_'+j+'" style="background:'+hx+';color:'+fg+';cursor:pointer">'+dateFmt+'</span> '+scoreLabel+'</td>';
          summaryHtml += '<td class="right">'+(r.holeCount==9?'<span class="hb hb9">9</span>':'<span class="hb hb18">18</span>')+'</td>';
          summaryHtml += '<td class="right">'+(r.hi??"")+'</td>';
          summaryHtml += '<td>'+teeHtml+'</td>';
          summaryHtml += '<td class="right muted">'+(r.meters ? (r.meters+'m') : '')+'</td>';
          summaryHtml += '<td class="right">'+fmtGross(r.gross, r.par)+'</td>';
          summaryHtml += '<td class="right">'+fmtStb(r.stb, r.holeCount)+'</td>';
          summaryHtml += '<td class="right">'+fmtSd(r)+'</td>';
          summaryHtml += '</tr>';
          // Individual scorecard container (hidden by default)
          summaryHtml += '<tr class="tournScRow" id="'+rowId+'_sc_'+j+'" style="display:none"><td colspan="8" style="padding:0;background:#fafafa">';
          summaryHtml += '<div class="scHost" style="margin:6px 8px;border:1px solid var(--line);border-radius:14px;background:#fff;padding:10px;overflow:hidden">';
          var tournFrag = FRAG[String(r.scoreId)] || '<div class="muted" style="padding:10px">Scorecard não disponível</div>';
          // Inject eclectic rows into scorecard table
          var tournEcRows = buildEcleticRows(r.scoreId);
          if (tournEcRows && tournFrag.indexOf('data-sc-table') > -1) {
            tournFrag = tournFrag.replace('</tbody></table>', tournEcRows + '</tbody></table>');
          }
          summaryHtml += tournFrag;
          summaryHtml += '</div></td></tr>';
        });

        // Total row
        if (roundsWithGross > 1) {
          var toParCls = toParTotal > 0 ? 'pos' : (toParTotal < 0 ? 'neg' : '');
          summaryHtml += '<tr style="background:#f8fafc;font-weight:700;border-top:2px solid #cbd5e1">';
          summaryHtml += '<td colspan="5" class="right" style="font-weight:700;color:#475569">Total ('+roundsWithGross+' voltas)</td>';
          summaryHtml += '<td class="right"><b>'+totalGross+'</b><span class="score-delta '+toParCls+'">'+toParStr+'</span></td>';
          summaryHtml += '<td class="right">'+totalStb+'</td>';
          summaryHtml += '<td></td>';
          summaryHtml += '</tr>';
        }
        summaryHtml += '</tbody></table>';

        // --- Comparative scorecard ---
        var compHtml = buildTournamentComparison(rounds, pillColors);

        // Extract link from rounds
        var detailLinks = null;
        for (var dli = 0; dli < rounds.length; dli++) {
          if (rounds[dli]._links) { detailLinks = rounds[dli]._links; break; }
        }

        html += '<tr class="details' + ((openState[rowId]) ? ' open' : '') + '" id="'+rowId+'"><td class="inner" colspan="4">' +
          '<div class="innerWrap">' +
            '<div class="actions" style="margin-top:8px">' +
              '<button type="button" class="btn btnPdf" data-printcourse="' + rowId + '" title="Guardar PDF">📄 PDF</button>' +
              (detailLinks ? fmtLinkBtns(detailLinks) : '') +
            '</div>' +
            '<div style="margin-top:10px">' + summaryHtml + '</div>' +
            (compHtml ? '<div style="margin-top:12px">' + compHtml + '</div>' : '') +
          '</div></td></tr>';
      });

      tbody.innerHTML = html;
      return;
      } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="11" style="padding:16px" class="muted">Erro a renderizar vista por data: '+esc(String(e && e.message ? e.message : e))+'</td></tr>';
        return;
      }
    }

    // ---- vista por campo ----
    var isSimple = (view === "by_course");
    var list = DATA.slice();
    if (term) list = list.filter(function(x){ return norm2(x.course).indexOf(term) >= 0; });

    if (sort === "name_asc") list.sort(function(a,b){ return a.course.localeCompare(b.course); });
    else if (sort === "last_desc") list.sort(function(a,b){ return (b.lastDateSort - a.lastDateSort) || (b.count - a.count) || a.course.localeCompare(b.course); });
    else list.sort(function(a,b){ var d = (b.count - a.count); return d !== 0 ? d : a.course.localeCompare(b.course); });

    setThead('<tr><th style="width:26%">Campo</th><th class="right" style="width:6%">Voltas</th><th style="width:9%">Última</th><th class="right" style="width:6%">Bur.</th><th class="right" style="width:7%">HCP</th><th style="width:12%">Tee</th><th class="right" style="width:8%">Dist.</th><th class="right" style="width:9%">Gross</th><th class="right" style="width:7%">Stb</th><th class="right" style="width:7%">SD</th></tr>',
    '<col style="width:26%"><col style="width:6%"><col style="width:9%"><col style="width:6%"><col style="width:7%"><col style="width:12%"><col style="width:8%"><col style="width:9%"><col style="width:7%"><col style="width:7%">');

    cCourses.textContent = list.length;
    cRounds.textContent = list.reduce(function(a,x){ return a + x.count; }, 0);

    var html = "";
    for (var i=0;i<list.length;i++){
      var c = list[i];
      var last = c.rounds[0];

      var rowId = "row_" + i;
      var currentTeeKey = isSimple ? "" : (teeFilter[rowId] || "");

      var ecHtml = "";
      var ecDetailHtml = "";
      if (!isSimple) {
      var ecList = EC[norm2(c.course)] || [];
      if (ecList.length){
        function sumAEc(arr, from, to) { var s=0; for(var ii=from;ii<to;ii++) if(arr[ii]!=null) s+=arr[ii]; return s; }
        function hexToRgba(hex, a) {
          hex = (hex||'').replace('#','');
          if (hex.length!==6) return 'rgba(128,128,128,'+a+')';
          var r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
          return 'rgba('+r+','+g+','+b+','+a+')';
        }
        var detAll = ECDET[norm2(c.course)] || {};
        var hsAll = HOLE_STATS[norm2(c.course)] || {};

        ecHtml += '<div class="ecBlock">';
        ecHtml += '<div class="ecTitle">Eclético (gross) por tee</div>';
        ecHtml += '<div class="ecHint">Clique num tee na tabela de buracos para ver análise e filtrar rondas.</div>';

        // === TABLE 1: Summary ===
        ecHtml += '<div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;margin-bottom:10px"><table class="ec-sum">';
        ecHtml += '<colgroup><col style="width:18%"><col style="width:10%"><col style="width:10%"><col style="width:14%"><col style="width:12%"><col style="width:14%"><col style="width:14%"></colgroup>';
        ecHtml += '<thead><tr><th>Tee</th><th class="r">Rondas</th><th class="r">Par</th><th class="r">Eclético</th><th class="r">vs Par</th><th class="r">Melhor Gr.</th><th class="r">Média Gr.</th></tr></thead>';
        ecHtml += '<tbody>';
        for (var ei=0;ei<ecList.length;ei++){
          var ex = ecList[ei];
          var exHx = teeHex(ex.teeName);
          var exFg = teeFg(exHx);
          var exTk = normKey2(ex.teeName);
          var exHs = hsAll[exTk];
          var exNr = exHs ? exHs.nRounds : '';
          var exBest = exHs && exHs.bestRound ? exHs.bestRound.gross : '-';
          var exAvg = exHs && exHs.avgGross != null ? exHs.avgGross.toFixed(1) : '-';
          var exTp = (ex.toPar==null)?'':(ex.toPar>0?('+'+ex.toPar):(''+ex.toPar));
          var exTpCol = ex.toPar==null?'':(ex.toPar>0?'#dc2626':(ex.toPar<0?'#16a34a':'#94a3b8'));
          ecHtml += '<tr>';
          ecHtml += '<td><span class="teePill" style="background:'+exHx+';color:'+exFg+'">'+esc2(ex.teeName)+'</span></td>';
          ecHtml += '<td class="r" style="font-weight:600">'+exNr+'</td>';
          ecHtml += '<td class="r">'+ex.totalPar+'</td>';
          ecHtml += '<td class="r" style="font-weight:800;color:#0369a1;font-size:13px">'+ex.totalGross+'</td>';
          ecHtml += '<td class="r" style="color:'+exTpCol+';font-weight:700">'+exTp+'</td>';
          ecHtml += '<td class="r" style="font-weight:600">'+exBest+'</td>';
          ecHtml += '<td class="r">'+exAvg+'</td>';
          ecHtml += '</tr>';
        }
        ecHtml += '</tbody></table></div>';

        // === TABLE 2: Scorecard hole-by-hole ===
        // Reference tee for S.I. and Par rows (prefer 18-hole)
        var refEc = null;
        for (var ri=0;ri<ecList.length;ri++) { if (ecList[ri].holeCount===18) { refEc=ecList[ri]; break; } }
        if (!refEc) refEc = ecList[0];
        var refDet = detAll[refEc.teeKey] || refEc;
        var refSi = refDet.si || [];
        var refHoles = refDet.holes || [];
        var refParArr = [];
        for (var rh=0;rh<18;rh++) { refParArr.push(refHoles[rh] ? refHoles[rh].par : null); }

        var colSpan = 21; // label + 9 + out + 9 + in + total

        ecHtml += '<div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;margin-top:10px">';
        ecHtml += '<div class="sc-bar-head"><span>Scorecard eclético — buracos</span></div>';
        ecHtml += '<div style="overflow-x:auto"><table class="ec-sc">';
        // Header
        ecHtml += '<thead><tr><th class="row-label" style="border-bottom:2px solid #cbd5e1">Tee</th>';
        for (var hh=1;hh<=9;hh++) ecHtml += '<th>'+hh+'</th>';
        ecHtml += '<th class="col-out">Out</th>';
        for (var hh=10;hh<=18;hh++) ecHtml += '<th>'+hh+'</th>';
        ecHtml += '<th class="col-in">In</th><th class="col-total">TOTAL</th></tr></thead><tbody>';

        // S.I. row
        var hasSI = refSi.some(function(v){ return v!=null; });
        if (hasSI) {
          ecHtml += '<tr><td class="row-label" style="color:#b0b8c4;font-size:9px">S.I.</td>';
          for (var sh=0;sh<9;sh++) ecHtml += '<td style="color:#9aab8e;font-size:10px">'+(refSi[sh]!=null?refSi[sh]:'')+'</td>';
          ecHtml += '<td class="col-out" style="color:#9aab8e;font-size:10px">'+sumAEc(refSi,0,9)+'</td>';
          for (var sh=9;sh<18;sh++) ecHtml += '<td style="color:#9aab8e;font-size:10px">'+(refSi[sh]!=null?refSi[sh]:'')+'</td>';
          ecHtml += '<td class="col-in" style="color:#9aab8e;font-size:10px">'+sumAEc(refSi,9,18)+'</td>';
          ecHtml += '<td class="col-total" style="color:#9aab8e;font-size:10px">'+sumAEc(refSi,0,18)+'</td></tr>';
        }

        // Par row (separator)
        ecHtml += '<tr class="sep-row"><td class="row-label" style="color:#94a3b8;font-weight:600">Par</td>';
        for (var ph=0;ph<9;ph++) ecHtml += '<td>'+(refParArr[ph]!=null?refParArr[ph]:'')+'</td>';
        ecHtml += '<td class="col-out" style="font-weight:700">'+sumAEc(refParArr,0,9)+'</td>';
        for (var ph=9;ph<18;ph++) ecHtml += '<td>'+(refParArr[ph]!=null?refParArr[ph]:'')+'</td>';
        ecHtml += '<td class="col-in" style="font-weight:700">'+sumAEc(refParArr,9,18)+'</td>';
        ecHtml += '<td class="col-total">'+sumAEc(refParArr,0,18)+'</td></tr>';

        // Tee rows
        for (var ti=0;ti<ecList.length;ti++){
          var tx = ecList[ti];
          var tTk = normKey2(tx.teeName);
          var tHx = teeHex(tx.teeName);
          var tFg = teeFg(tHx);
          var tDet = detAll[tTk] || tx;
          var tHoles = tDet.holes || [];
          var tHc = tDet.holeCount || tHoles.length;
          var tIs9 = tHc === 9;
          var tParArr = [];
          for (var tp=0;tp<tHc;tp++) tParArr.push(tHoles[tp]?tHoles[tp].par:null);
          var isActive = currentTeeKey === tTk;
          var tBg = hexToRgba(tHx, 0.12);

          // Eclectic scores row
          ecHtml += '<tr class="ec-tee-row'+(isActive?' ec-active':'')+'" data-ec-teekey="'+tTk+'" data-ec-for="'+rowId+'" style="background:'+tBg+'">';
          ecHtml += '<td class="row-label"><span class="ec-arrow">'+(isActive?'▼':'▶')+'</span><span class="teePill" style="background:'+tHx+';color:'+tFg+'">'+esc2(tx.teeName)+'</span><span style="color:#94a3b8;font-size:9px;margin-left:2px">('+tx.holeCount+'b)</span></td>';

          // Front 9
          var ecScores = [];
          var ecSum = 0;
          for (var th=0;th<18;th++){
            if (th < tHc) {
              var hObj = tHoles[th];
              var ev = hObj ? hObj.best : null;
              var pv = hObj ? hObj.par : null;
              ecScores.push(ev);
              if (ev!=null) ecSum += ev;
              var cls = (ev!=null && pv!=null) ? scClass(ev,pv) : '';
              var ttl = '';
              if (hObj && hObj.from) ttl = (hObj.from.date||'')+' · #'+(hObj.from.scoreId||'');
              ecHtml += '<td title="'+ttl+'">';
              if (ev!=null) ecHtml += '<span class="sc-score '+cls+'">'+ev+'</span>';
              ecHtml += '</td>';
            } else {
              ecScores.push(null);
              ecHtml += '<td style="color:#d4d4d4">—</td>';
            }
            if (th===8) {
              var outE = sumAEc(ecScores,0,9);
              var outP = sumAEc(tParArr,0,Math.min(tHc,9));
              var outD = outE - outP;
              if (tIs9) {
                ecHtml += '<td class="col-out" style="font-weight:700">'+outE+'<span class="sc-topar '+(outD>0?'sc-topar-pos':(outD<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(outD>0?'+':'')+outD+'</span></td>';
              } else {
                ecHtml += '<td class="col-out" style="font-weight:700">'+outE+'<span class="sc-topar '+(outD>0?'sc-topar-pos':(outD<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(outD>0?'+':'')+outD+'</span></td>';
              }
            }
          }
          // In + Total
          if (tIs9) {
            ecHtml += '<td class="col-in" style="color:#d4d4d4">—</td>';
            var totE = sumAEc(ecScores,0,tHc);
            var totP = sumAEc(tParArr,0,tHc);
            var totD = totE - totP;
            ecHtml += '<td class="col-total" style="font-weight:900;font-size:13px">'+totE+'<span class="sc-topar '+(totD>0?'sc-topar-pos':(totD<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(totD>0?'+':'')+totD+'</span></td>';
          } else {
            var inE = sumAEc(ecScores,9,18);
            var inP = sumAEc(tParArr,9,18);
            var inD = inE - inP;
            ecHtml += '<td class="col-in" style="font-weight:700">'+inE+'<span class="sc-topar '+(inD>0?'sc-topar-pos':(inD<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(inD>0?'+':'')+inD+'</span></td>';
            var totE2 = sumAEc(ecScores,0,18);
            var totP2 = sumAEc(tParArr,0,18);
            var totD2 = totE2 - totP2;
            ecHtml += '<td class="col-total" style="font-weight:900;font-size:13px">'+totE2+'<span class="sc-topar '+(totD2>0?'sc-topar-pos':(totD2<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(totD2>0?'+':'')+totD2+'</span></td>';
          }
          ecHtml += '</tr>';

          // === Individual round score rows for this tee ===
          var teeRnds = c.rounds.filter(function(rr){ return normKey2(rr.tee) === tTk && HOLES[rr.scoreId]; });
          teeRnds.sort(function(a,b){ return b.dateSort - a.dateSort; }); // newest first
          for (var tri = 0; tri < teeRnds.length; tri++) {
            var tr = teeRnds[tri];
            var trH = HOLES[tr.scoreId];
            if (!trH || !trH.g) continue;
            var trG = trH.g;
            var trHc = trH.hc || trG.length;
            var trDate = tr.date ? tr.date.substring(0,5).replace('-','/') : ('R'+(tri+1));
            var trBg = hexToRgba(tHx, 0.04);
            ecHtml += '<tr style="background:'+trBg+'">';
            ecHtml += '<td class="row-label" style="font-size:10px"><span class="sc-pill" style="background:'+tHx+';color:'+tFg+';font-size:9px;padding:1px 6px">'+trDate+'</span></td>';
            for (var trh = 0; trh < 18; trh++) {
              if (trh < trHc) {
                var trGv = trG[trh], trPv = tParArr[trh];
                var trCls = (trGv != null && trGv > 0 && trPv != null) ? scClass(trGv, trPv) : '';
                ecHtml += '<td>'+((trGv != null && trGv > 0) ? '<span class="sc-score '+trCls+'" style="font-size:10px;width:20px;height:20px">'+trGv+'</span>' : '<span style="color:#d4d4d4;font-size:9px">NR</span>')+'</td>';
              } else {
                ecHtml += '<td style="color:#d4d4d4">—</td>';
              }
              if (trh === 8) {
                var trOut = sumAEc(trG, 0, Math.min(trHc, 9));
                var trOutP = sumAEc(tParArr, 0, Math.min(trHc, 9));
                var trOutD = trOut - trOutP;
                ecHtml += '<td class="col-out" style="font-weight:600;font-size:10px">'+trOut+'<span class="sc-topar '+(trOutD>0?'sc-topar-pos':(trOutD<0?'sc-topar-neg':'sc-topar-zero'))+'" style="font-size:9px">'+(trOutD>0?'+':'')+trOutD+'</span></td>';
              }
            }
            if (trHc <= 9) {
              ecHtml += '<td class="col-in" style="color:#d4d4d4">—</td>';
              var trTot = sumAEc(trG, 0, trHc);
              var trTotP = sumAEc(tParArr, 0, trHc);
              var trTotD = trTot - trTotP;
              ecHtml += '<td class="col-total" style="font-weight:700;font-size:11px">'+trTot+'<span class="sc-topar '+(trTotD>0?'sc-topar-pos':(trTotD<0?'sc-topar-neg':'sc-topar-zero'))+'" style="font-size:9px">'+(trTotD>0?'+':'')+trTotD+'</span></td>';
            } else {
              var trIn = sumAEc(trG, 9, trHc);
              var trInP = sumAEc(tParArr, 9, 18);
              var trInD = trIn - trInP;
              ecHtml += '<td class="col-in" style="font-weight:600;font-size:10px">'+trIn+'<span class="sc-topar '+(trInD>0?'sc-topar-pos':(trInD<0?'sc-topar-neg':'sc-topar-zero'))+'" style="font-size:9px">'+(trInD>0?'+':'')+trInD+'</span></td>';
              var trTot2 = sumAEc(trG, 0, trHc);
              var trTotP2 = sumAEc(tParArr, 0, 18);
              var trTotD2 = trTot2 - trTotP2;
              ecHtml += '<td class="col-total" style="font-weight:700;font-size:11px">'+trTot2+'<span class="sc-topar '+(trTotD2>0?'sc-topar-pos':(trTotD2<0?'sc-topar-neg':'sc-topar-zero'))+'" style="font-size:9px">'+(trTotD2>0?'+':'')+trTotD2+'</span></td>';
            }
            ecHtml += '</tr>';
          }

          // Detail row (expandable - shown only for active tee)
          ecHtml += '<tr class="ec-detail-row'+(isActive?' open':'')+'"><td colspan="'+colSpan+'">';
          if (isActive) {
            // Compute per-tee performance KPIs
            var teeRounds = c.rounds.filter(function(r){ return normKey2(r.tee) === tTk; });
            var tR18 = teeRounds.filter(function(r){ return r.holeCount==18 && (r.sd!=null||r.stb!=null); });
            var tR9 = teeRounds.filter(function(r){ return r.holeCount==9 && (r.sd!=null||r.stb!=null); });
            var tAllNorm = [];
            tR18.forEach(function(r){ tAllNorm.push({sd:r.sd!=null?Number(r.sd):null, stb:r.stb!=null?Number(r.stb):null, gross:r.gross?Number(r.gross):null, par:r.par?Number(r.par):null, holeCount:18, date:r.date||'', dateSort:r.dateSort}); });
            tR9.forEach(function(r){ tAllNorm.push({sd:r.sd!=null?Number(r.sd):null, stb:r.stb!=null?Number(r.stb)+17:null, holeCount:9, date:r.date||'', dateSort:r.dateSort}); });
            tAllNorm.sort(function(a,b){ return a.dateSort - b.dateSort; });
            var tSdArr = tAllNorm.map(function(r){return r.sd;}).filter(function(x){return x!=null&&!isNaN(x);});
            var tStbArr = tAllNorm.map(function(r){return r.stb;}).filter(function(x){return x!=null&&!isNaN(x);});
            var tAvg = function(a){return a.length?(a.reduce(function(s,v){return s+v;},0)/a.length):null;};
            var tMin = function(a){return a.length?Math.min.apply(null,a):null;};
            var tMax = function(a){return a.length?Math.max.apply(null,a):null;};
            var tTrSlope=0,tTrLabel='➡️ Estável',tTrCls='trend-flat';
            if(tSdArr.length>=3){var tn=tSdArr.length,tsx=0,tsy=0,tsxy=0,tsx2=0;for(var tii=0;tii<tn;tii++){tsx+=tii;tsy+=tSdArr[tii];tsxy+=tii*tSdArr[tii];tsx2+=tii*tii;}tTrSlope=(tn*tsxy-tsx*tsy)/(tn*tsx2-tsx*tsx);if(tTrSlope<-0.3){tTrLabel='📈 A melhorar';tTrCls='trend-up';}else if(tTrSlope>0.3){tTrLabel='📉 A piorar';tTrCls='trend-down';}}
            var has9h = tR9.length > 0;

            ecHtml += '<div class="ec-detail-inner">';
            ecHtml += '<div class="caTitle">Análise de Performance — '+esc2(tx.teeName)+(has9h?' <span style="font-size:11px;color:#94a3b8">(Stb 9h: +17)</span>':'')+'</div>';
            ecHtml += '<div class="caKpis">';
            if (tSdArr.length>=2) {
              ecHtml += '<div class="caKpi"><div class="caKpiVal">'+tAvg(tSdArr).toFixed(1)+'</div><div class="caKpiLbl">Média SD</div></div>';
              ecHtml += '<div class="caKpi"><div class="caKpiVal best">'+tMin(tSdArr).toFixed(1)+'</div><div class="caKpiLbl">Melhor SD</div></div>';
              ecHtml += '<div class="caKpi"><div class="caKpiVal worst">'+tMax(tSdArr).toFixed(1)+'</div><div class="caKpiLbl">Pior SD</div></div>';
            }
            if (tStbArr.length>=2) {
              ecHtml += '<div class="caKpi"><div class="caKpiVal">'+tAvg(tStbArr).toFixed(1)+'</div><div class="caKpiLbl">Média Stb</div></div>';
              ecHtml += '<div class="caKpi"><div class="caKpiVal best">'+tMax(tStbArr)+'</div><div class="caKpiLbl">Melhor Stb</div></div>';
            }
            ecHtml += '<div class="caKpi"><div class="caKpiVal">'+teeRounds.length+'</div><div class="caKpiLbl">Rondas'+(has9h?' ('+tR18.length+'×18h + '+tR9.length+'×9h)':'')+'</div></div>';
            if (tSdArr.length>=3) {
              ecHtml += '<div class="caKpi '+tTrCls+'"><div class="caKpiVal">'+tTrLabel+'</div><div class="caKpiLbl">Tendência SD</div></div>';
            }
            ecHtml += '</div>'; // caKpis

            // Conclusion
            var tGross18 = tAllNorm.filter(function(r){return r.gross!=null&&r.par!=null;});
            var tConcParts = [];
            if (tGross18.length>=2) {
              var tAvgG = tAvg(tGross18.map(function(r){return r.gross;}));
              var tAvgP = tAvg(tGross18.map(function(r){return r.par;}));
              var tAvgD = tAvgG - tAvgP;
              tConcParts.push('Média: <b>'+tAvgG.toFixed(0)+'</b> ('+((tAvgD>=0?'+':'')+tAvgD.toFixed(0))+' vs par).');
              var tBestG = tMin(tGross18.map(function(r){return r.gross;}));
              tConcParts.push('Melhor: <b>'+tBestG+'</b>.');
            }
            if (tStbArr.length>=2) {
              var tAvgStb = tAvg(tStbArr);
              if (tAvgStb>=36) tConcParts.push('Stb <b style="color:#16a34a">muito bom</b> ('+tAvgStb.toFixed(0)+').');
              else if (tAvgStb>=30) tConcParts.push('Stb <b>sólido</b> ('+tAvgStb.toFixed(0)+').');
              else tConcParts.push('Stb <b style="color:#d97706">a melhorar</b> ('+tAvgStb.toFixed(0)+').');
            }
            if (tConcParts.length) {
              ecHtml += '<div style="font-size:11px;color:#475569;padding:4px 0">💡 '+tConcParts.join(' ')+'</div>';
            }
            ecHtml += '</div>'; // ec-detail-inner

            // Top contributors
            var tWins = tDet.wins || {};
            var tTop = Object.keys(tWins).map(function(k){return{scoreId:k,n:tWins[k]};}).sort(function(a,b){return b.n-a.n;}).slice(0,5);
            if (tTop.length) {
              ecHtml += '<div class="ec-contrib">Melhores contribuições: ';
              tTop.forEach(function(t){
                var dd='';
                for(var ci=0;ci<tHoles.length;ci++){if(tHoles[ci].from&&tHoles[ci].from.scoreId===t.scoreId){dd=tHoles[ci].from.date||'';break;}}
                var label=dd?dd+' (+'+t.n+')':'+'+t.n+' buracos';
                ecHtml += '<a href="#" class="pill" data-score-id="'+t.scoreId+'" style="cursor:pointer;text-decoration:none" title="score_id '+t.scoreId+'">'+label+'</a> ';
              });
              ecHtml += '</div>';
            }
          }
          ecHtml += '</td></tr>';
        } // end tee rows

        ecHtml += '</tbody></table></div></div>'; // close ec-sc table
        ecHtml += '</div>'; // close ecBlock
      } else {
        ecHtml = '<div class="ecBlock"><div class="ecTitle">Eclético (gross) por tee</div><div class="ecHint">Sem dados suficientes.</div></div>';
      }
      } // end if (!isSimple) — eclectic

      var roundsView = c.rounds.slice();
      if (currentTeeKey) roundsView = roundsView.filter(function(r){ return normKey2(r.tee) === currentTeeKey; });
      var hf = holeFilter[rowId] || 0;
      if (hf === 9 || hf === 18) roundsView = roundsView.filter(function(r){ return Number(r.holeCount) === hf; });

      // --- Course performance analysis ---
      var courseStatsHtml = "";
      var holeAnalysisHtml = "";
      var bannerHtml = "";
      if (!isSimple) {
      var statsR18 = roundsView.filter(function(r){ return r.holeCount == 18 && (r.sd != null || r.stb != null); });
      var statsR9 = roundsView.filter(function(r){ return r.holeCount == 9 && (r.sd != null || r.stb != null); });
      courseStatsHtml = "";
      // Need at least 2 rounds total (any mix of 9/18)
      if (statsR18.length + statsR9.length >= 2) {
        // Normalize all to 18-hole equivalent
        var allNorm = [];
        statsR18.forEach(function(r){
          allNorm.push({ sd: r.sd != null ? Number(r.sd) : null, stb: r.stb != null ? Number(r.stb) : null, hi: r.hi, tee: r.tee || '?', date: r.date || '', dateSort: r.dateSort, holeCount: 18, gross: r.gross ? Number(r.gross) : null, par: r.par ? Number(r.par) : null });
        });
        statsR9.forEach(function(r){
          allNorm.push({ sd: r.sd != null ? Number(r.sd) : null, stb: r.stb != null ? Number(r.stb) + 17 : null, hi: r.hi, tee: r.tee || '?', date: r.date || '', dateSort: r.dateSort, holeCount: 9, gross: null, par: null });
        });
        allNorm.sort(function(a,b){ return a.dateSort - b.dateSort; });

        var sdArr = allNorm.map(function(r){ return r.sd; }).filter(function(x){ return x != null && !isNaN(x); });
        var stbArr = allNorm.map(function(r){ return r.stb; }).filter(function(x){ return x != null && !isNaN(x); });

        var avg = function(a){ return a.length ? (a.reduce(function(s,v){return s+v;},0)/a.length) : null; };
        var min2 = function(a){ return a.length ? Math.min.apply(null,a) : null; };
        var max2 = function(a){ return a.length ? Math.max.apply(null,a) : null; };

        // Trend: linear regression on SD (chronological)
        var trendSlope = 0, trendLabel = "➡️ Estável", trendCls = "trend-flat";
        if (sdArr.length >= 3) {
          var n2 = sdArr.length, sx2=0, sy2=0, sxy=0, sx22=0;
          for (var ti=0; ti<n2; ti++){ sx2+=ti; sy2+=sdArr[ti]; sxy+=ti*sdArr[ti]; sx22+=ti*ti; }
          trendSlope = (n2*sxy - sx2*sy2) / (n2*sx22 - sx2*sx2);
          if (trendSlope < -0.3) { trendLabel = "📈 A melhorar"; trendCls = "trend-up"; }
          else if (trendSlope > 0.3) { trendLabel = "📉 A piorar"; trendCls = "trend-down"; }
        }

        // By tee breakdown
        var teeStats = {};
        allNorm.forEach(function(r){
          var t = r.tee;
          if (!teeStats[t]) teeStats[t] = { tee: t, sds: [], stbs: [], grosses: [], pars: [], count: 0 };
          if (r.sd != null && !isNaN(r.sd)) teeStats[t].sds.push(r.sd);
          if (r.stb != null && !isNaN(r.stb)) teeStats[t].stbs.push(r.stb);
          if (r.gross != null && r.par != null) { teeStats[t].grosses.push(r.gross); teeStats[t].pars.push(r.par); }
          teeStats[t].count++;
        });
        var teeArr = Object.keys(teeStats).map(function(k){ return teeStats[k]; }).sort(function(a,b){ return b.count - a.count; });

        var has9 = statsR9.length > 0;

        courseStatsHtml += '<div class="courseAnalysis">';
        courseStatsHtml += '<div class="caTitle">Análise de Performance' + (has9 ? ' <span class="muted" style="font-size:11px">(Stb de 9h normalizado: +17)</span>' : '') + '</div>';

        // KPI cards row
        courseStatsHtml += '<div class="caKpis">';
        if (sdArr.length >= 2) {
          courseStatsHtml += '<div class="caKpi"><div class="caKpiVal">' + avg(sdArr).toFixed(1) + '</div><div class="caKpiLbl">Média SD</div></div>';
          courseStatsHtml += '<div class="caKpi"><div class="caKpiVal best">' + min2(sdArr).toFixed(1) + '</div><div class="caKpiLbl">Melhor SD</div></div>';
          courseStatsHtml += '<div class="caKpi"><div class="caKpiVal worst">' + max2(sdArr).toFixed(1) + '</div><div class="caKpiLbl">Pior SD</div></div>';
        }
        if (stbArr.length >= 2) {
          courseStatsHtml += '<div class="caKpi"><div class="caKpiVal">' + avg(stbArr).toFixed(1) + '</div><div class="caKpiLbl">Média Stb</div></div>';
          courseStatsHtml += '<div class="caKpi"><div class="caKpiVal best">' + max2(stbArr) + '</div><div class="caKpiLbl">Melhor Stb</div></div>';
        }
        courseStatsHtml += '<div class="caKpi"><div class="caKpiVal">' + allNorm.length + '</div><div class="caKpiLbl">Rondas' + (has9 ? ' ('+statsR18.length+'×18h + '+statsR9.length+'×9h)' : '') + '</div></div>';
        if (sdArr.length >= 3) {
          courseStatsHtml += '<div class="caKpi ' + trendCls + '"><div class="caKpiVal">' + trendLabel + '</div><div class="caKpiLbl">Tendência SD</div></div>';
        }
        courseStatsHtml += '</div>';

        // Conclusion / Insight
        var grossArr18 = allNorm.filter(function(r){ return r.gross != null && r.par != null; });
        var conclusionParts = [];
        if (grossArr18.length >= 2) {
          var avgG = avg(grossArr18.map(function(r){ return r.gross; }));
          var avgP = avg(grossArr18.map(function(r){ return r.par; }));
          var avgDiffG = avgG - avgP;
          var bestG = min2(grossArr18.map(function(r){ return r.gross; }));
          var bestP = grossArr18.reduce(function(a,r){ return r.gross < a.gross ? r : a; }).par;
          conclusionParts.push('Em média fazes <b>' + avgG.toFixed(0) + ' pancadas</b> neste campo (<b>' + (avgDiffG >= 0 ? '+' : '') + avgDiffG.toFixed(0) + ' vs par</b>).');
          conclusionParts.push('O teu melhor resultado foi <b>' + bestG + '</b> (par ' + bestP + ').');
        }
        if (stbArr.length >= 2) {
          var avgStb2 = avg(stbArr);
          if (avgStb2 >= 36) conclusionParts.push('A tua média Stableford de <b>' + avgStb2.toFixed(0) + '</b> mostra que jogas <b style="color:#16a34a">consistentemente bem</b> aqui.');
          else if (avgStb2 >= 30) conclusionParts.push('A tua média Stableford de <b>' + avgStb2.toFixed(0) + '</b> mostra desempenho <b>sólido</b>.');
          else conclusionParts.push('A tua média Stableford de <b>' + avgStb2.toFixed(0) + '</b> sugere <b style="color:#d97706">espaço para melhorar</b> neste campo.');
        }
        if (trendCls === 'trend-up') conclusionParts.push('A tendência é <b style="color:#16a34a">positiva</b> — estás a melhorar neste campo.');
        else if (trendCls === 'trend-down') conclusionParts.push('A tendência é <b style="color:#dc2626">negativa</b> — os resultados recentes pioraram.');
        if (teeArr.length > 1) {
          var bestTee = teeArr.reduce(function(a,b){
            var aAvg = a.stbs.length ? avg(a.stbs) : 0;
            var bAvg = b.stbs.length ? avg(b.stbs) : 0;
            return bAvg > aAvg ? b : a;
          });
          if (bestTee.stbs.length >= 2) conclusionParts.push('Os tees <b>' + bestTee.tee + '</b> são onde tens melhores resultados (Stb ' + avg(bestTee.stbs).toFixed(0) + ').');
        }
        if (conclusionParts.length > 0) {
          courseStatsHtml += '<div class="caConclusion">';
          courseStatsHtml += '<div class="caConcTitle">💡 Resumo</div>';
          courseStatsHtml += '<div class="caConcText">' + conclusionParts.join(' ') + '</div>';
          courseStatsHtml += '</div>';
        }

        courseStatsHtml += '</div>';
      }

      // --- Hole-by-hole analysis (when tee filter is active) ---
      holeAnalysisHtml = "";
      if (currentTeeKey) {
        var hsData = (HOLE_STATS[norm2(c.course)] || {})[currentTeeKey];
        if (hsData && hsData.holes && hsData.nRounds >= 2) {
          var fD = function(v){ return v >= 0 ? '+' + v.toFixed(1) : v.toFixed(1); };
          var fD2 = function(v){ return v >= 0 ? '+' + v.toFixed(2) : v.toFixed(2); };
          var pctF = function(n, tot){ return tot ? (n/tot*100).toFixed(0) : '0'; };

          holeAnalysisHtml += '<div class="holeAnalysis">';
          holeAnalysisHtml += '<div class="haTitle">📊 Análise de Performance <span class="muted" style="font-size:11px">(' + hsData.nRounds + ' rondas)</span></div>';

          // ============ SECTION 1: DIAGNOSIS CARDS ============
          var td = hsData.totalDist;
          var parOrBetter = td ? (td.eagle + td.birdie + td.par) : 0;
          var dblOrWorse = td ? (td.double + td.triple) : 0;
          var parOrBetterPct = td && td.total ? (parOrBetter / td.total * 100) : 0;
          var dblOrWorsePct = td && td.total ? (dblOrWorse / td.total * 100) : 0;

          holeAnalysisHtml += '<div class="haDiag">';

          // Card: Pancadas perdidas por volta
          var slColor = hsData.totalStrokesLost <= 5 ? '#16a34a' : (hsData.totalStrokesLost <= 12 ? '#d97706' : '#dc2626');
          holeAnalysisHtml += '<div class="haDiagCard">' +
            '<div class="haDiagIcon" style="background:' + slColor + '20;color:' + slColor + '">🎯</div>' +
            '<div class="haDiagBody">' +
              '<div class="haDiagVal" style="color:' + slColor + '">' + fD(hsData.totalStrokesLost) + '</div>' +
              '<div class="haDiagLbl">pancadas perdidas p/ volta vs par</div>' +
            '</div></div>';

          // Card: Par or better %
          var pobCol = parOrBetterPct >= 60 ? '#16a34a' : (parOrBetterPct >= 40 ? '#d97706' : '#dc2626');
          holeAnalysisHtml += '<div class="haDiagCard">' +
            '<div class="haDiagIcon" style="background:' + pobCol + '20;color:' + pobCol + '">⛳</div>' +
            '<div class="haDiagBody">' +
              '<div class="haDiagVal" style="color:' + pobCol + '">' + parOrBetterPct.toFixed(0) + '%</div>' +
              '<div class="haDiagLbl">par ou melhor (' + parOrBetter + '/' + (td?td.total:0) + ' buracos)</div>' +
            '</div></div>';

          // Card: Double or worse %
          var dowCol = dblOrWorsePct <= 5 ? '#16a34a' : (dblOrWorsePct <= 15 ? '#d97706' : '#dc2626');
          holeAnalysisHtml += '<div class="haDiagCard">' +
            '<div class="haDiagIcon" style="background:' + dowCol + '20;color:' + dowCol + '">💣</div>' +
            '<div class="haDiagBody">' +
              '<div class="haDiagVal" style="color:' + dowCol + '">' + dblOrWorsePct.toFixed(0) + '%</div>' +
              '<div class="haDiagLbl">double bogey ou pior (' + dblOrWorse + '/' + (td?td.total:0) + ')</div>' +
            '</div></div>';

          // Card: F9 vs B9 (if 18 holes)
          if (hsData.f9b9) {
            var fb = hsData.f9b9;
            var diff9 = fb.b9.strokesLost - fb.f9.strokesLost;
            var diff9Abs = Math.abs(diff9);
            var worse9 = diff9 > 0.3 ? 'Back 9' : (diff9 < -0.3 ? 'Front 9' : null);
            if (worse9) {
              holeAnalysisHtml += '<div class="haDiagCard">' +
                '<div class="haDiagIcon" style="background:#7c3aed20;color:#7c3aed">🔄</div>' +
                '<div class="haDiagBody">' +
                  '<div class="haDiagVal" style="color:#7c3aed">' + worse9 + '</div>' +
                  '<div class="haDiagLbl">custa mais ' + diff9Abs.toFixed(1) + ' panc./volta' +
                    ' (F9: ' + fD(fb.f9.strokesLost) + ', B9: ' + fD(fb.b9.strokesLost) + ')</div>' +
                '</div></div>';
            }
          }
          holeAnalysisHtml += '</div>';

          // ============ SECTION 2: BY PAR TYPE ============
          var bpt = hsData.byParType;
          var parTypes = [3,4,5].filter(function(p){ return bpt[p]; });
          if (parTypes.length > 1) {
            var worstPT = parTypes.reduce(function(a,b){ return (bpt[a].avgVsPar||0) > (bpt[b].avgVsPar||0) ? a : b; });
            
            holeAnalysisHtml += '<div class="haParTypes">';
            holeAnalysisHtml += '<div class="haSubTitle">Desempenho por Tipo de Buraco</div>';
            holeAnalysisHtml += '<div class="haParGrid">';
            parTypes.forEach(function(pt){
              var g = bpt[pt];
              var isWorst = pt === worstPT && g.avgVsPar > 0.3;
              var borderCol = isWorst ? '#dc2626' : '#e5e7eb';
              var bgCol = isWorst ? '#fef2f2' : '#fff';
              
              holeAnalysisHtml += '<div class="haParCard" style="border-color:' + borderCol + ';background:' + bgCol + '">';
              if (isWorst) holeAnalysisHtml += '<div class="haParAlert">⚠️ Área a melhorar</div>';
              holeAnalysisHtml += '<div class="haParHead">Par ' + pt + ' <span class="muted">(' + g.nHoles + ' buracos)</span></div>';
              
              var vpCol = g.avgVsPar <= 0 ? '#16a34a' : (g.avgVsPar <= 0.4 ? '#d97706' : '#dc2626');
              holeAnalysisHtml += '<div class="haParAvg" style="color:' + vpCol + '">' + fD2(g.avgVsPar) + ' <span style="font-size:10px;color:#64748b">média vs par</span></div>';
              holeAnalysisHtml += '<div class="haParStat">' + fD(g.strokesLostPerRound) + ' <span>pancadas/volta</span></div>';
              
              var distTotal = g.dist.eagle + g.dist.birdie + g.dist.par + g.dist.bogey + g.dist.double + g.dist.triple;
              if (distTotal > 0) {
                holeAnalysisHtml += '<div class="haParDist">';
                holeAnalysisHtml += '<div class="haParDistBar">';
                var segs = [
                  {n: g.dist.eagle + g.dist.birdie, cls: 'seg-birdie', label: 'Birdie+'},
                  {n: g.dist.par, cls: 'seg-par', label: 'Par'},
                  {n: g.dist.bogey, cls: 'seg-bogey', label: 'Bogey'},
                  {n: g.dist.double + g.dist.triple, cls: 'seg-double', label: 'Double+'}
                ];
                segs.forEach(function(sg){
                  if (sg.n > 0) {
                    var w = (sg.n / distTotal * 100);
                    holeAnalysisHtml += '<div class="haDistSeg ' + sg.cls + '" style="width:' + w.toFixed(1) + '%" title="' + sg.label + ': ' + sg.n + ' (' + w.toFixed(0) + '%)"></div>';
                  }
                });
                holeAnalysisHtml += '</div>';
                holeAnalysisHtml += '<div class="haParDistNums">' + pctF(g.dist.eagle+g.dist.birdie,distTotal) + '% birdie+ · ' + pctF(g.dist.par,distTotal) + '% par · ' + pctF(g.dist.bogey,distTotal) + '% bogey · ' + pctF(g.dist.double+g.dist.triple,distTotal) + '% double+</div>';
                holeAnalysisHtml += '</div>';
              }
              holeAnalysisHtml += '</div>';
            });
            holeAnalysisHtml += '</div></div>';
          }

          // ============ SECTION 3: STRENGTHS & WEAKNESSES ============
          var ranked = hsData.holes.filter(function(hd){ return hd.avg != null && hd.par != null && hd.n >= 2; })
            .map(function(hd){ return { h: hd.h, par: hd.par, si: hd.si, avg: hd.avg, diff: hd.avg - hd.par, n: hd.n, dist: hd.dist, strokesLost: hd.strokesLost }; })
            .sort(function(a,b){ return a.diff - b.diff; });

          if (ranked.length >= 4) {
            var strengths = ranked.filter(function(h){ return h.diff <= 0.15; }).slice(0, 4);
            var weaknesses = ranked.slice().sort(function(a,b){ return b.strokesLost - a.strokesLost; }).filter(function(h){ return h.strokesLost > 0.2; }).slice(0, 4);

            holeAnalysisHtml += '<div class="haTopWrap">';

            holeAnalysisHtml += '<div class="haTopCol haTopStrength">';
            holeAnalysisHtml += '<div class="haTopTitle"><span style="color:#16a34a">💪 Pontos Fortes</span></div>';
            if (strengths.length === 0) {
              holeAnalysisHtml += '<div class="haTopEmpty">Nenhum buraco consistentemente ao par ou melhor.</div>';
            } else {
              strengths.forEach(function(bh){
                var dStr = fD2(bh.diff);
                var pobN = bh.dist ? (bh.dist.eagle + bh.dist.birdie + bh.dist.par) : 0;
                var pobPct = bh.n ? Math.round(pobN / bh.n * 100) : 0;
                holeAnalysisHtml += '<div class="haTopItem">' +
                  '<div class="haTopHole">' + bh.h + '</div>' +
                  '<div class="haTopDetail">' +
                    '<div><b>Bur. ' + bh.h + '</b> · Par ' + bh.par + (bh.si ? ' · SI ' + bh.si : '') + '</div>' +
                    '<div class="haTopMeta">' +
                      '<span style="color:#16a34a;font-weight:700">' + dStr + '</span> média vs par · ' +
                      '<span style="color:#16a34a">' + pobPct + '% par ou melhor</span>' +
                    '</div>' +
                  '</div>' +
                '</div>';
              });
            }
            holeAnalysisHtml += '</div>';

            holeAnalysisHtml += '<div class="haTopCol haTopWeakness">';
            holeAnalysisHtml += '<div class="haTopTitle"><span style="color:#dc2626">🔻 Onde Perdes Mais Pancadas</span></div>';
            if (weaknesses.length === 0) {
              holeAnalysisHtml += '<div class="haTopEmpty">Sem buracos com perdas significativas.</div>';
            } else {
              weaknesses.forEach(function(wh){
                var dblN = wh.dist ? (wh.dist.double + wh.dist.triple) : 0;
                var dblPct = wh.n ? Math.round(dblN / wh.n * 100) : 0;
                holeAnalysisHtml += '<div class="haTopItem">' +
                  '<div class="haTopHole haTopHoleRed">' + wh.h + '</div>' +
                  '<div class="haTopDetail">' +
                    '<div><b>Bur. ' + wh.h + '</b> · Par ' + wh.par + (wh.si ? ' · SI ' + wh.si : '') + '</div>' +
                    '<div class="haTopMeta">' +
                      '<span style="color:#dc2626;font-weight:700">' + fD(wh.strokesLost) + '</span> pancadas/volta' +
                      (dblPct > 0 ? ' · <span style="color:#dc2626">' + dblPct + '% double+</span>' : '') +
                      ' · Média ' + wh.avg.toFixed(1) +
                    '</div>' +
                  '</div>' +
                '</div>';
              });
              var totalWeakSL = weaknesses.reduce(function(a,w){ return a + w.strokesLost; }, 0);
              holeAnalysisHtml += '<div class="haTopSummary">Estes ' + weaknesses.length + ' buracos custam-te <b>' + totalWeakSL.toFixed(1) + ' pancadas por volta</b> (' + Math.round(totalWeakSL / hsData.totalStrokesLost * 100) + '% do total).</div>';
            }
            holeAnalysisHtml += '</div>';

            holeAnalysisHtml += '</div>';
          }

          // ============ SECTION 4: SCORING DISTRIBUTION BAR ============
          if (td && td.total > 0) {
            var pct = function(v){ return (v / td.total * 100).toFixed(1); };
            holeAnalysisHtml += '<div class="haDistSection">';
            holeAnalysisHtml += '<div class="haSubTitle">Distribuição de Scoring</div>';
            holeAnalysisHtml += '<div class="haDistBar">';
            if (td.eagle > 0) holeAnalysisHtml += '<div class="haDistSeg seg-eagle" style="width:' + pct(td.eagle) + '%" title="Eagle+: ' + td.eagle + ' (' + pct(td.eagle) + '%)"></div>';
            if (td.birdie > 0) holeAnalysisHtml += '<div class="haDistSeg seg-birdie" style="width:' + pct(td.birdie) + '%" title="Birdie: ' + td.birdie + ' (' + pct(td.birdie) + '%)"></div>';
            if (td.par > 0) holeAnalysisHtml += '<div class="haDistSeg seg-par" style="width:' + pct(td.par) + '%" title="Par: ' + td.par + ' (' + pct(td.par) + '%)"></div>';
            if (td.bogey > 0) holeAnalysisHtml += '<div class="haDistSeg seg-bogey" style="width:' + pct(td.bogey) + '%" title="Bogey: ' + td.bogey + ' (' + pct(td.bogey) + '%)"></div>';
            if (td.double > 0) holeAnalysisHtml += '<div class="haDistSeg seg-double" style="width:' + pct(td.double) + '%" title="Double: ' + td.double + ' (' + pct(td.double) + '%)"></div>';
            if (td.triple > 0) holeAnalysisHtml += '<div class="haDistSeg seg-triple" style="width:' + pct(td.triple) + '%" title="Triple+: ' + td.triple + ' (' + pct(td.triple) + '%)"></div>';
            holeAnalysisHtml += '</div>';
            holeAnalysisHtml += '<div class="haDistLegend">';
            if (td.eagle > 0) holeAnalysisHtml += '<span class="haLeg"><span class="haLegDot seg-eagle"></span>Eagle+ ' + pct(td.eagle) + '%</span>';
            if (td.birdie > 0) holeAnalysisHtml += '<span class="haLeg"><span class="haLegDot seg-birdie"></span>Birdie ' + pct(td.birdie) + '%</span>';
            holeAnalysisHtml += '<span class="haLeg"><span class="haLegDot seg-par"></span>Par ' + pct(td.par) + '%</span>';
            if (td.bogey > 0) holeAnalysisHtml += '<span class="haLeg"><span class="haLegDot seg-bogey"></span>Bogey ' + pct(td.bogey) + '%</span>';
            if (td.double > 0) holeAnalysisHtml += '<span class="haLeg"><span class="haLegDot seg-double"></span>Double ' + pct(td.double) + '%</span>';
            if (td.triple > 0) holeAnalysisHtml += '<span class="haLeg"><span class="haLegDot seg-triple"></span>Triple+ ' + pct(td.triple) + '%</span>';
            holeAnalysisHtml += '</div></div>';
          }

          // ============ SECTION 5: HOLE-BY-HOLE TABLE ============
          var hc3 = hsData.holeCount;
          // Unified column styles matching buildTournamentComparison
          var haC = 'padding:4px 6px;text-align:center;font-size:11px;border-bottom:1px solid #f0f0f0';
          var haL = haC + ';text-align:left;padding-left:8px;border-right:2px solid #e2e8f0;white-space:nowrap;min-width:70px';
          var haOut = haC + ';background:#f4f6f8;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0';
          var haIn = haOut;
          var haTot = haC + ';background:#edf0f4;border-left:1px solid #dde1e7;font-weight:800';
          var is93 = hc3 === 9;
          var fe3 = is93 ? hc3 : 9;
          function sumH3(arr, from, to) { var s=0; for(var i=from;i<to;i++) if(arr[i]!=null) s+=arr[i]; return s; }

          holeAnalysisHtml += '<div class="haTableSection">';
          holeAnalysisHtml += '<div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff">';
          holeAnalysisHtml += '<div class="sc-bar-head"><span>Detalhe Buraco a Buraco</span></div>';
          holeAnalysisHtml += '<div style="overflow-x:auto">';
          holeAnalysisHtml += '<table style="width:100%;border-collapse:collapse;font-size:11px">';

          // Buraco row
          holeAnalysisHtml += '<tr style="background:#f8fafc">';
          holeAnalysisHtml += '<td style="'+haL+';font-weight:700;color:#64748b;font-size:11px;border-bottom:1px solid #e2e8f0">Buraco</td>';
          for (var hi3 = 0; hi3 < hc3; hi3++) {
            holeAnalysisHtml += '<td style="'+haC+';font-weight:700;color:#64748b;font-size:11px;border-bottom:1px solid #e2e8f0">' + (hi3+1) + '</td>';
            if (hi3 === fe3-1 && !is93) holeAnalysisHtml += '<td style="'+haOut+';font-weight:700;color:#64748b;font-size:10px;border-bottom:1px solid #e2e8f0">Out</td>';
          }
          holeAnalysisHtml += '<td style="'+(is93?haTot:haIn)+';font-weight:700;color:#64748b;font-size:10px;border-bottom:1px solid #e2e8f0">'+(is93?'TOTAL':'In')+'</td>';
          if (!is93) holeAnalysisHtml += '<td style="'+haTot+';color:#475569;font-size:11px;border-bottom:1px solid #e2e8f0">TOTAL</td>';
          holeAnalysisHtml += '</tr>';

          // SI row
          var hasSI = hsData.holes.some(function(hd){ return hd.si != null; });
          if (hasSI) {
            holeAnalysisHtml += '<tr>';
            holeAnalysisHtml += '<td style="'+haL+';color:#b0b8c4;font-size:10px;font-weight:400">S.I.</td>';
            for (var hi3 = 0; hi3 < hc3; hi3++) {
              holeAnalysisHtml += '<td style="'+haC+';color:#b0b8c4;font-size:10px">' + (hsData.holes[hi3].si || '') + '</td>';
              if (hi3 === fe3-1 && !is93) holeAnalysisHtml += '<td style="'+haOut+'"></td>';
            }
            holeAnalysisHtml += '<td style="'+(is93?haTot:haIn)+'"></td>';
            if (!is93) holeAnalysisHtml += '<td style="'+haTot+'"></td>';
            holeAnalysisHtml += '</tr>';
          }

          // Par row (separator)
          var sumPar3 = 0;
          var parArr3 = [];
          holeAnalysisHtml += '<tr>';
          holeAnalysisHtml += '<td style="'+haL+';font-weight:600;color:#94a3b8;font-size:11px;border-bottom:2px solid #cbd5e1">Par</td>';
          for (var hi3 = 0; hi3 < hc3; hi3++) {
            var pv = hsData.holes[hi3].par;
            parArr3.push(pv);
            if (pv != null) sumPar3 += pv;
            holeAnalysisHtml += '<td style="'+haC+';border-bottom:2px solid #cbd5e1">' + (pv != null ? pv : '') + '</td>';
            if (hi3 === fe3-1 && !is93) {
              holeAnalysisHtml += '<td style="'+haOut+';font-weight:700;border-bottom:2px solid #cbd5e1">'+sumH3(parArr3,0,fe3)+'</td>';
            }
          }
          var inPar3 = is93 ? sumPar3 : sumH3(parArr3,9,hc3);
          holeAnalysisHtml += '<td style="'+(is93?haTot:haIn)+';font-weight:700;border-bottom:2px solid #cbd5e1">'+inPar3+'</td>';
          if (!is93) holeAnalysisHtml += '<td style="'+haTot+';border-bottom:2px solid #cbd5e1">'+sumPar3+'</td>';
          holeAnalysisHtml += '</tr>';

          // Média row
          var sumAvg3 = 0, cntAvg3 = 0;
          var avgArr3 = [];
          holeAnalysisHtml += '<tr style="background:#f0f7ff">';
          holeAnalysisHtml += '<td style="'+haL+';color:#0369a1;font-weight:700">Média</td>';
          for (var hi3 = 0; hi3 < hc3; hi3++) {
            var hd = hsData.holes[hi3];
            avgArr3.push(hd.avg);
            if (hd.avg != null) { sumAvg3 += hd.avg; cntAvg3++; }
            var avgCls = '';
            if (hd.avg != null && hd.par != null) {
              var dif = hd.avg - hd.par;
              if (dif <= -0.3) avgCls = 'color:#16a34a;font-weight:800';
              else if (dif <= 0.15) avgCls = 'color:#0369a1;font-weight:700';
              else if (dif <= 0.5) avgCls = 'color:#d97706;font-weight:700';
              else avgCls = 'color:#dc2626;font-weight:800';
            }
            holeAnalysisHtml += '<td style="'+haC+';' + avgCls + '">' + (hd.avg != null ? hd.avg.toFixed(1) : '') + '</td>';
            if (hi3 === fe3-1 && !is93) {
              var outAvg3 = 0; for(var ai=0;ai<fe3;ai++) if(avgArr3[ai]!=null) outAvg3+=avgArr3[ai];
              var outPar3 = sumH3(parArr3,0,fe3);
              var outAvgTP3 = outAvg3 - outPar3;
              holeAnalysisHtml += '<td style="'+haOut+';font-weight:700">'+outAvg3.toFixed(1)+'<span class="sc-topar '+(outAvgTP3>0?'sc-topar-pos':(outAvgTP3<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(outAvgTP3>=0?'+':'')+outAvgTP3.toFixed(1)+'</span></td>';
            }
          }
          var totalAvg3 = cntAvg3 ? sumAvg3.toFixed(1) : '';
          if (!is93 && totalAvg3) {
            var inAvg3 = 0; for(var ai=9;ai<hc3;ai++) if(avgArr3[ai]!=null) inAvg3+=avgArr3[ai];
            var inAvgTP3 = inAvg3 - sumH3(parArr3,9,hc3);
            holeAnalysisHtml += '<td style="'+haIn+';font-weight:700">'+inAvg3.toFixed(1)+'<span class="sc-topar '+(inAvgTP3>0?'sc-topar-pos':(inAvgTP3<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(inAvgTP3>=0?'+':'')+inAvgTP3.toFixed(1)+'</span></td>';
            var totAvgTP3 = sumAvg3 - sumPar3;
            holeAnalysisHtml += '<td style="'+haTot+'">'+totalAvg3+'<span class="sc-topar '+(totAvgTP3>0?'sc-topar-pos':(totAvgTP3<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(totAvgTP3>=0?'+':'')+totAvgTP3.toFixed(1)+'</span></td>';
          } else {
            holeAnalysisHtml += '<td style="'+(is93?haTot:haIn)+';font-weight:800">' + totalAvg3 + '</td>';
            if (!is93) holeAnalysisHtml += '<td style="'+haTot+'">'+totalAvg3+'</td>';
          }
          holeAnalysisHtml += '</tr>';

          // Melhor row
          var sumBest3 = 0;
          var bestArr3 = [];
          holeAnalysisHtml += '<tr>';
          holeAnalysisHtml += '<td style="'+haL+';color:#16a34a;font-weight:700">Melhor</td>';
          for (var hi3 = 0; hi3 < hc3; hi3++) {
            var hd = hsData.holes[hi3];
            bestArr3.push(hd.best);
            if (hd.best != null) sumBest3 += hd.best;
            var cls3 = (hd.best != null && hd.par != null) ? scClass(hd.best, hd.par) : '';
            holeAnalysisHtml += '<td style="'+haC+'">';
            if (hd.best != null) holeAnalysisHtml += '<span class="sc-score ' + cls3 + '">' + hd.best + '</span>';
            holeAnalysisHtml += '</td>';
            if (hi3 === fe3-1 && !is93) {
              var outBest3 = sumH3(bestArr3,0,fe3);
              var outBP3 = sumH3(parArr3,0,fe3);
              var outBTP3 = outBest3 - outBP3;
              holeAnalysisHtml += '<td style="'+haOut+';font-weight:700;color:#16a34a">'+outBest3+'<span class="sc-topar '+(outBTP3>0?'sc-topar-pos':(outBTP3<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(outBTP3>=0?'+':'')+outBTP3+'</span></td>';
            }
          }
          var inBest3 = is93 ? sumBest3 : sumH3(bestArr3,9,hc3);
          var inBP3 = is93 ? sumPar3 : sumH3(parArr3,9,hc3);
          var inBTP3 = inBest3 - inBP3;
          holeAnalysisHtml += '<td style="'+(is93?haTot:haIn)+';font-weight:700;color:#16a34a">'+inBest3+'<span class="sc-topar '+(inBTP3>0?'sc-topar-pos':(inBTP3<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(inBTP3>=0?'+':'')+inBTP3+'</span></td>';
          if (!is93) {
            var totBTP3 = sumBest3 - sumPar3;
            holeAnalysisHtml += '<td style="'+haTot+';color:#16a34a">'+sumBest3+'<span class="sc-topar '+(totBTP3>0?'sc-topar-pos':(totBTP3<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(totBTP3>=0?'+':'')+totBTP3+'</span></td>';
          }
          holeAnalysisHtml += '</tr>';

          // Pior row
          var sumWorst3 = 0;
          var worstArr3 = [];
          holeAnalysisHtml += '<tr>';
          holeAnalysisHtml += '<td style="'+haL+';color:#dc2626;font-weight:700">Pior</td>';
          for (var hi3 = 0; hi3 < hc3; hi3++) {
            var hd = hsData.holes[hi3];
            worstArr3.push(hd.worst);
            if (hd.worst != null) sumWorst3 += hd.worst;
            var cls3 = (hd.worst != null && hd.par != null) ? scClass(hd.worst, hd.par) : '';
            holeAnalysisHtml += '<td style="'+haC+'">';
            if (hd.worst != null) holeAnalysisHtml += '<span class="sc-score ' + cls3 + '">' + hd.worst + '</span>';
            holeAnalysisHtml += '</td>';
            if (hi3 === fe3-1 && !is93) {
              var outWorst3 = sumH3(worstArr3,0,fe3);
              var outWP3 = sumH3(parArr3,0,fe3);
              var outWTP3 = outWorst3 - outWP3;
              holeAnalysisHtml += '<td style="'+haOut+';font-weight:700;color:#dc2626">'+outWorst3+'<span class="sc-topar '+(outWTP3>0?'sc-topar-pos':(outWTP3<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(outWTP3>=0?'+':'')+outWTP3+'</span></td>';
            }
          }
          var inWorst3 = is93 ? sumWorst3 : sumH3(worstArr3,9,hc3);
          var inWP3 = is93 ? sumPar3 : sumH3(parArr3,9,hc3);
          var inWTP3 = inWorst3 - inWP3;
          holeAnalysisHtml += '<td style="'+(is93?haTot:haIn)+';font-weight:700;color:#dc2626">'+inWorst3+'<span class="sc-topar '+(inWTP3>0?'sc-topar-pos':(inWTP3<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(inWTP3>=0?'+':'')+inWTP3+'</span></td>';
          if (!is93) {
            var totWTP3 = sumWorst3 - sumPar3;
            holeAnalysisHtml += '<td style="'+haTot+';color:#dc2626">'+sumWorst3+'<span class="sc-topar '+(totWTP3>0?'sc-topar-pos':(totWTP3<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(totWTP3>=0?'+':'')+totWTP3+'</span></td>';
          }
          holeAnalysisHtml += '</tr>';

          // Pancadas perdidas row (heatmap)
          var slArr3 = [];
          holeAnalysisHtml += '<tr style="background:#f0f7ff">';
          holeAnalysisHtml += '<td style="'+haL+';font-weight:800;color:#1e40af">Panc. perdidas</td>';
          for (var hi3 = 0; hi3 < hc3; hi3++) {
            var hd = hsData.holes[hi3];
            var sl = hd.strokesLost || 0;
            slArr3.push(sl);
            var slStr = sl >= 0 ? '+' + sl.toFixed(1) : sl.toFixed(1);
            var slBg = '';
            if (sl <= -0.3) slBg = 'background:rgba(22,163,74,0.2)';
            else if (sl <= 0.15) slBg = '';
            else if (sl <= 0.4) slBg = 'background:rgba(220,38,38,0.1)';
            else if (sl <= 0.7) slBg = 'background:rgba(220,38,38,0.2)';
            else slBg = 'background:rgba(220,38,38,0.35)';
            var slCol = sl <= -0.3 ? '#16a34a' : (sl <= 0.15 ? '#64748b' : '#dc2626');
            holeAnalysisHtml += '<td style="'+haC+';' + slBg + ';color:' + slCol + ';font-weight:700;font-size:10px">' + (hd.n > 0 ? slStr : '') + '</td>';
            if (hi3 === fe3-1 && !is93) {
              var outSL3 = 0; for(var si3=0;si3<fe3;si3++) outSL3+=slArr3[si3];
              var outSLCol = outSL3 <= 0 ? '#16a34a' : '#dc2626';
              holeAnalysisHtml += '<td style="'+haOut+';font-weight:700;font-size:10px;color:'+outSLCol+'">'+(outSL3>=0?'+':'')+outSL3.toFixed(1)+'</td>';
            }
          }
          var totalSL = hsData.totalStrokesLost;
          if (!is93) {
            var inSL3 = 0; for(var si3=9;si3<hc3;si3++) inSL3+=slArr3[si3];
            var inSLCol = inSL3 <= 0 ? '#16a34a' : '#dc2626';
            holeAnalysisHtml += '<td style="'+haIn+';font-weight:700;font-size:10px;color:'+inSLCol+'">'+(inSL3>=0?'+':'')+inSL3.toFixed(1)+'</td>';
          }
          holeAnalysisHtml += '<td style="'+haTot+';font-weight:900;font-size:11px;color:' + (totalSL <= 0 ? '#16a34a' : '#dc2626') + '">' + (totalSL >= 0 ? '+' : '') + totalSL.toFixed(1) + '</td>';
          holeAnalysisHtml += '</tr>';

          holeAnalysisHtml += '</table></div></div></div>';

          holeAnalysisHtml += '</div>';
        }
      }

      var candidate = detectMultiRoundCandidate(c.rounds);
      bannerHtml = "";
      if (candidate && !ignorePrompt[rowId]) {
        bannerHtml =
          '<div class="banner" data-banner="'+rowId+'">' +
            '<div class="meta"><b>Detetei possível torneio multi‑ronda</b>: ' + candidate.name + ' · ' + candidate.count + ' rondas</div>' +
            '<div class="actions">' +
              '<button type="button" class="btn btnGhost btnSmall applyGroup" data-for="'+rowId+'">Agrupar como torneio</button>' +
              '<button type="button" class="btn btnSmall ignoreGroup" data-for="'+rowId+'">Ignorar</button>' +
            '</div>' +
          '</div>';
      }
      } // end if (!isSimple) — analysis sections

      var roundsHtml = "";
      if (groupMode[rowId]) {
        var groups = buildGroupedRows(roundsView);
        groups.sort(function(a,b){
          var al = a.rounds[a.rounds.length-1]?.dateSort || 0;
          var bl = b.rounds[b.rounds.length-1]?.dateSort || 0;
          return bl - al;
        });
        groups.forEach(function(g){
          var n = g.name || "Torneio";
          roundsHtml +=
            '<tr class="grpRow"><td colspan="8">' +
              n + ' <span class="muted">(' + g.rounds.length + ' rondas)</span>' +
            '</td></tr>';
          var rr = g.rounds.slice().sort(function(a,b){ return b.dateSort - a.dateSort; });
          rr.forEach(function(r, idx){
            var roundLabel = "R" + (rr.length - idx);
            var hx = teeHex(r.tee||""), fg = teeFg(hx);
            var shortDate = (r.date||"").replace(/^(\d{2})-(\d{2})-\d{4}$/,"$1-$2");
            var datePillHtml = r.hasCard
              ? '<a class="dateLink" href="#" data-score="' + r.scoreId + '"><span class="tee-date" style="background:'+hx+';color:'+fg+'">'+shortDate+'</span></a>'
              : '<span class="tee-date" style="background:'+hx+';color:'+fg+'">'+shortDate+'</span>';
            var teeHtml = (r.tee||"") ? '<span class="teePill" style="background:'+hx+';color:'+fg+'">'+r.tee+'</span>' : "";
            var sdClass = '';
            var sdVal = r.sd ?? '';
            if (sdVal !== '') {
              var sdNum = Number(sdVal);
              sdClass = sdClassByHcp(sdNum, r.hi);
            }
            roundsHtml +=
              '<tr class="roundRow" data-score="' + r.scoreId + '" data-hascard="' + (r.hasCard ? "1" : "0") + '">' +
                '<td>' + datePillHtml + ' <span class="muted">· '+roundLabel+'</span>'+fmtEds(r.scoreOrigin)+'<div class="muted" style="font-size:10px">#'+r.scoreId+'</div></td>' +
                '<td class="right">' + (r.holeCount==9?'<span class="hb hb9">9</span>':'<span class="hb hb18">18</span>') + '</td>' +
                '<td class="right">' + (r.hi ?? "") + '</td>' +
                '<td>' + teeHtml + '</td>' +
                '<td class="right muted">' + (r.meters ? (r.meters + "m") : "") + '</td>' +
                '<td class="right">' + fmtGross(r.gross, r.par) + '</td>' +
                '<td class="right">' + fmtStb(r.stb, r.holeCount) + '</td>' +
                '<td class="right">' + fmtSd(r) + '</td>' +
              '</tr>';
          });
        });
      } else {
        roundsView.forEach(function(r){
          var hx = teeHex(r.tee||""), fg = teeFg(hx);
          var shortDate = (r.date||"").replace(/^(\d{2})-(\d{2})-\d{4}$/,"$1-$2");
          var datePillHtml = r.hasCard
            ? '<a class="dateLink" href="#" data-score="' + r.scoreId + '"><span class="tee-date" style="background:'+hx+';color:'+fg+'">'+shortDate+'</span></a>'
            : '<span class="tee-date" style="background:'+hx+';color:'+fg+'">'+shortDate+'</span>';
          var teeHtml = (r.tee||"") ? '<span class="teePill" style="background:'+hx+';color:'+fg+'">'+r.tee+'</span>' : "";
          roundsHtml +=
            '<tr class="roundRow" data-score="' + r.scoreId + '" data-hascard="' + (r.hasCard ? "1" : "0") + '">' +
              '<td>' + datePillHtml + fmtEds(r.scoreOrigin) + '<div class="muted" style="font-size:10px">#'+r.scoreId+'</div></td>' +
              '<td class="right">' + (r.holeCount==9?'<span class="hb hb9">9</span>':'<span class="hb hb18">18</span>') + '</td>' +
              '<td class="right">' + (r.hi ?? "") + '</td>' +
              '<td>' + teeHtml + '</td>' +
              '<td class="right muted">' + (r.meters ? (r.meters + "m") : "") + '</td>' +
              '<td class="right">' + fmtGross(r.gross, r.par) + '</td>' +
              '<td class="right">' + fmtStb(r.stb, r.holeCount) + '</td>' +
              '<td class="right">' + fmtSd(r) + '</td>' +
            '</tr>';
        });
      }

      var lastTeeHx = last ? teeHex(last.tee || '') : '#111827';
      var lastTeeFg2 = last ? teeFg(lastTeeHx) : '#fff';
      var lastDatePill = last ? '<span class="tee-date" style="background:'+lastTeeHx+';color:'+lastTeeFg2+'">'+(last.date||'').replace(/^(\d{2})-(\d{2})-\d{4}$/,'$1-$2')+'</span>' : '';
      var lastBurHtml = last ? (last.holeCount==9?'<span class="hb hb9">9</span>':'<span class="hb hb18">18</span>') : '';
      var lastHcpTxt = last ? (last.hi ?? '') : '';
      var lastTeeP = last ? '<span class="teePill" style="background:'+lastTeeHx+';color:'+lastTeeFg2+'">'+(last.tee||'-')+'</span>' : '';
      var lastDistTxt = last ? (last.meters ? last.meters+'m' : '') : '';
      var lastGrossHtml = last ? fmtGross(last.gross, last.par) : '';
      var lastStbTxt = last ? fmtStb(last.stb, last.holeCount) : '';
      var lastSdHtml = last ? fmtSd(last) : '';

      html +=
        '<tr>' +
          '<td>' +
            '<div class="rowHead">' +
              '<div class="count" style="background:' + lastTeeHx + ';color:' + lastTeeFg2 + '">' + c.count + '</div>' +
              '<button type="button" class="courseBtn" data-toggle="' + rowId + '">' + c.course + '</button>' +
            '</div>' +
          '</td>' +
          '<td class="right"><b>' + c.count + '</b></td>' +
          '<td>' + lastDatePill + '</td>' +
          '<td class="right">' + lastBurHtml + '</td>' +
          '<td class="right">' + lastHcpTxt + '</td>' +
          '<td>' + lastTeeP + '</td>' +
          '<td class="right muted">' + lastDistTxt + '</td>' +
          '<td class="right">' + lastGrossHtml + '</td>' +
          '<td class="right">' + lastStbTxt + '</td>' +
          '<td class="right">' + lastSdHtml + '</td>' +
        '</tr>' +
        '<tr class="details' + ((openState[rowId]) ? ' open' : '') + '" id="' + rowId + '">' +
          '<td class="inner" colspan="10">' +
            '<div class="innerWrap">' +
              (isSimple ? '' :
                '<div class="actions" style="margin-bottom:10px">' +
                  '<button type="button" class="btn btnGhost" data-clearfilter="'+rowId+'" style="display:' + (currentTeeKey ? 'inline-flex':'none') + '">Limpar filtro tee</button>' +
                  '<button type="button" class="btn btnPdf" data-printcourse="' + rowId + '" title="Guardar PDF deste campo">📄 PDF</button>' +
                '</div>' +
                '<div class="ecGrid">' +
                  ecHtml +
                '</div>' +
              courseStatsHtml +
              holeAnalysisHtml +
              bannerHtml) +
              (isSimple ? '<div class="actions">' +
                  '<button type="button" class="btn openAll" data-for="' + rowId + '">Abrir todos</button>' +
                  '<button type="button" class="btn closeAll" data-for="' + rowId + '">Fechar todos</button>' +
                '</div>' : '') +
              '<div class="innerTable">' +
                '<table class="dt-compact">' +
                  '<colgroup><col style="width:17%"><col style="width:8%"><col style="width:9%"><col style="width:15%"><col style="width:11%"><col style="width:14%"><col style="width:10%"><col style="width:10%"></colgroup>' +
                  '<thead>' +
                    '<tr>' +
                      '<th>Data</th>' +
                      '<th class="right">Bur.</th>' +
                      '<th class="right">HCP</th>' +
                      '<th>Tee</th>' +
                      '<th class="right">Dist.</th>' +
                      '<th class="right">Gross</th>' +
                      '<th class="right">Stb</th>' +
                      '<th class="right">SD</th>' +
                    '</tr>' +
                  '</thead>' +
                  '<tbody>' + roundsHtml + '</tbody>' +
                '</table>' +
              '</div>' +
            '</div>' +
          '</td>' +
        '</tr>';
    }

    tbody.innerHTML = html;

    Object.keys(teeFilter).forEach(function(rowId){
      var tk = teeFilter[rowId];
      if (!tk) return;
      document.querySelectorAll('.ecPill[data-ec-for="'+rowId+'"]').forEach(function(p){
        if (p.getAttribute("data-ec-teekey") === tk) p.classList.add("active");
      });
    });

  }

  q.addEventListener("input", render);
  sortSel.addEventListener("change", render);
  if (viewSel) viewSel.addEventListener("change", render);
  render();

  // Build round lookup from DATA: scoreId → {course, courseKey, tee, teeKey, gross, par, sd, hi, holeCount}
  var ROUND_MAP = {};
  DATA.forEach(function(c) {
    c.rounds.forEach(function(r) {
      ROUND_MAP[String(r.scoreId)] = {
        course: c.course, courseKey: norm2(c.course),
        tee: r.tee, teeKey: r.teeKey,
        gross: r.gross, par: r.par, sd: r.sd, hi: r.hi,
        holeCount: r.holeCount, stb: r.stb
      };
    });
  });

  // Compute course+tee stats for comparisons
  var CT_STATS = {};
  DATA.forEach(function(c) {
    c.rounds.forEach(function(r) {
      if (r.holeCount !== 18 || r.gross == null || r.gross < 50) return;
      var ctk = norm2(c.course) + '|' + (r.teeKey || '');
      if (!CT_STATS[ctk]) CT_STATS[ctk] = { grosses: [], sds: [] };
      CT_STATS[ctk].grosses.push(r.gross);
      if (r.sd != null) CT_STATS[ctk].sds.push(Number(r.sd));
    });
  });

  // Build Eclético + Δ rows to inject INTO the scorecard table
  function buildEcleticRows(scoreId) {
    var rd = ROUND_MAP[String(scoreId)];
    if (!rd) return '';
    var courseKey = rd.courseKey;
    var teeKey = rd.teeKey;
    
    var ec = ECDET[courseKey] && ECDET[courseKey][teeKey] ? ECDET[courseKey][teeKey] : null;
    var hs = HOLES[String(scoreId)];
    if (!ec || !hs || !ec.holes || !hs.g) return '';
    
    var hc = Math.min(ec.holes.length, hs.g.length);
    if (hc < 9) return '';
    var is9 = hc === 9;
    var frontEnd = is9 ? hc : 9;
    
    function sumA(arr, from, to) { var s=0; for(var i=from;i<to;i++) if(arr[i]!=null) s+=arr[i]; return s; }
    
    var parArr = [], grossArr = [], ecArr = [];
    for (var i = 0; i < hc; i++) {
      parArr.push(ec.holes[i] ? ec.holes[i].par : (hs.p ? hs.p[i] : null));
      grossArr.push(hs.g[i]);
      ecArr.push(ec.holes[i] ? ec.holes[i].best : null);
    }
    
    var html = '';
    
    // Separator row before eclectic — thick top border to separate from Gross
    var ecBorderTop = 'border-top:2px solid #cbd5e1';
    html += '<tr><td class="row-label" style="color:#0369a1;font-weight:700;font-size:10px;'+ecBorderTop+'">Eclético</td>';
    var sumEc = 0;
    for (var h = 0; h < hc; h++) {
      var ev = ecArr[h];
      if (ev != null) sumEc += ev;
      var ecPar = parArr[h];
      var cls = (ev != null && ecPar != null) ? scClass(ev, ecPar) : '';
      html += '<td style="'+ecBorderTop+'">';
      if (ev != null) html += '<span class="sc-score ' + cls + '">' + ev + '</span>';
      html += '</td>';
      if (h === frontEnd - 1 && !is9) {
        var outEc = sumA(ecArr, 0, frontEnd);
        var outEcP = sumA(parArr, 0, frontEnd);
        var outEcTP = outEc - outEcP;
        html += '<td class="col-out" style="font-weight:700;'+ecBorderTop+'">' + outEc + '<span class="sc-topar ' + (outEcTP > 0 ? 'sc-topar-pos' : (outEcTP < 0 ? 'sc-topar-neg' : 'sc-topar-zero')) + '">' + (outEcTP > 0 ? '+' : '') + outEcTP + '</span></td>';
      }
    }
    var inEc = is9 ? sumEc : sumA(ecArr, 9, hc);
    var inEcP = is9 ? sumA(parArr, 0, hc) : sumA(parArr, 9, hc);
    var inEcTP = inEc - inEcP;
    html += '<td class="col-' + (is9 ? 'total' : 'in') + '" style="font-weight:700;'+ecBorderTop+'">' + inEc + '<span class="sc-topar ' + (inEcTP > 0 ? 'sc-topar-pos' : (inEcTP < 0 ? 'sc-topar-neg' : 'sc-topar-zero')) + '">' + (inEcTP > 0 ? '+' : '') + inEcTP + '</span></td>';
    if (!is9) {
      var ecToPar = sumEc - sumA(parArr, 0, hc);
      html += '<td class="col-total" style="'+ecBorderTop+'">' + sumEc + '<span class="sc-topar ' + (ecToPar > 0 ? 'sc-topar-pos' : (ecToPar < 0 ? 'sc-topar-neg' : 'sc-topar-zero')) + '">' + (ecToPar > 0 ? '+' : '') + ecToPar + '</span></td>';
    }
    html += '</tr>';
    
    // Δ row (eclético - gross: negativo = eclético melhor)
    html += '<tr style="background:#fafbfc"><td class="row-label" style="color:#64748b;font-weight:700;font-size:10px">Δ</td>';
    for (var h = 0; h < hc; h++) {
      var gv = grossArr[h];
      var ev2 = ecArr[h];
      var diff = (gv != null && ev2 != null) ? ev2 - gv : null;
      var dc = 'color:#94a3b8';
      if (diff != null) {
        dc = diff === 0 ? 'color:#16a34a;font-weight:700' : (diff < 0 ? 'color:#16a34a;font-weight:700' : 'color:#dc2626;font-weight:600');
      }
      html += '<td style="' + dc + '">' + (diff != null ? (diff === 0 ? '=' : (diff > 0 ? '+' : '') + diff) : '') + '</td>';
      if (h === frontEnd - 1 && !is9) {
        var dOut = sumA(ecArr, 0, frontEnd) - sumA(grossArr, 0, frontEnd);
        var dOutClr = dOut === 0 ? '#16a34a' : (dOut < 0 ? '#16a34a' : '#dc2626');
        html += '<td class="col-out" style="color:' + dOutClr + ';font-weight:600">' + (dOut === 0 ? '=' : (dOut > 0 ? '+' : '') + dOut) + '</td>';
      }
    }
    var sumGross = sumA(grossArr, 0, hc);
    var totalDiff = sumEc - sumGross;
    var dIn = (is9 ? sumEc : sumA(ecArr, 9, hc)) - (is9 ? sumGross : sumA(grossArr, 9, hc));
    var dInClr = dIn === 0 ? '#16a34a' : (dIn < 0 ? '#16a34a' : '#dc2626');
    html += '<td class="col-' + (is9 ? 'total' : 'in') + '" style="color:' + dInClr + ';font-weight:600">' + (dIn === 0 ? '=' : (dIn > 0 ? '+' : '') + dIn) + '</td>';
    if (!is9) {
      html += '<td class="col-total" style="color:' + (totalDiff <= 0 ? '#16a34a' : '#dc2626') + '">' + (totalDiff > 0 ? '+' : '') + totalDiff + '</td>';
    }
    html += '</tr>';
    
    return html;
  }

  function buildTournamentComparison(rounds, pillColors) {
    // Find reference data for par/meters/SI
    var refData = null, hc = 18;
    for (var i = 0; i < rounds.length; i++) {
      var h = HOLES[rounds[i].scoreId];
      if (h && h.p && h.p.some(function(v){ return v != null; })) { refData = h; hc = h.hc || 18; break; }
    }
    if (!refData) return '';

    var is9 = hc === 9, frontEnd = is9 ? hc : 9, backStart = is9 ? 0 : 9;
    function sumA(arr, from, to) { var s=0; for(var i=from;i<to;i++) if(arr[i]!=null) s+=arr[i]; return s; }
    function scCls(g,p) { if(g==null||g===0||p==null) return ''; var d=g-p; if(g===1) return 'holeinone'; if(d<=-3) return 'albatross'; if(d===-2) return 'eagle'; if(d===-1) return 'birdie'; if(d===0) return 'par'; if(d===1) return 'bogey'; if(d===2) return 'double'; if(d===3) return 'triple'; return d===4?'quad':'worse'; }

    var par = refData.p, meters = refData.m, si = refData.si;
    var tee = rounds[0] ? (rounds[0].tee||'') : '';
    var hx = teeHex(tee);
    var fgT = teeFg(hx);
    var totalPar = par ? sumA(par,0,hc) : null;
    var totalDist = meters ? sumA(meters,0,hc) : null;
    var hcpLabel = rounds[0] ? (rounds[0].hi||'') : '';
    // Check if all rounds share same tee
    var allSameTee = rounds.every(function(r){ return (r.tee||'') === tee; });
    var teeLabel = allSameTee ? ('Tee ' + tee) : 'Tees variados';

    var cellS = 'padding:4px 6px;text-align:center;font-size:12px;border-bottom:1px solid #f0f0f0';
    var colLabel = cellS + ';text-align:left;padding-left:8px;border-right:2px solid #e2e8f0';
    var colOut = cellS + ';background:#f4f6f8;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0';
    var colIn = colOut;
    var colTot = cellS + ';background:#edf0f4;border-left:1px solid #dde1e7;font-weight:800';

    var html = '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">';
    // Header
    html += '<div class="sc-bar-head">';
    html += '<span>Scorecard comparativo · HCP ' + hcpLabel + ' · ' + teeLabel + (totalDist && allSameTee ? ' · ' + totalDist + 'm' : '') + '</span>';
    html += '<span>Par ' + (totalPar || '') + '</span>';
    html += '</div>';

    html += '<div style="overflow-x:auto">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';

    // Buraco row (neutral)
    html += '<tr style="background:#f8fafc">';
    html += '<td style="'+colLabel+';font-weight:700;color:#64748b;font-size:11px;border-bottom:1px solid #e2e8f0">Buraco</td>';
    for (var h=1; h<=hc; h++) {
      html += '<td style="'+cellS+';font-weight:700;color:#64748b;font-size:11px;border-bottom:1px solid #e2e8f0">'+h+'</td>';
      if (h===frontEnd && !is9) html += '<td style="'+colOut+';font-weight:700;color:#64748b;font-size:10px;border-bottom:1px solid #e2e8f0">Out</td>';
    }
    html += '<td style="'+(is9?colTot:colIn)+';font-weight:700;color:#64748b;font-size:10px;border-bottom:1px solid #e2e8f0">'+(is9?'TOTAL':'In')+'</td>';
    if (!is9) html += '<td style="'+colTot+';color:#475569;font-size:11px;border-bottom:1px solid #e2e8f0">TOTAL</td>';
    html += '</tr>';

    // Metros row
    if (meters && meters.some(function(v){ return v!=null&&v>0; })) {
      html += '<tr>';
      html += '<td style="'+colLabel+';color:#b0b8c4;font-size:10px">Metros</td>';
      for (var h=1;h<=hc;h++) {
        html += '<td style="'+cellS+';color:#b0b8c4;font-size:10px">'+(meters[h-1]||'')+'</td>';
        if (h===frontEnd&&!is9) html += '<td style="'+colOut+';color:#b0b8c4;font-size:10px;font-weight:600">'+sumA(meters,0,frontEnd)+'</td>';
      }
      var inM = is9 ? sumA(meters,0,hc) : sumA(meters,backStart,hc);
      html += '<td style="'+(is9?colTot:colIn)+';color:#b0b8c4;font-size:10px;font-weight:600">'+inM+'</td>';
      if (!is9) html += '<td style="'+colTot+';color:#9aab8e;font-size:10px">'+sumA(meters,0,hc)+'</td>';
      html += '</tr>';
    }

    // SI row
    if (si && si.some(function(v){ return v!=null; })) {
      html += '<tr>';
      html += '<td style="'+colLabel+';color:#b0b8c4;font-size:10px">S.I.</td>';
      for (var h=1;h<=hc;h++) {
        html += '<td style="'+cellS+';color:#b0b8c4;font-size:10px">'+(si[h-1]!=null?si[h-1]:'')+'</td>';
        if (h===frontEnd&&!is9) html += '<td style="'+colOut+'"></td>';
      }
      html += '<td style="'+(is9?colTot:colIn)+'"></td>';
      if (!is9) html += '<td style="'+colTot+'"></td>';
      html += '</tr>';
    }

    // Par row (separator)
    if (par && par.some(function(v){ return v!=null; })) {
      html += '<tr>';
      html += '<td style="'+colLabel+';font-weight:600;color:#94a3b8;font-size:11px;border-bottom:2px solid #cbd5e1">Par</td>';
      for (var h=1;h<=hc;h++) {
        html += '<td style="'+cellS+';border-bottom:2px solid #cbd5e1">'+(par[h-1]!=null?par[h-1]:'')+'</td>';
        if (h===frontEnd&&!is9) html += '<td style="'+colOut+';font-weight:700;border-bottom:2px solid #cbd5e1">'+sumA(par,0,frontEnd)+'</td>';
      }
      var inP = is9 ? sumA(par,0,hc) : sumA(par,backStart,hc);
      html += '<td style="'+(is9?colTot:colIn)+';font-weight:700;border-bottom:2px solid #cbd5e1">'+inP+'</td>';
      if (!is9) html += '<td style="'+colTot+';border-bottom:2px solid #cbd5e1">'+sumA(par,0,hc)+'</td>';
      html += '</tr>';
    }

    // Each round row with grey pill label
    var roundGross = [];
    for (var ri=0; ri<rounds.length; ri++) {
      var rd = rounds[ri];
      var hd = HOLES[rd.scoreId];
      var gross = hd ? hd.g : null;
      if (!gross) { roundGross.push(null); continue; }
      roundGross.push(gross);

      var dateFmt = rd.date ? rd.date.substring(0,5).replace('-','/') : ('V'+(ri+1));

      html += '<tr>';
      var rdTee = rd.tee || '';
      var rdHx = teeHex(rdTee);
      var rdFg = teeFg(rdHx);
      html += '<td style="'+colLabel+'"><span class="sc-pill" style="background:'+rdHx+';color:'+rdFg+'">'+dateFmt+'</span></td>';
      for (var h=1;h<=hc;h++) {
        var gv = gross[h-1], pv = par ? par[h-1] : null;
        var cls = scCls(gv, pv);
        var gDisp = (gv!=null && gv>0) ? gv : '';
        html += '<td style="'+cellS+'"><span class="sc-score '+cls+'" style="display:inline-flex;width:26px;height:26px;align-items:center;justify-content:center;font-weight:700;font-size:12px">'+gDisp+'</span></td>';
        if (h===frontEnd&&!is9) {
          var outG = sumA(gross,0,frontEnd);
          var outP2 = par ? sumA(par,0,frontEnd) : 0;
          var outTP = outG - outP2;
          html += '<td style="'+colOut+';font-weight:700">'+outG+'<span class="sc-topar '+(outTP>0?'sc-topar-pos':(outTP<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(outTP>0?'+':'')+outTP+'</span></td>';
        }
      }
      var inG = is9 ? sumA(gross,0,hc) : sumA(gross,backStart,hc);
      var totalG = sumA(gross,0,hc);
      var tp = par ? totalG - sumA(par,0,hc) : null;
      var inP2 = is9 ? (par?sumA(par,0,hc):0) : (par?sumA(par,backStart,hc):0);
      var inTP = inG - inP2;
      html += '<td style="'+(is9?colTot:colIn)+';font-weight:700">'+inG+'<span class="sc-topar '+(inTP>0?'sc-topar-pos':(inTP<0?'sc-topar-neg':'sc-topar-zero'))+'">'+(inTP>0?'+':'')+inTP+'</span></td>';
      if (!is9) {
        var tps = tp!=null ? (tp>0?'+'+tp:(tp===0?'E':''+tp)) : '';
        html += '<td style="'+colTot+'">'+totalG+'<span class="sc-topar '+(tp>0?'sc-topar-pos':(tp<0?'sc-topar-neg':'sc-topar-zero'))+'">'+tps+'</span></td>';
      }
      html += '</tr>';
    }

    // Delta row (last vs first) with separator
    if (rounds.length >= 2 && roundGross[0] && roundGross[rounds.length-1]) {
      var first = roundGross[0], last = roundGross[rounds.length-1];
      html += '<tr style="background:#fafbfc;border-top:2px solid #cbd5e1">';
      html += '<td style="'+colLabel+';font-weight:700;color:#64748b;font-size:11px">Δ</td>';
      for (var h=1;h<=hc;h++) {
        var d = (last[h-1]!=null && first[h-1]!=null) ? last[h-1]-first[h-1] : null;
        var dStr = d==null ? '' : (d===0 ? '=' : (d>0 ? '+'+d : ''+d));
        var dColor = d==null ? '#94a3b8' : (d===0 ? '#94a3b8' : (d<0 ? '#16a34a' : '#dc2626'));
        var dW = (d!=null && d!==0) ? ';font-weight:600' : '';
        html += '<td style="'+cellS+';color:'+dColor+';font-size:11px'+dW+'">'+dStr+'</td>';
        if (h===frontEnd&&!is9) {
          var dOut = sumA(last,0,frontEnd) - sumA(first,0,frontEnd);
          var dOutStr = dOut===0 ? '=' : (dOut>0 ? '+'+dOut : ''+dOut);
          html += '<td style="'+colOut+';color:'+(dOut===0?'#94a3b8':(dOut<0?'#16a34a':'#dc2626'))+';font-size:11px;'+(dOut!==0?'font-weight:600':'')+'">'+dOutStr+'</td>';
        }
      }
      var dIn = (is9 ? sumA(last,0,hc) : sumA(last,backStart,hc)) - (is9 ? sumA(first,0,hc) : sumA(first,backStart,hc));
      var dInStr = dIn===0 ? '=' : (dIn>0 ? '+'+dIn : ''+dIn);
      html += '<td style="'+(is9?colTot:colIn)+';color:'+(dIn===0?'#94a3b8':(dIn<0?'#16a34a':'#dc2626'))+';font-size:11px;'+(dIn!==0?'font-weight:600':'')+'">'+dInStr+'</td>';
      if (!is9) {
        var dTot = sumA(last,0,hc) - sumA(first,0,hc);
        var dTotStr = dTot===0 ? '=' : (dTot>0 ? '+'+dTot : ''+dTot);
        html += '<td style="'+colTot+';color:'+(dTot===0?'#94a3b8':(dTot<0?'#16a34a':'#dc2626'))+';font-size:11px">'+dTotStr+'</td>';
      }
      html += '</tr>';
    }

    html += '</table></div></div>';
    return html;
  }

  function insertInline(afterTr, scoreId){
    if (!afterTr || !scoreId) return;
    var next = afterTr.nextElementSibling;
    if (next && next.classList && next.classList.contains("scorecardRow") && next.getAttribute("data-score") === scoreId) {
      next.remove(); return;
    }
    var frag = FRAG[String(scoreId)];
    if (!frag) return;

    var row = document.createElement("tr");
    row.className = "scorecardRow";
    row.setAttribute("data-score", scoreId);

    var td = document.createElement("td");
    td.colSpan = afterTr.cells ? afterTr.cells.length : 12;

    var host = document.createElement("div");
    host.className = "scHost";
    host.innerHTML = frag;

    // Inject eclectic + Δ rows into the scorecard table
    var ecRows = buildEcleticRows(scoreId);
    if (ecRows) {
      var scTable = host.querySelector('table[data-sc-table]');
      if (scTable) {
        var tbody = scTable.querySelector('tbody') || scTable;
        tbody.insertAdjacentHTML('beforeend', ecRows);
      }
    }

    td.appendChild(host);
    row.appendChild(td);
    afterTr.after(row);
  }

  document.addEventListener("click", function(e){
    // Player dropdown toggle
    var dd = document.getElementById("playerDD");
    if (dd) {
      var btn = e.target.closest("#playerBtn");
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        dd.classList.toggle("open");
        return;
      }
      // Prevent clicks inside filter area from closing dropdown
      var filterClick = e.target.closest(".pm-fsel, .pm-search, .pm-reset, .pm-search-row, .pm-filter-row");
      if (filterClick) {
        e.stopPropagation();
        return;
      }
      // Clicar fora fecha o dropdown
      if (!e.target.closest(".player-menu")) {
        dd.classList.remove("open");
      }
    }

    var toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      var id = toggle.getAttribute("data-toggle");
      var tr = document.getElementById(id);
      if (tr) {
        tr.classList.toggle("open");
        openState[id] = tr.classList.contains("open");
      }
      return;
    }

    var ec = e.target.closest(".ecPill") || e.target.closest(".ec-tee-row");
    if (ec) {
      e.preventDefault();
      e.stopPropagation();
      var rowId = ec.getAttribute("data-ec-for");
      var tk = ec.getAttribute("data-ec-teekey");
      // toggle
      teeFilter[rowId] = (teeFilter[rowId] === tk) ? "" : tk;
      openState[rowId] = true;
      render();
      return;
    }

    var hfBtn = e.target.closest("[data-holefilter]");
    if (hfBtn) {
      e.preventDefault();
      e.stopPropagation();
      var rid = hfBtn.getAttribute("data-holefilter");
      var holes = Number(hfBtn.getAttribute("data-holes") || 0);
      holeFilter[rid] = holes;
      openState[rid] = true;
      render();
      return;
    }

    var clear = e.target.closest("[data-clearfilter]");
    if (clear) {
      e.preventDefault();
      e.stopPropagation();
      var rId = clear.getAttribute("data-clearfilter");
      teeFilter[rId] = "";
      openState[rId] = true;
      render();
      return;
    }

    var apply = e.target.closest(".applyGroup");
    if (apply) {
      e.preventDefault();
      e.stopPropagation();
      var idA = apply.getAttribute("data-for");
      groupMode[idA] = true;
      openState[idA] = true;
      render();
      return;
    }

    var ign = e.target.closest(".ignoreGroup");
    if (ign) {
      e.preventDefault();
      e.stopPropagation();
      var idI = ign.getAttribute("data-for");
      ignorePrompt[idI] = true;
      openState[idI] = true;
      render();
      return;
    }

    var openAllBtn = e.target.closest(".openAll");
    if (openAllBtn) {
      e.preventDefault();
      e.stopPropagation();
      var id2 = openAllBtn.getAttribute("data-for");
      var container = document.getElementById(id2);
      if (!container) return;
      openState[id2] = true;

      var rows = container.querySelectorAll("tr.roundRow[data-hascard='1']");
      rows.forEach(function(r){
        var sid = r.getAttribute("data-score");
        var nxt = r.nextElementSibling;
        if (nxt && nxt.classList && nxt.classList.contains("scorecardRow") && nxt.getAttribute("data-score") === sid) return;
        insertInline(r, sid);
      });
      return;
    }

    var closeAllBtn = e.target.closest(".closeAll");
    if (closeAllBtn) {
      e.preventDefault();
      e.stopPropagation();
      var id3 = closeAllBtn.getAttribute("data-for");
      var container2 = document.getElementById(id3);
      if (!container2) return;
      openState[id3] = true;
      container2.querySelectorAll(".scorecardRow").forEach(function(r){ r.remove(); });
      return;
    }

    // PDF per-course: print just this course card in landscape
    var pdfBtn = e.target.closest("[data-printcourse]");
    if (pdfBtn) {
      e.preventDefault();
      e.stopPropagation();
      var cId = pdfBtn.getAttribute("data-printcourse");
      var cardEl = document.getElementById(cId);
      if (!cardEl) return;

      // Collect CSS
      var cssText = "";
      var sheets = document.querySelectorAll("style");
      for (var si = 0; si < sheets.length; si++) cssText += sheets[si].innerHTML;

      // Get course name from previous summary row
      var prevRow = cardEl.previousElementSibling;
      var courseNameEl = prevRow ? prevRow.querySelector(".courseBtn") : null;
      var titleText = courseNameEl ? courseNameEl.textContent.trim() : "Campo";

      // Get player name
      var playerBtn2 = document.querySelector(".player-btn");
      var h1El = document.querySelector("h1");
      var playerText = playerBtn2 ? playerBtn2.textContent.replace(/▼/g,"").trim() : (h1El ? h1El.textContent.replace("🖨️","").replace("Imprimir","").trim() : "");

      // Clone inner content
      var innerTd = cardEl.querySelector("td.inner");
      if (!innerTd) innerTd = cardEl.querySelector("td");
      var clone = innerTd ? innerTd.cloneNode(true) : cardEl.cloneNode(true);
      // Make innerWrap visible
      var iw = clone.querySelector(".innerWrap");
      if (iw) iw.style.display = "block";
      // Remove action buttons
      clone.querySelectorAll(".actions,.banner").forEach(function(el){ el.remove(); });

      // Build print window
      var pw = window.open("", "_blank", "width=1100,height=800");
      if (!pw) { alert("Permite popups para gerar o PDF."); return; }
      var safePlayer = playerText.replace(/"/g, '\\"');
      var safeCourse = titleText.replace(/"/g, '\\"');
      var printCss = "@page{size:landscape;margin:8mm 10mm 14mm 10mm;" +
          "@bottom-left{content:\\"" + safePlayer + " — " + safeCourse + "\\";font-size:8px;color:#64748b;font-family:system-ui,sans-serif}" +
          "@bottom-right{content:\\"Página \\" counter(page) \\" de \\" counter(pages);font-size:8px;color:#64748b;font-family:system-ui,sans-serif}" +
        "}" +
        "*{print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important}" +
        "body{background:#fff!important;padding:0!important;margin:0!important;font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#111827}" +
        "header{display:none!important}" +
        ".pdf-header{margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid #1e40af}" +
        ".pdf-player{font-size:13px;font-weight:900;color:#1e40af}" +
        ".pdf-course{font-size:15px;font-weight:900;color:#111827;margin-right:12px}" +
        ".innerWrap{display:block!important}" +
        ".innerTable{max-height:none!important;overflow:visible!important}" +
        "table{border-collapse:collapse;width:100%}" +
        ".btn,.actions,.banner{display:none!important}" +
        ".bar-under{background:#22c55e!important}" +
        ".bar-ok{background:#eab308!important}" +
        ".bar-mid{background:#f97316!important}" +
        ".bar-high{background:#ef4444!important}" +
        ".caBar{min-width:4px!important}" +
        ".caSpark{height:40px!important}" +
        ".courseAnalysis,.holeAnalysis,.ecGrid{break-inside:avoid}" +
        "a{text-decoration:none!important;color:inherit!important}";
      pw.document.write("<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + titleText + " — " + playerText + "</title>");
      pw.document.write("<style>" + cssText + "</style>");
      pw.document.write("<style>" + printCss + "</style>");
      pw.document.write("</head><body>");
      pw.document.write("<div class='pdf-header'><span class='pdf-course'>" + titleText + "</span><span class='pdf-player'>" + playerText + "</span></div>");
      pw.document.write(clone.innerHTML);
      pw.document.write("</body></html>");
      pw.document.close();
      setTimeout(function(){ pw.print(); }, 500);
      return;
    }

    // Eclectic contribution link → open scorecard and scroll
    var ecLink = e.target.closest("a.pill[data-score-id]");
    if (ecLink) {
      e.preventDefault();
      var sid = ecLink.getAttribute("data-score-id");
      if (!sid) return;
      // Find the round row with this score_id in the current course section
      var card = ecLink.closest(".courseCard");
      if (!card) return;
      var roundRow = card.querySelector('tr.roundRow[data-score="' + sid + '"]');
      if (roundRow) {
        var nxt = roundRow.nextElementSibling;
        if (!(nxt && nxt.classList && nxt.classList.contains("scorecardRow") && nxt.getAttribute("data-score") === sid)) {
          insertInline(roundRow, sid);
        }
        roundRow.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    // Tournament pill toggle — show/hide individual scorecard
    var tPill = e.target.closest(".tournPill");
    if (tPill) {
      e.preventDefault();
      e.stopPropagation();
      var targetId = tPill.getAttribute("data-pill-for");
      if (!targetId) return;
      var scRow = document.getElementById(targetId);
      if (!scRow) return;
      // Close all other tournament scorecards in the same tournament
      var parent = tPill.closest(".innerWrap");
      if (parent) {
        parent.querySelectorAll(".tournScRow").forEach(function(r) {
          if (r.id !== targetId) r.style.display = "none";
        });
        parent.querySelectorAll(".tournPill").forEach(function(p) {
          p.style.boxShadow = "none";
        });
      }
      // Toggle this one
      if (scRow.style.display === "none") {
        scRow.style.display = "table-row";
        tPill.style.boxShadow = "0 0 0 2px #fff, 0 0 0 4px " + tPill.style.backgroundColor;
      } else {
        scRow.style.display = "none";
        tPill.style.boxShadow = "none";
      }
      return;
    }

    var link = e.target.closest("a.dateLink");
    if (!link) return;

    e.preventDefault();
    var scoreId = link.getAttribute("data-score");
    var trRound = link.closest("tr");
    if (!scoreId || !trRound) return;
    insertInline(trRound, scoreId);
  });

  // ========= Player dropdown filters (selects + search) =========
  (function(){
    var dd = document.getElementById("playerDD");
    if (!dd) return;
    var pmSearch = document.getElementById("pmSearch");
    var pmReset = document.getElementById("pmReset");

    function applyPlayerFilters() {
      var rawTerm = pmSearch ? pmSearch.value.trim() : "";
      var term = rawTerm.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"");
      var filters = {};
      var sels = dd.querySelectorAll(".pm-fsel");
      for (var si=0; si<sels.length; si++) {
        if (sels[si].value !== "all") filters[sels[si].getAttribute("data-dim")] = sels[si].value;
      }
      var hasFilter = term || Object.keys(filters).length > 0;
      if (pmReset) pmReset.classList.toggle("visible", hasFilter);

      var dimMap = { escalao:"data-escalao", region:"data-region", club:"data-club", sex:"data-sex" };
      var links = dd.querySelectorAll(".pm-list a");
      var count = 0;
      for (var i=0; i<links.length; i++) {
        var show = true;
        if (term) {
          var nameVal = (links[i].getAttribute("data-name") || "");
          var fedVal = (links[i].getAttribute("data-fed") || "").toLowerCase();
          var clubVal = (links[i].getAttribute("data-club") || "").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"");
          var searchable = nameVal + " " + fedVal + " " + clubVal;
          var words = term.split(/\s+/).filter(function(w){ return w.length > 0; });
          var allMatch = true;
          for (var wi = 0; wi < words.length; wi++) {
            if (searchable.indexOf(words[wi]) < 0) { allMatch = false; break; }
          }
          if (!allMatch) show = false;
        }
        for (var dk in filters) {
          if (dk === "tags") {
            var linkTags = (links[i].getAttribute("data-tags") || "").split(",");
            if (linkTags.indexOf(filters[dk]) < 0) { show = false; break; }
          } else if (dk === "hcpmax") {
            var linkHcp = parseFloat(links[i].getAttribute("data-hcp"));
            var maxVal = parseFloat(filters[dk]);
            if (isNaN(linkHcp) || linkHcp > maxVal) { show = false; break; }
          } else {
            var attr = dimMap[dk];
            if (attr && links[i].getAttribute(attr) !== filters[dk]) { show = false; break; }
          }
        }
        links[i].style.display = show ? "" : "none";
        if (show) count++;
      }
      var cEl = document.getElementById("pmCount");
      if (cEl) cEl.textContent = count + " jogador" + (count !== 1 ? "es" : "");
    }

    var allSels = dd.querySelectorAll(".pm-fsel");
    for (var si2=0; si2<allSels.length; si2++) {
      allSels[si2].addEventListener("change", function() {
        this.classList.toggle("has-value", this.value !== "all");
        applyPlayerFilters();
      });
    }
    if (pmSearch) pmSearch.addEventListener("input", applyPlayerFilters);
    if (pmReset) pmReset.addEventListener("click", function(e2) {
      e2.preventDefault(); e2.stopPropagation();
      if (pmSearch) pmSearch.value = "";
      var sels2 = dd.querySelectorAll(".pm-fsel");
      for (var si3=0; si3<sels2.length; si3++) { sels2[si3].value = "all"; sels2[si3].classList.remove("has-value"); }
      applyPlayerFilters();
    });
  })();

  // ========= Cross-Analysis: Tab switching =========
  document.addEventListener("click", function(e) {
    // Course card expand/collapse
    var toggle = e.target.closest(".cross-course-toggle");
    if (toggle) {
      e.preventDefault();
      var targetId = toggle.getAttribute("data-target");
      var detail = document.getElementById(targetId);
      var arrow = document.getElementById("arrow_" + targetId);
      if (detail) {
        var isOpen = detail.style.display !== "none";
        detail.style.display = isOpen ? "none" : "";
        if (arrow) arrow.classList.toggle("open", !isOpen);
      }
      return;
    }

    var tab = e.target.closest(".cross-tab");
    if (!tab) return;
    e.preventDefault();
    var escVal = tab.getAttribute("data-cross-esc");
    var allTabs = tab.parentNode.querySelectorAll(".cross-tab");
    for (var i = 0; i < allTabs.length; i++) allTabs[i].classList.remove("active");
    tab.classList.add("active");
    var panels = document.querySelectorAll(".cross-panel");
    for (var i = 0; i < panels.length; i++) {
      panels[i].style.display = panels[i].id === "crossPanel_" + escVal ? "" : "none";
    }
    setTimeout(function(){ renderCrossCharts(); }, 50);
  });

  // ========= Cross-Analysis: Unified filter (Sexo + HCP max + fade toggle) =========
  function applyCrossFilters() {
    var sexSel = document.getElementById("crossSexFilter");
    var hcpSel = document.getElementById("crossHcpMax");
    var fadeToggle = document.getElementById("crossFadeToggle");
    if (!sexSel && !hcpSel) return;
    var sexVal = sexSel ? sexSel.value : "all";
    var hcpVal = hcpSel ? hcpSel.value : "all";
    var maxHcp = hcpVal === "all" ? Infinity : parseFloat(hcpVal);
    var useFade = fadeToggle && fadeToggle.classList.contains("active");
    var hasAnyFilter = sexVal !== "all" || hcpVal !== "all";

    if (sexSel) sexSel.classList.toggle("has-value", sexVal !== "all");
    if (hcpSel) hcpSel.classList.toggle("has-value", hcpVal !== "all");

    var tables = document.querySelectorAll("table.cross-sortable");
    var totalShown = 0, totalAll = 0;
    for (var ti = 0; ti < tables.length; ti++) {
      var rows = tables[ti].querySelectorAll("tbody tr");
      var visibleRank = 0;
      for (var ri = 0; ri < rows.length; ri++) {
        totalAll++;
        var row = rows[ri];
        var pass = true;
        if (sexVal !== "all" && row.getAttribute("data-sex") !== sexVal) pass = false;
        if (pass && hcpVal !== "all") {
          var hcp = parseFloat(row.getAttribute("data-hcp"));
          if (isNaN(hcp) || hcp > maxHcp) pass = false;
        }
        row.classList.remove("cross-filtered-fade", "cross-filtered-hide");
        if (!pass && hasAnyFilter) {
          row.classList.add(useFade ? "cross-filtered-fade" : "cross-filtered-hide");
        }
        // Update ranking: sequential for passing rows, original for faded
        var rankCell = row.cells[0];
        if (rankCell) {
          var b = rankCell.querySelector("b");
          if (b) {
            if (pass) {
              visibleRank++;
              b.textContent = visibleRank;
            } else {
              // faded/hidden: show original rank dimmed
              b.textContent = rankCell.getAttribute("data-v");
            }
          }
        }
        if (pass) totalShown++;
      }
    }
    var lbl = document.getElementById("crossFilterCount");
    if (lbl) lbl.textContent = hasAnyFilter ? totalShown + " de " + totalAll + " jogadores" : "";
    setTimeout(function(){ renderCrossCharts(); }, 50);
  }

  document.addEventListener("change", function(e) {
    if (e.target.id === "crossHcpMax" || e.target.id === "crossSexFilter") applyCrossFilters();
  });
  document.addEventListener("click", function(e) {
    var toggle = e.target.closest("#crossFadeToggle");
    if (toggle) { toggle.classList.toggle("active"); applyCrossFilters(); }
  });

  // ========= Cross-Analysis: Row toggle (click to select/deselect) =========
  document.addEventListener("click", function(e) {
    var tr = e.target.closest("table.cross-sortable tbody tr");
    if (!tr) return;
    // Don't toggle if clicking a sort header
    if (e.target.closest("th.cross-sort")) return;
    tr.classList.toggle("cross-off");
    setTimeout(function(){ renderCrossCharts(); }, 20);
  });

  // ========= Cross-Analysis: Double-click header # to toggle all =========
  document.addEventListener("dblclick", function(e) {
    var th = e.target.closest("th.cross-sort[data-col='0']");
    if (!th) return;
    var table = th.closest("table.cross-sortable");
    if (!table) return;
    var rows = table.querySelectorAll("tbody tr");
    // If any are off, turn all on; else turn all off
    var anyOff = false;
    for (var i = 0; i < rows.length; i++) { if (rows[i].classList.contains("cross-off")) { anyOff = true; break; } }
    for (var i = 0; i < rows.length; i++) {
      if (anyOff) rows[i].classList.remove("cross-off");
      else rows[i].classList.add("cross-off");
    }
    setTimeout(function(){ renderCrossCharts(); }, 20);
  });

  // ========= Cross-Analysis: Period selector =========
  document.addEventListener("change", function(e) {
    if (e.target.classList.contains("cross-period-select")) {
      setTimeout(function(){ renderCrossCharts(); }, 20);
    }
  });

  // ========= Cross-Analysis: Column sorting =========
  document.addEventListener("click", function(e) {
    var th = e.target.closest("th.cross-sort");
    if (!th) return;
    var table = th.closest("table.cross-sortable");
    if (!table) return;
    var col = parseInt(th.getAttribute("data-col"), 10); // maps directly to td index
    var dtype = th.getAttribute("data-type") || "num";
    
    // Toggle sort direction
    var wasAsc = th.classList.contains("asc");
    // Clear all sort indicators in this table
    var allTh = table.querySelectorAll("th.cross-sort");
    for (var i = 0; i < allTh.length; i++) { allTh[i].classList.remove("asc","desc"); }
    var asc = !wasAsc;
    th.classList.add(asc ? "asc" : "desc");
    
    // Get rows
    var tbody = table.querySelector("tbody");
    if (!tbody) return;
    var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
    
    rows.sort(function(a, b) {
      var cellA = a.cells[col];
      var cellB = b.cells[col];
      if (!cellA || !cellB) return 0;
      var va = cellA.getAttribute("data-v") || cellA.textContent.trim();
      var vb = cellB.getAttribute("data-v") || cellB.textContent.trim();
      
      if (dtype === "num") {
        var na = parseFloat(va) || 0;
        var nb = parseFloat(vb) || 0;
        return asc ? na - nb : nb - na;
      }
      // text / date
      return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    
    // Re-append sorted rows
    for (var r = 0; r < rows.length; r++) tbody.appendChild(rows[r]);
    // Renumber rankings after sort
    applyCrossFilters();
  });

  // ========= Cross-Analysis: get checked feds for an escalão =========
  function getCheckedFeds(escName) {
    var safeEsc = escName.replace(/[^a-zA-Z0-9]/g, '_');
    var table = document.getElementById('crossRank_' + safeEsc);
    if (!table) return {};
    var rows = table.querySelectorAll('tbody tr[data-fed]');
    var feds = {};
    for (var i = 0; i < rows.length; i++) {
      feds[rows[i].getAttribute("data-fed")] = !rows[i].classList.contains("cross-off") && !rows[i].classList.contains("cross-filtered-hide") && !rows[i].classList.contains("cross-filtered-fade");
    }
    return feds;
  }

  // ========= Cross-Analysis: Chart rendering (canvas) =========
  var CHART_COLORS = ['#3b82f6','#ef4444','#16a34a','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16',
                      '#f97316','#6366f1','#14b8a6','#e11d48','#0ea5e9','#a855f7','#d946ef','#65a30d'];

  // Build stable color map per escalão (so colors don't change when toggling)
  var _colorMaps = {};
  function getColorMap(escName, allPlayers) {
    if (!_colorMaps[escName]) {
      _colorMaps[escName] = {};
      for (var i = 0; i < allPlayers.length; i++) {
        _colorMaps[escName][allPlayers[i].fed] = CHART_COLORS[i % CHART_COLORS.length];
      }
    }
    return _colorMaps[escName];
  }

  function renderCrossCharts() {
    var keys = Object.keys(CROSS_DATA);
    if (keys.length < 2) return;
    
    var byEscalao = {};
    for (var fed in CROSS_DATA) {
      var p = CROSS_DATA[fed];
      var esc = p.escalao || 'Sem escalão';
      if (!byEscalao[esc]) byEscalao[esc] = [];
      byEscalao[esc].push(p);
    }
    
    for (var escName in byEscalao) {
      var canvas = document.getElementById("crossChart_" + escName);
      if (!canvas || canvas.offsetParent === null) continue;
      
      // Get period filter
      var periodSel = document.querySelector('.cross-period-select[data-esc="' + escName + '"]');
      var periodMonths = periodSel ? parseInt(periodSel.value, 10) : 0;
      var periodCutoff = periodMonths > 0 ? Date.now() - periodMonths * 30.44 * 24 * 3600 * 1000 : 0;
      
      var allPlayers = byEscalao[escName].filter(function(p){ return p.hcpHistory && p.hcpHistory.length >= 2; });
      if (allPlayers.length === 0) continue;
      
      var colorMap = getColorMap(escName, allPlayers);
      var checkedFeds = getCheckedFeds(escName);
      
      // Filter to only checked players
      var players = allPlayers.filter(function(p) {
        return checkedFeds[p.fed] !== false;
      });
      
      // Filter history by period and build filtered copies
      var filteredPlayers = players.map(function(p) {
        if (periodCutoff <= 0) return p;
        var fh = p.hcpHistory.filter(function(h){ return h.d >= periodCutoff; });
        // If only 1 point in range, grab the last point before cutoff for context
        if (fh.length < 2) {
          var before = p.hcpHistory.filter(function(h){ return h.d < periodCutoff; });
          if (before.length > 0) fh.unshift(before[before.length - 1]);
        }
        return { fed: p.fed, name: p.name, hcpHistory: fh };
      }).filter(function(p){ return p.hcpHistory && p.hcpHistory.length >= 2; });
      
      // Responsive canvas sizing
      var container = canvas.parentElement;
      var W = container ? container.clientWidth - 32 : 900; // subtract padding
      var H = 300;
      var ctx = canvas.getContext("2d");
      var dpr = window.devicePixelRatio || 1;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      
      var pad = { top: 20, right: 80, bottom: 30, left: 45 };
      var cw = W - pad.left - pad.right;
      var ch = H - pad.top - pad.bottom;
      
      if (filteredPlayers.length === 0) {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "14px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Seleciona jogadores na tabela acima", W / 2, H / 2);
        var legendEl = document.getElementById("crossLegend_" + escName);
        if (legendEl) legendEl.innerHTML = "";
        continue;
      }
      
      // Find global min/max from VISIBLE players
      var minDate = Infinity, maxDate = -Infinity;
      var minHcp = Infinity, maxHcp = -Infinity;
      for (var i = 0; i < filteredPlayers.length; i++) {
        var hist = filteredPlayers[i].hcpHistory;
        for (var j = 0; j < hist.length; j++) {
          if (hist[j].d < minDate) minDate = hist[j].d;
          if (hist[j].d > maxDate) maxDate = hist[j].d;
          if (hist[j].h < minHcp) minHcp = hist[j].h;
          if (hist[j].h > maxHcp) maxHcp = hist[j].h;
        }
      }
      if (maxDate === minDate) maxDate = minDate + 86400000;
      var hcpRange = maxHcp - minHcp;
      if (hcpRange < 2) { minHcp -= 1; maxHcp += 1; hcpRange = maxHcp - minHcp; }
      minHcp = Math.floor(minHcp - hcpRange * 0.05);
      maxHcp = Math.ceil(maxHcp + hcpRange * 0.05);
      hcpRange = maxHcp - minHcp;
      
      // Grid
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "right";
      
      var gridLines = 5;
      for (var g = 0; g <= gridLines; g++) {
        var hVal = maxHcp - (g / gridLines) * hcpRange;
        var gy = pad.top + (g / gridLines) * ch;
        ctx.beginPath();
        ctx.moveTo(pad.left, gy);
        ctx.lineTo(W - pad.right, gy);
        ctx.stroke();
        ctx.fillText(hVal.toFixed(1), pad.left - 6, gy + 4);
      }
      
      // Date labels
      ctx.textAlign = "center";
      var dateLabels = 6;
      for (var dl = 0; dl <= dateLabels; dl++) {
        var dt = new Date(minDate + (dl / dateLabels) * (maxDate - minDate));
        var label = (dt.getMonth() + 1) + "/" + dt.getFullYear();
        var dx = pad.left + (dl / dateLabels) * cw;
        ctx.fillText(label, dx, H - 6);
      }
      
      // Draw lines — non-current first, then current on top
      var legendEl = document.getElementById("crossLegend_" + escName);
      var legendHtml = "";
      var drawOrder = filteredPlayers.slice().sort(function(a,b){ return (a.fed===CURRENT_FED?1:0)-(b.fed===CURRENT_FED?1:0); });
      
      for (var pi = 0; pi < drawOrder.length; pi++) {
        var p = drawOrder[pi];
        var hist = p.hcpHistory;
        var color = colorMap[p.fed] || CHART_COLORS[0];
        var isCurrent = p.fed === CURRENT_FED;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = isCurrent ? 3 : 1.5;
        ctx.globalAlpha = isCurrent ? 1 : 0.65;
        ctx.beginPath();
        
        for (var hi = 0; hi < hist.length; hi++) {
          var x = pad.left + ((hist[hi].d - minDate) / (maxDate - minDate)) * cw;
          var y = pad.top + ((maxHcp - hist[hi].h) / hcpRange) * ch;
          if (hi === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        
        // Dot at last point
        var lastPt = hist[hist.length - 1];
        var lx = pad.left + ((lastPt.d - minDate) / (maxDate - minDate)) * cw;
        var ly = pad.top + ((maxHcp - lastPt.h) / hcpRange) * ch;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(lx, ly, isCurrent ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Label at end with variation
        ctx.fillStyle = color;
        ctx.font = (isCurrent ? "bold " : "") + "10px system-ui, sans-serif";
        ctx.textAlign = "left";
        var labelName = p.name.split(" ")[0];
        if (p.name.split(" ").length > 1) labelName += " " + p.name.split(" ")[p.name.split(" ").length-1].charAt(0) + ".";
        var firstPt = hist[0];
        var hcpDiff = lastPt.h - firstPt.h;
        var diffStr = hcpDiff < 0 ? ("▼" + Math.abs(hcpDiff).toFixed(1)) : (hcpDiff > 0 ? ("▲" + hcpDiff.toFixed(1)) : "=");
        // Draw variation above the name
        ctx.save();
        ctx.font = "bold 9px system-ui, sans-serif";
        ctx.fillStyle = hcpDiff < 0 ? "#16a34a" : (hcpDiff > 0 ? "#dc2626" : "#64748b");
        ctx.fillText(diffStr, lx + 8, ly - 8);
        ctx.restore();
        // Draw name + current HCP
        ctx.fillStyle = color;
        ctx.font = (isCurrent ? "bold " : "") + "10px system-ui, sans-serif";
        ctx.fillText(labelName + " " + lastPt.h.toFixed(1), lx + 8, ly + 4);
        ctx.font = "11px system-ui, sans-serif";
      }
      
      // Legend (in original order for stability)
      for (var li = 0; li < filteredPlayers.length; li++) {
        var lp = filteredPlayers[li];
        var lcolor = colorMap[lp.fed] || CHART_COLORS[0];
        var lisCur = lp.fed === CURRENT_FED;
        var lHist = lp.hcpHistory;
        var lDiff = lHist.length >= 2 ? (lHist[lHist.length-1].h - lHist[0].h) : 0;
        var lDiffHtml = lDiff < 0
          ? '<span style="color:#16a34a;font-size:10px;font-weight:700;margin-left:3px">▼' + Math.abs(lDiff).toFixed(1) + '</span>'
          : (lDiff > 0 ? '<span style="color:#dc2626;font-size:10px;font-weight:700;margin-left:3px">▲' + lDiff.toFixed(1) + '</span>'
          : '<span style="color:#64748b;font-size:10px;margin-left:3px">=</span>');
        legendHtml += '<span class="cross-legend-item">' +
                      '<span class="cross-legend-dot" style="background:' + lcolor + '"></span>' +
                      (lisCur ? '<b>' : '') + lp.name + (lisCur ? '</b>' : '') +
                      ' <span style="font-size:10px;color:#64748b">' + lHist[lHist.length-1].h.toFixed(1) + '</span>' +
                      lDiffHtml +
                      '</span>';
      }
      
      if (legendEl) legendEl.innerHTML = legendHtml;
    }
  }

  // Redraw charts on window resize
  var resizeTimer;
  window.addEventListener("resize", function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){ renderCrossCharts(); }, 150);
  });

  // ========= Analysis: Performance vs Par Histogram, Career Trajectory & Records =========
  function filterByPeriod(months) {
    if (!AN_ROUNDS || AN_ROUNDS.length === 0) return [];
    if (months <= 0) return AN_ROUNDS;
    var cutoff = Date.now() - months * 30.44 * 24 * 3600 * 1000;
    return AN_ROUNDS.filter(function(r) { return r.ds >= cutoff; });
  }
  
  function buildHistogram(rounds) {
    var el = document.getElementById("stbHistogram");
    if (!el) return;
    var diffs = [];
    for (var i = 0; i < rounds.length; i++) {
      var r = rounds[i];
      if (r.gross != null && r.par != null && r.par > 0) {
        var diff = r.gross - r.par;
        if (r.hc === 9) diff = diff * 2; // Normalizar 9B → 18B
        diffs.push(diff);
      }
    }
    if (diffs.length === 0) { el.innerHTML = '<div class="muted">Sem dados de par</div>'; return; }
    
    var bins = [
      { label: "Excepcional (≤0)",  min: -999, max: 0,  color: "#0d9488" },
      { label: "Bom (+1 a +5)",     min: 1,    max: 5,  color: "#22c55e" },
      { label: "Razoável (+6 a +10)", min: 6,  max: 10, color: "#3b82f6" },
      { label: "Difícil (+11 a +15)", min: 11, max: 15, color: "#f59e0b" },
      { label: "Fraco (+16 a +20)", min: 16,   max: 20, color: "#f97316" },
      { label: "Mau (+21 a +25)",   min: 21,   max: 25, color: "#ef4444" },
      { label: "Desastroso (>+25)", min: 26,   max: 999, color: "#991b1b" }
    ];
    var maxCount = 0;
    for (var b = 0; b < bins.length; b++) {
      bins[b].count = 0;
      for (var s = 0; s < diffs.length; s++) {
        if (diffs[s] >= bins[b].min && diffs[s] <= bins[b].max) bins[b].count++;
      }
      if (bins[b].count > maxCount) maxCount = bins[b].count;
    }
    
    // Média e mediana
    var sum = 0;
    for (var i = 0; i < diffs.length; i++) sum += diffs[i];
    var avg = (sum / diffs.length).toFixed(1);
    var sorted = diffs.slice().sort(function(a,b){ return a - b; });
    var median = sorted.length % 2 === 0
      ? ((sorted[sorted.length/2 - 1] + sorted[sorted.length/2]) / 2).toFixed(0)
      : sorted[Math.floor(sorted.length/2)];
    
    var html = '';
    for (var b = 0; b < bins.length; b++) {
      var pct = maxCount > 0 ? Math.max(4, (bins[b].count / maxCount) * 100) : 4;
      var countLabel = bins[b].count > 0 ? bins[b].count : '';
      html += '<div class="an-hist-row">' +
        '<div class="an-hist-label">' + bins[b].label + '</div>' +
        '<div class="an-hist-bar-wrap"><div class="an-hist-bar" style="width:' + pct + '%;background:' + bins[b].color + '">' + countLabel + '</div></div>' +
        '</div>';
    }
    html += '<div class="muted" style="margin-top:6px;text-align:center;font-size:11px">' + diffs.length + ' rondas · Média: +' + avg + ' · Mediana: +' + median;
    var n9 = 0; for (var i = 0; i < rounds.length; i++) { if (rounds[i].hc === 9 && rounds[i].gross != null && rounds[i].par != null) n9++; }
    if (n9 > 0) html += '<br>' + n9 + ' rondas 9B normalizadas (×2)';
    html += '</div>';
    el.innerHTML = html;
  }

  function buildTrajectory(rounds) {
    var el = document.getElementById("trajectoryCards");
    if (!el) return;
    if (rounds.length < 3) { el.innerHTML = '<div class="muted">Poucos dados</div>'; return; }
    
    // Normalizar gross para 18 buracos
    function norm18(r) {
      if (r.gross == null) return null;
      return r.hc === 9 ? r.gross * 2 : r.gross;
    }
    
    var grosses = [];
    for (var i = 0; i < rounds.length; i++) {
      var g = norm18(rounds[i]);
      if (g != null) grosses.push({ g: g, ds: rounds[i].ds });
    }
    if (grosses.length < 3) { el.innerHTML = '<div class="muted">Poucos dados</div>'; return; }
    
    // Sort ascending by date
    grosses.sort(function(a,b){ return a.ds - b.ds; });
    
    // 1. Career Span
    var firstDs = grosses[0].ds;
    var lastDs = grosses[grosses.length - 1].ds;
    var spanMs = lastDs - firstDs;
    var spanYears = Math.max(1, Math.round(spanMs / (365.25 * 24 * 3600 * 1000) * 10) / 10);
    var roundsPerYear = Math.round(grosses.length / Math.max(0.5, spanYears));
    var spanDisplay = spanYears < 1.5 ? (Math.round(spanMs / (30.44 * 24 * 3600 * 1000)) + ' meses') : (spanYears.toFixed(1) + ' anos');
    
    // 2. Peak Performance (best 10-round rolling average)
    var windowSize = Math.min(10, grosses.length);
    var peakAvg = 999;
    for (var i = 0; i <= grosses.length - windowSize; i++) {
      var sum = 0;
      for (var j = i; j < i + windowSize; j++) sum += grosses[j].g;
      var avg = sum / windowSize;
      if (avg < peakAvg) peakAvg = avg;
    }
    
    // 3. Recent Form (last 20 avg + trend)
    var last20 = grosses.slice(-Math.min(20, grosses.length));
    var sumL20 = 0;
    for (var i = 0; i < last20.length; i++) sumL20 += last20[i].g;
    var avgL20 = sumL20 / last20.length;
    
    // Trend: compare first half vs second half of last 20
    var halfLen = Math.floor(last20.length / 2);
    var trend = '';
    if (halfLen >= 3) {
      var sumFirst = 0, sumSecond = 0;
      for (var i = 0; i < halfLen; i++) sumFirst += last20[i].g;
      for (var i = halfLen; i < last20.length; i++) sumSecond += last20[i].g;
      var avgFirst = sumFirst / halfLen;
      var avgSecond = sumSecond / (last20.length - halfLen);
      var diff = avgSecond - avgFirst;
      if (diff < -1.5) trend = '<span style="color:#16a34a">📈 A melhorar</span>';
      else if (diff > 1.5) trend = '<span style="color:#dc2626">📉 A piorar</span>';
      else trend = '<span style="color:#64748b">➡️ Estável</span>';
    }
    
    // 4. vs Career Average
    var sumAll = 0;
    for (var i = 0; i < grosses.length; i++) sumAll += grosses[i].g;
    var careerAvg = sumAll / grosses.length;
    var vsDiff = avgL20 - careerAvg;
    var vsColor = vsDiff < 0 ? '#16a34a' : (vsDiff > 0 ? '#dc2626' : '#64748b');
    var vsSign = vsDiff > 0 ? '+' : '';
    
    function tCard(label, value, sub, bg, valueColor) {
      return '<div style="background:' + bg + ';border-radius:10px;padding:10px 8px;text-align:center">' +
        '<div class="muted" style="font-size:10px;margin-bottom:2px">' + label + '</div>' +
        '<div style="font-size:22px;font-weight:900;color:' + (valueColor || '#1e293b') + '">' + value + '</div>' +
        (sub ? '<div style="font-size:11px;color:#64748b;margin-top:1px">' + sub + '</div>' : '') +
        '</div>';
    }
    
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
    html += tCard('CARREIRA', spanDisplay, roundsPerYear + ' rondas/ano', '#f0fdf4', '#166534');
    html += tCard('PICO', peakAvg.toFixed(1), 'média ' + windowSize + ' rondas', '#eff6ff', '#1d4ed8');
    html += tCard('FORMA ACTUAL', avgL20.toFixed(1), trend || ('últimas ' + last20.length), '#fefce8', '#854d0e');
    html += tCard('vs MÉDIA CARREIRA', vsSign + vsDiff.toFixed(1), 'últimas ' + last20.length + ' vs total', vsDiff < 0 ? '#f0fdf4' : '#fef2f2', vsColor);
    html += '</div>';
    html += '<div class="muted" style="margin-top:6px;text-align:center;font-size:10px">Gross normalizado 18B</div>';
    el.innerHTML = html;
  }
  
  function buildRecords(rounds) {
    var el = document.getElementById("recCards");
    if (!el) return;
    if (rounds.length === 0) { el.innerHTML = '<div class="muted">Sem dados</div>'; return; }
    
    var bestGross = null, bestStb = null, bestSD = null, lowHcp = null;
    for (var i = 0; i < rounds.length; i++) {
      var r = rounds[i];
      if (r.gross != null && (bestGross == null || r.gross < bestGross.gross)) bestGross = r;
      if (r.stb != null) {
        var stb18 = r.hc === 9 ? r.stb + 17 : r.stb;
        if (bestStb == null || stb18 > bestStb._stb18) bestStb = Object.assign({}, r, { _stb18: stb18 });
      }
      if (r.sd != null && (bestSD == null || r.sd < bestSD.sd)) bestSD = r;
      if (r.hi != null && (lowHcp == null || r.hi < lowHcp.hi)) lowHcp = r;
    }
    
    function recCard(emoji, label, val, color, detail) {
      return '<div class="an-rec-item">' +
        '<div class="an-rec-label">' + emoji + ' ' + label + '</div>' +
        '<div class="an-rec-val" style="color:' + color + '">' + val + '</div>' +
        (detail ? '<div class="an-rec-detail">' + detail + '</div>' : '') +
        '</div>';
    }
    
    var html = '<div class="an-rec-grid">';
    html += recCard('🏆', 'MELHOR GROSS', bestGross ? bestGross.gross : '—', '#0369a1',
      bestGross ? bestGross.course + ' · ' + bestGross.date + (bestGross.hc === 9 ? ' (9B)' : '') : '');
    html += recCard('⭐', 'MELHOR STABLEFORD', bestStb ? bestStb._stb18 + (bestStb.hc === 9 ? ' <span style="font-size:11px;font-weight:400;color:#94a3b8">('+bestStb.stb+'+17)</span>' : '') : '—', '#7c3aed',
      bestStb ? bestStb.course + ' · ' + bestStb.date : '');
    html += recCard('🎯', 'MELHOR SD', bestSD ? bestSD.sd.toFixed(1) : '—', '#16a34a',
      bestSD ? bestSD.course + ' · ' + bestSD.date : '');
    html += recCard('📉', 'HCP MAIS BAIXO', lowHcp ? lowHcp.hi.toFixed(1) : '—', '#16a34a',
      lowHcp ? lowHcp.date : '');
    html += '</div>';
    html += '<div class="muted" style="margin-top:6px;text-align:center;font-size:11px">Em ' + rounds.length + ' rondas</div>';
    el.innerHTML = html;
  }
  
  function refreshAnalysisCards() {
    var stbSel = document.getElementById("stbPeriod");
    var recSel = document.getElementById("recPeriod");
    var trajSel = document.getElementById("trajPeriod");
    if (stbSel) buildHistogram(filterByPeriod(parseInt(stbSel.value, 10)));
    if (recSel) buildRecords(filterByPeriod(parseInt(recSel.value, 10)));
    if (trajSel) buildTrajectory(filterByPeriod(parseInt(trajSel.value, 10)));
  }
  
  // Info toggle handlers
  document.addEventListener("click", function(e) {
    var toggle = e.target.closest(".info-toggle");
    if (!toggle) return;
    var targetId = toggle.getAttribute("data-target");
    if (!targetId) return;
    var el = document.getElementById(targetId);
    if (el) el.style.display = el.style.display === "none" ? "block" : "none";
  });

  // Period change handlers
  document.addEventListener("change", function(e) {
    if (e.target.id === "stbPeriod") buildHistogram(filterByPeriod(parseInt(e.target.value, 10)));
    if (e.target.id === "recPeriod") buildRecords(filterByPeriod(parseInt(e.target.value, 10)));
    if (e.target.id === "trajPeriod") buildTrajectory(filterByPeriod(parseInt(e.target.value, 10)));
  });

  // ========= Last 20 table sorting =========
  var last20SortCol = -1, last20SortDir = 0; // 0=none, 1=asc, -1=desc
  document.addEventListener("click", function(e) {
    var th = e.target.closest(".an-sortable");
    if (!th) return;
    var table = th.closest("table");
    if (!table || table.id !== "last20Table") return;
    
    var col = parseInt(th.getAttribute("data-col"), 10);
    // Toggle direction
    if (last20SortCol === col) {
      last20SortDir = last20SortDir === 1 ? -1 : (last20SortDir === -1 ? 0 : 1);
    } else {
      last20SortCol = col;
      last20SortDir = 1;
    }
    
    // Update header indicators
    var allTh = table.querySelectorAll("th.an-sortable");
    for (var t = 0; t < allTh.length; t++) {
      allTh[t].classList.remove("sort-asc", "sort-desc");
    }
    if (last20SortDir === 1) th.classList.add("sort-asc");
    else if (last20SortDir === -1) th.classList.add("sort-desc");
    
    var tbody = table.querySelector("tbody");
    var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
    
    if (last20SortDir === 0) {
      // Restore original order by date descending
      rows.sort(function(a, b) {
        return parseFloat(b.getAttribute("data-sort-date") || 0) - parseFloat(a.getAttribute("data-sort-date") || 0);
      });
    } else {
      // Map col index to data-sort attribute
      var attrMap = { 0: "data-sort-date", 3: "data-sort-bur", 4: "data-sort-hcp", 6: "data-sort-dist", 7: "data-sort-gross", 8: "data-sort-stb", 9: "data-sort-sd" };
      var attr = attrMap[col];
      var isText = (col === 0 || col === 1);
      
      rows.sort(function(a, b) {
        var va, vb;
        if (col === 1) {
          // Sort by campo text
          va = (a.cells[1] ? a.cells[1].textContent : '').toLowerCase();
          vb = (b.cells[1] ? b.cells[1].textContent : '').toLowerCase();
          return last20SortDir * va.localeCompare(vb);
        }
        if (attr) {
          va = parseFloat(a.getAttribute(attr) || 0);
          vb = parseFloat(b.getAttribute(attr) || 0);
        } else {
          va = (a.cells[col] ? a.cells[col].textContent : '').toLowerCase();
          vb = (b.cells[col] ? b.cells[col].textContent : '').toLowerCase();
          return last20SortDir * va.localeCompare(vb);
        }
        return last20SortDir * (va - vb);
      });
    }
    
    for (var ri = 0; ri < rows.length; ri++) tbody.appendChild(rows[ri]);
  });

})();

</script>
</body>
</html>`;

  fs.writeFileSync(htmlPath, byCourseHtml, "utf-8");
  console.log(`OK -> ${htmlPath}`);
}

// IIFE principal: descobrir jogadores e processar todos
(async () => {
  const FED = (process.argv[2] || "").trim();
  const outputRoot = path.join(process.cwd(), "output");

  if (FED === "--all" || FED === "") {
    // Processar TODOS os jogadores
    console.log("Modo: todos os jogadores");
    const allPlayers = discoverPlayers(outputRoot, null);
    if (allPlayers.length === 0) {
      console.error("Nenhum jogador encontrado em output/");
      process.exit(1);
    }
    console.log(`\nEncontrados ${allPlayers.length} jogadores\n`);
    const crossStats = extractAllPlayerStats(allPlayers, outputRoot);
    for (const p of allPlayers) {
      try {
        processPlayer(p.fed, allPlayers, crossStats);
      } catch (e) {
        console.error(`Erro ao processar ${p.name} (${p.fed}):`, e.message || e);
      }
    }
    console.log(`\nTodos os ${allPlayers.length} jogador(es) processados.`);
  } else if (/^\d+$/.test(FED)) {
    // Processar UM jogador
    const baseDir = path.join(outputRoot, FED);
    if (!fs.existsSync(path.join(baseDir, "whs-list.json"))) {
      console.error("Não encontrei:", path.join(baseDir, "whs-list.json"));
      process.exit(1);
    }
    if (!fs.existsSync(path.join(baseDir, "scorecards"))) {
      console.error("Não encontrei:", path.join(baseDir, "scorecards"));
      process.exit(1);
    }
    console.log(`Modo: jogador ${FED}`);
    const allPlayers = discoverPlayers(outputRoot, FED);
    const crossStats = extractAllPlayerStats(allPlayers, outputRoot);
    try {
      processPlayer(FED, allPlayers, crossStats);
      const p = allPlayers.find(x => x.fed === FED);
      console.log(`\n✓ ${p ? p.name : FED} processado.`);
    } catch (e) {
      console.error(`Erro ao processar ${FED}:`, e.message || e);
    }
  } else {
    console.log(`
Uso:
  node make-scorecards-ui.js <FED>    Gerar HTML de um jogador
  node make-scorecards-ui.js --all    Gerar HTML de todos
  node make-scorecards-ui.js          Gerar HTML de todos
`);
    process.exit(0);
  }
})();
