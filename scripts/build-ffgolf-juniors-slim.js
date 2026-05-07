#!/usr/bin/env node
/**
 * build-ffgolf-juniors-slim.js
 *
 * Lê ffgolf-resultats-index.json e os ficheiros individuais em
 * ffgolf-resultats/, filtra séries U10/U12/U14 (Manuel-adjacent) desde 2022,
 * e produz um único ficheiro consolidado público/data/ffgolf-juniors-slim.json.
 *
 * Output ~150-300 KB consolidando ~600 séries × ~30 jogadores cada.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "public", "data");
const INDEX = path.join(ROOT, "ffgolf-resultats-index.json");
const RESULTATS = path.join(ROOT, "ffgolf-resultats");
const OUT = path.join(ROOT, "ffgolf-juniors-slim.json");

// Padrões de series labels que indicam juniores Manuel-adjacent
const JUNIOR_LABEL_RE = /^(U(?:1[0124]|10|12|14)[FGM]?|BENJAMIN[ES]+|B[FG]|MINIME[FGS]*|M[FG]|JEUNES)$/i;

// Mapear label → escalão canónico
function ageGroupOf(label) {
  const u = (label || "").toUpperCase();
  if (/U10/.test(u)) return "U10";
  if (/U12/.test(u)) return "U12";
  if (/U14/.test(u)) return "U14";
  if (/BENJAMIN/.test(u) || u === "BG" || u === "BF") return "U12";  // Benjamins ≈ U11-U12
  if (/MINIME/.test(u) || u === "MG" || u === "MF") return "U14";    // Minimes ≈ U13-U14
  return null;
}

/** Fallback: extrair escalão do nome do torneio quando a label da série
 *  é genérica (ex.: "Simple Stroke play"). Aplica-se a torneios como
 *  "Internationaux U14", "Championnat de France U12", "GP Jeunes U10/U12", etc. */
function ageGroupFromTournName(name) {
  const u = (name || "").toUpperCase();
  if (/\bU10\b/.test(u)) return "U10";
  if (/\bU12\b/.test(u)) return "U12";
  if (/\bU14\b/.test(u)) return "U14";
  if (/BENJAMIN/.test(u)) return "U12";
  if (/MINIME/.test(u)) return "U14";
  return null;
}

function ageMin(ag) { return ag === "U10" ? 8 : ag === "U12" ? 11 : 13; }
function ageMax(ag) { return ag === "U10" ? 10 : ag === "U12" ? 12 : 14; }

// Filtro de relevância etária: só mantemos torneios cujos kids tenham hoje
// no máximo MAX_AGE_TODAY anos (Manuel tem 12 — kids >15 hoje já não competem
// com ele, podem voltar quando ele for mais velho).
const TODAY_YEAR = new Date().getFullYear();
const MAX_AGE_TODAY = 15;
function minTournYearForAge(ag) {
  // (today - tournYear) + ageMax(ag) <= MAX_AGE_TODAY
  // → tournYear >= today - MAX_AGE_TODAY + ageMax(ag)
  return TODAY_YEAR - MAX_AGE_TODAY + ageMax(ag);
}

