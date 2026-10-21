/**
 * toTournament.ts — Conversores das fontes de Espanha para o Tournament da FPG
 * (o formato que o TournamentDetail desenha): livegolfscoring, NextCaddy,
 * RFEGolf (PDF) e mitarjeta.
 *
 * Tirado da RFEGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import { displayName, ageAtDate, todayIso } from "../../utils/format";
import { flag } from "../../utils/flagUtils";
import { formatPlayerName } from "../../utils/playerUtils";
import type { Tournament as FPGTournament, Player as FPGPlayer, RoundScore as FPGRoundScore, ScorecardOptions } from "../fpgTypes";
import { intlScorecardOptions } from "../intlScorecard";
import { fedByNameKeys, golfboxLookup, type FedByNameEntry, type GolfboxEntry } from "../playerLookups";
import { normEs } from "./text";
import { ageToEscalaoEs, escaloEsForPlayer } from "./escalao";
import type { RFEGPlayer, RFEGDetail, DobLookupEntry, DobLookup } from "./types";

/* ── lgsToFPGTournament ──────────────────────────────────────
 * Converte JSON livegolfscoring para FPGTournament — permite reusar
 * IntlTournView (mesmo componente que FFGPage usa) para aspecto consistente
 * com FPG/FFG: cabeçalho, tabs R1/R2/Resumo, scorecard global com cores. */
