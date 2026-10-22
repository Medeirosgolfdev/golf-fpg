/**
 * jobFile.ts — Dados das provas MAJOR em formato JobFile (GolfGenius/GolfBox):
 * Junior Orange Bowl, Future Masters, FSGA, Under Armour, México, Champion of
 * Champions, Evian Juniors Cup, Faldo Madeira, ETC/EGA, Estonian Junior
 * Open/Tour, Optimist…
 *
 *   - tipos JobFile/JobDivision/JobPlayer (o que os scrapers escrevem)
 *   - jobDivisionToTournament: divisão → Tournament (formato FPG)
 *   - jobDrawsToFpg: draws (tee sheets) → FpgDraw do DrawTab
 *   - jobEvoFor: regressados da edição do ano anterior
 *   - jobEntryId: id da entrada (igual ao do scripts/build-major-catalog.js)
 *   - jobFileDivisions: as divisões de um ficheiro já convertidas
 *
 * Tirado da MajorPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import { isManuelByName as isM } from "../../constants/manuel";
import { isPtCountry } from "../../utils/flagUtils";
import { intlCountryCell } from "../intlCommon";
import { ageAtDate } from "../../utils/format";
import { normName } from "../../utils/normName";
import { buildEvoMap, type EvoEntry } from "../../hooks/useEvoComparison";
import type { Tournament as FPGTournament, ScorecardOptions } from "../fpgTypes";
import type { FpgDraw } from "../nacional2026Loader";
import { playedParTotal } from "../fpgUtils";
import { intlScorecardOptions } from "../intlScorecard";
import { buildFpgDraw, indexByName } from "../intlDraw";
import { buildFPGTournament, type IntlPlayerIn } from "../intlTournament";

export interface JobPlayer { pos: string; name: string; country: string; location?: string; detailId?: string | null; hcp?: number | null; hcpEstimated?: boolean; birthYear?: number | null; birthYearEst?: number | null; birthYearEstMax?: number | null; countryEstimated?: boolean; estNote?: string | null; dob?: string | null; club?: string | null; toPar: number | null; total: number | null; roundGross: number[]; rounds: { day: number; scores: number[]; f9?: number; b9?: number; gross: number; startingHole?: number; pars?: (number | null)[];
  // Cartão de tee POR RONDA (provas que mudam de campo ou de marcação a cada
  // ronda) — ganha ao da divisão quando existe.
  date?: string; meters?: (number | null)[] | null; si?: (number | null)[] | null; teeName?: string | null; courseRating?: number | null; slope?: number | null }[]; }
export interface JobDrawGroup { time?: string; startHole?: number | null; players: { name: string; tee?: string }[]; }
export interface JobDivision { division: string; source?: string; tid?: string; par?: (number | null)[] | null; parTotal?: number | null; meters?: (number | null)[] | null; si?: (number | null)[] | null; teeName?: string | null; metersTotal?: number | null; courseRating?: number | null; slope?: number | null; players: JobPlayer[]; draws?: Record<string, { round: number; label?: string; date?: string; groups: JobDrawGroup[] }>; }
export interface JobFile { tournament: string; year: number; stop?: number | null; source?: string; course?: string | null; startDate?: string | null; endDate?: string | null; divisions: JobDivision[]; }

// Divisão 1 = Rapazes, Divisão 2 = Raparigas (consistente em todas as edições JOB).
export const JOB_DIV_LABELS = ["Rapazes", "Raparigas"];

// showRatings: fontes que trazem HCP + Course Rating/Slope (ex: GolfBox) mostram
// as colunas HCP e SD; as GolfGenius (sem esses dados) mantêm-nas escondidas para
// não exibir colunas vazias. showAges: coluna IDADE (idade À DATA do torneio via
// dob+startDate; fallback ano − birthYear) — ligar só em fontes com birthYear.
export function jobScorecardOptions(opts?: { showRatings?: boolean; showAges?: boolean }): ScorecardOptions {
  return intlScorecardOptions({ hideHCP: !opts?.showRatings, showAge: !!opts?.showAges });
}

export function jobDivisionToTournament(div: JobDivision, name: string, year?: number, date?: string | null): FPGTournament {
  // Incluir quem tem total OU rondas com scores — em torneios a DECORRER o
  // GolfGenius ainda não publica o `total` agregado (fica null), mas há já
  // scorecards por ronda que queremos mostrar.
  const players = div.players.filter((p) => p.total != null || (p.rounds || []).some((r) => (r.scores || []).length > 0));
  const nR = Math.max(...players.map((p) => (p.rounds ? p.rounds.length : 0) || p.roundGross.length), 0);

  // Detectar divisão de 9 buracos (ex: FM "10 and Under"). ⚠ Os mais novos
  // jogam 9 buracos e ALTERNAM o nine por dia: um dia o FRONT-9 (startingHole=1),
  // outro o BACK-9 (startingHole=10). O par/metros/SI vêm do course_analytics com
  // 18 buracos → é preciso fatiar para os 9 jogados POR RONDA (consoante o
  // startingHole dessa ronda), senão a coloração buraco-a-buraco fica errada.
  // ⚠ Decidir pela MAIORIA das rondas, não por `some`: numa divisão de 18
  // buracos basta UM jogador que desistiu a meio (uma ronda de 9 scores) para
  // `some` marcar a divisão inteira como 9 buracos e fatiar todos os cartões
  // a 9 (ex: FM 2026 "13 & 14" tem 328 rondas de 18 + 1 de 9 por desistência).
  let n9 = 0, n18 = 0;
  for (const p of players) for (const r of p.rounds || []) {
    const L = r.scores?.length;
    if (L === 9) n9++; else if (L === 18) n18++;
  }
  const nineHole = n9 > n18;
  const holes = nineHole ? 9 : 18;

  // Arrays do campo completo (18 buracos), quando válidos.
  const full18 = (arr?: (number | null)[] | null): number[] | null =>
    Array.isArray(arr) && arr.length === 18 && arr.every((x) => x != null) ? (arr as number[]) : null;
  const par18 = full18(div.par);
  const meters18 = full18(div.meters);
  const si18 = full18(div.si);

  // Fatia um array de 18 para os 9 buracos de uma ronda (back-9 → offset 9).
  const sliceFor = (arr18: number[] | null, startHole?: number): number[] => {
    if (!arr18) return [];
    if (!nineHole) return arr18;
    const off = startHole === 10 ? 9 : 0;
    return arr18.slice(off, off + 9);
  };

  // Ficheiros sem par[18]: o par TOTAL de uma volta é real (total − toPar de
  // quem os tem); por buraco fica SEM PAR — nunca um par «chato» inventado
  // (decisão de 22/10/2026). Sem ninguém com toPar, nem par total.
  let parRoundReal: number | null = null;
  if (!par18) {
    const ref = players.find((p) => p.toPar != null && p.total != null && (p.rounds?.length || p.roundGross.length));
    const refR = ref ? (ref.rounds?.length || ref.roundGross.length) : 0;
    parRoundReal = ref && refR ? Math.round((ref.total! - ref.toPar!) / refR) : null;
  }

  // Par/SI/metros por ronda em função do seu startingHole.
  const parForRound = (sh?: number) => (par18 ? sliceFor(par18, sh) : []);
  const metersForRound = (sh?: number) => sliceFor(meters18, sh);
  const siForRound = (sh?: number) => sliceFor(si18, sh);

  // Representativo (cabeçalho/stats): a 1ª ronda jogada na divisão.
  const repSH = players.find((p) => p.rounds?.length)?.rounds?.[0]?.startingHole;
  const par = parForRound(repSH);
  const parTotal: number | null = par18 ? par.reduce((a, b) => a + b, 0) : parRoundReal;
  // A linha de metros no scorecard só aparece quando há teeName.
  const teeName = meters18 ? (div.teeName || "Tee") : undefined;

  const fpg: IntlPlayerIn[] = players.map((p): IntlPlayerIn => {
    const rounds = (p.rounds || []).map((r) => {
      // Preferir a soma dos scores quando a ronda está completa (mais fiável que
      // o `gross` do leaderboard, que pode divergir em ficheiros antigos).
      const sc = r.scores || [];
      const gross = sc.length === holes ? sc.reduce((a, b) => a + b, 0) : r.gross;
      // Par POR RONDA: quando o ficheiro traz `pars` na ronda (ex: FSGA joga em
      // dois campos com pares hole-by-hole diferentes), usá-lo em vez do par da
      // divisão — só assim a coloração buraco-a-buraco fica certa em cada ronda.
      // ⚠ Aceitar `pars` do tamanho da PRÓPRIA ronda, não só do tamanho da
      // divisão: numa prova a decorrer há cartões com 9 buracos numa divisão de
      // 18 (jogador ainda na volta) e cair no par da divisão dava "Média (−26)"
      // e to-pars de −50 na R3 do Champion of Champions 2026.
      let roundPars = Array.isArray(r.pars) && r.pars.every((x) => x != null)
        && (r.pars.length === holes || (sc.length > 0 && r.pars.length === sc.length))
        ? (r.pars as number[]) : parForRound(r.startingHole);
      // ⚠ Volta AINDA A DECORRER numa divisão de 18 (9 buracos entregues):
      // alinhar os 9 scores na metade certa da grelha de 18 e deixar a outra a
      // zeros. Sem isto a linha desenhava só 9 células e TODAS as colunas
      // seguintes (Out/In e os contadores 🦅/🐦/Par/■) saíam trocadas.
      // Os zeros são o marcador de "buraco por jogar" que o resto da app já
      // entende (par contado só onde há score, "·Nb" na parcial do nine).
      let scores = sc;
      if (holes === 18 && sc.length === 9) {
        const off = r.startingHole === 10 ? 9 : 0;
        scores = Array.from({ length: 18 }, (_, i) => (i >= off && i < off + 9 ? sc[i - off] : 0));
        const base = parForRound(undefined);
        if (roundPars.length === 9 && base.length === 18) {
          const overlay = [...base];
          for (let i = 0; i < 9; i++) overlay[off + i] = roundPars[i];
          roundPars = overlay;
        }
      }
      // CR/Slope da divisão (ex: GolfBox) → SD por ronda no leaderboard. Só em
      // rondas de 18 buracos (o CR publicado é para a volta completa).
      // Metros/SI/tee/CR/slope da PRÓPRIA ronda quando o ficheiro os traz
      // (campo ou marcação diferente em cada ronda); senão, os da divisão.
      const rMeters18 = full18(r.meters);
      const rSi18 = full18(r.si);
      const cr = r.courseRating ?? div.courseRating;
      const sl = r.slope ?? div.slope;
      const roundCR = !nineHole && cr != null ? cr : undefined;
      const roundSlope = !nineHole && sl != null ? sl : undefined;
      const rMeters = rMeters18 ? sliceFor(rMeters18, r.startingHole) : metersForRound(r.startingHole);
      const rTee = rMeters.length ? (r.teeName || div.teeName || "Tee") : teeName;
      return {
        gross, scores, startHole: r.startingHole,
        card: { par: roundPars, si: rSi18 ? sliceFor(rSi18, r.startingHole) : siForRound(r.startingHole), meters: rMeters, teeName: rTee, courseRating: roundCR, slope: roundSlope },
      };
    });
    // Em torneios a DECORRER o GolfGenius dá o to-par corrente mas ainda não o
    // `total` agregado (null). Reconstruir o gross/to-par acumulado das rondas
    // jogadas — senão o jogador aparece como WD e a média fica 999.
    const playedGross = rounds.reduce((s, r) => s + (r.gross || 0), 0);
    const grossTotal = p.total ?? (rounds.length ? playedGross : null);
    // Par acumulado somado RONDA A RONDA (só os buracos jogados) — `parTotal ×
    // nº de rondas` dava −50 a quem estava a meio da última volta.
    const playedPar = rounds.reduce((s, r) => s + playedParTotal({ gross: r.gross, scores: r.scores, pars: r.card.par }, parTotal ?? 0), 0);
    const toPar = p.toPar ?? (rounds.length && playedPar > 0 ? playedGross - playedPar : null);
    return {
      id: p.detailId || p.name,
      pos: parseInt(String(p.pos).replace(/^T/i, ""), 10) || null,
      name: p.name,
      club: p.country ? intlCountryCell(p.country) : "",
      country: p.country,
      // HCP exacto (ex: GolfBox) → SD por Adjusted Gross Score (Net Double
      // Bogey) em vez de gross cru. Sem HCP, o computeSD cai no gross cru.
      hcp: p.hcp,
      total: grossTotal,
      toPar,
      rounds,
      scores: p.rounds?.[0]?.scores,
      roundsPlayed: rounds.length || p.roundGross.length,
      // Sem marca de WD: o TournamentDetail decide pelas voltas.
      wd: null,
      extra: {
        _hcpEst: p.hcp != null && p.hcpEstimated ? true : undefined,
        _hcpNote: p.hcpEstimated ? p.estNote ?? null : undefined,
        // Idade À DATA DO TORNEIO quando há DOB completa + data (GolfBox traz as
        // duas) — um miúdo nascido a 22/10/2007 num torneio de Julho de 2026 tem
        // 18 anos, não 19. Fallback year-based (ano − birthYear) sem DOB/data.
        _age: (p.dob && date ? ageAtDate(p.dob, date) : null)
          ?? (year && p.birthYear ? year - p.birthYear : null),
        // DOB completa quando a fonte a traz (GolfBox via GetPlayers `entries`) —
        // alimenta o tooltip da coluna IDADE e as colunas Nasc./Idade do Resumo
        // (o AccumulatedLB lê `(p as any).dob`).
        dob: p.dob ?? undefined,
        // Ano e estimativas (Faldo Madeira) — as mesmas colunas Nasc./Idade do
        // Draw, com as estimativas a vermelho (16/10/2026).
        birthYear: p.birthYear ?? undefined,
        birthYearEst: p.birthYearEst ?? undefined,
        ...(p.birthYearEstMax !== undefined ? { birthYearEstMax: p.birthYearEstMax } : {}),
        estNote: p.estNote ?? undefined,
      },
    };
  });
  return buildFPGTournament(
    { name, tcode: `job-${name}`, date: date || "", campo: "", rounds: nR },
    { par, holes, parTotal },
    fpg,
    { keepNoRounds: true, raw: true },
  );
}


/** Evolução ano-a-ano do JOB/FM: marca quem regressou da edição do ano anterior
 *  e em que escalão estava, usando o to-par total como valor comparável.
 *
 *  ⚠ A referência é o conjunto de TODOS os escalões do ano anterior — não o
 *  mesmo escalão (nem, pior, o mesmo ÍNDICE de divisão, que muda de ano para
 *  ano e dava 0 correspondências). Num torneio júnior os miúdos SOBEM de
 *  escalão a cada ano, por isso o regressado típico estava num escalão mais
 *  novo na edição anterior. Cada jogador da referência traz o seu escalão de
 *  origem (`from`) para o badge "11 & 12 → 13 & 14" funcionar; o `divLabel`
 *  resolve o label de forma idêntica para actual e referência (senão o mesmo
 *  escalão apareceria sempre como "subiu"). */
