/**
 * scripts/build-licencia-hcp-lookup.js
 *
 * Constrói public/data/licencia-hcp-lookup.json — agrega o HCP exact
 * de cada licença (espanhola) a partir de TODOS os JSONs scrapados:
 *   - public/data/nextcaddy/*.json (leaderboard + inscritos)
 *   - public/data/rfegolf-resultats/*.json (inscritos)
 *
 * Para cada licença mantém o HCP MAIS RECENTE (por dateStart do torneio).
 *
 * Resultado: { licencia: { hcp, source, tourneyId, scrapedAt } }
 *
 * Uso: node scripts/build-licencia-hcp-lookup.js
 */

const fs = require("fs");
const path = require("path");

const NC_ROOT = path.resolve(__dirname, "../public/data/nextcaddy");
const RFEG_ROOT = path.resolve(__dirname, "../public/data/rfegolf-resultats");
const OUT = path.resolve(__dirname, "../public/data/licencia-hcp-lookup.json");

const lookup = {};

function maybeUpdate(licencia, hcp, dateIso, source, tid) {
  if (!licencia || hcp == null) return;
  const lic = String(licencia).trim().toUpperCase();
  if (!lic) return;
  const cur = lookup[lic];
  // Se ainda não temos OU este é mais recente
  if (!cur || (dateIso && cur.dateIso && dateIso > cur.dateIso) || (!cur.dateIso && dateIso)) {
    lookup[lic] = { hcp: Number(hcp), source, tourneyId: tid, dateIso: dateIso || null };
  }
}

// ── 1) NextCaddy ─────────────────────────────────────────────
let ncCount = 0;
if (fs.existsSync(NC_ROOT)) {
  const files = fs.readdirSync(NC_ROOT).filter(f => /^\d+\.json$/.test(f));
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(NC_ROOT, f), "utf-8"));
      const tid = j.tourId;
      const dateIso = j.meta?.dateIso || null;
      // leaderboard players
      for (const cat of (j.leaderboard || [])) {
        for (const p of (cat.players || [])) {
          maybeUpdate(p.licencia, p.hcp, dateIso, "nextcaddy-lb", tid);
        }
      }
      // inscritos
      for (const ins of (j.inscritos || [])) {
        maybeUpdate(ins.licencia, ins.hcp, dateIso, "nextcaddy-insc", tid);
      }
      ncCount++;
    } catch (e) {
      console.warn("skip nc", f, e.message);
    }
  }
}

// ── 2) RFEGolf ───────────────────────────────────────────────
let rfegCount = 0;
if (fs.existsSync(RFEG_ROOT)) {
  const files = fs.readdirSync(RFEG_ROOT).filter(f => /^\d+\.json$/.test(f));
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(RFEG_ROOT, f), "utf-8"));
      const tid = j.compId || parseInt(f.replace(".json",""), 10);
      const dateIso = j.meta?.dateStart && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(j.meta.dateStart)
        ? j.meta.dateStart.split("/").reverse().join("-").replace(/^\d{4}-\d{1,2}-\d{1,2}$/, m => {
            const [y, mo, d] = m.split("-");
            return `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
          })
        : null;
      // inscritos têm hcp
      for (const list of ["admitidos","reservas","bajas","invitados","noAdmitidos","provisional"]) {
        for (const p of (j.inscritos?.[list] || [])) {
          maybeUpdate(p.licencia, p.hcp, dateIso, "rfegolf", tid);
        }
      }
      rfegCount++;
    } catch (e) {
      console.warn("skip rfeg", f, e.message);
    }
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  source: "scripts/build-licencia-hcp-lookup.js",
  total: Object.keys(lookup).length,
  ncTournaments: ncCount,
  rfegTournaments: rfegCount,
  lookup,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
console.log(`Built licencia-hcp-lookup: ${out.total} licenças (NC ${ncCount} + RFEGolf ${rfegCount} torneios)`);
console.log(`  -> ${OUT}`);
