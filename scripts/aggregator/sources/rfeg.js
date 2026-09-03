/**
 * scripts/aggregator/sources/rfeg.js
 *
 * Adapter RFEG (Real Federación Española de Golf).
 *
 * Lê:
 *   - spain-players.json (roster por byName, ~13771 jogadores)
 *   - rfegolf-rivals.json (resultados de torneios RFEG, se existir)
 *
 * Particularidade: jogadores podem ter MÚLTIPLAS licenças ao longo do tempo
 * (mudança de clube/categoria). Detectamos isto por (nome+dob+sex) e juntamos
 * licenças num só RawPlayer com .extra.historicalLicenses.
 *
 * Caso conhecido: Dmitrii Elchaninov tem licenças AM11955303 (La Cañada, Benjamín)
 * e AM84955303 (La Hacienda, Alevín) — mesma DOB 2014-05-13.
 */

const { DATA, readJsonSafe } = require("../util/io");
const { displayName, splitName, dobToIso, countryToIso2, normName } = require("../util/names");
const { warn, sub } = require("../util/log");

const SOURCE_ID = "rfeg";
const SOURCE_LABEL = "Real Federación Española de Golf";

function load(opts) {
  const spain = readJsonSafe(DATA.rfegSpainPlayers, { byName: {} });
  const rivals = readJsonSafe(DATA.rfegolfRivals, null);

  // 1) Roster a partir de spain-players.json
  // O ficheiro tem várias entradas por jogador (different name variants e.g. "first last" vs "last, first").
  // Agrupar por licença e construir UM RawPlayer por licença, mas guardamos a melhor variante de nome.
  const byLic = new Map();
  for (const [key, p] of Object.entries(spain.byName || {})) {
    if (!p?.licencia) continue;
    const lic = String(p.licencia);
    // Preferir entradas com "first last" (a key não tem vírgula) — nome mais natural
    const isFirstLast = !key.includes(",");
    const existing = byLic.get(lic);
    if (!existing || (isFirstLast && existing._keyHasComma)) {
      byLic.set(lic, { ...p, _keyHasComma: !isFirstLast });
    }
  }

  // 2) Agrupar licenças do mesmo jogador (mesma DOB+nome normalizado+sexo)
  // → MÚLTIPLAS licenças = um RawPlayer com historicalLicenses
  const dedupKey = (p) => {
    const dob = p.dobIso || dobToIso(p.dob) || "";
    const sex = p.sex || "";
    const name = normName(splitName(p.name || ""));
    return `${name}|${dob}|${sex}`;
  };
  const byDedup = new Map();
  for (const [lic, p] of byLic) {
    const k = dedupKey(p);
    let arr = byDedup.get(k);
    if (!arr) { arr = []; byDedup.set(k, arr); }
    arr.push({ ...p, licencia: lic });
  }

  // 3) Construir RawPlayer[]
  const players = [];
  for (const [k, group] of byDedup) {
    // Ordenar licenças: a "mais recente" é a que tem catEdad alfabéticamente "maior" (Alevín > Benjamín ; Cadete > Alevín ; etc.) — heurística simples
    // Melhor: usar ordem alfabética inversa do catEdad ou tomar a primeira como activa e o resto como historical
    const sorted = group.slice().sort((a, b) => {
      const oa = catEdadOrder(a.catEdad);
      const ob = catEdadOrder(b.catEdad);
      if (oa !== ob) return ob - oa; // descendente: mais velho primeiro
      return String(b.licencia).localeCompare(String(a.licencia));
    });
    const active = sorted[0];
    const historical = sorted.slice(1).map((p) => p.licencia);
    const dob = dobToIso(active.dobIso || active.dob);
    const country = countryToIso2(active.nat) || "ES";
    const cleanName = displayName(splitName(active.name || ""));
    if (!cleanName) continue;
    // HCP actual: prefere a licença activa; se ausente, cai para qualquer
    // licença histórica do mesmo jogador que tenha hcp (todas vêm do mesmo
    // licencia-hcp-lookup, já agregado para o mais recente por data).
    let hcp = typeof active.hcp === "number" ? active.hcp : null;
    let hcpDate = active.hcpDate || null;
    if (hcp == null) {
      for (const p of sorted) {
        if (typeof p.hcp === "number") { hcp = p.hcp; hcpDate = p.hcpDate || null; break; }
      }
    }
    players.push({
      sourceKey: active.licencia,
      name: cleanName,
      dob,
      sex: active.sex || null,
      country,
      club: active.club || null,
      ageGroupCurrent: active.catEdad || null,
      hcp,
      hcpDate,
      extra: {
        historicalLicenses: historical,
        nat: active.nat,
      },
    });
  }

  // 4) Lookup nome→licença (para resultados sem lic — LGS e blocos nativos do
  // microsite). As chaves de byName já vêm normalizadas ("first last" e
  // "last, first"); normalizamos outra vez para garantir. Nomes ambíguos
  // (2+ licenças distintas com o mesmo nome) ficam fora do lookup.
  const licByNorm = new Map();
  for (const [key, p] of Object.entries(spain.byName || {})) {
    if (!p?.licencia) continue;
    const nk = normName(splitName(key));
    if (!nk) continue;
    const existing = licByNorm.get(nk);
    if (existing === undefined) licByNorm.set(nk, String(p.licencia));
    else if (existing !== String(p.licencia)) licByNorm.set(nk, "__AMBIG__");
  }
  for (const [k, v] of licByNorm) if (v === "__AMBIG__") licByNorm.delete(k);

  /** Resolve a sourceKey de um resultado: lic explícita → lookup por nome →
   *  chave anónima (o identity-matcher trata `anon|` como fonte fraca). */
  function resolvePlayerKey(pl) {
    if (pl.lic) return String(pl.lic);
    const nk = normName(splitName(pl.n || pl.name || ""));
    if (!nk) return null;
    return licByNorm.get(nk) || `anon|${nk}`;
  }

  // 5) Torneios — rfegolf-rivals.json
  // Formato: { generatedAt, source, torneios: { [tid]: { name, year, ageGroup, dateIso, par, parTotal, nholes, nRounds, source, players[] } }, total, dedupedPlayers }
  // Players: { n, p, t, tp, hcp, lic, rd, sc } (+ dob/club/sex/catEdad/region nos rfeg/mitarjeta)
  // Excluir adultos: só interessa juvenis (Sub-18 ou abaixo).
  const ADULT_ESCALAO = /Sub\s*(2[0-9]|3\d|4\d|5\d)|Absoluto|S[eé]nior|Master|Adultos?/i;
  const tournaments = [];
  // Jogadores vistos em resultados mas ausentes do roster (lic mitarjeta nova
  // ou anon sem correspondência) — ganham RawPlayer próprio para o matcher
  // não descartar os resultados deles.
  const extraPlayers = new Map(); // sourceKey → RawPlayer draft
  const rosterLics = new Set(players.map((p) => p.sourceKey));
  for (const p of players) for (const h of p.extra?.historicalLicenses || []) rosterLics.add(h);
  function collectExtraPlayer(key, pl) {
    if (!key || rosterLics.has(key)) return;
    const prev = extraPlayers.get(key);
    const dob = dobToIso(pl.dob) || prev?.dob || null;
    if (prev && prev.dob && !dob) return; // manter a variante com dob
    extraPlayers.set(key, {
      sourceKey: key,
      name: displayName(splitName(pl.n || pl.name || "")) || prev?.name || null,
      dob,
      sex: pl.sex || prev?.sex || null,
      // País da bandeira do leaderboard oficial (`co`, posto pelo
      // build-rfegolf-rivals). "ES" só como default: nos torneios internacionais
      // — onde estão os nossos — assumi-lo fazia dos 7 portugueses do Spanish
      // International U-18 outros tantos espanhóis.
      country: pl.co || prev?.country || "ES",
      club: pl.club || prev?.club || null,
      ageGroupCurrent: pl.catEdad || prev?.ageGroupCurrent || null,
      region: pl.region || prev?.region || null,
      hcp: typeof pl.hcp === "number" ? pl.hcp : (prev?.hcp ?? null),
      extra: { fromResults: true },
    });
  }
  const rivalsTorneios = rivals?.torneios;
  if (rivalsTorneios && typeof rivalsTorneios === "object") {
    for (const [tid, t] of Object.entries(rivalsTorneios)) {
      if (!t) continue;
      const ageGroup = String(t.ageGroup || "");
      if (ADULT_ESCALAO.test(ageGroup)) continue;
      const tt = normalizeRfegTournament(tid, t, resolvePlayerKey, collectExtraPlayer);
      if (tt) tournaments.push(tt);
    }
  }
  for (const p of extraPlayers.values()) {
    if (p.name) players.push(p);
  }

  return {
    sourceId: SOURCE_ID,
    sourceLabel: SOURCE_LABEL,
    players,
    tournaments,
  };
}

