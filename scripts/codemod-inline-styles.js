#!/usr/bin/env node
/**
 * codemod-inline-styles.js
 *
 * Converte inline styles simples para classes CSS utilitárias já existentes em App.css.
 *
 * Uso:
 *   node scripts/codemod-inline-styles.js [--dry-run] [file ...]
 *   node scripts/codemod-inline-styles.js --dry-run src/pages/DrivePage.tsx
 *   node scripts/codemod-inline-styles.js src/pages/*.tsx
 *
 * --dry-run  Mostra as transformações sem alterar ficheiros
 * --stats    Mostra apenas contagens por ficheiro, sem diff
 */
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const statsOnly = args.includes("--stats");
const files = args.filter(a => !a.startsWith("--"));

if (files.length === 0) {
  console.log("Uso: node scripts/codemod-inline-styles.js [--dry-run] [--stats] <file ...>");
  process.exit(0);
}

/* ═══════════════════════════════════════════════════════════════
   MAPEAMENTO: propriedade CSS → classe utilitária
   ═══════════════════════════════════════════════════════════════ */
const STYLE_TO_CLASS = {
  // fontSize (px)
  'fontSize: 8':   'fs-8',
  'fontSize: 9':   'fs-9',
  'fontSize: 10':  'fs-10',
  'fontSize: 11':  'fs-11',
  'fontSize: 12':  'fs-12',
  'fontSize: 13':  'fs-13',
  'fontSize: 14':  'fs-14',
  // textAlign
  'textAlign: "center"': 'ta-c',
  'textAlign: "left"':   'ta-left',
  'textAlign: "right"':  'ta-right',
  // fontWeight
  'fontWeight: 400': 'fw-400',
  'fontWeight: 600': 'fw-600',
  'fontWeight: 700': 'fw-700',
  'fontWeight: 800': 'fw-800',
  'fontWeight: 900': 'fw-900',
  // margin
  'marginBottom: 4':  'mb-4',
  'marginBottom: 6':  'mb-6',
  'marginBottom: 8':  'mb-8',
  'marginBottom: 10': 'mb-10',
  'marginBottom: 12': 'mb-12',
  'marginBottom: 16': 'mb-16',
  'marginBottom: 18': 'mb-18',
  'marginTop: 1':  'mt-1',
  'marginTop: 3':  'mt-3',
  'marginTop: 4':  'mt-4',
  'marginTop: 6':  'mt-6',
  'marginTop: 8':  'mt-8',
  'marginTop: 10': 'mt-10',
  'marginTop: 12': 'mt-12',
  'marginTop: 14': 'mt-14',
  'marginTop: 20': 'mt-20',
  'marginTop: 24': 'mt-24',
  'marginLeft: 4':     'ml-4',
  'marginLeft: 6':     'ml-6',
  'marginLeft: 8':     'ml-8',
  'marginLeft: "auto"': 'ml-auto',
  // flex
  'flexShrink: 0': 'flex-shrink-0',
  'flex: 1':       'flex-1',
  'flexWrap: "wrap"': 'flex-wrap',
  'flexDirection: "column"': 'flex-col',
  // gap
  'gap: 2':  'gap-2',
  'gap: 4':  'gap-4',
  'gap: 8':  'gap-8',
  'gap: 12': 'gap-12',
  'gap: 16': 'gap-16',
  // width
  'width: "100%"': 'w-full',
  // text-decoration
  'textDecoration: "none"': 'td-none',
  // overflow
  'overflow: "hidden"': 'overflow-hidden',
  // text-transform
  'textTransform: "uppercase"': 'uppercase',
};

/* ═══════════════════════════════════════════════════════════════
   COMBINAÇÕES COMPOSTAS FREQUENTES → classe composta
   ═══════════════════════════════════════════════════════════════ */
