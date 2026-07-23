#!/usr/bin/env node
/**
 * build-spain-player-tournaments.js — Gera public/data/spain-player-tournaments.json
 *
 * Torneios + resultados de CADA licença espanhola, para o painel expansível da
 * lista `/rfeg/info/jugadores` (gémeo do ffgolf-player-tournaments.json do lado
 * francês). Cada linha abre a prova em `/rfeg/{source}/{id}`.
 *
 * Uma linha por (licença, prova), vinda de DUAS origens que se completam:
 *   • INSCRIÇÃO — as `sources[]` do `licencia-dob-lookup.json` (listas de
 *     admitidos/reservas/bajas/invitados/no admitidos/provisional do RFEGolf +
 *     inscritos e leaderboards do NextCaddy). Dão também as provas em que o
 *     jogador se inscreveu e não jogou — mostradas com o estado.
 *   • RESULTADO — classificações onde a inscrição não existe no corpus. Sem
 *     isto faltavam os **Campeonatos de España** publicados só no
 *     LiveGolfScoring (164 provas, ~13,5k participações): a RFEGolf não tem lá
 *     lista de inscritos, logo não havia `source` nenhuma a que pendurá-los.
 *
 * O resultado é procurado em 3 plataformas (não partilham keyspace):
 *   1. `rfegolf-resultats/{compId}.json` → results[].players[] — tem `licencia`
 *      (inclui os blocos mitarjeta injectados pelo scrape-mitarjeta)
 *   2. `nextcaddy/{tourId}.json` → leaderboard[].players[] — tem `licencia`
 *   3. `fcg-rivals.json` → provas da Federació Catalana (golfdirecto), que já
 *      trazem `license`
 *   4. `rfegolf-livegolfscoring/{id}.json` → classification[] — **sem licença**,
 *      só nome → resolvido por nome normalizado contra o lookup, e só quando o
 *      nome é ÚNICO (ambíguo nunca se adivinha). Mesmo princípio do adapter
 *      kids2 (`aggregator/sources/rfeg.js`).
 *
 * O ficheiro traz também `counts` (tot/ano por licença) — o
 * `build-spain-players-export.js` usa-os para a coluna 📊 Tot, para que o
 * número da tabela e o nº de linhas do painel sejam sempre o mesmo.
 *
 * Output (compacto — ~90k participações):
 *   tournaments[] — catálogo partilhado: {id:"{source}/{id}", name, date, year,
 *                   cat, sex, course}
 *   status[]      — estados de inscrição internados ("admitidos", "bajas", …)
 *   byLicencia    — lic → linhas [ti, pos, total, [gross/volta], st, nCampo],
 *                   ordenadas por data DESC. ⚠ O `nCampo` é POR LINHA (não por
 *                   prova): o `pos` é dentro da CATEGORIA em que o jogador
 *                   competiu, e um tour NextCaddy junta 768 jogadores em 12
 *                   categorias — "34º de 768" seria falso.
 *   counts        — lic → [tot, ano]
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");
const DOB_IN = path.join(DATA, "licencia-dob-lookup.json");
const IDX_IN = path.join(DATA, "rfegolf-resultats-index.json");
const TWINS_IN = path.join(DATA, "rfegolf-lgs-twins.json");
const RFEG_DIR = path.join(DATA, "rfegolf-resultats");
const NC_DIR = path.join(DATA, "nextcaddy");
const LGS_DIR = path.join(DATA, "rfegolf-livegolfscoring");
const FCG_IN = path.join(DATA, "fcg-rivals.json");
const OUT = path.join(DATA, "spain-player-tournaments.json");

const CUR_YEAR = new Date().getFullYear();
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const isNumJson = (f) => /^\d+\.json$/.test(f);
const listJson = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(isNumJson) : []);

/** Nome normalizado para o join do LGS ("APELIDO, Nome" ≡ "Nome Apelido"). */
function normName(s) {
  return String(s || "").toLowerCase().normalize("NFKD")
    .replace(/[̀-ͯ]/g, "").replace(/[,.]/g, " ")
    .replace(/\s+/g, " ").trim();
}
/** Chave insensível à ordem dos tokens (a RFEG inverte apelido/nome por fonte). */
const sortedName = (s) => normName(s).split(" ").filter(Boolean).sort().join(" ");

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Classificação por handicap? Aí o "gross" publicado é LÍQUIDO — vale menos
 *  que a scratch na hora de escolher o resultado a mostrar. */
const isHcpCat = (c) => /\bhandicap\b|\bhcp\b|\bstableford\b/i.test(String(c || ""));

