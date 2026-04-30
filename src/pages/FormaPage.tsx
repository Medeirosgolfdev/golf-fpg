/**
 * FormaPage.tsx
 *
 * Tabela de forma dos inscritos no Campeonato Nacional 2026 — Aroeira.
 * Lê public/data/nacional-2026-forma.json (gerado por scripts/build-forma-data.js)
 * e mostra últimos 10 SD por jogador, com heatmap relativo ao próprio jogador
 * e indicador de tendência (média recentes vs antigos).
 */

import { useEffect, useMemo, useState } from "react";
import { cachedFetchJson } from "../data/fetchCache";
import { useSort } from "../hooks/useSort";
import SortableHdr from "../ui/SortableHdr";
import SexBadge from "../ui/SexBadge";

// ── Tipos ──────────────────────────────────────────────────────────

type Round = {
  sgd: number | null;
  date: string;
  tourn: string;
  holes: number;
  hcp: number | null;
};

type Row = {
  fed: string;
  name: string;
  escalao: string;
  sex: "M" | "F" | string;
  hcp: number | null;
  escIns: string;
  totalRounds: number;
  last10: Round[];
};

type FormaData = {
  generatedAt: string;
  tournament: string;
  totalInscritos: number;
  withWhsData: number;
  rows: Row[];
};

type SortKey = "name" | "hcp" | "avg" | "delta" | "totalRounds";

// ── Helpers ────────────────────────────────────────────────────────

const ESC_ORDER = ["Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18", "Sub-21", "Absoluto", "Outros"];

function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function deltaForRow(r: Row): number | null {
  const sgds = r.last10.map((x) => x.sgd).filter((x): x is number => x != null);
  const recent = sgds.slice(0, 3);
  const older = sgds.slice(3);
  const ar = avg(recent);
  const ao = avg(older);
  return ar != null && ao != null ? ar - ao : null;
}

function avgForRow(r: Row): number | null {
  const sgds = r.last10.map((x) => x.sgd).filter((x): x is number => x != null);
  return avg(sgds);
}

// Heat-map class por célula, relativa ao próprio jogador
function cellClass(sd: number | null, allSds: number[]): string {
  if (sd == null) return "";
  if (allSds.length < 3) return "sd-mid";
  const sorted = [...allSds].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const range = sorted[sorted.length - 1] - sorted[0] || 1;
  const z = (sd - median) / range;
  if (z < -0.25) return "sd-best";
  if (z < -0.05) return "sd-good";
  if (z > 0.25) return "sd-worst";
  if (z > 0.05) return "sd-bad";
  return "sd-mid";
}

function fmt(x: number | null, dp = 1): string {
  return x == null ? "—" : x.toFixed(dp);
}

function escIdx(esc: string): number {
  const i = ESC_ORDER.indexOf(esc);
  return i < 0 ? 99 : i;
}

// ── Componente ─────────────────────────────────────────────────────

