/**
 * scripts/build-gjgl-course-overrides.js — Distâncias reais dos eventos GJGL em Portugal
 *
 * O GJGL não publica distâncias (só par + scores — ver CLAUDE.md). Mas os eventos
 * jogados em Portugal contam para o WHS dos federados FPG, e as voltas deles em
 * `output/{fed}/analysis/data.json` têm o eventName do torneio + campo + tee +
 * metros/SI por buraco (HOLES[scoreId].m / .si). Este script cruza os dois:
 * para cada evento GJGL PT (tabela EVENTS abaixo), procura voltas WHS cujo
 * eventName bate no regex, resolve o sexo do jogador (players.json/federados.json)
 * e agrupa por sexo → tee modal → meters[18]/si[18] de consenso.
 *
 * Eventos sem federado FPG tracked no field podem herdar os tees de outra edição
 * do mesmo evento/campo (inferRe + inferNote) — marcados "evidence": "inferido".
 *
 * Output: public/data/gjgl-course-overrides.json — consumido pela GlobalJuniorPage
 * (campo real + linha de metros/SI por sexo na grelha do leaderboard). Correr
 * depois de novos eventos PT ganharem dados (ou quando o update-data refresca
 * os analysis dos federados).
 *
 *   node scripts/build-gjgl-course-overrides.js
 */
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const ROOT = path.join(__dirname, "..");
const OUT_PATH = path.join(ROOT, "public", "data", "gjgl-course-overrides.json");

// slug GJGL → regex do eventName nas voltas WHS. Regex SEMPRE preso ao ano da
// edição (a mesma série muda de campo entre anos — ex: Spring Junior Games).
const EVENTS = [
  { slug: "atlantic-youth-trophy-2026-portugal", re: /GJG - Atlantic Youth Trophy 2026/i,
    note: "WHS diz Montado (o site GJGL diz Penha Longa — campo desactualizado)" },
  { slug: "portuguese-intercollegiate-open-2026-portugal", re: /INTERCOLLEGIATE OPEN 2026/i,
    inferRe: /PORTUGUESE INTERCOLLEGIATE OPEN 2025/i,
    inferNote: "tees da edição 2025 (Penha Longa Atlantic — Brancas em todas as edições 2019-2025)" },
  { slug: "gjg-edge-mason-championship-2026-portugal", re: /GJG Edge Mason Championship/i },
  { slug: "gjg-edge-pearce-championship-2026-portugal", re: /GJG Edge Pearce Championship/i },
  { slug: "gjg-edge-reed-sanderlin-championship-2026-portugal", re: /GJG Edge Reed Sanderlin/i },
  { slug: "gjg-spring-junior-games-2026-portugal", re: /GJG Spring Junior Games 2026/i },
  { slug: "gjg-blue-carpet-junior-classics-2026-portugal", re: /GJG Blue Carpet Junior Classics 2026/i },
  { slug: "gjg-algarve-juniors-international-2025-portugal", re: /GJG Algarve Juniors? International 2025/i },
  { slug: "gjg-portuguese-juniors-international-2026-portugal", re: /GJG Portuguese Juniors International.*2026/i,
    inferRe: /GJG Portuguese Juniors International.*2025/i,
    inferNote: "tees da edição 2025 (Praia d'El Rey)" },
  { slug: "gjg-junior-trophy-2025-portugal", re: /GJG Junior Trophy 2025/i,
    inferRe: /GJG Junior Trophy 2024/i,
    inferNote: "tees da edição 2024 (Praia d'El Rey — mesmo par 73)" },
];

function loadSexLookup() {
  const bySex = new Map(); // fed → "M"|"F"
  const norm = (s) => (s == null ? null : String(s).toUpperCase().startsWith("F") ? "F" : "M");
  try {
    const players = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "players.json"), "utf8"));
    for (const p of Array.isArray(players) ? players : Object.values(players)) {
      if (p && p.nfed != null && p.sex != null) bySex.set(String(p.nfed), norm(p.sex));
    }
  } catch {}
  try {
    const feds = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "federados.json"), "utf8"));
    for (const p of feds.players || []) {
      if (p.federation_code != null && p.gender != null && !bySex.has(String(p.federation_code))) {
        bySex.set(String(p.federation_code), norm(p.gender));
      }
    }
  } catch {}
  try {
    const inat = JSON.parse(fs.readFileSync(path.join(ROOT, "data-archive", "federados-inativos.json"), "utf8"));
    for (const p of inat.players || []) {
      if (p.federation_code != null && p.gender != null && !bySex.has(String(p.federation_code))) {
        bySex.set(String(p.federation_code), norm(p.gender));
      }
    }
  } catch {}
  return bySex;
}

