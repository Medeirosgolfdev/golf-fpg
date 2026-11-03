/**
 * RankingListaView.tsx — a vista «🏆 Ranking juvenil» dos circuitos de fora
 * (/fig, /rfeg — menu ⓘ Info). UMA só peça (02/11/2026, «se melhorarmos uma
 * melhora a outra»): cabeçalho com o link oficial, ano, lista (categoria/zona),
 * sexo opcional, pesquisa e a `RankingTable` partilhada (a do EGR/WAGR). Cada
 * página dá só as linhas e as colunas.
 */
import { useMemo, useState, type ReactNode } from "react";
import DetailHeader from "../DetailHeader";
import ExtLink from "../ExternalLink";
import TabRow from "../TabRow";
import SexSelect from "../SexSelect";
import SearchInput from "../SearchInput";
import EmptyState from "../EmptyState";
import { norm } from "../../utils/format";
import { useKidsLinkMap } from "../../hooks/useKidsLinkMap";
import { KidsLinkCtx } from "../KidsLink";
import { RankingTable, type RankingCol } from "./RankingPage";
import Select from "../Select";

export interface RankingListaOpcao { key: string; label: ReactNode; count?: number }

/** Mais do que isto, a escolha da lista passa de botões a um select. */
const MAX_BOTOES = 6;

export default function RankingListaView<T>({
  titulo, sub, site, siteLabel, anos, ano, onAno, listas, lista, onLista, sexo, onSexo,
  rows, cols, rowKey, pesquisa, defaultSort = "pos", onRowClick, rowTitle, nota,
}: {
  titulo: string;
  sub: ReactNode;
  site: string;
  siteLabel: string;
  anos: string[];
  ano: string;
  onAno: (a: string) => void;
  listas: RankingListaOpcao[];
  lista: string;
  onLista: (k: string) => void;
  /** Sem `onSexo`, não há selector de sexo (listas já separadas por sexo). */
  sexo?: "M" | "F";
  onSexo?: (s: "M" | "F") => void;
  rows: T[];
  cols: RankingCol<T>[];
  rowKey: (r: T) => string;
  /** Texto em que a pesquisa procura (nome, clube…). */
  pesquisa: (r: T) => string;
  defaultSort?: string;
  onRowClick?: (r: T) => void;
  rowTitle?: string;
  /** Nota por baixo dos filtros (data da lista, fórmula…). */
  nota?: ReactNode;
}) {
  const { kidsMap } = useKidsLinkMap();
  const [q, setQ] = useState("");
  const filtradas = useMemo(() => {
    const nq = norm(q);
    return nq ? rows.filter((r) => norm(pesquisa(r)).includes(nq)) : rows;
  }, [rows, q, pesquisa]);

  return (
    <KidsLinkCtx.Provider value={kidsMap}>
      <div className="p-12-16">
        <DetailHeader
          title={titulo}
          sub={<>
            <span className="muted">{sub}</span>
            <ExtLink href={site} className="tourn-ext-link ml-8">{siteLabel}</ExtLink>
          </>}
        />
        <div className="filter-bar mt-8">
          {anos.length > 1 && <TabRow ariaLabel="Ano" active={ano} onChange={onAno} tabs={anos.map((a) => ({ key: a, label: a }))} />}
          {listas.length <= MAX_BOTOES
            ? <TabRow ariaLabel="Lista" active={lista} onChange={onLista} tabs={listas} />
            : (
              <Select value={lista} onChange={onLista} aria-label="Lista">
                {listas.map((l) => <option key={l.key} value={l.key}>{l.label}{l.count != null ? ` (${l.count})` : ""}</option>)}
              </Select>
            )}
          {onSexo && sexo && <SexSelect value={sexo} onChange={onSexo} />}
          <SearchInput value={q} onChange={setQ} placeholder="Jogador ou clube…" size="sm" />
        </div>
        {nota && <p className="muted fs-11 mb-8">{nota}</p>}
        {filtradas.length === 0
          ? <EmptyState icon="🔍" message="Nenhum jogador nesta lista." />
          : <RankingTable rows={filtradas} cols={cols} rowKey={rowKey} defaultSort={defaultSort} defaultDir="asc"
              rowTitle={rowTitle} paged onRowClick={onRowClick} />}
      </div>
    </KidsLinkCtx.Provider>
  );
}
