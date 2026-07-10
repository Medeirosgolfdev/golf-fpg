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
const ALIAS = require("./lib/course-aliases.cjs");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");
const OUTPUT = path.join(ROOT, "output");

const norm = ALIAS.norm;
function toIso(d) {
  const m = String(d || "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
const numOr = (v) => (Number.isFinite(v) ? v : null);

/** Resolve o courseKey do master para uma ronda, usando a MESMA canonização
 *  da app (courseAliases). Ordem:
 *   1) Santo da Serra por par[] (combos/loops) e Ribagolfe I/II por par[]
 *   2) fallback Santo da Serra só por nome (sem par)
 *   3) canonicalCourseName (sufixos + aliases) + Aroeira II por par → masterByNorm
 *  Devolve null se nenhum campo PT do master corresponder. */
function resolveCourseKey(rawName, pars18or9, masterByNorm, masterKeys) {
  if (!rawName) return null;
  let key =
    // 1) Resolução por par[] (mais fiável): combos multi-loop + Ribagolfe.
    ALIAS.resolveSantoDaSerraKeyByPar(rawName, pars18or9) ||
    ALIAS.resolveMultiloopKeyByPar(rawName, pars18or9) ||
    ALIAS.resolveRibagolfeKeyByPar(rawName, pars18or9) ||
    // 2) Fallbacks por nome (voltas sem scorecard / par em falta).
    ALIAS.resolveSantoDaSerraKeyByName(rawName) ||
    ALIAS.resolveMultiloopKeyByName(rawName) ||
    ALIAS.resolveRibagolfeKeyByName(rawName);
  if (!key) {
    let canon = ALIAS.canonicalCourseName(rawName);
    canon = ALIAS.resolveAroeiraIIByPar(canon, pars18or9);
    key = masterByNorm[norm(canon)] || null;
  }
  return key && masterKeys.has(key) ? key : null;
}

function main() {
  const master = JSON.parse(fs.readFileSync(path.join(DATA, "master-courses.json"), "utf8")).courses || [];
  // norm(nome do campo) → courseKey do master
  const masterByNorm = {};
  const masterKeys = new Set();
  for (const c of master) {
    masterKeys.add(c.courseKey);
    const k = norm(c.master.name);
    if (k && !(k in masterByNorm)) masterByNorm[k] = c.courseKey;
  }

  // courseKey → { nfed → [rondas] }
  const players = {};
  let scanned = 0;
  const unmatched = {}; // nome cru → contagem (diagnóstico)
  if (fs.existsSync(OUTPUT)) {
    for (const dir of fs.readdirSync(OUTPUT)) {
      if (!/^\d+$/.test(dir)) continue;
      const fp = path.join(OUTPUT, dir, "analysis", "data.json");
      if (!fs.existsSync(fp)) continue;
      let data;
      try { data = JSON.parse(fs.readFileSync(fp, "utf8")); } catch { continue; }
      const nfed = String(data.CURRENT_FED || dir);
      const HOLES = data.HOLES || {};
      scanned++;
      for (const c of (data.DATA || [])) {
        for (const r of (c.rounds || [])) {
          const name = (r.course || c.course || "").trim();
          if (!name) continue;
          // par[] + gross[] por buraco (do scorecard) — par necessário p/ resolver
          // SdS/Ribagolfe/Aroeira; gross usado p/ os splits Front 9 / Back 9.
          const pars = Array.isArray(HOLES[r.scoreId]?.p) ? HOLES[r.scoreId].p : null;
          const gArr = Array.isArray(HOLES[r.scoreId]?.g) ? HOLES[r.scoreId].g : null;
          const key = resolveCourseKey(name, pars, masterByNorm, masterKeys);
          if (!key) { unmatched[name] = (unmatched[name] || 0) + 1; continue; }
          // Sentinelas: gross 0 / 998 / 999 ("sem cartão") → null (não contam p/ stats)
          let gross = numOr(r.gross);
          if (gross != null && (gross <= 0 || gross >= 200)) gross = null;
          const par = numOr(r.par);
          // Splits Front 9 / Back 9 (só voltas de 18 com scorecard completo).
          // f9tp/b9tp = to-par de cada nine. null quando incompleto/em falta.
          let f9 = null, b9 = null, f9tp = null, b9tp = null;
          if (gArr && gArr.length >= 18 && pars && pars.length >= 18) {
            const sumRange = (a, s, e) => { let t = 0; for (let i = s; i < e; i++) { const v = Number(a[i]); if (!v || v <= 0) return null; t += v; } return t; };
            const gf = sumRange(gArr, 0, 9), gb = sumRange(gArr, 9, 18);
            const pf = pars.slice(0, 9).reduce((x, y) => x + (Number(y) || 0), 0);
            const pb = pars.slice(9, 18).reduce((x, y) => x + (Number(y) || 0), 0);
            if (gf != null) { f9 = gf; if (pf) f9tp = gf - pf; }
            if (gb != null) { b9 = gb; if (pb) b9tp = gb - pb; }
          }
          const round = {
            date: toIso(r.date),
            gross,
            toPar: gross != null && par != null ? gross - par : null,
            holes: numOr(r.holeCount),  // 9 ou 18 (separa meias-voltas na UI)
            tee: typeof r.tee === "string" ? r.tee : null,
            event: typeof r.eventName === "string" ? r.eventName : null,
            sd: numOr(r.sd),
            ...(f9 != null ? { f9, f9tp } : {}),
            ...(b9 != null ? { b9, b9tp } : {}),
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
        const k = `${r.date || ""}|${r.gross ?? ""}|${r.holes ?? ""}`;
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

  // Diagnóstico: nomes que NÃO casaram com nenhum campo PT do master.
  // (Inclui campos internacionais — esses são esperados, vêm do pipeline away —
  //  mas se um campo PT aparecer aqui com muitas voltas, falta um alias.)
  const top = Object.entries(unmatched).sort((a, b) => b[1] - a[1]).slice(0, 30);
  const totalU = Object.values(unmatched).reduce((s, n) => s + n, 0);
  console.log(`\nVoltas sem campo correspondente: ${totalU} (top 30 nomes):`);
  for (const [nm, n] of top) console.log(`  ${String(n).padStart(4)}×  ${nm}`);
}

main();
