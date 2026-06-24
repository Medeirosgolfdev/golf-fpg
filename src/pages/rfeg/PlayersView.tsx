/**
 * PlayersView.tsx — Lista de TODOS os jogadores federados espanhóis (RFEG).
 *
 * Análoga à JogadoresListPage portuguesa (federados.json), MESMAS colunas e
 * ordem na medida do possível. Carrega `public/data/spain-players.json`
 * (~16.000 licenças consolidadas), que já traz o nº de torneios (total + ano
 * corrente, TODAS as plataformas) bakado por build-spain-players-export.js.
 *
 * Colunas (ordem igual à PT): Licencia · Jogador · Clube · DOB · Idade · HCP ·
 * Sexo · Categoría · 📊 Tot · 🗓 Ano · Últ. HCP. As colunas que Portugal tem mas
 * Espanha não consegue preencher (bandeira, 🏑 P&P, Score Differential) ficam
 * ocultas — por isso não aparece nenhuma coluna 100% vazia.
 *
 * Renderizada como item especial ("👥 Jugadores") no menu ⓘ Info da página España.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cachedFetchJson } from "../../data/fetchCache";
import DetailHeader from "../../ui/DetailHeader";
import LoadingState from "../../ui/LoadingState";
import EmptyState from "../../ui/EmptyState";
import SortableHdr from "../../ui/SortableHdr";
import SexBadge from "../../ui/SexBadge";
import { EscPill } from "../../ui/PillBadge";
import { useSort } from "../../hooks/useSort";
import { formatPlayerName } from "../../utils/playerUtils";
import { displayName } from "../../utils/format";
import { isManuelByName } from "../../constants/manuel";

interface SpainPlayer {
  licencia: string;
  name: string;
  dob: string | null;
  dobIso: string | null;
  sex: string | null;
  club: string | null;
  catEdad: string | null;
  hcp: number | null;
  hcpDate: string | null;
  nat: string | null;
  /** Contagem de torneios (todas as plataformas) bakada pelo build-spain-players-export. */
  tot?: number;
  ano?: number;
  firstSeenIso?: string | null;
  lastSeenIso?: string | null;
}
interface SpainPlayersFile {
  generatedAt: string;
  source: string;
  total: number;
  byLicencia: Record<string, SpainPlayer>;
}

/** Uma participação de um jogador num torneio (de spain-player-results.json). */
interface SpainResultRow {
  tid: string;
  src: string | null;        // rota: /rfeg/{src}/{id}
  id: string | null;
  name: string | null;
  ageGroup: string | null;
  year: number | null;
  dateIso: string | null;
  pos: number | null;
  total: number | null;
  toPar: number | null;
}
interface SpainPlayerResultsFile {
  generatedAt: string;
  byLicencia: Record<string, SpainResultRow[]>;   // chave = licença em MAIÚSCULAS
}

/** Normaliza o catEdad cru do ficheiro (usado só como fallback quando não há
 *  DOB para derivar a categoria pelo ano de nascimento). */
function normCat(c: string | null): string | null {
  if (!c) return null;
  const l = c.trim().toLowerCase();
  if (l === "benjamin") return "Benjamín";
  if (l === "alevin") return "Alevín";
  if (l === "j" || l === "juvenil") return "Juvenil";
  if (l === "infantil") return "Infantil";
  if (l === "cadete") return "Cadete";
  return c.trim();
}
/** Categorias juvenis (para o flag `_young` e o filtro "Só Jovens"). */
const YOUNG = new Set(["Benjamín", "Alevín", "Infantil", "Cadete", "Junior", "Juvenil"]);
/** Categoria RFEG ACTUAL a partir do ano de nascimento (millésime), ano de
 *  referência = CUR_YEAR. A RFEG usa idade civil (ano-corrente − ano-nascimento),
 *  não a idade exacta. Tabela igual à vista "Categorías de edad RFEG":
 *  ≤10 Benjamín · 11-12 Alevín · 13-14 Infantil · 15-16 Cadete · 17-18 Junior ·
 *  19-21 Juvenil · 22-25 Sub-25 · >25 adulto (null → cai no catEdad do ficheiro). */
