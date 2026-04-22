#!/usr/bin/env node
/**
 * scripts/build-tournaments-tracking.js (2026-04-22)
 * ═════════════════════════════════════════════════════════════════════════
 * Cruza todas as fontes de dados de torneios FPG para produzir um registo
 * único com o estado de cada torneio: tem admissions? tem draws? tem classif?
 * tem scorecards? O que falta?
 *
 * Fontes lidas:
 *   - public/data/fpg-admissions-draws.json         (admissions + draws)
 *   - public/data/pull-torneios*.json               (classif + scorecards manual)
 *   - public/data/pull-torneios-node.json           (idem, gerado pelo novo Node)
 *   - public/data/drive-data-*.json                 (Drive Tour)
 *   - public/data/aquapor-data-*.json               (Aquapor)
 *   - public/data/jovens_*.json                     (Nacionais Jovens)
 *   - public/data/santo-da-serra-tournaments.json   (CGSS)
 *
 * Output: public/data/fpg-tournaments-tracking.json
 *
 * Por cada torneio (keyed por ccode/tcode):
 *   - has_admissions: true se tem pelo menos 1 jogador em admissions.players
 *   - has_draws: true se tem pelo menos 1 ronda com groups.length > 0
 *   - has_classif: true se encontrado em alguma fonte de classif com playerCount > 0
 *   - players_with_scorecards: count de players onde roundScores.length > 0
 *   - scorecards_ratio: players_with_scorecards / playerCount
 *   - status: "future" | "in_progress" | "complete" | "missing_classif" |
 *             "missing_scorecards" | "missing_draws" | "missing_admissions" | "stale"
 *
 * Status decision tree (aplicado após apurar has_*):
 *   • date > hoje          → "future"
 *   • date <= hoje <= date+3d → "in_progress"
 *   • date+3d < hoje:
 *       - !has_classif           → "missing_classif"
 *       - has_classif && scorecards_ratio < 0.5 → "missing_scorecards"
 *       - !has_draws && tournRounds > 0         → "missing_draws"
 *       - has tudo               → "complete"
 *       - admissions arquivadas: !has_admissions é OK para torneios passados
 *
 * Exit codes:
 *   0 — sucesso
 *   1 — erro fatal
 * ═════════════════════════════════════════════════════════════════════════
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const DATA_DIR = path.join(REPO, "public", "data");
const OUT_FILE = path.join(DATA_DIR, "fpg-tournaments-tracking.json");

const TODAY = new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

/* ── Normalização ccode (3 dígitos zero-padded) ─────────────────────────── */
const k = (ccode, tcode) => `${String(ccode).padStart(3, "0")}/${tcode}`;

/* ── 1) Ler admissions + draws ──────────────────────────────────────────── */
function readAdmissionsDraws() {
  const fp = path.join(DATA_DIR, "fpg-admissions-draws.json");
  if (!fs.existsSync(fp)) return new Map();
  const j = JSON.parse(fs.readFileSync(fp, "utf8"));
  const map = new Map();
  for (const t of (j.tournaments || [])) {
    const key = k(t.ccode, t.tcode);
    const adm = t.admissions;
    const hasAdm = !!(adm && !adm.error && Array.isArray(adm.players) && adm.players.length > 0);
    const draws = t.draws || {};
    const drawsWithGroups = Object.values(draws).filter(d => d && d.groups && d.groups.length > 0);
    const hasDraws = drawsWithGroups.length > 0;
    const totalPlayersDraws = drawsWithGroups.reduce((s, d) =>
      s + d.groups.reduce((gs, g) => gs + (g.players?.length || 0), 0), 0);
    map.set(key, {
      ccode: String(t.ccode).padStart(3, "0"),
      tcode: String(t.tcode),
      name: t.name,
      date: t.date,
      has_admissions: hasAdm,
      admissions_count: hasAdm ? adm.players.length : 0,
      has_draws: hasDraws,
      draws_rounds_with_data: drawsWithGroups.length,
      draws_players_total: totalPlayersDraws,
    });
  }
  return map;
}

