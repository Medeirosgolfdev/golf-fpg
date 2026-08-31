/**
 * build-analise-percurso.js — regenera o bloco de dados `const P={...}` da
 * página estática public/analise-percurso-juniores.html a partir dos WHS
 * já scrapados (output/{fed}/whs.json) + players.json.
 *
 * A página era um snapshot manual (dados hardcoded, 2026-06-08). Este script
 * torna-a viva: o ROSTER (que jogadores, chave, cor, nome curto) continua
 * curado no próprio HTML — o script lê o `const P` existente para saber quem
 * incluir e apenas recalcula os campos derivados dos dados:
 *   series  — [idadeCompetitiva.fração, hcp] amostragem mensal (último
 *             new_handicap de cada mês; x = idade + (mês-0.5)/12)
 *   holes   — {idade: [n9H, n18H]} rondas por idade civil
 *   events  — {idade: [1R,2R,3R,4R+]} provas = rondas em dias estritamente
 *             consecutivos (+1 dia) com o mesmo nº de buracos
 *   hcpAge  — {idade: [hcp a 31/dez, Δ vs ano anterior]}
 *   best8   — {idade: média dos (até) 8 melhores score differentials da idade}
 *   cumR    — {idade: rondas acumuladas}
 *   intl    — {idade: [provas, rondas]} provas internacionais (score_origin
 *             "Intern": voltas homologadas fora de Portugal), agrupadas com a
 *             mesma regra dos `events` (dias consecutivos + mesmo nº buracos)
 *   eds     — {idade: n} voltas Extra Day Score (score_origin "EDS")
 *   cumIE   — {idade: [provasIntl, rondasIntl, eds]} acumulados até essa idade
 *   maxage, start (1.º registo WHS), hcp11/hcp12, hcpNow, esc
 *
 * Os blocos PATH (percurso até scratch) e AQ (Aquapor) são análises curadas —
 * NÃO são tocados. A data "Dados: WHS FPG, ..." e o "só tem dados até {mês}"
 * do parágrafo introdutório são actualizados.
 *
 * Idade competitiva = ano civil − ano de nascimento (convenção FPG de
 * escalões), igual à página.
 *
 * Uso:
 *   node scripts/build-analise-percurso.js           # regenera se houver mudanças
 *   node scripts/build-analise-percurso.js --check   # só compara (não escreve)
 *
 * Exit codes: 0 = actualizado, 2 = sem alterações, 1 = erro.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const HTML_PATH = path.join(ROOT, "public", "analise-percurso-juniores.html");
const PLAYERS_PATH = path.join(ROOT, "public", "data", "players.json");

const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MES_FULL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DAY_MS = 86400000;

const round1 = (v) => Math.round(v * 10) / 10;
const round3 = (v) => Math.round(v * 1000) / 1000;

/** Lê e ordena os registos WHS de um jogador (null se não existir ficheiro). */
function loadWhs(fed) {
  const p = path.join(ROOT, "output", String(fed), "whs.json");
  if (!fs.existsSync(p)) return null;
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  const recs = Array.isArray(raw) ? raw : raw.records || [];
  return recs
    .filter((r) => r.hcp_dateStr)
    .sort((a, b) =>
      a.hcp_dateStr.localeCompare(b.hcp_dateStr) ||
      String(a.mov_dateStr || "").localeCompare(String(b.mov_dateStr || "")) ||
      (a.id - b.id)
    );
}

