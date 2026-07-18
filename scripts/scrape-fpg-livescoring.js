#!/usr/bin/env node
/**
 * scripts/scrape-fpg-livescoring.js
 * Scraper Node-puro do LIVE SCORING da FPG (scoring.fpg.pt/live-scoring).
 *
 * ─── O que é ────────────────────────────────────────────────────────────
 * Aplicação ASP.NET separada das `/lists` e `/pt`. Publica a classificação
 * EM TEMPO REAL enquanto uma prova está a ser jogada: posição, buraco em que
 * cada jogador vai (ou tee time se ainda não saiu), to-par do dia, to-par
 * total e totais por ronda. É a única fonte com o "onde vai agora" — a
 * `classif.aspx/ClassifLST` só publica resultados depois de fechados.
 *
 * ⚠ OS DADOS SÃO EFÉMEROS: só existem ENQUANTO a prova decorre. Antes do
 * início o gate responde "A prova ainda não se iniciou"; depois de fechada a
 * prova sai do live. Não há histórico para backfill — o que não for
 * capturado durante o jogo perde-se. Por isso este scraper foi desenhado
 * para correr em ciclo durante o dia do torneio (ver --watch).
 *
 * ─── Como se fala com ele (descoberto 2026-07-18) ───────────────────────
 * 1) ENTRY GATE obrigatório:
 *      GET /live-scoring/1.aspx?pa=classif&c={ccode}&t={tcode}&r={round}
 *    Devolve HTTP 200 e SETA o ASP.NET_SessionId. O contexto do torneio fica
 *    guardado NA SESSÃO — os PageMethods seguintes não levam ccode/tcode.
 *    ⚠ Ir directo a /live-scoring/Home/ls_classif.aspx (ou à raiz da app) SEM
 *    passar pelo gate devolve sempre HTTP 500 "Runtime Error". Não é falta de
 *    cookies — é falta de contexto de sessão.
 *    ⚠ NÃO são precisos cookies capturados do Chrome 90: a app emite sessão
 *    própria. É o único backend FPG que funciona sem cookies curados.
 *
 * 2) DADOS (jTable PageMethod, mesmo padrão do resto da FPG):
 *      POST /live-scoring/Home/ls_classif.aspx/lsClassifLST?jtSorting=Topar_cl ASC
 *      body: {jtSorting} — E MAIS NADA. A page method não tem paginação
 *      (jTable com paging:false); mandar jtStartIndex/jtPageSize dá 500.
 *    Campos do record (lidos das display functions do jTable na página):
 *      Player_name, Score_id, Team_description, Nholes, Tee_Time,
 *      ScoreStatusId, Topar, Topar_cl, Topar_day, Tot_R1, Tot_R2, Tot_R3
 *
 * 3) SCORECARD por jogador (child table):
 *      POST /live-scoring/Home/ls_classif.aspx/ScoreCard?score_id={id}&Classi={n}
 *    Devolve Records:[{scdisplay: "<html do cartão>"}] — fragmento HTML, não
 *    valores estruturados. Guardamos o HTML cru (só com --scorecards).
 *
 * ─── Semântica dos campos (das display functions) ───────────────────────
 *   Nholes = 0        → ainda não saiu; mostrar Tee_Time (HH:MM)
 *   Topar_cl > 900    → sem posição; ScoreStatusId diz porquê:
 *                       20/30 = DQ, 40 = NR, 99 = NS (não saiu)
 *   Classi (scoring type) vem do dropdown DpClassif, populado server-side.
 *     <= 2 → stroke play (to-par negativo é bom)
 *      > 2 → stableford (pontos: mais é melhor — as cores invertem)
 *
 * ─── Uso ────────────────────────────────────────────────────────────────
 *   node scripts/scrape-fpg-livescoring.js --probe
 *       Só diz quais torneios estão live agora (não grava nada).
 *   node scripts/scrape-fpg-livescoring.js --tcodes 179:10604,000:10941
 *   node scripts/scrape-fpg-livescoring.js --auto
 *       Torneios de hoje segundo fpg-admissions-draws.json.
 *   node scripts/scrape-fpg-livescoring.js --auto --watch 120
 *       Repete de 120 em 120s enquanto houver provas live (para o dia do torneio).
 *   node scripts/scrape-fpg-livescoring.js --tcodes 000:10941 --scorecards
 *
 * Output: public/data/fpg-livescoring.json (merge aditivo por ccode-tcode-round;
 * cada snapshot preserva o anterior em `history` para se ver a evolução).
 *
 * Exit codes: 0 = capturou algo · 2 = nada live (não é erro) · 1 = erro.
 *
 * ─── ⚠ INVESTIGAÇÃO 2026-07-18: porque é que o Node leva 500 ────────────
 * Conclusão: NÃO é o Node que é discriminado — é qualquer chamada FEITA POR
 * SCRIPT. O que foi medido, na mesma prova (000/10879) e na mesma sessão:
 *
 *   navegação real do browser ao gate  → jTable carrega, 82 jogadores  ✓ 200
 *   fetch() na PRÓPRIA página          → 500
 *   jQuery.ajax na própria página      → 500
 *   $(...).jtable('load') na página    → 500   ← o mecanismo do próprio site!
 *   Node (gate → página → POST)        → 500
 *
 * O pedido do jTable foi interceptado no XHR e é EXACTAMENTE o que enviamos:
 *   POST ls_classif.aspx/lsClassifLST?jtSorting=Topar_cl ASC
 *   body {"jtSorting":"Topar_cl ASC"}
 *   headers Accept: application/json…, Content-Type: application/json;
 *           charset=utf-8, X-Requested-With: XMLHttpRequest
 * Mesmo assim, só a chamada disparada pelo CARREGAMENTO da página passa. Uma
 * repetição idêntica segundos depois, no mesmo separador e sessão, dá 500.
 *
 * Hipóteses ELIMINADAS por medição: cookies/sessão (a mesma sessão serve e
 * recusa), IP/rate-limit (o browser continua a servir enquanto o Node leva
 * 500), fingerprint TLS/HTTP2 (o fetch do próprio browser também leva 500),
 * headers (interceptados e replicados), body (idem), paginação, e HTML
 * server-rendered (a página vem com 0 <tr> — as linhas vêm mesmo do
 * PageMethod).
 *
 * O que resta: o servidor parece ligar a autorização do PageMethod ao ciclo
 * de vida do pedido de NAVEGAÇÃO que renderizou a página (algo como um
 * one-shot por render), coisa que não se consegue reproduzir com pedidos
 * avulso. Não encontrei forma de replicar isso de Node.
 *
 * ⇒ CONSEQUÊNCIA PRÁTICA: para capturar live scoring de forma fiável, a via
 * que FUNCIONA é navegar mesmo a página num browser e ler a TABELA do DOM
 * (foi assim que se capturou public/data/fpg-livescoring.json). Este script
 * Node fica como está — útil para o `--probe` (o gate responde bem e diz se a
 * prova está a decorrer), mas o passo dos dados precisa de browser.
 *
 * ─── ⚠ ESTADO: NÃO VALIDADO PONTA-A-PONTA (2026-07-18) ──────────────────
 * O que ESTÁ provado a correr de Node:
 *   • o entry gate responde 302 + emite ASP.NET_SessionId;
 *   • com esse cookie, GET Home/ls_classif.aspx rende a página CERTA da prova
 *     (nome do torneio + DpClassif com os 5 scoring types).
 * O que NÃO ficou provado:
 *   • o POST lsClassifLST devolveu sempre HTTP 500 a partir de Node, enquanto
 *     o MESMO pedido (body {jtSorting} apenas, verificado por interceptação do
 *     XHR) devolvia 200 no browser, na mesma prova e a poucos segundos de
 *     distância. Não se encontrou diferença de headers/body que explicasse.
 *
 * ⚠ Ao fim de ~40 pedidos de diagnóstico em poucos minutos, o servidor
 * DEIXOU de emitir sessão a este cliente (gate sem Set-Cookie, página sem
 * torneio) — ou seja, há throttling/bloqueio por volume. É bem possível que
 * os 500 do POST já fossem esse mesmo throttling e não um erro de pedido.
 * POR ISSO: este scraper é deliberadamente LENTO e desiste depressa. Não
 * aumentar a cadência sem necessidade — a FPG é infraestrutura de terceiros e
 * já perdemos o BlueGolf por automação demasiado agressiva.
 *
 * PRÓXIMO PASSO quando houver uma prova a decorrer: correr
 *   node scripts/scrape-fpg-livescoring.js --probe
 * e, se acusar live, um único `--tcodes ccode:tcode`. Se o POST voltar a dar
 * 500 com a página a render bem, comparar com o browser NO MOMENTO (é o único
 * sítio onde a diferença aparece) antes de mexer no código.
 */

