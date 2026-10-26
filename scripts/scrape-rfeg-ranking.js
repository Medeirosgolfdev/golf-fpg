/**
 * scripts/scrape-rfeg-ranking.js — rankings da RFEG (por omissão os do Comité
 * Juvenil: Infantil, Cadete e as zonas, que também têm Alevines).
 *
 * História: o scraper de 26/06 (ramo nunca juntado `claude/eloquent-goldberg-ykatma`)
 * lia o antigo RankingList.aspx em ASP.NET. Em Setembro de 2026 a RFEG mudou
 * de site (WordPress) e esse endereço redirecciona para a página inicial —
 * refeito a 22/10/2026 para o site novo:
 *
 *   1. Lista: https://rfegolf.es/competiciones/rankings-golf?rk_anio=AAAA&rk_comite=ID&rk_pagina=N
 *      (24 cartões por página: id, título, data, PDF). Comités: 9239 Juvenil,
 *      9240 Masculino, 9237 Femenino, 9241 Pitch & Putt, 9242 Profesionales.
 *   2. Linhas: POST wp-admin/admin-ajax.php  action=eqf_rankings_csv,
 *      nonce (o `eqfRankings.nonce` da página da lista, igual para qualquer
 *      visitante), ranking_id → [{posicion, nombre, puntos}] — o botão «CSV».
 *   3. Licença, categoria (B/A/I/C) e idade: só no PDF do ranking juvenil
 *      (PUESTO · LICENCIA · APELLIDOS Y NOMBRE · N · EDAD · …). Lê-se com o
 *      pdf-parse e casa-se com as linhas do passo 2 pelo NOME (a licença é a
 *      sequência de 10 caracteres colada antes do nome). Os rankings de
 *      Masculino/Femenino (Sub-18, Boy…) não trazem licença no PDF.
 *
 * Saída: public/data/rfeg-rankings/{ano}_{id}_{slug}.json
 *   { id, year, comite, titulo, fecha, fechaIso, pdf, scrapedAt, total, conLicencia,
 *     players: [{ pos, nombre, puntos, licencia?, cat?, edad? }] }
 * + índice public/data/rfeg-rankings-index.json (gerado a partir da pasta).
 * O id do post no nome do ficheiro evita a colisão do scraper antigo (cortava
 * o nome aos 48 caracteres e as Zonas 6/8/9 masculino × feminino gravavam-se
 * umas por cima das outras).
 *
 * Guardas: ranking sem linhas não se grava; um ficheiro que perderia >50% dos
 * jogadores não substitui o do disco (--force); igual ao do disco não se
 * regrava. Pausa de --delay ms (1500 por omissão) entre pedidos.
 *
 * Uso:
 *   node scripts/scrape-rfeg-ranking.js                       # Juvenil, ano corrente
 *   node scripts/scrape-rfeg-ranking.js --years 2026,2025
 *   node scripts/scrape-rfeg-ranking.js --comites juvenil,masculino --skip-existing
 * Exit: 0 = gravou · 2 = nada de novo · 1 = erro (a lista não respondeu).
 */
const fs = require("fs");
const path = require("path");
const { Sessao, sleep, texto, dataIso, normLic } = require("./lib/rfeg-web");
const { writeJsonGuarded, hasForceFlag } = require("./lib/shrink-guard");

const BASE = "https://rfegolf.es";
const LISTA = `${BASE}/competiciones/rankings-golf`;
const AJAX = `${BASE}/wp-admin/admin-ajax.php`;
const OUT_DIR = path.resolve(__dirname, "../public/data/rfeg-rankings");
const INDEX = path.resolve(__dirname, "../public/data/rfeg-rankings-index.json");
const COMITES = { juvenil: 9239, masculino: 9240, femenino: 9237, pitchputt: 9241, profesionales: 9242 };
const NOME_COMITE = { 9239: "Juvenil", 9240: "Masculino", 9237: "Femenino", 9241: "Pitch&Putt", 9242: "Profesionales" };

/* ─── parsing ─────────────────────────────────────────────────── */

