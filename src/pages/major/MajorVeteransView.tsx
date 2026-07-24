/**
 * MajorVeteransView.tsx — tab "✈️ Internacionalizações" da página /major.
 *
 * Ranking dos jogadores por nº de torneios internacionais em que apareceram
 * (todas as fontes da /major), com anos distintos (assiduidade) e nº de
 * circuitos. Lê `public/data/major-veterans.json` (LAZY, só quando a tab abre —
 * ~800 KB), gerado por scripts/build-major-catalog.js a partir dos mesmos dados
 * do catálogo. Um jogador por linha; dedup por vetKey (tolerante à ordem
 * nome/apelido — Doral escreve "Apelido, Nome").
 *
 * Filtros: procura (nome/país), circuito, mínimo de torneios, "Só 🇵🇹 PT",
 * "Esconder 🇺🇸 EUA". Tabela ordenável (regra do projecto). Clicar numa linha
 * expande a lista de torneios do jogador, cada um com link para /major.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cachedFetchJson } from "../../data/fetchCache";
import DetailHeader from "../../ui/DetailHeader";
import LoadingState from "../../ui/LoadingState";
import EmptyState from "../../ui/EmptyState";
import SortableHdr from "../../ui/SortableHdr";
import { useSort } from "../../hooks/useSort";
import { displayName } from "../../utils/format";
import { gf } from "../../utils/flagUtils";
import { isManuelByName } from "../../constants/manuel";

interface VetPlayer {
  name: string;
  country?: string;
  pt?: boolean;
  usa?: boolean;
  tournaments: number;
  years: number;
  seriesCount: number;
  series: string[];
  /** Entradas "source:year" (ex: "doral:2025"). */
  detail: string[];
}
interface VetFile {
  generatedAt: string;
  tournamentsTotal: number;
  count: number;
  players: VetPlayer[];
}

interface Props {
  sourceLabels?: Record<string, string>;
  sourceColors?: Record<string, string>;
}

type SK = "rank" | "name" | "country" | "tournaments" | "years" | "seriesCount";

const PAGE = 100;

/** "doral:2025" → { source:"doral", year:2025 } */
function splitEntry(id: string): { source: string; year: number } {
  const i = id.lastIndexOf(":");
  return { source: id.slice(0, i), year: Number(id.slice(i + 1)) };
}

