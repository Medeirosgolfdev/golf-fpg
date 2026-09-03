/**
 * scripts/scrape-livegolfscoring.js
 *
 * Scraper de rfegolf.livegolfscoring.es — fonte primária dos resultados RFEGolf.
 * Tem leaderboard estruturado em HTML + scorecards hole-by-hole + par + meters
 * por buraco (não precisa de parsing PDF).
 *
 * URLs:
 *   /torneos/clasificacion/{id}      → leaderboard final/em curso
 *   /torneos/hoyoahoyo/{id}/{r}      → scorecards por ronda
 *   /torneos/estadisticas/{id}       → metros + SI + par + média por buraco
 *   /torneos/horarios/{id}/{r}       → tee times por ronda
 *
 * O ID é interno (1-400+ em 2026). Não há mapeamento directo com CompId RFEGolf
 * — temos de scrap por nome+data e depois cruzar.
 *
 * USO:
 *   node scripts/scrape-livegolfscoring.js --id 322
 *   node scripts/scrape-livegolfscoring.js --range 1-400 --concurrency 5
 *   node scripts/scrape-livegolfscoring.js --seasons 2025,2026 --skip-existing
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { lgsCountryToIso } = require("./lib/lgs-country.js");

const OUT_DIR = path.resolve(__dirname, "../public/data/rfegolf-livegolfscoring");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const AGENT = new https.Agent({ keepAlive: true, maxSockets: 8 });

function httpGet(urlStr, retries = 2) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      const url = new URL(urlStr);
      const req = https.request({
        method: "GET", hostname: url.hostname, path: url.pathname + url.search,
        headers: { "User-Agent": UA, "Accept": "text/html,*/*", "Accept-Language": "es-ES,es;q=0.9" },
        timeout: 20000, agent: AGENT,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, urlStr).toString();
          res.resume();
          httpGet(next, retries).then(resolve, reject); return;
        }
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      });
      req.on("error", err => { if (n > 0) setTimeout(() => attempt(n - 1), 1000); else reject(err); });
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.end();
    }
    attempt(retries);
  });
}

function decodeEntities(s) {
  return String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}
function stripTags(s) { return decodeEntities(String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()); }

