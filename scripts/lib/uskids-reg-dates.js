'use strict';

/**
 * Datação das inscrições USKids a partir do `pid`.
 *
 * A API do signupanytime NÃO publica data de inscrição em lado nenhum:
 * `GetPlayerTeeTimes` devolve nome/país/cidade/tee/status e mais nada, e não
 * existe nenhum `op=` de registos (testados 9 nomes plausíveis, todos devolvem
 * corpo vazio). O que temos é o `pid` — a chave do `flight_players` — que é um
 * auto-incremento GLOBAL da tabela de inscrições: ordena sempre pela ordem real
 * de inscrição (verificado 2026-08-23 no Belgium Invitational, 7/7 na ordem
 * certa entre 15 Mai e 5 Ago).
 *
 * Daí a datação: os jogadores que apareceram DEPOIS de já estarmos a seguir um
 * torneio têm data real conhecida (o `firstSeen`, ±1 dia porque o scraper corre
 * diariamente). Esses pares (pid, dia) são ÂNCORAS; para todos os outros —
 * incluindo o campo inteiro de um torneio acabado de descobrir — a data sai por
 * interpolação entre as âncoras à volta.
 *
 * ⚠ O `firstSeen` do primeiro dia de monitorização de um torneio NÃO serve de
 * âncora: essa gente já lá estava inscrita antes de o torneio entrar no nosso
 * radar, e usá-la carimbaria centenas de inscrições antigas com a data em que
 * começámos a olhar — exactamente o erro que esta datação vem corrigir.
 */

const DIA_MS = 86400000;

const diaISO = (iso) => String(iso || '').slice(0, 10);
const diaParaMs = (d) => Date.parse(`${d}T00:00:00Z`);
const msParaDia = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Dia em que começámos a seguir um torneio = firstSeen mais antigo nele. */
function inicioMonitorizacao(torneio) {
  let min = null;
  for (const e of torneio.escaloes || [])
    for (const j of e.jogadores || [])
      if (j.firstSeen && (min === null || j.firstSeen < min)) min = j.firstSeen;
  return min ? diaISO(min) : null;
}

/** Âncoras (pid → dia observado) dos torneios já monitorizados. */
function extrairAncoras(torneios) {
  const out = [];
  for (const t of torneios || []) {
    const desde = inicioMonitorizacao(t);
    if (!desde) continue;
    for (const e of t.escaloes || [])
      for (const j of e.jogadores || []) {
        if (!j.pid || !j.firstSeen) continue;
        const dia = diaISO(j.firstSeen);
        if (dia <= desde) continue;   // bulk do arranque — ver nota no cabeçalho
        out.push({ pid: j.pid, dia });
      }
  }
  return out;
}

/**
 * Funde âncoras novas com as guardadas: dedup por pid (fica a data mais antiga,
 * a mais próxima da inscrição real) e força monotonia — o pid cresce com o
 * tempo, portanto a data nunca pode recuar.
 */
function fundirAncoras(antigas, novas) {
  const m = new Map();
  for (const a of [...(antigas || []), ...(novas || [])]) {
    if (!a || !a.pid || !a.dia) continue;
    const prev = m.get(a.pid);
    if (prev === undefined || a.dia < prev) m.set(a.pid, a.dia);
  }
  const arr = [...m.entries()]
    .map(([pid, dia]) => ({ pid, dia }))
    .sort((a, b) => a.pid - b.pid);
  let max = '';
  for (const a of arr) { if (a.dia < max) a.dia = max; else max = a.dia; }
  return arr;
}

/**
 * Estima o dia de inscrição de um pid por interpolação linear entre as âncoras
 * vizinhas. Fora do intervalo coberto extrapola com o ritmo médio de pids/dia
 * do troço mais próximo, e devolve `fora: true` (estimativa mais fraca).
 * Devolve null se não houver âncoras suficientes.
 */
function estimarDia(pid, ancoras) {
  if (!pid || !Array.isArray(ancoras) || ancoras.length < 2) return null;
  const n = ancoras.length;
  const ritmo = (ancoras[n - 1].pid - ancoras[0].pid) /
                Math.max(1, (diaParaMs(ancoras[n - 1].dia) - diaParaMs(ancoras[0].dia)) / DIA_MS);
  if (!(ritmo > 0)) return null;

  if (pid <= ancoras[0].pid) {
    const dias = (ancoras[0].pid - pid) / ritmo;
    return { dia: msParaDia(diaParaMs(ancoras[0].dia) - dias * DIA_MS), fora: true };
  }
  if (pid >= ancoras[n - 1].pid) {
    const dias = (pid - ancoras[n - 1].pid) / ritmo;
    return { dia: msParaDia(diaParaMs(ancoras[n - 1].dia) + dias * DIA_MS), fora: true };
  }

  // procura binária do troço que contém o pid
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ancoras[mid].pid <= pid) lo = mid; else hi = mid;
  }
  const a = ancoras[lo], b = ancoras[hi];
  const span = b.pid - a.pid;
  const frac = span > 0 ? (pid - a.pid) / span : 0;
  const ms = diaParaMs(a.dia) + frac * (diaParaMs(b.dia) - diaParaMs(a.dia));
  return { dia: msParaDia(ms), fora: false };
}

/**
 * Escreve `regDia` (dia de inscrição) e `regObs` (true = observado por nós,
 * false = estimado pelo pid) em cada jogador. Não toca no `firstSeen`.
 */
function aplicarDatasInscricao(torneios, ancoras) {
  let obs = 0, est = 0, fora = 0, sem = 0;
  for (const t of torneios || []) {
    const desde = inicioMonitorizacao(t);
    for (const e of t.escaloes || [])
      for (const j of e.jogadores || []) {
        const dia = j.firstSeen ? diaISO(j.firstSeen) : null;
        if (dia && desde && dia > desde) { j.regDia = dia; j.regObs = true; obs++; continue; }
        const r = estimarDia(j.pid, ancoras);
        if (!r) { delete j.regDia; delete j.regObs; sem++; continue; }
        j.regDia = r.dia; j.regObs = false;
        est++; if (r.fora) fora++;
      }
  }
  return { obs, est, fora, sem };
}

module.exports = {
  inicioMonitorizacao, extrairAncoras, fundirAncoras, estimarDia,
  aplicarDatasInscricao,
};