export default function MajorVeteransView({ sourceLabels = {}, sourceColors = {} }: Props) {
  const [file, setFile] = useState<VetFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [minT, setMinT] = useState(2);
  const [circuito, setCircuito] = useState("");
  const [onlyPt, setOnlyPt] = useState(false);
  const [hideUsa, setHideUsa] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const { sortKey, sortDir, toggleSort } = useSort<SK>("tournaments", "desc", {
    tournaments: "desc", years: "desc", seriesCount: "desc", rank: "asc", name: "asc", country: "asc",
  });

  useEffect(() => {
    cachedFetchJson<VetFile>("/data/major-veterans.json")
      .then((d) => { if (d) setFile(d); else setError("major-veterans.json não encontrado. Corre `node scripts/build-major-catalog.js`."); })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  const srcLabel = (s: string) => sourceLabels[s] ?? s.toUpperCase();

  // Circuitos existentes (para o dropdown), ordenados por label.
  const circuitos = useMemo(() => {
    if (!file) return [] as string[];
    const set = new Set<string>();
    for (const p of file.players) for (const s of p.series) set.add(s);
    return [...set].sort((a, b) => srcLabel(a).localeCompare(srcLabel(b)));
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!file) return [] as VetPlayer[];
    const needle = q.trim().toLowerCase();
    return file.players.filter((p) => {
      if (p.tournaments < minT) return false;
      if (onlyPt && !p.pt) return false;
      if (hideUsa && p.usa) return false;
      if (circuito && !p.series.includes(circuito)) return false;
      if (needle) {
        const hay = (p.name + " " + (p.country ?? "")).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [file, q, minT, circuito, onlyPt, hideUsa]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let c = 0;
      switch (sortKey) {
        case "name": c = displayName(a.name).localeCompare(displayName(b.name)); break;
        case "country": c = (a.country ?? "zzz").localeCompare(b.country ?? "zzz"); break;
        case "years": c = a.years - b.years; break;
        case "seriesCount": c = a.seriesCount - b.seriesCount; break;
        case "tournaments":
        case "rank":
        default: c = a.tournaments - b.tournaments; break;
      }
      // Desempates estáveis: torneios, anos, nome.
      if (c === 0) c = a.tournaments - b.tournaments;
      if (c === 0) c = a.years - b.years;
      if (c === 0) c = displayName(a.name).localeCompare(displayName(b.name));
      return c * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Reset da paginação quando os filtros/ordem mudam.
  useEffect(() => { setLimit(PAGE); }, [q, minT, circuito, onlyPt, hideUsa, sortKey, sortDir]);

  if (error) return <div className="course-detail"><DetailHeader title="✈️ Internacionalizações" /><EmptyState message={error} /></div>;
  if (!file) return <LoadingState message="A carregar ranking…" />;

  const shown = sorted.slice(0, limit);
  const toggleRow = (name: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });

  const chip = (s: string) => (
    <span
      key={s}
      className="fs-11"
      title={srcLabel(s)}
      style={{
        display: "inline-block", padding: "0 6px", marginRight: 4, marginBottom: 2, borderRadius: 999,
        background: sourceColors[s] ?? "var(--surface-2, #e5e7eb)", color: sourceColors[s] ? "#fff" : "var(--text)",
        fontWeight: 600, whiteSpace: "nowrap",
      }}
    >{srcLabel(s)}</span>
  );

  return (
    <div className="course-detail">
      <DetailHeader
        title="✈️ Internacionalizações"
        sub={`Jogadores por nº de torneios internacionais na /major (${file.count} com ≥2 · ${file.tournamentsTotal} torneios). Cada jogador conta 1× por torneio-edição.`}
      />

      {/* Toolbar de filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "8px 0 10px" }}>
        <input
          className="input" placeholder="🔍 Nome ou país…" value={q}
          onChange={(e) => setQ(e.target.value)} style={{ minWidth: 180 }}
        />
        <select className="input" value={circuito} onChange={(e) => setCircuito(e.target.value)} title="Filtrar por circuito">
          <option value="">Todos os circuitos</option>
          {circuitos.map((s) => <option key={s} value={s}>{srcLabel(s)}</option>)}
        </select>
        <label className="fs-12" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          mín. torneios
          <select className="input" value={minT} onChange={(e) => setMinT(Number(e.target.value))}>
            {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button
          type="button" className={`tourn-tab tourn-tab-sm${onlyPt ? " active" : ""}`}
          onClick={() => setOnlyPt((v) => !v)} title="Só jogadores portugueses / Manuel"
        >🇵🇹 Só PT</button>
        <button
          type="button" className={`tourn-tab tourn-tab-sm${hideUsa ? " active" : ""}`}
          onClick={() => setHideUsa((v) => !v)} title="Esconder jogadores dos EUA (destaca europeus)"
        >🚫🇺🇸 Esconder EUA</button>
        <span className="muted fs-12" style={{ marginLeft: "auto" }}>{filtered.length} jogadores</span>
      </div>

      {sorted.length === 0 ? (
        <EmptyState message="Nenhum jogador corresponde aos filtros." />
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="player-list-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: 34, textAlign: "right" }}>#</th>
                  <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Jogador</SortableHdr>
                  <SortableHdr k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>País</SortableHdr>
                  <SortableHdr k="tournaments" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "right" }} title="Nº de torneios internacionais">Torneios</SortableHdr>
                  <SortableHdr k="years" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "right" }} title="Anos distintos de presença (assiduidade)">Anos</SortableHdr>
                  <SortableHdr k="seriesCount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "right" }} title="Nº de circuitos diferentes">Circuitos</SortableHdr>
                  <th>Séries</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p, i) => {
                  const isM = isManuelByName(p.name);
                  const open = expanded.has(p.name);
                  return (
                    <Fragment key={p.name + i}>
                      <tr
                        className={isM ? "row-manuel" : p.pt ? "row-portuguese" : undefined}
                        style={{ cursor: "pointer" }}
                        onClick={() => toggleRow(p.name)}
                        title="Clique para ver os torneios"
                      >
                        <td style={{ textAlign: "right", color: "var(--text-muted)" }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>
                          <span style={{ marginRight: 4, color: "var(--text-muted)" }}>{open ? "▾" : "▸"}</span>
                          {displayName(p.name)}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {p.country ? <>{gf(p.country)} <span className="fs-12">{p.country}</span></> : <span className="muted">—</span>}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>{p.tournaments}</td>
                        <td style={{ textAlign: "right" }}>{p.years}</td>
                        <td style={{ textAlign: "right" }}>{p.seriesCount}</td>
                        <td>{p.series.map(chip)}</td>
                      </tr>
                      {open && (
                        <tr className="row-expanded">
                          <td />
                          <td colSpan={6} style={{ padding: "4px 8px 10px" }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {p.detail.map((id) => {
                                const { source, year } = splitEntry(id);
                                return (
                                  <Link
                                    key={id} to={`/major/${source}/${year}`}
                                    className="fs-12"
                                    style={{
                                      textDecoration: "none", padding: "1px 8px", borderRadius: 6,
                                      border: `1px solid ${sourceColors[source] ?? "var(--border, #d1d5db)"}`,
                                      color: "var(--text)", whiteSpace: "nowrap",
                                    }}
                                    title={`Abrir ${srcLabel(source)} ${year}`}
                                  >
                                    {srcLabel(source)} <b>{year}</b>
                                  </Link>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {limit < sorted.length && (
            <div style={{ textAlign: "center", margin: "10px 0" }}>
              <button type="button" className="tourn-tab tourn-tab-sm" onClick={() => setLimit((l) => l + PAGE)}>
                Mostrar mais ({sorted.length - limit} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