function parseHoyoAHoyo(html) {
  // Par real do campo está na primeira <tr class="hoyoahoyopares">
  let par = null;
  const parTr = /<tr[^>]*class="[^"]*hoyoahoyopares[^"]*"[^>]*>([\s\S]+?)<\/tr>/i.exec(html);
  if (parTr) {
    const nums = stripTags(parTr[1]).split(/\s+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    if (nums.length >= 21) {
      par = [...nums.slice(0, 9), ...nums.slice(10, 19)];   // 18 buracos: 9 + OUT + 9 + IN + TOT
    } else if (nums.length >= 9 && nums.length <= 12) {
      par = nums.slice(0, 9);                                // 9 buracos (Benjamín/Alevín): 9 pars + total
    }
  }
  // Nº de buracos do campo desta ronda (9 ou 18) — manda no parsing dos cartões.
  const courseHoles = par && par.length === 9 ? 9 : 18;

  // Players: cada <tr class="altrow"> ou similar tem 1 jogador
  const players = [];
  const dropped = [];                 // linhas-jogador que falharam o parse forte — NUNCA descartadas em silêncio
  const trRe = /<tr[^>]*(?:class="(?:altrow|altrow_alt)"|id="jugador-\d+")[^>]*>([\s\S]+?)<\/tr>/gi;

  // Classe de nome tolerante: \p{L} apanha QUALQUER letra unicode (à/è/ï/ç/·, além
  // de áéíóúñü) — nomes catalães/estrangeiros deixam de fazer a linha falhar e
  // desaparecer (ex: PUJOLÀ, GONÇALVES, MÜLLER). Inclui TODAS as variantes de
  // apóstrofo/aspa que aparecem no site (O´RIORDAN, O'NEILL, D'ARLOT, D´haenens):
  // recta ' (U+0027), curvas ' ' (U+2018/2019), acento agudo ´ (U+00B4), crase `
  // (U+0060), modificador ʼ (U+02BC). Mantemos o parse forte (scorecard completo)
  // como caminho normal e um fallback que recupera/regista o resto.
  const NAME = "[\\p{L}\\s,.'\\-·\\u00B4\\u2018\\u2019\\u0060\\u02BC]+?";
  // Marcadores opcionais entre o nome e o ±toPar, em qualquer combinação/ordem:
  //   *  (favorito)   (am)/(pro)  (estatuto amador/pro)   C  (categoria/confirmado)
  // Ex: "… Juan Manuel (am) +11", "MORATO BREDE, Miguel * C -3", "Ivan (am) C +6".
  // Sem isto, jogadores (muitos juniores) com cartão completo eram descartados.
  const MARK = `(?:(?:\\*|\\([A-Za-z]{1,4}\\)|C)\\s+)*`;
  // To-par / "thru": ±N, E, Par, ou 0 simples (par certo às vezes vem como "0").
  const TP = `[+\\-]\\d+|E|Par|0`;
  // Nº de números do bloco do cartão: 18h = 20-22 (9+OUT+9+IN+TOT, +hoy à frente),
  // 9h = 10-11 (9 buracos + total). O strict ajusta-se ao campo desta ronda.
  const reps = courseHoles === 9 ? "9,10" : "19,21";
  const strictRe = new RegExp(`^[> ]*(T?\\d+|\\d+|—)?\\s+(${NAME})\\s+${MARK}(${TP})\\s+((?:\\d+\\s+){${reps}}\\d+)\\s+(${TP})`, "u");
  const looseRe = new RegExp(`^[> ]*(T?\\d+|\\d+|—)?\\s+(${NAME})\\s+${MARK}(${TP})\\s+(.+)$`, "u");
  // Marcadores de "não-jogador" no início da linha: não-comparecências (NP), retiros
  // (RET), desqualificações (DESC/DSQ), etc. — não têm cartão válido e não entram nas
  // classificações. Reconhecê-los evita ruído de "unparsed" (eram dezenas por torneio).
  const statusRe = new RegExp(`^[> ]*(NP|RET|DESC|DSQ|DQ|NC|DNS|WD|AUS|NoCard|RETIRAD[OA]|DESCALIFICAD[OA])\\s+\\p{L}`, "iu");
  const toTp = (raw) => (raw === "E" || raw === "Par") ? 0 : parseInt(raw, 10);
  // Converte o bloco de números do cartão em {scores, halves, total} conforme o nº de
  // buracos do campo. 18h: 9 + OUT + 9 + IN + TOTAL. 9h: 9 buracos + TOTAL (a 10ª
  // coluna). Em 9h validamos que a SOMA dos 9 buracos bate com o total — assim um
  // cartão incompleto (jogador a meio) é rejeitado em vez de inventar um total errado.
  const parseNums = (nums) => {
    if (courseHoles === 9) {
      if (nums.length >= 10) {
        const scores = nums.slice(0, 9);
        const total = nums[9];
        if (scores.reduce((a, b) => a + b, 0) === total) return { scores, halves: null, total };
      }
      return null;
    }
    if (nums.length >= 21) {
      return { scores: [...nums.slice(0, 9), ...nums.slice(10, 19)], halves: [nums[9], nums[19]], total: nums[20] };
    }
    return null;
  };

  let m;
  while ((m = trRe.exec(html)) !== null) {
    const block = m[1];
    // memberId: pode estar no próprio <tr id="jugador-N"> OU num <span id="star-N">
    // interno — procurar na linha INTEIRA (m[0]) para apanhar ambos os casos e
    // garantir a MESMA chave de jogador entre hoyoahoyo e backfill da classificação.
    const idM = /id="(?:star|jugador|fichalink)-(\d+)"/.exec(m[0]);
    const memberId = idM ? idM[1] : null;
    const blockText = stripTags(block);

    // ── Caminho normal: scorecard completo ──
    const r = strictRe.exec(blockText);
    if (r) {
      const nums = r[4].trim().split(/\s+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
      const sc = parseNums(nums);
      if (sc) {
        const posStr = r[1] ? r[1].replace(/^T/, "") : "";
        const pos = posStr ? parseInt(posStr, 10) : null;
        const name = r[2].trim().replace(/\s{2,}/g, " ");
        players.push({ memberId, pos, name, toPar: toTp(r[3]), hoy: toTp(r[5]), scores: sc.scores, halves: sc.halves, total: sc.total });
        continue;
      }
      // bloco não casou com o nº de buracos esperado → segue para status/fallback
    }

    // ── Não-jogador (NP/RET/DESC/…): sem cartão válido → fora das classificações.
    //    Conta-se mas não se regista como jogador nem como erro. ──
    if (statusRe.test(blockText)) {
      dropped.push({ memberId, reason: "nocard", text: blockText.slice(0, 80) });
      continue;
    }

    // ── Fallback: o parse forte falhou (nome com carácter inesperado, espaçamento,
    //    scorecard incompleto). Recuperamos o máximo possível em vez de descartar. ──
    const lr = looseRe.exec(blockText);
    if (lr) {
      const posStr = lr[1] ? lr[1].replace(/^T/, "") : "";
      const pos = posStr ? parseInt(posStr, 10) : null;
      const name = lr[2].trim().replace(/\s{2,}/g, " ");
      const tail = lr[4].trim();
      const tpTokens = tail.match(/[+\-]\d+|E|Par/g) || [];
      const hoyRaw = tpTokens.length ? tpTokens[tpTokens.length - 1] : null;
      const nums = tail.split(/\s+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
      const sc = parseNums(nums);        // scorecard completo recuperado → jogador válido
      const scores = sc ? sc.scores : null;
      const halves = sc ? sc.halves : null;
      const total = sc ? sc.total : null;
      players.push({ memberId, pos, name, toPar: toTp(lr[3]), hoy: hoyRaw ? toTp(hoyRaw) : 0, scores, halves, total, _partial: scores == null });
      dropped.push({ memberId, name, reason: scores == null ? "partial" : "recovered", text: blockText.slice(0, 140) });
      continue;
    }

    // ── Nem o fallback apanhou. Distinguir "sem dados" (só traços: match-play,
    //    desistências sem marcador) — esperado e silencioso — de "unparsed" (TEM
    //    números mas mesmo assim falhou: digno de inspecção). ──
    const hasScoreDigits = /\b\d{1,3}\b/.test(blockText.replace(/[+\-]\d+/g, ""));
    if (hasScoreDigits) {
      dropped.push({ memberId, reason: "unparsed", text: blockText.slice(0, 140) });
    } else if (memberId || /\p{L}{3,}/u.test(blockText)) {
      dropped.push({ memberId, reason: "nodata", text: blockText.slice(0, 80) });
    }
  }

  // ── Cartões por CÉLULA (parciais + reparação dos corrompidos) ─────────────
  // O parse acima é sobre o TEXTO da linha e exige o cartão completo — numa
  // ronda em curso não há total nem IN, e os jogadores ficavam sem scores
  // nenhuns (`_partial: true`, `scores: null`). Mas os buracos já jogados ESTÃO
  // na página, em células próprias: 18 × `<td class="golpeshoyoahoyo">` (número
  // ou "-") intercaladas com `<td class="inout">` (OUT/IN/TOT). Lê-las por
  // posição dá os parciais sem tocar no caminho dos cartões completos.
  // Serve dois casos:
  //  (a) PARCIAIS — numa ronda a decorrer não há total nem IN, o parse por texto
  //      desiste (`_partial: true`, `scores: null`) e os buracos já jogados
  //      perdiam-se, apesar de estarem na página;
  //  (b) CARTÕES CORROMPIDOS — o parse por texto conta números numa linha e
  //      desalinha-se quando o espaçamento muda: um cartão real saiu como
  //      `[…,5,32,4,…,37]` (com o OUT e o IN metidos entre os buracos) e total 1.
  // Aqui cada buraco vem da SUA célula (18 × `<td class="golpeshoyoahoyo">`,
  // número ou "-"), portanto não há contagem que se desalinhe.
  const byKeyRow = {};
  for (const p of players) byKeyRow[p.memberId || normNameLgs(p.name)] = p;
  {
    const trRe2 = /<tr[^>]*id="jugador-\d+"[^>]*>([\s\S]+?)<\/tr>/gi;
    let m2;
    while ((m2 = trRe2.exec(html)) !== null) {
      const row = m2[0];
      const idM = /id="(?:star|jugador|fichalink)-(\d+)"/.exec(row);
      const nameM = /class="jugador"[^>]*><a[^>]*>([^<]+)</.exec(row);
      const target = byKeyRow[(idM && idM[1])] || (nameM && byKeyRow[normNameLgs(nameM[1])]);
      if (!target) continue;
      const holes = [...row.matchAll(/<td[^>]*class="golpeshoyoahoyo"[^>]*>([\s\S]*?)<\/td>/gi)]
        .map((c) => {
          const v = parseInt(stripTags(c[1]), 10);
          return isNaN(v) ? null : v;
        });
      if (holes.length !== courseHoles) continue;
      const jogados = holes.filter((h) => h != null).length;
      if (!jogados) continue;
      const soma = holes.reduce((a, b) => a + (b || 0), 0);

      if (jogados === courseHoles) {
        // Cartão completo: as células mandam sobre o parse por texto (que só
        // fica quando coincide). Se o texto tinha dado outro total, era lixo.
        target.scores = holes;
        if (target.total !== soma) {
          target.total = soma;
          target._repaired = true;
        }
        target.halves = courseHoles === 18
          ? [holes.slice(0, 9).reduce((a, b) => a + b, 0), holes.slice(9).reduce((a, b) => a + b, 0)]
          : null;
        delete target._partial;
      } else {
        // Cartão A MEIO segundo as células. Se o parse por texto o dava por
        // completo, enganou-se — foi assim que um jogador no buraco 18 saiu com
        // `[…,3,29]` (o IN metido como buraco) e total −3 (o ±par como gross).
        target.scores = holes;                                 // nulls nos por jogar
        target.holesPlayed = jogados;
        target.partialGross = soma;
        if (target.total !== soma) {
          target.total = null;                                 // não é uma volta
          target.halves = null;
          target._repaired = true;
        }
        target._partial = true;
      }
    }
  }

  return { par, players, dropped };
}

/* Tabela /torneos/estadisticas/{id}: por buraco Mtrs (metros) + Hdp (SI) + Par +
 * Media (score médio do torneio). É a UNICA fonte de DISTANCIAS por buraco no LGS
 * (o hoyoahoyo só tem par). Markup: <table class="board estadisticas"> com 18 <tr>,
 * cada um com <td> Hoyo - Mtrs - Hdp - Par - Media - Eagles - Birdies - ... */
function parseEstadisticas(html) {
  const tblM = /<table[^>]*class="[^"]*estadisticas[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!tblM) return null;
  const meters = new Array(18).fill(null), si = new Array(18).fill(null), par = new Array(18).fill(null), avg = new Array(18).fill(null);
  let found = 0, m;
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  while ((m = trRe.exec(tblM[1])) !== null) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => stripTags(c[1]));
    if (cells.length < 5) continue;
    const hole = parseInt(cells[0], 10);
    if (!(hole >= 1 && hole <= 18)) continue;
    const i = hole - 1;
    const mt = parseInt(cells[1], 10); if (!isNaN(mt)) meters[i] = mt;
    const hd = parseInt(cells[2], 10); if (!isNaN(hd)) si[i] = hd;
    const pr = parseInt(cells[3], 10); if (!isNaN(pr)) par[i] = pr;
    const av = parseFloat(String(cells[4]).replace(",", ".")); if (!isNaN(av)) avg[i] = av;
    found++;
  }
  if (found < 9) return null;
  const metersTotal = meters.reduce((a, b) => a + (b || 0), 0) || null;
  return { meters, si, par, avg, metersTotal, holes: found };
}

