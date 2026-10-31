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
 * DOB/Idade da vista espanhola não existem aqui; a categoria (`cat`) é o
 * escalão mais novo da última época em que houve sinal de idade, calculada por
 * build-france-players.js a partir da série E do nome da prova.
 *
 * Renderizada como item especial ("👥 Joueurs") no menu ⓘ Info da página /ffg.
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
import { normName } from "../../utils/normName";
import { isManuelByName } from "../../constants/manuel";
import { kidsUrl } from "../../ui/KidsLink";
import { useJuniorsLinks } from "../../hooks/useKidsLinkMap";
import { ffgEscalaoCanonico } from "../../utils/ffgEscalao";
import { PlayerTournaments, type FfgPlayerTournamentsFile } from "./PlayerTournaments";

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
  /** Escalão canónico bakado pelo builder (série + nome da prova, época mais
   *  recente com sinal de idade). Fallback à série para ficheiros antigos. */
  cat?: string;
  catYear?: number;
  /** Ano de nascimento EXACTO, do Mérite Jeunes da FFG (`catSrc: "merite"` → o `cat` sai dele). */
  birthYear?: number;
  catSrc?: "merite";
  /** Lugar e médias no Mérite Jeunes (mês `month`, AAAAMM). */
  merite?: { rank: number | null; rankAnn: number | null; moy: number | null; moy6: number | null; nbt: number; idx: number | null; cat: string | null; month: string };
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

/** ISO "2026-03-29" → "29/03/2026". Outros formatos passam tal-qual. */
function isoToBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** "Sub-14 (Benjamin)" → { sub: "Sub-14", fr: "Benjamin" }. */
function splitCat(cat: string): { sub: string; fr: string | null } {
  const m = /^(.+?)\s*\((.+)\)$/.exec(cat);
  // «Sub 14» com espaço, como nos separadores e no filtro Escalão.
  return m ? { sub: m[1].replace("-", " "), fr: m[2] } : { sub: cat.replace(/^Sub-/, "Sub "), fr: null };
}

