/**
 * scripts/build-rfegolf-index.js
 *
 * Cria public/data/rfegolf-resultats-index.json agregando JSONs de DUAS fontes:
 *   1. public/data/rfegolf-resultats/  (rfegolf.es — Campeonatos Nacionais)
 *   2. public/data/nextcaddy/          (nextcaddy.com — RFGA Andaluzia + FGM Madrid)
 *
 * Cada entrada tem `source: "rfegolf" | "nextcaddy"` e `filePath` aponta para
 * o JSON detalhado correcto. RFEGPage usa filePath para fetch on-demand.
 *
 * Uso: node scripts/build-rfegolf-index.js
 */

const fs = require("fs");
const { writeJsonGuarded } = require("./lib/shrink-guard");
const { gemeoGolfdirecto, licencasRegional } = require("./lib/golfdirecto-twins");
const path = require("path");

const ROOT = path.resolve(__dirname, "../public/data/rfegolf-resultats");
const NC_ROOT = path.resolve(__dirname, "../public/data/nextcaddy");
const OUT = path.resolve(__dirname, "../public/data/rfegolf-resultats-index.json");

if (!fs.existsSync(ROOT) && !fs.existsSync(NC_ROOT)) {
  console.error("Nem public/data/rfegolf-resultats nem public/data/nextcaddy existem.");
  process.exit(1);
}

