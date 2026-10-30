#!/usr/bin/env node
/**
 * scripts/scrape-rfeg-competiciones.js — provas juvenis da RFEG no site NOVO
 * (WordPress, Set/2026) + inscritos do GolfBox espanhol. 30/10/2026.
 *
 * Substitui os três scripts do site antigo (`CompetenciaPaginas/*.aspx`, hoje
 * redireccionam para a página inicial): discover-rfegolf-comps.js,
 * discover-rfegolf-calendar.js e scrape-rfegolf-node.js (em scripts/_archive).
 *
 * 1. Calendário: `rfegolf.es/competiciones/calendario-torneos?wpe_anyo=AAAA`
 *    (o site só lista o ano corrente e o seguinte). Cada linha traz data-id
 *    (id do post WordPress), título, sede, estado, data de início e comité.
 *    Fica o comité juvenil e os títulos juvenis de outros comités (Sub-NN,
 *    Infantil, Alevín…) — o mesmo critério do discovery antigo.
 * 2. Página da prova `rfegolf.es/competicion/<slug>`: nome, datas de inscrição
 *    e de competição, campo, e os ids GolfBox das fases (`data-cid`).
 * 3. GolfBox (`scores.golfbox.es`, os handlers do scrape-golfbox.js): o tipo
 *    da prova e os inscritos (`PlayersHandler/GetPlayers`) com licença
 *    (MemberID), data de nascimento completa, clube, HCP e país ISO-2. Os
 *    resultados dos Campeonatos de España continuam a vir do mitarjeta/LGS —
 *    os leaderboards do GolfBox da RFEG vêm vazios (medido: Sub-16 e Sub-18 2026).
 *
 * Grava no formato de sempre, `public/data/rfegolf-resultats/{compId}.json`,
 * para o índice, os gémeos LGS, os rivais e a /rfeg continuarem iguais:
 *   - prova que já existia (mesmo nome e ano, ou mesmo nome-base e mesmo dia de
 *     início) → actualiza esse ficheiro (mantém compId, palmarés e resultados);
 *   - prova nova → compId = id do post WordPress (6 dígitos, não colide com os
 *     CompId antigos, que acabam nos 5 dígitos).
 * Um ficheiro só perde inscritos com --force (writeJsonGuarded, perda > 50%).
 *
 * USO:
 *   node scripts/scrape-rfeg-competiciones.js                # ano corrente + seguinte
 *   node scripts/scrape-rfeg-competiciones.js --years 2027
 *   node scripts/scrape-rfeg-competiciones.js --dry          # mostra, não grava
 *
 * Exit: 0 gravou · 2 nada de novo · 1 erro (calendário ilegível ou tudo falhou).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Sessao, sleep, texto } = require("./lib/rfeg-web");
const { writeJsonGuarded } = require("./lib/shrink-guard");
const { fetchJsonp } = require("./scrape-golfbox");

const OUT_DIR = path.resolve(__dirname, "../public/data/rfegolf-resultats");
const SITE = "https://rfegolf.es";
const GB = "https://scores.golfbox.es";
const PAUSA_MS = 800;

const JUVENIL_RE = /\b(?:sub[\s-]?\d+|alev[ií]n|benjam[ií]n|infantil|cadete|junior|jovenes?|jeunes?|juvenil)\b/i;

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Nome sem o ano — para casar "… 2026" com o mesmo evento noutro formato. */
const nomeBase = (s) => norm(s).replace(/\b(19|20)\d{2}\b/g, " ").replace(/\s+/g, " ").trim();
const anoDe = (s) => { const m = /\b((?:19|20)\d{2})\b/.exec(s || ""); return m ? +m[1] : null; };
const isoDeDmy = (d) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const dmyDeGb = (s) => { const m = /^(\d{4})(\d{2})(\d{2})T/.exec(s || ""); return m && m[1] > "1900" ? `${m[3]}/${m[2]}/${m[1]}` : null; };

