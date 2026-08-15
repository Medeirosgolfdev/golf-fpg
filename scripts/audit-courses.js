#!/usr/bin/env node
/**
 * audit-courses.js
 *
 * Auditoria de qualidade do catálogo de campos. Existe porque os dados de
 * campo vivem hoje em três sítios com donos e cadências diferentes:
 *
 *   public/data/master-courses.json  ← pipeline.js (catálogo FPG)
 *   public/data/away-courses.json    ← extract-courses.js (a partir de cartões)
 *   src/data/extraCourses.ts         ← curado à mão, de PDFs oficiais
 *
 * O merge só acontece em runtime (App.tsx, por nome canónico), por isso nada
 * impede que a mesma Montecchia entre três vezes com três nomes. Este script
 * mede o estrago e falha quando piora — é o travão que permite ir limpando
 * `course-aliases.json` sem regredir.
 *
 * Uso:
 *   node scripts/audit-courses.js            # relatório + exit code
 *   node scripts/audit-courses.js --json     # só JSON (para CI/dashboards)
 *   node scripts/audit-courses.js --no-fail  # nunca falha (inspecção local)
 *
 * Exit code 1 se alguma métrica ultrapassar o tecto em BASELINE.
 * Ao limpar duplicados, BAIXAR os tectos — nunca subir para calar o script.
 */

"use strict";

const fs = require("fs");
const path = require("path");

/* ═══════════════════════════════════════════════════════════════════════════
   TECTOS — máximo tolerado por métrica. Descer à medida que se limpa.
   ═══════════════════════════════════════════════════════════════════════════ */

const BASELINE = {
  /** Campos away cujo nome já existe em master-courses (deviam ser excluídos). */
  awayShadowingMaster: 0,
  /**
   * Grupos de campos duplicados. Os 3 restantes são campos legitimamente
   * distintos que partilham palavras: Penina Golf vs Penina Resort, os dois
   * percursos do St Leon-Rot, e Isla Canela Golf vs Links. Se este número
   * subir, é duplicação a sério.
   */
  duplicateGroups: 3,
  /** Entradas away que são nome de torneio, não de campo. */
  tournamentsAsCourses: 0,
  /**
   * Campos away sem uma única distância. São cartões antigos que só trazem
   * CR/Slope — não dá para comparar nem simular. Só desce com curadoria
   * (extraCourses.ts) ou com cartões novos; por isso o tecto tem folga.
   */
  awayWithoutDistances: 60,
  /**
   * Tees por campo away. Com o colapso por marcação física nenhum campo passa
   * de uma marcação por nome+nº de buracos; 12 dá folga para campos com muitas
   * marcações reais sem deixar voltar o histórico de re-ratings.
   */
  maxTeesPerAwayCourse: 12,
};

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

const ROOT = process.cwd();
const P = {
  master: path.join(ROOT, "public", "data", "master-courses.json"),
  away: path.join(ROOT, "public", "data", "away-courses.json"),
  extra: path.join(ROOT, "src", "data", "extraCourses.ts"),
  aliases: path.join(ROOT, "course-aliases.json"),
};

function readJSON(fpath) {
  let txt = fs.readFileSync(fpath, "utf-8");
  if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
  return JSON.parse(txt);
}