export default function FormaPage() {
  const [data, setData] = useState<FormaData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filterEsc, setFilterEsc] = useState<string>("all");
  const [filterSex, setFilterSex] = useState<"all" | "M" | "F">("all");
  const [search, setSearch] = useState("");

  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("hcp", "asc", {
    name: "asc", hcp: "asc", avg: "asc", delta: "asc", totalRounds: "desc",
  });

  useEffect(() => {
    cachedFetchJson<FormaData>("/data/nacional-2026-forma.json")
      .then((d) => {
        if (!d) setErr("Ficheiro nacional-2026-forma.json não encontrado em public/data/. Correr `node scripts/build-forma-data.js`.");
        else setData(d);
      })
      .catch((e) => setErr(String(e?.message || e)));
  }, []);

  const enriched = useMemo(() => {
    if (!data) return [];
    return data.rows.map((r) => ({
      ...r,
      avg: avgForRow(r),
      delta: deltaForRow(r),
    }));
  }, [data]);

  const escaloes = useMemo(() => {
    const set = new Set<string>();
    enriched.forEach((r) => set.add(r.escalao));
    return [...set].sort((a, b) => escIdx(a) - escIdx(b));
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((r) => {
      if (filterEsc !== "all" && r.escalao !== filterEsc) return false;
      if (filterSex !== "all" && r.sex !== filterSex) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enriched, filterEsc, filterSex, search]);

  // Sort: dentro do mesmo escalão, ordena pela coluna escolhida
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: typeof enriched[number], b: typeof enriched[number]): number => {
      // Se filtro de escalão activo, ordena directo. Senão, agrupa por escalão.
      if (filterEsc === "all") {
        const ie = escIdx(a.escalao) - escIdx(b.escalao);
        if (ie !== 0) return ie;
      }
      const get = (r: typeof a) => {
        switch (sortKey) {
          case "name": return r.name.toLowerCase();
          case "hcp": return r.hcp ?? 9999;
          case "avg": return r.avg ?? 9999;
          case "delta": return r.delta ?? 9999;
          case "totalRounds": return r.totalRounds;
        }
      };
      const va = get(a), vb = get(b);
      if (typeof va === "string") return va.localeCompare(vb as string) * dir;
      return ((va as number) - (vb as number)) * dir;
    };
    return [...filtered].sort(cmp);
  }, [filtered, sortKey, sortDir, filterEsc]);

  // ── Render ──
  if (err) {
    return (
      <div className="forma-page">
        <h2 className="forma-h">Forma dos inscritos no Nacional 2026</h2>
        <div className="forma-err">{err}</div>
      </div>
    );
  }
  if (!data) {
    return <div className="forma-page"><div className="forma-loading">A carregar…</div></div>;
  }

  // Group by escalão para os headers, só quando NÃO há filtro de escalão activo
  const showEscHeaders = filterEsc === "all" && sortKey === "hcp";
  let lastEsc = "";

  return (
    <div className="forma-page">
      <style>{`
        .forma-page { padding: 12px 16px; font-size: 13px; }
        .forma-h { font-size: 18px; margin: 4px 0 8px; }
        .forma-sub { color: var(--muted, #6b7280); font-size: 12px; margin-bottom: 12px; }
        .forma-toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin: 10px 0 14px; padding: 10px 12px; background: var(--bg-2, #f9fafb); border: 1px solid var(--border, #e5e7eb); border-radius: 8px; }
        .forma-toolbar label { display: flex; align-items: center; gap: 6px; font-size: 12px; }
        .forma-toolbar select, .forma-toolbar input { padding: 4px 8px; border: 1px solid var(--border, #d1d5db); border-radius: 4px; font-size: 12px; background: white; }
        .forma-toolbar input { min-width: 200px; }
        .forma-kpi { display: inline-flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
        .forma-kpi > div { background: white; padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border, #e5e7eb); font-size: 11px; }
        .forma-kpi b { font-size: 13px; color: #15803d; }
        .forma-legend { display: flex; gap: 8px; align-items: center; font-size: 11px; flex-wrap: wrap; margin-bottom: 8px; }
        .forma-legend span { padding: 2px 8px; border-radius: 3px; }
        .forma-table { border-collapse: collapse; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.06); width: max-content; }
        .forma-table th, .forma-table td { padding: 4px 6px; border-bottom: 1px solid var(--border, #e5e7eb); text-align: center; white-space: nowrap; }
        .forma-table th { background: var(--hdr, #f3f4f6); font-weight: 600; position: sticky; top: 0; z-index: 5; font-size: 11px; }
        .forma-table th.sd-h { min-width: 36px; }
        .forma-table td.nm { text-align: left; font-weight: 500; min-width: 200px; }
        .forma-table td.nm a { color: inherit; text-decoration: none; }
        .forma-table td.nm a:hover { text-decoration: underline; color: #1d4ed8; }
        .forma-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .forma-table td.bold { font-weight: 600; }
        .forma-table td.esc-ins { font-size: 10px; color: var(--muted, #6b7280); text-align: left; }
        .forma-table tr.hdr-esc td { background: #1f2937; color: white; font-size: 13px; font-weight: 600; padding: 6px 10px; text-align: left; }
        .forma-table tr.hdr-esc .cnt { color: #9ca3af; font-weight: 400; margin-left: 6px; }
        .forma-table .sd-best  { background: #15803d; color: white; font-weight: 700; }
        .forma-table .sd-good  { background: #86efac; }
        .forma-table .sd-mid   { background: #f5f5f5; }
        .forma-table .sd-bad   { background: #fca5a5; }
        .forma-table .sd-worst { background: #b91c1c; color: white; font-weight: 700; }
        .forma-table .dg { color: #15803d; font-weight: 600; }
        .forma-table .dr { color: #b91c1c; font-weight: 600; }
        .forma-table .dn { color: var(--muted, #9ca3af); }
        .forma-loading, .forma-err { padding: 20px; color: var(--muted, #6b7280); }
        .forma-err { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; }
        .forma-note { background: #fef3c7; border: 1px solid #fcd34d; padding: 6px 10px; border-radius: 4px; font-size: 11px; color: #78350f; margin-bottom: 8px; }
        .forma-table-wrap { overflow-x: auto; max-width: 100%; }
      `}</style>

      <h2 className="forma-h">📈 Forma — Campeonato Nacional 2026 (Aroeira)</h2>
      <div className="forma-sub">Últimos 10 SD (Score Differential) por jogador, do mais recente (esquerda) ao mais antigo (direita). Valor mais baixo = melhor.</div>

      <div className="forma-kpi">
        <div>Total inscritos: <b>{data.totalInscritos}</b></div>
        <div>Com dados WHS: <b>{data.withWhsData}</b></div>
        <div>Sem dados: <b style={{ color: data.totalInscritos - data.withWhsData > 0 ? "#b91c1c" : "#15803d" }}>{data.totalInscritos - data.withWhsData}</b></div>
        <div>A mostrar: <b>{sorted.length}</b></div>
      </div>

      <div className="forma-legend">
        Cor da célula (relativa ao próprio jogador):
        <span className="sd-best">Melhor</span>
        <span className="sd-good">Bom</span>
        <span className="sd-mid">Médio</span>
        <span className="sd-bad">Mau</span>
        <span className="sd-worst">Pior</span>
        <span style={{ background: "none", paddingLeft: 12 }}>|</span>
        <span className="dg">↓ a melhorar</span>
        <span className="dr">↑ a piorar</span>
      </div>

      <div className="forma-note">"Tend." = média dos 3 SDs mais recentes menos média dos restantes 7. Negativo (verde) = boa fase. Positivo (vermelho) = má fase.</div>

      <div className="forma-toolbar">
        <label>
          Escalão:
          <select value={filterEsc} onChange={(e) => setFilterEsc(e.target.value)}>
            <option value="all">Todos</option>
            {escaloes.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label>
          Sexo:
          <select value={filterSex} onChange={(e) => setFilterSex(e.target.value as "all" | "M" | "F")}>
            <option value="all">Todos</option>
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
          </select>
        </label>
        <label>
          <input
            type="search"
            placeholder="Procurar nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <span style={{ marginLeft: "auto", color: "var(--muted, #6b7280)", fontSize: 11 }}>
          Gerado: {data.generatedAt.slice(0, 16).replace("T", " ")}
        </span>
      </div>

      <div className="forma-table-wrap">
      <table className="forma-table">
        <thead>
          <tr>
            <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)}>Jogador</SortableHdr>
            <th>Sx</th>
            <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)}>HCP</SortableHdr>
            <th>Escalão Inscr.</th>
            {Array.from({ length: 10 }, (_, i) => <th key={i} className="sd-h">SD {i + 1}</th>)}
            <SortableHdr k="avg" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)}>Média 10</SortableHdr>
            <SortableHdr k="delta" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)}>Tend.</SortableHdr>
            <SortableHdr k="totalRounds" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)}>Rondas</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const sgds = r.last10.map((x) => x.sgd).filter((x): x is number => x != null);
            let header: import("react").ReactElement | null = null;
            if (showEscHeaders && r.escalao !== lastEsc) {
              lastEsc = r.escalao;
              const cnt = sorted.filter((x) => x.escalao === r.escalao).length;
              header = (
                <tr key={`hdr-${r.escalao}`} className="hdr-esc">
                  <td colSpan={17}>{r.escalao} <span className="cnt">({cnt})</span></td>
                </tr>
              );
            }
            const cells: import("react").ReactElement[] = [];
            for (let i = 0; i < 10; i++) {
              const x = r.last10[i];
              if (!x) cells.push(<td key={i}></td>);
              else {
                const cls = cellClass(x.sgd, sgds);
                const tip = `${x.date} — ${x.tourn} — ${x.holes}H — HCP ${fmt(x.hcp)}`;
                cells.push(<td key={i} className={cls} title={tip}>{fmt(x.sgd)}</td>);
              }
            }
            const deltaEl = r.delta == null
              ? <span className="dn">—</span>
              : Math.abs(r.delta) < 0.5
              ? <span className="dn">{r.delta >= 0 ? "+" : ""}{r.delta.toFixed(1)}</span>
              : r.delta < 0
              ? <span className="dg">↓ {Math.abs(r.delta).toFixed(1)}</span>
              : <span className="dr">↑ {r.delta.toFixed(1)}</span>;
            return (
              <>
                {header}
                <tr key={r.fed}>
                  <td className="nm">
                    <a href={`https://my.fpg.pt/Home/PlayerWHS.aspx?no=${r.fed}`} target="_blank" rel="noopener noreferrer" title={`Fed ${r.fed}`}>
                      {r.name}
                    </a>
                  </td>
                  <td><SexBadge sex={r.sex} /></td>
                  <td className="num">{fmt(r.hcp)}</td>
                  <td className="esc-ins">{r.escIns}</td>
                  {cells}
                  <td className="num bold">{fmt(r.avg)}</td>
                  <td>{deltaEl}</td>
                  <td className="num">{r.totalRounds}</td>
                </tr>
              </>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
