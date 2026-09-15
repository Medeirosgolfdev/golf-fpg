import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { RoundData, PlayerPageData, HcpInfo } from "../data/playerDataLoader";
import type {} from "../data/types";
import { useAppContext } from "../context/AppContext";
import { norm } from "../utils/format";
import {
  whsQtyCalc, hiAdjustment, addRoundToPool, historicExceptionalAdj, topRanks, topIds,
  scoreDifferential, sd18FromSd9, expectedSD9, round1, get9hRatings,
} from "../utils/whsCalc";
import { sdClassByHcp } from "../utils/scoreDisplay";
import { GrossCell } from "./tableCells";
import TeePill from "./TeePill";
import TeeDate from "./TeeDate";
import SexBadge from "./SexBadge";
import { CourseLink } from "./jogadoresHelpers";

/** CR/Slope/Par introduzidos à mão (strings — vêm dos inputs).
 *  Usado para pré-preencher o modo "Manual" do simulador a partir de outra
 *  parte da página (ex: os inputs de Modo Manual no topo do /simulador). */
export type ManualTee = { cr: string; slope: string; par: string };
export interface ManualDefaults {
  "18"?: ManualTee;
  front9?: ManualTee;
  back9?: ManualTee;
}

/** Volta enviada de fora para o simulador (ex: o scorecard do /simulador). */
export interface IncomingRound {
  /** Muda a cada pedido — é o que faz a volta entrar. */
  key: number;
  holesMode: "18" | "front9" | "back9";
  courseKey?: string;
  teeId?: string;
  cr: number;
  slope: number;
  par: number;
  /** Adjusted Gross. */
  gross?: number;
  /** SD já calculado (9 buracos: o SD9) — entra como ronda de SD directo. */
  sd?: number;
  /** PCC do dia (−1 a +3). */
  pcc?: number;
}

export interface RoundSimulatorProps {
  hcp: HcpInfo;
  whs20: (RoundData & { course: string })[];
  playerData: PlayerPageData;
  bare?: boolean;
  courseLookupFn?: (courseName: string) => string | null;
  /** Override do localStorage key. Usado em páginas sem `:fedId` no URL
   *  (ex: /simulador) para que as rondas simuladas persistam na mesma. */
  storageKey?: string;
  /** CR/Slope/Par a pré-preencher no modo "Manual" (por nº de buracos).
   *  No /simulador liga aos inputs de Modo Manual do topo — preencher em cima
   *  preenche automaticamente a ronda em baixo. */
  manualDefaults?: ManualDefaults;
  /** Volta a acrescentar (ex: a do scorecard da mesma página). */
  incomingRound?: IncomingRound;
}