function parseTorneoMeta(html) {
  const rounds = [];
  const optRe = /<option value="\/torneos\/hoyoahoyo\/\d+\/(\d+)"[^>]*>([^<]+)<\/option>/gi;
  let m;
  while ((m = optRe.exec(html)) !== null) {
    rounds.push({ round: parseInt(m[1], 10), label: m[2].trim() });
  }
  let name = null;
  const nm = /<h1[^>]*>([^<]+)<\/h1>/.exec(html);
  if (nm) name = stripTags(nm[1]);
  if (!name) {
    const nm2 = /<title[^>]*>([^<]+)<\/title>/.exec(html);
    if (nm2) name = stripTags(nm2[1]).replace(/\s*-\s*Real Federación.+$/i, "").trim();
  }
  // O campo vem na linha das datas: `Del 02 septiembre al 05 septiembre -
  // <span>Campo:</span> <a href="/campo/zaudin-golf">Zaudín Golf</a>, Sevilla`.
  // ⚠ O selector antigo (`span.nombre_campo`) não existe na página — nenhum dos
  // 287 ficheiros tinha campo até 2026-09-03.
  let course = null;
  const cm = /<span[^>]*class="nombre_campo"[^>]*>([^<]+)<\/span>/.exec(html);
  if (cm) course = stripTags(cm[1]);
  if (!course) {
    const cm2 = /Campo:\s*<\/span>\s*<a[^>]*>([^<]+)<\/a>/i.exec(html);
    if (cm2) course = stripTags(cm2[1]);
  }
  let dateRange = null;
  const dm = /Del\s+(\d+\s+[a-z]+)\s+al\s+(\d+\s+[a-z]+(?:\s+\d{4})?)/i.exec(html);
  if (dm) dateRange = `${dm[1]} - ${dm[2]}`;
  return { name, course, dateRange, rounds };
}

