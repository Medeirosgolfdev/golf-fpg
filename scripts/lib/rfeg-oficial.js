/**
 * scripts/lib/rfeg-oficial.js — liga os juniores do kids2 ao hándicap oficial
 * actual da RFEG (rfeg-hcp.json, scrape-federados-es.js) e aos rankings
 * juvenis da RFEG (rfeg-rankings/, scrape-rfeg-ranking.js). 22/10/2026.
 *
 * Usado pelo agregador (util/rfeg-oficial.js → junior.rfegOficial) e pelo
 * scrape-federados-es.js (para saber que licenças consultar) — a MESMA regra
 * de casamento nos dois sítios.
 *
 * Casamento (do mais seguro para o menos):
 *   1. licença igual (a do kids2 ou uma das antigas);
 *   2. os mesmos 6 dígitos finais da licença (mudou de clube — memória
 *      rfeg-licencia-sufixo-estavel);
 *   3. só para quem NÃO tem licença RFEG no kids2: nome + ano de nascimento —
 *      as palavras do nome do kids2 todas no nome do ranking (≥2), o ano do
 *      ranking − EDAD do PDF = ano de nascimento, o mesmo sexo, e um só
 *      candidato. Sem data de nascimento conhecida não há casamento por nome.
 * Guardas: com data de nascimento e EDAD, uma diferença de mais de um ano
 * anula também o casamento por licença (num Sub-12 nunca pode aparecer um
 * adulto — nem um cadete); um hándicap cujo sexo não bate com o do júnior
 * não entra.
 */
const fs = require("fs");
const path = require("path");
const { normLic, sufixoLic } = require("./rfeg-web");

const PARTICULAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "I", "DA", "DO", "DOS", "VAN", "DER", "VON", "E"]);
function palavras(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w.length >= 2 && !PARTICULAS.has(w));
}

/** Título do ranking → { nacional, sexo, curto }. */
function classificar(titulo) {
  const t = String(titulo || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const sexo = /FEMENIN/.test(t) ? "F" : /MASCULIN/.test(t) ? "M" : null;
  const nacional = /NACIONAL/.test(t);
  const ano = /(20\d\d)/.exec(t)?.[1] || "";
  let base;
  const zona = /ZONA\s*(\d+)\s*\(([^)]*)\)/i.exec(String(titulo).replace(/\s+/g, " "));
  if (zona) base = `Zona ${zona[1]} (${zona[2].trim()})`;
  else base = /INFANTIL/.test(t) ? "Infantil" : /CADETE/.test(t) ? "Cadete" : /ALEVIN/.test(t) ? "Alevín" : "Juvenil";
  const sub = zona ? (/CADETE.?INFANTIL/.test(t) ? " Cadete/Infantil" : /INFANTIL/.test(t) ? " Infantil" : /ALEVIN/.test(t) ? " Alevín" : "") : "";
  return { nacional, sexo, curto: `${nacional ? "Nacional " : ""}${base}${sub}${sexo ? " " + sexo : ""} ${ano}`.replace(/\s+/g, " ").trim() };
}

/** Linhas de todos os rankings em disco: [{lic, suf, pal, edad, ano, pos, n, pts, titulo, curto, fecha, nacional, sexo, id}]. */
function carregarRankings(dir) {
  const linhas = [];
  if (!fs.existsSync(dir)) return linhas;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); // ilegível = erro
    const c = classificar(r.titulo);
    for (const p of r.players || []) {
      linhas.push({
        lic: p.licencia ? normLic(p.licencia) : null, suf: p.licencia ? sufixoLic(p.licencia) : null,
        pal: palavras(p.nombre), nome: p.nombre, edad: p.edad ?? null, ano: r.year,
        pos: p.pos ?? null, n: r.total ?? (r.players || []).length, pts: p.puntos ?? null,
        titulo: r.titulo, curto: c.curto, fecha: r.fechaIso ?? null, nacional: c.nacional, sexo: c.sexo, id: r.id,
      });
    }
  }
  return linhas;
}

const anoNasc = (j) => Number(String(j.dob || "").slice(0, 4)) || null;
function licencasDe(j) {
  const r = j.sources?.rfeg;
  if (!r?.lic) return [];
  const hist = (r.historicalLicenses || []).map((h) => (typeof h === "string" ? h : h?.lic)).filter(Boolean);
  return [...new Set([r.lic, ...hist].map(normLic))];
}
/** A idade do ranking contradiz a data de nascimento? (só quando há as duas) */
const idadeContradiz = (j, l) => {
  const a = anoNasc(j);
  return a != null && l.edad != null && Math.abs(l.ano - l.edad - a) > 1;
};

/**
 * Índices para casar depressa. `linhas` = carregarRankings().
 */