type SK = "name" | "license" | "cat" | "birth" | "merite" | "sex" | "hcp" | "club" | "region" | "tot" | "ano" | "hcpDate";

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
  // Roster kids2 compacto (juniors-links.json, partilhado com useKidsLinkMap) —
  // as setas ↗ aparecem quando chegar, sem bloquear a tabela.
  const roster = useJuniorsLinks();
  const { sortKey, sortDir, toggleSort } = useSort<SK>("name");
  // Torneios por jogador — ficheiro pesado (~2,8 MB), só carrega quando o
  // utilizador expande a PRIMEIRA linha. Depois fica em memória para todas.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [tourns, setTourns] = useState<FfgPlayerTournamentsFile | null>(null);
  const [tournsState, setTournsState] = useState<"idle" | "loading" | "error">("idle");

  const toggleOpen = (lic: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(lic)) next.delete(lic); else next.add(lic);
      return next;
    });
    if (!tourns && tournsState === "idle") {
      setTournsState("loading");
      cachedFetchJson<FfgPlayerTournamentsFile>("/data/ffgolf-player-tournaments.json")
        .then((d) => {
          if (!d || !d.byLicense) { setTournsState("error"); return; }
          setTourns(d);
          setTournsState("idle");
        })
        .catch(() => setTournsState("error"));
    }
  };

  useEffect(() => {
    cachedFetchJson<FrancePlayersFile>("/data/france-players.json")
      .then((d) => {
        if (!d || !d.byLicense) { setErr("france-players.json não encontrado. Corre `node scripts/build-france-players.js`."); return; }
        setData(d);
      })
      .catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  // lic FFG → juniorId (exacto) e normName → juniorId (fallback, 1º vence).
  const kidsByLic = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of roster) {
      const lic = j.ffgLic;
      if (lic && !m.has(lic)) m.set(lic, j.id);
    }
    return m;
  }, [roster]);
  const kidsByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of roster) {
      const nk = normName(j.canonicalName);
      if (!m.has(nk)) m.set(nk, j.id);
      for (const alias of j.aliases) {
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
      // `cat` vem do builder (série + nome da prova); a série sozinha só
      // resolve ~1/3 dos jogadores — fallback só para ficheiros pré-2026-07.
      const _cat = p.cat ?? ffgEscalaoCanonico(p.lastSerie);
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
    birth: all.some((p) => !!p.birthYear),
    merite: all.some((p) => p.merite?.rank != null),
    tot: all.some((p) => p._tot > 0),
    hcpDate: all.some((p) => !!p.hcpDate),
  }), [all]);

  /** Nº de colunas visíveis — o colSpan da linha expandida tem de bater certo. */
  const colCount = 3 + (has.club ? 1 : 0) + (has.region ? 1 : 0) + (has.sex ? 1 : 0)
    + (has.cat ? 1 : 0) + (has.birth ? 1 : 0) + (has.merite ? 1 : 0) + (has.tot ? 2 : 0) + (has.hcpDate ? 1 : 0);

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
        case "birth":   v = (a.birthYear ?? INF) - (b.birthYear ?? INF); break;
        case "merite":  v = (a.merite?.rank ?? INF) - (b.merite?.rank ?? INF); break;
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
            <> · clica numa linha para ver os torneios e resultados</>
          </span>
        }
      />

      {/* ── Filtros ─────────────────────────────────────────── */}
      <div className="u-d-flex u-fwr-wrap u-gap-8px u-ai-center u-m-12px-0">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Nome, licença ou clube…"
          className="filter-input u-minw-240px u-fl-1-1-240px u-maxw-360px"

        />
        <select value={sex} onChange={(e) => setSex(e.target.value as "" | "M" | "F")} className="filter-input u-w-130px">
          <option value="">Todos os sexos</option>
          <option value="M">Masculino</option>
          <option value="F">Feminino</option>
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="filter-input u-w-170px">
          <option value="ALL">Todas as categorias</option>
          {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={region} onChange={(e) => setRegion(e.target.value)} className="filter-input u-w-190px">
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
        <span className="muted fs-12 u-ml-auto">
          {filtered.length.toLocaleString("pt")} de {all.length.toLocaleString("pt")}
        </span>
      </div>

      {/* ── Tabela ──────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <EmptyState size="md" message="Nenhum jogador corresponde aos filtros." />
      ) : (
        <>
          <div className="u-ox-auto">
            <table className="player-list-table u-w-100pc u-fs-fs-12">
              <thead>
                <tr>
                  <SortableHdr k="license" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Licence</SortableHdr>
                  <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Nome</SortableHdr>
                  {has.club && <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Clube</SortableHdr>}
                  {has.region && <SortableHdr k="region" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Ligue</SortableHdr>}
                  <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">HCP</SortableHdr>
                  {has.sex && <SortableHdr k="sex" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Sexo</SortableHdr>}
                  {has.cat && <SortableHdr k="cat" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight" title="Escalão do Mérite Jeunes da FFG (ano de nascimento exacto) quando o jogador lá está; senão, o escalão mais novo em que competiu na última época (série ou nome da prova) — jogar acima do escalão é permitido, abaixo não.">Catégorie</SortableHdr>}
                  {has.birth && <SortableHdr k="birth" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Ano de nascimento — do escalão do Mérite Jeunes da FFG">Nasc.</SortableHdr>}
                  {has.merite && <SortableHdr k="merite" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Lugar no Mérite National Jeunes da FFG (12 meses)">Mérite</SortableHdr>}
                  {has.tot && <SortableHdr k="tot" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Total de torneios FFGolf em que apareceu">📊 Tot</SortableHdr>}
                  {has.tot && <SortableHdr k="ano" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title={`Torneios em ${CUR_YEAR}`}>🗓 {CUR_YEAR}</SortableHdr>}
                  {has.hcpDate && <SortableHdr k="hcpDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Data do torneio com o HCP mais recente">Últ. HCP</SortableHdr>}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const catParts = r._cat ? splitCat(r._cat) : null;
                  const isOpen = open.has(r.license);
                  return (
                    <Fragment key={r.license}>
                    <tr
                      className={"player-list-row" + (r._manuel ? " row-manuel" : "")}
                      onClick={() => toggleOpen(r.license)}
                      style={{ cursor: "pointer", background: isOpen ? "var(--bg-detail)" : undefined }}
                      title="Ver os torneios e resultados deste jogador"
                    >
                      <td className="u-ff-font-mono u-fs-fs-11 u-c-text-muted u-ws-nowrap">
                        <span aria-hidden className="u-mr-4px u-c-accent">{isOpen ? "▾" : "▸"}</span>
                        {r.license}
                      </td>
                      <td className="u-fw-600" title={r.lastSerie ? `Série mais recente: ${r.lastSerie}` : undefined}>
                        {r._name || "—"}
                        {r.country && r.country !== "FRA" && (
                          <span className="muted fs-10 u-ml-6px u-fw-400">{r.country}</span>
                        )}
                        {r._kid && (
                          <a
                            href={kidsUrl({ id: r._kid })}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(kidsUrl({ id: r._kid }), "_blank"); }}
                            title="Ver ficha em Kids"
                            className="u-fw-800 u-c-color-good-dark u-fs-fs-13 u-cur-pointer u-td-none u-ml-4px"
                          >
                            ↗
                          </a>
                        )}
                      </td>
                      {has.club && <td title={r._club}>{r._club || MUTED}</td>}
                      {has.region && <td className="fs-11" title={r._region}>{r._region || MUTED}</td>}
                      <td className="u-ta-right u-fw-600">{r.hcp != null ? r.hcp.toFixed(1) : MUTED}</td>
                      {has.sex && <td>{r.sex === "M" || r.sex === "F" ? <SexBadge sex={r.sex} /> : MUTED}</td>}
                      {has.cat && (
                        <td title={[r.catSrc === "merite" ? `Mérite Jeunes: ${r.merite?.cat ?? ""} (nascido em ${r.birthYear})` : r.catYear ? `Época ${r.catYear} (inferido das provas)` : null, r.lastSerie ? `Série mais recente: ${r.lastSerie}` : null].filter(Boolean).join(" · ") || undefined}>
                          {catParts ? (
                            r._young ? (
                              <>
                                {/* Mesma ordem dos separadores: nome FR, depois o Sub (22/10/2026). */}
                                {catParts.fr && <span className="fs-11 u-mr-4px">{catParts.fr}</span>}
                                <EscPill esc={catParts.sub} />
                              </>
                            ) : (
                              <span className="muted fs-11">{r._cat}</span>
                            )
                          ) : MUTED}
                        </td>
                      )}
                      {has.birth && <td className="u-ta-right">{r.birthYear ?? MUTED}</td>}
                      {has.merite && (
                        <td className="u-ta-right"
                          title={r.merite ? [`Mérite Jeunes ${r.merite.month.slice(4)}/${r.merite.month.slice(0, 4)}`, r.merite.rankAnn ? `${r.merite.rankAnn}.º do ano de nascimento` : null, `${r.merite.nbt} provas`, r.merite.moy != null ? `média ${r.merite.moy > 0 ? "+" : ""}${r.merite.moy.toFixed(2)} vs SSS` : null, r.merite.idx != null ? `index ${r.merite.idx.toFixed(1)}` : null].filter(Boolean).join(" · ") : undefined}>
                          {r.merite?.rank != null ? `${r.merite.rank}.º` : MUTED}
                        </td>
                      )}
                      {has.tot && <td style={{ textAlign: "right", color: r._tot ? undefined : "var(--text-muted)" }}>{r._tot || "—"}</td>}
                      {has.tot && <td style={{ textAlign: "right", color: r._ano ? "var(--color-good-dark, #166534)" : "var(--text-muted)", fontWeight: r._ano ? 600 : undefined }}>{r._ano || "—"}</td>}
                      {has.hcpDate && <td className="u-ta-right u-ws-nowrap">{r.hcpDate ? isoToBr(r.hcpDate) : MUTED}</td>}
                    </tr>
                    {isOpen && (
                      <tr className="player-list-row-detail">
                        <td colSpan={colCount} className="u-bg-bg-detail u-p-0-12px-4px">
                          {tourns
                            ? <PlayerTournaments file={tourns} license={r.license} />
                            : tournsState === "error"
                              ? <div className="muted fs-11 u-p-8px-4px">
                                  Não foi possível carregar <code>ffgolf-player-tournaments.json</code> — corre <code>node scripts/build-france-players.js</code>.
                                </div>
                              : <LoadingState message="A carregar torneios…" />}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="u-d-flex u-jc-center u-ai-center u-gap-8px u-p-12px-0 u-fs-fs-12">
              <button onClick={() => setPage(1)} disabled={page === 1} className="btn-pill">«</button>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-pill">‹</button>
              <span className="u-minw-90px u-ta-center">Página <b>{page}</b> de {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-pill">›</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="btn-pill">»</button>
            </div>
          )}
        </>
      )}

      <div className="muted fs-11 u-mt-16px u-ta-center">
        Fonte: <code>france-players.json</code> (portal resultats FFGolf — GP Jeunes + Compétitions Fédérales juvenis).
        Os torneios GolfGenius (Champ. de France, Internationaux) também contam — ligados por nome ao roster de licenças,
        com dedup dos que o portal já publica. A FFG não expõe DOB; a categoria é o escalão mais novo da última época jogada (série + nome da prova).
        Os torneios de cada jogador vêm de <code>ffgolf-player-tournaments.json</code> (mesmo builder) e abrem na classificação completa da /ffg.
      </div>
    </div>
  );
}
