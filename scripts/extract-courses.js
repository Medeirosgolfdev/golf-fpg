#!/usr/bin/env node
/**
 * extract-courses.js
 *
 * Percorre output/<fed>/scorecards/*.json e extrai campos unicos.
 * Compara com master-courses.json para separar PT de internacionais.
 * Gera public/data/away-courses.json para o React consumir.
 *
 * Também guarda a lista de jogadores (nfed) que jogaram em cada campo,
 * para o merge-courses.js poder mostrar quem jogou lá ao decidir merges.
 *
 * Uso:
 *   node scripts/extract-courses.js
 */

const fs   = require("fs");
const path = require("path");

function readJSON(fpath) {
  let txt = fs.readFileSync(fpath, "utf-8");
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
  return JSON.parse(txt);
}

const outputRoot    = path.join(process.cwd(), "output");
const masterPath    = path.join(process.cwd(), "public", "data", "master-courses.json");
const melhoriasPath = path.join(process.cwd(), "melhorias.json");
const aliasPath     = path.join(process.cwd(), "course-aliases.json");
const outPath       = path.join(process.cwd(), "public", "data", "away-courses.json");

/* ── Helpers ── */

function norm(s) {
  return String(s || "").trim().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function toCourseKey(name) {
  return `away-${norm(name).replace(/\s+/g, "-")}`;
}

function toNum(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = Number(v); return isNaN(n) ? null : n; }
  return null;
}

/* ── 1. Master-courses PT ── */

const masterNames = new Set();
if (fs.existsSync(masterPath)) {
  try {
    const master = readJSON(masterPath);
    for (const c of (master.courses || []))
      masterNames.add(norm(c.master?.name || ""));
    console.log(`  Master: ${masterNames.size} campos PT carregados`);
  } catch (e) { console.warn("  Aviso master-courses:", e.message); }
}

/* ── 2. Listas estáticas embutidas ── */

/**
 * PT_VARIANTS — nomes que a federação usa nos scorecards que correspondem
 * a campos PT do master-courses.json. São excluídos dos away-courses.
 *
 * Formato: "norm do scorecard" → "norm do master" (ou "" para excluir sem mapear)
 * Adicionar aqui sempre que apareça um campo PT nos aways.
 */
const PT_VARIANTS_STATIC = {
  // Aroeira
  "aroeira i":                         "pga aroeira no 1",
  "aroeira pines classic":             "pga aroeira no 1",
  "aroeira ii":                        "pga aroeira no 2",
  "aroeira challenge":                 "pga aroeira no 2",
  // Ribagolfe
  "ribagolfe i":                       "ribagolfe lakes",
  "ribagolfe ii":                      "ribagolfe oaks",
  // Montebelo
  "montebelo":                         "montebelo caramulo 1 18",
  "montebelo a b":                     "montebelo caramulo 1 18",
  // Vila Sol
  "vila sol prime challenge":          "vila sol prime challenge 1 18",
  "vila sol 1 prime challenge":        "vila sol prime challenge 1 18",
  "vila sol challenge prestige":       "vila sol challenge prestige 10 27",
  "vila sol prestige prime":           "vila sol prestige prime 19 9",
  // Oitavos
  "oitavos":                           "oitavos dunes",
  "oitavos dunes natural links":       "oitavos dunes",
  // Vilamoura
  "vilamoura the old course":          "vilamoura old course",
  // Troia
  "troia":                             "troia golf",
  "6troia golf":                       "troia golf",
  // Penha Longa
  "penha longa atlantico":             "penha longa atlantic championship",
  // Pinheiros Altos (combinações não estão no master → excluir, serão processadas como PT)
  "pinheiros altos":                   "",
  "pinheiros altos oliveiras pinheiros": "",
  "pinheiros altos pinheiros sobreiros": "",
  // Morgado / Álamos (nomes alternativos da federação)
  "golfe do morgado":                  "morgado golf",
  "morgado do reguengo golfe":         "morgado golf",
  "golfe dos alamos":                  "alamos golf",
  // Oceânico (nomes antigos)
  "oceanico faldo":                    "faldo course",
  "oceanico o connor":                 "o connor jnr course",
  // Palmares genérico (ambíguo — excluir; as combinações específicas ficam no master)
  "palmares golf":                     "",
  // Porto Santo
  "porto santo":                       "porto santo golfe",
  // Paredes
  "paredes turistico":                 "paredes aqueduto",
  // Vidago
  "vidago palace golf":                "vidago palace",
  // Santo Estevão
  "santo estevao":                     "santo estevao golf",
  // Castro Marim (a federação usa ordem diferente de letras)
  "castro marim grouse atlantico":     "castro marim atlantico grouse",
  // Campos que não têm entrada exacta no master mas são PT
  "lisbon":                            "lisbon sports club",
  "rilhadas1":                         "rilhadas",
  "6troia golf":                       "troia golf",
};

/**
 * INVALID_NAMES — entradas que não são campos de golfe: torneios, campeonatos,
 * federações, nomes genéricos. Excluídas completamente do away-courses.
 */
const INVALID_NAMES_STATIC = new Set([
  "none","n a","n a","null","undefined","unknown","internacional","lisbon",
  // Torneios / Competições
  "campeonato abierto de madrid femenino 2024",
  "campeonato absoluto aberto ciudad de leon",
  "campeonato andalucia",
  "campeonato andalucia individuales almerimar",
  "campeonato de galicia sub 14",
  "campeonato internacional de espana sub18 masculino",
  "circuito infantil sevilha",
  "copa de andalucia femenina",
  "copa de andalucia masculina",
  "day 3 copa de andalucia femenina",
  "day 1 copa de andalucia femenina",
  "day 2 copa de andalucia femenina",
  "day 1 copa de andalucia masculina",
  "day 2 copa de andalucia masculina",
  "day 3 copa de andalucia masculina",
  "copa r c g sotogrande club de golf sotogrande",
  "copa r c g sotogrande",
  "campeonato andalucia sub 18",
  "campeonato andalucia sub 16",
  "campeonato andalucia sub 14",
  "campeonato andalucia absoluto",
  "copa sm lareina reserva de sotogrande",
  "super bock ladies open at vidago palace",
  "terre dei consoli golf club",
  "lyme regis golf club girls open",
  "copa s m el rey 2024 alcanada",
  "1 puntuable zonal de galicia asturias 2024",
  "ii prueba liga juvenvil galega",
  "iiii prueba liga juvenvil galega",
  "2023 european boys team championship div 2",
  "2024 european young masters",
  "2025 european ladies team championship",
  "american junior golf association",
  "belgian international golf championship boys gir",
  "belgian international golf championship for boys",
  "english girls under 16 14 open amateur championshi",
  "european boys team championship 2021",
  "european girls team championship 2021",
  "european young masters",
  "gadget golf trophy",
  "internacional de franca sub 14",
  "internationaux de france u14 challenge alexis go",
  "junior cup 12 17 ans",
  "open amateur champioship 2018",
  "open championship scottish girls u16 loretto 2018",
  "open drive golf de toulouse seilh",
  "portustewart golf cup",
  "south carolina golf association",
  "st andrews links trophy 2025",
  "1 puntuable zonal de galicia asturias 2024",
  "salamanca open",
  "gadget golf trophy",
  // Nomes demasiado genéricos / inválidos
  "internacional",
  "oporto par 3",
]);