function dateIso(dDate) {
  // "DD/MM/YYYY" → "YYYY-MM-DD"
  const m = (dDate || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function decodeName(s) {
  return (s || "").replace(/&#039;/g, "'").replace(/&amp;/g, "&");
}

const index = JSON.parse(fs.readFileSync(INDEX, "utf-8"));
const tournaments = index.tournaments || [];
console.log(`[ffgolf-slim] ${tournaments.length} tournaments in index`);

const out = { generated_at: new Date().toISOString(), tournaments: [] };
let processed = 0, errors = 0, kept = 0;

for (const t of tournaments) {
  if ((t.year || 0) < 2022) continue;
  const filePath = path.join(RESULTATS, t.file);
  if (!fs.existsSync(filePath)) continue;

  let d;
  try {
    d = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    errors++;
    continue;
  }
  processed++;

  // Extrair typeCompetition + ligue do nome do ficheiro: "TT-LL-trnId.json"
  const fileMatch = t.file.match(/^(\d{2})-(\d{2})-(\d+)\.json$/);
  const typeCompetition = fileMatch ? fileMatch[1] : (t.typeCompetition || "03");
  const ligue = fileMatch ? fileMatch[2] : (t.ligue || "00");
  const partKey = d.partKey || "";

  const series = d?.details?.series || [];
  // Fallback de escalão pelo nome do torneio (ex.: "Internationaux U14" tem
  // séries com label genérica "Simple Stroke play"). Quando o torneio inteiro
  // já dita o escalão, usamos esse para todas as suas séries.
  const tournNameAg = ageGroupFromTournName(t.name || "");
  for (const s of series) {
    const label = (s.label || "").trim();
    const ag = ageGroupOf(label) || tournNameAg;
    if (!ag) continue;
    // Filtrar séries cujos kids já passaram a idade Manuel-relevante
    if ((t.year || 0) < minTournYearForAge(ag)) continue;

    const players = [];
    for (const p of (s.players || [])) {
      // Format canónico: "Firstname Lastname" (Title Case).
      // FFGolf armazena `nameNom` (LASTNAME) e `namePrenom` (Firstname) separados.
      // O campo `name` por si só vem como "Lastname Firstname" — invertido.
      let firstname = decodeName(p.namePrenom || "").trim();
      let lastname = decodeName(p.nameNom || "").trim();
      if (!firstname || !lastname) {
        // Fallback: tentar dividir o "name" e assumir [lastname, firstname]
        const parts = decodeName(p.name || "").trim().split(/\s+/);
        if (parts.length >= 2) {
          if (!lastname) lastname = parts[0];
          if (!firstname) firstname = parts.slice(1).join(" ");
        }
      }
      // Title-case do lastname (vem em CAPS): "LEPETIT" → "Lepetit"
      if (lastname && /^[A-ZÀ-ÖØ-Þ-]+$/.test(lastname.replace(/[\s'-]/g, ""))) {
        lastname = lastname.toLowerCase().replace(/(^|[\s'-])(\w)/g, (_, sep, ch) => sep + ch.toUpperCase());
      }
      const name = `${firstname} ${lastname}`.trim();
      if (!name) continue;
      // Skip placeholders
      if (/^[?-]+$/.test(name)) continue;

      // Construir rondas (R1..R4)
      const rounds = [];
      for (let i = 1; i <= 4; i++) {
        const t_i = p[`t${i}`];
        const status_i = p[`status${i}`] || p[`statusR${i}`] || "";
        const scores_i = p[`scoresR${i}`] || [];
        if (typeof t_i === "number" && t_i > 0) {
          rounds.push({
            r: i,
            gross: t_i,
            scores: Array.isArray(scores_i) ? scores_i : [],
          });
        } else if (status_i && status_i !== "00") {
          // WD/DSQ/etc. — guardar para info mas sem gross
        }
      }
      if (!rounds.length && !p.total) continue;

      players.push({
        name,
        flag: p.flag || p.nationality || "FRA",
        license: p.license || "",
        hcp: p.hcp ?? null,
        club: p.club || "",
        pos: p.pos ?? p.classement ?? null,
        total: typeof p.total === "number" ? p.total : null,
        rounds,
      });
    }
    if (!players.length) continue;

    out.tournaments.push({
      trnId: t.trnId,
      file: t.file,
      name: decodeName(t.name),
      dateIso: t.dateIso || dateIso(t.date),
      year: t.year,
      ageGroup: ag,
      ageMin: ageMin(ag),
      ageMax: ageMax(ag),
      serieLabel: label,
      courseTerrain: s.courseTerrain || "",
      parTotal: s.parTotal || null,
      parPerHole: s.parPerHole || null,
      // Identificadores para construir URLs de volta ao FFGolf
      partKey,
      typeCompetition,
      ligue,
      players,
    });
    kept++;
  }
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
const sizeKb = Math.round(fs.statSync(OUT).size / 1024);
console.log(`[ffgolf-slim] processed=${processed} errors=${errors} series-kept=${kept}`);
console.log(`[ffgolf-slim] tournaments saved: ${out.tournaments.length}`);
console.log(`[ffgolf-slim] wrote ${OUT} (${sizeKb} KB)`);
