/**
 * scripts/aggregator/util/form.js
 *
 * Forma recente de cada junior, para a aba «Quem repete» dos circuitos
 * (CircuitShell) — 14/10/2026. A página não pode carregar os shards
 * juniors-tournaments-*.json (~130 MB), por isso o agregador escreve aqui um
 * resumo pequeno: os últimos torneios de cada junior (data, ±par, buracos,
 * lugar, tamanho do field) e os confrontos com o Manuel no mesmo escalão.
 *
 * Vai dentro do juniors-scout.json (campo `f`, util/scout.js) desde 23/10/2026;
 * antes era o juniors-form.json. Forma:
 *   { schemaVersion, generatedAt, manuelId, keep, players: {
 *       [juniorId]: { r: [[data, toPar, buracos, pos, field], …mais recente primeiro],
 *                     m?: [Manuel à frente, Manuel atrás] } } }
 */
const MANUEL_ID = "u630106";
const KEEP = 6;          // torneios por junior
const MAX_AGE_DAYS = 550; // ~18 meses — mais antigo não é «forma»

function holesPlayed(res) {
  let n = 0;
  for (const r of res.rounds || []) for (const s of r.strokes || []) if (s > 0) n++;
  return n;
}

function buildForm(tournaments, generatedAt) {
  const cutoff = new Date(Date.parse(generatedAt) - MAX_AGE_DAYS * 864e5).toISOString().slice(0, 10);
  const recent = new Map();   // juniorId → [[date,toPar,holes,pos,field]]
  const vsM = new Map();      // juniorId → [ahead, behind]
  // O mesmo torneio chega por DUAS fontes às vezes (ex.: USKids + Doral) →
  // contar uma vez: forma por data+±par+buracos, confrontos por data+adversário.
  const seenR = new Set(), seenM = new Set();

  for (const t of tournaments) {
    const date = t.date || "";
    for (const fl of t.flights || []) {
      const ok = (fl.results || []).filter((r) => r.juniorId && r.status === "OK" && r.toPar != null);
      const field = (fl.results || []).length;
      if (date >= cutoff) {
        for (const r of ok) {
          const h = holesPlayed(r);
          if (!h) continue;
          const kr = `${r.juniorId}|${date}|${r.toPar}|${h}`;
          if (seenR.has(kr)) continue;
          seenR.add(kr);
          let arr = recent.get(r.juniorId);
          if (!arr) recent.set(r.juniorId, (arr = []));
          arr.push([date, r.toPar, h, typeof r.pos === "number" ? r.pos : null, field]);
        }
      }
      const m = ok.find((r) => r.juniorId === MANUEL_ID);
      if (m && typeof m.pos === "number") {
        for (const r of ok) {
          if (r.juniorId === MANUEL_ID || typeof r.pos !== "number" || r.pos === m.pos) continue;
          const km = `${r.juniorId}|${date}`;
          if (seenM.has(km)) continue;
          seenM.add(km);
          let v = vsM.get(r.juniorId);
          if (!v) vsM.set(r.juniorId, (v = [0, 0]));
          if (m.pos < r.pos) v[0]++; else v[1]++;
        }
      }
    }
  }

  const players = {};
  for (const [id, arr] of recent) {
    arr.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
    players[id] = { r: arr.slice(0, KEEP) };
  }
  for (const [id, v] of vsM) (players[id] ||= { r: [] }).m = v;
  return { schemaVersion: 1, generatedAt, manuelId: MANUEL_ID, keep: KEEP, players };
}

module.exports = { buildForm, MANUEL_ID };