const COMPOUND_MAP = {
  'display: "flex", alignItems: "center"':          'flex-center',
  'display: "flex", alignItems: "center", gap: 6':  'flex-center-gap6',
  'display: "flex", alignItems: "center", gap: 8':  'flex-center-gap8',
  'display: "flex", alignItems: "center", gap: 10': 'flex-center-gap10',
  'display: "flex", flexWrap: "wrap", gap: 8':      'flex-wrap-gap8',
  'display: "flex", flexDirection: "column", gap: 1': 'flex-col-gap1',
  'display: "flex", flexDirection: "column", gap: 2': 'flex-col-gap2',
  'display: "flex", flexDirection: "column", gap: 3': 'flex-col-gap3',
  'display: "flex", flexDirection: "column", gap: 4': 'flex-col-gap4',
  'display: "flex", flexDirection: "column", gap: 6': 'flex-col-gap6',
  'display: "flex", flexDirection: "column", gap: 8': 'flex-col-gap8',
  'display: "flex", flexDirection: "column", gap: 12': 'flex-col-gap12',
  'display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6': 'flex-between-mb6',
  'display: "flex", alignItems: "center", gap: 8, marginBottom: 4': 'flex-center-gap8-mb4',
  'display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap"': 'flex-center-gap12',
  'fontSize: 11, fontWeight: 700': 'fs-11-fw700',
  'fontSize: 13, lineHeight: 1.6': 'fs-13-lh16',
};

/* ═══════════════════════════════════════════════════════════════
   PARSE: extrai propriedades de um style={{ ... }}
   ═══════════════════════════════════════════════════════════════ */

// Normaliza espaços para comparação
function normalizeProps(str) {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Tenta converter style={{ ... }} para className(s).
 * Retorna null se não pode converter (propriedades dinâmicas, ternários, etc.)
 */
function tryConvert(styleContent) {
  const inner = styleContent.trim();

  // Ignorar se contém expressões dinâmicas (ternários, template literals, variáveis, chamadas de função)
  if (/[?`$]|&&|\|\||\.\.\.|\bvar\(/.test(inner)) return null;
  // Ignorar se contém css vars
  if (/var\(--/.test(inner)) return null;

  const norm = normalizeProps(inner);

  // 1. Tentar match composto exacto
  for (const [pattern, cls] of Object.entries(COMPOUND_MAP)) {
    if (norm === pattern) return { classes: [cls], remaining: null };
  }

  // 2. Tentar converter propriedade a propriedade
  // Dividir por vírgulas respeitando strings
  const props = splitProps(inner);
  if (!props) return null;

  const classes = [];
  const unconverted = [];

  for (const prop of props) {
    const p = normalizeProps(prop);
    if (STYLE_TO_CLASS[p]) {
      classes.push(STYLE_TO_CLASS[p]);
    } else {
      unconverted.push(prop.trim());
    }
  }

  if (classes.length === 0) return null;

  return {
    classes,
    remaining: unconverted.length > 0 ? unconverted.join(", ") : null,
  };
}

/**
 * Divide propriedades por vírgula, ignorando vírgulas dentro de strings ou parêntesis
 */
function splitProps(str) {
  const parts = [];
  let depth = 0;
  let inStr = false;
  let strChar = '';
  let current = '';

  for (let i = 0; i < str.length; i++) {
    const c = str[i];

    if (inStr) {
      current += c;
      if (c === strChar && str[i - 1] !== '\\') inStr = false;
      continue;
    }

    if (c === '"' || c === "'") {
      inStr = true;
      strChar = c;
      current += c;
      continue;
    }

    if (c === '(' || c === '{' || c === '[') { depth++; current += c; continue; }
    if (c === ')' || c === '}' || c === ']') { depth--; current += c; continue; }

    if (c === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }

    current += c;
  }

  if (current.trim()) parts.push(current);

  // Verificar se alguma prop tem expressão complexa
  for (const p of parts) {
    if (/[?`$]|&&|\|\||\.\.\./.test(p)) return null;
  }

  return parts;
}

/* ═══════════════════════════════════════════════════════════════
   TRANSFORM: aplica as conversões a um ficheiro
   ═══════════════════════════════════════════════════════════════ */

