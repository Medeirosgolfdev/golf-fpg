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
  const up = trend === "up";
  return (
    <span style={{ color: up ? "var(--color-good)" : "var(--color-bad)", fontWeight: 700, fontSize: 13 }}
      title={delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} (3m)` : ""}>
      {up ? "↓" : "↑"}
    </span>
  );
}


/* ═══════════════════════════════════════════════════════
   PAINEL DE RESUMO — sempre visível
   ═══════════════════════════════════════════════════════ */
function PainelResumo({ torneios, nossosByFed }: {
  torneios: TorneioData[];
  nossosByFed: Map<string, BdPlayer>;
}) {
  const [clubeSel, setClubesSel] = React.useState<string | null>(null);

  const carregados = torneios.filter(t => t.totalInscritos > 0 || t._status === "ok");
  const totalGeral = carregados.reduce((s, t) => s + t.totalInscritos, 0);
  if (totalGeral === 0) return null;

  const escaloes = ["Sub-18", "Sub-16", "Sub-14", "Sub-12", "Sub-10"];
  const byEsc: Record<string, { M: number; F: number }> =
    Object.fromEntries(escaloes.map(e => [e, { M: 0, F: 0 }]));
  for (const t of carregados) {
    if (byEsc[t.escalao]) byEsc[t.escalao][t.sex as "M" | "F"] = t.totalInscritos;
  }

  const anoTotals: Record<"1A" | "2A", number> = { "1A": 0, "2A": 0 };
  let anoBase = 0;
  for (const t of carregados) {
    for (const j of t.jogadores) {
      const p = j.fed ? nossosByFed.get(j.fed) : undefined;
      if (!p?.dob) continue;
      const a = anoEscalao(p.dob, t.escalao);
      if (a) { anoTotals[a]++; anoBase++; }
    }
  }

  const clubeMap = new Map<string, {
    n: number;
    jogadores: { fed: string; nome: string; escalao: string; sex: string }[];
  }>();
  for (const t of carregados) {
    for (const j of t.jogadores) {
      const p = j.fed ? nossosByFed.get(j.fed) : undefined;
      const clube = (p?.clube || j.clube || "").trim();
      if (!clube) continue;
      if (!clubeMap.has(clube)) clubeMap.set(clube, { n: 0, jogadores: [] });
      const entry = clubeMap.get(clube)!;
      entry.n++;
      entry.jogadores.push({
        fed: j.fed ?? "",
        nome: p?.name ?? j.nome,
        escalao: p?.escalao ?? t.escalao,
        sex: p?.sex ?? t.sex,
      });
    }
  }
  const clubes = [...clubeMap.entries()].sort((a, b) => b[1].n - a[1].n);
  const selData = clubeSel ? clubeMap.get(clubeSel) : null;

  return (
    <div style={{ padding: "8px 12px 6px", borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
      {/* Linha 1: total + escalões + anos */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: clubes.length > 0 ? 5 : 0 }}>
        <span style={{ fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{totalGeral} inscritos</span>
        <span className="muted" style={{ fontSize: 11 }}>·</span>
        {escaloes.flatMap((e, ei) => {
          const g = byEsc[e];
          if (g.M === 0 && g.F === 0) return [];
          const items: React.ReactNode[] = [];
          if (g.M > 0) items.push(
            <span key={`${e}M`} style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
              <span className="muted" style={{ fontSize: 10 }}>{e.replace("Sub-", "S")}</span>
              <span className="sex-badge sex-M" style={{ minWidth: 20, textAlign: "center" }}>{g.M}</span>
            </span>
          );
          if (g.F > 0) items.push(
            <span key={`${e}F`} style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
              {g.M === 0 && <span className="muted" style={{ fontSize: 10 }}>{e.replace("Sub-", "S")}</span>}
              <span className="sex-badge sex-F" style={{ minWidth: 20, textAlign: "center" }}>{g.F}</span>
            </span>
          );
          if (ei < escaloes.length - 1) items.push(
            <span key={`sep${ei}`} className="muted" style={{ fontSize: 10 }}>·</span>
          );
          return items;
        })}
        {anoBase > 0 && (
          <>
            <span className="muted" style={{ fontSize: 11 }}>·</span>
            <span style={{ fontSize: 11, flexShrink: 0, display: "inline-flex", gap: 5, alignItems: "center" }}>
              <span className="muted">1º ano</span>
              <span style={{ fontWeight: 700, color: "var(--color-good)" }}>{anoTotals["1A"]}</span>
              <span className="muted">2º ano</span>
              <span style={{ fontWeight: 700, color: "var(--color-bad)" }}>{anoTotals["2A"]}</span>
            </span>
          </>
        )}
      </div>

      {/* Linha 2: clubes */}
      {clubes.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 10, flexShrink: 0 }}>Clubes:</span>
          {clubes.map(([c, d]) => (
            <button key={c}
              onClick={() => setClubesSel(prev => prev === c ? null : c)}
              style={{
                cursor: "pointer", fontSize: 11, padding: "1px 8px", borderRadius: 10,
                fontWeight: 600, border: "1px solid var(--border)",
                background: clubeSel === c ? "var(--accent)" : "var(--bg-muted)",
                color: clubeSel === c ? "#fff" : "var(--text-1)",
              }}>
              {c} {d.n}
            </button>
          ))}
        </div>
      )}

      {/* Jogadores do clube seleccionado */}
      {selData && clubeSel && (
        <div style={{ marginTop: 6, padding: "8px 10px", background: "var(--bg-page)",
          border: "1px solid var(--border)", borderRadius: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 5, color: "var(--text-1)" }}>
            {clubeSel} — {selData.n} inscrito{selData.n !== 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {selData.jogadores.map((jj, i) => (
              <span key={i} style={{
                fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 10,
                background: "var(--bg-card)", border: "1px solid var(--border)",
              }}>
                <SexBadge sex={jj.sex} size="sm" />
                <span className={`p p-sm p-${escCls(jj.escalao)}`} style={{ fontSize: 9 }}>{escShort(jj.escalao)}</span>
                <span>{jj.nome || jj.fed}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Card de escalao — usa o mesmo estilo das pills de escalao da app ── */
function TorneioCard({ t, active, onClick }: {
  t: TorneioData; active: boolean; onClick: () => void;
}) {
  return (
    <button
      className={"tourn-tab tourn-tab-sm" + (active ? " active" : "")}
      onClick={onClick}
      title={`Campeonato Nacional de Jovens ${t.nome}`}
      style={active ? {} : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}
    >
      {escShort(t.escalao)}
      <SexBadge sex={t.sex} size="sm" />
      {t._status === "loading" && <span style={{ opacity: 0.7 }}>⟳</span>}
      {t._status === "error"   && <span style={{ color: "var(--color-bad)", fontWeight: 700 }}>!</span>}
      {t._status === "ok" && t.totalInscritos > 0 && (
        <span style={{
          background: active ? "rgba(255,255,255,0.25)" : "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 10, padding: "0px 5px",
          fontSize: 11, fontWeight: 700,
          color: active ? "inherit" : "var(--text-1)",
          marginLeft: 2,
        }}>{t.totalInscritos}</span>
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
      <div className="detail-toolbar">
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
                <tr key={`${j.fed ?? j.nome}-${i}`} className={p ? "row-match" : ""}>
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

/* ── Contexto Aroeira 2 por escalao ── */
const CONTEXTO_TORNEIO: Record<string, {
  tees: string[]; formato: string; horasPorDia: number; totalBuracos: number; maxScore: number | null;
}> = {
  "Sub-18": { tees: ["Brancas","Azuis"],      formato: "54 buracos · 18/dia · pancadas",      horasPorDia: 18, totalBuracos: 54, maxScore: null },
  "Sub-16": { tees: ["Brancas","Azuis"],      formato: "54 buracos · 18/dia · pancadas",      horasPorDia: 18, totalBuracos: 54, maxScore: null },
  "Sub-14": { tees: ["Amarelas","Vermelhas"], formato: "54 buracos · 18/dia · pancadas",      horasPorDia: 18, totalBuracos: 54, maxScore: null },
  "Sub-12": { tees: ["Vermelhas"],            formato: "54 buracos · 18/dia · max 10/buraco", horasPorDia: 18, totalBuracos: 54, maxScore: 10 },
  "Sub-10": { tees: ["Verdes"],               formato: "27 buracos · 9/dia  · max 10/buraco", horasPorDia: 9,  totalBuracos: 27, maxScore: 10 },
};

const TEE_STYLE: Record<string, { bg: string; color: string; border?: string }> = {
  "Brancas":   { bg: "#f5f5f5", color: "#333", border: "1px solid #bbb" },
  "Azuis":     { bg: "#1d4ed8", color: "#fff" },
  "Amarelas":  { bg: "#ca8a04", color: "#fff" },
  "Vermelhas": { bg: "#dc2626", color: "#fff" },
  "Verdes":    { bg: "#16a34a", color: "#fff" },
};

/* ── Tabela buraco-a-buraco no Aroeira — Heat Map ── */
/* ── AggStats + computeAgg + PlayerLoad ── */
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

type PlayerLoad = {
  fed: string; nome: string; hcp: number | null; vac: number | null;
  status: "idle" | "loading" | "ok" | "nodata" | "error";
  agg: AggStats | null;
};

// Janela temporal configurável
type AggWindow = { months: number } | { year: number };

function makeCutoff(months: number): number {
  const d = new Date(); d.setMonth(d.getMonth() - months);
  return parseInt(d.toISOString().slice(0, 10).replace(/-/g, ""));
}

function computeAgg(
  data: import("../data/playerDataLoader").PlayerPageData,
  window: AggWindow = { months: 12 }
): AggStats | null {
  const fromDate = "year" in window ? window.year * 10000 + 101  : makeCutoff(window.months);
  const toDate   = "year" in window ? window.year * 10000 + 1231 : 99999999;
  const dist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, total: 0 };
  const parAcc: Record<number, { diff: number; n: number; under: number }> = {};
  let grossSum = 0, nRounds = 0, nCard = 0, bestGross: number | null = null;
  let f9diff = 0, b9diff = 0, fbN = 0;
  const sdAll: { sd: number; ds: number }[] = [];
  const grossAll: number[] = [];
  let arGross = 0, arN = 0;
  const arTees = new Set<string>();
  const arHoleSums: { gSum: number; pSum: number; n: number }[] =
    Array.from({ length: 18 }, () => ({ gSum: 0, pSum: 0, n: 0 }));

  for (const cd of data.DATA) {
    const isAroeira = /aroeira/i.test(cd.course);
    for (const r of cd.rounds) {
      // Filtro de data — janela configurável (meses rolantes ou ano de calendário)
      if (r.dateSort && (Number(r.dateSort) < fromDate || Number(r.dateSort) > toDate)) continue;

      // Aceitar rondas de torneio (18h) e Drive Challenge válidas (9h)
      const nH: number = r.holeCount ?? 18;
      if (nH === 9) {
        if (r._isTreino || r._isTeamEvent || r.gross == null) continue;
        const o = (r.scoreOrigin || "").trim();
        if (o === "EDS" || o === "Indiv" || o === "Treino") continue;
        const g = Number(r.gross);
        if (g <= 25 || g > 70) continue;
      } else {
        // 18h: rejeitar treinos e origens não-competitivas
        if (r._isTreino || r._isTeamEvent) continue;
        const o = (r.scoreOrigin || "").trim();
        if (o === "EDS" || o === "Indiv" || o === "Treino" || o === "Extra") continue;
        const g = Number(r.gross ?? 0);
        if (g < 50 || g > 130) continue;
      }

      const g = Number(r.gross);
      if (isNaN(g)) continue;
      grossSum += g; grossAll.push(g); nRounds++;
      if (bestGross === null || g < bestGross) bestGross = g;
      if (r.sd != null && !isNaN(Number(r.sd)) && Number(r.sd) !== 0)
        sdAll.push({ sd: Number(r.sd), ds: r.dateSort ?? 0 });

      if (isAroeira && nH === 18) {
        arGross += g; arN++;
        if (r.tee) arTees.add(r.tee);
      }

      const holes = data.HOLES[r.scoreId];
      if (holes?.g && holes.g.length >= nH) {
        nCard++;
        let f9 = 0, b9 = 0;
        for (let i = 0; i < nH; i++) {
          const hg = holes.g[i]; const hp = holes.p[i];
          if (hg == null || hp == null) continue;
          const diff = hg - hp;
          if      (diff <= -2) dist.eagle++;
          else if (diff === -1) dist.birdie++;
          else if (diff === 0)  dist.par++;
          else if (diff === 1)  dist.bogey++;
          else if (diff === 2)  dist.double++;
          else                  dist.triple++;
          dist.total++;
          if (!parAcc[hp]) parAcc[hp] = { diff: 0, n: 0, under: 0 };
          parAcc[hp].diff += diff; parAcc[hp].n++;
          if (diff < 0) parAcc[hp].under++;
          if (nH === 18) { if (i < 9) f9 += diff; else b9 += diff; }
          if (isAroeira && nH === 18 && i < 18) {
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

  sdAll.sort((a, b) => b.ds - a.ds);
  const avgSD   = sdAll.length > 0 ? sdAll.reduce((s, x) => s + x.sd, 0) / sdAll.length : null;
  const bestSD  = sdAll.length > 0 ? Math.min(...sdAll.map(x => x.sd)) : null;
  const last5   = sdAll.slice(0, 5);
  const last5AvgSD = last5.length >= 2 ? last5.reduce((s, x) => s + x.sd, 0) / last5.length : null;
  const gMean   = grossSum / nRounds;
  const grossStdDev = grossAll.length >= 3
    ? Math.sqrt(grossAll.reduce((s, g) => s + (g - gMean) ** 2, 0) / grossAll.length) : null;
  const sMean   = avgSD ?? 0;
  const sdStdDev = sdAll.length >= 3
    ? Math.sqrt(sdAll.reduce((s, x) => s + (x.sd - sMean) ** 2, 0) / sdAll.length) : null;

  return {
    nRounds, nRoundsWithCard: nCard,
    avgGross: grossSum / nRounds, bestGross, grossStdDev,
    avgSD, bestSD, last5AvgSD, sdStdDev,
    scoreDist: dist,
    byPar,
    f9avg: fbN > 0 ? f9diff / fbN : null,
    b9avg: fbN > 0 ? b9diff / fbN : null,
    aroeira: {
      nRounds: arN,
      avgGross: arN > 0 ? arGross / arN : null,
      tees: [...arTees],
      holes: arHoleSums.map((h, i) => ({
        h: i + 1,
        par:  h.n > 0 ? Math.round(h.pSum / h.n) : null,
        avg:  h.n > 0 ? h.gSum / h.n : null,
        diff: h.n > 0 ? (h.gSum - h.pSum) / h.n : null,
      })),
    },
  };
}

/* ════════════════════════════════════════════════════════════════════
   ANÁLISE PRÉ-TORNEIO — Aroeira II
   ════════════════════════════════════════════════════════════════════ */

interface ScoutingReport {
  nome: string; fed: string; hcp: number | null; vac: number | null;
  rank: number; fieldSize: number;
  formDelta: number | null;
  sdAvg: number | null; sd5: number | null; sdStdDev: number | null;
  par5avg: number | null; par3avg: number | null; par4avg: number | null;
  blowupPct: number; birdiePct: number;
  grossStdDev: number | null;
  f9: number | null; b9: number | null;
  aroeiraRounds: number; aroeiraAvg: number | null;
  r3m: number | null; agg: AggStats;
}

function buildReport(pl: PlayerLoad, rank: number, fieldSize: number, statsDb: StatsDb): ScoutingReport {
  const agg = pl.agg!; const st = statsDb[pl.fed]; const dist = agg.scoreDist; const tot = dist.total || 1;
  return {
    nome: pl.nome, fed: pl.fed, hcp: pl.hcp, vac: pl.vac, rank, fieldSize,
    formDelta: agg.last5AvgSD != null && agg.avgSD != null ? agg.last5AvgSD - agg.avgSD : null,
    sdAvg: agg.avgSD, sd5: agg.last5AvgSD, sdStdDev: agg.sdStdDev,
    par5avg: agg.byPar[5]?.avgVsPar ?? null,
    par4avg: agg.byPar[4]?.avgVsPar ?? null,
    par3avg: agg.byPar[3]?.avgVsPar ?? null,
    blowupPct: (dist.double + dist.triple) / tot * 100,
    birdiePct: (dist.eagle + dist.birdie) / tot * 100,
    grossStdDev: agg.grossStdDev,
    f9: agg.f9avg, b9: agg.b9avg,
    aroeiraRounds: agg.aroeira.nRounds, aroeiraAvg: agg.aroeira.avgGross,
    r3m: st?.roundsLast3m ?? null, agg,
  };
}

/* ── Course Fit Score: 0–100 (quanto o perfil do jogador encaixa no Aroeira) ── */
function courseFitScore(r: ScoutingReport, all: ScoutingReport[]): number {
  let score = 0; let weight = 0;
  const rank = (val: number | null, arr: (number|null)[], inverted = false) => {
    const valid = arr.filter((x): x is number => x != null).sort((a,b) => a-b);
    if (val == null || !valid.length) return 0.5;
    const pos = valid.indexOf(val) / (valid.length - 1 || 1);
    return inverted ? pos : 1 - pos;
  };
  // Par-5 (peso 25%): critico em 54 buracos
  const par5s = all.map(x => x.par5avg); if (r.par5avg != null) { score += rank(r.par5avg, par5s) * 25; weight += 25; }
  // Blow-up avoidance (peso 25%): sem cut, duplos destroem
  const blows = all.map(x => x.blowupPct); score += rank(r.blowupPct, blows) * 25; weight += 25;
  // Consistência gross (peso 20%)
  const stds = all.map(x => x.grossStdDev); if (r.grossStdDev != null) { score += rank(r.grossStdDev, stds) * 20; weight += 20; }
  // Forma recente (peso 15%)
  const forms = all.map(x => x.formDelta); if (r.formDelta != null) { score += rank(r.formDelta, forms) * 15; weight += 15; }
  // Aroeira experience (peso 15%)
  const ars = all.map(x => x.aroeiraAvg); if (r.aroeiraAvg != null) { score += rank(r.aroeiraAvg, ars) * 15; weight += 15; }
  return weight > 0 ? Math.round(score / weight * 100) : 50;
}

/* ── Mini radar de perfil (SVG simples) ── */
function ProfileRadar({ r, all }: { r: ScoutingReport; all: ScoutingReport[] }) {
  const size = 80; const cx = size / 2; const cy = size / 2; const R = 30;
  function rank01(val: number | null, arr: (number|null)[], inverted = false) {
    const v = arr.filter((x): x is number => x != null).sort((a,b) => a-b);
    if (val == null || !v.length) return 0.4;
    const p = v.indexOf(val) / (v.length - 1 || 1);
    return inverted ? p : 1 - p;
  }
  const axes = [
    { l: "Par-5",  v: rank01(r.par5avg, all.map(x=>x.par5avg)) },
    { l: "Risco",  v: rank01(r.blowupPct, all.map(x=>x.blowupPct)) },
    { l: "Cons.",  v: rank01(r.grossStdDev, all.map(x=>x.grossStdDev)) },
    { l: "Forma",  v: rank01(r.formDelta, all.map(x=>x.formDelta)) },
    { l: "Birdie", v: rank01(r.birdiePct, all.map(x=>x.birdiePct), true) },
  ];
  const n = axes.length;
  const pts = axes.map((a, i) => {
    const ang = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + Math.cos(ang) * R * a.v, y: cy + Math.sin(ang) * R * a.v, lx: cx + Math.cos(ang) * (R + 10), ly: cy + Math.sin(ang) * (R + 10), l: a.l };
  });
  const bg = axes.map((a, i) => { const ang = (i / n) * 2 * Math.PI - Math.PI / 2; return `${cx + Math.cos(ang) * R},${cy + Math.sin(ang) * R}`; }).join(' ');
  const poly = pts.map(p => `${p.x},${p.y}`).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <polygon points={bg} fill="none" stroke="var(--border)" strokeWidth="0.5" />
      {[0.25,0.5,0.75].map(t => (
        <polygon key={t} points={axes.map((_,i) => { const a = (i/n)*2*Math.PI-Math.PI/2; return `${cx+Math.cos(a)*R*t},${cy+Math.sin(a)*R*t}`; }).join(' ')}
          fill="none" stroke="var(--border)" strokeWidth="0.3" />
      ))}
      {axes.map((_,i) => { const a=(i/n)*2*Math.PI-Math.PI/2; return <line key={i} x1={cx} y1={cy} x2={cx+Math.cos(a)*R} y2={cy+Math.sin(a)*R} stroke="var(--border)" strokeWidth="0.5"/>; })}
      <polygon points={poly} fill="var(--chart-2)" fillOpacity="0.25" stroke="var(--chart-2)" strokeWidth="1.5" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--chart-2)" />)}
      {pts.map((p, i) => <text key={i} x={p.lx} y={p.ly} fontSize="5.5" fill="var(--text-3)" textAnchor="middle" dominantBaseline="middle">{p.l}</text>)}
    </svg>
  );
}

/* ── Barra de forma (arco) ── */
function FormArc({ formDelta }: { formDelta: number | null }) {
  if (formDelta == null) return <span className="muted" style={{ fontSize: 11 }}>–</span>;
  const clamped = Math.max(-3, Math.min(3, -formDelta)); // invertido: neg=melhora
  const pct = (clamped + 3) / 6; // 0=pior, 1=melhor
  const color = pct > 0.6 ? "var(--color-good)" : pct < 0.4 ? "var(--color-bad)" : "var(--color-warn)";
  const label = formDelta < -1.5 ? "↑ Em alta" : formDelta > 1.5 ? "↓ A ceder" : "→ Estável";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 60, height: 5, background: "var(--bg-page)", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ width: `${pct * 100}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
      <span className="muted" style={{ fontSize: 10 }}>({formDelta > 0 ? "+" : ""}{formDelta.toFixed(1)})</span>
    </div>
  );
}

