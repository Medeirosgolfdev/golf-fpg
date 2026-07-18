/**
 * build-sub12-ranking.js — Dados do Ranking Sub-12 (/FPG/rankingSub12)
 *
 * Cobre TODOS os torneios do ano onde jogam miúdos de Sub-12 ou abaixo:
 * Drive Challenge (todas as regiões), Campeonatos Nacionais de Jovens e de
 * Clubes, Greatgolf U12, Regionais, Aquapor, etc.
 *
 * ── Porque não usamos pontos por ±par (a fórmula do ranking PJA) ──
 * Os campos do Drive Challenge não são equivalentes: variam de 905 m / Slope 83
 * (Paredes) a 2013 m / Slope 123 (Porto Santo). Dar 25 pontos ao par nos dois
 * premiava quem calhou no campo fácil.
 *
 * ── Porque não usamos o SD oficial do WHS ──
 * Em voltas de 9 buracos o SD do WHS soma um termo esperado para os 9 não
 * jogados que DEPENDE DO HANDICAP do jogador. Nestes escalões o HCP vai de ~6
 * a 54, e esse termo passa a dominar: dois cartões iguais dariam SDs muito
 * diferentes só por causa do handicap.
 *
 * ── A métrica ──
 *   SD = (113 / Slope) × (Gross − CR)          … 18 buracos
 *   SD = (113 / Slope) × (Gross − CR) × 2      … 9 buracos, posto na escala de 18
 *
 * Desconta o campo, o tee e o rating M/F do mesmo tee (o mesmo tee tem CR/Slope
 * diferentes para masculino e feminino). É independente do handicap, portanto
 * comparável entre regiões que nunca se cruzam — que é para isso que um course
 * rating serve.
 *
 * ⚠ Usa GROSS, não AGS: o Adjusted Gross Score precisa do course handicap para
 * aplicar o net double bogey, o que reintroduziria o HCP. Em troca, um buraco
 * catastrófico pesa a sério — daí o cap opcional por buraco (--cap-over-par).
 *
 * CLI:
 *   node scripts/build-sub12-ranking.js                 # ano corrente
 *   node scripts/build-sub12-ranking.js --year 2025
 *   node scripts/build-sub12-ranking.js --cap-over-par 5   # limita cada buraco a par+5
 */
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const OUT_FILE = path.join(DATA_DIR, "sub12-ranking.json");

/** Idade máxima (à data do torneio) para entrar no ranking: Sub-12 e abaixo. */
const MAX_AGE = 12;

const argv = process.argv.slice(2);
const argOf = (flag, def) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const YEAR = argOf("--year", String(new Date().getFullYear()));
const CAP_OVER_PAR = argv.includes("--cap-over-par")
  ? parseInt(argOf("--cap-over-par", "5"), 10)
  : null;

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

/** Escalão FPG pela coorte de ano de nascimento. */
function escalaoAtYear(dob, ano) {
  const anoNasc = parseInt(String(dob).slice(0, 4), 10);
  const idade = parseInt(String(ano), 10) - anoNasc;
  if (isNaN(idade) || idade < 0) return null;
  if (idade <= 10) return "Sub 10";
  if (idade <= 12) return "Sub 12";
  return null;
}

/** Série da prova — define os chips de filtro na barra.
 *  ⚠ A FPG abrevia: "Drive Challe", "Drive Chall" — daí o `Chall\w*`. */
function serieOf(name) {
  const n = name || "";
  if (/Drive\s+Chall\w*/i.test(n)) return "Drive Challenge";
  if (/Drive\s+Tour/i.test(n)) return "Drive Tour";
  if (/Circuito\s+Aquapor/i.test(n)) return "Aquapor";
  if (/Campeonato\s+(Nacional|Regional)\s+de\s+(Jovens|Clubes)|Greatgolf|Campeonato\s+Regional\s+de\s+Jovens/i.test(n)) return "Nacional";
  // Provas de adultos onde caiu 1 ou 2 miúdos — o escalão joga de tees que não
  // são os dele. Separadas para poderem ficar de fora do ranking.
  if (/Campeonato\s+Nacional\s+(de\s+[23]|Absoluto)|Ordem\s+de\s+M[ée]rito|Lisbon\s+Cup|Campeonato\s+do\s+Clube|Campe[ãa]o\s+do\s+Clube|Savoy|Di[áa]rio\s+de\s+Not[íi]cias|Ta[çc]a\s|Spring\s+Cup|Torneio\s+de\s+Inverno|Restaura[çc][ãa]o|Aberto\s+do\s+Estoril|Fim\s+de\s+[ÉEe]poca/i.test(n)) return "Adultos";
  if (/Par ?3|Est[áa]gio/i.test(n)) return "Estágio";
  // Tudo o resto é competição juvenil: CityKids, Academia, Vila Sol Junior,
  // Estoril Junior Open, Junior Challenge, Machico Junior, Junior Major…
  return "Circuito juvenil";
}

