/**
 * MeriteView.tsx — Mérite National Jeunes da FFG (ranking mensal dos juniores
 * franceses), como em pages.ffgolf.org/merite/jeunes/{messieurs|dames}.
 *
 * Lê `public/data/ffgolf-merite-ranking.json` (scripts/scrape-ffgolf-merite.js,
 * workflow mensal): a classificação do mês e, por classificado, as provas que
 * contam — o nome da prova abre a leaderboard em /ffg/t/ffgres:{trnId}.
 *
 * Item «🏅 Mérite Jeunes» no menu ⓘ Info da /ffg.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cachedFetchJson } from "../../data/fetchCache";
import DetailHeader from "../../ui/DetailHeader";
import LoadingState from "../../ui/LoadingState";
import EmptyState from "../../ui/EmptyState";
import SortableHdr from "../../ui/SortableHdr";
import { EscPill } from "../../ui/PillBadge";
import { useSort } from "../../hooks/useSort";
import { ffgEscalaoCanonico } from "../../utils/ffgEscalao";
import { isPTByName } from "../../utils/ptPlayers";
import { isManuelByName } from "../../constants/manuel";
import { displayName } from "../../utils/format";

/** [trnId|null, data ISO, nome, lugar, voltas, pontos, Moy.SSS] */
type Prova = [string | null, string, string, string, number[], number | null, number | null];
export interface MeriteFile {
  generatedAt: string;
  month: string;
  /** `parution` = data da PRÓXIMA edição (a FFG chama-lhe assim: a de Setembro dizia 01/10, a de Outubro 05/11). */
  info: Record<"M" | "F", { nb: number; title: string; from: string; to: string; parution: string }>;
  cols: string[];
  rows: (string | number | null)[][];
  prov: Record<string, Prova[]>;
}
interface Row {
  key: string; s: "M" | "F"; rank: number | null; rankPrev: number | null; nom: string; prenom: string;
  name: string; cat: string | null; by: number | null; sub: string | null; golf: string; moy: number | null;
  moy6: number | null; nbt: number; div: number | null; total: number | null; rankAnn: number | null;
  statut: string | null; idx: number | null; pt: boolean;
}
type SK = "rank" | "name" | "cat" | "by" | "golf" | "idx" | "moy" | "moy6" | "nbt" | "total" | "rankAnn";

const PAGE_SIZE = 100;
const MUTED = <span className="muted">—</span>;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const fmtSigned = (v: number | null) => (v == null ? MUTED : <>{v > 0 ? "+" : ""}{v.toFixed(2)}</>);
const isoToBr = (iso: string) => iso.split("-").reverse().join("/");
/** «Ricardo» + «CASTRO FERREIRA» → «Ricardo Castro Ferreira». */
const nomeProprio = (prenom: string, nom: string) =>
  `${prenom} ${nom.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())}`.trim();

function Evolucao({ rank, prev }: { rank: number | null; prev: number | null }) {
  if (rank == null || prev == null || rank === prev) return null;
  const sobe = rank < prev;
  return (
    <span className="fs-11" style={{ marginLeft: 4, color: sobe ? "var(--color-good-dark)" : "var(--color-danger)" }}
      title={`Mês anterior: ${prev}.º`}>
      {sobe ? "▲" : "▼"}{Math.abs(prev - rank)}
    </span>
  );
}

/** Linhas da vista a partir do ficheiro (escalão Sub pelo ano de nascimento, PT pelo nome). */
export function meriteRows(data: MeriteFile): Row[] {
  const season = Number(data.month.slice(0, 4));
  const ix = Object.fromEntries(data.cols.map((c, i) => [c, i]));
  return data.rows.map((r) => {
    const g = <T,>(c: string) => r[ix[c]] as T;
    const s = g<"M" | "F">("s"), nom = g<string>("nom"), prenom = g<string>("prenom");
    const by = g<number | null>("by");
    const name = nomeProprio(prenom, nom);
    const canon = by ? ffgEscalaoCanonico(`U${season - by}`) : null;
    return {
      key: `${s}|${norm(nom)}|${norm(prenom)}`, s, rank: g("rank"), rankPrev: g("rankPrev"), nom, prenom, name,
      cat: g("cat"), by, sub: canon ? canon.replace(/\s*\(.*\)$/, "").replace("-", " ") : null,
      golf: displayName(g<string>("golf") || ""), moy: g("moy"), moy6: g("moy6"), nbt: g<number>("nbt") ?? 0,
      div: g("div"), total: g("total"), rankAnn: g("rankAnn"), statut: g("statut"), idx: g("idx"),
      pt: isPTByName(name),
    };
  });
}

