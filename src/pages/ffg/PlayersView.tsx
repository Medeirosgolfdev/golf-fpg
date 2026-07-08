/**
 * PlayersView.tsx — Lista de TODOS os jogadores vistos nos torneios FFGolf.
 *
 * Análoga à RFEGPlayersView espanhola (/rfeg/info/jugadores), MESMAS colunas e
 * ordem na medida do possível. Carrega `public/data/france-players.json`
 * (~13.000 licenças), que já traz o nº de torneios (total + ano corrente),
 * HCP mais recente e série mais recente bakados por build-france-players.js.
 *
 * Colunas (ordem igual à ES): Licence · Jogador · Clube · Région · HCP · Sexo ·
 * Catégorie · 📊 Tot · 🗓 Ano · Últ. HCP. A FFG NÃO expõe DOB — as colunas
 * DOB/Idade da vista espanhola não existem aqui; a categoria vem da SÉRIE mais
 * recente em que o jogador competiu (não da idade actual).
 *
 * Renderizada como item especial ("👥 Joueurs") no menu ⓘ Info da página /ffg.
 */
import { useEffect, useMemo, useState } from "react";
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
import { normName } from "../../utils/normName";
import { isManuelByName } from "../../constants/manuel";
import { kidsUrl } from "../../ui/KidsLink";
import { ffgEscalaoCanonico } from "../FFGPage";

interface FrancePlayer {
  license: string;
  name: string;
  sex?: "M" | "F" | string;
  country?: string;
  glfLic?: string;
  club?: string;
  region?: string;
  /** Label da série mais recente em que competiu (ex: "U12G", "BENJAMINES"). */
  lastSerie?: string;
  hcp?: number;
  hcpDate?: string;
  /** Contagem de torneios (portal FFGolf resultats) bakada pelo builder. */
  tot?: number;
  ano?: number;
  firstSeenIso?: string | null;
  lastSeenIso?: string | null;
}
interface FrancePlayersFile {
  generatedAt: string;
  source: string;
  totalPlayers: number;
  byName: Record<string, FrancePlayer>;
  byLicense: Record<string, FrancePlayer>;
}

/** Subconjunto do roster canónico kids2 (`juniors.json`) para a seta ↗ —
 *  ligamos por LICENÇA FFG (chave forte do agregador) e, em fallback, por
 *  nome normalizado (juniores vistos noutros circuitos). Mesmo princípio do
 *  useKidsLinkMap, mas com o lookup exacto por licença que esta lista permite. */
interface RosterJunior {
  id: string;
  canonicalName: string;
  aliases?: string[];
  sources?: { ffgolf?: { lic?: string } };
}

/** ISO "2026-03-29" → "29/03/2026". Outros formatos passam tal-qual. */
function isoToBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** "Sub-14 (Benjamin)" → { sub: "Sub-14", fr: "Benjamin" }. */
function splitCat(cat: string): { sub: string; fr: string | null } {
  const m = /^(.+?)\s*\((.+)\)$/.exec(cat);
  return m ? { sub: m[1], fr: m[2] } : { sub: cat, fr: null };
}

type SK = "name" | "license" | "cat" | "sex" | "hcp" | "club" | "region" | "tot" | "ano" | "hcpDate";

const PAGE_SIZE = 100;
const CUR_YEAR = new Date().getFullYear();
const MUTED = <span className="muted">—</span>;

interface Row extends FrancePlayer {
  _name: string;
  _club: string;
  _region: string;
  /** Bucket canónico da série mais recente ("Sub-12 (Poussin)", "Adultos", …). */
  _cat: string | null;
  _young: boolean;
  _tot: number;
  _ano: number;
  _manuel: boolean;
  /** juniorId canónico kids2 (via licença FFG ou nome) — alimenta a seta ↗. */
  _kid: string | null;
}

