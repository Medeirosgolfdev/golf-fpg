/**
 * kids/RivalDetail.tsx — Painel de detalhe do rival selecionado
 * (extraído de KIDSPage.tsx — 1158 linhas)
 */
import React, { useMemo, useState } from "react";
import { fmtToPar, fmtSign, MONTHS_PT_FULL, isoDate, medal } from "../../utils/format";
import { flag as flagOf } from "../../utils/flagUtils";
import { getTrend } from "../../utils/mathUtils";
import { scClass, toParClass, tpColorDark } from "../../utils/scoreDisplay";
import KpiCard from "../../ui/KpiCard";
import ExtLink from "../../ui/ExternalLink";
import DetailHeader from "../../ui/DetailHeader";
import EmptyState from "../../ui/EmptyState";
import SexBadge from "../../ui/SexBadge";
import { RoundPill } from "../../ui/PillBadge";
import { uskTournNames, uskFieldSizes, ncScoringType, getScorecards, normName } from "../../data/KIDSdataLoader";
import { FIELD_2025, VP_PAR, VP_SI, VP_M, MS_USKIDS_M_B1011, MS_USKIDS_M_B12, DORAL_GP_M_B1011, DORAL_SF_M_B1213, FIELD_CARDS } from "../../data/rivalData";
import { TR_I } from "../../constants/config";
import TournScorecard from "./TournScorecard";
import AnaliseSection from "./AnaliseSection";
import { MemberHistTable } from "./MemberHistTable";
import { EvolucaoChart, TorneiosRecorrentes, H2HTable, inferNholes } from "./RivalCharts";
import { T, UP, ageLabel, findCard, getPlayerType, getTournInfo, getTournLinks, getTournUrl, getTournWeight, hiddenTids, manuel, nPlayed, tornCanonK, useMH, useRivals, useRivalsLoaded, useScoringStatsCtx, yearOf, rankMap, totalRanked, AUTO_TOURN_NAMES, AUTO_TOURN_META } from "../KIDSPage";
import { computeDobInfo, escalaoIntl, T_MAP } from "./dobInference";
import { AUTO_COVERED_BY } from "../../data/tidAliases";
import { EOWAGR25_CARDS, EOWAGR25_M, EOWAGR25_PAR, EOWAGR25_SI, WJGC26_1213_CARDS, WJGC26_1213_M, WJGC26_1213_PAR, WJGC26_1213_SI, WJGC26_CARDS, WJGC26_M, WJGC26_PAR, WJGC26_SI } from "./courseScorecards";
import type { MHPlayer, MHTournament, RivalPlayer, TournDef } from "../KIDSPage";

