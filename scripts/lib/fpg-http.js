/**
 * scripts/lib/fpg-http.js — POST wrapper unificado para os PageMethods
 * ASP.NET da FPG (scoring.datagolf.pt, my.fpg.pt, scoring.fpg.pt).
 *
 * Substitui as cópias de dgPost()/fpgPost() dos scrapers. Comportamento
 * modelado no scrape-jovens-node.js (a versão mais robusta):
 *   - retry com backoff em HTTP 500 (sinal canónico de cookie expirado /
 *     transient do servidor FPG)
 *   - detecção de Result:"ERROR" no payload
 *   - FpgHttpError com .status para os callers distinguirem 500 de outros
 *
 * Uso:
 *   const { makeFpgPost, FpgHttpError } = require("./lib/fpg-http");
 *   const dgPost = makeFpgPost({
 *     baseUrl: "https://scoring.datagolf.pt/pt",
 *     cookie: COOKIE,
 *     ua: UA,
 *     origin: "https://scoring.datagolf.pt",
 *     referer: "https://scoring.datagolf.pt/pt/tournaments.aspx",
 *   });
 *   const d = await dgPost("classif.aspx/ClassifLST", body, "jtStartIndex=0");
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class FpgHttpError extends Error {
  constructor(status, pathname, bodySnippet) {
    super(`HTTP ${status} em ${pathname}${bodySnippet ? ` — ${bodySnippet.slice(0, 200)}` : ""}`);
    this.name = "FpgHttpError";
    this.status = status;
    this.pathname = pathname;
    this.bodySnippet = bodySnippet;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.baseUrl — base SEM trailing slash (ex: "https://scoring.datagolf.pt/pt")
 * @param {string} opts.cookie  — cookie header completo
 * @param {string} opts.ua      — User-Agent
 * @param {string} [opts.origin]  — header Origin
 * @param {string} [opts.referer] — header Referer
 * @param {object} [opts.extraHeaders] — headers adicionais (ex: Sec-Fetch-* do my.fpg.pt)
 * @param {number} [opts.retries=2]    — tentativas extra em HTTP 500
 * @returns {(pathname: string, bodyObj: object, queryString?: string) => Promise<any>}
 */
function makeFpgPost({ baseUrl, cookie, ua, origin, referer, extraHeaders = {}, retries = 2 }) {
  const headers = {
    "Content-Type": "application/json; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "User-Agent": ua,
    "Cookie": cookie,
    ...(origin ? { Origin: origin } : {}),
    ...(referer ? { Referer: referer } : {}),
    ...extraHeaders,
  };

  return async function fpgPost(pathname, bodyObj, queryString = "") {
    const url = `${baseUrl}/${pathname}${queryString ? "?" + queryString : ""}`;
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(bodyObj),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          // HTTP 500 no FPG é o sinal canónico de cookies expirados (o
          // servidor explode em vez de devolver 401). Retry por causa de
          // transients — se persistir, é cookie morto.
          if (res.status === 500 && attempt < retries) {
            await sleep(500 * (attempt + 1));
            continue;
          }
          throw new FpgHttpError(res.status, pathname, txt.slice(0, 500));
        }
        const json = await res.json();
        const d = json.d || json;
        if (d.Result === "ERROR") throw new Error(`FPG erro: ${d.Message || "unknown"}`);
        return d;
      } catch (e) {
        lastErr = e;
        if (!(e instanceof FpgHttpError) || e.status !== 500 || attempt >= retries) throw e;
      }
    }
    throw lastErr;
  };
}

module.exports = { makeFpgPost, FpgHttpError, sleep };