function parseEsDate(s) {
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const MONTHS_ES = { ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
                    jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12" };
function parseEsDateLong(s) {
  if (!s) return null;
  const m = /(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s+(\d{4})/i.exec(s);
  if (!m) return null;
  return `${m[3]}-${MONTHS_ES[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
}

// Mês por extenso (e abreviado) ES → "MM". Cobre o formato do livegolfscoring
// (`meta.dateRange = "31 mayo - 03 junio"`) e nomes NextCaddy ("21 Junio 2026").
const MONTHS_ES_FULL = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10",
  noviembre: "11", diciembre: "12",
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06", jul: "07",
  ago: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12",
};
function esMonthNum(name) {
  if (!name) return null;
  const k = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return MONTHS_ES_FULL[k] || null;
}
// "21 Junio 2026" / "21 jun 2026" (mês por extenso OU abreviado + ano) → ISO.
// Complementa parseEsDateLong (só abreviado) para apanhar datas em nomes NextCaddy.
function parseEsDateFull(s) {
  if (!s) return null;
  const m = /(\d{1,2})\s+([a-záéíóúñ]+)\.?\s+(\d{4})/i.exec(s);
  if (!m) return null;
  const mon = esMonthNum(m[2]);
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[1].padStart(2, "0")}`;
}
// "31 mayo - 03 junio" (+ ano resolvido) → { start, end } ISO. Sem ano → null.
// Trata roll-over de Dezembro→Janeiro (end < start ⇒ ano seguinte) — raro mas seguro.
function parseEsDateRange(range, year) {
  if (!range || !year) return null;
  const norm = String(range).toLowerCase()
    .replace(/\bdel?\b|\bal\b|\bde\b/g, " ")
    .replace(/\s+/g, " ").trim();
  const pairs = [...norm.matchAll(/(\d{1,2})\s+([a-záéíóúñ]+)/gi)]
    .map(m => ({ day: m[1].padStart(2, "0"), mon: esMonthNum(m[2]) }))
    .filter(p => p.mon);
  if (!pairs.length) return null;
  const a = pairs[0], b = pairs[pairs.length - 1];
  const startIso = `${year}-${a.mon}-${a.day}`;
  let endYear = year;
  if (b.mon < a.mon) endYear = year + 1; // ex: "28 diciembre - 02 enero"
  const endIso = `${endYear}-${b.mon}-${b.day}`;
  return { start: startIso, end: endIso };
}

function extractYearFromName(name) {
  const ms = (name || "").match(/\b(20\d{2})\b/g);
  if (!ms) return null;
  return parseInt(ms[ms.length - 1], 10);
}

function extractCategoryFromName(name) {
  if (!name) return null;
  const m = name.match(/\bSub[\s-]?(\d+)\b/i);
  if (m) return "Sub-" + m[1];
  // Os torneios INTERNACIONAIS da RFEG usam a nomenclatura inglesa ("Spanish
  // International U-18 Mens Championship"). Sem isto ficavam com category null
  // e a /rfeg, que exige categoria, não os mostrava de todo (caso lgs388).
  const u = name.match(/\bU-?(1[0-8]|2[01]|[6-9])\b/i);
  if (u) return "Sub-" + u[1];
  if (/\bAlev[ií]n\b/i.test(name)) return "Alevín";
  if (/\bBenjam[ií]n\b/i.test(name)) return "Benjamín";
  if (/\bInfantil\b/i.test(name)) return "Infantil";
  if (/\bCadete\b/i.test(name)) return "Cadete";
  if (/\bJunior\b/i.test(name)) return "Junior";
  if (/\bJuvenil\b/i.test(name)) return "Juvenil";
  return null;
}

function extractSexFromName(name) {
  if (!name) return null;
  if (/\bMasculino\s+y\s+Femenino\b/i.test(name) || /\bMixto\b/i.test(name)) return "Mixto";
  if (/\bMasculino\b/i.test(name)) return "M";
  if (/\bFemenino\b/i.test(name)) return "F";
  // Provas internacionais, com o escalão em inglês ("... U-18 Mens Championship")
  if (/\b(Mens|Men's|Boys)\b/i.test(name)) return "M";
  if (/\b(Womens|Women's|Ladies|Girls)\b/i.test(name)) return "F";
  return null;
}

const tournaments = [];
let skipped = 0;

// Há ≥1 inscrito português? (RFEGolf expõe pais por extenso em espanhol.)
function rfegHasPt(j) {
  const ins = (j && j.inscritos) || {};
  for (const k of ["admitidos", "reservas", "invitados", "provisional", "noAdmitidos"]) {
    for (const p of (ins[k] || [])) {
      // microsite antigo: "PORTUGAL" por extenso; GolfBox (site novo): ISO "PT"
      if (p && typeof p.pais === "string" && /^(PORTUGAL|PT|PRT|POR)$/i.test(p.pais.trim())) return true;
    }
  }
  return false;
}

// ── Escalões pelas CLASSIFICAÇÕES (NextCaddy) ──────────────────
// O nome nem sempre diz o escalão («Puntuable Zonal Nacional (masculino)») e as
// categorias de inscrição trazem «Profesional»/«Senior» mesmo em provas só de
// juniores — ficavam fora da /rfeg (30/10/2026). As classificações dizem o que
// se jogou: se TODAS são juvenis, a prova é juvenil e estes são os seus escalões.
// O Pequecircuito da RFGA (iniciação, campo de ~1.100 m, categorias por idade)
// fica de fora de propósito: escalões muito novos (pedido da Mariana).
const ESC_ORDEM = ["Sub-8", "Sub-10", "Benjamín", "Sub-12", "Alevín", "Sub-14", "Infantil", "Sub-16", "Cadete", "Sub-18", "Junior", "Juvenil", "Sub-21", "Sub-25"];
function escaloesDasClassificacoes(j) {
  const cats = ((j && j.leaderboard) || []).filter((c) => (c.players || []).length).map((c) => c.categoryName || "");
  if (!cats.length) return [];
  const escs = cats.map(extractCategoryFromName);
  if (escs.some((e) => !e)) return [];   // há uma classificação de adultos (ou desconhecida) → não é juvenil
  const ord = (e) => { const i = ESC_ORDEM.indexOf(e); return i < 0 ? 99 : i; };
  return [...new Set(escs)].sort((a, b) => ord(a) - ord(b));
}

// ── Nº de buracos ──────────────────────────────────────────────
// Provas de 4/5/9 buracos (escalões muito novos) saem da /rfeg — a Mariana não
// as quer (30/10/2026). Dos dados quando os há (par do campo ou o 1.º cartão),
// senão do nome («9 HOYOS», «5P3 HOYOS», «18H»). null = desconhecido (fica).
function buracosDoNome(nome) {
  const m = /\b(\d{1,2})\s*(?:p3\s*)?(?:hoyos|h)\b/i.exec(nome || "") || /\b(\d)\s*p3\b/i.exec(nome || "");
  const n = m ? parseInt(m[1], 10) : null;
  return n && n >= 3 && n <= 18 ? n : null;
}
function buracosNC(j, nome) {
  // O nome manda quando diz menos buracos: os de 4/5 buracos vêm com cartão de 9.
  // O cartão é o que se jogou; o par do campo é o do campo todo (o Gran Premio
  // Benjamín La Cañada 2026 tem par de 18 e cartões de 9).
  const pNome = buracosDoNome(nome);
  const p = ((j && j.leaderboard) || []).flatMap((c) => (c && c.players) || []).find((x) => (x.roundScores || []).length);
  const s = p && p.roundScores[0] && p.roundScores[0].scores;
  let dados = Array.isArray(s) && (s.length === 9 || s.length === 18) ? s.length : null;
  if (!dados) {
    const par = j && j.course && Array.isArray(j.course.par) ? j.course.par.length : 0;
    dados = par === 9 || par === 18 ? par : null;
  }
  if (pNome && (!dados || pNome < dados)) return pNome;
  return dados;
}

// ── Roster fingerprint ────────────────────────────────────────
// Permite ao buildRfegEntries (src/data/rfeg/entries.ts) confirmar "é o mesmo evento?" por
// JOGADORES no momento em que constrói a sidebar, sem carregar as divisões.
// Chave = nome normalizado (todas as fontes têm nome; a comparação no cliente é
// sempre DENTRO do mesmo balde fonte|ano|nome-base, por isso o formato do nome é
// consistente entre os dois lados). Guardado ordenado + único por torneio.
function normNameKey(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function rosterFrom(players) {
  const set = new Set();
  for (const p of (players || [])) {
    const nm = p.name || [p.firstName, p.surname].filter(Boolean).join(" ");
    const k = normNameKey(nm);
    if (k) set.add(k);
  }
  return [...set].sort();
}

// ── 1) RFEGolf ────────────────────────────────────────────────
const rfegFiles = fs.existsSync(ROOT)
  ? fs.readdirSync(ROOT).filter(f => /^\d+\.json$/.test(f)).sort()
  : [];

for (const file of rfegFiles) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf-8"));
    if (!j || !j.ok || !j.meta) { skipped++; continue; }
    const compId = j.compId || parseInt(file.replace(".json", ""), 10);
    const meta = j.meta;
    const counts = (j.inscritos && j.inscritos.counts) || {};
    const name = meta.name || "";

    let year = null;
    const ds = parseEsDate(meta.dateStart) || parseEsDate(meta.dateEnd);
    if (ds) year = parseInt(ds.slice(0, 4), 10);
    if (!year) year = extractYearFromName(name);

    const category = extractCategoryFromName(name) || (meta.category || "").split(",")[0].trim() || null;
    const sex = extractSexFromName(name) || (
      meta.sex === "Masculino" ? "M" :
      meta.sex === "Femenino" ? "F" :
      meta.sex === "Mixto" ? "Mixto" : null
    );

    tournaments.push({
      source: "rfegolf",
      id: compId,
      compId,
      file,
      filePath: `rfegolf-resultats/${file}`,
      // Site novo (scrape-rfeg-competiciones): o microsite antigo já não existe.
      url: j.url || null,
      name, year, category, sex,
      dateStart: meta.dateStart || null,
      dateEnd: meta.dateEnd || null,
      dateStartIso: parseEsDate(meta.dateStart),
      dateEndIso: parseEsDate(meta.dateEnd),
      course: meta.course || null,
      courseClubId: meta.courseClubId || null,
      mode: meta.mode || null,
      style: meta.style || null,
      // NB: meta.federation do RFEGolf está mal etiquetado (contém o sexo) e
      // meta.region vem vazio — por isso NÃO há federação utilizável aqui.
      hcpLimitMen: meta.hcpLimitMen != null ? meta.hcpLimitMen : null,
      hcpLimitWomen: meta.hcpLimitWomen != null ? meta.hcpLimitWomen : null,
      hasPt: rfegHasPt(j) || undefined,
      counts: {
        admitidos: counts.admitidos || 0,
        reservas: counts.reservas || 0,
        bajas: counts.bajas || 0,
        invitados: counts.invitados || 0,
        noAdmitidos: counts.noAdmitidos || 0,
        provisional: counts.provisional || 0,
      },
      holes: buracosDoNome(name) || undefined,
      // Resultados publicados (PDF parseado ou injectados do mitarjeta).
      leaderboardPlayers: Array.isArray(j.results)
        ? j.results.reduce((a, r) => a + ((r && r.players) ? r.players.length : 0), 0)
        : 0,
      // Nº de rondas (do mitarjeta/PDF) — alimenta o badge "3R" na sidebar quando
      // este rfegolf é preferido ao gémeo LGS (ver lgsSuppressed em build-lgs-twins).
      nRounds: Array.isArray(j.results)
        ? Math.max(0, ...j.results.map((r) => (r && typeof r.nRounds === "number") ? r.nRounds : 0)) || undefined
        : undefined,
      roster: rosterFrom(Array.isArray(j.results) ? j.results.flatMap((r) => (r && r.players) || []) : []),
      scrapedAt: j.scrapedAt || null,
    });
  } catch (e) {
    console.warn("skip rfegolf " + file + ": " + e.message);
    skipped++;
  }
}

// ── 2) NextCaddy ──────────────────────────────────────────────
// O NextCaddy não expõe datas nos ficheiros de detalhe (só na página de
// listagem). Mas os ficheiros de scope da descoberta (`scripts/nextcaddy-scope*.json`)
// guardam `tours[].date` ("13 jun 2026"). Recupera-se a data OFFLINE cruzando
// por tourId — sem re-scrape. (O scraper também passou a injectar a data no
// detalhe a partir do scope, para ficheiros futuros serem auto-suficientes.)
function loadNextcaddyScopeDates() {
  const m = new Map();
  let scopeFiles = [];
  try {
    scopeFiles = fs.readdirSync(__dirname).filter(f => /^nextcaddy-scope.*\.json$/.test(f));
  } catch { /* ignore */ }
  for (const f of scopeFiles) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf-8")); } catch { continue; }
    const tours = j.tours || j.tournaments || (Array.isArray(j) ? j : []);
    for (const t of tours) {
      const id = t.tourId || t.id;
      if (id == null || !t.date) continue;
      const prev = m.get(id);
      if (!prev || !prev.date) m.set(id, { date: t.date, year: t.year || null, name: t.name || null });
    }
  }
  return m;
}
const ncScopeDates = loadNextcaddyScopeDates();

const ncFiles = fs.existsSync(NC_ROOT)
  ? fs.readdirSync(NC_ROOT).filter(f => /^\d+\.json$/.test(f)).sort()
  : [];

for (const file of ncFiles) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(NC_ROOT, file), "utf-8"));
    if (!j || !j.tourId) { skipped++; continue; }
    const tourId = j.tourId;
    const meta = j.meta || {};
    // Provas futuras: a página do NextCaddy não traz o nome onde o scraper o lê
    // (ficava null) — o da listagem (scope) serve (ex. Circuito Juvenil Zona E, 14/11/2026).
    const name = meta.name || (ncScopeDates.get(tourId) || {}).name || "";
    const inscCount = (j.inscritos || []).length;
    const lbCount = (j.leaderboard || []).reduce((acc, t) => acc + (t.players ? t.players.length : 0), 0);

    // Tentativa 1: dateIso já injectado pelo enrich (a partir do discover scope)
    // Tentativa 2: parsear "07 mar 2026" do pageHeaderText, dateStart, etc.
    const pageText = (meta.pageHeaderText || "") + " " + (j.url || "") + " " + name + " " + (meta.format || "") + " " + (meta.dateStart || "");
    // dateIso, por ordem: meta.dateIso (enrich) → scope da descoberta ("13 jun 2026")
    // → "07 mar 2026" (abreviado no texto) → "21 Junio 2026" (extenso, comum nos nomes
    // NextCaddy). Tudo offline.
    const scopeDate = ncScopeDates.get(tourId);
    const dateIso = (meta.dateIso || null)
      || (scopeDate && parseEsDateLong(scopeDate.date))
      || parseEsDateLong(pageText) || parseEsDateFull(pageText) || null;
    // Tentativa 2: extractYearFromName procura "20XX" em qualquer string
    let year = dateIso ? parseInt(dateIso.slice(0, 4), 10) : null;
    if (!year) year = extractYearFromName(name);
    if (!year) year = extractYearFromName(meta.pageHeaderText || "");
    // Tentativa 3: data scrapedAt como fallback (assume torneio é do ano em que foi scraped)
    if (!year && j.scrapedAt) {
      const sm = /(\d{4})/.exec(j.scrapedAt);
      if (sm) year = parseInt(sm[1], 10);
    }

    // Prioridade: nome do torneio (quando explicita escalão) → categories[].
    // Se o NOME não menciona escalão juvenil, NÃO marcar como juvenil só porque
    // a lista de categories tem "Infantil" — muitos torneios adultos têm
    // categorias subordinadas para 1-2 inscritos juvenis.
    let category = extractCategoryFromName(name);
    if (!category && Array.isArray(meta.categories) && meta.categories.length) {
      const juvCat = meta.categories.find(c => /Alev[ií]n|Benjam[ií]n|Infantil|Cadete|Junior|Juvenil|Sub/i.test(c));
      // Só usar o cats fallback se há indicação clara de torneio juvenil
      // (não todos os categories).
      if (juvCat && !meta.categories.some(c => /Caballeros|Se[ñn]oras|Senior|Profesional|Adult/i.test(c))) {
        category = extractCategoryFromName(juvCat);
      } else if (juvCat && meta.categories.length <= 3) {
        // Torneios pequenos com 2-3 categorias juvenis — provavelmente são juvenis
        category = extractCategoryFromName(juvCat);
      }
    }
    const escaloesLb = escaloesDasClassificacoes(j);
    if (!category && escaloesLb.length) category = escaloesLb[0];

    let sex = extractSexFromName(name);
    if (!sex && Array.isArray(meta.categories)) {
      const hasM = meta.categories.some(c => /Masculino/i.test(c));
      const hasF = meta.categories.some(c => /Femenino/i.test(c));
      sex = hasM && hasF ? "Mixto" : (hasM ? "M" : (hasF ? "F" : null));
    }

    tournaments.push({
      source: "nextcaddy",
      id: tourId, tourId, file,
      filePath: `nextcaddy/${file}`,
      name, year, category, sex,
      dateStart: dateIso, dateEnd: dateIso,
      dateStartIso: dateIso, dateEndIso: dateIso,
      course: meta.course || null,
      courseCode: meta.courseCode || null,
      organizer: meta.organizer || null,
      federation: meta.organizer || null,
      format: meta.format || null,
      categories: meta.categories || [],
      counts: {
        admitidos: inscCount,
        reservas: 0, bajas: 0, invitados: 0, noAdmitidos: 0, provisional: 0,
      },
      leaderboardPlayers: lbCount,
      holes: buracosNC(j, name) || undefined,
      // Vários escalões jogados (Sub 12 + Infantil + Cadete…) → a prova aparece em todos os filtros.
      escaloes: escaloesLb.length > 1 ? escaloesLb : undefined,
      roster: rosterFrom((j.leaderboard || []).flatMap((t) => (t && t.players) || [])),
      scrapedAt: j.scrapedAt || null,
    });
  } catch (e) {
    console.warn("skip nextcaddy " + file + ": " + e.message);
    skipped++;
  }
}


// ── 3) Livegolfscoring (HTML hbh — fonte rica de scorecards) ─────────
const LGS_ROOT = path.resolve(__dirname, "../public/data/rfegolf-livegolfscoring");
const LGS_MP_ROOT = path.resolve(__dirname, "../public/data/lgs-matchplay");
const lgsFiles = fs.existsSync(LGS_ROOT)
  ? fs.readdirSync(LGS_ROOT).filter(f => /^\d+\.json$/.test(f)).sort()
  : [];

for (const file of lgsFiles) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(LGS_ROOT, file), "utf-8"));
    if (!j || !j.ok || !j.meta) { skipped++; continue; }
    const id = j.id || parseInt(file.replace(".json", ""), 10);
    const name = j.meta.name || "";
    // Prioridade: meta.year (vindo do enrich-lgs-dates) → year no nome → scrapedAt
    let year = j.meta.year || extractYearFromName(name);
    if (!year && j.scrapedAt) year = parseInt(j.scrapedAt.slice(0, 4), 10);
    // ISO derivado: meta.dateIso (enrich, raro) → senão parsear `meta.dateRange`
    // ("31 mayo - 03 junio") + ano resolvido. Puramente offline.
    const range = parseEsDateRange(j.meta.dateRange, year);
    const dateStartIso = j.meta.dateIso || (range && range.start) || null;
    // ⚠ o fim vem do RANGE ("02 septiembre - 05 septiembre"); o `meta.dateIso` é
    // só o dia de início, e usá-lo aqui achatava provas de vários dias a um só.
    const dateEndIso = (range && range.end) || j.meta.dateIso || null;
    const category = extractCategoryFromName(name);
    const sex = extractSexFromName(name);
    const totalPlayers = (j.rounds && j.rounds[0]?.players?.length) || 0;
    tournaments.push({
      source: "livegolfscoring",
      id, file,
      filePath: `rfegolf-livegolfscoring/${file}`,
      name, year, category, sex,
      dateStart: j.meta.dateRange || dateStartIso || null,
      dateEnd: j.meta.dateRange || dateEndIso || null,
      dateStartIso, dateEndIso,
      course: j.meta.course || null,
      counts: { admitidos: totalPlayers, reservas: 0, bajas: 0, invitados: 0, noAdmitidos: 0, provisional: 0 },
      leaderboardPlayers: totalPlayers,
      holes: (j.course && Array.isArray(j.course.par) && j.course.par.length) || buracosDoNome(name) || undefined,
      nRounds: (j.rounds || []).length,
      roster: rosterFrom((j.rounds && j.rounds[0] && j.rounds[0].players) || []),
      // Fase de match play (campeonatos por equipas) — scrape-lgs-matchplay.js.
      matchplayFile: fs.existsSync(path.join(LGS_MP_ROOT, file)) ? `lgs-matchplay/${file}` : undefined,
      scrapedAt: j.scrapedAt || null,
    });
  } catch (e) { console.warn("skip lgs " + file + ": " + e.message); skipped++; }
}