/**
 * AWAY_ALIASES_STATIC — duplicados e variantes de campos internacionais.
 * Formato: "norm da variante" → "norm do canónico"
 * Adicionado aqui para não depender do merge-courses.js interactivo para casos óbvios.
 */
const AWAY_ALIASES_STATIC = {
  // Eden Course St Andrews
  "eden course st andrews escocia":          "eden course st andrews",
  // Chantilly (já em course-aliases mas garantimos aqui)
  "golf de chantillyn parcours de vineul franca": "golf de chantilly parcours de vineul",
  "golf de chantilly france":                "golf de chantilly parcours de vineul",
  // Evian
  "evian resort golf club franca":           "evian resort golf club",
  "evian resort golf club france":           "evian resort golf club",
  "evian resort golf cup":                   "evian resort golf club",
  "the evian resort golf club":              "evian resort golf club",
  "amundi evian juniors cup r1":             "evian resort golf club",
  "amundi evian juniors cup r2":             "evian resort golf club",
  "amundi evian juniors cup r3":             "evian resort golf club",
  "the amundi evian juniors cup":            "evian resort golf club",
  // Krakow
  "krakow valley golf country club poland":  "krakow valley golf country club",
  "krakow valley golf":                      "krakow valley golf country club",
  // Royal St George's
  "the royal st george s gc":                "royal st george s reino unido",
  "george golf club africa do sul":          "royal st george s reino unido",
  // Guadalhorce
  "guadalhorce":                             "real guadalhorce club de golf",
  "real guadalhorce club de golf espanha":   "real guadalhorce club de golf",
  // Sevilla
  "real club sevilla golf":                  "r c g sevilla",
  "real sevilla":                            "r c g sevilla",
  // Parador El Saler
  "parador campo de golf el saler":          "parador el saler",
  "el saler valencia":                       "parador el saler",
  // Oslo
  "oslo golf klubb":                         "oslo golf club",
  // Sugarloaf
  "sugargolf golf club":                     "sugarloaf golf club",
  // Vierumakki
  "vierumaki golf club":                     "vierumakki",
  "vierumakki golf course cookie course":    "vierumakki",
  "vierumakki golf course cooke course":     "vierumakki",
  // Venice
  "venice open":                             "venice junior open frassanele golf club",
  // St Leon Rot (Alemanha — múltiplos nomes para o mesmo complexo)
  "rot":                                     "gc st leon rot",
  "rot alemanha":                            "gc st leon rot",
  "cg rot":                                  "gc st leon rot",
  "cg st leon rot":                          "gc st leon rot",
  "platz rot":                               "gc st leon rot",
  "platz st leon":                           "gc st leon rot",
  "platz st plotz":                          "gc st leon rot",
  "st leon":                                 "gc st leon rot",
  "st leon rot":                             "gc st leon rot",
  "sankt leon":                              "gc st leon rot",
  // Royal Waterloo
  "albert vermeiren trophy royal waterloo g c": "royal waterloo golf club",
  "royal waterloo gc":                       "royal waterloo golf club",
  "royal waterloo golf club alemanha belgian inte": "royal waterloo golf club",
  // Royals Belgica
  "royal golf club belgique":                "royal golf club of belgium",
  "rwgc la marache":                         "royal golf club of belgium",
  // Val de Rois
  "val de rois club":                        "val de rois",
  "clube val de rois":                       "val de rois",
  "club de golf val de rois":               "val de rois",
  // Isla Canela
  "isla canela club de golf":                "isla canela golf",
  "isla canela":                             "isla canela golf",
  // Sotogrande
  "real club de sotogrande":                 "club de golf sotogrande cadiz",
  "copa sm lareina reserva de sotogrande":   "reserva de sotogrande",
  // Sancti Petri
  "sancti petri":                            "real novo sancti petri golf club mar e pinos",
  "real novo sancti petri golf club":        "real novo sancti petri golf club mar e pinos",
  "real novo sancti petri mar y pinos":      "real novo sancti petri golf club mar e pinos",
  // Roveri
  "royal park golf country club i roveri ssda r l": "royal park golf country club i roveri ssd a r l",
  "royal park golf country club i roveri":   "royal park golf country club i roveri ssd a r l",
  "royal park roveri italy":                 "royal park golf country club i roveri ssd a r l",
  "royal park roveri italy r2":              "royal park golf country club i roveri ssd a r l",
  "roveri italy":                            "royal park golf country club i roveri ssd a r l",
  // Newmachar
  "newmachar golf club the hawkshill course": "newmachar hawkshill",
  // Sand Creek
  "sand creek station golf course":          "sand creek station",
  "sand creek station golf course newton":   "sand creek station",
  "sand creek station golf course newton":   "sand creek station",
  // Sherry Jerez
  "sherry jerez":                            "isherry golf jerez",
  "sherry golf jerez":                       "isherry golf jerez",
  // Killarney
  "killarney golf fishing club":             "killarney g fc killeen course",
  "killarney golf fishing club ireland":     "killarney g fc killeen course",
  // Fontanals
  "fontanals espanha":                       "fontanals",
  // Penati
  "penati golf resort legend course slovakia r1": "penati golf resort",
  "penati golf resort legend course slovakia r2": "penati golf resort",
  "penati golf resort legend course slovakia r3": "penati golf resort",
  // Borsa vs Green Resort (Hruba Borsa é a localidade, campos diferentes — não fundir)
  // Cognizant
  "cognizant cup d1":                        "cognizant cup finnish international junior champ",
  "cognizant cup d2":                        "cognizant cup finnish international junior champ",
  "cognizant cup d3":                        "cognizant cup finnish international junior champ",
  // Naples
  "naples national gc 19 tci rd2":           "naples national gc 19 tci rd1",
  "naples national gc 19 tci rd3":           "naples national gc 19 tci rd1",
  // Scandinavian
  "the scandinavian new course denamark":    "the scandinavian new course",
  // Biltmore
  "biltmore golf course job boys":           "biltmore golf course",
  "biltmore golf course job girls":          "biltmore golf course",
  // Santander
  "golf santander boadilha del monte":       "santander golf",
  "golf santander bocadilha del monte":      "santander golf",
  // Saunton (East e West são campos diferentes — não fundir)
  "sounton west":                            "saunton west",
  // Chantilly sub-variants
  "golf chantilly":                          "golf de chantilly parcours de vineul",
  "chantilly golf club":                     "golf de chantilly parcours de vineul",
  "golf de chantilly":                       "golf de chantilly parcours de vineul",
  "chantilly":                               "golf de chantilly parcours de vineul",
  "golf de chantilly parcours de vineul":    "golf de chantilly parcours de vineul",
  // Paradiso del Garda
  "paradiso new":                            "club paradiso del garda",
  "golf club paradiso del garda":            "club paradiso del garda",
  // Elgin
  "eigin golf club":                         "elgin golf club",
  // Elgin — a federação por vezes usa só "Elgin" sem "Golf Club"
  "elgin":                                   "elgin golf club",
  // Golf Della Montecchia — variante sem "Club" e com sub-curso
  "golf della montecchia white red":         "golf club della montecchia",
  "golf della montecchia":                   "golf club della montecchia",
  // Las Colinas
  "las colinas mission resort":              "las colinas",
  // Montealegre
  "real montealegre":                        "montealegre",
  "real montealegre club de golf":           "montealegre",
  // La Canada
  "la canada cadiz espanha":                 "club de golf la canada",
  "clube de golf la canada":                 "club de golf la canada",
  // Montanya
  "clube de golf montanya":                  "club de golf montanya",
  // Villa Padierna Flamingos
  "villa padierna flamingos":                "villa padierna flamingos espanha",
  // Hato Verde
  "club de golf hato verde":                 "hato verde",
  // St Germain
  "golf st germain":                         "golf de st germain",
  // Real Prat
  "real club golf el prat":                  "real club de golf el prat",
  // Hestkobgard
  "hestkobgard dk":                          "hestkobgard",
  // Garden City
  "garden city cg":                         "garden city cc",
  // Kymen Golf
  "kymen golf kotka golf center 56":         "kymen golf",
  // Crooked Cat — garantir que variante com espaço extra também colapsa
  "crooked cat orange county national golf center":  "crooked cat",
  "crooked cat orange county national golf center &": "crooked cat",
  // Panther Lake
  "panther lake orange county national golf center": "panther lake",
  // Lyme Regis
  "lyme regis girls under 16 and under 14 open amateu": "lyme regis golf club",
  // Club Golf Ria de Vigo
  "club golf ria de vigo":                   "ria de vigo",
  // Golf Medoc
  "golf du medoc":                           "golf du medoc resort france",
  // Golf Kaskada
  "golf resort kaskada jean louis dupont trophy":    "golf resort kaskada",
  "jean louis dupont trophy no golf resort kaskada": "golf resort kaskada",
  // Frankfurter
  "frankfurter golf club germany":           "frankfurter golf club",
  // Cabot Bordeaux
  "cabot bordeaux les chateaux france":      "cabot bordeaux",
  // County Louth
  "county louth golf club irlanda":          "county louth irlanda",
  // Daily Mail World Junior — realizado em Villa Padierna (Flamingos), Espanha
  "daily mail world":                              "villa padierna flamingos espanha",
  "daily mail world junior golf championship d2":  "villa padierna flamingos espanha",
  "daily mail world junior golf championship d3":  "villa padierna flamingos espanha",
  // Norba
  "norba club caceres":                      "norba club de golf",
  // Talayuela
  "talayuela golf espanha":                  "talayuela golf",
  // La Monacilla
  "la monacilla golf club":                  "la monacilla",
  // Sedin
  "sedin golf resort slovakia":              "sedin golf club eslovaquia",
  // Innisbrook
  "innisbrook resort and golf club island course b":  "innisbrook resort golf club island course",
  // Marco Simone — a federação usa nome completo, extraCourses.ts usa "away-marco-simone"
  "marco simone golf country club":          "marco simone",
};

