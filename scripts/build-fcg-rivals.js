/**
 * scripts/build-fcg-rivals.js
 *
 * Agrega os JSONs em public/data/fcg/{gameId}.json (output do scrape-fcg.js)
 * num único public/data/fcg-rivals.json compatível com o formato consumido
 * pelo KIDSdataLoader (ver public/data/rfegolf-rivals.json para referência).
 *
 * Cruza licenças CB (Catalã) e AD (Andorra) com licencia-dob-lookup.json
 * para anexar DOB onde disponível.
 *
 * Output: public/data/fcg-rivals.json
 *   {
 *     generatedAt, source,
 *     totalGames, totalCategories, totalEntries, totalUniquePlayers,
 *     dobMatched, dobMatchedPct,
 *     torneios: {
 *       "fcg{gameId}_{ageKey}": {
 *         name, year, ageGroup, dateIso, source: "fcg",
 *         tournament, tournamentId, club, courseName,
 *         par, parTotal, nholes, nRounds,
 *         players: [{ n, p, t, tp, hcpExact, license, country, sex, rd, sc, dob, dobIso }]
 *       }
 *     }
 *   }
 *
 * USO:
 *   node scripts/build-fcg-rivals.js
 */

"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const FCG_DIR = path.join(REPO, "public", "data", "fcg");
const OUT_FILE = path.join(REPO, "public", "data", "fcg-rivals.json");
const DOB_LOOKUP = path.join(REPO, "public", "data", "licencia-dob-lookup.json");

