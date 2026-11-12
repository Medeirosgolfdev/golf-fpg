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
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useJson } from "../../hooks/useJson";
import DetailHeader from "../../ui/DetailHeader";
import LoadingState from "../../ui/LoadingState";
import EmptyState from "../../ui/EmptyState";
import SortableHdr from "../../ui/SortableHdr";
import TabRow from "../../ui/TabRow";
import { EscPill } from "../../ui/PillBadge";
import { useSort, compareNullsLast } from "../../hooks/useSort";
import { ffgEscalaoCanonico } from "../../utils/ffgEscalao";
import { isPTByName } from "../../utils/ptPlayers";
import { isManuelByName } from "../../constants/manuel";
import { displayName, fmtDatePt, fmtSign, fmtOrd, titleCase } from "../../utils/format";
import Pager from "../../ui/Pager";
import { usePaged } from "../../hooks/usePaged";
import { RankChange, MUTED } from "../../ui/tableCells";
import ExpandArrow from "../../ui/ExpandArrow";
import ExtLink from "../../ui/ExternalLink";
import SearchInput from "../../ui/SearchInput";
import ErrorState from "../../ui/ErrorState";
import { ToggleChip } from "../../ui/FilterField";
import Select from "../../ui/Select";
import { toggleSet } from "../../utils/mathUtils";

import { norm } from "../../utils/courseAliases";
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
  /** Chave das provas (`prov`) quando não é o nome: os homónimos trazem a da sua ficha. */
  pk: string | null;
}
type SK = "rank" | "name" | "cat" | "by" | "golf" | "idx" | "moy" | "moy6" | "nbt" | "total" | "rankAnn";

const PAGE_SIZE = 100;
const fmtSigned = (v: number | null) => (v == null ? MUTED : <>{fmtSign(v, 2)}</>);
/** «Ricardo» + «CASTRO FERREIRA» → «Ricardo Castro Ferreira». */
const nomeProprio = (prenom: string, nom: string) => `${prenom} ${titleCase(nom)}`.trim();


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
      key: `${s}|${norm(nom).toUpperCase()}|${norm(prenom).toUpperCase()}` /* chaves do ficheiro em MAIÚSCULAS */, s, rank: g("rank"), rankPrev: g("rankPrev"), nom, prenom, name,
      cat: g("cat"), by, sub: canon ? canon.replace(/\s*\(.*\)$/, "").replace("-", " ") : null,
      golf: displayName(g<string>("golf") || ""), moy: g("moy"), moy6: g("moy6"), nbt: g<number>("nbt") ?? 0,
      div: g("div"), total: g("total"), rankAnn: g("rankAnn"), statut: g("statut"), idx: g("idx"),
      pt: isPTByName(name),
      pk: (ix.pk != null ? g<string | null>("pk") : null) || null,
    };
  });
}