/** Recalcula todos os campos derivados de um jogador. */
function buildPlayer(rows, birthYear) {
  const holes = {};   // idade → [n9, n18]
  const cumRByAge = {};
  const sds = {};     // idade → sgd[]
  const monthly = new Map(); // "age-month" → último new_handicap
  const lastHcpOfYear = {};  // idade → último new_handicap do ano civil

  for (const r of rows) {
    const y = +r.hcp_dateStr.slice(0, 4);
    const m = +r.hcp_dateStr.slice(5, 7);
    const age = y - birthYear;
    if (r.holes === 9 || r.holes === 18) {
      (holes[age] = holes[age] || [0, 0])[r.holes === 9 ? 0 : 1]++;
      cumRByAge[age] = (cumRByAge[age] || 0) + 1;
    }
    if (r.sgd != null) (sds[age] = sds[age] || []).push(r.sgd);
    if (r.new_handicap != null) {
      monthly.set(`${age}-${m}`, r.new_handicap);
      lastHcpOfYear[age] = r.new_handicap;
    }
  }

  // series — amostragem mensal
  const series = [...monthly.entries()]
    .map(([k, h]) => {
      const [age, m] = k.split("-").map(Number);
      return [round3(age + (m - 0.5) / 12), h];
    })
    .sort((a, b) => a[0] - b[0]);

  // events — dias estritamente consecutivos + mesmo nº de buracos
  const events = {};
  let cur = null;
  const pushEv = (c) => {
    const b = events[c.age] = events[c.age] || [0, 0, 0, 0];
    b[Math.min(c.n, 4) - 1]++;
  };
  for (const r of rows) {
    if (r.holes !== 9 && r.holes !== 18) continue;
    const t = Date.parse(r.hcp_dateStr);
    if (cur && r.holes === cur.holes && t - cur.last === DAY_MS) {
      cur.n++;
      cur.last = t;
    } else {
      if (cur) pushEv(cur);
      cur = { holes: r.holes, n: 1, last: t, age: (+r.hcp_dateStr.slice(0, 4)) - birthYear };
    }
  }
  if (cur) pushEv(cur);

  // intl / eds — exposicao internacional e voltas Extra Day Score.
  // "Intern" = volta homologada num torneio fora de Portugal; "EDS" = Extra Day
  // Score (volta de treino contada para o handicap). As provas internacionais
  // agrupam-se com a MESMA regra dos `events` (dias consecutivos + mesmo nº de
  // buracos) para que "3 provas / 9 rondas" signifique o mesmo nas duas tabelas.
  const intl = {};
  const eds = {};
  let ci = null;
  const pushIntl = (c) => {
    const b = intl[c.age] = intl[c.age] || [0, 0];
    b[0]++;
    b[1] += c.n;
  };
  for (const r of rows) {
    if (r.holes !== 9 && r.holes !== 18) continue;
    const age = (+r.hcp_dateStr.slice(0, 4)) - birthYear;
    if (r.score_origin === "EDS") eds[age] = (eds[age] || 0) + 1;
    if (r.score_origin !== "Intern") continue;
    const t = Date.parse(r.hcp_dateStr);
    if (ci && r.holes === ci.holes && t - ci.last === DAY_MS) {
      ci.n++;
      ci.last = t;
    } else {
      if (ci) pushIntl(ci);
      ci = { holes: r.holes, n: 1, last: t, age };
    }
  }
  if (ci) pushIntl(ci);

  // best8 — média dos (até) 8 melhores differentials da idade
  const best8 = {};
  for (const [age, list] of Object.entries(sds)) {
    const top = list.slice().sort((a, b) => a - b).slice(0, 8);
    best8[age] = round1(top.reduce((s, v) => s + v, 0) / top.length);
  }

  // hcpAge — hcp no fim de cada ano civil + Δ vs ano anterior com dados
  const hcpAge = {};
  const agesWithHcp = Object.keys(lastHcpOfYear).map(Number).sort((a, b) => a - b);
  let prevEnd = null;
  for (const age of agesWithHcp) {
    const end = round1(lastHcpOfYear[age]);
    hcpAge[age] = [end, prevEnd == null ? null : round1(end - prevEnd)];
    prevEnd = end;
  }

  // cumR — acumulado
  const cumR = {};
  let acc = 0;
  const agesPlayed = Object.keys(cumRByAge).map(Number).sort((a, b) => a - b);
  for (const age of agesPlayed) {
    acc += cumRByAge[age];
    cumR[age] = acc;
  }

  // cumIE — [provasIntl, rondasIntl, eds] acumulados até cada idade jogada.
  // Preenche TODAS as idades com rondas (mesmo as de zeros): "0" nessa idade é
  // informação — "—" ficaria a dizer que não jogou de todo. E garante que
  // `intl`/`eds` têm célula em todas essas idades, para a tabela não ter buracos.
  const cumIE = {};
  let ai = 0, ar = 0, ae = 0;
  for (const age of agesPlayed) {
    const iv = intl[age] || (intl[age] = [0, 0]);
    if (eds[age] === undefined) eds[age] = 0;
    ai += iv[0];
    ar += iv[1];
    ae += eds[age];
    cumIE[age] = [ai, ar, ae];
  }

  const first = rows.find((r) => r.new_handicap != null) || rows[0];
  const last = [...rows].reverse().find((r) => r.new_handicap != null);
  const firstY = +first.hcp_dateStr.slice(0, 4);
  const firstM = +first.hcp_dateStr.slice(5, 7);

  return {
    series,
    holes,
    events,
    hcpAge,
    best8,
    cumR,
    intl,
    eds,
    cumIE,
    maxage: agesWithHcp.length ? agesWithHcp[agesWithHcp.length - 1] : null,
    start: {
      label: `${MES_ABBR[firstM - 1]} ${firstY}`,
      age: firstY - birthYear,
      hcp: first.prev_handicap != null ? round1(first.prev_handicap) : null,
    },
    hcp11: hcpAge[11] ? hcpAge[11][0] : null,
    hcp12: hcpAge[12] ? hcpAge[12][0] : null,
  };
}

