#!/usr/bin/env node
/**
 * pipeline.js — Pipeline unificado FPG
 *
 * Funde: fpg-import.js + golf-all.js (--skip-download) num só comando.
 * Faz tudo o que é preciso depois de descarregar os ficheiros pela consola do browser.
 *
 * Uso:
 *   node pipeline.js <fed> [<fed> ...] [opções]
 *   node pipeline.js --batch                  # Importar fpg-batch-*.json dos Downloads
 *   node pipeline.js --all                    # Todos de players.json (só render+sync)
 *   node pipeline.js --priority               # Só prioritários (só render+sync)
 *   node pipeline.js --sync-players           # Só sincronizar players.json
 *
 * Opções:
 *   --batch               Importar ficheiros fpg-batch-*.json (do download em lote)
 *   --downloads <pasta>   Pasta de downloads (default: ~/Downloads)
 *   --skip-import         Saltar importação (usar dados já em output/)
 *   --skip-render         Saltar geração de data.json
 *   --sync-players        Apenas sincronizar players.json
 *   --all                 Todos os jogadores de players.json
 *   --priority            Só jogadores prioritários
 *
 * Exemplos:
 *   node pipeline.js 52884                    # Import + Render + Sync + Enrich
 *   node pipeline.js 52884 49085 12345        # Vários jogadores
 *   node pipeline.js --batch                  # Importar lotes do browser + processar
 *   node pipeline.js --skip-import 52884      # Só processar (dados já importados)
 *   node pipeline.js --all                    # Reprocessar todos
 *
 * Fluxo:
 *   1. Import   — localiza ficheiros nos Downloads, copia para output/
 *   2. Render   — gera data.json (chama make-scorecards-ui.js)
 *   3. Sync     — actualiza players.json (HCP, clube, escalão)
 *   4. Enrich   — gera player-stats.json (stats para sidebar/lista)
 *   5. Extract  — gera away-courses.json (campos internacionais)
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

// ═══════ CORES & LOG ═══════
const B = "\x1b[1m", D = "\x1b[2m", R = "\x1b[0m";
const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", BLUE = "\x1b[34m", CYAN = "\x1b[36m";
const ok   = (m) => console.log(`  ${GREEN}✓${R} ${m}`);
const fail = (m) => console.log(`  ${RED}✗${R} ${m}`);
const warn = (m) => console.log(`  ${YELLOW}⚠${R} ${m}`);
const info = (m) => console.log(`  ${D}${m}${R}`);
const step = (n, m) => console.log(`\n${BLUE}[${n}]${R} ${B}${m}${R}`);

/** Ler JSON, removendo BOM */
function readJSON(fpath) {
  let txt = fs.readFileSync(fpath, "utf-8");
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
  return JSON.parse(txt);
}

// ═══════ PARSE ARGS ═══════
const args = process.argv.slice(2);
const fedCodes = [];
let downloadsDir = null;
let skipImport = false;
let skipRender = false;
let syncOnly = false;
let allFlag = false;
let priorityFlag = false;
let batchFlag = false;
let updateFlag = false;
let batchFile = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--downloads" && args[i + 1])  { downloadsDir = args[++i]; continue; }
  if (a === "--batch-file" && args[i + 1]) { batchFile = args[++i]; continue; }
  if (a === "--skip-import")               { skipImport = true; continue; }
  if (a === "--skip-render")               { skipRender = true; continue; }
  if (a === "--sync-players")              { syncOnly = true; continue; }
  if (a === "--all")                       { allFlag = true; continue; }
  if (a === "--priority")                  { priorityFlag = true; continue; }
  if (a === "--batch")                     { batchFlag = true; continue; }
  if (a === "--update")                    { updateFlag = true; continue; }
  if (/^\d+$/.test(a))                     { fedCodes.push(a); continue; }
  console.error(`Argumento desconhecido: ${a}`);
  process.exit(1);
}

// Resolver pasta de downloads
if (!downloadsDir) downloadsDir = path.join(os.homedir(), "Downloads");