export function lgsToFPGTournament(
  lgs: {
    id: number;
    meta: { name: string | null; course: string | null; dateRange: string | null; year?: number | null; dateIso?: string | null };
    rounds: Array<{ round: number; label: string; par: number[] | null; players: Array<{
      memberId?: string | null; pos: number | null; name: string; toPar: number; hoy: number;
      scores: number[] | null; halves: number[] | null; total: number | null;
      country?: string | null; region?: string | null;
      /** Ronda A DECORRER: buracos já jogados ("scores" com nulls nos que
       *  faltam), quantos são, e a soma parcial. O "total" fica null — um
       *  cartão a meio não é uma volta. */
      holesPlayed?: number | null; partialGross?: number | null;
    }> }>;
    course?: { meters?: (number | null)[]; si?: (number | null)[]; par?: (number | null)[]; courseRating?: number | null; slope?: number | null } | null;
  },
  dobLookup?: DobLookup,
  /** Federados FPG por nome — só consultado para quem a bandeira da fonte diz
   *  ser português (ver `ptFed` abaixo). */
  fedByName?: Map<string, FedByNameEntry>,
  /** Fichas GolfBox (EGA + federações nórdicas) por nome — DOB/licença dos
   *  ESTRANGEIROS, que a fonte espanhola não conhece. */
  golfbox?: Map<string, GolfboxEntry[]>,
): FPGTournament {
  const norm = normEs;
  const lookupByName: Record<string, DobLookupEntry> = {};
  if (dobLookup) for (const e of Object.values(dobLookup)) if (e.name) lookupByName[norm(e.name)] = e;

  // Nº de buracos do campo (9 ou 18). Benjamín/Alevín (sub-10/12) jogam 9 buracos;
  // tudo o resto 18. Detecta-se pelo par[] que o scraper produz. 18 buracos = path
  // original intocado.
  const rawPar = lgs.rounds[0]?.par;
  const courseHoles: number = rawPar && rawPar.length === 9 ? 9 : 18;
  const par = rawPar && (rawPar.length === 18 || rawPar.length === 9) ? rawPar : new Array(courseHoles).fill(4);
  const parTotal = par.reduce((a, b) => a + b, 0);
  const numRounds = lgs.rounds.length;
  // Rondas EFECTIVAMENTE jogadas: uma ronda só com SCORES reais conta. Uma ronda
  // agendada mas ainda por jogar pode (a) vir vazia, OU (b) trazer já a lista de
  // jogadores como PLACEHOLDERS do draw (tee times) com `scores/total: null`
  // (`_partial`). Filtrar por `players.length` não chegava — a R3 placeholder do
  // Campeonato de España juvenil 2026 contava como jogada → toda a gente ficava
  // incompleta (→ WD) e pos/toPar/total liam-se da ronda sem scores (→ "--").
  // Uma ronda A DECORRER conta como jogada desde que alguém já tenha buracos
  // entregues ("partialGross") — é o que põe os resultados de hoje na página,
  // em vez de esperar que a volta feche.
  const roundIsPlayed = (r: { players: Array<{ total: number | null; partialGross?: number | null }> }) =>
    (r.players ?? []).some((p) => (p.total != null && p.total > 0 && p.total < 999)
      || (p.partialGross != null && p.partialGross > 0));
  const playedRoundsArr = lgs.rounds.filter(roundIsPlayed);
  const playedRounds = playedRoundsArr.length || numRounds;
  // Voltas FECHADAS. ⚠ NÃO basta "alguém já tem total": a meio do segundo dia
  // os primeiros grupos já entregaram (15 de 120) e isso fazia a ronda contar
  // como fechada — toda a gente que ainda não saiu ficava "incompleta" e a
  // aparecer como **WD**, o líder da véspera incluído. Uma ronda está a decorrer
  // enquanto houver cartões a meio, ou enquanto menos de metade do campo tiver
  // entregue (uma ronda acabada tem quase toda a gente, tirando WD genuínos).
  const roundEmCurso = (r: { players: Array<{ total: number | null; partialGross?: number | null }> }) => {
    const ps = r.players ?? [];
    if (!ps.length) return false;
    const comTotal = ps.filter((p) => p.total != null && p.total > 0 && p.total < 999).length;
    if (!comTotal) return false;
    const parciais = ps.filter((p) => p.partialGross != null && p.partialGross > 0).length;
    // Cartões a meio são o sinal directo. O limiar cobre o intervalo em que
    // ninguém está no campo (uns já entregaram, outros ainda não saíram): numa
    // ronda fechada quase toda a gente tem total, tirando os WD.
    return parciais > 0 || comTotal < ps.length * 0.85;
  };
  const closedRounds = lgs.rounds.filter((r) =>
    (r.players ?? []).some((p) => p.total != null && p.total > 0 && p.total < 999) && !roundEmCurso(r)).length;
  const sliceH = <T,>(a: T[] | undefined | null): T[] => (a || []).slice(0, courseHoles);
  // teeName com a distância total → o scorecard só desenha a linha de METROS quando
  // o jogador tem teeName (ScorecardLB agrupa metros por tee). Sem isto, os torneios
  // livegolfscoring (par/metros reais no `course`) NÃO mostravam a linha de metros.
  const lgsMetersTotal = sliceH(lgs.course?.meters).reduce((a: number, b) => a + (b || 0), 0);
  const lgsTeeLabel: string | undefined = lgsMetersTotal > 0 ? `${lgsMetersTotal} m` : undefined;

  // Agregar por jogador (key = memberId ou nome) com scores hbh por ronda
  type Acc = { name: string; pos: number | null; toPar: number; total: number; rounds: FPGRoundScore[]; country: string | null; region: string | null };
  const agg: Record<string, Acc> = {};
  for (const r of lgs.rounds) {
    for (const p of r.players) {
      const key = p.memberId || p.name;
      if (!agg[key]) agg[key] = { name: p.name, pos: null, toPar: 0, total: 0, rounds: [], country: null, region: null };
      if (p.country && !agg[key].country) agg[key].country = p.country;
      if (p.region && !agg[key].region) agg[key].region = p.region;
      // Aceitar a ronda com total válido mesmo SEM scorecard buraco-a-buraco —
      // rondas preenchidas pela classificação geral (quando o hoyoahoyo não listou
      // o jogador) só trazem o total. Contam para gross/standings; o scorecard
      // dessa ronda fica em branco. Sem isto, um 2º/3º classificado ausente de
      // R1/R2 caía como "incompleto" e o top-3 do Resumo saía errado.
      const hasCard = !!(p.scores && p.scores.length === courseHoles);
      const emCurso = p.total == null && p.partialGross != null && p.partialGross > 0;
      if ((p.total != null && p.total > 0 && p.total < 999) || emCurso) {
        agg[key].rounds.push({
          round: r.round, gross: emCurso ? (p.partialGross as number) : (p.total as number),
          scores: hasCard ? (p.scores as number[]) : [], pars: r.par || par,
          si: sliceH(lgs.course?.si) as number[], meters: sliceH(lgs.course?.meters) as number[], teeName: lgsTeeLabel,
          courseRating: lgs.course?.courseRating ?? undefined,
          slope: lgs.course?.slope ?? undefined,
          // Volta a meio: o gross é a soma dos buracos ENTREGUES, não uma volta.
          // Fica fora do total do torneio (ver `total` mais abaixo) e o cartão
          // mostra só os buracos jogados.
          ...(emCurso ? { _emCurso: true, _holesPlayed: p.holesPlayed ?? null } : {}),
        } as FPGRoundScore);
      }
    }
  }
  // Rondas de cada jogador por ordem (o backfill da classificação pode chegar fora de ordem)
  for (const a of Object.values(agg)) a.rounds.sort((x, y) => x.round - y.round);
  // Pos/toPar/total da última ronda COM jogadores (não a última agendada — que
  // pode estar vazia num evento em curso e zerava o leaderboard).
  const lastR = playedRoundsArr[playedRoundsArr.length - 1];
  if (lastR) {
    for (const p of lastR.players) {
      const key = p.memberId || p.name;
      if (agg[key]) {
        agg[key].pos = p.pos;
        agg[key].toPar = p.toPar;
        // Só VOLTAS FECHADAS somam para o total do torneio — somar o parcial de
        // quem vai no buraco 12 dava um "total" que não é resultado nenhum.
        agg[key].total = agg[key].rounds
          .filter((x) => !(x as { _emCurso?: boolean })._emCurso)
          .reduce((a, b) => a + b.gross, 0);
      }
    }
  }

  const sortedAcc = Object.values(agg).sort((a, b) => {
    if (a.pos == null && b.pos == null) return a.toPar - b.toPar;
    if (a.pos == null) return 1;
    if (b.pos == null) return -1;
    return a.pos - b.pos;
  });

  const dateRef = lgs.meta.dateIso || lgs.meta.dateRange || null;
  // Lookup HCP global injectado via dobLookup (efetivamente o terceiro arg do adapter).
  // Como esta função foi criada antes de termos hcpLookup, lemos via campo extra.
  const players: FPGPlayer[] = sortedAcc.map((a, idx) => {
    const e = lookupByName[norm(a.name)];
    // Português num torneio espanhol: a fonte local não o conhece (sem licença
    // RFEG), mas nós temos a ficha dele na FPG. Só se aplica a quem a BANDEIRA
    // da fonte marca como PT — cruzar por nome sem essa garantia apanharia
    // homónimos espanhóis.
    const ptFed = a.country === "PT" && fedByName
      ? fedByNameKeys(a.name).map((k) => fedByName.get(k)).find(Boolean)
      : undefined;
    // Estrangeiro sem ficha local: procurar no roster GolfBox, exigindo a
    // nacionalidade da bandeira (um homónimo de outro país não serve).
    const gb = !e && !ptFed ? golfboxLookup(golfbox, a.name, a.country) : undefined;
    const club = e?.club ? displayName(e.club) : (ptFed?.club ? displayName(ptFed.club) : (gb?.club ? displayName(gb.club) : ""));
    const dobRef = e?.dob || ptFed?.dob || gb?.dob || null;
    const age = dobRef ? ageAtDate(dobRef, dateRef ?? todayIso()) : null;
    const escLabel = escaloEsForPlayer(e?.catEdad, dobRef, dateRef);
    const sex: "M" | "F" | null = (e?.sex || ptFed?.sex) === "M" ? "M" : (e?.sex || ptFed?.sex) === "F" ? "F" : null;
    // "Incompleto" (→ WD) mede-se só contra as voltas FECHADAS: quem ainda não
    // saiu para a ronda de hoje não é um desistente.
    const incomplete = a.rounds.filter((x) => !(x as { _emCurso?: boolean })._emCurso).length < closedRounds;
    // HCP via lookup global (LGS não tem HCP no JSON)
    const lic = (e?.licencia || "").toUpperCase();
    // ⚠ `lic && …` devolve a STRING VAZIA quando não há licença — não null.
    // Testar `!= null` deixava passar essa string e o HCP do federado português
    // nunca era usado (coluna a "—" em todos os nossos).
    const hcpEs = lic ? (lgs as any)._hcpLookup?.[lic]?.hcp : undefined;   // eslint-disable-line @typescript-eslint/no-explicit-any
    const hcp = typeof hcpEs === "number" ? hcpEs : (ptFed?.hcp ?? undefined);
    // Bandeira do leaderboard oficial (o LGS marca-a na linha de cada jogador).
    // Vai na coluna do clube — mesmo padrão do BJGT/England, que também não têm
    // clube dos estrangeiros; a região ("Andalucía") serve de clube quando o
    // lookup não traz nenhum. Sem isto os 7 portugueses deste torneio eram
    // indistinguíveis no meio de 120 nomes.
    // ⚠ Só ESTRANGEIROS levam bandeira — mesma convenção do `rfegForeignFlag`:
    // estamos no circuito espanhol, os espanhóis são o default.
    const clubLabel = club || a.region || "";
    const flagEmoji = a.country && a.country !== "ES" ? flag(a.country) : "";
    return {
      scoreId: `lgs-${lgs.id}-${idx}`,
      pos: a.pos ?? idx + 1,
      name: formatPlayerName(a.name),
      club: [flagEmoji, clubLabel].filter(Boolean).join(" ") || "—",
      _isPortuguese: a.country === "PT",
      _country: a.country || undefined,
      fed: e?.licencia || ptFed?.fed || gb?.memberId || undefined,
      fedCode: e?.licencia || ptFed?.fed || gb?.memberId || undefined,
      grossTotal: a.total || null,
      toPar: a.toPar,
      hcpExact: hcp != null ? hcp : undefined,
      escalao: escLabel,
      dob: dobRef || undefined,
      _sex: sex,
      _age: age,
      nholes: courseHoles,
      parTotal,
      courseRating: lgs.course?.courseRating ?? undefined,
      slope: lgs.course?.slope ?? undefined,
      scores: a.rounds[0]?.scores || [],
      par,
      si: sliceH(lgs.course?.si),
      meters: sliceH(lgs.course?.meters),
      roundScores: a.rounds,
      _wd: incomplete,
      _roundsPlayed: a.rounds.length,
    } as FPGPlayer & { _sex: "M" | "F" | null; _age: number | null };
  });

  return {
    name: lgs.meta.name || `Torneio ${lgs.id}`,
    tcode: String(lgs.id),
    date: lgs.meta.dateIso || lgs.meta.dateRange || "",
    campo: lgs.meta.course || "",
    // Só as rondas JOGADAS geram abas de resultados (uma R3 ainda por jogar não
    // cria uma aba "R3" vazia a dizer "sem scorecards"). O draw da R3 aparece à
    // mesma, como aba "Draw R3" intercalada (ver roundDraws em rfegLoadDivisions).
    rounds: playedRounds,
    // Ronda a decorrer (se houver): o acumulado desconta-a ao decidir quem está
    // incompleto, para não marcar como eliminado quem ainda nem saiu.
    _openRound: lgs.rounds.find(roundEmCurso)?.round,
    playerCount: players.length,
    players,
  };
}

