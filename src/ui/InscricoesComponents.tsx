/**
 * InscricoesComponents.tsx — Componentes de Inscrições do Campeonato Nacional
 *
 * Extraído de FPGPage.tsx para melhorar organização modular.
 * Contém:
 *   - usePlayerStats() hook
 *   - PainelResumo component
 *   - TorneioCard component
 *   - InscricoesView component (tabela completa)
 *   - TERMOS_COMPETICAO constant
 *   - InscricoesPanel component (integração)
 *   - EventGroup interface (genérico)
 *   - buildEventGroups function (genérico, com similarity-split por Jaccard)
 *   - eventNameTokens / jaccardSimilarity helpers
 *   - JovensGroup interface (extends EventGroup)
 *   - ESC_ORDER_JOV constant
 *   - inferEscalao function
 *   - buildJovensGroups function (wrapper sobre buildEventGroups)
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { Tournament } from "../data/fpgTypes";
import type { TorneioData, BdPlayer, StatsDb } from "../pages/nacionais/types";
import { useAppContext } from "../context/AppContext";
import { sdClassByHcp } from "../utils/scoreDisplay";
import { escCls } from "../utils/playerUtils";
import { fmtHcp, escShort, fmtTime, fmtDataInscricao, anoEscalao, norm } from "../utils/format";
import { TORNEIOS_CONFIG } from "../constants/config";
import SexBadge from "./SexBadge";
import { AnoEscalaoPill, TrendBadge } from "./AnoEscalaoPill";
import PlayerLink from "./PlayerLink";
import LoadingState from "./LoadingState";
import EmptyState from "./EmptyState";
import SortableHdr from "./SortableHdr";
import { useSort } from "../hooks/useSort";
import { FLAG } from "../utils/flagUtils";
import { cachedFetchJson } from "../data/fetchCache";

/* ═══════════════════════════════════════════════════════
   HOOKS
   ═══════════════════════════════════════════════════════ */

function usePlayerStats() {
  const [stats, setStats] = useState<StatsDb>({});
  useEffect(() => {
    cachedFetchJson<StatsDb>("/player-stats.json")
      .then(d => { if (d) setStats(d); })
      .catch(() => {});
  }, []);
  return stats;
}

/* ── fed → country_prefix (lazy-load, partilhado entre instâncias) ──
 *
 * Funde 2 fontes:
 *   1. /data/federados.json        — country_prefix do FPG (mas é "país de federação",
 *                                     não nacionalidade — frequentemente errado)
 *   2. /data/nationalities.json    — override manual (curado por nós) — prevalece
 *
 * Resultado: Map<fed, código_ISO_2_em_maiúsculas>. Só inclui não-PT (PT é default).
 */
let _fedCountryPromise: Promise<Map<string, string>> | null = null;
function loadFedCountries(): Promise<Map<string, string>> {
  if (_fedCountryPromise) return _fedCountryPromise;
  _fedCountryPromise = Promise.all([
    cachedFetchJson<any>("/data/federados.json").catch(() => null),
    cachedFetchJson<any>("/data/nationalities.json").catch(() => null),
  ]).then(([feds, overrides]) => {
    const m = new Map<string, string>();
    // 1) Base: FPG
    const items = (feds && (feds.players || feds.federados || feds.records || (Array.isArray(feds) ? feds : []))) || [];
    for (const p of items) {
      const fed = String(p.federation_code || p.fed || "");
      const cc = (p.country_prefix || "").toUpperCase().trim().slice(0, 2);
      if (fed && cc && cc !== "PT" && !cc.startsWith("@")) m.set(fed, cc);
    }
    // 2) Override (curado): adiciona/substitui/remove
    if (overrides && typeof overrides === "object") {
      for (const [fed, raw] of Object.entries(overrides)) {
        if (fed.startsWith("_")) continue;  // metadados (_README, etc.)
        const cc = String(raw || "").toUpperCase().trim().slice(0, 2);
        if (!cc) { m.delete(fed); continue; }
        if (cc === "PT") m.delete(fed);   // forçar default (sem bandeira)
        else m.set(fed, cc);
      }
    }
    return m;
  });
  return _fedCountryPromise;
}

export function useFedCountries(): Map<string, string> {
  const [m, setM] = useState<Map<string, string>>(new Map());
  useEffect(() => { loadFedCountries().then(setM); }, []);
  return m;
}

/* ── fed → birthdate (lazy-load, partilhado entre instâncias) ──
 *
 * Fonte: `/data/federados.json` (campo `birthdate`, formato "YYYY-MM-DD").
 *
 * Usado como fallback quando `playersDB[fed].dob` está indisponível — ou
 * seja, para jogadores que não estão em `players.json` curado (muito comum
 * para Sub-10 e novos registados). Sem este fallback, a DrawTab cairia no
 * `tournamentEscalao` genérico do torneio, que está errado para torneios
 * combinados como o Campeonato Regional de Jovens (Sub 10+12, Sub 14-24).
 */
let _fedBirthdatePromise: Promise<Map<string, string>> | null = null;
function loadFedBirthdates(): Promise<Map<string, string>> {
  if (_fedBirthdatePromise) return _fedBirthdatePromise;
  _fedBirthdatePromise = cachedFetchJson<any>("/data/federados.json")
    .catch(() => null)
    .then(feds => {
      const m = new Map<string, string>();
      if (!feds) return m;
      const items = feds.players || feds.federados || feds.records || (Array.isArray(feds) ? feds : []);
      for (const p of items) {
        const fed = String(p.federation_code || p.fed || "");
        const dob = p.birthdate || p.dt_aniv || p.dob || "";
        if (fed && typeof dob === "string" && /^\d{4}-\d{2}-\d{2}/.test(dob)) {
          m.set(fed, dob.slice(0, 10));
        }
      }
      return m;
    });
  return _fedBirthdatePromise;
}

export function useFedBirthdates(): Map<string, string> {
  const [m, setM] = useState<Map<string, string>>(new Map());
  useEffect(() => { loadFedBirthdates().then(setM); }, []);
  return m;
}

/* ── fed → HCP actual (lazy-load, partilhado entre instâncias) ──
 *
 * Fonte: `/data/federados.json` (campo `hcp_index`, com fallback a `hcp_exact`).
 *
 * Usado como ÚLTIMO fallback para a coluna HCP quando o snapshot temporal do
 * evento (draw/admissions) não existe — tipicamente jogadores que estão no draw
 * mas não na lista de inscritos capturada (draw > admissions). É o HCP ACTUAL,
 * não o do evento; quem consome deve sinalizá-lo como tal (ver DrawTab).
 * Sentinela FPG "sem handicap" (99) e valores acima do cap WHS (54) são
 * descartados. Reutiliza o mesmo `cachedFetchJson` do birthdates — sem fetch extra.
 */
