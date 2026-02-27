// lib/helpers.js — Utility functions
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "")
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
  const normK = (s)=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const keys = Object.keys(row);
  for (const k of keys) {
    const nk = normK(k);
    if (nk.includes("handicap") && nk.includes("index")) {
      const n = toNum(row[k]);
      if (n != null && Number.isFinite(n)) return String(n);
    }
    if (nk === "hi" || nk.endsWith(" hi") || nk.includes(" handicap index")) {
      const n = toNum(row[k]);
      if (n != null && Number.isFinite(n)) return String(n);
    }
  }
  for (const k of keys) {
    const nk = normK(k);
    if (nk.includes("hcp") || nk.includes("handicap")) {
      const n = toNum(row[k]);
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

// Mapa de normalização de nomes de campo — variantes → nome canónico
const COURSE_NAME_MAP = {
  "villa padierna flamingos": "Villa Padierna Flamingos",
  "villa padierna - flamingos": "Villa Padierna Flamingos",
  "villa padierna– flamingos": "Villa Padierna Flamingos",
  "pga aroeira no. 2": "PGA  Aroeira No.2",
  "pga  aroeira no. 2": "PGA  Aroeira No.2",
  "pga aroeira no.2": "PGA  Aroeira No.2",
};

function normalizeCourse(name) {
  if (!name) return name;
  const key = name.trim().toLowerCase();
  return COURSE_NAME_MAP[key] || name;
}

function getCourse(rec, whsRow) {
  var course = rec?.course_description || whsRow?.course_description || whsRow?.course || "Campo desconhecido";
  var tournName = rec?.tourn_name || whsRow?.tourn_name || "";
  if (course && tournName && course === tournName) {
    return "INTERNACIONAL";
  }
  return normalizeCourse(course);
}

const COURSE_9H_RULES = [
  { parent: "Santo da Serra", pattern: /^Santo da Serra\s*[-–]\s*([\w\u00C0-\u024F]+)\s*[-–]\s*([\w\u00C0-\u024F]+)/i },
  { parent: "Vila Sol", pattern: /^Vila Sol\s*[-–]\s*([\w\u00C0-\u024F]+)\s*[\/\-–]\s*([\w\u00C0-\u024F]+)/i },
  { parent: "Pinheiros Altos", pattern: /^Pinheiros Altos\s*[-–]\s*([\w\u00C0-\u024F]+)\s*[\/\-–]\s*([\w\u00C0-\u024F]+)/i },
  { parent: "Castro Marim", pattern: /^Castro Marim\s*[-–]\s*([\w\u00C0-\u024F]+)\s*[+\/\-–]\s*([\w\u00C0-\u024F]+)/i },
  { parent: "Palmares", pattern: /^Palmares\s*[-–]\s*([\w\u00C0-\u024F]+)\s*[\/\-–]\s*([\w\u00C0-\u024F]+)/i },
  { parent: "Penha Longa", pattern: /^Penha Longa\s*[-–]\s*([\w\u00C0-\u024F]+)\s*[\/\-–]\s*([\w\u00C0-\u024F]+)/i },
];

function courseAlias(courseName, holeCount, rec) {
  if (holeCount !== 9) return courseName;
  for (const rule of COURSE_9H_RULES) {
    const m = courseName.match(rule.pattern);
    if (!m) continue;
    const f9Name = m[1];
    const b9Name = m[2];
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

function nameSimilarity(name1, name2, course1, course2) {
  if (!name1 || !name2) return 0;
  var n1 = norm(name1);
  var n2 = norm(name2);
  if (n1 === n2) return 1;
  var normalize = function(s) {
    return s
      .replace(/internancional/g, 'internacional')
      .replace(/internaccional/g, 'internacional')
      .replace(/interacional/g, 'internacional');
  };
  n1 = normalize(n1);
  n2 = normalize(n2);
  if (n1 === n2) return 1;
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
    if (w1.length === 0 && w2.length === 0) {
      if (course1 && course2 && norm(course1) === norm(course2)) return 0.95;
      return 0.8;
    }
  }
  var patterns = [/\bd[1-9]\b/g, /\bdia\s*[1-9]\b/gi, /\b[1-9]a?\s*(volta|ronda|dia)\b/gi, /\b(primeira|segunda|terceira|quarta)\s*(volta|ronda)\b/gi];
  var base1 = n1, base2 = n2;
  patterns.forEach(function(p){
    base1 = base1.replace(p, '');
    base2 = base2.replace(p, '');
  });
  base1 = base1.replace(/\s+/g, ' ').trim();
  base2 = base2.replace(/\s+/g, ' ').trim();
  if (base1 === base2 && base1.length > 5) return 1;
  var words1 = n1.split(/\s+/).filter(function(w){ return w.length > 2; });
  var words2 = n2.split(/\s+/).filter(function(w){ return w.length > 2; });
  if (words1.length === 0 || words2.length === 0) return 0;
  var common = 0;
  words1.forEach(function(w1){
    if (words2.some(function(w2){ return w2.indexOf(w1) >= 0 || w1.indexOf(w2) >= 0; })) {
      common++;
    }
  });
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

/**
 * normalizeWhsRows(rows)
 * A FPG tem 2 schemas de API:
 *   Schema 1 (HCPWhsFederLST): new_handicap, hcp_date, tourn_name, sgd, calc_*
 *   Schema 2 (ResultsLST):     exact_hcp, score_date, tournament_description, score_differential
 * Esta função normaliza Schema 2 → nomes Schema 1 para que o resto do código funcione.
 * NÃO mapeia calculated_exact_hcp → new_handicap (é HCP pré-ronda, não pós-ronda).
 */
function normalizeWhsRows(rows) {
  for (const r of rows) {
    // Tag schema para debug
    if (r.score_date != null && r.hcp_date == null) r._schema = 2;
    else if (r.hcp_date != null) r._schema = 1;
    // score_id / id
    if (!r.score_id && r.id) r.score_id = r.id;
    if (!r.id && r.score_id) r.id = r.score_id;
    // tourn_name ← tournament_description
    if (!r.tourn_name && r.tournament_description) r.tourn_name = r.tournament_description;
    // federated_code ← federation_code
    if (!r.federated_code && r.federation_code) r.federated_code = r.federation_code;
    // holes ← hole_count
    if (r.holes == null && r.hole_count != null) r.holes = r.hole_count;
    // par ← par_total
    if (r.par == null && r.par_total != null) r.par = r.par_total;
    // stableford ← calculated_stablnet_total
    if (r.stableford == null && r.calculated_stablnet_total != null) r.stableford = r.calculated_stablnet_total;
    // sgd (Score Differential) ← score_differential
    if (r.sgd == null && r.score_differential != null) r.sgd = r.score_differential;
    // gross ← gross_total ou calc_field1
    if (r.gross == null) {
      if (r.gross_total != null) r.gross = r.gross_total;
      else if (r.calc_field1 != null) r.gross = r.calc_field1;
    }
    // exact_handicap ← exact_hcp (pre-round HI)
    if (r.exact_handicap == null && r.exact_hcp != null) r.exact_handicap = r.exact_hcp;
    // NÃO mapear calculated_exact_hcp → new_handicap!
    // No Schema 2, calculated_exact_hcp = exact_hcp = HCP PRÉ-ronda.
    // prev_handicap ← exact_hcp (aproximação)
    if (r.prev_handicap == null && r.exact_hcp != null) r.prev_handicap = r.exact_hcp;
    // play_handicap ← play_hcp
    if (r.play_handicap == null && r.play_hcp != null) r.play_handicap = r.play_hcp;
    // hcp_date / hcp_dateStr ← score_date / score_dateStr
    if (!r.hcp_date && r.score_date) r.hcp_date = r.score_date;
    if (!r.hcp_dateStr && r.score_dateStr) {
      r.hcp_dateStr = r.score_dateStr.substring(0, 10);
    }
    // played_at ← score_date (Schema 2) ou hcp_date (Schema 1)
    if (!r.played_at && r.score_date) r.played_at = r.score_date;
    if (!r.played_at && r.hcp_date) r.played_at = r.hcp_date;
    // score_origin: Schema 2 já tem este campo
  }
  return rows;
}

module.exports = {
  norm, esc, parseDotNetDate, fmtDate, toNum, pickHcpFromRow, isMeaningful,
  pickScorecardRec, metersTotalFromRec, getTee, getCourse, COURSE_9H_RULES,
  courseAlias, getPlayedAt, pickEventName, nameSimilarity, pickGrossFromWHS,
  normalizeWhsRows, normalizeCourse
};
