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
import { Fragment, useEffect, useMemo, useState } from "react";
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
  // ── Dedup de licenças (mudança de clube/região) — ver build-spain-players-export.js.
  /** Chave estável do jogador físico (federação + nº de jogador). */
  dupKey?: string;
  /** Licença primária deste jogador — presente nas ENTRADAS ANTIGAS (escondidas). */
  aliasOf?: string;
  /** Contagem de torneios somada por TODAS as licenças do jogador (na entrada primária). */
  totAll?: number;
  anoAll?: number;
  /** HCP/data "vivos" quando a licença mais recente em torneio não é a do HCP mais recente. */
  curHcp?: number | null;
  curHcpDate?: string | null;
  /** Licenças antigas (clubes anteriores), mais recente primeiro (na entrada primária). */
  aliases?: SpainLicAlias[];
}
interface SpainLicAlias {
  licencia: string;
  club: string | null;
  hcp: number | null;
  hcpDate: string | null;
  firstSeenIso: string | null;
  lastSeenIso: string | null;
  tot: number;
  ano: number;
}
interface SpainPlayersFile {
  generatedAt: string;
  source: string;
  total: number;
  byLicencia: Record<string, SpainPlayer>;
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
/** Período em que a licença foi vista em competição — "06/07/2021 → 28/06/2022"
 *  (ou uma só data se apareceu só uma vez) a partir de firstSeen/lastSeen ISO.
 *  É o melhor proxy de "de quando a quando a licença existiu" — a RFEG não expõe
 *  a data oficial de emissão, só as inscrições onde o jogador apareceu. */
function activePeriod(first: string | null, last: string | null): string {
  const a = isoToBr(first);
  const b = isoToBr(last);
  if (a === "—" && b === "—") return "—";
  if (a === "—" || b === "—") return a === "—" ? b : a;
  return a === b ? a : `${a} → ${b}`;
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
  _hcp: number | null;
  _hcpDate: string | null;
  /** Texto de licenças/clubes antigos — para a procura encontrar por licença antiga. */
  _alt: string;
  _manuel: boolean;
}

/** Dados de uma licença para render como linha de tabela (igual às colunas da
 *  lista principal). Usado tanto na linha do jogador como nas sub-linhas do
 *  histórico (vista "como se não houvesse dedup"). */
interface CellView {
  name: string;
  club: string;
  dob: string | null;
  age: number | null;
  hcp: number | null;
  sex: string | null;
  cat: string | null;
  young: boolean;
  tot: number;
  ano: number;
  hcpDate: string | null;
}
const MUTED = <span className="muted">—</span>;
/** As células de dados (tudo DEPOIS da coluna Licencia), nas mesmas colunas e
 *  estilos da tabela principal, respeitando as colunas escondidas (`has`). */
function dataCells(v: CellView, has: { club: boolean; dob: boolean; sex: boolean; cat: boolean; tot: boolean; hcpDate: boolean }) {
  return (
    <>
      <td style={{ fontWeight: 600 }}>{v.name || "—"}</td>
      {has.club && <td title={v.club}>{v.club || MUTED}</td>}
      {has.dob && <td style={{ whiteSpace: "nowrap" }}>{v.dob || MUTED}</td>}
      {has.dob && <td style={{ textAlign: "right" }}>{v.age != null ? v.age : MUTED}</td>}
      <td style={{ textAlign: "right", fontWeight: 600 }}>{v.hcp != null ? v.hcp.toFixed(1) : MUTED}</td>
      {has.sex && <td>{v.sex === "M" || v.sex === "F" ? <SexBadge sex={v.sex} /> : MUTED}</td>}
      {has.cat && <td>{v.cat ? (v.young ? <EscPill esc={v.cat} /> : <span className="muted fs-11">{v.cat}</span>) : MUTED}</td>}
      {has.tot && <td style={{ textAlign: "right", color: v.tot ? undefined : "var(--text-muted)" }}>{v.tot || "—"}</td>}
      {has.tot && <td style={{ textAlign: "right", color: v.ano ? "var(--color-good-dark, #166534)" : "var(--text-muted)", fontWeight: v.ano ? 600 : undefined }}>{v.ano || "—"}</td>}
      {has.hcpDate && <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{v.hcpDate ? isoToBr(v.hcpDate) : MUTED}</td>}
    </>
  );
}

export function RFEGPlayersView() {
  const [data, setData] = useState<SpainPlayersFile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sex, setSex] = useState<"" | "M" | "F">("");
  const [cat, setCat] = useState<string>("ALL");
  const [jovens, setJovens] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { sortKey, sortDir, toggleSort } = useSort<SK>("name");
  const toggleExp = (lic: string) =>
    setExpanded((s) => { const n = new Set(s); n.has(lic) ? n.delete(lic) : n.add(lic); return n; });

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
      // Esconder as licenças ANTIGAS de quem mudou de clube: ficam dobradas na
      // entrada primária (campo `aliases`). Uma linha por jogador físico.
      .filter((p) => !p.aliasOf)
      .map((p) => {
      const _name = formatPlayerName(p.name || "");
      const _year = p.dobIso ? parseInt(p.dobIso.slice(0, 4), 10) : null;
      // Categoria ACTUAL pelo ano de nascimento (millésime). O catEdad do ficheiro
      // ficou congelado quando o jogador foi scrapado e desatualiza com a idade —
      // só o usamos como fallback quando não há DOB.
      const derived = catFromBirthYear(_year);
      const _cat = derived ?? normCat(p.catEdad);
      const _young = _cat ? YOUNG.has(_cat) : false;
      // Licenças/clubes antigos → texto pesquisável (encontrar por licença antiga).
      const _alt = (p.aliases || [])
        .map((a) => `${a.licencia} ${a.club ? displayName(a.club) : ""}`)
        .join(" ");
      return {
        ...p,
        _name,
        _club: p.club ? displayName(p.club) : "",
        _cat,
        _young,
        _year,
        _age: ageFromIso(p.dobIso),
        // Contagens e HCP agregados por todas as licenças do jogador (fallback à própria).
        _tot: p.totAll ?? p.tot ?? 0,
        _ano: p.anoAll ?? p.ano ?? 0,
        _hcp: p.curHcp ?? p.hcp,
        _hcpDate: p.curHcpDate ?? p.hcpDate ?? null,
        _alt,
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
    hcpDate: all.some((p) => !!p._hcpDate),
  }), [all]);

