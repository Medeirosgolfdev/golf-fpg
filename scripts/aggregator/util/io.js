/**
 * scripts/aggregator/util/io.js
 *
 * Read/write JSON helpers. Input ausente = opcional; input corrupto = erro.
 * Escrita sempre atómica com fsync.
 */

const fs = require("fs");
const path = require("path");
const { writeAtomic } = require("../../../lib/atomic-write");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DATA_DIR = path.join(REPO_ROOT, "public", "data");
const ARCHIVE_DIR = path.join(REPO_ROOT, "public", "data-archive");

/**
 * Input corrupto/truncado. É ERRO (exit 1), nunca reparação silenciosa: antes
 * o agregador cortava NUL bytes e "fechava" o JSON à força, e um input
 * truncado a meio virava um canónico com metade dos jogadores.
 */
class CorruptInputError extends Error {
  constructor(filePath, cause) {
    super(`Input corrupto/ilegível: ${path.relative(REPO_ROOT, filePath)} — ${cause}`);
    this.name = "CorruptInputError";
    this.filePath = filePath;
  }
}

/**
 * Lê um JSON de input. Ficheiro AUSENTE → `defaultValue` (as fontes são
 * opcionais). Ficheiro presente mas ilegível, truncado ou com NUL bytes →
 * lança `CorruptInputError` (o index.js termina com exit 1).
 */
function readJsonSafe(filePath, defaultValue = null) {
  if (!fs.existsSync(filePath)) return defaultValue;
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new CorruptInputError(filePath, `falhou ler: ${err.message}`);
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const nul = raw.indexOf("\0");
  if (nul >= 0) {
    throw new CorruptInputError(filePath, `NUL bytes a partir do byte ${nul} (ficheiro truncado?)`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new CorruptInputError(filePath, `JSON inválido (${err.message})`);
  }
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

/**
 * Escrita atómica com fsync (write → fsync → rename → fsync dir). Os outputs
 * do agregador somam ~185 MB; um writeFileSync interrompido deixava o
 * canónico truncado no git.
 */
function writeJson(filePath, obj, { spaces = 2 } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeAtomic(filePath, JSON.stringify(obj, null, spaces) + "\n", "utf-8");
}

const DATA = {
  fpgPlayers: path.join(DATA_DIR, "players.json"),
  fpgFederados: path.join(DATA_DIR, "federados.json"),
  fpgPullTorneios: (n) => path.join(DATA_DIR, `pull-torneios${String(n).padStart(3, "0")}.json`),
  fpgPullPattern: /^pull-torneios\d{3}\.json$/,
  // jovens_YYYY.json — mesma estrutura "fpg-pull". É a casa canónica dos
  // Campeonatos Nacionais de Jovens (consumidos por /FPG/jovens); o agregador
  // lê-os para não duplicar os Nacionais em pull-torneios (dedup por sourceKey).
  fpgJovensPattern: /^jovens_\d{4}\.json$/,
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
  // BRJGT / Daily Mail WJGC (BlueGolf) — ficheiros canónicos que a /major
  // consome (brjgt243_*, brjgt2431_*, brjgt251_*, brjgt2537_*...). São o
  // superset (14 escalões/ano, todos os anos, com `course`) dos mirrors
  // legados wjgc_2025_*/wjgc_2026_* (5 escalões, sem course) — o adapter wjgc
  // lê estes e IGNORA os mirrors para não duplicar torneios. Os wjgc_* ficam
  // em disco porque a KIDSPage legacy (KIDSdataLoader) ainda os carrega.
  brjgtPattern: /^brjgt\d+_.*\.json$/,
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
  CorruptInputError,
  writeAtomic,
  readJsonRequired,
  writeJson,
  listFiles,
};
