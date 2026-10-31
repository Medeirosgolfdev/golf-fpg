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
const { writeJsonGuarded } = require("./lib/shrink-guard");
const path = require("path");
const REPO = path.resolve(__dirname, "..");
const RFEG_DIR = path.join(REPO, "public", "data", "rfegolf-resultats");
const LGS_DIR = path.join(REPO, "public", "data", "rfegolf-livegolfscoring");
const OUT = path.join(REPO, "public", "data", "rfegolf-lgs-twins.json");

function rj(f) { const r = fs.readFileSync(f, "utf8"); try { return JSON.parse(r); } catch (e) { return JSON.parse(r.slice(0, r.lastIndexOf("}") + 1)); } }
// normaliza nome: minúsculas, sem acentos, sem o ano nem a edição em numeração
// romana ("XIV Memorial Blanca Mayor" na RFEG = "Memorial Blanca Mayor" no LGS),
// espaços colapsados
function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\b20\d\d\b/g, " ")
    .replace(/\b[ivxlc]{2,}\b/g, " ").replace(/\s+/g, " ").trim();
}

// A RFEG baptiza o mesmo evento de forma diferente em cada plataforma
// («Internacional de España Sub-18 Masculino 2026» = LGS «Spanish International
// U-18 Mens Championship 2026»): sem casar pelo nome, casa pelo PLANTEL — as
// regras da /rfeg (src/data/rfeg/entries.ts): datas a ≤ 7 dias, ≥ 5 jogadores,
// sobreposição ≥ 0,85 do plantel mais pequeno (o RFEG pode trazer só quem passou o cut).
const normJog = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z ]+/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
const PLANTEL_MIN = 0.85, PLANTEL_DIAS = 7 * 86400000;
const lgsPorPlantel = [];
const dmaMs = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || "")); return m ? Date.parse(`${m[3]}-${m[2]}-${m[1]}`) : NaN; };
function gemeoPorPlantel(d, usados) {
  const dia = dmaMs(d.meta && d.meta.dateStart);
  const nomes = new Set((d.results || []).flatMap((b) => b.players || []).map((p) => normJog(p.name)).filter(Boolean));
  if (!Number.isFinite(dia) || nomes.size < 5) return null;
  let melhor = null;
  for (const l of lgsPorPlantel) {
    if (usados.has(String(l.id)) || Math.abs(l.dia - dia) > PLANTEL_DIAS) continue;
    let comum = 0;
    for (const n of nomes) if (l.nomes.has(n)) comum++;
    const s = comum / Math.min(nomes.size, l.nomes.size);
    if (comum >= 5 && s >= PLANTEL_MIN && (!melhor || s > melhor.s)) melhor = { ...l, s };
  }
  return melhor;
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
  const dia = Date.parse((d.meta && d.meta.dateIso) || "");
  const nomes = new Set((d.rounds || []).flatMap((r) => r.players || []).map((p) => normJog(p.name)).filter(Boolean));
  if (Number.isFinite(dia) && nomes.size >= 5) lgsPorPlantel.push({ id: d.id, hbh, played, dia, nomes });
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
let n = 0, porPlantel = 0;
const rfegFiles = fs.readdirSync(RFEG_DIR).filter((x) => /^\d+\.json$/.test(x))
  .map((f) => { try { return { f, d: rj(path.join(RFEG_DIR, f)) }; } catch (e) { return null; } })
  .filter((x) => x && x.d && x.d.ok);
// Primeiro os gémeos pelo nome; o plantel só para os que sobram e com LGS por usar.
const usados = new Set();
const pendentes = [];
for (const { f, d } of rfegFiles) {
  const yr = d.meta && d.meta.dateStart ? parseInt(String(d.meta.dateStart).slice(-4), 10) : null;
  const lgs = yr ? lgsByKey[norm(d.meta && d.meta.name) + "|" + yr] : null;
  if (lgs && lgs.id != null) usados.add(String(lgs.id));
  pendentes.push({ f, d, lgs });
}
for (const p of pendentes) {
  if (p.lgs && p.lgs.id != null) continue;
  const l = gemeoPorPlantel(p.d, usados);
  if (l) { p.lgs = l; usados.add(String(l.id)); porPlantel++; }
}
for (const { f, d, lgs } of pendentes) {
  const compId = d.compId || parseInt(f, 10);
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
writeJsonGuarded(OUT, out, { spaces: 0, failOnRefuse: true });
console.log(`build-lgs-twins: ${n} gémeos RFEGolf<->LGS (${porPlantel} pelo plantel) -> ${path.relative(REPO, OUT)}`);