export function FFGMeriteView() {
  const { data: raw, loading, error } = useJson<MeriteFile>("/data/ffgolf-merite-ranking.json");
  const data = raw?.rows ? raw : null;
  const err = error ?? (!loading && !data ? "ficheiro vazio" : null);
  const [sex, setSex] = useState<"M" | "F">("M");
  const [cat, setCat] = useState("ALL");
  const [q, setQ] = useState("");
  const [soClass, setSoClass] = useState(true);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const { sortKey, sortDir, toggleSort } = useSort<SK>("rank", "asc", { moy6: "asc", total: "desc", nbt: "desc", by: "desc" });

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
    const mult = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      // Vazios sempre no fim, nas duas direcções; desempate pelo lugar.
      let v = 0;
      switch (sortKey) {
        case "rank": v = compareNullsLast(a.rank, b.rank, mult); break;
        case "name": v = a.name.localeCompare(b.name, "fr") * mult; break;
        case "cat": v = compareNullsLast(a.by, b.by, mult === 1 ? -1 : 1); break; // escalão = ano ao contrário
        case "by": v = compareNullsLast(a.by, b.by, mult); break;
        case "golf": v = a.golf.localeCompare(b.golf, "fr") * mult; break;
        case "idx": v = compareNullsLast(a.idx, b.idx, mult); break;
        case "moy": v = compareNullsLast(a.moy, b.moy, mult); break;
        case "moy6": v = compareNullsLast(a.moy6, b.moy6, mult); break;
        case "nbt": v = (a.nbt - b.nbt) * mult; break;
        case "total": v = compareNullsLast(a.total, b.total, mult); break;
        case "rankAnn": v = compareNullsLast(a.rankAnn || null, b.rankAnn || null, mult); break;
      }
      return v || compareNullsLast(a.rank, b.rank, 1);
    });
  }, [filtered, sortKey, sortDir]);

  const sig = `${sex}|${cat}|${q}|${soClass}|${sortKey}|${sortDir}`;
  // Paginação global (hooks/usePaged): volta à 1.ª página quando os filtros ou a ordem mudam.
  const { page, setPage, totalPages, pageRows } = usePaged(sorted, sig, PAGE_SIZE);

  if (err) return <ErrorState message="Erro ao carregar o Mérite" detail={err} />;
  if (!data) return <LoadingState message="A carregar o Mérite Jeunes..." />;

  const info = data.info[sex];
  const toggleOpen = (k: string) => setOpen((p) => toggleSet(p, k));
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
        <TabRow active={sex} onChange={(s) => { setSex(s); setCat("ALL"); }} tabs={[
          { key: "M" as const, label: "Garçons" }, { key: "F" as const, label: "Filles" },
        ]} />
        <Select variant="filter" value={cat} onChange={setCat} className="u-w-170px">
          <option value="ALL">Todos os escalões</option>
          {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <SearchInput value={q} onChange={setQ} placeholder="Nome ou clube…" size="full" className="u-maxw-320px" />
        <ToggleChip checked={soClass} onChange={setSoClass} label="Só classificados"
          title="O Mérite só classifica quem tem provas suficientes; os outros aparecem sem lugar" />
        <span className="muted fs-12 u-ml-auto">{sorted.length.toLocaleString("pt")} jogadores</span>
      </div>

      {sorted.length === 0 ? (
        <EmptyState size="md" message="Nenhum jogador corresponde aos filtros." />
      ) : (
        <>
          <div className="u-ox-auto u-pb-8px">
            <table className="dtable player-list-table u-w-100pc u-fs-fs-12">
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
                  // Homónimos partilham o nome: a linha distingue-se também pelo lugar e clube,
                  // e as provas são as da ficha de cada um (`pk`), nunca as do nome.
                  const id = `${r.key}#${r.rank ?? ""}#${r.golf}`;
                  const isOpen = open.has(id);
                  const prov = data.prov[r.pk ?? r.key];
                  const destaque = isManuelByName(r.name) || r.pt;
                  return (
                    <Fragment key={id}>
                      <tr onClick={() => toggleOpen(id)} className={"u-cur-pointer" + (destaque ? " u-bg-bg-success-subtle" : "")}>
                        <td className="u-ta-right u-ws-nowrap u-fw-600">
                          {r.rank != null ? fmtOrd(r.rank) : MUTED}<RankChange up={r.rank != null && r.rankPrev != null ? r.rankPrev - r.rank : null} className="fs-11 u-ml-4px" title={r.rankPrev != null ? `Mês anterior: ${fmtOrd(r.rankPrev)}` : undefined} />
                        </td>
                        <td className="u-fw-600 u-ws-nowrap">
                          <span className="muted fs-11 u-mr-4px"><ExpandArrow open={isOpen} /></span>
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
                        <td className="u-ta-right">{r.rankAnn ? fmtOrd(r.rankAnn) : MUTED}</td>
                      </tr>
                      {isOpen && (
                        <tr className="player-list-row-detail">
                          <td colSpan={COLS} className="u-bg-bg-detail u-p-4px-12px-8px">
                            {prov?.length ? (
                              <table className="dtable player-list-table u-w-100pc u-fs-fs-11">
                                <thead>
                                  <tr><th>Data</th><th>Prova</th><th>Lugar</th><th className="num">Voltas</th><th className="num">Pontos</th><th className="num">Média vs SSS</th></tr>
                                </thead>
                                <tbody>
                                  {prov.map(([trnId, date, nome, lugar, t, pts, moy], i) => (
                                    <tr key={i}>
                                      <td className="u-ws-nowrap">{fmtDatePt(date)}</td>
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

          <Pager page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}

      <div className="muted fs-11 u-mt-16px u-ta-center">
        Fonte: <ExtLink href={`https://pages.ffgolf.org/merite/jeunes/${sex === "M" ? "messieurs" : "dames"}`}>Mérite National Jeunes — FFG</ExtLink>
        {" "}(<code>ffgolf-merite-ranking.json</code>, actualizado todos os meses).
      </div>
    </div>
  );
}
