/**
 * scripts/send-digest-issue.js
 *
 * Envia o resumo das novidades por email, abrindo uma issue no repo — o GitHub
 * trata do email. Escolhido em vez de SMTP para não haver secrets nenhuns
 * (o GITHUB_TOKEN do workflow chega).
 *
 * A issue é fechada logo a seguir: a notificação (= o email) sai na criação,
 * por isso fechá-la não custa nada e mantém a lista de issues limpa. O corpo
 * menciona o dono do repo para garantir o email mesmo em contas cuja subscrição
 * está em "Participating and @mentions".
 *
 * Não escreve nem committa nada: recebe o ficheiro de resumo já construído
 * pelo `build-run-digest.js` e envia. Quem manda na janela temporal é quem
 * chama (o `daily-digest.yml` pede as últimas 24h).
 *
 * USO:
 *   node scripts/send-digest-issue.js --file reports/digests/pending/diario.json
 *   node scripts/send-digest-issue.js --file x.json --dry-run
 *   node scripts/send-digest-issue.js --title "⛳ Scorecards novos" --file x.json
 *
 * Exit: 0 = enviado ou nada para enviar (nunca falha o workflow por email).
 */

"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const PENDING = path.join(REPO, "reports", "digests", "pending");

const args = process.argv.slice(2);
const argVal = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const argFlag = (f) => args.indexOf(f) >= 0;

const SEP = " · ";
const DRY = argFlag("--dry-run");
const ONE_FILE = argVal("--file", null);
const TITLE_OVERRIDE = argVal("--title", null);

function loadPending() {
  if (ONE_FILE) {
    const p = path.resolve(REPO, ONE_FILE);
    return fs.existsSync(p) ? [{ file: p, digest: JSON.parse(fs.readFileSync(p, "utf8")) }] : [];
  }
  if (!fs.existsSync(PENDING)) return [];
  return fs.readdirSync(PENDING)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const p = path.join(PENDING, f);
      try { return { file: p, digest: JSON.parse(fs.readFileSync(p, "utf8")) }; } catch { return null; }
    })
    .filter(Boolean);
}

/* ── Corpo do email ─────────────────────────────────────────────────────── */

/**
 * Contagens de um resumo. O cadastro FPG (quem entrou/saiu da lista de
 * federados activos) conta como novidade: sem isto o resumo do
 * `update-federados.yml` — que nunca traz torneios nem scorecards — era
 * descartado em silêncio e nunca chegava email nenhum.
 */
function countsOf(digest) {
  const c = (digest && digest.counts) || {};
  return {
    t: c.tournaments || 0,
    p: c.players || 0,
    fe: c.federadosEntrou || 0,
    fs: c.federadosSaiu || 0,
  };
}

function totalsOf(items) {
  return items.reduce(
    (a, i) => {
      const c = countsOf(i.digest);
      return { t: a.t + c.t, p: a.p + c.p, fe: a.fe + c.fe, fs: a.fs + c.fs };
    },
    { t: 0, p: 0, fe: 0, fs: 0 },
  );
}

const hasNews = (digest) => {
  const c = countsOf(digest);
  return Boolean(c.t || c.p || c.fe || c.fs);
};