function main() {
  const checkOnly = process.argv.includes("--check");

  const html = fs.readFileSync(HTML_PATH, "utf8");
  const m = html.match(/^const P=(\{.*\});?\s*$/m);
  if (!m) {
    console.error("✖ Não encontrei a linha `const P={...}` no HTML — abortar.");
    process.exit(1);
  }
  const oldP = JSON.parse(m[1]);
  const players = JSON.parse(fs.readFileSync(PLAYERS_PATH, "utf8"));

  const newP = {};
  let latestDate = "";
  for (const [key, old] of Object.entries(oldP)) {
    const pj = players[old.fed];
    const dob = pj && pj.dob;
    const rows = loadWhs(old.fed);
    if (!rows || rows.length === 0 || !dob) {
      console.warn(`⚠ ${key} (fed ${old.fed}): sem whs.json ou sem dob — mantém dados antigos.`);
      newP[key] = old;
      continue;
    }
    const birthYear = +dob.slice(0, 4);
    const built = buildPlayer(rows, birthYear);
    const lastRec = rows[rows.length - 1];
    if (lastRec.hcp_dateStr > latestDate) latestDate = lastRec.hcp_dateStr;
    const lastHcp = [...rows].reverse().find((r) => r.new_handicap != null);
    // Ordem dos campos = ordem do ficheiro original (diffs limpos).
    newP[key] = {
      ...built,
      fed: old.fed,
      full: (pj && pj.name) || old.full,
      short: old.short,
      c: old.c,
      esc: (pj && pj.escalao) || old.esc,
      hcpNow: lastHcp ? round1(lastHcp.new_handicap) : old.hcpNow,
    };
  }

  let out = html.replace(m[0], `const P=${JSON.stringify(newP)};`);

  // Data dos dados + mês corrente no parágrafo introdutório.
  if (latestDate) {
    const [y, mo, d] = latestDate.split("-").map(Number);
    out = out.replace(/Dados: WHS FPG, \d+ \w+ \d{4}\./, `Dados: WHS FPG, ${d} ${MES_ABBR[mo - 1]} ${y}.`);
    out = out.replace(/O ano corrente \(\d{4}\) só tem dados até \w+\./, `O ano corrente (${y}) só tem dados até ${MES_FULL[mo - 1]}.`);
  }

  if (out === html) {
    console.log("Sem alterações.");
    process.exit(2);
  }
  if (checkOnly) {
    console.log("Há alterações (check-only, não escrevi).");
    process.exit(0);
  }
  // Escrita atómica (tmp + rename) para nunca deixar o HTML truncado.
  const tmp = HTML_PATH + ".tmp";
  fs.writeFileSync(tmp, out, "utf8");
  fs.renameSync(tmp, HTML_PATH);
  console.log(`✓ analise-percurso-juniores.html regenerado (${Object.keys(newP).length} jogadores, dados até ${latestDate}).`);
}

main();
