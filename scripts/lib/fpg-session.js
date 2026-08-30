'use strict';

/**
 * fpg-session.js — sessão FPG auto-gerada, sem cookies guardados.
 *
 * ⚠ AS COOKIES GUARDADAS NUNCA FORAM NECESSÁRIAS PARA ESTE CAMINHO.
 * Descoberto a 2026-08-30, a investigar um scrape do Drive que falhava com
 * HTTP 500: o gateway público `scoring.fpg.pt/lists/linkpage.aspx` (ack
 * universal) **emite ele próprio uma sessão ASP.NET válida** a quem chega sem
 * credencial nenhuma. Com essa sessão, os PageMethods respondem `Result:OK`:
 * leaderboard (`classif.aspx/ClassifLST`) e scorecard buraco-a-buraco
 * (`classifAgregate.aspx/ScoreCard`, com par/SI/metros/CR/slope/cba).
 *
 * O que nos partia era o cliente, não a FPG: mandávamos um `ASP.NET_SessionId`
 * gravado semanas antes e nunca aceitávamos o que o servidor oferecia. Quando
 * a sessão morre — expira, ou o pool ASP.NET recicla — todas as cookies
 * gravadas morrem de uma vez, e o servidor responde 500 em vez de 401. Era
 * isso que sempre lemos como "os cookies expiraram, refrescar no Chrome 90".
 * No dia em que isto se mediu, o browser da utilizadora abria o MESMO URL sem
 * problema nenhum — porque um browser aceita o `Set-Cookie` e renegoceia.
 *
 * ⚠ `fetch` com `redirect: "follow"` NÃO serve aqui. O linkpage responde 302
 * para a página alvo, e a sessão é emitida NO CAMINHO: o fetch nativo não
 * guarda o `Set-Cookie` de um hop para o reenviar no seguinte, por isso o
 * pedido final chega sem sessão e leva 500. É preciso seguir os redirects à
 * mão, acumulando cookies — é o que o `Sessao.get` faz.
 *
 * ⚠ Só o `scoring.fpg.pt/lists` faz isto. O gémeo `scoring.datagolf.pt/pt`
 * continua a exigir o hash do `1EntryPage.aspx`, que não é replicável fora do
 * browser (ver CLAUDE.md) — lá o 500 mantém-se mesmo com jar.
 */

const BASE_LISTS = 'https://scoring.fpg.pt/lists';
const ACK = { classif: '8428ACK987', draw: '8428ACK987', admissions: 'XH256YF450' };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

class Sessao {
  constructor({ base = BASE_LISTS, ua = UA, fetchImpl } = {}) {
    this.base = base;
    this.ua = ua;
    this.jar = new Map();          // nome → valor
    this.fetch = fetchImpl || globalThis.fetch;
  }

  get cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /** Guarda os Set-Cookie de uma resposta (Node 18+: headers.getSetCookie). */
  _guardar(res) {
    const set = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);
    for (const linha of set) {
      const par = String(linha).split(';')[0];
      const i = par.indexOf('=');
      if (i > 0) this.jar.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
  }

  _headers(extra = {}) {
    const h = {
      'User-Agent': this.ua,
      'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
      ...extra,
    };
    if (this.jar.size) h.Cookie = this.cookieHeader;
    return h;
  }

  /** GET que segue redirects À MÃO, acumulando a sessão pelo caminho. */
  async get(url, { maxHops = 6 } = {}) {
    let actual = url;
    for (let hop = 0; hop < maxHops; hop++) {
      const res = await this.fetch(actual, {
        headers: this._headers({ Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }),
        redirect: 'manual',
      });
      this._guardar(res);
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        actual = new URL(loc, actual).toString();
        continue;
      }
      return { status: res.status, url: actual, html: await res.text() };
    }
    throw new Error(`demasiados redirects a partir de ${url}`);
  }

  /**
   * Abre o gateway público de um torneio e fica com a sessão que ele emitir.
   * @param {"classif"|"draw"|"admissions"} pagina
   */
  async abrir(pagina, ccode, tcode, extra = '') {
    const url = `${this.base}/linkpage.aspx?page=${pagina}&club=${ccode}&tourn=${tcode}` +
                `&ack=${ACK[pagina]}${extra}`;
    const r = await this.get(url);
    // Sem sessão, o alvo responde a página de Runtime Error do ASP.NET.
    const erro = /Runtime Error|Server Error in|Param_Errors|Err=999/i.test(r.html);
    return { ...r, ok: r.status === 200 && !erro };
  }

  /**
   * POST a um PageMethod ASP.NET com a sessão da instância.
   * ⚠ Os params extra têm de ir na query string E no body — o servidor rejeita
   * (500) se só forem num dos sítios. Mesma armadilha do my.fpg.pt/ScoreCard.
   */
  async postPageMethod(pathname, body, { queryString = '', referer } = {}) {
    const url = `${this.base}/${pathname}${queryString ? '?' + queryString : ''}`;
    const res = await this.fetch(url, {
      method: 'POST',
      headers: this._headers({
        'Content-Type': 'application/json; charset=utf-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        ...(referer ? { Referer: referer } : {}),
      }),
      body: JSON.stringify(body),
    });
    this._guardar(res);
    const txt = await res.text();
    let d = null;
    try { const j = JSON.parse(txt); d = j.d || j; } catch { /* HTML de erro */ }
    return {
      ok: res.status === 200 && d && d.Result === 'OK',
      status: res.status,
      result: d ? d.Result : null,
      records: (d && d.Records) || [],
      total: d ? d.TotalRecordCount : null,
      raw: d,
      texto: d ? null : txt.slice(0, 300),
    };
  }
}

/**
 * Metadata do torneio a partir do HTML da página de classificações.
 * Serve para o caminho sem cookies: lá o `tournaments.aspx/TournamentsLST`
 * (que é de onde vem normalmente o nome/campo/data) NÃO responde — medido com
 * os três acks universais — mas a própria página já traz o essencial:
 *
 *   Torneio | 2º Torneio Drive Tour Norte – Amarante
 *   Volta   | 1
 *   Campo   | Amarante
 *   Data    | 2026-08-30
 *   PCC     | 0
 */
function parseMetaClassif(html) {
  const txt = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ');
  const L = txt.split('\n').map(x => x.trim()).filter(Boolean);
  const depois = (rotulo) => {
    const i = L.findIndex(x => x.toLowerCase() === rotulo);
    return i >= 0 && i + 1 < L.length ? L[i + 1] : null;
  };
  const data = L.find(x => /^\d{4}-\d{2}-\d{2}$/.test(x)) || null;
  const pcc = depois('pcc');
  return {
    name: depois('torneio'),
    campo: depois('campo'),
    date: data,
    volta: depois('volta') ? Number(depois('volta')) : null,
    pcc: pcc != null && pcc !== '' && !isNaN(Number(pcc)) ? Number(pcc) : null,
  };
}

module.exports = { Sessao, BASE_LISTS, ACK, UA, parseMetaClassif };