export function jobEvoFor(
  file: JobFile, all: JobFile[], divIndex: number,
  divLabel: (dv: JobDivision, idx: number) => string,
): { evo?: Map<string, EvoEntry>; evoYear?: string } {
  const prev = all.find((f) => f.year === file.year - 1);
  if (!prev) return {};
  const curDiv = file.divisions[divIndex];
  if (!curDiv) return {};
  const completos = (d: JobDivision, idx: number) => d.players
    .filter((p) => p.toPar != null && p.total != null)
    .map((p) => ({ name: p.name, value: p.toPar as number, category: divLabel(d, idx) }));
  const raw = buildEvoMap({
    currentPlayers: completos(curDiv, divIndex),
    referencePlayers: prev.divisions.flatMap((d, idx) => completos(d, idx)),
    referenceYear: String(file.year - 1),
    isManuel: isM,
  });
  return { evo: raw.evoMap, evoYear: raw.evoYear };
}

// Colunas do DrawTab sem dados na fonte GolfGenius/internacional (FED/HCP/Nasc.
// não existem; ESC é uniforme = o escalão; TEE não vem por jogador). Escondidas
// para o draw do FM não ter 5 colunas vazias. O CLUBE preenche-se com o país.
export const JOB_DRAW_HIDE_COLS = { esc: true, fed: true, hcp: true, tee: true, nasc: true } as const;

