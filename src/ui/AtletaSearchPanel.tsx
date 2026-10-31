/**
 * AtletaSearchPanel.tsx
 *
 * Procura por nome ou nº de federado um atleta e mostra os seus melhores
 * resultados em Campeonatos Nacionais (Sub-10 a Sub-18, 2005-2026).
 *
 * Funcionalidades:
 *   - Input de pesquisa: nome (parcial, case+accent insensitive) OU fed code
 *   - Lista de matches (sugestões) — clica para seleccionar
 *   - Painel do atleta com:
 *      - Resumo: total de Top-5, 🥇/🥈/🥉, melhor pos, anos cobertos
 *      - Tabela cronológica de TODAS as participações Nacionais com posição,
 *        score, escalão, link para o torneio na FPG
 */

import { useMemo, useState } from "react";
import { fmtToPar, fpgScoringUrl } from "../utils/format";
import { normName } from "../utils/normName";
import type { Tournament } from "../data/fpgTypes";
import { RoundPill, EscPill } from "./PillBadge";
import { useSort } from "../hooks/useSort";
import PosBadge from "./PosBadge";
import SortableHdr from "./SortableHdr";

interface PlayerEntry {
  pos: number | string | null;
  name: string;
  club?: string;
  fedCode?: string | null;
  grossTotal?: number | string | null;
  toPar?: number | null;
  dob?: string | null;
  age?: number | null;
  sex?: string;
}

interface NationalResult {
  date: string;
  year: string;
  pos: number;
  totalPlayers: number;
  ccode: string;
  tcode: string;
  tournamentName: string;
  escalao: string;
  campo: string;
  isClubes: boolean;
  gross: number | string | null;
  toPar: number | null;
  rounds: number;
}

interface AthleteFile {
  fed: string | null;
  name: string;
  club: string;
  dob: string | null;
  sex: string | null;
  results: NationalResult[];
  best: number;
  golds: number;
  silvers: number;
  bronzes: number;
  top5: number;
  top10: number;
}

/** Constroi um índice de atletas com todos os seus resultados em Nacionais. */
function buildAthleteIndex(
  tournaments: Array<Tournament & { tipo?: string }>,
): Map<string, AthleteFile> {
  const map = new Map<string, AthleteFile>();
  for (const t of tournaments) {
    const isClubes = /clubes/i.test(t.name || "");
    const totalPlayers = (t.players as PlayerEntry[] | undefined)?.length ?? 0;
    // Detectar nº de rondas a partir do roundScores do primeiro player com dados
    let rounds = 1;
    for (const p of t.players as PlayerEntry[]) {
      const rs = (p as { roundScores?: unknown[] }).roundScores;
      if (Array.isArray(rs) && rs.length > rounds) rounds = rs.length;
    }
    const escalao = (t as { escalao?: string }).escalao || "";
    for (const p of t.players as PlayerEntry[]) {
      const posNum =
        typeof p.pos === "number"
          ? p.pos
          : p.pos != null && !isNaN(parseInt(String(p.pos)))
          ? parseInt(String(p.pos))
          : null;
      if (posNum == null) continue;
      const fed = p.fedCode ? String(p.fedCode) : null;
      const key = fed ? `fed:${fed}` : `name:${normName(p.name || "?")}`;
      if (!map.has(key)) {
        map.set(key, {
          fed,
          name: p.name || "?",
          club: p.club || "",
          dob: p.dob || null,
          sex: p.sex || null,
          results: [],
          best: 999,
          golds: 0,
          silvers: 0,
          bronzes: 0,
          top5: 0,
          top10: 0,
        });
      }
      const a = map.get(key)!;
      // Update club/dob to most recent (greater date)
      if (p.club && p.club.length > a.club.length) a.club = p.club;
      if (p.dob && (!a.dob || (a.dob.endsWith("-06-01") && !p.dob.endsWith("-06-01")))) {
        a.dob = p.dob;
      }
      if (!a.sex && p.sex) a.sex = p.sex;
      a.results.push({
        date: t.date || "",
        year: (t.date || "").slice(0, 4),
        pos: posNum,
        totalPlayers,
        ccode: (t as { ccode?: string }).ccode || "000",
        tcode: t.tcode,
        tournamentName: t.name || "",
        escalao,
        campo: t.campo || "",
        isClubes,
        gross: typeof p.grossTotal === "number" ? p.grossTotal : (p.grossTotal ?? null),
        toPar: typeof p.toPar === "number" ? p.toPar : null,
        rounds,
      });
      if (posNum < a.best) a.best = posNum;
      if (posNum === 1) a.golds++;
      if (posNum === 2) a.silvers++;
      if (posNum === 3) a.bronzes++;
      if (posNum <= 5) a.top5++;
      if (posNum <= 10) a.top10++;
    }
  }
  // Sort results: most recent first
  for (const a of map.values()) {
    a.results.sort((x, y) => (y.date || "").localeCompare(x.date || "") || x.pos - y.pos);
  }
  return map;
}

