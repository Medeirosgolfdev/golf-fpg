#!/usr/bin/env node
/**
 * scripts/scrape-clube-draws.js
 * ─────────────────────────────────────────────────────────────────────────
 * Scrape do DRAW (emparelhamentos + tee times) de um torneio FPG a partir de
 * `scoring-pt.datagolf.pt/scripts/draw.asp` (página pública, ack universal) e
 * embebe-os no ficheiro CLUBES{ano}.json correspondente, no campo `draws`.
 *
 * O loader de Clubes da FPGPage promove `t.draws` → `_draws`, e o
 * TournamentDetail mostra a tab de Draw (mesma UI do Nacional de Jovens).
 *
 * USAGE:
 *   node scripts/scrape-clube-draws.js --ccode 000 --tcode 10912 \
 *        --file public/data/CLUBES2026.json --rounds 1,2
 *
 * Flags:
 *   --ccode   (obrigatório) club code (3 dígitos)
 *   --tcode   (obrigatório) tournament code
 *   --file    (obrigatório) caminho do CLUBES{ano}.json alvo
 *   --rounds  rondas a tentar (default "1,2,3,4"); rondas sem draw publicado
 *             são ignoradas (não apagam dados já existentes)
 *   --ack     token (default XH256YF45T)
 *
 * Idempotente: merge aditivo por ronda (uma ronda vazia nunca apaga uma
 * ronda já gravada). Escrita atómica.
 * ─────────────────────────────────────────────────────────────────────────
 */
"use strict";

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const argVal = (f, d = null) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const CCODE = argVal("--ccode");
const TCODE = argVal("--tcode");
const FILE = argVal("--file");
const ACK = argVal("--ack", "XH256YF45T");
const ROUNDS = (argVal("--rounds", "1,2,3,4") || "").split(",").map(s => parseInt(s.trim(), 10)).filter(Boolean);

if (!CCODE || !TCODE || !FILE) {
  console.error("Uso: node scripts/scrape-clube-draws.js --ccode 000 --tcode 10912 --file public/data/CLUBES2026.json [--rounds 1,2]");
  process.exit(1);
}

const decode = (s) => s
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í")
  .replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&atilde;/g, "ã")
  .replace(/&ccedil;/g, "ç").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .trim();

/** Parse do HTML do draw.asp → array de flights {teeTime,startHole,tee,players[]} */
function parseDraw(html) {
  const idx = html.indexOf("Jogador");
  const body = idx >= 0 ? html.slice(idx) : html;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const flights = new Map();
  let m;
  while ((m = rowRe.exec(body))) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => decode(c[1]));
    // O draw.asp varia de colunas entre torneios/rondas:
    //   4: [Hora, Buraco, Jogador, Clube]                 (R2 foursomes 2026)
    //   5: [Hora, Buraco, Cor, Jogador, Clube]            (R1 individual 2026)
    //   6: [Hora, Buraco, Cor, Jogador, FED, Clube]       (regional 2024)
    // Por isso identificamos as colunas por CONTEÚDO, não por posição:
    //   hora = col[0]; buraco = col[1]; clube = última coluna;
    //   entre elas: cor de tee (palavra de cor), fed (só dígitos), jogador (o resto).
    if (cells.length < 4) continue;
    const hora = cells[0];
    const buraco = cells[1];
    if (!/^\d{1,2}:\d{2}$/.test(hora)) continue; // salta cabeçalho/linhas extra
    const club = cells[cells.length - 1] || null;
    let cor = null, fed = null, jogador = null;
    for (const x of cells.slice(2, cells.length - 1)) {
      if (/^\d+$/.test(x)) { if (!fed) fed = x; continue; }            // nº federado
      if (/^(amarel|branc|vermelh|azu|pret|verd|laranj|doura|castanh|rosa|cinz|prata|bronze)/i.test(x)) { if (!cor) cor = x; continue; } // cor de tee
      if (!jogador) jogador = x;                                        // nome do jogador
    }
    if (!jogador) continue;
    const startHole = parseInt(buraco, 10) || null;
    const key = `${hora}|${startHole}`;
    if (!flights.has(key)) flights.set(key, { teeTime: hora, startHole, tee: cor || null, players: [] });
    flights.get(key).players.push({ nome: jogador, clube: club, ...(fed ? { fed } : {}) });
  }
  return [...flights.values()];
}

async function fetchRound(rd) {
  const url = `https://scoring-pt.datagolf.pt/scripts/draw.asp?club=${CCODE}&tourn=${TCODE}&round_number=${rd}&ack=${ACK}`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseDraw(await r.text());
}

(async () => {
  const repo = path.resolve(__dirname, "..");
  const file = path.isAbsolute(FILE) ? FILE : path.join(repo, FILE);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const t = (data.tournaments || []).find(x => String(x.ccode) === String(CCODE) && String(x.tcode) === String(TCODE));
  if (!t) { console.error(`Torneio ${CCODE}/${TCODE} não encontrado em ${FILE}`); process.exit(1); }

  const draws = { ...(t.draws || {}) };
  let added = 0;
  for (const rd of ROUNDS) {
    try {
      const groups = await fetchRound(rd);
      const np = groups.reduce((s, f) => s + f.players.length, 0);
      if (groups.length && np > 0) {
        draws[String(rd)] = { totalJogadores: np, groups };
        added++;
        console.log(`[clube-draws] R${rd}: ${groups.length} flights · ${np} jogadores`);
      } else {
        console.log(`[clube-draws] R${rd}: sem draw publicado (ignorado)`);
      }
    } catch (e) {
      console.log(`[clube-draws] R${rd}: erro ${e.message} (ignorado)`);
    }
  }

  if (added === 0 && !t.draws) { console.log("[clube-draws] nada para gravar"); process.exit(2); }

  t.draws = draws;
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  JSON.parse(fs.readFileSync(tmp, "utf8")); // re-parse antes de substituir
  fs.renameSync(tmp, file);
  console.log(`[clube-draws] ✓ ${file} — draws: ${Object.keys(t.draws).join(", ")}`);
})().catch(e => { console.error("[clube-draws] FATAL", e); process.exit(1); });
