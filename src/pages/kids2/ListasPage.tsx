/**
 * kids2/ListasPage.tsx — /kids2/listas
 *
 * Listas de inscritos (Entry Lists) com o handicap de cada miúdo à data da
 * lista, e o link para a ficha do kids2 de quem já tem ficha. Os dados saem do
 * agregador (scripts/aggregator/util/hcp-listas.js → hcp-listas-ligacoes.json).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cachedFetchJson } from "../../data/fetchCache";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import LoadingState from "../../ui/LoadingState";
import EmptyState from "../../ui/EmptyState";
import { flag } from "../../utils/flagUtils";
import { isManuel } from "../../constants/manuel";
import Kids2SubNav from "./Kids2SubNav";

interface Inscrito {
  ordem: number; pos: number; lista: "entry" | "waiting" | null;
  name: string; country: string; hcp: number;
  junior: { id: string; name: string; dob: string | null; club: string | null; via: string } | null;
  ambiguo: string[] | null;
  hcpAtual: { valor: number; fonte: string; data: string | null } | null;
}
interface Lista {
  id: string; label: string; torneio: string | null; data: string;
  nascidosDesde: number | null; wildcardsFpg: number | null; players: Inscrito[];
}

/** Handicap à maneira das listas: «+» para os de handicap positivo (guardados em negativo). */
const fmtHcp = (h: number | null | undefined) => (h == null ? "—" : h < 0 ? `+${(-h).toFixed(1)}` : h.toFixed(1));
const ddmmaa = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "");

function TabelaLista({ lista }: { lista: Lista }) {
  const { sortKey, sortDir, toggleSort } = useSort<string>("ordem", "asc", { hcp: "asc", atual: "asc" });
  const rows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const num = (v: number | null | undefined) => (v == null ? Infinity : v);
    return [...lista.players].sort((a, b) => {
      switch (sortKey) {
        case "name": return dir * a.name.localeCompare(b.name);
        case "country": return dir * a.country.localeCompare(b.country) || a.ordem - b.ordem;
        case "dob": return dir * (a.junior?.dob || "9999").localeCompare(b.junior?.dob || "9999") || a.ordem - b.ordem;
        case "club": return dir * (a.junior?.club || "~").localeCompare(b.junior?.club || "~") || a.ordem - b.ordem;
        case "hcp": return dir * (a.hcp - b.hcp) || a.ordem - b.ordem;
        case "atual": return dir * (num(a.hcpAtual?.valor) - num(b.hcpAtual?.valor)) || a.ordem - b.ordem;
        default: return dir * (a.ordem - b.ordem);
      }
    });
  }, [lista, sortKey, sortDir]);

  const nEntry = lista.players.filter(p => p.lista === "entry").length;
  const nWait = lista.players.filter(p => p.lista === "waiting").length;
  const nFicha = lista.players.filter(p => p.junior).length;

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: "var(--fs-16)", fontWeight: 600, color: "var(--text)" }}>{lista.torneio ?? lista.label}</h2>
      <div style={{ fontSize: "var(--fs-12)", color: "var(--text-3)", marginBottom: 10, lineHeight: 1.5 }}>
        {lista.label} · {nEntry} na lista{lista.wildcardsFpg ? ` (+ ${lista.wildcardsFpg} wild cards da FPG por nomear)` : ""} · {nWait} em lista de espera
        {lista.nascidosDesde ? ` · nascidos em ${lista.nascidosDesde} ou depois` : ""} · {nFicha} com ficha no kids2
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="player-list-table" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr>
              <SortableHdr k="ordem" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Posição na lista (entrada ou espera)">#</SortableHdr>
              <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "left" }}>Jogador</SortableHdr>
              <SortableHdr k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "left" }}>País</SortableHdr>
              <SortableHdr k="dob" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Nasc.</SortableHdr>
              <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "left" }}>Clube</SortableHdr>
              <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title={`Handicap na lista (${ddmmaa(lista.data)})`}>HCP lista</SortableHdr>
              <SortableHdr k="atual" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Handicap mais recente na ficha (FPG, RFEG ou FFG)">HCP actual</SortableHdr>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const eu = isManuel({ name: p.name, memberId: p.junior?.id?.replace(/^u/, "") });
              return (
                <tr key={p.ordem} className={eu ? "row-manuel" : undefined}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span className={`p p-sm ${p.lista === "waiting" ? "p-muted" : "p-tourn"}`} title={p.lista === "waiting" ? "Lista de espera" : "Na lista"}>
                      {p.lista === "waiting" ? "Espera" : "Lista"} {p.pos}
                    </span>
                  </td>
                  <td style={{ textAlign: "left", fontWeight: eu ? 700 : undefined }}>
                    {p.junior
                      ? <Link to={`/kids2/${p.junior.id}`} title={`Abrir a ficha de ${p.junior.name}`}>{p.name}</Link>
                      : <span>{p.name} <span className="fs-11 p-muted">{p.ambiguo ? "· ficha ambígua" : "· sem ficha"}</span></span>}
                  </td>
                  <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{flag(p.country)} {p.country}</td>
                  <td style={{ textAlign: "center" }}>{p.junior?.dob ? p.junior.dob.slice(0, 4) : "—"}</td>
                  <td style={{ textAlign: "left" }} className="fs-12">{p.junior?.club ?? "—"}</td>
                  <td style={{ textAlign: "center", fontWeight: 700 }}>{fmtHcp(p.hcp)}</td>
                  <td style={{ textAlign: "center" }} title={p.hcpAtual ? `${p.hcpAtual.fonte}${p.hcpAtual.data ? " · " + p.hcpAtual.data : ""}` : undefined}>
                    {p.hcpAtual ? <>{fmtHcp(p.hcpAtual.valor)} <span className="fs-11 p-muted">{p.hcpAtual.fonte}</span></> : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ListasPage() {
  const [data, setData] = useState<{ listas: Lista[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    cachedFetchJson<{ listas: Lista[] }>("/data/hcp-listas-ligacoes.json").then(setData).catch(e => setErr(String(e)));
  }, []);

  return (
    <>
      <Kids2SubNav />
      <div style={{ padding: "16px 20px" }}>
        <h1 style={{ margin: "0 0 12px", fontSize: "var(--fs-18)", fontWeight: 600, color: "var(--text)" }}>📝 Listas de inscritos</h1>
        {err ? <EmptyState size="md" message={"Falhou: " + err} />
          : !data ? <LoadingState message="A carregar listas…" />
            : !data.listas.length ? <EmptyState size="md" message="Ainda não há listas de inscritos." />
              : [...data.listas].sort((a, b) => b.data.localeCompare(a.data)).map(l => <TabelaLista key={l.id} lista={l} />)}
      </div>
    </>
  );
}
