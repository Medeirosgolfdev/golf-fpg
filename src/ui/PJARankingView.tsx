import React, { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSort } from "../hooks/useSort";
import { escPillCls, type EscLookup } from "../utils/playerUtils";
import { ESC_STYLE, PillBadge, RoundPill } from "./PillBadge";
import SexBadge from "./SexBadge";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import FilterChip from "./FilterChip";
import { CrossSeasonTable, SortTh as CSortTh } from "./CrossSeasonTable";
import { isManuel, fmtTP, tpColor, TournPName, type PlayersDB } from "./tournamentPrimitives";
import { fmtDate, escalaoAtDate } from "../utils/format";
import type { RoundScore, Player, Tournament } from "../data/fpgTypes";

/* ─────────────────────────────────────────────
   RANKING PJA
   Tabela simples de ranking: # · Jogador · Esc · Clube · Voltas · Pts
   Filtros: escalão + pesquisa nome
   Pontos: par=25, −1 por pancada acima, +1 abaixo (mín 0); GF×1.5
   Top 14 voltas por ano contam para o total.

   Regras 2026+ (conforme Regulamento PJA TOUR 2026):
   - Drive Tour (FPG): conta para todos os PJA
   - Aquapor (FPG, 2 dias): só os 2 primeiros do ano; só conta para
     atletas que por idade não podem jogar Drive Tour (quem joga DT não
     pontua Aquapor)
   - Greatgolf Junior Open Main (3 dias, Sub 16+): só R2+R3 contam
     (Sub 12/14 jogam na sua categoria 2 dias, regra uniformiza)
   - Torneios exclusivos PJA: contam todas as rondas
   - Grande Final (Dunas): pts × 1.5 por ronda
   - Apenas membros PJA (tag "PJA" em players.json) aparecem no ranking
   - Top 14 rondas por ano

   Para anos anteriores a 2026, o ranking mantém a lógica antiga: todos
   os jogadores dos torneios PJA exclusivos, sem as regras especiais.
   ───────────────────────────────────────────── */

/** Classificação de um torneio para o ranking PJA. */
type PJAEventType = "DT" | "AQUAPOR" | "GG_MAIN" | "GG_U14" | "GG_U12" | "PJA_EXCL";

function classifyPJAEvent(t: Tournament): PJAEventType | null {
  const name = t.name || "";
  const tcode = String(t.tcode || "");
  // Greatgolf tcodes 2026 (nome + tcode para evitar colisões com Drive Challenge)
  if (/greatgolf/i.test(name)) {
    if (tcode === "10294") return "GG_MAIN";
    if (tcode === "10295") return "GG_U14";
    if (tcode === "10296") return "GG_U12";
    // Greatgolf noutros anos (ex. 10260 em 2025) — tratar como exclusivo
    return "PJA_EXCL";
  }
  if (/Circuito\s+Aquapor/i.test(name)) return "AQUAPOR";
  if (/Drive\s+Tour/i.test(name) && !/Challenge/i.test(name)) return "DT";
  // Senão: torneio exclusivo PJA (já passou o filtro PJA em FPGPage)
  return "PJA_EXCL";
}

interface PJARound {
  roundKey: string;
  label: string;
  date: string;
}

interface PJATournCol {
  tournKey: string;
  name: string;
  date: string;
  campo: string;
  isGF: boolean;
  rounds: PJARound[];
  colSpan: number;
  /** ccode do torneio — usado para construir URL `/FPG/torneio/{ccode}-{tcode}`. */
  ccode?: string;
  /** tcode (ou tcode+tcode para sintéticos). */
  tcode?: string;
  /** Nº real de rondas do torneio — pode ser maior que `rounds.length` quando
   *  alguma ronda está ocultada por regra (ex: GG Main 3R → mostra só R2+R3). */
  totalRondas?: number;
}

interface PJARoundResult {
  toPar: number;
  pts: number;
  inTop14: boolean;
  /** Ronda foi excluída do ranking (ex. GG Main R1, Aquapor com DT, >2 Aquapor). */
  excluded?: boolean;
  /** Razão da exclusão, para tooltip/debug. */
  excludedReason?: string;
}

interface PJAPRow {
  key: string;
  name: string;
  fedCode?: string;
  club: string;
  escalao: string;
  sex: string;
  hcp: number | null;
  results: Map<string, PJARoundResult>;
  allRounds: { roundKey: string; pts: number }[];
  total: number;
  voltas: number;
  eligible: boolean;
}

/* ─────────────────────────────────────────────
   Helper Functions
   ───────────────────────────────────────────── */

function pjaPts(toPar: number, gf: boolean): number {
  return Math.max(0, 25 - toPar) * (gf ? 1.5 : 1);
}

function fmtPts(pts: number): string {
  return pts % 1 === 0 ? String(pts) : pts.toFixed(1);
}

function isGFTournament(t: Tournament): boolean {
  return /dunas/i.test(t.name) || /grande\s*final/i.test(t.name);
}

/** Decompõe o nome de um torneio em {circuito, local}. Exemplos:
 *  "1º Torneio Drive Tour Madeira - Palheiro Golf" → { circuito: "DT1 Madeira", local: "Palheiro Golf" }
 *  "3º Torneio Drive Tour Tejo – Santo Estêvão"    → { circuito: "DT3 Tejo",    local: "Santo Estêvão" }
 *  "1º Torneio do Circuito Aquapor-Morgado Golf"   → { circuito: "Aquapor",     local: "Morgado Golf" }
 *  "Greatgolf Junior Open ... -U14"                 → { circuito: "Greatgolf U14", local: "Laguna" }
 *  "PJA Race to Dunas"                              → { circuito: "PJA",         local: "Race to Dunas" }
 */