function catFromBirthYear(year: number | null): string | null {
  if (year == null || !Number.isFinite(year)) return null;
  const a = CUR_YEAR - year;
  if (a < 0) return null;
  if (a <= 10) return "Benjamín";
  if (a <= 12) return "Alevín";
  if (a <= 14) return "Infantil";
  if (a <= 16) return "Cadete";
  if (a <= 18) return "Junior";
  if (a <= 21) return "Juvenil";
  if (a <= 25) return "Sub-25";
  return null;
}
function ageFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}
/** ISO "2026-03-29" → "29/03/2026". Outros formatos passam tal-qual. */
function isoToBr(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

type SK = "name" | "licencia" | "cat" | "sex" | "hcp" | "club" | "dob" | "age" | "tot" | "ano" | "hcpDate";

const PAGE_SIZE = 100;
const CUR_YEAR = new Date().getFullYear();

interface Row extends SpainPlayer {
  _name: string;
  _club: string;
  _cat: string | null;
  _young: boolean;
  _year: number | null;
  _age: number | null;
  _tot: number;
  _ano: number;
  _manuel: boolean;
}

export function RFEGPlayersView() {
  const [data, setData] = useState<SpainPlayersFile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sex, setSex] = useState<"" | "M" | "F">("");
  const [cat, setCat] = useState<string>("ALL");
  const [jovens, setJovens] = useState(false);
  const [page, setPage] = useState(1);
  const { sortKey, sortDir, toggleSort } = useSort<SK>("name");

  // Expansão por jogador: ao clicar numa linha mostra os torneios + resultado.
  // O ficheiro de resultados é carregado só na primeira expansão (lazy).
  const [expanded, setExpanded] = useState<string | null>(null);
  const [results, setResults] = useState<SpainPlayerResultsFile | null>(null);
  const resultsReq = useRef(false);
  function ensureResults() {
    if (results || resultsReq.current) return;
    resultsReq.current = true;
    cachedFetchJson<SpainPlayerResultsFile>("/data/spain-player-results.json")
      .then((d) => setResults(d || { generatedAt: "", byLicencia: {} }))
      .catch(() => setResults({ generatedAt: "", byLicencia: {} }));
  }
  function toggleExpand(lic: string) {
    setExpanded((cur) => {
      const next = cur === lic ? null : lic;
      if (next) ensureResults();
      return next;
    });
  }

  useEffect(() => {
    cachedFetchJson<SpainPlayersFile>("/data/spain-players.json")
      .then((d) => {
        if (!d || !d.byLicencia) { setErr("spain-players.json não encontrado. Corre `node scripts/build-spain-players-export.js`."); return; }
        setData(d);
      })
      .catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  const all = useMemo<Row[]>(() => {
    if (!data) return [];
    return Object.values(data.byLicencia)
      // Saltar entradas-placeholder sem nome real (ex: "Jugador" de slots não
      // identificados nos torneios) — poluiriam a lista com contagens absurdas.
      .filter((p) => p.name && p.name.trim().toLowerCase() !== "jugador")
      .map((p) => {
      const _name = formatPlayerName(p.name || "");
      const _year = p.dobIso ? parseInt(p.dobIso.slice(0, 4), 10) : null;
      // Categoria ACTUAL pelo ano de nascimento (millésime). O catEdad do ficheiro
      // ficou congelado quando o jogador foi scrapado e desatualiza com a idade —
      // só o usamos como fallback quando não há DOB.
      const derived = catFromBirthYear(_year);
      const _cat = derived ?? normCat(p.catEdad);
      const _young = _cat ? YOUNG.has(_cat) : false;
      return {
        ...p,
        _name,
        _club: p.club ? displayName(p.club) : "",
        _cat,
        _young,
        _year,
        _age: ageFromIso(p.dobIso),
        _tot: p.tot ?? 0,
        _ano: p.ano ?? 0,
        _manuel: isManuelByName(_name),
      };
    });
  }, [data]);

  // Que colunas têm dados? (igual ao princípio "esconder coluna vazia").
  const has = useMemo(() => ({
    club: all.some((p) => !!p._club),
    dob: all.some((p) => !!p.dob),
    sex: all.some((p) => p.sex === "M" || p.sex === "F"),
    cat: all.some((p) => !!p._cat),
    tot: all.some((p) => p._tot > 0),
    hcpDate: all.some((p) => !!p.hcpDate),
  }), [all]);

  // Nº de colunas visíveis (base: Licencia + Nome + HCP) — para o colSpan da
  // linha de expansão. Mantém-se em sintonia com os <th>/<td> condicionais.
  const colCount = 3
    + (has.club ? 1 : 0)
    + (has.dob ? 2 : 0)
    + (has.sex ? 1 : 0)
    + (has.cat ? 1 : 0)
    + (has.tot ? 2 : 0)
    + (has.hcpDate ? 1 : 0);

  const catOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of all) if (p._young && p._cat) s.add(p._cat);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es"));
  }, [all]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((p) => {
      if (jovens && !p._young) return false;
      if (sex && p.sex !== sex) return false;
      if (cat !== "ALL" && p._cat !== cat) return false;
      if (needle) {
        const hay = `${p._name} ${p.licencia} ${p._club}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [all, q, sex, cat, jovens]);

  const sorted = useMemo(() => {
    const INF = Number.MAX_SAFE_INTEGER;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "name":     v = a._name.localeCompare(b._name, "es"); break;
        case "licencia": v = a.licencia.localeCompare(b.licencia); break;
        case "cat":      v = (a._cat || "~").localeCompare(b._cat || "~", "es"); break;
        case "sex":      v = (a.sex || "~").localeCompare(b.sex || "~"); break;
        case "hcp":      v = (a.hcp ?? INF) - (b.hcp ?? INF); break;
        case "club":     v = (a._club || "~").localeCompare(b._club || "~", "es"); break;
        case "dob":      v = (a._year ?? INF) - (b._year ?? INF); break;
        case "age":      v = (a._age ?? INF) - (b._age ?? INF); break;
        case "tot":      v = a._tot - b._tot; break;
        case "ano":      v = a._ano - b._ano; break;
        case "hcpDate":  v = (a.hcpDate || "").localeCompare(b.hcpDate || ""); break;
      }
      return mult * v;
    });
  }, [filtered, sortKey, sortDir]);

  // Reset de página quando filtros/ordenação mudam
  const filterSig = `${q}|${sex}|${cat}|${jovens}|${sortKey}|${sortDir}`;
  const [lastSig, setLastSig] = useState(filterSig);
  if (filterSig !== lastSig) { setLastSig(filterSig); if (page !== 1) setPage(1); }

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (err) return <EmptyState message={`Erro: ${err}`} />;
  if (!data) return <LoadingState message="A carregar jogadores espanhóis..." />;

  const muted = <span className="muted">—</span>;

  return (
    <div className="p-12-16">
      <DetailHeader
        title="👥 Jugadores de España"
        sub={
          <span className="muted">
            {data.total.toLocaleString("pt")} licenças federadas (RFEG + autonómicas) —
            consolidadas de inscrições e resultados scrapados
          </span>
        }
      />

      {/* ── Filtros ─────────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "12px 0" }}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Nome, licença ou clube…"
          className="filter-input"
          style={{ minWidth: 240, flex: "1 1 240px", maxWidth: 360 }}
        />
        <select value={sex} onChange={(e) => setSex(e.target.value as "" | "M" | "F")} className="filter-input" style={{ width: 130 }}>
          <option value="">Todos os sexos</option>
          <option value="M">Masculino</option>
          <option value="F">Feminino</option>
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="filter-input" style={{ width: 150 }}>
          <option value="ALL">Todas as categorias</option>
          {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          onClick={() => setJovens((j) => !j)}
          className={"btn-pill" + (jovens ? " active" : "")}
          style={jovens ? { background: "var(--accent)", color: "#fff" } : undefined}
          title="Só escalões juvenis (Benjamín, Alevín, Infantil, Cadete, Juvenil)"
        >
          🧒 Só Jovens
        </button>
        <span className="muted fs-12" style={{ marginLeft: "auto" }}>
          {filtered.length.toLocaleString("pt")} de {all.length.toLocaleString("pt")}
        </span>
      </div>

      {/* ── Tabela ──────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <EmptyState size="md" message="Nenhum jogador corresponde aos filtros." />
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="player-list-table" style={{ width: "100%", fontSize: "var(--fs-12)" }}>
              <thead>
                <tr>
                  <SortableHdr k="licencia" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Licencia</SortableHdr>
                  <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Nome</SortableHdr>
                  {has.club && <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Clube</SortableHdr>}
                  {has.dob && <SortableHdr k="dob" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">DOB</SortableHdr>}
                  {has.dob && <SortableHdr k="age" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">Idade</SortableHdr>}
                  <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">HCP</SortableHdr>
                  {has.sex && <SortableHdr k="sex" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Sexo</SortableHdr>}
                  {has.cat && <SortableHdr k="cat" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Categoría</SortableHdr>}
                  {has.tot && <SortableHdr k="tot" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Total de torneios em que apareceu (RFEGolf + FCG)">📊 Tot</SortableHdr>}
                  {has.tot && <SortableHdr k="ano" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title={`Torneios em ${CUR_YEAR}`}>🗓 {CUR_YEAR}</SortableHdr>}
                  {has.hcpDate && <SortableHdr k="hcpDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Última actualização de HCP">Últ. HCP</SortableHdr>}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const isOpen = expanded === r.licencia;
                  return (
                  <React.Fragment key={r.licencia}>
                  <tr
                    className={"player-list-row" + (r._manuel ? " row-manuel" : "") + (isOpen ? " row-selected" : "")}
                    onClick={() => toggleExpand(r.licencia)}
                    style={{ cursor: "pointer" }}
                    title="Clicar para ver os torneios deste jogador"
                  >
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-11)", color: "var(--text-muted)" }}>
                      <span style={{ display: "inline-block", width: 12 }}>{isOpen ? "▾" : "▸"}</span>{r.licencia}
                    </td>
                    <td style={{ fontWeight: 600 }}>{r._name || "—"}</td>
                    {has.club && <td title={r._club}>{r._club || muted}</td>}
                    {has.dob && <td style={{ whiteSpace: "nowrap" }}>{r.dob || muted}</td>}
                    {has.dob && <td style={{ textAlign: "right" }}>{r._age != null ? r._age : muted}</td>}
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{r.hcp != null ? r.hcp.toFixed(1) : muted}</td>
                    {has.sex && <td>{r.sex === "M" || r.sex === "F" ? <SexBadge sex={r.sex} /> : muted}</td>}
                    {has.cat && <td>{r._cat ? (r._young ? <EscPill esc={r._cat} /> : <span className="muted fs-11">{r._cat}</span>) : muted}</td>}
                    {has.tot && <td style={{ textAlign: "right", color: r._tot ? undefined : "var(--text-muted)" }}>{r._tot || "—"}</td>}
                    {has.tot && <td style={{ textAlign: "right", color: r._ano ? "var(--color-good-dark, #166534)" : "var(--text-muted)", fontWeight: r._ano ? 600 : undefined }}>{r._ano || "—"}</td>}
                    {has.hcpDate && <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{r.hcpDate ? isoToBr(r.hcpDate) : muted}</td>}
                  </tr>
                  {isOpen && (
                    <tr className="player-list-expand-row">
                      <td colSpan={colCount} style={{ padding: 0, background: "var(--bg-subtle, rgba(0,0,0,0.025))" }}>
                        <PlayerTournaments row={r} results={results} />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "12px 0", fontSize: "var(--fs-12)" }}>
              <button onClick={() => setPage(1)} disabled={page === 1} className="btn-pill">«</button>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-pill">‹</button>
              <span style={{ minWidth: 90, textAlign: "center" }}>Página <b>{page}</b> de {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-pill">›</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="btn-pill">»</button>
            </div>
          )}
        </>
      )}

      <div className="muted fs-11" style={{ marginTop: 16, textAlign: "center" }}>
        Fonte: <code>spain-players.json</code> + contagem de torneios de <code>rfegolf-rivals</code>/<code>fcg-rivals</code>.
        DOB · sexo · clube só existem para jogadores vistos nos torneios juvenis scrapados.
      </div>
    </div>
  );
}

/* ── Expansão: torneios + resultado de um jogador ─────────────────────────
 * Lê spain-player-results.json (gerado por build-spain-player-results.js), que
 * inverte os rivals (LGS + NextCaddy + FCG) por licença. Cada linha tem a
 * posição/score do jogador nesse torneio e link para a página do torneio. */
function fmtTpES(v: number | null): string {
  if (v == null) return "—";
  if (v === 0) return "E";
  return v > 0 ? `+${v}` : `${v}`;
}

type TSK = "date" | "name" | "age" | "pos" | "total" | "tp";

function PlayerTournaments({ row, results }: { row: Row; results: SpainPlayerResultsFile | null }) {
  const { sortKey, sortDir, toggleSort } = useSort<TSK>("date", "desc");
  const list = useMemo<SpainResultRow[]>(() => {
    const l = results ? (results.byLicencia[row.licencia.trim().toUpperCase()] || []) : [];
    const INF = Number.MAX_SAFE_INTEGER;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...l].sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "date":  v = (a.dateIso || "").localeCompare(b.dateIso || ""); break;
        case "name":  v = (a.name || "").localeCompare(b.name || "", "es"); break;
        case "age":   v = (a.ageGroup || "~").localeCompare(b.ageGroup || "~", "es"); break;
        case "pos":   v = (a.pos ?? INF) - (b.pos ?? INF); break;
        case "total": v = (a.total ?? INF) - (b.total ?? INF); break;
        case "tp":    v = (a.toPar ?? INF) - (b.toPar ?? INF); break;
      }
      return mult * v;
    });
  }, [results, row.licencia, sortKey, sortDir]);

  if (!results) {
    return <div className="muted fs-12" style={{ padding: "8px 14px" }}>A carregar torneios…</div>;
  }
  if (list.length === 0) {
    return (
      <div className="muted fs-12" style={{ padding: "8px 14px" }}>
        Sem resultado detalhado para este jogador. Só há resultado por torneio nas
        provas juvenis de LiveGolfScoring, NextCaddy e FCG — as provas RFEGolf só em
        PDF (e os torneios LGS sem licença publicada) não entram aqui.
      </div>
    );
  }
  return (
    <div style={{ padding: "8px 14px 12px" }}>
      <div className="muted fs-11" style={{ marginBottom: 6 }}>
        {list.length} torneio{list.length === 1 ? "" : "s"} com resultado
        {row._tot ? ` (de ${row._tot} no total)` : ""}
      </div>
      <table className="player-list-table" style={{ width: "auto", fontSize: "var(--fs-12)" }}>
        <thead>
          <tr>
            <SortableHdr k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Data</SortableHdr>
            <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Torneio</SortableHdr>
            <SortableHdr k="age" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Escalão</SortableHdr>
            <SortableHdr k="pos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">Pos</SortableHdr>
            <SortableHdr k="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">Total</SortableHdr>
            <SortableHdr k="tp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">±Par</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {list.map((t, i) => (
            <tr key={`${t.tid}-${i}`} className="player-list-row">
              <td style={{ whiteSpace: "nowrap" }}>{t.dateIso ? isoToBr(t.dateIso) : (t.year ?? "—")}</td>
              <td>
                {t.src && t.id
                  ? <Link to={`/rfeg/${t.src}/${t.id}`} onClick={(e) => e.stopPropagation()}>{t.name || t.tid}</Link>
                  : (t.name || t.tid)}
              </td>
              <td>{t.ageGroup ? <EscPill esc={t.ageGroup} /> : <span className="muted">—</span>}</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>{t.pos ?? "—"}</td>
              <td style={{ textAlign: "right" }}>{t.total ?? "—"}</td>
              <td style={{ textAlign: "right" }}>{fmtTpES(t.toPar)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