export const RivalDetail = React.memo(function RivalDetail({ playerName }: { playerName: string }) {
  const rivals = useRivals();
  const rivalsLoaded = useRivalsLoaded();
  const memberHist = useMH();
  const scoringStats = useScoringStatsCtx();
  // Debug mode: activar com ?debug=1 na URL (funciona em prod e dev)
  const debugMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
  const rival = rivals.find(d => d.n === playerName);
  // Usar o Manuel do array merged (tem wjgc25_b1011 e outros tids auto)
  const manuelMerged = rivals.find(d => d.isM) ?? manuel;

  // Scoring stats pré-calculadas para este jogador (do slim.json)
  const playerScoringStats = React.useMemo(() => {
    if (!scoringStats) return null;
    const key = normName(playerName);
    return scoringStats.jogadores[key] ?? null;
  }, [scoringStats, playerName]);

  // Member history lookup for this player (used for DOB estimation + history table)
  const mhPlayer = React.useMemo(() => {
    if (!memberHist) return null;
    const key = playerName.toLowerCase().trim().replace(/\s+/g, " ");
    return (Object.values(memberHist.jogadores) as MHPlayer[]).find(
      m => m.name && m.name.toLowerCase().trim().replace(/\s+/g, " ") === key
    ) ?? null;
  }, [memberHist, playerName]);
  const bjgtCard = FIELD_CARDS.find(c => c.name === playerName);
  const lbEntry = FIELD_2025.leaderboard.find(p => p.name === playerName);
  const wjgcCard = findCard(WJGC26_CARDS, playerName);

  const eowagr25Card = findCard(EOWAGR25_CARDS, playerName);
  const wjgc26_1213Card = findCard(WJGC26_1213_CARDS, playerName);

  const [expandedTourns, setExpandedTourns] = useState<Set<string>>(() => new Set());

  // Reset expanded state whenever player changes
  React.useEffect(() => {
    setExpandedTourns(new Set());
  }, [playerName]);

  const toggleExpand = (id: string) => setExpandedTourns(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const flag = rival ? flagOf(rival.co) : "";
  const rank = rankMap[playerName];
  const tr = rival ? (getTrend as (p: RivalPlayer) => string | null)(rival) : null;
  const played = rival ? nPlayed(rival) : 0;
  const isManuel = rival?.isM;

  // Tournament results: T manual (com scorecard) + auto-loaded (sem scorecard)
  const manualTournIds = new Set(T.map(t => t.id));

  // AUTO_COVERED_BY (auto tid → manual T id) vem de tidAliases.ts.
  // Mapa inverso: manual T id → lista de auto tids equivalentes (para buscar scorecards)
  const MANUAL_AUTO_TIDS: Record<string,string[]> = {};
  for (const [autoTid, manTid] of Object.entries(AUTO_COVERED_BY)) {
    if (!MANUAL_AUTO_TIDS[manTid]) MANUAL_AUTO_TIDS[manTid] = [];
    MANUAL_AUTO_TIDS[manTid].push(autoTid);
  }

  // Lookup inverso: nome de torneio (normalizado) → id do T[] manual
  const T_BY_NAME = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of T) {
      // normalizar: minúsculas, sem acentos, sem anos
      const k = t.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .replace(/\s*\d{4}$/, "").replace(/\s+/g, " ").trim();
      m.set(k, t.id);
      // também indexar o nome completo com ano
      const k2 = t.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .replace(/\s+/g, " ").trim();
      m.set(k2, t.id);
    }
    return m;
  }, []);

  function autoIsCoveredByManual(tid: string): boolean {
    // 1. Mapa explícito (formato antigo → tid manual T[])
    if (tid in AUTO_COVERED_BY) {
      const manualTid = AUTO_COVERED_BY[tid];
      return !!((rival?.r[manualTid]?.rd?.length ?? 0) > 0);
    }
    // 2. Novo formato usk{tcode}_b{n} → verifica contra T[] por nome
    const uskMatch = tid.match(/^(usk\d+)_b\d+$/);
    if (uskMatch) {
      const info = uskTournNames.get(uskMatch[1]);
      if (info) {
        const normFull = info.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
          .replace(/\s+/g, " ").trim();
        const normBase = normFull.replace(/\s*\d{4}$/, "").trim();
        const manualTid = T_BY_NAME.get(normFull) ?? T_BY_NAME.get(normBase);
        if (manualTid) return !!((rival?.r[manualTid]?.rd?.length ?? 0) > 0);
      }
      return false;
    }
    // 3. Formato antigo não mapeado (ex: marco26_b11): verifica se existe tid completo com mesmo nome
    const autoNameInfo = AUTO_TOURN_NAMES[tid];
    if (autoNameInfo) {
      const normOld = autoNameInfo.name.toLowerCase().replace(/\s*\d{4}$/, "").trim();
      for (const rivalTid of Object.keys(rival?.r ?? {})) {
        const um = rivalTid.match(/^(usk\d+)_b\d+$/);
        if (!um) continue;
        const completoInfo = uskTournNames.get(um[1]);
        if (!completoInfo) continue;
        const normC = completoInfo.name.toLowerCase().replace(/\s*\d{4}$/, "").trim();
        if (normC === normOld && (rival!.r[rivalTid]?.rd?.length ?? 0) > 0) return true;
      }
    }
    // 4. Fallback: strip _b\d+ suffix
    const base = tid.replace(/_b\d+$/, "");
    if (manualTournIds.has(base)) return !!((rival?.r[base]?.rd?.length ?? 0) > 0);
    return false;
  }

  /** Procura scorecard auto para um tid manual — verifica formato antigo E novo (usk{tcode}_b{n}) por nome */
  function findAutoScorecard(manualTid: string) {
    // 1. Formato antigo (MANUAL_AUTO_TIDS)
    const oldCard = (MANUAL_AUTO_TIDS[manualTid] || []).reduce(
      (found: typeof autoScorecards[0] | null, atid) =>
        found || autoScorecards.find(sc => sc.tid === atid) || null, null
    );
    if (oldCard) return oldCard;
    // 2. Mesmo tid
    const exact = autoScorecards.find(sc => sc.tid === manualTid);
    if (exact) return exact;
    // 3. Novo formato: usk{tcode}_b{n} com mesmo nome de torneio
    const manualT = T.find(t => t.id === manualTid);
    if (manualT) {
      const nameNorm = manualT.name.toLowerCase().replace(/\s*\d{4}$/, "").trim();
      return autoScorecards.find(sc => {
        const m = sc.tid.match(/^(usk\d+)_b\d+$/);
        if (!m) return false;
        const info = uskTournNames.get(m[1]);
        if (!info) return false;
        return info.name.toLowerCase().replace(/\s*\d{4}$/, "").trim() === nameNorm;
      }) ?? null;
    }
    return null;
  }

  const autoScorecards = React.useMemo(() => (rival ? getScorecards(rival.n) : []), [rival]);

  const tournResults = React.useMemo(() => {
    if (!rival) return [] as Array<{
      t: TournDef;
      res: any;
      autoCard: any;
      hasCard: boolean;
      ageGroup: string | null;
      isAuto: boolean;
    }>;
    return [
      // 1. Torneios do array T manual com resultados
      ...T.filter(t => rival.r[t.id] && rival.r[t.id].rd?.length > 0
        // Ocultar brjgt25 se wjgc25_b1011 existir (o JSON tem info completa)
        && !(t.id === "brjgt25" && rival.r["wjgc25_b1011"]?.rd?.length > 0)
      ).map(t => ({
        t,
        res: rival.r[t.id],
        // Auto-scorecard: para tourns com card dedicado usa-o; caso contrário (ou se não existe para este jogador) usa auto
        autoCard: (() => {
          const isKnownDedicated = ["brjgt25","wjgc26","eowagr25","wjgc26_1213"].includes(t.id);
          const dedicatedMissing =
            (t.id === "brjgt25" && !bjgtCard) ||
            (t.id === "wjgc26" && !wjgcCard) ||
            (t.id === "eowagr25" && !eowagr25Card) ||
            (t.id === "wjgc26_1213" && !wjgc26_1213Card);
          if (isKnownDedicated && !dedicatedMissing) return null;
          return findAutoScorecard(t.id);
        })(),
        hasCard: (() => {
          if (t.id === "brjgt25")     return !!bjgtCard      || !!findAutoScorecard("brjgt25");
          if (t.id === "wjgc26")      return !!wjgcCard      || !!findAutoScorecard("wjgc26");
          if (t.id === "eowagr25")    return !!eowagr25Card  || !!findAutoScorecard("eowagr25");
          if (t.id === "wjgc26_1213") return !!wjgc26_1213Card;
          return !!findAutoScorecard(t.id);
        })(),
        // ageGroup: primeiro dos MANUAL_AUTO_TIDS, depois usk{tcode}_b{n} por nome, depois fallback
        ageGroup: (() => {
          const fromOld = (MANUAL_AUTO_TIDS[t.id] || []).reduce((found: string | null, atid) =>
            found || ((rival.r[atid] as any)?.ageGroup ?? null), null);
          if (fromOld) return fromOld;
          const nameNorm = t.name.toLowerCase().replace(/\s*\d{4}$/, "").trim();
          for (const [rTid, rRes] of Object.entries(rival.r)) {
            const m = rTid.match(/^(usk\d+)_b\d+$/);
            if (!m) continue;
            const info = uskTournNames.get(m[1]);
            if (!info) continue;
            if (info.name.toLowerCase().replace(/\s*\d{4}$/, "").trim() !== nameNorm) continue;
            const ag = (rRes as any)?.ageGroup;
            if (ag) return ag;
          }
          return ageLabel(t.ageMin, t.ageMax);
        })() as string | null,
        isAuto: false,
      })),
      // 2. Torneios auto-loaded não presentes em T e não cobertos por T
      ...Object.entries(rival.r)
        .filter(([tid, res]) => {
          if (manualTournIds.has(tid) || autoIsCoveredByManual(tid)) return false;
          // Aceitar tids com rd hbh OU pos/total (cp00 maioria sem hbh)
          if (!res || (!res.rd?.length && res.p == null && res.t == null && res.tp == null)) return false;
          return true;
        })
        .map(([tid, res]) => {
          const info = getTournInfo(tid);
          const autoMeta = AUTO_TOURN_META[tid];
          const tmap = T_MAP[tid];
          const uskField = uskFieldSizes.get(tid) ?? 0;
          const fakeDef = {
            id: tid, name: info.name, short: info.short, date: info.date,
            dateExact: tmap?.dateExact ?? info.dateExact,
            rounds: res.rd.length, par: autoMeta?.par ?? 72,
            field: autoMeta?.field ?? uskField, nations: autoMeta?.nations ?? 0,
            intendedRounds: res.rd.length, url: getTournUrl(tid, autoMeta?.url),
          } as unknown as TournDef;
          const autoCard = autoScorecards.find(sc => sc.tid === tid) || null;
          return { t: fakeDef, res, hasCard: !!autoCard, autoCard, ageGroup: ((res as any).ageGroup ?? null) as string | null, isAuto: true };
        }),
    ].sort((a, b) => {
      const da = a.t.dateExact ?? a.t.date;
      const db = b.t.dateExact ?? b.t.date;
      return db.localeCompare(da);  // mais recente primeiro
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rival, bjgtCard, wjgcCard, eowagr25Card, wjgc26_1213Card, autoScorecards, T_BY_NAME]);

  // Contadores baseados em tournResults (deduplicados) — fonte de verdade para o detalhe
  const playedDedup = tournResults.length;
  const roundsDedup = tournResults.reduce((acc, x) =>
    acc + x.res.rd.filter((r: number | null) => r != null && r > 0).length, 0);

  // ── Player type badge ──────────────────────────────────────────────────────
  const playerType = rival && !isManuel ? getPlayerType(rival) : null;

  // ── Dados para o gráfico de evolução ──────────────────────────────────────
  const evoRivalData = tournResults.map(({ t, res }) => ({
    id: t.id,
    short: t.short,
    dateExact: t.dateExact ?? t.date,
    tp: res.tp,
    rounds: res.rd.filter((r: number | null): r is number => r != null && r > 0).length,
    nholes: inferNholes((res as any).nholes, (res as any).ageGroup),
    field: t.field,
    pos: typeof res.p === "number" ? res.p : null,
  }));

  const evoManuelData = !isManuel ? (() => {
    const manTournResults = manuelMerged ? (() => {
      const hidden = hiddenTids(manuelMerged);
      return Object.entries(manuelMerged.r)
        .filter(([tid]) => !hidden.has(tid))
        .map(([tid, res]) => {
          const info = getTournInfo(tid);
          const tDef = T.find(t => t.id === tid);
          return {
            id: tid, short: info.short,
            dateExact: info.dateExact ?? info.date,
            tp: res.tp,
            rounds: (res.rd || []).filter((r: number | null): r is number => r != null && r > 0).length,
            nholes: inferNholes((res as any).nholes, (res as any).ageGroup),
            field: tDef?.field ?? AUTO_TOURN_META[tid]?.field ?? 0,
            pos: typeof res.p === "number" ? res.p : null,
          };
        });
    })() : [];
    return manTournResults;
  })() : [];

  // ── Torneios recorrentes ───────────────────────────────────────────────────
  const torneiosRecorrentes = useMemo(() => {
    const map = new Map<string, { year: number; pos: number | null; tp: number | null; ageGroup: string | null }[]>();
    for (const { t, res, ageGroup } of tournResults) {
      const canon = tornCanonK(t.name.replace(/\s*\d{4}$/, "").replace(/\s*'\d{2}$/, ""));
      if (!map.has(canon)) map.set(canon, []);
      const yr = yearOf(t.dateExact, t.date);
      if (yr <= 0) continue;
      map.get(canon)!.push({ year: yr, pos: typeof res.p === "number" ? res.p : null, tp: res.tp, ageGroup });
    }
    return [...map.entries()]
      .map(([canon, entries]) => {
        const nameEntry = tournResults.find(x => tornCanonK(x.t.name.replace(/\s*\d{4}$/, "").replace(/\s*'\d{2}$/, "")) === canon);
        const name = nameEntry ? nameEntry.t.name.replace(/\s*\d{4}$/, "").replace(/\s*'\d{2}$/, "") : canon;
        // Dedup por (year, ageGroup) mantendo melhor resultado
        const dedupMap = new Map<string, typeof entries[0]>();
        for (const e of entries) {
          const k = `${e.year}|${e.ageGroup}`;
          const ex = dedupMap.get(k);
          if (!ex || (e.pos != null && (ex.pos == null || e.pos < ex.pos))) dedupMap.set(k, e);
        }
        const deduped = [...dedupMap.values()].sort((a, b) => a.year - b.year);
        return { canon, name, entries: deduped };
      })
      .filter(g => g.entries.length >= 2)
      .sort((a, b) => b.entries.length - a.entries.length);
  }, [tournResults]);

  // ── H2H detalhado ──────────────────────────────────────────────────────────
  const confrontosH2H = useMemo<{ tid: string; tornName: string; ageGroup: string | null; manPos: number; rivalPos: number; manTp: number | null; rivalTp: number | null; year: number; nRounds?: number }[]>(() => {
    if (!rival || isManuel) return [];
    const hidden = hiddenTids(rival);
    const manHidden = hiddenTids(manuelMerged ?? rival);
    return tournResults
      .filter(({ t, res }) => {
        if (hidden.has(t.id) || manHidden.has(t.id)) return false;
        const mRes = manuelMerged?.r[t.id];
        return typeof res.p === "number" && typeof mRes?.p === "number";
      })
      .map(({ t, res, ageGroup }) => {
        const mRes = manuelMerged!.r[t.id];
        // nRounds: usa a definição do torneio (T.rounds) ou o número real de rondas jogadas
        const nRounds = t.rounds ?? Math.max(res.rd?.length ?? 0, mRes.rd?.length ?? 0);
        return {
          tid: t.id, tornName: t.name, ageGroup,
          manPos:  mRes.p as number, rivalPos: res.p as number,
          manTp:   mRes.tp,          rivalTp:  res.tp,
          year:    yearOf(t.dateExact, t.date),
          nRounds: nRounds > 0 ? nRounds : undefined,
        };
      })
      .sort((a, b) => b.year - a.year);
  }, [tournResults, rival, manuelMerged, isManuel]);

  // All scorecards start closed — user expands manually
  // Double-check: nPlayed(rival) deve bater com playedDedup
  if (rival && import.meta.env.DEV && nPlayed(rival) !== playedDedup) {
    console.warn(`[RivaisIntl] count mismatch for ${rival.n}: nPlayed=${nPlayed(rival)} vs tournResults=${playedDedup}`);
  }

  const allRds = tournResults.flatMap(x => x.res.rd.filter((r: number | null): r is number => r != null && r > 0));
  const completedResults = tournResults.filter(x => x.res.tp != null);
  const bestTp = completedResults.length ? Math.min(...completedResults.map(x => x.res.tp!)) : null;
  const _bestRd = allRds.length ? Math.min(...allRds) : null;
  void _bestRd;
  const avgRd = allRds.length ? (allRds.reduce((a: number, b: number) => a + b, 0) / allRds.length) : null;

  // Collect all scores from any tournament with full scorecards for distribution
  const allCardScores: number[][] = [];
  const allCardPars: number[][] = [];
  if (bjgtCard) { allCardScores.push(...bjgtCard.rounds); bjgtCard.rounds.forEach(() => allCardPars.push([...VP_PAR])); }
  if (wjgcCard) { allCardScores.push(...wjgcCard.rds); wjgcCard.rds.forEach(() => allCardPars.push([...WJGC26_PAR])); }
  if (eowagr25Card) { allCardScores.push(...eowagr25Card.rds); eowagr25Card.rds.forEach(() => allCardPars.push([...EOWAGR25_PAR])); }
  if (wjgc26_1213Card) { allCardScores.push(...wjgc26_1213Card.rds); wjgc26_1213Card.rds.forEach(() => allCardPars.push([...WJGC26_1213_PAR])); }
  // Todos os auto-scorecards com par por buraco (evitar duplicar os que já foram incluídos acima)
  const dedupAutoTids = new Set(["brjgt25","wjgc26","eowagr25","wjgc26_1213"]);
  for (const sc of autoScorecards) {
    if (dedupAutoTids.has(sc.tid)) continue;  // já incluído via card dedicado
    dedupAutoTids.add(sc.tid);
    if (!sc.par || sc.par.length !== 18) continue;  // sem par por buraco → não conta para birdie %
    for (const rd of sc.rounds) {
      if (rd.length === 18 && rd.some(s => s > 0)) {
        allCardScores.push(rd);
        allCardPars.push(sc.par);
      }
    }
  }

  // BJGT 2025 special rendering (with field stats)
  const par = VP_PAR;
  const FH = FIELD_2025.holes;
  const frontPar = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const backPar = par.slice(9).reduce((a, b) => a + b, 0);
  const totalPar = frontPar + backPar;
  const sm = (arr: readonly number[], f: number, t: number) => arr.slice(f, t).reduce((a, b) => a + b, 0);

  const SubCell = ({ gross, parVal, cls }: { gross: number; parVal: number; cls: string }) => {
    const tp = gross - parVal;
    return <td className={`${cls} fw-700`}>{gross}<span className={`sc-topar ${toParClass(tp)}`}>{fmtSign(tp)}</span></td>;
  };
  const vpFrontM = VP_M.slice(0, 9).reduce((a, b) => a + b, 0);
  const vpBackM  = VP_M.slice(9).reduce((a, b) => a + b, 0);
  const vpTotalM = vpFrontM + vpBackM;

  const THead = () => (
    <thead><tr>
      <th className="hole-header ta-left">Buraco</th>
      {par.slice(0, 9).map((_, i) => <th key={i} className="hole-header">{i + 1}</th>)}
      <th className="hole-header col-out fs-10">Out</th>
      {par.slice(9).map((_, i) => <th key={i + 9} className="hole-header">{i + 10}</th>)}
      <th className="hole-header col-in fs-10">In</th>
      <th className="hole-header col-total">TOTAL</th>
    </tr></thead>
  );
  const MetrosRow = () => (
    <tr className="meta-row">
      <td className="row-label fs-10 c-text-3">m</td>
      {VP_M.slice(0, 9).map((m, i) => <td key={i} className="fs-10 c-text-3">{m}</td>)}
      <td className="col-out c-text-3">{vpFrontM}</td>
      {VP_M.slice(9).map((m, i) => <td key={i + 9} className="fs-10 c-text-3">{m}</td>)}
      <td className="col-in c-text-3">{vpBackM}</td>
      <td className="col-total fs-10 c-text-3">{vpTotalM}</td>
    </tr>
  );
  const SIRow = () => (
    <tr className="meta-row">
      <td className="row-label fs-10">SI</td>
      {VP_SI.slice(0, 9).map((s, i) => <td key={i}>{s}</td>)}
      <td className="col-out" />
      {VP_SI.slice(9).map((s, i) => <td key={i + 9}>{s}</td>)}
      <td className="col-in" /><td className="col-total" />
    </tr>
  );
  const ParRow = ({ sep }: { sep?: boolean }) => (
    <tr className={sep ? "sep-row" : "meta-row"}>
      <td className="row-label par-label">Par</td>
      {par.slice(0, 9).map((p, i) => <td key={i}>{p}</td>)}
      <td className="col-out fw-600">{frontPar}</td>
      {par.slice(9).map((p, i) => <td key={i + 9}>{p}</td>)}
      <td className="col-in fw-600">{backPar}</td>
      <td className="col-total">{totalPar}</td>
    </tr>
  );
  const GrossRow = ({ holes, label }: { holes: number[]; label: string }) => {
    const front = sm(holes, 0, 9), back = sm(holes, 9, 18), total = front + back;
    return (
      <tr>
        <td className="row-label fw-700">{label}</td>
        {holes.slice(0, 9).map((g, i) => <td key={i}><span className={`sc-score ${scClass(g, par[i])}`}>{g}</span></td>)}
        <SubCell gross={front} parVal={frontPar} cls="col-out" />
        {holes.slice(9).map((g, i) => <td key={i + 9}><span className={`sc-score ${scClass(g, par[i + 9])}`}>{g}</span></td>)}
        <SubCell gross={back} parVal={backPar} cls="col-in" />
        <SubCell gross={total} parVal={totalPar} cls="col-total" />
      </tr>
    );
  };
  const FieldAvgRow = () => (
    <tr className="meta-row">
      <td className="row-label c-muted fs-10 fw-400">Avg Field</td>
      {FH.map((h, i) => (
        <React.Fragment key={i}>
          <td className="fs-10 c-muted">{h.fAvg.toFixed(1)}</td>
          {i === 8 && <td className="col-out c-muted">{FH.slice(0, 9).reduce((a, x) => a + x.fAvg, 0).toFixed(1)}</td>}
        </React.Fragment>
      ))}
      <td className="col-in c-muted">{FH.slice(9).reduce((a, x) => a + x.fAvg, 0).toFixed(1)}</td>
      <td className="col-total fs-10 c-muted">{FH.reduce((a, x) => a + x.fAvg, 0).toFixed(1)}</td>
    </tr>
  );
  const VsFieldRow = ({ holes }: { holes: number[] }) => (
    <tr className="meta-row">
      <td className="row-label c-muted fs-10 fw-400">vs Field</td>
      {holes.map((g, i) => {
        const diff = g - FH[i].fAvg;
        const col = diff <= -0.5 ? "var(--color-good)" : diff >= 0.5 ? "var(--color-danger)" : "var(--text-muted)";
        return (
          <React.Fragment key={i}>
            <td className="fs-10 fw-600" style={{ color: col }}>{fmtSign(diff, 1)}</td>
            {i === 8 && <td className="col-out" />}
          </React.Fragment>
        );
      })}
      <td className="col-in" /><td className="col-total" />
    </tr>
  );


  // ── Helpers de data ──────────────────────────────────────────────
  const fmtDM = (dateExact?: string, fallback?: string): string => {
    if (dateExact) {
      const d = new Date(dateExact + "T12:00:00");
      return `${d.getDate()} ${MONTHS_PT_FULL[d.getMonth()]}`;
    }
    return fallback?.replace(/\s+\d{4}$/, "") ?? "";
  };

  // ── Palmarès ─────────────────────────────────────────────────────
  const palmares = React.useMemo(() =>
    tournResults.filter(x => x.res.p === 1)
      .sort((a, b) => (b.t.dateExact ?? b.t.date).localeCompare(a.t.dateExact ?? a.t.date)),
  [tournResults]);

  // ── Tier badge ───────────────────────────────────────────────────
  const tierBadge = React.useMemo(() => {
    if (!rival || isManuel || played === 0) return null;
    const wins = palmares.length;
    const ps = tournResults.filter(x => typeof x.res.p === "number").map(x => x.res.p as number);
    const avgPos = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
    if (wins >= 3 && avgPos != null && avgPos <= 4)  return { label: "Elite",         icon: "🏆", cls: "seg-eagle"  };
    if (wins >= 1 && avgPos != null && avgPos <= 5)  return { label: "Top Contender", icon: "⭐", cls: "seg-birdie" };
    if (avgPos != null && avgPos <= 8 && played >= 5) return { label: "Forte",        icon: "🎯", cls: "seg-par"   };
    if (played >= 20)                                return { label: "Assíduo",       icon: "🔁", cls: "seg-bogey" };
    return null;
  }, [rival, isManuel, played, palmares, tournResults]);

  // ── H2H data ─────────────────────────────────────────────────────
  // Perspectiva MANUEL — alinhada com sidebar (h2hMap) e tabela H2HTable.
  // V = vitórias do Manuel (manPos < rivalPos = Manuel finished better)
  // D = derrotas do Manuel (manPos > rivalPos)
  const h2hData = React.useMemo(() => {
    if (!rival || isManuel || !confrontosH2H.length) return null;
    const w = confrontosH2H.filter(c => c.manPos < c.rivalPos).length;
    const l = confrontosH2H.filter(c => c.manPos > c.rivalPos).length;
    return {
      tids: confrontosH2H.map(c => c.tid),
      wins: w, losses: l, draws: confrontosH2H.length - w - l,
    };
  }, [rival, isManuel, confrontosH2H]);

  // ── Scoring block ─────────────────────────────────────────────────
  const scoringBlock = React.useMemo(() => {
    let e=0,b=0,p=0,bo=0,d=0,w=0,tot=0,upr=0;
    const bp: Record<number,{sum:number;n:number;under:number}> = {3:{sum:0,n:0,under:0},4:{sum:0,n:0,under:0},5:{sum:0,n:0,under:0}};
    const ps = playerScoringStats;
    if (ps) {
      e=ps.e; b=ps.b; p=ps.p; bo=ps.bo; d=ps.d; w=ps.w; tot=ps.tot; upr=ps.upr;
      for (const pp of [3,4,5] as const) {
        const bpe = ps.bp?.[pp];
        if (bpe) bp[pp] = { sum: bpe.avg*bpe.n, n: bpe.n, under: bpe.under };
      }
    } else {
      for (let k=0;k<allCardScores.length;k++) {
        const sc=allCardScores[k], par=allCardPars[k];
        for (let i=0;i<18;i++) {
          const dv=sc[i]-par[i];
          if(dv<=-2)e++; else if(dv===-1)b++; else if(dv===0)p++; else if(dv===1)bo++; else if(dv===2)d++; else w++;
          const pp=par[i] as 3|4|5;
          if(pp===3||pp===4||pp===5){bp[pp].sum+=sc[i];bp[pp].n++;if(dv<0)bp[pp].under++;}
        }
        const gt=sc.reduce((a,v)=>a+v,0),pt=par.reduce((a,v)=>a+v,0);
        if(gt<pt)upr++;
      }
      tot=allCardScores.length*18;
    }
    return { e,b,p,bo,d,w,tot,upr,n:ps?.n??allCardScores.length,bp };
  }, [playerScoringStats, allCardScores, allCardPars]);

  // ── Std dev rondas ───────────────────────────────────────────────
  const rdStdDev = allRds.length > 1
    ? Math.sqrt(allRds.reduce((s,r)=>s+(r-avgRd!)*(r-avgRd!),0)/(allRds.length-1))
    : null;

  // ── DOB ──────────────────────────────────────────────────────────
  const dobInfo = React.useMemo(() => rival ? computeDobInfo(rival, mhPlayer) : null, [rival, mhPlayer]);

  // ── Todos os hooks foram chamados — safe para early return ────────
  if (!rival && !lbEntry) return (
    <DetailHeader>
      <div className="muted">
        {/^\d+$/.test(playerName)
          ? "⏳ A identificar jogador…"
          : !rivalsLoaded
            // Pipeline ainda a carregar — pode aparecer dados a meio do load
            ? `⏳ A carregar dados de ${playerName}…`
            : `Sem dados para ${playerName}`}
      </div>
    </DetailHeader>
  );

  return (
    <>
      {/* ══ HERO CARD ══ */}
      <div className="card" style={{ marginBottom: 12, padding: 0, overflow: "hidden", border: "1.5px solid var(--border-light)" }}>

        {/* Faixa de identidade */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "20px 22px 16px", borderBottom: "1px solid var(--border-light)" }}>

          {/* Flag grande */}
          <div className="shrink-0" style={{ fontSize: 56, lineHeight: 1, marginTop: 2 }}>{flag}</div>

          {/* Nome + pills + palmarès inline */}
          <div className="flex-1" style={{ minWidth: 0 }}>
            <div className="flex-wrap mb-8" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: "var(--text)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                {playerName}
              </div>
              {/* Nome RFEG completo (entre parêntesis) quando difere */}
              {rival && (rival as any).esFullName && (
                <span className="fs-12 fw-500" style={{ color: "var(--text-2)", fontStyle: "italic" }}
                  title="Nome completo na federação espanhola">
                  ({(rival as any).esFullName})
                </span>
              )}
              {/* Player type badge (getPlayerType) */}
              {playerType && (
                <span className="fs-12 fw-800 shrink-0" style={{ padding: "3px 10px", borderRadius: 20, background: playerType.bg, color: playerType.fg, letterSpacing: "0.02em" }}>
                  {playerType.label}
                </span>
              )}
              {/* Scoring tier badge (se não há playerType) */}
              {!playerType && tierBadge && (
                <span style={{ fontSize: "var(--fs-12)", fontWeight: 800, padding: "3px 10px", borderRadius: 20,
                  background: tierBadge.cls === "seg-eagle" ? "var(--score-eagle)"
                    : tierBadge.cls === "seg-birdie" ? "var(--medal-gold)"
                    : tierBadge.cls === "seg-par" ? "var(--color-good-dark)"
                    : "var(--text-dark)",
                  color: "#fff", letterSpacing: "0.02em", flexShrink: 0 }}>
                  {tierBadge.icon} {tierBadge.label}
                </span>
              )}
            </div>

            {/* Pills: país · trend · DOB · rank · ano activo */}
            <div className="flex-wrap mb-8" style={{ display: "flex", gap: 5, alignItems: "center" }}>
              {rival && <span className="p p-sm p-muted fs-12" >{rival.co}</span>}
              {/* Identidade USKids (memberID + link para último torneio no signupanytime).
                  Nota: signupanytime não expõe perfil HTML público por memberID
                  (v=memberresults&m=... devolve "JSON_DATA is null"). O melhor que
                  conseguimos linkar é o leaderboard do torneio mais recente onde o
                  jogador apareceu — daí descobrir-se o resto da carreira manualmente. */}
              {mhPlayer?.memberId && (() => {
                const parseDate = (s?: string): string => {
                  if (!s) return "0000-00-00";
                  const p = s.split("/");
                  return p.length === 3
                    ? `${p[2]}-${p[0].padStart(2,"0")}-${p[1].padStart(2,"0")}`
                    : s;
                };
                const recent = Object.entries(mhPlayer.torneios || {})
                  .map(([tcode, t]) => ({ tcode, d: parseDate(t.startDate) }))
                  .filter(x => /^\d+$/.test(x.tcode) && x.d !== "0000-00-00")
                  .sort((a, b) => b.d.localeCompare(a.d))[0];
                const baseStyle = { background: "var(--bg-warn-orange)", color: "var(--color-warn-dark)", border: "1px solid var(--border-warn)", fontWeight: 600, textDecoration: "none" };
                if (!recent) {
                  return (
                    <span className="p p-sm fs-11"
                      title={`USKids memberID ${mhPlayer.memberId}`}
                      style={baseStyle}>
                      ⛳ USKids #{mhPlayer.memberId}
                    </span>
                  );
                }
                return (
                  <a
                    href={`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${recent.tcode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p p-sm fs-11"
                    title={`USKids memberID ${mhPlayer.memberId} — abrir leaderboard do torneio mais recente (t=${recent.tcode})`}
                    style={baseStyle}
                  >
                    ⛳ USKids #{mhPlayer.memberId} ↗
                  </a>
                );
              })()}
              {/* Identidade FPG (nfed + clube PT) */}
              {rival && (rival as any).ptFed && (
                <span className="p p-sm p-club fs-11" title={`FPG nfed ${(rival as any).ptFed}`}
                  style={{ background: "var(--bg-portugal-pale, #fff5f5)", color: "var(--color-portugal, #c41e3a)", border: "1px solid var(--color-portugal-light, #f5b8c0)" }}>
                  🇵🇹 {(rival as any).ptFed}
                </span>
              )}
              {/* Identidade RFEG/Espanha (licença + clube ES) */}
              {rival && !isManuel && (rival as any).esLicencia && (
                <span className="p p-sm p-club fs-11" title="Licença RFEG"
                  style={{ background: "var(--bg-warn-light)", color: "var(--color-warn-dark)", border: "1px solid var(--border-warn)" }}>
                  🇪🇸 {(rival as any).esLicencia}
                </span>
              )}
              {/* Clube FPG (já tem cor distinta) */}
              {rival && (rival as any).fpgClub && rival.co === "Portugal" && (
                <span className="p p-sm p-club fs-11" title="Clube FPG">
                  🏌️ {(rival as any).fpgClub}
                </span>
              )}
              {/* Clube ES — só renderiza se for diferente do FPG (evita duplicado) */}
              {rival && !isManuel && (rival as any).esClub && (rival as any).esClub !== (rival as any).fpgClub && (
                <span className="p p-sm p-club fs-11" title="Clube espanhol">
                  🏌️ {(rival as any).esClub}
                </span>
              )}
              {/* Comunidade Autónoma (RFEG) — inferida do clube */}
              {rival && !isManuel && (rival as any).esRegion && (
                <span className="p p-sm fs-11" title="Comunidade Autónoma"
                  style={{ background: "var(--bg-warn-strong)", color: "var(--color-warn-dark)", border: "1px solid #fcd34d" }}>
                  📍 {(rival as any).esRegion}
                </span>
              )}
              {/* Categoria oficial RFEG (Benjamín/Alevín/Infantil/Cadete/Junior/Juvenil) */}
              {rival && !isManuel && (rival as any).esCatEdad && (
                <span className="p p-sm fs-11" title="Categoria RFEG"
                  style={{ background: "var(--bg-info-strong)", color: "var(--color-info)", border: "1px solid #93c5fd", fontWeight: 600 }}>
                  {(rival as any).esCatEdad}
                </span>
              )}
              {/* Escalão internacional Sub-N (calculado da idade ou catEdad) */}
              {rival && (() => {
                const sub = escalaoIntl(rival);
                if (!sub) return null;
                return (
                  <span className="p p-sm fs-11" title="Escalão internacional"
                    style={{ background: "var(--bg-purple)", color: "var(--text-purple)", border: "1px solid var(--border-purple)", fontWeight: 600 }}>
                    {sub}
                  </span>
                );
              })()}
              {/* Sexo (M/F) com cor — usa SexBadge para coerência global */}
              {rival && !isManuel && (rival as any).esSex && (
                <SexBadge sex={(rival as any).esSex} />
              )}
              {/* HCP exacto RFEG */}
              {rival && !isManuel && typeof (rival as any).esHcp === "number" && (
                <span className="p p-sm fs-11" title={(rival as any).esHcpDate ? `HCP em ${(rival as any).esHcpDate}` : "HCP RFEG"}
                  style={{ background: "var(--bg-success)", color: "var(--color-good-dark)", border: "1px solid var(--border-success)", fontWeight: 700 }}>
                  HCP {(rival as any).esHcp.toFixed(1)}
                </span>
              )}
              {/* Identidade FFG/França — license + clube + região */}
              {rival && !isManuel && (rival as any).frFed && (
                <span className="p p-sm p-club fs-11" title="Licença FFGolf"
                  style={{ background: "var(--bg-info)", color: "var(--color-info)", border: "1px solid #93c5fd" }}>
                  🇫🇷 {(rival as any).frFed}
                </span>
              )}
              {rival && !isManuel && (rival as any).frClub && (
                <span className="p p-sm p-club fs-11" title="Clube FFG">
                  🏌️ {(rival as any).frClub}
                </span>
              )}
              {rival && !isManuel && (rival as any).frRegion && (
                <span className="p p-sm fs-11" title="Région FFGolf"
                  style={{ background: "var(--bg-warn-strong)", color: "var(--color-warn-dark)", border: "1px solid #fcd34d" }}>
                  📍 {(rival as any).frRegion}
                </span>
              )}
              {rival && !isManuel && (rival as any).frSex && !((rival as any).esSex) && (
                <SexBadge sex={(rival as any).frSex} />
              )}
              {rival && !isManuel && typeof (rival as any).frHcp === "number" && (
                <span className="p p-sm fs-11" title="HCP FFGolf"
                  style={{ background: "var(--bg-success)", color: "var(--color-good-dark)", border: "1px solid var(--border-success)", fontWeight: 700 }}>
                  HCP {(rival as any).frHcp.toFixed(1)}
                </span>
              )}
              {isManuel && <span className="p p-outline p-sm">REF</span>}
              {rank != null && (
                <span className={`sidebar-rank fs-11 ${rank <= 3 ? "sidebar-rank-top3" : rank <= 10 ? "sidebar-rank-top10" : "sidebar-rank-rest"}`}
                  style={{ padding: "2px 7px" }}>#{rank}/{totalRanked}</span>
              )}
              {tr && <span className="fs-13 fw-700" style={{ color: TR_I[tr as keyof typeof TR_I].c }}>{TR_I[tr as keyof typeof TR_I].i}</span>}
              {rival?.up.map(u => { const up = UP.find(x => x.id === u); return up ? <span key={u} className="p p-sm" style={{ background: "var(--bg-success-strong)", color: "var(--color-good-dark)", fontSize: "var(--fs-11)" }}>▲ {up.short}</span> : null; })}
              {dobInfo && (() => {
                if (!dobInfo.exact && dobInfo.rangeStr === "?") return null;
                const pillStyle = { background: "var(--bg-info)", color: "var(--color-info)", fontWeight: 700, fontSize: "var(--fs-12)" };
                if (dobInfo.exact) return (
                  <>
                    <span className="p p-sm" style={pillStyle}>🎂 {dobInfo.ageStr}</span>
                    {dobInfo.nextBdayDays != null && (
                      <span className="p p-sm" style={{ ...pillStyle, background: "var(--bg-warn)" }}>
                        faz {dobInfo.nextAge} em {dobInfo.nextBdayDays}d
                      </span>
                    )}
                    <span className="p p-sm" style={{ ...pillStyle, fontWeight: 500 }}>{dobInfo.dobStr}</span>
                  </>
                );
                const days = dobInfo.rangeMin && dobInfo.rangeMax ? Math.round((dobInfo.rangeMax.getTime() - dobInfo.rangeMin.getTime()) / 86400000) : 999;
                return (
                  <>
                    <span className="p p-sm" style={pillStyle}>{days <= 60 ? "🎯" : "📅"} {dobInfo.ageStr}</span>
                    <span className="p p-sm" style={{ ...pillStyle, fontWeight: 500 }}>~{dobInfo.rangeStr}</span>
                  </>
                );
              })()}
            </div>

            {/* Palmarès compacto inline */}
            {palmares.length > 0 && (
              <div className="gap-4 flex-wrap" style={{ display: "flex", alignItems: "flex-start" }}>
                {palmares.slice(0, 5).map(({ t, res }) => {
                  const ag = (res as any).ageGroup as string | null;
                  const mdl2 = typeof res.p === "number" ? (medal(res.p) ?? "🥉") : "🥉";
                  const bg = res.p === 1 ? "var(--medal-gold-bg)" : res.p === 2 ? "var(--medal-silver-bg)" : "var(--medal-bronze-bg)";
                  const border = res.p === 1 ? "var(--medal-gold)" : res.p === 2 ? "var(--medal-silver)" : "var(--medal-bronze)";
                  const shortName = t.name.replace(/\s*\d{4}$/, "").replace(/\s*'\d{2}$/, "");
                  return (
                    <div key={t.id} title={`${t.name} ${yearOf(t.dateExact, t.date)}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 7px",
                        borderRadius: 6, background: bg, border: `1px solid ${border}`, flexShrink: 0 }}>
                      <span className="fs-13">{mdl2}</span>
                      <div style={{ lineHeight: 1.2 }}>
                        <div style={{ fontSize: "var(--fs-10)", fontWeight: 700, color: "var(--color-warn-dark)", maxWidth: 90,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName}</div>
                        <div style={{ fontSize: "var(--fs-9)", color: "var(--text-3)" }}>
                          {yearOf(t.dateExact, t.date)}{ag ? ` · ${ag}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {palmares.length > 5 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px",
                    borderRadius: 6, background: "var(--bg-warn-strong)", border: "1px solid var(--medal-gold)" }}>
                    <span style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--color-warn-dark)" }}>+{palmares.length - 5}</span>
                    <span className="fs-11">🏆</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* V/E/D vs Manuel — caixas coloridas */}
          {h2hData && !isManuel && (
            <div className="shrink-0 ta-c">
              <div style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--text-3)", marginBottom: 6,
                textTransform: "uppercase", letterSpacing: "0.06em" }}>vs Manuel</div>
              <div style={{ display: "flex", gap: 5, marginBottom: 5 }}>
                {([
                  { n: h2hData.wins,   bg: "var(--bg-success-strong)", co: "var(--color-good-dark)", l: "V" },
                  { n: h2hData.draws,  bg: "var(--bg-muted)",          co: "var(--text-2)",          l: "E" },
                  { n: h2hData.losses, bg: "var(--bg-danger-strong)",  co: "var(--color-danger-vivid)", l: "D" },
                ] as const).map(({ n, bg, co, l }) => (
                  <div key={l} className="ta-c" style={{ minWidth: 46, padding: "10px 6px", background: bg, borderRadius: 10 }}>
                    <div className="fw-900" style={{ fontSize: "var(--fs-28)", color: co, lineHeight: 1 }}>{n}</div>
                    <div className="fs-11 fw-700" style={{ color: co, marginTop: 2, opacity: .75 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
                {h2hData.tids.length} confronto{h2hData.tids.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </div>

        {/* KPI grid — separados por bordas, sem rounded cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
          {[
            { v: String(playedDedup),                                                      l: "torneios",      accent: false,                           sub: roundsDedup > 0 ? `${roundsDedup} rondas` : null },
            palmares.length > 0 ? { v: `${palmares.length}`, l: "vitórias 🥇",            accent: true,                                                sub: null } : null,
            bestTp != null ? { v: fmtToPar(bestTp),           l: "melhor ±par",            accent: bestTp < 0,  sub: null } : null,
            avgRd != null  ? { v: avgRd.toFixed(1),            l: "média ronda",            accent: false,       sub: rdStdDev != null ? `σ ${rdStdDev.toFixed(1)}` : null } : null,
            scoringBlock.n > 0 ? { v: `${Math.round(scoringBlock.upr / scoringBlock.n * 100)}%`, l: "sub-par rondas", accent: scoringBlock.upr / scoringBlock.n > 0.3, sub: `${scoringBlock.upr}/${scoringBlock.n}` } : null,
          ].filter(Boolean).map((item, i, arr) => {
            const { v, l, accent, sub } = item!;
            return (
              <div key={l} style={{ padding: "14px 10px", textAlign: "center",
                borderRight: i < arr.length - 1 ? "1px solid var(--border-light)" : "none",
                borderTop: "1px solid var(--border-light)" }}>
                <div style={{ fontSize: "var(--fs-24)", fontWeight: 900, lineHeight: 1,
                  color: accent ? "var(--color-good-dark)" : "var(--text)" }}>{v}</div>
                {sub && <div style={{ fontSize: "var(--fs-11)", color: "var(--text-3)", marginTop: 2 }}>{sub}</div>}
                <div style={{ fontSize: "var(--fs-12)", color: "var(--text-3)", marginTop: 5, fontWeight: 500 }}>{l}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══ GRÁFICO DE EVOLUÇÃO ══ */}
      {evoRivalData.filter(d => d.tp != null && d.rounds > 0).length >= 2 && (
        <div className="card mb-12"  >
          <EvolucaoChart tournResults={evoRivalData} manuelResults={evoManuelData} />
        </div>
      )}

      {/* ══ PALMARÈS ══ */}
      {palmares.length > 0 && (
        <div className="card mb-12"  >
          <div className="h-sm mb-8" style={{ color: "var(--text-2)" }}>🥇 Palmarès · {palmares.length} {palmares.length===1?"vitória":"vitórias"}</div>
          <div className="gap-8" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))" }}>
            {palmares.map(({ t, res }) => {
              const mPos = manuelMerged?.r[t.id]?.p;
              const bateuManuel = mPos!=null && typeof mPos==="number" && typeof res.p==="number" && res.p < mPos;
              const ag = (res as any).ageGroup as string|null;
              const agNum = parseInt((ag?.match(/\d+/)??[])[0]??"0");
              const agCls = agNum<=10?"p-sub10":agNum<=12?"p-sub12":agNum<=14?"p-sub14":"p-sub18";
              return (
                <div key={t.id} style={{ border: "1.5px solid var(--medal-gold,var(--color-warn))", borderRadius: 8, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center" }}>
                  <span className="shrink-0" style={{ fontSize: "var(--fs-32)", lineHeight: 1 }}>🥇</span>
                  <div>
                    <div className="fs-13 fw-600">{t.name}</div>
                    <div style={{ fontSize: "var(--fs-11)", color: "var(--text-2)", marginTop: 2 }}>
                      {fmtDM(t.dateExact, t.date)}
                      {ag && <span className={`p p-sm ${agCls}`} style={{ marginLeft: 5 }}>{ag}</span>}
                      {t.field>0 && <span style={{ marginLeft: 5, color: "var(--text-3)" }}>· {t.field>15?"⭐ ":""}{t.field} jog.</span>}
                    </div>
                    {res.tp!=null && <div style={{ fontSize: "var(--fs-12)", fontWeight: 600, color: "var(--color-good-dark)", marginTop: 2 }}>{fmtToPar(res.tp)} ±par</div>}
                    {bateuManuel && <div style={{ fontSize: "var(--fs-10)", color: "var(--medal-gold,var(--color-warn))", marginTop: 2 }}>⚔️ ganhou ao Manuel (#{mPos})</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ TORNEIOS RECORRENTES ══ */}
      <TorneiosRecorrentes groups={torneiosRecorrentes} />

      {/* ══ SCORING DISTRIBUTION ══ */}
      {scoringBlock.tot > 0 && (() => {
        const segs = [
          { key:"eagle",  n:scoringBlock.e,  cls:"seg-eagle",  label:"Eagle+", circle:true  },
          { key:"birdie", n:scoringBlock.b,  cls:"seg-birdie", label:"Birdie",  circle:true  },
          { key:"par",    n:scoringBlock.p,  cls:"seg-par",    label:"Par",     circle:false },
          { key:"bogey",  n:scoringBlock.bo, cls:"seg-bogey",  label:"Bogey",   circle:false },
          { key:"double", n:scoringBlock.d,  cls:"seg-double", label:"Duplo",   circle:false },
          { key:"triple", n:scoringBlock.w,  cls:"seg-triple", label:"Triple+", circle:false },
        ].filter(s=>s.n>0);
        const tot = scoringBlock.tot;
        const parAvgs = ([3,4,5] as const).map(pp=>({
          pp, n:scoringBlock.bp[pp].n,
          avg:scoringBlock.bp[pp].n?scoringBlock.bp[pp].sum/scoringBlock.bp[pp].n:null,
          under:scoringBlock.bp[pp].under,
        })).filter(x=>x.n>0);
        return (
          <div className="card mb-12"  >
            <div style={{ fontSize: "var(--fs-10)", fontWeight: 600, color: "var(--text-3)", marginBottom: 6 }}>
              Distribuição de scoring · {tot} buracos
            </div>
            {/* Barra — par é branco/transparente */}
            <div style={{ display: "flex", height: 16, borderRadius: 4, overflow: "hidden", gap: 1, marginBottom: 6, background: "var(--bg)" }}>
              {segs.map(s => (
                <div key={s.key} className={s.key==="par"?"":""+s.cls}
                  style={{ flex: s.n, minWidth: 2, background: s.key==="par"?"#fff":undefined }}
                  title={`${s.label}: ${(s.n/tot*100).toFixed(0)}%`} />
              ))}
            </div>
            {/* Legenda */}
            <div style={{ display: "flex", gap: "5px 12px", flexWrap: "wrap", marginBottom: parAvgs.length>0?10:0 }}>
              {segs.map(s => (
                <span key={s.key} style={{ fontSize: "var(--fs-10)", color: "var(--text-2)", display: "flex", alignItems: "center", gap: 4 }}>
                  <span className={s.key==="par"?"":s.cls}
                    style={{ width:8, height:8, display:"inline-block", flexShrink:0,
                      borderRadius: s.circle?"50%":2,
                      background: s.key==="par"?"#fff":undefined,
                      border: s.key==="par"?"1px solid var(--border)":undefined }} />
                  {s.label} {(s.n/tot*100).toFixed(0)}%
                  <span style={{ color:"var(--text-3)", fontSize: "var(--fs-9)" }}>({s.n})</span>
                </span>
              ))}
            </div>
            {/* Par 3 / 4 / 5 */}
            {parAvgs.length>0 && (
              <div className="gap-8 flex-wrap" style={{ display: "flex" }}>
                {parAvgs.map(({ pp, avg, n, under }) => {
                  const diff = avg!=null?avg-pp:null;
                  const col = diff==null?"var(--text-3)":diff<0?"var(--color-good-dark)":diff<0.3?"var(--text-2)":"var(--color-warn)";
                  return (
                    <KpiCard key={pp} label={`Par ${pp}`} value={avg!=null?avg.toFixed(2):"—"} sub={`${Math.round(under/n*100)}% sub-par`} color={col} style={{ flex:"1 1 80px", padding:"6px 10px", minWidth:72 }} />
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ ANÁLISE ESTILO MASTERS ══ */}
      {autoScorecards.length > 0 && (
        <div className="card mb-12" >
          <div className="h-sm mb-8" style={{ color: "var(--text-2)" }}>
            📊 Análise · Scoring · Por ronda · F9 vs B9 · Por buraco
          </div>
          <AnaliseSection playerName={playerName} scorecards={autoScorecards} />
        </div>
      )}

      {/* ══ LISTA DE TORNEIOS ══ */}
      {tournResults.length > 0 && (() => {
        let lastYear = 0;
        return (
          <div className="card mb-12 overflow-hidden" >
            {tournResults.map(({ t, res, hasCard, autoCard, ageGroup }) => {
              const expanded    = expandedTourns.has(t.id);
              const pos         = typeof res.p==="number" ? res.p : null;
              const mdl3        = pos != null ? medal(pos) : null;
              const nholes      = inferNholes((res as any).nholes, ageGroup);
              const is9h        = nholes === 9;
              const tpDisplay   = res.tp!=null ? fmtToPar(res.tp) : null;
              const rds         = res.rd.filter((r:number|null):r is number => r!=null && r>0);
              const topPct      = pos!=null && t.field>0 ? Math.round(pos/t.field*100) : null;
              const manuelRes   = !isManuel ? manuelMerged?.r[t.id] : null;
              const manuelEsteve = manuelRes!=null;
              const manuelPos   = typeof manuelRes?.p==="number" ? manuelRes.p : null;
              const isLarge     = t.field>15;
              const thisYear    = yearOf(t.dateExact, t.date);
              const showYrSep   = thisYear>0 && thisYear!==lastYear;
              if (thisYear>0) lastYear = thisYear;
              const agNum = parseInt((ageGroup?.match(/\d+/)??[])[0]??"0");
              const agCls = agNum<=10?"p-sub10":agNum<=12?"p-sub12":agNum<=14?"p-sub14":"p-sub18";
              const wOrd  = getTournWeight(t.id);
              const stars = wOrd>=1.3?"★★★★★":wOrd>=1.1?"★★★★":wOrd>=0.9?"★★★":wOrd>=0.6?"★★":wOrd>=0.4?"★":null;

              return (
                <React.Fragment key={t.id}>
                  {/* Separador de ano */}
                  {showYrSep && (
                    <div style={{ padding:"4px 14px", fontSize: "var(--fs-11)", fontWeight:600, color:"var(--text-2)",
                      background:"var(--bg-muted)", borderBottom:"1px solid var(--border-light)",
                      borderTop: lastYear>0?"1px solid var(--border-light)":undefined }}>
                      {thisYear}
                    </div>
                  )}

                  {/* Linha do torneio */}
                  <div style={{ display:"grid", gridTemplateColumns:"40px 1fr auto auto auto auto",
                    alignItems:"center", gap:10, padding:"8px 14px",
                    borderBottom:expanded?"none":"1px solid var(--border-light)" }}>

                    {/* Col 1: medalha ou posição */}
                    <div className="ta-c">
                      {mdl3
                        ? <span style={{ fontSize: "var(--fs-18)", lineHeight:1 }}>{mdl3}</span>
                        : pos!=null
                          ? <span style={{ fontSize: "var(--fs-13)", fontWeight:700, color:"var(--text-2)" }}>#{pos}</span>
                          : <span style={{ fontSize: "var(--fs-12)", color:"var(--text-3)" }}>—</span>}
                    </div>

                    {/* Col 2: nome + pills + meta */}
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
                        <span style={{ fontWeight:600, fontSize: "var(--fs-13)" }}>{t.name}</span>
                        {/* Nº de rondas — pill do sistema global PillBadge */}
                        <RoundPill nR={rds.length} />
                        {/* Debug pill (?debug=1): mostra tid do torneio para diagnóstico */}
                        {debugMode && (
                          <span title={`tid: ${t.id}`} className="fs-10 shrink-0 overflow-hidden" style={{ fontFamily: "var(--font-mono)", padding: "1px 5px", borderRadius: 4, background: "var(--bg-warn-light)", color: "var(--color-warn-dark)", border: "1px solid var(--bg-warn-strong)", maxWidth: 200, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.id}
                          </span>
                        )}
                        {/* Links */}
                        {(() => {
                          const { signupanytimeUrl, uskidsUrl, fpgUrl, ffgolfUrl, lgsUrl, ncUrl } = getTournLinks(t.id, t.url);
                          const linkStyle: React.CSSProperties = {
                            display:"inline-flex", alignItems:"center", gap:2, fontSize: "var(--fs-10)",
                            fontWeight:600, textDecoration:"none", padding:"1px 5px",
                            borderRadius:4, lineHeight:1.2, flexShrink:0,
                          };
                          return (
                            <>
                              {signupanytimeUrl && (
                                <ExtLink href={signupanytimeUrl}
                                  onClick={e => e.stopPropagation()} title="Resultados (Signupanytime)"
                                  style={{ ...linkStyle, color:"var(--color-info-dark)", border:"1px solid var(--color-info-light)" }}>
                                  ↗ SAT
                                </ExtLink>
                              )}
                              {uskidsUrl && (
                                <ExtLink href={uskidsUrl}
                                  onClick={e => e.stopPropagation()} title="Ver resultados"
                                  style={{ ...linkStyle, color:"var(--accent)", border:"1px solid var(--accent)" }}>
                                  ↗ result
                                </ExtLink>
                              )}
                              {fpgUrl && (
                                <ExtLink href={fpgUrl}
                                  onClick={e => e.stopPropagation()} title="Classif. FPG"
                                  style={{ ...linkStyle, color:"var(--accent)", border:"1px solid var(--accent)" }}>
                                  ↗ FPG
                                </ExtLink>
                              )}
                              {ffgolfUrl && (
                                <ExtLink href={ffgolfUrl}
                                  onClick={e => e.stopPropagation()} title="Resultados FFGolf"
                                  style={{ ...linkStyle, color:"var(--accent)", border:"1px solid var(--accent)" }}>
                                  ↗ FFG
                                </ExtLink>
                              )}
                              {lgsUrl && (
                                <ExtLink href={lgsUrl}
                                  onClick={e => e.stopPropagation()} title="Clasificación LiveGolfScoring (RFEGolf)"
                                  style={{ ...linkStyle, color:"var(--accent)", border:"1px solid var(--accent)" }}>
                                  ↗ RFEG
                                </ExtLink>
                              )}
                              {ncUrl && (
                                <ExtLink href={ncUrl}
                                  onClick={e => e.stopPropagation()} title="Clasificación NextCaddy (RFGA Andaluzia / FGM Madrid)"
                                  style={{ ...linkStyle, color:"var(--accent)", border:"1px solid var(--accent)" }}>
                                  ↗ RFEG
                                </ExtLink>
                              )}
                              {(() => {
                                // Pill colorido SCRATCH/HANDICAP para torneios NC.
                                // Scratch (gross) = âmbar/amarelo; Handicap (net) = azul.
                                const sct = ncScoringType.get(t.id);
                                if (!sct) return null;
                                const isScratch = sct === "SCRATCH";
                                return (
                                  <span title={isScratch
                                      ? "Scratch — pontuação bruta (gross)"
                                      : "Handicap — pontuação líquida (net = gross − handicap)"}
                                    style={{
                                      ...linkStyle,
                                      cursor: "help",
                                      background: isScratch ? "var(--bg-warn-strong)" : "var(--bg-info-strong)",
                                      color: isScratch ? "var(--color-warn-dark)" : "var(--color-info)",
                                      border: `1px solid ${isScratch ? "var(--color-amber)" : "var(--color-info)"}`,
                                    }}>
                                    {isScratch ? "Scratch" : "Handicap"}
                                  </span>
                                );
                              })()}
                            </>
                          );
                        })()}
                        {manuelEsteve && !isManuel && (
                          <span style={{ background:"var(--bg-success-subtle)", color:"var(--color-good-dark)", border:"1px solid var(--border-success)",
                            fontSize: "var(--fs-9)", padding:"1px 5px", borderRadius:4, fontWeight:600 }}>★ M{manuelPos!=null?` #${manuelPos}`:""}</span>
                        )}
                      </div>
                      <div style={{ fontSize: "var(--fs-11)", color:"var(--text-2)", marginTop:1 }}>
                        {fmtDM(t.dateExact, t.date)}
                        {stars && ` · ${stars}`}
                        {t.field>0 && <> · {isLarge && "⭐ "}{t.field} jogadores</>}
                        {ageGroup && <></>}
                      </div>
                    </div>

                    {/* Col 3: escalão pill + 9H badge */}
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
                      {ageGroup && <span className={`p p-sm ${agCls}`}>{ageGroup}</span>}
                      {is9h && <span className="p p-sm" style={{ fontSize: "var(--fs-9)", background:"var(--color-info-dark)", color:"#fff", padding:"1px 4px" }}>9H</span>}
                    </div>

                    {/* Col 4: ±par total · se 9H mostra também equiv. 18H */}
                    <div style={{ textAlign:"right", minWidth:36 }}>
                      <div style={{ fontSize: "var(--fs-14)", fontWeight:700,
                        color: tpDisplay ? tpColorDark(res.tp) : "var(--text-3)" }}>
                        {tpDisplay ?? "—"}
                      </div>
                    </div>

                    {/* Col 5: top % */}
                    <div style={{ textAlign:"right", minWidth:52, fontSize: "var(--fs-12)", fontWeight:500,
                      color: topPct!=null && topPct<=15 ? "var(--color-good-dark)" : "var(--text-3)" }}>
                      {topPct!=null ? `top ${topPct}%` : ""}
                    </div>

                    {/* Col 6: Scorecard ▼ — span sem bordo, sem fundo */}
                    <div>
                      {hasCard && (
                        <span onClick={() => toggleExpand(t.id)}
                          style={{ fontSize: "var(--fs-8)", color:"var(--text-3)", cursor:"pointer", userSelect:"none" }}>
                          {expanded ? "Scorecard ▲" : "Scorecard ▼"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Scorecard expandido */}
                  {expanded && hasCard && (
                    <div style={{ padding:"0 8px 12px", borderBottom:"1px solid var(--border-light)", background:"var(--bg)" }}>
                      {t.id==="brjgt25" && bjgtCard && (
                        <div className="bjgt-chart-scroll">
                          <table className="sc-table-modern" data-sc-table="1">
                            <THead /><tbody>
                              <MetrosRow /><SIRow /><FieldAvgRow /><ParRow sep />
                              {bjgtCard.rounds.map((rd,i) => <GrossRow key={i} holes={rd as number[]} label={`R${i+1}`} />)}
                              <GrossRow holes={bjgtCard.ecl as number[]} label="ECL" />
                              <VsFieldRow holes={bjgtCard.ecl as number[]} />
                            </tbody>
                          </table>
                        </div>
                      )}
                      {t.id==="brjgt25" && !bjgtCard && autoCard && (
                        <TournScorecard
                          par={autoCard.par.length===18?autoCard.par as unknown as readonly number[]:VP_PAR as unknown as readonly number[]}
                          si={autoCard.si.length>0?autoCard.si as unknown as readonly number[]:VP_SI as unknown as readonly number[]}
                          meters={autoCard.meters.length>0?autoCard.meters as unknown as readonly number[]:VP_M as unknown as readonly number[]}
                          rounds={autoCard.rounds.map((sc: number[], i: number)=>({label:`R${i+1}`,scores:sc}))} />
                      )}
                      {t.id==="wjgc26" && wjgcCard && (
                        <TournScorecard par={WJGC26_PAR} si={WJGC26_SI} meters={WJGC26_M}
                          rounds={wjgcCard.rds.map((sc,i)=>({label:`R${i+1}`,scores:[...sc]}))} />
                      )}
                      {t.id==="eowagr25" && eowagr25Card && (
                        <TournScorecard par={EOWAGR25_PAR} si={EOWAGR25_SI} meters={EOWAGR25_M}
                          rounds={eowagr25Card.rds.map((sc,i)=>({label:`R${i+1}`,scores:[...sc]}))} />
                      )}
                      {t.id==="wjgc26_1213" && wjgc26_1213Card && (
                        <TournScorecard par={WJGC26_1213_PAR} si={WJGC26_1213_SI} meters={WJGC26_1213_M}
                          rounds={wjgc26_1213Card.rds.map((sc,i)=>({label:`R${i+1}`,scores:[...sc]}))} />
                      )}
                      {autoCard && (() => {
                        const METERS_FALLBACK: Record<string,readonly number[]> = {
                          "usk20175_b11":MS_USKIDS_M_B1011,"usk20175_b10":MS_USKIDS_M_B1011,
                          "usk21080_b11":MS_USKIDS_M_B1011,"usk21080_b10":MS_USKIDS_M_B1011,
                          "usk21080_b12":MS_USKIDS_M_B12,"usk21080_b9":MS_USKIDS_M_B1011,
                          "usk20175_b12":MS_USKIDS_M_B12,
                          "doral25_b1011":DORAL_GP_M_B1011,"doral25_b89":DORAL_GP_M_B1011,
                          "doral25_b1213":DORAL_SF_M_B1213,
                          "doral24_b1011":DORAL_GP_M_B1011,"doral24_b89":DORAL_GP_M_B1011,
                          "doral24_b1213":DORAL_SF_M_B1213,
                        };
                        const dedicated = ["brjgt25","wjgc26","eowagr25","wjgc26_1213"];
                        if (dedicated.includes(t.id) && (bjgtCard||wjgcCard||eowagr25Card||wjgc26_1213Card)) return null;
                        if (!autoCard.par||autoCard.par.length<9) return <div className="fs-11 c-text-3 p-10">— scorecard buraco-a-buraco não disponível</div>;
                        return (
                          <TournScorecard
                            par={autoCard.par as unknown as readonly number[]}
                            si={autoCard.si as unknown as readonly number[]}
                            meters={(METERS_FALLBACK[t.id]??autoCard.meters??[]) as unknown as readonly number[]}
                            rounds={autoCard.rounds.map((sc: number[], i: number)=>({label:`R${i+1}`,scores:sc}))}
                          />
                        );
                      })()}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        );
      })()}

      {/* ══ HEAD-TO-HEAD DETALHADO ══ */}
      {!isManuel && <H2HTable confrontos={confrontosH2H} playerName={playerName} />}

      {/* ══ HISTÓRICO USKIDS ══ */}
      {(() => {
        if (!mhPlayer) return null;
        const mhTorneiosAll = Object.entries(mhPlayer.torneios)
          .map(([tid,t]) => ({ tid, ...(t as MHTournament) }))
          .filter(t => Object.keys(t.rounds||{}).length>0)
          .sort((a,b) => (isoDate(b.startDate||"")||"").localeCompare(isoDate(a.startDate||"")||""));
        if (mhTorneiosAll.length===0) return null;
        return <MemberHistTable mhTorneios={mhTorneiosAll} memberId={mhPlayer.memberId} />;
      })()}

      {played===0 && !lbEntry && (
        <EmptyState size="sm" message="Sem resultados registados ainda." />
      )}
    </>
  );
});
