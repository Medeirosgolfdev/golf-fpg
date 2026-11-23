#!/usr/bin/env node
/**
 * scrape-inscricoes-abertas.js — torneios com inscrições ABERTAS em todos os clubes da FPG.
 *
 * Para a vista «🟢 Inscrições abertas» da /FPG (23/11/2026, Mariana: «vamos tirar o ranking
 * PJA daqui e colocar o que fizemos no artefacto dos torneios com inscrições abertas»).
 *
 * Fonte: a lista pública de cada clube (sem cookies, um pedido de cada vez)
 *   https://scoring-pt.datagolf.pt/scripts/tourn_admissions_list.asp?club={ccode}&ack=XH256YF45T
 *   — `club=ALL` responde «Nenhum Torneio disponível»: é mesmo clube a clube.
 * Quando o clube só tem UM torneio aberto, a FPG responde 302 directamente para ele, sem
 * nome nem data: lêem-se do `tournAdmissions.aspx` pela sessão pública
 * (`1PreparePage.aspx?page=admissions`, como o scrape-fpg-admissions-draws-node.js), e o
 * nome fica guardado para as corridas seguintes enquanto o torneio estiver aberto.
 *
 * Clubes: scripts/inscricoes-abertas-clubes.json ([código, nome curto, nome, zona]).
 * Saída:  public/data/inscricoes-abertas.json
 *   { generatedAt, clubes, erros, errosDetalhe[], torneios: [{ data, ccode, tcode, nome, clube, zona }] }
 *
 * Exit: 0 = gravou · 2 = nada mudou · 1 = erro (mais de 15 clubes falharam, ou a lista caiu
 * para menos de metade sem erros — a guarda anti-encolhimento; `--force` passa por cima).
 *
 * Uso:  node scripts/scrape-inscricoes-abertas.js [--dry-run] [--force]
 * Também corre o painel da OneDrive (_CLAUDE_HISTORICO/paineis/inscricoes-abertas/gerar.js),
 * que alimenta o artefacto «Mapa de Fontes» — a mesma lógica, fora do repositório.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Sessao, UA } = require("./lib/fpg-session");
const { writeJsonGuarded, hasForceFlag } = require("./lib/shrink-guard");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public", "data", "inscricoes-abertas.json");
const CLUBES = path.join(__dirname, "inscricoes-abertas-clubes.json");
const LISTA = "https://scoring-pt.datagolf.pt/scripts/tourn_admissions_list.asp";
const ACK = "XH256YF45T";
const PAUSA_MS = 350;
const MAX_ERROS = 15;
const DRY = process.argv.includes("--dry-run");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const texto = (s) => String(s).replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** Linhas da tabela da lista de um clube → [{ tcode, data, nome }]. «Nenhum Torneio» → []. */
function parseLista(html) {
  const out = [];
  for (const row of String(html).split(/<tr[\s>]/i).slice(1)) {
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => texto(m[1]));
    const tc = (row.match(/tourn=(\d+)/) || [])[1];
    if (tds.length >= 3 && tc) out.push({ tcode: tc, data: /^\d{4}-\d{2}-\d{2}$/.test(tds[0]) ? tds[0] : "", nome: tds[1] });
  }
  if (!out.length && !/Nenhum Torneio/i.test(html)) throw new Error(`resposta inesperada (${String(html).length} bytes)`);
  return out;
}

/** Nome e data do tournAdmissions.aspx («lblTdesc», «lbldt» dd/mm/aaaa). */
function parseTournAdmissions(html) {
  const lbl = (id) => { const m = String(html).match(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</span>`, "i")); return m ? texto(m[1]) : ""; };
  const nome = lbl("lblTdesc");
  const d = lbl("lbldt").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return nome ? { nome, data: d ? `${d[3]}-${d[2]}-${d[1]}` : "" } : null;
}

async function listaDoClube(cc) {
  const res = await fetch(`${LISTA}?club=${cc}&ack=${ACK}`, { redirect: "manual", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
  const html = await res.text();
  if (res.status >= 300 && res.status < 400) { // um só torneio aberto → salta para ele
    const tc = ((res.headers.get("location") || "").match(/tourn=(\d+)/) || [])[1];
    return tc ? [{ tcode: tc, data: "", nome: "" }] : [];
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseLista(html);
}

async function nomeDoTorneio(cc, tc) {
  const s = new Sessao({ base: "https://scoring.datagolf.pt/pt" });
  await s.get(`https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=${ACK}`);
  const r = await s.get(`https://scoring.datagolf.pt/pt/1PreparePage.aspx?user=fpguser&page=admissions&ccode=${cc}&tcode=${tc}&pagelang=PT`);
  return r.status === 200 && /tournAdmissions\.aspx/i.test(r.url) ? parseTournAdmissions(r.html) : null;
}

async function main() {
  const clubes = JSON.parse(fs.readFileSync(CLUBES, "utf8")).clubes; // ilegível → erro (nunca «vazio»)
  let anterior = null;
  if (fs.existsSync(OUT)) anterior = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const conhecidos = new Map((anterior?.torneios || []).map((t) => [`${t.ccode}:${t.tcode}`, t]));

  const torneios = [], erros = [];
  for (const [cc, curto, , zona] of clubes) {
    try {
      for (const t of await listaDoClube(cc)) {
        if (!t.nome) {
          const antes = conhecidos.get(`${cc}:${t.tcode}`);
          if (antes?.nome && !/^torneio \d+$/i.test(antes.nome)) { t.nome = antes.nome; t.data = antes.data; }
          else { try { const n = await nomeDoTorneio(cc, t.tcode); if (n) Object.assign(t, n); } catch { /* fica sem nome */ } await sleep(PAUSA_MS); }
        }
        torneios.push({ data: t.data || "", ccode: cc, tcode: t.tcode, nome: t.nome || `torneio ${t.tcode}`, clube: curto, zona });
      }
    } catch (e) { erros.push(`${cc}: ${e.message || e}`); }
    await sleep(PAUSA_MS);
  }
  torneios.sort((a, b) => (a.data || "9").localeCompare(b.data || "9") || a.ccode.localeCompare(b.ccode) || a.tcode.localeCompare(b.tcode));
  const nClubes = new Set(torneios.map((t) => t.ccode)).size;
  console.log(`${torneios.length} torneios abertos em ${nClubes} clubes (${clubes.length} consultados, ${erros.length} com erro)`);
  if (erros.length) console.log("  erros: " + erros.join(" | "));

  if (erros.length > MAX_ERROS) { console.error(`::error::${erros.length} clubes falharam — a FPG parece em baixo; não gravado.`); return 1; }
  if (anterior && JSON.stringify(anterior.torneios) === JSON.stringify(torneios)) { console.log("Nada mudou."); return 2; }
  if (DRY) { console.log(torneios.slice(0, 8)); return 2; }
  const dados = { generatedAt: new Date().toISOString(), clubes: clubes.length, erros: erros.length, errosDetalhe: erros, torneios };
  const r = writeJsonGuarded(OUT, dados, { count: (d) => d.torneios.length, maxDrop: 0.5, force: hasForceFlag() || erros.length === 0 && !anterior, label: "inscricoes-abertas", failOnRefuse: true });
  if (!r.written) return 1;
  console.log(`Gravado: ${path.relative(ROOT, OUT)}`);
  return 0;
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch((e) => { console.error(e.stack || e); process.exitCode = 1; });
}
module.exports = { parseLista, parseTournAdmissions };
