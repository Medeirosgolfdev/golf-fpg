/**
 * adapters.ts — Ficheiros livegolfscoring e NextCaddy → RFEGDetail (o formato
 * comum das inscrições/resultados de Espanha), enriquecidos com os lookups de
 * licença (data de nascimento, HCP) e as fichas FPG/GolfBox por nome.
 *
 * Tirado da RFEGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import { fedByNameKeys, golfboxLookup, type FedByNameEntry, type GolfboxEntry } from "../playerLookups";
import { isPtCountry } from "../../utils/flagUtils";
import { normEs } from "./text";
import type { RFEGPlayer, RFEGDetail, NCRoundScore, NCDetail, DobLookup, HcpLookup, LgsRound, LgsDetail, LgsHorarioRound } from "./types";
import { dobLookupByName, isNoCardGross } from "../intlCommon";

/** Voltas LGS sem total (cartão por publicar) recebem o resultado da volta que
 *  a classificação final traz (`roundTotals`). Caso real: Campeonato de España
 *  Benjamín 2023 (LGS 216/217) — 71 jogadores com `total: null` em todas as
 *  voltas, o que deixava o torneio «a decorrer» com «Média 999.0». Jogadores a
 *  meio de uma volta (`partialGross`) e totais «sem cartão» ficam como estão. */
export function lgsFillFromClassification(lgs: LgsDetail): LgsDetail {
  const cls = lgs.classification;
  if (!cls?.length) return lgs;
  const byKey = new Map<string, (number | null)[]>();
  for (const c of cls) {
    if (!c.roundTotals?.length) continue;
    if (c.memberId) byKey.set(`id:${c.memberId}`, c.roundTotals);
    byKey.set(`nm:${normEs(c.name)}`, c.roundTotals);
  }
  if (!byKey.size) return lgs;
  let changed = false;
  const rounds = lgs.rounds.map((r, i) => ({
    ...r,
    players: r.players.map((p) => {
      if (p.total != null || (p as { partialGross?: number | null }).partialGross) return p;
      const rt = (p.memberId && byKey.get(`id:${p.memberId}`)) || byKey.get(`nm:${normEs(p.name)}`);
      const t = rt?.[i];
      if (typeof t !== "number" || t <= 0 || isNoCardGross(t)) return p;
      changed = true;
      return { ...p, total: t };
    }),
  }));
  return changed ? { ...lgs, rounds } : lgs;
}

