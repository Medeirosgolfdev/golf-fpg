#!/usr/bin/env node
/**
 * validate-data.js — Validação leve dos JSON de public/data antes do commit.
 *
 * Objectivo: impedir que um scrape parcialmente falhado (cookies a meio,
 * resposta truncada, parser a devolver vazio) seja commitado silenciosamente.
 * NÃO é um schema validator completo — verifica estrutura mínima e contagens.
 *
 * Uso:
 *   node scripts/validate-data.js <ficheiro...>          # valida ficheiros
 *   node scripts/validate-data.js --glob "public/data/drive-data-*.json"
 *
 * Regras por família (auto-detectadas pelo nome do ficheiro):
 *   - fpg-pull (pull-torneios*, drive-data*, aquapor-data*, jovens_*):
 *       .tournaments é array não-vazio; cada torneio tem name+tcode e
 *       players array; ≥50% dos torneios têm ≥1 player.
 *   - fpg-admissions-draws.json: .tournaments array não-vazio, cada um com tcode.
 *   - uskids-results.json: .resultados array não-vazio com escaloes.
 *   - uskids-member-history-slim.json: .jogadores e .torneios objectos não-vazios.
 *   - players.json / player-stats.json: objecto/array não-vazio.
 *   - desconhecidos: JSON válido + >2 bytes.
 *
 * Exit codes: 0 = tudo válido, 1 = pelo menos um ficheiro inválido.
 */

const fs = require("fs");
const path = require("path");

const errs = [];
const oks = [];

function fail(file, msg) { errs.push(`${file}: ${msg}`); }
function ok(file, msg) { oks.push(`${file}: ${msg}`); }

function isNonEmptyArray(x) { return Array.isArray(x) && x.length > 0; }
function isNonEmptyObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length > 0;
}

function validateFpgPull(file, d) {
  if (!isNonEmptyArray(d.tournaments)) return fail(file, "tournaments vazio/ausente");
  let withPlayers = 0;
  for (const t of d.tournaments) {
    if (!t.name || !t.tcode) return fail(file, `torneio sem name/tcode: ${JSON.stringify(t).slice(0, 80)}`);
    if (!Array.isArray(t.players)) return fail(file, `torneio ${t.tcode} sem players array`);
    if (t.players.length > 0) withPlayers++;
  }
  // Torneios futuros podem ter 0 players — mas se TODOS (ou quase) estão
  // vazios, o scrape provavelmente falhou.
  if (withPlayers < d.tournaments.length * 0.5 && d.tournaments.length > 2) {
    return fail(file, `só ${withPlayers}/${d.tournaments.length} torneios têm players (scrape parcial?)`);
  }
  ok(file, `${d.tournaments.length} torneios, ${withPlayers} com players`);
}

function validateAdmissionsDraws(file, d) {
  if (!isNonEmptyArray(d.tournaments)) return fail(file, "tournaments vazio/ausente");
  for (const t of d.tournaments) {
    if (!t.tcode) return fail(file, `torneio sem tcode: ${JSON.stringify(t).slice(0, 80)}`);
  }
  ok(file, `${d.tournaments.length} torneios`);
}

function validateUskidsResults(file, d) {
  if (!isNonEmptyArray(d.resultados)) return fail(file, "resultados vazio/ausente");
  for (const r of d.resultados) {
    if (!r.t || !isNonEmptyArray(r.escaloes)) {
      return fail(file, `resultado sem t/escaloes: ${(r.name || r.t || "?")}`);
    }
  }
  ok(file, `${d.resultados.length} torneios`);
}

function validateMemberHistorySlim(file, d) {
  if (!isNonEmptyObject(d.jogadores)) return fail(file, "jogadores vazio/ausente");
  if (!isNonEmptyObject(d.torneios)) return fail(file, "torneios vazio/ausente");
  ok(file, `${Object.keys(d.jogadores).length} jogadores, ${Object.keys(d.torneios).length} torneios`);
}

function validatePlayers(file, d) {
  const n = Array.isArray(d) ? d.length : Object.keys(d || {}).length;
  if (!n) return fail(file, "vazio");
  ok(file, `${n} entradas`);
}

function validateGeneric(file, d, raw) {
  if (raw.trim().length <= 2) return fail(file, "JSON trivialmente vazio");
  ok(file, `JSON válido (${(raw.length / 1024).toFixed(0)} KB)`);
}

const RULES = [
  { re: /(pull-torneios|drive-data|aquapor-data|jovens_).*\.json$/i, fn: validateFpgPull },
  { re: /fpg-admissions-draws\.json$/i, fn: validateAdmissionsDraws },
  { re: /uskids-results\.json$/i, fn: validateUskidsResults },
  { re: /uskids-member-history-slim\.json$/i, fn: validateMemberHistorySlim },
  { re: /(players|player-stats)\.json$/i, fn: validatePlayers },
];

function validateFile(fp) {
  const base = path.basename(fp);
  let raw;
  try {
    raw = fs.readFileSync(fp, "utf8");
  } catch (e) {
    return fail(base, `não foi possível ler: ${e.message}`);
  }
  let d;
  try {
    d = JSON.parse(raw);
  } catch (e) {
    return fail(base, `JSON inválido: ${e.message.slice(0, 100)}`);
  }
  const rule = RULES.find(r => r.re.test(base));
  if (rule) return rule.fn(base, d);
  return validateGeneric(base, d, raw);
}

// ── CLI ──
const args = process.argv.slice(2);
let files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--glob") {
    const pattern = args[++i];
    // glob simples: dir fixo + prefixo/sufixo com um único *
    const dir = path.dirname(pattern);
    const baseP = path.basename(pattern);
    const m = baseP.split("*");
    if (m.length > 2 || !fs.existsSync(dir)) {
      console.error(`[validate] glob não suportado ou dir inexistente: ${pattern}`);
      process.exit(1);
    }
    const [pre, suf = ""] = m;
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(pre) && f.endsWith(suf)) files.push(path.join(dir, f));
    }
  } else {
    files.push(args[i]);
  }
}

if (files.length === 0) {
  console.error("Uso: node scripts/validate-data.js <ficheiro...> | --glob \"public/data/drive-data-*.json\"");
  process.exit(1);
}

for (const f of files) validateFile(f);

for (const m of oks) console.log("  ✓", m);
if (errs.length) {
  console.error(`\n❌ ${errs.length} ficheiro(s) inválido(s):`);
  for (const m of errs) console.error("  ✗", m);
  process.exit(1);
}
console.log(`\n✓ ${files.length} ficheiro(s) válido(s)`);
process.exit(0);
