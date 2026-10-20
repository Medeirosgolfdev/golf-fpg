'use strict';
/**
 * build-uskids-edicoes-anteriores.js
 *
 * Monta as edições anteriores (2021–2026) das provas USKids que temos, para as
 * abas «Edições anteriores»/«Quem repete» da /uskids — SEM pedidos à fonte: lê a
 * uskids-rich-flight-cache (data-archive/, escrita pelo
 * fetch-uskids-rich-players-node.js e pelo fetch-uskids-edicoes-anteriores.js),
 * que guarda cada flight com todos os jogadores e cartões.
 *
 * Saída (um ficheiro por torneio — juntos dariam ~40 MB):
 *   public/data/uskids-edicoes/{t}.json   TorneioResult (formato do uskids-results)
 *   public/data/uskids-edicoes/index.json { gerado_em, ano_min,
 *       torneios: [{ t, name, date_inicio, escaloes: [nomes] }],
 *       faltam:   [{ t, name, date, escaloes: [nomes] | null }] }  ← o que a cache não tem
 * A página lê o índice e só carrega as edições da prova aberta; não entram na
 * barra lateral dos resultados.
 *
 *   node scripts/build-uskids-edicoes-anteriores.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { edicoesEmFalta, ANO_MIN } = require('./lib/uskids-edicoes');
const { construirMapaCursos, buscarParDoMapa, calcularLeaderboard } = require('./lib/uskids-results-shape');
const { writeJsonAtomic } = require('./lib/atomic-write');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'data-archive', 'uskids-rich-flight-cache.json.gz');
const OUT_DIR = path.join(ROOT, 'public', 'data', 'uskids-edicoes');

/** Escalões que a prova teve (flights com inscritos), pelo nome. */
function escaloesDaProva(meta) {
  const ags = meta?.age_groups || {};
  const nomes = new Set();
  for (const fl of Object.values(meta?.flights || {})) {
    const nome = ags[fl.age_group]?.name;
    if (nome && (fl.registered ?? fl.active ?? 1) > 0) nomes.add(nome);
  }
  return [...nomes];
}

/** Um flight da cache → EscalaoResult (o mesmo formato do fetch-uskids-results). */
function escalaoDoFlight(fid, fl, meta, mapaCursos) {
  const ags = meta?.age_groups || {};
  const agId = meta?.flights?.[fid]?.age_group;
  const agInfo = ags[agId] || {};
  const jogadores = Object.values(fl.players || {}).filter(p => p.status == null || p.status === 1);
  const nRondas = Math.max(0, ...jogadores.flatMap(p => Object.keys(p.rounds || {}).map(Number)));
  const rondas = [];
  for (let r = 1; r <= nRondas; r++) {
    const c = buscarParDoMapa(mapaCursos, fid, r);
    const lista = jogadores.map(p => {
      const rd = p.rounds?.[String(r)];
      if (!rd) return null;
      const nh = rd.numHoles || 18;
      const strokes = (rd.strokes || []).filter((_, i) => i < nh);
      return {
        nome: `${(p.first || '').trim()} ${(p.last || '').trim()}`.trim(),
        pais: (p.country || '').toUpperCase(),
        cidade: p.place || '',
        tee: p.teeMarkerName || '',
        pontos: p.points || 0,
        score: rd.numStrokes || 0,
        buracos: nh,
        start_hole: rd.startHole || 1,
        start_time: rd.startTime || '',
        grupo: rd.groupNumber || 0,
        strokes,
      };
    }).filter(Boolean);
    const leaderboard = calcularLeaderboard(lista, c.par);
    if (!leaderboard.length) continue;
    rondas.push({
      ronda: r, par: c.par, yards: c.yards, campo: c.courseName || null, holes: c.holes || [],
      buracos: c.numHoles || agInfo.holes_per_round || 18,
      total_par: c.totalPar || null, total_yards: c.totalYards || null,
      par_source: c.par.length ? 'flight_courses' : 'estimated',
      leaderboard,
    });
  }
  if (!rondas.length) return null;
  return {
    age_group: Number(agId) || 0, nome: fl.ageGroup || agInfo.name || '?',
    holes: agInfo.holes_per_round || 18, tee_marker: agInfo.tee_marker || null,
    is_manuel: false, rondas,
  };
}

function main() {
  const cache = JSON.parse(zlib.gunzipSync(fs.readFileSync(CACHE)).toString('utf8')).torneios || {};
  const alvo = edicoesEmFalta();
  const torneios = [];
  const faltam = [];
  for (const e of alvo) {
    const c = cache[String(e.t)];
    const meta = c?.meta;
    const precisa = meta ? escaloesDaProva(meta) : [];
    const escaloes = [];
    if (meta) {
      const mapa = construirMapaCursos(meta);
      for (const [fid, fl] of Object.entries(c.flights || {})) {
        const esc = escalaoDoFlight(fid, fl, meta, mapa);
        if (esc && !escaloes.some(x => x.nome === esc.nome)) escaloes.push(esc);
      }
    }
    escaloes.sort((a, b) => a.age_group - b.age_group);
    if (escaloes.length) {
      torneios.push({
        t: e.t, name: meta?.tournament?.name || e.name,
        date_inicio: meta?.tournament?.start_date || e.date, date_fim: meta?.tournament?.end_date || null,
        campo: meta?.tournament?.courses || null, rondas_total: Number(meta?.tournament?.rounds) || null,
        escalao_manuel: null,
        url_resultados: `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${e.t}`,
        escaloes, ultima_atualizacao: c.gerado_em || null, fonte: 'rich-flight-cache',
      });
    }
    const tem = new Set(escaloes.map(x => x.nome));
    const emFalta = meta ? precisa.filter(n => !tem.has(n)) : null; // null = nem o meta temos
    if (emFalta === null || emFalta.length) faltam.push({ t: e.t, name: e.name, date: e.date, escaloes: emFalta });
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Ficheiros de torneios que já não estão no alvo (ex.: entraram nos resultados) saem.
  const ficam = new Set(torneios.map(t => `${t.t}.json`).concat('index.json'));
  for (const f of fs.readdirSync(OUT_DIR)) if (!ficam.has(f)) fs.rmSync(path.join(OUT_DIR, f));
  let bytes = 0;
  for (const t of torneios) {
    writeJsonAtomic(path.join(OUT_DIR, `${t.t}.json`), t, { spaces: 0 });
    bytes += fs.statSync(path.join(OUT_DIR, `${t.t}.json`)).size;
  }
  writeJsonAtomic(path.join(OUT_DIR, 'index.json'), {
    gerado_em: new Date().toISOString(), ano_min: ANO_MIN,
    torneios: torneios.map(t => ({ t: t.t, name: t.name, date_inicio: t.date_inicio, escaloes: t.escaloes.map(e => e.nome) })),
    faltam,
  }, { spaces: 0 });
  const nEsc = torneios.reduce((s, t) => s + t.escaloes.length, 0);
  const nFaltaEsc = faltam.reduce((s, f) => s + (f.escaloes ? f.escaloes.length : 0), 0);
  console.log(`edições alvo: ${alvo.length} | montadas da cache: ${torneios.length} (${nEsc} escalões, ${Math.round(bytes / 1024 / 1024)} MB)`);
  console.log(`em falta: ${faltam.length} torneios — ${faltam.filter(f => !f.escaloes).length} sem nada na cache, ${nFaltaEsc} escalões nos restantes`);
}

if (require.main === module) main();
module.exports = { escaloesDaProva, escalaoDoFlight };
