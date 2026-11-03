/**
 * scripts/aggregator/util/golfdata-se.js — data de nascimento e clube dos suecos
 * pelo golfdata.se (ranking da federação sueca). 03/11/2026.
 *
 * Não é uma fonte: não cria fichas nem provas. Corre depois do matcher e só
 * completa fichas suecas SEM data com o registo do mesmo nome que o
 * scripts/scrape-golfdata-se.js encontrou (um só jogador com esse apelido e
 * primeiro nome). Guardas: o nome tem de ser único entre as fichas suecas, a
 * data tem de ser de um júnior (nascido em 2004 ou depois) e bater com um ano
 * certo que a ficha já tenha. O clube só entra se a ficha não tiver. O id da
 * ficha não muda (é calculado antes).
 *
 * Entrada (opcional): public/data/golfdata-se.json
 */
const path = require("path");
const { DATA_DIR, readJsonSafe } = require("./io");

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
const ANO_MIN = 2004;

function enrichWithGolfdataSe(res) {
  const file = readJsonSafe(path.join(DATA_DIR, "golfdata-se.json"), null);
  if (!file?.porNome) return { disponivel: false };
  const suecos = res.juniors.filter((j) => j.country === "SE" || (j.countries || []).includes("SE"));
  // nome → fichas suecas com esse nome (canónico ou alias)
  const porNome = new Map();
  for (const j of suecos) for (const n of new Set([j.canonicalName, ...(j.aliases || [])].map(norm))) {
    if (!n) continue;
    if (!porNome.has(n)) porNome.set(n, new Set());
    porNome.get(n).add(j);
  }
  const st = { datas: 0, clubes: 0, homonimos: 0, recusados: 0 };
  for (const [nome, r] of Object.entries(file.porNome)) {
    if (!r?.playerId || !r.dob) continue;
    const fichas = porNome.get(nome);
    if (!fichas) continue;
    if (fichas.size > 1) { st.homonimos++; continue; }
    const [j] = fichas;
    const ano = +r.dob.slice(0, 4);
    if (ano < ANO_MIN || (j.birthYear && j.birthYear !== ano) || (j.dob && j.dob !== r.dob)) { st.recusados++; continue; }
    j.golfdataSe = { playerId: r.playerId, clube: r.clube || null };
    if (!j.dob) { j.dob = r.dob; st.datas++; }
    if (!j.club && r.clube) { j.club = r.clube; st.clubes++; }
  }
  return { disponivel: true, ...st };
}

module.exports = { enrichWithGolfdataSe };
