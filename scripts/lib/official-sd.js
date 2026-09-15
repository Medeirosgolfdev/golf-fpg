/**
 * official-sd.js — o SD OFICIAL da FPG (o `sgd` do WHS) para as voltas dos
 * ficheiros de torneios.
 *
 * Regra do site (decisão 2026-09-15): mostra-se o SD que a FPG atribuiu àquele
 * jogador naquela volta sempre que o temos; sem ele, o calculado com o HCP da
 * inscrição (computeSD). O cartão público do torneio não traz o SD; só o WHS de
 * cada jogador. Duas fontes:
 *   1. output/{fed}/whs.json — os jogadores que acompanhamos (fpg-scrape-node);
 *   2. data-archive/whs-sd.json — ~1.000 juniores descarregados uma vez.
 *
 * Usado pelo backfill-sd.js (grava o SD em cada volta: `roundScores[].sd`, ou
 * `sd` no jogador em formato flat).
 */
"use strict";
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const DATA = path.join(REPO, "public", "data");
const OUTPUT = path.join(REPO, "output");
const INDEX_FILE = path.join(REPO, "data-archive", "whs-sd.json");

/** Ficheiros de resultados em formato "fpg-pull". */
const FILE_RX = /^(pull-torneios\d+|drive-data-\d{4}-\d{2}|aquapor-data-\d{4}-\d{2}|jovens_\d{4})\.json$/;

function tournamentFiles() {
  return fs.readdirSync(DATA).filter((f) => FILE_RX.test(f)).sort().map((f) => path.join(DATA, f));
}

/** Data (ISO) da ronda N de um torneio que começa em `date` (meio-dia UTC para
 *  não escorregar de dia com o horário de verão). */
function roundDate(date, round) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (Math.max(1, round || 1) - 1));
  return d.toISOString().slice(0, 10);
}

/** Gross de uma volta com cartão; sentinelas ≥900 (998 ND/NR, 999 NS/WD) e
 *  voltas sem gross não têm SD. */
function validGross(g) {
  const n = typeof g === "string" ? parseInt(g, 10) : g;
  return Number.isFinite(n) && n > 0 && n < 900 ? n : null;
}

/** Todas as voltas com cartão de um ficheiro de torneios. `rs` é null nos
 *  jogadores em formato flat (uma volta, sem roundScores). */
function* roundsOf(doc) {
  for (const t of doc.tournaments || []) {
    if (!t.date) continue;
    for (const p of t.players || []) {
      const fed = String(p.fedCode || p.fed || "").trim();
      if (!/^\d+$/.test(fed)) continue;
      const list = Array.isArray(p.roundScores) && p.roundScores.length ? p.roundScores : null;
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const rs = list[i];
          const gross = validGross(rs.gross);
          if (gross == null) continue;
          yield { t, p, fed, rs, i, n: list.length, date: roundDate(t.date, rs.round || i + 1), gross };
        }
      } else {
        const gross = validGross(p.grossTotal);
        if (gross == null) continue;
        yield { t, p, fed, rs: null, i: 0, n: 1, date: t.date, gross };
      }
    }
  }
}

/** { date, tcode, gross, sd } de cada volta do WHS de um jogador que acompanhamos. */
function whsRows(fed) {
  const f = path.join(OUTPUT, fed, "whs.json");
  if (!fs.existsSync(f)) return null;
  let arr;
  try { arr = JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; }
  if (!Array.isArray(arr)) return null;
  const rows = [];
  for (const r of arr) {
    const sd = parseFloat(r.sgd);
    const date = String(r.hcp_dateStr || "").slice(0, 10);
    if (!Number.isFinite(sd) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rows.push({ date, tcode: r.tournament_code ? Number(r.tournament_code) : null, gross: null, sd });
  }
  return rows;
}

function loadIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8")); } catch { return { feds: {} }; }
}

/** Linhas do índice descarregado: [data, tcode|null, gross|null, sd]. */
function indexRows(index, fed) {
  const e = index.feds && index.feds[fed];
  if (!e) return [];
  return e.rows.map(([date, tcode, gross, sd]) => ({ date, tcode, gross, sd }));
}

/**
 * SD oficial de uma volta, ou null. Casa pela DATA da volta e desempata pelo
 * tcode (quando a fonte o tem) e depois pelo gross. Um torneio com dia de
 * descanso desalinha as datas — aí, se o WHS tiver exactamente tantas voltas
 * desse tcode na semana do torneio como o jogador tem rondas, casa pela ordem.
 * ⚠ Nunca casa só por tcode: a FPG reutiliza tcodes entre clubes e anos.
 */
