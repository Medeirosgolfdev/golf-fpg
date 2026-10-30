#!/usr/bin/env node
/**
 * scripts/scrape-fgcv.js — provas juvenis da Federação Valenciana de Golf
 * (FGCV, golfcv.com). 30/10/2026.
 *
 * - Calendário: `golfcv.com/wp-json/bt_ws/v1/torneos_lt/?criterio=FIN|CURSO|PROXIMOS`
 *   (JSON: torneoid, torneo, fecha, fechafin, jornadas, campo, comitename…).
 *   Ficam os do comité «Juvenil».
 * - Inscritos: `wp-admin/admin-ajax.php?action=cargar_inscritos&id={torneoid}`
 *   (HTML: licença LV…, nome, nível C/I/A/B, sexo, handicap).
 * - Resultados: só em PDF, um por categoria e volta, na página
 *   `golfcv.com/ver-torneo/?torneoid=` («AM2.pdf» = Alevín Masculino após a 2.ª
 *   volta). São do Mastergolf impressos pelo PDFCreator: as fontes vêm sem
 *   tabela de caracteres e o texto sai cifrado — uma substituição fixa dentro
 *   de cada PDF. Decifra-se pela licença: a coluna Licencia tem «LV» + 8
 *   dígitos e os inscritos dão as licenças verdadeiras → o mapa glifo→dígito
 *   sai por correspondência (backtracking) e serve às voltas, que usam a
 *   mesma fonte. As colunas lêem-se pelas coordenadas (pdf-parse/pdf.js):
 *   Pos · Nombre · Licencia · Hex · NVH · Niv · Sex · Cat · Hpu · Tot · 1ª · 2ª…
 *   O Total (negrito) não se decifra — é a soma das voltas. O nome vem dos
 *   inscritos pela licença. Um PDF cujas licenças não batam com os inscritos
 *   (ou com voltas impossíveis) é recusado, nunca adivinhado.
 *
 * Grava `public/data/fgcv/{torneoid}.json` no formato do microsite antigo da
 * RFEG (`results` por categoria + `inscritos`) — o que a /rfeg já desenha
 * (rfegolfToFPGTournament).
 *
 * USO:
 *   node scripts/scrape-fgcv.js                 # juvenis desde o ano passado
 *   node scripts/scrape-fgcv.js --ids 2694,2672 # só estes
 *   node scripts/scrape-fgcv.js --desde 2024
 * Exit: 0 gravou · 2 nada de novo · 1 erro (tudo falhou).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const pdf = require("pdf-parse");
const { writeJsonGuarded } = require("./lib/shrink-guard");

const OUT_DIR = path.resolve(__dirname, "../public/data/fgcv");
const BASE = "https://golfcv.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PAUSA_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pedir(url, binario = false, saltos = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": UA, "Accept-Encoding": "identity" }, timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && saltos > 0) {
        res.resume();
        resolve(pedir(new URL(res.headers.location, url).toString(), binario, saltos - 1));
        return;
      }
      const c = [];
      res.on("data", (x) => c.push(x));
      res.on("end", () => {
        const b = Buffer.concat(c);
        if (res.statusCode !== 200) reject(new Error(`HTTP ${res.statusCode} ${url}`));
        else resolve(binario ? b : b.toString("utf8"));
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout " + url)));
  });
}

const ENT = { amp: "&", quot: '"', nbsp: " ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", Ntilde: "Ñ", euro: "€" };
const texto = (s) => String(s || "").replace(/<[^>]+>/g, " ")
  .replace(/&(#\d+|[a-z]+);/gi, (m, e) => (e[0] === "#" ? String.fromCharCode(+e.slice(1)) : ENT[e] ?? m))
  .replace(/\s+/g, " ").trim();
const dmy = (iso) => (iso ? iso.split("-").reverse().join("/") : null);

const NIVEL = { B: "Benjamín", A: "Alevín", I: "Infantil", C: "Cadete", J: "Junior" };
/** Fora: o Circuito Xiquets (iniciação, escalões muito novos — pedido da
 *  Mariana), as «Expedición» (deslocações da selecção a provas nacionais, não
 *  são provas da FGCV) e a gala. */
