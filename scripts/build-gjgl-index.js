/**
 * build-gjgl-index.js — Gera um índice SLIM dos torneios GJGL.
 *
 * Lê todos os `public/data/gjgl/gjgl_*.json` (ficheiros pesados, ~13 MB no
 * total) e extrai apenas os metadados necessários para a sidebar e o header
 * da GlobalJuniorPage (CircuitShell): datas, campo, rondas, par, contagem de
 * jogadores por divisão e os URLs oficiais (tour / live scoring / entry list).
 *
 * Output: `public/data/gjgl-index.json` (pequeno, ~30-50 KB) — carregado à
 * cabeça pela página para enriquecer a sidebar SEM descarregar os 13 MB. O
 * detalhe completo de cada torneio continua a ser carregado de forma lazy ao
 * seleccionar (gjgl_{slug}.json).
 *
 * Uso:
 *   node scripts/build-gjgl-index.js
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "public", "data");
const GJGL_DIR = path.join(DATA_DIR, "gjgl");
const OUT = path.join(DATA_DIR, "gjgl-index.json");

function main() {
  if (!fs.existsSync(GJGL_DIR)) {
    console.error("Pasta não encontrada:", GJGL_DIR);
    process.exit(1);
  }
  const files = fs.readdirSync(GJGL_DIR).filter((f) => /^gjgl_.*\.json$/.test(f));
  const tournaments = {};
  let ok = 0;

  for (const f of files) {
    let d;
    try {
      d = JSON.parse(fs.readFileSync(path.join(GJGL_DIR, f), "utf8"));
    } catch (e) {
      console.warn("Falha a ler", f, String(e.message || e));
      continue;
    }
    if (!d || !d.slug) continue;
    const divisions = Array.isArray(d.divisions)
      ? d.divisions.map((v) => ({ ak: v.ak, ageGroup: v.ageGroup, players: Array.isArray(v.players) ? v.players.length : 0 }))
      : [];
    const playerCount = divisions.reduce((s, v) => s + (v.players || 0), 0);
    // hasManuel / hasPt — varre os jogadores de todas as divisões.
    const nm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
    let hasManuel = false, hasPt = false;
    for (const v of (Array.isArray(d.divisions) ? d.divisions : [])) {
      for (const p of (Array.isArray(v.players) ? v.players : [])) {
        const x = nm(p.name);
        if (/manuel/.test(x) && /(medeiros|goulart)/.test(x)) hasManuel = true;
        if (/portugal/i.test(p.country || "") || /^(pt|prt)$/i.test(p.country || "")) hasPt = true;
        if (hasManuel && hasPt) break;
      }
      if (hasManuel && hasPt) break;
    }
    tournaments[d.slug] = {
      tournament: d.tournament ?? null,
      year: d.year ?? null,
      country: d.country ?? null,
      section: d.section ?? null,
      start_date: d.start_date ?? null,
      end_date: d.end_date ?? null,
      course: d.course ?? null,
      rounds: d.rounds ?? null,
      parTotal: d.parTotal ?? null,
      tour_url: d.tour_url ?? null,
      livescoring_url: d.livescoring_url ?? null,
      entrylist_url: d.entrylist_url ?? null,
      divisions,
      playerCount,
      hasManuel,
      hasPt,
    };
    ok++;
  }

  const out = { generated_at: new Date().toISOString(), tournaments };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`gjgl-index.json escrito: ${ok} torneios → ${OUT}`);
}

main();
