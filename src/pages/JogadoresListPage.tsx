/**
 * JogadoresListPage.tsx
 *
 * Landing page de /jogadores — tabela tipo FPG FederatedsList_V2 com
 * todos os federados activos + métricas adicionais (DOB/idade, rondas,
 * último SD, média 5 SDs, última actualização HCP, país/bandeira).
 *
 * Rota:
 *   /jogadores       → esta página (lista)
 *   /jogadores/:fed  → JogadoresPage (detalhe individual)
 *
 * Fontes de dados:
 *   - federados.json     (~18.000 federados activos)
 *   - federados-inativos-lista.json (~42.600 que já saíram — marcados
 *     «Inactivo»; o filtro Estado federativo separa-os)
 *   - players.json       (~396 curados, via AppContext)
 *   - player-stats.json  (SDs pré-calculados a partir de data.json)
 *
 * Filtros:
 *   - Essenciais (FPG): nome/nfed, escalão, idade min/max, HCP min/max,
 *     estado HCP, sexo, AM/PRO, estado federativo
 *   - Avançados: só com rondas este ano, só Jovens (Sub-X),
 *     só com SD calculado, diferenças vs FPG
 */

import { useEffect, useMemo, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { norm, shortDate, ageAtDate, todayIso, fmtSD } from "../utils/format";
import { gf, isPtCountry } from "../utils/flagUtils";
import { hcpDisplay } from "../utils/playerUtils";
import Pager from "../ui/Pager";
import {
  loadFederados,
  mergePlayersWithFederados,
  normalizeAgeLevel,
  loadFederadosInativos,
  FED_STATUS_INATIVO,
  type FederadoRaw,
} from "../data/federadosLoader";
import { loadFederadosPP, getPPByFed, hasRealPPHcp, type FederadoPP } from "../data/federadosPPLoader";
import {
  loadPlayerStats,
  type PlayerStats,
  type PlayerStatsDb,
} from "../data/playerStatsTypes";
import { MANUEL_FED } from "../constants/manuel";
import { PIN_RANK } from "../constants/pinnedPlayers";
import { useSort, compareNullsLast } from "../hooks/useSort";
import SortableHdr from "../ui/SortableHdr";
import SexBadge from "../ui/SexBadge";
import { EscPill, Pill } from "../ui/PillBadge";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../ui/Toolbar";
import LoadingState from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import { FilterField, ToggleChip } from "../ui/FilterField";
import ClearButton from "../ui/ClearButton";
import PlayerLink from "../ui/PlayerLink";
import ExtLink from "../ui/ExternalLink";
import { ESC_ORDER_FULL as ESC_ORDER } from "../constants/escaloes";
import SearchInput from "../ui/SearchInput";
import ErrorState from "../ui/ErrorState";
import SexSelect from "../ui/SexSelect";
import Select from "../ui/Select";
import { MUTED } from "../ui/tableCells";
import NumberInput from "../ui/NumberInput";

/* ── URL FPG (referência exacta pedida pelo user) ─────────────── */
const FPG_LIST_URL =
  "https://scoring-pt.datagolf.pt/scripts/handicaps.asp?name=&nfed=&club=ALL&fedstatus=9&gender=T&agelevel=ALL&hcpstatus=10&hcpmin=-8&hcpmax=25&idademin=19000101&idademax=21000101&order=tipojogador&ordertype=ASC&ack=XH256YF45T&npage=1";

/* ── Overrides de país por fed code ───────────────────────────────
 * Casos pontuais em que o FPG tem o country errado e nós sabemos a
 * nacionalidade correcta a partir de outras fontes (BJGT, WJGC, KIDS).
 * Mapeamento: nfed → nome do país (formato EN ou PT como aceite por gf()).
 * ────────────────────────────────────────────────────────────── */
const COUNTRY_OVERRIDE: Record<string, string> = {
  // David Filip Jr. — FPG tem "United States" mas é checo
  // (confirmado em BJGTAnalysisPage e KIDSPage como "Czech Republic"/🇨🇿)
  "51949": "Czech Republic",
};

/* ── Constantes ───────────────────────────────────────────────── */
const PAGE_SIZE = 100;

type SortKey =
  | "nfed" | "name" | "club" | "country" | "dob" | "age"
  | "hcp" | "ppHcp" | "sex" | "escalao"
  | "roundsTotal" | "roundsYear" | "lastSD" | "avgSD5";

type Row = {
  fed: string;
  name: string;
  countryName: string;
  clubCode: string;
  clubShort: string;
  clubLong: string;
  dob: string | null;          // YYYY-MM-DD
  age: number | null;
  hcp: number | null;
  hcpStatus: string;            // só para popular o dropdown do filtro
  hcpStatusId: number;
  typeId: number;
  sex: string;                  // "M" / "F"
  escalao: string;
  fedStatusId: number;
  /** Já não é federado (FedStat=7) — mostra a marca «Inactivo». */
  inactive: boolean;
  // Métricas locais (player-stats.json) — só ~396 jogadores
  roundsTotal: number | null;
  roundsYear: number | null;
  lastSD: number | null;
  avgSD5: number | null;
  hasAnalysis: boolean;
  // Diferenças vs FPG (do merge — players.json vs federados.json)
  hasDiffs: boolean;
  /** Texto descritivo das diferenças (HCP X→Y, Clube A→B). Vazio se hasDiffs=false. */
  diffsText: string;
  // Pitch & Putt (mundo paralelo — federados-pp.json)
  ppHcp: number | null;        // hcp_index P&P (null se sem registo/sem HCP)
  ppReal: boolean;             // tem HCP P&P estabelecido (não sentinela 99)
  ppRoundsYear: number | null; // cartões P&P no ano (actividade)
  ppOnly: boolean;             // só existe no mundo P&P (não está na lista de golfe)
};


/** Constrói tooltip multi-linha descrevendo as diferenças entre o nosso
 *  players.json e o snapshot actual da FPG. Devolve string vazia se não
 *  houver diffs. Múltiplas linhas separadas por \n para o atributo title. */
function buildDiffsText(diffs: { hcpChanged?: { ours: number; fpg: number }; clubChanged?: { ours: string; fpg: string } } | undefined): string {
  if (!diffs) return "";
  const lines: string[] = ["Diferenças vs FPG:"];
  if (diffs.hcpChanged) {
    const { ours, fpg } = diffs.hcpChanged;
    const delta = fpg - ours;
    const arrow = delta > 0 ? "↑" : "↓";
    lines.push(`  HCP: ${ours.toFixed(1)} → ${fpg.toFixed(1)} (${arrow} ${Math.abs(delta).toFixed(1)})`);
  }
  if (diffs.clubChanged) {
    const { ours, fpg } = diffs.clubChanged;
    lines.push(`  Clube: ${ours} → ${fpg}`);
  }
  return lines.join("\n");
}

/* ── Componente principal ─────────────────────────────────────── */
export default function JogadoresListPage() {
  const { players } = useAppContext();

  /* Dados */
  const [federados, setFederados] = useState<FederadoRaw[] | null>(null);
  // Os que já saíram — chegam depois dos activos (a lista não espera por eles).
  const [inativos, setInativos] = useState<FederadoRaw[]>([]);
  const [statsDb, setStatsDb] = useState<PlayerStatsDb>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  // Pitch & Putt: mapa fed → registo P&P (federados-pp.json). Vazio se ausente.
  const [ppMap, setPpMap] = useState<Map<string, FederadoPP>>(new Map());

  useEffect(() => {
    loadFederados()
      .then(f => setFederados(f.players))
      .catch(err => setLoadError(String(err?.message || err)));
    loadFederadosInativos().then(setInativos).catch(() => { /* sem o ficheiro → só activos */ });
    loadPlayerStats().then(setStatsDb).catch(() => setStatsDb({}));
    loadFederadosPP().then(() => setPpMap(getPPByFed())).catch(() => { /* sem P&P → coluna vazia */ });
  }, []);

  /* Filtros */
  const [q, setQ] = useState("");
  const [escalao, setEscalao] = useState<string>("ALL");
  const [clubFilter, setClubFilter] = useState<string>("ALL");
  const [anoMin, setAnoMin] = useState<string>("");  // ano de nascimento mínimo
  const [anoMax, setAnoMax] = useState<string>("");  // ano de nascimento máximo
  const [hcpMin, setHcpMin] = useState<string>("");
  const [hcpMax, setHcpMax] = useState<string>("");
  const [hcpStatus, setHcpStatus] = useState<string>("ALL"); // "10"=Válido, etc.
  const [sex, setSex] = useState<"ALL" | "M" | "F">("ALL");
  const [tipo, setTipo] = useState<"ALL" | "1" | "2">("ALL"); // 1=Amador, 2=Pro
  // Todos por defeito: os inactivos aparecem, com a marca (Mariana, 02/11/2026).
  const [fedStatus, setFedStatus] = useState<"ALL" | "9" | "7">("ALL");
  const [activosAnoOnly, setActivosAnoOnly] = useState(false);
  const [jovensOnly, setJovensOnly] = useState(false);
  const [comSDOnly, setComSDOnly] = useState(false);
  const [diffsOnly, setDiffsOnly] = useState(false);
  const [onlyPP, setOnlyPP] = useState(false);  // só jogadores com HCP P&P estabelecido
  // Nacionalidade: ALL (todos) · FOREIGN (só estrangeiros) · PT (sem estrangeiros)
  const [natFilter, setNatFilter] = useState<"ALL" | "FOREIGN" | "PT">("ALL");
  // Fixar no topo (ordenação por Nome) o Manuel, o Gastão e o top 5 de cada
  // escalão do Campeonato Nacional de Jovens — ver constants/pinnedPlayers.ts.
  // Ligado por defeito; "Limpar filtros" desliga-o → ordem alfabética pura.
  // Re-activável pelo chip ⭐.
  const [prioritizeDestaques, setPrioritizeDestaques] = useState(true);

  /* Selecção (highlight) — clicar uma linha selecciona-a; duplo-clique abre nova janela */
  const [selectedFed, setSelectedFed] = useState<string | null>(null);

  /* Sort + paginação */
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("name", "asc", {
    hcp: "asc", ppHcp: "asc", age: "asc", dob: "desc", roundsTotal: "desc", roundsYear: "desc",
    lastSD: "asc", avgSD5: "asc",
  });
  const [page, setPage] = useState(1);

  // Reset à página quando muda algum filtro relevante
  useEffect(() => { setPage(1); }, [q, escalao, clubFilter, anoMin, anoMax, hcpMin, hcpMax, hcpStatus, sex, tipo, fedStatus, activosAnoOnly, jovensOnly, comSDOnly, diffsOnly, onlyPP, prioritizeDestaques, natFilter]);

  /* Build merged rows */
  const rows: Row[] = useMemo(() => {
    if (!federados) return [];
    // Quem voltou a ser federado está nos dois ficheiros: ganha o activo.
    const activos = new Set(federados.map(f => String(f.federation_code)));
    const merged = mergePlayersWithFederados(players, [
      ...federados,
      ...inativos.filter(f => !activos.has(String(f.federation_code))),
    ]);
    const seen = new Set<string>();

    const out: Row[] = merged.map(p => {
      seen.add(String(p.nfed));
      const ppr = ppMap.get(String(p.nfed));
      const ppReal = hasRealPPHcp(ppr);
      const f = p._federadoRaw;
      const ps: PlayerStats | undefined = statsDb[p.nfed];
      const dob = f?.birthdate || p.dob || null;
      const pClub = (p.club && typeof p.club === "object") ? p.club : null;
      // Country: aplicar override por fed code antes de cair no FPG. O FPG tem
      // alguns juniores com passaporte errado (ex: David Filip Jr. marcado como
      // US quando é checo). Lista em COUNTRY_OVERRIDE no topo do ficheiro.
      const country = COUNTRY_OVERRIDE[p.nfed] || f?.country || "";
      // Alguns registos antigos do players.json têm o `name` preenchido com o
      // próprio nº de federado (placeholder, ex: "27849") em vez do nome real.
      // Nesses casos preferimos o nome do federados.json (snapshot FPG).
      const nameIsPlaceholder = !p.name || !p.name.trim() || /^\d+$/.test(p.name.trim());
      const displayName = (nameIsPlaceholder && f?.name) ? f.name : p.name;
      return {
        fed: p.nfed,
        name: displayName,
        countryName: country,
        clubCode: f?.club_code || pClub?.code || "",
        clubShort: f?.acronym || pClub?.short || "",
        clubLong: f?.club_name || pClub?.long || "",
        dob,
        age: ageAtDate(dob, todayIso()),
        hcp: f?.hcp_exact ?? p.hcp ?? null,
        hcpStatus: f?.hcp_status || "",
        hcpStatusId: f?.hcp_status_id ?? 0,
        typeId: f?.player_type_id ?? 1,
        sex: (p.sex === "M" || p.sex === "F") ? p.sex : (f?.gender === "F" ? "F" : "M"),
        escalao: p.escalao || "Absoluto",
        fedStatusId: f?.federated_status_id ?? 9,
        inactive: f?.federated_status_id === FED_STATUS_INATIVO,
        roundsTotal: ps?.roundsTotal ?? null,
        roundsYear: ps?.roundsCurrentYear ?? f?.rounds_current_year ?? null,
        lastSD: ps?.lastSD ?? null,
        avgSD5: ps?.avgSD5 ?? null,
        hasAnalysis: !!ps,
        hasDiffs: !!p._fpgDiffs,
        diffsText: buildDiffsText(p._fpgDiffs),
        ppHcp: ppReal ? ppr!.hcp : null,
        ppReal,
        ppRoundsYear: ppr?.roundsYear ?? null,
        ppOnly: false,
      } as Row;
    });

    // Federados que SÓ existem no mundo P&P (não estão na lista de golfe) —
    // injectados a pedido (mostrar o universo P&P completo). Têm dados P&P mas
    // sem handicap/análise de golfe.
    for (const [fed, ppr] of ppMap) {
      if (seen.has(String(fed))) continue;
      const ppReal = hasRealPPHcp(ppr);
      out.push({
        fed: String(fed),
        name: ppr.name,
        countryName: ppr.country === "PT" ? "Portugal" : (ppr.country || ""),
        clubCode: ppr.clubCode || "",
        clubShort: ppr.acronym || "",
        clubLong: ppr.club || "",
        dob: ppr.dob || null,
        age: ageAtDate(ppr.dob || null, todayIso()),
        hcp: null,
        hcpStatus: "",
        hcpStatusId: 0,
        typeId: 1,
        sex: ppr.sex === "F" ? "F" : "M",
        escalao: normalizeAgeLevel(ppr.age),
        fedStatusId: 9,
        inactive: false,
        roundsTotal: null,
        roundsYear: null,
        lastSD: null,
        avgSD5: null,
        hasAnalysis: false,
        hasDiffs: false,
        diffsText: "",
        ppHcp: ppReal ? ppr.hcp : null,
        ppReal,
        ppRoundsYear: ppr.roundsYear ?? null,
        ppOnly: true,
      } as Row);
    }

    return out;
  }, [federados, inativos, players, statsDb, ppMap]);

  /* Filter */
  const filtered = useMemo(() => {
    const qNorm = norm(q.trim());
    const yMin = anoMin === "" ? null : Number(anoMin);
    const yMax = anoMax === "" ? null : Number(anoMax);
    const hMin = hcpMin === "" ? null : Number(hcpMin);
    const hMax = hcpMax === "" ? null : Number(hcpMax);

    // Pesquisa por palavras independentes — cada palavra tem de existir
    // no NOME ou no Nº FED (a caixa diz "NOME / Nº FED", logo só esses).
    // Antes usava `includes(qNorm)` literal, o que rejeitava "manuel me"
    // para "Manuel Goulartt Medeiros" por falta de substring contígua.
    // Incluir o clube na haystack dava falsos positivos (ex: "manuel med"
    // a apanhar José Manuel Teixeira quando "med" calhava num clube).
    const words = qNorm ? qNorm.split(/\s+/).filter(Boolean) : [];
    return rows.filter(r => {
      if (words.length) {
        const nameN = norm(r.name);
        const fed = r.fed;
        if (!words.every(w => nameN.includes(w) || fed.includes(w))) return false;
      }
      if (escalao !== "ALL" && r.escalao !== escalao) return false;
      if (clubFilter !== "ALL" && r.clubCode !== clubFilter) return false;
      // Filtro por ano de nascimento (extrai do DOB "YYYY-MM-DD")
      if (yMin != null || yMax != null) {
        const year = r.dob ? Number(r.dob.slice(0, 4)) : null;
        if (year == null || isNaN(year)) return false;
        if (yMin != null && year < yMin) return false;
        if (yMax != null && year > yMax) return false;
      }
      if (hMin != null && (r.hcp == null || r.hcp < hMin)) return false;
      if (hMax != null && (r.hcp == null || r.hcp > hMax)) return false;
      if (hcpStatus !== "ALL" && String(r.hcpStatusId) !== hcpStatus) return false;
      if (sex !== "ALL" && r.sex !== sex) return false;
      if (tipo !== "ALL" && String(r.typeId) !== tipo) return false;
      if (fedStatus !== "ALL" && String(r.fedStatusId) !== fedStatus) return false;
      if (activosAnoOnly && !(r.roundsYear && r.roundsYear > 0)) return false;
      if (jovensOnly && !/^Sub-/.test(r.escalao)) return false;
      if (comSDOnly && !r.hasAnalysis) return false;
      if (diffsOnly && !r.hasDiffs) return false;
      if (onlyPP && !r.ppReal) return false;
      if (natFilter !== "ALL") {
        const isForeign = !!r.countryName && !isPtCountry(r.countryName);
        if (natFilter === "FOREIGN" && !isForeign) return false;
        if (natFilter === "PT" && isForeign) return false;
      }
      return true;
    });
  }, [rows, q, escalao, clubFilter, anoMin, anoMax, hcpMin, hcpMax, hcpStatus, sex, tipo, fedStatus, activosAnoOnly, jovensOnly, comSDOnly, diffsOnly, onlyPP, natFilter]);

  /* Sort */
  const sorted = useMemo(() => {
    const arr = filtered.slice();
    const dir = sortDir === "asc" ? 1 : -1;
    const str = (v: string | null | undefined) => (v || "").toLocaleLowerCase("pt-PT");

    // Pin: Manuel, Gastão e o top 5 de cada escalão do Nacional de Jovens
    // flutuam para o topo (na ordem de PIN_RANK) quando ordenamos por Nome.
    // Os restantes mantêm a ordenação alfabética normal.
    const pinActive = prioritizeDestaques && sortKey === "name";

    arr.sort((a, b) => {
      if (pinActive) {
        const ra = PIN_RANK.get(a.fed);
        const rb = PIN_RANK.get(b.fed);
        if (ra != null || rb != null) {
          if (ra == null) return 1;
          if (rb == null) return -1;
          if (ra !== rb) return ra - rb;
        }
      }
      switch (sortKey) {
        case "nfed":         return (Number(a.fed) - Number(b.fed)) * dir;
        case "name":         return str(a.name).localeCompare(str(b.name), "pt") * dir;
        case "club":         return str(a.clubShort).localeCompare(str(b.clubShort), "pt") * dir;
        case "country":      return str(a.countryName).localeCompare(str(b.countryName), "pt") * dir;
        case "dob":          return ((a.dob || "") < (b.dob || "") ? -1 : (a.dob || "") > (b.dob || "") ? 1 : 0) * dir;
        case "age":          return compareNullsLast(a.age, b.age, dir);
        case "hcp":          return compareNullsLast(a.hcp, b.hcp, dir);
        case "ppHcp":        return compareNullsLast(a.ppHcp, b.ppHcp, dir);
        case "sex":          return str(a.sex).localeCompare(str(b.sex), "pt") * dir;
        case "escalao": {
          const ai = ESC_ORDER.indexOf(a.escalao); const bi = ESC_ORDER.indexOf(b.escalao);
          return ((ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)) * dir;
        }
        case "roundsTotal":  return compareNullsLast(a.roundsTotal, b.roundsTotal, dir);
        case "roundsYear":   return compareNullsLast(a.roundsYear, b.roundsYear, dir);
        case "lastSD":       return compareNullsLast(a.lastSD, b.lastSD, dir);
        case "avgSD5":       return compareNullsLast(a.avgSD5, b.avgSD5, dir);
        default:             return 0;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir, prioritizeDestaques]);

  /* Paginação */
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, page]);

  /* Escalões disponíveis */
  const escaloesPresentes = useMemo(() => {
    const present = new Set<string>();
    rows.forEach(r => r.escalao && present.add(r.escalao));
    return ESC_ORDER.filter(e => present.has(e));
  }, [rows]);

  /* Clubes presentes — ordenados por nº de jogadores (desc), label "Sigla (N)".
   * Quando não há acrónimo, cai no nome longo. clubCode "" é ignorado. */
  const clubOptions = useMemo(() => {
    const counts = new Map<string, { code: string; label: string; count: number }>();
    for (const r of rows) {
      if (!r.clubCode) continue;
      const existing = counts.get(r.clubCode);
      if (existing) {
        existing.count++;
      } else {
        const label = r.clubShort || r.clubLong || r.clubCode;
        counts.set(r.clubCode, { code: r.clubCode, label, count: 1 });
      }
    }
    return [...counts.values()]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt"))
      .map(c => ({ code: c.code, label: `${c.label} (${c.count})` }));
  }, [rows]);

  /* HCP statuses presentes */
  const hcpStatusOptions = useMemo(() => {
    const map = new Map<string, string>();  // id -> label
    rows.forEach(r => {
      if (r.hcpStatus && !map.has(String(r.hcpStatusId))) {
        map.set(String(r.hcpStatusId), r.hcpStatus);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "pt"));
  }, [rows]);

  const resetFilters = () => {
    setQ(""); setEscalao("ALL"); setClubFilter("ALL");
    setAnoMin(""); setAnoMax("");
    setHcpMin(""); setHcpMax(""); setHcpStatus("ALL");
    setSex("ALL"); setTipo("ALL"); setFedStatus("ALL");
    setActivosAnoOnly(false); setJovensOnly(false);
    setComSDOnly(false); setDiffsOnly(false); setNatFilter("ALL");
    setPrioritizeDestaques(false); // volta à ordem alfabética pura
  };

  /* ── Render ──────────────────────────────────────────────── */
  if (loadError) {
    return (
      <div className="u-p-24px">
        <h2>Lista de Jogadores</h2>
        <ErrorState message="Erro ao carregar os federados" detail={loadError} />
      </div>
    );
  }

  if (!federados) {
    return <LoadingState size="md" message="A carregar lista de federados…" />;
  }

  return (
    <div className="u-p-8px-12px-24px">
      <Toolbar>
        <ToolbarTitle>👥 Lista de Jogadores</ToolbarTitle>
        <ToolbarMeta>
          {sorted.length.toLocaleString("pt-PT")} de {rows.length.toLocaleString("pt-PT")}
        </ToolbarMeta>
        <ToolbarSep />
        <ClearButton onClick={resetFilters} />
        <span className="u-ml-auto u-fs-fs-11 u-c-text-muted">
          <ExtLink
            href={FPG_LIST_URL}
            className="u-c-chart-2 u-td-none"
            title="Abrir tabela oficial da Federação Portuguesa de Golfe"
          >
            🔗 Tabela FPG
          </ExtLink>
        </span>
      </Toolbar>

      {/* ── Filtros essenciais ───────────────────────────────── */}
      <div className="filter-grid">
        <FilterField label="NOME / Nº FED">
          <SearchInput value={q} onChange={setQ} placeholder="Pesquisar por nome ou nº federado…" size="full" />
        </FilterField>

        <FilterField label="ESCALÃO">
          <Select variant="filter" value={escalao} onChange={setEscalao}>
            <option value="ALL">Todos</option>
            {escaloesPresentes.map(esc => (
              <option key={esc} value={esc}>{esc}</option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="CLUBE">
          <Select
            variant="filter"
            value={clubFilter}
            onChange={setClubFilter}
            title="Filtrar por clube (ordenado por nº de jogadores)"
          >
            <option value="ALL">Todos</option>
            {clubOptions.map(c => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="ANO NASCIMENTO (DE / A)">
          <div className="u-d-flex u-gap-4px">
            <NumberInput variant="filter" className="u-fl-1" value={anoMin} onChange={setAnoMin} placeholder="2010" min="1900" max="2030" />
            <NumberInput variant="filter" className="u-fl-1" value={anoMax} onChange={setAnoMax} placeholder="2015" min="1900" max="2030" />
          </div>
        </FilterField>

        <FilterField label="HCP (DO / AO)">
          <div className="u-d-flex u-gap-4px">
            <NumberInput variant="filter" className="u-fl-1" step="0.1" value={hcpMin} onChange={setHcpMin} placeholder="-8" />
            <NumberInput variant="filter" className="u-fl-1" step="0.1" value={hcpMax} onChange={setHcpMax} placeholder="54" />
          </div>
        </FilterField>

        <FilterField label="ESTADO HCP">
          <Select variant="filter" value={hcpStatus} onChange={setHcpStatus}>
            <option value="ALL">Todos</option>
            {hcpStatusOptions.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="SEXO">
          <SexSelect variant="filter" value={sex} onChange={setSex} allValue="ALL" />
        </FilterField>

        <FilterField label="AM / PRO">
          <Select variant="filter" value={tipo} onChange={v => setTipo(v as typeof tipo)}>
            <option value="ALL">Todos</option>
            <option value="1">Amador</option>
            <option value="2">Profissional</option>
          </Select>
        </FilterField>

        <FilterField label="ESTADO FEDERATIVO">
          <Select variant="filter" value={fedStatus} onChange={v => setFedStatus(v as typeof fedStatus)}>
            <option value="ALL">Todos</option>
            <option value="9">Activo</option>
            <option value="7">Inactivo</option>
          </Select>
        </FilterField>
      </div>

      {/* ── Filtros avançados ────────────────────────────────── */}
      <div className="u-d-flex u-fwr-wrap u-gap-8px u-p-4px-8px-12px u-fs-fs-12">
        <ToggleChip checked={activosAnoOnly} onChange={setActivosAnoOnly} label="🗓 Só com rondas este ano" />
        <ToggleChip checked={jovensOnly} onChange={setJovensOnly} label="🧒 Só Jovens (Sub-X)" />
        <ToggleChip checked={comSDOnly} onChange={setComSDOnly} label="📊 Só com SD calculado" />
        <ToggleChip checked={diffsOnly} onChange={setDiffsOnly} label="⚠ Diferenças vs FPG" />
        {ppMap.size > 0 && <ToggleChip checked={onlyPP} onChange={setOnlyPP} label="🏑 Só com HCP P&P" />}
        <ToggleChip checked={natFilter === "FOREIGN"} onChange={v => setNatFilter(v ? "FOREIGN" : "ALL")} label="🌍 Só estrangeiros" />
        <ToggleChip checked={natFilter === "PT"} onChange={v => setNatFilter(v ? "PT" : "ALL")} label="🇵🇹 Sem estrangeiros" />
        <ToggleChip checked={prioritizeDestaques} onChange={setPrioritizeDestaques} label="⭐ Manuel, Gastão e top Nacional Jovens no topo" />
      </div>

      {/* ── Tabela ───────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <EmptyState size="md" message="Nenhum jogador corresponde aos filtros actuais" />
      ) : (
        <>
          <div className="u-ox-auto">
            <table className="dtable player-list-table u-w-100pc u-fs-fs-12">
              <thead>
                <tr>
                  <SortableHdr k="nfed" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Nº Fed</SortableHdr>
                  <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Nome</SortableHdr>
                  <SortableHdr k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight" title="País (só estrangeiros)">🌐</SortableHdr>
                  <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Clube</SortableHdr>
                  <SortableHdr k="dob" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">DOB</SortableHdr>
                  <SortableHdr k="age" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">Idade</SortableHdr>
                  <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">HCP</SortableHdr>
                  <SortableHdr k="ppHcp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Handicap Pitch & Putt (mundo paralelo)">🏑 P&P</SortableHdr>
                  <SortableHdr k="sex" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Sexo</SortableHdr>
                  <SortableHdr k="escalao" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Escalão</SortableHdr>
                  <SortableHdr k="roundsTotal" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Total de rondas (player-stats.json)">📊 Tot</SortableHdr>
                  <SortableHdr k="roundsYear" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Rondas no ano corrente">🗓 Ano</SortableHdr>
                  <SortableHdr k="lastSD" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Último Score Differential">Últ. SD</SortableHdr>
                  <SortableHdr k="avgSD5" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Média dos últimos 5 SDs">Méd. 5 SD</SortableHdr>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(r => {
                  const isManuel = r.fed === MANUEL_FED;
                  const isSelected = r.fed === selectedFed;
                  const cls = [
                    "player-list-row",
                    isManuel && "row-manuel",
                    isSelected && "row-selected",
                  ].filter(Boolean).join(" ");
                  return (
                  <tr
                    key={r.fed}
                    onClick={() => setSelectedFed(prev => prev === r.fed ? null : r.fed)}
                    onDoubleClick={() => window.open(`/jogadores/${r.fed}`, "_blank", "noopener,noreferrer")}
                    onAuxClick={e => { if (e.button === 1) window.open(`/jogadores/${r.fed}`, "_blank", "noopener,noreferrer"); }}
                    title="Click no nome: abrir ficha · Click na linha: seleccionar · Duplo-click: abrir ficha"

                    className={`${cls ?? ""} u-cur-pointer`}
                  >
                    <td>{r.fed}</td>
                    <td className="u-fw-500">
                      <PlayerLink fed={r.fed} name={r.name} title={`Abrir ficha de ${r.name} em nova janela`} />
                      {r.inactive && <Pill className="p-muted u-ml-4px" title="Já não é federado na FPG (estado federativo «Inativo»)">Inactivo</Pill>}
                      {r.hasAnalysis && <span title="Análise local disponível" className="u-ml-4px u-op-0_6">★</span>}
                      {r.ppOnly && <span title="Só federado de Pitch & Putt (sem registo no golfe)" className="u-ml-4px u-op-0_7">🏑</span>}
                      {r.hasDiffs && (
                        <span
                          title={r.diffsText}
                          className="u-ml-4px u-cur-help"
                        >⚠</span>
                      )}
                    </td>
                    <td title={r.countryName} className="u-fs-fs-14">
                      {r.countryName && !isPtCountry(r.countryName) ? gf(r.countryName) : ""}
                    </td>
                    <td title={r.clubLong}>{r.clubShort}{r.clubCode ? ` (${r.clubCode})` : ""}</td>
                    <td>{r.dob ? shortDate(r.dob) : "—"}</td>
                    <td className="u-ta-right">{r.age != null ? r.age : "—"}</td>
                    <td className="u-ta-right u-fw-600">{r.hcp != null ? hcpDisplay(r.hcp) : "—"}</td>
                    <td className="u-ta-right">
                      {r.ppReal ? (
                        <span className="p p-sm u-bg-badge-pp u-c-fff u-bd-1px-solid-badge-pp" title={`Handicap Pitch & Putt: ${r.ppHcp}${r.ppRoundsYear ? ` · ${r.ppRoundsYear} cartões este ano` : ""}`}
>
                          🏑 {hcpDisplay(r.ppHcp!)}
                        </span>
                      ) : MUTED}
                    </td>
                    <td><SexBadge sex={r.sex as "M" | "F"} /></td>
                    <td><EscPill esc={r.escalao} /></td>
                    <td style={{ textAlign: "right", color: r.roundsTotal ? undefined : "var(--text-muted)" }}>
                      {r.roundsTotal ?? "—"}
                    </td>
                    <td style={{ textAlign: "right", color: r.roundsYear && r.roundsYear > 0 ? "var(--color-good-dark)" : "var(--text-muted)", fontWeight: r.roundsYear ? 600 : undefined }}>
                      {r.roundsYear ?? "—"}
                    </td>
                    <td className="num">{fmtSD(r.lastSD)}</td>
                    <td className="num">{fmtSD(r.avgSD5)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <Pager page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}

      {/* Footer com link FPG */}
      <div className="u-mt-16px u-fs-fs-11 u-c-text-muted u-ta-center">
        Fonte: <code>federados.json</code> + <code>federados-inativos-lista.json</code> (~{rows.length.toLocaleString("pt-PT")} federados, activos e inactivos) ·{" "}
        <ExtLink href={FPG_LIST_URL} className="u-c-chart-2">
          Tabela oficial FPG (handicaps.asp) ↗
        </ExtLink>
      </div>
    </div>
  );
}

/* FilterField/ToggleChip promovidos a src/ui/FilterField.tsx (2026-08-15) —
   partilhados com a toolbar da JogadoresPage. */