function transformFile(code) {
  let result = code;
  let count = 0;

  // Regex para style={{ ... }} — match balanceado de {}
  // Procura style={{ e captura até o }} de fecho
  const pattern = /(\s*)style=\{\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\}/g;

  result = result.replace(pattern, (match, leadingSpace, styleInner, offset) => {
    const conversion = tryConvert(styleInner);
    if (!conversion) return match; // Não converter, manter original

    const newClasses = conversion.classes.join(" ");

    // Verificar se o elemento já tem className
    // Olhar para trás no result para encontrar className="..." ou className={...}
    const before = result.substring(Math.max(0, offset - 300), offset);
    // Não podemos modificar o className aqui porque estamos dentro do replace
    // Em vez disso, vamos marcar para merge posterior

    count++;

    if (conversion.remaining) {
      // Conversão parcial: manter style com props restantes + adicionar className
      return `${leadingSpace}className="${newClasses}"${leadingSpace}style={{ ${conversion.remaining} }}`;
    }

    // Conversão total: remover style, substituir por className
    return `${leadingSpace}className="${newClasses}"`;
  });

  // Agora merge className duplicados no mesmo elemento
  // Padrão: className="a" className="b" → className="a b"
  // Ou: className="a" + existente className="b" no mesmo tag
  result = mergeClassNames(result);

  return { code: result, count };
}

/**
 * Merge múltiplos className no mesmo elemento JSX
 * className="a" ... className="b" → className="a b"
 */
function mergeClassNames(code) {
  // Procura tags JSX com múltiplos className
  // Padrão: className="X" [whitespace/outros attrs] className="Y"
  const re = /className="([^"]*)"(\s+)className="([^"]*)"/g;
  let prev = '';
  let result = code;
  // Iterar até estabilizar (pode haver 3+ classNames)
  while (result !== prev) {
    prev = result;
    result = result.replace(re, 'className="$1 $3"$2');
  }

  // Caso: className={"..."} + className="..."
  const re2 = /className=\{"([^"]*)"\}(\s+)className="([^"]*)"/g;
  prev = '';
  while (result !== prev) {
    prev = result;
    result = result.replace(re2, 'className={"$1 $3"}$2');
  }

  // Caso: className={`...`} + className="..."
  // Mais complexo — skip por agora, é raro

  // Caso: className="..." seguido de className="..." com outros attrs entre eles
  // Isto é mais complexo — precisa de contexto do tag
  // Por segurança, reportar se ainda existirem duplicados

  return result;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════ */
let totalCount = 0;

for (const filePath of files) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`❌ Ficheiro não encontrado: ${absPath}`);
    continue;
  }

  const original = fs.readFileSync(absPath, "utf-8");
  const { code: transformed, count } = transformFile(original);

  if (count === 0) {
    if (!statsOnly) console.log(`  ⏭  ${path.basename(absPath)} — nenhuma conversão`);
    continue;
  }

  totalCount += count;

  if (statsOnly) {
    console.log(`  📊 ${path.basename(absPath)} — ${count} conversões`);
    continue;
  }

  if (dryRun) {
    console.log(`\n  🔍 ${path.basename(absPath)} — ${count} conversões (dry-run)`);
    // Mostrar diff resumido
    const origLines = original.split("\n");
    const transLines = transformed.split("\n");
    let shown = 0;
    for (let i = 0; i < origLines.length && shown < 15; i++) {
      if (origLines[i] !== transLines[i]) {
        console.log(`    L${i + 1}:`);
        console.log(`    - ${origLines[i].trim().substring(0, 120)}`);
        console.log(`    + ${transLines[i].trim().substring(0, 120)}`);
        shown++;
      }
    }
    if (shown >= 15) console.log(`    ... (+${count - shown} mais)`);
  } else {
    fs.writeFileSync(absPath, transformed, "utf-8");
    console.log(`  ✅ ${path.basename(absPath)} — ${count} conversões aplicadas`);
  }
}

console.log(`\n  Total: ${totalCount} inline styles convertidos${dryRun ? " (dry-run)" : ""}`);
