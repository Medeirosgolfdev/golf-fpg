/**
 * scripts/build-licencia-dob-lookup.js
 *
 * Varre todos os JSONs em public/data/rfegolf-resultats/ e cria um lookup
 * { licencia → { name, dob, sex, club, source: compId, lastSeenIso } } em
 * public/data/licencia-dob-lookup.json.
 *
 * RFEGolf é a única fonte que expõe DOB de jogadores espanhois — NextCaddy só
 * tem nome/licencia/hcp. Este lookup permite enriquecer o display NextCaddy
 * com idade calculada à data do torneio.
 *
 * Uso: node scripts/build-licencia-dob-lookup.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../public/data/rfegolf-resultats");
const OUT = path.resolve(__dirname, "../public/data/licencia-dob-lookup.json");

if (!fs.existsSync(ROOT)) {
  console.error("public/data/rfegolf-resultats nao existe. Corre primeiro o scrape RFEGolf.");
  process.exit(1);
}

function parseEsDate(s) {
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const files = fs.readdirSync(ROOT)
  .filter(f => /^\d+\.json$/.test(f))
  .sort();

const lookup = {};
let processed = 0;
let totalEntries = 0;

for (const file of files) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf-8"));
    if (!j || !j.ok || !j.inscritos) continue;
    const compId = j.compId || parseInt(file.replace(".json", ""), 10);
    const compDateIso = parseEsDate(j.meta?.dateStart) || j.scrapedAt || null;
    const allLists = ["admitidos", "reservas", "bajas", "invitados", "noAdmitidos", "provisional"];
    for (const list of allLists) {
      const players = j.inscritos[list] || [];
      for (const p of players) {
        if (!p.licencia || !p.dob) continue;
        const dobIso = parseEsDate(p.dob);
        if (!dobIso) continue;
        const lic = p.licencia.trim();
        const existing = lookup[lic];
        // Prefer entries from MORE RECENT competitions (last seen wins) — but DOB is immutable,
        // so we just keep first valid entry; only overwrite if we don't have a name/club yet.
        if (!existing) {
          lookup[lic] = {
            licencia: lic,
            name: p.name ? p.name.trim() : null,
            dob: p.dob,
            dobIso,
            sex: p.sexo || null,
            club: p.club ? p.club.trim() : null,
            catEdad: p.catEdad || null,
            sources: [compId],
            firstSeenIso: compDateIso,
            lastSeenIso: compDateIso,
          };
          totalEntries++;
        } else {
          // Update last-seen + add to sources, keep best non-empty fields
          if (!existing.sources.includes(compId)) existing.sources.push(compId);
          if (compDateIso && (!existing.lastSeenIso || compDateIso > existing.lastSeenIso)) {
            existing.lastSeenIso = compDateIso;
          }
          if (compDateIso && (!existing.firstSeenIso || compDateIso < existing.firstSeenIso)) {
            existing.firstSeenIso = compDateIso;
          }
          if (!existing.name && p.name) existing.name = p.name.trim();
          if (!existing.club && p.club) existing.club = p.club.trim();
          if (!existing.sex && p.sexo) existing.sex = p.sexo;
        }
      }
    }
    processed++;
  } catch (e) {
    console.warn("skip " + file + ": " + e.message);
  }
}

// ─── Fonte 2: NextCaddy ─────────────────────────────────────────────
// NC expõe licencia + name + club nos blocks de leaderboard e em inscritos,
// mas NÃO expõe DOB. Mesmo assim, vale a pena agregar — adiciona milhares de
// players espanhois que só aparecem em circuitos regionais (RFGA/FGM) e nunca
// num campeonato nacional RFEG. Para esses players o lookup terá `name` e
// `club` mas `dob: null` (a UI fallback ao spain-players match por nome para
// idade quando disponível).
const NC_DIR = path.resolve(__dirname, "../public/data/nextcaddy");
let ncProcessed = 0, ncAdded = 0, ncEnriched = 0;
if (fs.existsSync(NC_DIR)) {
  const ncFiles = fs.readdirSync(NC_DIR).filter(f => /^\d+\.json$/.test(f));
  for (const f of ncFiles) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(NC_DIR, f), "utf-8"));
      const tourId = j.tourId || parseInt(f.replace(".json",""), 10);
      const dateIso = j.meta?.dateIso || null;
      // Recolher de TODOS os players: leaderboard blocks + inscritos
      const seen = new Set();
      // Em alguns ficheiros NC os campos `licencia` e `nivel` aparecem swapped:
      // licencia = "DD-MM-YY HH:MM" (data de inscrição), nivel = "AM62931932"
      // (verdadeira licença RFEG). Detectar e desfazer.
      const isLicFormat = (s) => typeof s === "string" && /^[A-Z]{1,4}[-\dA-Z]{6,}$/.test(s.trim()) && !/^\d{2}-\d{2}-\d{2}/.test(s);
      const isDateFormat = (s) => typeof s === "string" && /^\d{2}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(s);
      function take(p) {
        if (!p || !p.name) return;
        let lic = p.licencia ? p.licencia.trim() : "";
        const niv = p.nivel ? p.nivel.trim() : "";
        // Swap se o "licencia" é uma data e o "nivel" parece uma licença
        if (isDateFormat(lic) && isLicFormat(niv)) lic = niv;
        // Rejeitar se ainda for data ou vazio
        if (!lic || isDateFormat(lic)) return;
        if (seen.has(lic)) return;
        seen.add(lic);
        const club = j.meta?.organizer || null;  // NC players não têm clube directo
        const existing = lookup[lic];
        if (!existing) {
          lookup[lic] = {
            licencia: lic,
            name: p.name.trim(),
            dob: null,
            dobIso: null,
            sex: null,
            club: null,                         // NC não expõe clube por player
            catEdad: p.nivel || p.catEdad || null,
            sources: [`nc${tourId}`],
            firstSeenIso: dateIso,
            lastSeenIso: dateIso,
          };
          ncAdded++;
        } else {
          if (!existing.sources.includes(`nc${tourId}`)) existing.sources.push(`nc${tourId}`);
          if (dateIso && (!existing.lastSeenIso || dateIso > existing.lastSeenIso)) existing.lastSeenIso = dateIso;
          if (dateIso && (!existing.firstSeenIso || dateIso < existing.firstSeenIso)) existing.firstSeenIso = dateIso;
          if (!existing.name && p.name) existing.name = p.name.trim();
          if (!existing.catEdad && (p.nivel || p.catEdad)) existing.catEdad = p.nivel || p.catEdad;
          ncEnriched++;
        }
      }
      for (const block of (j.leaderboard || [])) for (const p of (block.players || [])) take(p);
      for (const p of (j.inscritos || [])) take(p);
      ncProcessed++;
    } catch (e) {
      // ignore
    }
  }
  console.log(`NC: processed=${ncProcessed}, novos=${ncAdded}, enriquecidos=${ncEnriched}`);
}

/* ── Roster RFEG (spain-players.json) ───────────────────────────────────────
 * O lookup acima é construído a partir de quem APARECE em provas scrapadas.
 * Quem tem licença mas nunca apareceu numa dessas listas fica de fora — e
 * depois surge num torneio internacional sem escalão, sem clube e sem idade
 * (caso Ignacio Adaro Vega e Julen Ortiz Rodriguez no Spanish International
 * U-18 2026, ambos com ficha completa no roster). O roster entra aqui como
 * última camada: não sobrepõe nada, só preenche o que falta. */