const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const BASE = "https://scoring.fpg.pt/live-scoring";
const OUT = path.join(process.cwd(), "public", "data", "fpg-livescoring.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
  "Upgrade-Insecure-Requests": "1",
};

/* Mensagens do gate que significam "não há live" (não são erro). */
const NOT_LIVE_RX = /ainda n[ãa]o se iniciou|apenas ap[óo]s o in[íi]cio|No data available/i;

/* ── CLI ──────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d = null) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};

const PROBE = has("--probe");
const AUTO = has("--auto");
const SCORECARDS = has("--scorecards");
const ROUND = val("--round", "0");
const WATCH = val("--watch", null);
const TCODES = val("--tcodes", null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Cadência deliberadamente conservadora — ver aviso de throttling no
 * cabeçalho. Melhor perder um snapshot do que o acesso. */
const DELAY_ENTRE_TORNEIOS = 3000;
const DELAY_SCORECARD = 400;
const MAX_TENTATIVAS_POST = 2;

/* ── Cookie jar mínimo (a app emite sessão própria) ───────────────────── */
function jarFrom(res) {
  const jar = {};
  const sc = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of sc) {
    const kv = c.split(";")[0];
    const i = kv.indexOf("=");
    if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

/* ── 1) Entry gate ────────────────────────────────────────────────────── */
async function openSession(ccode, tcode, round) {
  const url = `${BASE}/1.aspx?pa=classif&c=${ccode}&t=${tcode}&r=${round}`;
  // ⚠ redirect:"manual" é OBRIGATÓRIO. O gate responde 302 para
  // Home/ls_classif.aspx E SETA o ASP.NET_SessionId na mesma resposta. O
  // `fetch` do Node não tem cookie jar: com redirect:"follow" o pedido
  // seguinte sai SEM o cookie acabado de emitir, a página renderiza sem
  // sessão (DpClassif vazio) e o PageMethod devolve 500. Temos de apanhar o
  // cookie no 302 e refazer o GET nós próprios com ele.
  let res = await fetch(url, { headers: HEADERS, redirect: "manual" });
  let cookie = jarFrom(res);
  let html = await res.text();

  const loc = res.headers.get("location");
  if (loc && cookie) {
    const next = new URL(loc, `${BASE}/`).href;
    const r2 = await fetch(next, { headers: { ...HEADERS, Cookie: cookie }, redirect: "follow" });
    const extra = jarFrom(r2);
    if (extra) cookie = [cookie, extra].filter(Boolean).join("; ");
    html = await r2.text();
    res = r2;
  }

  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const notLive = NOT_LIVE_RX.test(text);
  // O dropdown DpClassif só é populado com os scoring types quando a sessão
  // TEM contexto de prova — serve de confirmação de que o gate pegou.
  const classi = [...html.matchAll(/<option[^>]*value="(\d+)"/g)].map((m) => m[1]);
  const nome = (html.match(/<h[1-4][^>]*>([^<]{5,120})<\/h[1-4]>/) || [])[1]?.trim() || null;
  return { ok: res.ok, status: res.status, cookie, notLive, classi, nome, html, url };
}

/* ── 2) PageMethod da classificação ───────────────────────────────────── */
async function fetchClassif(cookie) {
  const url = `${BASE}/Home/ls_classif.aspx/lsClassifLST?jtSorting=${encodeURIComponent("Topar_cl ASC")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": `${BASE}/Home/ls_classif.aspx`,
      "Cookie": cookie,
    },
    // ⚠ O body é SÓ {jtSorting}. A page method não tem paginação (jTable corre
    // com paging:false) e a assinatura ASP.NET não aceita jtStartIndex/
    // jtPageSize — mandá-los devolve HTTP 500 "error processing the request".
    // Confirmado 2026-07-18 interceptando o pedido real do jTable no browser.
    body: JSON.stringify({ jtSorting: "Topar_cl ASC" }),
  });
  const txt = await res.text();
  if (!res.ok) {
    const throttled = /Runtime Error/.test(txt);
    return {
      ok: false, status: res.status, throttled,
      error: throttled ? "Runtime Error (possível throttling — abrandar)" : txt.slice(0, 160),
    };
  }
  let j;
  try { j = JSON.parse(txt); } catch { return { ok: false, status: res.status, error: "resposta não-JSON" }; }
  const d = j.d || j;
  if (d.Result !== "OK") return { ok: false, status: res.status, error: d.Message || "Result != OK" };
  return { ok: true, records: d.Records || [], total: d.TotalRecordCount ?? (d.Records || []).length };
}

/* ── 3) Scorecard (fragmento HTML) ────────────────────────────────────── */
async function fetchScorecard(cookie, scoreId, classi) {
  const url = `${BASE}/Home/ls_classif.aspx/ScoreCard?score_id=${scoreId}&Classi=${classi}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": `${BASE}/Home/ls_classif.aspx`,
        "Cookie": cookie,
      },
      body: JSON.stringify({ score_id: String(scoreId), Classi: String(classi) }),
    });
    if (!res.ok) return null;
    const j = JSON.parse(await res.text());
    const d = j.d || j;
    if (d.Result !== "OK") return null;
    return (d.Records || []).map((r) => r.scdisplay).filter(Boolean).join("\n") || null;
  } catch {
    return null;
  }
}

