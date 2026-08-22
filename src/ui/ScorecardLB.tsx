/**
 * ScorecardLB.tsx — Single-round scorecard leaderboard
 *
 * Extracted from LeaderboardComponents.tsx
 * Displays leaderboard with hole-by-hole scorecard for a single round.
 *
 * Columns: ESC · FED · CLUBE · HCP · TEE · Tot · ± · SD · 🐦 · Par · ■
 */
import React, { useState, useMemo } from "react";
import { normLoose } from "../utils/normName";
import type { EscLookup } from "../utils/playerUtils";
import type { Player, Tournament, ScorecardOptions, PlayerFilter, SDResult } from "../data/fpgTypes";
import { numGross, resolveEsc, playerDob, computeSD, filterPlayers, fillBlankHoles } from "../data/fpgUtils";
import { useSort } from "../hooks/useSort";
import { fmtHcp, ageAtDate, fmtDobPt } from "../utils/format";
import { flag as flagOf, normCountry } from "../utils/flagUtils";
import { EMPTY_FILTER } from "./multiRoundTypes";
import { ScorecardLeaderboard, type ScorecardRow } from "./ScorecardLeaderboard";
import { EscPill } from "./PillBadge";
import SexBadge from "./SexBadge";
import SortableHdr from "./SortableHdr";
import EmptyState from "./EmptyState";
import {
  isManuel,
  fmtTP,
  TeeDot,
  TournPName,
  SDPill,
  type PlayersDB,
} from "./tournamentPrimitives";
import { PlayerFilterBar } from "./PlayerFilterBar";
import { useFedBirthdates } from "./InscricoesComponents";
import { getTeeHex, teeBorder } from "../utils/teeColors";
import { displayFed } from "../utils/fedKeys";

/* PName — alias local */
const PName = ({
  name,
  fedCode,
  playersDB,
  highlight,
}: {
  name: string;
  fedCode?: string;
  playersDB: PlayersDB;
  highlight?: boolean;
}) => <TournPName name={name} fedCode={fedCode} playersDB={playersDB} highlight={highlight} />;

/* SortKey — usado pelo ScorecardLB */
type SortKey =
  | "pos"
  | "name"
  | "club"
  | "esc"
  | "age"
  | "class"
  | "hcp"
  | "gross"
  | "toPar"
  | "tee"
  | "sd"
  | "eag"
  | "bird"
  | "par-stat"
  | "bog"
  | "f9"
  | "b9"
  | `hole:${number}`;

