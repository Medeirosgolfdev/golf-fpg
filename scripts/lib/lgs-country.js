/**
 * scripts/lib/lgs-country.js
 *
 * Códigos de país do rfegolf.livegolfscoring.es → ISO-2 (o vocabulário do
 * `src/utils/flagUtils.ts`, que é quem desenha a bandeira na app).
 *
 * A bandeira de cada jogador vive na linha do leaderboard:
 *   <img class="flag" src="/img/banderas/paises/por.png" title="Andalucía">
 * O `title` (quando existe) é a COMUNIDADE AUTÓNOMA de quem está federado em
 * Espanha — inclusive de estrangeiros ("pol" + "Andalucía").
 *
 * ⚠ `aus` é ÁUSTRIA, não Austrália. Confirmado nas licenças pseudo que a RFEG
 * gera para os estrangeiros (`XX{tid}AUS{nn}`) do Spanish International U-18
 * 2026: Csöngei, Feuchter, Großschädl, Weißensteiner — todos austríacos.
 * Traduzir para "AU" punha bandeira australiana em meia dúzia de austríacos.
 *
 * As quatro nações britânicas têm código próprio (eng/sco/wal/nir) e a app
 * também: "GB-ENG"/"GB-SCT"/"GB-WLS"/"GB-NIR".
 */

const LGS_COUNTRY = {
  esp: "ES", por: "PT", fra: "FR", ita: "IT", ale: "DE", ger: "DE",
  ing: "GB-ENG", eng: "GB-ENG", sco: "GB-SCT", esc: "GB-SCT",
  wal: "GB-WLS", gal: "GB-WLS", nir: "GB-NIR", irn: "GB-NIR",
  ire: "IE", irl: "IE", gbr: "GB", run: "GB",
  aus: "AT",              // ⚠ Áustria (ver cabeçalho)
  aut: "AT", ast: "AT",
  sui: "CH", swi: "CH", sza: "CH",
  hol: "NL", ned: "NL", nld: "NL",
  bel: "BE", lux: "LU", din: "DK", den: "DK", dnk: "DK",
  sue: "SE", swe: "SE", nor: "NO", fin: "FI", isl: "IS",
  pol: "PL", che: "CZ", cze: "CZ", esl: "SK", svk: "SK",
  hun: "HU", rum: "RO", rou: "RO", bul: "BG", gre: "GR", grc: "GR",
  cro: "HR", srb: "RS", slo: "SI", svn: "SI", ucr: "UA", ukr: "UA",
  rus: "RU", est: "EE", let: "LV", lat: "LV", lit: "LT", ltu: "LT",
  tur: "TR", isr: "IL", lib: "LB",
  eeuu: "US", usa: "US", can: "CA", mex: "MX", mej: "MX",
  arg: "AR", bra: "BR", bre: "BR", chi: "CL", col: "CO", per: "PE",
  uru: "UY", ven: "VE", ecu: "EC", par: "PY", bol: "BO",
  cri: "CR", pan: "PA", gua: "GT", dom: "DO", pue: "PR",
  mar: "MA", mor: "MA", tun: "TN", arg_: "AR", sud: "ZA", rsa: "ZA",
  egi: "EG", egy: "EG", nga: "NG", ken: "KE",
  jap: "JP", jpn: "JP", chn: "CN", chi_: "CN", cor: "KR", kor: "KR",
  ind: "IN", tai: "TW", twn: "TW", hkg: "HK", sin: "SG", sgp: "SG",
  tha: "TH", mas: "MY", mys: "MY", idn: "ID", phi: "PH", vie: "VN",
  aut_nz: "NZ", nzl: "NZ", nue: "NZ", ausl: "AU", auz: "AU",
  eau: "AE", are: "AE", qat: "QA", ksa: "SA", sau: "SA", kaz: "KZ",
  and: "AD", mon: "MC", mlt: "MT", chy: "CY", cyp: "CY",
  // Códigos vistos no corpus e identificados pelos NOMES dos jogadores
  // (2026-09-03): net → Van der Lande/Franken/Dresselhuys (NL) · ice →
  // Sigurbjorn Thorgeirsson (IS) · slk → Zustak/Bencik/Tomanka (SK) · lva →
  // Spruzs (LV) · bla → Shultse/Silchenko (BY) · hon → Wong Sabrina e Yang
  // Alexander, dois chineses em torneios diferentes (HK, não Honduras) ·
  // lie → Liechtenstein.
  net: "NL", ice: "IS", slk: "SK", lva: "LV", bla: "BY", hon: "HK", lie: "LI",
  // ⚠ `cam` fica DE FORA: o único caso (Yin Harmonie) tanto serve Camboja como
  // Camarões e a regra da casa é preferir nenhuma bandeira a uma errada.
};

/** Código LGS ("por", "aus") → ISO-2 da app ("PT", "AT"). null se desconhecido
 *  — de propósito: melhor sem bandeira do que com a bandeira errada. */
function lgsCountryToIso(code) {
  if (!code) return null;
  return LGS_COUNTRY[String(code).trim().toLowerCase()] || null;
}

module.exports = { LGS_COUNTRY, lgsCountryToIso };
