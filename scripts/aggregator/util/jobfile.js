/**
 * scripts/aggregator/util/jobfile.js
 *
 * Helper partilhado para adapters de fontes GolfGenius em formato "JobFile"
 * (o output do scrape-fsga.js / scrape-golfgenius-node.js): FSGA, Under Armour
 * e Campeonato Nacional Infantil Juvenil do México. Estruturalmente gémeo do
 * Future Masters / Doral, com duas diferenças:
 *   - sexo/idade parseados do label da divisão (parseDiv por fonte)
 *   - `dob`/`club` por jogador quando a ficha GG os expõe (México → matching forte)
 *
 * Cada adapter chama `buildJobfileSource({...})` e reexporta {load, SOURCE_ID,
 * SOURCE_LABEL}.
 */
const path = require("path");
const { DATA_DIR, readJsonSafe, listFiles } = require("./io");
const { displayName, splitName, countryToIso2, dobToIso } = require("./names");

/** "T1" / "T12" / "1" → número; outros → null. */
function parsePos(pos) {
  if (typeof pos === "number") return Number.isFinite(pos) ? pos : null;
  if (typeof pos !== "string") return null;
  const m = /(\d+)/.exec(pos);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Classifica o `pos` cru da fonte em { pos, status }.
 * Distingue "posição em falta" (undefined/"" → status OK, pos null, ELEGÍVEL a
 * inferência) de um token de não-classificação ("CUT"/"WD"/"DQ"/… → status
 * próprio, pos null, NUNCA inferido). Sem isto o `inferMissingPositions` dava
 * uma posição — e como um jogador CUT tem menos voltas, o seu total parcial é
 * mais baixo e saltava para 1º à frente dos que acabaram (caso Under Armour
 * World 2026 Boys 11-12: 96 CUT de 2 voltas empurravam os 19 finalistas).
 */
function classifyPos(pos) {
  const num = parsePos(pos);
  if (num != null) return { pos: num, status: "OK" };
  const s = String(pos == null ? "" : pos).trim().toUpperCase();
  if (/\b(?:CUT|MC|MDF)\b/.test(s)) return { pos: null, status: "CUT" };
  if (/\b(?:WD|WDN|RTD|RET)\b/.test(s)) return { pos: null, status: "WD" };
  if (/\b(?:DQ|DSQ|DQD)\b/.test(s)) return { pos: null, status: "DQ" };
  if (/\b(?:DNS|DNF|NR|NC)\b/.test(s)) return { pos: null, status: "DNS" };
  return { pos: null, status: "OK" }; // posição genuinamente em falta → inferível
}

const MONTHS_EN = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
/** "Thu, July 16" (+ ano do ficheiro) → "2026-07-16". */
function parseRoundDateISO(s, year) {
  if (!s || !year) return null;
  const m = /([A-Za-z]+)\s+(\d{1,2})/.exec(String(s).replace(/^[A-Za-z]+,\s*/, ""));
  if (!m) return null;
  const mon = MONTHS_EN[m[1].toLowerCase()];
  if (!mon) return null;
  return `${year}-${String(mon).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`;
}
/**
 * Data REAL do evento = 1ª ronda, derivada dos `round.date` que o scraper
 * GolfGenius já guarda ("Thu, July 16"). Sem isto o fallback era 1 de Janeiro
 * do ano → todos os GolfGenius (UA World, México, FSGA, CoC) apareciam a "01
 * Jan" e ficavam enterrados no fundo do ano na timeline do kids2.
 */
function deriveDateFromRounds(divisions, year) {
  let min = null;
  for (const div of divisions || []) {
    for (const pl of (Array.isArray(div.players) ? div.players : [])) {
      for (const r of (Array.isArray(pl.rounds) ? pl.rounds : [])) {
        const iso = parseRoundDateISO(r && r.date, year);
        if (iso && (min === null || iso < min)) min = iso;
      }
    }
  }
  return min;
}

function cleanLocation(loc) {
  if (!loc || typeof loc !== "string") return null;
  return loc.replace(/,\s*\d{3,4}\s*$/, "").trim() || null;
}

function roundsPlayed(r) {
  return Array.isArray(r.rounds) ? r.rounds.filter((x) => typeof x.gross === "number").length : 0;
}

function inferMissingPositions(results) {
  // 1) Finalistas (status OK): quem já traz posição da fonte mantém-na; quem não
  //    traz é rankeado pelo total. Um CUT/WD/DQ nunca entra aqui — senão o seu
  //    total parcial (menos voltas) saltava à frente de quem acabou.
  const withTotal = results.filter((r) => r.status === "OK" && typeof r.totalGross === "number");
  if (withTotal.length) {
    const sorted = [...withTotal].sort((a, b) => (a.totalGross || 0) - (b.totalGross || 0));
    let lastTotal = -1, lastPos = 0;
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const t = r.totalGross || 0;
      const pos = t === lastTotal ? lastPos : i + 1;
      if (r.pos == null) r.pos = pos;
      lastTotal = t; lastPos = pos;
    }
  }

  // 2) Não-finalistas (CUT/WD/DQ/DNS): recebem a posição REAL na leaderboard —
  //    SEMPRE depois de todos os que passaram o corte — ordenados por voltas
  //    jogadas (desc) e depois total parcial (asc). Assim a UI mostra "#45" em
  //    vez de "CUT" mas ninguém cortado passa à frente de um finalista.
  const dnf = results.filter((r) => r.status && r.status !== "OK" && r.pos == null && typeof r.totalGross === "number");
  if (dnf.length) {
    const maxFinisherPos = results.reduce((m, r) => (typeof r.pos === "number" && r.pos > m ? r.pos : m), 0);
    const nFinishers = results.filter((r) => r.status === "OK" && typeof r.pos === "number").length;
    const offset = Math.max(maxFinisherPos, nFinishers);
    const sorted = [...dnf].sort((a, b) => roundsPlayed(b) - roundsPlayed(a) || (a.totalGross || 0) - (b.totalGross || 0));
    let lastKey = null, lastPos = 0;
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const key = `${roundsPlayed(r)}|${r.totalGross || 0}`;
      const pos = key === lastKey ? lastPos : offset + i + 1;
      r.pos = pos;
      lastKey = key; lastPos = pos;
    }
  }
}