export function FFGPlayersView() {
  const [data, setData] = useState<FrancePlayersFile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sex, setSex] = useState<"" | "M" | "F">("");
  const [cat, setCat] = useState<string>("ALL");
  const [region, setRegion] = useState<string>("ALL");
  const [jovens, setJovens] = useState(false);
  const [page, setPage] = useState(1);
  const [roster, setRoster] = useState<RosterJunior[]>([]);
  const { sortKey, sortDir, toggleSort } = useSort<SK>("name");

  useEffect(() => {
    cachedFetchJson<FrancePlayersFile>("/data/france-players.json")
      .then((d) => {
        if (!d || !d.byLicense) { setErr("france-players.json não encontrado. Corre `node scripts/build-france-players.js`."); return; }
        setData(d);
      })
      .catch((e) => setErr(String(e?.message ?? e)));
    // Roster kids2 em background (fetch partilhado com useKidsLinkMap via cache)
    // — as setas ↗ aparecem quando chegar, sem bloquear a tabela.
    cachedFetchJson<{ juniors?: RosterJunior[] }>("/data/juniors.json")
      .then((d) => setRoster(d?.juniors ?? []))
      .catch(() => {});
  }, []);

  // lic FFG → juniorId (exacto) e normName → juniorId (fallback, 1º vence).
  const kidsByLic = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of roster) {
      const lic = j.sources?.ffgolf?.lic;
      if (lic && !m.has(lic)) m.set(lic, j.id);
    }
    return m;
  }, [roster]);
  const kidsByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of roster) {
      const nk = normName(j.canonicalName);
      if (!m.has(nk)) m.set(nk, j.id);
      for (const alias of j.aliases || []) {
        const ak = normName(alias);
        if (!m.has(ak)) m.set(ak, j.id);
      }
    }
    return m;
  }, [roster]);

  const all = useMemo<Row[]>(() => {
    if (!data) return [];
    return Object.values(data.byLicense).map((p) => {
      const _name = formatPlayerName(p.name || "");
      const _cat = ffgEscalaoCanonico(p.lastSerie);
      return {
        ...p,
        _name,
        _club: p.club?.trim() ? displayName(p.club.trim()) : "",
        _region: p.region?.trim() ? displayName(p.region.trim()) : "",
        _cat,
        _young: !!_cat && _cat !== "Adultos",
        _tot: p.tot ?? 0,
        _ano: p.ano ?? 0,
        _manuel: isManuelByName(_name),
        _kid: kidsByLic.get(p.license) ?? kidsByName.get(normName(_name)) ?? null,
      };
    });
  }, [data, kidsByLic, kidsByName]);

  // Que colunas têm dados? (princípio "esconder coluna vazia").
  const has = useMemo(() => ({
    club: all.some((p) => !!p._club),
    region: all.some((p) => !!p._region),
    sex: all.some((p) => p.sex === "M" || p.sex === "F"),
    cat: all.some((p) => !!p._cat),
    tot: all.some((p) => p._tot > 0),
    hcpDate: all.some((p) => !!p.hcpDate),
  }), [all]);

  const catOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of all) if (p._cat) s.add(p._cat);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "fr"));
  }, [all]);

  const regionOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of all) if (p._region) s.add(p._region);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "fr"));
  }, [all]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((p) => {
      if (jovens && !p._young) return false;
      if (sex && p.sex !== sex) return false;
      if (cat !== "ALL" && p._cat !== cat) return false;
      if (region !== "ALL" && p._region !== region) return false;
      if (needle) {
        const hay = `${p._name} ${p.license} ${p._club}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [all, q, sex, cat, region, jovens]);

  const sorted = useMemo(() => {
    const INF = Number.MAX_SAFE_INTEGER;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "name":    v = a._name.localeCompare(b._name, "fr"); break;
        case "license": v = a.license.localeCompare(b.license); break;
        case "cat":     v = (a._cat || "~").localeCompare(b._cat || "~", "fr"); break;
        case "sex":     v = (a.sex || "~").localeCompare(b.sex || "~"); break;
        case "hcp":     v = (a.hcp ?? INF) - (b.hcp ?? INF); break;
        case "club":    v = (a._club || "~").localeCompare(b._club || "~", "fr"); break;
        case "region":  v = (a._region || "~").localeCompare(b._region || "~", "fr"); break;
        case "tot":     v = a._tot - b._tot; break;
        case "ano":     v = a._ano - b._ano; break;
        case "hcpDate": v = (a.hcpDate || "").localeCompare(b.hcpDate || ""); break;
      }
      return mult * v;
    });
  }, [filtered, sortKey, sortDir]);

  // Reset de página quando filtros/ordenação mudam
  const filterSig = `${q}|${sex}|${cat}|${region}|${jovens}|${sortKey}|${sortDir}`;
  const [lastSig, setLastSig] = useState(filterSig);
  if (filterSig !== lastSig) { setLastSig(filterSig); if (page !== 1) setPage(1); }

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const kidsCount = useMemo(() => all.reduce((n, p) => n + (p._kid ? 1 : 0), 0), [all]);

  if (err) return <EmptyState message={`Erro: ${err}`} />;
  if (!data) return <LoadingState message="A carregar jogadores franceses..." />;

  return (
    <div className="p-12-16">
      <DetailHeader
        title="👥 Joueurs de France"
        sub={
          <span className="muted">
            {all.length.toLocaleString("pt")} jogadores vistos nos torneios do portal FFGolf (por licença)
            {kidsCount > 0 && <> — <b>{kidsCount.toLocaleString("pt")}</b> com ficha kids2 (↗)</>}
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
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="filter-input" style={{ width: 170 }}>
          <option value="ALL">Todas as categorias</option>
          {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={region} onChange={(e) => setRegion(e.target.value)} className="filter-input" style={{ width: 190 }}>
          <option value="ALL">Todas as ligues</option>
          {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button
          onClick={() => setJovens((j) => !j)}
          className={"btn-pill" + (jovens ? " active" : "")}
          style={jovens ? { background: "var(--accent)", color: "#fff" } : undefined}
          title="Só séries juvenis (Poucet, Poussin, Benjamin, Minime, Cadet, Junior / U8-U21)"
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
                  <SortableHdr k="license" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Licence</SortableHdr>
                  <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Nome</SortableHdr>
                  {has.club && <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Clube</SortableHdr>}
                  {has.region && <SortableHdr k="region" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Ligue</SortableHdr>}
                  <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">HCP</SortableHdr>
                  {has.sex && <SortableHdr k="sex" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Sexo</SortableHdr>}
                  {has.cat && <SortableHdr k="cat" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight" title="Categoria da série mais recente em que competiu (a FFG não expõe data de nascimento)">Catégorie</SortableHdr>}
                  {has.tot && <SortableHdr k="tot" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Total de torneios FFGolf em que apareceu">📊 Tot</SortableHdr>}
                  {has.tot && <SortableHdr k="ano" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title={`Torneios em ${CUR_YEAR}`}>🗓 {CUR_YEAR}</SortableHdr>}
                  {has.hcpDate && <SortableHdr k="hcpDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Data do torneio com o HCP mais recente">Últ. HCP</SortableHdr>}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const catParts = r._cat ? splitCat(r._cat) : null;
                  return (
                    <tr key={r.license} className={"player-list-row" + (r._manuel ? " row-manuel" : "")}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-11)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{r.license}</td>
                      <td style={{ fontWeight: 600 }} title={r.lastSerie ? `Série mais recente: ${r.lastSerie}` : undefined}>
                        {r._name || "—"}
                        {r.country && r.country !== "FRA" && (
                          <span className="muted fs-10" style={{ marginLeft: 6, fontWeight: 400 }}>{r.country}</span>
                        )}
                        {r._kid && (
                          <a
                            href={kidsUrl({ id: r._kid })}
                            onClick={(e) => { e.preventDefault(); window.open(kidsUrl({ id: r._kid }), "_blank"); }}
                            title="Ver ficha em Kids"
                            style={{ fontWeight: 800, color: "var(--color-good-dark)", fontSize: "var(--fs-13)", cursor: "pointer", textDecoration: "none", marginLeft: 4 }}
                          >
                            ↗
                          </a>
                        )}
                      </td>
                      {has.club && <td title={r._club}>{r._club || MUTED}</td>}
                      {has.region && <td className="fs-11" title={r._region}>{r._region || MUTED}</td>}
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{r.hcp != null ? r.hcp.toFixed(1) : MUTED}</td>
                      {has.sex && <td>{r.sex === "M" || r.sex === "F" ? <SexBadge sex={r.sex} /> : MUTED}</td>}
                      {has.cat && (
                        <td title={r.lastSerie ? `Série: ${r.lastSerie}` : undefined}>
                          {catParts ? (
                            r._young ? (
                              <>
                                <EscPill esc={catParts.sub} />
                                {catParts.fr && <span className="muted fs-10" style={{ marginLeft: 4 }}>{catParts.fr}</span>}
                              </>
                            ) : (
                              <span className="muted fs-11">{r._cat}</span>
                            )
                          ) : MUTED}
                        </td>
                      )}
                      {has.tot && <td style={{ textAlign: "right", color: r._tot ? undefined : "var(--text-muted)" }}>{r._tot || "—"}</td>}
                      {has.tot && <td style={{ textAlign: "right", color: r._ano ? "var(--color-good-dark, #166534)" : "var(--text-muted)", fontWeight: r._ano ? 600 : undefined }}>{r._ano || "—"}</td>}
                      {has.hcpDate && <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{r.hcpDate ? isoToBr(r.hcpDate) : MUTED}</td>}
                    </tr>
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
        Fonte: <code>france-players.json</code> (portal resultats FFGolf — GP Jeunes + Compétitions Fédérales juvenis).
        Os torneios GolfGenius (Champ. de France, Internationaux) também contam — ligados por nome ao roster de licenças,
        com dedup dos que o portal já publica. A FFG não expõe DOB; a categoria é a da última série jogada.
      </div>
    </div>
  );
}
