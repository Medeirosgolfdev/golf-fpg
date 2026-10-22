#!/usr/bin/env node
/**
 * audit-courses.js
 *
 * Auditoria do catálogo de campos TAL COMO O SITE O MOSTRA, com trava de
 * regressão. Os campos vêm de quatro fontes:
 *
 *   public/data/master-courses.json  ← pipeline.js (catálogo FPG)
 *   public/data/away-courses.json    ← extract-courses.js (a partir de cartões)
 *   melhorias.json                   ← voltas internacionais (melhoriasLoader)
 *   src/data/extraCourses.ts         ← curado à mão, de PDFs oficiais
 *
 * e só se fundem no browser, em buildAllCourses() (src/data/courses.ts): por
 * courseKey e depois pelo nome canónico de src/utils/courseAliases.ts, com o
 * master a ganhar e os tees colapsados. Para não haver uma segunda cópia dessa
 * lógica, este script NÃO a reimplementa: empacota o próprio courses.ts com o
 * esbuild (que já vem com o vite) e corre-o sobre os ficheiros do disco. O que
 * se mede é exactamente a lista que a /campos e o /simulador recebem.
 *
 * Métricas com tecto (BASELINE):
 *   - grupos duplicados: campos distintos no site que são o mesmo campo físico
 *     com nomes que a canonização não junta (faltam aliases);
 *   - torneios como campos: nomes de torneio que ficaram como campo e não estão
 *     em src/constants/tournamentCourses.ts;
 *   - campos away sem uma única distância;
 *   - tees no pior campo (depois do colapso do site).
 *
 * Uso:
 *   node scripts/audit-courses.js            # relatório + exit code
 *   node scripts/audit-courses.js --json     # só JSON
 *   node scripts/audit-courses.js --no-fail  # nunca falha (inspecção local)
 *
 * Exit 1 se alguma métrica passar o tecto. Ao limpar, DESCER os tectos — nunca
 * subir para calar o aviso. Corre no update-data.yml depois do extract-courses.
 *
 * Refeito a 22/10/2026 a partir do ramo arquivo/course-data-single-source (17/08),
 * agora sobre a fonte única dos aliases (src/utils/courseAliases.ts).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");

/* ═══════════════════════════════════════════════════════════════════════════
   TECTOS — máximo tolerado por métrica (valores medidos a 22/10/2026).
   Descer à medida que se limpa; nunca subir para calar o aviso.
   ═══════════════════════════════════════════════════════════════════════════ */

const BASELINE = {
  /** Inclui um par legítimo (Penina Golf Course ≠ Penina Resort Course, dois
   *  percursos do mesmo resort) — o mínimo realista é 1. */
  duplicateGroups: 4,
  tournamentsAsCourses: 4,
  /** Cartões antigos só com CR/Slope; desce com curadoria ou cartões novos. */
  awayWithoutDistances: 35,
  maxTeesPerCourse: 13,
};

/* ═══════════════════════════════════════════════════════════════════════════
   CARREGAR O CATÁLOGO COMO O SITE
   ═══════════════════════════════════════════════════════════════════════════ */

const ROOT = path.resolve(__dirname, "..");

function readJSON(fpath, fallback) {
  if (!fs.existsSync(fpath)) return fallback;
  let txt = fs.readFileSync(fpath, "utf-8");
  if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
  return JSON.parse(txt);
}

