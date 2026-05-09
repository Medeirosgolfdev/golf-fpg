/**
 * scripts/build-rfegolf-index.js
 *
 * Cria public/data/rfegolf-resultats-index.json agregando JSONs de DUAS fontes:
 *   1. public/data/rfegolf-resultats/  (rfegolf.es — Campeonatos Nacionais)
 *   2. public/data/nextcaddy/          (nextcaddy.com — RFGA Andaluzia + FGM Madrid)
 *
 * Cada entrada tem `source: "rfegolf" | "nextcaddy"` e `filePath` aponta para
 * o JSON detalhado correcto. RFEGPage usa filePath para fetch on-demand.
 *
 * Uso: node scripts/build-rfegolf-index.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../public/data/rfegolf-resultats");
const NC_ROOT = path.resolve(__dirname, "../public/data/nextcaddy");
const OUT = path.resolve(__dirname, "../public/data/rfegolf-resultats-index.json");

if (!fs.existsSync(ROOT) && !fs.existsSync(NC_ROOT)) {
  console.error("Nem public/data/rfegolf-resultats nem public/data/nextcaddy existem.");
  process.exit(1);
}

function parseEsDate(s) {
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const MONTHS_ES = { ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
                    jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12" };
function parseEsDateLong(s) {
  if (!s) return null;
  const m = /(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s+(\d{4})/i.exec(s);
  if (!m) return null;
  return `${m[3]}-${MONTHS_ES[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
}

function extractYearFromName(name) {
  const ms = (name || "").match(/\b(20\d{2})\b/g);
  if (!ms) return null;
  return parseInt(ms[ms.length - 1], 10);
}

function extractCategoryFromName(name) {
  if (!name) return null;
  const m = name.match(/\bSub[\s-]?(\d+)\b/i);
  if (m) return "Sub-" + m[1];
  if (/\bAlev[ií]n\b/i.test(name)) return "Alevín";
  if (/\bBenjam[ií]n\b/i.test(name)) return "Benjamín";
  if (/\bInfantil\b/i.test(name)) return "Infantil";
  if (/\bCadete\b/i.test(name)) return "Cadete";
  if (/\bJunior\b/i.test(name)) return "Junior";
  if (/\bJuvenil\b/i.test(name)) return "Juvenil";
  return null;
}

function extractSexFromName(name) {
  if (!name) return null;
  if (/\bMasculino\s+y\s+Femenino\b/i.test(name) || /\bMixto\b/i.test(name)) return "Mixto";
  if (/\bMasculino\b/i.test(name)) return "M";
  if (/\bFemenino\b/i.test(name)) return "F";
  return null;
}

const tournaments = [];
let skipped = 0;

// ── 1) RFEGolf ────────────────────────────────────────────────
const rfegFiles = fs.existsSync(ROOT)
  ? fs.readdirSync(ROOT).filter(f => /^\d+\.json$/.test(f)).sort()
  : [];

for (const file of rfegFiles) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf-8"));
    if (!j || !j.ok || !j.meta) { skipped++; continue; }
    const compId = j.compId || parseInt(file.replace(".json", ""), 10);
    const meta = j.meta;
    const counts = (j.inscritos && j.inscritos.counts) || {};
    const name = meta.name || "";

    let year = null;
    const ds = parseEsDate(meta.dateStart) || parseEsDate(meta.dateEnd);
    if (ds) year = parseInt(ds.slice(0, 4), 10);
    if (!year) year = extractYearFromName(name);

    const category = extractCategoryFromName(name) || (meta.category || "").split(",")[0].trim() || null;
    const sex = extractSexFromName(name) || (
      meta.sex === "Masculino" ? "M" :
      meta.sex === "Femenino" ? "F" :
      meta.sex === "Mixto" ? "Mixto" : null
    );

    tournaments.push({
      source: "rfegolf",
      id: compId,
      compId,
      file,
      filePath: `rfegolf-resultats/${file}`,
      name, year, category, sex,
      dateStart: meta.dateStart || null,
      dateEnd: meta.dateEnd || null,
      dateStartIso: parseEsDate(meta.dateStart),
      dateEndIso: parseEsDate(meta.dateEnd),
      course: meta.course || null,
      courseClubId: meta.courseClubId || null,
      mode: meta.mode || null,
      style: meta.style || null,
      hcpLimitMen: meta.hcpLimitMen != null ? meta.hcpLimitMen : null,
      hcpLimitWomen: meta.hcpLimitWomen != null ? meta.hcpLimitWomen : null,
      counts: {
        admitidos: counts.admitidos || 0,
        reservas: counts.reservas || 0,
        bajas: counts.bajas || 0,
        invitados: counts.invitados || 0,
        noAdmitidos: counts.noAdmitidos || 0,
        provisional: counts.provisional || 0,
      },
      leaderboardPlayers: 0,
      scrapedAt: j.scrapedAt || null,
    });
  } catch (e) {
    console.warn("skip rfegolf " + file + ": " + e.message);
    skipped++;
  }
}

// ── 2) NextCaddy ──────────────────────────────────────────────
const ncFiles = fs.existsSync(NC_ROOT)
  ? fs.readdirSync(NC_ROOT).filter(f => /^\d+\.json$/.test(f)).sort()
  : [];

for (const file of ncFiles) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(NC_ROOT, file), "utf-8"));
    if (!j || !j.tourId) { skipped++; continue; }
    const tourId = j.tourId;
    const meta = j.meta || {};
    const name = meta.name || "";
    const inscCount = (j.inscritos || []).length;
    const lbCount = (j.leaderboard || []).reduce((acc, t) => acc + (t.players ? t.players.length : 0), 0);

    // Tentativa 1: dateIso já injectado pelo enrich (a partir do discover scope)
    // Tentativa 2: parsear "07 mar 2026" do pageHeaderText, dateStart, etc.
    const pageText = (meta.pageHeaderText || "") + " " + (j.url || "") + " " + name + " " + (meta.format || "") + " " + (meta.dateStart || "");
    const dateIso = (meta.dateIso || null) || parseEsDateLong(pageText) || null;
    // Tentativa 2: extractYearFromName procura "20XX" em qualquer string
    let year = dateIso ? parseInt(dateIso.slice(0, 4), 10) : null;
    if (!year) year = extractYearFromName(name);
    if (!year) year = extractYearFromName(meta.pageHeaderText || "");
    // Tentativa 3: data scrapedAt como fallback (assume torneio é do ano em que foi scraped)
    if (!year && j.scrapedAt) {
      const sm = /(\d{4})/.exec(j.scrapedAt);
      if (sm) year = parseInt(sm[1], 10);
    }

    // Prioridade: nome do torneio (quando explicita escalão) → categories[].
    // Se o NOME não menciona escalão juvenil, NÃO marcar como juvenil só porque
    // a lista de categories tem "Infantil" — muitos torneios adultos têm
    // categorias subordinadas para 1-2 inscritos juvenis.
    let category = extractCategoryFromName(name);
    if (!category && Array.isArray(meta.categories) && meta.categories.length) {
      const juvCat = meta.categories.find(c => /Alev[ií]n|Benjam[ií]n|Infantil|Cadete|Junior|Juvenil|Sub/i.test(c));
      // Só usar o cats fallback se há indicação clara de torneio juvenil
      // (não todos os categories).
      if (juvCat && !meta.categories.some(c => /Caballeros|Se[ñn]oras|Senior|Profesional|Adult/i.test(c))) {
        category = extractCategoryFromName(juvCat);
      } else if (juvCat && meta.categories.length <= 3) {
        // Torneios pequenos com 2-3 categorias juvenis — provavelmente são juvenis
        category = extractCategoryFromName(juvCat);
      }
    }

    let sex = extractSexFromName(name);
    if (!sex && Array.isArray(meta.categories)) {
      const hasM = meta.categories.some(c => /Masculino/i.test(c));
      const hasF = meta.categories.some(c => /Femenino/i.test(c));
      sex = hasM && hasF ? "Mixto" : (hasM ? "M" : (hasF ? "F" : null));
    }

    tournaments.push({
      source: "nextcaddy",
      id: tourId, tourId, file,
      filePath: `nextcaddy/${file}`,
      name, year, category, sex,
      dateStart: dateIso, dateEnd: dateIso,
      dateStartIso: dateIso, dateEndIso: dateIso,
      course: meta.course || null,
      courseCode: meta.courseCode || null,
      organizer: meta.organizer || null,
      format: meta.format || null,
      categories: meta.categories || [],
      counts: {
        admitidos: inscCount,
        reservas: 0, bajas: 0, invitados: 0, noAdmitidos: 0, provisional: 0,
      },
      leaderboardPlayers: lbCount,
      scrapedAt: j.scrapedAt || null,
    });
  } catch (e) {
    console.warn("skip nextcaddy " + file + ": " + e.message);
    skipped++;
  }
}


// ── 3) Livegolfscoring (HTML hbh — fonte rica de scorecards) ─────────
const LGS_ROOT = path.resolve(__dirname, "../public/data/rfegolf-livegolfscoring");
const lgsFiles = fs.existsSync(LGS_ROOT)
  ? fs.readdirSync(LGS_ROOT).filter(f => /^\d+\.json$/.test(f)).sort()
  : [];

for (const file of lgsFiles) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(LGS_ROOT, file), "utf-8"));
    if (!j || !j.ok || !j.meta) { skipped++; continue; }
    const id = j.id || parseInt(file.replace(".json", ""), 10);
    const name = j.meta.name || "";
    // Prioridade: meta.year (vindo do enrich-lgs-dates) → year no nome → scrapedAt
    let year = j.meta.year || extractYearFromName(name);
    if (!year && j.scrapedAt) year = parseInt(j.scrapedAt.slice(0, 4), 10);
    const dateIso = j.meta.dateIso || null;
    const category = extractCategoryFromName(name);
    const sex = extractSexFromName(name);
    const totalPlayers = (j.rounds && j.rounds[0]?.players?.length) || 0;
    tournaments.push({
      source: "livegolfscoring",
      id, file,
      filePath: `rfegolf-livegolfscoring/${file}`,
      name, year, category, sex,
      dateStart: j.meta.dateRange || dateIso || null,
      dateEnd: j.meta.dateRange || dateIso || null,
      dateStartIso: dateIso, dateEndIso: dateIso,
      course: j.meta.course || null,
      counts: { admitidos: totalPlayers, reservas: 0, bajas: 0, invitados: 0, noAdmitidos: 0, provisional: 0 },
      leaderboardPlayers: totalPlayers,
      nRounds: (j.rounds || []).length,
      scrapedAt: j.scrapedAt || null,
    });
  } catch (e) { console.warn("skip lgs " + file + ": " + e.message); skipped++; }
}

tournaments.sort((a, b) => {
  const da = a.dateStartIso || "0";
  const db = b.dateStartIso || "0";
  if (db !== da) return db.localeCompare(da);
  return (b.id || 0) - (a.id || 0);
});

const byYear = {};
const byCategory = {};
const bySource = {};
for (const t of tournaments) {
  if (t.year) byYear[t.year] = (byYear[t.year] || 0) + 1;
  if (t.category) byCategory[t.category] = (byCategory[t.category] || 0) + 1;
  bySource[t.source] = (bySource[t.source] || 0) + 1;
}

const out = {
  generatedAt: new Date().toISOString(),
  source: "scripts/build-rfegolf-index.js",
  total: tournaments.length,
  totalCompetitions: tournaments.length,
  skipped,
  byYear,
  byCategory,
  bySource,
  tournaments,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
console.log(`Index built: ${tournaments.length} torneios (rfegolf=${bySource.rfegolf || 0}, nextcaddy=${bySource.nextcaddy || 0}), skipped=${skipped}`);
console.log(`  -> ${OUT}`);
console.log(`  byYear: ${JSON.stringify(byYear)}`);
