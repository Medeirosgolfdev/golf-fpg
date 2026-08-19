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

// Mapear label → escalão canónico. Labels reais das séries (repare 2026-07-02,
// do <select serieCpt> das páginas resultats): "U12F"/"U12G", "H/U12"/"F/U10"
// (H=Garçons, F=Filles), "BENF"/"BenG" (Benjamins), "MINF"/"MinG" (Minimes),
// "POUF"/"POUG" (Poussins ≈ U10), além das formas longas "BENJAMIN Garçon" etc.
function ageGroupOf(label) {
  const u = (label || "").toUpperCase().trim();
  if (/U\s?10(?!\d)/.test(u) || /POUSSIN/.test(u) || /^POU[FG]?$/.test(u) || /\b10 ANS/.test(u)) return "U10";
  if (/U\s?1[12](?!\d)/.test(u) || /BENJ|BNJ/.test(u) || /^B[FG]$/.test(u) || /\b12 ANS/.test(u)) return "U12";  // Benjamins ≈ U11-U12
  if (/U\s?1[34](?!\d)/.test(u) || /MINIM|MININM/.test(u) || /^M[FG]$/.test(u) || /\b14 ANS/.test(u)) return "U14";  // Minimes ≈ U13-U14
  if (/U\s?1[56](?!\d)/.test(u) || /CADET/.test(u) || /^C[FG]$/.test(u) || /\b16 ANS/.test(u)) return "U16";  // Cadets ≈ U15-U16
  if (/U\s?1[78](?!\d)/.test(u) || /\b18 ANS/.test(u)) return "U18";
  return null;
}

/** Fallback: extrair escalão do nome do torneio quando a label da série é
 *  genérica ("Simple Stroke play", "Messieurs"). Aplica-se a "Internationaux
 *  U14", "2e Division B U16 Garçons", "Championnat WAGR U18", etc. */
function ageGroupFromTournName(name) {
  const u = (name || "").toUpperCase();
  if (/\bU10\b/.test(u)) return "U10";
  if (/\bU12\b/.test(u)) return "U12";
  if (/\bU14\b/.test(u)) return "U14";
  if (/\bU1[56]\b/.test(u)) return "U16";
  if (/\bU1[78]\b/.test(u)) return "U18";
  if (/BENJAMIN/.test(u)) return "U12";
  if (/MINIME/.test(u)) return "U14";
  if (/CADET/.test(u)) return "U16";
  return null;
}

const AGE_BOUNDS = { U10: [8, 10], U12: [11, 12], U14: [13, 14], U16: [15, 16], U18: [17, 18] };
function ageMin(ag) { return AGE_BOUNDS[ag] ? AGE_BOUNDS[ag][0] : null; }
function ageMax(ag) { return AGE_BOUNDS[ag] ? AGE_BOUNDS[ag][1] : null; }

// ⚠ NÃO filtrar pelo escalão da PROVA (2026-08-19). Tudo o que o
// scrape-ffgolf-all-jeunes.js traz já é juvenil (GP Jeunes + Championnats +
// Divisions/Promotions U16 + Internationaux + Evian Juniors Cup), por isso
// qualquer série do corpus pertence aqui.
//
// A versão anterior só deixava passar U10/U12/U14 e ainda cortava provas cujos
// miúdos "já teriam >15 hoje" (MAX_AGE_TODAY). Confundia a idade do JOGADOR com
// o escalão da PROVA: um miúdo pode inscrever-se acima do escalão dele (nunca
// abaixo), e era exactamente esse o caso que se perdia — o Ricardo
// Castro-Ferreira (PT, fed 49085, n. 2015) jogou a "2e Division B U16 Garçons"
// de 2026 com 11 anos e a prova nunca chegava ao kids2. Medido antes do fix:
// 212 provas >=2022 fora do slim, com 12129 participacoes de 2572 juniores que
// JA eram entidades canonicas do agregador.
//
// Séries sem sinal de escalão ficam com ageGroup/ageMin/ageMax null — escalão
// desconhecido, não "excluído".

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
  const fileMatch = t.file.match(/^(\d{1,2})-(\d{1,2})-(\d+)\.json$/);
  const typeCompetition = fileMatch ? fileMatch[1].padStart(2, "0") : (t.typeCompetition || "03");
  const ligue = fileMatch ? fileMatch[2].padStart(2, "0") : (t.ligue || "00");
  const partKey = d.partKey || "";

  const series = d?.details?.series || [];
  // Fallback de escalão pelo nome do torneio (ex.: "Internationaux U14" tem
  // séries com label genérica "Simple Stroke play"). Quando o torneio inteiro
  // já dita o escalão, usamos esse para todas as suas séries.
  const tournNameAg = ageGroupFromTournName(t.name || "");
  for (const s of series) {
    const label = (s.label || "").trim();
    // null = escalao desconhecido - a serie entra na mesma (ver nota acima)
    const ag = ageGroupOf(label) || tournNameAg;

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
