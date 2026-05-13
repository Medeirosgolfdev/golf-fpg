/**
 * scripts/aggregator/sources/fpg.js
 *
 * Adapter FPG (Federação Portuguesa de Golfe).
 *
 * Lê:
 *   - players.json (roster de jogadores acompanhados, ~270 entradas com dob+sex+hcp)
 *   - pull-torneios*.json (resultados de torneios FPG + Jovens + Drive)
 *   - drive-data-YYYY-MM.json (Drive Tour)
 *   - aquapor-data-YYYY-MM.json (Aquapor)
 *   - federados.json é apenas para enriquecer; lemos se existir mas não é obrigatório
 *
 * Chave forte: nfed / fedCode. Jogadores em torneios sem fedCode são ignorados
 * (entram pelo cross-source por nome+dob no matcher se aplicável).
 */

const path = require("path");
const { DATA, DATA_DIR, readJsonSafe, listFiles } = require("../util/io");
const { displayName, countryToIso2, dobToIso } = require("../util/names");
const { seriesId } = require("../util/id");
const { warn, sub } = require("../util/log");

const SOURCE_ID = "fpg";
const SOURCE_LABEL = "Federação Portuguesa de Golfe";

/** Mapeia escalão FPG → ageMin/ageMax aproximados. */
function escalaoToAges(esc) {
  if (!esc) return { ageMin: null, ageMax: null };
  const s = String(esc).toLowerCase();
  if (s.includes("sub 10") || s.includes("sub-10")) return { ageMin: null, ageMax: 10 };
  if (s.includes("sub 12") || s.includes("sub-12")) return { ageMin: 11, ageMax: 12 };
  if (s.includes("sub 14") || s.includes("sub-14")) return { ageMin: 13, ageMax: 14 };
  if (s.includes("sub 16") || s.includes("sub-16")) return { ageMin: 15, ageMax: 16 };
  if (s.includes("sub 18") || s.includes("sub-18")) return { ageMin: 17, ageMax: 18 };
  if (s.includes("sub 21") || s.includes("sub-21")) return { ageMin: 19, ageMax: 21 };
  if (s.includes("sub 25") || s.includes("sub-25")) return { ageMin: 22, ageMax: 25 };
  return { ageMin: null, ageMax: null };
}

/** Detecta sexo a partir do escalão (-H, -M, masculino, feminino, etc.) */
function sexFromEscalao(esc) {
  if (!esc) return null;
  const s = String(esc).toLowerCase();
  if (/\bh\b|masculin|men|sub\s*\d+\s*-?\s*h\b/.test(s)) return "M";
  if (/\bs\b|feminin|women|sub\s*\d+\s*-?\s*s\b/.test(s)) return "F";
  return null;
}

/** Heurística para detectar série a partir do nome do torneio. */
function seriesFromTournName(name) {
  if (!name) return { id: null, label: null };
  const n = String(name);
  // Campeonato Nacional de Jovens
  if (/Campeonato Nacional de Sub\s*\d+/i.test(n)) {
    const m = n.match(/Sub\s*(\d+)/i);
    const tier = m ? `sub-${m[1]}` : "";
    return { id: `fpg-nacional-jovens-${tier}`, label: `Nacional de Jovens ${m ? `Sub-${m[1]}` : ""}`.trim() };
  }
  // Drive Tour
  if (/Drive Tour/i.test(n)) return { id: "fpg-drive-tour", label: "Drive Tour" };
  if (/Grande Final Drive/i.test(n) || /Final Drive Tour/i.test(n)) return { id: "fpg-drive-tour-final", label: "Drive Tour · Final" };
  // Aquapor
  if (/Aquapor/i.test(n)) return { id: "fpg-aquapor-tour", label: "Aquapor Tour" };
  // Greatgolf
  if (/Greatgolf Junior Open/i.test(n)) return { id: "fpg-greatgolf-junior-open", label: "Greatgolf Junior Open" };
  // QDL
  if (/Quinta do Lago Junior Open/i.test(n)) return { id: "fpg-qdl-junior-open", label: "Quinta do Lago Junior Open" };
  // PJA
  if (/Portuguese Junior Amateur|PJA/i.test(n)) return { id: "fpg-pja", label: "Portuguese Junior Amateur" };
  // Default: slug por nome (sem ano)
  const noYear = n.replace(/\b20\d{2}\b/g, "").replace(/\s+/g, " ").trim();
  return { id: `fpg-${seriesId(noYear)}`, label: noYear };
}