/** Séries organizadas por zona — cada miúdo só disputa a sua região. */
const SERIES_REGIONAIS = new Set(["Drive Challenge", "Drive Tour"]);

/** Região da prova (null nas séries que não são regionais). */
function regiaoOf(name, serie) {
  if (!SERIES_REGIONAIS.has(serie)) return null;
  const n = name || "";
  if (/madeira|santo da serra|st[ºo]?\.? da serra|palheiro|porto santo/i.test(n)) return "Madeira";
  if (/norte|estela|vale pis[aã]o|vidago|paredes|barca/i.test(n)) return "Norte";
  if (/sul|laguna|vila sol|penina|pine cliffs|pinheiros altos|pinh\.|benamor/i.test(n)) return "Sul";
  if (/tejo|jamor|montado|belas|peru|mosteiro|oeiras|penha/i.test(n)) return "Tejo";
  if (/a[çc]ores|terceira|batalha/i.test(n)) return "Açores";
  return null;
}

/* ── Índice de jogadores (DOB / sexo / clube) ────────────────────── */
function buildPlayerIndex() {
  const dob = new Map(), sex = new Map(), club = new Map();
  const fed = readJsonSafe(path.join(DATA_DIR, "federados.json"));
  for (const p of (fed && fed.players) || []) {
    const code = String(p.federation_code || "");
    if (!code) continue;
    if (p.birthdate) dob.set(code, String(p.birthdate).slice(0, 10));
    if (p.gender) sex.set(code, p.gender);
    if (p.acronym || p.club_name) club.set(code, p.acronym || p.club_name);
  }
  const pl = readJsonSafe(path.join(DATA_DIR, "players.json")) || {};
  for (const [code, p] of Object.entries(pl)) {
    if (p && p.dob) dob.set(String(code), String(p.dob).slice(0, 10));
    if (p && p.sex) sex.set(String(code), p.sex);
    if (p && p.club) club.set(String(code), typeof p.club === "object" ? p.club.short : p.club);
  }
  return { dob, sex, club };
}

/* ── Torneios do ano (dedup por ccode|tcode, fica o mais completo) ── */
function loadTournaments() {
  const byKey = new Map();
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (!/^(pull-torneios\d+\.json|drive-data-\d{4}-\d{2}\.json|aquapor-data-\d{4}-\d{2}\.json|jovens_\d{4}\.json)$/.test(f)) continue;
    const d = readJsonSafe(path.join(DATA_DIR, f));
    for (const t of (d && d.tournaments) || []) {
      if (!(t.date || "").startsWith(YEAR)) continue;
      const key = `${t.ccode}|${t.tcode}`;
      const prev = byKey.get(key);
      if (!prev || (t.players || []).length > (prev.players || []).length) byKey.set(key, t);
    }
  }
  return [...byKey.values()];
}

/** Gross com cada buraco limitado a par+N (independente de handicap). */
function cappedGross(rs, fallbackGross) {
  if (CAP_OVER_PAR == null) return fallbackGross;
  const scores = rs.scores || [], pars = rs.pars || [];
  if (!scores.length || scores.length !== pars.length) return fallbackGross;
  let g = 0, jogados = 0;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i], par = pars[i];
    if (!s || !par) continue;
    g += Math.min(s, par + CAP_OVER_PAR);
    jogados++;
  }
  return jogados ? g : fallbackGross;
}

/* ── Agrupar os escalões do mesmo evento ─────────────────────────── */