function collectRounds() {
  // Todas as voltas WHS que batem em algum EVENTS.re/inferRe, com meters/si.
  const outDir = path.join(ROOT, "output");
  const feds = fs.readdirSync(outDir).filter((x) => /^\d+$/.test(x));
  const rows = [];
  for (const fed of feds) {
    const p = path.join(outDir, fed, "analysis", "data.json");
    if (!fs.existsSync(p)) continue;
    let d;
    try { d = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
    for (const c of d.DATA || []) {
      for (const r of c.rounds || []) {
        const ev = r.eventName || "";
        if (!/gjg|intercollegiate|atlantic youth/i.test(ev)) continue;
        const holes = d.HOLES?.[r.scoreId];
        const m = holes?.m, si = holes?.si;
        if (!Array.isArray(m) || m.length < 18 || m.every((x) => !x)) continue;
        rows.push({ fed, eventName: ev, course: r.course, tee: r.tee || "", m: m.slice(0, 18), si: Array.isArray(si) ? si.slice(0, 18) : null });
      }
    }
  }
  return rows;
}

function consensus(group) {
  // grupo de voltas do mesmo sexo → tee modal → meters/si mais frequentes
  const byTee = new Map();
  for (const r of group) byTee.set(r.tee, (byTee.get(r.tee) || 0) + 1);
  const tee = [...byTee.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const teeRounds = group.filter((r) => r.tee === tee);
  const byTotal = new Map();
  for (const r of teeRounds) {
    const tot = r.m.reduce((a, b) => a + (b || 0), 0);
    if (!byTotal.has(tot)) byTotal.set(tot, { n: 0, r });
    byTotal.get(tot).n++;
  }
  const best = [...byTotal.values()].sort((a, b) => b.n - a.n)[0].r;
  const metersTotal = best.m.reduce((a, b) => a + (b || 0), 0);
  return { tee, meters: best.m, si: best.si, metersTotal, course: best.course, rounds: teeRounds.length };
}

function main() {
  const sexOf = loadSexLookup();
  const rows = collectRounds();
  console.log(`voltas WHS candidatas (GJG/Intercollegiate/Atlantic): ${rows.length}`);

  const overrides = {};
  for (const ev of EVENTS) {
    let matched = rows.filter((r) => ev.re.test(r.eventName));
    let evidence = "whs";
    let note = ev.note || null;
    if (!matched.length && ev.inferRe) {
      matched = rows.filter((r) => ev.inferRe.test(r.eventName));
      evidence = "inferido";
      note = ev.inferNote;
    }
    if (!matched.length) {
      console.log(`✗ ${ev.slug} — sem voltas WHS correspondentes`);
      continue;
    }
    const bySex = { M: [], F: [] };
    let unknownSex = 0;
    for (const r of matched) {
      const s = sexOf.get(String(r.fed));
      if (!s) { unknownSex++; continue; } // sem sexo confirmado não dá para atribuir tee
      bySex[s].push(r);
    }
    if (unknownSex) console.log(`  (${ev.slug}: ${unknownSex} volta(s) ignoradas — sexo desconhecido)`);
    if (!bySex.M.length && !bySex.F.length) { console.log(`✗ ${ev.slug} — só voltas de sexo desconhecido`); continue; }
    const tees = {};
    for (const s of ["M", "F"]) if (bySex[s].length) tees[s] = consensus(bySex[s]);
    const course = (tees.M || tees.F).course;
    overrides[ev.slug] = {
      course,
      evidence,
      ...(note ? { note } : {}),
      roundsMatched: matched.length,
      tees: Object.fromEntries(Object.entries(tees).map(([s, t]) => [s, {
        tee: t.tee, metersTotal: t.metersTotal, meters: t.meters, ...(t.si ? { si: t.si } : {}),
      }])),
    };
    const teeDesc = Object.entries(tees).map(([s, t]) => `${s}:${t.tee} ${t.metersTotal}m (${t.rounds}v)`).join(" · ");
    console.log(`✓ ${ev.slug} — ${course} [${evidence}] ${teeDesc}`);
  }

  const out = { _gerado_em: new Date().toISOString(), _fonte: "voltas WHS dos federados FPG (output/{fed}/analysis/data.json) — ver cabeçalho do script", overrides };
  writeJsonAtomic(OUT_PATH, out);
  console.log(`\n→ ${OUT_PATH} (${Object.keys(overrides).length} eventos)`);
}

main();
