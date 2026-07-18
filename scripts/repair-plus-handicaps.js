#!/usr/bin/env node
/**
 * scripts/repair-plus-handicaps.js  (2026-07-18, one-off com uso recorrente)
 * ═════════════════════════════════════════════════════════════════════════
 * Repara handicaps PLUS já gravados em public/data/fpg-admissions-draws.json.
 *
 * ─── Porquê ─────────────────────────────────────────────────────────────
 * A FPG publica handicaps plus com "+" ("+5.1" = 5.1 ABAIXO de scratch), mas o
 * parser das inscrições fazia parseFloat("+5.1") → 5.1 e o sinal desaparecia.
 * Corrigido em 2026-07-18 (parseHcp, ver fpg-admissions-draw-parser.js), mas os
 * dados JÁ GRAVADOS continuam errados — e o sinal não se recupera por cálculo,
 * tem de se voltar a ler a FPG.
 *
 * ─── Porquê um script à parte e não um re-scrape normal ─────────────────
 * Um re-scrape completo tinha dois problemas:
 *   1) a trava de congelamento salta eventos passados (que são a maioria);
 *   2) o merge recusa listas com MENOS jogadores (protecção contra fontes
 *      parciais) — e desligá-la em massa com --force-adm punha 333 torneios
 *      em risco de perder inscritos por causa de um fetch parcial.
 * Este script é CIRÚRGICO: só toca no campo `hcp` de jogadores que já existem,
 * emparelhados pelo nº de federado. Nunca acrescenta nem remove jogadores,
 * nunca mexe em draws, nomes, datas ou contagens. Na pior das hipóteses não
 * corrige nada — não consegue estragar.
 *
 * Também só faz 1 pedido por torneio (a página de inscrições), contra os ~4
 * do scraper completo (que também vai buscar os draws).
 *
 * ─── Segurança ──────────────────────────────────────────────────────────
 *   • DRY-RUN por omissão — só escreve com --apply;
 *   • salta entradas `_manual: true` (curadas à mão);
 *   • só altera quando o valor fresco é PLUS (negativo) e o guardado é o
 *     positivo correspondente (|novo| === guardado) — qualquer outra
 *     divergência é reportada mas NÃO escrita (pode ser handicap alterado
 *     entre inscrição e hoje, que não é o nosso problema);
 *   • ritmo lento (default 1500 ms entre torneios) — a FPG já nos limitou
 *     hoje; ver aviso em scripts/scrape-fpg-livescoring.js;
 *   • escrita atómica e só no fim (ou a cada --checkpoint torneios);
 *   • resumível: --skip-first N.
 *
 * ─── Uso ────────────────────────────────────────────────────────────────
 *   node scripts/repair-plus-handicaps.js                 # dry-run, todos
 *   node scripts/repair-plus-handicaps.js --limit 20      # provar em 20
 *   node scripts/repair-plus-handicaps.js --apply         # aplicar
 *   node scripts/repair-plus-handicaps.js --apply --delay 2500
 *   node scripts/repair-plus-handicaps.js --apply --skip-first 120
 *
 * Exit: 0 = ok (com ou sem correcções) · 1 = erro.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { parseAdmissions } = require("./fpg-admissions-draw-parser.js");
const { loadCookieHeader } = require("./lib/cookies");
const { writeJsonAtomic } = require("./lib/atomic-write");

const REPO = path.resolve(__dirname, "..");
const FILE = path.join(REPO, "public", "data", "fpg-admissions-draws.json");
const ACK_ADMISSIONS = "XH256YF450";
const ACK_TOURNLIST = "XH256YF45T";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const args = process.argv.slice(2);
const has = f => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const APPLY = has("--apply");
const DELAY = parseInt(val("--delay", "1500"), 10);
const LIMIT = parseInt(val("--limit", "0"), 10);
const SKIP_FIRST = parseInt(val("--skip-first", "0"), 10);
const CHECKPOINT = parseInt(val("--checkpoint", "25"), 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));

const COOKIE = loadCookieHeader({
  envVars: ["FPG_ADMISSIONS_COOKIES"],
  file: path.join(REPO, "api", ".fpg-admissions-cookies.json"),
  label: "[repair-hcp]",
});
const COOKIE_DG = loadCookieHeader({
  envVars: ["DATAGOLF_SCORING_COOKIES"],
  file: path.join(REPO, "api", ".scoring-datagolf-cookies.json"),
  label: "[repair-hcp/datagolf]",
  exitOnFail: false,
}) || null;

const H = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-PT,pt;q=0.9",
  "Upgrade-Insecure-Requests": "1",
};

/* Warmup do entry-gate — necessário para as URLs directas (ccodes de clube,
 * que o linkpage.aspx não serve; ver CLAUDE.md). Feito uma vez por run. */
let warmed = false;
async function warmup() {
  if (warmed || !COOKIE_DG) return;
  try {
    const r = await fetch(`https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=${ACK_TOURNLIST}`,
      { headers: { ...H, Cookie: COOKIE_DG, Referer: "https://scoring.datagolf.pt/" }, redirect: "follow" });
    await r.text();
  } catch { /* segue — o linkpage pode bastar */ }
  warmed = true;
}

/** Busca o HTML das inscrições: linkpage e, se der Param_Errors (ccodes de
 *  clube), a URL directa com warmup. Mesma cascata do scraper principal. */
