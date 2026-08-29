/**
 * src/pages/fpg/fpgOmRanking.tsx
 *
 * Tab "🏅 Ordem de Mérito" para o TournamentDetail da FPGPage — aparece SÓ nos
 * torneios do CG Santo da Serra (ccode 007) que contam para as Ordens de Mérito
 * do clube (níveis A/B/C do "Regulamento OM CGSS 2026 by NOS Madeira").
 *
 * Mostra as 5 categorias:
 *   · Homens / Senhoras / Seniores / Super Seniores → link para o ranking
 *     OFICIAL (scoring.datagolf.pt) — a FPG já os calcula.
 *   · Júnior (0-18) → a FPG NÃO o publica; renderizamos aqui a tabela interna
 *     de `public/data/om-cgss-junior.json` (gerado por
 *     scripts/build-om-cgss-junior.js, que se auto-atualiza a partir das OMs
 *     adultas oficiais).
 *
 * O classificador de nível é por NOME (lista do regulamento) para o tab poder
 * aparecer também em provas FUTURAS ainda sem resultados (ex.: Rali, Summer,
 * majors) — nesses casos mostra o ranking júnior cumulativo + os links, com nota
 * de que a prova ainda não pontuou.
 */
import React, { useEffect, useMemo, useState } from "react";
import type { Tournament } from "../../data/fpgTypes";
import { cachedFetchJson } from "../../data/fetchCache";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import { MANUEL_FED } from "../../constants/manuel";
import { norm } from "../../utils/format";

/* ── Tipos do om-cgss-junior.json ── */
type Level = "A" | "B" | "C";
interface OmEventRef { tcode: string; ccode: string; name: string; date: string; level: Level; pos: number; gross: number; pts: number; }
interface OmRankingRow {
  rank: number; fed: string; name: string; club: string; gender?: string;
  canWin: boolean; total: number; played: number; bestDrop3: number; lastResult: number | null;
  events: OmEventRef[];
}
interface OmEvent { tcode: string; ccode: string; name: string; date: string; level: Level; course: string | null; nJuniors: number; juniors: { fed: string; name: string; club: string; gross: number; pos: number; pts: number }[]; }
interface OmAdultRow { name: string; fed: string; pos: number; pts: number; }
interface OmJuniorData {
  generated: string; season: number; title: string; subtitle: string;
  points?: Record<Level, Record<string, number>>;
  bands?: Record<Level, Record<string, number>>;
  eligibleCount?: number;
  officialAdultRankings: { homens: string; senhoras: string; seniores: string; superSeniores: string };
  adultLabels?: Record<string, string>;
  adultRankings?: Record<string, OmAdultRow[]>;
  omMembers?: Record<string, string>; // fed → catKey (todos os sócios CGSS, para o pill do escalão sem pontos)
  events: OmEvent[];
  ranking: OmRankingRow[];
}

/* ── Lookup jogador → categoria OM (as 5 categorias), para a coluna do draw ── */
export interface OmHit { catKey: string; label: string; pos: number; pts: number; isJunior: boolean; eligible?: boolean; }
export const OM_CAT_ORDER = ["junior", "homens", "senhoras", "seniores", "superSeniores"];
const CAT_SHORT: Record<string, string> = { junior: "Jr", homens: "H", senhoras: "S", seniores: "Sen", superSeniores: "SSen" };
// Tons de cinzento (não cores) — a categoria lê-se do texto (Jr/H/S/Sen/SSen);
// rampa de escuro→claro, com o Júnior (o nosso ranking) mais escuro para destacar.
const CAT_COLOR: Record<string, { bg: string; fg: string }> = {
  junior: { bg: "#374151", fg: "#fff" }, homens: { bg: "#4b5563", fg: "#fff" }, senhoras: { bg: "#6b7280", fg: "#fff" },
  seniores: { bg: "#9ca3af", fg: "#111827" }, superSeniores: { bg: "#d1d5db", fg: "#111827" },
};

