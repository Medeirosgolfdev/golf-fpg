#!/usr/bin/env node
/**
 * import-draw-pdf.js — importa um draw do Club de Golf de Miramar (PDF DataGolf)
 * para public/data/fpg-admissions-draws.json.
 *
 * O clube publica o draw de cada dia em cgm.pt como PDF, ex.:
 *   https://www.cgm.pt/client/files/0000000001/drawmjo2026d2_1493.pdf
 *
 * Estes PDFs não têm ToUnicode: o texto vem como glyph IDs de subsets TrueType
 * na ordenação "standard Macintosh" — gid = charcode − 29 para ASCII, mais uma
 * tabela para os acentuados. É isso que `gidToChar` resolve. As colunas são
 * identificadas pela coordenada X do operador Tm (o layout DataGolf é fixo).
 *
 * fed / hcp / _rfeg NÃO vêm no PDF — são herdados do draw da ronda 1 (ou das
 * inscrições) do mesmo torneio, casando por nome normalizado. Jogadores sem
 * match são reportados e ficam com fed:null.
 *
 * Uso:
 *   node scripts/import-draw-pdf.js <ficheiro.pdf> <tcode> <ronda> [data]
 *   node scripts/import-draw-pdf.js draw_d2.pdf 10652 2 2026-08-20
 *
 *   --dry   analisa e mostra o resultado sem escrever o JSON
 */
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const JSON_PATH = path.join(__dirname, "..", "public", "data", "fpg-admissions-draws.json");

// Ordenação standard Macintosh, a partir de gid 98 (só o que aparece em nomes
// PT/ES). ASCII 32..126 é linear: gid 3..97.
const MAC_EXTRA = {
  98:"Ä",99:"Å",100:"Ç",101:"É",102:"Ñ",103:"Ö",104:"Ü",105:"á",106:"à",107:"â",
  108:"ä",109:"ã",110:"å",111:"ç",112:"é",113:"è",114:"ê",115:"ë",116:"í",117:"ì",
  118:"î",119:"ï",120:"ñ",121:"ó",122:"ò",123:"ô",124:"ö",125:"õ",126:"ú",127:"ù",
  128:"û",129:"ü",157:"ª",158:"º",
};
function gidToChar(g) {
  if (g >= 3 && g <= 97) return String.fromCharCode(g + 29);
  return MAC_EXTRA[g] ?? "?";
}

/** Colunas do layout DataGolf, pela coordenada X do Tm. */
const COLS = [
  [82.9, "time"], [129.9, "hole"], [154.6, "tee"],
  [244.6, "nome"], [486.6, "clube"], [631.8, "r1"], [654.2, "tot"], [682.1, "par"],
];
function colOf(x) {
  let best = null, bd = Infinity;
  for (const [cx, name] of COLS) { const d = Math.abs(cx - x); if (d < bd) { bd = d; best = name; } }
  return bd < 12 ? best : null;
}

/** Devolve os itens de texto posicionados (x, y, texto) das páginas do PDF. */
function pdfItems(file) {
  const data = fs.readFileSync(file);
  const raw = data.toString("latin1");
  const items = [];
  const re = /stream\r?\n/g;
  let page = 0, m;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = data.indexOf("endstream", start);
    if (end < 0) continue;
    let cs;
    try { cs = zlib.inflateSync(data.subarray(start, end)).toString("latin1"); }
    catch { continue; }
    if (!cs.startsWith("0.750000")) continue;   // só os content streams das páginas
    page++;
    for (const blk of cs.matchAll(/BT(.*?)ET/gs)) {
      const b = blk[1];
      const tm = b.match(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) Tm/);
      if (!tm) continue;
      let txt = "";
      for (const arr of b.matchAll(/\[(.*?)\]\s*TJ/gs))
        for (const tok of arr[1].matchAll(/<([0-9A-Fa-f]+)>/g))
          for (let i = 0; i < tok[1].length; i += 4)
            txt += gidToChar(parseInt(tok[1].slice(i, i + 4), 16));
      if (txt.trim()) items.push({ page, x: +tm[5], y: +tm[6], t: txt.trim() });
    }
  }
  return items;
}

