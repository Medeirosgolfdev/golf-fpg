#!/usr/bin/env node
/**
 * prune-vercel-deployments.js
 * ═══════════════════════════════════════════════════════════════════════
 * Apaga deployments ANTIGOS do Vercel para libertar Deployment Storage.
 *
 * PORQUÊ: o plano gratuito inclui 10 GB de Deployment Storage e conta TODOS
 * os deployments retidos, não só o que está em produção. A 2026-09-06 cada
 * deployment pesava ~9,1 GB (ver "Deployment Storage do Vercel" no CLAUDE.md)
 * e a conta chegou aos 100%. As correcções desse dia puseram cada deployment
 * novo em ~1,1 GB, mas **não encolhem os antigos** — só apagá-los liberta.
 * E como os workflows de dados fazem ~11 commits/dia, isto tem de ser
 * recorrente, não uma limpeza única.
 *
 * SEGURANÇAS (por esta ordem, um deployment é POUPADO se):
 *   1. É o que está a servir produção (`targets.production.id` do projecto).
 *   2. Está a construir ou em fila (BUILDING/QUEUED/INITIALIZING).
 *   3. Está entre os `--keep N` mais recentes do projecto (default 5) — deixa
 *      margem de rollback.
 *   4. É mais recente do que `--min-age-days` (default 1).
 *
 * USO:
 *   node scripts/prune-vercel-deployments.js                      # dry-run
 *   node scripts/prune-vercel-deployments.js --apply
 *   node scripts/prune-vercel-deployments.js --project golf-fpg --keep 10
 *   node scripts/prune-vercel-deployments.js --apply --min-age-days 0
 *
 * Precisa de VERCEL_TOKEN (token de conta, vercel.com/account/tokens).
 * ═══════════════════════════════════════════════════════════════════════
 */
"use strict";

const TOKEN   = process.env.VERCEL_TOKEN || "";
const TEAM_ID = process.env.VERCEL_TEAM_ID || "team_uiEIyOXbh4OhlNWQpjnVrVID";
const API     = "https://api.vercel.com";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const arg = (nome, def) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const KEEP     = Number(arg("--keep", "5"));
const MIN_AGE  = Number(arg("--min-age-days", "1"));
const SO_ESTE  = arg("--project", null);          // nome ou id; omitido = todos

const ESTADOS_EM_CURSO = new Set(["BUILDING", "QUEUED", "INITIALIZING"]);
const mb = (b) => (b / 1048576).toFixed(0);

async function api(caminho, opts = {}) {
  const url = new URL(caminho, API);
  if (TEAM_ID) url.searchParams.set("teamId", TEAM_ID);
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const texto = await r.text();
  let corpo = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status} em ${caminho}: ${(corpo && corpo.error && corpo.error.message) || texto.slice(0, 200)}`);
    e.status = r.status;
    throw e;
  }
  return corpo;
}

/**
 * Decide, para UM projecto, o que se guarda e o que se apaga.
 * Pura de propósito: é a parte perigosa e é a que os testes cobrem
 * (`prune-vercel-deployments.test.js`), já que chamar a API a sério num teste
 * apagaria deployments a sério.
 */
function escolher(deployments, { producaoId, keep, minAgeDays, agora }) {
  const ordenados = [...deployments].sort((a, b) => (b.created || 0) - (a.created || 0));
  const guardar = [], apagar = [];
  ordenados.forEach((d, i) => {
    const idadeDias = (agora - (d.created || 0)) / 86400000;
    let motivo = null;
    if (producaoId && (d.uid === producaoId || d.id === producaoId)) motivo = "produção actual";
    else if (ESTADOS_EM_CURSO.has(d.state)) motivo = `em curso (${d.state})`;
    else if (i < keep) motivo = `entre os ${keep} mais recentes`;
    else if (idadeDias < minAgeDays) motivo = `tem menos de ${minAgeDays}d`;
    if (motivo) guardar.push({ d, motivo }); else apagar.push(d);
  });
  return { guardar, apagar };
}

/** Todos os deployments de um projecto (paginado). */
async function todosDeployments(projectId) {
  const out = [];
  let until = null;
  for (let pagina = 0; pagina < 100; pagina++) {
    const q = `/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=100${until ? `&until=${until}` : ""}`;
    const d = await api(q);
    const lote = d.deployments || [];
    out.push(...lote);
    const prox = d.pagination && d.pagination.next;
    if (!prox || !lote.length) break;
    until = prox;
  }
  return out;
}

module.exports = { escolher };

/* Só corre quando invocado directamente (o teste importa `escolher`). */
if (require.main !== module) return;

(async () => {
  if (!TOKEN) {
    console.error("ERRO: falta VERCEL_TOKEN (criar em vercel.com/account/tokens).");
    process.exit(1);
  }

  const projectos = (await api("/v9/projects?limit=100")).projects || [];
  const alvos = SO_ESTE
    ? projectos.filter((p) => p.name === SO_ESTE || p.id === SO_ESTE)
    : projectos;
  if (!alvos.length) { console.error(`Nenhum projecto corresponde a "${SO_ESTE}".`); process.exit(1); }

  const agora = Date.now();
  let totalApagar = 0, totalGuardar = 0, apagados = 0, falhados = 0;

  for (const p of alvos) {
    const deps = await todosDeployments(p.id);
    /* O deployment que está EM produção agora — nunca se toca. */
    const producaoId = p.targets && p.targets.production && p.targets.production.id;

    const { guardar, apagar } = escolher(deps, { producaoId, keep: KEEP, minAgeDays: MIN_AGE, agora });

    console.log(`\n▸ ${p.name}: ${deps.length} deployments · guardar ${guardar.length} · apagar ${apagar.length}`);
    for (const { d, motivo } of guardar.slice(0, 3)) {
      console.log(`    guardado  ${new Date(d.created).toISOString().slice(0, 16)}  ${d.uid || d.id}  (${motivo})`);
    }
    if (guardar.length > 3) console.log(`    … e mais ${guardar.length - 3} guardados`);

    totalGuardar += guardar.length;
    totalApagar  += apagar.length;

    for (const d of apagar) {
      const id = d.uid || d.id;
      const quando = new Date(d.created).toISOString().slice(0, 16);
      if (!APPLY) { console.log(`    [dry-run] apagaria ${quando}  ${id}`); continue; }
      try {
        await api(`/v13/deployments/${id}`, { method: "DELETE" });
        apagados++;
        if (apagados % 25 === 0) console.log(`    … ${apagados} apagados`);
      } catch (e) {
        falhados++;
        console.error(`    ⚠ falhou ${id}: ${e.message}`);
        if (e.status === 403) { console.error("      (token sem permissão — criar um novo com acesso à equipa)"); }
      }
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Guardar: ${totalGuardar} · Apagar: ${totalApagar}`);
  if (!APPLY) {
    console.log("\n🔍 DRY-RUN — nada foi apagado. Correr com --apply.");
    process.exit(totalApagar > 0 ? 0 : 2);
  }
  console.log(`✅ ${apagados} apagados${falhados ? ` · ⚠ ${falhados} falharam` : ""}`);
  process.exit(falhados && !apagados ? 1 : 0);
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
