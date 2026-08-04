#!/usr/bin/env node
/**
 * build-nacionais-jovens.js
 *
 * Consolida os Campeonatos Nacionais de Jovens FPG (Sub-10 a Sub-18, M+F) a partir
 * dos ficheiros jovens_YYYY.json + pull-torneios*.json + aroeira-nacional-2026.json
 * em public/data/, e produz public/data/nacionais-jovens.json com top-10 por
 * escalão/sexo/ano.
 *
 * Critério de inclusão (estrito):
 *   - name contém "Campeonato Nacional"
 *   - name contém "Sub" + dígitos (Sub-10/12/14/16/18)
 *   - EXCLUI "Drive Challenge", "Drive Tour", "Final Nacional", "de Clubes"
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "public", "data");
const OUT_PATH = path.join(DATA_DIR, "nacionais-jovens.json");

// Ordem importa: ficheiros mais à frente vencem em duplicados (mesmo ccode/tcode)
// só se tiverem mais jogadores. Por isso o histórico autoritativo vem PRIMEIRO.
const SOURCE_FILES = [
  "fpg-nacionais-historico.json",  // 160 Nacionais (2004-2026) via FPG ClassifLST — autoritativo
  "jovens_2019.json",
  "jovens_2020.json",
  "jovens_2022.json",
  "jovens_2023.json",
  "jovens_2024.json",
  "jovens_2025.json",
  "jovens_2026.json",
  // Todos os pull-torneios00N.json por ordem crescente — robusto à rotação
  // ~120/ficheiro (apanha 007, 008, ... sem editar esta lista).
  ...fs.readdirSync(DATA_DIR).filter((f) => /^pull-torneios\d{3}\.json$/.test(f)).sort(),
];

function isCampeonatoNacionalJovens(name) {
  if (!name) return false;
  const n = String(name).toLowerCase();
  // Aceitar "Campeonato Nacional" ou "Camp. Nacional" (formato antigo)
  if (!/(campeonato|camp\.)\s+nacional/.test(n)) return false;
  if (!/sub\s*-?\s*(10|12|14|16|18)\b/.test(n)) return false;
  if (/drive\s+challenge/.test(n)) return false;
  if (/drive\s+tour/.test(n)) return false;
  if (/^final\s+nacional/.test(n)) return false;
  if (/de\s+clubes/.test(n)) return false;
  return true;
}

function parseEscalao(name) {
  const m = String(name).match(/sub\s*-?\s*(10|12|14|16|18)/i);
  return m ? "Sub-" + m[1] : null;
}

function parseSexo(name) {
  const stripped = String(name)
    .replace(/sub\s*-?\s*\d+/gi, "")
    .replace(/\b20\d{2}\b/g, "")
    .toLowerCase();
  if (/raparigas|feminin|\bfem\b/.test(stripped)) return "F";
  if (/\bf\b/.test(stripped)) return "F";
  if (/\bs\b/.test(stripped)) return "F";
  if (/rapazes|masculin|\bmasc\b/.test(stripped)) return "M";
  if (/\bh\b/.test(stripped)) return "M";
  return "M";
}

function parseYear(date, name) {
  if (date && /^\d{4}/.test(date)) return parseInt(date.slice(0, 4), 10);
  const m = String(name).match(/\b(20\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

function topN(players, n) {
  return [...players]
    .filter((p) => p && (typeof p.pos === "number" || p.pos === 0))
    .sort((a, b) => (a.pos || 9999) - (b.pos || 9999))
    .slice(0, n)
    .map((p) => {
      const rounds = (p.roundScores || [])
        .sort((a, b) => (a.round || 0) - (b.round || 0))
        .map((r) => r.gross);
      return {
        pos: p.pos,
        name: p.name || "",
        club: p.club || "",
        fedCode: p.fedCode || null,
        hcpExact: typeof p.hcpExact === "number" ? p.hcpExact : null,
        hcpPlay: typeof p.hcpPlay === "number" ? p.hcpPlay : null,
        grossTotal: p.grossTotal,
        toPar: typeof p.toPar === "number" ? p.toPar : null,
        rounds,
        scoreId: p.scoreId || null,
      };
    });
}

function loadFile(file) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(full, "utf8"));
    return j.tournaments || j;
  } catch (e) {
    console.warn("[warn] não consegui parse de", file, "—", e.message);
    return null;
  }
}

function main() {
  const seen = new Map();
  const sourceCount = {};

  for (const file of SOURCE_FILES) {
    const arr = loadFile(file);
    if (!Array.isArray(arr)) continue;
    let n = 0;
    for (const t of arr) {
      if (!isCampeonatoNacionalJovens(t.name)) continue;
      const key = (t.ccode || "?") + "/" + (t.tcode || "?");
      const existing = seen.get(key);
      const playerCount = (t.players || []).length;
      if (!existing || playerCount > (existing._t.players || []).length) {
        seen.set(key, { _file: file, _t: t });
      }
      n++;
    }
    if (n > 0) sourceCount[file] = n;
  }

  const torneios = [];
  let skipped = 0;

  for (const { _file, _t: t } of seen.values()) {
    const escalao = parseEscalao(t.name);
    const sexo = parseSexo(t.name);
    const year = parseYear(t.date, t.name);

    if (!escalao || !sexo || !year) {
      skipped++;
      continue;
    }
    const players = t.players || [];
    if (players.length === 0) {
      skipped++;
      continue;
    }

    const finishers = players.filter(
      (p) => typeof p.grossTotal === "number" && p.grossTotal > 0,
    );

    torneios.push({
      year,
      escalao,
      sexo,
      tcode: t.tcode,
      ccode: t.ccode,
      date: t.date,
      campo: t.campo || "",
      clube: t.clube || "",
      rounds: typeof t.rounds === "number" ? t.rounds : null,
      totalPlayers: players.length,
      totalFinishers: finishers.length,
      sourceName: t.name,
      sourceFile: _file,
      top10: topN(players, 10),
    });
  }

  torneios.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    const escOrder = { "Sub-10": 0, "Sub-12": 1, "Sub-14": 2, "Sub-16": 3, "Sub-18": 4 };
    if (escOrder[a.escalao] !== escOrder[b.escalao]) return escOrder[a.escalao] - escOrder[b.escalao];
    if (a.sexo !== b.sexo) return a.sexo === "M" ? -1 : 1;
    return 0;
  });

  const coverage = {};
  for (const t of torneios) {
    coverage[t.year] = coverage[t.year] || {};
    coverage[t.year][t.escalao] = coverage[t.year][t.escalao] || {};
    coverage[t.year][t.escalao][t.sexo] = {
      tcode: t.tcode,
      players: t.totalPlayers,
      finishers: t.totalFinishers,
    };
  }

  const out = {
    geradoEm: new Date().toISOString(),
    schema: "nacionais-jovens-v1",
    description:
      "Campeonatos Nacionais de Jovens FPG (Sub-10 a Sub-18, M+F). Top-10 por torneio.",
    totalTorneios: torneios.length,
    sourceCount,
    coverage,
    torneios,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log("[ok]", torneios.length, "torneios escritos em", path.relative(process.cwd(), OUT_PATH));
  console.log("[stats] skipped:", skipped);
  console.log("[stats] anos cobertos:", Object.keys(coverage).sort().join(", "));
  console.log("[sources]", sourceCount);
}

main();
