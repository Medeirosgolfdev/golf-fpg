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
  lastFetched: string | null; lastChanged: string | null; fpgUrl?: string;
  fromCache?: boolean; fetchError?: string;
  diff?: { added: string[]; removed: string[] } | null;
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
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {t.diff && (t.diff.added.length > 0 || t.diff.removed.length > 0) && (
            <span style={{ fontSize: 10, background: "var(--color-warn)", color: "#fff", padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}
              title={[t.diff.added.length ? `+${t.diff.added.join(", ")}` : "", t.diff.removed.length ? `-${t.diff.removed.join(", ")}` : ""].filter(Boolean).join(" · ")}>
              {t.diff.added.length > 0 && `+${t.diff.added.length} novo${t.diff.added.length > 1 ? "s" : ""}`}
              {t.diff.added.length > 0 && t.diff.removed.length > 0 && " · "}
              {t.diff.removed.length > 0 && `-${t.diff.removed.length} removido${t.diff.removed.length > 1 ? "s" : ""}`}
            </span>
          )}
          {t.lastFetched && (
            <span className="muted" style={{ fontSize: 10 }}
              title={t.fromCache ? `Cache de ${t.lastFetched}${t.lastChanged && t.lastChanged !== t.lastFetched ? " · alterado " + t.lastChanged : ""}` : "Dados frescos"}>
              {t.fromCache ? "💾" : "🔄"} {fmtTime(t.lastFetched)}
            </span>
          )}
          {t.fetchError && <span className="muted" style={{ fontSize: 10, color: "var(--color-warn)" }} title={t.fetchError}>⚠️ cache</span>}
          {t.fpgUrl && <a href={t.fpgUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--chart-2)" }}>datagolf ↗</a>}
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

/* ── Tabela buraco-a-buraco no Aroeira — Heat Map ── */
/* ════════════════════════════════════════════════════════════════════
   ANÁLISE PRÉ-TORNEIO — Aroeira II · estilo DataGolf/Opta
   ════════════════════════════════════════════════════════════════════ */

/* Métricas-chave específicas de Aroeira / formato 54H pancadas */
interface ScoutingReport {
  // Identidade
  nome: string; fed: string; hcp: number | null; vac: number | null;
  rank: number; fieldSize: number;
  // Forma recente
  formDelta: number | null;       // last5AvgSD - avgSD (negativo = em alta)
  sdAvg: number | null; sd5: number | null; sdStdDev: number | null;
  // Métricas-chave de campo
  par5avg: number | null;         // avg vs par nos par-5 (oportunidades de birdie)
  par3avg: number | null;         // avg vs par nos par-3 (dificuldade Aroeira)
  blowupPct: number;              // % buracos duplo+
  birdiePct: number;              // % buracos birdie+
  // Resistência (54 buracos)
  grossStdDev: number | null;     // consistência bruta
  f9: number | null; b9: number | null;  // frente/costas vs par
  // Campo
  aroeiraRounds: number; aroeiraAvg: number | null;
  // Actividade
  r3m: number | null;
  // Contexto
  agg: AggStats;
}

/* ── Derivar métricas de scouting ── */
function buildReport(
  pl: PlayerLoad, rank: number, fieldSize: number, statsDb: StatsDb
): ScoutingReport {
  const agg = pl.agg!;
  const st  = statsDb[pl.fed];
  const dist = agg.scoreDist;
  const tot  = dist.total || 1;
  return {
    nome: pl.nome, fed: pl.fed, hcp: pl.hcp, vac: pl.vac, rank, fieldSize,
    formDelta: agg.last5AvgSD != null && agg.avgSD != null ? agg.last5AvgSD - agg.avgSD : null,
    sdAvg: agg.avgSD, sd5: agg.last5AvgSD, sdStdDev: agg.sdStdDev,
    par5avg: agg.byPar[5]?.avgVsPar ?? null,
    par3avg: agg.byPar[3]?.avgVsPar ?? null,
    blowupPct: (dist.double + dist.triple) / tot * 100,
    birdiePct: (dist.eagle + dist.birdie)  / tot * 100,
    grossStdDev: agg.grossStdDev,
    f9: agg.f9avg, b9: agg.b9avg,
    aroeiraRounds: agg.aroeira.nRounds,
    aroeiraAvg: agg.aroeira.avgGross,
    r3m: st?.roundsLast3m ?? null,
    agg,
  };
}

/* ── Badges de insight ── */
type InsightLevel = "edge" | "risk" | "neutral";
interface Insight { level: InsightLevel; text: string; }

function deriveInsights(r: ScoutingReport, allReports: ScoutingReport[]): Insight[] {
  const ins: Insight[] = [];
  const others = allReports.filter(x => x.fed !== r.fed);

  // Forma recente
  if (r.formDelta != null) {
    if (r.formDelta < -1.5)       ins.push({ level: "edge",  text: `Em alta: SD5 ${Math.abs(r.formDelta).toFixed(1)}pts abaixo da média` });
    else if (r.formDelta > 1.5)   ins.push({ level: "risk",  text: `Forma descendente: SD5 ${r.formDelta.toFixed(1)}pts acima da média` });
  }

  // Par-5: oportunidades de birdie em 54H
  if (r.par5avg != null) {
    const best5 = Math.min(...allReports.map(x => x.par5avg ?? 99));
    if (r.par5avg <= best5 + 0.1) ins.push({ level: "edge",  text: `Melhor par-5 do campo (+${r.par5avg.toFixed(2)}/buraco)` });
    else if (r.par5avg < 0.7)     ins.push({ level: "edge",  text: `Par-5 forte: +${r.par5avg.toFixed(2)}/buraco` });
    else if (r.par5avg > 1.5)     ins.push({ level: "risk",  text: `Par-5 vulnerável: +${r.par5avg.toFixed(2)}/buraco` });
  }

  // Blow-up avoidance — crítico em 54 pancadas sem cut
  const avgBlowup = allReports.reduce((s, x) => s + x.blowupPct, 0) / allReports.length;
  if (r.blowupPct < avgBlowup - 3)  ins.push({ level: "edge",  text: `Baixo risco de pancadas grandes: ${r.blowupPct.toFixed(0)}% duplo+` });
  else if (r.blowupPct > avgBlowup + 5) ins.push({ level: "risk",  text: `Alto risco: ${r.blowupPct.toFixed(0)}% duplo+ (média campo ${avgBlowup.toFixed(0)}%)` });

  // Consistência (σ do gross)
  if (r.grossStdDev != null) {
    const avgStd = allReports.filter(x => x.grossStdDev).reduce((s, x) => s + (x.grossStdDev ?? 0), 0) / (allReports.filter(x => x.grossStdDev).length || 1);
    if (r.grossStdDev < avgStd - 2)    ins.push({ level: "edge",  text: `Muito consistente: σ ±${r.grossStdDev.toFixed(1)} (média ${avgStd.toFixed(1)})` });
    else if (r.grossStdDev > avgStd + 3) ins.push({ level: "risk",  text: `Errático: σ ±${r.grossStdDev.toFixed(1)} — resultados imprevisíveis` });
  }

  // Experiência em Aroeira
  if (r.aroeiraRounds >= 5)           ins.push({ level: "edge",  text: `${r.aroeiraRounds} rondas em Aroeira — conhece o campo` });
  else if (r.aroeiraRounds === 0)      ins.push({ level: "risk",  text: `Sem histórico em Aroeira` });

  // Padrão frente/costas
  if (r.f9 != null && r.b9 != null) {
    const diff = r.b9 - r.f9;
    if (diff < -1.5)                   ins.push({ level: "edge",  text: `Forte fechador: 2ª volta ${Math.abs(diff).toFixed(1)} melhor que a 1ª` });
    else if (diff > 1.5)               ins.push({ level: "risk",  text: `Tende a ceder na 2ª volta (+${diff.toFixed(1)} vs 1ª)` });
  }

  // Actividade competitiva
  if (r.r3m != null) {
    if (r.r3m === 0)                   ins.push({ level: "risk",  text: `Sem rondas nos últimos 3 meses — falta de ritmo` });
    else if (r.r3m >= 8)               ins.push({ level: "edge",  text: `Em ritmo: ${r.r3m} rondas nos últimos 3 meses` });
  }

  return ins;
}

/* ── Narrativa de abertura por jogador ── */
function scoutingNarrative(r: ScoutingReport, insights: Insight[]): string {
  const parts: string[] = [];

  if (r.rank === 1) parts.push(`Favorito com o VAC mais baixo do campo (${r.vac?.toFixed(1)})`);
  else if (r.rank <= 3) parts.push(`Entre os principais candidatos (VAC ${r.vac?.toFixed(1)}, ${r.rank}º no campo)`);
  else parts.push(`${r.rank}º no campo por VAC (${r.vac?.toFixed(1)})`);

  const edges = insights.filter(i => i.level === "edge");
  const risks = insights.filter(i => i.level === "risk");

  if (edges.length > 0 && risks.length === 0)
    parts.push(`perfil sólido sem pontos de preocupação evidentes nos dados`);
  else if (risks.length > 0 && edges.length === 0)
    parts.push(`os dados apontam para algumas vulnerabilidades relevantes`);
  else if (r.formDelta != null && r.formDelta < -1)
    parts.push(`forma recente é o principal argumento positivo`);
  else if (r.aroeiraRounds >= 4)
    parts.push(`experiência no campo pode ser o factor decisivo`);

  if (r.par5avg != null && r.par5avg < 0.8)
    parts.push(`capitaliza bem nas oportunidades de birdie nos par-5`);
  else if (r.blowupPct > 15)
    parts.push(`a gestão de risco nos momentos difíceis será determinante`);

  return parts.join('; ') + '.';
}

/* ── Componente principal de análise por jogador ── */
function PlayerScoutCard({ r, insights, bdPlayer }: {
  r: ScoutingReport; insights: Insight[]; bdPlayer?: BdPlayer;
}) {
  const edges = insights.filter(i => i.level === "edge");
  const risks = insights.filter(i => i.level === "risk");
  const narrative = scoutingNarrative(r, insights);

  const sdDeltaColor = r.formDelta == null ? "var(--text-3)"
    : r.formDelta < -1 ? "var(--color-good)"
    : r.formDelta > 1  ? "var(--color-bad)"
    : "var(--text-2)";

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>

      {/* ── Cabeçalho ── */}
      <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--border)" }}>
        {/* Rank + VAC */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          minWidth: 72, padding: "12px 10px", background: "var(--bg-page)", borderRight: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Campo</div>
          <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1,
            color: r.rank <= 1 ? "var(--medal-gold,#f59e0b)" : r.rank <= 3 ? "var(--color-good)" : r.rank <= Math.ceil(r.fieldSize / 2) ? "var(--text-1)" : "var(--text-3)" }}>
            {r.rank}º
          </div>
          <div style={{ fontSize: 9, color: "var(--text-3)" }}>de {r.fieldSize}</div>
        </div>

        {/* Nome + narrative */}
        <div style={{ flex: 1, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <a href={`/jogadores/${r.fed}?view=by_date`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 16, fontWeight: 800, color: "inherit", textDecoration: "none" }}>
              {bdPlayer?.name ?? r.nome}
            </a>
            {bdPlayer && <SexBadge sex={bdPlayer.sex} size="sm" />}
            {bdPlayer?.escalao && <span className={`p p-sm p-${escCls(bdPlayer.escalao)}`} style={{ fontSize: 10 }}>{escShort(bdPlayer.escalao)}</span>}
            {bdPlayer?.dob && <AnoEscalaoPill dob={bdPlayer.dob} escalao={bdPlayer.escalao} />}
            {!bdPlayer && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--bg-page)", color: "var(--text-3)", border: "1px solid var(--border)" }}>externo</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, fontStyle: "italic" }}>
            {narrative}
          </div>
        </div>

        {/* VAC destaque */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "12px 16px", borderLeft: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>VAC</div>
          <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1 }}>{r.vac?.toFixed(1) ?? "–"}</div>
          <div style={{ fontSize: 9, color: "var(--text-3)" }}>HCP {r.hcp?.toFixed(1) ?? "–"}</div>
        </div>
      </div>

      {/* ── Métricas ── */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        {[
          { l: "SD médio",    v: r.sdAvg?.toFixed(1),   sub: `${r.agg.nRounds} rondas`,
            cls: r.sdAvg != null ? `p-${sdClassByHcp(r.sdAvg, r.hcp)}` : "" },
          { l: "SD últimas 5", v: r.sd5?.toFixed(1),    sub: r.formDelta != null ? `${r.formDelta > 0 ? "+" : ""}${r.formDelta.toFixed(1)} vs média` : "–",
            cls: r.sd5 != null ? `p-${sdClassByHcp(r.sd5, r.hcp)}` : "",
            subColor: sdDeltaColor },
          { l: "Par-5 / buraco", v: r.par5avg != null ? `${r.par5avg > 0 ? "+" : ""}${r.par5avg.toFixed(2)}` : "–",
            sub: `${r.agg.byPar[5]?.subParPct?.toFixed(0) ?? "–"}% sub-par`,
            color: r.par5avg == null ? "var(--text-3)" : r.par5avg < 0.7 ? "var(--color-good)" : r.par5avg < 1.2 ? "var(--color-warn)" : "var(--color-bad)" },
          { l: "Duplo+",      v: `${r.blowupPct.toFixed(0)}%`, sub: `${r.agg.scoreDist.double + r.agg.scoreDist.triple} buracos`,
            color: r.blowupPct < 8 ? "var(--color-good)" : r.blowupPct < 14 ? "var(--color-warn)" : "var(--color-bad)" },
          { l: "Consistência", v: r.grossStdDev != null ? `±${r.grossStdDev.toFixed(1)}` : "–",
            sub: "σ gross",
            color: r.grossStdDev == null ? "var(--text-3)" : r.grossStdDev < 4 ? "var(--color-good)" : r.grossStdDev < 7 ? "var(--color-warn)" : "var(--color-bad)" },
          ...(r.aroeiraRounds > 0 ? [{ l: `Aroeira ×${r.aroeiraRounds}`, v: r.aroeiraAvg?.toFixed(1), sub: "média gross", color: "var(--chart-2)" }] : []),
        ].map((k, i, arr) => (
          <div key={k.l} style={{ flex: "1 1 90px", padding: "10px 12px",
            borderRight: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
            <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>{k.l}</div>
            {(k as any).cls ? (
              <span className={`p ${(k as any).cls}`} style={{ fontSize: 15, padding: "1px 6px", fontWeight: 800 }}>{k.v ?? "–"}</span>
            ) : (
              <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, color: (k as any).color ?? "var(--text-1)" }}>{k.v ?? "–"}</div>
            )}
            <div style={{ fontSize: 9, marginTop: 2, color: (k as any).subColor ?? "var(--text-3)" }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Insights (edges + risks) ── */}
      {(edges.length + risks.length) > 0 && (
        <div style={{ padding: "10px 14px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[...edges, ...risks].map((ins, i) => (
            <span key={i} style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600,
              background: ins.level === "edge" ? "color-mix(in srgb, var(--color-good) 12%, transparent)"
                : "color-mix(in srgb, var(--color-bad) 10%, transparent)",
              color: ins.level === "edge" ? "var(--color-good)" : "var(--color-bad)",
              border: `1px solid ${ins.level === "edge" ? "color-mix(in srgb, var(--color-good) 30%, transparent)" : "color-mix(in srgb, var(--color-bad) 25%, transparent)"}`,
            }}>
              {ins.level === "edge" ? "▲" : "▼"} {ins.text}
            </span>
          ))}
        </div>
      )}

      {/* ── Scoring distribution mini ── */}
      {r.agg.scoreDist.total > 0 && (() => {
        const d = r.agg.scoreDist; const tot = d.total;
        const segs = [
          { k: "eagle",  n: d.eagle,  cls: "seg-eagle",  l: "Eagle",   circle: true  },
          { k: "birdie", n: d.birdie, cls: "seg-birdie", l: "Birdie",  circle: true  },
          { k: "par",    n: d.par,    cls: "",            l: "Par",     circle: false },
          { k: "bogey",  n: d.bogey,  cls: "seg-bogey",  l: "Bogey",   circle: false },
          { k: "double", n: d.double, cls: "seg-double", l: "Duplo",   circle: false },
          { k: "triple", n: d.triple, cls: "seg-triple", l: "Triple+", circle: false },
        ].filter(s => s.n > 0);
        return (
          <div style={{ padding: "8px 14px 10px", borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "flex", height: 8, borderRadius: 3, overflow: "hidden", gap: 1, marginBottom: 5, background: "var(--bg-page)" }}>
              {segs.map(s => (
                <div key={s.k} title={`${s.l}: ${(s.n/tot*100).toFixed(0)}%`}
                  style={{ flex: s.n, minWidth: 2, background: s.k === "par" ? "var(--border)" : undefined }}
                  className={s.k !== "par" ? s.cls : ""} />
              ))}
            </div>
            <div style={{ display: "flex", gap: "3px 10px", flexWrap: "wrap" }}>
              {segs.map(s => (
                <span key={s.k} style={{ fontSize: 10, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 3 }}>
                  <span className={s.k !== "par" ? s.cls : ""}
                    style={{ width: 7, height: 7, display: "inline-block", flexShrink: 0,
                      borderRadius: s.circle ? "50%" : 2, background: s.k === "par" ? "var(--border)" : undefined }} />
                  {s.l} <b>{(s.n/tot*100).toFixed(0)}%</b>
                  <span style={{ color: "var(--text-3)", fontSize: 9 }}>({s.n})</span>
                </span>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ── Análise de campo: o que decide em Aroeira ── */
function CampoIntelligence({ reports, escalao }: { reports: ScoutingReport[]; escalao: string }) {
  if (reports.length === 0) return null;

  const sorted_vac   = [...reports].sort((a, b) => (a.vac ?? 999) - (b.vac ?? 999));
  const sorted_par5  = [...reports].filter(r => r.par5avg != null).sort((a, b) => (a.par5avg!) - (b.par5avg!));
  const sorted_blow  = [...reports].sort((a, b) => a.blowupPct - b.blowupPct);
  const sorted_cons  = [...reports].filter(r => r.grossStdDev != null).sort((a, b) => (a.grossStdDev!) - (b.grossStdDev!));
  const sorted_ar    = [...reports].filter(r => r.aroeiraRounds > 0).sort((a, b) => (a.aroeiraAvg ?? 999) - (b.aroeiraAvg ?? 999));
  const sorted_form  = [...reports].filter(r => r.formDelta != null).sort((a, b) => (a.formDelta!) - (b.formDelta!));

  function shortName(nome: string) { return nome.split(" ").slice(0, 2).join(" "); }

  const metrics = [
    {
      key: "par5", label: "Par-5 (oportunidades de birdie)",
      desc: `Em ${escalao === "Sub-10" ? "27 buracos" : "54 buracos"}, os par-5 são as principais fontes de birdie. Quem capitaliza aqui ganha terreno.`,
      data: sorted_par5.map(r => ({ nome: shortName(r.nome), v: `${r.par5avg! > 0 ? "+" : ""}${r.par5avg!.toFixed(2)}/h`, fed: r.fed,
        color: r.par5avg! < 0.7 ? "var(--color-good)" : r.par5avg! < 1.2 ? "var(--color-warn)" : "var(--color-bad)" })),
    },
    {
      key: "blowup", label: "Gestão de risco (evitar pancadas grandes)",
      desc: "Em stroke play de 54 buracos sem cut, um buraco de +3 ou +4 pode destruir uma volta inteira.",
      data: sorted_blow.map(r => ({ nome: shortName(r.nome), v: `${r.blowupPct.toFixed(0)}%`, fed: r.fed,
        color: r.blowupPct < 10 ? "var(--color-good)" : r.blowupPct < 16 ? "var(--color-warn)" : "var(--color-bad)" })),
    },
    {
      key: "form", label: "Forma recente (últimas 5 rondas vs média)",
      desc: "Quem chega em alta ao torneio — SD5 melhor que a média pessoal — tem vantagem psicológica e técnica.",
      data: sorted_form.map(r => ({ nome: shortName(r.nome), v: `${r.formDelta! > 0 ? "+" : ""}${r.formDelta!.toFixed(1)}`, fed: r.fed,
        color: r.formDelta! < -1 ? "var(--color-good)" : r.formDelta! > 1 ? "var(--color-bad)" : "var(--text-2)" })),
    },
    ...(sorted_ar.length > 0 ? [{
      key: "aroeira", label: "Experiência em Aroeira",
      desc: "Conhecer o campo — os buracos difíceis, os greens, as linhas — vale pancadas reais em competição.",
      data: sorted_ar.map(r => ({ nome: shortName(r.nome), v: `${r.aroeiraAvg?.toFixed(1)} (${r.aroeiraRounds}×)`, fed: r.fed,
        color: "var(--chart-2)" })),
    }] : []),
    ...(sorted_cons.length > 0 ? [{
      key: "consistency", label: "Consistência (σ do gross)",
      desc: "Quem varia menos de ronda para ronda tem maior probabilidade de terminar os 3 dias perto do seu nível.",
      data: sorted_cons.map(r => ({ nome: shortName(r.nome), v: `±${r.grossStdDev!.toFixed(1)}`, fed: r.fed,
        color: r.grossStdDev! < 4 ? "var(--color-good)" : r.grossStdDev! < 7 ? "var(--color-warn)" : "var(--color-bad)" })),
    }] : []),
  ];

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-page)" }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>O que decide este torneio</div>
        <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
          54 buracos · stroke play · sem cut · Aroeira II
          {escalao === "Sub-12" || escalao === "Sub-10" ? " · máx 10 por buraco" : ""}
        </div>
      </div>
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {metrics.map(m => (
          <div key={m.key}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{m.label}</div>
            <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 8, lineHeight: 1.5 }}>{m.desc}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {m.data.map((d, i) => (
                <div key={d.fed} style={{ display: "flex", alignItems: "center", gap: 6,
                  background: "var(--bg-page)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px" }}>
                  <span style={{ fontSize: 9, color: "var(--text-3)", fontWeight: 600 }}>#{i + 1}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{d.nome}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: d.color }}>{d.v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Tabela Aroeira limpa (sem cells coloridas) ── */
function AroeiraBurTable({ players }: {
  players: { nome: string; fed: string; agg: AggStats }[];
}) {
  const comAroeira = players.filter(p => p.agg.aroeira.nRounds > 0 && p.agg.aroeira.holes.length === 18);
  if (comAroeira.length < 1) return null;

  const pars = comAroeira[0].agg.aroeira.holes.map(h => h.par ?? 4);
  const totalPar = pars.reduce((s, p) => s + p, 0);

  // Quem tem melhor média em cada buraco
  function bestAt(idx: number) {
    const vals = comAroeira.map(p => ({ fed: p.fed, diff: p.agg.aroeira.holes[idx]?.diff })).filter(x => x.diff != null);
    if (!vals.length) return null;
    return vals.reduce((b, x) => (x.diff! < b.diff! ? x : b)).fed;
  }

  function diffStr(diff: number | null) {
    if (diff == null) return "–";
    return (diff > 0 ? "+" : "") + diff.toFixed(2);
  }
  function diffColor(diff: number | null) {
    if (diff == null) return "var(--text-3)";
    if (diff <= 0)   return "var(--color-good)";
    if (diff < 0.75) return "var(--text-1)";
    if (diff < 1.5)  return "var(--color-warn)";
    return "var(--color-bad)";
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>Aroeira — Performance histórica no campo</div>
      <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 12 }}>
        Médias buraco-a-buraco (últimos 6 meses). ★ = melhor do grupo nesse buraco.
      </div>
      <div className="table-wrap" style={{ overflowX: "auto" }}>
        <table className="dtable-lg" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 36, fontSize: 11 }}>B.</th>
              <th style={{ width: 32, fontSize: 11, textAlign: "center" }}>Par</th>
              {comAroeira.map(p => (
                <th key={p.fed} style={{ textAlign: "center", fontSize: 12 }}>
                  <a href={`/jogadores/${p.fed}?view=by_date`} target="_blank" rel="noopener noreferrer"
                    style={{ color: "inherit", textDecoration: "none" }}>
                    {p.nome.split(" ").slice(0, 2).join(" ")}
                  </a>
                  <div style={{ fontSize: 9, color: "var(--text-3)", fontWeight: 400 }}>{p.agg.aroeira.nRounds}× · {p.agg.aroeira.avgGross?.toFixed(1)} avg</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[{ label: "1ª Volta", range: [0, 8] }, { label: "2ª Volta", range: [9, 17] }].map(({ label, range }) => (
              <React.Fragment key={label}>
                <tr>
                  <td colSpan={2 + comAroeira.length}
                    style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", padding: "8px 8px 4px",
                      textTransform: "uppercase", letterSpacing: "0.07em", background: "var(--bg-page)" }}>
                    {label}
                  </td>
                </tr>
                {Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i).map(idx => {
                  const par = pars[idx];
                  const best = bestAt(idx);
                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ textAlign: "center", color: par === 3 ? "#92400e" : par === 5 ? "#1e40af" : "var(--text-2)",
                        fontWeight: 700, fontSize: 11,
                        background: par === 3 ? "#fef9c3" : par === 5 ? "#eff6ff" : "transparent" }}>
                        {par}
                      </td>
                      {comAroeira.map(p => {
                        const h = p.agg.aroeira.holes[idx];
                        const isBest = best === p.fed;
                        return (
                          <td key={p.fed} style={{ textAlign: "center" }}>
                            <span style={{ fontWeight: isBest ? 800 : 600, color: diffColor(h?.diff ?? null), fontSize: 12 }}>
                              {diffStr(h?.diff ?? null)}
                              {isBest && comAroeira.length > 1 && <span style={{ color: "var(--color-good)", fontSize: 10, marginLeft: 2 }}>★</span>}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr style={{ borderTop: "1px solid var(--border)", background: "var(--bg-hover)" }}>
                  <td style={{ fontWeight: 800, fontSize: 11 }}>Sub</td>
                  <td style={{ textAlign: "center", fontWeight: 700, fontSize: 11, color: "var(--text-2)" }}>
                    {pars.slice(range[0], range[1] + 1).reduce((s, p) => s + p, 0)}
                  </td>
                  {comAroeira.map(p => {
                    const sub = p.agg.aroeira.holes.slice(range[0], range[1] + 1).reduce((s, h) => s + (h.diff ?? 0), 0);
                    return (
                      <td key={p.fed} style={{ textAlign: "center", fontWeight: 800,
                        color: diffColor(sub / (range[1] - range[0] + 1)) }}>
                        {sub > 0 ? "+" : ""}{sub.toFixed(1)}
                      </td>
                    );
                  })}
                </tr>
              </React.Fragment>
            ))}
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td style={{ fontWeight: 800 }}>Total</td>
              <td style={{ textAlign: "center", fontWeight: 700, color: "var(--text-2)" }}>{totalPar}</td>
              {comAroeira.map(p => (
                <td key={p.fed} style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 900, fontSize: 15 }}>{p.agg.aroeira.avgGross?.toFixed(1)}</div>
                  <div style={{ fontSize: 10, color: diffColor(p.agg.aroeira.holes.reduce((s, h) => s + (h.diff ?? 0), 0) / 18) }}>
                    {(() => { const d = p.agg.aroeira.holes.reduce((s, h) => s + (h.diff ?? 0), 0); return `${d > 0 ? "+" : ""}${d.toFixed(1)} vs par`; })()}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}



/* ═══════════════════════════════════════════════════════════════════════
   VISTA ANÁLISE — Análise profissional para o Campeonato Nacional
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Termos de Competição ── */

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
  const [sortKey, setSortKey] = useState<"vac"|"par5"|"blowup"|"form"|"aroeira">("vac");

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

  const allByVac = [...t.jogadores].sort((a, b) => (a.vac ?? 999) - (b.vac ?? 999));
  const avgVac   = allByVac.length ? allByVac.reduce((s, j) => s + (j.vac ?? 0), 0) / allByVac.length : null;
  const avgHcp   = allByVac.filter(j => j.hcp).length ? allByVac.reduce((s, j) => s + (j.hcp ?? 0), 0) / allByVac.filter(j => j.hcp).length : null;

  // Construir scouting reports para jogadores com dados
  const withData = playerLoads.filter(p => p.agg);
  const reports  = withData.map(pl => {
    const rank = allByVac.findIndex(j => j.fed === pl.fed) + 1;
    return buildReport(pl, rank, allByVac.length, statsDb);
  });

  const sorted = [...reports].sort((a, b) => {
    if (sortKey === "vac")     return (a.vac ?? 999) - (b.vac ?? 999);
    if (sortKey === "par5")    return (a.par5avg ?? 99) - (b.par5avg ?? 99);
    if (sortKey === "blowup")  return a.blowupPct - b.blowupPct;
    if (sortKey === "form")    return (a.formDelta ?? 99) - (b.formDelta ?? 99);
    if (sortKey === "aroeira") return (a.aroeiraAvg ?? 999) - (b.aroeiraAvg ?? 999);
    return 0;
  });

  // scatter: todos os inscritos
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>

      {/* Termos */}
      <TermosSection />

      {/* Contexto */}
      {ctx && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 13 }}>🏆 PGA Aroeira II · 1–3 Maio 2026</span>
            <a href="https://competicoes.fpg.pt/evento/campeonato-nacional-de-jovens-sub10-12-14-16-18-pga-aroeira/"
               target="_blank" rel="noopener noreferrer"
               style={{ fontSize: 11, color: "var(--chart-2)", marginLeft: "auto" }}>Ver evento ↗</a>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 5 }}>Marcas de saída</div>
              <div style={{ display: "flex", gap: 5 }}>
                {ctx.tees.map(tee => (
                  <span key={tee} style={{ fontSize: 13, fontWeight: 800, padding: "4px 12px", borderRadius: 20,
                    background: TEE_STYLE[tee]?.bg ?? "#888", color: TEE_STYLE[tee]?.color ?? "#fff", border: TEE_STYLE[tee]?.border }}>
                    {tee}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 3 }}>Formato</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{ctx.formato}</div>
            </div>
            {ctx.maxScore && (
              <div style={{ border: "1px solid var(--color-warn)", borderRadius: 7, padding: "5px 12px" }}>
                <div style={{ fontSize: 9, color: "var(--text-3)" }}>Máx/buraco</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "var(--color-warn)" }}>{ctx.maxScore}</div>
              </div>
            )}
            {[{ l: "Inscritos", v: t.totalInscritos }, ...(avgVac ? [{ l: "VAC médio", v: avgVac.toFixed(1) }] : [])].map(k => (
              <div key={k.l}>
                <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 2 }}>{k.l}</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{k.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scatter de posicionamento */}
      {scatterAll.length >= 3 && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
            Posicionamento no campo — HCP × VAC
          </div>
          <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 8 }}>
            Quanto mais à esquerda e em baixo, mais forte o perfil. As linhas marcam a média do campo.
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              {avgHcp && <ReferenceLine x={avgHcp} stroke="var(--border)" strokeDasharray="4 2" />}
              {avgVac && <ReferenceLine y={avgVac} stroke="var(--border)" strokeDasharray="4 2" />}
              <XAxis type="number" dataKey="x" name="HCP"
                label={{ value: "Handicap", position: "insideBottom", offset: -15, fontSize: 10, fill: "var(--text-3)" }}
                tick={{ fontSize: 10 }} stroke="var(--border)" />
              <YAxis type="number" dataKey="y" name="VAC"
                label={{ value: "VAC", angle: -90, position: "insideLeft", fontSize: 10, fill: "var(--text-3)" }}
                tick={{ fontSize: 10 }} stroke="var(--border)" />
              <Tooltip content={<ScatterTip />} />
              <Scatter data={scatterAll} fill="var(--chart-2)" fillOpacity={0.8} r={6} stroke="var(--chart-2)" strokeWidth={1}>
                <LabelList dataKey="nome" position="top" style={{ fontSize: 9, fill: "var(--text-2)" }} />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* O que decide o torneio */}
      {reports.length >= 2 && <CampoIntelligence reports={reports} escalao={t.escalao} />}

      {/* Aroeira histórico */}
      {reports.length > 0 && (
        <AroeiraBurTable players={reports.map(r => ({ nome: nossosByFed.get(r.fed)?.name ?? r.nome, fed: r.fed, agg: r.agg }))} />
      )}

      {/* Scouting reports individuais */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>Scouting Report</span>
          {loading && (
            <span className="muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
              A carregar dados… {nDone}/{nTotal}
              <span style={{ display: "inline-block", width: 60, height: 3, background: "var(--bg-page)", borderRadius: 2 }}>
                <span style={{ display: "block", height: "100%", width: `${nTotal ? nDone/nTotal*100 : 0}%`, background: "var(--chart-2)", borderRadius: 2, transition: "width 0.3s" }} />
              </span>
            </span>
          )}
          {sorted.length > 0 && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: "var(--text-3)", alignSelf: "center" }}>Ordenar:</span>
              {([["vac","VAC"],["par5","Par-5"],["blowup","Duplos−"],["form","Forma"],["aroeira","Aroeira"]] as const).map(([k,l]) => (
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

        {sorted.map(r => (
          <PlayerScoutCard key={r.fed} r={r}
            insights={deriveInsights(r, reports)}
            bdPlayer={nossosByFed.get(r.fed)} />
        ))}

        {nDone === nTotal && playerLoads.filter(p => p.status === "nodata").length > 0 && (
          <div className="muted" style={{ fontSize: 11 }}>
            Sem dados suficientes (6m): {playerLoads.filter(p => p.status === "nodata").map(p => nossosByFed.get(p.fed)?.name ?? p.nome.split(" ")[0]).join(", ")}
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
    TORNEIOS_CONFIG.map(t => ({ ...t, totalInscritos: 0, jogadores: [], lastFetched: null, lastChanged: null, fromCache: undefined, diff: null, _status: "idle" as const }))
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
      chain.then(() => fetchTorneio(cfg.tcode, true).then(() => new Promise<void>(r => setTimeout(r, 350)))),
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
            title="Actualizar todos os escaloes (vai buscar à FPG e detecta alterações)">
            ↺ Actualizar
          </button>
          <button className="tourn-tab tourn-tab-sm" onClick={() => refreshTorneio(activeTcode)}
            style={{ flexShrink: 0, background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}
            title="Verificar alterações apenas neste escalão">
            ↺ Este
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