async function load(opts) {
  const players = readJsonSafe(DATA.fpgPlayers, {});
  const pullFiles = listFiles(DATA_DIR, DATA.fpgPullPattern);
  // NOTA: drive-data-*.json e aquapor-data-*.json são EXCLUÍDOS por design.
  // São tour stops regionais adultos, não juniores internacionais. Mesmo dentro
  // de pull-torneios, filtramos pelo nome para apanhar entradas Drive/Aquapor.

  // 1) Roster — começa por players.json (jogadores tracked)
  // Excluir adultos: KIDSPage só mostra juvenis até Sub-18.
  const ADULT_ESC_PLAYER = /Sub\s*(2[0-9]|3\d|4\d|5\d)|Absoluto|S[eé]nior|Master|Adultos?/i;
  // Critério positivo: tem que ter pelo menos UM marcador juvenil (escalão
  // não-adulto OU dob). Sem nenhum deles, é provavelmente um adulto sem
  // categoria explícita (e.g. pais, treinadores) — skip.
  const playerMap = new Map(); // fedCode → RawPlayer
  for (const [nfed, p] of Object.entries(players)) {
    const esc = String(p.escalao || "");
    if (ADULT_ESC_PLAYER.test(esc)) continue;
    if (!esc && !p.dob) continue; // sem marcador juvenil → skip (likely adulto não-categorizado)
    const iso = countryToIso2(p.country || "PT") || "PT";
    playerMap.set(String(nfed), {
      sourceKey: String(nfed),
      name: displayName(p.name || ""),
      aliases: Array.isArray(p.altNames) ? p.altNames.filter(Boolean) : [],
      dob: dobToIso(p.dob),
      sex: p.sex || null,
      country: iso,
      region: p.region || null,
      club: p.club?.short || p.club?.long || null,
      hcp: typeof p.hcp === "number" ? p.hcp : null,
      hcpDate: p.lastRound ? dobToIso(p.lastRound) : null,
      ageGroupCurrent: p.escalao || null,
      extra: {
        clubCode: p.club?.code || null,
        clubLong: p.club?.long || null,
        tags: Array.isArray(p.tags) ? p.tags : [],
        frozen: !!p.frozen,
        primary: true, // veio do players.json
      },
    });
  }

  // 2) Torneios — whitelist juvenis relevantes para a análise internacional
  // Inclui: Campeonatos Nacionais de Jovens, PJA, Greatgolf Junior Open,
  // Quinta do Lago Junior Open, Final Drive Tour (Nacional de facto sub-12+).
  // Exclui: Drive Tour/Challenge regionais, Aquapor, torneios de clube.
  const RELEVANT = /Campeonato Nacional|Portuguese Junior Amateur|\bPJA\b|Greatgolf Junior Open|Quinta do Lago Junior Open|Grande Final Drive Tour|Final Drive Tour/i;
  const EXCLUDE = /Drive\s+(Tour|Challenge)|Aquapor|Cidade de|Clube de Golfe|\bClube\b|Torneio do |Open do |Open Clube/i;
  // Escalões adultos a excluir — só queremos juvenis até Sub-18.
  const ADULT_ESCALAO = /Sub\s*(2[0-9]|3\d|4\d|5\d)|Absoluto|S[eé]nior|Master|Adultos?/i;

  const tournaments = [];
  for (const file of pullFiles) {
    const data = readJsonSafe(file, { tournaments: [] });
    const arr = Array.isArray(data?.tournaments) ? data.tournaments : [];
    for (const t of arr) {
      const name = String(t?.name || "");
      const escalao = String(t?.escalao || "");
      // Excluir torneios que NÃO matchem padrão relevante, exceto se forem Final Drive Tour
      const isFinalDrive = /Grande Final Drive Tour|Final Drive Tour/i.test(name);
      if (!isFinalDrive && EXCLUDE.test(name)) continue;
      if (!RELEVANT.test(name)) continue;
      // Excluir escalões adultos (Sub-20+, Absoluto, Sénior)
      if (ADULT_ESCALAO.test(escalao)) continue;
      if (ADULT_ESCALAO.test(name)) continue;
      const tourn = normalizeTournament(t, "pull", playerMap);
      if (tourn) tournaments.push(tourn);
    }
  }

  // 3) Devolver array de jogadores
  const playersArr = Array.from(playerMap.values());

  return {
    sourceId: SOURCE_ID,
    sourceLabel: SOURCE_LABEL,
    players: playersArr,
    tournaments,
  };
}

