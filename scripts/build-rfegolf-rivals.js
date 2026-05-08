/**
 * scripts/build-rfegolf-rivals.js
 *
 * Consolida todos os torneios livegolfscoring (juvenis) num único ficheiro
 * compacto que o KIDSdataLoader pode processar com 1 fetch.
 *
 * Filtra apenas torneios juvenis (Sub-10 a Sub-18, Alevín/Benjamín/Infantil/
 * Cadete/Junior/Juvenil) com par real e scorecards válidos.
 *
 * Output: public/data/rfegolf-rivals.json
 *
 * Estrutura:
 *   { generatedAt, total, torneios: { tid: { name, year, par[], nholes,
 *       ageGroup, players: [{name, pos, total, toPar, scores[][]}] } } }
 */
const fs = require("fs");
const path = require("path");
const LGS_DIR = path.resolve(__dirname, "../public/data/rfegolf-livegolfscoring");
const OUT = path.resolve(__dirname, "../public/data/rfegolf-rivals.json");

function isJuvenil(name) {
  return /\b(Sub-?\d+|Alev[íi]n|Benjam[íi]n|Infantil|Cadete|Junior|Juvenil)\b/i.test(name || "");
}

function extractAgeGroup(name) {
  const m = name.match(/Sub[\s-]?(\d+)/i);
  if (m) return "Sub-" + m[1];
  if (/Alev[íi]n/i.test(name)) return "Alevín";   // ~10-11
  if (/Benjam[íi]n/i.test(name)) return "Benjamín"; // ~8-9
  if (/Infantil/i.test(name)) return "Infantil"; // ~12-13
  if (/Cadete/i.test(name)) return "Cadete";   // ~14-15
  if (/Junior/i.test(name)) return "Junior";   // ~16-18
  if (/Juvenil/i.test(name)) return "Juvenil"; // amplo
  return null;
}

const out = {
  generatedAt: new Date().toISOString(),
  source: "scripts/build-rfegolf-rivals.js",
  torneios: {},
};

const files = fs.readdirSync(LGS_DIR).filter(f => /^\d+\.json$/.test(f));
let kept = 0, skipped = 0;
for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(LGS_DIR, f), "utf-8"));
    if (!d.ok) { skipped++; continue; }
    const name = d.meta?.name || "";
    if (!isJuvenil(name)) { skipped++; continue; }
    const year = d.meta?.year ?? null;
    const ageGroup = extractAgeGroup(name);
    const par = d.rounds?.[0]?.par;
    if (!Array.isArray(par) || par.length !== 18) { skipped++; continue; }
    const parTotal = par.reduce((a, b) => a + b, 0);

    // Agregar players por nome — guardar scores hbh por ronda
    const agg = {};
    for (const r of d.rounds || []) {
      for (const p of r.players || []) {
        const key = p.memberId || p.name;
        if (!agg[key]) agg[key] = { name: p.name, scoresByRound: [], totalsByRound: [], pos: null, total: null, toPar: null };
        if (Array.isArray(p.scores) && p.scores.length === 18) {
          agg[key].scoresByRound.push(p.scores);
          agg[key].totalsByRound.push(p.total ?? 0);
        }
      }
    }
    const lastR = d.rounds[d.rounds.length - 1];
    if (lastR) {
      for (const p of lastR.players || []) {
        const key = p.memberId || p.name;
        if (agg[key]) {
          agg[key].pos = p.pos;
          agg[key].toPar = p.toPar;
          agg[key].total = agg[key].totalsByRound.reduce((a, b) => a + b, 0);
        }
      }
    }

    const players = Object.values(agg).filter(a => a.totalsByRound.length > 0);
    if (players.length === 0) { skipped++; continue; }

    const tid = `lgs${d.id}`;
    out.torneios[tid] = {
      name, year, ageGroup,
      dateIso: d.meta?.dateIso || null,
      dateRange: d.meta?.dateRange || null,
      par, parTotal,
      nholes: 18,
      nRounds: d.rounds.length,
      players: players.map(a => ({
        n: a.name,
        p: a.pos,
        t: a.total,
        tp: a.toPar,
        rd: a.totalsByRound,
        sc: a.scoresByRound,
      })),
    };
    kept++;
  } catch (e) { skipped++; }
}

out.total = Object.keys(out.torneios).length;
fs.writeFileSync(OUT, JSON.stringify(out));
const size = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
console.log(`Built: ${kept} torneios juvenis, ${skipped} skipped → ${OUT} (${size} MB)`);
