#!/usr/bin/env node
/**
 * validate-encoding.js — Detecta mojibake em todos os ficheiros de dados do pipeline.
 *
 * Uso:
 *   node validate-encoding.js              → valida players.json + output/
 *   node validate-encoding.js --fix        → corrige in-place (com backup)
 *   node validate-encoding.js --ci         → exit code 1 se houver erros (para CI/CD)
 *
 * Coloca na raiz do projecto (C:\GOLF-FPG\).
 */

const fs = require("fs");
const path = require("path");

/* ── Argumentos ── */
const args = new Set(process.argv.slice(2));
const FIX_MODE = args.has("--fix");
const CI_MODE = args.has("--ci");
const VERBOSE = args.has("-v") || args.has("--verbose");

/* ── CP1252 reverse map ── */
const CP1252_MAP = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84,
  0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
  0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
  0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
  0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
  0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F,
};

function unicodeToCp1252(code) {
  if (code <= 0x7F) return code;
  if (code >= 0xA0 && code <= 0xFF) return code;
  return CP1252_MAP[code] ?? -1;
}

/**
 * Detecta e corrige mojibake numa string.
 * Retorna { fixed, wasBroken }.
 */
function fixMojibake(s) {
  if (!/[^\x00-\x7f]/.test(s)) return { fixed: s, wasBroken: false };
  try {
    const bytes = Buffer.alloc(s.length);
    for (let i = 0; i < s.length; i++) {
      const b = unicodeToCp1252(s.charCodeAt(i));
      if (b < 0) return { fixed: s, wasBroken: false };
      bytes[i] = b;
    }
    const decoded = bytes.toString("utf-8");
    if (decoded.includes("\uFFFD")) return { fixed: s, wasBroken: false };
    if (decoded !== s) return { fixed: decoded, wasBroken: true };
  } catch {}
  return { fixed: s, wasBroken: false };
}

/**
 * Fix "lost byte" mojibake — when CP1252 gaps (0x81, 0x8D, 0x8F, 0x90, 0x9D)
 * cause the continuation byte to be dropped entirely.
 *
 * Pattern: "Ã" (U+00C3) at word start, followed by lowercase = lost Á/Í/Ã/Ú/Ñ/etc.
 *
 * In UTF-8:
 *   Á = C3 81,  Í = C3 8D,  Ï = C3 8F,  Ð = C3 90,  Ý = C3 9D
 * CP1252 has no char at 0x81/0x8D/0x8F/0x90/0x9D → byte gets dropped → "Ã" + rest
 *
 * Uses word-split instead of lookbehind regex (more compatible across Node versions).
 */
function fixLostByteMojibake(s) {
  if (!s.includes("\u00C3")) return { fixed: s, wasBroken: false };
  const words = s.split(/(\s+)/);  // keep whitespace separators
  let changed = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.length < 2 || w.charCodeAt(0) !== 0xC3) continue;
    const ch2 = w.charAt(1);
    if (ch2 < "a" || ch2 > "z") continue;  // only lowercase after Ã
    // Ãris → Íris (specific Portuguese name)
    if (w.startsWith("\u00C3ris")) {
      words[i] = "\u00CDris" + w.slice(4); changed = true;
    }
    // Ãn → Ín (Índia, Índio)
    else if (ch2 === "n") {
      words[i] = "\u00CD" + w.slice(1); changed = true;
    }
    // Ã + any lowercase letter → Á (Ávila, Áurea, Álvaro, etc.)
    else {
      words[i] = "\u00C1" + w.slice(1); changed = true;
    }
  }
  return { fixed: changed ? words.join("") : s, wasBroken: changed };
}

/**
 * Combined fix: try standard mojibake first, then lost-byte patterns.
 */
function fixAll(s) {
  const r1 = fixMojibake(s);
  if (r1.wasBroken) return r1;
  const r2 = fixLostByteMojibake(s);
  return r2;
}

/**
 * Padrão regex para detectar mojibake portuguesa comum.
 */
const MOJIBAKE_RE = /\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]|\u00c5[\u0080-\u00bf]/;

