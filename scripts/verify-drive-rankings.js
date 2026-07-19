#!/usr/bin/env node
/**
 * scripts/verify-drive-rankings.js (2026-07-10)
 * ─────────────────────────────────────────────────────────────────────────
 * VERIFICA que os rankings Drive calculados por nós (drive-data-*.json +
 * tabela drivePoints + regra dos melhores-N) COINCIDEM com os oficiais
 * (public/data/drive-rankings.json, scraped do RankingsClassifLST).
 *
 * Três níveis de comparação:
 *  1. INTERNO (gross + net): melhores-N dos pontos por prova oficiais vs o
 *     total oficial — auto-DETECTA o N (3..6) que a FPG aplica por ranking
 *     (e denuncia pesos especiais, ex: final ×1.5, quando nenhum N encaixa).
 *  2. TABELA DE PONTOS (gross): recolhe todos os pares (pos → pontos) dos
 *     detalhes oficiais e compara com a nossa DRIVE_POINTS — apanha erros
 *     tipo "8º=38 vs 35" e posições que nos faltam (20º+ nos campos Tour).
 *  3. EXTERNO (gross): prova a prova (match por data) e totais melhores-N,
 *     oficial vs calculado dos nossos drive-data (challenge: zona+escalão;
 *     tour: zona, posição geral do torneio).
 *
 * OUTPUT: relatório na consola + public/data/drive-rankings-check.json
 * EXIT: 0 = tudo igual · 1 = divergências · 2 = sem dados p/ comparar
 *
 * USAGE:
 *   node scripts/verify-drive-rankings.js            # tudo
 *   node scripts/verify-drive-rankings.js --code DC_MADM12G26
 *   node scripts/verify-drive-rankings.js --year 2026
 * ─────────────────────────────────────────────────────────────────────────
 */
"use strict";

const fs = require("fs");
const path = require("path");
const {
  DRIVE_POINTS_TOUR, DRIVE_POINTS_CHALLENGE, drivePoints,
  FINAL_WEIGHT, isFinalEvent, isNacionalFinal, finalPoints, sharedPoints,
} = require("./lib/drive-points.cjs");
const { writeJsonAtomic } = require("./lib/atomic-write");
const { compareForRanking, assignPositions, assignPositionsSharingTies } = require("./lib/drive-countback.cjs");

const REPO = path.resolve(__dirname, "..");
const DATA = path.join(REPO, "public", "data");
const RK_FILE = path.join(DATA, "drive-rankings.json");
const OUT_FILE = path.join(DATA, "drive-rankings-check.json");

const args = process.argv.slice(2);
const argVal = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const ONLY_CODE = argVal("--code", null);
const YEAR = argVal("--year", String(new Date().getFullYear()));

if (!fs.existsSync(RK_FILE)) {
  console.error("[verify-rk] falta public/data/drive-rankings.json — corre scrape-drive-rankings.js primeiro");
  process.exit(2);
}
const RK = JSON.parse(fs.readFileSync(RK_FILE, "utf8")).rankings || {};

/* ── Lado NOSSO: índices a partir dos drive-data mensais ────────────────── */
// challenge: `${zone}|${escalao}` → fed → [{date, pos, pts}]
// tour:      `${zone}`            → fed → [{date, pos, pts}]
const oursChallenge = new Map();
const oursTour = new Map();
{
  const files = fs.readdirSync(DATA).filter(f => new RegExp(`^drive-data-${YEAR}-\\d{2}\\.json$`).test(f));
  for (const f of files) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { continue; }
    for (const t of (j.tournaments || [])) {
      if (t.series === "aquapor") continue;  // indexado à parte (por sexo)
      const isTour = (t.series || "tour") === "tour";
      const idx = isTour ? oursTour : oursChallenge;
      const key = isTour ? `${t.region}` : `${t.region}|${t.escalao}`;
      if (!idx.has(key)) idx.set(key, new Map());
      const m = idx.get(key);
      // Sem cartão válido → sem pontos. Além do WD/DNS em string, a FPG mete
      // SENTINELAS numéricas no gross (999, 1044, 1049, 1066, 1080…) que são
      // "não completou", não um score. Contá-las dava pontos a quem a FPG
      // não pontua (ex: Ruiqi Li com gross=1080 a receber os 45 pts do 7º) e
      // ainda criava empates falsos.
      const scored = (p) => typeof p.grossTotal === "number" && p.grossTotal < 900;

      // Quantos jogadores partilham cada posição (empate não desfeito pelo
      // countback) → os pontos são a média dos lugares ocupados.
      const shareCount = new Map();
      for (const p of (t.players || [])) {
        if (!scored(p)) continue;
        const k = String(p.pos);
        shareCount.set(k, (shareCount.get(k) || 0) + 1);
      }
      for (const p of (t.players || [])) {
        const fed = String(p.fedCode || p.fed || "");
        if (!fed) continue;
        if (!scored(p)) continue;
        if (!m.has(fed)) m.set(fed, []);
        m.get(fed).push({
          date: t.date, pos: p.pos,
          pts: sharedPoints(p.pos, shareCount.get(String(p.pos)) || 1, isTour ? "tour" : "challenge"),
          shared: shareCount.get(String(p.pos)) || 1,
          name: p.name, isFinal: isFinalEvent(t.name), tournament: t.name,
        });
      }
    }
  }
}

