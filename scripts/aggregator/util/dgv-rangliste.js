/**
 * scripts/aggregator/util/dgv-rangliste.js — ano de nascimento e clube dos alemães
 * pela DGV-Jugendrangliste (scripts/scrape-dgv-rangliste.js). 03/11/2026.
 *
 * Não é uma fonte: não cria fichas nem provas. Corre depois do matcher e só
 * completa fichas alemãs sem data nem ano: o «Jahrgang» publicado pela DGV é um
 * ano CERTO (`birthYear`, birthYearSource «dgv-rangliste»). A DGV distingue
 * homónimos com uma marca entre parênteses («MAIER, Luis (R)» de Reutlingen e o
 * de München, os dois de 2013): com vários candidatos decide o clube; sem ele não
 * se escolhe. O scout ainda recusa o ano se contradisser os escalões USKids.
 *
 * Entrada (opcional): public/data/dgv-rangliste.json
 */
const path = require("path");
const { DATA_DIR, readJsonSafe } = require("./io");

/** Palavras do nome, ordenadas, sem acentos nem a marca «(R)». */
const chave = (s) => String(s || "").replace(/\([^)]*\)/g, " ").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/ß/g, "ss").replace(/[^a-z ]+/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
const clubeN = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, "");
const mesmoClube = (a, b) => { const x = clubeN(a), y = clubeN(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };

function enrichWithDgvRangliste(res) {
  const file = readJsonSafe(path.join(DATA_DIR, "dgv-rangliste.json"), null);
  if (!Array.isArray(file?.jogadores) || !file.jogadores.length) return { disponivel: false };
  const porNome = new Map();
  for (const r of file.jogadores) {
    if (!r.ano) continue;
    const k = chave(r.nome);
    if (!porNome.has(k)) porNome.set(k, []);
    porNome.get(k).push(r);
  }
  const st = { anos: 0, clubes: 0, homonimos: 0 };
  for (const j of res.juniors) {
    if (j.dob || j.birthYear) continue;
    if (j.country !== "DE" && !(j.countries || []).includes("DE")) continue;
    let cands = [];
    for (const n of new Set([j.canonicalName, ...(j.aliases || [])].map(chave))) cands.push(...(porNome.get(n) || []));
    cands = [...new Set(cands)];
    if (cands.length > 1) {
      const doClube = cands.filter((r) => mesmoClube(r.clube, j.club));
      if (doClube.length !== 1) { st.homonimos++; continue; }
      cands = doClube;
    }
    if (cands.length !== 1) continue;
    const [r] = cands;
    j.birthYear = r.ano;
    j.birthYearSource = "dgv-rangliste";
    st.anos++;
    if (!j.club && r.clube) { j.club = r.clube; st.clubes++; }
  }
  return { disponivel: true, ...st };
}

module.exports = { enrichWithDgvRangliste, chave };
