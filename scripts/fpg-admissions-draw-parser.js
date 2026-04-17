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
    tcode: null,
    ccode: null,
    players: [],
  };

  // Meta
  const mName = html.match(/<span[^>]*id=["']lblTdesc["'][^>]*>([^<]*)<\/span>/i);
  if (mName) result.name = decodeHTML(mName[1]).trim();

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
  // Extrair todos os <tbody>...</tbody> e filtrar os que têm 7 <td>
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
    // Esperamos 7 células: pos, nfed, nome, clube, hcp, vacf, registo
    if (cells.length !== 7) continue;
    const [pos, nfed, nome, clube, hcp, vacf, registo] = cells;
    if (!pos || !nome) continue;
    // Filtrar header row accidentally picked (se algum <tbody> envolver <thead>)
    if (/^#$/.test(pos)) continue;
    result.players.push({
      pos: parseInt(pos, 10) || null,
      fed: nfed || null,
      nome: nome || null,
      clube: clube || null,
      hcp: parseNum(hcp),
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
    totalJogadores: 0,
    groups: [],
  };

  // Nome e data ficam no primeiro bloco <td align="left">...</td> / <td align="right">...</td>
  const mName = html.match(/<td[^>]*align=["']left["'][^>]*>([^<]*?)<\/td>\s*<td[^>]*align=["']right["'][^>]*>\s*Federa/i);
  if (mName) result.name = decodeHTML(mName[1]).trim();

  const mDate = html.match(/<td[^>]*align=["']right["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/i);
  if (mDate) result.date = mDate[1];

  const mTotal = html.match(/<td[^>]*align=["']right["'][^>]*>\s*Jogadores\s+(\d+)\s*<\/td>/i);
  if (mTotal) result.totalJogadores = parseInt(mTotal[1], 10);

  // Iterar <tr>s. Cada <tr> tem um bloco de <td> numa linha do draw.
  // A primeira <tr> da tabela é header ("Hora", "Tee", "Jogador", ...) — descartar.
  // Grupos: <tr style="border-top:2pt solid gray"> marca INÍCIO de novo grupo.
  // Primeira <tr> após o header é também início do primeiro grupo (implícito).

  // Cores de tee conhecidas da FPG
  const TEE_COLORS_RE = /^\s*(Brancas?|Azuis|Azul(?:\s+Claro|\s+Escuro)?|Amarelas?|Vermelhas?|Verdes?|Roxas?|Pretas?|Douradas?|Negras?|Laranjas?|Rosas?)\s*$/i;

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

    // Detectar estrutura de colunas:
    //   Padrão A (pré-torneio): [Hora, Tee#, Cor, Nome, Clube, ...]
    //   Padrão B (pós-torneio): [Hora, Tee#, Nome, Fed, Clube, ...]  (sem cor)
    const maybeColor = (cells[2] || "").trim();
    let teeVal, nomeIdx, clubeIdx;
    if (TEE_COLORS_RE.test(maybeColor)) {
      teeVal = maybeColor; nomeIdx = 3; clubeIdx = 4;
    } else {
      teeVal = null; nomeIdx = 2;
      clubeIdx = /^\d{4,6}$/.test((cells[3]||"").trim()) ? 4 : 3;
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
    const clube = cells[clubeIdx] || "";
    if (nome) {
      currentGroup.players.push({
        nome,
        clube: clube || null,
      });
    }
  }

  return result;
}

module.exports = {
  parseAdmissions,
  parseDraw,
  // utils exportados para testes
  _stripTags: stripTags,
  _decodeHTML: decodeHTML,
  _parseNum: parseNum,
};
