/**
 * scripts/lib/rfeg-web.js — pedidos e parsing das páginas públicas da RFEG
 * (rfegolf.es), partilhados por scrape-federados-es.js (hándicap) e
 * scrape-rfeg-ranking.js (rankings). 22/10/2026.
 *
 * - Sem cookies em disco nem secrets. O serviço de hándicap é um GET limpo; só
 *   o ranking (WebForms com postbacks) precisa da cookie de sessão ASP.NET, que
 *   vive em memória numa `Sessao` (uma por corrida).
 * - Um pedido de cada vez por quem chama + pausa (`sleep`) entre pedidos: o
 *   site é da federação, não é para martelar.
 */
const https = require("https");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sessão HTTP com cookie jar em memória (só para os postbacks do ranking). */
class Sessao {
  constructor({ cookies = false } = {}) { this.usaCookies = cookies; this.jar = {}; }
  guardar(res) {
    if (!this.usaCookies) return;
    for (const l of res.headers["set-cookie"] || []) {
      const m = /^([^=]+)=([^;]*)/.exec(l);
      if (m) this.jar[m[1].trim()] = m[2].trim();
    }
  }
  /** @returns {Promise<{status:number, body:string, url:string}>} */
  pedir(method, url, body = null, tentativas = 3, saltos = 5) {
    return new Promise((resolve, reject) => {
      const tentar = (n) => {
        const u = new URL(url);
        const headers = { "User-Agent": UA, Accept: "text/html,*/*;q=0.8", "Accept-Language": "es-ES,es;q=0.9", "Cache-Control": "no-cache" };
        const ck = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; ");
        if (ck) headers.Cookie = ck;
        if (body != null) {
          headers["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8";
          headers["Content-Length"] = Buffer.byteLength(body);
          headers.Origin = u.origin; headers.Referer = url;
        }
        const req = https.request({ method, hostname: u.hostname, path: u.pathname + u.search, headers, timeout: 30000 }, (res) => {
          this.guardar(res);
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && saltos > 0) {
            res.resume();
            this.pedir("GET", new URL(res.headers.location, url).toString(), null, tentativas, saltos - 1).then(resolve, reject);
            return;
          }
          const c = [];
          res.on("data", (x) => c.push(x));
          res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(c).toString("utf8"), url }));
        });
        req.on("error", (e) => { if (n > 1) setTimeout(() => tentar(n - 1), 1500 * (4 - n)); else reject(e); });
        req.on("timeout", () => req.destroy(new Error("timeout")));
        if (body != null) req.write(body);
        req.end();
      };
      tentar(tentativas);
    });
  }
  get(url) { return this.pedir("GET", url); }
  post(url, body) { return this.pedir("POST", url, body); }
}

const ENT = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', ordm: "º", ordf: "ª",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü", ccedil: "ç",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", Uuml: "Ü", Ccedil: "Ç" };
/** Só resolve as entidades HTML (valores de formulário: nada de mexer em espaços). */
function entidades(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, k) => (k in ENT ? ENT[k] : m));
}
/** HTML → texto: tira tags, resolve entidades, junta espaços. */
function texto(s) {
  return entidades(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Linhas de dados de uma GridView ASP.NET (as `_GridOlympus…`), em células de texto. */
function linhasGrelha(html, idTabela) {
  const m = new RegExp(`<table[^>]*\\bid="[^"]*${idTabela}"[^>]*>([\\s\\S]*?)</table>`, "i").exec(html);
  if (!m) return null; // sem grelha (≠ grelha vazia)
  const out = [];
  for (const tr of m[1].match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
    if (!/_GridOlympus/i.test(tr)) continue; // salta o cabeçalho
    out.push((tr.match(/<td\b[\s\S]*?<\/td>/gi) || []).map(texto));
  }
  return out;
}

/** "dd-mm-aaaa" ou "dd/mm/aaaa" → "aaaa-mm-dd" (null se não for data). */
function dataIso(d) {
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(String(d || "").trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/** Licença normalizada (maiúsculas, sem espaços). */
const normLic = (l) => String(l || "").replace(/\s+/g, "").toUpperCase();
/** Os últimos 6 dígitos da licença: o identificador pessoal, que se mantém
 *  quando o jogador muda de clube (memória rfeg-licencia-sufixo-estavel). */
function sufixoLic(l) {
  const s = normLic(l);
  return /\d{6}$/.test(s) && s.length >= 8 ? s.slice(-6) : null;
}

module.exports = { Sessao, UA, sleep, entidades, texto, linhasGrelha, dataIso, normLic, sufixoLic };