/** Junta o ano ao nome só se ainda não estiver lá — o nome do UA World já
 *  começa com "2026", não precisa de o repetir no fim. */
function nameWithYear(base, year) {
  const b = String(base || "").trim();
  if (!year) return b;
  return b.includes(String(year)) ? b : `${b} ${year}`;
}

function collectLinks(divisions, seriesLabel) {
  const seen = new Set(); const links = [];
  for (const div of divisions) {
    const url = div.source;
    if (url && !seen.has(url)) { seen.add(url); links.push({ label: `GolfGenius — ${div.division || seriesLabel}`.trim(), url }); }
  }
  return links;
}

/**
 * @param {object} opts
 * @param {string} opts.sourceId          id da fonte (ex: "uajt")
 * @param {string} opts.sourceLabel       label legível
 * @param {RegExp} opts.pattern           padrão do ficheiro (ex: /^uajt_\d{4}\.json$/)
 * @param {string} opts.seriesId          id da série (kids2)
 * @param {string} opts.seriesLabel       label da série
 * @param {string} [opts.defaultCountry]  país por defeito (ISO2) quando o jogador não tem
 * @param {(divKey:string)=>{ageMin:?number,ageMax:?number,sex:?string}} opts.parseDiv
 * @param {(data:object)=>string} [opts.nameFn]  nome do torneio (default: data.tournament + ano)
 * @param {number} [opts.maxAgeInYear]  se definido, exclui jogadores cujo birthYear
 *   implica idade > maxAgeInYear no ano do torneio (protege a base de juniores de
 *   adultos em torneios "open"/seniores; jogadores sem birthYear passam sempre).
 */