/* ── 2b. Aliases do ficheiro course-aliases.json (gerado por merge-courses.js) ── */

let ALIASES_FILE      = {};
let NAME_OVERRIDES    = {};
let PT_VARIANTS_FILE  = {};

if (fs.existsSync(aliasPath)) {
  try {
    const saved    = readJSON(aliasPath);
    ALIASES_FILE   = saved.aliases       || {};
    NAME_OVERRIDES = saved.nameOverrides || {};
    PT_VARIANTS_FILE = saved.ptVariants  || {};
    const n = Object.keys(ALIASES_FILE).length;
    const o = Object.keys(NAME_OVERRIDES).length;
    if (n) console.log(`  Aliases (ficheiro): ${n}`);
    if (o) console.log(`  Nomes personalizados: ${o}`);
  } catch (e) { console.warn("  Aviso course-aliases:", e.message); }
}

// Fundir estáticos + ficheiro (estáticos têm precedência)
const PT_VARIANTS = { ...PT_VARIANTS_FILE, ...PT_VARIANTS_STATIC };
// Resolve chain: se A→B e B→C, resultado é A→C
function resolveAlias(key, map, depth = 0) {
  if (depth > 10 || !map[key]) return key;
  return resolveAlias(map[key], map, depth + 1);
}
const ALIASES_RAW = { ...ALIASES_FILE, ...AWAY_ALIASES_STATIC };
// Flatten: todas as chaves apontam directamente para o terminal
const ALIASES = {};
for (const k of Object.keys(ALIASES_RAW)) {
  ALIASES[k] = resolveAlias(k, ALIASES_RAW);
}

/* ── 3. Metadados estáticos por campo: nome limpo + país ── */

/**
 * COURSE_META — correcções de nome display e país para campos conhecidos.
 * Chave: norm do courseKey canónico (após aliases).
 * Prioridade: sobre o nome extraído dos scorecards e sobre countryMap.
 */
