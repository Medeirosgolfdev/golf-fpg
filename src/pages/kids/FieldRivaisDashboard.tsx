/**
 * kids/FieldRivaisDashboard.tsx — Tabela tipo RivaisDashboard alimentada
 * dinamicamente pelos inscritos de um torneio futuro.
 *
 * Linhas: jogadores inscritos no escalão de Manuel + Manuel REF
 * Colunas: torneios USKids europeus passados relevantes (de uskids-member-history-slim.json)
 * UP: torneios futuros (incluindo o actual)
 *
 * Reutiliza o componente visual RivaisDashboard sem o modificar.
 */
import React, { useEffect, useMemo, useState } from "react";
import RivaisDashboard from "../../ui/RivaisDashboard";
import { cachedFetchJson } from "../../data/fetchCache";
import { meanArr } from "../../utils/mathUtils";
import { normName, type AutoRivalPlayer } from "../../data/KIDSdataLoader";
import type { RivalPlayer, TournDef, RoundAvg } from "../../ui/bjgtAnalysisTypes";

// Mapeamento país-ISO (curto) → nome extenso (RivaisDashboard usa "co" extenso)
const CO_FULL: Record<string, string> = {
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", CH: "Switzerland",
  CN: "China", DE: "Germany", DK: "Denmark", ES: "Spain",
  FI: "Finland", FR: "France", GB: "United Kingdom", GR: "Greece",
  HU: "Hungary", IE: "Ireland", IT: "Italy", JP: "Japan",
  LT: "Lithuania", LU: "Luxembourg", LV: "Latvia", NL: "Netherlands",
  NO: "Norway", PL: "Poland", PT: "Portugal", RO: "Romania",
  RU: "Russian Federation", SE: "Sweden", SK: "Slovakia",
  TH: "Thailand", TR: "Turkey", UA: "Ukraine", US: "United States",
};
const fullCo = (cc: string): string => CO_FULL[(cc || "").toUpperCase()] || cc || "—";

// ─────────────────────────────────────────────────────────────────────
// Tcodes "canónicos" que aparecem sempre como coluna se metadata existe.
// Apenas torneios que são bons indicadores de nível para Boys 12 europeus:
// European, World, Venice, Marco Simone, Rome, Holiday Classic.
// (Sem Sandestin/Desert/MS State/RWB — esses só aparecem se ≥ MIN_PARTICIPANTS.)
// ─────────────────────────────────────────────────────────────────────
const CANONICAL_TCODES = new Set([
  // European Championship — 4 edições mais recentes
  "8300",  "13568", "15704", "18242",                  // 2022, 2023, 2024, 2025
  // World Championship — 4 edições mais recentes
  "11604", "14029", "15807", "18124",                  // 2022, 2023, 2024, 2025
  // Venice Open — 4 edições mais recentes
  "12229", "14302", "16428", "19418",                  // 2022, 2023, 2024, 2025
  // Marco Simone Invitational — última edição (estreou 2025)
  "18438", "21080",                                    // 2025, 2026
  // Rome Classic — última edição (estreou 2025)
  "20175",                                             // 2025
  // Holiday Classic — 3 edições mais recentes
  "15480", "18000", "20878",                           // 2023, 2024, 2025
]);

// Threshold mínimo: torneios não-canónicos com pelo menos N jogadores do escalão
const MIN_PARTICIPANTS = 5;
// Máximo de colunas (para não rebentar a UI) — prioridade aos mais recentes
const MAX_COLUMNS = 20;

