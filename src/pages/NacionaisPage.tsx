import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ScatterChart, Scatter, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { useAppContext } from "../context/AppContext";
import { sdClassByHcp } from "../utils/scoreDisplay";
import SexBadge from "../ui/SexBadge";

/* ── Tipos ── */
interface InscricaoJogador {
  fed: string | null; nome: string; clube: string;
  hcp: number | null; vac: number | null; dataInscricao: string | null;
}
interface TorneioData {
  tcode: string; nome: string; escalao: string; sex: string;
  totalInscritos: number; jogadores: InscricaoJogador[];
  lastFetched: string | null; fpgUrl?: string;
  _status: "idle" | "loading" | "ok" | "error";
}
type BdPlayer = { name: string; escalao: string; sex: string; fed: string; clube: string; dob: string };
interface PlayerStats {
  avgSD5: number | null; lastSD: number | null; currentHcp: number | null;
  hcpTrend: string | null; hcpDelta3m: number | null;
  roundsLast3m: number | null; formAlert: string | null;
}
type StatsDb = Record<string, PlayerStats>;

function usePlayerStats() {
  const [stats, setStats] = useState<StatsDb>({});
  useEffect(() => {
    fetch("/player-stats.json").then(r => r.ok ? r.json() : {}).then(setStats).catch(() => {});
  }, []);
  return stats;
}

const TORNEIOS_CONFIG = [
  { tcode: "10935", nome: "Sub-18 H", escalao: "Sub-18", sex: "M" },
  { tcode: "10936", nome: "Sub-18 S", escalao: "Sub-18", sex: "F" },
  { tcode: "10937", nome: "Sub-16 H", escalao: "Sub-16", sex: "M" },
  { tcode: "10938", nome: "Sub-16 S", escalao: "Sub-16", sex: "F" },
  { tcode: "10939", nome: "Sub-14 H", escalao: "Sub-14", sex: "M" },
  { tcode: "10940", nome: "Sub-14 S", escalao: "Sub-14", sex: "F" },
  { tcode: "10941", nome: "Sub-12 H", escalao: "Sub-12", sex: "M" },
  { tcode: "10942", nome: "Sub-12 S", escalao: "Sub-12", sex: "F" },
  { tcode: "10943", nome: "Sub-10 H", escalao: "Sub-10", sex: "M" },
  { tcode: "10944", nome: "Sub-10 S", escalao: "Sub-10", sex: "F" },
];

function escShort(esc: string) { return esc.replace("Sub-", "S"); }
function escCls(esc: string) {
  return esc.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function norm(s: string) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function fmtTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}
