/**
 * src/utils/flagUtils.ts
 *
 * Mapa centralizado de bandeiras por país.
 * Aceita código ISO-2, nome em inglês ou nome em português.
 *
 * Exporta:
 *   FLAG        — Record<código ISO-2, emoji>
 *   FL          — Record<nome EN ou PT, emoji>  (compatibilidade com páginas existentes)
 *   flag(p)     — converte qualquer formato para emoji (código, nome EN, nome PT)
 */

export const FLAG: Record<string, string> = {
  PT:"🇵🇹",GB:"🇬🇧",IE:"🇮🇪",FR:"🇫🇷",ES:"🇪🇸",DE:"🇩🇪",IT:"🇮🇹",
  NL:"🇳🇱",SE:"🇸🇪",NO:"🇳🇴",DK:"🇩🇰",FI:"🇫🇮",US:"🇺🇸",CA:"🇨🇦",
  AU:"🇦🇺",ZA:"🇿🇦",MX:"🇲🇽",JP:"🇯🇵",KR:"🇰🇷",CH:"🇨🇭",CN:"🇨🇳",
  IN:"🇮🇳",BR:"🇧🇷",AR:"🇦🇷",BE:"🇧🇪",PL:"🇵🇱",SK:"🇸🇰",HU:"🇭🇺",
  RU:"🇷🇺",PH:"🇵🇭",SG:"🇸🇬",CZ:"🇨🇿",
  TH:"🇹🇭",RO:"🇷🇴",UA:"🇺🇦",SI:"🇸🇮",BG:"🇧🇬",LT:"🇱🇹",LV:"🇱🇻",
  EE:"🇪🇪",TR:"🇹🇷",MA:"🇲🇦",AE:"🇦🇪",KZ:"🇰🇿",VN:"🇻🇳",AT:"🇦🇹",
  PY:"🇵🇾",NG:"🇳🇬",OM:"🇴🇲",PR:"🇵🇷",CR:"🇨🇷",JE:"🇯🇪",CY:"🇨🇾",
  LB:"🇱🇧",ID:"🇮🇩",HK:"🇭🇰",TW:"🇹🇼",NZ:"🇳🇿",AM:"🇦🇲",CO:"🇨🇴",
  CL:"🇨🇱",BB:"🇧🇧",BS:"🇧🇸",BO:"🇧🇴",DO:"🇩🇴",DZ:"🇩🇿",EC:"🇪🇨",
  GT:"🇬🇹",HN:"🇭🇳",KE:"🇰🇪",KH:"🇰🇭",NI:"🇳🇮",PA:"🇵🇦",PE:"🇵🇪",
  SV:"🇸🇻",UG:"🇺🇬",UY:"🇺🇾",VE:"🇻🇪",GR:"🇬🇷",IL:"🇮🇱",HR:"🇭🇷",
  RS:"🇷🇸",LU:"🇱🇺",IS:"🇮🇸",MY:"🇲🇾",SC:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  // Aliases e variantes (dados USKids)
  UK:"🇬🇧",    // alias de GB
  // Países adicionais encontrados nos torneios completos
  AZ:"🇦🇿",BA:"🇧🇦",BM:"🇧🇲",CD:"🇨🇩",CU:"🇨🇺",
  JO:"🇯🇴",MC:"🇲🇨",MT:"🇲🇹",QA:"🇶🇦",RE:"🇷🇪",
  TN:"🇹🇳",ZM:"🇿🇲",ZW:"🇿🇼",NN:"🏳️",XX:"🏳️",
  AL:"🇦🇱", ME:"🇲🇪",   // Albânia, Montenegro
  // Países adicionais encontrados em federados.json (FPG)
  MZ:"🇲🇿",  // Moçambique
  SZ:"🇸🇿",  // Eswatini (Suazilândia)
  GD:"🇬🇩",  // Granada
  NP:"🇳🇵",  // Nepal
  BY:"🇧🇾",  // Bielorrússia
  AO:"🇦🇴",  // Angola
  DM:"🇩🇲",  // Dominica
  KG:"🇰🇬",  // Quirguistão
  MD:"🇲🇩",  // Moldávia
  MO:"🇲🇴",  // Macau
  MU:"🇲🇺",  // Maurícias
  TT:"🇹🇹",  // Trindade e Tobago
  BJ:"🇧🇯",  // Benim
  ET:"🇪🇹",  // Etiópia
  BT:"🇧🇹",  // Butão
  GE:"🇬🇪",  // Geórgia
  CV:"🇨🇻",  // Cabo Verde
  GW:"🇬🇼",  // Guiné-Bissau
  TL:"🇹🇱",  // Timor-Leste
  ST:"🇸🇹",  // São Tomé e Príncipe
  // Prefixos internos FPG (apátridas/desconhecidos)
  "@1":"🏴","@2":"🏴","@3":"🏴","@4":"🏴",
};

