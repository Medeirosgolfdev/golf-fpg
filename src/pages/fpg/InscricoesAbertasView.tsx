/**
 * InscricoesAbertasView.tsx — vista «🟢 Inscrições abertas» da /FPG (23/11/2026).
 *
 * Os torneios com inscrições abertas em TODOS os clubes da FPG, lidos da lista
 * pública de cada clube (tourn_admissions_list.asp) pelo
 * scripts/scrape-inscricoes-abertas.js → public/data/inscricoes-abertas.json
 * (workflow update-inscricoes-abertas.yml, 3×/dia). Substitui na barra os
 * rankings PJA e Sub-12 (pedido da Mariana, 23/11/2026; os endereços
 * /FPG/rankingPJA e /FPG/rankingSub12 continuam a abrir).
 *
 * Pesquisa: a da barra da /FPG (torneio, clube ou zona). Zona: pills.
 * «Lista do clube» só quando o clube tem mais de um torneio aberto — com um só,
 * a FPG salta da lista directamente para ele (seria o mesmo link).
 */
import { useMemo, useState } from "react";
import { useJson } from "../../hooks/useJson";
import DetailHeader from "../../ui/DetailHeader";
import LoadingState from "../../ui/LoadingState";
import EmptyState from "../../ui/EmptyState";
import SortableHdr from "../../ui/SortableHdr";
import FilterPillRow from "../../ui/FilterPillRow";
import ExtLink from "../../ui/ExternalLink";
import { useSort, compareTextNullsLast } from "../../hooks/useSort";
import { fmtDatePt, fmtDateTime } from "../../utils/format";
import { stripAccents } from "../../utils/normName";

interface TorneioAberto {
  data: string;
  ccode: string;
  tcode: string;
  nome: string;
  clube: string;
  zona: string;
}
interface InscricoesAbertasFile {
  generatedAt: string;
  clubes: number;
  erros: number;
  torneios: TorneioAberto[];
}

type SK = "data" | "nome" | "clube" | "zona";

const FPG = "https://scoring-pt.datagolf.pt/scripts/";
const inscritosUrl = (t: TorneioAberto) => `${FPG}admissions.asp?club=${t.ccode}&tourn=${t.tcode}&LANG_TXT=PT&ack=XH256YF450`;
const listaUrl = (ccode: string) => `${FPG}tourn_admissions_list.asp?club=${ccode}&ack=XH256YF45T`;

export default function InscricoesAbertasView({ query = "" }: { query?: string }) {
  const res = useJson<InscricoesAbertasFile>("/data/inscricoes-abertas.json");
  const file = res.data;
  const [zonas, setZonas] = useState<string[]>([]);
  const { sortKey, sortDir, toggleSort } = useSort<SK>("data", "asc");

  const todasZonas = useMemo(
    () => [...new Set((file?.torneios ?? []).map((t) => t.zona).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt")),
    [file],
  );
  const porClube = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of file?.torneios ?? []) m.set(t.ccode, (m.get(t.ccode) ?? 0) + 1);
    return m;
  }, [file]);

  const linhas = useMemo(() => {
    const termos = stripAccents(query.trim().toLowerCase()).split(/\s+/).filter(Boolean);
    const dir = sortDir === "asc" ? 1 : -1;
    return (file?.torneios ?? [])
      .filter((t) => !zonas.length || zonas.includes(t.zona))
      .filter((t) => {
        if (!termos.length) return true;
        const hay = stripAccents(`${t.nome} ${t.clube} ${t.ccode} ${t.zona} ${fmtDatePt(t.data, "")}`.toLowerCase());
        return termos.every((w) => hay.includes(w));
      })
      .sort((a, b) => {
        const c = sortKey === "data" ? compareTextNullsLast(a.data || null, b.data || null, dir)
          : sortKey === "nome" ? a.nome.localeCompare(b.nome, "pt") * dir
          : sortKey === "clube" ? a.clube.localeCompare(b.clube, "pt") * dir
          : a.zona.localeCompare(b.zona, "pt") * dir;
        return c || compareTextNullsLast(a.data || null, b.data || null, 1) || a.clube.localeCompare(b.clube, "pt");
      });
  }, [file, zonas, query, sortKey, sortDir]);

  if (res.loading) return <LoadingState message="A carregar as inscrições abertas…" />;
  if (!file) return <EmptyState message={res.error ?? "inscricoes-abertas.json não encontrado. Corre `node scripts/scrape-inscricoes-abertas.js`."} />;

  const nClubes = new Set(file.torneios.map((t) => t.ccode)).size;
  return (
    <div className="course-detail">
      <DetailHeader
        title="🟢 Inscrições abertas"
        sub={`${file.torneios.length} torneios com inscrições abertas em ${nClubes} clubes · lista de ${file.clubes} clubes da FPG, actualizada a ${fmtDateTime(file.generatedAt)}${file.erros ? ` (${file.erros} clubes não responderam)` : ""}. Lida 3× por dia da lista de cada clube.`}
      />
      <FilterPillRow label="Zona:" items={todasZonas.map((z) => ({ key: z, label: z }))} active={zonas} onChange={setZonas} />
      {linhas.length === 0 ? (
        <EmptyState message="Nenhum torneio corresponde aos filtros." />
      ) : (
        <div className="u-ox-auto">
          <table className="dtable u-w-100pc">
            <thead>
              <tr>
                <SortableHdr k="data" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Data</SortableHdr>
                <SortableHdr k="nome" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Torneio</SortableHdr>
                <SortableHdr k="clube" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Clube</SortableHdr>
                <SortableHdr k="zona" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Zona</SortableHdr>
                <th>FPG</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((t) => (
                <tr key={`${t.ccode}:${t.tcode}`}>
                  <td className="u-ws-nowrap">{fmtDatePt(t.data)}</td>
                  <td className="u-fw-600">{t.nome}</td>
                  <td className="u-ws-nowrap"><span className="u-c-text-muted fs-12">{t.ccode}</span> {t.clube}</td>
                  <td className="u-ws-nowrap">{t.zona}</td>
                  <td className="u-ws-nowrap">
                    <ExtLink href={inscritosUrl(t)}>Inscritos ↗</ExtLink>
                    {(porClube.get(t.ccode) ?? 0) > 1 && <> · <ExtLink href={listaUrl(t.ccode)}>Lista do clube ↗</ExtLink></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
