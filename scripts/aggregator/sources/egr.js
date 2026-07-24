/**
 * scripts/aggregator/sources/egr.js
 *
 * Adapter European Golf Rankings (europeangolfrankings.com).
 *
 * Lê o índice `egr/egr-events-list.json` (metadata dos eventos scrapados) + cada
 * `egr/events/egr_{id}.json` (leaderboard de totais R1-R4, sem scorecards) +
 * `egr/egr-dob-roster.json` (ano de nascimento de muitos jogadores, via GolfBox).
 *
 * Fonte FRACA: sem licença nem DOB exacta — matching por nome+país; quando o
 * roster traz `birthYear`, passa-se `dobRange` anual (evidência compatível no
 * Pass 2 do identity-matcher), como o gjgl/fcg. Todos os eventos já são <=U18
 * (o scrape-egr filtra maxAge 18).
 */

const fs = require("fs");
const path = require("path");
const { DATA_DIR, readJsonSafe } = require("../util/io");
const { displayName, countryToIso2 } = require("../util/names");

const SOURCE_ID = "egr";
const SOURCE_LABEL = "European Golf Rankings";

const EGR_DIR = path.join(DATA_DIR, "egr");

/**
 * Dedup ano-a-ano: eventos EGR que TAMBÉM scrapamos numa fonte dedicada (GolfBox
 * com scorecards + CR/Slope + ano de nascimento) são saltados SÓ se existir o
 * ficheiro dedicado DESSE ano (`{prefix}_{ano}.json`) — senão mantém-se (não
 * perder anos que só o EGR tem). Ex: EYM 2025 já vem do golfbox → salta;
 * Belgian U14 2025 não tem `avtrophy_2025` (só 2026) → mantém-se. */
const DEDUP_SOURCES = [
  { re: /young masters/i, prefix: "eym" },
  { re: /belgian international.*u\s?14|albert vermeiren/i, prefix: "avtrophy" },
  { re: /european boys.{0,3}team.{0,20}(division\s*2|div\.?\s*2)/i, prefix: "ebtc2" },
  { re: /european girls.{0,3}team/i, prefix: "egtc" },
  { re: /european ladies.{0,3}team/i, prefix: "elg" },
];
function coveredElsewhere(name, year) {
  if (!year) return false;
  for (const d of DEDUP_SOURCES) {
    if (d.re.test(name) && fs.existsSync(path.join(DATA_DIR, `${d.prefix}_${year}.json`))) return true;
  }
  return false;
}

/**
 * O World Junior Golf Championship (Daily Mail WJGC, Villa Padierna) é
 * scrapado com scorecards pela fonte dedicada `wjgc` (ficheiros brjgt e wjgc_).
 * O EGR republica o MESMO evento só com totais → torneio duplicado no kids2
 * (o mesmo miúdo aparecia 2× lado a lado). Saltamos as edições EGR "World
 * Junior Golf Championship" dos anos que o wjgc cobre — mas NUNCA os torneios
 * regulares do tour BJGT (Telford, Belton Woods, Easter Challenge), que o wjgc
 * não scrapa. O `re` exige "world junior golf championship" no nome; os tour
 * events não batem.
 */
const WJGC_WORLD_RE = /world junior golf championship|daily mail\s*wjgc/i;
function wjgcCoveredYears() {
  const years = new Set();
  let files;
  try { files = fs.readdirSync(DATA_DIR); } catch { return years; }
  for (const f of files) {
    if (!/^(?:brjgt\d|wjgc_)/i.test(f) || !f.endsWith(".json")) continue;
    const d = readJsonSafe(path.join(DATA_DIR, f), null);
    const y = d && (d.year || (/\b(20\d{2})\b/.exec(d.tournament || "") || [])[1]);
    if (y) years.add(+y);
  }
  return years;
}

