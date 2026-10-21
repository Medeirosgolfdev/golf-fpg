/**
 * TeamPointsStandings — classificação de EQUIPAS por pontos, peça partilhada.
 *
 * Uma linha por equipa: lugar, pontos por categoria, total (e a classificação
 * oficial, quando publicada). Selector das rondas (Dia 1 / Dia 2 / Total) e
 * aviso dos confrontos sem resultado. Clicar numa equipa abre os jogadores
 * dela, com o resultado contra cada adversária. Tudo ordenável.
 *
 * Os dados (`TeamPointsData`) fazem-se no data layer — ex.: `clubesTeamPoints`
 * (src/data/clubesMatchplayAdapter.ts) para o 3-way match play do Regional de
 * Clubes da FPG (/FPG/clubes → 🏅 Grupos).
 */
import { Fragment, useMemo, useState } from "react";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../SortableHdr";
import ResultMark from "../ResultMark";
import { KidsLink } from "../KidsLink";
import { fmtToPar } from "../../utils/format";
import { fmtPoints, type TeamPointsData, type TeamPointsPlayerRow, type TeamPointsResult } from "./teamPointsTypes";

type TeamRow = {
  key: string;
  name: string;
  pos: number;
  cats: Record<string, number | undefined>;
  total: number;
  official: number | null;
};

function ResultCell({ results }: { results: TeamPointsResult[] | undefined }) {
  if (!results?.length) return <span className="c-muted">—</span>;
  return (
    // Um confronto por linha: no Total, os dois dias lado a lado liam-se como um só.
    <span className="tps-res">
      {results.map((r, i) => r.pending ? (
        <span key={i} className="tps-pending" title="Sem resultado publicado">—</span>
      ) : r.half ? (
        <ResultMark key={i} kind="half" gap={0} />
      ) : (
        <span key={i} className={r.won ? "fw-700" : undefined}>
          <ResultMark kind={r.won ? "win" : "loss"} gap={r.margin ? 4 : 0} />{r.margin ?? ""}
        </span>
      ))}
    </span>
  );
}