/** Tira o sufixo de escalão do nome: "… Sub 12 H" → "…". */
function stripEscalaoSuffix(name) {
  return String(name || "").replace(/\s*[-–]?\s*Sub\s*\d+\s*(?:[HSMF])?\s*$/i, "").trim();
}

/**
 * Funde as entradas que são o MESMO evento partido por escalão/sexo — a FPG
 * regista um tcode por cada. O Campeonato Nacional de Jovens são três provas
 * (Sub 10 H, Sub 12 H, Sub 12 S) no mesmo dia e campo: em colunas separadas
 * cada uma ficava com dois terços das linhas vazias.
 *
 * Chave: ccode + data + nome sem o sufixo. Cada miúdo só joga um escalão, por
 * isso não há colisões (verificado: 0 repetidos).
 */
function mergeEscalaoSplits(tournaments) {
  const grupos = new Map();
  for (const t of tournaments) {
    const key = `${t.ccode}|${t.date}|${stripEscalaoSuffix(t.name)}`;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(t);
  }

  const out = [];
  for (const provas of grupos.values()) {
    if (provas.length === 1) { out.push(provas[0]); continue; }
    provas.sort((a, b) => String(a.tcode).localeCompare(String(b.tcode)));
    const byPlayer = new Map();
    for (const t of provas) {
      for (const p of t.players) {
        const prev = byPlayer.get(p.fedCode);
        if (prev && prev.roundScores.length >= p.roundScores.length) continue;
        byPlayer.set(p.fedCode, {
          ...p,
          roundScores: p.roundScores.map((r) => ({ ...r, _prova: t.name, _campo: t.campo })),
        });
      }
    }
    const base = provas[0];
    const players = [...byPlayer.values()];
    out.push({
      ...base,
      name: stripEscalaoSuffix(base.name),
      tcode: provas.map((t) => t.tcode).join("+"),
      rounds: Math.max(...players.map((p) => p.roundScores.length)),
      players,
      // Coluna agregada: as "rondas" podem vir de provas diferentes.
      _agregado: true,
      _escaloes: provas.map((t) => t.name),
    });
    console.log(`  ⊕ ${stripEscalaoSuffix(base.name)} — ${provas.length} escalões, ${players.length} miúdos`);
  }
  return out;
}

/* ── Agrupar séries de clube ─────────────────────────────────────── */

/**
 * Séries de clube que se repetem ao longo do ano no MESMO campo e com os
 * mesmos ratings — juntam-se numa coluna só, cada prova uma ronda.
 *
 * ⚠ Ao contrário do Drive Challenge (onde cada miúdo só joga a SUA região e
 * 10 provas colapsam em 1 ronda), aqui quem joga costuma jogar tudo — o
 * ganho é de legibilidade (menos cabeçalhos, provas relacionadas juntas), não
 * de largura.
 *
 * NÃO incluídas de propósito, apesar do nome sugerir série:
 *  • "Academia Junior 9 buracos" (Palheiro): 2º com 2366 m / CR 33-34 vs 3º
 *    com 1468 m / CR 29-32 — tees diferentes, não é a mesma prova.
 *  • "Circuito Junior Challenge" (Miramar): 2389 m / CR 33.2 vs 1402 m / CR 29.7.
 */