/** Mesma normalização do extract-courses.js — as chaves de alias têm de casar. */
function norm(s) {
  return String(s || "")
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Palavras que não distinguem campos — "Golf Club X" e "X Golf" são o mesmo. */
const GENERIC = new Set([
  "golf", "golfe", "club", "clube", "course", "country", "resort", "links",
  "the", "and", "de", "do", "da", "des", "del", "di", "el", "la", "les",
  "real", "royal", "campo", "parcours", "platz", "circuito",
]);

/**
 * Assinatura de um nome: palavras significativas ordenadas.
 *
 * Tokens curtos CONTAM, desde que não sejam genéricos — são precisamente eles
 * que distinguem campos legitimamente diferentes: "Aroeira No.1" vs "No.2",
 * "Verdegolf Batalha A+B" vs "B+C" vs "C+A", "Ribagolfe II". Filtrar por
 * comprimento fundia-os todos e enchia o relatório de falsos positivos.
 */
function signature(name) {
  const toks = norm(name)
    .split(" ")
    .filter(w => w && !GENERIC.has(w));
  return toks.length ? [...new Set(toks)].sort().join("|") : null;
}

/**
 * Nomes que denunciam um torneio a fazer-se passar por campo. A FPG grava o
 * nome do evento no campo `course` do cartão quando o clube não vem preenchido,
 * e o extractor aceita-o como se fosse um campo novo.
 */
const TOURNAMENT_RX = new RegExp(
  [
    "campeonato", "campionato", "torneio", "troph", "trofeu", "troféu",
    "\\bcup\\b", "\\bcopa\\b", "masters", "championship", "circuito",
    "\\btaca\\b", "\\btaça\\b", "invitational", "\\bclassic\\b",
    "memorial", "\\bmatch\\b", "puntuable", "\\bopen\\b.*\\b(20\\d{2}|d[123])\\b",
    "\\bsub ?1[0-9]\\b", "\\bu1[0-9]\\b", "\\b20[012]\\d\\b",
  ].join("|"),
  "i"
);

function teeCount(course) {
  return (course.master && course.master.tees ? course.master.tees : []).length;
}

function hasAnyDistance(course) {
  const tees = (course.master && course.master.tees) || [];
  return tees.some(t => t.distances && t.distances.total);
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUDITORIA
   ═══════════════════════════════════════════════════════════════════════════ */

function audit() {
  const master = readJSON(P.master);
  const awayRaw = readJSON(P.away);
  const away = awayRaw.courses || awayRaw;
  const aliases = fs.existsSync(P.aliases) ? readJSON(P.aliases) : {};

  // extraCourses.ts é TypeScript — lemos os nomes por regex, não vale a pena
  // montar um transpiler só para contar campos.
  const extraSrc = fs.existsSync(P.extra) ? fs.readFileSync(P.extra, "utf-8") : "";
  const extraNames = [...extraSrc.matchAll(/^\s{4}name:\s*"([^"]+)"/gm)].map(m => m[1]);

  const masterNorms = new Map();
  for (const c of master.courses || []) masterNorms.set(norm(c.master.name), c.master.name);

  const findings = {};

  /* 1 ─ Away a duplicar um campo que já existe no master */
  findings.awayShadowingMaster = away
    .filter(c => masterNorms.has(norm(c.master.name)))
    .map(c => ({ name: c.master.name, key: c.courseKey, tees: teeCount(c) }))
    .sort((a, b) => b.tees - a.tees);

  /* 2 ─ Grupos duplicados (dentro e entre fontes) */
  const bySig = new Map();
  const push = (sig, entry) => {
    if (!sig) return;
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig).push(entry);
  };
  for (const c of master.courses || []) push(signature(c.master.name), { src: "master", name: c.master.name, key: c.courseKey });
  for (const c of away) push(signature(c.master.name), { src: "away", name: c.master.name, key: c.courseKey });
  for (const n of extraNames) push(signature(n), { src: "extra", name: n, key: "(extraCourses.ts)" });

  /**
   * Um grupo só conta como duplicado se houver nomes REALMENTE diferentes a
   * apontar para o mesmo campo. Quando o nome normalizado é idêntico em fontes
   * diferentes (away + extraCourses), o merge por nome canónico do App.tsx
   * junta-os de propósito: a entrada away traz `_players` (quem jogou), a
   * curada traz os tees oficiais. Isso é a arquitectura, não um defeito.
   */
  const allGroups = [...bySig.values()].filter(g => g.length > 1 && new Set(g.map(e => e.key)).size > 1);
  const isByDesign = g => new Set(g.map(e => norm(e.name))).size === 1
    && new Set(g.map(e => e.src)).size === g.length;

  findings.curatedPairs = allGroups.filter(isByDesign).sort((a, b) => b.length - a.length);
  findings.duplicateGroups = allGroups.filter(g => !isByDesign(g)).sort((a, b) => b.length - a.length);

  /* 3 ─ Torneios registados como campos */
  findings.tournamentsAsCourses = away
    .filter(c => TOURNAMENT_RX.test(c.master.name))
    .map(c => ({ name: c.master.name, key: c.courseKey }));

  /* 4 ─ Campos away sem distâncias */
  findings.awayWithoutDistances = away
    .filter(c => !hasAnyDistance(c))
    .map(c => ({ name: c.master.name, key: c.courseKey, tees: teeCount(c) }));

  /* 5 ─ Excesso de tees: um por CR/slope histórico em vez de por marcação */
  const teeRank = away
    .map(c => ({ name: c.master.name, key: c.courseKey, tees: teeCount(c) }))
    .sort((a, b) => b.tees - a.tees);
  findings.teeBloat = teeRank.filter(c => c.tees > BASELINE.maxTeesPerAwayCourse);
  findings.worstTeeCount = teeRank.length ? teeRank[0].tees : 0;

  const totals = {
    masterCourses: (master.courses || []).length,
    masterTees: (master.courses || []).reduce((s, c) => s + teeCount(c), 0),
    masterGeneratedAt: (master.meta && master.meta.generatedAt) || null,
    awayCourses: away.length,
    awayTees: away.reduce((s, c) => s + teeCount(c), 0),
    extraCourses: extraNames.length,
    aliases: Object.keys(aliases.aliases || {}).length,
    blacklist: (aliases.blacklist || []).length,
    nameOverrides: Object.keys(aliases.nameOverrides || {}).length,
  };

  return { totals, findings };
}

/* ═══════════════════════════════════════════════════════════════════════════
   RELATÓRIO
   ═══════════════════════════════════════════════════════════════════════════ */

function checks(findings) {
  return [
    ["Away a duplicar master", findings.awayShadowingMaster.length, BASELINE.awayShadowingMaster],
    ["Grupos duplicados", findings.duplicateGroups.length, BASELINE.duplicateGroups],
    ["Torneios como campos", findings.tournamentsAsCourses.length, BASELINE.tournamentsAsCourses],
    ["Away sem distâncias", findings.awayWithoutDistances.length, BASELINE.awayWithoutDistances],
    ["Tees no pior campo away", findings.worstTeeCount, BASELINE.maxTeesPerAwayCourse],
  ];
}

function report({ totals, findings }) {
  const L = [];
  L.push("");
  L.push("═══ Auditoria do catálogo de campos ═══");
  L.push("");
  L.push(`  master-courses.json   ${totals.masterCourses} campos · ${totals.masterTees} tees   (gerado ${totals.masterGeneratedAt || "?"})`);
  L.push(`  away-courses.json     ${totals.awayCourses} campos · ${totals.awayTees} tees`);
  L.push(`  extraCourses.ts       ${totals.extraCourses} campos (hardcoded)`);
  L.push(`  course-aliases.json   ${totals.aliases} aliases · ${totals.blacklist} blacklist · ${totals.nameOverrides} nameOverrides`);
  L.push(`  pares curados         ${findings.curatedPairs.length} (away + extraCourses com o mesmo nome — fundidos por desenho)`);
  L.push("");

  for (const [label, value, cap] of checks(findings)) {
    const status = value > cap ? "FALHA" : "ok   ";
    L.push(`  [${status}] ${label.padEnd(26)} ${String(value).padStart(4)}   (tecto ${cap})`);
  }
  L.push("");

  const show = (title, rows, fmt, limit = 12) => {
    if (!rows.length) return;
    L.push(`  ── ${title} (${rows.length}) ──`);
    for (const r of rows.slice(0, limit)) L.push("     " + fmt(r));
    if (rows.length > limit) L.push(`     … mais ${rows.length - limit}`);
    L.push("");
  };

  show("Away a duplicar um campo do master", findings.awayShadowingMaster,
    r => `${String(r.tees).padStart(3)} tees  ${r.name}  —  ${r.key}`);
  show("Torneios registados como campos", findings.tournamentsAsCourses,
    r => `${r.name}  —  ${r.key}`);
  show("Excesso de tees (um por CR/slope histórico)", findings.teeBloat,
    r => `${String(r.tees).padStart(3)} tees  ${r.name}  —  ${r.key}`);

  if (findings.duplicateGroups.length) {
    L.push(`  ── Grupos duplicados (${findings.duplicateGroups.length}) ──`);
    for (const g of findings.duplicateGroups.slice(0, 10)) {
      L.push(`     ▸ ${g.map(e => e.src).join(" + ")}`);
      for (const e of g) L.push(`         [${e.src.padEnd(6)}] ${e.name}  —  ${e.key}`);
    }
    if (findings.duplicateGroups.length > 10) L.push(`     … mais ${findings.duplicateGroups.length - 10} grupos`);
    L.push("");
  }

  return L.join("\n");
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════════════════ */

if (require.main === module) {
  const argv = process.argv.slice(2);
  const result = audit();

  if (argv.includes("--json")) {
    const summary = Object.fromEntries(checks(result.findings).map(([k, v, cap]) => [k, { value: v, cap }]));
    console.log(JSON.stringify({ totals: result.totals, summary, findings: result.findings }, null, 2));
  } else {
    console.log(report(result));
  }

  const failed = checks(result.findings).filter(([, v, cap]) => v > cap);
  if (failed.length && !argv.includes("--no-fail")) {
    if (!argv.includes("--json")) {
      console.error(`Auditoria falhou: ${failed.map(([l]) => l).join(", ")}.`);
      console.error("Corrigir os dados (course-aliases.json) ou, se a melhoria for real, descer o tecto em BASELINE.\n");
    }
    process.exit(1);
  }
}

module.exports = { audit, norm, signature, BASELINE, TOURNAMENT_RX };
