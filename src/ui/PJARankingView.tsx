import React, { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSort } from "../hooks/useSort";
import { escPillCls } from "../utils/playerUtils";
import { ESC_STYLE, RoundPill } from "./PillBadge";
import SexBadge from "./SexBadge";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import FilterChip from "./FilterChip";
import { CrossSeasonTable, SortTh as CSortTh } from "./CrossSeasonTable";
import { isManuel, fmtTP, tpColor, TournPName, type PlayersDB } from "./tournamentPrimitives";
import { escalaoAtDate, shortDateSlash } from "../utils/format";
import type { Tournament } from "../data/fpgTypes";
import {
  pjaPts, isGFTournament, getTournMultiplier, classifyPJAEvent, notasPJA,
} from "../../ranking-pja/pja-rules.mjs";

/* ─────────────────────────────────────────────
   RANKING PJA
   Tabela simples de ranking: # · Jogador · Esc · Clube · Voltas · Pts
   Filtros: escalão + pesquisa nome
   Pontos: par=25, −1 por pancada acima, +1 abaixo (mín 0); GF×1.5
   Top-14 voltas por ano contam para o total (regra 2026+).

   Regra 2025 (legacy): TOP-7 melhores torneios + Grande Final separada.
   Vale Pisão D1+D2 contam como UM torneio só. Confirmado contra
   PONTUAÇÕES E RANKINGS 2025.xlsx (comissão técnica PJA).

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

/* Classificação de torneios, multiplicadores e pontos vêm da FONTE ÚNICA
   partilhada com a página standalone ranking-pja.vercel.app:
   `ranking-pja/pja-rules.mjs`. Alterar regras LÁ, nunca aqui. */

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
  /** Multiplicador de pontos aplicado a todas as rondas deste torneio.
   *  1.0 standard; 1.5 Grande Final; valores especiais por tcode em
   *  TOURN_MULTIPLIER (ex: Royal Óbidos AT&T 2025 com x1.75). */
  mult: number;
  rounds: PJARound[];
  colSpan: number;
  /** ccode do torneio — usado para construir URL `/FPG/torneio/{ccode}-{tcode}`. */
  ccode?: string;
  /** tcode (ou tcode+tcode para sintéticos). */
  tcode?: string;
  /** Nº real de rondas do torneio — pode ser maior que `rounds.length` quando
   *  alguma ronda está ocultada por regra (ex: GG Main 3R → mostra só R2+R3). */
  totalRondas?: number;
  /** Coluna que junta várias provas (ex: "3º Drive Tour" = as 4 regiões). As
   *  "rondas" aqui são VOLTAS que podem vir de provas diferentes — não são
   *  rondas do mesmo torneio, por isso não levam o pill de nº de rondas. */
  agregado?: boolean;
}

interface PJARoundResult {
  toPar: number;
  pts: number;
  /** Só no modo metric="sd": differential da volta (sem componente de HCP). */
  sd?: number | null;
  /** Metros jogados nessa volta (o tee/campo varia entre jogadores quando a
   *  coluna agrega várias provas — ex: "3º Drive Challenge" junta as regiões). */
  meters?: number | null;
  /** Prova concreta que o jogador disputou dentro de uma coluna agregada. */
  prova?: string | null;
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
  /** Regiões onde o jogador competiu (circuitos regionais). */
  regioes: string[];
  results: Map<string, PJARoundResult>;
  /** Voltas que contam para o ranking. Inclui tournKey/isGF/tcode para
   *  permitir agregação por torneio (regra 2025 = top-7 torneios + GF). */
  allRounds: { roundKey: string; pts: number; sd: number | null; tournKey: string; isGF: boolean; tcode: string }[];
  total: number;
  voltas: number;
  eligible: boolean;
}

/* ─────────────────────────────────────────────
   Helper Functions
   ───────────────────────────────────────────── */

/** Modo metric="sd": quantas voltas entram na média e mínimo para ranquear. */
const BEST_SD_N = 8;
const MIN_SD_ROUNDS = 4;

/** Chave única de um torneio na tabela.
 *  ⚠ TEM de incluir o ccode: a FPG reutiliza tcodes entre clubes, e sem ele
 *  duas provas do mesmo dia colapsavam na MESMA coluna — o cabeçalho ficava com
 *  o nome de uma e as células com os jogadores da outra (caso real 2026-01-04:
 *  Drive Challenge Madeira-Palheiro Sub 10 (ccode 982) × Drive Tour Tejo
 *  Montado (ccode 985), ambos tcode 10202). */
function tournKeyOf(t: Tournament): string {
  return `${(t as any).ccode ?? "?"}_${t.tcode}_${t.date}`;
}

function fmtPts(pts: number): string {
  return pts % 1 === 0 ? String(pts) : pts.toFixed(1);
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
  // Amendoeira World Kids — "Amendoeira World Kids Golfe 2026 Sub 14" → "World Kids Sub 14"
  const wk = n.match(/Amendoeira\s+World\s+Kids(?:\s+Golfe?)?(?:\s+\d{4})?\s*(Sub[\d\s/–-]*)?/i);
  if (wk) {
    const sub = (wk[1] || "").replace(/\s+/g, " ").trim();
    return { circuito: sub ? `World Kids ${sub}` : "World Kids", local: campo || "Amendoeira" };
  }
  // Miramar Internacional Open U25 (CGM, Ago 2026) — só o U25 conta para o
  // ranking (o Sub-10 fica fora, ver isPJACore).
  if (/Miramar\s+Intern\w*cional\s+Open/i.test(n)) {
    return { circuito: "Miramar Open", local: campo || "Miramar" };
  }
  // PJA exclusivo ou fallback
  const pjaMatch = n.match(/^PJA\s+(.+)$/i);
  if (pjaMatch) return { circuito: "PJA", local: pjaMatch[1].trim() };
  return { circuito: n, local: campo || "" };
}