const SERIES_CLUBE = [
  { nome: "CityKids", campo: "Citygolf", rx: /CityKids/i },
  { nome: "Estoril Golf Junior Open", campo: "Estoril", rx: /ESTORIL\s+Golf\s+Junior\s+Open/i },
  { nome: "Vila Sol Junior Comp · 9 buracos", campo: "Vila Sol - Prestige", rx: /VILA\s+SOL\s+JUNIOR\s+COMP.*9\s*HOLES/i },
  { nome: "Vila Sol Junior Comp · 18 buracos", campo: "Vila Sol - Prime", rx: /VILA\s+SOL\s+JUNIOR\s+COMP/i, excluir: /9\s*HOLES/i },
  { nome: "Circuito Fim de Semana", campo: "Jamor", rx: /Circuito\s+Fim\s+de\s+Semana/i },
  // Mesma prova com dois nomes: mesmo campo, CR 30.3-30.6, Slope 114-115, 1475 m.
  { nome: "Sto da Serra Junior · 9 buracos", campo: "Santo da Serra - Serras", rx: /Cidade\s+de\s+Machico\s+Junior|NOS\s+Empresas\s+Junior/i },
  // Idem: Paredes-Aqueduto, CR 26.6-28, Slope 82-84, 894 m.
  { nome: "Paredes Junior · 9 buracos", campo: "Paredes - Aqueduto", rx: /Mc\s*Donald.*Junior\s+Challenge|Torneio\s+da\s+Academia\s+#1/i },
];

function mergeSeriesClube(tournaments) {
  const grupos = new Map();
  const resto = [];
  for (const t of tournaments) {
    const cfg = SERIES_CLUBE.find((c) => c.rx.test(t.name) && !(c.excluir && c.excluir.test(t.name)));
    if (!cfg) { resto.push(t); continue; }
    if (!grupos.has(cfg.nome)) grupos.set(cfg.nome, { cfg, provas: [] });
    grupos.get(cfg.nome).provas.push(t);
  }

  const out = [...resto];
  for (const { cfg, provas } of grupos.values()) {
    if (provas.length === 1) { out.push(provas[0]); continue; }
    provas.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const byPlayer = new Map();
    for (const t of provas) {
      for (const p of t.players) {
        let acc = byPlayer.get(p.fedCode);
        if (!acc) { acc = { ...p, roundScores: [] }; byPlayer.set(p.fedCode, acc); }
        for (const r of p.roundScores) {
          acc.roundScores.push({ ...r, round: acc.roundScores.length + 1, _prova: t.name, _campo: t.campo });
        }
      }
    }
    const players = [...byPlayer.values()].map((p) => {
      const grossTotal = p.roundScores.reduce((a, r) => a + r.gross, 0);
      const parSum = p.roundScores.reduce((a, r) => a + (r.parTotal || 0), 0);
      return { ...p, grossTotal, toPar: parSum ? grossTotal - parSum : null };
    });
    out.push({
      ...provas[0],
      name: cfg.nome,
      tcode: provas.map((t) => t.tcode).join("+"),
      campo: `${cfg.campo} · ${provas.length} provas`,
      rounds: Math.max(...players.map((p) => p.roundScores.length)),
      players,
      // Coluna agregada: as "rondas" podem vir de provas diferentes.
      _agregado: true,
      _provas: provas.map((t) => t.name),
    });
    console.log(`  ⊕ ${cfg.nome} — ${provas.length} provas, ${players.length} miúdos, ${Math.max(...players.map((p) => p.roundScores.length))} rondas`);
  }
  return out;
}

/* ── Agrupar Drive Challenge por edição ─────────────────────────── */

/** Nº da edição no nome: "1º Torneio Drive Challenge…" → "1º"; "Final…" → "Final".
 *  A FPG escreve de várias formas: "1º Torneio", "2 ºTorn.", "5º Torneio Drive
 *  Challe", "6º Torneio Drive Chall". */
function edicaoOf(name) {
  const m = String(name || "").match(/^\s*(\d+)\s*[ºo°]/);
  if (m) return `${m[1]}º`;
  if (/^\s*Final/i.test(name || "")) return "Final";
  return null;
}

/**
 * Junta as provas da MESMA edição de um circuito regional (Drive Challenge e
 * Drive Tour) numa coluna só: "1º Drive Challenge" leva todos os miúdos que
 * jogaram a 1ª prova da SUA região (e do seu escalão). Cada um só disputa a sua zona, por isso em
 * colunas separadas por região a tabela ficava quase toda vazia; o SD já
 * desconta a diferença de campo, portanto pô-los lado a lado é legítimo.
 *
 * Um jogador que tenha jogado em duas regiões na mesma edição (aconteceu uma
 * vez em 2026) fica com as duas voltas, como R1 e R2.
 */
function mergeRegionalEditions(tournaments) {
  const grupos = new Map();
  const resto = [];
  for (const t of tournaments) {
    const ed = SERIES_REGIONAIS.has(t.serie) ? edicaoOf(t.name) : null;
    if (!ed) { resto.push(t); continue; }
    // Chave por SÉRIE + edição: o 1º Drive Tour e o 1º Drive Challenge são
    // circuitos distintos (níveis diferentes) e não se misturam.
    const key = `${t.serie}|${ed}`;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(t);
  }

  const out = [...resto];
  for (const [key, provas] of grupos) {
    const [serie, ed] = key.split("|");
    provas.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    // Cada miúdo joga a prova da SUA região — essa vai para a coluna principal.
    // Os raros que disputaram uma segunda prova da mesma edição (5 casos em
    // 2026) vão para uma coluna "2ª prova" à parte, em vez de esticarem a
    // coluna principal com voltas que não são rondas do mesmo torneio.
    const porJogador = new Map();
    for (const t of provas) {
      for (const p of t.players) {
        let e = porJogador.get(p.fedCode);
        if (!e) { e = { base: p, provas: [] }; porJogador.set(p.fedCode, e); }
        e.provas.push({ t, rondas: p.roundScores });
      }
    }

    const níveis = [];   // níveis[0] = coluna principal, [1] = 2ª prova, …
    for (const { base, provas: lista } of porJogador.values()) {
      lista.forEach((entrada, i) => {
        if (!níveis[i]) níveis[i] = new Map();
        níveis[i].set(base.fedCode, {
          ...base,
          roundScores: entrada.rondas.map((r, k) => ({
            ...r, round: k + 1,
            _prova: entrada.t.name, _campo: entrada.t.campo, _regiao: entrada.t.regiao,
          })),
        });
      });
    }

    const sigla = serie === "Drive Tour" ? "dt" : "dc";
    níveis.forEach((mapa, i) => {
      const players = [...mapa.values()].map((p) => {
        const grossTotal = p.roundScores.reduce((a, r) => a + r.gross, 0);
        const parSum = p.roundScores.reduce((a, r) => a + (r.parTotal || 0), 0);
        return { ...p, grossTotal, toPar: parSum ? grossTotal - parSum : null };
      });
      const usadas = provas.filter((t) => players.some((p) => p.roundScores.some((r) => r._prova === t.name)));
      out.push({
        ccode: sigla.toUpperCase(), tcode: `${sigla}-${ed}${i ? `-x${i}` : ""}`,
        name: i === 0 ? `${ed} ${serie}` : `${ed} ${serie} · ${i + 1}ª prova`,
        date: provas[0].date,
        campo: `${usadas.length} prova${usadas.length === 1 ? "" : "s"} · ${[...new Set(usadas.map((t) => t.regiao).filter(Boolean))].join(", ")}`,
        serie, regiao: null,
        rounds: Math.max(...players.map((p) => p.roundScores.length)),
        players,
        _agregado: true,
        _edicao: ed,
        _provas: usadas.map((t) => ({ ccode: t.ccode, tcode: t.tcode, name: t.name, regiao: t.regiao })),
      });
      console.log(`  ⊕ ${ed} ${serie}${i ? ` · ${i + 1}ª prova` : ""} — ${usadas.length} provas, ${players.length} miúdos, ${Math.max(...players.map((p) => p.roundScores.length))} rondas`);
    });
  }
  out.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  return out;
}

/* ── main ────────────────────────────────────────────────────────── */
function main() {
  console.log(`\n🏅 RANKING SUB-12 ${YEAR}${CAP_OVER_PAR != null ? ` (cap par+${CAP_OVER_PAR})` : ""}\n`);

  const { dob, sex, club } = buildPlayerIndex();
  const tournaments = loadTournaments();
  const ano = parseInt(YEAR, 10);

  const out = [];
  let semRating = 0, voltasOk = 0;

  for (const t of tournaments) {
    const players = [];
    for (const p of t.players || []) {
      const fedCode = String(p.fedCode || p.fed || "");
      const d = fedCode ? dob.get(fedCode) : null;
      if (!d) continue;
      const esc = escalaoAtYear(d, (t.date || "").slice(0, 4) || ano);
      if (!esc) continue;   // Sub-14+ ou idade desconhecida

      const rondas = [];
      const rsList = (p.roundScores || []).length
        ? p.roundScores
        : [{ round: 1, gross: p.grossTotal, pars: p.par, scores: p.scores, courseRating: p.courseRating, slope: p.slope, teeName: p.teeName }];

      for (const rs of rsList) {
        const cr = rs.courseRating ?? p.courseRating;
        const sl = rs.slope ?? p.slope;
        const grossRaw = typeof rs.gross === "number" ? rs.gross : null;
        if (grossRaw == null || grossRaw <= 0 || grossRaw >= 900) continue;
        const nh = (rs.pars || []).filter((x) => x > 0).length || p.nholes || 18;
        if (!cr || !sl) { semRating++; continue; }

        const gross = cappedGross(rs, grossRaw);
        // Differential sem componente de handicap; 9 buracos → escala de 18.
        let sd = (113 / sl) * (gross - cr);
        if (nh <= 9) sd *= 2;
        sd = Math.round(sd * 10) / 10;

        const parTotal = (rs.pars || []).reduce((a, b) => a + (b || 0), 0) || p.parTotal || null;
        // Formato "fpg-pull" (roundScores) para a vista de ranking poder
        // consumir estes torneios exactamente como consome os do PJA.
        const metros = (rs.meters || []).reduce((a, b) => a + (Number(b) || 0), 0) || null;
        rondas.push({
          round: rs.round || rondas.length + 1,
          gross,
          parTotal,
          meters: metros,
          courseRating: cr,
          slope: sl,
          teeName: rs.teeName || p.teeName || null,
          holes: nh,
          sd,
        });
        voltasOk++;
      }
      if (!rondas.length) continue;

      const grossTotal = rondas.reduce((a, r) => a + r.gross, 0);
      const parSum = rondas.reduce((a, r) => a + (r.parTotal || 0), 0);
      players.push({
        fedCode, name: p.name, escalao: esc,
        // Região da prova, guardada NO JOGADOR: as colunas passam a ser
        // agregadas (ex: "3º Drive Challenge" junta as 5 zonas), por isso a
        // região deixa de ser propriedade da coluna e passa a ser de quem jogou.
        regiao: regiaoOf(t.name, serieOf(t.name)),
        sex: p.sex || sex.get(fedCode) || "",
        club: p.club || club.get(fedCode) || "",
        hcpExact: p.hcpExact ?? null,
        grossTotal,
        toPar: parSum ? grossTotal - parSum : null,
        parTotal: rondas[0] ? rondas[0].parTotal : null,
        nholes: rondas[0] ? rondas[0].holes : null,
        roundScores: rondas,
      });
    }
    if (!players.length) continue;

    out.push({
      ccode: t.ccode, tcode: t.tcode, name: t.name,
      date: t.date, campo: t.campo || "",
      serie: serieOf(t.name),
      regiao: regiaoOf(t.name, serieOf(t.name)),
      rounds: Math.max(...players.map((p) => p.roundScores.length)),
      players,
    });
  }

  const merged = mergeSeriesClube(mergeRegionalEditions(mergeEscalaoSplits(out)));

  const jogadores = new Map();
  for (const t of merged) for (const p of t.players) {
    const e = jogadores.get(p.fedCode) || { n: 0, esc: p.escalao };
    e.n += p.roundScores.length;
    jogadores.set(p.fedCode, e);
  }
  const com4 = [...jogadores.values()].filter((e) => e.n >= 4).length;

  writeJsonAtomic(OUT_FILE, {
    generated: new Date().toISOString(),
    year: YEAR,
    source: "build-sub12-ranking.js",
    metric: "differential sem componente de HCP: (113/Slope)×(Gross−CR), ×2 em 9 buracos",
    capOverPar: CAP_OVER_PAR,
    tournaments: merged,
  });

  const porSerie = {};
  for (const t of out) porSerie[t.serie] = (porSerie[t.serie] || 0) + 1;

  console.log(`  Torneios (colunas): ${merged.length} — ${out.length} provas antes de agrupar os circuitos regionais`);
  console.log(`   ↳ ${Object.entries(porSerie).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`  Voltas com CR+Slope: ${voltasOk}${semRating ? ` (${semRating} saltadas por falta de rating)` : ""}`);
  console.log(`  Miúdos: ${jogadores.size} (${com4} com ≥4 voltas)`);
  console.log(`\n  ✔ ${path.relative(ROOT, OUT_FILE)} (${(fs.statSync(OUT_FILE).size / 1024).toFixed(0)} KB)\n`);
}

main();
