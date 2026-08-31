/**
 * build-percurso-path.js — regenera o bloco `const PATH={...}` da página
 * estática public/analise-percurso-juniores.html a partir dos WHS scrapados
 * (output/{fed}/whs.json).
 *
 * O bloco era um snapshot curado à mão (pop / multi / med / min / miss). Este
 * script torna-o vivo E acrescenta o DETALHE por jogador — quantas vezes cada
 * um jogou cada circuito e em que datas — que a tabela mostra ao clicar numa
 * linha.
 *
 * A COORTE (os 18 rapazes que chegaram a scratch até aos 16) e os CIRCUITOS
 * (rótulo + padrão de nome de torneio) continuam curados aqui em cima — são
 * decisões editoriais, não dados. Tudo o resto é derivado.
 *
 * Uma "vez" = uma prova, agrupada com a MESMA regra da tabela de provas
 * (rondas em dias estritamente consecutivos + mesmo nº de buracos), para que
 * os números signifiquem o mesmo em toda a página.
 *
 * Campos por circuito:
 *   lab, pop (quantos da coorte o jogaram), N, multi (% de provas com 2+
 *   voltas), med (idade mediana de estreia), min (idade da estreia mais nova),
 *   miss (quem nunca o jogou), det (detalhe por jogador: [nome, nº provas,
 *   idade de estreia, [datas]])
 *
 * Uso:
 *   node scripts/build-percurso-path.js            # regenera se houver mudanças
 *   node scripts/build-percurso-path.js --check    # só compara (não escreve)
 *   node scripts/build-percurso-path.js --diff     # mostra o que muda vs curado
 *
 * Exit codes: 0 = actualizado, 2 = sem alterações, 1 = erro.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const HTML_PATH = path.join(ROOT, "public", "analise-percurso-juniores.html");
const DAY_MS = 86400000;

/**
 * A coorte curada: os 18 rapazes com historial que chegaram a scratch (hcp ≤ 0)
 * até aos 16 anos. `lab` é a grafia curta usada na página; `fed` foi resolvido
 * contra players.json (os dois nomes ambíguos — José Sousa e Tomás Araujo —
 * foram desempatados à mão: 34430 é "Afonso José Paim Sousa", outra pessoa, e
 * o Tomás Araújo n.2013 tem 13 anos, não pode ter chegado a scratch).
 */
const COHORT = [
  { lab: "Afonso Oliveira", fed: "40452" },
  { lab: "Afonso Rodrigues", fed: "31831" },
  { lab: "Alexander Amey", fed: "41294" },
  { lab: "Bernardo Pinheiro", fed: "40682" },
  { lab: "Diogo Rocha", fed: "34186" },
  { lab: "Francisco Reis", fed: "40534" },
  { lab: "Gabriel Sardo", fed: "37010" },
  { lab: "Guilherme Moreira", fed: "42205" },
  { lab: "José Sousa", fed: "40112" },
  { lab: "João Alves", fed: "39701" },
  { lab: "João Alvim", fed: "45340" },
  { lab: "Luis Silva", fed: "42845" },
  { lab: "Martim Johansen", fed: "40115" },
  { lab: "Miguel Silveira", fed: "35404" },
  { lab: "Pedro Machado", fed: "36638" },
  { lab: "Rodrigo Santos", fed: "37152" },
  { lab: "Santiago Dias", fed: "42908" },
  { lab: "Tomás Araujo", fed: "35849" },
];

/**
 * Os circuitos, por ordem de apresentação na página. `re` corre sobre o
 * `tourn_name` do WHS já normalizado (minúsculas, sem acentos).
 *
 * ⚠ A ordem importa para os EXCLUSIVOS: um torneio conta para o PRIMEIRO
 * circuito que casar. Sem isso o "Camp. Nacional Sub-10/12" também caía no
 * "Camp. Nacional de Jovens" e o "Circuito da Federação" na "Taça da
 * Federação".
 */