const FORA = /xiquets|expedici[oó]n|\bgala\b/i;
const CATEG = { B: "Benjamín", A: "Alevín", I: "Infantil", C: "Cadete", J: "Junior" };
/** «A» → Alevín; «S16» (dos ficheiros «SUB16 M2.pdf») → Sub-16. */
const catNome = (c) => CATEG[c] || (/^S(\d+)$/.exec(c) ? "Sub-" + c.slice(1) : c);

// ── Inscritos (HTML) ──────────────────────────────────────────────────
function lerInscritos(html) {
  const out = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/g) || []) {
    const td = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => texto(m[1]));
    // Fecha/Hora · Licencia · Apellidos y Nombre · Nivel · Sexo · Cuota · Estado · Hándicap
    const i = td.findIndex((x) => /^LV\d{8}$/.test(x));
    if (i < 0) continue;
    const hcp = parseFloat(String(td[i + 6] || "").replace(",", "."));
    out.push({
      name: td[i + 1], licencia: td[i], pais: "ES",
      hcp: Number.isFinite(hcp) ? hcp : null,
      catEdad: NIVEL[(td[i + 2] || "").toUpperCase()] || null,
      sexo: /^[MF]$/i.test(td[i + 3] || "") ? td[i + 3].toUpperCase() : null,
      club: null, dob: null, estado: null,
    });
  }
  return out;
}

// ── PDF de classificação ──────────────────────────────────────────────
async function itensPdf(buf) {
  const itens = [];
  await pdf(buf, {
    pagerender: async (pg) => {
      const tc = await pg.getTextContent();
      const p = pg.pageIndex;
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        itens.push({ s: it.str, x: it.transform[4], y: it.transform[5], p });
      }
      return "";
    },
  });
  return itens;
}

/** Mapa glifo→dígito a partir dos códigos de licença cifrados (8 glifos cada).
 *  Tolera até `maxFalhas` licenças que não estão nos inscritos (suplentes,
 *  inscrições tardias): essas saltam-se e decifram-se depois com o mapa. */
function resolverDigitos(cifradas, licencas, maxFalhas = 0) {
  const alvos = licencas.map((l) => l.slice(2));
  const ord = [...cifradas].sort((a, b) => new Set(b).size - new Set(a).size);   // mais glifos distintos primeiro
  let passos = 0;
  function rec(i, mapa, usados, falhas) {
    if (++passos > 2e6) return null;   // sem solução razoável — desistir
    if (i === ord.length) return mapa;
    const e = ord[i];
    for (const d of alvos) {
      const m2 = { ...mapa }; const u2 = new Set(usados); let ok = true;
      for (let k = 0; k < 8; k++) {
        const g = e[k], c = d[k];
        if (m2[g] != null) { if (m2[g] !== c) { ok = false; break; } }
        else { if (u2.has(c)) { ok = false; break; } m2[g] = c; u2.add(c); }
      }
      if (ok) { const r = rec(i + 1, m2, u2, falhas); if (r) return r; }
    }
    return falhas < maxFalhas ? rec(i + 1, mapa, usados, falhas + 1) : null;
  }
  return rec(0, {}, new Set(), 0);
}

/** PDFs em texto normal (2025: «LV06943999  FUERTES BURDEOS, MAXIMO» numa só
 *  célula): a licença lê-se directamente; as voltas são os últimos números da
 *  linha. null se o PDF não for deste tipo. */
function lerClassificacaoTexto(itens, nVoltas) {
  const lics = itens.filter((it) => /^LV\d{8}\b/.test(it.s.trim()));
  if (lics.length < 2) return null;
  // Colunas pelo cabeçalho: «Tot» e as voltas «1ª», «2ª»… Sem colunas de volta
  // (prova de 1 volta), a volta é o próprio Total.
  const hTot = itens.find((it) => /^Tot(al)?\b/i.test(it.s.trim()));   // «Tot» (2026) ou «Total» (2025)
  const hVoltas = itens.filter((it) => /^\d\s*ª$/.test(it.s.trim())).sort((a, b) => a.x - b.x);
  if (!hTot) throw new Error("PDF em texto sem cabeçalho «Tot»");
  const naColuna = (linha, x) => {
    const c = linha.filter((it) => Math.abs(it.x - x) < 14).map((it) => it.s.trim()).find((s) => /^\d{2,3}$/.test(s));
    return c ? +c : null;
  };
  const linhas = [];
  for (const L of lics) {
    const daLinha = itens.filter((it) => it.p === L.p && Math.abs(it.y - L.y) < 2);
    const pos = daLinha.filter((it) => it.x < L.x).map((it) => it.s.trim()).find((s) => /^\d+$/.test(s));
    let rounds;
    if (hVoltas.length) rounds = hVoltas.slice(0, nVoltas).map((h) => naColuna(daLinha, h.x));
    else rounds = nVoltas === 1 ? [naColuna(daLinha, hTot.x)] : [];
    if (rounds.some((v) => v == null)) rounds = [];   // N.P. / retirado
    linhas.push({ pos: pos ? +pos : null, licencia: L.s.trim().slice(0, 10), rounds, y: L.y, p: L.p });
  }
  return linhas.sort((a, b) => a.p - b.p || b.y - a.y);
}