// Resolver lista de federados
const playersPath = path.join(process.cwd(), "players.json");
let playersDb = {};
try { playersDb = readJSON(playersPath); } catch {}

if (allFlag && fedCodes.length === 0) {
  fedCodes.push(...Object.keys(playersDb));
  skipImport = true; // --all implica que já temos dados
  console.log(`--all: ${fedCodes.length} federados`);
}

if (priorityFlag && fedCodes.length === 0) {
  for (const [k, v] of Object.entries(playersDb)) {
    if (v.tags && v.tags.includes("no-priority")) continue;
    const isPJA = v.tags && v.tags.includes("PJA");
    const isMAD = v.region === "Madeira";
    const isS12 = v.escalao === "Sub-12" && v.hcp != null && v.hcp < 35;
    const isS14 = v.escalao === "Sub-14" && v.hcp != null && v.hcp < 25;
    if (isPJA || isMAD || isS12 || isS14) fedCodes.push(k);
  }
  skipImport = true;
  console.log(`--priority: ${fedCodes.length} jogadores prioritários`);
}

// --batch-file: importar um ficheiro batch específico
if (batchFile) {
  step("1/5", `Importar ficheiro batch: ${batchFile}`);
  const bfPath = fs.existsSync(batchFile) ? batchFile : path.join(downloadsDir, batchFile);
  if (!fs.existsSync(bfPath)) {
    fail(`Não encontrei: ${batchFile}`);
    fail(`Nem em: ${bfPath}`);
    process.exit(1);
  }

  const batchData = readJSON(bfPath);
  let totalPlayers = 0, totalSc = 0;

  for (const [fed, data] of Object.entries(batchData)) {
    const outDir = path.join(process.cwd(), "output", fed);
    const scorecardsDir = path.join(outDir, "scorecards");
    fs.mkdirSync(scorecardsDir, { recursive: true });

    if (data.whs) {
      fs.writeFileSync(path.join(outDir, "whs-list.json"), JSON.stringify(data.whs, null, 2), "utf-8");
    }
    let scCount = 0;
    if (data.scorecards) {
      for (const [scoreId, sc] of Object.entries(data.scorecards)) {
        fs.writeFileSync(path.join(scorecardsDir, `${scoreId}.json`), JSON.stringify(sc, null, 2), "utf-8");
        scCount++;
      }
    }
    if (!fedCodes.includes(fed)) fedCodes.push(fed);
    totalPlayers++;
    totalSc += scCount;
  }

  ok(`${totalPlayers} jogadores importados · ${totalSc} scorecards`);
  skipImport = true;
}

// --batch: importar fpg-batch-*.json dos Downloads
if (batchFlag) {
  step("1/5", "Importar ficheiros batch dos Downloads");
  const batchFiles = fs.readdirSync(downloadsDir)
    .filter(f => /^fpg-batch-\d+\.json$/i.test(f))
    .sort();

  if (batchFiles.length === 0) {
    fail(`Não encontrei fpg-batch-*.json em ${downloadsDir}`);
    process.exit(1);
  }

  ok(`${batchFiles.length} ficheiros batch encontrados`);
  let totalPlayers = 0, totalSc = 0;

  for (const bf of batchFiles) {
    const batchPath = path.join(downloadsDir, bf);
    info(`A processar ${bf}...`);
    let batchData;
    try { batchData = readJSON(batchPath); } catch (e) { warn(`Erro a ler ${bf}: ${e.message}`); continue; }

    for (const [fed, data] of Object.entries(batchData)) {
      const outDir = path.join(process.cwd(), "output", fed);
      const scorecardsDir = path.join(outDir, "scorecards");
      fs.mkdirSync(scorecardsDir, { recursive: true });

      // Gravar whs-list.json
      if (data.whs) {
        fs.writeFileSync(path.join(outDir, "whs-list.json"), JSON.stringify(data.whs, null, 2), "utf-8");
      }

      // Gravar scorecards individuais
      let scCount = 0;
      if (data.scorecards) {
        for (const [scoreId, sc] of Object.entries(data.scorecards)) {
          fs.writeFileSync(path.join(scorecardsDir, `${scoreId}.json`), JSON.stringify(sc, null, 2), "utf-8");
          scCount++;
        }
      }

      if (!fedCodes.includes(fed)) fedCodes.push(fed);
      totalPlayers++;
      totalSc += scCount;
    }
  }

  ok(`${totalPlayers} jogadores importados · ${totalSc} scorecards`);
  skipImport = true; // Já importámos tudo
}