function shortTournName(name: string, campo?: string): { circuito: string; local: string } {
  const n = (name || "").trim();
  // Greatgolf variants
  const ggU = n.match(/Greatgolf.*?-?\s*U\s*(\d+)/i);
  if (ggU) return { circuito: `Greatgolf U${ggU[1]}`, local: campo || "Laguna" };
  if (/greatgolf/i.test(n)) return { circuito: "Greatgolf", local: campo || "Laguna" };
  // Aquapor
  const aq = n.match(/Circuito\s+Aquapor\s*(?:-|–)?\s*(.+)$/i);
  if (aq) return { circuito: "Aquapor", local: (aq[1] || "").trim() };
  // Drive Tour — extrair nº do torneio + região + local (após "-")
  const dt = n.match(/^(\d+)º\s+Torneio\s+(?:do\s+Circuito\s+)?Drive\s+Tour\s*(.*)$/i);
  if (dt) {
    const num = dt[1];
    const rest = dt[2].trim(); // "Madeira - Palheiro Golf" ou "- Quinta do Vale" etc.
    const parts = rest.split(/\s*[-–]\s*/).map(s => s.trim()).filter(Boolean);
    let regiao = "", local = "";
    if (parts.length >= 2) { regiao = parts[0]; local = parts.slice(1).join(" · "); }
    else if (parts.length === 1) {
      // Sem região (raro) — usar único segmento como local
      regiao = "";
      local = parts[0];
    }
    // Casos especiais
    if (/terceira/i.test(regiao) || /terceira/i.test(rest)) {
      regiao = regiao || "Açores";
      if (!local) local = "Terceira";
    }
    const circuito = regiao ? `DT${num} ${regiao}` : `DT${num}`;
    return { circuito, local: local || (campo || "") };
  }
  // PJA exclusivo ou fallback
  const pjaMatch = n.match(/^PJA\s+(.+)$/i);
  if (pjaMatch) return { circuito: "PJA", local: pjaMatch[1].trim() };
  return { circuito: n, local: campo || "" };
}

/** Data curta "DD/MM" (extraí de YYYY-MM-DD). */
function shortDate(isoDate?: string): string {
  if (!isoDate || isoDate.length < 10) return "";
  return isoDate.slice(8, 10) + "/" + isoDate.slice(5, 7);
}

/* ─────────────────────────────────────────────
   Local Components
   ───────────────────────────────────────────── */

const PName = ({ name, fedCode, playersDB }: { name: string; fedCode?: string; playersDB: PlayersDB }) =>
  <TournPName name={name} fedCode={fedCode} playersDB={playersDB} />;

/* ─────────────────────────────────────────────
   Main Component
   ───────────────────────────────────────────── */

export interface PjaPdfEntry {
  fed: string; name: string; rounds: number; pts: number; pos: number;
}

