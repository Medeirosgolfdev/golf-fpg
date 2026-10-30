"use strict";
/**
 * scripts/lib/golfdirecto-twins.js — a mesma prova no golfdirecto e num PDF
 * regional (FVG País Basco, FGCV Valência). 30/10/2026.
 *
 * As federações publicam muitas vezes as duas coisas: o live scoring no
 * golfdirecto (cartões buraco a buraco) e o PDF da classificação no site.
 * Fica a do golfdirecto; a do PDF sai do índice da /rfeg e dos rivais.
 *
 * Gémeo = jogos golfdirecto a ±1 dia que têm ≥ 75% dos jogadores do PDF
 * (pelo menos 3; Meaztegi 2026: 23 de 30). Com menos (só a fase final, um
 * escalão), o PDF fica.
 */
const fs = require("fs");
const path = require("path");

const FCG_DIR = path.resolve(__dirname, "../../public/data/fcg");
const MIN_SOBREPOSICAO = 0.75;

let cache = null;
/** Jogos golfdirecto com jogadores: { dia (ms), licencas: Set }. */
function jogos() {
  if (cache) return cache;
  cache = [];
  if (!fs.existsSync(FCG_DIR)) return cache;
  for (const f of fs.readdirSync(FCG_DIR).filter((x) => /^[0-9a-f]{24}\.json$/.test(x))) {
    const j = JSON.parse(fs.readFileSync(path.join(FCG_DIR, f), "utf8"));   // ilegível = erro
    const d = j.game && j.game.scheduleStartDate;
    const lic = new Set((j.categories || []).flatMap((c) => c.players || []).map((p) => p.license).filter(Boolean));
    if (d && lic.size) cache.push({ gameId: j.gameId, dia: Date.parse(d.slice(0, 10)), licencas: lic });
  }
  return cache;
}

/** «dd/mm/aaaa» ou ISO → ms do dia. */
function diaMs(data) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(data || ""));
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : String(data || "").slice(0, 10);
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** gameIds golfdirecto que já cobrem esta prova (ou null). Soma os jogos do
 *  mesmo dia (±1), porque há federações com um jogo por escalão. */
function gemeoGolfdirecto(data, licencas) {
  const dia = diaMs(data);
  const a = new Set((licencas || []).filter(Boolean));
  if (dia == null || a.size < 3) return null;
  const ids = [];
  const cobertos = new Set();
  for (const g of jogos()) {
    if (Math.abs(g.dia - dia) > 86400000) continue;
    let comum = 0;
    for (const l of a) if (g.licencas.has(l)) { comum++; cobertos.add(l); }
    if (comum) ids.push(g.gameId);
  }
  return cobertos.size >= 3 && cobertos.size / a.size >= MIN_SOBREPOSICAO ? ids : null;
}

/** Licenças de um ficheiro regional (classificações; sem elas, os inscritos). */
function licencasRegional(j) {
  const res = (j.results || []).flatMap((r) => r.players || []).map((p) => p.licencia);
  return res.length ? res : ((j.inscritos && j.inscritos.admitidos) || []).map((p) => p.licencia);
}

module.exports = { gemeoGolfdirecto, licencasRegional, diaMs };
