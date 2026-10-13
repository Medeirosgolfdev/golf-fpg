/**
 * scripts/lib/fpg-matchplay-parse.js
 *
 * Lê o quadro de MATCH PLAY público da FPG
 * (`scoring-pt.datagolf.pt/scripts/matchplay.asp?club=000&tourn=00023`) e
 * devolve-o no schema `MatchplayFile` (src/ui/circuit/matchplayTypes.ts), o
 * mesmo que a <MatchplayView> já desenha para a FFG e as ETC.
 *
 * A página é uma grelha HTML: cada ronda é uma coluna (TDHeader nas colunas
 * 1,3,5…), os jogadores (TDPlayer) aparecem por ordem de quadro e cada par
 * consecutivo é um jogo; o TDMatch entre os dois diz "Match N Tee T MM-DD HH:MM";
 * o resultado ("2 & 1", "1 UP", "21 Buracos") fica na coluna seguinte, na linha
 * do VENCEDOR. Quem ganhou confirma-se por aparecer na ronda seguinte (ou no
 * campo "Vencedor" depois da final). Um resultado sem vencedor na ronda
 * seguinte ("2 (5)") é um jogo a decorrer.
 *
 * ⚠ A página não traz cartões, clube nem federado — só nomes e cabeças de
 * série. O `tourn` do quadro NÃO é o tcode da classificação (o 00023 da
 * classif é outro torneio); a ligação à qualificação é feita no scraper.
 */
"use strict";

/** Decodifica os bytes da página: declara UTF-8 mas há quadros em CP1252. */
function decodeMatchplayHtml(buf) {
  if (typeof buf === "string") return buf;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

const decodeEntities = (s) => s
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

const cellText = (html) => decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/** Grelha: [{ row, col, cls, text }] com a coluna real (conta colspans). */
function parseGrid(html) {
  const cells = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  rows.forEach((tr, row) => {
    let col = 0;
    const re = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
    let m;
    while ((m = re.exec(tr))) {
      const attrs = m[1];
      const cls = (attrs.match(/class="?(\w+)/i) || [])[1] || "";
      const span = Number((attrs.match(/colspan="?(\d+)/i) || [])[1] || 1);
      cells.push({ row, col, cls, text: cellText(m[2]) });
      col += span;
    }
  });
  return cells;
}

/** "Match 7 Tee 10 10-13  11:00" → { matchNo, tee, mmdd, hour } */
function parseMatchInfo(text) {
  const m = text.match(/Match\s+(\d+)(?:\s+Tee\s+(\S+))?(?:\s+(\d{2}-\d{2}))?(?:\s+(\d{1,2}:\d{2}))?/i);
  if (!m) return null;
  return { matchNo: Number(m[1]), tee: m[2] || null, mmdd: m[3] || null, hour: m[4] || null };
}

/** "21 Buracos" → "21 buracos"; o resto fica como a FPG o escreve ("2 & 1", "1 UP"). */
const normResult = (s) => (s ? s.replace(/\bBuracos\b/i, "buracos") : null);

/**
 * @param {string|Buffer} input  HTML do matchplay.asp
 * @param {{ slug?: string, year?: number|null, source?: string, scrapedAt?: string }} [meta]
 * @returns {object|null} MatchplayFile (um flight "Match Play") ou null se não há quadro
 */
function parseMatchplayHtml(input, meta = {}) {
  const html = decodeMatchplayHtml(input);
  const title = cellText((html.match(/<div align=center>\s*<p>([\s\S]*?)<\/p>/i) || [])[1] || "") || null;
  const cells = parseGrid(html);

  const headers = cells.filter((c) => c.cls === "TDHeader");
  if (!headers.length) return null;
  const roundCols = headers.map((h) => h.col);
  const dates = new Map(cells.filter((c) => c.cls === "TDdates").map((c) => [c.col, c.text]));
  const at = (row, col) => cells.find((c) => c.row === row && c.col === col);

  // Jogadores de cada coluna, por ordem do quadro (linha a linha).
  const playersIn = (col) => cells
    .filter((c) => c.col === col && c.cls === "TDPlayer")
    .sort((a, b) => a.row - b.row);

  // Campeão: o TDPlayer a seguir ao rótulo "Vencedor" (depois da última ronda).
  const winnerCol = roundCols[roundCols.length - 1] + 2;
  const vencedorLbl = cells.find((c) => c.col === winnerCol && /^vencedor$/i.test(c.text));
  const champion = vencedorLbl
    ? (playersIn(winnerCol).find((c) => c.row > vencedorLbl.row)?.text || null)
    : (playersIn(winnerCol)[0]?.text || null);

  const year = meta.year ?? null;
  const rounds = roundCols.map((col, ri) => {
    const ps = playersIn(col);
    const nextNames = ri + 1 < roundCols.length
      ? playersIn(roundCols[ri + 1]).map((c) => c.text)
      : null;
    const matchCells = cells.filter((c) => c.col === col && c.cls === "TDMatch");
    const matches = [];
    for (let i = 0; i + 1 < ps.length; i += 2) {
      const a = ps[i], b = ps[i + 1];
      const slot = i / 2;
      const info = parseMatchInfo(matchCells.find((c) => c.row > a.row && c.row < b.row)?.text || "");
      const resA = at(a.row, col + 1)?.text || "";
      const resB = at(b.row, col + 1)?.text || "";
      const nameA = a.text || null, nameB = b.text || null;
      const seedA = ri === 0 ? Number(at(a.row, col - 1)?.text) || null : null;
      const seedB = ri === 0 ? Number(at(b.row, col - 1)?.text) || null : null;
      // Quem segue: o nome no slot correspondente da ronda seguinte (ou o campeão).
      const nextName = nextNames ? nextNames[slot] || null : champion;
      let winner = null;
      if (nextName && nameA && nextName === nameA) winner = "home";
      else if (nextName && nameB && nextName === nameB) winner = "away";
      else if (!nameB && nameA && nextName === nameA) winner = "home";   // bye
      const result = normResult(resA || resB || null);
      const side = (name, seed) => (name
        ? { teamId: null, name, iso: null, country: null, points: null, isLead: false, ...(seed ? { seed } : {}) }
        : null);
      const startTime = info?.hour ? (info.tee ? `${info.hour} · Tee ${info.tee}` : info.hour) : null;
      matches.push({
        teamMatchId: null,
        matchNo: info?.matchNo ?? null,
        startTime,
        result,
        isSettled: winner != null,
        isStarted: winner != null || !!result,
        home: side(nameA, seedA),
        away: side(nameB, seedB),
        winner,
        games: [],
      });
    }
    const d = dates.get(col) || null;
    return {
      number: ri + 1,
      name: headers[ri].text || `Ronda ${ri + 1}`,
      date: d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null,
      matches,
    };
  }).filter((r) => r.matches.length);

  if (!rounds.length) return null;
  return {
    tournament: title,
    slug: meta.slug || "",
    year,
    format: "KnockOut",
    parentCompetitionId: null,
    startDate: rounds[0].date ?? undefined,
    endDate: rounds[rounds.length - 1].date ?? undefined,
    champion,
    flights: [{
      competitionId: 1,
      name: "Match Play",
      format: "KnockOut",
      parentId: null,
      isCompleted: !!champion,
      source: meta.source || "",
      rounds,
    }],
    scrapedAt: meta.scrapedAt || "",
  };
}

module.exports = { parseMatchplayHtml, decodeMatchplayHtml, parseMatchInfo };