export function PJARankingView({
  pjaList, playersDB, loading, pjaMembersByYear, pjaPdfSnapshotByYear, externalFilterName,
}: {
  pjaList: Tournament[];
  playersDB: PlayersDB;
  loading: boolean;
  /** fedCodes inscritos no circuito PJA por ano. Jogadores que pontuaram mas
   *  não constam aqui para o ano corrente aparecem na tabela "Não inscritos". */
  pjaMembersByYear?: Record<string, string[]>;
  /** Snapshot do PDF oficial por ano — activa colunas Δ pts / Δ rondas na tabela
   *  para destacar disparidades entre o nosso cálculo e o PDF. */
  pjaPdfSnapshotByYear?: Record<string, PjaPdfEntry[]>;
  /** Filtro de nome/clube externo (normalmente da toolbar da FPGPage).
   *  Quando definido, sobrepõe o filterName interno (inline fallback). */
  externalFilterName?: string;
}) {
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const t of pjaList) if (t.date) s.add(t.date.substring(0, 4));
    return [...s].sort().reverse();
  }, [pjaList]);

  const [activeYear, setActiveYear] = useState<string>("");
  const year = activeYear || years[0] || "";

  const { sortKey, sortDir, toggleSort: handleSort, resetSort: resetYearSort } = useSort<string>("total", "desc");
  const [filterEsc, setFilterEsc] = useState<string[]>([]);
  const [internalFilterName, setFilterName] = useState("");
  // Quando a FPGPage passa um search externo (via toolbar unificada), usa-o;
  // senão cai no state interno (uso standalone). Trim+lowercase feito nos consumers.
  const filterName = (externalFilterName ?? internalFilterName) || "";
  /** Jogador seleccionado via clique na linha (fedCode ou "name:..."). Clicar
   *  outra vez no mesmo jogador desmarca. Permite destacar visualmente e
   *  comparar mais facilmente. */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);


  function toggleEsc(e: string) {
    setFilterEsc(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }

  // Categoria de um torneio para ordenar por grupo na tabela.
  // Ordem: Madeira → Sul → Tejo → Norte → Açores → Aquapor → Greatgolf →
  // PJA exclusivos. Dentro de cada grupo, ordena por data ascendente.
  const tournSortKey = (t: Tournament): string => {
    const n = t.name || "";
    const date = t.date || "";
    const evType = classifyPJAEvent(t);
    // DT por região
    if (evType === "DT") {
      if (/Madeira/i.test(n))  return `1_madeira_${date}`;
      if (/\bSul\b|Laguna|Vila Sol|Penina|Vale.*—|Quinta do Vale|Pinheiros Altos/i.test(n)) return `2_sul_${date}`;
      if (/\bTejo\b|Montado|Sto\.?\s*Est[eê]v[aã]o|Santo Est[eê]v[aã]o|Lisbon|Jamor|Belas/i.test(n)) return `3_tejo_${date}`;
      if (/\bNorte\b|Estela|Vale Pis[aã]o|Ponte de Lima|Vidago/i.test(n)) return `4_norte_${date}`;
      if (/Terceira|A[çc]ores/i.test(n)) return `5_acores_${date}`;
      return `6_dt_outros_${date}`;
    }
    if (evType === "AQUAPOR") return `7_aquapor_${date}`;
    if (evType && evType.startsWith("GG")) return `8_gg_${date}`;
    return `9_pja_excl_${date}`;  // PJA exclusivo / torneios manuais
  };

  const yearTournaments: Tournament[] = useMemo(() =>
    pjaList
      .filter(t => (t.date || "").startsWith(year))
      .sort((a, b) => tournSortKey(a).localeCompare(tournSortKey(b)))
  , [pjaList, year]);

  const tournCols: PJATournCol[] = useMemo(() => {
    const cols: PJATournCol[] = [];
    for (const t of yearTournaments) {
      const isSynth = !!t._isSynthetic;
      const subRounds: Tournament[] = t._subRounds || [];
      const isGF = isGFTournament(t);
      const tournKey = t.tcode + "_" + t.date;

      // Descobrir nº de rondas: preferencialmente pelos subRounds sintéticos,
      // senão por t.rounds ou pelo máximo de roundScores de algum jogador.
      let nR = 1;
      if (isSynth && subRounds.length > 1) nR = subRounds.length;
      else if (t.rounds && t.rounds > 1) nR = t.rounds;
      else {
        for (const p of (t.players || [])) {
          const rs = (p as any).roundScores;
          if (rs && rs.length > nR) nR = rs.length;
        }
      }

      const ccode = (t as any).ccode || "";
      const tcode = String((t as any).tcode || "");
      // GG Main 3R em 2026+: R1 nunca conta (regulamento §2.5 — só os últimos 2
      // dias contam). Ocultar a coluna R1 e mostrar só R2/R3.
      const evType = classifyPJAEvent(t);
      const hideR1 = (year >= "2026") && evType === "GG_MAIN" && nR === 3;

      if (nR > 1) {
        const rounds: PJARound[] = [];
        for (let i = 0; i < nR; i++) {
          if (hideR1 && i === 0) continue;  // R1 ocultada
          rounds.push({
            roundKey: tournKey + "_r" + (i + 1),
            label: "R" + (i + 1),
            date: (subRounds[i]?.date) || t.date || "",
          });
        }
        cols.push({ tournKey, name: t.name, date: t.date || "", campo: t.campo || "", isGF, rounds, colSpan: rounds.length * 2, ccode, tcode, totalRondas: nR });
      } else {
        cols.push({ tournKey, name: t.name, date: t.date || "", campo: t.campo || "", isGF, rounds: [{ roundKey: tournKey + "_r1", label: "", date: t.date || "" }], colSpan: 2, ccode, tcode, totalRondas: 1 });
      }
    }
    return cols;
  }, [yearTournaments]);

  // Para regras 2026+: identificar os 2 primeiros Aquapor do ano (ordem cronológica)
  // — só esses contam para o ranking PJA.
  const aquaporAllowedKeys = useMemo(() => {
    if (year < "2026") return null;  // Aquapor não se aplica a anos anteriores
    const aqs = yearTournaments
      .filter(t => classifyPJAEvent(t) === "AQUAPOR")
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .slice(0, 2);
    return new Set(aqs.map(t => t.tcode + "_" + t.date));
  }, [yearTournaments, year]);

  const allRows: PJAPRow[] = useMemo(() => {
    const map = new Map<string, PJAPRow>();
    const applyNewRules = year >= "2026";

    // Track, per player, whether they played any Drive Tour this year.
    // Used to exclude Aquapor rounds for players who also played DT.
    const playerDidDT = new Map<string, boolean>();

    for (const t of yearTournaments) {
      const evType = classifyPJAEvent(t);
      if (!evType) continue;
      // Com regras novas, Aquapor fora dos 2 primeiros é ignorado por completo
      if (applyNewRules && evType === "AQUAPOR" && aquaporAllowedKeys && !aquaporAllowedKeys.has(t.tcode + "_" + t.date)) {
        continue;
      }
      for (const p of t.players) {
        if (evType === "DT") {
          const k = p.fedCode || ("name:" + (p.name || "").toLowerCase().trim());
          playerDidDT.set(k, true);
        }
      }
    }

    for (const t of yearTournaments) {
      const evType = classifyPJAEvent(t);
      if (!evType) continue;
      if (applyNewRules && evType === "AQUAPOR" && aquaporAllowedKeys && !aquaporAllowedKeys.has(t.tcode + "_" + t.date)) continue;

      const isSynth = !!t._isSynthetic;
      const subRounds: Tournament[] = t._subRounds || [];
      const isGF = isGFTournament(t);
      const tournKey = t.tcode + "_" + t.date;

      for (const p of t.players) {
        const playerKey = p.fedCode || ("name:" + p.name.toLowerCase().trim());

        if (!map.has(playerKey)) {
          const db = p.fedCode ? playersDB[p.fedCode] : null;
          const clubRaw = db?.club;
          const club = clubRaw
            ? (typeof clubRaw === "object" ? (clubRaw as any).short || "" : String(clubRaw))
            : (p.club || "");
          const dob = (db as any)?.dob;
          const escByYear = dob && year ? escalaoAtDate(dob, year) : null;
          const historic = (p as any).escalao;
          const esc = escByYear
            || (historic ? String(historic).replace("-", " ").replace(/sub(\d)/i, "Sub $1").trim() : "")
            || db?.escalao
            || "";
          map.set(playerKey, {
            key: playerKey, name: p.name, fedCode: p.fedCode,
            club, escalao: esc,
            sex: db?.sex || "", hcp: p.hcpExact ?? null,
            results: new Map(), allRounds: [], total: 0, voltas: 0, eligible: false,
          });
        }
        const row = map.get(playerKey)!;
        if (p.hcpExact != null) row.hcp = p.hcpExact;

        // Aquapor: se jogador fez DT no ano, as rondas não contam.
        const aquaporSkipped = applyNewRules && evType === "AQUAPOR" && playerDidDT.get(playerKey) === true;

        const addRound = (roundNum: number, gross: number, par: number) => {
          if (!par || !gross || gross >= 900) return;
          const tp = gross - par;
          const pts = pjaPts(tp, isGF);
          const roundKey = tournKey + "_r" + roundNum;

          // GG Main (Sub 16+ joga 3 dias): só R2 e R3 contam para PJA
          const ggMainExcluded = applyNewRules && evType === "GG_MAIN" && roundNum === 1;
          const excluded = ggMainExcluded || aquaporSkipped;
          let excludedReason: string | undefined;
          if (ggMainExcluded) excludedReason = "Greatgolf Main: R1 não conta para o ranking PJA (só R2+R3)";
          else if (aquaporSkipped) excludedReason = "Aquapor: jogador também fez Drive Tour, Aquapor não conta";

          row.results.set(roundKey, { toPar: tp, pts, inTop14: false, excluded, excludedReason });
          if (!excluded) row.allRounds.push({ roundKey, pts });
        };

        if (isSynth && subRounds.length > 1 && p.roundScores && p.roundScores.length > 0) {
          p.roundScores.forEach((rs: any, i: number) => {
            const parR = (rs.pars || []).reduce((a: number, b: number) => a + b, 0);
            addRound(i + 1, rs.gross, parR);
          });
        } else if (p.roundScores && p.roundScores.length > 1) {
          // Multi-round não-sintético (e.g. pull-torneios 2-round event vindo directo)
          p.roundScores.forEach((rs: any, i: number) => {
            const parR = (rs.pars || []).reduce((a: number, b: number) => a + b, 0);
            addRound(i + 1, rs.gross, parR);
          });
        } else {
          const tp = typeof p.toPar === "string" ? parseInt(p.toPar) : p.toPar as number;
          const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal as number;
          if (tp == null || isNaN(tp) || gross == null || isNaN(gross) || gross >= 900) continue;
          const par = gross - tp;
          addRound(1, gross, par);
        }
      }
    }

    for (const row of map.values()) {
      const sorted = [...row.allRounds].sort((a, b) => b.pts - a.pts);
      const top14Keys = new Set(sorted.slice(0, 14).map(r => r.roundKey));
      for (const [rk, res] of row.results.entries()) {
        res.inTop14 = top14Keys.has(rk);
      }
      row.total = sorted.slice(0, 14).reduce((s, r) => s + r.pts, 0);
      row.voltas = row.allRounds.length;
      row.eligible = row.voltas >= 14;
    }

    // 2026+: injectar rows "esqueleto" (0 voltas, 0 pts) para TODOS os inscritos
    // da lista pja-members.json do ano corrente que ainda não pontuaram.
    // Assim o ranking mostra quem está inscrito mesmo antes de haver resultados
    // (ex: início da época, ou inscritos que só vão jogar torneios futuros).
    if (applyNewRules) {
      const inscritos = pjaMembersByYear?.[year] || [];
      for (const fed of inscritos) {
        if (map.has(fed)) continue;  // já tem dados a partir de torneios
        const db = playersDB[fed];
        if (!db) continue;  // fedCode desconhecido → ignorar
        const clubRaw = (db as any).club;
        const club = clubRaw
          ? (typeof clubRaw === "object" ? (clubRaw as any).short || "" : String(clubRaw))
          : "";
        const dob = (db as any).dob;
        const escByYear = dob && year ? escalaoAtDate(dob, year) : null;
        const esc = escByYear
          || ((db as any).escalao ? String((db as any).escalao).replace("-", " ").replace(/sub(\d)/i, "Sub $1").trim() : "")
          || "";
        map.set(fed, {
          key: fed,
          name: (db as any).name || fed,
          fedCode: fed,
          club,
          escalao: esc,
          sex: (db as any).sex || "",
          hcp: (db as any).hcpExact ?? (db as any).hcp ?? null,
          results: new Map(),
          allRounds: [],
          total: 0,
          voltas: 0,
          eligible: false,
        });
      }
    }

    // 2026+: mostrar todos os inscritos (incluindo 0 voltas/0 pts).
    // Anos anteriores: só quem pontuou.
    let rows = applyNewRules
      ? [...map.values()]
      : [...map.values()].filter(r => r.voltas > 0);

    // 2026+: filtrar apenas membros PJA (tag "PJA" em players.json).
    // Para anos anteriores (legado), qualquer participante aparece.
    if (applyNewRules) {
      rows = rows.filter(r => {
        if (!r.fedCode) return false;
        const db = playersDB[r.fedCode];
        const tags = (db as any)?.tags || [];
        return Array.isArray(tags) && tags.includes("PJA");
      });
    }

    return rows;
  }, [yearTournaments, playersDB, year, aquaporAllowedKeys, pjaMembersByYear]);

  // Conjunto de fedCodes INSCRITOS no ano corrente (lido de pja-members.json).
  // Se vazio/indefinido para este ano, tratamos todos os membros PJA como inscritos.
  const inscritosSet = useMemo(() => {
    const list = pjaMembersByYear?.[year];
    return list && list.length ? new Set(list) : null;
  }, [pjaMembersByYear, year]);

  // Filtrar tournCols para esconder colunas irrelevantes ao ranking:
  //  - Esconder torneios onde NENHUM inscrito PJA está nem registado nos
  //    players, nem em `_admissions`, nem em `_draws` (ex: DT Açores Terceira,
  //    DT4 Norte Ponte de Lima — só jogaram não-inscritos).
  //  - Mostrar torneios FUTUROS onde há inscritos PJA em `_admissions` / `_draws`
  //    mesmo sem rondas ainda (ex: PJA Aroeira 2 que vai acontecer).
  //  - Mostrar torneios PASSADOS onde algum inscrito PJA jogou.
  const visibleTournCols = useMemo(() => {
    const inscritosSetLocal = (() => {
      const list = pjaMembersByYear?.[year];
      return list && list.length ? new Set(list) : null;
    })();
    const hasPjaInscrito = (t: Tournament): boolean => {
      if (!inscritosSetLocal) return true;  // sem lista, assume que sim
      // 1. Players com grossTotal (torneio já jogado)
      for (const p of (t.players || [])) {
        if (p.fedCode && inscritosSetLocal.has(p.fedCode)) return true;
      }
      // 2. Admissions (torneio futuro com inscrições)
      const adm = (t as any)._admissions?.players as Array<{fed?: string|null}> | undefined;
      if (adm) {
        for (const p of adm) {
          if (p.fed && inscritosSetLocal.has(p.fed)) return true;
        }
      }
      // 3. Draws (pre-jogo)
      const dr = (t as any)._draws as Record<string, { groups?: Array<{ players?: Array<{ fed?: string|null }> }> }> | undefined;
      if (dr) {
        for (const round of Object.values(dr)) {
          for (const g of (round?.groups || [])) {
            for (const p of (g.players || [])) {
              if (p.fed && inscritosSetLocal.has(p.fed)) return true;
            }
          }
        }
      }
      return false;
    };
    return tournCols.filter(tc => {
      const t = yearTournaments.find(x => (x.tcode + "_" + x.date) === tc.tournKey);
      return !t || hasPjaInscrito(t);
    });
  }, [tournCols, yearTournaments, pjaMembersByYear, year]);

  // Map fedCode → entry do PDF oficial (para comparar e destacar disparidades).
  const pdfByFed = useMemo(() => {
    const map = new Map<string, PjaPdfEntry>();
    const arr = pjaPdfSnapshotByYear?.[year];
    if (arr) for (const e of arr) if (e.fed) map.set(String(e.fed), e);
    return map;
  }, [pjaPdfSnapshotByYear, year]);
  const hasPdfSnapshot = pdfByFed.size > 0;

  // Divide em 2 grupos: inscritos (ranking principal) e não-inscritos (lista
  // à parte, só para referência — estes não competem pelo troféu PJA).
  const { rowsInscritos, rowsNaoInscritos } = useMemo(() => {
    if (!inscritosSet) return { rowsInscritos: allRows, rowsNaoInscritos: [] };
    const ins: PJAPRow[] = [];
    const out: PJAPRow[] = [];
    for (const r of allRows) {
      if (r.fedCode && inscritosSet.has(r.fedCode)) ins.push(r);
      else out.push(r);
    }
    return { rowsInscritos: ins, rowsNaoInscritos: out };
  }, [allRows, inscritosSet]);

  const availEscs = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) if (r.escalao) s.add(r.escalao);
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [allRows]);

  const sortedRows = useMemo(() => {
    // Ranking principal = só inscritos no ano corrente (se houver lista).
    let rows = rowsInscritos;
    if (filterEsc.length) rows = rows.filter(r => filterEsc.includes(r.escalao));
    if (filterName.trim()) {
      const q = filterName.trim().toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.club.toLowerCase().includes(q));
    }
    const INF = 99999;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "name")    return mult * a.name.localeCompare(b.name, "pt");
      if (sortKey === "club")    return mult * a.club.localeCompare(b.club, "pt");
      if (sortKey === "escalao") return mult * a.escalao.localeCompare(b.escalao, "pt");
      if (sortKey === "voltas")  return mult * (a.voltas - b.voltas);
      if (sortKey.startsWith("toPar_")) {
        const rk = sortKey.slice(6);
        return mult * ((a.results.get(rk)?.toPar ?? INF) - (b.results.get(rk)?.toPar ?? INF));
      }
      if (sortKey.startsWith("pts_")) {
        const rk = sortKey.slice(4);
        return mult * ((a.results.get(rk)?.pts ?? -1) - (b.results.get(rk)?.pts ?? -1));
      }
      // NB: allRows depende só usado para filtros/availEscs; ranking usa rowsInscritos.
      return mult * (a.total - b.total);
    });
  }, [rowsInscritos, filterEsc, filterName, sortKey, sortDir]);

  // Não inscritos: também aceita filtro por escalão/nome, ordenados por total desc.
  const sortedNaoInscritos = useMemo(() => {
    let rows = rowsNaoInscritos;
    if (filterEsc.length) rows = rows.filter(r => filterEsc.includes(r.escalao));
    if (filterName.trim()) {
      const q = filterName.trim().toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.club.toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => b.total - a.total);
  }, [rowsNaoInscritos, filterEsc, filterName]);



  // Slot na toolbar principal da FPGPage. Se existir, renderizamos os filtros
  // via createPortal para lá (evita ter 2 toolbars empilhadas). Se não existir
  // (fallback), mostramos a toolbar dentro do próprio componente.
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.getElementById("pja-toolbar-slot");
    setToolbarSlot(el);
  }, []);

  if (loading && pjaList.length === 0) return <LoadingState size="sm" />;
  if (!year) return <div className="muted fs-11" style={{ padding: 24 }}>Sem torneios PJA.</div>;

  const toolbarInner = <>
    <div style={{ display: "flex", gap: 4 }}>
      {years.map(yr => (
        <button key={yr}
          className={"tourn-tab tourn-tab-sm" + (yr === year ? " active" : " tourn-tab-muted")}
          onClick={() => { setActiveYear(yr); setFilterEsc([]); setFilterName(""); resetYearSort(); }}
          style={{ flexShrink: 0 }}>
          {yr}
        </button>
      ))}
    </div>
    {/* Search removido — a FPGPage renderiza um search único na sua toolbar
        e passa o valor via `externalFilterName`. Fallback inline quando o
        componente é usado standalone (sem externalFilterName). */}
    {externalFilterName === undefined && (
      <div className="shrink-0" style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--text-muted)", pointerEvents: "none" }}>🔍</span>
        <input type="text" placeholder="Nome ou clube…" value={internalFilterName}
          onChange={e => setFilterName(e.target.value)}
          className="input-search" style={{ width: 140 }} />
      </div>
    )}
    {availEscs.length > 1 && <span style={{ color: "var(--border)" }}>|</span>}
    {availEscs.map(e => {
      const k = e.toLowerCase().replace(/[\s-]/g, "");
      const s = ESC_STYLE[k];
      return <FilterChip key={e} active={filterEsc.includes(e)} onClick={() => toggleEsc(e)} color={s?.bg}>{e}</FilterChip>;
    })}
    {(filterEsc.length > 0 || filterName) && <>
      <span className="muted fs-10">{sortedRows.length} de {allRows.length}</span>
      <FilterChip active={false} onClick={() => { setFilterEsc([]); if (externalFilterName === undefined) setFilterName(""); }}>✕ limpar</FilterChip>
    </>}
    <span className="muted fs-10 ml-auto" title="Regras de pontuação PJA 2026 aplicadas" style={{ whiteSpace: "nowrap" }}>
      Par=25pts · top 14 · GF×1,5
      {year >= "2026" && " · GG Main R2+R3"}
      {hasPdfSnapshot && <> · <span style={{ color: "var(--color-danger-dark, #991B1B)" }}>Δ PDF</span></>}
    </span>
    <span className="chip">{allRows.length} jog · {visibleTournCols.length} torn</span>
  </>;

  return (
    <div style={{ paddingTop: 12 }}>
      {/* Filtros: via portal para a toolbar da FPGPage se disponível, senão
          inline como toolbar própria (fallback para usos standalone). */}
      {toolbarSlot
        ? createPortal(toolbarInner, toolbarSlot)
        : <div className="toolbar" style={{ flexWrap: "wrap", gap: 6 }}>{toolbarInner}</div>
      }

      {sortedRows.length === 0
        ? <EmptyState size="sm" message={`Sem dados para ${year}.`} />
        : (
          <CrossSeasonTable
            identityColSpan={3}
            identityHeaders={<>
              <CSortTh k="rank"    s={sortKey} d={sortDir} on={handleSort} className="cs-pos sticky-col-0">#</CSortTh>
              <CSortTh k="name"    s={sortKey} d={sortDir} on={handleSort} className="cs-name sticky-col-1">Jogador</CSortTh>
              <CSortTh k="escalao" s={sortKey} d={sortDir} on={handleSort} className="cs-esc">Esc.</CSortTh>
              <CSortTh k="club"    s={sortKey} d={sortDir} on={handleSort} className="cs-club cs-id-end">Clube</CSortTh>
            </>}
            groups={visibleTournCols.map(tc => ({
              key: tc.tournKey,
              headerTh: (() => {
                const { circuito, local } = shortTournName(tc.name, tc.campo);
                // Tipografia uniforme: mesma font-size e font-weight nas 3 linhas.
                // Só a cor distingue hierarquia (título mais escuro; local+data mais muted).
                const lineStyle: React.CSSProperties = {
                  fontSize: 10,
                  fontWeight: 600,
                  lineHeight: 1.2,
                  whiteSpace: "normal",
                  textAlign: "center",
                };
                // Link para o torneio — base URL depende do tipo:
                //  - Drive Tour / Aquapor → /drive/torneio/... (estão na DrivePage)
                //  - Greatgolf, PJA exclusivos, torneios manuais → /FPG/torneio/...
                const firstTcode = (tc.tcode || "").split("+")[0];
                const isDriveOrAquapor = /Drive\s+Tour/i.test(tc.name) || /Circuito\s+Aquapor/i.test(tc.name);
                const base = isDriveOrAquapor ? "/drive/torneio" : "/FPG/torneio";
                const href = tc.ccode && firstTcode ? `${base}/${tc.ccode}-${firstTcode}` : null;
                const content = (
                  <>
                    <div style={{ ...lineStyle, color: "var(--text-1)" }}>
                      {circuito}
                      {tc.isGF && <span className="badge-gf" style={{ marginLeft: 3 }}>★1.5</span>}
                    </div>
                    <div style={{ ...lineStyle, color: "var(--text-2)" }}>
                      {local || "\u00A0"}
                    </div>
                    <div style={{ ...lineStyle, color: "var(--text-muted)" }}>
                      {shortDate(tc.date)}
                      {(tc.totalRondas ?? tc.rounds.length) > 1 && <>
                        {" · "}
                        <RoundPill nR={tc.totalRondas ?? tc.rounds.length} />
                        {tc.totalRondas && tc.totalRondas > tc.rounds.length && (
                          <span title={`Só ${tc.rounds.length} rondas contam para o ranking PJA (regulamento §2.5 — últimos 2 dias)`}
                                style={{ marginLeft: 3, fontSize: 9, fontWeight: 700, color: "var(--color-warn-dark)" }}>
                            {tc.rounds.length}/{tc.totalRondas} contam
                          </span>
                        )}
                      </>}
                    </div>
                  </>
                );
                return (
                  <th key={tc.tournKey} colSpan={tc.colSpan} className="cs-grp" style={{ padding: 0, verticalAlign: "top" }} title={tc.name + (tc.campo ? " — " + tc.campo : "") + (href ? " · clicar para abrir" : "")}>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer"
                         style={{ display: "block", padding: "4px 3px", textDecoration: "none", color: "inherit" }}
                         className="tourn-header-link">
                        {content}
                      </a>
                    ) : (
                      <div style={{ padding: "4px 3px" }}>{content}</div>
                    )}
                  </th>
                );
              })(),
              subHeaderThs: (
                <>
                  {tc.rounds.map(r => (
                    <React.Fragment key={r.roundKey}>
                      <CSortTh k={"toPar_" + r.roundKey} s={sortKey} d={sortDir} on={handleSort} className="cs-t-topar cs-grp">
                        {r.label ? <span style={{ fontSize: 10, fontWeight: 800, color: "var(--color-good-dark)" }}>{r.label}</span> : "±Par"}
                      </CSortTh>
                      <CSortTh k={"pts_" + r.roundKey} s={sortKey} d={sortDir} on={handleSort} className="cs-t-gross cs-col" style={{ color: "var(--color-warn-dark)", fontWeight: 700 }}>Pts</CSortTh>
                    </React.Fragment>
                  ))}
                </>
              ),
            }))}
            summaryGroupTh={<th className="cs-grp u-fw8-fs12" colSpan={hasPdfSnapshot ? 5 : 2}>
              Ranking{hasPdfSnapshot && <span className="muted fs-10" style={{ fontWeight: 500, marginLeft: 6 }}>· vs PDF oficial</span>}
            </th>}
            summarySubHeaders={<>
              <CSortTh k="voltas" s={sortKey} d={sortDir} on={handleSort} className="cs-s-games cs-grp">Voltas</CSortTh>
              <CSortTh k="total"  s={sortKey} d={sortDir} on={handleSort} className="cs-s-pts cs-col" style={{ color: "var(--color-warn-dark)", fontWeight: 800 }}>Total</CSortTh>
              {hasPdfSnapshot && <>
                <th className="cs-col" style={{ color: "var(--text-muted)", fontWeight: 700, fontSize: 10 }}>PDF pts</th>
                <th className="cs-col" style={{ color: "var(--text-muted)", fontWeight: 700, fontSize: 10 }}>Δ pts</th>
                <th className="cs-col" style={{ color: "var(--text-muted)", fontWeight: 700, fontSize: 10 }}>Δ r</th>
              </>}
            </>}
          >
            {sortedRows.map((row, idx) => {
              const isSel = selectedKey === row.key;
              const classes = [
                isManuel(row) ? "row-manuel" : "",
                isSel ? "row-selected" : "",
              ].filter(Boolean).join(" ") || undefined;
              return (
                <tr key={row.key} className={classes}
                    onClick={() => setSelectedKey(isSel ? null : row.key)}
                    style={{ cursor: "pointer" }}>
                  <td className="cs-pos sticky-col-0">{idx + 1}</td>
                  <td className="cs-name sticky-col-1">
                    <PName name={row.name} fedCode={row.fedCode} playersDB={playersDB} />
                    {row.sex === "F" && <SexBadge sex="F" className="ml-4" />}
                  </td>
                  <td className="cs-esc">
                    {row.escalao ? <span className={escPillCls(row.escalao) + " fs-10"}>{row.escalao}</span> : <span className="muted">–</span>}
                  </td>
                  <td className="cs-club cs-id-end">{row.club || "–"}</td>

                  {visibleTournCols.map(tc => {
                    const hasAny = tc.rounds.some(r => row.results.has(r.roundKey));
                    if (!hasAny) return <td key={tc.tournKey} colSpan={tc.colSpan} className="cs-grp" />;
                    return (
                      <React.Fragment key={tc.tournKey}>
                        {tc.rounds.map(r => {
                          const res = row.results.get(r.roundKey);
                          if (!res) return (
                            <React.Fragment key={r.roundKey}>
                              <td className="cs-t-topar cs-grp" />
                              <td className="cs-t-gross cs-col" />
                            </React.Fragment>
                          );
                          const tpStr = fmtTP(res.toPar);
                          const tpCol = tpColor(res.toPar);
                          const excludedStyle = res.excluded
                            ? { opacity: 0.4, textDecoration: "line-through" as const }
                            : {};
                          return (
                            <React.Fragment key={r.roundKey}>
                              <td className="cs-t-topar cs-grp" style={{ color: tpCol, ...excludedStyle }} title={res.excludedReason}>{tpStr}</td>
                              <td className="cs-t-gross cs-col" style={{ color: "var(--color-warn-dark)", ...excludedStyle }} title={res.excludedReason}>{fmtPts(res.pts)}</td>
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}

                  <td className="cs-s-games cs-grp">
                    {row.voltas}
                    {!row.eligible && <span title="< 14 rondas — não elegível para GF" className="badge-warn-sm ml-3">⚠</span>}
                  </td>
                  <td className="cs-s-pts cs-col" style={{ fontWeight: 800, color: "var(--color-warn-dark)", fontVariantNumeric: "tabular-nums" }}>
                    {fmtPts(row.total)}
                  </td>
                  {hasPdfSnapshot && (() => {
                    const pdf = row.fedCode ? pdfByFed.get(row.fedCode) : null;
                    if (!pdf) {
                      return <>
                        <td className="cs-col muted fs-10" style={{ textAlign: "center" }} title="Jogador não consta no snapshot do PDF oficial">–</td>
                        <td className="cs-col muted fs-10" style={{ textAlign: "center" }}>–</td>
                        <td className="cs-col muted fs-10" style={{ textAlign: "center" }}>–</td>
                      </>;
                    }
                    const dPts = row.total - pdf.pts;
                    const dR = row.voltas - pdf.rounds;
                    const okPts = dPts === 0;
                    const okR = dR === 0;
                    const okBg = "transparent";
                    const badBg = "var(--bg-danger-subtle, #FFE0E0)";
                    const fmtDiff = (n: number) => n === 0 ? "±0" : (n > 0 ? `+${n}` : `${n}`);
                    const title = (okPts && okR)
                      ? "✓ Bate com o PDF oficial"
                      : `PDF: ${pdf.pts}pts/${pdf.rounds}r · Cálc: ${row.total}pts/${row.voltas}r`;
                    return <>
                      <td className="cs-col fs-10" style={{ textAlign: "center", color: "var(--text-muted)" }} title={title}>
                        {pdf.pts}<span style={{ fontSize: 9, marginLeft: 2 }}>/{pdf.rounds}r</span>
                      </td>
                      <td className="cs-col" style={{ textAlign: "center", fontWeight: 700, background: okPts ? okBg : badBg, color: okPts ? "var(--text-muted)" : "var(--color-danger-dark, #991B1B)" }} title={title}>
                        {fmtDiff(dPts)}
                      </td>
                      <td className="cs-col" style={{ textAlign: "center", fontWeight: 700, background: okR ? okBg : badBg, color: okR ? "var(--text-muted)" : "var(--color-danger-dark, #991B1B)" }} title={title}>
                        {fmtDiff(dR)}
                      </td>
                    </>;
                  })()}
                </tr>
              );
            })}
          </CrossSeasonTable>
        )
      }

      {/* Tabela "Não inscritos" — jogadores com tag PJA mas que NÃO se
          inscreveram no circuito no ano corrente. Pontuam em eventos PJA
          na mesma, mas não entram no ranking oficial. */}
      {sortedNaoInscritos.length > 0 && (
        <div style={{ marginTop: 24, padding: "0 16px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
            <span className="fw-800 fs-12" style={{ color: "var(--text-2)" }}>
              Não inscritos no circuito {year}
            </span>
            <span className="muted fs-10">
              {sortedNaoInscritos.length} jogador{sortedNaoInscritos.length === 1 ? "" : "es"} · pontuou em eventos PJA mas não está inscrito, não conta para o ranking
            </span>
          </div>
          <table className="cs-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 8px", textAlign: "left" }}>#</th>
                <th style={{ padding: "6px 8px", textAlign: "left" }}>Jogador</th>
                <th style={{ padding: "6px 8px", textAlign: "center" }}>Esc.</th>
                <th style={{ padding: "6px 8px", textAlign: "left" }}>Clube</th>
                <th style={{ padding: "6px 8px", textAlign: "center" }}>Voltas</th>
                <th style={{ padding: "6px 8px", textAlign: "center", color: "var(--color-warn-dark)", fontWeight: 800 }}>Total pts</th>
              </tr>
            </thead>
            <tbody>
              {sortedNaoInscritos.map((row, idx) => {
                const isSel = selectedKey === row.key;
                return (
                <tr key={row.key}
                    className={isSel ? "row-selected" : undefined}
                    onClick={() => setSelectedKey(isSel ? null : row.key)}
                    style={{ opacity: isSel ? 1 : 0.75, cursor: "pointer" }}>
                  <td style={{ padding: "5px 8px" }}>{idx + 1}</td>
                  <td style={{ padding: "5px 8px" }}>
                    <PName name={row.name} fedCode={row.fedCode} playersDB={playersDB} />
                    {row.sex === "F" && <SexBadge sex="F" className="ml-4" />}
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>
                    {row.escalao ? <span className={escPillCls(row.escalao) + " fs-10"}>{row.escalao}</span> : <span className="muted">–</span>}
                  </td>
                  <td style={{ padding: "5px 8px" }}>{row.club || "–"}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{row.voltas}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center", fontWeight: 700, color: "var(--color-warn-dark)", fontVariantNumeric: "tabular-nums" }}>
                    {fmtPts(row.total)}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
