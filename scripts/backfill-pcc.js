#!/usr/bin/env node
/**
 * backfill-pcc.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Preenche o PCC (Playing Conditions Calculation) em falta nos ficheiros de
 * resultados, a partir do WHS dos NOSSOS jogadores.
 *
 * PORQUÊ ISTO EXISTE
 * ──────────────────
 * O PCC é calculado pela FPG **ao fim do dia**, depois de entrarem todos os
 * cartões do campo. Os nossos scrapes de resultados correm na própria noite do
 * torneio (update-classif Dom/Seg 01:00 UTC, update-drive Sex/Sáb/Dom 21:00,
 * update-cgss-draw-results a pedido) — muitas vezes ANTES de o PCC existir. O
 * `extractPcc()` desses scrapers lê o campo `cba` do scorecard, encontra-o
 * vazio, e o torneio fica para sempre sem PCC: o SD da tabela diverge do SD
 * oficial da FPG exactamente por (113/slope)×PCC.
 *   Caso que motivou isto: 8º Torneio CGSS OM NOS 2026 (007/11057, 29-08-2026,
 *   Santo da Serra). Scrape às 22:57 do próprio dia → sem PCC. O oficial era
 *   −1: o Manuel aparecia com SD 5.5 em vez de 6.4.
 *
 * A FONTE
 * ───────
 * Cada ronda do WHS de um jogador (`output/{fed}/whs.json`) traz `cba` — o PCC
 * OFICIAL da FPG — mais `tournament_code`, `hcp_dateStr` e `course_description`.
 * Como o WHS é re-descarregado todas as noites pelo `update-data.yml` (00:05
 * UTC, já depois da meia-noite de Lisboa), o PCC chega-nos de graça, sem
 * cookies e sem um único pedido extra à FPG.
 *
 * ⚠ CHAVE: tcode + DATA + CAMPO — nunca só o tcode
 * ────────────────────────────────────────────────
 * A FPG reutiliza tcodes entre clubes: o 10052 é ao mesmo tempo um Drive
 * Challenge dos Açores e um Drive Challenge do Tejo. Casar só por tcode
 * carimbava um torneio com o PCC de outro, noutro ano, noutra ilha.
 *
 * ⚠ VALOR MODAL, não o primeiro que aparece
 * ─────────────────────────────────────────
 * A própria FPG guarda `cba` desactualizado nalguns registos — medido: na
 * "Final Regional Drive Challenge Açores-Sub18" (10121, 27-08-2024) cinco dos
 * nossos têm −1 e um tem 0. É a mesma avaria pelo outro lado: o cartão desse
 * jogador foi processado antes de o PCC estar calculado. Por isso vale o valor
 * mais frequente, e só com maioria estrita (empate → não se mexe).
 *
 * ⚠ SÓ SE ESCREVE PCC ≠ 0
 * ───────────────────────
 * 0 é "sem ajuste" — idêntico a não ter campo nenhum. Escrevê-lo só encheria os
 * JSON de ruído. É também o que o `extractPcc()` dos scrapers faz, por isso um
 * re-scrape futuro produz exactamente o mesmo ficheiro.
 *
 * USO:
 *   node scripts/backfill-pcc.js                 # dry-run (não escreve)
 *   node scripts/backfill-pcc.js --apply
 *   node scripts/backfill-pcc.js --apply --since 2026-01-01
 *   node scripts/backfill-pcc.js --tcode 11057 --verbose
 *
 * EXIT CODES: 0 = houve alterações · 2 = nada a fazer · 1 = erro.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const REPO = path.resolve(__dirname, "..");
const OUTPUT = path.join(REPO, "output");
const DATA = path.join(REPO, "public", "data");

const args = process.argv.slice(2);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const APPLY = args.includes("--apply");
const VERBOSE = args.includes("--verbose");
const SINCE = argVal("--since");
const ONLY_TCODE = argVal("--tcode");

/** Ficheiros de resultados que usam o formato "fpg-pull" (roundScores[]). */
const FILE_RX = /^(pull-torneios\d+|drive-data-\d{4}-\d{2}|aquapor-data-\d{4}-\d{2})\.json$/;

const norm = (s) => String(s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const keyOf = (tcode, date, campo) => `${tcode}|${date}|${norm(campo)}`;

/** Data da ronda N de um torneio que começa em `date` (ISO, meio-dia UTC para
 *  não escorregar de dia com o horário de verão). */
function roundDate(date, round) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (Math.max(1, round || 1) - 1));
  return d.toISOString().slice(0, 10);
}

