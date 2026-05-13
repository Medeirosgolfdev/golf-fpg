/**
 * scripts/aggregator/util/names.js
 *
 * Normalização de nomes e países.
 */

const SUFFIX_TOKENS = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "junior", "senior"]);

/**
 * normName — lowercase + sem diacríticos + espaços condensados.
 * Hifenes, slashes e pontos viram espaços (para apanhar variantes como
 * "Castro-Ferreira" ↔ "Castro Ferreira").
 * Sufixos honoríficos (Jr/Sr/II/III/Junior/Senior) são removidos.
 * Usado para matching cross-source.
 */
function normName(s) {
  if (!s) return "";
  const base = String(s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,\-\/'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // remover sufixos honoríficos do FIM (Jr, Sr, II, III...)
  const tokens = base.split(" ");
  while (tokens.length > 1 && SUFFIX_TOKENS.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ");
}

/**
 * displayName — Title Case quando o input está em ALL CAPS,
 * caso contrário deixa como está.
 */
function displayName(s) {
  if (!s) return "";
  const str = String(s).trim();
  const upperCount = (str.match(/[A-Z]/g) || []).length;
  const letterCount = (str.match(/[A-Za-z]/g) || []).length;
  if (letterCount === 0) return str;
  const ratio = upperCount / letterCount;
  if (ratio < 0.45) return str;
  return str.toLowerCase().replace(/(^|\s|-|')([a-zà-ÿ])/g, (m, sep, ch) => sep + ch.toUpperCase());
}

/**
 * splitName — "Last, First" → "First Last".
 * Heurística simples: se contém vírgula, inverte.
 */
function splitName(s) {
  if (!s) return "";
  const t = String(s).trim();
  if (t.includes(",")) {
    const [last, first] = t.split(",").map((x) => x.trim());
    return `${first} ${last}`.replace(/\s+/g, " ").trim();
  }
  return t;
}

/**
 * countryToIso2 — converte muitas grafias de país para ISO2.
 * Retorna null se não souber.
 */
const COUNTRY_TO_ISO2 = {
  PRT: "PT", POR: "PT", PORTUGAL: "PT",
  ESP: "ES", SPA: "ES", SPAIN: "ES",
  FRA: "FR", FRANCE: "FR",
  GBR: "GB", UK: "GB", UNITEDKINGDOM: "GB",
  USA: "US", UNITEDSTATES: "US",
  ITA: "IT", ITALY: "IT",
  DEU: "DE", GER: "DE", GERMANY: "DE",
  NLD: "NL", NETHERLANDS: "NL",
  RUS: "RU", RUSSIA: "RU", RUSSIANFEDERATION: "RU",
  CHN: "CN", CHINA: "CN",
  KOR: "KR", SOUTHKOREA: "KR",
  JPN: "JP", JAPAN: "JP",
  CAN: "CA", CANADA: "CA",
  MEX: "MX", MEXICO: "MX",
  BRA: "BR", BRAZIL: "BR",
  ARG: "AR", ARGENTINA: "AR",
  COL: "CO", COLOMBIA: "CO",
  AUS: "AU", AUSTRALIA: "AU",
  NZL: "NZ", NEWZEALAND: "NZ",
  IRL: "IE", IRELAND: "IE",
  CHE: "CH", SWITZERLAND: "CH",
  AUT: "AT", AUSTRIA: "AT",
  BEL: "BE", BELGIUM: "BE",
  SWE: "SE", SWEDEN: "SE",
  NOR: "NO", NORWAY: "NO",
  DNK: "DK", DEN: "DK", DENMARK: "DK",
  FIN: "FI", FINLAND: "FI",
  POL: "PL", POLAND: "PL",
  CZE: "CZ", CZECHREPUBLIC: "CZ", CZECHIA: "CZ",
  IND: "IN", INDIA: "IN",
  PHL: "PH", PHILIPPINES: "PH",
  TWN: "TW", TAIWAN: "TW",
  HKG: "HK", HONGKONG: "HK",
  ZAF: "ZA", SOUTHAFRICA: "ZA",
  MAR: "MA", MOROCCO: "MA",
  CRC: "CR", COSTARICA: "CR",
  GUA: "GT", GUATEMALA: "GT",
  PAN: "PA", PANAMA: "PA",
  PER: "PE", PERU: "PE",
  CHL: "CL", CHILE: "CL",
  VEN: "VE", VENEZUELA: "VE",
  CRI: "CR",
};

const COUNTRY_NAME = {
  PT: "Portugal", ES: "Spain", FR: "France", GB: "United Kingdom",
  US: "United States", IT: "Italy", DE: "Germany", NL: "Netherlands",
  RU: "Russia", CN: "China", KR: "South Korea", JP: "Japan",
  CA: "Canada", MX: "Mexico", BR: "Brazil", AR: "Argentina",
  CO: "Colombia", AU: "Australia", NZ: "New Zealand", IE: "Ireland",
  CH: "Switzerland", AT: "Austria", BE: "Belgium", SE: "Sweden",
  NO: "Norway", DK: "Denmark", FI: "Finland", PL: "Poland",
  CZ: "Czech Republic", IN: "India", PH: "Philippines", TW: "Taiwan",
  HK: "Hong Kong", ZA: "South Africa", MA: "Morocco", CR: "Costa Rica",
  GT: "Guatemala", PA: "Panama", PE: "Peru", CL: "Chile", VE: "Venezuela",
};

function countryToIso2(s) {
  if (!s) return null;
  const key = String(s).toUpperCase().replace(/[^A-Z]/g, "");
  if (key.length === 2 && COUNTRY_NAME[key]) return key;
  return COUNTRY_TO_ISO2[key] || null;
}

function countryName(iso2) {
  if (!iso2) return null;
  return COUNTRY_NAME[String(iso2).toUpperCase()] || null;
}

function dobToIso(s) {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  return null;
}

function usDateToIso(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return dobToIso(s);
  const mm = m[1].padStart(2, "0");
  const dd = m[2].padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

module.exports = {
  normName,
  displayName,
  splitName,
  countryToIso2,
  countryName,
  dobToIso,
  usDateToIso,
};