/** Empacota o código de fusão do site (TypeScript) e devolve os seus exports. */
function loadSiteModules() {
  const esbuild = require(path.join(ROOT, "node_modules", "esbuild"));
  const out = esbuild.buildSync({
    stdin: {
      contents: [
        'export { buildAllCourses, splitCourses } from "./src/data/courses";',
        'export { extractAwayCourses } from "./src/data/melhoriasLoader";',
        'export { getExtraCourses } from "./src/data/extraCourses";',
        'export { norm, canonicalCourseName } from "./src/utils/courseAliases";',
      ].join("\n"),
      resolveDir: ROOT,
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    logLevel: "silent",
  });
  const m = new Module(path.join(ROOT, "audit-courses.bundle.js"));
  m.paths = Module._nodeModulePaths(ROOT);
  m._compile(out.outputFiles[0].text, m.id);
  return m.exports;
}

/* ═══════════════════════════════════════════════════════════════════════════
   REGRAS (puras — testadas em scripts/audit-courses.test.js)
   ═══════════════════════════════════════════════════════════════════════════ */

/** Palavras que não distinguem campos — "Golf Club X" e "X Golf" são o mesmo. */
const GENERIC = new Set([
  "golf", "golfe", "club", "clube", "course", "country", "resort", "links",
  "the", "and", "de", "do", "da", "des", "del", "di", "el", "la", "les",
  "real", "royal", "campo", "parcours", "platz", "circuito",
]);

/**
 * Assinatura de um nome: palavras significativas, sem repetições, ordenadas.
 * Tokens curtos contam (desde que não sejam genéricos): são eles que separam
 * campos diferentes — "Aroeira No.1" vs "No.2", "Batalha A+B" vs "B+C".
 */
function signature(name, norm) {
  const toks = norm(name).split(" ").filter((w) => w && !GENERIC.has(w));
  return toks.length ? [...new Set(toks)].sort().join("|") : null;
}

/**
 * Nomes que denunciam um torneio a fazer-se passar por campo (a FPG grava o
 * nome do evento no campo `course` do cartão quando o clube vem vazio).
 */
const TOURNAMENT_RX = new RegExp(
  [
    "campeonato", "campionato", "torneio", "troph", "trofeu", "troféu",
    "\\bcup\\b", "\\bcopa\\b", "masters", "championship", "circuito",
    "\\btaca\\b", "\\btaça\\b", "invitational", "\\bclassic\\b",
    "memorial", "\\bmatch\\b", "puntuable", "\\bopen\\b.*\\b(20\\d{2}|d[123])\\b",
    "\\bsub ?1[0-9]\\b", "\\bu1[0-9]\\b", "\\b20[012]\\d\\b",
  ].join("|"),
  "i",
);

const tees = (c) => (c.master && c.master.tees) || [];
const hasAnyDistance = (c) => tees(c).some((t) => t.distances && t.distances.total > 0);
const isAway = (c) => String(c.courseKey).startsWith("away-");

/**
 * Corre as verificações sobre o resultado de buildAllCourses + splitCourses.
 *   simCourses   — os campos do site (sem os torneios curados)
 *   rawAway      — away-courses.json tal como está no disco (só para informação)
 *   masterNames  — Set dos nomes canónicos normalizados do master
 */
function auditCatalog({ simCourses, tournamentCourses, rawAway, masterNames, norm, canonicalCourseName }) {
  const findings = {};

  /* 1 ─ Grupos duplicados: o mesmo campo físico mostrado mais de uma vez */
  const bySig = new Map();
  for (const c of simCourses) {
    const sig = signature(c.master.name, norm);
    if (!sig) continue;
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig).push({ name: c.master.name, key: c.courseKey, tees: tees(c).length });
  }
  findings.duplicateGroups = [...bySig.values()]
    .filter((g) => g.length > 1)
    .sort((a, b) => b.length - a.length || a[0].name.localeCompare(b[0].name));

  /* 2 ─ Torneios como campos (não marcados em tournamentCourses.ts) */
  findings.tournamentsAsCourses = simCourses
    .filter((c) => isAway(c) && TOURNAMENT_RX.test(c.master.name))
    .map((c) => ({ name: c.master.name, key: c.courseKey }));

  /* 3 ─ Campos away sem uma única distância */
  findings.awayWithoutDistances = simCourses
    .filter((c) => isAway(c) && !hasAnyDistance(c))
    .map((c) => ({ name: c.master.name, key: c.courseKey, tees: tees(c).length }));

  /* 4 ─ Tees a mais (depois do colapso do site) */
  const rank = simCourses
    .map((c) => ({ name: c.master.name, key: c.courseKey, tees: tees(c).length }))
    .sort((a, b) => b.tees - a.tees);
  findings.worstTeeCount = rank.length ? rank[0].tees : 0;
  findings.teeRanking = rank.slice(0, 5);

  /* Informação (sem tecto) ─ entradas do away-courses.json que repetem um
     campo do master. O site funde-as e fica com os tees oficiais, por isso não
     aparecem duplicadas; mas o extract-courses devia tê-las excluído. */
  findings.awayShadowingMaster = rawAway
    .filter((c) => masterNames.has(norm(canonicalCourseName(c.master.name) || c.master.name)))
    .map((c) => ({ name: c.master.name, key: c.courseKey, tees: tees(c).length }))
    .sort((a, b) => b.tees - a.tees);
  findings.curatedTournaments = (tournamentCourses || []).length;

  return findings;
}