export function adaptLgs(lgsIn: LgsDetail, dobLookup?: DobLookup, hcpLookup?: HcpLookup, fedByName?: Map<string, FedByNameEntry>, golfbox?: Map<string, GolfboxEntry[]>): RFEGDetail {
  const lgs = lgsFillFromClassification(lgsIn);
  const norm = normEs;
  const lookupByName = dobLookupByName(dobLookup, norm);
  // Anexar hcpLookup ao detail para o adapter LGS-FPG poder usar
  void hcpLookup; // injectado depois via adaptLgs e flag detail._hcpLookup

  // Construir leaderboard agregado a partir das rondas — somar totals de cada
  // ronda por player. Cada ronda do PDF/livegolfscoring é gross dessa ronda.
  const playerAgg: Record<string, {
    name: string; pos: number | null;
    rounds: number[]; toPar: number; hoy: number; total: number;
    country: string | null; region: string | null;
  }> = {};
  // Só rondas com SCORES reais (a R3 de um evento em curso pode trazer jogadores
  // placeholder do draw com total=null → não é uma ronda jogada). Sem isto, o
  // leaderboard agregado zerava pos/toPar/total (→ "--") e somava um 0 fantasma.
  const lgsRoundIsPlayed = (r: { players: Array<{ total: number | null }> }) =>
    (r.players ?? []).some((p) => p.total != null && p.total > 0 && !isNoCardGross(p.total));
  const lgsPlayedRounds = lgs.rounds.filter(lgsRoundIsPlayed);
  const lastR = lgsPlayedRounds[lgsPlayedRounds.length - 1];
  for (const r of lgsPlayedRounds) {
    for (const p of r.players) {
      const key = p.memberId || p.name;
      if (!playerAgg[key]) {
        playerAgg[key] = { name: p.name, pos: null, rounds: [], toPar: 0, hoy: 0, total: 0, country: null, region: null };
      }
      playerAgg[key].rounds.push(p.total ?? 0);
      const pc = (p as { country?: string | null; region?: string | null });
      if (pc.country && !playerAgg[key].country) playerAgg[key].country = pc.country;
      if (pc.region && !playerAgg[key].region) playerAgg[key].region = pc.region;
    }
  }
  // Pos/toPar/total da última ronda (acumulado)
  if (lastR) {
    for (const p of lastR.players) {
      const key = p.memberId || p.name;
      if (playerAgg[key]) {
        playerAgg[key].pos = p.pos;
        playerAgg[key].toPar = p.toPar;
        playerAgg[key].hoy = p.hoy;
        // Total acumulado = sum das rondas
        playerAgg[key].total = playerAgg[key].rounds.reduce((a, b) => a + b, 0);
      }
    }
  }

  const aggregated = Object.values(playerAgg).sort((a, b) => {
    if (a.pos == null && b.pos == null) return a.toPar - b.toPar;
    if (a.pos == null) return 1;
    if (b.pos == null) return -1;
    return a.pos - b.pos;
  });

  const par = lgs.rounds[0]?.par || null;
  const nRounds = lgs.rounds.length;

  // Construir results group único agregado (R1..Rn) para mostrar no leaderboard
  const resultsGroup = {
    label: "Clasificación Final",
    sexo: "" as string,
    categoria: "" as string,
    pdfUrl: `https://rfegolf.livegolfscoring.es/torneos/clasificacion/${lgs.id}`,
    nRounds,
    courseRating: ((lgs.course as { courseRating?: number | null } | null)?.courseRating ?? null) as number | null,
    slope: ((lgs.course as { slope?: number | null } | null)?.slope ?? null) as number | null,
    players: aggregated.map(a => {
      // Cruzar nome → licencia/dob/club/hcp (dob+hcp lookups) para o Draw partilhado
      // mostrar ESC/Nasc./FED/Clube/HCP como na FPG (o draw LGS só traz nomes).
      const e = lookupByName[norm(a.name)];
      const lic = (e?.licencia || "").toUpperCase();
      const hcpEs = lic && hcpLookup ? (hcpLookup[lic]?.hcp ?? null) : null;
      // Português: a ficha vem da FPG (ver o gémeo em lgsToFPGTournament). É o
      // que dá ESC/Nasc./FED/Clube/HCP aos nossos nas tabs de Draw e Inscrições.
      const ptFed = isPtCountry(a.country) && fedByName
        ? fedByNameKeys(a.name).map((k) => fedByName.get(k)).find(Boolean)
        : undefined;
      const gb = !e && !ptFed ? golfboxLookup(golfbox, a.name, a.country) : undefined;
      const hcp = typeof hcpEs === "number" ? hcpEs : (ptFed?.hcp ?? null);
      return {
        pos: a.pos,
        name: a.name,
        toPar: a.toPar,
        hoy: a.hoy,
        rounds: a.rounds,
        total: a.total,
        licencia: e?.licencia ?? ptFed?.fed ?? gb?.memberId ?? null,
        dob: e?.dob ?? ptFed?.dob ?? gb?.dob ?? null,
        club: e?.club ?? ptFed?.club ?? gb?.club ?? a.region ?? null,
        hcp,
        country: a.country,
      };
    }),
  };

  return {
    compId: lgs.id,
    ok: true,
    scrapedAt: lgs.scrapedAt,
    meta: {
      name: lgs.meta.name,
      // Usar a data ISO real (com ano) para o cálculo de idade ser à DATA DO
      // TORNEIO (histórica). O dateRange ("25 junio - 27 junio") não tem ano e
      // é impossível de parsear → caía na data de hoje. Ver bug idade ES.
      dateStart: lgs.meta.dateIso || lgs.meta.dateRange,
      dateEnd: lgs.meta.dateIso || lgs.meta.dateRange,
      course: lgs.meta.course,
      courseClubId: null,
      players: aggregated.length,
      hcpLimitMen: null, hcpLimitWomen: null,
      mode: "Individual", style: "Stroke Play",
      category: null, sex: null,
      federation: "RFEGolf",
      federationCatId: null,
    },
    coursePar: par,
    parConfidence: par ? "high" : undefined,
    inscritos: {
      admitidos: aggregated.map(a => {
        const e = lookupByName[norm(a.name)];
        // Mesmo enriquecimento do leaderboard: sem ele os nossos apareciam na
        // lista de inscritos sem federado, clube, HCP nem data de nascimento.
        const ptFed = isPtCountry(a.country) && fedByName
          ? fedByNameKeys(a.name).map((k) => fedByName.get(k)).find(Boolean)
          : undefined;
        const gb = !e && !ptFed ? golfboxLookup(golfbox, a.name, a.country) : undefined;
        return {
          pos: a.pos, name: a.name,
          licencia: e?.licencia || ptFed?.fed || gb?.memberId || null,
          // País real da bandeira do leaderboard (o default "ESPAÑA" fazia da
          // lista inteira espanhóis, num torneio com 19 nacionalidades).
          pais: a.country || "ESPAÑA",
          hcp: ptFed?.hcp ?? null,
          catEdad: e?.catEdad || null,
          sexo: e?.sex || ptFed?.sex || null,
          club: e?.club || ptFed?.club || gb?.club || a.region || null,
          dob: e?.dob || ptFed?.dob || gb?.dob || null,
          estado: null,
        };
      }),
      reservas: [], bajas: [], invitados: [], noAdmitidos: [], provisional: [],
      counts: {
        admitidos: aggregated.length,
        reservas: 0, bajas: 0, invitados: 0, noAdmitidos: 0, provisional: 0,
      },
    },
    results: [resultsGroup],
    /** Rondas hbh com par real — usado pela vista hbh quando expandida */
    _lgsRounds: lgs.rounds,
    _lgsCourse: lgs.course || null,
    _lgsHorarios: lgs.horarios || null,
  } as RFEGDetail & { _lgsRounds: LgsRound[]; _lgsCourse: LgsDetail["course"]; _lgsHorarios: LgsHorarioRound[] | null };
}