/* ── DOB lookup ─────────────────────────────────────────────────────────── */
let DOB = {};
try {
  const j = JSON.parse(fs.readFileSync(DOB_LOOKUP, "utf8"));
  DOB = j.lookup || {};
  console.log("[build] DOB lookup loaded:", Object.keys(DOB).length, "licenses");
} catch (e) {
  console.warn("[build] No DOB lookup found at", DOB_LOOKUP, "—", e.message);
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function ageKeyFromCategory(catName) {
  const t = (catName || "").toLowerCase();
  if (/benjam[íi]/.test(t)) return "Benjamín";
  if (/alev[íi]|sub-?12/.test(t)) return "Alevín";
  if (/infantil|sub-?14/.test(t)) return "Infantil";
  if (/cadet|sub-?16/.test(t)) return "Cadete";
  if (/junior|sub-?18/.test(t)) return "Junior";
  if (/sub-?21/.test(t)) return "Sub-21";
  if (/boy|girl/.test(t)) return "Junior";
  // GP CAD-INF agrupa Cadete + Infantil — usamos Cadete como tag dominante
  if (/gp.*cad/.test(t)) return "Cadete";
  return "Other";
}

function genderFromCategory(catName, catGender) {
  if (catGender === "M" || catGender === "F") return catGender;
  const t = (catName || "").toLowerCase();
  if (/femen[íi]/.test(t)) return "F";
  if (/mascul[íi]/.test(t)) return "M";
  return null;
}

function displayName(firstName, surname) {
  const fn = (firstName || "").trim();
  const sn = (surname || "").trim();
  // Output canónico no formato "SOBRENOME, Nome" ou "FirstName Surname" — vamos
  // usar "FirstName Surname" para ser legível.
  return [fn, sn].filter(Boolean).join(" ");
}

// `view.day` ou `view.acc` do ranking dá-nos os totais por jogador.
// `acc.strokeNumber` é o gross acumulado, `acc.result` é to-par acumulado.
// `previous[]` lista as rondas anteriores (cada um tem o mesmo formato).
// Da tee box: gameTee tem par1_18, hcp1_18 (SI), meters1_18.

function ronda(playerEntry) {
  // Output "rd[]" (rounds) e "sc[][]" (per-round hbh scores)
  // No formato fcg actual, scorecard.gross é o array da ronda mais recente (J1
  // ou J2). Os anteriores vêm em previous[]. Como nem sempre temos os
  // scorecards anteriores, devolvemos só o que conseguimos.
  const rd = [];
  const sc = [];
  if (playerEntry.scorecard && Array.isArray(playerEntry.scorecard.gross)) {
    const g = playerEntry.scorecard.gross.filter((x) => typeof x === "number");
    if (g.length === 18 || g.length === 9) {
      const total = g.reduce((a, b) => a + b, 0);
      rd.push(total);
      sc.push(playerEntry.scorecard.gross);
    }
  }
  // previous[] traz os totais (acc/day) de cada ronda anterior, mas não os
  // scores hbh — acrescentamos só o total nesses casos.
  if (Array.isArray(playerEntry.previous) && playerEntry.previous.length > 1) {
    // O previous[] pode duplicar o ronda atual; deixamos como está por agora
    // — ajustamos em iterações futuras se virmos torneios multi-ronda reais.
  }
  return { rd, sc };
}

/* ── Build ──────────────────────────────────────────────────────────────── */

function build() {
  if (!fs.existsSync(FCG_DIR)) {
    console.error("[build] No fcg dir at", FCG_DIR);
    process.exit(1);
  }
  const files = fs.readdirSync(FCG_DIR).filter((f) => f.endsWith(".json")).sort();
  console.log("[build] processing", files.length, "fcg JSONs");

  const torneios = {};
  let totalGames = 0, totalCategories = 0, totalEntries = 0, dobMatched = 0;
  const uniqueLicenses = new Set();

  for (const f of files) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(FCG_DIR, f), "utf8")); }
    catch (e) { console.warn("[build] skip", f, "—", e.message); continue; }
    if (!d || !d.gameId || !Array.isArray(d.categories)) continue;

    totalGames++;
    const gameId = d.gameId;
    const game = d.game || {};
    const tournamentName = (game.tournament && game.tournament.name) || game.name || gameId;
    const tournamentId = (game.tournament && game.tournament._id) || null;
    const club = (game.club && game.club.name) || null;
    const course = (game.course && game.course.name) || null;
    const startDate = game.scheduleStartDate || null;
    const dateIso = startDate ? startDate.slice(0, 10) : null;
    const year = dateIso ? parseInt(dateIso.slice(0, 4), 10) : null;
    const status = game.status;

    for (const cat of d.categories) {
      if (!cat.players || cat.players.length === 0) continue; // skip vazios
      totalCategories++;

      const ageGroup = ageKeyFromCategory(cat.name);
      const tid = `fcg${gameId}_${ageGroup}_${cat._id.slice(-6)}`;

      // Determinar par/SI/holes a partir de UM scorecard
      let par1_18 = null, parTotal = null, nholes = null, courseRating = null, slope = null, teeColor = null;
      for (const p of cat.players) {
        if (p.scorecard && p.scorecard.gameTee) {
          const t = p.scorecard.gameTee;
          if (t.par1_18 && t.par1_18.length) {
            par1_18 = t.par1_18;
            parTotal = t.par;
            nholes = (t.par1_18.filter((x) => typeof x === "number").length) || 18;
            courseRating = t.rating;
            slope = t.slope;
            teeColor = t.color;
            break;
          }
        }
      }

      const players = cat.players.map((p) => {
        totalEntries++;
        if (p.license) uniqueLicenses.add(p.license);
        const lic = p.license;
        const dobEntry = lic ? DOB[lic] : null;
        if (dobEntry && dobEntry.dobIso) dobMatched++;

        const name = displayName(p.firstName, p.surname);
        const gender = p.gender || genderFromCategory(cat.name, cat.gender);
        const view = p.view || {};
        const day = view.day || {};
        const acc = view.acc || {};

        const { rd, sc } = ronda(p);

        return {
          n: name,
          p: typeof acc.realRanking === "number" ? acc.realRanking : (typeof acc.rankingPosition === "number" ? acc.rankingPosition : null),
          t: typeof acc.strokeNumber === "number" ? acc.strokeNumber : null,
          tp: typeof acc.onlyGross === "number" ? acc.onlyGross : (typeof acc.result === "number" ? acc.result : null),
          rd: rd,
          sc: sc.length > 0 ? sc : undefined,
          hcpExact: p.hcpExact,
          hcpGame: p.hcpGame,
          license: lic,
          country: p.country,
          sex: gender,
          dob: dobEntry && dobEntry.dob || null,
          dobIso: dobEntry && dobEntry.dobIso || null,
          club: dobEntry && dobEntry.club || null,
          status: p.isCardFinished ? "finished" : (p.isCardClosed ? "closed" : "in-progress"),
          teeColor: p.gameTeeColor,
          teeNumber: p.teeNumber,
          teeTime: p.teeTimeHour,
        };
      });

      torneios[tid] = {
        name: tournamentName + (cat.name ? ` — ${cat.name}` : ""),
        gameId: gameId,
        gameName: game.name,
        tournamentName: tournamentName,
        tournamentId: tournamentId,
        category: cat.name,
        categoryId: cat._id,
        gender: cat.gender || genderFromCategory(cat.name, cat.gender),
        ageGroup: ageGroup,
        year: year,
        dateIso: dateIso,
        status: status,
        club: club,
        courseName: course,
        teeColor: teeColor,
        courseRating: courseRating,
        slope: slope,
        par: par1_18,
        parTotal: parTotal,
        nholes: nholes,
        nRounds: 1, // golfdirecto game = 1 jornada
        source: "fcg",
        players: players,
      };
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: "scripts/build-fcg-rivals.js",
    totalGames: totalGames,
    totalCategories: totalCategories,
    totalEntries: totalEntries,
    totalUniquePlayers: uniqueLicenses.size,
    dobMatched: dobMatched,
    dobMatchedPct: totalEntries > 0 ? +(100 * dobMatched / totalEntries).toFixed(1) : 0,
    torneios: torneios,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 0));
  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log("[build] wrote", path.relative(REPO, OUT_FILE), "—", kb, "KB");
  console.log("[build] stats: games=" + totalGames, "categories=" + totalCategories, "entries=" + totalEntries, "uniqueLicenses=" + uniqueLicenses.size, "dobMatched=" + dobMatched + " (" + out.dobMatchedPct + "%)");
}

if (require.main === module) {
  build();
}

module.exports = { build, ageKeyFromCategory };
