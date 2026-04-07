#!/usr/bin/env node
/**
 * scrape-inscricoes-nacionais.js
 * Scrapes tournament admission lists from FPG scoring system
 * Campeonatos Nacionais de Jovens – tcodes 10935 a 10944
 *
 * Output: data/inscricoes_nacionais.json
 *
 * Usage:
 *   node scripts/scrape-inscricoes-nacionais.js
 *   node scripts/scrape-inscricoes-nacionais.js --tcode 10941   (um só torneio)
 *   node scripts/scrape-inscricoes-nacionais.js --dry            (lista os torneios sem gravar)
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ── Dependência opcional: cheerio ──────────────────────────────────────────
let cheerio;
try {
  cheerio = require("cheerio");
} catch {
  console.error("❌  cheerio não encontrado. Instala com: npm install cheerio");
  process.exit(1);
}

// ── Configuração ───────────────────────────────────────────────────────────
const BASE_URL  = "https://scoring.fpg.pt/lists/tournAdmissions.aspx";
const OUT_FILE  = path.join(__dirname, "..", "data", "inscricoes_nacionais.json");
const DELAY_MS  = 800;   // pausa entre pedidos para não sobrecarregar o servidor

/** Mapa dos torneios conhecidos (tcode → metadados) */
const TORNEIOS_CONHECIDOS = {
  "10935": { nome: "Campeonato Nacional de Jovens Sub-18 H", escalao: "Sub-18", sex: "M" },
  "10936": { nome: "Campeonato Nacional de Jovens Sub-18 S", escalao: "Sub-18", sex: "F" },
  "10937": { nome: "Campeonato Nacional de Jovens Sub-16 H", escalao: "Sub-16", sex: "M" },
  "10938": { nome: "Campeonato Nacional de Jovens Sub-16 S", escalao: "Sub-16", sex: "F" },
  "10939": { nome: "Campeonato Nacional de Jovens Sub-14 H", escalao: "Sub-14", sex: "M" },
  "10940": { nome: "Campeonato Nacional de Jovens Sub-14 S", escalao: "Sub-14", sex: "F" },
  "10941": { nome: "Campeonato Nacional de Jovens Sub-12 H", escalao: "Sub-12", sex: "M" },
  "10942": { nome: "Campeonato Nacional de Jovens Sub-12 S", escalao: "Sub-12", sex: "F" },
  "10943": { nome: "Campeonato Nacional de Jovens Sub-10 H", escalao: "Sub-10", sex: "M" },
  "10944": { nome: "Campeonato Nacional de Jovens Sub-10 S", escalao: "Sub-10", sex: "F" },
};

// ── Argumentos CLI ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDry = args.includes("--dry");
const tcodeArg = (() => {
  const i = args.indexOf("--tcode");
  return i >= 0 ? args[i + 1] : null;
})();

const tcodesToFetch = tcodeArg
  ? [tcodeArg]
  : Object.keys(TORNEIOS_CONHECIDOS);

// ── Utilitários ────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function cleanText(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

/** Detecta o número federado numa string (padrão numérico 4-6 dígitos) */
function extractFed(s) {
  const m = String(s || "").match(/\b(\d{4,6})\b/);
  return m ? m[1] : null;
}

/** Normaliza HCP: "5,2" → "5.2", empty → null */
function normalizeHcp(s) {
  const v = cleanText(s).replace(",", ".");
  if (!v || v === "-" || v === "–") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// ── Fetch com headers de browser ───────────────────────────────────────────
async function fetchPage(tcode) {
  const url = `${BASE_URL}?ccode=000&tcode=${tcode}`;
  console.log(`  → GET ${url}`);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
      "Referer": "https://scoring.fpg.pt/",
    },
  });

  if (!res.ok) {
    console.warn(`  ⚠️  HTTP ${res.status} para tcode=${tcode} – a saltar`);
    return null;
  }
  return res.text();
}

// ── Parser HTML da página tournAdmissions ─────────────────────────────────
/**
 * A página gera um GridView ASP.NET que resulta numa <table>.
 * Colunas típicas (podem variar):
 *   Nº | Nome | Nº Federado | Handicap | Clube | ...
 * Estratégia:
 *   1. Encontrar o índice das colunas pelo cabeçalho
 *   2. Iterar as linhas de dados
 */
