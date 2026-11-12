/**
 * src/ui/info/JogadoresFederacao.tsx — o ESQUELETO ÚNICO das listas «👥 Jogadores»
 * das federações de fora (/ffg «Joueurs de France», /rfeg «Jugadores de España»).
 *
 * Até 10/11/2026 cada página tinha a sua cópia de ~450 linhas da mesma lista
 * (pesquisa, sexo, categoria, «Só Jovens», contador, colunas vazias escondidas,
 * ordenação, paginação, linha que abre os torneios do jogador). Agora a página só
 * dá o que é DELA: as linhas já preparadas (`JogadorFedRow`), as suas colunas
 * (`ColunaJogadorFed` — cabeçalho, comparação e célula), os filtros a mais e o que
 * aparece na linha aberta. Uma federação nova entra com um ficheiro pequeno.
 *
 * As colunas iguais nas duas (Nome, Clube, HCP, Sexo, Tot, Ano, Últ. HCP) vêm de
 * `colunasComuns` — não se reescrevem.
 */
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useJson } from "../../hooks/useJson";
import DetailHeader from "../DetailHeader";
import LoadingState from "../LoadingState";
import EmptyState from "../EmptyState";
import ErrorState from "../ErrorState";
import SortableHdr from "../SortableHdr";
import SexBadge from "../SexBadge";
import Pager from "../Pager";
import ExpandArrow from "../ExpandArrow";
import SearchInput from "../SearchInput";
import SexSelect from "../SexSelect";
import Select from "../Select";
import { ToggleChip } from "../FilterField";
import { MUTED } from "../tableCells";
import { useSort, compareNullsLast, compareTextNullsLast } from "../../hooks/useSort";
import { usePaged } from "../../hooks/usePaged";
import { fmtDatePt, fmtHcp, fmtDeTotal } from "../../utils/format";
import { toggleSet } from "../../utils/mathUtils";

/** O que o esqueleto precisa de saber de cada jogador (a página junta os seus campos). */
export interface JogadorFedRow {
  /** Licença — chave da linha e 1.ª coluna. */
  _key: string;
  _name: string;
  _club: string;
  sex?: string | null;
  /** Categoria/escalão já resolvido (null = sem categoria). */
  _cat: string | null;
  /** Escalão juvenil? (filtro «Só Jovens») */
  _young: boolean;
  _hcp: number | null;
  _hcpDate: string | null;
  /** Torneios no total e no ano corrente. */
  _tot: number;
  _ano: number;
  _manuel: boolean;
  /** Texto onde a pesquisa procura, já em minúsculas. */
  _hay: string;
}

/** Uma coluna da tabela (todas ordenáveis; vazios no fim é com o `cmp` de cada uma). */
export interface ColunaJogadorFed<R> {
  /** Chave de ordenação. */
  k: string;
  label: ReactNode;
  /** Classe do cabeçalho («tight», «num»). */
  hdrClass?: string;
  title?: string;
  /** A coluna só aparece se ALGUM jogador tiver este dado (sem isto, aparece sempre). */
  tem?: (r: R) => boolean;
  cmp: (a: R, b: R, mult: 1 | -1) => number;
  /** A célula inteira (`<td>…</td>`). */
  td: (r: R) => ReactNode;
}

/** Ano corrente (a coluna «🗓 2026» conta os torneios deste ano). */
export const ANO_CORRENTE = new Date().getFullYear();

