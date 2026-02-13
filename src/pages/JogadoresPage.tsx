import { useCallback, useEffect, useMemo, useState } from "react";
import type { Player, PlayersDb } from "../data/types";
import { norm } from "../utils/format";

type Props = { players: PlayersDb };

type SexFilter = "ALL" | "M" | "F";
type SortKey = "name" | "hcp" | "club" | "escalao";

/* ─── Helpers ─── */

function clubShort(p: Player): string {
  if (typeof p.club === "object" && p.club) return p.club.short || p.club.long || "";
  return String(p.club || "");
}

function clubLong(p: Player): string {
  if (typeof p.club === "object" && p.club) return p.club.long || p.club.short || "";
  return String(p.club || "");
}

function hcpDisplay(hcp: number | null | undefined): string {
  if (hcp === null || hcp === undefined) return "—";
  return hcp.toFixed(1).replace(".", ",");
}

/* ─── Página Jogadores (master-detail) ─── */

export default function JogadoresPage({ players }: Props) {
  const [q, setQ] = useState("");
  const [sexFilter, setSexFilter] = useState<SexFilter>("ALL");
  const [escalaoFilter, setEscalaoFilter] = useState<string>("ALL");
  const [regionFilter, setRegionFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [selectedFed, setSelectedFed] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* Converter DB em array */
  const allPlayers = useMemo(() => {
    return Object.entries(players).map(([fed, p]) => ({ fed, ...p }));
  }, [players]);

  /* Escalões e regiões únicos */
  const escaloes = useMemo(() => {
    const set = new Set<string>();
    allPlayers.forEach((p) => p.escalao && set.add(p.escalao));
    return [...set].sort((a, b) => a.localeCompare(b, "pt"));
  }, [allPlayers]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    allPlayers.forEach((p) => p.region && set.add(p.region));
    return [...set].sort((a, b) => a.localeCompare(b, "pt"));
  }, [allPlayers]);

  /* Filtrar e ordenar */
  const filtered = useMemo(() => {
    const qq = norm(q);
    let list = allPlayers;

    if (qq) {
      const words = qq.split(/\s+/).filter(Boolean);
      list = list.filter((p) => {
        const haystack = norm(
          [p.name, clubShort(p), p.escalao, p.fed, p.region].join(" ")
        );
        return words.every((w) => haystack.includes(w));
      });
    }

    if (sexFilter !== "ALL") {
      list = list.filter((p) => p.sex === sexFilter);
    }
    if (escalaoFilter !== "ALL") {
      list = list.filter((p) => p.escalao === escalaoFilter);
    }
    if (regionFilter !== "ALL") {
      list = list.filter((p) => p.region === regionFilter);
    }

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name, "pt");
        case "hcp":
          return (a.hcp ?? 999) - (b.hcp ?? 999);
        case "club":
          return clubShort(a).localeCompare(clubShort(b), "pt");
        case "escalao":
          return a.escalao.localeCompare(b.escalao, "pt");
        default:
          return 0;
      }
    });

    return list;
  }, [allPlayers, q, sexFilter, escalaoFilter, regionFilter, sortKey]);

  /* Auto-selecionar primeiro se nada selecionado */
  useEffect(() => {
    if (!selectedFed && filtered.length > 0) {
      setSelectedFed(filtered[0].fed);
    }
  }, [filtered, selectedFed]);

  /* Jogador selecionado */
  const selected = useMemo(() => {
    if (!selectedFed) return null;
    return allPlayers.find((p) => p.fed === selectedFed) ?? null;
  }, [allPlayers, selectedFed]);

  const iframeSrc = selected ? `/${selected.fed}/analysis/by-course-ui.html` : "";

  /* Esconder header duplicado e harmonizar visual com Campos */
  const onIframeLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const doc = e.currentTarget.contentDocument;
      if (!doc) return;
      const style = doc.createElement("style");
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');

        /* ── Esconder header duplicado ── */
        header > .hd-card { display: none !important; }
        header { padding-top: 0 !important; border-bottom-color: #d5dac9 !important; }

        /* ── Variáveis do design system Golf Portugal ── */
        :root {
          --bg: #f7f8f6 !important;
          --fg: #1c2617 !important;
          --muted: #7a8a6e !important;
          --line: #d5dac9 !important;
          --chip: #e0efdb !important;
          --head: #eef2e8 !important;
          --accent: #2d6a30 !important;
        }

        /* ── Tipografia ── */
        body {
          font-family: 'DM Sans', system-ui, -apple-system, sans-serif !important;
          background: #f7f8f6 !important;
          color: #1c2617 !important;
        }

        /* ── Inputs e controlos ── */
        input, select {
          border-color: #d5dac9 !important;
          border-radius: 6px !important;
          font-family: 'DM Sans', system-ui, sans-serif !important;
          background: #f7f8f6 !important;
        }
        input:focus, select:focus {
          border-color: #2d6a30 !important;
          box-shadow: 0 0 0 2px #e0efdb !important;
          outline: none !important;
        }

        /* ── Cards ── */
        .card {
          border-color: #d5dac9 !important;
          border-radius: 10px !important;
        }

        /* ── Toolbar ── */
        .toolbar {
          background: #eef2e8 !important;
          border-bottom-color: #d5dac9 !important;
        }

        /* ── Pills ── */
        .pill {
          background: #e0efdb !important;
          border-color: #d5dac9 !important;
          color: #4a5940 !important;
        }

        /* ── Tabelas ── */
        th {
          background: #eef2e8 !important;
          color: #4a5940 !important;
          border-bottom-color: #bcc5ad !important;
          font-family: 'DM Sans', sans-serif !important;
        }
        td {
          border-bottom-color: #e8ebdf !important;
        }
        tr:hover { background: #f0f2ec !important; }

        /* ── Count badge ── */
        .count {
          background: #2d6a30 !important;
          border-radius: 6px !important;
        }

        /* ── Links ── */
        .courseBtn { color: #2d6a30 !important; }

        /* ── Inner tables ── */
        .innerTable { border-color: #d5dac9 !important; border-radius: 10px !important; }
        .innerTable th { background: #eef2e8 !important; color: #4a5940 !important; border-bottom-color: #bcc5ad !important; }

        /* ── Scorecard modern ── */
        .sc-modern { border-radius: 10px !important; box-shadow: 0 2px 8px rgba(30,50,20,.08) !important; }
        .sc-table-modern th { background: #eef2e8 !important; color: #4a5940 !important; }
        .sc-table-modern .hole-header { background: #eef2e8 !important; color: #4a5940 !important; }
        .sc-table-modern .col-out, .sc-table-modern .col-in { background: #f0f2ec !important; }
        .sc-table-modern .col-total { background: #e0efdb !important; }
        .sc-table-modern th, .sc-table-modern td { border-color: #d5dac9 !important; }
        .sc-footer { background: #eef2e8 !important; border-top-color: #d5dac9 !important; }
        .sc-footer-value { color: #1c2617 !important; }
        .sc-bar-head { background: #eef2e8 !important; color: #4a5940 !important; border-bottom-color: #bcc5ad !important; }

        /* ── Botões ── */
        .btn {
          border-color: #d5dac9 !important;
          border-radius: 6px !important;
          font-family: 'DM Sans', sans-serif !important;
        }
        .btn:hover { background: #f0f2ec !important; }
        .btnGhost { background: #e0efdb !important; }
        .btnPrint {
          background: #e0efdb !important;
          border-color: #2d6a30 !important;
          color: #1e4d20 !important;
        }
        .btnPrint:hover { background: #d0e5c8 !important; }

        /* ── Ecletico ── */
        .ecPill { border-color: #d5dac9 !important; border-radius: 6px !important; }
        .ecPill:hover { background: #f0f2ec !important; }
        .ecPill.active { outline-color: #2d6a30 !important; }
        .ecDetailCard { border-color: #d5dac9 !important; border-radius: 10px !important; }
        .ecDetailHead { background: #eef2e8 !important; color: #4a5940 !important; border-bottom-color: #bcc5ad !important; }

        /* ── Analysis cards ── */
        .an-card { border-color: #d5dac9 !important; border-radius: 10px !important; }
        .an-table th { background: #eef2e8 !important; color: #4a5940 !important; border-bottom-color: #bcc5ad !important; }
        .courseAnalysis { border-color: #d5dac9 !important; border-radius: 10px !important; background: #fafbf9 !important; }
        .holeAnalysis { border-color: #d5dac9 !important; border-radius: 10px !important; }
        .haDiagCard { border-color: #d5dac9 !important; border-radius: 10px !important; }
        .haParCard { border-color: #d5dac9 !important; border-radius: 10px !important; }
        .caKpi { border-color: #d5dac9 !important; border-radius: 10px !important; }

        /* ── Monospace numbers ── */
        .sc-stat-value, .sc-score, .sc-topar,
        .an-k-val, .caKpiVal, .haDiagVal, .haParAvg {
          font-family: 'JetBrains Mono', monospace !important;
        }

        /* ── Group rows ── */
        .grpRow td { background: #f0f2ec !important; border-bottom-color: #d5dac9 !important; }

        /* ── Scrollbar ── */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d5dac9; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #7a8a6e; }
      `;
      doc.head.appendChild(style);
    } catch { /* cross-origin — ignora */ }
  }, []);

  return (
    <div className="jogadores-page">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Fechar painel" : "Abrir painel"}
          >
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <div className="field">
            <label>Pesquisa</label>
            <input
              className="input"
              value={q}
              onChange={(e) => { setQ(e.target.value); setSelectedFed(null); }}
              placeholder="Nome, clube, n.º federado…"
              style={{ width: 180 }}
            />
          </div>
          <div className="field">
            <label>Sexo</label>
            <select className="select" value={sexFilter} onChange={(e) => setSexFilter(e.target.value as SexFilter)}>
              <option value="ALL">Todos</option>
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
          </div>
          <div className="field">
            <label>Escalão</label>
            <select className="select" value={escalaoFilter} onChange={(e) => setEscalaoFilter(e.target.value)}>
              <option value="ALL">Todos</option>
              {escaloes.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Região</label>
            <select className="select" value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
              <option value="ALL">Todas</option>
              {regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Ordenar</label>
            <select className="select" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="name">Nome</option>
              <option value="hcp">Handicap</option>
              <option value="club">Clube</option>
              <option value="escalao">Escalão</option>
            </select>
          </div>
        </div>
        <div className="toolbar-right">
          <div className="chip">{filtered.length} jogadores</div>
        </div>
      </div>

      {/* Master-detail */}
      <div className="master-detail">
        {/* Lista de jogadores (sidebar) */}
        <div className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
          {filtered.map((p) => {
            const active = selected?.fed === p.fed;
            const club = clubShort(p);
            return (
              <button
                key={p.fed}
                className={`course-item ${active ? "active" : ""}`}
                onClick={() => setSelectedFed(p.fed)}
              >
                <div className="course-item-name">
                  {p.name}
                  <span className={`jog-sex-inline jog-sex-${p.sex}`}>{p.sex}</span>
                </div>
                <div className="course-item-meta">
                  {[club, p.escalao].filter(Boolean).join(" · ") || `#${p.fed}`}
                  {p.hcp != null && ` · HCP ${hcpDisplay(p.hcp)}`}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="muted" style={{ padding: 16 }}>Nenhum jogador encontrado</div>
          )}
        </div>

        {/* Detalhe */}
        <div className="course-detail jog-detail">
          {selected ? (
            <>
              <div className="detail-header">
                <div>
                  <h2 className="detail-title">{selected.name}</h2>
                  <div className="jog-pills">
                    <span className="jog-pill jog-pill-fed">#{selected.fed}</span>
                    {selected.hcp != null && (
                      <span className="jog-pill jog-pill-hcp">HCP {hcpDisplay(selected.hcp)}</span>
                    )}
                    <span className={`jog-pill jog-pill-sex-${selected.sex}`}>
                      {selected.sex === "M" ? "Masculino" : selected.sex === "F" ? "Feminino" : selected.sex}
                    </span>
                    {selected.dob && (
                      <span className="jog-pill jog-pill-birth">{selected.dob.slice(0, 4)}</span>
                    )}
                    {selected.escalao && (
                      <span className="jog-pill jog-pill-escalao">{selected.escalao}</span>
                    )}
                    {clubLong(selected) && (
                      <span className="jog-pill jog-pill-club">{clubLong(selected)}</span>
                    )}
                    {selected.region && (
                      <span className="jog-pill jog-pill-region">{selected.region}</span>
                    )}
                  </div>
                </div>
                <a
                  href={iframeSrc}
                  target="_blank"
                  rel="noreferrer"
                  className="detail-link"
                  style={{ flexShrink: 0 }}
                >
                  Abrir em nova janela ↗
                </a>
              </div>
              <div className="jog-iframe-wrap">
                <iframe
                  key={selected.fed}
                  src={iframeSrc}
                  className="jog-iframe"
                  title={`Scorecard de ${selected.name}`}
                  onLoad={onIframeLoad}
                />
              </div>
            </>
          ) : (
            <div className="muted" style={{ padding: 24 }}>Seleciona um jogador</div>
          )}
        </div>
      </div>
    </div>
  );
}