let _fedHcpPromise: Promise<Map<string, number>> | null = null;
function loadFedHcp(): Promise<Map<string, number>> {
  if (_fedHcpPromise) return _fedHcpPromise;
  _fedHcpPromise = cachedFetchJson<any>("/data/federados.json")
    .catch(() => null)
    .then(feds => {
      const m = new Map<string, number>();
      if (!feds) return m;
      const items = feds.players || feds.federados || feds.records || (Array.isArray(feds) ? feds : []);
      for (const p of items) {
        const fed = String(p.federation_code || p.fed || "");
        if (!fed) continue;
        const raw = p.hcp_index ?? p.hcp_exact;
        const v = typeof raw === "number" ? raw : parseFloat(raw);
        if (Number.isFinite(v) && v <= 54) m.set(fed, v);
      }
      return m;
    });
  return _fedHcpPromise;
}

export function useFedHcp(): Map<string, number> {
  const [m, setM] = useState<Map<string, number>>(new Map());
  useEffect(() => { loadFedHcp().then(setM); }, []);
  return m;
}

/* ── fed → sexo "M"/"F" (lazy-load, partilhado entre instâncias) ──
 *
 * Fonte: `/data/federados.json` (campo `gender`, "M"/"F").
 *
 * Usado para calcular a "área de partida" (tee) por jogador em torneios cuja
 * regra de tees depende de escalão + sexo (ver src/utils/teeRegulation.ts).
 * Reutiliza o mesmo `cachedFetchJson` de birthdates/hcp — sem fetch extra. */
let _fedGenderPromise: Promise<Map<string, "M" | "F">> | null = null;
function loadFedGenders(): Promise<Map<string, "M" | "F">> {
  if (_fedGenderPromise) return _fedGenderPromise;
  _fedGenderPromise = cachedFetchJson<any>("/data/federados.json")
    .catch(() => null)
    .then(feds => {
      const m = new Map<string, "M" | "F">();
      if (!feds) return m;
      const items = feds.players || feds.federados || feds.records || (Array.isArray(feds) ? feds : []);
      for (const p of items) {
        const fed = String(p.federation_code || p.fed || "");
        const g = String(p.gender || p.sex || "").toUpperCase();
        if (fed && (g === "M" || g === "F")) m.set(fed, g);
      }
      return m;
    });
  return _fedGenderPromise;
}

export function useFedGenders(): Map<string, "M" | "F"> {
  const [m, setM] = useState<Map<string, "M" | "F">>(new Map());
  useEffect(() => { loadFedGenders().then(setM); }, []);
  return m;
}

/** Renderiza bandeira só se o jogador for não-PT (PT é default sem bandeira).
 *  Aceita `country` directo (override) — usado para jogadores internacionais sem
 *  fedCode português, onde a info vem de kids-links.json / playersDB entry virtual. */
function CountryFlag({ fed, fedCountries, country }: { fed: string | null; fedCountries: Map<string, string>; country?: string | null }) {
  const cc = country || (fed ? fedCountries.get(fed) : null);
  if (!cc) return null;
  const emoji = FLAG[cc] ?? "🏳️";
  return <span title={cc} style={{ marginRight: 4, fontSize: "0.95em" }}>{emoji}</span>;
}

/* ═══════════════════════════════════════════════════════
   UTILITÁRIOS
   ═══════════════════════════════════════════════════════ */

