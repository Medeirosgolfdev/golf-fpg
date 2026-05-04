/**
 * TopClubesPanel.tsx
 *
 * Painel "Top Clubes em Nacionais de Jovens" — agrupa todos os títulos
 * Nacional (CNJ + Drive Tour Final) pelos clubes dos campeões e mostra os
 * 5 clubes com mais títulos. Cada linha é expansível para listar os atletas
 * que conquistaram títulos pelo clube + o detalhe de cada título.
 *
 * Inputs:
 *   - tournaments: array de torneios "Nacionais" (já filtrados — sem Clubes)
 *     com `players` contendo `club`, `fedCode`, `name`, `pos`.
 *   - champions: nacionalChampions de buildAnaliseData (aplica a regra do
 *     campeão Português quando o vencedor é estrangeiro).
 *
 * Para cada champion, encontra o player na lista do torneio e usa o `club`
 * dele para agregar. Normaliza o nome do clube para tolerar variações
 * comuns (Vilamoura, C. G. ≡ Vilamoura, C. G ≡ Vilamoura).
 */

import { useMemo, useState } from "react";
import { fmtToPar, fpgScoringUrl } from "../utils/format";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";
import type { Tournament } from "../data/fpgTypes";
import type { Champion } from "../data/jovensAnaliseData";

const MAX_CLUBS = 10;

/** Normaliza nome de clube para agrupamento (lower-case, remove pontuação,
 *  abreviaturas comuns: "Golf Club"→"gc", "C. G."→"cg", drop sufixos). */
function normalizeClub(c: string): string {
  if (!c) return "";
  let s = c.toLowerCase().trim();
  s = s.replace(/[.,;:]+$/g, "").trim();
  s = s.replace(/\s+/g, " ");
  // Abreviaturas: clube de golfe / golf club → gc
  s = s.replace(/\bclube\s+de\s+golfe?\b/g, "gc");
  s = s.replace(/\bgolf(e)?\s+club\b/g, "gc");
  s = s.replace(/\bc\.\s*g\b\.?/g, "gc");
  // Remover sufixo gc/cg
  s = s.replace(/[\s,]+(g\.?c\.?|cg)[\s,]*$/g, "").trim();
  s = s.replace(/^(g\.?c\.?|cg)[\s,]+/g, "").trim();
  s = s.replace(/[\s,]+$/g, "").trim();
  return s;
}

interface ClubTitle {
  year: string;
  date: string;
  escalao: string;
  sex: "M" | "F" | "?";
  ccode: string;
  tcode: string;
  tournamentName: string;
  athleteName: string;
  athleteFed: string | null;
  gross: number | null;
  toPar: number | null;
}

interface ClubAthleteSummary {
  fed: string | null;
  name: string;
  count: number;
}

interface ClubSummary {
  key: string;             // chave normalizada
  displayName: string;     // forma escolhida para exibir (a mais longa vista)
  titles: ClubTitle[];
  athletes: ClubAthleteSummary[];
  years: Set<number>;
  escaloes: Set<string>;
}

function buildClubs(tournaments: Tournament[], champions: Champion[]): ClubSummary[] {
  const map = new Map<string, ClubSummary>();
  // index torneios por chave (ccode-tcode)
  const tIdx = new Map<string, Tournament>();
  for (const t of tournaments) {
    const key = `${t.ccode || "000"}-${t.tcode}`;
    tIdx.set(key, t);
  }

  for (const ch of champions) {
    const t = tIdx.get(`${ch.ccode}-${ch.tcode}`);
    if (!t) continue;
    // Encontrar o player no torneio: preferir fed, fallback para nome
    let player: any = null;
    if (ch.championFed) {
      player = (t.players as any[]).find((p) => String(p.fedCode || p.fed || "") === String(ch.championFed));
    }
    if (!player) {
      const target = (ch.championName || "").trim().toLowerCase();
      if (target) {
        player = (t.players as any[]).find((p) => (p.name || "").trim().toLowerCase() === target);
      }
    }
    if (!player) continue;
    const club: string = (player.club || "").trim();
    if (!club) continue;
    const key = normalizeClub(club);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        key,
        displayName: club,
        titles: [],
        athletes: [],
        years: new Set<number>(),
        escaloes: new Set<string>(),
      });
    }
    const s = map.get(key)!;
    // Display name: ficar com a forma mais longa vista
    if (club.length > s.displayName.length) s.displayName = club;
    s.titles.push({
      year: String(ch.year),
      date: t.date || "",
      escalao: ch.escalao,
      sex: ch.sex,
      ccode: ch.ccode,
      tcode: ch.tcode,
      tournamentName: t.name || ch.tournamentName,
      athleteName: ch.championName,
      athleteFed: ch.championFed,
      gross: ch.gross,
      toPar: ch.toPar,
    });
    s.years.add(ch.year);
    s.escaloes.add(ch.escalao);
    // Acumular athlete count
    const aKey = ch.championFed ? `fed:${ch.championFed}` : `name:${(ch.championName || "").toLowerCase()}`;
    let a = s.athletes.find((x) => (x.fed ? `fed:${x.fed}` : `name:${x.name.toLowerCase()}`) === aKey);
    if (!a) {
      a = { fed: ch.championFed, name: ch.championName, count: 0 };
      s.athletes.push(a);
    }
    a.count++;
  }

  // Ordenar atletas por count desc, depois nome
  for (const s of map.values()) {
    s.athletes.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt"));
    s.titles.sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.escalao.localeCompare(b.escalao));
  }
  return [...map.values()];
}