/** Constrói um Map (fed E nome-normalizado → OmHit) a partir do om-cgss-junior.json. */
export function buildOmLookup(data: OmJuniorData | null): Map<string, OmHit> {
  const m = new Map<string, OmHit>();
  if (!data) return m;
  const add = (k: string, hit: OmHit) => { if (k && !m.has(k)) m.set(k, hit); };
  for (const r of data.ranking || []) {                         // júnior primeiro
    const hit: OmHit = { catKey: "junior", label: "Júnior", pos: r.rank, pts: r.total, isJunior: true };
    add("fed:" + r.fed, hit); add("nm:" + norm(r.name), hit);
  }
  for (const [key, list] of Object.entries(data.adultRankings || {})) {
    const label = data.adultLabels?.[key] || key;
    for (const r of list) {
      const hit: OmHit = { catKey: key, label, pos: r.pos, pts: r.pts, isJunior: false };
      add("fed:" + r.fed, hit); add("nm:" + norm(r.name), hit);
    }
  }
  // Sócios CGSS que ainda NÃO pontuaram: dão na mesma o pill da categoria do seu
  // escalão (vão pontuar ao jogar). Só por fed (sem nome); nunca sobrepõe um
  // pontuador (add() ignora chaves já presentes).
  const CAT_LABEL: Record<string, string> = { junior: "Júnior", homens: "Homens", senhoras: "Senhoras", seniores: "Seniores", superSeniores: "Super Sen." };
  for (const [fed, catKey] of Object.entries(data.omMembers || {})) {
    add("fed:" + fed, { catKey, label: CAT_LABEL[catKey] || catKey, pos: 0, pts: 0, isJunior: catKey === "junior", eligible: true });
  }
  return m;
}
/** Resolve o OmHit de um jogador (por fed, senão por nome normalizado). */
export function lookupOm(m: Map<string, OmHit> | null | undefined, fed?: string | null, name?: string | null): OmHit | null {
  if (!m) return null;
  if (fed && m.has("fed:" + fed)) return m.get("fed:" + fed)!;
  if (name && m.has("nm:" + norm(name))) return m.get("nm:" + norm(name))!;
  return null;
}
/** Carrega o om-cgss-junior.json (lazy, cacheado). `enabled` liga o fetch. */
export function useOmData(enabled: boolean): OmJuniorData | null {
  const [data, setData] = useState<OmJuniorData | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    cachedFetchJson<OmJuniorData>("/data/om-cgss-junior.json").then(d => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [enabled]);
  return data;
}
/** Badge da categoria OM (usado na coluna do draw). */
export function OmCatBadge({ hit }: { hit: OmHit }) {
  const c = CAT_COLOR[hit.catKey] || { bg: "#555", fg: "#fff" };
  // Sócio elegível ainda sem pontos: só o escalão, estilo tracejado (pontua ao jogar).
  if (hit.eligible) {
    return (
      <span className="p p-sm" style={{ background: "transparent", color: "var(--text-2)", border: "1px dashed var(--text-3)" }}
        title={`Ordem de Mérito · ${hit.label} — sócio CGSS elegível, ainda sem pontos (pontua ao jogar)`}>
        {CAT_SHORT[hit.catKey] || hit.label}
      </span>
    );
  }
  return (
    <span className="p p-sm" style={{ background: c.bg, color: c.fg, borderColor: "transparent" }}
      title={`Ordem de Mérito · ${hit.label} — ${hit.pos}º (${hit.pts} pts)`}>
      {CAT_SHORT[hit.catKey] || hit.label} {hit.pos}º
    </span>
  );
}

/* ── Classificador de nível OM por nome (do regulamento) ──
   As provas juniores exclusivas de 9 buracos NÃO contam e não batem em nenhum
   padrão (têm "9 buracos" e nomes fora da lista). Carnaval foi acrescentado
   pela Comissão Técnica (observado como Nível C). */
