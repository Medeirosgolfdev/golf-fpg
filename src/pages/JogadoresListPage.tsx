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
 *   - federados.json     (~16.000 federados activos)
 *   - players.json       (~396 curados, via AppContext)
 *   - player-stats.json  (SDs pré-calculados a partir de data.json)
 *
 * Filtros:
 *   - Essenciais (FPG): nome/nfed, escalão, idade min/max, HCP min/max,
 *     estado HCP, sexo, AM/PRO, estado federativo
 *   - Avançados: só com rondas este ano, só Jovens (Sub-X),
 *     só com SD calculado, diferenças vs FPG
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAppContext } from "../context/AppContext";
import { norm, shortDate } from "../utils/format";
import { gf } from "../utils/flagUtils";
import { hcpDisplay } from "../utils/playerUtils";
import {
  loadFederados,
  mergePlayersWithFederados,
  type FederadoRaw,
} from "../data/federadosLoader";
import {
  loadPlayerStats,
  type PlayerStats,
  type PlayerStatsDb,
} from "../data/playerStatsTypes";
import { MANUEL_FED } from "../constants/manuel";
import { useSort } from "../hooks/useSort";
import SortableHdr from "../ui/SortableHdr";
import SexBadge from "../ui/SexBadge";
import { EscPill } from "../ui/PillBadge";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../ui/Toolbar";
import LoadingState from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";

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
const ESC_ORDER = [
  "Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18",
  "Sub-21", "Sub-24", "Absoluto", "MidAmateur", "Sénior", "SuperSenior",
];
const PAGE_SIZE = 100;

type SortKey =
  | "nfed" | "name" | "club" | "country" | "dob" | "age"
  | "hcp" | "sex" | "escalao"
  | "roundsTotal" | "roundsYear" | "lastSD" | "avgSD5" | "lastHcpDate";

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
  lastHcpDate: string | null;
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
};

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