/* ── Normalização ─────────────────────────────────────────────────────── */
/* Mapeia o record cru para campos estáveis. O record CRU é preservado em
 * `_raw` — este scraper nunca pôde ser testado contra uma prova a decorrer
 * (só há live durante o jogo), por isso guardar o cru garante que nada se
 * perde se algum nome de campo aqui estiver errado. */
function normalizeRecord(r) {
  const nholes = Number(r.Nholes ?? 0);
  const cl = Number(r.Topar_cl ?? 999);
  const st = Number(r.ScoreStatusId ?? 0);
  let pos = cl;
  let status = "ok";
  if (!(cl < 900)) {
    pos = null;
    if (st === 20 || st === 30) status = "DQ";
    else if (st === 40) status = "NR";
    else if (st === 99) status = "NS";
    else status = "sem-posicao";
  }
  return {
    pos,
    status,
    nome: r.Player_name ?? null,
    scoreId: r.Score_id ?? null,
    equipa: r.Team_description ?? null,
    buracos: nholes,                                   // 0 = ainda não saiu
    teeTime: nholes === 0 ? (r.Tee_Time ?? null) : null,
    toParTotal: r.Topar ?? null,
    toParDia: r.Topar_day ?? null,
    rondas: [r.Tot_R1, r.Tot_R2, r.Tot_R3].filter((v) => v != null && v !== ""),
    _raw: r,
  };
}