function checks(findings) {
  return [
    ["Grupos duplicados", findings.duplicateGroups.length, BASELINE.duplicateGroups],
    ["Torneios como campos", findings.tournamentsAsCourses.length, BASELINE.tournamentsAsCourses],
    ["Away sem distâncias", findings.awayWithoutDistances.length, BASELINE.awayWithoutDistances],
    ["Tees no pior campo", findings.worstTeeCount, BASELINE.maxTeesPerCourse],
  ];
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUDITORIA SOBRE OS FICHEIROS DO DISCO
   ═══════════════════════════════════════════════════════════════════════════ */

function audit() {
  const site = loadSiteModules();
  const master = readJSON(path.join(ROOT, "public", "data", "master-courses.json"), { courses: [] });
  const awayRaw = readJSON(path.join(ROOT, "public", "data", "away-courses.json"), []);
  const away = Array.isArray(awayRaw) ? awayRaw : awayRaw.courses || [];
  const melhorias = readJSON(path.join(ROOT, "melhorias.json"), {});
  const awayCfg = readJSON(path.join(ROOT, "course-aliases.json"), {});
  const extra = site.getExtraCourses();
  const melhoriasAway = site.extractAwayCourses(melhorias);

  const all = site.buildAllCourses({
    fpg: master.courses || [],
    pipelineAway: away,
    melhoriasAway,
    extra,
  });
  const { simCourses, tournamentCourses } = site.splitCourses(all);

  const { norm, canonicalCourseName } = site;
  const masterNames = new Set(
    (master.courses || []).map((c) => norm(canonicalCourseName(c.master.name) || c.master.name)),
  );

  const findings = auditCatalog({ simCourses, tournamentCourses, rawAway: away, masterNames, norm, canonicalCourseName });

  const totals = {
    masterCourses: (master.courses || []).length,
    masterGeneratedAt: (master.meta && master.meta.generatedAt) || null,
    awayCourses: away.length,
    awayTees: away.reduce((s, c) => s + tees(c).length, 0),
    melhoriasAwayCourses: melhoriasAway.length,
    extraCourses: extra.length,
    siteCourses: simCourses.length,
    siteTees: simCourses.reduce((s, c) => s + tees(c).length, 0),
    tournamentCourses: tournamentCourses.length,
    awayCfgAliases: Object.keys(awayCfg.aliases || {}).length,
    awayCfgBlacklist: (awayCfg.blacklist || []).length,
    awayCfgNameOverrides: Object.keys(awayCfg.nameOverrides || {}).length,
  };

  return { totals, findings };
}

/* ═══════════════════════════════════════════════════════════════════════════
   RELATÓRIO
   ═══════════════════════════════════════════════════════════════════════════ */

function report({ totals: t, findings: f }) {
  const L = [];
  L.push("");
  L.push("═══ Auditoria do catálogo de campos (como o site o mostra) ═══");
  L.push("");
  L.push(`  master-courses.json   ${t.masterCourses} campos   (gerado ${t.masterGeneratedAt || "?"})`);
  L.push(`  away-courses.json     ${t.awayCourses} campos · ${t.awayTees} tees`);
  L.push(`  melhorias.json        ${t.melhoriasAwayCourses} campos away`);
  L.push(`  extraCourses.ts       ${t.extraCourses} campos curados`);
  L.push(`  course-aliases.json   ${t.awayCfgAliases} aliases · ${t.awayCfgBlacklist} blacklist · ${t.awayCfgNameOverrides} nameOverrides`);
  L.push(`  → no site             ${t.siteCourses} campos · ${t.siteTees} tees  (+ ${t.tournamentCourses} torneios à parte)`);
  L.push("");

  for (const [label, value, cap] of checks(f)) {
    const status = value > cap ? "FALHA" : value < cap ? "desce" : "ok   ";
    L.push(`  [${status}] ${label.padEnd(24)} ${String(value).padStart(4)}   (tecto ${cap})`);
  }
  L.push("");

  const show = (title, rows, fmt, limit = 15) => {
    if (!rows.length) return;
    L.push(`  ── ${title} (${rows.length}) ──`);
    for (const r of rows.slice(0, limit)) L.push("     " + fmt(r));
    if (rows.length > limit) L.push(`     … mais ${rows.length - limit}`);
    L.push("");
  };

  if (f.duplicateGroups.length) {
    L.push(`  ── Grupos duplicados (${f.duplicateGroups.length}) ──`);
    for (const g of f.duplicateGroups) {
      L.push("     ▸");
      for (const e of g) L.push(`         ${String(e.tees).padStart(3)} tees  ${e.name}  —  ${e.key}`);
    }
    L.push("");
  }
  show("Torneios como campos (fora de tournamentCourses.ts)", f.tournamentsAsCourses, (r) => `${r.name}  —  ${r.key}`);
  show("Campos com mais tees", f.teeRanking, (r) => `${String(r.tees).padStart(3)} tees  ${r.name}  —  ${r.key}`, 5);
  show("Away sem distâncias", f.awayWithoutDistances, (r) => `${r.name}  —  ${r.key}`, 10);
  show("Informação: away-courses.json repete um campo do master (o site funde-os)", f.awayShadowingMaster,
    (r) => `${String(r.tees).padStart(3)} tees  ${r.name}  —  ${r.key}`);

  return L.join("\n");
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════════════════ */

if (require.main === module) {
  const argv = process.argv.slice(2);
  const result = audit();
  const failed = checks(result.findings).filter(([, v, cap]) => v > cap);

  if (argv.includes("--json")) {
    const summary = Object.fromEntries(checks(result.findings).map(([k, v, cap]) => [k, { value: v, cap }]));
    console.log(JSON.stringify({ totals: result.totals, summary, findings: result.findings }, null, 2));
  } else {
    console.log(report(result));
  }

  if (failed.length && !argv.includes("--no-fail")) {
    console.error(`Auditoria de campos falhou: ${failed.map(([l]) => l).join(", ")}.`);
    console.error("Corrigir a origem (courseAliases.ts, course-aliases.json, tournamentCourses.ts) — não subir o tecto.\n");
    process.exit(1);
  }
}

module.exports = { audit, auditCatalog, checks, signature, BASELINE, TOURNAMENT_RX };
