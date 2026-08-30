'use strict';

/**
 * fpg-liveness.js — separar "a FPG está em baixo" de "os nossos cookies morreram".
 *
 * ⚠ HTTP 500 NÃO É PROVA DE COOKIE EXPIRADO. Foi assim que sempre o lemos
 * (ver `lib/fpg-http.js`: "500 no FPG é o sinal canónico de cookies
 * expirados") porque o ASP.NET da FPG explode em vez de devolver 401 — e na
 * maioria das vezes o diagnóstico até acerta. Mas a 2026-08-30 mediu-se o
 * contrário: cookies refrescados às 10:40 UTC, e às 17:26 o cookie-health
 * dava DOIS secrets por mortos. Os mesmos cookies, testados à mão, davam o
 * mesmo 500 — e o `1PreparePage.aspx`, um entry gate que não leva credencial
 * nenhuma, dava 500 também. Não eram os cookies: eram as aplicações ASP.NET
 * `scoring.datagolf.pt/pt` e `scoring.fpg.pt/lists` a arder. O alarme mandou
 * refrescar cookies bons — e um alarme que manda fazer trabalho inútil é
 * exactamente como se perde a confiança nele.
 *
 * A DISCRIMINAÇÃO: um pedido que não leva credenciais NENHUMAS não pode estar
 * a falhar por causa das nossas credenciais. Logo, antes de acusar os
 * cookies, faz-se o mesmo pedido SEM cookies:
 *
 *   • controlo ASP.NET falha  → a fonte está em baixo (o nosso segredo é
 *                               irrelevante; refrescá-lo não muda nada)
 *   • controlo ASP.NET responde → aí sim, o 500 autenticado é dos cookies
 *
 * ⚠ O controlo TEM de bater na mesma aplicação. O `linkpage.aspx?page=draw`
 * responde 200 sem cookies mesmo com tudo o resto em baixo (é servido pelo
 * ASP clássico do `scoring-pt.datagolf.pt`, outra máquina) — usá-lo como
 * controlo devolvia "são os cookies" precisamente no dia em que não eram.
 * Fica como sonda de alcançabilidade (a FPG existe?), nunca como controlo.
 */

const CONTROL_ASPNET =
  'https://scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=000&tourn=10941&ack=XH256YF450';
const CONTROL_REACH =
  'https://scoring.fpg.pt/lists/linkpage.aspx?page=draw&club=000&tourn=0&round=1&ack=8428ACK987';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Uma sonda, deliberadamente SEM header Cookie. */
async function sondar(url, { timeoutMs = 15000, fetchImpl } = {}) {
  const f = fetchImpl || globalThis.fetch;
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await f(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8' },
      redirect: 'follow',
      signal: ctl.signal,
    });
    const txt = await r.text();
    // "Runtime Error" com 200 conta como em baixo: o IIS às vezes serve a
    // página de erro do ASP.NET sem propagar o 5xx.
    const erro = /Runtime Error|Server Error in/i.test(txt);
    return { up: r.status >= 200 && r.status < 400 && !erro, status: r.status, runtimeError: erro };
  } catch (e) {
    return { up: false, status: 0, erro: e.message };
  } finally {
    clearTimeout(to);
  }
}

/**
 * Corre as duas sondas sem credenciais.
 * @returns {{aspnet:object, reach:object, fonteEmBaixo:boolean}}
 */
async function sondarFpg(opts = {}) {
  const [aspnet, reach] = await Promise.all([
    sondar(opts.controlAspnet || CONTROL_ASPNET, opts),
    sondar(opts.controlReach  || CONTROL_REACH,  opts),
  ]);
  return { aspnet, reach, fonteEmBaixo: !aspnet.up };
}

/**
 * Veredicto final de um teste de cookies.
 * @param {boolean} autenticouOk  — o pedido COM cookies passou?
 * @param {object}  sondas        — resultado de sondarFpg()
 * @returns {"ok"|"fonte-em-baixo"|"cookies"}
 */
function diagnosticar(autenticouOk, sondas) {
  if (autenticouOk) return 'ok';
  return sondas && sondas.fonteEmBaixo ? 'fonte-em-baixo' : 'cookies';
}

/** Linha para o log/resumo do workflow. */
function explicar(veredicto, sondas) {
  if (veredicto === 'ok') return 'cookies válidos';
  if (veredicto === 'cookies') {
    return 'cookies inválidos/expirados — o controlo SEM cookies respondeu, ' +
           'logo a FPG está de pé e o 500 é do nosso segredo';
  }
  const r = sondas && sondas.reach && sondas.reach.up
    ? 'a FPG responde no ASP clássico (draw), mas a aplicação ASP.NET está a dar erro'
    : 'a FPG não responde de todo';
  return `FONTE EM BAIXO — ${r}. Refrescar cookies NÃO resolve; voltar a tentar mais tarde`;
}

/** Códigos de saída partilhados pelos testes de cookies. */
const EXIT = { OK: 0, ERRO: 1, COOKIES: 2, FONTE_EM_BAIXO: 3 };

module.exports = {
  CONTROL_ASPNET, CONTROL_REACH,
  sondar, sondarFpg, diagnosticar, explicar, EXIT,
};