/* ── Scrape de um torneio ─────────────────────────────────────────────── */
async function scrapeOne(ccode, tcode, round) {
  const label = `${ccode}/${tcode}${round !== "0" ? ` r${round}` : ""}`;
  const s = await openSession(ccode, tcode, round);
  if (!s.ok) {
    console.log(`[live] ${label} · gate HTTP ${s.status} — ignorado`);
    return null;
  }
  if (s.notLive) {
    console.log(`[live] ${label} · prova não está live`);
    return null;
  }
  // Se o gate não emitiu sessão, não vale a pena insistir — é sinal de
  // throttling (ver cabeçalho), não de prova inexistente.
  if (!s.cookie) {
    console.log(`[live] ${label} · gate não emitiu sessão (throttling?) — a saltar`);
    return null;
  }

  let c = null;
  for (let i = 1; i <= MAX_TENTATIVAS_POST; i++) {
    c = await fetchClassif(s.cookie);
    if (c.ok) break;
    if (i < MAX_TENTATIVAS_POST) await sleep(2000 * i);
  }
  if (!c.ok) {
    // Acontece quando o gate abre mas a prova não tem scores lançados — e
    // também (por confirmar) sob throttling. Ver cabeçalho.
    console.log(`[live] ${label} · sem classificação (${c.error})`);
    return null;
  }
  if (!c.records.length) {
    console.log(`[live] ${label} · live aberto mas 0 jogadores`);
    return null;
  }

  const jogadores = c.records.map(normalizeRecord);
  const classi = s.classi[0] || "1";

  if (SCORECARDS) {
    let n = 0;
    for (const j of jogadores) {
      if (!j.scoreId) continue;
      const sc = await fetchScorecard(s.cookie, j.scoreId, classi);
      if (sc) { j.scorecardHtml = sc; n++; }
      await sleep(DELAY_SCORECARD);
    }
    console.log(`[live] ${label} · ${n}/${jogadores.length} scorecards`);
  }

  const emJogo = jogadores.filter((j) => j.buracos > 0).length;
  console.log(`[live] ${label} · ${jogadores.length} jogadores (${emJogo} em jogo) ✓`);

  return {
    ccode, tcode, round: String(round),
    classi,
    capturedAt: new Date().toISOString(),
    totalJogadores: jogadores.length,
    emJogo,
    jogadores,
  };
}

/* ── Descoberta de alvos ──────────────────────────────────────────────── */
function parseTcodes(spec) {
  return spec.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const [a, b] = s.split(":");
    // Sem ccode explícito assume-se 000 (Nacionais) — mas avisa, porque a FPG
    // reutiliza tcodes entre clubes e o par errado abre a prova errada.
    if (b == null) {
      console.warn(`[live] ⚠ "${s}" sem ccode — a assumir 000. Preferir "ccode:tcode".`);
      return { ccode: "000", tcode: a };
    }
    return { ccode: a.padStart(3, "0"), tcode: b };
  });
}