function hasMojibake(s) {
  if (typeof s !== "string") return false;
  if (MOJIBAKE_RE.test(s)) return true;
  // Detect lost-byte: Ã (U+00C3) at word start followed by lowercase
  if (!s.includes("\u00C3")) return false;
  const words = s.split(/\s+/);
  return words.some(w => w.length >= 2 && w.charCodeAt(0) === 0xC3 && w.charAt(1) >= "a" && w.charAt(1) <= "z");
}

/* ── Scan recursivo de objectos ── */
function scanObject(obj, pathStr, issues) {
  if (obj == null) return;
  if (typeof obj === "string") {
    if (hasMojibake(obj)) {
      const { fixed } = fixAll(obj);
      issues.push({ path: pathStr, original: obj, fixed });
    }
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => scanObject(v, `${pathStr}[${i}]`, issues));
    return;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      scanObject(v, `${pathStr}.${k}`, issues);
    }
  }
}

/* ── Fix recursivo de objectos (in-place) ── */
function fixObject(obj) {
  if (obj == null || typeof obj !== "object") return 0;
  let count = 0;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === "string") {
        const { fixed, wasBroken } = fixAll(obj[i]);
        if (wasBroken) { obj[i] = fixed; count++; }
      } else { count += fixObject(obj[i]); }
    }
  } else {
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === "string") {
        const { fixed, wasBroken } = fixAll(obj[k]);
        if (wasBroken) { obj[k] = fixed; count++; }
      } else { count += fixObject(obj[k]); }
    }
  }
  return count;
}

/* ── Processar um ficheiro JSON ── */
function processJsonFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    return { file: filePath, error: e.message, issues: [] };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { file: filePath, error: "JSON inválido", issues: [] };
  }

  const issues = [];
  scanObject(data, "$", issues);

  if (FIX_MODE && issues.length > 0) {
    const backupPath = filePath + ".bak";
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, raw, "utf-8");
    }
    const fixCount = fixObject(data);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return { file: filePath, issues, fixed: fixCount };
  }

  return { file: filePath, issues };
}

/* ── Verificar ficheiros .txt (whs-list-raw) ── */
function checkTextFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const text = buf.toString("utf-8");
    const hasReplacement = text.includes("\uFFFD");
    const hasMojibakeStr = MOJIBAKE_RE.test(text);

    let invalidUtf8 = false;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] > 127) {
        if (buf[i] >= 0xC0 && buf[i] <= 0xDF) {
          if (i + 1 >= buf.length || buf[i + 1] < 0x80 || buf[i + 1] > 0xBF) {
            invalidUtf8 = true; break;
          }
          i++;
        } else if (buf[i] >= 0x80 && buf[i] <= 0xBF) {
          invalidUtf8 = true; break;
        }
      }
    }

    return {
      file: filePath,
      encoding: invalidUtf8 ? "LATIN-1/CP1252 (NÃO É UTF-8!)" : "UTF-8",
      isOk: !invalidUtf8 && !hasMojibakeStr && !hasReplacement,
      hasMojibake: hasMojibakeStr,
      invalidUtf8,
    };
  } catch (e) {
    return { file: filePath, error: e.message };
  }
}

