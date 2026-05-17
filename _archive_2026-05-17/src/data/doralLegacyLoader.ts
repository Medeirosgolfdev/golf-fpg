/**
 * doralLegacyLoader.ts
 *
 * Carrega directamente os ficheiros `ftm_doral_YYYY.json` que existem em
 * /public/data/ mas que não foram incluídos no `tournament-catalog.json`
 * actual da pipeline canónica. Hoje (Maio 2026) o catálogo só tem Doral
 * 2024 e 2025 — os ficheiros 2018-2023 existem mas só passariam a ser
 * visíveis no UI após `node scripts/aggregator/index.js` ser corrido.
 *
 * Para não obrigar o utilizador a esperar pelo aggregator quando muda os
 * JSONs, este loader complementa o `autoRivals` produzido por
 * `buildAutoRivals` injectando os tids em falta (`doral18` … `doral23`,
 * com sufixo de escalão tipo `_b1011`).
 *
 * Os tids gerados seguem a mesma convenção do `legacyTid()` do
 * KIDSdataLoader, para que se o aggregator vier a correr depois os mesmos
 * keys sejam usados em vez de duplicar dados.
 */
import { cachedFetchJson } from "./fetchCache";
import { normName, type AutoRivalPlayer } from "./KIDSdataLoader";

/** Mapa "United States of America" → "US" etc. — abreviado. Para o que falta
 *  ficamos com o nome em inglês mesmo (a tabela tolera). */
const COUNTRY_TO_ISO: Record<string, string> = {
  "united states of america": "US",
  "united states": "US",
  "usa": "US",
  "portugal": "PT",
  "spain": "ES",
  "españa": "ES",
  "italy": "IT",
  "italia": "IT",
  "france": "FR",
  "germany": "DE",
  "netherlands": "NL",
  "belgium": "BE",
  "switzerland": "CH",
  "austria": "AT",
  "ireland": "IE",
  "united kingdom": "GB",
  "great britain": "GB",
  "england": "GB",
  "scotland": "GB",
  "wales": "GB",
  "sweden": "SE",
  "norway": "NO",
  "finland": "FI",
  "denmark": "DK",
  "poland": "PL",
  "russian federation": "RU",
  "russia": "RU",
  "ukraine": "UA",
  "china": "CN",
  "japan": "JP",
  "thailand": "TH",
  "canada": "CA",
  "mexico": "MX",
  "brazil": "BR",
  "argentina": "AR",
  "venezuela": "VE",
  "colombia": "CO",
  "australia": "AU",
};
function countryToIso(co?: string): string {
  if (!co) return "";
  return COUNTRY_TO_ISO[co.toLowerCase()] || co.toUpperCase().slice(0, 2);
}

