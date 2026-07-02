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

function PosBadge({ pos }: { pos: number }) {
  const styles: Record<number, { bg: string; fg: string; label: string }> = {
    1: { bg: "var(--medal-gold-bg)", fg: "var(--medal-gold-fg)", label: "🥇 1º" },
    2: { bg: "var(--medal-silver-bg)", fg: "var(--medal-silver-fg)", label: "🥈 2º" },
    3: { bg: "var(--medal-bronze-bg)", fg: "var(--medal-bronze-fg)", label: "🥉 3º" },
  };
  const s =
    styles[pos] || {
      bg: "var(--bg-muted)",
      fg: "var(--text-2)",
      label: pos + "º",
    };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 6px",
        borderRadius: 4,
        background: s.bg,
        color: s.fg,
        fontWeight: 700,
        fontSize: "var(--fs-11)",
        whiteSpace: "nowrap",
        letterSpacing: 0.2,
      }}
    >
      {s.label}
    </span>
  );
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
    <section style={{ margin: "16px 12px 28px" }}>
      <div
        style={{
          padding: "12px 16px",
          background: "var(--bg-muted)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: 12,
        }}
      >
        <h3 className="fs-15 fw-800" style={{ margin: "0 0 8px" }}>
          🔍 Procurar atleta
        </h3>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Escreve o nome ou nº de federado..."
          style={{
            width: "100%",
            maxWidth: 480,
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: "var(--fs-14)",
            background: "var(--bg-card)",
            color: "var(--text-1)",
          }}
          autoFocus
        />
        <div className="muted fs-11" style={{ marginTop: 6 }}>
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
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 12,
          }}
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
                    style={{ cursor: "pointer" }}
                    title="Clica para ver detalhe"
                  >
                    <td style={{ fontWeight: 700 }}>{a.name}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-12)", color: "var(--text-3)" }}>
                      {a.fed || "—"}
                    </td>
                    <td style={{ fontSize: "var(--fs-12)", color: "var(--text-2)" }}>
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
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <header
            style={{
              padding: "12px 16px",
              background: "var(--bg-muted)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 200 }}>
              <h3 className="fs-15 fw-800" style={{ margin: 0 }}>
                {selected.fed ? (
                  <a
                    href={`/jogadores/${selected.fed}?view=federado`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "inherit",
                      textDecoration: "none",
                      borderBottom: "1px dotted currentColor",
                    }}
                    title="Ver perfil federado (nova janela)"
                  >
                    {selected.name}
                  </a>
                ) : (
                  selected.name
                )}
              </h3>
              <div className="muted fs-11" style={{ marginTop: 2 }}>
                {selected.fed ? `Fed ${selected.fed}` : "Sem fed code"}
                {selected.dob ? ` · Nasc. ${selected.dob.slice(0, 4)}` : ""}
                {selected.sex ? ` · ${selected.sex}` : ""}
                {selected.club ? ` · ${selected.club}` : ""}
              </div>
            </div>
            <button
              onClick={() => setSelectedKey(null)}
              style={{
                padding: "5px 10px",
                fontSize: "var(--fs-12)",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                cursor: "pointer",
                color: "var(--text-1)",
              }}
              title="Voltar à pesquisa"
            >
              ✕ Fechar
            </button>
          </header>

          {/* KPIs */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: 1,
              background: "var(--border-light)",
              borderBottom: "1px solid var(--border)",
            }}
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
          <div style={{ overflowX: "auto", paddingBottom: 14 }}>
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
                    <td style={{ whiteSpace: "nowrap" }}>{r.date}</td>
                    <td>{r.escalao ? <EscPill esc={r.escalao} /> : "—"}</td>
                    <td><PosBadge pos={r.pos} /></td>
                    <td style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span>{r.isClubes ? "Clubes" : "Jovens"}</span>
                        {r.rounds > 1 && <RoundPill nR={r.rounds} />}
                      </span>
                    </td>
                    <td className="r" style={{ fontWeight: 600 }}>{r.gross ?? "—"}</td>
                    <td className="r">{r.toPar != null ? fmtToPar(r.toPar) : "—"}</td>
                    <td className="r" style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}
                      title={`Total de ${r.totalPlayers} inscritos`}>
                      {r.totalPlayers > 0 ? `${r.pos}/${r.totalPlayers}` : "—"}
                    </td>
                    <td>
                      <a
                        href={fpgScoringUrl(r.ccode, r.tcode)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--accent)", textDecoration: "none" }}
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
      style={{
        background: "var(--bg-card)",
        padding: "10px 12px",
        textAlign: "center",
      }}
    >
      <div
        className="fs-11 muted"
        style={{ textTransform: "uppercase", letterSpacing: 0.3 }}
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
