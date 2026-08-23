/**
 * scripts/build-run-digest.js
 *
 * Constrói o resumo das novidades ("novo torneio X, escalão Y, vencedor Z" +
 * "o federado K tem N scorecards novos") para o email de resumo.
 *
 * Dois modos:
 *
 *   1. HISTÓRICO (--since / --base) — usado pelo `daily-digest.yml`: compara o
 *      repo de há N horas com o actual e resume tudo o que os workflows
 *      commitaram nesse intervalo. É o modo principal, e de propósito NÃO
 *      obriga a tocar nos ~20 workflows de dados: o histórico do git já tem
 *      tudo, e se um workflow falhar a meio a janela seguinte apanha na mesma.
 *
 *   2. ÁRVORE DE TRABALHO (default) — usado pelo `update-data.yml` ANTES do
 *      commit, para o aviso imediato dos nossos federados. Lê o que mudou face
 *      ao HEAD (`git status --porcelain`), que é exactamente o que o run
 *      produziu. Depois do commit isso perder-se-ia: o `git pull --rebase` do
 *      push traz commits de outros workflows e o diff deixaria de ser só nosso.
 *
 * USO:
 *   node scripts/build-run-digest.js --since "24 hours ago" --source diario
 *   node scripts/build-run-digest.js --base <sha> --print
 *   node scripts/build-run-digest.js --source fpg --only-players --out /tmp/d.json
 *
 * Exit codes: 0 = sempre (nunca falhar um workflow por causa do resumo).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const X = require("./lib/digest-extract.js");

const REPO = path.resolve(__dirname, "..");
const PENDING_DIR = path.join(REPO, "reports", "digests", "pending");

/* ── CLI ────────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const argVal = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const argFlag = (f) => args.indexOf(f) >= 0;

const SOURCE = argVal("--source", "desconhecido");
const OUT = argVal("--out", null);
const PRINT_ONLY = argFlag("--print");
const MAX_PER_SOURCE = parseInt(argVal("--max", "40"), 10);
const SINCE = argVal("--since", null);
const BASE_ARG = argVal("--base", null);
const ONLY_PLAYERS = argFlag("--only-players");
const ONLY_TOURNAMENTS = argFlag("--only-tournaments");
const INCLUDE_ALL = argFlag("--all"); // inclui provas de adultos/sociais

/* ── git ────────────────────────────────────────────────────────────────── */

function git(...a) {
  return execFileSync("git", a, { cwd: REPO, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
}

/** Commit imediatamente anterior à janela (--since "24 hours ago"). */
function resolveBase() {
  if (BASE_ARG) return BASE_ARG.trim();
  if (!SINCE) return null;
  // `rev-list -1 --before` dá o último commit ANTES do instante pedido — a
  // base correcta da janela. Sem commits nesse período, cai no primeiro commit
  // do repo (janela = tudo), o que só acontece num repo acabado de criar.
  let sha = "";
  try { sha = git("rev-list", "-1", `--before=${SINCE}`, "HEAD").trim(); } catch { /* segue */ }
  if (!sha) {
    try { sha = git("rev-list", "--max-parents=0", "-1", "HEAD").trim(); } catch { return null; }
  }
  return sha || null;
}

const BASE = resolveBase();

/** Ficheiros criados/alterados: entre BASE e HEAD, ou na árvore de trabalho. */
function changedFiles() {
  if (BASE) {
    let out;
    try { out = git("diff", "--name-status", "-M", BASE, "HEAD"); } catch { return []; }
    const rows = [];
    for (const line of out.split("\n")) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      const code = parts[0];
      if (code.startsWith("D")) continue;
      const p = parts[parts.length - 1].trim();
      rows.push({ path: p, isNew: code.startsWith("A") });
    }
    return rows;
  }

  let out;
  try { out = git("status", "--porcelain", "-uall"); } catch { return []; }
  const rows = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    let p = line.slice(3).trim();
    if (code.includes("D")) continue;            // apagados não interessam
    if (p.includes(" -> ")) p = p.split(" -> ")[1]; // rename
    p = p.replace(/^"|"$/g, "");
    rows.push({ path: p, isNew: code.includes("?") || code.includes("A") });
  }
  return rows;
}

function showJson(rev, relPath) {
  try { return JSON.parse(git("show", `${rev}:${relPath}`)); } catch { return null; }
}