function buildJobfileSource(opts) {
  const { sourceId, sourceLabel, pattern, seriesId, seriesLabel, defaultCountry = null, parseDiv, maxAgeInYear = null } = opts;

  function normalize(data, fileName, playerMap) {
    const year = data.year || (fileName.match(/(\d{4})/) ? +fileName.match(/(\d{4})/)[1] : null);
    const sourceKey = fileName.replace(/\.json$/, "");
    const divisions = Array.isArray(data.divisions) ? data.divisions : [];
    const flights = [];

    for (const div of divisions) {
      const divKey = div.division || div.key || div.name || "";
      const { ageMin, ageMax, sex } = parseDiv(divKey);
      const par = Array.isArray(div.par) ? div.par : null;
      const divPlayers = Array.isArray(div.players) ? div.players : [];
      const results = [];

      for (const pl of divPlayers) {
        const cleanName = displayName(splitName(pl.name || ""));
        if (!cleanName) continue;
        // Porta de idade opcional: exclui adultos em torneios open/seniores
        // (ex: European Ladies' Team). Sem birthYear → passa (não fabricar corte).
        if (maxAgeInYear && year && Number.isInteger(pl.birthYear) && pl.birthYear > 1900
            && (year - pl.birthYear) > maxAgeInYear) continue;
        const iso = countryToIso2(pl.country || "") || defaultCountry || null;
        const dob = dobToIso(pl.dob) || null;
        // ANO de nascimento sem data completa (ex: GolfBox) → dobRange anual, a
        // mesma evidência média que o USKids/GJGL usam: permite fundir variantes
        // de nome no MESMO ano e discrimina homónimos de anos diferentes, sem
        // fabricar uma DOB exacta falsa. Só quando não há dob completa.
        const birthYear = Number.isInteger(pl.birthYear) && pl.birthYear > 1900 ? pl.birthYear : null;
        const dobRange = !dob && birthYear ? { lo: `${birthYear}-01-01`, hi: `${birthYear}-12-31` } : null;
        // Chave forte por GolfGenius id (único por jogador×divisão); resultados
        // só contam se o jogador estiver em players[] (invariante do matcher).
        const key = pl.detailId ? `${sourceId}-${pl.detailId}` : `${cleanName.toLowerCase()}|${iso || ""}`;
        const prev = playerMap.get(key);
        if (!prev || (dob && !prev.dob) || (dobRange && !prev.dob && !prev.dobRange)) {
          playerMap.set(key, {
            sourceKey: key,
            name: cleanName,
            country: iso,
            dob: dob || prev?.dob || null,
            dobRange: dobRange || prev?.dobRange || null,
            sex: sex || prev?.sex || null,
            club: pl.club || prev?.club || null,
            extra: {
              countryName: iso ? null : (pl.country || null),
              location: cleanLocation(pl.location),
              golfGeniusId: pl.detailId || null,
              gradYear: pl.gradYear || null,
              birthYear,
            },
          });
        }

        let rounds = (Array.isArray(pl.rounds) ? pl.rounds : []).map((r, i) => ({
          round: i + 1,
          gross: typeof r.gross === "number" ? r.gross : null,
          strokes: Array.isArray(r.scores) ? r.scores : undefined,
        }));
        if (rounds.length === 0 && Array.isArray(pl.roundGross)) {
          rounds = pl.roundGross.filter((g) => typeof g === "number").map((g, i) => ({ round: i + 1, gross: g }));
        }

        const { pos: parsedPos, status } = classifyPos(pl.pos);
        results.push({
          playerSourceKey: key,
          playerName: cleanName,
          pos: parsedPos,
          status,
          totalGross: typeof pl.total === "number" ? pl.total : null,
          toPar: typeof pl.toPar === "number" ? pl.toPar : null,
          rounds,
        });
      }

      inferMissingPositions(results);
      flights.push({
        flightKey: divKey.toLowerCase().replace(/[^a-z0-9]+/g, "_") || `f${flights.length}`,
        label: divKey,
        ageMin, ageMax, sex,
        par,
        fieldSize: results.length,
        results,
      });
    }

    return {
      sourceKey,
      name: (opts.nameFn ? opts.nameFn(data) : nameWithYear(data.tournament || seriesLabel, year)).trim(),
      // Data real do evento: startDate da fonte (GolfBox) → data derivada dos
      // round.date (GolfGenius) → fallback a 1 de Janeiro do ano.
      date: data.startDate || data.date || deriveDateFromRounds(divisions, year) || (year ? `${year}-01-01` : null),
      seriesId,
      seriesLabel,
      course: data.course || null,
      flights,
      links: collectLinks(divisions, seriesLabel),
    };
  }

  function load() {
    const files = listFiles(DATA_DIR, pattern);
    const tournaments = [];
    const playerMap = new Map();
    for (const file of files) {
      const data = readJsonSafe(file, null);
      if (!data) continue;
      const tt = normalize(data, path.basename(file), playerMap);
      if (tt) tournaments.push(tt);
    }
    return { sourceId, sourceLabel, players: [...playerMap.values()], tournaments };
  }

  return { load, SOURCE_ID: sourceId, SOURCE_LABEL: sourceLabel };
}

// "Boys 13-14"/"Girls 8U"/"Varonil 18"/"Femenil 12-13"/"Overall"/"13-15" →
// {ageMin, ageMax, sex}. Boys/Varonil→M, Girls/Femenil→F, senão null (misto).
function parseSexAge(divKey) {
  const s = String(divKey || "");
  // O sexo tanto vem no início ("Boys 13-14", "Varonil 18") como no FIM
  // ("Under 12 Boys" — Champion of Champions).
  const sex = /^\s*(boys|var)/i.test(s) ? "M" : /^\s*(girls|fem)/i.test(s) ? "F"
    : /\bboys\b/i.test(s) ? "M" : /\bgirls\b/i.test(s) ? "F" : null;
  if (/\bU\b|and under|y menores|\bunder\s*\d/i.test(s)) { const m = /(\d+)/.exec(s); return { ageMin: null, ageMax: m ? +m[1] : null, sex }; }
  if (/(\d+)\s*U\b/i.test(s)) { const m = /(\d+)\s*U/i.exec(s); return { ageMin: null, ageMax: +m[1], sex }; }
  const range = /(\d+)\s*(?:-|&|to|y|\/)\s*(\d+)/i.exec(s);
  if (range) return { ageMin: +range[1], ageMax: +range[2], sex };
  const single = /(\d+)/.exec(s);
  if (single) return { ageMin: +single[1], ageMax: +single[1], sex };
  return { ageMin: null, ageMax: null, sex };
}

module.exports = { buildJobfileSource, parseSexAge };
