#!/usr/bin/env node
/**
 * diff-federados.js — Lista detalhadamente as alterações entre 2 versões de
 *                     federados.json, agrupadas por tipo de mudança.
 *
 * Default: compara a versão actual no disco contra a do último commit
 * (`git show HEAD:public/data/federados.json`). Útil logo a seguir a um
 * `scrape-federados-node.js` para ver QUEM mudou (não só quantos).
 *
 * Uso:
 *   node scripts/diff-federados.js                              # vs git HEAD
 *   node scripts/diff-federados.js --prev path/to/old.json      # vs ficheiro
 *   node scripts/diff-federados.js --rev HEAD~3                 # vs commit antigo
 *   node scripts/diff-federados.js --only photos                # só fotos
 *   node scripts/diff-federados.js --only clubs                 # só clubes
 *   node scripts/diff-federados.js --only new                   # só novos
 *   node scripts/diff-federados.js --only removed               # só saídos
 *   node scripts/diff-federados.js --only hcp                   # só HCP
 *   node scripts/diff-federados.js --hcp-min 1                  # só HCP com |delta|>=1
 *
 * Saída em texto plano formatado, fácil de ler e copiar.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const FEDERADOS_PATH = path.join(ROOT, "public", "data", "federados.json");

// ── Args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const prevPath = argVal("--prev");
const rev      = argVal("--rev") || "HEAD";
const onlyArg  = argVal("--only");
const hcpMin   = parseFloat(argVal("--hcp-min") || "0.1");

const VALID_SECTIONS = new Set(["photos", "clubs", "new", "removed", "hcp", "all"]);
const sections = onlyArg ? new Set([onlyArg]) : new Set(["photos", "clubs", "new", "removed", "hcp"]);
if (onlyArg && !VALID_SECTIONS.has(onlyArg)) {
  console.error(`✗ --only inválido: "${onlyArg}". Valores: ${[...VALID_SECTIONS].join(", ")}`);
  process.exit(1);
}

// ── Loader ──────────────────────────────────────────────────────
function loadCurrent() {
  if (!fs.existsSync(FEDERADOS_PATH)) {
    console.error(`✗ Ficheiro actual não encontrado: ${FEDERADOS_PATH}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(FEDERADOS_PATH, "utf8"));
}

function loadPrev() {
  if (prevPath) {
    if (!fs.existsSync(prevPath)) {
      console.error(`✗ --prev não encontrado: ${prevPath}`);
      process.exit(1);
    }
    return JSON.parse(fs.readFileSync(prevPath, "utf8"));
  }
  // git show <rev>:public/data/federados.json
  try {
    const buf = execSync(`git show ${rev}:public/data/federados.json`, {
      cwd: ROOT,
      maxBuffer: 100 * 1024 * 1024, // 100 MB — federados.json é ~15 MB
      encoding: "utf8",
    });
    return JSON.parse(buf);
  } catch (e) {
    console.error(`✗ git show ${rev}:public/data/federados.json falhou: ${e.message}`);
    console.error(`  Sugestão: usa --prev para passar o ficheiro antigo manualmente.`);
    process.exit(1);
  }
}

// ── Helpers de formato ──────────────────────────────────────────
function fmtPlayer(p) {
  const name  = p.name || "(sem nome)";
  const fed   = p.federation_code || "?";
  const club  = p.club_name || p.acronym || "(sem clube)";
  const hcp   = p.hcp_exact != null ? Number(p.hcp_exact).toFixed(1).padStart(5) : "  —  ";
  const age   = p.age_level || "";
  return { name, fed, club, hcp, age };
}

function header(title, n) {
  const bar = "─".repeat(70);
  console.log("");
  console.log(bar);
  console.log(`${title}  (${n})`);
  console.log(bar);
}

// ── Diff core ───────────────────────────────────────────────────
function buildDiff(prev, curr) {
  const prevByFed = new Map((prev.players || []).map(p => [String(p.federation_code), p]));
  const currByFed = new Map((curr.players || []).map(p => [String(p.federation_code), p]));

  const out = {
    newPlayers: [],
    removed:    [],
    photoChanges: [],
    clubChanges:  [],
    hcpChanges:   [],
  };

  for (const [fed, n] of currByFed) {
    const p = prevByFed.get(fed);
    if (!p) {
      out.newPlayers.push(n);
      continue;
    }
    if ((p.photo || null) !== (n.photo || null)) {
      out.photoChanges.push({ player: n, from: p.photo || null, to: n.photo || null });
    }
    if ((p.club_code || "") !== (n.club_code || "")) {
      out.clubChanges.push({
        player: n,
        from: p.club_name || p.acronym || "(sem clube)",
        fromCode: p.club_code || "",
        to:   n.club_name || n.acronym || "(sem clube)",
        toCode: n.club_code || "",
      });
    }
    const pHcp = p.hcp_exact != null ? Number(p.hcp_exact) : null;
    const nHcp = n.hcp_exact != null ? Number(n.hcp_exact) : null;
    if (pHcp !== nHcp) {
      const delta = (pHcp != null && nHcp != null) ? (nHcp - pHcp) : null;
      out.hcpChanges.push({ player: n, from: pHcp, to: nHcp, delta });
    }
  }

  for (const [fed, p] of prevByFed) {
    if (!currByFed.has(fed)) out.removed.push(p);
  }

  // Ordenar por nome para listagem estável
  const cmp = (a, b) => (fmtPlayer(a).name).localeCompare(fmtPlayer(b).name, "pt");
  out.newPlayers.sort(cmp);
  out.removed.sort(cmp);
  out.photoChanges.sort((a, b) => cmp(a.player, b.player));
  out.clubChanges.sort((a, b) => cmp(a.player, b.player));
  // HCP: ordenar por |delta| descendente — maiores variações primeiro
  out.hcpChanges.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));

  return out;
}

// ── Print sections ──────────────────────────────────────────────
function printPhotos(diff) {
  header("📷 FOTOS ALTERADAS", diff.photoChanges.length);
  if (diff.photoChanges.length === 0) {
    console.log("(nenhuma)");
    return;
  }
  for (const c of diff.photoChanges) {
    const f = fmtPlayer(c.player);
    console.log(`  ${f.name.padEnd(40)}  fed=${f.fed.padEnd(6)}  ${f.age.padEnd(8)}  ${f.club}`);
    console.log(`    antes: ${c.from || "(null)"}`);
    console.log(`    novo:  ${c.to   || "(null)"}`);
    if (c.to) {
      console.log(`    URL:   https://hcp-portugal.datagolf.pt/photos/${c.to}`);
    }
    console.log("");
  }
}

function printClubs(diff) {
  header("🏌 MUDANÇAS DE CLUBE", diff.clubChanges.length);
  if (diff.clubChanges.length === 0) {
    console.log("(nenhuma)");
    return;
  }
  for (const c of diff.clubChanges) {
    const f = fmtPlayer(c.player);
    console.log(`  ${f.name.padEnd(40)}  fed=${f.fed.padEnd(6)}  ${f.age.padEnd(8)}  HCP=${f.hcp}`);
    console.log(`    de: ${c.from} (${c.fromCode || "—"})`);
    console.log(`    p/: ${c.to}   (${c.toCode || "—"})`);
    console.log("");
  }
}

function printNew(diff) {
  header("🆕 NOVOS FEDERADOS", diff.newPlayers.length);
  if (diff.newPlayers.length === 0) {
    console.log("(nenhum)");
    return;
  }
  // Tabela compacta
  for (const p of diff.newPlayers) {
    const f = fmtPlayer(p);
    console.log(`  ${f.name.padEnd(40)}  fed=${f.fed.padEnd(6)}  ${f.age.padEnd(8)}  HCP=${f.hcp}  ${f.club}`);
  }
}

function printRemoved(diff) {
  header("➖ FEDERADOS QUE SAÍRAM (ou ficaram inactivos)", diff.removed.length);
  if (diff.removed.length === 0) {
    console.log("(nenhum)");
    return;
  }
  for (const p of diff.removed) {
    const f = fmtPlayer(p);
    console.log(`  ${f.name.padEnd(40)}  fed=${f.fed.padEnd(6)}  ${f.age.padEnd(8)}  HCP=${f.hcp}  ${f.club}`);
  }
}

function printHcp(diff) {
  const filtered = diff.hcpChanges.filter(c => Math.abs(c.delta ?? 0) >= hcpMin);
  header(`📊 HCP ALTERADO (|Δ| ≥ ${hcpMin.toFixed(1)})`, filtered.length);
  if (filtered.length === 0) {
    console.log(`(nenhum acima do limite — total bruto: ${diff.hcpChanges.length}, ajustar com --hcp-min 0)`);
    return;
  }
  // Top 50 — mostrar os maiores movimentos primeiro
  const show = filtered.slice(0, 50);
  for (const c of show) {
    const f = fmtPlayer(c.player);
    const fromS = c.from != null ? c.from.toFixed(1).padStart(5) : "  —  ";
    const toS   = c.to   != null ? c.to.toFixed(1).padStart(5)   : "  —  ";
    const dS    = c.delta != null
      ? (c.delta > 0 ? "+" + c.delta.toFixed(1) : c.delta.toFixed(1)).padStart(5)
      : "  —  ";
    console.log(`  ${f.name.padEnd(40)}  fed=${f.fed.padEnd(6)}  ${fromS} → ${toS}  (${dS})  ${f.club}`);
  }
  if (filtered.length > show.length) {
    console.log(`  … e mais ${filtered.length - show.length} (filtra com --hcp-min mais alto)`);
  }
}

// ── Main ────────────────────────────────────────────────────────
function main() {
  console.log("→ A carregar versão actual...");
  const curr = loadCurrent();
  console.log(`  ${(curr.players || []).length} federados em ${FEDERADOS_PATH}`);

  console.log(`→ A carregar versão anterior (${prevPath ? `do ficheiro ${prevPath}` : `git show ${rev}`})...`);
  const prev = loadPrev();
  console.log(`  ${(prev.players || []).length} federados em ${prevPath ? path.basename(prevPath) : `${rev} (git)`}`);

  const diff = buildDiff(prev, curr);

  console.log("");
  console.log("Resumo:");
  console.log(`  Novos:           ${diff.newPlayers.length}`);
  console.log(`  Saíram:          ${diff.removed.length}`);
  console.log(`  Fotos:           ${diff.photoChanges.length}`);
  console.log(`  Clubes:          ${diff.clubChanges.length}`);
  console.log(`  HCP (qualquer):  ${diff.hcpChanges.length}`);

  if (sections.has("photos"))  printPhotos(diff);
  if (sections.has("clubs"))   printClubs(diff);
  if (sections.has("new"))     printNew(diff);
  if (sections.has("removed")) printRemoved(diff);
  if (sections.has("hcp"))     printHcp(diff);

  console.log("");
  console.log("✓ Fim do diff.");
}

main();
