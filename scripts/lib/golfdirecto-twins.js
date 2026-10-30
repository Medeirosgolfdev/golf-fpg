"use strict";
/**
 * scripts/lib/golfdirecto-twins.js — a mesma prova num PDF regional (FVG País
 * Basco, FGCV Valência, FNG Navarra, FGCLM Castela-La Mancha, FRG Rioja) e
 * noutra fonte. 30/10/2026.
 *
 * As federações publicam muitas vezes as duas coisas: o live scoring no
 * golfdirecto ou no NextCaddy (cartões, licenças) e o PDF da classificação no
 * site. Fica a outra fonte; o PDF sai do índice da /rfeg e dos rivais. Entre
 * dois PDFs regionais da mesma prova (o Zonal da Zona 9 está no site da
 * Navarra e no da Rioja) fica o primeiro que se lê (`registar`).
 *
 * Gémeo = provas a ±1 dia que têm ≥ 75% dos jogadores do PDF (pelo menos 3;
 * Meaztegi 2026: 23 de 30). Com menos (só a fase final, um escalão), o PDF fica.
 */
const fs = require("fs");
const path = require("path");

const FCG_DIR = path.resolve(__dirname, "../../public/data/fcg");
const NC_DIR = path.resolve(__dirname, "../../public/data/nextcaddy");
const MIN_SOBREPOSICAO = 0.75;

let cache = null;
const regionais = [];
/** Provas golfdirecto e NextCaddy com jogadores: { id, dia (ms), licencas: Set }. */
function jogos() {
  if (cache) return cache;
  cache = [];
  if (fs.existsSync(FCG_DIR)) for (const f of fs.readdirSync(FCG_DIR).filter((x) => /^[0-9a-f]{24}\.json$/.test(x))) {
    const j = JSON.parse(fs.readFileSync(path.join(FCG_DIR, f), "utf8"));   // ilegível = erro
    const d = j.game && j.game.scheduleStartDate;
    const lic = new Set((j.categories || []).flatMap((c) => c.players || []).map((p) => p.license).filter(Boolean));
    if (d && lic.size) cache.push({ id: j.gameId, dia: Date.parse(d.slice(0, 10)), licencas: lic });
  }
  if (fs.existsSync(NC_DIR)) for (const f of fs.readdirSync(NC_DIR).filter((x) => /^\d+\.json$/.test(x))) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(NC_DIR, f), "utf8")); } catch { continue; }   // o índice já avisa dos ilegíveis
    const d = j.meta && (j.meta.dateIso || j.meta.dateStart);
    const lic = new Set((j.leaderboard || []).flatMap((c) => c.players || []).map((p) => p.licencia).filter(Boolean));
    if (d && lic.size) cache.push({ id: `nc${j.tourId}`, dia: Date.parse(String(d).slice(0, 10)), licencas: lic });
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

/** ids das provas que já cobrem esta (ou null). Soma as provas do mesmo dia
 *  (±1), porque há federações com um jogo por escalão. */
function cobertura(lista, dia, a, folga = 86400000) {
  const ids = [];
  const cobertos = new Set();
  for (const g of lista) {
    if (Math.abs(g.dia - dia) > folga) continue;
    let comum = 0;
    for (const l of a) if (g.licencas.has(l)) { comum++; cobertos.add(l); }
    if (comum) ids.push(g.id);
  }
  return cobertos.size >= 3 && cobertos.size / a.size >= MIN_SOBREPOSICAO ? ids : null;
}

/** A prova do PDF já está no golfdirecto/NextCaddy ou noutro PDF já registado? */
function gemeo(data, licencas) {
  const dia = diaMs(data);
  const a = new Set((licencas || []).filter(Boolean));
  if (dia == null || a.size < 3) return null;
  // Entre dois PDFs, só no mesmo dia: as jornadas dos Juegos Deportivos de
  // Navarra e os Puntuables da FGCLM em dias seguidos têm os mesmos jogadores.
  return cobertura(jogos(), dia, a) || cobertura(regionais, dia, a, 0);
}

/** Um PDF regional que fica: os seguintes da mesma prova passam a ser gémeos. */
function registar(id, data, licencas) {
  const dia = diaMs(data);
  const lic = new Set((licencas || []).filter(Boolean));
  if (dia != null && lic.size) regionais.push({ id, dia, licencas: lic });
}

/** Licenças de um ficheiro regional (classificações; sem elas, os inscritos). */
function licencasRegional(j) {
  const res = (j.results || []).flatMap((r) => r.players || []).map((p) => p.licencia);
  return res.length ? res : ((j.inscritos && j.inscritos.admitidos) || []).map((p) => p.licencia);
}

module.exports = { gemeo, registar, licencasRegional, diaMs };