const ROSTER_ES = path.resolve(__dirname, "../public/data/spain-players.json");
let rosterAdd = 0, rosterEnrich = 0;
if (fs.existsSync(ROSTER_ES)) {
  try {
    const sp = JSON.parse(fs.readFileSync(ROSTER_ES, "utf-8"));
    for (const p of Object.values(sp.byLicencia || {})) {
      const lic = p.licencia;
      if (!lic) continue;
      const prev = lookup[lic];
      if (!prev) {
        lookup[lic] = {
          licencia: lic, name: p.name || null,
          dob: p.dob || null, dobIso: p.dobIso || null,
          sex: p.sex || null, club: p.club || null,
          catEdad: p.catEdad || null, sources: ["roster"],
          firstSeenIso: p.firstSeenIso || null, lastSeenIso: p.lastSeenIso || null,
        };
        rosterAdd++;
      } else {
        let mudou = false;
        if (!prev.dob && p.dob) { prev.dob = p.dob; prev.dobIso = p.dobIso || prev.dobIso; mudou = true; }
        if (!prev.club && p.club) { prev.club = p.club; mudou = true; }
        if (!prev.sex && p.sex) { prev.sex = p.sex; mudou = true; }
        if (!prev.name && p.name) { prev.name = p.name; mudou = true; }
        if (mudou) { rosterEnrich++; if (!prev.sources.includes("roster")) prev.sources.push("roster"); }
      }
    }
    console.log(`Roster RFEG: novos=${rosterAdd}, enriquecidos=${rosterEnrich}`);
  } catch (e) {
    console.warn(`Roster RFEG ignorado (${e.message})`);
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  source: "scripts/build-licencia-dob-lookup.js",
  totalCompsProcessed: processed,
  totalNcProcessed: ncProcessed,
  totalLicencias: Object.keys(lookup).length,
  lookup,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
const sizeMB = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
console.log(`Lookup built: ${Object.keys(lookup).length} licencias from ${processed} comps -> ${OUT} (${sizeMB} MB)`);

// Sample
const sample = Object.values(lookup).slice(0, 3);
for (const e of sample) {
  console.log(`  ${e.licencia}: ${e.name} | DOB ${e.dob} (${e.sex || "?"}) | ${e.club || "-"} | seen in ${e.sources.length} comps`);
}
