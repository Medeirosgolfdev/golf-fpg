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
import type { Tournament } from "../data/fpgTypes";

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

function normName(s: string): string {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
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

function PosBadge({ pos }: { pos: number }) {
  const styles: Record<number, { bg: string; fg: string; label: string }> = {
    1: { bg: "var(--medal-gold-bg, #fef3c7)", fg: "var(--medal-gold-fg, #92400e)", label: "🥇 1º" },
    2: { bg: "var(--medal-silver-bg, #f1f5f9)", fg: "var(--medal-silver-fg, #475569)", label: "🥈 2º" },
    3: { bg: "var(--medal-bronze-bg, #fdf2e9)", fg: "var(--medal-bronze-fg, #9a3412)", label: "🥉 3º" },
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
        fontSize: 11,
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

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    return index.get(selectedKey) || null;
  }, [selectedKey, index]);

  const handleSelect = (a: AthleteFile) => {
    const k = a.fed ? `fed:${a.fed}` : `name:${normName(a.name)}`;
    setSelectedKey(k);
  };

  return (
    <section style={{ margin: "16px 12px 28px" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--bg-card-strong, var(--bg-muted))",
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
            fontSize: 14,
            background: "var(--bg-input, var(--bg-card))",
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
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  background: "var(--bg-header)",
                  textAlign: "left",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                  color: "var(--text-3)",
                }}
              >
                <th style={{ padding: "8px 12px" }}>Atleta</th>
                <th style={{ padding: "8px 12px" }}>Fed</th>
                <th style={{ padding: "8px 12px" }}>Clube</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Particip.</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>🥇</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Top-5</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Melhor</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((a) => {
                const k = a.fed ? `fed:${a.fed}` : `name:${normName(a.name)}`;
                return (
                  <tr
                    key={k}
                    onClick={() => handleSelect(a)}
                    style={{
                      borderTop: "1px solid var(--border-light)",
                      cursor: "pointer",
                    }}
                    title="Clica para ver detalhe"
                  >
                    <td style={{ padding: "8px 12px", fontWeight: 700 }}>{a.name}</td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: "var(--text-3)",
                      }}
                    >
                      {a.fed || "—"}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-2)" }}>
                      {a.club || "—"}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      {a.results.length}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        color: a.golds > 0 ? "var(--accent)" : "var(--text-3)",
                        fontWeight: a.golds > 0 ? 700 : 400,
                      }}
                    >
                      {a.golds || "—"}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{a.top5 || "—"}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      {a.best < 999 ? <PosBadge pos={a.best} /> : "—"}
                    </td>
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
              padding: "12px 14px",
              background: "var(--bg-card-strong, var(--bg-muted))",
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
                fontSize: 12,
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
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    background: "var(--bg-header)",
                    textAlign: "left",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                    color: "var(--text-3)",
                  }}
                >
                  <th style={{ padding: "8px 12px" }}>Data</th>
                  <th style={{ padding: "8px 12px" }}>Esc</th>
                  <th style={{ padding: "8px 12px" }}>Pos</th>
                  <th style={{ padding: "8px 12px" }}>Tipo</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Total</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>±Par</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Em</th>
                  <th style={{ padding: "8px 12px" }}>Torneio</th>
                </tr>
              </thead>
              <tbody>
                {selected.results.map((r, i) => (
                  <tr
                    key={i}
                    style={{ borderTop: "1px solid var(--border-light)" }}
                  >
                    <td
                      style={{
                        padding: "6px 12px",
                        whiteSpace: "nowrap",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.date}
                    </td>
                    <td style={{ padding: "6px 12px" }}>{r.escalao || "—"}</td>
                    <td style={{ padding: "6px 12px" }}>
                      <PosBadge pos={r.pos} />
                    </td>
                    <td style={{ padding: "6px 12px", fontSize: 11, color: "var(--text-3)" }}>
                      {r.isClubes ? "Clubes" : "Jovens"}
                      {r.rounds > 1 ? ` · ${r.rounds}R` : ""}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        textAlign: "right",
                        fontWeight: 600,
                      }}
                    >
                      {r.gross ?? "—"}
                    </td>
                    <td style={{ padding: "6px 12px", textAlign: "right" }}>
                      {r.toPar != null ? fmtToPar(r.toPar) : "—"}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        textAlign: "right",
                        fontSize: 11,
                        color: "var(--text-3)",
                      }}
                      title={`Total de ${r.totalPlayers} inscritos`}
                    >
                      {r.totalPlayers > 0 ? `${r.pos}/${r.totalPlayers}` : "—"}
                    </td>
                    <td style={{ padding: "6px 12px" }}>
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