/** As colunas que são iguais em todas as federações. `locale` = o da ordenação por texto. */
export function colunasComuns<R extends JogadorFedRow>(locale: string, titulos: { tot: string; hcpDate: string }) {
  /** Nome — `extra` acrescenta o que a página quiser a seguir ao nome (país, seta ↗ Kids…). */
  const nome = (extra?: (r: R) => ReactNode, title?: (r: R) => string | undefined): ColunaJogadorFed<R> => ({
    k: "name", label: "Nome",
    cmp: (a, b, m) => m * a._name.localeCompare(b._name, locale),
    td: (r) => <td className="u-fw-600" title={title?.(r)}>{r._name || "—"}{extra?.(r)}</td>,
  });
  const club: ColunaJogadorFed<R> = {
    k: "club", label: "Clube", tem: (r) => !!r._club,
    cmp: (a, b, m) => compareTextNullsLast(a._club, b._club, m, locale),
    td: (r) => <td title={r._club}>{r._club || MUTED}</td>,
  };
  const hcp: ColunaJogadorFed<R> = {
    k: "hcp", label: "HCP", hdrClass: "num",
    cmp: (a, b, m) => compareNullsLast(a._hcp, b._hcp, m),
    td: (r) => <td className="u-ta-right u-fw-600">{r._hcp != null ? fmtHcp(r._hcp) : MUTED}</td>,
  };
  const sex: ColunaJogadorFed<R> = {
    k: "sex", label: "Sexo", hdrClass: "tight", tem: (r) => r.sex === "M" || r.sex === "F",
    cmp: (a, b, m) => compareTextNullsLast(a.sex, b.sex, m),
    td: (r) => <td>{r.sex === "M" || r.sex === "F" ? <SexBadge sex={r.sex} /> : MUTED}</td>,
  };
  const tot: ColunaJogadorFed<R> = {
    k: "tot", label: "📊 Tot", hdrClass: "num", title: titulos.tot, tem: (r) => r._tot > 0,
    cmp: (a, b, m) => m * (a._tot - b._tot),
    td: (r) => <td className={"u-ta-right" + (r._tot ? "" : " u-c-text-muted")}>{r._tot || "—"}</td>,
  };
  const ano: ColunaJogadorFed<R> = {
    // (aparece com a «Tot»: as duas ou nenhuma)
    k: "ano", label: <>🗓 {ANO_CORRENTE}</>, hdrClass: "num", title: `Torneios em ${ANO_CORRENTE}`, tem: (r) => r._tot > 0,
    cmp: (a, b, m) => m * (a._ano - b._ano),
    td: (r) => <td className={"u-ta-right " + (r._ano ? "u-c-color-good-dark u-fw-600" : "u-c-text-muted")}>{r._ano || "—"}</td>,
  };
  const hcpDate: ColunaJogadorFed<R> = {
    k: "hcpDate", label: "Últ. HCP", hdrClass: "num", title: titulos.hcpDate, tem: (r) => !!r._hcpDate,
    cmp: (a, b, m) => compareTextNullsLast(a._hcpDate, b._hcpDate, m),
    td: (r) => <td className="u-ta-right u-ws-nowrap">{r._hcpDate ? fmtDatePt(r._hcpDate) : MUTED}</td>,
  };
  return { nome, club, hcp, sex, tot, ano, hcpDate };
}

interface Props<R extends JogadorFedRow, F> {
  /** As linhas já preparadas; `null` enquanto o ficheiro não chegou. */
  rows: R[] | null;
  error: string | null;
  loadingMessage: string;
  title: string;
  /** Linha por baixo do título (contagens — é da página). */
  sub: ReactNode;

  /** 1.ª coluna: rótulo («Licence», «Licencia»), dica e o que vai a seguir ao número. */
  licLabel: string;
  licTitle?: (r: R) => string | undefined;
  licExtra?: (r: R, isOpen: boolean, toggle: () => void) => ReactNode;
  /** As colunas a seguir à licença, pela ordem em que aparecem. */
  colunas: ColunaJogadorFed<R>[];

  /** Opções do filtro de categoria e a largura da caixa (classe `.u-w-*`). */
  catOptions: string[];
  catClass: string;
  jovensTitle: string;
  /** Filtros a mais (a página guarda o estado): os controlos, a regra e uma assinatura para repor a página 1. */
  filtrosExtra?: ReactNode;
  passaExtra?: (r: R) => boolean;
  sigExtra?: string;

  /** Torneios do jogador: ficheiro pesado, só se pede ao abrir a PRIMEIRA linha e serve todas. */
  torneios: {
    url: string;
    ok: (d: F) => boolean;
    render: (file: F, r: R) => ReactNode;
    /** O que mostrar se o ficheiro não carregar. */
    erro: ReactNode;
  };
  /** Linhas a mais por baixo dos torneios (ex.: histórico de licenças). `celulas(row)`
   *  desenha as colunas visíveis (menos a da licença) para uma linha qualquer. */
  linhasExtra?: (r: R, ctx: { colCount: number; celulas: (row: R) => ReactNode }) => ReactNode;

  footer: ReactNode;
}

