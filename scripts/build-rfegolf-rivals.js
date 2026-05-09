/**
 * scripts/build-rfegolf-rivals.js
 *
 * Consolida torneios juvenis espanhois (livegolfscoring + NextCaddy) num único
 * ficheiro compacto que o KIDSdataLoader pode processar com 1 fetch.
 *
 * Output: public/data/rfegolf-rivals.json
 *
 * Tids:
 *   lgs{id}              — livegolfscoring
 *   nc{id}_{ageKey}      — NextCaddy (uma entrada por categoria juvenil)
 */
const fs = require("fs");
const path = require("path");

const LGS_DIR = path.resolve(__dirname, "../public/data/rfegolf-livegolfscoring");
const NC_DIR = path.resolve(__dirname, "../public/data/nextcaddy");
const OUT = path.resolve(__dirname, "../public/data/rfegolf-rivals.json");

function isJuvenil(name) {
  return /\b(Sub-?\d+|Alev[íi]n|Benjam[íi]n|Infantil|Cadete|Junior|Juvenil)\b/i.test(name || "");
}

function extractAgeGroup(name) {
  if (!name) return null;
  const m = name.match(/Sub[\s-]?(\d+)/i);
  if (m) return "Sub-" + m[1];
  if (/Alev[íi]n/i.test(name)) return "Alevín";
  if (/Benjam[íi]n/i.test(name)) return "Benjamín";
  if (/Infantil/i.test(name)) return "Infantil";
  if (/Cadete/i.test(name)) return "Cadete";
  if (/Junior/i.test(name)) return "Junior";
  if (/Juvenil/i.test(name)) return "Juvenil";
  return null;
}

const out = {
  generatedAt: new Date().toISOString(),
  source: "scripts/build-rfegolf-rivals.js",
  torneios: {},
};

// ─── 1) LiveGolfScoring (LGS) ─────────────────────────────────
let lgsKept = 0, lgsSkipped = 0;
const lgsFiles = fs.existsSync(LGS_DIR)
  ? fs.readdirSync(LGS_DIR).filter(f => /^\d+\.json$/.test(f))
  : [];

for (const f of lgsFiles) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(LGS_DIR, f), "utf-8"));
    if (!d.ok) { lgsSkipped++; continue; }
    const name = d.meta?.name || "";
    if (!isJuvenil(name)) { lgsSkipped++; continue; }
    const year = d.meta?.year ?? null;
    const ageGroup = extractAgeGroup(name);
    const par = d.rounds?.[0]?.par;
    if (!Array.isArray(par) || par.length !== 18) { lgsSkipped++; continue; }
    const parTotal = par.reduce((a, b) => a + b, 0);

    const agg = {};
    for (const r of d.rounds || []) {
      for (const p of r.players || []) {
        const key = p.memberId || p.name;
        if (!agg[key]) agg[key] = { name: p.name, scoresByRound: [], totalsByRound: [], pos: null, total: null, toPar: null };
        if (Array.isArray(p.scores) && p.scores.length === 18) {
          agg[key].scoresByRound.push(p.scores);
          agg[key].totalsByRound.push(p.total ?? 0);
        }
      }
    }
    const lastR = d.rounds[d.rounds.length - 1];
    if (lastR) {
      for (const p of lastR.players || []) {
        const key = p.memberId || p.name;
        if (agg[key]) {
          agg[key].pos = p.pos;
          agg[key].toPar = p.toPar;
          agg[key].total = agg[key].totalsByRound.reduce((a, b) => a + b, 0);
        }
      }
    }

    const players = Object.values(agg).filter(a => a.totalsByRound.length > 0);
    if (players.length === 0) { lgsSkipped++; continue; }

    const tid = `lgs${d.id}`;
    out.torneios[tid] = {
      name, year, ageGroup,
      dateIso: d.meta?.dateIso || null,
      dateRange: d.meta?.dateRange || null,
      par, parTotal,
      nholes: 18,
      nRounds: d.rounds.length,
      source: "lgs",
      players: players.map(a => ({
        n: a.name,
        p: a.pos,
        t: a.total,
        tp: a.toPar,
        rd: a.totalsByRound,
        sc: a.scoresByRound,
      })),
    };
    lgsKept++;
  } catch (e) { lgsSkipped++; }
}

