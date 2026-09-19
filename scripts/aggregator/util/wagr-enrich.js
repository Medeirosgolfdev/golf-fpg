/**
 * scripts/aggregator/util/wagr-enrich.js — WAGR a ENRIQUECER o kids2 (18/09).
 *
 * O WAGR NÃO é uma fonte do agregador (docs/claude/wagr.md): leaderboards
 * parciais (só quem pontuou), sem DOB nem escalão do jogador, matching só por
 * nome+país. Criar fichas a partir dele encheria o kids2 de adultos e homónimos.
 *
 * Este passo corre DEPOIS do identity-matcher e só ACRESCENTA participações a
 * juniores que já existem. Trabalha por JOGADOR WAGR (o WAGR tem um id por
 * jogador), só com eventos do tipo "Junior":
 *
 *   1. Candidatos = juniores com o mesmo nome (canónico ou alias).
 *   2. CONFIRMAÇÃO (ideia da Mariana, 18/09): o candidato tem, a ±1 dia de um
 *      evento do jogador WAGR, um resultado com as MESMAS pancadas (voltas ou
 *      total). É o mesmo torneio visto por outra fonte — não se duplica, mas
 *      prova que é a mesma pessoa.
 *   3. VETO: no mesmo dia o candidato tem pancadas DIFERENTES (outra pessoa ou
 *      outro torneio).
 *   4. Um único candidato confirmado → liga, mesmo com homónimos, país
 *      diferente ou apelido comum. Sem confirmação → regras apertadas: um só
 *      candidato, país/sexo compatíveis, apelido comum exige país igual, e o
 *      nome não pode ser de vários jogadores WAGR.
 *   5. Entram todos os eventos desse jogador WAGR, menos os que o junior já
 *      tem nesse dia. Torneios `wagr-{id}` parciais (só juniores ligados).
 */

const fs = require("fs");
const path = require("path");
const { DATA_DIR, readJsonSafe } = require("./io");
const { normName, countryToIso2, displayName } = require("./names");

const WAGR_DIR = path.join(DATA_DIR, "wagr");
const dia = (s) => { const t = Date.parse(String(s || "").slice(0, 10)); return Number.isNaN(t) ? null : Math.round(t / 864e5); };
const voltas = (arr) => arr.filter((g) => typeof g === "number" && g > 0);

/**
 * @param {{juniors: object[], tournaments: object[]}} res  resultado do matcher (é alterado se aplicar)
 * @param {{aplicar?: boolean}} opts
 */
