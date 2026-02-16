// lib/melhorias.js â€” Melhorias (correÃ§Ãµes manuais)
const fs = require("fs");
const path = require("path");

let _melhorias = null;
function loadMelhorias() {
  if (_melhorias !== null) return _melhorias;
  const mp = path.join(process.cwd(), "melhorias.json");
  if (fs.existsSync(mp)) {
    try {
      _melhorias = JSON.parse(fs.readFileSync(mp, "utf-8"));
      const nPlayers = Object.keys(_melhorias).filter(k => !k.startsWith("_")).length;
      console.log(`âœ“ melhorias.json carregado (${nPlayers} jogador(es))`);
    } catch (e) {
      console.error("âš  Erro ao ler melhorias.json:", e.message);
      _melhorias = {};
    }
  } else {
    _melhorias = {};
  }
  return _melhorias;
}

function getMelhoria(fed, scoreId) {
  const m = loadMelhorias();
  const patches = m[String(fed)];
  if (!patches) return null;
  return patches[String(scoreId)] || null;
}

function applyMelhorias(rows, fed, silent) {
  const m = loadMelhorias();
  const patches = m[String(fed)];
  if (!patches) return rows;
  let count = 0;
  for (const r of rows) {
    const p = patches[String(r.score_id)];
    if (p && p.whs) {
      Object.assign(r, p.whs);
      count++;
    }
  }
  if (count > 0 && !silent) console.log(`  âœ“ ${count} melhoria(s) WHS aplicada(s) ao jogador ${fed}`);
  return rows;
}

function applyMelhoriasScorecard(rec, fed, scoreId) {
  const sid = rec?.id || rec?.score_id || scoreId;
  if (!rec || !sid) return rec;
  const p = getMelhoria(fed, sid);
  if (p && p.scorecard) {
    Object.assign(rec, p.scorecard);
  }
  return rec;
}

function getMelhoriaLinks(fed, scoreId) {
  const p = getMelhoria(fed, scoreId);
  return p && p.links ? p.links : null;
}

function getMelhoriaNotas(fed, scoreId) {
  const p = getMelhoria(fed, scoreId);
  return p && p.notas ? p.notas : null;
}

function getMelhoriaFpgOriginal(fed, scoreId) {
  const p = getMelhoria(fed, scoreId);
  return p && p._fpg_original ? p._fpg_original : null;
}

function getMelhoriaLink(fed, scoreId) {
  const p = getMelhoria(fed, scoreId);
  if (!p) return null;
  if (p.links && typeof p.links === 'object') return p.links;
  if (p.link) return { link: p.link };
  return null;
}

function getMelhoriaPill(fed, scoreId) {
  const p = getMelhoria(fed, scoreId);
  return p && p.pill ? p.pill : '';
}

function getMelhoriaGroup(fed, scoreId) {
  const p = getMelhoria(fed, scoreId);
  return p && p._group ? p._group : '';
}

function getMelhoriaTornView(fed, scoreId) {
  const p = getMelhoria(fed, scoreId);
  if (!p || p.torneio_view === undefined) return null;
  return !!p.torneio_view;
}

module.exports = {
  loadMelhorias, getMelhoria, applyMelhorias, applyMelhoriasScorecard,
  getMelhoriaLinks, getMelhoriaNotas, getMelhoriaFpgOriginal, getMelhoriaLink,
  getMelhoriaPill, getMelhoriaGroup, getMelhoriaTornView
};
