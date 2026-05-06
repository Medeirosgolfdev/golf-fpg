/**
 * scripts/parse-pdfs.js
 *
 * FASE 2: Parser dos PDFs descarregados pelo download-pdfs.js.
 *
 * Lê public/data/ffgolf-pdfs/pdf-index.json, processa todos os PDFs do tipo
 * "resultats-*" / "classement" / "finaux" e extrai leaderboards.
 *
 * Output: public/data/ffgolf/lgpidf-{year}-{slug}.json (1 ficheiro por torneio)
 *
 * Tem parsers diferentes para tentar — começamos com o do lgpidf (formato
 * concatenado sem espaços), e adicionamos outros conforme descobrimos PDFs
 * com layouts diferentes.
 *
 * USO:
 *   node scripts/parse-pdfs.js              # parse tudo
 *   node scripts/parse-pdfs.js --slug ...   # 1 só torneio
 *   node scripts/parse-pdfs.js --debug      # mostra texto raw quando falha parser
 */
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

const ROOT = path.resolve(__dirname, "../public/data/ffgolf-pdfs");
const INDEX_PATH = path.join(ROOT, "pdf-index.json");
const OUT_DIR = path.resolve(__dirname, "../public/data/ffgolf");

if (!fs.existsSync(INDEX_PATH)) {
  console.error("❌ pdf-index.json não encontrado. Corre primeiro:");
  console.error("    node scripts/download-pdfs.js");
  process.exit(1);
}

const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));

/* ═══════════════════════════════════════════════════════════════
   PARSERS — múltiplas estratégias
   ═══════════════════════════════════════════════════════════════ */

/* Parser 1: lgpidf concatenado
   Formato: "1prixNAME, NameCLUBindexT1T2Total"
   Exemplo: "11BADATE, FarahBASSIN BLEU5,67979158"
*/
/* Detectar tipo de PDF a partir do conteúdo (não do filename) */
function detectPdfContent(text) {
  const head = text.slice(0, 800).toLowerCase();
  if (/liste des départs|liste des departs|tee times?|d[ée]parts du/i.test(head)) return "tee-times";
  if (/entrée côté|entr[ée]e cot[ée]/i.test(head)) return "course-map";
  if (/liste des inscrits|liste des joueurs|joueurs retenus|joueuses retenues|inscrits au/i.test(head)) return "inscrits";
  if (/liste des résultats|liste des resultats|classement|palmar[èe]s/i.test(head)) return "results";
  return "unknown";
}

/* Parser liste-inscrits / liste des joueurs retenus — formato lgpidf concatenado:
   "1FRABADATE FarahBASSIN BLEUU12 Fille11065.6"
   "SCRATCHFRADEYRA EugenieTERRE BLANCHEU12 Fille1781611.3"
   "12FRAMONNEREAU LouiseRCF LA BOULIEU12 Fille9929.2WC"
   Colunas: Rang | Nat | Nom et prénom | Club | Catégorie | Mérite jeune | Moyenne SPI | Idx | (Wild Card)
   Nota: nem todos têm Mérite/SPI (apenas Idx). Captura o que conseguir. */
