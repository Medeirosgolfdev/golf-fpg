/**
 * RecentTournamentsPage.tsx — Torneios recentes reconstruídos a partir dos nossos
 *
 * Rota: /torneios-recentes  (e /torneios-recentes/:key para o detalhe em janela própria)
 * FORA da NavBar (acesso por link directo).
 *
 * Ideia: muitos torneios recentes NÃO têm leaderboard scrapeada, mas os
 * "nossos" jogadores jogaram-nos — e cada volta WHS deles traz o scorecard.
 * Agregando por torneio (ccode|tcode) sabemos "quem dos nossos jogou + a
 * pontuação". Torneios com MUITOS dos nossos são bons candidatos a scrapear
 * a sério para ter o quadro completo.
 *
 * Fonte: public/data/recent-tournaments.json (gerado por
 * scripts/build-recent-tournaments.js, formato "fpg-pull").
 *
 * Reutiliza os componentes existentes:
 *   - Tabela sortável (useSort + SortableHdr, estilo `player-list-table`)
 *   - <TournamentDetail> da FPGPage para o detalhe (tabs de ronda + Resumo +
 *     Scorecards buraco-a-buraco) — coerência visual total.
 *
 * Interacção (pedido da utilizadora):
 *   - Torneios com < 10 nossos → detalhe EXPANDE para baixo, inline na tabela.
 *   - Torneios com ≥ 10 nossos → abrem em JANELA NOVA (/torneios-recentes/:key).
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Tournament } from "../data/fpgTypes";
import type { PlayersDB } from "../ui/tournamentPrimitives";
import type { EscLookup } from "../utils/playerUtils";
import { cachedFetchJson } from "../data/fetchCache";
import { loadPlayers } from "../data/loader";
import { buildEscLookup, normalizePlayer } from "../utils/playerUtils";
import { norm, fmtDate, fpgScoringUrl } from "../utils/format";
import { useSort } from "../hooks/useSort";
import SortableHdr from "../ui/SortableHdr";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../ui/Toolbar";
import LoadingState from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import { TournamentDetail } from "./fpg/TournamentDetail";

/* ── tipos do JSON ────────────────────────────────────────────── */
interface RecentTournament extends Tournament {
  scraped: boolean;
  nOurs: number;
  dateSort: number;
}
interface RecentDoc {
  generated: string;
  since: string;
  counts: { playersScanned: number; tournaments: number; scraped: number; unscraped: number };
  tournaments: RecentTournament[];
}

/** ≥ este nº de nossos → abre em janela nova; abaixo → expande inline. */
const NEW_WINDOW_THRESHOLD = 10;

/* Chave URL: ccode pode ser vazio (Drive) → usar "_" como separador. */
const tKey = (t: { ccode?: string; tcode: string }) => `${t.ccode ?? ""}_${t.tcode}`;

type SortKey = "date" | "name" | "campo" | "rounds" | "nOurs" | "scraped";

/* ── Bloco de detalhe partilhado (inline + janela própria) ────── */
function TournDetailBlock({ t, escLookup, playersDB }: {
  t: RecentTournament; escLookup: EscLookup; playersDB: PlayersDB;
}) {
  // Os links da Federação (Inscrições/Draw/Scoring ↗) já vêm do próprio
  // TournamentDetail (usa fpgScoringUrl etc.). Aqui só o link para a
  // leaderboard completa no NOSSO site, quando já scrapeada.
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "2px 0 4px" }}>
        <span style={{ fontSize: "var(--fs-12)", color: "var(--text-muted)" }}>
          {t.nOurs} dos nossos · {t.scraped ? "leaderboard completa scrapeada" : "só os nossos (por scrapear)"}
        </span>
        {t.scraped && t.ccode && (
          <a href={`/FPG/torneio/${t.ccode}-${t.tcode}`} target="_blank" rel="noopener noreferrer"
             className="btn-pill" style={{ fontSize: "var(--fs-12)" }}>
            ↗ Leaderboard completa no site
          </a>
        )}
      </div>
      <div style={{ padding: "0 0 4px", fontSize: "var(--fs-11)", color: "var(--text-muted)" }}>
        ⓘ Classificação e scorecards reconstruídos das voltas WHS dos jogadores que seguimos —
        a posição é <b>entre os nossos</b>, não a oficial do torneio.
      </div>
      <TournamentDetail tournament={t} escLookup={escLookup} playersDB={playersDB} />
    </div>
  );
}

