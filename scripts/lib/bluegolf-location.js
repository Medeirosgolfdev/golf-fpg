// scripts/lib/bluegolf-location.js
//
// Alguns microsites BlueGolf (JWGC, FCG) põem no "país" do perfil a string
// "CLASSE, LOCAL" — o ANO DE GRADUAÇÃO seguido da localidade. Exemplos:
//   "2031, Japan"                 → { gradYear: 2031, country: "Japan" }
//   "2028, Rancho Santa Fe, CA"   → { gradYear: 2028, country: "United States", hometown: "Rancho Santa Fe, CA" }
//   "2031, Richmond, BC"          → { gradYear: 2031, country: "Canada" }
//   "Portugal"                    → { gradYear: null, country: "Portugal" } (formato normal bjgt/wjgc — inalterado)
//
// ⚠ O campo de localidade da FCG/JWGC é preenchido pelo próprio inscrito e vem
// sujo de duas maneiras que davam bandeiras erradas:
//   1. Cidade estrangeira + sigla de estado dos EUA — "Bangkok, CA",
//      "Hong Kong, FL", "Mexico City, NM", "Shenzhen, CA". A sigla é lixo do
//      formulário; o miúdo não é americano.
//   2. Só a cidade, sem país — "Auckland", "Tokyo", "Morelia", "宇都宮" →
//      ficavam sem bandeira nenhuma.
// Resolução por ordem de confiança: (a) um dos segmentos É um país;
// (b) a cidade está no dicionário abaixo; (c) sigla de estado → EUA/Canadá.
// Cidades ambíguas (London, Melbourne, Panama City, Victoria…) têm gémeas nos
// EUA — essas só valem quando NÃO há sigla de estado (`strong: false`).

const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ")
);
const CA_PROV = new Set("AB BC MB NB NL NS NT NU ON PE QC SK YT".split(" "));
/** Territórios dos EUA — sigla de "estado" mas bandeira própria. */
const US_TERRITORIES = new Map(Object.entries({
  GU: "Guam", MP: "Northern Mariana Islands", PR: "Puerto Rico",
  VI: "U.S. Virgin Islands", AS: "American Samoa",
}));