// Tids "extra" vindos de autoRivals (não estão no member-history-slim).
// Para cada um: nome, abreviado, rondas, par, mês/ano para ordenação.
// Estes são WJGC, EOWAGR, Doral — torneios importantes mas hospedados noutros datasets.
interface ExtraTidDef { tid: string; name: string; short: string; rounds: number; par: number; sortDate: string }
const EXTRA_TIDS: ExtraTidDef[] = [
  // WJGC (Villa Padierna, Espanha)
  { tid: "wjgc25_b1011", name: "WJGC 2025 B10-11", short: "WJGC '25", rounds: 3, par: 71, sortDate: "2025-02-25" },
  { tid: "wjgc26",       name: "WJGC 2026 B10-11", short: "WJGC '26", rounds: 3, par: 72, sortDate: "2026-02-25" },
  { tid: "wjgc26_1213",  name: "WJGC 2026 B12-13", short: "WJGC '26 B12-13", rounds: 3, par: 72, sortDate: "2026-02-25" },
  // EOWAGR (Aragon Open, Espanha)
  { tid: "eowagr25",     name: "EOWAGR 2025",      short: "EU Open '25", rounds: 3, par: 72, sortDate: "2025-08-15" },
  // Doral (First Tee Miami, USA)
  { tid: "doral24_b1011",name: "Doral 2024 B10-11",short: "Doral '24", rounds: 2, par: 71, sortDate: "2024-12-15" },
  { tid: "doral25_b1011",name: "Doral 2025 B10-11",short: "Doral '25", rounds: 2, par: 71, sortDate: "2025-12-15" },
  { tid: "doral25_b1213",name: "Doral 2025 B12-13",short: "Doral '25 B12-13", rounds: 2, par: 71, sortDate: "2025-12-15" },
];