/* Torneios de HOJE segundo o ficheiro de admissions/draws já existente. */
function autoTargets() {
  const p = path.join(process.cwd(), "public", "data", "fpg-admissions-draws.json");
  if (!fs.existsSync(p)) {
    console.warn("[live] --auto: fpg-admissions-draws.json não encontrado");
    return [];
  }
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const hoje = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const t of j.tournaments || []) {
    if (!t.date) continue;
    // Janela: do dia de início até +3 dias (provas de várias rondas).
    const fim = new Date(Date.parse(t.date) + 3 * 86400000).toISOString().slice(0, 10);
    if (hoje >= t.date && hoje <= fim) out.push({ ccode: t.ccode, tcode: t.tcode });
  }
  return out;
}

/* ── Merge + escrita ──────────────────────────────────────────────────── */
function loadBase() {
  if (!fs.existsSync(OUT)) return { gerado_em: null, tournaments: {} };
  try { return JSON.parse(fs.readFileSync(OUT, "utf8")); }
  catch { return { gerado_em: null, tournaments: {} }; }
}

function mergeSnapshot(base, snap) {
  const key = `${snap.ccode}-${snap.tcode}-${snap.round}`;
  const prev = base.tournaments[key];
  // Snapshots anteriores ficam em `history` (só o resumo — o detalhe completo
  // do estado actual está no topo). Permite ver a evolução do dia sem inchar
  // o ficheiro com N cópias completas do campo.
  const history = prev ? [...(prev.history || []), {
    capturedAt: prev.capturedAt,
    emJogo: prev.emJogo,
    lider: prev.jogadores?.[0]?.nome ?? null,
    liderToPar: prev.jogadores?.[0]?.toParTotal ?? null,
  }].slice(-200) : [];
  base.tournaments[key] = { ...snap, history };
  return key;
}

/* ── Main ─────────────────────────────────────────────────────────────── */
async function runOnce() {
  let targets;
  if (TCODES) targets = parseTcodes(TCODES);
  else if (AUTO || PROBE) targets = autoTargets();
  else {
    console.error("Indica --tcodes ccode:tcode,... ou --auto (ou --probe). Ver cabeçalho do ficheiro.");
    process.exit(1);
  }

  if (!targets.length) {
    console.log("[live] Sem torneios candidatos para hoje.");
    return { captured: 0 };
  }
  console.log(`[live] ${targets.length} torneio(s) a verificar${PROBE ? " (probe — não grava)" : ""}`);

  const snaps = [];
  for (const t of targets) {
    try {
      const s = await scrapeOne(t.ccode, t.tcode, ROUND);
      if (s) snaps.push(s);
    } catch (e) {
      console.warn(`[live] ${t.ccode}/${t.tcode} · erro: ${e.message}`);
    }
    await sleep(DELAY_ENTRE_TORNEIOS);
  }

  if (PROBE) {
    console.log(`[live] PROBE: ${snaps.length} prova(s) live.`);
    return { captured: snaps.length, probe: true };
  }
  if (!snaps.length) return { captured: 0 };

  const base = loadBase();
  for (const s of snaps) mergeSnapshot(base, s);
  base.gerado_em = new Date().toISOString();
  base.source = "scrape-fpg-livescoring.js (scoring.fpg.pt/live-scoring)";
  writeJsonAtomic(OUT, base);
  console.log(`[live] ✓ Gravado ${OUT} (${Object.keys(base.tournaments).length} entradas, ${snaps.length} actualizadas)`);
  return { captured: snaps.length };
}

(async () => {
  try {
    if (WATCH) {
      const every = Math.max(30, Number(WATCH) || 120);
      console.log(`[live] modo watch: a cada ${every}s (Ctrl+C para parar)`);
      let vazios = 0;
      for (;;) {
        const r = await runOnce();
        vazios = r.captured ? 0 : vazios + 1;
        // Para sozinho após 20 ciclos sem nada — a prova acabou (ou não começou).
        if (vazios >= 20) { console.log("[live] 20 ciclos sem dados — a terminar."); break; }
        await sleep(every * 1000);
      }
      process.exit(0);
    }
    const r = await runOnce();
    process.exit(r.captured ? 0 : 2);
  } catch (e) {
    console.error("[live] ERRO:", e.message);
    process.exit(1);
  }
})();