function categoriaDe(nome) {
  const m = /\bSub[\s-]?(\d+)\b/i.exec(nome || "");
  if (m) return "Sub-" + m[1];
  for (const [re, c] of [[/\binfantil\b/i, "Infantil"], [/\balev[ií]n\b/i, "Alevín"], [/\bbenjam[ií]n\b/i, "Benjamín"], [/\bcadete\b/i, "Cadete"], [/\bjuvenil\b/i, "Juvenil"], [/\bjunior\b/i, "Junior"]]) {
    if (re.test(nome || "")) return c;
  }
  return null;
}
function sexoDe(nome) {
  if (/\bmasculino\b.*\bfemenino\b|\bmixto\b/i.test(nome || "")) return "Mixto";
  if (/\bmasculino\b|\bboys\b/i.test(nome || "")) return "Masculino";
  if (/\bfemenino\b|\bgirls\b/i.test(nome || "")) return "Femenino";
  return null;
}
/** Tipo GolfBox → modalidade/estilo no vocabulário do microsite antigo. */
function modalidade(type) {
  switch (type) {
    case "StrokePlay": return { mode: "Individual", style: "Stroke Play" };
    case "TeamStrokePlay": return { mode: "Por Equipos", style: "Stroke Play" };
    case "MatchPlay": return { mode: "Individual", style: "Match Play" };
    case "RyderCup": return { mode: "Por Equipos", style: "Match Play" };
    default: return { mode: null, style: type || null };
  }
}

// ── 1) Calendário ────────────────────────────────────────────────────
function linhasCalendario(html) {
  const out = [];
  for (const m of html.matchAll(/<a href="([^"]+)" class="wpe-fila-evento"([^>]*)>([\s\S]*?)<\/a>/g)) {
    const a = { url: m[1] };
    for (const x of m[2].matchAll(/data-([a-z-]+)="([^"]*)"/g)) a[x[1]] = texto(x[2]);
    const t = /class="wpe-fila-titulo">([\s\S]*?)<\/span>/.exec(m[3]);
    a.nome = t ? texto(t[1]) : a.titulo;
    out.push(a);
  }
  return out;
}
const ehJuvenil = (l) => /juvenil/i.test(l.comite || "") || JUVENIL_RE.test(l.nome || "");

// ── 2) Página da prova ───────────────────────────────────────────────
function lerPagina(html) {
  const h1 = /<h1>([\s\S]*?)<\/h1>/.exec(html);
  const sede = /class="wpe-ficha-sede">([\s\S]*?)<\/p>/.exec(html);
  const datas = {};
  for (const m of html.matchAll(/<span>(Inscripción|Competición)<\/span><strong>([\s\S]*?)<\/strong>/g)) {
    const d = texto(m[2]).match(/\d{2}\/\d{2}\/\d{4}/g) || [];
    datas[m[1]] = { ini: d[0] || null, fim: d[1] || d[0] || null };
  }
  const cids = [...new Set([...html.matchAll(/data-cid="(\d+)"/g)].map((m) => +m[1]))];
  for (const m of html.matchAll(/competitionid%2F(\d+)/gi)) if (!cids.includes(+m[1])) cids.push(+m[1]);
  return {
    nome: h1 ? texto(h1[1]) : null,
    campo: sede ? texto(sede[1]) || null : null,
    competicao: datas["Competición"] || { ini: null, fim: null },
    inscricao: datas["Inscripción"] || null,
    cids,
  };
}

// ── 3) GolfBox ───────────────────────────────────────────────────────
/** Inscritos de todas as fases (dedup por licença, senão nome + nascimento).
 *  EntryStatus 0 = inscrito, 1 = aceite/jogou; os outros (3 = retirado) ficam
 *  de fora. ReserveListNo > 0 = lista de espera. Entradas de teste da RFEG
 *  (nascidas no próprio ano da prova, sem licença — ex. CE Sub-18 2026) saem. */