export function FFGMeriteView() {
  const [data, setData] = useState<MeriteFile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sex, setSex] = useState<"M" | "F">("M");
  const [cat, setCat] = useState("ALL");
  const [q, setQ] = useState("");
  const [soClass, setSoClass] = useState(true);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const { sortKey, sortDir, toggleSort } = useSort<SK>("rank", "asc", { moy6: "asc", total: "desc", nbt: "desc", by: "desc" });

  useEffect(() => {
    cachedFetchJson<MeriteFile>("/data/ffgolf-merite-ranking.json")
      .then((d) => (d?.rows ? setData(d) : setErr("ficheiro vazio")))
      .catch((e) => setErr(String(e?.message || e)));
  }, []);

  const all = useMemo<Row[]>(() => (data ? meriteRows(data) : []), [data]);

  const catOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of all) if (r.s === sex && r.cat && r.by) m.set(r.cat, r.by);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [all, sex]);

  const filtered = useMemo(() => {
    const needle = norm(q);
    return all.filter((r) => r.s === sex && (!soClass || r.rank != null) && (cat === "ALL" || r.cat === cat)
      && (!needle || norm(`${r.name} ${r.golf}`).includes(needle)));
  }, [all, sex, soClass, cat, q]);

  const sorted = useMemo(() => {
    const INF = Number.MAX_SAFE_INTEGER;
    const mult = sortDir === "asc" ? 1 : -1;
    const n = (v: number | null) => v ?? INF;
    return [...filtered].sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "rank": v = n(a.rank) - n(b.rank); break;
        case "name": v = a.name.localeCompare(b.name, "fr"); break;
        case "cat": v = n(b.by) - n(a.by); break;
        case "by": v = n(a.by) - n(b.by); break;
        case "golf": v = a.golf.localeCompare(b.golf, "fr"); break;
        case "idx": v = n(a.idx) - n(b.idx); break;
        case "moy": v = n(a.moy) - n(b.moy); break;
        case "moy6": v = n(a.moy6) - n(b.moy6); break;
        case "nbt": v = a.nbt - b.nbt; break;
        case "total": v = (a.total ?? -INF) - (b.total ?? -INF); break;
        case "rankAnn": v = n(a.rankAnn || null) - n(b.rankAnn || null); break;
      }
      return mult * v || n(a.rank) - n(b.rank);
    });
  }, [filtered, sortKey, sortDir]);

  const sig = `${sex}|${cat}|${q}|${soClass}|${sortKey}|${sortDir}`;
  const [lastSig, setLastSig] = useState(sig);
  if (sig !== lastSig) { setLastSig(sig); if (page !== 1) setPage(1); }

  if (err) return <EmptyState message={`Erro: ${err}`} />;
  if (!data) return <LoadingState message="A carregar o Mérite Jeunes..." />;

  const info = data.info[sex];
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const toggleOpen = (k: string) => setOpen((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const hdr = (k: SK, label: string, cls?: string, title?: string) =>
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={cls} title={title}>{label}</SortableHdr>;
  const COLS = 12;

  return (
    <div className="p-12-16">
      <DetailHeader
        title="🏅 Mérite Jeunes FFG"
        sub={
          <span className="muted">
            {info.title} · 12 meses de {info.from} a {info.to} · próxima actualização a {info.parution} ·{" "}
            <b>{info.nb.toLocaleString("pt")}</b> classificados · clica numa linha para ver as provas
          </span>
        }
      />

      <div className="u-d-flex u-fwr-wrap u-gap-8px u-ai-center u-m-12px-0">
        {(["M", "F"] as const).map((s) => (
          <button key={s} onClick={() => { setSex(s); setCat("ALL"); }} className={"btn-pill" + (sex === s ? " active" : "")}>
            {s === "M" ? "Garçons" : "Filles"}
          </button>
        ))}
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="filter-input u-w-170px">
          <option value="ALL">Todos os escalões</option>
          {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Nome ou clube…"
          className="filter-input u-minw-220px u-fl-1-1-220px u-maxw-320px" />
        <button onClick={() => setSoClass((v) => !v)} className={"btn-pill" + (soClass ? " active" : "")}
          title="O Mérite só classifica quem tem provas suficientes; os outros aparecem sem lugar">
          Só classificados
        </button>
        <span className="muted fs-12 u-ml-auto">{sorted.length.toLocaleString("pt")} jogadores</span>
      </div>

      {sorted.length === 0 ? (
        <EmptyState size="md" message="Nenhum jogador corresponde aos filtros." />
      ) : (
        <>
          <div className="u-ox-auto u-pb-8px">
            <table className="player-list-table u-w-100pc u-fs-fs-12">
              <thead>
                <tr>
                  {hdr("rank", "Lugar", "num")}
                  {hdr("name", "Jogador")}
                  {hdr("cat", "Escalão", "tight")}
                  {hdr("by", "Nasc.", "num")}
                  {hdr("golf", "Clube")}
                  {hdr("idx", "Index", "num", "Index FFG na ficha do Mérite")}
                  {hdr("moy", "Média", "num", "Média das voltas contra o SSS (12 meses)")}
                  {hdr("moy6", "Média 6m", "num", "Média contra o SSS nos últimos 6 meses")}
                  {hdr("nbt", "Provas", "num")}
                  <th className="num" title="Divisor: nº de provas por que se divide o total de pontos">Div.</th>
                  {hdr("total", "Pontos", "num")}
                  {hdr("rankAnn", "No ano", "num", "Lugar entre os nascidos no mesmo ano")}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  // Homónimos partilham a chave: a linha distingue-se também pelo lugar e clube.
                  const id = `${r.key}#${r.rank ?? ""}#${r.golf}`;
                  const isOpen = open.has(id);
                  const prov = data.prov[r.key];
                  const destaque = isManuelByName(r.name) || r.pt;
                  return (
                    <Fragment key={id}>
                      <tr onClick={() => toggleOpen(id)} style={{ cursor: "pointer", background: destaque ? "var(--bg-success-subtle)" : undefined }}>
                        <td className="u-ta-right u-ws-nowrap u-fw-600">
                          {r.rank != null ? `${r.rank}.º` : MUTED}<Evolucao rank={r.rank} prev={r.rankPrev} />
                        </td>
                        <td className="u-fw-600 u-ws-nowrap">
                          <span className="muted fs-11 u-mr-4px">{isOpen ? "▾" : "▸"}</span>
                          {r.pt && <span title="Português" className="u-mr-4px">🇵🇹</span>}
                          {r.name}
                          {/PRO/i.test(r.statut ?? "") && <span className="muted fs-11 u-ml-4px" title="Passou a profissional este ano (fica até ao fecho do Mérite)">PRO</span>}
                        </td>
                        <td className="u-ws-nowrap">
                          {r.cat ? <span className="fs-11 u-mr-4px">{r.cat}</span> : MUTED}
                          {r.sub && <EscPill esc={r.sub} />}
                        </td>
                        <td className="u-ta-right">{r.by ?? MUTED}</td>
                        <td>{r.golf || MUTED}</td>
                        <td className="u-ta-right">{r.idx != null ? r.idx.toFixed(1) : MUTED}</td>
                        <td className="u-ta-right">{fmtSigned(r.moy)}</td>
                        <td className="u-ta-right">{fmtSigned(r.moy6)}</td>
                        <td className="u-ta-right">{r.nbt || MUTED}</td>
                        <td className="u-ta-right">{r.div ?? MUTED}</td>
                        <td className="u-ta-right u-fw-600">{r.total != null && r.total > 0 ? r.total.toFixed(2) : MUTED}</td>
                        <td className="u-ta-right">{r.rankAnn ? `${r.rankAnn}.º` : MUTED}</td>
                      </tr>
                      {isOpen && (
                        <tr className="player-list-row-detail">
                          <td colSpan={COLS} className="u-bg-bg-detail u-p-4px-12px-8px">
                            {prov?.length ? (
                              <table className="u-w-100pc u-fs-fs-11">
                                <thead>
                                  <tr><th>Data</th><th>Prova</th><th>Lugar</th><th className="num">Voltas</th><th className="num">Pontos</th><th className="num">Média vs SSS</th></tr>
                                </thead>
                                <tbody>
                                  {prov.map(([trnId, date, nome, lugar, t, pts, moy], i) => (
                                    <tr key={i}>
                                      <td className="u-ws-nowrap">{isoToBr(date)}</td>
                                      <td>{trnId ? <Link to={`/ffg/t/${encodeURIComponent(`ffgres:${trnId}`)}`}>{nome}</Link> : nome}</td>
                                      <td className="u-ws-nowrap">{lugar || MUTED}</td>
                                      <td className="u-ta-right">{t.length ? t.join(" · ") : MUTED}</td>
                                      <td className="u-ta-right">{pts != null ? pts.toFixed(2) : MUTED}</td>
                                      <td className="u-ta-right">{fmtSigned(moy)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : <span className="muted">Sem provas guardadas (só se lêem as fichas dos classificados).</span>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

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
        Fonte: <a href={`https://pages.ffgolf.org/merite/jeunes/${sex === "M" ? "messieurs" : "dames"}`} target="_blank" rel="noreferrer">Mérite National Jeunes — FFG</a>
        {" "}(<code>ffgolf-merite-ranking.json</code>, actualizado todos os meses).
      </div>
    </div>
  );
}