/* ─────────────────────────────────────────────
   Local Components
   ───────────────────────────────────────────── */

const PName = ({ name, fedCode, playersDB, sex }: { name: string; fedCode?: string; playersDB: PlayersDB; sex?: string }) =>
  <TournPName name={name} fedCode={fedCode} playersDB={playersDB} sex={sex} />;

/** Notas de elegibilidade — visíveis a quem abre o ranking, sem ter de clicar
 *  em nada. A lista vem do `pja-rules.mjs` (a MESMA que a página standalone
 *  ranking-pja.vercel.app mostra) — aqui só vive a apresentação. */
const RankingNotas = ({ year }: { year: string | number }) => {
  const notas = notasPJA(year);
  if (!notas.length) return null;
  return (
    <div className="print-hide" style={{ display: "grid", gap: 6, margin: "10px 0 14px" }}>
      {notas.map((n, i) => (
        <div
          key={i}
          style={{
            display: "flex", gap: 9, alignItems: "flex-start",
            background: n.tipo === "info" ? "var(--bg-info)" : "var(--bg-warn)",
            border: "1px solid var(--border)",
            borderLeft: `4px solid var(${n.tipo === "info" ? "--color-info" : "--color-warn"})`,
            borderRadius: 8, padding: "9px 12px",
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1.25 }}>{n.tipo === "info" ? "📅" : "⚠️"}</span>
          <span>
            <b style={{ display: "block", fontSize: 12.5, marginBottom: 2 }}>{n.titulo}</b>
            <span className="muted" style={{ fontSize: 11.5 }}>{n.texto}</span>
          </span>
        </div>
      ))}
    </div>
  );
};

/* ─────────────────────────────────────────────
   Main Component
   ───────────────────────────────────────────── */

export interface PjaPdfEntry {
  fed: string; name: string; rounds: number; pts: number; pos: number;
}