async function inscritosGolfBox(cids, anoProva) {
  const vistos = new Set();
  const admitidos = [], reservas = [];
  let tipo = null;
  for (const cid of cids) {
    if (!tipo) {
      try { tipo = ((await fetchJsonp(`${GB}/Handlers/CompetitionHandler/GetCompetition/CompetitionId/${cid}/?callback=x`)).CompetitionData || {}).Type || null; }
      catch (e) { /* sem tipo: fica null */ }
    }
    const data = await fetchJsonp(`${GB}/Handlers/PlayersHandler/GetPlayers/CompetitionId/${cid}/?callback=x`);
    for (const cls of Object.values((data && data.Classes) || {})) {
      for (const e of Object.values((cls && cls.Entries) || {})) {
        if (![0, 1].includes(e.EntryStatus)) continue;
        const dob = dmyDeGb(e.BirthDate);
        const anoNasc = dob ? +dob.slice(6) : null;
        if (anoProva && anoNasc && anoNasc > anoProva - 5) continue;
        const nome = [e.LastName, e.FirstName].map((s) => String(s || "").trim()).filter(Boolean).join(", ");
        if (!nome) continue;
        const lic = String(e.MemberID || "").trim() || null;
        const chave = lic || norm(nome) + "|" + (dob || "");
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        const hcp = e.HCP != null && e.HCP !== "" && isFinite(+e.HCP) ? Math.round(+e.HCP / 1000) / 10 : null;
        const rec = { pos: null, name: nome, licencia: lic, pais: e.Nationality || null, hcp, catEdad: null, sexo: null, club: e.ClubName || null, dob, estado: null };
        if (e.TeamName) rec.equipo = e.TeamName;
        ((e.ReserveListNo || 0) > 0 ? reservas : admitidos).push(rec);
      }
    }
    await sleep(PAUSA_MS);
  }
  admitidos.forEach((p, i) => { p.pos = i + 1; });
  reservas.forEach((p, i) => { p.pos = i + 1; });
  return { tipo, admitidos, reservas };
}

/** GetSchedule → [{ id, nome, iniIso }] (CompetitionData.S{ano}.Months.M{n}.Entries.E{id}). */
function agendaGolfBox(s) {
  const out = [];
  for (const S of Object.values((s && s.CompetitionData) || {})) {
    for (const M of Object.values(S.Months || {})) {
      for (const E of Object.values(M.Entries || {})) {
        const m = /^(\d{4})(\d{2})(\d{2})T/.exec(E.StartDate || "");
        if (E.ID && E.Name && m) out.push({ id: E.ID, nome: E.Name, iniIso: `${m[1]}-${m[2]}-${m[3]}` });
      }
    }
  }
  return out;
}

const VAZIAS = new Set(["de", "del", "la", "el", "y", "e", "en", "mem", "memorial", "campeonato", "espana"]);
const palavras = (s) => new Set(nomeBase(s).split(" ").filter((w) => w.length > 1 && !VAZIAS.has(w)));
/** A prova do calendário GolfBox com o mesmo dia de início (ou a 1 dia — o
 *  CE FFAA Infantil 2027 começa a 09/10 no GolfBox e a 10/10 na RFEG; o mesmo
 *  dia ganha) e o mesmo nome em palavras (≥ 75% das palavras do nome mais
 *  curto; a ordem não conta: «Infantil, Alevín y Benjamín» = «Benjamín, Alevín
 *  e Infantil»). Masculino e Femenino nunca casam um com o outro. */
function casarAgenda(agenda, nome, iniIso) {
  if (!iniIso) return null;
  const p = palavras(nome);
  const sexo = (w) => (w.has("masculino") ? "M" : w.has("femenino") || w.has("fem") ? "F" : null);
  const dia = (iso) => Date.parse(iso + "T12:00:00Z") / 86400000;
  let melhor = null, melhorNota = 0;
  for (const a of agenda) {
    const dif = Math.abs(dia(a.iniIso) - dia(iniIso));
    if (!(dif <= 1)) continue;
    const q = palavras(a.nome);
    if (sexo(p) && sexo(q) && sexo(p) !== sexo(q)) continue;
    const comuns = [...p].filter((w) => q.has(w)).length;
    // ≥ 2 palavras em comum: «P&P» some (letras soltas) e «Campeonato de España
    // Masculino P&P» ficava só com «masculino» — casava com o Match Cuadrangular.
    if (comuns < 2) continue;
    const nota = comuns / Math.max(1, Math.min(p.size, q.size)) - dif * 0.01;
    if (nota >= 0.75 && nota > melhorNota) { melhor = a; melhorNota = nota; }
  }
  return melhor;
}