/** Verifica se dataInscricao ("2026/04/03 09:14") é das últimas N horas */
function isRecentHours(s: string | null, hours: number): boolean {
  if (!s) return false;
  const d = new Date(s.replace(/\//g, "-"));
  return !isNaN(d.getTime()) && (Date.now() - d.getTime()) < hours * 3600_000;
}

/* ═══════════════════════════════════════════════════════
   PAINEL DE RESUMO — sempre visível
   ═══════════════════════════════════════════════════════ */
function PainelResumo({ torneios, nossosByFed }: {
  torneios: TorneioData[];
  nossosByFed: Map<string, BdPlayer>;
}) {
  const fedCountries = useFedCountries();
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
        <span className="fw-800 fs-14 shrink-0">{totalGeral} inscritos</span>
        <span className="muted fs-11" >·</span>
        {escaloes.flatMap((e, ei) => {
          const g = byEsc[e];
          if (g.M === 0 && g.F === 0) return [];
          const items: React.ReactNode[] = [];
          if (g.M > 0) items.push(
            <span key={`${e}M`} className="shrink-0 inline-flex items-center-gap3">
              <span className="muted fs-10" >{e.replace("Sub-", "S")}</span>
              <span className="sex-badge sex-M ta-c"  style={{ minWidth: 20 }}>{g.M}</span>
            </span>
          );
          if (g.F > 0) items.push(
            <span key={`${e}F`} className="shrink-0 inline-flex items-center-gap3">
              {g.M === 0 && <span className="muted fs-10" >{e.replace("Sub-", "S")}</span>}
              <span className="sex-badge sex-F ta-c"  style={{ minWidth: 20 }}>{g.F}</span>
            </span>
          );
          if (ei < escaloes.length - 1) items.push(
            <span key={`sep${ei}`} className="muted fs-10" >·</span>
          );
          return items;
        })}
        {anoBase > 0 && (
          <>
            <span className="muted fs-11" >·</span>
            <span className="fs-11 shrink-0" style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
              <span className="muted">1º ano</span>
              <span className="fw-700" style={{ color: "var(--color-good)" }}>{anoTotals["1A"]}</span>
              <span className="muted">2º ano</span>
              <span className="fw-700" style={{ color: "var(--color-bad)" }}>{anoTotals["2A"]}</span>
            </span>
          </>
        )}
      </div>

      {/* Linha 2: clubes */}
      {clubes.length > 0 && (
        <div className="gap-4 flex-wrap" style={{ display: "flex", alignItems: "center" }}>
          <span className="muted fs-10 shrink-0" >Clubes:</span>
          {clubes.map(([c, d]) => (
            <button key={c}
              onClick={() => setClubesSel(prev => prev === c ? null : c)}
              className="fs-11 fw-600"
              style={{
                cursor: "pointer", padding: "1px 8px", borderRadius: 10,
                border: "1px solid var(--border)",
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
          <div className="fs-11 fw-700" style={{ marginBottom: 5, color: "var(--text-1)" }}>
            {clubeSel} — {selData.n} inscrito{selData.n !== 1 ? "s" : ""}
          </div>
          <div className="gap-4 flex-wrap" style={{ display: "flex" }}>
            {selData.jogadores.map((jj, i) => (
              <span key={i} className="fs-11" style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 10,
                background: "var(--bg-card)", border: "1px solid var(--border)",
              }}>
                <SexBadge sex={jj.sex} size="sm" />
                <span className={`p p-sm p-${escCls(jj.escalao)} fs-10`}>{escShort(jj.escalao)}</span>
                <CountryFlag fed={jj.fed} fedCountries={fedCountries} />
                <span>{jj.nome || jj.fed}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Card de escalao — usa o mesmo estilo das pills de escalao
   ───────────────────────────────────────────────────────── */
function TorneioCard({ t, active, onClick }: {
  t: TorneioData; active: boolean; onClick: () => void;
}) {
  const fedCountries = useFedCountries();
  const recentes = useMemo(() => t.jogadores.filter(j => isRecentHours(j.dataInscricao, 48)).length, [t.jogadores]);
  // Contar estrangeiros (não-PT) — agrupar por país para tooltip
  const estrangeirosByCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of t.jogadores) {
      const cc = j.fed ? fedCountries.get(j.fed) : null;
      if (cc) m.set(cc, (m.get(cc) || 0) + 1);
    }
    return m;
  }, [t.jogadores, fedCountries]);
  const estrangeirosTotal = useMemo(
    () => [...estrangeirosByCountry.values()].reduce((a, b) => a + b, 0),
    [estrangeirosByCountry]
  );
  const estrangeirosTitle = useMemo(() => {
    if (estrangeirosTotal === 0) return "";
    const parts = [...estrangeirosByCountry.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cc, n]) => `${FLAG[cc] ?? "🏳️"} ${cc} ${n}`);
    return ` · ${estrangeirosTotal} estrangeiro${estrangeirosTotal > 1 ? "s" : ""}: ${parts.join(", ")}`;
  }, [estrangeirosByCountry, estrangeirosTotal]);
  // As 3 bandeiras mais frequentes (para mostrar inline no card)
  const topCountries = useMemo(
    () => [...estrangeirosByCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
    [estrangeirosByCountry]
  );
  return (
    <button
      className={"tourn-tab tourn-tab-sm" + (active ? " active" : " tourn-tab-muted")}
      onClick={onClick}
      title={`Campeonato Nacional de Jovens ${t.nome}${recentes ? ` · ${recentes} inscrito${recentes > 1 ? "s" : ""} nas últimas 48h` : ""}${estrangeirosTitle}`}
    >
      {escShort(t.escalao)}
      <SexBadge sex={t.sex} size="sm" />
      {t._status === "loading" && <span style={{ opacity: 0.7 }}>⟳</span>}
      {t._status === "error"   && <span className="fw-700" style={{ color: "var(--color-bad)" }}>!</span>}
      {t._status === "ok" && t.totalInscritos > 0 && (
        <span className="fs-11 fw-700" style={{
          background: active ? "rgba(255,255,255,0.25)" : "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 10, padding: "0px 5px",
          color: active ? "inherit" : "var(--text-1)",
          marginLeft: 2,
        }}>{t.totalInscritos}</span>
      )}
      {estrangeirosTotal > 0 && (
        <span className="fs-10 fw-700" style={{
          marginLeft: 3, padding: "0 4px", borderRadius: 8,
          background: active ? "rgba(255,255,255,0.18)" : "var(--bg-card)",
          border: "1px solid var(--border)",
          display: "inline-flex", alignItems: "center", gap: 2,
        }}>
          {topCountries.map(([cc]) => <span key={cc}>{FLAG[cc] ?? "🏳️"}</span>)}
          {estrangeirosByCountry.size > topCountries.length && <span style={{ opacity: 0.7 }}>+</span>}
          <span>{estrangeirosTotal}</span>
        </span>
      )}
      {recentes > 0 && <span className="new-round-dot" style={{ marginLeft: 2 }} title={`${recentes} nas últimas 48h`} />}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   VISTA INSCRIÇÕES — tabela completa
   ═══════════════════════════════════════════════════════ */
type InscSortKey = "pos" | "nome" | "hcp" | "vac" | "sd5" | "data" | "trend" | "rondas";

function InscricoesView({ t, nossosFedSet, nossosByFed, statsDb }: {
  t: TorneioData; nossosFedSet: Set<string>; nossosByFed: Map<string, BdPlayer>; statsDb: StatsDb;
}) {
  const fedCountries = useFedCountries();
  const [search, setSearch] = useState("");
  const { sortKey, sortDir, toggleSort } = useSort<InscSortKey>("pos");
  const sortAsc = sortDir === "asc";
  const term = norm(search);

  const nossosCount = useMemo(
    () => t.jogadores.filter(j => j.fed && nossosFedSet.has(j.fed)).length,
    [t.jogadores, nossosFedSet]
  );

  /* ── Inscrições recentes (últimas 48h) e desinscrições ── */
  const recentes48h = useMemo(
    () => t.jogadores.filter(j => isRecentHours(j.dataInscricao, 48)),
    [t.jogadores]
  );
  const removidos48h = useMemo(
    () => t.diff?.removed ?? [],
    [t.diff]
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

  if (t._status !== "ok" && t._status !== "loading") return null;
  if (t._status === "loading") return <LoadingState size="sm" />;

  return (
    <div>
      <div className="detail-toolbar">
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Nome, num fed..." style={{ maxWidth: 200 }} />
        <span className="muted fs-12" >{nossosCount} da BD · {t.totalInscritos} total</span>
        <div className="ml-auto gap-8 flex-wrap" style={{ display: "flex", alignItems: "center" }}>
          {t.diff && (t.diff.added.length > 0 || t.diff.removed.length > 0) && (
            <span className="fs-10 fw-700" style={{ background: "var(--color-warn)", color: "#fff", padding: "2px 7px", borderRadius: 10 }}
              title={[t.diff.added.length ? `+${t.diff.added.join(", ")}` : "", t.diff.removed.length ? `-${t.diff.removed.join(", ")}` : ""].filter(Boolean).join(" · ")}>
              {t.diff.added.length > 0 && `+${t.diff.added.length} novo${t.diff.added.length > 1 ? "s" : ""}`}
              {t.diff.added.length > 0 && t.diff.removed.length > 0 && " · "}
              {t.diff.removed.length > 0 && `-${t.diff.removed.length} removido${t.diff.removed.length > 1 ? "s" : ""}`}
            </span>
          )}
          {t.lastFetched && (
            <span className="fs-10 fw-700"
              style={{
                padding: "2px 7px", borderRadius: 10,
                background: t.fromCache ? "var(--bg-muted)" : "var(--bg-success-subtle)",
                color:      t.fromCache ? "var(--text-muted)" : "var(--color-good-dark)",
                border:     t.fromCache ? "1px solid var(--border)" : "1px solid var(--color-good)",
              }}
              title={t.fromCache
                ? `Cache estática (public/data/inscricoes_nacionais.json) de ${t.lastFetched}${t.lastChanged && t.lastChanged !== t.lastFetched ? " · alterado " + t.lastChanged : ""}`
                : `Dados frescos da FPG (scoring.fpg.pt/lists) às ${t.lastFetched}`}>
              {t.fromCache ? "💾 cache" : "🟢 live FPG"} · {fmtTime(t.lastFetched)}
            </span>
          )}
          {t.fetchError && <span className="fs-10 fw-700" style={{ color: "#fff", background: "var(--color-warn)", padding: "2px 7px", borderRadius: 10 }} title={t.fetchError}>⚠️ API falhou — só cache</span>}
          {t.fpgUrl && <a href={t.fpgUrl} target="_blank" rel="noopener noreferrer" className="fs-11" style={{ color: "var(--chart-2)" }}>scoring.fpg.pt ↗</a>}
        </div>
      </div>
      {/* ── Alerta inscrições/desinscrições últimas 48h ── */}
      {(recentes48h.length > 0 || removidos48h.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "6px 12px",
          background: "var(--bg-muted)", borderRadius: 6, margin: "4px 0 6px", fontSize: "var(--fs-12)" }}>
          {recentes48h.length > 0 && (
            <span style={{ color: "var(--color-good)" }}>
              <span className="fw-700">+{recentes48h.length} inscrito{recentes48h.length > 1 ? "s" : ""} (48h):</span>{" "}
              {recentes48h.map((j, i) => {
                const p = j.fed ? nossosByFed.get(j.fed) : undefined;
                return <span key={j.fed ?? j.nome}>{i > 0 && ", "}<CountryFlag fed={j.fed} fedCountries={fedCountries} /><span className={p ? "fw-600" : ""}>{p?.name ?? j.nome}</span></span>;
              })}
            </span>
          )}
          {removidos48h.length > 0 && (
            <span style={{ color: "var(--color-bad)" }}>
              <span className="fw-700">-{removidos48h.length} desistência{removidos48h.length > 1 ? "s" : ""}:</span>{" "}
              {removidos48h.join(", ")}
            </span>
          )}
        </div>
      )}
      <div className="scroll-x">
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
              <SortableHdr k="pos"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>#</SortableHdr>
              <SortableHdr k="nome"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Nome</SortableHdr>
              <th className="r">Fed</th>
              <SortableHdr k="hcp"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">HCP</SortableHdr>
              <SortableHdr k="vac"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">VAC</SortableHdr>
              <SortableHdr k="sd5"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">SD5</SortableHdr>
              <SortableHdr k="trend"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">T</SortableHdr>
              <SortableHdr k="rondas" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">R3m</SortableHdr>
              <SortableHdr k="data"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Insc</SortableHdr>
              <th>Na BD</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((j, i) => {
              const p  = j.fed ? nossosByFed.get(j.fed) : undefined;
              const st = j.fed ? statsDb[j.fed] : null;
              const sd5 = st?.avgSD5 ?? null;
              const recent = isRecentHours(j.dataInscricao, 48);
              return (
                <tr key={`${j.fed ?? j.nome}-${i}`}
                  style={recent ? { background: "color-mix(in srgb, var(--score-eagle) 10%, transparent)" } : undefined}>
                  <td className="muted r fs-11">{i + 1}</td>
                  <td className="fs-13">
                    <CountryFlag fed={j.fed} fedCountries={fedCountries} />
                    {p ? <PlayerLink fed={j.fed} name={p.name} query="?view=by_date" className="fw-700" /> : <span className="muted">{j.nome || "–"}</span>}
                  </td>
                  <td className="r">
                    {j.fed ? <PlayerLink fed={j.fed} name={j.fed} query="?view=by_date" className="fs-12" style={{ color: "var(--chart-2)" }} /> : <span className="muted">–</span>}
                  </td>
                  <td className="r muted fs-12" >{fmtHcp(j.hcp)}</td>
                  <td className="r fs-12 fw-600" >{fmtHcp(j.vac)}</td>
                  <td className="r fs-11" >
                    {sd5 != null ? <span className={`p p-${sdClassByHcp(sd5, st?.currentHcp ?? j.hcp ?? null)} fs-11`}>{sd5.toFixed(1)}</span> : <span className="muted">–</span>}
                  </td>
                  <td className="r"><TrendBadge trend={st?.hcpTrend ?? null} delta={st?.hcpDelta3m ?? null} /></td>
                  <td className="r fs-12" >
                    {st?.roundsLast3m != null
                      ? <span style={{ fontWeight: st.roundsLast3m >= 4 ? 600 : 400, color: st.roundsLast3m === 0 ? "var(--color-bad)" : "inherit" }}>{st.roundsLast3m}</span>
                      : <span className="muted">–</span>}
                  </td>
                  <td className="r fs-11" style={{ whiteSpace: "nowrap" }}>
                    <span className="muted">{fmtDataInscricao(j.dataInscricao)}</span>
                    {recent && <span className="p p-sm fs-10 fw-700" style={{
                      background: "var(--score-eagle)", color: "#fff",
                      marginLeft: 4, padding: "1px 5px", borderRadius: 8,
                    }} title="Inscrito nas últimas 48h">NOVO</span>}
                  </td>
                  <td>
                    {p ? <span className="gap-4 flex-wrap" style={{ display: "flex", alignItems: "center" }}>
                        <SexBadge sex={p.sex} size="sm" />
                        <span className={`p p-sm p-${escCls(p.escalao)} fs-10`}>{escShort(p.escalao)}</span>
                        {p.dob && <AnoEscalaoPill dob={p.dob} escalao={t.escalao} />}
                        {p.clube && <span className="muted fs-11" >{p.clube}</span>}
                      </span>
                    : <span className="muted fs-11" >{j.fed ? "Nao na BD" : "–"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <EmptyState size="sm" message="Sem resultados" />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   InscricoesPanel — inscrições do Nacional, integrado no Jovens
   ═══════════════════════════════════════════════════════ */
export function InscricoesPanel() {
  const { players } = useAppContext();
  const statsDb = usePlayerStats();
  const inFlight = useRef(new Set<string>());

  const [torneios, setTorneios] = useState<TorneioData[]>(() =>
    TORNEIOS_CONFIG.map(t => ({ ...t, totalInscritos: 0, jogadores: [], lastFetched: null, lastChanged: null, fromCache: undefined, diff: null, _status: "idle" as const }))
  );
  const [activeTcode, setActiveTcode] = useState<string>("10941");

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

  /* ── Carregar cache estática inteira no mount (todos os escalões de uma vez) ── */
  const cacheLoaded = useRef(false);
  useEffect(() => {
    if (cacheLoaded.current) return;
    cacheLoaded.current = true;
    cachedFetchJson<Record<string, unknown>>("/data/inscricoes_nacionais.json")
      .then((all) => {
        if (!all) return;
        setTorneios(prev => prev.map(t => {
          const entry = all[t.tcode];
          if (!entry || t._status === "ok") return t;  // não sobrescrever dados frescos
          return { ...t, ...(entry as object), _status: "ok" as const, fromCache: true };
        }));
      })
      .catch(() => {});
  }, []);

  const fetchTorneio = useCallback(async (tcode: string, forceRefresh = false) => {
    inFlight.current.delete(tcode); inFlight.current.add(tcode);
    setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, _status: "loading" } : t));
    try {
      const apiUrl = `/api/inscricoes?tcode=${tcode}${forceRefresh ? "&refresh=1" : ""}`;
      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, ...data, _status: "ok" } : t));
    } catch { /* cache já está carregada — só marcar erro se nem cache existir */
      setTorneios(prev => prev.map(t => t.tcode === tcode
        ? { ...t, _status: t.jogadores.length > 0 ? "ok" : "error", fetchError: "API inacessível" } : t));
    }
    finally { inFlight.current.delete(tcode); }
  }, []);

  const refreshAll = useCallback(() => {
    inFlight.current.clear();
    TORNEIOS_CONFIG.reduce((chain, cfg) =>
      chain.then(() => fetchTorneio(cfg.tcode, true).then(() => new Promise<void>(r => setTimeout(r, 350)))),
      Promise.resolve()
    );
  }, [fetchTorneio]);

  /* ── Auto-fetch em tempo real do torneio activo (sem forçar refresh no servidor) ── */
  const fetchedOnce = useRef(new Set<string>());
  useEffect(() => {
    if (!activeTcode || fetchedOnce.current.has(activeTcode)) return;
    fetchedOnce.current.add(activeTcode);
    fetchTorneio(activeTcode, false);
  }, [activeTcode, fetchTorneio]);

  const torneioActivo = torneios.find(t => t.tcode === activeTcode) ?? torneios[0];
  const totalNossosInscritos = useMemo(() => {
    const feds = new Set<string>();
    for (const t of torneios) for (const j of t.jogadores) if (j.fed && nossosFedSet.has(j.fed)) feds.add(j.fed);
    return feds.size;
  }, [torneios, nossosFedSet]);

  return (
    <div>
      {/* Selector de escalão */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5, flexWrap: "nowrap",
        padding: "6px 12px", overflowX: "auto", scrollbarWidth: "none" as const,
        borderBottom: "1px solid var(--border-light)", background: "var(--bg-card)",
      }}>
        {torneios.map(t => (
          <TorneioCard key={t.tcode} t={t} active={activeTcode === t.tcode} onClick={() => setActiveTcode(t.tcode)} />
        ))}
        <div style={{ flex: 1, minWidth: 8 }} />
        {totalNossosInscritos > 0 && <span className="chip shrink-0" >{totalNossosInscritos} na BD</span>}
        <button className="tourn-tab tourn-tab-sm tourn-tab-muted" onClick={refreshAll}
          style={{ flexShrink: 0 }}
          title="Actualizar inscrições da FPG">↺</button>
      </div>
      <PainelResumo torneios={torneios} nossosByFed={nossosByFed} />
      <div style={{ padding: "0 12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 0 8px",
          borderBottom: "1px solid var(--border)", marginBottom: 8, flexWrap: "wrap" }}>
          <span className="fw-700 fs-14">
            Campeonato Nacional de Jovens — {torneioActivo.nome}
          </span>
          <a href={`https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=000&tcode=${torneioActivo.tcode}`}
             target="_blank" rel="noopener noreferrer" className="fs-11" style={{ color: "var(--chart-2)" }}>
            inscrições datagolf ↗
          </a>
          <a href="https://competicoes.fpg.pt/evento/campeonato-nacional-de-jovens-sub10-12-14-16-18-pga-aroeira/"
             target="_blank" rel="noopener noreferrer"
             className="fs-11 fw-700"
             style={{ color: "var(--color-good-dark)",
               background: "var(--bg-success-subtle)", border: "1px solid var(--color-good)",
               borderRadius: 6, padding: "2px 8px", textDecoration: "none", whiteSpace: "nowrap" as const }}>
            🏆 página oficial FPG ↗
          </a>
        </div>
        <InscricoesView t={torneioActivo} nossosFedSet={nossosFedSet} nossosByFed={nossosByFed} statsDb={statsDb} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   JOVENS — agrupamento por evento (date + ccode)
   ═══════════════════════════════════════════════════════════════ */
/** EventGroup — agrupa torneios do mesmo organizador no mesmo dia (ou do
 *  mesmo evento multi-dia). Cada entry é um tcode distinto; quando um
 *  campeonato tem vários escalões paralelos, todos caem numa mesma
 *  EventGroup com o nome simplificado (sem "Sub-N", "Dia N", etc.).
 */
export interface EventGroup {
  key: string;          // `${date}-${ccode||campo}`
  date: string;
  campo: string;
  ccode: string;
  name: string;         // nome simplificado (sufixos escalão/dia/ronda/género removidos)
  entries: Tournament[];
}

/** Tokenizar nome para similarity: strip de ruído variável (Dia N, R1/R2,
 *  Sub-N, Rapazes/Raparigas, Masc/Fem, M/H/F isolados, ano de 4 dígitos),
 *  lowercase, remover diacríticos, partir por whitespace/separadores. */
export function eventNameTokens(name: string): Set<string> {
  const cleaned = (name || "")
    .replace(/\s*\bDia\b\s*\d+/gi, " ")
    .replace(/\s*\bR\d+\b/gi, " ")
    .replace(/\s*\bSub[\s-]*\d+\s*[HMSFR]?\b/gi, " ")
    .replace(/\s*\b(Rapazes?|Raparigas?|Masculin[oa]s?|Femininos?|Masc|Fem|Hom(?:ens)?|Srs?a?s?)\b/gi, " ")
    .replace(/\s+[HMF]\b/g, " ") // H/M/F isolados (ex: "Sub 12 H")
    .replace(/\s*\b20\d{2}\b/g, " ")
    .replace(/[-–—·/|()]/g, " ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return new Set(
    cleaned.split(/\s+/).map(s => s.trim()).filter(w => w.length >= 2)
  );
}

/** Jaccard = |A ∩ B| / |A ∪ B|. Dois conjuntos vazios → 1 (indistinguíveis). */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Partição de um conjunto de torneios em sub-grupos pelo grafo de
 *  similarity: aresta entre i/j se Jaccard(tokens_i, tokens_j) ≥ threshold.
 *  Componentes conexas via union-find. */
function partitionByJaccard(entries: Tournament[], threshold: number): Tournament[][] {
  const n = entries.length;
  if (n <= 1) return [entries];
  const toks = entries.map(e => eventNameTokens(e.name || ""));
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const link = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (jaccardSimilarity(toks[i], toks[j]) >= threshold) link(i, j);
    }
  }
  const buckets = new Map<number, Tournament[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!buckets.has(r)) buckets.set(r, []);
    buckets.get(r)!.push(entries[i]);
  }
  return [...buckets.values()];
}

/** Nome simplificado do grupo: retira sufixos de escalão/género/dia. */
function cleanGroupName(raw: string): string {
  return (raw || "")
    .replace(/\s*\(?\s*escal[aã]o\s+[A-Za-z0-9]+\s*\)?/gi, " ")
    .replace(/\s*-?\s*(Rapazes?|Raparigas?|Masculin[oa]s?|Femininos?|Masc|Fem)\s*$/i, "")
    .replace(/\s*Sub[\s-]*\d+\s*[HMSFR]?\s*$/i, "")
    // Escalões em notação internacional ("- U12", "-U14", "U21 & U16") — os
    // torneios de clube do Algarve/Norte usam-na em vez de "Sub N". Sem esta
    // regra o grupo da sidebar herdava o nome do 1º escalão ("Paul McGinley
    // Junior Cup 2026 - U12") em vez do nome do evento.
    .replace(/\s*[-–]?\s*U\s*\d{1,2}(\s*(?:&|e|\/|\+)\s*U?\s*\d{1,2})*\s*[HMSF]?\s*$/i, "")
    .replace(/\s*-?\s*\d+\s*buracos?\s*$/i, "")
    .replace(/\s*\bDia\b\s*\d+\s*$/i, "")
    .replace(/\s*\bR\d+\s*$/i, "")
    .replace(/\s+[HMF]$/, "")
    .replace(/\s+/g, " ")
    .replace(/[\s\-–]+$/, "").trim();
}

/** Builder genérico: agrupa torneios por (date+ccode) → funde multi-dia →
 *  divide por similarity Jaccard.
 *  @param jaccardThreshold mínimo de similaridade entre QUALQUER par para
 *         manter no mesmo grupo (default 0.5).  */
export function buildEventGroups(
  tournaments: Tournament[],
  opts: { jaccardThreshold?: number; mergeEditions?: boolean } = {}
): EventGroup[] {
  const threshold = opts.jaccardThreshold ?? 0.5;
  const escIdx = (esc: string | null | undefined) => {
    const i = ESC_ORDER_JOV.indexOf(esc || "");
    return i >= 0 ? i : 99;
  };
  const getEsc = (t: Tournament) => t.escalao || inferEscalao(t.name || "");

  // Phase 1: agrupar por date+ccode (mesmo dia, mesmo local)
  const phase1 = new Map<string, Tournament[]>();
  for (const t of tournaments) {
    const k = (t.date || "") + "-" + (t.ccode || t.campo || "?");
    if (!phase1.has(k)) phase1.set(k, []);
    phase1.get(k)!.push(t);
  }

  // Phase 2: fundir APENAS grupos "Dia 1"/"Dia 2" do mesmo evento multi-dia.
  // Strip conservador — só "Dia N" e ano. Não strip de Sub-N/género: se dois
  // torneios em dias diferentes têm nomes que só diferem em "Sub 10"/"Sub 12",
  // provavelmente são eventos distintos do mesmo circuito (ex: ranking PJA #1
  // e #2 em semanas seguidas) — fundi-los seria erro. O caso Nacional Aroeira
  // (Sub N em dias diferentes) apanha-se na Phase 1 se todos os escalões
  // partilham `date` (data de início do evento).
  const normDia = (name: string) => (name || "")
    .replace(/\s*\bDia\b\s*\d+/gi, "")
    // "(Escalão A)"/"Escalão B" — o mesmo campeonato dividido por nível.
    // Strip para que os escalões (que podem ter datas diferentes) caiam no
    // mesmo bucket Phase 2 e agrupem numa só entrada sidebar com tabs.
    .replace(/\s*\(?\s*escal[aã]o\s+[A-Za-z0-9]+\s*\)?/gi, " ")
    .replace(/\s*\b20\d{2}\b\s*/g, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();

  const phase2 = new Map<string, Tournament[]>();
  for (const [, entries] of phase1) {
    const t0 = entries[0];
    const year = (t0.date || "").substring(0, 4);
    const norm = normDia(t0.name || "");
    const k2 = year + "|" + (t0.ccode || t0.campo || "?") + "|" + norm;
    if (!phase2.has(k2)) phase2.set(k2, []);
    phase2.get(k2)!.push(...entries);
  }

  // Phase 3: dentro de cada grupo multi-dia, split por Jaccard < threshold.
  // Evita fundir "Medal Sócios" + "Stableford Solidariedade" no mesmo clube/dia.
  const finalParts: Tournament[][] = [];
  for (const [, entries] of phase2) {
    for (const part of partitionByJaccard(entries, threshold)) {
      finalParts.push(part);
    }
  }

  const sortEntries = (entries: Tournament[]) => entries.sort((a, b) => {
    const dCmp = (a.date || "").localeCompare(b.date || "");
    if (dCmp !== 0) return dCmp;
    return escIdx(getEsc(a)) - escIdx(getEsc(b));
  });

  let groups: EventGroup[] = finalParts.map((entries) => {
    sortEntries(entries);
    const t0 = entries[0];
    const cleanName = cleanGroupName(t0.name || "");
    // Chave única: inclui o tcode da primeira entrada para desambiguar quando
    // a Phase 3 (Jaccard) divide um bucket (date+ccode) em 2+ sub-grupos.
    // Sem isto, grupos irmãos no mesmo dia/clube partilham key e o lookup
    // via `.find(g => g.key === ...)` devolve sempre o primeiro.
    return {
      key:   (t0.date || "") + "-" + (t0.ccode || t0.campo || "?") + "-" + String(t0.tcode ?? "?"),
      date:  t0.date || "",
      campo: t0.campo || "",
      ccode: t0.ccode || "",
      name:  cleanName || t0.name || "",
      entries: entries.map(e => e.escalao
        ? e
        : { ...e, escalao: inferEscalao(e.name || "") } as Tournament),
    };
  });

  // Phase 4 (opt-in): fundir EDIÇÕES numeradas da mesma série — "1º/2º Torneio
  // …", "… / … 2" — que a Phase 2 mantém separadas (datas diferentes). Só junta
  // dentro do MESMO ano + MESMO clube + MESMO campo; campos diferentes NUNCA
  // agrupam (regra explícita). Cada edição vira uma sub-tab rotulada pela data.
  if (opts.mergeEditions) groups = mergeEditionGroups(groups, getEsc, sortEntries);

  return groups.sort((a, b) => b.date.localeCompare(a.date));
}

/** Remove marcadores de edição de um nome de série: ordinal inicial ("1º"),
 *  número de edição final ("… 2") e ano. Duas séries com o mesmo resultado são
 *  edições da mesma prova. */
function editionSeriesKey(name: string): string {
  return (name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b20\d{2}\b/g, " ")               // ano
    .replace(/^\s*\d{1,3}\s*[ºªo°.]+\s*/, " ")  // ordinal inicial "1º"/"2.ª"
    // número de edição final "… 2" — MAS não o nº de escalão ("… Sub 12"):
    .replace(/(?<!sub)\s+\d{1,2}\s*$/, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Fusões FORÇADAS (curadas) — séries que a regra automática não junta porque o
 * nome varia entre edições de forma que `editionSeriesKey` não normaliza (ex.:
 * sufixo de patrocinador diferente por edição). Cada regra força um `key` comum
 * a todos os torneios que casam `match` no `ccode` dado; continua a agrupar por
 * ANO + CAMPO (não funde anos nem campos diferentes). `label` = nome do grupo.
 */
const FORCED_EDITION_SERIES: { ccode: string; match: RegExp; key: string; label: string }[] = [
  // Citygolf — os "Troféu Par3" (e Par3 Estágio Verão) trocam de patrocinador a
  // cada edição ("by Chef Mamã"/"by Trueknowledge"/"by Clark…"), o que impedia a
  // fusão automática. Forçar a série toda por ano.
  { ccode: "107", match: /\bpar\s*-?\s*3\b/i, key: "citygolf-par3", label: "Torneios Par3" },
  // Palheiro — circuito "Academia Junior" (1º/2º/3º, alguns com sufixo "Natal")
  // + a "Junior Major" final. Nomes variam demais para a regra automática.
  { ccode: "059", match: /academia\s+junior|junior\s+major/i, key: "palheiro-academia-junior", label: "Academia Junior" },
];

/** Fusão de grupos-edição (ver Phase 4). Junta grupos com o mesmo
 *  ano|ccode|campo|editionSeriesKey; cada entrada ganha `_tabLabel` = data
 *  (dd/mm), com o escalão quando o grupo tem vários. */
function mergeEditionGroups(
  groups: EventGroup[],
  getEsc: (t: Tournament) => string | null,
  sortEntries: (e: Tournament[]) => Tournament[],
): EventGroup[] {
  const byKey = new Map<string, EventGroup[]>();
  const forcedLabel = new Map<string, string>();  // key → nome de grupo curado
  for (const g of groups) {
    const year = (g.date || "").slice(0, 4);
    const camp = (g.campo || "").toLowerCase().trim();
    const rawName = g.entries[0]?.name || g.name;
    // Fusão FORÇADA (curada) tem prioridade sobre a regra automática.
    const forced = FORCED_EDITION_SERIES.find(f => f.ccode === g.ccode && f.match.test(rawName));
    // Casar pelo nome ORIGINAL da 1ª entrada (mantém o escalão) e não por
    // `g.name` (que já tirou o escalão) — assim só juntamos quando os nomes
    // diferem MESMO por número de edição (ordinal/nº final), nunca por escalão:
    // "Torneio Regional Sub 10" e "… Sub 12" ficam separados de propósito.
    const sk = forced ? forced.key : editionSeriesKey(rawName);
    if (!sk) { byKey.set("__solo__" + g.key, [g]); continue; }
    const k = `${year}|${g.ccode || camp || "?"}|${camp}|${sk}`;
    if (forced) forcedLabel.set(k, forced.label);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(g);
  }
  const out: EventGroup[] = [];
  for (const [k, grp] of byKey) {
    if (grp.length === 1) { out.push(grp[0]); continue; }
    const allEntries = sortEntries(grp.flatMap(g => g.entries));
    // Só fundir quando TODAS as edições têm data real — a sub-tab é rotulada
    // pela data (dd/mm); sem data ficaria vazia. Torneios sem data mantêm-se
    // como entradas separadas (não regride o que já existia).
    if (!allEntries.every(e => (e.date || "").length >= 7)) {
      for (const g of grp) out.push(g);
      continue;
    }
    const multiEsc = new Set(allEntries.map(e => getEsc(e) || "")).size > 1;
    // Nº de buracos do nome ("- 9 buracos"/"18 B") — desambigua variantes 9b/18b
    // que partilham a data (ex.: Academia Junior tem os dois no mesmo dia).
    const holesOf = (name: string) => {
      const m = /(\d{1,2})\s*(?:buracos?|b)\b/i.exec(name || "");
      return m ? `${m[1]}b` : "";
    };
    const seenLbl = new Map<string, number>();
    const labelled = allEntries.map(e => {
      const dm = (e.date || "").length >= 10 ? `${e.date!.slice(8, 10)}/${e.date!.slice(5, 7)}` : (e.date || "");
      const esc = getEsc(e);
      const extra = [multiEsc && esc ? esc : "", holesOf(e.name || "")].filter(Boolean).join(" · ");
      let lbl = extra ? `${dm} · ${extra}` : dm;
      // Garantir tabs únicas: se ainda houver colisão, sufixar contador.
      const n = (seenLbl.get(lbl) || 0) + 1;
      seenLbl.set(lbl, n);
      if (n > 1) lbl = `${lbl} (${n})`;
      return { ...e, _tabLabel: lbl } as Tournament;
    });
    // Nome do grupo: label curado (fusão forçada) ou o da edição mais recente,
    // sem os marcadores de edição.
    const base = [...grp].sort((a, b) => b.date.localeCompare(a.date))[0];
    const cleanBase = cleanGroupName(
      (base.name || "").replace(/^\s*\d{1,3}\s*[ºªo°.]+\s*/, "").replace(/\s+\d{1,2}\s*$/, ""),
    );
    out.push({
      ...base,
      name: forcedLabel.get(k) || cleanBase || base.name,
      date: allEntries.reduce((m, e) => (e.date || "") > m ? (e.date || "") : m, ""),
      entries: labelled,
    });
  }
  return out;
}

/** JovensGroup — extends EventGroup com campos específicos da vista Jovens. */
export interface JovensGroup extends EventGroup {
  year: string;
  isRegional: boolean;
  isNacional: boolean;
}

const ESC_ORDER_JOV = ["Sub 10","Sub 12","Sub 14","Sub 16","Sub 18","Sub 24","Sub 25"];

/** Extrai escalão do nome quando t.escalao é null */
function inferEscalao(name: string): string | null {
  const m = name.match(/Sub[\s-]*(\d+)/i);
  if (m) return "Sub " + m[1];
  const esc = name.match(/escal[aã]o\s+([A-Za-z0-9]+)/i);
  return esc ? "Escalão " + esc[1].toUpperCase() : null;
}

/** Wrapper sobre buildEventGroups que adiciona campos year/isRegional/isNacional
 *  para a vista Jovens. Mantém contrato pré-existente (mesma chave, mesma ordem). */
export function buildJovensGroups(tournaments: Tournament[]): JovensGroup[] {
  return buildEventGroups(tournaments).map(g => {
    const t0 = g.entries[0];
    return {
      ...g,
      year: (t0 as any)._jovensYear ?? (t0.date?.substring(0, 4) ?? "?"),
      isRegional: /regional/i.test(t0.name || ""),
      isNacional: /nacional/i.test(t0.name || ""),
    };
  });
}

/* ── nome → ficha do federado FPG (lazy-load, mesma cache dos hooks acima) ──
 *
 * Fonte: `/data/federados.json`. Serve para preencher os PORTUGUESES em
 * torneios estrangeiros, onde a fonte local (RFEG, FFG…) não os conhece: sem
 * isto os nossos aparecem no meio do field sem federado, sem clube, sem HCP e
 * sem escalão — precisamente os que mais interessam.
 *
 * Duas chaves por federado, ambas indiferentes à ordem do nome:
 *   1. todos os tokens ordenados  ("SETÚBAL, João" ↔ "João Setúbal")
 *   2. primeiro + último token    (apanha "Martim Johansen" ↔ "Martim Pinto
 *      Johansen", que é como a RFEG o inscreveu)
 *
 * ⚠ Chaves AMBÍGUAS (mais de um federado) são descartadas — e o consumidor só
 * deve consultar este mapa para quem JÁ SABE ser português (pela bandeira da
 * fonte). Um "Javier Silva" espanhol não pode herdar a ficha de um português
 * com nome parecido.
 */
export interface FedByNameEntry { fed: string; name: string; dob: string | null; hcp: number | null; club: string | null; sex: string | null }
const _fedNameKeys = (name: string): string[] => {
  const toks = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  if (toks.length < 2) return [];
  const ordenado = [...toks].sort().join(" ");
  // ⚠ Os extremos também vão ORDENADOS: a fonte escreve "JOHANSEN, Martim" e o
  // cadastro "Martim Pinto Johansen" — com a ordem original as chaves saíam
  // invertidas ("johansen|martim" vs "martim|johansen") e não casavam.
  const extremos = [toks[0], toks[toks.length - 1]].sort().join("|");
  return [ordenado, extremos].filter((k, i, arr) => arr.indexOf(k) === i);
};
let _fedByNamePromise: Promise<Map<string, FedByNameEntry>> | null = null;
export function loadFedByName(): Promise<Map<string, FedByNameEntry>> {
  if (_fedByNamePromise) return _fedByNamePromise;
  _fedByNamePromise = cachedFetchJson<any>("/data/federados.json")   // eslint-disable-line @typescript-eslint/no-explicit-any
    .catch(() => null)
    .then((feds) => {
      const byKey = new Map<string, FedByNameEntry[]>();
      if (!feds) return new Map<string, FedByNameEntry>();
      const items = feds.players || feds.federados || feds.records || (Array.isArray(feds) ? feds : []);
      for (const p of items) {
        const fed = String(p.federation_code || p.fed || "");
        const name = String(p.name || "");
        if (!fed || !name) continue;
        const hcpRaw = typeof p.hcp_index === "number" ? p.hcp_index : p.hcp_exact;
        const entry: FedByNameEntry = {
          fed, name,
          dob: typeof p.birthdate === "string" && /^\d{4}-\d{2}-\d{2}/.test(p.birthdate) ? p.birthdate.slice(0, 10) : null,
          // 99 é a sentinela FPG de "sem handicap"; acima de 54 está fora do cap WHS.
          hcp: typeof hcpRaw === "number" && hcpRaw < 54 ? hcpRaw : null,
          club: p.club_name || null,
          sex: p.gender || null,
        };
        for (const k of _fedNameKeys(name)) {
          const arr = byKey.get(k);
          if (arr) arr.push(entry); else byKey.set(k, [entry]);
        }
      }
      const out = new Map<string, FedByNameEntry>();
      for (const [k, arr] of byKey) if (arr.length === 1) out.set(k, arr[0]);
      return out;
    });
  return _fedByNamePromise;
}

/** Mapa nome→federado FPG para preencher os portugueses em provas estrangeiras.
 *  Consultar com `fedByNameKeys(nome)` e usar a PRIMEIRA chave que resolver. */
export function useFedByName(): Map<string, FedByNameEntry> {
  const [m, setM] = useState<Map<string, FedByNameEntry>>(new Map());
  useEffect(() => { loadFedByName().then(setM); }, []);
  return m;
}
export const fedByNameKeys = _fedNameKeys;

/* ── nome → ficha GolfBox (EGA + federações do norte da Europa) ──
 *
 * Fonte: `/data/golfbox-players.json` (gerado por scripts/build-golfbox-players.js).
 * Traz data de nascimento COMPLETA, nacionalidade, clube e nº de federado de
 * ~13,6 mil jogadores — o que as fontes locais não dão dos estrangeiros. Sem
 * isto, num torneio internacional metade do field fica sem idade nem escalão.
 *
 * ⚠ O consumidor DEVE passar a nacionalidade esperada: os nomes são de 20 e
 * tal países e um "Lucas Martin" sueco não pode herdar a ficha de um francês.
 * Entradas com `dobAlt` (duas datas para o mesmo nome = homónimos) são
 * descartadas, e chaves ambíguas dentro do mesmo país também.
 */
export interface GolfboxEntry { name: string; dob: string; nat: string | null; club: string | null; memberId: string | null }
let _golfboxPromise: Promise<Map<string, GolfboxEntry[]>> | null = null;
function loadGolfboxIndex(): Promise<Map<string, GolfboxEntry[]>> {
  if (_golfboxPromise) return _golfboxPromise;
  _golfboxPromise = cachedFetchJson<{ players?: (GolfboxEntry & { dobAlt?: string[] })[] }>("/data/golfbox-players.json")
    .catch(() => null)
    .then((d) => {
      const idx = new Map<string, GolfboxEntry[]>();
      for (const p of d?.players || []) {
        if (!p.name || !p.dob || p.dobAlt) continue;      // homónimo com datas diferentes
        for (const k of _fedNameKeys(p.name)) {
          const arr = idx.get(k);
          if (arr) arr.push(p); else idx.set(k, [p]);
        }
      }
      return idx;
    });
  return _golfboxPromise;
}
export function loadGolfboxPlayers(): Promise<Map<string, GolfboxEntry[]>> { return loadGolfboxIndex(); }

/** Ficha GolfBox de um nome, exigindo a nacionalidade (ISO-2 ou "GB-ENG"). */
export function golfboxLookup(
  idx: Map<string, GolfboxEntry[]> | undefined,
  nome: string,
  nat: string | null | undefined,
): GolfboxEntry | undefined {
  if (!idx || !nome) return undefined;
  // O GolfBox usa códigos próprios para as nações britânicas ("EN", "SQ", "WL",
  // "IG") — traduzir antes de comparar, senão nenhum inglês ou escocês casa.
  const alias: Record<string, string> = { "GB-ENG": "EN", "GB-SCT": "SQ", "GB-WLS": "WL", "GB-NIR": "IG", IE: "IG" };
  const want = nat ? (alias[nat] || nat).slice(0, 2).toUpperCase() : null;
  for (const k of _fedNameKeys(nome)) {
    const cand = (idx.get(k) || []).filter((p) => !want || (p.nat || "").toUpperCase().startsWith(want));
    if (cand.length === 1) return cand[0];
    // Vários com a mesma nacionalidade e o mesmo nome → ambíguo, não se escolhe.
    if (cand.length > 1) return undefined;
  }
  return undefined;
}