/* ── Card de jogador ── */
function PlayerScoutCard({ r, fitScore, allReports, bdPlayer }: {
  r: ScoutingReport; fitScore: number; allReports: ScoutingReport[]; bdPlayer?: BdPlayer;
}) {
  const [expanded, setExpanded] = useState(false);

  // Contexto relativo ao campo
  const fieldAvgPar5   = allReports.filter(x => x.par5avg != null).reduce((s,x) => s + x.par5avg!, 0) / (allReports.filter(x => x.par5avg != null).length || 1);
  const fieldAvgBlowup = allReports.reduce((s,x) => s + x.blowupPct, 0) / (allReports.length || 1);
  const fieldAvgSD     = allReports.filter(x => x.sdAvg != null).reduce((s,x) => s + x.sdAvg!, 0) / (allReports.filter(x => x.sdAvg != null).length || 1);

  // Pontos fortes e fracos derivados
  const edges: string[] = [];
  const risks: string[] = [];

  if (r.formDelta != null && r.formDelta < -1.5) edges.push(`em alta — SD5 ${Math.abs(r.formDelta).toFixed(1)}pts abaixo da média`);
  if (r.formDelta != null && r.formDelta > 1.5)  risks.push(`forma descendente — SD5 ${r.formDelta.toFixed(1)}pts acima da média`);
  if (r.par5avg != null && r.par5avg < fieldAvgPar5 - 0.2) edges.push(`par-5 acima da média (${r.par5avg > 0 ? "+" : ""}${r.par5avg.toFixed(2)} vs média ${fieldAvgPar5 > 0 ? "+" : ""}${fieldAvgPar5.toFixed(2)})`);
  if (r.par5avg != null && r.par5avg > fieldAvgPar5 + 0.4) risks.push(`par-5 fraco — perde terreno nas oportunidades de birdie`);
  if (r.blowupPct < fieldAvgBlowup - 3) edges.push(`raramente faz pancadas grandes (${r.blowupPct.toFixed(0)}% duplo+)`);
  if (r.blowupPct > fieldAvgBlowup + 5) risks.push(`${r.blowupPct.toFixed(0)}% duplo+ — risco de "explosão" numa volta`);
  if (r.aroeiraRounds >= 5)              edges.push(`${r.aroeiraRounds} rondas em Aroeira — vantagem de conhecimento`);
  if (r.aroeiraRounds === 0)             risks.push(`sem histórico em Aroeira`);
  if (r.grossStdDev != null && r.grossStdDev < 4) edges.push(`muito consistente (σ ±${r.grossStdDev.toFixed(1)})`);
  if (r.f9 != null && r.b9 != null && r.b9 < r.f9 - 1) edges.push(`forte fechador (+${(r.f9 - r.b9).toFixed(1)} melhor na 2ª volta)`);
  if (r.f9 != null && r.b9 != null && r.b9 > r.f9 + 1.5) risks.push(`tende a perder na 2ª volta (${(r.b9-r.f9).toFixed(1)} vs 1ª)`);
  if (r.r3m != null && r.r3m === 0)     risks.push(`sem rondas nos últimos 3 meses — falta de ritmo`);
  if (r.r3m != null && r.r3m >= 8)      edges.push(`activo: ${r.r3m} rondas nos últimos 3 meses`);

  const fitColor = fitScore >= 70 ? "var(--color-good)" : fitScore >= 45 ? "var(--color-warn)" : "var(--color-bad)";
  const dist = r.agg.scoreDist; const tot = dist.total || 1;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 10, background: "var(--bg-card)" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "stretch", cursor: "pointer" }} onClick={() => setExpanded(v => !v)}>

        {/* Rank */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          width: 52, background: "var(--bg-page)", borderRight: "1px solid var(--border)", flexShrink: 0, padding: "10px 0" }}>
          <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase" }}>VAC</div>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1,
            color: r.rank === 1 ? "#f59e0b" : r.rank <= 3 ? "var(--color-good)" : r.rank <= Math.ceil(r.fieldSize/2) ? "var(--text-1)" : "var(--text-3)" }}>
            {r.rank}
          </div>
          <div style={{ fontSize: 9, color: "var(--text-3)" }}>/{r.fieldSize}</div>
        </div>

        {/* Nome + meta */}
        <div style={{ flex: 1, padding: "10px 12px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>
              {bdPlayer?.name ?? r.nome}
            </span>
            {bdPlayer && <SexBadge sex={bdPlayer.sex} size="sm" />}
            {bdPlayer?.escalao && <span className={`p p-sm p-${escCls(bdPlayer.escalao)}`} style={{ fontSize: 9 }}>{escShort(bdPlayer.escalao)}</span>}
            {bdPlayer?.dob && <AnoEscalaoPill dob={bdPlayer.dob} escalao={bdPlayer.escalao} />}
            {!bdPlayer && <span style={{ fontSize: 9, color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 3, padding: "1px 5px" }}>externo</span>}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 11 }}>HCP {r.hcp?.toFixed(1) ?? "–"}</span>
            <span className="muted" style={{ fontSize: 11 }}>VAC {r.vac?.toFixed(1) ?? "–"}</span>
            <span className="muted" style={{ fontSize: 11 }}>{r.agg.nRounds} rondas (6m)</span>
            {r.aroeiraRounds > 0 && <span style={{ fontSize: 11, color: "var(--chart-2)", fontWeight: 600 }}>Aroeira {r.aroeiraRounds}× ({r.aroeiraAvg?.toFixed(1)})</span>}
            <FormArc formDelta={r.formDelta} />
          </div>
        </div>

        {/* Fit score + radar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "10px 12px", borderLeft: "1px solid var(--border)", flexShrink: 0, gap: 2 }}>
          <ProfileRadar r={r} all={allReports} />
          <div style={{ fontSize: 9, color: "var(--text-3)", textAlign: "center" }}>fit</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: fitColor, lineHeight: 1 }}>{fitScore}</div>
        </div>

        {/* Toggle */}
        <div style={{ display: "flex", alignItems: "center", padding: "0 10px", borderLeft: "1px solid var(--border)", color: "var(--text-3)", fontSize: 12 }}>
          {expanded ? "▲" : "▼"}
        </div>
      </div>

      {/* ── Chips edges/risks (sempre visíveis) ── */}
      {(edges.length + risks.length) > 0 && (
        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", display: "flex", gap: 5, flexWrap: "wrap" }}>
          {edges.map((t, i) => (
            <span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600,
              background: "color-mix(in srgb,var(--color-good) 12%,transparent)",
              color: "var(--color-good)", border: "1px solid color-mix(in srgb,var(--color-good) 28%,transparent)" }}>
              ▲ {t}
            </span>
          ))}
          {risks.map((t, i) => (
            <span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600,
              background: "color-mix(in srgb,var(--color-bad) 10%,transparent)",
              color: "var(--color-bad)", border: "1px solid color-mix(in srgb,var(--color-bad) 22%,transparent)" }}>
              ▼ {t}
            </span>
          ))}
        </div>
      )}

      {/* ── Expandido: métricas completas ── */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)" }}>

          {/* KPIs em linha */}
          <div style={{ display: "flex", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
            {[
              { l: "SD médio",     v: r.sdAvg?.toFixed(1),   cls: r.sdAvg != null ? `p p-${sdClassByHcp(r.sdAvg, r.hcp)}` : "" },
              { l: "SD últimas 5", v: r.sd5?.toFixed(1),     cls: r.sd5 != null ? `p p-${sdClassByHcp(r.sd5, r.hcp)}` : "" },
              { l: "Melhor gross", v: r.agg.bestGross?.toString(), color: "var(--color-good)" },
              { l: "σ gross",      v: r.grossStdDev != null ? `±${r.grossStdDev.toFixed(1)}` : "–",
                color: r.grossStdDev == null ? "var(--text-3)" : r.grossStdDev < 4 ? "var(--color-good)" : r.grossStdDev < 7 ? "var(--color-warn)" : "var(--color-bad)" },
              { l: "Par-3",  v: r.par3avg != null ? `${r.par3avg>0?"+":""}${r.par3avg.toFixed(2)}` : "–",
                color: r.par3avg == null ? "var(--text-3)" : r.par3avg < 0.3 ? "var(--color-good)" : r.par3avg < 0.7 ? "var(--color-warn)" : "var(--color-bad)" },
              { l: "Par-4",  v: r.par4avg != null ? `${r.par4avg>0?"+":""}${r.par4avg.toFixed(2)}` : "–",
                color: r.par4avg == null ? "var(--text-3)" : r.par4avg < 0.3 ? "var(--color-good)" : r.par4avg < 0.7 ? "var(--color-warn)" : "var(--color-bad)" },
              { l: "Par-5",  v: r.par5avg != null ? `${r.par5avg>0?"+":""}${r.par5avg.toFixed(2)}` : "–",
                color: r.par5avg == null ? "var(--text-3)" : r.par5avg < 0.7 ? "var(--color-good)" : r.par5avg < 1.2 ? "var(--color-warn)" : "var(--color-bad)" },
              { l: "1ª volta", v: r.f9 != null ? `${r.f9>0?"+":""}${r.f9.toFixed(1)}` : "–",
                color: r.f9 == null ? "var(--text-3)" : r.f9 < 0 ? "var(--color-good)" : r.f9 < 2 ? "var(--text-1)" : "var(--color-warn)" },
              { l: "2ª volta", v: r.b9 != null ? `${r.b9>0?"+":""}${r.b9.toFixed(1)}` : "–",
                color: r.b9 == null ? "var(--text-3)" : r.b9 < 0 ? "var(--color-good)" : r.b9 < 2 ? "var(--text-1)" : "var(--color-warn)" },
            ].map((k, i, arr) => (
              <div key={k.l} style={{ flex: "1 1 80px", padding: "8px 12px",
                borderRight: i < arr.length-1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing:"0.04em", marginBottom: 3 }}>{k.l}</div>
                {(k as any).cls ? (
                  <span className={(k as any).cls} style={{ fontSize: 14, padding: "1px 5px", fontWeight: 800 }}>{k.v ?? "–"}</span>
                ) : (
                  <div style={{ fontSize: 16, fontWeight: 800, color: (k as any).color ?? "var(--text-1)" }}>{k.v ?? "–"}</div>
                )}
              </div>
            ))}
          </div>

          {/* Scoring distribution */}
          {tot > 1 && (() => {
            const segs = [
              { k:"eagle",  n:dist.eagle,  cls:"seg-eagle",  l:"Eagle",   c:true  },
              { k:"birdie", n:dist.birdie, cls:"seg-birdie", l:"Birdie",  c:true  },
              { k:"par",    n:dist.par,    cls:"",            l:"Par",     c:false },
              { k:"bogey",  n:dist.bogey,  cls:"seg-bogey",  l:"Bogey",   c:false },
              { k:"double", n:dist.double, cls:"seg-double", l:"Duplo",   c:false },
              { k:"triple", n:dist.triple, cls:"seg-triple", l:"Triple+", c:false },
            ].filter(s => s.n > 0);
            return (
              <div style={{ padding: "10px 14px" }}>
                <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 5 }}>Distribuição · {tot} buracos</div>
                <div style={{ display: "flex", height: 10, borderRadius: 3, overflow: "hidden", gap: 1, marginBottom: 6, background: "var(--bg-page)" }}>
                  {segs.map(s => (
                    <div key={s.k} title={`${s.l}: ${(s.n/tot*100).toFixed(0)}%`}
                      style={{ flex: s.n, minWidth: 2, background: s.k==="par" ? "var(--border)" : undefined }}
                      className={s.k !== "par" ? s.cls : ""} />
                  ))}
                </div>
                <div style={{ display: "flex", gap: "3px 10px", flexWrap: "wrap" }}>
                  {segs.map(s => (
                    <span key={s.k} style={{ fontSize: 10, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 3 }}>
                      <span className={s.k !== "par" ? s.cls : ""}
                        style={{ width: 7, height: 7, display: "inline-block", borderRadius: s.c ? "50%" : 2,
                          background: s.k==="par" ? "var(--border)" : undefined }} />
                      {s.l} <b>{(s.n/tot*100).toFixed(0)}%</b>
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* ── Painel "O que decide em Aroeira" ── */
function FieldIntelligence({ reports, escalao }: { reports: ScoutingReport[]; escalao: string }) {
  if (reports.length < 2) return null;

  function shortName(n: string) { return n.split(" ").slice(0, 2).join(" "); }
  function rankList(key: keyof ScoutingReport, inverted = false) {
    return [...reports].filter(r => r[key] != null)
      .sort((a, b) => inverted ? (b[key] as number) - (a[key] as number) : (a[key] as number) - (b[key] as number))
      .slice(0, Math.min(reports.length, 5));
  }

  const sections = [
    {
      title: "Par-5 scoring — onde se ganham as posições",
      why: `Em ${escalao === "Sub-10" ? "27H" : "54H"} stroke play, os par-5 são as únicas oportunidades garantidas de birdie. Quem capitaliza ganha 1–2 pancadas por volta sobre o resto do campo.`,
      data: rankList("par5avg").map((r, i) => ({ name: shortName(r.nome), v: `${r.par5avg! > 0 ? "+" : ""}${r.par5avg!.toFixed(2)}/h`, fed: r.fed,
        color: r.par5avg! < 0.7 ? "var(--color-good)" : r.par5avg! < 1.2 ? "var(--color-warn)" : "var(--color-bad)", rank: i+1 })),
    },
    {
      title: "Gestão de risco — duplo+ avoidance",
      why: "Em 54 buracos sem cut, uma volta de +12 que incluí dois triplos pode ser irreparável. O jogador que nunca explode ganha consistência ao longo dos 3 dias.",
      data: rankList("blowupPct").map((r, i) => ({ name: shortName(r.nome), v: `${r.blowupPct.toFixed(0)}%`, fed: r.fed,
        color: r.blowupPct < 10 ? "var(--color-good)" : r.blowupPct < 16 ? "var(--color-warn)" : "var(--color-bad)", rank: i+1 })),
    },
    {
      title: "Forma recente — os últimos 5 torneios vs histórico",
      why: "Quem chega ao torneio com o SD das últimas 5 rondas melhor que a sua média pessoal está num ciclo de evolução. Nos majors amadores, a forma imediata é mais preditiva que o histórico de longo prazo.",
      data: rankList("formDelta").map((r, i) => ({ name: shortName(r.nome), v: r.formDelta! < 0 ? `${r.formDelta!.toFixed(1)} ↑` : `+${r.formDelta!.toFixed(1)}`, fed: r.fed,
        color: r.formDelta! < -1 ? "var(--color-good)" : r.formDelta! > 1 ? "var(--color-bad)" : "var(--text-2)", rank: i+1 })),
    },
    ...(reports.filter(r => r.aroeiraRounds > 0).length >= 2 ? [{
      title: "Experiência em Aroeira — conhecimento do campo",
      why: "Aroeira 2 tem greens rápidos e buracos com OB laterais. Ter rondas no campo traduz-se em menos erros estratégicos e gestão de tempo de putting.",
      data: rankList("aroeiraAvg").filter(r => r.aroeiraRounds > 0).map((r, i) => ({ name: shortName(r.nome), v: `${r.aroeiraAvg?.toFixed(1)} (${r.aroeiraRounds}×)`, fed: r.fed,
        color: "var(--chart-2)", rank: i+1 })),
    }] : []),
  ];

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-page)" }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>O que decide este torneio</div>
        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>
          Factores preditivos para 54H stroke play em Aroeira{escalao === "Sub-12" || escalao === "Sub-10" ? " · máx 10/buraco" : ""}
        </div>
      </div>
      <div style={{ padding: "0 16px 16px" }}>
        {sections.map((s, si) => (
          <div key={si} style={{ paddingTop: 14, borderTop: si > 0 ? "1px solid var(--border)" : "none", marginTop: si > 0 ? 0 : 14 }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.55, marginBottom: 10, maxWidth: 620 }}>{s.why}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {s.data.map(d => (
                <a key={d.fed} href={`/jogadores/${d.fed}?view=by_date`} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-page)",
                    border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", textDecoration: "none", color: "inherit" }}>
                  <span style={{ fontSize: 9, color: "var(--text-3)", fontWeight: 700 }}>#{d.rank}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{d.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: d.color }}>{d.v}</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Aroeira buraco a buraco ── */
function AroeiraBurTable({ players }: { players: { nome: string; fed: string; agg: AggStats }[] }) {
  const com = players.filter(p => p.agg.aroeira.nRounds > 0 && p.agg.aroeira.holes.length === 18);
  if (com.length < 1) return null;
  const pars = com[0].agg.aroeira.holes.map(h => h.par ?? 4);
  const totalPar = pars.reduce((s, p) => s + p, 0);
  function bestAt(idx: number) {
    const vs = com.map(p => ({ fed: p.fed, d: p.agg.aroeira.holes[idx]?.diff })).filter(x => x.d != null);
    if (!vs.length) return null;
    return vs.reduce((b, x) => x.d! < b.d! ? x : b).fed;
  }
  const dc = (d: number | null) => d == null ? "var(--text-3)" : d <= 0 ? "var(--color-good)" : d < 0.75 ? "var(--text-1)" : d < 1.5 ? "var(--color-warn)" : "var(--color-bad)";
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-page)" }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>Aroeira — performance histórica no campo</div>
        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>
          Médias buraco-a-buraco · últimos 6 meses · ★ melhor do grupo
        </div>
      </div>
      <div style={{ padding: "12px 16px", overflowX: "auto" }}>
        <table className="dtable-lg" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 32, fontSize: 11 }}>B.</th>
              <th style={{ width: 28, fontSize: 11, textAlign: "center" }}>Par</th>
              {com.map(p => (
                <th key={p.fed} style={{ textAlign: "center", fontSize: 12 }}>
                  <a href={`/jogadores/${p.fed}?view=by_date`} target="_blank" rel="noopener noreferrer"
                    style={{ color: "inherit", textDecoration: "none" }}>{p.nome.split(" ").slice(0,2).join(" ")}</a>
                  <div style={{ fontSize: 9, color: "var(--text-3)", fontWeight: 400 }}>{p.agg.aroeira.nRounds}× · {p.agg.aroeira.avgGross?.toFixed(1)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[{l:"1ª Volta",r:[0,8]},{l:"2ª Volta",r:[9,17]}].map(({l,r}) => (
              <React.Fragment key={l}>
                <tr><td colSpan={2+com.length} style={{ fontSize: 10, fontWeight: 800, color:"var(--text-3)", padding:"8px 8px 3px", textTransform:"uppercase", letterSpacing:"0.07em", background:"var(--bg-page)" }}>{l}</td></tr>
                {Array.from({length:r[1]-r[0]+1},(_,i)=>r[0]+i).map(idx => {
                  const par=pars[idx]; const best=bestAt(idx);
                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight:700 }}>{idx+1}</td>
                      <td style={{ textAlign:"center", fontWeight:700, fontSize:11,
                        color: par===3?"#92400e":par===5?"#1e40af":"var(--text-2)",
                        background: par===3?"#fef9c3":par===5?"#eff6ff":"transparent" }}>{par}</td>
                      {com.map(p => {
                        const h=p.agg.aroeira.holes[idx]; const isBest=best===p.fed;
                        return (
                          <td key={p.fed} style={{ textAlign:"center" }}>
                            <span style={{ fontWeight:isBest?800:600, color:dc(h?.diff??null) }}>
                              {h?.diff != null ? `${h.diff>0?"+":""}${h.diff.toFixed(2)}` : "–"}
                              {isBest && com.length>1 && <span style={{ color:"var(--color-good)", fontSize:9, marginLeft:2 }}>★</span>}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr style={{ borderTop:"1px solid var(--border)", background:"var(--bg-hover)" }}>
                  <td style={{ fontWeight:800, fontSize:11 }}>Sub</td>
                  <td style={{ textAlign:"center", fontWeight:700, color:"var(--text-2)" }}>{pars.slice(r[0],r[1]+1).reduce((s,p)=>s+p,0)}</td>
                  {com.map(p => {
                    const sub=p.agg.aroeira.holes.slice(r[0],r[1]+1).reduce((s,h)=>s+(h.diff??0),0);
                    return <td key={p.fed} style={{ textAlign:"center", fontWeight:800, color:dc(sub/(r[1]-r[0]+1)) }}>{sub>0?"+":""}{sub.toFixed(1)}</td>;
                  })}
                </tr>
              </React.Fragment>
            ))}
            <tr style={{ borderTop:"2px solid var(--border)" }}>
              <td style={{ fontWeight:800 }}>Total</td>
              <td style={{ textAlign:"center", fontWeight:700, color:"var(--text-2)" }}>{totalPar}</td>
              {com.map(p => {
                const total=p.agg.aroeira.holes.reduce((s,h)=>s+(h.diff??0),0);
                return (
                  <td key={p.fed} style={{ textAlign:"center" }}>
                    <div style={{ fontWeight:900, fontSize:14 }}>{p.agg.aroeira.avgGross?.toFixed(1)}</div>
                    <div style={{ fontSize:10, color:dc(total/18) }}>{total>0?"+":""}{total.toFixed(1)} vs par</div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}



function AnaliseView({ t, nossosByFed, statsDb }: {
  t: TorneioData; nossosByFed: Map<string, BdPlayer>; statsDb: StatsDb;
}) {
  const [playerLoads, setPlayerLoads] = useState<PlayerLoad[]>([]);
  const loadingRef = useRef(new Set<string>());
  const [sortKey, setSortKey]     = useState<"fit"|"vac"|"par5"|"blowup"|"form">("fit");
  const [window, setWindow] = useState<AggWindow>({ months: 12 });

  useEffect(() => {
    if (t._status !== "ok") return;
    const loads: PlayerLoad[] = t.jogadores.filter(j => j.fed).map(j => ({
      fed: j.fed!, nome: j.nome, hcp: j.hcp, vac: j.vac, status: "idle", agg: null,
    }));
    setPlayerLoads(loads); loadingRef.current.clear();
  }, [t.tcode, t._status, t.totalInscritos, window]);

  useEffect(() => {
    if (!playerLoads.length) return;
    const idle = playerLoads.filter(p => p.status === "idle").slice(0, 3);
    if (!idle.length) return;
    idle.forEach(pl => {
      if (loadingRef.current.has(pl.fed)) return;
      loadingRef.current.add(pl.fed);
      setPlayerLoads(prev => prev.map(p => p.fed === pl.fed ? { ...p, status: "loading" } : p));
      import("../data/playerDataLoader")
        .then(m => m.loadPlayerData(pl.fed))
        .then(data => { const agg = computeAgg(data, window); setPlayerLoads(prev => prev.map(p => p.fed === pl.fed ? { ...p, status: agg ? "ok" : "nodata", agg } : p)); })
        .catch(() => setPlayerLoads(prev => prev.map(p => p.fed === pl.fed ? { ...p, status: "nodata" } : p)))
        .finally(() => loadingRef.current.delete(pl.fed));
    });
  }, [playerLoads]);

  if (t._status !== "ok") return <div className="muted p-16">Carrega o torneio primeiro.</div>;
  if (t.totalInscritos === 0) return <div className="muted p-16">Sem inscritos.</div>;

  const ctx     = CONTEXTO_TORNEIO[t.escalao];
  const nDone   = playerLoads.filter(p => p.status === "ok" || p.status === "nodata").length;
  const nTotal  = playerLoads.length;
  const loading = nDone < nTotal;
  const allByVac = [...t.jogadores].sort((a, b) => (a.vac??999) - (b.vac??999));
  const avgVac  = allByVac.length ? allByVac.reduce((s,j)=>s+(j.vac??0),0)/allByVac.length : null;
  const avgHcp  = allByVac.filter(j=>j.hcp).length ? allByVac.reduce((s,j)=>s+(j.hcp??0),0)/allByVac.filter(j=>j.hcp).length : null;

  const withData = playerLoads.filter(p => p.agg);
  const reports  = withData.map(pl => {
    const rank = allByVac.findIndex(j => j.fed === pl.fed) + 1;
    return buildReport(pl, rank, allByVac.length, statsDb);
  });
  const fitScores = Object.fromEntries(reports.map(r => [r.fed, courseFitScore(r, reports)]));

  const sorted = [...reports].sort((a,b) => {
    if (sortKey === "fit")    return (fitScores[b.fed]??0) - (fitScores[a.fed]??0);
    if (sortKey === "vac")    return (a.vac??999) - (b.vac??999);
    if (sortKey === "par5")   return (a.par5avg??99) - (b.par5avg??99);
    if (sortKey === "blowup") return a.blowupPct - b.blowupPct;
    if (sortKey === "form")   return (a.formDelta??99) - (b.formDelta??99);
    return 0;
  });

  const scatterAll = t.jogadores.filter(j=>j.hcp!=null&&j.vac!=null).map(j=>({
    x: j.hcp!, y: j.vac!,
    nome: (nossosByFed.get(j.fed??"")||{name:j.nome.split(" ").slice(0,2).join(" ")}).name.split(" ").slice(0,2).join(" "),
  }));
  const ScatterTip = ({active,payload}: any) => {
    if (!active||!payload?.length) return null;
    const d=payload[0].payload;
    return <div style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:6,padding:"6px 10px",fontSize:12}}><b>{d.nome}</b><br/>HCP {d.x.toFixed(1)} · VAC {d.y.toFixed(1)}</div>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>

      {/* Termos */}
      <TermosSection />

      {/* Contexto */}
      {ctx && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 13 }}>🏆 PGA Aroeira II · 1–3 Maio 2026</span>
            <a href="https://competicoes.fpg.pt/evento/campeonato-nacional-de-jovens-sub10-12-14-16-18-pga-aroeira/"
               target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--chart-2)", marginLeft: "auto" }}>Ver evento ↗</a>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 5 }}>Marcas de saída</div>
              <div style={{ display: "flex", gap: 5 }}>
                {ctx.tees.map(tee => (
                  <span key={tee} style={{ fontSize: 13, fontWeight: 800, padding: "4px 12px", borderRadius: 20,
                    background: TEE_STYLE[tee]?.bg??"#888", color: TEE_STYLE[tee]?.color??"#fff", border: TEE_STYLE[tee]?.border }}>{tee}</span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 3 }}>Formato</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{ctx.formato}</div>
            </div>
            {ctx.maxScore && <div style={{ border:"1px solid var(--color-warn)", borderRadius:7, padding:"5px 12px" }}>
              <div style={{ fontSize:9, color:"var(--text-3)" }}>Máx/buraco</div>
              <div style={{ fontSize:20, fontWeight:900, color:"var(--color-warn)" }}>{ctx.maxScore}</div>
            </div>}
            {[{l:"Inscritos",v:t.totalInscritos},...(avgVac?[{l:"VAC médio",v:avgVac.toFixed(1)}]:[])].map(k=>(
              <div key={k.l}>
                <div style={{ fontSize:9, color:"var(--text-3)", textTransform:"uppercase", marginBottom:2 }}>{k.l}</div>
                <div style={{ fontSize:22, fontWeight:900 }}>{k.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scatter */}
      {scatterAll.length >= 3 && (
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px" }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:2 }}>Posicionamento no campo — HCP × VAC</div>
          <div style={{ fontSize:11, color:"var(--text-2)", marginBottom:8 }}>Quanto mais à esquerda e em baixo, melhor o perfil. Linhas = média do campo.</div>
          <ResponsiveContainer width="100%" height={230}>
            <ScatterChart margin={{top:20,right:30,bottom:30,left:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4}/>
              {avgHcp && <ReferenceLine x={avgHcp} stroke="var(--border)" strokeDasharray="4 2"/>}
              {avgVac  && <ReferenceLine y={avgVac}  stroke="var(--border)" strokeDasharray="4 2"/>}
              <XAxis type="number" dataKey="x" name="HCP" label={{value:"Handicap",position:"insideBottom",offset:-15,fontSize:10,fill:"var(--text-3)"}} tick={{fontSize:10}} stroke="var(--border)"/>
              <YAxis type="number" dataKey="y" name="VAC" label={{value:"VAC",angle:-90,position:"insideLeft",fontSize:10,fill:"var(--text-3)"}} tick={{fontSize:10}} stroke="var(--border)"/>
              <Tooltip content={<ScatterTip/>}/>
              <Scatter data={scatterAll} fill="var(--chart-2)" fillOpacity={0.8} r={6} stroke="var(--chart-2)" strokeWidth={1}>
                <LabelList dataKey="nome" position="top" style={{fontSize:9,fill:"var(--text-2)"}}/>
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Field Intelligence */}
      {reports.length >= 2 && <FieldIntelligence reports={reports} escalao={t.escalao} />}

      {/* Aroeira histórico */}
      {reports.length > 0 && (
        <AroeiraBurTable players={reports.map(r=>({nome:nossosByFed.get(r.fed)?.name??r.nome, fed:r.fed, agg:r.agg}))}/>
      )}

      {/* Scouting Reports */}
      <div>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10, flexWrap:"wrap" }}>
          <div style={{ fontWeight:800, fontSize:14 }}>
            Scouting Reports
            {loading && <span className="muted" style={{fontWeight:400,fontSize:11,marginLeft:8}}>{nDone}/{nTotal} carregados…</span>}
          </div>
          {sorted.length >= 0 && (
            <div style={{ marginLeft:"auto", display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
              <span style={{ fontSize:10, color:"var(--text-3)" }}>Período:</span>
              {([3,6,12,24] as const).map(m => {
                const active = "months" in window && window.months === m;
                return (
                  <button key={m} onClick={() => setWindow({ months: m })}
                    style={{ fontSize:10, padding:"2px 7px", borderRadius:4, cursor:"pointer",
                      background: active ? "var(--chart-2)" : "var(--bg-card)",
                      color: active ? "#fff" : "var(--text-2)",
                      border:`1px solid ${active?"var(--chart-2)":"var(--border)"}`,
                      fontWeight: active?700:400 }}>
                    {m}m
                  </button>
                );
              })}
              {([2025,2024,2023] as const).map(y => {
                const active = "year" in window && window.year === y;
                return (
                  <button key={y} onClick={() => setWindow({ year: y })}
                    style={{ fontSize:10, padding:"2px 7px", borderRadius:4, cursor:"pointer",
                      background: active ? "var(--accent)" : "var(--bg-card)",
                      color: active ? "#fff" : "var(--text-2)",
                      border:`1px solid ${active?"var(--accent)":"var(--border)"}`,
                      fontWeight: active?700:400 }}>
                    {y}
                  </button>
                );
              })}
              <div style={{ width:1, height:14, background:"var(--border)", margin:"0 2px" }} />
              <span style={{ fontSize:10, color:"var(--text-3)" }}>Ordenar:</span>
              {([["fit","Course Fit"],["vac","VAC"],["par5","Par-5"],["blowup","Duplos−"],["form","Forma"]] as const).map(([k,l])=>(
                <button key={k} onClick={()=>setSortKey(k)} style={{ fontSize:10, padding:"2px 8px", borderRadius:4, cursor:"pointer",
                  background: sortKey===k?"var(--chart-2)":"var(--bg-card)",
                  color: sortKey===k?"#fff":"var(--text-2)",
                  border:`1px solid ${sortKey===k?"var(--chart-2)":"var(--border)"}`,
                  fontWeight: sortKey===k?700:400 }}>{l}</button>
              ))}
            </div>
          )}
        </div>

        {sorted.map(r => (
          <PlayerScoutCard key={r.fed} r={r} fitScore={fitScores[r.fed]??50} allReports={reports} bdPlayer={nossosByFed.get(r.fed)} />
        ))}

        {nDone===nTotal && playerLoads.filter(p=>p.status==="nodata").length>0 && (
          <div className="muted" style={{fontSize:11}}>
            Sem dados suficientes (6m): {playerLoads.filter(p=>p.status==="nodata").map(p=>nossosByFed.get(p.fed)?.name??p.nome.split(" ")[0]).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}



/* ═══════════════════════════════════════════════════════
   RESULTADOS — nacional do ano anterior para os inscritos
   Filtra rondas com eventName ∋ "nacional" no ano passado
   ═══════════════════════════════════════════════════════ */



/* ═══════════════════════════════════════════════════════
   RESULTADOS — nacional do ano anterior
   Fonte: ficheiros /data/pull-torneios*.json (mesma fonte que FPGPage)
   Filtra torneios com pill="NACIONAL" e escalão correspondente
   ═══════════════════════════════════════════════════════ */
type TournPlayer = { name: string; fedCode?: string; grossTotal: number | string | null; roundScores?: { grossTotal?: number | string | null }[] };
type TournEntry  = { name: string; tcode: string; date: string; campo: string; escalao?: string | null; rounds?: number; players: TournPlayer[] };
type DriveFile   = { tournaments: TournEntry[] };

const DATA_BASE = "/data/pull-torneios";
const DATA_EXT  = ".json";
const DATA_MAX  = 50;

async function fetchNacionalTourns(
  melhorias: import("../data/melhoriasTypes").MelhoriasJson,
  escalao: string,
  anoPassado: number
): Promise<TournEntry[]> {
  // 1. Descobrir tcodes com pill="NACIONAL" a partir do melhorias
  const nacTcodes = new Set<string>();
  for (const playerPatches of Object.values(melhorias)) {
    if (typeof playerPatches !== "object" || !playerPatches) continue;
    for (const entry of Object.values(playerPatches as Record<string, any>)) {
      if (typeof entry !== "object" || !entry || !entry.pill || entry.pill !== "NACIONAL") continue;
      for (const v of Object.values((entry as any).links || {})) {
        const m = String(v).match(/tcode=(\d+)/);
        if (m) nacTcodes.add(m[1]);
      }
    }
  }

  // 2. Percorrer ficheiros de torneios até 404
  const found: TournEntry[] = [];
  for (let i = 0; i < DATA_MAX; i++) {
    let resp: Response;
    try { resp = await fetch(DATA_BASE + String(i).padStart(3, "0") + DATA_EXT); }
    catch { break; }
    if (!resp.ok) break;
    const d: DriveFile = await resp.json().catch(() => ({ tournaments: [] }));
    for (const t of d.tournaments || []) {
      const dateYear = parseInt((t.date || "").slice(0, 4));
      if (dateYear !== anoPassado) continue;
      if (!nacTcodes.has(t.tcode)) continue;
      // Verificar escalão: t.escalao pode ser "Sub-12" ou similar
      const tEsc = (t.escalao || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const wantEsc = escalao.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (tEsc && !tEsc.includes(wantEsc) && !wantEsc.includes(tEsc)) continue;
      found.push(t);
    }
  }
  return found;
}

function ResultadosView({ t, nossosByFed }: {
  t: TorneioData; nossosByFed: Map<string, BdPlayer>;
}) {
  const { melhorias } = useAppContext();
  const anoPassado = new Date().getFullYear() - 1;

  type Status = "idle" | "loading" | "ok" | "empty" | "error";
  const [status, setStatus]   = useState<Status>("idle");
  const [tourns, setTourns]   = useState<TournEntry[]>([]);

  useEffect(() => {
    if (t._status !== "ok") return;
    setStatus("loading");
    fetchNacionalTourns(melhorias, t.escalao, anoPassado)
      .then(found => { setTourns(found); setStatus(found.length ? "ok" : "empty"); })
      .catch(() => setStatus("error"));
  }, [t.tcode, t._status, t.escalao, melhorias, anoPassado]);

  if (t._status !== "ok") return <div className="muted p-16">Carrega o torneio primeiro.</div>;

  // Consolidar rondas: pode haver múltiplos TournEntry (R1, R2, R3...)
  // Cada entrada pode ter rounds > 1 com roundScores por jogador
  const rounds = tourns.length;
  const inscFeds = new Set(t.jogadores.map(j => j.fed).filter(Boolean));

  // Construir leaderboard: chave = fedCode ou nome normalizado
  type Row = { key: string; nome: string; fed: string | null; inBD: boolean; grossByRound: (number | null)[]; total: number | null };
  const rowMap = new Map<string, Row>();

  for (let ri = 0; ri < tourns.length; ri++) {
    const tourn = tourns[ri];
    const nRoundsInFile = tourn.rounds && tourn.rounds > 1 ? tourn.rounds : 1;
    for (const p of tourn.players) {
      const key  = p.fedCode || p.name;
      const fed  = p.fedCode || null;
      const nome = nossosByFed.get(fed ?? "")?.name ?? p.name;
      if (!rowMap.has(key)) {
        rowMap.set(key, { key, nome, fed, inBD: fed ? inscFeds.has(fed) : false, grossByRound: [], total: null });
      }
      const row = rowMap.get(key)!;
      if (nRoundsInFile > 1 && p.roundScores?.length) {
        // torneio multi-ronda num único ficheiro
        p.roundScores.forEach((rs, idx) => {
          const g = rs.grossTotal != null ? Number(rs.grossTotal) : null;
          row.grossByRound[idx] = g;
        });
      } else {
        // ronda individual
        const g = p.grossTotal != null ? Number(p.grossTotal) : null;
        row.grossByRound[ri] = g;
      }
    }
  }

  // Calcular total e ordenar
  const board = [...rowMap.values()].map(row => ({
    ...row,
    total: row.grossByRound.every(g => g == null) ? null
      : row.grossByRound.reduce<number>((s, g) => s + (g ?? 0), 0),
  })).sort((a, b) => (a.total ?? 9999) - (b.total ?? 9999));

  const maxR = board.reduce((m, r) => Math.max(m, r.grossByRound.length), 0) || rounds || 1;

  // Link de classificação a partir do primeiro torneio com links
  const classifUrl = (tourns[0] as any)?.links?.classificacao
    ?? (tourns[0] as any)?.links?.fpg_scoring
    ?? `https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=988&tcode=${tourns[0]?.tcode ?? ""}`;

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 13 }}>
          🏅 Resultados {anoPassado} — {t.nome}
        </span>
        {status === "loading" && <span className="muted" style={{ fontSize: 11 }}>A carregar…</span>}
        {status === "ok" && tourns.length > 0 && (
          <a href={classifUrl} target="_blank" rel="noopener noreferrer"
             style={{ fontSize: 11, color: "var(--chart-2)", marginLeft: "auto" }}>
            classificação oficial ↗
          </a>
        )}
      </div>

      {status === "empty" && (
        <div className="muted" style={{ fontSize: 12, padding: "20px 0" }}>
          Não foram encontrados resultados do Campeonato Nacional {t.escalao} de {anoPassado}.
        </div>
      )}
      {status === "error" && (
        <div className="muted" style={{ fontSize: 12 }}>Erro ao carregar ficheiros de torneios.</div>
      )}

      {status === "ok" && board.length > 0 && (
        <div className="table-wrap">
          <table className="dtable-lg" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>Nome</th>
                {Array.from({ length: maxR }, (_, i) => (
                  <th key={i} className="r" style={{ width: 52 }}>R{i + 1}</th>
                ))}
                <th className="r" style={{ width: 64 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {board.map((row, i) => (
                <tr key={row.key} className={row.inBD ? "row-match" : ""}>
                  <td className="muted r" style={{ fontSize: 11 }}>{i + 1}</td>
                  <td style={{ fontWeight: row.inBD ? 700 : 400 }}>{row.nome}</td>
                  {Array.from({ length: maxR }, (_, ri) => (
                    <td key={ri} className="r" style={{ fontSize: 13 }}>
                      {row.grossByRound[ri] != null ? row.grossByRound[ri] : <span className="muted">–</span>}
                    </td>
                  ))}
                  <td className="r" style={{ fontWeight: 800, fontSize: 14 }}>
                    {row.total != null ? row.total : <span className="muted">–</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

  // Fallback para JSON estático — funciona em Vercel/mobile sem API
  const tryStaticCache = useCallback(async (tcode: string): Promise<boolean> => {
    try {
      const r = await fetch(`/data/inscricoes_nacionais.json`);
      if (!r.ok) return false;
      const all = await r.json() as Record<string, unknown>;
      const entry = all[tcode];
      if (!entry) return false;
      setTorneios(prev => prev.map(t =>
        t.tcode === tcode ? { ...t, ...(entry as object), _status: "ok", fromCache: true } : t
      ));
      console.log(`[inscricoes] tcode=${tcode} -> cache estatica`);
      return true;
    } catch { return false; }
  }, []);

  // forceRefresh=true: ignora cache do servidor, vai sempre à FPG
  const fetchTorneio = useCallback(async (tcode: string, forceRefresh = false) => {
    // Se já está em curso para este tcode, cancelar o anterior antes de prosseguir
    inFlight.current.delete(tcode);
    inFlight.current.add(tcode);
    setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, _status: "loading" } : t));
    try {
      const apiUrl = `/api/inscricoes?tcode=${tcode}${forceRefresh ? "&refresh=1" : ""}`;
      let res: Response;
      try {
        res = await fetch(apiUrl);
      } catch {
        // API não acessível (Vercel, sem servidor local) — usar JSON estático
        if (await tryStaticCache(tcode)) return;
        throw new Error("API inacessivel e sem cache estatica");
      }
      if (!res.ok) {
        // API deu erro (502, 500) — tentar JSON estático
        console.warn(`[inscricoes] tcode=${tcode} HTTP ${res.status}, a tentar cache estatica`);
        if (await tryStaticCache(tcode)) return;
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, ...data, _status: "ok" } : t));
    } catch (err) {
      console.error(`inscricoes tcode=${tcode}:`, err);
      setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, _status: "error" } : t));
    } finally {
      inFlight.current.delete(tcode);
    }
  }, [tryStaticCache]);

  // Ao mudar de escalão: carregar se ainda não carregado
  useEffect(() => {
    const t = torneios.find(x => x.tcode === activeTcode);
    if (t && t._status === "idle") fetchTorneio(activeTcode, false);
  }, [activeTcode, torneios, fetchTorneio]);

  // Actualizar todos: sempre vai à FPG (forceRefresh=true)
  const refreshAll = useCallback(() => {
    inFlight.current.clear();
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
    <div className="jogadores-page">
      {/* ── Toolbar: scroll horizontal ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 10px", overflowX: "auto", flexWrap: "nowrap",
        scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
        borderBottom: "1px solid var(--border-light)",
      }}>
        <span className="toolbar-title" style={{ flexShrink: 0 }}>🏆 Nacionais Jovens</span>
        <div className="toolbar-sep" style={{ flexShrink: 0 }} />
        {([
          { key: "inscricoes", label: "Inscrições" },
          { key: "analise",    label: "📊 Análise" },
          { key: "resultados", label: "🏅 Resultados" },
        ] as const).map(({ key, label }) => (
          <button key={key}
            className={"tourn-tab tourn-tab-sm" + (view === key ? " active" : "")}
            onClick={() => setView(key as PageView)}
            style={view === key
              ? { flexShrink: 0 }
              : { flexShrink: 0, background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}>
            {label}
          </button>
        ))}
        <div className="toolbar-sep" style={{ flexShrink: 0 }} />
        <button className="tourn-tab tourn-tab-sm" onClick={refreshAll}
          style={{ flexShrink: 0, background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}
          title="Ir buscar inscrições actualizadas à FPG para todos os escalões">
          ↺ Actualizar
        </button>
        <div className="toolbar-sep" style={{ flexShrink: 0 }} />
        {torneios.map(t => (
          <TorneioCard key={t.tcode} t={t}
            active={activeTcode === t.tcode}
            onClick={() => setActiveTcode(t.tcode)} />
        ))}
        <div style={{ flex: 1, minWidth: 8 }} />
        {totalNossosInscritos > 0 && (
          <span className="chip" style={{ flexShrink: 0 }}>{totalNossosInscritos} na BD</span>
        )}
      </div>

      <PainelResumo torneios={torneios} nossosByFed={nossosByFed} />
      <div className="course-detail">
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "12px 0 8px", borderBottom: "1px solid var(--border)", marginBottom: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            Campeonato Nacional de Jovens — {torneioActivo.nome}
          </h3>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
            <a href="https://competicoes.fpg.pt/evento/campeonato-nacional-de-jovens-sub10-12-14-16-18-pga-aroeira/"
               target="_blank" rel="noopener noreferrer"
               style={{ fontSize: 11, color: "var(--chart-2)" }}>
              evento FPG ↗
            </a>
            <a href={`https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=000&tcode=${torneioActivo.tcode}`}
               target="_blank" rel="noopener noreferrer"
               style={{ fontSize: 11, color: "var(--text-3)" }}>
              inscrições datagolf ↗
            </a>
          </div>
        </div>
        {view === "inscricoes"
          ? <InscricoesView  t={torneioActivo} nossosFedSet={nossosFedSet} nossosByFed={nossosByFed} statsDb={statsDb} />
          : view === "analise"
          ? <AnaliseView     t={torneioActivo} nossosByFed={nossosByFed} statsDb={statsDb} />
          : <ResultadosView  t={torneioActivo} nossosByFed={nossosByFed} />
        }
      </div>
    </div>
  );
}

