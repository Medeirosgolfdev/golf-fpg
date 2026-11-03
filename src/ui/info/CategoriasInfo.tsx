/**
 * CategoriasInfo.tsx — a página «📚 Categorias» dos circuitos de fora (/ffg,
 * /rfeg, /fig — menu ⓘ Info). UMA só peça (pedido da Mariana, 02/11/2026: «se
 * melhorarmos uma melhora a outra»): cada página dá só os dados — cabeçalho,
 * aviso, a tabela das categorias, secções (tabela, texto ou bloco de código) e
 * notas — e o desenho, a ordenação e o aspecto vivem aqui.
 *
 * Tabelas ordenáveis por clique no cabeçalho (regra do site) nas colunas que
 * trazem `ordenavel` e linhas com `ordem` (o valor de cada célula para ordenar).
 */
import { useMemo, type ReactNode } from "react";
import DetailHeader from "../DetailHeader";
import ExtLink from "../ExternalLink";
import SortableHdr from "../SortableHdr";
import { useSort, compareValuesNullsLast } from "../../hooks/useSort";

import SectionTitle from "../SectionTitle";
export interface InfoColuna {
  label: ReactNode;
  /** Classe da coluna (th e td): «ta-c», «r mono»… */
  className?: string;
  title?: string;
  ordenavel?: boolean;
}

export interface InfoLinha {
  key: string;
  celulas: ReactNode[];
  /** Valor de cada célula para ordenar (null = vai para o fim). */
  ordem?: (string | number | null)[];
}

export interface InfoTabela {
  colunas: InfoColuna[];
  linhas: InfoLinha[];
}

export interface InfoSeccao {
  titulo: string;
  /** Parágrafo(s) antes da tabela. */
  texto?: ReactNode;
  tabela?: InfoTabela;
  /** Bloco de texto fixo (fórmulas, comandos). */
  pre?: string;
  /** Nota pequena depois da tabela. */
  nota?: ReactNode;
  /** Caixa «por fazer» (dados ainda não extraídos). */
  pendente?: ReactNode;
}

export interface CategoriasInfoProps {
  titulo: string;
  subtitulo: ReactNode;
  links?: { label: string; url: string; destaque?: boolean }[];
  /** Caixa de aviso por cima da tabela (`notice notice-info`). */
  aviso?: ReactNode;
  tabela: InfoTabela;
  notaTabela?: ReactNode;
  seccoes?: InfoSeccao[];
  notas?: ReactNode[];
}

/** Tabela de informação: `dtable`, ordenável nas colunas marcadas. */
export function InfoTable({ tabela }: { tabela: InfoTabela }) {
  const { sortKey, sortDir, toggleSort } = useSort<string>("", "asc");
  const linhas = useMemo(() => {
    const i = sortKey ? Number(sortKey) : -1;
    if (i < 0) return tabela.linhas;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...tabela.linhas].sort((a, b) => {
      return compareValuesNullsLast(a.ordem?.[i], b.ordem?.[i], dir);
    });
  }, [tabela.linhas, sortKey, sortDir]);
  return (
    <div className="scroll-x">
      <table className="dtable">
        <thead>
          <tr>
            {tabela.colunas.map((c, i) => c.ordenavel
              ? <SortableHdr key={i} k={String(i)} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={c.className} title={c.title}>{c.label}</SortableHdr>
              : <th key={i} className={c.className} title={c.title}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.key}>
              {l.celulas.map((cel, i) => <td key={i} className={tabela.colunas[i]?.className}>{cel}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CategoriasInfo({ titulo, subtitulo, links, aviso, tabela, notaTabela, seccoes, notas }: CategoriasInfoProps) {
  return (
    <div className="p-12-16">
      <DetailHeader
        title={titulo}
        sub={<>
          <span className="muted">{subtitulo}</span>
          {links?.map((l) => (
            <ExtLink key={l.url} href={l.url} className={`tourn-ext-link ml-8${l.destaque ? " link-accent" : ""}`}>{l.label}</ExtLink>
          ))}
        </>}
      />
      {aviso && <div className="notice notice-info">{aviso}</div>}
      <div className="mt-16"><InfoTable tabela={tabela} /></div>
      {notaTabela && <p className="muted fs-11 mt-8">{notaTabela}</p>}

      {seccoes?.map((s) => (
        <div key={s.titulo} className="mt-24">
          <SectionTitle size="lg">{s.titulo}</SectionTitle>
          {s.texto && <div className="fs-12 mb-8">{s.texto}</div>}
          {s.tabela && <InfoTable tabela={s.tabela} />}
          {s.pre && <pre className="info-pre info-pre-muted">{s.pre}</pre>}
          {s.pendente && <div className="info-pending">{s.pendente}</div>}
          {s.nota && <div className="fs-10 muted mt-8">{s.nota}</div>}
        </div>
      ))}

      {notas?.length ? (
        <div className="muted fs-11 mt-24">
          <strong>Notas:</strong>
          <ul className="mt-4">{notas.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}