const COURSE_META = {
  // ── Espanha ──────────────────────────────────────────────────────────
  "aero club santiago":                        { country: "Espanha" },
  "alboran golf":                              { country: "Espanha" },
  "alcaidesa links golf resort":               { country: "Espanha" },
  "alcanada espanha":                          { name: "Alcanada",                       country: "Espanha" },
  "atalaya golf country club old course":      { country: "Espanha" },
  "balneario de mondariz":                     { name: "Balneario de Mondariz",           country: "Espanha" },
  "campo de golf meis":                        { country: "Espanha" },
  "campo sojuela":                             { country: "Espanha" },
  "club de golf la canada":                    { name: "Club de Golf La Cañada",          country: "Espanha" },
  "club de golf montanya":                     { country: "Espanha" },
  "club de golf playa serena":                 { country: "Espanha" },
  "club golf ria de vigo":                     { name: "Ria de Vigo",                     country: "Espanha" },
  "costa esuri espanha":                       { name: "Costa Esuri",                     country: "Espanha" },
  "el campeon golf course":                    { country: "Espanha" },
  "el rompido":                                { country: "Espanha" },
  "el saler valencia":                         { name: "Parador El Saler",                country: "Espanha" },
  "fontanals espanha":                         { name: "Fontanals",                       country: "Espanha" },
  "gambito golf calatayud":                    { country: "Espanha" },
  "golf nestares":                             { name: "Golf Nestares",                   country: "Espanha" },
  "golf santander boadilha del monte":         { name: "Golf Santander",                  country: "Espanha" },
  "golf xaz":                                  { country: "Espanha" },
  "infinitum lakes":                           { country: "Espanha" },
  "isla canela golf":                          { country: "Espanha" },
  "isla canela links":                         { country: "Espanha" },
  "la faisanera":                              { country: "Espanha" },
  "la galiana":                                { country: "Espanha" },
  "la monacilla golf club":                    { name: "La Monacilla",                    country: "Espanha" },
  "la reserva":                                { country: "Espanha" },
  "la toja":                                   { name: "La Toja",                         country: "Espanha" },
  "las colinas mission resort":                { name: "Las Colinas",                     country: "Espanha" },
  "leon golf":                                 { name: "León Golf",                       country: "Espanha" },
  "lleida golf country club":                  { name: "Lleida Golf & Country Club",      country: "Espanha" },
  "mar menor golf":                            { country: "Espanha" },
  "mondariz":                                  { name: "Golf Mondariz",                   country: "Espanha" },
  "norba club de golf":                        { name: "Norba Club de Golf",              country: "Espanha" },
  "panoramica golf":                           { name: "Panorámica Golf",                 country: "Espanha" },
  "parador el saler":                          { country: "Espanha" },
  "pga catalunya resort":                      { country: "Espanha" },
  "pula golf mallorca espanha":                { name: "Pula Golf",                       country: "Espanha" },
  "real aeroclube de vigo":                    { country: "Espanha" },
  "real club de golf de la coruna":            { name: "Real Club de Golf de La Coruña",  country: "Espanha" },
  "real club de golf el prat":                 { country: "Espanha" },
  "real club de golf guadalmina marbella":     { name: "Real Club de Golf Guadalmina",    country: "Espanha" },
  "real club de golf guadalmina sur":          { name: "Real Club de Golf Guadalmina Sur",country: "Espanha" },
  "real club de sotogrande":                   { name: "Club de Golf Sotogrande",         country: "Espanha" },
  "real club pineda":                          { name: "Real Club Pineda",                country: "Espanha" },
  "real golf de pedrena":                      { name: "Real Golf de Pedreña",            country: "Espanha" },
  "real guadalhorce club de golf":             { country: "Espanha" },
  "real montealegre club de golf":             { name: "Real Montealegre",                country: "Espanha" },
  "real novo sancti petri golf club mar e pinos": { name: "Real Novo Sancti Petri",       country: "Espanha" },
  "r c g sevilla":                             { name: "Real Sevilla Golf Club",          country: "Espanha" },
  "real sevilla":                              { name: "Real Sevilla Golf Club",          country: "Espanha" },
  "reserva de sotogrande":                     { country: "Espanha" },
  "salamanca golf country club zarapicos":     { name: "Salamanca Golf & Country Club",   country: "Espanha" },
  "san roque":                                 { name: "San Roque Club",                  country: "Espanha" },
  "san roue golf resort":                      { name: "San Roque Club",                  country: "Espanha" },
  "santa marina golf":                         { country: "Espanha" },
  "sherry jerez":                              { name: "Sherry Golf Jerez",               country: "Espanha" },
  "son antem mallorca":                        { name: "Son Antem",                       country: "Espanha" },
  "talayuela golf":                            { country: "Espanha" },
  "valle guadiana":                            { country: "Espanha" },
  "villa padierna alferini":                   { name: "Villa Padierna - Alferini",       country: "Espanha" },
  "villa padierna flamingos espanha":          { name: "Villa Padierna - Flamingos",      country: "Espanha" },
  // ── Portugal (campos fora do master — academias, par3, etc.) ─────────
  "arrabida resort golf academy":              { name: "Arrábida Resort & Golf Academy",  country: "Portugal" },
  "paco do lumiar":                            { name: "Paço do Lumiar",                  country: "Portugal" },
  "parque da floresta":                        { country: "Portugal" },
  "quinta do brincal":                         { name: "Quinta do Brinçal",               country: "Portugal" },
  "santo da serra machico serras":             { name: "Santo da Serra",                  country: "Portugal" },
  "rilhadas":                                  { country: "Portugal" },
  // ── França ───────────────────────────────────────────────────────────
  "cabot bordeaux":                            { name: "Cabot Bordeaux",                  country: "França" },
  "golf de chantilly parcours de vineul":      { name: "Golf de Chantilly",               country: "França" },
  "golf de saint cloud":                       { name: "Golf de Saint-Cloud",             country: "França" },
  "golf du medoc resort france":               { name: "Golf du Médoc Resort",            country: "França" },
  "golf du touquet la foret":                  { name: "Golf du Touquet - La Forêt",      country: "França" },
  "golf st germain":                           { name: "Golf de Saint-Germain",           country: "França" },
  "rcf la boulie franca":                      { name: "RCF La Boulie",                   country: "França" },
  "rcf la boulie":                             { name: "RCF La Boulie",                   country: "França" },
  "val de rois":                               { name: "Val de Rois",                     country: "França" },
  "evian resort golf club":                    { name: "Evian Resort Golf Club",          country: "França" },
  // ── Itália ────────────────────────────────────────────────────────────
  "golf club della montecchia":                { country: "Itália" },
  "marco simone":                              { name: "Marco Simone Golf & Country Club",country: "Itália" },
  "royal park golf country club i roveri ssd a r l": { name: "Royal Park I Roveri",      country: "Itália" },
  "terre dei consoli golf club":               { country: "Itália" },
  "venice junior open frassanele golf club":   { name: "Frassanelle Golf Club",           country: "Itália" },
  "club paradiso del garda":                   { name: "Paradiso del Garda",              country: "Itália" },
  // ── Alemanha ──────────────────────────────────────────────────────────
  "faldo course berlin":                       { name: "Faldo Course Berlin",             country: "Alemanha" },
  "frankfurter golf club":                     { name: "Frankfurter Golf Club",           country: "Alemanha" },
  "gc bad saarow arnold palmer":               { name: "Golf Club Bad Saarow - Arnold Palmer",   country: "Alemanha" },
  "gc bad saarow faldo":                       { name: "Golf Club Bad Saarow - Faldo",           country: "Alemanha" },
  "gc hardenberg":                             { name: "Golf Club Hardenberg", country: "Alemanha" },
  "gc st leon rot":                            { name: "Golf Club St. Leon-Rot",           country: "Alemanha" },
  "golfclub hofgut georgenthal":               { country: "Alemanha" },
  "golfclub rheinblick":                       { country: "Alemanha" },
  // ── Reino Unido / Inglaterra ──────────────────────────────────────────
  "berkhamsted golf course":                   { country: "Inglaterra" },
  "conwy golf club":                           { country: "Gales" },
  "fulford golf club":                         { country: "Inglaterra" },
  "ganton golf club":                          { country: "Inglaterra" },
  "hunstanton golf club":                      { country: "Inglaterra" },
  "isle of purbeck":                           { country: "Inglaterra" },
  "lyme regis golf club":                      { name: "Lyme Regis Golf Club",            country: "Inglaterra" },
  "moortown golf club":                        { country: "Inglaterra" },
  "porters park gc":                           { name: "Porters Park Golf Club",                 country: "Inglaterra" },
  "preston golf club":                         { country: "Inglaterra" },
  "purbeck golf course":                       { country: "Inglaterra" },
  "royal cinque ports reino unido":            { name: "Royal Cinque Ports",              country: "Inglaterra" },
  "royal lytham st annes championship course": { name: "Royal Lytham & St Annes",         country: "Inglaterra" },
  "royal st george s reino unido":             { name: "Royal St. George's",              country: "Inglaterra" },
  "saunton east":                              { country: "Inglaterra" },
  "saunton west":                              { country: "Inglaterra" },
  "the berkshire golf club":                   { country: "Inglaterra" },
  "trentham golf club":                        { country: "Inglaterra" },
  "west essex golf club":                      { country: "Inglaterra" },
  "woodhall spa golf course hotchkin":         { name: "Woodhall Spa - Hotchkin",         country: "Inglaterra" },
  // ── Escócia ───────────────────────────────────────────────────────────
  "bishopbriggs golf club":                    { country: "Escócia" },
  "craigielaw golf club":                      { country: "Escócia" },
  "crail craighead":                           { name: "Crail - Craighead",               country: "Escócia" },
  "eden course st andrews":                    { name: "Eden Course, St Andrews",         country: "Escócia" },
  "elgin golf club":                           { country: "Escócia" },
  "elgin":                                     { name: "Elgin Golf Club",                 country: "Escócia" },
  "fairmont kittocks":                         { name: "Fairmont - Kittocks",             country: "Escócia" },
  "fortrose rosemarkie escocia":               { name: "Fortrose & Rosemarkie",           country: "Escócia" },
  "glen golf course":                          { name: "Glen Golf Club",                  country: "Escócia" },
  "gullane golf club":                         { country: "Escócia" },
  "kilmarnock barassie":                       { name: "Kilmarnock (Barassie)",           country: "Escócia" },
  "luffness new golf club":                    { country: "Escócia" },
  "minifieth links":                           { name: "Monifieth Links",                 country: "Escócia" },
  "montgomerie course":                        { name: "Montgomerie Course",              country: "Escócia" },
  "moray golf club old course":                { country: "Escócia" },
  "muirfield golf course escocia":             { name: "Muirfield",                       country: "Escócia" },
  "newmachar hawkshill":                       { name: "Newmachar - Hawkshill",           country: "Escócia" },
  "old course st andrews":                     { name: "Old Course, St Andrews",          country: "Escócia" },
  "royal dornoch championship golf course escocia": { name: "Royal Dornoch",              country: "Escócia" },
  "royal portrush golf club":                  { country: "Irlanda do Norte" },
  "tain golf club":                            { country: "Escócia" },
  // ── Irlanda ───────────────────────────────────────────────────────────
  "clonmel golf club":                         { country: "Irlanda" },
  "county louth golf club irlanda":            { name: "County Louth Golf Club",          country: "Irlanda" },
  "killarney g fc killeen course":             { name: "Killarney G&FC",                  country: "Irlanda" },
  "roganstown golf club":                      { country: "Irlanda" },
  // ── Polónia ───────────────────────────────────────────────────────────
  "armada golf club polonia":                  { name: "Armada Golf Club",                country: "Polónia" },
  "krakow valley golf country club":           { name: "Krakow Valley Golf & Country Club", country: "Polónia" },
  // ── Eslováquia ────────────────────────────────────────────────────────
  "borsa golf club slovakia":                  { name: "Borsa Golf Club",                 country: "Eslováquia" },
  "green resort hruba borsa slovakia":         { name: "Green Resort Hruba Borsa",        country: "Eslováquia" },
  "penati golf resort":                        { name: "Penati Golf Resort",              country: "Eslováquia" },
  "sedin golf club eslovaquia":                { name: "Sedin Golf Resort",               country: "Eslováquia" },
  // ── Rep. Checa ────────────────────────────────────────────────────────
  "golf resort kaskada":                       { name: "Golf Resort Kaskáda",             country: "Rep. Checa" },
  "golf resort lipiny public course republica checa": { name: "Golf Resort Lipiny",       country: "Rep. Checa" },
  "golf spa kuneticka hora czech republic":    { name: "Golf & Spa Kunetická Hora",       country: "Rep. Checa" },
  // ── Bélgica ───────────────────────────────────────────────────────────
  "royal golf club of belgium":                { country: "Bélgica" },
  "royal latem golf club":                     { name: "Royal Latem Golf Club",           country: "Bélgica" },
  // ── Suécia ────────────────────────────────────────────────────────────
  "vasatorp golfklubb":                        { name: "Vasatorp Golfklubb",              country: "Suécia" },
  "tegelberga golf club":                      { country: "Suécia" },
  "haguer golfklubb":                          { name: "Haga Golfklubb",                  country: "Suécia" },
  // ── Dinamarca ─────────────────────────────────────────────────────────
  "hestkobgard":                               { name: "Hestekøbgård Golf Club",          country: "Dinamarca" },
  "the scandinavian new course":               { name: "The Scandinavian - New Course",   country: "Dinamarca" },
  // ── Noruega ───────────────────────────────────────────────────────────
  "oslo golf club":                            { country: "Noruega" },
  // ── Finlândia ─────────────────────────────────────────────────────────
  "cognizant cup finnish international junior champ": { name: "Cognizant Cup",            country: "Finlândia" },
  "kymen golf":                                { name: "Kymen Golf",                      country: "Finlândia" },
  "linna golf":                                { country: "Finlândia" },
  "vierumakki":                                { name: "Vierumäki Golf",                  country: "Finlândia" },
  // ── Áustria ───────────────────────────────────────────────────────────
  "colony club gutenhof":                      { country: "Áustria" },
  "pannonia golf country club":                { country: "Hungria" },
  // ── Suíça ─────────────────────────────────────────────────────────────
  "bern moossee 18 loch anlage":               { name: "Bern-Moossee Golf",               country: "Suíça" },
  "losone":                                    { name: "Golf Losone",                     country: "Suíça" },
  // ── Bulgária ──────────────────────────────────────────────────────────
  "pravets golf club bulgaria":                { name: "Pravets Golf Club",               country: "Bulgária" },
  // ── Estónia ───────────────────────────────────────────────────────────
  "parnu bay golf links":                      { name: "Pärnu Bay Golf Links",            country: "Estónia" },
  // ── Marrocos ──────────────────────────────────────────────────────────
  "golf akenza marrakesh":                     { name: "Golf Akenza",                     country: "Marrocos" },
  "royal golf marrakesh":                      { country: "Marrocos" },
  "samanah golf by nicklaus":                  { name: "Samanah Golf",                    country: "Marrocos" },
  "sofitel challege golf course":              { name: "Sofitel Golf Course",             country: "Marrocos" },
  // ── Grécia ────────────────────────────────────────────────────────────
  "costa navarino the dunes":                  { name: "Costa Navarino - The Dunes",      country: "Grécia" },
  // ── Islândia ──────────────────────────────────────────────────────────
  "oddur golf club":                           { country: "Islândia" },
  // ── Ucrânia (pré-2022) ────────────────────────────────────────────────
  "odessa old course":                         { name: "Odessa Golf Club",                country: "Ucrânia" },
  // ── República Dominicana ──────────────────────────────────────────────
  "puntacana resort club tom fazio corales golf c": { name: "Puntacana - Corales",        country: "Rep. Dominicana" },
  // ── África do Sul ─────────────────────────────────────────────────────
  "humewood golf club":                        { country: "África do Sul" },
  "kingswood golf estate africa do sul":       { name: "Kingswood Golf Estate",           country: "África do Sul" },
  "mossel bay golf club":                      { country: "África do Sul" },
  "royal johannesburg kensington golf club":   { name: "Royal Johannesburg & Kensington", country: "África do Sul" },
  "sedgefield country club":                   { name: "Sedgefield Country Club",         country: "África do Sul" },
  "sedgefleld country club donald ross course":{ name: "Sedgefield C.C. - Donald Ross",   country: "África do Sul" },
  "waterkloof golf club africa do sul":        { name: "Waterkloof Golf Club",            country: "África do Sul" },
  // ── Canadá ────────────────────────────────────────────────────────────
  "royal niagara golf club canada":            { name: "Royal Niagara Golf Club",         country: "Canadá" },
  // ── EUA ───────────────────────────────────────────────────────────────
  "auburn hills gc":                           { name: "Auburn Hills Golf Club",          country: "EUA" },
  "biltmore golf course":                      { name: "Biltmore Golf Course",            country: "EUA" },
  "buffalo dunes gc":                          { name: "Buffalo Dunes Golf Club",         country: "EUA" },
  "calumet":                                   { name: "Calumet Country Club",                      country: "EUA" },
  "champions gate international":              { name: "ChampionsGate International",     country: "EUA" },
  "cinder ridge golf course":                  { name: "Cinder Ridge Golf Course",        country: "EUA" },
  "colbert hills golf course":                 { country: "EUA" },
  "country club of ocala":                     { country: "EUA" },
  "crooked cat":                               { name: "Crooked Cat - Orange County National", country: "EUA" },
  "cypress creek gc":                          { name: "Cypress Creek Golf Club",         country: "EUA" },
  // daily mail world → alias para villa padierna flamingos (ver AWAY_ALIASES_STATIC)
  "duke university golf club":                 { name: "Duke University Golf Club",       country: "EUA" },
  "eagle trace golf club":                     { country: "EUA" },
  "earlywine golf course north":               { name: "Earlywine Golf Course",           country: "EUA" },
  "el campeon golf course":                    { country: "EUA" },
  "firekeeper golf course":                    { country: "EUA" },
  "garden city cc":                            { name: "Garden City Country Club",                  country: "EUA" },
  "golden palm":                               { country: "EUA" },
  "keney park golf course":                    { name: "Keney Park Golf Course",          country: "EUA" },
  "lincoln":                                   { name: "Lincoln Country Club",                      country: "EUA" },
  "mark bostick gc":                           { name: "Mark Bostick Golf Club",          country: "EUA" },
  "miami beach golf club":                     { country: "EUA" },
  "naples national gc 19 tci rd1":             { name: "Naples National Golf Club",              country: "EUA" },
  "new mexico state university gc":            { name: "New Mexico State University Golf Club", country: "EUA" },
  "normandy shores golf course":               { country: "EUA" },
  "oakwood country club":                      { country: "EUA" },
  "panther lake":                              { name: "Panther Lake - Orange County National", country: "EUA" },
  "quail ridge golf course":                   { country: "EUA" },
  "randall oaks golf club":                    { country: "EUA" },
  "red tiger":                                 { name: "Red Tiger Golf Course",           country: "EUA" },
  "reunion resort palmer florida usa":         { name: "Reunion Resort",                  country: "EUA" },
  "royal st cloud golf links":                 { name: "Royal St. Cloud Golf Links",      country: "EUA" },
  "salina municipal gc":                       { name: "Salina Municipal Golf Club",      country: "EUA" },
  "sand creek station":                        { country: "EUA" },
  "shawnee hills golf course eua":             { name: "Shawnee Hills Golf Course",       country: "EUA" },
  "spg green garden cc il gold course frankfort": { name: "Green Garden Country Club",              country: "EUA" },
  "sothwind golf dining 2024":                 { name: "Sothwind Golf & Dining",          country: "EUA" },
  "sugargolf golf club":                       { name: "Sugarloaf Golf Club",             country: "EUA" },
  "terradyne country club":                    { country: "EUA" },
  "the conservatory course":                   { country: "EUA" },
  "the first tee miami":                       { name: "The First Tee Miami",             country: "EUA" },
  "the links at sierra blanca":                { country: "EUA" },
  "the redding country club":                  { country: "EUA" },
  "the woodlands country club tournament course": { name: "The Woodlands Country Club",             country: "EUA" },
  "the yolo fliers club":                      { country: "EUA" },
  "timacuan golf country club":                { country: "EUA" },
  "trinity forest golf club":                  { country: "EUA" },
  "walking stick golf course":                 { country: "EUA" },
  "watters creek":                             { country: "EUA" },
  "welten":                                    { name: "Welten Golf Club",                       country: "EUA" },
  // ── Canónicos gerados por aliases que não tinham entrada própria ────────
  "ria de vigo":                               { name: "Ria de Vigo Golf Club",            country: "Espanha" },
  "las colinas":                               { name: "Las Colinas Golf",                  country: "Espanha" },
  "montealegre":                               { name: "Real Montealegre Club de Golf",     country: "Espanha" },
  "parador el saler":                          { name: "Parador El Saler",                  country: "Espanha" },
  "sugarloaf golf club":                       { name: "Sugarloaf Golf Club",               country: "EUA" },
  "vierumakki":                                { name: "Vierumäki Golf",                    country: "Finlândia" },
  "royal waterloo golf club":                  { name: "Royal Waterloo Golf Club",          country: "Bélgica" },
  "reserva de sotogrande":                     { name: "Reserva de Sotogrande",             country: "Espanha" },
  // ── Canónicos de St. Leon-Rot (cg→gc já em alias) ────────────────────
  "gc st leon rot":                            { name: "Golf Club St. Leon-Rot",            country: "Alemanha" },
  // Entradas adicionais para keys que diferem do norm do nome
  "albert vermeiren trophy royal waterloo g c": { name: "Royal Waterloo Golf Club",       country: "Bélgica" },
  "royal golf club belgique":                  { name: "Royal Golf Club of Belgium",       country: "Bélgica" },
  "royal golf club":                           { country: "Bélgica" },
  "biltmore golf course job girls":            { name: "Biltmore Golf Course",             country: "EUA" },
  "cabot bordeaux les chateaux france":        { name: "Cabot Bordeaux",                  country: "França" },
  // St. Leon-Rot — o courseKey gerado é "cg-st-leon-rot"
  "cg st leon rot":                            { name: "Golf Club St. Leon-Rot",           country: "Alemanha" },
  "championsgate international":               { name: "ChampionsGate International",     country: "EUA" },
  "cinder ridge golf course usa":              { name: "Cinder Ridge Golf Course",        country: "EUA" },
  "club de golf hato verde":                   { name: "Hato Verde Golf Club",            country: "Porto Rico" },
  "cognizant cup d1":                          { name: "Cognizant Cup",                   country: "Finlândia" },
  "cypress creek gc estados unidos":           { name: "Cypress Creek Golf Club",         country: "EUA" },
  "duke university golf club estados unidos":  { name: "Duke University Golf Club",       country: "EUA" },
  "frankfurter golf club germany":             { name: "Frankfurter Golf Club",           country: "Alemanha" },
  "innisbrook resort golf club cooperhead course": { name: "Innisbrook - Copperhead",     country: "EUA" },
  "innisbrook resort and golf club island course b": { name: "Innisbrook - Island",       country: "EUA" },
  "keney park golf course hartford connecticut usa": { name: "Keney Park Golf Course",    country: "EUA" },
  "killarney golf fishing club":               { name: "Killarney G&FC",                  country: "Irlanda" },
  "krakow valley golf":                        { name: "Krakow Valley Golf & Country Club", country: "Polónia" },
  "marco simone golf country club":            { name: "Marco Simone Golf & Country Club",country: "Itália" },
  "norba club caceres":                        { name: "Norba Club de Golf",              country: "Espanha" },
  "paradiso new":                              { name: "Paradiso del Garda",              country: "Itália" },
  "porterspark gc":                            { name: "Porters Park Golf Club",                 country: "Inglaterra" },
  "real novo sancti petri golf club":          { name: "Real Novo Sancti Petri",          country: "Espanha" },
  "royal park roveri italy":                   { name: "Royal Park I Roveri",             country: "Itália" },
  "royal johannesburg kensington golf club east": { name: "Royal Johannesburg & Kensington", country: "África do Sul" },
  "southport ainsdale england":                { name: "Southport & Ainsdale",            country: "Inglaterra" },
  "tain golf course escocia":                  { name: "Tain Golf Club",                  country: "Escócia" },
  "temecula golf club":                        { name: "Temecula Golf Club",              country: "EUA" },
  "the scandinavian new course denamark":      { name: "The Scandinavian - New Course",   country: "Dinamarca" },
  "vasatorp golfklubb suecia":                 { name: "Vasatorp Golfklubb",              country: "Suécia" },
  "vierumaki golf club":                       { name: "Vierumäki Golf",                  country: "Finlândia" },
  // Borsa — o courseKey gerado é "away-borsa-golf-club", metaKey = "borsa golf club"
  "borsa golf club":                           { name: "Borsa Golf Club",                 country: "Eslováquia" },
};

