// scrape-manuel-missing-draws.js
//
// Scrape dos draws (e admissões) em falta para torneios FPG que o Manuel jogou
// mas que ainda não temos no `public/data/fpg-admissions-draws.json`.
//
// Fontes:
//   1. `public/data/manuel-pairings.json` → `cobertura.fpg.torneiosSemDrawDetalhe`
//      (38 torneios sem draw, escopo "passíveis de scrapar")
//   2. `public/data/manuel-pairings.json` → `cobertura.fpg.torneiosSkippedDetalhe`
//      (~12 torneios DRIVE Challenge Madeira que foram silenciosamente
//      excluídos pelo SKIP_CCODES do pairings-build.js — ccode 982).
//      Se este campo ainda não estiver no JSON (build antiga), lemos
//      `output/52884/scorecards.json` para inferir.
//
// Por defeito o ccode 007 (CGSS Santo da Serra Madeira) é EXCLUÍDO — os clubes
// regionais da Madeira não publicam draws no scoring.fpg.pt. O user pode
// passar `--include-007` para forçar a inclusão (em geral é desperdício).
//
// Uso:
//   node scripts/scrape-manuel-missing-draws.js                # tudo, sem 007
//   node scripts/scrape-manuel-missing-draws.js --dry-run      # só lista os tcodes
//   node scripts/scrape-manuel-missing-draws.js --include-007  # inclui CGSS
//   node scripts/scrape-manuel-missing-draws.js --no-drive     # exclui Drive Challenge (982)
//   node scripts/scrape-manuel-missing-draws.js --limit 10
//   node scripts/scrape-manuel-missing-draws.js --concurrency 2
//   node scripts/scrape-manuel-missing-draws.js --skip-rebuild # NÃO regenera manuel-pairings.json no fim
//
// Após o scrape, re-corre automaticamente `pairings-build.js` para regenerar
// `manuel-pairings.json` (a menos que `--skip-rebuild`).

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { lisbonCivilDayStr } = require("../lib/helpers");

const ROOT = path.resolve(__dirname, "..");
const PAIRINGS = path.join(ROOT, "public", "data", "manuel-pairings.json");
const SCORECARDS = path.join(ROOT, "output", "52884", "scorecards.json");
const ADMISSIONS_DRAWS = path.join(ROOT, "public", "data", "fpg-admissions-draws.json");
const SCOPE_FILE = path.join(__dirname, "fpg-admissions-scope.json");
const SCRAPER = path.join(__dirname, "scrape-fpg-admissions-draws-node.js");
const BUILDER = path.join(__dirname, "pairings-build.js");
const MANUEL_FED = "52884";

// Ccodes a excluir por defeito (clubes regionais que não publicam draws).
// 007 = CGSS Santo da Serra (Madeira) — confirmado pelo user.
const DEFAULT_SKIP_CCODES = new Set(["007"]);

// Ccode silenciosamente excluído pelo pairings-build.js (reatribuído pela FPG).
// 982 = Drive Challenge Madeira histórico. O user quer scrapar.
const DRIVE_CCODE = "982";

// ─── CLI args ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function argVal(flag, def) {
  const i = args.indexOf(flag);
  if (i === -1) return def;
  return args[i + 1] ?? def;
}
const DRY_RUN = args.includes("--dry-run");
const LIMIT = parseInt(argVal("--limit", "0"), 10);
const CONCURRENCY = argVal("--concurrency", "2");
const SKIP_REBUILD = args.includes("--skip-rebuild");
const INCLUDE_007 = args.includes("--include-007");
const NO_DRIVE = args.includes("--no-drive");