const OM_LEVELS: Array<{ rx: RegExp; level: Level }> = [
  // Nível A — Majors
  { rx: /\btrof[eé]u\s+jo[aã]o\s+sousa\b/i, level: "A" },
  { rx: /\bta[cç]a\s+do\s+clube\b/i, level: "A" },
  { rx: /\bta[cç]a\s+presidente\b/i, level: "A" },
  { rx: /\brestaura[cç][aã]o\b/i, level: "A" },
  // Nível B
  { rx: /\bnos\s+empresas\b/i, level: "B" },
  { rx: /\bbarbeito\b/i, level: "B" },
  // Nível C
  { rx: /\binverno\b/i, level: "C" },
  { rx: /\bprimavera\b/i, level: "C" },
  { rx: /\bp[aá]scoa\b/i, level: "C" },
  { rx: /\boutono\b/i, level: "C" },
  { rx: /\bs[aã]o\s+martinho\b/i, level: "C" },
  { rx: /\brali\b/i, level: "C" },
  { rx: /\bsummer\b/i, level: "C" },
  { rx: /\bcarnaval\b/i, level: "C" },
  // Série numerada "Nº Torneio CGSS OM NOS" (confirmado pela Mariana: Nível C).
  // Exige "OM NOS" literal para NÃO apanhar o "Torneio NOS Empresas" (Nível B),
  // que de qualquer forma já bate acima (o primeiro padrão a casar ganha).
  { rx: /\bom\s*\/?\s*nos\b/i, level: "C" },
];
/** Nível OM de um torneio, ou null se não conta. Só CGSS (ccode 007). */
export function omLevelOf(t: Tournament): Level | null {
  // ccode pode vir "7" ou "007" conforme a fonte — normalizar a 3 dígitos.
  if (String(t.ccode ?? "").padStart(3, "0") !== "007") return null;
  const name = t.name || "";
  if (/\b9\s*buracos?\b/i.test(name)) return null; // 9B não conta
  for (const { rx, level } of OM_LEVELS) if (rx.test(name)) return level;
  return null;
}

const LEVEL_LABEL: Record<Level, string> = { A: "Nível A (Major)", B: "Nível B", C: "Nível C" };

/* ── Calendário oficial das provas NOMEADAS no regulamento (13 provas) ──
   Serve para saber quantas provas da época já contam e quais ainda faltam.
   A Carnaval NÃO está aqui (não é nomeada no regulamento — foi acrescentada
   pela Comissão Técnica, regra 5); as provas juniores exclusivas de 9 buracos
   também não contam. Cada entrada casa por regex contra o nome do torneio. */
const OM_CALENDAR: Array<{ name: string; level: Level; rx: RegExp }> = [
  { name: "Troféu João Sousa", level: "A", rx: /\btrof[eé]u\s+jo[aã]o\s+sousa\b/i },
  { name: "Taça do Clube", level: "A", rx: /\bta[cç]a\s+do\s+clube\b/i },
  { name: "Taça Presidente", level: "A", rx: /\bta[cç]a\s+presidente\b/i },
  { name: "Torneio da Restauração", level: "A", rx: /\brestaura[cç][aã]o\b/i },
  { name: "Torneio NOS Empresas", level: "B", rx: /\bnos\s+empresas\b/i },
  { name: "Torneio Barbeito Madeira", level: "B", rx: /\bbarbeito\b/i },
  { name: "Torneio de Inverno", level: "C", rx: /\binverno\b/i },
  { name: "Torneio de Primavera", level: "C", rx: /\bprimavera\b/i },
  { name: "Torneio de Páscoa", level: "C", rx: /\bp[aá]scoa\b/i },
  { name: "Torneio de Outono", level: "C", rx: /\boutono\b/i },
  { name: "Torneio de São Martinho", level: "C", rx: /\bs[aã]o\s+martinho\b/i },
  { name: "Rali", level: "C", rx: /\brali\b/i },
  { name: "Summer", level: "C", rx: /\bsummer\b/i },
];