/** Cartões da página da lista → [{id, titulo, fecha, tag, pdf}] + nonce + há página seguinte. */
function parseLista(html) {
  const cards = [];
  const partes = html.split(/class="eqf-doc-card eqf-ranking-card"/).slice(1);
  for (const p of partes) {
    const id = /data-ranking-id="(\d+)"/.exec(p)?.[1];
    if (!id) continue;
    const titulo = texto(/class="eqf-doc-title">([\s\S]*?)<\/span>/.exec(p)?.[1] || /data-titulo="([^"]*)"/.exec(p)?.[1] || "");
    const fecha = texto(/class="eqf-doc-date">([\s\S]*?)<\/span>/.exec(p)?.[1] || "") || null;
    const tag = texto(/eqf-doc-tag--sub">([\s\S]*?)<\/span>/.exec(p)?.[1] || "") || null;
    const pdf = /href="(https:\/\/media\.rfegolf\.es\/[^"]+\.pdf)"/i.exec(p)?.[1] || null;
    cards.push({ id: Number(id), titulo, fecha, tag, pdf });
  }
  const nonce = /var eqfRankings\s*=\s*\{[^}]*"nonce":"([a-f0-9]+)"/.exec(html)?.[1] || null;
  const seguinte = /class="eqf-doc-pager-arrow page-numbers next"/.test(html);
  return { cards, nonce, seguinte };
}

/** Resposta do eqf_rankings_csv → [{pos, nombre, puntos}]. Um empate vem com
 *  «-» na posição: fica com a do jogador de cima (mesmos pontos). */
function parseLinhasAjax(json) {
  if (!json || json.success !== true || !Array.isArray(json.data?.rows)) return null;
  let ant = null;
  return json.data.rows.map((r) => {
    let pos = parseInt(String(r.posicion ?? "").replace(/[^\d]/g, ""), 10);
    const pts = parseFloat(String(r.puntos ?? "").replace(/\./g, "").replace(",", "."));
    if (Number.isNaN(pos)) pos = ant?.pos ?? null;
    ant = { pos, nombre: texto(r.nombre), puntos: Number.isNaN(pts) ? null : pts };
    return ant;
  }).filter((r) => r.nombre);
}

/** Nome para comparar com o texto do PDF: maiúsculas, sem acentos nem espaços/pontuação. */
const compacto = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9Ñ]/g, "");

/**
 * Junta licença, categoria e idade do texto do PDF às linhas do ajax. No PDF
 * juvenil cada linha é «{pos}º{LICENÇA}{NOME}{N}{EDAD}{pontos…}» sem espaços
 * entre campos; a licença tem 10 caracteres (AM84955303, 1106942416,
 * AMJ7930322). O nome vem do ajax — é ele que diz onde o nome acaba (há nomes
 * que terminam na letra da categoria: «…DE LA FLOR» + «A12»).
 */
function juntarPdf(linhas, textoPdf) {
  const pdf = compacto(textoPdf);
  let com = 0;
  for (const l of linhas) {
    const n = compacto(l.nombre);
    if (n.length < 5) continue;
    let i = pdf.indexOf(n);
    let achou = null;
    while (i >= 0) {
      const lic = pdf.slice(Math.max(0, i - 10), i);
      if (/^[A-Z0-9]{10}$/.test(lic) && /\d{6}$/.test(lic)) { achou = { lic, fim: i + n.length }; break; }
      i = pdf.indexOf(n, i + 1);
    }
    if (!achou) continue;
    l.licencia = normLic(achou.lic);
    const m = /^([BAIC])(\d{2})/.exec(pdf.slice(achou.fim, achou.fim + 3));
    if (m) {
      const edad = Number(m[2]);
      l.cat = m[1];
      if (edad >= 6 && edad <= 21) l.edad = edad;
    }
    com++;
  }
  return com;
}

/** Título → slug do ficheiro (inteiro). */
const slug = (s) => texto(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
  .replace(/RANKING NACIONAL\s*/i, "").replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);

/** Índice gerado a partir dos ficheiros em disco. Um ficheiro ilegível é erro. */
function buildIndex() {
  const rankings = [];
  for (const f of fs.readdirSync(OUT_DIR).filter((x) => x.endsWith(".json")).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8"));
    rankings.push({ file: f, id: d.id, year: d.year, comite: d.comite, titulo: d.titulo, fecha: d.fecha ?? null, fechaIso: d.fechaIso ?? null, total: d.total, conLicencia: d.conLicencia ?? 0 });
  }
  rankings.sort((a, b) => b.year - a.year || String(a.comite).localeCompare(String(b.comite)) || a.titulo.localeCompare(b.titulo));
  return { generatedAt: new Date().toISOString(), source: "scripts/scrape-rfeg-ranking.js", total: rankings.length, rankings };
}

module.exports = { parseLista, parseLinhasAjax, juntarPdf, compacto, slug };

