/**
 * scripts/build-egr-rank-slim.js
 *
 * egr-ranking.json (5.9 MB, 17.5k jogadores M+F) → egr-rank-slim.json — lookup
 * compacto para a FICHA do kids2 (HeroIdentity): posição no ranking europeu
 * (egrRankSex), Avg to CR (métrica de nível normalizada pelo Course Rating),
 * pontos e o id EGR (link /egr/jogador/{id}).
 *
 * Só juniores (ageNum <= 21 — o corpus kids2 vai até U21 via ejo/ejt); adultos
 * ficam de fora para o ficheiro ser lazy-loadável (~0.6 MB vs 5.9).
 *
 * Chaves: `norm(nome)|ISO2` (tokens ORDENADOS — casa "First Last" e
 * "Last, First") + fallback `byName` só quando o nome é único no corpus
 * juvenil (mesma política do lookup de roster do adapter egr).
 *
 * Corre no update-egr.yml a seguir ao scrape do ranking.
 */
const fs = require("fs");
const path = require("path");
const { countryToIso2 } = require("./aggregator/util/names");

const DATA = path.join(__dirname, "..", "public", "data");
const MAX_AGE = 21;

/** normalização partilhada com o consumo na UI (HeroIdentity useEgrRank):
 *  minúsculas, sem diacríticos, sem pontuação, tokens ordenados. */
function egrNameKey(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[.,'\-]/g, " ")
    .split(/\s+/).filter(Boolean).sort().join(" ");
}

function main() {
  const rk = JSON.parse(fs.readFileSync(path.join(DATA, "egr-ranking.json"), "utf8"));
  const players = Array.isArray(rk.players) ? rk.players : [];
  const juniors = players.filter((p) => Number.isFinite(p.ageNum) && p.ageNum <= MAX_AGE);

  const byKey = {};   // "nome|ISO" → entry
  const byName = {};  // "nome" → entry (só se único)
  const nameDup = new Set();
  let n = 0;
  for (const p of juniors) {
    if (!p.name || !p.id) continue;
    const iso = countryToIso2(p.country) || "";
    // [id, sexo, rank no sexo, pontos, avgToCR, avgScore, eventos, birthYear]
    const entry = [String(p.id), p.sex || null, p.egrRankSex ?? null, p.egrPoints ?? null,
      p.avgToCR ?? null, p.avgScore ?? null, p.eventsCounting ?? null, p.birthYear ?? null];
    const nk = egrNameKey(p.name);
    const k = `${nk}|${iso}`;
    // colisão nome+país (homónimos): fica o mais bem classificado (rank menor)
    if (!byKey[k] || (entry[2] != null && (byKey[k][2] == null || entry[2] < byKey[k][2]))) byKey[k] = entry;
    if (nameDup.has(nk)) { /* já marcado ambíguo */ }
    else if (byName[nk]) { delete byName[nk]; nameDup.add(nk); }
    else byName[nk] = entry;
    n++;
  }

  const out = {
    generatedAt: new Date().toISOString(),
    note: "lookup ficha kids2: [id, sexo, rankSex, pontos, avgToCR, avgScore, eventos, birthYear]; byName só p/ nomes únicos",
    total: n,
    players: byKey,
    byName,
  };
  const file = path.join(DATA, "egr-rank-slim.json");
  fs.writeFileSync(file, JSON.stringify(out));
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`egr-rank-slim.json: ${n} juniores (<=U${MAX_AGE}) · ${Object.keys(byName).length} nomes únicos · ${kb} KB → ${file}`);
}

if (require.main === module) main();
module.exports = { egrNameKey };
