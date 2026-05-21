/**
 * kids2/NextTournamentsGlobal.tsx — /kids2/inscricoes
 *
 * Tabela global: todos os jogadores do roster e os PRÓXIMOS torneios em que
 * estão inscritos (USKids + FPG). Complementa /kids2/next-t (que é por torneio).
 * Ordenável por clique no cabeçalho; filtros por circuito + pesquisa.
 */

import { useMemo, useState } from "react";
import LoadingState from "../../ui/LoadingState";
import EmptyState from "../../ui/EmptyState";
import { usePasswordGate } from "../../hooks/usePasswordGate";
import PasswordGate from "../../ui/PasswordGate";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import { useJuniorsCanonical, type Junior } from "./data";
import { useUpcomingByJunior, type UpcomingReg } from "./upcomingRegs";
import Kids2SubNav from "./Kids2SubNav";

export default function NextTournamentsGlobal() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <Content />;
}

interface Row { junior: Junior; reg: UpcomingReg; }
type SortK = "date" | "player" | "tournament" | "circuit" | "escalao";

const MONTHS_PT_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS_PT_SHORT[Number(m) - 1] || m} ${y}`;
}
const CIRCUIT_LABEL: Record<UpcomingReg["circuit"], string> = { uskids: "🇺🇸 USKids", fpg: "🇵🇹 FPG" };

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
        case "escalao": return (a.reg.escalao || "").localeCompare(b.reg.escalao || "") * dir;
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
      <div style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--text)" }}>📋 Inscrições — próximos torneios</h1>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{rows.length} inscrições</span>
      </div>

      {!data || !map ? (
        <LoadingState message="A carregar inscrições…" />
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            {(["all", "uskids", "fpg"] as const).map(c => (
              <span key={c}
                onClick={() => setCircuit(c)}
                className="p p-sm"
                style={{
                  cursor: "pointer",
                  background: circuit === c ? "var(--accent)" : "var(--bg-muted)",
                  color: circuit === c ? "#fff" : "var(--text-2)",
                  borderColor: circuit === c ? "var(--accent)" : "var(--border-light)",
                }}>
                {c === "all" ? "Todos" : c === "uskids" ? "🇺🇸 USKids" : "🇵🇹 FPG"}
              </span>
            ))}
            <input
              type="text" value={q} onChange={e => setQ(e.target.value)}
              placeholder="🔍 Jogador ou torneio…"
              style={{
                marginLeft: "auto", padding: "5px 10px", fontSize: 13,
                border: "1px solid var(--border-light)", borderRadius: 6,
                background: "var(--bg-card)", color: "var(--text)", minWidth: 200,
              }} />
          </div>

          {rows.length === 0 ? (
            <EmptyState size="md" icon="📅" message="Sem inscrições futuras com os filtros actuais." />
          ) : (
            <table className="lb-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
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
                  <tr key={row.junior.id + ":" + row.reg.circuit + ":" + row.reg.tournamentId + ":" + i}
                    style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "6px 8px" }}>
                      <a
                        href={"/kids2/" + encodeURIComponent(row.junior.id)}
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontWeight: 600, color: "var(--color-info)", textDecoration: "none" }}
                        title="Abrir ficha do jogador (nova aba)">
                        {row.junior.canonicalName}
                      </a>
                    </td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{CIRCUIT_LABEL[row.reg.circuit]}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <a href={row.reg.link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text)", textDecoration: "none" }} title={row.reg.campo || row.reg.name}>
                        {row.reg.name}
                      </a>
                      {row.reg.status === "reserva" && (
                        <span style={{
                          marginLeft: 6, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
                          background: "var(--bg-warn-orange, #fff7ed)", color: "var(--color-orange-deep, #c2410c)",
                          border: "1px solid var(--color-amber, #f59e0b)",
                        }}>RESERVA</span>
                      )}
                    </td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap", color: "var(--text-2)" }}>{fmtDate(row.reg.date)}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap", color: "var(--text-3)" }}>{row.reg.escalao || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <a href={row.reg.link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-3)", textDecoration: "none", fontWeight: 600 }} title="Abrir torneio (nova aba)">↗</a>
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