const CIRCUITS = [
  { lab: "Circuito Drive Tour", re: /drive tour/ },
  { lab: "Drive Challenge (iniciação, 9h)", re: /drive challenge/ },
  { lab: "Camp. Nacional de Clubes", re: /nacional de clubes|nacional clubes/ },
  { lab: "Camp. Nacional Absoluto (adultos)", re: /nacional absoluto|portuguese international amateur/ },
  { lab: "Taça da Federação (BPI)", re: /ta[cç]a d[ae] federa|\bbpi\b/ },
  { lab: "Circuito FPG", re: /circuito fpg|circuito da federa/ },
  { lab: "Camp. Nacional de Jovens", re: /nacional de jovens|nacional jovens/ },
  // Depois dos Jovens: um "Nacional de Jovens Sub 12" pertence aos Jovens; aqui
  // ficam só os Campeonatos Nacionais Sub-10 / Sub-12 próprios.
  // ⚠ O `\b` antes de "nacional" é essencial: sem ele, "InterNACIONAL" casava e
  // o "Miramar Internacional Open (sub10)" e o "Torneio Internacional Juvenil
  // Sub12" entravam aqui como se fossem Campeonatos Nacionais.
  { lab: "Camp. Nacional Sub-10/12", re: /\bnacional.*sub ?1[02]\b|sub ?1[02].*\bnacional/ },
  { lab: "Circuito Aquapor", re: /aquapor|aquap\b/ },
  { lab: "Taça Kendall", re: /kendall/ },
  // ⚠ "miramar" sozinho apanhava os torneios do CLUBE (Taça Praia de Miramar,
  // Escola de Golfe, Spring Cup) — 90 provas de 1 volta que afundavam o % de
  // provas multi-volta de 97% para 39%. Só o Internacional Open conta.
  { lab: "Miramar Int. Open", re: /miramar internacional|miramar int\.? open/ },
  { lab: "Taça Yeatman", re: /yeatman/ },
  { lab: "Lisbon Cup", re: /lisbon cup/ },
  // ⚠ A RFEG escreve "puntuable" e "puntable"; e muita prova espanhola não diz
  // "España" no nome (Copa de Andalucía, Copa S.M. El Rey) — daí a lista.
  { lab: "Espanha (puntuables/camp.)", re: /punt[au]ble|espana|andaluc|copa s\.?m\.? el rey|reyes de espana/ },
  { lab: "Camp. do Norte (regional)", re: /\bcamp\.? (do )?norte|campeonato do norte/ },
  { lab: "Taça José Guimarães", re: /jose guimaraes/ },
  { lab: "Taça Frank Gordon", re: /frank gordon/ },
  { lab: "World Kids Golf (intl, em PT)", re: /world kids/ },
  // O nome vem em três grafias e o campo (Chantilly) só aparece no
  // course_description — daí o matcher correr sobre nome + campo.
  { lab: "Int. França U14 - Chantilly (FR)", re: /chantilly|french international juniors? ?(amateur ?)?u ?14/ },
  { lab: "Greatgolf Junior", re: /greatgolf/ },
  { lab: "OM Júnior (Jamor)", re: /\bom junior|open.*masters junior/ },
  { lab: "Evian Juniors Cup (FR)", re: /evian/ },
  { lab: "Circuito Lisboa Jr", re: /circuito lisboa|lisboa jr/ },
  { lab: "Circuito Fim-de-Semana (Jamor)", re: /fim de semana|fim-de-semana/ },
  { lab: "PJA Tour", re: /\bpja\b/ },
];

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Actos administrativos que a FPG regista no WHS mas não são voltas jogadas. */
const ADMIN_RE = /atribui[cç][aã]o inicial|transferencia de clube|transfer[êe]ncia de clube|altera[cç][aã]o tipo de jogador|atribui[cç][aã]o inicial de handicap/;