function catEdadOrder(cat) {
  if (!cat) return 0;
  const s = String(cat).toLowerCase();
  const order = { benjamín: 1, benjamin: 1, alevín: 2, alevin: 2, infantil: 3, cadete: 4, juvenil: 5, junior: 6, sub25: 7, mid: 6, s: 8, j: 6, b: 1 };
  return order[s] || 0;
}

function normalizeRfegTournament(tid, t, resolvePlayerKey, collectExtraPlayer) {
  if (!t) return null;
  const flightLabel = t.ageGroup || "Geral";
  const players = Array.isArray(t.players) ? t.players : [];
  const results = players.map((pl) => {
    const rd = Array.isArray(pl.rd) ? pl.rd : [];
    const sc = Array.isArray(pl.sc) ? pl.sc : [];
    const rounds = [];
    const nRds = Math.max(rd.length, sc.length);
    for (let i = 0; i < nRds; i++) {
      rounds.push({
        round: i + 1,
        gross: typeof rd[i] === "number" ? rd[i] : null,
        strokes: Array.isArray(sc[i]) ? sc[i] : undefined,
      });
    }
    const key = resolvePlayerKey ? resolvePlayerKey(pl) : (pl.lic || null);
    if (collectExtraPlayer) collectExtraPlayer(key, pl);
    return {
      playerSourceKey: key,
      playerName: displayName(splitName(pl.n || pl.name || "")),
      pos: typeof pl.p === "number" ? pl.p : (typeof pl.pos === "number" ? pl.pos : null),
      status: "OK",
      totalGross: typeof pl.t === "number" ? pl.t : null,
      toPar: typeof pl.tp === "number" ? pl.tp : null,
      rounds,
    };
  });
  // ageMin/ageMax aproximados a partir de catEdad
  const cat = String(t.ageGroup || "").toLowerCase();
  let ageMin = null, ageMax = null;
  if (cat.includes("benjamín") || cat.includes("benjamin")) { ageMin = 9; ageMax = 10; }
  else if (cat.includes("alevín") || cat.includes("alevin")) { ageMin = 11; ageMax = 12; }
  else if (cat.includes("infantil")) { ageMin = 13; ageMax = 14; }
  else if (cat.includes("cadete")) { ageMin = 15; ageMax = 16; }
  else if (cat.includes("juvenil")) { ageMin = 17; ageMax = 18; }
  // Série: agrupar por padrão de nome (Campeonato España, Circuito Juvenil, GP, etc.)
  const tname = String(t.name || "");
  let seriesId = "rfeg-circuit", seriesLabel = "RFEG";
  if (/Campeonato de España|Campeonato España|Campeonato Espana/i.test(tname)) {
    seriesId = "rfeg-campeonato-espana"; seriesLabel = "Campeonato de España";
  } else if (/Campeonato de Canarias|Canarias Juvenil/i.test(tname)) {
    seriesId = "rfeg-campeonato-canarias"; seriesLabel = "Campeonato de Canarias";
  } else if (/Circuito Juvenil/i.test(tname)) {
    seriesId = "rfeg-circuito-juvenil"; seriesLabel = "Circuito Juvenil";
  } else if (/Gran Premio|GP\s/i.test(tname)) {
    seriesId = "rfeg-gran-premio"; seriesLabel = "Gran Premio";
  }
  // Links: derivar do prefix do tid (lgs = LiveGolfScoring, nc = NextCaddy)
  const links = buildRfegLinks(String(tid));

  return {
    sourceKey: String(tid),
    name: tname || `RFEG ${tid}`,
    date: t.dateIso || null,
    startDate: t.dateIso || null,
    seriesId,
    seriesLabel,
    course: t.terrain || t.campo || null,
    parTotal: typeof t.parTotal === "number" ? t.parTotal : null,
    holesPerRound: typeof t.nholes === "number" ? t.nholes : 18,
    rounds: typeof t.nRounds === "number" ? t.nRounds : undefined,
    flights: [{
      flightKey: flightLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label: flightLabel,
      ageMin,
      ageMax,
      sex: (t.sex === "F" || t.sex === "M") ? t.sex
        : /femenino|female|girls/i.test(tname) ? "F" : (/masculino|male|boys/i.test(tname) ? "M" : null),
      par: Array.isArray(t.par) ? t.par : undefined,
      fieldSize: players.length,
      results,
    }],
    links,
  };
}