/** Mapa nome → código ISO-2 (inglês e português) */
const COUNTRY_TO_CODE: Record<string, string> = {
  // English
  portugal:"pt",england:"gb",spain:"es",france:"fr",germany:"de",italy:"it",
  netherlands:"nl",sweden:"se",norway:"no",denmark:"dk",finland:"fi",
  "united states":"us",canada:"ca",australia:"au","south africa":"za",mexico:"mx",
  japan:"jp","south korea":"kr",switzerland:"ch",china:"cn",india:"in",
  brazil:"br",argentina:"ar",belgium:"be",poland:"pl",slovakia:"sk",hungary:"hu",
  "russian federation":"ru",russia:"ru",philippines:"ph",singapore:"sg",
  "czech republic":"cz",ireland:"ie","great britain":"gb","united kingdom":"gb",
  wales:"gb",scotland:"gb","northern ireland":"gb",colombia:"co",chile:"cl",
  thailand:"th",romania:"ro",ukraine:"ua",slovenia:"si",bulgaria:"bg",
  lithuania:"lt",latvia:"lv",estonia:"ee",turkey:"tr",morocco:"ma",
  "united arab emirates":"ae",kazakhstan:"kz","viet nam":"vn",vietnam:"vn",
  austria:"at",paraguay:"py",nigeria:"ng",oman:"om","puerto rico":"pr",
  "costa rica":"cr",jersey:"je",cyprus:"cy",lebanon:"lb",indonesia:"id",
  "hong kong":"hk",taiwan:"tw","new zealand":"nz",armenia:"am",
  barbados:"bb",bahamas:"bs",bolivia:"bo","dominican republic":"do",
  algeria:"dz",ecuador:"ec",guatemala:"gt",honduras:"hn",kenya:"ke",
  cambodia:"kh",nicaragua:"ni",panama:"pa",peru:"pe","el salvador":"sv",
  uganda:"ug",uruguay:"uy",venezuela:"ve",greece:"gr",israel:"il",
  croatia:"hr",serbia:"rs",luxembourg:"lu",iceland:"is",malaysia:"my",
  // Português
  espanha:"es",frança:"fr",alemanha:"de",itália:"it","países baixos":"nl",
  holanda:"nl",suécia:"se",noruega:"no",dinamarca:"dk",finlândia:"fi",
  "estados unidos":"us",canadá:"ca",austrália:"au","áfrica do sul":"za",
  méxico:"mx",japão:"jp","coreia do sul":"kr",suíça:"ch",índia:"in",
  brasil:"br",bélgica:"be",polónia:"pl",eslováquia:"sk",hungria:"hu",
  "federação russa":"ru",rússia:"ru",filipinas:"ph",singapura:"sg",
  "república checa":"cz",irlanda:"ie","reino unido":"gb",
  inglaterra:"gb",escócia:"gb","irlanda do norte":"gb",gales:"gb",
  colômbia:"co",tailândia:"th",roménia:"ro",ucrânia:"ua",
  eslovénia:"si",bulgária:"bg",lituânia:"lt",letónia:"lv",
  estónia:"ee",turquia:"tr",marrocos:"ma",
  "emirados árabes unidos":"ae",cazaquistão:"kz",vietname:"vn",
  áustria:"at",paraguai:"py",nigéria:"ng",omã:"om","porto rico":"pr",
  chipre:"cy",líbano:"lb",indonésia:"id","nova zelândia":"nz",arménia:"am",
  bolívia:"bo","república dominicana":"do",argélia:"dz",equador:"ec",
  quénia:"ke",camboja:"kh",nicarágua:"ni",panamá:"pa",uruguai:"uy",
  grécia:"gr",croácia:"hr",sérvia:"rs",luxemburgo:"lu",islândia:"is",malásia:"my",
};

/** Aliases de código curto → ISO-2 canónico.
 *  Inclui códigos IOC/FPG de 3 letras (NOR, BRA, USA, …) usados em dados FPG. */
const CODE_ALIAS: Record<string, string> = {
  uk:"gb", phl:"ph", "gb-nir":"gb", "gb-wls":"gb", "gb-sct":"gb",
  // IOC / 3-letter codes usados nos ficheiros FPG
  nor:"no", den:"dk", bel:"be", ukr:"ua", rus:"ru", usa:"us",
  can:"ca", mex:"mx", bra:"br", aus:"au", jap:"jp", chn:"cn",
  ind:"in", tha:"th", sgp:"sg", kor:"kr", twn:"tw", mys:"my",
  vie:"vn", arg:"ar", chl:"cl", pol:"pl", cze:"cz", aut:"at",
  por:"pt", esp:"es", fra:"fr", ale:"de", ita:"it", rum:"ro",
  hun:"hu", srb:"rs", bul:"bg", ltu:"lt", est:"ee", svk:"sk",
  svn:"si", hrv:"hr", mne:"me", bih:"ba", alb:"al", mac:"ma",
  tun:"tn", geo:"ge", arm:"am", aze:"az", tur:"tr", isl:"is",
  irl:"ie", fin:"fi", eng:"gb", sct:"gb", wls:"gb", nir:"gb",
};