// --update: importar WHS lists, identificar scorecards em falta, gerar script fase 2
if (updateFlag) {
  step("UPD", "Modo actualização — importar listas WHS e identificar novos scorecards");

  // Procurar fpg-whs-all.json
  const whsAllPath = path.join(downloadsDir, "fpg-whs-all.json");
  if (!fs.existsSync(whsAllPath)) {
    fail(`Não encontrei fpg-whs-all.json em ${downloadsDir}`);
    info("Corre primeiro a Fase 1 na consola do browser (fpg-update-fase1.js)");
    process.exit(1);
  }

  // Também verificar se há um batch de scorecards em falta (Fase 2 já correu)
  const missingBatchPath = path.join(downloadsDir, "fpg-batch-missing.json");
  const hasMissingBatch = fs.existsSync(missingBatchPath);

  // 1. Importar WHS lists
  info("A importar listas WHS...");
  const whsAll = readJSON(whsAllPath);
  const allFeds = Object.keys(whsAll);
  let imported = 0;

  for (const fed of allFeds) {
    const outDir = path.join(process.cwd(), "output", fed);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "whs-list.json"), JSON.stringify(whsAll[fed], null, 2), "utf-8");
    if (!fedCodes.includes(fed)) fedCodes.push(fed);
    imported++;
  }
  ok(`${imported} listas WHS importadas`);

  // 2. Se há batch de scorecards em falta (Fase 2 já correu), importar
  if (hasMissingBatch) {
    info("A importar scorecards da Fase 2...");
    const missingData = readJSON(missingBatchPath);
    let scImported = 0;

    for (const [fed, data] of Object.entries(missingData)) {
      const scorecardsDir = path.join(process.cwd(), "output", fed, "scorecards");
      fs.mkdirSync(scorecardsDir, { recursive: true });
      if (data.scorecards) {
        for (const [scoreId, sc] of Object.entries(data.scorecards)) {
          fs.writeFileSync(path.join(scorecardsDir, `${scoreId}.json`), JSON.stringify(sc, null, 2), "utf-8");
          scImported++;
        }
      }
    }
    ok(`${scImported} scorecards novos importados`);
    skipImport = true;
    // Continuar com render + sync + enrich
  } else {
    // 3. Identificar scorecards em falta
    info("A identificar scorecards em falta...");
    const missing = {}; // { fed: [{ score_id, scoring_type_id, competition_type_id }] }
    let totalMissing = 0;
    let totalExisting = 0;
    let fedsWithMissing = 0;

    for (const fed of allFeds) {
      const records = whsAll[fed]?.Records || [];
      const scDir = path.join(process.cwd(), "output", fed, "scorecards");
      const existingIds = new Set();
      if (fs.existsSync(scDir)) {
        for (const f of fs.readdirSync(scDir).filter(f => f.endsWith(".json"))) {
          existingIds.add(path.basename(f, ".json"));
        }
      }
      totalExisting += existingIds.size;

      const missingForFed = [];
      for (const r of records) {
        const sid = String(r.score_id || r.id);
        if (sid && !existingIds.has(sid)) {
          missingForFed.push({
            score_id: sid,
            scoring_type_id: r.scoring_type_id ?? 1,
            competition_type_id: r.competition_type_id ?? 1
          });
        }
      }

      if (missingForFed.length > 0) {
        missing[fed] = missingForFed;
        totalMissing += missingForFed.length;
        fedsWithMissing++;
      }
    }

    ok(`${totalExisting} scorecards existentes · ${totalMissing} em falta (${fedsWithMissing} jogadores)`);

    if (totalMissing === 0) {
      ok("Nenhum scorecard em falta! A continuar com render + sync...");
      skipImport = true;
      // Continuar normalmente
    } else {
      // 4. Gerar script Fase 2
      const fase2Path = path.join(process.cwd(), "scripts", "fpg-update-fase2.js");
      const missingEntries = [];
      for (const [fed, items] of Object.entries(missing)) {
        for (const item of items) {
          missingEntries.push(`{f:"${fed}",s:"${item.score_id}",st:"${item.scoring_type_id}",ct:"${item.competition_type_id}"}`);
        }
      }

      const fase2Code = `/**
 * fpg-update-fase2.js — FASE 2: Descarregar SÓ os scorecards novos
 *
 * Gerado automaticamente por: node pipeline.js --update
 * ${totalMissing} scorecards em falta de ${fedsWithMissing} jogadores.
 *
 * COMO USAR:
 * 1. Abre: https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884
 * 2. F12 → Console → cola este código → ENTER
 * 3. Espera — descarrega 1 ficheiro: fpg-batch-missing.json
 * 4. Corre: node pipeline.js --update
 *    (agora vai detectar o ficheiro e processar tudo)
 */
(async () => {
  const MISSING = [
${missingEntries.join(",\n")}
  ];

  const headers = {
    "x-requested-with": "XMLHttpRequest",
    "content-type": "application/json; charset=utf-8"
  };

  const t0 = Date.now();
  console.log(\`%c[FPG] Fase 2: \${MISSING.length} scorecards em falta\`, "color:blue;font-weight:bold;font-size:13px");

  const result = {};
  let ok = 0, fail = 0;

  for (let i = 0; i < MISSING.length; i++) {
    const m = MISSING[i];
    try {
      const res = await fetch(
        \`PlayerWHS.aspx/ScoreCard?score_id=\${m.s}&scoringtype=\${m.st}&competitiontype=\${m.ct}\`,
        {
          method: "POST", headers,
          body: JSON.stringify({ score_id: m.s, scoringtype: m.st, competitiontype: m.ct })
        }
      );
      if (res.status !== 200) { fail++; continue; }
      const payload = (await res.json())?.d;
      if (payload?.Result === "OK") {
        if (!result[m.f]) result[m.f] = { scorecards: {} };
        result[m.f].scorecards[m.s] = payload;
        ok++;
      } else { fail++; }
    } catch { fail++; }

    if ((i + 1) % 20 === 0 || i === MISSING.length - 1) {
      console.log(\`[FPG] \${i + 1}/\${MISSING.length} (\${ok} ✅ \${fail} ❌)\`);
    }
    if ((i + 1) % 10 === 0) await new Promise(r => setTimeout(r, 80));
  }

  downloadJSON(result, "fpg-batch-missing.json");

  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(\`%c[FPG] ✅ Fase 2 concluída: \${ok} scorecards em \${secs}s\`, "color:green;font-weight:bold");
  console.log("  ➡️ Agora corre: node pipeline.js --update");

  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
})();`;

      fs.mkdirSync(path.dirname(fase2Path), { recursive: true });
      fs.writeFileSync(fase2Path, fase2Code, "utf-8");

      console.log(`
${B}╔════════════════════════════════════════════════════════╗${R}
${B}║${R}  ${YELLOW}${totalMissing} scorecards em falta!${R}                          ${B}║${R}
${B}║${R}                                                        ${B}║${R}
${B}║${R}  Próximo passo:                                        ${B}║${R}
${B}║${R}  1. Abre a consola do browser (mesma página)           ${B}║${R}
${B}║${R}  2. Cola o conteúdo de:                                ${B}║${R}
${B}║${R}     ${CYAN}scripts/fpg-update-fase2.js${R}                       ${B}║${R}
${B}║${R}  3. Espera o download de fpg-batch-missing.json        ${B}║${R}
${B}║${R}  4. Corre outra vez: ${GREEN}node pipeline.js --update${R}        ${B}║${R}
${B}╚════════════════════════════════════════════════════════╝${R}
`);
      process.exit(0); // Parar aqui — esperar pela Fase 2
    }
  }
}

