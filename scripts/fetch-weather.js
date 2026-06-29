#!/usr/bin/env node
/**
 * scripts/fetch-weather.js
 *
 * Meteorologia histórica por dia de torneio (Open-Meteo Historical Weather API,
 * gratuita, sem chave, dados desde 1940). Alimenta a strip de meteo no cabeçalho
 * de cada torneio (componente src/ui/TournamentWeather.tsx).
 *
 * Saída: public/data/weather.json
 *   {
 *     "_generated": ISO, "_source": "open-meteo",
 *     "places": { "<courseKey>": { lat, lon, label, precision: "course"|"city"|"country" } },
 *     "days":   { "<lat>,<lon>|<YYYY-MM-DD>": { code, tmax, tmin, prcp, wind, wdir } }
 *   }
 *
 * Coordenadas: scripts/weather-course-coords.json (curado + cache de geocoding).
 *   - Override manual tem prioridade. Campos novos são geocodificados pela
 *     Open-Meteo Geocoding API e gravados aqui para revisão/reutilização.
 *   - Fallback à cidade/país quando o nome do campo não geocodifica (precision
 *     "city"/"country").
 *
 * USO:
 *   node scripts/fetch-weather.js --course "Glen Golf Club" --start 2025-05-27 --rounds 3
 *   node scripts/fetch-weather.js --from-slim --limit 40        # majors USKids
 *   node scripts/fetch-weather.js --from-fpg --since 2025-01-01 # torneios FPG/Drive/Aquapor
 *   node scripts/fetch-weather.js --from-slim --match "European Championship"
 *   node scripts/fetch-weather.js --manifest scripts/weather-manifest.json
 *   node scripts/fetch-weather.js --force                        # re-busca dias já em cache
 *
 * Exit codes: 0 = gravou novidades, 2 = nada novo, 1 = erro.
 */

const fs = require("fs");
const path = require("path");
let writeJsonAtomic;
try { ({ writeJsonAtomic } = require("./lib/atomic-write")); }
catch { writeJsonAtomic = (p, d) => { const t = p + ".tmp"; fs.writeFileSync(t, JSON.stringify(d, null, 2)); fs.renameSync(t, p); }; }

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public", "data", "weather.json");
const COORDS = path.join(__dirname, "weather-course-coords.json");
const SLIM = path.join(ROOT, "public", "data", "uskids-member-history-slim.json");

const GEO_API = "https://geocoding-api.open-meteo.com/v1/search";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const ARCHIVE_API = "https://archive-api.open-meteo.com/v1/archive";
// O arquivo ERA5 da Open-Meteo tem ~5 dias de atraso; datas mais recentes
// (ou futuras) devolvem HTTP 400. Saltamos tudo depois deste limite.
const ARCHIVE_LAG_DAYS = 6;

/* ── args ── */
function parseArgs(argv) {
  const a = { concurrency: 4 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === "--course") a.course = next();
    else if (k === "--lat") a.lat = parseFloat(next());
    else if (k === "--lon") a.lon = parseFloat(next());
    else if (k === "--start") a.start = next();
    else if (k === "--end") a.end = next();
    else if (k === "--rounds") a.rounds = parseInt(next(), 10);
    else if (k === "--manifest") a.manifest = next();
    else if (k === "--from-slim") a.fromSlim = true;
    else if (k === "--from-fpg") a.fromFpg = true;
    else if (k === "--since") a.since = next();
    else if (k === "--match") a.match = next();
    else if (k === "--limit") a.limit = parseInt(next(), 10);
    else if (k === "--concurrency") a.concurrency = parseInt(next(), 10);
    else if (k === "--out") a.out = next();
    else if (k === "--force") a.force = true;
    else if (k === "--regeocode") a.regeocode = true;
    else if (k === "--help" || k === "-h") a.help = true;
  }
  return a;
}

