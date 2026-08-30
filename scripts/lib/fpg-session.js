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

const BASE_PT = 'https://scoring.datagolf.pt/pt';

/**
 * Sessão para a LISTA de torneios (`tournaments.aspx/TournamentsLST`), também
 * sem cookies guardados.
 *
 * A entrada é a página pública `scoring-pt.datagolf.pt/scripts/tournaments.asp`
 * com o ack universal. Ela responde com o `datalinkpt.html`, que é um gate
 * **JavaScript**: não há redirect HTTP, é o browser que constrói a URL do
 * `1PreparePage.aspx` e navega. Como não corremos JS, reconstruímos essa URL —
 * é o que o `DataGolfeRedirect` da página faz, incluindo o detalhe de o
 * `club=ALL` virar `ccode=All`. O `1PreparePage.aspx` é que emite a sessão e
 * redirecciona para a `tournaments.aspx`.
 *
 * ⚠ Foi por não seguir este caminho que se concluiu, erradamente, que a
 * descoberta precisava de cookies: testou-se o `linkpage.aspx?page=tournlist`
 * no host errado (`scoring.fpg.pt/lists`, onde falha com os 3 acks) e o
 * `1PreparePage.aspx` durante uma avaria da FPG. Pelo caminho certo e com a
 * FPG de pé responde `Result:OK` — 84 993 torneios, com filtro por clube.
 */
const ENTRADA_LISTA = 'https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T';
const PREPARE_LISTA = BASE_PT + '/1PreparePage.aspx?user=fpguser&page=tournlist&ccode=All&pagelang=PT';

async function criarSessaoLista(opts = {}) {
  const s = new Sessao({ base: BASE_PT, ...opts });
  await s.get(ENTRADA_LISTA);              // aquece e apanha o cookie ASP clássico
  const r = await s.get(PREPARE_LISTA);    // emite ASP.NET_SessionId + DG_Lists_URL
  const ok = r.status === 200 && !/Runtime Error|Server Error in|Param_Errors|Err=999/i.test(r.html);
  return ok ? s : null;
}

/**
 * Roteador partilhado: mesma assinatura do `dgPost` dos scrapers, mas capaz de
 * cair no caminho público quando o autenticado falha com 500.
 *
 * Cada família de PageMethod tem o SEU gate público e a SUA sessão — o
 * `DG_Lists_URL` guarda o contexto da página, por isso reaproveitar uma sessão
 * entre famílias faz a seguinte devolver `Result:ERROR` logo depois de um
 * warmup bem sucedido:
 *
 *   tournaments.aspx/*        → scripts/tournaments.asp → 1PreparePage (tournlist)
 *   classif*.aspx/*           → linkpage?page=classif&club&tourn   (por torneio)
 *   FederatedsList_V2.aspx/*  → 1PreparePage (fedlist_v2)
 *   rankings_classif.aspx/*   → linkpage?page=rankingresult&club&ranking
 *
 * ⚠ NÃO cobre as admissions: medido 2026-08-30, o gate público serve umas
 * (000/10941) e devolve "Link address inválido" (Err=400) noutras (987/10245).
 * Enquanto não se souber a regra, esse caminho fica com cookies.
 *
 * @param {object} opts
 * @param {function|null} opts.dgPost — caminho autenticado (null = sem cookies)
 * @param {function} [opts.info]      — logger para anunciar a comutação
 * @returns {{post: function, get publico(): boolean}}
 */
function criarRoteador({ dgPost, info = () => {} }) {
  let publico = !dgPost;
  let sLista, sFed;
  const sClassif = new Map();
  const sRank = new Map();

  const abrirPor = async (pathname, body) => {
    if (pathname.startsWith('tournaments.aspx')) {
      if (sLista === undefined) sLista = await criarSessaoLista().catch(() => null);
      return sLista;
    }
    if (pathname.startsWith('FederatedsList_V2.aspx')) {
      if (sFed === undefined) {
        const x = new Sessao({ base: BASE_PT });
        const g = await x.get(BASE_PT + '/1PreparePage.aspx?user=fpguser&page=fedlist_v2' +
                              '&ccode=All&param=publicrestrictions&pagelang=PT').catch(() => null);
        sFed = g && g.status === 200 && !/Runtime Error|Param_Errors/i.test(g.html) ? x : null;
      }
      return sFed;
    }
    if (pathname.startsWith('rankings_classif.aspx')) {
      const k = `${body.Club}/${body.Rk_Code}`;
      if (!sRank.has(k)) {
        const x = new Sessao();
        const g = await x.get(`${BASE_LISTS}/linkpage.aspx?page=rankingresult&club=${body.Club}` +
                              `&ranking=${body.Rk_Code}&ack=${ACK.classif}&minpoints=1`).catch(() => null);
        sRank.set(k, g && g.status === 200 && !/Runtime Error|Param_Errors/i.test(g.html) ? x : null);
      }
      return sRank.get(k);
    }
    // classif.aspx / classifAgregate.aspx — sessão por torneio
    const k = `${body.tclub}/${body.tcode}`;
    if (!sClassif.has(k)) {
      const x = new Sessao();
      const a = await x.abrir('classif', body.tclub, body.tcode).catch(() => null);
      sClassif.set(k, a && a.ok ? x : null);
    }
    return sClassif.get(k);
  };

  const postPublico = async (pathname, body, qs) => {
    const sess = await abrirPor(pathname, body);
    if (!sess) throw new Error(`sem sessão pública para ${pathname}`);
    const r = await sess.postPageMethod(pathname, body, { queryString: qs });
    if (!r.ok) throw new Error(`${pathname}: Result=${r.result || '?'} (público)`);
    return { Records: r.records, TotalRecordCount: r.total ?? 0, Result: 'OK' };
  };

  return {
    get publico() { return publico; },
    async post(pathname, body, qs) {
      if (publico) return postPublico(pathname, body, qs);
      try {
        return await dgPost(pathname, body, qs);
      } catch (e) {
        // 500 não distingue "cookies mortas" de "FPG em baixo" — vale a pena
        // perguntar sem credenciais antes de desistir.
        if (!e || e.status !== 500) throw e;
        const r = await postPublico(pathname, body, qs).catch(() => null);
        if (!r) throw e;
        publico = true;
        info('cookies não autenticam — a seguir pelo caminho público (sem credenciais)');
        return r;
      }
    },
  };
}

module.exports = { Sessao, BASE_LISTS, BASE_PT, ACK, UA, parseMetaClassif, criarSessaoLista, criarRoteador };
