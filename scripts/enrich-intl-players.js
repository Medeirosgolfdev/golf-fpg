#!/usr/bin/env node
/**
 * enrich-intl-players.js
 *
 * Anexa a ficha federativa espanhola (`_rfeg`) aos jogadores SEM numero de
 * federado portugues, em qualquer ficheiro de inscricoes/draws/resultados.
 *
 * ─── Porque e preciso ───────────────────────────────────────────────────
 * Os torneios com estrangeiros gravam-nos so com nome e clube "Internacional":
 * fedCode null, sem data de nascimento, sem sexo. As tabelas da app derivam o
 * escalao de dob+data-do-torneio, e sem dob mostram "–". O handicap aparece,
 * porque vem no proprio resultado; o resto nao.
 *
 * A RFEG publica tudo isso e ja temos o roster em public/data/spain-players.json
 * (18890 jogadores). Falta so o cruzamento — e ele tem de ser feito UMA vez,
 * na origem, e nao repetido em cada componente que mostra uma tabela.
 *
 * ─── Como cruza ─────────────────────────────────────────────────────────
 * Por nome, exigindo candidato UNICO: cada palavra do nome publicado tem de
 * casar (prefixo, min 4 chars) com uma palavra distinta do candidato. Nomes
 * curtos e gralhas da fonte resolvem-se ("Diego Gross" -> GROSS PANEQUE,
 * DIEGO; "Ofelia ... Benite Benite" -> GONZALEZ-CARRASCOSA BENITEZ, OFELIA).
 * Havendo zero ou mais do que um candidato, NAO escreve nada — melhor ficar
 * vazio do que atribuir a pessoa errada.
 *
 * O juniorId (`"r" + licenca`) so e escrito depois de confirmado que existe
 * mesmo em juniors.json: a precedencia do agregador pode dar outro prefixo
 * quando o jogador tambem tem ficha USKids ou FPG.
 *
 * ─── Uso ────────────────────────────────────────────────────────────────
 *   node scripts/enrich-intl-players.js                    # todos os alvos
 *   node scripts/enrich-intl-players.js --dry              # so relatorio
 *   node scripts/enrich-intl-players.js public/data/x.json # ficheiro a escolha
 *
 * Idempotente: correr as vezes que forem precisas.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

const ALVOS_POR_DEFEITO = [
  "public/data/fpg-admissions-draws.json",
  ...fs.readdirSync(path.join(ROOT, "public", "data"))
    .filter(f => /^torneio-\d+-\d+\.json$/.test(f))
    .map(f => `public/data/${f}`),
];

const DRY = process.argv.includes("--dry");
const alvos = process.argv.slice(2).filter(a => !a.startsWith("--"));

function readJSON(p) {
  let t = fs.readFileSync(p, "utf-8");
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return JSON.parse(t);
}

const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["de", "del", "la", "los", "las", "da", "do", "dos", "y"]);
const toks = s => norm(s).split(" ").filter(w => w && !STOP.has(w));

/* ── Fontes ── */
const byName = readJSON(path.join(ROOT, "public/data/spain-players.json")).byName;
const porLic = new Map();
for (const p of Object.values(byName)) if (p.licencia && !porLic.has(p.licencia)) porLic.set(p.licencia, p);
const cands = [...porLic.values()].map(p => ({ p, t: toks(p.name) }));

const juniorIds = new Set(readJSON(path.join(ROOT, "public/data/juniors.json")).juniors.map(j => j.id));
const canonPorId = new Map(readJSON(path.join(ROOT, "public/data/juniors.json")).juniors.map(j => [j.id, j.canonicalName]));
const SNAPSHOT = readJSON(path.join(ROOT, "public/data/spain-players.json")).generatedAt;

/** Candidato unico, ou null. */
function casar(nome) {
  const want = [...new Set(toks(nome))];
  if (!want.length) return null;
  const hits = cands.filter(c => {
    const pool = [...c.t];
    return want.every(w => {
      const i = pool.findIndex(x => x === w || (w.length >= 4 && (x.startsWith(w) || w.startsWith(x))));
      if (i < 0) return false;
      pool.splice(i, 1);
      return true;
    });
  });
  return hits.length === 1 ? hits[0].p : null;
}

function ficha(s) {
  const jid = "r" + s.licencia;
  return {
    licencia: s.licencia,
    nome: s.name,
    dob: s.dobIso || s.dob || null,
    sex: s.sex || null,
    hcp: s.hcp,
    club: s.club || null,
    pais: "ESP",
    fonte: "public/data/spain-players.json (RFEG)",
    snapshot: SNAPSHOT,
    ...(juniorIds.has(jid) ? { juniorId: jid, nomeCanonico: canonPorId.get(jid) } : {}),
  };
}

/**
 * Devolve os jogadores de um ficheiro, pelos caminhos CONHECIDOS.
 *
 * Uma travessia cega nao serve: um torneio tambem tem `name` e nao tem `fed`,
 * e acabava tratado como jogador (e o proprio `_rfeg` recem-escrito tambem).
 * Enumerar os caminhos e mais chato e muito mais seguro.
 *
 *   fpg-admissions-draws.json  tournaments[].admissions.players[]
 *                              tournaments[].draws[r].groups[].players[]
 *   torneio-CCC-TTTT.json      tournaments[].players[]
 */
function jogadoresDe(j) {
  const out = [];
  for (const t of (j.tournaments || [])) {
    for (const p of (t.admissions?.players || [])) out.push(p);
    for (const r of Object.values(t.draws || {})) {
      for (const g of (r?.groups || [])) for (const p of (g.players || [])) out.push(p);
    }
    for (const p of (t.players || [])) out.push(p);
  }
  return out;
}

let totalOk = 0, totalFalha = 0;
const falhados = new Set();

for (const rel of (alvos.length ? alvos : ALVOS_POR_DEFEITO)) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { console.log(`  (salta, nao existe) ${rel}`); continue; }
  const j = readJSON(abs);
  let ok = 0, falha = 0, jaTinha = 0;

  for (const p of jogadoresDe(j)) {
    if (p.fed || p.fedCode) continue;              // federado FPG: nao mexer
    // So os marcados como internacionais. Ha portugueses sem fedCode em
    // ficheiros antigos — cruza-los com o roster espanhol nao faz sentido e
    // enchia o relatorio de ruido (nenhum casava, mas mesmo assim).
    if (!/internacional/i.test(String(p.clube || p.club || ""))) continue;
    if (p._rfeg && p._rfeg.licencia) { jaTinha++; continue; }
    const nome = p.nome || p.name;
    const s = casar(nome);
    if (!s) { falha++; falhados.add(nome); continue; }
    p._rfeg = ficha(s);
    ok++;
  }

  totalOk += ok; totalFalha += falha;
  console.log(`  ${rel}`);
  console.log(`      ${ok} enriquecidos · ${jaTinha} ja tinham · ${falha} sem correspondencia unica`);
  if (!DRY && ok > 0) fs.writeFileSync(abs, JSON.stringify(j, null, 2) + "\n");
}

console.log("");
console.log(`Total: ${totalOk} enriquecidos · ${totalFalha} sem correspondencia`);
if (falhados.size) {
  console.log("Sem correspondencia unica na RFEG (ficam sem escalao, de propria vontade):");
  for (const n of [...falhados].slice(0, 20)) console.log("   " + n);
}
if (DRY) console.log("\n(--dry: nada foi escrito)");