// ── Ficheiros existentes ────────────────────────────────────────────
function indiceExistentes() {
  const out = [];
  for (const f of fs.readdirSync(OUT_DIR).filter((x) => /^\d+\.json$/.test(x))) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8")); }
    catch (e) { throw new Error(`rfegolf-resultats/${f} ilegível: ${e.message}`); }
    if (!j || !j.ok || !j.meta || !j.meta.name) continue;
    const ini = isoDeDmy(j.meta.dateStart);
    out.push({ compId: j.compId || +f.replace(".json", ""), wpId: j.wpId || null, nome: norm(j.meta.name), base: nomeBase(j.meta.name), ano: ini ? +ini.slice(0, 4) : anoDe(j.meta.name), ini, j });
  }
  return out;
}
function casar(existentes, wpId, nome, iniIso) {
  const ano = iniIso ? +iniIso.slice(0, 4) : anoDe(nome);
  return existentes.find((x) => x.wpId && x.wpId === wpId)
    || existentes.find((x) => x.nome === norm(nome) && x.ano === ano)
    || existentes.find((x) => iniIso && x.ini === iniIso && x.base === nomeBase(nome))
    || null;
}

const contarInscritos = (r) => (r && r.ok && r.inscritos && r.inscritos.counts ? r.inscritos.counts.admitidos + r.inscritos.counts.reservas : 0);
const vazio = () => ({ admitidos: [], reservas: [], bajas: [], invitados: [], noAdmitidos: [], provisional: [] });

