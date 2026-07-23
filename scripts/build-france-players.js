#!/usr/bin/env node
/**
 * build-france-players.js — Gera public/data/france-players.json
 *
 * Roster consolidado dos jogadores FR vistos nos torneios juvenis do portal
 * FFGolf (public/data/ffgolf-resultats/*.json). Análogo ao spain-players.json:
 * além da metadata (license, club, region, hcp, sex), baka a contagem de
 * torneios (total + ano corrente), o período de actividade e a série mais
 * recente — consumido pela vista "👥 Joueurs de France" (/ffg/info/joueurs),
 * pelo KIDSdataLoader (france-enrich) e pelo aggregator (sources/ffgolf.js).
 *
 * Campos por jogador (byLicense/byName):
 *   license, name, sex, country, glfLic          — identidade
 *   club, region, lastSerie                      — do torneio MAIS RECENTE
 *   cat, catYear                                 — escalão (ver categoriaDe)
 *   hcp, hcpDate                                 — HCP mais recente COM valor
 *   tot, ano, firstSeenIso, lastSeenIso          — contagem/período (por trnId)
 *
 * Passagem 2 — torneios GolfGenius (public/data/ffgolf/{year}_{slug}.json:
 * Championnats de France, Internationaux, GP Majeur/National). O GG não
 * publica licenças → matching de NOME contra o roster (lib/ffgolf-gg.js);
 * torneios GG que são GÉMEOS de um torneio do portal resultats (o mesmo
 * evento publicado nos dois sítios) são detectados por overlap de licenças e
 * NÃO contam 2×. Verdicto gravado em public/data/ffgolf-gg-twins.json,
 * consumido pelo adapter kids2 (aggregator/sources/ffgolf.js).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { listGgTournaments, buildNameMaps, matchGgName } = require("./lib/ffgolf-gg");
const { ffgEscalaoCanonico, ffgEscalaoMaisNovo } = require("./lib/ffg-escalao.cjs");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");
const DIR = path.join(DATA, "ffgolf-resultats");
const GG_DIR = path.join(DATA, "ffgolf");
const OUT = path.join(DATA, "france-players.json");
const OUT_TWINS = path.join(DATA, "ffgolf-gg-twins.json");
const OUT_TOURNS = path.join(DATA, "ffgolf-player-tournaments.json");
const IDX_RES = path.join(DATA, "ffgolf-resultats-index.json");

const CUR_YEAR = new Date().getFullYear();

const norm = s => (s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

const decode = s => (s || "").replace(/&#039;/g, "'").replace(/&amp;/g, "&");

/** "DD/MM/YYYY" → "YYYY-MM-DD" (vazio se não parsear). */
function dateIso(d) {
  const m = (d || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** Title-case de apelidos em CAPS ("LE PETIT" → "Le Petit"), como no slim. */
function titleCaseCaps(s) {
  if (s && /^[A-ZÀ-ÖØ-Þ\-]+$/.test(s.replace(/[\s'\-]/g, ""))) {
    return s.toLowerCase().replace(/(^|[\s'\-])(\w)/g, (_, sep, ch) => sep + ch.toUpperCase());
  }
  return s;
}

/** Nome canónico "Prenom Apelido" a partir do bloco de jogador FFGolf. */
function canonName(p) {
  let first = decode(p.namePrenom || "").trim();
  let last = decode(p.nameNom || "").trim();
  if (!first || !last) {
    // `name` cru vem "Lastname Firstname" — invertido.
    const parts = decode(p.name || "").trim().split(/\s+/);
    if (parts.length >= 2) {
      if (!last) last = parts[0];
      if (!first) first = parts.slice(1).join(" ");
    } else if (parts[0]) {
      return titleCaseCaps(parts[0]);
    }
  }
  return `${first} ${titleCaseCaps(last)}`.trim();
}

/* ── Índice "torneios de um jogador" (ffgolf-player-tournaments.json) ──────
   Catálogo partilhado + linhas compactas por licença: o mesmo torneio é
   referenciado por ÍNDICE (não repetido por jogador) e o label da série é
   internado. Sem isto o ficheiro passava de ~2 MB para >6 MB — é carregado
   pela /ffg/info/joueurs ao expandir a primeira linha. */
const tourns = [];        // catálogo (a ordem é o índice `ti` das linhas)
const tournIdx = new Map(); // entryId → ti
const serieLabels = [];   // labels internados (índice `si` das linhas)
const serieIdx = new Map();

/** Regista um torneio no catálogo e devolve o índice. `id` = entryId da /ffg. */
function tournRef(id, meta) {
  let ti = tournIdx.get(id);
  if (ti === undefined) { ti = tourns.length; tournIdx.set(id, ti); tourns.push({ id, ...meta }); }
  return ti;
}

/** Interna um label de série e devolve o índice (-1 = sem label). */
function serieRef(label) {
  if (!label) return -1;
  let si = serieIdx.get(label);
  if (si === undefined) { si = serieLabels.length; serieIdx.set(label, si); serieLabels.push(label); }
  return si;
}

/** Lugar real (>0) — ≥900 é sentinela de "sem classificação", não um lugar. */
const posOf = (v) => (typeof v === "number" && v > 0 && v < 900 ? v : null);

/** Uma linha com pos/total é "melhor" que uma sem (inscrito, WD, sem cartão). */
const rowHasResult = (r) => r && (r[1] != null || r[2] != null || (r[3] && r[3].length > 0));

/**
 * Guarda a participação de um jogador num torneio. Dedup por `ti` — o mesmo
 * jogador aparece por vezes em VÁRIAS séries do mesmo torneio (scratch +
 * handicap, "Messieurs" + "U12"), e a contagem `tot` também dedup por torneio:
 * as duas TÊM de bater certo, senão a tabela diz 19 e a lista mostra 23.
 */
function addTourn(e, ti, row) {
  const cur = e._apps.get(ti);
  if (cur && (rowHasResult(cur) || !rowHasResult(row))) return;
  e._apps.set(ti, row);
}

/** Acumula os escalões vistos por um jogador num ano (série + nome da prova). */
function addEsc(e, year, ...labels) {
  if (!year) return;
  let set = e._escByYear.get(year);
  if (!set) { set = new Set(); e._escByYear.set(year, set); }
  for (const l of labels) {
    const esc = ffgEscalaoCanonico(l);
    if (esc) set.add(esc);
  }
}

/**
 * Categoria do jogador = escalão MAIS NOVO da época mais recente COM sinal de
 * idade. Um júnior pode jogar acima do escalão dele mas nunca abaixo, por isso
 * o mínimo da época é a categoria real — o Xan Iribarne (U12) fez a "1re
 * Division U16" em Julho e ficaria rotulado Sub-16 se olhássemos só à última
 * prova. Devolve { cat, catYear } (ambos undefined se nunca houve sinal).
 */
function categoriaDe(e) {
  const anos = [...e._escByYear.keys()].filter((y) => e._escByYear.get(y).size).sort((a, b) => b - a);
  if (!anos.length) return {};
  const y = anos[0];
  return { cat: ffgEscalaoMaisNovo([...e._escByYear.get(y)]) || undefined, catYear: y };
}

// license → registo consolidado (+ campos internos _lastDate/_seen p/ agregação)
const players = new Map();
// trnId → { iso, year, lics:Set } — para a detecção de gémeos GG↔resultats.
const trnLics = new Map();

let nFiles = 0, nParseErr = 0, nNoSeries = 0, nOcc = 0;
for (const f of fs.existsSync(DIR) ? fs.readdirSync(DIR) : []) {
  if (!f.endsWith(".json")) continue;
  nFiles++;
  let d;
  try {
    d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  } catch {
    nParseErr++;
    continue;
  }
  const series = d?.details?.series || d?.series || [];
  if (!series.length) { nNoSeries++; continue; }
  const trnId = String(d.trnId || d?.details?.trnId || f.replace(/\.json$/, ""));
  const iso = dateIso(d.date);
  const year = iso ? parseInt(iso.slice(0, 4), 10) : null;
  let trn = trnLics.get(trnId);
  if (!trn) { trn = { iso, year, lics: new Set() }; trnLics.set(trnId, trn); }
  // `ffgres:{trnId}` é o entryId da /ffg (ver buildFfgResEntries em FFGPage) —
  // dá o link directo /ffg/t/{id} para a leaderboard com scorecards.
  const ti = tournRef(`ffgres:${trnId}`, {
    trnId,
    name: decode(d.name || d?.details?.name || "") || trnId,
    date: iso || null,
    year,
    course: decode(d?.details?.course || d.course || "") || null,
    ligue: d.ligue || d?.details?.ligue || null,
  });

  for (const s of series) {
    const label = (s.label || "").trim();
    for (const p of (s.players || [])) {
      const lic = (p.license || "").trim();
      if (!lic) continue;
      trn.lics.add(lic);
      let e = players.get(lic);
      if (!e) {
        e = {
          license: lic, name: "", sex: undefined, country: undefined, glfLic: undefined,
          club: undefined, region: undefined, lastSerie: undefined,
          cat: undefined, catYear: undefined,
          hcp: undefined, hcpDate: undefined,
          tot: 0, ano: 0, firstSeenIso: null, lastSeenIso: null,
          _lastDate: "", _lastHcpDate: "", _seen: new Set(), _escByYear: new Map(),
          _apps: new Map(),
        };
        players.set(lic, e);
      }
      // Identidade — preencher quando em falta (estável entre torneios).
      if (!e.sex && (p.sex === "M" || p.sex === "F")) e.sex = p.sex;
      if (!e.country && p.nationality) e.country = p.nationality;
      if (!e.glfLic && p.glfLic) e.glfLic = p.glfLic;

      // Contagem por torneio (dedup por trnId — o mesmo jogador pode surgir
      // em mais do que uma série do mesmo torneio).
      if (!e._seen.has(trnId)) {
        e._seen.add(trnId);
        e.tot++;
        if (year === CUR_YEAR) e.ano++;
        if (iso && (!e.firstSeenIso || iso < e.firstSeenIso)) e.firstSeenIso = iso;
        if (iso && (!e.lastSeenIso || iso > e.lastSeenIso)) e.lastSeenIso = iso;
      }

      // Dados "vivos" — do torneio mais recente (nome/clube/região/série).
      if (iso >= e._lastDate) {
        e._lastDate = iso;
        const name = canonName(p);
        if (name) e.name = name;
        if (p.club) e.club = decode(p.club);
        if (p.region) e.region = p.region;
        if (label) e.lastSerie = label;
      }
      // Sinal de idade da ÉPOCA: a série é mais granular ("U12 G") mas no
      // portal FFG as divisões de uma prova juvenil chamam-se muitas vezes só
      // "Messieurs"/"Dames" — aí a idade vive no NOME ("1re Division U16
      // Garçons"). Guardar os dois por ano; a categoria sai daqui no output.
      addEsc(e, year, label, d.name || d?.details?.name);
      // Participação (torneio + resultado) para a lista expansível da /ffg.
      const rounds = [p.t1, p.t2, p.t3, p.t4].filter((g) => typeof g === "number" && g > 0);
      const gross = typeof p.total === "number" && p.total > 0 ? p.total : null;
      // ⚠ Sem score não há classificação: nas provas ainda por jogar (ou só com
      // tee sheet) o `pos` é a ordem da linha na lista de partida — mostrá-lo
      // como resultado dava "91º" a quem nem jogou. E ≥900 é sentinela FPG/FFG
      // de "sem classificação" (o corpus tem 999), nunca um lugar real.
      const pos = (gross != null || rounds.length) ? posOf(p.pos) : null;
      addTourn(e, ti, [ti, pos, gross, rounds, serieRef(label)]);
      // HCP mais recente COM valor (um torneio sem hcp não apaga o anterior).
      if (typeof p.hcp === "number" && iso >= e._lastHcpDate) {
        e._lastHcpDate = iso;
        e.hcp = p.hcp;
        e.hcpDate = iso;
      }
      nOcc++;
    }
  }
}

console.log(`Scaneados ${nFiles} ficheiros FFG resultats (${nParseErr} erros parse, ${nNoSeries} sem séries)`);
console.log(`Total jogadores únicos (por license): ${players.size} — ${nOcc} aparições`);

// ── Passagem 2: torneios GolfGenius (matching por nome + dedup de gémeos) ──
const nameMaps = buildNameMaps(
  [...players.values()].map((e) => ({ name: e.name, lic: e.license })),
);
const ggTourns = listGgTournaments(GG_DIR);
/**
 * Overlap mínimo de licenças para declarar que um evento GG é o MESMO evento do
 * portal. Medido em 2026-07-20 sobre os 19 gémeos então detectados: 17 estavam
 * em 1.00 (campo idêntico) e 1 em 0.67. O limiar antigo (0.40) apanhava também
 * pares que só partilham a COORTE — os mesmos U12 franceses jogam várias provas
 * na época. Caso real: "CFJ - U12 Garçons" (Julho, Golf du Gouverneur, 87 jog.)
 * foi dado como gémeo de "GPN U12 - Strasbourg" (30/05, 72 jog.) com 0.48, e a
 * /ffg escondia-o — um falso gémeo não duplica, APAGA o torneio da página.
 *
 * ⚠ O guard de data (±5 dias) que devia apanhar isto nunca disparou: nenhum dos
 * 25 ficheiros GG traz data. Enquanto não trouxerem, o overlap é o único sinal.
 */
const MIN_TWIN_OVERLAP = 0.6;
/** Abaixo disto o gémeo é plausível mas não óbvio — vale a pena olhar. */
const TWIN_REVIEW_BELOW = 0.9;

const twins = {};
let nGgCounted = 0, nGgTwins = 0, nGgMatched = 0, nGgUnmatched = 0;

/** Dias entre dois ISO (Infinity se algum faltar). */
const dayDiff = (a, b) => (a && b)
  ? Math.abs(Date.parse(a) - Date.parse(b)) / 86400000
  : Infinity;

for (const gg of ggTourns) {
  // Matching nome→licença de cada jogador GG (null = sem match / ambíguo).
  const matched = new Map(); // lic → player GG
  for (const p of gg.players) {
    const lic = matchGgName(nameMaps, p.name);
    if (lic) { if (!matched.has(lic)) matched.set(lic, p); }
    else nGgUnmatched++;
  }
  nGgMatched += matched.size;

  // Gémeo no portal resultats? O mesmo evento é por vezes publicado nos dois
  // sítios (ex: Internationaux U14, GP Jeunes Majeur) — detectado por overlap
  // de licenças no mesmo ano (±5 dias quando ambas as datas são conhecidas).
  let twin = null;
  if (matched.size >= 5) {
    for (const [trnId, t] of trnLics) {
      if (t.year !== gg.year) continue;
      if (gg.dateIso && t.iso && dayDiff(gg.dateIso, t.iso) > 5) continue;
      let inter = 0;
      for (const lic of matched.keys()) if (t.lics.has(lic)) inter++;
      const ratio = inter / matched.size;
      if (ratio >= MIN_TWIN_OVERLAP && (!twin || ratio > twin.overlap)) {
        twin = { trnId, overlap: +ratio.toFixed(2) };
      }
    }
  }
  if (twin) {
    twins[gg.key] = twin;
    nGgTwins++;
    if (twin.overlap < TWIN_REVIEW_BELOW) {
      // Esconder um torneio é irreversível do ponto de vista do utilizador (não
      // aparece em lado nenhum) — um gémeo não-óbvio tem de ser visível no log.
      console.warn(`  ⚠ gémeo pouco óbvio (overlap ${twin.overlap}): ${gg.key} → trnId ${twin.trnId} — confirmar que é mesmo o mesmo evento`);
    }
    continue; // já contado pela versão do portal (que tem licenças)
  }

  // Contar o torneio GG para cada jogador matched.
  nGgCounted++;
  const ggTid = `gg:${gg.key}`;
  const ggTi = tournRef(ggTid, {
    name: gg.name, date: gg.dateIso || null, year: gg.year,
    course: gg.course || null, ligue: null, np: gg.players.length || null, gg: 1,
  });
  for (const [lic, p] of matched) {
    const e = players.get(lic);
    if (e._seen.has(ggTid)) continue;
    e._seen.add(ggTid);
    e.tot++;
    if (gg.year === CUR_YEAR) e.ano++;
    // O GG não tem séries, mas o nome do evento tem a idade ("CFJ - U12 Garçons").
    addEsc(e, gg.year, gg.name);
    addTourn(e, ggTi, [
      ggTi,
      posOf(p.pos),
      typeof p.total === "number" && p.total > 0 ? p.total : null,
      Array.isArray(p.roundScores) ? p.roundScores.filter((g) => typeof g === "number" && g > 0) : [],
      serieRef(p.division || null),
    ]);
    if (gg.dateIso) {
      if (!e.firstSeenIso || gg.dateIso < e.firstSeenIso) e.firstSeenIso = gg.dateIso;
      if (!e.lastSeenIso || gg.dateIso > e.lastSeenIso) e.lastSeenIso = gg.dateIso;
      if (typeof p.hcp === "number" && gg.dateIso >= e._lastHcpDate) {
        e._lastHcpDate = gg.dateIso;
        e.hcp = p.hcp;
        e.hcpDate = gg.dateIso;
      }
    }
  }
}

console.log(`GolfGenius: ${ggTourns.length} torneios — ${nGgCounted} contados, ${nGgTwins} gémeos do portal (ignorados), ${nGgMatched} jogadores matched, ${nGgUnmatched} sem match`);

fs.writeFileSync(OUT_TWINS, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "scripts/build-france-players.js",
  twins,
}, null, 2));
console.log(`${OUT_TWINS} escrito (${Object.keys(twins).length} gémeos).`);

// Output: byLicense → record + byName (normalizado, 1º vence) → record
const byName = {};
const byLicense = {};
// Torneios por licença — linhas ordenadas por data DESC (mais recente 1º).
const tournsByLicense = {};
let nApps = 0, nMismatch = 0;

let nSemCat = 0;
for (const [lic, e] of players) {
  Object.assign(e, categoriaDe(e));
  if (!e.cat) nSemCat++;
  const rows = [...e._apps.values()].sort((a, b) => {
    const da = tourns[a[0]].date || "", db = tourns[b[0]].date || "";
    return db.localeCompare(da);
  });
  if (rows.length) tournsByLicense[lic] = rows;
  nApps += rows.length;
  // A tabela mostra `tot`; a lista expansível mostra estas linhas. Divergirem
  // seria um bug silencioso (o utilizador conta e não bate certo).
  if (rows.length !== e.tot) nMismatch++;
  const { _lastDate, _lastHcpDate, _seen, _escByYear, _apps, ...rec } = e;
  byLicense[lic] = rec;
  if (rec.name) {
    const k = norm(rec.name);
    if (!byName[k]) byName[k] = rec;
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  source: "scripts/build-france-players.js",
  totalPlayers: players.size,
  byName,
  byLicense,
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`Categoria resolvida para ${players.size - nSemCat}/${players.size} jogadores (${nSemCat} sem sinal de idade em nenhuma prova).`);
console.log(`${OUT} escrito (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB).`);

// ── Output 2: torneios+resultados por jogador (lista expansível da /ffg) ──
// Só é linkável (/ffg/t/{id}) o que a página consegue abrir: o índice de
// resultats é a fonte da sidebar, e 5 trnIds do corpus não estão lá.
const linkable = new Set();
try {
  for (const t of JSON.parse(fs.readFileSync(IDX_RES, "utf8")).tournaments || []) {
    linkable.add(`ffgres:${t.trnId}`);
  }
} catch { /* índice ausente (checkout parcial) — assume-se tudo linkável */ }
let nNoLink = 0;
for (const t of tourns) {
  if (t.gg) continue; // entradas GG vêm sempre do mesmo sítio que a sidebar
  if (linkable.size && !linkable.has(t.id)) { t.noLink = 1; nNoLink++; }
  // ⚠ O `pos` do portal é a classificação do TORNEIO INTEIRO, não da série
  // (medido: em 1212/1225 provas o máximo bate certo com o nº de licenças do
  // torneio, e há séries de 41 com jogadores em 42º). Logo o "de N" tem de ser
  // o campo todo — usar o tamanho da série dava "42º de 41".
  t.np = trnLics.get(t.trnId)?.lics.size || null;
  delete t.trnId; // já está no `id` (`ffgres:{trnId}`)
}

fs.writeFileSync(OUT_TOURNS, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "scripts/build-france-players.js",
  totalPlayers: Object.keys(tournsByLicense).length,
  totalAppearances: nApps,
  /** Linha = [ti, pos, total, [gross por volta], si]. `ti` indexa `tournaments`
   *  (que traz `np` = nº de jogadores da prova) e `si` indexa `series`
   *  (-1 = sem label). `pos` null = inscrito sem classificação publicada. */
  series: serieLabels,
  tournaments: tourns,
  byLicense: tournsByLicense,
}));
console.log(`${OUT_TOURNS} escrito (${(fs.statSync(OUT_TOURNS).size / 1024).toFixed(1)} KB) — ${nApps} participações, ${tourns.length} torneios${nNoLink ? `, ${nNoLink} sem página na /ffg` : ""}.`);
if (nMismatch) console.warn(`  ⚠ ${nMismatch} jogadores com nº de participações ≠ tot — a lista expansível não vai bater com a coluna 📊 Tot`);