function matchOfficialRow(rows, v) {
  if (!rows || !rows.length) return null;
  const tcode = Number(v.t.tcode) || null;
  const sameDay = rows.filter((r) => r.date === v.date);
  const byTcode = tcode ? sameDay.filter((r) => r.tcode === tcode) : [];
  if (byTcode.length === 1) return byTcode[0];
  const pool = byTcode.length ? byTcode : sameDay.filter((r) => r.tcode == null || !tcode || r.tcode === tcode);
  if (pool.length === 1) return pool[0];
  if (pool.length > 1) {
    const byGross = pool.filter((r) => r.gross === v.gross);
    return byGross.length === 1 ? byGross[0] : null;
  }
  return null;
}

/** Permutação do grupo que minimiza Σ|SD calculado − SD oficial| (grupos de ≤4;
 *  sem cálculo o custo é 0 e fica a ordem do WHS). perm[pos] = índice no grupo. */
function melhorPermutacao(grupo, calcs) {
  const idx = grupo.map((_, i) => i);
  let best = idx, bestCost = Infinity;
  const perm = (arr, k) => {
    if (k === arr.length) {
      const cost = arr.reduce((s, gi, pos) => s + (calcs[pos] == null ? 0 : Math.abs(calcs[pos] - grupo[gi].sd)), 0);
      if (cost < bestCost - 1e-9) { bestCost = cost; best = arr.slice(); }
      return;
    }
    for (let i = k; i < arr.length; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]];
      perm(arr, k + 1);
      [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  };
  if (grupo.length <= 4) perm(idx.slice(), 0);
  return best;
}

/**
 * SD oficial de TODAS as voltas de um jogador num torneio, de uma vez.
 * Porquê: há provas com duas voltas no mesmo dia (Taça João Salazar de Sousa
 * 2026, 038/10758: R1 a 12-09, R2 e R3 a 13-09). O WHS traz então duas linhas
 * com a mesma data e o mesmo tcode, e o my.fpg.pt não diz o gross — casar volta
 * a volta dava à R3 o SD da R2. Quando o WHS tem tantas voltas desse tcode na
 * semana do torneio como o jogador tem cartões, casa-se pela ORDEM das datas e,
 * dentro do mesmo dia, pela proximidade ao SD calculado de cada volta (`calc`).
 * Nos outros casos, volta a volta (matchOfficialRow), sem repetir linhas.
 * @param rows linhas oficiais do jogador
 * @param vs   voltas do jogador nesse torneio (roundsOf)
 * @param calc (v) => SD calculado dessa volta, ou null
 * @returns SD oficial por volta (null = sem correspondência segura)
 */
function matchPlayer(rows, vs, calc) {
  const out = vs.map(() => null);
  if (!rows || !rows.length || !vs.length) return out;
  const t = vs[0].t;
  const tcode = Number(t.tcode) || null;
  const fim = roundDate(t.date, 8);
  const semana = tcode
    ? rows.filter((r) => r.tcode === tcode && r.date >= t.date && r.date < fim).sort((a, b) => a.date.localeCompare(b.date))
    : [];
  if (semana.length && semana.length === vs.length) {
    const ordem = vs.map((_, i) => i).sort((a, b) => ((vs[a].rs && vs[a].rs.round) || a + 1) - ((vs[b].rs && vs[b].rs.round) || b + 1));
    for (let k = 0; k < semana.length;) {
      let j = k;
      while (j < semana.length && semana[j].date === semana[k].date) j++;
      const grupo = semana.slice(k, j);
      const quem = ordem.slice(k, j);
      const perm = melhorPermutacao(grupo, quem.map((i) => calc(vs[i])));
      perm.forEach((gi, pos) => { out[quem[pos]] = grupo[gi].sd; });
      k = j;
    }
    return out;
  }
  const usadas = new Set();
  vs.forEach((v, i) => {
    const r = matchOfficialRow(rows.filter((x) => !usadas.has(x)), v);
    if (r) { usadas.add(r); out[i] = r.sd; }
  });
  return out;
}

module.exports = {
  REPO, DATA, OUTPUT, INDEX_FILE, FILE_RX,
  tournamentFiles, roundDate, validGross, roundsOf, whsRows, loadIndex, indexRows, matchPlayer,
};