if (syncOnly) {
  const feds = fedCodes.length > 0 ? fedCodes : Object.keys(playersDb);
  console.log(`--sync-players: ${feds.length} jogadores`);
  syncPlayersJson(feds);
  process.exit(0);
}

if (fedCodes.length === 0) {
  console.log(`
${B}╔════════════════════════════════════════════════════════╗${R}
${B}║          pipeline.js — Pipeline FPG unificado         ║${R}
${B}╠════════════════════════════════════════════════════════╣${R}
${B}║${R}                                                        ${B}║${R}
${B}║${R}  Uso: node pipeline.js <federados...> [opções]         ${B}║${R}
${B}║${R}                                                        ${B}║${R}
${B}║${R}  1. Descarrega no browser:                             ${B}║${R}
${B}║${R}     scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884       ${B}║${R}
${B}║${R}     F12 → Console → cola fpg-download.js               ${B}║${R}
${B}║${R}                                                        ${B}║${R}
${B}║${R}  2. Corre: node pipeline.js 52884                      ${B}║${R}
${B}║${R}     ou:   node pipeline.js --batch                     ${B}║${R}
${B}║${R}                                                        ${B}║${R}
${B}║${R}  Opções:                                               ${B}║${R}
${B}║${R}    --all             Todos de players.json             ${B}║${R}
${B}║${R}    --batch           Importar fpg-batch-*.json         ${B}║${R}
${B}║${R}    --priority        Só jogadores prioritários         ${B}║${R}
${B}║${R}    --skip-import     Dados já em output/               ${B}║${R}
${B}║${R}    --skip-render     Saltar geração de data.json       ${B}║${R}
${B}║${R}    --sync-players    Só actualizar players.json        ${B}║${R}
${B}║${R}    --downloads <dir> Pasta de downloads                ${B}║${R}
${B}║${R}                                                        ${B}║${R}
${B}╚════════════════════════════════════════════════════════╝${R}
`);
  process.exit(0);
}

