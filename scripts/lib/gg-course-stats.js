/**
 * scripts/lib/gg-course-stats.js
 *
 * Distâncias REAIS (metros por buraco) + par + SI de um evento GolfGenius, via
 * o widget `course_statistics` — Node puro, sem browser.
 *
 * O GolfGenius publica, na aba "By course and tee" do course_analytics, um
 * <form id="course_statistics_{Round}_{Course}_{Tee}"> por combinação de tee.
 * POST desse form (com o authenticity_token que já vem no HTML) devolve a
 * tabela Buraco | Metros | Par | … | Rank(SI). É a MESMA fonte que o England
 * Golf usa (scrape-england-golf.js), aqui reaproveitada para a FFG.
 *
 * Devolve as configurações de tee DISTINTAS (dedup por par+metros totais):
 *   [{ parTotal, metersTotal, par[18], meters[18], si[18] }]
 * ordenadas por metros desc (o tee mais longo primeiro).
 *
 * Sem dados → []. Nunca inventa: se a fonte não publica, fica vazio.
 */
"use strict";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const GG = "https://www.golfgenius.com";

let _cookie = "";
async function warm() {
  if (_cookie) return;
  const r = await fetch(`${GG}/`, { headers: { "User-Agent": UA } });
  const sc = r.headers.get("set-cookie") || "";
  _cookie = sc.split(/,(?=\s*\w+=)/).map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
}

function parseStatsTable(html) {
  const rows = [];
  for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim())
      .filter((x) => x);
    // A tabela de buracos tem ≥11 colunas; cells[0]=buraco, [1]=metros, [2]=par, [4]=rank(SI).
    if (cells.length >= 11 && /^\d+$/.test(cells[0]) && /^\d+$/.test(cells[2])) {
      rows.push({ hole: +cells[0], meters: parseInt(cells[1], 10), par: +cells[2], si: parseInt(cells[4], 10) });
    }
  }
  if (rows.length !== 18) return null; // só aceitamos 18 buracos completos
  rows.sort((a, b) => a.hole - b.hole);
  const par = rows.map((r) => r.par);
  const meters = rows.map((r) => r.meters);
  const si = rows.map((r) => r.si);
  if (meters.some((m) => !Number.isFinite(m) || m <= 0)) return null;
  return {
    par, meters, si: si.every((x) => Number.isFinite(x)) ? si : [],
    parTotal: par.reduce((s, v) => s + v, 0),
    metersTotal: meters.reduce((s, v) => s + v, 0),
  };
}

/**
 * @param {string} lid  leagueId do evento (gg_league, ou descoberto da /pages).
 * @returns {Promise<Array<{parTotal,metersTotal,par,meters,si}>>}
 */
async function fetchCourseStats(lid) {
  if (!lid) return [];
  await warm();
  const headers = { "User-Agent": UA, Cookie: _cookie };
  let html;
  try {
    const r = await fetch(`${GG}/leagues/${lid}/widgets/course_analytics?shared=false`, { headers });
    if (!r.ok) return [];
    html = await r.text();
  } catch { return []; }

  // Label do tee/campo: cada form tem um <a data-form="{id}">Jaunes</a> (cor do
  // tee) ou, em eventos de tee único, <a>Course: Les Aisses</a> (nome do campo).
  // Ambos são reais — tiramos só o prefixo "Course:"/"Parcours:".
  const teeNameByForm = new Map();
  for (const a of html.matchAll(/<a[^>]*data-form=["'](course_statistics_[^"']*)["'][^>]*>([\s\S]*?)<\/a>/g)) {
    const label = a[2].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
      .replace(/^(?:course|parcours)\s*:\s*/i, "").trim();
    if (label && !teeNameByForm.has(a[1])) teeNameByForm.set(a[1], label);
  }
  // Um form de tee (id com 3 partes: Round_Course_Tee) pode não ter link
  // próprio; nesse caso herda o nome do link ao nível do Course (2 partes).
  const courseNameByCourse = new Map();
  for (const [fid, name] of teeNameByForm) {
    const parts = fid.replace("course_statistics_", "").split("_");
    if (parts.length === 1) courseNameByCourse.set(parts[0], name);
  }

  // Cada <form id="course_statistics_..."> é um (Round × Course × Tee). As
  // distâncias só dependem de (Course, Tee) — dedup ANTES de fazer POST, para
  // não repetir por ronda (um evento tem dezenas de forms; só ~1-2 tees).
  const forms = html.match(/<form[^>]*id="course_statistics_[^"]*"[\s\S]*?<\/form>/g) || [];
  const uniq = new Map();
  for (const form of forms) {
    const action = (form.match(/action="([^"]+)"/) || [])[1];
    const formId = (form.match(/id="(course_statistics_[^"]*)"/) || [])[1];
    if (!action) continue;
    const fields = {};
    for (const m of form.matchAll(/name="([^"]+)"[^>]*value="([^"]*)"/g)) fields[m[1]] = m[2];
    const teeKey = `${fields.Course || ""}|${fields.Tee || ""}`;
    if (!uniq.has(teeKey)) uniq.set(teeKey, { action, formId, fields });
  }

  const byKey = new Map();
  for (const { action, formId, fields } of uniq.values()) {
    try {
      const res = await fetch(GG + action, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields),
      });
      if (!res.ok) continue;
      const stats = parseStatsTable(await res.text());
      if (!stats) continue;
      const parts = (formId || "").replace("course_statistics_", "").split("_");
      stats.teeName = teeNameByForm.get(formId) || courseNameByCourse.get(parts[1]) || courseNameByCourse.get(parts[0]) || "";
      const key = `${stats.parTotal}-${stats.metersTotal}`; // dedup de tees iguais no fim
      if (!byKey.has(key)) byKey.set(key, stats);
    } catch { /* salta este tee */ }
  }
  return [...byKey.values()].sort((a, b) => b.metersTotal - a.metersTotal);
}

module.exports = { fetchCourseStats };
