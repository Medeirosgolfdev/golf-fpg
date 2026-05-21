#!/usr/bin/env node
/**
 * apply-course-enrichment.js
 *
 * Aplica enriquecimento (país + link/website) aos campos internacionais do
 * away-courses.json, a partir de um mapa curado em
 * `public/data/course-enrichment.json`.
 *
 * Formato do course-enrichment.json:
 *   { "<courseKey>": { "country": "Espanha", "website": "https://..." }, ... }
 *
 * Efeito por campo:
 *   - `master.country`  ← country (resolve a bandeira na CamposPage)
 *   - `master.links.extra` ← acrescenta { label: "Website", url: website }
 *     (sem duplicar se já existir um link com o mesmo url)
 *
 * Idempotente e reprodutível: correr sempre que o mapa de enriquecimento ou
 * o away-courses.json mudarem.
 *
 *   node scripts/apply-course-enrichment.js
 */
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "public", "data");
const awayPath = path.join(DATA, "away-courses.json");
const enrichPath = path.join(DATA, "course-enrichment.json");

function main() {
  const away = JSON.parse(fs.readFileSync(awayPath, "utf8"));
  const enrich = JSON.parse(fs.readFileSync(enrichPath, "utf8"));

  let countryN = 0;
  let linkN = 0;
  for (const c of away.courses ?? []) {
    const e = enrich[c.courseKey];
    if (!e) continue;
    const m = c.master;
    // country do enrichment é autoritativo (verificado por busca) — sobrescreve
    if (e.country && m.country !== e.country) {
      m.country = e.country;
      countryN++;
    }
    if (e.website) {
      if (!m.links) m.links = { fpg: null, scorecards: null };
      const extra = (m.links.extra = m.links.extra ?? []);
      const exists = extra.some((l) => l.url === e.website);
      if (!exists) {
        extra.push({ label: "Website", url: e.website });
        linkN++;
      }
    }
  }

  fs.writeFileSync(awayPath, JSON.stringify(away, null, 0) + "\n");
  console.log(`Países aplicados: ${countryN} | Websites aplicados: ${linkN}`);
  console.log(`Campos away: ${away.courses.length}`);
}

main();
