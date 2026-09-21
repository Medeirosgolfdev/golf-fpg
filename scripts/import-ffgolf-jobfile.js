/**
 * scripts/import-ffgolf-jobfile.js
 *
 * Importa UM torneio do portal de resultados da FFG (pages.ffgolf.org/resultats)
 * para o formato JobFile da /major ({slug}_{ano}.json, como os GolfGenius).
 *
 * Porquê: a Evian Juniors Cup só passou para o GolfGenius em 2025; 2022-2024
 * correram no live scoring RMS da FFG (rms-*.ffgolf.org, inacessível daqui) mas
 * os resultados finais ficaram no portal central, com cartões buraco a buraco,
 * HCP, sexo e nacionalidade (`joueursSerie`, lido pelo scrape-ffgolf-resultats).
 *
 * O que faz além de converter:
 *   - uma divisão por série ("1ère Série Messieurs" → Boys, "Dames" → Girls —
 *     os MESMOS labels do leaderboard GolfGenius, para a tab "Edições
 *     anteriores" casar os anos);
 *   - o `classement` da FFG é da classificação CONJUNTA → posições renumeradas
 *     dentro de cada escalão (empate = mesmo total → "T");
 *   - volta com estado ≠ "00" (10 = não jogou/abandonou, 30 = sem cartão) não
 *     entra; quem não tem as voltas todas fica sem total nem posição;
 *   - 2023 veio com acentos trocados por espaço ("Am lia" = Amélia) e sem
 *     nacionalidade em ~2/3 do campo → nome e país reparados por cruzamento
 *     com as outras edições do mesmo slug e com o canónico de juniores, SÓ
 *     quando há exactamente um candidato (nunca se adivinha).
 *
 * USO (a partKey e o trnId vêm da listagem — ver docs/claude/major.md):
 *   node scripts/import-ffgolf-jobfile.js --trn 2401276441 --part-key 572da5febaee10b7e85bab9c6205c587 \
 *     --slug evianjc --year 2024 --name "The Amundi Evian Juniors Cup" --course "Evian Resort Golf Club"
 *   [--type 01 --ligue 01] [--force]
 *
 * Exit: 0 gravou · 2 nada novo · 1 erro.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const R = require("./scrape-ffgolf-resultats.js");
const { countryToIso2, normName } = require("./aggregator/util/names.js");
const { writeJsonAtomic } = require("./lib/atomic-write.js");

const DATA = path.join(__dirname, "..", "public", "data");
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const titleCase = (s) => String(s || "").toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
const stripAcc = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "20/09/2022" + i dias → { iso, label:"Tue, September 20" } */
function roundDate(ddmmyyyy, i) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(ddmmyyyy || "");
  if (!m) return { iso: null, label: null };
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1] + i));
  return {
    iso: d.toISOString().slice(0, 10),
    label: `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`,
  };
}

/** Série FFG → label do escalão (igual ao GolfGenius). */
function divisionLabel(serie) {
  if (/dames|filles|girls/i.test(serie.label)) return "Girls";
  if (/messieurs|gar[cç]ons|boys/i.test(serie.label)) return "Boys";
  return serie.label;
}

/**
 * Pool de nomes conhecidos (outras edições do slug + canónico de juniores) →
 * reparação de acentos perdidos e nacionalidade em falta.
 */
function buildPool(slug, year) {
  const pool = [];   // { name, key, country }
  for (const f of fs.readdirSync(DATA)) {
    const m = new RegExp(`^${slug}_(\\d{4})\\.json$`).exec(f);
    if (!m || +m[1] === year) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
      for (const dv of j.divisions || []) for (const p of dv.players || []) {
        pool.push({ name: p.name, key: stripAcc(p.name), country: p.country || null });
      }
    } catch { /* ficheiro ilegível → ignora */ }
  }
  try {
    const J = JSON.parse(fs.readFileSync(path.join(DATA, "juniors.json"), "utf8"));
    const arr = Array.isArray(J) ? J : (J.players || []);
    for (const p of arr) for (const n of [p.canonicalName, ...(p.aliases || [])]) {
      if (n) pool.push({ name: n, key: stripAcc(n), country: p.country || p.nationality || null });
    }
  } catch { /* sem canónico → só edições */ }
  return pool;
}