/** Jogadores de UMA equipa na vista actual, com o resultado contra cada adversária. */
function TeamPlayers({ rows, opps, catLabel }: {
  rows: TeamPointsPlayerRow[];
  opps: { key: string; label: string }[];
  catLabel: (k: string) => string;
}) {
  const { sortKey, sortDir, toggleSort } = useSort<string>("cat", "asc", { pts: "desc" });
  const catOrder = useMemo(() => new Map(rows.map((r, i) => [r.catKey, i])), [rows]);
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: TeamPointsPlayerRow): string | number => {
      if (sortKey === "cat") return catOrder.get(r.catKey) ?? 99;
      if (sortKey === "name") return r.name;
      if (sortKey === "gross") return r.gross ?? 999;
      if (sortKey === "pts") return r.pts ?? -1;
      // vs:<equipa> → pontos ganhos contra essa equipa
      const res = r.vs[sortKey.slice(3)] ?? [];
      return res.reduce((s, x) => s + (x.won ? 1 : x.half ? 0.5 : 0), 0);
    };
    return rows.map((r, i) => ({ r, i })).sort((a, b) => {
      const va = val(a.r), vb = val(b.r);
      return va < vb ? -dir : va > vb ? dir : a.i - b.i;
    }).map(x => x.r);
  }, [rows, sortKey, sortDir, catOrder]);
  if (!rows.length) return <div className="muted">Sem jogadores nesta vista.</div>;
  const hp = { sortKey, sortDir, onSort: toggleSort };
  return (
    <table className="sc-lb tps-players">
      <thead>
        <tr>
          <SortableHdr k="cat" {...hp}>Categoria</SortableHdr>
          <SortableHdr k="name" {...hp} className="ta-left">Jogador</SortableHdr>
          <SortableHdr k="gross" {...hp} title="Gross (±par) no dia de stroke play">Gross</SortableHdr>
          {opps.map(o => <SortableHdr key={o.key} k={`vs:${o.key}`} {...hp}>vs {o.label}</SortableHdr>)}
          <SortableHdr k="pts" {...hp}>Pts</SortableHdr>
        </tr>
      </thead>
      <tbody>
        {sorted.map(r => (
          <tr key={r.key}>
            <td className="c-muted">{catLabel(r.catKey)}</td>
            <td className="tps-name">
              {r.fed ? <a href={`/jogadores/${r.fed}`} className="mp-player-link">{r.name}</a> : r.name}
              <KidsLink nome={r.name} fed={r.fed} />
            </td>
            <td>{r.gross != null ? `${r.gross}${r.toPar != null ? ` (${fmtToPar(r.toPar)})` : ""}` : "—"}</td>
            {opps.map(o => <td key={o.key}><ResultCell results={r.vs[o.key]} /></td>)}
            <td className={r.pts ? "fw-700" : "c-muted"}>{fmtPoints(r.pts)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function TeamPointsStandings({ data, defaultRound = "all" }: {
  data: TeamPointsData;
  /** Vista inicial: o número da ronda, ou "all" (Total). */
  defaultRound?: number | "all";
}) {
  const [sel, setSel] = useState<string>(String(defaultRound));
  const cur = data.byRound[sel] ?? data.byRound.all;
  const [open, setOpen] = useState<string | null>(null);
  const { sortKey, sortDir, toggleSort } = useSort<string>("pos", "asc", { total: "desc" });
  const showOfficial = sel === "all" && !!data.officialPlaces;

  const rows = useMemo<TeamRow[]>(() => {
    const base = data.teams.map(t => {
      const cats = cur.pts[t.key] ?? {};
      const total = Object.values(cats).reduce((s, v) => s + v, 0);
      return { key: t.key, name: t.name, cats, total, official: data.officialPlaces?.[t.key] ?? null };
    });
    // Lugar pelos pontos da vista actual; empatados partilham o lugar.
    return base.map(t => ({ ...t, pos: 1 + base.filter(o => o.total > t.total).length }));
  }, [data, cur]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: TeamRow): string | number => {
      if (sortKey === "pos") return r.pos;
      if (sortKey === "name") return r.name;
      if (sortKey === "total") return r.total;
      if (sortKey === "official") return r.official ?? 99;
      return r.cats[sortKey.slice(2)] ?? -1;
    };
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      return va < vb ? -dir : va > vb ? dir : a.pos - b.pos;
    });
  }, [rows, sortKey, sortDir]);

  const hp = { sortKey, sortDir, onSort: toggleSort };
  const catLabel = (k: string) => data.categories.find(c => c.key === k)?.label ?? k;
  const nCols = 3 + data.categories.length + (showOfficial ? 1 : 0);

  return (
    <div>
      {data.rounds.length > 1 && (
        <div className="mp-round-picker">
          <div className="segmented-toggle" role="tablist" aria-label="Dia da prova">
            {data.rounds.map(r => (
              <button key={r.n} role="tab" aria-selected={sel === String(r.n)}
                className={`seg-btn${sel === String(r.n) ? " active" : ""}`} onClick={() => setSel(String(r.n))}>
                <span className="seg-label">{r.label}</span>
              </button>
            ))}
            <button role="tab" aria-selected={sel === "all"}
              className={`seg-btn${sel === "all" ? " active" : ""}`} onClick={() => setSel("all")} title="Somar todos os dias">
              <span className="seg-label">Total</span>
            </button>
          </div>
        </div>
      )}
      {cur.pending > 0 && (
        <div className="notice notice-warn">
          ⚠ <strong>{cur.pending}</strong> {cur.pending === 1 ? "confronto sem resultado publicado" : "confrontos sem resultado publicado"}
          {data.pendingNote ? <> — {data.pendingNote}</> : null}
        </div>
      )}
      <div className="tps-wrap">
        <table className="sc-lb sc-lb-airy tps-table">
          <thead>
            <tr>
              <SortableHdr k="pos" {...hp} title="Lugar pelos pontos desta vista">#</SortableHdr>
              <SortableHdr k="name" {...hp} className="ta-left">Equipa</SortableHdr>
              {data.categories.map(c => <SortableHdr key={c.key} k={`c:${c.key}`} {...hp}>{c.label}</SortableHdr>)}
              <SortableHdr k="total" {...hp}>Total</SortableHdr>
              {showOfficial && <SortableHdr k="official" {...hp} title="Classificação final publicada pela organização">Classif. oficial</SortableHdr>}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const isOpen = open === r.key;
              const opps = data.teams
                .filter(t => t.key !== r.key)
                .map(t => ({ key: t.key, label: t.shortName ?? t.name }));
              return (
                <Fragment key={r.key}>
                  <tr className={`tps-row${isOpen ? " tps-open" : ""}${data.highlight?.includes(r.key) ? " row-manuel" : ""}`}
                    onClick={() => setOpen(isOpen ? null : r.key)} title="Ver os jogadores e os confrontos">
                    <td className="lb-pos">{r.pos}</td>
                    <td className="tps-team fw-700">{r.name} <span className="c-muted">{isOpen ? "▴" : "▾"}</span></td>
                    {data.categories.map(c => {
                      const v = r.cats[c.key];
                      return v == null
                        ? <td key={c.key} className="c-muted" title="Não joga esta categoria">—</td>
                        : <td key={c.key}>{fmtPoints(v)}</td>;
                    })}
                    <td className="tps-total">{fmtPoints(r.total)}</td>
                    {showOfficial && <td>{r.official != null ? `${r.official}º` : "—"}</td>}
                  </tr>
                  {isOpen && (
                    <tr className="row-expanded">
                      <td colSpan={nCols} className="tps-detail">
                        <TeamPlayers rows={cur.players[r.key] ?? []} opps={opps} catLabel={catLabel} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
