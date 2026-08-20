/**
 * scripts/fpg-admissions-draw-parser.js
 *
 * Parsers HTML para páginas públicas do scoring.fpg.pt:
 *   - Inscrições (tournAdmissions.aspx, acedida via linkpage.aspx?page=admissions)
 *   - Draw (scoring-pt.datagolf.pt/scripts/draw.asp, acedida via linkpage.aspx?page=draw)
 *
 * Ambas as páginas são server-side rendered (não há XHR) — basta parse regex.
 *
 * Exportado para ser usado pelo scrape-fpg-admissions-draws.js.
 * Também usado pelos testes (vitest).
 */

"use strict";

/* ═══════════════════════════════════════════════════════
   UTILS
   ═══════════════════════════════════════════════════════ */

/** Descodifica entidades HTML básicas. */
function decodeHTML(s) {
  if (!s) return "";
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Remove tags HTML + colapsa whitespace. */
function stripTags(s) {
  if (!s) return "";
  return decodeHTML(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Parse decimal (aceita "," ou "." como separador). Retorna null se inválido. */
function parseNum(s) {
  const t = String(s || "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Parse de HANDICAP com a convenção do golfe.
 *
 * "+5.1" é um handicap PLUS — o jogador está ABAIXO de scratch e DEVOLVE
 * pancadas. É o oposto de "5.1". A FPG publica-o com o "+" no HTML, mas tanto
 * `parseFloat("+5.1")` como `Number("+5.1")` devolvem 5.1 e o sinal
 * desaparecia em silêncio: a Sofia Barroso Sá (+5.1) aparecia nas inscrições
 * como um 5.1 vulgar — mais de 10 pancadas de diferença, e a ordenação por
 * handicap ficava errada.
 *
 * Guarda-se como NEGATIVO (-5.1), que é a convenção já usada em todo o
 * projecto: `fmtHcp` (src/utils/format.ts) formata negativos como "+5.1",
 * o `hcpExact` dos drive-data vem negativo da API, e o body do ClassifLST usa
 * `minhcp: "-8"`. Assim o parser passa a concordar com o resto.
 */
function parseHcp(s) {
  const t = String(s || "").trim().replace(",", ".");
  if (!t) return null;
  const isPlus = t.startsWith("+");
  const n = Number(isPlus ? t.slice(1) : t);
  if (!Number.isFinite(n)) return null;
  // "+0.0" é scratch, não "-0" — normalizar para 0.
  return isPlus && n !== 0 ? -n : n;
}

/* ═══════════════════════════════════════════════════════
   PARSE ADMISSIONS (tournAdmissions.aspx)
   ═══════════════════════════════════════════════════════
   Estrutura esperada:
     <span id="lblTdesc">Tournament Name</span>
     <span id="lbldt">DD/MM/YYYY</span>
     <span id="PlayersCount">15 (+2)</span>
     <span id="lblTournStatus">Inscrições em curso</span>
     <table class="table table-hover">
       <thead>...</thead>
       <tbody><tr>
         <td>POS</td><td>NFED</td><td>NAME</td>
         <td>CLUB</td><td>HCP</td><td>VACF</td><td>REGDATE</td>
       </tr></tbody>
       <tbody><tr>... próximo jogador ...</tr></tbody>
     </table>
*/
function parseAdmissions(html) {
  if (!html || typeof html !== "string") {
    return { error: "empty-html" };
  }

  const result = {
    name: null,
    date: null,
    totalInscritos: 0,
    reservas: 0,
    status: null,
    rounds: null,    // nº de rondas detectado dos radio buttons radioNRounds
    tcode: null,
    ccode: null,
    players: [],
  };

  // Meta
  const mName = html.match(/<span[^>]*id=["']lblTdesc["'][^>]*>([^<]*)<\/span>/i);
  if (mName) result.name = decodeHTML(mName[1]).trim();

  // Número de rondas — contagem de inputs radioNRounds (cada ronda = 1 radio button)
  const nRounds = (html.match(/name=["']radioNRounds["']/gi) || []).length;
  if (nRounds > 0) result.rounds = nRounds;

  const mDate = html.match(/<span[^>]*id=["']lbldt["'][^>]*>([^<]*)<\/span>/i);
  if (mDate) {
    const raw = decodeHTML(mDate[1]).trim();
    // Converter DD/MM/YYYY → YYYY-MM-DD
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) result.date = `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
    else result.date = raw;
  }

  const mCount = html.match(/<span[^>]*id=["']PlayersCount["'][^>]*>([^<]*)<\/span>/i);
  if (mCount) {
    const raw = decodeHTML(mCount[1]).trim();
    // Formato: "15 (+2)" → 15 confirmed + 2 reservas
    const m = raw.match(/(\d+)\s*(?:\(\+(\d+)\))?/);
    if (m) {
      result.totalInscritos = parseInt(m[1], 10);
      result.reservas = m[2] ? parseInt(m[2], 10) : 0;
    }
  }

  const mStatus = html.match(/<span[^>]*id=["']lblTournStatus["'][^>]*>([^<]*)<\/span>/i);
  if (mStatus) result.status = decodeHTML(mStatus[1]).trim();

  const mTorn = html.match(/<span[^>]*id=["']lblTorn["'][^>]*>([^<]*)<\/span>/i);
  if (mTorn) result.tcode = decodeHTML(mTorn[1]).trim();

  const mClub = html.match(/<span[^>]*id=["']lblClub["'][^>]*>([^<]*)<\/span>/i);
  if (mClub) result.ccode = decodeHTML(mClub[1]).trim();

  // Players — cada jogador está num <tbody> separado dentro da tabela
  // Suporta dois formatos:
  //   7 colunas (via linkpage): pos | nfed | nome | clube | hcp | vacf | registo
  //   6 colunas (via URL directa tournAdmissions.aspx): pos | nfed | nome | clube | hcp | registo
  const bodyRe = /<tbody[^>]*>([\s\S]*?)<\/tbody>/gi;
  let bm;
  while ((bm = bodyRe.exec(html)) !== null) {
    const inner = bm[1];
    // Extrair os <td>...</td>
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tm;
    while ((tm = tdRe.exec(inner)) !== null) {
      cells.push(stripTags(tm[1]));
    }
    // Aceitar 6 ou 7 células; ignorar outras contagens (cabeçalhos, totais, etc.)
    if (cells.length < 6 || cells.length > 8) continue;
    const [pos, nfed, nome, clube, hcp] = cells;
    const vacf    = cells.length >= 7 ? cells[5] : null;
    const registo = cells[cells.length - 1];  // última célula = data de registo
    if (!pos || !nome) continue;
    // Filtrar header row accidentally picked (se algum <tbody> envolver <thead>)
    if (/^#$/.test(pos)) continue;
    result.players.push({
      pos: parseInt(pos, 10) || null,
      fed: nfed || null,
      nome: nome || null,
      clube: clube || null,
      hcp: parseHcp(hcp),
      vacf: parseNum(vacf),
      registo: registo || null,  // "YYYY/MM/DD HH:MM" raw format
      status: "confirmed",       // refinado em baixo
    });
  }

  // Marcar reservas: na lista do HTML, pos reinicia em 1 quando começa a lista de reservas.
  // Detectar a reset: o primeiro jogador cujo pos é 1 depois de já ter aparecido pos > 1 inicia os reservas.
  let maxPos = 0;
  let inReservas = false;
  for (const p of result.players) {
    if (!inReservas) {
      if (p.pos === 1 && maxPos > 1) inReservas = true;
      else if (p.pos != null) maxPos = Math.max(maxPos, p.pos);
    }
    if (inReservas) p.status = "reserva";
  }
  // Sanity: se totalInscritos + reservas do header não bater com a lista, guardar warning
  const confirmedCount = result.players.filter(p => p.status === "confirmed").length;
  const reservaCount = result.players.filter(p => p.status === "reserva").length;
  if (result.totalInscritos && (confirmedCount !== result.totalInscritos || reservaCount !== result.reservas)) {
    result._warning = `counts mismatch: header=${result.totalInscritos}+${result.reservas}, parsed=${confirmedCount}+${reservaCount}`;
  }

  return result;
}

/* ═══════════════════════════════════════════════════════
   PARSE DRAW (scoring-pt.datagolf.pt/scripts/draw.asp)
   ═══════════════════════════════════════════════════════
   Estrutura esperada:
     <td align="left">Tournament Name Dia N</td>
     <td align="right">DATE</td>
     <td align="right">Jogadores N</td>
     <table>
       <tr>...HEADER...</tr>
       <tr>                                   ← grupo 1, jogador 1
         <td>HORA</td><td>TEE#</td><td>TEE-COR</td>
         <td>NOME</td><td>CLUBE</td>...
       </tr>
       <tr>                                   ← grupo 1, jogador 2 (sem border-top)
         ...
       </tr>
       <tr style="border-top:2pt solid gray;">  ← INÍCIO de novo grupo (flight)
         ...
       </tr>
     </table>

   Grupos (flights) separados por border-top:2pt solid gray na primeira row.
*/
function parseDraw(html) {
  if (!html || typeof html !== "string") {
    return { error: "empty-html" };
  }

  const result = {
    name: null,
    date: null,
    campo: null,
    clube: null,
    totalJogadores: 0,
    groups: [],
  };

  // ── Meta (nome, organizador, campo, data) ───────────────────────────────
  // Bloco de duas colunas no topo da página:
  //   <td align="left">NOME DO TORNEIO</td><td align="right">ORGANIZADOR</td>
  //   <td align="left">CAMPO</td>          <td align="right">YYYY-MM-DD</td>
  // ⚠ Não exigir que o organizador comece por "Federação": os torneios de clube
  // trazem lá o nome do clube ("Sociedade do Golfe da Quinta do Lago") e o nome
  // do torneio ficava null — era por isso que os 962/* apareciam na UI como
  // "Torneio 10084" em vez do nome real.
  {
    const pairRe = /<td[^>]*align=["']left["'][^>]*>([\s\S]*?)<\/td>\s*<td[^>]*align=["']right["'][^>]*>([\s\S]*?)<\/td>/gi;
    let pm;
    while ((pm = pairRe.exec(html)) !== null) {
      const left = stripTags(pm[1]);
      const right = stripTags(pm[2]);
      if (/^\d{4}-\d{2}-\d{2}$/.test(right)) {
        if (!result.date) result.date = right;
        if (!result.campo && left) result.campo = left;
      } else if (!result.name && left && !/^Jogadores\s+\d+/i.test(right) && !/^(Hora|Tee)$/i.test(left)) {
        result.name = left;
        if (right) result.clube = right;
      }
    }
  }

  if (!result.date) {
    const mDate = html.match(/<td[^>]*align=["']right["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/i);
    if (mDate) result.date = mDate[1];
  }

  const mTotal = html.match(/<td[^>]*align=["']right["'][^>]*>\s*Jogadores\s+(\d+)\s*<\/td>/i);
  if (mTotal) result.totalJogadores = parseInt(mTotal[1], 10);

  // Cores de tee conhecidas da FPG
  const TEE_COLORS_RE = /^\s*(Brancas?|Azuis|Azul(?:\s+Claro|\s+Escuro)?|Amarelas?|Vermelhas?|Verdes?|Roxas?|Pretas?|Douradas?|Negras?|Laranjas?|Rosas?)\s*$/i;

  /* Ordem das colunas DEPOIS do nome, lida do cabeçalho da tabela.
     A draw.asp publica cabeçalhos diferentes conforme o torneio:
       [Hora, Tee, (cor), Jogador, Club/Equipa, V1, Total, To PAR]     (sem fed)
       [Hora, Tee, (cor), Jogador, Federado, Club/Equipa, HCP Exacto, HCP Jogo]
     Sem isto, a coluna Federado só era detectada quando trazia dígitos: nos
     torneios com estrangeiros o "-" (não federado) era lido como CLUBE e a
     nacionalidade/clube real desaparecia (962/10084, 21 jogadores, 12 com "-"). */
  function headerLayout() {
    const trRe2 = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let hm;
    while ((hm = trRe2.exec(html)) !== null) {
      const cells = [];
      const tdRe2 = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cm;
      while ((cm = tdRe2.exec(hm[1])) !== null) cells.push(stripTags(cm[1]));
      const iNome = cells.findIndex(c => /^Jogador/i.test(c));
      if (iNome < 0 || !cells.some(c => /^Hora$/i.test(c))) continue;
      const after = [];
      for (const c of cells.slice(iNome + 1)) {
        if (/^Federado/i.test(c)) after.push("fed");
        else if (/Club|Equipa/i.test(c)) after.push("clube");
        else if (/HCP\s*Exacto/i.test(c)) after.push("hcp");
        else after.push(null);   // V1/Total/To PAR/HCP Jogo — ignorados
      }
      return after;
    }
    return null;
  }
  const LAYOUT = headerLayout();

  // Iterar <tr>s. Cada <tr> tem um bloco de <td> numa linha do draw.
  // A primeira <tr> da tabela é header ("Hora", "Tee", "Jogador", ...) — descartar.
  // Grupos: <tr style="border-top:2pt solid gray"> marca INÍCIO de novo grupo.
  // Primeira <tr> após o header é também início do primeiro grupo (implícito).
  const trRe = /<tr([^>]*)>([\s\S]*?)<\/tr>/gi;
  let tm;
  let currentGroup = null;
  let isFirstDataRow = true;

  while ((tm = trRe.exec(html)) !== null) {
    const trAttrs = tm[1] || "";
    const trInner = tm[2];

    // Extrair todos os <td>
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let dm;
    while ((dm = tdRe.exec(trInner)) !== null) {
      cells.push(stripTags(dm[1]));
    }

    if (cells.length === 0) continue;
    const first = cells[0];
    if (/^Hora$/i.test(first) || /Jogador/i.test(first) && cells.length <= 8 && !/^\d{1,2}:\d{2}$/.test(first)) {
      continue;
    }
    if (!/^\d{1,2}:\d{2}$/.test(first)) continue;

    // A coluna de cor de tee é OPCIONAL:
    //   [Hora, Tee#, (Cor?), Nome, …]
    const maybeColor = (cells[2] || "").trim();
    let teeVal, nomeIdx;
    if (TEE_COLORS_RE.test(maybeColor)) {
      teeVal = maybeColor; nomeIdx = 3;
    } else {
      teeVal = null; nomeIdx = 2;
    }

    // Colunas depois do nome: pelo cabeçalho quando existe; senão heurística
    // (numérico 4-6 dígitos = Federado, "-" = Federado vazio).
    let fed = null, clube = null, hcp = null;
    if (LAYOUT) {
      for (let k = 0; k < LAYOUT.length; k++) {
        const raw = (cells[nomeIdx + 1 + k] || "").trim();
        if (LAYOUT[k] === "fed") fed = /^\d{3,6}$/.test(raw) ? raw : null;
        else if (LAYOUT[k] === "clube") clube = raw && raw !== "-" ? raw : null;
        else if (LAYOUT[k] === "hcp") hcp = parseHcp(raw);
      }
    } else {
      const nxt = (cells[nomeIdx + 1] || "").trim();
      if (/^\d{4,6}$/.test(nxt)) {
        fed = nxt;
        clube = cells[nomeIdx + 2] || null;
      } else if (nxt === "-" && (cells[nomeIdx + 2] || "").trim()) {
        // "-" na coluna Federado (jogador estrangeiro/não federado)
        clube = cells[nomeIdx + 2];
      } else {
        clube = nxt || null;
      }
      if (clube === "-") clube = null;
    }

    const startsNewGroup = /border-top:\s*2pt\s+solid/i.test(trAttrs) || isFirstDataRow;
    if (startsNewGroup) {
      currentGroup = {
        teeTime: first,
        startHole: cells[1] ? parseInt(cells[1], 10) : null,
        tee: teeVal,
        players: [],
      };
      result.groups.push(currentGroup);
      isFirstDataRow = false;
    }

    const nome = cells[nomeIdx] || "";
    if (nome) {
      const player = { nome, fed: fed || null, clube: clube || null };
      // Tee próprio quando difere do grupo (flights mistos M/F: as raparigas
      // saem das Verdes no mesmo grupo dos rapazes das Brancas).
      if (teeVal && currentGroup.tee && teeVal !== currentGroup.tee) player.tee = teeVal;
      if (hcp != null) player.hcp = hcp;
      currentGroup.players.push(player);
    }
  }

  return result;
}

/* ═══════════════════════════════════════════════════════
   PARSE INSCRITOS (scoring-pt.datagolf.pt/scripts/admissions.asp)
   ═══════════════════════════════════════════════════════
   Gémeo PÚBLICO (sem cookies) da tournAdmissions.aspx — mesma família de
   páginas ASP clássicas da draw.asp, com o mesmo bloco de meta em cima:
     <td align="left">NOME</td><td align="right">CLUBE</td>
     <td align="left">CAMPO</td><td align="right">YYYY-MM-DD</td>
     <td align="right">Jogadores N</td>
     <table> Jogador | Federado | Club/Equipa | HCP Exacto | HCP Jogo </table>

   Traz MENOS que a tournAdmissions.aspx (não tem posição de inscrição, data de
   registo, VAC nem reservas — a lista vem ordenada por nome), por isso serve
   só de FALLBACK quando o caminho autenticado falha. O que traz chega para a
   FPGPage injectar o torneio (precisa de totalInscritos > 0).
*/
function parseAdmissionsPt(html) {
  if (!html || typeof html !== "string") {
    return { error: "empty-html" };
  }
  // A página de inscritos e a de draw partilham o bloco de meta; reaproveitar
  // o parseDraw para nome/campo/data/total evita duplicar as regex.
  const meta = parseDraw(html);
  const result = {
    name: meta.name || null,
    date: meta.date || null,
    campo: meta.campo || null,
    clube: meta.clube || null,
    status: null,
    totalInscritos: 0,
    reservas: 0,
    players: [],
    _source: "admissions.asp",
  };

  // Tabela de inscritos: linhas com [Nome, Federado, Club/Equipa, HCP Exacto, HCP Jogo]
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tm;
  while ((tm = trRe.exec(html)) !== null) {
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let dm;
    while ((dm = tdRe.exec(tm[1])) !== null) cells.push(stripTags(dm[1]));
    if (cells.length < 4 || cells.length > 6) continue;
    const [nome, fedRaw, clubeRaw, hcpRaw] = cells;
    if (!nome || /^Jogador$/i.test(nome) || /^Hora$/i.test(nome)) continue;
    // Uma linha de jogador tem sempre a coluna Federado (nº ou "-") e um HCP.
    if (!/^(\d{3,6}|-)$/.test((fedRaw || "").trim())) continue;
    if (parseHcp(hcpRaw) == null) continue;
    result.players.push({
      pos: null,
      fed: /^\d{3,6}$/.test(fedRaw.trim()) ? fedRaw.trim() : null,
      nome,
      clube: clubeRaw && clubeRaw !== "-" ? clubeRaw : null,
      hcp: parseHcp(hcpRaw),
      vacf: null,
      registo: null,
      status: "confirmed",
    });
  }
  result.totalInscritos = meta.totalJogadores || result.players.length;
  return result;
}

module.exports = {
  parseAdmissions,
  parseAdmissionsPt,
  parseDraw,
  // utils exportados para testes
  _stripTags: stripTags,
  _decodeHTML: decodeHTML,
  _parseNum: parseNum,
  _parseHcp: parseHcp,
};