// ── 4) GolfDirecto — Federació Catalana (2026-05-09) e Federación Gallega (30/10/2026) ──
const FCG_ROOT = path.resolve(__dirname, "../public/data/fcg");
const fcgFiles = fs.existsSync(FCG_ROOT)
  ? fs.readdirSync(FCG_ROOT).filter(f => /^[0-9a-f]{24}\.json$/.test(f)).sort()
  : [];

for (const file of fcgFiles) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(FCG_ROOT, file), "utf-8"));
    if (!j || !j.gameId || !j.game) { skipped++; continue; }
    const game = j.game;
    const cats = j.categories || [];
    const totalPlayers = cats.reduce((acc, c) => acc + (c.players || []).length, 0);
    // Sem jogadores não há nada para mostrar — nem nas agendadas, nem nas que o
    // golfdirecto dá como terminadas sem publicar classificação (match play, …).
    if (totalPlayers === 0) { skipped++; continue; }

    const tName = (game.tournament && game.tournament.name) || game.name || j.gameId;
    const dateIso = game.scheduleStartDate ? game.scheduleStartDate.slice(0, 10) : null;
    const year = dateIso ? parseInt(dateIso.slice(0, 4), 10) : null;

    // Categoria juvenil dominante (Aleví / Benjamí / Infantil / Cadete)
    const catNames = cats.map(c => c.name || "");
    const catText = catNames.join(" ");
    let category = extractCategoryFromName(tName) || extractCategoryFromName(catText);
    if (!category) {
      if (/sub-?12|alev[íi]/i.test(catText)) category = "Alevín";
      else if (/benjam[íi]/i.test(catText)) category = "Benjamín";
      else if (/infantil|sub-?14/i.test(catText)) category = "Infantil";
      else if (/cadet|sub-?16/i.test(catText)) category = "Cadete";
      else if (/sub-?18|junior/i.test(catText)) category = "Sub-18";
    }

    // Sexo: M se todas categorias M; F se todas F; Mixto senão
    const genders = cats.map(c => c.gender).filter(Boolean);
    const allM = genders.length > 0 && genders.every(g => g === "M");
    const allF = genders.length > 0 && genders.every(g => g === "F");
    const sex = allM ? "M" : (allF ? "F" : (genders.length > 1 ? "Mixto" : (extractSexFromName(tName) || null)));

    tournaments.push({
      source: "golfdirecto",
      id: j.gameId,
      gameId: j.gameId,
      file,
      filePath: `fcg/${file}`,
      name: tName + (cats.length > 1 ? "" : (cats[0] && cats[0].name ? ` — ${cats[0].name}` : "")),
      year,
      category,
      sex,
      dateStart: dateIso,
      dateEnd: game.scheduleEndDate ? game.scheduleEndDate.slice(0, 10) : dateIso,
      dateStartIso: dateIso,
      dateEndIso: game.scheduleEndDate ? game.scheduleEndDate.slice(0, 10) : dateIso,
      course: (game.course && game.course.name) || (game.club && game.club.name) || null,
      // prefixo das licenças (CB Catalunha, GC Galiza…) — do 1.º jogador
      courseCode: ((cats.flatMap((c) => c.players || []).find((p) => p && p.license) || {}).license || "").slice(0, 2) || null,
      organizer: (game.tournament && game.tournament.clientName) || "Federación Catalana de Golf",
      format: game.pointMode || null,
      categories: cats.map(c => c.name).filter(Boolean),
      counts: {
        admitidos: totalPlayers,
        reservas: 0, bajas: 0, invitados: 0, noAdmitidos: 0, provisional: 0,
      },
      leaderboardPlayers: totalPlayers,
      holes: buracosDoNome(`${tName} ${cats.map((c) => c.name).join(" ")}`) || undefined,
      roster: rosterFrom(cats.flatMap((c) => (c && c.players) || [])),
      // Um jogo «Ronda 2» traz as voltas anteriores no previous[] de cada jogador
      // (se a soma der o acumulado, o previous já inclui a volta do jogo).
      nRounds: Math.max(1, ...cats.flatMap((c) => c.players || []).map((p) => {
        const prev = (Array.isArray(p.previous) ? p.previous : []).map((x) => x && x.day && x.day.strokeNumber).filter((n) => typeof n === "number");
        const acc = p.view && p.view.acc && p.view.acc.strokeNumber;
        return prev.length && prev.reduce((a, n) => a + n, 0) === acc ? prev.length : prev.length + 1;
      })),
      tournamentId: game.tournament && game.tournament._id || null,
      tournamentName: game.tournament && game.tournament.name || null,
      status: game.status,
      scrapedAt: j.fetchedAt || null,
    });
  } catch (e) {
    console.warn("skip fcg " + file + ": " + e.message);
    skipped++;
  }
}