/* ── Lado NOSSO: Circuito Aquapor ───────────────────────────────────────────
   Descoberto 2026-07-19 (RCAH26/RCAS26, clube 000): o ranking Aquapor é
   NACIONAL e SEPARADO POR SEXO — a classificação que pontua é a do leaderboard
   do sexo do jogador, não a geral. Ex: no 3º Aquapor (Vidago) a 1ª geral foi a
   Luciana Reis, mas no ranking masculino o 250 foi para o João Miguel Pereira.
   Por isso as posições são RECALCULADAS aqui a partir do gross, por sexo
   (o `pos` guardado nos aquapor-data é o do leaderboard combinado).
   O sexo vem do federados.json (campo `gender`), com os inactivos como
   fallback; quem não se resolve fica de fora (não é pontuado às cegas). */
const sexByFed = new Map();
// Primeiro os próprios rankings oficiais Aquapor: são a fonte autoritativa e
// cobrem quem não está no federados.json (estrangeiros, ex: Emil Bundgaard).
// Faltar um jogador desloca TODAS as posições abaixo dele nesse torneio.
for (const r of Object.values(RK)) {
  if ((r.series || "") !== "aquapor" || !r.sex) continue;
  for (const p of (r.players || [])) if (p.fed) sexByFed.set(String(p.fed), r.sex);
}
for (const f of ["federados.json", "federados-inativos.json"]) {
  const p = path.join(DATA, f);
  if (!fs.existsSync(p)) continue;
  try {
    for (const x of (JSON.parse(fs.readFileSync(p, "utf8")).players || [])) {
      const fed = String(x.federation_code ?? x.federation_number ?? "");
      const g = String(x.gender ?? "").trim().toUpperCase();
      if (fed && g && !sexByFed.has(fed)) sexByFed.set(fed, g.startsWith("F") || g === "S" ? "F" : "M");
    }
  } catch { /* ficheiro grande/corrompido — segue sem ele */ }
}

const oursAquapor = new Map();  // sexo → fed → [{date, pos, pts}]
{
  const files = fs.readdirSync(DATA).filter(f => new RegExp(`^aquapor-data-${YEAR}-\\d{2}\\.json$`).test(f));
  for (const f of files) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { continue; }
    for (const t of (j.tournaments || [])) {
      const scored = (p) => typeof p.grossTotal === "number" && p.grossTotal < 900;
      for (const sex of ["M", "F"]) {
        const field = (t.players || []).filter(p => scored(p) && sexByFed.get(String(p.fedCode || "")) === sex);
        if (!field.length) continue;
        // ⚠ O Aquapor NÃO desempata por countback: quem empata no gross
        // partilha o lugar e divide os pontos (medido no 3º Aquapor 2026).
        const sorted = assignPositionsSharingTies(field);
        const shareCount = new Map();
        for (const p of sorted) shareCount.set(p.pos, (shareCount.get(p.pos) || 0) + 1);
        if (!oursAquapor.has(sex)) oursAquapor.set(sex, new Map());
        const m = oursAquapor.get(sex);
        for (const p of sorted) {
          const fed = String(p.fedCode || "");
          if (!fed) continue;
          if (!m.has(fed)) m.set(fed, []);
          m.get(fed).push({
            date: t.date, pos: p.pos,
            pts: sharedPoints(p.pos, shareCount.get(p.pos) || 1, "aquapor"),
            name: p.name, isFinal: isFinalEvent(t.name), tournament: t.name,
          });
        }
      }
    }
  }
}