async function fetchAdmissionsHtml(ccode, tcode) {
  const url = `https://scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=${ccode}&tourn=${tcode}&ack=${ACK_ADMISSIONS}`;
  try {
    const r = await fetch(url, { headers: { ...H, Cookie: COOKIE }, redirect: "follow" });
    const t = await r.text();
    if (!/Param_Errors|Err=999|Param Error/.test(t)) return t;
  } catch { /* tenta o directo */ }

  if (!COOKIE_DG) return null;
  await warmup();
  try {
    const r = await fetch(`https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=${ccode}&tcode=${tcode}`,
      { headers: { ...H, Cookie: COOKIE_DG, Referer: "https://scoring.datagolf.pt/" }, redirect: "follow" });
    const t = await r.text();
    if (!/Param_Errors|Err=999|Param Error/.test(t)) return t;
  } catch { /* desiste */ }
  return null;
}

(async () => {
  if (!fs.existsSync(FILE)) { console.error(`[repair-hcp] ficheiro não encontrado: ${FILE}`); process.exit(1); }
  const db = JSON.parse(fs.readFileSync(FILE, "utf8"));

  let alvos = (db.tournaments || []).filter(t => (t.admissions?.players || []).length > 0 && !t._manual);
  console.log(`[repair-hcp] ${alvos.length} torneios com inscritos (de ${db.tournaments.length}); _manual saltados`);
  if (SKIP_FIRST) { alvos = alvos.slice(SKIP_FIRST); console.log(`[repair-hcp] --skip-first ${SKIP_FIRST}`); }
  if (LIMIT) { alvos = alvos.slice(0, LIMIT); console.log(`[repair-hcp] --limit ${LIMIT}`); }
  console.log(`[repair-hcp] modo: ${APPLY ? "APPLY (escreve)" : "DRY-RUN (não escreve)"} · delay ${DELAY}ms`);

  let corrigidos = 0, torneiosTocados = 0, falhas = 0, divergentes = 0, i = 0;
  const relatorio = [];

  for (const t of alvos) {
    i++;
    const html = await fetchAdmissionsHtml(t.ccode, t.tcode);
    if (!html) {
      falhas++;
      console.log(`[${i}/${alvos.length}] ${t.ccode}/${t.tcode} · sem resposta`);
      await sleep(DELAY); continue;
    }
    const fresco = parseAdmissions(html);
    if (!fresco || !fresco.players?.length) {
      falhas++;
      console.log(`[${i}/${alvos.length}] ${t.ccode}/${t.tcode} · sem jogadores no HTML`);
      await sleep(DELAY); continue;
    }

    // Emparelhar por nº de federado (chave estável; nomes variam em acentos/caixa)
    const porFed = new Map();
    for (const p of fresco.players) if (p.fed) porFed.set(String(p.fed), p);

    const mudou = [];
    for (const g of t.admissions.players) {
      if (!g.fed) continue;
      const f = porFed.get(String(g.fed));
      if (!f || f.hcp == null || g.hcp == null) continue;
      if (f.hcp < 0 && g.hcp > 0 && Math.abs(f.hcp) === g.hcp) {
        mudou.push({ nome: g.nome, de: g.hcp, para: f.hcp });
        if (APPLY) g.hcp = f.hcp;
      } else if (f.hcp !== g.hcp) {
        // Divergência que NÃO é o bug do sinal (ex: handicap mudou desde a
        // inscrição). Reportar, nunca escrever — não é o âmbito deste script.
        divergentes++;
      }
    }

    if (mudou.length) {
      torneiosTocados++; corrigidos += mudou.length;
      relatorio.push({ t: `${t.ccode}/${t.tcode}`, nome: (t.name || "").slice(0, 40), mudou });
      console.log(`[${i}/${alvos.length}] ${t.ccode}/${t.tcode} · ${mudou.length} plus: `
        + mudou.map(m => `${(m.nome || "").split(" ")[0]} ${m.de}→${m.para}`).join(", "));
    } else if (i % 25 === 0) {
      console.log(`[${i}/${alvos.length}] … sem plus (${corrigidos} corrigidos até agora)`);
    }

    if (APPLY && torneiosTocados > 0 && CHECKPOINT > 0 && i % CHECKPOINT === 0) {
      writeJsonAtomic(FILE, db);
      console.log(`[repair-hcp] checkpoint gravado (${corrigidos} correcções)`);
    }
    await sleep(DELAY);
  }

  console.log("\n[repair-hcp] ═══ RESUMO ═══");
  console.log(`  torneios verificados : ${i}`);
  console.log(`  torneios com plus    : ${torneiosTocados}`);
  console.log(`  handicaps corrigidos : ${corrigidos}`);
  console.log(`  sem resposta         : ${falhas}`);
  console.log(`  divergências ignoradas (hcp mudou desde a inscrição): ${divergentes}`);

  if (!APPLY) {
    console.log("\n  DRY-RUN — nada foi escrito. Repetir com --apply para aplicar.");
  } else if (corrigidos > 0) {
    writeJsonAtomic(FILE, db);
    console.log(`\n  ✓ Gravado ${FILE}`);
  } else {
    console.log("\n  Nada a corrigir — ficheiro inalterado.");
  }
  process.exit(0);
})().catch(e => { console.error("[repair-hcp] ERRO:", e); process.exit(1); });
