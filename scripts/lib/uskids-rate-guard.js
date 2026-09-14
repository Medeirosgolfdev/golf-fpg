'use strict';

/**
 * Defesas do monitor de field USKids contra uma fonte que recusa ou degrada.
 *
 * Tudo aqui é PURO (sem I/O, sem relógio implícito) para ser testável — o
 * `fetch-uskids-field.js` liga estas funções ao mundo real.
 *
 * Contexto (2026-09-12): o signupanytime aplicou rate limit e o
 * `uskids-field.json` passou de 2018 inscritos para ZERO, num commit que o
 * workflow deu por bom. Três peças, cada uma a travar a avaria num ponto
 * diferente:
 *
 *  1. `ehRateLimit`      — reconhecer a recusa (vem em TEXTO, HTTP 200).
 *  2. `perdaNosComuns`   — nunca gravar um build que perdeu inscritos.
 *  3. `avaliarCanario`   — gritar quando a procura parou, calar quando só
 *                          fomos recusados num dia.
 * (O volume de pedidos, que foi o que nos levou ao limite, resolve-se em
 * lib/uskids-frontier.js.)
 */

/** Perda de inscritos tolerada antes de recusar a escrita. */
const PERDA_MAXIMA = 0.30;

/**
 * O signupanytime responde ao rate limit com "Too many requests" em TEXTO e
 * HTTP 200 — não com 429. Passar esse corpo ao JSON.parse dá um erro de
 * sintaxe que se lê como "torneio sem dados"; é preciso reconhecê-lo pelo que é.
 */
function ehRateLimit(txt) {
  return /too many requests/i.test(String(txt || '').slice(0, 200));
}

/** Erro identificável, para o chamador distinguir recusa de falha de rede. */
function erroRateLimit() {
  const e = new Error('rate limit (Too many requests)');
  e.rateLimited = true;
  return e;
}

/** Map t → nº de inscritos, a partir da lista de torneios do field.json. */
function inscritosPorTorneio(torneios) {
  const m = new Map();
  for (const t of (torneios || [])) {
    let jog = 0;
    for (const e of (t.escaloes || [])) jog += (e.jogadores || []).length;
    m.set(t.t, jog);
  }
  return m;
}

/**
 * Perda de inscritos medida SÓ nos torneios presentes nos dois lados.
 *
 * ⚠ Sobre o total não serve: um torneio que se joga sai do radar e leva os
 * inscritos com ele. A 2026-08-01 um único evento a sair fez o total cair 39%
 * (1500→916) num run perfeitamente bom — nos torneios comuns os inscritos até
 * subiram (913→916). Medir o total recusaria esse dia e congelaria o ficheiro
 * em silêncio, que é a falha que esta guarda existe para evitar.
 *
 * Devolve `perda: 0` quando não há base de comparação (nada em comum, ou disco
 * vazio) — sem histórico não se pode acusar ninguém de encolher.
 */
function perdaNosComuns(torneiosAntigos, torneiosNovos) {
  const a = inscritosPorTorneio(torneiosAntigos);
  const b = inscritosPorTorneio(torneiosNovos);
  let antes = 0, agora = 0, comuns = 0;
  for (const [t, jog] of b) {
    if (!a.has(t)) continue;
    comuns++;
    antes += a.get(t);
    agora += jog;
  }
  return { antes, agora, comuns, perda: antes > 0 ? 1 - agora / antes : 0 };
}

/** Recusa-se a gravar? (a decisão, isolada do I/O) */
function deveRecusarEscrita(torneiosAntigos, torneiosNovos, { max = PERDA_MAXIMA, forcar = false } = {}) {
  const r = perdaNosComuns(torneiosAntigos, torneiosNovos);
  return { ...r, recusar: !forcar && r.antes > 0 && r.perda > max };
}

/** Limiares do canário — largos de propósito: avisam que a varredura PAROU. */
const DIAS_SEM_DESCOBERTA = 30;
const DIAS_SEM_AVANCO = 21;

/**
 * O canário: falhar o job (= email) ou só avisar?
 *
 * ⚠ A distinção que faltava (2026-09-13). Uma recusa da fonte chega às duas
 * fases com CARAS diferentes: na Fase 2 vem 200 + "Too many requests" (e o
 * `fim` fica `rate-limit`), na Fase 1 vem com status de erro, que o disjuntor
 * lê — correctamente — como `rede-degradada`. Medido no mesmo run: Fase 2 a
 * dizer rate limit em 87 de 87 torneios E Fase 1 a terminar em
 * `rede-degradada`. Era o MESMO corte a entrar por duas portas, e só uma
 * delas tocava o alarme.
 *
 * Logo: com prova de rate limit no run, `rede-degradada` é o mesmo caso
 * auto-recuperável do `rate-limit` — aviso, não erro. Sem essa prova, uma
 * fronteira abandonada continua a falhar o job, que é o que ela sempre fez.
 * Um alarme que toca todos os dias por algo que se resolve sozinho deixa de
 * ser lido — e foi assim que a avaria das 7 semanas passou despercebida.
 *
 * Os limiares de dias não são tocados: se a recusa persistir, disparam por si.
 */
function avaliarCanario({ varredura, diasSemDescoberta, diasSemAvanco, rateLimitHits = 0 }) {
  const v = varredura || {};
  const erros = [], avisos = [];
  const recusada = v.fim === 'rate-limit' || rateLimitHits > 0;

  if (diasSemDescoberta != null && diasSemDescoberta > DIAS_SEM_DESCOBERTA)
    erros.push(`${diasSemDescoberta} dias sem descobrir um torneio novo`);
  if (diasSemAvanco != null && diasSemAvanco > DIAS_SEM_AVANCO)
    erros.push(`${diasSemAvanco} dias sem a fronteira de tcodes avançar`);

  if (recusada) {
    avisos.push(v.fim === 'rede-degradada'
      ? 'o signupanytime recusou-nos — a fronteira foi abandonada nesta corrida'
      : 'o signupanytime aplicou rate limit — varredura truncada nesta corrida');
  } else if (v.fim === 'rede-degradada') {
    erros.push('a fronteira foi abandonada por falta de resposta do servidor');
  } else if (v.intervalos_degradados >= 2) {
    erros.push(`${v.intervalos_degradados} intervalos sem resposta (rede degradada)`);
  }

  return { falhar: erros.length > 0, erros, avisos };
}

module.exports = {
  PERDA_MAXIMA,
  DIAS_SEM_DESCOBERTA, DIAS_SEM_AVANCO, avaliarCanario,
  ehRateLimit, erroRateLimit,
  inscritosPorTorneio, perdaNosComuns, deveRecusarEscrita,
};