/** Converte os draws scraped (FM, GolfGenius, GolfBox) para o formato FpgDraw que o TournamentDetail
 *  consome via `tournament._draws`. Preenche `clube` com o país do jogador
 *  (cruzando o nome com o leaderboard), já que o tee sheet só traz o nome. */
/** `players`: TODOS os jogadores do torneio (os do escalão por último, para
 *  ganharem) — o draw de um escalão traz jogadores inscritos noutros (Faldo
 *  Madeira R2: Hobbs/Dalby do Boys 21 no draw do Boys 16) e ficavam sem
 *  HCP/nascimento/estimativas (16/10/2026). */
/** `div`: o escalão deste draw e os outros do torneio — quem está nos grupos mas
 *  jogou outro escalão (os flights misturam escalões) sai marcado com ele em
 *  `otherDivision` e não conta no total do escalão (16/10/2026). */
export function jobDrawsToFpg(draws: NonNullable<JobDivision["draws"]>, players: JobPlayer[], div?: { self: JobDivision; all: JobDivision[] }): Record<string, FpgDraw> {
  // normName partilhado (tira diacríticos): tee sheet e leaderboard divergem na
  // grafia — com um lowercase simples os acentos falhavam o match exactamente
  // nos nomes PT ("João" no leaderboard vs "Joao" no tee sheet).
  const norm = normName;
  const key = (p: JobPlayer) => [p.name ? norm(p.name) : null];
  // Quem vem depois ganha (os jogadores do escalão vêm por último).
  // HCP do jogador (o tee sheet da Evian Juniors Cup publica-o) → coluna HCP do draw.
  const hcpByName = indexByName(players, key, (p) => (typeof p.hcp === "number" ? p.hcp : undefined), "last");
  // Nascimento (dob ISO ou só o ano) → coluna Nasc. do draw (Faldo Madeira).
  const birthByName = indexByName(players, key, (p) => (p.dob || p.birthYear ? { dob: p.dob ?? null, birthYear: p.birthYear ?? null } : undefined), "last");
  // Valores ESTIMADOS (Faldo Madeira: estrangeiros sem fonte) → itálico vermelho no draw.
  const estByName = indexByName(players, key, (p) => (p.hcpEstimated || p.birthYearEst || p.countryEstimated
    ? { hcpEstimated: !!p.hcpEstimated, birthYearEst: p.birthYearEst ?? null, ...(p.birthYearEstMax !== undefined ? { birthYearEstMax: p.birthYearEstMax } : {}), countryEstimated: !!p.countryEstimated, estNote: p.estNote ?? null }
    : undefined), "last");
  const countryByName = indexByName(players, key, (p) => (p.country ? intlCountryCell(p.country).trim() : undefined), "last");
  // Conterrâneos destacados (.row-portuguese) também no draw — regra da casa.
  const ptByName = indexByName(players, key, (p) => (p.country && isPtCountry(p.country) ? true : undefined), "last");
  // Escalão real de cada jogador (os «Overall …» juntam todos — não contam).
  const isAggregate = (d: JobDivision) => /overall|leaderboard|geral|absolut/i.test(d.division || "");
  const own = div && !isAggregate(div.self) ? new Set(div.self.players.map((p) => norm(p.name))) : null;
  const divOf = own
    ? indexByName(div!.all.filter((d) => d !== div!.self && !isAggregate(d)).flatMap((d) => d.players.map((p) => ({ p, d }))),
      ({ p }) => [norm(p.name)], ({ d }) => d.division, "first")
    : new Map<string, string>();
  type DrawIn = JobDrawGroup["players"][number];
  return Object.fromEntries(Object.entries(draws).map(([rn, info]) => [rn, buildFpgDraw(
    (info.groups || []).map((g) => ({ teeTime: g.time || "", startHole: g.startHole ?? null, tee: null, players: g.players })),
    (p: DrawIn) => ({ nome: p.name, clube: null, tee: p.tee ?? null }),
    (p: DrawIn) => {
      const k = norm(p.name);
      return {
        clube: countryByName.get(k) ?? null,
        hcp: hcpByName.get(k) ?? null,
        ...(birthByName.get(k) ?? {}),
        ...(estByName.get(k) ?? {}),
        ...(ptByName.has(k) ? { isPortuguese: true } : {}),
        ...(own && !own.has(k) && divOf.has(k) ? { otherDivision: divOf.get(k) } : {}),
      };
    },
  )]));
}