// ─── 2) NextCaddy ─────────────────────────────────────────────
function ncCatToAgeGroup(cat) {
  if (!cat) return null;
  if (/Alev[íi]n/i.test(cat)) return "Alevín";
  if (/Benjam[íi]n/i.test(cat)) return "Benjamín";
  if (/Infantil/i.test(cat)) return "Infantil";
  if (/Cadete/i.test(cat)) return "Cadete";
  if (/Junior/i.test(cat)) return "Junior";
  if (/Juvenil/i.test(cat)) return "Juvenil";
  return null;
}

/** Especificidade de um escalão. Maior = mais específico.
 *  Usado para deduplicar quando o mesmo jogador aparece em múltiplas categorias
 *  do mesmo NC tour (típico: classificado em Alevín ESPECÍFICO + Juvenil PARENT). */
function ageSpecificity(ag) {
  if (!ag) return 0;
  // Mais específicos primeiro
  if (/Benjam[íi]n/i.test(ag)) return 100;
  if (/Alev[íi]n/i.test(ag)) return 90;
  if (/Infantil/i.test(ag)) return 80;
  if (/Cadete/i.test(ag)) return 70;
  if (/^Sub-?\d+$/i.test(ag)) return 60;     // Sub-N (numeric)
  if (/Junior/i.test(ag)) return 50;
  if (/Juvenil/i.test(ag)) return 10;        // Juvenil é parent de tudo, fica último
  return 30;
}

let ncKept = 0, ncSkipped = 0, ncEntriesAdded = 0;
const ncFiles = fs.existsSync(NC_DIR)
  ? fs.readdirSync(NC_DIR).filter(f => /^\d+\.json$/.test(f))
  : [];