/** Lê uma classificação: devolve [{pos, licencia, rounds}] ou lança erro. */
async function lerClassificacao(buf, inscritos, nVoltas) {
  const itens = await itensPdf(buf);
  const emTexto = lerClassificacaoTexto(itens, nVoltas);
  if (emTexto) return { linhas: validar(emTexto, inscritos) };
  // A coluna da licença: textos de 10 glifos com o mesmo prefixo de 2 («LV»).
  const contagem = new Map();
  for (const it of itens) if (it.s.length === 10) contagem.set(it.s.slice(0, 2), (contagem.get(it.s.slice(0, 2)) || 0) + 1);
  const [prefixo] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  if (!prefixo) throw new Error("sem coluna de licenças");
  const licItens = itens.filter((it) => it.s.length === 10 && it.s.startsWith(prefixo));
  const licencas = inscritos.map((p) => p.licencia);
  const cifradas = [...new Set(licItens.map((it) => it.s.slice(2)))];
  const mapa = resolverDigitos(cifradas, licencas, Math.floor(cifradas.length * 0.1));
  if (!mapa) throw new Error("as licenças do PDF não batem com os inscritos");
  const dec = (s) => [...s].map((c) => mapa[c] ?? "?").join("");
  const xLic = licItens[0].x;
  // Colunas à direita da licença (centros arredondados a 4 pt); as últimas
  // nVoltas são as voltas e a anterior o Total.
  const xsDir = [...new Set(itens.filter((it) => it.x > xLic + 20).map((it) => Math.round(it.x / 4) * 4))].sort((a, b) => a - b);
  const linhas = [];
  for (const L of licItens) {
    const daLinha = itens.filter((it) => it.p === L.p && Math.abs(it.y - L.y) < 2);
    const lic = "LV" + dec(L.s.slice(2));
    const pos = daLinha.filter((it) => it.x < L.x - 200).map((it) => dec(it.s)).find((s) => /^\d+$/.test(s));
    // Voltas: os textos da linha à direita, por ordem de x, a partir da coluna do Total.
    const dir = daLinha.filter((it) => it.x > xLic + 20).sort((a, b) => a.x - b.x);
    const nums = dir.slice(-nVoltas).map((it) => dec(it.s));
    const rounds = nums.every((n) => /^\d{2,3}$/.test(n)) && dir.length >= nVoltas + 1 ? nums.map(Number) : [];
    linhas.push({ pos: pos ? +pos : null, licencia: lic, rounds, y: L.y, p: L.p });
  }
  linhas.sort((a, b) => a.p - b.p || b.y - a.y);
  return { linhas: validar(linhas, inscritos), xsDir };
}

/** Licenças reais (≥ 90% nos inscritos), voltas plausíveis e mais de 1 jogador. */
function validar(linhas, inscritos) {
  if (linhas.length < 2) throw new Error("classificação com menos de 2 jogadores");
  const conhecidas = new Set(inscritos.map((p) => p.licencia));
  const fora = linhas.filter((l) => !conhecidas.has(l.licencia)).length;
  // Até 15%: jogadores inscritos noutra prova do mesmo fim-de-semana (ex. a de 9 buracos).
  if (fora > Math.max(2, linhas.length * 0.15)) throw new Error(`${fora}/${linhas.length} licenças fora dos inscritos`);
  const voltas = linhas.flatMap((l) => l.rounds);
  if (!voltas.length) throw new Error("sem voltas legíveis");
  if (voltas.some((v) => v < 18 || v > 200)) throw new Error("voltas impossíveis — mapa de dígitos errado?");
  return linhas;
}