/* ── Main ── */
function main() {
  console.log("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
  console.log("\u2551  Validador de Encoding \u2014 Golf FPG Pipeline      \u2551");
  console.log("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n");

  if (FIX_MODE) console.log("  Modo: FIX (corrigir ficheiros in-place)\n");
  else console.log("  Modo: CHECK (apenas detectar)\n");

  let totalIssues = 0;
  let totalFiles = 0;
  let totalFixed = 0;

  /* 1. players.json (raiz) */
  const playersJsonPath = path.join(__dirname, "players.json");
  if (fs.existsSync(playersJsonPath)) {
    const r = processJsonFile(playersJsonPath);
    totalFiles++;
    if (r.issues.length > 0) {
      console.log(`\u274C ${r.file}: ${r.issues.length} strings com mojibake`);
      r.issues.slice(0, 5).forEach(i => {
        console.log(`   ${i.path}: "${i.original}" \u2192 "${i.fixed}"`);
      });
      if (r.issues.length > 5) console.log(`   ... e mais ${r.issues.length - 5}`);
      if (r.fixed) { console.log(`   \u2705 Corrigido: ${r.fixed} strings`); totalFixed += r.fixed; }
      totalIssues += r.issues.length;
    } else {
      console.log(`\u2705 ${r.file}: OK`);
    }
  }

  /* 2. public/data/players.json */
  const publicPlayersPath = path.join(__dirname, "public", "data", "players.json");
  if (fs.existsSync(publicPlayersPath)) {
    const r = processJsonFile(publicPlayersPath);
    totalFiles++;
    if (r.issues.length > 0) {
      console.log(`\u274C ${r.file}: ${r.issues.length} strings com mojibake`);
      r.issues.slice(0, 3).forEach(i => console.log(`   ${i.path}: "${i.original}" \u2192 "${i.fixed}"`));
      if (r.fixed) { console.log(`   \u2705 Corrigido: ${r.fixed} strings`); totalFixed += r.fixed; }
      totalIssues += r.issues.length;
    } else {
      console.log(`\u2705 ${r.file}: OK`);
    }
  }

  /* 3. output/{fed}/analysis/data.json */
  const outputDir = path.join(__dirname, "output");
  if (fs.existsSync(outputDir)) {
    const fedDirs = fs.readdirSync(outputDir).filter(d => /^\d+$/.test(d));
    let badDataFiles = 0;
    let okDataFiles = 0;

    for (const fed of fedDirs) {
      const dataPath = path.join(outputDir, fed, "analysis", "data.json");
      if (!fs.existsSync(dataPath)) continue;
      totalFiles++;
      const r = processJsonFile(dataPath);
      if (r.issues.length > 0) {
        badDataFiles++;
        totalIssues += r.issues.length;
        if (r.fixed) totalFixed += r.fixed;
        if (VERBOSE) {
          console.log(`\u274C ${fed}/analysis/data.json: ${r.issues.length} strings com mojibake`);
          r.issues.slice(0, 2).forEach(i => console.log(`   ${i.path}: "${i.original}"`));
        }
      } else {
        okDataFiles++;
      }
    }

    if (badDataFiles > 0) {
      console.log(`\u274C output/*/analysis/data.json: ${badDataFiles} ficheiros com mojibake (de ${badDataFiles + okDataFiles} total)`);
      if (FIX_MODE) console.log(`   \u2705 Corrigidos`);
    } else if (okDataFiles > 0) {
      console.log(`\u2705 output/*/analysis/data.json: ${okDataFiles} ficheiros OK`);
    }

    /* 4. whs-list-raw.txt — verificar encoding */
    console.log("");
    let badTxtFiles = 0;
    for (const fed of fedDirs) {
      const txtPath = path.join(outputDir, fed, "whs-list-raw.txt");
      if (!fs.existsSync(txtPath)) continue;
      const r = checkTextFile(txtPath);
      if (!r.isOk) {
        badTxtFiles++;
        if (VERBOSE || badTxtFiles <= 3) {
          console.log(`\u26A0\uFE0F  ${fed}/whs-list-raw.txt: ${r.encoding}${r.hasMojibake ? " + mojibake detectado" : ""}`);
        }
      }
    }
    if (badTxtFiles > 0) {
      console.log(`\u26A0\uFE0F  ${badTxtFiles} ficheiros whs-list-raw.txt com encoding suspeito`);
      console.log(`   \u2192 O download da FPG est\u00E1 a gravar em Latin-1/CP1252 em vez de UTF-8`);
      console.log(`   \u2192 Ver ENCODING-FIX-GUIDE.md para instru\u00E7\u00F5es de correc\u00E7\u00E3o`);
    } else {
      const txtCount = fedDirs.filter(d => fs.existsSync(path.join(outputDir, d, "whs-list-raw.txt"))).length;
      if (txtCount > 0) console.log(`\u2705 whs-list-raw.txt: ${txtCount} ficheiros com encoding OK`);
    }
  }

  /* 5. Verificar ficheiros .tsx na pasta src (ignora fixEncoding.ts) */
  console.log("");
  const srcDir = path.join(__dirname, "src");
  if (fs.existsSync(srcDir)) {
    const tsxFiles = [];
    function findTsx(dir) {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        if (f.isDirectory() && f.name !== "node_modules") findTsx(path.join(dir, f.name));
        else if (f.name.endsWith(".tsx") || f.name.endsWith(".ts")) tsxFiles.push(path.join(dir, f.name));
      }
    }
    findTsx(srcDir);

    let badSrcFiles = 0;
    for (const f of tsxFiles) {
      // Skip fixEncoding.ts — it contains CP1252 mapping comments that look like mojibake
      if (path.basename(f) === "fixEncoding.ts") continue;
      const text = fs.readFileSync(f, "utf-8");
      const brokenEmoji = /\u00f0[\u0080-\u00ff\u0100-\uffff]{1,5}/.test(text);
      const brokenText = /["'`][^"'`]*\u00c3[\u0080-\u00bf][^"'`]*["'`]/.test(text);
      if (brokenEmoji || brokenText) {
        badSrcFiles++;
        const rel = path.relative(__dirname, f);
        console.log(`\u26A0\uFE0F  ${rel}: mojibake no c\u00F3digo-fonte${brokenEmoji ? " (emojis)" : ""}${brokenText ? " (texto)" : ""}`);
      }
    }
    if (badSrcFiles === 0) {
      console.log(`\u2705 Ficheiros .tsx/.ts: ${tsxFiles.length} ficheiros sem mojibake`);
    }
  }

  /* 6. Diagnóstico: procurar readFileSync sem utf-8 nos scripts do pipeline */
  console.log("");
  const pipelineFiles = ["golf-all.js", "enrich-players.js", "extract-courses.js", "login.js", "make-scorecards-ui.js"];
  const libDir = path.join(__dirname, "lib");
  if (fs.existsSync(libDir)) {
    for (const f of fs.readdirSync(libDir).filter(f => f.endsWith(".js"))) {
      pipelineFiles.push(path.join("lib", f));
    }
  }
  let unsafeReads = 0;
  for (const rel of pipelineFiles) {
    const full = path.join(__dirname, rel);
    if (!fs.existsSync(full)) continue;
    const code = fs.readFileSync(full, "utf-8");
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // readFileSync without utf-8/utf8 (but not binary reads like images)
      if (/readFileSync\s*\(/.test(line) && !/utf|encoding|binary|base64|null\)/.test(line)) {
        // Check if it looks like a JSON/text read (not a deliberate binary read)
        if (/\.json|\.txt|\.html|\.csv/.test(line) || /JSON\.parse/.test(lines[Math.min(i+1, lines.length-1)])) {
          unsafeReads++;
          if (VERBOSE || unsafeReads <= 5) {
            console.log(`\u26A0\uFE0F  ${rel}:${i+1}: readFileSync sem encoding expl\u00EDcito`);
            console.log(`      ${line.trim().substring(0, 100)}`);
          }
        }
      }
      // Also check writeFileSync
      if (/writeFileSync\s*\(/.test(line) && !/utf|encoding/.test(line)) {
        if (/\.json|\.txt|\.html/.test(line)) {
          unsafeReads++;
          if (VERBOSE || unsafeReads <= 5) {
            console.log(`\u26A0\uFE0F  ${rel}:${i+1}: writeFileSync sem encoding expl\u00EDcito`);
            console.log(`      ${line.trim().substring(0, 100)}`);
          }
        }
      }
    }
  }
  if (unsafeReads > 0) {
    console.log(`\u26A0\uFE0F  ${unsafeReads} chamadas readFileSync/writeFileSync sem encoding expl\u00EDcito`);
    console.log(`   \u2192 Adiciona 'utf-8' como segundo argumento a cada uma`);
  } else if (pipelineFiles.length > 0) {
    console.log(`\u2705 Pipeline scripts: encoding expl\u00EDcito em todas as leituras/escritas`);
  }

  /* Resumo */
  console.log("\n" + "\u2500".repeat(50));
  if (totalIssues === 0) {
    console.log("\u2705 Tudo limpo! Nenhum mojibake detectado.");
    process.exit(0);
  } else {
    console.log(`\u274C ${totalIssues} strings com mojibake em ${totalFiles} ficheiros`);
    if (FIX_MODE) {
      console.log(`\u2705 ${totalFixed} strings corrigidas in-place (backups criados com .bak)`);
    } else {
      console.log(`   Corre com --fix para corrigir automaticamente`);
      console.log(`   Corre com -v para ver detalhes`);
    }
    if (CI_MODE) process.exit(1);
  }
}

main();