/* ── util ── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normCourseKey(s) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** "YYYY-MM-DD", "DD/MM/YYYY" ou "M/D/YYYY" (americano, do slim) → "YYYY-MM-DD". */
function toISO(s) {
  if (!s) return null;
  let m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, "0")}-${String(+m[3]).padStart(2, "0")}`;
  // DD/MM/YYYY vs M/D/YYYY é ambíguo; o slim usa M/D/YYYY (americano).
  m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${String(+m[1]).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`;
  return null;
}
function addDaysISO(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function datesFor(start, end, rounds, explicit) {
  if (Array.isArray(explicit) && explicit.length) return explicit.map(toISO).filter(Boolean);
  const s = toISO(start);
  if (!s) return [];
  let n = rounds && rounds > 0 ? rounds : 0;
  if (!n && end) {
    const e = toISO(end);
    if (e) n = Math.round((new Date(e) - new Date(s)) / 86400000) + 1;
  }
  if (!n) n = 1;
  n = Math.max(1, Math.min(n, 8));
  return Array.from({ length: n }, (_, i) => addDaysISO(s, i));
}

async function fetchJson(url, { retries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "golf-fpg-weather/1.0" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      await sleep(400 * (i + 1));
    }
  }
  throw lastErr;
}

/* ── geocoding (com cache no ficheiro de coords) ── */
function loadCoords() {
  try { return JSON.parse(fs.readFileSync(COORDS, "utf8")); }
  catch { return {}; }
}
function simplifyCourse(name) {
  return (name || "")
    .replace(/\b(golf|club|course|links|country|cc|g&cc|gcc|resort|the|de|do|da|nacional)\b/gi, " ")
    .replace(/[-–—].*$/, " ")   // largar sufixos tipo "- Bay Course", "(Raven)"
    .replace(/\(.*?\)/g, " ")
    .replace(/\s+/g, " ").trim();
}
// Nominatim (OpenStreetMap) conhece campos de golfe como POIs — muito melhor
// que a geocoding da Open-Meteo para nomes de campos. Política de uso: ≤1 req/s
// + User-Agent identificável.
let _lastGeoTs = 0;
async function geoThrottle() {
  const wait = 1100 - (Date.now() - _lastGeoTs);
  if (wait > 0) await sleep(wait);
  _lastGeoTs = Date.now();
}
async function geocodeNominatim(q) {
  if (!q) return null;
  await geoThrottle();
  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=jsonv2&limit=1&addressdetails=1`;
  const j = await fetchJson(url).catch(() => null);
  const hit = Array.isArray(j) && j[0];
  if (!hit) return null;
  const isCourse = (hit.category === "leisure" && hit.type === "golf_course") ||
    /\bgolf\b|\bclub\b|\bcourse\b|\blinks\b/i.test(hit.display_name || "");
  const label = (hit.display_name || q).split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3).join(", ");
  return { lat: +(+hit.lat).toFixed(4), lon: +(+hit.lon).toFixed(4), label, precision: isCourse ? "course" : "city" };
}
async function geocodeOpenMeteo(q, precision) {
  if (!q) return null;
  const url = `${GEO_API}?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
  const j = await fetchJson(url).catch(() => null);
  const hit = j && j.results && j.results[0];
  if (!hit) return null;
  const label = [hit.name, hit.admin1, hit.country_code].filter(Boolean).join(", ");
  return { lat: +hit.latitude.toFixed(4), lon: +hit.longitude.toFixed(4), label, precision };
}
async function geocode(name) {
  // 1) Nominatim com o nome completo do campo (resolve o POI de golfe)
  let r = await geocodeNominatim(name);
  if (r) return r;
  // 2) Open-Meteo com o nome completo
  r = await geocodeOpenMeteo(name, "city");
  if (r) return r;
  // 3) nome simplificado (cidade) — Nominatim depois Open-Meteo
  const simp = simplifyCourse(name);
  if (simp && simp.toLowerCase() !== (name || "").toLowerCase()) {
    r = await geocodeNominatim(simp);
    if (r) { r.precision = "city"; return r; }
    r = await geocodeOpenMeteo(simp, "city");
    if (r) return r;
  }
  return null;
}

/* ── weather archive ── */
async function fetchArchive(lat, lon, first, last) {
  const url = `${ARCHIVE_API}?latitude=${lat}&longitude=${lon}&start_date=${first}&end_date=${last}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,winddirection_10m_dominant&timezone=auto`;
  const j = await fetchJson(url);
  const d = j && j.daily;
  if (!d || !Array.isArray(d.time)) return {};
  const out = {};
  for (let i = 0; i < d.time.length; i++) {
    out[d.time[i]] = {
      code: d.weathercode?.[i] ?? null,
      tmax: d.temperature_2m_max?.[i] ?? null,
      tmin: d.temperature_2m_min?.[i] ?? null,
      prcp: d.precipitation_sum?.[i] ?? 0,
      wind: d.windspeed_10m_max?.[i] ?? null,
      wdir: d.winddirection_10m_dominant?.[i] ?? null,
    };
  }
  return out;
}

