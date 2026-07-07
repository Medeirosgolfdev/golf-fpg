/**
 * scripts/lib/course-aliases.cjs
 *
 * ESPELHO (parcial) de `src/utils/courseAliases.ts` para uso em scripts Node
 * (CommonJS). O Node não consegue importar o .ts directamente, e o
 * `build-course-players.js` precisa da MESMA canonização de nomes que a app usa
 * em runtime — caso contrário o cruzamento jogador↔campo perde ~16% das voltas
 * (nomes FPG curtos/variantes que não batem com o master: "Aroeira I",
 * "Oceânico Faldo", "Tróia", "Porto Santo", combos do Santo da Serra, etc.).
 *
 * ⚠ MANTER SINCRONIZADO com src/utils/courseAliases.ts (precedente do projeto:
 * colors.ts espelha tokens.css). Ao adicionar um alias num, adicionar no outro.
 *
 * Exporta:
 *   norm(s)                               — normalização (= courseAliases/norm)
 *   canonicalCourseName(name)             — sufixos + COURSE_NAME_ALIASES
 *   resolveAroeiraIIByPar(name, pars18)   — "Aroeira II" → No.1/No.2 pelo par
 *   resolveRibagolfeKeyByPar(name, pars18)— "Ribagolfe I/II" → courseKey pelo par
 *   resolveSantoDaSerraKeyByPar(name, p)  — combos/loops do SdS → courseKey pelo par
 *   resolveSantoDaSerraKeyByName(name)    — idem, fallback só pelo nome (sem par)
 */

function norm(s) {
  return String(s || "").trim().normalize("NFKD")
    .replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}