function buildBody(items) {
  const owner = (process.env.GITHUB_REPOSITORY || "").split("/")[0];
  const { t: totT, p: totP, fe: totFE, fs: totFS } = totalsOf(items);

  const out = [];
  // A menção garante o email mesmo com subscrição "Participating and @mentions".
  if (owner) out.push(`@${owner}`, "");
  const cab = [];
  if (totT) cab.push(`**${totT}** ${totT === 1 ? "torneio novo" : "torneios novos"}`);
  if (totP) cab.push(`**${totP}** ${totP === 1 ? "jogador nosso" : "jogadores nossos"} com scorecards novos`);
  if (totFE) cab.push(`**${totFE}** ${totFE === 1 ? "federado novo" : "federados novos"}`);
  if (totFS) cab.push(`**${totFS}** ${totFS === 1 ? "saída" : "saídas"} do cadastro`);
  out.push(
    cab.length ? cab.join(SEP) + "." : "Sem novidades.",
    "",
    "---",
    "",
  );

  for (const { digest } of items) {
    const quando = String(digest.generatedAt || "").slice(0, 16).replace("T", " ");
    const link = digest.runUrl ? ` · [run](${digest.runUrl})` : "";
    out.push(`## ${digest.workflow || digest.source} — ${quando} UTC${link}`, "");
    out.push(digest.markdown || "_(sem detalhe)_", "");
  }

  // Um resumo com `window` é o apanhado do dia; sem ela é o aviso imediato de
  // UM run concreto (update-data / update-federados), e falar em "últimas 24h"
  // seria mentira.
  const doDia = items.some((i) => i.digest && i.digest.window);
  out.push("---", "");
  if (doDia) {
    out.push(
      "_Resumo automático das últimas 24h. Os avisos imediatos de scorecards dos nossos federados_",
      "_aparecem aqui outra vez, de propósito — este email é o apanhado do dia._",
      "",
      "_Para deixar de receber: desliga o workflow `daily-digest.yml` em Actions._",
    );
  } else {
    out.push(
      "_Aviso imediato deste run — o resumo do dia (`daily-digest.yml`) repete-o de manhã._",
      "",
      "_Para deixar de receber: apaga o passo do resumo por email no workflow, em Actions._",
    );
  }
  return out.join("\n");
}

function buildTitle(items) {
  if (TITLE_OVERRIDE) return TITLE_OVERRIDE;
  const { t: totT, p: totP, fe: totFE, fs: totFS } = totalsOf(items);
  const dia = new Date().toISOString().slice(0, 10);
  const bits = [];
  if (totT) bits.push(`${totT} ${totT === 1 ? "torneio" : "torneios"}`);
  if (totP) bits.push(`${totP} ${totP === 1 ? "jogador" : "jogadores"}`);
  if (totFE) bits.push(`+${totFE} ${totFE === 1 ? "federado" : "federados"}`);
  if (totFS) bits.push(`-${totFS} ${totFS === 1 ? "saída" : "saídas"}`);
  return `📋 Resumo ${dia} — ${bits.join(" · ") || "sem novidades"}`;
}

/* ── GitHub API ─────────────────────────────────────────────────────────── */

async function gh(method, urlPath, body) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) throw new Error("faltam GITHUB_TOKEN / GITHUB_REPOSITORY");
  const res = await fetch(`https://api.github.com/repos/${repo}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`GitHub ${method} ${urlPath} → HTTP ${res.status}: ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

async function main() {
  const items = loadPending().filter((i) => i.digest && hasNews(i.digest));
  if (!items.length) {
    console.log("[digest-mail] nada pendente — sem email.");
    return;
  }

  const title = buildTitle(items);
  const body = buildBody(items);

  if (DRY) {
    console.log(`--- TÍTULO ---\n${title}\n\n--- CORPO ---\n${body}`);
    return;
  }

  // A label é conveniência; se o repo não a tiver e a API recusar, envia-se na
  // mesma sem ela — o email é que interessa.
  let issue;
  try {
    issue = await gh("POST", "/issues", { title, body, labels: ["resumo-dados"] });
  } catch (e) {
    console.warn("[digest-mail] criação com label falhou, a repetir sem label:", e.message);
    issue = await gh("POST", "/issues", { title, body });
  }
  console.log(`[digest-mail] issue #${issue.number} criada — ${issue.html_url}`);

  // Fechar logo: o email já saiu na criação e a lista de issues fica limpa.
  try {
    await gh("PATCH", `/issues/${issue.number}`, { state: "closed", state_reason: "completed" });
    console.log(`[digest-mail] issue #${issue.number} fechada.`);
  } catch (e) {
    console.warn("[digest-mail] não deu para fechar a issue (o email já foi):", e.message);
  }
}

if (require.main === module) {
  main().catch((e) => {
    // Falhar o envio não pode falhar o workflow — os dados já estão commitados.
    console.warn("[digest-mail] falhou (ignorado):", e && e.message);
  });
}

module.exports = { buildBody, buildTitle, hasNews };