/** Extrai "Valor del campo: 72.8 | Slope: 135" da página de classificação. */
function parseCourseValue(html) {
  let courseRating = null, slope = null;
  const cr = /Valor del campo:\s*([\d]+(?:[.,]\d+)?)/i.exec(html);
  if (cr) { const v = parseFloat(cr[1].replace(",", ".")); if (!isNaN(v)) courseRating = v; }
  const sl = /Slope:\s*([\d]+)/i.exec(html);
  if (sl) { const v = parseInt(sl[1], 10); if (!isNaN(v)) slope = v; }
  return { courseRating, slope };
}

function normNameLgs(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Página de classificação geral (/torneos/clasificacion/{id}). Tem, por jogador,
 * os TOTAIS de cada ronda + total final de TODOS os jogadores — incluindo os que o
 * hoyoahoyo de alguma ronda não listou. Usa-se para PREENCHER rondas em falta.
 *
 * Parse pela ESTRUTURA HTML real (não por texto), confirmada no markup do site:
 *   <tr id="jugador-N">
 *     <td>…star…</td> <td>…flag…</td> <td><span class="up">1</span></td>   ← movimento
 *     <td><strong><span title="2">T2</span></strong></td>                  ← posição
 *     <td class="jugador"><a …>DE WINT SENUSSI, Oliver</a></td>            ← nome
 *     <td>-2</td> <td>18</td> <td>-2</td>                                  ← AlPar, hoyo, hoy
 *     <td class="golpesronda">69</td> …×nRondas…                          ← totais por ronda
 *     <td>205</td>                                                         ← total final
 *   </tr>
 *
 * Os totais por ronda vivem nas células `golpesronda` (sem ambiguidade de coluna).
 * Mesmo assim guardamos a auto-validação aritmética: só marcamos roundTotals como
 * válidos quando a SOMA bate com o total final — nunca se inventa um score.
 */
/**
 * Tabela `.tarjetacampo` da página de classificação: uma linha por buraco com
 * `Hoyo | Par | Hdp | Mtrs`. É a fonte MAIS fiável do campo — está sempre lá,
 * enquanto a página /estadisticas falta em ~50 dos 287 torneios (e só existe
 * depois de haver voltas suficientes). "Hdp" é o stroke index do buraco.
 */
function parseTarjetaCampo(html) {
  const tblM = /<table[^>]*class="[^"]*tarjetacampo[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!tblM) return null;
  const par = [], si = [], meters = [];
  const rowRe = /<tr[^>]*>\s*<td[^>]*>\s*(\d{1,2})\s*<\/td>\s*<td[^>]*>\s*(\d)\s*<\/td>\s*<td[^>]*>\s*(\d{1,2})\s*<\/td>\s*<td[^>]*>\s*(\d{1,4})\s*<\/td>/gi;
  let m;
  while ((m = rowRe.exec(tblM[1])) !== null) {
    par.push(Number(m[2]));
    si.push(Number(m[3]));
    meters.push(Number(m[4]));
  }
  if (par.length !== 9 && par.length !== 18) return null;
  return { par, si, meters };
}