export default function RecentTournamentsPage() {
  const { key } = useParams<{ key?: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<RecentDoc | null>(null);
  const [pdb, setPdb] = useState<PlayersDB>({});
  const [err, setErr] = useState<string | null>(null);
  /** Chave do torneio expandido inline (null = nenhum). */
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    cachedFetchJson<RecentDoc>("/data/recent-tournaments.json")
      .then(d => { if (!d) throw new Error("recent-tournaments.json vazio"); setDoc(d); })
      .catch(e => setErr(String(e?.message || e)));
    loadPlayers().then(p => setPdb(p as PlayersDB)).catch(() => setPdb({}));
  }, []);

  /* Normalizar players (restaura scores flat a partir de roundScores[0]). */
  const tournaments = useMemo<RecentTournament[]>(() => {
    if (!doc) return [];
    return doc.tournaments.map(t => ({
      ...t,
      players: (t.players || []).map(normalizePlayer),
    }));
  }, [doc]);

  const escLookup = useMemo(() => buildEscLookup(pdb as any, tournaments as any), [pdb, tournaments]);

  /* ── Filtros da lista ───────────────────────────────────────── */
  const [q, setQ] = useState("");
  const [minOurs, setMinOurs] = useState("");
  const [estado, setEstado] = useState<"ALL" | "UNSCRAPED" | "SCRAPED">("ALL");
  const [year, setYear] = useState("ALL");

  const years = useMemo(() => {
    const s = new Set<string>();
    for (const t of tournaments) { const y = (t.date || "").slice(0, 4); if (/^\d{4}$/.test(y)) s.add(y); }
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [tournaments]);

  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("date", "desc", {
    date: "desc", nOurs: "desc", rounds: "desc",
  });

  const filtered = useMemo(() => {
    const qn = norm(q.trim());
    const words = qn ? qn.split(/\s+/).filter(Boolean) : [];
    const mo = minOurs === "" ? 0 : Number(minOurs);
    return tournaments.filter(t => {
      if (words.length) {
        const hay = norm(`${t.name} ${t.campo}`);
        if (!words.every(w => hay.includes(w))) return false;
      }
      if (t.nOurs < mo) return false;
      if (estado === "UNSCRAPED" && t.scraped) return false;
      if (estado === "SCRAPED" && !t.scraped) return false;
      if (year !== "ALL" && (t.date || "").slice(0, 4) !== year) return false;
      return true;
    });
  }, [tournaments, q, minOurs, estado, year]);

  const sorted = useMemo(() => {
    const arr = filtered.slice();
    const dir = sortDir === "asc" ? 1 : -1;
    const str = (v: string) => (v || "").toLocaleLowerCase("pt-PT");
    arr.sort((a, b) => {
      switch (sortKey) {
        case "date":    return ((a.dateSort || 0) - (b.dateSort || 0)) * dir;
        case "name":    return str(a.name).localeCompare(str(b.name), "pt") * dir;
        case "campo":   return str(a.campo).localeCompare(str(b.campo), "pt") * dir;
        case "rounds":  return ((a.rounds || 1) - (b.rounds || 1)) * dir;
        case "nOurs":   return (a.nOurs - b.nOurs) * dir;
        case "scraped": return ((a.scraped ? 1 : 0) - (b.scraped ? 1 : 0)) * dir;
        default:        return 0;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  /* ── Detalhe em janela própria (rota /:key) ─────────────────── */
  const selected = useMemo(() => {
    if (!key) return null;
    return tournaments.find(t => tKey(t) === key) || null;
  }, [key, tournaments]);

  /* ── Render ─────────────────────────────────────────────────── */
  if (err) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Torneios recentes</h2>
        <EmptyState size="md" message={`Erro ao carregar: ${err}`} />
      </div>
    );
  }
  if (!doc) return <LoadingState size="md" message="A carregar torneios recentes…" />;

  /* Detalhe em janela própria (torneios grandes, ≥ NEW_WINDOW_THRESHOLD). */
  if (key) {
    if (!selected) {
      return (
        <div style={{ padding: 24 }}>
          <button className="btn-pill" onClick={() => navigate("/torneios-recentes")}>← Voltar à lista</button>
          <EmptyState size="md" message="Torneio não encontrado." />
        </div>
      );
    }
    return (
      <div style={{ padding: "8px 12px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <button className="btn-pill" onClick={() => navigate("/torneios-recentes")}>← Voltar à lista</button>
          <strong style={{ fontSize: "var(--fs-14)" }}>{selected.name}</strong>
          <span style={{ fontSize: "var(--fs-12)", color: "var(--text-muted)" }}>{fmtDate(selected.date)}{selected.campo ? ` · ${selected.campo}` : ""}</span>
        </div>
        <TournDetailBlock t={selected} escLookup={escLookup} playersDB={pdb} />
      </div>
    );
  }

  /* ── Lista (tabela sortável) ────────────────────────────────── */
  const onRowClick = (t: RecentTournament) => {
    if (t.nOurs >= NEW_WINDOW_THRESHOLD) {
      window.open(`/torneios-recentes/${tKey(t)}`, "_blank", "noopener,noreferrer");
    } else {
      setExpanded(prev => (prev === tKey(t) ? null : tKey(t)));
    }
  };

  return (
    <div style={{ padding: "8px 12px 24px" }}>
      <Toolbar>
        <ToolbarTitle>🏌️ Torneios recentes (via os nossos)</ToolbarTitle>
        <ToolbarMeta>
          {sorted.length.toLocaleString("pt-PT")} de {tournaments.length.toLocaleString("pt-PT")}
          {" · "}{doc.counts.unscraped.toLocaleString("pt-PT")} por scrapear
        </ToolbarMeta>
        <ToolbarSep />
        <span style={{ marginLeft: "auto", fontSize: "var(--fs-11)", color: "var(--text-muted)" }}>
          Reconstruído de {doc.counts.playersScanned} jogadores · desde {doc.since}
        </span>
      </Toolbar>

      <div style={{ padding: "4px 8px 6px", fontSize: "var(--fs-12)", color: "var(--text-muted)" }}>
        Lista dos últimos torneios em que os nossos jogadores participaram. Torneios com <b>muitos</b> dos
        nossos são os melhores candidatos a scrapear a sério. Clica numa linha: até {NEW_WINDOW_THRESHOLD - 1} nossos
        abre <b>aqui em baixo</b>; a partir de {NEW_WINDOW_THRESHOLD} abre em <b>janela nova</b>.
      </div>

      {/* Filtros */}
      <div className="filter-grid">
        <div className="filter-field">
          <div className="filter-label">TORNEIO / CAMPO</div>
          <input className="filter-input" value={q} onChange={e => setQ(e.target.value)}
                 placeholder="Pesquisar por nome ou campo…" />
        </div>
        <div className="filter-field">
          <div className="filter-label">MÍN. Nº NOSSOS</div>
          <input type="number" min="1" className="filter-input" value={minOurs}
                 onChange={e => setMinOurs(e.target.value)} placeholder="ex: 5" />
        </div>
        <div className="filter-field">
          <div className="filter-label">ESTADO</div>
          <select className="filter-input" value={estado} onChange={e => setEstado(e.target.value as typeof estado)}>
            <option value="ALL">Todos</option>
            <option value="UNSCRAPED">Só por scrapear</option>
            <option value="SCRAPED">Só já scrapeados</option>
          </select>
        </div>
        <div className="filter-field">
          <div className="filter-label">ANO</div>
          <select className="filter-input" value={year} onChange={e => setYear(e.target.value)}>
            <option value="ALL">Todos</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState size="md" message="Nenhum torneio corresponde aos filtros." />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="player-list-table" style={{ width: "100%", fontSize: "var(--fs-12)" }}>
            <thead>
              <tr>
                <th className="tight" title="Abrir detalhe" style={{ width: 24 }}></th>
                <SortableHdr k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Data</SortableHdr>
                <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Torneio</SortableHdr>
                <SortableHdr k="campo" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Campo</SortableHdr>
                <SortableHdr k="rounds" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Rondas capturadas">R</SortableHdr>
                <SortableHdr k="nOurs" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Quantos dos nossos jogaram">👥 Nossos</SortableHdr>
                <SortableHdr k="scraped" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight" title="Já existe leaderboard completa?">Estado</SortableHdr>
                <th className="tight" title="Página oficial da Federação">FPG</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => {
                const k = tKey(t);
                const isExpanded = expanded === k;
                const newWindow = t.nOurs >= NEW_WINDOW_THRESHOLD;
                const fpgUrl = t.ccode ? fpgScoringUrl(t.ccode, t.tcode) : null;
                return (
                  <Fragment key={k}>
                    <tr
                        className={"player-list-row" + (isExpanded ? " row-selected" : "")}
                        style={{ cursor: "pointer" }}
                        onClick={() => onRowClick(t)}
                        title={newWindow ? "Abrir em janela nova (muitos nossos)" : "Expandir aqui em baixo"}>
                      <td style={{ textAlign: "center", color: "var(--text-muted)" }}>
                        {newWindow ? "↗" : (isExpanded ? "▾" : "▸")}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtDate(t.date)}</td>
                      <td style={{ fontWeight: 500 }}>{t.name}</td>
                      <td style={{ color: "var(--text-2)" }}>{t.campo || "—"}</td>
                      <td style={{ textAlign: "right" }}>{t.rounds || 1}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{t.nOurs}</td>
                      <td>
                        {t.scraped
                          ? <span className="p p-sm p-muted" title="Leaderboard completa já scrapeada">✓ scrapeado</span>
                          : <span className="p p-sm" style={{ background: "var(--color-warn, #b45309)", color: "#fff" }} title="Só temos os nossos — candidato a scrapear">por scrapear</span>}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {fpgUrl
                          ? <a href={fpgUrl} target="_blank" rel="noopener noreferrer"
                               onClick={e => e.stopPropagation()} title="Classificação oficial na Federação (scoring.fpg.pt)"
                               style={{ textDecoration: "none" }}>↗</a>
                          : <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="row-expanded">
                        <td colSpan={8} style={{ background: "var(--bg-card)", padding: "6px 12px 12px" }}>
                          <TournDetailBlock t={t} escLookup={escLookup} playersDB={pdb} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
