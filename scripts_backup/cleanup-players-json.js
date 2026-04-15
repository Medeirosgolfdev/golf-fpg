#!/usr/bin/env node
/**
 * cleanup-players-json.js — Limpa players.json segundo as regras:
 *
 *  KEEP:
 *   - Jovens (escalao começa por "Sub-") sem tag "hidden"
 *   - Não-jovens com tag "PJA"
 *   - Não-jovens sem tags negativas (priority por default)
 *
 *  REMOVE:
 *   - QUALQUER jogador com tag "hidden" (já está escondido na UI)
 *   - Não-jovens com tag "no-priority"
 *
 *  ADD:
 *   - Manuel Abreu Lima Goulartt Medeiros (fed 49) — buscar em federados.json
 *
 * Uso:
 *   node scripts/cleanup-players-json.js              # DRY RUN (mostra mas não escreve)
 *   node scripts/cleanup-players-json.js --apply      # aplica e escreve
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const PLAYERS_JSON = path.join(REPO_ROOT, "players.json");
const FEDERADOS_JSON = path.join(REPO_ROOT, "public", "data", "federados.json");
const INSCRITOS_NAC = path.join(REPO_ROOT, "public", "data", "inscricoes_nacionais.json");
const APPLY = process.argv.includes("--apply");

// Carregar fed codes inscritos no Campeonato Nacional (estes são SEMPRE keep
// e nunca marcados como no-scrape — competem este ano, importam para o tracking)
function loadInscritosNacionais() {
  if (!fs.existsSync(INSCRITOS_NAC)) return new Set();
  try {
    const txt = fs.readFileSync(INSCRITOS_NAC, "utf8");
    // Ficheiro pode estar truncado/inválido — usar regex em vez de JSON.parse
    const matches = [...txt.matchAll(/"fed":\s*"(\d+)"/g)];
    return new Set(matches.map(m => m[1]));
  } catch (e) {
    console.log(`AVISO: erro a ler inscricoes_nacionais.json: ${e.message}`);
    return new Set();
  }
}
const INSCRITOS_FEDS = loadInscritosNacionais();

// Cores ANSI só se output é terminal (não para ficheiro/pipe)
const useColor = process.stdout.isTTY;
const G = useColor ? "\x1b[32m" : "", R = useColor ? "\x1b[31m" : "",
      Y = useColor ? "\x1b[33m" : "", C = useColor ? "\x1b[36m" : "",
      X = useColor ? "\x1b[0m"  : "";

const players = JSON.parse(fs.readFileSync(PLAYERS_JSON, "utf8"));
const beforeCount = Object.keys(players).length;

const kept = {};
const removed = [];

function isJovem(p) {
  return (p.escalao || "").startsWith("Sub-");
}

function shouldKeep(p, fed) {
  const tags = p.tags || [];
  // PRIORIDADE MÁXIMA: inscritos no Campeonato Nacional ficam sempre
  if (INSCRITOS_FEDS.has(String(fed))) return true;
  // Regra base: hidden = não está visível na UI, faz pouco sentido scrapar.
  if (tags.includes("hidden")) return false;
  // Jovens (sem hidden): SEMPRE keep, mesmo no-priority
  if (isJovem(p)) return true;
  // Não-jovens:
  if (tags.includes("no-priority")) return false;
  if (tags.includes("PJA")) return true;
  return true;  // não-jovem sem tag negativa = priority por default
}

// Marcar com "no-scrape" — mantém em players.json e na UI, mas o scraper salta
function shouldMarkNoScrape(p, fed) {
  // PRIORIDADE MÁXIMA: inscritos no Campeonato Nacional NUNCA são no-scrape
  if (INSCRITOS_FEDS.has(String(fed))) return false;
  const tags = p.tags || [];
  if (tags.includes("no-scrape")) return false;  // já marcado
  // Sub-16 / Sub-18 com hcp > 15 — não interessam para tracking automático
  if ((p.escalao === "Sub-16" || p.escalao === "Sub-18") && p.hcp != null && p.hcp > 15) {
    return true;
  }
  return false;
}

for (const [fed, p] of Object.entries(players)) {
  if (shouldKeep(p, fed)) {
    // Se está inscrito no nacional e tinha no-scrape, remover essa tag
    if (INSCRITOS_FEDS.has(String(fed))) {
      const tags = (p.tags || []).filter(t => t !== "no-scrape");
      if (tags.length !== (p.tags || []).length) {
        p.tags = tags;
      }
    }
    kept[fed] = p;
  } else {
    removed.push({ fed, name: p.name, escalao: p.escalao, tags: p.tags || [] });
  }
}

// Adicionar Manuel Medeiros (marido) — fed 54907 — buscar em federados.json
const FED_MARIDO = "54907";
let manuelAbreuAdded = false;
if (!kept[FED_MARIDO]) {
  if (fs.existsSync(FEDERADOS_JSON)) {
    const feds = JSON.parse(fs.readFileSync(FEDERADOS_JSON, "utf8"));
    const list = feds.players || feds;
    const found = Array.isArray(list)
      ? list.find(f => String(f.federation_code) === FED_MARIDO)
      : list[FED_MARIDO];
    if (found) {
      kept[FED_MARIDO] = {
        name: found.name || "Manuel Medeiros",
        nfed: FED_MARIDO,
        dob: found.birthdate || "",
        sex: found.gender || "M",
        hcp: found.hcp_exact != null ? Number(found.hcp_exact) : null,
        escalao: found.age_level || "MidAmateur",
        club: {
          code: found.club_code || "",
          short: found.acronym || "",
          long: found.club_name || "",
        },
        region: "Madeira",
        tags: ["PJA"],
        altNames: [],
        extra: {},
        lastRound: null,
      };
      manuelAbreuAdded = true;
    } else {
      console.log(`${Y}AVISO: Fed ${FED_MARIDO} nao encontrado em federados.json${X}`);
    }
  }
} else {
  console.log(`${C}INFO: Fed ${FED_MARIDO} ja estava em players.json - manter${X}`);
}

// Adicionar inscritos no Campeonato Nacional que ainda não estão em players.json
let addedFromInscritos = 0;
const inscritosNotInPlayers = [];
if (INSCRITOS_FEDS.size > 0 && fs.existsSync(FEDERADOS_JSON)) {
  const feds = JSON.parse(fs.readFileSync(FEDERADOS_JSON, "utf8"));
  const list = feds.players || feds;
  const fedById = Array.isArray(list)
    ? new Map(list.map(f => [String(f.federation_code), f]))
    : new Map(Object.entries(list));
  for (const fedCode of INSCRITOS_FEDS) {
    if (kept[fedCode]) continue;  // já lá está
    const found = fedById.get(fedCode);
    if (!found) {
      inscritosNotInPlayers.push(fedCode);
      continue;
    }
    kept[fedCode] = {
      name: found.name || "?",
      nfed: fedCode,
      dob: found.birthdate || "",
      sex: found.gender || "M",
      hcp: found.hcp_exact != null ? Number(found.hcp_exact) : null,
      escalao: found.age_level || "Absoluto",
      club: {
        code: found.club_code || "",
        short: found.acronym || "",
        long: found.club_name || "",
      },
      region: "",
      tags: ["inscrito-nacional"],
      altNames: [],
      extra: {},
      lastRound: null,
    };
    addedFromInscritos++;
  }
}

// Marcar no-scrape (não remove; só adiciona tag aos kept)
const markedNoScrape = [];
for (const [fed, p] of Object.entries(kept)) {
  if (shouldMarkNoScrape(p, fed)) {
    p.tags = [...(p.tags || []), "no-scrape"];
    markedNoScrape.push({ fed, name: p.name, escalao: p.escalao, hcp: p.hcp });
  }
}

const afterCount = Object.keys(kept).length;

// Resumo por categoria removida
const removedByCategory = {};
for (const r of removed) {
  const isJ = (r.escalao || "").startsWith("Sub-");
  const tag = r.tags.includes("hidden") ? "hidden" : r.tags.includes("no-priority") ? "no-priority" : "outro";
  const cat = `${isJ ? "JOVEM" : "NÃO-JOVEM"} / ${tag}`;
  removedByCategory[cat] = (removedByCategory[cat] || 0) + 1;
}

console.log(`${C}=== RESUMO ===${X}`);
console.log(`Antes:  ${beforeCount} jogadores`);
console.log(`Depois: ${G}${afterCount}${X} jogadores`);
console.log(`Removidos: ${R}${removed.length}${X}`);
console.log(`Adicionados: ${(manuelAbreuAdded ? 1 : 0) + addedFromInscritos}`);
if (manuelAbreuAdded) console.log(`  - Manuel Medeiros (fed 54907)`);
if (addedFromInscritos > 0) console.log(`  - ${addedFromInscritos} inscritos no Campeonato Nacional`);
if (inscritosNotInPlayers.length > 0) console.log(`  ${Y}AVISO: ${inscritosNotInPlayers.length} inscritos sem cadastro em federados.json: ${inscritosNotInPlayers.join(", ")}${X}`);
console.log(`Inscritos no Nacional que já estavam em players.json: ${INSCRITOS_FEDS.size - addedFromInscritos - inscritosNotInPlayers.length} (de ${INSCRITOS_FEDS.size} total)`);
console.log(`Marcados no-scrape (Sub-16/18 hcp>15, exclui inscritos): ${Y}${markedNoScrape.length}${X} (ficam na UI mas scraper salta)`);
console.log("");
console.log("Removidos por categoria:");
for (const [cat, n] of Object.entries(removedByCategory).sort()) {
  console.log(`  ${cat}: ${n}`);
}
console.log("");
// Listar TODOS os removidos, agrupados por categoria
console.log("Todos os removidos:");
const sortedRemoved = [...removed].sort((a, b) => {
  const aJ = (a.escalao || "").startsWith("Sub-") ? 0 : 1;
  const bJ = (b.escalao || "").startsWith("Sub-") ? 0 : 1;
  if (aJ !== bJ) return aJ - bJ;
  return (a.escalao || "").localeCompare(b.escalao || "") || a.name.localeCompare(b.name);
});
let lastCat = "";
for (const r of sortedRemoved) {
  const isJ = (r.escalao || "").startsWith("Sub-");
  const tag = r.tags.includes("hidden") ? "hidden" : r.tags.includes("no-priority") ? "no-priority" : "outro";
  const cat = `${isJ ? "JOVEM" : "NÃO-JOVEM"} / ${tag}`;
  if (cat !== lastCat) {
    console.log("");
    console.log(`  ${C}--- ${cat} ---${X}`);
    lastCat = cat;
  }
  console.log(`  ${r.fed.padStart(6)} ${(r.escalao || "").padEnd(12)} ${r.name}`);
}

// ─────────────────────────────────────────────────────────────────
// LISTAR TODOS OS JOGADORES QUE FICAM (para revisão manual)
// Ordenados por escalão e nome. O user pode marcar mais para ignorar
// adicionando a tag "no-scrape" (o scraper salta-os automaticamente,
// mas continuam visíveis na UI dos "nossos jogadores").
// ─────────────────────────────────────────────────────────────────

// Listar marcados no-scrape (separadamente, para fácil revisão)
if (markedNoScrape.length > 0) {
  console.log("");
  console.log("");
  console.log(`${C}=== MARCADOS COM no-scrape (${markedNoScrape.length}) ===${X}`);
  console.log("Sub-16/18 com hcp > 15 — ficam visíveis na UI mas scraper salta");
  console.log("");
  markedNoScrape.sort((a, b) => (a.escalao || "").localeCompare(b.escalao || "") || (a.name || "").localeCompare(b.name || ""));
  for (const m of markedNoScrape) {
    console.log(`  ${m.fed.padStart(6)} ${(m.escalao || "").padEnd(8)} hcp=${String(m.hcp).padStart(5)}  ${m.name}`);
  }
}

console.log("");
console.log("");
console.log(`${C}=== TODOS OS ${Object.keys(kept).length} JOGADORES QUE VÃO FICAR ===${X}`);
console.log("Para parar de actualizar algum SEM o apagar, adiciona a tag");
console.log("\"no-scrape\" no players.json (campo tags). O scraper salta-o.");
console.log("");

const ESC_ORDER = ["Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18", "Sub-21",
                   "Sub-24", "Absoluto", "MidAmateur", "Sénior", "SuperSenior", "Outros"];
const escIdx = e => { const i = ESC_ORDER.indexOf(e); return i < 0 ? 999 : i; };

const sortedKept = Object.entries(kept).sort(([, a], [, b]) => {
  const ea = escIdx(a.escalao || ""), eb = escIdx(b.escalao || "");
  if (ea !== eb) return ea - eb;
  return (a.name || "").localeCompare(b.name || "", "pt");
});

let lastEsc = "";
for (const [fed, p] of sortedKept) {
  const esc = p.escalao || "Outros";
  if (esc !== lastEsc) {
    const cnt = sortedKept.filter(([, x]) => (x.escalao || "Outros") === esc).length;
    console.log("");
    console.log(`  ${C}--- ${esc} (${cnt}) ---${X}`);
    lastEsc = esc;
  }
  const tags = (p.tags || []).join(",");
  const club = (p.club && (p.club.short || p.club.long)) || "?";
  const hcp = p.hcp != null ? String(p.hcp).padStart(5) : "  -  ";
  const sex = p.sex || "?";
  const tagDisplay = tags ? ` [${tags}]` : "";
  console.log(`  ${fed.padStart(6)} ${sex} hcp=${hcp}  ${(p.name || "").padEnd(40).slice(0, 40)} ${club}${tagDisplay}`);
}

if (!APPLY) {
  console.log("");
  console.log(`${Y}=== DRY RUN ===${X}`);
  console.log("Para aplicar, correr: node scripts/cleanup-players-json.js --apply");
  process.exit(0);
}

// Backup + escrever
const backup = PLAYERS_JSON + ".backup-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
fs.copyFileSync(PLAYERS_JSON, backup);
console.log(`${G}✓ Backup criado: ${path.relative(REPO_ROOT, backup)}${X}`);

fs.writeFileSync(PLAYERS_JSON, JSON.stringify(kept, null, 2));
console.log(`${G}✓ players.json actualizado — ${afterCount} jogadores${X}`);
