"use strict";
/**
 * scripts/lib/pdf-classificacoes.js — classificações em PDF das federações
 * regionais espanholas (País Basco, Navarra, Rioja, Castela-La Mancha).
 * 30/10/2026; antes vivia no scrape-fvg.js.
 *
 * Lê os PDFs pelas coordenadas do texto (pdf-parse, pagerender): o cabeçalho
 * da tabela dá as colunas e cada valor vai para a coluna mais próxima.
 * Formatos com colunas reconhecidos:
 *   A) «POS LICENCIA CATEG. NOMBRE TOT STRS S HCE HCJ R1…R4» (FVG) e o mesmo sem
 *      LICENCIA (Rioja Alta) — R1..R4 em ±par; o par da volta sai de
 *      (STRS − TOT) / nº de voltas.
 *   B) «Pos Licencia Nombre Hp Nivel Sex Total» e «Pos Nombre Licencia Hex NVH
 *      Niv Sex Cat. Hpu Tot [1ª 2ª]» (clubes bascos e navarros) — o total é o
 *      último número (ou a coluna Tot quando há voltas 1ª/2ª).
 *   C) «Puesto Jugador Licencia Club HEX NHEX HPU Cat. Género Golpes» e com
 *      «1º Vuelta 2º Vuelta Total» (Castela-La Mancha) — cada volta é «+6 (78)»:
 *      as pancadas são os números entre parênteses.
 */
const pdf = require("pdf-parse");

// ── PDF → linhas com coordenadas ──────────────────────────────────────
async function itensPdf(buf) {
  const itens = [];
  await pdf(buf, {
    pagerender: async (pg) => {
      const tc = await pg.getTextContent();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        itens.push({ s: it.str.trim(), x: it.transform[4], y: it.transform[5], p: pg.pageIndex });
      }
      return "";
    },
  });
  return itens;
}
/** Agrupa itens em linhas (mesma página, |Δy| ≤ 2), de cima para baixo. */
function linhas(itens) {
  const ord = [...itens].sort((a, b) => a.p - b.p || b.y - a.y || a.x - b.x);
  const out = [];
  for (const it of ord) {
    const l = out[out.length - 1];
    if (l && l.p === it.p && Math.abs(l.y - it.y) <= 2) l.itens.push(it);
    else out.push({ p: it.p, y: it.y, itens: [it] });
  }
  for (const l of out) l.itens.sort((a, b) => a.x - b.x);
  return out;
}

const CATS = [[/benjam/i, "Benjamín"], [/sub\s*-?\s*12\b/i, "Sub-12"], [/sub\s*-?\s*14\b/i, "Sub-14"], [/sub\s*-?\s*16\b/i, "Sub-16"], [/alev/i, "Alevín"], [/infantil/i, "Infantil"], [/cadet/i, "Cadete"], [/junior|sub\s*-?\s*18/i, "Junior"]];
const NIVEL = { B: "Benjamín", A: "Alevín", I: "Infantil", C: "Cadete", J: "Junior" };
const catDe = (s) => { for (const [re, c] of CATS) if (re.test(s || "")) return c; return null; };
const sexoDe = (s) => (/femen|femin|\bfem\b|chicas|\bgirls?\b/i.test(s || "") ? "F" : /mascul|\bmas\b|chicos|\bboys?\b/i.test(s || "") ? "M" : null);
const num = (s) => { const v = parseFloat(String(s || "").replace(",", ".")); return Number.isFinite(v) ? v : null; };
/** «+5» → 5, «-2» → −2, «PAR»/«E» → 0; o resto (NP, RET, DESC) → null. */
const toParDe = (s) => { const t = String(s || "").trim().toUpperCase(); if (t === "PAR" || t === "E") return 0; return /^[+-]?\d+$/.test(t) ? parseInt(t, 10) : null; };
const LIC = /^[A-Z]{2}\d{8}$|^\d{10}$/;
const PARENS = /^\((\d+)\)$/;

/** Nome da coluna, com os sinónimos de cada programa. «1ª», «2º Vuelta» → V1, V2. */
function coluna(s) {
  const n = s.toUpperCase().replace(/\.$/, "").trim();
  const v = /^(\d)\s*[ªº°]\s*(VUELTA)?$/.exec(n);
  if (v) return "V" + v[1];
  return { STR: "STRS", JUGADOR: "NOMBRE", PUESTO: "POS", "GÉNERO": "SEX", GENERO: "SEX", SEXO: "SEX", TOTAL: "TOT" }[n] || n;
}

