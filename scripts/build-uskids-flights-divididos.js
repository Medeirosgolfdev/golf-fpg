#!/usr/bin/env node
/**
 * scripts/build-uskids-flights-divididos.js — escalões USKids divididos em vários flights.
 *
 * Nas provas grandes (World Championship, World Teen) a USKids parte um escalão em dois
 * flights, «A» e «B», cada um com o seu leaderboard e às vezes o seu campo (World 2023
 * Boys 10: A em Legacy Golf Links, B em Quail Ridge). O histórico de membros só diz
 * «Boys 10» — sem isto os dois leaderboards juntavam-se e o escalão ficava com dois
 * vencedores (ou lugares melhores com totais piores, quando só temos parte do field).
 *
 * Lê a `data-archive/uskids-rich-flight-cache.json.gz` (o meta de cada prova + os flights
 * com os cartões de todos os jogadores, sem pedidos à USKids) e grava
 * `public/data/uskids-flights-divididos.json`, pequeno, para o agregador:
 *   { gerado_em, torneios: { [tcode]: { [escalão]: { flights: [
 *       { fid, nome, inscritos, voltas, cursos[], par[]|null, jardas[]|null, cartoes[]|null } ] } } } }
 * `cartoes` = impressão digital de cada jogador do flight (as pancadas das voltas jogadas),
 * só nos flights que a cache tem; `par`/`jardas` só quando o flight jogou tudo num campo.
 * (A cache inteira ocupa ~1,6 GB em memória — o agregador não a pode ler.)
 *
 * Exit: 0 gravou · 2 nada de novo · 1 erro. Corre nos workflows que mexem na cache
 * (update-uskids-rich-players.yml e update-uskids-edicoes.yml).
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { writeJsonGuarded } = require("./lib/shrink-guard");
const { cartaoDe } = require("./aggregator/util/uskids-posicoes");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "data-archive", "uskids-rich-flight-cache.json.gz");
const OUT = path.join(ROOT, "public", "data", "uskids-flights-divididos.json");

/** Escalões com 2+ flights com inscritos, a partir do meta e dos flights de uma prova. */
function divididosDe(entry) {
  const m = entry?.meta;
  if (!m?.flights || !m.age_groups) return null;
  const porEscalao = new Map();
  for (const [fid, f] of Object.entries(m.flights)) {
    if (!(Number(f.registered) > 0)) continue; // «DONTDELETE» e afins, sem ninguém
    const nome = m.age_groups[f.age_group]?.name;
    if (!nome) continue;
    if (!porEscalao.has(nome)) porEscalao.set(nome, []);
    porEscalao.get(nome).push([fid, f]);
  }
  const out = {};
  for (const [escalao, fls] of porEscalao) {
    if (fls.length < 2) continue;
    out[escalao] = {
      flights: fls.map(([fid, f]) => {
        const rondas = Object.entries(m.flight_rounds || {})
          .filter(([, r]) => String(r.flight) === fid)
          .sort((a, b) => a[1].round - b[1].round);
        const cursos = rondas.map(([, r]) => m.courses?.[r.course]?.name ?? String(r.course));
        const fc = rondas.map(([frId]) => m.flight_courses?.[frId]).filter(Boolean);
        const umCampo = rondas.length > 0 && new Set(rondas.map(([, r]) => r.course)).size === 1 && fc.length === rondas.length;
        const cf = entry.flights?.[fid];
        return {
          fid,
          nome: f.name || null,
          inscritos: Number(f.registered),
          voltas: rondas.length,
          cursos,
          par: umCampo ? fc[0].pars : null,
          jardas: umCampo ? fc[0].lengths : null,
          cartoes: cf?.players
            ? Object.values(cf.players)
                .map((p) => cartaoDe(Object.entries(p.rounds || {}).map(([n, r]) => ({ round: Number(n), strokes: r.strokes, gross: r.numStrokes }))))
                .filter(Boolean)
            : null,
        };
      }),
    };
  }
  return Object.keys(out).length ? out : null;
}

function main() {
  if (!fs.existsSync(CACHE)) {
    console.error(`[flights-divididos] falta ${path.relative(ROOT, CACHE)}`);
    process.exitCode = 1;
    return;
  }
  // Ilegível é erro, nunca «vazio»
  const torneios = JSON.parse(zlib.gunzipSync(fs.readFileSync(CACHE))).torneios;
  if (!torneios || typeof torneios !== "object") throw new Error("cache sem `torneios`");
  const out = {};
  let n = 0;
  for (const [tcode, entry] of Object.entries(torneios)) {
    const d = divididosDe(entry);
    if (d) { out[tcode] = d; n += Object.keys(d).length; }
  }
  const data = { gerado_em: new Date().toISOString(), torneios: out };
  const antes = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")).torneios : null;
  if (antes && JSON.stringify(antes) === JSON.stringify(out)) {
    console.log(`[flights-divididos] ${n} escalões divididos — nada de novo`);
    process.exitCode = 2;
    return;
  }
  const r = writeJsonGuarded(OUT, data, { count: (d) => Object.keys(d.torneios).length, label: "uskids-flights-divididos", spaces: 0, failOnRefuse: true });
  if (r.written) console.log(`[flights-divididos] ${Object.keys(out).length} provas · ${n} escalões divididos`);
}

if (require.main === module) main();
module.exports = { divididosDe };