async function main() {
  const args = process.argv.slice(2);
  const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const dry = args.includes("--dry");
  const anoAtual = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric" }).format(new Date()));
  const anos = getArg("--years") ? getArg("--years").split(",").map(Number) : [anoAtual, anoAtual + 1];

  const sess = new Sessao();
  const linhas = [];
  for (const ano of anos) {
    const r = await sess.get(`${SITE}/competiciones/calendario-torneos?wpe_anyo=${ano}`);
    const todas = r.status === 200 ? linhasCalendario(r.body) : [];
    // O calendário de um ano com provas nunca vem vazio — vazio = página mudou.
    if (!todas.length) { console.error(`::error::calendário ${ano}: HTTP ${r.status}, 0 linhas — a página mudou?`); process.exit(1); }
    const juv = todas.filter(ehJuvenil);
    console.log(`Calendário ${ano}: ${todas.length} provas, ${juv.length} juvenis`);
    linhas.push(...juv);
    await sleep(PAUSA_MS);
  }

  // Calendário do próprio GolfBox: tem os ids das provas antes de a página da
  // RFEG os ligar (2027 já lá estava a 30/10/2026, com as páginas sem fases).
  const agenda = [];
  for (const ano of anos) {
    try { agenda.push(...agendaGolfBox(await fetchJsonp(`${GB}/Handlers/ScheduleHandler/GetSchedule/CustomerId/2/Season/${ano}/CompetitionId/0/language/1034/?callback=x`))); }
    catch (e) { console.log(`  ⚠ calendário GolfBox ${ano}: ${e.message}`); }
    await sleep(PAUSA_MS);
  }

  const existentes = indiceExistentes();
  let gravados = 0, iguais = 0, falhas = 0;
  for (const l of linhas) {
    const wpId = +l.id;
    try {
      const p = await sess.get(l.url);
      if (p.status !== 200) throw new Error(`página HTTP ${p.status}`);
      const pg = lerPagina(p.body);
      const nome = pg.nome || l.nome;
      const iniIso = isoDeDmy(pg.competicao.ini) || l.inicio || null;
      const anoProva = iniIso ? +iniIso.slice(0, 4) : anoDe(nome);
      if (!pg.cids.length) {
        const a = casarAgenda(agenda, nome, iniIso);
        if (a) pg.cids.push(a.id);
      }
      const gb = pg.cids.length ? await inscritosGolfBox(pg.cids, anoProva) : { tipo: null, admitidos: [], reservas: [] };

      const ex = casar(existentes, wpId, nome, iniIso);
      const ant = ex ? ex.j : null;
      const compId = ex ? ex.compId : wpId;
      const antMeta = (ant && ant.meta) || {};
      // O microsite antigo era mais rico (ex. "Stroke Play + Match Play"; o tipo
      // GolfBox é só o da fase geral): o que já estava manda, o GolfBox completa.
      const gbMod = gb.tipo ? modalidade(gb.tipo) : { mode: null, style: null };
      const mode = antMeta.mode || gbMod.mode, style = antMeta.style || gbMod.style;
      // Inscritos: os do GolfBox quando os há; senão ficam os que já estavam.
      const temNovos = gb.admitidos.length + gb.reservas.length > 0;
      const inscritos = temNovos ? { ...vazio(), admitidos: gb.admitidos, reservas: gb.reservas } : ((ant && ant.inscritos) || vazio());
      inscritos.counts = Object.fromEntries(Object.keys(vazio()).map((k) => [k, (inscritos[k] || []).length]));

      const out = {
        compId,
        ok: true,
        scrapedAt: new Date().toISOString(),
        source: "rfeg-web",
        url: l.url,
        wpId,
        golfboxIds: pg.cids,
        meta: {
          ...antMeta,
          // Nome de um ficheiro que já existia fica (os gémeos LGS e os
          // agrupamentos da /rfeg casam por ele); só as provas novas o tiram daqui.
          name: antMeta.name || nome,
          dateStart: pg.competicao.ini || antMeta.dateStart || null,
          dateEnd: pg.competicao.fim || antMeta.dateEnd || null,
          course: pg.campo || l.sede || antMeta.course || null,
          mode, style,
          category: antMeta.category || categoriaDe(nome),
          sex: antMeta.sex || sexoDe(nome),
          estado: l.estado || null,
          entryStart: pg.inscricao ? pg.inscricao.ini : null,
          entryEnd: pg.inscricao ? pg.inscricao.fim : null,
        },
        inscritos,
        palmares: (ant && ant.palmares) || [],
        leaderboard: (ant && ant.leaderboard) || [],
        results: (ant && ant.results) || [],
      };
      const file = path.join(OUT_DIR, compId + ".json");
      const resumo = `${compId}${ex ? "" : " (nova)"} · ${nome} · ${out.meta.dateStart || "?"} · GolfBox ${pg.cids.join(",") || "—"} · ${gb.admitidos.length} inscritos${gb.reservas.length ? ` + ${gb.reservas.length} reservas` : ""}`;
      // Comparar sem o scrapedAt: sem mudanças não se regrava (exit 2 no workflow).
      const semData = (o) => JSON.stringify({ ...o, scrapedAt: null });
      if (ant && semData(ant) === semData(out)) { iguais++; console.log(`  = ${resumo}`); }
      else if (dry) { console.log(`  [dry] ${resumo}`); }
      else {
        const g = writeJsonGuarded(file, out, { count: contarInscritos, maxDrop: 0.5, spaces: 0, label: `rfegolf-resultats/${compId}.json` });
        if (g.written) { gravados++; console.log(`  ✓ ${resumo}`); } else iguais++;
      }
    } catch (e) {
      falhas++;
      console.log(`  ✗ ${l.nome} (${l.url}): ${e.message}`);
    }
    await sleep(PAUSA_MS);
  }
  console.log(`\nDone: gravados=${gravados} iguais=${iguais} falhas=${falhas} (de ${linhas.length})`);
  if (falhas && !gravados && !iguais) process.exitCode = 1;
  else if (!gravados) process.exitCode = 2;
}

if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });
module.exports = { linhasCalendario, lerPagina, ehJuvenil, casar, nomeBase, agendaGolfBox, casarAgenda };