/** Versão NOVA do ficheiro (HEAD no modo histórico, disco no modo working). */
function readNew(relPath) {
  if (BASE) return showJson("HEAD", relPath);
  try { return JSON.parse(fs.readFileSync(path.join(REPO, relPath), "utf8")); } catch { return null; }
}

/** Versão ANTERIOR do ficheiro (null se é novo). */
function readOld(relPath, isNew) {
  if (isNew) return null;
  return showJson(BASE || "HEAD", relPath);
}

/* ── Nomes dos nossos federados ─────────────────────────────────────────── */

let _names = null;
function playerName(fed) {
  if (_names === null) {
    _names = new Map();
    // ⚠ Os dois ficheiros têm formas diferentes: o players.json é um MAPA
    // {nfed: {...}} e o federados.json é {players: [...]} com `federation_code`.
    for (const f of ["public/data/players.json", "public/data/federados.json"]) {
      let d;
      try { d = JSON.parse(fs.readFileSync(path.join(REPO, f), "utf8")); } catch { continue; }
      let entries;
      if (Array.isArray(d)) entries = d.map((p) => [null, p]);
      else if (Array.isArray(d.players)) entries = d.players.map((p) => [null, p]);
      else entries = Object.entries(d).filter(([, v]) => v && typeof v === "object");

      for (const [key, p] of entries) {
        const code = String(
          p.nfed ?? p.fed ?? p.fedCode ?? p.federation_code ?? p.federated_code ?? p.code ?? key ?? "",
        ).trim();
        const nome = p.name || p.nome || p.player_name || p.full_name;
        if (code && nome && !_names.has(code)) _names.set(code, X.displayName(String(nome).trim()));
      }
    }
  }
  return _names.get(String(fed)) || `Federado ${fed}`;
}

/* ── Recolha ────────────────────────────────────────────────────────────── */

