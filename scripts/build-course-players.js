#!/usr/bin/env node
/**
 * build-course-players.js
 *
 * Constrói o `_players` (quem jogou cada campo, com o resultado) para os campos
 * PT do master-courses.json — que o `extract-courses.js` NÃO cobre (esse só faz
 * os campos away/internacionais; os PT são excluídos pelo shouldExclude).
 *
 * Lê as rondas de cada jogador em output/<nfed>/analysis/data.json e atribui-as
 * ao courseKey do master quando o nome da ronda bate com um campo registado.
 * Escreve public/data/course-players.json, que a App liga aos campos master em
 * runtime (a CamposPage passa a mostrar os jogadores também nos campos PT).
 *
 * Os campos away mantêm o seu _players (já vem no away-courses.json) — este
 * ficheiro só ACRESCENTA os campos do master, para não tocar na lógica away.
 *
 *   node scripts/build-course-players.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");
const OUTPUT = path.join(ROOT, "output");

function norm(s) {
  return String(s || "").trim().normalize("NFKD")
    .replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}
function toIso(d) {
  const m = String(d || "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
const numOr = (v) => (Number.isFinite(v) ? v : null);

function main() {
  const master = JSON.parse(fs.readFileSync(path.join(DATA, "master-courses.json"), "utf8")).courses || [];
  // norm(nome do campo) → courseKey do master
  const masterByNorm = {};
  for (const c of master) {
    const k = norm(c.master.name);
    if (k && !(k in masterByNorm)) masterByNorm[k] = c.courseKey;
  }

  // courseKey → { nfed → [rondas] }
  const players = {};
  let scanned = 0;
  if (fs.existsSync(OUTPUT)) {
    for (const dir of fs.readdirSync(OUTPUT)) {
      if (!/^\d+$/.test(dir)) continue;
      const fp = path.join(OUTPUT, dir, "analysis", "data.json");
      if (!fs.existsSync(fp)) continue;
      let data;
      try { data = JSON.parse(fs.readFileSync(fp, "utf8")); } catch { continue; }
      const nfed = String(data.CURRENT_FED || dir);
      scanned++;
      for (const c of (data.DATA || [])) {
        for (const r of (c.rounds || [])) {
          const name = (r.course || c.course || "").trim();
          const key = masterByNorm[norm(name)];
          if (!key) continue; // só campos PT do master
          const gross = numOr(r.gross);
          const par = numOr(r.par);
          const round = {
            date: toIso(r.date),
            gross,
            toPar: gross != null && par != null ? gross - par : null,
            tee: typeof r.tee === "string" ? r.tee : null,
            event: typeof r.eventName === "string" ? r.eventName : null,
            sd: numOr(r.sd),
          };
          (players[key] ||= {});
          (players[key][nfed] ||= []).push(round);
        }
      }
    }
  }

  // dedup (data+gross) + ordenar por data desc
  let totalLinks = 0;
  for (const key of Object.keys(players)) {
    for (const nfed of Object.keys(players[key])) {
      const seen = new Set();
      const uniq = [];
      for (const r of players[key][nfed]) {
        const k = `${r.date || ""}|${r.gross ?? ""}`;
        if (seen.has(k)) continue;
        seen.add(k); uniq.push(r);
      }
      uniq.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      players[key][nfed] = uniq;
      totalLinks++;
    }
  }

  const out = {
    generated: new Date().toISOString(),
    source: "output/<nfed>/analysis/data.json → master-courses.json",
    courses: Object.keys(players).length,
    links: totalLinks,
    players,
  };
  fs.writeFileSync(path.join(DATA, "course-players.json"), JSON.stringify(out));
  console.log(`Jogadores escaneados: ${scanned}`);
  console.log(`Campos PT com jogadores: ${Object.keys(players).length}`);
  console.log(`Ligações jogador↔campo: ${totalLinks}`);
  console.log("Escrito: public/data/course-players.json");
}

main();