const topN = (nums, n) => [...nums].sort((a, b) => b - a).slice(0, n).reduce((s, x) => s + x, 0);

/* Linha sintética do RFDC_ que agrega a fase regular (não é uma prova). */
const isFaseRegular = (name) => /fase\s+regular/i.test(String(name || ""));

/** melhores-N da FASE REGULAR de um ranking final (RFDC_): herdado do DC_
 *  irmão (mesma zona/escalão/tipo/ano), cujo detalhe tem provas a sério. */
function siblingBestN(r) {
  for (const [, x] of Object.entries(RK)) {
    if ((x.series || "challenge") !== "challenge") continue;
    if (x.zone !== r.zone || x.escalao !== r.escalao || x.type !== r.type) continue;
    if (String(x.year) !== String(r.year)) continue;
    return detectedBestN.get(x.code) ?? null;
  }
  return null;
}

/* ── Nível 2: tabela de pontos empírica (pares pos→pontos dos detalhes) ── */
const empirical = new Map();  // `${serie}|${pos}` → Map(points → count)
function collectEmpirical(r) {
  const serie = r.series || "challenge";
  for (const p of r.players) {
    for (const res of (p.results || [])) {
      // A linha "Fase Regular" é um AGREGADO (pos = lugar no ranking, pontos =
      // total da época) — envenenaria a tabela pos→pontos.
      if (isFaseRegular(res.tournament)) continue;
      const pos = parseInt(String(res.pos), 10);
      const pts = Number(res.points);
      if (!Number.isFinite(pos) || !Number.isFinite(pts) || pts <= 0) continue;
      const key = `${serie}|${pos}`;
      if (!empirical.has(key)) empirical.set(key, new Map());
      const m = empirical.get(key);
      m.set(pts, (m.get(pts) || 0) + 1);
    }
  }
}

/** Melhores-N que explica os totais oficiais de um ranking (3..6). */
function fitBestN(r) {
  let best = { n: null, misses: Infinity };
  for (let n = 3; n <= 6; n++) {
    let misses = 0;
    for (const p of r.players) {
      if (!p.results?.length || p.points == null) continue;
      if (Math.abs(topN(p.results.map(x => Number(x.points) || 0), n) - Number(p.points)) > 0.01) misses++;
    }
    if (misses < best.misses) best = { n, misses };
  }
  return best;
}

/* Pré-passagem: N de cada ranking, para os RFDC_ poderem herdar o do DC_ irmão
   (a ordem das chaves no JSON não garante que o irmão já foi processado). */
const detectedBestN = new Map();
for (const [code, r] of Object.entries(RK)) {
  if (!r.players?.some(p => p.results?.length)) continue;
  detectedBestN.set(code, fitBestN(r).n);
}

/* ── Verificação por ranking ────────────────────────────────────────────── */
const report = { checkedAt: new Date().toISOString(), year: YEAR, rankings: {}, pointsTable: {}, summary: {} };
let nOK = 0, nDiff = 0, nSkipped = 0;