/** Candidatos únicos (por nome sem acentos) que batem o regex. */
function uniqueMatch(pool, re) {
  const hits = new Map();
  for (const c of pool) if (re.test(c.key)) {
    const k = c.key;
    if (!hits.has(k)) hits.set(k, { name: c.name, countries: new Set() });
    if (c.country) hits.get(k).countries.add(c.country);
  }
  return hits.size === 1 ? [...hits.values()][0] : null;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Nome "Prénom Nom". Se um dos campos tiver um espaço onde estava uma letra
 * acentuada ("Am lia", "MAS R"), tenta o nome certo no pool: cada espaço
 * suspeito vale exactamente UMA letra; as duas ordens (nome-apelido e
 * apelido-nome) são aceites.
 */
function resolveName(p, pool) {
  const prenom = String(p.namePrenom || "").trim();
  const nom = String(p.nameNom || "").trim();
  const shown = `${titleCase(prenom)} ${titleCase(nom)}`.replace(/\s+/g, " ").trim();
  const mangled = (s) => /\s\p{Ll}/u.test(s) || /(^|\s)\S{1,2}(\s|$)/u.test(s.trim());
  if (!mangled(prenom) && !mangled(nom)) return { name: shown, repaired: false };
  const field = (s, bad) => {
    const toks = stripAcc(s).split(/\s+/).filter(Boolean).map(esc);
    return bad ? toks.join(".") : toks.join(" ");
  };
  const f = field(prenom, mangled(prenom));
  const l = field(nom, mangled(nom));
  const hit = uniqueMatch(pool, new RegExp(`^(${f} ${l}|${l} ${f})$`));
  return hit ? { name: hit.name, repaired: true, hit } : { name: shown, repaired: false };
}

async function main() {
  const trnId = arg("--trn");
  const partKey = arg("--part-key");
  const slug = arg("--slug");
  const year = parseInt(arg("--year"), 10);
  const name = arg("--name");
  const course = arg("--course");
  const force = process.argv.includes("--force");
  if (!trnId || !partKey || !slug || !year) {
    console.error("Uso: node scripts/import-ffgolf-jobfile.js --trn <id> --part-key <32hex> --slug <slug> --year <aaaa> [--name] [--course] [--type 01] [--ligue 01] [--force]");
    process.exit(1);
  }

  const ctx = await R.bootstrap();
  const d = await R.getTournamentDetails(ctx, { trnId, partKey, typeCompetition: arg("--type", "01"), ligue: arg("--ligue", "01") });
  if (!d.series || !d.series.length) { console.error("❌ sem séries/jogadores no resultats-details"); process.exit(1); }

  const pool = buildPool(slug, year);
  let nRepaired = 0, nCountryFilled = 0;
  const nRounds = Math.max(...d.series.flatMap((s) => s.players.map((p) => [p.t1, p.t2, p.t3, p.t4].filter((t) => t != null).length)));
  const dates = Array.from({ length: nRounds }, (_, i) => roundDate(d.dateString, i));

  const divisions = d.series.map((s) => {
    const par = s.parPerHole;
    const players = s.players.map((p) => {
      const rounds = [];
      [1, 2, 3, 4].slice(0, nRounds).forEach((r, i) => {
        const st = p[`statusR${r}`];
        const sc = p[`scoresR${r}`];
        const gross = p[`t${r}`];
        if (st !== "00" || !Array.isArray(sc) || !gross) return;   // volta não jogada / sem cartão
        rounds.push({ day: rounds.length + 1, scores: sc, gross, date: dates[i].label, pars: par });
      });
      const complete = rounds.length === nRounds;
      const { name: nm, repaired, hit } = resolveName(p, pool);
      if (repaired) nRepaired++;
      let country = countryToIso2(p.nationality) || null;
      if (!country) {
        const byName = hit || uniqueMatch(pool, new RegExp(`^${esc(stripAcc(nm))}$`));
        if (byName && byName.countries.size === 1) { country = [...byName.countries][0]; nCountryFilled++; }
      }
      const total = complete ? rounds.reduce((a, r) => a + r.gross, 0) : null;
      return {
        pos: "", name: nm, country, location: p.nationality || "",
        hcp: typeof p.hcp === "number" ? p.hcp : null,
        club: p.club && p.club.trim() ? p.club.trim() : null,
        sex: p.sex || null,
        toPar: total != null ? total - s.parTotal * nRounds : null,
        total,
        roundGross: rounds.map((r) => r.gross),
        rounds,
      };
    });
    // Posições DENTRO do escalão (o classement da FFG é da classificação conjunta).
    const ranked = players.filter((p) => p.total != null).sort((a, b) => a.total - b.total);
    ranked.forEach((p, i) => {
      const first = ranked.findIndex((q) => q.total === p.total);
      const tied = ranked.filter((q) => q.total === p.total).length > 1;
      p.pos = `${tied ? "T" : ""}${first + 1}`;
    });
    const rest = players.filter((p) => p.total == null).sort((a, b) => b.rounds.length - a.rounds.length);
    return {
      division: divisionLabel(s), tid: `ffg:${trnId}:${s.serieId}`,
      par, parTotal: s.parTotal, meters: null, si: null, teeName: null,
      players: [...ranked, ...rest],
    };
  });

  const out = {
    tournament: name || d.libCpt || d.rawTitle || slug,
    year,
    startDate: dates[0]?.iso || null,
    endDate: dates[dates.length - 1]?.iso || null,
    source: `https://pages.ffgolf.org/resultats/ (trnId ${trnId})`,
    course: course || null,
    divisions,
    scrapedAt: new Date().toISOString(),
  };

  const file = path.join(DATA, `${slug}_${year}.json`);
  const nPlayers = divisions.reduce((a, dv) => a + dv.players.length, 0);
  if (fs.existsSync(file) && !force) {
    const prev = JSON.parse(fs.readFileSync(file, "utf8"));
    const prevN = (prev.divisions || []).reduce((a, dv) => a + (dv.players || []).length, 0);
    // Guarda anti-encolhimento (regra da casa): nunca gravar muito menos do que está em disco.
    if (nPlayers < prevN * 0.8) { console.error(`❌ ${nPlayers} jogadores < 80% dos ${prevN} em disco — usar --force`); process.exit(1); }
    const strip = (o) => JSON.stringify({ ...o, scrapedAt: undefined });
    if (strip(prev) === strip(out)) { console.log(`➖ ${path.basename(file)} sem alterações`); process.exit(2); }
  }
  writeJsonAtomic(file, out);
  const summary = divisions.map((dv) => `${dv.division}:${dv.players.length}j (${dv.players.filter((p) => p.total != null).length} completos, ${dv.players.filter((p) => !p.country).length} sem país)`).join(" · ");
  console.log(`✅ ${out.tournament} ${year} — ${summary} · nomes reparados: ${nRepaired} · países preenchidos: ${nCountryFilled} → ${file}`);
}

if (require.main === module) main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
module.exports = { resolveName, uniqueMatch, divisionLabel, roundDate };