// ═══════ BANNER ═══════
console.log(`
${B}╔════════════════════════════════════════════════════════╗${R}
${B}║          pipeline.js — Pipeline FPG                   ║${R}
${B}╠════════════════════════════════════════════════════════╣${R}
${B}║${R}  Federados: ${fedCodes.join(", ").substring(0, 42).padEnd(42)}${B}║${R}
${B}║${R}  Import:    ${(skipImport ? "Saltar" : "Sim (" + downloadsDir + ")").substring(0, 42).padEnd(42)}${B}║${R}
${B}║${R}  Render:    ${(skipRender ? "Saltar" : "Sim").padEnd(42)}${B}║${R}
${B}╚════════════════════════════════════════════════════════╝${R}
`);

// ══════════════════════════════════════════════════════════
// PASSO 1: IMPORT — localizar ficheiros e copiar para output/
// ══════════════════════════════════════════════════════════
if (!skipImport) {
  step("1/5", "Importar ficheiros dos Downloads");

  for (const fed of fedCodes) {
    const outDir = path.join(process.cwd(), "output", fed);
    const scorecardsDir = path.join(outDir, "scorecards");
    fs.mkdirSync(scorecardsDir, { recursive: true });

    // Procurar ficheiros (com e sem número do federado no nome)
    const whsCandidates = [
      `whs-list-${fed}.json`,
      `whs-list.json`
    ];
    const scCandidates = [
      `scorecards-${fed}.json`,
      `scorecards-all.json`
    ];

    let whsSrc = null, scSrc = null;
    for (const f of whsCandidates) {
      const p = path.join(downloadsDir, f);
      if (fs.existsSync(p)) { whsSrc = p; break; }
    }
    for (const f of scCandidates) {
      const p = path.join(downloadsDir, f);
      if (fs.existsSync(p)) { scSrc = p; break; }
    }

    if (!whsSrc) {
      fail(`[${fed}] Não encontrei whs-list-${fed}.json em ${downloadsDir}`);
      warn(`  Abre scoring.fpg.pt/lists/PlayerWHS.aspx?no=${fed} e corre o script na consola.`);
      continue;
    }

    // ── Copiar WHS list ──
    const whsDst = path.join(outDir, "whs-list.json");
    const whsData = readJSON(whsSrc);
    const whsCount = whsData?.Records?.length || 0;

    if (fs.existsSync(whsDst)) {
      const oldCount = readJSON(whsDst)?.Records?.length || 0;
      fs.copyFileSync(whsDst, whsDst + ".bak");
      if (whsCount > oldCount) {
        ok(`[${fed}] WHS: ${oldCount} → ${whsCount} (+${whsCount - oldCount} novos)`);
      } else {
        info(`[${fed}] WHS: ${whsCount} registos (sem alteração)`);
      }
    } else {
      ok(`[${fed}] WHS: ${whsCount} registos (primeira vez)`);
    }

    fs.copyFileSync(whsSrc, whsDst);

    // ── Extrair scorecards ──
    if (scSrc) {
      const scData = readJSON(scSrc);
      const scoreIds = Object.keys(scData);
      let newSc = 0;

      for (const id of scoreIds) {
        const filePath = path.join(scorecardsDir, `${id}.json`);
        if (!fs.existsSync(filePath)) newSc++;
        fs.writeFileSync(filePath, JSON.stringify(scData[id], null, 2), "utf-8");
      }

      ok(`[${fed}] Scorecards: ${scoreIds.length} total (${newSc} novos)`);
    } else {
      warn(`[${fed}] Ficheiro de scorecards não encontrado — a saltar`);
    }
  }
}