// Nalguns ficheiros NextCaddy os campos `licencia` e `nivel` vêm TROCADOS:
// licencia = "DD-MM-YY HH:MM" (data de inscrição) e nivel = a licença real.
// Sem desfazer isto perdem-se os resultados desses torneios inteiros.
const isLicFmt = (x) => typeof x === "string" && /^[A-Z]{1,4}[-\dA-Z]{6,}$/.test(x.trim()) && !/^\d{2}-\d{2}-\d{2}/.test(x);
const isDateFmt = (x) => typeof x === "string" && /^\d{2}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(x);
function ncLicencia(p) {
  let lic = p.licencia ? String(p.licencia).trim() : "";
  const niv = p.nivel ? String(p.nivel).trim() : "";
  if (isDateFmt(lic) && isLicFmt(niv)) lic = niv;
  return !lic || isDateFmt(lic) ? null : lic;
}
/** Lugar real — 0/negativo/sentinela (≥900) não é classificação. */
const posOf = (v) => (typeof v === "number" && v > 0 && v < 900 ? v : null);

/** `sources[]` do lookup → chave do catálogo. "nc48197" → "nextcaddy/48197". */
function srcKeyOf(source) {
  const s = String(source);
  const m = /^nc(\d+)$/.exec(s);
  return m ? `nextcaddy/${m[1]}` : `rfegolf/${s}`;
}

// ── Catálogo de torneios (partilhado; as linhas guardam só o índice) ─────
const STATUS = ["admitidos", "reservas", "bajas", "invitados", "noAdmitidos", "provisional"];
const tourns = [];
const tournIdx = new Map(); // "rfegolf/15055" → ti

const idxBySrc = new Map();
for (const t of readJson(IDX_IN).tournaments || []) {
  const key = `${t.source}/${t.id}`;
  if (!idxBySrc.has(key)) idxBySrc.set(key, t);
}

/**
 * Índice da prova no catálogo (-1 se não está no índice → sem página nem meta).
 * `noLink` espelha o filtro `visible` do buildRfegEntries (RFEGPage): sem
 * categoria e sem classificados nem admitidos, a prova não entra na sidebar —
 * linkar para lá dava uma página vazia.
 */
function tournRef(key) {
  const known = tournIdx.get(key);
  if (known !== undefined) return known;
  const t = idxBySrc.get(key);
  if (!t) return -1;
  const ti = tourns.length;
  tournIdx.set(key, ti);
  const naSidebar = !!t.category && ((t.leaderboardPlayers || 0) > 0 || (t.counts?.admitidos || 0) > 0);
  tourns.push({
    id: key, // o routing da /rfeg é /rfeg/{source}/{id}
    ...(naSidebar ? {} : { noLink: 1 }),
    // 28 provas NextCaddy não têm nome no índice — mostrar só o número parecia
    // um bug na UI; identificamo-las pela plataforma.
    name: t.name || `${t.source === "nextcaddy" ? "NextCaddy" : t.source} ${t.id}`,
    date: t.dateStartIso || null,
    year: t.year ?? null,
    cat: t.category || null,
    sex: t.sex || null,
    course: t.course || null,
  });
  return ti;
}

// ── Resultados: licença → (chave da prova → {pos,total,rounds}) ──────────
const resByLic = new Map();

const rich = (x) => !!(x && ((x.rounds && x.rounds.length) || x.total != null));
/**
 * Uma prova publica várias classificações (scratch e handicap, por categoria).
 * Preferimos a SCRATCH — a de handicap traz líquidos nos campos de gross (ver a
 * memória "NextCaddy par real = tarjeta") — e, em igualdade, a que traz voltas.
 */
function putResult2(m, key, r) {
  const cur = m.get(key);
  if (cur) {
    if (!cur.hcp && r.hcp) return;
    if (cur.hcp === r.hcp && rich(cur) && !rich(r)) return;
  }
  m.set(key, r);
}
function putResult(lic, key, r) {
  if (!lic) return;
  let m = resByLic.get(lic);
  if (!m) { m = new Map(); resByLic.set(lic, m); }
  putResult2(m, key, r);
}

let nRfegBlocks = 0, nNcBlocks = 0, nLgsUsed = 0, nLgsSemGemeo = 0;