/** id da entrada no catálogo. Circuitos multi-evento/ano (Estonian Junior
 *  Tour, Optimist): o id ganha o nº da etapa (`f.stop`) — tem de bater com o
 *  id do scripts/build-major-catalog.js. O JOB e o FM nunca levam etapa. */
export function jobEntryId(source: string, f: JobFile, withStop = true): string {
  return withStop && f.stop ? `${source}:${f.year}:${f.stop}` : `${source}:${f.year}`;
}

/** Divisão de um JobFile já convertida (o resto — tabs, colunas — é da página). */
export interface JobDivisionData {
  key: string;
  label: string;
  division: JobDivision;
  hasManuel: boolean;
  results: FPGTournament;
  evo?: Map<string, EvoEntry>;
  evoYear?: string;
}

/** Converte as divisões de um ficheiro. `labelOf` dá o nome do escalão (o mesmo
 *  para a edição actual e para a de referência da evolução). Com `withDraws`
 *  (FM e GolfGenius/GolfBox) junta os draws ao torneio — o TournamentDetail
 *  monta as tabs flat intercaladas (Draw R1 · R1 · Draw R2 · R2 · … · Resumo ·
 *  Scorecards) — e limpa o ccode/tcode placeholder (`job-…`) para não mostrar
 *  o pill/link FPG (estas provas não têm ccode/tcode). */
export function jobFileDivisions(
  f: JobFile, files: JobFile[],
  labelOf: (dv: JobDivision, idx: number) => string,
  withDraws: boolean,
): JobDivisionData[] {
  return f.divisions.map((dv, i) => {
    const label = labelOf(dv, i);
    const { evo, evoYear } = jobEvoFor(f, files, i, labelOf);
    const results = jobDivisionToTournament(dv, label, f.year, f.startDate);
    if (withDraws) {
      if (dv.draws && Object.keys(dv.draws).length) {
        (results as unknown as { _draws?: Record<string, FpgDraw> })._draws = jobDrawsToFpg(dv.draws, [...f.divisions.filter((x) => x !== dv).flatMap((x) => x.players), ...dv.players], { self: dv, all: f.divisions });
      }
      (results as unknown as { ccode?: string; tcode?: string }).ccode = undefined;
      (results as unknown as { ccode?: string; tcode?: string }).tcode = undefined;
    }
    return { key: `d${i}`, label, division: dv, hasManuel: dv.players.some((p) => isM(p.name)), results, evo, evoYear };
  });
}
