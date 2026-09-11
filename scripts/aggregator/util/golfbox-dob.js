/**
 * scripts/aggregator/util/golfbox-dob.js
 *
 * Preenche a DATA DE NASCIMENTO dos jogadores que as fontes não a dão, a partir
 * do roster GolfBox (`public/data/golfbox-players.json`, gerado por
 * scripts/build-golfbox-players.js — EGA + federações do norte da Europa).
 *
 * Porquê ANTES do matcher: a DOB não é só um dado a mostrar, é a evidência que
 * o identity-matcher usa para juntar o mesmo miúdo visto em fontes diferentes.
 * Um norueguês que apareça no Spanish International e no Belgian U14 são hoje
 * duas entidades soltas; com a data de nascimento passam a uma.
 *
 * ⚠ REGRAS DE SEGURANÇA — uma DOB errada aqui FUNDE pessoas diferentes, que é o
 * pior erro que este agregador pode cometer. Por isso:
 *   1. só se toca em jogadores SEM dob;
 *   2. o país tem de bater (o roster tem 20+ nacionalidades e nomes repetem-se
 *      entre países);
 *   3. nomes ambíguos — mais do que um jogador do mesmo país com aquele nome —
 *      são deixados em paz;
 *   4. entradas do roster com duas datas para o mesmo nome (`dobAlt`) já vêm
 *      descartadas.
 * A chave de nome é indiferente à ordem e ao nome do meio ("JOHANSEN, Martim"
 * ↔ "Martim Pinto Johansen"), como no resto do projecto.
 */

const fs = require("fs");
const path = require("path");

const ROSTER = path.resolve(__dirname, "../../../public/data/golfbox-players.json");

/** ß/ø/æ/ð/þ não se decompõem em NFD — sem isto nenhum nome nórdico ou alemão casa. */
function toks(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/ß/g, "ss").replace(/ø/g, "o").replace(/æ/g, "ae")
    .replace(/ð/g, "d").replace(/þ/g, "th").replace(/[^a-z ]/g, " ")
    .split(" ").filter(Boolean);
}
function chaves(nome) {
  const t = toks(nome);
  if (t.length < 2) return [];
  const ordenado = [...t].sort().join(" ");
  const extremos = [t[0], t[t.length - 1]].sort().join("|");
  return ordenado === extremos ? [ordenado] : [ordenado, extremos];
}

/** Códigos do GolfBox para as nações britânicas e Irlanda → o nosso vocabulário. */
const NAT_ALIAS = { EN: "GB", SQ: "GB", WL: "GB", IG: "IE", GB: "GB" };
function natKey(v) {
  const s = String(v || "").toUpperCase();
  if (!s) return null;
  if (NAT_ALIAS[s]) return NAT_ALIAS[s];
  if (/^GB-/.test(s)) return "GB";
  return s.slice(0, 2);
}

function carregarRoster(file = ROSTER) {
  if (!fs.existsSync(file)) return null;
  let d;
  try { d = JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return null; }
  const idx = new Map();
  for (const p of d.players || []) {
    if (!p.name || !p.dob || p.dobAlt) continue;
    for (const k of chaves(p.name)) {
      const arr = idx.get(k);
      if (arr) arr.push(p); else idx.set(k, [p]);
    }
  }
  return idx;
}

/** Ficha do roster para um nome+país, ou null se não houver certeza. */
function procurar(idx, nome, pais) {
  if (!idx) return null;
  const want = natKey(pais);
  for (const k of chaves(nome)) {
    const todos = idx.get(k) || [];
    const cand = want ? todos.filter((p) => natKey(p.nat) === want) : todos;
    if (cand.length === 1) return cand[0];
    if (cand.length > 1) return null;        // homónimos no mesmo país → não se escolhe
  }
  return null;
}

/**
 * Preenche `dob` (e `club`/`extra.golfboxMemberId` quando faltam) nos jogadores
 * dos rawSources. Devolve estatísticas por fonte.
 */
function enrichWithGolfbox(rawSources, opts = {}) {
  const idx = carregarRoster(opts.file);
  if (!idx) return { disponivel: false, total: 0, porFonte: {} };
  const porFonte = {};
  let total = 0;
  for (const src of rawSources || []) {
    for (const p of src.players || []) {
      if (p.dob) continue;
      // Sem país declarado não se arrisca: o roster tem 20+ nacionalidades.
      const hit = procurar(idx, p.name, p.country);
      if (!hit) continue;
      p.dob = hit.dob;
      if (!p.club && hit.club) p.club = hit.club;
      p.extra = p.extra || {};
      p.extra.dobSource = "golfbox";
      if (hit.memberId) p.extra.golfboxMemberId = hit.memberId;
      porFonte[src.sourceId] = (porFonte[src.sourceId] || 0) + 1;
      total++;
    }
  }
  return { disponivel: true, total, porFonte };
}

module.exports = { enrichWithGolfbox, carregarRoster, procurar, chaves, natKey };
