'use strict';
/**
 * scripts/lib/uskids-edicoes.js
 *
 * Que edições anteriores faltam às provas USKids que temos (pedido da Mariana,
 * 20/10/2026: «resultados de edições anteriores de todas as provas», 2021–2026).
 * Partilhado entre o build-uskids-edicoes-anteriores.js (monta-as da cache, sem
 * pedidos) e o fetch-uskids-edicoes-anteriores.js (vai buscar o que a cache não tem).
 *
 *   - provas = os torneios do uskids-results.json + uskids_torneios_completos(N);
 *   - edições = os torneios do uskids-member-history-slim (catálogo de ~21 mil,
 *     com nome e data) da mesma família, de ANO_MIN em diante, já jogados;
 *   - família = `familyKey`, a MESMA regra do `tournamentFamilyKey` da página
 *     (src/ui/circuit/pastEditions.tsx) — se uma mudar, mudar a outra.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'public', 'data');
const ANO_MIN = 2021;

/** Igual ao tournamentFamilyKey (pastEditions.tsx). */
function familyKey(name) {
  const base = String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F3F4}][\u{1F1E6}-\u{1F1FF}\u{E0000}-\u{E007F}]*/gu, ' ')
    .replace(/^\s*\d{4}\s*\/\/\s*/, ' ')
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b\d{1,3}\s*[oaºª]\b/g, ' ')
    .replace(/\b[ivxlcdm]{1,6}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return base || null;
}

/** M/D/YYYY → Date. */
function dataUS(s) {
  const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])) : null;
}

/** Provas que temos (t, nome, data) — resultados + ficheiros completos. */
function provasQueTemos() {
  const out = new Map();
  const res = JSON.parse(fs.readFileSync(path.join(DATA, 'uskids-results.json'), 'utf8')).resultados || [];
  for (const t of res) out.set(Number(t.t), { t: Number(t.t), name: t.name, date: t.date_inicio });
  for (const f of fs.readdirSync(DATA).filter(f => f.startsWith('uskids_torneios_completos'))) {
    let raw; try { raw = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { continue; }
    for (const x of (Array.isArray(raw) ? raw : [raw])) {
      const t = Number(x?.signupanytime_t ?? x?.t);
      if (!t) continue;
      const name = x.name ?? x.meta?.tournament?.name;
      const date = x.start_date ?? x.meta?.tournament?.start_date;
      if (!out.has(t)) out.set(t, { t, name, date });
    }
  }
  return out;
}

/** Edições anteriores (ANO_MIN em diante, já jogadas) que não temos. */
function edicoesEmFalta({ hoje = new Date() } = {}) {
  const temos = provasQueTemos();
  const familias = new Set([...temos.values()].map(p => familyKey(p.name)).filter(Boolean));
  const slim = JSON.parse(fs.readFileSync(path.join(DATA, 'uskids-member-history-slim.json'), 'utf8'));
  const out = [];
  for (const [k, v] of Object.entries(slim.torneios || {})) {
    const t = Number(k);
    if (!t || temos.has(t)) continue;
    const d = dataUS(v.startDate);
    if (!d || d.getUTCFullYear() < ANO_MIN || d >= hoje) continue;
    const fam = familyKey(v.name);
    if (!fam || !familias.has(fam)) continue;
    out.push({ t, name: v.name, date: v.startDate, fam });
  }
  return out.sort((a, b) => dataUS(b.date) - dataUS(a.date));
}

module.exports = { ANO_MIN, familyKey, dataUS, provasQueTemos, edicoesEmFalta };
