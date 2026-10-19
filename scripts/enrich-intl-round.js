#!/usr/bin/env node
/**
 * enrich-intl-round.js — MÉTODO ÚNICO de enriquecimento de rondas internacionais
 *
 * A FPG regista rondas de torneios internacionais sem metros, com campo genérico
 * ("INTERNACIONAL", nome sem combo) e tee por cor ("VERMELHAS"). Este script gera
 * as entradas do melhorias.json (RAIZ) SEMPRE no mesmo formato "full-bake":
 *   whs.course_description + scorecard { course_description, tee_name,
 *   par_1..18, meters_1..18, course_rating?, slope? }
 * A pipeline (lib/melhorias.js) aplica-as ao whs/scorecard e o data.json fica
 * com metros/par/tee corretos — sem depender de overrides por campo
 * (MANUEL_AWAY_TEE), que rebentam quando o mesmo campo tem tees diferentes por
 * ano (caso Montecchia 2025 Boys 11 vs 2026 Boys 12).
 *
 * Fontes de dados (nunca inventar):
 *   --uskids <tcode>:<ageGroup>  TEES_LOOKUP de src/ui/uskidsData.ts (curado dos
 *                                PDFs oficiais "SSS & SLOPE" + results). Se o
 *                                lookup tiver par/metros vazios, cai nos
 *                                par+yards do uskids-results.json (yards×0.9144,
 *                                guarda _yards documentais).
 *   --copy-from <scoreId>        copia par/metros/CR/Slope/campo/tee de uma
 *                                entrada existente do melhorias.json (ex.: D2/D3
 *                                a partir do D1; outro ano do mesmo tee físico).
 *   --ffgolf <trnId>:<série>     torneio FFG (pages.ffgolf.org): par/metros/tee
 *     --player "<nome FFG>"      da série em public/data/ffgolf-course-overrides.json
 *                                (do PDF da Liga) e o cartão buraco a buraco do
 *                                jogador em public/data/ffgolf-resultats/. As
 *                                --scores vão pela ordem das voltas (R1, R2…).
 *                                Para as voltas que a FPG importa sem cartão
 *                                (buracos a 0, CR/Slope 72/113 de enchimento):
 *                                CR/Slope ficam vazios — só o SD da FPG vale.
 *
 * O ficheiro é editado por SPLICE TEXTUAL por entrada (nunca re-serializado
 * inteiro: o JS reordenaria as chaves numéricas para a frente dos _comment_* e
 * destruiria a organização do ficheiro). CRLF preservado.
 *
 * Uso:
 *   node scripts/enrich-intl-round.js --scores 4333809,4333833,4333835 \
 *     --uskids 21795:2105 --course "Val d'Europe" --tee "Boys 12" [--dry-run]
 *   node scripts/enrich-intl-round.js --scores 4213116 --copy-from 3946427 \
 *     --tee "Boys 10-11" --nota "D3 (27-02-2026) – ..."
 *
 * Flags: --fed (default 52884) · --course/--tee (default: os da fonte) ·
 *   --par n,n,... (override do par da fonte — para quando a ORGANIZAÇÃO joga o
 *   campo com par diferente do homologado, ex.: WJGC 2026 jogou o Flamingos
 *   par-71 como par 72 no buraco 10) · --si n,n,... + --si-fonte "<de onde>"
 *   (SI do campo quando a fonte não o traz; nunca dos cartões dos clubes) · --pill (default INTL em entradas novas) ·
 *   --group · --nota (só entradas novas ou com --force-nota) · --link <url
 *   resultados> · --comment "<texto>" (linha _comment_* antes da primeira
 *   entrada nova) · --dry-run
 *
 * Depois de correr: node pipeline.js --skip-import <fed> && npm test && npm run build
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const MELHORIAS = path.join(ROOT, "melhorias.json");

// ── args ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { fed: "52884", dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === "--scores") a.scores = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--uskids") a.uskids = next();
    else if (k === "--copy-from") a.copyFrom = next();
    else if (k === "--ffgolf") a.ffgolf = next();
    else if (k === "--player") a.player = next();
    else if (k === "--fed") a.fed = next();
    else if (k === "--course") a.course = next();
    else if (k === "--tee") a.tee = next();
    else if (k === "--par") a.par = next().split(",").map((s) => Number(s.trim()));
    else if (k === "--si") a.si = next().split(",").map((s) => Number(s.trim()));
    else if (k === "--si-fonte") a.siFonte = next();
    else if (k === "--pill") a.pill = next();
    else if (k === "--group") a.group = next();
    else if (k === "--nota") a.nota = next();
    else if (k === "--force-nota") a.forceNota = true;
    else if (k === "--link") a.link = next();
    else if (k === "--comment") a.comment = next();
    else if (k === "--dry-run") a.dryRun = true;
    else { console.error(`Flag desconhecida: ${k}`); process.exit(1); }
  }
  if (!a.scores?.length) { console.error("Falta --scores id[,id...]"); process.exit(1); }
  const nSrc = [a.uskids, a.copyFrom, a.ffgolf].filter(Boolean).length;
  if (!nSrc) { console.error("Falta a fonte: --uskids tcode:ageGroup, --copy-from scoreId ou --ffgolf trnId:série"); process.exit(1); }
  if (nSrc > 1) { console.error("--uskids, --copy-from e --ffgolf são mutuamente exclusivos"); process.exit(1); }
  if (a.ffgolf && !a.player) { console.error("--ffgolf precisa de --player \"<nome como na FFG>\""); process.exit(1); }
  return a;
}

// ── TEES_LOOKUP (src/ui/uskidsData.ts, transpilação esbuild) ─────────
function loadTeesLookup() {
  const esbuild = require("esbuild");
  const src = fs.readFileSync(path.join(ROOT, "src/ui/uskidsData.ts"), "utf8");
  const { code } = esbuild.transformSync(src, { loader: "ts", format: "cjs" });
  const tmp = path.join(os.tmpdir(), `uskidsData-${process.pid}.cjs`);
  fs.writeFileSync(tmp, code);
  try {
    return require(tmp).TEES_LOOKUP;
  } finally {
    fs.unlinkSync(tmp);
  }
}

// ── fonte: USKids (TEES_LOOKUP → fallback uskids-results.json) ───────
function sourceFromUskids(spec) {
  const m = /^(\d+):(\d+)$/.exec(spec);
  if (!m) { console.error(`--uskids inválido: "${spec}" (esperado tcode:ageGroup)`); process.exit(1); }
  const [tcode, ag] = [Number(m[1]), Number(m[2])];
  const lookup = loadTeesLookup()[tcode]?.[ag];
  if (!lookup) { console.error(`TEES_LOOKUP não tem ${tcode}/${ag} — adicionar primeiro em src/ui/uskidsData.ts (PDF oficial)`); process.exit(1); }
  const out = {
    course: lookup.campo, tee: lookup.tee,
    par: lookup.par?.length ? lookup.par : null,
    meters: lookup.metros?.length ? lookup.metros : null,
    cr: lookup.cr ?? null, slope: lookup.slope ?? null,
    fonte: `TEES_LOOKUP ${tcode}/${ag}`,
  };
  if (!out.par || !out.meters) {
    // fallback: par + yards dos results oficiais
    const res = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/uskids-results.json"), "utf8"));
    const t = res.resultados.find((x) => Number(x.t) === tcode);
    const e = t?.escaloes.find((x) => Number(x.age_group) === ag);
    const r1 = e?.rondas?.find((r) => r.par?.length && r.yards?.length);
    if (!r1) { console.error(`Sem par/metros no TEES_LOOKUP nem par/yards no uskids-results.json para ${tcode}/${ag}`); process.exit(1); }
    out.par = r1.par;
    out.meters = r1.yards.map((y) => Math.round(y * 0.9144));
    out.yards = r1.yards;
    out.fonte = `uskids-results.json ${tcode}/${ag} (yards×0.9144)` + (out.cr != null ? ` + CR/Slope TEES_LOOKUP` : "");
  }
  return out;
}

// ── fonte: copiar de entrada existente ───────────────────────────────
function sourceFromEntry(melhorias, fed, scoreId) {
  const e = melhorias[fed]?.[scoreId];
  const sc = e?.scorecard;
  if (!sc?.par_1 || !sc?.meters_1) { console.error(`Entrada ${scoreId} não existe ou não tem par/metros completos — não dá para copiar`); process.exit(1); }
  const n = sc.par_18 != null ? 18 : 9;
  const par = [], meters = [];
  for (let i = 1; i <= n; i++) { par.push(sc[`par_${i}`]); meters.push(sc[`meters_${i}`]); }
  return {
    course: sc.course_description, tee: sc.tee_name, par, meters,
    cr: sc.course_rating ?? null, slope: sc.slope ?? null,
    fonte: `cópia da entrada ${scoreId}`,
  };
}

// ── fonte: torneio FFG (percurso da Liga + cartões do jogador) ───────
function sourceFromFfgolf(spec, player) {
  const m = /^(\d+):(\S+)$/.exec(spec);
  if (!m) { console.error(`--ffgolf inválido: "${spec}" (esperado trnId:série)`); process.exit(1); }
  const [trnId, serie] = [m[1], m[2]];
  const ovr = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/ffgolf-course-overrides.json"), "utf8"));
  const t = ovr.resultats?.[trnId];
  const sc = t?.series?.[serie];
  if (!sc?.par?.length || !sc?.meters?.length) { console.error(`ffgolf-course-overrides.json não tem par/metros para ${trnId}/${serie}`); process.exit(1); }
  const dir = path.join(ROOT, "public/data/ffgolf-resultats");
  const file = fs.readdirSync(dir).find((f) => f.endsWith(`-${trnId}.json`));
  if (!file) { console.error(`Sem public/data/ffgolf-resultats/*-${trnId}.json`); process.exit(1); }
  const res = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  const norm = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const hits = (res.details?.series || []).flatMap((s) => s.players.map((p) => ({ s, p }))).filter(({ p }) => norm(p.name) === norm(player));
  if (hits.length !== 1) { console.error(`--player "${player}": ${hits.length} jogadores com esse nome em ${file}`); process.exit(1); }
  const { s, p } = hits[0];
  const rounds = [p.scoresR1, p.scoresR2, p.scoresR3, p.scoresR4].filter((r) => Array.isArray(r) && r.length);
  return {
    course: t.course, tee: sc.tee, par: sc.par, meters: sc.meters,
    cr: null, slope: null, clearRating: true, rounds,
    fonte: `ffgolf ${trnId}/${serie} (${t.fonte || "ffgolf-course-overrides.json"}) + cartão FFG de ${p.name} (série ${s.label}, ${p.pos}.º)`,
  };
}

// ── construção da entrada (formato canónico) ─────────────────────────
function buildEntry(existing, src, a, gross) {
  const scorecard = {
    course_description: a.course ?? src.course,
    tee_name: a.tee ?? src.tee,
  };
  src.par.forEach((v, i) => { scorecard[`par_${i + 1}`] = v; });
  if (a.si) a.si.forEach((v, i) => { scorecard[`stroke_index_${i + 1}`] = v; });
  src.meters.forEach((v, i) => { scorecard[`meters_${i + 1}`] = v; });
  if (src.cr != null) scorecard.course_rating = src.cr;
  if (src.slope != null) scorecard.slope = src.slope;
  // CR/Slope 72/113 de enchimento da FPG nas voltas importadas → vazios.
  if (src.clearRating) { scorecard.course_rating = null; scorecard.slope = null; }
  // Cartão buraco a buraco da volta (fonte FFG): gross_1..n + gross_total.
  if (gross) {
    gross.forEach((v, i) => { scorecard[`gross_${i + 1}`] = v; });
    scorecard.gross_total = gross.reduce((t, v) => t + v, 0);
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const notaAuto = `Enriquecido via scripts/enrich-intl-round.js (${src.fonte}) — ${hoje}`;
  const e = {};
  e.notas = (a.nota && (a.forceNota || !existing?.notas)) ? a.nota
    : existing?.notas ? existing.notas : (a.nota ?? notaAuto);
  e.whs = { ...(existing?.whs ?? {}), course_description: scorecard.course_description };
  e.scorecard = { ...(existing?.scorecard ?? {}), ...scorecard };
  if (src.yards) e._yards = Object.fromEntries([...src.yards.map((y, i) => [String(i + 1), y]), ["total", src.yards.reduce((s, y) => s + y, 0)]]);
  else if (existing?._yards) e._yards = existing._yards;
  if (a.group ?? existing?._group) e._group = a.group ?? existing._group;
  e.pill = a.pill ?? existing?.pill ?? "INTL";
  if (a.link) e.links = { ...(existing?.links ?? {}), resultados: a.link };
  else if (existing?.links) e.links = existing.links;
  // preservar campos extra que não gerimos (ex.: torneio_view, _fpg_original)
  for (const [k, v] of Object.entries(existing ?? {})) if (!(k in e)) e[k] = v;
  return e;
}

// ── splice textual (preserva a ordem/comentários do ficheiro) ────────
/** Varre a partir de um '{' e devolve o índice do '}' correspondente (respeita strings). */
function matchBrace(txt, openIdx) {
  let depth = 0, inStr = false;
  for (let i = openIdx; i < txt.length; i++) {
    const c = txt[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
  }
  throw new Error("brace matching falhou");
}

function entryText(scoreId, entry) {
  const json = JSON.stringify(entry, null, 2).split("\n").map((l, i) => (i === 0 ? l : "    " + l)).join("\r\n");
  return `    "${scoreId}": ${json}`;
}

function upsert(txt, fed, scoreId, entry, comment) {
  const eol = txt.includes("\r\n") ? "\r\n" : "\n";
  const re = new RegExp(`^    "${scoreId}": \\{`, "m");
  const hit = re.exec(txt);
  if (hit) {
    const open = txt.indexOf("{", hit.index);
    const close = matchBrace(txt, open);
    return { txt: txt.slice(0, hit.index) + entryText(scoreId, entry) + txt.slice(close + 1), created: false };
  }
  // nova entrada: inserir antes do fecho do objecto do jogador
  const fedRe = new RegExp(`^  "${fed}": \\{`, "m");
  const fedHit = fedRe.exec(txt);
  if (!fedHit) {
    // jogador novo: objecto próprio no fim do ficheiro
    const rootClose = txt.lastIndexOf("}");
    const before = txt.slice(0, rootClose).replace(/[\s]+$/, "");
    const commentLine = comment ? `    "_comment_${comment.slug}": "${comment.text}",${eol}` : "";
    const block = `  "${fed}": {${eol}${commentLine}${entryText(scoreId, entry)}${eol}  }`;
    return { txt: `${before},${eol}${block}${eol}${txt.slice(rootClose)}`, created: true };
  }
  const open = txt.indexOf("{", fedHit.index);
  const close = matchBrace(txt, open);
  // recuar até ao fim da última entrada (antes do whitespace que precede o '}')
  const before = txt.slice(0, close).replace(/[\s]+$/, "");
  const commentLine = comment ? `    "_comment_${comment.slug}": "${comment.text}",${eol}` : "";
  const inserted = `${before},${eol}${commentLine}${entryText(scoreId, entry)}${eol}  ${txt.slice(close)}`;
  return { txt: inserted, created: true };
}

// ── main ─────────────────────────────────────────────────────────────
function main() {
  const a = parseArgs(process.argv);
  let txt = fs.readFileSync(MELHORIAS, "utf8");
  const melhorias = JSON.parse(txt);
  const src = a.uskids ? sourceFromUskids(a.uskids)
    : a.ffgolf ? sourceFromFfgolf(a.ffgolf, a.player)
    : sourceFromEntry(melhorias, a.fed, a.copyFrom);
  if (src.rounds && src.rounds.length !== a.scores.length) {
    console.error(`--scores tem ${a.scores.length} voltas e o jogador tem ${src.rounds.length} cartões na FFG`); process.exit(1);
  }
  if (a.par) {
    if (a.par.length !== src.par.length || a.par.some((v) => !Number.isInteger(v) || v < 3 || v > 6)) {
      console.error(`--par inválido (esperado ${src.par.length} valores 3-6)`); process.exit(1);
    }
    const difs = a.par.map((v, i) => (v !== src.par[i] ? `${i + 1}: ${src.par[i]}→${v}` : null)).filter(Boolean);
    console.log(`--par override (${difs.length ? difs.join(", ") : "igual à fonte"})`);
    src.par = a.par;
    src.fonte += " + par override da organização";
  }

  const nHoles = src.par.length;
  if (a.si) {
    const ok = a.si.length === nHoles && [...a.si].sort((x, y) => x - y).every((v, i) => v === i + 1);
    if (!ok) { console.error(`--si inválido (esperado ${nHoles} valores, permutação de 1..${nHoles})`); process.exit(1); }
    if (!a.siFonte) { console.error("--si precisa de --si-fonte"); process.exit(1); }
    src.fonte += ` + SI: ${a.siFonte}`;
  }
  if (nHoles !== src.meters.length) { console.error(`par (${nHoles}) e metros (${src.meters.length}) com tamanhos diferentes`); process.exit(1); }
  const parTotal = src.par.reduce((s, v) => s + v, 0);
  const mTotal = src.meters.reduce((s, v) => s + v, 0);
  console.log(`Fonte: ${src.fonte}`);
  console.log(`Campo: ${a.course ?? src.course} | Tee: ${a.tee ?? src.tee} | ${nHoles} buracos | par ${parTotal} | ${mTotal}m` + (src.cr != null ? ` | CR ${src.cr}/${src.slope}` : " | sem CR/Slope (não publicado)"));

  let comment = null;
  if (a.comment) comment = { slug: a.comment.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), text: `===== ${a.comment} =====` };

  for (const [k, sid] of a.scores.entries()) {
    const existing = melhorias[a.fed]?.[sid] ?? null;
    const gross = src.rounds ? src.rounds[k] : null;
    const entry = buildEntry(existing, src, a, gross);
    const r = upsert(txt, a.fed, sid, entry, entry && comment);
    txt = r.txt;
    if (r.created) comment = null; // o comentário só antecede a primeira entrada nova
    console.log(`  ${r.created ? "criada" : "actualizada"}: ${sid} (tee "${entry.scorecard.tee_name}"${gross ? `, gross ${entry.scorecard.gross_total}` : ""})`);
  }

  JSON.parse(txt); // validação — rebenta antes de escrever se o splice corromper
  if (a.dryRun) { console.log("--dry-run: nada escrito."); return; }
  fs.writeFileSync(MELHORIAS, txt);
  console.log(`✓ melhorias.json actualizado. Regenerar: node pipeline.js --skip-import ${a.fed}`);
}

main();