// ── 5) Federações regionais com PDFs (30/10/2026) ─────────────────────
// FGCV — Valência (golfcv.com, scripts/scrape-fgcv.js) e FVG — País Basco
// (fvgolf.com, scripts/scrape-fvg.js; ficheiros pelo uuid da prova). Mesmo
// formato do microsite antigo da RFEG (results por categoria + inscritos).
const REGIONAIS = [
  { source: "fgcv", root: path.resolve(__dirname, "../public/data/fgcv"), re: /^\d+\.json$/ },
  { source: "fvg", root: path.resolve(__dirname, "../public/data/fvg"), re: /^[0-9a-f-]{36}\.json$/ },
];
let gemeosGd = 0;
for (const { source, root, re } of REGIONAIS) for (const file of (fs.existsSync(root) ? fs.readdirSync(root).filter((f) => re.test(f)).sort() : [])) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(root, file), "utf-8"));
    if (!j || !j.ok || !j.meta) { skipped++; continue; }
    const meta = j.meta;
    const name = meta.name || "";
    const results = Array.isArray(j.results) ? j.results : [];
    const cats = results.map((r) => r.categoria).filter(Boolean);
    const insc = (j.inscritos && j.inscritos.admitidos) || [];
    // Sem classificação nem inscritos (PDFs em imagem, ligas por equipas) não há página.
    if (!results.length && !insc.length) { skipped++; continue; }
    // A mesma prova no golfdirecto (cartões buraco a buraco) → fica essa.
    if (gemeoGolfdirecto(meta.dateStart, licencasRegional(j))) { skipped++; gemeosGd++; continue; }
    const catsInsc = insc.map((p) => p.catEdad).filter(Boolean);
    const ordem = ["Benjamín", "Alevín", "Infantil", "Cadete", "Junior"];
    const escs = [...new Set([...cats, ...catsInsc])].sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b));
    const dsIso = parseEsDate(meta.dateStart);
    tournaments.push({
      source,
      id: j.compId, compId: j.compId, file,
      filePath: `${source}/${file}`,
      url: j.url || null,
      name,
      year: dsIso ? parseInt(dsIso.slice(0, 4), 10) : extractYearFromName(name),
      category: extractCategoryFromName(name) || escs[0] || "Juvenil",
      escaloes: escs.length > 1 ? escs : undefined,
      sex: extractSexFromName(name) || (meta.sex === "Masculino" ? "M" : meta.sex === "Femenino" ? "F" : "Mixto"),
      dateStart: meta.dateStart || null, dateEnd: meta.dateEnd || null,
      dateStartIso: dsIso, dateEndIso: parseEsDate(meta.dateEnd),
      course: meta.course || null,
      federation: meta.federation || null,
      holes: buracosDoNome(name) || undefined,
      hasPt: rfegHasPt(j) || undefined,
      counts: { admitidos: insc.length, reservas: 0, bajas: 0, invitados: 0, noAdmitidos: 0, provisional: 0 },
      leaderboardPlayers: results.reduce((a, r) => a + ((r && r.players) ? r.players.length : 0), 0),
      nRounds: Math.max(0, ...results.map((r) => r.nRounds || 0)) || undefined,
      roster: rosterFrom(results.flatMap((r) => (r && r.players) || [])),
      scrapedAt: j.scrapedAt || null,
    });
  } catch (e) {
    console.warn(`skip ${source} ${file}: ${e.message}`);
    skipped++;
  }
}