function loadRounds(fed, birthYear) {
  const p = path.join(ROOT, "output", String(fed), "whs.json");
  if (!fs.existsSync(p)) return [];
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  const recs = Array.isArray(raw) ? raw : raw.records || [];
  return recs
    .filter((r) => r.hcp_dateStr && (r.holes === 9 || r.holes === 18))
    .filter((r) => !ADMIN_RE.test(norm(r.tourn_name)))
    .map((r) => ({
      date: r.hcp_dateStr,
      holes: r.holes,
      name: norm(r.tourn_name),
      // ⚠ Os internacionais chegam muitas vezes como "Away Internacional", com
      // o nome real só no campo ("Belgian International Golf Championship for
      // Boys", "Golf de Chantilly"). O campo é uma SEGUNDA tentativa, nunca a
      // primeira: procurá-lo à mistura com o nome faz um matcher de LOCAL
      // roubar provas de outros troféus jogados aí — a Taça Yeatman e a Taça
      // Frank Gordon disputam-se em Miramar e desapareciam para o "Miramar
      // Int. Open".
      nameCourse: norm(r.tourn_name + " " + (r.course_description || "")),
      raw: (r.tourn_name || "").trim(),
      course: (r.course_description || "").trim(),
      age: +r.hcp_dateStr.slice(0, 4) - birthYear,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Agrupa rondas em provas: dias estritamente consecutivos + mesmo nº buracos. */
function toEvents(rounds) {
  const out = [];
  let cur = null;
  for (const r of rounds) {
    const t = Date.parse(r.date);
    if (cur && r.holes === cur.holes && t - cur.last === DAY_MS) {
      cur.n++;
      cur.last = t;
    } else {
      if (cur) out.push(cur);
      cur = { holes: r.holes, n: 1, last: t, date: r.date, age: r.age, raw: r.raw, name: r.name, nameCourse: r.nameCourse, course: r.course };
    }
  }
  if (cur) out.push(cur);
  return out;
}

const median = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

function main() {
  const checkOnly = process.argv.includes("--check");
  const showDiff = process.argv.includes("--diff");

  const html = fs.readFileSync(HTML_PATH, "utf8");
  const m = html.match(/^const PATH=(\{.*\});?\s*$/m);
  if (!m) {
    console.error("✖ Não encontrei a linha `const PATH={...}` no HTML — abortar.");
    process.exit(1);
  }
  const oldPATH = JSON.parse(m[1]);
  const players = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "players.json"), "utf8"));

  // Um índice por jogador: circuito → provas desse jogador nesse circuito.
  const byPlayer = new Map();
  for (const c of COHORT) {
    const pj = players[c.fed];
    if (!pj || !pj.dob) {
      console.warn(`⚠ ${c.lab} (fed ${c.fed}): sem dob em players.json — excluído.`);
      continue;
    }
    const rounds = loadRounds(c.fed, +pj.dob.slice(0, 4));
    if (!rounds.length) {
      console.warn(`⚠ ${c.lab} (fed ${c.fed}): sem whs.json — excluído.`);
      continue;
    }
    const buckets = new Map();
    for (const ev of toEvents(rounds)) {
      const hit = CIRCUITS.find((ci) => ci.re.test(ev.name)) ||
                  CIRCUITS.find((ci) => ci.re.test(ev.nameCourse));
      if (!hit) continue;
      (buckets.get(hit.lab) || buckets.set(hit.lab, []).get(hit.lab)).push(ev);
    }
    byPlayer.set(c.lab, { fed: c.fed, buckets });
  }

  const N = byPlayer.size;
  const rows = [];
  for (const ci of CIRCUITS) {
    const det = [];
    const ages = [];
    let evTotal = 0;
    let evMulti = 0;
    const miss = [];
    for (const [lab, p] of byPlayer) {
      const evs = p.buckets.get(ci.lab);
      if (!evs || !evs.length) {
        miss.push(lab);
        continue;
      }
      const sorted = evs.slice().sort((a, b) => a.date.localeCompare(b.date));
      const first = sorted[0];
      ages.push(first.age);
      evTotal += sorted.length;
      evMulti += sorted.filter((e) => e.n >= 2).length;
      det.push([
        lab,
        p.fed,
        sorted.length,
        first.age,
        // [data, nº voltas, idade] por prova — o que a tabela mostra ao expandir.
        sorted.map((e) => [e.date, e.n, e.age]),
      ]);
    }
    if (!det.length) continue;
    det.sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0], "pt"));
    rows.push({
      lab: ci.lab,
      pop: det.length,
      N,
      multi: Math.round((evMulti / evTotal) * 100),
      med: median(ages),
      min: Math.min(...ages),
      miss,
      det,
    });
  }
  rows.sort((a, b) => b.pop - a.pop);

  const newPATH = { N, rows, cohort: [...byPlayer.keys()].sort((a, b) => a.localeCompare(b, "pt")) };

  if (showDiff) {
    const oldBy = new Map(oldPATH.rows.map((r) => [r.lab, r]));
    console.log("circuito".padEnd(36) + "pop      multi     med    min");
    for (const r of rows) {
      const o = oldBy.get(r.lab);
      const f = (n, ov) => (ov === undefined ? `${n}(novo)` : ov === n ? String(n) : `${ov}→${n}`);
      console.log(
        r.lab.padEnd(36) +
        f(r.pop, o && o.pop).padEnd(9) +
        f(r.multi, o && o.multi).padEnd(10) +
        f(r.med, o && o.med).padEnd(7) +
        f(r.min, o && o.min)
      );
    }
    for (const o of oldPATH.rows) if (!rows.some((r) => r.lab === o.lab)) console.log(`${o.lab.padEnd(36)}DESAPARECEU (curado tinha pop ${o.pop})`);
    process.exit(0);
  }

  const out = html.replace(m[0], `const PATH=${JSON.stringify(newPATH)};`);
  if (out === html) {
    console.log("Sem alterações.");
    process.exit(2);
  }
  if (checkOnly) {
    console.log("Há alterações (check-only, não escrevi).");
    process.exit(0);
  }
  const tmp = HTML_PATH + ".tmp";
  fs.writeFileSync(tmp, out, "utf8");
  fs.renameSync(tmp, HTML_PATH);
  console.log(`✓ bloco PATH regenerado (${N} jogadores, ${rows.length} circuitos).`);
}

main();