export function lgsScorecardOptions(): ScorecardOptions {
  // Vista coerente para ES (todos os 3 sources):
  // - ESC visível (idade → Sub-N, pill colorido global)
  // - HCP visível (coluna própria, sortable)
  // - CLUBE escondido (irrelevante em ES — não conhecemos os clubes)
  // - SD visível quando há CR/Slope (Valor del campo) — cai para "–" quando o
  //   torneio não os publica (ou ainda não foi re-scrapado)
  // - TEE escondido
  // - noPlayerLink: licenças espanholas (AM12345...) não correspondem a fed codes
  //   FPG — não criar link /jogadores/{fed} a apontar para nada útil.
  return intlScorecardOptions({ hideHCP: false, hideEsc: false, hideFed: false, hideClub: true, showAge: true, noPlayerLink: true });
}

/* ── ncToFPGTournament ────────────────────────────────────────
 * Converte JSON NextCaddy (já adaptado para RFEGDetail por adaptNextCaddy)
 * em FPGTournament — mesma estrutura uniforme para IntlTournView.
 *
 * Requer que o JSON tenha sido scrapado com `--scorecards` (popula roundScores
 * em cada player + course.par[]). Se estiver vazio, devolve null. */
/** Deriva CR/Slope por sexo a partir da relação linear WHS entre HI e hándicap
 *  de campo: CH = HI'·(Slope/113) + (CR − Par). O NextCaddy não publica CR/Slope,
 *  mas expõe o CH (coluna oculta "HcpJuego") → a regressão de CH sobre HI recupera
 *  o declive `a` e o intercepto `b`: CR = Par + b, Slope = 113·a.
 *  ⚠ Torneios de 9 buracos usam o índice de 9h = HI/2, logo o CH escala com HI/2
 *  → o declive é Slope9/(2·113) e Slope9 = 226·a (senão vinha metade e era rejeitado).
 *  Cada sexo joga o seu tee → CR/Slope próprios. Exige ≥4 pares e ajuste apertado
 *  (o CH é inteiro → R² alto confirma o modelo); senão devolve null (sem coluna SD). */