// ── Torneio ───────────────────────────────────────────────────────────
async function lerTorneio(t, nomesGlobais = new Map()) {
  const id = t.torneoid;
  const pagina = await pedir(`${BASE}/ver-torneo/?torneoid=${id}`); await sleep(PAUSA_MS);
  const inscritos = lerInscritos(await pedir(`${BASE}/wp-admin/admin-ajax.php?action=cargar_inscritos&id=${id}&numporequipo=1`)); await sleep(PAUSA_MS);
  // PDFs de classificação: «AM2.pdf», «IF1.pdf», «B2.pdf», «AF.pdf» (sem nº =
  // volta única), «SUB16 M2.pdf»… → a última volta de cada categoria. Os «A IND»
  // do Circuito Xiquets (iniciação) e as listas «HCP», «ADM», «SALIDAS» não entram.
  const pdfs = new Map();
  const juntar = (url, cat, sx, volta) => {
    const k = (cat + (sx || "")).toUpperCase();
    if (!pdfs.has(k) || pdfs.get(k).volta < volta) pdfs.set(k, { url, cat: cat.toUpperCase(), sx: (sx || "").toUpperCase(), volta });
  };
  for (const m of pagina.matchAll(/href='([^']+\/([ABICJ])([MF])?(\d)?\.pdf)'/gi)) juntar(m[1], m[2], m[3], m[4] ? +m[4] : 1);
  for (const m of pagina.matchAll(/href='([^']+\/SUB\s?(\d{2})\s?([MF])(\d)?\.pdf)'/gi)) juntar(m[1], "S" + m[2], m[3], m[4] ? +m[4] : 1);
  const results = [], avisos = [];
  const porLic = new Map(inscritos.map((p) => [p.licencia, p]));
  for (const [k, f] of pdfs) {
    try {
      const buf = await pedir(encodeURI(decodeURI(f.url)), true); await sleep(PAUSA_MS);
      // O dígito do ficheiro é a volta/jornada publicada; num torneio de 1
      // jornada (PVACE 9 e 10 ao fim-de-semana) há só uma volta por PDF.
      f.volta = Math.min(f.volta, Number(t.jornadas) || f.volta);
      const { linhas } = await lerClassificacao(buf, inscritos, f.volta);
      const players = linhas.map((l) => ({
        pos: l.pos,
        name: (porLic.get(l.licencia) || {}).name || nomesGlobais.get(l.licencia) || l.licencia,
        licencia: l.licencia,
        toPar: null,
        rounds: l.rounds,
        total: l.rounds.length === f.volta ? l.rounds.reduce((a, b) => a + b, 0) : null,
      }));
      // Empatados: o PDF deixa a posição em branco — herda a de cima (mesmo total).
      for (let i = 1; i < players.length; i++) {
        const p = players[i], a = players[i - 1];
        if (p.pos == null && p.total != null && p.total === a.total) p.pos = a.pos;
      }
      results.push({
        label: `${catNome(f.cat)}${f.sx === "M" ? " Masculino" : f.sx === "F" ? " Femenino" : ""} — ${f.volta}.ª volta`,
        sexo: f.sx || null, categoria: catNome(f.cat), pdfUrl: f.url,
        nRounds: f.volta, players,
      });
    } catch (e) {
      avisos.push(`${k}: ${e.message}`);
    }
  }
  const counts = { admitidos: inscritos.length, reservas: 0, bajas: 0, invitados: 0, noAdmitidos: 0, provisional: 0 };
  return {
    out: {
      compId: +id, ok: true, scrapedAt: new Date().toISOString(), source: "fgcv",
      url: `${BASE}/ver-torneo/?torneoid=${id}`,
      meta: {
        name: texto(t.torneo), dateStart: dmy(t.fecha), dateEnd: dmy(t.fechafin || t.fecha),
        course: texto(t.campo) || null, mode: "Individual", style: null, category: null,
        sex: t.sexo === "M" ? "Masculino" : t.sexo === "F" ? "Femenino" : null,
        federation: "Federación de Golf de la Comunitat Valenciana", codigo: t.codtorneofed || null,
      },
      inscritos: { admitidos: inscritos, reservas: [], bajas: [], invitados: [], noAdmitidos: [], provisional: [], counts },
      palmares: [], leaderboard: [], results,
    },
    avisos,
  };
}