type SortKey = "club" | "titles" | "athletes" | "years" | "escaloes";

export default function TopClubesPanel({
  tournaments,
  champions,
}: {
  tournaments: Tournament[];
  champions: Champion[];
}) {
  const all = useMemo(() => buildClubs(tournaments, champions), [tournaments, champions]);
  const top = useMemo(() => {
    return [...all]
      .sort(
        (a, b) =>
          b.titles.length - a.titles.length ||
          b.years.size - a.years.size ||
          a.displayName.localeCompare(b.displayName, "pt"),
      )
      .slice(0, MAX_CLUBS);
  }, [all]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("titles", "desc", {
    club: "asc",
    titles: "desc",
    athletes: "desc",
    years: "desc",
    escaloes: "desc",
  });

  const sorted = useMemo(() => {
    const arr = [...top];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "club":
          cmp = a.displayName.localeCompare(b.displayName, "pt");
          break;
        case "titles":
          cmp = a.titles.length - b.titles.length;
          break;
        case "athletes":
          cmp = a.athletes.length - b.athletes.length;
          break;
        case "years":
          cmp = a.years.size - b.years.size;
          break;
        case "escaloes":
          cmp = a.escaloes.size - b.escaloes.size;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [top, sortKey, sortDir]);

  if (top.length === 0) return null;

  const onSort = (k: string) => toggleSort(k as SortKey);
  const toggle = (k: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const totalTitles = top.reduce((s, c) => s + c.titles.length, 0);
  const totalAthletes = top.reduce((s, c) => s + c.athletes.length, 0);

  return (
    <section
      style={{
        margin: "16px 12px 28px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "10px 14px",
          background: "var(--bg-card-strong, var(--bg-muted))",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h3 className="fs-15 fw-800" style={{ margin: 0 }}>
          🏛️ Top {MAX_CLUBS} Clubes · Títulos Nacional de Jovens
        </h3>
        <span className="muted fs-12">
          {top.length} clubes · {totalTitles} títulos · {totalAthletes} atletas distintos
        </span>
      </header>
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
              <th
                style={{
                  padding: "8px 12px",
                  borderBottom: "2px solid var(--border)",
                  width: 32,
                }}
              >
                #
              </th>
              <SortableHdr
                k="club"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                style={{ padding: "8px 12px", borderBottom: "2px solid var(--border)" }}
              >
                Clube
              </SortableHdr>
              <SortableHdr
                k="titles"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                style={{
                  padding: "8px 12px",
                  borderBottom: "2px solid var(--border)",
                  textAlign: "right",
                }}
              >
                Títulos
              </SortableHdr>
              <SortableHdr
                k="athletes"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                style={{
                  padding: "8px 12px",
                  borderBottom: "2px solid var(--border)",
                  textAlign: "right",
                }}
              >
                Atletas
              </SortableHdr>
              <SortableHdr
                k="escaloes"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                style={{
                  padding: "8px 12px",
                  borderBottom: "2px solid var(--border)",
                  textAlign: "right",
                }}
              >
                Escalões
              </SortableHdr>
              <SortableHdr
                k="years"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                style={{ padding: "8px 12px", borderBottom: "2px solid var(--border)" }}
              >
                Anos
              </SortableHdr>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, idx) => {
              const isOpen = expanded.has(c.key);
              const ys = [...c.years].sort((a, b) => a - b);
              return (
                <>
                  <tr
                    key={c.key}
                    style={{
                      borderBottom: "1px solid var(--border-light)",
                      cursor: "pointer",
                      background: isOpen
                        ? "var(--bg-info-subtle, rgba(59,130,246,0.04))"
                        : undefined,
                    }}
                    onClick={() => toggle(c.key)}
                    title={isOpen ? "Fechar detalhes" : "Ver atletas e títulos"}
                  >
                    <td
                      style={{
                        padding: "8px 12px",
                        verticalAlign: "middle",
                        fontFamily: "monospace",
                        fontSize: 11,
                        color: "var(--text-3)",
                      }}
                    >
                      {idx + 1}
                    </td>
                    <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: 11,
                            opacity: 0.6,
                            width: 10,
                          }}
                        >
                          {isOpen ? "▼" : "▶"}
                        </span>
                        <span className="fw-700">{c.displayName}</span>
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        verticalAlign: "middle",
                        fontWeight: 800,
                        color: "var(--accent)",
                      }}
                    >
                      {c.titles.length}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        verticalAlign: "middle",
                      }}
                    >
                      {c.athletes.length}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        verticalAlign: "middle",
                      }}
                      title={[...c.escaloes].join(", ")}
                    >
                      {c.escaloes.size}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        verticalAlign: "middle",
                        fontSize: 11,
                        color: "var(--text-3)",
                      }}
                    >
                      {ys.length === 1 ? ys[0] : `${ys[0]}–${ys[ys.length - 1]}`} ({ys.length})
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={c.key + "-details"}>
                      <td
                        colSpan={6}
                        style={{
                          padding: "10px 12px 14px 36px",
                          background: "var(--bg-info-subtle, rgba(59,130,246,0.02))",
                        }}
                      >
                        {/* Atletas (resumo) */}
                        <div style={{ marginBottom: 10 }}>
                          <div
                            className="fs-11 fw-700 muted"
                            style={{
                              textTransform: "uppercase",
                              letterSpacing: 0.3,
                              marginBottom: 4,
                            }}
                          >
                            Atletas com títulos por este clube
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {c.athletes.map((a) => (
                              <span
                                key={(a.fed || "name:" + a.name) + "-tag"}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "3px 8px",
                                  borderRadius: 12,
                                  background: "var(--bg-card)",
                                  border: "1px solid var(--border-light)",
                                  fontSize: 12,
                                }}
                              >
                                {a.fed ? (
                                  <a
                                    href={`/jogadores/${a.fed}?view=federado`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(ev) => ev.stopPropagation()}
                                    className="fw-700"
                                    style={{
                                      color: "inherit",
                                      textDecoration: "none",
                                      borderBottom: "1px dotted currentColor",
                                    }}
                                    title={`${a.name} — ver perfil federado (nova janela)`}
                                  >
                                    {a.name}
                                  </a>
                                ) : (
                                  <span className="fw-700">{a.name}</span>
                                )}
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "var(--accent)",
                                  }}
                                >
                                  ×{a.count}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                        {/* Títulos detalhados */}
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontSize: 12,
                            marginTop: 4,
                          }}
                        >
                          <thead>
                            <tr
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: 0.3,
                                color: "var(--text-3)",
                              }}
                            >
                              <th style={{ padding: "4px 8px", textAlign: "left" }}>Data</th>
                              <th style={{ padding: "4px 8px", textAlign: "left" }}>Esc</th>
                              <th style={{ padding: "4px 8px", textAlign: "left" }}>Sx</th>
                              <th style={{ padding: "4px 8px", textAlign: "left" }}>Atleta</th>
                              <th style={{ padding: "4px 8px", textAlign: "right" }}>Total</th>
                              <th style={{ padding: "4px 8px", textAlign: "right" }}>±Par</th>
                              <th style={{ padding: "4px 8px", textAlign: "left" }}>Torneio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.titles.map((t, i) => (
                              <tr
                                key={i}
                                style={{
                                  borderTop:
                                    i > 0 ? "1px dotted var(--border-light)" : undefined,
                                }}
                              >
                                <td
                                  style={{
                                    padding: "4px 8px",
                                    whiteSpace: "nowrap",
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {t.date}
                                </td>
                                <td style={{ padding: "4px 8px" }}>{t.escalao}</td>
                                <td style={{ padding: "4px 8px" }}>{t.sex}</td>
                                <td style={{ padding: "4px 8px" }}>
                                  {t.athleteFed ? (
                                    <a
                                      href={`/jogadores/${t.athleteFed}?view=federado`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        color: "inherit",
                                        textDecoration: "none",
                                        borderBottom: "1px dotted currentColor",
                                      }}
                                      title="Ver perfil federado (nova janela)"
                                    >
                                      {t.athleteName}
                                    </a>
                                  ) : (
                                    t.athleteName
                                  )}
                                </td>
                                <td
                                  style={{
                                    padding: "4px 8px",
                                    textAlign: "right",
                                    fontWeight: 600,
                                  }}
                                >
                                  {t.gross ?? "—"}
                                </td>
                                <td
                                  style={{
                                    padding: "4px 8px",
                                    textAlign: "right",
                                  }}
                                >
                                  {t.toPar != null ? fmtToPar(t.toPar) : "—"}
                                </td>
                                <td style={{ padding: "4px 8px" }}>
                                  <a
                                    href={fpgScoringUrl(t.ccode, t.tcode)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      color: "var(--accent)",
                                      textDecoration: "none",
                                    }}
                                    title="Ver torneio na FPG (nova janela)"
                                  >
                                    {t.tournamentName} ↗
                                  </a>
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
        </table>
      </div>
    </section>
  );
}