// 1) RFEGolf — results[].players[]. Os blocos mitarjeta trazem `licencia`; os
//    que vêm do PDF só têm nome → casados contra os inscritos DESTA prova
//    (lookup local, sem risco de apanhar um homónimo de outro torneio).
for (const f of listJson(RFEG_DIR)) {
  let d;
  try { d = readJson(path.join(RFEG_DIR, f)); } catch { continue; }
  const key = `rfegolf/${d.compId || f.replace(/\.json$/, "")}`;
  const nameToLic = new Map();
  for (const list of STATUS) {
    for (const p of (d.inscritos?.[list] || [])) {
      if (!p.licencia || !p.name) continue;
      const n = normName(p.name);
      if (!nameToLic.has(n)) nameToLic.set(n, String(p.licencia).trim());
    }
  }
  for (const b of d.results || []) {
    const ps = b.players || [];
    if (!ps.length) continue;
    nRfegBlocks++;
    const hcp = isHcpCat(b.label) || isHcpCat(b.categoria);
    for (const p of ps) {
      const lic = p.licencia ? String(p.licencia).trim() : nameToLic.get(normName(p.name));
      if (!lic) continue;
      putResult(lic, key, {
        pos: posOf(p.pos), total: num(p.total),
        rounds: (p.rounds || []).filter((g) => num(g) != null),
        field: ps.length, hcp,
      });
    }
  }
}

// 2) NextCaddy — leaderboard[] são as CATEGORIAS, cada uma com players[]
for (const f of listJson(NC_DIR)) {
  let d;
  try { d = readJson(path.join(NC_DIR, f)); } catch { continue; }
  const key = `nextcaddy/${d.tourId || f.replace(/\.json$/, "")}`;
  for (const cat of d.leaderboard || []) {
    const ps = cat.players || [];
    if (!ps.length) continue;
    nNcBlocks++;
    const catName = cat.categoryName
      ?? (typeof cat.category === "number" ? d.meta?.categories?.[cat.category] : null);
    const hcp = isHcpCat(catName) || isHcpCat(d.meta?.format);
    for (const p of ps) {
      const lic = ncLicencia(p);
      if (!lic) continue;
      putResult(lic, key, {
        pos: posOf(p.pos), total: num(p.total),
        rounds: (p.rounds || []).filter((g) => num(g) != null),
        field: ps.length, hcp,
      });
    }
  }
}

// 3) FCG (Federació Catalana, via golfdirecto) — o rivals já traz `license`.
let nFcg = 0;
try {
  const fcg = readJson(FCG_IN);
  for (const [tid, t] of Object.entries(fcg.torneios || {})) {
    const m = /^fcg([^_]+)_/.exec(tid);
    if (!m) continue;
    const key = `golfdirecto/${m[1]}`;
    const ps = t.players || [];
    for (const p of ps) {
      const lic = p.license || p.lic;
      if (!lic) continue;
      putResult(String(lic).trim(), key, {
        pos: posOf(p.p), total: num(p.t),
        rounds: (p.rd || []).filter((g) => num(g) != null),
        field: ps.length, hcp: false,
      });
      nFcg++;
    }
  }
} catch { /* fcg-rivals.json ausente — a Catalunha fica de fora */ }

// 4) LiveGolfScoring — sem licença: join por nome único.
const dob = readJson(DOB_IN).lookup || {};
const nameToLics = new Map();
for (const [lic, e] of Object.entries(dob)) {
  if (!e.name) continue;
  for (const k of new Set([normName(e.name), sortedName(e.name)])) {
    if (!k) continue;
    const a = nameToLics.get(k) || new Set();
    a.add(lic);
    nameToLics.set(k, a);
  }
}
/** Licença de um nome — null se ambíguo ou desconhecido (nunca adivinhar). */
function licOfName(name) {
  for (const k of [normName(name), sortedName(name)]) {
    const a = nameToLics.get(k);
    if (a) return a.size === 1 ? [...a][0] : null;
  }
  return null;
}

const twinsFile = (() => {
  try { return readJson(TWINS_IN); } catch { return {}; }
})();
const twins = twinsFile.twins || {};
/** LGS suprimidos: a /rfeg mostra o gémeo RFEGolf+mitarjeta (mais rondas). */
const lgsSuppressed = twinsFile.lgsSuppressed || {};
const lgsToComp = new Map();
for (const [comp, lgs] of Object.entries(twins)) lgsToComp.set(String(lgs), String(comp));