/* ── extrair tarefas do slim USKids ── */
// Apertado para os internacionais de prestígio + majors USKids que o projecto
// segue (evita apanhar dezenas de eventos locais US). Usa --match para outros.
const DEFAULT_MAJOR_RE = /(European Championship|World Championship|Venice Open|Rome Classic|Marco Simone|Red,? White ?&? ?Blue|Sandestin Championship|Desert Shootout|Mississippi State Inv)/i;
function tasksFromSlim(matchRe, limit) {
  const d = JSON.parse(fs.readFileSync(SLIM, "utf8"));
  const re = matchRe ? new RegExp(matchRe, "i") : DEFAULT_MAJOR_RE;
  const target = new Set();
  const meta = {};
  for (const [tc, m] of Object.entries(d.torneios || {})) {
    if (!m || !m.name || !re.test(m.name)) continue;
    const esc = m.byEscalao && m.byEscalao[Object.keys(m.byEscalao)[0]];
    const course = (esc && esc.course) || m.course;
    if (!course || !m.startDate) continue;
    target.add(tc);
    meta[tc] = { name: m.name, course, start: m.startDate, rounds: 0 };
  }
  // nº de rondas: max ronda observada entre os jogadores desse tcode
  for (const p of Object.values(d.jogadores || {})) {
    for (const [tc, t] of Object.entries(p.torneios || {})) {
      if (!target.has(tc) || !t.rounds) continue;
      const mx = Math.max(0, ...Object.keys(t.rounds).map((n) => parseInt(n, 10) || 0));
      if (mx > meta[tc].rounds) meta[tc].rounds = mx;
    }
  }
  let list = Object.values(meta).map((x) => ({ ...x, rounds: x.rounds || 3 }));
  list.sort((a, b) => (toISO(b.start) || "").localeCompare(toISO(a.start) || ""));
  if (limit && limit > 0) list = list.slice(0, limit);
  return list;
}