/* ── A tab ── */
function OmRankingTab({ tournament, level }: { tournament: Tournament; level: Level }) {
  const [data, setData] = useState<OmJuniorData | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    cachedFetchJson<OmJuniorData>("/data/om-cgss-junior.json")
      .then(d => { if (alive) setData(d); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, []);

  // Chaves de ordenação: fixas ("rank"|"name"|"played"|"total") + dinâmicas por
  // torneio ("ev:{tcode}", ordena pela posição nesse torneio, 1º primeiro).
  const { sortKey, sortDir, toggleSort } = useSort<string>("rank", "asc", { total: "desc", played: "desc" });

  // Esta prova está nos events do JSON? (tcode) → define a DATA "até à qual" se
  // mostra a classificação. Prova passada: contam só as provas com data ≤ a
  // desta (o estado da OM logo APÓS este torneio). Prova futura / ainda sem
  // resultados (não está nos events): classificação cumulativa ATUAL.
  const thisEvent = data?.events.find(e => String(e.tcode) === String(tournament.tcode));
  const asOf = thisEvent?.date || null;

  // Standings até à data (asOf). `herePts`/`herePos` = o que cada jogador ganhou
  // NESTA prova (0/null se não pontuou aqui).
  const standings = useMemo(() => {
    const list = (data?.ranking ?? []).map(p => {
      const evs = asOf ? p.events.filter(e => e.date <= asOf) : p.events;
      const total = asOf ? evs.reduce((s, e) => s + e.pts, 0) : p.total;
      const te = thisEvent ? evs.find(e => String(e.tcode) === String(thisEvent.tcode)) : undefined;
      return { ...p, events: evs, total, played: evs.length, herePts: te?.pts ?? 0, herePos: te?.pos ?? null };
    }).filter(p => p.total > 0);
    list.sort((a, b) => b.total - a.total || (a.lastResult ?? 99) - (b.lastResult ?? 99) || a.name.localeCompare(b.name));
    let rk = 0, prev: number | null = null, seen = 0;
    for (const p of list) { seen++; if (prev === null || p.total !== prev) { rk = seen; prev = p.total; } p.rank = rk; }
    return list;
  }, [data, asOf, thisEvent]);

  // Colunas da matriz = torneios que já contam até esta prova (data ≤ asOf),
  // por ordem de data. Prova futura (asOf null) → todos os já disputados.
  const eventCols = useMemo(() => {
    const evs = asOf ? (data?.events ?? []).filter(e => e.date <= asOf) : (data?.events ?? []);
    return [...evs].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [data, asOf]);

  // Provas do calendário oficial (regulamento) ainda por contar.
  const missing = useMemo(
    () => (data ? OM_CALENDAR.filter(c => !(data.events ?? []).some(e => c.rx.test(e.name))) : []),
    [data]
  );

  const rows = useMemo(() => {
    const r = [...standings];
    const dir = sortDir === "asc" ? 1 : -1;
    const posInEvent = (p: typeof standings[number], tc: string) => {
      const e = p.events.find(x => String(x.tcode) === tc);
      return e ? e.pos : Infinity; // quem não jogou vai para o fim
    };
    r.sort((a, b) => {
      if (sortKey === "name") return dir * a.name.localeCompare(b.name);
      if (sortKey === "played") return dir * (a.played - b.played) || a.rank - b.rank;
      if (sortKey === "total") return dir * (a.total - b.total) || a.rank - b.rank;
      if (sortKey.startsWith("ev:")) {
        const tc = sortKey.slice(3);
        return dir * (posInEvent(a, tc) - posInEvent(b, tc)) || a.rank - b.rank;
      }
      return dir * (a.rank - b.rank); // "rank"
    });
    return r;
  }, [standings, sortKey, sortDir]);

  const links = data?.officialAdultRankings;
  const linkRow: Array<{ label: string; href?: string; internal?: boolean }> = [
    { label: "Homens", href: links?.homens },
    { label: "Senhoras", href: links?.senhoras },
    { label: "Seniores", href: links?.seniores },
    { label: "Super Seniores", href: links?.superSeniores },
    { label: "Júnior", internal: true },
  ];

  return (
    <div className="om-rank-tab" style={{ padding: "4px 2px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <strong>Ordem de Mérito CGSS {data?.season ?? 2026}</strong>
        <span className="p p-sm p-muted">by NOS Madeira</span>
        <span className="p p-sm p-tourn" title="Esta prova conta para as Ordens de Mérito do clube.">
          Esta prova conta · {LEVEL_LABEL[level]}
        </span>
      </div>

      {/* Links das 5 categorias */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {linkRow.map(l =>
          l.internal ? (
            <span key={l.label} className="p p-sm" title="Ranking júnior (calculado por nós — a FPG não o publica). Ver tabela abaixo."
              style={{ background: "var(--accent-light)", color: "var(--accent)", fontWeight: 700 }}>
              🏅 {l.label} ↓
            </span>
          ) : l.href ? (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
              className="p p-sm p-muted" style={{ textDecoration: "none" }}
              title={`Ranking oficial ${l.label} (scoring.datagolf.pt)`}>
              {l.label} ↗
            </a>
          ) : (
            <span key={l.label} className="p p-sm p-muted" style={{ opacity: 0.5 }}>{l.label}</span>
          )
        )}
      </div>

      {err && <p className="p-muted">Ranking júnior indisponível de momento.</p>}
      {!data && !err && <p className="p-muted">A carregar ranking júnior…</p>}

      {data && (
        <>
          {/* Pontos em JOGO nesta prova (a mesma escala do nível para todas as
              categorias) — o que cada posição vale para a OM neste torneio. */}
          {(() => {
            const lvlPts = (data.points?.[level] || {}) as Record<string, number>;
            const bands = (data.bands?.[level] || {}) as Record<string, number>;
            const ladder: Array<{ pos: string; pts: number }> = [];
            for (let p = 1; p <= 10; p++) if (lvlPts[p] != null) ladder.push({ pos: `${p}º`, pts: lvlPts[p] });
            if (bands["11-15"] != null) ladder.push({ pos: "11-15º", pts: bands["11-15"] });
            if (bands["16-20"] != null) ladder.push({ pos: "16-20º", pts: bands["16-20"] });
            if (!ladder.length) return null;
            return (
              <div style={{ marginBottom: 12, padding: "8px 10px", background: "var(--accent-light)", borderRadius: 8 }}>
                <div className="fs-12" style={{ marginBottom: 6 }}>
                  🎯 <strong>Pontos em jogo nesta prova</strong> — {LEVEL_LABEL[level]} (por posição em cada categoria):
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {ladder.map(l => (
                    <span key={l.pos} className="p p-sm" style={{ background: "var(--bg-1)", borderColor: "var(--accent)" }}>
                      {l.pos} <strong style={{ color: "var(--accent)" }}>{l.pts}</strong>
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="fs-12 p-muted" style={{ marginBottom: 6 }}>
            <strong>Categoria Júnior</strong> (0-18) — {asOf
              ? <>classificação <strong>logo após esta prova</strong> ({asOf.split("-").reverse().join("/")}) · {rows.length} pontuadores</>
              : <>classificação <strong>atual</strong> · {rows.length} já pontuaram{data.eligibleCount ? ` de ${data.eligibleCount} elegíveis (Sub-18 e abaixo)` : ""}</>}
            {thisEvent
              ? (thisEvent.nJuniors > 0 ? <> · nesta prova pontuaram {thisEvent.nJuniors} juniores.</> : <> · esta prova não teve juniores a pontuar.</>)
              : <> · esta prova ainda não pontuou (sem resultados).</>}
          </div>
          {/* Matriz: uma coluna por torneio já disputado (data crescente); a
              célula é a posição do jogador nesse torneio (+ pontos). A coluna
              desta prova (se já pontuou) fica realçada. */}
          <div style={{ overflowX: "auto" }}>
            <table className="player-list-table om-rank-table" style={{ fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr>
                  <SortableHdr k="rank" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>#</SortableHdr>
                  <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "left" }}>Jogador</SortableHdr>
                  <SortableHdr k="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Pontos</SortableHdr>
                  <SortableHdr k="played" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Provas jogadas">Prov.</SortableHdr>
                  {eventCols.map(ev => {
                    const isHere = !!thisEvent && String(ev.tcode) === String(thisEvent.tcode);
                    return (
                      <SortableHdr key={ev.tcode} k={`ev:${ev.tcode}`} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}
                        title={`${ev.name} — ${ev.date.split("-").reverse().join("/")} — ${LEVEL_LABEL[ev.level]}${isHere ? " (esta prova)" : ""}`}
                        style={{ textAlign: "center", ...(isHere ? { background: "var(--accent-light)" } : {}) }}>
                        <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", lineHeight: 1.15 }}>
                          <span>{shortEv(ev.name)}</span>
                          <span className="fs-11 p-muted">({ev.level})</span>
                        </span>
                      </SortableHdr>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map(p => {
                  const isMan = p.fed === MANUEL_FED;
                  return (
                    <tr key={p.fed} className={isMan ? "row-manuel" : undefined}>
                      <td style={{ textAlign: "center", fontWeight: 700 }}>{p.rank}</td>
                      <td style={{ textAlign: "left", fontWeight: isMan ? 700 : undefined }}>
                        {p.name}{!p.canWin && <span className="p-muted" title="Não-CGSS: aparece no ranking mas não pode ganhar a OM (regulamento)."> *</span>}
                        <div className="p-muted fs-11">{p.club}</div>
                      </td>
                      <td style={{ textAlign: "center", fontWeight: 700 }}>{p.total}</td>
                      <td style={{ textAlign: "center" }}>{p.played}</td>
                      {eventCols.map(ev => {
                        const e = p.events.find(x => String(x.tcode) === String(ev.tcode));
                        const isHere = !!thisEvent && String(ev.tcode) === String(thisEvent.tcode);
                        return (
                          <td key={ev.tcode} className="fs-12"
                            style={{ textAlign: "center", whiteSpace: "nowrap", ...(isHere ? { background: "var(--bg-info-subtle)" } : {}) }}
                            title={e ? `${ev.name}: ${e.pos}º · gross ${e.gross} · +${e.pts} pts` : `${ev.name}: não jogou`}>
                            {e
                              ? <><b>{e.pos}º</b> <span className="fs-11" style={{ color: "var(--accent)", fontWeight: 700 }}>{e.pts}</span></>
                              : <span className="p-muted">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Torneios do calendário oficial ainda por contar (13 provas nomeadas
              no regulamento; a Carnaval foi acrescentada pela Comissão e os
              juniores exclusivos de 9 buracos não contam). */}
          {missing.length > 0 && (
            <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 8 }}>
              <div className="fs-12" style={{ marginBottom: 6 }}>
                📅 <strong>Torneios em falta</strong> — {missing.length} de {OM_CALENDAR.length} provas nomeadas ainda por contar
                {" "}({OM_CALENDAR.length - missing.length} já contam):
              </div>
              {(["A", "B", "C"] as Level[]).map(lv => {
                const items = missing.filter(m => m.level === lv);
                if (!items.length) return null;
                return (
                  <div key={lv} style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                    <span className="fs-11 p-muted" style={{ minWidth: 78 }}>{LEVEL_LABEL[lv]}:</span>
                    {items.map(m => {
                      const isThis = m.rx.test(tournament.name || "");
                      return (
                        <span key={m.name} className="p p-sm"
                          style={isThis ? { background: "var(--accent-light)", borderColor: "var(--accent)", fontWeight: 700 } : undefined}
                          title={isThis ? "É esta prova (ainda sem resultados publicados)." : undefined}>
                          {m.name}{isThis ? " ← esta prova" : ""}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
              <div className="fs-11 p-muted" style={{ marginTop: 6 }}>
                Além destas, os torneios juniores exclusivos (9 buracos) não contam. A época fecha a 14 Nov 2026 (regra 8).
              </div>
            </div>
          )}
          <p className="fs-11 p-muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
            <span title="Regra 1 do regulamento">* só sócios com homeclub CGSS podem ganhar a OM.</span>{" "}
            Posição em cada prova por <strong>gross</strong> entre os juniores (empates partilham; sem cartão não pontua).
            Provisório — no fecho da época (14 Nov) descontam-se as 3 piores pontuações (regra 7.1); desempate no 1º pelo
            melhor resultado na última prova, depois HCP WHS mais baixo (regra 4).
            Fonte: rankings oficiais CGSS + classificações por prova (auto-atualizado).
          </p>
        </>
      )}
    </div>
  );
}

/** Encurta o nome da prova para o detalhe (Torneio de Inverno CGSS → Inverno). */
function shortEv(name: string): string {
  return (name || "")
    .replace(/torneio\s+(d[ae]\s+)?/i, "")
    .replace(/\s*cgss.*$/i, "")
    .replace(/\s*\d{4}.*$/, "")
    .trim() || name;
}

/**
 * Devolve o extraTab da Ordem de Mérito para o torneio aberto, ou `undefined`
 * quando o torneio não conta para a OM (não é CGSS ou o nome não bate na lista
 * do regulamento). Passar ao `extraTabs` do TournamentDetail.
 */
export function fpgOmRankingTabs(
  current: Tournament | null | undefined,
): { key: string; label: string; content: React.ReactNode }[] | undefined {
  if (!current) return undefined;
  const level = omLevelOf(current);
  if (!level) return undefined;
  return [{
    key: "om-cgss",
    label: "🏅 Ordem de Mérito",
    content: <OmRankingTab tournament={current} level={level} />,
  }];
}