export default function JogadoresFederacao<R extends JogadorFedRow, F>({
  rows, error, loadingMessage, title, sub, licLabel, licTitle, licExtra, colunas,
  catOptions, catClass, jovensTitle, filtrosExtra, passaExtra, sigExtra = "",
  torneios, linhasExtra, footer,
}: Props<R, F>) {
  const [q, setQ] = useState("");
  const [sex, setSex] = useState<"" | "M" | "F">("");
  const [cat, setCat] = useState<string>("ALL");
  const [jovens, setJovens] = useState(false);
  const { sortKey, sortDir, toggleSort } = useSort<string>("name");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  // O ficheiro dos torneios só se pede quando se abre a primeira linha (peça global `useJson`).
  const [pedido, setPedido] = useState(false);
  const ficheiro = useJson<F>(pedido ? torneios.url : null);
  const file = ficheiro.data && torneios.ok(ficheiro.data) ? ficheiro.data : null;
  const fileErro = pedido && !ficheiro.loading && !file;

  const toggleOpen = (key: string) => {
    setOpen((prev) => toggleSet(prev, key));
    setPedido(true);
  };

  const all = useMemo(() => rows ?? [], [rows]);

  // Princípio «esconder coluna vazia»: só as colunas em que alguém tem dados.
  const visiveis = useMemo(() => colunas.filter((c) => !c.tem || all.some(c.tem)), [colunas, all]);
  /** Nº de colunas visíveis — o colSpan da linha aberta tem de bater certo. */
  const colCount = 1 + visiveis.length;
  const celulas = (row: R) => visiveis.map((c) => <Fragment key={c.k}>{c.td(row)}</Fragment>);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((p) => {
      if (jovens && !p._young) return false;
      if (sex && p.sex !== sex) return false;
      if (cat !== "ALL" && p._cat !== cat) return false;
      if (passaExtra && !passaExtra(p)) return false;
      if (needle && !p._hay.includes(needle)) return false;
      return true;
    });
  }, [all, q, sex, cat, jovens, passaExtra]);

  const sorted = useMemo(() => {
    const mult: 1 | -1 = sortDir === "asc" ? 1 : -1;
    const col = colunas.find((c) => c.k === sortKey);
    // (a licença é a 1.ª coluna, fora da lista de colunas)
    const cmp = col ? col.cmp : (a: R, b: R, m: 1 | -1) => m * a._key.localeCompare(b._key);
    return [...filtered].sort((a, b) => cmp(a, b, mult));
  }, [filtered, sortKey, sortDir, colunas]);

  // Volta à página 1 quando os filtros ou a ordenação mudam.
  const filterSig = `${q}|${sex}|${cat}|${sigExtra}|${jovens}|${sortKey}|${sortDir}`;
  const { page, setPage, totalPages, pageRows } = usePaged(sorted, filterSig);

  if (error) return <ErrorState message="Erro ao carregar os jogadores" detail={error} />;
  if (!rows) return <LoadingState message={loadingMessage} />;

  return (
    <div className="p-12-16">
      <DetailHeader title={title} sub={sub} />

      {/* ── Filtros ─────────────────────────────────────────── */}
      <div className="u-d-flex u-fwr-wrap u-gap-8px u-ai-center u-m-12px-0">
        <SearchInput value={q} onChange={setQ} placeholder="Nome, licença ou clube…" size="full" className="u-maxw-360px" />
        <SexSelect value={sex} onChange={setSex} allValue="" />
        <Select variant="filter" value={cat} onChange={setCat} className={catClass}>
          <option value="ALL">Todas as categorias</option>
          {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        {filtrosExtra}
        <ToggleChip checked={jovens} onChange={setJovens} label="🧒 Só Jovens" title={jovensTitle} />
        <span className="muted fs-12 u-ml-auto">{fmtDeTotal(filtered.length, all.length)}</span>
      </div>

      {/* ── Tabela ──────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <EmptyState size="md" message="Nenhum jogador corresponde aos filtros." />
      ) : (
        <>
          <div className="u-ox-auto">
            <table className="dtable player-list-table u-w-100pc u-fs-fs-12">
              <thead>
                <tr>
                  <SortableHdr k="lic" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">{licLabel}</SortableHdr>
                  {visiveis.map((c) => (
                    <SortableHdr key={c.k} k={c.k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={c.hdrClass} title={c.title}>{c.label}</SortableHdr>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const isOpen = open.has(r._key);
                  const toggle = () => toggleOpen(r._key);
                  return (
                    <Fragment key={r._key}>
                      <tr
                        className={"player-list-row u-cur-pointer" + (r._manuel ? " row-manuel" : "") + (isOpen ? " u-bg-bg-detail" : "")}
                        onClick={toggle}
                        title="Ver os torneios e resultados deste jogador"
                      >
                        <td className="u-ff-font-mono u-fs-fs-11 u-c-text-muted u-ws-nowrap" title={licTitle?.(r)}>
                          <span aria-hidden className="u-mr-4px u-c-accent"><ExpandArrow open={isOpen} /></span>
                          {r._key}
                          {licExtra?.(r, isOpen, toggle)}
                        </td>
                        {celulas(r)}
                      </tr>
                      {isOpen && (
                        <tr className="player-list-row-detail">
                          <td colSpan={colCount} className="u-bg-bg-detail u-p-0-12px-4px">
                            {file
                              ? torneios.render(file, r)
                              : fileErro
                                ? <div className="muted fs-11 u-p-8px-4px">{torneios.erro}</div>
                                : <LoadingState message="A carregar torneios…" />}
                          </td>
                        </tr>
                      )}
                      {isOpen && linhasExtra?.(r, { colCount, celulas })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pager page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}

      <div className="muted fs-11 u-mt-16px u-ta-center">{footer}</div>
    </div>
  );
}