const contar = (r) => (r && r.ok ? (r.inscritos.admitidos.length + r.results.reduce((a, g) => a + g.players.length, 0)) : 0);

/** Já está completo? Lido depois do último dia e com resultados (ou sem PDFs). */
function completo(file, fimIso) {
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    return !!fimIso && String(d.scrapedAt || "").slice(0, 10) > fimIso && (d.results || []).length > 0;
  } catch { return false; }
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const ids = getArg("--ids") ? new Set(getArg("--ids").split(",")) : null;
  const anoAtual = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric" }).format(new Date()));
  const desde = Number(getArg("--desde") || anoAtual - 1);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const todos = new Map();
  for (const crit of ["FIN", "CURSO", "PROXIMOS"]) {
    const r = JSON.parse(await pedir(`${BASE}/wp-json/bt_ws/v1/torneos_lt/?criterio=${crit}&conlimit=si&nomas=si&ordentipo=desc&limite=1000&lang=0`));
    if (!Array.isArray(r)) throw new Error(`calendário ${crit}: resposta inesperada`);
    for (const t of r) todos.set(String(t.torneoid), t);
    await sleep(PAUSA_MS);
  }
  if (!todos.size) { console.error("::error::calendário FGCV vazio — a API mudou?"); process.exit(1); }
  const alvo = [...todos.values()].filter((t) => (ids ? ids.has(String(t.torneoid))
    : /juvenil/i.test(t.comitename || "") && Number(t.anyo) >= desde && !FORA.test(t.torneo || "")));
  console.log(`FGCV: ${todos.size} torneios no calendário, ${alvo.length} juvenis desde ${desde}`);

  const hoje = new Date().toISOString().slice(0, 10);
  // Nomes por licença de todas as provas valencianas já lidas (para quem jogou
  // uma classificação estando inscrito noutra prova do mesmo fim-de-semana).
  const nomesGlobais = new Map();
  for (const f of fs.readdirSync(OUT_DIR).filter((x) => /^\d+\.json$/.test(x))) {
    try { for (const q of JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8")).inscritos.admitidos) nomesGlobais.set(q.licencia, q.name); }
    catch (e) { throw new Error(`fgcv/${f} ilegível: ${e.message}`); }
  }
  let gravados = 0, iguais = 0, falhas = 0, saltados = 0;
  for (const t of alvo.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))) {
    const file = path.join(OUT_DIR, `${t.torneoid}.json`);
    if (!ids && completo(file, t.fechafin || t.fecha)) { saltados++; continue; }
    if (!ids && String(t.fecha) > hoje && fs.existsSync(file) && (Date.now() - fs.statSync(file).mtimeMs) < 6 * 86400000) { saltados++; continue; }
    try {
      const { out, avisos } = await lerTorneio(t, nomesGlobais);
      for (const q of out.inscritos.admitidos) nomesGlobais.set(q.licencia, q.name);
      const nRes = out.results.reduce((a, g) => a + g.players.length, 0);
      const g = writeJsonGuarded(file, out, { count: contar, maxDrop: 0.5, spaces: 0, label: `fgcv/${t.torneoid}.json` });
      if (g.written) gravados++; else iguais++;
      console.log(`  ${g.written ? "✓" : "="} ${t.torneoid} ${t.fecha} ${texto(t.torneo).slice(0, 60)} — ${out.inscritos.admitidos.length} inscritos, ${out.results.length} classificações (${nRes} jogadores)${avisos.length ? " ⚠ " + avisos.join("; ") : ""}`);
    } catch (e) {
      falhas++;
      console.log(`  ✗ ${t.torneoid} ${texto(t.torneo)}: ${e.message}`);
    }
  }
  console.log(`\nDone: gravados=${gravados} iguais=${iguais} saltados=${saltados} falhas=${falhas}`);
  if (falhas && !gravados && !iguais) process.exitCode = 1;
  else if (!gravados) process.exitCode = 2;
}

if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });
module.exports = { lerInscritos, resolverDigitos, lerClassificacao };