function aliasKey(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

const SUFFIX_PATTERNS = [
  /\s*[-–—]\s*CNJ(?:\s+FPG)?\s*$/i,
  /\s*[-–—]\s*CN(?:\s+FPG)?\s*$/i,
  /\s*[-–—]\s*CNS(?:\s+FPG)?\s*$/i,
];

const COURSE_NAME_ALIASES = {
  "aroeira challenge": "PGA  Aroeira No.2",
  "aroeira pines classic": "PGA  Aroeira No.1",
  "aroeira i": "PGA  Aroeira No.1",
  "oceânico o'connor": "O'Connor Jnr Course",
  "oceanico o'connor": "O'Connor Jnr Course",
  // NOVO 2026-06-13: Oceânico Faldo → Faldo Course (mesmo campo, Amendoeira).
  "oceânico faldo": "Faldo Course",
  "oceanico faldo": "Faldo Course",
  "morgado do reguengo golfe": "Morgado Golf",
  "montebelo": "Montebelo Caramulo (1-18)",
  "montebelo a-b": "Montebelo Caramulo (1-18)",
  "vila sol (challenge / prestige)": "Vila Sol - Challenge / Prestige (10-27)",
  "vila sol (prestige / prime)": "Vila Sol - Prestige / Prime (19-9)",
  "vila sol (prime / challenge)": "Vila Sol - Prime / Challenge (1-18)",
  "vila sol 1 (prime / challenge)": "Vila Sol - Prime / Challenge (1-18)",
  "pinheiros altos": "Pinheiros Altos-Corks/Olives",
  "pinheiros altos-oliveiras/pinheiros": "Pinheiros Altos-Olives/Pines",
  "pinheiros altos-pinheiros/sobreiros": "Pinheiros Altos-Pines/Corks",
  "penha longa - atlântico": "Penha Longa Atlantic Championship",
  "penha longa - atlantico": "Penha Longa Atlantic Championship",
  "palmares golf": "Palmares Golf Lagos - Praia",
  "golden palm": "Trump Doral - Golden Palm",
  "red tiger": "Trump Doral - Red Tiger",
  "silver fox": "Trump Doral - Silver Fox",
  "blue monster": "Trump Doral - Blue Monster",
  "golf du touquet la foret": "Le Touquet Golf Club - La Forêt",
  "golf du touquet - la mer": "Golf Du Touquet - La Mer",
  "golf du touquet la mer": "Golf Du Touquet - La Mer",
  "toya golf & country wroclaw": "Toya Golf & Country Club Wroclaw",
  "real club de golf el prat. barcelona": "Real Club de Golf El Prat",
  "sedgefleld country club - donald ross course": "Sedgefield Country Club",
  "glen golf course": "Glen Golf Club",
  "chantilly vineuil new": "Golf de Chantilly Parcours de Vineul",
  "vierumakki": "vierumaki golf club",
  "454golf du médoc": "Golf du Médoc",
  "pga catalunya resort, spain": "PGA Catalunya Resort",
  // ── NOVOS 2026-06-13 — nomes curtos FPG p/ campos PT do master ──
  "tróia": "Troia Golf",
  "troia": "Troia Golf",
  "porto santo": "Porto Santo Golfe",
  "santo estevão": "Santo Estevão Golf",
  "santo estevao": "Santo Estevão Golf",
  // ── NOVO 2026-07-07 — Paris Invitational (Golf Val d'Europe Disneyland) ──
  // Apenas para variantes de "GOLF VAL D'EUROPE" — NÃO fazer alias para "INTERNACIONAL"
  // porque esse é genérico para TODOS os torneios internacionais
  // Canónico = nome CURTO "Val d'Europe" (decisão 2026-07-07: o nome completo
  // "Golf Paris Val d'Europe Disneyland - RED/BLUE" é demasiado extenso nas
  // listagens; o pipeline canonicaliza course_description em process-data.js,
  // por isso o canónico TEM de ser o curto). Espelha src/utils/courseAliases.ts.
  "golf val d'europe": "Val d'Europe",
  "golf val d´europe": "Val d'Europe",
  "golf val deurope": "Val d'Europe",
  "val d'europe": "Val d'Europe",
  "val d´europe": "Val d'Europe",
  "val deurope": "Val d'Europe",
  "golf paris val d'europe disneyland - red/blue": "Val d'Europe",
};

function canonicalCourseName(name) {
  if (!name || typeof name !== "string") return name;
  let out = name;
  for (const re of SUFFIX_PATTERNS) {
    if (re.test(out)) { out = out.replace(re, "").trim(); break; }
  }
  const a = COURSE_NAME_ALIASES[aliasKey(out)];
  if (a) out = a;
  return out;
}

/* ── Aroeira II por par ──────────────────────────────────────────────────── */
const AROEIRA_PAR_TO_COURSE = {
  "[4,5,4,5,3,4,4,3,4,4,5,3,4,3,4,4,4,5]": "PGA  Aroeira No.2",
  "[4,3,4,4,4,5,4,5,4,5,3,4,4,3,4,4,5,3]": "PGA  Aroeira No.2",
  "[5,4,4,3,4,4,4,3,5,5,4,4,4,3,5,3,4,4]": "PGA  Aroeira No.1",
};
function resolveAroeiraIIByPar(name, pars) {
  if (aliasKey(name) !== "aroeira ii") return name;
  if (!Array.isArray(pars) || pars.length !== 18) return name;
  return AROEIRA_PAR_TO_COURSE[JSON.stringify(pars)] || name;
}

/* ── Ribagolfe I/II por par → courseKey (decisão 2026-06-13: resolver por par,
 *    sem assumir I=Lakes/II=Oaks). Pars extraídos de master-courses.json. ──── */
const RIBAGOLFE_PAR_TO_KEY = {
  "[4,5,4,4,3,5,4,3,4,4,4,5,4,4,3,5,3,4]": "ribagolfe-lakes",
  "[5,4,3,4,3,4,4,5,4,4,4,3,5,4,3,4,4,5]": "ribagolfe-oaks",
};
function resolveRibagolfeKeyByPar(name, pars) {
  if (!/^\s*ribagolfe\b/i.test(String(name || ""))) return null;
  if (!Array.isArray(pars) || pars.length !== 18) return null;
  return RIBAGOLFE_PAR_TO_KEY[JSON.stringify(pars)] || null;
}
// Fallback por nome (voltas sem scorecard). I=Lakes / II=Oaks VERIFICADO por par:
// 459 voltas resolvidas por par são 100% consistentes (I→Lakes 273, II→Oaks 186,
// 0 exceções). Logo o fallback por nome é seguro para as voltas sem par.
const RIBAGOLFE_NAME_TO_KEY = { i: "ribagolfe-lakes", ii: "ribagolfe-oaks" };
function resolveRibagolfeKeyByName(name) {
  const m = String(name || "").match(/^\s*ribagolfe\s+(i{1,2})\b/i);
  return m ? (RIBAGOLFE_NAME_TO_KEY[m[1].toLowerCase()] || null) : null;
}

/* ── Santo da Serra — 3 nines (par 36 cada) → combos do master ────────────── */
const SDS_NINES = {
  "[4,4,5,3,4,4,5,3,4]": "machico",
  "[4,5,4,4,4,3,5,3,4]": "desertas",
  "[5,4,4,4,3,4,4,3,5]": "serras",
};
// Chave = nines ordenados alfabeticamente, separados por "|".
const SDS_COMBO_KEY = {
  "desertas|serras": "santo-da-serra-desertas-serras",
  "desertas|machico": "santo-da-serra-machico-desertas",
  "machico|serras": "santo-da-serra-serras-machico",
  "serras|serras": "santo-da-serra-serras-serras",
};
// 9 buracos de loop único → combo onde esse nine é o FRONT-nine (F9). Assim
// nenhuma volta de 9 se perde; aparece na linha "9b" desse combo na UI.
const SDS_NINE_KEY = {
  "serras": "santo-da-serra-serras-serras",       // F9 de serras-serras
  "desertas": "santo-da-serra-desertas-serras",   // F9 de desertas-serras
  "machico": "santo-da-serra-machico-desertas",   // F9 de machico-desertas
};
function isSantoDaSerra(name) {
  return /santo\s+da\s+serra|sto\.?\s+da\s+serra|s\.\s*da\s+serra/i.test(String(name || ""));
}
function _nine(p9) {
  return (Array.isArray(p9) && p9.length === 9) ? (SDS_NINES[JSON.stringify(p9)] || null) : null;
}
function resolveSantoDaSerraKeyByPar(name, pars) {
  if (!isSantoDaSerra(name) || !Array.isArray(pars)) return null;
  if (pars.length === 9) {
    const n = _nine(pars);
    return n ? (SDS_NINE_KEY[n] || null) : null;
  }
  if (pars.length === 18) {
    const f = _nine(pars.slice(0, 9)), b = _nine(pars.slice(9, 18));
    if (!f || !b) return null;
    const [a, c] = [f, b].sort();
    return SDS_COMBO_KEY[`${a}|${c}`] || null;
  }
  return null;
}
// Fallback sem par: parsear os nomes dos nines do próprio nome e ordenar.
function resolveSantoDaSerraKeyByName(name) {
  if (!isSantoDaSerra(name)) return null;
  const m = String(name).match(/-\s*([A-Za-zÀ-ÿ]+)\s*[-+/]\s*([A-Za-zÀ-ÿ]+)\s*$/);
  if (m) {
    const [a, b] = [m[1].toLowerCase(), m[2].toLowerCase()].sort();
    return SDS_COMBO_KEY[`${a}|${b}`] || null;
  }
  const m2 = String(name).match(/-\s*([A-Za-zÀ-ÿ]+)\s*$/);
  if (m2) return SDS_NINE_KEY[m2[1].toLowerCase()] || null;
  return null;
}

/* ── Campos multi-loop PT (Vila Sol, Pinheiros Altos, Castro Marim) ─────────
 * Mesmo problema do Santo da Serra: a FPG nomeia por UM nine ("Vila Sol -
 * Prestige") ou por um combo cuja ordem não bate com o master. Resolvemos o
 * combo pelo par[] dos DOIS nines (independente do nome). Assinaturas de par
 * extraídas de master-courses.json (F9/B9 de cada combo). 2026-06-13. */
const MULTILOOP = [
  {
    re: /vila\s*sol/i,
    nines: {
      "[4,5,4,3,5,3,4,4,4]": "challenge",
      "[5,3,4,4,5,4,3,4,4]": "prestige",
      "[4,4,4,3,4,5,3,5,4]": "prime",
    },
    combos: {
      "challenge|prestige": "vila-sol-challenge-prestige-10-27",
      "prestige|prime": "vila-sol-prestige-prime-19-9",
      "challenge|prime": "vila-sol-prime-challenge-1-18",
    },
    // 9 buracos de um nine isolado → combo onde é F9.
    singleNine: {
      "challenge": "vila-sol-challenge-prestige-10-27",
      "prestige": "vila-sol-prestige-prime-19-9",
      "prime": "vila-sol-prime-challenge-1-18",
    },
  },
  {
    re: /pinheiros\s*altos/i,
    nines: {
      "[4,3,4,4,3,4,5,5,4]": "corks",
      "[4,4,5,5,3,4,4,3,4]": "olives",
      "[4,3,4,5,4,5,4,4,3]": "pines",
    },
    combos: {
      "corks|olives": "pinheiros-altos-corksolives",
      "olives|pines": "pinheiros-altos-olivespines",
      "corks|pines": "pinheiros-altos-pinescorks",
    },
    singleNine: {
      "corks": "pinheiros-altos-corksolives",
      "olives": "pinheiros-altos-olivespines",
      "pines": "pinheiros-altos-pinescorks",
    },
  },
  {
    re: /castro\s*marim/i,
    nines: {
      "[4,4,4,3,4,4,4,3,5]": "atlantico",
      "[4,3,4,5,5,3,4,4,4]": "grouse",
      "[4,3,5,5,4,4,3,4,4]": "guadiana",
    },
    combos: {
      "atlantico|grouse": "castro-marim-atlanticogrouse",
      "grouse|guadiana": "castro-marim-grouseguadiana",
      "atlantico|guadiana": "castro-marim-guadianaatlantico",
    },
    singleNine: {
      "atlantico": "castro-marim-atlanticogrouse",
      "grouse": "castro-marim-grouseguadiana",
      "guadiana": "castro-marim-guadianaatlantico",
    },
  },
];
function resolveMultiloopKeyByPar(name, pars) {
  if (!Array.isArray(pars)) return null;
  const s = String(name || "");
  for (const m of MULTILOOP) {
    if (!m.re.test(s)) continue;
    if (pars.length === 9) {
      const nine = m.nines[JSON.stringify(pars)];
      return nine ? (m.singleNine[nine] || null) : null;
    }
    if (pars.length === 18) {
      const f = m.nines[JSON.stringify(pars.slice(0, 9))];
      const b = m.nines[JSON.stringify(pars.slice(9, 18))];
      if (!f || !b) return null;
      const [a, c] = [f, b].sort();
      return m.combos[`${a}|${c}`] || null;
    }
    return null;
  }
  return null;
}
// Fallback por nome (voltas sem scorecard): identifica os nines presentes no
// nome (sem acentos) → 1 nine = singleNine, 2 nines = combo.
function resolveMultiloopKeyByName(name) {
  const s = norm(name);
  for (const m of MULTILOOP) {
    if (!m.re.test(String(name || ""))) continue;
    const present = Object.keys(m.singleNine).filter((n) => s.includes(n));
    if (present.length === 1) return m.singleNine[present[0]];
    if (present.length === 2) {
      const [a, b] = present.slice().sort();
      return m.combos[`${a}|${b}`] || null;
    }
    return null;
  }
  return null;
}

module.exports = {
  norm,
  canonicalCourseName,
  resolveAroeiraIIByPar,
  resolveRibagolfeKeyByPar,
  resolveRibagolfeKeyByName,
  resolveSantoDaSerraKeyByPar,
  resolveSantoDaSerraKeyByName,
  resolveMultiloopKeyByPar,
  resolveMultiloopKeyByName,
};
