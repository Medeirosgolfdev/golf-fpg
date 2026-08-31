#!/usr/bin/env node
/**
 * process-draw-inbox.js — o "percurso" dos draws CGSS: largar o PDF em
 * C:\golf-fpg\draws-inbox\ e NÃO fazer mais nada.
 * ═══════════════════════════════════════════════════════════════════════════
 * Corre de 15 em 15 min por Windows Scheduled Task ("GolfFPG-DrawInbox",
 * registada por scripts/setup-draw-inbox-task.ps1). Para cada *.pdf na pasta:
 *
 *   1. `git pull --rebase --autostash` (o repo auto-committa por Actions).
 *   2. `node scripts/add-cgss-draw.js --pdf <pdf> --strict-cgss` — extrai o
 *      draw, atribui o placeholder 9xxxx seguinte, resolve feds, escreve
 *      entrada + stub. (--strict-cgss: PDFs de outros organizadores, ex. PXO
 *      Porto Santo, são recusados para tratamento manual.)
 *   3. `npx vitest run` (sanidade) e commit+push dos 2 JSON.
 *   4. Move o PDF para draws-inbox/processados/. Em erro: move para
 *      draws-inbox/erros/ + escreve <nome>.log com o output completo.
 *
 * A partir daí a GitHub Action update-cgss-draw.yml (auto-descobridora) trata
 * dos resultados no dia do torneio, do re-chaveamento placeholder→real e da
 * reconciliação de feds — e manda o aviso por email (issue auto-fechada).
 *
 * Registo de tudo em draws-inbox/inbox-log.txt. Lock simples (lockdir) evita
 * corridas sobrepostas; PDFs com mtime <60s são deixados para a próxima
 * passagem (podem ainda estar a ser gravados/sincronizados).
 *
 * USO manual: node scripts/process-draw-inbox.js [--once <pdf>]
 * EXIT: 0 sempre que o ciclo corre (mesmo com PDFs em erro — ficam em erros/).
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");
const INBOX = path.join(REPO, "draws-inbox");
const DONE = path.join(INBOX, "processados");
const ERR = path.join(INBOX, "erros");
const LOG = path.join(INBOX, "inbox-log.txt");
const LOCK = path.join(INBOX, ".lock");

for (const d of [INBOX, DONE, ERR]) fs.mkdirSync(d, { recursive: true });

const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (msg) => {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
};

/* ── lock (lockdir atómico; locks com >30 min são considerados órfãos) ──── */
try {
  fs.mkdirSync(LOCK);
} catch {
  try {
    const age = Date.now() - fs.statSync(LOCK).mtimeMs;
    if (age < 30 * 60 * 1000) process.exit(0); // outra corrida a decorrer
    fs.rmdirSync(LOCK);
    fs.mkdirSync(LOCK);
  } catch { process.exit(0); }
}
const unlock = () => { try { fs.rmdirSync(LOCK); } catch { /* já removido */ } };
process.on("exit", unlock);

/* ── PDFs a processar ───────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const onceIdx = args.indexOf("--once");
let pdfs;
if (onceIdx >= 0) {
  pdfs = [path.resolve(args[onceIdx + 1])];
} else {
  pdfs = fs.readdirSync(INBOX)
    .filter((f) => /\.pdf$/i.test(f))
    .map((f) => path.join(INBOX, f))
    .filter((p) => Date.now() - fs.statSync(p).mtimeMs > 60 * 1000); // ainda a gravar? fica p/ próxima
}
if (pdfs.length === 0) process.exit(0); // silencioso — corre de 15 em 15 min

const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });

log(`inbox: ${pdfs.length} PDF(s) para processar.`);

/* ── git pull primeiro (o repo auto-committa por Actions) ───────────────── */
try {
  run("git", ["-c", "rebase.autoStash=true", "pull", "--rebase", "-q"]);
} catch (e) {
  log(`⚠ git pull falhou (${String(e.message).split("\n")[0]}) — continuo com a árvore local.`);
}

const DATA_FILES = ["public/data/cgss-draws-manual.json", "public/data/pull-torneios001.json"];

for (const pdf of pdfs) {
  const base = path.basename(pdf);
  let output = "";
  try {
    output = run("node", [path.join("scripts", "add-cgss-draw.js"), "--pdf", pdf, "--strict-cgss"]);
    log(`✓ ${base}: entrada criada.`);
    log(output.trim().split("\n").map((l) => "    " + l).join("\n"));

    // sanidade antes do commit — se os testes partirem, reverter os 2 JSON
    try {
      run("npx", ["vitest", "run"], { shell: true, timeout: 300000 });
    } catch (e) {
      run("git", ["checkout", "--", ...DATA_FILES]);
      throw new Error("npm test falhou depois da inserção — entrada revertida:\n" + (e.stdout || e.message));
    }

    run("git", ["add", ...DATA_FILES]);
    run("git", ["commit", "-q", "-m",
      `data: draw CGSS via inbox (${base})\n\nInserido automaticamente por process-draw-inbox.js.\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>`]);
    let pushed = false;
    for (let i = 1; i <= 3 && !pushed; i++) {
      try {
        run("git", ["-c", "rebase.autoStash=true", "pull", "--rebase", "-q"]);
        run("git", ["push", "-q"]);
        pushed = true;
      } catch { execSync(`ping -n ${i * 5} 127.0.0.1 > NUL`, { shell: true }); }
    }
    if (!pushed) {
      log(`⚠ ${base}: commit local feito mas o PUSH falhou — fica para o próximo ciclo/push manual.`);
    }
    fs.renameSync(pdf, path.join(DONE, base));
    log(`✓ ${base}: ${pushed ? "committado e pushed" : "committado (push pendente)"} → processados/.`);
  } catch (e) {
    const detail = [output, e.stdout || "", e.stderr || "", e.message].filter(Boolean).join("\n");
    try { fs.renameSync(pdf, path.join(ERR, base)); } catch { /* --once fora do inbox */ }
    fs.writeFileSync(path.join(ERR, base + ".log"), `[${ts()}] ${base} FALHOU\n\n${detail}\n`);
    log(`✗ ${base}: FALHOU → erros/${base} (+ .log). Motivo (1ª linha): ${String(detail).trim().split("\n").pop()}`);
  }
}
log("inbox: ciclo terminado.");
