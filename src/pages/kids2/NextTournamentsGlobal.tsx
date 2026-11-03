/**
 * kids2/NextTournamentsGlobal.tsx — /kids2/inscricoes
 *
 * Tabela global: todos os jogadores do roster e os PRÓXIMOS torneios em que
 * estão inscritos (USKids + FPG). Complementa /kids2/next-t (que é por torneio).
 * Ordenável por clique no cabeçalho; filtros por circuito + pesquisa.
 */

import TabRow from "../../ui/TabRow";
import { useMemo, useState } from "react";
import LoadingState from "../../ui/LoadingState";
import EmptyState from "../../ui/EmptyState";
import { usePasswordGate } from "../../hooks/usePasswordGate";
import PasswordGate from "../../ui/PasswordGate";
import { useSort, compareTextNullsLast } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import { useJuniorsCanonical, type Junior } from "./data";
import { useUpcomingByJunior, type UpcomingReg } from "./upcomingRegs";
import Kids2SubNav from "./Kids2SubNav";
import { fmtDayMonthYear } from "../../utils/format";
import ExtLink from "../../ui/ExternalLink";
import SearchInput from "../../ui/SearchInput";
import { CIRCUIT_LABEL } from "./components/NextTournamentsSection";

export default function NextTournamentsGlobal() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <Content />;
}

interface Row { junior: Junior; reg: UpcomingReg; }
type SortK = "date" | "player" | "tournament" | "circuit" | "escalao";


function Content() {
  const status = useJuniorsCanonical();
  const data = status.kind === "ready" ? status.data : null;
  const map = useUpcomingByJunior(data);

  const [circuit, setCircuit] = useState<"all" | "uskids" | "fpg">("all");
  const [q, setQ] = useState("");
  const { sortKey, sortDir, toggleSort } = useSort<SortK>("date");

  const allRows = useMemo<Row[]>(() => {
    if (!data || !map) return [];
    const out: Row[] = [];
    for (const [jid, regs] of map) {
      const junior = data.juniorById.get(jid);
      if (!junior) continue;
      for (const reg of regs) out.push({ junior, reg });
    }
    return out;
  }, [data, map]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = allRows;
    if (circuit !== "all") r = r.filter(x => x.reg.circuit === circuit);
    if (needle) r = r.filter(x =>
      x.junior.canonicalName.toLowerCase().includes(needle) ||
      x.reg.name.toLowerCase().includes(needle));
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: Row, b: Row): number => {
      switch (sortKey) {
        case "player": return a.junior.canonicalName.localeCompare(b.junior.canonicalName) * dir;
        case "tournament": return a.reg.name.localeCompare(b.reg.name) * dir;
        case "circuit": return a.reg.circuit.localeCompare(b.reg.circuit) * dir;
        case "escalao": return compareTextNullsLast(a.reg.escalao, b.reg.escalao, dir);
        case "date":
        default: return (a.reg.date.localeCompare(b.reg.date) || a.junior.canonicalName.localeCompare(b.junior.canonicalName)) * dir;
      }
    };
    return [...r].sort(cmp);
  }, [allRows, circuit, q, sortKey, sortDir]);

  if (status.kind === "error") return <EmptyState size="md" message={"Falhou: " + status.error} />;

  return (
    <>
      <Kids2SubNav />
      <div className="u-p-16px-20px">
      <div className="u-d-flex u-ai-baseline u-gap-10px u-mb-12px u-fwr-wrap">
        <h1 className="u-m-0 u-fs-fs-18 u-fw-600 u-c-text">📋 Inscrições — próximos torneios</h1>
        <span className="u-fs-fs-12 u-c-text-3">{rows.length} inscrições</span>
      </div>

      {!data || !map ? (
        <LoadingState message="A carregar inscrições…" />
      ) : (
        <>
          <div className="u-d-flex u-gap-8px u-mb-12px u-fwr-wrap u-ai-center">
            {/* Circuito: o interruptor segmentado do resto do site (14/10/2026). */}
            <TabRow active={circuit} onChange={setCircuit}
              tabs={(["all", "uskids", "fpg"] as const).map(c => ({ key: c, label: c === "all" ? "Todos" : c === "uskids" ? "🇺🇸 USKids" : "🇵🇹 FPG" }))} />
            <SearchInput value={q} onChange={setQ} placeholder="Jogador ou torneio…" className="u-ml-auto" />
          </div>

          {rows.length === 0 ? (
            <EmptyState size="md" icon="📅" message="Sem inscrições futuras com os filtros actuais." />
          ) : (
            <table className="dtable">
              <thead>
                <tr>
                  <SortableHdr k="player" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Jogador</SortableHdr>
                  <SortableHdr k="circuit" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Circuito</SortableHdr>
                  <SortableHdr k="tournament" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Torneio</SortableHdr>
                  <SortableHdr k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Data</SortableHdr>
                  <SortableHdr k="escalao" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Escalão</SortableHdr>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.junior.id + ":" + row.reg.circuit + ":" + row.reg.tournamentId + ":" + i}>
                    <td>
                      <ExtLink
                        href={"/kids2/" + encodeURIComponent(row.junior.id)}
                        className="u-fw-600 u-c-color-info u-td-none"
                        title="Abrir ficha do jogador (nova aba)">
                        {row.junior.canonicalName}
                      </ExtLink>
                    </td>
                    <td className="u-ws-nowrap">{CIRCUIT_LABEL[row.reg.circuit]}</td>
                    <td>
                      <ExtLink href={row.reg.link} className="u-c-text u-td-none" title={row.reg.campo || row.reg.name}>
                        {row.reg.name}
                      </ExtLink>
                      {row.reg.status === "reserva" && (
                        <span className="u-ml-6px u-fs-fs-9 u-fw-700 u-p-1px-4px u-br-radius-sm u-bg-var-bg-warn-orange-fff7ed u-c-var-color-orange-deep-c2410c u-bd-ltbl9">RESERVA</span>
                      )}
                    </td>
                    <td className="u-ws-nowrap u-c-text-2">{fmtDayMonthYear(row.reg.date)}</td>
                    <td className="u-ws-nowrap u-c-text-3">{row.reg.escalao || "—"}</td>
                    <td>
                      <ExtLink href={row.reg.link} className="u-c-text-3 u-td-none u-fw-600" title="Abrir torneio (nova aba)">↗</ExtLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      </div>
    </>
  );
}
