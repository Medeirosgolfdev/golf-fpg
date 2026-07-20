/**
 * scripts/lib/ffgolf-course-overrides.js
 *
 * Aplica o cartão REAL do campo (par + metros por buraco) aos torneios FFG,
 * por cima do que os scrapers conseguem inferir.
 *
 * Porquê: as duas rotas de scrape FFG derivam o par dos MARCADORES do scorecard
 * (círculo = birdie, quadrado = bogey). Se um buraco não tiver marcador em
 * jogador nenhum, o par desse buraco sai errado — e metros não existem de todo,
 * porque o GolfGenius não os expõe na API. O cartão oficial está publicado na
 * página do torneio (tab "By course and date"), mas só em HTML para humanos.
 *
 * Regra: o override GANHA SEMPRE ao inferido (é o cartão oficial), e nunca
 * mexe nos scores nem no `toPar` publicado pelo GolfGenius — esse é to-par
 * contra o par verdadeiro e já está certo mesmo quando o nosso par não estava.
 *
 * Fonte dos dados: public/data/ffgolf-course-overrides.json (chave "{year}_{slug}").
 */
const fs = require("fs");
const path = require("path");

const OVERRIDES_PATH = path.resolve(__dirname, "../../public/data/ffgolf-course-overrides.json");

let _cache = null;
function loadOverrides() {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf-8")).overrides || {};
  } catch {
    _cache = {};
  }
  return _cache;
}

const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);

/** Override deste torneio, ou null. */
function courseOverrideFor(year, slug) {
  return loadOverrides()[`${year}_${slug}`] || null;
}

/**
 * Aplica o override ao objecto de saída de um torneio (mutação in-place do
 * `course` e do `courses[]` correspondente ao tee). Devolve o override aplicado
 * (ou null se não havia), para o chamador poder logar.
 */
function applyCourseOverride(out) {
  const ov = courseOverrideFor(out.year, out.slug);
  if (!ov) return null;

  const par = Array.isArray(ov.par) && ov.par.length === 18 ? ov.par : null;
  const meters = Array.isArray(ov.meters) && ov.meters.length === 18 ? ov.meters : null;
  const si = Array.isArray(ov.si) && ov.si.length === 18 ? ov.si : [];

  const patch = (c) => {
    if (!c) return;
    if (ov.course) c.name = ov.course, c.courseName = ov.course;
    if (ov.tee) c.tee = ov.tee, c.teeName = ov.tee;
    if (par) c.par = [...par], c.parTotal = ov.parTotal || sum(par);
    if (meters) c.meters = [...meters], c.metersTotal = ov.metersTotal || sum(meters);
    if (si.length) c.si = [...si];
  };

  patch(out.course);
  // courses[]: com um único tee no cartão, aplicamos a todas as configurações
  // (é o mesmo campo); com vários, só à que bate no nome do tee.
  const list = out.courses || [];
  const matching = ov.tee ? list.filter((c) => String(c.teeName || "").toLowerCase() === String(ov.tee).toLowerCase()) : [];
  for (const c of matching.length ? matching : list) patch(c);

  return ov;
}

module.exports = { applyCourseOverride, courseOverrideFor };