for (const f of ncFiles) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(NC_DIR, f), "utf-8"));
    const tourId = d.tourId;
    if (!tourId) { ncSkipped++; continue; }
    const name = d.meta?.name || "";
    const par = d.course?.par;
    // Aceita 9H ou 18H. Skip se par ausente — UI (KIDSdataLoader) requer par[]
    if (!Array.isArray(par) || (par.length !== 18 && par.length !== 9)) { ncSkipped++; continue; }
    const nholes = par.length;
    const parTotal = par.reduce((a, b) => a + b, 0);
    const dateIso = d.meta?.dateIso || null;
    const year = dateIso ? parseInt(dateIso.slice(0, 4), 10) : null;

    const lb = Array.isArray(d.leaderboard) ? d.leaderboard : [];
    if (lb.length === 0) { ncSkipped++; continue; }

    let anyAdded = false;
    for (let bi = 0; bi < lb.length; bi++) {
      const block = lb[bi];
      const players = Array.isArray(block.players) ? block.players : [];
      if (players.length === 0) continue;

      // Preferir block.categoryName (formato novo, descritivo) — fallback para
      // antigo meta.categories[block.category] (que indexa array genérico)
      let catName = block.categoryName || null;
      if (!catName && Array.isArray(d.meta?.categories) && typeof block.category === "number") {
        catName = d.meta.categories[block.category] || null;
      }
      if (!catName) catName = (players[0] && (players[0].nivel || players[0].catEdad)) || null;
      if (!catName) catName = name;
      const ageGroup = ncCatToAgeGroup(catName) || extractAgeGroup(catName) || extractAgeGroup(name);
      if (!ageGroup) continue;
      // Evitar dupes: skip "1ª/2ª/3ª Jornada" e "Resultados Scratch X J." (intermédias).
      // Apenas categorias Final ou single-round (sem prefixo Jornada) ficam.
      // O Niko deve ter UMA entrada por tour+escalão (a Final).
      if (/\b\d+[ªa]\.?\s*Jornada\b/i.test(catName)
          || /\b\d+[ªa]\s*J\.?\s*$/i.test(catName)              // "1ª J." no fim
          || /\b\d+[ªa]\s*[Jj]\b/.test(catName)                  // "1ªj" inline
          || /^Resultados\s+(Scratch|Hcp)\s+\d+\s*J\b/i.test(catName)) continue;

      const expectedHoles = nholes || 18;
      const enriched = [];
      for (const p of players) {
        const rs = Array.isArray(p.roundScores) ? p.roundScores : [];
        const valid = rs.filter(r => Array.isArray(r.scores) && r.scores.length === expectedHoles);
        const totalsByRound = valid.map(r =>
          (typeof r.total === "number") ? r.total :
          (r.scores.filter(x => x > 0).reduce((a, b) => a + b, 0) || 0)
        );
        const scoresByRound = valid.map(r => r.scores);
        const totalFromRounds = totalsByRound.reduce((a, b) => a + b, 0);
        const total = (typeof p.total === "number") ? p.total : (totalFromRounds || null);
        // INCLUIR mesmo sem scorecards: usa só pos+total+toPar para ranking
        // (cp00 tem 101 PDF-only e ~30 lb-only que beneficiam)
        if (total == null && (p.pos == null || p.pos === "")) continue;
        enriched.push({
          n: p.name,
          p: p.pos == null ? null : p.pos,
          t: total || null,
          tp: p.toPar == null ? null : p.toPar,
          hcp: typeof p.hcp === "number" ? p.hcp : null,
          lic: p.licencia || null,
          rd: totalsByRound,
          sc: scoresByRound,
        });
      }

      if (enriched.length === 0) continue;

      const ageKey = ageGroup.replace(/[\s-]/g, "").toLowerCase();
      // Detectar Scratch vs Handicap pelo NOME da categoria (mais fiável que heurística).
      // "Final Alevin Scratch Indistinto" → scratch. "Final Alevin Handicap" → handicap.
      // Tids ficam separados quando ambos existem no mesmo tour+ageGroup,
      // permitindo mostrar os dois na UI (gross + net).
      const isScratch = /\bScratch\b/i.test(catName);
      const isHandicap = /\bHandicap\b|\bHcp\b/i.test(catName) || /\bHcp\s+J\b/i.test(catName);
      const typeSuffix = isHandicap ? "_hcp" : (isScratch ? "_sc" : "");
      const tid = `nc${tourId}_${ageKey}${typeSuffix}`;
      const nRounds = Math.max(1, ...players.flatMap(p =>
        (p.roundScores || []).map(r => r.round || 0)
      ));

      // Metros e SI do campo (NC expõe via course.meters / course.si)
      const meters = (Array.isArray(d.course?.meters) && d.course.meters.length === 18) ? d.course.meters : null;
      const si = (Array.isArray(d.course?.si) && d.course.si.length === 18) ? d.course.si : null;
      // ─── Heurística SCRATCH vs HANDICAP ───
      // Em Espanha "Scratch" = gross, "Handicap" = net (gross − hcp).
      // Se total === sum(scoresByRound) → SCRATCH.
      // Se total < sum(scores) → HANDICAP (handicap subtraído do total).
      // Sample TODOS os players (não apenas 10) para detecção robusta.
      let scoringType = "SCRATCH";
      let netCount = 0, sampleSize = 0;
      for (const p of players) {
        if (typeof p.total !== "number") continue;
        const rs = Array.isArray(p.roundScores) ? p.roundScores : [];
        let grossSum = 0;
        let validRounds = 0;
        for (const r of rs) {
          if (Array.isArray(r.scores) && r.scores.length === 18) {
            grossSum += r.scores.filter(x => x > 0).reduce((a, b) => a + b, 0);
            validRounds++;
          }
        }
        if (validRounds === 0) continue;
        sampleSize++;
        if (grossSum - p.total > 1) netCount++;
      }
      if (sampleSize > 0 && netCount / sampleSize > 0.5) {
        scoringType = "HANDICAP";
      }
      out.torneios[tid] = {
        name,
        categoryName: catName,    // descritivo: "Final Alevin Scratch Indistinto"
        year, ageGroup,
        dateIso, dateRange: d.meta?.dateStart || null,
        par, parTotal,
        meters,
        si,
        nholes: expectedHoles, nRounds,
        source: "nextcaddy",
        scoringType,   // "SCRATCH" | "HANDICAP"
        players: enriched,
      };
      ncEntriesAdded++;
      anyAdded = true;
    }
    if (anyAdded) ncKept++;
    else ncSkipped++;
  } catch (e) {
    ncSkipped++;
  }
}

out.total = Object.keys(out.torneios).length;
out.dedupedPlayers = 0;
fs.writeFileSync(OUT, JSON.stringify(out));
const size = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
console.log("Built rfegolf-rivals: LGS " + lgsKept + "/" + (lgsKept + lgsSkipped) + ", NC " + ncKept + " files (" + ncEntriesAdded + " cats) -> " + out.total + " torneios -> " + OUT + " (" + size + " MB)");