function parseClasificacion(html /* , nRounds */) {
  const out = [];
  const trRe = /<tr[^>]*id="jugador-\d+"[^>]*>([\s\S]+?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const row = m[0];
    const idM = /id="(?:jugador|star|fichalink)-(\d+)"/.exec(row);
    const memberId = idM ? idM[1] : null;
    // Bandeira. Há DOIS formatos e só um é país:
    //   /img/banderas/paises/por.png  → PAÍS (torneios internacionais)
    //   /img/banderas/4.png title="Galicia" → COMUNIDADE AUTÓNOMA (provas nacionais)
    // O `title` é sempre a comunidade de quem está federado em Espanha — existe
    // também sobre uma bandeira de país (um polaco federado na Andaluzia).
    // ⚠ Bandeira regional NÃO implica nacionalidade espanhola: há estrangeiros
    // federados em Espanha (Dmitrii Elchaninov, russo, Andaluzia — a própria
    // página tem overrides para isso). Nesse caso guarda-se só a região.
    const flagM = /class="flag"[^>]*src="\/img\/banderas\/(?:paises\/)?([a-z0-9_-]+)\.png"[^>]*?(?:title="([^"]*)")?/i.exec(row);
    const isCountryFlag = !!flagM && /\/paises\//i.test(flagM[0]);
    const countryCode = isCountryFlag ? flagM[1].toLowerCase() : null;
    const country = lgsCountryToIso(countryCode);
    const region = flagM && flagM[2] ? decodeEntities(flagM[2]).trim() || null : null;
    // Nome: célula <td class="jugador">
    const nameM = /<td[^>]*class="[^"]*jugador[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(row);
    const name = nameM ? stripTags(nameM[1]).replace(/\s{2,}/g, " ") : null;
    if (!name) continue;
    // Totais por ronda: células golpesronda (na ordem R1..Rn)
    const roundTotals = [...row.matchAll(/<td[^>]*class="[^"]*golpesronda[^"]*"[^>]*>\s*(\d+)\s*<\/td>/gi)].map(x => Number(x[1]));
    // Posição: <span title="N"> dentro do <strong> da posição
    const posM = /<strong>[\s\S]*?title="(\d+)"/.exec(row);
    const pos = posM ? parseInt(posM[1], 10) : null;
    // Células <td> com número simples (AlPar, hoyo, hoy, …, total). O ÚLTIMO é o total.
    const simpleTds = [...row.matchAll(/<td[^>]*>\s*([+\-]?\d+)\s*<\/td>/gi)].map(x => x[1]);
    const total = simpleTds.length ? parseInt(simpleTds[simpleTds.length - 1], 10) : null;
    const toPar = simpleTds.length ? parseInt(simpleTds[0], 10) : null;   // AlPar (informativo)
    // Validação: a soma dos totais por ronda tem de bater com o total final.
    let validated = null;
    if (roundTotals.length >= 1 && total != null &&
        roundTotals.every(v => v > 0 && v < 999) &&
        roundTotals.reduce((a, b) => a + b, 0) === total) {
      validated = roundTotals;
    }
    out.push({ memberId, name, country, countryCode, region, pos, toPar, roundTotals: validated, total });
  }
  return out;
}

/**
 * Mapa ronda → sub-id dos horários. A página de horários linka as outras rondas:
 *   <a href="/torneos/horarios/380/1627">Ronda 1</a> … 1628→R2 … 1629→R3
 * Devolve { [roundNum]: subid }.
 */
function parseHorarioRounds(html, id) {
  const map = {};
  const re = new RegExp(`<a[^>]*href="/torneos/horarios/${id}/(\\d+)"[^>]*>\\s*Ronda\\s*(\\d+)\\s*</a>`, "gi");
  let m;
  while ((m = re.exec(html)) !== null) map[parseInt(m[2], 10)] = m[1];
  return map;
}