function parseInscrits(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);
  const players = [];
  // Split nome/clube por última boundary lowercase→uppercase (nome+clube colados em UPPER)
  function splitNameClub(s) {
    let lastIdx = -1;
    for (let i = 1; i < s.length; i++) {
      if (/[a-zà-ÿ]/.test(s[i - 1]) && /[A-ZÀ-Ý]/.test(s[i])) lastIdx = i;
    }
    if (lastIdx > 0) return [s.slice(0, lastIdx).trim(), s.slice(lastIdx).trim()];
    return [s.trim(), ""];
  }
  for (const line of lines) {
    if (/^(Rang|Nat|Page|Total|Format|Nombre|Liste|Grand Prix|GOLF|Score|Simple|Inscrits|Joueurs|Joueuses|Mérite|Moyenne|Catégorie|Index|Idx)/i.test(line)) continue;
    // Formato lgpidf concatenado:
    // (rank|SCRATCH)FRA(name+club)(category)(stats)(WC?)
    // category: "U12 Fille", "U12 Garçon", "BENJAMIN Fille", "MINIME Garçon", etc.
    const m = line.match(
      /^(\d{1,3}|SCRATCH)FRA(.+?)((?:U\d+|BENJAMIN(?:E)?|MINIM(?:E)?|CADET(?:TE)?|JUNIOR)\s*(?:Fille|Gar[çc]ons?))([\d.]+)(WC)?$/i
    );
    if (m) {
      const [, rank, namePlusClub, category, stats, wc] = m;
      const [name, club] = splitNameClub(namePlusClub);
      // Idx = handicap index, formato X.X com 1-2 dígitos inteiros + 1 decimal (range golf 0-54)
      // Tentar primeiro greedy (\d{1,2}\.\d). Se idx > 54 (impossível), reverter para \d\.\d.
      let idxMatch = stats.match(/(\d{1,2}\.\d)$/);
      let idx = idxMatch ? parseFloat(idxMatch[1]) : null;
      let beforeIdx = idxMatch ? stats.slice(0, -idxMatch[1].length) : stats;
      if (idx != null && idx > 54) {
        const lazy = stats.match(/(\d\.\d)$/);
        if (lazy) {
          idx = parseFloat(lazy[1]);
          beforeIdx = stats.slice(0, -lazy[1].length);
        }
      }
      // beforeIdx = mérite + moyenne SPI concatenados sem separador (ambíguo — guardar raw)
      players.push({
        rank: rank === "SCRATCH" ? null : parseInt(rank, 10),
        scratch: rank === "SCRATCH",
        nationality: "FRA",
        name: name.replace(/\s+/g, " ").trim(),
        club: club.replace(/\s+/g, " ").trim(),
        category: category.replace(/\s+/g, " ").trim(),
        hcp: idx,
        meriteSpiRaw: beforeIdx || null,
        wildCard: !!wc,
        registered: true,
      });
      continue;
    }
    // Fallback: formato antigo "1BENHAMMOU, NoryPARIS GOLF 1317,6"
    const mOld = line.match(
      /^(\d{1,3})?([A-ZÀ-Ý][A-ZÀ-Ý' \-]+,\s*[A-Za-zÀ-ÿ\-'. ]+?)([A-ZÀ-Ý][A-ZÀ-Ý' \-/]{2,40}?)(\d{1,2},\d{1,2}|\+\d{1,2}\.\d)$/
    );
    if (mOld) {
      const [, posOpt, name, club, hcp] = mOld;
      players.push({
        pos: posOpt ? parseInt(posOpt, 10) : null,
        name: name.replace(/,\s*/, " ").replace(/\s+/g, " ").trim(),
        club: club.replace(/\s+/g, " ").trim(),
        hcp: parseFloat(hcp.replace(",", ".")),
        registered: true,
      });
    }
  }
  return players;
}

/* Parser tee-times PDFs (Liste des départs)
   Formato: por grupo (n°), tem:
     "1\nBENHAMMOU, Nory\n08:301\n17,616U12 GarçonsPARIS GOLF 13"
     ou:
     "ARCIVAUX, Tom34,435U12 GarçonsST MARC"
   Extrai: grupo, tee time, hole start (1 ou 10), categoria, jogadores */
function parseTeeTimes(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);
  const groups = [];
  let currentGroup = null;
  let pendingTeeTime = null;
  let pendingHole = null;

  for (const line of lines) {
    // Skip headers comuns
    if (/^(Format|Nombre|Liste|Grand Prix|GOLF|LIGUE|Score|Simple|Page|Total)/i.test(line)) continue;
    // Tee time: "08:301" = 08:30 + tee 1
    const teeMatch = line.match(/^(\d{1,2}:\d{2})(\d{1,2})$/);
    if (teeMatch) {
      pendingTeeTime = teeMatch[1];
      pendingHole = parseInt(teeMatch[2], 10);
      continue;
    }
    // Linha "número grupo" sozinha (ex: "1", "2")
    if (/^\d{1,2}$/.test(line) && parseInt(line, 10) <= 50) {
      // Pode ser número de grupo OU buraco — depende do contexto
      // Se o número for pequeno (≤30) e seguir a "n°", é grupo
      if (currentGroup) groups.push(currentGroup);
      currentGroup = { groupNumber: parseInt(line, 10), players: [] };
      continue;
    }
    // Player: "BENHAMMOU, Nory" sozinho OU "ARCIVAUX, Tom34,435U12 GarçonsST MARC" (concatenado)
    const playerMatch = line.match(
      /^([A-ZÀ-Ý][A-ZÀ-Ý' \-]+,\s*[A-Za-zÀ-ÿ\-'. ]+?)(\d{1,2},\d)(\d{1,3})(U\d+\s+(?:Garçons?|Filles?|Cadets?|Cadettes?|Benjamins?|Benjamines?|Minimes?))?([A-ZÀ-Ý][A-ZÀ-Ý' \-]+)$/
    );
    if (playerMatch) {
      const [, name, idx, hcp, cat, club] = playerMatch;
      if (!currentGroup) currentGroup = { groupNumber: groups.length + 1, players: [] };
      currentGroup.players.push({
        name: name.replace(/,\s*/, " ").replace(/\s+/g, " ").trim(),
        hcp: parseFloat(idx.replace(",", ".")),
        playHcp: parseInt(hcp, 10),
        category: cat ? cat.trim() : null,
        club: club.replace(/\s+/g, " ").trim(),
        teeTime: pendingTeeTime,
        startHole: pendingHole,
      });
      continue;
    }
    // Player simples (só nome em linha sozinha)
    const simpleName = line.match(/^([A-ZÀ-Ý][A-ZÀ-Ý' \-]+,\s*[A-Za-zÀ-ÿ\-'. ]+)$/);
    if (simpleName) {
      if (!currentGroup) currentGroup = { groupNumber: groups.length + 1, players: [] };
      currentGroup.players.push({
        name: simpleName[1].replace(/,\s*/, " ").replace(/\s+/g, " ").trim(),
        teeTime: pendingTeeTime,
        startHole: pendingHole,
      });
    }
  }
  if (currentGroup && currentGroup.players.length) groups.push(currentGroup);
  return groups;
}

/* Parser course map (Entrée Côté): hole_num + distance + entry side
   Formato observado:
     "Entrée Côté\n1\n75Droite\n2\n184Gauche\n..."
   Output: array por buraco com distance + side */
function parseCourseMap(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);
  const holes = [];
  let pendingHole = null;
  for (const line of lines) {
    if (/^Entrée Côté|^Page|^Total|^Grand Prix|^Golf de|^\d{2}\/\d{2}\/\d{4}/i.test(line)) continue;
    // Hole number sozinho
    if (/^\d{1,2}$/.test(line) && parseInt(line, 10) >= 1 && parseInt(line, 10) <= 18) {
      pendingHole = parseInt(line, 10);
      continue;
    }
    // "75Droite" ou "184Gauche" ou "1311Gauche" (= "131" + "1" extra)
    const m = line.match(/^(\d{2,4})(Droite|Gauche|Right|Left)$/i);
    if (m && pendingHole != null) {
      let distance = parseInt(m[1], 10);
      // Sanity check: golf hole reasonable range. >700 yards/meters is impossible for a single hole.
      // Se for 4 dígitos, provavelmente é "131" + "1" ou "256" + "1" merged. Assumir os 3 primeiros.
      if (distance > 700 && m[1].length === 4) {
        distance = parseInt(m[1].slice(0, 3), 10);
      }
      holes.push({
        hole: pendingHole,
        distance,
        unit: "yards-or-meters",  // ambíguo; preservar valor raw
        entrySide: m[2],
        rawDigits: m[1],  // valor original para debug
      });
      pendingHole = null;
    }
  }
  return holes;
}

/**
 * splitTwoRoundTail — divide a cauda concatenada "tour1+tour2+total" usando
 * a invariante tour1 + tour2 == total. Retorna {r1, r2, total, dnf}.
 *
 * Exemplos:
 *   "8076156" → r1=80, r2=76, total=156 (80+76=156 ✓)
 *   "7272144" → r1=72, r2=72, total=144 ✓
 *   "84FORFOR" → r1=84, r2=null, total=null, dnf=true
 *   "FORFORFOR" → r1=null, r2=null, total=null, dnf=true
 */
function splitTwoRoundTail(tail) {
  // Caso DNF puro / forfait
  if (/^(FOR|---)+$/.test(tail)) {
    return { r1: null, r2: null, total: null, dnf: true };
  }
  // Caso jogou R1 mas DNF/FOR no R2: "84FORFOR" ou "84---FOR"
  const partialDnf = tail.match(/^(\d{2,3})(FOR|---)(FOR|---)$/);
  if (partialDnf) {
    return { r1: parseInt(partialDnf[1], 10), r2: null, total: null, dnf: true };
  }
  // Caso normal: tudo dígitos, total = r1 + r2
  if (!/^\d+$/.test(tail)) return null;
  // Tentar comprimentos do total: 3 ou 4 dígitos
  for (const totalLen of [3, 4]) {
    if (tail.length < totalLen + 2) continue;
    const totalStr = tail.slice(-totalLen);
    const total = parseInt(totalStr, 10);
    if (total < 100 || total > 400) continue;  // gross total razoável
    const before = tail.slice(0, -totalLen);
    // Tentar cada split possível em before (2-3 dígitos para r1, 2-3 para r2)
    for (let i = 2; i <= 3; i++) {
      if (i > before.length - 2) continue;
      const t1str = before.slice(0, i);
      const t2str = before.slice(i);
      if (t2str.length < 2 || t2str.length > 3) continue;
      const r1 = parseInt(t1str, 10);
      const r2 = parseInt(t2str, 10);
      // Tours razoáveis: 50-130 strokes
      if (r1 < 50 || r1 > 130) continue;
      if (r2 < 50 || r2 > 130) continue;
      if (r1 + r2 === total) {
        return { r1, r2, total, dnf: false };
      }
    }
  }
  return null;
}

/**
 * splitOneRoundTail — para PDFs de 1 ronda só ("Tour Poucets"): tour + total
 * onde tour == total. Ex: "8084" → r1=80, total=84? Mais provável é tour=80 e o outro é coluna "Tour" duplicada ou agg.
 * Na prática, 1-round PDFs têm formato "RANK PRIX NAME CLUB IDX TOUR TOTAL" onde tour==total.
 */
function splitOneRoundTail(tail) {
  if (/^(FOR|---)+$/.test(tail)) {
    return { r1: null, total: null, dnf: true };
  }
  if (!/^\d+$/.test(tail)) return null;
  // Procurar split onde tour == total
  for (let totalLen = 2; totalLen <= 3; totalLen++) {
    if (tail.length < totalLen * 2) continue;
    const totalStr = tail.slice(-totalLen);
    const total = parseInt(totalStr, 10);
    if (total < 30 || total > 200) continue;
    const before = tail.slice(0, -totalLen);
    if (parseInt(before, 10) === total) return { r1: total, total, dnf: false };
  }
  // Fallback: total único (sem coluna Tour separada)
  if (tail.length >= 2 && tail.length <= 3) {
    const v = parseInt(tail, 10);
    if (v >= 30 && v <= 200) return { r1: v, total: v, dnf: false };
  }
  return null;
}

function parseLgpidfConcatenated(text) {
  // Skip se for tee-times ou course-map
  const ct = detectPdfContent(text);
  if (ct === "tee-times" || ct === "course-map" || ct === "inscrits") return [];

  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);
  const players = [];
  for (const line of lines) {
    if (/^(Pos\.|Page|Total|Format|Nombre|Liste|Grand Prix|GOLF|Score|Simple|Dames|Messieurs|Mixte|U\d+|Benjamin|Minim|\d{2}\.\d{2}\.\d{4})/i.test(line)) continue;
    // PREFIX: pos prix name club index — comum a 1-round e 2-round
    // (tail é processado separadamente por splitTwoRoundTail/splitOneRoundTail)
    const prefix = line.match(
      /^(\d{1,3}|---)(\d{1,3}|-{2,3})([A-ZÀ-Ý][A-ZÀ-Ý' \-]+,\s*[A-Za-zÀ-ÿ\-'. ]+?)([A-ZÀ-Ý][A-ZÀ-Ý' \-/]{2,40}?)([+-]?\d{1,2},\d)(.+)$/
    );
    if (prefix) {
      const [, pos, prix, name, club, idx, tail] = prefix;
      // Tentar 2-round primeiro (formato dominante: GP Jeunes, Qualification CJF)
      const r2parsed = splitTwoRoundTail(tail);
      if (r2parsed && r2parsed.r2 != null) {
        players.push({
          pos: pos === "---" ? null : parseInt(pos, 10),
          prix: prix === "---" || prix === "--" ? null : parseInt(prix, 10),
          name: name.replace(/,\s*/, " ").replace(/\s+/g, " ").trim(),
          club: club.replace(/\s+/g, " ").trim(),
          hcp: parseFloat(idx.replace(",", ".")),
          r1: r2parsed.r1, r2: r2parsed.r2, total: r2parsed.total,
          dnf: r2parsed.dnf,
        });
        continue;
      }
      // Fallback 1-round (Tour Poucets etc)
      const r1parsed = splitOneRoundTail(tail);
      if (r1parsed) {
        players.push({
          pos: pos === "---" ? null : parseInt(pos, 10),
          prix: prix === "---" || prix === "--" ? null : parseInt(prix, 10),
          name: name.replace(/,\s*/, " ").replace(/\s+/g, " ").trim(),
          club: club.replace(/\s+/g, " ").trim(),
          hcp: parseFloat(idx.replace(",", ".")),
          r1: r1parsed.r1, total: r1parsed.total,
          roundScores: [r1parsed.r1],
          dnf: r1parsed.dnf,
        });
        continue;
      }
      // DNF/FORFAIT puro (sem rondas)
      if (r2parsed && r2parsed.dnf) {
        players.push({
          pos: pos === "---" ? null : parseInt(pos, 10),
          prix: prix === "---" || prix === "--" ? null : parseInt(prix, 10),
          name: name.replace(/,\s*/, " ").replace(/\s+/g, " ").trim(),
          club: club.replace(/\s+/g, " ").trim(),
          hcp: parseFloat(idx.replace(",", ".")),
          r1: r2parsed.r1, r2: null, total: null,
          dnf: true,
        });
      }
      continue;
    }
    // Fallback: regex original (caso não bata o prefixo novo)
    const m2 = line.match(
      /^(\d{1,3})(\d{1,3}|-{2,3})([A-ZÀ-Ý][A-ZÀ-Ý' \-]+,\s*[A-Za-zÀ-ÿ\-'. ]+?)([A-ZÀ-Ý][A-ZÀ-Ý' \-/]{2,40}?)(\d{1,2},\d)(\d{2,3}d?|-{3})(\d{2,3}d?|-{3})(\d{2,4}|-{3}|\d+d)$/
    );
    if (m2) {
      const [, pos, prix, name, club, idx, t1, t2, tot] = m2;
      const r1 = /^\d+d?$/.test(t1) ? parseInt(t1, 10) : null;
      const r2 = /^\d+d?$/.test(t2) ? parseInt(t2, 10) : null;
      const total = /^\d+d?$/.test(tot) ? parseInt(tot, 10) : null;
      players.push({
        pos: parseInt(pos, 10),
        prix: prix === "---" || prix === "--" ? null : parseInt(prix, 10),
        name: name.replace(/,\s*/, " ").replace(/\s+/g, " ").trim(),
        club: club.replace(/\s+/g, " ").trim(),
        hcp: parseFloat(idx.replace(",", ".")),
        r1, r2, total,
        dnf: /d/.test(t1) || /d/.test(t2) || /d/.test(tot),
      });
      continue;
    }
    // Pattern Tour Poucets (1 ronda + Tour + Total iguais): "11MA, Mingrui EvaBUSSY18,83636"
    const mTour = line.match(
      /^(\d{1,3})(\d{1,3}|-{2,3})([A-ZÀ-Ý][A-ZÀ-Ý' \-]+,\s*[A-Za-zÀ-ÿ\-'. ]+?)([A-ZÀ-Ý][A-ZÀ-Ý' \-/]{2,40}?)(\d{1,2},\d)(\d{2,3}d?)(\d{2,3}d?)$/
    );
    if (mTour) {
      const [, pos, prix, name, club, idx, tour, tot] = mTour;
      const total = /^\d+d?$/.test(tot) ? parseInt(tot, 10) : null;
      const tourScore = /^\d+d?$/.test(tour) ? parseInt(tour, 10) : null;
      // Validar: Tour deve ser igual ao Total (ou diferentemente representativo)
      players.push({
        pos: parseInt(pos, 10),
        prix: prix === "---" || prix === "--" ? null : parseInt(prix, 10),
        name: name.replace(/,\s*/, " ").replace(/\s+/g, " ").trim(),
        club: club.replace(/\s+/g, " ").trim(),
        hcp: parseFloat(idx.replace(",", ".")),
        r1: tourScore, total,
        roundScores: [tourScore],
        dnf: /d$/.test(tot),
      });
      continue;
    }
    // Pattern com 1 ronda só (sem coluna Tour separada)
    const m1 = line.match(
      /^(\d{1,3})(\d{1,3}|-{2,3})([A-ZÀ-Ý][A-ZÀ-Ý' \-]+,\s*[A-Za-zÀ-ÿ\-'. ]+?)([A-ZÀ-Ý][A-ZÀ-Ý' \-/]{2,40}?)(\d{1,2},\d)(\d{2,3}d?)$/
    );
    if (m1) {
      const [, pos, prix, name, club, idx, tot] = m1;
      const total = /^\d+d?$/.test(tot) ? parseInt(tot, 10) : null;
      players.push({
        pos: parseInt(pos, 10),
        prix: prix === "---" || prix === "--" ? null : parseInt(prix, 10),
        name: name.replace(/,\s*/, " ").replace(/\s+/g, " ").trim(),
        club: club.replace(/\s+/g, " ").trim(),
        hcp: parseFloat(idx.replace(",", ".")),
        r1: total, total,
        roundScores: [total],
        dnf: /d$/.test(tot),
      });
    }
  }
  return players;
}

/* Parser 2: linhas com espaços/separadores tradicionais (caso nem todos sejam concatenados) */
function parseSpacedFormat(text) {
  const lines = text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l);
  const players = [];
  for (const line of lines) {
    if (/^(Pos|Page|Total|Format)/i.test(line)) continue;
    // pos NAME, name CLUB hcp T1 T2 TOTAL  (com espaços)
    const m = line.match(
      /^(\d{1,3}|T\d{1,3})\s+(\d+|-{2,3})?\s*([A-ZÀ-Ý][A-ZÀ-Ý' \-]+,\s*[A-Za-zÀ-ÿ\-'. ]+?)\s+([A-ZÀ-Ý][A-ZÀ-Ý' \-]{2,40})\s+(\d+[,.]?\d*)\s+(\d{2,3}d?|-{3})\s+(\d{2,3}d?|-{3})\s+(\d{2,4}|-{3}|\d+d)\s*$/
    );
    if (m) {
      const r1 = /^\d+d?$/.test(m[6]) ? parseInt(m[6], 10) : null;
      const r2 = /^\d+d?$/.test(m[7]) ? parseInt(m[7], 10) : null;
      const total = /^\d+d?$/.test(m[8]) ? parseInt(m[8], 10) : null;
      players.push({
        pos: parseInt(m[1].replace(/^T/, ""), 10),
        prix: m[2] && !/^-/.test(m[2]) ? parseInt(m[2], 10) : null,
        name: m[3].replace(/,\s*/, " ").replace(/\s+/g, " ").trim(),
        club: m[4].replace(/\s+/g, " ").trim(),
        hcp: parseFloat((m[5] || "").replace(",", ".")),
        r1, r2, total,
        dnf: /d/.test(m[6]) || /d/.test(m[7]) || /d/.test(m[8]),
      });
    }
  }
  return players;
}

/* Mapear p.kind do filename → contentType (fallback robusto) */
function kindToContentType(kind) {
  if (!kind) return null;
  if (/^departs?$/i.test(kind)) return "tee-times";
  if (/^liste-inscrits$/i.test(kind)) return "inscrits";
  if (/^course-map$/i.test(kind) || /^entree-cote$/i.test(kind)) return "course-map";
  if (/^(resultats|classement|finaux)/i.test(kind)) return "results";
  return null;
}

/**
 * extractMeta — extrai data + course name de cabeçalho do PDF.
 * Procura linhas tipo "GOLF DU PRIEURE - 21.03.2026 - 22.03.2026" ou
 * "GARDEN GOLF DE SENART - 22.04.2026 - 23.04.2026".
 * Devolve { courseName, dateStart (YYYY-MM-DD), dateEnd (YYYY-MM-DD) }.
 */
function extractMeta(text) {
  const lines = text.split("\n").slice(0, 25).map((l) => l.trim()).filter((l) => l);
  for (const line of lines) {
    const m = line.match(
      /^([A-ZÀ-Ý][A-ZÀ-Ý' \-]+?)\s+-\s+(\d{2}\.\d{2}\.\d{4})(?:\s+-\s+(\d{2}\.\d{2}\.\d{4}))?$/
    );
    if (m) {
      const [, courseName, d1, d2] = m;
      const toIso = (s) => {
        const [dd, mm, yy] = s.split(".");
        return `${yy}-${mm}-${dd}`;
      };
      return {
        courseName: courseName.trim(),
        dateStart: toIso(d1),
        dateEnd: d2 ? toIso(d2) : toIso(d1),
      };
    }
  }
  return null;
}

/**
 * extractDateFromFilename — fallback quando o PDF não tem header de torneio.
 * Apanha "au-DD-mois" (mês francês) → YYYY-MM-DD.
 * Ex: "liste-des-joueurs-retenus-au-06-mai.pdf" + ano 2026 → 2026-05-06.
 */
function extractDateFromFilename(filename, year) {
  if (!filename || !year) return null;
  const monthMap = {
    janvier: "01", janv: "01",
    fevrier: "02", "février": "02", fev: "02",
    mars: "03",
    avril: "04", avr: "04",
    mai: "05",
    juin: "06",
    juillet: "07", juil: "07",
    aout: "08", "août": "08",
    septembre: "09", sept: "09",
    octobre: "10", oct: "10",
    novembre: "11", nov: "11",
    decembre: "12", "décembre": "12", dec: "12",
  };
  const m = filename.toLowerCase().match(/au-?(\d{1,2})-?([a-zéèêà]+)/);
  if (m) {
    const dd = String(parseInt(m[1], 10)).padStart(2, "0");
    const mm = monthMap[m[2]];
    if (mm) return `${year}-${mm}-${dd}`;
  }
  // Pattern "au-DDMM" (ex: "au-1903" → 19 mar)
  const m2 = filename.toLowerCase().match(/au-(\d{2})(\d{2})\D/);
  if (m2) {
    const dd = m2[1], mm = m2[2];
    if (parseInt(mm, 10) >= 1 && parseInt(mm, 10) <= 12 && parseInt(dd, 10) >= 1 && parseInt(dd, 10) <= 31) {
      return `${year}-${mm}-${dd}`;
    }
  }
  return null;
}

/* Tentar parsers apropriados por tipo de conteúdo */
async function parsePdf(pdfPath, kindHint) {
  const buf = fs.readFileSync(pdfPath);
  let data;
  try {
    data = await pdfParse(buf);
  } catch (e) {
    return { err: e.message.slice(0, 80) };
  }
  const detected = detectPdfContent(data.text);
  const fromKind = kindToContentType(kindHint);
  const contentType = (detected !== "unknown") ? detected : (fromKind || "unknown");
  const result = { contentType, detectedFromContent: detected, detectedFromKind: fromKind, text: data.text };
  if (contentType === "tee-times") {
    result.teeTimeGroups = parseTeeTimes(data.text);
    result.parser = "tee-times";
    return result;
  }
  if (contentType === "course-map") {
    result.holes = parseCourseMap(data.text);
    result.parser = "course-map";
    return result;
  }
  if (contentType === "inscrits") {
    result.inscrits = parseInscrits(data.text);
    result.parser = "inscrits";
    return result;
  }
  const candidates = [
    { name: "lgpidf-concat", players: parseLgpidfConcatenated(data.text) },
    { name: "spaced", players: parseSpacedFormat(data.text) },
  ];
  candidates.sort((a, b) => b.players.length - a.players.length);
  const best = candidates[0];
  result.parser = best.name;
  result.players = best.players;
  result.candidatesSummary = candidates.map((c) => `${c.name}=${c.players.length}`).join(", ");
  return result;
}

function groupByTournament(pdfs) {
  const groups = new Map();
  for (const p of pdfs) {
    const k = `${p.source}|${p.slug}`;
    if (!groups.has(k)) groups.set(k, { source: p.source, slug: p.slug, title: p.title, year: p.year, pdfs: [] });
    groups.get(k).pdfs.push(p);
  }
  return [...groups.values()];
}

(async () => {
  const args = process.argv.slice(2);
  const debug = args.includes("--debug");
  const slugFilter = args.includes("--slug") ? args[args.indexOf("--slug") + 1] : null;

  let pdfsToProcess = index.pdfs.filter((p) =>
    !/^(reglement|annexe)$/.test(p.kind || "")
  );
  if (slugFilter) pdfsToProcess = pdfsToProcess.filter((p) => p.slug === slugFilter);
  console.log(`📖 Parser PDFs — ${pdfsToProcess.length} PDFs (resultats + tee-times + course-map)`);
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const groups = groupByTournament(pdfsToProcess);
  let okFiles = 0;
  let totalPlayers = 0;
  let totalTeeTimeGroups = 0;
  let totalCourseHoles = 0;

  for (const g of groups) {
    console.log(`\n🏌️  ${g.slug}`);
    const courses = [];
    const teeTimePdfs = [];
    const courseMapPdfs = [];
    const inscritosPdfs = [];
    for (const p of g.pdfs) {
      const localPath = path.join(ROOT, p.localPath);
      if (!fs.existsSync(localPath)) {
        console.log(`   ⚠ ${p.filename}: ficheiro não existe`);
        continue;
      }
      const result = await parsePdf(localPath, p.kind);
      if (result.err) {
        console.log(`   ❌ ${p.filename}: ${result.err}`);
        continue;
      }
      if (result.contentType === "tee-times") {
        const groupCount = result.teeTimeGroups?.length || 0;
        const playerCount = result.teeTimeGroups?.reduce((s, gg) => s + gg.players.length, 0) || 0;
        console.log(`   🕐 ${p.kind} tee-times: ${groupCount} grupos, ${playerCount} jogadores`);
        teeTimePdfs.push({ pdfKind: p.kind, pdfFilename: p.filename, pdfUrl: p.url, groups: result.teeTimeGroups });
        continue;
      }
      if (result.contentType === "course-map") {
        console.log(`   📐 ${p.kind} course-map: ${result.holes?.length || 0} buracos`);
        courseMapPdfs.push({ pdfFilename: p.filename, pdfUrl: p.url, holes: result.holes });
        continue;
      }
      if (result.contentType === "inscrits") {
        const inscritosCount = result.inscrits?.length || 0;
        console.log(`   📋 ${p.kind} inscritos: ${inscritosCount} jogadores`);
        inscritosPdfs.push({ pdfKind: p.kind, pdfFilename: p.filename, pdfUrl: p.url, category: p.category, players: result.inscrits || [] });
        continue;
      }
      console.log(`   ▶ ${p.category || "?"} ${p.kind} (${result.parser}, ${result.candidatesSummary || ""}): ${result.players?.length || 0} jog`);
      if ((result.players?.length || 0) === 0 && debug) {
        console.log("     [debug] first 800 chars:");
        console.log("     " + result.text.slice(0, 800).replace(/\n/g, "\n     "));
      }
      courses.push({
        category: p.category || p.kind,
        pdfKind: p.kind,
        pdfFilename: p.filename,
        pdfUrl: p.url,
        parser: result.parser,
        players: result.players || [],
      });
    }
    if (!courses.length && !teeTimePdfs.length && !courseMapPdfs.length && !inscritosPdfs.length) continue;

    // Extrair meta (data + course name) do primeiro PDF que conseguir
    let meta = null;
    for (const p of g.pdfs) {
      const localPath = path.join(ROOT, p.localPath);
      if (!fs.existsSync(localPath)) continue;
      try {
        const data = await pdfParse(fs.readFileSync(localPath));
        meta = extractMeta(data.text);
        if (meta) break;
      } catch { /* skip */ }
    }
    // Fallback: tentar extrair data do filename (au-DD-mois) — útil para futuros sem resultats
    if (!meta) {
      for (const p of g.pdfs) {
        const date = extractDateFromFilename(p.filename, g.year);
        if (date) {
          meta = { courseName: "", dateStart: date, dateEnd: date };
          break;
        }
      }
    }

    let courseInfo = {
      name: meta?.courseName || "",
      tee: "",
      par: [],
      meters: [],
      si: [],
      parTotal: 0,
      metersTotal: 0,
    };
    if (courseMapPdfs.length && courseMapPdfs[0].holes?.length === 18) {
      const distances = courseMapPdfs[0].holes.map((h) => h.distance);
      courseInfo = {
        ...courseInfo,
        meters: distances,
        metersTotal: distances.reduce((s, v) => s + v, 0),
      };
    }

    // Lista de TODOS os PDFs do torneio com URLs públicas (para download)
    const allPdfs = g.pdfs.map((p) => ({
      kind: p.kind || "unknown",
      filename: p.filename,
      url: p.url,
      localPath: `/data/ffgolf-pdfs/${p.localPath.replace(/\\/g, "/")}`,
      category: p.category,
    }));

    const out = {
      tournament: g.title || g.slug,
      slug: g.slug,
      year: g.year,
      section: g.source,
      source: index.pdfs.find((p) => p.slug === g.slug)?.url?.replace(/\/[^/]*\.pdf$/, "") || "",
      scrapedAt: new Date().toISOString(),
      courseLevel: g.source === "lgpidf" ? "regional-paris-idf" : g.source,
      course: courseInfo,
      dateStart: meta?.dateStart || null,
      dateEnd: meta?.dateEnd || null,
      rounds: courses.some((c) => c.players.some((p) => p.r2 != null)) ? 2 : 1,
      format: "PDF-only (sem hole-by-hole)",
      divisions: [...new Set(courses.map((c) => c.category))],
      courses,
      teeTimePdfs,
      courseMapPdfs,
      inscritosPdfs,
      allPdfs,
      players: courses.flatMap((c) =>
        c.players.map((p) => ({
          ...p,
          division: c.category,
          country: "FR",
          rounds: p.r1 != null && p.r2 != null
            ? [{ round: 1, gross: p.r1, scores: [], f9: 0, b9: 0 }, { round: 2, gross: p.r2, scores: [], f9: 0, b9: 0 }]
            : p.r1 != null
            ? [{ round: 1, gross: p.r1, scores: [], f9: 0, b9: 0 }]
            : [],
          roundScores: p.r1 != null ? [p.r1, p.r2].filter((x) => x != null) : (p.total != null ? [p.total] : []),
          toPar: null,
        }))
      ),
    };
    const outPath = path.join(OUT_DIR, `lgpidf-${out.year}-${g.slug.slice(0, 60)}.json`);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf-8");
    console.log(`   💾 ${outPath} (${out.players.length} jogadores · ${teeTimePdfs.length} PDF tee-times · ${courseMapPdfs.length} PDF course-map · ${inscritosPdfs.length} PDF inscritos · ${allPdfs.length} PDFs total)`);
    okFiles++;
    totalPlayers += out.players.length;
    totalTeeTimeGroups += teeTimePdfs.reduce((s, t) => s + (t.groups?.length || 0), 0);
    totalCourseHoles += courseMapPdfs.reduce((s, t) => s + (t.holes?.length || 0), 0);
  }

  console.log(`\n✅ ${okFiles} ficheiros JSON · ${totalPlayers} jogadores · ${totalTeeTimeGroups} grupos tee-times · ${totalCourseHoles} buracos course-map`);
})();