function collect() {
  const tournaments = [];
  const players = [];
  const federados = { entrou: [], saiu: [] };
  const derived = [];
  let filesSeen = 0;
  let filesSkipped = 0;

  for (const { path: rel, isNew } of changedFiles()) {
    if (!rel.endsWith(".json")) continue;
    if (rel.startsWith("reports/")) continue;

    // ── Federados: output/{fed}/whs.json ──
    const mFed = /^output\/(\d+)\/whs\.json$/.exec(rel);
    if (mFed) {
      if (ONLY_TOURNAMENTS) continue;
      const novo = readNew(rel);
      if (!Array.isArray(novo)) continue;
      const rondas = X.diffWhs(readOld(rel, isNew), novo);
      if (rondas.length) {
        const fed = mFed[1];
        players.push({ fed, name: playerName(fed), nNew: rondas.length, rounds: rondas.slice(0, 8) });
      }
      filesSeen++;
      continue;
    }

    // ── Cadastro: quem entrou/saiu da lista de federados activos ──
    // Tratado ANTES do filtro de fontes conhecidas — o federados.json não é um
    // ficheiro de resultados, é o cadastro da FPG.
    if (rel === "public/data/federados.json") {
      if (ONLY_TOURNAMENTS) continue;
      const novo = readNew(rel);
      const antigo = readOld(rel, isNew);
      if (novo && antigo) {
        const d = X.diffFederados(antigo, novo);
        federados.entrou.push(...d.entrou);
        federados.saiu.push(...d.saiu);
      }
      filesSeen++;
      continue;
    }

    if (ONLY_PLAYERS) continue;
    if (!rel.startsWith("public/data/")) continue;

    // Só ficheiros de uma fonte CONHECIDA. Os agregados/derivados
    // (recent-tournaments, juniors-tournaments, *-rivals, *-slim, catálogos)
    // republicam provas que a fonte primária já trouxe — sem este filtro cada
    // torneio aparecia 2-3× no email, com rótulos diferentes.
    if (X.sourceInfo(rel).source === "Outros") { derived.push(rel); continue; }

    const novo = readNew(rel);
    if (!novo) { filesSkipped++; continue; }
    const antigo = readOld(rel, isNew);
    let rows = [];
    try { rows = X.diffTournaments(antigo, novo, rel); } catch { filesSkipped++; continue; }
    if (rows.length) tournaments.push(...rows);
    filesSeen++;
  }

  // Dedup entre ficheiros: a mesma prova chega por mais do que um caminho
  // (ex: a mesma jornada publicada no microsite RFEG e no LiveGolfScoring).
  const seen = new Set();
  let deduped = tournaments.filter((t) => {
    const k = `${t.tournament}|${t.category || ""}|${t.winner}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Só golfe de jovens, salvo --all: as mesmas fontes trazem agarradas as
  // competições sociais de clube (adultos), que não interessam ao site.
  let dropped = 0;
  if (!INCLUDE_ALL) {
    const before = deduped.length;
    deduped = deduped.filter((t) => X.isJuniorish(t.tournament, t.category, t.round));
    dropped = before - deduped.length;
  }

  // Mais recentes primeiro; sem data vão para o fim
  deduped.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  players.sort((a, b) => b.nNew - a.nNew);

  return {
    tournaments: deduped,
    players,
    federados,
    filesSeen,
    filesSkipped,
    derivedSkipped: derived.length,
    adultosSkipped: dropped,
  };
}

/* ── Render ─────────────────────────────────────────────────────────────── */

/** Uma linha por torneio, no formato pedido pela Mariana. */
function lineFor(t) {
  const onde = t.country ? ` em ${t.country}` : "";
  const esc = t.category ? `, escalão ${t.category}` : "";
  const quando = t.date ? ` _(${t.date})_` : (t.year ? ` _(${t.year})_` : "");
  const ronda = t.round ? ` — ${t.round}` : "";
  return `- **Novo torneio ${t.tournament}**${ronda}${onde}${esc}, vencedor **${t.winner}**${quando}`;
}

/**
 * Um torneio com vários escalões dá uma entrada por escalão. Repetir o nome
 * em todas era ilegível (uma prova espanhola traz 6-12 categorias), por isso
 * a partir de 2 escalões colapsa-se num cabeçalho + um vencedor por linha.
 */
function blockFor(rows) {
  if (rows.length === 1) return [lineFor(rows[0])];
  const t = rows[0];
  const onde = t.country ? ` em ${t.country}` : "";
  const quando = t.date ? ` _(${t.date})_` : (t.year ? ` _(${t.year})_` : "");
  const ronda = t.round ? ` — ${t.round}` : "";
  const out = [`- **Novo torneio ${t.tournament}**${ronda}${onde}${quando} — ${rows.length} escalões:`];
  for (const r of rows) {
    out.push(r.category ? `  - escalão ${r.category}, vencedor **${r.winner}**` : `  - vencedor **${r.winner}**`);
  }
  return out;
}

/** Agrupa as entradas por prova preservando a ordem de chegada. */
function groupByTournament(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.tournament}|${r.round || ""}|${r.date || r.year || ""}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups.values()];
}

function renderMarkdown(digest) {
  const out = [];
  const { tournaments, players } = digest;
  const federados = digest.federados || { entrou: [], saiu: [] };

  if (tournaments.length) {
    // Agrupar por circuito para o email não ser uma parede de linhas soltas
    const bySource = new Map();
    for (const t of tournaments) {
      const k = `${t.flag} ${t.source}`;
      if (!bySource.has(k)) bySource.set(k, []);
      bySource.get(k).push(t);
    }
    out.push(`### 🏆 Torneios novos (${tournaments.length})`, "");
    for (const [src, rows] of bySource) {
      const groups = groupByTournament(rows);
      out.push(`**${src}** — ${groups.length} ${groups.length === 1 ? "prova" : "provas"}`, "");
      for (const g of groups.slice(0, MAX_PER_SOURCE)) out.push(...blockFor(g));
      if (groups.length > MAX_PER_SOURCE) out.push(`- _… e mais ${groups.length - MAX_PER_SOURCE} provas_`);
      out.push("");
    }
  }

  if (players.length) {
    const total = players.reduce((a, p) => a + p.nNew, 0);
    const nJog = `${players.length} ${players.length === 1 ? "jogador" : "jogadores"}`;
    const nSc = `${total} ${total === 1 ? "scorecard" : "scorecards"}`;
    out.push(`### ⛳ Os nossos federados (${nJog}, ${nSc})`, "");
    for (const p of players.slice(0, MAX_PER_SOURCE)) {
      const frase = X.describePlayerRounds(p.name, p.rounds);
      if (frase) out.push(`- ${frase}`);
    }
    if (players.length > MAX_PER_SOURCE) out.push(`- _… e mais ${players.length - MAX_PER_SOURCE} jogadores_`);
    out.push("");
  }

  if (federados.entrou.length || federados.saiu.length) {
    const nE = federados.entrou.length;
    const nS = federados.saiu.length;
    const cab = [];
    if (nE) cab.push(`${nE} ${nE === 1 ? "entrou" : "entraram"}`);
    if (nS) cab.push(`${nS} ${nS === 1 ? "saiu" : "saíram"}`);
    out.push(`### 🪪 Cadastro FPG (${cab.join(", ")})`, "");

    if (nE) {
      // Juniores um a um (é o que interessa); adultos só contados por escalão,
      // senão uma semana de Agosto despejava 97 linhas de MidAmateur/Senior.
      const juniores = federados.entrou.filter((e) => e.junior);
      const adultos = federados.entrou.filter((e) => !e.junior);
      if (juniores.length) {
        out.push(`**Novos juniores (${juniores.length})**`, "");
        for (const e of juniores.slice(0, MAX_PER_SOURCE)) out.push(`- ${X.describeFederado(e)}`);
        if (juniores.length > MAX_PER_SOURCE) out.push(`- _… e mais ${juniores.length - MAX_PER_SOURCE}_`);
        out.push("");
      }
      if (adultos.length) {
        const porEsc = new Map();
        for (const e of adultos) {
          const k = e.escalao || "(sem escalão)";
          porEsc.set(k, (porEsc.get(k) || 0) + 1);
        }
        const resumo = [...porEsc.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ");
        out.push(`_Mais ${adultos.length} adultos: ${resumo}._`, "");
      }
    }

    if (nS) {
      // Sempre todos: sair da lista de activos é raro e vale sempre a pena ver.
      out.push(`**Deixaram de ser federados (${nS})**`, "");
      for (const e of federados.saiu.slice(0, MAX_PER_SOURCE)) out.push(`- ${X.describeFederado(e, "saiu")}`);
      if (nS > MAX_PER_SOURCE) out.push(`- _… e mais ${nS - MAX_PER_SOURCE}_`);
      out.push("");
    }
  }

  return out.join("\n").trim();
}

/* ── Main ───────────────────────────────────────────────────────────────── */

function main() {
  const { tournaments, players, federados, filesSeen, filesSkipped, derivedSkipped, adultosSkipped } = collect();

  const digest = {
    source: SOURCE,
    window: BASE ? { base: BASE, since: SINCE || null } : null,
    workflow: process.env.GITHUB_WORKFLOW || null,
    runUrl: process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
      ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null,
    generatedAt: new Date().toISOString(),
    counts: {
      tournaments: tournaments.length,
      players: players.length,
      federadosEntrou: federados.entrou.length,
      federadosSaiu: federados.saiu.length,
      filesSeen,
      filesSkipped,
      derivedSkipped,
      adultosSkipped,
    },
    tournaments,
    players,
    federados,
  };
  digest.markdown = renderMarkdown(digest);

  if (!tournaments.length && !players.length && !federados.entrou.length && !federados.saiu.length) {
    console.log(`[digest] ${SOURCE}: sem novidades (${filesSeen} ficheiros analisados, ${derivedSkipped} derivados e ${adultosSkipped} provas de adultos ignorados).`);
    return;
  }

  console.log(`[digest] ${SOURCE}: ${tournaments.length} torneios, ${players.length} jogadores (${filesSeen} ficheiros; ${derivedSkipped} derivados e ${adultosSkipped} provas de adultos ignorados).`);
  if (PRINT_ONLY) { console.log("\n" + digest.markdown); return; }

  const stamp = digest.generatedAt.replace(/[:.]/g, "-");
  const outPath = OUT
    ? path.resolve(REPO, OUT)
    : path.join(PENDING_DIR, `${stamp}--${SOURCE}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(digest, null, 2) + "\n");
  console.log(`[digest] escrito ${path.relative(REPO, outPath)}`);
}

if (require.main === module) {
  // O resumo NUNCA pode partir um workflow de dados — os dados são o que importa.
  try { main(); } catch (e) { console.warn("[digest] falhou (ignorado):", e && e.message); }
}

module.exports = { renderMarkdown, lineFor };
