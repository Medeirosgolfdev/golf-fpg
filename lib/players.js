// lib/players.js — Discover and load player data
const fs = require("fs");
const path = require("path");

function loadPlayersJson(outputRoot) {
  // Try root players.json first (updated by sync), then output/players.json
  const rootPath = path.join(outputRoot, "..", "players.json");
  const outPath = path.join(outputRoot, "players.json");
  for (const pPath of [rootPath, outPath]) {
    if (fs.existsSync(pPath)) {
      try { return JSON.parse(fs.readFileSync(pPath, "utf-8")); } catch {}
    }
  }
  return {};
}

function calcEscalao(dob) {
  if (!dob) return "";
  const refYear = new Date().getFullYear();
  const y = Number(dob.split("-")[0]);
  if (!y) return "";
  const age = refYear - y;
  if (age >= 50) return "Sénior";
  if (age >= 19) return "Absoluto";
  if (age >= 17) return "Sub-18";
  if (age >= 15) return "Sub-16";
  if (age >= 13) return "Sub-14";
  if (age >= 11) return "Sub-12";
  return "Sub-10";
}

function discoverPlayers(outputRoot, currentFed) {
  const playersDb = loadPlayersJson(outputRoot);
  const players = [];
  if (!fs.existsSync(outputRoot)) return players;
  const dirs = fs.readdirSync(outputRoot).filter(d => {
    const full = path.join(outputRoot, d);
    return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, "whs-list.json"));
  });
  for (const fed of dirs) {
    const pj = playersDb[fed];
    let name = "";
    let escalao = "";
    let dob = "";
    let club = "";
    let region = "";
    let sex = "";
    let hcp = null;
    let tags = [];
    if (pj) {
      if (typeof pj === "string") {
        name = pj;
      } else {
        name = pj.name || "";
        dob = pj.dob || "";
        escalao = pj.escalao || calcEscalao(dob);
        club = (typeof pj.club === "object" && pj.club) ? (pj.club.short || "") : (pj.club || "");
        region = pj.region || "";
        sex = pj.sex || "";
        hcp = (pj.hcp != null) ? Number(pj.hcp) : null;
        tags = Array.isArray(pj.tags) ? pj.tags : [];
      }
    }
    if (!name) {
      try {
        const whs = JSON.parse(fs.readFileSync(path.join(outputRoot, fed, "whs-list.json"), "utf-8"));
        const top = whs?.d ?? whs;
        const rows = top?.Records || [];
        const sources = [top, rows[0]].filter(Boolean);
        for (const src of sources) {
          if (name) break;
          const cands = [
            src?.player_name, src?.PlayerName, src?.player,
            src?.first_name && src?.last_name ? (src.first_name + " " + src.last_name) : null,
            src?.nome, src?.Nome, src?.name, src?.Name,
          ];
          for (const c of cands) {
            if (c && String(c).trim()) { name = String(c).trim(); break; }
          }
        }
      } catch {}
    }
    players.push({
      fed,
      name: name || ("Federado " + fed),
      escalao, dob, club, region, sex, hcp, tags,
      birthYear: dob ? dob.substring(0, 4) : "",
      isCurrent: fed === currentFed
    });
  }
  players.sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    return a.name.localeCompare(b.name);
  });
  return players;
}

module.exports = { loadPlayersJson, calcEscalao, discoverPlayers };