/**
 * Página de horários de uma ronda (/torneos/horarios/{id}/{subid}). Tabela:
 *   <tr class="altrow"><td>10</td><td>08:00</td><td class="jugador">NOME</td></tr>
 * A 1ª linha de cada grupo traz Tee (buraco de saída) + Hora; as seguintes só o
 * jogador (mesmo flight). Devolve grupos: { teeTime, startHole, players[] }.
 */
function parseHorarios(html) {
  const groups = [];
  let cur = null;
  const trRe = /<tr[^>]*class="[^"]*altrow[^"]*"[^>]*>([\s\S]+?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const tds = [...m[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)];
    let name = null; const plain = [];
    for (const td of tds) {
      // stripTags descodifica &nbsp; DEPOIS do trim → fica espaço à direita ("10 ").
      // Voltar a colapsar+trim aqui para o tee/hora baterem com /^\d+$/ e /HH:MM/.
      const val = stripTags(td[2]).replace(/\s+/g, " ").trim();
      if (/jugador/i.test(td[1])) name = val;
      else plain.push(val);
    }
    if (!name || /^jugador$/i.test(name)) continue;        // cabeçalho/linha vazia
    const tee = plain.find(v => /^\d+$/.test(v));
    const hora = plain.find(v => /^\d{1,2}:\d{2}$/.test(v));
    if (tee != null || hora != null) {
      cur = { teeTime: hora || null, startHole: tee != null ? parseInt(tee, 10) : null, players: [name] };
      groups.push(cur);
    } else if (cur) {
      cur.players.push(name);
    } else {
      cur = { teeTime: null, startHole: null, players: [name] };
      groups.push(cur);
    }
  }
  return groups;
}