export function ncDeriveRatings(
  players: RFEGPlayer[],
  parTotal: number,
  is9: boolean,
): Record<"M" | "F", { cr: number; slope: number } | null> {
  const slopeDivisor = is9 ? 226 : 113;  // 9h: CH baseado em HI/2
  const fit = (sx: "M" | "F"): { cr: number; slope: number } | null => {
    const pts: [number, number][] = [];
    for (const p of players) {
      const s = p.sexo === "M" ? "M" : p.sexo === "F" ? "F" : null;
      if (s !== sx) continue;
      const hi = typeof p.hcp === "number" ? p.hcp : null;
      const ch = p.courseHcp;
      if (hi == null || ch == null || Number.isNaN(ch)) continue;
      pts.push([hi, ch]);
    }
    if (pts.length < 4) return null;
    const n = pts.length;
    const mx = pts.reduce((a, q) => a + q[0], 0) / n;
    const my = pts.reduce((a, q) => a + q[1], 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
    if (sxx === 0) return null;
    const a = sxy / sxx, b = my - a * mx;
    const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
    const slope = a * slopeDivisor, cr = parTotal + b;
    // Sanidade WHS: Slope plausível + CR perto do par + ajuste apertado.
    if (r2 < 0.9 || !(slope > 55 && slope < 165) || Math.abs(cr - parTotal) > 14) return null;
    return { cr: Math.round(cr * 10) / 10, slope: Math.round(slope * 10) / 10 };
  };
  return { M: fit("M"), F: fit("F") };
}

export function ncToFPGTournament(
  detail: RFEGDetail & { _ncCourseSi?: number[] | null; _ncCourseMeters?: number[] | null },
  dobLookup?: DobLookup,
): FPGTournament | null {
  const players = detail.inscritos.admitidos;
  // Determinar nº de rondas a partir do max round encontrado
  let nRounds = 0;
  for (const p of players) {
    for (const r of (p.rounds || [])) {
      if (r.round > nRounds) nRounds = r.round;
    }
  }
  if (nRounds === 0) return null;

  // Nº de buracos: NextCaddy tem torneios de 9 buracos (pitch&putt, alevíns) cujo
  // course.par/scores têm length 9. Detetar 9 vs 18 em vez de assumir 18 — assumir
  // 18 dropava TODOS os cartões de 9 (filtro scores.length===18) e mostrava par-72
  // fake. par18/si18/meters18 mantêm o nome mas guardam 9 OU 18 valores conforme o campo.
  const holeCount = (detail.coursePar && (detail.coursePar.length === 9 || detail.coursePar.length === 18))
    ? detail.coursePar.length
    : (players.some((p) => (p.rounds || []).some((r) => {
        const s = (r as { scores?: number[] }).scores;
        return Array.isArray(s) && s.length === 9;
      })) ? 9 : 18);
  const meters18 = (detail._ncCourseMeters && detail._ncCourseMeters.length === holeCount) ? detail._ncCourseMeters : [];
  // ⚠ Pitch & Putt → TODOS os buracos são PAR 3. O par do NextCaddy é INFERIDO dos
  // scores (infer-nextcaddy-par.js) e nestes torneios de escola infantil (HCP 54,
  // muitos 5-7 num par-3) dava par 4/5 — inventava um par 40 e estragava ±/Média.
  // Detecta-se por nome/formato ("P&P"/"Pitch & Putt") OU por TODOS os buracos
  // serem curtos (≤150 m = campo par-3). Nesse caso força par 3 em cada buraco.
  const ncIsPitchAndPutt = (() => {
    const txt = `${detail.meta?.name ?? ""} ${(detail.meta as { style?: string | null })?.style ?? ""} ${detail.meta?.course ?? ""}`.toLowerCase();
    if (/p\s*&\s*p\b|p\s*y\s*p\b|pitch\s*&?\s*\s*putt|pitch\s+and\s+putt/.test(txt)) return true;
    return meters18.length === holeCount && meters18.every((m) => typeof m === "number" && m > 0 && m <= 150);
  })();
  const par18 = ncIsPitchAndPutt
    ? new Array(holeCount).fill(3)
    : ((detail.coursePar && detail.coursePar.length === holeCount) ? detail.coursePar : new Array(holeCount).fill(4));
  const parTotal = par18.reduce((a, b) => a + b, 0);
  const si18 = (detail._ncCourseSi && detail._ncCourseSi.length === holeCount) ? detail._ncCourseSi : [];

  const norm = normEs;
  const lookupByName: Record<string, DobLookupEntry> = {};
  if (dobLookup) for (const e of Object.values(dobLookup)) if (e.name) lookupByName[norm(e.name)] = e;

  // Para Espanha: clube irrelevante. Mapeamos:
  //  - escalao = Sub-N derivado da idade (pill colorido global, sortable)
  //  - hcpExact = HCP número (coluna sortable)
  //  - club = clube real (ESCONDIDO via hideClub)
  const dateRef = detail.meta.dateStart || null;

  // CR/Slope por sexo derivados do hándicap de campo (coluna "HcpJuego") — a
  // NextCaddy não os publica. Alimentam a coluna SD (via computeSD).
  const ncRatings = ncDeriveRatings(players, parTotal, holeCount <= 9);

  const fpgPlayers: FPGPlayer[] = players.map((p, idx) => {
    const e = (p.licencia && dobLookup && dobLookup[p.licencia.trim()]) || lookupByName[norm(p.name || "")] || null;
    const dob = p.dob || e?.dob || null;
    const age = ageAtDate(dob, dateRef ?? todayIso());
    // Termo RFEG (Alevín, Benjamín, etc.) — coerência: sempre o termo da
    // federação espanhola, nunca "Sub-N". EscPill tem mapeamento ES→Sub-N CSS,
    // logo "Alevín" recebe a mesma cor que "Sub-12". Categoria oficial da fonte
    // primeiro; fallback por cohort de ano (não idade exacta) — ver escaloEsForPlayer.
    const escLabel = escaloEsForPlayer(p.catEdad || e?.catEdad, dob, dateRef);
    const club = (p.club || e?.club || "").toString();
    const sex: "M" | "F" | null = (p.sexo === "M" ? "M" : p.sexo === "F" ? "F" : (e?.sex === "M" ? "M" : e?.sex === "F" ? "F" : null));
    const rating = sex ? ncRatings[sex] : null;   // CR/Slope do tee deste sexo (SD)
    // Metros do TEE deste jogador (rapazes jogam das amarelas, raparigas das
    // vermelhas → distâncias diferentes), vindos do cartão dele. Fallback à
    // distância do campo. O teeName mostra a distância total para diferenciar tees.
    const playerMeters: number[] = (() => {
      for (const r of (p.rounds || [])) {
        const m = (r as { meters?: number[] | null }).meters;
        if (Array.isArray(m) && m.length === holeCount) return m;
      }
      return meters18;
    })();
    const playerMetersTotal = playerMeters.reduce((a, b) => a + (b || 0), 0);
    const teeLabel = playerMetersTotal > 0 ? `${playerMetersTotal} m` : (meters18.length ? "Tour" : undefined);
    const roundScores: FPGRoundScore[] = (p.rounds || [])
      // Exigir pelo menos um buraco com golpes > 0: um inscrito que NÃO jogou (WD/
      // DNS) traz o cartão a zeros (18×0), que passava o teste de comprimento e dava
      // gross 0 → ± = 0−72 = −72 na vista de ronda. Rondas a zeros = não jogadas.
      .filter((r) => {
        const s = (r as { scores?: number[] }).scores;
        return Array.isArray(s) && s.length === holeCount && s.some((x) => x > 0);
      })
      .map((r) => {
        const rm = (r as { meters?: number[] | null }).meters;
        const mm = (Array.isArray(rm) && rm.length === holeCount) ? rm : playerMeters;
        return {
          round: r.round,
          gross: (r.gross != null) ? r.gross : ((r as any).scores.reduce((a: number, b: number) => a + b, 0) || 0),
          scores: (r as any).scores,
          pars: par18,
          si: si18,
          meters: mm,
          teeName: teeLabel,
          courseRating: rating?.cr,
          slope: rating?.slope,
        };
      });
    const incomplete = roundScores.length < nRounds;
    // Gross/toPar a partir dos CARTÕES reais (soma das rondas), NÃO de `p.total`/
    // `p.toPar`: em torneios Stableford o NextCaddy põe os PONTOS em `p.total`
    // (ex: 18 pts), que apareciam como gross e davam um ± absurdo (18−36 = −18)
    // a contradizer o scorecard. Sem cartões (só inscrito) cai no `p.total` como
    // antes. A ordem do leaderboard é por `pos` (classificação oficial), logo
    // continua correcta mesmo em Stableford (o pos não vem do gross).
    const grossSum = roundScores.reduce((s, r) => s + (r.gross || 0), 0);
    const grossTotal = grossSum > 0 ? grossSum : (typeof p.total === "number" ? p.total : null);
    const toPar = grossSum > 0 ? grossSum - parTotal * roundScores.length : (p.toPar ?? null);
    return {
      scoreId: `nc-${detail.compId}-${idx}`,
      pos: p.pos ?? idx + 1,
      name: formatPlayerName(p.name || ""),
      club: club ? displayName(club) : "—",
      fed: p.licencia || undefined,
      fedCode: p.licencia || undefined,
      grossTotal,
      toPar,
      hcpExact: p.hcp ?? undefined,
      courseRating: rating?.cr,
      slope: rating?.slope,
      escalao: escLabel,
      // Fields extra usados pelo nameDecorator (M/F badge) + filtros (sex/age)
      _sex: sex,
      _age: age,
      teeName: teeLabel,
      nholes: holeCount,
      parTotal,
      scores: roundScores[0]?.scores || [],
      par: par18,
      si: si18,
      meters: playerMeters,
      roundScores,
      _wd: incomplete,
      _roundsPlayed: roundScores.length,
    } as FPGPlayer & { _sex: "M" | "F" | null; _age: number | null };
  });

  return {
    name: detail.meta.name || `NextCaddy ${detail.compId}`,
    tcode: String(detail.compId),
    date: detail.meta.dateStart || "",
    campo: detail.meta.course || "",
    rounds: nRounds,
    playerCount: fpgPlayers.length,
    players: fpgPlayers,
  };
}

/* ── rfegolfToFPGTournament ─────────────────────────────────────
 * Converte RFEGolf microsite results (PDF parsed) em FPGTournament. Sem hbh,
 * apenas totais por ronda — IntlTournView mostra "Resumo" mas as tabs Rn
 * mostram só totais. Útil para uniformidade visual. */
export function rfegolfToFPGTournament(detail: RFEGDetail, dobLookup?: DobLookup): FPGTournament | null {
  const results = (detail.results || []).filter(r => r.players && r.players.length > 0);
  if (results.length === 0) return null;
  // Concatenar todos os groups de resultados (categorias)
  const allRows = results.flatMap(g => g.players.map(p => ({ ...p, _label: g.label })));
  const nRounds = Math.max(...results.map(r => r.nRounds || 0), 1);
  const par18 = new Array(18).fill(4);  // RFEGolf não expõe par
  const parTotal = par18.reduce((a, b) => a + b, 0);

  const norm = normEs;
  const lookupByName: Record<string, DobLookupEntry> = {};
  if (dobLookup) for (const e of Object.values(dobLookup)) if (e.name) lookupByName[norm(e.name)] = e;

  // Inscritos do PRÓPRIO torneio: têm HCP + DOB + licença exactos e casam ~100%
  // por nome com a tabela de resultados (que vem do PDF, só com o nome). Fonte
  // preferida sobre o dobLookup global (que falha em homónimos/nomes ausentes).
  const insByName: Record<string, RFEGPlayer> = {};
  for (const list of Object.values(detail.inscritos || {})) {
    if (!Array.isArray(list)) continue;
    for (const ins of list as RFEGPlayer[]) {
      if (ins && ins.name) { const k = norm(ins.name); if (!insByName[k]) insByName[k] = ins; }
    }
  }

  const dateRef = detail.meta.dateStart || null;
  const players: FPGPlayer[] = allRows.map((p, idx) => {
    const nm = norm(p.name || "");
    const ins = insByName[nm];
    const e = lookupByName[nm];
    const dobStr = ins?.dob || e?.dob || null;
    // Escalão ES: preferir a categoria oficial do inscrito (Alevín/Infantil/…),
    // senão calcular pela DOB à data do torneio.
    const subN = escaloEsForPlayer(ins?.catEdad, dobStr, dateRef);
    const hcpExact = (typeof ins?.hcp === "number") ? ins.hcp : null;
    const roundScores: FPGRoundScore[] = (p.rounds || [])
      .map((g, i) => ({
        round: i + 1,
        gross: g,
        scores: [],
        pars: par18,
        si: [],
        meters: [],
        teeName: undefined,
      }))
      .filter(r => r.gross != null && r.gross > 0);
    const incomplete = roundScores.length < nRounds;
    return {
      scoreId: `rfeg-${detail.compId}-${idx}`,
      pos: p.pos ?? idx + 1,
      name: formatPlayerName(p.name || ""),
      club: ins?.club ? displayName(ins.club) : (e?.club ? displayName(e.club) : "—"),
      fed: ins?.licencia || e?.licencia || undefined,
      fedCode: ins?.licencia || e?.licencia || undefined,
      grossTotal: p.total ?? null,
      toPar: p.toPar ?? null,
      escalao: subN,
      hcpExact,
      dob: ins?.dob || e?.dob || undefined,
      nholes: 18,
      parTotal,
      scores: [],
      par: par18,
      si: [],
      meters: [],
      roundScores,
      _wd: incomplete,
      _roundsPlayed: roundScores.length,
    } as FPGPlayer;
  });

  return {
    name: detail.meta.name || `RFEGolf ${detail.compId}`,
    tcode: String(detail.compId),
    date: detail.meta.dateStart || "",
    campo: detail.meta.course || "",
    rounds: nRounds,
    playerCount: players.length,
    players,
    // RFEGolf publica ~65% só em PDF: temos os TOTAIS por ronda mas NÃO o cartão
    // hole-by-hole (scores/par/si/meters vazios). Marca para o IntlTournView NÃO
    // mostrar a tab "📋 Scorecards" (grelha vazia contra par-72 falso = parece partido).
    _noHbh: true,
  } as FPGTournament;
}

/* ── mitarjetaToFPGTournament ───────────────────────────────────
 * Campeonatos de España juvenis com live scoring no mitarjeta.golf (injectado
 * por scripts/scrape-mitarjeta.js). Ao contrário do RFEGolf-PDF, traz hole-by-hole
 * REAL + par/SI/metros REAIS do cartão do campo + HCP/idade (de admitidos). Modelo
 * = ncToFPGTournament. NUNCA fabrica par 4×18 — sem par, o array fica vazio (a
 * linha de PAR não aparece). */
export function mitarjetaToFPGTournament(detail: RFEGDetail, dobLookup?: DobLookup): FPGTournament | null {
  const group = (detail.results || []).find((r) => r.players && r.players.length > 0);
  if (!group) return null;

  // Par/SI/metros REAIS (9 ou 18 buracos). Vazios → sem placeholder.
  const valid = (a?: number[] | null) => Array.isArray(a) && (a.length === 18 || a.length === 9);
  const par = valid(detail.coursePar) ? (detail.coursePar as number[]) : [];
  const si = valid(detail._rfegCourseSi) ? (detail._rfegCourseSi as number[]) : [];
  const meters = valid(detail._rfegCourseMeters) ? (detail._rfegCourseMeters as number[]) : [];
  const nHoles = par.length || (group.perHole ? group.perHole.length : 18);
  const parTotal = par.reduce((a, b) => a + b, 0); // 0 quando não há par

  // Rondas REALMENTE jogadas (não as declaradas): num torneio a decorrer só há
  // R1 — usar as declaradas marcaria todos como incompletos (WD) e apagaria o total.
  const nRounds = Math.max(
    ...group.players.map((p) => (p.rounds || []).filter((g) => g != null && g > 0).length),
    1,
  );
  const courseRating = group.courseRating ?? undefined;
  const slope = group.slope ?? undefined;

  const norm = normEs;
  const lookupByName: Record<string, DobLookupEntry> = {};
  if (dobLookup) for (const e of Object.values(dobLookup)) if (e.name) lookupByName[norm(e.name)] = e;

  const dateRef = detail.meta.dateStart || null;

  const players: FPGPlayer[] = group.players.map((p, idx) => {
    const e = (p.licencia && dobLookup && dobLookup[p.licencia.trim()]) || lookupByName[norm(p.name || "")] || null;
    const dob = p.dob || e?.dob || null;
    const age = ageAtDate(dob, dateRef ?? todayIso());
    // Termo RFEG (Alevín/Benjamín/Infantil): categoria oficial canonizada +
    // fallback por cohort de ano (mesma função usada no resto da página).
    const escLabel = escaloEsForPlayer(p.catEdad, dob, dateRef) || ageToEscalaoEs(age);
    const startHole = p.startHole ?? undefined;
    const club = (p.club || e?.club || "").toString();
    const sex: "M" | "F" | null = (p.sexo === "M" ? "M" : p.sexo === "F" ? "F" : (e?.sex === "M" ? "M" : e?.sex === "F" ? "F" : null));

    const roundScores: FPGRoundScore[] = (p.rounds || [])
      .map((gross, i) => {
        const rn = i + 1;
        const sc = (p.holeScores && p.holeScores[String(rn)]) || [];
        return {
          round: rn,
          gross: (gross != null && gross > 0) ? gross : (sc.reduce((a, b) => a + b, 0) || 0),
          scores: sc.length === nHoles ? sc : [],
          pars: par,
          si,
          meters,
          courseRating,
          slope,
          startHole,
          teeName: meters.length ? "Camp." : undefined,
        };
      })
      .filter((r) => r.gross > 0);

    return {
      scoreId: `mitarjeta-${detail.compId}-${idx}`,
      pos: p.pos ?? idx + 1,
      name: formatPlayerName(p.name || ""),
      club: club ? displayName(club) : "—",
      fed: p.licencia || e?.licencia || undefined,
      fedCode: p.licencia || e?.licencia || undefined,
      grossTotal: p.total ?? null,
      toPar: p.toPar ?? null,
      hcpExact: p.hcp ?? undefined,
      escalao: escLabel || undefined,
      courseRating,
      slope,
      startHole,
      _sex: sex,
      _age: age,
      teeName: meters.length ? "Camp." : undefined,
      nholes: nHoles,
      parTotal: parTotal || undefined,
      scores: roundScores[0]?.scores || [],
      par,
      si,
      meters,
      roundScores,
      // Torneio AO VIVO: não marcar WD por terem jogado menos rondas que o total
      // (apagaria o total). WD real virá quando o mitarjeta o indicar.
      _wd: false,
      _roundsPlayed: roundScores.length,
    } as FPGPlayer & { _sex: "M" | "F" | null; _age: number | null };
  });

  return {
    name: detail.meta.name || `RFEGolf ${detail.compId}`,
    tcode: String(detail.compId),
    date: detail.meta.dateStart || "",
    campo: detail.meta.course || "",
    rounds: nRounds,
    playerCount: players.length,
    players,
  };
}