function fmtDataInscricao(s: string | null) {
  if (!s) return "–";
  return s.replace(/^\d{4}\//, "").replace("/", "/");
}
function anoEscalao(dob: string, escalao: string): "1A" | "2A" | null {
  if (!dob) return null;
  const anoNasc = parseInt(dob.slice(0, 4));
  const idadeMax = parseInt(escalao.replace("Sub-", ""));
  if (isNaN(anoNasc) || isNaN(idadeMax)) return null;
  return anoNasc === (new Date().getFullYear() - idadeMax) ? "2A" : "1A";
}
function AnoEscalaoPill({ dob, escalao }: { dob: string; escalao: string }) {
  if (!dob) return null;
  const anoNasc = dob.slice(0, 4);
  const isUltimo = anoEscalao(dob, escalao) === "2A";
  return (
    <span title={isUltimo ? `${anoNasc} — 2o ano` : `${anoNasc} — 1o ano`}
      style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, lineHeight: 1.4,
        background: isUltimo ? "var(--color-bad)" : "var(--color-good)", color: "#fff", flexShrink: 0 }}>
      {anoNasc}
    </span>
  );
}
function TrendBadge({ trend, delta }: { trend: string | null; delta: number | null }) {
  if (!trend || trend === "stable") return <span className="muted" style={{ fontSize: 11 }}>–</span>;
  const up = trend === "improving";
  return (
    <span style={{ color: up ? "var(--color-good)" : "var(--color-bad)", fontWeight: 700, fontSize: 13 }}
      title={delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} (3m)` : ""}>
      {up ? "↓" : "↑"}
    </span>
  );
}

/* ── Card de escalao — usa o mesmo estilo das pills de escalao da app ── */
function TorneioCard({ t, active, onClick }: {
  t: TorneioData; active: boolean; onClick: () => void;
}) {
  const cls = escCls(t.escalao);
  return (
    <button
      className={`p p-esc-filter p-${cls}${active ? " active" : ""}`}
      onClick={onClick}
      title={`Campeonato Nacional de Jovens ${t.nome}`}
      style={{ gap: 4 }}
    >
      {escShort(t.escalao)}
      <SexBadge sex={t.sex} size="sm" />
      {t._status === "loading" && <span style={{ fontSize: 11, opacity: 0.8 }}>⟳</span>}
      {t._status === "error"   && <span style={{ fontSize: 11, fontWeight: 700 }}>!</span>}
      {t._status === "ok" && t.totalInscritos > 0 && (
        <span className="p-filter-count">{t.totalInscritos}</span>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   VISTA INSCRIÇÕES — tabela completa
   ═══════════════════════════════════════════════════════ */
type SortKey = "pos" | "nome" | "hcp" | "vac" | "sd5" | "data" | "trend" | "rondas";

function InscricoesView({ t, nossosFedSet, nossosByFed, statsDb }: {
  t: TorneioData; nossosFedSet: Set<string>; nossosByFed: Map<string, BdPlayer>; statsDb: StatsDb;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("pos");
  const [sortAsc, setSortAsc] = useState(true);
  const term = norm(search);

  const nossosCount = useMemo(
    () => t.jogadores.filter(j => j.fed && nossosFedSet.has(j.fed)).length,
    [t.jogadores, nossosFedSet]
  );
  const lista = useMemo(() => {
    let base = t.jogadores;
    if (term) base = base.filter(j => norm(j.nome).includes(term) || (j.fed || "").includes(term));
    if (sortKey === "pos") return sortAsc ? base : [...base].reverse();
    return [...base].sort((a, b) => {
      const sa = a.fed ? statsDb[a.fed] : null;
      const sb = b.fed ? statsDb[b.fed] : null;
      let v = 0;
      if      (sortKey === "nome")   { const pa = a.fed ? nossosByFed.get(a.fed) : null; const pb = b.fed ? nossosByFed.get(b.fed) : null; v = (pa?.name ?? a.nome).localeCompare(pb?.name ?? b.nome, "pt"); }
      else if (sortKey === "hcp")    { v = (a.hcp ?? 999) - (b.hcp ?? 999); }
      else if (sortKey === "vac")    { v = (a.vac ?? 999) - (b.vac ?? 999); }
      else if (sortKey === "sd5")    { v = (sa?.avgSD5 ?? 999) - (sb?.avgSD5 ?? 999); }
      else if (sortKey === "data")   { v = (a.dataInscricao ?? "").localeCompare(b.dataInscricao ?? ""); }
      else if (sortKey === "rondas") { v = (sb?.roundsLast3m ?? -1) - (sa?.roundsLast3m ?? -1); }
      else if (sortKey === "trend")  { const ord = { improving: 0, stable: 1, worsening: 2 }; v = (ord[sa?.hcpTrend as keyof typeof ord] ?? 3) - (ord[sb?.hcpTrend as keyof typeof ord] ?? 3); }
      return sortAsc ? v : -v;
    });
  }, [t.jogadores, term, sortKey, sortAsc, nossosByFed, statsDb]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v); else { setSortKey(key); setSortAsc(true); }
  }
  function SortTh({ label, col, cls }: { label: string; col: SortKey; cls?: string }) {
    const active = sortKey === col;
    return <th className={cls} onClick={() => toggleSort(col)}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
      {label}{active ? (sortAsc ? " ↑" : " ↓") : " ↕"}
    </th>;
  }

  if (t._status !== "ok" && t._status !== "loading") return null;
  if (t._status === "loading") return <div className="muted p-16">A carregar...</div>;

  return (
    <div>
      <div className="nac-det-toolbar">
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Nome, num fed..." style={{ maxWidth: 200 }} />
        <span className="muted" style={{ fontSize: 12 }}>{nossosCount} da BD · {t.totalInscritos} total</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          {t.lastFetched && <span className="muted" style={{ fontSize: 11 }}>as {fmtTime(t.lastFetched)}</span>}
          {t.fpgUrl && <a href={t.fpgUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--chart-2)" }}>datagolf</a>}
        </div>
      </div>
      <div className="table-wrap">
        <table className="dtable-lg">
          <colgroup>
            <col style={{ width: "4%" }} /><col style={{ width: "17%" }} />
            <col style={{ width: "7%" }} /><col style={{ width: "5%" }} />
            <col style={{ width: "5%" }} /><col style={{ width: "5%" }} />
            <col style={{ width: "4%" }} /><col style={{ width: "4%" }} />
            <col style={{ width: "9%" }} /><col style={{ width: "40%" }} />
          </colgroup>
          <thead>
            <tr>
              <SortTh label="#"     col="pos"    />
              <SortTh label="Nome"  col="nome"   />
              <th className="r">Fed</th>
              <SortTh label="HCP"   col="hcp"    cls="r" />
              <SortTh label="VAC"   col="vac"    cls="r" />
              <SortTh label="SD5"   col="sd5"    cls="r" />
              <SortTh label="T"     col="trend"  cls="r" />
              <SortTh label="R3m"   col="rondas" cls="r" />
              <SortTh label="Insc"  col="data"   cls="r" />
              <th>Na BD</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((j, i) => {
              const p  = j.fed ? nossosByFed.get(j.fed) : undefined;
              const st = j.fed ? statsDb[j.fed] : null;
              const sd5 = st?.avgSD5 ?? null;
              return (
                <tr key={`${j.fed ?? j.nome}-${i}`} className={p ? "nac-row-match" : ""}>
                  <td className="muted r" style={{ fontSize: 11 }}>{i + 1}</td>
                  <td style={{ fontSize: 13 }}>
                    {p ? <a href={`/jogadores/${j.fed}?view=by_date`} target="_blank" rel="noopener noreferrer"
                             style={{ fontWeight: 700, color: "inherit", textDecoration: "none" }}>{p.name}</a>
                       : <span className="muted">{j.nome || "–"}</span>}
                  </td>
                  <td className="r">
                    {j.fed ? <a href={`/jogadores/${j.fed}?view=by_date`} target="_blank" rel="noopener noreferrer"
                                style={{ color: "var(--chart-2)", textDecoration: "none", fontSize: 12 }}>{j.fed}</a>
                           : <span className="muted">–</span>}
                  </td>
                  <td className="r muted" style={{ fontSize: 12 }}>{j.hcp != null ? j.hcp.toFixed(1) : "–"}</td>
                  <td className="r" style={{ fontSize: 12, fontWeight: 600 }}>{j.vac != null ? j.vac.toFixed(1) : "–"}</td>
                  <td className="r" style={{ fontSize: 11 }}>
                    {sd5 != null ? <span className={`p p-${sdClassByHcp(sd5, st?.currentHcp ?? j.hcp ?? null)}`} style={{ fontSize: 11 }}>{sd5.toFixed(1)}</span> : <span className="muted">–</span>}
                  </td>
                  <td className="r"><TrendBadge trend={st?.hcpTrend ?? null} delta={st?.hcpDelta3m ?? null} /></td>
                  <td className="r" style={{ fontSize: 12 }}>
                    {st?.roundsLast3m != null
                      ? <span style={{ fontWeight: st.roundsLast3m >= 4 ? 600 : 400, color: st.roundsLast3m === 0 ? "var(--color-bad)" : "inherit" }}>{st.roundsLast3m}</span>
                      : <span className="muted">–</span>}
                  </td>
                  <td className="r muted" style={{ fontSize: 11 }}>{fmtDataInscricao(j.dataInscricao)}</td>
                  <td>
                    {p ? <span style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                        <SexBadge sex={p.sex} size="sm" />
                        <span className={`p p-sm p-${escCls(p.escalao)}`} style={{ fontSize: 10 }}>{escShort(p.escalao)}</span>
                        {p.dob && <AnoEscalaoPill dob={p.dob} escalao={t.escalao} />}
                        {p.clube && <span className="muted" style={{ fontSize: 11 }}>{p.clube}</span>}
                      </span>
                    : <span className="muted" style={{ fontSize: 11 }}>{j.fed ? "Nao na BD" : "–"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <div className="muted p-16">Sem resultados</div>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   VISTA ANÁLISE — Análise profissional para o Campeonato Nacional
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Termos de Competição ── */
const TERMOS_COMPETICAO = `CAMPEONATO NACIONAL DE JOVENS Sub 18, 16, 14, 12 e 10
PGA Aroeira II · 01 a 03 de Maio de 2026

1. PARTICIPAÇÃO
Escalões Sub-18, Sub-16, Sub-14, Sub-12 e Sub-10, filiados na FPG.
Handicap máximo: Sub-18 → 9,0 · Sub-16 → 12,0 · Sub-14 → 16,0 · Sub-12 → 36,0 · Sub-10 → 50,0
Para Sub-14, 12 e 10: obrigatória participação prévia em ≥3 torneios Drive Challenge / Drive Tour nos últimos 12 meses, ou C.N. de Jovens.

2. INSCRIÇÕES
Via formulário on-line em www.fpg.pt até às 12h de 27 de Abril (segunda-feira).
Critério de aceitação: Índice de handicap WHS™ e VAC-F registado no servidor da FPG no momento do encerramento.

3. LIMITE DE INSCRIÇÕES
30 jogadores por escalão (15 Rapazes + 15 Raparigas).
Se excedido o limite: exclusão pelos VAC-F mais altos.
Vagas não preenchidas transferidas primeiro para o mesmo escalão, depois para o field geral, sempre por ordem de VAC-F, sem consideração de género.

4. VALOR DA INSCRIÇÃO
Gratuita (0€). Cancelamentos após publicação do draw: 10€.

5. MODALIDADE
Sub-18, 16 e 14: 54 buracos por pancadas (18/dia). Sem cut.
Sub-12: 54 buracos por pancadas (18/dia), máximo 10 pancadas/buraco. Sem cut.
Sub-10: 27 buracos por pancadas (9/dia), máximo 10 pancadas/buraco. Sem cut.

6. REGRAS
Regras R&A · Regras Locais de Aplicação Permanente da FPG · Regras Locais da Comissão Técnica.

7. MARCAS DE SAÍDA
Sub-18 e Sub-16 → Brancas e Azuis
Sub-14 → Amarelas e Vermelhas
Sub-12 → Vermelhas
Sub-10 → Verdes

8. EMPATES
Campeão: Sudden Death Play Off.
Vice-Campeão: melhores últimos 36, 18, 9, 6, 3 buracos e melhor último buraco. Persistindo: sorteio.
Restantes lugares: sem desempate.

9. PRÉMIOS
Campeão(ã) Nacional · Vice-Campeão(ã) Nacional
(Títulos de Campeão Nacional apenas para cidadãos nacionais.)

10. CADDIES
Não são permitidos.

11. COMISSÃO TÉCNICA E ÁRBITROS
Designados pela FPG. Dúvidas: campeonatos@fpg.pt`;

function TermosSection() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ fontWeight: 700, fontSize: 12 }}>📋 Termos de Competição — PGA Aroeira II 2026</span>
        <span className="muted" style={{ fontSize: 11 }}>
          {open ? "▲ fechar" : "▼ ver"}
          <a href="https://competicoes.fpg.pt/wp-content/uploads/2025/09/Campeonato_Nacional_de_Jovens_Sub18-a-Sub-10.pdf"
             target="_blank" rel="noopener noreferrer"
             onClick={e => e.stopPropagation()}
             style={{ marginLeft: 10, color: "var(--chart-2)" }}>PDF ↗</a>
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--border)" }}>
          <pre style={{ fontSize: 11, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "var(--text-2)",
            fontFamily: "inherit", margin: 0, paddingTop: 10 }}>
            {TERMOS_COMPETICAO}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ── Tabela buraco-a-buraco no Aroeira ── */
function AroeiraBurTable({ players }: {
  players: { nome: string; fed: string; agg: AggStats }[];
}) {
  const comAroeira = players.filter(p => p.agg.aroeira.nRounds > 0 && p.agg.aroeira.holes.length === 18);
  if (comAroeira.length < 1) return null;

  // Pars canónicos (do primeiro jogador com dados)
  const pars = comAroeira[0].agg.aroeira.holes.map(h => h.par);

  const diffColor = (diff: number | null): string => {
    if (diff == null) return "var(--text-3)";
    if (diff <= -0.5) return "var(--color-good)";
    if (diff <= 0.15) return "var(--text-1)";
    if (diff <= 0.5)  return "var(--color-warn)";
    return "var(--color-bad)";
  };

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
        Aroeira — Média por buraco
        <span className="muted" style={{ fontWeight: 400, fontSize: 11, marginLeft: 8 }}>
          (jogadores com histórico no campo · últimos 6 meses)
        </span>
      </div>
      <div className="table-wrap" style={{ overflowX: "auto" }}>
        <table className="dtable-lg" style={{ minWidth: 600 }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 35 }} />
            {comAroeira.map((_, i) => <col key={i} style={{ width: 70 }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ fontSize: 10 }}>B.</th>
              <th style={{ fontSize: 10 }} className="r">Par</th>
              {comAroeira.map(p => (
                <th key={p.fed} className="c" style={{ fontSize: 10, maxWidth: 70 }}>
                  <a href={`/jogadores/${p.fed}?view=by_date`} target="_blank" rel="noopener noreferrer"
                     style={{ color: "inherit", textDecoration: "none" }}>
                    {p.nome.split(" ")[0]}
                  </a>
                  <div className="muted" style={{ fontSize: 9, fontWeight: 400 }}>{p.agg.aroeira.nRounds}×</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Linha de média gross */}
            <tr style={{ background: "var(--bg-hover)" }}>
              <td style={{ fontSize: 10, fontWeight: 600 }}>Total</td>
              <td className="r" style={{ fontSize: 10 }}>
                {pars.reduce((s, p) => s + (p ?? 0), 0) || "–"}
              </td>
              {comAroeira.map(p => (
                <td key={p.fed} className="c" style={{ fontWeight: 700, fontSize: 12,
                  color: p.agg.aroeira.avgGross != null ? diffColor(p.agg.aroeira.avgGross - pars.reduce((s, par) => s + (par ?? 0), 0)) : "var(--text-3)" }}>
                  {p.agg.aroeira.avgGross?.toFixed(1) ?? "–"}
                </td>
              ))}
            </tr>
            {/* Separador frentes */}
            {[1, 10].map(startH => (
              <React.Fragment key={startH}>
                <tr>
                  <td colSpan={2 + comAroeira.length}
                    style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", padding: "4px 6px",
                      background: "var(--bg-page)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {startH === 1 ? "1ª Volta (B1–B9)" : "2ª Volta (B10–B18)"}
                  </td>
                </tr>
                {Array.from({ length: 9 }, (_, i) => startH + i).map(hNum => {
                  const idx = hNum - 1;
                  const par = pars[idx];
                  return (
                    <tr key={hNum}>
                      <td style={{ fontSize: 11, fontWeight: 600 }}>{hNum}</td>
                      <td className="r muted" style={{ fontSize: 11 }}>{par ?? "–"}</td>
                      {comAroeira.map(p => {
                        const h = p.agg.aroeira.holes[idx];
                        const d = h?.diff;
                        return (
                          <td key={p.fed} className="c" style={{ fontSize: 11 }}>
                            {h?.avg != null ? (
                              <span style={{ fontWeight: 600, color: diffColor(d ?? null) }}>
                                {h.avg.toFixed(2)}
                                {d != null && <span style={{ fontSize: 9, marginLeft: 2 }}>
                                  ({d > 0 ? "+" : ""}{d.toFixed(2)})
                                </span>}
                              </span>
                            ) : <span className="muted">–</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Subtotal da volta */}
                <tr style={{ background: "var(--bg-hover)" }}>
                  <td style={{ fontSize: 10, fontWeight: 600 }}>Sub</td>
                  <td className="r" style={{ fontSize: 10 }}>
                    {pars.slice(startH - 1, startH + 8).reduce((s, p) => s + (p ?? 0), 0)}
                  </td>
                  {comAroeira.map(p => {
                    const sum = p.agg.aroeira.holes
                      .slice(startH - 1, startH + 8)
                      .reduce((s, h) => s + (h.avg ?? 0), 0);
                    const parSum = pars.slice(startH - 1, startH + 8).reduce((s, par) => s + (par ?? 0), 0);
                    return (
                      <td key={p.fed} className="c" style={{ fontWeight: 700, fontSize: 11,
                        color: diffColor(sum - parSum) }}>
                        {sum.toFixed(1)}
                      </td>
                    );
                  })}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Contexto Aroeira 2 por escalão ── */
const CONTEXTO_TORNEIO: Record<string, {
  tees: string[]; formato: string; horasPorDia: number; totalBuracos: number; maxScore: number | null;
}> = {
  "Sub-18": { tees: ["Brancas", "Azuis"],     formato: "54 buracos · 18/dia · pancadas",     horasPorDia: 18, totalBuracos: 54, maxScore: null },
  "Sub-16": { tees: ["Brancas", "Azuis"],     formato: "54 buracos · 18/dia · pancadas",     horasPorDia: 18, totalBuracos: 54, maxScore: null },
  "Sub-14": { tees: ["Amarelas", "Vermelhas"],formato: "54 buracos · 18/dia · pancadas",     horasPorDia: 18, totalBuracos: 54, maxScore: null },
  "Sub-12": { tees: ["Vermelhas"],             formato: "54 buracos · 18/dia · max 10/buraco",horasPorDia: 18, totalBuracos: 54, maxScore: 10 },
  "Sub-10": { tees: ["Verdes"],               formato: "27 buracos · 9/dia  · max 10/buraco",horasPorDia: 9,  totalBuracos: 27, maxScore: 10 },
};

const TEE_STYLE: Record<string, { bg: string; color: string; border?: string }> = {
  "Brancas":   { bg: "#f5f5f5", color: "#333", border: "1px solid #bbb" },
  "Azuis":     { bg: "#1d4ed8", color: "#fff" },
  "Amarelas":  { bg: "#ca8a04", color: "#fff" },
  "Vermelhas": { bg: "#dc2626", color: "#fff" },
  "Verdes":    { bg: "#16a34a", color: "#fff" },
};

/* ── Agregação de stats (baseada no CompararPage) ── */
interface AggStats {
  nRounds: number; nRoundsWithCard: number;
  avgGross: number | null; bestGross: number | null; grossStdDev: number | null;
  avgSD: number | null; bestSD: number | null; last5AvgSD: number | null; sdStdDev: number | null;
  scoreDist: { eagle: number; birdie: number; par: number; bogey: number; double: number; triple: number; total: number };
  byPar: Record<number, { avgVsPar: number; subParPct: number; n: number }>;
  f9avg: number | null; b9avg: number | null;
  aroeira: {
    nRounds: number; avgGross: number | null; tees: string[];
    holes: { h: number; par: number | null; avg: number | null; diff: number | null }[];
  };
}

// Filtro: apenas últimos 6 meses (rounds mais recentes são mais relevantes para jovens)
const SIX_MONTHS_SORT = (() => {
  const d = new Date(); d.setMonth(d.getMonth() - 6);
  return parseInt(d.toISOString().slice(0, 10).replace(/-/g, ""));
})();

function computeAgg(data: import("../data/playerDataLoader").PlayerPageData): AggStats | null {
  const dist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, total: 0 };
  const parAcc: Record<number, { diff: number; n: number; under: number }> = {};
  let grossSum = 0, nRounds = 0, nCard = 0, bestGross: number | null = null;
  let f9diff = 0, b9diff = 0, fbN = 0;
  const sdAll: number[] = [];
  const grossAll: number[] = [];
  // Aroeira
  let arGross = 0, arN = 0; const arTees = new Set<string>();
  const arHoleSums: { gSum: number; pSum: number; n: number }[] = Array.from({ length: 18 }, () => ({ gSum: 0, pSum: 0, n: 0 }));

  for (const cd of data.DATA) {
    const isAroeira = /aroeira/i.test(cd.course);
    for (const r of cd.rounds) {
      const is9h = r.holeCount === 9;
      const is18h = r.holeCount === 18;
      if (is9h) {
        if (r._isTreino || r._isTeamEvent || r.gross == null) continue;
        const o = (r.scoreOrigin || "").trim();
        if (o === "EDS" || o === "Indiv" || o === "Treino") continue;
        const g = Number(r.gross);
        if (g <= 25 || g > 70) continue;
      } else if (is18h) {
        if (r._isTreino || r._isTeamEvent) continue;
        const o = (r.scoreOrigin || "").trim();
        if (o === "EDS" || o === "Indiv" || o === "Treino" || o === "Extra") continue;
        const g = Number(r.gross);
        if (g > 130 || g < 50) continue;
      } else continue;

      // Filtro: apenas últimos 6 meses (jovens — forma recente é mais relevante)
      if (r.dateSort && r.dateSort < SIX_MONTHS_SORT) continue;

      const g = Number(r.gross);
      if (isNaN(g)) continue;
      grossSum += g; grossAll.push(g); nRounds++;
      if (bestGross === null || g < bestGross) bestGross = g;
      if (r.sd != null && !isNaN(Number(r.sd)) && Number(r.sd) !== 0) sdAll.push(Number(r.sd));
      if (isAroeira && is18h) {
        arGross += g; arN++;
        if (r.tee) arTees.add(r.tee);
      }

      const holes = data.HOLES[r.scoreId];
      const nH = r.holeCount ?? 18;
      if (holes && holes.g && holes.g.length >= nH) {
        nCard++;
        let f9 = 0, b9 = 0;
        for (let i = 0; i < nH; i++) {
          const hg = holes.g[i]; const hp = holes.p[i];
          if (hg == null || hp == null) continue;
          const diff = hg - hp;
          if (diff <= -2) dist.eagle++; else if (diff === -1) dist.birdie++;
          else if (diff === 0) dist.par++; else if (diff === 1) dist.bogey++;
          else if (diff === 2) dist.double++; else dist.triple++;
          dist.total++;
          if (!parAcc[hp]) parAcc[hp] = { diff: 0, n: 0, under: 0 };
          parAcc[hp].diff += diff; parAcc[hp].n++;
          if (diff < 0) parAcc[hp].under++;
          if (nH === 18) { if (i < 9) f9 += diff; else b9 += diff; }
          // Recolher dados buraco-a-buraco no Aroeira
          if (isAroeira && is18h && i < 18) {
            arHoleSums[i].gSum += hg; arHoleSums[i].pSum += hp; arHoleSums[i].n++;
          }
        }
        if (nH === 18) { f9diff += f9; b9diff += b9; fbN++; }
      }
    }
  }

  if (nRounds < 1) return null;
  const byPar: Record<number, { avgVsPar: number; subParPct: number; n: number }> = {};
  for (const pt of [3, 4, 5]) {
    const a = parAcc[pt]; if (!a || a.n === 0) continue;
    byPar[pt] = { avgVsPar: a.diff / a.n, subParPct: a.under / a.n * 100, n: a.n };
  }
  sdAll.sort((a, b) => a - b);
  const sdDesc = [...sdAll].sort((a, b) => b - a); // desc for recent
  const avgSD = sdDesc.length > 0 ? sdDesc.reduce((s, x) => s + x, 0) / sdDesc.length : null;
  const bestSD = sdDesc.length > 0 ? Math.min(...sdDesc) : null;
  const last5 = sdDesc.slice(0, 5);
  const last5AvgSD = last5.length >= 2 ? last5.reduce((s, x) => s + x, 0) / last5.length : null;
  const gMean = grossSum / nRounds;
  const grossStdDev = grossAll.length >= 3 ? Math.sqrt(grossAll.reduce((s, g) => s + (g - gMean) ** 2, 0) / grossAll.length) : null;
  const sMean = avgSD ?? 0;
  const sdStdDev = sdDesc.length >= 3 ? Math.sqrt(sdDesc.reduce((s, x) => s + (x - sMean) ** 2, 0) / sdDesc.length) : null;

  return {
    nRounds, nRoundsWithCard: nCard,
    avgGross: nRounds > 0 ? grossSum / nRounds : null,
    bestGross, grossStdDev,
    avgSD, bestSD, last5AvgSD, sdStdDev,
    scoreDist: dist,
    byPar,
    f9avg: fbN > 0 ? f9diff / fbN : null,
    b9avg: fbN > 0 ? b9diff / fbN : null,
    aroeira: {
      nRounds: arN,
      avgGross: arN > 0 ? arGross / arN : null,
      tees: [...arTees],
      holes: arN > 0 ? arHoleSums.map((h, i) => ({
        h: i + 1,
        par: h.n > 0 ? Math.round(h.pSum / h.n) : null,
        avg: h.n > 0 ? h.gSum / h.n : null,
        diff: h.n > 0 ? (h.gSum - h.pSum) / h.n : null,
      })) : [],
    },
  };
}

/* ── Mini barra de scoring distribution ── */
function MiniScoreBar({ dist, total, showLegend = false }: {
  dist: AggStats["scoreDist"]; total: number; showLegend?: boolean;
}) {
  if (total === 0) return <span className="muted" style={{ fontSize: 11 }}>–</span>;
  const segs = [
    { key: "eagle",  n: dist.eagle,  cls: "seg-eagle",  label: "Eagle",   circle: true  },
    { key: "birdie", n: dist.birdie, cls: "seg-birdie", label: "Birdie",  circle: true  },
    { key: "par",    n: dist.par,    cls: "",            label: "Par",     circle: false },
    { key: "bogey",  n: dist.bogey,  cls: "seg-bogey",  label: "Bogey",   circle: false },
    { key: "double", n: dist.double, cls: "seg-double", label: "Duplo",   circle: false },
    { key: "triple", n: dist.triple, cls: "seg-triple", label: "Triple+", circle: false },
  ].filter(s => s.n > 0);
  return (
    <div>
      <div style={{ display: "flex", height: 12, borderRadius: 3, overflow: "hidden", gap: 1, background: "var(--bg-page)", minWidth: 80 }}>
        {segs.map(s => (
          <div key={s.key}
            style={{ flex: s.n, minWidth: 2, background: s.key === "par" ? "var(--border)" : undefined }}
            className={s.key !== "par" ? s.cls : ""}
            title={`${s.label}: ${(s.n / total * 100).toFixed(0)}% (${s.n})`} />
        ))}
      </div>
      {showLegend && (
        <div style={{ display: "flex", gap: "4px 10px", flexWrap: "wrap", marginTop: 5 }}>
          {segs.map(s => (
            <span key={s.key} style={{ fontSize: 10, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 3 }}>
              <span className={s.key !== "par" ? s.cls : ""}
                style={{ width: 8, height: 8, display: "inline-block", flexShrink: 0, borderRadius: s.circle ? "50%" : 2,
                  background: s.key === "par" ? "var(--border)" : undefined }} />
              {s.label} {(s.n / total * 100).toFixed(0)}%
              <span style={{ color: "var(--text-3)", fontSize: 9 }}>({s.n})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Célula de par tipo ── */
function ParCell({ val, subPct, n }: { val: number | undefined; subPct: number | undefined; n: number | undefined }) {
  if (val == null || n == null || n === 0) return <span className="muted">–</span>;
  const col = val < -0.05 ? "var(--color-good)" : val < 0.2 ? "var(--text-1)" : val < 0.5 ? "var(--color-warn)" : "var(--color-bad)";
  return (
    <span title={`${subPct?.toFixed(0)}% sub-par · ${n} buracos`}>
      <span style={{ color: col, fontWeight: 700, fontSize: 12 }}>{val > 0 ? "+" : ""}{val.toFixed(2)}</span>
    </span>
  );
}

/* ── Estado de carregamento por jogador ── */
type PlayerLoad = {
  fed: string; nome: string; hcp: number | null; vac: number | null;
  status: "idle" | "loading" | "ok" | "nodata" | "error";
  agg: AggStats | null;
};

function AnaliseView({ t, nossosByFed, statsDb }: {
  t: TorneioData; nossosByFed: Map<string, BdPlayer>; statsDb: StatsDb;
}) {
  const [playerLoads, setPlayerLoads] = useState<PlayerLoad[]>([]);
  const loadingRef = useRef(new Set<string>());
  const [sortKey, setSortKey] = useState<"vac"|"hcp"|"avgSD"|"birdiePct"|"aroeira">("vac");

  useEffect(() => {
    if (t._status !== "ok") return;
    const loads: PlayerLoad[] = t.jogadores.filter(j => j.fed).map(j => ({
      fed: j.fed!, nome: j.nome, hcp: j.hcp, vac: j.vac, status: "idle", agg: null,
    }));
    setPlayerLoads(loads);
    loadingRef.current.clear();
  }, [t.tcode, t._status, t.totalInscritos]);

  useEffect(() => {
    if (playerLoads.length === 0) return;
    const idle = playerLoads.filter(p => p.status === "idle").slice(0, 3);
    if (idle.length === 0) return;
    idle.forEach(pl => {
      if (loadingRef.current.has(pl.fed)) return;
      loadingRef.current.add(pl.fed);
      setPlayerLoads(prev => prev.map(p => p.fed === pl.fed ? { ...p, status: "loading" } : p));
      import("../data/playerDataLoader")
        .then(m => m.loadPlayerData(pl.fed))
        .then(data => {
          const agg = computeAgg(data);
          setPlayerLoads(prev => prev.map(p => p.fed === pl.fed ? { ...p, status: agg ? "ok" : "nodata", agg } : p));
        })
        .catch(() => setPlayerLoads(prev => prev.map(p => p.fed === pl.fed ? { ...p, status: "nodata" } : p)))
        .finally(() => loadingRef.current.delete(pl.fed));
    });
  }, [playerLoads]);

  if (t._status !== "ok") return <div className="muted p-16">Carrega o torneio primeiro.</div>;
  if (t.totalInscritos === 0) return <div className="muted p-16">Sem inscritos.</div>;

  const ctx = CONTEXTO_TORNEIO[t.escalao];
  const nDone  = playerLoads.filter(p => p.status === "ok" || p.status === "nodata").length;
  const nTotal = playerLoads.length;
  const loading = nDone < nTotal;

  const withData  = playerLoads.filter(p => p.agg);
  const allByVac  = [...t.jogadores].sort((a, b) => (a.vac ?? 999) - (b.vac ?? 999));
  const avgVac    = allByVac.length ? allByVac.reduce((s, j) => s + (j.vac ?? 0), 0) / allByVac.length : null;
  const avgHcp    = allByVac.filter(j => j.hcp).length ? allByVac.reduce((s, j) => s + (j.hcp ?? 0), 0) / allByVac.filter(j => j.hcp).length : null;

  const sorted = [...withData].sort((a, b) => {
    if (sortKey === "vac")       return (a.vac ?? 999) - (b.vac ?? 999);
    if (sortKey === "hcp")       return (a.hcp ?? 999) - (b.hcp ?? 999);
    if (sortKey === "avgSD")     return (a.agg!.avgSD ?? 999) - (b.agg!.avgSD ?? 999);
    if (sortKey === "birdiePct") return (b.agg!.scoreDist.birdie / (b.agg!.scoreDist.total||1)) - (a.agg!.scoreDist.birdie / (a.agg!.scoreDist.total||1));
    if (sortKey === "aroeira")   return (a.agg!.aroeira.avgGross ?? 999) - (b.agg!.aroeira.avgGross ?? 999);
    return 0;
  });

  // scatter: todos os inscritos com hcp+vac
  const scatterAll = t.jogadores.filter(j => j.hcp != null && j.vac != null).map(j => ({
    x: j.hcp!, y: j.vac!,
    nome: (nossosByFed.get(j.fed ?? "")?.name ?? j.nome).split(" ").slice(0, 2).join(" "),
  }));

  const ScatterTip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
        <b>{d.nome}</b><br />HCP {d.x.toFixed(1)} · VAC {d.y.toFixed(1)}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 8 }}>

      {/* ── Termos ── */}
      <TermosSection />

      {/* ── Contexto ── */}
      {ctx && (
        <div style={{ background: "linear-gradient(135deg, var(--bg-card) 0%, var(--bg-hover) 100%)",
          border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              🏆 PGA Aroeira II · 1–3 Maio 2026
            </span>
            <a href="https://competicoes.fpg.pt/evento/campeonato-nacional-de-jovens-sub10-12-14-16-18-pga-aroeira/"
               target="_blank" rel="noopener noreferrer"
               style={{ fontSize: 11, color: "var(--chart-2)", marginLeft: "auto" }}>Ver evento ↗</a>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Marcas de saída</div>
              <div style={{ display: "flex", gap: 5 }}>
                {ctx.tees.map(tee => (
                  <span key={tee} style={{ fontSize: 13, fontWeight: 800, padding: "4px 12px", borderRadius: 20,
                    background: TEE_STYLE[tee]?.bg ?? "#888", color: TEE_STYLE[tee]?.color ?? "#fff",
                    border: TEE_STYLE[tee]?.border, boxShadow: "0 1px 3px rgba(0,0,0,.15)" }}>
                    {tee}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Formato</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{ctx.formato}</div>
            </div>
            {ctx.maxScore && (
              <div style={{ background: "color-mix(in srgb,var(--color-warn) 15%,transparent)", border: "1px solid var(--color-warn)", borderRadius: 8, padding: "6px 12px" }}>
                <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Máx/buraco</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "var(--color-warn)" }}>{ctx.maxScore}</div>
              </div>
            )}
            {[
              { l: "Inscritos", v: t.totalInscritos },
              ...(avgVac ? [{ l: "VAC médio", v: avgVac.toFixed(1) }] : []),
              ...(avgHcp ? [{ l: "HCP médio", v: avgHcp.toFixed(1) }] : []),
            ].map(k => (
              <div key={k.l}>
                <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{k.l}</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{k.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Mapa do campo (scatter HCP×VAC) ── */}
      {scatterAll.length >= 3 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
            Posicionamento no campo
            <span className="muted" style={{ fontWeight: 400, fontSize: 11, marginLeft: 8 }}>HCP × VAC — quanto mais à esquerda e em baixo, melhor</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              {avgHcp && <ReferenceLine x={avgHcp} stroke="var(--chart-2)" strokeDasharray="4 2" strokeOpacity={0.6}
                label={{ value: "HCP méd", position: "top", fontSize: 9, fill: "var(--chart-2)" }} />}
              {avgVac && <ReferenceLine y={avgVac} stroke="var(--chart-2)" strokeDasharray="4 2" strokeOpacity={0.6}
                label={{ value: "VAC méd", position: "right", fontSize: 9, fill: "var(--chart-2)" }} />}
              <XAxis type="number" dataKey="x" name="HCP"
                label={{ value: "Handicap Index", position: "insideBottom", offset: -15, fontSize: 10 }}
                tick={{ fontSize: 10 }} stroke="var(--border)" />
              <YAxis type="number" dataKey="y" name="VAC"
                label={{ value: "VAC", angle: -90, position: "insideLeft", fontSize: 10 }}
                tick={{ fontSize: 10 }} stroke="var(--border)" />
              <Tooltip content={<ScatterTip />} />
              <Scatter data={scatterAll} fill="#3b82f6" fillOpacity={0.75} r={7} stroke="#1d4ed8" strokeWidth={1}>
                <LabelList dataKey="nome" position="top" style={{ fontSize: 9, fill: "var(--text-2)" }} />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Tabela Aroeira ── */}
      {withData.length > 0 && (
        <AroeiraBurTable players={withData.filter(p => p.agg != null).map(p => ({
          nome: nossosByFed.get(p.fed)?.name ?? p.nome,
          fed: p.fed, agg: p.agg!,
        }))} />
      )}

      {/* ── Cards individuais ── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>Análise individual</span>
          {loading && (
            <span className="muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
              A carregar… {nDone}/{nTotal}
              <span style={{ display: "inline-block", width: 60, height: 3, background: "var(--bg-page)", borderRadius: 2, verticalAlign: "middle" }}>
                <span style={{ display: "block", height: "100%", width: `${nTotal ? nDone/nTotal*100 : 0}%`,
                  background: "var(--chart-2)", borderRadius: 2, transition: "width 0.3s" }} />
              </span>
            </span>
          )}
          {sorted.length > 0 && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              {([["vac","VAC"],["hcp","HCP"],["avgSD","SD"],["birdiePct","Birdies"],["aroeira","Aroeira"]] as const).map(([k,l]) => (
                <button key={k} onClick={() => setSortKey(k)}
                  style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                    background: sortKey === k ? "var(--chart-2)" : "var(--bg-card)",
                    color: sortKey === k ? "#fff" : "var(--text-2)",
                    border: `1px solid ${sortKey === k ? "var(--chart-2)" : "var(--border)"}`,
                    fontWeight: sortKey === k ? 700 : 400 }}>
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
          {sorted.map((pl, idx) => {
            const p   = nossosByFed.get(pl.fed);
            const agg = pl.agg!;
            const st  = statsDb[pl.fed];
            const rank = allByVac.findIndex(j => j.fed === pl.fed) + 1;
            const rankPct = rank / allByVac.length;
            const rankColor = rankPct <= 0.33 ? "var(--color-good)" : rankPct <= 0.66 ? "var(--color-warn)" : "var(--color-bad)";
            const sd5cls = agg.last5AvgSD != null ? sdClassByHcp(agg.last5AvgSD, pl.hcp) : "muted";
            const sdcls  = agg.avgSD != null ? sdClassByHcp(agg.avgSD, pl.hcp) : "muted";
            const dist   = agg.scoreDist;
            const tot    = dist.total;

            return (
              <div key={pl.fed} style={{
                background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10,
                overflow: "hidden", display: "flex", flexDirection: "column",
                boxShadow: "0 1px 3px rgba(0,0,0,.06)",
              }}>
                {/* ─ Header ─ */}
                <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", gap: 10 }}>
                  {/* Rank badge */}
                  <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 14, fontWeight: 900,
                    background: rank <= 3 ? "var(--medal-gold,#f59e0b)" : "var(--bg-page)", color: rank <= 3 ? "#fff" : rankColor,
                    border: `2px solid ${rankColor}` }}>
                    {rank}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a href={`/jogadores/${pl.fed}?view=by_date`} target="_blank" rel="noopener noreferrer"
                      style={{ fontWeight: 800, fontSize: 15, color: "inherit", textDecoration: "none", display: "block",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p?.name ?? pl.nome.split(" ").slice(0, 3).join(" ")}
                    </a>
                    <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
                      {p && <SexBadge sex={p.sex} size="sm" />}
                      {p?.escalao && <span className={`p p-sm p-${escCls(p.escalao)}`} style={{ fontSize: 9 }}>{escShort(p.escalao)}</span>}
                      {p?.dob && <AnoEscalaoPill dob={p.dob} escalao={t.escalao} />}
                      {p?.clube && <span className="muted" style={{ fontSize: 10 }}>{p.clube}</span>}
                      {!p && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--bg-page)", color: "var(--text-3)", border: "1px solid var(--border)" }}>externo</span>}
                    </div>
                  </div>
                  {/* VAC destaque */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>VAC</div>
                    <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1, color: rankColor }}>{pl.vac?.toFixed(1) ?? "–"}</div>
                    <div style={{ fontSize: 9, color: "var(--text-3)" }}>{rank}º de {allByVac.length}</div>
                  </div>
                </div>

                {/* ─ KPIs ─ */}
                <div style={{ display: "flex", padding: "8px 14px", gap: 0, borderBottom: "1px solid var(--border)" }}>
                  {[
                    { l: "HCP",       v: pl.hcp?.toFixed(1),           c: "var(--text-1)" },
                    { l: "Rondas",    v: `${agg.nRounds} (6m)`,         c: "var(--text-2)" },
                    { l: "Gross méd", v: agg.avgGross?.toFixed(1),      c: "var(--text-1)" },
                    { l: "Melhor",    v: agg.bestGross?.toString(),      c: "var(--color-good)" },
                  ].map((k, i) => (
                    <div key={k.l} style={{ flex: 1, textAlign: "center",
                      borderRight: i < 3 ? "1px solid var(--border)" : "none", padding: "2px 4px" }}>
                      <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 1 }}>{k.l}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: k.c }}>{k.v ?? "–"}</div>
                    </div>
                  ))}
                </div>

                {/* ─ SD ─ */}
                <div style={{ display: "flex", padding: "8px 14px", gap: 0, borderBottom: "1px solid var(--border)" }}>
                  {[
                    { l: "SD médio", v: agg.avgSD?.toFixed(1), cls: sdcls },
                    { l: "SD últimas 5", v: agg.last5AvgSD?.toFixed(1), cls: sd5cls },
                    { l: "Consist. (±)", v: agg.grossStdDev != null ? `±${agg.grossStdDev.toFixed(1)}` : null,
                      c: agg.grossStdDev != null ? (agg.grossStdDev < 4 ? "var(--color-good)" : agg.grossStdDev < 7 ? "var(--color-warn)" : "var(--color-bad)") : "var(--text-3)" },
                    ...(agg.aroeira.nRounds > 0 ? [{ l: `Aroeira ×${agg.aroeira.nRounds}`, v: agg.aroeira.avgGross?.toFixed(1), c: "var(--chart-2)", cls: undefined }] : []),
                  ].map((k, i, arr) => (
                    <div key={k.l} style={{ flex: 1, textAlign: "center",
                      borderRight: i < arr.length - 1 ? "1px solid var(--border)" : "none", padding: "2px 4px" }}>
                      <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 1 }}>{k.l}</div>
                      {k.cls ? (
                        <span className={`p p-${k.cls}`} style={{ fontSize: 13, padding: "1px 6px" }}>{k.v ?? "–"}</span>
                      ) : (
                        <div style={{ fontSize: 14, fontWeight: 700, color: k.c ?? "var(--text-1)" }}>{k.v ?? "–"}</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* ─ Scoring distribution ─ */}
                {tot > 0 && (() => {
                  const segs = [
                    { key: "eagle",  n: dist.eagle,  cls: "seg-eagle",  label: "Eagle",   circle: true  },
                    { key: "birdie", n: dist.birdie, cls: "seg-birdie", label: "Birdie",  circle: true  },
                    { key: "par",    n: dist.par,    cls: "",            label: "Par",     circle: false },
                    { key: "bogey",  n: dist.bogey,  cls: "seg-bogey",  label: "Bogey",   circle: false },
                    { key: "double", n: dist.double, cls: "seg-double", label: "Duplo",   circle: false },
                    { key: "triple", n: dist.triple, cls: "seg-triple", label: "Triple+", circle: false },
                  ].filter(s => s.n > 0);
                  return (
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
                        Distribuição · {tot} buracos
                      </div>
                      <div style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden", gap: 1, marginBottom: 6, background: "var(--bg-page)" }}>
                        {segs.map(s => (
                          <div key={s.key} title={`${s.label}: ${(s.n/tot*100).toFixed(0)}% (${s.n})`}
                            style={{ flex: s.n, minWidth: 2, background: s.key === "par" ? "var(--border)" : undefined }}
                            className={s.key !== "par" ? s.cls : ""} />
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: "3px 10px", flexWrap: "wrap" }}>
                        {segs.map(s => (
                          <span key={s.key} style={{ fontSize: 10, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 3 }}>
                            <span className={s.key !== "par" ? s.cls : ""}
                              style={{ width: 8, height: 8, display: "inline-block", flexShrink: 0,
                                borderRadius: s.circle ? "50%" : 2,
                                background: s.key === "par" ? "var(--border)" : undefined }} />
                            {s.label} <b>{(s.n/tot*100).toFixed(0)}%</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* ─ Par 3/4/5 + voltas ─ */}
                <div style={{ padding: "10px 14px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {([3,4,5] as const).map(pp => {
                    const bp = agg.byPar[pp];
                    if (!bp) return null;
                    const col = bp.avgVsPar < -0.05 ? "var(--color-good)" : bp.avgVsPar < 0.3 ? "var(--text-1)" : bp.avgVsPar < 0.7 ? "var(--color-warn)" : "var(--color-bad)";
                    const barW = Math.min(100, Math.max(0, (1 - (bp.avgVsPar - (-0.5)) / 2) * 100));
                    return (
                      <div key={pp} style={{ flex: "1 1 70px", background: "var(--bg-page)", borderRadius: 6, padding: "6px 8px", minWidth: 64 }}>
                        <div style={{ fontSize: 9, color: "var(--text-3)", marginBottom: 2 }}>PAR {pp}</div>
                        <div style={{ fontSize: 17, fontWeight: 900, color: col, lineHeight: 1 }}>
                          {bp.avgVsPar > 0 ? "+" : ""}{bp.avgVsPar.toFixed(2)}
                        </div>
                        <div style={{ marginTop: 3, height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ width: `${barW}%`, height: "100%", background: col, borderRadius: 2 }} />
                        </div>
                        <div style={{ fontSize: 9, color: "var(--text-3)", marginTop: 2 }}>{bp.subParPct.toFixed(0)}% sub-par</div>
                      </div>
                    );
                  })}
                  {agg.f9avg != null && agg.b9avg != null && [
                    { l: "1ª volta", v: agg.f9avg },
                    { l: "2ª volta", v: agg.b9avg },
                  ].map(h => (
                    <div key={h.l} style={{ flex: "1 1 60px", background: "var(--bg-page)", borderRadius: 6, padding: "6px 8px", minWidth: 56 }}>
                      <div style={{ fontSize: 9, color: "var(--text-3)", marginBottom: 2 }}>{h.l}</div>
                      <div style={{ fontSize: 17, fontWeight: 900, lineHeight: 1,
                        color: h.v < 0 ? "var(--color-good)" : h.v < 2 ? "var(--text-1)" : h.v < 4 ? "var(--color-warn)" : "var(--color-bad)" }}>
                        {h.v > 0 ? "+" : ""}{h.v.toFixed(1)}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--text-3)", marginTop: 2 }}>vs par</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {nDone === nTotal && playerLoads.filter(p => p.status === "nodata").length > 0 && (
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            Sem dados suficientes (últimos 6m): {playerLoads.filter(p => p.status === "nodata").map(p => nossosByFed.get(p.fed)?.name ?? p.nome.split(" ")[0]).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PAGINA PRINCIPAL
   ═══════════════════════════════════════════════════════ */
type PageView = "inscricoes" | "analise" | "resultados";

export default function NacionaisPage() {
  const { players } = useAppContext();
  const statsDb = usePlayerStats();

  const [torneios, setTorneios] = useState<TorneioData[]>(() =>
    TORNEIOS_CONFIG.map(t => ({ ...t, totalInscritos: 0, jogadores: [], lastFetched: null, _status: "idle" as const }))
  );
  const [activeTcode, setActiveTcode] = useState<string>("10941");
  const [view, setView] = useState<PageView>("inscricoes");
  const inFlight = useRef(new Set<string>());

  const nossosByFed = useMemo(() => {
    const m = new Map<string, BdPlayer>();
    const lista = Array.isArray(players) ? players : Object.values(players ?? {});
    for (const p of lista) {
      const fed = String((p as any).nfed ?? (p as any).fed ?? "").trim();
      if (!fed) continue;
      m.set(fed, { name: p.name, escalao: p.escalao, sex: p.sex, fed, clube: (p as any).club?.short ?? "", dob: (p as any).dob ?? "" });
    }
    return m;
  }, [players]);

  const nossosFedSet = useMemo(() => new Set(nossosByFed.keys()), [nossosByFed]);

  const fetchTorneio = useCallback(async (tcode: string) => {
    if (inFlight.current.has(tcode)) return;
    inFlight.current.add(tcode);
    setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, _status: "loading" } : t));
    try {
      const res = await fetch(`/api/inscricoes?tcode=${tcode}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, ...data, _status: "ok" } : t));
    } catch (err) {
      console.error(`inscricoes tcode=${tcode}:`, err);
      setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, _status: "error" } : t));
    } finally {
      inFlight.current.delete(tcode);
    }
  }, []);

  useEffect(() => {
    const t = torneios.find(x => x.tcode === activeTcode);
    if (t && t._status === "idle") fetchTorneio(activeTcode);
  }, [activeTcode, torneios, fetchTorneio]);

  const refreshAll = useCallback(() => {
    inFlight.current.clear();
    setTorneios(prev => prev.map(t => ({ ...t, _status: "idle", jogadores: [], totalInscritos: 0, lastFetched: null })));
    TORNEIOS_CONFIG.reduce((chain, cfg) =>
      chain.then(() => fetchTorneio(cfg.tcode).then(() => new Promise<void>(r => setTimeout(r, 350)))),
      Promise.resolve()
    );
  }, [fetchTorneio]);

  const torneioActivo = torneios.find(t => t.tcode === activeTcode) ?? torneios[0];
  const totalNossosInscritos = useMemo(() => {
    const feds = new Set<string>();
    for (const t of torneios) for (const j of t.jogadores) if (j.fed && nossosFedSet.has(j.fed)) feds.add(j.fed);
    return feds.size;
  }, [torneios, nossosFedSet]);

  return (
    <div className="jogadores-page nac-page">
      <div className="toolbar">
        <div className="toolbar-left" style={{ flexWrap: "wrap", gap: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 13, flexShrink: 0 }}>🏆 Nacionais Jovens</span>
          <div className="toolbar-sep" style={{ flexShrink: 0 }} />
          {([
            { key: "inscricoes", label: "Inscrições" },
            { key: "analise",    label: "📊 Análise" },
            { key: "resultados", label: "🏅 Resultados", disabled: true },
          ] as const).map(({ key, label, disabled }) => (
            <button key={key}
              className={"tourn-tab tourn-tab-sm" + (view === key ? " active" : "")}
              onClick={() => !disabled && setView(key as PageView)}
              title={disabled ? "Disponivel quando o torneio decorrer" : undefined}
              style={view === key
                ? { flexShrink: 0 }
                : { flexShrink: 0, background: "var(--bg-muted)", color: disabled ? "var(--text-3)" : "var(--text-2)", borderColor: "var(--border)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
              {label}
            </button>
          ))}
          <div className="toolbar-sep" style={{ flexShrink: 0 }} />
          <button className="tourn-tab tourn-tab-sm" onClick={refreshAll}
            style={{ flexShrink: 0, background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}
            title="Actualizar todos os escaloes">
            ↺ Actualizar
          </button>
        </div>
        <div className="toolbar-right">
          {totalNossosInscritos > 0 && (
            <div className="chip">{totalNossosInscritos} inscrito{totalNossosInscritos !== 1 ? "s" : ""}</div>
          )}
        </div>
      </div>

      <div className="nac-cards-row">
        {torneios.map(t => {
          return (
            <TorneioCard key={t.tcode} t={t}
              active={activeTcode === t.tcode}
              onClick={() => setActiveTcode(t.tcode)} />
          );
        })}
      </div>

      <div className="nac-content">
        <div className="nac-det-header">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            Campeonato Nacional de Jovens — {torneioActivo.nome}
          </h3>
          <a href={`https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=000&tcode=${torneioActivo.tcode}`}
             target="_blank" rel="noopener noreferrer"
             style={{ fontSize: 11, color: "var(--chart-2)", flexShrink: 0 }}>
            ver em datagolf ↗
          </a>
        </div>
        {view === "inscricoes"
          ? <InscricoesView t={torneioActivo} nossosFedSet={nossosFedSet} nossosByFed={nossosByFed} statsDb={statsDb} />
          : <AnaliseView    t={torneioActivo} nossosByFed={nossosByFed} statsDb={statsDb} />
        }
      </div>
    </div>
  );
}

/*
CSS a adicionar em App.css:

.nac-cards-row { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px 8px; border-bottom: 1px solid var(--border); }
.nac-spin { animation: nac-rotate 1s linear infinite; }
@keyframes nac-rotate { to { transform: rotate(360deg); } }
.nac-content { padding: 0 12px 20px; }
.nac-det-header { display: flex; align-items: baseline; gap: 12px; padding: 12px 0 8px; border-bottom: 1px solid var(--border); margin-bottom: 8px; flex-wrap: wrap; }
.nac-det-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.nac-row-match { background: color-mix(in srgb, var(--color-good) 8%, transparent); }
.nac-row-match:hover { background: color-mix(in srgb, var(--color-good) 14%, transparent); }
*/
