#!/usr/bin/env node
/**
 * build-inativos-lista.js
 * ═══════════════════════════════════════════════════════════════
 * Lista leve dos federados INACTIVOS para a /jogadores (pedido da Mariana,
 * 02/11/2026: «os federados que já saíram (…) desde que estejam com a
 * indicação INACTIVOS»).
 *
 * Lê o ficheiro pesado `data-archive/federados-inativos.json` (~42 MB, FPG
 * FedStat=7, gerado por scripts/scrape-federados-inativos.js) e grava
 * `public/data/federados-inativos-lista.json` — uma linha por federado, só com
 * as colunas que a lista mostra/filtra:
 *
 *   j: [fed, nome, sexo, nascimento, clube, país (vazio = Portugal),
 *       hcp, estadoHcpId, tipoId (1 amador / 2 pro), escalão FPG]
 *   clubes: { código: [sigla, nome] }   estadosHcp: { id: rótulo }
 *
 * Quem voltou a ser federado (está no federados.json) é tirado na página.
 *
 * USO:
 *   node scripts/build-inativos-lista.js [--force]
 * ═══════════════════════════════════════════════════════════════
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { writeJsonGuarded, hasForceFlag } = require("./lib/shrink-guard");

const ROOT = path.join(__dirname, "..");
const INPUT = path.join(ROOT, "data-archive/federados-inativos.json");
const OUTPUT = path.join(ROOT, "public/data/federados-inativos-lista.json");

if (!fs.existsSync(INPUT)) {
  console.error("❌ Não encontrei", path.relative(ROOT, INPUT));
  console.error("   Faz o scrape primeiro com scripts/scrape-federados-inativos.js");
  process.exit(1);
}

let raw;
try {
  raw = JSON.parse(fs.readFileSync(INPUT, "utf8"));
} catch (e) {
  console.error("❌ Ilegível:", path.relative(ROOT, INPUT), e.message);
  process.exit(1);
}
if (!Array.isArray(raw.players) || raw.players.length === 0) {
  console.error("❌ Sem jogadores em", path.relative(ROOT, INPUT));
  process.exit(1);
}

const clubes = {};
const estadosHcp = {};
const j = [];
for (const p of raw.players) {
  const fed = String(p.federation_code || "").trim();
  if (!fed) continue;
  const club = String(p.club_code || "");
  if (club && !clubes[club]) clubes[club] = [p.acronym || "", p.club_name || ""];
  const hsId = Number(p.hcp_status_id) || 0;
  if (p.hcp_status && !estadosHcp[hsId]) estadosHcp[hsId] = p.hcp_status;
  const pais = p.country && p.country !== "Portugal" ? p.country : "";
  j.push([
    fed,
    String(p.name || "").trim(),
    p.gender === "F" ? "F" : "M",
    p.birthdate || "",
    club,
    pais,
    p.hcp_exact ?? null,
    hsId,
    Number(p.player_type_id) || 1,
    p.age_level || "",
  ]);
}

const out = {
  _gerado: new Date().toISOString(),
  fonte: `data-archive/federados-inativos.json (FPG, FedStat=7, scrape ${String(raw.generated || "").slice(0, 10)})`,
  total: j.length,
  clubes,
  estadosHcp,
  j,
};

const r = writeJsonGuarded(OUTPUT, out, {
  count: d => d.j.length,
  force: hasForceFlag(),
  label: "inactivos",
  spaces: 0,
  trailingNewline: true,
});
if (!r.written) {
  console.error(`❌ Não gravado: ${r.reason}`);
  process.exit(1);
}
console.log(`✅ ${path.relative(ROOT, OUTPUT)} — ${j.length.toLocaleString("pt-PT")} inactivos, ${(fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(2)} MB`);