// ══════════════════════════════════════════════════════════
// PASSO 2: RENDER — gerar data.json (make-scorecards-ui.js)
// ══════════════════════════════════════════════════════════
if (!skipRender) {
  step("2/5", `Gerar dados para ${fedCodes.length} jogador(es)`);

  const uiScript = path.join(process.cwd(), "scripts", "make-scorecards-ui.js");
  if (!fs.existsSync(uiScript)) {
    fail(`Não encontrei: ${uiScript}`);
  } else {
    try {
      execSync(`node "${uiScript}" ${fedCodes.join(" ")}`, {
        stdio: "inherit",
        cwd: process.cwd(),
        maxBuffer: 50 * 1024 * 1024
      });
      ok(`${fedCodes.length} jogador(es) processado(s)`);
    } catch (e) {
      warn(`Render retornou erro (pode ser parcial): ${e.message}`);
    }
  }
}

// ══════════════════════════════════════════════════════════
// PASSO 3: SYNC — actualizar players.json
// ══════════════════════════════════════════════════════════
step("3/5", "Sincronizar players.json");
syncPlayersJson(fedCodes);

// ══════════════════════════════════════════════════════════
// PASSO 4: ENRICH — gerar player-stats.json
// ══════════════════════════════════════════════════════════
step("4/5", "Enriquecer player-stats.json");
try {
  const enrichScript = path.join(process.cwd(), "scripts", "enrich-players.js");
  if (fs.existsSync(enrichScript)) {
    execSync(`node "${enrichScript}" ${fedCodes.join(" ")}`, { stdio: "inherit", cwd: process.cwd() });
    ok("player-stats.json actualizado");
  } else {
    warn("enrich-players.js não encontrado");
  }
} catch (e) {
  warn(`enrich-players.js falhou: ${e.message}`);
}