function parsePage(html, tcode) {
  const $ = cheerio.load(html);

  // Tentar extrair o nome do torneio do título da página
  let nomeFromPage = cleanText($("title").text())
    .replace(/scoring\.fpg\.pt/i, "")
    .replace(/^\s*[-|]\s*/, "")
    .trim();

  // ── Encontrar a tabela principal ──
  // O GridView do .NET costuma ter id contendo "GridView" ou classe "GridView"
  let $table = $("table[id*='GridView'], table[id*='grid'], table.GridView").first();
  if (!$table.length) {
    // Fallback: a maior tabela com thead
    $table = $("table:has(thead)").last();
  }
  if (!$table.length) {
    // Último recurso: primeira tabela com mais de 3 colunas no cabeçalho
    $("table").each((_, t) => {
      const cols = $(t).find("tr").first().find("th, td").length;
      if (cols >= 3) { $table = $(t); return false; }
    });
  }

  if (!$table.length) {
    console.warn(`  ⚠️  Tabela não encontrada para tcode=${tcode}`);
    return { nomeFromPage, jogadores: [], colunas: [] };
  }

  // ── Cabeçalhos ──
  const headers = [];
  $table.find("tr").first().find("th, td").each((_, el) => {
    headers.push(cleanText($(el).text()).toLowerCase());
  });

  // Índices das colunas que nos interessam
  const idxNome = headers.findIndex(h =>
    h.includes("nome") || h === "jogador" || h === "name");
  const idxFed  = headers.findIndex(h =>
    h.includes("fed") || h.includes("licença") || h.includes("num") || h === "nº");
  const idxHcp  = headers.findIndex(h =>
    h.includes("hcp") || h.includes("handicap") || h.includes("índice") || h.includes("indice"));
  const idxClub = headers.findIndex(h =>
    h.includes("clube") || h.includes("club") || h.includes("associação"));

  console.log(`  📋  Colunas: [${headers.join(" | ")}]`);
  console.log(`  🔍  idx → nome:${idxNome} fed:${idxFed} hcp:${idxHcp} clube:${idxClub}`);

  // ── Linhas de dados ──
  const jogadores = [];
  const rows = $table.find("tr").toArray().slice(1); // skip header row

  for (const row of rows) {
    const cells = $(row).find("td").toArray().map(td => cleanText($(td).text()));
    if (cells.length < 2) continue;

    // Tentar extrair nº federado:
    // 1. Coluna dedicada, se existir
    // 2. Procurar em todas as células
    let fed = null;
    if (idxFed >= 0 && cells[idxFed]) {
      fed = extractFed(cells[idxFed]);
    }
    if (!fed) {
      for (const c of cells) {
        fed = extractFed(c);
        if (fed) break;
      }
    }

    const nome  = idxNome >= 0  ? cells[idxNome]  : cells.find(c => c.length > 5 && /[a-záéíóú]/i.test(c)) || "";
    const clube = idxClub >= 0  ? cells[idxClub]  : "";
    const hcp   = idxHcp >= 0   ? normalizeHcp(cells[idxHcp]) : null;

    if (!nome && !fed) continue; // linha vazia

    jogadores.push({
      fed:   fed   || null,
      nome:  nome  || "",
      clube: clube || "",
      hcp:   hcp,
    });
  }

  return { nomeFromPage, jogadores, colunas: headers };
}

// ── Função principal ───────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log(" scrape-inscricoes-nacionais.js");
  console.log(`  Torneios: ${tcodesToFetch.join(", ")}`);
  if (isDry) console.log("  [DRY RUN – não grava ficheiro]");
  console.log("═══════════════════════════════════════════════════\n");

  // Ler ficheiro existente para preservar dados de torneios não atualizados
  let existing = { lastUpdated: null, torneios: [] };
  if (fs.existsSync(OUT_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
    } catch { /* ignora */ }
  }

  const existingMap = new Map(
    (existing.torneios || []).map(t => [t.tcode, t])
  );

  const resultados = [];

  for (const tcode of tcodesToFetch) {
    const meta = TORNEIOS_CONHECIDOS[tcode] || { nome: `tcode=${tcode}`, escalao: "?", sex: "?" };
    console.log(`\n🏆  ${meta.nome} (tcode ${tcode})`);

    if (isDry) {
      console.log(`  [dry] URL: ${BASE_URL}?ccode=000&tcode=${tcode}`);
      resultados.push({
        tcode,
        ...meta,
        totalInscritos: 0,
        jogadores: [],
        lastFetched: null,
      });
      continue;
    }

    const html = await fetchPage(tcode);

    if (!html) {
      // Preservar dados anteriores se existirem
      if (existingMap.has(tcode)) {
        console.log(`  ♻️  A usar dados anteriores (${existingMap.get(tcode).totalInscritos} inscritos)`);
        resultados.push(existingMap.get(tcode));
      } else {
        resultados.push({
          tcode,
          ...meta,
          totalInscritos: 0,
          jogadores: [],
          lastFetched: null,
          erro: "Página indisponível",
        });
      }
      await sleep(DELAY_MS);
      continue;
    }

    const { nomeFromPage, jogadores } = parsePage(html, tcode);

    // Refinar nome: usar o da página se for mais descritivo
    const nomeUsado = (nomeFromPage && nomeFromPage.length > 10 && !nomeFromPage.startsWith("scoring"))
      ? nomeFromPage
      : meta.nome;

    console.log(`  ✅  ${jogadores.length} inscritos`);
    if (jogadores.length > 0) {
      const semFed = jogadores.filter(j => !j.fed).length;
      if (semFed > 0) console.log(`  ⚠️  ${semFed} jogadores sem Nº federado detectado`);
    }

    resultados.push({
      tcode,
      nome:           nomeUsado,
      escalao:        meta.escalao,
      sex:            meta.sex,
      totalInscritos: jogadores.length,
      jogadores,
      lastFetched:    new Date().toISOString(),
    });

    await sleep(DELAY_MS);
  }

  if (isDry) {
    console.log("\n[Dry run – sem gravação]");
    return;
  }

  // Merge: torneios não atualizados mantêm os dados anteriores
  const mergedMap = new Map(existingMap);
  for (const r of resultados) mergedMap.set(r.tcode, r);

  const output = {
    lastUpdated: new Date().toISOString(),
    torneios: [...mergedMap.values()].sort((a, b) =>
      Number(b.tcode) - Number(a.tcode)
    ),
  };

  // Garantir que o directório de output existe
  const outDir = path.dirname(OUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), "utf8");

  // Sumário
  console.log("\n═══════════════════════════════════════════════════");
  console.log(` ✅  Gravado: ${OUT_FILE}`);
  console.log(` 🕐  ${output.lastUpdated}`);
  console.log(" Sumário:");
  for (const t of output.torneios) {
    if (t.lastFetched) {
      console.log(`  ${t.tcode}  ${t.escalao.padEnd(7)} ${t.sex}  → ${String(t.totalInscritos).padStart(3)} inscritos   ${t.nome}`);
    }
  }
  console.log("═══════════════════════════════════════════════════");
}

main().catch(err => {
  console.error("❌  Erro fatal:", err);
  process.exit(1);
});