  // Quantos jogadores têm mais do que uma licença (mudaram de clube/região).
  const dupCount = useMemo(() => all.reduce((n, p) => n + (p.aliases && p.aliases.length ? 1 : 0), 0), [all]);

  // Nº de colunas visíveis (para o colSpan da linha de histórico expandida).
  const colCount = 2 + (has.club ? 1 : 0) + (has.dob ? 2 : 0) + 1 + (has.sex ? 1 : 0) + (has.cat ? 1 : 0) + (has.tot ? 2 : 0) + (has.hcpDate ? 1 : 0);

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
        const hay = `${p._name} ${p.licencia} ${p._club} ${p._alt}`.toLowerCase();
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
        case "hcp":      v = (a._hcp ?? INF) - (b._hcp ?? INF); break;
        case "club":     v = (a._club || "~").localeCompare(b._club || "~", "es"); break;
        case "dob":      v = (a._year ?? INF) - (b._year ?? INF); break;
        case "age":      v = (a._age ?? INF) - (b._age ?? INF); break;
        case "tot":      v = a._tot - b._tot; break;
        case "ano":      v = a._ano - b._ano; break;
        case "hcpDate":  v = (a._hcpDate || "").localeCompare(b._hcpDate || ""); break;
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

  return (
    <div className="p-12-16">
      <DetailHeader
        title="👥 Jugadores de España"
        sub={
          <span className="muted">
            {all.length.toLocaleString("pt")} jogadores (de {data.total.toLocaleString("pt")} licenças RFEG + autonómicas)
            {dupCount > 0 && <> — <b>{dupCount.toLocaleString("pt")}</b> mudaram de clube (🔄 várias licenças)</>}
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
                  const nLic = r.aliases ? r.aliases.length + 1 : 1;
                  const isOpen = expanded.has(r.licencia);
                  // Linha principal: vista AGREGADA (deduped) — HCP/torneios actuais.
                  const mainView: CellView = {
                    name: r._name, club: r._club, dob: r.dob ?? null, age: r._age,
                    hcp: r._hcp, sex: r.sex, cat: r._cat, young: r._young,
                    tot: r._tot, ano: r._ano, hcpDate: r._hcpDate,
                  };
                  // Campos ao nível do jogador (iguais em todas as licenças) p/ as sub-linhas.
                  const shared = { name: r._name, dob: r.dob ?? null, age: r._age, sex: r.sex, cat: r._cat, young: r._young };
                  // As licenças "como apareceriam sem dedup": actual + anteriores (cada
                  // uma com os SEUS próprios valores por-licença, não os agregados).
                  const subLics = [
                    { lic: r.licencia, cur: true, club: r._club, hcp: r.hcp ?? null, tot: r.tot ?? 0, ano: r.ano ?? 0, hcpDate: r.hcpDate ?? null, first: r.firstSeenIso ?? null, last: r.lastSeenIso ?? null },
                    ...(r.aliases || []).map((a) => ({ lic: a.licencia, cur: false, club: a.club ? displayName(a.club) : "", hcp: a.hcp, tot: a.tot, ano: a.ano, hcpDate: a.hcpDate, first: a.firstSeenIso, last: a.lastSeenIso })),
                  ];
                  return (
                  <Fragment key={r.licencia}>
                  <tr className={"player-list-row" + (r._manuel ? " row-manuel" : "") + (isOpen ? " is-open" : "")}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-11)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {r.licencia}
                      {nLic > 1 && (
                        <button
                          type="button"
                          onClick={() => toggleExp(r.licencia)}
                          title={`Mudou de clube — ${nLic} licenças. Clica para ver o histórico.`}
                          style={{
                            marginLeft: 6, cursor: "pointer", border: "1px solid var(--accent)",
                            background: isOpen ? "var(--accent)" : "transparent", color: isOpen ? "#fff" : "var(--accent)",
                            borderRadius: 999, padding: "0 6px", fontSize: "var(--fs-10)",
                            fontWeight: 700, lineHeight: 1.6, fontFamily: "var(--font-sans)",
                          }}
                        >
                          🔄 {nLic}
                        </button>
                      )}
                    </td>
                    {dataCells(mainView, has)}
                  </tr>
                  {isOpen && r.aliases && (
                    <>
                      <tr className="player-list-row-detail">
                        <td colSpan={colCount} style={{ background: "var(--bg-detail)", padding: "6px 12px 3px" }}>
                          <span className="muted fs-11" style={{ fontWeight: 600 }}>Histórico de licenças — mudança de clube / região</span>
                          <span className="muted fs-10" style={{ fontStyle: "italic", marginLeft: 8 }}>
                            as linhas abaixo são as que existiriam na tabela sem o agrupamento · período = 1ª → última inscrição (a RFEG não publica a data de emissão)
                          </span>
                        </td>
                      </tr>
                      {subLics.map((s) => (
                        <tr key={s.lic} className="player-list-row" style={{ background: "var(--bg-detail)" }}>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-11)", color: "var(--text-muted)", whiteSpace: "nowrap", paddingLeft: 16 }}>
                            <span aria-hidden style={{ marginRight: 5 }}>{s.cur ? "🟢" : "⚪"}</span>{s.lic}
                            {s.cur && <span style={{ marginLeft: 6, color: "var(--accent)", fontWeight: 700, fontSize: "var(--fs-10)" }}>ACTUAL</span>}
                            <div className="muted" style={{ fontSize: "var(--fs-10)", marginTop: 1, paddingLeft: 18 }} title="Período em que esta licença apareceu em competição (1ª → última inscrição)">
                              {activePeriod(s.first, s.last)}
                            </div>
                          </td>
                          {dataCells({ ...shared, club: s.club, hcp: s.hcp, tot: s.tot, ano: s.ano, hcpDate: s.hcpDate }, has)}
                        </tr>
                      ))}
                    </>
                  )}
                  </Fragment>
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