async function scrapeTorneo(id) {
  // Carrega hoyoahoyo (sem ronda) — tem o select de rondas + título
  const main = await httpGet(`https://rfegolf.livegolfscoring.es/torneos/hoyoahoyo/${id}`);
  if (main.status !== 200 || main.body.length < 1000) {
    return { id, ok: false, error: `hoyoahoyo status=${main.status}` };
  }
  if (!/jugador-\d+|hoyoahoyopares|selectRonda/i.test(main.body)) {
    return { id, ok: false, error: "no_data" };
  }
  const meta = parseTorneoMeta(main.body);

  // 2. Para cada ronda, fetch hoyoahoyo
  const rounds = meta.rounds.length > 0 ? meta.rounds : [{ round: 1, label: "Ronda 1" }];
  const roundsData = [];
  for (const r of rounds) {
    const hoy = await httpGet(`https://rfegolf.livegolfscoring.es/torneos/hoyoahoyo/${id}/${r.round}`);
    if (hoy.status !== 200) continue;
    const parsed = parseHoyoAHoyo(hoy.body);
    // Tornar visível qualquer linha que o parse forte não apanhou — antes
    // desapareciam em silêncio (ex: 2º classificado a sumir de R1/R2 → top-3 errado).
    const dr = parsed.dropped || [];
    const rec = dr.filter(d => d.reason === "recovered").length;
    const part = dr.filter(d => d.reason === "partial").length;
    const nocard = dr.filter(d => d.reason === "nocard" || d.reason === "nodata").length;
    const uns = dr.filter(d => d.reason === "unparsed").length;
    // Só avisar quando há algo digno de nota: recuperações, parciais, ou linhas
    // genuinamente não parseadas. NP/RET/DESC/match-play (nocard/nodata) são
    // exclusões esperadas — não poluem o log (no máximo um resumo ao lado).
    if (rec || part || uns) {
      console.warn(`  ⚠ id=${id} R${r.round}: ${parsed.players.length} jogadores` +
        (rec ? `, +${rec} recuperados via fallback` : "") +
        (part ? `, ${part} parciais (sem scorecard completo)` : "") +
        (uns ? `, ${uns} NÃO parseadas` : "") +
        (nocard ? `, ${nocard} s/ cartão (NP/RET/DESC)` : ""));
      for (const d of dr) {
        if (d.reason === "unparsed") console.warn(`      [unparsed] mid=${d.memberId || "?"} :: ${d.text}`);
      }
    }
    roundsData.push({ round: r.round, label: r.label, par: parsed.par, players: parsed.players });
  }

  // 3. Estatísticas por buraco — metros + SI + par + média (distâncias jogadas).
  let course = null;
  try {
    const est = await httpGet(`https://rfegolf.livegolfscoring.es/torneos/estadisticas/${id}`);
    if (est.status === 200) course = parseEstadisticas(est.body);
  } catch (e) { /* sem estatísticas publicadas — ok */ }

  // 3b. Página de classificação geral: Course Rating/Slope (Valor del campo) +
  //     totais por ronda de TODOS os jogadores. Cruzamos estes totais para
  //     PREENCHER rondas que o hoyoahoyo não listou (ex: 2º classificado ausente
  //     de R1/R2). Aditivo e defensivo: nunca sobrescreve o hoyoahoyo, e se a
  //     página falhar o output fica igual.
  let classification = [];
  try {
    const cls = await httpGet(`https://rfegolf.livegolfscoring.es/torneos/clasificacion/${id}`);
    if (cls.status === 200) {
      const cv = parseCourseValue(cls.body);
      if (cv.courseRating != null || cv.slope != null) {
        course = course || {};
        course.courseRating = cv.courseRating;
        course.slope = cv.slope;
      }
      // Tabela "Scorecard" da própria página (Hoyo|Par|Hdp|Mtrs). Preenche o que
      // faltar: a /estadisticas só existe depois de haver voltas suficientes e
      // falta em ~50 dos 287 torneios — esta está sempre lá. Não sobrepõe o que
      // as estatísticas já trouxeram (essas são as distâncias JOGADAS).
      const tarjeta = parseTarjetaCampo(cls.body);
      if (tarjeta) {
        course = course || {};
        if (!Array.isArray(course.par) || !course.par.length) course.par = tarjeta.par;
        if (!Array.isArray(course.si) || !course.si.length) course.si = tarjeta.si;
        if (!Array.isArray(course.meters) || !course.meters.length) course.meters = tarjeta.meters;
      }
      classification = parseClasificacion(cls.body, rounds.length);
      let filled = 0;
      for (const cp of classification) {
        if (!cp.roundTotals) continue;                 // só os auto-validados (soma = total)
        for (let i = 0; i < cp.roundTotals.length; i++) {
          const rd = roundsData.find(x => x.round === i + 1);
          if (!rd) continue;
          const present = rd.players.some(p =>
            (cp.memberId && p.memberId === cp.memberId) ||
            (!cp.memberId && normNameLgs(p.name) === normNameLgs(cp.name)));
          if (present) continue;                        // já temos (hoyoahoyo manda)
          rd.players.push({
            memberId: cp.memberId, pos: null, name: cp.name,
            toPar: null, hoy: 0, scores: null, halves: null,
            total: cp.roundTotals[i], _fromClassif: true,
          });
          filled++;
        }
      }
      if (filled) console.warn(`  ↺ id=${id}: ${filled} ronda(s) preenchida(s) via classificação geral`);
      else if (classification.length) console.warn(`  · id=${id}: classificação lida (${classification.length} jogadores), 0 rondas em falta para preencher`);
      // A bandeira só existe na classificação — propagá-la para os jogadores de
      // cada ronda, que é o que a UI e o agregador consomem.
      const natByMid = {}, natByName = {};
      for (const cp of classification) {
        if (!cp.country && !cp.region) continue;
        const nat = { country: cp.country || null, region: cp.region || null };
        if (cp.memberId) natByMid[cp.memberId] = nat;
        natByName[normNameLgs(cp.name)] = nat;
      }
      let flagged = 0;
      for (const rd of roundsData) {
        for (const p of rd.players) {
          const nat = (p.memberId && natByMid[p.memberId]) || natByName[normNameLgs(p.name)];
          if (!nat) continue;
          p.country = nat.country;
          if (nat.region) p.region = nat.region;
          flagged++;
        }
      }
      const semPais = classification.filter(c => c.countryCode && !c.country).map(c => c.countryCode);
      if (semPais.length) console.warn(`  ⚠ id=${id}: código(s) de país por mapear em lib/lgs-country.js: ${[...new Set(semPais)].join(", ")}`);
      if (flagged) console.warn(`  🏳 id=${id}: país em ${flagged} linha(s) de ronda`);
    }
  } catch (e) { console.warn(`  ⚠ id=${id}: classificação geral indisponível (${e.message})`); }

  // 4. Horários (draws / tee times). Entry-point /torneos/horarios/{id} traz os
  //    links Ronda N → sub-id; depois cada ronda é uma página própria. Defensivo:
  //    se não houver (torneio sem tee times publicados), fica [].
  let horarios = [];
  try {
    const entry = await httpGet(`https://rfegolf.livegolfscoring.es/torneos/horarios/${id}`);
    if (entry.status === 200) {
      const roundMap = parseHorarioRounds(entry.body, id);
      const rnums = Object.keys(roundMap).map(Number).sort((a, b) => a - b);
      for (const rn of rnums) {
        const subid = roundMap[rn];
        const hp = await httpGet(`https://rfegolf.livegolfscoring.es/torneos/horarios/${id}/${subid}`);
        if (hp.status !== 200) continue;
        const groups = parseHorarios(hp.body);
        if (groups.length) horarios.push({ round: rn, subid, groups });
      }
      // Sem links de ronda mas a própria entry pode já ser uma tabela de horários.
      if (!horarios.length) {
        const groups = parseHorarios(entry.body);
        if (groups.length) horarios.push({ round: 1, subid: null, groups });
      }
      if (horarios.length) {
        const nG = horarios.reduce((a, h) => a + h.groups.length, 0);
        console.warn(`  🕒 id=${id}: horários ${horarios.length} ronda(s), ${nG} grupos`);
      }
    }
  } catch (e) { console.warn(`  ⚠ id=${id}: horários indisponíveis (${e.message})`); }

  return { id, ok: true, scrapedAt: new Date().toISOString(), meta, course, rounds: roundsData, classification, horarios };
}

