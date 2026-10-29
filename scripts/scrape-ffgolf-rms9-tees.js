/**
 * scripts/scrape-ffgolf-rms9-tees.js
 *
 * Para cada torneio FFG ligado ao RMS9 (ffgolf-rms9.json, ver
 * scrape-ffgolf-rms9.js), lê os tees do torneio (`course-assignments`: CR,
 * Slope, par, metros e SI oficiais) e liga cada tee à série FFG que o jogou.
 *
 * Ligação tee ↔ série por (escalão, sexo): «U12G», «BENJ F», «H/U14», «MinG»,
 * «Repères Benjamins Garçons»… → U12/U14/U16… + M/F. Uma série sem escalão
 * («Messieurs», «Dames») fica com o único tee desse sexo, se só houver um —
 * nesse caso a nota diz que o RMS9 não liga o tee à série.
 *
 * Incremental (só os trnId que faltam; --all refaz tudo).
 * Output: public/data/ffgolf-rms9-tees.json
 *   { generatedAt, tournaments: { trnId: { tenant, id, series: { CHAVE: {...FFGSerieCourse} } } } }
 *   CHAVE = serieCourseKey(label) (src/data/ffg/toTournament.ts).
 */
const fs = require("fs");
const path = require("path");

const DATA = path.resolve(__dirname, "../public/data");
const LINKS = path.join(DATA, "ffgolf-rms9.json");
const INDEX = path.join(DATA, "ffgolf-resultats-index.json");
const OUT = path.join(DATA, "ffgolf-rms9-tees.json");
const ALL = process.argv.includes("--all");

const H = (t) => ({ "x-tenant-id": "fr_" + t, "x-access-token": "", "Accept-Language": "fr_FR" });
async function get(tenant, p) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`https://${tenant}.rms9.fr/a9online/v1/rs/cs/${p}`, { headers: H(tenant) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) {
      if (i === 2) { console.warn(`  ${tenant} ${p}: ${e.message}`); return null; }
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    }
  }
}

/** Igual ao serieCourseKey do site. */
const serieCourseKey = (label) => {
  const k = String(label || "").toUpperCase().replace(/\s+/g, "");
  return ({ BG: "U14G", BF: "U14F", MG: "U16G", MF: "U16F" })[k] || k;
};

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
/** (escalão, sexo) de uma etiqueta de série ou nome de tee; null se não der. */
function ageSex(s) {
  const t = norm(s).replace(/REPERES?/g, " ").replace(/\s+/g, " ").trim();
  let age = null, sex = null;
  const m = t.match(/U\s*(8|9|10|12|14|16|18)(?![0-9])\s*([GFHM])?(?![A-Z])/);
  if (m) { age = "U" + m[1]; if (m[2]) sex = m[2] === "F" ? "F" : "M"; }
  else if (/\bBEN/.test(t) || /^B[GF]$/.test(t)) age = "U14";
  else if (/\bMIN/.test(t) || /^M[GF]$/.test(t)) age = "U16";
  else if (/\bCAD/.test(t)) age = "U18";
  else if (/POUSSIN/.test(t)) age = "U12";
  if (!sex) {
    if (/MIXTE/.test(t)) sex = "X";
    else if (/FILLE|DAME|BENJAMINES|POUSSINES|\bF\b|^F\/|^[BM]F$|(BENJ?|MIN|CAD)F$/.test(t)) sex = "F";
    else if (/GARCON|MESSIEUR|HOMME|\bG\b|\bH\b|^H\/|^[BM]G$|(BENJ?|MIN|CAD)G$/.test(t)) sex = "M";
  }
  return { age, sex };
}
const fmt = (d) => String(d || "").slice(0, 10).split("-").reverse().join("/");

(async () => {
  const links = JSON.parse(fs.readFileSync(LINKS, "utf8")).tournaments || {};
  const ix = JSON.parse(fs.readFileSync(INDEX, "utf8")).tournaments || [];
  const byTrn = Object.fromEntries(ix.map((t) => [t.trnId, t]));
  const prev = !ALL && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")).tournaments || {} : {};
  const out = { ...prev };
  let n = 0, nSeries = 0, semSerie = 0;
  for (const [trnId, l] of Object.entries(links)) {
    if (!l.id || out[trnId] || !byTrn[trnId]) continue;
    const ca = await get(l.tenant, `tournaments/${l.id}/course-assignments`);
    const tees = ((ca && ca.tournAssignments && ca.tournAssignments.courseAssignments) || []).map((x) => ({
      tee: x.courseTeeName, sex: x.sex === "Female" ? "F" : "M", cr: x.cr, slope: x.slope, par: x.par, length: x.length,
      validFrom: x.courseValidFrom, course: x.courseName, holes: x.holes || [],
      classes: (x.ageClasses || []).map((g) => ageSex((g.shortName || "") + " " + (g.name || ""))),
      own: ageSex(x.courseTeeName),
    }));
    const series = {};
    for (const d of byTrn[trnId].divisions || []) {
      const want = ageSex(d.label);
      if (want.sex === "X" || !want.sex) continue;
      const sameSex = tees.filter((t) => t.sex === want.sex);
      let t = null, ligado = true;
      if (want.age) {
        t = sameSex.find((x) => x.classes.some((c) => c.age === want.age && (!c.sex || c.sex === want.sex)))
          || sameSex.find((x) => x.own.age === want.age);
      } else if (sameSex.length === 1) { t = sameSex[0]; ligado = sameSex[0].classes.length > 0; }
      if (!t || t.holes.length !== 18 || t.cr == null || t.slope == null) continue;
      if (!ligado || !t.classes.length) semSerie++;
      series[serieCourseKey(d.label)] = {
        tee: t.tee, teeSex: t.sex,
        par: t.holes.map((h) => h.par), si: t.holes.map((h) => h.si), meters: t.holes.map((h) => h.length),
        metersTotal: t.length, courseRating: t.cr, slope: t.slope, ratingRms9: { cr: t.cr, slope: t.slope },
        ratingNota: `CR/Slope, metros e SI do organizador (RMS9, ${t.course}, tee válido desde ${fmt(t.validFrom)}).`
          + (t.classes.length ? "" : " O RMS9 não liga este tee à série: é o único tee deste sexo no torneio.")
          + " Assume PCC 0.",
      };
      nSeries++;
    }
    out[trnId] = { tenant: l.tenant, id: l.id, series };
    n++;
    if (n % 20 === 0) console.log(`  ${n} torneios…`);
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), tournaments: sorted }) + "\n");
  console.log(`RMS9 tees: ${n} torneios lidos, ${nSeries} séries com tee (${semSerie} sem ligação explícita no RMS9)`);
})();
