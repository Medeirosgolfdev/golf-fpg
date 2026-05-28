/**
 * src/pages/DrawsPage.tsx
 *
 * Página dedicada de Draws/Pairings do Manuel — lista de jogadores com quem
 * já foi parelhado em torneios FPG e USKids, com cruzamento de scores.
 *
 * Vertentes (tabs):
 *   - FPG          → pairings de torneios portugueses (fpg-admissions-draws)
 *   - USKids       → pairings de torneios USKids (uskids-draws, 5 torneios)
 *   - Internacional → placeholder; a preencher manualmente a partir de fotografias
 *                     (WJGC/EOWAGR/Doral/England/Espanha/França não publicam pairings)
 *
 * Fonte de dados: public/data/manuel-pairings.json (gerado por
 * scripts/pairings-build.js — cruza FPG draws + USKids draws + overrides
 * manuais (Intl WJGC/Doral/EU WAGR e USKids IE) + sintetiza R3 pelo
 * acumulado quando o draw oficial não foi publicado).
 *
 * Display: 1 linha por jogador único (agregado por fed ou nome+país). Click
 * expande para ver cada ronda jogada em conjunto, com score do Manuel vs
 * score do companheiro nessa ronda.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSort } from "../hooks/useSort";
import SortableHdr from "../ui/SortableHdr";
import { FLAG } from "../utils/flagUtils";
import { norm } from "../utils/format";

// ── Tipos ─────────────────────────────────────────────────────────────

type Score = { gross: number; toPar: number | null } | null;

interface Companion {
  nome: string;
  fed: string | null;
  clube: string | null;
  pais: string | null;
  score: Score;
}

interface Round {
  circuito: "FPG" | "USKids" | "Intl";
  torneioId: string;
  torneioNome: string;
  data: string | null;
  ronda: number;
  teeTime: string | null;
  startHole: number | null;
  campo: string | null;
  manuelScore: Score;
  companheiros: Companion[];
}

interface CoverageBlock {
  rondasJogadas: number;
  rondasComDraw: number;
  torneiosJogados: number;
  torneiosComDraw: number;
  torneiosSemDraw?: string[];
}

interface PairingsFile {
  geradoEm: string;
  manuelFed: string;
  manuelUskidsIds: string[];
  totalRondas: number;
  totalCompanheirosUnicos: number;
  cobertura?: { fpg: CoverageBlock; uskids: CoverageBlock };
  rondas: Round[];
}

// Linha agregada da tabela principal (1 por companheiro único)
interface CompanionRow {
  key: string;
  nome: string;
  fed: string | null;
  clube: string | null;
  pais: string | null;
  vezes: number;
  ultimaData: string | null;
  primeiraData: string | null;
  circuitos: Set<"FPG" | "USKids" | "Intl">;
  rondas: Array<{
    data: string | null;
    torneioNome: string;
    torneioId: string;
    ronda: number;
    circuito: "FPG" | "USKids" | "Intl";
    manuelScore: Score;
    companheiroScore: Score;
  }>;
}

// Tabs do UI: FPG (portugueses) vs Intl (USKids + Bluegolf/GolfGenius/etc.)
type Tab = "FPG" | "Intl";
type SortKey = "nome" | "clube" | "vezes" | "ultima";

// Link externo para tee times num site que não expõe API (Bluegolf/GolfGenius)
interface IntlLink {
  circuito: string;
  torneioId: string;
  nome: string;
  url: string;
  ronda: number | string;
  fonte: string;
  notas?: string;
}
interface IntlLinksFile {
  ultimaAtualizacao?: string;
  links: IntlLink[];
}

// ── Helpers ───────────────────────────────────────────────────────────

function fmtToPar(v: number | null | undefined): string {
  if (v == null) return "";
  if (v === 0) return "E";
  return v > 0 ? `+${v}` : String(v);
}

function fmtScore(s: Score): string {
  if (!s) return "—";
  const tp = s.toPar != null ? ` (${fmtToPar(s.toPar)})` : "";
  return `${s.gross}${tp}`;
}

function tpColor(v: number | null | undefined): string {
  if (v == null) return "var(--text-muted, #888)";
  if (v < 0) return "var(--score-birdie, #dc2626)";
  if (v === 0) return "var(--text, #111)";
  return "var(--text-muted, #555)";
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return "—";
  // YYYY-MM-DD → DD/MM/YYYY
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function companionKey(c: Companion): string {
  if (c.fed) return `fed:${c.fed}`;
  return `name:${norm(c.nome)}|${c.pais || ""}`;
}

// Agregação: percorre as rondas e produz 1 linha por companheiro único
function aggregateCompanions(rondas: Round[]): CompanionRow[] {
  const map = new Map<string, CompanionRow>();
  for (const r of rondas) {
    for (const c of r.companheiros) {
      const k = companionKey(c);
      let row = map.get(k);
      if (!row) {
        row = {
          key: k,
          nome: c.nome,
          fed: c.fed,
          clube: c.clube,
          pais: c.pais,
          vezes: 0,
          ultimaData: null,
          primeiraData: null,
          circuitos: new Set([r.circuito]),
          rondas: [],
        };
        map.set(k, row);
      }
      // actualizar campos (preferir valores não-null)
      if (!row.clube && c.clube) row.clube = c.clube;
      if (!row.pais && c.pais) row.pais = c.pais;
      if (!row.fed && c.fed) row.fed = c.fed;
      row.vezes += 1;
      if (r.data) {
        if (!row.ultimaData || r.data > row.ultimaData) row.ultimaData = r.data;
        if (!row.primeiraData || r.data < row.primeiraData) row.primeiraData = r.data;
      }
      // acumular circuitos originais (FPG/USKids/Intl) para mostrar 1 badge por cada
      row.circuitos.add(r.circuito);
      row.rondas.push({
        data: r.data,
        torneioNome: r.torneioNome,
        torneioId: r.torneioId,
        ronda: r.ronda,
        circuito: r.circuito,
        manuelScore: r.manuelScore,
        companheiroScore: c.score,
      });
    }
  }
  // ordenar rondas internas por data desc
  for (const row of map.values()) {
    row.rondas.sort((a, b) => {
      const da = a.data || "0000-00-00";
      const db = b.data || "0000-00-00";
      if (da !== db) return db.localeCompare(da);
      return a.ronda - b.ronda;
    });
  }
  return [...map.values()];
}

// ── Componentes auxiliares ────────────────────────────────────────────

function CompanionNameLink({ row }: { row: CompanionRow }) {
  // FPG → link para /jogadores/{fed}
  if (row.fed) {
    return (
      <Link to={`/jogadores/${row.fed}`} className="lk">
        {row.nome}
      </Link>
    );
  }
  // USKids/Intl → link para /kids2#{nome}
  return (
    <Link to={`/kids2#${encodeURIComponent(row.nome)}`} className="lk">
      {row.nome}
    </Link>
  );
}

function CircuitBadge({ circuitos }: { circuitos: Set<"FPG" | "USKids" | "Intl"> }) {
  const flags: { c: string; emoji: string; title: string }[] = [];
  if (circuitos.has("FPG")) flags.push({ c: "FPG", emoji: "🇵🇹", title: "FPG" });
  if (circuitos.has("USKids")) flags.push({ c: "USKids", emoji: "🇺🇸", title: "USKids" });
  if (circuitos.has("Intl")) flags.push({ c: "Intl", emoji: "🌍", title: "Internacional (Bluegolf/Doral)" });
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {flags.map(f => <span key={f.c} title={f.title}>{f.emoji}</span>)}
    </span>
  );
}

// ── Página principal ──────────────────────────────────────────────────

export default function DrawsPage() {
  const [data, setData] = useState<PairingsFile | null>(null);
  const [intlLinks, setIntlLinks] = useState<IntlLink[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("FPG");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("vezes", "desc", {
    nome: "asc",
    clube: "asc",
    vezes: "desc",
    ultima: "desc",
  });

  useEffect(() => {
    let alive = true;
    fetch("/data/manuel-pairings.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: PairingsFile) => alive && setData(j))
      .catch((e) => alive && setErro(String(e.message || e)));
    // Carregar links externos (Bluegolf/GolfGenius) — opcional
    fetch("/data/manuel-pairings-intl-links.json")
      .then(r => r.ok ? r.json() : null)
      .then((j: IntlLinksFile | null) => { if (alive && j?.links) setIntlLinks(j.links); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Rondas filtradas pelo tab — Intl junta USKids + Intl (todos os internacionais)
  const rondasFiltradas = useMemo(() => {
    if (!data) return [];
    if (tab === "FPG") return data.rondas.filter(r => r.circuito === "FPG");
    return data.rondas.filter(r => r.circuito === "USKids" || r.circuito === "Intl");
  }, [data, tab]);

  // Agregação por companheiro
  const linhas = useMemo(() => aggregateCompanions(rondasFiltradas), [rondasFiltradas]);

  // Ordenação
  const linhasOrdenadas = useMemo(() => {
    const cmp = (a: CompanionRow, b: CompanionRow): number => {
      let v = 0;
      switch (sortKey) {
        case "nome":
          v = a.nome.localeCompare(b.nome, "pt");
          break;
        case "clube":
          v = (a.clube || a.pais || "").localeCompare(b.clube || b.pais || "", "pt");
          break;
        case "vezes":
          v = a.vezes - b.vezes;
          break;
        case "ultima":
          v = (a.ultimaData || "").localeCompare(b.ultimaData || "");
          break;
      }
      return sortDir === "asc" ? v : -v;
    };
    return [...linhas].sort(cmp);
  }, [linhas, sortKey, sortDir]);

  // Toggle expand de uma linha
  const toggleExpand = (k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  // Contagens por tab (FPG + Intl, onde Intl junta USKids+Intl)
  const contagensTab = useMemo(() => {
    if (!data) return { FPG: 0, Intl: 0 };
    let fpg = 0, intl = 0;
    for (const r of data.rondas) {
      if (r.circuito === "FPG") fpg++;
      else intl++;
    }
    return { FPG: fpg, Intl: intl };
  }, [data]);

  return (
    <main className="page page-draws">
      <div className="toolbar" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Draws — Manuel</h1>
        <span className="muted fs-12">
          Jogadores com quem o Manuel já foi parelhado em torneios
        </span>
        {data && (
          <span className="muted fs-12" style={{ marginLeft: "auto" }}>
            {data.totalRondas} rondas · {data.totalCompanheirosUnicos} companheiros únicos · actualizado {fmtDateShort(data.geradoEm.slice(0, 10))}
          </span>
        )}
      </div>

      {/* Tabs — só FPG e Internacional (Intl junta USKids + Bluegolf/GolfGenius) */}
      <div className="tab-under" style={{ display: "flex", gap: 0, marginTop: 12, borderBottom: "1px solid var(--border, #e5e5e5)" }}>
        {(["FPG", "Intl"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "active" : ""}
            style={{
              background: "none",
              border: "none",
              padding: "10px 16px",
              cursor: "pointer",
              borderBottom: tab === t ? "2px solid var(--accent, #3b82f6)" : "2px solid transparent",
              color: tab === t ? "var(--accent, #3b82f6)" : "var(--text, #333)",
              fontWeight: tab === t ? 600 : 400,
              fontSize: 14,
            }}
            onClick={() => setTab(t)}
          >
            {t === "FPG" && "🇵🇹 FPG"}
            {t === "Intl" && "🌍 Internacional"}
            <span className="muted fs-12" style={{ marginLeft: 6 }}>
              ({contagensTab[t]})
            </span>
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div style={{ marginTop: 16 }}>
        {erro && (
          <div className="msg msg-error">
            Erro ao carregar pairings: {erro}
          </div>
        )}

        {!erro && !data && (
          <div className="muted">A carregar pairings…</div>
        )}

        {/* Bloco de torneios USKids do Manuel (signupanytime) — só na tab Intl */}
        {data && tab === "Intl" && (() => {
          // Agregar torneios USKids únicos a partir das rondas
          const uskTorneios = new Map<string, { nome: string; data: string | null; rondas: number; t: string }>();
          for (const r of data.rondas) {
            if (r.circuito !== "USKids") continue;
            const t = r.torneioId.replace(/^usk-/, "");
            const e = uskTorneios.get(r.torneioId);
            if (!e) uskTorneios.set(r.torneioId, { nome: r.torneioNome, data: r.data, rondas: 1, t });
            else {
              e.rondas += 1;
              if (r.data && (!e.data || r.data < e.data)) e.data = r.data;
            }
          }
          if (uskTorneios.size === 0) return null;
          const lista = [...uskTorneios.values()].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
          return (
            <div style={{
              padding: "10px 14px",
              marginBottom: 12,
              background: "var(--bg-soft, #f9fafb)",
              border: "1px solid var(--border, #e5e5e5)",
              borderRadius: 8,
              fontSize: 13,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                🇺🇸 Torneios USKids do Manuel (pairings via signupanytime)
              </div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {lista.map((tn, i) => (
                  <li key={i} style={{ marginBottom: 2 }}>
                    <a href={`https://www.signupanytime.com/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${tn.t}`} target="_blank" rel="noopener" className="lk">
                      {tn.nome}
                    </a>
                    <span className="muted fs-12">
                      {" "}— signupanytime · {tn.rondas} {tn.rondas === 1 ? "ronda" : "rondas"}{tn.data ? ` · ${fmtDateShort(tn.data)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        {/* Bloco de links externos para tee times (Bluegolf/GolfGenius) */}
        {data && tab === "Intl" && intlLinks.length > 0 && (
          <div style={{
            padding: "10px 14px",
            marginBottom: 12,
            background: "var(--bg-soft, #f9fafb)",
            border: "1px solid var(--border, #e5e5e5)",
            borderRadius: 8,
            fontSize: 13,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              🔗 Tee times noutros sites externos (Bluegolf / GolfGenius)
            </div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {intlLinks.map((lnk, i) => (
                <li key={i} style={{ marginBottom: 2 }}>
                  <a href={lnk.url} target="_blank" rel="noopener" className="lk">
                    {lnk.nome}
                  </a>
                  <span className="muted fs-12">
                    {" "}— {lnk.fonte}{lnk.ronda !== "all" ? ` R${lnk.ronda}` : ""}{lnk.notas ? ` · ${lnk.notas}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data && linhasOrdenadas.length === 0 && (
          <div className="muted">Sem dados para {tab}.</div>
        )}

        {/* Barra de cobertura — quantas rondas com draws vs total jogado */}
        {data && data.cobertura && (() => {
          // Cobertura: tab FPG → bloco fpg; tab Intl → soma USKids + Intl
          let cov: CoverageBlock | null = null;
          if (tab === "FPG") {
            cov = data.cobertura.fpg;
          } else {
            const u = data.cobertura.uskids;
            const i = (data.cobertura as any).intl;
            if (u && i) {
              cov = {
                rondasJogadas: (u.rondasJogadas || 0) + (i.rondasJogadas || 0),
                rondasComDraw: (u.rondasComDraw || 0) + (i.rondasComDraw || 0),
                torneiosJogados: (u.torneiosJogados || 0) + (i.torneiosJogados || 0),
                torneiosComDraw: (u.torneiosComDraw || 0) + (i.torneiosComDraw || 0),
              };
            } else {
              cov = u || null;
            }
          }
          if (!cov) return null;
          const pct = cov.rondasJogadas > 0 ? Math.round(100 * cov.rondasComDraw / cov.rondasJogadas) : 0;
          const naoCobertas = cov.rondasJogadas - cov.rondasComDraw;
          return (
            <div style={{
              padding: "10px 14px",
              marginBottom: 12,
              background: "var(--bg-soft, #f9fafb)",
              border: "1px solid var(--border, #e5e5e5)",
              borderRadius: 8,
              fontSize: 13,
              display: "flex",
              gap: 24,
              flexWrap: "wrap",
              alignItems: "center",
            }}>
              <div>
                <strong>{cov.rondasComDraw}</strong>
                <span className="muted"> / {cov.rondasJogadas} rondas com draw </span>
                <strong style={{ color: pct >= 80 ? "var(--score-birdie, #16a34a)" : pct >= 50 ? "#f59e0b" : "#dc2626" }}>
                  ({pct}%)
                </strong>
              </div>
              <div>
                <span className="muted">torneios: </span>
                <strong>{cov.torneiosComDraw}</strong>
                <span className="muted"> / {cov.torneiosJogados}</span>
              </div>
              {naoCobertas > 0 && tab === "FPG" && (
                <div className="muted fs-12" style={{ marginLeft: "auto" }}>
                  ⚠ {naoCobertas} rondas em {cov.torneiosJogados - cov.torneiosComDraw} torneios sem draw scrapado (maioritariamente clubes regionais fora do scope de <code>fpg-admissions-draws</code>)
                </div>
              )}
            </div>
          );
        })()}

        {data && linhasOrdenadas.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="lb" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <SortableHdr k="nome" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                    Companheiro
                  </SortableHdr>
                  <SortableHdr k="clube" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                    {tab === "FPG" ? "Clube" : "País"}
                  </SortableHdr>
                  <SortableHdr k="vezes" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                    Rondas
                  </SortableHdr>
                  <SortableHdr k="ultima" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                    Último encontro
                  </SortableHdr>
                  <th style={{ width: 60 }}>Circ.</th>
                </tr>
              </thead>
              <tbody>
                {linhasOrdenadas.map((row) => {
                  const open = expanded.has(row.key);
                  return (
                    <>
                      <tr
                        key={row.key}
                        style={{ cursor: "pointer" }}
                        onClick={() => toggleExpand(row.key)}
                      >
                        <td style={{ textAlign: "center", color: "var(--text-muted, #888)" }}>
                          {open ? "▾" : "▸"}
                        </td>
                        <td>
                          <CompanionNameLink row={row} />
                        </td>
                        <td style={{ color: "var(--text-muted, #555)" }}>
                          {tab === "FPG"
                            ? (row.clube || "—")
                            : (row.pais ? `${FLAG[row.pais] || ""} ${row.pais}` : "—")}
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 600 }}>
                          {row.vezes}
                        </td>
                        <td>{fmtDateShort(row.ultimaData)}</td>
                        <td style={{ textAlign: "center" }}>
                          <CircuitBadge circuitos={row.circuitos} />
                        </td>
                      </tr>
                      {open && (
                        <tr key={`${row.key}-detail`}>
                          <td></td>
                          <td colSpan={5} style={{ background: "var(--bg-soft, #f9fafb)", padding: "8px 12px" }}>
                            <table style={{ width: "100%", fontSize: 13 }}>
                              <thead>
                                <tr style={{ color: "var(--text-muted, #666)" }}>
                                  <th style={{ textAlign: "left", fontWeight: 500, padding: "4px 8px" }}>Data</th>
                                  <th style={{ textAlign: "left", fontWeight: 500, padding: "4px 8px" }}>Torneio</th>
                                  <th style={{ textAlign: "center", fontWeight: 500, padding: "4px 8px" }}>Ronda</th>
                                  <th style={{ textAlign: "right", fontWeight: 500, padding: "4px 8px" }}>Manuel</th>
                                  <th style={{ textAlign: "right", fontWeight: 500, padding: "4px 8px" }}>{row.nome.split(" ")[0]}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.rondas.map((r, i) => (
                                  <tr key={i}>
                                    <td style={{ padding: "4px 8px" }}>{fmtDateShort(r.data)}</td>
                                    <td style={{ padding: "4px 8px" }}>
                                      {r.circuito === "FPG" && r.torneioId.includes("-") ? (
                                        <Link to={`/FPG/torneio/${r.torneioId}`} className="lk">{r.torneioNome}</Link>
                                      ) : (
                                        r.torneioNome
                                      )}
                                    </td>
                                    <td style={{ padding: "4px 8px", textAlign: "center" }}>R{r.ronda}</td>
                                    <td style={{ padding: "4px 8px", textAlign: "right", color: tpColor(r.manuelScore?.toPar) }}>
                                      {fmtScore(r.manuelScore)}
                                    </td>
                                    <td style={{ padding: "4px 8px", textAlign: "right", color: tpColor(r.companheiroScore?.toPar) }}>
                                      {fmtScore(r.companheiroScore)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border, #d4d4d8)", fontWeight: 600, background: "var(--bg-soft, #f9fafb)" }}>
                  <td></td>
                  <td style={{ padding: "8px 8px" }}>
                    TOTAL
                  </td>
                  <td style={{ color: "var(--text-muted, #666)", fontWeight: 400, fontSize: 12 }}>
                    {linhasOrdenadas.length} {linhasOrdenadas.length === 1 ? "jogador" : "jogadores"} únicos
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {linhasOrdenadas.reduce((s, r) => s + r.vezes, 0)}
                    <span className="muted fs-12" style={{ fontWeight: 400 }}>
                      {" "}entries
                    </span>
                  </td>
                  <td colSpan={2} style={{ color: "var(--text-muted, #666)", fontWeight: 400, fontSize: 12 }}>
                    {(() => {
                      const nrondas = rondasFiltradas.length;
                      return `${nrondas} ${nrondas === 1 ? "ronda" : "rondas"} com draw`;
                    })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