/* ── 2) Ler classif + scorecards de múltiplos ficheiros ─────────────────── */
function readClassifSources() {
  const patterns = [
    /^pull-torneios.*\.json$/,
    /^drive-data-\d{4}-\d{2}\.json$/,
    /^aquapor-data-\d{4}-\d{2}\.json$/,
    /^jovens_\d{4}\.json$/,
  ];
  const map = new Map();
  let files = [];
  try { files = fs.readdirSync(DATA_DIR).filter(f => patterns.some(rx => rx.test(f))); }
  catch { return map; }

  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
      const arr = Array.isArray(j) ? j : (j.tournaments || j.torneios || []);
      for (const t of arr) {
        if (!t.ccode || !t.tcode) continue;
        const key = k(t.ccode, t.tcode);
        const players = Array.isArray(t.players) ? t.players : [];
        const playerCount = t.playerCount ?? players.length;
        // Um jogador "tem scorecard" se tem roundScores com pelo menos 1 entrada
        // que tenha scores/gross preenchidos
        const withSc = players.filter(p => {
          const rs = p.roundScores || [];
          return rs.length > 0 && rs.some(r => r && (r.gross != null || (r.scores && r.scores.length > 0)));
        }).length;
        const existing = map.get(key);
        // Preserva o registo com MAIS scorecards (merge de múltiplas fontes)
        if (!existing || withSc > existing.players_with_scorecards) {
          map.set(key, {
            player_count: playerCount,
            players_with_scorecards: withSc,
            rounds: t.rounds || 1,
            // name/date também — para torneios que não estão em fpg-admissions-draws.json
            name: t.name || t.description || null,
            date: t.date || t.data || null,
            _source: f,
          });
        }
      }
    } catch (e) {
      console.warn(`[tracking] falhou ler ${f}: ${e.message}`);
    }
  }
  return map;
}

/* ── Status decision ────────────────────────────────────────────────────── */
function deriveStatus(t) {
  const days = daysBetween(t.date, TODAY);
  const rounds = t.rounds || 1;
  const tournEndOffset = rounds - 1;  // R1 começa dia 0, R3 acaba dia +2
  if (days < 0) return "future";
  if (days <= tournEndOffset) return "in_progress";
  // Janela de "acabou de acabar" (+3 dias após fim, consistente com scope dinâmico)
  if (days <= tournEndOffset + 3) {
    if (!t.has_classif) return "in_progress";  // ainda está a decorrer a atribuição de dados
    // fall-through para classificar completeness
  }
  // Passados
  if (!t.has_classif) return "missing_classif";
  if (t.player_count > 0) {
    const ratio = t.players_with_scorecards / t.player_count;
    if (ratio < 0.5) return "missing_scorecards";
  }
  if (!t.has_draws && t.admissions_count > 1) return "missing_draws";
  return "complete";
}

/* ── Main ───────────────────────────────────────────────────────────────── */
function main() {
  console.log(`[tracking] A ler fontes...`);
  const admMap = readAdmissionsDraws();
  const classifMap = readClassifSources();
  console.log(`[tracking] admissions/draws: ${admMap.size} torneios`);
  console.log(`[tracking] classif/scorecards: ${classifMap.size} torneios`);

  // Union de chaves (alguns torneios podem só estar numa das fontes)
  const allKeys = new Set([...admMap.keys(), ...classifMap.keys()]);
  const tournaments = [];
  for (const key of allKeys) {
    const adm = admMap.get(key) || {};
    const cls = classifMap.get(key) || {};
    // Chave pode não ter admissions (ex: Drive/Aquapor old só com classif)
    const [ccode, tcode] = key.split("/");
    const t = {
      ccode: adm.ccode || ccode,
      tcode: adm.tcode || tcode,
      name: adm.name || cls.name || null,
      date: adm.date || cls.date || null,
      rounds: cls.rounds || 1,
      has_admissions: adm.has_admissions || false,
      admissions_count: adm.admissions_count || 0,
      has_draws: adm.has_draws || false,
      draws_rounds_with_data: adm.draws_rounds_with_data || 0,
      draws_players_total: adm.draws_players_total || 0,
      has_classif: classifMap.has(key),
      player_count: cls.player_count || 0,
      players_with_scorecards: cls.players_with_scorecards || 0,
      scorecards_source: cls._source || null,
    };
    t.scorecards_ratio = t.player_count > 0
      ? +(t.players_with_scorecards / t.player_count).toFixed(3)
      : 0;
    t.status = t.date ? deriveStatus(t) : "unknown";
    tournaments.push(t);
  }

  tournaments.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  // Summary
  const summary = {
    total: tournaments.length,
    complete: 0, in_progress: 0, future: 0,
    missing_admissions: 0, missing_classif: 0, missing_scorecards: 0, missing_draws: 0,
    unknown: 0,
  };
  for (const t of tournaments) summary[t.status] = (summary[t.status] || 0) + 1;

  const output = {
    lastUpdated: new Date().toISOString(),
    generatedBy: "scripts/build-tournaments-tracking.js",
    today: TODAY,
    summary,
    tournaments,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`[tracking] ✓ Gravado ${path.relative(REPO, OUT_FILE)}`);
  console.log(`[tracking] Resumo:`);
  Object.entries(summary).forEach(([k, v]) => { if (v > 0) console.log(`   ${k.padEnd(20)} ${v}`); });
}

try { main(); } catch (e) { console.error("[tracking] ERRO:", e); process.exit(1); }