/** Normaliza país para código ISO-2 */
export function normCountry(raw: string): string {
  if (!raw) return "";
  const lower = raw.toLowerCase().trim();
  if (CODE_ALIAS[lower]) return CODE_ALIAS[lower];
  if (lower.length === 2) return lower;
  return COUNTRY_TO_CODE[lower] || lower;
}

/** Mapa ISO-2 → nome canónico para display */
const CODE_TO_DISPLAY: Record<string, string> = {
  pt:"Portugal", gb:"United Kingdom", ie:"Ireland", fr:"France", es:"Spain",
  de:"Germany", it:"Italy", nl:"Netherlands", se:"Sweden", no:"Norway",
  dk:"Denmark", fi:"Finland", us:"United States", ca:"Canada", au:"Australia",
  za:"South Africa", mx:"Mexico", jp:"Japan", kr:"South Korea", ch:"Switzerland",
  cn:"China", in:"India", br:"Brazil", ar:"Argentina", be:"Belgium", pl:"Poland",
  sk:"Slovakia", hu:"Hungary", ru:"Russia", ph:"Philippines", sg:"Singapore",
  cz:"Czech Republic", th:"Thailand", ro:"Romania", ua:"Ukraine", si:"Slovenia",
  bg:"Bulgaria", lt:"Lithuania", lv:"Latvia", ee:"Estonia", tr:"Turkey",
  ma:"Morocco", ae:"UAE", kz:"Kazakhstan", vn:"Vietnam", at:"Austria",
  py:"Paraguay", ng:"Nigeria", om:"Oman", pr:"Puerto Rico", cr:"Costa Rica",
  je:"Jersey", cy:"Cyprus", lb:"Lebanon", id:"Indonesia", hk:"Hong Kong",
  tw:"Taiwan", nz:"New Zealand", am:"Armenia", co:"Colombia", cl:"Chile",
  bb:"Barbados", bs:"Bahamas", bo:"Bolivia", do:"Dominican Rep.",
  dz:"Algeria", ec:"Ecuador", gt:"Guatemala", hn:"Honduras", ke:"Kenya",
  kh:"Cambodia", ni:"Nicaragua", pa:"Panama", pe:"Peru", sv:"El Salvador",
  ug:"Uganda", uy:"Uruguay", ve:"Venezuela", gr:"Greece", il:"Israel",
  hr:"Croatia", rs:"Serbia", lu:"Luxembourg", is:"Iceland", my:"Malaysia",
  sc:"Scotland",
};

/** Converte qualquer formato de país para nome canónico de display.
 *  "US" → "United States", "Russian Federation" → "Russia", "england" → "United Kingdom" */
export function normPaisDisplay(raw: string): string {
  if (!raw) return "";
  const code = normCountry(raw); // → "us", "ru", "gb", etc.
  if (code.length === 2) return CODE_TO_DISPLAY[code] ?? raw;
  // normCountry didn't resolve → devolve o original capitalizado
  return raw.trim();
}

/** Converte qualquer formato de país para emoji de bandeira.
 *  Aceita código ISO-2 ("PT"), nome EN ("Portugal"), nome PT ("Portugal") */
export function flag(p: string): string {
  if (!p) return "🏳️";
  const upper = p.trim().toUpperCase();
  if (FLAG[upper]) return FLAG[upper];
  const code = normCountry(p).toUpperCase();
  if (FLAG[code]) return FLAG[code];
  return "🏳️";
}

/** Title-case: "united states" → "United States" */
function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

/** Mapa nome completo EN/PT → emoji (compatibilidade com páginas que usam FL[p.country]) */
export const FL: Record<string, string> = Object.fromEntries(
  Object.entries({ ...COUNTRY_TO_CODE }).flatMap(([name, code]) => {
    const emoji = FLAG[code.toUpperCase()] ?? "🏳️";
    const titleKey = toTitleCase(name);
    // Also add exact original (e.g. "viet nam" → "Viet nam" may appear in old data)
    const firstCapKey = name.charAt(0).toUpperCase() + name.slice(1);
    return titleKey === firstCapKey
      ? [[titleKey, emoji]]
      : [[titleKey, emoji], [firstCapKey, emoji]];
  })
);

/** Shorthand: obtém emoji de bandeira a partir de nome de país (EN ou PT) */
export function gf(country: string): string {
  return FL[country] ?? flag(country);
}