export function ScorecardLB({
  tournament,
  escLookup,
  playersDB,
  siLabel,
  parLabelColSpan: parLabelColSpanProp,
  options,
}: {
  tournament: Tournament;
  escLookup: EscLookup;
  playersDB: PlayersDB;
  siLabel?: string;
  parLabelColSpan?: number;
  options?: ScorecardOptions;
}) {
  const hideHCP_ = options?.hideHCP ?? false;
  const hideSD_ = options?.hideSD ?? false;
  const hideRawSDTip_ = options?.hideRawSDTip ?? false;
  const hideEsc = options?.hideEsc ?? false;
  const hideFed = options?.hideFed ?? false;
  const hideTee = options?.hideTee ?? false;
  const hideClub_ = options?.hideClub ?? false;
  const showAge_ = options?.showAge ?? false;
  const showClass_ = options?.showClass ?? false;
  const clubLabel_ = options?.clubLabel ?? "CLUBE";
  const startHole_ = options?.startHole ?? 1;
  const nameDecorator_ = options?.nameDecorator;
  const noInfer = options?.noInferBlanks ?? false;
  // Calcular colSpan dinâmico: base 5 (ESC+FED+CLUBE+HCP+TEE) menos as colunas
  // ocultas, mais 1 se IDADE estiver ligada (showAge)
  const parLabelColSpan =
    parLabelColSpanProp ??
    (5 - (hideEsc ? 1 : 0) - (hideFed ? 1 : 0) - (hideClub_ ? 1 : 0) - (hideHCP_ ? 1 : 0) - (hideTee ? 1 : 0)
       + (showAge_ ? 1 : 0) + (showClass_ ? 1 : 0));
  const { sortKey, sortDir, toggleSort: handleSort } = useSort<SortKey>("pos");
  const [showScorecard, setShowScorecard] = useState(true);
  const [filter, setFilter] = useState<PlayerFilter>(EMPTY_FILTER);

  // Reset filtros quando muda de torneio
  const [lastTcode, setLastTcode] = useState(tournament.tcode);
  if (tournament.tcode !== lastTcode) {
    setLastTcode(tournament.tcode);
    setFilter(EMPTY_FILTER);
  }

  const rawPlayers = tournament.players.filter((p) => p.scores && p.scores.length > 0);

  // ─── Calcular ref, par, posições ANTES de qualquer early return ───────────
  // (React exige que todos os hooks sejam chamados incondicionalmente)
  const refP = rawPlayers[0];
  const refRs0 = refP?.roundScores?.[0];
  // ⚠ O par da grelha vem da volta MAIS LONGA, não do 1º jogador: numa ronda a
  // decorrer há cartões de 9 buracos ao lado de cartões de 18 e, como a lista
  // vem ordenada por gross, o 1º era um dos que ainda ia a meio — a grelha
  // encolhia para 9 colunas e escondia os buracos de quem já tinha acabado.
  // (A maioria também não serve: a meio da tarde os incompletos são a maioria.)
  const parOf = (p: Player) => (p.par?.length ? p.par : p.roundScores?.[0]?.pars) || [];
  let longest: number[] = [];
  for (const p of rawPlayers) { const pp = parOf(p); if (pp.length > longest.length) longest = pp; }
  const par = longest.length ? longest : (refP?.par?.length ? refP.par : refRs0?.pars || []);
  const nh = par.length;
  // Par por buraco do PRÓPRIO jogador (o campo que ele jogou nesta ronda). Em
  // torneios cujo campo se divide por vários percursos numa mesma ronda (ex:
  // FSGA joga R1 Roost / R2 Karoo por ondas), cada jogador tem o par do seu
  // campo — usá-lo para colorir e contar birdies/pares/bogeys. Fallback: `par`.
  const playerPar = (p: Player): number[] => {
    const pp = p.par?.length ? p.par : p.roundScores?.[0]?.pars;
    return pp && pp.length >= nh ? pp : par;
  };

  // Scores crus (sem estimativa NDB) — usado quando noInferBlanks está ligado:
  // os buracos por jogar ficam a 0 (→ em branco na grelha), nunca estimados.
  const rawFilled = (p: Player): { scores: number[]; inferred: boolean[] } => {
    const rs0 = p.roundScores?.[0];
    const raw = (p.scores?.length ? p.scores : rs0?.scores) || [];
    const n = p.nholes || raw.length || nh || 18;
    const scores = raw.slice(0, n).map((v) => (typeof v === "number" && v > 0 ? v : 0));
    return { scores, inferred: new Array(scores.length).fill(false) };
  };
  const parTotal = par.reduce((a, b) => a + b, 0);
  const si = refP?.si?.length ? refP.si : refRs0?.si || [];

  // Colectar metros por tee (cada tee distinto gera uma linha)
  const teeMetersMap = new Map<string, number[]>();
  for (const p of rawPlayers) {
    const prs = p.roundScores?.[0];
    const tn = p.teeName || prs?.teeName;
    const m = prs?.meters?.length ? prs.meters : p.meters;
    if (tn && m?.length && m.length >= nh && !teeMetersMap.has(tn)) {
      teeMetersMap.set(tn, m);
    }
  }
  const teeMeters = Array.from(teeMetersMap.entries()).map(([teeName, meters]) => ({
    teeName,
    meters,
  }));

  // Colectar CR/Slope distintos por tee (para metaLine multi-tee)
  const teeCrSlopeMap = new Map<string, { cr: number; slope: number }>();
  for (const p of rawPlayers) {
    const prs = p.roundScores?.[0];
    const tn = p.teeName || prs?.teeName;
    const cr = p.courseRating ?? prs?.courseRating;
    const sl = p.slope ?? prs?.slope;
    if (tn && cr && sl && !teeCrSlopeMap.has(tn)) {
      teeCrSlopeMap.set(tn, { cr, slope: sl });
    }
  }
  const teeCrSlopes = Array.from(teeCrSlopeMap.entries());

  // SD desta ronda: o CR/Slope/SI podem viver na ronda (ex: GolfBox — ebtc2/egtc/
  // elg/avtrophy — trazem-nos na divisão → roundScores[]) e não no topo do jogador.
  // Sem CR/Slope o computeSD devolve "–" (mesmo com a metaLine a mostrar CR·Slope);
  // sem SI cai no ramo raw ("≈") em vez do AGS ("~") quando há HCP. Overlay dos
  // campos da 1ª ronda (a mostrada) → SD idêntico ao AllRoundsScorecardLB/AccumulatedLB.
  const sdOf = (p: Player): SDResult => {
    const rs0 = p.roundScores?.[0];
    // Fonte sem CR/Slope mas com o SD oficial na ronda (ex: recent-tournaments.json,
    // reconstruído das voltas WHS) → usar esse valor em vez de "–".
    if (rs0 && typeof rs0.sd === "number" && (p.courseRating ?? rs0.courseRating) == null)
      return { sd: rs0.sd, source: "fpg" };
    if (rs0 && (p.courseRating == null || p.slope == null || !p.si?.length)) {
      return computeSD({
        ...p,
        par: p.par?.length ? p.par : rs0.pars,
        si: p.si?.length ? p.si : rs0.si,
        courseRating: p.courseRating ?? rs0.courseRating,
        slope: p.slope ?? rs0.slope,
        pcc: p.pcc ?? rs0.pcc,
        nholes: p.nholes ?? rs0.pars?.length,
      });
    }
    return computeSD(p);
  };

  const nonWD = rawPlayers.filter((p) => !p._wd);
  const wdOnly = rawPlayers.filter((p) => p._wd);
  // ⚠ Ordenar só por gross põe quem NÃO terminou a volta em 1º: 13 buracos
  // somam 54 e 18 somam 68 (caso Johanna Janisch, ELG 2026 R2). Quem tem a
  // volta completa vem primeiro; os que ainda vão a meio ficam no fim, por
  // gross. Rondas sem cartão hole-by-hole (só totais) não são afectadas: aí
  // ninguém tem buracos e a chave é neutra.
  const holesOf = (p: Player) => (p.scores || []).filter(Boolean).length;
  const anyHoles = nonWD.some((p) => holesOf(p) > 0);
  const done = (p: Player) => (anyHoles ? (holesOf(p) === nh ? 1 : 0) : 1);
  const byGross = [...nonWD].sort((a, b) => (done(b) - done(a)) || (numGross(a) - numGross(b)));
  let posCounter = 1;
  byGross.forEach((p, i) => {
    const prev = byGross[i - 1];
    if (i > 0 && (numGross(p) !== numGross(prev) || done(p) !== done(prev))) posCounter = i + 1;
    (p as any)._pos = posCounter;
  });
  wdOnly.forEach((p) => {
    (p as any)._pos = 9999;
  });
  // A média só junta voltas COMPLETAS (do tamanho da grelha) — misturar quem
  // fez 9 buracos com quem fez 18 dava "Média 44.6 (−26)" numa ronda a decorrer.
  // "completa" = buracos com score, não o tamanho do array (os buracos por
  // jogar de uma volta a decorrer vêm a zero para as colunas não desalinharem).
  const complete = byGross.filter((p) => holesOf(p) === nh);
  const grosses = (complete.length ? complete : byGross).map((p) => numGross(p)).filter((g) => !isNaN(g));
  const avg = grosses.length ? grosses.reduce((a, b) => a + b, 0) / grosses.length : 0;
  const nIncompletos = byGross.length - complete.length;

  // Hooks têm de vir ANTES de qualquer return condicional
  const fedBirthdates = useFedBirthdates();
  const filteredPlayers = useMemo(
    () => filterPlayers(rawPlayers, filter, escLookup, playersDB, { tournamentDate: tournament.date, fedBirthdates }),
    [rawPlayers, filter, escLookup, playersDB, tournament.date, fedBirthdates]
  );

  /** Stats por jogador (birds/pars/bogs) + scores/inferred — calculados uma
   *  única vez para servir tanto o sort comparator como o render dos rows.
   *  Usa fillBlankHoles (Net Double Bogey reconciliado) para coerência com
   *  o que aparece na UI. */
  const statsByPlayer = useMemo(() => {
    const m = new Map<Player, { eags: number; birds: number; pars: number; bogs: number; scores: number[]; inferred: boolean[] }>();
    for (const p of rawPlayers) {
      const { scores, inferred } = noInfer ? rawFilled(p) : fillBlankHoles(p);
      const pp = playerPar(p);
      let eags = 0, birds = 0, pars = 0, bogs = 0;
      for (let i = 0; i < scores.length && i < pp.length; i++) {
        if (!scores[i]) continue;
        const d = scores[i] - pp[i];
        if (d <= -2) eags++;
        else if (d === -1) birds++;
        else if (d === 0) pars++;
        else bogs++;
      }
      m.set(p, { eags, birds, pars, bogs, scores, inferred });
    }
    return m;
  }, [rawPlayers, par]);

  const sorted = useMemo(() => {
    const INF = 9999;
    return [...filteredPlayers].sort((a, b) => {
      // WD players sempre no fim, independentemente do sortKey
      const aWD = a._wd;
      const bWD = b._wd;
      if (aWD && !bWD) return 1;
      if (!aWD && bWD) return -1;

      // Sort por buraco específico: "hole:N" (0-based)
      if (typeof sortKey === "string" && sortKey.startsWith("hole:")) {
        const hi = parseInt(sortKey.slice(5), 10);
        const sa = statsByPlayer.get(a)?.scores[hi];
        const sb = statsByPlayer.get(b)?.scores[hi];
        const va = sa && sa > 0 ? sa : INF;
        const vb = sb && sb > 0 ? sb : INF;
        return sortDir === "asc" ? va - vb : vb - va;
      }
      // Sort por Out (f9) ou In (b9)
      if (sortKey === "f9" || sortKey === "b9") {
        const sumHalf = (p: typeof a) => {
          const s = statsByPlayer.get(p)?.scores ?? [];
          const arr = sortKey === "f9" ? s.slice(0, 9) : s.slice(9, 18);
          const valid = arr.filter(v => v > 0);
          if (!valid.length) return INF;
          return arr.reduce((acc, v) => acc + (v || 0), 0);
        };
        const va = sumHalf(a);
        const vb = sumHalf(b);
        return sortDir === "asc" ? va - vb : vb - va;
      }

      let av: any, bv: any;
      switch (sortKey) {
        case "pos":
          av = (a as any)._pos ?? 999;
          bv = (b as any)._pos ?? 999;
          break;
        case "name":
          av = a.name;
          bv = b.name;
          break;
        case "club":
          av = a.club || "";
          bv = b.club || "";
          break;
        case "esc":
          av = (a.escalao || resolveEsc(a, escLookup, { tournamentDate: tournament.date, playersDB, fedBirthdates }) || "");
          bv = (b.escalao || resolveEsc(b, escLookup, { tournamentDate: tournament.date, playersDB, fedBirthdates }) || "");
          break;
        case "age":
          av = (a as any)._age ?? 999;
          bv = (b as any)._age ?? 999;
          break;
        case "class":
          av = (a as any)._classYear ?? 99999;
          bv = (b as any)._classYear ?? 99999;
          break;
        case "hcp":
          av = a.hcpExact ?? 999;
          bv = b.hcpExact ?? 999;
          break;
        case "gross":
          av = numGross(a);
          bv = numGross(b);
          break;
        case "toPar":
          av = numGross(a) - parTotal;
          bv = numGross(b) - parTotal;
          break;
        case "tee":
          av = a.teeName || "";
          bv = b.teeName || "";
          break;
        case "sd":
          av = sdOf(a).sd ?? 999;
          bv = sdOf(b).sd ?? 999;
          break;
        case "eag":
          // Mais eagles primeiro quando asc.
          av = -(statsByPlayer.get(a)?.eags ?? 0);
          bv = -(statsByPlayer.get(b)?.eags ?? 0);
          break;
        case "bird":
          // Mais birdies primeiro quando asc (mais útil) — invertemos o sinal.
          av = -(statsByPlayer.get(a)?.birds ?? 0);
          bv = -(statsByPlayer.get(b)?.birds ?? 0);
          break;
        case "par-stat":
          av = -(statsByPlayer.get(a)?.pars ?? 0);
          bv = -(statsByPlayer.get(b)?.pars ?? 0);
          break;
        case "bog":
          // Bogeys: menos primeiro quando asc (clássico — quem fez menos bogeys jogou melhor).
          av = statsByPlayer.get(a)?.bogs ?? 999;
          bv = statsByPlayer.get(b)?.bogs ?? 999;
          break;
        default:
          av = 0;
          bv = 0;
      }
      if (typeof av === "string")
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [filteredPlayers, sortKey, sortDir, parTotal, escLookup, playersDB, tournament.date, fedBirthdates, statsByPlayer]);

  // Agora é seguro fazer early return — todos os hooks já foram chamados
  if (!rawPlayers.length) return <EmptyState size="sm" message="Scorecards não disponíveis." />;

  const rows: ScorecardRow[] = sorted.map((p, idx) => {
    const isWDPlayer = !!p._wd || p.grossTotal == null || numGross(p) >= 999;
    const gross = isWDPlayer ? 0 : numGross(p);
    const dp = (p as any)._pos;
    const showPos = idx === 0 || dp !== (sorted[idx - 1] as any)._pos;
    const medalEmoji = dp === 1 ? "🥇" : dp === 2 ? "🥈" : dp === 3 ? "🥉" : null;
    const posDisplay =
      isWDPlayer ? "WD" : sortKey === "pos" ? (showPos ? medalEmoji ?? dp : "") : medalEmoji ?? dp;
    const esc = resolveEsc(p, escLookup, { tournamentDate: tournament.date, playersDB, fedBirthdates }) || tournament.escalao || "";
    const { sd, source } = sdOf(p);
    const rowManuel = isManuel(p);
    // Conterrâneo (FFG, etc.) — adaptador de página marca via _isPortuguese.
    const rowPortuguese = !rowManuel && !!(p as any)._isPortuguese;
    const rowBg = rowManuel ? "var(--bg-success-subtle)" : undefined;
    const stickyBg = rowManuel ? "var(--bg-manuel-sticky)" : undefined;

    // Scores por buraco com buracos vazios (cartão incompleto) preenchidos pelo
    // valor inferido (Net Double Bogey, reconciliado com o gross oficial). A
    // máscara `inferred` marca quais foram estimados — para a UI os pintar a
    // cinzento. Não altera os ficheiros de dados.
    // Reutilizamos statsByPlayer (calculado uma vez para sort + render).
    const stats = statsByPlayer.get(p);
    const scores = stats?.scores ?? [];
    const inferred = stats?.inferred ?? [];
    const eags = stats?.eags ?? 0;
    const birds = stats?.birds ?? 0;
    const pars = stats?.pars ?? 0;
    const bogs = stats?.bogs ?? 0;
    const pp = playerPar(p);
    const ppTotal = pp === par ? parTotal : pp.reduce((a, b) => a + b, 0);
    // Cartão INCOMPLETO sem gross oficial (o `inferred` só reconcilia quando há
    // gross publicado): comparar a soma dos buracos jogados com o par de TODOS
    // dava um ±par falso — 16 buracos em 81 apareciam como "+9" (caso Tomás
    // Câmara, Regional de Clubes 2026). Sem cartão completo não há ±par.
    // ⚠ EXCEPÇÃO: volta a DECORRER. Aí o gross publicado é o dos buracos já
    // jogados (36 ao fim de 9) — o cartão é coerente consigo próprio e o ±par
    // desses buracos é exactamente o que qualquer leaderboard live mostra.
    // Distingue-se do caso acima por `gross === soma dos buracos publicados`.
    const scoredHoles = scores.filter(Boolean).length;
    const playedSum = scores.reduce((a, b) => a + (b > 0 ? b : 0), 0);
    const playedParSum = pp.reduce((a, v, i) => a + (scores[i] ? v : 0), 0);
    let toParVal: number | null;
    if (isWDPlayer) {
      toParVal = null;
    } else if (noInfer) {
      // Torneio interrompido / a decorrer: nunca estimar buracos por jogar.
      if (scoredHoles >= nh) {
        toParVal = ppTotal > 0 ? gross - ppTotal : null;            // volta completa
      } else if (scoredHoles > 0) {
        toParVal = playedSum - playedParSum;                        // a meio → só os jogados
      } else {
        // Sem cartão hole-by-hole: só há ±par se o gross for um total de volta
        // completa credível (não um total a correr de uma volta parada).
        toParVal = ppTotal > 0 && gross >= nh && gross >= ppTotal - 12
          ? gross - ppTotal
          : null;
      }
    } else {
      const inProgress = scoredHoles > 0 && scoredHoles < pp.length && playedSum === gross;
      const isPartial = scoredHoles > 0 && scoredHoles < pp.length && inferred.every(v => !v) && !inProgress;
      // Par só dos buracos jogados quando a volta ainda vai a meio.
      const refParTotal = inProgress ? pp.reduce((a, v, i) => a + (scores[i] ? v : 0), 0) : ppTotal;
      toParVal = isPartial ? null : gross - refParTotal;
    }

    return {
      key: p.scoreId || idx,
      pos: posDisplay,
      gross,
      toPar: toParVal,
      scores,
      holePars: pp,
      inferredHoles: inferred,
      startHole: (p as { startHole?: number }).startHole,
      rowBg,
      stickyBg,
      isManuel: rowManuel,
      isPortuguese: rowPortuguese,
      fedCode: p.fedCode || undefined,
      nameContent: ((): React.ReactNode => {
        const sex = (p as any)._sex as ("M" | "F" | null | undefined);
        const noLink = options?.noPlayerLink === true;
        // Em RFEG (noPlayerLink), licenças espanholas não correspondem a fed codes
        // FPG — render plain text para não criar link /jogadores/{fed} inútil.
        const baseInner = noLink ? (
          // Mesma classe que TournPName usa noutras páginas (.tourn-pname =
          // font-weight 700) — sem isto os nomes RFEG ficavam normais enquanto
          // os das vistas Resumo/Inscritos e das outras páginas são bold.
          <span className="tourn-pname">{p.name}</span>
        ) : (
          <PName
            name={p.name}
            fedCode={p.fedCode}
            playersDB={playersDB}
            highlight={isManuel(p)}
          />
        );
        // Pill de sexo após o nome (só renderiza se _sex foi injectado pelo
        // adapter da página — RFEG/intl). Usa SexBadge (NUNCA texto/símbolo Unicode).
        const decorated = sex === "M" || sex === "F" ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {baseInner}
            <SexBadge sex={sex} />
          </span>
        ) : baseInner;
        const base: React.ReactNode = nameDecorator_
          ? nameDecorator_(p.name, decorated)
          : decorated;
        // Marker para jogadores acrescentados de torneio simultâneo (ex: Sub 12
        // que jogou no Absoluto). _absolutoNote dá o tooltip completo.
        if (!(p as any)._fromAbsoluto) return base;
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            {base}
            <span title={(p as any)._absolutoNote || "Jogou em torneio simultâneo"}
              style={{
                fontSize: "var(--fs-9)", lineHeight: 1.4, padding: "1px 6px",
                borderRadius: 8, background: "var(--bg-warn-subtle, #fef3c7)",
                color: "var(--color-warn-dark, var(--color-warn-dark))",
                border: "1px solid var(--color-warn, #f59e0b)",
                cursor: "help", fontWeight: 700, whiteSpace: "nowrap",
              }}>⚠ Abs</span>
          </span>
        );
      })(),
      prefixCells: (
        <>
          {showAge_ && (
            // Coluna IDADE (separada de ESC, sortable por número). Tooltip com a
            // DOB completa quando a fonte a traz (ex: GolfBox via GetPlayers).
            <td className="lb-age" style={{ width: 44, minWidth: 44, textAlign: "center" }}>
              {(() => {
                const age = (p as any)._age as (number | null | undefined);
                if (age == null || age < 0) return <span className="muted">–</span>;
                const dob = fmtDobPt((p as any).dob);
                return (
                  <span className="p p-sm" title={dob ? `Nascido a ${dob}` : undefined}
                    style={{ background: "var(--bg-muted, #e5e7eb)", color: "var(--text-2)", borderColor: "transparent", cursor: dob ? "help" : undefined }}>{age}a</span>
                );
              })()}
            </td>
          )}
          {showClass_ && (
            // Coluna NASC. — ano de nascimento ESTIMADO a partir do class year
            // (US: gradua-se ~aos 18 → nascido ≈ classYear − 18; Manuel 2014 → 2032).
            // Sortable. Guarda-se o class year cru em _classYear; aqui mostra-se o nascimento.
            <td className="lb-age" style={{ width: 52, minWidth: 52, textAlign: "center" }}>
              {(() => {
                const cy = (p as any)._classYear as (number | null | undefined);
                if (cy == null) return <span className="muted">–</span>;
                const birth = cy - 18;
                return (
                  <span className="p p-sm" title={`Class of ${cy} · ≈ nascido ${birth}`}
                    style={{ background: "var(--bg-muted, #e5e7eb)", color: "var(--text-2)", borderColor: "transparent" }}>~{birth}</span>
                );
              })()}
            </td>
          )}
          {!hideEsc && (
            <td className="lb-esc" style={{ width: 70, minWidth: 70, whiteSpace: "nowrap" }}>
              {(() => {
                if (esc) return <EscPill esc={esc} />;
                // Sem escalão — tentar idade via DOB (playersDB[fed].dob,
                // fedBirthdates, ou lookup por nome em playersDB).
                let dob: string | undefined =
                  playerDob(p, { playersDB, fedBirthdates }) || undefined;
                if (!dob && p.name) {
                  // ⚠ Match por NOME é arriscado: um homónimo sénior era cruzado
                  // com o miúdo inscrito (ex: "Luis Mateus" 47a no Sub-12). Só
                  // aceitar candidato ÚNICO e de idade JUVENIL plausível (≤25,
                  // cobre até ao U25); vários juvenis = ambíguo → não mostrar.
                  const norm = normLoose;
                  const nn = norm(p.name);
                  const juniorDobs: string[] = [];
                  for (const k in playersDB) {
                    const e = (playersDB as any)[k];
                    if (!e?.dob || !e?.name || norm(e.name) !== nn) continue;
                    const a = ageAtDate(e.dob, tournament.date);
                    if (a != null && a >= 0 && a <= 25) juniorDobs.push(e.dob);
                  }
                  if (juniorDobs.length === 1) dob = juniorDobs[0];
                }
                const age = ageAtDate(dob, tournament.date);
                if (age != null && age >= 0 && age < 100) {
                  return (
                    <span className="p p-sm" title={dob ? `${dob} (${age} anos no torneio)` : ""}
                      style={{ background: "var(--bg-muted, #e5e7eb)", color: "var(--text-2)", borderColor: "transparent" }}>
                      {age}a
                    </span>
                  );
                }
                return <span className="muted">–</span>;
              })()}
            </td>
          )}
          {!hideFed && <td className="lb-fed">{displayFed(p.fedCode) || "–"}</td>}
          {!hideClub_ && (() => {
            // Em torneios internacionais (ex: Castro Marim U14), o "clube"
            // é frequentemente um código de país ISO-3 (FRA, ESP, SUI, EST,
            // POR, USA). Detectar e mostrar bandeira em vez do código —
            // mantém compatibilidade com clubes normais (Vila Sol, Belas).
            const club = p.club || "";
            const upper = club.trim().toUpperCase();
            // Critério: 2-3 letras maiúsculas + flag conhecida (não 🏳️)
            const isCountryCode = /^[A-Z]{2,3}$/.test(upper);
            const flagEmoji = isCountryCode ? flagOf(club) : null;
            if (isCountryCode && flagEmoji && flagEmoji !== "🏳️") {
              const code = normCountry(club).toUpperCase();
              return (
                <td className="lb-club" title={code}>
                  <span style={{ fontSize: "1.1em" }}>{flagEmoji}</span>
                </td>
              );
            }
            return <td className="lb-club">{club || "–"}</td>;
          })()}
          {!hideHCP_ && <td className="lb-hcp">{fmtHcp(p.hcpExact)}</td>}
          {!hideTee && (
            <td className="lb-tee">
              <TeeDot teeName={p.teeName} />
            </td>
          )}
        </>
      ),
      postScorecardCells: (
        <>
          {!hideSD_ && (
            <td className="lb-sd">
              {sd != null ? (
                <SDPill sd={sd} source={source} hcp={p.hcpExact ?? null} hideRawTip={hideRawSDTip_} />
              ) : (
                <span className="muted">–</span>
              )}
            </td>
          )}
          <td className="lb-eag">{eags || ""}</td>
          <td className="lb-bird">{birds || ""}</td>
          <td className="lb-par-stat">{pars || ""}</td>
          <td className="lb-bog">{bogs || ""}</td>
        </>
      ),
    };
  });

  return (
    <ScorecardLeaderboard
      par={par}
      si={si.length >= nh ? si : undefined}
      siLabel={siLabel}
      teeMeters={teeMeters.length ? teeMeters : undefined}
      rows={rows}
      parLabelColSpan={parLabelColSpan}
      postTotalColCount={0}
      startHole={startHole_}
      showScorecard={showScorecard}
      onToggleScorecard={() => setShowScorecard((v) => !v)}
      metaLine={
        <>
          <span>
            {rawPlayers.length} jog · Par {parTotal} · {nh}h
          </span>
          {avg > 0 && (
            <span title={nIncompletos > 0 ? `Média só das ${grosses.length} voltas completas (${nIncompletos} ainda a decorrer)` : undefined}>
              · Média {avg.toFixed(1)} ({fmtTP(Math.round(avg - parTotal))})
            </span>
          )}
          {nIncompletos > 0 && <span className="muted">· {nIncompletos} a decorrer</span>}
          {refP.course && <span>· 📍 {refP.course}</span>}
          {teeCrSlopes.length === 1 && (
            <span>· CR {teeCrSlopes[0][1].cr} · Slope {teeCrSlopes[0][1].slope}</span>
          )}
          {teeCrSlopes.length > 1 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {" · "}
              {teeCrSlopes.map(([tn, { cr, slope }]) => {
                const hex = getTeeHex(tn);
                const bdr = teeBorder(hex) || "1px solid rgba(0,0,0,.18)";
                return (
                  <span key={tn} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                    <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: hex, border: bdr, flexShrink: 0 }} />
                    <span>{cr}/{slope}</span>
                  </span>
                );
              })}
            </span>
          )}
        </>
      }
      filterBar={
        <PlayerFilterBar
          players={rawPlayers}
          filter={filter}
          onChange={setFilter}
          escLookup={escLookup}
          playersDB={playersDB}
          total={rawPlayers.length}
          tournamentDate={tournament.date}
        />
      }
      prefixHeaderCells={
        <>
          {showAge_ && (
            <SortableHdr
              k="age"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="lb-age"
              style={{ width: 44, minWidth: 44 }}
            >
              IDADE
            </SortableHdr>
          )}
          {showClass_ && (
            <SortableHdr
              k="class"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="lb-age"
              style={{ width: 52, minWidth: 52 }}
              title="Ano de nascimento estimado (≈ class year − 18)"
            >
              NASC.
            </SortableHdr>
          )}
          {!hideEsc && (
            <SortableHdr
              k="esc"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="lb-esc"
              style={{ width: 70, minWidth: 70 }}
            >
              ESC.
            </SortableHdr>
          )}
          {!hideFed && <th className="lb-fed">FED</th>}
          {!hideClub_ && (
            <SortableHdr
              k="club"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="lb-club"
            >
              {clubLabel_}
            </SortableHdr>
          )}
          {!hideHCP_ && (
            <SortableHdr
              k="hcp"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="lb-hcp"
            >
              HCP
            </SortableHdr>
          )}
          {!hideTee && (
            <SortableHdr
              k="tee"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="lb-tee"
            >
              TEE
            </SortableHdr>
          )}
        </>
      }
      postScorecardHeaderCells={
        <>
          {!hideSD_ && (
            <SortableHdr
              k="sd"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="lb-sd"
            >
              SD
            </SortableHdr>
          )}
          <SortableHdr
            k="eag"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            className="lb-eag"
            title="Clique para ordenar por nº de eagles (descendente)"
          >
            🦅
          </SortableHdr>
          <SortableHdr
            k="bird"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            className="lb-bird"
            title="Clique para ordenar por nº de birdies (descendente)"
          >
            🐦
          </SortableHdr>
          <SortableHdr
            k="par-stat"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            className="lb-par-stat"
            title="Clique para ordenar por nº de pares (descendente)"
          >
            Par
          </SortableHdr>
          <SortableHdr
            k="bog"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            className="lb-bog"
            title="Clique para ordenar por nº de bogeys"
          >
            ■
          </SortableHdr>
        </>
      }
      activeSortKey={sortKey}
      activeSortDir={sortDir}
      onSortPos={() => handleSort("pos")}
      onSortName={() => handleSort("name")}
      onSortToPar={() => handleSort("toPar")}
      onSortGross={() => handleSort("gross")}
      onSortHole={(i) => handleSort(`hole:${i}` as SortKey)}
      onSortF9={() => handleSort("f9")}
      onSortB9={() => handleSort("b9")}
    />
  );
}