// ══════════════════════════════════════════════════════════
// PASSO 5: EXTRACT — gerar away-courses.json
// ══════════════════════════════════════════════════════════
step("5/5", "Extrair campos internacionais");
try {
  const extractScript = path.join(process.cwd(), "scripts", "extract-courses.js");
  if (fs.existsSync(extractScript)) {
    execSync(`node "${extractScript}"`, { stdio: "inherit", cwd: process.cwd() });
    ok("away-courses.json actualizado");
  } else {
    warn("extract-courses.js não encontrado");
  }
} catch (e) {
  warn(`extract-courses.js falhou: ${e.message}`);
}

// ══════════════════════════════════════════════════════════
// RESUMO
// ══════════════════════════════════════════════════════════
step("✅", "RESUMO");
for (const fed of fedCodes) {
  const outDir = path.join(process.cwd(), "output", fed);
  const whsPath = path.join(outDir, "whs-list.json");
  const scDir = path.join(outDir, "scorecards");
  const dataPath = path.join(outDir, "analysis", "data.json");

  const whsCount = fs.existsSync(whsPath)
    ? (readJSON(whsPath)?.Records?.length || 0) : 0;
  const scCount = fs.existsSync(scDir)
    ? fs.readdirSync(scDir).filter(f => f.endsWith(".json")).length : 0;
  const hasData = fs.existsSync(dataPath);

  // Ler HCP actual do data.json
  let hcpStr = "—";
  if (hasData) {
    try {
      const dj = readJSON(dataPath);
      const hcp = dj?.HCP_INFO?.current;
      if (hcp != null) hcpStr = String(hcp);
    } catch {}
  }

  const name = playersDb[fed]?.name || fed;
  console.log(`  ${B}${name}${R} (${fed}): ${whsCount} registos · ${scCount} scorecards · HCP ${hcpStr} ${hasData ? GREEN + "✓" + R : RED + "✗" + R}`);
}

console.log(`\n${GREEN}${B}Concluído!${R}\n`);