/** "Last, First Middle" → "First Middle Last". Devolve trim se não bater. */
function flipName(raw: string): string {
  if (!raw) return "";
  const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`.replace(/\s+/g, " ").trim();
  return raw.replace(/\s+/g, " ").trim();
}

interface DoralPlayer {
  id?: string;
  name?: string;
  country?: string;
  birthYear?: number | null;
  pos?: number | string;
  toPar?: number | null;
  total?: number | null;
  r1Gross?: number | null;
  r2Gross?: number | null;
  rounds?: Array<{ day?: number; gross?: number | null; scores?: number[] }>;
}
interface DoralDivision {
  division: string;
  par?: number[];
  parTotal?: number;
  players?: DoralPlayer[];
}
interface DoralFile {
  year?: number;
  divisions?: DoralDivision[];
}

/** Deriva o sufixo de escalão a partir do nome da division. Replicado do
 *  legacyTid() do KIDSdataLoader, ramo "doral". */
function divisionSuffix(divKey: string): string {
  // Tentar "Boys X-Y" / "Girls X-Y" / "Boys X & Y" etc.
  const range = /(\d+)\s*[-&]\s*(\d+)/.exec(divKey);
  if (range) {
    const min = range[1];
    const max = range[2];
    const sameAge = min === max;
    return `_b${min}${sameAge ? "" : max}`;
  }
  // "Boys 7 & Under" / "Boys 7 and Under" / similar
  if (/under/i.test(divKey)) {
    const single = /(\d+)/.exec(divKey);
    if (single) return `_b${single[1]}u`;
  }
  // Single age "Boys 7"
  const single = /(\d+)/.exec(divKey);
  if (single) return `_b${single[1]}`;
  return "";
}

/** Anos a carregar — só os que NÃO estão já no autoRivals. */
const LEGACY_YEARS = [2018, 2019, 2020, 2021, 2022, 2023];

/** Enriquece `autoRivals` (in-place) com dados das edições Doral em falta.
 *  Reentrante: se um tid já existe em autoRivals, não é re-escrito. */
export async function enrichWithDoralLegacy(autoRivals: AutoRivalPlayer[]): Promise<void> {
  // Indexar autoRivals por nome normalizado para merge eficiente
  const byName = new Map<string, AutoRivalPlayer>();
  for (const p of autoRivals) byName.set(normName(p.n), p);

  // Detectar quais anos já têm tids no autoRivals — se sim, saltar
  const existingYears = new Set<number>();
  for (const p of autoRivals) {
    for (const tid of Object.keys(p.r)) {
      const m = tid.match(/^doral(\d{2})/);
      if (m) {
        const yy = parseInt(m[1], 10);
        existingYears.add(yy < 50 ? 2000 + yy : 1900 + yy);
      }
    }
  }

  const toLoad = LEGACY_YEARS.filter(y => !existingYears.has(y));
  if (toLoad.length === 0) return;

  await Promise.all(toLoad.map(async (year) => {
    const yy = String(year).slice(2);
    let data: DoralFile | null = null;
    try {
      data = await cachedFetchJson<DoralFile>(`/data/ftm_doral_${year}.json`);
    } catch { /* ficheiro pode não existir, ignora */ }
    if (!data || !Array.isArray(data.divisions)) return;

    for (const div of data.divisions) {
      const divKey = div.division || "";
      const suffix = divisionSuffix(divKey);
      const tid = `doral${yy}${suffix}`;
      // Par por ronda — usar parTotal do JSON (ex: 36 para 9H) ou somar div.par
      const parPerRound = typeof div.parTotal === "number" && div.parTotal > 0
        ? div.parTotal
        : (Array.isArray(div.par) ? div.par.reduce((a, b) => a + (b || 0), 0) : 36);

      for (const pl of (div.players || [])) {
        const name = flipName(pl.name || "");
        if (!name) continue;
        const key = normName(name);
        let player = byName.get(key);
        if (!player) {
          player = {
            n: name,
            co: countryToIso(pl.country),
            r: {},
          };
          byName.set(key, player);
          autoRivals.push(player);
        }
        if (player.r[tid]) continue; // já existe — não sobrescrever

        // Construir rd[] cronologicamente. Os ficheiros antigos têm
        // r1Gross/r2Gross e às vezes um array rounds[] com day=1, day=2.
        const rd: number[] = [];
        if (Array.isArray(pl.rounds) && pl.rounds.length > 0) {
          // Ordenar por `day` ASC (o scraper às vezes inverte cronologicamente
          // mas no Doral histórico isto geralmente está alinhado)
          const sorted = [...pl.rounds].sort((a, b) => (a.day || 0) - (b.day || 0));
          for (const r of sorted) {
            if (typeof r.gross === "number" && r.gross > 0) rd.push(r.gross);
          }
        }
        if (rd.length === 0) {
          if (typeof pl.r1Gross === "number" && pl.r1Gross > 0) rd.push(pl.r1Gross);
          if (typeof pl.r2Gross === "number" && pl.r2Gross > 0) rd.push(pl.r2Gross);
        }
        if (rd.length === 0) continue; // sem dados úteis

        const total = typeof pl.total === "number" ? pl.total : rd.reduce((a, b) => a + b, 0);
        const nRounds = rd.length;
        const tp = typeof pl.toPar === "number" ? pl.toPar : (total - parPerRound * nRounds);
        // O AutoTournResult exige p: number | "WD" | null. Strings tipo "T5"
        // não são suportadas — caímos para null nesses casos. Pos numérica vai
        // como número; "WD" preserva-se como string-literal.
        let pos: number | "WD" | null = null;
        if (typeof pl.pos === "number" && pl.pos > 0) pos = pl.pos;
        else if (pl.pos === "WD" || pl.pos === "wd") pos = "WD";

        player.r[tid] = { tp, t: total, p: pos, rd };
      }
    }
  }));
}