/* ── extrair tarefas dos torneios FPG / Drive / Aquapor ── */
function tasksFromFpg({ since, limit } = {}) {
  const dir = path.join(ROOT, "public", "data");
  let files;
  try { files = fs.readdirSync(dir); } catch { return []; }
  files = files.filter((f) =>
    /^pull-torneios.*\.json$/.test(f) || /^drive-data.*\.json$/.test(f) || /^aquapor-data.*\.json$/.test(f),
  );
  const seen = new Set();
  const out = [];
  for (const f of files) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    const ts = Array.isArray(d) ? d : (d.tournaments || []);
    for (const t of ts) {
      const course = t.campo || t.course;
      const iso = toISO(t.date);
      if (!course || !iso) continue;
      if (since && iso < since) continue;
      let rounds = t.rounds;
      if (!rounds && Array.isArray(t.players)) {
        rounds = Math.max(1, ...t.players.map((p) => (p.roundScores ? p.roundScores.length : 1)));
      }
      const key = `${normCourseKey(course)}|${iso}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: t.name || course, course, start: iso, rounds: rounds || 1 });
    }
  }
  out.sort((a, b) => b.start.localeCompare(a.start));
  return limit && limit > 0 ? out.slice(0, limit) : out;
}

/* ── main ── */
async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) {
    console.log("Ver cabeçalho do ficheiro para uso. Flags: --course/--start/--rounds, --from-slim, --manifest, --force.");
    process.exit(0);
  }
  const outPath = a.out ? path.resolve(a.out) : OUT;

  // Construir lista de tarefas
  let tasks = [];
  if (a.course) {
    tasks.push({ name: a.course, course: a.course, start: a.start, end: a.end, rounds: a.rounds, lat: a.lat, lon: a.lon });
  }
  if (a.manifest) {
    const arr = JSON.parse(fs.readFileSync(path.resolve(a.manifest), "utf8"));
    for (const t of arr) tasks.push(t);
  }
  if (a.fromSlim) {
    tasks = tasks.concat(tasksFromSlim(a.match, a.limit));
  }
  if (a.fromFpg) {
    tasks = tasks.concat(tasksFromFpg({ since: a.since, limit: a.limit }));
  }
  if (!tasks.length) {
    console.error("Sem tarefas. Usa --course, --manifest ou --from-slim. (--help)");
    process.exit(1);
  }

  // Estado existente
  let out = { _generated: "", _source: "open-meteo", places: {}, days: {} };
  try { out = { ...out, ...JSON.parse(fs.readFileSync(outPath, "utf8")) }; out.places ||= {}; out.days ||= {}; }
  catch { /* novo */ }
  const coords = loadCoords();
  let coordsDirty = false;

  // Datas futuras / muito recentes não existem no arquivo ERA5 → saltar.
  const todayISO = new Date().toISOString().slice(0, 10);
  const cutoff = addDaysISO(todayISO, -ARCHIVE_LAG_DAYS);

  // --regeocode: re-resolve entradas auto/imprecisas (corrige city-level já em
  // cache). Overrides manuais de precisão "course" são preservados.
  const reusable = (p) => p && !(a.regeocode && p.precision !== "course");

  let newDays = 0, resolvedPlaces = 0, unresolved = [], skippedFuture = 0;

  // Resolver coords + buscar meteo (sequencial para sermos educados com a API)
  for (const t of tasks) {
    const courseName = t.course || t.name;
    if (!courseName) continue;
    const key = normCourseKey(courseName);

    // Com --regeocode, descarta o place imprecioso já gravado para forçar refresh.
    if (a.regeocode && out.places[key] && out.places[key].precision !== "course") {
      delete out.places[key];
    }

    // 1) coords
    let place = out.places[key];
    if (!place) {
      if (t.lat != null && t.lon != null) {
        place = { lat: +(+t.lat).toFixed(4), lon: +(+t.lon).toFixed(4), label: t.label || courseName, precision: "course" };
      } else if (reusable(coords[key])) {
        place = coords[key];
      } else {
        process.stderr.write(`geocode: ${courseName} … `);
        const g = await geocode(courseName);
        if (g) {
          place = { ...g, _auto: true };
          coords[key] = place; coordsDirty = true;
          writeJsonAtomic(COORDS, coords); // grava já — não perder geocoding se interromper
          console.error(`${place.lat},${place.lon} (${place.precision}) ${place.label || ""}`);
        } else {
          console.error("SEM RESULTADO");
          unresolved.push(courseName);
          continue;
        }
      }
      out.places[key] = place; resolvedPlaces++;
    }

    // 2) datas (filtra futuras/recentes)
    const dates = datesFor(t.start, t.end, t.rounds, t.dates);
    if (!dates.length) { console.error(`  sem datas: ${courseName} (${t.start})`); continue; }
    const pastDates = dates.filter((dt) => dt <= cutoff);
    if (!pastDates.length) { skippedFuture++; console.error(`  futuro/recente, salta: ${courseName} (${dates[0]})`); continue; }
    const need = a.force ? pastDates : pastDates.filter((dt) => !out.days[`${place.lat},${place.lon}|${dt}`]);
    if (!need.length) continue;

    // 3) archive (um pedido por intervalo)
    const first = need[0], last = need[need.length - 1];
    try {
      const byDate = await fetchArchive(place.lat, place.lon, first, last);
      for (const dt of pastDates) {
        const w = byDate[dt];
        if (w) { out.days[`${place.lat},${place.lon}|${dt}`] = w; newDays++; }
      }
      console.error(`  ${courseName}: ${need.length} dia(s) [${first}…${last}]`);
    } catch (e) {
      console.error(`  ARCHIVE FALHOU ${courseName}: ${e.message}`);
    }
    await sleep(200);
  }

  if (coordsDirty) writeJsonAtomic(COORDS, coords);

  console.error(`\nResumo: +${newDays} dias, ${resolvedPlaces} campos resolvidos, ${unresolved.length} por resolver, ${skippedFuture} futuros/recentes saltados.`);
  if (unresolved.length) console.error("Por resolver (adiciona à mão em scripts/weather-course-coords.json):\n  - " + unresolved.join("\n  - "));

  if (newDays === 0 && !coordsDirty) {
    console.error("Nada novo.");
    process.exit(2);
  }
  out._generated = new Date().toISOString();
  writeJsonAtomic(outPath, out);
  console.error(`Gravado: ${path.relative(ROOT, outPath)} (${Object.keys(out.days).length} dias, ${Object.keys(out.places).length} campos)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