// ══════════════════════════════════════════════════════════
// SYNC PLAYERS.JSON
// ══════════════════════════════════════════════════════════
function syncPlayersJson(fedList) {
  const pPath = path.join(process.cwd(), "players.json");
  let db = {};
  try { db = readJSON(pPath); } catch { warn("players.json não encontrado"); return; }

  let updated = 0;
  for (const fed of fedList) {
    const outDir = path.join(process.cwd(), "output", fed);
    const scDir = path.join(outDir, "scorecards");
    const whsPath = path.join(outDir, "whs-list.json");

    let entry = db[fed];
    if (!entry) continue;
    if (typeof entry === "string") entry = { name: entry };

    let changed = false;

    // ── 1. Clube: extrair do scorecard mais recente ──
    if (fs.existsSync(scDir)) {
      const countryNames = new Set(["Portugal","Spain","England","France","Germany","Italy",
        "Switzerland","Netherlands","Belgium","Ireland","Scotland","Wales","Sweden","Norway",
        "Denmark","Finland","Austria","Poland","Czech Republic","Slovakia","Hungary","Romania",
        "Bulgaria","Slovenia","Croatia","Lithuania","Latvia","Estonia","Ukraine","Russia",
        "Russian Federation","Turkey","Greece","Serbia","United States","USA","Canada","Mexico",
        "Brazil","Colombia","Argentina","Chile","China","Japan","India","South Korea","Thailand",
        "Philippines","Singapore","South Africa","Australia","New Zealand","United Kingdom",
        "Great Britain","Northern Ireland","Jersey"]);

      let latestClub = null, latestClubCode = null, latestDate = 0;
      for (const f of fs.readdirSync(scDir).filter(f => f.endsWith(".json"))) {
        try {
          const rec = readJSON(path.join(scDir, f))?.Records?.[0];
          if (!rec) continue;
          const dm = String(rec.played_at || "").match(/Date\((\d+)\)/);
          const d = dm ? Number(dm[1]) : 0;
          if (d > latestDate && rec.player_acronym && !countryNames.has(rec.player_acronym)) {
            latestDate = d;
            latestClub = rec.player_acronym;
            latestClubCode = rec.player_club_code || null;
          }
        } catch {}
      }
      const currentClub = (typeof entry.club === "object" && entry.club) ? entry.club.short : (entry.club || "");
      if (latestClub && latestClub !== currentClub) {
        if (typeof entry.club === "object" && entry.club) {
          entry.club.short = latestClub;
          entry.club.long = latestClub;
          if (latestClubCode) entry.club.code = String(latestClubCode);
        } else {
          entry.club = latestClub;
        }
        changed = true;
        info(`[sync] ${fed}: clube → ${latestClub}`);
      }
    }

    // ── 2. HCP: preferir data.json, fallback whs-list.json ──
    const dataJsonPath = path.join(outDir, "analysis", "data.json");
    let gotHcp = false;
    if (fs.existsSync(dataJsonPath)) {
      try {
        const dj = readJSON(dataJsonPath);
        const djHcp = dj?.HCP_INFO?.current != null ? parseFloat(dj.HCP_INFO.current) : null;
        if (djHcp != null && isFinite(djHcp) && djHcp !== entry.hcp) {
          entry.hcp = djHcp;
          changed = true;
          info(`[sync] ${fed}: HCP → ${djHcp}`);
        }
        gotHcp = djHcp != null;

        const lr = dj?.META?.lastRoundDate;
        if (lr && lr !== entry.lastRound) {
          entry.lastRound = lr;
          changed = true;
        }
      } catch {}
    }

    // Fallback: ler new_handicap directamente do whs-list (Schema 1!)
    if (!gotHcp && fs.existsSync(whsPath)) {
      try {
        const rows = (readJSON(whsPath)?.Records) || [];
        let latestHcp = null, latestDate = 0;
        for (const r of rows) {
          const dm = String(r.played_at || r.hcp_date || "").match(/Date\((\d+)\)/);
          const d = dm ? Number(dm[1]) : 0;
          // Schema 1: new_handicap é o campo autoritativo
          const nh = r.new_handicap != null ? parseFloat(r.new_handicap) : null;
          if (d > latestDate && nh != null && isFinite(nh)) {
            latestDate = d;
            latestHcp = nh;
          }
        }
        if (latestHcp != null && latestHcp !== entry.hcp) {
          entry.hcp = latestHcp;
          changed = true;
          info(`[sync] ${fed}: HCP → ${latestHcp} (whs-list)`);
        }
        if (!entry.lastRound && latestDate > 0) {
          const ld = new Date(latestDate);
          entry.lastRound = `${String(ld.getDate()).padStart(2, "0")}-${String(ld.getMonth() + 1).padStart(2, "0")}-${ld.getFullYear()}`;
          changed = true;
        }
      } catch {}
    }

    // ── 3. Escalão: recalcular a partir da data de nascimento ──
    if (entry.dob) {
      const y = Number(entry.dob.split("-")[0]);
      if (y) {
        const age = new Date().getFullYear() - y;
        let esc = "";
        if (age >= 50) esc = "Sénior";
        else if (age >= 19) esc = "Absoluto";
        else if (age >= 17) esc = "Sub-18";
        else if (age >= 15) esc = "Sub-16";
        else if (age >= 13) esc = "Sub-14";
        else if (age >= 11) esc = "Sub-12";
        else esc = "Sub-10";
        if (esc && esc !== entry.escalao) {
          entry.escalao = esc;
          changed = true;
        }
      }
    }

    if (changed) { db[fed] = entry; updated++; }
  }

  if (updated > 0) {
    fs.writeFileSync(pPath, JSON.stringify(db, null, 2), "utf-8");
    const publicPath = path.join(process.cwd(), "public", "data", "players.json");
    fs.mkdirSync(path.dirname(publicPath), { recursive: true });
    fs.copyFileSync(pPath, publicPath);
    ok(`players.json actualizado (${updated} jogador(es))`);
  } else {
    info("players.json sem alterações");
  }
}
