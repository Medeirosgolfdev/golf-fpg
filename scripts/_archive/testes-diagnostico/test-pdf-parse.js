const fs = require("fs");
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

function parseLeaderboardPdf(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  let nRounds = 0;
  for (const ln of lines.slice(0, 15)) {
    if (/^Pos\.Nombre/i.test(ln)) {
      const ms = ln.match(/R\d+/g);
      if (ms) nRounds = ms.length;
      break;
    }
  }
  if (!nRounds) nRounds = 4;

  let courseRating = null, slope = null;
  for (const ln of lines.slice(0, 10)) {
    const m = ln.match(/Valor del campo:\s*([\d.]+)\s*\|\s*Slope:\s*(\d+)/i);
    if (m) { courseRating = parseFloat(m[1]); slope = parseInt(m[2], 10); }
  }

  const reLine = new RegExp(
    "^(\\d{1,3})?([A-ZÁ-Ú\\s,'\\.\\-ÑÜ]+?)" +
    "([+\\-]\\d{1,3}|E)" +
    "([+\\-]\\d{1,3}|E)" +
    "((?:\\d{2,3}){" + nRounds + "})" +
    "(\\d{2,3})$"
  );

  const players = [];
  let lastPos = null;
  for (const ln of lines) {
    if (/^Pos\.Nombre/i.test(ln)) continue;
    if (/Página\s+\d+/i.test(ln)) continue;
    if (/Real Federación|Fecha:|finalizada|Valor del campo|^Del\s/i.test(ln)) continue;
    const m = reLine.exec(ln);
    if (!m) continue;
    const posRaw = m[1];
    const name = m[2].trim().replace(/\s{2,}/g, " ");
    const toPar = m[3] === "E" ? 0 : parseInt(m[3], 10);
    const hoy = m[4] === "E" ? 0 : parseInt(m[4], 10);
    const roundsStr = m[5];
    const total = parseInt(m[6], 10);
    const rounds = [];
    if (roundsStr.length === nRounds * 2) {
      for (let i = 0; i < nRounds; i++) rounds.push(parseInt(roundsStr.slice(i*2, i*2+2), 10));
    } else if (roundsStr.length === nRounds * 3) {
      for (let i = 0; i < nRounds; i++) rounds.push(parseInt(roundsStr.slice(i*3, i*3+3), 10));
    } else {
      let j = 0;
      for (let i = 0; i < nRounds; i++) {
        let v = parseInt(roundsStr.slice(j, j+2), 10);
        if (v < 50 && j + 3 <= roundsStr.length) {
          v = parseInt(roundsStr.slice(j, j+3), 10);
          j += 3;
        } else {
          j += 2;
        }
        rounds.push(v);
      }
    }
    if (posRaw) lastPos = parseInt(posRaw, 10);
    players.push({ pos: lastPos, name, toPar, hoy, rounds, total });
  }
  return { nRounds, players, courseRating, slope };
}

(async () => {
  const buf = fs.readFileSync("/tmp/result.pdf");
  const d = await pdfParse(buf);
  const lb = parseLeaderboardPdf(d.text);
  console.log("nRounds:", lb.nRounds, "rating:", lb.courseRating, "slope:", lb.slope);
  console.log("Total players:", lb.players.length);
  console.log("Top 10:");
  for (const p of lb.players.slice(0, 10)) {
    console.log("  " + p.pos + ": " + p.name + " | toPar " + p.toPar + " | R: " + p.rounds.join("-") + " | total " + p.total);
  }
  console.log("Last 5:");
  for (const p of lb.players.slice(-5)) {
    console.log("  " + p.pos + ": " + p.name + " | toPar " + p.toPar + " | R: " + p.rounds.join("-") + " | total " + p.total);
  }
})();