function normalizeTournament(t, kind, playerMap) {
  if (!t || !t.tcode) return null;
  // sourceKey inclui data para evitar colisão (tcodes são reutilizados entre anos)
  // Adicionalmente inclui escalão slug para distinguir flights do mesmo torneio.
  const ccode = t.ccode || "000";
  const dateSlug = t.date ? String(t.date).replace(/-/g, "") : "noDate";
  const escSlug = String(t.escalao || "all").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20);
  const sourceKey = `${ccode}-${t.tcode}-${dateSlug}-${escSlug}`;
  const series = seriesFromTournName(t.name);
  const escAges = escalaoToAges(t.escalao);
  const escSex = sexFromEscalao(t.escalao);

  // Um torneio FPG tipicamente tem 1 escalão por entrada (pode haver várias entradas com mesmo tcode mas escalões diferentes).
  // Vamos tratar cada t como UM torneio com UM flight.
  const fpgPlayers = Array.isArray(t.players) ? t.players : [];
  const results = [];
  for (const pl of fpgPlayers) {
    if (!pl) continue;
    let fedCode = pl.fedCode ? String(pl.fedCode) : null;
    // Sem fedCode: criar entrada anónima keyed por nome+país
    // (estrangeiros em torneios FPG — e.g. Dmitrii no QDL 2025)
    if (!fedCode) {
      const cleanName = displayName(pl.name || "");
      if (cleanName) {
        const anonCountry = (pl.club && /\b(RUS|FRA|ESP|GER|ITA|GBR|USA|IRL|UK)\b/i.test(pl.club))
          ? pl.club.match(/\b(RUS|FRA|ESP|GER|ITA|GBR|USA|IRL|UK)\b/i)[1].toUpperCase()
          : null;
        const isoFromAnon = anonCountry ? (countryToIso2(anonCountry) || null) : null;
        const anonKey = `anon|${cleanName.toLowerCase()}|${isoFromAnon || ""}`;
        fedCode = anonKey;
        if (!playerMap.has(anonKey)) {
          playerMap.set(anonKey, {
            sourceKey: anonKey,
            name: cleanName,
            country: isoFromAnon,
            club: pl.club || null,
            extra: { primary: false, anonymous: true },
          });
        }
      }
    } else if (!playerMap.has(fedCode)) {
      // Adiciona ao roster como entrada "minor" (não-tracked)
      playerMap.set(fedCode, {
        sourceKey: fedCode,
        name: displayName(pl.name || ""),
        country: "PT",
        club: pl.club || null,
        hcp: typeof pl.hcpExact === "number" ? pl.hcpExact : null,
        extra: { primary: false },
      });
    }
    // Status
    let status = "OK";
    let totalGross = typeof pl.grossTotal === "number" ? pl.grossTotal : null;
    if (typeof pl.grossTotal === "string") {
      const sg = pl.grossTotal.toUpperCase();
      if (sg.includes("WD")) status = "WD";
      else if (sg.includes("DNS")) status = "DNS";
      else if (sg.includes("DQ")) status = "DQ";
      totalGross = null;
    }
    const rounds = [];
    const rs = Array.isArray(pl.roundScores) ? pl.roundScores : [];
    for (const r of rs) {
      rounds.push({
        round: r.round || rounds.length + 1,
        gross: typeof r.gross === "number" ? r.gross : null,
        strokes: Array.isArray(r.scores) ? r.scores : undefined,
      });
    }
    // Compatibilidade com formato antigo "flat" (scores no top-level do player)
    if (!rounds.length && Array.isArray(pl.scores)) {
      rounds.push({
        round: 1,
        gross: typeof pl.grossTotal === "number" ? pl.grossTotal : null,
        strokes: pl.scores,
      });
    }
    results.push({
      playerSourceKey: fedCode,
      playerName: displayName(pl.name || ""),
      pos: typeof pl.pos === "number" ? pl.pos : null,
      status,
      totalGross,
      toPar: typeof pl.toPar === "number" ? pl.toPar : null,
      rounds,
    });
  }

  // Par/yards do flight: tentar pegar do primeiro player com scorecards
  let par = null, meters = null;
  for (const pl of fpgPlayers) {
    if (pl?.roundScores?.[0]?.pars) { par = pl.roundScores[0].pars; meters = pl.roundScores[0].meters || null; break; }
  }

  const parTotal = par ? par.reduce((a, b) => a + (b || 0), 0) : (typeof t.par === "number" ? t.par : null);
  const flight = {
    flightKey: `esc_${t.escalao || "all"}`.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    label: t.escalao || "Geral",
    ageMin: escAges.ageMin,
    ageMax: escAges.ageMax,
    sex: escSex,
    par: par || undefined,
    yards: meters || undefined, // metros, não jardas
    fieldSize: typeof t.playerCount === "number" ? t.playerCount : fpgPlayers.length,
    results,
  };

  return {
    sourceKey,
    name: t.name || `t=${t.tcode}`,
    date: t.date || null,
    startDate: t.date || null,
    seriesId: series.id,
    seriesLabel: series.label,
    course: t.campo || null,
    parTotal,
    holesPerRound: 18,
    rounds: typeof t.rounds === "number" ? t.rounds : undefined,
    flights: [flight],
    links: [{
      label: "FPG",
      url: `https://scoring.fpg.pt/lists/linkpage.aspx?page=classif&club=${t.ccode || "000"}&tourn=${t.tcode}&ack=8428ACK987`,
    }],
    extra: { kind, ccode: t.ccode, tcode: t.tcode, circuit: t.circuit || null, region: t.region || null },
  };
}

module.exports = { load, SOURCE_ID, SOURCE_LABEL };
