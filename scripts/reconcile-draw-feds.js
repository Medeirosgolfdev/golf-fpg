#!/usr/bin/env node
/**
 * reconcile-draw-feds.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Corrige os fedCodes dos draws curados (cgss-draws-manual.json) usando os
 * RESULTADOS como fonte de verdade: os scorecards dos pull-torneios*.json
 * trazem o `federated_code` oficial da FPG, enquanto os feds dos draws foram
 * atribuídos por match de nome a partir do PDF — que já produziu erros
 * (visitantes do clube "Internacional" a herdar o fed de homónimos federados,
 * caso João Rocha do Estoril no Calheta Viva 2026, detectado 2026-08-07).
 *
 * Para cada torneio do cgss-draws-manual com entrada correspondente
 * (ccode/tcode) nos pull-torneios:
 *   - constrói o mapa nome-normalizado → fedCode a partir dos resultados;
 *   - nomes duplicados nos resultados (homónimos no mesmo torneio) são
 *     ignorados (AMBIG) — nunca se corrige às cegas;
 *   - fedCode null/vazio nos resultados NÃO apaga um fed existente no draw
 *     (scorecard em falta ≠ jogador sem federação);
 *   - qualquer divergência draw≠resultados é corrigida (resultados ganham),
 *     incluindo atribuir fed a quem não tinha nenhum.
 *
 * Nomes que não batem exactamente (abreviaturas do PDF, ex: "Carlos A.
 * Fernandes") ficam como estão — só se corrige com match inequívoco.
 *
 * USO:
 *   node scripts/reconcile-draw-feds.js               # aplica a todos
 *   node scripts/reconcile-draw-feds.js --dry-run     # só relata
 *   node scripts/reconcile-draw-feds.js --ccode 007 --tcode 11050   # um só
 *
 * Também exporta `reconcileDrawFeds()` — usado pelo
 * update-calheta-portosanto-results.js depois de gravar resultados novos.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const DATA = path.join(REPO, "public", "data");
const CGSS = path.join(DATA, "cgss-draws-manual.json");

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const AMBIG = Symbol("ambig");

function buildResultsIndex() {
  const idx = new Map(); // "ccode|tcode" -> Map(normName -> fedCode|null|AMBIG)
  const files = fs.readdirSync(DATA).filter((f) => /^pull-torneios\d+\.json$/.test(f));
  for (const f of files) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { continue; }
    for (const t of d.tournaments || []) {
      if (t._drawOnly || !Array.isArray(t.players) || t.players.length === 0) continue;
      const key = `${t.ccode}|${t.tcode}`;
      let m = idx.get(key);
      if (!m) { m = new Map(); idx.set(key, m); }
      for (const p of t.players) {
        const k = norm(p.name);
        if (!k) continue;
        const fed = p.fedCode != null && String(p.fedCode).trim() !== "" ? String(p.fedCode) : null;
        if (m.has(k) && m.get(k) !== fed) m.set(k, AMBIG);
        else m.set(k, fed);
      }
    }
  }
  return idx;
}

/** Reconcilia. opts: { dryRun, only: {ccode,tcode}|null, quiet }.
 *  Devolve a lista de correcções aplicadas (ou que seriam aplicadas). */
function reconcileDrawFeds(opts = {}) {
  const { dryRun = false, only = null, quiet = false } = opts;
  const log = quiet ? () => {} : console.log;
  const cgss = JSON.parse(fs.readFileSync(CGSS, "utf8"));
  const idx = buildResultsIndex();
  const changes = [];

  for (const t of cgss.tournaments || []) {
    if (only && !(String(t.ccode) === String(only.ccode) && String(t.tcode) === String(only.tcode))) continue;
    const m = idx.get(`${t.ccode}|${t.tcode}`);
    if (!m) continue;
    for (const round of Object.values(t.draws || {})) {
      for (const g of round.groups || []) {
        for (const p of g.players || []) {
          const r = m.get(norm(p.nome));
          if (r === undefined || r === AMBIG || r === null) continue;
          const cur = p.fed != null ? String(p.fed) : null;
          if (cur !== r) {
            changes.push({ tourn: `${t.ccode}/${t.tcode} ${t.name}`, nome: p.nome, de: cur, para: r });
            p.fed = r;
            // os resultados provaram que o jogador TEM federação — levantar a
            // marca de visitante (que bloqueia o match por nome na DrawTab)
            if (p.noFed) delete p.noFed;
          }
        }
      }
    }
  }

  if (changes.length) {
    for (const c of changes) log(`  ${c.tourn} · ${c.nome}: ${c.de || "—"} → ${c.para}`);
    if (!dryRun) {
      fs.writeFileSync(CGSS + ".tmp", JSON.stringify(cgss, null, 2));
      fs.renameSync(CGSS + ".tmp", CGSS);
      log(`[reconcile] ✓ ${changes.length} fed(s) corrigido(s) em cgss-draws-manual.json.`);
    } else {
      log(`[reconcile] --dry-run: ${changes.length} correcção(ões) NÃO gravadas.`);
    }
  } else {
    log("[reconcile] draws já coerentes com os resultados — nada a corrigir.");
  }
  return changes;
}

module.exports = { reconcileDrawFeds };

if (require.main === module) {
  const args = process.argv.slice(2);
  const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
  const only = argVal("--tcode")
    ? { ccode: argVal("--ccode") || "007", tcode: argVal("--tcode") }
    : null;
  reconcileDrawFeds({ dryRun: args.includes("--dry-run"), only });
}