for (const [code, r] of Object.entries(RK)) {
  if (ONLY_CODE && code !== ONLY_CODE) continue;
  if (String(r.year) !== String(YEAR)) { nSkipped++; continue; }
  const hasDetails = r.players.some(p => p.results?.length);
  if (hasDetails) collectEmpirical(r);

  const entry = { code, series: r.series || "challenge", zone: r.zone, escalao: r.escalao, type: r.type, sex: r.sex ?? null, issues: [] };

  // 1) INTERNO: detectar melhores-N (só com detalhe)
  // (nos RFDC_ o "N" é meaningless — o total é fase regular + final, 2 linhas)
  let bestN = null;
  if (hasDetails && (r.series || "challenge") !== "challenge-final") {
    const bestFit = fitBestN(r);
    bestN = bestFit.n;
    entry.bestN = bestN;
    entry.bestNmisses = bestFit.misses;
    if (bestFit.misses > 0) {
      entry.issues.push(`regra melhores-${bestN} não explica ${bestFit.misses} totais oficiais (peso especial?)`);
    }
  }

  // 3) EXTERNO (só gross): comparar com os nossos dados
  if (r.type === "gross") {
    const isTour = (r.series || "challenge") === "tour";
    const isFinalRanking = (r.series || "challenge") === "challenge-final";
    const isAquapor = (r.series || "challenge") === "aquapor";
    const m = isAquapor ? (oursAquapor.get(r.sex) || new Map())
      : isTour ? (oursTour.get(r.zone) || new Map())
      : (oursChallenge.get(`${r.zone}|${r.escalao}`) || new Map());
    // A fase regular conta melhores-N; o ranking FINAL soma-lhe a Final ×1.5.
    // O bestN detectado num RFDC_ é lixo (só tem 2 linhas por jogador), por
    // isso herda-se o do DC_ irmão — mesma zona/escalão/tipo.
    const n = (isFinalRanking ? siblingBestN(r) : bestN) ?? 4;

    // ── Desfasamento da FPG ──────────────────────────────────────────────
    // Os rankings são carregados dias depois das provas. Comparar provas que
    // a FPG ainda não publicou dá "divergências" que não são erro nenhum
    // (ex: o 4º Aquapor de 18-07 fazia 29 falsos positivos no dia seguinte).
    // Corta-se tudo o que é posterior à última prova conhecida do OFICIAL.
    let maxOficial = null;
    for (const p of r.players) {
      for (const res of (p.results || [])) {
        if (isFaseRegular(res.tournament)) continue;
        if (res.date && (!maxOficial || res.date > maxOficial)) maxOficial = res.date;
      }
    }
    const dentroDoPrazo = (x) => !maxOficial || !x.date || x.date <= maxOficial
      || Math.abs(Date.parse(x.date) - Date.parse(maxOficial)) <= 1.5 * 86400000;
    entry.oficialAte = maxOficial;

    for (const p of r.players) {
      if (!p.fed) continue;
      const all = m.get(String(p.fed));
      const mine = all?.filter(dentroDoPrazo);
      const ignoradas = (all?.length || 0) - (mine?.length || 0);
      if (ignoradas > 0) entry.provasIgnoradas = (entry.provasIgnoradas || 0) + ignoradas;
      const oficialTotal = Number(p.points) || 0;
      if (!mine || !mine.length) {
        if (oficialTotal > 0) entry.issues.push(`${p.name}: oficial=${oficialTotal} mas SEM dados nossos`);
        continue;
      }
      // A Final NACIONAL não conta em ranking regional nenhum; a Final da zona
      // só conta no ranking FINAL (RFDC_), e aí a ×1.5.
      const regular = mine.filter(x => !x.isFinal);
      const finais = mine.filter(x => x.isFinal && !isNacionalFinal(x.tournament));
      const myRegular = topN(regular.map(x => x.pts), n);
      const myFinal = isFinalRanking
        ? finais.reduce((s, x) => s + finalPoints(x.pos, "challenge"), 0)
        : 0;
      const myTotal = myRegular + myFinal;
      if (Math.abs(myTotal - oficialTotal) > 0.01) {
        const how = isFinalRanking
          ? `melhores-${n}=${myRegular} + final×${FINAL_WEIGHT}=${myFinal}`
          : `melhores-${n}`;
        entry.issues.push(`${p.name}: oficial=${oficialTotal} nosso(${how})=${myTotal} (${regular.length} provas nossas${p.results ? ` vs ${(p.results || []).filter(x => !isFaseRegular(x.tournament)).length} oficiais` : ""})`);
      }
      // prova a prova (com detalhe): match por data com tolerância ±1 dia
      // (eventos de 2 dias: o oficial usa a data final, nós às vezes a inicial).
      // Provas oficiais a 0 pts são WD/DNS/posição fora da tabela — ignoradas
      // (nós excluímos WD/DNS de propósito e 0 pts não afecta totais).
      const near = (a, b) => {
        const pa = Date.parse(a), pb = Date.parse(b);
        return Number.isFinite(pa) && Number.isFinite(pb) && Math.abs(pa - pb) <= 1.5 * 86400000;
      };
      for (const res of (p.results || [])) {
        if (!(Number(res.points) > 0)) continue;
        if (isFaseRegular(res.tournament)) {
          // Linha sintética do RFDC_: tem de bater certo com a nossa fase regular.
          if (Math.abs((Number(res.points) || 0) - myRegular) > 0.01) {
            entry.issues.push(`${p.name}: fase regular oficial=${res.points} vs nosso(melhores-${n})=${myRegular}`);
          }
          continue;
        }
        // ⚠ O match por data com tolerância ±1 dia NÃO pode cruzar a fronteira
        // Final/prova regular: a Final é tipicamente no dia seguinte ao último
        // torneio da fase regular e o ±1 dia casava-os um com o outro (dava
        // "divergência de pontos" onde na verdade nos FALTA uma prova).
        const isFinalRes = isFinalEvent(res.tournament);
        const sameKind = (x) => !!x.isFinal === isFinalRes;
        const mineT = mine.find(x => x.date === res.date && sameKind(x))
                   || mine.find(x => near(x.date, res.date) && sameKind(x));
        if (!mineT) { entry.issues.push(`${p.name} ${res.date}: prova oficial (${res.points} pts) FALTA nos nossos dados — "${res.tournament}"`); continue; }
        const myPts = isFinalRes ? finalPoints(mineT.pos, "challenge") : mineT.pts;
        if (Math.abs((Number(res.points) || 0) - myPts) > 0.01) {
          entry.issues.push(`${p.name} ${res.date}: pts oficial=${res.points} (pos ${res.pos}) vs nosso=${myPts} (pos ${mineT.pos})${isFinalRes ? ` [final ×${FINAL_WEIGHT}]` : ""}`);
        }
      }
    }
  }

  report.rankings[code] = entry;
  if (entry.issues.length === 0) { nOK++; }
  else {
    nDiff++;
    console.log(`\n⚠ ${code} (${entry.series} ${r.zone} ${r.escalao ?? "todos"} ${r.type}) — ${entry.issues.length} divergências:`);
    for (const i of entry.issues.slice(0, 10)) console.log(`   · ${i}`);
    if (entry.issues.length > 10) console.log(`   … +${entry.issues.length - 10}`);
  }
}