export function PJARankingView({
  pjaList, playersDB, loading, pjaMembersByYear, externalFilterName,
  specialRules = true, emptyLabel = "Sem torneios PJA.", metric = "pts", showMeters = false, hcpFilterMax,
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
  /** Regras de elegibilidade específicas do circuito PJA (Aquapor só os 2
   *  primeiros e só para quem não fez Drive Tour, Greatgolf Main só R2+R3).
   *  `false` = ranking genérico: todas as rondas de todos os torneios contam.
   *  Usado pela vista CLASSIFICAÇÕES, que ranqueia um calendário arbitrário. */
  specialRules?: boolean;
  /** Texto quando não há torneios para o filtro actual. */
  emptyLabel?: string;
  /** Métrica das células e do total:
   *   "pts" (default) — pontos por ±par (25 − pancadas acima), total = soma do top-14.
   *   "sd"            — score differential SEM componente de handicap,
   *                     total = média das 8 melhores (MENOR é melhor).
   * O modo "sd" existe para escalões que jogam sobretudo 9 buracos em campos
   * muito diferentes, onde os pontos por ±par não são comparáveis e o SD
   * oficial do WHS traria o handicap para dentro da conta. Ver
   * scripts/build-sub12-ranking.js. */
  metric?: "pts" | "sd";
  /** Acrescenta uma coluna "m" (metros jogados) a cada ronda. Útil quando a
   *  coluna agrega provas de campos diferentes — ex: "3º Drive Challenge"
   *  junta as 5 regiões e cada miúdo jogou a distância da sua. */
  showMeters?: boolean;
  /** Quando definido, mostra um chip que filtra por HCP abaixo deste valor
   *  (ex: 25 no Sub-12 — separa quem já joga a sério de quem está a começar). */
  hcpFilterMax?: number;
}) {
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const t of pjaList) if (t.date) s.add(t.date.substring(0, 4));
    return [...s].sort().reverse();
  }, [pjaList]);

  const [activeYear, setActiveYear] = useState<string>("");
  const year = activeYear || years[0] || "";

  // No modo SD o total é uma média onde MENOR é melhor → arranca ascendente.
  const { sortKey, sortDir, toggleSort: handleSort, resetSort: resetYearSort } =
    useSort<string>("total", metric === "sd" ? "asc" : "desc");
  const [filterEsc, setFilterEsc] = useState<string[]>([]);
  /** "" = todos · "F" = só raparigas · "M" = só rapazes. */
  const [filterSex, setFilterSex] = useState<"" | "F" | "M">("");
  const [filterRegiao, setFilterRegiao] = useState<string[]>([]);
  const [filterHcp, setFilterHcp] = useState(false);
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
  /** Ordem das SÉRIES quando a fonte as declara (ranking Sub-12). Mantém cada
   *  circuito em colunas seguidas em vez de intercalado por data. */
  const SERIE_ORDER: Record<string, string> = {
    "Drive Tour": "1", "Drive Challenge": "2", "Aquapor": "3",
    "Nacional": "4", "Circuito juvenil": "5", "Adultos": "6", "Estágio": "7",
  };

  const tournSortKey = (t: Tournament): string => {
    const n = t.name || "";
    const date = t.date || "";
    // Fonte com série própria (sub12-ranking.json): agrupar por série e, dentro
    // dela, por ordem cronológica.
    const serie = (t as any).serie as string | undefined;
    if (serie) {
      // As colunas de "provas extra" fecham o circuito, em vez de se meterem
      // entre as edições pela data.
      const sufixo = (t as any)._extra ? "z" : "a";
      return `${SERIE_ORDER[serie] ?? "8"}_${serie}_${sufixo}_${date}`;
    }
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

  const yearTournaments: Tournament[] = useMemo(() => {
    let filtered = pjaList.filter(t => (t.date || "").startsWith(year));

    // Caso especial 2025: Vale Pisão D1 (10370) + D2 (10371) foram registados
    // pela FPG como 2 tcodes distintos, mas a comissão técnica PJA conta como
    // UM só torneio com 2 rondas. Combinar num torneio sintético antes do
    // sort/agregação. (Ver pja-members.json _2025_regras + Excel oficial.)
    if (specialRules && year === "2025") {
      const d1 = filtered.find(t => String(t.tcode || "") === "10370");
      const d2 = filtered.find(t => String(t.tcode || "") === "10371");
      if (d1 && d2) {
        // Construir map de player → roundScores combinado [D1.r1, D2.r1]
        const byPlayer = new Map<string, any>();
        const addFromSub = (sub: Tournament, ri: number) => {
          for (const p of (sub.players || [])) {
            const key = p.fedCode || ("name:" + (p.name || "").toLowerCase().trim());
            let merged = byPlayer.get(key);
            if (!merged) {
              merged = { ...p, roundScores: [] };
              byPlayer.set(key, merged);
            }
            const rs = (p as any).roundScores || [];
            // O D1/D2 cada um tem 1 ronda só (rs[0])
            const ronda = rs[0] ? { ...rs[0], round: ri + 1 } : { round: ri + 1, gross: null, scores: [], pars: [], si: [] };
            merged.roundScores[ri] = ronda;
          }
        };
        addFromSub(d1, 0);
        addFromSub(d2, 1);
        // Calcular grossTotal e toPar combinados onde possível
        const players = Array.from(byPlayer.values()).map((p: any) => {
          const rondas = p.roundScores || [];
          const grossSum = rondas.reduce((s: number, r: any) => s + (typeof r.gross === "number" ? r.gross : 0), 0);
          const parSum = rondas.reduce((s: number, r: any) => s + ((r.pars || []).reduce((a: number,b: number) => a+b, 0) || 0), 0);
          if (grossSum > 0 && parSum > 0) {
            p.grossTotal = grossSum;
            p.toPar = grossSum - parSum;
            p.parTotal = parSum;
          }
          return p;
        });
        const synthetic: Tournament = {
          ...d1,
          name: "PJA TOUR Vale Pisão",
          tcode: "10370+10371",
          rounds: 2,
          players,
          _isSynthetic: true,
          _subRounds: [d1, d2],
        } as any;
        filtered = filtered.filter(t => t !== d1 && t !== d2);
        filtered.push(synthetic);
      }
    }

    return filtered.sort((a, b) => tournSortKey(a).localeCompare(tournSortKey(b)));
  }, [pjaList, year]);

  const tournCols: PJATournCol[] = useMemo(() => {
    const cols: PJATournCol[] = [];
    const perRound = showMeters ? 3 : 2;
    for (const t of yearTournaments) {
      const isSynth = !!t._isSynthetic;
      const subRounds: Tournament[] = t._subRounds || [];
      // Sem specialRules nenhum torneio pesa mais que outro: multiplicador 1.0
      // e nada é tratado como Grande Final (a vista CLASSIFICAÇÕES ranqueia um
      // calendário onde todas as provas valem o mesmo).
      const isGF = specialRules && isGFTournament(t);
      const mult = specialRules ? getTournMultiplier(t) : 1.0;
      const tournKey = tournKeyOf(t);

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
      const agregado = !!(t as any)._agregado;
      // GG Main 3R em 2026+: R1 nunca conta (regulamento §2.5 — só os últimos 2
      // dias contam). Ocultar a coluna R1 e mostrar só R2/R3.
      const evType = classifyPJAEvent(t);
      const hideR1 = specialRules && (year >= "2026") && evType === "GG_MAIN" && nR === 3;

      if (nR > 1) {
        const rounds: PJARound[] = [];
        for (let i = 0; i < nR; i++) {
          if (hideR1 && i === 0) continue;  // R1 ocultada
          rounds.push({
            roundKey: tournKey + "_r" + (i + 1),
            label: (agregado ? "V" : "R") + (i + 1),
            date: (subRounds[i]?.date) || t.date || "",
          });
        }
        cols.push({ tournKey, name: t.name, date: t.date || "", campo: t.campo || "", isGF, mult, rounds, colSpan: rounds.length * perRound, ccode, tcode, totalRondas: nR, agregado });
      } else {
        cols.push({ tournKey, name: t.name, date: t.date || "", campo: t.campo || "", isGF, mult, rounds: [{ roundKey: tournKey + "_r1", label: "", date: t.date || "" }], colSpan: perRound, ccode, tcode, totalRondas: 1, agregado });
      }
    }
    return cols;
  }, [yearTournaments, year, specialRules, showMeters]);

  // Para regras 2026+: identificar os 2 primeiros Aquapor do ano (ordem cronológica)
  // — só esses contam para o ranking PJA.
  const aquaporAllowedKeys = useMemo(() => {
    if (!specialRules) return null;  // ranking genérico: sem regra Aquapor
    if (year < "2026") return null;  // Aquapor não se aplica a anos anteriores
    const aqs = yearTournaments
      .filter(t => classifyPJAEvent(t) === "AQUAPOR")
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .slice(0, 2);
    return new Set(aqs.map(tournKeyOf));
  }, [yearTournaments, year, specialRules]);

  const allRows: PJAPRow[] = useMemo(() => {
    const map = new Map<string, PJAPRow>();
    // applyNewRules: regras especiais 2026+ de elegibilidade de torneios
    // (DT/Aquapor exclusão mútua, GG Main R2+R3 só, Aquapor só os 2 primeiros).
    const applyNewRules = specialRules && year >= "2026";
    // applyMembershipMode: modo "lista oficial de inscritos" — injecta skeleton
    // rows para todos os fedCodes em pja-members.json[year] e filtra a tabela
    // a apenas membros com tag "PJA". Activa-se quando há lista oficial para
    // este ano (independente de aplicar as regras 2026+).
    const yearMembers = pjaMembersByYear?.[year];
    const applyMembershipMode = !!(yearMembers && yearMembers.length);

    // Track, per player, whether they played any Drive Tour this year.
    // Used to exclude Aquapor rounds for players who also played DT.
    const playerDidDT = new Map<string, boolean>();

    for (const t of yearTournaments) {
      const evType = classifyPJAEvent(t);
      if (!evType) continue;
      // Com regras novas, Aquapor fora dos 2 primeiros é ignorado por completo
      if (applyNewRules && evType === "AQUAPOR" && aquaporAllowedKeys && !aquaporAllowedKeys.has(tournKeyOf(t))) {
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
      if (applyNewRules && evType === "AQUAPOR" && aquaporAllowedKeys && !aquaporAllowedKeys.has(tournKeyOf(t))) continue;

      const isSynth = !!t._isSynthetic;
      const subRounds: Tournament[] = t._subRounds || [];
      // Sem specialRules nenhum torneio pesa mais que outro: multiplicador 1.0
      // e nada é tratado como Grande Final (a vista CLASSIFICAÇÕES ranqueia um
      // calendário onde todas as provas valem o mesmo).
      const isGF = specialRules && isGFTournament(t);
      const mult = specialRules ? getTournMultiplier(t) : 1.0;
      const tournKey = tournKeyOf(t);

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
            // playersDB só cobre os nossos jogadores — para o resto do campo o
            // sexo vem da própria linha do torneio (a fonte preenche-o a partir
            // do federados.json). Sem isto o badge e o filtro ♀ falhavam neles.
            sex: db?.sex || (p as any).sex || "", hcp: p.hcpExact ?? null,
            regioes: [],
            results: new Map(), allRounds: [], total: 0, voltas: 0, eligible: false,
          });
        }
        const row = map.get(playerKey)!;
        if (p.hcpExact != null) row.hcp = p.hcpExact;
        const reg = (p as any).regiao;
        if (reg && !row.regioes.includes(reg)) row.regioes.push(reg);

        // Aquapor: se jogador fez DT no ano, as rondas não contam.
        const aquaporSkipped = applyNewRules && evType === "AQUAPOR" && playerDidDT.get(playerKey) === true;

        const addRound = (roundNum: number, gross: number, par: number, rs?: any) => {
          if (!par || !gross || gross >= 900) return;
          const tp = gross - par;
          const pts = pjaPts(tp, mult);
          const roundKey = tournKey + "_r" + roundNum;

          // GG Main (Sub 16+ joga 3 dias): só R2 e R3 contam para PJA
          const ggMainExcluded = applyNewRules && evType === "GG_MAIN" && roundNum === 1;
          const excluded = ggMainExcluded || aquaporSkipped;
          let excludedReason: string | undefined;
          if (ggMainExcluded) excludedReason = "Greatgolf Main: R1 não conta para o ranking PJA (só R2+R3)";
          else if (aquaporSkipped) excludedReason = "Aquapor: jogador também fez Drive Tour, Aquapor não conta";

          // Modo "sd": o differential vem pré-calculado na ronda pelo builder
          // (não é recalculado aqui — depende de CR/Slope e do nº de buracos).
          const sd = metric === "sd" && rs && typeof rs.sd === "number" ? rs.sd : null;
          const meters = rs && typeof rs.meters === "number" ? rs.meters : null;
          const prova = rs && rs._prova ? String(rs._prova) : null;
          row.results.set(roundKey, { toPar: tp, pts, sd, meters, prova, inTop14: false, excluded, excludedReason });
          if (!excluded) row.allRounds.push({ roundKey, pts, sd, tournKey, isGF, tcode: String((t as any).tcode || "") });
        };

        if (isSynth && subRounds.length > 1 && p.roundScores && p.roundScores.length > 0) {
          p.roundScores.forEach((rs: any, i: number) => {
            const parR = (rs.pars || []).reduce((a: number, b: number) => a + b, 0) || rs.parTotal || 0;
            addRound(i + 1, rs.gross, parR, rs);
          });
        } else if (p.roundScores && p.roundScores.length > 1) {
          // Multi-round não-sintético (e.g. pull-torneios 2-round event vindo directo)
          p.roundScores.forEach((rs: any, i: number) => {
            const parR = (rs.pars || []).reduce((a: number, b: number) => a + b, 0) || rs.parTotal || 0;
            addRound(i + 1, rs.gross, parR, rs);
          });
        } else {
          const tp = typeof p.toPar === "string" ? parseInt(p.toPar) : p.toPar as number;
          const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal as number;
          if (tp == null || isNaN(tp) || gross == null || isNaN(gross) || gross >= 900) continue;
          const par = gross - tp;
          // Passar a ronda (quando existe) para o modo metric="sd" poder ler o
          // differential dela — torneios de 1 ronda caem neste ramo e sem isto
          // ficavam sem SD (é a maioria do Drive Challenge).
          addRound(1, gross, par, p.roundScores?.[0]);
        }
      }
    }

    // Regra de cálculo do total — year-aware:
    //  • 2025 (legacy): TOP-7 melhores torneios regulares + Grande Final (todas
    //    rondas da GF) somada à parte. Vale Pisão D1 (10370) + D2 (10371)
    //    contam como UM torneio único. Confirmado contra o Excel oficial da
    //    comissão técnica PJA (PONTUAÇÕES E RANKINGS 2025.xlsx).
    //  • 2026+: TOP-14 melhores rondas (com regras DT/Aquapor/GG_MAIN).
    //  • Anos anteriores: TOP-14 voltas (legado simples).
    for (const row of map.values()) {
      if (metric === "sd") {
        // Média das BEST_SD_N melhores voltas — menor é melhor. Sem soma de
        // pontos: somar differentials premiaria quem joga mais provas.
        const sds = row.allRounds.filter(r => r.sd != null) as { roundKey: string; sd: number }[];
        const ordenadas = [...sds].sort((a, b) => a.sd - b.sd);
        const melhores = ordenadas.slice(0, BEST_SD_N);
        const chaves = new Set(melhores.map(r => r.roundKey));
        for (const [rk, res] of row.results.entries()) res.inTop14 = chaves.has(rk);
        row.total = melhores.length
          ? Math.round((melhores.reduce((a, r) => a + r.sd, 0) / melhores.length) * 10) / 10
          : NaN;
        row.voltas = sds.length;
        row.eligible = sds.length >= MIN_SD_ROUNDS;
        continue;
      }
      // A regra 2025 (top-7 torneios + GF à parte) é do regulamento PJA — o
      // ranking genérico usa sempre top-14 voltas, sem provas de peso especial.
      if (specialRules && year === "2025") {
        // Agrupar voltas por tournKey. Vale Pisão D1+D2 já vem combinado num
        // torneio sintético (tcode "10370+10371") graças ao yearTournaments
        // useMemo, portanto basta agrupar pelo tournKey natural.
        type TournAgg = { pts: number; isGF: boolean; roundKeys: string[] };
        const byTourn = new Map<string, TournAgg>();
        for (const r of row.allRounds) {
          let agg = byTourn.get(r.tournKey);
          if (!agg) { agg = { pts: 0, isGF: r.isGF, roundKeys: [] }; byTourn.set(r.tournKey, agg); }
          agg.pts += r.pts;
          if (r.isGF) agg.isGF = true;
          agg.roundKeys.push(r.roundKey);
        }
        const regular: TournAgg[] = [];
        let gfTotal = 0;
        const acceptedRoundKeys = new Set<string>();
        for (const agg of byTourn.values()) {
          if (agg.isGF) {
            gfTotal += agg.pts;
            agg.roundKeys.forEach(k => acceptedRoundKeys.add(k));
          } else {
            regular.push(agg);
          }
        }
        regular.sort((a, b) => b.pts - a.pts);
        const top7 = regular.slice(0, 7);
        let top7Total = 0;
        for (const t of top7) {
          top7Total += t.pts;
          t.roundKeys.forEach(k => acceptedRoundKeys.add(k));
        }
        for (const [rk, res] of row.results.entries()) {
          res.inTop14 = acceptedRoundKeys.has(rk);
        }
        row.total = top7Total + gfTotal;
        row.voltas = row.allRounds.length;
        // "Elegível" em 2025: ter participado em ≥7 torneios regulares (≈ campanha completa)
        row.eligible = regular.length >= 7;
      } else {
        // 2026+ e legado: TOP-14 voltas
        const sorted = [...row.allRounds].sort((a, b) => b.pts - a.pts);
        const top14Keys = new Set(sorted.slice(0, 14).map(r => r.roundKey));
        for (const [rk, res] of row.results.entries()) {
          res.inTop14 = top14Keys.has(rk);
        }
        row.total = sorted.slice(0, 14).reduce((s, r) => s + r.pts, 0);
        row.voltas = row.allRounds.length;
        row.eligible = row.voltas >= 14;
      }
    }

    // Membership mode: injectar rows "esqueleto" (0 voltas, 0 pts) para TODOS
    // os inscritos da lista pja-members.json do ano corrente que ainda não
    // pontuaram. Assim o ranking mostra quem está inscrito mesmo antes de haver
    // resultados (ex: início da época, ou inscritos que só vão jogar torneios
    // futuros). Activa-se sempre que existir lista oficial para o ano.
    if (applyMembershipMode) {
      const inscritos = yearMembers || [];
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
          regioes: [],
          results: new Map(),
          allRounds: [],
          total: 0,
          voltas: 0,
          eligible: false,
        });
      }
    }

    // Membership mode: mostrar todos os inscritos (incluindo 0 voltas/0 pts).
    // Sem lista oficial: só quem pontuou.
    let rows = applyMembershipMode
      ? [...map.values()]
      : [...map.values()].filter(r => r.voltas > 0);
    // No modo SD uma média de 1-3 voltas não diz nada — exigir um mínimo.
    if (metric === "sd") rows = rows.filter(r => r.voltas >= MIN_SD_ROUNDS);

    // Membership mode: filtrar apenas membros PJA (tag "PJA" em players.json).
    // Sem lista oficial (legado): qualquer participante aparece.
    if (applyMembershipMode) {
      rows = rows.filter(r => {
        if (!r.fedCode) return false;
        const db = playersDB[r.fedCode];
        const tags = (db as any)?.tags || [];
        return Array.isArray(tags) && tags.includes("PJA");
      });
    }

    return rows;
  }, [yearTournaments, playersDB, year, aquaporAllowedKeys, pjaMembersByYear, specialRules, metric]);

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
      const t = yearTournaments.find(x => tournKeyOf(x) === tc.tournKey);
      return !t || hasPjaInscrito(t);
    });
  }, [tournCols, yearTournaments, pjaMembersByYear, year]);

  // Map fedCode → entry do PDF oficial (para comparar e destacar disparidades).
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

  /** Sexos presentes nas linhas — o chip só aparece quando há ambos. */
  const availSexes = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) if (r.sex === "M" || r.sex === "F") s.add(r.sex);
    return [...s].sort() as ("M" | "F")[];  // F antes de M
  }, [allRows]);

  const availRegioes = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) for (const g of r.regioes) s.add(g);
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [allRows]);

  const availEscs = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) if (r.escalao) s.add(r.escalao);
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [allRows]);

  const sortedRows = useMemo(() => {
    // Ranking principal = só inscritos no ano corrente (se houver lista).
    let rows = rowsInscritos;
    if (filterSex) rows = rows.filter(r => r.sex === filterSex);
    if (filterRegiao.length) rows = rows.filter(r => r.regioes.some(g => filterRegiao.includes(g)));
    if (filterHcp && hcpFilterMax != null) rows = rows.filter(r => r.hcp != null && r.hcp < hcpFilterMax);
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
      // Ordenar por uma coluna de torneio: quem NÃO jogou essa prova fica
      // sempre no fim, nas duas direcções. (Antes o valor em falta era ±INF e
      // em ordem descendente os ausentes subiam ao topo de um torneio que nunca
      // disputaram.)
      if (sortKey.startsWith("toPar_") || sortKey.startsWith("pts_") || sortKey.startsWith("m_")) {
        const isPts = sortKey.startsWith("pts_");
        const isM = sortKey.startsWith("m_");
        const rk = sortKey.slice(isM ? 2 : isPts ? 4 : 6);
        const va = a.results.get(rk), vb = b.results.get(rk);
        if (!va && !vb) return 0;
        if (!va) return 1;
        if (!vb) return -1;
        // A 2ª coluna de cada ronda mostra Pts ou SD consoante a métrica —
        // ordenar pelo valor que está mesmo à vista.
        const val = (r: PJARoundResult) =>
          isM ? (r.meters ?? INF) : isPts ? (metric === "sd" ? (r.sd ?? INF) : r.pts) : r.toPar;
        return mult * (val(va) - val(vb));
      }
      // NB: allRows só é usado para filtros/availEscs; o ranking usa rowsInscritos.
      const ta = isNaN(a.total) ? INF : a.total;
      const tb = isNaN(b.total) ? INF : b.total;
      return mult * (ta - tb);
    });
  }, [rowsInscritos, filterSex, filterRegiao, filterHcp, hcpFilterMax, filterEsc, filterName, sortKey, sortDir, metric]);

  /** Posição no RANKING (pela métrica), não a ordem da tabela.
   *  A coluna "#" tem de ser estável: ao ordenar por uma coluna de torneio, o
   *  1º do ranking continua a ser o 1º — antes mostrava o índice da linha e o
   *  líder aparecia como "124º", o que lia como se fosse a classificação. */
  const rankByKey = useMemo(() => {
    const better = metric === "sd"
      ? (a: PJAPRow, b: PJAPRow) => (isNaN(a.total) ? Infinity : a.total) - (isNaN(b.total) ? Infinity : b.total)
      : (a: PJAPRow, b: PJAPRow) => b.total - a.total;
    const m = new Map<string, number>();
    [...rowsInscritos].sort(better).forEach((r, i) => m.set(r.key, i + 1));
    return m;
  }, [rowsInscritos, metric]);

  // Não inscritos: também aceita filtro por escalão/nome, ordenados por total desc.
  const sortedNaoInscritos = useMemo(() => {
    let rows = rowsNaoInscritos;
    if (filterSex) rows = rows.filter(r => r.sex === filterSex);
    if (filterRegiao.length) rows = rows.filter(r => r.regioes.some(g => filterRegiao.includes(g)));
    if (filterHcp && hcpFilterMax != null) rows = rows.filter(r => r.hcp != null && r.hcp < hcpFilterMax);
    if (filterEsc.length) rows = rows.filter(r => filterEsc.includes(r.escalao));
    if (filterName.trim()) {
      const q = filterName.trim().toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.club.toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => b.total - a.total);
  }, [rowsNaoInscritos, filterSex, filterRegiao, filterHcp, hcpFilterMax, filterEsc, filterName]);



  // Slot na toolbar principal da FPGPage. Se existir, renderizamos os filtros
  // via createPortal para lá (evita ter 2 toolbars empilhadas). Se não existir
  // (fallback), mostramos a toolbar dentro do próprio componente.
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  // ⚠ Sem deps de propósito: a FPGPage só monta o slot depois de `loading`
  // acabar, e esta vista pode montar ANTES disso (os dados dela carregam mais
  // depressa). Com `[]` a procura corria uma única vez, falhava, e os filtros
  // caíam na toolbar de fallback — uma segunda linha por baixo da barra. Agora
  // tenta a cada render até encontrar (getElementById é barato e pára aí).
  useEffect(() => {
    if (toolbarSlot) return;
    const el = document.getElementById("pja-toolbar-slot");
    if (el) setToolbarSlot(el);
  });

  if (loading && pjaList.length === 0) return <LoadingState size="sm" />;
  if (!year) return <div className="muted fs-11" style={{ padding: 24 }}>{emptyLabel}</div>;

  const toolbarInner = <>
    <div style={{ display: "flex", gap: 4 }}>
      {years.map(yr => (
        <button key={yr}
          className={"tourn-tab tourn-tab-sm" + (yr === year ? " active" : " tourn-tab-muted")}
          onClick={() => { setActiveYear(yr); setFilterEsc([]); setFilterSex(""); setFilterRegiao([]); setFilterHcp(false); setFilterName(""); resetYearSort(); }}
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
        <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: "var(--fs-11)", color: "var(--text-muted)", pointerEvents: "none" }}>🔍</span>
        <input type="text" placeholder="Nome ou clube…" value={internalFilterName}
          onChange={e => setFilterName(e.target.value)}
          className="input-search" style={{ width: 140 }} />
      </div>
    )}
    {availSexes.length > 1 && <>
      <span style={{ color: "var(--border)" }}>|</span>
      {availSexes.map(sx => (
        <FilterChip key={sx} active={filterSex === sx}
                    onClick={() => setFilterSex(filterSex === sx ? "" : sx)}
                    color={sx === "F" ? "var(--badge-female)" : "var(--badge-male)"}>
          <SexBadge sex={sx} size="sm" />
          {sx === "F" ? " Raparigas" : " Rapazes"}
        </FilterChip>
      ))}
    </>}
    {availRegioes.length > 1 && <>
      <span style={{ color: "var(--border)" }}>|</span>
      {availRegioes.map(g => (
        <FilterChip key={g} active={filterRegiao.includes(g)}
          onClick={() => setFilterRegiao(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])}>
          {g}
        </FilterChip>
      ))}
    </>}
    {hcpFilterMax != null && <>
      <span style={{ color: "var(--border)" }}>|</span>
      <FilterChip active={filterHcp} onClick={() => setFilterHcp(v => !v)} color="var(--color-good)">
        HCP &lt; {hcpFilterMax}
      </FilterChip>
    </>}
    {availEscs.length > 1 && <span style={{ color: "var(--border)" }}>|</span>}
    {availEscs.map(e => {
      const k = e.toLowerCase().replace(/[\s-]/g, "");
      const s = ESC_STYLE[k];
      return <FilterChip key={e} active={filterEsc.includes(e)} onClick={() => toggleEsc(e)} color={s?.bg}>{e}</FilterChip>;
    })}
    {(filterEsc.length > 0 || filterSex || filterRegiao.length > 0 || filterHcp || filterName) && <>
      <span className="muted fs-10" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{sortedRows.length} de {allRows.length}</span>
      <FilterChip active={false} onClick={() => { setFilterEsc([]); setFilterSex(""); setFilterRegiao([]); setFilterHcp(false); if (externalFilterName === undefined) setFilterName(""); }}>✕ limpar</FilterChip>
    </>}
    <span className="muted fs-10 ml-auto" title={metric === "sd" ? `SD = (113/Slope) × (Gross − CR), ×2 nas voltas de 9 buracos · média das ${BEST_SD_N} melhores, mínimo ${MIN_SD_ROUNDS} voltas · MENOR é melhor · não depende do handicap` : !specialRules ? "Par=25pts · Top-14 voltas · todas as rondas contam · todos os torneios pesam o mesmo (sem multiplicadores)" : year === "2025" ? "Par=25pts · Top-7 torneios + GF · GF×1,5 · VP D1+D2 combinado" : year >= "2026" ? "Par=25pts · Top-14 voltas · GF×1,5 · GG Main R2+R3" : "Par=25pts · Top-14 voltas · GF×1,5"} style={{ whiteSpace: "nowrap", cursor: "help" }}>
      ℹ Regras
    </span>
    <span className="chip" title={`${allRows.length} ${specialRules ? "jogadores PJA" : "juniores"} · ${visibleTournCols.length} torneios`}>
      {allRows.length}j · {visibleTournCols.length}t
    </span>
  </>;

  return (
    <div style={{ paddingTop: 12 }}>
      {/* Filtros: via portal para a toolbar da FPGPage se disponível, senão
          inline como toolbar própria (fallback para usos standalone). */}
      {toolbarSlot
        ? createPortal(toolbarInner, toolbarSlot)
        : <div className="toolbar" style={{ flexWrap: "wrap", gap: 6 }}>{toolbarInner}</div>
      }

      <RankingNotas year={year} />

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
                  fontSize: "var(--fs-10)",
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
                      {tc.mult !== 1.0 && <span className="badge-gf" style={{ marginLeft: 3 }}>★{tc.mult}</span>}
                    </div>
                    <div style={{ ...lineStyle, color: "var(--text-2)" }}>
                      {local || "\u00A0"}
                    </div>
                    <div style={{ ...lineStyle, color: "var(--text-muted)" }}>
                      {shortDateSlash(tc.date)}
                      {!tc.agregado && (tc.totalRondas ?? tc.rounds.length) > 1 && <>
                        {" · "}
                        <RoundPill nR={tc.totalRondas ?? tc.rounds.length} />
                        {tc.totalRondas && tc.totalRondas > tc.rounds.length && (
                          <span title={`Só ${tc.rounds.length} rondas contam para o ranking PJA (regulamento §2.5 — últimos 2 dias)`}
                                style={{ marginLeft: 3, fontSize: "var(--fs-9)", fontWeight: 700, color: "var(--color-warn-dark)" }}>
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
                        {r.label
                          ? <span style={{ fontSize: "var(--fs-10)", fontWeight: 800, color: "var(--color-good-dark)" }}
                                  title={tc.agregado
                                    ? "Volta — nesta coluna as voltas podem vir de provas diferentes (passa o rato numa célula para ver qual)"
                                    : `Ronda ${r.label.slice(1)}`}>{r.label}</span>
                          : "±Par"}
                      </CSortTh>
                      <CSortTh k={"pts_" + r.roundKey} s={sortKey} d={sortDir} on={handleSort} className="cs-t-gross cs-col" style={{ color: "var(--color-warn-dark)", fontWeight: 700 }}>{metric === "sd" ? "SD" : "Pts"}</CSortTh>
                      {showMeters && (
                        <CSortTh k={"m_" + r.roundKey} s={sortKey} d={sortDir} on={handleSort} className="cs-t-topar cs-col"
                          title="Metros jogados nesta volta">m</CSortTh>
                      )}
                    </React.Fragment>
                  ))}
                </>
              ),
            }))}
            summaryGroupTh={<th className="cs-grp u-fw8-fs12" colSpan={2}>
              Ranking
            </th>}
            summarySubHeaders={<>
              <CSortTh k="voltas" s={sortKey} d={sortDir} on={handleSort} className="cs-s-games cs-grp">Voltas</CSortTh>
              <CSortTh k="total"  s={sortKey} d={sortDir} on={handleSort} className="cs-s-pts cs-col" style={{ color: "var(--color-warn-dark)", fontWeight: 800 }}
                title={metric === "sd" ? `Média das ${BEST_SD_N} melhores voltas — MENOR é melhor` : undefined}>
                {metric === "sd" ? "SD méd" : "Total"}
              </CSortTh>
            </>}
          >
            {sortedRows.map((row, idx) => {
              const isSel = selectedKey === row.key;
              // Voltas que ficaram fora do top-14 (só no modo de pontos — em
              // "sd" a métrica é uma média das melhores, não uma soma).
              const cortadas = metric === "pts"
                ? [...row.results.values()].filter(r => !r.excluded && !r.inTop14).length
                : 0;
              // Quando o tecto morde, mostram-se os dois números: o que CONTA
              // em grande, o que se JOGOU em pequeno. Sem isto a linha exibia
              // 18 voltas ao lado de um total de 14 e as contas não fechavam.
              const contadas = row.voltas - cortadas;
              const totalTodas = cortadas > 0
                ? row.allRounds.reduce((a, r) => a + r.pts, 0)
                : 0;
              const classes = [
                isManuel(row) ? "row-manuel" : "",
                isSel ? "row-selected" : "",
              ].filter(Boolean).join(" ") || undefined;
              return (
                <tr key={row.key} className={classes}
                    onClick={() => setSelectedKey(isSel ? null : row.key)}
                    style={{ cursor: "pointer" }}>
                  <td className="cs-pos sticky-col-0" title={`Posição no ranking (${sortKey === "total" ? "ordem actual" : "independente da ordenação da tabela"})`}>
                    {rankByKey.get(row.key) ?? idx + 1}
                  </td>
                  <td className="cs-name sticky-col-1">
                    <PName name={row.name} fedCode={row.fedCode} playersDB={playersDB} sex={row.sex} />
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
                              {showMeters && <td className="cs-t-topar cs-col" />}
                            </React.Fragment>
                          );
                          const tpStr = fmtTP(res.toPar);
                          const tpCol = tpColor(res.toPar);
                          // Tooltip nas TRÊS células da volta: numa coluna
                          // agregada ("3º Drive Challenge" = 5 regiões) saber
                          // QUE prova o miúdo jogou é essencial para ler o valor.
                          const cellTitle = [
                            res.prova,
                            res.meters ? `${res.meters.toLocaleString("pt-PT")} m` : null,
                            res.excludedReason,
                            !res.excluded && !res.inTop14 ? "Fora das 14 melhores voltas — não soma" : null,
                          ].filter(Boolean).join(" · ") || undefined;
                          // Duas maneiras de uma volta não somar, com aspecto
                          // diferente de propósito:
                          //  • `excluded` — a regra tirou-a (GG Main R1, Aquapor
                          //    de quem joga Drive Tour): riscada.
                          //  • fora do TOP-14 — jogou-se e vale, mas há 14
                          //    melhores: esbatida. Sem isto, a partir da 15ª
                          //    volta a linha deixava de somar para o total e
                          //    ninguém percebia porquê.
                          const excludedStyle = res.excluded
                            ? { opacity: 0.4, textDecoration: "line-through" as const }
                            : !res.inTop14
                              ? { opacity: 0.35 }
                              : {};
                          return (
                            <React.Fragment key={r.roundKey}>
                              <td className="cs-t-topar cs-grp" style={{ color: tpCol, ...excludedStyle }} title={cellTitle}>{tpStr}</td>
                              <td className="cs-t-gross cs-col" style={{ color: "var(--color-warn-dark)", ...excludedStyle }} title={cellTitle}>
                                {metric === "sd" ? (res.sd != null ? res.sd.toFixed(1) : "–") : fmtPts(res.pts)}
                              </td>
                              {showMeters && (
                                <td className="cs-t-topar cs-col muted" style={{ fontVariantNumeric: "tabular-nums", ...excludedStyle }}
                                    title={cellTitle}>
                                  {res.meters ? res.meters.toLocaleString("pt-PT") : "–"}
                                </td>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}

                  <td className="cs-s-games cs-grp"
                      title={cortadas > 0 ? `${contadas} das ${row.voltas} voltas contam para o total` : undefined}>
                    {cortadas > 0
                      ? <>{contadas}<span className="muted" style={{ fontSize: 9 }}>/{row.voltas}</span></>
                      : row.voltas}
                  </td>
                  <td className="cs-s-pts cs-col" style={{ fontWeight: 800, color: "var(--color-warn-dark)", fontVariantNumeric: "tabular-nums" }}
                      title={cortadas > 0 ? `${fmtPts(row.total)} pts das voltas que contam · ${fmtPts(totalTodas)} pts somando as ${row.voltas}` : undefined}>
                    {metric === "sd"
                      ? (isNaN(row.total) ? "–" : row.total.toFixed(1))
                      : cortadas > 0
                        // Na MESMA linha (não empilhado): empilhar punha esta
                        // linha da tabela a quase o dobro da altura das outras.
                        ? <>{fmtPts(row.total)}<span className="muted" style={{ fontSize: 9, fontWeight: 500 }}>/{fmtPts(totalTodas)}</span></>
                        : fmtPts(row.total)}
                  </td>
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
        <div className="print-hide" style={{ marginTop: 24, padding: "0 16px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
            <span className="fw-800 fs-12" style={{ color: "var(--text-2)" }}>
              Não inscritos no circuito {year}
            </span>
            <span className="muted fs-10">
              {sortedNaoInscritos.length} jogador{sortedNaoInscritos.length === 1 ? "" : "es"} · pontuou em eventos PJA mas não está inscrito, não conta para o ranking
            </span>
          </div>
          <table className="cs-table" style={{ fontSize: "var(--fs-12)" }}>
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
                    <PName name={row.name} fedCode={row.fedCode} playersDB={playersDB} sex={row.sex} />
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