/** Sexo a partir do nome da categoria NextCaddy ("Alevín Masculino Scratch",
 *  "Scratch Señoras", "Caballeros"…). Devolve null quando não é identificável. */
export function ncCatSex(name?: string | null): "M" | "F" | null {
  const s = (name || "").toLowerCase();
  if (/femenin|femenal|se[ñn]oras?|damas|girls|chicas|femenina/.test(s)) return "F";
  if (/masculin|masculina|caballeros?|varonil|boys|chicos/.test(s)) return "M";
  return null;
}

export function adaptNextCaddy(nc: NCDetail, dobLookup?: DobLookup, hcpLookup?: HcpLookup): RFEGDetail {
  // Data: o NextCaddy não a expõe nos endpoints, mas muitos nomes trazem-na no fim
  // (ex.: "...9P3 HOYOS 13-06-26"). Extrai DD-MM-YY[YY] / DD/MM/YYYY do nome.
  const ncDate: string | null = (() => {
    const m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?!\d)/.exec(nc.meta?.name || "");
    if (!m) return null;
    const day = parseInt(m[1], 10), month = parseInt(m[2], 10);
    let y = m[3]; if (y.length === 2) y = (parseInt(y, 10) >= 70 ? "19" : "20") + y;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  })();
  const enrich = (licencia: string | null) => {
    if (!licencia || !dobLookup) return null;
    return dobLookup[licencia.trim()] || null;
  };
  // Helper: HCP via lookup global se o player não tem (cross-reference torneios)
  const hcpFromLookup = (licencia: string | null): number | null => {
    if (!licencia || !hcpLookup) return null;
    const key = licencia.trim().toUpperCase();
    return hcpLookup[key]?.hcp ?? null;
  };

  // Distância do tee de cada jogador (do cartão dele). Mapas p/ cruzar com
  // inscritos (por licencia) e draw (por inscribedId), já que esses não trazem cartão.
  const teeMetersByLic: Record<string, number> = {};
  const teeMetersByIns: Record<string, number> = {};
  // Info por inscribedId para enriquecer o Draw como na FPG (escalão + ±/Tot por ronda).
  const drawInfoByIns: Record<string, { dob: string | null; name: string | null; rounds: { round: number; gross: number | null; toPar: number | null }[] }> = {};
  const ncParTotal = Array.isArray(nc.course?.par) ? nc.course!.par!.reduce((a, b) => a + (b || 0), 0) : 0;
  const lbPlayers: RFEGPlayer[] = [];
  // O NextCaddy publica o MESMO torneio em classificações Scratch E Handicap
  // (ex: "Alevín Masculino Scratch" + "Alevín Masculino Handicap"). Nas Handicap,
  // pos/total/toPar são LÍQUIDOS (gross − hcp de jogo). O dedup abaixo mantém a
  // primeira ocorrência por licença — ordenar as Scratch primeiro garante que a
  // linha que sobrevive traz as pancadas reais, nunca o resultado líquido.
  const ncCatClass = (name?: string | null): number => {
    const s = (name || "").toLowerCase();
    if (/scratch/.test(s)) return 0;
    if (/h[aá]ndicap|\bhcp\b|\bneto\b/.test(s)) return 2;
    return 1;
  };
  const ncCats = [...(nc.leaderboard || [])].sort(
    (a, b) => ncCatClass(a.categoryName) - ncCatClass(b.categoryName),
  );
  for (const cat of ncCats) {
    // Sexo derivado do NOME da categoria scrapada ("Alevín Masculino", "Scratch
    // Señoras", "Caballeros"…). É a fonte fiável — o lookup por licença (e.sex) só
    // resolve os jogadores no roster e deixava a maioria com sexo null, impedindo
    // a separação M/F. A categoria manda; o lookup é fallback.
    const catSex = ncCatSex(cat.categoryName);
    for (const p of (cat.players || [])) {
      const e = enrich(p.licencia ?? null);
      // NextCaddy expõe scores hole-by-hole em p.roundScores[]; o campo p.rounds[] vem sempre vazio.
      const rs = (p.roundScores || []) as NCRoundScore[];
      const rounds = rs.length > 0
        ? rs.map((r) => ({
            round: r.round,
            gross: typeof r.total === "number"
              ? r.total
              : (Array.isArray(r.scores) ? (r.scores.filter((x) => x > 0).reduce((a, b) => a + b, 0) || null) : null),
            scores: Array.isArray(r.scores) ? r.scores : undefined,
            meters: Array.isArray(r.meters) ? r.meters : null,   // metros do tee deste jogador
          }))
        : (p.rounds || []);
      const teeM = rs.find((r) => Array.isArray(r.meters) && r.meters.length)?.meters || null;
      const teeMetersTotal = teeM ? teeM.reduce((a, b) => a + (b || 0), 0) : null;
      if (teeMetersTotal) {
        if (p.licencia) teeMetersByLic[p.licencia.trim().toUpperCase()] = teeMetersTotal;
        if (p.inscribedId) teeMetersByIns[String(p.inscribedId)] = teeMetersTotal;
      }
      if (p.inscribedId) {
        drawInfoByIns[String(p.inscribedId)] = {
          dob: e ? e.dob : null,
          name: p.name ?? null,
          rounds: rs.map((r) => {
            const g = typeof r.total === "number" ? r.total
              : (Array.isArray(r.scores) ? (r.scores.filter((x) => x > 0).reduce((a, b) => a + b, 0) || null) : null);
            return { round: r.round, gross: g, toPar: (g != null && ncParTotal) ? g - ncParTotal : null };
          }),
        };
      }
      // Hándicap de campo (do "HcpJuego"): 1º valor não-nulo (é constante entre
      // rondas). Serve para derivar CR/Slope por regressão contra o HI.
      const courseHcp = (p.hcpJuego || []).map((h) => h.ch).find((c) => c != null) ?? null;
      lbPlayers.push({
        pos: p.pos ?? null,
        name: p.name,
        licencia: p.licencia ?? null,
        pais: "ESPAÑA",
        // Fallback ao lookup global se o player não tem HCP no torneio
        hcp: p.hcp ?? hcpFromLookup(p.licencia ?? null),
        catEdad: p.nivel ?? (e ? e.catEdad : null),
        sexo: catSex ?? (e ? e.sex : null),
        courseHcp,
        club: e ? e.club : null,
        dob: e ? e.dob : null,
        estado: null,
        rounds,
        total: p.total ?? null,
        toPar: p.toPar ?? null,
        teeMeters: teeMetersTotal,
      });
    }
  }
  // Limpeza dos inscritos NextCaddy: o getListadoInscritos devolve a lista 2× e a
  // 2ª cópia tem colunas diferentes ("Fecha Inscripción") → a `licencia` vem a ser o
  // timestamp e a licencia real cai no `nivel`. Sem isto, cada jogador aparecia 2×
  // (um com timestamp) e o cabeçalho "Jugador" entrava como jogador. Corrigido no
  // scraper, mas aplicamos aqui também para os dados JÁ scrapados (sem re-scrape).
  const _isTs = (v?: string | null) => /^\d{2}-\d{2}-\d{2}\b/.test(String(v || "").trim());
  const _looksLic = (v?: string | null) => /^[A-Za-z]{1,4}\d{3,}/.test(String(v || "").trim());
  const _ncSeen = new Map<string, number>();
  const cleanedInscritos: NonNullable<typeof nc.inscritos> = [];
  for (const p of (nc.inscritos || [])) {
    if (!p.name || /^(jugador|licencia|nivel|fecha)/i.test(String(p.name).trim())) continue;
    let licencia = p.licencia ?? null;
    let nivel = p.nivel ?? null;
    if (_isTs(licencia)) { if (_looksLic(nivel)) { licencia = nivel; nivel = null; } else licencia = null; }
    if (_isTs(nivel)) nivel = null;
    const cp = { ...p, licencia, nivel };
    const key = p.name.trim().toLowerCase().replace(/\s+/g, " ");
    const idx = _ncSeen.get(key);
    if (idx == null) { _ncSeen.set(key, cleanedInscritos.length); cleanedInscritos.push(cp); }
    else if (!_looksLic(cleanedInscritos[idx].licencia) && _looksLic(licencia)) cleanedInscritos[idx] = cp;
  }
  const inscPlayers: RFEGPlayer[] = cleanedInscritos.map((p) => {
    const e = enrich(p.licencia ?? null);
    const lic = (p.licencia || "").trim().toUpperCase();
    return {
      pos: p.orden ?? null,
      name: p.name,
      licencia: p.licencia ?? null,
      pais: "ESPAÑA",
      hcp: p.hcp ?? hcpFromLookup(p.licencia ?? null),
      catEdad: p.nivel ?? (e ? e.catEdad : null),
      sexo: e ? e.sex : null,
      club: e ? e.club : null,
      dob: e ? e.dob : null,
      estado: null,
      teeMeters: (lic && teeMetersByLic[lic]) || null,   // cruzado com o cartão (torneios já jogados)
    };
  });
  // Deduplicar por licencia: o NextCaddy às vezes lista o mesmo jogador em
  // múltiplas categorias (Scratch + Hcp) ou repete inscritos. Mantém a primeira
  // ocorrência (que tem normalmente os scores reais).
  const dedupBy = (arr: RFEGPlayer[]): RFEGPlayer[] => {
    const seen = new Set<string>();
    const out: RFEGPlayer[] = [];
    for (const p of arr) {
      const key = (p.licencia || "").trim().toLowerCase()
                || ("name:" + (p.name || "").trim().toLowerCase());
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  };
  const admitidos = dedupBy(lbPlayers.length > 0 ? lbPlayers : inscPlayers);
  return {
    compId: nc.tourId,
    ok: true,
    scrapedAt: nc.scrapedAt,
    meta: {
      name: nc.meta?.name ?? null,
      dateStart: ncDate,
      dateEnd: null,
      course: nc.meta?.course ?? null,
      courseClubId: null,
      players: admitidos.length,
      hcpLimitMen: null,
      hcpLimitWomen: null,
      mode: "Individual",
      style: nc.meta?.format ?? null,
      category: null,
      sex: null,
      federation: nc.meta?.organizer ?? null,
      federationCatId: null,
    },
    coursePar: (nc.course?.par && Array.isArray(nc.course.par) && nc.course.par.length > 0) ? nc.course.par : null,
    parConfidence: nc.course?.parConfidence,
    // Horarios (draw / tee times) — passar adiante para a tab Draw saída
    _ncHorarios: Array.isArray(nc.horarios) ? nc.horarios : null,
    // Distância do tee por jogador (cruzada por inscribedId) para a tab Draw
    _teeMetersByIns: teeMetersByIns,
    // Info (dob/escalão + resultado por ronda) por inscribedId para enriquecer o Draw
    _drawInfoByIns: drawInfoByIns,
    // Guardar SI e metros do NextCaddy para o adapter ncToFPGTournament passar
    // adiante. Aceitar 9 OU 18 buracos (pitch&putt/alevíns são de 9) — exigir 18
    // descartava o SI/metros dos torneios de 9.
    _ncCourseSi: (nc.course?.si && Array.isArray(nc.course.si) && (nc.course.si.length === 9 || nc.course.si.length === 18)) ? nc.course.si : null,
    _ncCourseMeters: (nc.course?.meters && Array.isArray(nc.course.meters) && (nc.course.meters.length === 9 || nc.course.meters.length === 18)) ? nc.course.meters : null,
    inscritos: {
      admitidos,
      reservas: [],
      bajas: [],
      invitados: [],
      noAdmitidos: [],
      provisional: [],
      counts: {
        admitidos: admitidos.length,
        reservas: 0,
        bajas: 0,
        invitados: 0,
        noAdmitidos: 0,
        provisional: 0,
      },
    },
  } as RFEGDetail & { _ncCourseSi?: number[] | null; _ncCourseMeters?: number[] | null };
}