/* ── Relatório da tabela de pontos empírica ─────────────────────────────── */
if (empirical.size > 0) {
  const rows = [...empirical.entries()].sort((a, b) => {
    const [sa, pa] = a[0].split("|"); const [sb, pb] = b[0].split("|");
    return sa === sb ? Number(pa) - Number(pb) : sa.localeCompare(sb);
  });
  const tableIssues = [];
  for (const [key, counts] of rows) {
    const [serie, posStr] = key.split("|");
    const pos = Number(posStr);
    // via drivePoints() para a série ser respeitada (aquapor usa a tabela Tour)
    const variants = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const modal = variants[0][0];
    // Nos rankings finais os pontos observados são os da Final: tabela ×1.5.
    const oursV = serie === "challenge-final"
      ? finalPoints(pos, "challenge")
      : drivePoints(pos, serie);
    report.pointsTable[key] = { oficial: modal, nosso: oursV, amostras: variants.map(([v, c]) => `${v}×${c}`).join(" ") };
    // Um valor alternativo é ESPERADO quando é a média de um empate partilhado
    // (2 no 14º → (23+22)/2 = 22.5). Só os inexplicados é que são problema.
    const explained = (v) =>
      v === oursV || [2, 3, 4].some(k => Math.abs(sharedPoints(pos, k, serie) - v) < 0.01);
    const unexplained = variants.filter(([v]) => !explained(v));
    // (o ramo "oficial vs nosso" seria redundante: um valor que difere do
    //  nosso e não é média de empate já cai em `unexplained`. Ex: o 9 no 20º
    //  do Aquapor é o empate no 20º com o 21º, que já não pontua → (18+0)/2.)
    if (unexplained.length) {
      tableIssues.push(`${serie} pos ${pos}: valores oficiais inexplicados [${unexplained.map(([v, c]) => `${v}(${c}×)`).join(", ")}] — nosso=${oursV}`);
    }
  }
  if (tableIssues.length) {
    console.log(`\n⚠ TABELA DE PONTOS (empírica, ${rows.length} posições observadas):`);
    for (const i of tableIssues) console.log(`   · ${i}`);
    report.summary.pointsTableIssues = tableIssues;
  } else {
    console.log(`\n✓ Tabela de pontos: ${rows.length} posições observadas, todas iguais à nossa DRIVE_POINTS`);
  }
}

report.summary.ok = nOK;
report.summary.divergent = nDiff;
console.log(`\n═══ ${nOK} rankings iguais · ${nDiff} com divergências · ${nSkipped} fora do ano ${YEAR}`);
writeJsonAtomic(OUT_FILE, report);
console.log(`[verify-rk] relatório em ${OUT_FILE}`);
process.exit(nDiff === 0 ? (nOK > 0 ? 0 : 2) : 1);