/** Valor numérico para ordenação; nulos/strings vão para o fim (asc). */
function numVal(v: number | string | null): number {
  const n = typeof v === "number" ? v : v != null ? parseFloat(String(v)) : NaN;
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}


export default function AtletaSearchPanel({
  tournaments,
}: {
  tournaments: Array<Tournament & { tipo?: string }>;
}) {
  const index = useMemo(() => buildAthleteIndex(tournaments), [tournaments]);
  const all = useMemo(() => [...index.values()], [index]);

  const [q, setQ] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const matchSort = useSort<
    "name" | "fed" | "club" | "particip" | "golds" | "top5" | "best"
  >("particip", "desc");
  const detailSort = useSort<
    "date" | "escalao" | "pos" | "tipo" | "gross" | "toPar" | "em" | "tournament"
  >("date", "desc");

  const matches = useMemo(() => {
    const qNorm = normName(q);
    if (!qNorm || qNorm.length < 2) return [] as AthleteFile[];
    const isFed = /^\d+$/.test(qNorm);
    if (isFed) {
      return all.filter((a) => a.fed && a.fed.includes(qNorm)).slice(0, 30);
    }
    const tokens = qNorm.split(/\s+/).filter(Boolean);
    return all
      .filter((a) => {
        const n = normName(a.name);
        return tokens.every((t) => n.includes(t));
      })
      .sort((a, b) => b.results.length - a.results.length || a.name.localeCompare(b.name, "pt"))
      .slice(0, 30);
  }, [q, all]);

  const sortedMatches = useMemo(() => {
    const { sortKey, sortDir } = matchSort;
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...matches];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name, "pt");
          break;
        case "fed":
          cmp = (a.fed || "").localeCompare(b.fed || "", "pt");
          break;
        case "club":
          cmp = (a.club || "").localeCompare(b.club || "", "pt");
          break;
        case "particip":
          cmp = a.results.length - b.results.length;
          break;
        case "golds":
          cmp = a.golds - b.golds;
          break;
        case "top5":
          cmp = a.top5 - b.top5;
          break;
        case "best":
          cmp = a.best - b.best;
          break;
      }
      if (cmp === 0) cmp = a.name.localeCompare(b.name, "pt");
      return cmp * dir;
    });
    return arr;
  }, [matches, matchSort]);

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    return index.get(selectedKey) || null;
  }, [selectedKey, index]);

  const sortedResults = useMemo(() => {
    if (!selected) return [] as NationalResult[];
    const { sortKey, sortDir } = detailSort;
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...selected.results];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date":
          cmp = (a.date || "").localeCompare(b.date || "");
          break;
        case "escalao":
          cmp = (a.escalao || "").localeCompare(b.escalao || "", "pt");
          break;
        case "pos":
          cmp = a.pos - b.pos;
          break;
        case "tipo":
          cmp = Number(a.isClubes) - Number(b.isClubes);
          break;
        case "gross":
          cmp = numVal(a.gross) - numVal(b.gross);
          break;
        case "toPar":
          cmp = numVal(a.toPar) - numVal(b.toPar);
          break;
        case "em":
          cmp = a.totalPlayers - b.totalPlayers;
          break;
        case "tournament":
          cmp = (a.tournamentName || "").localeCompare(b.tournamentName || "", "pt");
          break;
      }
      if (cmp === 0) cmp = (b.date || "").localeCompare(a.date || "") || a.pos - b.pos;
      return cmp * dir;
    });
    return arr;
  }, [selected, detailSort]);

  const handleSelect = (a: AthleteFile) => {
    const k = a.fed ? `fed:${a.fed}` : `name:${normName(a.name)}`;
    setSelectedKey(k);
  };

  return (
    <section className="u-m-16px-12px-24px">
      <div
        className="u-p-12px-16px u-bg-bg-muted u-bd-1px-solid-border u-br-radius-lg u-mb-12px"
      >
        <h3 className="fs-15 fw-800 u-m-0-0-8px">
          🔍 Procurar atleta
        </h3>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Escreve o nome ou nº de federado..."
          className="u-w-100pc u-maxw-480px u-p-8px-12px u-bd-1px-solid-border u-br-radius u-fs-fs-14 u-bg-bg-card u-c-text-1"
          autoFocus
        />
        <div className="muted fs-11 u-mt-6pxx">
          {q.length === 0
            ? `${all.length} atletas com presença em Nacionais (Sub-10 a Sub-18, 2005-2026)`
            : matches.length === 0 && q.length >= 2
              ? "Sem resultados"
              : `${matches.length} match${matches.length === 1 ? "" : "es"}`}
        </div>
      </div>

      {/* Lista de matches (sugestões) */}
      {matches.length > 0 && !selected && (
        <div
          className="u-bd-1px-solid-border u-br-radius-lg u-ov-hidden u-mb-12px"
        >
          <table className="dtable">
            <thead>
              <tr>
                <SortableHdr k="name" sortKey={matchSort.sortKey} sortDir={matchSort.sortDir} onSort={matchSort.toggleSort}>Atleta</SortableHdr>
                <SortableHdr k="fed" sortKey={matchSort.sortKey} sortDir={matchSort.sortDir} onSort={matchSort.toggleSort}>Fed</SortableHdr>
                <SortableHdr k="club" sortKey={matchSort.sortKey} sortDir={matchSort.sortDir} onSort={matchSort.toggleSort}>Clube</SortableHdr>
                <SortableHdr k="particip" sortKey={matchSort.sortKey} sortDir={matchSort.sortDir} onSort={matchSort.toggleSort} className="r">Particip.</SortableHdr>
                <SortableHdr k="golds" sortKey={matchSort.sortKey} sortDir={matchSort.sortDir} onSort={matchSort.toggleSort} className="r">🥇</SortableHdr>
                <SortableHdr k="top5" sortKey={matchSort.sortKey} sortDir={matchSort.sortDir} onSort={matchSort.toggleSort} className="r">Top-5</SortableHdr>
                <SortableHdr k="best" sortKey={matchSort.sortKey} sortDir={matchSort.sortDir} onSort={matchSort.toggleSort} className="r">Melhor</SortableHdr>
              </tr>
            </thead>
            <tbody>
              {sortedMatches.map((a) => {
                const k = a.fed ? `fed:${a.fed}` : `name:${normName(a.name)}`;
                return (
                  <tr
                    key={k}
                    onClick={() => handleSelect(a)}
                    className="u-cur-pointer"
                    title="Clica para ver detalhe"
                  >
                    <td className="u-fw-700">{a.name}</td>
                    <td className="u-ff-font-mono u-fs-fs-12 u-c-text-3">
                      {a.fed || "—"}
                    </td>
                    <td className="u-fs-fs-12 u-c-text-2">
                      {a.club || "—"}
                    </td>
                    <td className="r">{a.results.length}</td>
                    <td className="r" style={{ color: a.golds > 0 ? "var(--accent)" : "var(--text-3)", fontWeight: a.golds > 0 ? 700 : 400 }}>
                      {a.golds || "—"}
                    </td>
                    <td className="r">{a.top5 || "—"}</td>
                    <td className="r">{a.best < 999 ? <PosBadge pos={a.best} /> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalhe do atleta seleccionado */}
      {selected && (
        <div
          className="u-bd-1px-solid-border u-br-radius-lg u-ov-hidden"
        >
          <header
            className="u-p-12px-16px u-bg-bg-muted u-bb-1px-solid-border u-d-flex u-ai-center u-gap-12px u-fwr-wrap"
          >
            <div className="u-fl-1 u-minw-200px">
              <h3 className="fs-15 fw-800 u-m-0">
                {selected.fed ? (
                  <a
                    href={`/jogadores/${selected.fed}?view=federado`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="u-c-inherit u-td-none u-bb-1px-dotted-currentcolor"
                    title="Ver perfil federado (nova janela)"
                  >
                    {selected.name}
                  </a>
                ) : (
                  selected.name
                )}
              </h3>
              <div className="muted fs-11 u-mt-2px">
                {selected.fed ? `Fed ${selected.fed}` : "Sem fed code"}
                {selected.dob ? ` · Nasc. ${selected.dob.slice(0, 4)}` : ""}
                {selected.sex ? ` · ${selected.sex}` : ""}
                {selected.club ? ` · ${selected.club}` : ""}
              </div>
            </div>
            <button
              onClick={() => setSelectedKey(null)}
              className="u-p-4px-10px u-fs-fs-12 u-bg-bg-card u-bd-1px-solid-border u-br-radius-sm u-cur-pointer u-c-text-1"
              title="Voltar à pesquisa"
            >
              ✕ Fechar
            </button>
          </header>

          {/* KPIs */}
          <div
            className="u-d-grid u-grid-template-columns-1652c u-gap-1px u-bg-border-light u-bb-1px-solid-border"
          >
            <Kpi label="Particip." value={String(selected.results.length)} />
            <Kpi label="🥇 Ouro" value={selected.golds || "—"} accent={selected.golds > 0} />
            <Kpi label="🥈 Prata" value={selected.silvers || "—"} />
            <Kpi label="🥉 Bronze" value={selected.bronzes || "—"} />
            <Kpi label="Top-5" value={selected.top5 || "—"} />
            <Kpi label="Top-10" value={selected.top10 || "—"} />
            <Kpi
              label="Melhor"
              value={selected.best < 999 ? `${selected.best}º` : "—"}
              accent={selected.best === 1}
            />
          </div>

          {/* Tabela cronológica */}
          <div className="u-ox-auto u-pb-14px">
            <table className="dtable">
              <thead>
                <tr>
                  <SortableHdr k="date" sortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.toggleSort}>Data</SortableHdr>
                  <SortableHdr k="escalao" sortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.toggleSort}>Esc</SortableHdr>
                  <SortableHdr k="pos" sortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.toggleSort}>Pos</SortableHdr>
                  <SortableHdr k="tipo" sortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.toggleSort}>Tipo</SortableHdr>
                  <SortableHdr k="gross" sortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.toggleSort} className="r">Total</SortableHdr>
                  <SortableHdr k="toPar" sortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.toggleSort} className="r">±Par</SortableHdr>
                  <SortableHdr k="em" sortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.toggleSort} className="r">Em</SortableHdr>
                  <SortableHdr k="tournament" sortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.toggleSort}>Torneio</SortableHdr>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((r, i) => (
                  <tr key={i}>
                    <td className="u-ws-nowrap">{r.date}</td>
                    <td>{r.escalao ? <EscPill esc={r.escalao} /> : "—"}</td>
                    <td><PosBadge pos={r.pos} /></td>
                    <td className="u-fs-fs-11 u-c-text-3">
                      <span className="u-d-inline-flex u-ai-center u-gap-4px">
                        <span>{r.isClubes ? "Clubes" : "Jovens"}</span>
                        {r.rounds > 1 && <RoundPill nR={r.rounds} />}
                      </span>
                    </td>
                    <td className="r u-fw-600">{r.gross ?? "—"}</td>
                    <td className="r">{r.toPar != null ? fmtToPar(r.toPar) : "—"}</td>
                    <td className="r u-fs-fs-11 u-c-text-3"
                      title={`Total de ${r.totalPlayers} inscritos`}>
                      {r.totalPlayers > 0 ? `${r.pos}/${r.totalPlayers}` : "—"}
                    </td>
                    <td>
                      <a
                        href={fpgScoringUrl(r.ccode, r.tcode)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="u-c-accent u-td-none"
                        title="Ver torneio na FPG (nova janela)"
                      >
                        {r.tournamentName} ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Kpi({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div
      className="u-bg-bg-card u-p-10px-12px u-ta-center"
    >
      <div
        className="fs-11 muted u-tt-uppercase u-ls-0_3px"

      >
        {label}
      </div>
      <div
        className="fs-18 fw-800"
        style={{ color: accent ? "var(--accent)" : "var(--text-1)" }}
      >
        {value}
      </div>
    </div>
  );
}