/** Agrupa os itens em flights (teeTime + startHole + jogadores). */
function parseGroups(items) {
  const rows = new Map();
  for (const it of items) {
    if (it.y < 150 || it.y > 1080) continue;    // cabeçalho e rodapé
    const c = colOf(it.x);
    if (!c) continue;
    const key = `${it.page}:${String(Math.round(it.y / 4)).padStart(5, "0")}`;
    if (!rows.has(key)) rows.set(key, {});
    rows.get(key)[c] = it.t;
  }
  // Uma linha pode partir-se em dois buckets de Y (o tee desce ~3pt) — reunir.
  const merged = [];
  for (const key of [...rows.keys()].sort()) {
    const r = rows.get(key);
    const prev = merged[merged.length - 1];
    if (prev && !r.nome && prev.nome && !prev.tee) { Object.assign(prev, r); continue; }
    if (prev && r.nome && !prev.nome) { Object.assign(prev, r); continue; }
    merged.push(r);
  }
  const groups = [];
  let cur = null;
  for (const r of merged) {
    if (!r.nome) continue;
    if (r.time) {
      cur = { teeTime: r.time, startHole: parseInt(r.hole || "1", 10) || 1, tee: r.tee, players: [] };
      groups.push(cur);
    }
    if (!cur) continue;
    cur.players.push({ nome: r.nome, clube: r.clube ?? null, tee: r.tee ?? null });
  }
  return groups;
}

const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function main() {
  const args = process.argv.slice(2).filter(a => a !== "--dry");
  const dry = process.argv.includes("--dry");
  const [pdf, tcode, ronda, data, ccode] = args;
  if (!pdf || !tcode || !ronda) {
    console.error("uso: node scripts/import-draw-pdf.js <ficheiro.pdf> <tcode> <ronda> [data] [ccode] [--dry]");
    process.exit(2);
  }

  const groups = parseGroups(pdfItems(pdf));
  const nJog = groups.reduce((a, g) => a + g.players.length, 0);
  if (!nJog) { console.error("✗ Nenhum jogador extraído — layout do PDF mudou?"); process.exit(1); }

  const db = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  // Pode haver mais do que uma entrada com o mesmo tcode (placeholders antigos
  // de outros clubes). Preferir a que tem draws/inscrições reais; `ccode` desempata.
  const cands = db.tournaments.filter(x => String(x.tcode) === String(tcode)
    && (!ccode || String(x.ccode) === String(ccode)));
  const t = cands.find(x => Object.keys(x.draws || {}).length || (x.admissions?.players || []).length)
    || cands[0];
  if (!t) { console.error(`✗ tcode ${tcode} não está no fpg-admissions-draws.json`); process.exit(1); }
  if (cands.length > 1) console.log(`  (${cands.length} entradas com tcode ${tcode} — escolhida "${t.name}", ccode ${t.ccode})`);

  // Índice de referência: draw da R1 primeiro (tem tee/hcp da prova), depois inscrições.
  const ref = new Map();
  for (const g of Object.values(t.draws || {})[0]?.groups || [])
    for (const p of g.players) ref.set(norm(p.nome), p);
  for (const p of t.admissions?.players || [])
    if (!ref.has(norm(p.nome))) ref.set(norm(p.nome), p);

  const semMatch = [];
  const out = groups.map(g => ({
    teeTime: g.teeTime, startHole: g.startHole, tee: g.tee,
    players: g.players.map(p => {
      const k = norm(p.nome);
      let r = ref.get(k);
      if (!r) {
        // Nomes truncados/duplicados na fonte FPG (ex. "… Beníte Beníte"):
        // casar por prefixo, mas só se o candidato for ÚNICO.
        const cand = [...ref.entries()].filter(([kk]) => kk.startsWith(k) || k.startsWith(kk));
        if (cand.length === 1) r = cand[0][1];
      }
      if (!r) semMatch.push(p.nome);
      const e = { nome: p.nome, fed: r?.fed ?? null, clube: p.clube || r?.clube || null,
                  tee: p.tee, hcp: r?.hcp ?? null };
      if (r?._rfeg) e._rfeg = r._rfeg;
      return e;
    }),
  }));

  const r1 = Object.values(t.draws || {})[0];
  t.draws = t.draws || {};
  t.draws[String(ronda)] = {
    name: r1?.name ?? t.name ?? null,
    date: data || null,
    totalJogadores: nJog,
    groups: out,
  };

  console.log(`${t.name} — R${ronda}: ${out.length} flights, ${nJog} jogadores`);
  console.log(`  sem match (fed:null): ${semMatch.length ? semMatch.join(", ") : "nenhum"}`);
  if (r1) {
    const emR2 = new Set(out.flatMap(g => g.players.map(p => norm(p.nome))));
    const saidos = r1.groups.flatMap(g => g.players)
      .filter(p => ![...emR2].some(k => k === norm(p.nome) || k.startsWith(norm(p.nome)) || norm(p.nome).startsWith(k)));
    console.log(`  estavam na R1 e não estão agora: ${saidos.length ? saidos.map(p => p.nome).join(", ") : "nenhum"}`);
  }
  if (dry) { console.log("  (--dry: JSON não escrito)"); return; }
  fs.writeFileSync(JSON_PATH, JSON.stringify(db, null, 2) + "\n", "utf8");
  console.log(`✓ escrito em ${path.relative(process.cwd(), JSON_PATH)}`);
}

main();