const MESES = { ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06", jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12" };
/** Primeira data do texto: «dd/mm/aaaa», «aaaa-mm-dd» ou «12-abr-2026» → ISO. */
function dataDe(txt) {
  let m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(txt || "");
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(txt || "");
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /(\d{1,2})-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*-(\d{4})/i.exec(txt || "");
  return m ? `${m[3]}-${MESES[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}` : null;
}

/**
 * Classificações de um PDF. Devolve blocos { titulo, evento, fecha, campo,
 * categoria, sexo, nRounds, parRonda, fora, noveBuracos, players[] } — um por
 * título de secção («RESULTADOS CADETE MASCULINO», «Scratch»…).
 */
function lerClassificacoes(itens) {
  const blocos = [];
  let titulo = "", evento = "", modalidade = "", fecha = null, campo = null, cols = null, semLic = false, bloco = null, cabCampo = null, gorraiz = null;
  const novoBloco = (formato) => {
    // A mesma tabela a continuar noutra página (cabeçalho repetido) é o mesmo bloco.
    if (!bloco) { const u = blocos[blocos.length - 1]; if (u && u.titulo === titulo && u.evento === evento) bloco = u; }
    if (!bloco || bloco.titulo !== titulo) {
      bloco = { titulo, evento, modalidade, fecha, campo, formato, players: [] };
      blocos.push(bloco);
    }
    return bloco;
  };
  for (const l of linhas(itens)) {
    const txt = l.itens.map((i) => i.s).join(" ");
    const h = l.itens.map((i) => coluna(i.s));
    // Programa do C.G. Castillo de Gorraiz: «POS JUGADOR | CLUB | HEX NVH | NIV |
    // S | Cat Hpu | 1ª 2ª 3ª 4ª TOT», com várias colunas coladas num só texto.
    if (/^POS\s+JUGADOR$/i.test(l.itens[0].s)) {
      const x = (re) => (l.itens.find((i) => re.test(i.s)) || {}).x;
      gorraiz = { xNome: l.itens[0].x + 20, xClub: x(/^CLUB$/i), xNiv: x(/^NIV$/i), xVoltas: x(/^1ª/) };
      cols = null; bloco = null;
      continue;
    }
    if (h.includes("NOMBRE") && (h.includes("LICENCIA") || (h.includes("POS") && (h.includes("TOT") || h.includes("STRS") || h.includes("CLUB"))))) {
      cols = l.itens.map((i) => ({ n: coluna(i.s), x: i.x }));
      semLic = !h.includes("LICENCIA");
      gorraiz = null; bloco = null;
      continue;
    }
    if (gorraiz && (/^\d+$/.test(l.itens[0].s) || Math.abs(l.itens[0].x - gorraiz.xNome) < 25) && l.itens.some((i) => /[a-z]{2}/i.test(i.s))) {
      const its = l.itens;
      const p = { pos: /^\d+$/.test(its[0].s) ? +its[0].s : null, licencia: null };
      const nomeIt = its.find((i) => /[a-z]{2}/i.test(i.s));
      const [nome, clubColado] = nomeIt.s.split(/\s{2,}/);
      p.name = nome.trim();
      const clubIt = its.find((i) => i !== nomeIt && gorraiz.xClub != null && Math.abs(i.x - gorraiz.xClub) < 15);
      if (clubIt || clubColado) p.club = (clubIt ? clubIt.s : clubColado).trim();
      const hcpIt = its.find((i) => /^\d+,\d$/.test(i.s));
      p.hcp = hcpIt ? num(hcpIt.s) : null;
      const nivIt = its.find((i) => gorraiz.xNiv != null && Math.abs(i.x - gorraiz.xNiv) < 15);
      const tk = nivIt ? nivIt.s.split(/\s+/) : [];
      p.catEdad = NIVEL[String(tk[0] || "").toUpperCase()] || catDe(titulo);
      p.sexo = /^[MF]$/i.test(tk[1] || "") ? tk[1].toUpperCase() : sexoDe(titulo);
      // Voltas coladas («77  78») e o total à direita.
      const nums = its.filter((i) => gorraiz.xVoltas != null && i.x >= gorraiz.xVoltas - 8)
        .map((i) => i.s.split(/\s+/).filter((t) => /^\d+$/.test(t)).map(Number).filter((n) => n >= 50));
      const totIt = nums.length > 1 ? nums.pop() : [];
      p.rounds = nums.flat();
      p.total = totIt.length ? totIt[0] : (p.rounds.length === 1 ? p.rounds[0] : null);
      p.toPar = null;
      novoBloco("B").players.push(p);
      continue;
    }
    // «Campo Modalidad Fecha Jugadores» (Castela-La Mancha): a linha seguinte
    // tem o campo, a modalidade e a data.
    if (h.includes("CAMPO") && h.includes("FECHA")) { cabCampo = l.itens.map((i) => ({ n: coluna(i.s), x: i.x })); continue; }
    if (cabCampo) {
      const perto = (n) => { const c = cabCampo.find((k) => k.n === n); if (!c) return null; let m = null; for (const i of l.itens) if (!m || Math.abs(i.x - c.x) < Math.abs(m.x - c.x)) m = i; return m && m.s; };
      campo = perto("CAMPO"); modalidade = perto("MODALIDAD") || modalidade; fecha = dataDe(txt) || fecha;
      cabCampo = null; bloco = null;
      continue;
    }
    const lic = l.itens.find((i) => LIC.test(i.s));
    const cNome = cols && cols.find((c) => c.n === "NOMBRE");
    const ehJogador = cols && (lic || (semLic && l.itens.length >= 4 && (/^\d+$/.test(l.itens[0].s) || Math.abs(l.itens[0].x - cNome.x) < 15)));
    if (!ehJogador) {
      // «Fecha: 07/04/2026» é o dia da prova; «Fecha listado:» é o da impressão.
      const fm = /fecha:\s*(.{0,24})/i.exec(txt);
      if (fm && dataDe(fm[1])) fecha = dataDe(fm[1]);
      else if (!fecha && !/listado/i.test(txt)) fecha = dataDe(txt);
      if (/stableford|medal play|stroke play|match play/i.test(txt) && txt.length < 90) modalidade = txt;
      // Nome da prova («VII TPR JUVENIL - … 18 HOYOS», «I PUNTUABLE ZONAL JUVENIL - Jornada 2»).
      if (/campeonato|puntuable|copa|torneo|cpto|\btpr\b|zonal|juegos/i.test(txt) && txt.length < 150 && !/^fecha/i.test(txt)) { evento = txt; bloco = null; continue; }
      // Linha de título (sem licença): «RESULTADOS CADETE MASCULINO», «INFANTIL
      // FEMENINO», «Clasificación Scratch Masculina Acumulada (ASC: 0) 1ª Vuelta», «Scratch».
      if ((catDe(txt) || sexoDe(txt) || /clasificaci|^scratch$|categor[ií]a [úu]nica/i.test(txt)) && txt.length < 90) { titulo = txt.replace(/^RESULTADOS\s+/i, ""); bloco = null; }
      continue;
    }
    // Cada item vai para a coluna do cabeçalho mais próxima. Formato A tem R1..R4
    // (±par por volta); B tem o total no fim ou na coluna Tot; C tem as pancadas
    // entre parênteses.
    const v = {};
    const formatoA = cols.some((c) => c.n === "R1");
    const voltas = cols.filter((c) => /^V\d$/.test(c.n)).map((c) => c.n);
    const parens = [];
    let ultimo = null;
    const xNome = Math.min(...cols.filter((c) => c.n === "NOMBRE" || c.n === "LICENCIA").map((c) => c.x));
    for (const it of l.itens) {
      if (it === lic) continue;
      // A posição é o número à esquerda do nome e da licença (no formato B fica
      // mais perto da coluna «Licencia» do que da «Pos»).
      if (/^\d+$/.test(it.s) && it.x < xNome - 2 && v.POS == null) { v.POS = it.s; continue; }
      const pm = PARENS.exec(it.s);
      if (pm) { parens.push(+pm[1]); continue; }
      let melhor = null;
      // Texto nunca é a posição (em Castela-La Mancha o nome começa mais perto de «Puesto»).
      for (const c of cols) if ((c.n !== "POS" || /^\d+$/.test(it.s)) && (!melhor || Math.abs(c.x - it.x) < Math.abs(melhor.x - it.x))) melhor = c;
      if (v[melhor.n] == null) v[melhor.n] = it.s;
      if (/^\d+$/.test(it.s)) ultimo = it.s;   // «G» (vencedor) no fim não conta
    }
    const nome = v.NOMBRE || "";
    if (!nome || !/[a-zà-ü]/i.test(nome) || (semLic && !/[a-zà-ü]{2}/i.test(nome))) continue;
    const categoria = catDe(v.CATEG || v.CAT) || NIVEL[String(v.NIVEL || v.NIV || "").toUpperCase()] || catDe(titulo);
    const sx = v.S || v.SEX || "";
    const sexo = /^[MF]$/i.test(sx) ? sx.toUpperCase() : sexoDe(titulo);
    novoBloco(formatoA ? "A" : parens.length ? "C" : "B");
    const p = { pos: /^\d+$/.test(v.POS || "") ? +v.POS : null, licencia: lic ? lic.s : null, name: nome.replace(/\s+,/g, ",").trim(), catEdad: categoria, sexo };
    if (v.CLUB) p.club = v.CLUB;
    if (formatoA) {
      p.hcp = num(v.HCE);
      p.toPar = toParDe(v.TOT);
      p.strokes = /^\d+$/.test(v.STRS || "") ? +v.STRS : null;
      p.rtp = ["R1", "R2", "R3", "R4"].map((k) => toParDe(v[k])).filter((x, i, a) => x != null || a.slice(i + 1).some((y) => y != null));
    } else if (parens.length) {
      // C: «+6 (78)» por volta e no total; o ±par do total fica na coluna Golpes/Total.
      p.hcp = num(v.HEX ?? v.HP);
      p.total = parens[parens.length - 1];
      p.rounds = voltas.length && parens.length > voltas.length ? parens.slice(0, voltas.length) : [p.total];
      p.toPar = toParDe(v.GOLPES ?? v.TOT);
    } else {
      p.hcp = num(v.HP ?? v.HEX);
      if (voltas.length) {
        // B com voltas (Navarra): «Tot 1ª 2ª». As colunas ficam muito juntas (o
        // Hpu cai mais perto de «Total» do que da sua): pancadas são números ≥ 50;
        // o total é o último à esquerda da 1.ª volta, as voltas os que se seguem.
        // Fronteira a meio caminho entre «Tot» e «1ª» (os números alinham à direita).
        const x1 = Math.min(...cols.filter((c) => /^V\d$/.test(c.n)).map((c) => c.x));
        const cTot = cols.find((c) => c.n === "TOT" && c.x < x1);
        const xV1 = cTot ? (cTot.x + x1) / 2 : x1 - 15;
        const golpes = l.itens.filter((i) => i !== lic && /^\d+$/.test(i.s) && +i.s >= 50);
        p.rounds = golpes.filter((i) => i.x >= xV1).map((i) => +i.s).slice(0, voltas.length);
        const antes = golpes.filter((i) => i.x < xV1);
        p.total = antes.length ? +antes[antes.length - 1].s : (p.rounds.length === voltas.length ? p.rounds.reduce((a, x) => a + x, 0) : null);
      } else {
        const tot = /^\d+$/.test(ultimo || "") ? parseInt(ultimo, 10) : NaN;
        p.total = Number.isFinite(tot) && tot > 20 ? tot : null;
        p.rounds = p.total != null ? [p.total] : [];
      }
      p.toPar = null;
    }
    bloco.players.push(p);
  }
  // Formato A: ±par por volta → pancadas, com o par da volta tirado da própria
  // classificação ((STRS − TOT) / voltas): o valor de pelo menos 80% dos
  // jogadores (um desistente a meio da volta não o estraga). Quem não bate com
  // ele fica só com o total.
  for (const b of blocos) {
    if (b.formato === "A") {
      const pares = [];
      for (const p of b.players) if (p.strokes != null && p.toPar != null && p.rtp.length) pares.push((p.strokes - p.toPar) / p.rtp.length);
      const moda = mais(pares.filter(Number.isInteger));
      const parRonda = moda != null && pares.filter((x) => x === moda).length >= 0.8 * pares.length ? moda : null;
      b.parRonda = parRonda;
      for (const p of b.players) {
        p.total = p.strokes;
        const bate = p.strokes != null && p.toPar != null && p.rtp.length && (p.strokes - p.toPar) / p.rtp.length === parRonda;
        p.rounds = parRonda != null && bate && p.rtp.every((x) => x != null) ? p.rtp.map((x) => parRonda + x) : [];
        delete p.strokes; delete p.rtp;
      }
    } else if (b.formato === "C") {
      // Par da volta = pancadas − ±par do total, a dividir pelas voltas.
      const pares = b.players.filter((p) => p.total != null && p.toPar != null && p.rounds.length).map((p) => (p.total - p.toPar) / p.rounds.length);
      const moda = mais(pares.filter(Number.isInteger));
      b.parRonda = moda != null && pares.filter((x) => x === moda).length >= 0.8 * pares.length ? moda : null;
    }
    b.nRounds = Math.max(1, ...b.players.map((p) => p.rounds.length));
    // Gorraiz: quando o nome é comprido o clube cola-se-lhe com um só espaço
    // («GUEZURAGA BERRAONDO, MARINA GORRAIZ») — tira-se o clube dos outros jogadores.
    const clubes = [...new Set(b.players.map((p) => p.club).filter(Boolean))].sort((x, y) => y.length - x.length);
    for (const p of b.players) {
      if (p.club) continue;
      const c = clubes.find((k) => p.name.toUpperCase().endsWith(" " + k.toUpperCase()));
      if (c) { p.name = p.name.slice(0, -c.length).trim(); p.club = c; }
    }
    // Empatados: o PDF deixa a posição em branco — herda a de cima (mesmo total).
    for (let i = 1; i < b.players.length; i++) {
      const p = b.players[i], a = b.players[i - 1];
      if (p.pos == null && p.total != null && p.total === a.total) p.pos = a.pos;
    }
    // Escalão do título («RESULTADOS CADETE MASCULINO») ou o da maioria dos
    // jogadores (coluna Categ./Nivel/Niv); sexo idem.
    b.categoria = catDe(b.titulo) || mais(b.players.map((p) => p.catEdad));
    b.categoriaFixa = !!catDe(b.titulo);
    // Rapazes e raparigas na mesma classificação (Interclubes) = mista.
    const sexos = new Set(b.players.map((p) => p.sexo).filter(Boolean));
    b.sexo = sexos.size > 1 ? null : (sexoDe(b.titulo) || [...sexos][0] || null);
    // Classificações que não são a scratch (hándicap, «no nacional», neto, Stableford).
    b.fora = /h[aá]ndicap|\bhcp\b|no nacional|neto|stableford/i.test(b.titulo) || /stableford/i.test(b.modalidade || "");
    // 9 buracos: par da volta ≤ 40, o nome da prova, ou totais típicos de 9 buracos.
    const tots = b.players.map((p) => p.total).filter((x) => x != null).sort((x, y) => x - y);
    b.noveBuracos = b.parRonda != null ? b.parRonda <= 40
      : /\b9\s*h(oyos)?\b|iniciaci/i.test(b.evento || "") || (tots.length > 0 && tots[Math.floor(tots.length / 2)] / b.nRounds < 60);
  }
  return blocos.filter((b) => b.players.length);
}
function mais(arr) {
  const c = new Map();
  for (const x of arr) if (x) c.set(x, (c.get(x) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

/** Chave do jogador: a licença; sem ela (Rioja), o nome. */
const chave = (p) => p.licencia || `n:${String(p.name).toLowerCase()}`;

/**
 * Classificação scratch geral com vários escalões e os dois sexos (Castela-La
 * Mancha, «Scratch») → uma por escalão e sexo, como a própria federação as
 * publica no live scoring; a posição é a ordem do PDF dentro do grupo. Quem não
 * tem escalão juvenil (adultos, «MAYOR») sai.
 */
function porEscalao(b) {
  if (b.categoriaFixa) return [b];
  const grupos = new Map();
  for (const p of b.players) {
    if (!p.catEdad) continue;
    const k = `${p.catEdad}|${p.sexo || ""}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  }
  if (grupos.size <= 1 && b.players.every((p) => p.catEdad)) return [b];
  return [...grupos.values()].map((players) => {
    let pos = 0, ant = null;
    const ps = players.map((p, i) => {
      if (p.total == null) return { ...p, pos: null };
      if (ant == null || p.total !== ant) pos = i + 1;
      ant = p.total;
      return { ...p, pos };
    });
    return { ...b, categoria: players[0].catEdad, sexo: players[0].sexo || null, categoriaFixa: true, players: ps };
  });
}

/**
 * Todos os blocos lidos de uma prova (com `pdfUrl`) → `results` (uma
 * classificação por escalão e sexo) e os jogadores. Cada jogador fica numa só
 * classificação: primeiro as de mais voltas (o PDF da última volta é acumulado
 * e substitui o da 1.ª), depois pela ordem dos PDFs. Fora: hándicap/«no
 * nacional»/Stableford, 9 buracos e Benjamín (escalões muito novos).
 */
function juntarClassificacoes(todos, urls) {
  const ordemPdf = (b) => urls.indexOf(b.pdfUrl);
  const nomeFich = (b) => decodeURIComponent(String(b.pdfUrl || "").split("/").pop());
  const validos = [];
  for (const b0 of todos) {
    if (b0.fora || b0.noveBuracos || /9\s?h(oyos)?(?![a-z])/i.test(nomeFich(b0))) continue;
    // Escalão no nome do ficheiro («Clasificacion-final-sub-12-masculina.pdf»).
    const b = !b0.categoriaFixa && catDe(nomeFich(b0)) ? { ...b0, categoria: catDe(nomeFich(b0)), categoriaFixa: true, sexo: b0.sexo || sexoDe(nomeFich(b0)) } : b0;
    for (const x of porEscalao(b)) if (x.categoria && x.categoria !== "Benjamín") validos.push(x);
  }
  const vistos = new Set();
  const usados = [];
  for (const b of validos.sort((a, b2) => b2.nRounds - a.nRounds || ordemPdf(a) - ordemPdf(b2))) {
    const players = b.players.filter((p) => !vistos.has(chave(p)));
    if (!players.length) continue;
    for (const p of players) vistos.add(chave(p));
    // Quem só está no PDF de uma volta anterior (desistiu, não passou o corte)
    // entra na classificação principal do mesmo escalão, sem posição nem total.
    const principal = usados.find((u) => u.categoria === b.categoria && u.sexo === b.sexo && (u.nRounds > b.nRounds || players.every((p) => p.total == null)));
    if (principal) {
      for (const p of players) principal.players.push({ ...p, pos: null, total: null, toPar: null });
      continue;
    }
    // «Scratch Indistinta» (rapazes e raparigas juntos, Navarra): os que sobram
    // juntam-se à classificação do mesmo escalão e sexo, por ordem do total.
    const igual = usados.find((u) => u.categoria === b.categoria && u.sexo === b.sexo && u.nRounds === b.nRounds && (/indistinta/i.test(u.titulo) || /indistinta/i.test(b.titulo)));
    if (igual) {
      igual.players = [...igual.players, ...players].sort((x, y) => (x.total ?? 1e9) - (y.total ?? 1e9));
      let pos = 0;
      igual.players.forEach((p, i) => { if (p.total == null) p.pos = null; else { if (i === 0 || p.total !== igual.players[i - 1].total) pos = i + 1; p.pos = pos; } });
      continue;
    }
    usados.push({ ...b, players });
  }
  const ordem = ["Sub-12", "Alevín", "Sub-14", "Infantil", "Sub-16", "Cadete", "Junior"];
  usados.sort((a, b) => ordem.indexOf(a.categoria) - ordem.indexOf(b.categoria) || String(a.sexo).localeCompare(String(b.sexo)));
  const labels = new Map();
  const results = usados.map((b) => {
    let label = `${b.categoria}${b.sexo === "M" ? " Masculino" : b.sexo === "F" ? " Femenino" : ""}`;
    const n = (labels.get(label) || 0) + 1;
    labels.set(label, n);
    // Duas classificações do mesmo escalão (Uraburu: «Nacional» e outra) → o
    // título do próprio PDF a distinguir.
    if (n > 1) label += ` — ${b.titulo.replace(/\(ASC:[^)]*\)|\d+ª Vuelta/gi, "").replace(/\s+/g, " ").trim() || n}`;
    return {
      label, sexo: b.sexo, categoria: b.categoria, pdfUrl: b.pdfUrl, nRounds: b.nRounds,
      parTotal: b.parRonda ?? null,
      players: b.players.map((p) => ({ pos: p.pos, name: p.name, licencia: p.licencia, toPar: p.toPar, rounds: p.rounds, total: p.total, hcp: p.hcp, ...(p.club ? { club: p.club } : {}) })),
    };
  });
  // Os inscritos são quem jogou (nenhuma destas federações publica a lista em dados).
  const admitidos = usados.flatMap((b) => b.players).map((p) => ({ name: p.name, licencia: p.licencia, pais: "ES", hcp: p.hcp, catEdad: p.catEdad, sexo: p.sexo, club: p.club || null, dob: null, estado: null }));
  return { results, admitidos, usados };
}

module.exports = { itensPdf, linhas, lerClassificacoes, juntarClassificacoes, catDe, sexoDe, dataDe };
