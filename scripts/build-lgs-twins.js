/**
 * scripts/build-lgs-twins.js
 *
 * Muitos nacionais RFEGolf (resultados só em PDF = totais por ronda) têm um
 * "gémeo" no LiveGolfScoring com o MESMO evento mas com buraco-a-buraco + metros.
 * São duplicados: o mesmo torneio aparece 2x na lista (uma vez por fonte).
 *
 * Este script cruza-os por NOME normalizado (sem o ano) + ANO e produz o mapa
 *   public/data/rfegolf-lgs-twins.json = { generatedAt, twins: { "<compId>": <lgsId> } }
 *
 * A app usa-o para: (1) ESCONDER o gémeo LGS da lista (canónico = RFEGolf), e
 * (2) FUNDIR o buraco-a-buraco + metros do LGS na página RFEGolf.
 *
 * USO: node scripts/build-lgs-twins.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..");
const RFEG_DIR = path.join(REPO, "public", "data", "rfegolf-resultats");
const LGS_DIR = path.join(REPO, "public", "data", "rfegolf-livegolfscoring");
const OUT = path.join(REPO, "public", "data", "rfegolf-lgs-twins.json");

function rj(f) { const r = fs.readFileSync(f, "utf8"); try { return JSON.parse(r); } catch (e) { return JSON.parse(r.slice(0, r.lastIndexOf("}") + 1)); } }
// normaliza nome: minúsculas, sem acentos, sem o ano, espaços colapsados
function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\b20\d\d\b/g, " ").replace(/\s+/g, " ").trim();
}

// 1) Índice LGS por nome+ano. Guarda também se tem hbh (preferir os que têm).
const lgsByKey = {};
for (const f of fs.readdirSync(LGS_DIR).filter((x) => /^\d+\.json$/.test(x))) {
  let d; try { d = rj(path.join(LGS_DIR, f)); } catch (e) { continue; }
  const yr = d.meta && d.meta.year; const nm = norm(d.meta && d.meta.name);
  if (!nm || !yr) continue;
  const hbh = (d.rounds || []).some((r) => (r.players || []).some((p) => Array.isArray(p.scores) && p.scores.length === 18));
  // Rondas EFECTIVAMENTE jogadas (≥1 jogador com total real) — não as agendadas.
  const played = (d.rounds || []).filter((r) => (r.players || []).some((p) => p.total != null && p.total > 0 && p.total < 999)).length;
  const key = nm + "|" + yr;
  // preferir entrada com hbh; senão a primeira
  if (!lgsByKey[key] || (hbh && !lgsByKey[key].hbh)) lgsByKey[key] = { id: d.id, hbh, played };
}

// nº de rondas com scores reais num rfegolf-resultats com mitarjeta injectado.
function rfegMitaPlayedRounds(d) {
  if (!d.mitarjetaTorneo) return 0;
  const g = (d.results || [])[0];
  if (!g || !Array.isArray(g.players)) return 0;
  let max = 0;
  for (const p of g.players) {
    const c = Array.isArray(p.rounds) ? p.rounds.filter((x) => typeof x === "number" && x > 0).length : 0;
    if (c > max) max = c;
  }
  return max;
}

// 2) Para cada RFEGolf, procurar gémeo
const twins = {};
// LGS ids a SUPRIMIR porque o gémeo rfegolf+mitarjeta tem MAIS rondas jogadas
// (live scoring à frente do scrape LGS — ex: R3 do CEE juvenil ainda só no
// mitarjeta). Mapeia lgsId → compId rfegolf preferido.
const lgsSuppressed = {};
let n = 0;
for (const f of fs.readdirSync(RFEG_DIR).filter((x) => /^\d+\.json$/.test(x))) {
  let d; try { d = rj(path.join(RFEG_DIR, f)); } catch (e) { continue; }
  if (!d || !d.ok) continue;
  const compId = d.compId || parseInt(f, 10);
  const yr = d.meta && d.meta.dateStart ? parseInt(String(d.meta.dateStart).slice(-4), 10) : null;
  if (!yr) continue;
  const key = norm(d.meta && d.meta.name) + "|" + yr;
  const lgs = lgsByKey[key];
  if (lgs && lgs.id != null) {
    const rfegPlayed = rfegMitaPlayedRounds(d);
    // Preferir o rfegolf+mitarjeta (fonte canónica live dos CEE juvenis) quando
    // tem PELO MENOS tantas rondas jogadas quanto o LGS. `>=` (não `>`) mantém as
    // categorias do MESMO campeonato todas na mesma fonte — senão, se uma categoria
    // (ex: Benjamín F, com R3 já no LGS) empatasse, o grupo partia-se em 2 fontes.
    if (d.mitarjetaTorneo && rfegPlayed >= (lgs.played || 0)) {
      lgsSuppressed[String(lgs.id)] = compId;
    } else {
      twins[String(compId)] = lgs.id; n++;
    }
  }
}

const out = { generatedAt: new Date().toISOString(), source: "scripts/build-lgs-twins.js", count: n, twins, lgsSuppressed };
fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
console.log(`build-lgs-twins: ${n} gémeos RFEGolf<->LGS -> ${path.relative(REPO, OUT)}`);