/** Constrói o array `links` para um torneio RFEG.
 *  - tid "lgs105" ou "lgs105_alevin" → LiveGolfScoring .../hoyoahoyo/105
 *  - tid "nc48139" ou "nc61067_alevín" → NextCaddy .../tour/48139
 *  - outros → vazio
 *
 *  Os sufixos (_alevín, _infantil, _juvenil) aparecem em alguns torneios
 *  multi-escalão onde o mesmo tour ID expõe vários flights — o número é o
 *  identificador real do torneio. */
function buildRfegLinks(tid) {
  const lgsMatch = /^lgs(\d+)(?:_|$)/i.exec(tid);
  if (lgsMatch) {
    return [{
      label: "LiveGolfScoring",
      url: `https://rfegolf.livegolfscoring.es/torneos/hoyoahoyo/${lgsMatch[1]}`,
    }];
  }
  const ncMatch = /^nc(\d+)(?:_|$)/i.exec(tid);
  if (ncMatch) {
    return [{
      label: "NextCaddy",
      url: `https://www.nextcaddy.com/tour/${ncMatch[1]}`,
    }];
  }
  const rfegMatch = /^rfeg(\d+)(?:_|$)/i.exec(tid);
  if (rfegMatch) {
    return [{
      label: "RFEG",
      url: `https://www.rfegolf.es/CompetenciaPaginas/ListaResultados.aspx?CompId=${rfegMatch[1]}`,
    }];
  }
  return [];
}

module.exports = { load, SOURCE_ID, SOURCE_LABEL };