export function RoundSimulator({
  hcp,
  whs20,
  playerData,
  bare,
  courseLookupFn: _courseLookupFn,
  storageKey: storageKeyProp,
  manualDefaults,
  incomingRound,
}: RoundSimulatorProps) {
  type HolesMode = "18" | "front9" | "back9";
  type SimRound = {
    id: string;
    mode: "sd" | "course" | "manual";
    holesMode: HolesMode;
    sdInput: string;
    courseKey: string;
    teeId: string;
    grossInput: string;
    /** Modo "manual": CR/Slope/Par introduzidos na própria ronda (vazio = usa
     *  o manualDefaults do holesMode actual). */
    crInput?: string;
    slopeInput?: string;
    parInput?: string;
    /** PCC do dia (−1 a +3) — só nas rondas de Campo e Manual. */
    pccInput?: string;
  };
  const is9hMode = (hm: HolesMode): hm is "front9" | "back9" =>
    hm === "front9" || hm === "back9";
  const holesLabel = (hm: HolesMode) =>
    hm === "front9" ? "Front 9" : hm === "back9" ? "Back 9" : "18 buracos";
  type PoolEntry = {
    eid: string;
    sd: number;
    adj: number;
    isSimulated: boolean;
    roundIdx: number;
    origRound?: RoundData & { course: string };
  };
  type RoundResult = {
    roundId: string;
    roundIdx: number;
    /** SD final (equivalente 18H) — é este que entra no pool */
    sd: number | null;
    /** SD de 9 buracos, antes de +expectedSD9(HI). null para rondas 18H. */
    sd9: number | null;
    /** Valor de expectedSD9 usado para conversão 9H→18H. null para rondas 18H. */
    exp9: number | null;
    sdInPool: number | null;
    exceptionalAdj: number;
    exceptionalDiff: number;
    hiBeforeRound: number;
    hiAfterRound: number;
    delta: number;
    entersTop: boolean;
    topRank: number | null;
    poolBefore: PoolEntry[];
    poolAfter: PoolEntry[];
    displaced: PoolEntry | null;
    courseName: string;
    teeLabel: string;
    holesMode: HolesMode;
    cr: number | null;
    slope: number | null;
    par: number | null;
    gross: number | null;
    valid: boolean;
  };

  const { simCourses: courses } = useAppContext();
  const { fedId: urlFedId } = useParams<{ fedId?: string }>();
  const currentHI = hcp.current;
  const nextIdRef = useRef(1);
  // Com o timestamp, um id novo nunca repete o de uma ronda carregada do localStorage.
  const newId = () => `sr_${Date.now().toString(36)}_${nextIdRef.current++}`;
  const storageKey = storageKeyProp ?? (urlFedId ? `sim_rounds_v2_${urlFedId}` : null);
  const [savedTs, setSavedTs] = useState<number | null>(null);
  // Tabela de impacto: por defeito mostra um intervalo focado à volta do par;
  // o utilizador pode expandir para o intervalo completo.
  const [impactFull, setImpactFull] = useState(false);

  // ── Sexo do jogador (para filtrar tees M/F) ──
  // Vem de CROSS_DATA indexado pelo fed actual. Normalizamos para "M"|"F"|null.
  const playerSex: "M" | "F" | null = useMemo(() => {
    const raw =
      playerData.CROSS_DATA?.[playerData.CURRENT_FED]?.sex;
    if (raw === "M" || raw === "F") return raw;
    return null;
  }, [playerData.CROSS_DATA, playerData.CURRENT_FED]);

  // ── Dados de campos ──
  const playedNormSet = useMemo(() => {
    const s = new Set<string>();
    playerData.DATA.forEach((c) => s.add(norm(c.course)));
    return s;
  }, [playerData]);

  const allRatedCourses = useMemo(() => {
    if (!courses?.length) return [];
    const valid = courses.filter((c) =>
      c.master.tees.some(
        (t) =>
          t.ratings.holes18?.courseRating != null &&
          t.ratings.holes18?.slopeRating != null
      )
    );
    const played = valid.filter((c) =>
      playedNormSet.has(norm(c.master.name))
    );
    const unplayed = valid.filter(
      (c) => !playedNormSet.has(norm(c.master.name))
    );
    unplayed.sort((a, b) => a.master.name.localeCompare(b.master.name));
    return [...played, ...unplayed];
  }, [courses, playedNormSet]);

  const defaultCourseKey = allRatedCourses[0]?.courseKey ?? "";

  // Migração dados antigos do localStorage: garantir holesMode="18" por default
  const normalizeSaved = (raw: unknown): SimRound[] | null => {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const out: SimRound[] = [];
    for (const r of raw) {
      if (!r || typeof r !== "object") continue;
      const rr = r as Partial<SimRound> & { holesMode?: unknown };
      out.push({
        id: String(rr.id ?? `sr_${Math.random().toString(36).slice(2, 8)}`),
        mode:
          rr.mode === "course" ? "course" : rr.mode === "manual" ? "manual" : "sd",
        holesMode:
          rr.holesMode === "front9" || rr.holesMode === "back9" ? rr.holesMode : "18",
        sdInput: typeof rr.sdInput === "string" ? rr.sdInput : "",
        courseKey: typeof rr.courseKey === "string" ? rr.courseKey : "",
        teeId: typeof rr.teeId === "string" ? rr.teeId : "",
        grossInput: typeof rr.grossInput === "string" ? rr.grossInput : "",
        crInput: typeof rr.crInput === "string" ? rr.crInput : "",
        slopeInput: typeof rr.slopeInput === "string" ? rr.slopeInput : "",
        parInput: typeof rr.parInput === "string" ? rr.parInput : "",
        pccInput: typeof rr.pccInput === "string" ? rr.pccInput : "",
      });
    }
    return out.length > 0 ? out : null;
  };

  // ── Estado das rondas — carregado do localStorage se existir ──
  const [rounds, setRounds] = useState<SimRound[]>(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          const norm = normalizeSaved(parsed);
          if (norm) return norm;
        }
      } catch {}
    }
    return [
      {
        id: "sr_0",
        mode: "sd",
        holesMode: "18",
        sdInput: "",
        courseKey: "",
        teeId: "",
        grossInput: "",
      },
    ];
  });

  // Actualizar courseKey default quando cursos carregam
  useEffect(() => {
    if (defaultCourseKey) {
      setRounds((prev) =>
        prev.map((r) =>
          r.courseKey ? r : { ...r, courseKey: defaultCourseKey }
        )
      );
    }
  }, [defaultCourseKey]);

  // ── Ajuste sistema ──
  const lowHI = hcp.lowHcp ?? null;

  // ── Pool inicial ──
  // Com os ajustes de resultados extraordinários que a FPG já aplicou à janela
  // (sem eles o HI calculado não bate com o oficial — ex: 24,9 vs 23,3).
  const initialPool = useMemo((): PoolEntry[] => {
    // Uma volta sem SD não conta — nunca entra como SD 0
    const base = whs20
      .map((r) => ({ r, sd: parseFloat(String(r.sd ?? "").replace(",", ".")), hi: r.hi != null ? Number(r.hi) : null }))
      .filter((b) => Number.isFinite(b.sd));
    const adj = historicExceptionalAdj(base);
    return base.map((b, i) => ({
      eid: b.r.scoreId,
      sd: b.sd,
      adj: adj[i],
      isSimulated: false,
      roundIdx: -1,
      origRound: b.r,
    }));
  }, [whs20]);

  const totalAdjustment = useMemo(
    () => (currentHI == null ? 0 : hiAdjustment(initialPool, currentHI, lowHI)),
    [initialPool, currentHI, lowHI]
  );

  // ── Helpers campos/tees ──
  function getValidTees(
    courseKey: string,
    holesMode: HolesMode = "18"
  ): any[] {
    const c = allRatedCourses.find((x) => x.courseKey === courseKey);
    if (!c) return [];
    // 1) Filtrar por disponibilidade de ratings (18H ou 9H conforme holesMode)
    const ratingValid = c.master.tees.filter((t) => {
      if (is9hMode(holesMode)) {
        return get9hRatings(t, holesMode) !== null;
      }
      return (
        t.ratings.holes18?.courseRating != null &&
        t.ratings.holes18?.slopeRating != null
      );
    });
    // 2) Filtrar pelo sexo do jogador. Se o jogador é M/F, só tees desse sexo;
    //    se não conseguimos determinar o sexo, não filtramos.
    if (playerSex === "M" || playerSex === "F") {
      const bySex = ratingValid.filter((t) => t.sex === playerSex);
      // Fallback: se não há tees do sexo do jogador (caso raro — campo só
      // com um sexo), mostramos todos os que têm ratings para não deixar
      // o utilizador bloqueado.
      if (bySex.length > 0) return bySex as any[];
    }
    return ratingValid as any[];
  }

  function getEffectiveTeeId(r: SimRound): string {
    const valid = getValidTees(r.courseKey, r.holesMode);
    if (r.teeId && valid.some((t) => t.teeId === r.teeId)) return r.teeId;
    return valid[0]?.teeId || "";
  }

  function getTeeRatings(
    courseKey: string,
    teeId: string,
    holesMode: HolesMode = "18"
  ) {
    const c = allRatedCourses.find((x) => x.courseKey === courseKey);
    const tees = getValidTees(courseKey, holesMode);
    const tee = tees.find((t) => t.teeId === teeId) ?? tees[0] ?? null;
    if (tee && is9hMode(holesMode)) {
      const r9 = get9hRatings(tee, holesMode);
      return {
        cr: r9?.cr ?? null,
        slope: r9?.slope ?? null,
        par: r9?.par ?? 36,
        teeName: tee?.teeName ?? "",
        courseName: c?.master.name ?? "",
      };
    }
    return {
      cr: tee?.ratings.holes18?.courseRating ?? null,
      slope: tee?.ratings.holes18?.slopeRating ?? null,
      par: tee?.ratings.holes18?.par ?? 72,
      teeName: tee?.teeName ?? "",
      courseName: c?.master.name ?? "",
    };
  }

  // ── Modo manual: valor efectivo de cada campo (input da ronda OU o
  //    manualDefaults do holesMode actual). Assim, preencher o CR/Slope no
  //    topo do /simulador preenche automaticamente a ronda em baixo. ──
  function manualFieldValue(r: SimRound, field: "cr" | "slope" | "par"): string {
    const own =
      field === "cr" ? r.crInput : field === "slope" ? r.slopeInput : r.parInput;
    if (own && own.trim() !== "") return own;
    return manualDefaults?.[r.holesMode]?.[field] ?? "";
  }

  function roundPcc(r: SimRound | undefined): number {
    const v = parseInt(r?.pccInput ?? "", 10);
    return isNaN(v) ? 0 : v;
  }

  function getManualRatings(r: SimRound): {
    cr: number | null;
    slope: number | null;
    par: number;
    teeName: string;
    courseName: string;
  } {
    const cr = parseFloat(manualFieldValue(r, "cr").replace(",", "."));
    const slope = parseFloat(manualFieldValue(r, "slope").replace(",", "."));
    const parN = parseInt(manualFieldValue(r, "par"), 10);
    const is9 = is9hMode(r.holesMode);
    return {
      cr: isNaN(cr) ? null : cr,
      slope: isNaN(slope) || slope <= 0 ? null : slope,
      par: isNaN(parN) ? (is9 ? 36 : 72) : parN,
      teeName: "",
      courseName: "Campo manual",
    };
  }

  // ── Mutações de rondas ──
  function addRound() {
    const last = rounds[rounds.length - 1];
    setRounds((prev) => [
      ...prev,
      {
        id: newId(),
        mode: last?.mode ?? "sd",
        holesMode: last?.holesMode ?? "18",
        sdInput: "",
        courseKey: last?.courseKey || defaultCourseKey,
        teeId: "",
        grossInput: "",
      },
    ]);
  }

  function removeRound(id: string) {
    setRounds((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }

  function updateRound(id: string, patch: Partial<SimRound>) {
    setRounds((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const merged = { ...r, ...patch };
        // Se mudou courseKey ou holesMode, reset teeId porque o conjunto
        // de tees válidos pode ser diferente (nem todos os tees têm 9H).
        if (
          (patch.courseKey !== undefined && patch.courseKey !== r.courseKey) ||
          (patch.holesMode !== undefined && patch.holesMode !== r.holesMode)
        ) {
          merged.teeId = "";
        }
        // Modo manual: ao mudar o nº de buracos, limpar os overrides de
        // CR/Slope/Par para que cada modo puxe o seu próprio manualDefaults.
        if (patch.holesMode !== undefined && patch.holesMode !== r.holesMode) {
          merged.crInput = "";
          merged.slopeInput = "";
          merged.parInput = "";
        }
        return merged;
      })
    );
  }

  // ── Volta vinda de fora (ex: o scorecard do /simulador) ──
  // Cada pedido traz uma `key` nova. Entra como ronda de Campo quando o tee
  // existe para o sexo do jogador; senão como Manual com o CR/Slope/Par. Com
  // PCC ≠ 0 entra como SD directo (as rondas de Campo/Manual não levam PCC).
  const lastIncomingKey = useRef<number | null>(null);
  useEffect(() => {
    const ir = incomingRound;
    if (!ir || ir.key === lastIncomingKey.current) return;
    lastIncomingKey.current = ir.key;
    const base: SimRound = {
      id: newId(),
      mode: "sd",
      holesMode: ir.holesMode,
      sdInput: "",
      courseKey: ir.courseKey || defaultCourseKey,
      teeId: "",
      grossInput: "",
      pccInput: ir.pcc ? String(ir.pcc) : "",
    };
    const teeOk =
      !!ir.courseKey && !!ir.teeId &&
      getValidTees(ir.courseKey, ir.holesMode).some((t) => t.teeId === ir.teeId);
    const gross = ir.gross != null ? String(ir.gross) : "";
    const r: SimRound =
      ir.sd != null
        ? { ...base, sdInput: String(ir.sd) }
        : teeOk
          ? { ...base, mode: "course", teeId: ir.teeId!, grossInput: gross }
          : {
              ...base,
              mode: "manual",
              crInput: String(ir.cr),
              slopeInput: String(ir.slope),
              parInput: String(ir.par),
              grossInput: gross,
            };
    setRounds((prev) => {
      const blank = (x: SimRound) => x.sdInput.trim() === "" && x.grossInput.trim() === "";
      return prev.length === 1 && blank(prev[0]) ? [r] : [...prev, r];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingRound]);

  function clearAll() {
    setRounds([
      {
        id: newId(),
        mode: "sd",
        holesMode: "18",
        sdInput: "",
        courseKey: defaultCourseKey,
        teeId: "",
        grossInput: "",
      },
    ]);
    if (storageKey) localStorage.removeItem(storageKey);
    setSavedTs(null);
  }

  // ── Persistência ──
  function saveNow() {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(rounds));
      setSavedTs(Date.now());
    } catch {}
  }

  function loadSaved() {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        const norm = normalizeSaved(parsed);
        if (norm) setRounds(norm);
      }
    } catch {}
  }

  const hasSaved = !!storageKey &&
    (() => {
      try {
        return !!localStorage.getItem(storageKey);
      } catch {
        return false;
      }
    })();

  // ── Simulação sequencial ──
  const simResults = useMemo(() => {
    if (currentHI == null || initialPool.length === 0) return null;
    const oldTopIds = topIds(initialPool);
    let pool: PoolEntry[] = [...initialPool];
    let curHI = currentHI;
    // O Low HI desce quando uma ronda simulada baixa o índice abaixo dele
    let curLow = lowHI;
    const results: RoundResult[] = [];

    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i];
      const is9 = is9hMode(round.holesMode);
      let sd: number | null = null;
      let sd9Raw: number | null = null;
      let exp9: number | null = null;
      let cr: number | null = null,
        slope: number | null = null,
        par: number | null = null;
      let gross: number | null = null;
      let courseName = "",
        teeLabel = "";

      if (round.mode === "sd") {
        const v = parseFloat(round.sdInput.replace(",", "."));
        if (!isNaN(v)) {
          if (is9) {
            // Input é SD9; converte-se para SD18 com o Expected SD do HI actual
            sd9Raw = round1(v);
            exp9 = round1(expectedSD9(curHI));
            sd = sd18FromSd9(sd9Raw, curHI);
          } else {
            sd = v;
          }
        }
        courseName = "Ronda simulada";
      } else {
        // Modo "course" (tee de campo real) OU "manual" (CR/Slope à mão) —
        // ambos derivam um CR/Slope/Par e convertem o gross em SD.
        const rat =
          round.mode === "manual"
            ? getManualRatings(round)
            : getTeeRatings(round.courseKey, getEffectiveTeeId(round), round.holesMode);
        cr = rat.cr;
        slope = rat.slope;
        par = rat.par;
        courseName = rat.courseName;
        teeLabel = rat.teeName;
        const g = parseInt(round.grossInput);
        if (!isNaN(g) && cr != null && slope != null) {
          gross = g;
          const d = scoreDifferential({ score: g, cr, slope, pcc: roundPcc(round), is9, hi: curHI });
          if (d) { sd = d.sd; sd9Raw = d.sd9; exp9 = d.exp9; }
        }
      }

      const poolBefore = [...pool];
      if (sd == null) {
        results.push({
          roundId: round.id,
          roundIdx: i,
          sd: null,
          sd9: null,
          exp9: null,
          sdInPool: null,
          exceptionalAdj: 0,
          exceptionalDiff: 0,
          hiBeforeRound: curHI,
          hiAfterRound: curHI,
          delta: 0,
          entersTop: false,
          topRank: null,
          poolBefore,
          poolAfter: pool,
          displaced: null,
          courseName,
          teeLabel,
          holesMode: round.holesMode,
          cr,
          slope,
          par,
          gross,
          valid: false,
        });
        break;
      }

      const exceptionalDiff = curHI - sd;
      const step = addRoundToPool<PoolEntry>(
        pool,
        { eid: round.id, sd, adj: 0, isSimulated: true, roundIdx: i },
        curHI,
        totalAdjustment,
        curLow
      );
      const { exceptionalAdj, displaced, entersTop, topRank, newHI } = step;
      const newPool = step.pool;

      results.push({
        roundId: round.id,
        roundIdx: i,
        sd,
        sd9: sd9Raw,
        exp9,
        sdInPool: sd + exceptionalAdj,
        exceptionalAdj,
        exceptionalDiff,
        hiBeforeRound: curHI,
        hiAfterRound: newHI,
        delta: newHI - curHI,
        entersTop,
        topRank,
        poolBefore,
        poolAfter: newPool,
        displaced,
        courseName,
        teeLabel,
        holesMode: round.holesMode,
        cr,
        slope,
        par,
        gross,
        valid: true,
      });
      pool = newPool;
      curHI = newHI;
      if (curLow != null && curLow > 0 && newHI < curLow) curLow = newHI;
    }
    return { results, finalPool: pool, finalHI: curHI, oldTopIds };
  }, [rounds, initialPool, currentHI, totalAdjustment, allRatedCourses, lowHI]);

  // ── Melhores N da janela final e de antes da simulação (#antiga → #nova) ──
  const finalTopRanks = useMemo(
    () => (simResults ? topRanks(simResults.finalPool) : new Map<string, number>()),
    [simResults]
  );
  const finalTopIds = useMemo(() => new Set(finalTopRanks.keys()), [finalTopRanks]);
  const oldTopRanks = useMemo(() => topRanks(initialPool), [initialPool]);

  // ── Tabela gross→HCP (última ronda em modo Campo válida) ──
  const grossTable = useMemo(() => {
    if (!simResults) return null;
    const validRes = simResults.results.filter((r) => r.valid);
    if (!validRes.length) return null;
    const last = validRes[validRes.length - 1];
    if (last.cr == null || last.slope == null) return null;
    const is9 = is9hMode(last.holesMode);
    const defaultPar = is9 ? 36 : 72;
    const {
      cr,
      slope,
      par = defaultPar,
      poolBefore,
      hiBeforeRound,
      roundIdx,
      gross: enteredGross,
    } = last;
    const lastPcc = roundPcc(rounds[roundIdx]);
    const exp9 = is9 ? round1(expectedSD9(hiBeforeRound)) : 0;
    const rows: {
      gross: number;
      sd: number;
      /** SD9 original quando ronda é de 9 buracos */
      sd9: number | null;
      newHI: number;
      delta: number;
      entersTop: boolean;
      toPar: number;
      exceptionalAdj: number;
      isEntered: boolean;
    }[] = [];
    // Range de scores: 9H usa delta mais estreito conforme SimuladorPage
    const minDelta = is9 ? -4 : -10;
    const maxDelta = is9 ? 20 : 35;
    const minScore = is9 ? 25 : 50;
    for (let delta = minDelta; delta <= maxDelta; delta++) {
      const g = (par as number) + delta;
      if (g < minScore) continue;
      const d = scoreDifferential({ score: g, cr: cr!, slope: slope!, pcc: lastPcc, is9, hi: hiBeforeRound });
      if (!d) continue;
      const { sd, sd9 } = d;
      const step = addRoundToPool<PoolEntry>(
        poolBefore,
        { eid: "__gt__", sd, adj: 0, isSimulated: true, roundIdx: -1 },
        hiBeforeRound,
        totalAdjustment,
        lowHI
      );
      const newHI = step.newHI;
      rows.push({
        gross: g,
        sd,
        sd9,
        newHI,
        delta: newHI - hiBeforeRound,
        entersTop: step.entersTop,
        toPar: g - (par as number),
        exceptionalAdj: step.exceptionalAdj,
        isEntered: g === enteredGross,
      });
    }
    return { rows, par: par as number, cr, slope, roundIdx, is9, holesMode: last.holesMode, exp9: is9 ? exp9 : null };
  }, [simResults, totalAdjustment, rounds, lowHI]);

  // ── Rondas deslocadas ──
  // Cada ronda simulada expulsa a mais antiga da janela; a 1ª simulada expulsa
  // a mais velha e a última simulada expulsa a mais recente das que saem.
  // Invertemos para mostrar primeiro "a última que saiu" (mais recente).
  const displacedEntries = useMemo(
    () =>
      (simResults?.results
        .filter((r) => r.valid && r.displaced)
        .map((r) => r.displaced!) ?? [])
        .slice()
        .reverse(),
    [simResults]
  );

  // ── Exportar PDF ──
  function exportPDF() {
    if (!simResults) return;
    const validRes = simResults.results.filter((r) => r.valid);
    const finalHIv = simResults.finalHI;
    const finalDelta = finalHIv - (currentHI ?? 0);
    const playerName = (playerData as any)?.META?.name ?? "";
    const fedNum = (playerData as any)?.META?.fed ?? urlFedId ?? "";
    const dateStr = new Date().toLocaleDateString("pt-PT");
    const timeStr = new Date().toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Cores das pills de SD — replicam exactamente .p-sd-excellent / .p-sd-good / .p-sd-poor
    const SD_EXCELLENT = { bg: "#22c55e", fg: "#fff" }; // sd ≤ HI
    const SD_GOOD = { bg: "#fef08a", fg: "#713f12" }; // sd ≤ HI+3
    const SD_POOR = { bg: "#ef4444", fg: "#fff" }; // sd > HI+3

    function sdColor(sd: number, hi: number | null) {
      if (hi == null || !isFinite(sd))
        return { bg: "#e5e7eb", fg: "#6b7280" };
      if (sd <= hi) return SD_EXCELLENT;
      if (sd <= hi + 3) return SD_GOOD;
      return SD_POOR;
    }

    function sdPill(sd: number, hi: number | null, adj = 0) {
      const displaySd = sd + adj;
      const c = sdColor(displaySd, hi);
      const adjNote =
        adj !== 0
          ? `<span style="font-size:9px;opacity:.8;margin-left:3px">(${adj > 0 ? "+" : ""}${adj})</span>`
          : "";
      return `<span style="background:${c.bg};color:${c.fg};border-radius:6px;padding:2px 7px;font-size:11px;font-weight:700;display:inline-block;white-space:nowrap">${displaySd.toFixed(1)}${adjNote}</span>`;
    }

    const goodClr = "#16a34a";
    const badClr = "#dc2626";
    const excClr = "#b45309";
    const neutralClr = "#374151";
    const mutedClr = "#9ca3af";

    function deltaColor(d: number) {
      return d < -0.05 ? goodClr : d > 0.05 ? badClr : neutralClr;
    }
    function deltaBg(d: number) {
      return d < -0.05 ? "#f0fdf4" : d > 0.05 ? "#fef2f2" : "#f9fafb";
    }
    function deltaBorder(d: number) {
      return d < -0.05 ? "#86efac" : d > 0.05 ? "#fca5a5" : "#e5e7eb";
    }

    // ── Timeline ─────────────────────────────────────────────────────────
    const tlItems = [
      `<div class="tl-box tl-start">
        <div class="tl-lbl">Actual</div>
        <div class="tl-hi" style="color:${neutralClr}">${currentHI!.toFixed(1)}</div>
        <div class="tl-sub">${whsQtyCalc(initialPool.length)} mel./${initialPool.length}</div>
      </div>`,
    ];
    validRes.forEach((r, i) => {
      tlItems.push(
        `<div class="tl-arrow">→</div>
        <div class="tl-box" style="background:${deltaBg(r.delta)};border-color:${deltaBorder(r.delta)}">
          <div class="tl-lbl">R${i + 1}${r.exceptionalAdj !== 0 ? " ⚡" : ""}</div>
          <div class="tl-hi" style="color:${deltaColor(r.delta)}">${r.hiAfterRound.toFixed(1)}</div>
          <div class="tl-sub" style="color:${deltaColor(r.delta)}">${r.delta > 0 ? "+" : ""}${r.delta.toFixed(1)}</div>
        </div>`
      );
    });
    if (validRes.length > 1) {
      tlItems.push(
        `<div class="tl-arrow" style="font-weight:700">═</div>
        <div class="tl-box tl-final" style="background:${deltaBg(finalDelta)};border:2px solid ${deltaBorder(finalDelta)}">
          <div class="tl-lbl">Final</div>
          <div class="tl-hi" style="color:${deltaColor(finalDelta)};font-size:26px">${finalHIv.toFixed(1)}</div>
          <div class="tl-sub" style="color:${deltaColor(finalDelta)}">${finalDelta > 0 ? "+" : ""}${finalDelta.toFixed(1)} total</div>
        </div>`
      );
    }

    // ── Cards de ronda ────────────────────────────────────────────────────
    const roundCards = validRes
      .map((r, i) => {
        const clr = deltaColor(r.delta);
        const brd =
          r.exceptionalAdj !== 0
            ? excClr
            : r.delta < -0.05
              ? goodClr
              : r.delta > 0.05
                ? badClr
                : "#d1d5db";
        const is9 = r.holesMode === "front9" || r.holesMode === "back9";
        const hmLabelPdf = is9 ? (r.holesMode === "front9" ? "Front 9" : "Back 9") : null;
        const holesBadgePdf = hmLabelPdf
          ? ` <span style="background:#fde68a;color:#92400e;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;margin-left:4px">${hmLabelPdf}</span>`
          : "";
        const modeLabel =
          r.cr != null
            ? `⛳ <b>${r.courseName}</b>${r.teeLabel ? ` — ${r.teeLabel}` : ""}${holesBadgePdf} <span style="color:${mutedClr};font-size:10px">CR ${r.cr} / Slope ${r.slope} / Par ${r.par}</span>`
            : `📊 SD directo${holesBadgePdf}`;
        const inputLine =
          r.gross != null
            ? (is9 && r.sd9 != null && r.exp9 != null
                ? `Gross 9h: <b>${r.gross}</b> → SD9 <b>${r.sd9.toFixed(1)}</b> + exp9 <b>${r.exp9.toFixed(1)}</b>`
                : `Gross: <b>${r.gross}</b> pancadas`)
            : (is9 && r.sd9 != null && r.exp9 != null
                ? `SD9 introduzido: <b>${r.sd9.toFixed(1)}</b> + exp9 <b>${r.exp9.toFixed(1)}</b>`
                : `SD introduzido: <b>${r.sd!.toFixed(1)}</b>`);
        const topBadge = r.entersTop
          ? `<span style="background:#16a34a;color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">★ top-${r.topRank ?? ""}</span> `
          : "";
        const excBadge =
          r.exceptionalAdj !== 0
            ? `<span style="background:${excClr};color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">⚡ Exceptional ${r.exceptionalAdj === -2 ? "−2" : "−1"}</span>`
            : "";

        return `
      <div style="border:1px solid ${brd};border-left:5px solid ${brd};border-radius:8px;background:${deltaBg(r.delta)};padding:12px 16px;margin-bottom:10px;page-break-inside:avoid">
        <!-- Cabeçalho da ronda -->
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
          <span style="background:${brd};color:#fff;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">${i + 1}</span>
          <span style="font-size:13px;color:${neutralClr}">${modeLabel}</span>
          <span style="margin-left:auto">${topBadge}${excBadge}</span>
        </div>
        <!-- Dados -->
        <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
          <!-- Input + SD pill -->
          <div>
            <div style="font-size:10px;color:${mutedClr};text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Input → SD</div>
            <div style="font-size:12px;display:flex;align-items:center;gap:8px">
              ${inputLine} &nbsp;→&nbsp; ${sdPill(r.sd!, r.hiBeforeRound)}
            </div>
          </div>
          <!-- HCP antes -->
          <div style="text-align:center">
            <div style="font-size:10px;color:${mutedClr};text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">HCP antes</div>
            <div style="font-size:20px;font-weight:700;color:${neutralClr}">${r.hiBeforeRound.toFixed(1)}</div>
          </div>
          <div style="font-size:18px;color:${mutedClr}">→</div>
          <!-- HCP depois -->
          <div style="text-align:center">
            <div style="font-size:10px;color:${mutedClr};text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">HCP depois</div>
            <div style="font-size:28px;font-weight:900;color:${clr};line-height:1">${r.hiAfterRound.toFixed(1)}</div>
          </div>
          <!-- Variação -->
          <div style="text-align:center">
            <div style="font-size:10px;color:${mutedClr};text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Δ HCP</div>
            <div style="font-size:20px;font-weight:800;color:${clr}">${r.delta > 0 ? "+" : ""}${r.delta.toFixed(1)}</div>
          </div>
          ${r.exceptionalAdj !== 0
            ? `
          <div style="background:rgba(180,83,9,.08);border:1px solid ${excClr};border-radius:6px;padding:7px 11px;font-size:11px;color:${excClr};max-width:280px;line-height:1.5">
            <b>Exceptional Score (Regra 5.9):</b> SD ${r.sd!.toFixed(1)} está ${r.exceptionalDiff.toFixed(1)} pancadas abaixo do HI ${r.hiBeforeRound.toFixed(1)}.
            Redução de <b>${r.exceptionalAdj}</b> aplicada a todos os ${r.poolAfter.length} SDs.
          </div>`
            : ""}
        </div>
      </div>`;
      })
      .join("");

    // ── Tabela WHS final ──────────────────────────────────────────────────
    const poolQty = whsQtyCalc(simResults.finalPool.length);
    const poolRows = simResults.finalPool
      .map((e, i) => {
        const r = e.origRound;
        const isTop = finalTopIds.has(e.eid);
        const rank = finalTopRanks.get(e.eid);
        const hasAdj = e.adj !== 0;
        const res = e.isSimulated ? validRes.find((x) => x.roundId === e.eid) : null;
        const rowBg = e.isSimulated
          ? "#eff6ff"
          : isTop
            ? "#f0fdf4"
            : i % 2 === 0
              ? "#fff"
              : "#fafafa";
        const lBorder = e.isSimulated
          ? "#93c5fd"
          : isTop
            ? "#86efac"
            : "transparent";
        const dateLabel = e.isSimulated
          ? `<b style="color:#2563eb">▶ Nova ${(res?.roundIdx ?? 0) + 1}</b>`
          : r?.date ?? "—";
        const courseLabel = e.isSimulated
          ? res?.courseName ?? "—"
          : r?.course ?? "—";
        const hiRef = e.isSimulated ? res?.hiBeforeRound ?? currentHI! : r?.hi ?? currentHI!;
        const sdOrigPill = sdPill(e.sd, hiRef ?? currentHI!);
        const sdAdjPill = hasAdj ? sdPill(e.sd, hiRef ?? currentHI!, e.adj) : "—";
        return `<tr style="background:${rowBg};border-left:3px solid ${lBorder}">
        <td style="padding:5px 8px;color:${mutedClr};font-size:11px;font-weight:700">${i + 1}</td>
        <td style="padding:5px 8px;font-size:11px">${dateLabel}</td>
        <td style="padding:5px 8px;font-size:11px">${courseLabel}${res?.teeLabel ? ` <span style="color:${mutedClr}">— ${res.teeLabel}</span>` : ""}</td>
        <td style="padding:5px 8px;font-size:11px;text-align:right">${r?.hi ?? ""}</td>
        <td style="padding:5px 8px;text-align:right">${sdOrigPill}</td>
        <td style="padding:5px 8px;text-align:right">${sdAdjPill}</td>
        <td style="padding:5px 8px;text-align:center;font-size:11px;font-weight:700;color:${isTop ? goodClr : mutedClr}">${isTop ? `★ #${rank}` : "–"}</td>
      </tr>`;
      })
      .join("");

    const hasDisplaced = displacedEntries.length > 0;
    const displRows = displacedEntries
      .map((e) => {
        const r = e.origRound;
        const wasTop = simResults.oldTopIds.has(e.eid);
        return `<tr style="opacity:.4">
        <td style="padding:5px 8px;color:${badClr};font-size:11px;font-weight:700">out</td>
        <td style="padding:5px 8px;font-size:11px">${r?.date ?? "—"}</td>
        <td style="padding:5px 8px;font-size:11px">${r?.course ?? "—"}</td>
        <td style="padding:5px 8px;font-size:11px;text-align:right">${r?.hi ?? ""}</td>
        <td style="padding:5px 8px;text-align:right">${sdPill(e.sd, currentHI!)}</td>
        <td style="padding:5px 8px;text-align:right;color:${mutedClr}">—</td>
        <td style="padding:5px 8px;text-align:center;color:${wasTop ? badClr : mutedClr};font-size:11px">${wasTop ? "★ saiu" : "–"}</td>
      </tr>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="pt"><head>
<meta charset="utf-8">
<title>Simulação WHS${playerName ? " — " + playerName : ""}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#111827;margin:0;padding:32px 28px;background:#fff}
  h1{font-size:21px;font-weight:900;margin:0 0 3px;letter-spacing:-.3px;color:#111827}
  .meta{font-size:12px;color:${mutedClr};margin:0 0 18px}
  /* KPIs topo */
  .kpis{display:flex;gap:12px;margin-bottom:22px;flex-wrap:wrap}
  .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:10px 18px;text-align:center;min-width:90px}
  .kpi-lbl{font-size:10px;color:${mutedClr};text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
  .kpi-val{font-size:26px;font-weight:900;line-height:1}
  /* Timeline */
  .timeline{display:flex;align-items:stretch;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:22px}
  .tl-box{padding:10px 14px;text-align:center;min-width:82px;display:flex;flex-direction:column;justify-content:center;background:#f9fafb;border:1px solid #e5e7eb}
  .tl-box.tl-start{background:#f3f4f6;border:none}
  .tl-box.tl-final{min-width:90px}
  .tl-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:${mutedClr};font-weight:600;margin-bottom:2px}
  .tl-hi{font-size:21px;font-weight:900;line-height:1}
  .tl-sub{font-size:11px;font-weight:700;margin-top:2px}
  .tl-arrow{display:flex;align-items:center;padding:0 5px;background:#f3f4f6;color:${mutedClr};font-size:15px}
  /* Secções */
  .sec{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${mutedClr};margin:20px 0 8px;padding-bottom:5px;border-bottom:1.5px solid #e5e7eb}
  /* Tabela */
  table{width:100%;border-collapse:collapse}
  thead tr{background:#f3f4f6}
  thead th{padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;font-weight:700;color:#6b7280;text-align:left;border-bottom:2px solid #e5e7eb}
  thead th.r{text-align:right} thead th.c{text-align:center}
  tbody tr{border-bottom:1px solid #f3f4f6}
  .legend{display:flex;gap:14px;margin-bottom:8px;font-size:11px;color:#6b7280;flex-wrap:wrap}
  .dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:middle}
  footer{margin-top:24px;font-size:10px;color:${mutedClr};border-top:1px solid #f3f4f6;padding-top:10px}
  @media print{body{padding:16px 14px}tr{page-break-inside:avoid}.sec{margin-top:14px}}
</style></head>
<body>
  <h1>Simulação WHS${playerName ? " — " + playerName : ""}</h1>
  <p class="meta">${fedNum ? "Federado #" + fedNum + " · " : ""}${dateStr} às ${timeStr} · ${validRes.length} ronda${validRes.length !== 1 ? "s" : ""} simulada${validRes.length !== 1 ? "s" : ""}${validRes.some((r) => r.exceptionalAdj !== 0) ? " · ⚡ Exceptional Score" : ""}</p>

  <!-- KPIs -->
  <div class="kpis">
    <div class="kpi">
      <div class="kpi-lbl">HCP Actual</div>
      <div class="kpi-val" style="color:${neutralClr}">${currentHI!.toFixed(1)}</div>
    </div>
    <div class="kpi" style="border-color:${deltaBorder(finalDelta)}">
      <div class="kpi-lbl">HCP Final</div>
      <div class="kpi-val" style="color:${deltaColor(finalDelta)}">${finalHIv.toFixed(1)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Variação Total</div>
      <div class="kpi-val" style="color:${deltaColor(finalDelta)}">${finalDelta > 0 ? "+" : ""}${finalDelta.toFixed(1)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Janela WHS</div>
      <div class="kpi-val" style="color:${neutralClr}">${whsQtyCalc(simResults.finalPool.length)}/${simResults.finalPool.length}</div>
    </div>
  </div>

  <!-- Timeline -->
  <div class="sec">Evolução do Handicap Index</div>
  <div class="timeline">${tlItems.join("")}</div>

  <!-- Rondas -->
  <div class="sec">Detalhe das rondas simuladas</div>
  ${roundCards}

  <!-- Tabela WHS -->
  <div class="sec">Janela WHS final — ${simResults.finalPool.length} rondas (top-${poolQty} entram no cálculo)</div>
  <div class="legend">
    <span><span class="dot" style="background:#bfdbfe"></span>Ronda simulada</span>
    <span><span class="dot" style="background:#bbf7d0"></span>Entra no top-${poolQty}</span>
    <span>${sdPill(currentHI! - 1, currentHI!)} SD ≤ HI (excelente)</span>
    <span>${sdPill(currentHI! + 1, currentHI!)} SD ≤ HI+3 (bom)</span>
    <span>${sdPill(currentHI! + 5, currentHI!)} SD > HI+3 (fraco)</span>
  </div>
  <table>
    <thead><tr>
      <th>#</th><th>Data</th><th>Campo</th>
      <th class="r">HCP</th><th class="r">SD orig.</th><th class="r">SD adj.</th><th class="c">Top</th>
    </tr></thead>
    <tbody>
      ${poolRows}
      ${hasDisplaced ? `<tr><td colspan="7" style="padding:4px 8px;background:#f3f4f6;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${mutedClr}">Deslocadas — saíram da janela</td></tr>${displRows}` : ""}
    </tbody>
  </table>

  <div class="footer">Simulação WHS · SD colorizados: verde = SD ≤ HI (excelente), amarelo = SD ≤ HI+3 (bom), vermelho = SD &gt; HI+3 (fraco) · ⚡ Exceptional Score conforme Regra 5.9 · Os valores são estimativas.</div>
</body></html>`;

    const win = window.open("", "_blank", "width=960,height=750");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 500);
  }

  if (currentHI == null) return null;

  const validResults = simResults?.results.filter((r) => r.valid) ?? [];
  const finalHI = simResults?.finalHI ?? currentHI;
  const finalDelta = finalHI - currentHI;
  const finalDColor =
    finalDelta < -0.05
      ? "var(--color-good)"
      : finalDelta > 0.05
        ? "var(--color-danger)"
        : "var(--text-2)";
  const qtyCalcCur = whsQtyCalc(initialPool.length);

  // Cor da borda esquerda do card de ronda
  function roundBorderColor(result?: RoundResult): string {
    if (!result?.valid) return "var(--border)";
    if (result.exceptionalAdj !== 0)
      return "var(--color-warn, #e07b00)";
    if (result.delta < -0.05) return "var(--color-good)";
    if (result.delta > 0.05) return "var(--color-danger)";
    return "var(--border)";
  }

  const inner = (
    <div>
      {/* ── Toolbar: guardar / carregar / PDF / limpar ── */}
      <div
        className="gap-8"
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <span className="muted fs-11">
          Simula rondas sequencialmente — SD directo, Campo+Tee+Gross ou CR/Slope manual+Gross · 18 · F9 · B9 suportados
          {playerSex && ` · tees filtrados por ${playerSex === "M" ? "Masculino" : "Feminino"}`}.
        </span>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {savedTs && (
            <span
              style={{
                fontSize: "var(--fs-10)",
                color: "var(--color-good)",
                fontWeight: 600,
              }}
            >
              ✓ guardado
            </span>
          )}
          {storageKey && (
            <button
              onClick={saveNow}
              style={{
                fontSize: "var(--fs-11)",
                padding: "3px 10px",
                borderRadius: 6,
                border: "1px solid var(--line)",
                background: "transparent",
                cursor: "pointer",
                color: "var(--text-2)",
                fontWeight: 600,
              }}
            >
              💾 Guardar
            </button>
          )}
          {storageKey && hasSaved && (
            <button
              onClick={loadSaved}
              style={{
                fontSize: "var(--fs-11)",
                padding: "3px 10px",
                borderRadius: 6,
                border: "1px solid var(--line)",
                background: "transparent",
                cursor: "pointer",
                color: "var(--text-2)",
              }}
            >
              📂 Repor
            </button>
          )}
          {validResults.length > 0 && (
            <button
              onClick={exportPDF}
              style={{
                fontSize: "var(--fs-11)",
                padding: "3px 10px",
                borderRadius: 6,
                border: "1px solid var(--line)",
                background: "transparent",
                cursor: "pointer",
                color: "var(--chart-2)",
                fontWeight: 600,
              }}
            >
              📄 PDF
            </button>
          )}
          <button
            onClick={clearAll}
            style={{
              fontSize: "var(--fs-11)",
              padding: "3px 10px",
              borderRadius: 6,
              border: "1px solid var(--line)",
              background: "transparent",
              cursor: "pointer",
              color: "var(--text-3)",
            }}
          >
            ✕ Limpar
          </button>
        </div>
      </div>

      {/* ── Cards das rondas ── */}
      <div
        className="gap-8 mb-16"
        style={{ display: "flex", flexDirection: "column" }}
      >
        {rounds.map((round, idx) => {
          const is9 = is9hMode(round.holesMode);
          const teeId = getEffectiveTeeId(round);
          const validTees = getValidTees(round.courseKey, round.holesMode);
          const ratings =
            round.mode === "manual"
              ? getManualRatings(round)
              : getTeeRatings(round.courseKey, teeId, round.holesMode);
          // Se o campo não tem 9H ratings em nenhum tee, avisar (modo manual: o
          // utilizador introduz o seu próprio CR/Slope 9H → sempre "suportado").
          const has9Hsupport = round.mode === "course" && round.courseKey
            ? allRatedCourses
                .find((c) => c.courseKey === round.courseKey)
                ?.master.tees.some((t) => get9hRatings(t, "front9") !== null || get9hRatings(t, "back9") !== null) ?? false
            : true;
          const grossNum = parseInt(round.grossInput);
          const result = simResults?.results[idx];
          const hiRef = result?.hiBeforeRound ?? currentHI;
          // SD da ronda com os ratings actuais — em 9H o SD9 e o SD18 (com o
          // Expected SD do HI antes da ronda). Conta da biblioteca (whsCalc).
          const preview =
            (round.mode === "course" || round.mode === "manual") &&
            !isNaN(grossNum) && ratings.cr != null && ratings.slope != null
              ? scoreDifferential({
                  score: grossNum, cr: ratings.cr, slope: ratings.slope,
                  pcc: roundPcc(round), is9, hi: hiRef,
                })
              : null;
          const computedSdRaw = preview ? (is9 ? preview.sd9 : preview.sd) : null;
          const exp9Preview = preview?.exp9 ?? null;
          const computedSd18 = preview?.sd ?? null;
          const borderClr = roundBorderColor(result);

          return (
            <div
              key={round.id}
              style={{
                border: "1px solid var(--border)",
                borderLeft: `4px solid ${borderClr}`,
                borderRadius: "var(--radius-xl)",
                background: "var(--bg-card)",
                padding: "10px 14px",
                transition: "border-color .15s",
              }}
            >
              {/* Cabeçalho */}
              <div
                className="gap-8 mb-10"
                style={{ display: "flex", alignItems: "center" }}
              >
                {/* Número */}
                <span
                  className="rsim-num"
                  style={{
                    background:
                      borderClr === "var(--border)"
                        ? "var(--bg-detail)"
                        : borderClr,
                    color:
                      borderClr === "var(--border)"
                        ? "var(--text-2)"
                        : "#fff",
                  }}
                >
                  {idx + 1}
                </span>

                {/* Toggle SD / Campo / Manual */}
                <div className="rsim-seg" title="Origem do resultado">
                  {(["sd", "course", "manual"] as const).map((m) => (
                    <button
                      key={m}
                      className={round.mode === m ? "on" : ""}
                      onClick={() => updateRound(round.id, { mode: m })}
                    >
                      {m === "sd" ? "📊 SD" : m === "course" ? "⛳ Campo" : "✏️ Manual"}
                    </button>
                  ))}
                </div>

                {/* Toggle 18 / Front 9 / Back 9 */}
                <div className="rsim-seg" title="Número de buracos jogados">
                  {(["18", "front9", "back9"] as const).map((hm) => {
                    const label =
                      hm === "18" ? "18" : hm === "front9" ? "F9" : "B9";
                    const active = round.holesMode === hm;
                    return (
                      <button
                        key={hm}
                        className={active ? "on" : ""}
                        onClick={() =>
                          updateRound(round.id, { holesMode: hm })
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* PCC do dia — só quando o SD sai de um gross */}
                {round.mode !== "sd" && (
                  <select
                    className="select fs-12"
                    value={round.pccInput || "0"}
                    onChange={(e) => updateRound(round.id, { pccInput: e.target.value })}
                    title="PCC (Playing Conditions Calculation) do dia"
                  >
                    {[-1, 0, 1, 2, 3].map((v) => (
                      <option key={v} value={String(v)}>
                        {v === 0 ? "PCC 0" : v > 0 ? `PCC +${v}` : `PCC ${v}`}
                      </option>
                    ))}
                  </select>
                )}

                {/* Resultado inline */}
                {result?.valid && (
                  <div
                    style={{
                      marginLeft: "auto",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {result.exceptionalAdj !== 0 && (
                      <span
                        style={{
                          fontSize: "var(--fs-10)",
                          fontWeight: 700,
                          color: "#fff",
                          borderRadius: 4,
                          padding: "2px 6px",
                          background:
                            result.exceptionalAdj === -2
                              ? "var(--color-danger)"
                              : "var(--color-warn, #e07b00)",
                        }}
                      >
                        ⚡{" "}
                        {result.exceptionalAdj === -2
                          ? "−2"
                          : "−1"}
                      </span>
                    )}
                    {result.entersTop && (
                      <span
                        style={{
                          fontSize: "var(--fs-10)",
                          fontWeight: 700,
                          color: "var(--color-good)",
                        }}
                      >
                        ★ top-
                        {finalTopRanks.get(round.id)
                          ? `#${finalTopRanks.get(round.id)}`
                          : ""}
                      </span>
                    )}
                    <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
                      HCP
                    </span>
                    <span
                      style={{
                        fontSize: "var(--fs-18)",
                        fontWeight: 800,
                        lineHeight: 1,
                        color:
                          result.delta < -0.05
                            ? "var(--color-good)"
                            : result.delta > 0.05
                              ? "var(--color-danger)"
                              : "var(--text-1)",
                      }}
                    >
                      {result.hiAfterRound.toFixed(1)}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--fs-12)",
                        fontWeight: 700,
                        color:
                          result.delta < -0.05
                            ? "var(--color-good)"
                            : result.delta > 0.05
                              ? "var(--color-danger)"
                              : "var(--text-3)",
                      }}
                    >
                      ({result.delta > 0 ? "+" : ""}
                      {result.delta.toFixed(1)})
                    </span>
                  </div>
                )}

                {/* Remover */}
                {rounds.length > 1 && (
                  <button
                    onClick={() => removeRound(round.id)}
                    title="Remover"
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--text-3)",
                      fontSize: "var(--fs-18)",
                      padding: "0 2px",
                      lineHeight: 1,
                      marginLeft: result?.valid ? 0 : "auto",
                    }}
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Inputs */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                {round.mode === "sd" ? (
                  <>
                    <label
                      className="fs-13 fw-600"
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      {is9 ? "SD 9h:" : "SD:"}
                      <input
                        type="number"
                        step="0.1"
                        placeholder={is9 ? "ex: 14.2" : "ex: 28.5"}
                        value={round.sdInput}
                        onChange={(e) =>
                          updateRound(round.id, {
                            sdInput: e.target.value,
                          })
                        }
                        style={{
                          width: 90,
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid var(--line)",
                          background: "var(--bg-card)",
                          color: "var(--text-1)",
                          fontFamily: "inherit",
                          fontSize: "var(--fs-14)",
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    </label>
                    {is9 && (() => {
                      const v = parseFloat(round.sdInput.replace(",", "."));
                      if (isNaN(v)) return null;
                      const e9 = round1(expectedSD9(hiRef));
                      const sd18 = sd18FromSd9(v, hiRef);
                      return (
                        <span className="muted fs-11">
                          + exp9({hiRef.toFixed(1)}) = {e9.toFixed(1)} →{" "}
                          <span
                            className={`p p-${sdClassByHcp(sd18, hiRef)} fs-12 fw-800`}
                          >
                            SD18 {sd18.toFixed(1)}
                          </span>
                        </span>
                      );
                    })()}
                  </>
                ) : round.mode === "manual" ? (
                  <>
                    {(["cr", "slope", "par"] as const).map((f) => (
                      <label
                        key={f}
                        className="fs-13 fw-600"
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                      >
                        {f === "cr" ? "CR:" : f === "slope" ? "Slope:" : "Par:"}
                        <input
                          type="number"
                          step={f === "cr" ? "0.1" : "1"}
                          placeholder={
                            f === "cr" ? "ex: 67.8" : f === "slope" ? "ex: 120" : is9 ? "36" : "72"
                          }
                          value={manualFieldValue(round, f)}
                          onChange={(e) =>
                            updateRound(round.id, {
                              [f === "cr" ? "crInput" : f === "slope" ? "slopeInput" : "parInput"]:
                                e.target.value,
                            })
                          }
                          style={{
                            width: f === "par" ? 56 : 74,
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid var(--line)",
                            background: "var(--bg-card)",
                            color: "var(--text-1)",
                            fontFamily: "inherit",
                            fontSize: "var(--fs-14)",
                            fontWeight: 700,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        />
                      </label>
                    ))}
                    <label
                      className="fs-13 fw-600"
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      {is9 ? "Gross (9h):" : "Gross:"}
                      <input
                        type="number"
                        step="1"
                        placeholder={is9 ? "ex: 42" : "ex: 85"}
                        value={round.grossInput}
                        onChange={(e) =>
                          updateRound(round.id, { grossInput: e.target.value })
                        }
                        style={{
                          width: 80,
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid var(--line)",
                          background: "var(--bg-card)",
                          color: "var(--text-1)",
                          fontFamily: "inherit",
                          fontSize: "var(--fs-14)",
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    </label>
                    {computedSdRaw != null && !is9 && (
                      <span
                        className={`p p-${sdClassByHcp(computedSdRaw, hiRef)} fs-13 fw-800`}
                      >
                        SD {computedSdRaw.toFixed(1)}
                      </span>
                    )}
                    {computedSdRaw != null && is9 && exp9Preview != null && computedSd18 != null && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span
                          className={`p p-${sdClassByHcp(computedSd18, hiRef)} fs-12 fw-700`}
                          title="SD de 9 buracos antes da conversão para 18H"
                        >
                          SD9 {computedSdRaw.toFixed(1)}
                        </span>
                        <span className="muted fs-11">
                          + exp9({hiRef.toFixed(1)}) = {exp9Preview.toFixed(1)} →
                        </span>
                        <span
                          className={`p p-${sdClassByHcp(computedSd18, hiRef)} fs-13 fw-800`}
                          title="SD equivalente a 18H — é este que entra no pool WHS"
                        >
                          SD18 {computedSd18.toFixed(1)}
                        </span>
                      </span>
                    )}
                    {(ratings.cr == null || ratings.slope == null) && (
                      <span className="muted fs-11">
                        Preenche CR e Slope{is9 ? ` de ${holesLabel(round.holesMode)}` : ""} para ver o SD.
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <select
                      className="select"
                      value={round.courseKey}
                      onChange={(e) =>
                        updateRound(round.id, {
                          courseKey: e.target.value,
                        })
                      }
                      style={{ minWidth: 180, maxWidth: 320 }}
                    >
                      {allRatedCourses.map((c) => (
                        <option key={c.courseKey} value={c.courseKey}>
                          {playedNormSet.has(norm(c.master.name))
                            ? "★ "
                            : ""}
                          {c.master.name}
                        </option>
                      ))}
                    </select>
                    {playerSex && (
                      <SexBadge
                        sex={playerSex}
                        className="fs-11"
                      />
                    )}
                    <select
                      className="select"
                      value={teeId}
                      onChange={(e) =>
                        updateRound(round.id, {
                          teeId: e.target.value,
                        })
                      }
                      disabled={validTees.length === 0}
                      title={
                        playerSex
                          ? `A mostrar apenas tees ${playerSex === "M" ? "Masculinos" : "Femininos"}`
                          : undefined
                      }
                    >
                      {validTees.length === 0 && (
                        <option value="">— sem tees disponíveis —</option>
                      )}
                      {validTees.map((t) => {
                        if (is9) {
                          const r9 = get9hRatings(
                            t,
                            round.holesMode as "front9" | "back9"
                          );
                          if (!r9) return null;
                          return (
                            <option key={t.teeId} value={t.teeId}>
                              {t.teeName} — CR {r9.cr} / Slope {r9.slope} /
                              Par {r9.par}
                            </option>
                          );
                        }
                        return (
                          <option key={t.teeId} value={t.teeId}>
                            {t.teeName} — CR{" "}
                            {t.ratings.holes18!.courseRating} / Slope{" "}
                            {t.ratings.holes18!.slopeRating}
                          </option>
                        );
                      })}
                    </select>
                    <label
                      className="fs-13 fw-600"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {is9 ? "Gross (9h):" : "Gross:"}
                      <input
                        type="number"
                        step="1"
                        placeholder={is9 ? "ex: 42" : "ex: 85"}
                        value={round.grossInput}
                        onChange={(e) =>
                          updateRound(round.id, {
                            grossInput: e.target.value,
                          })
                        }
                        style={{
                          width: 80,
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid var(--line)",
                          background: "var(--bg-card)",
                          color: "var(--text-1)",
                          fontFamily: "inherit",
                          fontSize: "var(--fs-14)",
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    </label>
                    {computedSdRaw != null && !is9 && (
                      <span
                        className={`p p-${sdClassByHcp(
                          computedSdRaw,
                          hiRef
                        )} fs-13 fw-800`}
                      >
                        SD {computedSdRaw.toFixed(1)}
                      </span>
                    )}
                    {computedSdRaw != null && is9 && exp9Preview != null && computedSd18 != null && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span
                          className={`p p-${sdClassByHcp(
                            computedSd18,
                            hiRef
                          )} fs-12 fw-700`}
                          title="SD de 9 buracos antes da conversão para 18H"
                        >
                          SD9 {computedSdRaw.toFixed(1)}
                        </span>
                        <span className="muted fs-11">
                          + exp9({hiRef.toFixed(1)}) = {exp9Preview.toFixed(1)} →
                        </span>
                        <span
                          className={`p p-${sdClassByHcp(
                            computedSd18,
                            hiRef
                          )} fs-13 fw-800`}
                          title="SD equivalente a 18H — é este que entra no pool WHS"
                        >
                          SD18 {computedSd18.toFixed(1)}
                        </span>
                      </span>
                    )}
                    {ratings.cr != null && (
                      <span className="muted fs-11">
                        CR {ratings.cr} / Slope{" "}
                        {ratings.slope} / Par{" "}
                        {ratings.par}
                        {is9 && ` · ${holesLabel(round.holesMode)}`}
                      </span>
                    )}
                    {is9 && !has9Hsupport && round.courseKey && (
                      <span
                        className="fs-11"
                        style={{ color: "var(--color-warn, #e07b00)" }}
                        title="Este campo não tem ratings oficiais de 9 buracos registados"
                      >
                        ⚠ Este campo não tem CR/Slope 9H. Escolhe outro campo ou modo 18.
                      </span>
                    )}
                    {is9 && has9Hsupport && validTees.length === 0 && (
                      <span
                        className="fs-11"
                        style={{ color: "var(--color-warn, #e07b00)" }}
                      >
                        ⚠ Sem tees com CR/Slope para {holesLabel(round.holesMode)} neste campo.
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* 9H → 18H conversion notice (quando a ronda foi validamente simulada em 9H) */}
              {result?.valid && is9hMode(result.holesMode) &&
                result.sd9 != null && result.exp9 != null && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "6px 10px",
                    borderRadius: 6,
                    fontSize: "var(--fs-11)",
                    lineHeight: 1.55,
                    background: "var(--bg-detail)",
                    border: "1px dashed var(--border)",
                    color: "var(--text-2)",
                  }}
                >
                  🎯 <b>{holesLabel(result.holesMode)}</b>: SD9{" "}
                  <b>{result.sd9.toFixed(1)}</b>
                  {" + "}exp9(HI {result.hiBeforeRound.toFixed(1)}) ={" "}
                  <b>{result.exp9.toFixed(1)}</b>
                  {" → SD equivalente 18H "}
                  <b>{result.sd!.toFixed(1)}</b> — é este valor que entra na janela WHS (Regra 5.1c).
                </div>
              )}

              {/* Exceptional score notice */}
              {result?.valid && result.exceptionalAdj !== 0 && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "6px 10px",
                    borderRadius: 6,
                    fontSize: "var(--fs-11)",
                    lineHeight: 1.6,
                    background:
                      "var(--bg-warn, rgba(224,123,0,0.08))",
                    border: `1px solid ${result.exceptionalAdj === -2 ? "var(--color-danger)" : "var(--color-warn, #e07b00)"}`,
                    color:
                      result.exceptionalAdj === -2
                        ? "var(--color-danger)"
                        : "var(--color-warn, #e07b00)",
                  }}
                >
                  ⚡ <b>Exceptional Score:</b> SD{" "}
                  {result.sd!.toFixed(1)} é <b>
                    {result.exceptionalDiff.toFixed(1)} pancadas
                  </b>{" "}
                  abaixo do HI {result.hiBeforeRound.toFixed(1)}
                  {" "}→ redução de <b>{result.exceptionalAdj}</b> aplicada a
                  todos os {result.poolAfter.length} SDs da janela (Regra 5.9)
                </div>
              )}
            </div>
          );
        })}

        {/* Adicionar ronda */}
        <button
          onClick={addRound}
          style={{
            border: "1px dashed var(--line)",
            borderRadius: "var(--radius-xl)",
            background: "transparent",
            cursor: "pointer",
            padding: "9px 16px",
            color: "var(--text-2)",
            fontSize: "var(--fs-13)",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "background .12s, border-color .12s, color .12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.borderColor = "var(--chart-2)";
            e.currentTarget.style.color = "var(--chart-2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "var(--line)";
            e.currentTarget.style.color = "var(--text-2)";
          }}
        >
          ＋ Adicionar ronda
        </button>
      </div>

      {/* ── Timeline ── */}
      {validResults.length > 0 && (
        <>
        <div className="rsim-sec">
          Evolução do Handicap Index
          <span className="rsim-sec-meta">
            {validResults.length} ronda{validResults.length !== 1 ? "s" : ""} simulada{validResults.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 0,
            marginBottom: 16,
            borderRadius: 10,
            overflow: "hidden",
            border: "1px solid var(--border)",
            width: "fit-content",
            maxWidth: "100%",
          }}
        >
          {/* HCP actual */}
          <div
            style={{
              padding: "12px 16px",
              background: "var(--bg-detail)",
              textAlign: "center",
              minWidth: 80,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontSize: "var(--fs-10)",
                color: "var(--text-3)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".05em",
                marginBottom: 2,
              }}
            >
              Actual
            </div>
            <div
              className="fw-900"
              style={{ fontSize: "var(--fs-22)", lineHeight: 1 }}
            >
              {currentHI.toFixed(1)}
            </div>
            <div style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", marginTop: 2 }}>
              {qtyCalcCur} mel./{initialPool.length}
            </div>
          </div>

          {validResults.map((r, i) => (
            <React.Fragment key={r.roundId}>
              {/* Seta */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0 4px",
                  background: "var(--bg-detail)",
                  color: "var(--text-3)",
                }}
              >
                →
              </div>
              {/* Ronda */}
              <div
                style={{
                  padding: "10px 14px",
                  textAlign: "center",
                  minWidth: 90,
                  background:
                    r.delta < -0.05
                      ? "rgba(34,197,94,0.08)"
                      : r.delta > 0.05
                        ? "rgba(239,68,68,0.08)"
                        : "var(--bg-card)",
                  borderLeft: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    fontSize: "var(--fs-10)",
                    color: "var(--text-3)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    marginBottom: 2,
                  }}
                >
                  Ronda {i + 1}
                  {is9hMode(r.holesMode)
                    ? r.holesMode === "front9"
                      ? " · F9"
                      : " · B9"
                    : ""}
                  {r.exceptionalAdj !== 0 ? " ⚡" : ""}
                </div>
                <div
                  style={{
                    fontSize: "var(--fs-20)",
                    fontWeight: 900,
                    lineHeight: 1,
                    color:
                      r.delta < -0.05
                        ? "var(--color-good)"
                        : r.delta > 0.05
                          ? "var(--color-danger)"
                          : "var(--text-1)",
                  }}
                >
                  {r.hiAfterRound.toFixed(1)}
                </div>
                <div
                  style={{
                    fontSize: "var(--fs-11)",
                    fontWeight: 700,
                    color:
                      r.delta < -0.05
                        ? "var(--color-good)"
                        : r.delta > 0.05
                          ? "var(--color-danger)"
                          : "var(--text-3)",
                    marginTop: 2,
                  }}
                >
                  {r.delta > 0 ? "+" : ""}{r.delta.toFixed(1)}
                </div>
              </div>
            </React.Fragment>
          ))}

          {/* HCP final (se >1 ronda) */}
          {validResults.length > 1 && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0 4px",
                  background: "var(--bg-detail)",
                  color: "var(--text-3)",
                  fontWeight: 700,
                }}
              >
                ═
              </div>
              <div
                style={{
                  padding: "10px 16px",
                  textAlign: "center",
                  minWidth: 90,
                  background: "var(--bg-detail)",
                  borderLeft: `3px solid ${finalDColor}`,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    fontSize: "var(--fs-10)",
                    color: "var(--text-3)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    marginBottom: 2,
                  }}
                >
                  Final
                </div>
                <div
                  className="fw-900"
                  style={{
                    fontSize: "var(--fs-24)",
                    lineHeight: 1,
                    color: finalDColor,
                  }}
                >
                  {finalHI.toFixed(1)}
                </div>
                <div
                  className="fs-11 fw-700"
                  style={{ color: finalDColor, marginTop: 2 }}
                >
                  {finalDelta > 0 ? "+" : ""}{finalDelta.toFixed(1)} total
                </div>
              </div>
            </>
          )}
        </div>
        </>
      )}

      {/* ── Tabela Gross→HCP ── */}
      {grossTable && (
        <details className="rsim-collapse" open>
          <summary>
            Tabela de impacto — ronda {grossTable.roundIdx + 1}
            <span className="rsim-sum-meta">
            {grossTable.roundIdx > 0 && (
              <>
                {" "}(após {grossTable.roundIdx} ronda
                {grossTable.roundIdx > 1 ? "s" : ""} já simulada
                {grossTable.roundIdx > 1 ? "s" : ""})
              </>
            )}
            {" · "}CR {grossTable.cr} / Slope {grossTable.slope} / Par{" "}
            {grossTable.par}
            </span>
          </summary>
          <div className="rsim-collapse-body">
          {(() => {
            // Intervalo focado: janela compacta centrada no gross introduzido
            // (ou no par, se ainda não houver gross). Não usamos "entra no top"
            // como critério — para jogadores muito fortes quase tudo entra no
            // top e a tabela voltava a ficar gigante.
            const enteredRow = grossTable.rows.find((r) => r.isEntered);
            const anchor = enteredRow ? enteredRow.toPar : 0;
            const loPar = anchor + (grossTable.is9 ? -4 : -5);
            const hiPar = anchor + (grossTable.is9 ? 4 : 6);
            const impactRows = impactFull
              ? grossTable.rows
              : grossTable.rows.filter(
                  (row) => row.isEntered || (row.toPar >= loPar && row.toPar <= hiPar)
                );
            const hidden = grossTable.rows.length - impactRows.length;
            return (
          <>
          <div className="muted fs-11 mb-6" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {grossTable.is9 && (
              <span>
                {holesLabel(grossTable.holesMode)} · exp9(HI) ={" "}
                <b>{grossTable.exp9?.toFixed(1)}</b> somado a cada SD9 para 18H equivalente
              </span>
            )}
            {(impactFull || hidden > 0) && (
              <button
                onClick={() => setImpactFull((v) => !v)}
                style={{
                  marginLeft: "auto", border: "1px solid var(--line)", background: "transparent",
                  cursor: "pointer", borderRadius: 6, padding: "2px 9px", fontSize: "var(--fs-11)",
                  color: "var(--text-2)", fontWeight: 600,
                }}
              >
                {impactFull ? "▾ Intervalo focado" : `▸ Ver intervalo completo (+${hidden})`}
              </button>
            )}
          </div>
          <div className="scroll-x">
            <table className="dtable-sm">
              <thead>
                <tr>
                  <th className="r">Pancadas{grossTable.is9 ? " (9h)" : ""}</th>
                  <th className="r">Ao par</th>
                  {grossTable.is9 && <th className="r">SD 9h</th>}
                  <th className="r">{grossTable.is9 ? "SD 18h" : "SD"}</th>
                  <th className="r">HCP</th>
                  <th className="r">Δ</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {impactRows.map((row) => {
                  const dc =
                    row.delta < -0.05
                      ? "var(--color-good)"
                      : row.delta > 0.05
                        ? "var(--color-danger)"
                        : "var(--text-3)";
                  const hiRef =
                    simResults!.results[grossTable.roundIdx]
                      ?.hiBeforeRound ?? currentHI;
                  return (
                    <tr
                      key={row.gross}
                      className={row.isEntered ? "rsim-entered" : row.entersTop ? "rsim-toprow" : undefined}
                      style={{ opacity: row.delta > 0.7 ? 0.55 : 1 }}
                    >
                      <td className="r fw-700">
                        {row.gross}
                        {row.isEntered && (
                          <span
                            style={{
                              marginLeft: 4,
                              fontSize: "var(--fs-10)",
                              color: "var(--chart-2)",
                              fontWeight: 700,
                            }}
                          >
                            ◀
                          </span>
                        )}
                      </td>
                      <td className="r muted">
                        {row.toPar >= 0 ? "+" : ""}
                        {row.toPar}
                      </td>
                      {grossTable.is9 && (
                        <td className="r muted fs-11">
                          {row.sd9 != null ? row.sd9.toFixed(1) : "—"}
                        </td>
                      )}
                      <td className="r">
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                          {row.exceptionalAdj !== 0 && (
                            <span
                              style={{
                                fontSize: "var(--fs-9)",
                                color: "var(--color-warn, #e07b00)",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                              }}
                            >
                              ⚡{row.exceptionalAdj}
                            </span>
                          )}
                          <span
                            className={`p p-${sdClassByHcp(row.sd, hiRef)} fs-11`}
                          >
                            {row.sd.toFixed(1)}
                          </span>
                        </span>
                      </td>
                      <td className="r fw-700" style={{ color: dc }}>
                        {row.newHI.toFixed(1)}
                      </td>
                      <td className="r fw-700" style={{ color: dc }}>
                        {row.delta > 0 ? "+" : ""}{row.delta.toFixed(1)}
                      </td>
                      <td className="fs-11">
                        {row.entersTop ? (
                          <span className="c-par-ok fw-600">
                            ★ top-
                            {whsQtyCalc(
                              simResults!.finalPool.length
                            )}
                          </span>
                        ) : row.delta < -0.05 ? (
                          <span style={{ color: "var(--color-good)" }}>
                            ↓ melhora
                          </span>
                        ) : row.delta > 0.05 ? (
                          <span style={{ color: "var(--color-danger)" }}>
                            ↑ agrava
                          </span>
                        ) : (
                          <span className="muted">= sem impacto</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
            );
          })()}
          </div>
        </details>
      )}

      {/* ── Janela WHS final ── */}
      {simResults && validResults.length > 0 && (
        <details className="rsim-collapse" open>
          <summary>
            Janela WHS após simulação
            <span className="rsim-sum-meta">
              {simResults.finalPool.length} rondas · ★ top-{whsQtyCalc(simResults.finalPool.length)} entram no cálculo · verde = ronda simulada
            </span>
          </summary>
          <div className="rsim-collapse-body">
          <div className="scroll-x">
          <table className="dtable-sm">
            <thead>
              <tr>
                <th className="r">WHS#</th>
                <th>Data</th>
                <th>Campo</th>
                <th className="r">HCP</th>
                <th>Tee</th>
                <th className="r">Gross</th>
                <th className="r">SD</th>
                <th className="r">SD adj.</th>
                <th className="r">Top</th>
              </tr>
            </thead>
            <tbody>
              {simResults.finalPool.map((entry, i) => {
                const r = entry.origRound;
                const adjSd = entry.sd + entry.adj;
                const isTop = finalTopIds.has(entry.eid);
                const wasTop = simResults.oldTopIds.has(entry.eid);
                const entered = isTop && !wasTop && !entry.isSimulated;
                const exited = !isTop && wasTop;
                const hasAdj = entry.adj !== 0;
                const res = entry.isSimulated
                  ? validResults.find((x) => x.roundId === entry.eid)
                  : null;
                return (
                  <tr
                    key={entry.eid + i}
                    style={{
                      background: entry.isSimulated
                        ? "var(--bg-success)"
                        : undefined,
                      fontWeight: entry.isSimulated ? 600 : undefined,
                    }}
                  >
                    <td
                      className="r"
                      style={{
                        fontSize: "var(--fs-11)",
                        fontWeight: 700,
                        color: "var(--text-2)",
                      }}
                    >
                      {i + 1}
                    </td>
                    <td>
                      {entry.isSimulated ? (
                        <span
                          style={{
                            color: "var(--color-good)",
                            fontWeight: 700,
                          }}
                        >
                          Nova {res ? res.roundIdx + 1 : ""}
                        </span>
                      ) : r ? (
                        <TeeDate date={r.date} tee={r.tee || ""} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {entry.isSimulated ? (
                        <span className="muted">
                          {res?.courseName ?? "—"}
                          {res && is9hMode(res.holesMode) && (
                            <span
                              style={{
                                marginLeft: 6,
                                background: "#fde68a",
                                color: "var(--color-warn-dark)",
                                borderRadius: 4,
                                padding: "1px 5px",
                                fontSize: "var(--fs-10)",
                                fontWeight: 700,
                              }}
                            >
                              {res.holesMode === "front9" ? "F9" : "B9"}
                            </span>
                          )}
                        </span>
                      ) : r ? (
                        <CourseLink name={r.course} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="r">{r?.hi ?? ""}</td>
                    <td>
                      {r?.tee ? <TeePill name={r.tee} /> : ""}
                    </td>
                    <td className="r">
                      {r?.gross != null ? (
                        <GrossCell
                          gross={r.gross}
                          par={r.par}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="r">
                      <span
                        className={`p p-${sdClassByHcp(
                          entry.sd,
                          currentHI
                        )} fs-11`}
                      >
                        {entry.sd.toFixed(1)}
                      </span>
                    </td>
                    <td className="r">
                      {hasAdj ? (
                        <span
                          style={{
                            display: "inline-flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                            gap: 1,
                          }}
                        >
                          <span
                            className={`p p-${sdClassByHcp(
                              adjSd,
                              currentHI
                            )} fs-11 fw-700`}
                          >
                            {adjSd.toFixed(1)}
                          </span>
                          <span
                            style={{
                              fontSize: "var(--fs-9)",
                              color: "var(--text-3)",
                              textDecoration: "line-through",
                            }}
                          >
                            {entry.sd.toFixed(1)}
                          </span>
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="r">
                      {(() => {
                        const nr = finalTopRanks.get(entry.eid);
                        const or = oldTopRanks.get(entry.eid);
                        const moved = !entry.isSimulated && or != null && or !== nr;
                        if (isTop) {
                          return (
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 3, whiteSpace: "nowrap" }}>
                              {entered && (
                                <span style={{ color: "var(--color-good)", fontWeight: 800 }} title="Entrou no top">↑</span>
                              )}
                              {moved && (
                                <>
                                  <span className="muted" style={{ fontSize: "var(--fs-10)", textDecoration: "line-through" }}>#{or}</span>
                                  <span
                                    className="fs-10"
                                    style={{ color: nr! > or! ? "var(--color-danger)" : "var(--color-good)" }}
                                  >
                                    {nr! > or! ? "↓" : "↑"}
                                  </span>
                                </>
                              )}
                              <span className="c-par-ok">★</span>
                              <span className="fw-700">#{nr}</span>
                            </span>
                          );
                        }
                        if (exited) {
                          return (
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 3, whiteSpace: "nowrap" }}>
                              {or != null && <span className="muted" style={{ fontSize: "var(--fs-10)", textDecoration: "line-through" }}>#{or}</span>}
                              <span style={{ color: "var(--color-danger)", fontWeight: 800 }}>✕</span>
                            </span>
                          );
                        }
                        return <span className="muted">–</span>;
                      })()}
                    </td>
                  </tr>
                );
              })}
              {displacedEntries.length > 0 && (
                <>
                  <tr>
                    <td
                      colSpan={9}
                      style={{
                        padding: "4px 8px",
                        background: "var(--bg-header)",
                        fontSize: "var(--fs-10)",
                        color: "var(--text-3)",
                        fontWeight: 700,
                        letterSpacing: ".05em",
                      }}
                    >
                      DESLOCADAS — saíram da janela
                    </td>
                  </tr>
                  {displacedEntries.map((entry, i) => {
                    const r = entry.origRound;
                    const wasTop = simResults.oldTopIds.has(
                      entry.eid
                    );
                    return (
                      <tr
                        key={entry.eid + "_out_" + i}
                        style={{ opacity: 0.38 }}
                      >
                        <td
                          className="r"
                          style={{
                            fontSize: "var(--fs-11)",
                            color: "var(--color-danger)",
                            fontWeight: 700,
                          }}
                        >
                          out
                        </td>
                        <td>
                          {r ? (
                            <TeeDate
                              date={r.date}
                              tee={r.tee || ""}
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {r ? (
                            <CourseLink name={r.course} />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="r">{r?.hi ?? ""}</td>
                        <td>
                          {r?.tee ? (
                            <TeePill name={r.tee} />
                          ) : (
                            ""
                          )}
                        </td>
                        <td className="r">
                          {r?.gross != null ? (
                            <GrossCell
                              gross={r.gross}
                              par={r.par}
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="r">
                          <span
                            className={`p p-${sdClassByHcp(
                              entry.sd,
                              currentHI
                            )} fs-11`}
                          >
                            {entry.sd.toFixed(1)}
                          </span>
                        </td>
                        <td className="r">
                          <span className="muted">—</span>
                        </td>
                        <td className="r">
                          {wasTop ? (
                            <span
                              style={{
                                color: "var(--color-danger)",
                              }}
                            >
                              ★ saiu
                            </span>
                          ) : (
                            <span className="muted">–</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
          </div>
          </div>
        </details>
      )}
    </div>
  );

  return bare ? (
    inner
  ) : (
    <div className="card mb-12">
      <div className="h-xs fs-18 mb-4">
        🎯 Simulador de Rondas
      </div>
      {inner}
    </div>
  );
}
