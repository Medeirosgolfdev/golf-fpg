#!/usr/bin/env node
/**
 * merge-courses.js
 *
 * Detecta e consolida campos duplicados no away-courses.json.
 *
 * Regras fundamentais:
 *   1. CR+Slope NUNCA é o único critério — só confirma, nunca inicia um match
 *   2. Palavras genéricas (golf, course, club…) não contam para similaridade
 *   3. Nomes inválidos (NONE, N/A…) são completamente ignorados
 *   4. Auto-merge só com nome ≥90% similar + CR+Slope real a confirmar
 *   5. Nome canónico = intersecção de palavras comuns, validada (não pode
 *      resultar em palavras genéricas como "Golf Course")
 *
 * Uso:
 *   node scripts/merge-courses.js
 */

"use strict";

const fs       = require("fs");
const path     = require("path");
const readline = require("readline");

const awayPath    = path.join(process.cwd(), "public", "data", "away-courses.json");
const playersPath = path.join(process.cwd(), "players.json");
const aliasPath   = path.join(process.cwd(), "course-aliases.json");

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

function readJSON(fpath) {
  let txt = fs.readFileSync(fpath, "utf-8");
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
  return JSON.parse(txt);
}

function norm(s) {
  return String(s || "").trim()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function capitalize(s) {
  const lower = new Set(["de","da","do","dos","das","del","el","la","los","las","the","of","and","e","y","i"]);
  return s.split(" ").map((w, i) =>
    (i === 0 || !lower.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w
  ).join(" ");
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
}

function strSim(a, b) {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
}

/* ═══════════════════════════════════════════════════════════════════════════
   NOMES INVÁLIDOS — ignorar completamente
   ═══════════════════════════════════════════════════════════════════════════ */

// Nomes que o sistema coloca quando não tem o campo real.
// Não devem aparecer como candidatos a merge com ninguém.
const INVALID_NAMES = new Set([
  "none","n a","n/a","null","undefined","unknown","?","","sem campo",
  "sem nome","teste","test","campo","course","campo de golfe",
]);

function isInvalidName(name) {
  return INVALID_NAMES.has(norm(name));
}

/* ═══════════════════════════════════════════════════════════════════════════
   PALAVRAS GENÉRICAS — não contribuem para similaridade de nome
   ═══════════════════════════════════════════════════════════════════════════ */

// Palavras tão comuns em nomes de campos de golfe que não distinguem nada.
const GENERIC_WORDS = new Set([
  "golf","course","club","links","resort","park","country","green","field",
  "grounds","centre","center","royal","real","grand","new","old","the","a",
  "de","da","do","e","y","i","and","of",
]);

function stripGeneric(n) {
  return n.split(" ")
    .filter(w => w.length >= 3 && !GENERIC_WORDS.has(w))
    .join(" ")
    .trim();
}

/* ═══════════════════════════════════════════════════════════════════════════
   NOME CANÓNICO — intersecção de palavras comuns
   ═══════════════════════════════════════════════════════════════════════════ */

// Palavras que não fazem sentido sozinhas no fim do nome canónico
const TRAILING_NOISE = new Set([
  "sub","u","de","da","do","dos","das","del","el","la","the","of","and","e","y","i",
  "campeonato","torneio","circuito","copa","cup","open","championship","trophy",
  "national","regional","internacional","games","series","classic","tour","masters",
  "junior","senior","ladies","gents","feminino","masculino","golf","course","club",
  "links","resort","park","country","green","field","centre","center","royal","real",
]);

/**
 * Gera o nome canónico como intersecção das palavras comuns aos dois nomes.
 * Valida que o resultado é significativo (não pode ser só palavras genéricas).
 * Retorna null se não conseguir gerar um nome válido.
 */
function generateCanonicalName(nameA, nameB) {
  const wa = norm(nameA).split(" ");
  const wb = new Set(norm(nameB).split(" "));

  // Palavras em comum, na ordem de A
  let common = wa.filter(w => wb.has(w));

  // Remover ruído do fim
  while (common.length > 0 && TRAILING_NOISE.has(common[common.length - 1]))
    common.pop();
  // Remover ruído do início
  while (common.length > 0 && TRAILING_NOISE.has(common[0]))
    common.shift();

  // Verificar se o resultado tem substância (≥1 palavra não-genérica com ≥4 chars)
  const meaningful = common.filter(w => !GENERIC_WORDS.has(w) && w.length >= 4);
  if (!meaningful.length) return null; // não gerar nome sem substância

  // Adicionar o ano mais recente se presente
  const years = [nameA, nameB]
    .map(n => { const m = norm(n).match(/\b(20\d{2})\b/); return m ? +m[1] : null; })
    .filter(Boolean).sort((a, b) => b - a);
  if (years[0] && !common.includes(String(years[0])))
    common.push(String(years[0]));

  return capitalize(common.join(" "));
}

/* ═══════════════════════════════════════════════════════════════════════════
   SINAIS DOS TEES
   ═══════════════════════════════════════════════════════════════════════════ */

// Valores CR+Slope que o sistema coloca como placeholder quando não tem dados reais.
// Campos com estes valores não se podem identificar por CR+Slope.
const PLACEHOLDER_CR_SLOPE = new Set([
  "72|113","72|117","72|120","72|125","72|130","72|135",
  "71|113","71|117","71|120","70|113","70|117","73|113",
]);

function isPlaceholder(cr, slope) {
  if (!cr || !slope) return true;
  return PLACEHOLDER_CR_SLOPE.has(`${cr}|${slope}`);
}

function teeSignals(course) {
  return (course.master.tees || []).map(t => {
    let sex = (t.sex || "U").toUpperCase();
    if (sex === "U") {
      const tn = norm(t.teeName || "");
      if      (/\b(ladies|feminin|rosa|vermelh|roja|red)\b/.test(tn)) sex = "F";
      else if (/\b(mens?|masculin|gents?|azul|blue|branca|white|amarela)\b/.test(tn)) sex = "M";
    }
    return {
      name:  t.teeName || "?",
      sex,
      cr:    t.ratings?.holes18?.courseRating ?? null,
      slope: t.ratings?.holes18?.slopeRating  ?? null,
      dist:  t.distances?.total               ?? null,
      ok:    !isPlaceholder(t.ratings?.holes18?.courseRating, t.ratings?.holes18?.slopeRating),
    };
  });
}

function compareTees(a, b) {
  const sa = teeSignals(a), sb = teeSignals(b);
  let crSlopeMatch = 0, distMatch = 0;
  const crSlopePairs = [];

  for (const ta of sa) for (const tb of sb) {
    // CR+Slope: ambos têm de ter valores reais (não placeholder)
    // e o sexo tem de ser compatível (M↔M, F↔F, ou U↔qualquer)
    if (ta.ok && tb.ok && ta.cr && tb.cr && ta.slope && tb.slope) {
      const sexOk = ta.sex === "U" || tb.sex === "U" || ta.sex === tb.sex;
      if (sexOk && Math.abs(ta.cr - tb.cr) < 0.15 && ta.slope === tb.slope) {
        crSlopeMatch++;
        crSlopePairs.push(
          `${ta.name}(${ta.sex}) CR${ta.cr}/${ta.slope} ↔ ${tb.name}(${tb.sex})`
        );
      }
    }
    // Distâncias (só quando ambas disponíveis, dentro de 3%)
    if (ta.dist && tb.dist &&
        Math.abs(ta.dist - tb.dist) / Math.max(ta.dist, tb.dist) < 0.03)
      distMatch++;
  }
  return { crSlopeMatch, distMatch, crSlopePairs };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ALGORITMO DE PONTUAÇÃO
   ═══════════════════════════════════════════════════════════════════════════ */

// AUTO  (≥ 100): nome ≥90% similar + CR+Slope confirmado → merge automático
// ASK   (40-99): sinal moderado → pedir confirmação
// SKIP  (<  40): ruído → ignorar
const THRESHOLD_AUTO = 100;
const THRESHOLD_ASK  = 40;

function scoreCandidate(a, b) {
  // Rejeitar nomes inválidos logo à entrada
  if (isInvalidName(a.master.name) || isInvalidName(b.master.name)) return null;

  const na = norm(a.master.name), nb = norm(b.master.name);
  const ga = stripGeneric(na), gb = stripGeneric(nb);

  // Após remover palavras genéricas, tem de restar substância em ambos
  if (ga.length < 5 || gb.length < 5) return null;

  const { crSlopeMatch, distMatch, crSlopePairs } = compareTees(a, b);
  const reasons = [];
  let score = 0;
  let hasNameSignal = false;

  /* ── Sinais de nome ── */
  const sim = strSim(ga, gb);

  if (sim >= 0.90) {
    score += 50; reasons.push(`nome ${Math.round(sim*100)}% similar`);
    hasNameSignal = true;
  } else if (sim >= 0.75) {
    score += 30; reasons.push(`nome ${Math.round(sim*100)}% similar`);
    hasNameSignal = true;
  } else if (sim >= 0.60) {
    score += 12; reasons.push(`nome ${Math.round(sim*100)}% similar`);
  } else if (ga.includes(gb) || gb.includes(ga)) {
    score += 20; reasons.push("um nome contém o outro");
    hasNameSignal = true;
  }

  // Prefixo/base comum (após strip genérico)
  const canonical = generateCanonicalName(a.master.name, b.master.name);
  if (canonical) {
    const nc = stripGeneric(norm(canonical));
    if (nc.length >= 5) {
      if (ga.startsWith(nc) && gb.startsWith(nc)) {
        score += 40; reasons.push(`prefixo comum: "${canonical}"`);
        hasNameSignal = true;
      } else if (ga.includes(nc) && gb.includes(nc)) {
        score += 20; reasons.push(`base comum: "${canonical}"`);
        hasNameSignal = true;
      }
    }
  }

  // Palavras significativas partilhadas (não-genéricas, ≥5 letras)
  if (!hasNameSignal) {
    const wa = ga.split(" ").filter(w => w.length >= 5);
    const wb = gb.split(" ").filter(w => w.length >= 5);
    const shared = wa.filter(w => wb.includes(w));
    if (shared.length >= 2) {
      score += 25; reasons.push(`palavras: "${shared.slice(0,3).join('", "')}"`);
      hasNameSignal = true;
    }
  }

  /* ── Sinais de dados (só confirmam, NUNCA iniciam) ── */

  // CR+Slope só conta se houver sinal de nome — sem nome em comum, CR+Slope
  // é coincidência (há centenas de campos com CR72.1/slope 128)
  if (crSlopeMatch >= 2 && hasNameSignal) {
    score += 40; reasons.push(`${crSlopeMatch}× CR+Slope idênticos`);
  } else if (crSlopeMatch === 1 && hasNameSignal) {
    score += 20; reasons.push(`CR+Slope idêntico`);
  }
  // Se CR+Slope coincide SEM sinal de nome: mostrar como aviso mas não pontuar
  if (crSlopeMatch >= 1 && !hasNameSignal) {
    reasons.push(`(CR+Slope coincide mas sem nome em comum — provavelmente coincidência)`);
  }

  // Distâncias: confirmação secundária, nunca iniciam
  if (distMatch >= 2 && hasNameSignal && score >= THRESHOLD_ASK) {
    score += 10; reasons.push(`${distMatch}× distâncias compat.`);
  }

  if (score < THRESHOLD_ASK) return null;
  return { score, reasons, crSlopePairs, canonical, sim };
}

/* ═══════════════════════════════════════════════════════════════════════════
   JOGADORES
   ═══════════════════════════════════════════════════════════════════════════ */

function loadPlayers() {
  if (!fs.existsSync(playersPath)) return {};
  try { return readJSON(playersPath); } catch { return {}; }
}

function formatPlayers(course, playersDb, max = 6) {
  const nfeds = course.master._players || [];
  if (!nfeds.length) return gray("(sem jogadores registados)");
  const names = nfeds.map(nfed => playersDb[nfed]?.name || `#${nfed}`).sort();
  const shown = names.slice(0, max);
  const extra = names.length > max ? ` +${names.length - max}` : "";
  return gray(shown.join(", ") + extra);
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORMATAÇÃO
   ═══════════════════════════════════════════════════════════════════════════ */

const C = {
  reset:"\x1b[0m", bold:"\x1b[1m", dim:"\x1b[2m",
  yellow:"\x1b[33m", green:"\x1b[32m", gray:"\x1b[90m", red:"\x1b[31m",
};
const bold   = s => `${C.bold}${s}${C.reset}`;
const yellow = s => `${C.yellow}${s}${C.reset}`;
const green  = s => `${C.green}${s}${C.reset}`;
const gray   = s => `${C.gray}${s}${C.reset}`;
const dim    = s => `${C.dim}${s}${C.reset}`;
const red    = s => `${C.red}${s}${C.reset}`;

function printCourse(label, c, playersDb) {
  const country = c.master.country ? gray(` [${c.master.country}]`) : "";
  const invalid = isInvalidName(c.master.name) ? red(" ⚠ NOME INVÁLIDO") : "";
  console.log(`  ${bold(label)}: "${c.master.name}"${country}${invalid}`);

  const sigs = teeSignals(c);
  if (sigs.length) {
    const parts = sigs.map(t => {
      const bits = [`${t.name}(${t.sex})`];
      if (t.cr && t.slope) bits.push(t.ok ? `CR${t.cr}/${t.slope}` : dim(`CR${t.cr}/${t.slope}?`));
      if (t.dist) bits.push(`${t.dist}m`);
      return bits.join(" ");
    });
    console.log(`     ${dim("tees:")}     ${gray(parts.join("  ·  "))}`);
  }
  console.log(`     ${dim("jogadores:")} ${formatPlayers(c, playersDb)}`);
}

function ask(rl, q) {
  return new Promise(resolve => rl.question(q, a => resolve(a.trim())));
}

function applyMerge(aliases, nameOverrides, canonical, variant, canonicalName) {
  aliases[norm(variant.master.name)] = norm(canonical.master.name);
  if (canonicalName && canonicalName !== canonical.master.name)
    nameOverrides[canonical.courseKey] = canonicalName;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════════════════ */

async function main() {
  if (!fs.existsSync(awayPath)) {
    console.error(`\n  Erro: ${awayPath} não encontrado.`);
    console.error(dim("  Corre primeiro: node scripts/extract-courses.js\n"));
    process.exit(1);
  }

  const data      = readJSON(awayPath);
  const courses   = data.courses || [];
  const playersDb = loadPlayers();

  // Identificar nomes inválidos logo aqui para informar o utilizador
  const invalidCourses = courses.filter(c => isInvalidName(c.master.name));
  console.log(bold(`\n  ${courses.length} campos carregados`));
  if (invalidCourses.length) {
    console.log(red(`  ⚠ ${invalidCourses.length} campo(s) com nome inválido (serão ignorados):`));
    invalidCourses.forEach(c => console.log(red(`    "${c.master.name}" (${c.courseKey})`)));
  }
  if (Object.keys(playersDb).length)
    console.log(gray(`  ${Object.keys(playersDb).length} jogadores carregados`));

  let aliases = {}, skipped = new Set(), nameOverrides = {};
  if (fs.existsSync(aliasPath)) {
    const saved   = readJSON(aliasPath);
    aliases       = saved.aliases        || {};
    skipped       = new Set(saved.skipped || []);
    nameOverrides = saved.nameOverrides  || {};
    const n = Object.keys(aliases).length;
    if (n || skipped.size)
      console.log(gray(`  Estado anterior: ${n} merge(s), ${skipped.size} skip(s)`));
  }

  console.log(bold("\n  A analisar pares...\n"));

  const autoMerge = [], toAsk = [];

  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      const a = courses[i], b = courses[j];
      const pairKey = [a.courseKey, b.courseKey].sort().join("|||");
      if (skipped.has(pairKey)) continue;
      const na = norm(a.master.name), nb = norm(b.master.name);
      if (aliases[na] === nb || aliases[nb] === na) continue;

      const result = scoreCandidate(a, b);
      if (!result) continue;

      const entry = { a, b, pairKey, ...result };
      if (result.score >= THRESHOLD_AUTO) autoMerge.push(entry);
      else                                toAsk.push(entry);
    }
  }

  autoMerge.sort((x, y) => y.score - x.score);
  toAsk.sort((x, y) => y.score - x.score);

  /* ── Auto-merges ── */

  if (autoMerge.length) {
    console.log(green(`  Auto-merge (alta confiança): ${autoMerge.length} par(es)`));
    console.log(dim("─".repeat(65)));

    for (const { a, b, reasons, crSlopePairs, canonical } of autoMerge) {
      const canonicalCourse = a.master.tees.length >= b.master.tees.length ? a : b;
      const variant         = canonicalCourse === a ? b : a;
      const canonicalName   = canonical || a.master.name;
      const totalTees       = a.master.tees.length + b.master.tees.length;

      applyMerge(aliases, nameOverrides, canonicalCourse, variant, canonicalName);

      console.log(green(`  ✓ AUTO`));
      console.log(`     "${a.master.name}"`);
      console.log(`   + "${b.master.name}"`);
      console.log(bold(`   → "${canonicalName}"`) + dim(` (${totalTees} tees unidos)`));
      console.log(dim(`     sinais: ${reasons.join(", ")}`));
      if (crSlopePairs.length)
        crSlopePairs.forEach(p => console.log(dim(`       ${p}`)));
    }
    console.log();
  }

  /* ── Perguntas manuais ── */

  if (!toAsk.length) {
    if (!autoMerge.length) console.log(green("  ✓ Nenhum duplicado suspeito encontrado!\n"));
    else                   console.log(green("  ✓ Sem casos ambíguos para confirmar.\n"));
  } else {
    console.log(yellow(`  ${toAsk.length} par(es) para confirmar manualmente.`));
    console.log(dim("  s = mesmo campo  |  n = diferentes  |  q = guardar e sair"));
    console.log(dim("─".repeat(65)));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let mergeCount = 0, skipCount = 0;

    for (const { a, b, pairKey, score, reasons, crSlopePairs, canonical } of toAsk) {
      console.log();
      const conf = score >= 70 ? yellow("◐ MÉDIA") : gray("○ BAIXA");
      console.log(`  ${bold("Par")} ${conf}  ${dim(reasons.join("  ·  "))}`);
      if (crSlopePairs.length)
        crSlopePairs.forEach(p => console.log(dim(`    ${p}`)));

      printCourse("A", a, playersDb);
      printCourse("B", b, playersDb);

      const suggestedName = canonical;
      const totalTees = a.master.tees.length + b.master.tees.length;
      if (suggestedName)
        console.log(dim(`\n  → sugestão: "${suggestedName}" (${totalTees} tees unidos)`));
      else
        console.log(yellow(`\n  → atenção: não foi possível gerar nome automático — terás de escrever`));
      console.log();

      const ans = (await ask(rl, `  São o mesmo campo? ${bold("[s/n/q]")} `)).toLowerCase();

      if (ans === "q" || ans === "sair") {
        console.log(yellow("\n  A guardar e a sair...\n")); break;
      }

      if (ans === "s" || ans === "sim" || ans === "y") {
        const canonicalCourse = a.master.tees.length >= b.master.tees.length ? a : b;
        const variant         = canonicalCourse === a ? b : a;

        console.log();
        console.log(dim("  Nome canónico:"));
        console.log(`    ${bold("1")} → "${a.master.name}"`);
        console.log(`    ${bold("2")} → "${b.master.name}"`);
        if (suggestedName)
          console.log(`    ${bold("s")} → sugerido: "${suggestedName}"`);
        console.log(`    ${bold("e")} → escrever livremente`);

        const choice = (await ask(rl, `  ${bold("[1/2/s/e]")} `)).toLowerCase();
        let canonicalName;
        if      (choice === "e") canonicalName = (await ask(rl, `  ${bold("Nome:")} `)).trim();
        else if (choice === "2") canonicalName = b.master.name;
        else if (choice === "s") canonicalName = suggestedName || a.master.name;
        else                     canonicalName = a.master.name;

        if (!canonicalName) canonicalName = a.master.name;

        applyMerge(aliases, nameOverrides, canonicalCourse, variant, canonicalName);
        console.log(green(`  ✓ → "${canonicalName}"`));
        mergeCount++;

      } else {
        skipped.add(pairKey);
        skipCount++;
        console.log(gray("  – Ignorado."));
      }

      console.log(dim("─".repeat(65)));
    }

    rl.close();
    console.log();
    if (mergeCount) console.log(green(`  ${mergeCount} merge(s) confirmado(s)`));
    if (skipCount)  console.log(gray( `  ${skipCount} par(es) ignorado(s)`));
  }

  /* ── Gravar ── */

  fs.writeFileSync(aliasPath, JSON.stringify({
    _note: "Gerado por merge-courses.js. Carregado pelo extract-courses.js.",
    aliases,
    nameOverrides,
    skipped: [...skipped],
  }, null, 2), "utf-8");

  const total = Object.keys(aliases).length;
  console.log(green(`\n  Gravado: ${aliasPath}  (${total} alias${total !== 1 ? "es" : ""} total)`));
  console.log(dim("  Corre agora: node scripts/extract-courses.js\n"));
}

main().catch(e => {
  console.error("\n  Erro:", e.message || e);
  process.exit(1);
});