/** Só para os LGS SEM gémeo conhecido: lgsKey → {lics, date} (ver extraTwins). */
const lgsRosters = new Map();
for (const f of listJson(LGS_DIR)) {
  let d;
  try { d = readJson(path.join(LGS_DIR, f)); } catch { continue; }
  const lgsId = String(d.id || f.replace(/\.json$/, ""));
  const cls = d.classification || [];
  if (!cls.length) continue;
  // Com gémeo, a linha de inscrição existe do lado RFEGolf → o resultado
  // pendura-se aí (a /rfeg redirecciona esse compId para o LGS rico).
  // Gémeo conhecido → a linha vive do lado RFEGolf (a /rfeg redirecciona esse
  // compId para o LGS rico). LGS suprimido → o canónico é o RFEGolf+mitarjeta.
  const comp = lgsToComp.get(lgsId) || (lgsSuppressed[lgsId] != null ? String(lgsSuppressed[lgsId]) : null);
  const key = comp ? `rfegolf/${comp}` : `livegolfscoring/${lgsId}`;
  if (!comp) nLgsSemGemeo++;
  nLgsUsed++;
  const lics = new Set();
  for (const p of cls) {
    const lic = licOfName(p.name);
    if (!lic) continue;
    lics.add(lic);
    putResult(lic, key, {
      pos: posOf(p.pos), total: num(p.total),
      rounds: (p.roundTotals || []).filter((g) => num(g) != null),
      field: cls.length,
    });
  }
  if (!comp) lgsRosters.set(key, { lics, date: d.meta?.dateStartIso || d.meta?.dateIso || null });
}

/* ── Gémeos RFEGolf↔LGS que o `rfegolf-lgs-twins.json` não apanha ──────────
   Esse ficheiro cruza por NOME normalizado + ano, e a RFEG baptiza o mesmo
   evento de maneiras diferentes em cada plataforma ("Campeonato de España Sub
   16 Masculino 2025" vs "Campeonato Nacional Individual de España Amateur…").
   Resultado: o mesmo campeonato aparecia DUAS vezes no painel — uma linha
   "inscrito" (RFEGolf, sem classificação) e outra com o resultado (LGS).

   Aqui cruzamos pelo ROSTER — possível agora que os nomes do LGS estão
   resolvidos em licenças. Guardas contra o falso gémeo (que FUNDE provas
   diferentes e faz desaparecer uma): as DUAS datas têm de existir e ficar a
   ≤7 dias (a data RFEGolf é a da lista de inscritos, a do LGS a de jogo),
   ≥5 licenças resolvidas e ≥80% de sobreposição. Medido: 21 pares, quase
   todos com overlap 1.00. Sem o guard de data entrava a "Copa S.M. El Rey"
   (sem data) com 0.81 contra um Sub-16 de outro ano — a mesma coorte de
   juniores de topo joga tudo. */
const TWIN_MIN_OVERLAP = 0.8;
const TWIN_MAX_DAYS = 7;
const TWIN_MIN_ROSTER = 5;

const rfegRoster = new Map(); // "rfegolf/{id}" → {lics:Set, date}
for (const f of listJson(RFEG_DIR)) {
  let d;
  try { d = readJson(path.join(RFEG_DIR, f)); } catch { continue; }
  const key = `rfegolf/${d.compId || f.replace(/\.json$/, "")}`;
  const lics = new Set();
  for (const list of STATUS) {
    for (const p of (d.inscritos?.[list] || [])) if (p.licencia) lics.add(String(p.licencia).trim());
  }
  if (!lics.size) continue;
  rfegRoster.set(key, { lics, date: idxBySrc.get(key)?.dateStartIso || null });
}

const dayDiff = (a, b) => (a && b ? Math.abs(Date.parse(a) - Date.parse(b)) / 86400000 : Infinity);
const extraTwins = new Map(); // "rfegolf/{id}" → "livegolfscoring/{id}"
for (const [lgsKey, roster] of lgsRosters) {
  if (roster.lics.size < TWIN_MIN_ROSTER) continue;
  const lgsDate = idxBySrc.get(lgsKey)?.dateStartIso || roster.date || null;
  let best = null;
  for (const [rKey, r] of rfegRoster) {
    if (dayDiff(lgsDate, r.date) > TWIN_MAX_DAYS) continue;
    let inter = 0;
    for (const l of roster.lics) if (r.lics.has(l)) inter++;
    const ov = inter / Math.min(roster.lics.size, r.lics.size);
    if (ov >= TWIN_MIN_OVERLAP && (!best || ov > best.ov)) best = { key: rKey, ov };
  }
  if (best && !extraTwins.has(best.key)) extraTwins.set(best.key, lgsKey);
}
// Fundir os resultados do lado RFEGolf na entrada LGS — a página
// `/rfeg/livegolfscoring/{id}` é a que mostra a classificação.
// ⚠ O LGS GANHA quando tem o jogador: os blocos do microsite são muitas vezes
// classificações de UMA jornada ("Clasificación - 3ª Jornada", 60 jogadores),
// não a geral — no Sub-16 2025 davam "1º de 60" a quem foi 3º de 90. O bloco
// RFEGolf só entra quando o LGS não resolveu aquele nome.
for (const m of resByLic.values()) {
  for (const [rKey, lgsKey] of extraTwins) {
    const r = m.get(rKey);
    if (!r) continue;
    m.delete(rKey);
    if (!m.has(lgsKey)) m.set(lgsKey, r);
  }
}