const LGS_BASE = "https://rfegolf.livegolfscoring.es";

/* Descoberta por LISTAGEM de temporada: /competiciones/temporada/{ano} lista
 * TODAS as competições da época. Extrai os IDs do padrão /torneos/{tipo}/{id}. */
async function discoverSeasonIds(years) {
  const ids = new Set();
  for (const y of years) {
    try {
      const r = await httpGet(`${LGS_BASE}/competiciones/temporada/${y}`);
      if (r.status !== 200) { console.log(`  temporada ${y}: HTTP ${r.status}`); continue; }
      let n = 0;
      for (const m of r.body.matchAll(/\/torneos\/(?:clasificacion|hoyoahoyo|horarios)\/(\d+)/gi)) {
        const id = parseInt(m[1], 10);
        if (id > 0 && !ids.has(id)) { ids.add(id); n++; }
      }
      console.log(`  temporada ${y}: ${n} competições`);
    } catch (e) { console.log(`  temporada ${y}: erro ${e.message}`); }
  }
  return [...ids];
}

async function main() {
  const args = process.argv.slice(2);
  function getArg(n, def) { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : (def === undefined ? null : def); }
  const idArg = getArg("id", null);
  const rangeArg = getArg("range", null);
  const seasonsArg = getArg("seasons", null);
  const skipExisting = args.includes("--skip-existing");
  const pretty = args.includes("--pretty");
  const concurrency = parseInt(getArg("concurrency", "5"), 10);

  let ids = [];
  if (idArg) ids = idArg.split(",").map(s => parseInt(s.trim(), 10));
  else if (rangeArg) {
    const p = rangeArg.split("-").map(s => parseInt(s.trim(), 10));
    for (let i = p[0]; i <= p[1]; i++) ids.push(i);
  }
  if (seasonsArg) {
    const years = seasonsArg.split(",").map(s => s.trim()).filter(Boolean);
    console.log(`Discovery por temporada: ${years.join(", ")}`);
    const found = await discoverSeasonIds(years);
    for (const id of found) if (!ids.includes(id)) ids.push(id);
    console.log(`  → ${found.length} IDs descobertos (total a processar: ${ids.length})`);
  }
  if (!ids.length) {
    console.log("Uso: --id 322 | --range 1-400 | --seasons 2025,2026 [--concurrency 5] [--skip-existing]");
    process.exit(1);
  }

  console.log(`livegolfscoring.es scrape: ${ids.length} ids, concurrency=${concurrency}`);
  let ok = 0, fail = 0, skip = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      const out = path.join(OUT_DIR, id + ".json");
      if (skipExisting && fs.existsSync(out)) { skip++; continue; }
      try {
        const result = await scrapeTorneo(id);
        if (result.ok) {
          // ⚠ Preservar a data já resolvida. `meta.year`/`meta.dateIso` são
          // postos pelo enrich-lgs-dates (a página de classificação não traz o
          // ANO), e um re-scrape reescrevia o meta inteiro — o torneio ficava
          // sem data até alguém correr o enrich, e sem data não há cálculo de
          // escalão nenhum (a coluna ESC. do draw esvaziava-se toda).
          try {
            if (fs.existsSync(out)) {
              const prev = JSON.parse(fs.readFileSync(out, "utf-8"));
              if (prev && prev.meta) {
                if (result.meta.year == null && prev.meta.year != null) result.meta.year = prev.meta.year;
                if (!result.meta.dateIso && prev.meta.dateIso) result.meta.dateIso = prev.meta.dateIso;
              }
            }
          } catch { /* ficheiro anterior ilegível — segue com o novo */ }
          fs.writeFileSync(out, JSON.stringify(result, null, pretty ? 2 : 0));
          ok++;
          const nP = result.rounds.reduce((a, r) => a + (r.players?.length || 0), 0);
          const mt = result.course ? `, ${result.course.metersTotal}m` : "";
          console.log(`  ${id}: ${result.meta.name?.slice(0, 48) || "?"} (${result.rounds.length} R, ${nP} entries${mt})`);
        } else {
          fail++;
        }
      } catch (e) { fail++; }
    }
  }
  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  console.log(`\nDone: ok=${ok} fail=${fail} skip=${skip}`);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

// Exportados para testes (o main() só corre quando o ficheiro é o entrypoint).
module.exports = {
  scrapeTorneo, httpGet,
  parseHoyoAHoyo, parseClasificacion, parseEstadisticas, parseCourseValue,
  parseTorneoMeta, parseHorarios, parseHorarioRounds,
};