/* ── 4. País por campo (melhorias.json — fallback) ── */

const countryMap = {};
if (fs.existsSync(melhoriasPath)) {
  try {
    const melhorias = readJSON(melhoriasPath);
    for (const [, pdata] of Object.entries(melhorias)) {
      if (!pdata || typeof pdata !== "object") continue;
      let country = "";
      for (const [key, entry] of Object.entries(pdata)) {
        if (key.startsWith("_")) {
          country = (entry?.pais) || "";
          continue;
        }
        if (entry?.scorecard?.course_description && country)
          countryMap[norm(entry.scorecard.course_description)] = country;
        if (Array.isArray(entry) && key === "extra_rounds")
          for (const r of entry)
            if (r?.campo && r?.pais) countryMap[norm(r.campo)] = r.pais;
      }
    }
    console.log(`  Melhorias: ${Object.keys(countryMap).length} campos com país`);
  } catch (e) { console.warn("  Aviso melhorias:", e.message); }
}

/* ── 4. Percorrer scorecards ── */

// courseMap: normKey → { name, courseKey, country, tees: Map, players: Set<nfed> }
const courseMap  = new Map();
let totalFiles   = 0;
let totalCourses = 0;

if (fs.existsSync(outputRoot)) {
  const dirs = fs.readdirSync(outputRoot).filter(d =>
    fs.statSync(path.join(outputRoot, d)).isDirectory() && /^\d+$/.test(d)
  );

  for (const fedDir of dirs) {
    const scDir = path.join(outputRoot, fedDir, "scorecards");
    if (!fs.existsSync(scDir)) continue;

    for (const f of fs.readdirSync(scDir).filter(f => f.endsWith(".json"))) {
      totalFiles++;
      // O nfed do jogador é o DIRECTÓRIO (fedDir), não o nome do ficheiro de scorecard
      const nfed = fedDir;

      try {
        const raw  = readJSON(path.join(scDir, f));
        const recs = raw.Records || (Array.isArray(raw) ? raw : []);

        for (const rec of recs) {
          const courseName = (rec.course_description || "").trim();
          const teeName    = (rec.tee_name || "").trim();
          const cr         = toNum(rec.course_rating);
          const slope      = toNum(rec.slope);
          if (!courseName || !cr || !slope) continue;

          const courseNorm = norm(courseName);
          if (masterNames.has(courseNorm)) continue;
          // Nome inválido: torneio, competição, ou genérico
          if (INVALID_NAMES_STATIC.has(courseNorm)) continue;
          // Variante PT: nome da fed que corresponde a campo do master (ou simplesmente PT)
          if (courseNorm in PT_VARIANTS) continue;

          const normKey = ALIASES[courseNorm] || courseNorm;
          const teeKey  = `${teeName}|${cr}|${slope}`;

          if (!courseMap.has(normKey)) {
            courseMap.set(normKey, {
              name:      courseName,
              // courseKey gerado a partir do normKey canónico (após alias), não do nome cru
              // Assim "Marco Simone Golf & Country Club" e "Marco Simone" geram o mesmo key
              courseKey: `away-${normKey.replace(/\s+/g, "-")}`,
              country:   countryMap[normKey] || countryMap[courseNorm] || "",
              tees:      new Map(),
              players:   new Map(),  // nfed → data mais recente (DD-MM-YYYY)
            });
            totalCourses++;
          }

          const entry = courseMap.get(normKey);

          // Actualizar país
          if (!entry.country && (countryMap[normKey] || countryMap[courseNorm]))
            entry.country = countryMap[normKey] || countryMap[courseNorm];

          // Registar jogador com data mais recente
          const dm = String(rec.played_at || "").match(/Date\((\d+)\)/);
          if (dm) {
            const d = new Date(Number(dm[1]));
            const dateStr = `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
            const prev = entry.players.get(nfed);
            if (!prev || dateStr > prev) entry.players.set(nfed, dateStr);
          } else if (!entry.players.has(nfed)) {
            entry.players.set(nfed, null);
          }

          // Tee: a chave de dedup é teeName + fingerprint das distâncias buraco-a-buraco.
          // O mesmo tee físico tem sempre as mesmas distâncias, mesmo que o CR
          // varie ligeiramente entre torneios. Assim:
          //   - tees com distâncias diferentes (mesmo nome) ficam separados ✓
          //   - tees com as mesmas distâncias mas CR diferente colapsam ✓
          const holes = [];
          for (let i = 1; i <= 18; i++) {
            const par    = toNum(rec[`par_${i}`]);
            const si     = toNum(rec[`stroke_index_${i}`]);
            const meters = toNum(rec[`meters_${i}`]);
            if (par || meters) holes.push({ hole: i, par, si, distance: meters });
          }
          // fingerprint: sequência de distâncias (0 quando ausente), truncada aos buracos presentes
          const distFingerprint = holes.map(h => h.distance ?? 0).join(",");
          const teeGroupKey = `${teeName}|${distFingerprint}`;
          const prev = entry.tees.get(teeGroupKey);
          // Entre tees com o mesmo layout, guardar o que tem CR mais alto (mais informativo)
          if (!prev || cr > (prev.cr || 0)) {
            entry.tees.set(teeGroupKey, {
              teeName, cr, slope, holes,
              teeColorId: rec.tee_color_id || null,
            });
          }
        }
      } catch {}
    }
  }
}

console.log(`  Scorecards processados: ${totalFiles}`);
console.log(`  Campos internacionais: ${totalCourses}`);

/* ── 5. Extra_rounds do melhorias.json ── */

if (fs.existsSync(melhoriasPath)) {
  try {
    const melhorias = readJSON(melhoriasPath);
    for (const [nfed, pdata] of Object.entries(melhorias)) {
      if (!Array.isArray(pdata?.extra_rounds)) continue;
      for (const round of pdata.extra_rounds) {
        if (!round?.campo || !round?.dias) continue;
        const campo     = round.campo.trim();
        const categoria = round.categoria || "Default";
        const pais      = round.pais || "";
        const campoNorm = norm(campo);
        if (masterNames.has(campoNorm)) continue;
        if (INVALID_NAMES_STATIC.has(campoNorm)) continue;
        if (campoNorm in PT_VARIANTS) continue;
        const normKey   = ALIASES[campoNorm] || campoNorm;

        if (!courseMap.has(normKey)) {
          courseMap.set(normKey, {
            name: campo, courseKey: `away-${normKey.replace(/\s+/g, "-")}`,
            country: pais, tees: new Map(), players: new Map(),
          });
          totalCourses++;
        }
        const entry = courseMap.get(normKey);
        if (!entry.country && pais) entry.country = pais;

        // Data: usar a primeira dia do round (ex: "2024-06-15") se disponível
        const firstDia = round.dias?.[0];
        const dateStr = firstDia?.data || firstDia?.date || null;
        const prev = entry.players.get(nfed);
        if (!prev || (dateStr && dateStr > prev)) entry.players.set(nfed, dateStr);

        const best = (round.dias || []).reduce((prev, d) => {
          const ph   = Array.isArray(d.par_holes) ? d.par_holes.length : 0;
          const prevH = prev && Array.isArray(prev.par_holes) ? prev.par_holes.length : 0;
          return ph > prevH ? d : prev;
        }, null);
        if (!best?.par_holes) continue;

        const teeKey = `${categoria}|0|0`;
        if (!entry.tees.has(teeKey)) {
          const holeStart = (() => {
            const m = String(best.hole_range || "").match(/^(\d+)/);
            return m ? parseInt(m[1], 10) : 1;
          })();
          entry.tees.set(teeKey, {
            teeName: categoria, cr: null, slope: null,
            holes: best.par_holes.map((p, i) => ({
              hole: holeStart + i, par: p,
              si:       best.stroke_index_holes?.[i] ?? null,
              distance: best.meters_holes?.[i]       ?? null,
            })),
            teeColorId: null,
          });
        }
      }
    }
  } catch {}
}

/* ── 6. Converter para Course[] e gravar ── */

function sumHoles(holes, s, e, field) {
  let total = 0, any = false;
  for (const h of holes)
    if (h.hole >= s && h.hole <= e && h[field] != null) { total += h[field]; any = true; }
  return any ? total : null;
}

const courses = [];
for (const [, { name, courseKey, country, tees, players }] of courseMap) {
  const teeArr = [];
  let idx = 0;
  for (const [, t] of tees) {
    const n       = t.holes.length;
    const is18    = n === 18;
    const pT      = sumHoles(t.holes, 1, 18, "par");
    const pF      = sumHoles(t.holes, 1,  9, "par");
    const pB      = sumHoles(t.holes, 10, 18, "par");
    const dT      = sumHoles(t.holes, 1, 18, "distance");
    const dF      = sumHoles(t.holes, 1,  9, "distance");
    const dB      = sumHoles(t.holes, 10, 18, "distance");

    teeArr.push({
      teeId: `${courseKey}-${idx++}`,
      sex:   "U",
      teeName: t.teeName,
      ratings: {
        holes18: { par: is18 ? pT : null, courseRating: t.cr, slopeRating: t.slope },
        ...(pF != null ? { holes9Front: { par: pF, courseRating: t.cr ? +(t.cr/2).toFixed(1) : null, slopeRating: t.slope } } : {}),
        ...(pB != null ? { holes9Back:  { par: pB, courseRating: t.cr ? +(t.cr/2).toFixed(1) : null, slopeRating: t.slope } } : {}),
      },
      holes:     t.holes,
      distances: { total: dT, front9: dF, back9: dB, holesCount: n, complete18: is18 },
    });
  }
  if (!teeArr.length) continue;

  // Aplicar COURSE_META: nome limpo e país definitivo
  // normKey pode ser "marco simone" ou "away-marco-simone" → tentar ambos
  const metaKey = norm(courseKey.replace(/^away-/, "").replace(/-/g, " "));
  const meta = COURSE_META[metaKey] || COURSE_META[norm(name)] || {};

  const displayName = meta.name || NAME_OVERRIDES[courseKey] || name;
  const finalCountry = meta.country || country || undefined;

  // _players: { nfed: "DD-MM-YYYY" | null } — quem jogou e a data mais recente
  const playersObj = {};
  for (const [nfed, date] of players) playersObj[nfed] = date;

  courses.push({
    courseKey,
    master: {
      courseId: courseKey,
      name:     displayName,
      country:  finalCountry,
      links:    { fpg: null, scorecards: null },
      tees:     teeArr,
      _players: playersObj,
    },
  });
}

courses.sort((a, b) => a.master.name.localeCompare(b.master.name, "pt"));

const dir = path.dirname(outPath);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ courses }, null, 2), "utf-8");

console.log(`\n  Gravado: ${outPath}`);
console.log(`  ${courses.length} campos, ${courses.reduce((n, c) => n + c.master.tees.length, 0)} tees`);
console.log(`  Campos com país: ${courses.filter(c => c.master.country).length}/${courses.length}`);