// Próximos torneios (UP) — onde os rivais podem aparecer inscritos
const UP_TORN: Array<{ id: string; name: string; short?: string; url?: string; tcode?: string }> = [
  { id: "european26", tcode: "21131", name: "European Championship 2026", short: "EU '26", url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/521131/european-championship-2026/field" },
  { id: "marcoLT26",  tcode: "21573", name: "Marco Simone Local Tour",   short: "M.SIM LT",  url: "" },
  { id: "world26",    tcode: "21610", name: "World Championship 2026",   short: "WC '26", url: "" },
];

// ─────────────────────────────────────────────────────────────────────
// Types do field e member-history
// ─────────────────────────────────────────────────────────────────────
interface FieldPlayer { nome: string; pais: string; cidade?: string }
interface FieldEscalao { nome: string; jogadores?: FieldPlayer[] }
interface FieldTorneio { t: number; name: string; date_inicio: string; escaloes: FieldEscalao[] }
interface FieldData { torneios: FieldTorneio[] }

interface MHRound { gross: number; strokes?: number[] }
interface MHTorn { ageGroup: string; place: number | null; rounds: Record<string, MHRound> }
interface MHPlr { name: string; country: string; torneios: Record<string, MHTorn> }
interface MHSlim {
  torneios: Record<string, { name: string; startDate: string; holesPerRound: number; par: number[] | null }>;
  jogadores: Record<string, MHPlr>;
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────
export default function FieldRivaisDashboard({ defaultT = 21131, defaultEscalao = "Boys 12", onSelectPlayer, autoRivals }: {
  defaultT?: number;
  defaultEscalao?: string;
  onSelectPlayer?: (name: string) => void;
  autoRivals?: AutoRivalPlayer[];
}) {
  const [field, setField] = useState<FieldData | null>(null);
  const [mh, setMh] = useState<MHSlim | null>(null);
  const [torneioT, setTorneioT] = useState<number>(defaultT);
  const [escalaoNome, setEscalaoNome] = useState<string>(defaultEscalao);

  // Load field + member history
  useEffect(() => {
    cachedFetchJson<FieldData>("/data/uskids-field.json").then(d => d && setField(d)).catch(() => {});
    cachedFetchJson<MHSlim>("/data/uskids-member-history-slim.json").then(d => d && setMh(d)).catch(() => {});
  }, []);

  // Lista de torneios futuros disponíveis para escolher
  const futureTorneios = useMemo(() => {
    if (!field) return [];
    const today = new Date().toISOString().slice(0, 10);
    return field.torneios
      .filter(t => {
        // converter "5/26/2026" → "2026-05-26"
        const [m, d, y] = (t.date_inicio || "").split("/");
        if (!y) return false;
        const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        return iso >= today;
      })
      .sort((a, b) => {
        const pa = (a.date_inicio || "").split("/").reverse().join("");
        const pb = (b.date_inicio || "").split("/").reverse().join("");
        return pa.localeCompare(pb);
      });
  }, [field]);

  // Escalões disponíveis para o torneio escolhido
  const escaloesDisponiveis = useMemo(() => {
    const t = futureTorneios.find(x => x.t === torneioT);
    if (!t) return [] as string[];
    return t.escaloes.filter(e => (e.jogadores?.length ?? 0) > 0).map(e => e.nome);
  }, [futureTorneios, torneioT]);

  // Construir dataset {D, T, UP, manuel, AVG_R, T_WEIGHTS, allCountries}
  const dataset = useMemo(() => {
    if (!field || !mh) return null;
    const torneio = field.torneios.find(t => t.t === torneioT);
    if (!torneio) return null;
    const esc = torneio.escaloes.find(e => e.nome === escalaoNome);
    if (!esc?.jogadores?.length) return null;

    // Index por nome normalizado → memberId
    const nameToMid: Record<string, string> = {};
    for (const [mid, p] of Object.entries(mh.jogadores)) {
      const k = normName(p.name);
      if (k) nameToMid[k] = mid;
    }
    // Fuzzy fallback por first+last
    function findMid(nome: string): string | null {
      const k = normName(nome);
      if (nameToMid[k]) return nameToMid[k];
      const parts = k.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        const first = parts[0], last = parts[parts.length - 1];
        for (const [kk, mid] of Object.entries(nameToMid)) {
          const kp = kk.split(/\s+/).filter(Boolean);
          if (kp[0] === first && kp[kp.length - 1] === last) return mid;
        }
      }
      return null;
    }

    const isManuelName = (n: string) => normName(n).includes("manuel medeiros");

    // ── PASSO 1: descobrir tcodes comuns entre os jogadores do escalão ──
    const tcodeCount = new Map<string, number>();
    const fieldMids: Array<{ p: FieldPlayer; mid: string | null; isM: boolean }> = [];
    const manuelMid = findMid("Manuel Medeiros");

    // Manuel REF (sempre presente, mesmo se não inscrito neste escalão)
    if (manuelMid && !esc.jogadores.some(p => isManuelName(p.nome))) {
      fieldMids.push({ p: { nome: "Manuel Medeiros", pais: "PT" }, mid: manuelMid, isM: true });
    }
    for (const p of esc.jogadores) {
      const mid = findMid(p.nome);
      fieldMids.push({ p, mid, isM: isManuelName(p.nome) });
    }

    // Contagem
    for (const fm of fieldMids) {
      if (!fm.mid) continue;
      const prof = mh.jogadores[fm.mid];
      for (const tcode of Object.keys(prof.torneios)) {
        tcodeCount.set(tcode, (tcodeCount.get(tcode) ?? 0) + 1);
      }
    }

    // ── PASSO 2: seleccionar tcodes a mostrar ──
    // Inclui TODOS os canónicos (mesmo com 0 participantes do escalão actual —
    // são bons indicadores de nível) + não-canónicos com >= MIN_PARTICIPANTS.
    const allTcodes = new Set<string>([...CANONICAL_TCODES, ...tcodeCount.keys()]);
    const selectedTcodes = [...allTcodes]
      .filter(tcode => {
        // Canónicos: sempre incluir (se metadata existe)
        if (CANONICAL_TCODES.has(tcode)) return !!mh.torneios[tcode];
        // Não-canónicos: precisam de MIN_PARTICIPANTS
        return (tcodeCount.get(tcode) ?? 0) >= MIN_PARTICIPANTS;
      })
      .sort((a, b) => {
        // ordenar por data desc (mais recente primeiro)
        const da = mh.torneios[a]?.startDate || "";
        const db = mh.torneios[b]?.startDate || "";
        const pa = da.split("/").map(Number); // M/D/YYYY
        const pb = db.split("/").map(Number);
        const dateA = (pa[2] || 0) * 10000 + (pa[0] || 0) * 100 + (pa[1] || 0);
        const dateB = (pb[2] || 0) * 10000 + (pb[0] || 0) * 100 + (pb[1] || 0);
        return dateB - dateA;
      })
      .slice(0, MAX_COLUMNS)
      .map(tcode => ({ tcode, count: tcodeCount.get(tcode) ?? 0 }));

    // ── PASSO 3: construir TournDef[] a partir dos tcodes seleccionados ──
    function shortName(name: string): string {
      // "European Championship 2024" → "EU '24"; "Venice Open 2025" → "Venice '25"
      const m = name.match(/^(.+?)\s+(\d{4})$/);
      if (!m) return name.slice(0, 12);
      const base = m[1], yr = m[2].slice(2);
      if (/european championship/i.test(base)) return `EU '${yr}`;
      if (/world championship/i.test(base)) return `WC '${yr}`;
      if (/marco simone/i.test(base)) return `M.SIM '${yr}`;
      if (/venice/i.test(base)) return `Venice '${yr}`;
      if (/rome/i.test(base)) return `Rome '${yr}`;
      if (/red white.*blue/i.test(base)) return `RWB '${yr}`;
      if (/el prat/i.test(base)) return `El Prat '${yr}`;
      if (/sandestin/i.test(base)) return `Sandestin '${yr}`;
      if (/desert/i.test(base)) return `Desert '${yr}`;
      if (/mississippi/i.test(base)) return `MS '${yr}`;
      // fallback: first 8 chars + apóstrofo + ano
      return `${base.slice(0, 8)} '${yr}`;
    }

    const T: TournDef[] = selectedTcodes.map(({ tcode, count }) => {
      const meta = mh.torneios[tcode];
      const name = meta?.name || `tcode ${tcode}`;
      // Buracos por ronda: usar holesPerRound se existir; senão inferir do array par
      const holes = meta?.holesPerRound ?? (meta?.par && meta.par.length === 9 ? 9 : 18);
      // Par por ronda: sumar APENAS os primeiros `holes` valores
      const par = meta?.par
        ? meta.par.slice(0, holes).reduce((a, b) => a + b, 0)
        : (holes === 9 ? 36 : 72);
      // contar nº max de rondas que algum jogador tem
      let maxRounds = 1;
      for (const fm of fieldMids) {
        if (!fm.mid) continue;
        const tEntry = mh.jogadores[fm.mid].torneios[tcode];
        if (tEntry?.rounds) maxRounds = Math.max(maxRounds, Object.keys(tEntry.rounds).length);
      }
      return {
        id: `usk${tcode}`,
        name,
        short: shortName(name),
        date: meta?.startDate || "",
        rounds: maxRounds,
        par,
        holes,
        field: count,        // proxy: número de jogadores DO ESCALÃO que jogaram
        nations: 0,           // será recalculado abaixo após D estar pronto
        url: "",
      };
    });

    // ── PASSO 3b: adicionar tids "extra" (WJGC, EOWAGR, Doral) via autoRivals ──
    // autoRivals tem dados destes torneios em r[tid]. Cruzamos por nome normalizado.
    const arByName: Record<string, AutoRivalPlayer> = {};
    if (autoRivals) {
      for (const ar of autoRivals) {
        const k = normName(ar.n);
        if (k) arByName[k] = ar;
      }
    }
    function findAR(nome: string): AutoRivalPlayer | null {
      const k = normName(nome);
      if (arByName[k]) return arByName[k];
      const parts = k.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        const first = parts[0], last = parts[parts.length - 1];
        for (const [kk, ar] of Object.entries(arByName)) {
          const kp = kk.split(/\s+/).filter(Boolean);
          if (kp[0] === first && kp[kp.length - 1] === last) return ar;
        }
      }
      return null;
    }

    // Contar quantos jogadores do escalão têm dados em cada EXTRA_TID
    const extraCounts = new Map<string, number>();
    const extraData = new Map<string, Map<string, { p: number | string; t: number | null; tp: number | null; rd: number[] }>>(); // tid → playerName → result
    for (const fm of fieldMids) {
      const ar = findAR(fm.p.nome);
      if (!ar) continue;
      for (const def of EXTRA_TIDS) {
        const res = ar.r[def.tid];
        if (!res || res.tp == null) continue;
        const rounds = (res as any).rd as number[] | undefined;
        if (!rounds || rounds.length === 0) continue;
        const total = rounds.reduce((a, b) => a + b, 0);
        const place = (res as any).p as number | undefined;
        extraCounts.set(def.tid, (extraCounts.get(def.tid) ?? 0) + 1);
        let m = extraData.get(def.tid);
        if (!m) { m = new Map(); extraData.set(def.tid, m); }
        m.set(normName(fm.p.nome), {
          p: place && place > 0 ? place : "WD",
          t: total,
          tp: (res as any).tp ?? null,
          rd: rounds,
        });
      }
    }
    // Adicionar EXTRA_TIDS com >= 1 participante como colunas (são canónicos no contexto)
    for (const def of EXTRA_TIDS) {
      if ((extraCounts.get(def.tid) ?? 0) < 1) continue;
      T.push({
        id: def.tid,
        name: def.name,
        short: def.short,
        date: def.sortDate,
        rounds: def.rounds,
        par: def.par,
        field: extraCounts.get(def.tid) ?? 0,
        nations: 0,
        url: "",
      });
    }
    // ── Ordenar T: agrupar por série, edições antigas → recentes, ─────────
    // séries ordenadas pela sua edição mais antiga.
    function toTs(d: string): number {
      if (!d) return 0;
      if (/\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d).getTime();
      const [m, dd, y] = d.split("/").map(Number);
      if (!y) return 0;
      return new Date(y, (m || 1) - 1, dd || 1).getTime();
    }
    // Extrair "série" do short (ex: "EU '24" → "EU", "WJGC '26 B12-13" → "WJGC B12-13")
    function seriesKey(short: string): string {
      // Tirar a parte do ano '24 / '25 / '26
      return short.replace(/\s*'?\d{2}\s*/g, " ").replace(/\s+/g, " ").trim();
    }
    const seriesOf = new Map<string, string>();      // tid → seriesKey
    const seriesEarliest = new Map<string, number>(); // seriesKey → ts da edição + antiga
    for (const td of T) {
      const sk = seriesKey(td.short);
      seriesOf.set(td.id, sk);
      const ts = toTs(td.date);
      const prev = seriesEarliest.get(sk);
      if (prev == null || ts < prev) seriesEarliest.set(sk, ts);
    }
    T.sort((a, b) => {
      const ska = seriesOf.get(a.id)!;
      const skb = seriesOf.get(b.id)!;
      if (ska !== skb) {
        // séries diferentes: ordenar pela sua edição + antiga
        return (seriesEarliest.get(ska) ?? 0) - (seriesEarliest.get(skb) ?? 0);
      }
      // mesma série: ordenar por data asc (antigo → recente)
      return toTs(a.date) - toTs(b.date);
    });
    // Boundary tids: primeiro tid de cada série na ordem final
    const seriesBoundaries = new Set<string>();
    let prevSk: string | null = null;
    for (const td of T) {
      const sk = seriesOf.get(td.id)!;
      if (sk !== prevSk) {
        seriesBoundaries.add(td.id);
        prevSk = sk;
      }
    }

    // ── PASSO 4: construir D[] com results por torneio seleccionado ──
    const D: RivalPlayer[] = [];
    for (const fm of fieldMids) {
      const r: Record<string, { p: number | string; t: number | null; tp: number | null; rd: number[] }> = {};
      if (fm.mid) {
        const prof = mh.jogadores[fm.mid];
        for (const td of T) {
          if (!td.id.startsWith("usk")) continue; // skip extras here
          const tcode = td.id.slice(3); // strip "usk" prefix
          const tEntry = prof.torneios[tcode];
          if (!tEntry) continue;
          const place = tEntry.place ?? 0;
          const rounds = Object.keys(tEntry.rounds).sort((a, b) => Number(a) - Number(b))
            .map(rn => tEntry.rounds[rn].gross)
            .filter(g => g > 0);
          if (rounds.length === 0) continue;
          const total = rounds.reduce((a, b) => a + b, 0);
          // tp já com par per-round correcto (td.par considera só os `holes` primeiros)
          const tp = td.par > 0 ? total - td.par * rounds.length : null;
          r[td.id] = { p: place > 0 ? place : "WD", t: total, tp, rd: rounds };
        }
      }
      // Preencher tids "extra" a partir do extraData (vindo de autoRivals)
      const playerKey = normName(fm.p.nome);
      for (const def of EXTRA_TIDS) {
        const m = extraData.get(def.tid);
        if (!m) continue;
        const data = m.get(playerKey);
        if (data) r[def.tid] = data;
      }

      const up: string[] = [];
      const upCurrent = UP_TORN.find(u => u.tcode === String(torneioT));
      if (upCurrent && !fm.isM) up.push(upCurrent.id);

      // Buscar DOB do autoRival correspondente (existe quando o loader cruza com players.json)
      const ar = findAR(fm.p.nome);
      const dob = (ar as any)?.dob as string | undefined;

      D.push({
        n: fm.p.nome,
        co: fullCo(fm.p.pais),
        isM: fm.isM,
        r,
        up: fm.isM ? UP_TORN.map(u => u.id) : up,
        dob,
      });
    }

    if (D.length === 0) return null;

    // Recalcular nations por torneio (contar países únicos de quem jogou)
    for (const td of T) {
      const countries = new Set<string>();
      for (const p of D) {
        if (p.r[td.id]) countries.add(p.co);
      }
      td.nations = countries.size;
    }

    // AVG_R: média + std por ronda em cada torneio
    const AVG_R: Record<string, RoundAvg[]> = {};
    for (const td of T) {
      AVG_R[td.id] = [];
      for (let i = 0; i < td.rounds; i++) {
        const vals = D.filter(p => p.r[td.id] && p.r[td.id].rd && p.r[td.id].rd[i] != null).map(p => p.r[td.id].rd[i]);
        if (vals.length > 1) {
          const m = meanArr(vals) ?? 0;
          const s = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
          AVG_R[td.id][i] = { m, s };
        }
      }
    }

    // T_WEIGHTS — pesos de prestígio
    const maxR = Math.max(1, ...T.map(t => t.intendedRounds || t.rounds));
    const maxF = Math.max(1, ...T.map(t => t.field));
    const maxN = Math.max(1, ...T.map(t => t.nations));
    const T_WEIGHTS: Record<string, number> = {};
    for (const t of T) {
      T_WEIGHTS[t.id] = 0.40 * ((t.intendedRounds || t.rounds) / maxR)
                     + 0.35 * (t.field / maxF)
                     + 0.25 * (t.nations / maxN);
    }

    // Manuel
    const manuel = D.find(p => p.isM) ?? null;
    if (!manuel) return null;

    const allCountries = [...new Set(D.map(p => p.co))].sort();
    return { D, T, UP: UP_TORN, manuel, AVG_R, T_WEIGHTS, allCountries, seriesBoundaries };
  }, [field, mh, torneioT, escalaoNome, autoRivals]);

  // Render
  if (!field || !mh) {
    return <div className="muted p-16">A carregar dados de torneios futuros…</div>;
  }
  if (futureTorneios.length === 0) {
    return <div className="muted p-16">Sem torneios futuros disponíveis.</div>;
  }

  return (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <label className="muted fs-12">Torneio:</label>
        <select className="select fs-13" value={torneioT}
          onChange={e => {
            const newT = parseInt(e.target.value);
            setTorneioT(newT);
            // Reset escalão se já não existir no novo torneio
            const newTorn = futureTorneios.find(x => x.t === newT);
            const newEsc = newTorn?.escaloes.find(e => e.nome === escalaoNome);
            if (!newEsc) setEscalaoNome(newTorn?.escaloes[0]?.nome ?? "");
          }}>
          {futureTorneios.map(t => (
            <option key={t.t} value={t.t}>{t.name} ({t.date_inicio})</option>
          ))}
        </select>
        <label className="muted fs-12">Escalão:</label>
        <select className="select fs-13" value={escalaoNome} onChange={e => setEscalaoNome(e.target.value)}>
          {escaloesDisponiveis.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {dataset
        ? <RivaisDashboard
            onSelectPlayer={onSelectPlayer}
            D={dataset.D}
            T={dataset.T}
            UP={dataset.UP}
            manuel={dataset.manuel}
            T_WEIGHTS={dataset.T_WEIGHTS}
            AVG_R={dataset.AVG_R}
            allCountries={dataset.allCountries}
            showManuelKpis={false}
            seriesBoundaries={dataset.seriesBoundaries}
            fieldMode={true}
            tournamentDate={(() => {
              // Converter date_inicio "5/26/2026" → "2026-05-26"
              const t = futureTorneios.find(x => x.t === torneioT);
              if (!t) return undefined;
              const [m, d, y] = (t.date_inicio || "").split("/");
              if (!y) return undefined;
              return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            })()}
          />
        : <div className="muted p-16">Sem dados para este torneio/escalão.</div>
      }
    </div>
  );
}