/** minúsculas, sem acentos, espaços colapsados, sem pontuação de fim. */
function norm(s) {
  return String(s == null ? "" : s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").replace(/[.·]+$/, "").trim();
}

/** Segmento que É um país (ou código de país usado no formulário). */
const COUNTRY_SEGMENTS = new Map(Object.entries({
  "usa": "United States", "us": "United States", "u.s.a": "United States",
  "united states": "United States", "united states of america": "United States",
  "canada": "Canada", "mexico": "Mexico", "mx": "Mexico", "mex": "Mexico",
  "japan": "Japan", "jpn": "Japan", "china": "China", "prc": "China",
  "hong kong": "Hong Kong", "macau": "Macau", "macao": "Macau",
  "taiwan": "Taiwan", "tw": "Taiwan", "taiwan (r.o.c.)": "Taiwan", "chinese taipei": "Taiwan",
  "south korea": "South Korea", "korea": "South Korea", "republic of korea": "South Korea",
  "thailand": "Thailand", "vietnam": "Vietnam", "viet nam": "Vietnam",
  "philippines": "Philippines", "ph": "Philippines", "phl": "Philippines",
  "malaysia": "Malaysia", "singapore": "Singapore", "indonesia": "Indonesia",
  "india": "India", "cambodia": "Cambodia", "united arab emirates": "United Arab Emirates",
  "qatar": "Qatar", "saudi arabia": "Saudi Arabia", "lebanon": "Lebanon",
  "australia": "Australia", "new zealand": "New Zealand", "samoa": "Samoa",
  "guam": "Guam", "bermuda": "Bermuda", "puerto rico": "Puerto Rico",
  "england": "England", "scotland": "Scotland", "wales": "Wales",
  "united kingdom": "United Kingdom", "uk": "United Kingdom", "great britain": "United Kingdom",
  "ireland": "Ireland", "france": "France", "germany": "Germany", "austria": "Austria",
  "spain": "Spain", "portugal": "Portugal", "italy": "Italy", "netherlands": "Netherlands",
  "poland": "Poland", "czech republic": "Czech Republic", "czechia": "Czech Republic",
  "latvia": "Latvia", "sweden": "Sweden", "norway": "Norway", "denmark": "Denmark",
  "finland": "Finland", "switzerland": "Switzerland", "belgium": "Belgium",
  "south africa": "South Africa", "zimbabwe": "Zimbabwe", "morocco": "Morocco",
  "brazil": "Brazil", "argentina": "Argentina", "chile": "Chile", "colombia": "Colombia",
  "peru": "Peru", "ecuador": "Ecuador", "bolivia": "Bolivia", "uruguay": "Uruguay",
  "venezuela": "Venezuela", "panama": "Panama", "guatemala": "Guatemala",
  "costa rica": "Costa Rica", "el salvador": "El Salvador", "honduras": "Honduras",
  "nicaragua": "Nicaragua", "dominican republic": "Dominican Republic",
  "barbados": "Barbados", "bahamas": "Bahamas", "jamaica": "Jamaica",
  "cook islands": "Cook Islands",
}));

/** Cidade → país. `strong` = nome inequívoco (ganha à sigla de estado). */
function city(country, strong) { return { country, strong }; }
const CITY_COUNTRY = new Map(Object.entries({
  /* ── Japão ── */
  "tokyo": city("Japan", true), "okutama tokyo": city("Japan", true), "shinjuku": city("Japan", true),
  "osaka": city("Japan", true), "osaka-shi": city("Japan", true), "osaka shi": city("Japan", true),
  "nagoya": city("Japan", true), "nagoya-shi": city("Japan", true), "yokohama": city("Japan", true),
  "yokohama-shi": city("Japan", true), "kawasaki": city("Japan", true), "kasukabe": city("Japan", true),
  "nasushiobara": city("Japan", true), "tsukuba-shi": city("Japan", true), "wako-city": city("Japan", true),
  "takamatsu-shi": city("Japan", true), "nagakute": city("Japan", true), "naha": city("Japan", true),
  "chiba": city("Japan", true), "gunma": city("Japan", true), "tochigi": city("Japan", true),
  "hyogo": city("Japan", true), "hyougo": city("Japan", true), "fukuoka": city("Japan", true),
  "aichi gun togo cho aichi": city("Japan", true), "aichi gun togo cho": city("Japan", true),
  "aichi": city("Japan", true), "okinawa chatan jpn": city("Japan", true),
  "宇都宮": city("Japan", true), "可児市": city("Japan", true), "埼玉": city("Japan", true),
  "額田郡": city("Japan", true), "高崎市": city("Japan", true), "横浜市": city("Japan", true),
  "名古屋": city("Japan", true), "名古屋市": city("Japan", true), "兵庫県": city("Japan", true),
  /* ── China ── */
  "beijing": city("China", true), "北京": city("China", true), "shanghai": city("China", true),
  "shenzhen": city("China", true), "chengdu": city("China", true), "nanjing": city("China", true),
  "hangzhou": city("China", true), "changsha city": city("China", true), "chongqing": city("China", true),
  "tianjin": city("China", true), "zhengzhou": city("China", true), "foshan": city("China", true),
  "lingshui": city("China", true),
  /* ── Hong Kong / Macau / Taiwan ── */
  "new territories": city("Hong Kong", true), "kowloon": city("Hong Kong", true),
  "taipei": city("Taiwan", true), "taipei city": city("Taiwan", true), "new taipei city": city("Taiwan", true),
  "taichung": city("Taiwan", true), "tainan city": city("Taiwan", true), "kaohsiung": city("Taiwan", true),
  "hsinchu": city("Taiwan", true), "hsinchu county": city("Taiwan", true),
  "pingtung county": city("Taiwan", true), "taoyuan city": city("Taiwan", true),
  "內湖區": city("Taiwan", true), "南投市": city("Taiwan", true), "高雄市": city("Taiwan", true),
  /* ── Coreia do Sul ── */
  "seoul": city("South Korea", true), "incheon": city("South Korea", true),
  "suwon": city("South Korea", true), "osan-si": city("South Korea", true),
  "gyeonggi-do": city("South Korea", true),
  /* ── Sudeste asiático ── */
  "bangkok": city("Thailand", true), "chiang mai": city("Thailand", true), "chiang rai": city("Thailand", true),
  "chonburi": city("Thailand", true), "nonthaburi": city("Thailand", true),
  "nakhon pathom": city("Thailand", true), "samut prakan": city("Thailand", true),
  "samutprakarn": city("Thailand", true), "phetchaburi": city("Thailand", true),
  "ratchaburi": city("Thailand", true), "phra nakhon si ayutthaya": city("Thailand", true),
  "hanoi": city("Vietnam", true), "ho chi minh": city("Vietnam", true),
  "ho chi minh city": city("Vietnam", true), "ho chi min city": city("Vietnam", true),
  "da nang": city("Vietnam", true), "siem reap": city("Cambodia", true),
  "metro manila": city("Philippines", true), "makati": city("Philippines", true),
  "cebu": city("Philippines", true), "cebu city": city("Philippines", true),
  "quezon city": city("Philippines", true), "mandaluyong city": city("Philippines", true),
  "antipolo city": city("Philippines", true), "cainta": city("Philippines", true),
  "taytay": city("Philippines", true), "silang": city("Philippines", true),
  "bacolod": city("Philippines", true), "cagayan de oro city": city("Philippines", true),
  "manolo fortich bukidnon": city("Philippines", true), "mandaue": city("Philippines", true),
  "kuala lumpur": city("Malaysia", true), "petaling jaya": city("Malaysia", true),
  "johor bahru": city("Malaysia", true), "johorbahru": city("Malaysia", true),
  "kota kinabalu": city("Malaysia", true), "iskandar puteri": city("Malaysia", true),
  "cyberjaya": city("Malaysia", true), "seri kembangan selangor": city("Malaysia", true),
  "selangor": city("Malaysia", true), "pontian": city("Malaysia", true),
  "jakarta": city("Indonesia", true), "bekasi": city("Indonesia", true),
  "semarang": city("Indonesia", true), "surabaya": city("Indonesia", true),
  "central java": city("Indonesia", true),
  /* ── Índia / Médio Oriente ── */
  "new delhi": city("India", true), "north delhi": city("India", true), "noida": city("India", true),
  "gurgaon": city("India", true), "jaipur": city("India", true), "chandigarh": city("India", true),
  "panchkula": city("India", true), "ludhiana": city("India", true), "mohali": city("India", true),
  "kolkata": city("India", true), "ahmedabad": city("India", true), "bhubaneswar": city("India", true),
  "dubai": city("United Arab Emirates", true), "abu dhabi": city("United Arab Emirates", true),
  /* ── Oceânia ── */
  "auckland": city("New Zealand", true), "wellington": city("New Zealand", false),
  "christchurch": city("New Zealand", true), "queenstown": city("New Zealand", true),
  "rangiora": city("New Zealand", true), "clarks beach": city("New Zealand", true),
  "northshore": city("New Zealand", true),
  "sydney": city("Australia", true), "melbourne": city("Australia", false),
  "perth": city("Australia", false), "adelaide": city("Australia", true),
  "brisbane city qld 4000": city("Australia", true), "brisbane city qld": city("Australia", true),
  "brisbane": city("Australia", true), "gold coast": city("Australia", true),
  "gold coast australia": city("Australia", true), "caloundra": city("Australia", true),
  "camberwell victoria": city("Australia", true), "point cook victoria": city("Australia", true),
  "camberwell": city("Australia", false), "point cook": city("Australia", true),
  "south perth": city("Australia", true), "tallai": city("Australia", true),
  "helensvale": city("Australia", true), "brookwater": city("Australia", true),
  "vaucluse": city("Australia", true), "rarotonga": city("Cook Islands", true),
  "dededo": city("Guam", true), "tamuning": city("Guam", true), "yona": city("Guam", true),
  "saipan": city("Northern Mariana Islands", true),
  /* ── México ── */
  "mexico city": city("Mexico", true), "ciudad de mexico": city("Mexico", true),
  "guadalajara": city("Mexico", true), "monterrey": city("Mexico", true), "morelia": city("Mexico", true),
  "merida": city("Mexico", true), "cancun": city("Mexico", true), "torreon": city("Mexico", true),
  "zapopan": city("Mexico", true), "celaya": city("Mexico", true), "colima": city("Mexico", true),
  "culiacan": city("Mexico", true), "chihuahua": city("Mexico", true), "durango": city("Mexico", true),
  "saltillo": city("Mexico", true), "saltillo mexico": city("Mexico", true),
  "tijuana": city("Mexico", true), "mexicali": city("Mexico", true), "hermosillo": city("Mexico", true),
  "queretaro": city("Mexico", true), "corregidora": city("Mexico", true), "cuajimalpa": city("Mexico", true),
  "aguascalientes": city("Mexico", true), "gomez palacio": city("Mexico", true),
  "obregon": city("Mexico", true), "lerma": city("Mexico", true), "calimaya": city("Mexico", true),
  "emiliano zapata": city("Mexico", true), "san andres cholula": city("Mexico", true),
  "ciudad del carmen": city("Mexico", true), "cd. victoria": city("Mexico", true),
  "ciudad victoria": city("Mexico", true), "coatzacoalcos": city("Mexico", true),
  "veracruz": city("Mexico", true), "xalapa": city("Mexico", true), "altamira": city("Mexico", true),
  "monclova": city("Mexico", true), "san luis potosi": city("Mexico", true),
  "durango,dgo": city("Mexico", true), "tampico": city("Mexico", true),
  /* ── Europa ── */
  "london": city("United Kingdom", false), "cambridge": city("United Kingdom", false),
  "northampton": city("United Kingdom", false), "solihull": city("United Kingdom", true),
  "loughborough": city("United Kingdom", true), "burnley": city("United Kingdom", true),
  "abingdon": city("United Kingdom", true), "walton-on-thames": city("United Kingdom", true),
  "tredegar": city("United Kingdom", true), "cowfold": city("United Kingdom", true),
  "loxwood": city("United Kingdom", true), "welwyn": city("United Kingdom", true),
  "berlin": city("Germany", false), "prague": city("Czech Republic", true),
  "praha": city("Czech Republic", true), "nowa iwiczna": city("Poland", true),
  "liepaja": city("Latvia", true), "linz": city("Austria", true),
  /* ── América Latina / África ── */
  "panama city": city("Panama", false), "cali": city("Colombia", true),
  "bogota": city("Colombia", true), "cajica": city("Colombia", true),
  "currridabat": city("Costa Rica", true), "curridabat": city("Costa Rica", true),
  "antiguo cuscatlan": city("El Salvador", true), "santa cruz": city("Bolivia", false),
  "harare": city("Zimbabwe", true), "cap cana": city("Dominican Republic", true),
  /* ── Canadá (cidades sem província no campo) ── */
  "halifax": city("Canada", false), "vancouver": city("Canada", false),
}));

/**
 * @param {string} raw  string do campo "país" do perfil BlueGolf
 * @returns {{ gradYear: number|null, country: string, hometown: string }}
 */
function splitGradYearCountry(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return { gradYear: null, country: "", hometown: "" };

  let gradYear = null;
  let rest = s;
  const ym = /^(\d{4})\s*,\s*(.*)$/.exec(s);
  if (ym) { gradYear = +ym[1]; rest = ym[2].trim(); }
  else if (/^\d{4}$/.test(s)) { gradYear = +s; rest = ""; }

  // Ano de graduação repetido no fim ("Calgary, AB 2027") — lixo do formulário.
  rest = rest.replace(/\s+\d{4}\s*$/, "").trim();

  // Sigla de estado/província no fim ("…, CA" ou "Burlington WA").
  const tail = /[,\s]\s*([A-Za-z]{2})\s*$/.exec(rest);
  const ab = tail ? tail[1].toUpperCase() : "";
  const territory = US_TERRITORIES.get(ab) || "";
  const stateCountry = territory || (US_STATES.has(ab) ? "United States" : CA_PROV.has(ab) ? "Canada" : "");
  // Localidade sem a sigla de estado (é dela que se tira a cidade).
  const place = stateCountry ? rest.slice(0, tail.index).trim().replace(/,$/, "") : rest;

  // (a) Um dos segmentos É um país → ganha sempre.
  const segs = place.split(/[,\-–]/).map((x) => norm(x)).filter(Boolean);
  let country = "";
  for (const seg of segs) {
    const c = COUNTRY_SEGMENTS.get(seg);
    if (c) { country = c; break; }
  }

  // (a2) País colado no fim sem vírgula ("Cap Cana Dominican Republic"). Só sem
  //      sigla de estado — senão "La Canada, CA" (Califórnia) virava Canadá.
  if (!country && !stateCountry) {
    const p = norm(place);
    for (const [seg, c] of COUNTRY_SEGMENTS) {
      if (seg.length >= 5 && p.endsWith(" " + seg)) { country = c; break; }
    }
  }

  // (b) Cidade conhecida. `strong` ganha à sigla de estado (o "Bangkok, CA" da
  //     inscrição); as ambíguas só valem quando não há sigla.
  if (!country) {
    const hit = CITY_COUNTRY.get(norm(place)) || CITY_COUNTRY.get(segs[0]);
    if (hit && (hit.strong || !stateCountry)) country = hit.country;
  }

  // (c) Sigla de estado → EUA/Canadá. (d) Senão fica a própria string.
  if (!country) country = stateCountry || rest;

  // Quando o país resolvido não é EUA/Canadá, a sigla de estado era lixo do
  // formulário → não a arrastar para o texto mostrado na coluna País.
  const hometown = country === "United States" || country === "Canada" ? rest : place;
  return { gradYear, country, hometown };
}

module.exports = { splitGradYearCountry, US_STATES, CA_PROV, CITY_COUNTRY, COUNTRY_SEGMENTS };