function enrichWithWagr(res, { aplicar = true } = {}) {
  const list = readJsonSafe(path.join(WAGR_DIR, "wagr-events-list.json"), null);
  const eventos = (list?.events || []).filter((e) => e.eventType === "Junior");
  if (!eventos.length) return { disponivel: false };

  // ── Juniores: por nome, frequência de apelidos, e resultados por dia ──
  const porNome = new Map();
  const freqApelido = new Map();
  for (const j of res.juniors) {
    for (const n of new Set([j.canonicalName, ...(j.aliases || [])].map(normName))) {
      if (!n || !n.includes(" ")) continue;
      if (!porNome.has(n)) porNome.set(n, new Set());
      porNome.get(n).add(j);
    }
    const ap = normName(j.canonicalName).split(" ").pop();
    if (ap) freqApelido.set(ap, (freqApelido.get(ap) || 0) + 1);
  }
  const resultadosDe = new Map(); // juniorId → [{d, seq, total}]
  for (const t of res.tournaments) {
    const d = dia(t.date || t.startDate);
    if (d == null) continue;
    for (const f of t.flights || []) for (const r of f.results || []) {
      if (!r.juniorId) continue;
      const seq = voltas((r.rounds || []).map((x) => x.gross));
      if (!resultadosDe.has(r.juniorId)) resultadosDe.set(r.juniorId, []);
      resultadosDe.get(r.juniorId).push({ d, seq: seq.join("-"), total: typeof r.totalGross === "number" ? r.totalGross : (seq.length ? seq.reduce((a, b) => a + b, 0) : null) });
    }
  }

  // ── WAGR: linhas agrupadas por jogador ──
  const ficheiros = new Map(fs.readdirSync(path.join(WAGR_DIR, "events")).map((f) => [f.replace(/\D/g, ""), f]));
  const porJogador = new Map(); // wagrId → [{meta, pl, d0, d1, seq, total}]
  const idsPorNome = new Map();
  const urlDe = new Map();
  for (const meta of eventos) {
    const f = ficheiros.get(String(meta.id));
    if (!f) continue;
    const ev = readJsonSafe(path.join(WAGR_DIR, "events", f), null);
    if (ev?.url) urlDe.set(meta.id, ev.url);
    for (const pl of ev?.players || []) {
      const iso = countryToIso2(pl.country) || "";
      const idw = pl.id ? String(pl.id) : `${normName(pl.name)}|${iso}`;
      const k = `${normName(pl.name)}|${iso}`;
      if (!idsPorNome.has(k)) idsPorNome.set(k, new Set());
      idsPorNome.get(k).add(idw);
      const seq = voltas([pl.r1, pl.r2, pl.r3, pl.r4]);
      const d0 = dia(meta.startDate);
      if (!porJogador.has(idw)) porJogador.set(idw, []);
      porJogador.get(idw).push({ meta, pl, iso, d0, d1: dia(meta.endDate) ?? d0, seq: seq.join("-"),
        total: typeof pl.total === "number" ? pl.total : (seq.length ? seq.reduce((a, b) => a + b, 0) : null) });
    }
  }

  const stats = { jogadoresWagr: porJogador.size, confirmados: 0, porRegras: 0, semFicha: 0, homonimos: 0, vetados: 0,
    paisOuSexo: 0, comumSemPais: 0, homonimosWagr: 0, ligadas: 0, jaTinha: 0, juniores: new Set(), amostra: [] };
  const linhasPorEvento = new Map(); // meta.id → {meta, results[]}

  for (const [idw, linhas] of porJogador) {
    const nome = normName(linhas[0].pl.name);
    const cands = [...(porNome.get(nome) || [])];
    if (!cands.length) { stats.semFicha++; continue; }

    // Confirmação / veto por candidato.
    const avaliar = (j) => {
      let conf = 0, veto = 0;
      const rs = resultadosDe.get(j.id) || [];
      for (const l of linhas) {
        if (l.d0 == null) continue;
        for (const r of rs) {
          if (r.d < l.d0 - 1 || r.d > l.d1 + 1) continue;
          // Uma fonte pode ter menos voltas (ainda a decorrer, ou só até ao corte):
          // 73-73 dentro de 73-73-72 é o MESMO resultado, não um veto (Gabriel
          // Sardo, Internacional de Espanha U18 2026).
          const a = l.seq, b = r.seq;
          const prefixo = a && b && (a === b || a.startsWith(b + "-") || b.startsWith(a + "-")) && Math.min(a.split("-").length, b.split("-").length) >= 2;
          const igual = prefixo || (a && b && a === b) || (l.total != null && r.total != null && l.total === r.total && a.split("-").length >= 2);
          if (igual) conf++;
          else if (a && b) veto++;
        }
      }
      return { j, conf, veto };
    };
    // Veto só vale se pesar mais que as confirmações (uma fonte com um erro de
    // transcrição não anula 6 torneios com pancadas iguais).
    const av = cands.map(avaliar).filter((a) => a.veto === 0 || a.conf > a.veto);
    if (!av.length) { stats.vetados++; continue; }
    const confirmados = av.filter((a) => a.conf > 0);
    let escolhido = null;
    if (confirmados.length === 1) { escolhido = confirmados[0].j; stats.confirmados++; }
    else if (confirmados.length > 1) { stats.homonimos++; continue; }
    else {
      // Sem confirmação: regras apertadas.
      if (av.length > 1) { stats.homonimos++; continue; }
      const j = av[0].j, iso = linhas[0].iso || null;
      const sexo = linhas[0].meta.sex === "M" || linhas[0].meta.sex === "F" ? linhas[0].meta.sex : null;
      if ((iso && j.country && iso !== j.country) || (sexo && j.sex && sexo !== j.sex)) { stats.paisOuSexo++; continue; }
      if ((idsPorNome.get(`${nome}|${iso || ""}`)?.size || 0) > 1) { stats.homonimosWagr++; continue; }
      const ap = nome.split(" ").pop();
      if ((freqApelido.get(ap) || 0) > 5 && !(iso && j.country && iso === j.country)) { stats.comumSemPais++; continue; }
      escolhido = j; stats.porRegras++;
    }

    // Acrescentar os eventos que o junior ainda não tem nesse dia.
    const dias = new Set((resultadosDe.get(escolhido.id) || []).map((r) => r.d));
    let n = 0;
    for (const l of linhas) {
      if (l.d0 != null && [...dias].some((x) => x >= l.d0 - 1 && x <= l.d1 + 1)) { stats.jaTinha++; continue; }
      const rounds = [l.pl.r1, l.pl.r2, l.pl.r3, l.pl.r4].map((g, i) => ({ round: i + 1, gross: typeof g === "number" && g > 0 ? g : null })).filter((r) => r.gross != null);
      if (!linhasPorEvento.has(l.meta.id)) linhasPorEvento.set(l.meta.id, { meta: l.meta, results: [] });
      linhasPorEvento.get(l.meta.id).results.push({ juniorId: escolhido.id, playerNameInSource: displayName(l.pl.name || ""),
        pos: typeof l.pl.posNum === "number" ? l.pl.posNum : null, status: "OK",
        totalGross: typeof l.pl.total === "number" ? l.pl.total : null, toPar: null, rounds, extra: { wagrPoints: l.pl.points ?? null, wagrId: idw } });
      n++;
    }
    if (n) {
      stats.ligadas += n;
      stats.juniores.add(escolhido.id);
      if (stats.amostra.length < 40 && stats.juniores.size % 25 === 1) {
        stats.amostra.push(`${escolhido.canonicalName} [${escolhido.id} ${escolhido.country || "?"} ${escolhido.tournamentIds.length}T] +${n} ${confirmados.length ? "(confirmado por torneio comum)" : "(regras)"}`);
      }
    }
  }

  const novos = [];
  for (const { meta, results } of linhasPorEvento.values()) {
    const sexo = meta.sex === "M" || meta.sex === "F" ? meta.sex : null;
    const serie = String(meta.name || "").replace(/\b20\d{2}\b/g, "").trim();
    novos.push({
      id: `wagr-${meta.id}`, sourceId: "wagr", sourceKey: String(meta.id), name: meta.name,
      seriesId: `wagr-${serie.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`, seriesLabel: serie,
      date: meta.startDate, startDate: meta.startDate, endDate: meta.endDate, course: meta.course || null,
      flights: [{ flightKey: "geral", label: "Geral", ageMin: null, ageMax: null, sex: sexo, fieldSize: meta.playerCount || null, results }],
      links: [{ label: "WAGR", url: urlDe.get(meta.id) || `https://www.wagr.com/events/x-${meta.id}` }],
      extra: { parcial: true, nota: "WAGR: só os juniores que pontuaram e já tinham ficha" },
    });
  }

  if (aplicar) {
    const byId = new Map(res.juniors.map((j) => [j.id, j]));
    for (const t of novos) {
      res.tournaments.push(t);
      for (const r of t.flights[0].results) {
        const j = byId.get(r.juniorId);
        if (!j.tournamentIds.includes(t.id)) j.tournamentIds.push(t.id);
      }
    }
  }
  return { disponivel: true, torneios: novos.length, ...stats, juniores: stats.juniores.size };
}

module.exports = { enrichWithWagr };
