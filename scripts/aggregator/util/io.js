/**
 * scripts/aggregator/util/io.js
 *
 * Read/write JSON helpers tolerantes a falha.
 */

const fs = require("fs");
const path = require("path");
const { warn, fail } = require("./log");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DATA_DIR = path.join(REPO_ROOT, "public", "data");
const ARCHIVE_DIR = path.join(REPO_ROOT, "public", "data-archive");

function readJsonSafe(filePath, defaultValue = null) {
  if (!fs.existsSync(filePath)) return defaultValue;
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    warn(`Falhou ler ${path.relative(REPO_ROOT, filePath)}: ${err.message}`);
    return defaultValue;
  }
  try { return JSON.parse(raw); } catch (err1) {
    const firstNul = raw.indexOf("\0");
    if (firstNul > 0) {
      try {
        const fixed = raw.slice(0, firstNul);
        const out = JSON.parse(fixed);
        warn(`${path.relative(REPO_ROOT, filePath)}: recuperado cortando NUL bytes (${raw.length - firstNul} bytes truncados)`);
        return out;
      } catch (err2) { /* continuar */ }
    }
    const recovered = tryReverseClose(raw);
    if (recovered) {
      warn(`${path.relative(REPO_ROOT, filePath)}: recuperado por reverse-close (${recovered.lostBytes} bytes truncados)`);
      return recovered.value;
    }
    warn(`Falhou parse de ${path.relative(REPO_ROOT, filePath)}: ${err1.message}`);
    return defaultValue;
  }
}

function tryReverseClose(raw) {
  const maxScan = 4000;
  const start = Math.max(0, raw.length - maxScan);
  for (let i = raw.length - 1; i >= start; i--) {
    const c = raw[i];
    if (c !== "," && c !== "}" && c !== "]") continue;
    const base = raw.slice(0, c === "," ? i : i + 1);
    for (let nB = 0; nB <= 4; nB++) {
      for (let nS = 0; nS <= 2; nS++) {
        const candidate = base + "}".repeat(nB) + "]".repeat(nS);
        try {
          const v = JSON.parse(candidate);
          return { value: v, lostBytes: raw.length - candidate.length };
        } catch { /* try next */ }
      }
    }
  }
  return null;
}

function readJsonRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Ficheiro obrigatório não existe: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listFiles(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  const rx = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  return fs.readdirSync(dir)
    .filter((f) => rx.test(f))
    .map((f) => path.join(dir, f))
    .sort();
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

const DATA = {
  fpgPlayers: path.join(DATA_DIR, "players.json"),
  fpgFederados: path.join(DATA_DIR, "federados.json"),
  fpgPullTorneios: (n) => path.join(DATA_DIR, `pull-torneios${String(n).padStart(3, "0")}.json`),
  fpgPullPattern: /^pull-torneios\d{3}\.json$/,
  fpgDrivePattern: /^drive-data-\d{4}-\d{2}\.json$/,
  fpgAquaporPattern: /^aquapor-data-\d{4}-\d{2}\.json$/,
  uskidsMemberHistorySlim: path.join(DATA_DIR, "uskids-member-history-slim.json"),
  uskidsResults: path.join(DATA_DIR, "uskids-results.json"),
  uskidsField: path.join(DATA_DIR, "uskids-field.json"),
  uskidsFieldSizes: path.join(DATA_DIR, "uskids-field-sizes.json"),
  uskidsCompletosPattern: /^uskids_torneios_completos\(\d+\)\.json$/,
  uskidsTournNames: path.join(DATA_DIR, "t_de_tournaments_do_uskids.json"),
  rfegSpainPlayers: path.join(DATA_DIR, "spain-players.json"),
  rfegolfRivals: path.join(DATA_DIR, "rfegolf-rivals.json"),
  fcgRivals: path.join(DATA_DIR, "fcg-rivals.json"),
  englandCatalog: path.join(DATA_DIR, "england-golf-catalog.json"),
  englandPattern: /^england_.*\.json$/,
  gjglDir: path.join(DATA_DIR, "gjgl"),
  gjglPattern: /^gjgl_.*\.json$/,
  ffgFrancePlayers: path.join(DATA_DIR, "france-players.json"),
  ffgJuniorsSlim: path.join(DATA_DIR, "ffgolf-juniors-slim.json"),
  ffgResultatsIndex: path.join(DATA_DIR, "ffgolf-resultats-index.json"),
  eowagrPattern: /^eowagr\d+.*\.json$/,
  wjgcPattern: /^wjgc_\d+.*\.json$/,
  bjgtPattern: /^bjgt_.*\.json$/,
  // FCG Callaway World Championship + Uswing Mojing Junior World (BlueGolf,
  // formato bluegolf — ingeridos pelo adapter wjgc como o BJGT). ⚠ fcgWorld
  // (fcg{N}_*) ≠ fonte `fcg` catalã, que lê fcg-rivals.json.
  fcgWorldPattern: /^fcg\d+_.*\.json$/,
  jwgcPattern: /^jwgc\d+_.*\.json$/,
  doralPattern: /^ftm_doral_\d+\.json$/,
  outJuniors: path.join(DATA_DIR, "juniors.json"),
  outTournaments: path.join(DATA_DIR, "juniors-tournaments.json"),
  outCatalog: path.join(DATA_DIR, "tournament-catalog.json"),
  outStats: path.join(DATA_DIR, "juniors-stats.json"),
  overrides: path.join(DATA_DIR, "juniors-overrides.json"),
};

module.exports = {
  REPO_ROOT,
  DATA_DIR,
  ARCHIVE_DIR,
  DATA,
  readJsonSafe,
  readJsonRequired,
  writeJson,
  listFiles,
};