function fmtSD(v: number | null): string {
  if (v == null) return "—";
  return v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
}

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
  const [statsDb, setStatsDb] = useState<PlayerStatsDb>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadFederados()
      .then(f => setFederados(f.players))
      .catch(err => setLoadError(String(err?.message || err)));
    loadPlayerStats().then(setStatsDb).catch(() => setStatsDb({}));
  }, []);

  /* Filtros */
  const [q, setQ] = useState("");
  const [escalao, setEscalao] = useState<string>("ALL");
  const [anoMin, setAnoMin] = useState<string>("");  // ano de nascimento mínimo
  const [anoMax, setAnoMax] = useState<string>("");  // ano de nascimento máximo
  const [hcpMin, setHcpMin] = useState<string>("");
  const [hcpMax, setHcpMax] = useState<string>("");
  const [hcpStatus, setHcpStatus] = useState<string>("ALL"); // "10"=Válido, etc.
  const [sex, setSex] = useState<"ALL" | "M" | "F">("ALL");
  const [tipo, setTipo] = useState<"ALL" | "1" | "2">("ALL"); // 1=Amador, 2=Pro
  const [fedStatus, setFedStatus] = useState<"ALL" | "9" | "7">("9"); // default activos
  const [activosAnoOnly, setActivosAnoOnly] = useState(false);
  const [jovensOnly, setJovensOnly] = useState(false);
  const [comSDOnly, setComSDOnly] = useState(false);
  const [diffsOnly, setDiffsOnly] = useState(false);

  /* Selecção (highlight) — clicar uma linha selecciona-a; duplo-clique abre nova janela */
  const [selectedFed, setSelectedFed] = useState<string | null>(null);

  /* Sort + paginação */
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("name", "asc", {
    hcp: "asc", age: "asc", dob: "desc", roundsTotal: "desc", roundsYear: "desc",
    lastSD: "asc", avgSD5: "asc", lastHcpDate: "desc",
  });
  const [page, setPage] = useState(1);

  // Reset à página quando muda algum filtro relevante
  useEffect(() => { setPage(1); }, [q, escalao, anoMin, anoMax, hcpMin, hcpMax, hcpStatus, sex, tipo, fedStatus, activosAnoOnly, jovensOnly, comSDOnly, diffsOnly]);

  /* Build merged rows */
  const rows: Row[] = useMemo(() => {
    if (!federados) return [];
    const merged = mergePlayersWithFederados(players, federados);

    return merged.map(p => {
      const f = p._federadoRaw;
      const ps: PlayerStats | undefined = statsDb[p.nfed];
      const dob = f?.birthdate || p.dob || null;
      const pClub = (p.club && typeof p.club === "object") ? p.club : null;
      // Country: aplicar override por fed code antes de cair no FPG. O FPG tem
      // alguns juniores com passaporte errado (ex: David Filip Jr. marcado como
      // US quando é checo). Lista em COUNTRY_OVERRIDE no topo do ficheiro.
      const country = COUNTRY_OVERRIDE[p.nfed] || f?.country || "";
      return {
        fed: p.nfed,
        name: p.name,
        countryName: country,
        clubCode: f?.club_code || pClub?.code || "",
        clubShort: f?.acronym || pClub?.short || "",
        clubLong: f?.club_name || pClub?.long || "",
        dob,
        age: calcAge(dob),
        hcp: f?.hcp_exact ?? p.hcp ?? null,
        hcpStatus: f?.hcp_status || "",
        hcpStatusId: f?.hcp_status_id ?? 0,
        typeId: f?.player_type_id ?? 1,
        sex: (p.sex === "M" || p.sex === "F") ? p.sex : (f?.gender === "F" ? "F" : "M"),
        escalao: p.escalao || "Absoluto",
        fedStatusId: f?.federated_status_id ?? 9,
        lastHcpDate: f?.last_hcp_date || null,
        roundsTotal: ps?.roundsTotal ?? null,
        roundsYear: ps?.roundsCurrentYear ?? f?.rounds_current_year ?? null,
        lastSD: ps?.lastSD ?? null,
        avgSD5: ps?.avgSD5 ?? null,
        hasAnalysis: !!ps,
        hasDiffs: !!p._fpgDiffs,
        diffsText: buildDiffsText(p._fpgDiffs),
      } as Row;
    });
  }, [federados, players, statsDb]);

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
      return true;
    });
  }, [rows, q, escalao, anoMin, anoMax, hcpMin, hcpMax, hcpStatus, sex, tipo, fedStatus, activosAnoOnly, jovensOnly, comSDOnly, diffsOnly]);

  /* Sort */
  const sorted = useMemo(() => {
    const arr = filtered.slice();
    const dir = sortDir === "asc" ? 1 : -1;
    const num = (v: number | null | undefined) =>
      v == null || isNaN(v as number) ? Number.POSITIVE_INFINITY : (v as number);
    const str = (v: string | null | undefined) => (v || "").toLocaleLowerCase("pt-PT");

    arr.sort((a, b) => {
      switch (sortKey) {
        case "nfed":         return (Number(a.fed) - Number(b.fed)) * dir;
        case "name":         return str(a.name).localeCompare(str(b.name), "pt") * dir;
        case "club":         return str(a.clubShort).localeCompare(str(b.clubShort), "pt") * dir;
        case "country":      return str(a.countryName).localeCompare(str(b.countryName), "pt") * dir;
        case "dob":          return ((a.dob || "") < (b.dob || "") ? -1 : (a.dob || "") > (b.dob || "") ? 1 : 0) * dir;
        case "age":          return (num(a.age) - num(b.age)) * dir;
        case "hcp":          return (num(a.hcp) - num(b.hcp)) * dir;
        case "sex":          return str(a.sex).localeCompare(str(b.sex), "pt") * dir;
        case "escalao": {
          const ai = ESC_ORDER.indexOf(a.escalao); const bi = ESC_ORDER.indexOf(b.escalao);
          return ((ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)) * dir;
        }
        case "roundsTotal":  return (num(a.roundsTotal) - num(b.roundsTotal)) * dir;
        case "roundsYear":   return (num(a.roundsYear) - num(b.roundsYear)) * dir;
        case "lastSD":       return (num(a.lastSD) - num(b.lastSD)) * dir;
        case "avgSD5":       return (num(a.avgSD5) - num(b.avgSD5)) * dir;
        case "lastHcpDate":  return ((a.lastHcpDate || "") < (b.lastHcpDate || "") ? -1 : (a.lastHcpDate || "") > (b.lastHcpDate || "") ? 1 : 0) * dir;
        default:             return 0;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

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
    setQ(""); setEscalao("ALL"); setAnoMin(""); setAnoMax("");
    setHcpMin(""); setHcpMax(""); setHcpStatus("ALL");
    setSex("ALL"); setTipo("ALL"); setFedStatus("9");
    setActivosAnoOnly(false); setJovensOnly(false);
    setComSDOnly(false); setDiffsOnly(false);
  };

  /* ── Render ──────────────────────────────────────────────── */
  if (loadError) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Lista de Jogadores</h2>
        <EmptyState size="md" message={`Erro ao carregar federados: ${loadError}`} />
      </div>
    );
  }

  if (!federados) {
    return <LoadingState size="md" message="A carregar lista de federados…" />;
  }

  return (
    <div style={{ padding: "8px 12px 24px" }}>
      <Toolbar>
        <ToolbarTitle>👥 Lista de Jogadores</ToolbarTitle>
        <ToolbarMeta>
          {sorted.length.toLocaleString("pt-PT")} de {rows.length.toLocaleString("pt-PT")}
        </ToolbarMeta>
        <ToolbarSep />
        <button onClick={resetFilters} className="btn-pill" style={{ fontSize: 12 }}>
          Limpar filtros
        </button>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
          <a
            href={FPG_LIST_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--chart-2)", textDecoration: "none" }}
            title="Abrir tabela oficial da Federação Portuguesa de Golfe"
          >
            🔗 Tabela FPG
          </a>
        </span>
      </Toolbar>

      {/* ── Filtros essenciais ───────────────────────────────── */}
      <div className="filter-grid">
        <FilterField label="NOME / Nº FED">
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Pesquisar por nome ou nº federado…"
            className="filter-input"
          />
        </FilterField>

        <FilterField label="ESCALÃO">
          <select value={escalao} onChange={e => setEscalao(e.target.value)} className="filter-input">
            <option value="ALL">Todos</option>
            {escaloesPresentes.map(esc => (
              <option key={esc} value={esc}>{esc}</option>
            ))}
          </select>
        </FilterField>

        <FilterField label="ANO NASCIMENTO (DE / A)">
          <div style={{ display: "flex", gap: 4 }}>
            <input
              type="number"
              value={anoMin}
              onChange={e => setAnoMin(e.target.value)}
              placeholder="2010"
              min="1900" max="2030"
              className="filter-input"
              style={{ flex: 1 }}
            />
            <input
              type="number"
              value={anoMax}
              onChange={e => setAnoMax(e.target.value)}
              placeholder="2015"
              min="1900" max="2030"
              className="filter-input"
              style={{ flex: 1 }}
            />
          </div>
        </FilterField>

        <FilterField label="HCP (DO / AO)">
          <div style={{ display: "flex", gap: 4 }}>
            <input type="number" step="0.1" value={hcpMin} onChange={e => setHcpMin(e.target.value)} placeholder="-8" className="filter-input" style={{ flex: 1 }} />
            <input type="number" step="0.1" value={hcpMax} onChange={e => setHcpMax(e.target.value)} placeholder="54" className="filter-input" style={{ flex: 1 }} />
          </div>
        </FilterField>

        <FilterField label="ESTADO HCP">
          <select value={hcpStatus} onChange={e => setHcpStatus(e.target.value)} className="filter-input">
            <option value="ALL">Todos</option>
            {hcpStatusOptions.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </FilterField>

        <FilterField label="SEXO">
          <select value={sex} onChange={e => setSex(e.target.value as typeof sex)} className="filter-input">
            <option value="ALL">Todos</option>
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
          </select>
        </FilterField>

        <FilterField label="AM / PRO">
          <select value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)} className="filter-input">
            <option value="ALL">Todos</option>
            <option value="1">Amador</option>
            <option value="2">Profissional</option>
          </select>
        </FilterField>

        <FilterField label="ESTADO FEDERATIVO">
          <select value={fedStatus} onChange={e => setFedStatus(e.target.value as typeof fedStatus)} className="filter-input">
            <option value="ALL">Todos</option>
            <option value="9">Activo</option>
            <option value="7">Inactivo</option>
          </select>
        </FilterField>
      </div>

      {/* ── Filtros avançados ────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "4px 8px 12px", fontSize: 12 }}>
        <ToggleChip checked={activosAnoOnly} onChange={setActivosAnoOnly} label="🗓 Só com rondas este ano" />
        <ToggleChip checked={jovensOnly} onChange={setJovensOnly} label="🧒 Só Jovens (Sub-X)" />
        <ToggleChip checked={comSDOnly} onChange={setComSDOnly} label="📊 Só com SD calculado" />
        <ToggleChip checked={diffsOnly} onChange={setDiffsOnly} label="⚠ Diferenças vs FPG" />
      </div>

      {/* ── Tabela ───────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <EmptyState size="md" message="Nenhum jogador corresponde aos filtros actuais" />
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="player-list-table" style={{ width: "100%", fontSize: 12 }}>
              <thead>
                <tr>
                  <SortableHdr k="nfed" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Nº Fed</SortableHdr>
                  <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Nome</SortableHdr>
                  <SortableHdr k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="País (só estrangeiros)">🌐</SortableHdr>
                  <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Clube</SortableHdr>
                  <SortableHdr k="dob" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>DOB</SortableHdr>
                  <SortableHdr k="age" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Idade</SortableHdr>
                  <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>HCP</SortableHdr>
                  <SortableHdr k="sex" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Sexo</SortableHdr>
                  <SortableHdr k="escalao" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Escalão</SortableHdr>
                  <SortableHdr k="roundsTotal" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Total de rondas (player-stats.json)">📊 Tot</SortableHdr>
                  <SortableHdr k="roundsYear" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Rondas no ano corrente">🗓 Ano</SortableHdr>
                  <SortableHdr k="lastSD" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Último Score Differential">Últ. SD</SortableHdr>
                  <SortableHdr k="avgSD5" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Média dos últimos 5 SDs">Méd. 5 SD</SortableHdr>
                  <SortableHdr k="lastHcpDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Última actualização HCP (FPG)">Últ. HCP</SortableHdr>
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
                    style={{ cursor: "pointer" }}
                    className={cls}
                  >
                    <td>{r.fed}</td>
                    <td style={{ fontWeight: 500 }}>
                      <a
                        href={`/jogadores/${r.fed}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        title={`Abrir ficha de ${r.name} em nova janela`}
                        className="player-list-name-link"
                      >
                        {r.name}
                      </a>
                      {r.hasAnalysis && <span title="Análise local disponível" style={{ marginLeft: 4, opacity: 0.6 }}>★</span>}
                      {r.hasDiffs && (
                        <span
                          title={r.diffsText}
                          style={{ marginLeft: 4, cursor: "help" }}
                        >⚠</span>
                      )}
                    </td>
                    <td title={r.countryName} style={{ fontSize: 14 }}>
                      {r.countryName && r.countryName !== "Portugal" ? gf(r.countryName) : ""}
                    </td>
                    <td title={r.clubLong}>{r.clubShort}{r.clubCode ? ` (${r.clubCode})` : ""}</td>
                    <td>{r.dob ? shortDate(r.dob) : "—"}</td>
                    <td style={{ textAlign: "right" }}>{r.age != null ? r.age : "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{r.hcp != null ? hcpDisplay(r.hcp) : "—"}</td>
                    <td><SexBadge sex={r.sex as "M" | "F"} /></td>
                    <td><EscPill esc={r.escalao} /></td>
                    <td style={{ textAlign: "right", color: r.roundsTotal ? undefined : "var(--text-muted)" }}>
                      {r.roundsTotal ?? "—"}
                    </td>
                    <td style={{ textAlign: "right", color: r.roundsYear && r.roundsYear > 0 ? "var(--color-good-dark, #166534)" : "var(--text-muted)", fontWeight: r.roundsYear ? 600 : undefined }}>
                      {r.roundsYear ?? "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>{fmtSD(r.lastSD)}</td>
                    <td style={{ textAlign: "right" }}>{fmtSD(r.avgSD5)}</td>
                    <td>{r.lastHcpDate ? shortDate(r.lastHcpDate) : "—"}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "12px 0", fontSize: 12 }}>
              <button onClick={() => setPage(1)} disabled={page === 1} className="btn-pill">«</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-pill">‹</button>
              <span style={{ minWidth: 80, textAlign: "center" }}>
                Página <b>{page}</b> de {totalPages}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-pill">›</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="btn-pill">»</button>
            </div>
          )}
        </>
      )}

      {/* Footer com link FPG */}
      <div style={{ marginTop: 16, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
        Fonte: <code>federados.json</code> (~{rows.length.toLocaleString("pt-PT")} federados) ·{" "}
        <a href={FPG_LIST_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--chart-2)" }}>
          Tabela oficial FPG (handicaps.asp) ↗
        </a>
      </div>
    </div>
  );
}

/* ── Sub-componentes ─────────────────────────────────────────── */
function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="filter-field">
      <div className="filter-label">{label}</div>
      {children}
    </div>
  );
}

function ToggleChip({ checked, onChange, label }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="btn-pill"
      style={{
        background: checked ? "var(--accent)" : "var(--bg-card)",
        color: checked ? "#fff" : "var(--text)",
        borderColor: checked ? "var(--accent)" : "var(--border)",
        fontSize: 12,
      }}
    >
      {label}
    </button>
  );
}