// ─── helpers ─────────────────────────────────────────────────────────

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function normIsoDate(raw) {
  if (!raw) return null;
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = String(raw).match(/\/Date\((-?\d+)\)\//);
  if (m) return lisbonCivilDayStr(Number(m[1])); // meia-noite Lisboa; UTC dava dia -1 no verão
  return null;
}

// Lê scorecards.json e devolve só os torneios do ccode 982 (Drive Challenge).
function getDriveTorneiosFromScorecards() {
  if (!fs.existsSync(SCORECARDS)) {
    console.warn(`[scrape-manuel-missing] aviso: ${SCORECARDS} não existe — não consigo inferir torneios DRIVE 982.`);
    return [];
  }
  const sc = readJSON(SCORECARDS);
  const torneios = new Map();
  for (const sid of Object.keys(sc)) {
    const s = sc[sid];
    if (s.score_origin !== "Torn") continue;
    if (String(s.federated_code || "") !== MANUEL_FED) continue;
    if (String(s.club_code) !== DRIVE_CCODE) continue;
    const cc = s.club_code, tc = s.tournament_code;
    if (!cc || !tc) continue;
    const key = `${cc}-${tc}`;
    if (!torneios.has(key)) {
      torneios.set(key, {
        torneioId: key,
        ccode: cc,
        tcode: tc,
        nome: s.tournament_description || "",
        data: normIsoDate(s.played_at),
        rondas: 1,
      });
    } else {
      const e = torneios.get(key);
      e.rondas += 1;
      const d2 = normIsoDate(s.played_at);
      if (d2 && (!e.data || d2 < e.data)) e.data = d2;
    }
  }
  return [...torneios.values()];
}

// Garante que cada torneio (com a sua data real) está presente em
// `scripts/fpg-admissions-scope.json`. É essencial porque o scraper
// `scrape-fpg-admissions-draws-node.js`, quando recebe `--tcodes` para um
// tcode fora do scope, usa data placeholder = hoje, o que faz o `markSuspect`
// descartar o resultado (memória `fpg_scrape_tcodes_suspect_bug`).
//
// Devolve o número de entradas adicionadas.
function ensureScope(torneios) {
  if (!fs.existsSync(SCOPE_FILE)) {
    console.warn(`[scrape-manuel-missing] aviso: scope ${SCOPE_FILE} não existe — sigo na mesma, scraper provavelmente irá falhar.`);
    return 0;
  }
  const scope = JSON.parse(fs.readFileSync(SCOPE_FILE, "utf8"));
  const idx = new Set();
  for (const t of scope) idx.add(`${String(t.ccode).padStart(3, "0")}-${t.tcode}`);
  let added = 0;
  for (const t of torneios) {
    const key = t.torneioId;
    if (idx.has(key)) continue;
    const [cc, tc] = key.split("-");
    const data = t.data || new Date().toISOString().slice(0, 10);
    scope.push({
      ccode: cc,
      tcode: tc,
      name: t.nome || `Torneio ${tc}`,
      date: data,
      expectedYear: String(data).slice(0, 4),
      _src: "manuel-missing",
    });
    idx.add(key);
    added += 1;
  }
  if (added > 0) {
    fs.writeFileSync(SCOPE_FILE, JSON.stringify(scope, null, 2), "utf8");
    console.log(`[scrape-manuel-missing] scope actualizado: +${added} torneios.`);
  } else {
    console.log("[scrape-manuel-missing] scope já contém todos os torneios — nada a adicionar.");
  }
  return added;
}

// Lê fpg-admissions-draws.json e devolve o Set de torneioIds já cobertos.
function getJaCobertos() {
  const out = new Set();
  if (!fs.existsSync(ADMISSIONS_DRAWS)) return out;
  try {
    const j = readJSON(ADMISSIONS_DRAWS);
    for (const t of (j.tournaments || [])) {
      // Só conta como "já temos" se houver draws (rondas com groups).
      const draws = t.draws || {};
      let hasGroups = false;
      for (const r of Object.keys(draws)) {
        if (draws[r] && Array.isArray(draws[r].groups) && draws[r].groups.length > 0) {
          hasGroups = true;
          break;
        }
      }
      if (hasGroups) out.add(`${t.ccode}-${t.tcode}`);
    }
  } catch (e) {
    console.warn(`[scrape-manuel-missing] aviso: erro a ler ${ADMISSIONS_DRAWS}: ${e.message}`);
  }
  return out;
}

// ─── main ─────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(PAIRINGS)) {
    console.error(`[scrape-manuel-missing] não encontrei ${PAIRINGS}.`);
    console.error(`Corre primeiro: node scripts/pairings-build.js`);
    process.exit(1);
  }

  const data = readJSON(PAIRINGS);
  const cov = (data.cobertura && data.cobertura.fpg) || {};

  // 1. Torneios "sem draw" listados na cobertura
  const semDrawDetalhe = cov.torneiosSemDrawDetalhe || [];
  // 2. Torneios DRIVE silenciosamente excluídos
  let driveDetalhe = cov.torneiosSkippedDetalhe || [];
  if (driveDetalhe.length === 0 && !NO_DRIVE) {
    // Fallback: inferir do scorecards.json se o JSON ainda não tiver o campo
    const inferidos = getDriveTorneiosFromScorecards();
    if (inferidos.length > 0) {
      console.log(`[scrape-manuel-missing] inferi ${inferidos.length} torneios DRIVE (ccode 982) do scorecards.json (re-corre pairings-build.js para populares o campo no JSON).`);
    }
    driveDetalhe = inferidos;
  }

  // 3. Excluir os que já foram scrapados desde a última build do pairings.
  const jaCobertos = getJaCobertos();

  // Juntar e filtrar
  let candidatos = [...semDrawDetalhe];
  if (!NO_DRIVE) candidatos = candidatos.concat(driveDetalhe);

  // Filtrar duplicados
  const seen = new Set();
  candidatos = candidatos.filter(t => {
    if (seen.has(t.torneioId)) return false;
    seen.add(t.torneioId);
    return true;
  });

  // Filtrar ccode 007 (default) e os já cobertos
  const filtered = [];
  const excluded = { c007: 0, jaCobertos: 0, outros: 0 };
  for (const t of candidatos) {
    const cc = t.torneioId.split("-")[0];
    if (cc === "007" && !INCLUDE_007) {
      excluded.c007 += 1;
      continue;
    }
    if (jaCobertos.has(t.torneioId)) {
      excluded.jaCobertos += 1;
      continue;
    }
    filtered.push(t);
  }

  // Ordenar por data desc
  filtered.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

  // Aplicar limit
  let final = filtered;
  if (LIMIT > 0) final = filtered.slice(0, LIMIT);

  // ─── relatório ────────────────────────────────────────────────────
  console.log("┌─ scrape-manuel-missing-draws ─────────────────────────");
  console.log("│ candidatos:");
  console.log(`│   sem draw (cobertura):        ${semDrawDetalhe.length}`);
  console.log(`│   DRIVE Madeira (982):         ${NO_DRIVE ? 0 : driveDetalhe.length}${NO_DRIVE ? " (--no-drive)" : ""}`);
  console.log(`│   total único:                 ${candidatos.length}`);
  console.log("│ filtros:");
  console.log(`│   excluídos ccode 007:         ${excluded.c007}${INCLUDE_007 ? "" : " (default; usa --include-007 para incluir)"}`);
  console.log(`│   já cobertos:                 ${excluded.jaCobertos}`);
  console.log(`│ → a scrapar:                   ${final.length}${LIMIT > 0 ? ` (limit=${LIMIT})` : ""}`);
  console.log("├───────────────────────────────────────────────────────");

  if (final.length === 0) {
    console.log("│ nada para scrapar — tudo coberto ou filtrado.");
    console.log("└───────────────────────────────────────────────────────");
    return;
  }

  // Distribuição por ccode
  const porCcode = new Map();
  for (const t of final) {
    const cc = t.torneioId.split("-")[0];
    porCcode.set(cc, (porCcode.get(cc) || 0) + 1);
  }
  console.log("│ distribuição por ccode:");
  for (const [cc, n] of [...porCcode.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`│   ${cc}: ${n}`);
  }
  console.log("└───────────────────────────────────────────────────────\n");

  if (DRY_RUN) {
    console.log("[dry-run] torneios que seriam scrapados:");
    for (const t of final) {
      console.log(`  ${t.torneioId.padEnd(11)} ${(t.data || "?").padEnd(11)} ${t.nome}`);
    }
    return;
  }

  // Garantir scope (com data real) para evitar bug "data placeholder=hoje"
  ensureScope(final);

  // Construir flag --tcodes (formato ccode:tcode,ccode:tcode,…)
  const specs = final.map(t => t.torneioId.replace("-", ":"));
  const tcodesArg = specs.join(",");
  console.log(`[scrape-manuel-missing] a invocar ${path.basename(SCRAPER)} com ${specs.length} tcodes (concurrency=${CONCURRENCY})…`);
  console.log("(Cada torneio que não publica draw vai falhar silenciosamente — é normal.)\n");

  const child = spawn(
    process.execPath,
    [SCRAPER, "--tcodes", tcodesArg, "--concurrency", String(CONCURRENCY)],
    { stdio: "inherit" }
  );
  child.on("exit", (code) => {
    // Exit code 2 do scraper = "sem novidades" (não é erro).
    if (code !== 0 && code !== 2) {
      console.error(`\n[scrape-manuel-missing] scraper saiu com código ${code}`);
      process.exit(code);
    }
    console.log(`\n[scrape-manuel-missing] scraper terminou (código ${code}).`);
    if (SKIP_REBUILD) {
      console.log("[scrape-manuel-missing] --skip-rebuild: não vou regenerar manuel-pairings.json. Corre manualmente:");
      console.log("  node scripts/pairings-build.js");
      return;
    }
    console.log("[scrape-manuel-missing] a re-gerar manuel-pairings.json…\n");
    const child2 = spawn(process.execPath, [BUILDER], { stdio: "inherit" });
    child2.on("exit", (c2) => {
      if (c2 !== 0) {
        console.error(`[scrape-manuel-missing] builder saiu com código ${c2}`);
        process.exit(c2);
      }
      console.log("\n[scrape-manuel-missing] pronto. Recarrega /draws no browser.");
    });
  });
}

main();