function normKey(name, iso) {
  const n = String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${n}|${iso || ""}`;
}

function seriesFor(tournament) {
  // Nome sem ano → agrupa edições do mesmo evento (Evian Juniors Cup 2025/2026).
  const n = String(tournament || "").replace(/\b20\d{2}\b/g, "").replace(/\s{2,}/g, " ").trim();
  if (!n) return { id: "egr", label: "EGR" };
  const id = "egr-" + n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return { id, label: n };
}

function load() {
  // ── Roster com ano de nascimento (name|iso → birthYear/hcp) ──
  const roster = readJsonSafe(path.join(EGR_DIR, "egr-dob-roster.json"), null);
  const byKey = new Map();   // normKey(name, iso) → { birthYear, hcp }
  const byName = new Map();  // nome normalizado → { birthYear, hcp } (fallback, só se único)
  const nameCollision = new Set();
  for (const v of Object.values(roster?.players || {})) {
    if (!v || !v.name || !v.birthYear) continue;
    const iso = countryToIso2(v.country) || (String(v.country || "").length === 2 ? String(v.country).toUpperCase() : null);
    byKey.set(normKey(v.name, iso), { birthYear: v.birthYear, hcp: typeof v.hcp === "number" ? v.hcp : null });
    const nn = normKey(v.name, "").slice(0, -1);
    if (byName.has(nn)) nameCollision.add(nn); else byName.set(nn, { birthYear: v.birthYear, hcp: typeof v.hcp === "number" ? v.hcp : null });
  }
  const lookupBirth = (name, iso) => {
    const k = normKey(name, iso);
    if (byKey.has(k)) return byKey.get(k);
    const nn = normKey(name, "").slice(0, -1);
    if (!nameCollision.has(nn) && byName.has(nn)) return byName.get(nn);
    return null;
  };

  // ── Índice de eventos scrapados ──
  const list = readJsonSafe(path.join(EGR_DIR, "egr-events-list.json"), null);
  const events = Array.isArray(list?.events) ? list.events : [];
  const wjgcYears = wjgcCoveredYears();

  const players = [];
  const playerMap = new Map(); // sourceKey → RawPlayer
  const tournaments = [];

  let skippedDup = 0;
  for (const meta of events) {
    const ev = readJsonSafe(path.join(EGR_DIR, "events", `egr_${meta.id}.json`), null);
    const plist = Array.isArray(ev?.players) ? ev.players : [];
    if (!plist.length) continue;

    const name = ev.name || meta.name || `EGR ${meta.id}`;
    const year = meta.year || ev.year || null;
    // Dedup: salta se este evento já vem de uma fonte dedicada nesse ano.
    if (coveredElsewhere(name, year)) { skippedDup++; continue; }
    // Dedup WJGC: o World Junior Golf Championship vem (com scorecards) da fonte
    // `wjgc` — saltar a cópia EGR só-totais nos anos cobertos.
    if (WJGC_WORLD_RE.test(name) && year && wjgcYears.has(year)) { skippedDup++; continue; }
    const par = typeof (ev.par ?? meta.par) === "number" ? (ev.par ?? meta.par) : null;
    const sex = ev.sex === "M" || ev.sex === "F" ? ev.sex : (meta.sex === "M" || meta.sex === "F" ? meta.sex : null);
    const ageMax = Number.isFinite(meta.ageNum) ? meta.ageNum : (Number.isFinite(ev.ageNum) ? ev.ageNum : null);
    const series = seriesFor(name);
    const nR = Math.max(0, ...plist.map((p) => [p.r1, p.r2, p.r3, p.r4].filter((x) => x != null).length));

    const results = [];
    for (const pl of plist) {
      const playerName = displayName(pl.name || "");
      if (!playerName) continue;
      const iso = countryToIso2(pl.country) || null;
      const key = `${normKey(playerName, iso)}`;
      const existing = playerMap.get(key);
      if (!existing) {
        const birth = lookupBirth(playerName, iso);
        const by = birth?.birthYear || null;
        playerMap.set(key, {
          sourceKey: key,
          name: playerName,
          country: iso,
          sex,
          club: pl.club || null,
          hcp: birth?.hcp ?? null,
          dobRange: by ? { lo: `${by}-01-01`, hi: `${by}-12-31` } : undefined,
          extra: { countryName: pl.country || null, egrRank: pl.egrRank || null, birthYear: by },
        });
      } else if (!existing.club && pl.club) {
        existing.club = pl.club;
      }
      const rounds = [pl.r1, pl.r2, pl.r3, pl.r4]
        .map((g, i) => ({ round: i + 1, gross: typeof g === "number" ? g : null }))
        .filter((r) => r.gross != null);
      const total = typeof pl.total === "number" ? pl.total : null;
      results.push({
        playerSourceKey: key,
        playerName,
        pos: typeof pl.posNum === "number" ? pl.posNum : null,
        status: rounds.length ? "OK" : "DNS",
        totalGross: total,
        toPar: total != null && par != null && nR > 0 ? total - par * nR : null,
        rounds,
      });
    }
    if (!results.length) continue;

    tournaments.push({
      sourceKey: `egr${meta.id}`,
      name,
      date: meta.startDate || null,
      startDate: meta.startDate || null,
      endDate: meta.endDate || undefined,
      year,
      seriesId: series.id,
      seriesLabel: series.label,
      course: ev.venue || meta.venue || null,
      parTotal: par != null && nR > 0 ? par : null,
      holesPerRound: 18,
      rounds: nR || undefined,
      flights: [{
        flightKey: ageMax ? `u${ageMax}` : "geral",
        label: [ev.ageGroup || meta.ageGroup, sex ? (sex === "F" ? "♀" : "♂") : null].filter(Boolean).join(" · ") || "Geral",
        ageMin: null,
        ageMax,
        sex,
        par: par ? Array.from({ length: 18 }, () => Math.round(par / 18)) : undefined,
        fieldSize: results.length,
        results,
      }],
      links: (ev.sourceUrl || meta.sourceUrl) ? [{ label: "European Golf Rankings", url: ev.sourceUrl || meta.sourceUrl }] : [],
    });
  }

  for (const p of playerMap.values()) players.push(p);

  if (skippedDup) console.log(`  · [egr] ${skippedDup} evento(s) saltado(s) por já virem de fonte dedicada (dedup ano-a-ano)`);
  return { sourceId: SOURCE_ID, sourceLabel: SOURCE_LABEL, players, tournaments };
}

module.exports = { load, SOURCE_ID, SOURCE_LABEL };