function indexar(linhas) {
  const porLic = new Map(), porSuf = new Map();
  for (const l of linhas) {
    if (l.lic) { if (!porLic.has(l.lic)) porLic.set(l.lic, []); porLic.get(l.lic).push(l); }
    if (l.suf) { if (!porSuf.has(l.suf)) porSuf.set(l.suf, []); porSuf.get(l.suf).push(l); }
  }
  // por palavra: cada linha fica na lista da sua palavra mais rara (apelido) — basta para o subconjunto
  const porPal = new Map();
  for (const l of linhas) for (const w of new Set(l.pal)) { if (!porPal.has(w)) porPal.set(w, []); porPal.get(w).push(l); }
  return { porLic, porSuf, porPal };
}

/**
 * Linhas de ranking deste júnior + como casaram, e as recusadas pela guarda de idade.
 * @returns {{ linhas: Array<object & {via:string}>, recusadas: number }}
 */
function rankingsDoJunior(j, idx) {
  const lics = licencasDe(j);
  const out = new Map();
  let recusadas = 0;
  const aceitar = (l, via) => {
    if (idadeContradiz(j, l)) { recusadas++; return; }
    const k = `${l.id}|${l.lic || l.nome}`;
    if (!out.has(k)) out.set(k, { ...l, via });
  };
  let porLicenca = 0;
  for (const lic of lics) for (const l of idx.porLic.get(lic) || []) { porLicenca++; aceitar(l, "licenca"); }
  if (!porLicenca) for (const lic of lics) { const s = sufixoLic(lic); for (const l of (s && idx.porSuf.get(s)) || []) aceitar(l, "sufixo"); }
  if (!lics.length) {
    // 3. nome + ano de nascimento
    const a = anoNasc(j);
    if (a != null) {
      const cand = new Map(); // licença (ou nome) → linhas
      for (const nome of new Set([j.canonicalName, ...(j.aliases || [])])) {
        const P = palavras(nome);
        if (P.length < 2) continue;
        const raras = P.map((w) => idx.porPal.get(w) || []).sort((x, y) => x.length - y.length)[0] || [];
        for (const l of raras) {
          if (l.edad == null || l.ano - l.edad !== a) continue;
          if (l.sexo && j.sex && l.sexo !== j.sex) continue;
          const S = new Set(l.pal);
          if (!P.every((w) => S.has(w))) continue;
          const k = l.lic || l.pal.join(" ");
          if (!cand.has(k)) cand.set(k, []);
          cand.get(k).push(l);
        }
      }
      if (cand.size === 1) for (const l of [...cand.values()][0]) aceitar(l, "nome");
    }
  }
  const linhas = [...out.values()].sort((x, y) => y.ano - x.ano || Number(y.nacional) - Number(x.nacional) || (x.pos ?? 999) - (y.pos ?? 999));
  return { linhas, recusadas };
}

/** O hándicap oficial deste júnior (ou null). `hcp` = byLicencia do rfeg-hcp.json. */
function hcpDoJunior(j, hcp, licsExtra = []) {
  for (const lic of [...licencasDe(j), ...licsExtra]) {
    const r = hcp?.[lic];
    if (!r || r.naoEncontrado || r.hcp == null) continue;
    if (r.sexo && j.sex && r.sexo !== j.sex) continue;
    return r;
  }
  return null;
}

/**
 * Acrescenta `junior.rfegOficial` a quem casar:
 *   { lic?, hcp?, hcpData?, hcpClube?, hcpVia?, rankings?: [{t, curto, ano, pos, n, pts, f, nac, via}] }
 * Devolve contagens para o log do agregador.
 */
function enriquecer(juniors, { hcp, linhas }) {
  const idx = indexar(linhas);
  const st = { comHcp: 0, comRanking: 0, porNome: 0, recusadas: 0, espanhois: 0, semNada: 0 };
  for (const j of juniors) {
    const temLic = licencasDe(j).length > 0;
    if (temLic) st.espanhois++;
    const { linhas: ls, recusadas } = rankingsDoJunior(j, idx);
    st.recusadas += recusadas;
    const licsRanking = [...new Set(ls.map((l) => l.lic).filter(Boolean))];
    const h = hcpDoJunior(j, hcp, licsRanking);
    if (!h && !ls.length) { if (temLic) st.semNada++; continue; }
    const o = {};
    if (h) { o.lic = h.lic; o.hcp = h.hcp; o.hcpData = h.data; if (h.clube) o.hcpClube = h.clube; o.hcpVia = h.via; st.comHcp++; }
    if (ls.length) {
      if (!o.lic && ls[0].lic) o.lic = ls[0].lic;
      o.rankings = ls.slice(0, 4).map((l) => ({ t: l.titulo, curto: l.curto, ano: l.ano, pos: l.pos, n: l.n, pts: l.pts, f: l.fecha, nac: l.nacional, via: l.via }));
      st.comRanking++;
      if (ls[0].via === "nome") st.porNome++;
    }
    j.rfegOficial = o;
  }
  return st;
}

module.exports = { palavras, classificar, carregarRankings, indexar, rankingsDoJunior, hcpDoJunior, enriquecer, licencasDe };
