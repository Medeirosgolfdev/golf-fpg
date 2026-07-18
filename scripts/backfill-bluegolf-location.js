#!/usr/bin/env node
/**
 * backfill-bluegolf-location.js — re-resolve país/hometown dos ficheiros BlueGolf
 * (FCG/JWGC) já scrapados, sem voltar à fonte.
 *
 * O campo de localidade da FCG/JWGC é preenchido pelo inscrito e vem sujo:
 * cidades estrangeiras com sigla de estado dos EUA ("Bangkok, CA") ganhavam
 * bandeira americana, e cidades sem país ("Auckland", "宇都宮") ficavam sem
 * bandeira. O `splitGradYearCountry` foi corrigido — este script aplica a
 * correcção aos ficheiros existentes.
 *
 * ⚠ BlueGolf está descontinuado (ver CLAUDE.md) — NÃO re-scrapar. A string
 * original do perfil é reconstruída do que ficou guardado (`hometown` quando
 * existe, senão `country`), que é exactamente a parte da localidade.
 *
 *   node scripts/backfill-bluegolf-location.js            # aplica
 *   node scripts/backfill-bluegolf-location.js --dry-run  # só relatório
 */
const fs = require("fs");
const path = require("path");
const { splitGradYearCountry, COUNTRY_SEGMENTS, CITY_COUNTRY } = require("./lib/bluegolf-location");
const { writeJsonAtomic } = require("./lib/atomic-write");

// Países já resolvidos. Re-derivar a partir de um destes seria destrutivo: o
// `hometown` guardado já vem sem a sigla ("Tamuning" em vez de "Tamuning, GU"),
// portanto a segunda passagem perderia o país. EUA/Canadá ficam de fora da
// guarda de propósito — aí o hometown mantém "Cidade, ST" e é justamente o
// caso a re-avaliar (o "Bangkok, CA" da inscrição).
const RESOLVED = new Set([...COUNTRY_SEGMENTS.values(), ...[...CITY_COUNTRY.values()].map((v) => v.country)]);
RESOLVED.delete("United States");
RESOLVED.delete("Canada");

const DATA_DIR = path.join(__dirname, "..", "public", "data");
const FILE_RX = /^(fcg|jwgc)\d+_.*\.json$/;
const dryRun = process.argv.includes("--dry-run");

let files = 0, changed = 0, players = 0;
const moves = new Map(); // "de → para" -> nº

for (const file of fs.readdirSync(DATA_DIR).filter((f) => FILE_RX.test(f))) {
  const full = path.join(DATA_DIR, file);
  let d;
  try { d = JSON.parse(fs.readFileSync(full, "utf8")); } catch { continue; }
  if (!Array.isArray(d.players)) continue;
  files++;
  let dirty = false;

  for (const p of d.players) {
    const before = p.country || "";
    if (RESOLVED.has(before)) continue;
    // A localidade guardada: `hometown` é a string completa quando existe;
    // senão o `country` ainda é a localidade crua (cidade sem país).
    const place = p.hometown || before;
    if (!place) continue;
    const loc = splitGradYearCountry(place);
    if (!loc.country) continue;
    const newHometown = loc.hometown && loc.hometown !== loc.country ? loc.hometown : "";
    if (loc.country === before && (p.hometown || "") === newHometown) continue;

    players++;
    dirty = true;
    const key = `${before || "—"} → ${loc.country}${newHometown ? ` (${newHometown})` : ""}`;
    moves.set(key, (moves.get(key) || 0) + 1);
    p.country = loc.country;
    if (newHometown) p.hometown = newHometown; else delete p.hometown;
  }

  if (dirty) {
    changed++;
    if (!dryRun) writeJsonAtomic(full, d);
  }
}

const top = [...moves].sort((a, b) => b[1] - a[1]);
console.log(top.map(([k, v]) => `  ${String(v).padStart(4)}×  ${k}`).join("\n"));
console.log(`\n${dryRun ? "[dry-run] " : ""}${players} jogadores corrigidos em ${changed}/${files} ficheiros (${top.length} correcções distintas)`);