// ── Estado da inscrição por (prova, licença) ─────────────────────────────
// `bajas`/`reservas` explicam as linhas sem resultado — é informação, não ruído.
const statusByLic = new Map();
for (const f of listJson(RFEG_DIR)) {
  let d;
  try { d = readJson(path.join(RFEG_DIR, f)); } catch { continue; }
  const key = `rfegolf/${d.compId || f.replace(/\.json$/, "")}`;
  STATUS.forEach((list, si) => {
    for (const p of (d.inscritos?.[list] || [])) {
      if (!p.licencia) continue;
      const lic = String(p.licencia).trim();
      let m = statusByLic.get(lic);
      if (!m) { m = new Map(); statusByLic.set(lic, m); }
      if (!m.has(key)) m.set(key, si);
    }
  });
}

// ── Linhas por licença ───────────────────────────────────────────────────
const byLicencia = {};
const counts = {};
let nRows = 0, nComResultado = 0, nForaIndice = 0, nSoResultado = 0;

const allLics = new Set([...Object.keys(dob), ...resByLic.keys()]);
for (const lic of allLics) {
  const e = dob[lic];
  const res = resByLic.get(lic);
  const sts = statusByLic.get(lic);
  const stsExtra = new Map(); // estado herdado de um gémeo RFEGolf fundido
  const keys = new Set();
  // A inscrição RFEGolf e a classificação LGS do MESMO campeonato colapsam numa
  // linha só (ver extraTwins) — o estado da inscrição segue para essa linha.
  for (const s of (e?.sources || [])) {
    const k = srcKeyOf(s);
    keys.add(extraTwins.get(k) || k);
    if (extraTwins.has(k) && sts?.has(k)) stsExtra.set(extraTwins.get(k), sts.get(k));
  }
  // Provas onde só há classificação (LGS sem inscritos publicados).
  if (res) for (const k of res.keys()) { if (!keys.has(k)) { keys.add(k); nSoResultado++; } }

  const rows = [];
  for (const key of keys) {
    const ti = tournRef(key);
    if (ti < 0) { nForaIndice++; continue; }
    const r = res?.get(key);
    if (r) nComResultado++;
    rows.push([
      ti, r?.pos ?? null, r?.total ?? null, r?.rounds ?? [],
      sts?.get(key) ?? stsExtra.get(key) ?? -1,
      // Só faz sentido com posição, e só quando é coerente (scrapes parciais).
      r?.pos != null && r.field && r.pos <= r.field ? r.field : null,
    ]);
  }
  if (!rows.length) continue;
  rows.sort((a, b) => (tourns[b[0]].date || "").localeCompare(tourns[a[0]].date || ""));
  byLicencia[lic] = rows;
  counts[lic] = [rows.length, rows.filter((r) => tourns[r[0]].year === CUR_YEAR).length];
  nRows += rows.length;
}

fs.writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "scripts/build-spain-player-tournaments.js",
  totalPlayers: Object.keys(byLicencia).length,
  totalAppearances: nRows,
  status: STATUS,
  tournaments: tourns,
  byLicencia,
  counts,
}));

console.log(`Gémeos RFEGolf↔LGS extra (por roster): ${extraTwins.size}`);
console.log(`Linhas FCG (Catalunha): ${nFcg}`);
console.log(`Blocos de classificação: ${nRfegBlocks} RFEGolf, ${nNcBlocks} NextCaddy, ${nLgsUsed} LiveGolfScoring (${nLgsSemGemeo} sem gémeo RFEGolf)`);
console.log(`${Object.keys(byLicencia).length} licenças, ${nRows} participações, ${tourns.length} torneios`);
console.log(`Resultado em ${nComResultado}/${nRows} (${(nRows ? nComResultado / nRows * 100 : 0).toFixed(1)}%) — o resto são inscrições sem classificação publicada`);
console.log(`${nSoResultado} participações vieram só da classificação (sem lista de inscritos no corpus)`);
if (nForaIndice) console.log(`${nForaIndice} saltadas (prova fora do rfegolf-resultats-index.json — sem página na /rfeg)`);
console.log(`${OUT} escrito (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB).`);