/* ─── main ─────────────────────────────────────────────────────── */
if (require.main === module) {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes("--" + f);
  const arg = (n, def) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def; };
  const DELAY = Math.max(500, parseInt(arg("delay", "1500"), 10));
  const years = arg("years", String(new Date().getUTCFullYear())).split(",").map((s) => s.trim()).filter(Boolean);
  const comites = arg("comites", "juvenil").split(",").map((s) => COMITES[s.trim().toLowerCase()] || Number(s)).filter(Boolean);
  const force = hasForceFlag();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pdfParse = require("pdf-parse/lib/pdf-parse.js");

  (async () => {
    console.log(`RFEG rankings — anos [${years}] comités [${comites.map((c) => NOME_COMITE[c] || c)}] pausa ${DELAY} ms`);
    const s = new Sessao();
    let gravados = 0, iguais = 0, falhas = 0, listasOk = 0;
    for (const year of years) {
      for (const comite of comites) {
        // 1. Lista (todas as páginas).
        const cards = [];
        let nonce = null;
        try {
          for (let pag = 1; pag <= 20; pag++) {
            const r = await s.get(`${LISTA}?rk_anio=${year}&rk_comite=${comite}${pag > 1 ? `&rk_pagina=${pag}` : ""}`);
            if (r.status !== 200) throw new Error(`lista HTTP ${r.status}`);
            const p = parseLista(r.body);
            nonce = nonce || p.nonce;
            cards.push(...p.cards);
            await sleep(DELAY);
            if (!p.seguinte || !p.cards.length) break;
          }
          if (!nonce) throw new Error("a página da lista mudou: sem eqfRankings.nonce");
          listasOk++;
        } catch (e) { falhas++; console.warn(`! ${year} ${NOME_COMITE[comite]}: ${e.message}`); continue; }
        console.log(`\n[${year} ${NOME_COMITE[comite] || comite}] ${cards.length} ranking(s)`);

        for (const c of cards) {
          const file = `${year}_${c.id}_${slug(c.titulo)}.json`;
          const fpath = path.join(OUT_DIR, file);
          if (has("skip-existing") && fs.existsSync(fpath)) { console.log(`   · ${c.titulo} — já existe`); continue; }
          try {
            // 2. Linhas (o «CSV» da página).
            const r = await s.post(AJAX, new URLSearchParams({ action: "eqf_rankings_csv", nonce, ranking_id: String(c.id) }).toString());
            await sleep(DELAY);
            let json = null;
            try { json = JSON.parse(r.body); } catch { /* resposta não-JSON */ }
            const players = parseLinhasAjax(json);
            if (!players || !players.length) { falhas++; console.warn(`   ! ${c.titulo} — sem linhas (HTTP ${r.status}); não gravado`); continue; }
            // 3. Licenças e idades do PDF (só os juvenis as têm).
            let conLicencia = 0;
            if (c.pdf) {
              try {
                const buf = await new Promise((resolve, reject) => {
                  const https = require("https");
                  https.get(c.pdf, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 60000 }, (res) => {
                    if (res.statusCode !== 200) { res.resume(); reject(new Error(`PDF HTTP ${res.statusCode}`)); return; }
                    const ch = []; res.on("data", (x) => ch.push(x)); res.on("end", () => resolve(Buffer.concat(ch)));
                  }).on("error", reject);
                });
                await sleep(DELAY);
                const d = await pdfParse(buf);
                conLicencia = juntarPdf(players, d.text);
              } catch (e) { console.warn(`   ! ${c.titulo} — PDF: ${e.message} (fica sem licenças)`); }
            }
            const rec = {
              id: c.id, year: Number(year), comite: NOME_COMITE[comite] || String(comite), titulo: c.titulo,
              fecha: c.fecha, fechaIso: dataIso(c.fecha), pdf: c.pdf, scrapedAt: new Date().toISOString(),
              total: players.length, conLicencia, players,
            };
            try {
              const ant = JSON.parse(fs.readFileSync(fpath, "utf8"));
              if (ant.fecha === rec.fecha && JSON.stringify(ant.players) === JSON.stringify(players)) { iguais++; console.log(`   = ${c.titulo} — igual`); continue; }
            } catch { /* novo */ }
            const w = writeJsonGuarded(fpath, rec, { count: (d) => d.players?.length ?? 0, maxDrop: 0.5, force, spaces: 0, label: file });
            if (w.written) { gravados++; console.log(`   • ${c.titulo} (${c.fecha}) — ${players.length} jogadores, ${conLicencia} com licença`); }
            else falhas++;
          } catch (e) { falhas++; console.warn(`   ! ${c.titulo}: ${e.message}`); }
        }
      }
    }
    if (gravados) writeJsonGuarded(INDEX, buildIndex(), { count: (d) => d.total, maxDrop: 0.5, force, spaces: 0, label: "rfeg-rankings-index.json" });
    console.log(`\n${gravados} gravado(s), ${iguais} igual(is), ${falhas} falha(s).`);
    if (!listasOk) process.exitCode = 1;
    else if (!gravados) process.exitCode = 2;
  })().catch((e) => { console.error("ERRO:", e.message); process.exitCode = 1; });
}
