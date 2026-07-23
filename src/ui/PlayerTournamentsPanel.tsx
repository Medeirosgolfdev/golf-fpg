/**
 * PlayerTournamentsPanel.tsx — Painel "torneios + resultados de um jogador".
 *
 * Corpo partilhado das listas de jogadores por federação: expandir uma linha
 * mostra as provas que o jogador fez, com posição e voltas, e cada nome abre a
 * classificação completa na página do circuito. Usado por:
 *   • `/ffg/info/joueurs`  → src/pages/ffg/PlayerTournaments.tsx
 *   • `/rfeg/info/jugadores` → src/pages/rfeg/PlayerTournaments.tsx
 * Os adaptadores é que sabem ler cada ficheiro; aqui só há apresentação.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import SortableHdr from "./SortableHdr";
import { useSort } from "../hooks/useSort";

export interface PlayerTournItem {
  /** Chave React (id da prova; sufixado pelo adaptador se puder repetir). */
  key: string;
  /** Rota interna da prova (`/ffg/t/…`, `/rfeg/…`) — null = sem página. */
  url: string | null;
  name: string;
  date: string | null;
  year: number | null;
  /** Série (FR) / categoria (ES) — coluna do meio. */
  sub?: string | null;
  /** Etiqueta discreta a seguir ao nome (plataforma de origem). */
  badge?: string | null;
  course?: string | null;
  pos: number | null;
  /** Nº de jogadores — o adaptador só o passa quando é coerente com `pos`. */
  field?: number | null;
  total: number | null;
  rounds: number[];
  /** Estado da inscrição quando explica a falta de resultado (ES: baja/reserva). */
  status?: string | null;
}

type SK = "date" | "name" | "sub" | "pos" | "total";

const MUTED = <span className="muted">—</span>;

/** ISO "2026-07-20" → "20/07/2026". */
function br(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export default function PlayerTournamentsPanel({
  items, subLabel = "Série", emptyMessage = "Sem torneios registados.",
}: {
  items: PlayerTournItem[];
  subLabel?: string;
  emptyMessage?: string;
}) {
  const navigate = useNavigate();
  // Data começa no mais recente; posição/score no MELHOR (ascendente) — ordenar
  // por "Pos" e ver os últimos lugares primeiro não é o que ninguém procura.
  const { sortKey, sortDir, toggleSort } = useSort<SK>("date", "desc", {
    name: "asc", sub: "asc", pos: "asc", total: "asc",
  });

  const sorted = useMemo(() => {
    const INF = Number.MAX_SAFE_INTEGER;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "date":  v = (a.date || "").localeCompare(b.date || ""); break;
        case "name":  v = a.name.localeCompare(b.name); break;
        case "sub":   v = (a.sub || "~").localeCompare(b.sub || "~"); break;
        // Sem resultado (inscrito / prova por jogar) vai sempre para o fim.
        case "pos":   v = (a.pos ?? INF) - (b.pos ?? INF); break;
        case "total": v = (a.total ?? INF) - (b.total ?? INF); break;
      }
      return mult * v;
    });
  }, [items, sortKey, sortDir]);

  const resumo = useMemo(() => {
    const comResultado = items.filter((i) => i.pos != null);
    const best = comResultado.length ? Math.min(...comResultado.map((i) => i.pos as number)) : null;
    const anos = new Set(items.map((i) => i.year).filter((y): y is number => !!y));
    return { n: items.length, best, anos: anos.size, semResultado: items.length - comResultado.length };
  }, [items]);

  if (!items.length) {
    return <div className="muted fs-11" style={{ padding: "8px 4px" }}>{emptyMessage}</div>;
  }

  return (
    <div style={{ padding: "6px 0 10px" }}>
      <div className="muted fs-11" style={{ marginBottom: 6 }}>
        <b>{resumo.n}</b> {resumo.n === 1 ? "torneio" : "torneios"} em {resumo.anos} {resumo.anos === 1 ? "época" : "épocas"}
        {resumo.best != null && <> · melhor classificação <b>{resumo.best}º</b></>}
        {resumo.semResultado > 0 && <> · {resumo.semResultado} sem resultado publicado</>}
        <span style={{ marginLeft: 8, fontStyle: "italic" }}>clica no torneio para ver a leaderboard completa</span>
      </div>
      <table className="player-list-table" style={{ width: "100%", fontSize: "var(--fs-11)" }}>
        <thead>
          <tr>
            <SortableHdr k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Data</SortableHdr>
            <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Torneio</SortableHdr>
            <SortableHdr k="sub" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">{subLabel}</SortableHdr>
            <SortableHdr k="pos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">Pos</SortableHdr>
            <th className="tight">Voltas</th>
            <SortableHdr k="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">Total</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {sorted.map((i) => (
            <tr key={i.key} className="player-list-row">
              <td style={{ whiteSpace: "nowrap" }}>{br(i.date)}</td>
              <td style={{ fontWeight: 600 }}>
                {i.url ? (
                  <a
                    href={i.url}
                    className="player-list-name-link"
                    onClick={(e) => { e.preventDefault(); navigate(i.url as string); }}
                    title="Abrir a classificação completa"
                  >
                    {i.name}
                  </a>
                ) : (
                  <span title="Esta prova não tem página no site">{i.name}</span>
                )}
                {i.badge && <span className="muted fs-10" style={{ marginLeft: 6, fontWeight: 400 }}>{i.badge}</span>}
                {i.course && <span className="muted fs-10" style={{ marginLeft: 6, fontWeight: 400 }}>📍 {i.course}</span>}
              </td>
              <td className="muted fs-10">{i.sub || MUTED}</td>
              <td className="num" style={{ whiteSpace: "nowrap" }}>
                {i.pos != null ? (
                  <>
                    <b>{i.pos}º</b>
                    {i.field ? <span className="muted fs-10"> de {i.field}</span> : null}
                  </>
                ) : (
                  <span
                    className="muted fs-10"
                    title="Inscrito sem resultado publicado (prova por jogar, retirado ou sem cartão)"
                  >
                    {i.status || "inscrito"}
                  </span>
                )}
              </td>
              <td className="muted" style={{ whiteSpace: "nowrap" }}>
                {i.rounds.length ? i.rounds.join(" · ") : MUTED}
              </td>
              <td className="num" style={{ fontWeight: 600 }}>{i.total ?? MUTED}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