/** Lê o PCC oficial de todas as rondas WHS dos nossos jogadores. */
function buildPccMap() {
  const obs = new Map();   // chave → { [cba]: contagem }
  let feds = 0, rounds = 0;
  for (const fed of fs.readdirSync(OUTPUT)) {
    if (!/^\d+$/.test(fed)) continue;
    const p = path.join(OUTPUT, fed, "whs.json");
    if (!fs.existsSync(p)) continue;
    let arr;
    try { arr = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
    if (!Array.isArray(arr)) continue;
    feds++;
    for (const r of arr) {
      // Só voltas de torneio: as EDS/Individuais não têm tournament_code útil.
      if (r.score_origin !== "Torn") continue;
      if (!r.tournament_code || r.cba == null) continue;
      const date = String(r.hcp_dateStr || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const k = keyOf(r.tournament_code, date, r.course_description);
      const v = Number(r.cba);
      if (!Number.isFinite(v)) continue;
      if (!obs.has(k)) obs.set(k, {});
      const c = obs.get(k);
      c[v] = (c[v] || 0) + 1;
      rounds++;
    }
  }
  // Resolver cada chave pelo valor modal, exigindo maioria estrita.
  const map = new Map();
  let empates = 0;
  for (const [k, counts] of obs) {
    const ord = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (ord.length > 1 && ord[0][1] === ord[1][1]) { empates++; continue; }
    map.set(k, { pcc: Number(ord[0][0]), n: ord[0][1], total: ord.reduce((s, x) => s + x[1], 0) });
  }
  return { map, feds, rounds, empates };
}

function main() {
  if (!fs.existsSync(OUTPUT)) {
    console.error("[pcc] output/ não existe — nada a fazer.");
    return 2;
  }
  const { map, feds, rounds, empates } = buildPccMap();
  console.log(`[pcc] WHS: ${feds} jogadores, ${rounds} voltas de torneio com cba.`);
  console.log(`[pcc] ${map.size} chaves (tcode|data|campo) resolvidas${empates ? `, ${empates} descartadas por empate` : ""}.`);

  const files = fs.readdirSync(DATA).filter((f) => FILE_RX.test(f)).sort();
  let totalRounds = 0, filled = 0, zero = 0, unknown = 0, changedFiles = 0;
  const tourns = new Map();   // "ccode/tcode data nome" → Set("R1=-1")

  for (const file of files) {
    const p = path.join(DATA, file);
    let d;
    try { d = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) {
      console.error(`[pcc] ${file}: JSON inválido (${e.message}) — saltado.`);
      continue;
    }
    let dirty = false;
    for (const t of d.tournaments || []) {
      if (!t.date || !t.campo) continue;
      if (ONLY_TCODE && String(t.tcode) !== String(ONLY_TCODE)) continue;
      if (SINCE && t.date < SINCE) continue;
      for (const pl of t.players || []) {
        const rs = pl.roundScores;
        if (!Array.isArray(rs)) continue;
        for (let i = 0; i < rs.length; i++) {
          const r = rs[i];
          totalRounds++;
          if (r.pcc != null) continue;
          const date = roundDate(t.date, r.round || i + 1);
          // O campo pode variar por jogador (combos de 9+9 diferentes no mesmo
          // clube) — preferir o do próprio jogador ao do torneio.
          const hit = map.get(keyOf(t.tcode, date, pl.course || t.campo))
                   || map.get(keyOf(t.tcode, date, t.campo));
          if (!hit) { unknown++; continue; }
          if (hit.pcc === 0) { zero++; continue; }   // 0 = sem ajuste, não se escreve
          // Inserir a chave logo a seguir a `meters`, na mesma ordem que o
          // extractPcc() dos scrapers produz — assim um re-scrape futuro dá
          // um ficheiro byte a byte igual.
          const out = {};
          for (const k of Object.keys(r)) { out[k] = r[k]; if (k === "meters") out.pcc = hit.pcc; }
          if (out.pcc == null) out.pcc = hit.pcc;
          rs[i] = out;
          filled++; dirty = true;
          const label = `${t.ccode}/${t.tcode} ${t.date} ${t.name}`;
          if (!tourns.has(label)) tourns.set(label, new Set());
          tourns.get(label).add(`R${r.round || i + 1}=${hit.pcc}`);
        }
      }
    }
    if (dirty) {
      changedFiles++;
      if (APPLY) {
        // Preservar (ou não) o \n final tal como estava — o writeJsonAtomic não
        // o escreve e os ficheiros do repo estão divididos entre os dois
        // estilos. Sem isto, cada corrida sujava o diff com 4 linhas de ruído.
        const hadNewline = fs.readFileSync(p, "utf8").endsWith("\n");
        writeJsonAtomic(p, d);
        if (hadNewline) fs.appendFileSync(p, "\n");
      }
    }
  }

  console.log(`[pcc] rondas analisadas: ${totalRounds} · preenchidas: ${filled} · PCC 0 (nada a escrever): ${zero} · sem correspondência: ${unknown}`);
  console.log(`[pcc] torneios afectados: ${tourns.size} em ${changedFiles} ficheiros.`);
  const list = [...tourns].sort();
  for (const [label, rounds_] of (VERBOSE ? list : list.slice(0, 40))) {
    console.log(`   ${label}  ${[...rounds_].sort().join(", ")}`);
  }
  if (!VERBOSE && list.length > 40) console.log(`   … e mais ${list.length - 40} (usar --verbose)`);

  if (!filled) { console.log("[pcc] nada a fazer."); return 2; }
  if (!APPLY) { console.log("[pcc] DRY-RUN — nada foi escrito. Correr com --apply."); return 2; }
  console.log(`[pcc] ${changedFiles} ficheiros actualizados.`);
  return 0;
}

try {
  process.exit(main());
} catch (e) {
  console.error("[pcc] ERRO:", e.stack || e.message);
  process.exit(1);
}