tournaments.sort((a, b) => {
  const da = a.dateStartIso || "0";
  const db = b.dateStartIso || "0";
  if (db !== da) return db.localeCompare(da);
  return (b.id || 0) - (a.id || 0);
});

const byYear = {};
const byCategory = {};
const bySource = {};
for (const t of tournaments) {
  if (t.year) byYear[t.year] = (byYear[t.year] || 0) + 1;
  if (t.category) byCategory[t.category] = (byCategory[t.category] || 0) + 1;
  bySource[t.source] = (bySource[t.source] || 0) + 1;
}

const out = {
  generatedAt: new Date().toISOString(),
  source: "scripts/build-rfegolf-index.js",
  total: tournaments.length,
  totalCompetitions: tournaments.length,
  skipped,
  byYear,
  byCategory,
  bySource,
  tournaments,
};

writeJsonGuarded(OUT, out, { spaces: 2, failOnRefuse: true });
console.log(`Index built: ${tournaments.length} torneios (rfegolf=${bySource.rfegolf || 0}, nextcaddy=${bySource.nextcaddy || 0}, livegolfscoring=${bySource.livegolfscoring || 0}, golfdirecto=${bySource.golfdirecto || 0}, fgcv=${bySource.fgcv || 0}, fvg=${bySource.fvg || 0}), skipped=${skipped} (${gemeosGd} PDFs regionais já no golfdirecto)`);
console.log(`  -> ${OUT}`);
console.log(`  byYear: ${JSON.stringify(byYear)}`);
